#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Local Agent - SQL Executor
 *
 * 轻量级本地代理，只负责执行 SQL 查询
 * 不包含任何业务逻辑，所有逻辑都在中心服务器
 *
 * 功能：
 * - 接收来自中心服务器的 SQL 查询请求
 * - 连接本地/内网的 StarRocks 数据库
 * - 执行 SQL 并返回结果
 * - Token 认证保证安全性
 */

/* eslint-disable no-undef */

import 'dotenv/config';
import express from 'express';
import mysql from 'mysql2/promise';

class LocalAgent {
  constructor(options = {}) {
    this.port = options.port || process.env.AGENT_PORT || 8080;
    this.agentToken = options.agentToken || process.env.AGENT_TOKEN;
    this.allowedOrigins = options.allowedOrigins ||
      process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

    // 数据库连接配置
    this.dbConfig = {
      host: process.env.SR_HOST || 'localhost',
      user: process.env.SR_USER || 'root',
      password: process.env.SR_PASSWORD || '',
      database: process.env.SR_DATABASE || 'information_schema',
      port: parseInt(process.env.SR_PORT) || 9030,
    };

    // 初始化 Express 应用
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // 连接池（复用连接）
    this.pool = null;

    console.log('🤖 StarRocks Local Agent initialized');
    console.log(`   Port: ${this.port}`);
    console.log(`   Database: ${this.dbConfig.host}:${this.dbConfig.port}`);
    console.log(
      `   Auth: ${this.agentToken ? 'Enabled (Token)' : 'Disabled ⚠️'}`,
    );
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
          'Content-Type, Authorization, X-Agent-Token',
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

    // Token authentication
    this.app.use((req, res, next) => {
      // Skip auth for health check
      if (req.path === '/health' || req.path === '/') {
        return next();
      }

      if (!this.agentToken) {
        console.warn('⚠️  Warning: Agent running without authentication!');
        return next();
      }

      const token =
        req.headers['x-agent-token'] ||
        req.headers.authorization?.replace('Bearer ', '');

      if (!token || token !== this.agentToken) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or missing agent token',
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
        service: 'starrocks-local-agent',
        version: '1.0.0',
        uptime: process.uptime(),
        database: {
          host: this.dbConfig.host,
          port: this.dbConfig.port,
          connected: this.pool !== null,
        },
      });
    });

    // Root endpoint - service info
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StarRocks Local Agent',
        version: '1.0.0',
        description: 'Lightweight SQL executor for StarRocks database',
        endpoints: {
          health: '/health',
          execute: '/execute-sql (POST)',
          test: '/test-connection (GET)',
        },
        authentication: this.agentToken ? 'required' : 'disabled',
      });
    });

    // Test database connection
    this.app.get('/test-connection', async (req, res) => {
      try {
        const connection = await this.createConnection();
        try {
          const [rows] = await connection.query('SELECT VERSION() as version');
          res.json({
            success: true,
            message: 'Database connection successful',
            version: rows[0].version,
          });
        } finally {
          await connection.end();
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Database connection failed',
          message: error.message,
        });
      }
    });

    // Execute SQL query (main endpoint)
    this.app.post('/execute-sql', async (req, res) => {
      const { sql, parameters } = req.body;

      if (!sql || typeof sql !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'SQL query is required',
        });
      }

      // Security: Block dangerous operations
      const dangerousKeywords = [
        'DROP TABLE',
        'DROP DATABASE',
        'TRUNCATE',
        'DELETE FROM',
        'UPDATE',
        'INSERT INTO',
        'ALTER TABLE',
        'CREATE USER',
        'GRANT',
        'REVOKE',
      ];

      const sqlUpper = sql.toUpperCase();
      const isDangerous = dangerousKeywords.some((keyword) =>
        sqlUpper.includes(keyword),
      );

      if (isDangerous) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only SELECT queries are allowed',
        });
      }

      try {
        const startTime = Date.now();
        const connection = await this.createConnection();

        try {
          // Execute query
          const [rows, fields] = parameters
            ? await connection.execute(sql, parameters)
            : await connection.query(sql);

          const executionTime = Date.now() - startTime;

          res.json({
            success: true,
            data: rows,
            metadata: {
              rowCount: rows.length,
              executionTime: executionTime,
              fields: fields?.map((f) => ({
                name: f.name,
                type: f.type,
              })),
            },
          });
        } finally {
          await connection.end();
        }
      } catch (error) {
        console.error('SQL execution error:', error);
        res.status(500).json({
          success: false,
          error: 'SQL execution failed',
          message: error.message,
          sqlState: error.sqlState,
          errno: error.errno,
        });
      }
    });

    // Batch execute multiple queries
    this.app.post('/execute-batch', async (req, res) => {
      const { queries } = req.body;

      if (!Array.isArray(queries) || queries.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Queries array is required',
        });
      }

      try {
        const connection = await this.createConnection();
        const results = [];

        try {
          for (const query of queries) {
            const { sql, parameters } = query;

            // Security check
            const sqlUpper = sql.toUpperCase();
            if (
              sqlUpper.includes('DROP') ||
              sqlUpper.includes('DELETE') ||
              sqlUpper.includes('UPDATE')
            ) {
              results.push({
                success: false,
                error: 'Forbidden operation',
                sql: sql.substring(0, 50) + '...',
              });
              continue;
            }

            const startTime = Date.now();
            const [rows] = parameters
              ? await connection.execute(sql, parameters)
              : await connection.query(sql);

            results.push({
              success: true,
              data: rows,
              executionTime: Date.now() - startTime,
            });
          }

          res.json({
            success: true,
            results: results,
            totalQueries: queries.length,
          });
        } finally {
          await connection.end();
        }
      } catch (error) {
        console.error('Batch execution error:', error);
        res.status(500).json({
          success: false,
          error: 'Batch execution failed',
          message: error.message,
        });
      }
    });
  }

  async createConnection() {
    if (!this.dbConfig.host || !this.dbConfig.user) {
      throw new Error(
        'Database configuration incomplete. Please set SR_HOST and SR_USER environment variables.',
      );
    }

    return await mysql.createConnection(this.dbConfig);
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log('');
      console.log('🎉 StarRocks Local Agent is running!');
      console.log('');
      console.log(`   📡 HTTP endpoint:    http://localhost:${this.port}`);
      console.log(
        `   ❤️  Health check:    http://localhost:${this.port}/health`,
      );
      console.log(
        `   🔗 Test connection:  http://localhost:${this.port}/test-connection`,
      );
      console.log('');
      console.log(
        `   🔑 Authentication:   ${this.agentToken ? 'Enabled' : '⚠️  Disabled (Not recommended!)'}`,
      );
      console.log(
        `   🗄️  Database:         ${this.dbConfig.host}:${this.dbConfig.port}`,
      );
      console.log('');
      console.log('   Press Ctrl+C to stop the agent');
      console.log('');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    console.log('\n🛑 Shutting down agent...');

    if (this.pool) {
      await this.pool.end();
    }

    if (this.server) {
      this.server.close(() => {
        console.log('✅ Agent shut down gracefully');
        process.exit(0);
      });
    }
  }
}

// Start agent if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new LocalAgent();
  agent.start();
}

export default LocalAgent;
