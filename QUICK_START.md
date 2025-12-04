# 🚀 快速开始指南 - 完整版 (包含所有 Expert)

**⭐ 这个 HTTP 服务器包含所有 11 个 Expert 和 33 个工具!**

包括:
- 💾 storage-expert
- 🗜️ compaction-expert
- 📥 ingestion-expert
- 💿 **cache-expert** (你要找的!)
- 🔄 transaction-expert
- 📋 log-expert
- 💾 memory-expert
- ⚡ query-perf-expert
- 🔧 operate-expert
- 📊 table-schema-expert
- 🎯 coordinator

所有功能通过 `index-expert-http.js` 提供!

## 📍 配置文件位置

Gemini CLI 的 MCP 配置在 **settings.json** 文件中：

### 全局配置（所有项目可用）

```bash
~/.gemini/settings.json
```

### 项目配置（仅当前项目）

```bash
项目根目录/.gemini/settings.json
```

## 🔧 配置示例

我已经在项目配置中添加了两个 MCP 服务器：

```json
{
  "mcpServers": {
    // 本地直连（Stdio）
    "starrocks-expert": {
      "command": "node",
      "args": ["mcp-example/index-expert-enhanced.js"],
      "env": {
        "SR_HOST": "127.0.0.1",
        "SR_USER": "root",
        "SR_PASSWORD": "",
        "SR_PORT": "9030"
      }
    },

    // 远程 HTTP 服务
    "starrocks-expert-remote": {
      "url": "http://localhost:3000/sse",
      "description": "StarRocks 专家系统（远程）",
      "headers": {
        "X-API-Key": "your-secret-api-key-here"
      },
      "timeout": 600000
    }
  }
}
```

## 🎯 使用步骤

### 步骤 1: 启动 HTTP 服务器

在一个终端中：

```bash
cd mcp-example

# 配置环境变量
cp .env.example .env
vi .env  # 编辑配置

# 启动服务
./start-http-server.sh
```

服务启动后会显示：

```
🎉 StarRocks MCP HTTP Server is running!

   📡 SSE endpoint:     http://localhost:3000/sse
   💬 Messages:         http://localhost:3000/messages
   ❤️  Health check:    http://localhost:3000/health
```

### 步骤 2: 验证服务运行

```bash
# 检查健康状态
curl http://localhost:3000/health

# 应该返回：
# {
#   "status": "healthy",
#   "service": "starrocks-mcp-server",
#   "version": "2.0.0",
#   "experts": 25
# }
```

### 步骤 3: 使用 Gemini CLI 连接

在另一个终端中：

```bash
# 列出 MCP 服务器
./bundle/gemini.js mcp list

# 应该看到：
# ✓ starrocks-expert (connected)          - 本地直连
# ✓ starrocks-expert-remote (connected)   - 远程 HTTP
```

### 步骤 4: 测试工具调用

```bash
# 使用远程服务
./bundle/gemini.js -p "使用 starrocks-expert-remote 分析存储健康状况"

# 或者使用本地服务
./bundle/gemini.js -p "使用 starrocks-expert 分析存储健康状况"
```

## 🔐 配置 API Key

### 1. 生成安全的 API Key

```bash
openssl rand -hex 32
# 输出: a1b2c3d4e5f6...（64位十六进制）
```

### 2. 更新服务器配置

编辑 `mcp-example/.env`：

```bash
API_KEY=a1b2c3d4e5f6...（你生成的key）
```

### 3. 更新客户端配置

编辑 `.gemini/settings.json`：

```json
{
  "mcpServers": {
    "starrocks-expert-remote": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "a1b2c3d4e5f6..." // 使用相同的 key
      }
    }
  }
}
```

### 4. 重启服务

```bash
# 重启 HTTP 服务器
cd mcp-example
./start-http-server.sh
```

## 🌍 部署到远程服务器

### 使用 Docker（推荐）

```bash
# 1. 在服务器上克隆代码
git clone https://github.com/your-repo/gemini-cli.git
cd gemini-cli/mcp-example

# 2. 配置环境变量
cp .env.example .env
vi .env  # 配置 StarRocks 连接和 API Key

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f

# 5. 检查状态
curl http://your-server:3000/health
```

### 更新客户端配置指向远程服务器

编辑本地 `.gemini/settings.json`：

```json
{
  "mcpServers": {
    "starrocks-expert-remote": {
      "url": "https://your-server.com:3000/sse", // 使用 HTTPS
      "headers": {
        "X-API-Key": "your-secret-key"
      },
      "timeout": 600000
    }
  }
}
```

## 🔍 故障排查

### 问题 1: 连接失败 (ECONNREFUSED)

**原因**：HTTP 服务器未启动或端口不对

**解决**：

```bash
# 检查服务是否运行
curl http://localhost:3000/health

# 检查进程
ps aux | grep index-expert-http

# 查看日志
tail -f logs/server.log
```

### 问题 2: 401 Unauthorized

**原因**：API Key 不匹配

**解决**：

1. 检查服务器 `.env` 中的 `API_KEY`
2. 检查客户端 `settings.json` 中的 `X-API-Key`
3. 确保两者完全一致

### 问题 3: Tools not found

**原因**：MCP 服务器未正确连接

**解决**：

```bash
# 查看 MCP 服务器状态
./bundle/gemini.js mcp list

# 如果显示 disconnected，检查配置文件
cat .gemini/settings.json

# 重启 Gemini CLI
```

### 问题 4: Database connection error

**原因**：StarRocks 连接配置错误

**解决**：

```bash
# 测试数据库连接
mysql -h $SR_HOST -P $SR_PORT -u $SR_USER -p

# 检查环境变量
echo $SR_HOST
echo $SR_USER
echo $SR_PORT
```

## 📊 性能对比

| 连接方式       | 延迟             | 适用场景         | 代码保护        |
| -------------- | ---------------- | ---------------- | --------------- |
| **本地 Stdio** | 极低 (~10ms)     | 本地开发、单用户 | ❌ 客户端可见   |
| **远程 HTTP**  | 较低 (~50-200ms) | 生产环境、多用户 | ✅ 服务器端保护 |

## 💡 最佳实践

1. **开发环境**：使用本地 Stdio 连接（`starrocks-expert`）
2. **生产环境**：使用远程 HTTP 服务（`starrocks-expert-remote`）
3. **安全第一**：
   - 始终使用 API Key
   - 生产环境使用 HTTPS
   - 定期轮换 API Key
4. **监控**：定期检查 `/health` 端点
5. **备份配置**：保存 `.env` 和 `settings.json` 的副本

## 🔗 相关文档

- [HTTP_SERVER_README.md](./HTTP_SERVER_README.md) - 完整部署文档
- [experts/README.md](./experts/README.md) - 专家系统说明
- [.env.example](./.env.example) - 环境变量配置

## 📞 获取帮助

如遇问题：

1. 查看服务器日志
2. 检查 `/health` 端点
3. 使用 `./bundle/gemini.js mcp list` 查看状态
4. 参考故障排查章节
