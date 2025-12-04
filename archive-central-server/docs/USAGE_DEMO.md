# 方案 C 完整使用演示

## 完整数据流演示

### 场景：用户想要分析 StarRocks 的存储健康状况

---

## Step 1: 用户在 Gemini CLI 中输入

```
用户> 请帮我分析 StarRocks 的存储健康状况
```

---

## Step 2: Gemini AI 决定调用工具

```
Gemini AI 分析：这个请求需要调用 analyze_storage_health 工具
```

---

## Step 3: Gemini CLI 调用本地 Thin MCP Server

```
Gemini CLI → Thin MCP Server (通过 Stdio)
{
  "method": "tools/call",
  "params": {
    "name": "analyze_storage_health",
    "arguments": {}
  }
}
```

---

## Step 4: Thin MCP Server 请求中心 API 获取 SQL

**请求**:
```bash
GET https://api.your-domain.com/api/queries/analyze_storage_health
Headers: X-API-Key: demo-key
```

**响应**:
```json
{
  "tool": "analyze_storage_health",
  "queries": [
    {
      "id": "backends",
      "sql": "SHOW BACKENDS;",
      "description": "BE节点存储信息"
    },
    {
      "id": "tablet_statistics",
      "sql": "SELECT COUNT(*) as total_tablets, ... FROM information_schema.backends;",
      "description": "Tablet统计信息"
    },
    {
      "id": "partition_storage",
      "sql": "SELECT DB_NAME, TABLE_NAME, ... FROM information_schema.partitions_meta ...",
      "description": "分区存储信息"
    }
  ],
  "analysis_endpoint": "/api/analyze/analyze_storage_health"
}
```

---

## Step 5: Thin MCP Server 连接本地 StarRocks 执行 SQL

```javascript
// Thin MCP Server 在客户本地执行

const connection = await mysql.createConnection({
  host: 'localhost',      // 客户本地数据库
  user: 'root',
  password: 'xxx',        // 密码不离开本地
  database: 'information_schema'
});

// 执行每个 SQL
const results = {};

// Query 1: backends
const [backends] = await connection.query('SHOW BACKENDS;');
results.backends = backends;
// 结果: [
//   { IP: '192.168.1.100', MaxDiskUsedPct: '75%', ErrTabletNum: 0, TabletNum: 1500 },
//   { IP: '192.168.1.101', MaxDiskUsedPct: '82%', ErrTabletNum: 2, TabletNum: 1480 }
// ]

// Query 2: tablet_statistics
const [tablet_stats] = await connection.query('SELECT COUNT(*) ...');
results.tablet_statistics = tablet_stats;
// 结果: {
//   total_tablets: 2980,
//   nodes_with_errors: 1,
//   total_error_tablets: 2
// }

// Query 3: partition_storage
const [partitions] = await connection.query('SELECT DB_NAME, ...');
results.partition_storage = partitions;
// 结果: [...] (分区信息数组)

await connection.end();
```

---

## Step 6: Thin MCP Server 发送结果给中心 API 分析

**请求**:
```bash
POST https://api.your-domain.com/api/analyze/analyze_storage_health
Headers:
  X-API-Key: demo-key
  Content-Type: application/json

Body:
{
  "results": {
    "backends": [
      { "IP": "192.168.1.100", "MaxDiskUsedPct": "75%", "ErrTabletNum": "0", ... },
      { "IP": "192.168.1.101", "MaxDiskUsedPct": "82%", "ErrTabletNum": "2", ... }
    ],
    "tablet_statistics": {
      "total_tablets": 2980,
      "nodes_with_errors": 1,
      "total_error_tablets": 2
    },
    "partition_storage": [...]
  }
}
```

---

## Step 7: 中心 API 执行分析逻辑

