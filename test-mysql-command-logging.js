#!/usr/bin/env node

/**
 * 测试 MySQL 命令记录功能
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 简化的 Logger 类（包含 MySQL 命令生成功能）
class Logger {
  constructor(logDir = './logs', enabled = true) {
    this.enabled = enabled;
    this.logDir = logDir;
    this.currentDate = null;
    this.logStream = null;
    this.requestId = 0;

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

  generateMysqlCommand(dbConfig, sql) {
    if (!dbConfig) {
      return null;
    }

    const parts = ['mysql'];

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
      // 完整打印密码（不脱敏）
      parts.push(`-p'${dbConfig.password}'`);
    }

    if (sql) {
      const displaySql = sql.length > 200 ? sql.substring(0, 200) + '...' : sql;
      const escapedDisplaySql = displaySql.replace(/'/g, "\\'");
      parts.push(`-e '${escapedDisplaySql}'`);
    }

    return parts.join(' ');
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

  logDatabaseQuery(requestId, queryId, sql, queryType = 'sql', dbConfig = null) {
    const logData = {
      requestId,
      queryId,
      queryType,
      sql: sql ? (sql.length > 200 ? sql.substring(0, 200) + '...' : sql) : null,
    };

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

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

async function runTests() {
  console.log('🧪 测试 MySQL 命令记录功能...\n');

  const testLogDir = path.join(__dirname, 'logs-test-mysql');
  const logger = new Logger(testLogDir, true);

  // 模拟数据库配置
  const dbConfig = {
    host: 'localhost',
    port: 9030,
    user: 'root',
    password: 'secret123',
  };

  console.log('📋 数据库配置:');
  console.log(`   Host: ${dbConfig.host}`);
  console.log(`   Port: ${dbConfig.port}`);
  console.log(`   User: ${dbConfig.user}`);
  console.log(`   Password: ***MASKED***\n`);

  // 测试1: 短 SQL 查询
  console.log('1️⃣  测试短 SQL 查询');
  const shortSql = 'SELECT * FROM information_schema.tables LIMIT 10';
  logger.logDatabaseQuery('req_123', 'query_1', shortSql, 'sql', dbConfig);
  console.log(`   SQL: ${shortSql}`);
  console.log(`   MySQL 命令: ${logger.generateMysqlCommand(dbConfig, shortSql)}\n`);

  // 测试2: 长 SQL 查询（会被截断）
  console.log('2️⃣  测试长 SQL 查询（超过 200 字符）');
  const longSql = 'SELECT ' + 'column_name, '.repeat(50) + 'FROM my_table WHERE condition = 1';
  logger.logDatabaseQuery('req_123', 'query_2', longSql, 'sql', dbConfig);
  console.log(`   SQL 长度: ${longSql.length} 字符`);
  console.log(`   MySQL 命令: ${logger.generateMysqlCommand(dbConfig, longSql).substring(0, 100)}...\n`);

  // 测试3: 包含单引号的 SQL
  console.log('3️⃣  测试包含单引号的 SQL');
  const sqlWithQuotes = "SELECT * FROM users WHERE name = 'Alice' AND status = 'active'";
  logger.logDatabaseQuery('req_123', 'query_3', sqlWithQuotes, 'sql', dbConfig);
  console.log(`   SQL: ${sqlWithQuotes}`);
  console.log(`   MySQL 命令: ${logger.generateMysqlCommand(dbConfig, sqlWithQuotes)}\n`);

  // 测试4: 不同的数据库配置
  console.log('4️⃣  测试不同的数据库配置');
  const dbConfig2 = {
    host: '192.168.1.100',
    port: 3306,
    user: 'admin',
    // 无密码
  };
  const sql4 = 'SHOW DATABASES';
  logger.logDatabaseQuery('req_124', 'query_4', sql4, 'sql', dbConfig2);
  console.log(`   MySQL 命令: ${logger.generateMysqlCommand(dbConfig2, sql4)}\n`);

  // 测试5: 不传递 dbConfig（向后兼容）
  console.log('5️⃣  测试不传递 dbConfig（向后兼容）');
  const sql5 = 'SELECT NOW()';
  logger.logDatabaseQuery('req_125', 'query_5', sql5, 'sql', null);
  console.log(`   ✅ 不传递 dbConfig 也能正常工作\n`);

  // 关闭日志流
  logger.close();

  // 等待写入完成
  await new Promise(resolve => setTimeout(resolve, 100));

  // 验证日志文件
  console.log('📋 验证日志文件...\n');
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(testLogDir, `mcp-server-${today}.log`);

  if (fs.existsSync(logFile)) {
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const logLines = logContent.trim().split('\n');

    console.log(`   ✅ 日志文件已创建: ${logFile}`);
    console.log(`   📊 日志条目数量: ${logLines.length}\n`);

    // 检查每条日志是否包含 mysqlCommand
    let withCommandCount = 0;
    let withoutCommandCount = 0;

    logLines.forEach((line, index) => {
      const entry = JSON.parse(line);
      if (entry.mysqlCommand) {
        withCommandCount++;
      } else {
        withoutCommandCount++;
      }
    });

    console.log(`   📊 包含 MySQL 命令的日志: ${withCommandCount}`);
    console.log(`   📊 不包含 MySQL 命令的日志: ${withoutCommandCount}\n`);

    // 显示第一条日志的详细内容
    console.log('📄 第一条日志示例:\n');
    const firstLog = JSON.parse(logLines[0]);
    console.log(`   查询 ID: ${firstLog.queryId}`);
    console.log(`   SQL: ${firstLog.sql}`);
    console.log(`   MySQL 命令: ${firstLog.mysqlCommand}`);
    console.log(`   连接信息:`);
    console.log(`     - Host: ${firstLog.connectionInfo?.host}`);
    console.log(`     - Port: ${firstLog.connectionInfo?.port}`);
    console.log(`     - User: ${firstLog.connectionInfo?.user}`);
    console.log(`     - Password: ${firstLog.connectionInfo?.password}\n`);

    // 验证密码是否完整打印
    console.log('🔑 验证密码完整打印...');
    const hasPlainPassword = logContent.includes('secret123');
    const hasMaskedPassword = logContent.includes('***MASKED***');

    if (hasPlainPassword) {
      console.log('   ✅ 密码完整打印（未脱敏）');
    } else {
      console.log('   ❌ 密码未找到！');
    }

    if (hasMaskedPassword) {
      console.log('   ❌ 发现脱敏标记（不应该出现）\n');
    } else {
      console.log('   ✅ 没有脱敏标记（符合预期）\n');
    }

  } else {
    console.log('   ❌ 日志文件未创建');
  }

  console.log('✅ 测试完成！');
  console.log(`\n💡 提示: 查看完整日志请运行: cat ${logFile} | jq .`);
  console.log(`💡 清理测试日志请运行: rm -rf ${testLogDir}`);
}

runTests().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
