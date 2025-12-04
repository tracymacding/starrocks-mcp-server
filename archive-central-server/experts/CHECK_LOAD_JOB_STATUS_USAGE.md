# check_load_job_status 工具使用文档

## 工具概述

`check_load_job_status` 是一个强大的导入任务诊断工具，支持根据 **Label** 或 **TxnId** 查询导入任务状态，智能分析失败原因并提供针对性的解决方案。

## 功能特性

✅ **灵活查询**

- 支持通过 Label 或 TxnId 查询
- **Label 支持模糊匹配**：自动处理系统添加的前缀（如 `insert_`, `load_`, `broker_load_` 等）
- 混合查询历史表和内存表，确保数据完整性
- 可选数据库名称过滤，提高查询准确性

✅ **详细信息展示**

- 任务基本信息（状态、类型、数据库、表名）
- 时间信息（创建时间、开始时间、完成时间、各阶段耗时）
- 数据统计（行数、字节数、过滤率）
- 性能指标（吞吐量、导入速度）

✅ **智能失败分析**

- 自动识别失败类别（超时、资源、数据质量、网络等）
- 分析根本原因
- 提供详细的分析说明

✅ **针对性优化建议**

- 基于失败类别的具体解决方案
- 优先级分类（高/中/低）
- 相关工具推荐
- 调试信息和 SQL 命令

## 参数说明

| 参数名                    | 类型    | 必需 | 说明                                                                                                                                                                                |
| ------------------------- | ------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                   | string  | 否   | 导入任务的 Label（与 txn_id 二选一）                                                                                                                                                |
| `txn_id`                  | number  | 否   | 导入任务的事务 ID（与 label 二选一）                                                                                                                                                |
| `database_name`           | string  | 否   | 数据库名称（用于精确匹配）                                                                                                                                                          |
| `include_recommendations` | boolean | 否   | 是否包含优化建议（默认 true）                                                                                                                                                       |
| `use_llm_analysis`        | boolean | 否   | 是否使用 LLM 智能分析（默认 **true**）。**支持多种 LLM**：DeepSeek (优先)、OpenAI、Gemini。自动检测环境变量并选择可用的 API。会增加 1-3 秒响应时间。设置为 false 可使用快速规则匹配 |

⚠️ **注意**:

- `label` 和 `txn_id` 必须提供至少一个
- **默认启用 LLM 分析**，支持以下 LLM API（按优先级排序）：
  1. **DeepSeek** - 设置 `DEEPSEEK_API_KEY` 或 `DEEPSEEK_KEY`
  2. **OpenAI** - 设置 `OPENAI_API_KEY`
  3. **Gemini** - 设置 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`
- 自动检测可用的 API Key 并选择最优先的 LLM
- 如果没有配置任何 API Key 或调用失败，会自动回退到规则匹配
- 如需快速分析，可设置 `use_llm_analysis: false`

### Label 模糊匹配说明

工具使用 **LIKE 模糊匹配**查询 Label，可以自动匹配系统添加的各种前缀：

**支持的前缀示例**：

- `insert_` - INSERT 导入
- `load_` - LOAD 导入
- `broker_load_` - Broker Load
- `routine_load_` - Routine Load
- 其他自定义前缀

**匹配规则**：

- 用户提供：`abc-123-456`
- 可匹配到：
  - `insert_abc-123-456`
  - `load_abc-123-456`
  - `broker_load_abc-123-456`
  - `my_prefix_abc-123-456`

**最佳实践**：

- 直接提供原始 Label，无需关心前缀
- 如果 Label 可能有歧义，建议同时提供 `database_name` 参数

## 使用示例

### 示例 1: 通过 Label 查询

```bash
# 查询指定 Label 的导入任务
./bundle/gemini.js -m deepseek:deepseek-chat -p "帮我分析 0199d016-69aa-74ac-a60a-cfcf92eac4e1 这个 label 代表的导入任务失败原因"
```

工具会自动识别并调用 `check_load_job_status` 工具：

```json
{
  "label": "0199d016-69aa-74ac-a60a-cfcf92eac4e1"
}
```

### 示例 2: 通过 TxnId 查询

```bash
# 查询指定 TxnId 的导入任务
./bundle/gemini.js -m deepseek:deepseek-chat -p "查询事务 ID 12345 的导入任务状态"
```

工具参数：

```json
{
  "txn_id": 12345
}
```

### 示例 3: 带数据库过滤

```bash
# 在特定数据库中查询 Label
./bundle/gemini.js -m deepseek:deepseek-chat -p "在 tpcds_1t 数据库中查询 label xxx 的导入任务"
```

工具参数：

```json
{
  "label": "xxx",
  "database_name": "tpcds_1t"
}
```

### 示例 4: 不包含优化建议

```bash
# 仅查询状态，不需要优化建议
./bundle/gemini.js -m deepseek:deepseek-chat -p "查询 label xxx 的状态，不需要建议"
```

工具参数：

```json
{
  "label": "xxx",
  "include_recommendations": false
}
```

### 示例 5: LLM 智能分析（默认） ⭐

```bash
# 默认启用 LLM 分析，支持多种 LLM
# 方式 1: 使用 DeepSeek (推荐，优先级最高)
export DEEPSEEK_API_KEY="your-deepseek-key"
./bundle/gemini.js -m deepseek:deepseek-chat -p "分析 label xxx 的失败原因"

