/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 专家协调器
 * 负责管理多个专家模块，协调跨模块诊断，整合建议
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { StarRocksStorageExpert } from './storage-expert.js';
import { StarRocksStorageExpertSolutionC } from './storage-expert-solutionc.js';
import { StarRocksCompactionExpert } from './compaction-expert-integrated.js';
import { StarRocksCompactionExpertSolutionC } from './compaction-expert-solutionc.js';
import { StarRocksIngestionExpert } from './ingestion-expert.js';
import { StarRocksIngestionExpertSolutionC } from './ingestion-expert-solutionc.js';
import { StarRocksCacheExpert } from './cache-expert.js';
import { StarRocksCacheExpertSolutionC } from './cache-expert-solutionc.js';
import { StarRocksTransactionExpert } from './transaction-expert.js';
import { StarRocksTransactionExpertSolutionC } from './transaction-expert-solutionc.js';
import { StarRocksLogExpert } from './log-expert.js';
import { StarRocksLogExpertSolutionC } from './log-expert-solutionc.js';
import { StarRocksMemoryExpert } from './memory-expert.js';
import { StarRocksMemoryExpertSolutionC } from './memory-expert-solutionc.js';
import { StarRocksQueryPerfExpert } from './query-perf-expert.js';
import { StarRocksQueryPerfExpertSolutionC } from './query-perf-expert-solutionc.js';
import { StarRocksOperateExpert } from './operate-expert.js';
import { StarRocksOperateExpertSolutionC } from './operate-expert-solutionc.js';
import { StarRocksTableSchemaExpert } from './table-schema-expert.js';
import { StarRocksTableSchemaExpertSolutionC } from './table-schema-expert-solutionc.js';

