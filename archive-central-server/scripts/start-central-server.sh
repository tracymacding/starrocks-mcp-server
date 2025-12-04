#!/bin/bash

##
# 启动中心 API 服务器
# 包含所有 11 个 Expert 和 33 个工具
##

set -e

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动 StarRocks 中心 API 服务器${NC}"
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
export SR_HOST=${SR_HOST:-localhost}
export SR_USER=${SR_USER:-root}
export SR_PASSWORD=${SR_PASSWORD:-}
export SR_DATABASE=${SR_DATABASE:-information_schema}
export SR_PORT=${SR_PORT:-9030}

echo ""
echo -e "${BLUE}📋 当前配置:${NC}"
echo "   API 绑定: $API_HOST:$API_PORT"
echo "   API Key: ${API_KEY:0:8}..."
echo "   数据库: $SR_USER@$SR_HOST:$SR_PORT"
echo ""

# 检查数据库连接
echo -e "${BLUE}🔍 检查数据库连接...${NC}"
if command -v mysql &> /dev/null; then
    if mysql -h "$SR_HOST" -P "$SR_PORT" -u "$SR_USER" ${SR_PASSWORD:+-p"$SR_PASSWORD"} -e "SELECT 1" &> /dev/null; then
        echo -e "${GREEN}   ✅ 数据库连接正常${NC}"
    else
        echo -e "${YELLOW}   ⚠️  数据库连接失败，但服务器仍会启动${NC}"
        echo "   请确保 StarRocks 正在运行"
    fi
else
    echo -e "${YELLOW}   ⚠️  mysql 客户端未安装，跳过连接检查${NC}"
fi

echo ""
echo -e "${GREEN}🎯 启动服务器...${NC}"
echo ""

# 启动服务器
exec node index-expert-api-complete.js
