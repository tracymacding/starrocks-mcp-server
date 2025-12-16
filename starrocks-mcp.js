#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Thin MCP Server
 *
 * 轻量级客户端 MCP Server，用于方案 C (本地 Stdio MCP + 中心 API)
 *
 * 职责：
 * 1. 作为 Stdio MCP Server 被 Gemini CLI 调用
 * 2. 调用中心 API 获取需要执行的 SQL
 * 3. 连接本地 StarRocks 执行 SQL
 * 4. 将结果发送给中心 API 进行分析
 * 5. 返回分析报告给 Gemini CLI
 *
 * 优势：
 * - 极简（~150 行）
 * - 无业务逻辑（SQL 逻辑在中心 API）
 * - 基本不需要升级
 */

/* eslint-disable no-undef */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

/**
 * Logger - 日志记录工具类
 *
 * 功能：
 * - JSON 格式日志
 * - 按日期自动轮转
 * - 敏感信息自动脱敏
 * - 支持多种日志级别
 */
class Logger {
  constructor(logDir = './logs', enabled = true) {
    this.enabled = enabled;
    this.logDir = logDir;
    this.currentDate = null;
    this.logStream = null;
    this.requestId = 0; // 请求计数器

    // 如果禁用日志，不初始化日志流
    if (!this.enabled) {
      console.error('   Logging is disabled');
      return;
    }

    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.initLogStream();
  }

  /**
   * 初始化日志流
   */
  initLogStream() {
    const today = new Date().toISOString().split('T')[0];

    // 如果日期变化，关闭旧的日志流
    if (this.currentDate !== today && this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }

    if (!this.logStream) {
      this.currentDate = today;
      const logFile = path.join(this.logDir, `mcp-server-${today}.log`);
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }
  }

  /**
   * 生成新的请求 ID
   */
  generateRequestId() {
    this.requestId++;
    return `req_${Date.now()}_${this.requestId}`;
  }

