# Solution C 迁移指南

## 目标

将现有的所有 Expert 改造为支持 **Solution C 架构**，实现：
- ✅ **Thin MCP Server 执行 SQL**（客户端）
- ✅ **Central API 分析结果**（服务器端）
- ✅ **零维护升级**（只需更新服务器代码）

---

## 架构对比

### 当前架构（index-expert-api-complete.js）
```
Gemini → Thin MCP → Central API Server
                           ↓
                    连接数据库执行 SQL
                           ↓
                    运行 Expert 分析
                           ↓
                    返回完整结果
```

### Solution C 架构（目标）
```
Gemini → Thin MCP → GET /api/queries/:tool (获取 SQL 定义)
                ↓
        Thin MCP 执行 SQL → StarRocks 数据库
                ↓
        Thin MCP → POST /api/analyze/:tool (发送结果)
                ↓
        Central API 分析 → 返回分析报告
```

---

## Expert 改造要求

每个 Expert 需要新增两个方法：

### 1. `getQueriesForTool(toolName, args)`

返回工具需要执行的 SQL 查询列表。

**签名：**
```javascript
/**
 * @param {string} toolName - 工具名称
 * @param {object} args - 工具参数
 * @returns {Array<{id: string, sql: string, description: string, required: boolean}>}
 */
getQueriesForTool(toolName, args = {}) {
  // ...
}
```

**示例返回：**
```javascript
[
  {
    id: 'backends',
    sql: 'SHOW BACKENDS;',
    description: 'BE节点信息',
    required: true
  },
  {
    id: 'partitions',
    sql: 'SELECT * FROM information_schema.partitions_meta LIMIT 100;',
    description: '分区元数据',
    required: false
  }
]
```

### 2. `analyzeQueryResults(toolName, results, args)`

分析客户端返回的查询结果。

**签名：**
```javascript
/**
 * @param {string} toolName - 工具名称
 * @param {object} results - SQL 执行结果，格式: { query_id: rows[] }
 * @param {object} args - 原始工具参数
 * @returns {Promise<object>} 分析结果
 */
async analyzeQueryResults(toolName, results, args = {}) {
  // ...
}
```

**示例 results 格式：**
```javascript
{
  backends: [
    { IP: '192.168.1.1', MaxDiskUsedPct: '85.2%', ... },
    { IP: '192.168.1.2', MaxDiskUsedPct: '90.1%', ... }
  ],
  partitions: [
    { DB_NAME: 'test', TABLE_NAME: 'users', ... }
  ]
}
```

---

## 改造示例：Storage Expert

### 改造前（原始代码）

```javascript
class StarRocksStorageExpert {
  async diagnose(connection, includeDetails = true) {
    // 1. 直接执行 SQL
    const [backends] = await connection.query('SHOW BACKENDS;');
    const [partitions] = await connection.query('SELECT * FROM ...');

    // 2. 分析数据
    const diagnosis = this.performStorageDiagnosis({ backends, partitions });

    return { diagnosis, ... };
  }
}
```

### 改造后（支持 Solution C）

```javascript
class StarRocksStorageExpert {
  // ✅ 新增：返回 SQL 定义
  getQueriesForTool(toolName, args) {
    if (toolName === 'storage_expert_analysis') {
      return [
        {
          id: 'backends',
          sql: 'SHOW BACKENDS;',
          description: 'BE节点信息',
          required: true
        },
        {
          id: 'partitions',
          sql: 'SELECT * FROM information_schema.partitions_meta LIMIT 100;',
          description: '分区元数据',
          required: false
        }
      ];
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // ✅ 新增：分析客户端结果
  async analyzeQueryResults(toolName, results, args) {
    if (toolName === 'storage_expert_analysis') {
      const { backends, partitions } = results;

      // 验证必需数据
      if (!backends) {
        throw new Error('Missing required data: backends');
      }

      // 执行分析（纯逻辑，不访问数据库）
      const diagnosis = this.performStorageDiagnosis({ backends, partitions });

      return {
        expert: this.name,
        timestamp: new Date().toISOString(),
        diagnosis_results: diagnosis,
        ...
      };
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // ✅ 保留：兼容传统模式
  async diagnose(connection, includeDetails = true) {
    // 1. 获取 SQL 定义
    const queries = this.getQueriesForTool('storage_expert_analysis', {});

    // 2. 执行 SQL
    const results = {};
    for (const query of queries) {
      const [rows] = await connection.query(query.sql);
      results[query.id] = rows;
    }

    // 3. 分析结果
    return this.analyzeQueryResults('storage_expert_analysis', results, { includeDetails });
  }
}
```

---

## 改造步骤

### Step 1: 提取 SQL 查询

找到 Expert 中所有的 `connection.query()` 调用，提取 SQL 语句。

**Before:**
```javascript
const [backends] = await connection.query('SHOW BACKENDS;');
const [partitions] = await connection.query(`
  SELECT * FROM information_schema.partitions_meta
  WHERE MAX_CS >= 100
  LIMIT 20;
`);
```

**After:**
```javascript
getQueriesForTool(toolName, args) {
  return [
    { id: 'backends', sql: 'SHOW BACKENDS;', required: true },
    {
      id: 'partitions',
      sql: `SELECT * FROM information_schema.partitions_meta
            WHERE MAX_CS >= 100 LIMIT 20;`,
      required: true
    }
  ];
}
```

### Step 2: 重构分析逻辑

