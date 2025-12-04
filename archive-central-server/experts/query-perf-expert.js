/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 查询性能分析专家模块
 * 负责：慢查询分析、审计日志分析、查询性能诊断和优化建议
 */

/* eslint-disable no-undef */

class StarRocksQueryPerfExpert {
  constructor() {
    this.name = 'query-perf';
    this.version = '1.0.0';
    this.description =
      'StarRocks 查询性能分析专家 - 负责慢查询分析、审计日志分析和性能优化';

    // Prometheus 配置
    this.prometheusConfig = {
      host: '127.0.0.1',
      port: 9092,
      protocol: 'http',
    };

    // 查询性能分析规则库
    this.rules = {
      // 慢查询阈值
      slow_query: {
        warning_threshold_ms: 10000, // > 10s 为警告
        critical_threshold_ms: 60000, // > 60s 为严重
        emergency_threshold_ms: 300000, // > 5min 为紧急
      },

      // 查询扫描量阈值
      scan_volume: {
        warning_rows: 100000000, // > 1亿行 为警告
        critical_rows: 1000000000, // > 10亿行 为严重
        warning_bytes: 10737418240, // > 10GB 为警告
        critical_bytes: 107374182400, // > 100GB 为严重
      },

      // 查询内存使用阈值
      memory_usage: {
        warning_gb: 10, // > 10GB 为警告
        critical_gb: 50, // > 50GB 为严重
      },

      // Query Latency 阈值
      query_latency: {
        p999_warning_ms: 10000, // P999 > 10s 为警告
        p999_critical_ms: 30000, // P999 > 30s 为严重
        p99_warning_ms: 5000, // P99 > 5s 为警告
        p99_critical_ms: 10000, // P99 > 10s 为严重
        p95_warning_ms: 3000, // P95 > 3s 为警告
        p90_warning_ms: 2000, // P90 > 2s 为警告
      },
    };

    // 专业术语和解释
    this.terminology = {
      audit_log: '审计日志，记录所有 SQL 执行历史、耗时、扫描量等信息',
      slow_query: '执行时间超过阈值的查询，通常需要优化',
      scan_rows: '查询扫描的总行数，过大可能导致性能问题',
      scan_bytes: '查询扫描的总字节数，过大可能导致 I/O 瓶颈',
      query_mem_bytes: '查询使用的内存字节数，过大可能导致 OOM',
      query_state: '查询执行状态：EOF(成功)、ERR(失败)等',
      query_time: '查询执行时间（毫秒）',
    };
  }

