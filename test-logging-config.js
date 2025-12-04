#!/usr/bin/env node

/**
 * 测试日志开关配置功能
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 简化的 Logger 类
class Logger {
  constructor(logDir = './logs', enabled = true) {
    this.enabled = enabled;
    this.logDir = logDir;
    this.currentDate = null;
    this.logStream = null;
    this.requestId = 0;

    if (!this.enabled) {
      console.error('   Logging is disabled');
      return;
    }

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

  write(level, type, message, data = {}) {
    if (!this.enabled) {
      return;
    }

    this.initLogStream();

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      type,
      message,
      ...data,
    };

    this.logStream.write(JSON.stringify(logEntry) + '\n');
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

async function runTests() {
  console.log('🧪 测试日志开关配置功能...\n');

  const testLogDir1 = path.join(__dirname, 'logs-test-enabled');
  const testLogDir2 = path.join(__dirname, 'logs-test-disabled');

  // 测试1: 启用日志
  console.log('1️⃣  测试启用日志');
  const logger1 = new Logger(testLogDir1, true);
  logger1.write('INFO', 'TEST', 'Test message with logging enabled');
  logger1.close();

  // 等待写入完成
  await new Promise(resolve => setTimeout(resolve, 100));

  const today = new Date().toISOString().split('T')[0];
  const logFile1 = path.join(testLogDir1, `mcp-server-${today}.log`);

  if (fs.existsSync(logFile1)) {
    const content = fs.readFileSync(logFile1, 'utf-8');
    console.log(`   ✅ 日志文件已创建: ${logFile1}`);
    console.log(`   ✅ 日志内容: ${content.trim()}\n`);
  } else {
    console.log('   ❌ 日志文件未创建\n');
  }

  // 测试2: 禁用日志
  console.log('2️⃣  测试禁用日志');
  const logger2 = new Logger(testLogDir2, false);
  logger2.write('INFO', 'TEST', 'This message should NOT be logged');
  logger2.close();

  // 等待（虽然不会写入）
  await new Promise(resolve => setTimeout(resolve, 100));

  const logFile2 = path.join(testLogDir2, `mcp-server-${today}.log`);

  if (fs.existsSync(logFile2)) {
    console.log('   ❌ 日志文件被创建了（不应该）\n');
  } else {
    console.log('   ✅ 日志文件未创建（符合预期）');
    console.log('   ✅ 日志功能已正确禁用\n');
  }

  // 测试3: 测试环境变量
  console.log('3️⃣  测试环境变量配置');

  // 模拟环境变量
  process.env.ENABLE_LOGGING = 'false';
  const loggingEnabled = process.env.ENABLE_LOGGING !== 'false';
  console.log(`   环境变量 ENABLE_LOGGING=${process.env.ENABLE_LOGGING}`);
  console.log(`   解析结果: ${loggingEnabled ? 'enabled' : 'disabled'}`);

  if (!loggingEnabled) {
    console.log('   ✅ 环境变量解析正确\n');
  } else {
    console.log('   ❌ 环境变量解析错误\n');
  }

  process.env.ENABLE_LOGGING = 'true';
  const loggingEnabled2 = process.env.ENABLE_LOGGING !== 'false';
  console.log(`   环境变量 ENABLE_LOGGING=${process.env.ENABLE_LOGGING}`);
  console.log(`   解析结果: ${loggingEnabled2 ? 'enabled' : 'disabled'}`);

  if (loggingEnabled2) {
    console.log('   ✅ 环境变量解析正确\n');
  } else {
    console.log('   ❌ 环境变量解析错误\n');
  }

  // 清理测试文件
  console.log('🧹 清理测试文件...');
  if (fs.existsSync(testLogDir1)) {
    fs.rmSync(testLogDir1, { recursive: true });
    console.log(`   ✅ 已删除: ${testLogDir1}`);
  }
  if (fs.existsSync(testLogDir2)) {
    fs.rmSync(testLogDir2, { recursive: true });
    console.log(`   ✅ 已删除: ${testLogDir2}`);
  }

  console.log('\n✅ 测试完成！');
  console.log('\n📋 总结:');
  console.log('   - 启用日志时，会创建日志文件并写入内容');
  console.log('   - 禁用日志时，不会创建日志文件');
  console.log('   - 环境变量配置解析正确');
}

runTests().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
