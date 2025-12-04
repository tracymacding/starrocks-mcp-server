# StarRocks Expert 系统架构选择

## 🎯 问题说明

你有 **11 个 expert** 提供 **33 个工具**，但是它们的架构与 Solution C 的 "Thin Client" 模式不完全兼容。

### 原始 Expert 架构

```javascript
// expert 内部实现
class CacheExpert {
  async analyze(connection) {
    // 1. 直接使用数据库连接
    const [rows] = await connection.query("SELECT ...");

    // 2. 内部分析
    const analysis = this.analyzeData(rows);

    // 3. 返回结果
    return analysis;
  }
}
```

**特点**：
- ✅ Expert 自己管理所有查询逻辑
- ✅ SQL 查询在 expert 内部，可以动态调整
- ✅ 逻辑完整，无需拆分
- ❌ 需要数据库连接
- ❌ 无法实现 "零维护升级"（客户端也包含逻辑）

### Solution C 架构（Thin Client）

```javascript
// 中心 API 返回 SQL 定义
GET /api/queries/analyze_cache
→ { queries: [{ id: "metrics", sql: "SELECT ..." }] }

// 客户端执行 SQL
const results = await connection.query(sql);

// 发送结果回 API 分析
POST /api/analyze/analyze_cache
Body: { results: {...} }
→ 返回分析结果
```

**特点**：
- ✅ 客户端极简（~250 行）
- ✅ "零维护升级"（只需更新 API）
- ✅ 数据库密码不离开客户端
- ❌ 需要拆分 SQL 定义和分析逻辑
- ❌ 原始 expert 需要大量重构

---

## 📊 三种解决方案对比

### 方案 1：保持原始架构（本地 MCP Server）⭐

**使用**: `index-expert-enhanced.js` 或 `index-expert-http.js`

**架构**:
```
Gemini CLI
   ↓ (Stdio/HTTP)
MCP Server (本地)
   ├─ Expert Coordinator
   ├─ 10 个 Experts
   └─ 直接连接 StarRocks
```

**代码**:
```bash
# 配置 MCP (已完成)
node ./bundle/gemini.js mcp list
# 应该看到 starrocks-expert

# 使用
./start-deepseek-with-mcp.sh
> /mcp list
> 使用任何工具
```

**优点**:
- ✅ 所有 33 个工具立即可用
- ✅ 无需修改任何代码
- ✅ 逻辑完整，功能强大
- ✅ 已经测试通过

**缺点**:
- ❌ 客户端包含所有逻辑（expert 代码）
- ❌ 升级需要更新客户端
- ❌ 不是"零维护升级"

**结论**: **推荐用于当前开发和使用** ⭐

---

### 方案 2：手动扩展 Solution C（部分工具）

**使用**: `index-expert-api.js` (当前实现)

**架构**:
```
Gemini CLI
   ↓ (Stdio)
Thin MCP Server (极简)
   ↓ (HTTP)
Central API Server
   ├─ 手动实现的 3 个工具
   └─ SQL 定义 + 分析逻辑
```

**实现步骤**:

对于每个要添加的工具（如 cache_expert）：

1. **在 index-expert-api.js 添加工具定义**:
```javascript
{
  name: 'analyze_cache_performance',
  description: '分析 Data Cache 性能',
  inputSchema: { ... }
}
```

2. **添加 SQL 查询定义**:
```javascript
getQueriesForTool(toolName) {
  if (toolName === 'analyze_cache_performance') {
    return [
      {
        id: 'cache_metrics',
        sql: 'SELECT ... FROM metrics_table',
        description: '缓存指标'
      }
    ];
  }
}
```

3. **添加分析逻辑**:
```javascript
analyzeCachePerformance(results) {
  const { cache_metrics } = results;

  // 分析逻辑
  const hitRatio = ...;

  return {
    cache_health: { ... },
    diagnosis_results: { ... }
  };
}
```

**优点**:
- ✅ "零维护升级"
- ✅ 客户端极简
- ✅ 完全控制实现

**缺点**:
- ❌ 需要手动重写每个工具
- ❌ 工作量大（33 个工具）
- ❌ 可能丢失原始 expert 的复杂逻辑

