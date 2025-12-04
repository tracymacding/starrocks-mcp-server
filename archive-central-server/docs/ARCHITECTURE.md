# StarRocks MCP 专家系统架构文档

## 📖 目录

- [概述](#概述)
- [模式 1: 本地 Stdio 模式](#模式-1-本地-stdio-模式)
- [模式 2: HTTP/SSE 直连模式](#模式-2-httpsse-直连模式)
- [模式 3: 远程架构模式](#模式-3-远程架构模式)
- [数据流分析](#数据流分析)
- [安全性设计](#安全性设计)
- [性能对比](#性能对比)
- [模式选择指南](#模式选择指南)

---

## 概述

StarRocks MCP 专家系统提供三种部署架构，满足从个人开发到企业级 SaaS 的不同需求。

### 三种模式总览

| 维度           | 模式 1<br>(Stdio) | 模式 2<br>(HTTP 直连) | 模式 3<br>(Remote Agent) |
| -------------- | ----------------- | --------------------- | ------------------------ |
| **连接方式**   | 标准输入输出      | HTTP/SSE              | HTTP/SSE + Agent         |
| **数据库访问** | 本地直连          | 服务器直连            | Agent 代理访问           |
| **部署复杂度** | ⭐ 简单           | ⭐⭐ 中等             | ⭐⭐⭐ 复杂              |
| **升级维护**   | 用户手动          | 用户手动              | ✅ 零维护                |
| **多租户**     | ❌ 不支持         | ❌ 不支持             | ✅ 支持                  |
| **网络隔离**   | ✅ 本地           | ❌ 需要可达           | ✅ Agent 在内网          |
| **典型延迟**   | ~10ms             | ~50-100ms             | ~100-200ms               |

---

## 模式 1: 本地 Stdio 模式

### 架构概览

```
┌─────────────────────────────────────────┐
│           用户本地机器                    │
│                                         │
│  ┌──────────────┐                      │
│  │  Gemini CLI  │                      │
│  └──────┬───────┘                      │
│         │ stdio (标准输入输出)           │
│         ↓                              │
│  ┌──────────────────────┐              │
│  │   MCP Server         │              │
│  │ (本地进程)            │              │
│  │                      │              │
│  │ - 专家系统逻辑        │              │
│  │ - SQL 查询           │              │
│  │ - 诊断算法           │              │
│  └──────┬───────────────┘              │
│         │ MySQL Protocol               │
│         ↓                              │
│  ┌──────────────────────┐              │
│  │   StarRocks DB       │              │
│  │ (本地/内网)           │              │
│  └──────────────────────┘              │
└─────────────────────────────────────────┘
```

### 工作原理

#### 1. 进程启动

```bash
# Gemini CLI 配置
{
  "mcpServers": {
    "starrocks-local": {
      "command": "node",
      "args": ["index-expert-enhanced.js"],
      "cwd": "/path/to/mcp-example"
    }
  }
}
```

**启动流程**：

1. Gemini CLI 通过 `child_process.spawn()` 启动 MCP Server 进程
2. MCP Server 读取 `.env` 文件获取数据库配置
3. 建立 stdio 通信通道

#### 2. 通信协议

使用 **Model Context Protocol (MCP)** over **stdio**：

```
Gemini CLI → MCP Server: {"jsonrpc":"2.0","method":"tools/list","id":1}
MCP Server → Gemini CLI: {"jsonrpc":"2.0","result":{"tools":[...]}}

Gemini CLI → MCP Server: {"jsonrpc":"2.0","method":"tools/call","params":{"name":"analyze_storage_health"}}
MCP Server → Gemini CLI: {"jsonrpc":"2.0","result":{...}}
```

**消息流转**：

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Gemini   │       │   MCP    │       │StarRocks │
│   CLI    │       │  Server  │       │    DB    │
└────┬─────┘       └────┬─────┘       └────┬─────┘
     │                  │                  │
     │ tools/list       │                  │
     │─────────────────→│                  │
     │                  │                  │
     │ tools: [...]     │                  │
     │←─────────────────│                  │
     │                  │                  │
     │ tools/call:      │                  │
     │ analyze_storage  │                  │
     │─────────────────→│                  │
     │                  │ SQL: SHOW PROC   │
     │                  │ "/backends"      │
     │                  │─────────────────→│
     │                  │                  │
     │                  │ rows: [...]      │
     │                  │←─────────────────│
     │                  │                  │
     │                  │ 分析计算...       │
     │                  │                  │
     │ result: {...}    │                  │
     │←─────────────────│                  │
```

#### 3. 数据库连接

```javascript
// index-expert-enhanced.js
async createConnection() {
  return await mysql.createConnection({
    host: process.env.SR_HOST,
    user: process.env.SR_USER,
    password: process.env.SR_PASSWORD,
    port: process.env.SR_PORT || 9030,
  });
}

// 使用方式
const connection = await this.createConnection();
const [rows] = await connection.query('SHOW PROC "/backends"');
await connection.end();
```

**连接生命周期**：

- 每次工具调用创建新连接
- 执行完毕立即关闭
- 无连接池（简单场景足够）

### 优点

1. **延迟最低**：本地进程通信，无网络开销
2. **安全性高**：完全本地，无网络暴露
3. **部署简单**：配置 `.env` 即可运行
4. **调试方便**：可以直接打印日志到 stderr

### 缺点

1. **单机限制**：只能在本地使用
2. **无法共享**：团队成员需要各自部署
3. **升级麻烦**：每个用户需要手动更新代码

### 适用场景

- ✅ 个人开发和测试
- ✅ 本地快速诊断
- ✅ 对安全性要求极高的场景
- ✅ 无网络环境

---

## 模式 2: HTTP/SSE 直连模式

### 架构概览

```
┌─────────────────────┐           ┌──────────────────────────┐
│   用户客户端         │           │      服务器              │
│                     │           │                          │
│  ┌──────────────┐   │           │  ┌──────────────────┐   │
│  │  Gemini CLI  │   │           │  │  MCP Server      │   │
│  └──────┬───────┘   │           │  │  (HTTP/SSE)      │   │
│         │           │           │  │                  │   │
│         │ HTTP/SSE  │           │  │ - 专家系统逻辑    │   │
│         │ (TLS)     │           │  │ - SQL 查询       │   │
│         └───────────┼───────────┼→ │ - 诊断算法       │   │
│                     │           │  └──────┬───────────┘   │
│                     │           │         │               │
└─────────────────────┘           │         │ MySQL         │
                                  │         ↓               │
                                  │  ┌──────────────────┐   │
                                  │  │  StarRocks DB    │   │
                                  │  │ (服务器可访问)    │   │
                                  │  └──────────────────┘   │
                                  └──────────────────────────┘
```

### 工作原理

#### 1. 服务器启动

```javascript
// index-expert-http.js
class StarRocksMcpHttpServer {
  constructor() {
    this.port = process.env.PORT || 3000;
    this.apiKey = process.env.API_KEY;
    this.app = express();

    this.setupMiddleware(); // CORS, Auth, Logging
    this.setupRoutes(); // /sse, /messages, /health

    this.expertCoordinator = new StarRocksExpertCoordinator();
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`MCP Server running on port ${this.port}`);
    });
  }
}
```

#### 2. SSE 连接建立

**Server-Sent Events (SSE)** 是一种服务器到客户端的单向推送协议：

```
┌──────────┐                    ┌──────────┐
│ Gemini   │                    │   MCP    │
│   CLI    │                    │  Server  │
└────┬─────┘                    └────┬─────┘
     │                              │
     │ GET /sse                     │
     │ Headers:                     │
     │   X-API-Key: xxx             │
     │─────────────────────────────→│
     │                              │
     │ 200 OK                       │
     │ Content-Type:                │
     │   text/event-stream          │
     │←─────────────────────────────│
     │                              │
     │ (SSE 连接保持打开)            │
     ├──────────────────────────────┤
     │                              │
     │ data: {"method":"endpoint"}  │
     │←─────────────────────────────│
     │                              │
```

**SSE 特点**：

- 长连接，服务器可以随时推送
- 自动重连机制
- 基于 HTTP，防火墙友好

#### 3. 消息处理机制

```javascript
// 1. SSE 端点：建立长连接
app.get('/sse', async (req, res) => {
  const sessionId = `session_${Date.now()}`;
  const messagesPath = `/messages/${sessionId}`;

  // 创建 SSE transport
  const transport = new SSEServerTransport(messagesPath, res);

  // 创建 MCP server 实例
  const server = new Server(/*...*/);
  await server.connect(transport);

  // 动态注册消息端点
  app.post(messagesPath, async (req, res) => {
    await transport.handlePostMessage(req, res, req.body);
  });
});

// 2. 消息端点：处理客户端请求
// POST /messages/{sessionId}
// Body: {"jsonrpc":"2.0","method":"tools/call",...}
```

**完整交互流程**：

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│ Gemini   │       │   MCP    │       │StarRocks │
│   CLI    │       │  Server  │       │    DB    │
└────┬─────┘       └────┬─────┘       └────┬─────┘
     │                  │                  │
     │ ① GET /sse       │                  │
     │─────────────────→│                  │
     │                  │                  │
     │ ② SSE Connected  │                  │
     │ endpoint: /msg/1 │                  │
     │←─────────────────│                  │
     │                  │                  │
     │ ③ POST /msg/1    │                  │
     │ tools/call       │                  │
     │─────────────────→│                  │
     │                  │                  │
     │                  │ ④ SQL Query      │
     │                  │─────────────────→│
     │                  │                  │
     │                  │ ⑤ Result         │
     │                  │←─────────────────│
     │                  │                  │
     │                  │ ⑥ 诊断分析        │
     │                  │                  │
     │ ⑦ Response       │                  │
     │←─────────────────│                  │
```

#### 4. 认证机制

```javascript
// API Key 认证中间件
app.use((req, res, next) => {
  // 跳过公开端点
  if (req.path === '/health') return next();

  const apiKey =
    req.headers['x-api-key'] ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
});
```

#### 5. 数据库连接管理

```javascript
// 每次请求创建连接
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const connection = await this.createConnection();

  try {
    const result = await this.expertCoordinator.callToolHandler(name, args, {
      connection,
    });
    return result;
  } finally {
    await connection.end(); // 确保连接关闭
  }
});
```

**连接策略**：

- 请求级连接：每个请求创建新连接
- 自动清理：finally 块确保连接关闭
- 可扩展：可升级为连接池

### 优点

1. **远程访问**：团队成员可以通过网络访问
2. **统一部署**：一次部署，多人使用
3. **易于监控**：集中式日志和监控
4. **防火墙友好**：基于 HTTP/HTTPS

### 缺点

1. **网络限制**：需要服务器能访问数据库
2. **单点故障**：服务器宕机影响所有用户
3. **升级影响**：升级需要通知所有用户

### 适用场景

- ✅ 团队内部共享（5-20 人）
- ✅ 数据库在公网或 VPN 可达
- ✅ 需要集中管理和监控
- ✅ 对延迟要求不高（< 200ms）

---

## 模式 3: 远程架构模式

### 架构概览

```
┌───────────────────────────────┐        ┌────────────────────────────┐
│        用户内网 (租户 A)        │        │      中心服务器 (你维护)     │
│                               │        │                            │
│  ┌──────────────┐             │        │  ┌────────────────────┐   │
│  │  Gemini CLI  │             │        │  │   MCP Server       │   │
│  └──────┬───────┘             │        │  │   (Remote)         │   │
│         │                     │        │  │                    │   │
│         │ ① HTTP/SSE          │        │  │ - 租户管理          │   │
│         │ (X-Tenant-ID: A)    │        │  │ - SQL 逻辑          │   │
│         └─────────────────────┼────────┼→ │ - 诊断算法          │   │
│                               │        │  └────────┬───────────┘   │
│  ┌──────────────────────┐     │        │           │               │
│  │   Local Agent        │     │        │           │ ② HTTP        │
│  │   (SQL 执行器)        │     │  ←─────┼───────────┘               │
│  │                      │     │        │   (请求执行 SQL)           │
│  │ - Token 认证          │     │        │                            │
│  │ - 只执行 SELECT       │     │        └────────────────────────────┘
│  │ - 无业务逻辑          │     │
│  └──────┬───────────────┘     │
│         │ ③ MySQL             │
│         ↓                     │
│  ┌──────────────────────┐     │
│  │   StarRocks DB       │     │
│  │ (内网，防火墙保护)     │     │
│  └──────────────────────┘     │
└───────────────────────────────┘

┌───────────────────────────────┐
│        用户内网 (租户 B)        │
│                               │
│  同样的架构...                 │
│                               │
└───────────────────────────────┘
```

### 工作原理

#### 1. Local Agent 设计

**核心理念**：极致轻量，只负责 SQL 执行，零业务逻辑。

```javascript
// local-agent.js
class LocalAgent {
  constructor() {
    this.port = process.env.AGENT_PORT || 8080;
    this.agentToken = process.env.AGENT_TOKEN;
    this.dbConfig = {
      /* 本地数据库配置 */
    };
  }

  setupRoutes() {
    // ① 健康检查（无需认证）
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy' });
    });

    // ② SQL 执行端点（需要 Token）
    app.post('/execute-sql', async (req, res) => {
      // Token 验证
      if (req.headers['x-agent-token'] !== this.agentToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { sql } = req.body;

      // 安全检查：只允许 SELECT
      if (
        !sql.toUpperCase().startsWith('SELECT') &&
        !sql.toUpperCase().startsWith('SHOW')
      ) {
        return res.status(403).json({
          error: 'Only SELECT queries allowed',
        });
      }

      // 执行 SQL
      const connection = await mysql.createConnection(this.dbConfig);
      const [rows] = await connection.query(sql);
      await connection.end();

      res.json({ success: true, data: rows });
    });
  }
}
```

**Agent 特点**：

- 📦 **超轻量**：~300 行代码，10MB 内存
- 🔒 **只读**：禁止 DELETE/UPDATE/DROP
- 🎯 **单一职责**：只执行 SQL，不做诊断
- 🔐 **Token 认证**：防止未授权访问
- 🚀 **几乎不需要更新**：逻辑极简

#### 2. 中心 MCP Server 设计

```javascript
// index-expert-http-remote.js
class StarRocksMcpHttpServerRemote {
  constructor() {
    // 加载租户配置
    this.tenants = loadTenantsConfig();
    // {
    //   "tenant_a": {
    //     "agent_url": "http://agent-a.com:8080",
    //     "agent_token": "secret-token-a"
    //   },
    //   "tenant_b": { ... }
    // }
  }

  setupMiddleware() {
    // ① API Key 认证
    app.use((req, res, next) => {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });

    // ② Tenant ID 验证
    app.use((req, res, next) => {
      const tenantId = req.headers['x-tenant-id'];
      if (!this.tenants[tenantId]) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      req.tenant = this.tenants[tenantId];
      next();
    });
  }

  setupServerHandlers(server, tenant) {
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // 创建远程连接包装器
      const connection = new RemoteConnectionWrapper(
        tenant.agent_url,
        tenant.agent_token,
      );

      // 执行工具（SQL 逻辑在这里！）
      const result = await this.expertCoordinator.callToolHandler(name, args, {
        connection,
      });

      return result;
    });
  }
}
```

#### 3. 远程连接包装器

**核心设计**：模拟 mysql2 的 connection 接口，实际通过 HTTP 调用 Agent。

```javascript
// RemoteConnectionWrapper.js
class RemoteConnectionWrapper {
  constructor(agentUrl, agentToken) {
    this.agentUrl = agentUrl;
    this.agentToken = agentToken;
  }

  // 模拟 mysql2 的 query 方法
  async query(sql, parameters) {
    // 通过 HTTP 调用远程 Agent
    const response = await fetch(`${this.agentUrl}/execute-sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': this.agentToken,
      },
      body: JSON.stringify({ sql, parameters }),
    });

    const result = await response.json();

    // 返回 [rows, fields] 格式，兼容 mysql2
    return [result.data, result.metadata?.fields || []];
  }

  async end() {
    // 远程连接无需关闭，空操作
    return Promise.resolve();
  }
}
```

**兼容性设计**：

- ✅ 完全兼容 mysql2 接口
- ✅ 现有专家代码无需修改
- ✅ 透明的远程化

#### 4. 完整数据流

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Gemini   │   │   MCP    │   │  Local   │   │StarRocks │
│   CLI    │   │  Server  │   │  Agent   │   │    DB    │
│(租户A端)  │   │(中心服务) │   │(租户A内网)│   │(租户A)   │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │
     │ ① GET /sse   │              │              │
     │ X-Tenant-ID:A│              │              │
     │─────────────→│              │              │
     │              │              │              │
     │ ② Connected  │              │              │
     │←─────────────│              │              │
     │              │              │              │
     │ ③ POST /msg  │              │              │
     │ tools/call   │              │              │
     │─────────────→│              │              │
     │              │              │              │
     │              │ ④ POST       │              │
     │              │ /execute-sql │              │
     │              │ (Token + SQL)│              │
     │              │─────────────→│              │
     │              │              │              │
     │              │              │ ⑤ SQL Query  │
     │              │              │─────────────→│
     │              │              │              │
     │              │              │ ⑥ Result     │
     │              │              │←─────────────│
     │              │              │              │
     │              │ ⑦ Result     │              │
     │              │←─────────────│              │
     │              │              │              │
     │              │ ⑧ 诊断分析    │              │
     │              │ (在服务器端)  │              │
     │              │              │              │
     │ ⑨ Response   │              │              │
     │←─────────────│              │              │
```

