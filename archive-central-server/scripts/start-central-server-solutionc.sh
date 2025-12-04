#!/bin/bash

##
# 启动中心 API 服务器 - Solution C 版本
# 架构：客户端执行 SQL + 服务器端分析
# 适用场景：客户端有 StarRocks 数据库，服务器仅提供分析能力
##

set -e

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动 StarRocks 中心 API 服务器 (Solution C)${NC}"
echo "================================================"
echo ""

# 切换到 mcp-example 目录
cd "$(dirname "$0")"

# 加载环境变量
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo -e "${GREEN}✅ 已加载 .env 配置${NC}"
else
    echo -e "${YELLOW}⚠️  .env 文件不存在，使用默认配置${NC}"
fi

# 设置默认值
export API_HOST=${API_HOST:-0.0.0.0}
export API_PORT=${API_PORT:-3002}
export API_KEY=${API_KEY:-demo-key}

echo ""
echo -e "${BLUE}📋 当前配置:${NC}"
echo "   API 绑定: $API_HOST:$API_PORT"
echo "   API Key: ${API_KEY:0:8}..."
echo ""

echo -e "${BLUE}✨ 架构模式: Solution C${NC}"
echo "   - SQL 执行: 客户端（Thin MCP Server）"
echo "   - 数据分析: 服务器端（本服务器）"
echo "   - 数据库要求: ${GREEN}服务器端无需数据库${NC}"
echo ""

echo -e "${GREEN}🎯 启动服务器...${NC}"
echo ""

# 启动 Solution C 服务器
exec node index-expert-api-solutionc.js
