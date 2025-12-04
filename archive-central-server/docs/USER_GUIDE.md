# StarRocks MCP Server 使用指南

本指南详细介绍 StarRocks MCP Server 三种部署模式的完整使用方法。

## 目录

- [快速选择](#快速选择)
- [模式 1: 本地 Stdio 模式](#模式-1-本地-stdio-模式)
- [模式 2: HTTP/SSE 直连模式](#模式-2-httpsse-直连模式)
- [模式 3: 远程代理架构](#模式-3-远程代理架构)
- [可用工具列表](#可用工具列表)
- [常见问题](#常见问题)
- [故障排除](#故障排除)

---

## 快速选择

| 使用场景             | 推荐模式 | 启动命令                                            |
| -------------------- | -------- | --------------------------------------------------- |
| 个人本地开发测试     | 模式 1   | `npm start`                                         |
| 团队内共享（同网络） | 模式 2   | `npm run start:http`                                |
| SaaS 多租户服务      | 模式 3   | `npm run start:http-remote` + `npm run start:agent` |

---

## 模式 1: 本地 Stdio 模式

### 适用场景

- ✅ 个人本地开发和测试
- ✅ 数据库在本机或可直接访问
- ✅ 使用 Claude Desktop 或 Gemini CLI
- ❌ 不适合团队共享
- ❌ 不支持远程访问

### 使用步骤

#### 1. 配置数据库连接

创建 `.env` 文件：

```bash
# StarRocks 数据库配置
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=your_password
SR_PORT=9030
```

#### 2. 安装依赖

```bash
cd mcp-example
npm install
```

#### 3. 测试连接（可选）

```bash
# 测试数据库连接是否正常
node -e "
import('mysql2/promise').then(mysql => {
  mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'your_password',
    port: 9030
  }).then(conn => {
    console.log('✅ Database connection successful!');
    conn.end();
  }).catch(err => {
    console.error('❌ Connection failed:', err.message);
  });
});
"
```

#### 4. 配置 MCP 客户端

**对于 Gemini CLI** (`~/.config/gemini-cli/mcp_server_config.json`):

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": [
        "/home/disk5/dingkai/github/gemini-cli/mcp-example/index-expert-enhanced.js"
      ],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "your_password",
        "SR_PORT": "9030"
      }
    }
  }
}
```

**对于 Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` macOS 或 `%APPDATA%/Claude/claude_desktop_config.json` Windows):

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["/path/to/mcp-example/index-expert-enhanced.js"],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "your_password"
      }
    }
  }
}
```

#### 5. 启动使用

重启 Gemini CLI 或 Claude Desktop，MCP Server 会自动启动。

#### 6. 验证工具可用性

在 Gemini CLI 中输入：

```
/mcp-list-tools
```

你应该看到类似输出：

```
Available MCP Tools from starrocks-expert:
  1. analyze_storage_health - 全面分析存储健康状况
  2. analyze_compaction_health - 分析 Compaction 健康状况
  3. analyze_system_comprehensive - 多专家协同综合分析
  ...
```

#### 7. 使用示例

```
请帮我分析当前 StarRocks 集群的存储健康状况
```

Gemini 会自动调用 `analyze_storage_health` 工具并返回诊断报告。

### 日志查看

Stdio 模式的日志输出到客户端的标准错误流：

- **Gemini CLI**: 日志显示在终端
- **Claude Desktop**: 日志在开发者工具控制台（View > Toggle Developer Tools）

### 优缺点

**优点：**

- ⚡ 零网络延迟（本地进程通信）
- 🔒 最安全（无网络暴露）
- 🎯 配置最简单

**缺点：**

- 🚫 无法团队共享
- 🚫 每次客户端启动都要启动 MCP Server
- 🚫 多用户需要各自配置

---

## 模式 2: HTTP/SSE 直连模式

### 适用场景

- ✅ 团队内多人共享同一个 StarRocks 集群
- ✅ 数据库和 MCP Server 在同一网络
- ✅ 需要通过浏览器或远程客户端访问
- ❌ 不适合数据库网络隔离场景
- ❌ 不适合多租户 SaaS

### 使用步骤

#### 1. 配置环境变量

创建 `.env` 文件：

```bash
# StarRocks 数据库配置
SR_HOST=10.0.1.100
SR_USER=root
SR_PASSWORD=your_password
SR_PORT=9030

# HTTP 服务器配置
PORT=3000
API_KEY=your-secret-api-key-here-change-me

