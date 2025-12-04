# Solution C 实际使用指南

## 当前状态

✅ **已完成的组件**:

- Central API Server (index-expert-api.js) - 运行中 @ http://localhost:80
- Thin MCP Client (thin-mcp-server.js) - 已安装 @ ~/.starrocks-mcp/
- 安装脚本 (install-starrocks-mcp.sh) - 已测试通过
- 完整文档 (SOLUTION_C_GUIDE.md, USAGE_DEMO.md)

## 快速开始

### 1. 配置数据库连接

编辑客户端配置文件:

```bash
nano ~/.starrocks-mcp/.env
```

修改以下内容:

```bash
# 你的 StarRocks 数据库配置
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=your_actual_password  # 修改为实际密码
SR_PORT=9030

# Central API 地址（本地测试使用 localhost，生产环境使用实际域名）
CENTRAL_API=http://localhost:80
CENTRAL_API_TOKEN=demo-key
```

### 2. 配置 Gemini CLI

编辑或创建 Gemini CLI 配置:

```bash
nano ~/.gemini/settings.json
```

添加以下配置 (如果文件已存在，合并到现有的 JSON 中):

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["/home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js"],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "your_actual_password",
        "SR_PORT": "9030",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "demo-key"
      }
    }
  }
}
```

**注意**: 你可以复制 `~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json` 的内容。

### 3. 使用 Gemini CLI

启动 Gemini CLI:

```bash
gemini
```

#### 列出可用工具:

```
> /mcp-list-tools
```

你应该看到 3 个工具:

- `analyze_storage_health` - 全面分析存储健康状况
- `analyze_compaction_health` - 分析 Compaction 健康状况
- `analyze_ingestion_health` - 分析数据摄取健康状况

#### 使用自然语言诊断:

```
> 请帮我分析 StarRocks 的存储健康状况

> 检查一下 Compaction 是否正常

> 最近的数据导入有问题吗？
```

Gemini AI 会自动调用相应的工具，执行诊断，并返回专业的分析报告。

#### 直接调用工具:

```
> /mcp-call-tool starrocks-expert analyze_storage_health {}

> /mcp-call-tool starrocks-expert analyze_compaction_health {}

> /mcp-call-tool starrocks-expert analyze_ingestion_health {}
```

## 实际使用示例

### 场景 1: 存储健康检查

**用户输入**:

```
> 帮我检查一下存储系统的健康状况
```

**系统响应流程**:

1. Gemini AI 理解意图，决定调用 `analyze_storage_health` 工具
2. Gemini CLI 调用本地 Thin MCP Server (通过 Stdio)
3. Thin MCP Server:
   - 向 API Server 请求 SQL 查询定义
   - 在本地 StarRocks 执行这些 SQL
   - 将查询结果发送给 API Server 分析
   - 接收分析报告并格式化
4. 用户看到完整的诊断报告

**报告示例**:

```
💾 StarRocks 存储专家分析报告
🟢 健康分数: 95/100 (EXCELLENT)
📊 状态: HEALTHY

📋 诊断摘要: 存储系统整体健康，未发现严重问题

✅ 所有检查项通过:
  • BE节点磁盘使用正常
  • 无错误Tablet
  • 存储分布均衡

💡 建议:
  1. 继续监控磁盘使用趋势
  2. 定期检查 Tablet 副本状态
```

### 场景 2: Compaction 问题诊断

**用户输入**:

```
> Compaction 好像很慢，帮我看看是什么问题
```

**报告示例**:

```
🔄 StarRocks Compaction 专家分析报告
🟡 健康分数: 72/100 (FAIR)
📊 状态: WARNING

⚠️  发现问题:
  1. [MEDIUM] 节点 192.168.1.101 有较多未完成的 Compaction 任务
  2. [LOW] Compaction 速率低于建议值

💡 专业建议:
  1. 检查节点 192.168.1.101 的磁盘 I/O 性能
  2. 考虑调整 compaction_task_num_per_disk 参数
  3. 监控 Compaction Score 趋势
```

## 数据流说明

```
用户输入
   ↓
Gemini AI (理解意图)
   ↓
Gemini CLI (MCP 协议)
   ↓
Thin MCP Server (本地，~250行代码)
   ├→ GET /api/queries/:tool       ← Central API (获取SQL定义)
   ├→ 执行 SQL @ 本地 StarRocks     (密码不离开本地)
   └→ POST /api/analyze/:tool      → Central API (发送结果，接收分析)
   ↓
返回格式化报告
   ↓