# 方式 2: 使用 OpenAI
export OPENAI_API_KEY="your-openai-key"
./bundle/gemini.js -m deepseek:deepseek-chat -p "分析 label xxx 的失败原因"

# 方式 3: 使用 Gemini
export GEMINI_API_KEY="your-gemini-key"
./bundle/gemini.js -m deepseek:deepseek-chat -p "分析 label xxx 的失败原因"
```

工具参数（默认启用 LLM）：

```json
{
  "label": "xxx"
  // use_llm_analysis 默认为 true，无需显式设置
}
```

**LLM 分析的优势**：

- 🎯 更准确的失败原因识别，避免关键词误判（如 txn_id 不会被误判为事务问题）
- 📊 基于上下文的智能分类
- 💡 更详细的根因分析
- 🔧 更针对性的建议
- 🔄 支持多种 LLM，自动选择可用的 API

**支持的 LLM（按优先级）**：

1. **DeepSeek** - 高性价比，推荐使用
2. **OpenAI** - GPT-4o-mini，稳定可靠
3. **Gemini** - Google Gemini 2.0 Flash

**注意事项**：

- 自动检测并使用配置的 API Key
- 会增加 1-3 秒的响应时间（调用 API）
- 如果所有 API 都不可用或调用失败，会自动 fallback 到快速规则匹配

### 示例 6: 禁用 LLM 使用快速规则匹配

```bash
# 如需快速响应，可禁用 LLM 分析
./bundle/gemini.js -m deepseek:deepseek-chat -p "快速分析 label xxx，不使用 LLM"
```

工具参数：

```json
{
  "label": "xxx",
  "use_llm_analysis": false
}
```

## 输出报告示例

```
═══════════════════════════════════════════════════════════════
          📊 导入任务状态分析报告
═══════════════════════════════════════════════════════════════

【基本信息】
  • Label: 0199d016-69aa-74ac-a60a-cfcf92eac4e1
  • Job ID: 123456
  • 数据库: test_db
  • 表名: test_table
  • 导入类型: INSERT
  • 状态: ❌ CANCELLED
  • 进度: ETL:100%; LOAD:0%
  • 优先级: NORMAL
  • 数据源: loads_history

【时间信息】
  • 创建时间: 2025-01-10 10:00:00
  • 导入开始: 2025-01-10 10:00:05
  • 导入完成: 2025-01-10 10:05:30
  • 导入耗时: 5分25秒
  • 总耗时: 5分30秒

【数据统计】
  • 扫描行数: 1,000,000
  • 扫描字节: 95.37 MB (95.37 MB)
  • 导入行数: 950,000
  • 过滤行数: 50,000
  • 过滤率: 5.00%

【性能指标】
  • 吞吐量: 17.56 MB/s
  • 导入速度: 184,331 行/秒

【错误信息】
  ❌ 错误消息:
     [E1008]Reached timeout=300000ms @user

  📋 失败原因:
     导入任务超时，可能是资源不足或BRPC延迟

【失败原因分析】
  • 分类: ⏱️ TIMEOUT
  • 根本原因: 导入任务超时
  • 详细分析:
    - 任务执行时间超过了配置的超时阈值
    - 可能的原因: 资源不足、BRPC 延迟、线程池瓶颈
  • 相关问题:
    - 建议使用 analyze_reached_timeout 工具深度分析

【优化建议】
  1. 超时问题 [HIGH]
     🔴 使用 analyze_reached_timeout 工具进行深度分析
     🔴 检查 BE 节点资源使用情况（CPU、IO、内存）
     🔴 检查线程池状态（Async delta writer、Memtable flush）
     🔴 如果是 BRPC 延迟问题，考虑增加 BE 节点或优化网络
     🔴 临时解决方案：增加超时时间 (SET PROPERTY "timeout" = "7200")

  2. 调试工具 [LOW]
     🟢 使用 TRACKING_SQL 查看详细错误信息
     🟢 如果需要分析 Profile，使用 analyze_load_channel_profile 工具

