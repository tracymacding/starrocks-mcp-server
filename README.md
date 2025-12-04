# StarRocks MCP Server

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**StarRocks MCP Server** 是一个实现了 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的服务器，为 AI 客户端提供 StarRocks 数据库的智能诊断和分析能力。

## 🎯 功能特性

- ✅ **MCP 协议支持**: 完整实现 MCP Stdio Server 协议
- ✅ **数据库连接**: 连接 StarRocks 数据库执行 SQL 查询
- ✅ **智能诊断**: 集成 StarRocks Expert 系统进行性能分析
- ✅ **多客户端支持**: 兼容 Claude Desktop、Cline、任何 MCP 客户端
- ✅ **日志系统**: 完整的请求/响应日志记录
- ✅ **安全性**: 支持环境变量配置，保护敏感信息

## 📦 架构

```
┌─────────────────────┐
│  MCP Client         │  (Claude Desktop, Cline, etc.)
│  (AI Application)   │
└──────────┬──────────┘
           │ MCP Protocol (Stdio)
           │
┌──────────▼──────────┐
│ StarRocks MCP Server│  (This Project)
│  - Tool Execution   │
│  - SQL Connection   │
│  - API Integration  │
└──────────┬──────────┘
           │
           ├─────────────────────┐
           │                     │
┌──────────▼──────────┐  ┌──────▼─────────────┐
│  StarRocks Database │  │ StarRocks Expert   │
│  (MySQL Protocol)   │  │ (Central API)      │
└─────────────────────┘  └────────────────────┘
```

## 🚀 快速开始

### 前置要求

- **Node.js** >= 18.0.0
- **StarRocks** 数据库实例
- **StarRocks Expert** 中心服务（可选，用于高级分析）
- **DeepSeek API Key**（可选，用于 LLM 分析）

### 安装

#### 方法 1: 使用安装脚本（推荐）

```bash
# 克隆项目
git clone https://github.com/your-org/starrocks-mcp-server.git
cd starrocks-mcp-server

# 运行安装脚本
./install-starrocks-mcp.sh
```

安装脚本会自动：
- 创建 `~/.starrocks-mcp/` 目录
- 复制所有必要文件
- 安装 npm 依赖
- 生成配置文件模板

#### 方法 2: 手动安装

```bash
# 安装依赖
npm install

# 复制配置文件
cp .env.example .env

# 编辑配置
vim .env
```

### 配置

编辑 `.env` 文件，配置数据库连接和 API 地址：

```bash
# StarRocks 数据库配置
DB_HOST=127.0.0.1
DB_PORT=9030
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=your_database

# StarRocks Expert 中心 API（可选）
CENTRAL_API=http://localhost:80

# DeepSeek API Key（可选，用于 LLM 分析）
DEEPSEEK_API_KEY=your_deepseek_api_key

# 日志配置
ENABLE_LOGGING=true
```

### 运行

作为 MCP Server 运行（Stdio 模式）：

```bash
node starrocks-mcp.js
```

## 🔌 MCP 客户端配置

StarRocks MCP Server 支持任何实现了 MCP 协议的客户端。以下是主流客户端的详细配置指南。

### 配置前准备

在配置任何客户端之前，请先准备以下信息：

1. **StarRocks 数据库连接信息**:
   - 主机地址 (`DB_HOST`): 例如 `127.0.0.1`
   - 端口 (`DB_PORT`): 默认 `9030`
   - 用户名 (`DB_USER`): 例如 `root`
   - 密码 (`DB_PASSWORD`): 数据库密码

2. **StarRocks Expert 中心 API** (可选，用于高级分析):
   - API 地址 (`CENTRAL_API`): 例如 `http://localhost:80`
   - API Token (`CENTRAL_API_TOKEN`): 向管理员索取

3. **MCP Server 安装路径**:
   ```bash
   # 找到 starrocks-mcp.js 的完整路径
   cd /path/to/starrocks-mcp-server
   pwd
   # 记录输出的路径，例如: /home/user/starrocks-mcp-server
   ```

---

### 方式 1: Gemini CLI 配置