class StarRocksExpertCoordinator {
  constructor() {
    this.experts = {
      storage: new StarRocksStorageExpertSolutionC(),  // ✅ 使用 Solution C 版本
      compaction: new StarRocksCompactionExpertSolutionC(),  // ✅ 使用 Solution C 版本
      ingestion: new StarRocksIngestionExpertSolutionC(),  // ✅ 使用 Solution C 版本
      cache: new StarRocksCacheExpertSolutionC(),  // ✅ 使用 Solution C 版本
      transaction: new StarRocksTransactionExpertSolutionC(),  // ✅ 使用 Solution C 版本
      log: new StarRocksLogExpertSolutionC(),  // ✅ 使用 Solution C 版本
      memory: new StarRocksMemoryExpertSolutionC(),  // ✅ 使用 Solution C 版本
      'query-perf': new StarRocksQueryPerfExpertSolutionC(),  // ✅ 使用 Solution C 版本
      operate: new StarRocksOperateExpertSolutionC(),  // ✅ 使用 Solution C 版本
      'table-schema': new StarRocksTableSchemaExpertSolutionC(),  // ✅ 使用 Solution C 版本
    };

    // 工具处理器映射表: toolName -> {expert, handler}
    this.toolHandlers = new Map();
    this._registerToolHandlers();

    this.crossModuleRules = {
      // 存储空间不足影响Compaction效率
      storage_compaction_impact: {
        condition: (storageResult, compactionResult) => {
          const diskCritical = storageResult.diagnosis_results.criticals.some(
            (c) => c.type.includes('disk'),
          );
          const highCS = compactionResult.diagnosis_results.criticals.some(
            (c) => c.type.includes('compaction_score'),
          );
          return diskCritical && highCS;
        },
        impact: 'HIGH',
        explanation: '磁盘空间不足导致Compaction效率下降，形成恶性循环',
      },

      // Compaction线程不足与高CS分区的关系
      thread_cs_correlation: {
        condition: (storageResult, compactionResult) => {
          const lowThreads = compactionResult.diagnosis_results.warnings.some(
            (w) => w.type === 'low_compaction_threads',
          );
          const highCS = compactionResult.diagnosis_results.criticals.some(
            (c) => c.type.includes('compaction_score'),
          );
          return lowThreads && highCS;
        },
        impact: 'MEDIUM',
        explanation: 'Compaction线程不足是导致高CS积累的主要原因',
      },

      // 数据摄入失败与存储空间的关系
      ingestion_storage_impact: {
        condition: (results) => {
          const storageResult = results.storage;
          const ingestionResult = results.ingestion;
          if (!storageResult || !ingestionResult) return false;

          const diskCritical = storageResult.diagnosis_results.criticals.some(
            (c) => c.type.includes('disk'),
          );
          const ingestionFailures =
            ingestionResult.diagnosis_results.criticals.some((c) =>
              c.type.includes('failure_rate'),
            );
          return diskCritical && ingestionFailures;
        },
        impact: 'HIGH',
        explanation: '存储空间不足可能导致数据摄入作业失败，需要清理空间或扩容',
      },

      // 数据摄入队列积压与Compaction的资源竞争
      ingestion_compaction_resource_conflict: {
        condition: (results) => {
          const compactionResult = results.compaction;
          const ingestionResult = results.ingestion;
          if (!compactionResult || !ingestionResult) return false;

          const queueBacklog = ingestionResult.diagnosis_results.criticals.some(
            (c) => c.type === 'load_queue_backlog',
          );
          const compactionPressure =
            compactionResult.diagnosis_results.criticals.some(
              (c) => c.type === 'high_compaction_pressure',
            );
          return queueBacklog && compactionPressure;
        },
        impact: 'MEDIUM',
        explanation: '数据摄入队列积压和Compaction压力可能存在CPU/内存资源竞争',
      },

      // 缓存命中率低与Compaction的关系
      cache_compaction_impact: {
        condition: (results) => {
          const cacheResult = results.cache;
          const compactionResult = results.compaction;
          if (!cacheResult || !compactionResult) return false;

          const lowHitRatio = cacheResult.diagnosis_results.criticals?.some(
            (c) => c.type === 'low_cache_hit_ratio',
          );
          const highCS = compactionResult.diagnosis_results.criticals?.some(
            (c) => c.type.includes('compaction_score'),
          );
          return lowHitRatio && highCS;
        },
        impact: 'MEDIUM',
        explanation:
          '高 Compaction Score 导致数据碎片化，可能影响缓存效率降低命中率',
      },

      // 缓存容量不足与存储空间的关系
      cache_storage_capacity: {
        condition: (results) => {
          const cacheResult = results.cache;
          const storageResult = results.storage;
          if (!cacheResult || !storageResult) return false;

          const cacheCapacityCritical =
            cacheResult.diagnosis_results.criticals?.some(
              (c) => c.type === 'cache_capacity_critical',
            );
          const diskCritical = storageResult.diagnosis_results.criticals?.some(
            (c) => c.type.includes('disk'),
          );
          return cacheCapacityCritical && diskCritical;
        },
        impact: 'HIGH',
        explanation:
          '本地磁盘空间不足，无法扩展缓存容量，建议优先清理存储或扩容',
      },
    };
  }

  /**
   * 执行多专家协调诊断
   */
  async performCoordinatedAnalysis(connection, options = {}) {
    const {
      includeDetails = false,
      expertScope = ['storage', 'compaction', 'ingestion', 'cache'], // 可选择特定专家
      includeCrossAnalysis = true,
    } = options;

    try {
      const startTime = new Date();
      const results = {};

      // 1. 并行执行各专家诊断
      console.error('🔍 启动多专家并行诊断...');

      const expertPromises = expertScope.map(async (expertName) => {
        if (this.experts[expertName]) {
          console.error(`   → ${expertName} 专家分析中...`);
          const result = await this.experts[expertName].diagnose(
            connection,
            includeDetails,
          );
          console.error(`   ✓ ${expertName} 专家完成`);
          return { expertName, result };
        }
        return null;
      });

      const expertResults = await Promise.all(expertPromises);

      // 整理专家结果
      expertResults.forEach((item) => {
        if (item) {
          results[item.expertName] = item.result;
        }
      });

      // 2. 执行跨模块影响分析
      let crossModuleAnalysis = null;
      if (includeCrossAnalysis && Object.keys(results).length > 1) {
        console.error('🔄 执行跨模块影响分析...');
        crossModuleAnalysis = this.analyzeCrossModuleImpacts(results);
      }

      // 3. 生成综合评估
      console.error('📊 生成综合评估报告...');
      const comprehensiveAssessment = this.generateComprehensiveAssessment(
        results,
        crossModuleAnalysis,
      );

      // 4. 优化建议优先级排序
      const prioritizedRecommendations = this.prioritizeRecommendations(
        results,
        crossModuleAnalysis,
      );

      const endTime = new Date();
      const totalAnalysisTime = endTime - startTime;

      console.error(`✅ 多专家分析完成，耗时 ${totalAnalysisTime}ms`);

      return {
        coordinator_version: '1.0.0',
        analysis_timestamp: new Date().toISOString(),
        total_analysis_time_ms: totalAnalysisTime,
        expert_scope: expertScope,

        // 核心分析结果
        comprehensive_assessment: comprehensiveAssessment,
        expert_results: results,
        cross_module_analysis: crossModuleAnalysis,
        prioritized_recommendations: prioritizedRecommendations,

        // 元数据
        analysis_metadata: {
          experts_count: Object.keys(results).length,
          total_issues_found: this.countTotalIssues(results),
          cross_impacts_found: crossModuleAnalysis
            ? crossModuleAnalysis.impacts.length
            : 0,
        },
      };
    } catch (error) {
      throw new Error(`专家协调器分析失败: ${error.message}`);
    }
  }