  /**
   * 查询 Prometheus 即时数据
   */
  async queryPrometheusInstant(query) {
    const url = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}/api/v1/query`;

    const params = new URLSearchParams({
      query: query,
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(
          `Prometheus 查询失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(`Prometheus 查询失败: ${data.error || '未知错误'}`);
      }

      return data.data;
    } catch (error) {
      throw new Error(`查询 Prometheus 失败: ${error.message}`);
    }
  }

  /**
   * 获取集群名称（从 Prometheus 指标中提取）
   */
  async getClusterName() {
    try {
      const query = 'starrocks_fe_query_latency_ms';
      const result = await this.queryPrometheusInstant(query);

      if (result.result && result.result.length > 0) {
        const metric = result.result[0].metric;
        return metric.job || 'unknown';
      }

      return 'unknown';
    } catch (error) {
      console.warn('无法获取集群名称:', error.message);
      return 'unknown';
    }
  }

  /**
   * 检查审计日志是否开启
   */
  async checkAuditLogEnabled(connection) {
    try {
      // 检查审计日志表是否存在
      const [tables] = await connection.query(
        "SHOW TABLES FROM starrocks_audit_db__ LIKE 'starrocks_audit_tbl__'",
      );

      if (!tables || tables.length === 0) {
        return {
          enabled: false,
          error:
            'Audit log 表不存在。请先安装 Audit Log 插件。\n' +
            '使用 install_audit_log 工具安装插件。',
        };
      }

      // 检查表中是否有数据（简单验证）
      try {
        await connection.query(
          'SELECT 1 FROM starrocks_audit_db__.starrocks_audit_tbl__ LIMIT 1',
        );
      } catch (error) {
        return {
          enabled: false,
          error: `无法查询审计日志表: ${error.message}`,
        };
      }

      return {
        enabled: true,
        error: null,
      };
    } catch (error) {
      return {
        enabled: false,
        error: `检查审计日志失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取最近一小时的慢查询
   */
  async getRecentSlowQueries(
    connection,
    timeRangeMinutes = 60,
    slowThresholdMs = 10000,
    limit = 100,
  ) {
    try {
      // 1. 首先检查审计日志是否开启
      const auditLogCheck = await this.checkAuditLogEnabled(connection);
      if (!auditLogCheck.enabled) {
        throw new Error(auditLogCheck.error);
      }

      // 2. 查询最近的慢查询
      // 计算时间范围：当前时间往前推 N 分钟
      const timeAgo = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
      const timeAgoStr = timeAgo.toISOString().slice(0, 19).replace('T', ' ');

      const query = `
        SELECT
          \`queryId\`,
          \`timestamp\`,
          \`queryTime\`,
          \`scanRows\`,
          \`scanBytes\`,
          \`memCostBytes\`,
          \`state\`,
          \`db\`,
          \`user\`,
          SUBSTRING(\`stmt\`, 1, 200) as stmt_preview
        FROM starrocks_audit_db__.starrocks_audit_tbl__
        WHERE \`timestamp\` >= '${timeAgoStr}'
          AND \`queryTime\` >= ${slowThresholdMs}
          AND \`state\` = 'EOF'
        ORDER BY \`queryTime\` DESC
        LIMIT ${limit}
      `;

      const [rows] = await connection.query(query);

      return {
        success: true,
        time_range_minutes: timeRangeMinutes,
        slow_threshold_ms: slowThresholdMs,
        total_count: rows.length,
        queries: rows.map((row) => ({
          query_id: row.queryId,
          start_time: row.timestamp,
          query_time_ms: row.queryTime,
          query_time_sec: (row.queryTime / 1000).toFixed(2),
          scan_rows: row.scanRows,
          scan_bytes: row.scanBytes,
          scan_gb: (row.scanBytes / 1073741824).toFixed(2),
          query_mem_bytes: row.memCostBytes,
          query_mem_gb: (row.memCostBytes / 1073741824).toFixed(2),
          state: row.state,
          database: row.db,
          user: row.user,
          stmt_preview: row.stmt_preview,
        })),
      };
    } catch (error) {
      throw new Error(`获取慢查询失败: ${error.message}`);
    }
  }

  /**
   * 分析慢查询并生成诊断报告
   */
  analyzeSlowQueries(slowQueriesData) {
    const queries = slowQueriesData.queries;

    if (queries.length === 0) {
      return {
        summary: {
          total_slow_queries: 0,
          avg_query_time_ms: 0,
          max_query_time_ms: 0,
          total_scan_rows: 0,
          total_scan_gb: 0,
        },
        issues: [],
        recommendations: [],
      };
    }

    // 统计分析
    const summary = {
      total_slow_queries: queries.length,
      avg_query_time_ms: Math.round(
        queries.reduce((sum, q) => sum + q.query_time_ms, 0) / queries.length,
      ),
      max_query_time_ms: Math.max(...queries.map((q) => q.query_time_ms)),
      total_scan_rows: queries.reduce(
        (sum, q) => sum + parseInt(q.scan_rows || 0),
        0,
      ),
      total_scan_gb: queries
        .reduce((sum, q) => sum + parseFloat(q.scan_gb || 0), 0)
        .toFixed(2),
      avg_scan_gb: (
        queries.reduce((sum, q) => sum + parseFloat(q.scan_gb || 0), 0) /
        queries.length
      ).toFixed(2),
      max_mem_gb: Math.max(
        ...queries.map((q) => parseFloat(q.query_mem_gb || 0)),
      ).toFixed(2),
    };

    // 问题检测
    const issues = [];

    // 检测超长查询
    const criticalSlowQueries = queries.filter(
      (q) => q.query_time_ms >= this.rules.slow_query.critical_threshold_ms,
    );
    if (criticalSlowQueries.length > 0) {
      issues.push({
        severity: 'CRITICAL',
        category: 'slow_query',
        title: `发现 ${criticalSlowQueries.length} 个超长查询 (> 60s)`,
        description: `最慢查询耗时 ${(summary.max_query_time_ms / 1000).toFixed(2)} 秒`,
        affected_queries: criticalSlowQueries
          .slice(0, 5)
          .map((q) => q.query_id),
      });
    }

    // 检测大扫描量查询
    const largeScanQueries = queries.filter(
      (q) =>
        parseFloat(q.scan_gb) >=
        this.rules.scan_volume.warning_bytes / 1073741824,
    );
    if (largeScanQueries.length > 0) {
      issues.push({
        severity: 'WARNING',
        category: 'large_scan',
        title: `发现 ${largeScanQueries.length} 个大扫描量查询 (> 10GB)`,
        description: `这些查询可能导致 I/O 瓶颈`,
        affected_queries: largeScanQueries.slice(0, 5).map((q) => q.query_id),
      });
    }

    // 检测高内存查询
    const highMemQueries = queries.filter(
      (q) => parseFloat(q.query_mem_gb) >= this.rules.memory_usage.warning_gb,
    );
    if (highMemQueries.length > 0) {
      issues.push({
        severity: 'WARNING',
        category: 'high_memory',
        title: `发现 ${highMemQueries.length} 个高内存查询 (> 10GB)`,
        description: `最大内存使用 ${summary.max_mem_gb} GB`,
        affected_queries: highMemQueries.slice(0, 5).map((q) => q.query_id),
      });
    }

    // 生成优化建议
    const recommendations = this.generateSlowQueryRecommendations(
      issues,
      summary,
    );

    return {
      summary,
      issues,
      recommendations,
    };
  }

  /**
   * 获取系统 Query Latency 指标
   */
  async getQueryLatencyMetrics(clusterName = null) {
    try {
      // 如果没有提供集群名称，尝试自动获取
      if (!clusterName) {
        clusterName = await this.getClusterName();
      }

      const percentiles = ['0.50', '0.90', '0.95', '0.99', '0.999'];
      const latencyData = {
        cluster: clusterName,
        timestamp: new Date().toISOString(),
        by_instance: {},
        summary: {},
        qps: {
          by_instance: {},
          total: 0,
          avg_per_instance: 0,
        },
      };

      // 获取 Query QPS 数据
      try {
        const interval = '1m'; // 使用 1 分钟的时间窗口
        const qpsQuery = `rate(starrocks_fe_query_total{job="${clusterName}", group="fe"}[${interval}])`;
        const qpsResult = await this.queryPrometheusInstant(qpsQuery);

        if (qpsResult.result && qpsResult.result.length > 0) {
          let totalQps = 0;
          qpsResult.result.forEach((item) => {
            const instance = item.metric.instance;
            const qps = parseFloat(item.value[1]);

            latencyData.qps.by_instance[instance] = {
              qps: qps.toFixed(2),
              qps_rounded: Math.round(qps),
            };
            totalQps += qps;
          });

          latencyData.qps.total = totalQps.toFixed(2);
          latencyData.qps.total_rounded = Math.round(totalQps);
          latencyData.qps.avg_per_instance = (
            totalQps / qpsResult.result.length
          ).toFixed(2);
          latencyData.qps.instance_count = qpsResult.result.length;
        }
      } catch (error) {
        console.error('获取 QPS 指标失败:', error.message);
        // QPS 获取失败不影响延迟指标的获取
      }

      // 获取每个分位数的延迟数据
      for (const quantile of percentiles) {
        const query = `sum(starrocks_fe_query_latency_ms{job="${clusterName}", quantile="${quantile}"}) by (instance)`;
        const result = await this.queryPrometheusInstant(query);

        // 生成 percentile key (0.50 -> p50, 0.999 -> p999)
        const percentileKey = `p${quantile.replace(/^0\./, '')}`;

        if (result.result && result.result.length > 0) {
          // 按实例存储
          result.result.forEach((item) => {
            const instance = item.metric.instance;
            const latencyMs = parseFloat(item.value[1]);

            if (!latencyData.by_instance[instance]) {
              latencyData.by_instance[instance] = {};
            }

            latencyData.by_instance[instance][percentileKey] = {
              latency_ms: latencyMs,
              latency_sec: (latencyMs / 1000).toFixed(2),
            };
          });

          // 计算整体汇总
          const avgLatency =
            result.result.reduce(
              (sum, item) => sum + parseFloat(item.value[1]),
              0,
            ) / result.result.length;
          const maxLatency = Math.max(
            ...result.result.map((item) => parseFloat(item.value[1])),
          );

          latencyData.summary[percentileKey] = {
            avg_latency_ms: Math.round(avgLatency),
            avg_latency_sec: (avgLatency / 1000).toFixed(2),
            max_latency_ms: Math.round(maxLatency),
            max_latency_sec: (maxLatency / 1000).toFixed(2),
            instance_count: result.result.length,
          };
        } else {
          latencyData.summary[percentileKey] = {
            avg_latency_ms: 0,
            avg_latency_sec: '0.00',
            max_latency_ms: 0,
            max_latency_sec: '0.00',
            instance_count: 0,
          };
        }
      }

      return {
        success: true,
        data: latencyData,
      };
    } catch (error) {
      throw new Error(`获取 Query Latency 指标失败: ${error.message}`);
    }
  }

  /**
   * 分析 Query Latency 并生成诊断报告
   */
  analyzeQueryLatency(latencyData) {
    const summary = latencyData.summary;
    const issues = [];
    const recommendations = [];

    // 检测 P999 延迟问题
    if (
      summary.p999 &&
      summary.p999.avg_latency_ms >= this.rules.query_latency.p999_critical_ms
    ) {
      issues.push({
        severity: 'CRITICAL',
        category: 'high_p999_latency',
        title: `P999 查询延迟过高 (${summary.p999.avg_latency_sec}s)`,
        description: `P999 延迟超过严重阈值 ${this.rules.query_latency.p999_critical_ms / 1000}s`,
        current_value: summary.p999.avg_latency_ms,
        threshold: this.rules.query_latency.p999_critical_ms,
      });
    } else if (
      summary.p999 &&
      summary.p999.avg_latency_ms >= this.rules.query_latency.p999_warning_ms
    ) {
      issues.push({
        severity: 'WARNING',
        category: 'high_p999_latency',
        title: `P999 查询延迟较高 (${summary.p999.avg_latency_sec}s)`,
        description: `P999 延迟超过警告阈值 ${this.rules.query_latency.p999_warning_ms / 1000}s`,
        current_value: summary.p999.avg_latency_ms,
        threshold: this.rules.query_latency.p999_warning_ms,
      });
    }

    // 检测 P99 延迟问题
    if (
      summary.p99 &&
      summary.p99.avg_latency_ms >= this.rules.query_latency.p99_critical_ms
    ) {
      issues.push({
        severity: 'CRITICAL',
        category: 'high_p99_latency',
        title: `P99 查询延迟过高 (${summary.p99.avg_latency_sec}s)`,
        description: `P99 延迟超过严重阈值 ${this.rules.query_latency.p99_critical_ms / 1000}s`,
        current_value: summary.p99.avg_latency_ms,
        threshold: this.rules.query_latency.p99_critical_ms,
      });
    } else if (
      summary.p99 &&
      summary.p99.avg_latency_ms >= this.rules.query_latency.p99_warning_ms
    ) {
      issues.push({
        severity: 'WARNING',
        category: 'high_p99_latency',
        title: `P99 查询延迟较高 (${summary.p99.avg_latency_sec}s)`,
        description: `P99 延迟超过警告阈值 ${this.rules.query_latency.p99_warning_ms / 1000}s`,
        current_value: summary.p99.avg_latency_ms,
        threshold: this.rules.query_latency.p99_warning_ms,
      });
    }

    // 检测 P95 延迟问题
    if (
      summary.p95 &&
      summary.p95.avg_latency_ms >= this.rules.query_latency.p95_warning_ms
    ) {
      issues.push({
        severity: 'WARNING',
        category: 'high_p95_latency',
        title: `P95 查询延迟较高 (${summary.p95.avg_latency_sec}s)`,
        description: `P95 延迟超过警告阈值 ${this.rules.query_latency.p95_warning_ms / 1000}s`,
        current_value: summary.p95.avg_latency_ms,
        threshold: this.rules.query_latency.p95_warning_ms,
      });
    }

    // 检测 P90 延迟问题
    if (
      summary.p90 &&
      summary.p90.avg_latency_ms >= this.rules.query_latency.p90_warning_ms
    ) {
      issues.push({
        severity: 'WARNING',
        category: 'high_p90_latency',
        title: `P90 查询延迟较高 (${summary.p90.avg_latency_sec}s)`,
        description: `P90 延迟超过警告阈值 ${this.rules.query_latency.p90_warning_ms / 1000}s`,
        current_value: summary.p90.avg_latency_ms,
        threshold: this.rules.query_latency.p90_warning_ms,
      });
    }

    // 生成优化建议
    if (issues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'latency_optimization',
        title: '优化查询延迟',
        description: '系统查询延迟较高，需要进行性能优化',
        actions: [
          {
            action: '分析慢查询',
            description: '使用 get_recent_slow_queries 工具分析具体的慢查询',
          },
          {
            action: '检查系统资源',
            description: '检查 CPU、内存、磁盘 I/O 是否成为瓶颈',
          },
          {
            action: '优化查询并发',
            description: '检查是否有过多并发查询，考虑限流',
          },
          {
            action: '优化数据分布',
            description: '检查数据是否均衡分布，避免热点',
          },
        ],
      });
    }

    return {
      summary,
      issues,
      recommendations,
      health_status:
        issues.length === 0
          ? 'healthy'
          : issues.some((i) => i.severity === 'CRITICAL')
            ? 'critical'
            : 'warning',
    };
  }

  /**
   * 格式化 Query Latency 报告
   */
  formatQueryLatencyReport(result, analysis) {
    const latencyData = result.data;
    let report = '⚡ StarRocks Query Latency 分析报告\n';
    report += '========================================\n\n';

    // 基本信息
    report += `🏷️  **集群名称**: ${latencyData.cluster}\n`;
    report += `📅 **采集时间**: ${latencyData.timestamp}\n`;
    report += `🖥️  **FE 实例数**: ${Object.keys(latencyData.by_instance).length}\n\n`;

    // QPS 统计
    if (latencyData.qps && latencyData.qps.instance_count > 0) {
      report += '🚀 **Query QPS (每秒查询数)**:\n';
      report += `   • 总 QPS: ${latencyData.qps.total} queries/sec`;
      if (latencyData.qps.total_rounded > 0) {
        report += ` (~${latencyData.qps.total_rounded} QPS)`;
      }
      report += '\n';
      report += `   • 平均每实例: ${latencyData.qps.avg_per_instance} queries/sec\n`;
      report += `   • 活跃实例数: ${latencyData.qps.instance_count}\n\n`;
    }

    // 整体延迟统计
    report += '📊 **整体延迟统计** (平均值):\n';
    report += `   • P50 (中位数): ${latencyData.summary.p50?.avg_latency_sec || 'N/A'}s\n`;
    report += `   • P90: ${latencyData.summary.p90?.avg_latency_sec || 'N/A'}s\n`;
    report += `   • P95: ${latencyData.summary.p95?.avg_latency_sec || 'N/A'}s\n`;
    report += `   • P99: ${latencyData.summary.p99?.avg_latency_sec || 'N/A'}s\n`;
    report += `   • P999: ${latencyData.summary.p999?.avg_latency_sec || 'N/A'}s\n\n`;

    // 健康状态
    const statusIcon =
      analysis.health_status === 'healthy'
        ? '✅'
        : analysis.health_status === 'critical'
          ? '🔴'
          : '🟡';
    report += `${statusIcon} **健康状态**: ${analysis.health_status.toUpperCase()}\n\n`;

    // 问题列表
    if (analysis.issues.length > 0) {
      report += '⚠️  **发现的问题**:\n';
      analysis.issues.forEach((issue) => {
        const icon = issue.severity === 'CRITICAL' ? '🔴' : '🟡';
        report += `   ${icon} [${issue.severity}] ${issue.title}\n`;
        report += `      ${issue.description}\n`;
        report += `      当前值: ${issue.current_value}ms | 阈值: ${issue.threshold}ms\n\n`;
      });
    }

    // 优化建议
    if (analysis.recommendations.length > 0) {
      report += '💡 **优化建议**:\n';
      analysis.recommendations.forEach((rec) => {
        report += `   [${rec.priority}] ${rec.title}\n`;
        report += `   ${rec.description}\n`;
        rec.actions.forEach((action) => {
          report += `      ✓ ${action.action}: ${action.description}\n`;
        });
        report += '\n';
      });
    }

    // 各实例延迟详情
    report += '🖥️  **各 FE 实例性能详情**:\n';
    Object.entries(latencyData.by_instance).forEach(([instance, metrics]) => {
      report += `   • ${instance}\n`;

      // QPS 信息
      if (latencyData.qps && latencyData.qps.by_instance[instance]) {
        const qps = latencyData.qps.by_instance[instance];
        report += `     QPS: ${qps.qps} queries/sec\n`;
      }

      // 延迟信息
      report += `     P50: ${metrics.p50?.latency_sec || 'N/A'}s | `;
      report += `P90: ${metrics.p90?.latency_sec || 'N/A'}s | `;
      report += `P95: ${metrics.p95?.latency_sec || 'N/A'}s | `;
      report += `P99: ${metrics.p99?.latency_sec || 'N/A'}s | `;
      report += `P999: ${metrics.p999?.latency_sec || 'N/A'}s\n`;
    });

    return report;
  }

  /**
   * 生成慢查询优化建议
   */
  generateSlowQueryRecommendations(issues, summary) {
    const recommendations = [];

    // 基于问题生成建议
    if (issues.some((i) => i.category === 'slow_query')) {
      recommendations.push({
        priority: 'HIGH',
        category: 'query_optimization',
        title: '优化超长查询',
        description: '查询执行时间过长，需要进行优化',
        actions: [
          {
            action: '检查查询计划',
            description: '使用 EXPLAIN 分析查询计划，查找性能瓶颈',
            command: 'EXPLAIN <your_query>;',
          },
          {
            action: '添加合适的索引',
            description: '为常用查询条件添加索引，减少全表扫描',
          },
          {
            action: '优化 JOIN 操作',
            description:
              '检查 JOIN 顺序，考虑使用 BROADCAST JOIN 或 SHUFFLE JOIN',
          },
        ],
      });
    }

    if (issues.some((i) => i.category === 'large_scan')) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'data_filtering',
        title: '减少数据扫描量',
        description: '查询扫描数据量过大，影响性能',
        actions: [
          {
            action: '增加分区裁剪',
            description: '在查询条件中添加分区键过滤，减少扫描分区数',
          },
          {
            action: '优化 WHERE 条件',
            description: '将过滤条件前置，尽早减少数据量',
          },
          {
            action: '使用物化视图',
            description: '对于频繁查询的聚合结果，考虑创建物化视图',
          },
        ],
      });
    }

    if (issues.some((i) => i.category === 'high_memory')) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'memory_optimization',
        title: '降低查询内存使用',
        description: '查询内存使用过高，可能导致 OOM',
        actions: [
          {
            action: '优化 GROUP BY 和聚合',
            description: '减少 GROUP BY 的基数，考虑分阶段聚合',
          },
          {
            action: '调整并行度',
            description: '适当降低查询并行度，减少内存消耗',
            command: 'SET parallel_fragment_exec_instance_num = <lower_value>;',
          },
          {
            action: '分批处理',
            description: '对于大数据量查询，考虑分批处理',
          },
        ],
      });
    }

    // 通用建议
    if (summary.total_slow_queries > 10) {
      recommendations.push({
        priority: 'LOW',
        category: 'monitoring',
        title: '加强查询性能监控',
        description: `最近 ${summary.total_slow_queries} 个慢查询需要关注`,
        actions: [
          {
            action: '设置慢查询告警',
            description: '配置监控系统，及时发现慢查询',
          },
          {
            action: '定期审查审计日志',
            description: '定期分析审计日志，发现性能问题趋势',
          },
        ],
      });
    }

    return recommendations;
  }

  /**
   * 检查是否开启了 Query Profile
   */
  async checkProfileEnabled(connection) {
    try {
      const [variables] = await connection.query(
        "SHOW VARIABLES LIKE 'enable_profile'",
      );

      if (!variables || variables.length === 0) {
        return {
          enabled: false,
          error: '无法查询 enable_profile 配置',
        };
      }

      const profileEnabled =
        variables[0].Value === 'true' || variables[0].Value === '1';

      if (!profileEnabled) {
        return {
          enabled: false,
          error:
            'Query Profile 未开启。请先开启:\n' +
            'SET GLOBAL enable_profile = true;',
        };
      }

      return {
        enabled: true,
        error: null,
      };
    } catch (error) {
      return {
        enabled: false,
        error: `检查 Profile 配置失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取查询的 Profile
   */
  async getQueryProfile(connection, queryId) {
    try {
      // 1. 检查 Profile 是否开启
      const profileCheck = await this.checkProfileEnabled(connection);
      if (!profileCheck.enabled) {
        throw new Error(profileCheck.error);
      }

      // 2. 获取 Profile
      const query = `SELECT get_query_profile('${queryId}') as profile`;
      const [rows] = await connection.query(query);

      if (!rows || rows.length === 0 || !rows[0].profile) {
        throw new Error(
          `无法获取 Query ID ${queryId} 的 Profile。可能原因:\n` +
            '1. Query ID 不存在\n' +
            '2. Query Profile 已过期（默认保留时间有限）\n' +
            '3. Query 尚未执行完成',
        );
      }

      const profile = rows[0].profile;

      return {
        success: true,
        query_id: queryId,
        profile: profile,
        profile_size: profile.length,
      };
    } catch (error) {
      throw new Error(`获取 Query Profile 失败: ${error.message}`);
    }
  }

  /**
   * 格式化 Query Profile 报告
   */
  formatQueryProfileReport(result) {
    let report = '📊 StarRocks Query Profile\n';
    report += '========================================\n\n';

    report += `🔍 **Query ID**: ${result.query_id}\n`;
    report += `📏 **Profile 大小**: ${(result.profile_size / 1024).toFixed(2)} KB\n\n`;

    report += '📋 **Query Profile 内容**:\n';
    report += '```\n';
    report += result.profile;
    report += '\n```\n\n';

    report += '💡 **Profile 分析提示**:\n';
    report += '   • 查看各个算子的耗时，找出性能瓶颈\n';
    report += '   • 关注 RowsReturned 和 RowsProcessed，检查数据过滤效率\n';
    report += '   • 检查 Join 算子的类型和数据量\n';
    report += '   • 查看是否有数据倾斜问题\n';
    report += '   • 关注内存使用情况\n';

    return report;
  }

  /**
   * 格式化慢查询报告
   */
  formatSlowQueryReport(result, analysis) {
    let report = '🔍 StarRocks 慢查询分析报告\n';
    report += '========================================\n\n';

    // 基本信息
    report += `📊 **分析范围**: 最近 ${result.time_range_minutes} 分钟\n`;
    report += `⏱️  **慢查询阈值**: ${result.slow_threshold_ms / 1000} 秒\n`;
    report += `📈 **慢查询总数**: ${result.total_count}\n\n`;

    if (result.total_count === 0) {
      report += '✅ **状态**: 没有发现慢查询，系统运行良好！\n';
      return report;
    }

    // 统计摘要
    report += '📋 **统计摘要**:\n';
    report += `   • 平均查询时间: ${(analysis.summary.avg_query_time_ms / 1000).toFixed(2)} 秒\n`;
    report += `   • 最慢查询时间: ${(analysis.summary.max_query_time_ms / 1000).toFixed(2)} 秒\n`;
    report += `   • 总扫描数据量: ${analysis.summary.total_scan_gb} GB\n`;
    report += `   • 平均扫描量: ${analysis.summary.avg_scan_gb} GB\n`;
    report += `   • 最大内存使用: ${analysis.summary.max_mem_gb} GB\n\n`;

    // 问题列表
    if (analysis.issues.length > 0) {
      report += '⚠️  **发现的问题**:\n';
      analysis.issues.forEach((issue) => {
        const icon = issue.severity === 'CRITICAL' ? '🔴' : '🟡';
        report += `   ${icon} [${issue.severity}] ${issue.title}\n`;
        report += `      ${issue.description}\n`;
        if (issue.affected_queries && issue.affected_queries.length > 0) {
          report += `      影响查询: ${issue.affected_queries.join(', ')}\n`;
        }
        report += '\n';
      });
    }

    // 优化建议
    if (analysis.recommendations.length > 0) {
      report += '💡 **优化建议**:\n';
      analysis.recommendations.forEach((rec, index) => {
        report += `   ${index + 1}. [${rec.priority}] ${rec.title}\n`;
        report += `      ${rec.description}\n`;
        rec.actions.forEach((action) => {
          report += `      ✓ ${action.action}: ${action.description}\n`;
          if (action.command) {
            report += `        命令: ${action.command}\n`;
          }
        });
        report += '\n';
      });
    }

    // Top 5 慢查询详情
    report += '🔝 **Top 5 慢查询**:\n';
    const topQueries = result.queries.slice(0, 5);
    topQueries.forEach((query, index) => {
      report += `   ${index + 1}. Query ID: ${query.query_id}\n`;
      report += `      执行时间: ${query.query_time_sec}s | 扫描: ${query.scan_gb}GB | 内存: ${query.query_mem_gb}GB\n`;
      report += `      用户: ${query.user} | 数据库: ${query.database}\n`;
      report += `      SQL: ${query.stmt_preview}...\n\n`;
    });

    report += `📅 **分析时间**: ${new Date().toISOString()}\n`;

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   */
  getToolHandlers() {
    return {
      get_recent_slow_queries: async (args, context) => {
        console.log('🎯 慢查询分析接收参数:', JSON.stringify(args, null, 2));

        const connection = context.connection;
        const timeRangeMinutes = args.time_range_minutes || 60;
        const slowThresholdMs = args.slow_threshold_ms || 10000;
        const limit = args.limit || 100;

        try {
          // 获取慢查询数据
          const result = await this.getRecentSlowQueries(
            connection,
            timeRangeMinutes,
            slowThresholdMs,
            limit,
          );

          // 分析慢查询
          const analysis = this.analyzeSlowQueries(result);

          // 生成报告
          const report = this.formatSlowQueryReport(result, analysis);

          return {
            content: [
              {
                type: 'text',
                text: report,
              },
              {
                type: 'text',
                text:
                  '详细数据:\n' + JSON.stringify({ result, analysis }, null, 2),
              },
            ],
          };
        } catch (error) {
          // 如果是审计日志未开启的错误，返回友好的错误信息
          return {
            content: [
              {
                type: 'text',
                text: `❌ 错误: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },

      analyze_query_latency: async (args) => {
        console.log(
          '🎯 Query Latency 分析接收参数:',
          JSON.stringify(args, null, 2),
        );

        const clusterName = args.cluster_name || null;

        try {
          // 获取 Query Latency 指标
          const result = await this.getQueryLatencyMetrics(clusterName);

          // 分析延迟数据
          const analysis = this.analyzeQueryLatency(result.data);

          // 生成报告
          const report = this.formatQueryLatencyReport(result, analysis);

          return {
            content: [
              {
                type: 'text',
                text: report,
              },
              {
                type: 'text',
                text:
                  '详细数据:\n' + JSON.stringify({ result, analysis }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `❌ 错误: ${error.message}\n\n` +
                  `请确保:\n` +
                  `1. Prometheus 服务正常运行 (${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port})\n` +
                  `2. starrocks_fe_query_latency_ms 指标可用\n` +
                  `3. 集群配置了正确的 Prometheus 监控`,
              },
            ],
            isError: true,
          };
        }
      },

      get_query_profile: async (args, context) => {
        console.log(
          '🎯 获取 Query Profile 接收参数:',
          JSON.stringify(args, null, 2),
        );

        const connection = context.connection;
        const queryId = args.query_id;

        if (!queryId) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ 错误: 缺少必需参数 query_id',
              },
            ],
            isError: true,
          };
        }

        try {
          // 获取 Query Profile
          const result = await this.getQueryProfile(connection, queryId);

          // 生成报告
          const report = this.formatQueryProfileReport(result);

          return {
            content: [
              {
                type: 'text',
                text: report,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ 错误: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    };
  }

  /**
   * 获取此专家提供的 MCP 工具定义
   */
  getTools() {
    return [
      {
        name: 'get_recent_slow_queries',
        description: `🔍 **慢查询分析**

**功能**: 从审计日志中获取和分析最近的慢查询，提供性能优化建议。

**分析内容**:
- ✅ 获取指定时间范围内的慢查询
- ✅ 检查审计日志是否开启
- ✅ 统计查询时间、扫描量、内存使用
- ✅ 识别性能问题：超长查询、大扫描量、高内存
- ✅ 生成优化建议：查询优化、数据过滤、内存优化

**适用场景**:
- 定位系统慢查询问题
- 分析查询性能瓶颈
- 生成查询优化方案
- 监控查询性能趋势

**注意**:
- 需要开启审计日志 (enable_audit_log = true)
- 审计日志会记录所有 SQL 执行历史
- 建议定期清理审计日志以避免占用过多存储`,
        inputSchema: {
          type: 'object',
          properties: {
            time_range_minutes: {
              type: 'number',
              description: '时间范围（分钟），默认 60 分钟',
              default: 60,
            },
            slow_threshold_ms: {
              type: 'number',
              description: '慢查询阈值（毫秒），默认 10000ms (10秒)',
              default: 10000,
            },
            limit: {
              type: 'number',
              description: '返回的最大查询数量，默认 100',
              default: 100,
            },
          },
          required: [],
        },
      },
      {
        name: 'analyze_query_latency',
        description: `⚡ **Query 性能分析 (延迟 + QPS)**

**功能**: 从 Prometheus 获取系统整体的查询性能指标，分析延迟和 QPS。

**分析内容**:
- ✅ 获取 Query QPS (每秒查询数)
- ✅ 获取 P50/P90/P95/P99/P999 查询延迟
- ✅ 按 FE 实例分别统计 QPS 和延迟
- ✅ 计算整体平均和最大延迟
- ✅ 识别延迟问题：高 P999、高 P99、高 P95、高 P90
- ✅ 生成性能优化建议

**指标来源**:
- QPS 指标: rate(starrocks_fe_query_total{group="fe"}[1m])
- 延迟指标: starrocks_fe_query_latency_ms
- 按 quantile 分位数获取: 0.50, 0.90, 0.95, 0.99, 0.999

**适用场景**:
- 监控系统整体查询性能
- 识别查询延迟趋势
- 定位性能瓶颈
- 评估系统健康状态

**注意**:
- 需要配置 Prometheus 监控
- 需要 starrocks_fe_query_latency_ms 指标可用
- 自动从 Prometheus 获取集群名称`,
        inputSchema: {
          type: 'object',
          properties: {
            cluster_name: {
              type: 'string',
              description: '集群名称（job 标签值），不提供则自动获取',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_query_profile',
        description: `📊 **获取查询 Profile**

**功能**: 根据 Query ID 获取查询的详细执行 Profile，用于深入分析查询性能。

**分析内容**:
- ✅ 检查 Query Profile 是否开启
- ✅ 获取指定 Query ID 的完整 Profile
- ✅ 显示查询执行计划和各算子耗时
- ✅ 提供 Profile 分析提示

**Profile 包含信息**:
- 查询执行计划树
- 各算子的耗时和资源使用
- 数据扫描量和过滤效率
- Join 类型和数据分布
- 内存使用情况
- 数据倾斜检测

**适用场景**:
- 深入分析慢查询原因
- 优化查询执行计划
- 诊断性能瓶颈
- 检查数据倾斜问题

**注意**:
- 需要开启 Query Profile (SET GLOBAL enable_profile = true)
- Profile 有保留时间限制，过期后无法获取
- Query 必须已执行完成`,
        inputSchema: {
          type: 'object',
          properties: {
            query_id: {
              type: 'string',
              description: '查询的唯一 ID',
            },
          },
          required: ['query_id'],
        },
      },
    ];
  }
}

export { StarRocksQueryPerfExpert };
