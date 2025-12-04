# DeepSeek + MCP 最终解决方案 ✅

## 🎉 问题已解决！

**你的本地 CLI 同时支持 DeepSeek 和 MCP！**

### 为什么 start-gemini-cli.sh 支持 DeepSeek？

**因为你的项目是 Google Gemini CLI 的扩展版本 (v0.8.0-nightly)，包含了：**
- ✅ DeepSeekContentGenerator - 支持 DeepSeek API
- ✅ MCP 支持 - 内置 Model Context Protocol
- ✅ 多提供商支持 - Google、Alibaba、DeepSeek

### 区别对比

| CLI 类型 | 位置 | DeepSeek | MCP | 说明 |
|----------|------|----------|-----|------|
| **本地 CLI** | ./bundle/gemini.js | ✅ | ✅ | 扩展版本 |
| **全局 CLI** | ~/.nvm/.../gemini | ❌ | ✅ | Google 官方版 |

---

## ✅ 完整解决方案

### 配置已完成

1. ✅ **本地 MCP 配置**：`/home/disk5/dingkai/github/gemini-cli/.gemini/settings.json`
   - MCP 服务器：starrocks-expert
   - 路径：/home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js
   - 环境变量：已配置（SR_HOST, CENTRAL_API 等）

2. ✅ **DeepSeek API Key**：`/home/disk5/dingkai/github/gemini-cli/.env`
   - DEEPSEEK_API_KEY: 已设置

3. ✅ **新启动脚本**：`start-deepseek-with-mcp.sh`
   - 同时支持 DeepSeek + MCP
   - 自动检查所有配置

---

## 🚀 立即使用

### Step 1: 启动 API 服务器

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./start-api-server.sh &
```

### Step 2: 启动 Gemini CLI (DeepSeek + MCP)

```bash
cd /home/disk5/dingkai/github/gemini-cli
./start-deepseek-with-mcp.sh
```

### Step 3: 在 CLI 中使用

```bash
# 列出 MCP 服务器
> /mcp list

# 使用自然语言（AI 会自动调用 MCP 工具）
> 请帮我分析 StarRocks 的存储健康状况

> 检查一下 Compaction 是否正常

> 最近的数据导入有问题吗？
```

---

## 📊 工作原理

```
start-deepseek-with-mcp.sh
   ↓
加载 .env (DeepSeek API Key)
   ↓
node ./bundle/gemini.js --provider deepseek -m deepseek-chat
   ↓
读取 .gemini/settings.json (MCP 配置)
   ↓
启动 Thin MCP Server (本地)
   ├─ 连接 Central API (获取 SQL)
   ├─ 连接本地 StarRocks (执行 SQL)
   └─ 返回分析结果
   ↓
DeepSeek AI 理解并呈现结果
```

---

## 🔧 验证配置

### 检查 MCP 服务器

```bash
cd /home/disk5/dingkai/github/gemini-cli
node ./bundle/gemini.js mcp list
```

应该看到：
```
✓ starrocks-expert: node /home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js (stdio) - Connected
```

### 检查 DeepSeek API Key

```bash
cat /home/disk5/dingkai/github/gemini-cli/.env | grep DEEPSEEK_API_KEY
```

应该看到你的 API Key（不是占位符）。

### 检查 API 服务器

```bash
curl http://localhost:80/health
```

应该返回：`{"status":"healthy",...}`

---

## 📝 三个启动脚本对比

| 脚本 | DeepSeek | MCP | 用途 |
|------|----------|-----|------|
| `start-gemini-cli.sh` | ✅ | ❌ | 原有脚本，只支持 DeepSeek |
| `start-gemini-with-mcp.sh` | ❌ | ✅ | 使用全局 gemini（需要 Google API）|
| `start-deepseek-with-mcp.sh` | ✅ | ✅ | **最佳方案** ⭐ |

---

## 💡 为什么之前不能用？

### 问题 1: 路径错误

- **旧路径**：`/home/disk5/dingkai/github/gemini-cli/mcp-example/thin-mcp-server.js`
- **正确路径**：`/home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js`

✅ 已修复

### 问题 2: 缺少环境变量

本地 MCP 配置缺少必要的环境变量：
- SR_HOST, SR_USER, SR_PASSWORD
- CENTRAL_API, CENTRAL_API_TOKEN

✅ 已添加

### 问题 3: 使用了错误的 CLI

- `start-gemini-with-mcp.sh` 调用全局 `gemini`（不支持 DeepSeek）
- 应该使用本地 `./bundle/gemini.js`（支持 DeepSeek + MCP）

✅ 创建了新脚本 `start-deepseek-with-mcp.sh`

---

## 🎯 快速命令参考

```bash
# 启动 API 服务器
cd /home/disk5/dingkai/github/gemini-cli/mcp-example && ./start-api-server.sh &

# 启动 CLI (DeepSeek + MCP)
cd /home/disk5/dingkai/github/gemini-cli && ./start-deepseek-with-mcp.sh

# 查看 MCP 状态
node ./bundle/gemini.js mcp list

# 运行诊断
cd mcp-example && ./diagnose.sh
```

---

## 📚 相关文档

- **FINAL_SOLUTION.md** - 问题分析和多种方案
- **FIX_MCP_ISSUE.md** - MCP 问题修复指南
- **SOLUTION_C_GUIDE.md** - 完整架构文档
- **DETAILED_USAGE_GUIDE.md** - 详细使用指南

---

## ✨ 总结

**核心发现**：你的本地 CLI 本身就支持 DeepSeek 和 MCP，只是配置有问题。

**最终方案**：

1. ✅ 修复了 MCP 配置路径
2. ✅ 添加了必要的环境变量
3. ✅ 创建了专用启动脚本

**现在可以使用**：

```bash
cd /home/disk5/dingkai/github/gemini-cli
./start-deepseek-with-mcp.sh
```

**同时拥有**：
- ✅ DeepSeek AI 模型
- ✅ StarRocks MCP 诊断工具
- ✅ 自然语言交互

🎉 **完美解决！**
