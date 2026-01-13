#!/usr/bin/env node
/**
 * 端到端测试 - 通过 stdin/stdout 与 MCP Server 交互
 */

import { spawn } from 'child_process';

async function test() {
  console.log('=== 端到端测试 analyze_failed_load_job ===\n');

  // 启动 MCP Server
  const server = spawn('node', ['starrocks-mcp.js'], {
    cwd: '/home/disk5/dingkai/github/starrocks-mcp-server',
    env: {
      ...process.env,
      SR_HOST: '172.26.92.212',
      SR_PORT: '19030',
      SR_USER: 'root',
      SR_PASSWORD: '',
      CENTRAL_API: 'http://127.0.0.1:3002',
      CENTRAL_API_TOKEN: '5e4e3dfd350d6bd685472327fcf00036fcb4e0ea6129e9d5f4bf17de5a6692d7',
    },
  });

  // 收集 stderr 输出（调试日志）
  server.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  // 收集 stdout 输出（MCP 响应）
  let response = '';
  server.stdout.on('data', (data) => {
    response += data.toString();
    // 检查是否收到完整的 JSON-RPC 响应
    const lines = response.split('\n');
    for (const line of lines) {
      if (line.trim() && line.startsWith('{')) {
        try {
          const json = JSON.parse(line);
          console.log('\n=== MCP 响应 ===');
          console.log(JSON.stringify(json, null, 2));
        } catch (e) {
          // 继续等待完整响应
        }
      }
    }
  });

  // 等待服务器启动
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 发送 MCP 初始化请求
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    },
  };
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 发送工具调用请求
  const toolRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'analyze_failed_load_job',
      arguments: {
        label: '4692d692-360e-40b3-9b25-675502ded58d',
        ssh_user: 'dingkai',
        ssh_key_path: '/home/disk1/dingkai/.ssh/id_rsa',
      },
    },
  };

  console.log('\n发送工具请求 (第1次，获取计划):', JSON.stringify(toolRequest, null, 2));
  server.stdin.write(JSON.stringify(toolRequest) + '\n');

  // 等待第一次响应
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 发送第二次调用继续执行
  const toolRequest2 = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'analyze_failed_load_job',
      arguments: {
        label: '4692d692-360e-40b3-9b25-675502ded58d',
        ssh_user: 'dingkai',
        ssh_key_path: '/home/disk1/dingkai/.ssh/id_rsa',
      },
    },
  };
  console.log('\n发送工具请求 (第2次，开始执行):', JSON.stringify(toolRequest2, null, 2));
  server.stdin.write(JSON.stringify(toolRequest2) + '\n');

  // 等待执行完成（可能需要较长时间）
  await new Promise(resolve => setTimeout(resolve, 120000));

  server.kill();
  console.log('\n=== 测试完成 ===');
}

test().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
