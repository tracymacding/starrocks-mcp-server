#!/usr/bin/env node
/* eslint-env node */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Central API Server - Solution C 完整版
 *
 * 架构：客户端执行 SQL + 中心API分析
 *
 * 特性：
 * - ✅ 所有 Expert 都支持 Solution C 模式
 * - ✅ GET /api/queries/:tool 返回 SQL 定义
 * - ✅ POST /api/analyze/:tool 分析客户端返回的结果
 * - ✅ 零维护升级（只需更新服务器）
 *
 * 工作流程：
 * 1. Thin MCP Server 请求 SQL 定义
 * 2. Thin MCP Server 执行 SQL
 * 3. Thin MCP Server 发送结果给中心 API
 * 4. 中心 API 返回分析报告
 */

import 'dotenv/config';
import express from 'express';
import { StarRocksExpertCoordinator } from './experts/expert-coordinator.js';

class SolutionCCentralAPI {
  constructor() {
    this.app = express();
    this.port = process.env.API_PORT || 80;
    this.host = process.env.API_HOST || '0.0.0.0'; // 默认监听所有网络接口
    this.apiKey = process.env.API_KEY || '';

    // 初始化 Expert Coordinator
    this.coordinator = new StarRocksExpertCoordinator();
    this.tools = this.coordinator.getAllTools();

    console.log(`📦 加载了 ${this.tools.length} 个工具`);

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
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'starrocks-central-api-solutionc',
        version: '3.0.0',
        mode: 'Solution C (Client-side SQL Execution)',
        tools: this.tools.length
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StarRocks Central API (Solution C)',
        version: '3.0.0',
        description: 'Central API for StarRocks Expert System with client-side SQL execution',
        architecture: 'Solution C',
        endpoints: {
          health: '/health',
          list_tools: '/api/tools (GET)',
          get_queries: '/api/queries/:tool (GET) - 获取SQL定义',
          analyze: '/api/analyze/:tool (POST) - 分析客户端结果',
        },
        workflow: [
          '1. GET /api/queries/:tool -> 返回 SQL 查询列表',
          '2. Thin MCP Server 执行这些 SQL',
          '3. POST /api/analyze/:tool -> 发送执行结果',
          '4. 返回分析报告'
        ],
        authentication: this.apiKey ? 'required' : 'disabled'
      });
    });

    // 列出所有工具
    this.app.get('/api/tools', (req, res) => {
      res.json({
        tools: this.tools.map(tool => ({
          name: tool.name,
          description: tool.description, // 返回完整描述，包含示例问题
          expert: this.getExpertForTool(tool.name),
          inputSchema: tool.inputSchema
        })),
        count: this.tools.length,
        mode: 'Solution C'
      });
    });

    // 获取工具的 SQL 查询定义
    this.app.get('/api/queries/:tool', (req, res) => {
      const toolName = req.params.tool;

      try {
        // 从工具参数中获取参数（通过 query string）
        const args = req.query;

        // 获取 SQL 查询定义
        const queries = this.getQueriesForTool(toolName, args);

        res.json({
          tool: toolName,
          queries: queries,
          analysis_endpoint: `/api/analyze/${toolName}`,
          note: 'Thin MCP Server 应执行这些 SQL 查询，然后将结果 POST 到 analysis_endpoint'
        });
      } catch (error) {
        res.status(404).json({
          error: 'Tool not found or does not support Solution C',
          message: error.message,
          tool: toolName
        });
      }
    });

    // 分析客户端返回的结果
    this.app.post('/api/analyze/:tool', async (req, res) => {
      const toolName = req.params.tool;
      const { results, args } = req.body;

      if (!results) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Missing "results" field in request body. Expected format: { results: { query_id: rows[] }, args: {...} }'
        });
      }

      try {
        const analysis = await this.analyzeResults(toolName, results, args || {});
        res.json(analysis);
      } catch (error) {
        res.status(500).json({
          error: 'Analysis failed',
          message: error.message,
          tool: toolName
        });
      }
    });

    // 404 处理
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });
  }

  /**
   * 获取指定工具的 SQL 查询定义
   */
  getQueriesForTool(toolName, args) {
    // 找到对应的 Expert
    const expert = this.findExpertForTool(toolName);

    if (!expert) {
      throw new Error(`No expert found for tool: ${toolName}`);
    }

    // 检查 Expert 是否支持 getQueriesForTool 方法
    if (typeof expert.getQueriesForTool !== 'function') {
      throw new Error(`Expert for tool ${toolName} does not support Solution C mode (missing getQueriesForTool method)`);
    }

    return expert.getQueriesForTool(toolName, args);
  }

  /**
   * 分析客户端返回的查询结果
   */
  async analyzeResults(toolName, results, args) {
    // 找到对应的 Expert
    const expert = this.findExpertForTool(toolName);

    if (!expert) {
      throw new Error(`No expert found for tool: ${toolName}`);
    }

    // 检查 Expert 是否支持 analyzeQueryResults 方法
    if (typeof expert.analyzeQueryResults !== 'function') {
      throw new Error(`Expert for tool ${toolName} does not support Solution C mode (missing analyzeQueryResults method)`);
    }

    return await expert.analyzeQueryResults(toolName, results, args);
  }

  /**
   * 查找工具对应的 Expert
   */
  findExpertForTool(toolName) {
    // Coordinator 级别的工具（需要由 coordinator 本身处理）
    const coordinatorTools = [
      'expert_analysis',
      'storage_expert_analysis',
      'compaction_expert_analysis',
      'ingestion_expert_analysis',
      'get_available_experts'
    ];

    if (coordinatorTools.includes(toolName)) {
      // 返回 coordinator 本身
      return this.coordinator;
    }

    // 通过 coordinator 的 toolHandlers 映射找到对应的 expert
    const handlerInfo = this.coordinator.toolHandlers.get(toolName);

    if (handlerInfo) {
      const expertName = handlerInfo.expert;

      // 如果 expert 是 'coordinator'，说明是协调器级别的工具
      if (expertName === 'coordinator') {
        return this.coordinator;
      }

      // 返回对应的 expert
      return this.coordinator.experts[expertName];
    }

    // 如果在 toolHandlers 中找不到
    // 尝试从工具名称推断
    // 例如：analyze_storage_health -> storage expert
    for (const [expertName, expert] of Object.entries(this.coordinator.experts)) {
      if (toolName.includes(expertName)) {
        return expert;
      }
    }

    return null;
  }

  /**
   * 获取工具对应的 Expert 名称
   */
  getExpertForTool(toolName) {
    const handlerInfo = this.coordinator.toolHandlers.get(toolName);
    return handlerInfo ? handlerInfo.expert : 'unknown';
  }

  start() {
    this.server = this.app.listen(this.port, this.host, () => {
      console.log('');
      console.log('🚀 StarRocks Central API Server (Solution C)');
      console.log('================================================');
      console.log('');
      console.log(`   🌐 Bind address:     ${this.host}:${this.port}`);
      console.log(`   📡 API endpoint:     http://${this.host === '0.0.0.0' ? '<server-ip>' : this.host}:${this.port}`);
      console.log(`   ❤️  Health check:    http://${this.host === '0.0.0.0' ? '<server-ip>' : this.host}:${this.port}/health`);
      console.log(`   🔧 List tools:       http://${this.host === '0.0.0.0' ? '<server-ip>' : this.host}:${this.port}/api/tools`);
      console.log('');
      console.log(`   🔑 Authentication:   ${this.apiKey ? 'Enabled' : 'Disabled'}`);
      console.log(`   📦 Tools loaded:     ${this.tools.length}`);
      console.log('');
      console.log('   ✨ 架构模式: Solution C');
      console.log('   - SQL 执行: Thin MCP Server（客户端）');
      console.log('   - 数据分析: Central API Server（服务端）');
      console.log('');
      console.log('   工作流程:');
      console.log('   1. GET /api/queries/:tool → 返回 SQL 定义');
      console.log('   2. 客户端执行 SQL 查询');
      console.log('   3. POST /api/analyze/:tool → 发送结果');
      console.log('   4. 服务器返回分析报告');
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
const server = new SolutionCCentralAPI();
server.start();

export { SolutionCCentralAPI };
