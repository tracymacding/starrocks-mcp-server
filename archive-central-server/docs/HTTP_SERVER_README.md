# StarRocks MCP HTTP Server - 完整版

**包含所有 11 个 Expert 和 33 个工具的中心化 HTTP 服务器!**

将 StarRocks 专家系统部署为远程 HTTP 服务，支持多个客户端通过网络访问。

## 🎯 核心特性

### 完整的 Expert 支持

✅ **所有 11 个专家模块**：

- 💾 **storage-expert** - 存储健康诊断
- 🗜️ **compaction-expert** - Compaction 分析
- 📥 **ingestion-expert** - 数据摄取诊断
- 💿 **cache-expert** - 缓存性能分析 (你要的!)
- 🔄 **transaction-expert** - 事务管理分析
- 📋 **log-expert** - 日志分析
- 💾 **memory-expert** - 内存管理分析
- ⚡ **query-perf-expert** - 查询性能分析
- 🔧 **operate-expert** - 运维操作工具
- 📊 **table-schema-expert** - 表结构分析
- 🎯 **coordinator** - 跨模块协调分析

✅ **所有 33 个工具** 完整可用!

### 技术特性

- ✅ **HTTP/SSE 传输**：基于 Server-Sent Events 的实时通信
- 🔐 **API Key 认证**：保护你的服务免受未授权访问
- 🌍 **CORS 支持**：配置允许的访问来源
- ❤️ **健康检查**：监控服务状态
- 📝 **请求日志**：记录所有请求便于调试
- 🎨 **完整兼容 MCP 协议**：标准 MCP 客户端直接连接

## 📦 安装依赖

```bash
cd mcp-example
npm install
```

## 🔧 配置

1. **复制环境变量模板**：

```bash
cp .env.example .env
```

2. **编辑 `.env` 文件**：

```bash
# StarRocks 数据库配置
SR_HOST=your-starrocks-host
SR_PORT=9030
SR_USER=root
SR_PASSWORD=your-password

# HTTP 服务器配置
PORT=3000

# API Key（强烈建议设置）
API_KEY=your-secret-api-key-here

# CORS 配置
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

3. **生成安全的 API Key**：

```bash
openssl rand -hex 32
```

## 🚀 启动服务

### 方式 1: 使用启动脚本（推荐）

```bash
./start-http-server.sh
```

### 方式 2: 直接运行

```bash
npm run start:http
```

### 方式 3: 开发模式（自动重启）

```bash
npm run dev
```

## 🔗 访问端点

启动后，服务提供以下端点：

| 端点        | 方法 | 说明                   |
| ----------- | ---- | ---------------------- |
| `/`         | GET  | 服务信息和可用端点列表 |
| `/health`   | GET  | 健康检查（无需认证）   |
| `/sse`      | GET  | SSE 连接端点           |
| `/messages` | POST | 消息处理端点           |

### 示例：健康检查

```bash
curl http://localhost:3000/health
```

响应：

```json
{
  "status": "healthy",
  "service": "starrocks-mcp-server",
  "version": "2.0.0",
  "uptime": 123.456,
  "experts": 25
}
```

## 🔐 客户端配置

### Gemini CLI 配置

在 `~/.gemini/config.json` 或项目的 `.claude/config.json` 中添加：

```json
{
  "mcpServers": {
    "starrocks-remote": {
      "url": "http://your-server:3000/sse",
      "description": "StarRocks 专家系统（远程）",
      "headers": {
        "X-API-Key": "your-secret-api-key-here"
      },
      "timeout": 600000
    }
  }
}
```

### 测试连接

```bash
# 使用 Gemini CLI
gemini mcp list

# 应该看到
# ✓ starrocks-remote (connected)
#   - analyze_storage_health
#   - analyze_compaction_health
#   - ...
```

## 🐳 Docker 部署（推荐生产环境）

1. **创建 Dockerfile**：

```dockerfile
FROM node:20-slim

WORKDIR /app

# 复制 package.json 和代码
COPY package*.json ./
COPY *.js ./
COPY experts/ ./experts/