  /**
   * 跨模块影响分析
   */
  analyzeCrossModuleImpacts(expertResults) {
    const impacts = [];
    const correlations = [];

    // 检查所有跨模块规则
    for (const [ruleName, rule] of Object.entries(this.crossModuleRules)) {
      const storageResult = expertResults.storage;
      const compactionResult = expertResults.compaction;

      if (
        storageResult &&
        compactionResult &&
        rule.condition(storageResult, compactionResult)
      ) {
        impacts.push({
          rule_name: ruleName,
          impact_level: rule.impact,
          explanation: rule.explanation,
          affected_modules: ['storage', 'compaction'],
          recommended_approach: this.getCrossModuleRecommendation(ruleName),
        });
      }
    }

    // 分析模块间的数值关联性
    if (expertResults.storage && expertResults.compaction) {
      correlations.push(
        this.analyzeStorageCompactionCorrelation(
          expertResults.storage,
          expertResults.compaction,
        ),
      );
    }

    return {
      impacts: impacts,
      correlations: correlations.filter((c) => c), // 过滤空值
      analysis_summary: this.generateCrossAnalysisSummary(
        impacts,
        correlations,
      ),
    };
  }

  /**
   * 分析存储和Compaction的关联性
   */
  analyzeStorageCompactionCorrelation(storageResult, compactionResult) {
    const storageHealth = storageResult.storage_health.score;
    const compactionHealth = compactionResult.compaction_health.score;

    const correlation = {
      type: 'storage_compaction_health_correlation',
      storage_health_score: storageHealth,
      compaction_health_score: compactionHealth,
      correlation_strength: 'UNKNOWN',
    };

    // 分析健康分数的相关性
    const scoreDifference = Math.abs(storageHealth - compactionHealth);

    if (scoreDifference < 20) {
      correlation.correlation_strength = 'HIGH';
      correlation.interpretation = '存储和Compaction健康状态高度相关';
    } else if (scoreDifference < 40) {
      correlation.correlation_strength = 'MEDIUM';
      correlation.interpretation = '存储和Compaction健康状态存在一定关联';
    } else {
      correlation.correlation_strength = 'LOW';
      correlation.interpretation = '存储和Compaction问题相对独立';
    }

    return correlation;
  }

  /**
   * 获取跨模块建议
   */
  getCrossModuleRecommendation(ruleName) {
    const recommendations = {
      storage_compaction_impact: {
        approach: 'integrated_solution',
        priority: 'HIGH',
        steps: [
          '1. 立即清理磁盘空间，为Compaction腾出工作空间',
          '2. 暂停非关键数据导入，减少新CS产生',
          '3. 分批手动触发Compaction，优先处理高CS分区',
          '4. 监控磁盘空间恢复和CS下降情况',
          '5. 制定长期容量规划和Compaction策略',
        ],
      },
      thread_cs_correlation: {
        approach: 'configuration_optimization',
        priority: 'MEDIUM',
        steps: [
          '1. 增加Compaction线程数至推荐值',
          '2. 监控Compaction任务执行效率',
          '3. 评估CS下降速度',
          '4. 必要时考虑临时手动Compaction',
        ],
      },
    };

    return (
      recommendations[ruleName] || {
        approach: 'general_coordination',
        priority: 'MEDIUM',
        steps: ['需要协调多个模块的配置和操作'],
      }
    );
  }