**关键点**：

- SQL 查询逻辑在 ④：中心服务器决定查什么
- SQL 执行在 ⑤：Agent 只负责执行
- 诊断分析在 ⑧：中心服务器完成所有分析

#### 5. 租户配置管理

```json
// tenants-config.json
{
  "tenants": {
    "company_a": {
      "name": "Company A",
      "agent_url": "https://agent.company-a.com:8080",
      "agent_token": "secret-token-a",
      "enabled": true,
      "created_at": "2025-01-15T00:00:00Z",
      "metadata": {
        "contact": "admin@company-a.com",
        "subscription": "premium"
      }
    },
    "company_b": {
      "name": "Company B",
      "agent_url": "https://agent.company-b.com:8080",
      "agent_token": "secret-token-b",
      "enabled": true,
      "created_at": "2025-01-16T00:00:00Z"
    }
  }
}
```

**配置热加载**（可选）：

```javascript
// 监听配置文件变化
fs.watch(tenantsConfigPath, (eventType) => {
  if (eventType === 'change') {
    this.reloadTenantsConfig();
    console.log('Tenants config reloaded');
  }
});
```

### 优点

1. **零维护升级**：
   - 你更新中心服务器代码
   - 所有租户立即享受新功能
   - 无需通知用户

2. **网络隔离友好**：
   - Agent 在用户内网
   - 数据库不出防火墙
   - 安全合规

