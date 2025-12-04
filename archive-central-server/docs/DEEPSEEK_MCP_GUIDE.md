# 使用 DeepSeek + MCP 的完整指南

## 🎯 目标

使用 DeepSeek 模型 + MCP (StarRocks 诊断工具)，避免 Google OAuth 认证。

---

## ✅ 已完成的配置

1. ✅ 修改了 `start-gemini-with-mcp.sh` 脚本
   - 自动加载 `.env` 文件
   - 默认使用 DeepSeek 模型

2. ✅ 创建了 `.env` 模板文件
   - 路径：`/home/disk5/dingkai/github/gemini-cli/.env`

3. ✅ MCP 配置已就绪
   - 路径：`~/.gemini/settings.json`
   - 服务器：starrocks-expert

---

## 📝 使用步骤

### Step 1: 配置 DeepSeek API Key

编辑 `.env` 文件：

```bash
cd /home/disk5/dingkai/github/gemini-cli
nano .env
```

修改内容：

```bash
# DeepSeek API Key
DEEPSEEK_API_KEY=sk-your-actual-deepseek-key-here

# 如果需要代理，取消注释并修改
# HTTP_PROXY=http://127.0.0.1:7890
```

**获取 API Key**：https://platform.deepseek.com/

### Step 2: 启动中心 API 服务器

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./start-api-server.sh &

# 或者使用 npm
npm run start:api &
```

验证：
```bash
curl http://localhost:80/health
```

### Step 3: 启动 Gemini CLI (DeepSeek + MCP)

```bash
cd /home/disk5/dingkai/github/gemini-cli
./start-gemini-with-mcp.sh
```

脚本会自动：
- ✅ 加载 `.env` 中的 DeepSeek API Key
- ✅ 检查 API 服务器状态
- ✅ 检查 MCP 配置
- ✅ 使用 DeepSeek 模型启动（不需要 OAuth）

### Step 4: 验证 MCP 加载

在 Gemini CLI 中：

```
> /mcp-list-servers

期望输出:
starrocks-expert: connected

> /mcp-list-tools

期望输出:
starrocks-expert:
  • analyze_storage_health - 全面分析存储健康状况
  • analyze_compaction_health - 分析 Compaction 健康状况
  • analyze_ingestion_health - 分析数据摄取健康状况
```

### Step 5: 开始使用

```
> 请帮我分析 StarRocks 的存储健康状况

> 检查一下 Compaction 是否正常

> 最近的数据导入有问题吗？
```

---

## 🔄 两种启动脚本的区别

### `start-gemini-cli.sh`（原有的）

```bash
bash start-gemini-cli.sh
```

- ✅ 使用本地构建的 CLI
- ✅ 使用 DeepSeek
- ❌ **不支持 MCP**（无法加载 ~/.gemini/settings.json）
- 适合：只使用 DeepSeek，不需要 MCP 工具

### `start-gemini-with-mcp.sh`（新的）⭐

```bash
./start-gemini-with-mcp.sh
```

- ✅ 使用全局 gemini 命令
- ✅ 使用 DeepSeek（默认）
- ✅ **支持 MCP**（自动加载 ~/.gemini/settings.json）
- ✅ 自动检查 API 服务器和配置
- 适合：使用 DeepSeek + MCP 诊断工具

---

## 🛠️ 常见问题

### 问题 1: 仍然提示 OAuth 认证

**原因**：DeepSeek API Key 未配置或 `.env` 文件未加载

**解决**：

1. 检查 `.env` 文件：
   ```bash
   cat /home/disk5/dingkai/github/gemini-cli/.env
   ```

2. 确认 API Key 已填写：
   ```bash
   DEEPSEEK_API_KEY=sk-xxxxx  # 不应该是占位符
   ```

3. 检查环境变量：
   ```bash
   cd /home/disk5/dingkai/github/gemini-cli
   source .env
   echo $DEEPSEEK_API_KEY
   ```

### 问题 2: 看不到 MCP 工具

**原因**：API 服务器未运行或 MCP 配置错误

**解决**：

1. 检查 API 服务器：
   ```bash
   curl http://localhost:80/health
   ```

2. 运行诊断脚本：
   ```bash
   cd /home/disk5/dingkai/github/gemini-cli/mcp-example
   ./diagnose.sh
   ```

3. 检查 MCP 配置：
   ```bash
   cat ~/.gemini/settings.json | jq '.mcpServers."starrocks-expert"'
   ```

### 问题 3: 想使用其他模型

**使用 Gemini**：
```bash
./start-gemini-with-mcp.sh --provider google -m gemini-2.0-flash-exp
```

**使用通义千问**：
```bash
./start-gemini-with-mcp.sh --provider alibaba -m qwen-plus
```

**返回 DeepSeek**：
```bash
./start-gemini-with-mcp.sh  # 默认就是 DeepSeek
```

---

## 📊 完整架构

```
DeepSeek API
   ↓
Gemini CLI (全局命令)
   ├─ 加载 .env (DeepSeek API Key)
   └─ 加载 ~/.gemini/settings.json (MCP 配置)
       ↓
   Thin MCP Server (本地)
       ├─ 连接 Central API (获取 SQL)
       ├─ 连接本地 StarRocks (执行 SQL)
       └─ 返回分析结果
```

---

## ✨ 快速命令参考

```bash
# 1. 启动 API 服务器
cd /home/disk5/dingkai/github/gemini-cli/mcp-example && ./start-api-server.sh &

# 2. 配置 DeepSeek API Key（首次使用）
nano /home/disk5/dingkai/github/gemini-cli/.env

# 3. 启动 Gemini CLI (DeepSeek + MCP)
cd /home/disk5/dingkai/github/gemini-cli && ./start-gemini-with-mcp.sh

# 4. 在 Gemini 中测试
> /mcp-list-tools
> 请帮我分析 StarRocks 的存储健康状况
```

---

## 📚 相关文档

- **FIX_MCP_ISSUE.md** - MCP 无法加载问题的详细分析
- **QUICK_START_GUIDE.md** - 快速开始指南
- **DETAILED_USAGE_GUIDE.md** - 详细使用和问题排查
- **SOLUTION_C_GUIDE.md** - 完整架构和部署指南

---

## 🎉 总结

现在你可以：

1. ✅ 使用 DeepSeek 模型（不需要 Google OAuth）
2. ✅ 使用 MCP 工具（StarRocks 诊断）
3. ✅ 自动检查所有组件状态

**一条命令启动**：
```bash
cd /home/disk5/dingkai/github/gemini-cli && ./start-gemini-with-mcp.sh
```

**前提**：
- ✅ `.env` 文件中填写了 DeepSeek API Key
- ✅ API 服务器正在运行
