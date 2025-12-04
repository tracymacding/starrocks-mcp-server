# 方案 C 使用指南：本地 Stdio MCP + 中心 API

## 架构概览

```
┌─────────────┐  Stdio   ┌──────────────────┐  HTTPS   ┌──────────────┐
│ Gemini CLI  │◄────────►│ Local Thin MCP   │─────────►│ 中心API服务器 │
│ (客户本地)   │          │     Server       │          │  (你维护)    │
└─────────────┘          └────────┬─────────┘          └──────────────┘
                                  │                            │
                                  │ 执行SQL                     │ 返回SQL+分析
                                  ↓                            │
                         ┌─────────────┐                       │
                         │  StarRocks  │                       │
                         │  (客户内网)  │                       │
                         └─────────────┘                       │
                                                               │
                                          提供SQL定义和分析逻辑 ◄┘
```

## 核心优势

### ✅ 1. 零网络配置（客户侧）

- 无需暴露任何端口
- 无需防火墙规则
- 无需 VPN/内网穿透
- 只需要能访问公网 HTTPS API

### ✅ 2. 真正的零维护升级

- SQL 逻辑在中心 API（你维护）
- 升级 API → 所有客户自动生效
- 客户端 Thin MCP Server 基本不需要升级

### ✅ 3. 数据隐私最佳

- 数据库密码只在客户本地
- SQL 在客户本地执行
- 只发送查询结果给 API（用于分析）

### ✅ 4. 完全符合 MCP 标准

- 使用 Gemini CLI 原生 Stdio 传输
- 标准 MCP 协议
- 可被任何 MCP 客户端使用

---

## 部署指南

### 阶段 1：服务端部署（你维护）

#### 1.1 启动中心 REST API

```bash
cd mcp-example

# 配置环境变量
cat > .env <<EOF
API_PORT=80
API_KEY=your-secure-api-key-change-me
EOF

# 启动 API 服务器
npm run start:api

# 或使用 PM2 进程管理
pm2 start index-expert-api.js --name starrocks-api
```

**验证 API 运行**：

```bash
# 健康检查
curl http://localhost:80/health

# 列出可用工具
curl http://localhost:80/api/tools \
  -H "X-API-Key: your-secure-api-key-change-me"

# 获取某个工具的 SQL
curl http://localhost:80/api/queries/analyze_storage_health \
  -H "X-API-Key: your-secure-api-key-change-me"
```

**预期响应**：

```json
{
  "tool": "analyze_storage_health",
  "queries": [
    {
      "id": "backends",
      "sql": "SHOW BACKENDS;",
      "description": "BE节点存储信息"
    },
    ...
  ],
  "analysis_endpoint": "/api/analyze/analyze_storage_health"
}
```

#### 1.2 配置生产环境（推荐）

**使用 PM2 进行进程管理**：

```bash
# 创建 PM2 配置文件
cat > ecosystem-api.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'starrocks-api',
    script: './index-expert-api.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      API_PORT: 80,
      API_KEY: process.env.API_KEY || 'your-secure-api-key'
    },
    error_file: './logs/api-err.log',
    out_file: './logs/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
EOF

# 启动
pm2 start ecosystem-api.config.js
pm2 save
pm2 startup
```

**使用 Nginx 反向代理**：

```nginx
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 1.3 监控和日志

```bash
# PM2 日志
pm2 logs starrocks-api

# 监控状态
pm2 monit

# 查看统计
pm2 describe starrocks-api
```

---

### 阶段 2：客户端部署（客户操作）

#### 2.1 一键安装

**下载并运行安装脚本**：

```bash
# 方式 1：从你的服务器下载
curl -O https://api.your-domain.com/install-starrocks-mcp.sh
chmod +x install-starrocks-mcp.sh
./install-starrocks-mcp.sh

# 方式 2：如果客户有 Git 仓库访问权限
git clone https://github.com/your-repo/starrocks-mcp.git
cd starrocks-mcp/mcp-example
./install-starrocks-mcp.sh
```

**安装脚本会**：

- ✅ 检查 Node.js 版本（>= 18）
- ✅ 安装到 `~/.starrocks-mcp/`
- ✅ 安装必要的依赖包
- ✅ 创建配置文件模板
- ✅ 提供 Gemini CLI 配置示例

#### 2.2 配置数据库连接

编辑 `~/.starrocks-mcp/.env`：

```bash
nano ~/.starrocks-mcp/.env
```

修改以下配置：

```bash
# StarRocks 数据库配置（客户本地数据库）
SR_HOST=192.168.1.100      # 修改为实际数据库地址
SR_USER=root                # 修改为实际用户
SR_PASSWORD=actual_password # 修改为实际密码
SR_PORT=9030