# CORS 配置（可选）
ALLOWED_ORIGINS=https://your-app.com,http://localhost:5173
```

#### 2. 启动 HTTP 服务器

```bash
cd mcp-example
npm run start:http
```

你会看到类似输出：

```
🎉 StarRocks MCP HTTP Server is running!

   📡 SSE endpoint:     http://localhost:3000/sse
   💬 Messages:         http://localhost:3000/messages
   ❤️  Health check:    http://localhost:3000/health

   🔑 Authentication:   Enabled
   🌍 CORS:             https://your-app.com, http://localhost:5173

   Press Ctrl+C to stop the server
```

#### 3. 健康检查

```bash
curl http://localhost:3000/health
```

响应：

```json
{
  "status": "healthy",
  "service": "starrocks-mcp-server",
  "version": "2.0.0",
  "uptime": 123.45,
  "experts": 15
}
```

#### 4. 配置 MCP 客户端（SSE 连接）

**对于 Gemini CLI** (`~/.config/gemini-cli/mcp_server_config.json`):

```json
{
  "mcpServers": {
    "starrocks-remote": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "your-secret-api-key-here-change-me"
      }
    }
  }
}
```

**对于自定义客户端**（使用 MCP SDK）:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:3000/sse'), {
  headers: {
    'X-API-Key': 'your-secret-api-key-here-change-me',
  },
});

const client = new Client(
  { name: 'my-client', version: '1.0.0' },
  { capabilities: {} },
);

await client.connect(transport);

// 列出可用工具
const tools = await client.listTools();
console.log(
  'Available tools:',
  tools.tools.map((t) => t.name),
);

// 调用工具
const result = await client.callTool({
  name: 'analyze_storage_health',
  arguments: {},
});
console.log('Result:', result);
```

#### 5. 生产部署建议

**使用 PM2 进行进程管理：**

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start index-expert-http.js --name starrocks-mcp

# 查看日志
pm2 logs starrocks-mcp

# 查看状态
pm2 status

# 重启服务
pm2 restart starrocks-mcp