3. **多租户支持**：
   - 一个服务器服务多个客户
   - 租户间完全隔离
   - 易于计费和管理

4. **代码保护**：
   - 核心算法在服务器
   - 用户看不到诊断逻辑
   - 知识产权保护

### 缺点

1. **架构复杂**：需要部署两个组件
2. **延迟略高**：多一次网络跳转（~100ms）
3. **调试复杂**：需要查看两端日志

### 适用场景

- ⭐ **SaaS 产品**：多客户订阅服务
- ⭐ **企业级部署**：客户数据库在内网
- ⭐ **频繁升级**：需要快速迭代功能
- ⭐ **知识产权保护**：核心算法不能暴露

---

## 数据流分析

### SQL 查询在哪里定义？

| 模式   | SQL 位置        | 修改需要         | 影响范围        |
| ------ | --------------- | ---------------- | --------------- |
| 模式 1 | 本地 MCP Server | 用户更新代码     | 单用户          |
| 模式 2 | HTTP MCP Server | 用户更新服务器   | 所有连接用户    |
| 模式 3 | 中心 MCP Server | **你更新服务器** | **所有租户** ✅ |

### 示例：添加新查询

假设要添加查询 "最近 24 小时的慢查询"：

**模式 1/2**（用户维护）：

```javascript
// 用户需要修改本地代码
async getSlowQueries(connection) {
  const [rows] = await connection.query(`
    SELECT * FROM information_schema.slow_query_log
    WHERE start_time >= NOW() - INTERVAL 24 HOUR
  `);
  return rows;
}
```

