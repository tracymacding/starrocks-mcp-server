#!/usr/bin/env node

/**
 * 测试环境变量日志记录功能
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

    if (!this.enabled) {
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

  write(level, type, message, data = {}, skipSanitize = false) {
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

  logEnvironmentVariables() {
    const envVars = {};
    const sortedKeys = Object.keys(process.env).sort();
    sortedKeys.forEach((key) => {
      envVars[key] = process.env[key];
    });

    // 跳过脱敏，完整记录所有环境变量
    this.write('INFO', 'STARTUP', 'Environment variables at startup', {
      environmentVariables: envVars,
    }, true);
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

async function runTests() {
  console.log('🧪 测试环境变量日志记录功能...\n');

  const testLogDir = path.join(__dirname, 'logs-test-env');

  // 设置一些测试环境变量
  process.env.TEST_VAR_1 = 'test_value_1';
  process.env.TEST_VAR_2 = 'test_value_2';
  process.env.TEST_PASSWORD = 'secret123';

  const logger = new Logger(testLogDir, true);

  console.log('1️⃣  记录环境变量到日志文件');
  logger.logEnvironmentVariables();
  logger.close();

  // 等待写入完成
  await new Promise(resolve => setTimeout(resolve, 100));

  // 验证日志文件
  console.log('\n📋 验证日志文件...\n');
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(testLogDir, `mcp-server-${today}.log`);

  if (fs.existsSync(logFile)) {
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const logLines = logContent.trim().split('\n');

    console.log(`   ✅ 日志文件已创建: ${logFile}`);
    console.log(`   📊 日志条目数量: ${logLines.length}\n`);

    // 解析并显示日志内容
    const logEntry = JSON.parse(logLines[logLines.length - 1]);

    console.log('📄 日志内容:\n');
    console.log(`   类型: ${logEntry.type}`);
    console.log(`   消息: ${logEntry.message}`);
    console.log(`   时间戳: ${logEntry.timestamp}\n`);

    // 检查环境变量
    console.log('🔍 检查环境变量记录:\n');
    const envVars = logEntry.environmentVariables;

    if (envVars) {
      const testVarKeys = Object.keys(envVars).filter(k => k.startsWith('TEST_'));
      console.log(`   ✅ 找到 ${testVarKeys.length} 个测试环境变量:`);
      testVarKeys.forEach(key => {
        console.log(`      ${key}=${envVars[key]}`);
      });

      // 检查密码是否完整记录
      if (envVars.TEST_PASSWORD === 'secret123') {
        console.log('\n   ✅ 密码完整记录（未脱敏）');
      } else {
        console.log('\n   ❌ 密码未正确记录');
      }

      // 显示环境变量总数
      console.log(`\n   📊 记录的环境变量总数: ${Object.keys(envVars).length}`);

      // 显示前 5 个环境变量
      console.log('\n   📋 前 5 个环境变量（按字母顺序）:');
      const sortedKeys = Object.keys(envVars).sort().slice(0, 5);
      sortedKeys.forEach(key => {
        const value = envVars[key];
        const displayValue = value && value.length > 50 ? value.substring(0, 50) + '...' : value;
        console.log(`      ${key}=${displayValue}`);
      });

    } else {
      console.log('   ❌ 环境变量未记录');
    }

    // 显示日志文件大小
    const stats = fs.statSync(logFile);
    console.log(`\n   📦 日志文件大小: ${stats.size} 字节 (${(stats.size / 1024).toFixed(2)} KB)`);

  } else {
    console.log('   ❌ 日志文件未创建');
  }

  console.log('\n✅ 测试完成！');
  console.log(`\n💡 提示: 查看完整日志请运行: cat ${logFile} | jq .environmentVariables`);
  console.log(`💡 清理测试日志请运行: rm -rf ${testLogDir}`);
}

runTests().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