# 设置开机自启
pm2 startup
pm2 save
```

**使用 Nginx 反向代理：**

```nginx
server {
    listen 80;
    server_name mcp.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

**使用 Docker 部署：**

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:http"]
```

构建和运行：

```bash
docker build -t starrocks-mcp-http .

docker run -d \
  --name starrocks-mcp \
  -p 3000:3000 \
  -e SR_HOST=10.0.1.100 \
  -e SR_USER=root \
  -e SR_PASSWORD=your_password \
  -e API_KEY=your-api-key \
  --restart unless-stopped \
  starrocks-mcp-http
```

#### 6. 安全配置

**强 API Key 生成：**

```bash
# 生成安全的 API Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**HTTPS 配置（推荐生产环境）：**

使用 Let's Encrypt + Certbot：

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d mcp.your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

#### 7. 监控和日志

**查看实时日志：**

```bash
# PM2
pm2 logs starrocks-mcp --lines 100

# Docker
docker logs -f starrocks-mcp

# systemd
journalctl -u starrocks-mcp -f
```

**日志格式：**

```
2025-01-15T10:23:45.123Z GET /health 200 5ms
2025-01-15T10:24:00.456Z GET /sse 200 0ms
2025-01-15T10:24:01.789Z POST /messages/session_1736936640456 200 1523ms
```

### 优缺点

**优点：**

- 👥 支持多用户同时访问
- 🌐 可远程访问
- 📊 统一监控和日志
- ⚡ 服务器资源共享

**缺点：**

- 🔒 需要数据库网络可达
- ⚙️ 需要额外运维（进程管理、监控）
- 🔐 需要配置认证和 HTTPS

---

## 模式 3: 远程代理架构

### 适用场景

- ✅ 多租户 SaaS 服务
- ✅ 数据库在客户内网，无法直接访问
- ✅ 需要零维护升级（只升级中心服务器）
- ✅ 需要租户隔离
- ❌ 复杂度最高

### 架构说明

```
┌─────────────┐         ┌──────────────┐         ┌────────────┐
│  Gemini CLI │◄────────┤  中心服务器   │◄────────┤ 客户 Agent │
│  (租户 A)   │  SSE    │  (你维护)    │  HTTP   │ (客户维护) │
└─────────────┘         └──────────────┘         └────────────┘
                               │                        │
                               │                   ┌────▼────┐
                               │                   │StarRocks│
┌─────────────┐                │                   │  (内网) │
│  Gemini CLI │◄───────────────┘                   └─────────┘
│  (租户 B)   │  SSE
└─────────────┘
```

### 完整部署流程

#### 阶段 1: 客户端部署 Local Agent

**客户需要做的事情：**

##### 1.1 一键安装 Agent

```bash
# 下载安装脚本
curl -O https://your-domain.com/install-agent.sh
chmod +x install-agent.sh

# 运行安装
./install-agent.sh
```

安装脚本会自动：

- 检查 Node.js 版本（需要 >= 18）
- 安装到 `~/.starrocks-agent/`
- 生成安全的 Agent Token（64 字符）
- 创建启动脚本
- 生成配置文件模板

输出示例：

```
🚀 StarRocks Local Agent Installation
======================================

✅ Node.js version: 18.17.0 (OK)
✅ Installing to: ~/.starrocks-agent/
✅ Copying files...
✅ Installing dependencies...
✅ Generated agent token: a1b2c3d4e5f6...

📋 Configuration file created: ~/.starrocks-agent/.env

Please edit the configuration file with your database credentials:
  nano ~/.starrocks-agent/.env

Then start the agent:
  ~/.starrocks-agent/start.sh

🎉 Installation complete!
```

##### 1.2 配置 Agent

编辑 `~/.starrocks-agent/.env`：

```bash
# StarRocks 数据库配置（客户内网数据库）
SR_HOST=10.0.1.100
SR_USER=root
SR_PASSWORD=your_internal_db_password
SR_PORT=9030

# Agent 服务配置
AGENT_PORT=8080
AGENT_TOKEN=a1b2c3d4e5f6...  # 安装时自动生成
```

##### 1.3 启动 Agent

```bash
# 启动
~/.starrocks-agent/start.sh

# 查看状态
~/.starrocks-agent/status.sh

# 停止
~/.starrocks-agent/stop.sh

# 查看日志
~/.starrocks-agent/logs.sh
```

启动输出：

```
🎉 StarRocks Local Agent is running!

   📡 HTTP endpoint:    http://localhost:8080
   ❤️  Health check:    http://localhost:8080/health
   🔗 Test connection:  http://localhost:8080/test-connection

   🔑 Authentication:   Enabled
   🗄️  Database:         10.0.1.100:9030

   Press Ctrl+C to stop the agent
```

##### 1.4 测试 Agent 连接

```bash
# 健康检查
curl http://localhost:8080/health

# 测试数据库连接
curl http://localhost:8080/test-connection \
  -H "X-Agent-Token: a1b2c3d4e5f6..."

# 测试 SQL 执行
curl http://localhost:8080/execute-sql \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: a1b2c3d4e5f6..." \
  -d '{
    "sql": "SELECT VERSION() as version"
  }'
```

##### 1.5 配置外网访问（如果需要）

如果中心服务器需要通过公网访问客户内网的 Agent：

**方法 A: 端口映射（简单）**

在客户路由器配置端口映射：`外网 IP:8080` → `内网 10.0.1.50:8080`

**方法 B: 使用 frp 内网穿透**

```bash
# 安装 frp 客户端
wget https://github.com/fatedier/frp/releases/download/v0.52.0/frp_0.52.0_linux_amd64.tar.gz
tar -xzf frp_0.52.0_linux_amd64.tar.gz
cd frp_0.52.0_linux_amd64

# 配置 frpc.ini
cat > frpc.ini <<EOF
[common]
server_addr = frp.your-domain.com
server_port = 7000
token = your-frp-token

[starrocks-agent]
type = tcp
local_ip = 127.0.0.1
local_port = 8080
remote_port = 6080
EOF

# 启动 frp 客户端
./frpc -c frpc.ini
```

现在 Agent 可以通过 `frp.your-domain.com:6080` 访问。

**方法 C: Ngrok（临时测试）**

```bash
ngrok http 8080
```

##### 1.6 将信息提供给服务提供商

客户需要提供给你（服务提供商）：

- Agent URL: `http://123.45.67.89:8080` 或 `http://frp.your-domain.com:6080`
- Agent Token: `a1b2c3d4e5f6...`（从 `.env` 文件获取）
- 期望的租户 ID: `company_abc`（由客户决定）

---

#### 阶段 2: 服务端部署中心服务器

**你（服务提供商）需要做的事情：**

##### 2.1 配置租户信息

创建 `tenants-config.json`：

```json
{
  "tenants": {
    "company_abc": {
      "name": "ABC 公司",
      "agent_url": "http://123.45.67.89:8080",
      "agent_token": "a1b2c3d4e5f6...",
      "description": "ABC 公司的 StarRocks 集群",
      "enabled": true,
      "created_at": "2025-01-15T00:00:00Z",
      "contact": "admin@company-abc.com"
    },
    "company_xyz": {
      "name": "XYZ 公司",
      "agent_url": "http://frp.your-domain.com:6081",
      "agent_token": "xyz789token...",
      "enabled": true,
      "created_at": "2025-01-16T00:00:00Z"
    }
  }
}
```

##### 2.2 配置环境变量

创建 `.env`：

```bash
# 中心服务器配置
PORT=3000
API_KEY=your-central-server-api-key

# 租户配置文件路径
TENANTS_CONFIG=./tenants-config.json

# CORS 配置
ALLOWED_ORIGINS=*
```

##### 2.3 启动中心服务器

```bash
cd mcp-example
npm run start:http-remote
```

输出：

```
🚀 StarRocks MCP HTTP Server (Remote Mode) initialized
   Port: 3000
   Auth: Enabled (API Key)
   Tenants: 2 loaded (2 enabled)

🎉 StarRocks MCP HTTP Server is running!

   📡 SSE endpoint:     http://localhost:3000/sse
   💬 Messages:         http://localhost:3000/messages
   ❤️  Health check:    http://localhost:3000/health

   🏢 Tenants:
      - company_abc (ABC 公司) ✅
      - company_xyz (XYZ 公司) ✅

   Press Ctrl+C to stop the server
```

##### 2.4 验证租户连接

```bash
# 测试租户 A 的 Agent 连接
curl http://localhost:3000/test-agent \
  -H "X-Tenant-ID: company_abc" \
  -H "X-API-Key: your-central-server-api-key"

# 预期响应
{
  "success": true,
  "tenant": "company_abc",
  "agent_url": "http://123.45.67.89:8080",
  "agent_status": "healthy",
  "database_version": "3.1.5"
}
```

##### 2.5 生产部署（同模式 2）

使用 PM2 / Docker / systemd 部署中心服务器，参考模式 2 的生产部署章节。

---

#### 阶段 3: 客户端配置 MCP Client

**客户最终用户需要做的事情：**

##### 3.1 配置 Gemini CLI

编辑 `~/.config/gemini-cli/mcp_server_config.json`：

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "url": "https://mcp.your-domain.com/sse",
      "headers": {
        "X-API-Key": "your-central-server-api-key",
        "X-Tenant-ID": "company_abc"
      }
    }
  }
}
```

**重要说明：**

- `X-API-Key`: 由服务提供商（你）提供，用于访问中心服务器
- `X-Tenant-ID`: 客户的租户 ID（如 `company_abc`）

##### 3.2 启动 Gemini CLI 并测试

```bash
gemini-cli