  /**
   * 生成综合评估
   */
  generateComprehensiveAssessment(expertResults, crossModuleAnalysis) {
    // 计算整体健康分数
    const expertScores = Object.values(expertResults).map((result) => {
      if (result.storage_health) return result.storage_health.score;
      if (result.compaction_health) return result.compaction_health.score;
      return 100;
    });

    const averageScore =
      expertScores.reduce((sum, score) => sum + score, 0) / expertScores.length;

    // 跨模块影响的扣分
    const crossImpactPenalty = crossModuleAnalysis
      ? crossModuleAnalysis.impacts.length * 10
      : 0;
    const finalScore = Math.max(0, averageScore - crossImpactPenalty);

    // 确定整体状态
    let overallStatus = 'HEALTHY';
    const hasCriticals = Object.values(expertResults).some(
      (result) => result.diagnosis_results.criticals.length > 0,
    );
    const hasWarnings = Object.values(expertResults).some(
      (result) => result.diagnosis_results.warnings.length > 0,
    );
    const hasCrossImpacts =
      crossModuleAnalysis && crossModuleAnalysis.impacts.length > 0;

    if (hasCriticals || hasCrossImpacts) {
      overallStatus = 'CRITICAL';
    } else if (hasWarnings) {
      overallStatus = 'WARNING';
    }

    let healthLevel = 'EXCELLENT';
    if (finalScore < 50) healthLevel = 'POOR';
    else if (finalScore < 70) healthLevel = 'FAIR';
    else if (finalScore < 85) healthLevel = 'GOOD';

    return {
      overall_health_score: Math.round(finalScore),
      health_level: healthLevel,
      overall_status: overallStatus,
      expert_scores: Object.keys(expertResults).reduce((acc, expertName) => {
        const result = expertResults[expertName];
        acc[expertName] = {
          score:
            result.storage_health?.score ||
            result.compaction_health?.score ||
            100,
          status:
            result.storage_health?.status ||
            result.compaction_health?.status ||
            'HEALTHY',
        };
        return acc;
      }, {}),
      cross_module_impact: hasCrossImpacts,
      system_risk_assessment: this.assessSystemRisk(
        expertResults,
        crossModuleAnalysis,
      ),
      summary: this.generateOverallSummary(
        overallStatus,
        Object.keys(expertResults),
        hasCrossImpacts,
      ),
    };
  }

  /**
   * 评估系统风险
   */
  assessSystemRisk(expertResults, crossModuleAnalysis) {
    const risks = [];

    // 检查各专家的严重问题
    Object.entries(expertResults).forEach(([expertName, result]) => {
      const criticals = result.diagnosis_results.criticals;
      if (criticals.length > 0) {
        risks.push({
          source: expertName,
          type: 'expert_critical_issues',
          count: criticals.length,
          risk_level: 'HIGH',
          description: `${expertName}模块发现${criticals.length}个严重问题`,
        });
      }
    });

    // 检查跨模块影响
    if (crossModuleAnalysis && crossModuleAnalysis.impacts.length > 0) {
      const highImpacts = crossModuleAnalysis.impacts.filter(
        (impact) => impact.impact_level === 'HIGH',
      );

      if (highImpacts.length > 0) {
        risks.push({
          source: 'cross_module',
          type: 'system_level_impact',
          count: highImpacts.length,
          risk_level: 'CRITICAL',
          description: '发现系统级联问题，需要综合处理',
        });
      }
    }

    return {
      total_risks: risks.length,
      risk_breakdown: risks,
      overall_risk_level: risks.some((r) => r.risk_level === 'CRITICAL')
        ? 'CRITICAL'
        : risks.some((r) => r.risk_level === 'HIGH')
          ? 'HIGH'
          : 'MEDIUM',
    };
  }

