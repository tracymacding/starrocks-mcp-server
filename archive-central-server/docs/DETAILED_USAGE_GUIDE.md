# Solution C 详细使用指南

## 🎯 完整使用流程（一步步操作）

### 前置条件检查

运行此诊断脚本检查所有组件：

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./diagnose.sh
```

---

## 第一步：启动中心 API 服务器

### 方式 1：使用启动脚本（推荐）

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./start-api-server.sh
```

### 方式 2：手动启动

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
export API_PORT=80
export API_KEY=demo-key
node index-expert-api.js
```

**验证服务器启动成功**：

```bash
# 应该返回 {"status": "healthy", ...}
curl http://localhost:80/health

# 应该返回 3 个工具
curl http://localhost:80/api/tools -H "X-API-Key: demo-key" | jq '.tools | length'
```

---

## 第二步：配置客户端

### 2.1 检查 Thin MCP Server 是否已安装

```bash
ls -la ~/.starrocks-mcp/

# 应该看到以下文件：
# - thin-mcp-server.js
# - .env
# - GEMINI_CONFIG_EXAMPLE.json
# - package.json
# - node_modules/
```

**如果没有安装**，运行安装脚本：

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./install-starrocks-mcp.sh
```

### 2.2 配置数据库连接

编辑 `~/.starrocks-mcp/.env`：

```bash
nano ~/.starrocks-mcp/.env
```

确保配置正确：

```bash
# StarRocks 数据库配置（必填）
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=              # 如果有密码请填写
SR_PORT=9030

# 中心 API 配置（必填）
CENTRAL_API=http://localhost:80
CENTRAL_API_TOKEN=demo-key
```

**重要**：如果你的 StarRocks 有密码，必须填写 `SR_PASSWORD`。

### 2.3 配置 Gemini CLI

编辑 Gemini CLI 配置文件：

```bash
nano ~/.gemini/settings.json
```

添加或确认有以下配置（注意 JSON 格式）：

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["/home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js"],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "",
        "SR_PORT": "9030",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "demo-key"
      }
    }
  }
}
```

**注意**：

- 如果 `settings.json` 已有其他配置，只需在 `mcpServers` 对象中添加 `starrocks-expert` 部分
- 路径必须是绝对路径：`/home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js`
- 如果有密码，修改 `SR_PASSWORD` 的值

---

## 第三步：测试 MCP 服务器（在启动 Gemini 前）

在使用 Gemini CLI 前，先手动测试 MCP 服务器是否工作：

```bash
cd ~/.starrocks-mcp

# 设置环境变量并测试
export SR_HOST=localhost
export SR_USER=root
export SR_PASSWORD=""
export SR_PORT=9030
export CENTRAL_API=http://localhost:80
export CENTRAL_API_TOKEN=demo-key

# 运行测试（会输出调试信息）
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node thin-mcp-server.js 2>&1 | grep -A 5 "result"
```

**期望输出**：应该看到返回 3 个工具的 JSON 响应。

---

## 第四步：启动 Gemini CLI

### 4.1 重要：完全重启 Gemini CLI

如果之前运行过 Gemini CLI，**必须完全退出并重启**才能加载新的 MCP 配置：

```bash
# 1. 完全退出 Gemini CLI（在 Gemini 中执行 /exit）
# 2. 或者强制杀死进程
pkill -9 -f gemini

# 3. 重新启动
gemini
```

### 4.2 检查 MCP 服务器状态

启动 Gemini 后，首先检查 MCP 服务器是否正常加载：

```
> /mcp-list-servers
```

**期望输出**：应该看到 `starrocks-expert` 服务器，状态为 `connected`。

如果看到错误或 `disconnected`，检查：

1. 路径是否正确
2. API 服务器是否运行
3. 配置文件是否有语法错误

### 4.3 列出可用工具

```
> /mcp-list-tools
```

**期望输出**：应该看到 3 个工具：

```
starrocks-expert:
  • analyze_storage_health - 全面分析存储健康状况
  • analyze_compaction_health - 分析 Compaction 健康状况
  • analyze_ingestion_health - 分析数据摄取健康状况
```

---

## 第五步：使用诊断功能

### 方式 1：自然语言（推荐）

```
> 请帮我分析 StarRocks 的存储健康状况

> 检查一下 Compaction 是否正常