# 在 CLI 中测试
> /mcp-list-tools

# 应该看到完整的工具列表

> 请帮我分析 StarRocks 集群的存储健康状况
```

##### 3.3 数据流确认

当用户执行诊断请求时，完整流程：

```
用户输入 → Gemini CLI → 中心服务器 → 客户 Agent → 客户数据库
                            ↓
                      (所有诊断逻辑)
                            ↓
用户看到结果 ← Gemini CLI ← 中心服务器
```

---

### 多租户管理

#### 添加新租户

1. 客户完成 Agent 安装（阶段 1）
2. 客户提供 Agent URL 和 Token
3. 你在 `tenants-config.json` 添加配置
4. 重启中心服务器（无需重启 Agent）
5. 通知客户配置 Gemini CLI

#### 禁用租户

```json
{
  "tenants": {
    "company_abc": {
      "name": "ABC 公司",
      "enabled": false,  // 设置为 false
      ...
    }
  }
}
```

重启服务器后，该租户的所有请求将被拒绝（返回 404）。

#### 升级维护

**升级专家逻辑（零维护）：**

1. 修改中心服务器代码（如修改 SQL 查询）
2. 重启中心服务器
3. **所有租户自动获得新功能**（无需任何操作）

**升级 Agent（极少需要）：**

只有以下情况需要升级 Agent：

- 修改 API 接口（极少发生）
- Agent 本身有 bug（很少发生）
- 需要新的安全特性

---

### 监控和管理

#### 中心服务器监控

**租户请求统计：**

添加到 `index-expert-http-remote.js`（可选）：

```javascript
const tenantStats = new Map();

app.use((req, res, next) => {
  if (req.tenantId) {
    const stats = tenantStats.get(req.tenantId) || { requests: 0, errors: 0 };
    stats.requests++;
    tenantStats.set(req.tenantId, stats);
  }
  next();
});

// 统计端点
app.get('/admin/stats', (req, res) => {
  res.json({
    tenants: Array.from(tenantStats.entries()).map(([id, stats]) => ({
      tenant_id: id,
      ...stats,
    })),
  });
});
```

#### Agent 监控

在客户端设置健康检查：

```bash
# 添加到 crontab
*/5 * * * * curl -f http://localhost:8080/health || systemctl restart starrocks-agent
```

### 安全最佳实践

#### 1. Token 轮换

定期更换 Agent Token：

```bash
# 在客户端生成新 Token
NEW_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "New token: $NEW_TOKEN"

