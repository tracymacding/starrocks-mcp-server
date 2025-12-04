/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-undef */

import { StarRocksQueryPerfExpert } from './query-perf-expert.js';

class StarRocksQueryPerfExpertSolutionC extends StarRocksQueryPerfExpert {
  constructor() {
    super();
    this.version = '2.0.0-solutionc';
  }

  getQueriesForTool(toolName, args = {}) {
    switch (toolName) {
      case 'get_recent_slow_queries':
        // 慢查询分析：使用 SQL 查询审计日志
        return this.getSlowQueriesQueries(args);

      case 'analyze_query_latency':
        // Query Latency 分析：使用 Prometheus 查询
        return this.getQueryLatencyQueries(args);

      case 'get_query_profile':
        // Query Profile：使用 SQL 查询
        return this.getQueryProfileQueries(args);

      default:
        return [{ id: 'default', sql: "SELECT 'Tool not fully implemented' as message", required: true }];
    }
  }

  /**
   * 获取慢查询的 SQL 查询
   */
  getSlowQueriesQueries(args) {
    const timeRangeMinutes = args.time_range_minutes || 60;
    const slowThresholdMs = args.slow_threshold_ms || 10000;
    const limit = args.limit || 100;

    // 计算时间范围
    const timeAgo = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    const timeAgoStr = timeAgo.toISOString().slice(0, 19).replace('T', ' ');

    return [
      {
        id: 'audit_log_check',
        type: 'sql',
        query: "SHOW TABLES FROM starrocks_audit_db__ LIKE 'starrocks_audit_tbl__'",
        description: '检查审计日志表是否存在',
        required: true
      },
      {
        id: 'slow_queries',
        type: 'sql',
        query: `
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
        `,
        description: '获取慢查询列表',
        required: true
      }
    ];
  }

  /**
   * 获取 Query Latency 的 Prometheus 查询
   */
  getQueryLatencyQueries(args) {
    const clusterName = args.cluster_name || 'starrocks';
    const percentiles = ['0.50', '0.90', '0.95', '0.99', '0.999'];
    const interval = '1m';

    const queries = [];

    // 获取集群名称（如果未指定）
    if (!args.cluster_name) {
      queries.push({
        id: 'cluster_name',
        type: 'prometheus_instant',
        query: 'starrocks_fe_query_latency_ms',
        description: '获取集群名称',
        required: false
      });
    }

    // QPS 查询
    queries.push({
      id: 'qps',
      type: 'prometheus_instant',
      query: `rate(starrocks_fe_query_total{job="${clusterName}", group="fe"}[${interval}])`,
      description: 'Query QPS (每秒查询数)',
      required: false
    });

    // 各分位数延迟查询
    percentiles.forEach(quantile => {
      const percentileKey = `p${quantile.replace(/^0\./, '')}`;
      queries.push({
        id: `latency_${percentileKey}`,
        type: 'prometheus_instant',
        query: `sum(starrocks_fe_query_latency_ms{job="${clusterName}", quantile="${quantile}"}) by (instance)`,
        description: `${percentileKey.toUpperCase()} 延迟`,
        required: true
      });
    });

    return queries;
  }

  /**
   * 获取 Query Profile 的 SQL 查询
   */
  getQueryProfileQueries(args) {
    const queryId = args.query_id;

    if (!queryId) {
      return [{ id: 'error', sql: "SELECT 'Missing query_id parameter' as error", required: true }];
    }

    return [
      {
        id: 'profile_enabled',
        type: 'sql',
        query: "SHOW VARIABLES LIKE 'enable_profile'",
        description: '检查 Query Profile 是否开启',
        required: true
      },
      {
        id: 'query_profile',
        type: 'sql',
        query: `SELECT get_query_profile('${queryId}') as profile`,
        description: '获取 Query Profile',
        required: true
      }
    ];
  }

  async analyzeQueryResults(toolName, results, args = {}) {
    switch (toolName) {
      case 'get_recent_slow_queries':
        return this.analyzeSlowQueriesResults(results, args);

      case 'analyze_query_latency':
        return this.analyzeQueryLatencyResults(results, args);

      case 'get_query_profile':
        return this.analyzeQueryProfileResults(results, args);

      default:
        return {
          expert: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          tool: toolName,
          results: results
        };
    }
  }

