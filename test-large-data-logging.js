#!/usr/bin/env node

/**
 * 测试大数据日志摘要功能
 *
 * 验证 Logger 能够正确处理大数据，避免打爆日志文件
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 简化的 Logger 类（包含新的摘要功能）
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
    const sensitiveKeys = ['password', 'token', 'apiToken', 'api_token', 'secret'];
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

  logCentralRequest(requestId, method, url, body = null) {
    this.write('INFO', 'CENTRAL_REQUEST', 'Sending request to central API', {
      requestId,
      method,
      url,
      body: body ? this.summarizeHttpBody(body) : null,
    });
  }

  logCentralResponse(requestId, url, status, data, error = null) {
    const level = error ? 'ERROR' : 'INFO';
    const message = error ? 'Central API request failed' : 'Received response from central API';

    let dataSize = 0;
    let dataSummary = null;

    if (data) {
      const dataStr = JSON.stringify(data);
      dataSize = dataStr.length;

      if (dataSize > 5120) {
        dataSummary = {
          _truncated: true,
          sizeBytes: dataSize,
          sizeKB: (dataSize / 1024).toFixed(2),
          sizeMB: (dataSize / 1024 / 1024).toFixed(2),
          keys: typeof data === 'object' ? Object.keys(data).slice(0, 10) : undefined,
          totalKeys: typeof data === 'object' ? Object.keys(data).length : undefined,
        };
      } else {
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

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

// 生成大数据对象
function generateLargeData(sizeKB) {
  const data = [];
  const targetSize = sizeKB * 1024;
  let currentSize = 0;

  while (currentSize < targetSize) {
    const row = {
      id: data.length,
      name: `Item ${data.length}`,
      description: 'A'.repeat(100),
      timestamp: new Date().toISOString(),
      metadata: {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      },
    };
    data.push(row);
    currentSize = JSON.stringify(data).length;
  }

  return data;
}

// 测试函数
async function runTests() {
  console.log('🧪 测试大数据日志摘要功能...\n');

  const testLogDir = path.join(__dirname, 'logs-test-large');
  const logger = new Logger(testLogDir);

  // 测试1: 小请求（应该完整记录）
  console.log('1️⃣  测试小请求（< 2KB）');
  const requestId1 = logger.generateRequestId();
  const smallBody = {
    args: { database: 'test_db' },
    results: { count: 42, status: 'ok' },
  };
  logger.logCentralRequest(requestId1, 'POST', 'http://localhost:80/api/analyze/test', smallBody);
  console.log(`   ✅ 小请求已记录，大小: ${JSON.stringify(smallBody).length} 字节\n`);

  // 测试2: 中等请求（args 小，results 大）
  console.log('2️⃣  测试中等请求（results 约 10KB）');
  const requestId2 = logger.generateRequestId();
  const mediumBody = {
    args: { database: 'test_db' },
    results: generateLargeData(10),
  };
  const mediumSize = JSON.stringify(mediumBody).length;
  logger.logCentralRequest(requestId2, 'POST', 'http://localhost:80/api/analyze/test', mediumBody);
  console.log(`   ✅ 中等请求已记录（摘要），实际大小: ${(mediumSize / 1024).toFixed(2)} KB\n`);

  // 测试3: 大请求（args 和 results 都很大）
  console.log('3️⃣  测试大请求（results 约 100KB）');
  const requestId3 = logger.generateRequestId();
  const largeBody = {
    args: { database: 'test_db', large_data: generateLargeData(10) },
    results: generateLargeData(100),
  };
  const largeSize = JSON.stringify(largeBody).length;
  logger.logCentralRequest(requestId3, 'POST', 'http://localhost:80/api/analyze/test', largeBody);
  console.log(`   ✅ 大请求已记录（摘要），实际大小: ${(largeSize / 1024).toFixed(2)} KB\n`);

  // 测试4: 小响应（应该完整记录）
  console.log('4️⃣  测试小响应（< 5KB）');
  const smallResponse = {
    status: 'success',
    data: { analysis: 'ok', score: 95 },
  };
  logger.logCentralResponse(requestId1, 'http://localhost:80/api/analyze/test', 200, smallResponse);
  console.log(`   ✅ 小响应已记录，大小: ${JSON.stringify(smallResponse).length} 字节\n`);

  // 测试5: 大响应（应该记录摘要）
  console.log('5️⃣  测试大响应（约 50KB）');
  const largeResponse = {
    status: 'success',
    data: generateLargeData(50),
    metadata: { timestamp: new Date().toISOString() },
  };
  const responseSize = JSON.stringify(largeResponse).length;
  logger.logCentralResponse(requestId3, 'http://localhost:80/api/analyze/test', 200, largeResponse);
  console.log(`   ✅ 大响应已记录（摘要），实际大小: ${(responseSize / 1024).toFixed(2)} KB\n`);

  // 测试6: 超大响应（约 500KB）
  console.log('6️⃣  测试超大响应（约 500KB）');
  const hugeResponse = {
    status: 'success',
    data: generateLargeData(500),
    analysis: { detailed: true },
  };
  const hugeSize = JSON.stringify(hugeResponse).length;
  logger.logCentralResponse(requestId3, 'http://localhost:80/api/analyze/test', 200, hugeResponse);
  console.log(`   ✅ 超大响应已记录（摘要），实际大小: ${(hugeSize / 1024).toFixed(2)} KB (${(hugeSize / 1024 / 1024).toFixed(2)} MB)\n`);

  // 关闭日志流
  logger.close();

  // 等待一下让日志写入完成
  await new Promise(resolve => setTimeout(resolve, 100));

  // 验证日志文件
  console.log('📋 验证日志文件...\n');
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(testLogDir, `mcp-server-${today}.log`);

  if (fs.existsSync(logFile)) {
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const logFileSize = logContent.length;
    const logLines = logContent.trim().split('\n');

    console.log(`   ✅ 日志文件已创建: ${logFile}`);
    console.log(`   📊 日志文件大小: ${(logFileSize / 1024).toFixed(2)} KB`);
    console.log(`   📊 日志条目数量: ${logLines.length}\n`);

    // 计算如果不使用摘要，日志文件会有多大
    const totalDataSize = mediumSize + largeSize + responseSize + hugeSize;
    console.log(`   💡 原始数据总大小: ${(totalDataSize / 1024).toFixed(2)} KB`);
    console.log(`   💡 压缩比: ${((1 - logFileSize / totalDataSize) * 100).toFixed(2)}%`);
    console.log(`   💡 节省空间: ${((totalDataSize - logFileSize) / 1024).toFixed(2)} KB\n`);

    // 检查是否包含 _truncated 标记
    const truncatedCount = (logContent.match(/_truncated/g) || []).length;
    console.log(`   ✅ 找到 ${truncatedCount} 处数据摘要标记\n`);

    // 显示部分日志内容
    console.log('📄 日志内容示例:\n');
    const sampleLines = [0, 1, 4]; // 显示第1、2、5条日志
    sampleLines.forEach(index => {
      if (index < logLines.length) {
        const entry = JSON.parse(logLines[index]);
        console.log(`   条目 ${index + 1} (${entry.type}):`);
        console.log(`   - 消息: ${entry.message}`);
        if (entry.body) {
          console.log(`   - Body: ${entry.body._truncated ? '已截断' : '完整'}`);
          if (entry.body._truncated) {
            console.log(`   - 原始大小: ${entry.body.sizeKB} KB`);
          }
        }
        if (entry.data) {
          console.log(`   - Data: ${entry.data._truncated ? '已截断' : '完整'}`);
          if (entry.data._truncated) {
            console.log(`   - 原始大小: ${entry.data.sizeKB} KB`);
          }
        }
        console.log('');
      }
    });

  } else {
    console.log('   ❌ 日志文件未创建');
  }

  console.log('✅ 测试完成！');
  console.log(`\n💡 提示: 查看完整日志请运行: cat ${logFile} | jq .`);
  console.log(`💡 清理测试日志请运行: rm -rf ${testLogDir}`);
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
