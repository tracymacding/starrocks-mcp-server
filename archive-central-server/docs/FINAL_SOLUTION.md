# 最终解决方案：DeepSeek + MCP

## 🔍 问题根源

**全局 `gemini` 命令是 Google 官方工具，只支持 Google Gemini API，不支持 DeepSeek。**

### 两种 CLI 的区别

| 特性          | 本地 CLI (start-gemini-cli.sh) | 全局 gemini          |
| ------------- | ------------------------------ | -------------------- |
| 位置          | ./bundle/gemini.js             | ~/.nvm/.../gemini    |
| 支持 DeepSeek | ✅                             | ❌                   |
| 支持 MCP      | ❌                             | ✅                   |
| 需要认证      | DeepSeek API Key               | Google API Key/OAuth |

**矛盾**：

- 想用 DeepSeek → 必须用本地 CLI
- 想用 MCP → 必须用全局 gemini
- 本地 CLI 不支持 MCP
- 全局 gemini 不支持 DeepSeek

---

## ✅ 解决方案 1：使用 Google Gemini + MCP（推荐）⭐

如果你有 Google API Key，这是最简单的方案。

### 获取 Google API Key

访问：https://aistudio.google.com/apikey

### 设置 API Key

```bash
# 方式 1: 环境变量
export GEMINI_API_KEY="your-google-api-key"

# 方式 2: 添加到 .env
echo "GEMINI_API_KEY=your-google-api-key" >> /home/disk5/dingkai/github/gemini-cli/.env
```

### 使用

```bash
cd /home/disk5/dingkai/github/gemini-cli
./start-gemini-with-mcp.sh

# 在 Gemini 中
> /mcp-list-tools
> 请帮我分析 StarRocks 的存储健康状况
```

**优点**：

- ✅ 完整的 MCP 支持
- ✅ 稳定，官方支持
- ✅ 一切正常工作

**缺点**：

- ❌ 需要 Google API Key
- ❌ 不能使用 DeepSeek

---

## ✅ 解决方案 2：让本地 CLI 支持 MCP（需要修改代码）

修改本地 CLI，让它能读取 `~/.gemini/settings.json` 中的 MCP 配置。

### 实现步骤

这需要修改本地 CLI 的源代码，添加 MCP 配置加载逻辑。

**工作量**：较大，需要熟悉 CLI 源码

**不推荐**：维护成本高

---

## ✅ 解决方案 3：直接测试 Thin MCP Server（临时方案）

绕过 Gemini CLI，直接测试 MCP 工具是否正常工作。

### 测试脚本

```bash
cd ~/.starrocks-mcp

# 设置环境变量
export SR_HOST=localhost
export SR_USER=root
export SR_PASSWORD=""
export SR_PORT=9030
export CENTRAL_API=http://localhost:80
export CENTRAL_API_TOKEN=demo-key

# 测试 MCP 服务器
cat <<'EOF' | node thin-mcp-server.js
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_storage_health","arguments":{}}}
EOF
```

这会直接调用 MCP 工具并返回诊断结果（不通过 CLI）。

---

## ✅ 解决方案 4：使用 HTTP API 直接测试（最简单）

直接调用 Central API，不使用任何 CLI。

### 测试存储健康

```bash
# 1. 获取 SQL 定义
curl http://localhost:80/api/queries/analyze_storage_health \
  -H "X-API-Key: demo-key" | jq .

# 2. 手动执行 SQL（连接本地 StarRocks）
mysql -h localhost -P 9030 -u root -e "SHOW BACKENDS;"

# 3. 将结果发送给 API 分析
curl -X POST http://localhost:80/api/analyze/analyze_storage_health \
  -H "X-API-Key: demo-key" \
  -H "Content-Type: application/json" \
  -d '{
    "results": {
      "backends": [
        {"IP": "192.168.1.100", "MaxDiskUsedPct": "75%", "ErrTabletNum": "0"}
      ]
    }
  }' | jq .
```

**优点**：

- ✅ 不需要任何 CLI
- ✅ 直接测试核心功能
- ✅ 适合调试

**缺点**：

- ❌ 需要手动操作
- ❌ 没有 AI 理解自然语言

---

## ✅ 解决方案 5：使用 DeepSeek，放弃 MCP（保持现状）

继续使用 `start-gemini-cli.sh`，不使用 MCP 工具。

### 使用方式

```bash
cd /home/disk5/dingkai/github/gemini-cli
bash start-gemini-cli.sh

# 在 CLI 中
> 帮我写个 Python 脚本
```

**优点**：

- ✅ 使用 DeepSeek
- ✅ 立即可用

**缺点**：

- ❌ 没有 MCP/StarRocks 诊断工具

---

## 🎯 推荐方案

### 如果你有 Google API Key → 方案 1

最简单，最稳定，完整支持 MCP。

### 如果坚持使用 DeepSeek → 方案 4

绕过 CLI，直接使用 HTTP API 测试诊断功能。

### 如果只想用 DeepSeek 对话 → 方案 5

继续使用 `start-gemini-cli.sh`，不使用 MCP。

---

## 📝 快速决策树

```
你有 Google API Key？
├─ 是 → 使用方案 1（Google Gemini + MCP）✅
└─ 否
   └─ 你必须使用 DeepSeek？
      ├─ 是 → 使用方案 4（HTTP API）或方案 5（无MCP）
      └─ 否 → 申请 Google API Key，使用方案 1
```

---

## 💡 我的建议

1. **短期**：使用方案 4（HTTP API）测试 MCP 功能是否正常
2. **长期**：申请 Google API Key，使用方案 1 获得最佳体验

Google API Key 免费额度很大，对于测试和开发完全够用。

获取地址：https://aistudio.google.com/apikey

---

## 总结

**核心问题**：全局 `gemini` 不支持 DeepSeek

**解决方案**：

- 最佳：使用 Google API Key + 全局 gemini + MCP
- 替代：直接使用 HTTP API 测试诊断功能
- 现状：使用 DeepSeek，不使用 MCP

**你的选择？**
