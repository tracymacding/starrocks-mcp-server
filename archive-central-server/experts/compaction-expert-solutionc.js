/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Compaction 专家模块 - Solution C 版本
 *
 * 支持两种模式：
 * 1. 传统模式：直接连接数据库执行 SQL
 * 2. Solution C 模式：返回 SQL 定义，由客户端执行
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { StarRocksCompactionExpert } from './compaction-expert-integrated.js';

class StarRocksCompactionExpertSolutionC extends StarRocksCompactionExpert {
  constructor() {
    super();
  }

  get version() {
    return '2.0.0-solutionc';
  }

  /**
   * ============================================
   * Solution C 模式方法
   * ============================================
   */

  /**
   * 获取工具需要执行的 SQL 查询定义
   * @param {string} toolName - 工具名称
   * @param {object} args - 工具参数
   * @returns {Array} SQL 查询列表
   */
  getQueriesForTool(toolName, args = {}) {
    switch (toolName) {
      case 'get_table_partitions_compaction_score':
        return this.getTablePartitionsCSQueries(args);

      case 'get_high_compaction_partitions':
        return this.getHighCSPartitionsQueries(args);

      case 'get_compaction_threads':
        return this.getCompactionThreadsQueries(args);

      case 'get_running_compaction_tasks':
        return this.getRunningTasksQueries(args);

      case 'analyze_high_compaction_score':
        return this.getHighCSAnalysisQueries(args);

      case 'analyze_slow_compaction_tasks':
        return this.getSlowTasksAnalysisQueries(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * 分析客户端返回的查询结果
   * @param {string} toolName - 工具名称
   * @param {object} results - SQL 执行结果，格式: { query_id: rows[] }
   * @param {object} args - 原始工具参数
   * @returns {object} 分析结果
   */
  async analyzeQueryResults(toolName, results, args = {}) {
    console.log(`🔬 开始分析 ${toolName} 的查询结果...`);

    switch (toolName) {
      case 'get_table_partitions_compaction_score':
        return this.analyzeTablePartitionsCS(results, args);

      case 'get_high_compaction_partitions':
        return this.analyzeHighCSPartitions(results, args);

      case 'get_compaction_threads':
        return this.analyzeCompactionThreads(results, args);

      case 'get_running_compaction_tasks':
        return this.analyzeRunningTasks(results, args);

      case 'analyze_high_compaction_score':
        return this.analyzeHighCSProblem(results, args);

      case 'analyze_slow_compaction_tasks':
        return this.analyzeSlowTasks(results, args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * ============================================
   * SQL 查询定义方法
   * ============================================
   */

  /**
   * 获取指定表分区 CS 的查询
   */
  getTablePartitionsCSQueries(args) {
    const { database_name, table_name } = args;

    return [
      {
        id: 'table_partitions',
        sql: `
          SELECT
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            COMPACTION_SCORE
          FROM information_schema.partitions_meta
          WHERE DB_NAME = ? AND TABLE_NAME = ?
          ORDER BY COMPACTION_SCORE DESC
        `,
        description: '查询表的所有分区 Compaction Score',
        required: true,
        params: [database_name, table_name]
      }
    ];
  }

  /**
   * 获取高 CS 分区的查询
   */
  getHighCSPartitionsQueries(args) {
    const { threshold = 100, limit = 50 } = args;

    return [
      {
        id: 'high_cs_partitions',
        sql: `
          SELECT
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            COMPACTION_SCORE,
            DATA_SIZE,
            ROW_COUNT
          FROM information_schema.partitions_meta
          WHERE DB_NAME NOT IN ('information_schema', '_statistics_')
            AND COMPACTION_SCORE >= ?
          ORDER BY COMPACTION_SCORE DESC
          LIMIT ?
        `,
        description: '查询高 Compaction Score 分区',
        required: true,
        params: [threshold, limit]
      }
    ];
  }

  /**
   * 获取 Compaction 线程配置的查询
   */
  getCompactionThreadsQueries(args) {
    return [
      {
        id: 'backends',
        sql: 'SHOW BACKENDS;',
        description: 'BE 节点信息',
        required: true
      },
      {
        id: 'thread_config',
        sql: `
          SELECT
            BE_ID,
            NAME,
            VALUE
          FROM information_schema.be_configs
          WHERE NAME IN ('compact_threads', 'max_compaction_threads')
        `,
        description: 'BE 线程配置',
        required: true
      }
    ];
  }

  /**
   * 获取正在运行任务的查询
   */
  getRunningTasksQueries(args) {
    return [
      {
        id: 'running_tasks',
        sql: `
          SELECT
            TXN_ID,
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            COMPACT_VERSION,
            VISIBLE_VERSION,
            COMMIT_TIME,
            VISIBLE_TIME,
            COMPACT_STATUS
          FROM information_schema.be_cloud_native_compactions
          WHERE COMPACT_STATUS = 'RUNNING'
          ORDER BY COMMIT_TIME ASC
        `,
        description: '正在运行的 Compaction 任务',
        required: true
      }
    ];
  }

  /**
   * 获取高 CS 分析的查询
   */
  getHighCSAnalysisQueries(args) {
    const { database_name, table_name } = args;

    let whereClause = "DB_NAME NOT IN ('information_schema', '_statistics_')";
    const params = [];

    if (database_name) {
      whereClause += ' AND DB_NAME = ?';
      params.push(database_name);
    }

    if (table_name) {
      whereClause += ' AND TABLE_NAME = ?';
      params.push(table_name);
    }

    return [
      {
        id: 'high_cs_partitions',
        sql: `
          SELECT
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            COMPACTION_SCORE,
            DATA_SIZE,
            ROW_COUNT,
            BUCKETS
          FROM information_schema.partitions_meta
          WHERE ${whereClause}
            AND COMPACTION_SCORE >= 100
          ORDER BY COMPACTION_SCORE DESC
          LIMIT 100
        `,
        description: '高 CS 分区列表',
        required: true,
        params: params
      },
      {
        id: 'running_tasks',
        sql: `
          SELECT
            COUNT(*) as total_running_tasks,
            COUNT(DISTINCT DB_NAME) as affected_databases,
            COUNT(DISTINCT TABLE_NAME) as affected_tables
          FROM information_schema.be_cloud_native_compactions
          WHERE COMPACT_STATUS = 'RUNNING'
        `,
        description: '正在运行的任务统计',
        required: false
      },
      {
        id: 'fe_config',
        sql: "ADMIN SHOW FRONTEND CONFIG LIKE 'lake_compaction_max_tasks';",
        description: 'FE Compaction 配置',
        required: false
      },
      {
        id: 'be_thread_config',
        sql: `
          SELECT
            BE_ID,
            NAME,
            VALUE
          FROM information_schema.be_configs
          WHERE NAME = 'compact_threads'
        `,
        description: 'BE 线程配置',
        required: false
      }
    ];
  }

  /**
   * 获取慢任务分析的查询
   */
  getSlowTasksAnalysisQueries(args) {
    const { database_name, table_name, min_duration_hours = 0.05 } = args;

    let whereClause = "COMPACT_STATUS = 'RUNNING'";
    const params = [min_duration_hours * 3600]; // 转换为秒

    if (database_name) {
      whereClause += ' AND DB_NAME = ?';
      params.push(database_name);
    }

    if (table_name) {
      whereClause += ' AND TABLE_NAME = ?';
      params.push(table_name);
    }

    return [
      {
        id: 'slow_tasks',
        sql: `
          SELECT
            TXN_ID,
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            COMPACT_VERSION,
            VISIBLE_VERSION,
            COMMIT_TIME,
            COMPACT_STATUS,
            TIMESTAMPDIFF(SECOND, COMMIT_TIME, NOW()) as duration_seconds
          FROM information_schema.be_cloud_native_compactions
          WHERE ${whereClause}
            AND TIMESTAMPDIFF(SECOND, COMMIT_TIME, NOW()) >= ?
          ORDER BY duration_seconds DESC
        `,
        description: '慢 Compaction 任务',
        required: true,
        params: params
      },
      {
        id: 'partition_cs',
        sql: `
          SELECT
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            COMPACTION_SCORE
          FROM information_schema.partitions_meta
          WHERE COMPACTION_SCORE >= 100
          ORDER BY COMPACTION_SCORE DESC
          LIMIT 50
        `,
        description: '高 CS 分区（关联分析）',
        required: false
      },
      {
        id: 'be_thread_config',
        sql: `
          SELECT
            BE_ID,
            NAME,
            VALUE
          FROM information_schema.be_configs
          WHERE NAME IN ('compact_threads', 'max_compaction_threads')
        `,
        description: 'BE 线程配置',
        required: false
      }
    ];
  }

  /**
   * ============================================
   * 结果分析方法
   * ============================================
   */

  /**
   * 分析表分区 CS
   */
  analyzeTablePartitionsCS(results, args) {
    const { table_partitions } = results;

    if (!table_partitions || table_partitions.length === 0) {
      return {
        database: args.database_name,
        table: args.table_name,
        total_partitions: 0,
        partitions: [],
        message: '未找到分区数据'
      };
    }

    return {
      database: args.database_name,
      table: args.table_name,
      total_partitions: table_partitions.length,
      max_cs: Math.max(...table_partitions.map(p => p.COMPACTION_SCORE || 0)),
      avg_cs: (table_partitions.reduce((sum, p) => sum + (p.COMPACTION_SCORE || 0), 0) / table_partitions.length).toFixed(2),
      partitions: table_partitions.map(p => ({
        partition: p.PARTITION_NAME,
        compaction_score: p.COMPACTION_SCORE || 0
      }))
    };
  }

  /**
   * 分析高 CS 分区
   */
  analyzeHighCSPartitions(results, args) {
    const { high_cs_partitions } = results;

    if (!high_cs_partitions || high_cs_partitions.length === 0) {
      return {
        total_high_cs_partitions: 0,
        threshold: args.threshold || 100,
        partitions: [],
        message: `未找到 Compaction Score >= ${args.threshold || 100} 的分区`
      };
    }

    return {
      total_high_cs_partitions: high_cs_partitions.length,
      threshold: args.threshold || 100,
      max_cs: Math.max(...high_cs_partitions.map(p => p.COMPACTION_SCORE || 0)),
      partitions: high_cs_partitions.map(p => ({
        database: p.DB_NAME,
        table: p.TABLE_NAME,
        partition: p.PARTITION_NAME,
        compaction_score: p.COMPACTION_SCORE || 0,
        data_size: p.DATA_SIZE,
        row_count: p.ROW_COUNT
      }))
    };
  }

  /**
   * 分析 Compaction 线程配置
   */
  analyzeCompactionThreads(results, args) {
    const { backends, thread_config } = results;

    if (!backends || backends.length === 0) {
      return {
        message: '未找到 BE 节点信息',
        nodes: []
      };
    }

    const threadMap = new Map();
    if (thread_config) {
      thread_config.forEach(config => {
        const beId = config.BE_ID;
        if (!threadMap.has(beId)) {
          threadMap.set(beId, {});
        }
        threadMap.get(beId)[config.NAME] = parseInt(config.VALUE);
      });
    }

    return {
      total_nodes: backends.length,
      nodes: backends.map(be => ({
        be_id: be.BackendId || be.BeId,
        host: be.Host || be.IP,
        alive: be.Alive === 'true',
        compact_threads: threadMap.get(be.BackendId || be.BeId)?.compact_threads || 0,
        max_compaction_threads: threadMap.get(be.BackendId || be.BeId)?.max_compaction_threads || 0
      }))
    };
  }

  /**
   * 分析正在运行的任务
   */
  analyzeRunningTasks(results, args) {
    const { running_tasks } = results;

    if (!running_tasks || running_tasks.length === 0) {
      return {
        total_running_tasks: 0,
        tasks: [],
        message: '当前没有正在运行的 Compaction 任务'
      };
    }

    return {
      total_running_tasks: running_tasks.length,
      tasks: running_tasks.map(task => ({
        txn_id: task.TXN_ID,
        database: task.DB_NAME,
        table: task.TABLE_NAME,
        partition: task.PARTITION_NAME,
        status: task.COMPACT_STATUS,
        commit_time: task.COMMIT_TIME,
        duration_estimate: this._calculateDuration(task.COMMIT_TIME)
      }))
    };
  }

  /**
   * 深度分析高 CS 问题
   */
  analyzeHighCSProblem(results, args) {
    const { high_cs_partitions, running_tasks, fe_config, be_thread_config } = results;

    // 防御性检查：确保数据是数组
    const partitions = Array.isArray(high_cs_partitions) ? high_cs_partitions : [];
    const runningTasksArray = Array.isArray(running_tasks) ? running_tasks : [];
    const feConfigArray = Array.isArray(fe_config) ? fe_config : [];
    const beThreadConfigArray = Array.isArray(be_thread_config) ? be_thread_config : [];

    // 基本统计
    const summary = {
      total_high_cs_partitions: partitions.length,
      max_cs: partitions.length > 0
        ? Math.max(...partitions.map(p => p.COMPACTION_SCORE || 0))
        : 0,
      running_tasks_count: runningTasksArray.length > 0 ? runningTasksArray[0]?.total_running_tasks || 0 : 0
    };

    // 诊断问题
    const issues = [];
    const criticals = [];
    const warnings = [];

    if (summary.max_cs >= 1000) {
      const issue = {
        severity: 'CRITICAL',
        type: 'extremely_high_cs',
        message: `发现极高的 Compaction Score (${summary.max_cs})，严重影响查询性能`,
        impact: '查询延迟显著增加，资源消耗过高'
      };
      issues.push(issue);
      criticals.push(issue);
    } else if (summary.max_cs >= 500) {
      const issue = {
        severity: 'HIGH',
        type: 'very_high_cs',
        message: `Compaction Score 过高 (${summary.max_cs})`,
        impact: '查询性能下降，需要尽快处理'
      };
      issues.push(issue);
      criticals.push(issue);
    } else if (summary.max_cs >= 100) {
      const issue = {
        severity: 'MEDIUM',
        type: 'high_cs',
        message: `Compaction Score 偏高 (${summary.max_cs})`,
        impact: '可能影响查询性能'
      };
      issues.push(issue);
      warnings.push(issue);
    }

    // 生成建议
    const recommendations = this._generateCSRecommendations(issues, results);

    // 返回标准格式的分析结果（与其他专家保持一致）
    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),

      // Compaction 健康状态（用于协调器的跨模块分析）
      compaction_health: {
        score: Math.max(0, 100 - (summary.max_cs / 10)), // CS 越高，健康分数越低
        level: summary.max_cs >= 500 ? 'POOR' : summary.max_cs >= 100 ? 'FAIR' : 'GOOD',
        status: criticals.length > 0 ? 'CRITICAL' : warnings.length > 0 ? 'WARNING' : 'HEALTHY'
      },

      // 诊断结果
      diagnosis_results: {
        summary: `发现 ${summary.total_high_cs_partitions} 个高 CS 分区，最高 CS: ${summary.max_cs}`,
        total_issues: issues.length,
        criticals: criticals,
        warnings: warnings
      },

      // 详细数据
      summary: summary,
      issues: issues,
      professional_recommendations: recommendations,
      high_cs_partitions: partitions.slice(0, 20),
      system_config: {
        fe_max_tasks: feConfigArray.length > 0 ? feConfigArray[0].Value : 'unknown',
        be_threads: beThreadConfigArray
      }
    };
  }

  /**
   * 分析慢任务
   */
  analyzeSlowTasks(results, args) {
    const { slow_tasks, partition_cs, be_thread_config } = results;

    const summary = {
      total_slow_tasks: slow_tasks ? slow_tasks.length : 0,
      min_duration_hours: args.min_duration_hours || 0.05,
      max_duration_seconds: slow_tasks && slow_tasks.length > 0
        ? Math.max(...slow_tasks.map(t => t.duration_seconds || 0))
        : 0
    };

    // 诊断问题
    const issues = [];

    if (summary.total_slow_tasks > 10) {
      issues.push({
        severity: 'HIGH',
        type: 'many_slow_tasks',
        message: `发现 ${summary.total_slow_tasks} 个慢任务`,
        impact: 'Compaction 处理效率低下，可能导致 CS 持续升高'
      });
    } else if (summary.total_slow_tasks > 0) {
      issues.push({
        severity: 'MEDIUM',
        type: 'some_slow_tasks',
        message: `发现 ${summary.total_slow_tasks} 个慢任务`,
        impact: '部分 Compaction 任务执行缓慢'
      });
    }

    // 生成建议
    const recommendations = this._generateSlowTaskRecommendations(issues, results);

    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      summary: summary,
      issues: issues,
      recommendations: recommendations,
      slow_tasks: slow_tasks || [],
      related_high_cs_partitions: partition_cs ? partition_cs.slice(0, 10) : []
    };
  }

  /**
   * ============================================
   * 辅助方法
   * ============================================
   */

  _calculateDuration(commitTime) {
    if (!commitTime) return 'unknown';

    const now = new Date();
    const commit = new Date(commitTime);
    const durationMs = now - commit;
    const durationMins = Math.floor(durationMs / 60000);

    if (durationMins < 60) {
      return `${durationMins} 分钟`;
    }

    const hours = Math.floor(durationMins / 60);
    const mins = durationMins % 60;
    return `${hours} 小时 ${mins} 分钟`;
  }

  _generateCSRecommendations(issues, results) {
    const recommendations = [];

    issues.forEach(issue => {
      if (issue.type === 'extremely_high_cs' || issue.type === 'very_high_cs') {
        recommendations.push({
          priority: 'HIGH',
          category: 'immediate_action',
          title: '立即手动触发 Compaction',
          description: '使用 ALTER TABLE ... COMPACT 命令手动触发 Compaction',
          actions: [
            'ALTER TABLE <database>.<table> COMPACT; -- 手动触发全表 Compaction',
            '监控 Compaction Score 下降情况',
            '检查 FE 和 BE 的 Compaction 配置是否合理'
          ]
        });

        recommendations.push({
          priority: 'MEDIUM',
          category: 'configuration_tuning',
          title: '优化 Compaction 配置',
          description: '调整 Compaction 线程数和任务并发数',
          actions: [
            'ADMIN SET FRONTEND CONFIG ("lake_compaction_max_tasks" = "128");',
            'UPDATE information_schema.be_configs SET value = "16" WHERE name = "compact_threads";'
          ]
        });
      }
    });

    return recommendations;
  }

  _generateSlowTaskRecommendations(issues, results) {
    const recommendations = [];

    issues.forEach(issue => {
      if (issue.type === 'many_slow_tasks' || issue.type === 'some_slow_tasks') {
        recommendations.push({
          priority: 'HIGH',
          category: 'performance_optimization',
          title: '优化慢任务执行',
          description: '检查系统资源和配置，提升 Compaction 效率',
          actions: [
            '检查 BE 节点的 CPU 和内存使用情况',
            '适当增加 compact_threads 配置',
            '检查是否有大量小文件导致 Compaction 效率低下',
            '考虑调整分桶数量以减少单个任务的数据量'
          ]
        });
      }
    });

    return recommendations;
  }
}

export { StarRocksCompactionExpertSolutionC };
