/* eslint-env node */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Central API Server - 完整版（包含所有 Expert）
 *
 * 架构：服务器端执行 Expert + Thin MCP Client
 *
 * 注意：这不是纯粹的 Solution C（客户端执行 SQL），
 * 而是一个混合方案：
 * - Thin MCP Server 仍然在客户端
 * - 但 SQL 执行和分析都在服务器端完成
 *
 * 优点：
 * - ✅ 所有 33 个工具完整可用
 * - ✅ 零维护升级（只需更新服务器）
 * - ✅ 与 thin-mcp-server.js 兼容
 *
 * API 端点：
 * - GET  /api/tools           - 列出所有工具
 * - GET  /api/queries/:tool   - 获取工具信息（不返回真实 SQL）
 * - POST /api/execute/:tool   - 执行工具（服务器端执行）
 * - GET  /health              - 健康检查
 */

import express from 'express';
import { StarRocksExpertCoordinator } from './experts/expert-coordinator.js';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class CompleteCentralAPIServer {
  constructor() {
    this.app = express();
    this.port = process.env.API_PORT || 80;
    this.host = process.env.API_HOST || '0.0.0.0'; // 默认监听所有网络接口
    this.apiKey = process.env.API_KEY || '';

    // 数据库配置（服务器端）
    this.dbConfig = {
      host: process.env.SR_HOST || 'localhost',
      user: process.env.SR_USER || 'root',
      password: process.env.SR_PASSWORD || '',
      database: process.env.SR_DATABASE || 'information_schema',
      port: parseInt(process.env.SR_PORT) || 9030,
    };

    // 初始化 Expert Coordinator
    this.coordinator = new StarRocksExpertCoordinator();
    this.tools = this.coordinator.getAllTools();

    console.log(`📦 加载了 ${this.tools.length} 个工具（包含所有 Expert）`);

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '50mb' }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // 请求日志
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp} ${req.method} ${req.path}`);
      next();
    });

    // API Key 认证
    if (this.apiKey) {
      this.app.use('/api/*', (req, res, next) => {
        const providedKey = req.headers['x-api-key'];

        if (!providedKey || providedKey !== this.apiKey) {
          console.log(`${new Date().toISOString()} ${req.method} ${req.path} 401 0ms`);
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key'
          });
        }

        next();
      });
    }
  }

  setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'starrocks-central-api-complete',
        version: '3.0.0',
        experts: Object.keys(this.coordinator.experts).length,
        tools: this.tools.length
      });
    });

    // 列出所有工具
    this.app.get('/api/tools', (req, res) => {
      res.json({
        tools: this.tools,
        count: this.tools.length
      });
    });

    // 获取工具的"SQL查询定义"（兼容 thin-mcp-server）
    // 实际上我们不返回真实 SQL，因为会在服务器端执行
    this.app.get('/api/queries/:tool', (req, res) => {
      const toolName = req.params.tool;
      const tool = this.tools.find(t => t.name === toolName);

      if (!tool) {
        return res.status(404).json({
          error: 'Tool not found',
          tool: toolName
        });
      }

      // 返回一个占位 SQL
      // thin-mcp-server 会收到这个，但不会真正执行
      res.json({
        tool: toolName,
        queries: [
          {
            id: 'placeholder',
            sql: '-- This tool is executed on the server side',
            description: `${tool.description.split('\n')[0]}`
          }
        ],
        analysis_endpoint: `/api/execute/${toolName}`,
        note: '此工具在服务器端执行，客户端无需执行 SQL'
      });
    });

    // 执行工具（服务器端执行）
    // thin-mcp-server 会调用 POST /api/analyze/:tool
    // 我们让它重定向到 /api/execute/:tool
    this.app.post('/api/analyze/:tool', async (req, res) => {
      const toolName = req.params.tool;

      // 忽略客户端发送的 results，直接在服务器端执行
      return this.executeToolOnServer(toolName, req.body.args || {}, res);
    });

    // 直接执行工具
    this.app.post('/api/execute/:tool', async (req, res) => {
      const toolName = req.params.tool;
      const args = req.body.args || req.body || {};

      return this.executeToolOnServer(toolName, args, res);
    });

    // 404 处理
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });
  }

  async executeToolOnServer(toolName, args, res) {
    try {
      const tool = this.tools.find(t => t.name === toolName);
      if (!tool) {
        return res.status(404).json({
          error: 'Tool not found',
          tool: toolName
        });
      }

      console.log(`🔧 执行工具: ${toolName}`);

      // 创建数据库连接
      const connection = await mysql.createConnection(this.dbConfig);

      try {
        // 使用 expert coordinator 调用工具
        const result = await this.coordinator.callToolHandler(toolName, args, { connection });

        await connection.end();

        // 返回结果（兼容 thin-mcp-server 期望的格式）
        res.json({
          expert: this.getExpertName(toolName),
          ...result
        });

        console.log(`✅ 工具执行成功: ${toolName}`);
      } catch (execError) {
        await connection.end();
        throw execError;
      }
    } catch (error) {
      console.error(`❌ 工具执行失败 ${toolName}:`, error);
      res.status(500).json({
        error: 'Execution failed',
        message: error.message
      });
    }
  }

  getExpertName(toolName) {
    const handlerInfo = this.coordinator.toolHandlers.get(toolName);
    return handlerInfo ? handlerInfo.expert : 'unknown';
  }

  start() {
    this.server = this.app.listen(this.port, this.host, () => {
      console.log('');
      console.log('🚀 StarRocks Central API Server (Complete)');
      console.log('================================================');
      console.log('');
      console.log(`   🌐 Bind address:     ${this.host}:${this.port}`);
      console.log(`   📡 API endpoint:     http://${this.host === '0.0.0.0' ? '<server-ip>' : this.host}:${this.port}`);
      console.log(`   ❤️  Health check:    http://${this.host === '0.0.0.0' ? '<server-ip>' : this.host}:${this.port}/health`);
      console.log(`   🔧 List tools:       http://${this.host === '0.0.0.0' ? '<server-ip>' : this.host}:${this.port}/api/tools`);
      console.log('');
      console.log(`   🔑 Authentication:   ${this.apiKey ? 'Enabled' : 'Disabled'}`);
      console.log(`   📦 Tools loaded:     ${this.tools.length}`);
      console.log(`   🧠 Experts loaded:   ${Object.keys(this.coordinator.experts).length}`);
      console.log('');
      console.log('   架构模式: 服务器端执行 + Thin MCP Client');
      console.log('   - 客户端: Thin MCP Server (只负责协调)');
      console.log('   - 服务器端: 执行所有 Expert 逻辑');
      console.log('');
      console.log('   数据库配置:');
      console.log(`   Host: ${this.dbConfig.host}:${this.dbConfig.port}`);
      console.log(`   User: ${this.dbConfig.user}`);
      console.log('');
      console.log('   ⚠️  安全提示:');
      if (this.host === '0.0.0.0') {
        console.log('   - 服务器监听所有网络接口，可从外部访问');
        console.log('   - 请确保设置了强 API_KEY');
        console.log('   - 建议配置防火墙规则');
      } else {
        console.log(`   - 服务器仅监听 ${this.host}`);
      }
      console.log('');
      console.log('   Press Ctrl+C to stop the server');
      console.log('');
    });

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  shutdown() {
    console.log('\n🛑 Shutting down server...');

    if (this.server) {
      this.server.close(() => {
        console.log('✅ Server shut down gracefully');
        process.exit(0);
      });
    }
  }
}

// 启动服务器
const server = new CompleteCentralAPIServer();
server.start();

export { CompleteCentralAPIServer };
