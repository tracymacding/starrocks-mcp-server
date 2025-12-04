#!/bin/bash

# StarRocks Local Agent Installation Script
# 一键安装 Local Agent 到用户本地环境

set -e

echo "========================================="
echo "  StarRocks Local Agent Installer"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js
echo -n "Checking Node.js... "
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗${NC}"
    echo "Error: Node.js is not installed. Please install Node.js 18+ first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗${NC}"
    echo "Error: Node.js version must be 18 or higher. Current: $(node -v)"
    exit 1
fi
echo -e "${GREEN}✓${NC} $(node -v)"

# 检查 npm
echo -n "Checking npm... "
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗${NC}"
    echo "Error: npm is not installed."
    exit 1
fi
echo -e "${GREEN}✓${NC} $(npm -v)"

# 安装目录
INSTALL_DIR="${HOME}/.starrocks-agent"
echo ""
echo "Installation directory: ${INSTALL_DIR}"

# 创建安装目录
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠${NC}  Installation directory already exists."
    read -p "Do you want to reinstall? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    rm -rf "$INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 下载文件（从 GitHub 或本地复制）
echo ""
echo "Installing files..."

# 如果脚本在 mcp-example 目录中运行，从本地复制
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/local-agent.js" ]; then
    echo "  Copying from local source..."
    cp "$SCRIPT_DIR/local-agent.js" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/" 2>/dev/null || echo '{"type": "module"}' > "$INSTALL_DIR/package.json"
else
    echo "  Downloading from repository..."
    # TODO: 从 GitHub 下载
    echo -e "${RED}✗${NC} Remote installation not implemented yet."
    echo "Please run this script from the mcp-example directory."
    exit 1
fi

# 安装依赖
echo ""
echo "Installing dependencies..."
npm install --production express mysql2 > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Dependencies installed"

# 创建配置文件
echo ""
echo "Creating configuration..."

# 生成随机 token
AGENT_TOKEN=$(openssl rand -hex 32)

cat > "$INSTALL_DIR/.env" << EOF
# StarRocks Database Configuration
SR_HOST=localhost
SR_PORT=9030
SR_USER=root
SR_PASSWORD=
SR_DATABASE=information_schema

# Agent Configuration
AGENT_PORT=8080

# Security - Agent Token (KEEP THIS SECRET!)
# This token will be used by the remote MCP server to authenticate
AGENT_TOKEN=${AGENT_TOKEN}

# CORS - Comma-separated list of allowed origins
ALLOWED_ORIGINS=*
EOF

echo -e "${GREEN}✓${NC} Configuration file created: ${INSTALL_DIR}/.env"

# 创建启动脚本
cat > "$INSTALL_DIR/start-agent.sh" << 'EOF'
#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Start the agent
echo "Starting StarRocks Local Agent..."
node local-agent.js
EOF

chmod +x "$INSTALL_DIR/start-agent.sh"

# 创建停止脚本
cat > "$INSTALL_DIR/stop-agent.sh" << 'EOF'
#!/bin/bash

# Find and kill the agent process
PID=$(ps aux | grep 'node local-agent.js' | grep -v grep | awk '{print $2}')

if [ -z "$PID" ]; then
    echo "Agent is not running."
    exit 0
fi

echo "Stopping agent (PID: $PID)..."
kill $PID
echo "Agent stopped."
EOF

chmod +x "$INSTALL_DIR/stop-agent.sh"

# 创建状态检查脚本
cat > "$INSTALL_DIR/status.sh" << 'EOF'
#!/bin/bash

# Check if agent is running
PID=$(ps aux | grep 'node local-agent.js' | grep -v grep | awk '{print $2}')

if [ -z "$PID" ]; then
    echo "Status: Not running"
    exit 1
fi

echo "Status: Running (PID: $PID)"

# Test health endpoint
if command -v curl &> /dev/null; then
    echo ""
    curl -s http://localhost:8080/health | json_pp 2>/dev/null || curl -s http://localhost:8080/health
fi
EOF

chmod +x "$INSTALL_DIR/status.sh"

# 完成
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Installation completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Installation directory: ${INSTALL_DIR}"
echo ""
echo "Next steps:"
echo "  1. Edit configuration:"
echo "     ${YELLOW}vi ${INSTALL_DIR}/.env${NC}"
echo "     (Configure your StarRocks database connection)"
echo ""
echo "  2. Start the agent:"
echo "     ${YELLOW}cd ${INSTALL_DIR} && ./start-agent.sh${NC}"
echo ""
echo "  3. Check status:"
echo "     ${YELLOW}cd ${INSTALL_DIR} && ./status.sh${NC}"
echo ""
echo "Your agent token (save this for MCP server configuration):"
echo -e "  ${GREEN}${AGENT_TOKEN}${NC}"
echo ""
echo "Add this to your central MCP server's tenants-config.json:"
echo ""
cat << EOFCONFIG
{
  "tenants": {
    "your_tenant_id": {
      "name": "Your Company",
      "agent_url": "http://your-agent-host:8080",
      "agent_token": "${AGENT_TOKEN}",
      "enabled": true
    }
  }
}
EOFCONFIG
echo ""
