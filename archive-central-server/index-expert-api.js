#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks MCP Server - Central API
 *
 * 为方案 C（本地 Stdio MCP + 中心 API）提供中心化的专家服务
 *
 * 特性：
 * - 提供 SQL 查询定义（给客户端执行）
 * - 提供分析逻辑（处理客户端返回的结果）
 * - API Key 认证
 * - CORS 支持
 */

/* eslint-disable no-undef */

import 'dotenv/config';
import express from 'express';
// Note: For now, we'll use a simplified approach without importing full expert classes
// The API provides its own analysis logic

class StarRocksCentralAPI {
  constructor(options = {}) {
    this.port = options.port || process.env.API_PORT || 80;
    this.apiKey = options.apiKey || process.env.API_KEY;

    // 初始化 Express 应用
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    console.log('🚀 StarRocks Central API Server initialized');
    console.log(`   Port: ${this.port}`);
    console.log(`   Auth: ${this.apiKey ? 'Enabled (API Key)' : 'Disabled'}`);
  }

  setupMiddleware() {
    // JSON body parser
    this.app.use(express.json({ limit: '50mb' })); // 支持大的查询结果

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

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
        console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });

    // API Key authentication
    this.app.use((req, res, next) => {
      // Skip auth for health check
      if (req.path === '/health' || req.path === '/') {
        return next();
      }

      if (!this.apiKey) {
        return next(); // No auth configured
      }

      const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');

      if (!apiKey || apiKey !== this.apiKey) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or missing API key'
        });
      }

      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'starrocks-central-api',
        version: '1.0.0',
        uptime: process.uptime()
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StarRocks Central API',
        version: '1.0.0',
        description: 'Central API for StarRocks Expert System',
        endpoints: {
          health: '/health',
          list_tools: '/api/tools (GET)',
          get_queries: '/api/queries/:tool (GET)',
          analyze: '/api/analyze/:tool (POST)',
        },
        authentication: this.apiKey ? 'required' : 'disabled'
      });
    });

    // List all available tools
    this.app.get('/api/tools', (req, res) => {
      const tools = this.getAllTools();
      res.json({
        tools: tools,
        count: tools.length
      });
    });

    // Get SQL queries for a specific tool
    this.app.get('/api/queries/:tool', (req, res) => {
      const { tool } = req.params;

      try {
        const queries = this.getQueriesForTool(tool);
        res.json({
          tool: tool,
          queries: queries,
          analysis_endpoint: `/api/analyze/${tool}`
        });
      } catch (error) {
        res.status(404).json({
          error: 'Tool not found',
          message: error.message,
          tool: tool
        });
      }
    });

    // Analyze results from client
    this.app.post('/api/analyze/:tool', async (req, res) => {
      const { tool } = req.params;
      const { results } = req.body;

      if (!results) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Missing "results" field in request body'
        });
      }

      try {
        const analysis = await this.analyzeResults(tool, results);
        res.json(analysis);
      } catch (error) {
        res.status(500).json({
          error: 'Analysis failed',
          message: error.message,
          tool: tool
        });
      }
    });
  }

  /**
   * 获取所有可用工具列表
   */
  getAllTools() {
    return [
      {
        name: 'analyze_storage_health',
        description: '全面分析存储健康状况',
        expert: 'storage',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'analyze_compaction_health',
        description: '分析 Compaction 健康状况',
        expert: 'compaction',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'analyze_ingestion_health',
        description: '分析数据摄取健康状况',
        expert: 'ingestion',
        inputSchema: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              description: '分析最近多少小时的数据',
              default: 24
            }
          },
          required: []
        }
      }
    ];
  }

  /**
   * 获取指定工具需要执行的 SQL 查询
   */
  getQueriesForTool(toolName) {
    // 存储专家查询
    if (toolName === 'analyze_storage_health') {
      return [
        {
          id: 'backends',
          sql: 'SHOW BACKENDS;',
          description: 'BE节点存储信息'
        },
        {
          id: 'tablet_statistics',
          sql: `SELECT
            COUNT(*) as total_tablets,
            COUNT(CASE WHEN ErrTabletNum > 0 THEN 1 END) as nodes_with_errors,
            SUM(ErrTabletNum) as total_error_tablets,
            SUM(TabletNum) as total_tablets_on_nodes
          FROM information_schema.backends;`,
          description: 'Tablet统计信息'
        },
        {
          id: 'partition_storage',
          sql: `SELECT
            DB_NAME, TABLE_NAME, PARTITION_NAME,
            DATA_SIZE, ROW_COUNT, STORAGE_SIZE,
            BUCKETS, REPLICATION_NUM
          FROM information_schema.partitions_meta
          ORDER BY STORAGE_SIZE DESC
          LIMIT 50;`,
          description: '分区存储信息'
        }
      ];
    }

    // Compaction 专家查询
    if (toolName === 'analyze_compaction_health') {
      return [
        {
          id: 'backends',
          sql: 'SHOW BACKENDS;',
          description: 'BE节点信息'
        },
        {
          id: 'high_compaction_partitions',
          sql: `SELECT
            TABLE_SCHEMA, TABLE_NAME, PARTITION_NAME,
            MAX_CS, AVG_CS, P50_CS, P95_CS, P99_CS
          FROM information_schema.partitions_meta
          WHERE MAX_CS >= 100
          ORDER BY MAX_CS DESC
          LIMIT 20;`,
          description: '高 Compaction Score 分区'
        }
      ];
    }

    // 摄取专家查询
    if (toolName === 'analyze_ingestion_health') {
      return [
        {
          id: 'recent_load_jobs',
          sql: `SELECT
            LABEL, STATE, PROGRESS, TYPE,
            CREATE_TIME, FINISH_TIME, URL
          FROM information_schema.loads
          WHERE CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          ORDER BY CREATE_TIME DESC
          LIMIT 100;`,
          description: '最近的导入作业'
        },
        {
          id: 'failed_jobs',
          sql: `SELECT
            LABEL, STATE, CREATE_TIME, FINISH_TIME, URL
          FROM information_schema.loads
          WHERE STATE = 'CANCELLED'
            AND CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          ORDER BY CREATE_TIME DESC
          LIMIT 50;`,
          description: '失败的导入作业'
        }
      ];
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }

  /**
   * 分析客户端返回的查询结果
   */
  async analyzeResults(toolName, results) {
    // 存储专家分析
    if (toolName === 'analyze_storage_health') {
      return this.analyzeStorageHealth(results);
    }

    // Compaction 专家分析
    if (toolName === 'analyze_compaction_health') {
      return this.analyzeCompactionHealth(results);
    }

    // 摄取专家分析
    if (toolName === 'analyze_ingestion_health') {
      return this.analyzeIngestionHealth(results);
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }

  /**
   * 存储健康分析（基于客户端提供的数据）
   */
  analyzeStorageHealth(results) {
    const { backends, tablet_statistics, partition_storage } = results;

    const issues = [];
    const warnings = [];
    const criticals = [];

    // 分析磁盘使用
    backends.forEach(be => {
      const diskUsage = parseFloat(be.MaxDiskUsedPct?.replace('%', '')) || 0;

      if (diskUsage >= 95) {
        criticals.push({
          type: 'disk_critical',
          node: be.IP,
          severity: 'CRITICAL',
          message: `节点 ${be.IP} 磁盘使用率过高 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage }
        });
      } else if (diskUsage >= 85) {
        warnings.push({
          type: 'disk_warning',
          node: be.IP,
          severity: 'WARNING',
          message: `节点 ${be.IP} 磁盘使用率较高 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage }
        });
      }

      // 检查错误 Tablet
      const errorTablets = parseInt(be.ErrTabletNum) || 0;
      if (errorTablets > 0) {
        warnings.push({
          type: 'error_tablets',
          node: be.IP,
          severity: errorTablets >= 10 ? 'CRITICAL' : 'WARNING',
          message: `节点 ${be.IP} 发现 ${errorTablets} 个错误Tablet`,
          metrics: { error_count: errorTablets }
        });
      }
    });

    // 计算健康分数
    let score = 100;
    score -= criticals.length * 25;
    score -= warnings.length * 10;
    score = Math.max(0, score);

    const level = score >= 85 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 50 ? 'FAIR' : 'POOR';

    return {
      expert: 'storage',
      timestamp: new Date().toISOString(),
      storage_health: {
        score: score,
        level: level,
        status: criticals.length > 0 ? 'CRITICAL' : warnings.length > 0 ? 'WARNING' : 'HEALTHY'
      },
      diagnosis_results: {
        total_issues: criticals.length + warnings.length,
        criticals: criticals,
        warnings: warnings,
        summary: this.generateStorageSummary(criticals, warnings)
      },
      professional_recommendations: this.generateStorageRecommendations(criticals, warnings)
    };
  }

  generateStorageSummary(criticals, warnings) {
    if (criticals.length > 0) {
      return `存储系统发现 ${criticals.length} 个严重问题，需要立即处理`;
    } else if (warnings.length > 0) {
      return `存储系统发现 ${warnings.length} 个警告问题，建议近期处理`;
    } else {
      return '存储系统运行状态良好，未发现异常问题';
    }
  }

  generateStorageRecommendations(criticals, warnings) {
    const recommendations = [];

    // 针对严重问题生成建议
    criticals.forEach(issue => {
      if (issue.type === 'disk_critical') {
        recommendations.push({
          priority: 'HIGH',
          title: '紧急磁盘空间处理',
          description: `节点 ${issue.node} 磁盘空间严重不足`,
          actions: [
            '立即清理临时文件和日志',
            '手动触发Compaction清理过期数据',
            '考虑紧急扩容或数据迁移'
          ]
        });
      }
    });

    // 针对警告生成建议
    warnings.forEach(issue => {
      if (issue.type === 'disk_warning') {
        recommendations.push({
          priority: 'MEDIUM',
          title: '磁盘空间监控',
          description: `节点 ${issue.node} 磁盘使用率较高`,
          actions: [
            '监控磁盘使用率变化趋势',
            '制定数据清理计划',
            '评估是否需要扩容'
          ]
        });
      }

      if (issue.type === 'error_tablets') {
        recommendations.push({
          priority: issue.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          title: 'Tablet错误修复',
          description: `修复节点 ${issue.node} 上的错误Tablet`,
          actions: [
            '使用 SHOW PROC "/dbs" 诊断详情',
            '尝试 ADMIN REPAIR TABLE 自动修复',
            '检查磁盘和网络状态'
          ]
        });
      }
    });

    return recommendations;
  }

  /**
   * Compaction 健康分析
   */
  analyzeCompactionHealth(results) {
    const { backends, high_compaction_partitions } = results;

    const issues = [];
    const warnings = [];

    // 分析高 Compaction Score 分区
    high_compaction_partitions.forEach(partition => {
      const maxCS = partition.MAX_CS || 0;

      if (maxCS >= 1000) {
        issues.push({
          type: 'very_high_compaction',
          severity: 'CRITICAL',
          partition: `${partition.TABLE_SCHEMA}.${partition.TABLE_NAME}.${partition.PARTITION_NAME}`,
          score: maxCS,
          message: `分区 Compaction Score 过高 (${maxCS})`
        });
      } else if (maxCS >= 500) {
        warnings.push({
          type: 'high_compaction',
          severity: 'WARNING',
          partition: `${partition.TABLE_SCHEMA}.${partition.TABLE_NAME}.${partition.PARTITION_NAME}`,
          score: maxCS,
          message: `分区 Compaction Score 较高 (${maxCS})`
        });
      }
    });

    let score = 100;
    score -= issues.length * 15;
    score -= warnings.length * 5;
    score = Math.max(0, score);

    return {
      expert: 'compaction',
      timestamp: new Date().toISOString(),
      compaction_health: {
        score: score,
        level: score >= 85 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : 'FAIR',
        status: issues.length > 0 ? 'CRITICAL' : warnings.length > 0 ? 'WARNING' : 'HEALTHY'
      },
      diagnosis_results: {
        total_issues: issues.length + warnings.length,
        issues: issues,
        warnings: warnings,
        summary: `发现 ${high_compaction_partitions.length} 个高 Compaction Score 分区`
      },
      professional_recommendations: [
        {
          priority: 'HIGH',
          title: '优化 Compaction 配置',
          actions: [
            '手动触发 Compaction: ALTER TABLE xxx COMPACT',
            '检查 Compaction 线程配置',
            '优化数据导入频率'
          ]
        }
      ]
    };
  }

  /**
   * 摄取健康分析
   */
  analyzeIngestionHealth(results) {
    const { recent_load_jobs, failed_jobs } = results;

    const totalJobs = recent_load_jobs.length;
    const failedCount = failed_jobs.length;
    const successRate = totalJobs > 0 ? ((totalJobs - failedCount) / totalJobs * 100).toFixed(2) : 100;

    let score = parseFloat(successRate);
    const level = score >= 95 ? 'EXCELLENT' : score >= 85 ? 'GOOD' : score >= 70 ? 'FAIR' : 'POOR';

    const issues = [];
    if (failedCount > 0) {
      issues.push({
        type: 'failed_imports',
        severity: failedCount > 10 ? 'CRITICAL' : 'WARNING',
        message: `发现 ${failedCount} 个失败的导入作业`,
        failed_jobs: failed_jobs.slice(0, 5).map(job => ({
          label: job.LABEL,
          time: job.CREATE_TIME,
          url: job.URL
        }))
      });
    }

    return {
      expert: 'ingestion',
      timestamp: new Date().toISOString(),
      import_health: {
        score: score,
        level: level,
        status: failedCount > 10 ? 'CRITICAL' : failedCount > 0 ? 'WARNING' : 'HEALTHY'
      },
      diagnosis_results: {
        total_jobs: totalJobs,
        failed_jobs: failedCount,
        success_rate: successRate + '%',
        issues: issues,
        summary: `最近24小时导入成功率: ${successRate}%`
      },
      professional_recommendations: failedCount > 0 ? [
        {
          priority: 'HIGH',
          title: '排查失败原因',
          actions: [
            '检查失败作业的错误日志',
            '验证数据格式和Schema匹配',
            '确认数据源连接正常'
          ]
        }
      ] : []
    };
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log('');
      console.log('🎉 StarRocks Central API Server is running!');
      console.log('');
      console.log(`   📡 API endpoint:     http://localhost:${this.port}`);
      console.log(`   ❤️  Health check:    http://localhost:${this.port}/health`);
      console.log(`   🔧 List tools:       http://localhost:${this.port}/api/tools`);
      console.log('');
      console.log(`   🔑 Authentication:   ${this.apiKey ? 'Enabled' : 'Disabled'}`);
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
  const server = new StarRocksCentralAPI();
  server.start();
}

export default StarRocksCentralAPI;
