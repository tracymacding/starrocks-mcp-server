#!/bin/bash

##
# Solution C 中心 API 服务器启动脚本
##

set -e

# 配置
API_PORT="${API_PORT:-3002}"
API_KEY="${API_KEY:-demo-key}"
USE_PM2="${USE_PM2:-false}"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动 StarRocks Central API 服务器${NC}"
echo "=================================="
echo

# 显示配置
echo -e "${YELLOW}配置:${NC}"
echo "  端口: $API_PORT"
echo "  API Key: ${API_KEY:0:8}..."
echo "  工作目录: $(pwd)"
echo

# 检查端口是否已被占用
if lsof -Pi :$API_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ 端口 $API_PORT 已被占用${NC}"
    echo
    echo "已运行的进程:"
    lsof -Pi :$API_PORT -sTCP:LISTEN
    echo
    echo "请选择:"
    echo "  1. 停止现有进程: kill \$(lsof -t -i:$API_PORT)"
    echo "  2. 使用其他端口: export API_PORT=3003"
    exit 1
fi

# 创建日志目录
mkdir -p logs

# 根据方式启动
if [ "$USE_PM2" = "true" ]; then
    echo -e "${YELLOW}使用 PM2 启动...${NC}"

    # 检查 PM2 是否安装
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}❌ PM2 未安装${NC}"
        echo "请先安装: npm install -g pm2"
        exit 1
    fi

    # 检查是否已经在运行
    if pm2 list | grep -q "starrocks-api"; then
        echo -e "${YELLOW}服务已在运行，将重启...${NC}"
        pm2 restart starrocks-api
    else
        # 启动
        export API_PORT=$API_PORT
        export API_KEY=$API_KEY
        pm2 start ecosystem.config.cjs
    fi

    echo
    echo -e "${GREEN}✅ 服务已启动 (PM2)${NC}"
    echo
    echo "管理命令:"
    echo "  查看状态: pm2 status"
    echo "  查看日志: pm2 logs starrocks-api"
    echo "  重启服务: pm2 restart starrocks-api"
    echo "  停止服务: pm2 stop starrocks-api"
    echo "  删除服务: pm2 delete starrocks-api"
    echo

    # 显示当前状态
    pm2 list

else
    echo -e "${YELLOW}使用 Node.js 直接启动...${NC}"
    echo "提示: 设置 USE_PM2=true 使用 PM2 管理进程"
    echo

    # 前台运行
    export API_PORT=$API_PORT
    export API_KEY=$API_KEY

    echo -e "${GREEN}✅ 启动中...${NC}"
    echo "按 Ctrl+C 停止服务"
    echo

    node index-expert-api.js
fi