# 中心 API 配置
CENTRAL_API=https://api.your-domain.com  # 修改为实际 API 地址
CENTRAL_API_TOKEN=client-token-xxx       # 如果需要认证
```

#### 2.3 配置 Gemini CLI

编辑 `~/.gemini/settings.json`：

```bash
nano ~/.gemini/settings.json
```

添加 MCP 服务器配置（参考 `~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json`）：

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["/home/your-username/.starrocks-mcp/thin-mcp-server.js"],
      "env": {
        "SR_HOST": "192.168.1.100",
        "SR_USER": "root",
        "SR_PASSWORD": "actual_password",
        "SR_PORT": "9030",
        "CENTRAL_API": "https://api.your-domain.com",
        "CENTRAL_API_TOKEN": "client-token-xxx"
      }
    }
  }
}
```

**注意**：

- 路径必须是绝对路径
- 可以直接在 `env` 中配置，或者依赖 `.env` 文件

#### 2.4 测试安装

**启动 Gemini CLI**：

```bash
gemini
```

**列出可用工具**：

```
/mcp-list-tools
```

**预期输出**：

```
Available MCP Tools from starrocks-expert:
  1. analyze_storage_health - 全面分析存储健康状况
  2. analyze_compaction_health - 分析 Compaction 健康状况
  3. analyze_ingestion_health - 分析数据摄取健康状况
```

**尝试诊断命令**：

```
请帮我分析 StarRocks 的存储健康状况
```

**预期行为**：

1. Gemini 调用 `analyze_storage_health` 工具
2. 本地 Thin MCP Server 从中心 API 获取 SQL 查询
3. 在本地执行 SQL
4. 将结果发送给中心 API 分析
5. 返回诊断报告给 Gemini
6. 用户看到完整的分析结果

---

## 工作流程详解

### 完整数据流

```
1. 用户输入: "帮我分析存储健康状况"
   ↓
2. Gemini AI 决定调用 analyze_storage_health 工具
   ↓
3. Gemini CLI 通过 Stdio 调用本地 Thin MCP Server
   ↓
4. Thin MCP Server → 中心 API: GET /api/queries/analyze_storage_health
   ↓
5. 中心 API 返回 SQL 查询列表:
   {
     "queries": [
       {"id": "backends", "sql": "SHOW BACKENDS;"},
       {"id": "tablet_statistics", "sql": "SELECT ..."}
     ]
   }
   ↓
6. Thin MCP Server 连接本地 StarRocks 执行 SQL
   ↓
7. Thin MCP Server → 中心 API: POST /api/analyze/analyze_storage_health
   Body: { "results": {"backends": [...], "tablet_statistics": [...]} }
   ↓
8. 中心 API 执行分析逻辑，返回诊断报告
   ↓
9. Thin MCP Server → Gemini CLI: 返回格式化报告
   ↓
10. 用户看到分析结果
```

### 关键设计点

#### SQL 逻辑在服务端

**服务端代码**（`index-expert-api.js`）：

```javascript
getQueriesForTool(toolName) {
  if (toolName === 'analyze_storage_health') {
    return [
      { id: 'backends', sql: 'SHOW BACKENDS;' },
      { id: 'tablet_statistics', sql: 'SELECT ... FROM information_schema.backends;' },
      { id: 'partition_storage', sql: 'SELECT ... FROM information_schema.partitions_meta ...' }
    ];
  }
}
```

**客户端不需要知道 SQL 逻辑**，只负责执行。

#### 分析逻辑在服务端

**服务端代码**（`index-expert-api.js`）：

```javascript
analyzeStorageHealth(results) {
  const { backends, tablet_statistics } = results;

  const criticals = [];
  const warnings = [];

  // 分析磁盘使用
  backends.forEach(be => {
    const diskUsage = parseFloat(be.MaxDiskUsedPct?.replace('%', ''));
    if (diskUsage >= 95) {
      criticals.push({...});
    }
  });

  // 计算健康分数
  const score = 100 - criticals.length * 25 - warnings.length * 10;

  return { score, criticals, warnings, recommendations };
}
```

**客户端只发送原始数据**，不参与分析。

