/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StarRocksCacheExpert } from './cache-expert.js';

class StarRocksCacheExpertSolutionC extends StarRocksCacheExpert {
  constructor() {
    super();
    this.version = '2.0.0-solutionc';
  }

  getQueriesForTool(toolName, args = {}) {
    switch (toolName) {
      case 'analyze_cache_performance':
        // Data Cache 性能分析：使用 SQL 查询
        return this.getCachePerformanceQueries(args);

      case 'analyze_cache_jitter':
        // 缓存抖动分析：使用 Prometheus 时序查询
        return this.getCacheJitterQueries(args);

      case 'analyze_metadata_cache':
        // Metadata Cache 分析：使用 Prometheus 查询
        return this.getMetadataCacheQueries(args);

      default:
        return [
          {
            id: 'default',
            sql: "SELECT 'Tool not fully implemented' as message",
            required: true,
          },
        ];
    }
  }

  /**
   * 获取缓存性能分析的 SQL 查询
   */
  getCachePerformanceQueries() {
    return [
      {
        id: 'run_mode',
        type: 'sql',
        sql: "ADMIN SHOW FRONTEND CONFIG LIKE 'run_mode';",
        description: '检测集群架构类型',
        required: true,
      },
      {
        id: 'compute_nodes',
        type: 'sql',
        sql: 'SHOW COMPUTE NODES;',
        description: 'Compute Nodes 信息',
        required: false,
      },
      {
        id: 'cache_metrics',
        type: 'sql',
        sql: 'SELECT * FROM information_schema.be_cache_metrics;',
        description: '缓存性能指标',
        required: false,
      },
    ];
  }

  /**
   * 获取缓存抖动分析的 Prometheus 查询
   */
  getCacheJitterQueries(args) {
    const timeRange = args.time_range || '1h';
    const step = this.determineStep(timeRange);
    const rateInterval = this.calculateRateInterval(step);

    // 构建 Prometheus 查询
    return [
      {
        id: 'overall_hit_ratio',
        type: 'prometheus_range',
        query: `sum(rate(fslib_open_cache_hits[${rateInterval}])) / (sum(rate(fslib_open_cache_hits[${rateInterval}])) + sum(rate(fslib_open_cache_misses[${rateInterval}])))`,
        description: '整体缓存命中率时序数据',
        start: timeRange,
        step: step,
        required: true,
      },
      {
        id: 'node_hit_ratio',
        type: 'prometheus_range',
        query: `rate(fslib_open_cache_hits[${rateInterval}]) / (rate(fslib_open_cache_hits[${rateInterval}]) + rate(fslib_open_cache_misses[${rateInterval}]))`,
        description: '各节点缓存命中率',
        start: timeRange,
        step: step,
        required: true,
      },
      {
        id: 'node_miss_count',
        type: 'prometheus_range',
        query: `rate(fslib_open_cache_misses[${rateInterval}])`,
        description: '各节点 miss 速率',
        start: timeRange,
        step: step,
        required: true,
      },
      {
        id: 'disk_size',
        type: 'prometheus_instant',
        query: 'fslib_star_cache_disk_size',
        description: '缓存磁盘占用',
        required: false,
      },
    ];
  }

  /**
   * 获取 Metadata Cache 分析的 Prometheus 查询
   */
  getMetadataCacheQueries(args) {
    const timeRange = args.time_range || '1h';
    const step = this.determineStep(timeRange);

    return [
      {
        id: 'usage_percent',
        type: 'prometheus_range',
        query: '(lake_metacache_usage / lake_metacache_capacity) * 100',
        description: 'Metadata Cache 使用率',
        start: timeRange,
        step: step,
        required: true,
      },
      {
        id: 'capacity',
        type: 'prometheus_instant',
        query: 'lake_metacache_capacity',
        description: 'Metadata Cache 容量',
        required: true,
      },
      {
        id: 'used',
        type: 'prometheus_instant',
        query: 'lake_metacache_usage',
        description: 'Metadata Cache 使用量',
        required: true,
      },
    ];
  }

