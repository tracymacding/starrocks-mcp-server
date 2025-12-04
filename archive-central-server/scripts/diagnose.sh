#!/bin/bash

##
# Solution C 诊断脚本
# 检查所有组件是否正常工作
##

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔍 Solution C 完整诊断${NC}"
echo "=================================="
echo

# 记录问题
ISSUES=()

# 1. 检查 API 服务器
echo -e "${BLUE}1️⃣  检查中心 API 服务器${NC}"
echo "-----------------------------------"
if curl -s http://localhost:80/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:80/health | jq -r '.status')
    UPTIME=$(curl -s http://localhost:80/health | jq -r '.uptime')
    echo -e "${GREEN}   ✅ API 服务器运行正常${NC}"
    echo "      状态: $HEALTH"
    echo "      运行时间: ${UPTIME}秒"

    # 检查工具列表
    TOOLS_RESPONSE=$(curl -s http://localhost:80/api/tools -H "X-API-Key: demo-key")
    if echo "$TOOLS_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        ERROR_MSG=$(echo "$TOOLS_RESPONSE" | jq -r '.message')
        echo -e "${RED}   ❌ API 认证失败: $ERROR_MSG${NC}"
        ISSUES+=("API 认证失败 - 检查 API_KEY 是否正确")
    else
        TOOLS_COUNT=$(echo "$TOOLS_RESPONSE" | jq -r '.tools | length')
        echo -e "${GREEN}   ✅ API 返回工具数量: $TOOLS_COUNT${NC}"
        if [ "$TOOLS_COUNT" != "3" ]; then
            echo -e "${YELLOW}   ⚠️  期望 3 个工具，实际返回 $TOOLS_COUNT${NC}"
            ISSUES+=("工具数量不正确")
        fi
    fi
else
    echo -e "${RED}   ❌ API 服务器未运行或无法访问${NC}"
    echo -e "${YELLOW}   💡 解决方案:${NC}"
    echo "      cd $(pwd)"
    echo "      ./start-api-server.sh"
    ISSUES+=("API 服务器未运行")
fi
echo

# 2. 检查 Thin MCP Server 安装
echo -e "${BLUE}2️⃣  检查 Thin MCP Server 安装${NC}"
echo "-----------------------------------"
MCP_DIR=~/.starrocks-mcp
if [ -d "$MCP_DIR" ]; then
    echo -e "${GREEN}   ✅ 安装目录存在: $MCP_DIR${NC}"

    # 检查必要文件
    if [ -f "$MCP_DIR/thin-mcp-server.js" ]; then
        echo -e "${GREEN}   ✅ thin-mcp-server.js 存在${NC}"
    else
        echo -e "${RED}   ❌ thin-mcp-server.js 不存在${NC}"
        ISSUES+=("Thin MCP Server 文件缺失")
    fi

    if [ -f "$MCP_DIR/.env" ]; then
        echo -e "${GREEN}   ✅ .env 配置文件存在${NC}"
    else
        echo -e "${RED}   ❌ .env 配置文件不存在${NC}"
        ISSUES+=(".env 配置文件缺失")
    fi

    if [ -d "$MCP_DIR/node_modules" ]; then
        echo -e "${GREEN}   ✅ node_modules 已安装${NC}"
    else
        echo -e "${RED}   ❌ node_modules 未安装${NC}"
        ISSUES+=("npm 依赖未安装")
    fi
else
    echo -e "${RED}   ❌ 安装目录不存在: $MCP_DIR${NC}"
    echo -e "${YELLOW}   💡 解决方案:${NC}"
    echo "      cd $(pwd)"
    echo "      ./install-starrocks-mcp.sh"
    ISSUES+=("Thin MCP Server 未安装")
fi
echo

# 3. 检查 Gemini CLI 配置
echo -e "${BLUE}3️⃣  检查 Gemini CLI 配置${NC}"
echo "-----------------------------------"
GEMINI_CONFIG=~/.gemini/settings.json
if [ -f "$GEMINI_CONFIG" ]; then
    echo -e "${GREEN}   ✅ Gemini 配置文件存在${NC}"

    # 检查 JSON 格式
    if jq empty "$GEMINI_CONFIG" 2>/dev/null; then
        echo -e "${GREEN}   ✅ JSON 格式正确${NC}"

        # 检查 MCP 服务器配置
        if jq -e '.mcpServers."starrocks-expert"' "$GEMINI_CONFIG" > /dev/null 2>&1; then
            echo -e "${GREEN}   ✅ MCP 服务器已配置: starrocks-expert${NC}"

            # 检查命令和参数
            MCP_COMMAND=$(jq -r '.mcpServers."starrocks-expert".command' "$GEMINI_CONFIG")
            MCP_ARGS=$(jq -r '.mcpServers."starrocks-expert".args[0]' "$GEMINI_CONFIG")
            echo "      命令: $MCP_COMMAND"
            echo "      脚本: $MCP_ARGS"

            # 检查脚本文件是否存在
            if [ -f "$MCP_ARGS" ]; then
                echo -e "${GREEN}   ✅ MCP 脚本文件存在${NC}"
            else
                echo -e "${RED}   ❌ MCP 脚本文件不存在: $MCP_ARGS${NC}"
                ISSUES+=("MCP 脚本路径配置错误")
            fi

            # 检查环境变量配置
            CENTRAL_API=$(jq -r '.mcpServers."starrocks-expert".env.CENTRAL_API' "$GEMINI_CONFIG")
            API_TOKEN=$(jq -r '.mcpServers."starrocks-expert".env.CENTRAL_API_TOKEN' "$GEMINI_CONFIG")
            echo "      Central API: $CENTRAL_API"
            echo "      API Token: ${API_TOKEN:0:8}..."

        else
            echo -e "${RED}   ❌ MCP 服务器未配置${NC}"
            echo -e "${YELLOW}   💡 解决方案:${NC}"
            echo "      参考: ~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json"
            echo "      编辑: nano ~/.gemini/settings.json"
            ISSUES+=("Gemini MCP 服务器未配置")
        fi
    else
        echo -e "${RED}   ❌ JSON 格式错误${NC}"
        ISSUES+=("Gemini 配置 JSON 格式错误")
    fi
else
    echo -e "${RED}   ❌ Gemini 配置文件不存在${NC}"
    ISSUES+=("Gemini 配置文件不存在")
fi
echo

# 4. 测试 MCP 服务器通信
echo -e "${BLUE}4️⃣  测试 MCP 服务器通信${NC}"
echo "-----------------------------------"
if [ -f ~/.starrocks-mcp/thin-mcp-server.js ] && [ -f ~/.gemini/settings.json ]; then
    echo "   测试 MCP 协议通信..."

    # 提取环境变量
    SR_HOST=$(jq -r '.mcpServers."starrocks-expert".env.SR_HOST // "localhost"' "$GEMINI_CONFIG" 2>/dev/null)
    SR_USER=$(jq -r '.mcpServers."starrocks-expert".env.SR_USER // "root"' "$GEMINI_CONFIG" 2>/dev/null)
    SR_PASSWORD=$(jq -r '.mcpServers."starrocks-expert".env.SR_PASSWORD // ""' "$GEMINI_CONFIG" 2>/dev/null)
    SR_DATABASE=$(jq -r '.mcpServers."starrocks-expert".env.SR_DATABASE // "information_schema"' "$GEMINI_CONFIG" 2>/dev/null)
    SR_PORT=$(jq -r '.mcpServers."starrocks-expert".env.SR_PORT // "9030"' "$GEMINI_CONFIG" 2>/dev/null)
    CENTRAL_API=$(jq -r '.mcpServers."starrocks-expert".env.CENTRAL_API // "http://localhost:80"' "$GEMINI_CONFIG" 2>/dev/null)
    CENTRAL_API_TOKEN=$(jq -r '.mcpServers."starrocks-expert".env.CENTRAL_API_TOKEN // ""' "$GEMINI_CONFIG" 2>/dev/null)

    # 测试 MCP 服务器
    TEST_OUTPUT=$(cd ~/.starrocks-mcp && SR_HOST=$SR_HOST SR_USER=$SR_USER SR_PASSWORD=$SR_PASSWORD SR_DATABASE=$SR_DATABASE SR_PORT=$SR_PORT CENTRAL_API=$CENTRAL_API CENTRAL_API_TOKEN=$CENTRAL_API_TOKEN timeout 3 node thin-mcp-server.js <<'EOF' 2>&1
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
)

    if echo "$TEST_OUTPUT" | grep -q '"name":"analyze_storage_health"'; then
        TOOL_COUNT=$(echo "$TEST_OUTPUT" | grep -o '"name":"analyze_' | wc -l)
        echo -e "${GREEN}   ✅ MCP 服务器响应正常${NC}"
        echo -e "${GREEN}   ✅ 返回 $TOOL_COUNT 个工具${NC}"
    else
        echo -e "${RED}   ❌ MCP 服务器测试失败${NC}"
        echo "      测试输出:"
        echo "$TEST_OUTPUT" | head -10
        ISSUES+=("MCP 服务器通信失败")
    fi
else
    echo -e "${YELLOW}   ⚠️  跳过测试（缺少必要文件）${NC}"
fi
echo

# 5. 检查 StarRocks 数据库
echo -e "${BLUE}5️⃣  检查 StarRocks 数据库连接${NC}"
echo "-----------------------------------"
if [ -f "$GEMINI_CONFIG" ]; then
    SR_HOST=$(jq -r '.mcpServers."starrocks-expert".env.SR_HOST // "localhost"' "$GEMINI_CONFIG" 2>/dev/null)
    SR_PORT=$(jq -r '.mcpServers."starrocks-expert".env.SR_PORT // "9030"' "$GEMINI_CONFIG" 2>/dev/null)

    echo "   测试连接: $SR_HOST:$SR_PORT"
    if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$SR_HOST/$SR_PORT" 2>/dev/null; then
        echo -e "${GREEN}   ✅ 数据库端口可访问${NC}"
    else
        echo -e "${YELLOW}   ⚠️  数据库端口无法访问${NC}"
        echo "      这可能是正常的，如果你的 StarRocks 未运行"
        echo "      或者配置的是远程地址但网络不通"
    fi
else
    echo -e "${YELLOW}   ⚠️  跳过检查（配置文件不存在）${NC}"
fi
echo

# 总结
echo "=================================="
echo -e "${BLUE}📋 诊断总结${NC}"
echo "=================================="
echo

if [ ${#ISSUES[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查通过！系统已准备就绪。${NC}"
    echo
    echo "下一步:"
    echo "  1. 如果 Gemini CLI 正在运行，完全重启:"
    echo "     pkill -9 -f gemini && gemini"
    echo
    echo "  2. 在 Gemini 中测试:"
    echo "     > /mcp-list-servers"
    echo "     > /mcp-list-tools"
    echo "     > 请帮我分析 StarRocks 的存储健康状况"
else
    echo -e "${RED}❌ 发现 ${#ISSUES[@]} 个问题:${NC}"
    echo
    for i in "${!ISSUES[@]}"; do
        echo "  $((i+1)). ${ISSUES[$i]}"
    done
    echo
    echo -e "${YELLOW}💡 请按照上述提示解决问题后重新运行诊断。${NC}"
    echo
    echo "快速修复脚本:"
    echo "  # 重新安装客户端"
    echo "  cd $(pwd) && ./install-starrocks-mcp.sh"
    echo
    echo "  # 重启 API 服务器"
    echo "  cd $(pwd) && ./start-api-server.sh"
    echo
    echo "详细文档:"
    echo "  $(pwd)/DETAILED_USAGE_GUIDE.md"
fi
echo