# 更新客户端 .env
sed -i "s/AGENT_TOKEN=.*/AGENT_TOKEN=$NEW_TOKEN/" ~/.starrocks-agent/.env

# 重启 Agent
~/.starrocks-agent/stop.sh
~/.starrocks-agent/start.sh

# 通知服务提供商更新 tenants-config.json
```

#### 2. 网络隔离

- Agent 只监听内网 IP（不要监听 0.0.0.0）
- 使用防火墙限制访问来源
- 使用 VPN 或专线连接

#### 3. 审计日志

在中心服务器记录所有租户操作：

```javascript
app.use((req, res, next) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      tenant: req.tenantId,
      method: req.method,
      path: req.path,
      ip: req.ip,
    }),
  );
  next();
});
```

### 优缺点

**优点：**

- 🔄 零维护升级（只升级中心服务器）
- 🏢 完美多租户隔离
- 🔒 数据库保持内网隔离
- 📊 集中监控和管理
- 💰 SaaS 商业模式友好

**缺点：**

- 🔧 部署复杂度最高
- 🌐 需要网络可达（Agent → 中心服务器）
- ⚙️ 需要客户端配合部署 Agent
- 📈 额外网络延迟（通常 < 100ms）

---

## 可用工具列表

所有三种模式都提供以下专家工具：

### 存储专家工具

| 工具名称                  | 功能描述             | 主要参数 |
| ------------------------- | -------------------- | -------- |
| `analyze_storage_health`  | 全面分析存储健康状况 | 无       |
| `get_disk_usage`          | 获取磁盘使用情况     | 无       |
| `get_tablet_distribution` | 获取 Tablet 分布     | 无       |
| `get_replica_status`      | 获取副本状态         | 无       |
| `get_large_tables`        | 获取大表列表         | `limit`  |

### Compaction 专家工具

| 工具名称                         | 功能描述                 | 主要参数            |
| -------------------------------- | ------------------------ | ------------------- |
| `analyze_compaction_health`      | 分析 Compaction 健康状况 | 无                  |
| `get_compaction_status`          | 获取 Compaction 状态     | 无                  |
| `get_high_compaction_partitions` | 获取高 Compaction 分区   | `limit`, `minScore` |
| `get_compaction_history`         | 获取 Compaction 历史     | `hours`             |

### 导入专家工具

| 工具名称                | 功能描述           | 主要参数         |
| ----------------------- | ------------------ | ---------------- |
| `analyze_import_health` | 分析导入健康状况   | 无               |
| `get_load_jobs`         | 获取导入作业       | `limit`, `state` |
| `check_load_job_status` | 检查导入作业状态   | `label`          |
| `get_failed_load_jobs`  | 获取失败的导入作业 | `hours`, `limit` |

### 数据摄取专家工具

| 工具名称                   | 功能描述               | 主要参数 |
| -------------------------- | ---------------------- | -------- |
| `analyze_ingestion_health` | 分析数据摄取健康状况   | `hours`  |
| `get_stream_load_stats`    | 获取 Stream Load 统计  | `hours`  |
| `get_routine_load_jobs`    | 获取 Routine Load 作业 | 无       |

### 综合分析工具

| 工具名称                       | 功能描述           | 主要参数 |
| ------------------------------ | ------------------ | -------- |
| `analyze_system_comprehensive` | 多专家协同综合分析 | 无       |

### 工具使用示例

**在 Gemini CLI 中：**

```
# 自然语言（推荐）
> 请帮我分析当前集群的存储健康状况
> 查找最近 24 小时内失败的导入作业
> 给我看看 Compaction 得分最高的 20 个分区

# 直接调用工具
> /mcp-call-tool starrocks-expert analyze_storage_health {}
> /mcp-call-tool starrocks-expert get_failed_load_jobs {"hours": 24, "limit": 10}
```

**通过 API（模式 2/3）：**

```bash
# 列出所有工具
curl http://localhost:3000/tools \
  -H "X-API-Key: your-api-key"

# 调用工具
curl http://localhost:3000/call-tool \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "tool": "analyze_storage_health",
    "arguments": {}
  }'
```

---

## 常见问题

### Q1: 如何选择部署模式？

**A:** 参考决策树：

```
是否需要团队共享？
├─ 否 → 模式 1（本地 Stdio）
└─ 是 → 数据库是否可直接访问？
    ├─ 是 → 模式 2（HTTP/SSE 直连）
    └─ 否 → 模式 3（远程代理）
