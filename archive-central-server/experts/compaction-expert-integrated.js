/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Compaction 专家模块 - 完整集成版
 * 集成了MCP server中所有Compaction相关的现有功能
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { detectArchitectureType } from './common-utils.js';

class StarRocksCompactionExpert {
  constructor() {
    this.name = 'compaction';
    // 不设置 this.version 和 this.description，因为下面有 getter 方法

    // Compaction专业知识规则库
    this.rules = {
      // Compaction Score 分级规则
      compaction_score: {
        excellent: 10, // CS < 10 优秀
        normal: 50, // CS < 50 正常
        warning: 100, // CS >= 100 警告
        critical: 500, // CS >= 500 严重
        emergency: 1000, // CS >= 1000 紧急
      },

      // 线程配置规则
      thread_config: {
        min_threads_per_core: 0.25, // 最少线程数/CPU核心
        max_threads_per_core: 0.5, // 最多线程数/CPU核心
        absolute_min_threads: 4, // 绝对最小线程数
        absolute_max_threads: 64, // 绝对最大线程数
        recommended_base: 8, // 推荐基础线程数
      },

      // 任务执行规则
      task_execution: {
        max_healthy_tasks_per_node: 8, // 单节点健康任务数上限
        task_timeout_hours: 4, // 任务超时时间（小时）
        slow_task_threshold_hours: 2, // 慢任务阈值（小时）
        max_retry_count: 5, // 最大重试次数
        healthy_success_rate: 90, // 健康成功率阈值(%)
      },

      // FE配置规则
      fe_config: {
        lake_compaction_disabled: 0, // 禁用值
        lake_compaction_adaptive: -1, // 自适应值
        min_recommended_max_tasks: 64, // 最小推荐最大任务数
        adaptive_multiplier: 16, // 自适应模式下的倍数（节点数*16）
      },
    };

    // 专业术语解释
    this.terminology = {
      compaction_score:
        'Compaction Score (CS) - 衡量数据文件碎片化程度，分数越高碎片越严重',
      base_compaction: '基础压缩 - 将多个小文件合并成大文件',
      cumulative_compaction: '累积压缩 - 合并增量数据到基础文件',
      lake_compaction_max_tasks: 'FE参数，控制集群最大并发Compaction任务数',
      compact_threads: 'BE参数，控制单个BE节点的Compaction线程数',
    };
  }