───────────────────────────────────────────────────────────────
分析耗时: 156ms
═══════════════════════════════════════════════════════════════
```

## 失败分类覆盖

工具支持智能识别以下失败类别：

| 分类              | 关键词                              | 根本原因             |
| ----------------- | ----------------------------------- | -------------------- |
| **Timeout**       | timeout, reached timeout            | 导入任务超时         |
| **Resource**      | memory, out of memory, no available | 资源不足             |
| **Data Quality**  | column, type, format, parse         | 数据格式或类型不匹配 |
| **Network**       | connect, network, broken pipe       | 网络连接问题         |
| **File**          | file, path, not found               | 文件访问问题         |
| **Transaction**   | transaction, txn                    | 事务处理异常         |
| **Configuration** | invalid, illegal                    | 配置参数错误         |
| **Permission**    | permission, denied                  | 权限不足             |
| **Cancelled**     | STATE=CANCELLED                     | 任务被取消           |

## 与其他工具配合使用

### 1. 与 analyze_reached_timeout 配合

当 `check_load_job_status` 识别出 **Timeout** 类别的失败时，会推荐使用 `analyze_reached_timeout` 工具进行深度分析：

```bash
# 第一步：查询任务状态
./bundle/gemini.js -p "分析 label xxx 的失败原因"

# 第二步：根据建议深度分析
./bundle/gemini.js -p "使用 analyze_reached_timeout 工具分析当前导入慢问题"
```

### 2. 与 analyze_load_channel_profile 配合

当需要分析性能瓶颈时，可以获取 LoadChannel Profile 进行详细分析：

```bash
# 第一步：获取 query_id
./bundle/gemini.js -p "查询 label xxx 的状态"

# 第二步：分析 Profile
./bundle/gemini.js -p "使用 analyze_load_channel_profile 分析 query_id yyy 的性能"
```

## 数据源说明

工具会按以下顺序查询：

1. **`_statistics_.loads_history`** (优先)
   - 持久化的历史数据
   - 包含已完成和失败的任务
   - 数据更完整

2. **`information_schema.loads`** (备用)
   - 内存中的实时数据
   - 包含正在执行的任务
   - 最新数据可能还未同步到历史表

## 常见问题

### Q1: 提示 "未找到匹配的导入任务"

**可能原因**：

- Label 或 TxnId 输入错误
- 任务数据已过期被清理
- 数据库名称不匹配

**解决方法**：

```sql
-- 查看最近的导入任务
SELECT LABEL, TXN_ID, DB_NAME, TABLE_NAME, STATE, CREATE_TIME
FROM information_schema.loads
ORDER BY CREATE_TIME DESC
LIMIT 10;

-- 或查看历史
SELECT LABEL, TXN_ID, DB_NAME, TABLE_NAME, STATE, CREATE_TIME
FROM _statistics_.loads_history
WHERE CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY CREATE_TIME DESC
LIMIT 10;
```

### Q2: 如何获取导入任务的 Label？

**方法 1**: 从导入语句的返回结果中获取

```sql
LOAD LABEL test_db.my_label_20250110
...
```

**方法 2**: 查询系统表

```sql
-- 查看最近的导入任务
SELECT LABEL, STATE, TYPE, CREATE_TIME
FROM information_schema.loads
WHERE DB_NAME = 'test_db'
ORDER BY CREATE_TIME DESC
LIMIT 5;
```

**方法 3**: 从错误日志中提取

```
Error: Load job [label:xxx] failed
```

### Q3: 分析结果中没有优化建议？

**原因**: 任务状态为 `FINISHED`（成功完成）

工具只对**失败或取消**的任务提供优化建议。成功的任务会显示完整的性能数据，但不会有失败分析和建议部分。

## 最佳实践

1. **快速诊断失败**

   ```bash
   # 直接提供 Label，获取完整诊断报告
   ./bundle/gemini.js -p "分析导入任务 label xxx 的失败原因"
   ```

2. **性能监控**

   ```bash
   # 定期检查导入任务性能
   ./bundle/gemini.js -p "查询最近完成的导入任务状态"
   ```

3. **故障排查流程**

   ```
   1. 使用 check_load_job_status 获取失败原因
   2. 根据失败分类查看建议
   3. 使用推荐的深度分析工具
   4. 应用优化方案
   5. 重试导入任务
   ```

4. **结合 TRACKING_SQL**
   ```sql
   -- 如果报告中有 TRACKING_SQL，手动执行查看详细错误
   SELECT ...  -- 从报告中复制完整的 TRACKING_SQL
   ```

## 技术实现

### SQL 查询逻辑

```sql
-- 1. 优先查询历史表（使用 LIKE 模糊匹配 Label）
SELECT ... FROM _statistics_.loads_history
WHERE LABEL LIKE ? AND DB_NAME = ?
ORDER BY CREATE_TIME DESC LIMIT 1;
-- 参数：LIKE '%label' (匹配任何前缀)

