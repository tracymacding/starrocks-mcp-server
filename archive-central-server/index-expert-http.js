#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks MCP Server - HTTP/SSE Version
 * 支持通过 HTTP 服务远程访问的专家系统
 *
 * 特性：
 * - SSE (Server-Sent Events) 传输
 * - API Key 认证
 * - CORS 支持
 * - 健康检查端点
 * - 请求日志
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
import mysql from 'mysql2/promise';
import { StarRocksExpertCoordinator } from './experts/expert-coordinator.js';

class StarRocksMcpHttpServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3000;
    this.apiKey = options.apiKey || process.env.API_KEY;
    this.allowedOrigins = options.allowedOrigins ||
      process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

    // 初始化 Express 应用
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // 初始化专家协调器
    this.expertCoordinator = new StarRocksExpertCoordinator();

    // 连接池
    this.activeConnections = new Map();

    console.log('🚀 StarRocks MCP HTTP Server initialized');
    console.log(`   Port: ${this.port}`);
    console.log(`   Auth: ${this.apiKey ? 'Enabled (API Key)' : 'Disabled'}`);
    console.log(`   CORS: ${this.allowedOrigins.join(', ')}`);
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
          'Content-Type, Authorization, X-API-Key',
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
        console.log(
          `${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
        );
      });
      next();
    });

    // API Key authentication (if configured)
    this.app.use((req, res, next) => {
      // Skip auth for health check
      if (req.path === '/health' || req.path === '/') {
        return next();
      }

      if (!this.apiKey) {
        return next(); // No auth configured
      }

      const apiKey =
        req.headers['x-api-key'] ||
        req.headers.authorization?.replace('Bearer ', '');

      if (!apiKey || apiKey !== this.apiKey) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or missing API key',
        });
      }

      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'starrocks-mcp-server',
        version: '2.0.0',
        uptime: process.uptime(),
        experts: this.expertCoordinator.getAllTools().length,
      });
    });

    // Root endpoint - service info
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StarRocks MCP Server',
        version: '2.0.0',
        description: 'StarRocks Expert System with HTTP/SSE support',
        endpoints: {
          health: '/health',
          sse: '/sse (SSE endpoint)',
          messages: '/messages (POST)',
        },
        authentication: this.apiKey ? 'required' : 'disabled',
        experts: this.expertCoordinator.getAllTools().map((t) => t.name),
      });
    });

    // SSE endpoint
    this.app.get('/sse', async (req, res) => {
      console.log('📡 New SSE connection established');

      // Create MCP server instance for this connection
      const server = new Server(
        {
          name: 'starrocks-mcp-server-expert',
          version: '2.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );

      // Setup handlers for this server instance
      this.setupServerHandlers(server);

      // Create SSE transport with Express app for message handling
      const sessionId = `session_${Date.now()}`;
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
      this.activeConnections.set(sessionId, { server, transport });

      // Cleanup on close
      res.on('close', () => {
        console.log(`📡 SSE connection closed for session ${sessionId}`);
        this.activeConnections.delete(sessionId);
        // Remove the POST handler
        this.app._router.stack = this.app._router.stack.filter(
          (layer) => !(layer.route && layer.route.path === messagesPath),
        );
      });
    });
  }

  setupServerHandlers(server) {
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
        // Delegate to expert coordinator
        if (this.expertCoordinator.toolHandlers.has(name)) {
          const connection = await this.createConnection();
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

    let report = '🎯 StarRocks 多专家协调分析报告\n';
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

    let report = `${emoji} StarRocks ${expertType.toUpperCase()} 专家分析报告\n`;
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

  /**
   * 创建数据库连接
   */
  async createConnection() {
    const dbConfig = {
      host: process.env.SR_HOST,
      user: process.env.SR_USER,
      password: process.env.SR_PASSWORD,
      database: process.env.SR_DATABASE || 'information_schema',
      port: process.env.SR_PORT || 9030,
    };

    if (!dbConfig.host || !dbConfig.user || dbConfig.password === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Missing StarRocks connection details. Please set SR_HOST, SR_USER, and SR_PASSWORD environment variables.',
      );
    }

    return await mysql.createConnection(dbConfig);
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log('');
      console.log('🎉 StarRocks MCP HTTP Server is running!');
      console.log('');
      console.log(`   📡 SSE endpoint:     http://localhost:${this.port}/sse`);
      console.log(
        `   💬 Messages:         http://localhost:${this.port}/messages`,
      );
      console.log(
        `   ❤️  Health check:    http://localhost:${this.port}/health`,
      );
      console.log('');
      console.log(
        `   🔑 Authentication:   ${this.apiKey ? 'Enabled' : 'Disabled'}`,
      );
      console.log(`   🌍 CORS:             ${this.allowedOrigins.join(', ')}`);
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
  const server = new StarRocksMcpHttpServer();
  server.start();
}

export default StarRocksMcpHttpServer;