[Gemini CLI](https://github.com/google-gemini/gemini-cli) 是 Google 官方的命令行工具，原生支持 MCP 协议。根据是否需要使用 DeepSeek 作为 LLM 提供商，有两种配置方式：

#### 方式 1A: 原生 Gemini CLI（仅支持 Google Gemini）

如果你只需要使用 Google Gemini API，可以安装原生版本。

##### 1A.1 安装原生 Gemini CLI

```bash
# 全局安装 Gemini CLI
npm install -g @google/generative-ai-cli

# 验证安装
gemini --version
```

##### 1A.2 配置 Google Gemini API Key

```bash
# 设置 API Key（从 https://aistudio.google.com/apikey 获取）
export GOOGLE_API_KEY="your-google-api-key-here"

# 或添加到 shell 配置文件
echo 'export GOOGLE_API_KEY="your-google-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

##### 1A.3 配置 MCP Server

创建或编辑 `~/.gemini/settings.json` 文件：

```bash
mkdir -p ~/.gemini
nano ~/.gemini/settings.json
```

添加以下配置（**根据实际情况修改路径和连接信息**）：

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": [
        "/path/to/starrocks-mcp-server/starrocks-mcp.js"
      ],
      "env": {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "9030",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

##### 1A.4 验证配置

```bash
# 启动 Gemini CLI
gemini

# 检查 MCP 连接状态
> /mcp list

# 预期输出：
# ✓ starrocks-expert: node .../starrocks-mcp.js (stdio) - Connected
#   Tools: 34

# 测试工具
> 帮我查看 StarRocks 的存储健康状况
```

**注意**：原生 Gemini CLI 仅支持 Google Gemini API，不支持 DeepSeek 等其他 LLM 提供商。如需使用 DeepSeek，请使用方式 1B。

---

#### 方式 1B: 定制版 Gemini CLI（支持 DeepSeek，推荐）

[定制版 Gemini CLI](https://github.com/tracymacding/gemini-cli) 扩展了原生版本，**支持 DeepSeek 等多种 LLM 提供商**，成本更低且性能优秀。

##### 1B.1 安装定制版 Gemini CLI

```bash
# 克隆定制版 Gemini CLI 项目
git clone https://github.com/tracymacding/gemini-cli.git
cd gemini-cli

# 安装依赖
npm install

# 构建项目
npm run build

# 全局链接（方便直接使用 gemini 命令）
npm link
```

##### 1B.2 验证安装

```bash
gemini --version
# 应该显示版本号，例如: 0.8.0
```

##### 1B.3 配置 DeepSeek API Key

**DeepSeek 优势**：
- ✅ 比 Google Gemini 便宜约 90%（¥1/百万 tokens 输入）
- ✅ 性能优秀（DeepSeek-V3）
- ✅ 中文支持更好

**方式 A: 使用 .env 文件（推荐）**

```bash
cd gemini-cli

# 创建 .env 文件
cat > .env <<'EOF'
# DeepSeek API Key
# 获取地址: https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
EOF
```

**方式 B: 设置环境变量**

```bash
# 临时设置（当前终端有效）
export DEEPSEEK_API_KEY="sk-your-deepseek-api-key-here"

# 永久设置（添加到 shell 配置）
echo 'export DEEPSEEK_API_KEY="sk-your-deepseek-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

##### 1B.4 配置 MCP Server

创建或编辑 `~/.gemini/settings.json` 文件：

```bash
mkdir -p ~/.gemini
nano ~/.gemini/settings.json
```

添加以下配置（**根据实际情况修改路径和连接信息**）：

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": [
        "/path/to/starrocks-mcp-server/starrocks-mcp.js"
      ],
      "env": {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "9030",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

**配置说明**：

| 参数 | 说明 | 示例 |
|------|------|------|
| `args[0]` | MCP Server 脚本的完整路径 | `/home/user/starrocks-mcp-server/starrocks-mcp.js` |
| `DB_HOST` | StarRocks 数据库地址 | `127.0.0.1` 或 `192.168.1.100` |
| `DB_PORT` | StarRocks 查询端口 | `9030` (默认) |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | 留空或填写实际密码 |
| `CENTRAL_API` | Expert 服务地址（可选） | `http://localhost:80` |
| `CENTRAL_API_TOKEN` | API 认证 Token（可选） | 向管理员索取 |

##### 1B.5 验证配置

**使用启动脚本（推荐）**：

```bash
cd gemini-cli
./start-gemini-cli.sh
```

**或手动启动**：

```bash
# 启动 Gemini CLI 并使用 DeepSeek
gemini --provider deepseek -m deepseek-chat

# 检查 MCP 连接状态
> /mcp list

# 预期输出：
# ✓ starrocks-expert: node .../starrocks-mcp.js (stdio) - Connected
#   Tools: 34

# 查看可用工具
> /tools

# 测试工具
> 帮我分析 StarRocks 的存储健康状况
```

**预期输出示例**：

```
🤖 启动 Gemini CLI (DeepSeek + MCP)
====================================

✅ 已加载 .env 配置
✅ DeepSeek API Key: sk-76b76...
📡 检查中心 API 服务器...
   ✅ API 服务器运行正常
🔧 检查 MCP 配置...
   ✅ MCP 服务器已连接

🚀 启动 Gemini CLI...

💡 使用的功能:
   • DeepSeek 模型 (deepseek-chat)
   • MCP 工具 (StarRocks 诊断)
```

---

### 方式 2: Claude Desktop 配置

[Claude Desktop](https://claude.ai/download) 是 Anthropic 官方的桌面应用，原生支持 MCP 协议。

#### 2.1 找到配置文件

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### 2.2 编辑配置文件

```bash
# macOS/Linux
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 或者使用你喜欢的编辑器
```

添加以下配置：

```json
{
  "mcpServers": {
    "starrocks": {
      "command": "node",
      "args": [
        "/path/to/starrocks-mcp-server/starrocks-mcp.js"
      ],
      "env": {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "9030",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

**⚠️ 注意**：
- 必须使用**完整的绝对路径**，不能使用 `~` 或相对路径
- Windows 路径使用双反斜杠：`C:\\Users\\...\\starrocks-mcp.js`

#### 2.3 验证配置

1. 重启 Claude Desktop
2. 打开新对话
3. 在输入框上方应该能看到 🔌 图标，点击查看已连接的 MCP 服务器
4. 输入测试命令：

```
请列出 StarRocks MCP Server 提供的所有工具
```

Claude 应该会显示所有可用的诊断工具。

---

### 方式 3: Claude Code CLI 配置

[Claude Code](https://claude.ai/claude-code) 是 Anthropic 官方的命令行 AI 编程工具，原生支持 MCP 协议。

#### 3.1 安装 Claude Code CLI

**快速安装**：

Claude Code 提供了一键安装脚本，支持 macOS、Linux 和 Windows：

**macOS/Linux**：

```bash
# 一键安装
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell)**：

```powershell
# 一键安装
irm https://claude.ai/install.ps1 | iex
```

**验证安装**：

```bash
# 检查 Claude Code 是否已安装
claude --version

# 或直接启动
claude
```

**其他访问方式**：

除了 CLI，Claude Code 还支持：
- **VS Code 扩展**: [Marketplace](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
- **JetBrains IDEs**: [Plugin Repository](https://plugins.jetbrains.com/plugin/27310-claude-code-beta-)
- **Web 版本**: [claude.ai/code](https://claude.ai/code)

**详细文档**: [code.claude.com/docs](https://code.claude.com/docs/en/overview)

#### 3.2 配置 MCP Server

**定位配置文件位置**：

- **macOS/Linux**: `~/.config/claude-code/settings.json`
- **Windows**: `%APPDATA%\claude-code\settings.json`

**编辑配置文件**：

```bash
# macOS/Linux
mkdir -p ~/.config/claude-code
nano ~/.config/claude-code/settings.json

# Windows (PowerShell)
New-Item -Path "$env:APPDATA\claude-code" -ItemType Directory -Force
notepad "$env:APPDATA\claude-code\settings.json"
```

**添加以下配置**（根据实际情况修改）：

```json
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": [
        "/path/to/starrocks-mcp-server/starrocks-mcp.js"
      ],
      "env": {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "9030",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

**配置说明**：

| 参数 | 说明 | 示例 |
|------|------|------|
| `command` | 执行命令（通常是 `node`） | `node` |
| `args[0]` | MCP Server 脚本的完整路径 | `/home/user/starrocks-mcp-server/starrocks-mcp.js` |
| `DB_HOST` | StarRocks 数据库地址 | `127.0.0.1` |
| `DB_PORT` | StarRocks 查询端口 | `9030` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | 留空或填写密码 |
| `CENTRAL_API` | Expert 服务地址（可选） | `http://localhost:80` |
| `CENTRAL_API_TOKEN` | API Token（可选） | 向管理员索取 |

**查找 MCP Server 路径**：

```bash
# 定位 starrocks-mcp.js 文件
find ~ -name "starrocks-mcp.js" 2>/dev/null

# 或者，如果你知道安装目录
cd /path/to/starrocks-mcp-server
pwd
# 输出完整路径，例如: /home/user/starrocks-mcp-server
```

#### 3.3 验证配置

1. **启动 Claude Code CLI**：

   ```bash
   # 方式 1: 直接启动
   claude

   # 方式 2: 在项目目录中启动
   cd /path/to/your/project
   claude
   ```

2. **检查 MCP Server 连接**：

   在 Claude Code 中输入：

   ```
   列出所有可用的 MCP 工具
   ```

   或者：

   ```
   /tools
   ```

3. **测试 StarRocks 诊断功能**：

   ```
   帮我分析 StarRocks 的存储健康状况
   ```

   或者：

   ```
   查询最近 1 小时的慢查询
   ```

4. **预期结果**：

   Claude Code 应该能够：
   - ✅ 自动连接到 StarRocks MCP Server
   - ✅ 列出所有可用工具（34 个 StarRocks 诊断工具）
   - ✅ 执行 SQL 查询并返回分析结果
   - ✅ 提供专业的诊断建议

#### 3.4 故障排查

**问题 1**: 提示 "MCP Server not found" 或 "Connection failed"

**解决方法**：

```bash
# 检查配置文件是否存在
cat ~/.config/claude-code/settings.json

# 检查配置文件 JSON 格式是否正确
cat ~/.config/claude-code/settings.json | jq .

# 手动测试 MCP Server 是否能启动
export DB_HOST=127.0.0.1
export DB_PORT=9030
export DB_USER=root
export DB_PASSWORD=
export CENTRAL_API=http://localhost:80
export CENTRAL_API_TOKEN=your_token

node /path/to/starrocks-mcp-server/starrocks-mcp.js
# 应该启动并等待输入
```

**问题 2**: 工具执行失败

**解决方法**：

- 检查 StarRocks 数据库连接：
  ```bash
  mysql -h 127.0.0.1 -P 9030 -u root -e "SELECT 1"
  ```

- 检查中心 API 服务器（如果使用）：
  ```bash
  curl http://localhost:80/health
  ```

**问题 3**: 配置文件路径不正确

**macOS/Linux 查找配置目录**：

```bash
# 查找 Claude Code 配置目录
find ~ -type d -name "claude-code" 2>/dev/null | grep config

# 列出配置目录内容
ls -la ~/.config/claude-code/
```

---

### 方式 4: Cline (原 Claude Dev) 配置

[Cline](https://github.com/cline/cline) 是一个流行的 VS Code AI 编程助手扩展。

#### 4.1 安装扩展

1. 打开 VS Code
2. 搜索并安装 "Cline" 扩展

#### 4.2 配置 MCP Server

打开 Cline 设置，添加 MCP 服务器：

```json
{
  "cline.mcpServers": {
    "starrocks": {
      "command": "node",
      "args": [
        "/path/to/starrocks-mcp-server/starrocks-mcp.js"
      ],
      "env": {
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "9030",
        "DB_USER": "root",
        "DB_PASSWORD": ""
      }
    }
  }
}
```

---

### 方式 5: 通用 MCP 客户端配置

对于其他支持 MCP 协议的客户端，通常需要配置：

```json
{
  "command": "node",
  "args": ["/path/to/starrocks-mcp-server/starrocks-mcp.js"],
  "env": {
    "DB_HOST": "127.0.0.1",
    "DB_PORT": "9030",
    "DB_USER": "root",
    "DB_PASSWORD": "your_password"
  }
}
```

---

### 配置验证清单

完成配置后，使用以下清单验证：

- [ ] MCP Server 能成功启动（没有报错）
- [ ] 客户端显示 "Connected" 状态
- [ ] 可以看到工具列表（通常 30+ 个工具）
- [ ] 能成功执行一个测试工具（例如查询数据库版本）
- [ ] 日志文件正常生成（`./logs/` 目录）

### 故障排查

如果连接失败，请按顺序检查：

1. **检查 Node.js 版本**：
   ```bash
   node --version  # 必须 >= 18.0.0
   ```

2. **检查文件路径**：
   ```bash
   ls -la /path/to/starrocks-mcp.js  # 文件必须存在
   ```

3. **检查数据库连接**：
   ```bash
   mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p
   ```

4. **查看日志**：
   ```bash
   tail -f /path/to/starrocks-mcp-server/logs/starrocks-mcp-*.log
   ```

5. **手动测试 MCP Server**：
   ```bash
   cd /path/to/starrocks-mcp-server
   node starrocks-mcp.js
   # 应该启动并等待 MCP 协议输入
   ```

详细的故障排查步骤请参考 [完整安装指南](https://github.com/tracymacding/gemini-cli/blob/main/STARROCKS_EXPERT_完全安装指南.md)

## 📚 可用工具

MCP Server 提供以下诊断工具：

| 工具名称 | 功能描述 |
|---------|---------|
| `get_recent_slow_queries` | 获取慢查询列表 |
| `analyze_query_profile` | 深度分析查询 Profile |
| `generate_html_report` | 生成 HTML 性能报告 |
| `analyze_query_latency` | 分析查询延迟和 QPS |
| `get_query_profile` | 获取查询执行 Profile |

详细文档请参考 [QUICK_START.md](QUICK_START.md)

## 🔧 开发

### 项目结构

```
starrocks-mcp-server/
├── starrocks-mcp.js              # MCP Server 主文件
├── package.json                   # 项目配置
├── .env.example                   # 配置模板
├── install-starrocks-mcp.sh      # 安装脚本
├── README.md                      # 本文件
├── QUICK_START.md                 # 快速开始指南
├── LOGGING.md                     # 日志文档
└── logs/                          # 日志目录
```

### 测试

```bash
# 运行测试
npm test

# 测试日志系统
node test-logging.js
```

### 日志

服务器会自动记录所有请求和响应：

- **位置**: `./logs/`
- **格式**: 按日期分文件（`starrocks-mcp-YYYY-MM-DD.log`）
- **内容**: 工具调用、SQL 查询、API 请求、错误信息

详细文档: [LOGGING.md](LOGGING.md)

## 🤝 集成 StarRocks Expert

StarRocks MCP Server 可以连接到 [StarRocks Expert](https://github.com/tracymacding/operation-experts) 中心服务，获得更强大的分析能力：

```bash
# 1. 启动 StarRocks Expert 服务
cd /path/to/operation-experts/starrocks-expert
pm2 start src/server-solutionc.js --name starrocks-expert

# 2. 配置 MCP Server
echo "CENTRAL_API=http://localhost:80" >> .env

# 3. 启动 MCP Server
node starrocks-mcp.js
```

## 📖 相关文档

- [快速开始指南](QUICK_START.md)
- [日志系统文档](LOGGING.md)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [StarRocks Expert 项目](https://github.com/tracymacding/operation-experts)

## 🐛 故障排查

### MCP Server 无法连接

1. 检查 Node.js 版本：`node --version`（需要 >= 18）
2. 检查环境变量：`cat .env`
3. 查看日志：`tail -f logs/starrocks-mcp-*.log`

### 数据库连接失败

1. 测试数据库连接：
```bash
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p
```

2. 检查防火墙规则
3. 确认数据库用户权限

### 工具执行失败

1. 检查日志中的错误信息
2. 确认 StarRocks Expert 服务是否运行
3. 验证 API Token 是否正确

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本项目
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送到分支：`git push origin feature/your-feature`
5. 提交 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 👥 作者

- 维护者：[@tracymacding](https://github.com/tracymacding)
- 贡献者：查看 [Contributors](../../graphs/contributors)

## 🔗 相关链接

- [StarRocks 官网](https://www.starrocks.io/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Desktop](https://claude.ai/download)
- [Operation Experts 项目](https://github.com/tracymacding/operation-experts)

---

如有问题或建议，请提交 [Issue](../../issues)