  /**
   * 分析慢查询结果
   */
  analyzeSlowQueriesResults(results, args) {
    const { audit_log_check, slow_queries } = results;

    // 检查审计日志表是否存在
    if (!audit_log_check || audit_log_check.length === 0) {
      return {
        status: 'error',
        message: 'Audit log 表不存在。请先安装 Audit Log 插件。\n使用 install_audit_log 工具安装插件。',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    // 处理慢查询数据
    const queries = (slow_queries || []).map((row) => ({
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
    }));

    const slowQueriesData = {
      success: true,
      time_range_minutes: args.time_range_minutes || 60,
      slow_threshold_ms: args.slow_threshold_ms || 10000,
      total_count: queries.length,
      queries: queries
    };

    // 使用父类方法分析
    const analysis = this.analyzeSlowQueries(slowQueriesData);
    const report = this.formatSlowQueryReport(slowQueriesData, analysis);

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      report: report,
      data: slowQueriesData,
      analysis: analysis
    };
  }

  /**
   * 分析 Query Latency 结果
   */
  analyzeQueryLatencyResults(results, args) {
    // 提取集群名称
    let clusterName = args.cluster_name || 'unknown';
    if (results.cluster_name && results.cluster_name.result && results.cluster_name.result.length > 0) {
      const metric = results.cluster_name.result[0].metric;
      clusterName = metric.job || 'unknown';
    }

    // 检查 Prometheus 是否可用
    if (results.latency_p50 && results.latency_p50.error) {
      return {
        status: 'error',
        message: `无法获取 Prometheus 数据: ${results.latency_p50.error}`,
        expert: this.name,
        timestamp: new Date().toISOString(),
        fallback_recommendation: '请检查 Prometheus 是否运行，并确认 starrocks_fe_query_latency_ms 指标可用'
      };
    }

    // 构建延迟数据结构
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

    // 处理 QPS 数据
    if (results.qps && results.qps.result && results.qps.result.length > 0) {
      let totalQps = 0;
      results.qps.result.forEach((item) => {
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
      latencyData.qps.avg_per_instance = (totalQps / results.qps.result.length).toFixed(2);
      latencyData.qps.instance_count = results.qps.result.length;
    }

    // 处理延迟数据
    const percentiles = ['p50', 'p90', 'p95', 'p99', 'p999'];
    percentiles.forEach(percentileKey => {
      const resultKey = `latency_${percentileKey}`;
      const result = results[resultKey];

      if (result && result.result && result.result.length > 0) {
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
        const avgLatency = result.result.reduce((sum, item) => sum + parseFloat(item.value[1]), 0) / result.result.length;
        const maxLatency = Math.max(...result.result.map((item) => parseFloat(item.value[1])));

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
    });

    // 使用父类方法分析
    const analysis = this.analyzeQueryLatency(latencyData);
    const report = this.formatQueryLatencyReport({ success: true, data: latencyData }, analysis);

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      cluster: clusterName,
      report: report,
      data: latencyData,
      analysis: analysis
    };
  }

  /**
   * 分析 Query Profile 结果
   */
  analyzeQueryProfileResults(results, args) {
    const { profile_enabled, query_profile } = results;

    // 检查参数
    if (!args.query_id) {
      return {
        status: 'error',
        message: '缺少必需参数 query_id',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    // 检查 Profile 是否开启
    if (!profile_enabled || profile_enabled.length === 0) {
      return {
        status: 'error',
        message: '无法查询 enable_profile 配置',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    const profileEnabledValue = profile_enabled[0].Value || profile_enabled[0].value;
    if (profileEnabledValue !== 'true' && profileEnabledValue !== '1') {
      return {
        status: 'error',
        message: 'Query Profile 未开启。请先开启:\nSET GLOBAL enable_profile = true;',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    // 检查 Profile 数据
    if (!query_profile || query_profile.length === 0 || !query_profile[0].profile) {
      return {
        status: 'error',
        message: `无法获取 Query ID ${args.query_id} 的 Profile。可能原因:\n` +
                 '1. Query ID 不存在\n' +
                 '2. Query Profile 已过期（默认保留时间有限）\n' +
                 '3. Query 尚未执行完成',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    const profile = query_profile[0].profile;
    const profileData = {
      success: true,
      query_id: args.query_id,
      profile: profile,
      profile_size: profile.length,
    };

    // 使用父类方法格式化
    const report = this.formatQueryProfileReport(profileData);

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      query_id: args.query_id,
      report: report,
      data: profileData
    };
  }
}

export { StarRocksQueryPerfExpertSolutionC };
