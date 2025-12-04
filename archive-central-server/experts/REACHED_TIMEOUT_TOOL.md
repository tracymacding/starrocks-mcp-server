# Reached Timeout 问题分析工具说明

## 概述

基于《导入慢问题排查 SOP.pdf》文档实现的 StarRocks 导入 Reached Timeout 问题综合诊断工具。

## 工具名称

`analyze_reached_timeout`

## 功能特性

### 1. 多维度分析

- ✅ **架构自动检测**：自动识别存算一体/存算分离架构类型
- ✅ **资源使用分析**：CPU、IO、网络使用情况
- ✅ **BRPC 监控分析**：tablet_writer_open/add_chunks/add_segment 延迟
- ✅ **线程池状态分析**：
  - Async delta writer
  - Memtable flush
  - Segment replicate sync（存算一体）
  - Segment flush（存算一体）
- ✅ **瓶颈识别**：自动识别资源、BRPC、线程池瓶颈
- ✅ **解决方案推荐**：提供具体的配置调整建议和 SQL 命令

### 2. 适用场景

- 导入任务报错 `[E1008]Reached timeout`
- 导入速度慢但未超时
- 需要优化导入性能
- 需要排查导入瓶颈

### 3. 支持架构

- **存算一体**（replicated storage）
- **存算分离**（shared-data）

## 使用方法

### 基本用法

```javascript
// 使用默认参数（自动检测架构，分析最近30分钟）
await expert.analyzeReachedTimeout(connection);

// 手动指定架构类型（可选，默认自动检测）
await expert.analyzeReachedTimeout(connection, {
  architecture: 'shared_data', // 或 'replicated'
});

// 指定时间范围
await expert.analyzeReachedTimeout(connection, {
  time_range_minutes: 60, // 分析最近60分钟
});

// 指定 BE 节点
await expert.analyzeReachedTimeout(connection, {
  be_host: '192.168.1.100:8060',
});

// 完整参数示例
await expert.analyzeReachedTimeout(connection, {
  be_host: '192.168.1.100:8060',
  architecture: 'replicated',
  time_range_minutes: 30,
});
```

### 参数说明

| 参数                 | 类型   | 默认值   | 说明                                                          |
| -------------------- | ------ | -------- | ------------------------------------------------------------- |
| `be_host`            | string | null     | BE 节点地址（可选）                                           |
| `architecture`       | string | 自动检测 | 架构类型：'replicated' 或 'shared_data'（可选，默认自动检测） |
| `time_range_minutes` | number | 30       | 分析时间范围（分钟）                                          |

## 分析报告内容

报告包含以下部分：

### 1. 分析摘要

- 发现问题数量
- 资源/BRPC/线程池问题状态
- 瓶颈识别结果
- 优化建议数量

### 2. 资源使用分析

- CPU 使用率（平均/最大/P95）
- IO 使用率（本地磁盘 + S3）
- 网络使用情况

### 3. BRPC 监控分析

- 线程池使用情况
- 各接口延迟指标：
  - tablet_writer_open
  - tablet_writer_add_chunks
  - tablet_writer_add_segment

### 4. 线程池监控分析

每个线程池的详细指标：

- 总线程数 / 使用中线程数 / 队列积压
- 任务排队耗时 / 执行耗时
- 各环节细分耗时

### 5. 瓶颈分析

自动识别的瓶颈分类：

- 资源瓶颈
- BRPC 瓶颈
- 线程池瓶颈

### 6. 优化建议

按优先级排序的建议：

- 🔴 **HIGH**：紧急问题，需立即处理
- 🟡 **MEDIUM**：重要优化项
- 🟢 **LOW**：次要优化项
- ℹ️ **INFO**：参考信息

每条建议包含：

- 问题描述
- 具体操作步骤
- 配置 SQL 命令

## 输出示例

```
================================================================================
🔍 StarRocks 导入 Reached Timeout 问题分析报告
================================================================================

📅 分析时间: 2025-01-10T10:30:00.000Z
🏗️  架构类型: 存算一体
⏱️  时间范围: 30分钟
📊 整体状态: ⚠️ WARNING

📋 分析摘要
--------------------------------------------------------------------------------
  • 发现问题数量: 2
  • 资源问题: 是 ⚠️
  • BRPC 问题: 否 ✓
  • 线程池问题: 是 ⚠️
  • 瓶颈识别: 已识别 🎯
  • 优化建议: 5 条

🖥️ 资源使用分析
--------------------------------------------------------------------------------
  🔴 CPU: CPU 使用率过高: 平均 92.5%
     💡 考虑增加 BE 节点或优化查询负载

...

💡 优化建议
================================================================================

1. 🔴 [HIGH] CPU 资源不足
   分类: 资源扩容
   说明: CPU 使用率过高: 平均 92.5%
   操作步骤:
      • 增加 BE 节点数量，分散负载
      • 检查是否有其他任务（如 Compaction、Query）占用过多 CPU
      • 优化导入批次大小和并发度

2. 🟡 [MEDIUM] Async Delta Writer 线程池不足
   分类: 线程池调优
   说明: 任务队列有积压
   操作步骤:
      • 动态调整 BE 配置：UPDATE starrocks_be_configs SET value=32 WHERE name="number_tablet_writer_threads"
      • 默认值为 16，建议根据 CPU 核数适当增加

...
```

