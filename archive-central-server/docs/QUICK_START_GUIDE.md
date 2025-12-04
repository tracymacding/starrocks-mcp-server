# Solution C 快速启动指南（5 分钟上手）

## ✅ 诊断结果

所有组件检查通过：

- ✅ API 服务器运行正常（3个工具）
- ✅ Thin MCP Server 已安装并正常
- ✅ Gemini CLI 配置正确
- ✅ MCP 通信测试通过

## 🚀 立即开始使用

### Step 1: 完全重启 Gemini CLI（重要！）

如果 Gemini CLI 正在运行，**必须完全退出并重启**才能加载 MCP 配置：

```bash
# 方法 1: 在 Gemini 中执行（推荐）
> /exit

# 方法 2: 强制结束进程
pkill -9 -f gemini

# 重新启动
gemini
```

### Step 2: 验证 MCP 服务器已加载

启动 Gemini 后，输入：

```
> /mcp-list-servers
```

**期望看到**：

```
starrocks-expert: connected
```

如果看到 `disconnected` 或没有此服务器，说明配置有问题。

### Step 3: 列出可用工具

```
> /mcp-list-tools
```

**期望看到**：

```
starrocks-expert:
  • analyze_storage_health - 全面分析存储健康状况
  • analyze_compaction_health - 分析 Compaction 健康状况
  • analyze_ingestion_health - 分析数据摄取健康状况
```

### Step 4: 开始诊断！

#### 使用自然语言（推荐）

```
> 请帮我分析 StarRocks 的存储健康状况

> 检查一下 Compaction 是否正常

> 最近的数据导入有问题吗？
```

#### 直接调用工具

```
> /mcp-call-tool starrocks-expert analyze_storage_health {}
```

---

## ⚠️ 如果仍然看到 "No tools or prompts available"

### 原因 1: Gemini CLI 没有完全重启

**解决**：

```bash
# 强制结束所有 gemini 进程
pkill -9 -f gemini

# 等待 2 秒
sleep 2

# 重新启动
gemini
```

### 原因 2: Gemini CLI 版本不支持 MCP

**检查版本**：

```bash
gemini --version
```

Gemini CLI 需要支持 MCP (Model Context Protocol)。如果版本过旧，请升级。

### 原因 3: 配置文件格式错误

**验证配置**：

```bash
# 检查 JSON 格式是否正确
cat ~/.gemini/settings.json | jq .

# 如果报错，说明 JSON 格式有问题
```

**修复**：

```bash
# 备份当前配置
cp ~/.gemini/settings.json ~/.gemini/settings.json.backup

# 使用示例配置
cat ~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json

# 手动合并到 ~/.gemini/settings.json
nano ~/.gemini/settings.json
```

### 原因 4: 环境变量未生效

有时 Gemini 可能不会正确读取 settings.json 中的 env。

**临时解决方案 - 使用 .env 文件**：

确保 `~/.starrocks-mcp/.env` 正确配置：

```bash
cat ~/.starrocks-mcp/.env
```

应该包含：

```bash
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=
SR_PORT=9030
CENTRAL_API=http://localhost:80
CENTRAL_API_TOKEN=demo-key
```

---

## 📊 测试是否成功

### 成功标志

1. ✅ `/mcp-list-servers` 显示 `starrocks-expert: connected`
2. ✅ `/mcp-list-tools` 显示 3 个工具
3. ✅ 自然语言查询返回诊断报告
4. ✅ Gemini 能理解 "分析存储健康" 并自动调用工具

### 失败标志

1. ❌ "No tools or prompts available"
2. ❌ `/mcp-list-servers` 不显示 `starrocks-expert`
3. ❌ `/mcp-list-servers` 显示 `disconnected`
4. ❌ `/mcp-list-tools` 返回空列表

---

## 🔧 手动测试（绕过 Gemini CLI）

如果在 Gemini 中遇到问题，可以直接测试 MCP 服务器：

```bash
cd ~/.starrocks-mcp

# 启动 MCP 服务器（会等待输入）
node thin-mcp-server.js
```

然后输入以下 JSON（每行一个）：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

**期望输出**：应该看到返回 3 个工具的 JSON 响应。

按 Ctrl+C 退出。

---

## 📚 完整文档

如果遇到其他问题，参考：

1. **DETAILED_USAGE_GUIDE.md** - 详细的分步指南和问题排查
2. **SOLUTION_C_GUIDE.md** - 完整的架构和部署指南
3. **USAGE_DEMO.md** - 10 步完整数据流演示

---

## 🆘 快速诊断命令

```bash
# 运行完整诊断
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./diagnose.sh

# 检查 API 服务器
curl http://localhost:80/health

# 检查工具列表
curl http://localhost:80/api/tools -H "X-API-Key: demo-key" | jq '.tools[].name'

# 检查 Gemini 配置
cat ~/.gemini/settings.json | jq '.mcpServers."starrocks-expert"'
```

---

## ✨ 预期的工作流程

```
1. 你在 Gemini 中输入：
   > 请帮我分析存储健康状况

2. Gemini AI 理解意图，决定调用 analyze_storage_health 工具

3. Gemini CLI 调用本地 Thin MCP Server

4. Thin MCP Server:
   - 向 API 请求 SQL 定义
   - 在本地 StarRocks 执行 SQL
   - 发送结果到 API 分析
   - 格式化并返回报告

5. 你看到完整的分析报告：
   💾 StarRocks 存储专家分析报告
   🟢 健康分数: 95/100 (EXCELLENT)
   📊 状态: HEALTHY
   ...
```

---

**如果按照以上步骤仍然有问题，请提供以下信息：**

1. Gemini CLI 版本：`gemini --version`
2. `/mcp-list-servers` 的输出
3. Gemini 启动时的完整输出（包括任何错误信息）
4. `./diagnose.sh` 的完整输出

祝使用顺利！🎉