```

### Q2: 模式 2 和模式 3 可以共存吗？

**A:** 可以。你可以同时运行：

- `npm run start:http`（端口 3000）- 直连模式
- `npm run start:http-remote`（端口 3001）- 远程模式

不同客户端连接不同端口即可。

### Q3: Agent 需要公网 IP 吗？

**A:** 不一定。有三种方案：

1. **内网访问**：中心服务器也在同一内网（最安全）
2. **VPN/专线**：通过 VPN 访问客户内网（推荐）
3. **内网穿透**：使用 frp/ngrok（临时测试）
4. **端口映射**：路由器配置（需要公网 IP）

### Q4: Agent 会执行危险操作吗？

**A:** 不会。Agent 有严格的安全限制：

- 只允许 `SELECT` 查询
- 拒绝 `DROP`, `DELETE`, `UPDATE`, `INSERT` 等写操作
- 所有危险关键词都会被拒绝（返回 403）

### Q5: 中心服务器升级会影响客户吗？

**A:** 模式 3 的核心优势就是零影响升级：

- 你升级中心服务器
- 所有租户自动获得新功能
- Agent 无需升级（除非 API 变更）
- 客户无需任何操作

### Q6: 如何处理 Agent 离线？

**A:** 中心服务器会返回明确错误：

```json
{
  "error": "Agent connection failed",
  "message": "Failed to connect to agent at http://...",
  "tenant": "company_abc"
}
```

客户需要检查：

1. Agent 是否运行（`~/.starrocks-agent/status.sh`）
2. 网络是否可达（防火墙/VPN）
3. Token 是否正确

### Q7: 性能对比如何？

| 指标 | 模式 1         | 模式 2     | 模式 3     |
| ---- | -------------- | ---------- | ---------- |
| 延迟 | < 10ms         | 50-100ms   | 100-200ms  |
| 并发 | 单用户         | 100+       | 1000+      |
| 资源 | 低（每客户端） | 中（共享） | 高（中心） |

对于诊断分析场景（非高频调用），模式 3 的额外延迟完全可以接受。

### Q8: 如何调试 SSE 连接问题？

**A:** 使用浏览器开发者工具：

```javascript
// 在浏览器控制台测试 SSE 连接
const es = new EventSource('http://localhost:3000/sse', {
  headers: {
    'X-API-Key': 'your-api-key',
    'X-Tenant-ID': 'company_abc', // 模式 3 需要
  },
});

es.onmessage = (event) => {
  console.log('Message:', event.data);
};

es.onerror = (error) => {
  console.error('Error:', error);
};
```

### Q9: 数据库密码安全吗？

**A:** 安全保障：

- **模式 1**: 密码在本地 `.env` 文件（不离开客户端）
- **模式 2**: 密码在服务器 `.env` 文件（你维护）
- **模式 3**: 密码在客户 Agent 的 `.env` 文件（客户维护，不发送给中心服务器）

模式 3 最安全，密码永远不离开客户内网。

### Q10: 可以自定义专家逻辑吗？

**A:** 可以。修改 `experts/` 目录下的专家文件：

- `storage-expert-integrated.js` - 存储专家
- `compaction-expert-integrated.js` - Compaction 专家
- `import-expert-integrated.js` - 导入专家
- `ingestion-expert-integrated.js` - 摄取专家

然后重启服务器即可。模式 3 下，所有租户自动获得更新。

---

## 故障排除

### 问题 1: 无法连接数据库

**错误信息：**

```
Error: connect ECONNREFUSED 10.0.1.100:9030
```

**排查步骤：**

1. 检查数据库是否运行：

```bash
mysql -h 10.0.1.100 -P 9030 -u root -p
```

2. 检查网络连通性：

```bash
telnet 10.0.1.100 9030
# 或
nc -zv 10.0.1.100 9030
```

3. 检查防火墙规则：

```bash
# 在数据库服务器上
sudo iptables -L -n | grep 9030
```

4. 检查 StarRocks 监听地址：

```sql
-- 在 StarRocks 中执行
SHOW FRONTENDS\G
-- 查看 Host 是否为 0.0.0.0 或具体 IP
```

### 问题 2: Agent 端口被占用

**错误信息：**

```
Error: listen EADDRINUSE: address already in use :::8080
```

**解决方法：**

```bash
# 查找占用端口的进程
lsof -i :8080
# 或
netstat -tlnp | grep 8080

# 杀死进程
kill -9 <PID>

# 或更改 Agent 端口
echo "AGENT_PORT=8081" >> ~/.starrocks-agent/.env
```

### 问题 3: Agent Token 认证失败

**错误信息：**

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing agent token"
}
```

**排查步骤：**

1. 检查客户端 Token：