## 实现细节

### 核心函数

1. **analyzeReachedTimeout(connection, options)**
   - 主入口函数
   - 协调各分析模块
   - 生成综合报告

2. **\_analyzeResourceUsage(connection, be_host, time_range_minutes)**
   - 分析 CPU、IO、网络资源使用
   - 识别资源瓶颈

3. **\_analyzeBRPCMetrics(connection, be_host, time_range_minutes)**
   - 分析 BRPC 接口延迟
   - 检查线程池使用情况

4. **\_analyzeThreadPools(connection, be_host, architecture, time_range_minutes)**
   - 分析各线程池状态
   - 识别队列积压和耗时异常

5. **\_identifyBottlenecks(resource_analysis, brpc_analysis, threadpool_analysis)**
   - 综合分析瓶颈
   - 分类瓶颈类型

6. **\_generateRecommendations(bottleneck_analysis, resource_analysis, threadpool_analysis, architecture)**
   - 生成具体的优化建议
   - 提供配置 SQL 和操作步骤

### 依据的 SOP 文档章节

实现严格遵循 SOP 文档的以下章节：

1. **整体排查思路**（文档第 4-5 页）
   - 根据现象判断问题环节
   - 依次分析资源、BRPC、线程池

2. **集群资源监控**（文档第 7-9 页）
   - CPU 监控
   - IO 监控（本地磁盘 + S3）
   - 网络监控

3. **导入监控**（文档第 10-17 页）
   - BRPC 监控
   - Async delta writer 监控
   - Memtable flush 监控
   - Segment replicate sync 监控
   - Segment flush 监控

4. **解决思路**（文档第 6 页）
   - 线程池调整
   - 资源扩容
   - 配置优化

5. **历史问题汇总**（文档第 31-35 页）
   - 常见问题模式
   - 经验性建议

## 当前限制

### Prometheus 集成待完善

当前版本中，Prometheus 监控查询返回模拟数据，需要手动检查 Grafana 面板。

未来版本将集成：

- Prometheus 实时查询
- 自动获取监控指标
- 历史数据趋势分析

### 需要手动检查的指标

目前需要手动在 Grafana 中检查：

1. **CPU 指标**：
   - BE CPU Idle
   - cpu utile by task

2. **IO 指标**：
   - Disk IO Util
   - fslib write io metrics

3. **网络指标**：
   - Net send/receive bytes
   - TCP 错误统计

4. **BRPC 指标**：
   - BRPC Workers
   - tablet_writer_open/add_chunks/add_segment latency

5. **线程池指标**：
   - Async Delta Writer ThreadPool
   - Memtable Flush ThreadPool
   - Segment Replicate/Flush ThreadPool

## 优化建议分类

### 资源扩容类

- 增加 BE 节点
- 使用 SSD 替代 HDD
- 增加磁盘数量

### 线程池调优类

具体的配置 SQL 命令：

```sql
-- Async delta writer 线程池
UPDATE starrocks_be_configs
SET value=32
WHERE name='number_tablet_writer_threads';

-- Memtable flush 线程池
UPDATE starrocks_be_configs
SET value=4
WHERE name='flush_thread_num_per_store';
```

### 配置优化类

```sql
-- 主键表跳过 pk_preload
UPDATE starrocks_be_configs
SET value=true
WHERE name='skip_pk_preload';
```

### 临时缓解类

- 增加导入超时时间
- 调整批次大小
- 优化并发度

## 使用建议

### 1. 定期分析

建议在以下时机运行分析：

- 出现 Reached Timeout 错误时
- 导入性能下降时
- 集群负载高峰期前后
- 集群扩容/缩容后

### 2. 结合其他工具

- BE 日志分析
- Profile 详细分析（>= 3.4 版本自动生成）
- Stack Trace（>= 3.5 版本自动获取）

### 3. 配置调整流程

1. 运行分析工具
2. 识别优先级 HIGH 的问题
3. 应用推荐的配置调整
4. 持续观察监控指标
5. 根据效果进一步优化

## 相关文档

- 导入慢问题排查 SOP（PDF 文档）
- StarRocks 导入运维手册
- Grafana 监控配置指南
- BE 配置参数说明

## 版本信息

- **初始版本**：v1.0.0
- **创建日期**：2025-01-10
- **依据文档**：导入慢问题排查 SOP.pdf
- **支持版本**：StarRocks 3.4+（部分功能需要 3.5+）

## 后续改进计划

### 短期（1-2 个月）

- [ ] 集成 Prometheus 实时查询
- [ ] 添加 Profile 自动解析
- [ ] 增加历史趋势分析

### 中期（3-6 个月）

- [ ] 支持多 BE 节点对比分析
- [ ] 添加自动化建议执行
- [ ] 集成 Stack Trace 分析

### 长期（6+ 个月）

- [ ] 机器学习预测瓶颈
- [ ] 自动化性能调优
- [ ] 集成告警系统

## 贡献指南

欢迎贡献改进建议和代码！

改进方向：

1. Prometheus 查询实现
2. 更多的瓶颈识别规则
3. 更准确的配置建议算法
4. 历史问题案例库扩充

## 许可证

Apache-2.0

---

**注意**：本工具旨在辅助问题诊断，实际问题解决仍需要结合具体情况和专业判断。