  /**
   * 优化建议优先级排序
   */
  prioritizeRecommendations(expertResults, crossModuleAnalysis) {
    const allRecommendations = [];

    // 收集所有专家建议
    Object.entries(expertResults).forEach(([expertName, result]) => {
      if (result.professional_recommendations) {
        result.professional_recommendations.forEach((rec) => {
          allRecommendations.push({
            ...rec,
            source_expert: expertName,
            source_type: 'expert_recommendation',
          });
        });
      }
    });

    // 添加跨模块协调建议
    if (crossModuleAnalysis && crossModuleAnalysis.impacts.length > 0) {
      crossModuleAnalysis.impacts.forEach((impact) => {
        if (impact.recommended_approach) {
          allRecommendations.push({
            category: 'cross_module_coordination',
            priority: impact.recommended_approach.priority,
            title: `跨模块协调: ${impact.explanation}`,
            description: '需要协调多个模块的综合处理方案',
            professional_actions: impact.recommended_approach.steps.map(
              (step) => ({
                action: step,
                risk_level: 'MEDIUM',
                coordination_required: true,
              }),
            ),
            source_expert: 'coordinator',
            source_type: 'cross_module_recommendation',
            affected_modules: impact.affected_modules,
          });
        }
      });
    }

    // 按优先级和影响范围排序
    const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    return allRecommendations
      .sort((a, b) => {
        // 首先按跨模块建议优先
        if (
          a.source_type === 'cross_module_recommendation' &&
          b.source_type !== 'cross_module_recommendation'
        ) {
          return -1;
        }
        if (
          b.source_type === 'cross_module_recommendation' &&
          a.source_type !== 'cross_module_recommendation'
        ) {
          return 1;
        }

        // 然后按优先级排序
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })
      .map((rec, index) => ({
        ...rec,
        execution_order: index + 1,
        coordination_notes:
          rec.source_type === 'cross_module_recommendation'
            ? '此建议需要多个模块协调配合执行'
            : null,
      }));
  }

  /**
   * 统计总问题数
   */
  countTotalIssues(expertResults) {
    return Object.values(expertResults).reduce((total, result) => {
      return total + (result.diagnosis_results.total_issues || 0);
    }, 0);
  }

  /**
   * 生成跨分析摘要
   */
  generateCrossAnalysisSummary(impacts, correlations) {
    if (impacts.length === 0 && correlations.length === 0) {
      return '各模块相对独立，未发现显著的跨模块影响';
    }

    const summaryParts = [];

    if (impacts.length > 0) {
      const highImpacts = impacts.filter(
        (i) => i.impact_level === 'HIGH',
      ).length;
      if (highImpacts > 0) {
        summaryParts.push(`发现${highImpacts}个高影响级别的跨模块问题`);
      } else {
        summaryParts.push(`发现${impacts.length}个跨模块关联问题`);
      }
    }

    if (correlations.length > 0) {
      const highCorrelations = correlations.filter(
        (c) => c.correlation_strength === 'HIGH',
      ).length;
      if (highCorrelations > 0) {
        summaryParts.push(`模块间存在${highCorrelations}个高相关性指标`);
      }
    }

    return summaryParts.join('，');
  }

  /**
   * 生成总体摘要
   */
  generateOverallSummary(overallStatus, expertNames, hasCrossImpacts) {
    const expertCount = expertNames.length;
    const expertStr = expertNames.join('、');

    let baseMsg = `已完成${expertCount}个专家模块(${expertStr})的综合分析`;

    if (overallStatus === 'CRITICAL') {
      baseMsg += '，发现严重问题需要立即处理';
    } else if (overallStatus === 'WARNING') {
      baseMsg += '，发现问题建议近期处理';
    } else {
      baseMsg += '，系统运行状态良好';
    }

    if (hasCrossImpacts) {
      baseMsg += '，存在跨模块影响需要协调处理';
    }

    return baseMsg;
  }

  /**
   * 获取可用专家列表
   */
  getAvailableExperts() {
    return Object.keys(this.experts).map((name) => ({
      name: name,
      description: this.experts[name].description,
      version: this.experts[name].version,
    }));
  }

