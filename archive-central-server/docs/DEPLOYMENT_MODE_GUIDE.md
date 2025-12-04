# 中心 API 服务器部署模式指南

## 🚨 快速诊断

**遇到 `ECONNREFUSED` 数据库连接错误？**

这说明您使用了错误的部署模式。请根据下表选择正确的启动脚本：

| 问题                                    | 原因                   | 解决方案                 |
| --------------------------------------- | ---------------------- | ------------------------ |
| `ECONNREFUSED` 连接 localhost:9030 失败 | 服务器无 StarRocks     | 使用 **Solution C 模式** |
| 工具返回空数据                          | SQL 在错误的机器上执行 | 检查部署模式             |

---

## 📊 两种部署模式对比

### Mode 1: Complete 模式（服务器端执行）

```
客户端 (Gemini CLI)
    ↓ 请求工具
中心服务器
    ↓ 连接 StarRocks (服务器本地)
    ↓ 执行 SQL 查询
    ↓ 分析结果
    ↓ 返回报告
客户端 ← 显示结果
```

**特点**:

- ✅ 客户端无需数据库
- ✅ 客户端无需执行 SQL
- ❌ **服务器必须能连接 StarRocks**
- ❌ 所有客户端共享同一数据库

**文件**: `index-expert-api-complete.js`
**启动**: `./start-central-server.sh`

---

### Mode 2: Solution C 模式（客户端执行）⭐ 推荐

```
客户端 (Gemini CLI + Thin MCP Server)
    ↓ 请求工具
中心服务器
    ↓ 返回 SQL 定义
客户端
    ↓ 执行 SQL (连接本地 StarRocks)
    ↓ 发送结果
中心服务器
    ↓ 分析数据
    ↓ 返回报告
客户端 ← 显示结果
```

**特点**:

- ✅ **服务器无需数据库** ⭐
- ✅ 每个客户端连接自己的 StarRocks
- ✅ 数据不离开客户端（安全）
- ✅ 支持多租户场景
- ❌ 客户端需要配置 Thin MCP Server

**文件**: `index-expert-api-solutionc.js`
**启动**: `./start-central-server-solutionc.sh` ⭐

---

## 🎯 使用场景选择

### 场景 1: 远程中心服务器 + 本地数据库（常见）⭐

**情况**:

- 中心服务器部署在云上/远程服务器
- 每个客户端有自己的 StarRocks 数据库
- 数据不能离开客户端网络

**选择**: **Solution C 模式** ⭐

**服务器端部署**:

```bash
# 在远程服务器上
cd /path/to/gemini-cli/mcp-example

# 使用 Solution C 启动脚本
./start-central-server-solutionc.sh

# 或直接启动
export API_HOST=0.0.0.0
export API_PORT=80
export API_KEY=$(openssl rand -hex 32)
node index-expert-api-solutionc.js
```

**客户端配置**:

```bash
# 在客户端机器上
cd /path/to/gemini-cli/mcp-example
./install-starrocks-mcp.sh

# 配置 Thin MCP Server
cat > ~/.starrocks-mcp/.env <<EOF
# 远程中心 API
CENTRAL_API_URL=http://<server-ip>:80
CENTRAL_API_KEY=<your-api-key>

# 本地 StarRocks
SR_HOST=localhost
SR_PORT=9030
SR_USER=root
SR_PASSWORD=
EOF

# 配置 Gemini CLI MCP
# 编辑 ~/.gemini/settings.json 添加 starrocks-expert MCP 配置
```

---

### 场景 2: 中心化数据库 + 共享访问

**情况**:

- 所有客户端访问同一个中心数据库
- 中心服务器可以直接连接数据库
- 客户端无需数据库访问权限

**选择**: **Complete 模式**

**服务器端部署**:

```bash
# 在服务器上
cd /path/to/gemini-cli/mcp-example

# 配置数据库连接
cat > .env <<EOF
API_HOST=0.0.0.0
API_PORT=80
API_KEY=$(openssl rand -hex 32)

# StarRocks 数据库配置
SR_HOST=localhost  # 或数据库实际地址
SR_PORT=9030
SR_USER=root
SR_PASSWORD=your-password
EOF

# 启动服务器
./start-central-server.sh
```

**客户端配置**:

```bash
# 客户端只需要配置 Thin MCP Server 指向中心 API
cat > ~/.starrocks-mcp/.env <<EOF
CENTRAL_API_URL=http://<server-ip>:80
CENTRAL_API_KEY=<your-api-key>
EOF
```

---

### 场景 3: 本地开发测试

**情况**: 所有组件在同一台机器

**选择**: 任意模式，推荐 Solution C（更真实）