> 最近的数据导入有问题吗？
```

Gemini AI 会理解你的意图，自动调用相应的工具。

### 方式 2：直接调用工具

```
> /mcp-call-tool starrocks-expert analyze_storage_health {}

> /mcp-call-tool starrocks-expert analyze_compaction_health {}

> /mcp-call-tool starrocks-expert analyze_ingestion_health {"hours": 24}
```

---

## 完整的输出示例

### 存储健康分析

```
> 请帮我分析存储健康状况

💾 StarRocks 存储专家分析报告
🟢 健康分数: 95/100 (EXCELLENT)
📊 状态: HEALTHY

📋 诊断摘要: 存储系统整体健康，未发现严重问题
🔍 发现问题: 0个

💡 专业建议 (前3条):
  1. [LOW] 定期监控磁盘使用率
  2. [LOW] 检查 Tablet 副本分布
  3. [LOW] 监控数据增长趋势

📋 详细数据请查看 JSON 输出部分

{
  "expert": "storage",
  "timestamp": "2025-10-12T12:00:00Z",
  "storage_health": {
    "score": 95,
    "level": "EXCELLENT",
    "status": "HEALTHY"
  },
  ...
}
```

---

## 常见问题排查

### 问题 1：Gemini CLI 显示 "No tools or prompts available"

**原因**：MCP 服务器未成功连接

**解决步骤**：

1. **检查 API 服务器是否运行**：

   ```bash
   curl http://localhost:80/health
   ```

   如果失败，重启 API 服务器。

2. **检查 Thin MCP Server 路径**：

   ```bash
   ls -la /home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js
   ```

   如果不存在，运行安装脚本。

3. **手动测试 MCP 服务器**：

   ```bash
   cd ~/.starrocks-mcp
   ```

   输入测试 JSON（见第三步），看是否返回工具列表。

4. **检查 Gemini 配置文件语法**：

   ```bash
   cat ~/.gemini/settings.json | jq .
   ```

   如果报错，说明 JSON 格式有问题。

5. **完全重启 Gemini CLI**：
   ```bash
   pkill -9 -f gemini
   gemini
   ```

### 问题 2：工具执行失败，提示数据库连接错误

**原因**：数据库配置不正确或数据库未运行

**解决步骤**：

1. **测试数据库连接**：

   ```bash
   mysql -h localhost -P 9030 -u root -p
   ```

2. **检查配置**：

   ```bash
   cat ~/.gemini/settings.json | jq '.mcpServers."starrocks-expert".env'
   ```

3. **更新密码**（如果需要）：
   编辑 `~/.gemini/settings.json`，修改 `SR_PASSWORD` 字段。

### 问题 3：API 返回 "Unauthorized"

**原因**：API Key 不匹配

**解决步骤**：

1. **检查 API 服务器的 API Key**：
   API 服务器启动时设置的 `API_KEY` 环境变量。

2. **检查客户端配置**：
   确保 `~/.gemini/settings.json` 中的 `CENTRAL_API_TOKEN` 与服务器的 `API_KEY` 一致。

3. **重启 API 服务器**：
   ```bash
   pkill -f index-expert-api.js
   export API_KEY=demo-key && export API_PORT=80
   node index-expert-api.js
   ```

### 问题 4：Gemini CLI 启动缓慢或挂起

**原因**：MCP 服务器初始化失败但 Gemini 在等待

**解决步骤**：

1. **查看 MCP 服务器日志**：
   Gemini CLI 通常会输出 stderr，查看是否有错误信息。

2. **简化配置测试**：
   临时移除 `mcpServers` 配置，确认 Gemini 本身正常：

   ```bash
   # 备份配置
   cp ~/.gemini/settings.json ~/.gemini/settings.json.bak

   # 移除 mcpServers
   jq 'del(.mcpServers)' ~/.gemini/settings.json.bak > ~/.gemini/settings.json

   # 测试 Gemini
   gemini

   # 恢复配置
   mv ~/.gemini/settings.json.bak ~/.gemini/settings.json
   ```

---

## 验证所有组件的脚本

创建并运行诊断脚本：

```bash
cat > /tmp/diagnose-solution-c.sh <<'EOF'
#!/bin/bash

echo "🔍 Solution C 诊断脚本"
echo "===================="
echo