用户看到结果
```

## 关键优势

### 1. 零网络配置

- ✅ 客户只需访问 HTTPS API (无需暴露端口)
- ✅ 无需配置防火墙或反向代理
- ✅ 适合企业内网环境

### 2. 零维护升级

**场景**: 你想优化 SQL 查询或改进分析算法

**操作**:

```bash
# 1. 修改 index-expert-api.js
nano index-expert-api.js

# 2. 重启 API 服务器
pm2 restart starrocks-api

# ✅ 完成！所有客户自动获得新功能，无需任何操作！
```

客户端代码只有 ~250 行，极少需要更新。

### 3. 数据安全

- ✅ 数据库密码只存储在客户本地 (`~/.starrocks-mcp/.env`)
- ✅ SQL 在客户本地 StarRocks 执行
- ✅ 只有查询结果发送给 API (用于分析)
- ✅ 原始数据不离开客户环境

### 4. MCP 标准兼容

- ✅ 使用标准 MCP Stdio Transport
- ✅ 与 Gemini CLI 原生集成
- ✅ 支持工具列表、工具调用等标准操作
- ✅ 可以与其他 MCP 服务器共存

## 测试验证

### 验证 API Server

```bash
# 健康检查
curl http://localhost:80/health | jq .

# 列出工具
curl http://localhost:80/api/tools -H "X-API-Key: demo-key" | jq .

# 获取 SQL 定义
curl http://localhost:80/api/queries/analyze_storage_health \
  -H "X-API-Key: demo-key" | jq .
```

### 验证 Thin MCP Client

```bash
# 检查安装
ls -la ~/.starrocks-mcp/

# 检查配置
cat ~/.starrocks-mcp/.env

# 手动测试 (需要配置好数据库连接)
cd ~/.starrocks-mcp
node thin-mcp-server.js
# 通过 stdin 发送 MCP 协议消息进行测试
```

### 运行完整测试

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./test-thin-mcp.sh
```

## 生产部署

### 服务端 (你维护)

1. **部署 API Server**:

```bash
# 使用 PM2 管理进程
cd mcp-example
export API_PORT=80
export API_KEY=your-secure-random-key

pm2 start index-expert-api.js --name starrocks-api
pm2 save
pm2 startup
```

2. **配置 Nginx (HTTPS)**:

```nginx
server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /api/ {
        proxy_pass http://localhost:80;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://localhost:80;
    }
}
```

### 客户端 (客户操作)

提供给客户的安装说明:

```bash
# 1. 下载安装脚本
curl -O https://api.your-domain.com/install-starrocks-mcp.sh
chmod +x install-starrocks-mcp.sh

# 2. 运行安装
./install-starrocks-mcp.sh

# 3. 配置数据库连接
nano ~/.starrocks-mcp/.env
# 修改: SR_HOST, SR_USER, SR_PASSWORD
# 修改: CENTRAL_API=https://api.your-domain.com
# 修改: CENTRAL_API_TOKEN=your-client-token

# 4. 配置 Gemini CLI
nano ~/.gemini/settings.json
# 参考 ~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json 添加配置

# 5. 开始使用
gemini
> 请帮我分析 StarRocks 的存储健康状况
```

## 故障排查

### 问题: Gemini CLI 找不到工具

**解决**:

1. 检查 Gemini CLI 配置是否正确:

   ```bash
   cat ~/.gemini/settings.json
   ```

2. 检查 Thin MCP Server 是否可执行:

   ```bash
   node ~/.starrocks-mcp/thin-mcp-server.js
   ```

3. 检查日志 (Gemini CLI 通常会显示错误)

### 问题: 连接数据库失败

**解决**:

1. 验证数据库连接信息:

   ```bash
   mysql -h localhost -P 9030 -u root -p
   ```

2. 检查 `.env` 配置是否正确:
   ```bash
   cat ~/.starrocks-mcp/.env
   ```

### 问题: API 请求失败

**解决**:

1. 验证 API 服务器是否运行:

   ```bash
   curl http://localhost:80/health
   ```

2. 检查 API Token 是否正确:

   ```bash
   echo $CENTRAL_API_TOKEN
   ```

3. 查看 API 服务器日志:
   ```bash
   pm2 logs starrocks-api
   ```

## 下一步

1. **配置数据库连接** - 修改 `~/.starrocks-mcp/.env`
2. **配置 Gemini CLI** - 添加 MCP 服务器配置到 `~/.gemini/settings.json`
3. **开始使用** - 启动 Gemini CLI 并尝试诊断命令

完整文档请参考:

- **SOLUTION_C_GUIDE.md** - 完整的架构和部署指南 (~1100 行)
- **USAGE_DEMO.md** - 10 步完整数据流演示
- **ARCHITECTURE.md** - 架构设计文档

---

**🎉 Solution C 已经完全就绪，可以开始使用了！**