将数据库操作与分析逻辑分离。

**Before:**
```javascript
async diagnose(connection) {
  const [backends] = await connection.query('...');  // 数据库操作
  const analysis = this.analyze(backends);            // 分析逻辑
  return analysis;
}
```

**After:**
```javascript
// 纯分析逻辑（不依赖数据库连接）
analyzeQueryResults(toolName, results, args) {
  const { backends } = results;
  const analysis = this.analyze(backends);
  return analysis;
}
```

### Step 3: 支持多工具

如果一个 Expert 提供多个工具，使用 switch 语句：

```javascript
getQueriesForTool(toolName, args) {
  switch (toolName) {
    case 'storage_expert_analysis':
      return this.getStorageAnalysisQueries(args);

    case 'analyze_storage_amplification':
      return this.getStorageAmplificationQueries(args);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

analyzeQueryResults(toolName, results, args) {
  switch (toolName) {
    case 'storage_expert_analysis':
      return this.analyzeStorageHealth(results, args);

    case 'analyze_storage_amplification':
      return this.analyzeAmplification(results, args);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
```

### Step 4: 处理动态 SQL

如果 SQL 需要根据参数动态生成：

```javascript
getQueriesForTool(toolName, args) {
  const { database_name, table_name } = args;

  let whereClause = "DB_NAME NOT IN ('information_schema')";
  const params = [];

  if (database_name) {
    whereClause += ' AND DB_NAME = ?';
    params.push(database_name);
  }

  if (table_name) {
    whereClause += ' AND TABLE_NAME = ?';
    params.push(table_name);
  }

  return [
    {
      id: 'partitions',
      sql: `SELECT * FROM information_schema.partitions_meta WHERE ${whereClause};`,
      params: params,  // ✅ 返回参数，供客户端使用
      description: '分区信息'
    }
  ];
}
```

### Step 5: 错误处理

在 `analyzeQueryResults` 中验证数据：

```javascript
analyzeQueryResults(toolName, results, args) {
  // 验证必需数据
  const requiredQueries = this.getQueriesForTool(toolName, args)
    .filter(q => q.required)
    .map(q => q.id);

  for (const queryId of requiredQueries) {
    if (!results[queryId] || results[queryId].length === 0) {
      throw new Error(`Missing required data: ${queryId}`);
    }
  }

  // 执行分析...
}
```

---

## Central API 集成

改造完成后，Expert 会自动被 Central API 识别。

### 自动检测

`index-expert-api-solutionc.js` 会自动检测 Expert 是否支持 Solution C：

```javascript
getQueriesForTool(toolName, args) {
  const expert = this.findExpertForTool(toolName);

  if (typeof expert.getQueriesForTool !== 'function') {
    throw new Error(`Expert does not support Solution C mode`);
  }

  return expert.getQueriesForTool(toolName, args);
}
```

---

## 测试

### 1. 测试 SQL 定义

```bash
curl http://localhost:80/api/queries/storage_expert_analysis
```

**Expected Output:**
```json
{
  "tool": "storage_expert_analysis",
  "queries": [
    {
      "id": "backends",
      "sql": "SHOW BACKENDS;",
      "description": "BE节点信息",
      "required": true
    }
  ],
  "analysis_endpoint": "/api/analyze/storage_expert_analysis"
}
```

### 2. 测试分析功能

```bash
curl -X POST http://localhost:80/api/analyze/storage_expert_analysis \
  -H "Content-Type: application/json" \
  -d '{
    "results": {
      "backends": [{"IP": "192.168.1.1", "MaxDiskUsedPct": "85%"}]
    },
    "args": {}
  }'
```

---

## 迁移检查清单

- [ ] 提取所有 SQL 查询到 `getQueriesForTool()`
- [ ] 实现 `analyzeQueryResults()` 方法
- [ ] 重构分析逻辑（移除数据库依赖）
- [ ] 保留 `diagnose()` 方法以兼容传统模式
- [ ] 添加数据验证和错误处理
- [ ] 测试 `/api/queries/:tool` 端点
- [ ] 测试 `/api/analyze/:tool` 端点
- [ ] 更新工具文档

---

## 需要改造的 Expert 列表

1. ✅ `storage-expert.js` - **示例已完成** (storage-expert-solutionc.js)
2. ⬜ `compaction-expert-integrated.js`
3. ⬜ `ingestion-expert.js`
4. ⬜ `cache-expert.js`
5. ⬜ `transaction-expert.js`
6. ⬜ `log-expert.js`
7. ⬜ `memory-expert.js`
8. ⬜ `query-perf-expert.js`
9. ⬜ `operate-expert.js`
10. ⬜ `table-schema-expert.js`

---

## 下一步

1. **使用示例启动测试**：
   ```bash
   node index-expert-api-solutionc.js
   ```

2. **测试 Storage Expert（Solution C 版本）**：
   - 修改 `expert-coordinator.js`，导入 `StorageExpertSolutionC`
   - 测试 GET /api/queries/storage_expert_analysis
   - 测试 POST /api/analyze/storage_expert_analysis

3. **逐个改造其他 Expert**：
   - 按照本指南改造每个 Expert
   - 改造完一个，测试一个
   - 保持向后兼容

---

## 参考文件

- **示例实现**: `experts/storage-expert-solutionc.js`
- **中心服务器**: `index-expert-api-solutionc.js`
- **原始 Expert**: `experts/storage-expert.js`