#### 客户端极简

**客户端代码**（`thin-mcp-server.js`）只有 ~250 行，核心逻辑：

```javascript
// 1. 获取 SQL
const queryDef = await fetch(`${CENTRAL_API}/api/queries/${toolName}`).then(
  (r) => r.json(),
);

// 2. 执行 SQL
const connection = await mysql.createConnection(dbConfig);
const results = {};
for (const query of queryDef.queries) {
  const [rows] = await connection.query(query.sql);
  results[query.id] = rows;
}

// 3. 发送分析
const analysis = await fetch(`${CENTRAL_API}/api/analyze/${toolName}`, {
  method: 'POST',
  body: JSON.stringify({ results }),
}).then((r) => r.json());

// 4. 返回报告
return { content: [{ type: 'text', text: formatReport(analysis) }] };
```

---

## 可用工具列表

### 1. analyze_storage_health

**功能**: 全面分析存储健康状况

**执行的 SQL**:

- `SHOW BACKENDS;` - BE 节点信息
- `SELECT ... FROM information_schema.backends` - Tablet 统计
- `SELECT ... FROM information_schema.partitions_meta` - 分区存储

**分析内容**:

- 磁盘使用率检查
- 错误 Tablet 检测
- 数据分布均衡性
- 健康分数计算（0-100）

**使用示例**:

```
请帮我分析 StarRocks 的存储健康状况
```

### 2. analyze_compaction_health

**功能**: 分析 Compaction 健康状况

**执行的 SQL**:

- `SHOW BACKENDS;` - BE 节点信息
- `SELECT ... FROM information_schema.partitions_meta WHERE MAX_CS >= 100` - 高 Compaction Score 分区

**分析内容**:

- 高 Compaction Score 分区识别
- Compaction 配置建议
- 健康分数计算

**使用示例**:

```
检查一下 Compaction 是否正常
```

### 3. analyze_ingestion_health

**功能**: 分析数据摄取健康状况

**执行的 SQL**:

- `SELECT ... FROM information_schema.loads WHERE CREATE_TIME >= ...` - 最近导入作业
- `SELECT ... FROM information_schema.loads WHERE STATE = 'CANCELLED'` - 失败的作业

**分析内容**:

- 导入成功率计算
- 失败作业分析
- 性能建议

**使用示例**:

```
最近的数据导入有问题吗？
```

---

## 升级和维护

### 服务端升级（你操作）

#### 添加新的 SQL 查询

**修改** `index-expert-api.js`：

```javascript
getQueriesForTool(toolName) {
  if (toolName === 'analyze_storage_health') {
    return [
      { id: 'backends', sql: 'SHOW BACKENDS;' },
      { id: 'tablet_statistics', sql: 'SELECT ...' },
      // 添加新查询
      { id: 'disk_io_metrics', sql: 'SELECT * FROM information_schema.be_metrics WHERE ...' }
    ];
  }
}
```

**更新分析逻辑**：

```javascript
analyzeStorageHealth(results) {
  const { backends, tablet_statistics, disk_io_metrics } = results;  // 使用新数据

  // 添加新的分析逻辑
  if (disk_io_metrics) {
    // 分析 IO 性能...
  }

  return analysis;
}
```

**重启服务**：

```bash
pm2 restart starrocks-api
```

**✅ 所有客户自动获得新功能**（无需任何操作）！

#### 添加新工具

**1. 在 `getAllTools()` 添加工具定义**：

```javascript
getAllTools() {
  return [
    // 现有工具...
    {
      name: 'analyze_query_performance',  // 新工具
      description: '分析查询性能问题',
      expert: 'query',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', default: 1 }
        }
      }
    }
  ];
}
```

**2. 在 `getQueriesForTool()` 添加 SQL**：

```javascript
if (toolName === 'analyze_query_performance') {
  return [
    {
      id: 'slow_queries',
      sql: 'SELECT ... FROM information_schema.queries_audit ...',
    },
  ];
}
```

**3. 在 `analyzeResults()` 添加分析**：

```javascript
if (toolName === 'analyze_query_performance') {
  return this.analyzeQueryPerformance(results);
}
```

**4. 实现分析方法**：

```javascript
analyzeQueryPerformance(results) {
  // 分析逻辑...
  return { expert: 'query', analysis: ... };
}
```

**5. 重启服务** → ✅ 客户端自动发现新工具！

### 客户端升级（极少需要）

