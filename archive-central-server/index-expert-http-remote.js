#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks MCP Server - HTTP/SSE Version with Remote Agent Support
 * 支持通过远程 Local Agent 访问用户数据库的中心服务器
 *
 * 架构：
 * 1. 用户在本地运行 Local Agent（连接内网数据库）
 * 2. 中心服务器通过 HTTP 调用 Local Agent 执行 SQL
 * 3. 所有 SQL 和诊断逻辑都在中心服务器（便于升级维护）
 *
 * 特性：
 * - 多租户支持（每个租户独立配置）
 * - 远程 SQL 执行（通过 Local Agent）
 * - API Key 认证
 * - SSE 传输
 */

/* eslint-disable no-undef */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { StarRocksExpertCoordinator } from './experts/expert-coordinator.js';

/**
 * Remote Connection Wrapper
 * 模拟 mysql2 connection 接口，实际通过 HTTP 调用远程 Agent
 */
class RemoteConnectionWrapper {
  constructor(agentUrl, agentToken) {
    this.agentUrl = agentUrl;
    this.agentToken = agentToken;
    this.closed = false;
  }

  async query(sql, parameters) {
    if (this.closed) {
      throw new Error('Connection already closed');
    }

    try {
      const response = await fetch(`${this.agentUrl}/execute-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': this.agentToken,
        },
        body: JSON.stringify({ sql, parameters }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Agent error: ${error.message || response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Query execution failed');
      }

      // 返回 [rows, fields] 格式，兼容 mysql2
      return [result.data, result.metadata?.fields || []];
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error(
          `Cannot connect to agent at ${this.agentUrl}: ${error.message}`,
        );
      }
      throw error;
    }
  }

  async execute(sql, parameters) {
    return this.query(sql, parameters);
  }

  async end() {
    this.closed = true;
    return Promise.resolve();
  }

  async destroy() {
    return this.end();
  }
}

class StarRocksMcpHttpServerRemote {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3000;
    this.apiKey = options.apiKey || process.env.API_KEY;
    this.tenantsConfigPath =
      options.tenantsConfigPath ||
      process.env.TENANTS_CONFIG ||
      './tenants-config.json';
    this.allowedOrigins = options.allowedOrigins ||
      process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

    // 初始化 Express 应用
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // 初始化专家协调器
    this.expertCoordinator = new StarRocksExpertCoordinator();

    // 租户配置
    this.tenants = {};
    this.loadTenantsConfig();

    // 连接池
    this.activeConnections = new Map();

    console.log('🚀 StarRocks MCP HTTP Server (Remote) initialized');
    console.log(`   Port: ${this.port}`);
    console.log(`   Auth: ${this.apiKey ? 'Enabled (API Key)' : 'Disabled'}`);
    console.log(`   Mode: Remote Agent (Multi-tenant)`);
  }

  async loadTenantsConfig() {
    try {
      const configData = await readFile(this.tenantsConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      this.tenants = config.tenants || {};

      const tenantCount = Object.keys(this.tenants).length;
      console.log(`   Tenants: ${tenantCount} configured`);

      // 列出所有租户
      Object.entries(this.tenants).forEach(([tenantId, tenant]) => {
        const status = tenant.enabled ? '✓' : '✗';
        console.log(`     ${status} ${tenantId} - ${tenant.name}`);
      });
    } catch (error) {
      console.error(`⚠️  Failed to load tenants config: ${error.message}`);
      console.error(`   Please create ${this.tenantsConfigPath} file`);
      this.tenants = {};
    }
  }

  setupMiddleware() {
    // JSON body parser
    this.app.use(express.json());

    // CORS
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (
        this.allowedOrigins.includes('*') ||
        this.allowedOrigins.includes(origin)
      ) {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-API-Key, X-Tenant-ID',
        );
      }

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const tenantId = req.headers['x-tenant-id'] || 'anonymous';
        console.log(
          `${new Date().toISOString()} [${tenantId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
        );
      });
      next();
    });

