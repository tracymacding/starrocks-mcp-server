#!/bin/bash

# Solution C 中心 API 服务器启动脚本
# 架构：Thin MCP Server 执行 SQL，中心 API 只做分析

echo "🚀 启动 Solution C 中心 API 服务器..."
echo ""
echo "架构说明："
echo "  - SQL 执行: Thin MCP Server（客户端）"
echo "  - 数据分析: Central API Server（服务端）"
echo ""

cd "$(dirname "$0")"

# 检查端口是否被占用
if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  端口 80 已被占用，正在停止旧进程..."
    pkill -f "node index-expert-api"
    sleep 2
fi

# 启动服务器
echo "📡 服务器将运行在 http://localhost:80"
echo ""

node index-expert-api-solutionc.js

# 说明：
# - 如果要在后台运行，使用：node index-expert-api-solutionc.js > logs/solution-c.log 2>&1 &
# - 查看日志：tail -f logs/solution-c.log
# - 停止服务器：pkill -f "node index-expert-api-solutionc"
