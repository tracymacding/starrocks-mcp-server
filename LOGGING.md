# StarRocks MCP Server - 日志功能说明

## 概述

StarRocks MCP Server 已集成完整的日志记录功能，用于跟踪和审计所有关键操作。

## 配置

### 启用/禁用日志

通过环境变量 `ENABLE_LOGGING` 控制日志功能：

```bash
# 在 .env 文件中配置
ENABLE_LOGGING=true   # 启用日志（默认）
ENABLE_LOGGING=false  # 禁用日志
```

**注意**：

- 默认情况下日志是**启用**的
- 设置为 `false` 将完全禁用日志功能，不会创建日志文件
- 禁用日志可以减少少量性能开销（通常可忽略不计）
- 建议在生产环境保持启用，以便故障排查

### 启动时的日志状态

MCP Server 启动时会显示日志状态：

```
🤖 Thin MCP Server initialized
   Central API: http://localhost:80
   Database: localhost:9030
   Prometheus: http://localhost:9090
   Logging: enabled                          ← 日志状态
   Log directory: /path/to/logs              ← 日志目录（仅在启用时显示）
```

## 日志特性

### 1. 日志格式

- **格式**: JSON 格式，每行一条日志记录
- **字段**:
  - `timestamp`: ISO 8601 格式时间戳
  - `level`: 日志级别 (INFO, ERROR)
  - `type`: 日志类型（见下方分类）
  - `message`: 日志消息
  - 其他上下文字段（根据日志类型不同）

### 2. 日志存储

- **位置**: `starrocks-mcp-server/logs/`
- **文件名**: `mcp-server-YYYY-MM-DD.log`
- **轮转**: 按日期自动轮转，每天一个日志文件

### 3. 敏感信息脱敏

自动脱敏以下敏感信息：

- `password`
- `token`、`apiToken`、`api_token`
- `secret`
- `ssh_password`
- `SR_PASSWORD`
- `CENTRAL_API_TOKEN`

脱敏后显示为：`***MASKED***`

### 4. 大数据智能摘要

为避免大数据打爆日志文件，自动对大型数据进行摘要：

**HTTP 请求体摘要策略**：

- **< 2KB**: 完整记录（已脱敏）
- **≥ 2KB**: 记录摘要
  - 记录总大小（字节、KB）
  - `args` 小于 512 字节则完整记录，否则只记录键名
  - `results` 只记录前 10 个键名和总数

**HTTP 响应体摘要策略**：

- **< 5KB**: 完整记录（已脱敏）
- **≥ 5KB**: 记录摘要
  - 记录总大小（字节、KB、MB）
  - 只记录前 10 个键名和总数

**压缩效果**：
根据测试，对于 671KB 的原始数据，日志文件仅 2.31KB，压缩比达 **99.66%**

**摘要示例**：

```json
{
  "body": {
    "_truncated": true,
    "sizeBytes": 102400,
    "sizeKB": "100.00",
    "args": {
      "database": "test_db"
    },
    "results": {
      "_truncated": true,
      "sizeBytes": 100000,
      "sizeKB": "97.66",
      "keys": ["query_1", "query_2", "..."],
      "totalKeys": 50
    }
  }
}
```

## 日志类型

### STARTUP - 启动信息

记录 MCP Server 启动时的所有环境变量

**字段**:

- `environmentVariables`: 所有环境变量的键值对（完整打印，未脱敏）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.000Z",
  "level": "INFO",
  "type": "STARTUP",
  "message": "Environment variables at startup",
  "environmentVariables": {
    "CENTRAL_API": "http://localhost:80",
    "CENTRAL_API_TOKEN": "your_token_here",
    "ENABLE_LOGGING": "true",
    "HOME": "/home/user",
    "PATH": "/usr/bin:/bin",
    "PROMETHEUS_HOST": "localhost",
    "PROMETHEUS_PORT": "9090",
    "PROMETHEUS_PROTOCOL": "http",
    "SR_HOST": "localhost",
    "SR_PASSWORD": "your_password",
    "SR_PORT": "9030",
    "SR_USER": "root"
  }
}
```

**注意**:

- 所有环境变量都会完整记录，包括密码等敏感信息
- 环境变量按字母顺序排序
- 此日志仅在 MCP Server 启动时记录一次
- 可用于调试配置问题和确认环境设置

### CLIENT_REQUEST - 客户端请求

记录来自 Gemini CLI 或其他 MCP 客户端的请求

**字段**:

- `requestId`: 唯一请求标识符
- `toolName`: 调用的工具名称
- `args`: 工具参数（已脱敏）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.123Z",
  "level": "INFO",
  "type": "CLIENT_REQUEST",
  "message": "Received request from client",
  "requestId": "req_1733050200123_1",
  "toolName": "analyze_storage_health",
  "args": {
    "database": "test_db"
  }
}
```

### CENTRAL_REQUEST - 中心服务器请求

记录发送到中心 API 的请求

**字段**:

- `requestId`: 请求标识符
- `method`: HTTP 方法
- `url`: 请求 URL
- `body`: 请求体（已脱敏，大对象仅记录大小）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.234Z",
  "level": "INFO",
  "type": "CENTRAL_REQUEST",
  "message": "Sending request to central API",
  "requestId": "req_1733050200123_1",
  "method": "POST",
  "url": "http://localhost:80/api/queries/analyze_storage_health",
  "body": {
    "args": {
      "database": "test_db"
    }
  }
}
```

### CENTRAL_RESPONSE - 中心服务器响应

记录从中心 API 收到的响应

**字段**:

- `requestId`: 请求标识符
- `url`: 请求 URL
- `status`: HTTP 状态码
- `dataSize`: 响应数据大小（字节）
- `error`: 错误信息（如果有）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.456Z",
  "level": "INFO",
  "type": "CENTRAL_RESPONSE",
  "message": "Received response from central API",
  "requestId": "req_1733050200123_1",
  "url": "http://localhost:80/api/queries/analyze_storage_health",
  "status": 200,
  "dataSize": 1234
}
```

### DB_QUERY - 数据库查询

记录 SQL 查询的执行，**包含完整的 MySQL 命令行**，方便调试和复现

**字段**:

- `requestId`: 请求标识符
- `queryId`: 查询标识符
- `queryType`: 查询类型（通常为 "sql"）
- `sql`: SQL 语句（超过200字符会截断）
- `mysqlCommand`: **完整的 MySQL 命令**（可直接复制执行）
- `connectionInfo`: 连接信息（结构化）
  - `host`: 数据库主机
  - `port`: 数据库端口
  - `user`: 用户名
  - `hasPassword`: 是否有密码

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.567Z",
  "level": "INFO",
  "type": "DB_QUERY",
  "message": "Executing database query",
  "requestId": "req_1733050200123_1",
  "queryId": "storage_metrics",
  "queryType": "sql",
  "sql": "SELECT * FROM information_schema.be_tablets WHERE database_name = 'test_db'",
  "mysqlCommand": "mysql -hlocalhost -P9030 -uroot -p'***MASKED***' -e 'SELECT * FROM information_schema.be_tablets WHERE database_name = \\'test_db\\''",
  "connectionInfo": {
    "host": "localhost",
    "port": 9030,
    "user": "root",
    "hasPassword": true
  }
}
```

**使用 MySQL 命令复现查询**:

```bash
# 从日志中复制 mysqlCommand，替换 ***MASKED*** 为实际密码
mysql -hlocalhost -P9030 -uroot -p'your_password' -e 'SELECT * FROM information_schema.be_tablets WHERE database_name = '\''test_db'\'''
```

### DB_RESULT - 数据库查询结果

记录 SQL 查询的执行结果

**字段**:

- `requestId`: 请求标识符
- `queryId`: 查询标识符
- `rowCount`: 返回的行数
- `error`: 错误信息（如果有）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.678Z",
  "level": "INFO",
  "type": "DB_RESULT",
  "message": "Database query completed",
  "requestId": "req_1733050200123_1",
  "queryId": "storage_metrics",
  "rowCount": 42
}
```

### PROMETHEUS_QUERY - Prometheus 查询

记录 Prometheus 查询的执行

**字段**:

- `requestId`: 请求标识符
- `queryId`: 查询标识符
- `queryType`: 查询类型（`prometheus_instant` 或 `prometheus_range`）
- `query`: PromQL 查询语句（超过200字符会截断）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.789Z",
  "level": "INFO",
  "type": "PROMETHEUS_QUERY",
  "message": "Executing Prometheus query",
  "requestId": "req_1733050200123_1",
  "queryId": "cpu_usage",
  "queryType": "prometheus_range",
  "query": "rate(process_cpu_seconds_total[5m])"
}
```

### PROMETHEUS_RESULT - Prometheus 查询结果

记录 Prometheus 查询的执行结果

**字段**:

- `requestId`: 请求标识符
- `queryId`: 查询标识符
- `resultSize`: 结果数据大小（字节）
- `error`: 错误信息（如果有）

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:00.890Z",
  "level": "INFO",
  "type": "PROMETHEUS_RESULT",
  "message": "Prometheus query completed",
  "requestId": "req_1733050200123_1",
  "queryId": "cpu_usage",
  "resultSize": 567
}
```

### ERROR - 通用错误

记录执行过程中的错误

**字段**:

- `requestId`: 请求标识符
- `error`: 错误消息
- `stack`: 堆栈跟踪

**示例**:

```json
{
  "timestamp": "2025-12-01T10:30:01.000Z",
  "level": "ERROR",
  "type": "ERROR",
  "message": "Database connection failed",
  "requestId": "req_1733050200123_1",
  "error": "ECONNREFUSED",
  "stack": "Error: connect ECONNREFUSED 127.0.0.1:9030\n    at ..."
}
```

## 请求追踪

每个客户端请求都会生成一个唯一的 `requestId`，格式为 `req_<timestamp>_<counter>`。

通过 `requestId` 可以追踪一个请求的完整生命周期：

1. CLIENT_REQUEST - 收到请求
2. CENTRAL_REQUEST/RESPONSE - 获取查询定义
3. DB_QUERY/RESULT 或 PROMETHEUS_QUERY/RESULT - 执行查询
4. CENTRAL_REQUEST/RESPONSE - 发送分析请求
5. 返回结果给客户端

## 日志分析示例

### 查看今天的所有日志

```bash
cat starrocks-mcp-server/logs/mcp-server-$(date +%Y-%m-%d).log
```

### 查找特定请求的所有日志

```bash
grep "req_1733050200123_1" starrocks-mcp-server/logs/mcp-server-*.log | jq .
```

### 统计各类型日志数量

```bash
cat starrocks-mcp-server/logs/mcp-server-*.log | jq -r '.type' | sort | uniq -c
```

### 查找所有错误日志

```bash
cat starrocks-mcp-server/logs/mcp-server-*.log | jq 'select(.level == "ERROR")'
```

### 查找慢查询（需要结合日志时间戳）

```bash
cat starrocks-mcp-server/logs/mcp-server-*.log | jq 'select(.type == "DB_QUERY" or .type == "DB_RESULT")'
```

## 注意事项

1. **性能影响**: 日志写入是异步的，对性能影响很小
2. **磁盘空间**: 建议定期清理旧日志文件
3. **隐私保护**: 敏感信息已自动脱敏，但仍需注意 SQL 语句中可能包含的业务数据
4. **日志轮转**: 当前按日期轮转，未来可以考虑按大小轮转

## 故障排查

### 日志未生成

1. 检查日志目录权限：`ls -la starrocks-mcp-server/logs/`
2. 检查磁盘空间：`df -h`
3. 查看服务器启动日志中的 "Log directory" 信息

### 日志内容不完整

1. 确认 MCP Server 正常运行
2. 检查是否有未捕获的异常导致进程退出
3. 查看系统日志：`journalctl -u starrocks-mcp-server`（如果使用 systemd）

## 未来改进

- [ ] 添加日志级别配置（DEBUG, INFO, WARN, ERROR）
- [ ] 支持自定义日志格式（JSON/Plain Text）
- [ ] 添加日志文件大小限制和自动压缩
- [ ] 集成日志聚合工具（如 Elasticsearch）
- [ ] 添加日志查询 API