```javascript
// 在中心 API 服务器上执行（你维护的代码）

analyzeStorageHealth(results) {
  const { backends, tablet_statistics } = results;

  const criticals = [];
  const warnings = [];

  // 分析磁盘使用
  backends.forEach(be => {
    const diskUsage = parseFloat(be.MaxDiskUsedPct.replace('%', ''));

    if (diskUsage >= 95) {
      criticals.push({
        type: 'disk_critical',
        node: be.IP,
        message: `节点 ${be.IP} 磁盘使用率过高 (${be.MaxDiskUsedPct})`
      });
    } else if (diskUsage >= 85) {
      warnings.push({
        type: 'disk_warning',
        node: be.IP,
        message: `节点 ${be.IP} 磁盘使用率较高 (${be.MaxDiskUsedPct})`
      });
    }

    // 检查错误 Tablet
    if (be.ErrTabletNum > 0) {
      warnings.push({
        type: 'error_tablets',
        node: be.IP,
        message: `节点 ${be.IP} 发现 ${be.ErrTabletNum} 个错误Tablet`
      });
    }
  });

  // 计算健康分数
  let score = 100 - criticals.length * 25 - warnings.length * 10;
  score = Math.max(0, score);

  return {
    expert: 'storage',
    storage_health: {
      score: score,
      level: score >= 85 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : 'FAIR',
      status: criticals.length > 0 ? 'CRITICAL' : warnings.length > 0 ? 'WARNING' : 'HEALTHY'
    },
    diagnosis_results: {
      total_issues: criticals.length + warnings.length,
      criticals: criticals,
      warnings: warnings,
      summary: '存储系统发现 1 个警告问题，建议近期处理'
    },
    professional_recommendations: [
      {
        priority: 'MEDIUM',
        title: '磁盘空间监控',
        actions: ['监控磁盘使用率变化趋势', '制定数据清理计划']
      },
      {
        priority: 'MEDIUM',
        title: 'Tablet错误修复',
        actions: ['使用 SHOW PROC "/dbs" 诊断详情', '尝试 ADMIN REPAIR TABLE 自动修复']
      }
    ]
  };
}
```

**API 响应**:
```json
{
  "expert": "storage",
  "timestamp": "2025-01-15T10:30:00Z",
  "storage_health": {
    "score": 80,
    "level": "GOOD",
    "status": "WARNING"
  },
  "diagnosis_results": {
    "total_issues": 2,
    "criticals": [],
    "warnings": [
      {
        "type": "disk_warning",
        "node": "192.168.1.101",
        "message": "节点 192.168.1.101 磁盘使用率较高 (82%)"
      },
      {
        "type": "error_tablets",
        "node": "192.168.1.101",
        "message": "节点 192.168.1.101 发现 2 个错误Tablet"
      }
    ],
    "summary": "存储系统发现 2 个警告问题，建议近期处理"
  },
  "professional_recommendations": [...]
}
```

---

## Step 8: Thin MCP Server 格式化报告

```javascript
// Thin MCP Server 格式化报告

formatAnalysisReport(analysis) {
  let report = '💾 StarRocks 存储专家分析报告\n';
  report += '🟡 健康分数: 80/100 (GOOD)\n';
  report += '📊 状态: WARNING\n\n';
  report += '📋 诊断摘要: 存储系统发现 2 个警告问题，建议近期处理\n';
  report += '🔍 发现问题: 2个\n\n';
  report += '🟡 警告:\n';
  report += '  1. 节点 192.168.1.101 磁盘使用率较高 (82%)\n';
  report += '  2. 节点 192.168.1.101 发现 2 个错误Tablet\n\n';
  report += '💡 专业建议 (前3条):\n';
  report += '  1. [MEDIUM] 磁盘空间监控\n';
  report += '  2. [MEDIUM] Tablet错误修复\n\n';
  report += '📋 详细数据请查看 JSON 输出部分';
  return report;
}
```

---

## Step 9: 返回给 Gemini CLI

```javascript
// Thin MCP Server → Gemini CLI

return {
  content: [
    {
      type: 'text',
      text: formatAnalysisReport(analysis)  // 格式化的文本报告
    },
    {
      type: 'text',
      text: JSON.stringify(analysis, null, 2)  // 完整的 JSON 数据
    }
  ]
};
```

---

## Step 10: 用户看到分析结果