**只有以下情况需要升级客户端**：

1. **API 接口变更**（极少发生）
   - 例如：修改了 `/api/queries` 的响应格式

2. **Thin MCP Server 本身有 bug**
   - 例如：SQL 执行逻辑有问题

3. **依赖包升级**
   - 例如：MCP SDK 有重大更新

**升级流程**：

```bash
# 客户端操作
cd ~/.starrocks-mcp
curl -O https://api.your-domain.com/thin-mcp-server.js
npm install
# 重启 Gemini CLI
```

---

## 故障排除

### 问题 1: 工具列表为空

**错误现象**：`/mcp-list-tools` 没有显示工具

**排查步骤**：

1. 检查 Thin MCP Server 是否正常启动：

   ```bash
   # Gemini CLI 的错误输出会显示启动日志
   # 查看是否有错误信息
   ```

2. 检查中心 API 是否可达：

   ```bash
   curl https://api.your-domain.com/health
   ```

3. 检查 API Token 是否正确：

   ```bash
   curl https://api.your-domain.com/api/tools \
     -H "X-API-Key: your-token"
   ```

4. 查看 Thin MCP Server 日志（通过 Gemini CLI 输出）

### 问题 2: 工具执行失败

**错误信息**：`❌ 工具执行失败: Failed to get queries`

**可能原因**：

1. **中心 API 宕机**

   ```bash
   # 检查 API 状态
   curl https://api.your-domain.com/health
   ```

2. **工具名称不存在**

   ```bash
   # 检查工具列表
   curl https://api.your-domain.com/api/tools -H "X-API-Key: xxx"
   ```

3. **API Token 过期或错误**
   ```bash
   # 更新 ~/.starrocks-mcp/.env 中的 CENTRAL_API_TOKEN
   ```

### 问题 3: SQL 执行失败

**错误信息**：`Query xxx failed: ...`

**排查步骤**：

1. 检查数据库连接：

   ```bash
   mysql -h 192.168.1.100 -P 9030 -u root -p
   ```

2. 检查 SQL 权限：

   ```sql
   -- 确认用户有查询 information_schema 的权限
   SHOW GRANTS;
   ```

3. 手动执行 SQL：

   ```bash
   # 获取 SQL
   curl https://api.your-domain.com/api/queries/analyze_storage_health \
     -H "X-API-Key: xxx"

   # 手动在数据库中执行看是否有语法错误
   ```

### 问题 4: 分析结果异常

**错误信息**：`Analysis failed: ...`

**可能原因**：

1. **SQL 结果格式不匹配**
   - 检查 StarRocks 版本
   - 某些字段可能在新版本中改名

2. **数据量过大**
   - API 请求超时
   - 增加 fetch 的 timeout 设置

3. **分析逻辑错误**
   - 这是服务端问题
   - 联系服务提供商

### 问题 5: 性能慢

**现象**：工具执行很慢（> 30秒）

**优化建议**：

1. **优化 SQL 查询**
   - 添加 LIMIT
   - 添加索引
   - 减少扫描范围

2. **使用缓存**
   - 客户端已经缓存工具列表（1小时）
   - 可以在服务端添加结果缓存

3. **调整超时设置**
   ```javascript
   // 在 thin-mcp-server.js 中增加 timeout
   const response = await fetch(url, {
     headers: headers,
     timeout: 60000, // 60秒
   });
   ```

---

## 安全考虑

### 1. API 认证

**强烈建议**：

- 使用强 API Key（至少 32 字符）
- 定期轮换 API Key
- 为每个客户生成独立的 Token

**生成安全 Token**：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. HTTPS 加密

**生产环境必须使用 HTTPS**：

```bash
# 使用 Let's Encrypt
sudo certbot --nginx -d api.your-domain.com
```

### 3. 数据隐私

**当前设计**：

- ✅ 数据库密码只在客户本地
- ✅ 查询结果发送给 API（用于分析）
- ⚠️ 如果客户对数据极度敏感，可以修改为只发送聚合结果

**增强隐私版本**（可选）：

```javascript
// 在 thin-mcp-server.js 中
// 不发送完整结果，只发送聚合统计
const summary = {
  disk_usage_max: Math.max(
    ...results.backends.map((be) => parseFloat(be.MaxDiskUsedPct)),
  ),
  error_tablet_count: results.backends.reduce(
    (sum, be) => sum + parseInt(be.ErrTabletNum),
    0,
  ),
};

// 发送 summary 而不是完整 results
```