**模式 3**（你维护）：

```javascript
// 你在中心服务器修改
async getSlowQueries(connection) {
  // connection 是 RemoteConnectionWrapper
  // 实际会调用 Agent 执行 SQL
  const [rows] = await connection.query(`
    SELECT * FROM information_schema.slow_query_log
    WHERE start_time >= NOW() - INTERVAL 24 HOUR
  `);
  return rows;
}

// 部署到中心服务器 → 所有租户立即可用 ✅
```

### 诊断算法在哪里执行？

| 模式     | 算法位置   | 修改需要   |
| -------- | ---------- | ---------- |
| 所有模式 | MCP Server | 服务器代码 |

**关键区别**：

- 模式 1/2：MCP Server 在用户侧
- 模式 3：MCP Server 在你的服务器

### 数据传输量对比

假设查询返回 1000 行 × 10 列 = 10KB 数据：

**模式 1**：

```
DB → MCP Server: 10KB (本地，忽略不计)
MCP Server → Gemini: 10KB + 50KB 分析结果 (stdio)
```

**模式 2**：

```
DB → MCP Server: 10KB (本地网络，~1ms)
MCP Server → Gemini: 60KB (HTTP，~50ms)
```

**模式 3**：

```
DB → Agent: 10KB (本地网络，~1ms)
Agent → MCP Server: 10KB (互联网，~50ms)
MCP Server → Gemini: 60KB (互联网，~50ms)
总延迟: ~100ms
```