-- 2. 如果未找到，查询内存表
SELECT ... FROM information_schema.loads
WHERE LABEL LIKE ? AND DB_NAME = ?
ORDER BY CREATE_TIME DESC LIMIT 1;
-- 参数：LIKE '%label' (匹配任何前缀)
```

**查询说明**：

- 使用 `LIKE '%label'` 实现模糊匹配
- 可匹配任何前缀的 Label（如 `insert_label`, `load_label`）
- 按创建时间降序排序，确保获取最新的任务

### 失败分析算法

```javascript
1. 提取 ERROR_MSG 和 REASON
2. 使用关键词匹配识别失败类别
3. 根据类别生成详细分析
4. 提供优先级排序的优化建议
```

### 性能指标计算

```javascript
// 吞吐量 (MB/s)
throughput = scan_bytes / (1024 * 1024) / load_duration_seconds;

// 导入速度 (行/秒)
rows_per_second = scan_rows / load_duration_seconds;

// 过滤率 (%)
filter_ratio = ((filtered_rows + unselected_rows) / scan_rows) * 100;
```

## 更新日志

### v1.5.0 (2025-01-11)

- ✅ **支持多种 LLM**：新增 DeepSeek 和 OpenAI 支持，不再限制于 Gemini
- ✅ 智能 API 选择：自动检测环境变量，按优先级选择可用的 LLM（DeepSeek > OpenAI > Gemini）
- ✅ 环境变量支持：`DEEPSEEK_API_KEY` / `DEEPSEEK_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`
- ✅ 无缝 fallback：任一 LLM 不可用时自动尝试下一个，最后回退到规则匹配
- ✅ 更新文档，说明多 LLM 支持和优先级

### v1.4.0 (2025-01-11)

- ✅ **默认启用 LLM 分析**：将 `use_llm_analysis` 默认值改为 `true`，提供更准确的失败原因分析
- ✅ 自动降级机制：如果未配置 API Key 或调用失败，自动回退到规则匹配
- ✅ 更新文档和示例，说明默认行为

### v1.3.0 (2025-01-11)

- ✅ **LLM 智能分析**：新增 `use_llm_analysis` 参数，支持使用 Gemini API 进行更准确的失败原因分析
- ✅ 优先级匹配策略：改进规则匹配逻辑，按优先级从高到低匹配，避免误分类
- ✅ 自动 fallback 机制：LLM 分析失败时自动回退到规则匹配
- ✅ 支持环境变量配置：`GEMINI_API_KEY` 或 `GOOGLE_API_KEY`
- ✅ 更新工具文档，添加 LLM 分析使用说明

### v1.2.0 (2025-01-11)

- ✅ **精确关键词匹配**：改进失败分析关键词，避免误判
  - data_quality: `format` → `format error`
  - network: `connect` → `connection refused/reset`
  - file: `file` → `file not found`
  - permission: `permission` → `permission denied`
- ✅ 优先级匹配策略：timeout 最高优先级，确保不被误分类

### v1.1.0 (2025-01-11)

- ✅ **Label 模糊匹配**：改进 Label 查询逻辑，支持自动匹配系统添加的前缀
- ✅ 查询方式从 `LABEL = ?` 改为 `LABEL LIKE '%?'`
- ✅ 用户无需关心系统前缀，直接提供原始 Label 即可
- ✅ 移除 SQL 查询中的非存在字段

### v1.0.0 (2025-01-10)

- ✅ 初始版本发布
- ✅ 支持 Label 和 TxnId 查询
- ✅ 智能失败分析（10+ 失败类别）
- ✅ 优化建议生成
- ✅ 混合数据源查询
- ✅ 性能指标计算

## 相关工具

- `analyze_reached_timeout` - Reached Timeout 问题深度分析
- `analyze_load_channel_profile` - LoadChannel Profile 性能分析
- `check_stream_load_tasks` - Stream Load 任务检查
- `check_routine_load_config` - Routine Load 配置检查
- `analyze_table_import_frequency` - 表级导入频率分析

## 反馈与支持

如果遇到问题或有改进建议，请通过以下方式反馈：

- 提交 Issue
- 联系开发团队
- 查看 StarRocks 官方文档
