#!/bin/bash

echo "🧪 测试 Solution C 修复情况"
echo "================================"
echo ""

echo "1️⃣ 检查中心 API 服务器状态..."
health=$(curl -s http://localhost:80/health)
if [ $? -eq 0 ]; then
    echo "   ✅ 中心 API 服务器运行中"
    echo "   $(echo $health | python3 -c 'import sys, json; data=json.load(sys.stdin); print(f\"Tools: {data[\"tools\"]}, Mode: {data[\"mode\"]}\")')"
else
    echo "   ❌ 中心 API 服务器未运行"
    exit 1
fi
echo ""

echo "2️⃣ 检查工具描述是否完整..."
desc_length=$(curl -s http://localhost:80/api/tools -H "X-API-Key: demo-key" | \
    python3 -c 'import sys, json; data=json.load(sys.stdin); tool=[t for t in data["tools"] if t["name"]=="analyze_storage_amplification"][0]; print(len(tool["description"]))')

if [ "$desc_length" -gt 100 ]; then
    echo "   ✅ 工具描述完整 ($desc_length 字符)"
else
    echo "   ❌ 工具描述被截断 ($desc_length 字符)"
fi
echo ""

echo "3️⃣ 检查是否包含示例问题..."
has_example=$(curl -s http://localhost:80/api/tools -H "X-API-Key: demo-key" | \
    python3 -c 'import sys, json; data=json.load(sys.stdin); tool=[t for t in data["tools"] if t["name"]=="analyze_storage_amplification"][0]; print("帮我分析系统存储空间放大情况" in tool["description"])')

if [ "$has_example" == "True" ]; then
    echo "   ✅ 包含示例问题"
else
    echo "   ❌ 缺少示例问题"
fi
echo ""

echo "4️⃣ 检查 Thin MCP Server 代码..."
if grep -q "storage_health && storage_health.level" thin-mcp-server.js; then
    echo "   ✅ Thin MCP Server 已加强防御性检查"
else
    echo "   ⚠️  Thin MCP Server 可能需要更新"
fi
echo ""

echo "================================"
echo "📋 摘要"
echo "================================"
echo ""
echo "✅ 已修复问题："
echo "   1. 工具描述截断问题（index-expert-api-solutionc.js:124）"
echo "   2. 防御性检查增强（thin-mcp-server.js:245-263）"
echo ""
echo "🔄 下一步操作："
echo "   1. 退出当前 Gemini CLI 会话（Ctrl+D）"
echo "   2. 重新启动：gemini 或 deepseek"
echo "   3. 测试问题：\"帮我分析系统存储空间放大情况\""
echo ""
echo "✨ 预期结果："
echo "   - 应该选择 analyze_storage_amplification 工具"
echo "   - 不再出现 'Cannot read properties of undefined' 错误"
echo ""