  /**
   * 获取工具的 SQL 查询定义 (Solution C)
   */
  getQueriesForTool(toolName, args = {}) {
    console.error(`🔍 Coordinator: getQueriesForTool(${toolName})`);

    switch (toolName) {
      case 'storage_expert_analysis':
        // 存储专家综合分析：使用 analyze_storage_amplification 工具
        return this.experts.storage.getQueriesForTool('analyze_storage_amplification', args);

      case 'compaction_expert_analysis':
        // Compaction 专家综合分析：使用 analyze_high_compaction_score 工具
        return this.experts.compaction.getQueriesForTool('analyze_high_compaction_score', args);

      case 'ingestion_expert_analysis':
        // Ingestion 专家综合分析：使用 analyze_ingestion_health 工具
        return this.experts.ingestion.getQueriesForTool('analyze_ingestion_health', args);

      case 'expert_analysis': {
        // 多专家协调分析：需要收集所有相关专家的查询
        const expertScope = args.expert_scope || ['storage', 'compaction'];
        const allQueries = [];

        // 为每个专家收集查询
        expertScope.forEach((expertName) => {
          const expert = this.experts[expertName];
          if (!expert || typeof expert.getQueriesForTool !== 'function') {
            return;
          }

          try {
            let queries = [];

            // 根据专家类型选择合适的分析工具
            switch (expertName) {
              case 'storage':
                queries = expert.getQueriesForTool('analyze_storage_amplification', args);
                break;
              case 'compaction':
                queries = expert.getQueriesForTool('analyze_high_compaction_score', args);
                break;
              case 'ingestion':
                queries = expert.getQueriesForTool('analyze_ingestion_health', args);
                break;
              default:
                console.error(`   ⚠️  Unknown expert: ${expertName}`);
            }

            // 为查询添加专家前缀
            queries.forEach(q => {
              allQueries.push({
                ...q,
                id: `${expertName}_${q.id}`, // 添加专家前缀避免 ID 冲突
                expert: expertName, // 记录来源专家
              });
            });
          } catch (e) {
            console.error(`   ⚠️  Failed to get queries from ${expertName}: ${e.message}`);
          }
        });

        return allQueries;
      }

      case 'get_available_experts':
        // 这个工具不需要 SQL 查询，返回空数组
        return [];

      default:
        throw new Error(`Coordinator does not handle tool: ${toolName}`);
    }
  }

  /**
   * 分析查询结果 (Solution C)
   */
  async analyzeQueryResults(toolName, results, args = {}) {
    console.error(`🔬 Coordinator: analyzeQueryResults(${toolName})`);

    switch (toolName) {
      case 'storage_expert_analysis':
        return await this.experts.storage.analyzeQueryResults('analyze_storage_amplification', results, args);

      case 'compaction_expert_analysis':
        return await this.experts.compaction.analyzeQueryResults('analyze_high_compaction_score', results, args);

      case 'ingestion_expert_analysis':
        return await this.experts.ingestion.analyzeQueryResults('analyze_ingestion_health', results, args);

      case 'expert_analysis': {
        // 多专家协调分析：需要将结果分配给对应的专家分析
        const expertScope = args.expert_scope || ['storage', 'compaction'];
        const expertResults = {};

        // 按专家分组结果
        const resultsByExpert = {};
        Object.keys(results).forEach(resultId => {
          // resultId 格式: expertName_originalId
          const match = resultId.match(/^([^_]+)_(.+)$/);
          if (match) {
            const expertName = match[1];
            const originalId = match[2];
            if (!resultsByExpert[expertName]) {
              resultsByExpert[expertName] = {};
            }
            resultsByExpert[expertName][originalId] = results[resultId];
          }
        });

        // 让每个专家分析自己的结果
        for (const expertName of expertScope) {
          const expert = this.experts[expertName];
          if (!expert || !resultsByExpert[expertName]) {
            continue;
          }

          try {
            let analysis;

            // 根据专家类型选择合适的分析方法
            switch (expertName) {
              case 'storage':
                analysis = await expert.analyzeQueryResults(
                  'analyze_storage_amplification',
                  resultsByExpert[expertName],
                  args
                );
                break;
              case 'compaction':
                analysis = await expert.analyzeQueryResults(
                  'analyze_high_compaction_score',
                  resultsByExpert[expertName],
                  args
                );
                break;
              case 'ingestion':
                analysis = await expert.analyzeQueryResults(
                  'analyze_ingestion_health',
                  resultsByExpert[expertName],
                  args
                );
                break;
              default:
                throw new Error(`Unknown expert: ${expertName}`);
            }

            expertResults[expertName] = analysis;
          } catch (e) {
            console.error(`   ⚠️  Failed to analyze results from ${expertName}: ${e.message}`);
            expertResults[expertName] = {
              expert: expertName,
              error: e.message,
              timestamp: new Date().toISOString(),
            };
          }
        }

        // 执行跨模块分析（如果有多个专家结果）
        let crossModuleAnalysis = null;
        if (Object.keys(expertResults).length > 1 && args.include_cross_analysis !== false) {
          try {
            crossModuleAnalysis = this.analyzeCrossModuleImpacts(expertResults);
          } catch (e) {
            console.error(`   ⚠️  Cross-module analysis failed: ${e.message}`);
          }
        }

        // 生成综合评估
        const comprehensiveAssessment = this.generateComprehensiveAssessment(
          expertResults,
          crossModuleAnalysis
        );

        // 优化建议优先级排序
        const prioritizedRecommendations = this.prioritizeRecommendations(
          expertResults,
          crossModuleAnalysis
        );

        return {
          coordinator_version: '2.0.0-solutionc',
          analysis_timestamp: new Date().toISOString(),
          expert_scope: expertScope,

          // 核心分析结果
          comprehensive_assessment: comprehensiveAssessment,
          expert_results: expertResults,
          cross_module_analysis: crossModuleAnalysis,
          prioritized_recommendations: prioritizedRecommendations,

          // 元数据
          analysis_metadata: {
            experts_count: Object.keys(expertResults).length,
            total_issues_found: this.countTotalIssues(expertResults),
            cross_impacts_found: crossModuleAnalysis ? crossModuleAnalysis.impacts.length : 0,
          },
        };
      }

      case 'get_available_experts': {
        // 直接返回专家列表，不需要查询结果
        const experts = this.getAvailableExperts();
        return {
          coordinator_version: '2.0.0-solutionc',
          timestamp: new Date().toISOString(),
          experts: experts,
          total_count: experts.length,
        };
      }

      default:
        throw new Error(`Coordinator does not handle tool: ${toolName}`);
    }
  }

