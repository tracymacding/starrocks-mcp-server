# 远程架构快速开始

5 分钟快速体验 Local Agent + 中心服务器架构。

## 🎯 架构说明

```
用户本地                     你的服务器
┌─────────┐                ┌─────────┐
│ Agent   │ ←─── HTTP ───→ │ MCP     │
│ (8080)  │                │ (3000)  │
└────┬────┘                └─────────┘
     │
     ↓
 StarRocks DB
```

## 🚀 步骤 1: 启动 Local Agent（用户侧）

### 1.1 配置数据库连接

```bash
cd mcp-example
cp .env.example .env
vi .env
```

编辑 `.env`：

```bash
# StarRocks 数据库
SR_HOST=localhost
SR_PORT=9030
SR_USER=root
SR_PASSWORD=your-password

# Agent 配置
AGENT_PORT=8080
AGENT_TOKEN=test-token-12345  # 测试用，生产环境请使用强 Token
```

### 1.2 启动 Agent

```bash
npm run start:agent

# 或后台运行
npm install -g pm2
pm2 start local-agent.js --name starrocks-agent
```

### 1.3 验证 Agent 运行

```bash
# 测试健康检查
curl http://localhost:8080/health

# 测试数据库连接
curl http://localhost:8080/test-connection

# 测试 SQL 执行
curl -X POST http://localhost:8080/execute-sql \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: test-token-12345" \
  -d '{"sql": "SELECT VERSION()"}'
```

## 🖥️ 步骤 2: 配置中心服务器（服务器侧）

### 2.1 创建租户配置

```bash
cd mcp-example
cp tenants-config.example.json tenants-config.json
vi tenants-config.json
```

编辑 `tenants-config.json`：

```json
{
  "tenants": {
    "test_tenant": {
      "name": "Test Tenant",
      "agent_url": "http://localhost:8080",
      "agent_token": "test-token-12345",
      "description": "Local test tenant",
      "enabled": true,
      "created_at": "2025-01-15T00:00:00Z"
    }
  }
}
```

### 2.2 启动中心服务器

```bash
# 配置环境变量
export PORT=3000
export API_KEY=test-api-key-67890
export TENANTS_CONFIG=./tenants-config.json

# 启动服务器
npm run start:http-remote

# 或后台运行
pm2 start index-expert-http-remote.js --name starrocks-mcp-remote
```

### 2.3 验证服务器运行

```bash
# 健康检查
curl http://localhost:3000/health

# 查看租户列表
curl -H "X-API-Key: test-api-key-67890" \
     http://localhost:3000/tenants

# 测试 SSE 连接（需要支持 SSE 的客户端）
curl -H "X-API-Key: test-api-key-67890" \
     -H "X-Tenant-ID: test_tenant" \
     http://localhost:3000/sse
```

## 👤 步骤 3: 配置 Gemini CLI（用户侧）

编辑 `~/.gemini/settings.json`：

```json
{
  "mcpServers": {
    "starrocks-remote": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "test-api-key-67890",
        "X-Tenant-ID": "test_tenant"
      },
      "timeout": 600000,
      "description": "StarRocks Expert (Remote)"
    }
  }
}
```

## ✅ 步骤 4: 测试完整流程

### 4.1 验证 MCP 连接

```bash
gemini mcp list

# 应该看到：
# ✓ starrocks-remote (connected)
#   - analyze_storage_health
#   - analyze_compaction_health
#   - ...
```

### 4.2 测试诊断功能

```bash
gemini "分析一下我的 StarRocks 存储健康状况"
```

应该看到：

```
🎯 StarRocks STORAGE 专家分析报告 (Remote)
=====================================

🟢 **storage健康分数**: 85/100 (GOOD)
📊 **状态**: HEALTHY

📋 **问题摘要**: 发现 0 个严重问题，1 个警告
🔍 **问题统计**: 1个

💡 **专业建议**:
  1. [MEDIUM] 优化磁盘空间使用率
  ...
```