    // API Key + Tenant ID authentication
    this.app.use((req, res, next) => {
      // Skip auth for health check and root
      if (req.path === '/health' || req.path === '/') {
        return next();
      }

      // 验证 API Key
      if (this.apiKey) {
        const apiKey =
          req.headers['x-api-key'] ||
          req.headers.authorization?.replace('Bearer ', '');

        if (!apiKey || apiKey !== this.apiKey) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key',
          });
        }
      }

      // 验证 Tenant ID
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'X-Tenant-ID header is required',
        });
      }

      const tenant = this.tenants[tenantId];
      if (!tenant) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Tenant '${tenantId}' not found`,
        });
      }

      if (!tenant.enabled) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Tenant '${tenantId}' is disabled`,
        });
      }

      // 将租户信息附加到请求
      req.tenant = tenant;
      req.tenantId = tenantId;

      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'starrocks-mcp-server-remote',
        version: '2.0.0',
        uptime: process.uptime(),
        experts: this.expertCoordinator.getAllTools().length,
        tenants: Object.keys(this.tenants).length,
        mode: 'remote-agent',
      });
    });

    // Root endpoint - service info
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StarRocks MCP Server (Remote)',
        version: '2.0.0',
        description:
          'StarRocks Expert System with Remote Agent support (Multi-tenant)',
        mode: 'remote-agent',
        endpoints: {
          health: '/health',
          tenants: '/tenants (GET)',
          sse: '/sse (GET, requires X-Tenant-ID)',
          messages: '/messages (POST)',
        },
        authentication: {
          api_key: this.apiKey ? 'required' : 'disabled',
          tenant_id: 'required',
        },
        experts: this.expertCoordinator.getAllTools().map((t) => t.name),
      });
    });

    // List tenants endpoint (protected)
    this.app.get('/tenants', (req, res) => {
      // 这个端点也需要认证
      if (this.apiKey) {
        const apiKey =
          req.headers['x-api-key'] ||
          req.headers.authorization?.replace('Bearer ', '');
        if (!apiKey || apiKey !== this.apiKey) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      const tenantList = Object.entries(this.tenants).map(
        ([tenantId, tenant]) => ({
          id: tenantId,
          name: tenant.name,
          enabled: tenant.enabled,
          agent_url: tenant.agent_url,
          // 不返回 agent_token
        }),
      );

      res.json({
        tenants: tenantList,
        total: tenantList.length,
      });
    });

    // SSE endpoint (tenant-specific)
    this.app.get('/sse', async (req, res) => {
      const tenantId = req.tenantId;
      const tenant = req.tenant;

      console.log(`📡 New SSE connection established for tenant: ${tenantId}`);

      // Create MCP server instance for this connection
      const server = new Server(
        {
          name: `starrocks-mcp-server-remote-${tenantId}`,
          version: '2.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );

      // Setup handlers for this server instance with tenant context
      this.setupServerHandlers(server, tenant, tenantId);

      // Create SSE transport
      const sessionId = `session_${tenantId}_${Date.now()}`;
      const messagesPath = `/messages/${sessionId}`;
      const transport = new SSEServerTransport(messagesPath, res);

      // Setup POST handler for this session's messages
      this.app.post(messagesPath, express.json(), async (req, res) => {
        console.log(
          `📨 Received message for session ${sessionId}:`,
          JSON.stringify(req.body).substring(0, 100),
        );
        try {
          await transport.handlePostMessage(req, res, req.body);
        } catch (error) {
          console.error('Error handling POST message:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: error.message });
          }
        }
      });

      // Connect server to transport
      await server.connect(transport);

      // Store connection
      this.activeConnections.set(sessionId, { server, transport, tenantId });

      // Cleanup on close
      res.on('close', () => {
        console.log(
          `📡 SSE connection closed for session ${sessionId} (tenant: ${tenantId})`,
        );
        this.activeConnections.delete(sessionId);
        // Remove the POST handler
        this.app._router.stack = this.app._router.stack.filter(
          (layer) => !(layer.route && layer.route.path === messagesPath),
        );
      });
    });
  }

  setupServerHandlers(server, tenant, tenantId) {
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const expertTools = this.expertCoordinator.getAllTools();
      return {
        tools: expertTools,
      };
    });

    // Execute tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Delegate to expert coordinator with remote connection
        if (this.expertCoordinator.toolHandlers.has(name)) {
          // 创建远程连接包装器
          const connection = this.createRemoteConnection(tenant);

          try {
            const context = { connection };
            const result = await this.expertCoordinator.callToolHandler(
              name,
              args,
              context,
            );

            // Check if result needs formatting
            if (result && result._needsFormatting) {
              return this.formatAnalysisResult(result);
            }

            return result;
          } finally {
            await connection.end();
          }
        }

        // Unknown tool
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      } catch (error) {
        console.error(
          `Tool execution error for tenant ${tenantId}:`,
          error.message,
        );

        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`,
        );
      }
    });
  }

  createRemoteConnection(tenant) {
    return new RemoteConnectionWrapper(tenant.agent_url, tenant.agent_token);
  }

  /**
   * 格式化分析结果（复用原有逻辑）
   */
  formatAnalysisResult(result) {
    if (result._formatType === 'expert_analysis') {
      const report = this.formatExpertAnalysisReport(result.data);
      return {
        content: [
          {
            type: 'text',
            text: report,
          },
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    } else if (result._formatType === 'single_expert') {
      const report = this.formatSingleExpertReport(
        result.data,
        result._expertType,
      );
      return {
        content: [
          {
            type: 'text',
            text: report,
          },
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  formatExpertAnalysisReport(analysis) {
    const assessment = analysis.comprehensive_assessment;
    const metadata = analysis.analysis_metadata;

    let report = '🎯 StarRocks 多专家协调分析报告 (Remote)\n';
    report += '=====================================\n\n';

    const healthEmoji =
      assessment.health_level === 'EXCELLENT'
        ? '🟢'
        : assessment.health_level === 'GOOD'
          ? '🟡'
          : assessment.health_level === 'FAIR'
            ? '🟠'
            : '🔴';

    report += `${healthEmoji} **综合健康评估**: ${assessment.overall_health_score}/100 (${assessment.health_level})\n`;
    report += `📊 **系统状态**: ${assessment.overall_status}\n`;
    report += `🔍 **分析范围**: ${metadata.experts_count}个专家模块\n`;
    report += `⚠️ **发现问题**: ${metadata.total_issues_found}个\n`;

    if (metadata.cross_impacts_found > 0) {
      report += `🔄 **跨模块影响**: ${metadata.cross_impacts_found}个\n`;
    }

    report += `\n${assessment.summary}\n\n`;

    // 各专家健康状态
    report += '📋 **各专家模块状态**:\n';
    Object.entries(assessment.expert_scores).forEach(([expertName, scores]) => {
      const emoji =
        expertName === 'storage'
          ? '💾'
          : expertName === 'compaction'
            ? '🗜️'
            : '🔧';
      const statusEmoji =
        scores.status === 'HEALTHY'
          ? '✅'
          : scores.status === 'WARNING'
            ? '⚠️'
            : '🚨';

      report += `  ${emoji} ${expertName.toUpperCase()}: ${scores.score}/100 ${statusEmoji}\n`;
    });

    // 优化建议
    if (analysis.prioritized_recommendations.length > 0) {
      report += '\n💡 **优化建议** (按优先级排序):\n';
      analysis.prioritized_recommendations.slice(0, 5).forEach((rec) => {
        const coordNote = rec.coordination_notes ? ' 🔄' : '';
        report += `  ${rec.execution_order}. [${rec.priority}] ${rec.title}${coordNote}\n`;
      });
    }

    report += '\n📋 详细分析数据请查看JSON输出部分';
    return report;
  }

  formatSingleExpertReport(result, expertType) {
    const emoji =
      expertType === 'storage'
        ? '💾'
        : expertType === 'compaction'
          ? '🗜️'
          : expertType === 'import'
            ? '📥'
            : '🔧';
    const healthKey =
      expertType === 'storage'
        ? 'storage_health'
        : expertType === 'compaction'
          ? 'compaction_health'
          : expertType === 'import'
            ? 'import_health'
            : 'system_health';
    const health = result[healthKey];

    let report = `${emoji} StarRocks ${expertType.toUpperCase()} 专家分析报告 (Remote)\n`;
    report += '=====================================\n\n';

    const healthEmoji =
      health.level === 'EXCELLENT'
        ? '🟢'
        : health.level === 'GOOD'
          ? '🟡'
          : health.level === 'FAIR'
            ? '🟠'
            : '🔴';

    report += `${healthEmoji} **${expertType}健康分数**: ${health.score}/100 (${health.level})\n`;
    report += `📊 **状态**: ${health.status}\n\n`;

    const diagnosis = result.diagnosis_results;
    report += `📋 **问题摘要**: ${diagnosis.summary}\n`;
    report += `🔍 **问题统计**: ${diagnosis.total_issues}个\n\n`;

    if (
      result.professional_recommendations &&
      result.professional_recommendations.length > 0
    ) {
      report += '💡 **专业建议**:\n';
      result.professional_recommendations.slice(0, 3).forEach((rec, index) => {
        report += `  ${index + 1}. [${rec.priority}] ${rec.title}\n`;
      });
    }

    report += '\n📋 详细诊断数据请查看JSON输出部分';
    return report;
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log('');
      console.log('🎉 StarRocks MCP HTTP Server (Remote) is running!');
      console.log('');
      console.log(`   📡 SSE endpoint:     http://localhost:${this.port}/sse`);
      console.log(
        `   💬 Messages:         http://localhost:${this.port}/messages`,
      );
      console.log(
        `   ❤️  Health check:    http://localhost:${this.port}/health`,
      );
      console.log(
        `   👥 Tenants:          http://localhost:${this.port}/tenants`,
      );
      console.log('');
      console.log(
        `   🔑 Authentication:   API Key ${this.apiKey ? 'Enabled' : 'Disabled'} + Tenant ID Required`,
      );
      console.log(`   🌍 CORS:             ${this.allowedOrigins.join(', ')}`);
      console.log(`   🏢 Mode:             Remote Agent (Multi-tenant)`);
      console.log('');
      console.log('   Press Ctrl+C to stop the server');
      console.log('');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    console.log('\n🛑 Shutting down server...');

    // Close all active connections
    for (const [id, conn] of this.activeConnections.entries()) {
      console.log(`   Closing connection ${id}`);
      conn.server.close();
    }
    this.activeConnections.clear();

    // Close HTTP server
    if (this.server) {
      this.server.close(() => {
        console.log('✅ Server shut down gracefully');
        process.exit(0);
      });
    }
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new StarRocksMcpHttpServerRemote();
  server.start();
}

export default StarRocksMcpHttpServerRemote;
