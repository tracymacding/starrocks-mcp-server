/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 缓存专家模块
 * 负责：Data Cache 命中率、缓存容量、缓存抖动等缓存性能诊断
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { detectArchitectureType } from './common-utils.js';

class StarRocksCacheExpert {
  constructor() {
    this.name = 'cache';
    this.version = '1.0.0';
    this.description =
      'StarRocks 缓存系统专家 - 负责 Data Cache 命中率、容量和性能诊断';

    // Prometheus 配置
    this.prometheusConfig = {
      host: '127.0.0.1',
      port: 9092,
      protocol: 'http',
    };

    // 缓存专业知识规则库
    this.rules = {
      // 缓存命中率规则
      hit_ratio: {
        excellent_threshold: 90, // 命中率 > 90% 为优秀
        good_threshold: 70, // 命中率 > 70% 为良好
        warning_threshold: 50, // 命中率 < 50% 为警告
        critical_threshold: 30, // 命中率 < 30% 为严重
      },

      // 缓存容量规则
      capacity: {
        warning_threshold: 85, // 使用率 > 85% 为警告
        critical_threshold: 95, // 使用率 > 95% 为严重
      },

      // 缓存抖动检测规则
      jitter: {
        // 命中率标准差阈值
        hit_ratio_std_threshold: 15, // 标准差 > 15% 认为存在抖动
        // 命中率变化率阈值
        hit_ratio_change_threshold: 20, // 短期变化 > 20% 认为存在剧烈波动
      },

      // 推荐的缓存配置
      recommended: {
        min_cache_size_gb: 10, // 最小缓存大小
        cache_to_data_ratio: 0.2, // 推荐缓存占数据比例 20%
      },

      // Metadata Cache 使用率规则
      metadata_cache: {
        warning_threshold: 80, // 使用率 > 80% 为警告
        critical_threshold: 90, // 使用率 > 90% 为严重
        healthy_threshold: 70, // 使用率 < 70% 为健康
      },
    };

    // 专业术语和解释
    this.terminology = {
      data_cache:
        'StarRocks Shared-Data 架构中 Compute Node 的本地缓存，用于缓存热数据减少对象存储访问',
      hit_ratio: '缓存命中率，表示从缓存中成功读取数据的比例',
      cache_jitter:
        '缓存命中率的波动，可能由冷启动、查询模式变化或缓存淘汰引起',
    };
  }

