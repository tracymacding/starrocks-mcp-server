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

### Claude Desktop

编辑 Claude Desktop 配置文件：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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
        "DB_PASSWORD": "your_password"
      }
    }
  }
}
```

### Cline (VS Code Extension)

在 Cline 设置中添加 MCP Server：

```json
{
  "mcpServers": {
    "starrocks": {
      "command": "node",
      "args": ["/path/to/starrocks-mcp-server/starrocks-mcp.js"]
    }
  }
}
```

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
