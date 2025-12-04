# StarRocks Expert System

StarRocks 专家系统 - 基于 MCP 协议的智能诊断和优化建议系统

## 📊 专家列表

### 1. Storage Expert (存储专家) ✅

**文件**: `storage-expert.js`

**功能**:

- 磁盘使用分析
- Tablet 健康检查
- 副本状态监控
- 数据分布分析
- 存储放大率分析

**工具**:

- `analyze_storage_amplification` - 存储空间放大分析

---

### 2. Compaction Expert (压缩专家) ✅

**文件**: `compaction-expert-integrated.js`

**功能**:

- Compaction Score 分析
- 高 CS 分区检测
- Compaction 线程监控
- 压缩性能优化建议

**工具**:

- `get_high_compaction_partitions` - 获取高 CS 分区
- `analyze_high_compaction_score` - 分析高 CS 原因

---

### 3. Ingestion Expert (数据摄入专家) ✅

**文件**: `ingestion-expert.js`

**功能**:

- 数据摄入作业状态分析
- 数据摄入失败率监控
- 数据摄入队列积压检测
- 数据摄入性能优化建议

**工具**:

- `analyze_table_import_frequency` - 分析表数据摄入频率

---

### 4. Cache Expert (缓存专家) ✅

**文件**: `cache-expert.js`

**功能**:

- Data Cache 命中率分析
- 缓存容量监控
- 缓存抖动检测
- Metadata Cache 分析

**工具**:

- `analyze_cache_jitter` - 缓存抖动分析
- `analyze_metadata_cache` - 元数据缓存分析

---

### 5. Cloud Native Cost Expert (成本专家) ✅

**文件**: `cloud-native-cost-expert.js`

**功能**:

- 对象存储成本分析
- API 调用成本统计
- 数据传输成本计算
- 缓存节省成本评估
- 多云厂商支持 (AWS S3, 阿里云 OSS, 腾讯云 COS)

**工具**:

- `analyze_cloud_cost` - 云原生成本分析

**数据来源**:

- 存储空间: `information_schema.partitions_meta` (STORAGE_SIZE)
- GET 请求: `fslib_read_io_size_count`
- PUT 请求: `fslib_s3_single/multi_upload_size_count`
- LIST 请求: `fslib_list_latency_count`
- DELETE 请求: `fslib_fs_delete_files`
- 数据传输: `fslib_read/write_io_size_sum`

---

### 6. Transaction Expert (事务专家) ✅

**文件**: `transaction-expert.js`

**功能**:

- 运行中事务监控
- 长事务检测
- 事务失败率分析
- 事务冲突检测
- 提交延迟分析

**工具**:

- `analyze_transactions` - 事务系统分析

**数据来源**:

- 运行中事务: `SHOW PROC '/transactions/<db>/running'` (遍历所有数据库)
- Prometheus 指标: 失败率、冲突率、延迟

---

### 7. Log Expert (日志专家) 🚧

**文件**: `log-expert.js`

**状态**: 框架已创建，功能开发中

**计划功能**:

- FE 日志分析 (fe.log, fe.warn.log)
- BE 日志分析 (be.INFO, be.WARNING, be.ERROR)
- 错误模式识别 (OOM, 超时, 连接失败)
- 性能问题检测 (慢查询, GC 暂停)
- 审计日志分析
- 日志趋势分析

**工具**:

- `analyze_logs` - 日志分析 (待实现)

---

### 8. Memory Expert (内存专家) 🚧

**文件**: `memory-expert.js`

**状态**: 框架已创建，功能开发中

**计划功能**:

- 内存使用率分析 (FE/BE)
- 堆内存监控 (Heap/Non-Heap)
- GC 频率和暂停时间分析
- 内存泄漏检测
- OOM 风险评估
- 查询内存消耗分析
- 直接内存监控
- 内存池使用分析

**工具**:

- `analyze_memory` - 内存分析 (待实现)

**关键指标**:

- `jvm_memory_bytes_used{area="heap"}` - JVM 堆内存使用
- `jvm_gc_collection_seconds_count` - GC 次数
- `jvm_gc_pause_seconds` - GC 暂停时间
- `process_resident_memory_bytes` - 进程常驻内存
- `starrocks_be_process_mem_bytes` - BE 进程内存
- `starrocks_be_query_mem_bytes` - 查询内存消耗

---

## 🔧 专家协调器

**文件**: `expert-coordinator.js`

**功能**:

- 管理所有专家模块
- 协调跨模块诊断
- 整合优化建议
- 统一工具注册

**跨模块规则**:

- 存储空间不足影响 Compaction 效率
- Compaction 线程不足与高 CS 分区关联
- 导入失败与存储空间关系
- 导入队列积压与 Compaction 资源竞争

---

## 📈 使用示例

### 通过 MCP 工具调用

```javascript
// 成本分析
const result = await callTool('analyze_cloud_cost', {
  time_range: '24h',
  cloud_provider: 'aliyun_oss',
});

// 事务分析
const result = await callTool('analyze_transactions', {
  include_details: true,
});

// 缓存分析
const result = await callTool('analyze_cache_jitter', {
  time_range: '1h',
});
```

### 直接调用专家

```javascript
import { StarRocksCloudNativeCostExpert } from './experts/cloud-native-cost-expert.js';

const costExpert = new StarRocksCloudNativeCostExpert();
const result = await costExpert.analyzeCost(connection, '24h', 'aliyun_oss');
```

---

## 🎯 规则引擎

每个专家都包含专业的诊断规则:

```javascript
rules: {
  // 阈值配置
  thresholds: {
    warning: 80,
    critical: 95
  },

  // 诊断规则
  patterns: {
    pattern_name: {
      condition: (data) => ...,
      severity: 'critical',
      impact: '...',
    }
  }
}
```

---

## 📊 健康评分

所有专家提供 0-100 的健康评分:

- **90-100**: Excellent (优秀)
- **70-89**: Good (良好)
- **50-69**: Fair (一般)
- **30-49**: Poor (较差)
- **0-29**: Critical (严重)

---

## 🔍 专业术语

每个专家维护专业术语表:

```javascript
terminology: {
  term: 'definition and explanation';
}
```

---

## 📝 开发指南

### 创建新专家

1. 创建专家类文件 `{name}-expert.js`
2. 实现核心方法:
   - `diagnose()` - 诊断分析
   - `collectData()` - 数据收集
   - `performDiagnosis()` - 执行诊断
   - `generateRecommendations()` - 生成建议
   - `calculateHealthScore()` - 计算评分
   - `getTools()` - 工具定义
   - `getToolHandlers()` - 工具处理器

3. 注册到 `expert-coordinator.js`

### 最佳实践

- ✅ 使用真实数据源 (数据库查询, Prometheus)
- ✅ 避免估算值,使用精确指标
- ✅ 提供可操作的建议
- ✅ 包含详细的错误处理
- ✅ 维护专业术语表
- ✅ 生成格式化报告

---

## 🚀 路线图

### 已完成

- [x] Storage Expert
- [x] Compaction Expert
- [x] Ingestion Expert
- [x] Cache Expert
- [x] Cloud Native Cost Expert
- [x] Transaction Expert
- [x] Log Expert (框架)
- [x] Memory Expert (框架)

### 计划中

- [ ] Query Expert (查询分析)
- [ ] Schema Expert (表结构优化)
- [ ] Backup Expert (备份恢复)
- [ ] Replication Expert (副本管理)
- [ ] Resource Group Expert (资源组分析)
- [ ] Network Expert (网络分析)

---

## 📄 License

Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