```bash
cat ~/.starrocks-agent/.env | grep AGENT_TOKEN
```

2. 检查中心服务器配置：

```bash
cat tenants-config.json | grep -A 5 company_abc
```

3. 确保 Token 完全一致（无空格、无换行）

4. 测试 Token：

```bash
TOKEN=$(cat ~/.starrocks-agent/.env | grep AGENT_TOKEN | cut -d= -f2)
curl http://localhost:8080/test-connection \
  -H "X-Agent-Token: $TOKEN"
```

### 问题 4: SSE 连接超时

**错误信息：**

```
SSE connection timeout after 60s
```

**可能原因：**

1. **反向代理缓冲**（Nginx）：

```nginx
# 在 Nginx 配置中添加
proxy_buffering off;
proxy_read_timeout 86400;
```

2. **防火墙超时**：

```bash
# 调整超时时间
iptables -A OUTPUT -p tcp --sport 3000 -j ACCEPT
```

3. **客户端网络不稳定**：

```javascript
// 在客户端添加重连逻辑
function connectSSE() {
  const es = new EventSource('http://localhost:3000/sse');

  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 5000); // 5秒后重连
  };
}
```

### 问题 5: SQL 执行超时

**错误信息：**

```json
{
  "error": "SQL execution timeout",
  "message": "Query exceeded 120s timeout"
}
```

**解决方法：**

1. 优化慢查询（检查 `experts/*.js` 中的 SQL）
2. 增加超时时间：

```javascript
// 在 local-agent.js 中
const connection = await mysql.createConnection({
  ...this.dbConfig,
  connectTimeout: 60000, // 连接超时 60s
  timeout: 120000, // 查询超时 120s
});
```

### 问题 6: 工具列表为空

**问题：** 调用 `/mcp-list-tools` 返回空列表。

**排查步骤：**

1. 检查服务器日志：

```bash
pm2 logs starrocks-mcp
```

2. 检查专家协调器初始化：

```javascript
// 在 index-expert-http.js 或 index-expert-http-remote.js 中
console.log('Experts loaded:', this.expertCoordinator.getAllTools().length);
```

3. 检查 `experts/` 目录是否完整：

```bash
ls -l experts/
# 应该包含 expert-coordinator.js 和其他专家文件
```

### 问题 7: 跨域 CORS 错误

**错误信息（浏览器控制台）：**

```
Access to fetch at 'http://localhost:3000/sse' from origin 'http://localhost:5173' has been blocked by CORS policy
```

**解决方法：**

在 `.env` 中配置允许的来源：

```bash
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.com
# 或允许所有来源（不推荐生产环境）
ALLOWED_ORIGINS=*
```

### 问题 8: PM2 自动重启循环

**问题：** PM2 显示服务不断重启（restart count 持续增加）。

**排查步骤：**

1. 查看错误日志：

```bash
pm2 logs starrocks-mcp --err --lines 100
```

2. 检查环境变量：

```bash
pm2 env 0  # 查看进程环境变量
```