  /**
   * 根据时间范围确定查询步长
   */
  determineStep(timeRange) {
    const match = timeRange.match(/^(\d+)([hmd])$/);
    if (!match) return '1m';

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h':
        return value > 6 ? '5m' : '1m';
      case 'm':
        return '15s';
      case 'd':
        return '15m';
      default:
        return '1m';
    }
  }

  async analyzeQueryResults(toolName, results, args = {}) {
    switch (toolName) {
      case 'analyze_cache_performance':
        return this.analyzeCachePerformance(results, args);

      case 'analyze_cache_jitter':
        return this.analyzeCacheJitter(results, args);

      case 'analyze_metadata_cache':
        return this.analyzeMetadataCache(results, args);

      default:
        return {
          expert: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          tool: toolName,
          results: results,
        };
    }
  }

  /**
   * 分析缓存性能（基于 SQL 查询结果）
   */
  analyzeCachePerformance(results) {
    const { run_mode, compute_nodes, cache_metrics } = results;

    // 检测架构类型
    let architectureType = 'shared_nothing';
    if (run_mode && run_mode.length > 0) {
      architectureType =
        run_mode[0].Value || run_mode[0].value || 'shared_nothing';
    }

    if (architectureType !== 'shared_data') {
      return {
        status: 'not_applicable',
        message: `当前集群是${architectureType === 'shared_nothing' ? '存算一体' : '未知'}架构，Data Cache 分析仅适用于存算分离架构`,
        expert: this.name,
        timestamp: new Date().toISOString(),
        architecture_type: architectureType,
      };
    }

    // 使用父类方法进行诊断
    const diagnosis = this.performCacheDiagnosis({
      architecture_type: architectureType,
      compute_nodes: compute_nodes || [],
      cache_metrics: cache_metrics || [],
    });

    const healthScore = this.calculateCacheHealthScore(diagnosis);
    const recommendations = this.generateCacheRecommendations(diagnosis, {
      cache_metrics,
    });

    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      architecture_type: architectureType,
      cache_health: healthScore,
      diagnosis_results: diagnosis,
      professional_recommendations: recommendations,
      status: 'completed',
    };
  }

  /**
   * 分析缓存抖动（基于 Prometheus 查询结果）
   */
  analyzeCacheJitter(results, args) {
    const { overall_hit_ratio, node_hit_ratio, node_miss_count, disk_size } =
      results;

    // 检查是否有错误
    if (overall_hit_ratio && overall_hit_ratio.error) {
      return {
        status: 'error',
        message: `无法获取 Prometheus 数据: ${overall_hit_ratio.error}`,
        expert: this.name,
        timestamp: new Date().toISOString(),
        fallback_recommendation:
          '请检查 Prometheus 是否运行，并确认指标采集正常',
      };
    }

    // 使用父类方法分析时序数据
    const analysis = this.analyzeTimeSeriesData(
      overall_hit_ratio,
      node_hit_ratio,
      node_miss_count,
      disk_size,
    );

    const recommendations = this.generateTimeSeriesRecommendations(analysis);

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      time_range: args.time_range || '1h',
      overall_hit_ratio: analysis.overall,
      node_hit_ratios: analysis.nodes,
      jitter_detection: analysis.jitter,
      recommendations: recommendations,
    };
  }

  /**
   * 分析 Metadata Cache（基于 Prometheus 查询结果）
   */
  analyzeMetadataCache(results, args) {
    const { usage_percent, capacity, used } = results;

    // 检查是否有错误
    if (usage_percent && usage_percent.error) {
      return {
        status: 'error',
        message: `无法获取 Metadata Cache 数据: ${usage_percent.error}`,
        expert: this.name,
        timestamp: new Date().toISOString(),
        fallback_recommendation:
          '请检查 Prometheus 是否运行，并确认 lake_metacache_* 指标存在',
      };
    }

    // 使用父类方法分析元数据缓存
    const analysis = this.analyzeMetadataCacheData(
      usage_percent,
      capacity,
      used,
    );

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      time_range: args.time_range || '1h',
      metadata_cache_analysis: analysis,
    };
  }
}

export { StarRocksCacheExpertSolutionC };