# 1. 检查 API 服务器
echo "1️⃣  检查中心 API 服务器..."
if curl -s http://localhost:80/health > /dev/null; then
    echo "   ✅ API 服务器运行正常"
    TOOLS_COUNT=$(curl -s http://localhost:80/api/tools -H "X-API-Key: demo-key" | jq -r '.tools | length' 2>/dev/null || echo "0")
    echo "   ✅ 返回工具数量: $TOOLS_COUNT"
else
    echo "   ❌ API 服务器未运行或无法访问"
    echo "   💡 解决：cd /home/disk5/dingkai/github/gemini-cli/mcp-example && ./start-api-server.sh"
fi
echo

# 2. 检查 Thin MCP Server
echo "2️⃣  检查 Thin MCP Server 安装..."
if [ -f ~/.starrocks-mcp/thin-mcp-server.js ]; then
    echo "   ✅ Thin MCP Server 已安装"
else
    echo "   ❌ Thin MCP Server 未安装"
    echo "   💡 解决：cd /home/disk5/dingkai/github/gemini-cli/mcp-example && ./install-starrocks-mcp.sh"
fi
echo

# 3. 检查配置
echo "3️⃣  检查 Gemini CLI 配置..."
if [ -f ~/.gemini/settings.json ]; then
    if jq -e '.mcpServers."starrocks-expert"' ~/.gemini/settings.json > /dev/null 2>&1; then
        echo "   ✅ MCP 服务器已配置"
        jq -r '.mcpServers."starrocks-expert" | "   命令: \(.command) \(.args[0])"' ~/.gemini/settings.json
    else
        echo "   ❌ MCP 服务器未配置"
        echo "   💡 解决：参考 ~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json"
    fi
else
    echo "   ❌ Gemini 配置文件不存在"
fi
echo

# 4. 检查数据库连接（可选）
echo "4️⃣  检查 StarRocks 数据库..."
SR_HOST=$(jq -r '.mcpServers."starrocks-expert".env.SR_HOST // "localhost"' ~/.gemini/settings.json 2>/dev/null)
SR_PORT=$(jq -r '.mcpServers."starrocks-expert".env.SR_PORT // "9030"' ~/.gemini/settings.json 2>/dev/null)
if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$SR_HOST/$SR_PORT" 2>/dev/null; then
    echo "   ✅ 数据库端口 $SR_HOST:$SR_PORT 可访问"
else
    echo "   ⚠️  数据库端口 $SR_HOST:$SR_PORT 无法访问"
    echo "   💡 这可能是正常的，如果你还没启动 StarRocks"
fi
echo

echo "📋 诊断完成"
echo
echo "下一步："
echo "  1. 确保所有组件正常（见上方 ✅）"
echo "  2. 完全重启 Gemini CLI: pkill -9 -f gemini && gemini"
echo "  3. 在 Gemini 中执行: /mcp-list-tools"
EOF

chmod +x /tmp/diagnose-solution-c.sh
/tmp/diagnose-solution-c.sh
```

---

## 成功标志

当一切正常时，你应该看到：

1. ✅ API 服务器健康检查返回 `{"status": "healthy"}`
2. ✅ API 返回 3 个工具
3. ✅ Thin MCP Server 文件存在
4. ✅ Gemini 配置正确
5. ✅ `/mcp-list-servers` 显示 `starrocks-expert` 为 `connected`
6. ✅ `/mcp-list-tools` 显示 3 个工具
7. ✅ 自然语言查询返回分析报告

---

## 快速重置（如果一切都乱了）

```bash
# 1. 停止所有服务
pkill -f index-expert-api.js
pkill -9 -f gemini

# 2. 重新安装客户端
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./install-starrocks-mcp.sh

# 3. 配置数据库连接
nano ~/.starrocks-mcp/.env
# 修改 SR_PASSWORD 等

# 4. 配置 Gemini
nano ~/.gemini/settings.json
# 复制 ~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json 的内容

# 5. 启动 API 服务器
./start-api-server.sh

# 6. 启动 Gemini
gemini

# 7. 测试
> /mcp-list-tools
```

---

## 获取帮助

如果仍然有问题，收集以下信息：

1. API 服务器日志：`cat /tmp/api-server-new.log`
2. Gemini 配置：`cat ~/.gemini/settings.json | jq .mcpServers`
3. 手动测试 MCP：运行第三步的测试命令
4. 错误信息：Gemini CLI 中的完整错误输出

参考完整文档：

- `SOLUTION_C_GUIDE.md` - 完整架构和部署指南
- `USAGE_DEMO.md` - 10 步数据流演示
- `HOW_TO_USE.md` - 快速开始指南
