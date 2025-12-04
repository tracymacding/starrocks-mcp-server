#!/usr/bin/env node

/**
 * 日志功能测试脚本
 *
 * 用于验证 Logger 类的各项功能
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 简化的 Logger 类（从 starrocks-mcp.js 复制）
class Logger {
  constructor(logDir = './logs') {
    this.logDir = logDir;
    this.currentDate = null;
    this.logStream = null;
    this.requestId = 0;

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.initLogStream();
  }

  initLogStream() {
    const today = new Date().toISOString().split('T')[0];

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

  generateRequestId() {
    this.requestId++;
    return `req_${Date.now()}_${this.requestId}`;
  }

  sanitize(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveKeys = ['password', 'token', 'apiToken', 'api_token', 'secret', 'ssh_password', 'SR_PASSWORD', 'CENTRAL_API_TOKEN'];

    const maskValue = (obj) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
          obj[key] = obj[key] ? '***MASKED***' : '';
        } else if (typeof obj[key] === 'object') {
          maskValue(obj[key]);
        }
      }
    };

    maskValue(sanitized);
    return sanitized;
  }

  write(level, type, message, data = {}) {
    this.initLogStream();

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      type,
      message,
      ...this.sanitize(data),
    };

    this.logStream.write(JSON.stringify(logEntry) + '\n');
  }

  logClientRequest(requestId, toolName, args) {
    this.write('INFO', 'CLIENT_REQUEST', 'Received request from client', {
      requestId,
      toolName,
      args: this.sanitize(args),
    });
  }

  logCentralRequest(requestId, method, url, body = null) {
    this.write('INFO', 'CENTRAL_REQUEST', 'Sending request to central API', {
      requestId,
      method,
      url,
      body: body ? this.sanitize(body) : null,
    });
  }

  logCentralResponse(requestId, url, status, data, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error ? 'Central API request failed' : 'Received response from central API';

    this.write(level, 'CENTRAL_RESPONSE', message, {
      requestId,
      url,
      status,
      dataSize: data ? JSON.stringify(data).length : 0,
      error: error ? error.message : null,
    });
  }

  logDatabaseQuery(requestId, queryId, sql, queryType = 'sql') {
    this.write('INFO', 'DB_QUERY', 'Executing database query', {
      requestId,
      queryId,
      queryType,
      sql: sql ? (sql.length > 200 ? sql.substring(0, 200) + '...' : sql) : null,
    });
  }

  logDatabaseResult(requestId, queryId, rowCount, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error ? 'Database query failed' : 'Database query completed';

    this.write(level, 'DB_RESULT', message, {
      requestId,
      queryId,
      rowCount,
      error: error ? error.message : null,
    });
  }

  logPrometheusQuery(requestId, queryId, query, queryType) {
    this.write('INFO', 'PROMETHEUS_QUERY', 'Executing Prometheus query', {
      requestId,
      queryId,
      queryType,
      query: query ? (query.length > 200 ? query.substring(0, 200) + '...' : query) : null,
    });
  }

  logPrometheusResult(requestId, queryId, resultSize, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error ? 'Prometheus query failed' : 'Prometheus query completed';

    this.write(level, 'PROMETHEUS_RESULT', message, {
      requestId,
      queryId,
      resultSize,
      error: error ? error.message : null,
    });
  }

  logError(requestId, message, error) {
    this.write('ERROR', 'ERROR', message, {
      requestId,
      error: error.message,
      stack: error.stack,
    });
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

// 测试函数
async function runTests() {
  console.log('🧪 开始测试日志功能...\n');

  const testLogDir = path.join(__dirname, 'logs-test');
  const logger = new Logger(testLogDir);

  console.log('1️⃣  测试客户端请求日志');
  const requestId1 = logger.generateRequestId();
  logger.logClientRequest(requestId1, 'analyze_storage_health', {
    database: 'test_db',
    password: 'secret123', // 应该被脱敏
  });
  console.log('   ✅ CLIENT_REQUEST 日志已记录\n');

  console.log('2️⃣  测试中心服务器请求日志');
  logger.logCentralRequest(requestId1, 'POST', 'http://localhost:80/api/queries/test', {
    args: { api_token: 'abc123' }, // 应该被脱敏
  });
  console.log('   ✅ CENTRAL_REQUEST 日志已记录\n');

  console.log('3️⃣  测试中心服务器响应日志（成功）');
  logger.logCentralResponse(requestId1, 'http://localhost:80/api/queries/test', 200, {
    queries: [{ id: 'test', sql: 'SELECT 1' }],
  });
  console.log('   ✅ CENTRAL_RESPONSE 日志已记录\n');

  console.log('4️⃣  测试中心服务器响应日志（失败）');
  const requestId2 = logger.generateRequestId();
  logger.logCentralResponse(requestId2, 'http://localhost:80/api/queries/test', 500, null,
    new Error('Internal Server Error'));
  console.log('   ✅ CENTRAL_RESPONSE (错误) 日志已记录\n');

  console.log('5️⃣  测试数据库查询日志');
  logger.logDatabaseQuery(requestId1, 'storage_metrics',
    'SELECT * FROM information_schema.be_tablets WHERE database_name = ?', 'sql');
  console.log('   ✅ DB_QUERY 日志已记录\n');

  console.log('6️⃣  测试数据库查询结果日志（成功）');
  logger.logDatabaseResult(requestId1, 'storage_metrics', 42);
  console.log('   ✅ DB_RESULT 日志已记录\n');

  console.log('7️⃣  测试数据库查询结果日志（失败）');
  const requestId3 = logger.generateRequestId();
  logger.logDatabaseResult(requestId3, 'failed_query', 0,
    new Error('Table not found'));
  console.log('   ✅ DB_RESULT (错误) 日志已记录\n');

  console.log('8️⃣  测试 Prometheus 查询日志');
  logger.logPrometheusQuery(requestId1, 'cpu_usage',
    'rate(process_cpu_seconds_total[5m])', 'prometheus_range');
  console.log('   ✅ PROMETHEUS_QUERY 日志已记录\n');

  console.log('9️⃣  测试 Prometheus 查询结果日志');
  logger.logPrometheusResult(requestId1, 'cpu_usage', 567);
  console.log('   ✅ PROMETHEUS_RESULT 日志已记录\n');

  console.log('🔟 测试通用错误日志');
  logger.logError(requestId1, 'Database connection failed',
    new Error('ECONNREFUSED'));
  console.log('   ✅ ERROR 日志已记录\n');

  // 关闭日志流
  logger.close();

  // 验证日志文件
  console.log('📋 验证日志文件...');
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(testLogDir, `mcp-server-${today}.log`);

  if (fs.existsSync(logFile)) {
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const logLines = logContent.trim().split('\n');

    console.log(`   ✅ 日志文件已创建: ${logFile}`);
    console.log(`   📊 日志条目数量: ${logLines.length}`);

    console.log('\n📄 日志内容预览:');
    logLines.slice(0, 3).forEach((line, index) => {
      const entry = JSON.parse(line);
      console.log(`\n   条目 ${index + 1}:`);
      console.log(`   类型: ${entry.type}`);
      console.log(`   消息: ${entry.message}`);
      console.log(`   请求ID: ${entry.requestId || 'N/A'}`);
    });

    // 验证敏感信息脱敏
    console.log('\n🔒 验证敏感信息脱敏...');
    const sensitiveFound = logContent.includes('secret123') || logContent.includes('abc123');
    if (sensitiveFound) {
      console.log('   ❌ 发现未脱敏的敏感信息！');
    } else {
      console.log('   ✅ 敏感信息已正确脱敏');
    }

    const maskedFound = logContent.includes('***MASKED***');
    if (maskedFound) {
      console.log('   ✅ 找到脱敏标记');
    }

  } else {
    console.log('   ❌ 日志文件未创建');
  }

  console.log('\n✅ 测试完成！');
  console.log(`\n💡 提示: 查看完整日志请运行: cat ${logFile}`);
  console.log(`💡 清理测试日志请运行: rm -rf ${testLogDir}`);
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
