#!/usr/bin/env node

/**
 * HTTP Bridge Client for MCP
 *
 * 这个桥接程序：
 * - 通过 Stdio 与 Gemini CLI 通信（MCP Stdio 传输）
 * - 通过 HTTP/SSE 与远程 MCP 服务器通信
 *
 * 作用：让只支持 Stdio 的 MCP 客户端可以连接到 HTTP MCP 服务器
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
// fetch is built-in in Node.js 18+
// import EventSource from 'eventsource';  // We'll use a simpler approach

class HttpBridgeClient {
  constructor() {
    // HTTP 服务器配置
    this.serverUrl = process.env.HTTP_SERVER_URL || 'http://localhost:3000';
    this.apiKey = process.env.API_KEY || '';
    this.sseUrl = `${this.serverUrl}/sse`;

    // MCP Stdio 服务器（与 Gemini CLI 通信）
    this.server = new Server(
      {
        name: 'starrocks-http-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 缓存工具列表
    this.toolsCache = null;
    this.eventSource = null;
    this.sessionId = null;

    console.error('🌉 HTTP Bridge Client initialized');
    console.error(`   Server: ${this.serverUrl}`);
    console.error(`   Auth: ${this.apiKey ? 'Enabled' : 'Disabled'}`);

    this.setupHandlers();
  }

  /**
   * 连接到 HTTP 服务器并获取工具列表
   */
  async connectToServer() {
    try {
      // 测试服务器健康状态
      const healthResponse = await fetch(`${this.serverUrl}/health`);
      if (!healthResponse.ok) {
        throw new Error(`Server not healthy: ${healthResponse.status}`);
      }

      // 获取工具列表
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(this.serverUrl, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch tools: ${response.status}`);
      }

      const data = await response.json();
      this.toolsCache = data.experts || [];

      console.error(`✅ Connected to HTTP server`);
      console.error(`   Tools: ${this.toolsCache.length}`);

      return true;
    } catch (error) {
      console.error(`❌ Failed to connect to server: ${error.message}`);
      return false;
    }
  }

  /**
   * 通过 HTTP API 调用工具
   */
  async callToolViaHttp(toolName, args) {
    try {
      // 建立 SSE 连接
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      // 连接到 SSE 端点
      const eventSource = new EventSource(this.sseUrl, {
        headers,
      });

      return new Promise((resolve, reject) => {
        let messageUrl = null;

        eventSource.onopen = () => {
          console.error(`📡 SSE connection established for ${toolName}`);
        };

        eventSource.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data);

            // 获取消息端点
            if (message.type === 'endpoint') {
              messageUrl = `${this.serverUrl}${message.url}`;
              console.error(`   Message endpoint: ${messageUrl}`);

              // 发送工具调用请求
              const toolRequest = {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: toolName,
                  arguments: args,
                },
              };

              const callResponse = await fetch(messageUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
                },
                body: JSON.stringify(toolRequest),
              });

              if (!callResponse.ok) {
                throw new Error(`Tool call failed: ${callResponse.status}`);
              }
            }

            // 接收工具执行结果
            if (message.result) {
              eventSource.close();
              resolve(message.result);
            }

            if (message.error) {
              eventSource.close();
              reject(new Error(message.error.message || 'Tool execution failed'));
            }
          } catch (error) {
            eventSource.close();
            reject(error);
          }
        };

        eventSource.onerror = (error) => {
          console.error(`❌ SSE error:`, error);
          eventSource.close();
          reject(new Error('SSE connection failed'));
        };

        // 超时处理
        setTimeout(() => {
          if (eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
            reject(new Error('Tool call timeout'));
          }
        }, 60000); // 60 秒超时
      });
    } catch (error) {
      console.error(`❌ Failed to call tool via HTTP: ${error.message}`);
      throw error;
    }
  }

  setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // 确保已连接到服务器
      if (!this.toolsCache) {
        await this.connectToServer();
      }

      // 返回工具列表
      const tools = this.toolsCache.map((toolName) => ({
        name: toolName,
        description: `${toolName} (via HTTP)`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }));

      console.error(`📋 Listing ${tools.length} tools`);

      return { tools };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`🔧 Calling tool: ${name}`);

      try {
        // 通过 HTTP 调用工具
        const result = await this.callToolViaHttp(name, args || {});

        console.error(`✅ Tool executed: ${name}`);

        // 返回结果
        return result;
      } catch (error) {
        console.error(`❌ Tool execution failed: ${error.message}`);
        throw error;
      }
    });
  }

  async run() {
    // 连接到 HTTP 服务器
    const connected = await this.connectToServer();
    if (!connected) {
      console.error('⚠️  Running in offline mode');
    }

    // 启动 Stdio 传输（与 Gemini CLI 通信）
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('🚀 Bridge client is running');
  }
}

const client = new HttpBridgeClient();
client.run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