3. 使用 PM2 配置文件：

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [
    {
      name: 'starrocks-mcp',
      script: './index-expert-http.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        SR_HOST: 'localhost',
        SR_USER: 'root',
        SR_PASSWORD: 'your_password',
        API_KEY: 'your-api-key',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
```

启动：

```bash
pm2 start ecosystem.config.js
```

### 问题 9: Docker 容器无法访问宿主机数据库

**问题：** Docker 中的 MCP Server 无法连接到宿主机的 StarRocks。

**解决方法：**

使用宿主机 IP（而不是 localhost）：

```bash
# Linux
SR_HOST=172.17.0.1

# macOS
SR_HOST=host.docker.internal

# Windows
SR_HOST=host.docker.internal
```

或使用 `--network host`（仅 Linux）：

```bash
docker run --network host ...
```

### 问题 10: 内存占用过高

**问题：** 服务器内存占用持续增长。

**排查步骤：**

1. 检查活跃连接数：

```javascript
// 在 HTTP 服务器中添加监控
app.get('/admin/connections', (req, res) => {
  res.json({
    active: this.activeConnections.size,
    connections: Array.from(this.activeConnections.keys()),
  });
});
```

2. 检查是否有内存泄漏：

```bash
# 使用 Node.js 内存分析
node --inspect index-expert-http.js
# 在 Chrome 中访问 chrome://inspect
```

3. 设置内存限制：

```bash
# PM2
pm2 start index-expert-http.js --max-memory-restart 500M

# Node.js
node --max-old-space-size=512 index-expert-http.js
```

4. 定期清理过期连接：

```javascript
// 在服务器中添加
setInterval(() => {
  const now = Date.now();
  for (const [id, conn] of this.activeConnections.entries()) {
    if (now - conn.createdAt > 3600000) {
      // 1小时
      conn.server.close();
      this.activeConnections.delete(id);
    }
  }
}, 60000); // 每分钟检查一次
```

---

## 获取帮助

### 文档资源

- **架构文档**: `ARCHITECTURE.md` - 详细的架构设计说明
- **快速开始**: `REMOTE_QUICK_START.md` - 5 分钟测试指南
- **远程架构**: `REMOTE_ARCHITECTURE.md` - 模式 3 详细说明

### 社区支持

- **GitHub Issues**: [https://github.com/your-repo/mcp-example/issues](https://github.com/your-repo/mcp-example/issues)
- **文档网站**: [https://docs.your-domain.com](https://docs.your-domain.com)

### 商业支持

如果你需要专业支持（仅模式 3 部署场景）：

- 邮件: support@your-domain.com
- 企业微信: xxx-xxx-xxx

---

## 附录

### A. 环境变量完整列表

```bash
# ========== 数据库配置 ==========
SR_HOST=localhost              # StarRocks 主机地址
SR_USER=root                   # 数据库用户名
SR_PASSWORD=                   # 数据库密码
SR_PORT=9030                   # 数据库端口

# ========== HTTP 服务器配置（模式 2/3）==========
PORT=3000                      # HTTP 服务器端口
API_KEY=                       # API 密钥（强烈建议设置）
ALLOWED_ORIGINS=*              # 允许的 CORS 来源（逗号分隔）

# ========== 远程架构配置（仅模式 3）==========
TENANTS_CONFIG=./tenants-config.json  # 租户配置文件路径

# ========== Local Agent 配置 ==========
AGENT_PORT=8080                # Agent 监听端口
AGENT_TOKEN=                   # Agent 认证 Token
```

### B. 端口使用说明

| 端口 | 用途                    | 模式 |
| ---- | ----------------------- | ---- |
| 9030 | StarRocks FE 查询端口   | 所有 |
| 3000 | MCP HTTP 服务器（默认） | 2, 3 |
| 8080 | Local Agent（默认）     | 3    |

### C. 文件结构说明

```
mcp-example/
├── index-expert-enhanced.js       # 模式 1 入口（Stdio）
├── index-expert-http.js           # 模式 2 入口（HTTP 直连）
├── index-expert-http-remote.js    # 模式 3 入口（远程架构）
├── local-agent.js                 # 模式 3 本地代理
├── experts/                       # 专家系统实现
│   ├── expert-coordinator.js      # 专家协调器
│   ├── storage-expert-integrated.js    # 存储专家
│   ├── compaction-expert-integrated.js # Compaction 专家
│   ├── import-expert-integrated.js     # 导入专家
│   └── ingestion-expert-integrated.js  # 摄取专家
├── package.json                   # 依赖和脚本
├── .env.example                   # 环境变量模板
├── tenants-config.example.json    # 租户配置模板（模式 3）
├── install-agent.sh               # Agent 安装脚本（模式 3）
├── start-http-server.sh           # HTTP 服务器启动脚本
├── ARCHITECTURE.md                # 架构文档
├── USER_GUIDE.md                  # 本使用指南
└── REMOTE_QUICK_START.md          # 快速开始指南
```

### D. 常用命令速查

```bash
# ========== 安装 ==========
npm install                    # 安装依赖

# ========== 启动服务 ==========
npm start                      # 模式 1 (Stdio)
npm run start:http             # 模式 2 (HTTP 直连)
npm run start:http-remote      # 模式 3 中心服务器
npm run start:agent            # 模式 3 本地 Agent

# ========== 开发模式（自动重启）==========
npm run dev                    # 模式 2 开发
npm run dev:remote             # 模式 3 中心服务器开发
npm run dev:agent              # 模式 3 Agent 开发

# ========== PM2 管理 ==========
pm2 start index-expert-http.js --name mcp
pm2 logs mcp                   # 查看日志
pm2 restart mcp                # 重启
pm2 stop mcp                   # 停止
pm2 delete mcp                 # 删除

# ========== Agent 管理（模式 3）==========
~/.starrocks-agent/start.sh    # 启动 Agent
~/.starrocks-agent/stop.sh     # 停止 Agent
~/.starrocks-agent/status.sh   # 查看状态
~/.starrocks-agent/logs.sh     # 查看日志

# ========== 测试 ==========
curl http://localhost:3000/health            # 健康检查
curl http://localhost:8080/test-connection   # Agent 数据库测试
```

---

**版本**: 2.0.0
**最后更新**: 2025-01-15
**维护者**: StarRocks MCP Team
