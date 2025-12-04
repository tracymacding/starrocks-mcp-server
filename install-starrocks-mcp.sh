#!/bin/bash

##
# StarRocks Thin MCP Server - One-Click Installation Script
#
# This script installs the lightweight MCP server on client machines
# to enable StarRocks diagnostics through Gemini CLI.
#
# Features:
# - Checks Node.js version (>= 18)
# - Installs to ~/.starrocks-mcp/
# - Creates configuration file
# - Provides Gemini CLI configuration example
##

set -e

echo "🚀 StarRocks Thin MCP Server Installation"
echo "========================================"
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "   Please install Node.js >= 18.0.0 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version is too old ($(node -v))${NC}"
    echo "   Required: >= 18.0.0"
    echo "   Please upgrade Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✅ Node.js version: $(node -v)${NC}"
echo

# Installation directory
INSTALL_DIR="$HOME/.starrocks-mcp"
echo "📁 Installation directory: $INSTALL_DIR"

# Create installation directory
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  Directory already exists. Backing up...${NC}"
    mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%s)"
fi

mkdir -p "$INSTALL_DIR"
echo -e "${GREEN}✅ Created installation directory${NC}"
echo

# Download or copy files
echo "📥 Installing files..."

# Assuming this script is in the mcp-example directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy StarRocks MCP Server
if [ -f "$SCRIPT_DIR/starrocks-mcp.js" ]; then
    cp "$SCRIPT_DIR/starrocks-mcp.js" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/starrocks-mcp.js"
    echo -e "${GREEN}✅ Copied starrocks-mcp.js${NC}"
else
    echo -e "${RED}❌ starrocks-mcp.js not found${NC}"
    exit 1
fi

# Create package.json for dependencies
cat > "$INSTALL_DIR/package.json" <<'EOF'
{
  "name": "starrocks-thin-mcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "dotenv": "^17.2.3",
    "mysql2": "^3.11.5"
  }
}
EOF
echo -e "${GREEN}✅ Created package.json${NC}"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$INSTALL_DIR"
npm install --silent > /dev/null 2>&1
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo

# Create configuration file
echo "⚙️  Creating configuration file..."
cat > "$INSTALL_DIR/.env" <<EOF
# StarRocks 数据库配置（客户本地数据库）
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=
SR_PORT=9030

# 中心 API 配置
CENTRAL_API=http://localhost:80
CENTRAL_API_TOKEN=

# 注意事项：
# 1. 请修改 SR_HOST, SR_USER, SR_PASSWORD 为你的实际数据库配置
# 2. 如果使用远程 API，修改 CENTRAL_API 为实际地址（如 https://api.your-domain.com）
# 3. 如果 API 需要认证，设置 CENTRAL_API_TOKEN
EOF
echo -e "${GREEN}✅ Created .env configuration file${NC}"
echo

# Create Gemini CLI configuration instructions
GEMINI_CONFIG_PATH="$HOME/.gemini/settings.json"
cat > "$INSTALL_DIR/GEMINI_CONFIG_EXAMPLE.json" <<EOF
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["$INSTALL_DIR/starrocks-mcp.js"],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "your_password",
        "SR_PORT": "9030",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": ""
      }
    }
  }
}
EOF
echo -e "${GREEN}✅ Created Gemini CLI configuration example${NC}"
echo

# Success message
echo
echo -e "${GREEN}🎉 Installation completed successfully!${NC}"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "📋 Next Steps:"
echo
echo "1. Configure database connection:"
echo -e "   ${YELLOW}nano $INSTALL_DIR/.env${NC}"
echo "   Update SR_HOST, SR_USER, SR_PASSWORD with your StarRocks credentials"
echo
echo "2. Configure Gemini CLI:"
echo -e "   ${YELLOW}nano $GEMINI_CONFIG_PATH${NC}"
echo "   Add the MCP server configuration from:"
echo -e "   ${YELLOW}$INSTALL_DIR/GEMINI_CONFIG_EXAMPLE.json${NC}"
echo
echo "3. Test the installation:"
echo "   Start Gemini CLI and run:"
echo -e "   ${YELLOW}/mcp-list-tools${NC}"
echo "   You should see StarRocks expert tools"
echo
echo "4. Try a diagnostic command:"
echo -e "   ${YELLOW}请帮我分析 StarRocks 的存储健康状况${NC}"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "📚 Documentation:"
echo "   Installation directory: $INSTALL_DIR"
echo "   Configuration file: $INSTALL_DIR/.env"
echo "   Gemini config example: $INSTALL_DIR/GEMINI_CONFIG_EXAMPLE.json"
echo
echo "🆘 Support:"
echo "   If you encounter issues, check:"
echo "   - Database connection: Can you connect to StarRocks?"
echo "   - API connection: Is the Central API running?"
echo "   - Logs: Check Gemini CLI output for errors"
echo
echo -e "${GREEN}✨ Happy diagnosing!${NC}"
echo