---

## 安全性设计

### 模式 1: 本地安全

**威胁模型**：

- ❌ 网络攻击：不存在（无网络暴露）
- ⚠️ 本地权限：依赖操作系统

**防护措施**：

```bash
# 限制文件权限
chmod 600 .env

# 使用只读数据库用户
CREATE USER 'mcp_readonly'@'localhost' IDENTIFIED BY 'password';
GRANT SELECT ON *.* TO 'mcp_readonly'@'localhost';
```

### 模式 2: HTTP 安全

**威胁模型**：

- ⚠️ 中间人攻击
- ⚠️ API Key 泄露
- ⚠️ DDoS 攻击

**防护措施**：

1. **HTTPS 加密**：

```nginx
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

2. **API Key 轮换**：

```javascript
// 定期轮换 API Key
const apiKeys = [
  { key: 'current-key', expires: '2025-02-01' },
  { key: 'new-key', expires: '2025-03-01' },
];

function validateApiKey(key) {
  return apiKeys.some((k) => k.key === key && new Date(k.expires) > new Date());
}
```

3. **Rate Limiting**：

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 限制 100 个请求
});

app.use(limiter);
```

### 模式 3: 多层安全

**威胁模型**：

- ⚠️ Agent Token 泄露
- ⚠️ 租户间数据泄露
- ⚠️ SQL 注入（Agent 端）