  /**
   * 注册所有专家的工具处理器
   * @private
   */
  _registerToolHandlers() {
    // 从每个专家注册工具处理器
    for (const [expertName, expert] of Object.entries(this.experts)) {
      if (typeof expert.getToolHandlers === 'function') {
        const handlers = expert.getToolHandlers();
        for (const [toolName, handler] of Object.entries(handlers)) {
          this.toolHandlers.set(toolName, {
            expert: expertName,
            handler: handler.bind(expert), // 绑定 this 上下文
          });
        }
      }
    }

    // 注册 coordinator 级别的工具处理器
    const coordinatorHandlers = this.getCoordinatorToolHandlers();
    for (const [toolName, handler] of Object.entries(coordinatorHandlers)) {
      this.toolHandlers.set(toolName, {
        expert: 'coordinator',
        handler: handler.bind(this), // 绑定到 coordinator 实例
      });
    }
  }

  /**
   * 获取 Coordinator 级别的工具处理器
   * @returns {Object} 工具名称到处理函数的映射
   */
  getCoordinatorToolHandlers() {
    return {
      expert_analysis: async (args, context) => {
        const connection = context.connection;
        const options = {
          includeDetails: args.include_details || false,
          expertScope: args.expert_scope || ['storage', 'compaction'],
          includeCrossAnalysis: args.include_cross_analysis !== false,
        };

        console.error('🚀 启动多专家协调分析...');
        const analysis = await this.performCoordinatedAnalysis(
          connection,
          options,
        );

        // 返回包含类型信息的结果，用于格式化
        return {
          _needsFormatting: true,
          _formatType: 'expert_analysis',
          data: analysis,
        };
      },
      storage_expert_analysis: async (args, context) => {
        const connection = context.connection;
        const includeDetails = args.include_details || false;
        console.error('🚀 启动存储专家单独分析...');
        const result = await this.experts.storage.diagnose(
          connection,
          includeDetails,
        );
        return {
          _needsFormatting: true,
          _formatType: 'single_expert',
          _expertType: 'storage',
          data: result,
        };
      },
      compaction_expert_analysis: async (args, context) => {
        const connection = context.connection;
        const includeDetails = args.include_details || false;
        console.error('🚀 启动 Compaction 专家单独分析...');
        const result = await this.experts.compaction.analyze(connection, {
          includeDetails,
        });
        return {
          _needsFormatting: true,
          _formatType: 'single_expert',
          _expertType: 'compaction',
          data: result,
        };
      },
      ingestion_expert_analysis: async (args, context) => {
        const connection = context.connection;
        const includeDetails = args.include_details || false;
        console.error('🚀 启动数据摄入专家单独分析...');
        const result = await this.experts.ingestion.analyze(connection, {
          includeDetails,
        });
        return {
          _needsFormatting: true,
          _formatType: 'single_expert',
          _expertType: 'ingestion',
          data: result,
        };
      },
      get_available_experts: async (args, context) => {
        const experts = this.getAvailableExperts();

        // 格式化专家列表报告
        let report = '🧠 StarRocks 专家系统 - 可用专家列表\n';
        report += '=====================================\n\n';

        experts.forEach((expert, index) => {
          report += `${index + 1}. **${expert.name}**\n`;
          report += `   版本: ${expert.version}\n`;
          report += `   ${expert.description}\n\n`;
        });

        report += `\n💡 提示: 使用 expert_analysis 工具可以同时调用多个专家进行协调分析\n`;
        report += `💡 提示: 使用 {expert_type}_expert_analysis 可以调用单个专家进行专项分析\n`;

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
            {
              type: 'text',
              text: JSON.stringify(experts, null, 2),
            },
          ],
        };
      },
    };
  }

  /**
   * 调用工具处理器
   * @param {string} toolName - 工具名称
   * @param {object} args - 工具参数
   * @param {object} context - 上下文对象 (如 connection)
   * @returns {Promise<object>} 工具执行结果
   */
  async callToolHandler(toolName, args, context) {
    const handlerInfo = this.toolHandlers.get(toolName);

    if (!handlerInfo) {
      throw new Error(`No handler registered for tool: ${toolName}`);
    }

    const result = await handlerInfo.handler(args, context);

    // Wrap result in MCP response format if not already wrapped
    if (result && typeof result === 'object' && result.content) {
      return result;
    }

    // Otherwise wrap as JSON text response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * 聚合所有专家的工具定义
   * @returns {Array} 所有工具的定义数组
   */
  getAllTools() {
    const allTools = [];

    // 收集每个专家提供的工具
    for (const [expertName, expert] of Object.entries(this.experts)) {
      if (typeof expert.getTools === 'function') {
        const tools = expert.getTools();
        console.error(`📦 从 ${expertName} 专家加载了 ${tools.length} 个工具`);
        allTools.push(...tools);
      }
    }

    // 添加专家系统级别的工具
    allTools.push(
      {
        name: 'expert_analysis',
        description: '🧠 多专家协调分析 - 自动选择并协调多个专家进行综合分析',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '分析问题或需求描述',
            },
            include_details: {
              type: 'boolean',
              description: '是否包含详细数据',
              default: true,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'storage_expert_analysis',
        description: '💾 存储专家分析 - 专注于存储空间、磁盘使用和容量规划',
        inputSchema: {
          type: 'object',
          properties: {
            include_details: {
              type: 'boolean',
              description: '是否包含详细数据',
              default: true,
            },
          },
          required: [],
        },
      },
      {
        name: 'compaction_expert_analysis',
        description:
          '🗜️ Compaction专家分析 - 深度分析Compaction状态、线程配置和优化建议',
        inputSchema: {
          type: 'object',
          properties: {
            database_name: {
              type: 'string',
              description: '可选：目标数据库',
            },
            table_name: {
              type: 'string',
              description: '可选：目标表',
            },
            include_details: {
              type: 'boolean',
              description: '是否包含详细数据',
              default: true,
            },
          },
          required: [],
        },
      },
      {
        name: 'ingestion_expert_analysis',
        description: '📥 Ingestion专家分析 - 分析数据摄入任务状态、性能和频率',
        inputSchema: {
          type: 'object',
          properties: {
            include_details: {
              type: 'boolean',
              description: '是否包含详细分析数据',
              default: true,
            },
          },
          required: [],
        },
      },
      {
        name: 'get_available_experts',
        description: '👥 获取可用专家列表 - 查看所有可用的专家系统及其职责',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    );

    console.error(`✅ 总共注册了 ${allTools.length} 个 MCP 工具`);
    return allTools;
  }
}

export { StarRocksExpertCoordinator };