```bash
# 本地测试 Solution C
cd /path/to/gemini-cli/mcp-example

# 1. 启动中心服务器
export API_HOST=127.0.0.1
export API_PORT=80
node index-expert-api-solutionc.js &

# 2. 配置 Thin MCP Server
./install-starrocks-mcp.sh
cat > ~/.starrocks-mcp/.env <<EOF
CENTRAL_API_URL=http://localhost:80
CENTRAL_API_KEY=demo-key
SR_HOST=localhost
SR_PORT=9030
SR_USER=root
SR_PASSWORD=
EOF

# 3. 启动 Gemini CLI
cd ..
./start-with-central-api.sh
```

---

## 🔧 切换部署模式

### 从 Complete 切换到 Solution C

**服务器端**:

```bash
# 1. 停止当前服务器
pkill -f "node index-expert-api-complete.js"

# 2. 启动 Solution C 服务器
./start-central-server-solutionc.sh

# 或直接
node index-expert-api-solutionc.js
```

**客户端**:

```bash
# 1. 确保已安装 Thin MCP Server
ls ~/.starrocks-mcp/thin-mcp-server.js

# 2. 配置本地数据库连接
nano ~/.starrocks-mcp/.env
# 添加 SR_HOST, SR_PORT, SR_USER, SR_PASSWORD

# 3. 测试连接
cd ~/.starrocks-mcp
node -e "
const mysql = require('mysql2/promise');
const connection = await mysql.createConnection({
  host: 'localhost',
  port: 9030,
  user: 'root'
});
console.log('✅ 数据库连接成功');
await connection.end();
"
```

---

## 🐛 故障排查

### 错误 1: ECONNREFUSED (端口 9030)

**错误信息**:

```
Error: connect ECONNREFUSED 127.0.0.1:9030
```

**原因**: 服务器端无法连接 StarRocks

**解决**:

1. ✅ 使用 **Solution C 模式**（推荐）
2. 或在服务器上安装/配置 StarRocks
3. 或修改 `.env` 中的 `SR_HOST` 指向可访问的数据库

---

### 错误 2: Tool not found or does not support Solution C

**错误信息**:

```
Tool not found or does not support Solution C
```

**原因**: 使用了不支持 Solution C 的 Expert

**解决**: 确认该工具已实现 Solution C 支持

```bash
# 检查工具列表
curl http://localhost:80/api/tools | jq '.tools[] | .name'

# 检查工具是否支持 Solution C
curl http://localhost:80/api/queries/<tool-name>
```

---

### 错误 3: Invalid or missing API key

**错误信息**:

```
401 Unauthorized: Invalid or missing API key
```

**解决**:

```bash
# 确认服务器端 API_KEY
grep API_KEY /path/to/mcp-example/.env

# 确认客户端配置匹配
grep CENTRAL_API_KEY ~/.starrocks-mcp/.env

# 测试 API Key
curl http://<server-ip>:80/health -H "X-API-Key: your-api-key"
```

---

## 📝 快速命令参考

### 检查当前运行的服务器类型

```bash
# 方法 1: 检查进程
ps aux | grep "node index-expert"

# 方法 2: 检查健康端点
curl http://localhost:80/health | jq '.service'
# Complete: "starrocks-central-api-complete"
# Solution C: "starrocks-central-api-solutionc"

# 方法 3: 检查 mode 字段
curl http://localhost:80/health | jq '.mode'
# Solution C: "Solution C (Client-side SQL Execution)"
```

### 重启服务器

```bash
# 停止
pkill -f "node index-expert-api"

# 启动 Solution C（推荐）
cd /path/to/gemini-cli/mcp-example
./start-central-server-solutionc.sh

# 或 Complete
./start-central-server.sh
```

### 测试端到端连接

```bash
# 1. 测试中心 API
curl http://<server-ip>:80/health -H "X-API-Key: <your-key>"

# 2. 测试获取 SQL 定义（Solution C）
curl http://<server-ip>:80/api/queries/analyze_storage_health \
  -H "X-API-Key: <your-key>" | jq

# 3. 从客户端测试完整流程
# 启动 Gemini CLI 并执行：请分析存储健康状况
```

---

## 📚 相关文档

- `SOLUTION_C_GUIDE.md` - Solution C 详细架构说明
- `NETWORK_CONFIG_GUIDE.md` - 网络配置和安全指南
- `QUICK_START.md` - 快速开始指南

---

## 🎉 推荐配置（生产环境）

```bash
# 服务器端（远程）
# - 使用 Solution C 模式
# - 绑定 0.0.0.0（允许外部访问）
# - 强 API Key
# - 防火墙白名单

cd /root/gemini-cli/mcp-example
./start-central-server-solutionc.sh

# 客户端（本地）
# - Thin MCP Server 连接本地 StarRocks
# - 通过 HTTP 连接远程中心 API
# - 数据不离开本地网络

cd ~/my-workspace
./install-starrocks-mcp.sh
# 配置 ~/.starrocks-mcp/.env
# 配置 ~/.gemini/settings.json
# 启动 Gemini CLI
```

---

**总结**: 如果您的场景是"远程服务器 + 本地数据库"，请使用 **Solution C 模式** (`start-central-server-solutionc.sh`)！