```
💾 StarRocks 存储专家分析报告
🟡 健康分数: 80/100 (GOOD)
📊 状态: WARNING

📋 诊断摘要: 存储系统发现 2 个警告问题，建议近期处理
🔍 发现问题: 2个

🟡 警告:
  1. 节点 192.168.1.101 磁盘使用率较高 (82%)
  2. 节点 192.168.1.101 发现 2 个错误Tablet

💡 专业建议 (前3条):
  1. [MEDIUM] 磁盘空间监控
  2. [MEDIUM] Tablet错误修复

📋 详细数据请查看 JSON 输出部分

{
  "expert": "storage",
  "timestamp": "2025-01-15T10:30:00Z",
  "storage_health": {
    "score": 80,
    "level": "GOOD",
    "status": "WARNING"
  },
  ...完整 JSON 数据
}
```

---

## 关键优势体现

### 1. ✅ 零网络配置
```
客户端:
- 只需要访问 https://api.your-domain.com ✅
- 无需暴露任何端口 ✅
- 无需配置防火墙 ✅
```

### 2. ✅ SQL 逻辑在服务端（零维护升级）
```
如果你想优化 SQL 查询:
1. 修改 index-expert-api.js 的 getQueriesForTool() 方法
2. 重启 API 服务器
3. 所有客户自动使用新 SQL ✅ (客户无需任何操作!)
```

### 3. ✅ 分析逻辑在服务端（零维护升级）
```
如果你想修改分析算法:
1. 修改 index-expert-api.js 的 analyzeStorageHealth() 方法
2. 重启 API 服务器
3. 所有客户自动获得新分析 ✅ (客户无需任何操作!)
```

### 4. ✅ 数据安全性
```
数据库密码: 只在客户本地 ~/.starrocks-mcp/.env ✅
SQL 执行: 在客户本地 StarRocks ✅
发送数据: 只有查询结果（用于分析）
```

### 5. ✅ 客户端极简
```
Thin MCP Server 代码: ~250 行 ✅
职责: 只负责转发（获取 SQL → 执行 → 发送结果）
升级频率: 极少需要（除非 API 协议变更）
```

---

## 实际使用步骤总结

### 服务端（你操作一次）

```bash
# 1. 配置 API
cd mcp-example
export API_PORT=80
export API_KEY=your-secure-api-key

# 2. 启动 API 服务器
npm run start:api

# 或使用 PM2（生产环境推荐）
pm2 start index-expert-api.js --name starrocks-api

# 3. 配置 Nginx 反向代理（HTTPS）
# 4. 提供安装脚本给客户
```

### 客户端（客户操作一次）

```bash
# 1. 下载并运行安装脚本
curl -O https://api.your-domain.com/install-starrocks-mcp.sh
chmod +x install-starrocks-mcp.sh
./install-starrocks-mcp.sh

# 2. 配置数据库连接
nano ~/.starrocks-mcp/.env
# 修改: SR_HOST, SR_USER, SR_PASSWORD
# 修改: CENTRAL_API=https://api.your-domain.com
# 修改: CENTRAL_API_TOKEN=client-token-xxx

# 3. 配置 Gemini CLI
nano ~/.gemini/settings.json
# 添加 mcpServers 配置（参考 ~/.starrocks-mcp/GEMINI_CONFIG_EXAMPLE.json）

# 4. 启动 Gemini CLI 并使用
gemini
> /mcp-list-tools
> 请帮我分析 StarRocks 的存储健康状况
```

### 日常使用（客户）

```bash
# 启动 Gemini CLI
gemini

# 自然语言诊断
> 请帮我分析存储健康状况
> 检查一下 Compaction 是否正常
> 最近的数据导入有问题吗？

# 直接调用工具
> /mcp-call-tool starrocks-expert analyze_storage_health {}
```

### 升级维护（你操作）

```bash
# 添加新 SQL 或修改分析逻辑
nano index-expert-api.js

# 重启服务
pm2 restart starrocks-api

# ✅ 所有客户自动获得新功能！
```

---

## 完整文档

- **SOLUTION_C_GUIDE.md** - 完整的部署和使用指南（~1100 行）
- **ARCHITECTURE.md** - 架构设计文档
- **USER_GUIDE.md** - 所有模式的用户指南

---

**方案 C 实现完成！** 🎉
