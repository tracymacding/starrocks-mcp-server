# Solution C 中心服务器使用指南

## 快速开始

### 方法 1: 使用启动脚本（推荐）

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example

# 前台运行（显示日志）
./start-solution-c-server.sh
```

### 方法 2: 直接运行 Node

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example

# 前台运行
node index-expert-api-solutionc.js

# 后台运行（推荐用于生产环境）
node index-expert-api-solutionc.js > logs/solution-c.log 2>&1 &

# 查看日志
tail -f logs/solution-c.log
```

### 方法 3: 使用 PM2（推荐用于生产环境）

```bash
# 安装 PM2（如果没有）
npm install -g pm2

# 启动服务器
pm2 start index-expert-api-solutionc.js --name "solution-c-api"

# 查看状态
pm2 status

# 查看日志
pm2 logs solution-c-api

# 停止服务器
pm2 stop solution-c-api

# 重启服务器
pm2 restart solution-c-api
```

---

## 服务器信息

启动成功后，你会看到：

```
🚀 StarRocks Central API Server (Solution C)
================================================

   📡 API endpoint:     http://localhost:80
   ❤️  Health check:    http://localhost:80/health
   🔧 List tools:       http://localhost:80/api/tools

   🔑 Authentication:   Enabled
   📦 Tools loaded:     33

   ✨ 架构模式: Solution C
   - SQL 执行: Thin MCP Server（客户端）
   - 数据分析: Central API Server（服务端）
```

---

## 测试服务器

### 1. 健康检查

```bash
curl http://localhost:80/health
```

**预期输出：**
```json
{
  "status": "healthy",
  "service": "starrocks-central-api-solutionc",
  "version": "3.0.0",
  "mode": "Solution C (Client-side SQL Execution)",
  "tools": 33
}
```

### 2. 列出所有工具

```bash
curl http://localhost:80/api/tools -H "X-API-Key: demo-key"
```

### 3. 测试 SQL 查询定义

```bash
curl http://localhost:80/api/queries/storage_expert_analysis \
  -H "X-API-Key: demo-key"
```

**预期输出：**
```json
{
  "tool": "storage_expert_analysis",
  "queries": [
    {
      "id": "backends",
      "sql": "SHOW BACKENDS;",
      "description": "BE节点存储信息",
      "required": true
    },
    ...
  ],
  "analysis_endpoint": "/api/analyze/storage_expert_analysis"
}
```

### 4. 测试分析端点（模拟客户端发送结果）

```bash
curl -X POST http://localhost:80/api/analyze/storage_expert_analysis \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-key" \
  -d '{
    "results": {
      "backends": [
        {
          "IP": "192.168.1.1",
          "MaxDiskUsedPct": "85.5%",
          "AvailCapacity": "100 GB",
          "DataUsedCapacity": "500 GB",
          "TabletNum": "1000",
          "ErrTabletNum": "0",
          "MemUsedPct": "70%"
        }
      ],
      "tablet_statistics": [
        {
          "total_tablets": 1000,
          "nodes_with_errors": 0,
          "total_error_tablets": 0,
          "total_tablets_on_nodes": 1000
        }
      ]
    },
    "args": {}
  }'
```

---

## 配置

服务器配置通过环境变量设置（在 `.env` 文件中）：

```bash
# 服务器端口
API_PORT=80

# API Key（用于认证）
API_KEY=demo-key

# StarRocks 数据库配置（如果需要传统模式）
STARROCKS_HOST=localhost
STARROCKS_PORT=9030
STARROCKS_USER=root
STARROCKS_PASSWORD=
STARROCKS_DATABASE=
```

---

## 停止服务器

### 如果使用前台运行
按 `Ctrl+C` 停止

### 如果使用后台运行
```bash
pkill -f "node index-expert-api-solutionc"
```

### 如果使用 PM2
```bash
pm2 stop solution-c-api
```

---

## Solution C 工作流程

```
┌─────────────────┐
│  Gemini/DeepSeek│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Thin MCP Server │
└────────┬────────┘
         │
         │ 1. GET /api/queries/storage_expert_analysis
         ▼
┌─────────────────┐
│  Central API    │◄──── 返回 SQL 定义
└─────────────────┘

         │
         │ 2. Thin MCP Server 执行 SQL
         ▼
┌─────────────────┐
│    StarRocks    │
│    Database     │
└────────┬────────┘
         │
         │ 3. POST /api/analyze/storage_expert_analysis
         │    发送: {"results": {...}, "args": {...}}
         ▼
┌─────────────────┐
│  Central API    │◄──── 返回分析报告
└─────────────────┘
```

---

## 当前支持的 Solution C 工具

目前只有 **Storage Expert** 完全支持 Solution C 模式：

- ✅ `storage_expert_analysis` - 存储健康分析
- ✅ `analyze_storage_amplification` - 存储放大分析

其他 32 个工具仍使用传统模式（服务器端执行 SQL）。

---

## 与 Thin MCP Server 集成

Thin MCP Server 需要配置为使用 Solution C 端点：

### 配置 Thin MCP Server

编辑 Thin MCP Server 配置，将中心 API 地址设置为：

```json
{
  "centralApiUrl": "http://localhost:80",
  "apiKey": "demo-key",
  "mode": "solution-c"
}
```

### Thin MCP Server 工作流程

1. 接收 Gemini/DeepSeek 的工具调用请求
2. GET `/api/queries/:tool` 获取 SQL 定义
3. 连接 StarRocks 数据库执行这些 SQL
4. POST `/api/analyze/:tool` 发送结果给中心 API
5. 将分析结果返回给 Gemini/DeepSeek

---

## 迁移其他 Expert 到 Solution C

参考文档：
- `SOLUTION_C_MIGRATION_GUIDE.md` - 详细的迁移指南
- `experts/storage-expert-solutionc.js` - 完整的参考实现

每个 Expert 需要实现两个方法：
1. `getQueriesForTool(toolName, args)` - 返回 SQL 定义
2. `analyzeQueryResults(toolName, results, args)` - 分析客户端结果

---

## 故障排查

### 端口被占用

```bash
# 查看占用端口的进程
lsof -i :80

# 停止占用端口的进程
pkill -f "node index-expert-api"
```

### 服务器无法启动

1. 检查 Node.js 版本：`node --version` (需要 v14+)
2. 检查依赖是否安装：`npm install`
3. 检查 `.env` 文件配置

### API 返回 401 Unauthorized

检查请求头是否包含正确的 API Key：
```bash
-H "X-API-Key: demo-key"
```

### 工具不支持 Solution C

错误信息：`"Expert does not support Solution C mode"`

原因：该 Expert 还未实现 `getQueriesForTool()` 和 `analyzeQueryResults()` 方法。

解决方案：参考 `SOLUTION_C_MIGRATION_GUIDE.md` 改造该 Expert。

---

## 相关文档

- `SOLUTION_C_QUICKSTART.md` - 快速开始指南
- `SOLUTION_C_MIGRATION_GUIDE.md` - Expert 迁移指南
- `ARCHITECTURE_CHOICE.md` - 架构选择说明
- `experts/storage-expert-solutionc.js` - 参考实现

---

## 下一步

1. ✅ **启动服务器**（本文档）
2. ⏳ **配置 Thin MCP Server** 使用 Solution C 端点
3. ⏳ **测试完整工作流程**
4. ⏳ **迁移其他 Expert** 到 Solution C 模式

---

## 技术支持

如有问题，请查看：
- 服务器日志：`logs/solution-c.log` 或 `pm2 logs`
- GitHub Issues: https://github.com/your-repo/issues