  /**
   * 脱敏敏感信息
   */
  sanitize(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveKeys = [
      'password',
      'token',
      'apiToken',
      'api_token',
      'secret',
      'ssh_password',
      'SR_PASSWORD',
      'CENTRAL_API_TOKEN',
    ];

    const maskValue = (obj) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        if (
          sensitiveKeys.some((sk) =>
            key.toLowerCase().includes(sk.toLowerCase()),
          )
        ) {
          obj[key] = obj[key] ? '***MASKED***' : '';
        } else if (typeof obj[key] === 'object') {
          maskValue(obj[key]);
        }
      }
    };

    maskValue(sanitized);
    return sanitized;
  }

  /**
   * 生成数据摘要（避免大对象打爆日志）
   * @param {*} data - 要摘要的数据
   * @param {number} maxSize - 最大 JSON 字符串长度（默认 1KB）
   * @returns {Object} 摘要对象
   */
  summarizeData(data, maxSize = 1024) {
    if (!data) {
      return null;
    }

    const jsonStr = JSON.stringify(data);
    const sizeBytes = jsonStr.length;

    // 如果数据较小，直接返回
    if (sizeBytes <= maxSize) {
      return {
        _summary: false,
        data: data,
        sizeBytes,
      };
    }

    // 数据过大，返回摘要
    const summary = {
      _summary: true,
      sizeBytes,
      sizeKB: (sizeBytes / 1024).toFixed(2),
      type: Array.isArray(data) ? 'array' : typeof data,
    };

    // 添加类型特定的摘要信息
    if (Array.isArray(data)) {
      summary.length = data.length;
      summary.sample = data.slice(0, 2); // 只保留前2个元素作为样本
    } else if (typeof data === 'object') {
      summary.keys = Object.keys(data).slice(0, 10); // 只保留前10个键名
      summary.totalKeys = Object.keys(data).length;
    }

    return summary;
  }

  /**
   * 生成 HTTP body 摘要
   * @param {*} body - 请求或响应体
   * @returns {Object} 摘要对象
   */
  summarizeHttpBody(body) {
    if (!body) {
      return null;
    }

    const jsonStr = JSON.stringify(body);
    const sizeBytes = jsonStr.length;

    // 小于 2KB 的请求体直接记录
    if (sizeBytes <= 2048) {
      return this.sanitize(body);
    }

    // 大请求体只记录摘要
    const summary = {
      _truncated: true,
      sizeBytes,
      sizeKB: (sizeBytes / 1024).toFixed(2),
    };

    // 记录关键字段
    if (body.args) {
      const argsStr = JSON.stringify(body.args);
      if (argsStr.length <= 512) {
        summary.args = this.sanitize(body.args);
      } else {
        summary.args = {
          _truncated: true,
          sizeBytes: argsStr.length,
          keys: Object.keys(body.args),
        };
      }
    }

    if (body.results) {
      const resultsStr = JSON.stringify(body.results);
      summary.results = {
        _truncated: true,
        sizeBytes: resultsStr.length,
        sizeKB: (resultsStr.length / 1024).toFixed(2),
        keys: Object.keys(body.results).slice(0, 10),
        totalKeys: Object.keys(body.results).length,
      };
    }

    return summary;
  }

  /**
   * 写入日志
   * @param {boolean} skipSanitize - 是否跳过敏感信息脱敏（默认 false）
   */
  write(level, type, message, data = {}, skipSanitize = false) {
    // 如果日志被禁用，直接返回
    if (!this.enabled) {
      return;
    }

    this.initLogStream(); // 确保日志流有效（处理日期变化）

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      type,
      message,
      ...(skipSanitize ? data : this.sanitize(data)),
    };

    this.logStream.write(JSON.stringify(logEntry) + '\n');
  }

  /**
   * 记录客户端请求（MCP 请求）
   */
  logClientRequest(requestId, toolName, args) {
    this.write('INFO', 'CLIENT_REQUEST', 'Received request from client', {
      requestId,
      toolName,
      args: this.sanitize(args),
    });
  }

  /**
   * 记录中心服务器请求
   */
  logCentralRequest(requestId, method, url, body = null) {
    this.write('INFO', 'CENTRAL_REQUEST', 'Sending request to central API', {
      requestId,
      method,
      url,
      body: body ? this.summarizeHttpBody(body) : null,
    });
  }

  /**
   * 记录中心服务器响应
   */
  logCentralResponse(requestId, url, status, data, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error
      ? 'Central API request failed'
      : 'Received response from central API';

    // 计算响应大小
    let dataSize = 0;
    let dataSummary = null;

    if (data) {
      const dataStr = JSON.stringify(data);
      dataSize = dataStr.length;

      // 如果响应数据较大（>5KB），记录摘要而不是完整数据
      if (dataSize > 5120) {
        dataSummary = {
          _truncated: true,
          sizeBytes: dataSize,
          sizeKB: (dataSize / 1024).toFixed(2),
          sizeMB: (dataSize / 1024 / 1024).toFixed(2),
          keys:
            typeof data === 'object'
              ? Object.keys(data).slice(0, 10)
              : undefined,
          totalKeys:
            typeof data === 'object' ? Object.keys(data).length : undefined,
        };
      } else {
        // 小响应可以记录完整数据（但仍然脱敏）
        dataSummary = this.sanitize(data);
      }
    }

    this.write(level, 'CENTRAL_RESPONSE', message, {
      requestId,
      url,
      status,
      dataSize,
      dataSizeKB: (dataSize / 1024).toFixed(2),
      data: dataSummary,
      error: error ? error.message : null,
    });
  }

  /**
   * 生成 MySQL 命令行字符串（用于调试和复现）
   * @param {Object} dbConfig - 数据库配置
   * @param {string} sql - SQL 语句
   * @returns {string} MySQL 命令字符串
   */
  generateMysqlCommand(dbConfig, sql) {
    if (!dbConfig) {
      return null;
    }

    const parts = ['mysql'];

    // 添加连接参数
    if (dbConfig.host) {
      parts.push(`-h${dbConfig.host}`);
    }
    if (dbConfig.port) {
      parts.push(`-P${dbConfig.port}`);
    }
    if (dbConfig.user) {
      parts.push(`-u${dbConfig.user}`);
    }
    if (dbConfig.password) {
      // 完整打印密码（不脱敏），方便直接复制命令执行
      parts.push(`-p'${dbConfig.password}'`);
    }

    // 添加 SQL 语句（如果提供）
    if (sql) {
      // 如果 SQL 太长，截断
      const displaySql = sql.length > 200 ? sql.substring(0, 200) + '...' : sql;
      // 转义单引号
      const escapedDisplaySql = displaySql.replace(/'/g, "\\'");
      parts.push(`-e '${escapedDisplaySql}'`);
    }

    return parts.join(' ');
  }

  /**
   * 记录数据库查询
   */
  logDatabaseQuery(
    requestId,
    queryId,
    sql,
    queryType = 'sql',
    dbConfig = null,
  ) {
    const logData = {
      requestId,
      queryId,
      queryType,
      sql: sql
        ? sql.length > 200
          ? sql.substring(0, 200) + '...'
          : sql
        : null,
    };

    // 如果提供了数据库配置，生成完整的 MySQL 命令
    if (dbConfig) {
      logData.mysqlCommand = this.generateMysqlCommand(dbConfig, sql);
      logData.connectionInfo = {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password, // 完整打印密码（不脱敏）
      };
    }

    // 跳过脱敏，完整记录数据库连接信息
    this.write('INFO', 'DB_QUERY', 'Executing database query', logData, true);
  }

  /**
   * 记录数据库查询结果
   */
  logDatabaseResult(requestId, queryId, rowCount, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error
      ? 'Database query failed'
      : 'Database query completed';

    this.write(level, 'DB_RESULT', message, {
      requestId,
      queryId,
      rowCount,
      error: error ? error.message : null,
    });
  }

  /**
   * 记录 Prometheus 查询
   */
  logPrometheusQuery(requestId, queryId, query, queryType) {
    this.write('INFO', 'PROMETHEUS_QUERY', 'Executing Prometheus query', {
      requestId,
      queryId,
      queryType,
      query: query
        ? query.length > 200
          ? query.substring(0, 200) + '...'
          : query
        : null,
    });
  }

  /**
   * 记录 Prometheus 查询结果
   */
  logPrometheusResult(requestId, queryId, resultSize, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error
      ? 'Prometheus query failed'
      : 'Prometheus query completed';

    this.write(level, 'PROMETHEUS_RESULT', message, {
      requestId,
      queryId,
      resultSize,
      error: error ? error.message : null,
    });
  }

  /**
   * 记录通用错误
   */
  logError(requestId, message, error) {
    this.write('ERROR', 'ERROR', message, {
      requestId,
      error: error.message,
      stack: error.stack,
    });
  }

  /**
   * 记录 SSH 命令执行
   */
  logSshCommand(requestId, nodeIp, nodeType, remoteCmd, fullCmd) {
    this.write(
      'INFO',
      'SSH_COMMAND',
      'Executing SSH command',
      {
        requestId,
        nodeIp,
        nodeType,
        remoteCommand: remoteCmd,
        fullSshCommand: fullCmd,
      },
      true,
    ); // skipSanitize=true 保留完整命令
  }

  /**
   * 记录 SSH 命令结果
   */
  logSshResult(
    requestId,
    nodeIp,
    nodeType,
    success,
    output,
    stderr,
    error,
    duration,
  ) {
    const level = success ? 'INFO' : 'ERROR';
    const message = success ? 'SSH command succeeded' : 'SSH command failed';
    this.write(
      level,
      'SSH_RESULT',
      message,
      {
        requestId,
        nodeIp,
        nodeType,
        success,
        output: output ? output.substring(0, 500) : null, // 限制输出长度
        stderr: stderr ? stderr.substring(0, 500) : null,
        error: error || null,
        durationMs: duration,
      },
      true,
    );
  }

  /**
   * 记录 CLI 命令执行
   */
  logCliCommand(requestId, command, metadata = {}) {
    this.write(
      'INFO',
      'CLI_COMMAND',
      'Executing CLI command',
      {
        requestId,
        command: command.substring(0, 500), // 限制命令长度
        ...metadata,
      },
      true,
    ); // skipSanitize=true 保留完整命令
  }

  /**
   * 记录 CLI 命令结果
   */
  logCliResult(requestId, command, success, output, error, duration, metadata = {}) {
    const level = success ? 'INFO' : 'ERROR';
    const message = success ? 'CLI command succeeded' : 'CLI command failed';
    this.write(
      level,
      'CLI_RESULT',
      message,
      {
        requestId,
        command: command.substring(0, 200), // 结果中命令简短显示
        success,
        output: output ? output.substring(0, 1000) : null, // CLI 输出可能较短，允许更多
        error: error || null,
        durationMs: duration,
        ...metadata,
      },
      true,
    );
  }

  /**
   * 记录环境变量
   */
  logEnvironmentVariables() {
    const envVars = {};
    const sortedKeys = Object.keys(process.env).sort();
    sortedKeys.forEach((key) => {
      envVars[key] = process.env[key];
    });

    // 跳过脱敏，完整记录所有环境变量
    this.write(
      'INFO',
      'STARTUP',
      'Environment variables at startup',
      {
        environmentVariables: envVars,
      },
      true,
    );
  }

  /**
   * 关闭日志流
   */
  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

class ThinMCPServer {
  constructor() {
    // 初始化 Logger
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const logDir = path.join(scriptDir, 'logs');

    // 从环境变量读取日志配置（默认启用）
    const loggingEnabled = process.env.ENABLE_LOGGING !== 'false';
    this.logger = new Logger(logDir, loggingEnabled);

    // 中心 API 配置
    this.centralAPI = process.env.CENTRAL_API || 'http://localhost:80';
    this.apiToken = process.env.CENTRAL_API_TOKEN || '';

    // 本地数据库配置
    this.dbConfig = {
      host: process.env.SR_HOST || 'localhost',
      user: process.env.SR_USER || 'root',
      password: process.env.SR_PASSWORD || '',
      port: parseInt(process.env.SR_PORT) || 9030,
    };

    // Prometheus 配置
    this.prometheusConfig = {
      protocol: process.env.PROMETHEUS_PROTOCOL || 'http',
      host: process.env.PROMETHEUS_HOST || 'localhost',
      port: parseInt(process.env.PROMETHEUS_PORT) || 9090,
    };

    // 工具缓存（避免重复请求 API）
    this.toolsCache = null;
    this.cacheTime = null;
    this.cacheTTL = 3600000; // 1小时缓存

    // 会话存储（用于分步执行时保存中间结果）
    this.sessionStorage = new Map();
    this.sessionTTL = 3600000; // 会话数据保留1小时

    console.error('🤖 Thin MCP Server initialized');
    console.error(`   Central API: ${this.centralAPI}`);
    console.error(`   Database: ${this.dbConfig.host}:${this.dbConfig.port}`);
    console.error(
      `   Prometheus: ${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}`,
    );
    console.error(`   Logging: ${loggingEnabled ? 'enabled' : 'disabled'}`);
    if (loggingEnabled) {
      console.error(`   Log directory: ${logDir}`);
    }

    // 打印所有环境变量到 console 和日志文件
    console.error('\n📋 Environment Variables:');
    const envVars = Object.keys(process.env).sort();
    envVars.forEach((key) => {
      console.error(`   ${key}=${process.env[key]}`);
    });

    // 记录环境变量到日志文件
    if (loggingEnabled) {
      this.logger.logEnvironmentVariables();
    }

    // 本地处理的 tools 列表（不需要中心服务器）
    this.localTools = {
      get_query_profile: true,  // get_query_profile 改为本地处理
      analyze_load_profile: true,  // analyze_load_profile 本地处理（不需要数据库连接）
      check_disk_io: true,  // check_disk_io 本地处理（查询本地 Prometheus）
    };
  }

  /**
   * 生成会话 ID
   */
  generateSessionId(toolName) {
    return `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 存储会话数据
   */
  storeSession(sessionId, data) {
    this.sessionStorage.set(sessionId, {
      data,
      timestamp: Date.now(),
    });
    // 清理过期会话
    this.cleanExpiredSessions();
    console.error(`   💾 会话已存储: ${sessionId}`);
  }

  /**
   * 获取会话数据
   */
  getSession(sessionId) {
    const session = this.sessionStorage.get(sessionId);
    if (!session) {
      console.error(`   ❌ 会话不存在: ${sessionId}`);
      return null;
    }
    if (Date.now() - session.timestamp > this.sessionTTL) {
      this.sessionStorage.delete(sessionId);
      console.error(`   ⏰ 会话已过期: ${sessionId}`);
      return null;
    }
    console.error(`   📂 会话已恢复: ${sessionId}`);
    return session.data;
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId) {
    this.sessionStorage.delete(sessionId);
    console.error(`   🗑️ 会话已删除: ${sessionId}`);
  }

  /**
   * 清理过期会话
   */
  cleanExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessionStorage.entries()) {
      if (now - session.timestamp > this.sessionTTL) {
        this.sessionStorage.delete(sessionId);
      }
    }
  }

  /**
   * 获取本地定义的 tools（不依赖中心服务器）
   */
  getLocalToolDefinitions() {
    return [
      {
        name: 'get_query_profile',
        description: '获取指定 Query ID 的执行 Profile，保存到本地文件并返回摘要信息。Profile 文件可用于后续详细分析。',
        inputSchema: {
          type: 'object',
          properties: {
            query_id: {
              type: 'string',
              description: 'Query ID，可以从 fe.audit.log 或 SHOW PROFILELIST 获取',
            },
          },
          required: ['query_id'],
        },
      },
      {
        name: 'analyze_load_profile',
        description: '📊 Load Profile 深度分析 - 分析本地 Load Profile 文件，使用 LLM 进行两阶段深度分析（瓶颈定位 + 根因分析）',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Load Profile 文件的本地路径',
            },
            profile_content: {
              type: 'string',
              description: 'Load Profile 的文本内容（直接提供，无需文件）',
            },
          },
          required: [],
        },
      },
      {
        name: 'check_disk_io',
        description: '🔍 检查磁盘 IO 利用率 - 查询 Prometheus 获取指定时间范围内 BE 节点 Spill 磁盘的 IO 利用率，用于诊断导入性能瓶颈',
        inputSchema: {
          type: 'object',
          properties: {
            start_time: {
              type: 'string',
              description: '开始时间，ISO 8601 格式（如 2025-12-13T16:53:20）',
            },
            end_time: {
              type: 'string',
              description: '结束时间，ISO 8601 格式（如 2025-12-13T17:14:26）',
            },
            be_addresses: {
              type: 'array',
              items: { type: 'string' },
              description: 'BE 节点 IP 地址列表（可选，不指定则查询所有节点）',
            },
          },
          required: ['start_time', 'end_time'],
        },
      },
    ];
  }

  /**
   * 本地处理 get_query_profile
   * 直接执行 SQL 获取 profile，写入本地文件，返回摘要
   */
  async handleGetQueryProfileLocally(args, requestId) {
    const { query_id } = args;

    if (!query_id) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ 错误: 缺少必需参数 query_id',
          },
        ],
      };
    }

    let connection;
    try {
      console.error(`   [${requestId}] Connecting to database...`);
      connection = await mysql.createConnection(this.dbConfig);

      // 禁用当前 session 的 profile 记录
      await connection.query("SET enable_profile = false");

      // 执行 SQL 获取 profile
      console.error(`   [${requestId}] Fetching profile for query_id: ${query_id}`);
      const [rows] = await connection.query(
        `SELECT get_query_profile('${query_id}') as profile`
      );

      if (!rows || rows.length === 0 || !rows[0].profile) {
        // Profile 不存在，检查 enable_profile 配置
        const [variables] = await connection.query("SHOW VARIABLES LIKE 'enable_profile'");
        const profileEnabled = variables?.[0]?.Value === 'true' || variables?.[0]?.Value === '1';

        let errorMsg = `❌ 无法获取 Query ID ${query_id} 的 Profile\n\n可能原因:\n`;
        if (!profileEnabled) {
          errorMsg += '1. ⚠️ Query Profile 当前未开启（建议: SET GLOBAL enable_profile = true）\n';
        }
        errorMsg += '2. Query ID 不存在或格式不正确\n';
        errorMsg += '3. FE 已重启，Profile 数据丢失（Profile 仅存储在内存中）\n';
        errorMsg += '4. Profile 已过期（内存保留时间有限）\n';
        errorMsg += '5. Query 尚未执行完成';

        return {
          content: [{ type: 'text', text: errorMsg }],
        };
      }

      const profile = rows[0].profile;

      // 提取摘要信息
      const summary = this.extractProfileSummary(profile);

      // 写入本地文件
      const profileDir = '/tmp/starrocks_profiles';
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }
      const filePath = path.join(profileDir, `profile_${query_id}.txt`);
      fs.writeFileSync(filePath, profile, 'utf-8');
      console.error(`   [${requestId}] Profile saved to: ${filePath}`);

      // 构建返回结果
      const resultText = this.formatProfileSummary(summary, filePath);

      return {
        content: [{ type: 'text', text: resultText }],
      };

    } catch (error) {
      console.error(`   [${requestId}] Error:`, error.message);
      return {
        content: [
          {
            type: 'text',
            text: `❌ 获取 Profile 失败: ${error.message}`,
          },
        ],
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * 本地处理 analyze_load_profile
   * 通过中心 API 分析 Load Profile（不需要数据库连接）
   */
  async handleAnalyzeLoadProfileLocally(args, requestId) {
    const { file_path, profile_path, profile_content, profile } = args;
    const filePath = file_path || profile_path;
    let profileText = profile_content || profile;

    // 如果没有直接提供内容，尝试从文件读取
    if (!profileText && filePath) {
      try {
        console.error(`   [${requestId}] Reading Load Profile from: ${filePath}`);
        profileText = fs.readFileSync(filePath, 'utf-8');
        console.error(`   [${requestId}] Profile loaded: ${(profileText.length / 1024).toFixed(2)} KB`);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 读取文件失败: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (!profileText) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ 错误: 缺少必需参数 file_path 或 profile_content',
          },
        ],
        isError: true,
      };
    }

    try {
      // 调用中心 API 进行分析
      console.error(`   [${requestId}] Sending to Central API for analysis...`);
      const analysis = await this.analyzeResultsWithAPI(
        'analyze_load_profile',
        {},
        { profile_content: profileText, file_path: filePath },
        requestId
      );

      // 格式化输出
      const report = this.formatLoadProfileAnalysis(analysis);

      return {
        content: [
          {
            type: 'text',
            text: report,
          },
        ],
      };
    } catch (error) {
      console.error(`   [${requestId}] Analysis failed:`, error.message);
      return {
        content: [
          {
            type: 'text',
            text: `❌ 分析失败: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 格式化 Load Profile 分析结果
   */
  formatLoadProfileAnalysis(analysis) {
    if (analysis.status === 'error') {
      return `❌ 分析失败: ${analysis.message}`;
    }

    let report = '';
    report += '================================================================================\n';
    report += '                     第一阶段：瓶颈定位与概括分析\n';
    report += '================================================================================\n\n';

    if (analysis.stage1_bottleneck) {
      const b = analysis.stage1_bottleneck;
      report += `【结构化结果】\n`;
      report += `  瓶颈阶段: ${b.stage}\n`;
      report += `  置信度:   ${b.confidence}\n`;
      report += `  存在反压: ${b.is_backpressure ? '是' : '否'}\n`;
      report += `  触发Spill: ${b.has_spill ? '是' : '否'}\n\n`;
      report += `【概括性分析】\n${b.summary || '(无)'}\n\n`;
    }

    report += '================================================================================\n';
    report += '                     第二阶段：深入分析与优化建议\n';
    report += '================================================================================\n\n';

    if (analysis.stage2_analysis) {
      report += analysis.stage2_analysis + '\n\n';
    }

    if (analysis.profile_summary) {
      report += '================================================================================\n';
      report += '                            基础指标\n';
      report += '================================================================================\n\n';
      const s = analysis.profile_summary;
      report += `总耗时: ${s.total_time || 'N/A'}\n`;
      report += `扫描数据量: ${s.scan_bytes || 'N/A'}\n`;
      report += `吞吐量: ${s.throughput?.bytesPerSecondFormatted || 'N/A'}\n\n`;
    }

    if (analysis.tokens) {
      report += '================================================================================\n';
      report += '                            Token 统计\n';
      report += '================================================================================\n\n';
      report += `第一阶段: ${analysis.tokens.stage1 || 'N/A'}\n`;
      report += `第二阶段: ${analysis.tokens.stage2 || 'N/A'}\n`;
      report += `总计: ${analysis.tokens.total || 'N/A'}\n`;
    }

    return report;
  }

  /**
   * 从 Profile 文本中提取摘要信息
   */
  extractProfileSummary(profileText) {
    const summary = {
      queryId: null,
      startTime: null,
      endTime: null,
      duration: null,
      queryState: null,
      queryType: null,
      defaultDb: null,
      sqlStatement: null,
      fragmentCount: 0,
      peakMemory: null,
      cpuTime: null,
      scanTime: null,
    };

    // 提取 Query ID
    const queryIdMatch = profileText.match(/Query ID:\s*([^\n]+)/);
    if (queryIdMatch) summary.queryId = queryIdMatch[1].trim();

    // 提取 Start Time
    const startTimeMatch = profileText.match(/Start Time:\s*([^\n]+)/);
    if (startTimeMatch) summary.startTime = startTimeMatch[1].trim();

    // 提取 End Time
    const endTimeMatch = profileText.match(/End Time:\s*([^\n]+)/);
    if (endTimeMatch) summary.endTime = endTimeMatch[1].trim();

    // 提取 Total Duration
    const totalMatch = profileText.match(/Total:\s*([^\n]+)/);
    if (totalMatch) summary.duration = totalMatch[1].trim();

    // 提取 Query State
    const stateMatch = profileText.match(/Query State:\s*([^\n]+)/);
    if (stateMatch) summary.queryState = stateMatch[1].trim();

    // 提取 Query Type
    const typeMatch = profileText.match(/Query Type:\s*([^\n]+)/);
    if (typeMatch) summary.queryType = typeMatch[1].trim();

    // 提取 Default Db
    const dbMatch = profileText.match(/Default Db:\s*([^\n]+)/);
    if (dbMatch) summary.defaultDb = dbMatch[1].trim();

    // 提取 SQL Statement（限制长度）
    const sqlMatch = profileText.match(/Sql Statement:\s*([\s\S]*?)(?=\n\s+-\s+(?:Warehouse|Variables|NonDefault))/);
    if (sqlMatch) {
      let sql = sqlMatch[1].trim();
      if (sql.length > 500) {
        sql = sql.substring(0, 500) + '...';
      }
      summary.sqlStatement = sql;
    }

    // 统计 Fragment 数量
    const fragmentMatches = profileText.match(/Fragment \d+:/g);
    if (fragmentMatches) summary.fragmentCount = fragmentMatches.length;

    // 提取 Peak Memory
    const memMatch = profileText.match(/QueryPeakMemoryUsagePerNode:\s*([^\n]+)/);
    if (memMatch) summary.peakMemory = memMatch[1].trim();

    // 提取 CPU Time
    const cpuMatch = profileText.match(/QueryCumulativeCpuTime:\s*([^\n]+)/);
    if (cpuMatch) summary.cpuTime = cpuMatch[1].trim();

    // 提取 Scan Time
    const scanMatch = profileText.match(/QueryCumulativeScanTime:\s*([^\n]+)/);
    if (scanMatch) summary.scanTime = scanMatch[1].trim();

    return summary;
  }

  /**
   * 格式化 Profile 摘要输出
   */
  formatProfileSummary(summary, filePath) {
    let result = '📊 **Query Profile 摘要**\n\n';

    result += '### 基本信息\n';
    result += `- **Query ID**: ${summary.queryId || 'N/A'}\n`;
    result += `- **状态**: ${summary.queryState || 'N/A'}\n`;
    result += `- **类型**: ${summary.queryType || 'N/A'}\n`;
    result += `- **数据库**: ${summary.defaultDb || 'N/A'}\n`;
    result += `- **开始时间**: ${summary.startTime || 'N/A'}\n`;
    result += `- **结束时间**: ${summary.endTime || 'N/A'}\n`;
    result += `- **总耗时**: ${summary.duration || 'N/A'}\n`;

    result += '\n### 资源使用\n';
    result += `- **Fragment 数量**: ${summary.fragmentCount}\n`;
    result += `- **峰值内存**: ${summary.peakMemory || 'N/A'}\n`;
    result += `- **CPU 时间**: ${summary.cpuTime || 'N/A'}\n`;
    result += `- **扫描时间**: ${summary.scanTime || 'N/A'}\n`;

    if (summary.sqlStatement) {
      result += '\n### SQL 语句\n';
      result += '```sql\n' + summary.sqlStatement + '\n```\n';
    }

    result += '\n### Profile 文件\n';
    result += `完整 Profile 已保存到: \`${filePath}\`\n\n`;
    result += '💡 **提示**: 使用 Read 工具读取上述文件可查看完整 Profile 进行详细分析。\n';

    return result;
  }

  /**
   * 本地处理 check_disk_io
   * 查询 Prometheus 获取指定时间范围的磁盘 IO 利用率
   * 只查询 BE 节点 spill_local_storage_dir 对应的磁盘
   */
  async handleCheckDiskIOLocally(args, requestId) {
    const { start_time, end_time, be_addresses } = args;

    // 验证必需参数
    if (!start_time || !end_time) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ 错误: 缺少必需参数 start_time 或 end_time',
          },
        ],
        isError: true,
      };
    }

    try {
      // 解析时间为 Unix 时间戳
      const startTs = Math.floor(new Date(start_time).getTime() / 1000);
      const endTs = Math.floor(new Date(end_time).getTime() / 1000);

      if (isNaN(startTs) || isNaN(endTs)) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ 错误: 时间格式无效，请使用 ISO 8601 格式（如 2025-12-12T07:12:46）',
            },
          ],
          isError: true,
        };
      }

      console.error(`   [${requestId}] Checking disk IO for Spill storage...`);
      console.error(`   Time range: ${start_time} to ${end_time}`);
      console.error(`   BE addresses: ${be_addresses?.join(', ') || 'all'}`);

      // Step 1: 查询 BE 配置获取 spill_local_storage_dir
      console.error(`   [${requestId}] Step 1: Querying BE spill_local_storage_dir config...`);
      const spillConfigs = await this.getSpillStorageConfigs(be_addresses);

      if (spillConfigs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ 未找到 BE 的 spill_local_storage_dir 配置\n\n可能原因:\n1. BE 节点不可用\n2. 没有配置 spill_local_storage_dir',
            },
          ],
        };
      }

      // Step 2: 通过 SSH 获取 spill 目录对应的磁盘设备
      console.error(`   [${requestId}] Step 2: Detecting disk devices via SSH...`);
      const diskDevices = await this.detectSpillDiskDevices(spillConfigs, requestId);

      if (diskDevices.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '⚠️ 无法检测 Spill 存储对应的磁盘设备\n\n可能原因:\n1. SSH 连接失败\n2. spill_local_storage_dir 路径不存在',
            },
          ],
        };
      }

      console.error(`   [${requestId}] Detected Spill disk devices: ${diskDevices.map(d => `${d.beIp}(${d.hostname}):${d.device}`).join(', ')}`);

      // 将 diskDevices 数组转换为 hostname -> device 映射
      const diskDeviceMap = {};
      for (const d of diskDevices) {
        diskDeviceMap[d.hostname] = d.device;
        diskDeviceMap[d.beIp] = d.device;
        const config = spillConfigs.find(c => c.beIp === d.beIp);
        if (config) {
          config.diskDevice = d.device;
          config.hostname = d.hostname;
        }
      }

      // Step 3: 自动检测 Prometheus scrape_interval
      console.error(`   [${requestId}] Step 3: Detecting Prometheus scrape_interval...`);
      const { step, rateWindow, scrapeInterval } = await this.getPrometheusScrapeInterval(requestId);

      // Step 4: 查询 Prometheus 获取对应磁盘的 IO
      console.error(`   [${requestId}] Step 4: Querying Prometheus for disk IO...`);
      const baseUrl = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}`;

      const ioUtilQuery = `rate(node_disk_io_time_seconds_total[${rateWindow}]) * 100`;
      const expectedDataPoints = Math.floor((endTs - startTs) / scrapeInterval);
      console.error(`   [${requestId}] Duration: ${endTs - startTs}s, step: ${step}, rateWindow: ${rateWindow}, expected data points: ~${expectedDataPoints}`);

      const params = new URLSearchParams({
        query: ioUtilQuery,
        start: startTs.toString(),
        end: endTs.toString(),
        step: step,
      });

      const response = await fetch(`${baseUrl}/api/v1/query_range?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Prometheus API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status !== 'success') {
        throw new Error(`Prometheus query failed: ${data.error || 'unknown error'}`);
      }

      const results = data.data?.result || [];

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ 未找到磁盘 IO 数据\n\n可能原因:\n1. Node Exporter 未部署或未配置\n2. 时间范围内没有数据\n3. Prometheus 未收集 node_disk_io_time_seconds_total 指标`,
            },
          ],
        };
      }

      // Step 5: 分析结果（只保留 Spill 磁盘）
      const analysis = this.analyzeDiskIOResults(results, be_addresses, diskDeviceMap);

      // 格式化输出
      const report = this.formatDiskIOReport(analysis, start_time, end_time, spillConfigs);

      return {
        content: [
          {
            type: 'text',
            text: report,
          },
        ],
      };

    } catch (error) {
      console.error(`   [${requestId}] Error:`, error.message);
      return {
        content: [
          {
            type: 'text',
            text: `❌ 查询磁盘 IO 失败: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * 自动检测 Prometheus 的 scrape_interval
   */
  async getPrometheusScrapeInterval(requestId) {
    const baseUrl = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}`;

    try {
      const response = await fetch(`${baseUrl}/api/v1/targets`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error(`   [${requestId}] Failed to get Prometheus targets: ${response.status}`);
        return { step: '15s', rateWindow: '45s', scrapeInterval: 15 };
      }

      const data = await response.json();
      if (data.status !== 'success') {
        return { step: '15s', rateWindow: '45s', scrapeInterval: 15 };
      }

      const activeTargets = data.data?.activeTargets || [];
      let scrapeInterval = null;

      for (const target of activeTargets) {
        const jobName = target.labels?.job || '';
        if (jobName.toLowerCase().includes('node') ||
            target.scrapePool?.toLowerCase().includes('node')) {
          const intervalStr = target.scrapeInterval || '';
          scrapeInterval = this.parsePrometheusDuration(intervalStr);
          if (scrapeInterval > 0) {
            console.error(`   [${requestId}] Detected node_exporter scrape_interval: ${intervalStr} (${scrapeInterval}s)`);
            break;
          }
        }
      }

      if (!scrapeInterval || scrapeInterval <= 0) {
        scrapeInterval = 15;
        console.error(`   [${requestId}] Using default scrape_interval: 15s`);
      }

      const step = `${scrapeInterval}s`;
      const rateWindow = `${scrapeInterval * 3}s`;

      return { step, rateWindow, scrapeInterval };

    } catch (error) {
      console.error(`   [${requestId}] Error detecting scrape_interval:`, error.message);
      return { step: '15s', rateWindow: '45s', scrapeInterval: 15 };
    }
  }

  /**
   * 解析 Prometheus 时间间隔字符串（返回秒数）
   */
  parsePrometheusDuration(durationStr) {
    if (!durationStr) return 0;
    const match = durationStr.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)$/);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2];
    switch (unit) {
      case 'ms': return value / 1000;
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      default: return 0;
    }
  }

  /**
   * 查询 BE 的 spill_local_storage_dir 配置
   */
  async getSpillStorageConfigs(beAddresses) {
    const connection = await mysql.createConnection(this.dbConfig);
    try {
      let nodesMap = {};
      try {
        const [backends] = await connection.query('SHOW BACKENDS');
        for (const be of backends) {
          nodesMap[be.BackendId || be.Id] = be.IP || be.Host;
        }
      } catch (e) { /* ignore */ }

      if (Object.keys(nodesMap).length === 0) {
        try {
          const [computeNodes] = await connection.query('SHOW COMPUTE NODES');
          for (const cn of computeNodes) {
            nodesMap[cn.ComputeNodeId || cn.Id] = cn.IP || cn.Host;
          }
        } catch (e) { /* ignore */ }
      }

      const [spillRows] = await connection.query(`
        SELECT BE_ID, VALUE as spill_path
        FROM information_schema.be_configs
        WHERE NAME = 'spill_local_storage_dir'
      `);

      let configs = [];
      for (const row of spillRows) {
        const beIp = nodesMap[row.BE_ID];
        if (beIp && row.spill_path) {
          configs.push({
            beId: row.BE_ID,
            beIp: beIp,
            spillPath: row.spill_path,
          });
        }
      }

      if (beAddresses && beAddresses.length > 0) {
        configs = configs.filter(c => beAddresses.includes(c.beIp));
      }

      return configs;
    } finally {
      await connection.end();
    }
  }

  /**
   * 通过 SSH 检测 spill 目录对应的磁盘设备
   */
  async detectSpillDiskDevices(spillConfigs, requestId) {
    const sshCommands = spillConfigs.map(config => ({
      node_ip: config.beIp,
      node_type: 'BE',
      ssh_command: `echo "$(df "${config.spillPath}" 2>/dev/null | tail -1 | awk '{print $1}')|$(hostname)"`,
    }));

    const sshResults = await this.executeSshCommands(sshCommands, {}, requestId);

    const devices = [];
    for (const result of sshResults.ssh_results) {
      if (result.success && result.output) {
        const parts = result.output.trim().split('|');
        const devicePath = parts[0] || '';
        const hostname = parts[1] || '';

        const match = devicePath.match(/\/dev\/([a-z]+)/);
        if (match) {
          devices.push({
            beIp: result.node_ip,
            hostname: hostname,
            devicePath: devicePath,
            device: match[1],
            spillPath: spillConfigs.find(c => c.beIp === result.node_ip)?.spillPath,
          });
        }
      }
    }

    return devices;
  }

  /**
   * 分析磁盘 IO 查询结果
   */
  analyzeDiskIOResults(results, beAddresses, diskDevices = null) {
    const analysis = {
      devices: [],
      summary: {
        maxIOUtil: 0,
        avgIOUtil: 0,
        highIOCount: 0,
        totalDataPoints: 0,
      },
    };

    for (const result of results) {
      const metric = result.metric || {};
      const values = result.values || [];
      const instance = metric.instance || 'unknown';
      const device = metric.device || 'unknown';

      if (device.startsWith('loop') || device.startsWith('dm-')) {
        continue;
      }

      const instanceHost = instance.split(':')[0];

      if (diskDevices && Object.keys(diskDevices).length > 0) {
        const spillDeviceNames = Object.values(diskDevices);
        const spillDevice = diskDevices[instanceHost];

        if (spillDevice) {
          if (device !== spillDevice) continue;
        } else {
          if (!spillDeviceNames.includes(device)) continue;
        }
      } else if (beAddresses && beAddresses.length > 0) {
        if (!beAddresses.includes(instanceHost)) continue;
      }

      const ioValues = values.map(v => parseFloat(v[1])).filter(v => !isNaN(v));
      if (ioValues.length === 0) continue;

      const maxIO = Math.max(...ioValues);
      const avgIO = ioValues.reduce((a, b) => a + b, 0) / ioValues.length;
      const highIOCount = ioValues.filter(v => v > 80).length;

      analysis.devices.push({
        instance,
        device,
        maxIOUtil: maxIO.toFixed(2),
        avgIOUtil: avgIO.toFixed(2),
        highIOCount,
        dataPoints: ioValues.length,
      });

      analysis.summary.maxIOUtil = Math.max(analysis.summary.maxIOUtil, maxIO);
      analysis.summary.totalDataPoints += ioValues.length;
      analysis.summary.highIOCount += highIOCount;
    }

    if (analysis.devices.length > 0) {
      const totalAvg = analysis.devices.reduce((sum, d) => sum + parseFloat(d.avgIOUtil), 0);
      analysis.summary.avgIOUtil = (totalAvg / analysis.devices.length).toFixed(2);
    }

    analysis.devices.sort((a, b) => parseFloat(b.maxIOUtil) - parseFloat(a.maxIOUtil));
    return analysis;
  }

  /**
   * 格式化磁盘 IO 报告
   */
  formatDiskIOReport(analysis, startTime, endTime, spillConfigs = null) {
    let report = '';
    report += '================================================================================\n';
    report += '                        📈 磁盘 IO 利用率分析报告（Spill 磁盘）\n';
    report += '================================================================================\n\n';

    report += `📅 时间范围: ${startTime} ~ ${endTime}\n\n`;

    if (spillConfigs && spillConfigs.length > 0) {
      report += '【Spill 存储配置】\n';
      for (const config of spillConfigs) {
        const hostInfo = config.hostname ? ` (${config.hostname})` : '';
        const deviceInfo = config.diskDevice ? ` → 磁盘: ${config.diskDevice}` : '';
        report += `   ${config.beIp}${hostInfo}: ${config.spillPath}${deviceInfo}\n`;
      }
      report += '\n';
    }

    report += '【汇总】\n';
    report += `   最大 IO 利用率: ${analysis.summary.maxIOUtil.toFixed(2)}%\n`;
    report += `   平均 IO 利用率: ${analysis.summary.avgIOUtil}%\n`;
    report += `   高负载次数 (>80%): ${analysis.summary.highIOCount}\n`;
    report += `   监控设备数: ${analysis.devices.length}\n\n`;

    const maxIO = analysis.summary.maxIOUtil;
    if (maxIO > 90) {
      report += '🔴 **磁盘 IO 利用率极高，存在严重瓶颈！**\n\n';
    } else if (maxIO > 70) {
      report += '🟡 **磁盘 IO 利用率较高，可能存在瓶颈**\n\n';
    } else {
      report += '✅ **磁盘 IO 利用率正常，未检测到明显瓶颈**\n\n';
    }

    if (analysis.devices.length > 0) {
      report += '【各设备详情】\n';
      report += '┌──────────────────────────────┬──────────┬──────────┬──────────┬────────────┐\n';
      report += '│ 实例/设备                     │ 最大(%)  │ 平均(%)  │ 高负载次数│ 数据点数   │\n';
      report += '├──────────────────────────────┼──────────┼──────────┼──────────┼────────────┤\n';

      for (const d of analysis.devices) {
        const instDev = `${d.instance.split(':')[0]}/${d.device}`.padEnd(28);
        const maxVal = d.maxIOUtil.padStart(6);
        const avgVal = d.avgIOUtil.padStart(6);
        const highCount = String(d.highIOCount).padStart(6);
        const dataPoints = String(d.dataPoints).padStart(8);
        report += `│ ${instDev} │ ${maxVal}   │ ${avgVal}   │ ${highCount}   │ ${dataPoints}   │\n`;
      }

      report += '└──────────────────────────────┴──────────┴──────────┴──────────┴────────────┘\n';
    }

    return report;
  }


  /**
   * 从中心 API 获取工具列表
   */
  async getToolsFromAPI() {
    // 检查缓存
    if (this.toolsCache && Date.now() - this.cacheTime < this.cacheTTL) {
      return this.toolsCache;
    }

    try {
      const url = `${this.centralAPI}/api/tools`;
      const headers = {};
      if (this.apiToken) {
        headers['X-API-Key'] = this.apiToken;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      // 更新缓存
      this.toolsCache = data.tools;
      this.cacheTime = Date.now();

      return data.tools;
    } catch (error) {
      console.error('Failed to fetch tools from API:', error.message);

      // 如果有缓存，返回缓存
      if (this.toolsCache) {
        console.error('Using cached tools due to API error');
        return this.toolsCache;
      }

      // 返回空列表
      return [];
    }
  }

  /**
   * 递归调用 Solution C 工具（用于工具间调用）
   * 执行完整的工具处理流程：获取查询 -> 执行 SQL -> 分析结果
   */
  async handleSolutionCTool(toolName, args = {}, requestId = null) {
    console.error(`   [Tool-to-Tool] Calling ${toolName}...`);
    console.error(`   [Tool-to-Tool] Received args: ${JSON.stringify(args)}`);
    console.error(`   [Tool-to-Tool] context_lines = ${args.context_lines}`);
    // DEBUG: 写入日志文件
    fs.appendFileSync('/tmp/mcp-debug.log', `\n[${new Date().toISOString()}] handleSolutionCTool(${toolName})\n  args: ${JSON.stringify(args)}\n  context_lines: ${args.context_lines}\n`);

    try {
      // 1. 从中心 API 获取 SQL 查询定义
      const queryDef = await this.getQueriesFromAPI(toolName, args, requestId);
      console.error(`   [Tool-to-Tool] Got ${queryDef.queries.length} queries`);

      // 2. 执行 SQL 查询
      let results = {};
      const regularQueries = queryDef.queries.filter(q => q.type !== 'meta');
      if (regularQueries.length > 0) {
        results = await this.executeQueries(regularQueries, requestId);
      }

      // 3. 发送给中心 API 分析（支持多阶段）
      let analysis = await this.analyzeResultsWithAPI(
        toolName,
        results,
        args,
        requestId,
      );

      // 4. 处理多阶段查询
      let phaseCount = 1;
      const maxPhases = 5;
      while (analysis.status === 'needs_more_queries' && phaseCount < maxPhases) {
        phaseCount++;
        console.error(`   [Tool-to-Tool] Phase ${phaseCount}: ${analysis.phase}`);

        // 执行 SSH 命令（如果需要）
        if (analysis.requires_ssh_execution && analysis.ssh_commands) {
          const sshResults = await this.executeSshCommands(
            analysis.ssh_commands,
            args,
            requestId,
          );

          // 根据 phase 存储结果
          if (analysis.phase === 'discover_log_paths') {
            results.discovered_log_paths = sshResults.ssh_results;
          } else if (analysis.phase === 'fetch_logs') {
            results.log_contents = sshResults.ssh_results;
          } else {
            results = { ...results, ...sshResults };
          }
        }

        // 执行额外的 SQL 查询（如果需要）
        if (analysis.next_queries && analysis.next_queries.length > 0) {
          const additionalResults = await this.executeQueries(
            analysis.next_queries,
            requestId,
          );
          results = { ...results, ...additionalResults };
        }

        // 重新分析
        const nextArgs = analysis.next_args || args;
        analysis = await this.analyzeResultsWithAPI(
          toolName,
          results,
          nextArgs,
          requestId,
        );
      }

      console.error(`   [Tool-to-Tool] ${toolName} completed with status: ${analysis.status}`);
      return analysis;
    } catch (error) {
      console.error(`   [Tool-to-Tool] ${toolName} failed: ${error.message}`);
      return {
        status: 'error',
        error: error.message,
        tool: toolName,
      };
    }
  }

  /**
   * 从中心 API 获取 SQL 查询定义
   */
  async getQueriesFromAPI(toolName, args = {}, requestId = null) {
    const url = `${this.centralAPI}/api/queries/${toolName}`;

    try {
      // 使用 POST 请求，将 args 放在请求体中避免 URL 过长
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.apiToken) {
        headers['X-API-Key'] = this.apiToken;
      }

      const body = { args };

      // 记录中心服务器请求
      if (requestId) {
        this.logger.logCentralRequest(requestId, 'POST', url, body);
      }

      console.error(`   Fetching queries from: ${url}`);
      console.error(`   Args size: ${JSON.stringify(args).length} characters`);

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
        // 记录失败响应
        if (requestId) {
          this.logger.logCentralResponse(
            requestId,
            url,
            response.status,
            null,
            error,
          );
        }
        throw error;
      }

      const data = await response.json();

      // 记录成功响应
      if (requestId) {
        this.logger.logCentralResponse(requestId, url, response.status, data);
      }

      return data;
    } catch (error) {
      throw new Error(
        `Failed to get queries for ${toolName}: ${error.message}`,
      );
    }
  }

  /**
   * 执行查询（SQL + Prometheus）
   */
  async executeQueries(queries, requestId = null) {
    const results = {};
    let connection = null;

    // 分离 SQL 查询和 Prometheus 查询
    const sqlQueries = queries.filter((q) => q.type === 'sql' || !q.type);
    const prometheusQueries = queries.filter(
      (q) => q.type === 'prometheus_range' || q.type === 'prometheus_instant',
    );

    // 执行 SQL 查询
    if (sqlQueries.length > 0) {
      try {
        connection = await mysql.createConnection(this.dbConfig);
        // 禁用当前 session 的 profile 记录，避免系统查询挤掉用户查询的 profile
        await connection.query('SET enable_profile = false');
        console.error('   Disabled profile recording for this session');
        for (const query of sqlQueries) {
          try {
            console.error(`Executing SQL query: ${query.id}`);

            // 记录数据库查询（包含完整的 MySQL 命令）
            if (requestId) {
              this.logger.logDatabaseQuery(
                requestId,
                query.id,
                query.sql,
                'sql',
                this.dbConfig,
              );
            }

            const [rows] = await connection.query(query.sql);
            results[query.id] = rows;

            // 记录查询结果
            if (requestId) {
              this.logger.logDatabaseResult(
                requestId,
                query.id,
                Array.isArray(rows) ? rows.length : 0,
              );
            }
          } catch (error) {
            console.error(`SQL Query ${query.id} failed:`, error.message);

            // 记录查询失败
            if (requestId) {
              this.logger.logDatabaseResult(requestId, query.id, 0, error);
            }

            results[query.id] = {
              error: error.message,
              sql: query.sql ? query.sql.substring(0, 100) + '...' : 'N/A',
            };
          }
        }
      } finally {
        if (connection) await connection.end();
      }
    }

    // 执行 Prometheus 查询
    for (const query of prometheusQueries) {
      try {
        console.error(
          `Executing Prometheus query: ${query.id} (${query.type})`,
        );

        // 记录 Prometheus 查询
        if (requestId) {
          this.logger.logPrometheusQuery(
            requestId,
            query.id,
            query.query,
            query.type,
          );
        }

        if (query.type === 'prometheus_range') {
          results[query.id] = await this.queryPrometheusRange(query);
        } else {
          results[query.id] = await this.queryPrometheusInstant(query);
        }

        // 记录查询结果
        if (requestId) {
          const resultSize = results[query.id]
            ? JSON.stringify(results[query.id]).length
            : 0;
          this.logger.logPrometheusResult(requestId, query.id, resultSize);
        }
      } catch (error) {
        console.error(`Prometheus Query ${query.id} failed:`, error.message);

        // 记录查询失败
        if (requestId) {
          this.logger.logPrometheusResult(requestId, query.id, 0, error);
        }

        results[query.id] = {
          error: error.message,
          query: query.query ? query.query.substring(0, 100) + '...' : 'N/A',
        };
      }
    }

    return results;
  }

  /**
   * 查询 Prometheus 即时数据
   */
  async queryPrometheusInstant(queryDef) {
    const baseUrl = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}`;
    const url = `${baseUrl}/api/v1/query`;

    const params = new URLSearchParams({
      query: queryDef.query,
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `Prometheus API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error(
        `Prometheus query failed: ${data.error || 'unknown error'}`,
      );
    }

    return data.data;
  }

  /**
   * 查询 Prometheus 范围数据
   */
  async queryPrometheusRange(queryDef) {
    const baseUrl = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}`;
    const url = `${baseUrl}/api/v1/query_range`;

    // 解析时间范围
    const now = Math.floor(Date.now() / 1000);
    let startTime = now - 3600; // 默认 1 小时

    const timeRange = queryDef.start || '1h';
    const rangeMatch = timeRange.match(/^(\d+)([hmd])$/);
    if (rangeMatch) {
      const value = parseInt(rangeMatch[1]);
      const unit = rangeMatch[2];
      switch (unit) {
        case 'h':
          startTime = now - value * 3600;
          break;
        case 'm':
          startTime = now - value * 60;
          break;
        case 'd':
          startTime = now - value * 86400;
          break;
      }
    }

    const params = new URLSearchParams({
      query: queryDef.query,
      start: startTime.toString(),
      end: now.toString(),
      step: queryDef.step || '1m',
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `Prometheus API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error(
        `Prometheus query failed: ${data.error || 'unknown error'}`,
      );
    }

    return data.data;
  }

  /**
   * 执行 CLI 命令（用于对象存储空间查询等场景）
   * @param {Array} commands - CLI 命令列表
   * @param {string} requestId - 请求 ID（用于日志记录）
   * @returns {Object} 执行结果
   */
  async executeCliCommands(commands, requestId = null) {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const results = {
      cli_results: [],
      cli_summary: {
        total: commands.length,
        successful: 0,
        failed: 0,
        execution_time_ms: 0,
      },
    };

    const startTime = Date.now();
    const maxConcurrency = 10;
    const commandTimeoutMs = 30000; // 30 秒超时

    // 分批并发执行
    for (let i = 0; i < commands.length; i += maxConcurrency) {
      const batch = commands.slice(i, i + maxConcurrency);

      const batchResults = await Promise.all(
        batch.map(async (cmd) => {
          const cmdType = cmd.type || '';
          const cmdKey = cmd.partition_key || cmd.table_key || cmd.path;

          // 记录 CLI 命令到日志
          if (requestId) {
            this.logger.logCliCommand(requestId, cmd.command, {
              type: cmdType,
              key: cmdKey,
              storageType: cmd.storage_type,
            });
          }

          const cmdStartTime = Date.now();
          try {
            console.error(
              `   Executing CLI: ${cmd.command.substring(0, 80)}...`,
            );

            const { stdout } = await execAsync(cmd.command, {
              timeout: commandTimeoutMs,
              maxBuffer: 10 * 1024 * 1024, // 10MB
            });

            const duration = Date.now() - cmdStartTime;

            // 根据命令类型返回不同格式的结果
            if (cmdType === 'ossutil_ls' || cmdType === 'aws_s3_ls') {
              // 记录成功结果
              if (requestId) {
                this.logger.logCliResult(requestId, cmd.command, true, stdout, null, duration, {
                  type: cmdType,
                  key: cmdKey,
                });
              }
              // 列目录命令：返回原始输出
              return {
                table_key: cmd.table_key,
                table_path: cmd.table_path,
                storage_type: cmd.storage_type,
                type: cmdType,
                success: true,
                output: stdout,
                execution_time_ms: duration,
              };
            } else if (cmdType === 'get_size') {
              // 记录成功结果
              if (requestId) {
                this.logger.logCliResult(requestId, cmd.command, true, stdout.trim(), null, duration, {
                  type: cmdType,
                  key: cmdKey,
                });
              }
              // 获取大小命令：返回原始输出供 expert 解析
              return {
                table_key: cmd.table_key,
                partition_id: cmd.partition_id,
                path: cmd.path,
                storage_type: cmd.storage_type,
                success: true,
                output: stdout.trim(),
                execution_time_ms: duration,
              };
            } else {
              // 存储空间查询命令（默认）：解析大小
              const sizeBytes = this.parseStorageCliOutput(
                cmd.storage_type || cmd.actual_storage_type,
                stdout,
              );
              // 记录成功结果
              if (requestId) {
                this.logger.logCliResult(requestId, cmd.command, sizeBytes !== null, stdout, null, duration, {
                  type: cmdType,
                  key: cmdKey,
                  sizeBytes,
                });
              }
              return {
                partition_key: cmd.partition_key,
                path: cmd.path,
                storage_type: cmd.storage_type,
                success: sizeBytes !== null,
                size_bytes: sizeBytes,
                execution_time_ms: duration,
              };
            }
          } catch (error) {
            const duration = Date.now() - cmdStartTime;
            console.error(
              `   CLI failed for ${cmdKey}: ${error.message}`,
            );

            // 记录失败结果
            if (requestId) {
              this.logger.logCliResult(requestId, cmd.command, false, null, error.message, duration, {
                type: cmdType,
                key: cmdKey,
              });
            }

            if (cmdType === 'ossutil_ls' || cmdType === 'aws_s3_ls') {
              return {
                table_key: cmd.table_key,
                table_path: cmd.table_path,
                storage_type: cmd.storage_type,
                type: cmdType,
                success: false,
                error: error.message,
              };
            } else if (cmdType === 'get_size') {
              return {
                table_key: cmd.table_key,
                partition_id: cmd.partition_id,
                path: cmd.path,
                storage_type: cmd.storage_type,
                success: false,
                error: error.message,
              };
            } else {
              return {
                partition_key: cmd.partition_key,
                path: cmd.path,
                storage_type: cmd.storage_type,
                success: false,
                error: error.message,
              };
            }
          }
        }),
      );

      for (const result of batchResults) {
        results.cli_results.push(result);
        if (result.success) {
          results.cli_summary.successful++;
        } else {
          results.cli_summary.failed++;
        }
      }
    }

    results.cli_summary.execution_time_ms = Date.now() - startTime;
    console.error(
      `   CLI execution completed: ${results.cli_summary.successful} success, ${results.cli_summary.failed} failed`,
    );

    return results;
  }

  /**
   * 执行 SSH 命令（用于日志分析等场景）
   * @param {Array} commands - SSH 命令列表
   * @param {object} sshConfig - SSH 配置 { user, keyPath, password }
   * @param {string} requestId - 请求 ID（用于日志追踪）
   */
  async executeSshCommands(commands, sshConfig = {}, requestId = null) {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const results = {
      ssh_results: [],
      ssh_summary: {
        total: commands.length,
        successful: 0,
        failed: 0,
        execution_time_ms: 0,
      },
    };

    const startTime = Date.now();
    const maxConcurrency = 5; // SSH 连接并发数较低
    const commandTimeoutMs = 60000; // 60 秒超时（SSH 可能需要更长时间）

    // 获取 SSH 配置（默认使用当前系统用户）
    const sshUser =
      sshConfig.ssh_user || process.env.SSH_USER || os.userInfo().username;
    const sshKeyPath = sshConfig.ssh_key_path || process.env.SSH_KEY_PATH || '';
    // 注意：密码模式需要 sshpass，暂未实现

    // 构建 SSH 基础命令
    const buildSshCmd = (nodeIp, remoteCmd) => {
      let sshBase = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10`;
      if (sshKeyPath) {
        sshBase += ` -i "${sshKeyPath}"`;
      }
      // 注意：密码模式需要 sshpass，这里简化处理，优先使用密钥
      // 转义 $ 和 " 以防止本地 shell 展开 $(...) 和处理引号
      const escapedCmd = remoteCmd
        .replace(/\\/g, '\\\\') // 先转义反斜杠
        .replace(/"/g, '\\"') // 转义双引号
        .replace(/\$/g, '\\$') // 转义 $ 防止本地 shell 展开
        .replace(/`/g, '\\`'); // 转义反引号
      return `${sshBase} ${sshUser}@${nodeIp} "${escapedCmd}"`;
    };

    // 分批并发执行
    for (let i = 0; i < commands.length; i += maxConcurrency) {
      const batch = commands.slice(i, i + maxConcurrency);

      const batchResults = await Promise.all(
        batch.map(async (cmd) => {
          try {
            const nodeIp = cmd.node_ip;
            const remoteCmd = cmd.ssh_command;
            const fullCmd = buildSshCmd(nodeIp, remoteCmd);

            console.error(
              `   SSH to ${nodeIp}: ${remoteCmd.substring(0, 60)}...`,
            );

            // 记录 SSH 命令到日志文件
            if (requestId) {
              this.logger.logSshCommand(
                requestId,
                nodeIp,
                cmd.node_type,
                remoteCmd,
                fullCmd,
              );
            }

            // 根据命令类型选择执行方式
            const commandType = cmd.command_type || 'generic';
            fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] command_type: ${commandType}, cmd keys: ${Object.keys(cmd).join(',')}\n`);

            // fetch_log_scp 使用 spawn 流式传输，需要单独处理
            if (commandType === 'fetch_log_scp') {
              // 使用流式传输避免 maxBuffer 限制
              // SSH 输出直接流式写入本地临时文件，然后读取解压
              const cmdStartTime = Date.now();
              const tmpDir = os.tmpdir();
              const tmpFile = path.join(
                tmpDir,
                `sr_log_${nodeIp.replace(/\./g, '_')}_${Date.now()}.gz`,
              );

              console.error(`   SCP mode: streaming to ${tmpFile}`);

              // 构建 SSH 参数（不需要转义，spawn 直接传参）
              const sshArgs = [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'ConnectTimeout=10',
                '-T',
              ];
              if (sshKeyPath) {
                sshArgs.push('-i', sshKeyPath);
              }
              sshArgs.push(`${sshUser}@${nodeIp}`, remoteCmd);

              // 使用 spawn 流式执行，输出写入临时文件
              fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] sshKeyPath: "${sshKeyPath}"\n`);
              fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] SSH args: ssh ${sshArgs.slice(0, -1).join(' ')} "<cmd>"\n`);
              // 写入完整命令到单独文件以便分析
              fs.writeFileSync('/tmp/mcp_remote_cmd.sh', remoteCmd);

              await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tmpFile);
                const sshProcess = spawn('ssh', sshArgs);

                let stdoutBytes = 0;
                sshProcess.stdout.on('data', (chunk) => {
                  stdoutBytes += chunk.length;
                });
                sshProcess.stdout.pipe(writeStream);

                let stderrData = '';
                sshProcess.stderr.on('data', (data) => {
                  stderrData += data.toString();
                });

                writeStream.on('finish', () => {
                  fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] writeStream finish, exitCode: ${sshProcess.exitCode}, stdoutBytes: ${stdoutBytes}\n`);
                  if (
                    sshProcess.exitCode === 0 ||
                    sshProcess.exitCode === null
                  ) {
                    resolve();
                  }
                });

                sshProcess.on('close', (code) => {
                  fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] SSH close, code: ${code}, stderr: ${stderrData.substring(0, 200)}\n`);
                  writeStream.end();
                  if (code === 0) {
                    resolve();
                  } else {
                    reject(
                      new Error(`SSH exited with code ${code}: ${stderrData}`),
                    );
                  }
                });

                sshProcess.on('error', (err) => {
                  writeStream.end();
                  reject(err);
                });

                // 超时处理（5分钟，大文件需要更长时间）
                const timeout = setTimeout(
                  () => {
                    sshProcess.kill('SIGTERM');
                    writeStream.end();
                    reject(new Error('SSH timeout (5 min)'));
                  },
                  5 * 60 * 1000,
                );

                sshProcess.on('close', () => clearTimeout(timeout));
              });

              const duration = Date.now() - cmdStartTime;

              // 读取并解压临时文件
              let content;
              const compressedData = fs.readFileSync(tmpFile);
              const compressedSize = compressedData.length;

              try {
                content = gunzipSync(compressedData).toString('utf-8');
                console.error(
                  `   Decompressed: ${compressedSize} -> ${content.length} bytes`,
                );
              } catch (decompressErr) {
                console.error(
                  `   Warning: Failed to decompress, using raw content: ${decompressErr.message}`,
                );
                content = compressedData.toString('utf-8');
              }

              // 清理临时文件
              try {
                fs.unlinkSync(tmpFile);
              } catch (cleanupErr) {
                console.error(
                  `   Warning: Failed to delete temp file: ${cleanupErr.message}`,
                );
              }

              // 解析多文件格式: === FILE: filename ===
              fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] Compressed: ${compressedSize}, Decompressed: ${content.length}\n`);
              fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] Content preview: ${content.substring(0, 300).replace(/\n/g, '\\n')}\n`);
              const files = this.parseMultiFileLogContent(
                content,
                nodeIp,
                cmd.node_type,
              );
              fs.appendFileSync('/tmp/mcp_debug.log', `[${new Date().toISOString()}] Parsed ${files.length} files\n`);

              return {
                node_ip: nodeIp,
                node_type: cmd.node_type,
                log_dir: cmd.log_dir,
                file_patterns: cmd.file_patterns,
                command_type: commandType,
                ssh_command: remoteCmd,
                success: true,
                files: files,
                total_files: files.length,
                total_lines: files.reduce((sum, f) => sum + f.line_count, 0),
                compressed_size: compressedSize,
                decompressed_size: content.length,
                execution_time_ms: duration,
              };
            }

            // 其他命令类型使用 execAsync
            const cmdStartTime = Date.now();

            const { stdout, stderr } = await execAsync(fullCmd, {
              timeout: commandTimeoutMs,
              maxBuffer: 50 * 1024 * 1024, // 50MB（日志可能较大）
            });

            const duration = Date.now() - cmdStartTime;

            // 记录 SSH 命令结果到日志文件
            if (requestId) {
              this.logger.logSshResult(
                requestId,
                nodeIp,
                cmd.node_type,
                true,
                stdout,
                stderr,
                null,
                duration,
              );
            }

            if (commandType === 'discover_log_path') {
              // 发现日志路径
              return {
                node_ip: nodeIp,
                node_type: cmd.node_type,
                command_type: commandType,
                success: true,
                output: stdout.trim(),
                execution_time_ms: duration,
              };
            } else if (commandType === 'fetch_log') {
              // 获取日志内容
              let content = stdout;
              // 如果是压缩的，解压
              if (cmd.options?.compress) {
                try {
                  const decoded = Buffer.from(stdout.trim(), 'base64');
                  const { gunzipSync } = await import('node:zlib');
                  content = gunzipSync(decoded).toString('utf-8');
                } catch (decompressErr) {
                  console.error(
                    `   Warning: Failed to decompress log from ${nodeIp}: ${decompressErr.message}`,
                  );
                  content = stdout; // 使用原始输出
                }
              }

              // 解析多文件格式: === FILE: filename ===
              const files = this.parseMultiFileLogContent(
                content,
                nodeIp,
                cmd.node_type,
              );

              return {
                node_ip: nodeIp,
                node_type: cmd.node_type,
                log_dir: cmd.log_dir,
                file_patterns: cmd.file_patterns,
                command_type: commandType,
                ssh_command: remoteCmd, // 保留原始 SSH 命令用于调试
                success: true,
                files: files, // 解析后的文件列表
                total_files: files.length,
                total_lines: files.reduce((sum, f) => sum + f.line_count, 0),
                execution_time_ms: duration,
              };
            } else {
              // 通用命令
              return {
                node_ip: nodeIp,
                node_type: cmd.node_type,
                command_type: commandType,
                success: true,
                output: stdout,
                execution_time_ms: duration,
              };
            }
          } catch (error) {
            const duration = Date.now() - (cmdStartTime || Date.now());
            const nodeIp = cmd.node_ip;
            const commandType = cmd.command_type || 'generic';

            // 检查是否有 stdout 输出（即使命令返回非零退出码）
            // Node.js exec 在非零退出码时会抛异常，但 error.stdout 可能仍有有效输出
            if (error.stdout && error.stdout.trim()) {
              const output = error.stdout.trim();

              // 记录到日志（有输出但命令返回非零退出码）
              if (requestId) {
                this.logger.logSshResult(
                  requestId,
                  nodeIp,
                  cmd.node_type,
                  true,
                  output,
                  error.stderr,
                  `Exit code: ${error.code}, but has stdout`,
                  duration,
                );
              }

              // 对于 discover_log_path，如果有有效路径输出（以 / 开头），视为成功
              if (
                commandType === 'discover_log_path' &&
                output.startsWith('/')
              ) {
                console.error(
                  `   SSH to ${nodeIp}: command returned non-zero but has valid output: ${output}`,
                );
                return {
                  node_ip: nodeIp,
                  node_type: cmd.node_type,
                  command_type: commandType,
                  success: true,
                  output: output,
                  execution_time_ms: duration,
                  warning: `Command exited with code ${error.code} but produced valid output`,
                };
              }
            }

            // 记录失败到日志文件
            if (requestId) {
              this.logger.logSshResult(
                requestId,
                nodeIp,
                cmd.node_type,
                false,
                error.stdout,
                error.stderr,
                error.message,
                duration,
              );
            }

            console.error(`   SSH failed for ${nodeIp}: ${error.message}`);
            return {
              node_ip: nodeIp,
              node_type: cmd.node_type,
              log_dir: cmd.log_dir, // 即使失败也保留 log_dir
              file_patterns: cmd.file_patterns,
              command_type: commandType,
              success: false,
              error: error.message,
              stderr: error.stderr || null, // 返回 stderr 便于调试
              stdout: error.stdout || null, // 返回 stdout 便于调试
            };
          }
        }),
      );

      for (const result of batchResults) {
        results.ssh_results.push(result);
        if (result.success) {
          results.ssh_summary.successful++;
        } else {
          results.ssh_summary.failed++;
        }
      }
    }

    results.ssh_summary.execution_time_ms = Date.now() - startTime;
    console.error(
      `   SSH execution completed: ${results.ssh_summary.successful} success, ${results.ssh_summary.failed} failed`,
    );

    return results;
  }

  /**
   * 解析多文件日志内容
   * 日志格式: === FILE: filename === 后跟文件内容
   * @param {string} content - 原始日志内容
   * @param {string} nodeIp - 节点 IP
   * @param {string} nodeType - 节点类型
   * @returns {Array<{filename: string, content: string, line_count: number}>}
   */
  parseMultiFileLogContent(content, nodeIp, nodeType) {
    const files = [];

    if (!content || content.trim() === '') {
      return files;
    }

    // 按文件分隔符拆分: === FILE: filename ===
    const filePattern = /^=== FILE: (.+?) ===/gm;
    const parts = content.split(filePattern);

    // parts 格式: [前导内容, filename1, content1, filename2, content2, ...]
    // 跳过第一个元素（分隔符前的内容，通常为空）
    for (let i = 1; i < parts.length; i += 2) {
      const filename = parts[i]?.trim();
      const fileContent = parts[i + 1]?.trim() || '';

      if (filename) {
        const lines = fileContent.split('\n');
        files.push({
          filename: filename,
          node_ip: nodeIp,
          node_type: nodeType,
          content: fileContent,
          line_count: lines.length,
          size_bytes: Buffer.byteLength(fileContent, 'utf-8'),
        });
      }
    }

    // 如果没有解析到文件分隔符，则整个内容作为单个文件处理
    if (files.length === 0 && content.trim()) {
      const lines = content.split('\n');
      files.push({
        filename: 'combined.log',
        node_ip: nodeIp,
        node_type: nodeType,
        content: content,
        line_count: lines.length,
        size_bytes: Buffer.byteLength(content, 'utf-8'),
      });
    }

    console.error(`   Parsed ${files.length} log files from ${nodeIp}`);
    return files;
  }

  /**
   * 解析存储 CLI 输出获取大小（字节数）
   */
  parseStorageCliOutput(storageType, stdout) {
    try {
      switch (storageType) {
        case 's3':
        case 's3a':
        case 's3n': {
          // AWS S3: "Total Size: 1234567890 Bytes"
          const match = stdout.match(/Total Size:\s*([\d,]+)\s*Bytes/i);
          if (match) return parseInt(match[1].replace(/,/g, ''), 10);
          if (stdout.includes('Total Objects: 0')) return 0;
          break;
        }
        case 'oss': {
          // OSS: "total object sum size: 1234567890"
          const match = stdout.match(/total object sum size:\s*([\d]+)/i);
          if (match) return parseInt(match[1], 10);
          if (stdout.includes('total object count: 0')) return 0;
          break;
        }
        case 's3cmd': {
          // s3cmd du 输出格式: "   1234567890   123 objects s3://bucket/path/" (可能有前导空格)
          const match = stdout.match(/^\s*(\d+)\s+\d+\s+objects?/m);
          if (match) return parseInt(match[1], 10);
          // 空目录情况
          if (stdout.includes('0 objects')) return 0;
          break;
        }
        case 'cos':
        case 'cosn': {
          // COS: "(1234567890 Bytes)" or "Total Size: 1.23 GB"
          const bytesMatch = stdout.match(/\((\d+)\s*Bytes?\)/i);
          if (bytesMatch) return parseInt(bytesMatch[1], 10);
          break;
        }
        case 'hdfs': {
          // HDFS: "1234567890  path"
          const match = stdout.match(/^(\d+)/);
          if (match) return parseInt(match[1], 10);
          break;
        }
        case 'gs': {
          // GCS: "1234567890  gs://bucket/path"
          const match = stdout.match(/^(\d+)/);
          if (match) return parseInt(match[1], 10);
          break;
        }
        case 'azblob': {
          // Azure: 直接是数字
          const num = parseInt(stdout.trim(), 10);
          if (!isNaN(num)) return num;
          break;
        }
      }
    } catch (e) {
      console.error(
        `   Failed to parse CLI output for ${storageType}: ${e.message}`,
      );
    }
    return null;
  }

  /**
   * 获取多个查询的详细 Profile
   * @param {Array} profileList - SHOW PROFILELIST 返回的结果
   * @param {Object} options - 过滤选项
   * @param {string} options.timeRange - 时间范围，如 "1h", "30m", "1d"
   * @param {number} options.minDurationMs - 最小查询时长（毫秒）
   */
  async fetchQueryProfiles(profileList, options = {}) {
    const profiles = {};
    const connection = await mysql.createConnection(this.dbConfig);

    try {
      // 禁用当前 session 的 profile 记录，避免 get_query_profile 查询挤掉用户查询的 profile
      await connection.query('SET enable_profile = false');

      // 1. 先过滤系统查询
      let filteredQueries = this.filterUserQueries(profileList);
      console.error(
        `   Filtered ${profileList.length} queries to ${filteredQueries.length} user queries`,
      );

      // 2. 按时间范围过滤
      const timeRange = options.timeRange || '1h';
      const cutoffTime = this.calculateCutoffTime(timeRange);
      filteredQueries = filteredQueries.filter((item) => {
        if (!item.StartTime) return false;
        const queryTime = new Date(item.StartTime);
        return queryTime >= cutoffTime;
      });
      console.error(
        `   After time filter (${timeRange}): ${filteredQueries.length} queries`,
      );

      // 3. 按最小时长过滤
      const minDurationMs = options.minDurationMs || 100;
      filteredQueries = filteredQueries.filter((item) => {
        const durationMs = this.parseDuration(item.Time);
        return durationMs >= minDurationMs;
      });
      console.error(
        `   After duration filter (>=${minDurationMs}ms): ${filteredQueries.length} queries`,
      );

      // 获取所有符合条件的查询的 profile
      for (const item of filteredQueries) {
        const queryId = item.QueryId;
        if (!queryId) continue;

        try {
          console.error(`   Fetching profile for query: ${queryId}`);
          const [rows] = await connection.query(
            `SELECT get_query_profile('${queryId}') as profile`,
          );
          if (rows && rows[0] && rows[0].profile) {
            profiles[queryId] = {
              profile: rows[0].profile,
              startTime: item.StartTime,
              duration: item.Time,
              state: item.State,
              statement: item.Statement || '',
            };
          }
        } catch (error) {
          console.error(
            `   Failed to fetch profile for ${queryId}: ${error.message}`,
          );
          profiles[queryId] = { error: error.message };
        }
      }
    } finally {
      await connection.end();
    }

    return profiles;
  }

  /**
   * 根据时间范围计算截止时间
   * @param {string} timeRange - 时间范围，如 "1h", "30m", "1d"
   * @returns {Date} 截止时间
   */
  calculateCutoffTime(timeRange) {
    const now = new Date();
    const match = timeRange.match(/^(\d+)([hmd])$/);
    if (!match) {
      // 默认 1 小时
      return new Date(now.getTime() - 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    let milliseconds;
    switch (unit) {
      case 'm':
        milliseconds = value * 60 * 1000;
        break;
      case 'h':
        milliseconds = value * 60 * 60 * 1000;
        break;
      case 'd':
        milliseconds = value * 24 * 60 * 60 * 1000;
        break;
      default:
        milliseconds = 60 * 60 * 1000;
    }

    return new Date(now.getTime() - milliseconds);
  }

  /**
   * 解析时长字符串为毫秒
   * @param {string} duration - 时长字符串，如 "5s489ms", "831ms", "9s139ms"
   * @returns {number} 毫秒数
   */
  parseDuration(duration) {
    if (!duration) return 0;

    let totalMs = 0;

    // 匹配秒
    const secMatch = duration.match(/(\d+)s/);
    if (secMatch) {
      totalMs += parseInt(secMatch[1], 10) * 1000;
    }

    // 匹配毫秒
    const msMatch = duration.match(/(\d+)ms/);
    if (msMatch) {
      totalMs += parseInt(msMatch[1], 10);
    }

    // 匹配分钟
    const minMatch = duration.match(/(\d+)m(?!s)/);
    if (minMatch) {
      totalMs += parseInt(minMatch[1], 10) * 60 * 1000;
    }

    return totalMs;
  }

  /**
   * 从 profile 数据中提取有 cache miss 的表名
   * 只提取 CompressedBytesReadRemote > 0 或 IOCountRemote > 0 的表
   */
  extractTableNamesFromProfiles(queryProfiles) {
    const tableNames = new Set();

    for (const [, profileData] of Object.entries(queryProfiles)) {
      if (profileData.error || !profileData.profile) continue;

      // 提取每个表及其对应的 cache 指标
      const tablesWithCacheMiss = this.extractTablesWithCacheMiss(
        profileData.profile,
      );
      for (const tableName of tablesWithCacheMiss) {
        tableNames.add(tableName);
      }
    }

    return tableNames;
  }

  /**
   * 从单个 profile 文本中提取所有表名和视图名
   * @param {string} profileText - Profile 文本内容
   * @returns {Set<string>} 对象名集合（格式: database.table 或 table）
   */
  extractTableNamesFromSingleProfile(profileText) {
    const objectNames = new Set();

    // 1. 从 "Table: database.table" 行提取表名
    const lines = profileText.split('\n');
    for (const line of lines) {
      const tableMatch = line.match(/^\s*-\s*Table:\s*(\S+\.\S+)/);
      if (tableMatch) {
        objectNames.add(tableMatch[1]);
      }
    }

    // 2. 从 SQL 语句中提取视图名（视图不会出现在 Table: 行中）
    const sql = this.extractSQLFromProfile(profileText);
    if (sql) {
      const sqlObjects = this.extractTableNamesFromSQL(sql);
      for (const objName of sqlObjects) {
        // 如果对象名包含数据库前缀，直接添加
        if (objName.includes('.')) {
          objectNames.add(objName);
        }
      }
    }

    return objectNames;
  }

  /**
   * 从 Profile 中提取 SQL 语句
   * @param {string} profileText - Profile 文本内容
   * @returns {string|null} SQL 语句
   */
  extractSQLFromProfile(profileText) {
    if (!profileText) return null;

    // 匹配 "SQL Statement:" 或 "Sql Statement:" 后面的 SQL
    const sqlPattern =
      /Sql\s+Statement:\s*([\s\S]*?)(?=\n\s*-\s+Variables:|$)/i;
    const match = profileText.match(sqlPattern);

    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  /**
   * 从 SQL 语句中提取表名和视图名
   * @param {string} sql - SQL 语句
   * @returns {Array<string>} 对象名数组
   */
  extractTableNamesFromSQL(sql) {
    if (!sql) return [];

    const objectNames = new Set();

    // 匹配 FROM 和 JOIN 后面的对象名
    // 支持格式：FROM table, FROM db.table, JOIN table, JOIN table AS alias
    const patterns = [
      /(?:FROM|JOIN)\s+([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)/gi, // db.table
      /(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?[a-zA-Z0-9_]+)?/gi, // table 或 table AS alias
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        const objName = match[1];

        // 过滤掉 SQL 关键字
        const keywords = [
          'SELECT',
          'WHERE',
          'GROUP',
          'ORDER',
          'LIMIT',
          'HAVING',
          'UNION',
          'INNER',
          'LEFT',
          'RIGHT',
          'OUTER',
          'ON',
          'USING',
        ];
        if (!keywords.includes(objName.toUpperCase())) {
          objectNames.add(objName);
        }
      }
    });

    return Array.from(objectNames);
  }

  /**
   * 从单个 profile 中提取有 cache miss 的表
   * 解析 IOStatistics 块中的 CompressedBytesReadRemote 和 IOCountRemote
   */
  extractTablesWithCacheMiss(profileText) {
    const tablesWithCacheMiss = [];
    const lines = profileText.split('\n');
    let currentTable = null;
    let inIOStatistics = false;
    let currentTableHasCacheMiss = false;

    for (const line of lines) {
      // 检测 Table: xxx
      const tableMatch = line.match(/-\s*Table:\s*(\S+)/);
      if (tableMatch) {
        // 保存上一个表的结果
        if (
          currentTable &&
          currentTableHasCacheMiss &&
          !tablesWithCacheMiss.includes(currentTable)
        ) {
          tablesWithCacheMiss.push(currentTable);
        }
        currentTable = tableMatch[1].trim();
        inIOStatistics = false;
        currentTableHasCacheMiss = false;
        continue;
      }

      // 检测是否进入 IOStatistics 块
      if (line.includes('- IOStatistics:')) {
        inIOStatistics = true;
        continue;
      }

      // 在 IOStatistics 块内检查 cache miss
      if (currentTable && inIOStatistics) {
        // CompressedBytesReadRemote > 0
        const remoteBytesMatch = line.match(
          /CompressedBytesReadRemote:\s*([\d.]+)\s*([KMGTP]?B)/i,
        );
        if (remoteBytesMatch) {
          const value = parseFloat(remoteBytesMatch[1]);
          if (value > 0) currentTableHasCacheMiss = true;
        }

        // IOCountRemote > 0
        const remoteIOMatch = line.match(/IOCountRemote:\s*([\d.,]+)/i);
        if (remoteIOMatch) {
          const value = parseInt(remoteIOMatch[1].replace(/,/g, ''), 10);
          if (value > 0) currentTableHasCacheMiss = true;
        }
      }
    }

    // 保存最后一个表的结果
    if (
      currentTable &&
      currentTableHasCacheMiss &&
      !tablesWithCacheMiss.includes(currentTable)
    ) {
      tablesWithCacheMiss.push(currentTable);
    }

    return tablesWithCacheMiss;
  }

  /**
   * 获取表的 schema 信息，检查 data_cache.enable 属性
   */
  async fetchTableSchemas(tableNames) {
    const schemas = {};
    const connection = await mysql.createConnection(this.dbConfig);

    try {
      // 禁用当前 session 的 profile 记录
      await connection.query('SET enable_profile = false');

      for (const fullTableName of tableNames) {
        const [dbName, tableName] = fullTableName.split('.');
        if (!dbName || !tableName) continue;

        try {
          const [rows] = await connection.query(
            `SHOW CREATE TABLE ${dbName}.${tableName}`,
          );
          if (rows && rows[0]) {
            // 支持表和视图：表返回 'Create Table'，视图返回 'Create View'
            const createStatement =
              rows[0]['Create Table'] ||
              rows[0]['Create View'] ||
              rows[0]['create_statement'] ||
              '';
            const isView = !!rows[0]['Create View'];
            schemas[fullTableName] = {
              create_statement: createStatement,
              object_type: isView ? 'VIEW' : 'TABLE',
              data_cache_enabled: this.checkDataCacheEnabled(createStatement),
            };
          }
        } catch (error) {
          console.error(
            `   Failed to fetch schema for ${fullTableName}: ${error.message}`,
          );
          schemas[fullTableName] = { error: error.message };
        }
      }
    } finally {
      await connection.end();
    }

    return schemas;
  }

  /**
   * 检查建表语句中 data_cache.enable 是否为 true
   */
  checkDataCacheEnabled(createStatement) {
    if (!createStatement) return null;

    // 检查 "datacache.enable" = "false" 或 'datacache.enable' = 'false'
    const disabledMatch = createStatement.match(
      /["']datacache\.enable["']\s*=\s*["']false["']/i,
    );
    if (disabledMatch) {
      return false;
    }

    // 检查 "datacache.enable" = "true" 或存在 datacache 相关配置
    const enabledMatch = createStatement.match(
      /["']datacache\.enable["']\s*=\s*["']true["']/i,
    );
    if (enabledMatch) {
      return true;
    }

    // 默认为开启（如果没有显式设置）
    return null;
  }

  /**
   * 过滤出真正的用户查询，排除系统查询
   */
  filterUserQueries(profileList) {
    const systemPatterns = [
      /^\s*select\s+last_query_id\s*\(/i,
      /^\s*select\s+get_query_profile\s*\(/i,
      /^\s*select\s+@@/i,
      /^\s*show\s+/i,
      /^\s*admin\s+show\s+/i,
      /^\s*desc\s+/i,
      /^\s*describe\s+/i,
      /^\s*explain\s+/i,
      /^\s*set\s+/i,
      /^\s*use\s+/i,
      /information_schema/i,
      /_statistics_/i,
      /^\s*select\s+version\s*\(\)/i,
      /^\s*select\s+current_user\s*\(\)/i,
      /^\s*select\s+database\s*\(\)/i,
      /^\s*select\s+connection_id\s*\(\)/i,
    ];

    return profileList.filter((item) => {
      const sql = (item.Statement || '').trim();
      if (!sql) return false;

      for (const pattern of systemPatterns) {
        if (pattern.test(sql)) {
          return false;
        }
      }

      // 处理 SQL 中的换行符，将其替换为空格再检查
      const sqlNormalized = sql.toLowerCase().replace(/\n/g, ' ');
      // 排除没有 FROM 子句的纯 SELECT 语句（如 select 1+1, select @@var）
      if (
        sqlNormalized.startsWith('select') &&
        !sqlNormalized.includes(' from ')
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * 处理文件路径参数，读取文件内容
   */
  async processFileArgs(args) {
    const processedArgs = { ...args };

    // 处理 file_path 参数
    if (args.file_path) {
      try {
        console.error(`   Reading file: ${args.file_path}`);
        const content = fs.readFileSync(args.file_path, 'utf-8');
        const fileSizeKB = content.length / 1024;
        console.error(`   File content loaded: ${fileSizeKB.toFixed(2)} KB`);

        // 对于大文件（超过 50KB），不通过 JSON-RPC 传输内容，而是在分析阶段处理
        if (fileSizeKB > 50) {
          console.error(
            `   Large file detected (${fileSizeKB.toFixed(2)} KB > 50 KB), will handle in analysis phase`,
          );
          // 保留路径信息，不传输内容
          processedArgs.large_file_path = args.file_path;
        } else {
          processedArgs.profile = content; // 将文件内容设置为 profile 参数
        }
      } catch (error) {
        console.error(
          `   Failed to read file ${args.file_path}: ${error.message}`,
        );
        throw new Error(
          `Failed to read file ${args.file_path}: ${error.message}`,
        );
      }
    }

    // 处理 table_schema_path 参数
    if (args.table_schema_path) {
      try {
        console.error(
          `   Reading table schema file: ${args.table_schema_path}`,
        );
        const schemaContent = fs.readFileSync(args.table_schema_path, 'utf-8');
        // 如果 table_schemas 是数组，替换第一个，否则创建数组
        if (Array.isArray(processedArgs.table_schemas)) {
          processedArgs.table_schemas[0] = schemaContent;
        } else {
          processedArgs.table_schemas = [schemaContent];
        }
        console.error(
          `   Table schema loaded: ${(schemaContent.length / 1024).toFixed(2)} KB`,
        );
      } catch (error) {
        console.error(
          `   Failed to read table schema file ${args.table_schema_path}: ${error.message}`,
        );
        // 表结构文件是可选的，读取失败不应该中断流程
      }
    }

    return processedArgs;
  }

  /**
   * 发送结果给中心 API 进行分析
   */
  async analyzeResultsWithAPI(toolName, results, args = {}, requestId = null) {
    const url = `${this.centralAPI}/api/analyze/${toolName}`;

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.apiToken) {
        headers['X-API-Key'] = this.apiToken;
      }

      // 处理大文件：在这里读取内容而不是通过 JSON-RPC 传输
      const processedArgs = { ...args };
      if (args.large_file_path) {
        console.error(
          `   Loading large file for analysis: ${args.large_file_path}`,
        );
        try {
          const content = fs.readFileSync(args.large_file_path, 'utf-8');
          processedArgs.profile = content;
          processedArgs.file_path = args.large_file_path; // 保持原始路径信息
          delete processedArgs.large_file_path; // 清理临时字段
          console.error(
            `   Large file loaded: ${(content.length / 1024).toFixed(2)} KB`,
          );
        } catch (error) {
          console.error(
            `   Failed to read large file ${args.large_file_path}: ${error.message}`,
          );
          throw new Error(
            `Failed to read large file ${args.large_file_path}: ${error.message}`,
          );
        }
      }

      const body = { results, args: processedArgs };

      // 记录中心服务器请求（传递完整 body，Logger 会自动生成摘要）
      if (requestId) {
        this.logger.logCentralRequest(requestId, 'POST', url, body);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
        // 记录失败响应
        if (requestId) {
          this.logger.logCentralResponse(
            requestId,
            url,
            response.status,
            null,
            error,
          );
        }
        throw error;
      }

      const data = await response.json();

      // 记录成功响应
      if (requestId) {
        this.logger.logCentralResponse(requestId, url, response.status, data);
      }

      return data;
    } catch (error) {
      throw new Error(`Failed to analyze results: ${error.message}`);
    }
  }

  /**
   * 格式化分析报告
   */
  formatAnalysisReport(analysis) {
    // 如果分析对象为空或无法识别结构，返回错误信息
    if (!analysis || typeof analysis !== 'object') {
      return '❌ 分析结果格式错误或为空';
    }

    // 处理 HTML 报告响应（generate_html_report 工具）- 需要在其他检查之前处理
    if (analysis.html_content || analysis.output_path) {
      return `📊 StarRocks HTML 性能分析报告生成完成!\n\n${analysis.message || 'HTML 报告生成成功'}\n\n📋 详细分析请查看 HTML 文件: ${analysis.output_path || '/tmp/profile_analysis_report.html'}`;
    }

    const {
      expert,
      storage_health,
      compaction_health,
      import_health,
      diagnosis_results,
      status,
      architecture_type,
      report,
      content,
    } = analysis;

    // 如果 analysis 已经包含格式化的 report，直接使用
    if (report && typeof report === 'string') {
      return report;
    }

    // 如果 analysis 已经包含格式化的 content（如发布耗时分析报告），直接使用
    if (content && typeof content === 'string') {
      return content;
    }

    let formattedReport = '';

    // 处理特殊工具：存储放大分析
    if (status === 'not_applicable') {
      formattedReport = '⚠️  ' + analysis.message + '\n';
      formattedReport += '\n📋 详细数据请查看 JSON 输出部分';
      return formattedReport;
    }

    if (status === 'error') {
      formattedReport =
        '❌ 分析失败: ' + (analysis.error || analysis.message) + '\n';
      return formattedReport;
    }

    // 处理 plan 模式：返回执行计划，指示 Claude 创建 TODO
    if (status === 'plan' && analysis.plan) {
      formattedReport = '📋 执行计划\n\n';
      formattedReport += `${analysis.message || '即将执行以下步骤：'}\n\n`;
      formattedReport += `${analysis.plan.description || ''}\n\n`;

      if (analysis.plan.steps && analysis.plan.steps.length > 0) {
        formattedReport += '步骤列表：\n';
        for (const step of analysis.plan.steps) {
          formattedReport += `  ${step.step}. ${step.name}`;
          if (step.description) {
            formattedReport += ` - ${step.description}`;
          }
          formattedReport += '\n';
        }
        formattedReport += '\n';
      }

      if (analysis.next_action) {
        formattedReport += '⚠️ 重要：请先使用 TodoWrite 工具创建上述步骤的 TODO 列表，然后再次调用本工具并传入 execute: true 参数开始执行。\n\n';
        formattedReport += `下次调用参数: ${JSON.stringify(analysis.next_action.call_with)}\n`;
      }

      return formattedReport;
    }

    // 处理存储放大分析
    if (analysis.storage_amplification) {
      formattedReport = '📊 StarRocks 存储空间放大分析报告\n';
      if (architecture_type) {
        formattedReport += `🏗️  架构类型: ${architecture_type === 'shared_data' ? '存算分离' : '存算一体'}\n\n`;
      }

      const amp = analysis.storage_amplification;
      if (amp.amplification_ratio && amp.amplification_ratio !== '0') {
        const ratio = parseFloat(amp.amplification_ratio);
        const ampEmoji = ratio > 2.0 ? '🔴' : ratio > 1.5 ? '🟡' : '🟢';
        formattedReport += `${ampEmoji} 存储放大率: ${amp.amplification_ratio}x\n`;
        formattedReport += `   用户数据: ${amp.total_data_size_gb} GB\n`;
        formattedReport += `   对象存储: ${amp.total_storage_size_gb} GB\n\n`;
      }

      // 问题
      if (analysis.issues && analysis.issues.length > 0) {
        formattedReport += '⚠️  发现的问题:\n';
        analysis.issues.forEach((issue, index) => {
          const emoji = issue.severity === 'critical' ? '🔴' : '🟡';
          formattedReport += `  ${emoji} ${index + 1}. ${issue.message}\n`;
        });
        formattedReport += '\n';
      }

      // 建议
      if (analysis.recommendations && analysis.recommendations.length > 0) {
        formattedReport += '💡 优化建议:\n';
        analysis.recommendations.slice(0, 3).forEach((rec, index) => {
          formattedReport += `  ${index + 1}. [${rec.priority}] ${rec.title}\n`;
        });
      }

      formattedReport += '\n📋 详细数据请查看 JSON 输出部分';
      return formattedReport;
    }

    // 标题 - 健康分析类工具（增强防御性检查）
    if (expert === 'storage' && storage_health && storage_health.level) {
      formattedReport = '💾 StarRocks 存储专家分析报告\n';
      const health = storage_health;
      const healthEmoji =
        health.level === 'EXCELLENT'
          ? '🟢'
          : health.level === 'GOOD'
            ? '🟡'
            : '🔴';
      formattedReport += `${healthEmoji} 健康分数: ${health.score || 0}/100 (${health.level})\n`;
      formattedReport += `📊 状态: ${health.status || 'UNKNOWN'}\n\n`;
    } else if (
      expert === 'compaction' &&
      compaction_health &&
      compaction_health.level
    ) {
      formattedReport = '🗜️ StarRocks Compaction 专家分析报告\n';
      const health = compaction_health;
      const healthEmoji =
        health.level === 'EXCELLENT'
          ? '🟢'
          : health.level === 'GOOD'
            ? '🟡'
            : '🔴';
      formattedReport += `${healthEmoji} 健康分数: ${health.score || 0}/100 (${health.level})\n`;
      formattedReport += `📊 状态: ${health.status || 'UNKNOWN'}\n\n`;
    } else if (expert === 'ingestion' && import_health && import_health.level) {
      formattedReport = '📥 StarRocks 数据摄取专家分析报告\n';
      const health = import_health;
      const healthEmoji =
        health.level === 'EXCELLENT'
          ? '🟢'
          : health.level === 'GOOD'
            ? '🟡'
            : '🔴';
      formattedReport += `${healthEmoji} 健康分数: ${health.score || 0}/100 (${health.level})\n`;
      formattedReport += `📊 状态: ${health.status || 'UNKNOWN'}\n\n`;
    }

    // 诊断摘要
    if (diagnosis_results) {
      formattedReport += `📋 诊断摘要: ${diagnosis_results.summary}\n`;
      formattedReport += `🔍 发现问题: ${diagnosis_results.total_issues || diagnosis_results.total_jobs || 0}个\n\n`;
    }

    // 关键问题 - 加强防御性检查
    if (
      diagnosis_results &&
      diagnosis_results.criticals &&
      Array.isArray(diagnosis_results.criticals) &&
      diagnosis_results.criticals.length > 0
    ) {
      formattedReport += '🔴 严重问题:\n';
      diagnosis_results.criticals.slice(0, 3).forEach((issue, index) => {
        if (issue && issue.message) {
          formattedReport += `  ${index + 1}. ${issue.message}\n`;
        }
      });
      formattedReport += '\n';
    }

    if (
      diagnosis_results &&
      diagnosis_results.warnings &&
      diagnosis_results.warnings.length > 0
    ) {
      formattedReport += '🟡 警告:\n';
      diagnosis_results.warnings.slice(0, 3).forEach((issue, index) => {
        formattedReport += `  ${index + 1}. ${issue.message}\n`;
      });
      formattedReport += '\n';
    }

    // 其他信息（包含分区详情等）
    if (
      diagnosis_results &&
      diagnosis_results.issues &&
      diagnosis_results.issues.length > 0
    ) {
      formattedReport += 'ℹ️  详细信息:\n';
      diagnosis_results.issues.forEach((issue, index) => {
        formattedReport += `  ${index + 1}. ${issue.message}\n`;
      });
      formattedReport += '\n';
    }

    // 建议
    if (
      analysis.professional_recommendations &&
      analysis.professional_recommendations.length > 0
    ) {
      formattedReport += '💡 专业建议 (前3条):\n';
      analysis.professional_recommendations
        .slice(0, 3)
        .forEach((rec, index) => {
          formattedReport += `  ${index + 1}. [${rec.priority}] ${rec.title}\n`;
        });
    }

    formattedReport += '\n📋 详细数据请查看 JSON 输出部分';

    return formattedReport;
  }

  /**
   * 格式化步骤完成报告
   * @param {Object} analysis - 分析结果
   * @param {string} sessionId - 会话 ID（用于恢复中间状态）
   */
  formatStepCompletedReport(analysis, sessionId = null) {
    let report = '';
    const step = analysis.completed_step || {};

    report += `✅ 步骤 ${step.step || '?'} 完成: ${step.name || analysis.phase || '未知步骤'}\n\n`;

    if (step.result_summary) {
      report += `📊 执行结果:\n${step.result_summary}\n\n`;
    }

    // 展示详细结果（如果有）
    if (step.result_details) {
      report += `📋 详细信息:\n`;
      if (step.result_details.description) {
        report += `${step.result_details.description}\n\n`;
      }

      // 格式化事务详情（步骤2）
      if (step.result_details.transactions && step.result_details.transactions.length > 0) {
        report += `┌────────────┬────────────────────────────────┬──────────────┬──────────────┬──────────────┐\n`;
        report += `│ TXN ID     │ Label                          │ Publish(ms)  │ Wait(ms)     │ RPC(ms)      │\n`;
        report += `├────────────┼────────────────────────────────┼──────────────┼──────────────┼──────────────┤\n`;
        for (const txn of step.result_details.transactions.slice(0, 10)) {
          const txnId = String(txn.txn_id || '').padEnd(10).substring(0, 10);
          const label = String(txn.label || 'N/A').padEnd(30).substring(0, 30);
          const publish = String(txn.publish_total_cost_ms || 0).padStart(12);
          const wait = String(txn.wait_for_publish_cost_ms || 0).padStart(12);
          const rpc = String(txn.publish_rpc_cost_ms || 0).padStart(12);
          report += `│ ${txnId} │ ${label} │ ${publish} │ ${wait} │ ${rpc} │\n`;
        }
        report += `└────────────┴────────────────────────────────┴──────────────┴──────────────┴──────────────┘\n\n`;
      }

      // 格式化表元数据（步骤3）
      if (step.result_details.tables && step.result_details.tables.length > 0) {
        report += `┌────────────┬────────────────────────────────────────┬──────────────────┬──────────┐\n`;
        report += `│ Table ID   │ Table Name                             │ Table Model      │ Buckets  │\n`;
        report += `├────────────┼────────────────────────────────────────┼──────────────────┼──────────┤\n`;
        for (const table of step.result_details.tables) {
          const tableId = String(table.table_id || '').padEnd(10).substring(0, 10);
          const tableName = String(table.table_name || 'N/A').padEnd(38).substring(0, 38);
          const tableModel = String(table.table_model || 'N/A').padEnd(16).substring(0, 16);
          const buckets = String(table.buckets || 'N/A').padStart(8);
          report += `│ ${tableId} │ ${tableName} │ ${tableModel} │ ${buckets} │\n`;
        }
        report += `└────────────┴────────────────────────────────────────┴──────────────────┴──────────┘\n\n`;
      }

      // 格式化 CN 日志详情（步骤4）
      if (step.result_details.cn_logs && step.result_details.cn_logs.length > 0) {
        report += `┌────────────┬──────────────┬──────────────┬─────────────────────────────────────────────────┐\n`;
        report += `│ TXN ID     │ CN Cost(ms)  │ Tablets      │ 日志预览                                        │\n`;
        report += `├────────────┼──────────────┼──────────────┼─────────────────────────────────────────────────┤\n`;
        for (const cn of step.result_details.cn_logs) {
          const txnId = String(cn.txn_id || '').padEnd(10).substring(0, 10);
          const cnCost = String(cn.cn_cost_ms || 'N/A').padStart(12);
          const tablets = String(cn.tablets_count || 0).padStart(12);
          const preview = String(cn.raw_log_preview || '').substring(0, 45).padEnd(47);
          report += `│ ${txnId} │ ${cnCost} │ ${tablets} │ ${preview} │\n`;
        }
        report += `└────────────┴──────────────┴──────────────┴─────────────────────────────────────────────────┘\n\n`;
      }

      // 格式化 FE vs CN 对比（步骤4）
      if (step.result_details.fe_vs_cn_comparison && step.result_details.fe_vs_cn_comparison.length > 0) {
        report += `FE vs CN 耗时对比:\n`;
        report += `┌────────────┬──────────────────┬──────────────────┬──────────────────┐\n`;
        report += `│ TXN ID     │ FE RPC(ms)       │ CN 实际(ms)      │ 网络延迟(ms)     │\n`;
        report += `├────────────┼──────────────────┼──────────────────┼──────────────────┤\n`;
        for (const cmp of step.result_details.fe_vs_cn_comparison) {
          const txnId = String(cmp.txn_id || '').padEnd(10).substring(0, 10);
          const feRpc = String(cmp.fe_publish_rpc_ms || 0).padStart(16);
          const cnCost = String(cmp.cn_actual_cost_ms || '0.00').padStart(16);
          const network = String(cmp.estimated_network_latency_ms || '0.00').padStart(16);
          report += `│ ${txnId} │ ${feRpc} │ ${cnCost} │ ${network} │\n`;
        }
        report += `└────────────┴──────────────────┴──────────────────┴──────────────────┘\n\n`;
      }

      // 展示备注
      if (step.result_details.note) {
        report += `💡 ${step.result_details.note}\n\n`;
      }
    }

    if (analysis.next_step) {
      report += `⏭️ 下一步: 步骤 ${analysis.next_step.step} - ${analysis.next_step.name}\n`;
      report += `   ${analysis.next_step.description || ''}\n\n`;
    }

    report += `⚠️ 请更新 TODO 列表（将步骤 ${step.step} 标记为完成），然后再次调用本工具继续执行。\n`;

    if (analysis.next_action && analysis.next_action.call_with) {
      // 确保 session_id 在参数中
      const callWith = { ...analysis.next_action.call_with };
      if (sessionId && !callWith.session_id) {
        callWith.session_id = sessionId;
      }
      report += `\n📝 下次调用参数:\n\`\`\`json\n${JSON.stringify(callWith, null, 2)}\n\`\`\`\n`;
    }

    return report;
  }

  /**
   * 启动服务器
   */
  async start() {
    const server = new Server(
      {
        name: 'starrocks-expert-thin',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // 列出工具
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      // 获取远程 tools
      const remoteTools = await this.getToolsFromAPI();
      // 获取本地 tools
      const localTools = this.getLocalToolDefinitions();

      // 过滤掉远程 tools 中已在本地处理的 tools
      const filteredRemoteTools = remoteTools.filter(
        (tool) => !this.localTools[tool.name]
      );

      // 合并：本地 tools 优先
      const tools = [...localTools, ...filteredRemoteTools];
      return { tools };
    });

    // 执行工具
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name: toolName, arguments: args } = request.params;

      // 进度通知辅助函数
      const sendProgress = (progress, total, message) => {
        if (extra && extra.sendNotification) {
          try {
            extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken: request.id,
                progress,
                total,
                message,
              },
            });
          } catch (e) {
            console.error(`   [Progress] Failed to send progress: ${e.message}`);
          }
        }
      };

      // 生成请求 ID 并记录客户端请求
      const requestId = this.logger.generateRequestId();
      this.logger.logClientRequest(requestId, toolName, args);

      try {
        console.error(`\n🔧 [${requestId}] Executing tool: ${toolName}`);
        console.error(`   Arguments:`, JSON.stringify(args).substring(0, 200));

        // 检查是否是本地处理的 tool
        if (this.localTools[toolName]) {
          console.error(`   [Local] Processing ${toolName} locally...`);

          let result;
          switch (toolName) {
            case 'get_query_profile':
              result = await this.handleGetQueryProfileLocally(args, requestId);
              break;
            case 'analyze_load_profile':
              result = await this.handleAnalyzeLoadProfileLocally(args, requestId);
              break;
            case 'check_disk_io':
              result = await this.handleCheckDiskIOLocally(args, requestId);
              break;
            default:
              result = {
                content: [{ type: 'text', text: `Unknown local tool: ${toolName}` }],
              };
          }

          console.error(`   [Local] Done processing ${toolName}`);
          return result;
        }

        // 以下是远程处理流程（通过中心服务器）
        // 0. 处理文件路径参数（如果有的话）
        console.error('   Step 0: Processing file arguments...');
        const processedArgs = await this.processFileArgs(args);
        console.error('   File processing completed');

        // 0.5 检查是否有会话 ID，恢复之前的中间结果
        let restoredResults = {};
        if (processedArgs.session_id) {
          const sessionData = this.getSession(processedArgs.session_id);
          if (sessionData) {
            restoredResults = sessionData.results || {};
            console.error(`   恢复了 ${Object.keys(restoredResults).length} 个中间结果字段`);
          }
        }

        // 1. 从 API 获取需要执行的 SQL（传递处理后的 args 参数）
        console.error('   Step 1: Fetching SQL queries from Central API...');
        const queryDef = await this.getQueriesFromAPI(
          toolName,
          processedArgs,
          requestId,
        );
        console.error(`   Got ${queryDef.queries.length} queries to execute`);

        // 初始化 results，合并恢复的会话数据
        let results = { ...restoredResults };

        // 检查是否需要两阶段 profile 获取
        const metaQuery = queryDef.queries.find(
          (q) => q.type === 'meta' && q.requires_profile_fetch,
        );
        const regularQueries = queryDef.queries.filter(
          (q) => q.type !== 'meta',
        );

        // 2. 执行 SQL（如果有的话）
        if (regularQueries.length > 0) {
          console.error('   Step 2: Executing SQL queries locally...');
          const queryResults = await this.executeQueries(regularQueries, requestId);
          // 合并查询结果，保留已恢复的会话数据
          results = { ...results, ...queryResults };
          console.error('   SQL execution completed');
        } else {
          console.error(
            '   Step 2: No SQL queries to execute (args-only tool)',
          );
        }

        // 2.5 如果需要获取详细 profile，执行第二阶段查询
        if (
          metaQuery &&
          results.profile_list &&
          Array.isArray(results.profile_list)
        ) {
          console.error(
            '   Step 2.5: Fetching detailed profiles for each query...',
          );
          const fetchOptions = {
            timeRange: metaQuery.time_range || '1h',
            minDurationMs: metaQuery.min_duration_ms || 100,
          };
          results.query_profiles = await this.fetchQueryProfiles(
            results.profile_list,
            fetchOptions,
          );
          console.error(
            `   Fetched ${Object.keys(results.query_profiles).length} query profiles`,
          );

          // 2.6 如果需要获取表 schema，从 profile 中提取表名并查询
          if (metaQuery.requires_table_schema_fetch) {
            console.error(
              '   Step 2.6: Fetching table schemas for cache miss analysis...',
            );
            const tableNames = this.extractTableNamesFromProfiles(
              results.query_profiles,
            );
            console.error(
              `   Found ${tableNames.size} unique tables: ${[...tableNames].slice(0, 5).join(', ')}${tableNames.size > 5 ? '...' : ''}`,
            );
            if (tableNames.size > 0) {
              results.table_schemas = await this.fetchTableSchemas(tableNames);
              console.error(
                `   Fetched schemas for ${Object.keys(results.table_schemas).length} tables`,
              );
            }
          }
        }

        // 2.7 如果有单个 profile 查询结果且需要获取表 schema
        if (
          metaQuery &&
          metaQuery.requires_table_schema_fetch &&
          results.get_profile &&
          Array.isArray(results.get_profile) &&
          results.get_profile.length > 0 &&
          results.get_profile[0].profile
        ) {
          console.error(
            '   Step 2.7: Extracting table names from profile and fetching schemas...',
          );
          const profileText = results.get_profile[0].profile;
          const tableNames =
            this.extractTableNamesFromSingleProfile(profileText);
          console.error(
            `   Found ${tableNames.size} unique tables: ${[...tableNames].slice(0, 5).join(', ')}${tableNames.size > 5 ? '...' : ''}`,
          );
          if (tableNames.size > 0) {
            results.table_schemas = await this.fetchTableSchemas(tableNames);
            console.error(
              `   Fetched schemas for ${Object.keys(results.table_schemas).length} tables`,
            );
          }
        }

        // 3. 发送给 API 分析（支持多阶段查询）
        // 阶段名称映射（用于用户友好的进度显示）
        const phaseNames = {
          'fetch_fe_logs': '获取 FE 日志',
          'fetch_cn_logs': '获取 CN 日志',
          'fetch_logs': '获取日志',
          'discover_log_paths': '探测日志路径',
          'query_table_meta': '查询表元数据',
          'list_table_directories': '列出表目录',
          'get_garbage_sizes': '获取垃圾数据大小',
          'desc_storage_volumes': '获取存储卷详情',
          'analyze_schema': '分析表结构',
          'analyze_trace': '分析 Trace 日志',
        };

        console.error(`\n   📍 [阶段 1] 初始分析...`);
        sendProgress(1, 5, '阶段 1: 初始分析...');
        console.error(
          '   Step 3: Sending results to Central API for analysis...',
        );
        let analysis = await this.analyzeResultsWithAPI(
          toolName,
          results,
          processedArgs,
          requestId,
        );

        // 3.5 处理多阶段查询（如存储放大分析的 schema 检测）
        let phaseCount = 1;
        const maxPhases = 5; // 防止无限循环

        // 处理 step_completed 状态：存储会话并返回给客户端，让其更新 TODO 后再调用下一步
        if (analysis.status === 'step_completed') {
          console.error(`\n   ✅ 步骤完成: ${analysis.completed_step?.name || analysis.phase}`);

          // 生成或复用会话 ID
          const sessionId = processedArgs.session_id || this.generateSessionId(toolName);

          // 存储当前结果和中间数据
          const sessionData = {
            results: {
              ...results,
              _intermediate: analysis._intermediate,
            },
            args: processedArgs,
            lastCompletedStep: analysis.completed_step?.step || 0,
          };
          this.storeSession(sessionId, sessionData);

          // 在 next_action.call_with 中添加 session_id
          if (analysis.next_action && analysis.next_action.call_with) {
            analysis.next_action.call_with.session_id = sessionId;
          }

          const stepReport = this.formatStepCompletedReport(analysis, sessionId);
          return {
            content: [{ type: 'text', text: stepReport }],
            _raw: analysis,
          };
        }

        while (
          analysis.status === 'needs_more_queries' &&
          phaseCount < maxPhases
        ) {
          phaseCount++;

          // 用户友好的进度显示
          const phaseName = phaseNames[analysis.phase] || analysis.phase;
          console.error(`\n   📍 [阶段 ${phaseCount}/${maxPhases}] ${phaseName}...`);
          sendProgress(phaseCount, maxPhases, `阶段 ${phaseCount}: ${phaseName}...`);

          console.error(
            `   Step 3.${phaseCount}: Multi-phase query detected (${analysis.phase})`,
          );
          console.error(`   Message: ${analysis.message}`);

          // 检查是否需要执行 CLI 命令
          if (analysis.requires_cli_execution && analysis.cli_commands) {
            console.error(
              `   Executing ${analysis.cli_commands.length} CLI commands...`,
            );
            const cliResults = await this.executeCliCommands(
              analysis.cli_commands,
              requestId,
            );

            // 根据 phase 使用不同的结果键名
            if (analysis.phase === 'list_table_directories') {
              results.dir_listing_results = cliResults.cli_results;
              results.dir_listing_summary = cliResults.cli_summary;
              console.error(
                `   Directory listing completed: ${cliResults.cli_summary.successful} success, ${cliResults.cli_summary.failed} failed`,
              );
            } else if (analysis.phase === 'get_garbage_sizes') {
              results.garbage_size_results = cliResults.cli_results;
              results.garbage_size_summary = cliResults.cli_summary;
              console.error(
                `   Garbage size query completed: ${cliResults.cli_summary.successful} success, ${cliResults.cli_summary.failed} failed`,
              );
            } else {
              // 默认使用 cli_results/cli_summary
              results = { ...results, ...cliResults };
            }
          }

          // 检查是否需要执行 SSH 命令（用于日志分析）
          if (analysis.requires_ssh_execution && analysis.ssh_commands) {
            console.error(
              `   Executing ${analysis.ssh_commands.length} SSH commands...`,
            );

            // 从 args 中获取 SSH 配置
            const sshConfig = {
              ssh_user: processedArgs.ssh_user || analysis.next_args?.ssh_user,
              ssh_key_path:
                processedArgs.ssh_key_path || analysis.next_args?.ssh_key_path,
              ssh_password:
                processedArgs.ssh_password || analysis.next_args?.ssh_password,
            };

            const sshResults = await this.executeSshCommands(
              analysis.ssh_commands,
              sshConfig,
              requestId,
            );

            // 根据 phase 使用不同的结果键名
            if (analysis.phase === 'discover_log_paths') {
              results.discovered_log_paths = sshResults.ssh_results;
              results.discover_log_paths_summary = sshResults.ssh_summary;
              console.error(
                `   Log path discovery completed: ${sshResults.ssh_summary.successful} success, ${sshResults.ssh_summary.failed} failed`,
              );
            } else if (analysis.phase === 'fetch_logs') {
              results.log_contents = sshResults.ssh_results;
              results.fetch_logs_summary = sshResults.ssh_summary;
              console.error(
                `   Log fetch completed: ${sshResults.ssh_summary.successful} success, ${sshResults.ssh_summary.failed} failed`,
              );
            } else {
              // 默认使用 ssh_results/ssh_summary
              results = { ...results, ...sshResults };
            }
          }

          // 检查是否需要调用其他工具（工具间调用）
          if (analysis.requires_tool_call && analysis.tool_name) {
            console.error(
              `   Calling tool: ${analysis.tool_name} with full args:`,
              JSON.stringify(analysis.tool_args || {}),
            );
            console.error(
              `   DEBUG: context_lines = ${analysis.tool_args?.context_lines}`,
            );
            // DEBUG: 写入日志文件
            fs.appendFileSync('/tmp/mcp-debug.log', `\n[${new Date().toISOString()}] requires_tool_call: ${analysis.tool_name}\n  tool_args: ${JSON.stringify(analysis.tool_args)}\n  context_lines: ${analysis.tool_args?.context_lines}\n`);

            // 递归调用指定的工具
            const toolResult = await this.handleSolutionCTool(
              analysis.tool_name,
              analysis.tool_args || {},
              requestId,
            );

            // 把工具结果存储到 results 中
            const resultKey = analysis.tool_result_key || `${analysis.tool_name}_result`;
            results[resultKey] = toolResult;
            console.error(
              `   Tool ${analysis.tool_name} completed, result stored as: ${resultKey}`,
            );
          }

          // 执行下一阶段的 SQL 查询
          if (analysis.next_queries && analysis.next_queries.length > 0) {
            console.error(
              `   Executing ${analysis.next_queries.length} additional queries...`,
            );
            const additionalResults = await this.executeQueries(
              analysis.next_queries,
              requestId,
            );

            // 特殊处理 desc_storage_volumes phase：将 desc_volume_<name> 结果转换为 storage_volume_details 格式
            if (analysis.phase === 'desc_storage_volumes') {
              const storageVolumeDetails = {};
              for (const [key, value] of Object.entries(additionalResults)) {
                if (key.startsWith('desc_volume_')) {
                  const volumeName = key.replace('desc_volume_', '');
                  storageVolumeDetails[volumeName] = value;
                }
              }
              if (Object.keys(storageVolumeDetails).length > 0) {
                results.storage_volume_details = storageVolumeDetails;
                console.error(
                  `   Converted ${Object.keys(storageVolumeDetails).length} volume details to storage_volume_details format`,
                );
              }
            } else {
              results = { ...results, ...additionalResults };
            }
          }

          // 使用更新后的参数再次调用分析 API
          const nextArgs = analysis.next_args || processedArgs;
          console.error(`   Re-analyzing with updated args...`);
          analysis = await this.analyzeResultsWithAPI(
            toolName,
            results,
            nextArgs,
            requestId,
          );
        }

        if (phaseCount >= maxPhases) {
          console.error(
            '   Warning: Max phases reached, analysis may be incomplete',
          );
        }

        // 检查 while 循环后是否变为 step_completed 状态
        // 这种情况发生在 needs_more_queries 循环中最后一次调用返回 step_completed 时
        if (analysis.status === 'step_completed') {
          console.error(`\n   ✅ 步骤完成 (循环后): ${analysis.completed_step?.name || analysis.phase}`);

          // 存储会话数据
          const sessionId = processedArgs.session_id || this.generateSessionId(toolName);
          const sessionData = {
            results: { ...results, _intermediate: analysis._intermediate },
            processedArgs,
            toolName,
            timestamp: Date.now(),
          };
          this.storeSession(sessionId, sessionData);

          // 确保下一步调用参数中包含 session_id
          if (analysis.next_action && analysis.next_action.call_with) {
            analysis.next_action.call_with.session_id = sessionId;
          }

          const stepReport = this.formatStepCompletedReport(analysis, sessionId);
          return {
            content: [{ type: 'text', text: stepReport }],
            _raw: analysis,
          };
        }

        // 显示总阶段数
        if (phaseCount > 1) {
          console.error(`\n   ✅ 多阶段分析完成 (共 ${phaseCount} 个阶段)`);
          sendProgress(phaseCount, phaseCount, `✅ 分析完成 (共 ${phaseCount} 个阶段)`);
        } else {
          sendProgress(1, 1, '✅ 分析完成');
        }

        // 显示分析方式（便于用户确认是否使用了 CLI 扫描）
        if (analysis.calculation_method) {
          const methodNames = {
            object_storage_cli: '对象存储 CLI 扫描',
            direct_query: '直接查询 STORAGE_SIZE',
            cli_fallback: 'CLI 回退模式',
          };
          const methodName =
            methodNames[analysis.calculation_method] ||
            analysis.calculation_method;
          console.error(`   📊 数据获取方式: ${methodName}`);

          if (analysis.cli_execution_summary) {
            const s = analysis.cli_execution_summary;
            console.error(
              `   📈 CLI 执行统计: 总计 ${s.total}, 成功 ${s.successful}, 失败 ${s.failed}, 耗时 ${s.execution_time_ms}ms`,
            );
          }
        }
        console.error('   Analysis completed\n');

        // 4. 格式化报告
        const report = this.formatAnalysisReport(analysis);

        // 对于 HTML 报告，写入文件并移除大内容避免传输阻塞
        const analysisForJson = { ...analysis };
        if (analysis.html_content && analysis.output_path) {
          try {
            fs.writeFileSync(
              analysis.output_path,
              analysis.html_content,
              'utf-8',
            );
            console.error(`   HTML report written to: ${analysis.output_path}`);
          } catch (writeErr) {
            console.error(
              `   Failed to write HTML report: ${writeErr.message}`,
            );
          }
          // 移除大的 HTML 内容，只保留关键信息
          analysisForJson.html_content = `[HTML Content Removed - ${Math.round(analysis.html_content.length / 1024)}KB]`;
          console.error(
            `   Removed large HTML content (${Math.round(analysis.html_content.length / 1024)}KB) from JSON response`,
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
            {
              type: 'text',
              text: JSON.stringify(analysisForJson, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('Tool execution error:', error);

        return {
          content: [
            {
              type: 'text',
              text: `❌ 工具执行失败: ${error.message}\n\n请检查:\n1. 中心 API 是否运行 (${this.centralAPI})\n2. 数据库连接是否正常 (${this.dbConfig.host}:${this.dbConfig.port})\n3. API Token 是否正确`,
            },
          ],
          isError: true,
        };
      }
    });

    // 启动 Stdio 传输
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('✅ Thin MCP Server started successfully');
    console.error('   Waiting for requests from Gemini CLI...\n');
  }
}

// 启动服务器
const server = new ThinMCPServer();
server.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