## 🎉 成功！

现在你有：

- ✅ Agent 在本地运行（连接内网数据库）
- ✅ 中心服务器运行（包含所有诊断逻辑）
- ✅ Gemini CLI 通过远程 MCP 访问

## 🔄 升级测试

### 场景：修改 SQL 查询逻辑

1. **修改中心服务器代码**：

```javascript
// 编辑 index-expert-http-remote.js
// 找到某个查询，修改 SQL（比如添加 WHERE 条件）
```

2. **重启中心服务器**：

```bash
pm2 restart starrocks-mcp-remote
```

3. **用户无需任何操作**：

```bash
# 用户直接使用，自动享受更新
gemini "分析存储"
```

## 📊 架构对比

| 操作         | 传统架构             | 远程架构               |
| ------------ | -------------------- | ---------------------- |
| **部署**     | 用户本地运行完整 MCP | 用户只需运行轻量 Agent |
| **升级 SQL** | 通知用户更新代码     | 你改服务器，用户无感知 |
| **升级算法** | 通知用户更新代码     | 你改服务器，用户无感知 |
| **数据安全** | 本地处理             | 本地处理（不出内网）   |
| **维护成本** | 高（每个用户）       | 低（只维护中心服务器） |

## 🛠️ 常用命令

### Local Agent

```bash
# 启动
npm run start:agent

# 开发模式（自动重启）
npm run dev:agent

# 后台运行
pm2 start local-agent.js --name starrocks-agent

# 查看状态
pm2 list
pm2 logs starrocks-agent
```

### 中心服务器

```bash
# 启动
npm run start:http-remote

# 开发模式
npm run dev:remote

# 后台运行
pm2 start index-expert-http-remote.js --name starrocks-mcp-remote

# 查看日志
pm2 logs starrocks-mcp-remote
```

## 🔍 故障排查

### Agent 无法连接数据库

```bash
# 测试数据库连接
mysql -h $SR_HOST -P $SR_PORT -u $SR_USER -p

# 检查 .env 配置
cat .env | grep SR_
```

### 中心服务器无法连接 Agent

```bash
# 从服务器测试 Agent
curl http://agent-host:8080/health

# 检查网络连通性
telnet agent-host 8080

# 检查 Token
curl -H "X-Agent-Token: test-token-12345" \
     http://agent-host:8080/health
```

### Gemini CLI 连接失败

```bash
# 检查 MCP 配置
cat ~/.gemini/settings.json

# 测试服务器连接
curl -H "X-API-Key: test-api-key-67890" \
     -H "X-Tenant-ID: test_tenant" \
     http://localhost:3000/sse

# 查看 Gemini CLI 日志
gemini mcp list --verbose
```

## 📚 下一步

- 阅读完整文档：[REMOTE_ARCHITECTURE.md](./REMOTE_ARCHITECTURE.md)
- 生产环境部署：使用 HTTPS、强 Token、防火墙规则
- 多租户管理：添加更多租户到 `tenants-config.json`
- 监控告警：集成 Prometheus + Grafana
- 自动化部署：使用 Docker Compose 或 Kubernetes

## 💡 提示

1. **开发环境**：Agent 和 MCP Server 都在 localhost
2. **生产环境**：Agent 在用户内网，MCP Server 在你的服务器
3. **测试 Token**：`test-token-12345` 仅用于测试，生产环境请使用 `openssl rand -hex 32`
4. **HTTPS**：生产环境必须使用 HTTPS（通过 Nginx 反向代理）

## 🎓 学习资源

- [HTTP_SERVER_README.md](./HTTP_SERVER_README.md) - HTTP 服务器文档
- [QUICK_START.md](./QUICK_START.md) - 传统架构快速开始
- [REMOTE_ARCHITECTURE.md](./REMOTE_ARCHITECTURE.md) - 远程架构完整指南
