#!/usr/bin/env node
/**
 * 测试 analyze_failed_load_job 的日志拉取功能
 */

import mysql from 'mysql2/promise';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function test() {
  console.log('=== 测试 analyze_failed_load_job 日志拉取 ===\n');

  // 1. 连接数据库获取节点信息
  const connection = await mysql.createConnection({
    host: process.env.SR_HOST || '172.26.92.212',
    port: parseInt(process.env.SR_PORT || '19030'),
    user: process.env.SR_USER || 'root',
    password: process.env.SR_PASSWORD || '',
  });

  console.log('1. 查询节点信息...');

  // 查询 FE
  const [frontends] = await connection.query('SHOW FRONTENDS');
  console.log(`   FE 节点: ${frontends.length} 个`);
  frontends.forEach(fe => console.log(`     - ${fe.IP || fe.Host}: ${fe.Role}`));

  // 查询 BE
  const [backends] = await connection.query('SHOW BACKENDS');
  console.log(`   BE 节点: ${backends.length} 个`);
  backends.forEach(be => console.log(`     - ${be.IP || be.Host}`));

  // 查询 CN
  let compute_nodes = [];
  try {
    const [cns] = await connection.query('SHOW COMPUTE NODES');
    compute_nodes = cns;
    console.log(`   CN 节点: ${cns.length} 个`);
    cns.forEach(cn => console.log(`     - ${cn.IP || cn.Host}`));
  } catch (e) {
    console.log(`   CN 节点: 不支持或无数据`);
  }

  await connection.end();

  // 2. 构建节点列表
  const nodes = [];

  for (const fe of frontends) {
    const ip = fe.Host || fe.IP || fe.host || fe.ip;
    if (ip) {
      nodes.push({ ip, type: 'fe', node_type: 'fe' });
    }
  }

  for (const be of backends) {
    const ip = be.Host || be.IP || be.host || be.ip;
    if (ip) {
      nodes.push({ ip, type: 'be', node_type: 'be' });
    }
  }

  for (const cn of compute_nodes) {
    const ip = cn.Host || cn.IP || cn.host || cn.ip;
    if (ip) {
      nodes.push({ ip, type: 'cn', node_type: 'cn' });
    }
  }

  console.log(`\n2. 构建节点列表: ${nodes.length} 个节点`);
  nodes.forEach(n => console.log(`   - ${n.ip} (${n.type})`));

  // 3. 测试 SSH 日志拉取命令
  console.log('\n3. 测试 SSH 日志拉取...');

  const keywords = ['4692d692-360e-40b3-9b25-675502ded58d', 'load_id=163412'];
  const grepPattern = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  for (const node of nodes) {
    console.log(`\n   测试节点: ${node.ip} (${node.type})`);

    // 发现日志路径
    let discoverCmd;
    if (node.type === 'fe') {
      discoverCmd = `ps aux | grep starrocks | grep -oP '(?<=log_dir=)[^\\s]+' | head -1 || echo "/opt/starrocks/fe/log"`;
    } else {
      discoverCmd = `ps aux | grep starrocks | grep -oP '(?<=sys_log_dir=)[^\\s]+' | head -1 || echo "/opt/starrocks/be/log"`;
    }

    const sshUser = 'dingkai';
    const sshKeyPath = '/home/disk1/dingkai/.ssh/id_rsa';
    const sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i ${sshKeyPath} ${sshUser}@${node.ip}`;

    try {
      // 发现日志路径
      const { stdout: logDir } = await execAsync(`${sshCmd} "${discoverCmd}"`, { timeout: 10000 });
      const logPath = logDir.trim() || (node.type === 'fe' ? '/opt/starrocks/fe/log' : '/opt/starrocks/be/log');
      console.log(`     日志路径: ${logPath}`);

      // 搜索日志
      const logFile = node.type === 'fe' ? 'fe.log*' : node.type === 'cn' ? 'cn.log*' : 'be.log*';
      const fetchCmd = `find ${logPath} -name "${logFile}" -mtime -7 2>/dev/null | head -5 | xargs grep -ahE "${grepPattern}" 2>/dev/null | head -20`;

      console.log(`     执行命令: ${fetchCmd}`);

      const { stdout: logContent } = await execAsync(`${sshCmd} '${fetchCmd}'`, { timeout: 30000 });

      if (logContent.trim()) {
        console.log(`     ✅ 找到日志内容 (${logContent.split('\n').length} 行):`);
        console.log('     ---');
        console.log(logContent.substring(0, 1000));
        if (logContent.length > 1000) console.log('     ... (截断)');
        console.log('     ---');
      } else {
        console.log(`     ⚠️ 未找到匹配的日志`);
      }
    } catch (e) {
      console.log(`     ❌ 错误: ${e.message}`);
    }
  }

  console.log('\n=== 测试完成 ===');
}

test().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