# 安装依赖
RUN npm install --production

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "index-expert-http.js"]
```

2. **构建镜像**：

```bash
docker build -t starrocks-mcp-server .
```

3. **运行容器**：

```bash
docker run -d \
  --name starrocks-mcp \
  -p 3000:3000 \
  -e SR_HOST=your-db-host \
  -e SR_USER=root \
  -e SR_PASSWORD=your-password \
  -e API_KEY=your-api-key \
  starrocks-mcp-server
```

## 🔒 安全最佳实践

### 1. 使用 HTTPS

生产环境务必使用 HTTPS。可以通过 Nginx 反向代理实现：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. API Key 轮换

定期更换 API Key：

```bash
# 生成新 key
NEW_KEY=$(openssl rand -hex 32)
echo "API_KEY=$NEW_KEY" >> .env

# 重启服务
./start-http-server.sh
```

### 3. IP 白名单

在 Nginx 或防火墙层面限制访问：

```nginx
# 只允许特定 IP 访问
location / {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;

    proxy_pass http://localhost:3000;
}
```

### 4. Rate Limiting

使用 Nginx 限制请求频率：

```nginx
limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;

location / {
    limit_req zone=mcp_limit burst=20;
    proxy_pass http://localhost:3000;
}
```

## 📊 监控和日志

### 查看服务日志

```bash
# 标准输出
tail -f logs/server.log

# 使用 Docker
docker logs -f starrocks-mcp
```

### 请求日志格式

```
2025-01-15T10:30:45.123Z GET /health 200 5ms
2025-01-15T10:30:50.456Z POST /messages 200 1234ms
```

## 🔧 故障排查

### 问题 1: 连接被拒绝

**症状**：客户端无法连接到服务器

**解决方案**：

1. 检查服务是否运行：`curl http://localhost:3000/health`
2. 检查防火墙：`sudo ufw allow 3000/tcp`
3. 检查端口占用：`lsof -i :3000`

### 问题 2: 认证失败

**症状**：401 Unauthorized

**解决方案**：

1. 确认 API Key 正确：检查 `.env` 文件
2. 确认 header 格式：`X-API-Key: your-key` 或 `Authorization: Bearer your-key`
3. 检查 CORS 配置

### 问题 3: 数据库连接失败

**症状**：Tool execution failed: Missing StarRocks connection details

**解决方案**：

1. 检查环境变量：`echo $SR_HOST`
2. 测试数据库连接：

```bash
mysql -h $SR_HOST -P $SR_PORT -u $SR_USER -p
```

## 📈 性能优化

### 1. 连接池配置

修改 `index-expert-http.js` 中的数据库配置：

```javascript
const pool = mysql.createPool({
  host: process.env.SR_HOST,
  user: process.env.SR_USER,
  password: process.env.SR_PASSWORD,
  connectionLimit: 10, // 增加连接池大小
  queueLimit: 0,
  waitForConnections: true,
});
```

### 2. 启用缓存

对于频繁查询的数据，可以添加内存缓存：

```javascript
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60 }); // 60秒过期
```

### 3. 启用压缩

```bash
npm install compression
```

```javascript
import compression from 'compression';
app.use(compression());
```

## 🌐 多实例部署

使用 PM2 进行进程管理：

```bash
# 安装 PM2
npm install -g pm2

# 启动服务（4个实例）
pm2 start index-expert-http.js -i 4 --name starrocks-mcp

# 查看状态
pm2 status

# 查看日志
pm2 logs starrocks-mcp

# 重启
pm2 restart starrocks-mcp
```

## 📝 API 参考

### 工具列表

所有原有的专家系统工具都可用，包括：

#### Storage Expert

- `analyze_storage_health` - 存储健康分析
- `analyze_disk_usage` - 磁盘使用分析
- `analyze_table_size` - 表大小分析

#### Compaction Expert

- `analyze_compaction_health` - Compaction 健康分析
- `get_high_compaction_partitions` - 高 Compaction Score 分区
- `analyze_slow_compaction_tasks` - 慢 Compaction 任务分析

#### Import Expert

- `analyze_import_health` - 导入健康分析
- `check_load_job_status` - 检查导入任务状态

#### Coordinator

- `coordinate_expert_analysis` - 多专家协调分析

完整工具列表请访问：`http://localhost:3000/`

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