### 4. 日志脱敏

**服务端日志不应包含敏感信息**：

```javascript
// 在 index-expert-api.js 中
app.use((req, res, next) => {
  const logData = {
    method: req.method,
    path: req.path,
    status: res.statusCode,
    // 不记录 body 中的数据库结果
  };
  console.log(JSON.stringify(logData));
  next();
});
```

---

## 性能优化

### 1. 工具列表缓存

**客户端已实现**（1小时缓存）：

```javascript
if (this.toolsCache && Date.now() - this.cacheTime < this.cacheTTL) {
  return this.toolsCache; // 使用缓存
}
```

### 2. SQL 结果压缩（可选）

如果查询结果很大，可以压缩传输：

```javascript
// 服务端
const zlib = require('zlib');
const compressed = zlib.gzipSync(JSON.stringify(results));

// 客户端
const decompressed = zlib.gunzipSync(compressed);
const results = JSON.parse(decompressed);
```

### 3. 并发执行 SQL

**当前实现是顺序执行**，可以改为并发：

```javascript
// thin-mcp-server.js
async executeQueries(queries) {
  const connection = await mysql.createConnection(this.dbConfig);

  // 并发执行
  const promises = queries.map(async (query) => {
    const [rows] = await connection.query(query.sql);
    return { id: query.id, rows };
  });

  const resultArray = await Promise.all(promises);

  const results = {};
  resultArray.forEach(({ id, rows }) => {
    results[id] = rows;
  });

  await connection.end();
  return results;
}
```

---

## 总结

### 方案 C 的关键价值

1. **客户零配置网络**
   - 无需暴露端口、配置防火墙、VPN
   - 只需能访问公网 HTTPS（几乎所有环境都满足）

2. **服务商零维护升级**
   - SQL 逻辑在中心 API
   - 升级 API → 所有客户立即生效
   - 客户端基本不需要升级

3. **数据安全性最高**
   - 密码不离开客户内网
   - 数据在本地执行
   - 只发送必要结果用于分析

4. **完全标准兼容**
   - MCP 标准 Stdio 传输
   - 可被任何 MCP 客户端使用
   - 未来扩展性好

### 适用场景

**最适合**：

- ✅ SaaS 多租户服务
- ✅ 客户数量多（升级维护成本高）
- ✅ 客户网络环境复杂（防火墙严格）
- ✅ 需要频繁迭代 SQL 逻辑

**不适合**：

- ❌ 客户只有 1-2 个（可以用方案 A/B）
- ❌ 客户完全拒绝数据发送到外部（即使聚合数据也不行）
- ❌ SQL 逻辑完全稳定，永不修改

---

## 附录

### A. 目录结构

```
mcp-example/
├── index-expert-api.js          # 中心 REST API 服务器
├── thin-mcp-server.js            # 本地 Thin MCP Server
├── install-starrocks-mcp.sh           # 客户端一键安装脚本
├── package.json                  # 依赖管理
├── .env.example                  # 环境变量模板
├── SOLUTION_C_GUIDE.md           # 本使用指南
└── experts/                      # 专家类（服务端使用）
    ├── storage-expert.js
    ├── compaction-expert-integrated.js
    └── ingestion-expert.js
```

### B. 端口使用

| 端口 | 用途                    | 部署位置         |
| ---- | ----------------------- | ---------------- |
| 80 | 中心 REST API           | 服务端（你维护） |
| 9030 | StarRocks FE            | 客户内网         |
| N/A  | Thin MCP Server (Stdio) | 客户本地         |

### C. 常用命令

```bash
# 服务端
npm run start:api              # 启动中心 API
pm2 start index-expert-api.js  # PM2 启动
pm2 logs starrocks-api         # 查看日志
pm2 restart starrocks-api      # 重启服务

# 客户端
./install-starrocks-mcp.sh          # 安装
nano ~/.starrocks-mcp/.env     # 配置
nano ~/.gemini/settings.json   # 配置 Gemini CLI
gemini                         # 启动 Gemini CLI
```

### D. 相关文档

- **ARCHITECTURE.md** - 整体架构设计
- **USER_GUIDE.md** - 所有模式的用户指南
- **REMOTE_QUICK_START.md** - 方案 A/B 快速开始

---

**版本**: 1.0.0
**创建日期**: 2025-01-15
**维护者**: StarRocks MCP Team
