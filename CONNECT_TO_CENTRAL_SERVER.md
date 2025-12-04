# 配置 Gemini CLI 连接中心服务器

## 📋 前提条件

1. **中心服务器已部署**
   - 服务器地址: `http://YOUR_SERVER_IP:80`
   - API Key: 部署时生成的密钥

2. **本地 StarRocks 数据库**
   - 主机: localhost
   - 端口: 9030
   - 用户: root

## 🚀 快速配置（3 步）

### 第 1 步: 安装 MCP 客户端

```bash
cd /home/disk5/dingkai/github/gemini-cli/starrocks-mcp-server
./install-starrocks-mcp.sh
```

这会将 MCP 客户端安装到 `~/.starrocks-mcp/`

### 第 2 步: 配置中心服务器地址

编辑 `~/.starrocks-mcp/.env`:

```bash
nano ~/.starrocks-mcp/.env
```

修改以下内容:

```bash
# StarRocks 数据库配置（本地数据库）
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=
SR_PORT=9030

# 中心 API 配置 ⭐ 重要
CENTRAL_API=http://YOUR_SERVER_IP:80
CENTRAL_API_TOKEN=your-api-key-from-deployment
```

**替换说明:**
- `YOUR_SERVER_IP`: 替换为中心服务器的 IP 地址
- `your-api-key-from-deployment`: 替换为部署中心服务器时生成的 API Key

### 第 3 步: 配置 Gemini CLI

创建或编辑 `~/.gemini/settings.json`:

```bash
mkdir -p ~/.gemini
nano ~/.gemini/settings.json
```

内容:

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": [
        "/home/disk5/dingkai/.starrocks-mcp/starrocks-mcp.js"
      ],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "",
        "SR_PORT": "9030",
        "CENTRAL_API": "http://YOUR_SERVER_IP:80",
        "CENTRAL_API_TOKEN": "your-api-key-from-deployment"
      }
    }
  }
}
```

**注意:** 同样需要替换 `YOUR_SERVER_IP` 和 `your-api-key-from-deployment`

## ✅ 验证配置

### 测试 1: 检查中心服务器

```bash
# 替换为你的服务器地址和 API Key
curl http://YOUR_SERVER_IP:80/health \
  -H "X-API-Key: your-api-key"

# 应该返回:
# {
#   "status": "healthy",
#   "service": "starrocks-central-api-solutionc",
#   "version": "3.0.0"
# }
```

### 测试 2: 检查工具列表

```bash
curl http://YOUR_SERVER_IP:80/api/tools \
  -H "X-API-Key: your-api-key"

# 应该返回 33 个工具列表
```

### 测试 3: 启动 Gemini CLI

```bash
cd /home/disk5/dingkai/github/gemini-cli

# 启动 Gemini CLI
./start-gemini-cli.sh
```

在 Gemini CLI 中测试:

```
> /mcp list

# 应该看到:
# ✓ starrocks-expert: node ~/.starrocks-mcp/starrocks-mcp.js (stdio) - Connected
# Tools: 33

> 请帮我分析 StarRocks 的存储健康状况

# 应该能够成功执行工具
```

## 📝 完整配置示例

假设你的中心服务器部署在 `192.168.1.100:80`，API Key 是 `abc123xyz`

### ~/.starrocks-mcp/.env

```bash
SR_HOST=localhost
SR_USER=root
SR_PASSWORD=
SR_PORT=9030
CENTRAL_API=http://192.168.1.100:80
CENTRAL_API_TOKEN=abc123xyz
```

### ~/.gemini/settings.json

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["/home/disk5/dingkai/.starrocks-mcp/starrocks-mcp.js"],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "",
        "SR_PORT": "9030",
        "CENTRAL_API": "http://192.168.1.100:80",
        "CENTRAL_API_TOKEN": "abc123xyz"
      }
    }
  }
}
```

## 🔧 故障排查

### 问题 1: MCP 服务器显示 Disconnected

**检查中心 API:**
```bash
curl http://YOUR_SERVER_IP:80/health
```

**检查网络连通性:**
```bash
ping YOUR_SERVER_IP
telnet YOUR_SERVER_IP 80
```

### 问题 2: API Key 认证失败

**症状:** 401 Unauthorized

**解决:**
- 确认 API Key 正确（区分大小写）
- 检查 `.env` 和 `settings.json` 中的 API Key 一致
- 查看中心服务器日志

### 问题 3: 工具列表为空

**检查 MCP 配置:**
```bash
cat ~/.gemini/settings.json | jq
```

**重新安装 MCP 客户端:**
```bash
cd /home/disk5/dingkai/github/gemini-cli/starrocks-mcp-server
./install-starrocks-mcp.sh
```

## 🎯 架构说明

```
你的 Gemini CLI (本地)
   ↓ Stdio
MCP Client (~/.starrocks-mcp/)
   ↓ HTTP: GET /api/queries/:tool
   ↓ HTTP: POST /api/analyze/:tool
中心服务器 (192.168.1.100:80)
   ↓ 执行分析
   ↓ 返回报告
显示结果 → 你的屏幕
```

**数据流程:**
1. 你在 Gemini CLI 输入: "分析存储健康"
2. MCP Client 请求中心服务器获取 SQL 定义
3. MCP Client 在本地执行 SQL
4. MCP Client 将结果发送给中心服务器分析
5. 中心服务器返回分析报告
6. Gemini CLI 显示结果

**优势:**
- ✅ 数据不离开本地 (SQL 在本地执行)
- ✅ 分析逻辑集中管理 (只需更新中心服务器)
- ✅ 轻量级客户端 (MCP Client 只有几百行代码)

## 📞 需要帮助?

如有问题,请检查:
1. 中心服务器是否正常运行
2. 网络是否可达
3. API Key 是否正确
4. 本地数据库是否可连接