**结论**: 适合精选几个核心工具

---

### 方案 3：完全重构 Expert（最理想，但工作量大）

**目标**: 让每个 expert 都支持 "SQL 定义分离"

**修改每个 Expert**:
```javascript
class CacheExpert {
  // 新增：返回 SQL 定义
  getSQLDefinitions(toolName) {
    return [
      { id: "metrics", sql: "SELECT ..." }
    ];
  }

  // 修改：接受查询结果而不是连接
  analyzeFromResults(toolName, results) {
    // 使用 results 而不是自己查询
    return this.analyze(results);
  }

  // 保留原始方法（向后兼容）
  async analyze(connection) {
    const results = await this.queryData(connection);
    return this.analyzeFromResults(results);
  }
}
```

**优点**:
- ✅ 所有工具都支持 Solution C
- ✅ "零维护升级"
- ✅ 向后兼容原始架构

**缺点**:
- ❌ 需要修改所有 10 个 expert
- ❌ 工作量非常大
- ❌ 需要深入理解每个 expert

**结论**: 理想方案，但不现实

---

## 🎯 我的推荐

### 短期（立即可用）：方案 1

```bash
# 你已经配置好了，直接使用
cd /home/disk5/dingkai/github/gemini-cli
./start-deepseek-with-mcp.sh

# 所有 33 个工具都可用
> /mcp list
> 使用任何 expert 工具
```

**当前配置**:
- ✅ Thin MCP Server 已安装
- ✅ 本地 expert 代码已存在
- ✅ DeepSeek 已配置
- ✅ 可以立即使用

### 中期（按需添加）：方案 2

如果你发现某些工具**经常使用**且**查询逻辑简单**，可以手动迁移到 Solution C：

1. 选择 2-3 个核心工具（如 storage, compaction, ingestion）
2. 手动实现它们的 SQL 定义和分析逻辑
3. 其他工具继续使用方案 1

### 长期（可选）：混合模式

- **核心工具**（2-3个）→ Solution C（零维护升级）
- **其他工具**（30个）→ 本地 expert（功能完整）

---

## 📝 当前文件说明

### 已创建的文件

1. **index-expert-api.js** (基础版)
   - 3 个工具：storage, compaction, ingestion
   - Solution C 架构
   - 手动实现的 SQL 和分析

2. **index-expert-api-full.js** (尝试版)
   - 加载所有 33 个工具
   - 但无法提供 SQL 定义（expert 不支持）
   - 仅作为工具目录使用

3. **index-expert-enhanced.js** (完整功能)
   - 原始架构
   - 所有 33 个工具完全可用
   - 通过本地 MCP 使用

### 如何选择

| 需求 | 使用文件 | 模式 |
|------|---------|------|
| **所有功能立即可用** | index-expert-enhanced.js | 本地 MCP |
| **零维护升级（少量工具）** | index-expert-api.js | Solution C |
| **查看所有工具列表** | index-expert-api-full.js | 工具目录 |

---

## 🚀 快速开始（推荐）

### Step 1: 使用完整功能（方案 1）

```bash
cd /home/disk5/dingkai/github/gemini-cli
./start-deepseek-with-mcp.sh
```

在 CLI 中：
```
> /mcp list
# 查看所有可用工具

> 请帮我分析缓存性能
# AI 会自动调用 analyze_cache_performance

> 请分析存储健康状况
# AI 会自动调用相应工具
```

### Step 2: 查看所有可用工具

```bash
# 启动完整版 API（只查看工具列表）
cd mcp-example
export API_PORT=3003 API_KEY=demo-key
node index-expert-api-full.js &

# 查看所有工具
curl http://localhost:3003/api/tools | jq '.tools[].name'

# 查看所有 expert
curl http://localhost:3003/api/experts | jq .
```

---

## 💡 总结

1. **现在就用**: 方案 1（本地 MCP，所有功能）
2. **理解差异**: Solution C 需要重构 expert
3. **未来可选**: 混合模式（核心工具用 Solution C）

**当前状态**: ✅ 所有 33 个工具都可以通过 `./start-deepseek-with-mcp.sh` 使用！

不需要额外配置，立即可用。
