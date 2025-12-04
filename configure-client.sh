#!/bin/bash

###############################################################################
# Gemini CLI 客户端配置脚本
# 用途: 自动配置 Gemini CLI 连接到中心服务器
# 使用: ./configure-client.sh
###############################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "   Gemini CLI 客户端配置向导"
echo "   连接到 StarRocks Expert 中心服务器"
echo "════════════════════════════════════════════════════════════════"
echo ""

# 检查是否在正确的目录
if [ ! -f "starrocks-mcp.js" ]; then
    print_error "请在 starrocks-mcp-server 目录下运行此脚本"
    exit 1
fi

# 第 1 步: 获取中心服务器信息
echo "第 1 步: 配置中心服务器信息"
echo "────────────────────────────────────────────────────────"

read -p "中心服务器地址 (例如: 192.168.1.100): " SERVER_IP
if [ -z "$SERVER_IP" ]; then
    print_error "服务器地址不能为空"
    exit 1
fi

read -p "中心服务器端口 [默认: 80]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-80}

CENTRAL_API="http://${SERVER_IP}:${SERVER_PORT}"

echo ""
print_info "测试中心服务器连接..."
if curl -s -m 5 "${CENTRAL_API}/health" > /dev/null 2>&1; then
    print_success "服务器可达 ✓"
else
    print_warning "无法连接到服务器，请确认服务器地址和端口正确"
    read -p "是否继续配置? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
read -p "API Key (部署中心服务器时生成的密钥): " API_KEY
if [ -z "$API_KEY" ]; then
    print_warning "未设置 API Key，某些功能可能无法使用"
    API_KEY="demo-key"
fi

# 第 2 步: 配置本地数据库
echo ""
echo "第 2 步: 配置本地 StarRocks 数据库"
echo "────────────────────────────────────────────────────────"

read -p "StarRocks 主机 [默认: localhost]: " SR_HOST
SR_HOST=${SR_HOST:-localhost}

read -p "StarRocks 端口 [默认: 9030]: " SR_PORT
SR_PORT=${SR_PORT:-9030}

read -p "StarRocks 用户名 [默认: root]: " SR_USER
SR_USER=${SR_USER:-root}

read -s -p "StarRocks 密码 (留空表示无密码): " SR_PASSWORD
echo

# 测试数据库连接
echo ""
print_info "测试数据库连接..."
if command -v mysql &> /dev/null; then
    if [ -z "$SR_PASSWORD" ]; then
        if mysql -h "$SR_HOST" -P "$SR_PORT" -u "$SR_USER" -e "SELECT 1" 2>/dev/null; then
            print_success "数据库连接成功 ✓"
        else
            print_warning "数据库连接失败，请检查配置"
        fi
    else
        if mysql -h "$SR_HOST" -P "$SR_PORT" -u "$SR_USER" -p"$SR_PASSWORD" -e "SELECT 1" 2>/dev/null; then
            print_success "数据库连接成功 ✓"
        else
            print_warning "数据库连接失败，请检查配置"
        fi
    fi
else
    print_warning "未安装 mysql 客户端，跳过数据库连接测试"
fi

# 第 3 步: 安装 MCP 客户端
echo ""
echo "第 3 步: 安装 MCP 客户端"
echo "────────────────────────────────────────────────────────"

MCP_DIR="$HOME/.starrocks-mcp"

if [ -d "$MCP_DIR" ]; then
    print_warning "MCP 客户端目录已存在: $MCP_DIR"
    read -p "是否重新安装? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$MCP_DIR"
        print_info "已删除旧的 MCP 客户端"
    fi
fi

if [ ! -d "$MCP_DIR" ]; then
    print_info "安装 MCP 客户端到 $MCP_DIR"

    mkdir -p "$MCP_DIR"
    cp starrocks-mcp.js "$MCP_DIR/"

    # 安装依赖
    cd "$MCP_DIR"
    npm init -y > /dev/null 2>&1
    npm install @modelcontextprotocol/sdk mysql2 dotenv > /dev/null 2>&1
    cd - > /dev/null

    print_success "MCP 客户端安装完成"
fi

# 第 4 步: 创建配置文件
echo ""
echo "第 4 步: 创建配置文件"
echo "────────────────────────────────────────────────────────"

# 创建 .env 文件
print_info "创建 $MCP_DIR/.env"
cat > "$MCP_DIR/.env" <<EOF
# StarRocks 数据库配置（本地数据库）
SR_HOST=$SR_HOST
SR_USER=$SR_USER
SR_PASSWORD=$SR_PASSWORD
SR_PORT=$SR_PORT

# 中心 API 配置
CENTRAL_API=$CENTRAL_API
CENTRAL_API_TOKEN=$API_KEY
EOF

print_success ".env 配置文件已创建"

# 创建 Gemini CLI settings.json
GEMINI_DIR="$HOME/.gemini"
SETTINGS_FILE="$GEMINI_DIR/settings.json"

mkdir -p "$GEMINI_DIR"

print_info "创建 $SETTINGS_FILE"
cat > "$SETTINGS_FILE" <<EOF
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": [
        "$MCP_DIR/starrocks-mcp.js"
      ],
      "env": {
        "SR_HOST": "$SR_HOST",
        "SR_USER": "$SR_USER",
        "SR_PASSWORD": "$SR_PASSWORD",
        "SR_PORT": "$SR_PORT",
        "CENTRAL_API": "$CENTRAL_API",
        "CENTRAL_API_TOKEN": "$API_KEY"
      }
    }
  }
}
EOF

print_success "Gemini CLI 配置文件已创建"

# 第 5 步: 验证配置
echo ""
echo "第 5 步: 验证配置"
echo "────────────────────────────────────────────────────────"

# 测试中心 API
if [ -n "$API_KEY" ]; then
    print_info "测试中心 API 连接..."
    HEALTH_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" "${CENTRAL_API}/health" 2>/dev/null || echo "")

    if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
        print_success "中心 API 连接成功 ✓"

        # 获取工具数量
        TOOLS_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" "${CENTRAL_API}/api/tools" 2>/dev/null || echo "")
        TOOLS_COUNT=$(echo "$TOOLS_RESPONSE" | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")

        if [ "$TOOLS_COUNT" -gt 0 ]; then
            print_success "发现 $TOOLS_COUNT 个可用工具 ✓"
        fi
    else
        print_warning "中心 API 连接失败，请检查服务器状态和 API Key"
    fi
fi

# 完成
echo ""
echo "════════════════════════════════════════════════════════════════"
print_success "配置完成！"
echo "════════════════════════════════════════════════════════════════"
echo ""

print_info "配置摘要:"
echo "  中心服务器: $CENTRAL_API"
echo "  API Key: ${API_KEY:0:10}..."
echo "  本地数据库: $SR_HOST:$SR_PORT"
echo "  MCP 客户端: $MCP_DIR"
echo "  Gemini 配置: $SETTINGS_FILE"
echo ""

print_info "下一步:"
echo "  1. 启动 Gemini CLI:"
echo "     cd /home/disk5/dingkai/github/gemini-cli"
echo "     ./start-gemini-cli.sh"
echo ""
echo "  2. 在 Gemini CLI 中测试:"
echo "     > /mcp list"
echo "     > 请帮我分析 StarRocks 的存储健康状况"
echo ""

print_info "配置文件位置:"
echo "  ~/.starrocks-mcp/.env"
echo "  ~/.gemini/settings.json"
echo ""

print_warning "如需修改配置，请编辑上述文件后重启 Gemini CLI"
echo ""