  /**
   * 检查集群是否为存算分离架构
   * 如果不是，抛出错误
   */
  async checkSharedDataArchitecture(connection) {
    const archInfo = await detectArchitectureType(connection);

    if (archInfo.type !== 'shared_data') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `❌ Compaction 专家仅支持存算分离 (Shared-Data) 集群\n\n` +
          `当前集群架构: ${archInfo.type === 'shared_nothing' ? '存算一体 (Shared-Nothing)' : '未知'}\n` +
          `Run Mode: ${archInfo.run_mode || 'N/A'}\n\n` +
          `💡 说明:\n` +
          `  存算分离架构使用云原生存储 (如 S3)，Compaction 由独立的 Compaction 服务管理。\n` +
          `  存算一体架构的 Compaction 机制不同，不适用此专家系统。`,
      );
    }

    return archInfo;
  }

  /**
   * 执行完整的Compaction专家诊断
   */
  async performComprehensiveAnalysis(connection, options = {}) {
    const {
      includeDetailedData = false,
      targetDatabase = null,
      targetTable = null,
      analysisScope = 'full', // 'full', 'quick', 'deep'
    } = options;

    try {
      const startTime = new Date();
      console.error('🗜️ 启动Compaction专家全面分析...');

      // 1. 收集所有Compaction相关数据
      const compactionData = await this.collectAllCompactionData(connection, {
        targetDatabase,
        targetTable,
        includeDetailedData,
      });

      // 2. 执行多维度专业诊断
      const diagnosis = await this.performMultiDimensionalDiagnosis(
        compactionData,
        analysisScope,
      );

      // 3. 生成专业优化建议
      const recommendations = this.generateComprehensiveRecommendations(
        diagnosis,
        compactionData,
      );

      // 4. 计算Compaction系统健康分数
      const healthAssessment = this.calculateCompactionHealth(
        diagnosis,
        compactionData,
      );

      // 5. 生成可执行的操作计划
      const actionPlans = this.generateActionPlans(diagnosis, recommendations);

      const endTime = new Date();
      const analysisTime = endTime - startTime;

      console.error(`✅ Compaction专家分析完成，耗时 ${analysisTime}ms`);

      return {
        expert: this.name,
        version: this.version,
        analysis_timestamp: new Date().toISOString(),
        analysis_duration_ms: analysisTime,
        analysis_scope: analysisScope,

        // 核心分析结果
        compaction_health: healthAssessment,
        diagnosis_results: diagnosis,
        comprehensive_recommendations: recommendations,
        executable_action_plans: actionPlans,

        // 详细数据（可选）
        collected_data: includeDetailedData ? compactionData : null,

        // 专家洞察
        expert_insights: this.generateExpertInsights(compactionData, diagnosis),
        optimization_opportunities: this.identifyOptimizationOpportunities(
          compactionData,
          diagnosis,
        ),
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Compaction专家分析失败: ${error.message}`,
      );
    }
  }

  /**
   * 收集所有Compaction相关数据
   */
  async collectAllCompactionData(connection, options) {
    const data = {
      collection_timestamp: new Date().toISOString(),
    };

    console.error('📊 收集Compaction相关数据...');

    // 1. 获取高CS分区信息（集成get_table_partitions_compaction_score功能）
    await this.collectHighCSPartitions(connection, data, options);

    // 2. 获取Compaction线程配置（集成get_compaction_threads功能）
    await this.collectCompactionThreadConfig(connection, data);

    // 3. 获取正在运行的任务（集成get_running_compaction_tasks功能）
    await this.collectRunningTasks(connection, data);

    // 4. 获取FE配置参数（集成analyze_high_compaction_score功能）
    await this.collectFEConfiguration(connection, data);

    // 5. 收集BE节点信息
    await this.collectBENodeInfo(connection, data);

    // 6. 收集历史任务信息（如果可用）
    await this.collectHistoricalTasks(connection, data);

    // 7. 收集系统资源数据
    await this.collectSystemResources(connection, data);

    // 8. 收集参数配置数据
    await this.collectParameterConfiguration(connection, data);

    // 9. 收集数据导入模式数据
    await this.collectDataIngestionPatterns(connection, data);

    // 10. 如果指定了特定表，收集详细信息
    if (options.targetDatabase && options.targetTable) {
      await this.collectTableSpecificData(connection, data, options);
    }

    console.error(`✅ 数据收集完成，共收集${Object.keys(data).length}项数据`);
    return data;
  }

  /**
   * 收集高CS分区信息
   */
  async collectHighCSPartitions(connection, data, options) {
    try {
      let query = `
        SELECT DB_NAME, TABLE_NAME, PARTITION_NAME,
               MAX_CS, AVG_CS, P50_CS, ROW_COUNT,
               DATA_SIZE, STORAGE_SIZE, BUCKETS
        FROM information_schema.partitions_meta
        WHERE MAX_CS > ${this.rules.compaction_score.warning}
      `;

      // 如果指定了特定表，只查询该表
      if (options.targetDatabase && options.targetTable) {
        query += ` AND DB_NAME = '${options.targetDatabase}' AND TABLE_NAME = '${options.targetTable}'`;
      }

      query += ' ORDER BY MAX_CS DESC LIMIT 200;';

      const [rows] = await connection.query(query);

      data.high_cs_partitions = rows.map((row) => ({
        database: row.DB_NAME,
        table: row.TABLE_NAME,
        partition: row.PARTITION_NAME,
        max_cs: row.MAX_CS,
        avg_cs: row.AVG_CS,
        p50_cs: row.P50_CS,
        row_count: row.ROW_COUNT,
        data_size: row.DATA_SIZE,
        storage_size: row.STORAGE_SIZE,
        buckets: row.BUCKETS,
        severity: this.categorizeCSScore(row.MAX_CS),
      }));

      // 统计CS分布
      data.cs_statistics = this.analyzeCSDistribution(data.high_cs_partitions);

      console.error(`   → 收集到${data.high_cs_partitions.length}个高CS分区`);
    } catch (error) {
      console.warn('收集高CS分区信息失败:', error.message);
      data.high_cs_partitions = [];
      data.cs_statistics = this.getEmptyCSStatistics();
    }
  }

  /**
   * 收集Compaction线程配置
   */
  async collectCompactionThreadConfig(connection, data) {
    try {
      const [rows] = await connection.query(`
        SELECT * FROM information_schema.be_configs WHERE name = 'compact_threads';
      `);

      data.thread_configuration = rows.map((row) => ({
        node_id: row.BE_ID,
        node_name: row.NAME || 'compact_threads',
        current_threads: parseInt(row.VALUE) || 0,
        default_threads: parseInt(row.DEFAULT) || 4,
        is_mutable: row.MUTABLE === 1,
        description: row.DESCRIPTION || 'Compaction thread count',
      }));

      // 计算线程统计信息
      data.thread_statistics = this.calculateThreadStatistics(
        data.thread_configuration,
      );

      console.error(
        `   → 收集到${data.thread_configuration.length}个节点的线程配置`,
      );
    } catch (error) {
      console.warn('收集线程配置失败:', error.message);
      data.thread_configuration = [];
      data.thread_statistics = this.getEmptyThreadStatistics();
    }
  }

  /**
   * 收集正在运行的任务
   */
  async collectRunningTasks(connection, data) {
    try {
      const [rows] = await connection.query(`
        SELECT BE_ID, TXN_ID, TABLET_ID, VERSION, START_TIME, FINISH_TIME,
               PROGRESS, STATUS, RUNS, SKIPPED
        FROM information_schema.be_cloud_native_compactions
        WHERE START_TIME IS NOT NULL AND FINISH_TIME IS NULL
        ORDER BY START_TIME;
      `);

      const now = new Date();
      data.running_tasks = rows.map((row) => ({
        be_id: row.BE_ID,
        txn_id: row.TXN_ID,
        tablet_id: row.TABLET_ID,
        version: row.VERSION,
        start_time: row.START_TIME,
        progress: row.PROGRESS || 0,
        status: row.STATUS,
        retry_count: row.RUNS || 0,
        skipped: row.SKIPPED || false,
        duration_hours: row.START_TIME
          ? (now - new Date(row.START_TIME)) / (1000 * 60 * 60)
          : 0,
        is_slow: row.START_TIME
          ? (now - new Date(row.START_TIME)) / (1000 * 60 * 60) >
            this.rules.task_execution.slow_task_threshold_hours
          : false,
        is_stalled:
          (row.PROGRESS || 0) < 50 &&
          (row.RUNS || 0) > this.rules.task_execution.max_retry_count,
      }));

      // 按BE节点分组任务
      data.tasks_by_be = this.groupTasksByBE(data.running_tasks);

      // 任务执行统计
      data.task_execution_stats = this.calculateTaskExecutionStats(
        data.running_tasks,
        data.tasks_by_be,
      );

      console.error(`   → 收集到${data.running_tasks.length}个正在运行的任务`);
    } catch (error) {
      console.warn('收集运行任务失败:', error.message);
      data.running_tasks = [];
      data.tasks_by_be = {};
      data.task_execution_stats = this.getEmptyTaskStats();
    }
  }

  /**
   * 收集FE配置参数
   */
  async collectFEConfiguration(connection, data) {
    try {
      // 尝试获取lake_compaction_max_tasks配置
      try {
        const [feRows] = await connection.query(`
          ADMIN SHOW FRONTEND CONFIG LIKE 'lake_compaction_max_tasks';
        `);

        if (feRows.length > 0) {
          const maxTasks = parseInt(feRows[0].Value) || 0;
          data.fe_configuration = {
            lake_compaction_max_tasks: maxTasks,
            mode:
              maxTasks === -1
                ? 'ADAPTIVE'
                : maxTasks === 0
                  ? 'DISABLED'
                  : 'FIXED',
            is_adaptive: maxTasks === -1,
            is_disabled: maxTasks === 0,
          };
        } else {
          throw new Error('lake_compaction_max_tasks not found');
        }
      } catch (feError) {
        console.warn('无法获取FE配置，可能是权限不足:', feError.message);
        data.fe_configuration = {
          lake_compaction_max_tasks: null,
          mode: 'UNKNOWN',
          is_adaptive: false,
          is_disabled: false,
          error: feError.message,
        };
      }

      console.error('   → 收集FE配置完成');
    } catch (error) {
      console.warn('收集FE配置失败:', error.message);
      data.fe_configuration = this.getDefaultFEConfig();
    }
  }

  /**
   * 收集BE节点信息
   */
  async collectBENodeInfo(connection, data) {
    try {
      const [rows] = await connection.query('SHOW BACKENDS;');

      data.be_nodes = rows.map((row) => ({
        backend_id: row.BackendId,
        ip: row.IP,
        is_alive: row.Alive === 'true',
        cpu_cores: parseInt(row.CpuCores) || 1,
        mem_used_pct: parseFloat(row.MemUsedPct?.replace('%', '')) || 0,
        disk_used_pct: parseFloat(row.MaxDiskUsedPct?.replace('%', '')) || 0,
        last_heartbeat: row.LastHeartbeat,
      }));

      // 计算集群统计信息
      data.cluster_stats = {
        total_nodes: data.be_nodes.length,
        alive_nodes: data.be_nodes.filter((be) => be.is_alive).length,
        total_cpu_cores: data.be_nodes.reduce(
          (sum, be) => sum + be.cpu_cores,
          0,
        ),
        avg_cpu_cores:
          data.be_nodes.length > 0
            ? Math.round(
                data.be_nodes.reduce((sum, be) => sum + be.cpu_cores, 0) /
                  data.be_nodes.length,
              )
            : 0,
      };

      console.error(`   → 收集到${data.be_nodes.length}个BE节点信息`);
    } catch (error) {
      console.warn('收集BE节点信息失败:', error.message);
      data.be_nodes = [];
      data.cluster_stats = this.getEmptyClusterStats();
    }
  }

  /**
   * 收集历史任务信息
   */
  async collectHistoricalTasks(connection, data) {
    try {
      const [rows] = await connection.query(`
        SELECT BE_ID, TXN_ID, TABLET_ID, START_TIME, FINISH_TIME,
               PROGRESS, STATUS, RUNS
        FROM information_schema.be_cloud_native_compactions
        WHERE FINISH_TIME IS NOT NULL
        ORDER BY FINISH_TIME DESC
        LIMIT 100;
      `);

      data.recent_completed_tasks = rows.map((row) => {
        const duration =
          row.START_TIME && row.FINISH_TIME
            ? (new Date(row.FINISH_TIME) - new Date(row.START_TIME)) /
              (1000 * 60 * 60)
            : 0;

        return {
          be_id: row.BE_ID,
          txn_id: row.TXN_ID,
          tablet_id: row.TABLET_ID,
          start_time: row.START_TIME,
          finish_time: row.FINISH_TIME,
          progress: row.PROGRESS || 0,
          status: row.STATUS,
          retry_count: row.RUNS || 0,
          duration_hours: duration,
          is_successful: (row.PROGRESS || 0) >= 100 && row.STATUS !== 'FAILED',
        };
      });

      // 计算成功率和平均执行时间
      data.historical_performance = this.calculateHistoricalPerformance(
        data.recent_completed_tasks,
      );

      console.error(
        `   → 收集到${data.recent_completed_tasks.length}个历史任务`,
      );
    } catch (error) {
      console.warn('收集历史任务失败:', error.message);
      data.recent_completed_tasks = [];
      data.historical_performance = this.getEmptyHistoricalPerformance();
    }
  }

  /**
   * 收集特定表的详细数据
   */
  async collectTableSpecificData(connection, data, options) {
    try {
      const { targetDatabase, targetTable } = options;

      const [rows] = await connection.query(`
        SELECT DB_NAME, TABLE_NAME, PARTITION_NAME,
               MAX_CS, AVG_CS, P50_CS, ROW_COUNT,
               DATA_SIZE, STORAGE_SIZE, BUCKETS, REPLICATION_NUM
        FROM information_schema.partitions_meta
        WHERE DB_NAME = '${targetDatabase}' AND TABLE_NAME = '${targetTable}'
        ORDER BY MAX_CS DESC;
      `);

      data.target_table_analysis = {
        database: targetDatabase,
        table: targetTable,
        total_partitions: rows.length,
        partitions: rows.map((row) => ({
          partition: row.PARTITION_NAME,
          max_cs: row.MAX_CS,
          avg_cs: row.AVG_CS,
          p50_cs: row.P50_CS,
          row_count: row.ROW_COUNT,
          data_size: row.DATA_SIZE,
          storage_size: row.STORAGE_SIZE,
          buckets: row.BUCKETS,
          replication_num: row.REPLICATION_NUM,
          severity: this.categorizeCSScore(row.MAX_CS),
        })),
        cs_distribution: this.analyzeCSDistribution(
          rows.map((row) => ({ max_cs: row.MAX_CS })),
        ),
        optimization_priority: this.calculateTableOptimizationPriority(rows),
      };

      console.error(
        `   → 收集到表 ${targetDatabase}.${targetTable} 的${rows.length}个分区`,
      );
    } catch (error) {
      console.warn('收集表特定数据失败:', error.message);
      data.target_table_analysis = null;
    }
  }

  /**
   * 执行多维度专业诊断
   */
  async performMultiDimensionalDiagnosis(compactionData, analysisScope) {
    console.error('🔍 执行多维度Compaction诊断...');

    const diagnosis = {
      criticals: [],
      warnings: [],
      issues: [],
      insights: [],
    };

    // 1. CS分数诊断
    this.diagnoseCompactionScores(compactionData, diagnosis);

    // 2. 线程配置诊断
    this.diagnoseThreadConfiguration(compactionData, diagnosis);

    // 3. 任务执行效率诊断
    this.diagnoseTaskExecution(compactionData, diagnosis);

    // 4. FE配置诊断
    this.diagnoseFEConfiguration(compactionData, diagnosis);

    // 5. 系统级压力诊断
    this.diagnoseSystemPressure(compactionData, diagnosis);

    // 6. 系统资源诊断
    this.diagnoseSystemResources(compactionData, diagnosis);

    // 7. 参数配置诊断
    this.diagnoseParameterConfiguration(compactionData, diagnosis);

    // 8. 导入模式诊断
    this.diagnoseIngestionPatterns(compactionData, diagnosis);

    // 9. 如果是深度分析，执行高级诊断
    if (analysisScope === 'deep') {
      this.performAdvancedDiagnosis(compactionData, diagnosis);
    }

    // 10. 跨维度关联分析
    this.performCrossDimensionalAnalysis(compactionData, diagnosis);

    // 计算诊断统计
    diagnosis.total_issues =
      diagnosis.criticals.length +
      diagnosis.warnings.length +
      diagnosis.issues.length;
    diagnosis.summary = this.generateDiagnosisSummary(diagnosis);

    console.error(
      `✅ 诊断完成: ${diagnosis.criticals.length}个严重问题, ${diagnosis.warnings.length}个警告`,
    );

    return diagnosis;
  }

  /**
   * CS分数专业诊断
   */
  diagnoseCompactionScores(data, diagnosis) {
    const highCSPartitions = data.high_cs_partitions || [];
    const csStats = data.cs_statistics || {};

    // 紧急CS问题
    const emergencyPartitions = highCSPartitions.filter(
      (p) => p.max_cs >= this.rules.compaction_score.emergency,
    );
    if (emergencyPartitions.length > 0) {
      diagnosis.criticals.push({
        type: 'emergency_compaction_score',
        severity: 'CRITICAL',
        priority: 'IMMEDIATE',
        message: `发现 ${emergencyPartitions.length} 个紧急高CS分区 (CS ≥ 1000)`,
        affected_partitions: emergencyPartitions.slice(0, 10).map((p) => ({
          partition: `${p.database}.${p.table}.${p.partition}`,
          cs: p.max_cs,
          data_size: p.data_size,
          row_count: p.row_count,
        })),
        impact: {
          performance: '严重影响查询性能，可能导致查询超时',
          storage: '存储空间利用率低，碎片化严重',
          business: '直接影响用户体验和业务连续性',
        },
        urgency_reason: 'CS超过1000表示数据碎片化极其严重，必须立即处理',
        estimated_impact_scope:
          emergencyPartitions.length > 10 ? 'CLUSTER_WIDE' : 'LOCALIZED',
      });
    }

    // 严重CS问题
    const criticalPartitions = highCSPartitions.filter(
      (p) =>
        p.max_cs >= this.rules.compaction_score.critical &&
        p.max_cs < this.rules.compaction_score.emergency,
    );
    if (criticalPartitions.length > 0) {
      diagnosis.criticals.push({
        type: 'critical_compaction_score',
        severity: 'CRITICAL',
        priority: 'HIGH',
        message: `发现 ${criticalPartitions.length} 个严重高CS分区 (500 ≤ CS < 1000)`,
        affected_count: criticalPartitions.length,
        max_cs_in_group: Math.max(...criticalPartitions.map((p) => p.max_cs)),
        impact: {
          performance: '显著影响查询性能',
          storage: '存储效率低下',
          resource: '占用过多系统资源',
        },
        recommended_batch_size: Math.min(5, criticalPartitions.length),
        processing_strategy: 'batch_compaction_with_monitoring',
      });
    }

    // 警告级CS问题
    const warningPartitions = highCSPartitions.filter(
      (p) =>
        p.max_cs >= this.rules.compaction_score.warning &&
        p.max_cs < this.rules.compaction_score.critical,
    );
    if (warningPartitions.length > 0) {
      diagnosis.warnings.push({
        type: 'warning_compaction_score',
        severity: 'WARNING',
        priority: 'MEDIUM',
        message: `发现 ${warningPartitions.length} 个警告级高CS分区 (100 ≤ CS < 500)`,
        affected_count: warningPartitions.length,
        trend_analysis: this.analyzeCSGrowthTrend(warningPartitions),
        prevention_focus: true,
      });
    }

    // CS分布洞察
    if (csStats.total_partitions > 0) {
      diagnosis.insights.push({
        type: 'cs_distribution_analysis',
        message: 'Compaction Score 分布分析',
        statistics: csStats,
        health_indicators: {
          excellent_ratio: (
            ((csStats.excellent_partitions || 0) / csStats.total_partitions) *
            100
          ).toFixed(1),
          problematic_ratio: (
            ((csStats.critical_partitions + csStats.emergency_partitions) /
              csStats.total_partitions) *
            100
          ).toFixed(1),
        },
        recommendations: this.generateCSDistributionRecommendations(csStats),
      });
    }
  }

  /**
   * 线程配置诊断
   */
  diagnoseThreadConfiguration(data, diagnosis) {
    const threadConfig = data.thread_configuration || [];
    const threadStats = data.thread_statistics || {};
    const beNodes = data.be_nodes || [];

    if (threadConfig.length === 0) {
      diagnosis.warnings.push({
        type: 'thread_config_unavailable',
        severity: 'WARNING',
        message: '无法获取Compaction线程配置信息',
        impact: '无法评估线程配置合理性',
        suggestions: [
          '检查数据库连接权限',
          '确认StarRocks版本支持线程配置查询',
        ],
      });
      return;
    }

    // 分析每个节点的线程配置
    threadConfig.forEach((config) => {
      const beNode = beNodes.find((be) => be.backend_id == config.node_id);
      const cpuCores = beNode ? beNode.cpu_cores : 4; // 默认4核

      const minRecommended = Math.max(
        this.rules.thread_config.absolute_min_threads,
        Math.ceil(cpuCores * this.rules.thread_config.min_threads_per_core),
      );

      const maxRecommended = Math.min(
        this.rules.thread_config.absolute_max_threads,
        Math.ceil(cpuCores * this.rules.thread_config.max_threads_per_core),
      );

      const currentThreads = config.current_threads;
      const nodeIP = beNode ? beNode.ip : 'Unknown';

      // 线程数过低
      if (currentThreads < minRecommended) {
        const severity =
          currentThreads < this.rules.thread_config.recommended_base
            ? 'CRITICAL'
            : 'WARNING';
        (severity === 'CRITICAL'
          ? diagnosis.criticals
          : diagnosis.warnings
        ).push({
          type: 'low_compaction_threads',
          node_id: config.node_id,
          node_ip: nodeIP,
          severity: severity,
          priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          message: `节点 ${nodeIP} Compaction线程数过低 (${currentThreads}/${cpuCores}核)`,
          current_config: {
            threads: currentThreads,
            cpu_cores: cpuCores,
            threads_per_core: (currentThreads / cpuCores).toFixed(2),
          },
          recommendations: {
            min_threads: minRecommended,
            optimal_threads: Math.ceil(cpuCores * 0.375), // 中间值
            max_threads: maxRecommended,
          },
          impact:
            severity === 'CRITICAL'
              ? 'Compaction处理能力严重不足，CS积累加速'
              : 'Compaction效率偏低，可能导致CS增长',
          adjustment_command: this.generateThreadAdjustmentCommand(
            config.node_id,
            nodeIP,
            minRecommended,
          ),
        });
      }

      // 线程数过高
      else if (currentThreads > maxRecommended) {
        diagnosis.warnings.push({
          type: 'high_compaction_threads',
          node_id: config.node_id,
          node_ip: nodeIP,
          severity: 'WARNING',
          priority: 'LOW',
          message: `节点 ${nodeIP} Compaction线程数偏高 (${currentThreads}/${cpuCores}核)`,
          current_config: {
            threads: currentThreads,
            cpu_cores: cpuCores,
            threads_per_core: (currentThreads / cpuCores).toFixed(2),
          },
          impact: '可能过度消耗CPU资源，影响其他操作',
          risk_assessment: 'MEDIUM',
          suggested_adjustment: maxRecommended,
        });
      }
    });

    // 集群级线程配置洞察
    if (threadStats.total_threads > 0) {
      diagnosis.insights.push({
        type: 'cluster_thread_analysis',
        message: '集群Compaction线程配置分析',
        cluster_metrics: {
          total_threads: threadStats.total_threads,
          average_threads_per_node: threadStats.avg_threads_per_node,
          threads_per_core_ratio: threadStats.avg_threads_per_core,
          thread_utilization: this.calculateThreadUtilization(data),
        },
        optimization_potential: this.assessThreadOptimizationPotential(
          threadStats,
          data.cluster_stats,
        ),
        best_practices: [
          '线程数应根据CPU核心数动态配置',
          '监控线程使用率避免资源浪费',
          '定期评估线程配置与工作负载的匹配度',
        ],
      });
    }
  }

  /**
   * 任务执行效率诊断
   */
  diagnoseTaskExecution(data, diagnosis) {
    const runningTasks = data.running_tasks || [];
    const taskStats = data.task_execution_stats || {};
    const historicalPerf = data.historical_performance || {};

    // 检查停滞任务
    const stalledTasks = runningTasks.filter((task) => task.is_stalled);
    if (stalledTasks.length > 0) {
      diagnosis.criticals.push({
        type: 'stalled_compaction_tasks',
        severity: 'CRITICAL',
        priority: 'IMMEDIATE',
        message: `发现 ${stalledTasks.length} 个停滞的Compaction任务`,
        stalled_tasks: stalledTasks.map((task) => ({
          be_id: task.be_id,
          tablet_id: task.tablet_id,
          progress: task.progress,
          retry_count: task.retry_count,
          duration_hours: task.duration_hours.toFixed(1),
          status: task.status,
        })),
        impact: '停滞任务阻塞Compaction队列，影响整体效率',
        root_cause_analysis: [
          '检查BE节点资源使用情况',
          '验证磁盘IO性能',
          '检查网络连接稳定性',
          '查看BE日志中的错误信息',
        ],
        recovery_actions: this.generateStalledTaskRecoveryActions(stalledTasks),
      });
    }

    // 检查长时间运行任务
    const slowTasks = runningTasks.filter(
      (task) => task.is_slow && !task.is_stalled,
    );
    if (slowTasks.length > 0) {
      diagnosis.warnings.push({
        type: 'slow_compaction_tasks',
        severity: 'WARNING',
        priority: 'MEDIUM',
        message: `发现 ${slowTasks.length} 个长时间运行的任务`,
        slow_tasks: slowTasks.slice(0, 5).map((task) => ({
          be_id: task.be_id,
          tablet_id: task.tablet_id,
          duration_hours: task.duration_hours.toFixed(1),
          progress: task.progress,
        })),
        impact: '可能表示系统负载过高或数据复杂度高',
        monitoring_suggestion: '建议持续监控这些任务的进度',
      });
    }

    // 检查单节点任务过载
    const tasksByBE = data.tasks_by_be || {};
    const overloadedNodes = Object.entries(tasksByBE).filter(
      ([beId, tasks]) =>
        tasks.length > this.rules.task_execution.max_healthy_tasks_per_node,
    );

    if (overloadedNodes.length > 0) {
      diagnosis.warnings.push({
        type: 'node_task_overload',
        severity: 'WARNING',
        priority: 'MEDIUM',
        message: `${overloadedNodes.length} 个节点任务负载过高`,
        overloaded_nodes: overloadedNodes.map(([beId, tasks]) => ({
          be_id: beId,
          task_count: tasks.length,
          max_recommended: this.rules.task_execution.max_healthy_tasks_per_node,
        })),
        impact: '可能导致任务执行缓慢和资源竞争',
        load_balancing_needed: true,
      });
    }

    // 历史性能分析
    if (historicalPerf.total_tasks > 0) {
      const successRate = historicalPerf.success_rate;
      if (successRate < this.rules.task_execution.healthy_success_rate) {
        diagnosis.warnings.push({
          type: 'low_task_success_rate',
          severity: 'WARNING',
          priority: 'MEDIUM',
          message: `Compaction任务成功率偏低 (${successRate.toFixed(1)}%)`,
          historical_metrics: {
            total_tasks: historicalPerf.total_tasks,
            successful_tasks: historicalPerf.successful_tasks,
            success_rate: successRate,
            avg_duration_hours: historicalPerf.avg_duration_hours,
          },
          impact: '频繁的任务失败可能导致CS持续积累',
          investigation_areas: [
            '检查磁盘空间是否充足',
            '验证网络连接稳定性',
            '分析BE节点性能指标',
            '查看错误日志模式',
          ],
        });
      }
    }

    // 任务执行洞察
    if (runningTasks.length > 0 || historicalPerf.total_tasks > 0) {
      diagnosis.insights.push({
        type: 'task_execution_analysis',
        message: 'Compaction任务执行分析',
        current_load: {
          running_tasks: runningTasks.length,
          tasks_per_node: taskStats.avg_tasks_per_node,
          cluster_utilization: this.calculateClusterTaskUtilization(data),
        },
        performance_trends: {
          success_rate: historicalPerf.success_rate,
          avg_duration: historicalPerf.avg_duration_hours,
          efficiency_rating: this.calculateTaskEfficiencyRating(historicalPerf),
        },
        optimization_suggestions: this.generateTaskOptimizationSuggestions(
          taskStats,
          historicalPerf,
        ),
      });
    }
  }

  /**
   * FE配置诊断
   */
  diagnoseFEConfiguration(data, diagnosis) {
    const feConfig = data.fe_configuration || {};
    const clusterStats = data.cluster_stats || {};
    const csStats = data.cs_statistics || {};

    if (feConfig.error) {
      diagnosis.warnings.push({
        type: 'fe_config_access_error',
        severity: 'WARNING',
        priority: 'LOW',
        message: '无法获取FE配置参数',
        error_details: feConfig.error,
        impact: '无法评估lake_compaction_max_tasks配置合理性',
        suggestions: [
          '检查是否有ADMIN权限',
          '确认StarRocks版本支持该配置项',
          '手动检查FE配置文件',
        ],
      });
      return;
    }

    const maxTasks = feConfig.lake_compaction_max_tasks;
    const totalNodes = clusterStats.alive_nodes || 1;
    const highCSPartitions =
      csStats.critical_partitions + csStats.emergency_partitions || 0;

    // Compaction被禁用
    if (feConfig.is_disabled) {
      diagnosis.criticals.push({
        type: 'compaction_disabled',
        severity: 'CRITICAL',
        priority: 'HIGH',
        message: 'Compaction功能已被禁用 (lake_compaction_max_tasks = 0)',
        impact: {
          immediate: 'CS将持续增长，无法自动压缩',
          long_term: '存储效率严重下降，查询性能恶化',
        },
        business_risk: 'HIGH',
        recommended_value: Math.max(
          totalNodes * this.rules.fe_config.adaptive_multiplier,
          this.rules.fe_config.min_recommended_max_tasks,
        ),
        enable_command:
          'ADMIN SET FRONTEND CONFIG ("lake_compaction_max_tasks" = "-1");', // 建议使用自适应模式
      });
    }

    // 自适应模式评估
    else if (feConfig.is_adaptive) {
      const adaptiveMaxTasks =
        totalNodes * this.rules.fe_config.adaptive_multiplier;

      diagnosis.insights.push({
        type: 'adaptive_compaction_config',
        message: 'Compaction自适应模式评估',
        current_config: {
          mode: 'ADAPTIVE',
          calculated_max_tasks: adaptiveMaxTasks,
          node_count: totalNodes,
        },
        effectiveness_assessment: this.assessAdaptiveModeEffectiveness(
          adaptiveMaxTasks,
          highCSPartitions,
        ),
        pros: ['自动根据集群规模调整', '适应集群扩缩容', '减少手动配置维护'],
        cons: [
          '可能不适应特定工作负载',
          '无法精细化控制',
          '突发负载时可能不够灵活',
        ],
        recommendation:
          highCSPartitions > adaptiveMaxTasks / 2
            ? 'CONSIDER_FIXED_VALUE'
            : 'KEEP_ADAPTIVE',
      });
    }

    // 固定值模式评估
    else {
      const recommendedMinTasks = Math.max(
        totalNodes * 8, // 每个节点至少8个任务
        highCSPartitions / 10, // 高CS分区数的1/10
        this.rules.fe_config.min_recommended_max_tasks,
      );

      if (maxTasks < recommendedMinTasks) {
        const severity =
          maxTasks < recommendedMinTasks / 2 ? 'CRITICAL' : 'WARNING';

        (severity === 'CRITICAL'
          ? diagnosis.criticals
          : diagnosis.warnings
        ).push({
          type: 'low_max_compaction_tasks',
          severity: severity,
          priority: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          message: `lake_compaction_max_tasks设置过低 (${maxTasks})`,
          current_vs_recommended: {
            current: maxTasks,
            recommended_min: recommendedMinTasks,
            gap_ratio: (recommendedMinTasks / maxTasks).toFixed(1),
          },
          impact:
            severity === 'CRITICAL'
              ? 'Compaction处理能力严重不足，CS快速积累'
              : 'Compaction处理能力有限，可能无法及时处理高CS分区',
          tuning_suggestion: {
            immediate_value: Math.min(recommendedMinTasks, maxTasks * 2), // 先翻倍，避免激进调整
            target_value: recommendedMinTasks,
            adjustment_command: `ADMIN SET FRONTEND CONFIG ("lake_compaction_max_tasks" = "${recommendedMinTasks}");`,
          },
        });
      } else if (maxTasks > recommendedMinTasks * 3) {
        diagnosis.warnings.push({
          type: 'high_max_compaction_tasks',
          severity: 'WARNING',
          priority: 'LOW',
          message: `lake_compaction_max_tasks设置过高 (${maxTasks})`,
          impact: '可能过度占用系统资源',
          resource_risk: 'MEDIUM',
          optimization_opportunity: true,
          suggested_value: Math.ceil(recommendedMinTasks * 1.5),
        });
      }
    }
  }

  /**
   * 系统级压力诊断
   */
  diagnoseSystemPressure(data, diagnosis) {
    const runningTasks = data.running_tasks || [];
    const beNodes = data.be_nodes || [];
    const threadConfig = data.thread_configuration || [];
    const csStats = data.cs_statistics || {};

    const aliveNodes = beNodes.filter((be) => be.is_alive).length;
    const totalRunningTasks = runningTasks.length;
    const totalThreads = threadConfig.reduce(
      (sum, config) => sum + config.current_threads,
      0,
    );

    // 计算系统压力指标
    const pressureMetrics = {
      tasks_per_node: aliveNodes > 0 ? totalRunningTasks / aliveNodes : 0,
      thread_utilization:
        totalThreads > 0 ? totalRunningTasks / totalThreads : 0,
      high_cs_density:
        (csStats.critical_partitions + csStats.emergency_partitions) /
        Math.max(aliveNodes, 1),
      cluster_load_level: this.calculateClusterLoadLevel(
        totalRunningTasks,
        aliveNodes,
        csStats,
      ),
    };

    // 高系统压力诊断
    if (pressureMetrics.cluster_load_level === 'HIGH') {
      diagnosis.criticals.push({
        type: 'high_system_compaction_pressure',
        severity: 'CRITICAL',
        priority: 'HIGH',
        message: '系统Compaction压力过高',
        pressure_indicators: {
          tasks_per_node: pressureMetrics.tasks_per_node.toFixed(1),
          thread_utilization: `${(pressureMetrics.thread_utilization * 100).toFixed(1)}%`,
          high_cs_partitions:
            csStats.critical_partitions + csStats.emergency_partitions,
          load_level: pressureMetrics.cluster_load_level,
        },
        impact: {
          performance: '系统响应能力下降',
          stability: '可能导致任务积压和系统不稳定',
          business: '影响数据实时性和查询性能',
        },
        immediate_actions: [
          '暂停非关键数据导入',
          '手动清理最高CS分区',
          '考虑增加处理线程',
          '监控系统资源使用',
        ],
      });
    } else if (pressureMetrics.cluster_load_level === 'MEDIUM') {
      diagnosis.warnings.push({
        type: 'elevated_compaction_pressure',
        severity: 'WARNING',
        priority: 'MEDIUM',
        message: '系统Compaction压力偏高',
        trend_warning: true,
        monitoring_focus: [
          '密切关注CS增长趋势',
          '监控任务执行效率',
          '评估是否需要扩容',
        ],
      });
    }

    // 资源利用率分析
    diagnosis.insights.push({
      type: 'system_resource_analysis',
      message: 'Compaction系统资源利用分析',
      resource_metrics: pressureMetrics,
      capacity_assessment: {
        current_capacity: totalThreads,
        current_utilization: `${(pressureMetrics.thread_utilization * 100).toFixed(1)}%`,
        bottleneck_analysis: this.identifyCompactionBottlenecks(data),
        scaling_recommendation: this.generateScalingRecommendation(
          pressureMetrics,
          data,
        ),
      },
      efficiency_score: this.calculateCompactionEfficiencyScore(
        pressureMetrics,
        data,
      ),
    });
  }

  /**
   * 生成线程调整命令
   */
  generateThreadAdjustmentCommand(nodeId, nodeIP, recommendedThreads) {
    return {
      description: `调整节点 ${nodeIP} 的Compaction线程数`,
      command: `ADMIN SET be_config ("compact_threads" = "${recommendedThreads}") FOR "${nodeIP}";`,
      alternative_command: `UPDATE information_schema.be_configs SET value = ${recommendedThreads} WHERE name = 'compact_threads' AND BE_ID = ${nodeId};`,
      verification: `SELECT * FROM information_schema.be_configs WHERE name = 'compact_threads' AND BE_ID = ${nodeId};`,
      notes: [
        '建议在低峰期执行配置变更',
        '变更后监控系统资源使用情况',
        '根据实际效果进行微调',
      ],
    };
  }

  /**
   * 生成综合优化建议
   */
  generateComprehensiveRecommendations(diagnosis, compactionData) {
    console.error('💡 生成Compaction专业优化建议...');

    const recommendations = [];

    // 处理严重问题的建议
    diagnosis.criticals.forEach((critical) => {
      const recommendation = this.createCriticalIssueRecommendation(
        critical,
        compactionData,
      );
      if (recommendation) recommendations.push(recommendation);
    });

    // 处理警告问题的建议
    diagnosis.warnings.forEach((warning) => {
      const recommendation = this.createWarningIssueRecommendation(
        warning,
        compactionData,
      );
      if (recommendation) recommendations.push(recommendation);
    });

    // 添加预防性和优化性建议
    recommendations.push(
      ...this.generatePreventiveRecommendations(compactionData, diagnosis),
    );

    return recommendations.sort((a, b) => {
      const priorityOrder = { IMMEDIATE: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (
        (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
      );
    });
  }

  /**
   * 创建严重问题建议
   */
  createCriticalIssueRecommendation(critical, compactionData) {
    switch (critical.type) {
      case 'emergency_compaction_score':
        return {
          id: 'emergency_cs_handling',
          category: 'critical_performance',
          priority: 'IMMEDIATE',
          title: '🚨 紧急CS处理计划',
          description: `立即处理${critical.affected_partitions.length}个紧急高CS分区`,
          estimated_duration: '2-4小时',
          risk_level: 'LOW',
          business_impact: 'HIGH_POSITIVE',

          action_plan: {
            phase1: {
              name: '紧急处理阶段',
              duration: '30-60分钟',
              actions: [
                {
                  step: 1,
                  action: '识别最高优先级分区',
                  command: `SELECT DB_NAME, TABLE_NAME, PARTITION_NAME, MAX_CS FROM information_schema.partitions_meta WHERE MAX_CS >= 1000 ORDER BY MAX_CS DESC LIMIT 5;`,
                  purpose: '定位需要立即处理的分区',
                },
                {
                  step: 2,
                  action: '执行紧急Compaction',
                  commands: critical.affected_partitions
                    .slice(0, 3)
                    .map(
                      (p) =>
                        `ALTER TABLE \`${p.partition.split('.')[0]}\`.\`${p.partition.split('.')[1]}\` COMPACT \`${p.partition.split('.')[2]}\`;`,
                    ),
                  parallel_execution: false,
                  monitoring_required: true,
                },
              ],
            },
            phase2: {
              name: '批量处理阶段',
              duration: '2-3小时',
              actions: [
                {
                  step: 1,
                  action: '分批处理剩余分区',
                  batch_size: 3,
                  interval_minutes: 15,
                  progress_monitoring: true,
                },
              ],
            },
          },

          monitoring_plan: {
            immediate_metrics: [
              'Compaction任务进度',
              '系统资源使用',
              'CS变化趋势',
            ],
            success_criteria: 'CS降至500以下',
            fallback_plan: '如果Compaction效果不佳，考虑手动数据重建',
          },

          prevention_measures: [
            '设置CS监控告警阈值为300',
            '建立定期Compaction检查机制',
            '优化数据导入策略减少小批量写入',
          ],
        };

      case 'compaction_disabled':
        return {
          id: 'enable_compaction',
          category: 'critical_configuration',
          priority: 'IMMEDIATE',
          title: '🔧 启用Compaction功能',
          description: 'Compaction被禁用，必须立即启用以防止CS无限增长',

          immediate_action: {
            command: critical.enable_command,
            verification:
              'ADMIN SHOW FRONTEND CONFIG LIKE "lake_compaction_max_tasks";',
            expected_result: '配置值应为-1（自适应）或正整数',
          },

          post_enable_monitoring: {
            duration: '24小时',
            key_metrics: [
              '新启动的Compaction任务数',
              'CS变化趋势',
              '系统资源使用',
            ],
            adjustment_threshold:
              '如果24小时内CS无明显下降，需要调整max_tasks值',
          },
        };

      case 'stalled_compaction_tasks':
        return {
          id: 'recover_stalled_tasks',
          category: 'critical_recovery',
          priority: 'IMMEDIATE',
          title: '🔄 停滞任务恢复',
          description: `恢复${critical.stalled_tasks.length}个停滞的Compaction任务`,

          investigation_steps: critical.root_cause_analysis,
          recovery_actions: critical.recovery_actions || [
            '检查BE节点日志获取详细错误信息',
            '验证磁盘空间和权限',
            '考虑重启相关BE进程（谨慎操作）',
          ],

          prevention_strategy: {
            monitoring: '设置任务执行时间监控',
            alerting: '任务进度停滞超过1小时自动告警',
            maintenance: '定期检查任务队列健康状态',
          },
        };

      default:
        return null;
    }
  }

  /**
   * 创建警告问题建议
   */
  createWarningIssueRecommendation(warning, compactionData) {
    switch (warning.type) {
      case 'low_compaction_threads':
        return {
          id: `optimize_threads_${warning.node_id}`,
          category: 'performance_tuning',
          priority: 'MEDIUM',
          title: `🔧 优化节点${warning.node_ip}线程配置`,
          description: `当前${warning.current_config.threads}线程不足，建议调整至${warning.recommendations.optimal_threads}线程`,

          implementation: {
            command: warning.adjustment_command.command,
            verification: warning.adjustment_command.verification,
            rollback_plan: `恢复原配置：${warning.current_config.threads}线程`,
          },

          monitoring_after_change: {
            duration: '48小时',
            metrics: ['Compaction任务完成速度', 'CPU使用率', '新CS产生速度'],
            success_criteria: 'Compaction处理速度提升20%以上',
            adjustment_guideline: '根据实际效果进行微调',
          },
        };

      case 'warning_compaction_score':
        return {
          id: 'preventive_cs_management',
          category: 'preventive_maintenance',
          priority: 'MEDIUM',
          title: '📋 预防性CS管理',
          description: `管理${warning.affected_count}个警告级CS分区，防止恶化`,

          strategy: {
            approach: 'SCHEDULED_MAINTENANCE',
            schedule: '低峰期批量处理',
            batch_size: 10,
            frequency: '每周一次',
          },

          automation_opportunity: {
            description: '可考虑建立自动化Compaction脚本',
            trigger_condition: 'CS > 150',
            safety_checks: ['系统负载检查', '业务影响评估'],
          },
        };

      default:
        return null;
    }
  }

  /**
   * 生成预防性建议
   */
  generatePreventiveRecommendations(compactionData, diagnosis) {
    const recommendations = [];

    // 监控和告警建议
    recommendations.push({
      id: 'monitoring_enhancement',
      category: 'monitoring_alerting',
      priority: 'LOW',
      title: '📊 增强Compaction监控体系',
      description: '建立全面的Compaction监控和告警机制',

      monitoring_framework: {
        key_metrics: [
          'CS分布统计（按严重级别）',
          '任务执行成功率和平均时间',
          '线程利用率和系统负载',
          'FE配置参数跟踪',
        ],
        alert_thresholds: {
          cs_emergency: 'CS > 800',
          task_failure_rate: '成功率 < 85%',
          system_overload: '任务/线程比 > 0.8',
        },
        dashboard_components: [
          'CS趋势图',
          '任务执行状态',
          '资源利用率',
          '配置变更历史',
        ],
      },
    });

    // 容量规划建议
    recommendations.push({
      id: 'capacity_planning',
      category: 'capacity_planning',
      priority: 'LOW',
      title: '📈 Compaction容量规划',
      description: '基于当前数据制定长期容量规划策略',

      planning_framework: {
        growth_projection:
          this.calculateCompactionGrowthProjection(compactionData),
        scaling_triggers: [
          'CS分区数持续增长超过处理能力',
          '任务队列长度超过健康阈值',
          '平均任务执行时间持续上升',
        ],
        scaling_options: [
          '增加BE节点（水平扩展）',
          '调整线程配置（垂直优化）',
          '优化FE参数（系统级优化）',
        ],
      },
    });

    // 最佳实践建议
    recommendations.push({
      id: 'best_practices',
      category: 'best_practices',
      priority: 'LOW',
      title: '🎯 Compaction最佳实践',
      description: '基于专家经验的Compaction管理最佳实践',

      operational_guidelines: {
        daily_operations: [
          '每日检查CS分布情况',
          '监控任务执行状态',
          '验证系统资源使用',
        ],
        weekly_maintenance: [
          '分析CS增长趋势',
          '评估配置参数合理性',
          '审查任务执行效率',
        ],
        monthly_review: [
          '容量规划评估',
          '配置优化机会识别',
          '系统性能基准测试',
        ],
      },

      emergency_procedures: {
        high_cs_response: '发现CS > 500时的响应流程',
        system_overload: '系统过载时的负载减轻策略',
        task_failure_spike: '任务失败率突增时的处理方案',
      },
    });

    return recommendations;
  }

  /**
   * 生成可执行的操作计划
   */
  generateActionPlans(diagnosis, recommendations) {
    const actionPlans = [];

    // 为每个高优先级建议生成详细执行计划
    const highPriorityRecs = recommendations.filter((rec) =>
      ['IMMEDIATE', 'HIGH'].includes(rec.priority),
    );

    highPriorityRecs.forEach((rec) => {
      actionPlans.push({
        recommendation_id: rec.id,
        plan_name: rec.title,
        priority: rec.priority,
        estimated_duration: rec.estimated_duration || '30-60分钟',

        execution_steps: this.generateExecutionSteps(rec),
        prerequisites: this.identifyPrerequisites(rec),
        risk_mitigation: this.createRiskMitigation(rec),
        success_verification: this.defineSuccessVerification(rec),
      });
    });

    return actionPlans;
  }

  /**
   * 生成执行步骤
   */
  generateExecutionSteps(recommendation) {
    if (recommendation.action_plan) {
      // 已有详细计划的情况
      return recommendation.action_plan;
    }

    // 通用执行步骤模板
    return {
      preparation: ['备份当前配置', '确认系统状态稳定', '通知相关团队'],
      execution: ['按计划执行配置变更', '实时监控系统指标', '记录变更过程'],
      verification: ['验证配置生效', '检查目标指标改善', '确认无副作用'],
      cleanup: ['清理临时文件', '更新文档记录', '总结经验教训'],
    };
  }

  /**
   * 识别前置条件
   */
  identifyPrerequisites(recommendation) {
    const commonPrerequisites = [
      '具有ADMIN权限',
      '系统处于稳定状态',
      '已通知相关业务方',
    ];

    switch (recommendation.category) {
      case 'critical_performance':
        return [...commonPrerequisites, '确认磁盘空间充足', '验证网络连接正常'];
      case 'critical_configuration':
        return [...commonPrerequisites, '备份当前FE配置', '准备回滚方案'];
      case 'performance_tuning':
        return [
          ...commonPrerequisites,
          '确认BE节点状态正常',
          '监控系统基准指标',
        ];
      default:
        return commonPrerequisites;
    }
  }

  /**
   * 创建风险缓解措施
   */
  createRiskMitigation(recommendation) {
    return {
      risk_level: recommendation.risk_level || 'MEDIUM',
      potential_risks: [
        '配置变更可能暂时影响性能',
        'Compaction任务可能短暂增加系统负载',
        '操作过程中可能出现意外错误',
      ],
      mitigation_measures: [
        '在低峰期执行变更',
        '分阶段逐步调整',
        '准备快速回滚方案',
        '全程监控关键指标',
      ],
      rollback_plan: {
        trigger_conditions: [
          '系统性能严重下降',
          '错误率显著上升',
          '业务投诉增加',
        ],
        rollback_steps: [
          '停止当前操作',
          '恢复原配置',
          '验证系统恢复',
          '分析失败原因',
        ],
      },
    };
  }

  /**
   * 定义成功验证标准
   */
  defineSuccessVerification(recommendation) {
    const baseVerification = {
      immediate_checks: [
        '配置已正确应用',
        '系统服务正常运行',
        '无错误日志产生',
      ],
      short_term_validation: {
        timeframe: '1-2小时',
        metrics: ['目标指标改善', '系统稳定运行', '无性能回退'],
      },
      long_term_monitoring: {
        timeframe: '24-48小时',
        success_criteria: ['持续改善趋势', '无副作用出现', '业务影响为正向'],
      },
    };

    // 根据建议类型添加特定验证项
    switch (recommendation.category) {
      case 'critical_performance':
        baseVerification.specific_metrics = [
          'CS显著下降',
          'Compaction任务正常执行',
        ];
        break;
      case 'performance_tuning':
        baseVerification.specific_metrics = [
          '任务处理速度提升',
          'CPU使用率合理',
        ];
        break;
    }

    return baseVerification;
  }

  // ============= 辅助方法 =============

  /**
   * 分类CS分数严重程度
   */
  categorizeCSScore(cs) {
    if (cs >= this.rules.compaction_score.emergency) return 'EMERGENCY';
    if (cs >= this.rules.compaction_score.critical) return 'CRITICAL';
    if (cs >= this.rules.compaction_score.warning) return 'WARNING';
    if (cs >= this.rules.compaction_score.normal) return 'NORMAL';
    return 'EXCELLENT';
  }

  /**
   * 分析CS分布
   */
  analyzeCSDistribution(partitions) {
    const distribution = {
      total_partitions: partitions.length,
      excellent_partitions: 0,
      normal_partitions: 0,
      warning_partitions: 0,
      critical_partitions: 0,
      emergency_partitions: 0,
    };

    partitions.forEach((partition) => {
      const cs = partition.max_cs || partition.MAX_CS || 0;
      const category = this.categorizeCSScore(cs);

      switch (category) {
        case 'EXCELLENT':
          distribution.excellent_partitions++;
          break;
        case 'NORMAL':
          distribution.normal_partitions++;
          break;
        case 'WARNING':
          distribution.warning_partitions++;
          break;
        case 'CRITICAL':
          distribution.critical_partitions++;
          break;
        case 'EMERGENCY':
          distribution.emergency_partitions++;
          break;
      }
    });

    // 计算统计指标
    distribution.problematic_ratio =
      distribution.total_partitions > 0
        ? (
            ((distribution.critical_partitions +
              distribution.emergency_partitions) /
              distribution.total_partitions) *
            100
          ).toFixed(1)
        : 0;

    return distribution;
  }

  /**
   * 计算线程统计信息
   */
  calculateThreadStatistics(threadConfig) {
    if (threadConfig.length === 0) return this.getEmptyThreadStatistics();

    const totalThreads = threadConfig.reduce(
      (sum, config) => sum + config.current_threads,
      0,
    );
    const avgThreads = totalThreads / threadConfig.length;

    return {
      total_nodes: threadConfig.length,
      total_threads: totalThreads,
      avg_threads_per_node: Math.round(avgThreads * 10) / 10,
      min_threads: Math.min(...threadConfig.map((c) => c.current_threads)),
      max_threads: Math.max(...threadConfig.map((c) => c.current_threads)),
      thread_variance: this.calculateVariance(
        threadConfig.map((c) => c.current_threads),
      ),
    };
  }

  /**
   * 按BE分组任务
   */
  groupTasksByBE(runningTasks) {
    const tasksByBE = {};

    runningTasks.forEach((task) => {
      if (!tasksByBE[task.be_id]) {
        tasksByBE[task.be_id] = [];
      }
      tasksByBE[task.be_id].push(task);
    });

    return tasksByBE;
  }

  /**
   * 计算任务执行统计
   */
  calculateTaskExecutionStats(runningTasks, tasksByBE) {
    const nodeTaskCounts = Object.values(tasksByBE).map(
      (tasks) => tasks.length,
    );

    return {
      total_running_tasks: runningTasks.length,
      nodes_with_tasks: Object.keys(tasksByBE).length,
      avg_tasks_per_node:
        nodeTaskCounts.length > 0
          ? Math.round(
              (nodeTaskCounts.reduce((sum, count) => sum + count, 0) /
                nodeTaskCounts.length) *
                10,
            ) / 10
          : 0,
      max_tasks_per_node:
        nodeTaskCounts.length > 0 ? Math.max(...nodeTaskCounts) : 0,
      slow_tasks_count: runningTasks.filter((task) => task.is_slow).length,
      stalled_tasks_count: runningTasks.filter((task) => task.is_stalled)
        .length,
    };
  }

  /**
   * 计算历史性能
   */
  calculateHistoricalPerformance(completedTasks) {
    if (completedTasks.length === 0)
      return this.getEmptyHistoricalPerformance();

    const successfulTasks = completedTasks.filter((task) => task.is_successful);
    const durations = completedTasks
      .filter((task) => task.duration_hours > 0)
      .map((task) => task.duration_hours);

    return {
      total_tasks: completedTasks.length,
      successful_tasks: successfulTasks.length,
      success_rate: (
        (successfulTasks.length / completedTasks.length) *
        100
      ).toFixed(1),
      avg_duration_hours:
        durations.length > 0
          ? (
              durations.reduce((sum, d) => sum + d, 0) / durations.length
            ).toFixed(2)
          : 0,
    };
  }

  /**
   * 计算Compaction健康分数
   */
  calculateCompactionHealth(diagnosis, compactionData) {
    let score = 100;

    // 基于问题严重程度扣分
    score -= diagnosis.criticals.length * 25;
    score -= diagnosis.warnings.length * 10;
    score -= diagnosis.issues.length * 5;

    // 基于CS分布扣分
    const csStats = compactionData.cs_statistics || {};
    score -= (csStats.emergency_partitions || 0) * 3;
    score -= (csStats.critical_partitions || 0) * 1;

    // 基于任务执行效率扣分
    const taskStats = compactionData.task_execution_stats || {};
    if (taskStats.stalled_tasks_count > 0)
      score -= taskStats.stalled_tasks_count * 5;

    score = Math.max(0, score);

    let level = 'EXCELLENT';
    if (score < 40) level = 'POOR';
    else if (score < 60) level = 'FAIR';
    else if (score < 80) level = 'GOOD';

    return {
      score: Math.round(score),
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
   * 生成诊断摘要
   */
  generateDiagnosisSummary(diagnosis) {
    const criticals = diagnosis.criticals.length;
    const warnings = diagnosis.warnings.length;
    const issues = diagnosis.issues.length;

    if (criticals > 0) {
      const emergencyIssues = diagnosis.criticals.filter(
        (c) => c.priority === 'IMMEDIATE',
      ).length;
      if (emergencyIssues > 0) {
        return `Compaction系统存在 ${emergencyIssues} 个紧急问题，需立即处理`;
      }
      return `Compaction系统发现 ${criticals} 个严重问题，需要尽快处理`;
    } else if (warnings > 0) {
      return `Compaction系统发现 ${warnings} 个警告问题，建议近期优化`;
    } else if (issues > 0) {
      return `Compaction系统发现 ${issues} 个一般问题，可安排时间处理`;
    } else {
      return 'Compaction系统运行状态良好，压缩效率正常';
    }
  }

  // ============= 空数据结构 =============

  getEmptyCSStatistics() {
    return {
      total_partitions: 0,
      excellent_partitions: 0,
      normal_partitions: 0,
      warning_partitions: 0,
      critical_partitions: 0,
      emergency_partitions: 0,
      problematic_ratio: 0,
    };
  }

  getEmptyThreadStatistics() {
    return {
      total_nodes: 0,
      total_threads: 0,
      avg_threads_per_node: 0,
      min_threads: 0,
      max_threads: 0,
      thread_variance: 0,
    };
  }

  getEmptyTaskStats() {
    return {
      total_running_tasks: 0,
      nodes_with_tasks: 0,
      avg_tasks_per_node: 0,
      max_tasks_per_node: 0,
      slow_tasks_count: 0,
      stalled_tasks_count: 0,
    };
  }

  getEmptyHistoricalPerformance() {
    return {
      total_tasks: 0,
      successful_tasks: 0,
      success_rate: 0,
      avg_duration_hours: 0,
    };
  }

  getEmptyClusterStats() {
    return {
      total_nodes: 0,
      alive_nodes: 0,
      total_cpu_cores: 0,
      avg_cpu_cores: 0,
    };
  }

  getDefaultFEConfig() {
    return {
      lake_compaction_max_tasks: null,
      mode: 'UNKNOWN',
      is_adaptive: false,
      is_disabled: false,
      error: 'Unable to retrieve configuration',
    };
  }

  // ============= 辅助计算方法 =============

  calculateVariance(numbers) {
    if (numbers.length <= 1) return 0;
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const variance =
      numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) /
      numbers.length;
    return Math.round(variance * 100) / 100;
  }

  calculateClusterLoadLevel(runningTasks, aliveNodes, csStats) {
    const tasksPerNode = aliveNodes > 0 ? runningTasks / aliveNodes : 0;
    const highCSPartitions =
      (csStats.critical_partitions || 0) + (csStats.emergency_partitions || 0);

    if (tasksPerNode > 8 || highCSPartitions > 50) return 'HIGH';
    if (tasksPerNode > 5 || highCSPartitions > 20) return 'MEDIUM';
    return 'LOW';
  }

  calculateThreadUtilization(data) {
    // 计算线程使用率
    const runningTasks = data.running_tasks?.tasks?.length || 0;
    const threadStats = data.thread_config?.cluster_stats || {};
    const totalThreads = threadStats.total_threads || 1;

    // 基于正在运行的任务数估算线程使用率
    const utilization = Math.min((runningTasks / totalThreads) * 100, 100);

    return {
      current_utilization_percent: Math.round(utilization * 100) / 100,
      running_tasks: runningTasks,
      total_available_threads: totalThreads,
      efficiency_rating:
        utilization > 80 ? 'HIGH' : utilization > 50 ? 'MEDIUM' : 'LOW',
    };
  }

  assessThreadOptimizationPotential(threadStats, clusterStats) {
    // 评估线程优化潜力
    const avgThreadsPerCore = threadStats.avg_threads_per_core || 0;
    const totalNodes = clusterStats?.total_nodes || 1;
    const avgCoresPerNode = clusterStats?.avg_cores_per_node || 4;

    let optimizationLevel = 'LOW';
    let recommendations = [];

    // 评估当前配置效率
    if (avgThreadsPerCore < 0.25) {
      optimizationLevel = 'HIGH';
      recommendations.push('考虑增加线程数以充分利用CPU资源');
    } else if (avgThreadsPerCore > 0.75) {
      optimizationLevel = 'MEDIUM';
      recommendations.push('线程数可能过高，可考虑适当降低');
    } else {
      optimizationLevel = 'LOW';
      recommendations.push('当前线程配置相对合理');
    }

    return {
      optimization_level: optimizationLevel,
      current_threads_per_core: avgThreadsPerCore,
      recommended_threads_per_core: '0.25-0.5',
      estimated_improvement:
        optimizationLevel === 'HIGH'
          ? '20-40%'
          : optimizationLevel === 'MEDIUM'
            ? '10-20%'
            : '0-5%',
      specific_recommendations: recommendations,
    };
  }

  assessAdaptiveModeEffectiveness(adaptiveMaxTasks, highCSPartitions) {
    // 评估自适应模式的有效性
    const taskToPartitionRatio =
      highCSPartitions > 0 ? adaptiveMaxTasks / highCSPartitions : 1;

    let effectiveness = 'MEDIUM';
    let reasons = [];

    if (taskToPartitionRatio >= 0.5) {
      effectiveness = 'HIGH';
      reasons.push('自适应配置能有效处理当前高CS分区数量');
    } else if (taskToPartitionRatio >= 0.3) {
      effectiveness = 'MEDIUM';
      reasons.push('自适应配置基本满足处理需求');
    } else {
      effectiveness = 'LOW';
      reasons.push('自适应配置可能无法及时处理所有高CS分区');
    }

    return {
      effectiveness_level: effectiveness,
      task_to_partition_ratio: Math.round(taskToPartitionRatio * 100) / 100,
      assessment_reasons: reasons,
      recommended_action:
        effectiveness === 'LOW'
          ? '考虑增加集群节点或调整Compaction策略'
          : '当前配置合适',
    };
  }

  calculateClusterTaskUtilization(data) {
    // 计算集群任务利用率
    const runningTasks = data.running_tasks?.task_count || 0;
    const clusterStats = data.cluster_stats || {};
    const aliveNodes = clusterStats.alive_nodes || 1;
    const threadStats = data.thread_config?.cluster_stats || {};
    const totalThreads = threadStats.total_threads || 1;

    const tasksPerNode = aliveNodes > 0 ? runningTasks / aliveNodes : 0;
    const utilizationPercent = Math.min(
      (runningTasks / totalThreads) * 100,
      100,
    );

    return {
      utilization_percent: Math.round(utilizationPercent * 100) / 100,
      running_tasks: runningTasks,
      total_threads: totalThreads,
      tasks_per_node: Math.round(tasksPerNode * 100) / 100,
      capacity_status:
        utilizationPercent > 80
          ? 'HIGH'
          : utilizationPercent > 50
            ? 'MEDIUM'
            : 'LOW',
    };
  }

  calculateTaskEfficiencyRating(historicalPerf) {
    // 基于历史性能数据计算任务执行效率评级
    const successRate = historicalPerf.success_rate || 0;
    const avgDuration = historicalPerf.avg_duration_hours || 0;

    let rating = 'POOR';
    let score = 0;

    // 成功率权重：60%
    if (successRate >= 95) score += 60;
    else if (successRate >= 90) score += 50;
    else if (successRate >= 80) score += 40;
    else if (successRate >= 70) score += 30;
    else score += 20;

    // 执行时长权重：40%
    if (avgDuration <= 0.5)
      score += 40; // 30分钟以内
    else if (avgDuration <= 1)
      score += 35; // 1小时以内
    else if (avgDuration <= 2)
      score += 30; // 2小时以内
    else if (avgDuration <= 4)
      score += 20; // 4小时以内
    else score += 10;

    // 评级判定
    if (score >= 90) rating = 'EXCELLENT';
    else if (score >= 75) rating = 'GOOD';
    else if (score >= 60) rating = 'FAIR';
    else if (score >= 40) rating = 'POOR';
    else rating = 'CRITICAL';

    return {
      rating: rating,
      score: score,
      success_rate: successRate,
      avg_duration_hours: avgDuration,
    };
  }

  generateTaskOptimizationSuggestions(taskStats, historicalPerf) {
    // 生成任务优化建议
    const suggestions = [];
    const successRate = historicalPerf.success_rate || 0;
    const avgDuration = historicalPerf.avg_duration_hours || 0;
    const avgTasksPerNode = taskStats.avg_tasks_per_node || 0;

    // 成功率相关建议
    if (successRate < 90) {
      suggestions.push({
        type: 'success_rate_improvement',
        priority: 'HIGH',
        suggestion: `任务成功率 ${successRate.toFixed(1)}% 偏低，建议检查失败原因并优化`,
        expected_improvement: '提升10-20%成功率',
      });
    }

    // 执行时长相关建议
    if (avgDuration > 2) {
      suggestions.push({
        type: 'duration_optimization',
        priority: 'MEDIUM',
        suggestion: `平均任务时长 ${avgDuration.toFixed(2)} 小时较长，建议优化Compaction策略或增加线程`,
        expected_improvement: '缩短30-50%执行时间',
      });
    }

    // 负载均衡相关建议
    if (taskStats.max_tasks_per_node > avgTasksPerNode * 2) {
      suggestions.push({
        type: 'load_balancing',
        priority: 'MEDIUM',
        suggestion: '节点间任务分布不均，建议检查tablet分布或调整副本策略',
        expected_improvement: '提升20-30%整体吞吐量',
      });
    }

    // 如果表现良好，提供保持建议
    if (successRate >= 95 && avgDuration <= 1 && suggestions.length === 0) {
      suggestions.push({
        type: 'maintain_status',
        priority: 'LOW',
        suggestion: '当前任务执行效率良好，建议保持现有配置并持续监控',
        expected_improvement: '维持当前性能水平',
      });
    }

    return suggestions;
  }

  calculateCompactionGrowthProjection(compactionData) {
    // 基于当前数据预测增长趋势（简化版本）
    const csStats = compactionData.cs_statistics || {};
    const totalHighCS =
      (csStats.warning_partitions || 0) +
      (csStats.critical_partitions || 0) +
      (csStats.emergency_partitions || 0);

    return {
      current_high_cs_partitions: totalHighCS,
      projected_monthly_growth: Math.ceil(totalHighCS * 0.1), // 假设月增长10%
      capacity_needed: Math.ceil(totalHighCS * 1.5), // 需要1.5倍处理能力
      scaling_timeline: totalHighCS > 100 ? '1-2个月内' : '3-6个月内',
    };
  }

  identifyCompactionBottlenecks(compactionData) {
    // 识别Compaction瓶颈
    const bottlenecks = [];
    const csStats = compactionData.cs_statistics || {};
    const threadConfig = compactionData.thread_config || {};
    const runningTasks = compactionData.running_tasks || {};

    // 检查CS瓶颈
    if ((csStats.critical_partitions || 0) > 10) {
      bottlenecks.push({
        type: 'high_cs_accumulation',
        severity: 'HIGH',
        description: '高CS分区过多，可能存在Compaction效率问题',
        impact: '严重影响查询性能，可能导致查询超时',
      });
    }

    // 检查线程瓶颈
    if ((threadConfig.cluster_stats?.avg_threads_per_core || 0) < 0.25) {
      bottlenecks.push({
        type: 'thread_under_utilization',
        severity: 'MEDIUM',
        description: 'Compaction线程配置过低，无法充分利用CPU资源',
        impact: 'Compaction处理速度慢，可能导致CS积累',
      });
    }

    // 检查任务执行瓶颈
    const runningTaskCount = runningTasks.tasks?.length || 0;
    const totalThreads = threadConfig.cluster_stats?.total_threads || 1;
    if (runningTaskCount === 0 && (csStats.warning_partitions || 0) > 5) {
      bottlenecks.push({
        type: 'task_scheduling_issue',
        severity: 'HIGH',
        description: '存在高CS分区但没有运行中的Compaction任务',
        impact: 'Compaction任务可能未正常调度或执行',
      });
    }

    return {
      total_bottlenecks: bottlenecks.length,
      bottlenecks: bottlenecks,
      overall_assessment:
        bottlenecks.length === 0
          ? 'NO_MAJOR_BOTTLENECKS'
          : bottlenecks.some((b) => b.severity === 'HIGH')
            ? 'CRITICAL_BOTTLENECKS'
            : 'MINOR_BOTTLENECKS',
    };
  }

  performAdvancedDiagnosis(compactionData, analysisScope) {
    // 执行高级诊断分析
    return {
      bottleneck_analysis: this.identifyCompactionBottlenecks(compactionData),
      cs_distribution: this.analyzeCSDistribution(
        compactionData.cs_statistics || {},
      ),
      thread_utilization: this.calculateThreadUtilization(compactionData),
      cluster_utilization: {
        load_level: this.calculateClusterLoadLevel(
          compactionData.running_tasks?.tasks?.length || 0,
          compactionData.cluster_stats?.total_nodes || 1,
          compactionData.cs_statistics || {},
        ),
      },
      growth_projection:
        this.calculateCompactionGrowthProjection(compactionData),
      optimization_opportunities:
        this.identifyOptimizationOpportunities(compactionData),
    };
  }

  identifyOptimizationOpportunities(compactionData) {
    // 识别优化机会
    const opportunities = [];
    const csStats = compactionData.cs_statistics || {};
    const threadConfig = compactionData.thread_config || {};

    // CS优化机会
    if ((csStats.warning_partitions || 0) > 5) {
      opportunities.push({
        type: 'cs_optimization',
        priority: 'HIGH',
        description: '优化高CS分区处理策略',
        potential_impact: '显著改善查询性能',
      });
    }

    // 线程配置优化机会
    const avgThreadsPerCore =
      threadConfig.cluster_stats?.avg_threads_per_core || 0;
    if (avgThreadsPerCore < 0.25 || avgThreadsPerCore > 0.75) {
      opportunities.push({
        type: 'thread_optimization',
        priority: 'MEDIUM',
        description: '调整Compaction线程配置以匹配硬件资源',
        potential_impact: '提高Compaction效率',
      });
    }

    return {
      total_opportunities: opportunities.length,
      opportunities: opportunities,
      optimization_priority: opportunities.some((o) => o.priority === 'HIGH')
        ? 'HIGH'
        : 'MEDIUM',
    };
  }

  generateScalingRecommendation(compactionData) {
    // 生成扩展建议
    const csStats = compactionData.cs_statistics || {};
    const clusterStats = compactionData.cluster_stats || {};
    const totalHighCS =
      (csStats.warning_partitions || 0) +
      (csStats.critical_partitions || 0) +
      (csStats.emergency_partitions || 0);

    if (totalHighCS > 100) {
      return {
        scaling_needed: true,
        urgency: 'HIGH',
        recommended_action: '建议增加集群节点或优化Compaction配置',
        timeline: '1-2周内',
        expected_benefit: '显著降低CS积累速度',
      };
    } else if (totalHighCS > 50) {
      return {
        scaling_needed: true,
        urgency: 'MEDIUM',
        recommended_action: '考虑优化Compaction线程配置',
        timeline: '1个月内',
        expected_benefit: '改善CS处理效率',
      };
    }

    return {
      scaling_needed: false,
      recommendation: '当前规模合适，建议定期监控',
    };
  }

  /**
   * === 协调器兼容性适配器 ===
   * 提供与其他专家一致的接口
   */

  /**
   * 适配器方法：为协调器提供统一的 diagnose 接口
   */
  async diagnose(connection, includeDetails = false) {
    // 调用完整分析方法，并转换为协调器期望的格式
    const comprehensiveResult = await this.performComprehensiveAnalysis(
      connection,
      {
        includeDetailedData: includeDetails,
        analysisScope: 'full',
      },
    );

    // 安全访问 diagnosis_results，提供默认值
    const diagnosisResults = comprehensiveResult.diagnosis_results || {
      total_issues: 0,
      criticals: [],
      warnings: [],
      issues: [],
      summary: '无诊断结果',
    };

    // 转换为协调器期望的结果格式
    return {
      expert_type: 'compaction',
      expert_version: this.version,
      analysis_timestamp: comprehensiveResult.analysis_timestamp,
      analysis_duration_ms: comprehensiveResult.analysis_duration_ms,

      // 健康评估
      compaction_health: {
        score: comprehensiveResult.compaction_health?.score || 100,
        level: comprehensiveResult.compaction_health?.level || 'EXCELLENT',
        status: comprehensiveResult.compaction_health?.status || 'HEALTHY',
      },

      // 诊断结果
      diagnosis_results: {
        total_issues: diagnosisResults.total_issues || 0,
        criticals: (diagnosisResults.criticals || []).map((c) => ({
          type: c.type,
          message: c.message,
          urgency: c.urgency,
          impact: c.impact,
        })),
        warnings: (diagnosisResults.warnings || []).map((w) => ({
          type: w.type,
          message: w.message,
        })),
        summary: diagnosisResults.summary || '诊断完成',
      },

      // 专业建议
      professional_recommendations:
        comprehensiveResult.comprehensive_recommendations || [],

      // 原始数据（如果请求详细信息）
      raw_data: includeDetails ? comprehensiveResult.collected_data : null,
    };
  }

  /**
   * analyze() 方法 - 兼容协调器调用
   * 这是 diagnose() 的别名，用于统一专家接口
   */
  async analyze(connection, options = {}) {
    const includeDetails = options.includeDetails || false;
    return await this.diagnose(connection, includeDetails);
  }

  /**
   * 获取专家描述信息（用于协调器）
   */
  get description() {
    return 'StarRocks Compaction 系统专家 - 集成所有压缩相关功能：CS管理、线程配置、任务监控、根因分析';
  }

  get version() {
    return '2.0.0';
  }

  /**
   * === 多维度诊断支持方法 ===
   */

  /**
   * 收集系统资源数据
   */
  async collectSystemResources(connection, data) {
    console.error('💻 收集系统资源数据...');

    try {
      // 获取BE节点系统资源信息
      const [beResources] = await connection.query(`
        SHOW BACKENDS;
      `);

      data.system_resources = {
        be_nodes: beResources.map((node) => ({
          backend_id: node.BackendId,
          host: node.Host,
          alive: node.Alive === 'true',
          cpu_cores: parseInt(node.CpuCores) || 8,
          mem_used_pct: parseFloat(node.MemUsedPct) || 0,
          cpu_usage_pct: parseFloat(node.CpuUsage) || 0,
          disk_used_pct: parseFloat(node.MaxDiskUsedPct) || 0,
          net_in_rate: parseFloat(node.NetInRate) || 0,
          net_out_rate: parseFloat(node.NetOutRate) || 0,
        })),
        collection_time: new Date().toISOString(),
      };

      // 计算集群级别资源统计
      const aliveNodes = data.system_resources.be_nodes.filter((n) => n.alive);
      data.system_resources.cluster_stats = {
        total_nodes: beResources.length,
        alive_nodes: aliveNodes.length,
        total_cpu_cores: aliveNodes.reduce((sum, n) => sum + n.cpu_cores, 0),
        avg_cpu_usage:
          aliveNodes.reduce((sum, n) => sum + n.cpu_usage_pct, 0) /
          aliveNodes.length,
        max_disk_usage: Math.max(...aliveNodes.map((n) => n.disk_used_pct)),
        avg_disk_usage:
          aliveNodes.reduce((sum, n) => sum + n.disk_used_pct, 0) /
          aliveNodes.length,
        avg_memory_usage:
          aliveNodes.reduce((sum, n) => sum + n.mem_used_pct, 0) /
          aliveNodes.length,
      };
    } catch (error) {
      console.warn('获取系统资源信息失败:', error.message);
      data.system_resources = this.getEmptySystemResources();
    }
  }

  /**
   * 收集参数配置数据
   */
  async collectParameterConfiguration(connection, data) {
    console.error('⚙️ 收集参数配置数据...');

    try {
      // 获取FE配置参数
      const [feConfigs] = await connection.query(`
        SHOW VARIABLES LIKE '%compact%';
      `);

      const beConfigMap = {};
      feConfigs.forEach((config) => {
        beConfigMap[config.Variable_name] = config.Value;
      });

      data.parameter_config = {
        fe_configs: beConfigMap,
        collection_time: new Date().toISOString(),
        critical_params: {
          max_compaction_tasks:
            parseInt(beConfigMap.max_compaction_tasks) || 10,
          compact_threads: parseInt(beConfigMap.compact_threads) || 2,
          compaction_lower_size_mbytes:
            parseInt(beConfigMap.compaction_lower_size_mbytes) || 256,
          compaction_upper_size_mbytes:
            parseInt(beConfigMap.compaction_upper_size_mbytes) || 1024,
        },
      };
    } catch (error) {
      console.warn('获取参数配置失败:', error.message);
      data.parameter_config = this.getEmptyParameterConfig();
    }
  }

  /**
   * 收集数据导入模式数据
   */
  async collectDataIngestionPatterns(connection, data) {
    console.error('📥 收集数据导入模式数据...');

    try {
      // 分析表统计信息推断导入模式
      const [tableStats] = await connection.query(`
        SELECT
          table_schema as database_name,
          table_name,
          table_rows,
          data_length,
          index_length,
          create_time,
          update_time
        FROM information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        AND table_rows > 0
        ORDER BY table_rows DESC
        LIMIT 20
      `);

      // 基于表统计信息推断导入模式
      data.ingestion_patterns = {
        active_tables: tableStats.map((table) => ({
          database_name: table.database_name,
          table_name: table.table_name,
          estimated_size_mb: Math.round(
            (table.data_length + table.index_length) / 1024 / 1024,
          ),
          row_count: table.table_rows,
          last_update: table.update_time,
          estimated_ingestion_pattern: this.inferIngestionPattern(
            table.table_rows,
            table.data_length,
          ),
        })),
        analysis_summary: {
          total_analyzed_tables: tableStats.length,
          total_estimated_data_gb: Math.round(
            tableStats.reduce(
              (sum, t) => sum + (t.data_length + t.index_length),
              0,
            ) /
              1024 /
              1024 /
              1024,
          ),
          large_tables: tableStats.filter(
            (t) => t.data_length + t.index_length > 1024 * 1024 * 1024,
          ).length,
          high_row_count_tables: tableStats.filter(
            (t) => t.table_rows > 1000000,
          ).length,
        },
      };
    } catch (error) {
      console.warn('获取导入模式数据失败:', error.message);
      data.ingestion_patterns = this.getEmptyIngestionPatterns();
    }
  }

  /**
   * 辅助方法：推断导入模式
   */
  inferIngestionPattern(rowCount, dataLength) {
    const avgRowSize = rowCount > 0 ? dataLength / rowCount : 0;

    if (rowCount > 10000000 && avgRowSize > 1000) {
      return { pattern: 'LARGE_BATCH', frequency: 'LOW', concern_level: 'LOW' };
    } else if (rowCount > 1000000 && avgRowSize < 100) {
      return {
        pattern: 'HIGH_FREQUENCY_SMALL',
        frequency: 'HIGH',
        concern_level: 'HIGH',
      };
    } else if (rowCount > 100000) {
      return {
        pattern: 'MODERATE_BATCH',
        frequency: 'MEDIUM',
        concern_level: 'MEDIUM',
      };
    } else {
      return {
        pattern: 'SMALL_TABLE',
        frequency: 'UNKNOWN',
        concern_level: 'LOW',
      };
    }
  }

  /**
   * 获取空的系统资源数据
   */
  getEmptySystemResources() {
    return {
      be_nodes: [],
      cluster_stats: {
        total_nodes: 0,
        alive_nodes: 0,
        total_cpu_cores: 0,
        avg_cpu_usage: 0,
        max_disk_usage: 0,
        avg_disk_usage: 0,
        avg_memory_usage: 0,
      },
      collection_time: new Date().toISOString(),
    };
  }

  /**
   * 获取空的参数配置数据
   */
  getEmptyParameterConfig() {
    return {
      fe_configs: {},
      critical_params: {
        max_compaction_tasks: 10,
        compact_threads: 2,
        compaction_lower_size_mbytes: 256,
        compaction_upper_size_mbytes: 1024,
      },
      collection_time: new Date().toISOString(),
    };
  }

  /**
   * 获取空的导入模式数据
   */
  getEmptyIngestionPatterns() {
    return {
      active_tables: [],
      analysis_summary: {
        total_analyzed_tables: 0,
        total_estimated_data_gb: 0,
        large_tables: 0,
        high_row_count_tables: 0,
      },
    };
  }

  /**
   * === 多维度诊断方法 ===
   */

  /**
   * 系统资源诊断
   */
  diagnoseSystemResources(compactionData, diagnosis) {
    console.error('💻 执行系统资源诊断...');

    const resources = compactionData.system_resources;
    if (!resources || !resources.cluster_stats) {
      return;
    }

    const stats = resources.cluster_stats;

    // 磁盘使用率诊断
    if (stats.max_disk_usage > 95) {
      diagnosis.criticals.push({
        type: 'critical_disk_usage',
        severity: 'CRITICAL',
        urgency: 'IMMEDIATE',
        message: `磁盘使用率达到${stats.max_disk_usage.toFixed(1)}%，严重影响Compaction执行`,
        impact: {
          compaction: 'Compaction任务可能因磁盘空间不足而失败或延迟',
          performance: '查询性能严重下降，可能出现服务不可用',
          business: '业务连续性面临威胁',
        },
        recommended_actions: [
          '立即清理临时文件和日志',
          '删除不必要的数据或归档历史数据',
          '紧急扩容磁盘空间',
          '暂停非关键数据导入',
        ],
        estimated_resolution_time: '30分钟-2小时',
        monitoring_commands: [
          'df -h  # 检查磁盘使用情况',
          'du -sh /path/to/starrocks/storage/*  # 检查数据目录大小',
        ],
      });
    } else if (stats.max_disk_usage > 85) {
      diagnosis.warnings.push({
        type: 'high_disk_usage',
        severity: 'WARNING',
        message: `磁盘使用率达到${stats.max_disk_usage.toFixed(1)}%，可能影响Compaction效率`,
        impact: 'Compaction执行速度变慢，CS积累可能加速',
        recommended_actions: [
          '计划在24小时内清理磁盘空间',
          '制定数据清理和归档策略',
          '考虑磁盘扩容计划',
        ],
      });
    }

    // CPU使用率诊断
    if (stats.avg_cpu_usage > 90) {
      diagnosis.warnings.push({
        type: 'high_cpu_usage',
        severity: 'WARNING',
        message: `集群平均CPU使用率${stats.avg_cpu_usage.toFixed(1)}%，资源紧张`,
        impact: 'Compaction任务与其他任务争用CPU资源，可能影响执行效率',
        recommended_actions: [
          '检查是否有异常的高CPU查询',
          '考虑在低峰期执行Compaction',
          '优化查询负载分布',
        ],
      });
    }

    // 内存使用率诊断
    if (stats.avg_memory_usage > 85) {
      diagnosis.warnings.push({
        type: 'high_memory_usage',
        severity: 'WARNING',
        message: `集群平均内存使用率${stats.avg_memory_usage.toFixed(1)}%`,
        impact: '内存紧张可能导致Compaction任务OOM或性能下降',
        recommended_actions: [
          '检查内存消耗异常的查询',
          '调整查询并发度',
          '考虑内存扩容',
        ],
      });
    }

    // 节点存活性检查
    if (stats.alive_nodes < stats.total_nodes) {
      const deadNodes = stats.total_nodes - stats.alive_nodes;
      diagnosis.criticals.push({
        type: 'node_unavailability',
        severity: 'CRITICAL',
        message: `发现${deadNodes}个BE节点不可用`,
        impact: '集群容量降低，Compaction负载集中在少数节点上',
        recommended_actions: [
          '立即检查不可用节点状态',
          '重启故障节点或替换硬件',
          '评估是否需要临时调整副本数',
        ],
      });
    }
  }

  /**
   * 参数配置诊断
   */
  diagnoseParameterConfiguration(compactionData, diagnosis) {
    console.error('⚙️ 执行参数配置诊断...');

    const config = compactionData.parameter_config;
    if (!config || !config.critical_params) {
      return;
    }

    const params = config.critical_params;
    const resources = compactionData.system_resources?.cluster_stats;

    // 检查max_compaction_tasks
    if (params.max_compaction_tasks < 5) {
      diagnosis.criticals.push({
        type: 'max_compaction_tasks_too_low',
        severity: 'CRITICAL',
        message: `max_compaction_tasks设置过低(${params.max_compaction_tasks})`,
        current_value: params.max_compaction_tasks,
        recommended_value: '10-20',
        impact: 'Compaction并发度严重不足，无法及时处理高CS分区',
        fix_command: 'SET GLOBAL max_compaction_tasks = 15;',
        risk_assessment: 'LOW - 该参数调整风险很小',
      });
    } else if (params.max_compaction_tasks > 50) {
      diagnosis.warnings.push({
        type: 'max_compaction_tasks_too_high',
        severity: 'WARNING',
        message: `max_compaction_tasks设置过高(${params.max_compaction_tasks})`,
        impact: '可能导致资源争用，影响查询性能',
        fix_command: `SET GLOBAL max_compaction_tasks = ${Math.max(10, Math.floor((resources?.total_cpu_cores || 8) * 0.5))};`,
      });
    }

    // 检查compact_threads
    if (resources && resources.total_cpu_cores > 0) {
      const threadsPerCore = params.compact_threads / resources.total_cpu_cores;
      if (threadsPerCore < 0.2) {
        diagnosis.warnings.push({
          type: 'compact_threads_underutilized',
          severity: 'WARNING',
          message: `compact_threads配置保守，仅为CPU核心数的${(threadsPerCore * 100).toFixed(1)}%`,
          current_value: params.compact_threads,
          recommended_value: `${Math.floor(resources.total_cpu_cores * 0.4)}-${Math.floor(resources.total_cpu_cores * 0.6)}`,
          impact: 'CPU资源未充分利用，Compaction处理能力不足',
          fix_command: `SET GLOBAL compact_threads = ${Math.floor(resources.total_cpu_cores * 0.5)};`,
        });
      } else if (threadsPerCore > 1) {
        diagnosis.warnings.push({
          type: 'compact_threads_over_provisioned',
          severity: 'WARNING',
          message: `compact_threads配置过高，超过CPU核心数`,
          impact: '可能导致线程上下文切换开销，降低效率',
          fix_command: `SET GLOBAL compact_threads = ${Math.floor(resources.total_cpu_cores * 0.5)};`,
        });
      }
    }

    // 检查compaction_lower_size_mbytes
    if (params.compaction_lower_size_mbytes > 512) {
      diagnosis.warnings.push({
        type: 'compaction_lower_size_too_high',
        severity: 'WARNING',
        message: `compaction_lower_size_mbytes过高(${params.compaction_lower_size_mbytes}MB)`,
        impact: '小文件无法及时合并，增加查询文件数',
        recommended_value: '128-256MB',
        fix_command: 'SET GLOBAL compaction_lower_size_mbytes = 256;',
      });
    }
  }

  /**
   * 导入模式诊断
   */
  diagnoseIngestionPatterns(compactionData, diagnosis) {
    console.error('📥 执行导入模式诊断...');

    const patterns = compactionData.ingestion_patterns;
    if (!patterns || !patterns.active_tables) {
      return;
    }

    // 检查高关注度表的导入模式
    const highConcernTables = patterns.active_tables.filter(
      (table) => table.estimated_ingestion_pattern.concern_level === 'HIGH',
    );

    if (highConcernTables.length > 0) {
      diagnosis.warnings.push({
        type: 'problematic_ingestion_patterns',
        severity: 'WARNING',
        message: `发现${highConcernTables.length}个表采用可能导致高CS的导入模式`,
        affected_tables: highConcernTables.map(
          (t) => `${t.database_name}.${t.table_name}`,
        ),
        pattern_analysis: highConcernTables.map((table) => ({
          table: `${table.database_name}.${table.table_name}`,
          pattern: table.estimated_ingestion_pattern.pattern,
          concern:
            table.estimated_ingestion_pattern.pattern === 'HIGH_FREQUENCY_SMALL'
              ? '高频小批次导入，容易产生大量小文件'
              : '导入模式可能不利于Compaction效率',
        })),
        recommended_actions: [
          '调整导入策略：合并小批次为大批次',
          '使用Stream Load事务模式减少文件碎片',
          '设置合理的导入时间窗口',
          '考虑使用批量导入替代实时导入',
        ],
      });
    }

    // 检查数据总量
    if (patterns.analysis_summary.total_estimated_data_gb > 1000) {
      diagnosis.insights.push({
        type: 'large_data_volume_insight',
        message: `集群数据总量约${patterns.analysis_summary.total_estimated_data_gb}GB`,
        implication: '大数据量环境需要更积极的Compaction策略',
        recommendations: [
          '考虑增加Compaction线程数',
          '优化大表的分区策略',
          '制定数据生命周期管理策略',
        ],
      });
    }
  }

  /**
   * 计算Compaction效率分数
   */
  calculateCompactionEfficiencyScore(compactionData) {
    let score = 100;
    const threadConfig = compactionData.thread_config?.cluster_stats;
    const runningTasks = compactionData.running_tasks?.tasks;
    const csStats = compactionData.cs_statistics;

    // 基于线程利用率扣分
    if (threadConfig) {
      const threadsPerCore = threadConfig.avg_threads_per_core || 0;
      if (threadsPerCore < 0.25) score -= 20;
      else if (threadsPerCore > 0.75) score -= 10;
    }

    // 基于运行任务数扣分
    const taskCount = runningTasks?.length || 0;
    if (taskCount === 0 && (csStats?.warning_partitions || 0) > 5) {
      score -= 30; // 有高CS但没有运行任务
    }

    // 基于CS统计扣分
    if (csStats) {
      score -= (csStats.critical_partitions || 0) * 5;
      score -= (csStats.emergency_partitions || 0) * 10;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      level: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
    };
  }

  /**
   * 跨维度关联分析
   */
  performCrossDimensionalAnalysis(compactionData, diagnosis) {
    console.error('🔗 执行跨维度关联分析...');

    const resources = compactionData.system_resources?.cluster_stats;
    const config = compactionData.parameter_config?.critical_params;
    const patterns = compactionData.ingestion_patterns?.analysis_summary;
    const csStats = compactionData.cs_statistics;

    if (!resources || !config || !csStats) {
      return;
    }

    // 复合原因1: 磁盘空间不足 + 线程配置不当 + 高CS积累
    if (
      resources.max_disk_usage > 85 &&
      config.compact_threads < resources.total_cpu_cores * 0.3 &&
      csStats.critical_partitions + csStats.emergency_partitions > 5
    ) {
      diagnosis.insights.push({
        type: 'compound_cause_disk_thread_cs',
        severity: 'HIGH',
        message: '发现复合原因：磁盘空间紧张+线程配置不足+高CS积累',
        explanation:
          '磁盘空间不足限制Compaction执行，线程配置保守进一步降低处理能力，导致CS急剧积累',
        impact_multiplier: 2.5,
        integrated_solution: {
          priority_order: [
            '1. 立即清理磁盘空间至75%以下',
            '2. 调整compact_threads至推荐值',
            '3. 批量处理紧急CS分区',
            '4. 监控CS下降趋势',
          ],
          expected_resolution_time: '2-4小时',
          success_metrics: [
            '磁盘使用率 < 75%',
            'CS积累速度 < 50/小时',
            '线程利用率 > 60%',
          ],
        },
      });
    }

    // 复合原因2: 高频导入 + 参数配置不当
    if (
      patterns &&
      patterns.total_estimated_data_gb > 100 &&
      config.compaction_lower_size_mbytes > 256 &&
      config.max_compaction_tasks < 10
    ) {
      diagnosis.insights.push({
        type: 'compound_cause_ingestion_config',
        severity: 'MEDIUM',
        message: '发现复合原因：大数据量+参数配置不当',
        explanation:
          '大数据量环境配合不当的Compaction参数，导致小文件积累和处理能力不足',
        integrated_solution: {
          priority_order: [
            '1. 调整compaction_lower_size_mbytes至256MB',
            '2. 增加max_compaction_tasks至15',
            '3. 优化导入批次大小',
            '4. 制定定期Compaction维护计划',
          ],
        },
      });
    }
  }

  /**
   * 生成专家洞察
   */
  generateExpertInsights(compactionData, diagnosis) {
    const insights = [];
    const totalIssues = diagnosis.criticals.length + diagnosis.warnings.length;

    if (totalIssues === 0) {
      insights.push({
        type: 'healthy_system_insight',
        message: 'Compaction系统运行健康',
        recommendation: '继续保持当前配置，建议定期检查',
      });
    } else if (diagnosis.criticals.length > 0) {
      insights.push({
        type: 'critical_issues_insight',
        message: `发现${diagnosis.criticals.length}个严重问题需要立即处理`,
        priority: 'IMMEDIATE',
        recommendation: '建议按照专家建议的优先级顺序逐一解决问题',
      });
    }

    // 基于跨维度分析的洞察
    if (diagnosis.insights?.length > 0) {
      insights.push({
        type: 'cross_dimensional_insight',
        message: '发现跨维度复合问题，需要综合解决',
        complexity: 'HIGH',
        recommendation: '建议采用集成解决方案，同时优化多个维度',
      });
    }

    return insights;
  }

  /**
   * 获取高 Compaction Score 分区
   */
  async getHighCompactionPartitions(connection, limit = 10, minScore = 100) {
    try {
      // StarRocks 不支持在 LIMIT 中使用参数化查询，需要直接拼接
      const [partitions] = await connection.query(
        `
        SELECT
          DB_NAME as database_name,
          TABLE_NAME as table_name,
          PARTITION_NAME as partition_name,
          MAX_CS as max_compaction_score,
          AVG_CS as avg_compaction_score,
          P50_CS as p50_compaction_score,
          ROW_COUNT as row_count,
          DATA_SIZE as data_size
        FROM information_schema.partitions_meta
        WHERE MAX_CS >= ?
        ORDER BY MAX_CS DESC
        LIMIT ${parseInt(limit)}
      `,
        [minScore],
      );

      return {
        success: true,
        data: {
          partitions: partitions,
          total_count: partitions.length,
          filters: {
            min_score: minScore,
            limit: limit,
          },
          analysis: this.analyzeHighCompactionPartitions(partitions),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve high compaction partitions: ${error.message}`,
        data: {
          partitions: [],
          total_count: 0,
        },
      };
    }
  }

  /**
   * 分析高 Compaction Score 分区
   */
  analyzeHighCompactionPartitions(partitions) {
    if (!partitions || partitions.length === 0) {
      return {
        summary: 'No high compaction score partitions found',
        severity: 'NORMAL',
        recommendations: [],
      };
    }

    const maxScore = Math.max(...partitions.map((p) => p.max_compaction_score));
    const avgScore =
      partitions.reduce((sum, p) => sum + p.max_compaction_score, 0) /
      partitions.length;

    let severity = 'NORMAL';
    let recommendations = [];

    if (maxScore >= this.rules.compaction_score.emergency) {
      severity = 'EMERGENCY';
      recommendations.push('立即进行手动 compaction，避免严重影响查询性能');
    } else if (maxScore >= this.rules.compaction_score.critical) {
      severity = 'CRITICAL';
      recommendations.push('优先处理高分区的 compaction 任务');
    } else if (maxScore >= this.rules.compaction_score.warning) {
      severity = 'WARNING';
      recommendations.push('监控分区状态，考虑在维护窗口进行 compaction');
    }

    if (partitions.length >= 10) {
      recommendations.push('检查 compaction 线程配置，可能需要增加并行度');
    }

    return {
      summary: `Found ${partitions.length} high compaction score partitions (max: ${maxScore}, avg: ${avgScore.toFixed(2)})`,
      severity: severity,
      max_score: maxScore,
      avg_score: avgScore,
      recommendations: recommendations,
      affected_tables: [
        ...new Set(partitions.map((p) => `${p.database_name}.${p.table_name}`)),
      ].length,
    };
  }

  /**
   * 获取 Compaction 线程配置
   */
  async getCompactionThreads(connection) {
    try {
      const [threadConfig] = await connection.query(`
        SELECT
          BE_ID as be_id,
          VALUE as thread_count
        FROM information_schema.be_configs
        WHERE name = 'compact_threads'
        ORDER BY BE_ID
      `);

      // 获取BE节点信息以便分析
      const [backends] = await connection.query('SHOW BACKENDS');

      const analysis = threadConfig.map((config) => {
        const beInfo = backends.find(
          (be) => be.BackendId === config.be_id.toString(),
        );
        const threads = parseInt(config.thread_count);
        const cpuCores = beInfo ? parseInt(beInfo.CpuCores) || 1 : 1;

        return {
          be_id: config.be_id,
          ip: beInfo ? beInfo.IP : 'Unknown',
          thread_count: threads,
          cpu_cores: cpuCores,
          threads_per_core: (threads / cpuCores).toFixed(2),
          recommended_min: Math.max(
            this.rules.thread_config.absolute_min_threads,
            Math.ceil(cpuCores * this.rules.thread_config.min_threads_per_core),
          ),
          recommended_max: Math.min(
            this.rules.thread_config.absolute_max_threads,
            Math.ceil(cpuCores * this.rules.thread_config.max_threads_per_core),
          ),
          status: this.evaluateThreadConfig(threads, cpuCores),
        };
      });

      return {
        success: true,
        data: {
          thread_configurations: analysis,
          cluster_summary: {
            total_nodes: analysis.length,
            total_threads: analysis.reduce((sum, a) => sum + a.thread_count, 0),
            total_cpu_cores: analysis.reduce((sum, a) => sum + a.cpu_cores, 0),
            avg_threads_per_core: (
              analysis.reduce(
                (sum, a) => sum + parseFloat(a.threads_per_core),
                0,
              ) / analysis.length
            ).toFixed(2),
          },
          analysis: this.analyzeThreadConfiguration(analysis),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve compaction thread configuration: ${error.message}`,
        data: {
          thread_configurations: [],
          cluster_summary: null,
        },
      };
    }
  }

  /**
   * 评估线程配置状态
   */
  evaluateThreadConfig(threads, cpuCores) {
    const threadsPerCore = threads / cpuCores;
    const minRecommended = this.rules.thread_config.min_threads_per_core;
    const maxRecommended = this.rules.thread_config.max_threads_per_core;

    if (threadsPerCore < minRecommended) {
      return 'LOW';
    } else if (threadsPerCore > maxRecommended) {
      return 'HIGH';
    } else {
      return 'OPTIMAL';
    }
  }

  /**
   * 分析线程配置
   */
  analyzeThreadConfiguration(analysis) {
    const lowConfigNodes = analysis.filter((a) => a.status === 'LOW');
    const highConfigNodes = analysis.filter((a) => a.status === 'HIGH');
    const optimalNodes = analysis.filter((a) => a.status === 'OPTIMAL');

    let summary = '';
    let recommendations = [];

    if (lowConfigNodes.length > 0) {
      summary += `${lowConfigNodes.length} 个节点线程配置偏低; `;
      recommendations.push('增加低配置节点的 compaction 线程数');
    }

    if (highConfigNodes.length > 0) {
      summary += `${highConfigNodes.length} 个节点线程配置偏高; `;
      recommendations.push('考虑降低高配置节点的线程数以节省资源');
    }

    if (optimalNodes.length === analysis.length) {
      summary = '所有节点线程配置都在最优范围内';
      recommendations.push('保持当前线程配置');
    }

    return {
      summary: summary.trim(),
      node_status: {
        optimal: optimalNodes.length,
        low: lowConfigNodes.length,
        high: highConfigNodes.length,
      },
      recommendations: recommendations,
    };
  }

  /**
   * 设置 Compaction 线程数
   */
  async setCompactionThreads(connection, threadCount) {
    try {
      // 获取所有BE节点
      const [backends] = await connection.query('SHOW BACKENDS');
      const results = [];

      for (const backend of backends) {
        try {
          await connection.query(`
            ADMIN SET be_config ("compact_threads" = "${threadCount}") FOR "${backend.IP}:${backend.HeartbeatPort}"
          `);
          results.push({
            be_id: backend.BackendId,
            ip: backend.IP,
            status: 'SUCCESS',
            previous_threads: null, // Would need to query before setting
            new_threads: threadCount,
          });
        } catch (error) {
          results.push({
            be_id: backend.BackendId,
            ip: backend.IP,
            status: 'FAILED',
            error: error.message,
          });
        }
      }

      const successCount = results.filter((r) => r.status === 'SUCCESS').length;
      const failureCount = results.filter((r) => r.status === 'FAILED').length;

      return {
        success: failureCount === 0,
        data: {
          operation: 'set_compaction_threads',
          target_thread_count: threadCount,
          results: results,
          summary: {
            total_nodes: backends.length,
            successful_updates: successCount,
            failed_updates: failureCount,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set compaction threads: ${error.message}`,
        data: {
          operation: 'set_compaction_threads',
          target_thread_count: threadCount,
          results: [],
        },
      };
    }
  }

  /**
   * 获取正在运行的 Compaction 任务
   */
  async getRunningCompactionTasks(connection, includeDetails = true) {
    try {
      const [tasks] = await connection.query(`
        SELECT
          BE_ID as be_id,
          TXN_ID as txn_id,
          TABLET_ID as tablet_id,
          VERSION as version,
          START_TIME as start_time,
          PROGRESS as progress,
          STATUS as status,
          RUNS as runs
        FROM information_schema.be_cloud_native_compactions
        WHERE START_TIME IS NOT NULL AND FINISH_TIME IS NULL
        ORDER BY START_TIME DESC
      `);

      const taskAnalysis = this.analyzeRunningTasks(tasks);

      return {
        success: true,
        data: {
          running_tasks: includeDetails
            ? tasks
            : tasks.map((t) => ({
                be_id: t.be_id,
                tablet_id: t.tablet_id,
                progress: t.progress,
                status: t.status,
              })),
          task_count: tasks.length,
          analysis: taskAnalysis,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve running compaction tasks: ${error.message}`,
        data: {
          running_tasks: [],
          task_count: 0,
        },
      };
    }
  }

  /**
   * 检查高 CS 分区是否长时间未执行 Compaction
   * @param {Connection} connection - 数据库连接
   * @param {string} database_name - 数据库名
   * @param {string} table_name - 表名
   * @returns {Object} 卡住的分区信息
   */
  async checkStuckPartitionsWithHighCS(connection, database_name, table_name) {
    try {
      // 1. 查询该表的所有分区的 Compaction Score
      const csQuery = `
        SELECT
          PARTITION_NAME,
          MAX_CS as compaction_score
        FROM information_schema.partitions_meta
        WHERE DB_NAME = ?
          AND TABLE_NAME = ?
          AND MAX_CS > 10
        ORDER BY MAX_CS DESC
      `;
      const [csRows] = await connection.query(csQuery, [
        database_name,
        table_name,
      ]);

      if (!csRows || csRows.length === 0) {
        return {
          message: '未找到高 CS 分区 (CS > 10)',
          partitions: [],
        };
      }

      console.error(`   → 找到 ${csRows.length} 个高 CS 分区 (CS > 10)`);

      // 2. 检查每个分区的最后版本生效时间
      const stuckPartitions = [];
      const now = new Date();
      const thresholdMinutes = 30;

      for (const row of csRows) {
        const partitionName = row.PARTITION_NAME;
        const cs = row.compaction_score || row.MAX_CS;

        // 查询该分区的最后版本生效时间
        const versionQuery = `
          SELECT VISIBLE_VERSION_TIME
          FROM information_schema.partitions_meta
          WHERE DB_NAME = ?
            AND TABLE_NAME = ?
            AND PARTITION_NAME = ?
        `;
        const [versionRows] = await connection.query(versionQuery, [
          database_name,
          table_name,
          partitionName,
        ]);

        if (versionRows && versionRows.length > 0) {
          const visibleVersionTime = versionRows[0].VISIBLE_VERSION_TIME;

          if (visibleVersionTime) {
            const lastVersionTime = new Date(visibleVersionTime);
            const minutesSinceLastVersion =
              (now - lastVersionTime) / (1000 * 60);

            // 如果距离上次版本生效时间超过 30 分钟,认为是卡住了
            if (minutesSinceLastVersion > thresholdMinutes) {
              stuckPartitions.push({
                partition_name: partitionName,
                compaction_score: cs,
                last_version_time: visibleVersionTime,
                minutes_since_last_version: minutesSinceLastVersion.toFixed(1),
                severity: cs > 100 ? 'HIGH' : cs > 50 ? 'MEDIUM' : 'LOW',
              });
            }
          }
        }
      }

      // 按 CS 降序排序
      stuckPartitions.sort((a, b) => b.compaction_score - a.compaction_score);

      if (stuckPartitions.length > 0) {
        console.error(
          `   → 其中 ${stuckPartitions.length} 个分区超过 ${thresholdMinutes} 分钟未执行 Compaction`,
        );
      }

      // 3. 统计**系统所有**高 CS 分区的 tablet 总数 (不仅限于目标表)
      let unscheduled_tablet_num = 0;

      // 查询系统中所有 CompactionScore > 10 的分区的 tablet 总数
      const systemHighCSQuery = `
        SELECT SUM(BUCKETS) as total_tablets
        FROM information_schema.partitions_meta
        WHERE MAX_CS > 10
      `;
      const [systemHighCSRows] = await connection.query(systemHighCSQuery);
      unscheduled_tablet_num = systemHighCSRows?.[0]?.total_tablets || 0;

      console.error(
        `   → 系统所有高 CS 分区的 tablet 总数: ${unscheduled_tablet_num}`,
      );

      // 额外输出目标表的 tablet 数量（用于对比）
      if (stuckPartitions.length > 0) {
        const partitionNames = stuckPartitions
          .map((p) => `'${p.partition_name}'`)
          .join(',');
        const targetTableQuery = `
          SELECT SUM(BUCKETS) as tablet_count
          FROM information_schema.partitions_meta
          WHERE DB_NAME = ?
            AND TABLE_NAME = ?
            AND PARTITION_NAME IN (${partitionNames})
        `;
        const [targetTableRows] = await connection.query(targetTableQuery, [
          database_name,
          table_name,
        ]);
        const targetTableTablets = targetTableRows?.[0]?.tablet_count || 0;
        console.error(
          `   → 目标表 ${database_name}.${table_name} 的高 CS 分区 tablet 数: ${targetTableTablets}`,
        );
      }

      // 4. 统计正在执行的 compaction job 的 tablet 数量
      let scheduled_tablet_num = 0;
      const runningJobsQuery = `
        SELECT COUNT(DISTINCT TABLET_ID) as running_tablet_count
        FROM information_schema.be_cloud_native_compactions
        WHERE STATUS = 'RUNNING' OR STATUS = 'running'
      `;
      const [runningJobsRows] = await connection.query(runningJobsQuery);
      scheduled_tablet_num = runningJobsRows?.[0]?.running_tablet_count || 0;
      console.error(
        `   → 正在执行的 compaction tablet 数量: ${scheduled_tablet_num}`,
      );

      // 5. 获取 lake_compaction_max_tasks 参数配置（FE 配置）
      const maxTasksQuery = `
        ADMIN SHOW FRONTEND CONFIG LIKE 'lake_compaction_max_tasks'
      `;
      const [maxTasksRows] = await connection.query(maxTasksQuery);

      // 6. 统计 BE/CN 节点数量
      const beCountQuery = `SELECT COUNT(DISTINCT BE_ID) as be_count FROM information_schema.be_configs`;
      const [beCountRows] = await connection.query(beCountQuery);
      const beCount = beCountRows?.[0]?.be_count || 0;

      // 7. 计算实际的 max_tasks 容量
      let effective_max_tasks = 0;
      let is_adaptive = false;
      let is_disabled = false;
      let max_tasks_config = '-1';

      if (maxTasksRows && maxTasksRows.length > 0) {
        const configValue = maxTasksRows[0].Value;
        max_tasks_config = configValue;

        const configInt = parseInt(configValue);
        if (configInt === 0) {
          // 0 表示禁用 compaction
          is_disabled = true;
          effective_max_tasks = 0;
        } else if (configInt === -1) {
          // -1 表示自适应模式: 16 * BE 节点数
          is_adaptive = true;
          effective_max_tasks = 16 * beCount;
        } else {
          // 正数表示手动指定的容量
          effective_max_tasks = configInt;
        }
      } else {
        // 默认值 -1 (自适应)
        is_adaptive = true;
        effective_max_tasks = 16 * beCount;
      }

      console.error(
        `   → lake_compaction_max_tasks: ${max_tasks_config} (实际容量: ${effective_max_tasks}${is_disabled ? ' - DISABLED' : is_adaptive ? ' - Adaptive' : ''})`,
      );

      // 8. 分析容量是否充足
      const total_tablet_demand = unscheduled_tablet_num + scheduled_tablet_num;
      const capacity_utilization =
        effective_max_tasks > 0 ? total_tablet_demand / effective_max_tasks : 0;
      const is_capacity_insufficient =
        total_tablet_demand > effective_max_tasks * 0.8; // 超过 80% 认为不足

      let capacity_analysis = null;

      // 如果 compaction 被禁用
      if (stuckPartitions.length > 0 && is_disabled) {
        capacity_analysis = {
          is_insufficient: true,
          is_disabled: true,
          unscheduled_tablet_num,
          scheduled_tablet_num,
          total_tablet_demand,
          effective_max_tasks: 0,
          capacity_utilization: 'N/A (Disabled)',
          recommended_max_tasks: Math.ceil(total_tablet_demand * 1.5),
          severity: 'CRITICAL',
          message: `Compaction 已被禁用 (lake_compaction_max_tasks = 0)，所有分区都无法执行 compaction`,
          recommendation: `立即启用 compaction，建议设置 lake_compaction_max_tasks = ${Math.ceil(total_tablet_demand * 1.5)} 或 -1 (自适应)`,
          example_command: `ADMIN SET FRONTEND CONFIG ("lake_compaction_max_tasks" = "-1");  -- 启用自适应模式`,
        };
        console.error(
          `   🚨 CRITICAL: Compaction 已被禁用！所有分区无法执行 compaction`,
        );
      } else if (stuckPartitions.length > 0 && is_capacity_insufficient) {
        const recommended_max_tasks = Math.ceil(total_tablet_demand * 1.5); // 建议值为需求的 1.5 倍
        capacity_analysis = {
          is_insufficient: true,
          unscheduled_tablet_num,
          scheduled_tablet_num,
          total_tablet_demand,
          effective_max_tasks,
          capacity_utilization: (capacity_utilization * 100).toFixed(1) + '%',
          recommended_max_tasks,
          severity:
            capacity_utilization > 1.5
              ? 'CRITICAL'
              : capacity_utilization > 1.0
                ? 'HIGH'
                : 'MEDIUM',
          message: `当前 compaction 容量不足: 需求 ${total_tablet_demand} tablets (未调度 ${unscheduled_tablet_num} + 运行中 ${scheduled_tablet_num}), 但容量仅为 ${effective_max_tasks}`,
          recommendation: is_adaptive
            ? `当前为自适应模式 (${beCount} 个节点 × 16 = ${effective_max_tasks})，建议手动设置 lake_compaction_max_tasks = ${recommended_max_tasks}`
            : `当前配置 lake_compaction_max_tasks = ${max_tasks_config}，建议调整为 ${recommended_max_tasks}`,
          example_command: `ADMIN SET FRONTEND CONFIG ("lake_compaction_max_tasks" = "${recommended_max_tasks}");`,
        };
        console.error(
          `   ⚠️  容量不足: 需求 ${total_tablet_demand} > 容量 ${effective_max_tasks} (利用率 ${(capacity_utilization * 100).toFixed(1)}%)`,
        );
      } else if (stuckPartitions.length > 0) {
        capacity_analysis = {
          is_insufficient: false,
          unscheduled_tablet_num,
          scheduled_tablet_num,
          total_tablet_demand,
          effective_max_tasks,
          capacity_utilization: (capacity_utilization * 100).toFixed(1) + '%',
          message: `容量充足，但仍有分区未调度，可能是其他原因导致`,
          suggestion: `检查 FE 日志中的调度器错误，或者分区元数据异常`,
        };
      }

      return {
        message:
          stuckPartitions.length > 0
            ? `发现 ${stuckPartitions.length} 个高 CS 分区长时间未执行 Compaction (> ${thresholdMinutes} 分钟)`
            : `所有高 CS 分区都在 ${thresholdMinutes} 分钟内执行过 Compaction`,
        threshold_minutes: thresholdMinutes,
        total_high_cs_partitions: csRows.length,
        stuck_partition_count: stuckPartitions.length,
        partitions: stuckPartitions,
        capacity_analysis,
        suggestion:
          stuckPartitions.length > 0
            ? capacity_analysis?.is_insufficient
              ? '主要原因: lake_compaction_max_tasks 容量不足，需要扩容'
              : '容量充足但仍未调度，可能是调度器问题、分区元数据异常或其他系统问题'
            : null,
      };
    } catch (error) {
      console.error(`   ⚠️  检查高 CS 分区失败: ${error.message}`);
      return {
        error: error.message,
        partitions: [],
      };
    }
  }

  /**
   * 分析单个未完成的 Compaction Job 的子任务执行情况
   * @param {Connection} connection - 数据库连接
   * @param {Object} job - 未完成的 job 对象
   * @returns {Object} 分析结果
   */
  async analyzeUnfinishedCompactionJobTasks(connection, job) {
    try {
      // 1. 查询该 job 的所有子任务
      const taskQuery = `
        SELECT BE_ID, TXN_ID, TABLET_ID, RUNS, START_TIME, FINISH_TIME, PROGRESS, PROFILE
        FROM information_schema.be_cloud_native_compactions
        WHERE TXN_ID = ?
      `;
      const [taskRows] = await connection.query(taskQuery, [job.txn_id]);

      if (!taskRows || taskRows.length === 0) {
        return {
          error: '无法获取子任务信息',
        };
      }

      // 2. 从子任务中计算 bucket count (不同 TABLET_ID 的数量)
      const tasks = taskRows;
      const uniqueTablets = new Set(tasks.map((t) => t.TABLET_ID));
      const bucketCount = uniqueTablets.size;

      // 3. 统计子任务状态
      const totalTasks = tasks.length;
      let completedTasks = 0; // PROGRESS = 100
      let runningTasks = 0; // START_TIME 不为空 且 PROGRESS < 100
      let pendingTasks = 0; // START_TIME 为空
      let unfinishedTasks = 0; // PROGRESS != 100

      const unfinishedTaskDetails = [];
      const runningTaskDetails = []; // 正在运行的任务 (有进度)
      const pendingTaskDetails = []; // 等待中的任务 (未开始)
      const completedTaskProfiles = []; // 保存已完成任务的 Profile 分析
      const beRunsMap = {}; // 统计每个 BE 节点的 RUNS 信息

      for (const task of tasks) {
        const progress = task.PROGRESS || 0;
        const startTime = task.START_TIME;
        const finishTime = task.FINISH_TIME;
        const beId = task.BE_ID;
        const runs = task.RUNS || 1;

        // 统计每个 BE 的 RUNS (只统计成功的和正在运行的任务)
        if (progress === 100 || (startTime && progress < 100)) {
          if (!beRunsMap[beId]) {
            beRunsMap[beId] = {
              runs_list: [],
              task_count: 0,
            };
          }
          beRunsMap[beId].runs_list.push(runs);
          beRunsMap[beId].task_count++;
        }

        if (progress === 100) {
          completedTasks++;

          // 分析已完成任务的 Profile
          if (task.PROFILE) {
            try {
              const profile =
                typeof task.PROFILE === 'string'
                  ? JSON.parse(task.PROFILE)
                  : task.PROFILE;

              const profileData = {
                tablet_id: task.TABLET_ID,
                be_id: beId,
                in_queue_sec: profile.in_queue_sec || 0,
                read_local_sec: profile.read_local_sec || 0,
                read_local_mb: profile.read_local_mb || 0,
                read_remote_sec: profile.read_remote_sec || 0,
                read_remote_mb: profile.read_remote_mb || 0,
                write_remote_sec: profile.write_remote_sec || 0,
                write_remote_mb: profile.write_remote_mb || 0,
              };

              completedTaskProfiles.push(profileData);
            } catch (error) {
              // Profile 解析失败,忽略
            }
          }
        } else {
          unfinishedTasks++;

          if (!startTime) {
            pendingTasks++;

            // 计算排队等待时间 (从 job 开始时间到现在)
            let waitTimeMin = 0;
            let waitTimeDisplay = 'N/A';

            if (job.start_time) {
              try {
                const jobStartTime = new Date(job.start_time);
                const now = new Date();
                const waitTimeMs = now - jobStartTime;
                waitTimeMin = parseFloat((waitTimeMs / 1000 / 60).toFixed(1));
                waitTimeDisplay = `${waitTimeMin.toFixed(1)} 分钟`;
              } catch (error) {
                // 日期解析失败,使用默认值
                console.error(
                  `   ⚠️ 解析 job.start_time 失败: ${job.start_time}`,
                );
              }
            }

            pendingTaskDetails.push({
              be_id: beId,
              tablet_id: task.TABLET_ID,
              runs: runs,
              wait_time_min: waitTimeMin,
              wait_time_display: waitTimeDisplay,
            });
          } else {
            runningTasks++;

            // 计算运行时长
            const startTimeDate = new Date(startTime);
            const now = new Date();
            const runningTimeMs = now - startTimeDate;
            const runningTimeMin = (runningTimeMs / 1000 / 60).toFixed(1);

            runningTaskDetails.push({
              be_id: beId,
              tablet_id: task.TABLET_ID,
              runs: runs,
              start_time: startTime,
              progress: progress,
              progress_display: `${progress}%`,
              running_time_min: parseFloat(runningTimeMin),
              running_time_display: `${runningTimeMin} 分钟`,
            });
          }

          // 收集未完成任务的详细信息 (保留原有字段以保持兼容性)
          unfinishedTaskDetails.push({
            be_id: beId,
            tablet_id: task.TABLET_ID,
            runs: runs,
            start_time: startTime,
            finish_time: finishTime,
            progress: progress,
            has_profile: !!task.PROFILE,
          });
        }
      }

      // 4. 分析已完成任务的 Profile 聚合统计
      let profileAnalysis = null;
      if (completedTaskProfiles.length > 0) {
        const totalInQueueSec = completedTaskProfiles.reduce(
          (sum, p) => sum + p.in_queue_sec,
          0,
        );
        const totalReadLocalMB = completedTaskProfiles.reduce(
          (sum, p) => sum + p.read_local_mb,
          0,
        );
        const totalReadRemoteMB = completedTaskProfiles.reduce(
          (sum, p) => sum + p.read_remote_mb,
          0,
        );
        const totalWriteRemoteMB = completedTaskProfiles.reduce(
          (sum, p) => sum + p.write_remote_mb,
          0,
        );

        const avgInQueueSec = totalInQueueSec / completedTaskProfiles.length;

        // 识别问题
        const issues = [];

        // 检查 1: 排队时间过长
        if (avgInQueueSec > 30) {
          issues.push({
            type: 'high_queue_time',
            severity: avgInQueueSec > 60 ? 'HIGH' : 'MEDIUM',
            description: `平均排队时间 ${avgInQueueSec.toFixed(1)} 秒，BE 节点 Compaction 工作线程数量不足`,
            suggestion: '需要适当调大 compact_threads 的值',
          });
        }

        // 检查 2: 缓存命中率低
        const totalReadMB = totalReadLocalMB + totalReadRemoteMB;
        const cacheHitRatio =
          totalReadMB > 0 ? (totalReadLocalMB / totalReadMB) * 100 : 0;

        if (totalReadLocalMB < totalReadRemoteMB * 0.2) {
          // 本地读取 < 远程读取的 20%
          issues.push({
            type: 'low_cache_hit',
            severity: cacheHitRatio < 5 ? 'HIGH' : 'MEDIUM',
            description: `缓存命中率低 (${cacheHitRatio.toFixed(1)}%)，本地读取 ${totalReadLocalMB.toFixed(1)} MB，远程读取 ${totalReadRemoteMB.toFixed(1)} MB`,
            suggestion: 'Cache 尚未开启或者 Cache 空间比较紧张',
          });
        }

        profileAnalysis = {
          completed_task_count: completedTaskProfiles.length,
          avg_in_queue_sec: avgInQueueSec.toFixed(1),
          total_read_local_mb: totalReadLocalMB.toFixed(1),
          total_read_remote_mb: totalReadRemoteMB.toFixed(1),
          total_write_remote_mb: totalWriteRemoteMB.toFixed(1),
          cache_hit_ratio: cacheHitRatio.toFixed(1) + '%',
          issues: issues,
        };
      }

      // 4.5 分析每个 BE 节点的 RUNS 情况
      const beRunsAnalysis = [];
      for (const [beId, beData] of Object.entries(beRunsMap)) {
        const runsList = beData.runs_list;
        const taskCount = beData.task_count;

        if (taskCount === 0) continue;

        const avgRuns = runsList.reduce((sum, r) => sum + r, 0) / taskCount;
        const maxRuns = Math.max(...runsList);

        const hasMemoryIssue = maxRuns > 1;

        beRunsAnalysis.push({
          be_id: beId,
          task_count: taskCount,
          avg_runs: avgRuns.toFixed(2),
          max_runs: maxRuns,
          has_memory_issue: hasMemoryIssue,
          severity: maxRuns > 3 ? 'HIGH' : maxRuns > 1 ? 'MEDIUM' : 'NORMAL',
          description: hasMemoryIssue
            ? `BE ${beId} 出现过内存不足情况 (最大 ${maxRuns} 次重试, 平均 ${avgRuns.toFixed(1)} 次)`
            : `BE ${beId} 运行正常 (平均 RUNS: ${avgRuns.toFixed(1)})`,
        });
      }

      // 按严重程度排序
      beRunsAnalysis.sort((a, b) => {
        const severityOrder = { HIGH: 3, MEDIUM: 2, NORMAL: 1 };
        return (
          (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
        );
      });

      // 5. 计算统计信息
      let runningTaskStats = null;
      if (runningTaskDetails.length > 0) {
        const avgProgress =
          runningTaskDetails.reduce((sum, t) => sum + t.progress, 0) /
          runningTaskDetails.length;
        const avgRunningTime =
          runningTaskDetails.reduce((sum, t) => sum + t.running_time_min, 0) /
          runningTaskDetails.length;
        const maxRunningTime = Math.max(
          ...runningTaskDetails.map((t) => t.running_time_min),
        );

        runningTaskStats = {
          count: runningTaskDetails.length,
          avg_progress: avgProgress.toFixed(1) + '%',
          avg_running_time_min: avgRunningTime.toFixed(1),
          max_running_time_min: maxRunningTime.toFixed(1),
        };
      }

      let pendingTaskStats = null;
      if (pendingTaskDetails.length > 0) {
        const avgWaitTime =
          pendingTaskDetails.reduce((sum, t) => sum + t.wait_time_min, 0) /
          pendingTaskDetails.length;
        const maxWaitTime = Math.max(
          ...pendingTaskDetails.map((t) => t.wait_time_min),
        );

        pendingTaskStats = {
          count: pendingTaskDetails.length,
          avg_wait_time_min: avgWaitTime.toFixed(1),
          max_wait_time_min: maxWaitTime.toFixed(1),
        };
      }

      // 6. 返回分析结果
      return {
        bucket_count: bucketCount,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        unfinished_tasks: unfinishedTasks,
        running_tasks: runningTasks,
        pending_tasks: pendingTasks,
        completion_ratio:
          ((completedTasks / totalTasks) * 100).toFixed(1) + '%',
        unfinished_task_samples: unfinishedTaskDetails.slice(0, 5), // 最多显示 5 个样本
        running_task_details: runningTaskDetails.slice(0, 10), // 正在运行的任务 (最多 10 个)
        running_task_stats: runningTaskStats, // 运行任务的统计信息
        pending_task_details: pendingTaskDetails.slice(0, 10), // 等待中的任务 (最多 10 个)
        pending_task_stats: pendingTaskStats, // 等待任务的统计信息
        profile_analysis: profileAnalysis, // 已完成任务的 Profile 分析
        be_runs_analysis: beRunsAnalysis, // 每个 BE 节点的 RUNS 分析
      };
    } catch (error) {
      return {
        error: error.message,
      };
    }
  }

  /**
   * 深度分析 Compaction 慢任务问题
   * 提供详细的根因分析和优化建议
   */
  async analyzeSlowCompactionTasks(connection, options = {}) {
    const {
      database_name = null,
      table_name = null,
      min_duration_hours = 0.05, // 最小运行时长（小时），默认 3 分钟
      include_task_details = true,
      check_system_metrics = true,
    } = options;

    try {
      console.error('🔍 开始分析 Compaction 慢任务问题...');
      if (database_name || table_name) {
        console.error(
          `   📌 过滤目标: ${database_name || '*'}.${table_name || '*'}`,
        );
      }
      console.error(
        `   📌 慢任务阈值: >= ${min_duration_hours}h (${(min_duration_hours * 60).toFixed(1)} 分钟)`,
      );

      // 1. 通过 SHOW PROC '/compactions' 获取所有 compaction jobs
      console.error(
        "🔍 步骤1: 通过 SHOW PROC '/compactions' 获取所有 Compaction Jobs...",
      );
      const allJobs = await this.getCompactionJobsFromProc(connection);
      console.error(`   → 找到 ${allJobs.length} 个 Compaction Jobs`);

      // 2. 根据 database_name 和 table_name 过滤 jobs（简单字符串匹配）
      console.error('🔍 步骤2: 根据 database/table 过滤 Jobs...');
      console.error(
        `   [DEBUG] 过滤参数: database_name="${database_name}", table_name="${table_name}"`,
      );
      let filteredJobs = allJobs;

      if (database_name || table_name) {
        filteredJobs = allJobs.filter((job) => {
          // 简单的字符串匹配
          if (database_name && job.database !== database_name) return false;
          if (table_name && job.table !== table_name) return false;
          return true;
        });

        console.error(
          `   → 过滤后剩余 ${filteredJobs.length} 个 Jobs (原始: ${allJobs.length})`,
        );
        if (filteredJobs.length > 0 && filteredJobs.length <= 3) {
          console.error(
            `   [DEBUG] 过滤后的 Jobs:`,
            filteredJobs.map((j) => `${j.database}.${j.table}`),
          );
        }

        // 输出示例
        if (filteredJobs.length > 0) {
          const samples = filteredJobs.slice(0, 3);
          console.error(
            `   → 示例 Jobs: ${samples.map((j) => `${j.database}.${j.table} (txn:${j.txn_id})`).join(', ')}`,
          );
        }
      }

      // 3. 分组: 已完成 vs 未完成
      console.error('🔍 步骤3: 分组 Jobs (已完成 vs 未完成)...');
      const completedJobs = []; // FinishTime IS NOT NULL AND Error IS NULL
      const unfinishedJobs = []; // FinishTime IS NULL

      for (const job of filteredJobs) {
        if (job.finish_time && !job.error) {
          // 已完成且成功的任务 (FinishTime IS NOT NULL AND Error IS NULL)
          completedJobs.push(job);
        } else {
          // 未完成或失败的任务
          unfinishedJobs.push(job);
        }
      }

      console.error(
        `   → 已完成(成功): ${completedJobs.length} 个, 未完成/失败: ${unfinishedJobs.length} 个`,
      );

      // 4. 分析已完成的慢任务
      console.error('🔍 步骤4: 分析已完成的慢任务...');
      const slowCompletedJobs = [];

      for (const job of completedJobs) {
        if (!job.start_time || !job.finish_time) continue;

        // 计算耗时: FinishTime - StartTime
        const startTime = new Date(job.start_time);
        const finishTime = new Date(job.finish_time);
        const durationHours = (finishTime - startTime) / (1000 * 60 * 60);

        // 判断是否为慢任务
        if (durationHours >= min_duration_hours) {
          // 分析 Profile
          const profileAnalysis = await this.analyzeCompactionJobProfile(
            job,
            durationHours,
          );

          slowCompletedJobs.push({
            type: 'completed',
            txn_id: job.txn_id,
            database: job.database,
            table: job.table,
            partition_name: job.partition_name,
            start_time: job.start_time,
            finish_time: job.finish_time,
            duration_hours: durationHours,
            duration_minutes: (durationHours * 60).toFixed(1),
            profile_analysis: profileAnalysis,
          });
        }
      }

      console.error(
        `   → 找到 ${slowCompletedJobs.length} 个慢任务（>= ${min_duration_hours}h = ${(min_duration_hours * 60).toFixed(1)}min）`,
      );

      // 5. 分析未完成的任务 (可选)
      console.error('🔍 步骤5: 分析未完成的任务...');
      const slowUnfinishedJobs = [];
      for (const job of unfinishedJobs) {
        if (job.start_time) {
          const startTime = new Date(job.start_time);
          const now = new Date();
          const durationHours = (now - startTime) / (1000 * 60 * 60);

          if (durationHours >= min_duration_hours) {
            slowUnfinishedJobs.push({
              type: 'unfinished',
              txn_id: job.txn_id,
              database: job.database,
              table: job.table,
              partition_name: job.partition_name,
              start_time: job.start_time,
              duration_hours: durationHours,
              duration_minutes: (durationHours * 60).toFixed(1),
              error: job.error,
            });
          }
        }
      }

      console.error(`   → 找到 ${slowUnfinishedJobs.length} 个未完成的慢任务`);

      // 5.5 分析未完成的慢任务详情
      if (slowUnfinishedJobs.length > 0) {
        console.error(`   → 开始分析未完成慢任务的子任务执行情况...`);

        for (const job of slowUnfinishedJobs) {
          // 调用独立的分析函数
          const taskAnalysis = await this.analyzeUnfinishedCompactionJobTasks(
            connection,
            job,
          );
          job.task_analysis = taskAnalysis;

          // 输出日志
          if (!taskAnalysis.error) {
            let logMsg = `     - Job ${job.txn_id}: 总任务 ${taskAnalysis.total_tasks}, 未完成 ${taskAnalysis.unfinished_tasks} (运行中 ${taskAnalysis.running_tasks}, 待开始 ${taskAnalysis.pending_tasks})`;

            if (
              taskAnalysis.profile_analysis &&
              taskAnalysis.profile_analysis.issues.length > 0
            ) {
              const issueTypes = taskAnalysis.profile_analysis.issues
                .map((i) => i.type)
                .join(', ');
              logMsg += `, 发现问题: ${issueTypes}`;
            }

            // 添加内存问题提示
            const memoryIssueBEs = taskAnalysis.be_runs_analysis.filter(
              (be) => be.has_memory_issue,
            );
            if (memoryIssueBEs.length > 0) {
              const beIds = memoryIssueBEs
                .map((be) => `BE ${be.be_id}(${be.max_runs}次)`)
                .join(', ');
              logMsg += `, 内存不足: ${beIds}`;
            }

            console.error(logMsg);
          } else {
            console.error(
              `     ⚠️  分析 Job ${job.txn_id} 失败: ${taskAnalysis.error}`,
            );
          }
        }
      }

      // 6. 汇总所有慢任务
      const allSlowJobs = [...slowCompletedJobs, ...slowUnfinishedJobs];
      allSlowJobs.sort((a, b) => b.duration_hours - a.duration_hours);

      console.error(
        `   ✅ 分析完成！总共 ${allSlowJobs.length} 个慢任务 (已完成: ${slowCompletedJobs.length}, 未完成: ${slowUnfinishedJobs.length})`,
      );

      // 7. 检查是否有高 CS 分区但没有 Compaction Job
      let stuckPartitions = null;
      console.error(
        `🔍 [DEBUG] 步骤7判断条件: database_name=${database_name}, table_name=${table_name}, filteredJobs.length=${filteredJobs.length}`,
      );
      if (database_name && table_name && filteredJobs.length === 0) {
        console.error('🔍 步骤7: 未找到 Compaction Job, 检查高 CS 分区...');
        stuckPartitions = await this.checkStuckPartitionsWithHighCS(
          connection,
          database_name,
          table_name,
        );

        if (stuckPartitions && stuckPartitions.partitions.length > 0) {
          console.error(
            `   ⚠️  发现 ${stuckPartitions.partitions.length} 个高 CS 分区长时间未执行 Compaction`,
          );
        }
      }

      // 8. 生成诊断摘要 - 汇总瓶颈原因
      const diagnosis = await this.generateSlowJobDiagnosis(
        connection,
        database_name,
        table_name,
        slowCompletedJobs,
      );

      // 8.5 如果发现了高 CS 分区长时间未执行 Compaction 且有容量问题, 添加到诊断中
      if (
        stuckPartitions &&
        stuckPartitions.partitions.length > 0 &&
        stuckPartitions.capacity_analysis
      ) {
        const capacity = stuckPartitions.capacity_analysis;

        if (capacity.is_insufficient) {
          // 容量不足,添加到 issues
          diagnosis.issues.push({
            type: 'compaction_capacity_insufficient',
            severity: capacity.severity,
            description: capacity.message,
            details: {
              unscheduled_partitions: stuckPartitions.stuck_partition_count,
              unscheduled_tablets: capacity.unscheduled_tablet_num,
              running_tablets: capacity.scheduled_tablet_num,
              total_demand: capacity.total_tablet_demand,
              current_capacity: capacity.effective_max_tasks,
              utilization: capacity.capacity_utilization,
              recommended_capacity: capacity.recommended_max_tasks,
            },
            impact: `${stuckPartitions.stuck_partition_count} 个高 CS 分区 (共 ${capacity.unscheduled_tablet_num} tablets) 长时间未被调度，导致 CS 持续累积`,
            root_cause:
              'lake_compaction_max_tasks 参数配置过小，系统容量不足以处理当前的 Compaction 需求',
          });

          // 添加到 recommendations
          diagnosis.recommendations.push({
            priority: 'CRITICAL',
            category: 'capacity_planning',
            title: '扩容 Compaction 任务队列容量',
            description: capacity.recommendation,
            actions: [
              `当前容量: ${capacity.effective_max_tasks} tablets`,
              `实际需求: ${capacity.total_tablet_demand} tablets (未调度 ${capacity.unscheduled_tablet_num} + 运行中 ${capacity.scheduled_tablet_num})`,
              `容量利用率: ${capacity.capacity_utilization}`,
              `建议扩容至: ${capacity.recommended_max_tasks} tablets (需求的 1.5 倍)`,
              '',
              '执行以下命令调整参数:',
            ],
            example_command: capacity.example_command,
          });
        } else {
          // 容量充足但仍未调度
          diagnosis.issues.push({
            type: 'compaction_scheduling_issue',
            severity: 'HIGH',
            description: capacity.message,
            details: {
              stuck_partitions: stuckPartitions.stuck_partition_count,
              unscheduled_tablets: capacity.unscheduled_tablet_num,
              running_tablets: capacity.scheduled_tablet_num,
              current_capacity: capacity.effective_max_tasks,
              utilization: capacity.capacity_utilization,
            },
            impact: `${stuckPartitions.stuck_partition_count} 个高 CS 分区长时间未被调度`,
            root_cause:
              '容量充足，但 Compaction 调度器未正常工作，可能是元数据异常、网络问题或调度器 bug',
          });

          diagnosis.recommendations.push({
            priority: 'HIGH',
            category: 'troubleshooting',
            title: '排查 Compaction 调度异常',
            description: capacity.suggestion,
            actions: [
              '检查 FE 日志中是否有 Compaction 调度器相关的 ERROR 或 WARN 信息',
              '验证 FE 与 BE/CN 节点之间的网络连通性',
              '检查受影响分区的元数据是否正常: SELECT * FROM information_schema.partitions_meta WHERE ...',
              "查看调度状态: SHOW PROC '/compactions'",
              '如果怀疑是元数据问题，尝试刷新元数据或重启 FE',
            ],
          });
        }
      }

      // 9. 返回结果
      const result = {
        success: true,
        analysis_time: new Date().toISOString(),
        filter: {
          database: database_name,
          table: table_name,
          min_duration_hours,
        },
        summary: {
          total_jobs: filteredJobs.length,
          completed_jobs: completedJobs.length,
          unfinished_jobs: unfinishedJobs.length,
          slow_completed_jobs: slowCompletedJobs.length,
          slow_unfinished_jobs: slowUnfinishedJobs.length,
          total_slow_jobs: allSlowJobs.length,
          slowest_duration_hours:
            allSlowJobs[0]?.duration_hours.toFixed(2) || 0,
          avg_slow_duration_hours:
            allSlowJobs.length > 0
              ? (
                  allSlowJobs.reduce((sum, j) => sum + j.duration_hours, 0) /
                  allSlowJobs.length
                ).toFixed(2)
              : 0,
        },
        diagnosis: diagnosis, // 慢任务的根因诊断 (包含容量分析)
        slow_jobs: include_task_details
          ? allSlowJobs
          : allSlowJobs.slice(0, 10),
      };

      // 如果发现了高 CS 分区长时间未执行 Compaction, 添加到结果中
      if (stuckPartitions && stuckPartitions.partitions.length > 0) {
        result.stuck_partitions = stuckPartitions;
      }

      return result;
    } catch (error) {
      console.error('分析慢任务失败:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 生成慢任务诊断摘要
   * 根据 Profile 内各个字段精准分析瓶颈原因
   */
  async generateSlowJobDiagnosis(
    connection,
    database_name,
    table_name,
    slowCompletedJobs,
  ) {
    if (slowCompletedJobs.length === 0) {
      return {
        message: '没有找到慢任务',
        issues: [],
        recommendations: [],
      };
    }

    // 检查表是否开启了 data cache
    let tableCacheEnabled = null; // null: 未检查, true: 已开启, false: 未开启
    if (database_name && table_name) {
      try {
        const [rows] = await connection.query(
          `SHOW CREATE TABLE \`${database_name}\`.\`${table_name}\``,
        );
        if (rows && rows.length > 0) {
          const createTableStmt =
            rows[0]['Create Table'] || rows[0]['CREATE TABLE'] || '';

          // 从 PROPERTIES 中提取 datacache.enable 属性
          const propertiesMatch = createTableStmt.match(
            /PROPERTIES\s*\(([\s\S]*?)\)(?:\s*;?\s*$|\s*BROKER)/i,
          );
          if (propertiesMatch) {
            const propertiesStr = propertiesMatch[1];
            const datacacheEnableMatch = propertiesStr.match(
              /["']datacache\.enable["']\s*=\s*["'](true|false)["']/i,
            );
            if (datacacheEnableMatch) {
              tableCacheEnabled =
                datacacheEnableMatch[1].toLowerCase() === 'true';
              console.error(
                `   ℹ️  表 ${database_name}.${table_name} 的 datacache.enable = ${tableCacheEnabled}`,
              );
            }
          }
        }
      } catch (error) {
        console.error(`   ⚠️  无法检查表缓存配置: ${error.message}`);
      }
    }

    // 统计各类问题
    const issues = {
      high_queue_time: [], // in_queue_sec 过长
      high_sub_task_count: [], // sub_task_count 过大
      cache_disabled: [], // read_local_mb = 0
      cache_insufficient: [], // read_remote_mb >> read_local_mb
      no_profile: [], // 缺少 Profile
    };

    for (const job of slowCompletedJobs) {
      const analysis = job.profile_analysis;

      if (!analysis || !analysis.success) {
        issues.no_profile.push({
          txn_id: job.txn_id,
          duration_hours: job.duration_hours,
          reason: analysis?.error || '缺少 Profile 数据',
        });
        continue;
      }

      const metrics = analysis.metrics;
      const durationSec = analysis.duration_sec;

      // 1. 检查排队时间
      const queueTimeSec = metrics.in_queue_sec || 0;
      const queueRatio =
        durationSec > 0 ? (queueTimeSec / durationSec) * 100 : 0;

      if (queueRatio > 30) {
        // 排队时间超过 30%
        issues.high_queue_time.push({
          txn_id: job.txn_id,
          duration_hours: job.duration_hours,
          in_queue_sec: queueTimeSec,
          queue_ratio: queueRatio.toFixed(1) + '%',
          severity: queueRatio > 50 ? 'HIGH' : 'MEDIUM',
        });
      }

      // 2. 检查 sub_task_count
      const subTaskCount = metrics.sub_task_count || 0;

      if (subTaskCount > 100) {
        // sub_task_count 过大
        issues.high_sub_task_count.push({
          txn_id: job.txn_id,
          duration_hours: job.duration_hours,
          sub_task_count: subTaskCount,
          severity: subTaskCount > 500 ? 'HIGH' : 'MEDIUM',
        });
      }

      // 3. 检查缓存情况
      const readLocalMB = metrics.read_local_mb || 0;
      const readRemoteMB = metrics.read_remote_mb || 0;

      // 优先根据表配置判断是否开启缓存
      if (tableCacheEnabled === false) {
        // 表配置明确显示未开启缓存
        if (readRemoteMB > 0) {
          issues.cache_disabled.push({
            txn_id: job.txn_id,
            duration_hours: job.duration_hours,
            read_remote_mb: readRemoteMB.toFixed(1),
            check_method: 'table_property', // 检查方式: 表属性
            severity: 'HIGH',
          });
        }
      } else if (readLocalMB === 0 && readRemoteMB > 0) {
        // Profile 显示缓存未命中 (兜底检查)
        issues.cache_disabled.push({
          txn_id: job.txn_id,
          duration_hours: job.duration_hours,
          read_remote_mb: readRemoteMB.toFixed(1),
          check_method: 'profile_metric', // 检查方式: Profile 指标
          severity: tableCacheEnabled === null ? 'HIGH' : 'MEDIUM', // 未检查到表配置时严重程度更高
        });
      } else if (readLocalMB > 0 && readRemoteMB > readLocalMB * 5) {
        // 远程读取远大于本地读取 (5倍以上)
        const cacheHitRatio = (
          (readLocalMB / (readLocalMB + readRemoteMB)) *
          100
        ).toFixed(1);
        issues.cache_insufficient.push({
          txn_id: job.txn_id,
          duration_hours: job.duration_hours,
          read_local_mb: readLocalMB.toFixed(1),
          read_remote_mb: readRemoteMB.toFixed(1),
          cache_hit_ratio: cacheHitRatio + '%',
          severity: cacheHitRatio < 10 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // 生成优化建议
    const recommendations = this.generateDetailedRecommendations(
      issues,
      database_name,
      table_name,
    );

    // 生成诊断消息
    const totalIssues =
      issues.high_queue_time.length +
      issues.high_sub_task_count.length +
      issues.cache_disabled.length +
      issues.cache_insufficient.length;

    const message =
      totalIssues > 0
        ? `分析了 ${slowCompletedJobs.length} 个慢任务，发现 ${totalIssues} 个性能问题`
        : `分析了 ${slowCompletedJobs.length} 个慢任务，未发现明显瓶颈`;

    return {
      message: message,
      total_analyzed: slowCompletedJobs.length,
      issues: {
        high_queue_time: {
          count: issues.high_queue_time.length,
          description: '排队等待时间过长 (> 30%)',
          samples: issues.high_queue_time.slice(0, 3),
        },
        high_sub_task_count: {
          count: issues.high_sub_task_count.length,
          description: '子任务数量过大 (> 100)',
          samples: issues.high_sub_task_count.slice(0, 3),
        },
        cache_disabled: {
          count: issues.cache_disabled.length,
          description: '缓存未开启 (read_local_mb = 0)',
          samples: issues.cache_disabled.slice(0, 3),
        },
        cache_insufficient: {
          count: issues.cache_insufficient.length,
          description: '缓存容量不足 (read_remote_mb >> read_local_mb)',
          samples: issues.cache_insufficient.slice(0, 3),
        },
        no_profile: {
          count: issues.no_profile.length,
          description: '缺少 Profile 数据',
          samples: issues.no_profile.slice(0, 3),
        },
      },
      recommendations: recommendations,
    };
  }

  /**
   * 根据问题类型生成详细优化建议
   */
  generateDetailedRecommendations(issues, database_name, table_name) {
    const recommendations = [];

    // 1. 排队时间过长
    if (issues.high_queue_time.length > 0) {
      const highSeverityCount = issues.high_queue_time.filter(
        (i) => i.severity === 'HIGH',
      ).length;

      recommendations.push({
        issue: '排队等待时间过长',
        severity: highSeverityCount > 0 ? 'HIGH' : 'MEDIUM',
        affected_jobs: issues.high_queue_time.length,
        root_cause:
          'BE/CN 节点的 Compaction 工作线程数量不足，任务在队列中等待调度',
        solutions: [
          '调整 BE/CN 节点的 compact_threads 参数，增加 Compaction 线程数',
          '使用 UPDATE information_schema.be_configs 命令动态调整 (建议根据 CPU 核数设置为 2-4 倍)',
          '检查集群 CPU 和内存资源是否充足，确保可以支持更高的线程并发',
          '考虑在低峰期手动触发 Compaction，避免高峰期排队',
        ],
        example_command:
          "UPDATE information_schema.be_configs SET value = '16' WHERE name = 'compact_threads';  -- 根据 CPU 核数调整",
      });
    }

    // 2. 子任务数量过大
    if (issues.high_sub_task_count.length > 0) {
      const highSeverityCount = issues.high_sub_task_count.filter(
        (i) => i.severity === 'HIGH',
      ).length;

      recommendations.push({
        issue: '子任务数量过大',
        severity: highSeverityCount > 0 ? 'HIGH' : 'MEDIUM',
        affected_jobs: issues.high_sub_task_count.length,
        root_cause:
          '分区内的 Tablet 数量过多 (sub_task_count 代表 Tablet 数量)，导致 Compaction Job 需要处理大量子任务',
        solutions: [
          '减少表的分桶数量 (BUCKETS)，降低单个分区的 Tablet 数',
          '对于新建表，建议 BUCKETS 数量 = 节点数 × CPU核数 ÷ 2',
          '对于现有表，考虑重建表并调整分桶数量',
          '检查表的数据分布是否均匀，避免数据倾斜导致某些分区 Tablet 过多',
        ],
        example_command:
          'CREATE TABLE ... DISTRIBUTED BY HASH(...) BUCKETS 32;  -- 根据集群规模调整',
      });
    }

    // 3. 缓存未开启
    if (issues.cache_disabled.length > 0) {
      // 检查是否通过表属性确认了缓存未开启
      const confirmedByTableProperty = issues.cache_disabled.some(
        (i) => i.check_method === 'table_property',
      );

      const rootCause = confirmedByTableProperty
        ? '表属性 datacache.enable = false，缓存已明确禁用，所有数据都从对象存储读取'
        : 'Profile 显示 read_local_mb = 0，表可能未开启缓存或缓存未命中';

      recommendations.push({
        issue: '缓存未开启',
        severity: 'HIGH',
        affected_jobs: issues.cache_disabled.length,
        root_cause: rootCause,
        solutions: confirmedByTableProperty
          ? [
              '方案 1: 重建表并开启缓存（推荐）',
              '  ⚠️ datacache.enable 属性只能在建表时指定，无法通过 ALTER TABLE 修改',
              "  需要重建表并在 PROPERTIES 中设置 'datacache.enable' = 'true'",
              '  建议步骤: 1) 使用 CREATE TABLE AS SELECT 重建表 2) 验证数据 3) 删除旧表 4) 重命名新表',
              '  确保 BE/CN 节点已配置缓存磁盘路径 (storage_root_path) 和足够空间',
              '',
              '方案 2: 仅加速 Compaction（不开启查询缓存）',
              '  如果不想为表开启 Data Cache，但想加快 Compaction 速度',
              '  可以开启 BE/CN 节点参数: lake_enable_vertical_compaction_fill_data_cache = true',
              '  该参数让 Compaction 过程中填充缓存，加速后续 Compaction，但不影响查询',
              "  修改方法: UPDATE information_schema.be_configs SET value = 'true' WHERE name = 'lake_enable_vertical_compaction_fill_data_cache';",
            ]
          : [
              '首先检查表的缓存配置: SHOW CREATE TABLE db.table',
              '如果 datacache.enable = false，需要重建表来开启缓存（无法通过 ALTER TABLE 修改）',
              '如果 datacache.enable = true 但 read_local_mb = 0，检查 BE/CN 节点缓存磁盘是否正常',
              '检查 storage_root_path 配置和磁盘空间',
              '',
              '💡 临时加速方案: 如果不想重建表，可以开启 lake_enable_vertical_compaction_fill_data_cache 参数',
              '  该参数让 Compaction 过程填充缓存，加速后续 Compaction（仅影响 Compaction，不影响查询缓存）',
            ],
        example_command:
          database_name && table_name
            ? `-- 方案 1: 重建表并开启缓存\nCREATE TABLE ${database_name}.${table_name}_new LIKE ${database_name}.${table_name};\nALTER TABLE ${database_name}.${table_name}_new SET ('datacache.enable' = 'true');\nINSERT INTO ${database_name}.${table_name}_new SELECT * FROM ${database_name}.${table_name};\n\n-- 方案 2: 仅加速 Compaction（不重建表）\nUPDATE information_schema.be_configs SET value = 'true' WHERE name = 'lake_enable_vertical_compaction_fill_data_cache';`
            : "-- 方案 1: 重建表并开启缓存\nCREATE TABLE <db>.<table>_new LIKE <db>.<table>;\nALTER TABLE <db>.<table>_new SET ('datacache.enable' = 'true');\nINSERT INTO <db>.<table>_new SELECT * FROM <db>.<table>;\n\n-- 方案 2: 仅加速 Compaction（不重建表）\nUPDATE information_schema.be_configs SET value = 'true' WHERE name = 'lake_enable_vertical_compaction_fill_data_cache';",
      });
    }

    // 4. 缓存容量不足
    if (issues.cache_insufficient.length > 0) {
      const highSeverityCount = issues.cache_insufficient.filter(
        (i) => i.severity === 'HIGH',
      ).length;

      recommendations.push({
        issue: '缓存容量不足',
        severity: highSeverityCount > 0 ? 'HIGH' : 'MEDIUM',
        affected_jobs: issues.cache_insufficient.length,
        root_cause:
          '本地缓存容量不足，大量数据需要从对象存储读取 (read_remote_mb >> read_local_mb)',
        solutions: [
          '增加缓存磁盘的容量，扩展 storage_root_path 配置',
          '调整缓存淘汰策略，优先缓存热数据',
          '考虑添加更多 BE/CN 节点以增加总体缓存容量',
          '检查缓存磁盘的使用情况，确保有足够的可用空间',
          '',
          '💡 优化建议: 开启 lake_enable_vertical_compaction_fill_data_cache 参数',
          '  该参数可以让 Compaction 过程填充缓存，提升缓存命中率和 Compaction 效率',
        ],
        example_command:
          "UPDATE information_schema.be_configs SET value = 'true' WHERE name = 'lake_enable_vertical_compaction_fill_data_cache';",
      });
    }

    return recommendations;
  }

  /**
   * 获取 tablet 所属的 database 和 table
   * @param {Connection} connection - 数据库连接
   * @param {Array<number>} tabletIds - tablet ID 列表
   * @returns {Map<number, {database: string, table: string}>} tablet_id -> {database, table} 映射
   */
  async getTabletMetadata(connection, tabletIds) {
    if (!tabletIds || tabletIds.length === 0) {
      return new Map();
    }

    try {
      const tabletIdList = tabletIds.join(',');
      const [rows] = await connection.query(`
        SELECT
          t.TABLET_ID,
          t.TABLE_ID,
          tbl.TABLE_NAME,
          tbl.TABLE_SCHEMA as DATABASE_NAME
        FROM information_schema.tables_config t
        JOIN information_schema.tables tbl
          ON t.TABLE_ID = tbl.TABLE_ID
        WHERE t.TABLET_ID IN (${tabletIdList})
      `);

      const metadataMap = new Map();
      for (const row of rows) {
        metadataMap.set(row.TABLET_ID, {
          database: row.DATABASE_NAME,
          table: row.TABLE_NAME,
        });
      }

      return metadataMap;
    } catch (error) {
      console.warn('获取 tablet 元数据失败:', error.message);
      return new Map();
    }
  }

  /**
   * 通过 SHOW PROC '/compactions' 获取 Compaction Jobs
   */
  async getCompactionJobsFromProc(connection) {
    try {
      const [rows] = await connection.query("SHOW PROC '/compactions'");

      if (!rows || rows.length === 0) {
        console.error('   → 未找到任何 Compaction Jobs');
        return [];
      }

      // 解析返回结果，并提取 database 和 table
      // 实际字段: Partition, TxnID, StartTime, CommitTime, FinishTime, Error, Profile
      const jobs = rows.map((row) => {
        const partitionName = row.Partition || '';

        // 从 Partition 提取 database 和 table
        // 格式: db_name.table_name.partition_id (例如: tpcds_1t.web_returns.123456)
        let database = null;
        let table = null;

        if (partitionName) {
          // 匹配 "db_name.table_name.partition_id"
          const match = partitionName.match(/^([^.]+)\.([^.]+)\./);
          if (match) {
            database = match[1];
            table = match[2];
          }
        }

        return {
          partition_name: partitionName,
          database: database,
          table: table,
          txn_id: row.TxnID,
          start_time: row.StartTime,
          commit_time: row.CommitTime,
          finish_time: row.FinishTime,
          error: row.Error,
          profile: row.Profile,
        };
      });

      console.error(`   → 找到 ${jobs.length} 个 Compaction Jobs`);
      return jobs;
    } catch (error) {
      console.warn('获取 Compaction Jobs 失败:', error.message);
      return [];
    }
  }

  /**
   * 分析 Compaction Job Profile
   * 重点分析: sub_task_count, read_local_sec/mb, read_remote_sec/mb, in_queue_sec
   */
  async analyzeCompactionJobProfile(job, durationHours) {
    try {
      // 解析 Profile 字段 (JSON 格式)
      let profile = null;
      if (job.profile) {
        try {
          profile =
            typeof job.profile === 'string'
              ? JSON.parse(job.profile)
              : job.profile;
        } catch (error) {
          console.error(
            `   ⚠️ Profile 解析失败 (Job ${job.txn_id}):`,
            error.message,
          );
          return {
            success: false,
            error: 'Profile 解析失败',
            duration_hours: durationHours,
          };
        }
      }

      if (!profile) {
        return {
          success: false,
          error: '缺少 Profile 数据',
          duration_hours: durationHours,
        };
      }

      // 提取关键指标
      const sub_task_count = profile.sub_task_count || 0;
      const read_local_sec = profile.read_local_sec || 0;
      const read_local_mb = profile.read_local_mb || 0;
      const read_remote_sec = profile.read_remote_sec || 0;
      const read_remote_mb = profile.read_remote_mb || 0;
      const in_queue_sec = profile.in_queue_sec || 0;

      const total_sec = durationHours * 3600;

      // 计算各阶段占比
      const queue_ratio = total_sec > 0 ? (in_queue_sec / total_sec) * 100 : 0;
      const read_local_ratio =
        total_sec > 0 ? (read_local_sec / total_sec) * 100 : 0;
      const read_remote_ratio =
        total_sec > 0 ? (read_remote_sec / total_sec) * 100 : 0;

      // 计算吞吐量
      const local_throughput_mb_per_sec =
        read_local_sec > 0 ? read_local_mb / read_local_sec : 0;
      const remote_throughput_mb_per_sec =
        read_remote_sec > 0 ? read_remote_mb / read_remote_sec : 0;

      // 识别瓶颈
      let bottleneck = 'unknown';
      let bottleneck_desc = '';

      if (queue_ratio > 50) {
        bottleneck = 'queue_wait';
        bottleneck_desc = `排队等待时间过长 (${queue_ratio.toFixed(1)}%)`;
      } else if (read_remote_ratio > 50) {
        bottleneck = 'remote_read';
        bottleneck_desc = `对象存储读取耗时长 (${read_remote_ratio.toFixed(1)}%), 吞吐量 ${remote_throughput_mb_per_sec.toFixed(1)} MB/s`;
      } else if (read_local_ratio > 30) {
        bottleneck = 'local_read';
        bottleneck_desc = `本地缓存读取耗时长 (${read_local_ratio.toFixed(1)}%)`;
      } else {
        bottleneck = 'other';
        bottleneck_desc = '其他原因 (可能是 CPU/内存/写入等)';
      }

      return {
        success: true,
        duration_hours: durationHours,
        duration_sec: total_sec,
        metrics: {
          sub_task_count,
          read_local_sec,
          read_local_mb,
          read_remote_sec,
          read_remote_mb,
          in_queue_sec,
        },
        ratios: {
          queue_ratio: queue_ratio.toFixed(1) + '%',
          read_local_ratio: read_local_ratio.toFixed(1) + '%',
          read_remote_ratio: read_remote_ratio.toFixed(1) + '%',
        },
        throughput: {
          local_mb_per_sec: local_throughput_mb_per_sec.toFixed(1),
          remote_mb_per_sec: remote_throughput_mb_per_sec.toFixed(1),
        },
        bottleneck: {
          type: bottleneck,
          description: bottleneck_desc,
        },
      };
    } catch (error) {
      console.error('分析 Job Profile 失败:', error);
      return {
        success: false,
        error: error.message,
        duration_hours: durationHours,
      };
    }
  }

  /**
   * 分析单个 Compaction Job 的性能 (旧版本，保持兼容)
   * 通过 Profile 字段分析 Job 执行慢的原因
   */
  async analyzeCompactionJobPerformance(job) {
    try {
      // 只分析已完成的 Job
      if (!job.finish_time || !job.start_time) {
        return null;
      }

      // 计算总耗时
      const startTime = new Date(job.start_time);
      const finishTime = new Date(job.finish_time);
      const durationSec = (finishTime - startTime) / 1000;

      // 只分析耗时超过 60s 的 Job
      if (durationSec < 60) {
        return null;
      }

      console.error(
        `   🔍 分析 Job ${job.txn_id || job.tablet_id}: 耗时 ${durationSec.toFixed(1)}s`,
      );

      // 解析 Profile 字段 (JSON 格式)
      let profile = null;
      if (job.profile) {
        try {
          profile =
            typeof job.profile === 'string'
              ? JSON.parse(job.profile)
              : job.profile;
        } catch (error) {
          console.warn('   ⚠️ Profile 解析失败:', error.message);
          return null;
        }
      }

      if (!profile) {
        return {
          job_id: job.txn_id || job.tablet_id,
          duration_sec: durationSec,
          has_profile: false,
          bottleneck: 'unknown',
          description: 'Job 耗时较长但缺少 Profile 数据',
        };
      }

      // 提取关键性能指标
      const metrics = {
        sub_task_count: profile.sub_task_count || 0,
        read_local_sec: profile.read_local_sec || 0,
        read_local_mb: profile.read_local_mb || 0,
        read_remote_sec: profile.read_remote_sec || 0,
        read_remote_mb: profile.read_remote_mb || 0,
        write_remote_sec: profile.write_remote_sec || 0,
        write_remote_mb: profile.write_remote_mb || 0,
        in_queue_sec: profile.in_queue_sec || 0,
        merge_sec: profile.merge_sec || 0, // 可选：合并耗时
        total_sec: durationSec,
      };

      // 计算各阶段占比
      const phases = {
        queue_ratio: metrics.in_queue_sec / durationSec,
        read_local_ratio: metrics.read_local_sec / durationSec,
        read_remote_ratio: metrics.read_remote_sec / durationSec,
        write_remote_ratio: metrics.write_remote_sec / durationSec,
        merge_ratio: metrics.merge_sec / durationSec,
      };

      // 分析性能瓶颈
      const bottleneck = this.identifyCompactionBottleneck(
        metrics,
        phases,
        durationSec,
      );

      // 计算吞吐量
      const throughput = {
        read_local_mbps:
          metrics.read_local_sec > 0
            ? (metrics.read_local_mb / metrics.read_local_sec).toFixed(2)
            : 'N/A',
        read_remote_mbps:
          metrics.read_remote_sec > 0
            ? (metrics.read_remote_mb / metrics.read_remote_sec).toFixed(2)
            : 'N/A',
        write_remote_mbps:
          metrics.write_remote_sec > 0
            ? (metrics.write_remote_mb / metrics.write_remote_sec).toFixed(2)
            : 'N/A',
      };

      const analysis = {
        job_id: job.txn_id || job.tablet_id,
        partition_name: job.partition_name,
        duration_sec: durationSec,
        has_profile: true,
        metrics,
        phases: {
          queue_pct: (phases.queue_ratio * 100).toFixed(1),
          read_local_pct: (phases.read_local_ratio * 100).toFixed(1),
          read_remote_pct: (phases.read_remote_ratio * 100).toFixed(1),
          write_remote_pct: (phases.write_remote_ratio * 100).toFixed(1),
          merge_pct: (phases.merge_ratio * 100).toFixed(1),
        },
        throughput,
        bottleneck,
        is_slow: durationSec > 300, // 超过 5 分钟算慢
      };

      console.error(
        `   → 瓶颈: ${bottleneck.type} (${bottleneck.description})`,
      );

      return analysis;
    } catch (error) {
      console.warn('分析 Compaction Job 性能失败:', error.message);
      return null;
    }
  }

  /**
   * 识别 Compaction 性能瓶颈
   */
  identifyCompactionBottleneck(metrics, phases, totalSec) {
    const bottlenecks = [];

    // 1. 排队时间过长
    if (phases.queue_ratio > 0.5) {
      bottlenecks.push({
        type: 'queue_wait',
        severity: 'HIGH',
        description: `任务排队时间过长 (${metrics.in_queue_sec.toFixed(1)}s, ${(phases.queue_ratio * 100).toFixed(1)}%)`,
        impact: 'Compaction 任务队列拥堵，可能需要增加 max_tasks 或优化调度',
        recommendation: '增加 lake_compaction_max_tasks 配置值',
      });
    } else if (phases.queue_ratio > 0.3) {
      bottlenecks.push({
        type: 'queue_wait',
        severity: 'MEDIUM',
        description: `任务排队时间较长 (${metrics.in_queue_sec.toFixed(1)}s, ${(phases.queue_ratio * 100).toFixed(1)}%)`,
        impact: 'Compaction 调度有一定延迟',
        recommendation: '监控队列长度，考虑适度增加 max_tasks',
      });
    }

    // 2. 远程读取慢
    if (phases.read_remote_ratio > 0.4 && metrics.read_remote_sec > 60) {
      const mbps =
        metrics.read_remote_sec > 0
          ? metrics.read_remote_mb / metrics.read_remote_sec
          : 0;
      bottlenecks.push({
        type: 'slow_remote_read',
        severity: mbps < 50 ? 'HIGH' : 'MEDIUM',
        description: `对象存储读取慢 (${metrics.read_remote_sec.toFixed(1)}s, ${metrics.read_remote_mb.toFixed(0)}MB, ${mbps.toFixed(1)} MB/s)`,
        impact: '对象存储 I/O 性能不足或网络带宽受限',
        recommendation:
          mbps < 50
            ? '检查对象存储性能和网络带宽，考虑使用更高性能的存储'
            : '适当增加本地缓存以减少远程读取',
      });
    }

    // 3. 远程写入慢
    if (phases.write_remote_ratio > 0.4 && metrics.write_remote_sec > 60) {
      const mbps =
        metrics.write_remote_sec > 0
          ? metrics.write_remote_mb / metrics.write_remote_sec
          : 0;
      bottlenecks.push({
        type: 'slow_remote_write',
        severity: mbps < 30 ? 'HIGH' : 'MEDIUM',
        description: `对象存储写入慢 (${metrics.write_remote_sec.toFixed(1)}s, ${metrics.write_remote_mb.toFixed(0)}MB, ${mbps.toFixed(1)} MB/s)`,
        impact: '对象存储写入性能不足',
        recommendation:
          mbps < 30
            ? '检查对象存储写入性能，考虑升级存储服务'
            : '监控对象存储性能指标',
      });
    }

    // 4. 本地缓存命中率低
    const totalReadMB = metrics.read_local_mb + metrics.read_remote_mb;
    const cacheHitRatio =
      totalReadMB > 0 ? metrics.read_local_mb / totalReadMB : 0;
    if (cacheHitRatio < 0.2 && metrics.read_remote_mb > 100) {
      bottlenecks.push({
        type: 'low_cache_hit',
        severity: 'MEDIUM',
        description: `本地缓存命中率低 (${(cacheHitRatio * 100).toFixed(1)}%, 远程读取 ${metrics.read_remote_mb.toFixed(0)}MB)`,
        impact: '大量数据从对象存储读取，增加延迟',
        recommendation: '增加 BE 节点的缓存容量配置',
      });
    }

    // 5. 数据量大导致的正常慢
    const totalDataMB =
      metrics.read_local_mb + metrics.read_remote_mb + metrics.write_remote_mb;
    if (totalDataMB > 10000 && bottlenecks.length === 0) {
      bottlenecks.push({
        type: 'large_data_volume',
        severity: 'INFO',
        description: `数据量大 (总计 ${(totalDataMB / 1024).toFixed(1)}GB)，耗时在合理范围`,
        impact: '无显著性能问题，耗时主要由数据量决定',
        recommendation: '这是正常情况，可以继续监控',
      });
    }

    // 6. 如果没有明显瓶颈但耗时很长
    if (bottlenecks.length === 0 && totalSec > 300) {
      bottlenecks.push({
        type: 'unknown_slow',
        severity: 'MEDIUM',
        description: `耗时较长 (${totalSec.toFixed(1)}s) 但无明显瓶颈`,
        impact: '可能存在其他性能问题',
        recommendation: '查看 BE 节点日志和系统资源使用情况',
      });
    }

    // 返回最严重的瓶颈
    if (bottlenecks.length > 0) {
      bottlenecks.sort((a, b) => {
        const severityOrder = { HIGH: 3, MEDIUM: 2, INFO: 1, LOW: 0 };
        return (
          (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
        );
      });
      return bottlenecks[0];
    }

    return {
      type: 'normal',
      severity: 'INFO',
      description: '性能正常',
      impact: '无明显性能问题',
      recommendation: '继续监控',
    };
  }

  /**
   * 分析未完成的 Compaction Job（FinishTime 为空）
   * 查询该 job 的所有 task，分析未完成原因
   */
  async analyzeUnfinishedCompactionJob(connection, job) {
    try {
      if (!job.txn_id) {
        console.warn('   ⚠️ Job 缺少 TxnID，无法分析');
        return null;
      }

      console.error(`   🔍 分析未完成 Job (TxnID=${job.txn_id})...`);

      // 查询该 Job 的所有 Task
      const query = `
        SELECT
          TXN_ID,
          TABLET_ID,
          BE_ID,
          START_TIME,
          FINISH_TIME,
          PROGRESS,
          RUNS,
          STATE,
          ERROR_MSG
        FROM information_schema.be_cloud_native_compactions
        WHERE TXN_ID = ?
        ORDER BY TABLET_ID
      `;

      const [tasks] = await connection.query(query, [job.txn_id]);

      if (!tasks || tasks.length === 0) {
        return {
          job_id: job.txn_id,
          total_tasks: 0,
          status: 'no_tasks_found',
          description: '未找到该 Job 的 Task 记录，可能已被清理或尚未创建',
        };
      }

      const totalTasks = tasks.length;

      // 分类统计
      const completedTasks = tasks.filter((t) => t.PROGRESS === 100);
      const runningTasks = tasks.filter(
        (t) => t.PROGRESS < 100 && t.START_TIME && !t.FINISH_TIME,
      );
      const pendingTasks = tasks.filter((t) => !t.START_TIME);
      const failedTasks = tasks.filter(
        (t) => t.STATE === 'FAILED' || t.ERROR_MSG,
      );

      // 分析重试情况
      const highRetryTasks = tasks.filter((t) => t.RUNS > 3);
      const mediumRetryTasks = tasks.filter((t) => t.RUNS >= 2 && t.RUNS <= 3);

      // 按 BE 分组统计重试任务
      const retryTasksByBE = {};
      highRetryTasks.forEach((task) => {
        const beId = task.BE_ID;
        if (!retryTasksByBE[beId]) {
          retryTasksByBE[beId] = { high_retry_count: 0, tasks: [] };
        }
        retryTasksByBE[beId].high_retry_count++;
        retryTasksByBE[beId].tasks.push({
          tablet_id: task.TABLET_ID,
          runs: task.RUNS,
          progress: task.PROGRESS,
        });
      });

      // 识别问题
      const issues = [];

      // 1. 大量任务未开始（START_TIME 为空）
      if (pendingTasks.length > 0) {
        const pendingRatio = pendingTasks.length / totalTasks;
        issues.push({
          type: 'tasks_not_started',
          severity: pendingRatio > 0.5 ? 'HIGH' : 'MEDIUM',
          description: `${pendingTasks.length}/${totalTasks} 个 Task 未开始执行 (${(pendingRatio * 100).toFixed(1)}%)`,
          impact: '任务在队列中等待，未被调度执行',
          root_cause: 'BE 节点的 compact_threads 配置可能过小，处理能力不足',
          affected_be_nodes: [...new Set(pendingTasks.map((t) => t.BE_ID))],
          recommendation: [
            '检查 BE 节点的 compact_threads 配置',
            '考虑增加线程数以提高并发处理能力',
            '查看 BE 节点资源使用情况（CPU、内存）',
          ],
        });
      }

      // 2. 高重试次数任务（RUNS > 3）
      if (highRetryTasks.length > 0) {
        const affectedBEs = Object.keys(retryTasksByBE);
        issues.push({
          type: 'high_retry_tasks',
          severity: 'HIGH',
          description: `${highRetryTasks.length} 个 Task 重试次数超过 3 次`,
          impact: '任务反复失败重试，表明存在持续性问题',
          root_cause: 'BE 节点内存不足导致 Compaction 任务反复失败',
          affected_be_nodes: affectedBEs,
          be_retry_details: retryTasksByBE,
          recommendation: [
            '检查受影响 BE 节点的内存使用情况',
            '考虑增加 BE 节点内存或减少其他内存密集型操作',
            '调整 Compaction 相关内存参数（如单任务内存限制）',
            '查看 BE 日志中的 OOM 或内存不足相关错误',
          ],
        });
      }

      // 3. 中等重试次数任务（2-3 次）
      if (mediumRetryTasks.length > 0 && highRetryTasks.length === 0) {
        issues.push({
          type: 'medium_retry_tasks',
          severity: 'MEDIUM',
          description: `${mediumRetryTasks.length} 个 Task 有 2-3 次重试`,
          impact: '部分任务遇到临时性问题',
          root_cause: '可能是内存压力、网络抖动或临时资源竞争',
          recommendation: [
            '监控 BE 节点资源使用趋势',
            '检查是否有其他高负载操作与 Compaction 冲突',
          ],
        });
      }

      // 4. 失败任务
      if (failedTasks.length > 0) {
        const errorMessages = [
          ...new Set(failedTasks.map((t) => t.ERROR_MSG).filter((msg) => msg)),
        ];
        issues.push({
          type: 'failed_tasks',
          severity: 'CRITICAL',
          description: `${failedTasks.length} 个 Task 处于失败状态`,
          impact: 'Job 无法完成，Compaction Score 将继续上升',
          error_messages: errorMessages.slice(0, 3), // 最多显示 3 种错误
          recommendation: [
            '查看具体错误信息定位根因',
            '检查数据完整性和元数据状态',
            '考虑手动清理问题数据或重启相关 BE 节点',
          ],
        });
      }

      // 5. 进度缓慢的运行中任务
      const slowRunningTasks = runningTasks.filter((t) => {
        if (!t.START_TIME) return false;
        const startTime = new Date(t.START_TIME);
        const now = new Date();
        const durationMin = (now - startTime) / (1000 * 60);
        const progress = t.PROGRESS || 0;
        const progressRate = durationMin > 0 ? progress / durationMin : 0;
        return durationMin > 10 && progressRate < 5; // 运行超过 10 分钟且进度速率 < 5%/分钟
      });

      if (slowRunningTasks.length > 0) {
        issues.push({
          type: 'slow_running_tasks',
          severity: 'MEDIUM',
          description: `${slowRunningTasks.length} 个 Task 运行缓慢`,
          impact: '整体 Job 完成时间被拉长',
          recommendation: [
            '检查这些 Task 所在 BE 节点的 I/O 性能',
            '查看对象存储访问延迟',
            '确认是否有大量数据需要处理',
          ],
        });
      }

      // 综合评估
      let overallStatus = 'running';
      let overallSeverity = 'INFO';

      if (failedTasks.length > 0) {
        overallStatus = 'failing';
        overallSeverity = 'CRITICAL';
      } else if (highRetryTasks.length > 0) {
        overallStatus = 'struggling';
        overallSeverity = 'HIGH';
      } else if (pendingTasks.length > totalTasks * 0.5) {
        overallStatus = 'stuck';
        overallSeverity = 'HIGH';
      } else if (runningTasks.length > 0) {
        overallStatus = 'progressing';
        overallSeverity = 'INFO';
      }

      const analysis = {
        job_id: job.txn_id,
        partition_name: job.partition_name,
        overall_status: overallStatus,
        overall_severity: overallSeverity,
        statistics: {
          total_tasks: totalTasks,
          completed_tasks: completedTasks.length,
          running_tasks: runningTasks.length,
          pending_tasks: pendingTasks.length,
          failed_tasks: failedTasks.length,
          completion_ratio:
            ((completedTasks.length / totalTasks) * 100).toFixed(1) + '%',
        },
        retry_analysis: {
          high_retry_tasks: highRetryTasks.length,
          medium_retry_tasks: mediumRetryTasks.length,
          affected_be_count: Object.keys(retryTasksByBE).length,
          be_details: retryTasksByBE,
        },
        issues: issues,
        summary: this.generateUnfinishedJobSummary(
          overallStatus,
          issues,
          totalTasks,
          completedTasks.length,
        ),
      };

      console.error(
        `   → 状态: ${overallStatus}, 完成进度: ${analysis.statistics.completion_ratio}, 发现 ${issues.length} 个问题`,
      );

      return analysis;
    } catch (error) {
      console.warn('分析未完成 Job 失败:', error.message);
      return {
        job_id: job.txn_id,
        error: error.message,
        status: 'analysis_failed',
      };
    }
  }

  /**
   * 生成未完成 Job 的摘要说明
   */
  generateUnfinishedJobSummary(status, issues, totalTasks, completedTasks) {
    const statusDescriptions = {
      running: '正常运行中',
      progressing: '正在推进',
      stuck: '任务调度受阻',
      struggling: '任务执行困难（高重试）',
      failing: '存在失败任务',
    };

    const baseDesc = statusDescriptions[status] || '状态未知';
    const progressDesc = `${completedTasks}/${totalTasks} 个 Task 已完成`;

    if (issues.length === 0) {
      return `${baseDesc}，${progressDesc}，未发现明显问题`;
    }

    const criticalIssues = issues.filter(
      (i) => i.severity === 'CRITICAL',
    ).length;
    const highIssues = issues.filter((i) => i.severity === 'HIGH').length;

    let issueSummary = '';
    if (criticalIssues > 0) {
      issueSummary = `发现 ${criticalIssues} 个严重问题`;
    } else if (highIssues > 0) {
      issueSummary = `发现 ${highIssues} 个高优先级问题`;
    } else {
      issueSummary = `发现 ${issues.length} 个需要关注的问题`;
    }

    return `${baseDesc}，${progressDesc}，${issueSummary}`;
  }

  /**
   * 分析 Compaction 队列情况
   * 检查有多少分区在等待 compaction，并判断是否因为 lake_compaction_max_tasks 不足
   */
  async analyzeCompactionQueue(connection, currentPartitionCS) {
    try {
      // 1. 查询所有 CS >= currentPartitionCS 的分区（这些分区优先级更高或相同）
      const query = `
        SELECT
          DB_NAME,
          TABLE_NAME,
          PARTITION_NAME,
          MAX_CS as compaction_score,
          BUCKETS as bucket_count
        FROM information_schema.partitions_meta
        WHERE MAX_CS >= ?
        ORDER BY MAX_CS DESC
      `;

      const [partitions] = await connection.query(query, [currentPartitionCS]);

      if (!partitions || partitions.length === 0) {
        return {
          partitions_waiting: 0,
          total_buckets_waiting: 0,
          is_queue_saturated: false,
        };
      }

      // 2. 计算等待的分区总数和总分桶数
      const partitionsWaiting = partitions.length;
      const totalBucketsWaiting = partitions.reduce(
        (sum, p) => sum + (p.bucket_count || 0),
        0,
      );

      console.error(
        `   → 发现 ${partitionsWaiting} 个分区 CS >= ${currentPartitionCS}，总分桶数: ${totalBucketsWaiting}`,
      );

      // 3. 获取 FE 配置的 lake_compaction_max_tasks
      const [feConfig] = await connection.query(
        "ADMIN SHOW FRONTEND CONFIG LIKE 'lake_compaction_max_tasks'",
      );

      let maxTasks = 100; // 默认值
      let isAdaptive = false;
      let recommendedMaxTasks = null;

      if (feConfig && feConfig.length > 0) {
        const configValue = parseInt(feConfig[0].Value);

        if (configValue === -1) {
          // 自适应模式：BE/CN 节点数 * 16
          isAdaptive = true;
          console.error(`   → lake_compaction_max_tasks = -1 (自适应模式)`);

          // 获取 BE/CN 节点数
          const nodeCount = await this.getCompactionNodeCount(connection);
          maxTasks = nodeCount * 16;
          console.error(
            `   → 自适应计算: ${nodeCount} 节点 × 16 = ${maxTasks}`,
          );
        } else if (configValue === 0) {
          // 禁用 compaction
          return {
            partitions_waiting: partitionsWaiting,
            total_buckets_waiting: totalBucketsWaiting,
            is_queue_saturated: true,
            max_tasks_config: 0,
            is_adaptive: false,
            saturation_reason:
              'Compaction 已被禁用 (lake_compaction_max_tasks = 0)',
          };
        } else {
          maxTasks = configValue;
          console.error(
            `   → lake_compaction_max_tasks = ${maxTasks} (固定值)`,
          );
        }
      }

      // 4. 判断队列是否饱和
      // 考虑到每个分区的分桶都需要 compaction job，所以用总分桶数与 max_tasks 对比
      const isSaturated = totalBucketsWaiting > maxTasks;

      // 5. 计算推荐的 max_tasks 值
      if (isSaturated && !isAdaptive) {
        // 如果队列饱和且不是自适应模式，建议调整为能容纳所有等待分区的值
        recommendedMaxTasks = Math.max(
          64, // 最小建议值
          Math.ceil(totalBucketsWaiting * 1.2), // 留 20% 余量
        );
      }

      const result = {
        partitions_waiting: partitionsWaiting,
        total_buckets_waiting: totalBucketsWaiting,
        is_queue_saturated: isSaturated,
        max_tasks_config: maxTasks,
        is_adaptive: isAdaptive,
        saturation_ratio: (totalBucketsWaiting / maxTasks).toFixed(2),
        recommended_max_tasks: recommendedMaxTasks,
      };

      if (isSaturated) {
        console.error(
          `   ⚠️ Compaction 队列已饱和: ${totalBucketsWaiting} 个分桶等待 vs ${maxTasks} max_tasks (${result.saturation_ratio}x)`,
        );
        if (recommendedMaxTasks) {
          console.error(
            `   💡 建议调整 lake_compaction_max_tasks 为: ${recommendedMaxTasks}`,
          );
        }
      } else {
        console.error(
          `   ✅ Compaction 队列正常: ${totalBucketsWaiting} 个分桶等待 vs ${maxTasks} max_tasks (${result.saturation_ratio}x)`,
        );
      }

      return result;
    } catch (error) {
      console.warn('分析 Compaction 队列失败:', error.message);
      return null;
    }
  }

  /**
   * 获取参与 Compaction 的节点数量（BE + CN）
   */
  async getCompactionNodeCount(connection) {
    try {
      // 获取 BE 节点数
      const [beNodes] = await connection.query('SHOW BACKENDS');
      const beCount = beNodes ? beNodes.length : 0;

      // 获取 CN 节点数
      let cnCount = 0;
      try {
        const [cnNodes] = await connection.query('SHOW COMPUTE NODES');
        cnCount = cnNodes ? cnNodes.length : 0;
      } catch (error) {
        // 如果不支持 CN，忽略错误
        console.warn('获取 CN 节点失败 (可能不支持):', error.message);
      }

      const totalCount = beCount + cnCount;
      console.error(
        `   → 节点统计: ${beCount} BE + ${cnCount} CN = ${totalCount} 节点`,
      );

      return totalCount;
    } catch (error) {
      console.warn('获取节点数量失败:', error.message);
      return 4; // 返回默认值
    }
  }

  /**
   * 获取指定 Tablet 的 Compaction Score
   */
  async getTabletCompactionScore(connection, tabletId) {
    try {
      // 从 partitions_meta 表查询该 tablet 所属分区的 compaction score
      const query = `
        SELECT MAX_CS as max_compaction_score
        FROM information_schema.partitions_meta pm
        WHERE EXISTS (
          SELECT 1
          FROM information_schema.tables_config tc
          WHERE tc.TABLE_ID = pm.TABLE_ID
            AND tc.TABLET_ID = ?
        )
        LIMIT 1
      `;

      const [rows] = await connection.query(query, [tabletId]);

      if (rows && rows.length > 0) {
        return rows[0].max_compaction_score;
      }

      // 如果上面的查询失败，尝试另一种方式
      const altQuery = `
        SELECT MAX_CS
        FROM information_schema.partitions_meta
        WHERE CONCAT(DB_NAME, '.', TABLE_NAME) IN (
          SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME)
          FROM information_schema.tables_config
          WHERE TABLET_ID = ?
        )
        LIMIT 1
      `;

      const [altRows] = await connection.query(altQuery, [tabletId]);

      if (altRows && altRows.length > 0) {
        return altRows[0].MAX_CS;
      }

      return null;
    } catch (error) {
      console.warn(
        `获取 Tablet ${tabletId} Compaction Score 失败:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * 分析慢任务概览
   */
  analyzeSlowTasksOverview(slowTasks, totalTasks) {
    const stalledTasks = slowTasks.filter((t) => t.is_stalled);
    const verySlowTasks = slowTasks.filter((t) => t.duration_hours > 4);

    // 统计不同 CS 状态的任务
    const tasksWithJob = slowTasks.filter((t) => t.has_job);
    const tasksNoJobLowCS = slowTasks.filter(
      (t) => t.cs_status === 'low_cs_no_job_needed',
    );
    const tasksNoJobHighCS = slowTasks.filter(
      (t) => t.cs_status === 'high_cs_no_job_found',
    );
    const tasksNoJobUnknownCS = slowTasks.filter(
      (t) => !t.has_job && t.cs_status === 'unknown',
    );

    return {
      slow_task_ratio:
        totalTasks > 0
          ? ((slowTasks.length / totalTasks) * 100).toFixed(1) + '%'
          : '0%',
      stalled_tasks_count: stalledTasks.length,
      very_slow_tasks_count: verySlowTasks.length,
      severity_level: this.calculateSlowTaskSeverity(slowTasks, totalTasks),
      // 新增：compaction job 关联统计
      job_correlation: {
        tasks_with_job: tasksWithJob.length,
        tasks_no_job_low_cs: tasksNoJobLowCS.length, // CS < 10, 正常
        tasks_no_job_high_cs: tasksNoJobHighCS.length, // CS >= 10, 异常
        tasks_no_job_unknown_cs: tasksNoJobUnknownCS.length,
      },
    };
  }

  /**
   * 聚合多个 Job 的性能瓶颈统计
   */
  aggregateJobBottlenecks(tasksWithJobAnalyses) {
    const stats = {
      queue_wait: {
        count: 0,
        high_severity_count: 0,
        avg_queue_ratio: 0,
        max_queue_sec: 0,
        samples: [],
      },
      slow_remote_read: {
        count: 0,
        high_severity_count: 0,
        avg_throughput: 0,
        min_throughput: Infinity,
        total_data_mb: 0,
        samples: [],
      },
      slow_remote_write: {
        count: 0,
        high_severity_count: 0,
        avg_throughput: 0,
        min_throughput: Infinity,
        total_data_mb: 0,
        samples: [],
      },
      low_cache_hit: {
        count: 0,
        avg_cache_hit_ratio: 0,
        min_cache_hit_ratio: 100,
        avg_remote_read_mb: 0,
        samples: [],
      },
      large_data_volume: {
        count: 0,
        avg_total_data_mb: 0,
        max_total_data_mb: 0,
        samples: [],
      },
    };

    const bottleneckCounts = {
      queue_wait: [],
      slow_remote_read: [],
      slow_remote_write: [],
      low_cache_hit: [],
      large_data_volume: [],
    };

    // 遍历所有任务的 job 分析结果
    tasksWithJobAnalyses.forEach((task) => {
      // 兼容两种数据结构
      const jobAnalysesList = task.performance_analysis
        ? [task.performance_analysis] // 历史任务：单个对象
        : task.job_analyses || []; // 运行任务：数组

      jobAnalysesList.forEach((jobAnalysis) => {
        const bottleneck = jobAnalysis.bottleneck;
        if (!bottleneck) return;

        // 队列等待
        if (bottleneck.type === 'queue_wait') {
          stats.queue_wait.count++;
          if (bottleneck.severity === 'HIGH')
            stats.queue_wait.high_severity_count++;

          const queueRatio = jobAnalysis.phases.queue_ratio || 0;
          const queueSec = jobAnalysis.metrics.in_queue_sec || 0;
          bottleneckCounts.queue_wait.push(queueRatio);
          stats.queue_wait.max_queue_sec = Math.max(
            stats.queue_wait.max_queue_sec,
            queueSec,
          );

          if (stats.queue_wait.samples.length < 5) {
            stats.queue_wait.samples.push({
              tablet_id: task.tablet_id,
              job_id: jobAnalysis.job_id,
              queue_sec: queueSec.toFixed(0),
              queue_ratio: queueRatio.toFixed(1) + '%',
              severity: bottleneck.severity,
            });
          }
        }

        // 远程读取慢
        if (bottleneck.type === 'slow_remote_read') {
          stats.slow_remote_read.count++;
          if (bottleneck.severity === 'HIGH')
            stats.slow_remote_read.high_severity_count++;

          const readThroughput =
            jobAnalysis.throughput.read_remote_mb_per_sec || 0;
          const readDataMB = jobAnalysis.metrics.read_remote_mb || 0;

          bottleneckCounts.slow_remote_read.push(readThroughput);
          stats.slow_remote_read.min_throughput = Math.min(
            stats.slow_remote_read.min_throughput,
            readThroughput,
          );
          stats.slow_remote_read.total_data_mb += readDataMB;

          if (stats.slow_remote_read.samples.length < 5) {
            stats.slow_remote_read.samples.push({
              tablet_id: task.tablet_id,
              job_id: jobAnalysis.job_id,
              throughput: readThroughput.toFixed(1) + ' MB/s',
              data_mb: readDataMB.toFixed(0),
              severity: bottleneck.severity,
            });
          }
        }

        // 远程写入慢
        if (bottleneck.type === 'slow_remote_write') {
          stats.slow_remote_write.count++;
          if (bottleneck.severity === 'HIGH')
            stats.slow_remote_write.high_severity_count++;

          const writeThroughput =
            jobAnalysis.throughput.write_remote_mb_per_sec || 0;
          const writeDataMB = jobAnalysis.metrics.write_remote_mb || 0;

          bottleneckCounts.slow_remote_write.push(writeThroughput);
          stats.slow_remote_write.min_throughput = Math.min(
            stats.slow_remote_write.min_throughput,
            writeThroughput,
          );
          stats.slow_remote_write.total_data_mb += writeDataMB;

          if (stats.slow_remote_write.samples.length < 5) {
            stats.slow_remote_write.samples.push({
              tablet_id: task.tablet_id,
              job_id: jobAnalysis.job_id,
              throughput: writeThroughput.toFixed(1) + ' MB/s',
              data_mb: writeDataMB.toFixed(0),
              severity: bottleneck.severity,
            });
          }
        }

        // 缓存命中率低
        if (bottleneck.type === 'low_cache_hit') {
          stats.low_cache_hit.count++;

          const cacheHitRatio = jobAnalysis.cache_hit_ratio || 0;
          const remoteReadMB = jobAnalysis.metrics.read_remote_mb || 0;

          bottleneckCounts.low_cache_hit.push(cacheHitRatio);
          stats.low_cache_hit.min_cache_hit_ratio = Math.min(
            stats.low_cache_hit.min_cache_hit_ratio,
            cacheHitRatio,
          );
          stats.low_cache_hit.avg_remote_read_mb += remoteReadMB;

          if (stats.low_cache_hit.samples.length < 5) {
            stats.low_cache_hit.samples.push({
              tablet_id: task.tablet_id,
              job_id: jobAnalysis.job_id,
              cache_hit_ratio: cacheHitRatio.toFixed(1) + '%',
              remote_read_mb: remoteReadMB.toFixed(0),
            });
          }
        }

        // 大数据量
        if (bottleneck.type === 'large_data_volume') {
          stats.large_data_volume.count++;

          const totalDataMB =
            (jobAnalysis.metrics.read_remote_mb || 0) +
            (jobAnalysis.metrics.read_local_mb || 0);

          bottleneckCounts.large_data_volume.push(totalDataMB);
          stats.large_data_volume.max_total_data_mb = Math.max(
            stats.large_data_volume.max_total_data_mb,
            totalDataMB,
          );

          if (stats.large_data_volume.samples.length < 5) {
            stats.large_data_volume.samples.push({
              tablet_id: task.tablet_id,
              job_id: jobAnalysis.job_id,
              total_data_gb: (totalDataMB / 1024).toFixed(2),
              duration_min: jobAnalysis.duration_min.toFixed(1),
            });
          }
        }
      });
    });

    // 计算平均值
    if (bottleneckCounts.queue_wait.length > 0) {
      stats.queue_wait.avg_queue_ratio =
        bottleneckCounts.queue_wait.reduce((a, b) => a + b, 0) /
        bottleneckCounts.queue_wait.length;
    }

    if (bottleneckCounts.slow_remote_read.length > 0) {
      stats.slow_remote_read.avg_throughput =
        bottleneckCounts.slow_remote_read.reduce((a, b) => a + b, 0) /
        bottleneckCounts.slow_remote_read.length;
      if (stats.slow_remote_read.min_throughput === Infinity) {
        stats.slow_remote_read.min_throughput = 0;
      }
    }

    if (bottleneckCounts.slow_remote_write.length > 0) {
      stats.slow_remote_write.avg_throughput =
        bottleneckCounts.slow_remote_write.reduce((a, b) => a + b, 0) /
        bottleneckCounts.slow_remote_write.length;
      if (stats.slow_remote_write.min_throughput === Infinity) {
        stats.slow_remote_write.min_throughput = 0;
      }
    }

    if (bottleneckCounts.low_cache_hit.length > 0) {
      stats.low_cache_hit.avg_cache_hit_ratio =
        bottleneckCounts.low_cache_hit.reduce((a, b) => a + b, 0) /
        bottleneckCounts.low_cache_hit.length;
      stats.low_cache_hit.avg_remote_read_mb /= stats.low_cache_hit.count;
    }

    if (bottleneckCounts.large_data_volume.length > 0) {
      stats.large_data_volume.avg_total_data_mb =
        bottleneckCounts.large_data_volume.reduce((a, b) => a + b, 0) /
        bottleneckCounts.large_data_volume.length;
    }

    return stats;
  }

  /**
   * 聚合多个未完成 Job 的问题统计
   */
  aggregateUnfinishedJobIssues(tasksWithUnfinishedJobs) {
    const issues = {
      tasks_not_started: {
        count: 0,
        severity: 'MEDIUM',
        affected_jobs: 0,
        total_pending_tasks: 0,
        affected_be_nodes: new Set(),
        samples: [],
      },
      high_retry_tasks: {
        count: 0,
        affected_jobs: 0,
        total_retry_tasks: 0,
        max_retry_count: 0,
        affected_be_nodes: new Set(),
        be_retry_stats: {},
        samples: [],
      },
      failed_tasks: {
        count: 0,
        affected_jobs: 0,
        total_failed_tasks: 0,
        error_types: new Set(),
        sample_errors: [],
        samples: [],
      },
      slow_running_tasks: {
        count: 0,
        affected_jobs: 0,
        total_slow_tasks: 0,
        avg_progress_rate: 0,
        progress_rates: [],
        samples: [],
      },
    };

    // 遍历所有任务的未完成 job 分析结果
    tasksWithUnfinishedJobs.forEach((task) => {
      task.unfinished_job_analyses.forEach((jobAnalysis) => {
        if (!jobAnalysis.issues) return;

        // 检查每种问题类型
        jobAnalysis.issues.forEach((issue) => {
          switch (issue.type) {
            case 'tasks_not_started': {
              if (
                issues.tasks_not_started.count === 0 ||
                issue.severity === 'HIGH'
              ) {
                issues.tasks_not_started.severity = issue.severity;
              }
              issues.tasks_not_started.count++;
              issues.tasks_not_started.affected_jobs++;

              const pendingCount =
                parseInt(issue.description.match(/(\d+)\/\d+ 个 Task/)?.[1]) ||
                0;
              issues.tasks_not_started.total_pending_tasks += pendingCount;

              if (issue.affected_be_nodes) {
                issue.affected_be_nodes.forEach((beId) =>
                  issues.tasks_not_started.affected_be_nodes.add(beId),
                );
              }

              if (issues.tasks_not_started.samples.length < 5) {
                issues.tasks_not_started.samples.push({
                  job_id: jobAnalysis.job_id,
                  pending_tasks: pendingCount,
                  total_tasks: jobAnalysis.statistics?.total_tasks,
                  severity: issue.severity,
                });
              }
              break;
            }

            case 'high_retry_tasks': {
              issues.high_retry_tasks.count++;
              issues.high_retry_tasks.affected_jobs++;

              const retryCount =
                parseInt(issue.description.match(/(\d+) 个 Task/)?.[1]) || 0;
              issues.high_retry_tasks.total_retry_tasks += retryCount;

              if (issue.be_retry_details) {
                Object.entries(issue.be_retry_details).forEach(
                  ([beId, details]) => {
                    issues.high_retry_tasks.affected_be_nodes.add(beId);

                    if (!issues.high_retry_tasks.be_retry_stats[beId]) {
                      issues.high_retry_tasks.be_retry_stats[beId] = {
                        high_retry_count: 0,
                        max_runs: 0,
                      };
                    }

                    issues.high_retry_tasks.be_retry_stats[
                      beId
                    ].high_retry_count += details.high_retry_count;

                    if (details.tasks && details.tasks.length > 0) {
                      const maxRuns = Math.max(
                        ...details.tasks.map((t) => t.runs || 0),
                      );
                      issues.high_retry_tasks.be_retry_stats[beId].max_runs =
                        Math.max(
                          issues.high_retry_tasks.be_retry_stats[beId].max_runs,
                          maxRuns,
                        );
                      issues.high_retry_tasks.max_retry_count = Math.max(
                        issues.high_retry_tasks.max_retry_count,
                        maxRuns,
                      );
                    }
                  },
                );
              }

              if (issues.high_retry_tasks.samples.length < 5) {
                issues.high_retry_tasks.samples.push({
                  job_id: jobAnalysis.job_id,
                  retry_tasks: retryCount,
                  affected_be_nodes: issue.affected_be_nodes || [],
                });
              }
              break;
            }

            case 'failed_tasks': {
              issues.failed_tasks.count++;
              issues.failed_tasks.affected_jobs++;

              const failedCount =
                parseInt(issue.description.match(/(\d+) 个 Task/)?.[1]) || 0;
              issues.failed_tasks.total_failed_tasks += failedCount;

              if (issue.error_messages) {
                issue.error_messages.forEach((msg) => {
                  if (msg) {
                    issues.failed_tasks.error_types.add(msg);
                    if (issues.failed_tasks.sample_errors.length < 5) {
                      issues.failed_tasks.sample_errors.push({
                        job_id: jobAnalysis.job_id,
                        error: msg,
                      });
                    }
                  }
                });
              }

              if (issues.failed_tasks.samples.length < 5) {
                issues.failed_tasks.samples.push({
                  job_id: jobAnalysis.job_id,
                  failed_tasks: failedCount,
                });
              }
              break;
            }

            case 'slow_running_tasks': {
              issues.slow_running_tasks.count++;
              issues.slow_running_tasks.affected_jobs++;

              const slowCount =
                parseInt(issue.description.match(/(\d+) 个 Task/)?.[1]) || 0;
              issues.slow_running_tasks.total_slow_tasks += slowCount;

              if (issues.slow_running_tasks.samples.length < 5) {
                issues.slow_running_tasks.samples.push({
                  job_id: jobAnalysis.job_id,
                  slow_tasks: slowCount,
                });
              }
              break;
            }
          }
        });
      });
    });

    // 转换 Set 为数组
    issues.tasks_not_started.affected_be_nodes = Array.from(
      issues.tasks_not_started.affected_be_nodes,
    );
    issues.high_retry_tasks.affected_be_nodes = Array.from(
      issues.high_retry_tasks.affected_be_nodes,
    );
    issues.failed_tasks.error_types = Array.from(
      issues.failed_tasks.error_types,
    );

    // 计算平均进度速率
    if (issues.slow_running_tasks.progress_rates.length > 0) {
      issues.slow_running_tasks.avg_progress_rate =
        issues.slow_running_tasks.progress_rates.reduce((a, b) => a + b, 0) /
        issues.slow_running_tasks.progress_rates.length;
    }

    return issues;
  }

  /**
   * 分析慢任务根因
   */
  async analyzeSlowTaskRootCauses(connection, slowTasks) {
    const causes = [];

    // 1. 分析已完成的 Compaction Job 的性能瓶颈
    // 兼容两种数据结构：
    // - 历史任务: performance_analysis (单个对象)
    // - 运行任务: job_analyses (数组)
    const tasksWithJobAnalyses = slowTasks.filter((t) => {
      // 历史任务：有 performance_analysis
      if (t.performance_analysis) return true;
      // 运行任务：有 job_analyses 数组
      if (t.job_analyses && t.job_analyses.length > 0) return true;
      return false;
    });

    if (tasksWithJobAnalyses.length > 0) {
      // 收集所有 job 分析中的瓶颈
      const bottleneckStats =
        this.aggregateJobBottlenecks(tasksWithJobAnalyses);

      // 队列等待瓶颈
      if (bottleneckStats.queue_wait.count > 0) {
        causes.push({
          type: 'job_profile_queue_wait',
          severity:
            bottleneckStats.queue_wait.high_severity_count > 0
              ? 'HIGH'
              : 'MEDIUM',
          description: `${bottleneckStats.queue_wait.count} 个已完成的 Job 存在显著的队列等待时间`,
          details: {
            affected_jobs: bottleneckStats.queue_wait.count,
            high_severity_jobs: bottleneckStats.queue_wait.high_severity_count,
            avg_queue_ratio:
              bottleneckStats.queue_wait.avg_queue_ratio.toFixed(1) + '%',
            max_queue_sec:
              bottleneckStats.queue_wait.max_queue_sec.toFixed(0) + 's',
            sample_jobs: bottleneckStats.queue_wait.samples.slice(0, 3),
          },
          impact: '任务在队列中等待时间过长，实际执行时间被延迟',
          root_cause:
            'Compaction 队列拥塞，可能是 lake_compaction_max_tasks 配置过低或并发任务过多',
          recommendation: [
            '检查 lake_compaction_max_tasks 配置是否合理',
            '考虑调整为自适应模式 (-1) 或提高固定值',
            '监控集群 Compaction 负载是否持续过高',
          ],
        });
      }

      // 对象存储读取慢瓶颈
      if (bottleneckStats.slow_remote_read.count > 0) {
        causes.push({
          type: 'job_profile_slow_remote_read',
          severity:
            bottleneckStats.slow_remote_read.high_severity_count > 0
              ? 'HIGH'
              : 'MEDIUM',
          description: `${bottleneckStats.slow_remote_read.count} 个 Job 的对象存储读取速度慢`,
          details: {
            affected_jobs: bottleneckStats.slow_remote_read.count,
            high_severity_jobs:
              bottleneckStats.slow_remote_read.high_severity_count,
            avg_throughput:
              bottleneckStats.slow_remote_read.avg_throughput.toFixed(1) +
              ' MB/s',
            min_throughput:
              bottleneckStats.slow_remote_read.min_throughput.toFixed(1) +
              ' MB/s',
            total_data_read_gb:
              (bottleneckStats.slow_remote_read.total_data_mb / 1024).toFixed(
                2,
              ) + ' GB',
            sample_jobs: bottleneckStats.slow_remote_read.samples.slice(0, 3),
          },
          impact: '从对象存储读取数据耗时过长，显著延长 Compaction 执行时间',
          root_cause: '对象存储性能不足、网络带宽受限或 Cache 命中率低',
          recommendation: [
            '检查对象存储服务（如 S3/OSS）的性能监控指标',
            '优化网络配置，确保带宽充足',
            '考虑增加本地缓存容量提高 Cache 命中率',
            '检查是否存在跨区域访问导致的延迟',
          ],
        });
      }

      // 对象存储写入慢瓶颈
      if (bottleneckStats.slow_remote_write.count > 0) {
        causes.push({
          type: 'job_profile_slow_remote_write',
          severity:
            bottleneckStats.slow_remote_write.high_severity_count > 0
              ? 'HIGH'
              : 'MEDIUM',
          description: `${bottleneckStats.slow_remote_write.count} 个 Job 的对象存储写入速度慢`,
          details: {
            affected_jobs: bottleneckStats.slow_remote_write.count,
            high_severity_jobs:
              bottleneckStats.slow_remote_write.high_severity_count,
            avg_throughput:
              bottleneckStats.slow_remote_write.avg_throughput.toFixed(1) +
              ' MB/s',
            min_throughput:
              bottleneckStats.slow_remote_write.min_throughput.toFixed(1) +
              ' MB/s',
            total_data_written_gb:
              (bottleneckStats.slow_remote_write.total_data_mb / 1024).toFixed(
                2,
              ) + ' GB',
            sample_jobs: bottleneckStats.slow_remote_write.samples.slice(0, 3),
          },
          impact: '向对象存储写入数据耗时过长，成为 Compaction 性能瓶颈',
          root_cause: '对象存储写入性能受限或网络上传带宽不足',
          recommendation: [
            '检查对象存储的写入性能和带宽限制',
            '验证网络上传带宽是否充足',
            '考虑使用性能更好的对象存储服务',
            '检查是否需要调整对象存储的并发写入配置',
          ],
        });
      }

      // 缓存命中率低瓶颈
      if (bottleneckStats.low_cache_hit.count > 0) {
        causes.push({
          type: 'job_profile_low_cache_hit',
          severity: 'MEDIUM',
          description: `${bottleneckStats.low_cache_hit.count} 个 Job 的本地缓存命中率低`,
          details: {
            affected_jobs: bottleneckStats.low_cache_hit.count,
            avg_cache_hit_ratio:
              bottleneckStats.low_cache_hit.avg_cache_hit_ratio.toFixed(1) +
              '%',
            min_cache_hit_ratio:
              bottleneckStats.low_cache_hit.min_cache_hit_ratio.toFixed(1) +
              '%',
            avg_remote_read_gb:
              (bottleneckStats.low_cache_hit.avg_remote_read_mb / 1024).toFixed(
                2,
              ) + ' GB',
            sample_jobs: bottleneckStats.low_cache_hit.samples.slice(0, 3),
          },
          impact: '大量数据需要从对象存储读取，无法利用本地缓存加速',
          root_cause: '本地缓存容量不足或缓存策略不合理',
          recommendation: [
            '检查本地缓存配置，考虑增加缓存容量',
            '分析缓存淘汰策略是否合理',
            '监控缓存使用率，确认是否达到上限',
            '考虑优化热数据的缓存预热',
          ],
        });
      }

      // 大数据量任务（信息性，非真正的瓶颈）
      if (bottleneckStats.large_data_volume.count > 0) {
        causes.push({
          type: 'job_profile_large_data',
          severity: 'INFO',
          description: `${bottleneckStats.large_data_volume.count} 个 Job 处理的数据量较大（> 10GB）`,
          details: {
            affected_jobs: bottleneckStats.large_data_volume.count,
            avg_total_data_gb:
              (
                bottleneckStats.large_data_volume.avg_total_data_mb / 1024
              ).toFixed(2) + ' GB',
            max_total_data_gb:
              (
                bottleneckStats.large_data_volume.max_total_data_mb / 1024
              ).toFixed(2) + ' GB',
            sample_jobs: bottleneckStats.large_data_volume.samples.slice(0, 3),
          },
          impact: '数据量大导致任务执行时间长，但性能指标正常',
          root_cause: '分区数据量本身较大，属于正常现象',
          recommendation: [
            '这是正常情况，可以通过监控观察趋势',
            '如果数据量持续增长，考虑调整分区策略',
          ],
        });
      }
    }

    // 2. 分析未完成的 Compaction Job 的 Task 状态
    const tasksWithUnfinishedJobs = slowTasks.filter(
      (t) => t.unfinished_job_analyses && t.unfinished_job_analyses.length > 0,
    );
    if (tasksWithUnfinishedJobs.length > 0) {
      // 聚合所有未完成 job 的问题
      const unfinishedJobIssues = this.aggregateUnfinishedJobIssues(
        tasksWithUnfinishedJobs,
      );

      // Task 未开始执行（compact_threads 不足）
      if (unfinishedJobIssues.tasks_not_started.count > 0) {
        causes.push({
          type: 'job_tasks_not_started',
          severity: unfinishedJobIssues.tasks_not_started.severity,
          description: `${unfinishedJobIssues.tasks_not_started.total_pending_tasks} 个 Task 未开始执行 (来自 ${unfinishedJobIssues.tasks_not_started.affected_jobs} 个 Job)`,
          details: {
            affected_jobs: unfinishedJobIssues.tasks_not_started.affected_jobs,
            total_pending_tasks:
              unfinishedJobIssues.tasks_not_started.total_pending_tasks,
            affected_be_nodes:
              unfinishedJobIssues.tasks_not_started.affected_be_nodes,
            sample_jobs: unfinishedJobIssues.tasks_not_started.samples.slice(
              0,
              3,
            ),
          },
          impact: 'Task 在 BE 节点队列中等待，无法开始执行',
          root_cause: 'BE 节点的 compact_threads 配置过小，并发处理能力不足',
          recommendation: [
            '检查受影响 BE 节点的 compact_threads 配置',
            '建议将 compact_threads 增加到 CPU 核数的 50%-100%',
            '监控 BE 节点的 CPU 使用率，确保有余量',
            '检查 BE 节点是否有其他高负载任务',
          ],
        });
      }

      // Task 高重试次数（内存不足）
      if (unfinishedJobIssues.high_retry_tasks.count > 0) {
        causes.push({
          type: 'job_tasks_high_retry',
          severity: 'HIGH',
          description: `${unfinishedJobIssues.high_retry_tasks.total_retry_tasks} 个 Task 重试次数超过 3 次 (来自 ${unfinishedJobIssues.high_retry_tasks.affected_jobs} 个 Job)`,
          details: {
            affected_jobs: unfinishedJobIssues.high_retry_tasks.affected_jobs,
            total_retry_tasks:
              unfinishedJobIssues.high_retry_tasks.total_retry_tasks,
            affected_be_nodes:
              unfinishedJobIssues.high_retry_tasks.affected_be_nodes,
            max_retry_count:
              unfinishedJobIssues.high_retry_tasks.max_retry_count,
            be_retry_stats: unfinishedJobIssues.high_retry_tasks.be_retry_stats,
            sample_jobs: unfinishedJobIssues.high_retry_tasks.samples.slice(
              0,
              3,
            ),
          },
          impact: 'Task 反复失败重试，导致 Compaction Job 执行时间大幅延长',
          root_cause: 'BE 节点内存不足，Compaction 任务因 OOM 反复失败',
          recommendation: [
            '立即检查受影响 BE 节点的内存使用情况',
            '查看 BE 日志中的 OOM 或 Memory Limit Exceeded 错误',
            '考虑增加 BE 节点内存或限制其他内存密集型操作',
            '调整 Compaction 单任务内存限制参数',
            '如果内存紧张，可以临时降低 compact_threads 减少并发',
          ],
        });
      }

      // Task 失败
      if (unfinishedJobIssues.failed_tasks.count > 0) {
        causes.push({
          type: 'job_tasks_failed',
          severity: 'CRITICAL',
          description: `${unfinishedJobIssues.failed_tasks.total_failed_tasks} 个 Task 处于失败状态 (来自 ${unfinishedJobIssues.failed_tasks.affected_jobs} 个 Job)`,
          details: {
            affected_jobs: unfinishedJobIssues.failed_tasks.affected_jobs,
            total_failed_tasks:
              unfinishedJobIssues.failed_tasks.total_failed_tasks,
            error_types: unfinishedJobIssues.failed_tasks.error_types,
            sample_errors: unfinishedJobIssues.failed_tasks.sample_errors.slice(
              0,
              5,
            ),
          },
          impact: 'Compaction Job 无法完成，分区的 Compaction Score 将持续上升',
          root_cause: '数据损坏、元数据异常、磁盘故障或其他系统级问题',
          recommendation: [
            '立即查看详细错误日志定位根本原因',
            '检查数据文件完整性',
            '验证元数据一致性',
            '如果是特定 Tablet 的问题，考虑手动修复或删除',
            '必要时重启相关 BE 节点',
          ],
        });
      }

      // Task 运行缓慢
      if (unfinishedJobIssues.slow_running_tasks.count > 0) {
        causes.push({
          type: 'job_tasks_slow_running',
          severity: 'MEDIUM',
          description: `${unfinishedJobIssues.slow_running_tasks.total_slow_tasks} 个 Task 运行缓慢 (来自 ${unfinishedJobIssues.slow_running_tasks.affected_jobs} 个 Job)`,
          details: {
            affected_jobs: unfinishedJobIssues.slow_running_tasks.affected_jobs,
            total_slow_tasks:
              unfinishedJobIssues.slow_running_tasks.total_slow_tasks,
            avg_progress_rate:
              unfinishedJobIssues.slow_running_tasks.avg_progress_rate.toFixed(
                1,
              ) + '%/min',
          },
          impact: 'Compaction Job 整体完成时间被显著拉长',
          root_cause: 'BE 节点 I/O 性能不足、对象存储访问慢或数据量特别大',
          recommendation: [
            '检查 BE 节点的磁盘 I/O 性能指标',
            '验证对象存储访问延迟和吞吐量',
            '查看这些 Task 对应的 Tablet 数据量',
            '监控网络带宽使用情况',
          ],
        });
      }
    }

    // 3. 检查高 CS 但无 job 的异常情况
    const highCSNoJobTasks = slowTasks.filter(
      (t) => t.cs_status === 'high_cs_no_job_found',
    );
    if (highCSNoJobTasks.length > 0) {
      // 检查是否有队列分析结果，判断是否因为队列饱和导致
      const tasksWithQueueAnalysis = highCSNoJobTasks.filter(
        (t) => t.queue_analysis,
      );
      const saturatedTasks = tasksWithQueueAnalysis.filter(
        (t) => t.queue_analysis.is_queue_saturated,
      );

      if (saturatedTasks.length > 0) {
        // 队列饱和是主要原因
        const sampleQueueAnalysis = saturatedTasks[0].queue_analysis;

        causes.push({
          type: 'compaction_queue_saturated',
          severity: 'CRITICAL',
          description: `Compaction 队列已饱和，导致 ${saturatedTasks.length} 个高 CS 分区无法被调度`,
          details: {
            partitions_waiting: sampleQueueAnalysis.partitions_waiting,
            total_buckets_waiting: sampleQueueAnalysis.total_buckets_waiting,
            max_tasks_config: sampleQueueAnalysis.max_tasks_config,
            is_adaptive: sampleQueueAnalysis.is_adaptive,
            saturation_ratio: sampleQueueAnalysis.saturation_ratio + 'x',
            recommended_max_tasks: sampleQueueAnalysis.recommended_max_tasks,
            affected_tasks: saturatedTasks.slice(0, 3).map((t) => ({
              tablet_id: t.tablet_id,
              compaction_score: t.compaction_score,
              buckets_ahead: t.queue_analysis.total_buckets_waiting,
            })),
          },
          impact: `系统中有 ${sampleQueueAnalysis.partitions_waiting} 个分区（共 ${sampleQueueAnalysis.total_buckets_waiting} 个分桶）等待 Compaction，超过 max_tasks 限制 (${sampleQueueAnalysis.max_tasks_config})`,
          root_cause: sampleQueueAnalysis.is_adaptive
            ? '自适应模式下计算的 max_tasks 可能不足以处理当前负载'
            : `lake_compaction_max_tasks 配置值 (${sampleQueueAnalysis.max_tasks_config}) 过低`,
        });

        // 剩余未饱和的高CS无job任务
        const nonSaturatedHighCSTasks = highCSNoJobTasks.filter(
          (t) => !t.queue_analysis || !t.queue_analysis.is_queue_saturated,
        );

        if (nonSaturatedHighCSTasks.length > 0) {
          causes.push({
            type: 'high_cs_no_job_other_reasons',
            severity: 'HIGH',
            description: `${nonSaturatedHighCSTasks.length} 个高 CS 分区未找到 Job（非队列饱和原因）`,
            details: nonSaturatedHighCSTasks.slice(0, 5).map((t) => ({
              tablet_id: t.tablet_id,
              compaction_score: t.compaction_score,
              queue_status: t.queue_analysis ? 'normal' : 'unknown',
            })),
            impact: '可能存在调度器异常或通信问题',
            possible_reasons: [
              'Compaction 调度器未正常工作',
              'FE 与 BE 通信异常',
              '分区元数据异常',
            ],
          });
        }
      } else {
        // 没有队列饱和，可能是其他原因
        causes.push({
          type: 'high_cs_no_compaction_job',
          severity: 'CRITICAL',
          description: `${highCSNoJobTasks.length} 个任务的分区 Compaction Score >= 10 但未找到对应的 Compaction Job`,
          details: highCSNoJobTasks.slice(0, 5).map((t) => ({
            tablet_id: t.tablet_id,
            be_id: t.be_id,
            compaction_score: t.compaction_score,
            duration_hours: t.duration_hours.toFixed(2),
            progress: t.progress + '%',
            queue_status: t.queue_analysis ? 'analyzed' : 'not_analyzed',
          })),
          impact: 'Compaction 调度可能存在问题，导致高 CS 分区未被及时处理',
          possible_reasons: [
            'Compaction 调度器未正常工作',
            'lake_compaction_max_tasks 配置过低',
            'FE 与 BE 通信异常',
            '分区元数据异常',
          ],
        });
      }
    }

    // 检查低 CS 但有慢任务的情况（正常但需要关注）
    const lowCSNoJobTasks = slowTasks.filter(
      (t) => t.cs_status === 'low_cs_no_job_needed',
    );
    if (lowCSNoJobTasks.length > 0) {
      causes.push({
        type: 'low_cs_slow_task',
        severity: 'INFO',
        description: `${lowCSNoJobTasks.length} 个任务的分区 CS < 10，无需 Compaction (正常情况)`,
        details: lowCSNoJobTasks.slice(0, 3).map((t) => ({
          tablet_id: t.tablet_id,
          compaction_score: t.compaction_score,
          note: '此任务可能是其他维护操作，非 Compaction 任务',
        })),
        impact: '无影响，这些任务可能不是 Compaction 相关',
      });
    }

    // 按 BE 节点分组
    const tasksByBE = {};
    slowTasks.forEach((task) => {
      if (!tasksByBE[task.be_id]) {
        tasksByBE[task.be_id] = [];
      }
      tasksByBE[task.be_id].push(task);
    });

    // 检查节点过载
    const overloadedNodes = Object.entries(tasksByBE).filter(
      ([_, tasks]) => tasks.length > 3,
    );
    if (overloadedNodes.length > 0) {
      causes.push({
        type: 'node_overload',
        severity: 'HIGH',
        description: `${overloadedNodes.length} 个节点存在任务过载`,
        details: overloadedNodes.map(([beId, tasks]) => ({
          be_id: beId,
          slow_tasks_count: tasks.length,
          avg_duration: (
            tasks.reduce((sum, t) => sum + t.duration_hours, 0) / tasks.length
          ).toFixed(2),
        })),
        impact: '节点资源竞争导致任务执行缓慢',
      });
    }

    // 检查停滞任务
    const stalledTasks = slowTasks.filter((t) => t.is_stalled);
    if (stalledTasks.length > 0) {
      causes.push({
        type: 'task_stalled',
        severity: 'CRITICAL',
        description: `${stalledTasks.length} 个任务进度停滞（进度<50%，重试>3次）`,
        details: stalledTasks.slice(0, 5).map((t) => ({
          tablet_id: t.tablet_id,
          be_id: t.be_id,
          progress: t.progress + '%',
          retry_count: t.retry_count,
          duration_hours: t.duration_hours.toFixed(2),
        })),
        impact: '可能存在死锁、资源耗尽或数据异常',
      });
    }

    // 检查进度缓慢任务
    const slowProgressTasks = slowTasks.filter((t) => t.progress_rate < 10); // 每小时进度 < 10%
    if (slowProgressTasks.length > 0) {
      causes.push({
        type: 'slow_progress',
        severity: 'MEDIUM',
        description: `${slowProgressTasks.length} 个任务进度推进缓慢（< 10%/小时）`,
        avg_progress_rate:
          (
            slowProgressTasks.reduce((sum, t) => sum + t.progress_rate, 0) /
            slowProgressTasks.length
          ).toFixed(2) + '%/hour',
        impact: '数据量大或 I/O 性能不足',
      });
    }

    // 获取线程配置检查
    try {
      const threadConfig = await this.getCompactionThreads(connection);
      if (threadConfig.success && threadConfig.data?.nodes) {
        const lowThreadNodes = threadConfig.data.nodes.filter(
          (node) => node.current_threads < 4,
        );
        if (lowThreadNodes.length > 0) {
          causes.push({
            type: 'insufficient_threads',
            severity: 'MEDIUM',
            description: `${lowThreadNodes.length} 个节点 Compaction 线程数过低`,
            details: lowThreadNodes.map((n) => ({
              be_id: n.be_id,
              current_threads: n.current_threads,
              recommended: Math.max(4, Math.ceil(n.cpu_cores * 0.5)),
            })),
            impact: '并发处理能力不足，任务排队等待',
          });
        }
      }
    } catch (error) {
      console.warn('检查线程配置失败:', error.message);
    }

    return causes.length > 0
      ? causes
      : [
          {
            type: 'unknown',
            severity: 'LOW',
            description: '未发现明确的根因，可能是数据复杂度或网络延迟导致',
            impact: '需要进一步监控和分析',
          },
        ];
  }

  /**
   * 分析慢任务模式
   */
  analyzeSlowTaskPatterns(slowTasks) {
    const patterns = {
      by_duration: {
        '2-4_hours': slowTasks.filter(
          (t) => t.duration_hours >= 2 && t.duration_hours < 4,
        ).length,
        '4-8_hours': slowTasks.filter(
          (t) => t.duration_hours >= 4 && t.duration_hours < 8,
        ).length,
        '8+_hours': slowTasks.filter((t) => t.duration_hours >= 8).length,
      },
      by_progress: {
        low_0_25: slowTasks.filter((t) => t.progress < 25).length,
        medium_25_50: slowTasks.filter(
          (t) => t.progress >= 25 && t.progress < 50,
        ).length,
        high_50_75: slowTasks.filter((t) => t.progress >= 50 && t.progress < 75)
          .length,
        near_complete_75_100: slowTasks.filter((t) => t.progress >= 75).length,
      },
      by_retry: {
        no_retry: slowTasks.filter((t) => t.retry_count === 0).length,
        low_retry_1_3: slowTasks.filter(
          (t) => t.retry_count >= 1 && t.retry_count <= 3,
        ).length,
        high_retry_4_plus: slowTasks.filter((t) => t.retry_count > 3).length,
      },
    };

    return patterns;
  }

  /**
   * 分析系统因素
   */
  async analyzeSystemFactors(connection) {
    const factors = {};

    try {
      // 获取高 CS 分区
      const highCSPartitions = await this.getHighCompactionPartitions(
        connection,
        10,
        100,
      );
      if (highCSPartitions.success) {
        factors.high_compaction_score = {
          count: highCSPartitions.data?.partitions?.length || 0,
          description: 'Compaction Score 高的分区数量',
          impact: 'CS 高表示待处理任务多，可能影响任务执行速度',
        };
      }

      // 获取线程配置
      const threadConfig = await this.getCompactionThreads(connection);
      if (threadConfig.success && threadConfig.data?.nodes) {
        const avgThreads =
          threadConfig.data.nodes.reduce(
            (sum, n) => sum + n.current_threads,
            0,
          ) / threadConfig.data.nodes.length;
        factors.thread_configuration = {
          avg_threads_per_node: avgThreads.toFixed(1),
          total_nodes: threadConfig.data.nodes.length,
          description: '集群平均 Compaction 线程数配置',
        };
      }
    } catch (error) {
      console.warn('分析系统因素失败:', error.message);
    }

    return factors;
  }

  /**
   * 计算慢任务性能指标
   */
  calculateSlowTaskMetrics(slowTasks) {
    if (slowTasks.length === 0) {
      return null;
    }

    const durations = slowTasks.map((t) => t.duration_hours);
    const progresses = slowTasks.map((t) => t.progress);
    const progressRates = slowTasks.map((t) => t.progress_rate);

    return {
      duration: {
        min: Math.min(...durations).toFixed(2),
        max: Math.max(...durations).toFixed(2),
        avg: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(
          2,
        ),
        median: this.calculateMedian(durations).toFixed(2),
      },
      progress: {
        min: Math.min(...progresses),
        max: Math.max(...progresses),
        avg: (
          progresses.reduce((a, b) => a + b, 0) / progresses.length
        ).toFixed(1),
      },
      progress_rate: {
        min: Math.min(...progressRates).toFixed(2),
        max: Math.max(...progressRates).toFixed(2),
        avg: (
          progressRates.reduce((a, b) => a + b, 0) / progressRates.length
        ).toFixed(2),
      },
    };
  }

  /**
   * 计算中位数
   */
  calculateMedian(arr) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * 计算慢任务严重程度
   */
  calculateSlowTaskSeverity(slowTasks, totalTasks) {
    const ratio = totalTasks > 0 ? slowTasks.length / totalTasks : 0;
    const stalledCount = slowTasks.filter((t) => t.is_stalled).length;
    const verySlowCount = slowTasks.filter((t) => t.duration_hours > 4).length;

    if (stalledCount > 0 || verySlowCount > slowTasks.length * 0.5) {
      return 'CRITICAL';
    } else if (ratio > 0.3 || verySlowCount > 0) {
      return 'HIGH';
    } else if (ratio > 0.1) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 生成慢任务诊断结论
   */
  generateSlowTaskDiagnosis(analysis) {
    const diagnosis = {
      severity: analysis.overview.severity_level,
      primary_issues: [],
      contributing_factors: [],
    };

    // 主要问题
    analysis.root_causes.forEach((cause) => {
      if (cause.severity === 'CRITICAL' || cause.severity === 'HIGH') {
        diagnosis.primary_issues.push({
          type: cause.type,
          description: cause.description,
          impact: cause.impact,
        });
      } else {
        diagnosis.contributing_factors.push({
          type: cause.type,
          description: cause.description,
        });
      }
    });

    // 综合诊断
    if (analysis.overview.stalled_tasks_count > 0) {
      diagnosis.conclusion = `检测到 ${analysis.overview.stalled_tasks_count} 个停滞任务，需要立即处理`;
    } else if (analysis.overview.very_slow_tasks_count > 0) {
      diagnosis.conclusion = `存在 ${analysis.overview.very_slow_tasks_count} 个超长运行任务（>4小时），建议优化配置`;
    } else {
      diagnosis.conclusion = `慢任务比例为 ${analysis.overview.slow_task_ratio}，处于可接受范围`;
    }

    return diagnosis;
  }

  /**
   * 生成慢任务优化建议
   */
  generateSlowTaskRecommendations(analysis, diagnosis) {
    const recommendations = [];

    // 根据根因生成建议
    analysis.root_causes.forEach((cause) => {
      switch (cause.type) {
        case 'compaction_queue_saturated': {
          const queueDetails = cause.details;
          const actions = [];

          if (queueDetails.is_adaptive) {
            // 自适应模式
            actions.push(
              `当前为自适应模式 (节点数 × 16)，实际 max_tasks = ${queueDetails.max_tasks_config}`,
              `系统中有 ${queueDetails.total_buckets_waiting} 个分桶等待，饱和度 ${queueDetails.saturation_ratio}`,
              '建议考虑以下方案：',
              '  1. 扩容 BE/CN 节点数量以提高自适应计算的 max_tasks 值',
              '  2. 或改为固定值模式，设置更大的 lake_compaction_max_tasks',
              `     推荐值: SET GLOBAL lake_compaction_max_tasks = ${queueDetails.recommended_max_tasks || queueDetails.total_buckets_waiting}`,
            );
          } else {
            // 固定值模式
            actions.push(
              `当前 lake_compaction_max_tasks = ${queueDetails.max_tasks_config} (固定值)`,
              `系统中有 ${queueDetails.total_buckets_waiting} 个分桶等待，饱和度 ${queueDetails.saturation_ratio}`,
              '立即调整 lake_compaction_max_tasks 参数：',
              `  推荐值: SET GLOBAL lake_compaction_max_tasks = ${queueDetails.recommended_max_tasks}`,
              '  或设置为自适应模式: SET GLOBAL lake_compaction_max_tasks = -1',
            );
          }

          actions.push(
            '调整后监控 Compaction 任务调度情况',
            '检查 FE 资源使用，确保有足够的 CPU 和内存处理更多任务',
          );

          recommendations.push({
            priority: 'CRITICAL',
            category: 'capacity_planning',
            title: '扩容 Compaction 任务队列',
            description: `Compaction 队列已饱和 (${queueDetails.saturation_ratio})，需要立即扩容`,
            actions,
          });
          break;
        }

        case 'high_cs_no_job_other_reasons':
          recommendations.push({
            priority: 'HIGH',
            category: 'compaction_scheduling',
            title: '排查 Compaction 调度异常',
            description: '高 CS 分区未被调度，但队列未饱和，需要排查调度器问题',
            actions: [
              '检查 FE 日志中的 Compaction 调度器错误或警告',
              '验证 FE 与 BE 节点之间的网络连通性',
              "查看 SHOW PROC '/compactions' 确认调度状态",
              '检查分区元数据是否正常: SELECT * FROM information_schema.partitions_meta',
              '考虑重启 FE 以重置调度器状态（谨慎操作）',
            ],
          });
          break;

        case 'high_cs_no_compaction_job':
          recommendations.push({
            priority: 'CRITICAL',
            category: 'compaction_scheduling',
            title: '修复 Compaction 调度问题',
            description: '存在高 CS 分区但未被调度执行 Compaction',
            actions: [
              '检查 FE 日志中的 Compaction 调度器错误信息',
              '确认 lake_compaction_max_tasks 参数配置 (建议 >= 64)',
              '检查 FE 与 BE 节点之间的网络连接',
              "查看 SHOW PROC '/compactions' 确认任务调度状态",
              '考虑手动触发 Compaction: ALTER TABLE xxx COMPACT',
              '检查 FE 是否有足够的资源进行任务调度',
            ],
          });
          break;

        case 'low_cs_slow_task':
          // 这是信息类，不需要建议
          break;

        case 'node_overload':
          recommendations.push({
            priority: 'HIGH',
            category: 'load_balancing',
            title: '优化节点负载均衡',
            description: '部分节点任务过载，建议调整 Compaction 任务分配策略',
            actions: [
              '检查过载节点的硬件资源使用情况',
              '考虑增加过载节点的 Compaction 线程数',
              '评估是否需要扩容 BE 节点',
            ],
          });
          break;

        case 'task_stalled':
          recommendations.push({
            priority: 'CRITICAL',
            category: 'task_recovery',
            title: '处理停滞任务',
            description: '存在进度停滞的任务，可能需要人工干预',
            actions: [
              '检查停滞任务的 Tablet 状态和错误日志',
              '考虑手动取消长时间停滞的任务',
              '检查是否存在死锁或资源耗尽问题',
              '评估是否需要调整 lake_compaction_max_tasks 参数',
            ],
          });
          break;

        case 'slow_progress':
          recommendations.push({
            priority: 'MEDIUM',
            category: 'performance_tuning',
            title: '优化任务执行性能',
            description: '任务进度推进缓慢，建议优化 I/O 和计算资源',
            actions: [
              '检查 S3 或对象存储的访问延迟',
              '评估 BE 节点的 CPU 和内存使用情况',
              '考虑增加 Compaction 线程数以提高并发',
              '检查网络带宽是否成为瓶颈',
            ],
          });
          break;

        case 'insufficient_threads':
          recommendations.push({
            priority: 'HIGH',
            category: 'configuration',
            title: '增加 Compaction 线程数',
            description: '部分节点线程配置过低，限制了并发处理能力',
            actions: cause.details.map(
              (detail) =>
                `节点 ${detail.be_id}: 当前 ${detail.current_threads} 线程，建议调整为 ${detail.recommended} 线程`,
            ),
          });
          break;
      }
    });

    // 通用建议
    if (diagnosis.severity === 'HIGH' || diagnosis.severity === 'CRITICAL') {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'monitoring',
        title: '加强监控和告警',
        description: '建立 Compaction 任务监控体系',
        actions: [
          '设置慢任务告警阈值（建议 2 小时）',
          '监控 Compaction Score 趋势',
          '定期检查任务执行统计和成功率',
          '建立 Compaction 性能基线',
        ],
      });
    }

    return recommendations;
  }

  /**
   * 生成慢任务行动计划
   */
  generateSlowTaskActionPlan(diagnosis, recommendations) {
    const actionPlan = {
      immediate_actions: [],
      short_term_actions: [],
      long_term_actions: [],
    };

    recommendations.forEach((rec) => {
      const action = {
        title: rec.title,
        category: rec.category,
        steps: rec.actions,
      };

      if (rec.priority === 'CRITICAL') {
        actionPlan.immediate_actions.push(action);
      } else if (rec.priority === 'HIGH') {
        actionPlan.short_term_actions.push(action);
      } else {
        actionPlan.long_term_actions.push(action);
      }
    });

    return actionPlan;
  }

  /**
   * 分析正在运行的任务
   */
  analyzeRunningTasks(tasks) {
    if (tasks.length === 0) {
      return {
        summary: 'No running compaction tasks found',
        status: 'IDLE',
      };
    }

    const now = new Date();
    const longRunningTasks = tasks.filter((task) => {
      const startTime = new Date(task.start_time);
      const runningHours = (now - startTime) / (1000 * 60 * 60);
      return runningHours > this.rules.task_execution.slow_task_threshold_hours;
    });

    const stalledTasks = tasks.filter(
      (task) => task.progress < 50 && task.runs > 5,
    );

    let status = 'NORMAL';
    if (stalledTasks.length > 0) {
      status = 'STALLED';
    } else if (longRunningTasks.length > 0) {
      status = 'SLOW';
    } else if (tasks.length > 20) {
      status = 'BUSY';
    }

    return {
      summary: `${tasks.length} running tasks, ${longRunningTasks.length} long-running, ${stalledTasks.length} potentially stalled`,
      status: status,
      long_running_count: longRunningTasks.length,
      stalled_count: stalledTasks.length,
      avg_progress:
        tasks.length > 0
          ? (
              tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length
            ).toFixed(1)
          : 0,
    };
  }

  /**
   * 分析高 Compaction Score 原因
   */
  async analyzeHighCompactionScore(
    connection,
    targetDatabase = null,
    minScore = 100,
  ) {
    try {
      let query = `
        SELECT
          DB_NAME as database_name,
          TABLE_NAME as table_name,
          PARTITION_NAME as partition_name,
          MAX_CS as max_compaction_score,
          AVG_CS as avg_compaction_score,
          ROW_COUNT as row_count,
          DATA_SIZE as data_size
        FROM information_schema.partitions_meta
        WHERE MAX_CS >= ?
      `;

      const params = [minScore];

      if (targetDatabase) {
        query += ` AND DB_NAME = ?`;
        params.push(targetDatabase);
      }

      query += ` ORDER BY MAX_CS DESC LIMIT 50`;

      const [partitions] = await connection.query(query, params);

      const analysis = this.performCompactionScoreAnalysis(partitions);

      return {
        success: true,
        data: {
          high_score_partitions: partitions,
          analysis: analysis,
          recommendations:
            this.generateCompactionScoreRecommendations(analysis),
        },
      };
    } catch (error) {
      const errorAnalysis = {
        summary: 'Analysis failed',
        severity: 'ERROR',
        statistics: {
          max_score: 0,
          avg_score: 0,
          total_partitions: 0,
          affected_databases: 0,
          affected_tables: 0,
        },
        by_database: [],
        by_table: [],
      };

      return {
        success: false,
        error: `Failed to analyze high compaction scores: ${error.message}`,
        data: {
          high_score_partitions: [],
          analysis: errorAnalysis,
          recommendations:
            this.generateCompactionScoreRecommendations(errorAnalysis),
        },
      };
    }
  }

  /**
   * 执行 Compaction Score 分析
   */
  performCompactionScoreAnalysis(partitions) {
    if (partitions.length === 0) {
      return {
        summary: 'No high compaction score partitions found',
        severity: 'NORMAL',
        statistics: {
          max_score: 0,
          avg_score: 0,
          total_partitions: 0,
          affected_databases: 0,
          affected_tables: 0,
        },
        by_database: [],
        by_table: [],
      };
    }

    const scores = partitions.map((p) => p.max_compaction_score);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // 按数据库分组分析
    const byDatabase = {};
    partitions.forEach((p) => {
      if (!byDatabase[p.database_name]) {
        byDatabase[p.database_name] = [];
      }
      byDatabase[p.database_name].push(p);
    });

    // 按表分组分析
    const byTable = {};
    partitions.forEach((p) => {
      const tableKey = `${p.database_name}.${p.table_name}`;
      if (!byTable[tableKey]) {
        byTable[tableKey] = [];
      }
      byTable[tableKey].push(p);
    });

    let severity = 'NORMAL';
    if (maxScore >= this.rules.compaction_score.emergency) {
      severity = 'EMERGENCY';
    } else if (maxScore >= this.rules.compaction_score.critical) {
      severity = 'CRITICAL';
    } else if (maxScore >= this.rules.compaction_score.warning) {
      severity = 'WARNING';
    }

    return {
      summary: `Found ${partitions.length} high CS partitions across ${Object.keys(byDatabase).length} databases`,
      severity: severity,
      statistics: {
        max_score: maxScore,
        avg_score: avgScore.toFixed(2),
        total_partitions: partitions.length,
        affected_databases: Object.keys(byDatabase).length,
        affected_tables: Object.keys(byTable).length,
      },
      by_database: Object.entries(byDatabase).map(([db, parts]) => ({
        database: db,
        partition_count: parts.length,
        max_score: Math.max(...parts.map((p) => p.max_compaction_score)),
        avg_score: (
          parts.reduce((sum, p) => sum + p.max_compaction_score, 0) /
          parts.length
        ).toFixed(2),
      })),
      by_table: Object.entries(byTable).map(([table, parts]) => ({
        table: table,
        partition_count: parts.length,
        max_score: Math.max(...parts.map((p) => p.max_compaction_score)),
        avg_score: (
          parts.reduce((sum, p) => sum + p.max_compaction_score, 0) /
          parts.length
        ).toFixed(2),
      })),
    };
  }

  /**
   * 生成 Compaction Score 建议
   */
  generateCompactionScoreRecommendations(analysis) {
    const recommendations = [];

    // 添加空值检查
    if (!analysis || !analysis.statistics) {
      return [
        {
          priority: 'INFO',
          action: '无分析数据',
          reason: '无法生成建议',
        },
      ];
    }

    if (analysis.severity === 'EMERGENCY') {
      recommendations.push({
        priority: 'URGENT',
        action: '立即手动触发最高 CS 分区的 compaction',
        reason: '防止查询性能严重下降',
      });
    }

    if (analysis.severity === 'CRITICAL' || analysis.severity === 'EMERGENCY') {
      recommendations.push({
        priority: 'HIGH',
        action: '增加 compaction 线程数',
        reason: '提高 compaction 处理能力',
      });
    }

    if (analysis.statistics && analysis.statistics.affected_tables > 10) {
      recommendations.push({
        priority: 'MEDIUM',
        action: '制定分批 compaction 计划',
        reason: '避免同时处理过多表影响系统性能',
      });
    }

    recommendations.push({
      priority: 'LOW',
      action: '建立 CS 监控告警',
      reason: '及早发现和处理高 CS 问题',
    });

    return recommendations;
  }

  /**
   * 手动触发分区 Compaction
   */
  async compactPartition(connection, database, table, partition) {
    try {
      await connection.query(`
        ALTER TABLE \`${database}\`.\`${table}\` COMPACT PARTITION (\`${partition}\`)
      `);

      return {
        success: true,
        data: {
          operation: 'compact_partition',
          database: database,
          table: table,
          partition: partition,
          status: 'INITIATED',
          message: `Compaction initiated for partition ${database}.${table}.${partition}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to compact partition: ${error.message}`,
        data: {
          operation: 'compact_partition',
          database: database,
          table: table,
          partition: partition,
          status: 'FAILED',
        },
      };
    }
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   * @returns {Object} 工具名称到处理函数的映射
   */
  getToolHandlers() {
    return {
      get_table_partitions_compaction_score: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        const data = {};
        await this.collectTableSpecificData(connection, data, {
          targetDatabase: args.database_name,
          targetTable: args.table_name,
        });

        const partitions = data.target_table_analysis?.partitions || [];
        const scoreThreshold = args.score_threshold || 0;

        const filteredPartitions = partitions.filter(
          (partition) => partition.max_cs >= scoreThreshold,
        );

        return {
          database: args.database_name,
          table: args.table_name,
          score_threshold: scoreThreshold,
          total_partitions: partitions.length,
          filtered_partitions: filteredPartitions.length,
          partitions: filteredPartitions.map((partition) => ({
            partition_name: partition.partition,
            max_compaction_score: partition.max_cs,
            avg_compaction_score: partition.avg_cs,
            p50_compaction_score: partition.p50_cs,
            row_count: partition.row_count,
            data_size: partition.data_size,
            storage_size: partition.storage_size,
            buckets: partition.buckets,
            replication_num: partition.replication_num,
          })),
        };
      },
      get_high_compaction_partitions: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        const limit = args.limit || 50;
        const threshold = args.threshold || 100;
        return await this.getHighCompactionPartitions(
          connection,
          limit,
          threshold,
        );
      },
      get_compaction_threads: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        return await this.getCompactionThreads(connection);
      },
      set_compaction_threads: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        return await this.setCompactionThreads(connection, args.thread_count);
      },
      get_running_compaction_tasks: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        const includeDetails = args.include_details !== false;
        return await this.getRunningCompactionTasks(connection, includeDetails);
      },
      analyze_high_compaction_score: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        return await this.analyzeHighCompactionScore(
          connection,
          args.database_name || null,
          args.include_details !== false,
        );
      },
      analyze_slow_compaction_tasks: async (args, context) => {
        const connection = context.connection;

        // 检查集群架构
        await this.checkSharedDataArchitecture(connection);

        return await this.analyzeSlowCompactionTasks(connection, {
          database_name: args.database_name || null,
          table_name: args.table_name || null,
          min_duration_hours: args.min_duration_hours || 0.05,
          include_task_details: args.include_task_details !== false,
          check_system_metrics: args.check_system_metrics !== false,
        });
      },
    };
  }

  /**
   * 获取此专家提供的 MCP 工具定义
   */
  getTools() {
    return [
      {
        name: 'get_table_partitions_compaction_score',
        description: '🔍 查询指定表的所有分区 Compaction Score',
        inputSchema: {
          type: 'object',
          properties: {
            database_name: {
              type: 'string',
              description: '数据库名称',
            },
            table_name: {
              type: 'string',
              description: '表名称',
            },
          },
          required: ['database_name', 'table_name'],
        },
      },
      {
        name: 'get_high_compaction_partitions',
        description: '⚠️ 查找系统中 Compaction Score 较高的分区（默认 >= 100）',
        inputSchema: {
          type: 'object',
          properties: {
            threshold: {
              type: 'number',
              description: 'Compaction Score 阈值（默认100）',
              default: 100,
            },
            limit: {
              type: 'number',
              description: '返回结果数量限制（默认50）',
              default: 50,
            },
          },
          required: [],
        },
      },
      {
        name: 'get_compaction_threads',
        description: '🔧 查询所有 BE 节点的 Compaction 线程配置',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'set_compaction_threads',
        description: '⚙️ 设置指定 BE 节点的 Compaction 线程数',
        inputSchema: {
          type: 'object',
          properties: {
            be_id: {
              type: 'string',
              description: 'BE 节点 ID',
            },
            thread_count: {
              type: 'number',
              description: '线程数量',
            },
          },
          required: ['be_id', 'thread_count'],
        },
      },
      {
        name: 'get_running_compaction_tasks',
        description: '📊 查询当前正在运行的 Compaction 任务',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'analyze_high_compaction_score',
        description: '🎯 深度分析高 Compaction Score 问题并提供专业建议',
        inputSchema: {
          type: 'object',
          properties: {
            database_name: {
              type: 'string',
              description: '可选：目标数据库名称',
            },
            table_name: {
              type: 'string',
              description: '可选：目标表名称',
            },
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
        name: 'analyze_slow_compaction_tasks',
        description: `🐌 深度分析 Compaction 慢任务问题

**功能**: 专门诊断运行缓慢的 Compaction 任务，提供根因分析和优化建议。

**分析维度**:
- ✅ 识别长时间运行的任务（默认 >= 3 分钟）
- ✅ 检测停滞任务（进度 < 50% 且重试 > 3 次）
- ✅ 分析任务进度推进速率
- ✅ 检查节点负载分布
- ✅ 评估线程配置是否合理
- ✅ 关联系统资源和配置因素

**输出内容**:
- **diagnosis**: 根因诊断报告（最重要！）
  - issues: 检测到的具体问题（排队等待、缓存未开启、tablet数量过多等）
  - recommendations: 针对每个问题的可操作建议和示例 SQL 命令
  - 问题严重程度分级（HIGH/MEDIUM/LOW）
- summary: 慢任务统计摘要
- slow_jobs: 慢任务详情列表（包含 Profile 性能分析）

**适用场景**:
- Compaction 任务长时间不完成
- 任务进度停滞不前
- 系统整体 Compaction 性能下降
- 定期巡检和性能优化`,
        inputSchema: {
          type: 'object',
          properties: {
            database_name: {
              type: 'string',
              description: '可选：目标数据库名称，用于过滤特定数据库的慢任务',
            },
            table_name: {
              type: 'string',
              description: '可选：目标表名称，用于过滤特定表的慢任务',
            },
            min_duration_hours: {
              type: 'number',
              description: '慢任务时长阈值（小时），默认 0.05 小时（3 分钟）',
              default: 0.05,
            },
            include_task_details: {
              type: 'boolean',
              description: '是否包含详细任务列表',
              default: true,
            },
            check_system_metrics: {
              type: 'boolean',
              description: '是否检查系统指标（CS、线程配置等）',
              default: true,
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksCompactionExpert };
