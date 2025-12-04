# 远程架构指南 - Local Agent + 中心服务器

将 StarRocks 专家系统部署为多租户 SaaS 服务的完整解决方案。

## 🎯 架构优势

| 特性           | 优势                                  |
| -------------- | ------------------------------------- |
| **SQL 逻辑**   | ✅ 在中心服务器，升级无需通知用户     |
| **诊断算法**   | ✅ 在中心服务器，升级无需通知用户     |
| **客户端维护** | ✅ Local Agent 极轻量，几乎不需要更新 |
| **网络隔离**   | ✅ Agent 在内网，可以访问数据库       |
| **安全性**     | ✅ 数据库凭证不出内网                 |
| **多租户**     | ✅ 中心服务器支持多个客户端           |
| **升级体验**   | ✅ 用户无感知，自动享受新功能         |

## 🏗️ 架构图

```
┌─────────────────────────────┐          ┌──────────────────────────┐
│  租户 A 内网                 │          │   中心服务器（你维护）    │
│                             │          │                          │
│  Gemini CLI ────────────────┼─ HTTP ──→│  MCP Server (Remote)     │
│                             │          │  - 所有 SQL 逻辑          │
│  Local Agent ←──────────────┼─ HTTP ───┤  - 所有诊断算法          │
│  (轻量级 SQL 执行器)         │          │  - 多租户管理            │
│       ↓                     │          │                          │
│  StarRocks DB               │          │                          │
│  (内网，防火墙保护)          │          │                          │
└─────────────────────────────┘          └──────────────────────────┘

┌─────────────────────────────┐                    ↑
│  租户 B 内网                 │                    │
│                             │                    │
│  Gemini CLI ────────────────┼─ HTTP ─────────────┤
│                             │                    │
│  Local Agent ←──────────────┼─ HTTP ──────────────
│  (轻量级 SQL 执行器)         │
│       ↓                     │
│  StarRocks DB               │
└─────────────────────────────┘
```

## 📦 组件说明

### 1. Local Agent（用户本地运行）

**职责**：

- 只负责执行 SQL 查询
- 不包含任何业务逻辑
- 极轻量（约 300 行代码）

**安全特性**：

- Token 认证
- 只允许 SELECT 查询
- 不允许 DROP、DELETE、UPDATE 等危险操作
- 数据库凭证保存在本地，不发送到远程

**文件**：`local-agent.js`

### 2. 中心 MCP 服务器（你维护）

**职责**：

- 管理多个租户
- 包含所有 SQL 查询逻辑
- 包含所有专家诊断算法
- 通过 HTTP 调用 Local Agent 执行 SQL

**优势**：

- 升级只需要改动这一个服务器
- 所有租户立即享受更新
- 代码保护（用户看不到诊断逻辑）

**文件**：`index-expert-http-remote.js`

### 3. 租户配置（你维护）

**职责**：

- 管理租户列表
- 配置每个租户的 Agent 地址和 Token
- 启用/禁用租户

**文件**：`tenants-config.json`

## 🚀 部署指南

### 步骤 1：用户安装 Local Agent

用户只需要运行一次：

```bash
# 方式 1: 使用安装脚本
curl -fsSL https://your-domain.com/install-agent.sh | bash

# 方式 2: 手动安装
cd mcp-example
./install-agent.sh
```

安装后的目录结构：

```
~/.starrocks-agent/
  ├── local-agent.js      # Agent 代码
  ├── .env                # 配置文件（包含数据库连接和 Token）
  ├── start-agent.sh      # 启动脚本
  ├── stop-agent.sh       # 停止脚本
  └── status.sh           # 状态检查脚本
```

### 步骤 2：用户配置 Local Agent

编辑 `~/.starrocks-agent/.env`：

```bash
# StarRocks 数据库配置
SR_HOST=localhost
SR_PORT=9030
SR_USER=root
SR_PASSWORD=your-password

# Agent 端口
AGENT_PORT=8080

# Agent Token（安装时自动生成）
AGENT_TOKEN=a1b2c3d4e5f6...
```

### 步骤 3：用户启动 Local Agent

```bash
cd ~/.starrocks-agent
./start-agent.sh
```

或使用后台运行：

```bash
# 使用 PM2
npm install -g pm2
cd ~/.starrocks-agent
pm2 start local-agent.js --name starrocks-agent

# 或使用 systemd
sudo systemctl enable starrocks-agent
sudo systemctl start starrocks-agent
```

验证 Agent 运行：

```bash
cd ~/.starrocks-agent
./status.sh

# 或
curl http://localhost:8080/health
```

### 步骤 4：你配置中心服务器

复制租户配置模板：

```bash
cd mcp-example
cp tenants-config.example.json tenants-config.json
```

编辑 `tenants-config.json`，添加用户的租户信息：

```json
{
  "tenants": {
    "company_a": {
      "name": "Company A",
      "agent_url": "https://agent.company-a.com:8080",
      "agent_token": "用户提供的 Token",
      "description": "Company A Production",
      "enabled": true,
      "created_at": "2025-01-15T00:00:00Z"
    },
    "company_b": {
      "name": "Company B",
      "agent_url": "https://agent.company-b.com:8080",
      "agent_token": "用户提供的 Token",
      "description": "Company B Production",
      "enabled": true,
      "created_at": "2025-01-16T00:00:00Z"
    }
  }
}
```

### 步骤 5：启动中心 MCP 服务器

```bash
cd mcp-example

# 配置环境变量
export PORT=3000
export API_KEY=$(openssl rand -hex 32)
export TENANTS_CONFIG=./tenants-config.json

# 启动服务器
node index-expert-http-remote.js
```

或使用 PM2：

```bash
pm2 start index-expert-http-remote.js --name starrocks-mcp-remote
```

### 步骤 6：用户配置 Gemini CLI

用户编辑 `~/.gemini/settings.json`：

```json
{
  "mcpServers": {
    "starrocks-remote": {
      "url": "https://your-mcp-server.com:3000/sse",
      "headers": {
        "X-API-Key": "你提供的 API Key",
        "X-Tenant-ID": "company_a"
      },
      "timeout": 600000
    }
  }
}
```

### 步骤 7：测试连接

用户测试：

```bash
# 1. 测试 Local Agent
curl http://localhost:8080/health

# 2. 测试 Gemini CLI
gemini mcp list
# 应该看到 starrocks-remote (connected)

# 3. 测试诊断功能
gemini "分析一下我的 StarRocks 存储健康状况"
```

## 🔄 升级场景示例

### 场景：StarRocks 新版本改了 SQL 语法

**传统方案（需要用户操作）**：

```bash
# ❌ 每个用户都需要
1. 你：发布新版本
2. 你：通知所有用户更新
3. 用户：git pull && npm install
4. 用户：重启 MCP Server
```

**远程架构（用户无感知）**：

```javascript
// ✅ 你只需要修改中心服务器代码
// index-expert-http-remote.js

async analyzeTenantStorage(tenantId) {
  const connection = this.createRemoteConnection(tenant);

  // 修改这里的 SQL
  const diskData = await connection.query(
    'SHOW PROC "/backends/new_format"'  // ← 改这里
  );

  // 修改分析逻辑
  const analysis = this.expertCoordinator.analyze(diskData);
  return analysis;
}

// 保存 → 重启服务器 → 完成！
// 所有租户立即享受修复，无需任何操作
```

## 🔒 安全最佳实践

### Local Agent 安全

1. **使用强 Token**：

   ```bash
   # 生成 64 位十六进制 Token
   openssl rand -hex 32
   ```

2. **限制允许的操作**：
   - Agent 默认只允许 SELECT 查询
   - 禁止 DROP、DELETE、UPDATE 等危险操作

3. **网络访问控制**：
   - 使用防火墙限制只有中心服务器可以访问 Agent
   - 推荐使用 HTTPS（通过 Nginx 反向代理）

4. **数据库权限最小化**：
   ```sql
   -- 创建只读用户
   CREATE USER 'mcp_readonly'@'%' IDENTIFIED BY 'password';
   GRANT SELECT ON information_schema.* TO 'mcp_readonly'@'%';
   GRANT SELECT ON _statistics_.* TO 'mcp_readonly'@'%';
   ```

### 中心服务器安全

1. **API Key 认证**：
   - 所有请求都需要 API Key
   - 定期轮换 API Key

2. **Tenant ID 验证**：
   - 每个请求必须提供有效的 Tenant ID
   - 防止租户间数据泄露

3. **HTTPS**：
   - 生产环境必须使用 HTTPS
   - 使用 Let's Encrypt 免费证书

4. **Rate Limiting**：

   ```nginx
   limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;

   location / {
       limit_req zone=mcp_limit burst=20;
       proxy_pass http://localhost:3000;
   }
   ```

## 📊 监控和日志

### Local Agent 监控

```bash
# 检查 Agent 状态
cd ~/.starrocks-agent
./status.sh

# 查看日志（如果使用 PM2）
pm2 logs starrocks-agent

# 查看资源使用
pm2 monit
```

### 中心服务器监控

```bash
# 查看所有租户
curl -H "X-API-Key: your-key" \
     https://your-server.com:3000/tenants

# 健康检查
curl https://your-server.com:3000/health

# 查看日志
pm2 logs starrocks-mcp-remote

# 或使用 Docker
docker logs -f starrocks-mcp-remote
```

## 🔧 故障排查

### 问题 1: Agent 无法连接数据库

**症状**：

```
Database connection failed: ECONNREFUSED
```

**解决方案**：

1. 检查数据库是否运行：

   ```bash
   mysql -h $SR_HOST -P $SR_PORT -u $SR_USER -p
   ```

2. 检查防火墙规则

3. 检查 `.env` 配置

### 问题 2: 中心服务器无法连接 Agent

**症状**：

```
Cannot connect to agent at http://...
```

**解决方案**：

1. 检查 Agent 是否运行：

   ```bash
   curl http://agent-url:8080/health
   ```

2. 检查网络连通性：

   ```bash
   telnet agent-url 8080
   ```

3. 检查 Token 是否正确

4. 检查防火墙规则

### 问题 3: Token 认证失败

**症状**：

```
401 Unauthorized: Invalid or missing agent token
```

**解决方案**：

1. 确认 Agent 的 `.env` 中的 `AGENT_TOKEN`
2. 确认中心服务器的 `tenants-config.json` 中的 `agent_token`
3. 确保两者完全一致

### 问题 4: SQL 执行被拒绝

**症状**：

```
403 Forbidden: Only SELECT queries are allowed
```

**原因**：
Agent 安全策略禁止危险操作

**解决方案**：
这是正常的安全行为。如果确实需要执行非 SELECT 操作，需要修改 Agent 代码中的白名单。

## 📈 性能优化

### Local Agent 优化

1. **使用连接池**：

   ```javascript
   // local-agent.js
   this.pool = mysql.createPool({
     host: this.dbConfig.host,
     user: this.dbConfig.user,
     password: this.dbConfig.password,
     connectionLimit: 10,
     queueLimit: 0,
   });
   ```

2. **批量查询**：
   使用 `/execute-batch` 端点一次执行多个查询

### 中心服务器优化

1. **连接复用**：
   RemoteConnectionWrapper 会复用 HTTP 连接

2. **缓存**：
   对频繁查询的静态数据添加缓存

   ```javascript
   import NodeCache from 'node-cache';
   const cache = new NodeCache({ stdTTL: 60 });
   ```

3. **并发控制**：
   使用 PM2 cluster 模式
   ```bash
   pm2 start index-expert-http-remote.js -i 4
   ```

## 🌐 生产环境部署

### 使用 Docker Compose

创建 `docker-compose-remote.yml`：

```yaml
version: '3.8'

services:
  mcp-server-remote:
    build: .
    image: starrocks-mcp-remote
    ports:
      - '3000:3000'
    environment:
      - PORT=3000
      - API_KEY=${API_KEY}
      - TENANTS_CONFIG=/app/tenants-config.json
    volumes:
      - ./tenants-config.json:/app/tenants-config.json:ro
    restart: unless-stopped
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge
```

启动：

```bash
docker-compose -f docker-compose-remote.yml up -d
```

### 使用 Kubernetes

创建 `k8s-deployment.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: starrocks-mcp-remote
spec:
  replicas: 3
  selector:
    matchLabels:
      app: starrocks-mcp-remote
  template:
    metadata:
      labels:
        app: starrocks-mcp-remote
    spec:
      containers:
        - name: mcp-server
          image: starrocks-mcp-remote:latest
          ports:
            - containerPort: 3000
          env:
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: mcp-secrets
                  key: api-key
          volumeMounts:
            - name: tenants-config
              mountPath: /app/tenants-config.json
              subPath: tenants-config.json
      volumes:
        - name: tenants-config
          configMap:
            name: tenants-config
---
apiVersion: v1
kind: Service
metadata:
  name: starrocks-mcp-remote
spec:
  selector:
    app: starrocks-mcp-remote
  ports:
    - port: 3000
      targetPort: 3000
  type: LoadBalancer
```

## 💰 商业化考虑

### 定价模型

1. **按租户数量**：
   - 基础版：1-5 个租户
   - 专业版：6-20 个租户
   - 企业版：无限租户

2. **按查询次数**：
   - 每月 1000 次查询免费
   - 超出部分按次计费

3. **按功能**：
   - 基础诊断：免费
   - 高级分析：付费
   - AI 推荐：高级付费

### 用户管理

添加用户认证系统：

```javascript
// 集成 OAuth2
import passport from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';

// 或使用 Auth0、Firebase Auth 等第三方服务
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