  /**
   * 缓存系统综合诊断
   */
  async diagnose(connection, includeDetails = true) {
    try {
      const startTime = new Date();

      // 1. 收集缓存相关数据
      const cacheData = await this.collectCacheData(connection);

      // 2. 执行专业诊断分析
      const diagnosis = this.performCacheDiagnosis(cacheData);

      // 3. 生成专业建议
      const recommendations = this.generateCacheRecommendations(
        diagnosis,
        cacheData,
      );

      // 4. 计算缓存健康分数
      const healthScore = this.calculateCacheHealthScore(diagnosis);

      const endTime = new Date();
      const analysisTime = endTime - startTime;

      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        analysis_duration_ms: analysisTime,
        cache_health: healthScore,
        diagnosis_results: diagnosis,
        professional_recommendations: recommendations,
        raw_data: includeDetails ? cacheData : null,
        next_check_interval: this.suggestNextCheckInterval(diagnosis),
      };
    } catch (error) {
      throw new Error(`缓存专家诊断失败: ${error.message}`);
    }
  }

  /**
   * 收集缓存相关数据
   */
  async collectCacheData(connection) {
    const data = {
      cache_metrics: [],
      compute_nodes: [],
      architecture_type: null,
    };

    try {
      // 1. 检测架构类型
      const archInfo = await detectArchitectureType(connection);
      data.architecture_type = archInfo.type;

      if (data.architecture_type !== 'shared_data') {
        console.log('当前集群为存算一体架构，不支持 Data Cache 分析');
        return data;
      }

      // 2. 获取 Compute Nodes 信息
      try {
        const [computeNodes] = await connection.query('SHOW COMPUTE NODES;');
        data.compute_nodes = computeNodes;
      } catch (error) {
        console.error('获取 Compute Nodes 失败:', error.message);
      }

      // 3. 获取缓存指标
      try {
        const [cacheMetrics] = await connection.query(`
          SELECT * FROM information_schema.be_cache_metrics;
        `);
        data.cache_metrics = cacheMetrics;
      } catch (error) {
        console.error('获取缓存指标失败:', error.message);
      }
    } catch (error) {
      console.error('收集缓存数据失败:', error.message);
    }

    return data;
  }

  /**
   * 执行缓存诊断
   */
  performCacheDiagnosis(data) {
    const issues = [];
    const warnings = [];
    const criticals = [];
    const insights = [];

    if (data.architecture_type !== 'shared_data') {
      return {
        status: 'not_applicable',
        message: '当前集群为存算一体架构，不适用于 Data Cache 分析',
        total_issues: 0,
        criticals: [],
        warnings: [],
        issues: [],
        insights: [],
      };
    }

    // 1. 缓存命中率诊断
    this.diagnoseCacheHitRatio(data.cache_metrics, issues, warnings, criticals);

    // 2. 缓存容量诊断
    this.diagnoseCacheCapacity(data.cache_metrics, warnings, criticals);

    // 3. 缓存抖动检测（需要历史数据）
    this.detectCacheJitter(data.cache_metrics, warnings, insights);

    return {
      total_issues: issues.length + warnings.length + criticals.length,
      criticals: criticals,
      warnings: warnings,
      issues: issues,
      insights: insights,
      summary: this.generateCacheSummary(criticals, warnings, issues),
    };
  }

  /**
   * 缓存命中率诊断
   */
  diagnoseCacheHitRatio(cacheMetrics, issues, warnings, criticals) {
    if (!cacheMetrics || cacheMetrics.length === 0) {
      warnings.push({
        type: 'no_cache_metrics',
        severity: 'WARNING',
        message: '无法获取缓存指标数据',
        impact: '无法评估缓存性能',
        recommended_actions: [
          '检查 information_schema.be_cache_metrics 表是否可访问',
          '确认 Compute Nodes 是否正常运行',
        ],
      });
      return;
    }

    // 计算整体命中率
    let totalHits = 0;
    let totalRequests = 0;

    cacheMetrics.forEach((metric) => {
      const hitCount = parseInt(metric.hit_count) || 0;
      const missCount = parseInt(metric.miss_count) || 0;
      const requests = hitCount + missCount;

      totalHits += hitCount;
      totalRequests += requests;

      // 单节点命中率分析
      if (requests > 0) {
        const hitRatio = (hitCount / requests) * 100;
        const nodeId = metric.BE_ID || 'unknown';

        if (hitRatio < this.rules.hit_ratio.critical_threshold) {
          criticals.push({
            type: 'low_cache_hit_ratio',
            node: nodeId,
            severity: 'CRITICAL',
            message: `节点 ${nodeId} 缓存命中率过低 (${hitRatio.toFixed(2)}%)`,
            metrics: {
              hit_ratio: hitRatio,
              hit_count: hitCount,
              miss_count: missCount,
            },
            impact: '大量请求访问对象存储，查询性能差，延迟高',
            urgency: 'IMMEDIATE',
          });
        } else if (hitRatio < this.rules.hit_ratio.warning_threshold) {
          warnings.push({
            type: 'low_cache_hit_ratio',
            node: nodeId,
            severity: 'WARNING',
            message: `节点 ${nodeId} 缓存命中率偏低 (${hitRatio.toFixed(2)}%)`,
            metrics: {
              hit_ratio: hitRatio,
              hit_count: hitCount,
              miss_count: missCount,
            },
            impact: '缓存效果不佳，可能影响查询性能',
            urgency: 'WITHIN_DAYS',
          });
        }
      }
    });

    // 整体命中率评估
    if (totalRequests > 0) {
      const overallHitRatio = (totalHits / totalRequests) * 100;

      if (overallHitRatio < this.rules.hit_ratio.warning_threshold) {
        issues.push({
          type: 'overall_low_hit_ratio',
          severity:
            overallHitRatio < this.rules.hit_ratio.critical_threshold
              ? 'CRITICAL'
              : 'WARNING',
          message: `集群整体缓存命中率偏低 (${overallHitRatio.toFixed(2)}%)`,
          metrics: {
            hit_ratio: overallHitRatio,
            total_hits: totalHits,
            total_requests: totalRequests,
          },
          impact: '整体查询性能受影响，建议优化缓存策略',
        });
      }
    }
  }

  /**
   * 缓存容量诊断
   */
  diagnoseCacheCapacity(cacheMetrics, warnings, criticals) {
    if (!cacheMetrics || cacheMetrics.length === 0) return;

    cacheMetrics.forEach((metric) => {
      const capacity = parseInt(metric.disk_cache_capacity_bytes) || 0;
      const used = parseInt(metric.disk_cache_bytes) || 0;

      if (capacity > 0) {
        const usagePercent = (used / capacity) * 100;
        const nodeId = metric.BE_ID || 'unknown';

        if (usagePercent >= this.rules.capacity.critical_threshold) {
          criticals.push({
            type: 'cache_capacity_critical',
            node: nodeId,
            severity: 'CRITICAL',
            message: `节点 ${nodeId} 缓存空间接近满载 (${usagePercent.toFixed(2)}%)`,
            metrics: {
              usage_percent: usagePercent,
              capacity_gb: (capacity / 1024 ** 3).toFixed(2),
              used_gb: (used / 1024 ** 3).toFixed(2),
            },
            impact: '缓存淘汰频繁，严重影响命中率和性能',
            urgency: 'IMMEDIATE',
          });
        } else if (usagePercent >= this.rules.capacity.warning_threshold) {
          warnings.push({
            type: 'cache_capacity_warning',
            node: nodeId,
            severity: 'WARNING',
            message: `节点 ${nodeId} 缓存使用率较高 (${usagePercent.toFixed(2)}%)`,
            metrics: {
              usage_percent: usagePercent,
              capacity_gb: (capacity / 1024 ** 3).toFixed(2),
              used_gb: (used / 1024 ** 3).toFixed(2),
            },
            impact: '缓存可能开始频繁淘汰，建议关注',
            urgency: 'WITHIN_DAYS',
          });
        }
      }
    });
  }

  /**
   * 缓存抖动检测
   * 注意：当前实现基于单次查询，无法检测时序抖动
   * 需要结合 Grafana 监控数据或历史查询来实现完整的抖动检测
   */
  detectCacheJitter(cacheMetrics, warnings, insights) {
    if (!cacheMetrics || cacheMetrics.length === 0) return;

    // 计算各节点命中率的方差
    const hitRatios = [];

    cacheMetrics.forEach((metric) => {
      const hitCount = parseInt(metric.hit_count) || 0;
      const missCount = parseInt(metric.miss_count) || 0;
      const requests = hitCount + missCount;

      if (requests > 0) {
        const hitRatio = (hitCount / requests) * 100;
        hitRatios.push(hitRatio);
      }
    });

    if (hitRatios.length > 1) {
      const mean =
        hitRatios.reduce((sum, val) => sum + val, 0) / hitRatios.length;
      const variance =
        hitRatios.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        hitRatios.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > this.rules.jitter.hit_ratio_std_threshold) {
        warnings.push({
          type: 'cache_hit_ratio_variance',
          severity: 'WARNING',
          message: `各节点缓存命中率差异较大 (标准差: ${stdDev.toFixed(2)}%)`,
          metrics: {
            mean_hit_ratio: mean.toFixed(2),
            std_dev: stdDev.toFixed(2),
            node_count: hitRatios.length,
          },
          impact: '可能存在数据倾斜或节点性能不均',
          recommended_actions: [
            '检查各节点的查询负载是否均衡',
            '分析是否存在热点数据',
            '评估缓存容量配置是否一致',
          ],
        });
      }

      insights.push({
        type: 'cache_hit_ratio_distribution',
        message: '缓存命中率分布分析',
        metrics: {
          mean: mean.toFixed(2),
          std_dev: stdDev.toFixed(2),
          min: Math.min(...hitRatios).toFixed(2),
          max: Math.max(...hitRatios).toFixed(2),
        },
        note: '建议结合 Grafana 监控查看时序趋势以检测抖动',
      });
    }
  }

  /**
   * 生成缓存专业建议
   */
  generateCacheRecommendations(diagnosis, data) {
    const recommendations = [];

    if (diagnosis.status === 'not_applicable') {
      return recommendations;
    }

    // 针对不同类型的问题生成专业建议
    [...diagnosis.criticals, ...diagnosis.warnings].forEach((issue) => {
      switch (issue.type) {
        case 'low_cache_hit_ratio':
        case 'overall_low_hit_ratio':
          recommendations.push({
            category: 'cache_hit_ratio_optimization',
            priority: issue.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            title: '提升缓存命中率',
            description: '优化缓存配置和查询模式以提高命中率',
            professional_actions: [
              {
                action: '增加缓存容量',
                command: '调整 datacache_disk_path 配置，增加本地磁盘缓存空间',
                risk_level: 'LOW',
                estimated_time: '需要重启 Compute Node',
              },
              {
                action: '分析查询模式',
                steps: [
                  '识别常用查询和热点表',
                  '评估是否有大量全表扫描',
                  '检查是否有缓存污染（大查询挤占缓存）',
                ],
              },
              {
                action: '调整缓存淘汰策略',
                command: '评估 datacache_evict_policy 配置',
                note: '可选策略: LRU, LFU 等',
              },
            ],
            monitoring_after_fix: [
              '监控命中率变化趋势',
              '观察对象存储访问量是否下降',
              '评估查询延迟改善情况',
            ],
          });
          break;

        case 'cache_capacity_critical':
        case 'cache_capacity_warning':
          recommendations.push({
            category: 'cache_capacity_expansion',
            priority: issue.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            title: '扩展缓存容量',
            description: `节点 ${issue.node} 缓存空间不足，需要扩容`,
            professional_actions: [
              {
                action: '增加本地磁盘容量',
                steps: [
                  '为 Compute Node 添加更多本地磁盘',
                  '更新 datacache_disk_path 配置',
                  '重启 Compute Node 使配置生效',
                ],
                risk_level: 'MEDIUM',
              },
              {
                action: '增加 Compute Node 数量',
                note: '扩展集群总缓存容量',
                estimated_time: '30-60分钟',
              },
            ],
          });
          break;

        case 'cache_hit_ratio_variance':
          recommendations.push({
            category: 'load_balancing',
            priority: 'MEDIUM',
            title: '优化负载均衡',
            description: '改善各节点间的缓存命中率差异',
            professional_actions: [
              {
                action: '检查查询路由策略',
                note: '确保查询在节点间均匀分布',
              },
              {
                action: '分析数据分布',
                steps: [
                  '检查是否存在数据倾斜',
                  '评估分区和分桶策略',
                  '考虑数据重分布',
                ],
              },
            ],
          });
          break;
      }
    });

    // 添加预防性建议
    recommendations.push(this.generatePreventiveRecommendations(data));

    return recommendations.filter((rec) => rec);
  }

  /**
   * 生成预防性建议
   */
  generatePreventiveRecommendations(data) {
    return {
      category: 'preventive_maintenance',
      priority: 'LOW',
      title: '缓存系统预防性维护建议',
      description: '定期维护建议，保持缓存系统最佳性能',
      professional_actions: [
        {
          action: '持续监控缓存命中率',
          frequency: '实时',
          automation_possible: true,
          note: '建议在 Grafana 设置命中率告警',
        },
        {
          action: '定期分析查询模式',
          frequency: '每周',
          note: '识别缓存效率低的查询并优化',
        },
        {
          action: '评估缓存容量规划',
          frequency: '每月',
          note: '根据数据增长趋势调整缓存容量',
        },
      ],
      grafana_monitoring: {
        recommendation: '建议在 Grafana 监控以下指标',
        key_metrics: [
          'Cache Hit Ratio 趋势图（检测抖动）',
          'Cache Capacity Usage（容量监控）',
          'Cache Hit/Miss Count（请求量分析）',
          'Object Storage Access Rate（评估缓存效果）',
        ],
      },
    };
  }

  /**
   * 计算缓存健康分数
   */
  calculateCacheHealthScore(diagnosis) {
    if (diagnosis.status === 'not_applicable') {
      return {
        score: 0,
        level: 'N/A',
        status: 'NOT_APPLICABLE',
      };
    }

    let score = 100;

    // 严重问题扣分
    score -= diagnosis.criticals.length * 20;
    // 警告扣分
    score -= diagnosis.warnings.length * 10;
    // 一般问题扣分
    score -= diagnosis.issues.length * 5;

    score = Math.max(0, score);

    let level = 'EXCELLENT';
    if (score < 50) level = 'POOR';
    else if (score < 70) level = 'FAIR';
    else if (score < 85) level = 'GOOD';

    return {
      score: score,
      level: level,
      status:
        diagnosis.criticals.length > 0
          ? 'CRITICAL'
          : diagnosis.warnings.length > 0
            ? 'WARNING'
            : 'HEALTHY',
    };
  }

  /**
   * 生成缓存诊断摘要
   */
  generateCacheSummary(criticals, warnings, issues) {
    if (criticals.length > 0) {
      return `发现 ${criticals.length} 个严重缓存问题需要立即处理`;
    } else if (warnings.length > 0) {
      return `发现 ${warnings.length} 个缓存警告需要关注`;
    } else if (issues.length > 0) {
      return `发现 ${issues.length} 个缓存问题建议优化`;
    }
    return '缓存系统运行正常';
  }

  /**
   * 建议下次检查间隔
   */
  suggestNextCheckInterval(diagnosis) {
    if (diagnosis.status === 'not_applicable') {
      return 'N/A';
    }

    if (diagnosis.criticals.length > 0) {
      return '5分钟'; // 严重问题需要频繁检查
    } else if (diagnosis.warnings.length > 0) {
      return '30分钟'; // 警告问题适中频率检查
    } else {
      return '1小时'; // 正常状态定期检查
    }
  }

  /**
   * 计算 rate 函数的时间窗口
   * Prometheus 最佳实践: rate 窗口应该是 scrape interval 的 4-5 倍
   */
  calculateRateInterval(step) {
    // 解析 step 时间
    const stepMatch = step.match(/^(\d+)([smh])$/);
    if (!stepMatch) return '5m'; // 默认值

    const value = parseInt(stepMatch[1]);
    const unit = stepMatch[2];

    // 计算 rate 窗口（4 倍 step）
    let rateValue = value * 4;

    // 确保最小值
    if (unit === 's' && rateValue < 60) {
      rateValue = 60;
      return '1m';
    }

    return `${rateValue}${unit}`;
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
          `Prometheus API 请求失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(
          `Prometheus 查询失败: ${data.error || 'unknown error'}`,
        );
      }

      return data.data;
    } catch (error) {
      console.error('查询 Prometheus 失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询 Prometheus 范围数据
   */
  async queryPrometheusRange(query, start, end, step = '1m') {
    const url = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}/api/v1/query_range`;

    const params = new URLSearchParams({
      query: query,
      start: start,
      end: end,
      step: step,
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(
          `Prometheus API 请求失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(
          `Prometheus 查询失败: ${data.error || 'unknown error'}`,
        );
      }

      return data.data;
    } catch (error) {
      console.error('查询 Prometheus 失败:', error.message);
      throw error;
    }
  }

  /**
   * 分析 Metadata Cache 使用情况
   */
  async analyzeMetadataCache(connection, timeRange = '1h') {
    try {
      const now = Math.floor(Date.now() / 1000);
      let startTime;
      let step = '1m';

      // 解析时间范围
      const rangeMatch = timeRange.match(/^(\d+)([hmd])$/);
      if (rangeMatch) {
        const value = parseInt(rangeMatch[1]);
        const unit = rangeMatch[2];

        switch (unit) {
          case 'h':
            startTime = now - value * 3600;
            step = value > 6 ? '5m' : '1m';
            break;
          case 'm':
            startTime = now - value * 60;
            step = '15s';
            break;
          case 'd':
            startTime = now - value * 86400;
            step = '15m';
            break;
          default:
            startTime = now - 3600;
        }
      } else {
        startTime = now - 3600;
      }

      // 查询 metadata cache 使用率
      const usageQuery = `
        (lake_metacache_usage / lake_metacache_capacity) * 100
      `.trim();

      // 查询 metadata cache 容量
      const capacityQuery = `lake_metacache_capacity`;

      // 查询 metadata cache 使用量
      const usedQuery = `lake_metacache_usage`;

      const [usageData, capacityData, usedData] = await Promise.all([
        this.queryPrometheusRange(usageQuery, startTime, now, step),
        this.queryPrometheusInstant(capacityQuery),
        this.queryPrometheusInstant(usedQuery),
      ]);

      // 分析数据
      const analysis = this.analyzeMetadataCacheData(
        usageData,
        capacityData,
        usedData,
      );

      return {
        status: 'success',
        time_range: timeRange,
        query_time: {
          start: new Date(startTime * 1000).toISOString(),
          end: new Date(now * 1000).toISOString(),
        },
        metadata_cache_analysis: analysis,
      };
    } catch (error) {
      return {
        status: 'error',
        message: `无法获取 Metadata Cache 数据: ${error.message}`,
        fallback_recommendation:
          '请检查 Prometheus 是否运行在 127.0.0.1:9092，并确认 lake_metacache_* 指标存在',
      };
    }
  }

  /**
   * 分析 Metadata Cache 数据
   */
  analyzeMetadataCacheData(usageData, capacityData, usedData) {
    const analysis = {
      nodes: [],
      overall: {
        total_capacity: 0,
        total_used: 0,
        avg_usage_percent: 0,
      },
      issues: [],
      warnings: [],
      criticals: [],
    };

    // 构建节点映射
    const nodeMap = new Map();

    // 分析使用率时序数据
    if (usageData && usageData.result) {
      usageData.result.forEach((series) => {
        const instance = series.metric.instance || 'unknown';
        const job = series.metric.job || 'unknown';
        const nodeType = this.detectNodeType(series.metric);

        const values = series.values
          .map((v) => parseFloat(v[1]))
          .filter((v) => !isNaN(v));

        if (values.length > 0) {
          const current = values[values.length - 1];
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const max = Math.max(...values);
          const min = Math.min(...values);

          nodeMap.set(instance, {
            instance: instance,
            job: job,
            node_type: nodeType,
            usage_percent_current: current,
            usage_percent_mean: mean,
            usage_percent_max: max,
            usage_percent_min: min,
          });
        }
      });
    }

    // 添加容量和使用量数据
    if (capacityData && capacityData.result) {
      capacityData.result.forEach((series) => {
        const instance = series.metric.instance || 'unknown';
        const value = series.value;

        if (value && value.length > 1 && nodeMap.has(instance)) {
          const capacity = parseFloat(value[1]);
          if (!isNaN(capacity)) {
            const node = nodeMap.get(instance);
            node.capacity_bytes = capacity;
            node.capacity_mb = capacity / 1024 ** 2;
            node.capacity_gb = capacity / 1024 ** 3;
            analysis.overall.total_capacity += capacity;
          }
        }
      });
    }

    if (usedData && usedData.result) {
      usedData.result.forEach((series) => {
        const instance = series.metric.instance || 'unknown';
        const value = series.value;

        if (value && value.length > 1 && nodeMap.has(instance)) {
          const used = parseFloat(value[1]);
          if (!isNaN(used)) {
            const node = nodeMap.get(instance);
            node.used_bytes = used;
            node.used_mb = used / 1024 ** 2;
            node.used_gb = used / 1024 ** 3;
            analysis.overall.total_used += used;
          }
        }
      });
    }

    // 转换为数组并诊断
    analysis.nodes = Array.from(nodeMap.values());

    // 计算整体使用率
    if (analysis.overall.total_capacity > 0) {
      analysis.overall.avg_usage_percent =
        (analysis.overall.total_used / analysis.overall.total_capacity) * 100;
    }

    // 执行诊断
    this.diagnoseMetadataCache(analysis);

    return analysis;
  }

  /**
   * 检测节点类型 (BE/CN)
   */
  detectNodeType(metric) {
    const job = (metric.job || '').toLowerCase();
    const group = (metric.group || '').toLowerCase();
    const instance = (metric.instance || '').toLowerCase();

    if (job.includes('cn') || group.includes('cn') || instance.includes('cn')) {
      return 'CN';
    } else if (
      job.includes('be') ||
      group.includes('be') ||
      instance.includes('be')
    ) {
      return 'BE';
    }
    return 'UNKNOWN';
  }

  /**
   * 诊断 Metadata Cache
   */
  diagnoseMetadataCache(analysis) {
    analysis.nodes.forEach((node) => {
      const usage = node.usage_percent_current;

      if (usage >= this.rules.metadata_cache.critical_threshold) {
        analysis.criticals.push({
          type: 'metadata_cache_critical',
          node: node.instance,
          node_type: node.node_type,
          severity: 'CRITICAL',
          message: `${node.node_type} 节点 ${node.instance} Metadata Cache 使用率严重过高 (${usage.toFixed(2)}%)`,
          metrics: {
            usage_percent: usage,
            capacity_mb: node.capacity_mb,
            used_mb: node.used_mb,
          },
          impact: 'Metadata Cache 即将耗尽，可能导致查询失败或性能严重下降',
          urgency: 'IMMEDIATE',
          recommended_actions: [
            '立即检查是否有内存泄漏',
            '考虑重启节点清理 Metadata Cache',
            '增加 Metadata Cache 容量配置',
            '检查是否有异常大量的元数据操作',
          ],
        });
      } else if (usage >= this.rules.metadata_cache.warning_threshold) {
        analysis.warnings.push({
          type: 'metadata_cache_warning',
          node: node.instance,
          node_type: node.node_type,
          severity: 'WARNING',
          message: `${node.node_type} 节点 ${node.instance} Metadata Cache 使用率偏高 (${usage.toFixed(2)}%)`,
          metrics: {
            usage_percent: usage,
            capacity_mb: node.capacity_mb,
            used_mb: node.used_mb,
          },
          impact: 'Metadata Cache 压力较大，需要关注',
          urgency: 'WITHIN_DAYS',
          recommended_actions: [
            '监控使用率趋势',
            '评估是否需要增加容量',
            '检查元数据访问模式',
          ],
        });
      }

      // 检查使用率波动
      if (node.usage_percent_max - node.usage_percent_min > 20) {
        analysis.warnings.push({
          type: 'metadata_cache_fluctuation',
          node: node.instance,
          node_type: node.node_type,
          severity: 'WARNING',
          message: `${node.node_type} 节点 ${node.instance} Metadata Cache 使用率波动较大`,
          metrics: {
            min: node.usage_percent_min,
            max: node.usage_percent_max,
            range: node.usage_percent_max - node.usage_percent_min,
          },
          impact: '可能存在间歇性的元数据密集操作',
        });
      }
    });

    // 整体诊断
    if (
      analysis.overall.avg_usage_percent >=
      this.rules.metadata_cache.critical_threshold
    ) {
      analysis.issues.push({
        type: 'overall_metadata_cache_high',
        severity: 'CRITICAL',
        message: `集群整体 Metadata Cache 使用率过高 (${analysis.overall.avg_usage_percent.toFixed(2)}%)`,
        impact: '整体元数据缓存压力大，需要立即优化',
      });
    }
  }

  /**
   * 分析缓存命中率时序数据
   */
  async analyzeCacheHitRatioTimeSeries(connection, timeRange = '1h') {
    try {
      const now = Math.floor(Date.now() / 1000);
      let startTime;
      let step = '1m';

      // 解析时间范围
      const rangeMatch = timeRange.match(/^(\d+)([hmd])$/);
      if (rangeMatch) {
        const value = parseInt(rangeMatch[1]);
        const unit = rangeMatch[2];

        switch (unit) {
          case 'h':
            startTime = now - value * 3600;
            step = value > 6 ? '5m' : '1m';
            break;
          case 'm':
            startTime = now - value * 60;
            step = '15s';
            break;
          case 'd':
            startTime = now - value * 86400;
            step = '15m';
            break;
          default:
            startTime = now - 3600; // 默认 1 小时
        }
      } else {
        startTime = now - 3600;
      }

      // 计算 rate 窗口（通常为 step 的 4 倍）
      const rateInterval = this.calculateRateInterval(step);

      // 查询缓存命中率（整体）
      const hitRatioQuery = `
        sum(rate(fslib_open_cache_hits[${rateInterval}])) /
        (sum(rate(fslib_open_cache_hits[${rateInterval}])) + sum(rate(fslib_open_cache_misses[${rateInterval}])))
      `.trim();

      // 查询各节点命中率
      const nodeHitRatioQuery = `
        rate(fslib_open_cache_hits[${rateInterval}]) /
        (rate(fslib_open_cache_hits[${rateInterval}]) + rate(fslib_open_cache_misses[${rateInterval}]))
      `.trim();

      // 查询各节点 miss 次数
      const nodeMissCountQuery = `rate(fslib_open_cache_misses[${rateInterval}])`;

      // 查询磁盘空间占用（即时查询）
      const diskSizeQuery = `fslib_star_cache_disk_size`;

      const [overallData, nodeData, missData, diskData] = await Promise.all([
        this.queryPrometheusRange(hitRatioQuery, startTime, now, step),
        this.queryPrometheusRange(nodeHitRatioQuery, startTime, now, step),
        this.queryPrometheusRange(nodeMissCountQuery, startTime, now, step),
        this.queryPrometheusInstant(diskSizeQuery),
      ]);

      // 分析时序数据
      const analysis = this.analyzeTimeSeriesData(
        overallData,
        nodeData,
        missData,
        diskData,
      );

      return {
        status: 'success',
        time_range: timeRange,
        query_time: {
          start: new Date(startTime * 1000).toISOString(),
          end: new Date(now * 1000).toISOString(),
        },
        overall_hit_ratio: analysis.overall,
        node_hit_ratios: analysis.nodes,
        jitter_detection: analysis.jitter,
        recommendations: this.generateTimeSeriesRecommendations(analysis),
      };
    } catch (error) {
      return {
        status: 'error',
        message: `无法获取 Prometheus 数据: ${error.message}`,
        fallback_recommendation:
          '请检查 Prometheus 是否运行在 127.0.0.1:9092，或在 Grafana 手动查看 Cache Hit Ratio 趋势',
      };
    }
  }

  /**
   * 分析时序数据
   */
  analyzeTimeSeriesData(overallData, nodeData, missData, diskData) {
    const analysis = {
      overall: {
        current: 0,
        mean: 0,
        min: 100,
        max: 0,
        std_dev: 0,
        trend: 'stable',
      },
      nodes: [],
      jitter: {
        detected: false,
        severity: 'none',
        issues: [],
      },
    };

    // 分析整体命中率
    if (overallData.result && overallData.result.length > 0) {
      const values = overallData.result[0].values
        .map((v) => parseFloat(v[1]) * 100)
        .filter((v) => !isNaN(v));

      if (values.length > 0) {
        analysis.overall.current = values[values.length - 1];
        analysis.overall.mean =
          values.reduce((a, b) => a + b, 0) / values.length;
        analysis.overall.min = Math.min(...values);
        analysis.overall.max = Math.max(...values);

        // 计算标准差
        const variance =
          values.reduce(
            (sum, val) => sum + Math.pow(val - analysis.overall.mean, 2),
            0,
          ) / values.length;
        analysis.overall.std_dev = Math.sqrt(variance);

        // 判断趋势
        if (values.length >= 3) {
          const recent = values.slice(-Math.min(10, values.length));
          const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
          const older = values.slice(0, Math.min(10, values.length));
          const olderMean = older.reduce((a, b) => a + b, 0) / older.length;

          if (recentMean > olderMean + 5) {
            analysis.overall.trend = 'improving';
          } else if (recentMean < olderMean - 5) {
            analysis.overall.trend = 'degrading';
          }
        }
      }
    }

    // 构建节点数据映射
    const nodeMap = new Map();

    // 分析各节点命中率
    if (nodeData.result) {
      nodeData.result.forEach((series) => {
        const nodeId =
          series.metric.instance || series.metric.be_id || 'unknown';
        const fstype = series.metric.fstype || 'unknown';
        const values = series.values
          .map((v) => parseFloat(v[1]) * 100)
          .filter((v) => !isNaN(v));

        if (values.length > 0) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance =
            values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            values.length;
          const stdDev = Math.sqrt(variance);

          // 趋势分析
          let trend = 'stable';
          if (values.length >= 10) {
            const recent = values.slice(-5);
            const recentMean =
              recent.reduce((a, b) => a + b, 0) / recent.length;
            const older = values.slice(0, 5);
            const olderMean = older.reduce((a, b) => a + b, 0) / older.length;

            if (recentMean > olderMean + 5) {
              trend = 'improving';
            } else if (recentMean < olderMean - 5) {
              trend = 'degrading';
            }
          }

          nodeMap.set(nodeId, {
            node_id: nodeId,
            fstype: fstype,
            current: values[values.length - 1],
            mean: mean,
            std_dev: stdDev,
            min: Math.min(...values),
            max: Math.max(...values),
            trend: trend,
          });
        }
      });
    }

    // 添加 miss count 数据
    if (missData && missData.result) {
      missData.result.forEach((series) => {
        const nodeId =
          series.metric.instance || series.metric.be_id || 'unknown';
        const values = series.values
          .map((v) => parseFloat(v[1]))
          .filter((v) => !isNaN(v));

        if (values.length > 0 && nodeMap.has(nodeId)) {
          const node = nodeMap.get(nodeId);
          node.miss_count_total = values.reduce((a, b) => a + b, 0);
          node.miss_rate_current = values[values.length - 1];
          node.miss_rate_mean =
            values.reduce((a, b) => a + b, 0) / values.length;
        }
      });
    }

    // 添加磁盘空间数据
    if (diskData && diskData.result) {
      diskData.result.forEach((series) => {
        const nodeId =
          series.metric.instance || series.metric.be_id || 'unknown';
        const value = series.value;

        if (value && value.length > 1 && nodeMap.has(nodeId)) {
          const sizeBytes = parseFloat(value[1]);
          if (!isNaN(sizeBytes)) {
            const node = nodeMap.get(nodeId);
            node.disk_size_bytes = sizeBytes;
            node.disk_size_gb = sizeBytes / 1024 ** 3;
            node.disk_size_mb = sizeBytes / 1024 ** 2;
          }
        }
      });
    }

    // 转换为数组
    analysis.nodes = Array.from(nodeMap.values());

    // 抖动检测
    this.detectTimeSeriesJitter(analysis);

    return analysis;
  }

  /**
   * 检测时序数据中的抖动
   */
  detectTimeSeriesJitter(analysis) {
    const issues = [];

    // 1. 整体命中率标准差检测
    if (analysis.overall.std_dev > this.rules.jitter.hit_ratio_std_threshold) {
      issues.push({
        type: 'high_overall_variance',
        message: `整体缓存命中率波动较大 (标准差: ${analysis.overall.std_dev.toFixed(2)}%)`,
        severity: 'WARNING',
        impact: '缓存性能不稳定，可能存在间歇性性能问题',
      });
      analysis.jitter.detected = true;
      analysis.jitter.severity = 'medium';
    }

    // 2. 命中率范围过大
    const range = analysis.overall.max - analysis.overall.min;
    if (range > this.rules.jitter.hit_ratio_change_threshold) {
      issues.push({
        type: 'wide_hit_ratio_range',
        message: `命中率变化范围过大 (${analysis.overall.min.toFixed(2)}% ~ ${analysis.overall.max.toFixed(2)}%)`,
        severity: 'WARNING',
        impact: '缓存效果不一致，查询性能波动明显',
      });
      analysis.jitter.detected = true;
      analysis.jitter.severity = 'medium';
    }

    // 3. 趋势恶化检测
    if (analysis.overall.trend === 'degrading') {
      issues.push({
        type: 'degrading_trend',
        message: '缓存命中率呈下降趋势',
        severity: 'WARNING',
        impact: '性能可能持续恶化，需要介入优化',
      });
      analysis.jitter.detected = true;
    }

    // 4. 各节点差异过大
    if (analysis.nodes.length > 1) {
      const nodeMeans = analysis.nodes.map((n) => n.mean);
      const maxNodeDiff = Math.max(...nodeMeans) - Math.min(...nodeMeans);

      if (maxNodeDiff > 20) {
        issues.push({
          type: 'node_imbalance',
          message: `各节点命中率差异过大 (最大差异: ${maxNodeDiff.toFixed(2)}%)`,
          severity: 'WARNING',
          impact: '负载不均衡或存在问题节点',
        });
        analysis.jitter.detected = true;
      }
    }

    analysis.jitter.issues = issues;

    if (issues.length >= 2) {
      analysis.jitter.severity = 'high';
    } else if (issues.length === 1) {
      analysis.jitter.severity = 'medium';
    }
  }

  /**
   * 生成时序分析建议
   */
  generateTimeSeriesRecommendations(analysis) {
    const recommendations = [];

    if (analysis.jitter.detected) {
      recommendations.push({
        priority: 'HIGH',
        title: '缓存抖动检测到异常',
        actions: analysis.jitter.issues.map((issue) => issue.message),
        immediate_steps: [
          '检查是否有大查询或全表扫描污染缓存',
          '评估缓存容量是否充足',
          '查看是否有节点重启或故障',
        ],
      });
    }

    if (analysis.overall.trend === 'degrading') {
      recommendations.push({
        priority: 'HIGH',
        title: '命中率持续下降',
        actions: [
          '立即检查缓存容量使用情况',
          '分析最近的查询模式变化',
          '考虑扩展缓存容量',
        ],
      });
    }

    if (analysis.overall.mean < this.rules.hit_ratio.warning_threshold) {
      recommendations.push({
        priority: 'MEDIUM',
        title: '平均命中率偏低',
        actions: [
          '优化查询模式，减少冷数据访问',
          '增加缓存容量',
          '调整缓存淘汰策略',
        ],
      });
    }

    return recommendations;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   */
  getToolHandlers() {
    return {
      analyze_cache_performance: async (args, context) => {
        console.log(
          '🎯 Tool handler 接收到的参数:',
          JSON.stringify(args, null, 2),
        );

        const connection = context.connection;
        const result = await this.diagnose(
          connection,
          args.include_details !== false,
        );

        const report = this.formatCacheReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },

      analyze_cache_jitter: async (args, context) => {
        console.log('🎯 缓存抖动分析接收参数:', JSON.stringify(args, null, 2));

        const connection = context.connection;
        const timeRange = args.time_range || '1h';

        const result = await this.analyzeCacheHitRatioTimeSeries(
          connection,
          timeRange,
        );

        const report = this.formatJitterReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },

      analyze_metadata_cache: async (args, context) => {
        console.log(
          '🎯 Metadata Cache 分析接收参数:',
          JSON.stringify(args, null, 2),
        );

        const connection = context.connection;
        const timeRange = args.time_range || '1h';

        const result = await this.analyzeMetadataCache(connection, timeRange);

        const report = this.formatMetadataCacheReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    };
  }

  /**
   * 格式化 Metadata Cache 分析报告
   */
  formatMetadataCacheReport(result) {
    let report = '🗂️  StarRocks Metadata Cache 分析报告\n';
    report += '========================================\n\n';

    if (result.status === 'error') {
      report += `❌ ${result.message}\n`;
      report += `💡 ${result.fallback_recommendation}\n`;
      return report;
    }

    const analysis = result.metadata_cache_analysis;

    // 时间范围
    report += `⏰ **分析时间范围**: ${result.time_range}\n`;
    report += `   起始: ${result.query_time.start}\n`;
    report += `   结束: ${result.query_time.end}\n\n`;

    // 整体统计
    report += '📊 **集群整体统计**:\n';
    report += `   总容量: ${(analysis.overall.total_capacity / 1024 ** 3).toFixed(2)} GB\n`;
    report += `   总使用: ${(analysis.overall.total_used / 1024 ** 3).toFixed(2)} GB\n`;
    report += `   平均使用率: ${analysis.overall.avg_usage_percent.toFixed(2)}%\n\n`;

    // 健康状态评估
    const overallStatus =
      analysis.overall.avg_usage_percent >=
      this.rules.metadata_cache.critical_threshold
        ? '🔴 严重'
        : analysis.overall.avg_usage_percent >=
            this.rules.metadata_cache.warning_threshold
          ? '🟡 警告'
          : '🟢 健康';
    report += `   整体健康状态: ${overallStatus}\n\n`;

    // 各节点详情
    if (analysis.nodes && analysis.nodes.length > 0) {
      report += '🖥️  **各节点 Metadata Cache 使用情况**:\n';

      // 按节点类型分组
      const beNodes = analysis.nodes.filter((n) => n.node_type === 'BE');
      const cnNodes = analysis.nodes.filter((n) => n.node_type === 'CN');
      const otherNodes = analysis.nodes.filter(
        (n) => n.node_type === 'UNKNOWN',
      );

      const printNodes = (nodes, label) => {
        if (nodes.length > 0) {
          report += `\n  ${label}:\n`;
          nodes.forEach((node) => {
            const statusEmoji =
              node.usage_percent_current >=
              this.rules.metadata_cache.critical_threshold
                ? '🔴'
                : node.usage_percent_current >=
                    this.rules.metadata_cache.warning_threshold
                  ? '🟡'
                  : '🟢';

            report += `  ${statusEmoji} 节点 ${node.instance}:\n`;
            report += `     当前使用率: ${node.usage_percent_current.toFixed(2)}%\n`;
            report += `     平均使用率: ${node.usage_percent_mean.toFixed(2)}%\n`;
            report += `     使用率范围: ${node.usage_percent_min.toFixed(2)}% ~ ${node.usage_percent_max.toFixed(2)}%\n`;

            if (node.capacity_gb !== undefined) {
              if (node.capacity_gb >= 1) {
                report += `     容量: ${node.capacity_gb.toFixed(2)} GB`;
              } else {
                report += `     容量: ${node.capacity_mb.toFixed(2)} MB`;
              }

              if (node.used_gb !== undefined) {
                if (node.used_gb >= 1) {
                  report += ` | 已用: ${node.used_gb.toFixed(2)} GB\n`;
                } else {
                  report += ` | 已用: ${node.used_mb.toFixed(2)} MB\n`;
                }
              } else {
                report += '\n';
              }
            }
          });
        }
      };

      printNodes(beNodes, 'BE 节点');
      printNodes(cnNodes, 'CN 节点');
      printNodes(otherNodes, '其他节点');

      report += '\n';
    }

    // 严重问题
    if (analysis.criticals && analysis.criticals.length > 0) {
      report += '🔴 **严重问题**:\n';
      analysis.criticals.forEach((issue) => {
        report += `   • ${issue.message}\n`;
        report += `     影响: ${issue.impact}\n`;
        if (issue.recommended_actions) {
          report += '     建议行动:\n';
          issue.recommended_actions.forEach((action) => {
            report += `       - ${action}\n`;
          });
        }
      });
      report += '\n';
    }

    // 警告
    if (analysis.warnings && analysis.warnings.length > 0) {
      report += '🟡 **警告**:\n';
      analysis.warnings.forEach((issue) => {
        report += `   • ${issue.message}\n`;
        if (issue.impact) {
          report += `     影响: ${issue.impact}\n`;
        }
      });
      report += '\n';
    }

    // 一般问题
    if (analysis.issues && analysis.issues.length > 0) {
      report += 'ℹ️  **其他问题**:\n';
      analysis.issues.forEach((issue) => {
        report += `   • ${issue.message}\n`;
        if (issue.impact) {
          report += `     影响: ${issue.impact}\n`;
        }
      });
      report += '\n';
    }

    // 总体建议
    if (
      !analysis.criticals.length &&
      !analysis.warnings.length &&
      !analysis.issues.length
    ) {
      report += '✅ **结论**: Metadata Cache 使用情况健康\n\n';
    } else {
      report += '💡 **建议**:\n';
      if (analysis.criticals.length > 0) {
        report += '   ⚠️  存在严重问题，建议立即处理\n';
      }
      if (analysis.warnings.length > 0) {
        report += '   ⚡ 存在警告问题，建议尽快关注\n';
      }
      report += '   📋 定期监控 Metadata Cache 使用率趋势\n';
      report += '   🔍 分析使用率较高的节点，评估是否需要扩容\n';
    }

    return report;
  }

  /**
   * 格式化抖动分析报告
   */
  formatJitterReport(result) {
    let report = '📈 StarRocks Data Cache 抖动分析报告\n';
    report += '========================================\n\n';

    if (result.status === 'error') {
      report += `❌ ${result.message}\n`;
      report += `💡 ${result.fallback_recommendation}\n`;
      return report;
    }

    // 时间范围
    report += `⏰ **分析时间范围**: ${result.time_range}\n`;
    report += `   起始: ${result.query_time.start}\n`;
    report += `   结束: ${result.query_time.end}\n\n`;

    // 整体命中率统计
    const overall = result.overall_hit_ratio;
    report += '📊 **整体命中率统计**:\n';
    report += `   当前值: ${overall.current.toFixed(2)}%\n`;
    report += `   平均值: ${overall.mean.toFixed(2)}%\n`;
    report += `   最小值: ${overall.min.toFixed(2)}%\n`;
    report += `   最大值: ${overall.max.toFixed(2)}%\n`;
    report += `   标准差: ${overall.std_dev.toFixed(2)}%\n`;

    const trendEmoji =
      overall.trend === 'improving'
        ? '📈'
        : overall.trend === 'degrading'
          ? '📉'
          : '➡️';
    report += `   趋势: ${trendEmoji} ${overall.trend}\n\n`;

    // 抖动检测结果
    const jitter = result.jitter_detection;
    if (jitter.detected) {
      const severityEmoji =
        jitter.severity === 'high'
          ? '🔴'
          : jitter.severity === 'medium'
            ? '🟡'
            : '🟢';
      report += `${severityEmoji} **抖动检测**: 检测到异常 (严重程度: ${jitter.severity})\n`;
      jitter.issues.forEach((issue) => {
        report += `   • ${issue.message}\n`;
        report += `     影响: ${issue.impact}\n`;
      });
      report += '\n';
    } else {
      report += '🟢 **抖动检测**: 未检测到异常\n\n';
    }

    // 各节点详细信息
    if (result.node_hit_ratios && result.node_hit_ratios.length > 0) {
      report += '🖥️  **各节点详细信息**:\n';
      result.node_hit_ratios.forEach((node) => {
        report += `   节点 ${node.node_id}`;
        if (node.fstype) {
          report += ` (fstype=${node.fstype})`;
        }
        report += ':\n';

        // 命中率
        report += `     命中率: 当前 ${node.current.toFixed(2)}% | 平均 ${node.mean.toFixed(2)}% | `;
        report += `范围 ${node.min.toFixed(2)}%-${node.max.toFixed(2)}%\n`;
        report += `     标准差: ${node.std_dev.toFixed(2)}%\n`;

        // Miss 信息
        if (node.miss_count_total !== undefined) {
          report += `     Cache Miss: 总计 ${node.miss_count_total.toFixed(0)} 次`;
          if (node.miss_rate_current !== undefined) {
            report += ` | 当前速率 ${node.miss_rate_current.toFixed(2)}/s`;
          }
          report += '\n';
        }

        // 磁盘空间
        if (node.disk_size_gb !== undefined) {
          if (node.disk_size_gb >= 1) {
            report += `     磁盘占用: ${node.disk_size_gb.toFixed(2)} GB\n`;
          } else {
            report += `     磁盘占用: ${node.disk_size_mb.toFixed(2)} MB\n`;
          }
        }

        // 趋势
        if (node.trend) {
          const trendEmoji =
            node.trend === 'improving'
              ? '📈'
              : node.trend === 'degrading'
                ? '📉'
                : '➡️';
          report += `     趋势: ${trendEmoji} ${node.trend}\n`;
        }
      });
      report += '\n';
    }

    // 优化建议
    if (result.recommendations && result.recommendations.length > 0) {
      report += '💡 **优化建议**:\n';
      result.recommendations.forEach((rec, index) => {
        const priorityEmoji =
          rec.priority === 'HIGH'
            ? '🔴'
            : rec.priority === 'MEDIUM'
              ? '🟡'
              : '🔵';
        report += `  ${index + 1}. ${priorityEmoji} [${rec.priority}] ${rec.title}\n`;
        if (rec.actions) {
          rec.actions.forEach((action) => {
            report += `     - ${action}\n`;
          });
        }
        if (rec.immediate_steps) {
          report += '     立即行动:\n';
          rec.immediate_steps.forEach((step) => {
            report += `       • ${step}\n`;
          });
        }
      });
    }

    return report;
  }

  /**
   * 格式化缓存分析报告
   */
  formatCacheReport(analysis) {
    let report = '📊 StarRocks Data Cache 性能分析\n';
    report += '========================================\n\n';

    if (
      analysis.diagnosis_results.status === 'not_applicable' ||
      analysis.raw_data?.architecture_type !== 'shared_data'
    ) {
      report += 'ℹ️  当前集群为存算一体架构，不支持 Data Cache 分析\n';
      return report;
    }

    // 健康评分
    const health = analysis.cache_health;
    const healthEmoji =
      health.status === 'CRITICAL'
        ? '🔴'
        : health.status === 'WARNING'
          ? '🟡'
          : '🟢';
    report += `${healthEmoji} **缓存健康评分**: ${health.score}/100 (${health.level})\n\n`;

    // 缓存指标概览
    if (analysis.raw_data?.cache_metrics?.length > 0) {
      let totalHits = 0;
      let totalRequests = 0;
      let totalCapacity = 0;
      let totalUsed = 0;

      analysis.raw_data.cache_metrics.forEach((metric) => {
        const hitCount = parseInt(metric.hit_count) || 0;
        const missCount = parseInt(metric.miss_count) || 0;
        totalHits += hitCount;
        totalRequests += hitCount + missCount;
        totalCapacity += parseInt(metric.disk_cache_capacity_bytes) || 0;
        totalUsed += parseInt(metric.disk_cache_bytes) || 0;
      });

      const hitRatio =
        totalRequests > 0 ? ((totalHits / totalRequests) * 100).toFixed(2) : 0;
      const capacityUsage =
        totalCapacity > 0 ? ((totalUsed / totalCapacity) * 100).toFixed(2) : 0;

      report += '📦 **整体缓存指标**:\n';
      report += `   总缓存容量: ${(totalCapacity / 1024 ** 3).toFixed(2)} GB\n`;
      report += `   已用容量: ${(totalUsed / 1024 ** 3).toFixed(2)} GB (${capacityUsage}%)\n`;
      report += `   整体命中率: ${hitRatio}%\n`;
      report += `   总请求数: ${totalRequests.toLocaleString()}\n\n`;
    }

    // 问题汇总
    const diagnosis = analysis.diagnosis_results;
    if (diagnosis.criticals.length > 0) {
      report += '🔴 **严重问题**:\n';
      diagnosis.criticals.forEach((issue) => {
        report += `   • ${issue.message}\n`;
        report += `     影响: ${issue.impact}\n`;
      });
      report += '\n';
    }

    if (diagnosis.warnings.length > 0) {
      report += '🟡 **警告**:\n';
      diagnosis.warnings.forEach((issue) => {
        report += `   • ${issue.message}\n`;
      });
      report += '\n';
    }

    // 优化建议
    if (analysis.professional_recommendations.length > 0) {
      report += '💡 **优化建议** (Top 3):\n';
      const topRecs = analysis.professional_recommendations
        .filter((rec) => rec.priority !== 'LOW')
        .slice(0, 3);

      topRecs.forEach((rec, index) => {
        const priorityEmoji =
          rec.priority === 'HIGH'
            ? '🔴'
            : rec.priority === 'MEDIUM'
              ? '🟡'
              : '🔵';
        report += `  ${index + 1}. ${priorityEmoji} [${rec.priority}] ${rec.title}\n`;
        report += `     ${rec.description}\n`;
      });
    }

    report += `\n⏱️  分析耗时: ${analysis.analysis_duration_ms}ms\n`;
    report += `📋 下次检查建议: ${analysis.next_check_interval}\n`;
    report +=
      '\n💡 提示: 建议结合 Grafana 监控 Cache Hit Ratio 趋势图以检测抖动';

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具定义
   */
  getTools() {
    return [
      {
        name: 'analyze_cache_performance',
        description: `📊 **Data Cache 性能分析** (仅存算分离架构)

**功能**: 分析 StarRocks Shared-Data 架构中 Compute Node 的本地缓存性能，包括命中率、容量使用等。

**诊断内容**:
- ✅ 缓存命中率分析（整体和各节点）
- ✅ 缓存容量使用率监控
- ✅ 节点间命中率差异检测
- ✅ 缓存配置优化建议

**适用场景**:
- 查询性能慢，怀疑缓存命中率低
- 对象存储访问量大，需要优化缓存
- 缓存容量规划和扩容评估
- 定期缓存性能健康检查

**不适用于**:
- ❌ 存算一体架构（无 Data Cache）
- ❌ 磁盘使用率分析（使用 storage_expert_analysis）
- ❌ Compaction 分析（使用 compaction_expert_analysis）

**注意**:
- 基于单次查询快照，无法检测时序抖动
- 如需抖动分析，请使用 analyze_cache_jitter 工具`,
        inputSchema: {
          type: 'object',
          properties: {
            include_details: {
              type: 'boolean',
              description: '是否包含详细的原始指标数据',
              default: true,
            },
          },
          required: [],
        },
      },
      {
        name: 'analyze_cache_jitter',
        description: `📈 **Data Cache 抖动分析** (基于 Prometheus 时序数据)

**功能**: 分析 StarRocks Data Cache 命中率的历史时序数据，检测缓存性能抖动和异常波动。

**诊断内容**:
- ✅ 命中率时序趋势分析（上升/下降/稳定）
- ✅ 命中率波动检测（标准差、变化范围）
- ✅ 各节点命中率差异分析
- ✅ 缓存抖动严重程度评估
- ✅ 针对性优化建议

**适用场景**:
- 缓存命中率不稳定，性能时好时坏
- 需要评估缓存性能稳定性
- 查询性能间歇性下降
- 缓存容量规划和优化决策

**前置条件**:
- ✅ Prometheus 监控系统已部署（默认 127.0.0.1:9092）
- ✅ StarRocks 指标已接入 Prometheus
- ✅ 有足够的历史数据（建议至少 1 小时）

**时间范围参数**:
- "1h": 1 小时（默认，步长 1 分钟）
- "6h": 6 小时（步长 5 分钟）
- "24h": 24 小时（步长 15 分钟）
- "30m": 30 分钟（步长 15 秒）

**注意**:
- 需要 Prometheus 可访问，否则会返回错误
- 分析质量取决于 Prometheus 数据完整性`,
        inputSchema: {
          type: 'object',
          properties: {
            time_range: {
              type: 'string',
              description:
                '分析时间范围，格式: 数字+单位(h/m/d)，如 "1h", "30m", "24h"',
              default: '1h',
            },
          },
          required: [],
        },
      },
      {
        name: 'analyze_metadata_cache',
        description: `🗂️  **Metadata Cache 使用率分析** (BE/CN 节点)

**功能**: 分析 StarRocks BE 和 CN 节点的 Metadata Cache 使用率，监控元数据缓存健康状态。

**诊断内容**:
- ✅ 各节点 Metadata Cache 使用率分析
- ✅ BE 和 CN 节点分组展示
- ✅ 使用率趋势和波动检测
- ✅ 容量和使用量统计
- ✅ 使用率阈值告警 (80% 警告, 90% 严重)

**监控指标**:
- lake_metacache_usage: 元数据缓存使用量
- lake_metacache_capacity: 元数据缓存容量
- 使用率 = (usage / capacity) * 100

**适用场景**:
- 定期检查 Metadata Cache 健康状态
- 元数据缓存使用率过高告警
- 评估 Metadata Cache 容量规划
- 诊断元数据相关性能问题

**告警阈值**:
- 🟢 健康: < 70%
- 🟡 警告: >= 80%
- 🔴 严重: >= 90%

**前置条件**:
- ✅ Prometheus 监控系统已部署（默认 127.0.0.1:9092）
- ✅ lake_metacache_* 指标已采集
- ✅ BE/CN 节点正常运行

**时间范围参数**:
- "1h": 1 小时（默认，步长 1 分钟）
- "6h": 6 小时（步长 5 分钟）
- "24h": 24 小时（步长 15 分钟）

**注意**:
- 仅适用于存算分离架构的 BE/CN 节点
- 高使用率可能需要调整 Metadata Cache 配置或重启节点`,
        inputSchema: {
          type: 'object',
          properties: {
            time_range: {
              type: 'string',
              description:
                '分析时间范围，格式: 数字+单位(h/m/d)，如 "1h", "6h", "24h"',
              default: '1h',
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksCacheExpert };
