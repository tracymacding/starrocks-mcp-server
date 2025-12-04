#!/bin/bash

##
# 直接测试 MCP 工具（不通过 Gemini CLI）
##

set -e

echo "🧪 直接测试 MCP 工具"
echo "===================="
echo ""

# 检查 API 服务器
if ! curl -s http://localhost:80/health > /dev/null; then
    echo "❌ API 服务器未运行"
    echo "请先启动: cd mcp-example && ./start-api-server.sh"
    exit 1
fi

echo "✅ API 服务器运行正常"
echo ""

# 检查 StarRocks 连接
if ! timeout 2 bash -c "cat < /dev/null > /dev/tcp/localhost/9030" 2>/dev/null; then
    echo "⚠️  StarRocks 端口不可访问（这是正常的，如果你的 StarRocks 未运行）"
    echo ""
fi

echo "🔧 测试工具: analyze_storage_health"
echo "-----------------------------------"
echo ""

cd ~/.starrocks-mcp

# 调用 MCP 工具
echo "正在调用 MCP 服务器..."
echo ""

timeout 10 node thin-mcp-server.js <<'EOF' 2>&1 | grep -A 100 '"id":3' | head -50
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_storage_health","arguments":{}}}
EOF

echo ""
echo ""
echo "✅ 测试完成"
echo ""
echo "如果看到上方有诊断报告，说明 MCP 工具工作正常！"
echo ""
