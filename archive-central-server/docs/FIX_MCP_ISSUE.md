# 修复 MCP 无法加载的问题

## 🔍 问题原因

你使用 `bash start-gemini-cli.sh` 启动的是**项目本地构建的 CLI**，而不是全局安装的 `gemini` 命令。

### 问题详情

`start-gemini-cli.sh` 脚本：

- 使用 `./bundle/gemini.js` 或 `./packages/cli/dist/index.js`
- 只加载项目根目录的 `.env` 文件
- **不会自动读取** `~/.gemini/settings.json` 中的 MCP 配置

而你的 MCP 配置在：

```
~/.gemini/settings.json
```

所以本地 CLI 看不到 MCP 服务器配置。

---

## ✅ 解决方案 1：使用全局 Gemini CLI（推荐）⭐

直接使用全局安装的 `gemini` 命令，它会自动读取 `~/.gemini/settings.json`：

```bash
# 不要使用
bash start-gemini-cli.sh

# 直接使用全局命令
gemini

# 或者指定模型
gemini -m deepseek-chat --provider deepseek
```

### 验证

```bash
# 启动 Gemini
gemini

# 在 Gemini 中执行
> /mcp-list-servers    # 应该看到 starrocks-expert
> /mcp-list-tools      # 应该看到 3 个工具
```

---

## ✅ 解决方案 2：修改本地 CLI 配置

如果你必须使用 `start-gemini-cli.sh`，需要配置项目本地的设置文件。

### Step 1: 检查本地 CLI 的配置路径

本地 CLI 可能使用不同的配置路径。让我们检查：

```bash
cd /home/disk5/dingkai/github/gemini-cli

# 启动本地 CLI 并查看配置
node ./bundle/gemini.js auth status 2>&1 | grep -i "settings\|config"
```

### Step 2: 创建项目本地配置

在项目根目录创建 MCP 配置：

```bash
cd /home/disk5/dingkai/github/gemini-cli

# 创建 .gemini 目录（如果不存在）
mkdir -p .gemini

# 复制 MCP 配置
cat > .gemini/settings.json <<'EOF'
{
  "mcpServers": {
    "starrocks-expert": {
      "command": "node",
      "args": ["/home/disk1/dingkai/.starrocks-mcp/thin-mcp-server.js"],
      "env": {
        "SR_HOST": "localhost",
        "SR_USER": "root",
        "SR_PASSWORD": "",
        "SR_PORT": "9030",
        "CENTRAL_API": "http://localhost:80",
        "CENTRAL_API_TOKEN": "demo-key"
      }
    }
  }
}
EOF
```

### Step 3: 修改 start-gemini-cli.sh

在脚本中添加配置路径：

```bash
# 在 load_env() 函数后添加
load_gemini_config() {
    # 设置 Gemini 配置路径为项目本地
    export GEMINI_CONFIG_DIR="$(pwd)/.gemini"
    if [ -f "$GEMINI_CONFIG_DIR/settings.json" ]; then
        print_success "已加载本地 Gemini 配置: $GEMINI_CONFIG_DIR"
    else
        print_warning "本地 Gemini 配置不存在: $GEMINI_CONFIG_DIR"
    fi
}
```

然后在 `main()` 函数中调用它。

---

## ✅ 解决方案 3：创建 MCP 专用启动脚本（最简单）

创建一个新的启动脚本，专门用于启动支持 MCP 的 Gemini CLI：

```bash
cat > /home/disk5/dingkai/github/gemini-cli/start-gemini-with-mcp.sh <<'EOF'
#!/bin/bash

##
# Gemini CLI with MCP Support
# 使用全局 gemini 命令，自动加载 ~/.gemini/settings.json
##

set -e

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🤖 启动 Gemini CLI (支持 MCP)${NC}"
echo ""

# 检查 API 服务器
echo -e "${BLUE}检查中心 API 服务器...${NC}"
if curl -s http://localhost:80/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API 服务器运行正常${NC}"
else
    echo -e "${YELLOW}⚠️  API 服务器未运行${NC}"
    echo "   请先启动: cd /home/disk5/dingkai/github/gemini-cli/mcp-example && ./start-api-server.sh"
    echo ""
fi

# 检查 MCP 配置
echo -e "${BLUE}检查 MCP 配置...${NC}"
if [ -f ~/.gemini/settings.json ]; then
    if jq -e '.mcpServers."starrocks-expert"' ~/.gemini/settings.json > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MCP 配置正确${NC}"
    else
        echo -e "${YELLOW}⚠️  MCP 配置缺失${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Gemini 配置文件不存在${NC}"
fi

echo ""
echo -e "${GREEN}启动 Gemini CLI...${NC}"
echo "提示: 启动后执行 /mcp-list-tools 查看可用工具"
echo ""

# 启动全局 Gemini CLI
gemini "$@"
EOF

chmod +x /home/disk5/dingkai/github/gemini-cli/start-gemini-with-mcp.sh
```

使用方式：

```bash
cd /home/disk5/dingkai/github/gemini-cli
./start-gemini-with-mcp.sh

# 在 Gemini 中
> /mcp-list-tools
```

---

## 🎯 推荐方案对比

| 方案                     | 优点             | 缺点                 | 推荐度     |
| ------------------------ | ---------------- | -------------------- | ---------- |
| **方案 1: 全局 gemini**  | 最简单，直接可用 | 不使用自定义启动脚本 | ⭐⭐⭐⭐⭐ |
| **方案 2: 修改本地配置** | 保留自定义脚本   | 需要维护两份配置     | ⭐⭐⭐     |
| **方案 3: 新建专用脚本** | 兼顾检查和启动   | 多一个脚本文件       | ⭐⭐⭐⭐   |

---

## 📝 立即使用（方案 1）

```bash
# 1. 确保 API 服务器运行
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./start-api-server.sh &

# 2. 直接使用全局 gemini
gemini

# 3. 在 Gemini 中测试
> /mcp-list-servers
> /mcp-list-tools
> 请帮我分析 StarRocks 的存储健康状况
```

---

## 🔍 验证是否成功

### 成功标志

在 Gemini CLI 中：

```
> /mcp-list-servers

输出:
starrocks-expert: connected

> /mcp-list-tools

输出:
starrocks-expert:
  • analyze_storage_health - 全面分析存储健康状况
  • analyze_compaction_health - 分析 Compaction 健康状况
  • analyze_ingestion_health - 分析数据摄取健康状况
```

### 失败标志

```
> /mcp-list-tools

输出:
No tools available
```

说明 MCP 配置未加载或服务器未连接。

---

## 🐛 调试

如果仍然有问题：

```bash
# 1. 检查全局 gemini 是否是最新版本
gemini --version

# 2. 检查配置文件
cat ~/.gemini/settings.json | jq '.mcpServers'

# 3. 运行诊断
cd /home/disk5/dingkai/github/gemini-cli/mcp-example
./diagnose.sh

# 4. 查看 MCP 服务器日志
# 在启动 gemini 后，查看是否有错误输出
```

---

## 总结

**核心问题**：`start-gemini-cli.sh` 启动的本地 CLI 不读取 `~/.gemini/settings.json`

**最佳解决方案**：直接使用全局 `gemini` 命令

```bash
# ❌ 不要用
bash start-gemini-cli.sh

# ✅ 直接用
gemini
```

这样 MCP 配置就能正常加载了！🎉