**防护措施**：

1. **双重认证**：

```
Gemini CLI → MCP Server: API Key 认证
MCP Server → Agent: Agent Token 认证
```

2. **租户隔离**：

```javascript
// 严格的租户验证
app.use((req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];

  // 验证租户存在
  if (!tenants[tenantId]) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  // 验证租户启用
  if (!tenants[tenantId].enabled) {
    return res.status(403).json({ error: 'Tenant disabled' });
  }

  req.tenant = tenants[tenantId];
  next();
});
```

3. **SQL 注入防护**（Agent）：

```javascript
// Agent 端严格检查
app.post('/execute-sql', (req, res) => {
  const { sql } = req.body;

  // 白名单检查
  const allowedPatterns = [/^SELECT\s+/i, /^SHOW\s+/i, /^DESCRIBE\s+/i];

  if (!allowedPatterns.some((p) => p.test(sql))) {
    return res.status(403).json({
      error: 'Query type not allowed',
    });
  }

  // 黑名单检查
  const dangerousKeywords = [
    'DROP',
    'DELETE',
    'UPDATE',
    'INSERT',
    'CREATE',
    'ALTER',
    'TRUNCATE',
    'GRANT',
  ];

  const sqlUpper = sql.toUpperCase();
  if (dangerousKeywords.some((k) => sqlUpper.includes(k))) {
    return res.status(403).json({
      error: 'Dangerous keyword detected',
    });
  }

  // 执行查询...
});
```

4. **Token 加密存储**：

```javascript
// 使用环境变量 + 加密存储
import { encrypt, decrypt } from './crypto';

// 存储时加密
const encryptedToken = encrypt(agentToken, process.env.ENCRYPTION_KEY);

// 使用时解密
const agentToken = decrypt(encryptedToken, process.env.ENCRYPTION_KEY);
```

---

## 性能对比

### 延迟分析

| 操作     | 模式 1 | 模式 2 | 模式 3 |
| -------- | ------ | ------ | ------ |
| 建立连接 | ~5ms   | ~50ms  | ~100ms |
| 简单查询 | ~10ms  | ~60ms  | ~120ms |
| 复杂分析 | ~100ms | ~150ms | ~200ms |
| 批量查询 | ~500ms | ~600ms | ~700ms |

**延迟组成**（模式 3）：

```
总延迟 = 网络延迟(CLI→Server) +
        网络延迟(Server→Agent) +
        SQL执行时间 +
        网络延迟(Agent→Server) +
        诊断计算时间 +
        网络延迟(Server→CLI)

示例：50ms + 50ms + 10ms + 50ms + 30ms + 50ms = 240ms
```

### 并发性能

**模式 1**：

- 单进程，单线程（Node.js）
- 并发能力：~100 请求/秒（本地够用）

**模式 2**：

```javascript
// 使用 PM2 cluster 模式
pm2 start index-expert-http.js -i 4  // 4 个进程

// 性能：~1000 请求/秒
```

**模式 3**：

```javascript
// 中心服务器 cluster + Agent 分布式
// 中心服务器: 4 核 × 1000 = 4000 请求/秒
// Agent 瓶颈: 取决于各租户 Agent 性能

// 实际性能：受 Agent 限制，但租户间隔离
```

### 资源消耗

| 组件                | CPU  | 内存   | 网络     |
| ------------------- | ---- | ------ | -------- |
| MCP Server (模式 1) | ~5%  | ~50MB  | 0        |
| MCP Server (模式 2) | ~10% | ~100MB | ~1Mbps   |
| MCP Server (模式 3) | ~15% | ~200MB | ~2Mbps   |
| Local Agent         | ~2%  | ~10MB  | ~0.5Mbps |

---

## 模式选择指南

### 决策树

```
开始: 需要部署 MCP 服务
    |
    v
[问] 是否需要多人使用？
    |
    +-- 否 --> 使用模式 1 (Stdio)
    |          ✅ 最简单，本地使用
    |
    +-- 是 --> [问] 用户数量？
                |
                +-- < 10人 --> [问] 数据库可直连？
                |              |
                |              +-- 是 --> 使用模式 2 (HTTP 直连)
                |              |          ✅ 简单共享
                |              |
                |              +-- 否 --> 使用模式 3 (Remote Agent)
                |                        ✅ 网络隔离友好
                |
                +-- >= 10人 --> [问] 是否需要频繁升级？
                                |
                                +-- 是 --> 使用模式 3 (Remote Agent)
                                |          ✅ 零维护升级
                                |
                                +-- 否 --> [问] 数据库可直连？
                                           |
                                           +-- 是 --> 使用模式 2
                                           +-- 否 --> 使用模式 3
```

### 场景推荐

#### 场景 1: 个人开发者

- **推荐**：模式 1
- **理由**：最简单，延迟最低
- **部署**：配置 `.env` 即可

#### 场景 2: 小型团队（5-10 人）

- **推荐**：模式 2
- **理由**：共享方便，部署简单
- **部署**：内网服务器 + Nginx

#### 场景 3: 大型企业（内网数据库）

- **推荐**：模式 3
- **理由**：网络隔离，安全合规
- **部署**：每个部门一个 Agent

#### 场景 4: SaaS 产品

- **推荐**：模式 3
- **理由**：多租户，零维护升级
- **部署**：中心服务器 + 客户 Agent

#### 场景 5: 咨询服务

- **推荐**：模式 1 或模式 3
- **理由**：
  - 模式 1：临时诊断
  - 模式 3：持续服务

---

## 总结

### 核心差异

| 维度         | 关键点                    |
| ------------ | ------------------------- |
| **通信方式** | Stdio → HTTP → HTTP+Agent |
| **部署位置** | 本地 → 服务器 → 分布式    |
| **维护成本** | 高 → 中 → 低（零维护）    |
| **适用规模** | 1人 → 10人 → 无限         |

### 演进路径

```
个人使用        团队共享        企业/SaaS
   ↓               ↓               ↓
模式 1  ──升级──→ 模式 2  ──升级──→ 模式 3
(Stdio)         (HTTP)       (Remote Agent)
```

### 技术栈总结

| 技术         | 模式 1 | 模式 2 | 模式 3 |
| ------------ | ------ | ------ | ------ |
| MCP SDK      | ✅     | ✅     | ✅     |
| Express      | ❌     | ✅     | ✅     |
| SSE          | ❌     | ✅     | ✅     |
| Multi-tenant | ❌     | ❌     | ✅     |
| Agent        | ❌     | ❌     | ✅     |

---

## 附录

### 相关文档

- [QUICK_START.md](./QUICK_START.md) - 快速开始指南
- [HTTP_SERVER_README.md](./HTTP_SERVER_README.md) - HTTP 服务器文档
- [REMOTE_ARCHITECTURE.md](./REMOTE_ARCHITECTURE.md) - 远程架构详细指南
- [REMOTE_QUICK_START.md](./REMOTE_QUICK_START.md) - 远程架构快速开始

### 术语表

| 术语                        | 解释                                 |
| --------------------------- | ------------------------------------ |
| **MCP**                     | Model Context Protocol，LLM 交互协议 |
| **SSE**                     | Server-Sent Events，服务器推送协议   |
| **stdio**                   | Standard Input/Output，标准输入输出  |
| **Agent**                   | 本地代理，轻量级 SQL 执行器          |
| **Tenant**                  | 租户，多租户架构中的独立用户单元     |
| **RemoteConnectionWrapper** | 远程连接包装器，模拟 mysql2 接口     |

### 版本历史

| 版本  | 日期       | 变更                         |
| ----- | ---------- | ---------------------------- |
| 1.0.0 | 2025-01-15 | 初始版本（模式 1）           |
| 2.0.0 | 2025-01-15 | 添加 HTTP/SSE 支持（模式 2） |
| 3.0.0 | 2025-01-15 | 添加远程架构支持（模式 3）   |

---

**文档维护**：请在修改架构时同步更新本文档。

**反馈**：如有问题或建议，请提交 Issue。
