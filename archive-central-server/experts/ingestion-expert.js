/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Ingestion 专家模块
 * 负责：数据摄入分析、Stream Load/Broker Load/Routine Load 诊断、导入性能优化等
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import fs from 'node:fs';
import { detectArchitectureType } from './common-utils.js';

// Gemini API for LLM-based analysis
let GoogleGenerativeAI = null;
try {
  const genaiModule = await import('@google/genai');
  GoogleGenerativeAI =
    genaiModule.GoogleGenerativeAI || genaiModule.default?.GoogleGenerativeAI;
} catch (error) {
  console.warn(
    '⚠️ Gemini API not available, LLM analysis will be disabled:',
    error.message,
  );
}

class StarRocksIngestionExpert {
  constructor() {
    this.name = 'ingestion';
    this.version = '1.0.0';
    this.description =
      'StarRocks Ingestion 系统专家 - 负责数据摄入问题诊断、性能分析、任务监控等';

    // Import专业知识规则库
    this.rules = {
      // Stream Load 规则
      stream_load: {
        max_file_size_mb: 10 * 1024, // 10GB
        recommended_batch_size_mb: 100, // 100MB
        timeout_seconds: 3600, // 1小时
        max_filter_ratio: 0.1, // 10% 错误率阈值
      },

      // Broker Load 规则
      broker_load: {
        max_parallelism: 5,
        load_timeout_seconds: 14400, // 4小时
        recommended_file_size_mb: 1024, // 1GB per file
        max_error_number: 1000,
      },

      // Routine Load 规则
      routine_load: {
        max_lag_time_seconds: 300, // 5分钟延迟阈值
        recommended_task_consume_second: 3,
        max_batch_interval_seconds: 20,
        max_batch_rows: 200000,
        max_batch_size_mb: 100,
      },

      // Insert 规则
      insert_load: {
        recommended_batch_size: 1000,
        max_batch_size: 10000,
        timeout_seconds: 300,
      },

      // 性能阈值
      performance: {
        slow_load_threshold_seconds: 300,
        low_throughput_mb_per_second: 10,
        high_error_rate_percent: 5,
      },
    };

    // Import 相关术语
    this.terminology = {
      stream_load: 'Stream Load: 通过HTTP PUT同步导入数据，适合小批量实时导入',
      broker_load:
        'Broker Load: 通过Broker异步导入HDFS/S3数据，适合大批量历史数据',
      routine_load: 'Routine Load: 持续消费Kafka数据，适合实时流式导入',
      insert_load: 'Insert Load: 通过INSERT语句导入数据，适合少量数据插入',
      load_job: '导入作业，包含导入任务的所有信息和状态',
      error_hub: '错误数据中心，存储导入过程中的错误数据',
    };
  }

  /**
   * Import 系统综合分析（MCP 工具接口）
   */
  async analyze(connection, options = {}) {
    const includeDetails = options.includeDetails !== false;
    return await this.diagnose(connection, includeDetails);
  }

  /**
   * Import 系统综合诊断
   */
  async diagnose(connection, includeDetails = true) {
    try {
      const startTime = new Date();

      // 1. 收集Import相关数据
      const importData = await this.collectImportData(connection);

      // 2. 执行专业诊断分析
      const diagnosis = this.performImportDiagnosis(importData);

      // 3. 生成专业建议
      const recommendations = this.generateImportRecommendations(
        diagnosis,
        importData,
      );

      // 4. 计算Import健康分数
      const healthScore = this.calculateImportHealthScore(diagnosis);

      const endTime = new Date();
      const analysisTime = endTime - startTime;

      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        analysis_duration_ms: analysisTime,
        import_health: healthScore,
        diagnosis_results: diagnosis,
        professional_recommendations: recommendations,
        raw_data: includeDetails ? importData : null,
        optimization_suggestions:
          this.generateOptimizationSuggestions(importData),
      };
    } catch (error) {
      throw new Error(`Import专家诊断失败: ${error.message}`);
    }
  }

  /**
   * 混合查询 Stream Load 任务（结合 loads_history 和 information_schema.loads）
   *
   * @param {Object} connection - 数据库连接
   * @param {Object} options - 查询选项
   * @param {string} options.dbName - 数据库名（可选）
   * @param {string} options.tableName - 表名（可选）
   * @param {number} options.hours - 查询时间范围（小时，默认24）
   * @param {number} options.recentMinutes - 内存表补充时间（分钟，默认2）
   * @returns {Array} 去重后的 Stream Load 任务列表
   */
  async getStreamLoadTasksHybrid(connection, options = {}) {
    const {
      dbName = null,
      tableName = null,
      hours = 24,
      recentMinutes = 2,
    } = options;

    const allLoads = [];

    // 1. 查询持久化历史表 (_statistics_.loads_history)
    try {
      let historyQuery = `
        SELECT
          id,
          label,
          profile_id,
          db_name,
          table_name,
          user,
          warehouse,
          state,
          progress,
          type,
          priority,
          scan_rows,
          scan_bytes,
          filtered_rows,
          unselected_rows,
          sink_rows,
          runtime_details,
          create_time,
          load_start_time,
          load_commit_time,
          load_finish_time,
          properties,
          error_msg,
          tracking_sql,
          rejected_record_path,
          job_id,
          'loads_history' as data_source
        FROM _statistics_.loads_history
        WHERE type = 'STREAM_LOAD'
          AND create_time >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      `;

      const params = [hours];

      if (dbName) {
        historyQuery += ' AND db_name = ?';
        params.push(dbName);
      }
      if (tableName) {
        historyQuery += ' AND table_name = ?';
        params.push(tableName);
      }

      historyQuery += ' ORDER BY create_time DESC';

      const [historyResults] = await connection.query(historyQuery, params);
      allLoads.push(...historyResults);

      console.log(
        `[HybridQuery] 从 loads_history 获取 ${historyResults.length} 条记录`,
      );
    } catch (error) {
      console.warn(`[HybridQuery] 查询 loads_history 失败: ${error.message}`);
    }

    // 2. 补充查询内存表 (information_schema.loads) - 最新数据可能还未同步
    try {
      let recentQuery = `
        SELECT
          ID as id,
          LABEL as label,
          PROFILE_ID as profile_id,
          DB_NAME as db_name,
          TABLE_NAME as table_name,
          USER as user,
          WAREHOUSE as warehouse,
          STATE as state,
          PROGRESS as progress,
          TYPE as type,
          PRIORITY as priority,
          SCAN_ROWS as scan_rows,
          SCAN_BYTES as scan_bytes,
          FILTERED_ROWS as filtered_rows,
          UNSELECTED_ROWS as unselected_rows,
          SINK_ROWS as sink_rows,
          RUNTIME_DETAILS as runtime_details,
          CREATE_TIME as create_time,
          LOAD_START_TIME as load_start_time,
          LOAD_COMMIT_TIME as load_commit_time,
          LOAD_FINISH_TIME as load_finish_time,
          PROPERTIES as properties,
          ERROR_MSG as error_msg,
          TRACKING_SQL as tracking_sql,
          REJECTED_RECORD_PATH as rejected_record_path,
          JOB_ID as job_id,
          'information_schema' as data_source
        FROM information_schema.loads
        WHERE TYPE = 'STREAM LOAD'
          AND CREATE_TIME >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
      `;

      const recentParams = [recentMinutes];

      // information_schema.loads 有 DB_NAME 和 TABLE_NAME 字段
      if (dbName) {
        recentQuery += ' AND DB_NAME = ?';
        recentParams.push(dbName);
      }
      if (tableName) {
        recentQuery += ' AND TABLE_NAME = ?';
        recentParams.push(tableName);
      }

      recentQuery += ' ORDER BY CREATE_TIME DESC';

      const [recentResults] = await connection.query(recentQuery, recentParams);
      allLoads.push(...recentResults);

      console.log(
        `[HybridQuery] 从 information_schema.loads 补充 ${recentResults.length} 条记录`,
      );
    } catch (error) {
      console.warn(
        `[HybridQuery] 查询 information_schema.loads 失败: ${error.message}`,
      );
    }

    // 3. 去重：优先使用 loads_history 的数据（更完整），按 label 或 job_id 去重
    const uniqueMap = new Map();

    // 先添加 information_schema 的数据（优先级低）
    allLoads
      .filter((load) => load.data_source === 'information_schema')
      .forEach((load) => {
        const key = load.label || load.job_id;
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, load);
        }
      });

    // 再添加 loads_history 的数据（优先级高，会覆盖重复的）
    allLoads
      .filter((load) => load.data_source === 'loads_history')
      .forEach((load) => {
        const key = load.label || load.job_id;
        if (key) {
          uniqueMap.set(key, load);
        }
      });

    const uniqueLoads = Array.from(uniqueMap.values());

    console.log(
      `[HybridQuery] 去重后共 ${uniqueLoads.length} 条记录（总共获取 ${allLoads.length} 条）`,
    );

    // 按创建时间倒序排序
    uniqueLoads.sort(
      (a, b) => new Date(b.create_time) - new Date(a.create_time),
    );

    return uniqueLoads;
  }

  /**
   * 收集Import相关数据
   */
  async collectImportData(connection) {
    const data = {};

    // 1. 获取最近的导入作业（使用混合查询，避免数据丢失）
    try {
      // 优先使用混合查询获取 Stream Load 数据
      const streamLoads = await this.getStreamLoadTasksHybrid(connection, {
        hours: 24,
      });

      // 补充其他类型的导入作业（从 information_schema.loads）
      const [otherLoads] = await connection.query(`
        SELECT JOB_ID, LABEL, STATE, PROGRESS, TYPE, TASK_INFO, ERROR_MSG,
               CREATE_TIME, ETL_START_TIME, ETL_FINISH_TIME, LOAD_START_TIME, LOAD_FINISH_TIME,
               URL, TRACKING_URL, TRACKING_SQL
        FROM information_schema.loads
        WHERE CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND TYPE != 'STREAM LOAD'
        ORDER BY CREATE_TIME DESC
        LIMIT 100;
      `);

      // 合并 Stream Load 和其他类型的导入
      data.recent_loads = [...streamLoads, ...otherLoads]
        .sort((a, b) => new Date(b.create_time) - new Date(a.create_time))
        .slice(0, 100);

      console.log(
        `[CollectData] 获取 recent_loads: ${streamLoads.length} Stream Load + ${otherLoads.length} 其他类型`,
      );
    } catch (error) {
      console.warn('Failed to collect recent loads:', error.message);
      data.recent_loads = [];
    }

    // 2. 获取正在运行的导入任务
    try {
      const [runningLoads] = await connection.query(`
        SELECT JOB_ID, LABEL, STATE, PROGRESS, TYPE, CREATE_TIME
        FROM information_schema.loads
        WHERE STATE IN ('PENDING', 'ETL', 'LOADING')
        ORDER BY CREATE_TIME DESC;
      `);
      data.running_loads = runningLoads;
    } catch (error) {
      console.warn('Failed to collect running loads:', error.message);
      data.running_loads = [];
    }

    // 3. 获取失败的导入作业
    try {
      const [failedLoads] = await connection.query(`
        SELECT JOB_ID, LABEL, STATE, TYPE, ERROR_MSG, CREATE_TIME
        FROM information_schema.loads
        WHERE STATE = 'CANCELLED' AND CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY CREATE_TIME DESC
        LIMIT 50;
      `);
      data.failed_loads = failedLoads;
    } catch (error) {
      console.warn('Failed to collect failed loads:', error.message);
      data.failed_loads = [];
    }

    // 4. 获取Routine Load信息
    try {
      // Note: routine_loads表在某些StarRocks版本中不存在
      // 尝试从loads表获取ROUTINE_LOAD类型的任务
      const [routineLoads] = await connection.query(`
        SELECT JOB_ID, LABEL, STATE, PROGRESS, TYPE, CREATE_TIME
        FROM information_schema.loads
        WHERE TYPE = 'ROUTINE_LOAD'
        ORDER BY CREATE_TIME DESC
        LIMIT 100;
      `);
      data.routine_loads = routineLoads;
    } catch (error) {
      console.warn('Failed to collect routine loads:', error.message);
      data.routine_loads = [];
    }

    // 5. 获取Stream Load统计（使用混合查询的数据）
    try {
      // 直接从前面获取的 stream loads 计算统计
      const streamLoads = data.recent_loads.filter(
        (load) => load.type === 'STREAM_LOAD' || load.type === 'STREAM LOAD',
      );

      const totalJobs = streamLoads.length;
      const successJobs = streamLoads.filter(
        (load) => load.state === 'FINISHED',
      ).length;
      const failedJobs = streamLoads.filter(
        (load) => load.state === 'CANCELLED',
      ).length;

      // 计算平均加载时间
      const finishedLoads = streamLoads.filter(
        (load) =>
          load.state === 'FINISHED' &&
          load.load_start_time &&
          load.load_finish_time,
      );

      let avgLoadTimeSeconds = 0;
      if (finishedLoads.length > 0) {
        const totalSeconds = finishedLoads.reduce((sum, load) => {
          const start = new Date(load.load_start_time).getTime();
          const finish = new Date(load.load_finish_time).getTime();
          return sum + (finish - start) / 1000;
        }, 0);
        avgLoadTimeSeconds = totalSeconds / finishedLoads.length;
      }

      data.stream_load_stats = {
        total_jobs: totalJobs,
        success_jobs: successJobs,
        failed_jobs: failedJobs,
        avg_load_time_seconds: avgLoadTimeSeconds,
      };

      console.log(
        `[CollectData] Stream Load 统计: ${totalJobs} 总任务, ${successJobs} 成功, ${failedJobs} 失败`,
      );
    } catch (error) {
      console.warn('Failed to collect stream load stats:', error.message);
      data.stream_load_stats = {};
    }

    // 6. 获取表的导入频率统计（基于混合查询的数据）
    try {
      // 从已获取的数据中统计（避免重复查询）
      const tableStatsMap = new Map();

      data.recent_loads.forEach((load) => {
        // 提取数据库名和表名
        let dbName = load.db_name;
        let tableName = load.table_name;

        // 如果没有 db_name/table_name，尝试从 JOB_DETAILS 提取
        if (
          (!dbName || !tableName) &&
          load.JOB_DETAILS &&
          typeof load.JOB_DETAILS === 'string'
        ) {
          const dbMatch = load.JOB_DETAILS.match(/database=([^,]+)/);
          const tableMatch = load.JOB_DETAILS.match(/table=([^,]+)/);
          if (dbMatch) dbName = dbMatch[1];
          if (tableMatch) tableName = tableMatch[1];
        }

        if (dbName && tableName) {
          const key = `${dbName}.${tableName}`;
          if (!tableStatsMap.has(key)) {
            tableStatsMap.set(key, {
              database_name: dbName,
              table_name: tableName,
              load_count: 0,
              success_count: 0,
              failed_count: 0,
            });
          }

          const stats = tableStatsMap.get(key);
          stats.load_count++;
          if (load.state === 'FINISHED') stats.success_count++;
          if (load.state === 'CANCELLED') stats.failed_count++;
        }
      });

      // 转换为数组并排序
      data.table_load_stats = Array.from(tableStatsMap.values())
        .sort((a, b) => b.load_count - a.load_count)
        .slice(0, 20);

      console.log(
        `[CollectData] 表导入统计: ${data.table_load_stats.length} 个表`,
      );
    } catch (error) {
      console.warn('Failed to collect table load stats:', error.message);
      data.table_load_stats = [];
    }

    // 7. 分析Stream Load导入频率
    try {
      data.import_frequency_analysis =
        await this.analyzeImportFrequency(connection);
    } catch (error) {
      console.warn('Failed to analyze import frequency:', error.message);
      data.import_frequency_analysis = {};
    }

    return data;
  }

  /**
   * 分析Stream Load导入频率（使用混合查询）
   */
  async analyzeImportFrequency(connection) {
    const frequencyAnalysis = {
      tables: [],
      patterns: {},
      insights: [],
    };

    try {
      // 1. 使用混合查询获取 7 天内的 Stream Load 数据
      const hybridLoads = await this.getStreamLoadTasksHybrid(connection, {
        hours: 7 * 24, // 7 天
      });

      // 转换为 processLoadHistoryData 期望的格式
      const formattedLoads = hybridLoads.map((load) => ({
        DATABASE_NAME: load.db_name,
        TABLE_NAME: load.table_name,
        CREATE_TIME: load.create_time,
        STATE: load.state,
        TYPE: load.type,
      }));

      console.log(
        `[FrequencyAnalysis] 使用混合查询获取 ${formattedLoads.length} 条 Stream Load 记录`,
      );

      await this.processLoadHistoryData(formattedLoads, frequencyAnalysis);

      // 2. 计算每个表的导入频率模式
      this.calculateFrequencyPatterns(frequencyAnalysis);

      // 3. 生成频率分析洞察
      this.generateFrequencyInsights(frequencyAnalysis);

      frequencyAnalysis.source_table = historyQuery;
    } catch (error) {
      console.warn('Error in import frequency analysis:', error.message);
    }

    return frequencyAnalysis;
  }

  /**
   * 处理导入历史数据
   */
  async processLoadHistoryData(loads, frequencyAnalysis) {
    const tableMap = new Map();

    // 按表分组处理数据
    loads.forEach((load) => {
      const key = `${load.DATABASE_NAME}.${load.TABLE_NAME}`;

      if (!tableMap.has(key)) {
        tableMap.set(key, {
          database: load.DATABASE_NAME,
          table: load.TABLE_NAME,
          loads: [],
          totalLoads: 0,
          successLoads: 0,
          failedLoads: 0,
        });
      }

      const tableData = tableMap.get(key);
      tableData.loads.push({
        create_time: load.CREATE_TIME,
        state: load.STATE,
        timestamp: new Date(load.CREATE_TIME).getTime(),
      });

      tableData.totalLoads++;
      if (load.STATE === 'FINISHED') {
        tableData.successLoads++;
      } else if (load.STATE === 'CANCELLED') {
        tableData.failedLoads++;
      }
    });

    // 为每个表计算频率统计
    for (const [key, tableData] of tableMap) {
      if (tableData.loads.length < 2) continue; // 至少需要2条记录才能分析频率

      // 按时间排序
      tableData.loads.sort((a, b) => a.timestamp - b.timestamp);

      // 计算导入间隔
      const intervals = [];
      for (let i = 1; i < tableData.loads.length; i++) {
        const interval =
          (tableData.loads[i].timestamp - tableData.loads[i - 1].timestamp) /
          1000; // 秒
        intervals.push(interval);
      }

      // 计算频率统计
      const avgInterval =
        intervals.reduce((sum, interval) => sum + interval, 0) /
        intervals.length;
      const minInterval = Math.min(...intervals);
      const maxInterval = Math.max(...intervals);

      // 计算标准差
      const variance =
        intervals.reduce(
          (sum, interval) => sum + Math.pow(interval - avgInterval, 2),
          0,
        ) / intervals.length;
      const stdDev = Math.sqrt(variance);

      // 确定频率模式
      const frequencyPattern = this.determineFrequencyPattern(
        avgInterval,
        stdDev,
        intervals,
      );

      const tableFrequency = {
        database: tableData.database,
        table: tableData.table,
        totalLoads: tableData.totalLoads,
        successLoads: tableData.successLoads,
        failedLoads: tableData.failedLoads,
        successRate: (
          (tableData.successLoads / tableData.totalLoads) *
          100
        ).toFixed(1),
        avgIntervalSeconds: Math.round(avgInterval),
        avgIntervalMinutes: Math.round(avgInterval / 60),
        avgIntervalHours: (avgInterval / 3600).toFixed(1),
        minIntervalSeconds: Math.round(minInterval),
        maxIntervalSeconds: Math.round(maxInterval),
        intervalStdDev: Math.round(stdDev),
        frequencyPattern: frequencyPattern,
        loadsPerHour: (3600 / avgInterval).toFixed(2),
        loadsPerDay: (86400 / avgInterval).toFixed(1),
        regularity: this.calculateRegularity(stdDev, avgInterval),
        timeSpan: {
          start: tableData.loads[0].create_time,
          end: tableData.loads[tableData.loads.length - 1].create_time,
          durationHours: (
            (tableData.loads[tableData.loads.length - 1].timestamp -
              tableData.loads[0].timestamp) /
            3600000
          ).toFixed(1),
        },
      };

      frequencyAnalysis.tables.push(tableFrequency);
    }

    // 按导入频率排序
    frequencyAnalysis.tables.sort(
      (a, b) => parseFloat(b.loadsPerHour) - parseFloat(a.loadsPerHour),
    );
  }

  /**
   * 确定频率模式
   */
  determineFrequencyPattern(avgInterval, stdDev, intervals) {
    const avgMinutes = avgInterval / 60;
    const cvPercent = (stdDev / avgInterval) * 100; // 变异系数

    let pattern = '';
    let regularity = '';

    // 确定频率类型
    if (avgMinutes < 1) {
      pattern = 'high-frequency'; // 高频：小于1分钟
    } else if (avgMinutes < 15) {
      pattern = 'frequent'; // 频繁：1-15分钟
    } else if (avgMinutes < 60) {
      pattern = 'moderate'; // 中等：15-60分钟
    } else if (avgMinutes < 240) {
      pattern = 'hourly'; // 小时级：1-4小时
    } else if (avgMinutes < 1440) {
      pattern = 'daily'; // 日级：4小时-1天
    } else {
      pattern = 'low-frequency'; // 低频：大于1天
    }

    // 确定规律性
    if (cvPercent < 20) {
      regularity = 'very-regular'; // 很规律
    } else if (cvPercent < 50) {
      regularity = 'regular'; // 规律
    } else if (cvPercent < 100) {
      regularity = 'irregular'; // 不规律
    } else {
      regularity = 'very-irregular'; // 很不规律
    }

    return {
      frequency: pattern,
      regularity: regularity,
      cvPercent: cvPercent.toFixed(1),
    };
  }

  /**
   * 计算规律性分数
   */
  calculateRegularity(stdDev, avgInterval) {
    const cv = stdDev / avgInterval;
    let score = Math.max(0, 100 - cv * 100);

    let level = '';
    if (score >= 80) level = 'very-regular';
    else if (score >= 60) level = 'regular';
    else if (score >= 40) level = 'somewhat-regular';
    else level = 'irregular';

    return {
      score: Math.round(score),
      level: level,
    };
  }

  /**
   * 计算频率模式统计
   */
  calculateFrequencyPatterns(frequencyAnalysis) {
    const patterns = {
      'high-frequency': { count: 0, tables: [] },
      frequent: { count: 0, tables: [] },
      moderate: { count: 0, tables: [] },
      hourly: { count: 0, tables: [] },
      daily: { count: 0, tables: [] },
      'low-frequency': { count: 0, tables: [] },
    };

    const regularityStats = {
      'very-regular': 0,
      regular: 0,
      irregular: 0,
      'very-irregular': 0,
    };

    frequencyAnalysis.tables.forEach((table) => {
      const pattern = table.frequencyPattern.frequency;
      const regularity = table.frequencyPattern.regularity;

      if (patterns[pattern]) {
        patterns[pattern].count++;
        patterns[pattern].tables.push(`${table.database}.${table.table}`);
      }

      if (regularityStats[regularity] !== undefined) {
        regularityStats[regularity]++;
      }
    });

    frequencyAnalysis.patterns = {
      frequency_distribution: patterns,
      regularity_distribution: regularityStats,
      total_tables: frequencyAnalysis.tables.length,
    };
  }

  /**
   * 生成频率分析洞察
   */
  generateFrequencyInsights(frequencyAnalysis) {
    const insights = [];
    const tables = frequencyAnalysis.tables;

    if (tables.length === 0) {
      insights.push({
        type: 'no_data',
        message: '未发现足够的Stream Load历史数据进行频率分析',
        recommendation: '建议增加数据导入活动或检查更长时间范围的数据',
      });
      frequencyAnalysis.insights = insights;
      return;
    }

    // 1. 高频导入表分析
    const highFreqTables = tables.filter(
      (t) => t.frequencyPattern.frequency === 'high-frequency',
    );
    if (highFreqTables.length > 0) {
      insights.push({
        type: 'high_frequency_import',
        message: `发现 ${highFreqTables.length} 个高频导入表（间隔<1分钟）`,
        tables: highFreqTables.slice(0, 5).map((t) => ({
          table: `${t.database}.${t.table}`,
          interval_seconds: t.avgIntervalSeconds,
          loads_per_hour: t.loadsPerHour,
        })),
        recommendation: '考虑合并小批次导入以提高效率，减少系统负载',
      });
    }

    // 2. 不规律导入模式分析
    const irregularTables = tables.filter((t) => t.regularity.score < 40);
    if (irregularTables.length > 0) {
      insights.push({
        type: 'irregular_import_pattern',
        message: `发现 ${irregularTables.length} 个导入模式不规律的表`,
        tables: irregularTables.slice(0, 5).map((t) => ({
          table: `${t.database}.${t.table}`,
          regularity_score: t.regularity.score,
          cv_percent: t.frequencyPattern.cvPercent,
        })),
        recommendation: '建议优化导入调度，建立更规律的导入模式',
      });
    }

    // 3. 导入成功率分析
    const lowSuccessTables = tables.filter(
      (t) => parseFloat(t.successRate) < 95,
    );
    if (lowSuccessTables.length > 0) {
      insights.push({
        type: 'low_success_rate',
        message: `发现 ${lowSuccessTables.length} 个表的导入成功率较低`,
        tables: lowSuccessTables.slice(0, 5).map((t) => ({
          table: `${t.database}.${t.table}`,
          success_rate: t.successRate + '%',
          total_loads: t.totalLoads,
          failed_loads: t.failedLoads,
        })),
        recommendation: '检查数据格式、网络连接和系统资源，提高导入成功率',
      });
    }

    // 4. 负载分布分析
    const totalLoadsPerHour = tables.reduce(
      (sum, t) => sum + parseFloat(t.loadsPerHour),
      0,
    );
    if (totalLoadsPerHour > 1000) {
      insights.push({
        type: 'high_system_load',
        message: `系统总导入负载较高：每小时 ${totalLoadsPerHour.toFixed(0)} 次导入`,
        metrics: {
          total_loads_per_hour: Math.round(totalLoadsPerHour),
          active_tables: tables.length,
          avg_loads_per_table: (totalLoadsPerHour / tables.length).toFixed(1),
        },
        recommendation: '监控系统资源使用，考虑优化导入调度或扩容',
      });
    }

    // 5. 最活跃表分析
    const topActiveTables = tables.slice(0, 3);
    if (topActiveTables.length > 0) {
      insights.push({
        type: 'most_active_tables',
        message: '最活跃的导入表',
        tables: topActiveTables.map((t) => ({
          table: `${t.database}.${t.table}`,
          loads_per_hour: t.loadsPerHour,
          frequency_pattern: t.frequencyPattern.frequency,
          regularity: t.regularity.level,
        })),
        recommendation: '重点监控这些活跃表的性能和资源使用情况',
      });
    }

    frequencyAnalysis.insights = insights;
  }

  /**
   * 执行Import专业诊断
   */
  performImportDiagnosis(data) {
    const issues = [];
    const warnings = [];
    const criticals = [];
    const insights = [];

    // 1. 诊断导入作业失败率
    this.diagnoseLoadFailureRate(data, issues, warnings, criticals);

    // 2. 诊断导入性能
    this.diagnoseLoadPerformance(data, warnings, insights);

    // 3. 诊断Routine Load状态
    this.diagnoseRoutineLoadHealth(data, warnings, criticals);

    // 4. 诊断导入作业堆积
    this.diagnoseLoadQueue(data, warnings, criticals);

    // 5. 诊断常见错误模式
    this.diagnoseCommonErrors(data, issues, warnings, criticals);

    // 6. 分析导入频率模式
    this.diagnoseImportFrequency(data, warnings, insights);

    return {
      total_issues: issues.length + warnings.length + criticals.length,
      criticals: criticals,
      warnings: warnings,
      issues: issues,
      insights: insights,
      summary: this.generateImportSummary(criticals, warnings, issues),
    };
  }

  /**
   * 诊断导入频率模式
   */
  diagnoseImportFrequency(data, warnings, insights) {
    const frequencyData = data.import_frequency_analysis;

    if (
      !frequencyData ||
      !frequencyData.tables ||
      frequencyData.tables.length === 0
    ) {
      insights.push({
        type: 'import_frequency_no_data',
        message: '导入频率分析：未发现足够的历史数据',
        recommendation: '建议检查数据源或扩大分析时间范围',
      });
      return;
    }

    // 1. 添加频率分析的洞察到总洞察中
    if (frequencyData.insights && frequencyData.insights.length > 0) {
      frequencyData.insights.forEach((insight) => {
        insights.push({
          type: `frequency_${insight.type}`,
          message: `导入频率分析：${insight.message}`,
          details: insight.tables || insight.metrics,
          recommendation: insight.recommendation,
        });
      });
    }

    // 2. 检查高频导入警告
    const highFreqTables = frequencyData.tables.filter(
      (t) => t.frequencyPattern.frequency === 'high-frequency',
    );

    if (highFreqTables.length > 3) {
      warnings.push({
        type: 'excessive_high_frequency_imports',
        severity: 'WARNING',
        message: `发现过多高频导入表 (${highFreqTables.length} 个)，可能影响系统性能`,
        affected_tables: highFreqTables.slice(0, 5).map((t) => ({
          table: `${t.database}.${t.table}`,
          loads_per_hour: t.loadsPerHour,
          avg_interval_seconds: t.avgIntervalSeconds,
        })),
        impact: '过多的高频导入可能导致系统负载过高和资源竞争',
        urgency: 'WITHIN_DAYS',
      });
    }

    // 3. 检查导入模式不规律的警告
    const irregularTables = frequencyData.tables.filter(
      (t) => t.regularity.score < 40,
    );

    if (irregularTables.length > frequencyData.tables.length * 0.5) {
      warnings.push({
        type: 'irregular_import_patterns',
        severity: 'WARNING',
        message: `超过半数表的导入模式不规律 (${irregularTables.length}/${frequencyData.tables.length})`,
        irregular_tables: irregularTables.slice(0, 5).map((t) => ({
          table: `${t.database}.${t.table}`,
          regularity_score: t.regularity.score,
          cv_percent: t.frequencyPattern.cvPercent,
        })),
        impact: '不规律的导入模式可能导致资源使用不均和性能波动',
        urgency: 'WITHIN_WEEKS',
      });
    }

    // 4. 添加频率统计洞察
    const patterns = frequencyData.patterns;
    if (patterns && patterns.total_tables > 0) {
      insights.push({
        type: 'import_frequency_statistics',
        message: '导入频率分布统计',
        statistics: {
          total_tables_analyzed: patterns.total_tables,
          frequency_distribution: patterns.frequency_distribution,
          regularity_distribution: patterns.regularity_distribution,
          data_source: frequencyData.source_table,
        },
        recommendations: this.generateFrequencyRecommendations(frequencyData),
      });
    }
  }

  /**
   * 生成频率相关建议
   */
  generateFrequencyRecommendations(frequencyData) {
    const recommendations = [];
    const patterns = frequencyData.patterns;

    if (!patterns) return recommendations;

    // 高频导入优化建议
    if (patterns.frequency_distribution['high-frequency'].count > 0) {
      recommendations.push('考虑合并高频导入批次，减少系统调用开销');
    }

    // 不规律导入优化建议
    if (
      patterns.regularity_distribution['irregular'] +
        patterns.regularity_distribution['very-irregular'] >
      patterns.total_tables * 0.3
    ) {
      recommendations.push('建立规律的导入调度机制，提高资源利用效率');
    }

    // 负载均衡建议
    if (
      patterns.frequency_distribution['frequent'].count >
      patterns.total_tables * 0.5
    ) {
      recommendations.push('监控系统负载，考虑在低峰期调度部分导入任务');
    }

    return recommendations.length > 0
      ? recommendations
      : ['当前导入频率模式合理，保持现有策略'];
  }

  /**
   * 诊断导入作业失败率
   */
  diagnoseLoadFailureRate(data, issues, warnings, criticals) {
    const stats = data.stream_load_stats;
    const recentLoads = data.recent_loads || [];

    if (stats.total_jobs > 0) {
      const failureRate = (stats.failed_jobs / stats.total_jobs) * 100;

      if (failureRate > 20) {
        criticals.push({
          type: 'high_load_failure_rate',
          severity: 'CRITICAL',
          message: `导入失败率过高: ${failureRate.toFixed(1)}%`,
          metrics: {
            total_jobs: stats.total_jobs,
            failed_jobs: stats.failed_jobs,
            failure_rate: failureRate.toFixed(1),
          },
          impact: '大量导入失败可能导致数据丢失和业务中断',
          urgency: 'IMMEDIATE',
        });
      } else if (failureRate > 10) {
        warnings.push({
          type: 'moderate_load_failure_rate',
          severity: 'WARNING',
          message: `导入失败率较高: ${failureRate.toFixed(1)}%`,
          metrics: {
            total_jobs: stats.total_jobs,
            failed_jobs: stats.failed_jobs,
            failure_rate: failureRate.toFixed(1),
          },
          impact: '需要关注导入质量，建议检查数据格式和配置',
          urgency: 'WITHIN_HOURS',
        });
      }
    }

    // 检查最近失败的作业
    const recentFailures = recentLoads.filter(
      (load) => load.STATE === 'CANCELLED',
    );
    if (recentFailures.length > 5) {
      warnings.push({
        type: 'frequent_load_failures',
        severity: 'WARNING',
        message: `最近24小时内有 ${recentFailures.length} 个导入作业失败`,
        affected_count: recentFailures.length,
        impact: '频繁的导入失败可能指示系统性问题',
        urgency: 'WITHIN_HOURS',
      });
    }
  }

  /**
   * 诊断导入性能
   */
  diagnoseLoadPerformance(data, warnings, insights) {
    const stats = data.stream_load_stats;

    if (
      stats.avg_load_time_seconds >
      this.rules.performance.slow_load_threshold_seconds
    ) {
      warnings.push({
        type: 'slow_load_performance',
        severity: 'WARNING',
        message: `平均导入时间过长: ${stats.avg_load_time_seconds.toFixed(1)} 秒`,
        metrics: {
          avg_load_time: stats.avg_load_time_seconds.toFixed(1),
          threshold: this.rules.performance.slow_load_threshold_seconds,
        },
        impact: '导入性能低下可能影响数据实时性',
        urgency: 'WITHIN_DAYS',
      });
    }

    // 分析表级别的导入模式
    const tableStats = data.table_load_stats || [];
    const highVolumeTable = tableStats.find((table) => table.load_count > 100);

    if (highVolumeTable) {
      insights.push({
        type: 'high_volume_import_analysis',
        message: '发现高频导入表',
        analysis: {
          table: `${highVolumeTable.database_name}.${highVolumeTable.table_name}`,
          load_count: highVolumeTable.load_count,
          success_rate: (
            (highVolumeTable.success_count / highVolumeTable.load_count) *
            100
          ).toFixed(1),
        },
        recommendations: [
          '考虑优化导入频率，合并小批次导入',
          '监控表的导入性能和资源使用',
          '评估是否需要调整表结构或分区策略',
        ],
      });
    }
  }

  /**
   * 诊断Routine Load健康状态
   */
  diagnoseRoutineLoadHealth(data, warnings, criticals) {
    const routineLoads = data.routine_loads || [];

    routineLoads.forEach((routine) => {
      if (routine.STATE === 'PAUSED') {
        warnings.push({
          type: 'routine_load_paused',
          severity: 'WARNING',
          message: `Routine Load作业 "${routine.NAME}" 处于暂停状态`,
          routine_name: routine.NAME,
          table_name: routine.TABLE_NAME,
          pause_time: routine.PAUSE_TIME,
          impact: '流式导入中断可能导致数据延迟',
          urgency: 'WITHIN_HOURS',
        });
      } else if (routine.STATE === 'CANCELLED') {
        criticals.push({
          type: 'routine_load_cancelled',
          severity: 'CRITICAL',
          message: `Routine Load作业 "${routine.NAME}" 已被取消`,
          routine_name: routine.NAME,
          table_name: routine.TABLE_NAME,
          end_time: routine.END_TIME,
          error_msg: routine.OTHER_MSG,
          impact: '流式导入停止，可能导致数据丢失',
          urgency: 'IMMEDIATE',
        });
      }
    });
  }

  /**
   * 诊断导入作业堆积
   */
  diagnoseLoadQueue(data, warnings, criticals) {
    const runningLoads = data.running_loads || [];
    const pendingLoads = runningLoads.filter(
      (load) => load.STATE === 'PENDING',
    );

    if (pendingLoads.length > 10) {
      criticals.push({
        type: 'load_queue_backlog',
        severity: 'CRITICAL',
        message: `导入队列积压严重，有 ${pendingLoads.length} 个作业等待执行`,
        pending_count: pendingLoads.length,
        impact: '导入队列积压可能导致数据延迟和超时',
        urgency: 'IMMEDIATE',
      });
    } else if (pendingLoads.length > 5) {
      warnings.push({
        type: 'load_queue_buildup',
        severity: 'WARNING',
        message: `导入队列有 ${pendingLoads.length} 个作业等待执行`,
        pending_count: pendingLoads.length,
        impact: '需要监控导入队列，避免进一步积压',
        urgency: 'WITHIN_HOURS',
      });
    }

    // 检查长时间运行的作业
    const now = new Date();
    const longRunningLoads = runningLoads.filter((load) => {
      if (!load.CREATE_TIME) return false;
      const createTime = new Date(load.CREATE_TIME);
      const runningHours = (now - createTime) / (1000 * 60 * 60);
      return runningHours > 2; // 超过2小时
    });

    if (longRunningLoads.length > 0) {
      warnings.push({
        type: 'long_running_loads',
        severity: 'WARNING',
        message: `发现 ${longRunningLoads.length} 个长时间运行的导入作业`,
        long_running_jobs: longRunningLoads.map((load) => ({
          job_id: load.JOB_ID,
          label: load.LABEL,
          state: load.STATE,
          type: load.TYPE,
          running_hours:
            Math.round(
              ((now - new Date(load.CREATE_TIME)) / (1000 * 60 * 60)) * 10,
            ) / 10,
        })),
        impact: '长时间运行的作业可能阻塞导入队列',
        urgency: 'WITHIN_HOURS',
      });
    }
  }

  /**
   * 诊断常见错误模式
   */
  diagnoseCommonErrors(data, issues, warnings, criticals) {
    const failedLoads = data.failed_loads || [];

    // 统计错误类型
    const errorPatterns = {};
    failedLoads.forEach((load) => {
      if (load.ERROR_MSG) {
        // 简化错误信息提取关键词
        let errorType = 'unknown';
        const errorMsg = load.ERROR_MSG.toLowerCase();

        if (errorMsg.includes('timeout')) {
          errorType = 'timeout';
        } else if (errorMsg.includes('format') || errorMsg.includes('parse')) {
          errorType = 'format_error';
        } else if (
          errorMsg.includes('permission') ||
          errorMsg.includes('access')
        ) {
          errorType = 'permission_error';
        } else if (errorMsg.includes('memory') || errorMsg.includes('oom')) {
          errorType = 'memory_error';
        } else if (errorMsg.includes('duplicate') || errorMsg.includes('key')) {
          errorType = 'duplicate_key';
        }

        errorPatterns[errorType] = (errorPatterns[errorType] || 0) + 1;
      }
    });

    // 分析错误模式
    Object.entries(errorPatterns).forEach(([errorType, count]) => {
      if (count >= 5) {
        warnings.push({
          type: 'recurring_error_pattern',
          severity: 'WARNING',
          message: `检测到重复错误模式: ${errorType} (${count} 次)`,
          error_type: errorType,
          occurrence_count: count,
          impact: '重复错误可能指示配置或数据问题',
          urgency: 'WITHIN_DAYS',
        });
      }
    });
  }

  /**
   * 生成Import专业建议
   */
  generateImportRecommendations(diagnosis, data) {
    const recommendations = [];

    [...diagnosis.criticals, ...diagnosis.warnings].forEach((issue) => {
      switch (issue.type) {
        case 'high_load_failure_rate':
        case 'moderate_load_failure_rate':
          recommendations.push({
            category: 'failure_rate_optimization',
            priority: 'HIGH',
            title: '导入失败率优化',
            description: '降低导入失败率，提高数据导入成功率',
            professional_actions: [
              {
                action: '分析失败原因',
                command:
                  'SELECT ERROR_MSG, COUNT(*) FROM information_schema.loads WHERE STATE = "CANCELLED" AND CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY ERROR_MSG ORDER BY COUNT(*) DESC;',
                purpose: '识别最常见的失败原因',
              },
              {
                action: '检查数据格式',
                steps: [
                  '验证数据文件格式是否符合表结构',
                  '检查字段分隔符和编码格式',
                  '确认数据类型匹配',
                ],
              },
              {
                action: '优化导入参数',
                recommendations: [
                  '调整max_filter_ratio参数',
                  '增加timeout时间',
                  '优化批次大小',
                ],
              },
            ],
          });
          break;

        case 'routine_load_paused':
        case 'routine_load_cancelled':
          recommendations.push({
            category: 'routine_load_recovery',
            priority: 'HIGH',
            title: 'Routine Load恢复',
            description: `恢复 ${issue.routine_name} 流式导入作业`,
            professional_actions: [
              {
                action: '检查作业状态',
                command: `SHOW ROUTINE LOAD FOR ${issue.routine_name};`,
                purpose: '获取详细的作业状态信息',
              },
              {
                action: '恢复作业',
                command: `RESUME ROUTINE LOAD FOR ${issue.routine_name};`,
                risk_level: 'LOW',
                note: '确保Kafka连接正常',
              },
              {
                action: '监控恢复效果',
                monitoring_metrics: ['数据消费速度', '延迟时间', '错误率'],
              },
            ],
          });
          break;

        case 'load_queue_backlog':
          recommendations.push({
            category: 'queue_management',
            priority: 'HIGH',
            title: '导入队列优化',
            description: '解决导入队列积压问题',
            professional_actions: [
              {
                action: '检查系统资源',
                steps: ['监控CPU使用率', '检查内存使用情况', '评估磁盘IO负载'],
              },
              {
                action: '调整并发配置',
                recommendations: [
                  '增加BE节点导入并发度',
                  '优化FE资源分配',
                  '调整导入队列大小',
                ],
              },
            ],
          });
          break;
      }
    });

    return recommendations;
  }

  /**
   * 生成优化建议
   */
  generateOptimizationSuggestions(data) {
    const suggestions = {
      performance_optimization: [],
      reliability_optimization: [],
      monitoring_enhancement: [],
    };

    // 性能优化建议
    suggestions.performance_optimization.push({
      area: 'batch_size_optimization',
      suggestion: '优化导入批次大小以提高吞吐量',
      implementation: '根据数据量和系统资源调整Stream Load批次大小',
    });

    suggestions.performance_optimization.push({
      area: 'parallel_loading',
      suggestion: '利用并行导入提高数据导入速度',
      implementation: '合理配置导入并发度，避免资源竞争',
    });

    // 可靠性优化建议
    suggestions.reliability_optimization.push({
      area: 'error_handling',
      suggestion: '建立完善的错误处理和重试机制',
      implementation: '设置合理的错误容忍度和自动重试策略',
    });

    suggestions.reliability_optimization.push({
      area: 'data_validation',
      suggestion: '加强数据质量验证',
      implementation: '在导入前进行数据格式和完整性检查',
    });

    // 监控增强建议
    suggestions.monitoring_enhancement.push({
      area: 'import_monitoring',
      suggestion: '建立全面的导入监控体系',
      key_metrics: [
        '导入成功率和失败率',
        '导入性能和吞吐量',
        '队列积压情况',
        'Routine Load延迟时间',
      ],
    });

    return suggestions;
  }

  /**
   * 计算Import健康分数
   */
  calculateImportHealthScore(diagnosis) {
    let score = 100;

    // 基于不同问题类型的扣分策略
    diagnosis.criticals.forEach((issue) => {
      switch (issue.type) {
        case 'high_load_failure_rate':
          score -= 25;
          break;
        case 'routine_load_cancelled':
          score -= 20;
          break;
        case 'load_queue_backlog':
          score -= 20;
          break;
        default:
          score -= 15;
      }
    });

    diagnosis.warnings.forEach((issue) => {
      switch (issue.type) {
        case 'moderate_load_failure_rate':
          score -= 10;
          break;
        case 'routine_load_paused':
          score -= 8;
          break;
        case 'slow_load_performance':
          score -= 8;
          break;
        default:
          score -= 5;
      }
    });

    score = Math.max(0, score);

    let level = 'EXCELLENT';
    if (score < 40) level = 'POOR';
    else if (score < 60) level = 'FAIR';
    else if (score < 80) level = 'GOOD';

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
   * 生成Import诊断摘要
   */
  generateImportSummary(criticals, warnings, issues) {
    if (criticals.length > 0) {
      const failureIssues = criticals.filter((c) =>
        c.type.includes('failure'),
      ).length;
      const queueIssues = criticals.filter((c) =>
        c.type.includes('queue'),
      ).length;

      if (failureIssues > 0) {
        return `Import系统存在 ${failureIssues} 个严重失败问题，影响数据导入成功率`;
      }
      if (queueIssues > 0) {
        return `Import系统存在 ${queueIssues} 个队列积压问题，可能导致导入延迟`;
      }
      return `Import系统发现 ${criticals.length} 个严重问题，需要立即处理`;
    } else if (warnings.length > 0) {
      return `Import系统发现 ${warnings.length} 个警告问题，建议近期优化`;
    } else {
      return 'Import系统运行状态良好，数据导入正常';
    }
  }

  /**
   * 分析指定表的详细导入频率
   * @param {Object} connection - 数据库连接
   * @param {string} dbName - 数据库名
   * @param {string} tableName - 表名
   * @param {boolean} includeDetails - 是否包含详细信息
   * @returns {Object} 详细的频率分析结果
   */
  async analyzeTableImportFrequency(
    connection,
    dbName,
    tableName,
    includeDetails = true,
  ) {
    console.error(`🔍 开始分析表 ${dbName}.${tableName} 的导入频率...`);
    const startTime = Date.now();

    try {
      // 1. 基础统计查询
      const [basicStats] = await connection.query(
        `
        SELECT
          COUNT(*) as total_loads,
          MIN(CREATE_TIME) as first_load,
          MAX(CREATE_TIME) as last_load,
          TIMESTAMPDIFF(SECOND, MIN(CREATE_TIME), MAX(CREATE_TIME)) as time_span_seconds,
          AVG(SCAN_BYTES) as avg_bytes_per_load,
          SUM(SCAN_BYTES) as total_bytes_processed,
          SUM(CASE WHEN STATE = 'FINISHED' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN STATE != 'FINISHED' THEN 1 ELSE 0 END) as failed_count,
          GROUP_CONCAT(DISTINCT TYPE ORDER BY TYPE SEPARATOR ', ') as import_types,
          AVG(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_COMMIT_TIME)) as avg_write_duration_seconds,
          AVG(TIMESTAMPDIFF(SECOND, LOAD_COMMIT_TIME, LOAD_FINISH_TIME)) as avg_publish_duration_seconds,
          AVG(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)) as avg_total_duration_seconds,
          AVG(
            CASE
              WHEN LOAD_START_TIME IS NOT NULL
                AND LOAD_FINISH_TIME IS NOT NULL
                AND TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME) > 0
              THEN SCAN_BYTES / (1024.0 * 1024.0) / TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)
              ELSE NULL
            END
          ) as avg_throughput_mbps,
          MIN(
            CASE
              WHEN LOAD_START_TIME IS NOT NULL
                AND LOAD_FINISH_TIME IS NOT NULL
                AND TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME) > 0
              THEN SCAN_BYTES / (1024.0 * 1024.0) / TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)
              ELSE NULL
            END
          ) as min_throughput_mbps,
          MAX(
            CASE
              WHEN LOAD_START_TIME IS NOT NULL
                AND LOAD_FINISH_TIME IS NOT NULL
                AND TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME) > 0
              THEN SCAN_BYTES / (1024.0 * 1024.0) / TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)
              ELSE NULL
            END
          ) as max_throughput_mbps
        FROM _statistics_.loads_history
        WHERE DB_NAME = ? AND TABLE_NAME = ?
      `,
        [dbName, tableName],
      );

      if (
        !basicStats ||
        basicStats.length === 0 ||
        basicStats[0].total_loads === 0
      ) {
        return {
          table: `${dbName}.${tableName}`,
          analysis_type: 'table_frequency_analysis',
          status: 'no_data',
          message: '未找到该表的导入记录',
          analysis_duration_ms: Date.now() - startTime,
        };
      }

      const stats = basicStats[0];
      const timeSpanSeconds = Math.max(stats.time_span_seconds || 1, 1);

      // 2. 计算频率指标
      const frequencyMetrics = this.calculateFrequencyMetrics(
        stats,
        timeSpanSeconds,
      );

      // 3. 获取时间分布数据
      const timeDistribution = await this.getTimeDistribution(
        connection,
        dbName,
        tableName,
      );

      // 4. 获取导入阶段耗时统计
      const phaseStats = await this.getLoadPhaseStatistics(
        connection,
        dbName,
        tableName,
      );

      // 5. 获取数据量统计
      const sizeStats = await this.getSizeStatistics(
        connection,
        dbName,
        tableName,
      );

      // 6. 分析并发模式
      const concurrencyAnalysis = this.analyzeConcurrencyPattern(
        timeDistribution,
        stats.total_loads,
      );

      // 7. 性能评估
      const performanceAnalysis = this.evaluateImportPerformance(
        stats,
        frequencyMetrics,
        timeSpanSeconds,
      );

      // 8. 生成洞察和建议
      const insights = this.generateTableFrequencyInsights(
        stats,
        frequencyMetrics,
        performanceAnalysis,
        phaseStats,
      );

      const result = {
        table: `${dbName}.${tableName}`,
        analysis_type: 'table_frequency_analysis',
        status: 'completed',
        analysis_duration_ms: Date.now() - startTime,

        // 基础统计
        basic_statistics: {
          total_loads: stats.total_loads,
          success_count: stats.success_count,
          failed_count: stats.failed_count,
          success_rate: (
            (stats.success_count / stats.total_loads) *
            100
          ).toFixed(1),
          first_load: stats.first_load,
          last_load: stats.last_load,
          time_span_seconds: timeSpanSeconds,
          total_data_processed: stats.total_bytes_processed,
          avg_file_size: stats.avg_bytes_per_load,
          import_types: stats.import_types || 'N/A',
        },

        // 频率指标
        frequency_metrics: frequencyMetrics,

        // 时间分布
        time_distribution: includeDetails
          ? timeDistribution
          : timeDistribution.slice(0, 10),

        // 数据量统计
        size_statistics: sizeStats,

        // 导入阶段耗时统计
        phase_statistics: phaseStats,

        // 并发分析
        concurrency_analysis: concurrencyAnalysis,

        // 性能评估
        performance_analysis: performanceAnalysis,

        // 洞察和建议
        insights: insights,
      };

      console.error(
        `✅ 表 ${dbName}.${tableName} 频率分析完成，耗时 ${result.analysis_duration_ms}ms`,
      );
      return result;
    } catch (error) {
      console.error(`❌ 表频率分析失败: ${error.message}`);
      return {
        table: `${dbName}.${tableName}`,
        analysis_type: 'table_frequency_analysis',
        status: 'error',
        error: error.message,
        analysis_duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * 计算频率指标
   */
  calculateFrequencyMetrics(stats, timeSpanSeconds) {
    const loadsPerSecond = stats.total_loads / timeSpanSeconds;
    const loadsPerMinute = loadsPerSecond * 60;
    const loadsPerHour = loadsPerSecond * 3600;
    const avgInterval = timeSpanSeconds / Math.max(stats.total_loads - 1, 1);

    // 频率等级分类
    let frequencyLevel = 'low';
    let frequencyCategory = 'low_frequency';

    if (loadsPerSecond > 1) {
      frequencyLevel = 'extreme';
      frequencyCategory = 'extreme_frequency';
    } else if (loadsPerMinute > 60) {
      frequencyLevel = 'very_high';
      frequencyCategory = 'very_high_frequency';
    } else if (loadsPerMinute > 4) {
      frequencyLevel = 'high';
      frequencyCategory = 'high_frequency';
    } else if (loadsPerMinute > 1) {
      frequencyLevel = 'frequent';
      frequencyCategory = 'frequent';
    } else if (loadsPerHour > 1) {
      frequencyLevel = 'moderate';
      frequencyCategory = 'moderate';
    }

    return {
      loads_per_second: parseFloat(loadsPerSecond.toFixed(2)),
      loads_per_minute: parseFloat(loadsPerMinute.toFixed(1)),
      loads_per_hour: parseFloat(loadsPerHour.toFixed(0)),
      avg_interval_seconds: parseFloat(avgInterval.toFixed(2)),
      frequency_level: frequencyLevel,
      frequency_category: frequencyCategory,
      frequency_description: this.getFrequencyDescription(frequencyCategory),
    };
  }

  /**
   * 获取时间分布数据
   */
  async getTimeDistribution(connection, dbName, tableName) {
    try {
      const [timeDistribution] = await connection.query(
        `
        SELECT
          LOAD_FINISH_TIME,
          COUNT(*) as job_count,
          ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) FROM information_schema.loads
            WHERE DB_NAME = ? AND TABLE_NAME = ?
          ), 1) as percentage
        FROM information_schema.loads
        WHERE DB_NAME = ? AND TABLE_NAME = ? AND LOAD_FINISH_TIME IS NOT NULL
        GROUP BY LOAD_FINISH_TIME
        ORDER BY LOAD_FINISH_TIME
      `,
        [dbName, tableName, dbName, tableName],
      );

      return timeDistribution.map((item) => ({
        finish_time: item.LOAD_FINISH_TIME,
        job_count: item.job_count,
        percentage: parseFloat(item.percentage),
      }));
    } catch (error) {
      console.warn(`获取时间分布失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取导入阶段耗时统计
   */
  async getLoadPhaseStatistics(connection, dbName, tableName) {
    try {
      console.error(`🔍 正在获取表 ${dbName}.${tableName} 的阶段耗时统计...`);

      // 首先检查有多少条记录有完整的时间字段
      const [checkResult] = await connection.query(
        `
        SELECT
          COUNT(*) as total_records,
          SUM(CASE WHEN LOAD_START_TIME IS NOT NULL AND LOAD_COMMIT_TIME IS NOT NULL
              AND LOAD_FINISH_TIME IS NOT NULL AND STATE = 'FINISHED' THEN 1 ELSE 0 END) as complete_records
        FROM _statistics_.loads_history
        WHERE DB_NAME = ? AND TABLE_NAME = ?
      `,
        [dbName, tableName],
      );

      console.error(
        `📊 时间字段检查: 总记录=${checkResult[0].total_records}, 完整记录=${checkResult[0].complete_records}`,
      );

      if (checkResult[0].complete_records === 0) {
        console.error(`⚠️  没有找到具有完整时间字段的记录，返回 null`);
        return null;
      }

      const [phaseStats] = await connection.query(
        `
        SELECT
          COUNT(*) as analyzed_loads,
          AVG(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_COMMIT_TIME)) as avg_write_duration,
          MIN(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_COMMIT_TIME)) as min_write_duration,
          MAX(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_COMMIT_TIME)) as max_write_duration,
          STDDEV(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_COMMIT_TIME)) as write_duration_stddev,
          AVG(TIMESTAMPDIFF(SECOND, LOAD_COMMIT_TIME, LOAD_FINISH_TIME)) as avg_publish_duration,
          MIN(TIMESTAMPDIFF(SECOND, LOAD_COMMIT_TIME, LOAD_FINISH_TIME)) as min_publish_duration,
          MAX(TIMESTAMPDIFF(SECOND, LOAD_COMMIT_TIME, LOAD_FINISH_TIME)) as max_publish_duration,
          STDDEV(TIMESTAMPDIFF(SECOND, LOAD_COMMIT_TIME, LOAD_FINISH_TIME)) as publish_duration_stddev,
          AVG(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)) as avg_total_duration,
          MIN(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)) as min_total_duration,
          MAX(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)) as max_total_duration,
          STDDEV(TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_FINISH_TIME)) as total_duration_stddev
        FROM _statistics_.loads_history
        WHERE DB_NAME = ?
          AND TABLE_NAME = ?
          AND LOAD_START_TIME IS NOT NULL
          AND LOAD_COMMIT_TIME IS NOT NULL
          AND LOAD_FINISH_TIME IS NOT NULL
          AND STATE = 'FINISHED'
      `,
        [dbName, tableName],
      );

      if (
        !phaseStats ||
        phaseStats.length === 0 ||
        phaseStats[0].analyzed_loads === 0
      ) {
        console.error(`⚠️  阶段统计查询无结果，返回 null`);
        return null;
      }

      console.error(
        `✅ 成功获取阶段统计，分析了 ${phaseStats[0].analyzed_loads} 条记录`,
      );

      const stats = phaseStats[0];

      // 计算写入阶段占比
      const writePercentage =
        stats.avg_total_duration > 0
          ? (stats.avg_write_duration / stats.avg_total_duration) * 100
          : 0;

      // 计算 publish 阶段占比
      const publishPercentage =
        stats.avg_total_duration > 0
          ? (stats.avg_publish_duration / stats.avg_total_duration) * 100
          : 0;

      // 计算慢任务数量（单独查询，避免聚合函数嵌套）
      let slowWriteCount = 0;
      let slowPublishCount = 0;
      try {
        const writeThreshold = stats.avg_write_duration * 3;
        const publishThreshold = stats.avg_publish_duration * 3;

        const [slowTasks] = await connection.query(
          `
          SELECT
            SUM(CASE WHEN TIMESTAMPDIFF(SECOND, LOAD_START_TIME, LOAD_COMMIT_TIME) > ? THEN 1 ELSE 0 END) as slow_write,
            SUM(CASE WHEN TIMESTAMPDIFF(SECOND, LOAD_COMMIT_TIME, LOAD_FINISH_TIME) > ? THEN 1 ELSE 0 END) as slow_publish
          FROM _statistics_.loads_history
          WHERE DB_NAME = ?
            AND TABLE_NAME = ?
            AND LOAD_START_TIME IS NOT NULL
            AND LOAD_COMMIT_TIME IS NOT NULL
            AND LOAD_FINISH_TIME IS NOT NULL
            AND STATE = 'FINISHED'
        `,
          [writeThreshold, publishThreshold, dbName, tableName],
        );

        if (slowTasks && slowTasks.length > 0) {
          slowWriteCount = slowTasks[0].slow_write || 0;
          slowPublishCount = slowTasks[0].slow_publish || 0;
        }
      } catch (err) {
        console.warn(`计算慢任务数量失败: ${err.message}`);
      }

      return {
        analyzed_loads: stats.analyzed_loads,

        // 写入阶段统计
        write_phase: {
          avg_duration: parseFloat((stats.avg_write_duration || 0).toFixed(2)),
          min_duration: stats.min_write_duration || 0,
          max_duration: stats.max_write_duration || 0,
          stddev: parseFloat((stats.write_duration_stddev || 0).toFixed(2)),
          percentage_of_total: parseFloat(writePercentage.toFixed(1)),
          slow_count: slowWriteCount,
        },

        // Publish 阶段统计
        publish_phase: {
          avg_duration: parseFloat(
            (stats.avg_publish_duration || 0).toFixed(2),
          ),
          min_duration: stats.min_publish_duration || 0,
          max_duration: stats.max_publish_duration || 0,
          stddev: parseFloat((stats.publish_duration_stddev || 0).toFixed(2)),
          percentage_of_total: parseFloat(publishPercentage.toFixed(1)),
          slow_count: slowPublishCount,
        },

        // 总耗时统计
        total_phase: {
          avg_duration: parseFloat((stats.avg_total_duration || 0).toFixed(2)),
          min_duration: stats.min_total_duration || 0,
          max_duration: stats.max_total_duration || 0,
          stddev: parseFloat((stats.total_duration_stddev || 0).toFixed(2)),
        },

        // 性能洞察
        insights: this.generatePhaseInsights(
          writePercentage,
          publishPercentage,
          slowWriteCount,
          slowPublishCount,
        ),
      };
    } catch (error) {
      console.error(`❌ 获取阶段耗时统计失败: ${error.message}`);
      console.error(error.stack);
      return null;
    }
  }

  /**
   * 生成阶段耗时洞察
   */
  generatePhaseInsights(
    writePercentage,
    publishPercentage,
    slowWriteCount,
    slowPublishCount,
  ) {
    const insights = [];

    // 写入阶段分析
    if (writePercentage > 70) {
      insights.push({
        phase: 'write',
        type: 'bottleneck',
        message: `写入阶段耗时占比过高 (${writePercentage.toFixed(1)}%)`,
        suggestion: '考虑优化数据写入性能，检查磁盘I/O和内存配置',
      });
    }

    // Publish 阶段分析
    if (publishPercentage > 50) {
      insights.push({
        phase: 'publish',
        type: 'bottleneck',
        message: `Publish 阶段耗时占比较高 (${publishPercentage.toFixed(1)}%)`,
        suggestion: '可能存在版本发布或元数据更新瓶颈，检查事务提交性能',
      });
    }

    // 慢任务分析
    if (slowWriteCount > 0) {
      insights.push({
        phase: 'write',
        type: 'slow_tasks',
        message: `发现 ${slowWriteCount} 个慢写入任务`,
        suggestion: '分析慢任务的数据特征和系统状态',
      });
    }

    if (slowPublishCount > 0) {
      insights.push({
        phase: 'publish',
        type: 'slow_tasks',
        message: `发现 ${slowPublishCount} 个慢 publish 任务`,
        suggestion: '检查元数据服务和版本管理性能',
      });
    }

    // 性能均衡性分析
    if (
      writePercentage > 30 &&
      writePercentage < 70 &&
      publishPercentage > 20 &&
      publishPercentage < 50
    ) {
      insights.push({
        phase: 'overall',
        type: 'balanced',
        message: '导入各阶段耗时分布较为均衡',
        suggestion: '当前性能配置合理，继续保持',
      });
    }

    return insights;
  }

  /**
   * 获取数据量统计
   */
  async getSizeStatistics(connection, dbName, tableName) {
    try {
      const [sizeStats] = await connection.query(
        `
        SELECT
          MIN(SCAN_BYTES) as min_size,
          MAX(SCAN_BYTES) as max_size,
          AVG(SCAN_BYTES) as avg_size,
          STDDEV(SCAN_BYTES) as size_stddev
        FROM information_schema.loads
        WHERE DB_NAME = ? AND TABLE_NAME = ? AND SCAN_BYTES IS NOT NULL
      `,
        [dbName, tableName],
      );

      if (!sizeStats || sizeStats.length === 0) {
        return null;
      }

      const stats = sizeStats[0];
      const variationCoefficient =
        stats.size_stddev && stats.avg_size
          ? (stats.size_stddev / stats.avg_size) * 100
          : 0;

      return {
        min_size: stats.min_size,
        max_size: stats.max_size,
        avg_size: stats.avg_size,
        size_stddev: stats.size_stddev,
        variation_coefficient: parseFloat(variationCoefficient.toFixed(1)),
        consistency_level: this.getSizeConsistencyLevel(variationCoefficient),
      };
    } catch (error) {
      console.warn(`获取大小统计失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 分析并发模式
   */
  analyzeConcurrencyPattern(timeDistribution, totalLoads) {
    if (!timeDistribution || timeDistribution.length === 0) {
      return null;
    }

    const peakTime = timeDistribution.reduce((max, current) =>
      current.job_count > max.job_count ? current : max,
    );

    const avgJobsPerSecond = totalLoads / timeDistribution.length;

    // 计算标准差
    const variance =
      timeDistribution.reduce((sum, time) => {
        return sum + Math.pow(time.job_count - avgJobsPerSecond, 2);
      }, 0) / timeDistribution.length;
    const stdDev = Math.sqrt(variance);

    return {
      peak_time: peakTime.finish_time,
      peak_concurrent_jobs: peakTime.job_count,
      time_span_seconds: timeDistribution.length,
      avg_jobs_per_second: parseFloat(avgJobsPerSecond.toFixed(1)),
      completion_std_dev: parseFloat(stdDev.toFixed(2)),
      concurrency_level: this.getConcurrencyLevel(
        peakTime.job_count,
        avgJobsPerSecond,
      ),
    };
  }

  /**
   * 识别导入模式
   */
  identifyImportPattern(stats, frequencyMetrics, sizeStats, timeDistribution) {
    const patterns = [];

    // 检查批量导入模式
    if (stats.total_loads > 100 && frequencyMetrics.loads_per_second > 10) {
      patterns.push({
        type: 'bulk_parallel_import',
        confidence: 0.9,
        description: '大批量并行导入模式',
        characteristics: [
          `${stats.total_loads}个文件快速并行导入`,
          `每秒处理${frequencyMetrics.loads_per_second}个文件`,
          '适用于大规模数据迁移或基准测试',
        ],
      });
    }

    // 检查流式导入模式
    if (frequencyMetrics.frequency_level === 'high' && stats.total_loads > 10) {
      patterns.push({
        type: 'streaming_import',
        confidence: 0.8,
        description: '流式导入模式',
        characteristics: [
          `高频导入 (${frequencyMetrics.loads_per_minute}次/分钟)`,
          '适用于实时数据处理',
          '需要关注系统资源消耗',
        ],
      });
    }

    // 检查数据分片模式
    if (sizeStats && sizeStats.variation_coefficient < 10) {
      patterns.push({
        type: 'uniform_sharding',
        confidence: 0.85,
        description: '均匀分片导入模式',
        characteristics: [
          `文件大小变异系数${sizeStats.variation_coefficient}%`,
          '数据已被均匀分片',
          '负载均衡良好',
        ],
      });
    }

    // 检查基准测试模式
    if (
      stats.total_loads === 195 &&
      stats.success_count === stats.total_loads
    ) {
      patterns.push({
        type: 'benchmark_testing',
        confidence: 0.95,
        description: 'SSB基准测试模式',
        characteristics: [
          '195个文件 (SSB 100GB标准分片)',
          '100%成功率',
          '性能测试或基准评估场景',
        ],
      });
    }

    return {
      identified_patterns: patterns,
      primary_pattern: patterns.length > 0 ? patterns[0] : null,
    };
  }

  /**
   * 评估导入性能
   */
  evaluateImportPerformance(stats, frequencyMetrics, timeSpanSeconds) {
    const totalDataGB = stats.total_bytes_processed / (1024 * 1024 * 1024);

    // 使用每个任务吞吐量的平均值（更准确）
    // 确保转换为数字类型，避免 null、undefined 或 NaN
    const avgThroughputMBps = Number(stats.avg_throughput_mbps) || 0;
    const minThroughputMBps = Number(stats.min_throughput_mbps) || 0;
    const maxThroughputMBps = Number(stats.max_throughput_mbps) || 0;

    // 安全地格式化数字
    const safeFormat = (num, decimals) => {
      const n = Number(num);
      return isNaN(n) ? 0 : parseFloat(n.toFixed(decimals));
    };

    return {
      total_data_gb: safeFormat(totalDataGB, 2),
      throughput_mbps: safeFormat(avgThroughputMBps, 1),
      min_throughput_mbps: safeFormat(minThroughputMBps, 1),
      max_throughput_mbps: safeFormat(maxThroughputMBps, 1),
      success_rate: safeFormat(
        (stats.success_count / stats.total_loads) * 100,
        1,
      ),
    };
  }

  /**
   * 生成表频率分析洞察
   */
  generateTableFrequencyInsights(
    stats,
    frequencyMetrics,
    performanceAnalysis,
    phaseStats,
  ) {
    const insights = [];

    // 添加阶段耗时洞察
    if (phaseStats && phaseStats.insights && phaseStats.insights.length > 0) {
      phaseStats.insights.forEach((insight) => {
        insights.push({
          type: `phase_${insight.type}`,
          priority: insight.type === 'bottleneck' ? 'high' : 'info',
          message: insight.message,
          implications: [insight.suggestion],
          recommendations: [insight.suggestion],
        });
      });
    }

    // 频率相关洞察
    if (frequencyMetrics.frequency_level === 'extreme') {
      insights.push({
        type: 'extreme_frequency',
        priority: 'high',
        message: `检测到极高频导入 (${frequencyMetrics.loads_per_second}次/秒)`,
        implications: [
          '可能是批量数据迁移或性能测试',
          '需要确保系统资源充足',
          '关注I/O和网络性能',
        ],
        recommendations: [
          '监控系统资源使用情况',
          '评估是否需要调整并发度',
          '考虑优化导入批次大小',
        ],
      });
    }

    // 成功率相关洞察
    if (performanceAnalysis.success_rate === 100) {
      insights.push({
        type: 'reliability_perfect',
        priority: 'info',
        message: '导入可靠性完美 (100%成功率)',
        implications: [
          '导入流程非常稳定',
          '数据质量和格式良好',
          '系统配置合理',
        ],
        recommendations: [
          '继续保持当前的数据处理流程',
          '可以作为最佳实践案例',
          '建立成功率监控告警',
        ],
      });
    } else if (performanceAnalysis.success_rate < 95) {
      insights.push({
        type: 'reliability_concern',
        priority: 'medium',
        message: `导入成功率较低 (${performanceAnalysis.success_rate}%)`,
        implications: [
          '存在数据质量或系统问题',
          '可能影响数据完整性',
          '需要分析失败原因',
        ],
        recommendations: [
          '检查失败导入的错误日志',
          '改进数据验证和清洗流程',
          '优化错误处理和重试机制',
        ],
      });
    }

    return insights;
  }

  /**
   * 获取频率描述
   */
  getFrequencyDescription(category) {
    const descriptions = {
      extreme_frequency: '极高频 (每秒多次)',
      very_high_frequency: '超高频 (每分钟60+次)',
      high_frequency: '高频 (每分钟4+次)',
      frequent: '频繁 (每分钟1-4次)',
      moderate: '中等 (每小时1+次)',
      low_frequency: '低频 (每小时<1次)',
    };
    return descriptions[category] || '未知频率';
  }

  /**
   * 获取大小一致性等级
   */
  getSizeConsistencyLevel(variationCoefficient) {
    if (variationCoefficient < 5) return 'excellent';
    if (variationCoefficient < 15) return 'good';
    if (variationCoefficient < 30) return 'fair';
    return 'poor';
  }

  /**
   * 获取并发等级
   */
  getConcurrencyLevel(peakJobs, avgJobs) {
    if (peakJobs > avgJobs * 3) return 'high_burst';
    if (peakJobs > avgJobs * 2) return 'moderate_burst';
    return 'steady';
  }

  /**
   * 获取模式推荐
   */
  getPatternRecommendations(patternType) {
    const recommendations = {
      bulk_parallel_import: [
        '监控系统资源使用峰值',
        '考虑在低峰时段执行大批量导入',
        '优化并行度避免资源争抢',
      ],
      streaming_import: [
        '建立实时监控和告警',
        '优化批次大小平衡延迟和吞吐量',
        '考虑使用Routine Load提高稳定性',
      ],
      uniform_sharding: [
        '继续保持均匀分片策略',
        '可以考虑适当增加并行度',
        '监控单个分片的处理时间',
      ],
      benchmark_testing: [
        '记录性能基准指标',
        '可以作为系统性能评估标准',
        '定期重复测试验证系统稳定性',
      ],
    };
    return recommendations[patternType] || ['需要进一步分析具体场景'];
  }

  /**
   * 格式化表频率分析报告
   */
  formatTableFrequencyReport(analysis) {
    if (analysis.status !== 'completed') {
      return `❌ 表 ${analysis.table} 频率分析失败: ${analysis.error || analysis.message}`;
    }

    const stats = analysis.basic_statistics;
    const freq = analysis.frequency_metrics;
    const perf = analysis.performance_analysis;

    let report = `📊 ${analysis.table} 导入频率详细分析\n`;
    report += '=========================================\n\n';

    // 基础统计
    report += '📈 基础统计信息:\n';
    report += `   总导入作业: ${stats.total_loads.toLocaleString()}\n`;
    report += `   成功率: ${stats.success_rate}%\n`;
    report += `   导入类型: ${stats.import_types}\n`;
    report += `   时间跨度: ${stats.time_span_seconds}秒\n`;
    report += `   数据处理量: ${this.formatBytes(stats.total_data_processed)}\n\n`;

    // 频率指标
    report += '⚡ 频率指标:\n';
    report += `   每秒导入: ${freq.loads_per_second} 次\n`;
    report += `   每分钟导入: ${freq.loads_per_minute} 次\n`;
    report += `   频率等级: ${freq.frequency_description}\n`;
    report += `   平均间隔: ${freq.avg_interval_seconds} 秒\n\n`;

    // 性能评估
    report += '📊 性能评估:\n';
    report += `   平均吞吐量: ${perf.throughput_mbps} MB/s\n`;
    report += `   吞吐量范围: ${perf.min_throughput_mbps} - ${perf.max_throughput_mbps} MB/s\n\n`;

    // 导入阶段耗时统计
    if (analysis.phase_statistics) {
      const phase = analysis.phase_statistics;
      report += '⏱️  导入阶段耗时分析:\n';
      report += `   分析样本: ${phase.analyzed_loads} 个成功导入\n\n`;

      report += `   📝 写入阶段:\n`;
      report += `      平均耗时: ${phase.write_phase.avg_duration} 秒\n`;
      report += `      耗时范围: ${phase.write_phase.min_duration} - ${phase.write_phase.max_duration} 秒\n`;
      report += `      占总耗时: ${phase.write_phase.percentage_of_total}%\n`;
      if (phase.write_phase.slow_count > 0) {
        report += `      ⚠️  慢任务: ${phase.write_phase.slow_count} 个\n`;
      }
      report += '\n';

      report += `   📤 Publish阶段:\n`;
      report += `      平均耗时: ${phase.publish_phase.avg_duration} 秒\n`;
      report += `      耗时范围: ${phase.publish_phase.min_duration} - ${phase.publish_phase.max_duration} 秒\n`;
      report += `      占总耗时: ${phase.publish_phase.percentage_of_total}%\n`;
      if (phase.publish_phase.slow_count > 0) {
        report += `      ⚠️  慢任务: ${phase.publish_phase.slow_count} 个\n`;
      }
      report += '\n';

      report += `   🔄 总耗时:\n`;
      report += `      平均耗时: ${phase.total_phase.avg_duration} 秒\n`;
      report += `      耗时范围: ${phase.total_phase.min_duration} - ${phase.total_phase.max_duration} 秒\n`;
      report += '\n';
    }

    // 关键洞察
    if (analysis.insights.length > 0) {
      report += '💡 关键洞察:\n';
      analysis.insights.slice(0, 3).forEach((insight, index) => {
        const priority =
          insight.priority === 'high'
            ? '🔥'
            : insight.priority === 'medium'
              ? '⚠️'
              : 'ℹ️';
        report += `   ${index + 1}. ${priority} ${insight.message}\n`;
        if (insight.recommendations.length > 0) {
          report += `      建议: ${insight.recommendations[0]}\n`;
        }
      });
    }

    return report;
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 标准化 SHOW ROUTINE LOAD 返回的字段名
   * 将 SHOW 命令返回的字段名（如 Name, DbName）转换为统一格式（NAME, DB_NAME）
   */
  normalizeRoutineLoadFields(job) {
    return {
      NAME: job.Name || job.NAME,
      CREATE_TIME: job.CreateTime || job.CREATE_TIME,
      PAUSE_TIME: job.PauseTime || job.PAUSE_TIME,
      END_TIME: job.EndTime || job.END_TIME,
      DB_NAME: job.DbName || job.DB_NAME,
      TABLE_NAME: job.TableName || job.TABLE_NAME,
      STATE: job.State || job.STATE,
      DATA_SOURCE_NAME: job.DataSourceType || job.DATA_SOURCE_NAME,
      CURRENT_TASK_NUM: job.CurrentTaskNum || job.CURRENT_TASK_NUM || 0,
      JOB_PROPERTIES: job.JobProperties || job.JOB_PROPERTIES,
      DATA_SOURCE_PROPERTIES:
        job.DataSourceProperties || job.DATA_SOURCE_PROPERTIES,
      CUSTOM_PROPERTIES: job.CustomProperties || job.CUSTOM_PROPERTIES,
      STATISTIC: job.Statistic || job.STATISTIC,
      PROGRESS: job.Progress || job.PROGRESS,
      TRACKING_SQL: job.TrackingSQL || job.TRACKING_SQL,
      OTHER_MSG: job.OtherMsg || job.OTHER_MSG,
      REASON_OF_STATE_CHANGED:
        job.ReasonOfStateChanged || job.REASON_OF_STATE_CHANGED,
    };
  }

  /**
   * 检查 Routine Load Job 配置参数
   * @param {Object} connection - 数据库连接
   * @param {string} jobName - Routine Load 作业名称（可选）
   * @param {string} dbName - 数据库名称（可选）
   * @returns {Object} 参数检测结果
   */
  async checkRoutineLoadJobConfig(connection, jobName = null, dbName = null) {
    console.error(`🔍 开始检查 Routine Load 作业配置...`);
    const startTime = Date.now();

    try {
      // 1. 获取 Routine Load 作业列表（使用 SHOW ROUTINE LOAD 命令）
      let routineLoadJobs = [];

      if (dbName) {
        // 指定了数据库，直接查询该数据库
        const showCommand = jobName
          ? `SHOW ROUTINE LOAD FOR ${jobName} FROM \`${dbName}\``
          : `SHOW ROUTINE LOAD FROM \`${dbName}\``;

        try {
          const [jobs] = await connection.query(showCommand);
          if (jobs && jobs.length > 0) {
            // 标准化字段名
            routineLoadJobs = jobs.map((job) =>
              this.normalizeRoutineLoadFields(job),
            );
          }
        } catch (error) {
          console.error(
            `查询数据库 ${dbName} 的 Routine Load 失败: ${error.message}`,
          );
          throw error;
        }
      } else {
        // 未指定数据库，需要遍历所有数据库
        const [databases] = await connection.query('SHOW DATABASES');

        for (const db of databases) {
          const currentDb = db.Database;

          // 跳过系统数据库
          if (
            ['information_schema', '_statistics_', 'sys'].includes(currentDb)
          ) {
            continue;
          }

          try {
            const showCommand = jobName
              ? `SHOW ROUTINE LOAD FOR ${jobName} FROM \`${currentDb}\``
              : `SHOW ROUTINE LOAD FROM \`${currentDb}\``;

            const [jobs] = await connection.query(showCommand);
            if (jobs && jobs.length > 0) {
              // 标准化字段名
              const normalizedJobs = jobs.map((job) =>
                this.normalizeRoutineLoadFields(job),
              );
              routineLoadJobs.push(...normalizedJobs);
            }
          } catch (error) {
            // 某些数据库可能没有 Routine Load 权限或为空，忽略错误
            console.warn(
              `查询数据库 ${currentDb} 的 Routine Load 失败: ${error.message}`,
            );
          }
        }
      }

      if (!routineLoadJobs || routineLoadJobs.length === 0) {
        return {
          status: 'no_jobs',
          message: jobName
            ? `未找到名为 "${jobName}" 的 Routine Load 作业`
            : dbName
              ? `数据库 "${dbName}" 中未找到任何 Routine Load 作业`
              : '未找到任何 Routine Load 作业',
          analysis_duration_ms: Date.now() - startTime,
        };
      }

      // 2. 分析每个作业的配置
      const jobAnalysis = [];

      for (const job of routineLoadJobs) {
        const analysis = await this.analyzeRoutineLoadJobConfig(job);
        jobAnalysis.push(analysis);
      }

      // 3. 生成综合评估
      const overallAssessment =
        this.generateRoutineLoadOverallAssessment(jobAnalysis);

      console.error(
        `✅ Routine Load 配置检查完成，耗时 ${Date.now() - startTime}ms`,
      );

      return {
        status: 'completed',
        analysis_type: 'routine_load_config_check',
        analysis_duration_ms: Date.now() - startTime,
        total_jobs: routineLoadJobs.length,
        job_analysis: jobAnalysis,
        overall_assessment: overallAssessment,
      };
    } catch (error) {
      console.error(`❌ Routine Load 配置检查失败: ${error.message}`);
      return {
        status: 'error',
        error: error.message,
        analysis_duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * 分析单个 Routine Load 作业配置
   */
  async analyzeRoutineLoadJobConfig(job) {
    const issues = [];
    const warnings = [];
    const recommendations = [];
    let configScore = 100;

    // 解析配置参数
    const jobProperties = this.parseJobProperties(job.JOB_PROPERTIES);
    const dataSourceProperties = this.parseJobProperties(
      job.DATA_SOURCE_PROPERTIES,
    );
    const customProperties = this.parseJobProperties(job.CUSTOM_PROPERTIES);
    const statistics = this.parseJobProperties(job.STATISTIC);

    // 1. 检查任务并发数
    const currentTaskNum = job.CURRENT_TASK_NUM || 0;
    const desiredConcurrentNum =
      parseInt(jobProperties.desired_concurrent_number) || 1;

    if (currentTaskNum === 0 && job.STATE === 'RUNNING') {
      issues.push({
        type: 'no_running_tasks',
        severity: 'CRITICAL',
        message: '作业状态为 RUNNING 但没有运行中的任务',
        impact: '数据无法被消费，可能导致数据延迟',
      });
      configScore -= 30;
    }

    if (desiredConcurrentNum > 5) {
      warnings.push({
        type: 'high_concurrent_number',
        severity: 'WARNING',
        message: `并发数设置过高: ${desiredConcurrentNum}`,
        current_value: desiredConcurrentNum,
        recommended_value: '1-5',
        impact: '过高的并发可能导致资源竞争和任务不稳定',
      });
      configScore -= 10;
    }

    // 2. 检查 max_batch_interval
    const maxBatchInterval =
      parseInt(jobProperties.max_batch_interval) ||
      this.rules.routine_load.max_batch_interval_seconds;

    if (maxBatchInterval > this.rules.routine_load.max_batch_interval_seconds) {
      warnings.push({
        type: 'high_batch_interval',
        severity: 'WARNING',
        message: `批次间隔过长: ${maxBatchInterval}秒`,
        current_value: maxBatchInterval,
        recommended_value: this.rules.routine_load.max_batch_interval_seconds,
        impact: '批次间隔过长可能导致数据延迟增加',
      });
      configScore -= 5;
    }

    // 3. 检查 max_batch_rows
    const maxBatchRows =
      parseInt(jobProperties.max_batch_rows) ||
      this.rules.routine_load.max_batch_rows;

    if (maxBatchRows > this.rules.routine_load.max_batch_rows) {
      warnings.push({
        type: 'high_batch_rows',
        severity: 'WARNING',
        message: `单批次行数过多: ${maxBatchRows.toLocaleString()}`,
        current_value: maxBatchRows,
        recommended_value: this.rules.routine_load.max_batch_rows,
        impact: '批次过大可能导致内存压力和任务超时',
      });
      configScore -= 5;
    }

    // 4. 检查 max_error_number
    const maxErrorNumber = parseInt(jobProperties.max_error_number) || 0;

    if (maxErrorNumber > 10000) {
      warnings.push({
        type: 'high_error_tolerance',
        severity: 'WARNING',
        message: `错误容忍度过高: ${maxErrorNumber.toLocaleString()}`,
        current_value: maxErrorNumber,
        recommended_value: '1000-5000',
        impact: '过高的错误容忍可能掩盖数据质量问题',
      });
      configScore -= 5;
    }

    // 5. 检查 Kafka 相关配置
    if (dataSourceProperties.kafka_topic) {
      // 检查 kafka_partitions
      const kafkaPartitions = dataSourceProperties.kafka_partitions;
      if (kafkaPartitions && desiredConcurrentNum > 1) {
        const partitionCount = kafkaPartitions.split(',').length;
        if (desiredConcurrentNum > partitionCount) {
          warnings.push({
            type: 'concurrent_exceeds_partitions',
            severity: 'WARNING',
            message: `并发数 (${desiredConcurrentNum}) 超过 Kafka 分区数 (${partitionCount})`,
            current_concurrent: desiredConcurrentNum,
            partition_count: partitionCount,
            impact: '部分任务将处于空闲状态，浪费资源',
          });
          configScore -= 10;
        }
      }

      // 检查 kafka_offsets
      if (!dataSourceProperties.kafka_offsets) {
        recommendations.push({
          type: 'kafka_offsets_not_set',
          priority: 'LOW',
          message: '未显式设置 kafka_offsets',
          suggestion: '建议显式设置起始 offset 以避免数据丢失或重复消费',
        });
      }
    }

    // 6. 检查 format 和数据格式配置
    const format = jobProperties.format?.toLowerCase() || 'csv';
    const stripOuterArray = customProperties.strip_outer_array === 'true';
    const jsonPaths = customProperties.jsonpaths;

    if (format === 'json' && !jsonPaths && !stripOuterArray) {
      recommendations.push({
        type: 'json_format_optimization',
        priority: 'MEDIUM',
        message: 'JSON 格式未配置 jsonpaths 或 strip_outer_array',
        suggestion:
          '建议配置 jsonpaths 或 strip_outer_array 以优化 JSON 解析性能',
      });
    }

    // 7. 检查作业状态和统计信息
    if (job.STATE === 'PAUSED') {
      issues.push({
        type: 'job_paused',
        severity: 'WARNING',
        message: '作业处于暂停状态',
        pause_time: job.PAUSE_TIME,
        reason: job.REASON_OF_STATE_CHANGED,
        impact: '数据消费中断，可能导致数据积压',
      });
      configScore -= 15;
    }

    if (job.STATE === 'CANCELLED') {
      issues.push({
        type: 'job_cancelled',
        severity: 'CRITICAL',
        message: '作业已被取消',
        end_time: job.END_TIME,
        reason: job.REASON_OF_STATE_CHANGED || job.OTHER_MSG,
        impact: '数据消费完全停止',
      });
      configScore -= 40;
    }

    // 8. 分析统计信息
    let performanceIssues = null;
    if (statistics && statistics.receivedBytes) {
      performanceIssues = this.analyzeRoutineLoadPerformance(statistics);
      if (performanceIssues.warnings.length > 0) {
        warnings.push(...performanceIssues.warnings);
        configScore -= performanceIssues.score_penalty;
      }
    }

    // 9. 生成优化建议
    const optimizationRecommendations = this.generateRoutineLoadOptimizations(
      jobProperties,
      dataSourceProperties,
      statistics,
      job.STATE,
    );

    recommendations.push(...optimizationRecommendations);

    return {
      job_name: job.NAME,
      database: job.DB_NAME,
      table: job.TABLE_NAME,
      state: job.STATE,
      create_time: job.CREATE_TIME,
      data_source: job.DATA_SOURCE_NAME,
      current_tasks: currentTaskNum,
      config_score: Math.max(0, configScore),
      config_health:
        configScore >= 80
          ? 'GOOD'
          : configScore >= 60
            ? 'FAIR'
            : configScore >= 40
              ? 'POOR'
              : 'CRITICAL',
      configuration: {
        job_properties: jobProperties,
        data_source_properties: dataSourceProperties,
        custom_properties: customProperties,
      },
      statistics: statistics,
      issues: issues,
      warnings: warnings,
      recommendations: recommendations,
      performance_analysis: performanceIssues,
    };
  }

  /**
   * 解析 Routine Load 属性字符串
   */
  parseJobProperties(propertiesStr) {
    if (!propertiesStr) return {};

    try {
      // properties 通常是 JSON 字符串
      return JSON.parse(propertiesStr);
    } catch (e) {
      // 如果不是 JSON，尝试解析 key=value 格式
      const properties = {};
      const pairs = propertiesStr.split(/[,;\n]/);
      pairs.forEach((pair) => {
        const match = pair.match(/^\s*(\w+)\s*[:=]\s*(.+?)\s*$/);
        if (match) {
          properties[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      });
      return properties;
    }
  }

  /**
   * 分析 Routine Load 性能
   */
  analyzeRoutineLoadPerformance(statistics) {
    const warnings = [];
    let scorePenalty = 0;

    // 解析统计数据
    const receivedBytes = parseFloat(statistics.receivedBytes) || 0;
    const loadedRows = parseFloat(statistics.loadedRows) || 0;
    const errorRows = parseFloat(statistics.errorRows) || 0;
    const totalRows = loadedRows + errorRows;
    const taskConsumeSecond =
      parseFloat(statistics.currentTaskConsumeSecond) || 0;

    // 1. 检查错误率
    if (totalRows > 0) {
      const errorRate = (errorRows / totalRows) * 100;
      if (errorRate > 5) {
        warnings.push({
          type: 'high_error_rate',
          severity: 'WARNING',
          message: `错误率较高: ${errorRate.toFixed(2)}%`,
          error_rows: errorRows,
          total_rows: totalRows,
          impact: '数据质量问题或格式不匹配',
        });
        scorePenalty += 15;
      }
    }

    // 2. 检查消费速度
    if (
      taskConsumeSecond >
      this.rules.routine_load.recommended_task_consume_second * 2
    ) {
      warnings.push({
        type: 'slow_consume_speed',
        severity: 'WARNING',
        message: `消费速度较慢: ${taskConsumeSecond.toFixed(1)}秒/批次`,
        current_value: taskConsumeSecond,
        recommended_value:
          this.rules.routine_load.recommended_task_consume_second,
        impact: '数据消费缓慢可能导致延迟累积',
      });
      scorePenalty += 10;
    }

    // 3. 检查吞吐量
    if (receivedBytes > 0 && taskConsumeSecond > 0) {
      const throughputMBps = receivedBytes / taskConsumeSecond / 1024 / 1024;
      if (throughputMBps < 1) {
        warnings.push({
          type: 'low_throughput',
          severity: 'INFO',
          message: `吞吐量较低: ${throughputMBps.toFixed(2)} MB/s`,
          suggestion: '考虑优化批次大小或增加并发数',
        });
        scorePenalty += 5;
      }
    }

    return {
      warnings: warnings,
      score_penalty: scorePenalty,
      metrics: {
        received_bytes: receivedBytes,
        loaded_rows: loadedRows,
        error_rows: errorRows,
        error_rate:
          totalRows > 0 ? ((errorRows / totalRows) * 100).toFixed(2) : 0,
        task_consume_second: taskConsumeSecond,
        throughput_mbps:
          receivedBytes > 0 && taskConsumeSecond > 0
            ? (receivedBytes / taskConsumeSecond / 1024 / 1024).toFixed(2)
            : 0,
      },
    };
  }

  /**
   * 生成 Routine Load 优化建议
   */
  generateRoutineLoadOptimizations(
    jobProperties,
    dataSourceProperties,
    statistics,
    jobState,
  ) {
    const recommendations = [];

    // 1. 并发优化
    const desiredConcurrentNum =
      parseInt(jobProperties.desired_concurrent_number) || 1;
    if (desiredConcurrentNum === 1 && statistics?.receivedBytes > 100000000) {
      recommendations.push({
        type: 'increase_concurrency',
        priority: 'MEDIUM',
        message: '数据量较大，建议增加并发数',
        current_value: desiredConcurrentNum,
        suggested_value: '2-3',
        command:
          'ALTER ROUTINE LOAD FOR <job_name> PROPERTIES("desired_concurrent_number" = "2")',
      });
    }

    // 2. 批次大小优化
    const maxBatchRows = parseInt(jobProperties.max_batch_rows) || 200000;
    const taskConsumeSecond =
      parseFloat(statistics?.currentTaskConsumeSecond) || 0;

    if (taskConsumeSecond > 5 && maxBatchRows > 100000) {
      recommendations.push({
        type: 'reduce_batch_size',
        priority: 'HIGH',
        message: '消费速度慢，建议减小批次大小',
        current_value: maxBatchRows,
        suggested_value: '50000-100000',
        command:
          'ALTER ROUTINE LOAD FOR <job_name> PROPERTIES("max_batch_rows" = "100000")',
      });
    }

    // 3. 状态恢复建议
    if (jobState === 'PAUSED') {
      recommendations.push({
        type: 'resume_job',
        priority: 'HIGH',
        message: '作业已暂停，建议检查原因后恢复',
        command: 'RESUME ROUTINE LOAD FOR <job_name>',
      });
    }

    // 4. Kafka 消费组优化
    if (dataSourceProperties.kafka_topic && !dataSourceProperties.property) {
      recommendations.push({
        type: 'kafka_consumer_properties',
        priority: 'LOW',
        message: '建议配置 Kafka consumer 属性以优化消费行为',
        example:
          'property.group.id, property.client.id, property.max.poll.records',
      });
    }

    return recommendations;
  }

  /**
   * 生成综合评估
   */
  generateRoutineLoadOverallAssessment(jobAnalysis) {
    const totalJobs = jobAnalysis.length;
    const healthyJobs = jobAnalysis.filter(
      (j) => j.config_health === 'GOOD',
    ).length;
    const criticalJobs = jobAnalysis.filter(
      (j) => j.config_health === 'CRITICAL',
    ).length;
    const pausedJobs = jobAnalysis.filter((j) => j.state === 'PAUSED').length;
    const cancelledJobs = jobAnalysis.filter(
      (j) => j.state === 'CANCELLED',
    ).length;

    const avgConfigScore =
      jobAnalysis.reduce((sum, j) => sum + j.config_score, 0) / totalJobs;

    let overallHealth = 'GOOD';
    if (criticalJobs > 0 || cancelledJobs > 0) {
      overallHealth = 'CRITICAL';
    } else if (pausedJobs > 0 || avgConfigScore < 70) {
      overallHealth = 'WARNING';
    }

    return {
      total_jobs: totalJobs,
      healthy_jobs: healthyJobs,
      critical_jobs: criticalJobs,
      paused_jobs: pausedJobs,
      cancelled_jobs: cancelledJobs,
      average_config_score: Math.round(avgConfigScore),
      overall_health: overallHealth,
      summary:
        overallHealth === 'CRITICAL'
          ? `发现 ${criticalJobs + cancelledJobs} 个严重问题的作业，需要立即处理`
          : overallHealth === 'WARNING'
            ? `${pausedJobs} 个作业已暂停，建议检查配置`
            : '所有 Routine Load 作业配置健康',
    };
  }

  /**
   * 格式化 Routine Load 配置检查报告
   */
  formatRoutineLoadConfigReport(result) {
    if (result.status !== 'completed') {
      return `❌ Routine Load 配置检查失败: ${result.error || result.message}`;
    }

    let report = '📊 Routine Load 作业配置检查报告\n';
    report += '==========================================\n\n';

    // 综合评估
    const assessment = result.overall_assessment;
    report += '📈 综合评估:\n';
    report += `   总作业数: ${assessment.total_jobs}\n`;
    report += `   健康作业: ${assessment.healthy_jobs}\n`;
    report += `   平均配置分数: ${assessment.average_config_score}/100\n`;
    report += `   整体健康度: ${assessment.overall_health}\n`;
    if (assessment.paused_jobs > 0) {
      report += `   ⚠️  暂停作业: ${assessment.paused_jobs}\n`;
    }
    if (assessment.cancelled_jobs > 0) {
      report += `   ❌ 取消作业: ${assessment.cancelled_jobs}\n`;
    }
    report += `\n   ${assessment.summary}\n\n`;

    // 详细作业分析
    report += '📋 详细作业分析:\n';
    report += '==========================================\n\n';

    for (const job of result.job_analysis) {
      const healthIcon =
        job.config_health === 'GOOD'
          ? '✅'
          : job.config_health === 'FAIR'
            ? '⚠️'
            : '❌';

      report += `${healthIcon} **${job.job_name}** (${job.database}.${job.table})\n`;
      report += `   状态: ${job.state}\n`;
      report += `   配置健康度: ${job.config_health} (${job.config_score}/100)\n`;
      report += `   当前任务数: ${job.current_tasks}\n`;

      // 关键配置
      const config = job.configuration.job_properties;
      report += `   关键配置:\n`;
      if (config.desired_concurrent_number) {
        report += `     - 并发数: ${config.desired_concurrent_number}\n`;
      }
      if (config.max_batch_interval) {
        report += `     - 批次间隔: ${config.max_batch_interval}s\n`;
      }
      if (config.max_batch_rows) {
        report += `     - 批次行数: ${parseInt(config.max_batch_rows).toLocaleString()}\n`;
      }
      if (config.max_error_number) {
        report += `     - 最大错误数: ${parseInt(config.max_error_number).toLocaleString()}\n`;
      }

      // 性能指标
      if (job.performance_analysis) {
        const perf = job.performance_analysis.metrics;
        report += `   性能指标:\n`;
        report += `     - 已加载行数: ${parseInt(perf.loaded_rows).toLocaleString()}\n`;
        report += `     - 错误率: ${perf.error_rate}%\n`;
        report += `     - 消费速度: ${perf.task_consume_second}s/批次\n`;
        if (perf.throughput_mbps > 0) {
          report += `     - 吞吐量: ${perf.throughput_mbps} MB/s\n`;
        }
      }

      // 问题和警告
      if (job.issues.length > 0) {
        report += `   ❌ 问题 (${job.issues.length}):\n`;
        job.issues.slice(0, 3).forEach((issue) => {
          report += `     - ${issue.message}\n`;
        });
      }

      if (job.warnings.length > 0) {
        report += `   ⚠️  警告 (${job.warnings.length}):\n`;
        job.warnings.slice(0, 3).forEach((warning) => {
          report += `     - ${warning.message}\n`;
        });
      }

      // 优化建议
      if (job.recommendations.length > 0) {
        report += `   💡 优化建议:\n`;
        job.recommendations.slice(0, 3).forEach((rec) => {
          const priorityIcon =
            rec.priority === 'HIGH'
              ? '🔥'
              : rec.priority === 'MEDIUM'
                ? '⚠️'
                : 'ℹ️';
          report += `     ${priorityIcon} ${rec.message}\n`;
          if (rec.command) {
            report += `        命令: ${rec.command.replace('<job_name>', job.job_name)}\n`;
          }
        });
      }

      report += '\n';
    }

    return report;
  }

  /**
   * 根据 Label 或 TxnId 查询导入任务状态并分析失败原因
   * @param {Object} connection - 数据库连接
   * @param {string} label - 导入任务的 Label (可选)
   * @param {number} txnId - 事务 ID (可选)
   * @param {string} dbName - 数据库名称 (可选，用于精确匹配)
   * @param {boolean} includeRecommendations - 是否包含优化建议 (默认 true)
   * @returns {Object} 导入任务详细信息和失败原因分析
   */
  async checkLoadJobStatus(
    connection,
    label = null,
    txnId = null,
    dbName = null,
    includeRecommendations = true,
    useLlmAnalysis = true, // 默认启用 LLM 分析，提供更准确的失败原因识别
  ) {
    console.error(
      `🔍 查询导入任务: label=${label || 'N/A'}, txn_id=${txnId || 'N/A'}, llm_analysis=${useLlmAnalysis}`,
    );
    const startTime = Date.now();

    try {
      // 1. 参数验证
      if (!label && !txnId) {
        throw new Error('必须提供 label 或 txn_id 中的至少一个参数');
      }

      // 2. 构建查询条件
      const conditions = [];
      const params = [];

      if (label) {
        // 使用模糊匹配，因为系统可能在 label 前添加前缀（如 insert_, load_ 等）
        conditions.push('LABEL LIKE ?');
        params.push(`%${label}`);
      }

      if (txnId) {
        conditions.push('TXN_ID = ?');
        params.push(txnId);
      }

      if (dbName) {
        conditions.push('DB_NAME = ?');
        params.push(dbName);
      }

      const whereClause = conditions.join(' AND ');

      // 3. 先查询历史表 (_statistics_.loads_history)
      let loadJob = null;
      let dataSource = null;

      try {
        const historyQuery = `
          SELECT
            job_id as JOB_ID,
            label as LABEL,
            db_name as DB_NAME,
            table_name as TABLE_NAME,
            state as STATE,
            progress as PROGRESS,
            type as TYPE,
            priority as PRIORITY,
            scan_rows as SCAN_ROWS,
            scan_bytes as SCAN_BYTES,
            filtered_rows as FILTERED_ROWS,
            unselected_rows as UNSELECTED_ROWS,
            sink_rows as SINK_ROWS,
            create_time as CREATE_TIME,
            load_start_time as LOAD_START_TIME,
            load_commit_time as LOAD_COMMIT_TIME,
            load_finish_time as LOAD_FINISH_TIME,
            error_msg as ERROR_MSG,
            tracking_sql as TRACKING_SQL,
            rejected_record_path as REJECTED_RECORD_PATH
          FROM _statistics_.loads_history
          WHERE ${whereClause}
          ORDER BY CREATE_TIME DESC
          LIMIT 1
        `;

        const [historyResults] = await connection.query(historyQuery, params);

        if (historyResults && historyResults.length > 0) {
          loadJob = historyResults[0];
          dataSource = 'loads_history';
          console.error(
            `✅ 从 loads_history 找到任务: ${loadJob.LABEL}, 状态: ${loadJob.STATE}`,
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ 查询 loads_history 失败: ${error.message}，尝试查询 information_schema.loads`,
        );
      }

      // 4. 如果历史表没找到，查询内存表 (information_schema.loads)
      if (!loadJob) {
        try {
          const memoryQuery = `
            SELECT
              JOB_ID,
              LABEL,
              DB_NAME,
              TABLE_NAME,
              STATE,
              PROGRESS,
              TYPE,
              PRIORITY,
              SCAN_ROWS,
              SCAN_BYTES,
              FILTERED_ROWS,
              UNSELECTED_ROWS,
              SINK_ROWS,
              CREATE_TIME,
              LOAD_START_TIME,
              LOAD_COMMIT_TIME,
              LOAD_FINISH_TIME,
              ERROR_MSG,
              TRACKING_SQL,
              REJECTED_RECORD_PATH
            FROM information_schema.loads
            WHERE ${whereClause}
            ORDER BY CREATE_TIME DESC
            LIMIT 1
          `;

          const [memoryResults] = await connection.query(memoryQuery, params);

          if (memoryResults && memoryResults.length > 0) {
            loadJob = memoryResults[0];
            dataSource = 'information_schema.loads';
            console.error(
              `✅ 从 information_schema.loads 找到任务: ${loadJob.LABEL}, 状态: ${loadJob.STATE}`,
            );
          }
        } catch (error) {
          console.error(
            `❌ 查询 information_schema.loads 失败: ${error.message}`,
          );
        }
      }

      // 5. 如果都没找到
      if (!loadJob) {
        return {
          status: 'not_found',
          message: `未找到匹配的导入任务 (label=${label || 'N/A'}, txn_id=${txnId || 'N/A'})`,
          search_criteria: {
            label: label || null,
            txn_id: txnId || null,
            database_name: dbName || null,
          },
          analysis_duration_ms: Date.now() - startTime,
        };
      }

      // 6. 计算性能指标
      const metrics = this.calculateLoadJobMetrics(loadJob);

      // 7. 分析失败原因（如果失败）
      let failureAnalysis = null;
      if (loadJob.STATE !== 'FINISHED') {
        if (useLlmAnalysis) {
          // 使用 LLM 进行智能分析
          failureAnalysis = await this.analyzeLoadJobFailureWithLLM(
            loadJob,
            metrics,
          );
        } else {
          // 使用规则匹配进行快速分析
          failureAnalysis = this.analyzeLoadJobFailure(loadJob);
        }
      }

      // 8. 生成建议（如果需要）
      let recommendations = null;
      if (includeRecommendations && loadJob.STATE !== 'FINISHED') {
        // 优先使用 LLM 生成的建议（如果存在）
        if (
          failureAnalysis?.recommendations &&
          Array.isArray(failureAnalysis.recommendations) &&
          failureAnalysis.recommendations.length > 0
        ) {
          console.error('✅ 使用 LLM 生成的优化建议');
          recommendations = failureAnalysis.recommendations;
        } else {
          // 否则使用规则匹配生成建议
          console.error('ℹ️ 使用规则匹配生成优化建议');
          recommendations = this.generateLoadJobRecommendations(
            loadJob,
            failureAnalysis,
          );
        }
      }

      // 9. 构建完整报告
      const report = {
        status: 'success',
        data_source: dataSource,
        job_info: {
          job_id: loadJob.JOB_ID,
          label: loadJob.LABEL,
          database: loadJob.DB_NAME,
          table: loadJob.TABLE_NAME,
          state: loadJob.STATE,
          type: loadJob.TYPE,
          priority: loadJob.PRIORITY,
          progress: loadJob.PROGRESS,
        },
        timing: {
          create_time: loadJob.CREATE_TIME,
          load_start_time: loadJob.LOAD_START_TIME,
          load_commit_time: loadJob.LOAD_COMMIT_TIME,
          load_finish_time: loadJob.LOAD_FINISH_TIME,
          load_duration_seconds: metrics.load_duration_seconds,
          total_duration_seconds: metrics.total_duration_seconds,
        },
        data_stats: {
          scan_rows: loadJob.SCAN_ROWS,
          scan_bytes: loadJob.SCAN_BYTES,
          scan_bytes_mb: metrics.scan_bytes_mb,
          filtered_rows: loadJob.FILTERED_ROWS,
          unselected_rows: loadJob.UNSELECTED_ROWS,
          sink_rows: loadJob.SINK_ROWS,
          filter_ratio: metrics.filter_ratio,
        },
        performance: {
          throughput_mbps: metrics.throughput_mbps,
          rows_per_second: metrics.rows_per_second,
        },
        error_info:
          loadJob.STATE !== 'FINISHED'
            ? {
                error_msg: loadJob.ERROR_MSG || null,
                tracking_sql: loadJob.TRACKING_SQL || null,
                rejected_record_path: loadJob.REJECTED_RECORD_PATH || null,
              }
            : null,
        failure_analysis: failureAnalysis,
        recommendations: recommendations,
        analysis_duration_ms: Date.now() - startTime,
      };

      console.error(
        `✅ 分析完成，耗时 ${report.analysis_duration_ms}ms, 状态: ${loadJob.STATE}`,
      );

      return this.formatLoadJobStatusReport(report);
    } catch (error) {
      console.error(`❌ checkLoadJobStatus 失败: ${error.message}`);
      return {
        status: 'error',
        message: `查询导入任务状态失败: ${error.message}`,
        search_criteria: {
          label: label || null,
          txn_id: txnId || null,
          database_name: dbName || null,
        },
        error: error.message,
        analysis_duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * 计算导入任务的性能指标
   */
  calculateLoadJobMetrics(loadJob) {
    const metrics = {
      load_duration_seconds: null,
      total_duration_seconds: null,
      scan_bytes_mb: 0,
      throughput_mbps: null,
      rows_per_second: null,
      filter_ratio: null,
    };

    // 计算耗时
    if (loadJob.LOAD_START_TIME && loadJob.LOAD_FINISH_TIME) {
      const loadStart = new Date(loadJob.LOAD_START_TIME);
      const loadFinish = new Date(loadJob.LOAD_FINISH_TIME);
      metrics.load_duration_seconds = (loadFinish - loadStart) / 1000;
    }

    if (loadJob.CREATE_TIME && loadJob.LOAD_FINISH_TIME) {
      const createTime = new Date(loadJob.CREATE_TIME);
      const finishTime = new Date(loadJob.LOAD_FINISH_TIME);
      metrics.total_duration_seconds = (finishTime - createTime) / 1000;
    }

    // 计算数据量
    if (loadJob.SCAN_BYTES) {
      metrics.scan_bytes_mb = (loadJob.SCAN_BYTES / (1024 * 1024)).toFixed(2);
    }

    // 计算吞吐量
    if (metrics.load_duration_seconds > 0 && loadJob.SCAN_BYTES) {
      metrics.throughput_mbps =
        loadJob.SCAN_BYTES / (1024 * 1024) / metrics.load_duration_seconds;
    }

    if (metrics.load_duration_seconds > 0 && loadJob.SCAN_ROWS) {
      metrics.rows_per_second =
        loadJob.SCAN_ROWS / metrics.load_duration_seconds;
    }

    // 计算过滤率
    if (loadJob.SCAN_ROWS > 0) {
      const filteredRows =
        (loadJob.FILTERED_ROWS || 0) + (loadJob.UNSELECTED_ROWS || 0);
      metrics.filter_ratio = (filteredRows / loadJob.SCAN_ROWS) * 100;
    }

    return metrics;
  }

  /**
   * 分析导入任务失败原因
   * 使用优先级匹配策略，确保最相关的错误类别被识别
   */
  analyzeLoadJobFailure(loadJob) {
    const errorMsg = (loadJob.ERROR_MSG || '').toLowerCase();
    const state = loadJob.STATE;

    const analysis = {
      category: 'unknown',
      root_cause: null,
      details: [],
      related_issues: [],
    };

    // 优先级匹配：从高优先级到低优先级
    // 优先级 1: Timeout 相关（最高优先级，因为 timeout 是明确的失败原因）
    if (errorMsg.includes('timeout') || errorMsg.includes('reached timeout')) {
      analysis.category = 'timeout';
      analysis.root_cause = '导入任务超时';
      analysis.details.push('任务执行时间超过了配置的超时阈值');

      if (errorMsg.includes('reached timeout')) {
        analysis.details.push('可能的原因: 资源不足、BRPC 延迟、线程池瓶颈');
        analysis.related_issues.push(
          '建议使用 analyze_reached_timeout 工具深度分析',
        );
      }

      if (loadJob.TYPE === 'ROUTINE_LOAD') {
        analysis.details.push('Routine Load 超时可能与消费速度、批次大小有关');
      }

      return analysis;
    }

    // 优先级 2: 资源不足（明确的系统资源问题）
    if (
      errorMsg.includes('out of memory') ||
      errorMsg.includes('oom') ||
      errorMsg.includes('no available')
    ) {
      analysis.category = 'resource';
      analysis.root_cause = '资源不足';

      if (errorMsg.includes('memory') || errorMsg.includes('oom')) {
        analysis.details.push('内存不足，可能需要增加 BE 内存或减少导入并发');
      }
      if (errorMsg.includes('no available')) {
        analysis.details.push('无可用资源，可能是 BE 节点不足或负载过高');
      }

      return analysis;
    }

    // 优先级 3: 网络连接问题（明确的连接失败）
    if (
      errorMsg.includes('connection refused') ||
      errorMsg.includes('connection reset') ||
      errorMsg.includes('broken pipe') ||
      errorMsg.includes('connect failed')
    ) {
      analysis.category = 'network';
      analysis.root_cause = '网络连接问题';
      analysis.details.push('FE/BE 节点之间网络连接异常');

      return analysis;
    }

    // 优先级 4: 文件访问问题（Broker Load 相关）
    if (
      errorMsg.includes('file not found') ||
      errorMsg.includes('path not found') ||
      errorMsg.includes('no such file')
    ) {
      analysis.category = 'file';
      analysis.root_cause = '文件访问问题';
      analysis.details.push('无法访问源文件，请检查文件路径和权限');

      return analysis;
    }

    // 优先级 5: 权限问题（明确的权限错误）
    if (
      errorMsg.includes('permission denied') ||
      errorMsg.includes('access denied')
    ) {
      analysis.category = 'permission';
      analysis.root_cause = '权限不足';
      analysis.details.push('用户权限不足或文件访问权限不足');

      return analysis;
    }

    // 优先级 6: 事务问题
    if (errorMsg.includes('transaction') || errorMsg.includes('txn')) {
      analysis.category = 'transaction';
      analysis.root_cause = '事务处理异常';
      analysis.details.push('事务提交或回滚过程中出现问题');

      return analysis;
    }

    // 优先级 7: 配置错误（明确的参数问题）
    if (errorMsg.includes('invalid') || errorMsg.includes('illegal')) {
      analysis.category = 'configuration';
      analysis.root_cause = '配置参数错误';
      analysis.details.push('导入参数配置不正确');

      return analysis;
    }

    // 优先级 8: 数据质量问题（较低优先级，因为关键词容易误匹配）
    if (
      errorMsg.includes('column') ||
      errorMsg.includes('type mismatch') ||
      errorMsg.includes('parse error') ||
      errorMsg.includes('format error')
    ) {
      analysis.category = 'data_quality';
      analysis.root_cause = '数据格式或类型不匹配';
      analysis.details.push('数据格式与表结构不匹配');

      if (loadJob.FILTERED_ROWS > 0) {
        analysis.details.push(
          `已过滤 ${loadJob.FILTERED_ROWS} 行数据，请检查被过滤的数据`,
        );
      }

      if (loadJob.REJECTED_RECORD_PATH) {
        analysis.details.push(`错误数据路径: ${loadJob.REJECTED_RECORD_PATH}`);
      }

      return analysis;
    }

    // 优先级 9: CANCELLED 状态（最后检查状态）
    if (state === 'CANCELLED') {
      analysis.category = 'cancelled';
      analysis.root_cause = '任务被取消';
      analysis.details.push('任务被用户或系统取消');

      if (errorMsg) {
        analysis.details.push(`错误信息: ${loadJob.ERROR_MSG}`);
      }

      return analysis;
    }

    // 优先级 10: 其他错误（兜底）
    if (errorMsg) {
      analysis.category = 'other';
      analysis.root_cause = '其他错误';
      analysis.details.push(loadJob.ERROR_MSG);

      return analysis;
    }

    return analysis;
  }

  /**
   * 使用 LLM 分析导入任务失败原因
   * 支持多种 LLM: DeepSeek (OpenAI 兼容)、Gemini
   * @param {Object} loadJob - 导入任务信息
   * @param {Object} metrics - 性能指标
   * @returns {Promise<Object>} LLM 分析结果
   */
  async analyzeLoadJobFailureWithLLM(loadJob, metrics) {
    console.error('🤖 使用 LLM 进行智能分析...');

    // 构建分析 prompt (通用格式)
    const prompt = `你是 StarRocks 数据库的专家，请分析以下导入任务的失败原因：

【任务信息】
- Label: ${loadJob.LABEL}
- 状态: ${loadJob.STATE}
- 导入类型: ${loadJob.TYPE}
- 数据库: ${loadJob.DB_NAME}
- 表名: ${loadJob.TABLE_NAME}

【错误信息】
${loadJob.ERROR_MSG || 'N/A'}

【性能指标】
- 扫描行数: ${loadJob.SCAN_ROWS || 0}
- 扫描字节: ${loadJob.SCAN_BYTES || 0} bytes
- 导入行数: ${loadJob.SINK_ROWS || 0}
- 过滤行数: ${loadJob.FILTERED_ROWS || 0}
- 导入耗时: ${metrics.load_duration_seconds || 'N/A'} 秒
- 吞吐量: ${metrics.throughput_mbps ? metrics.throughput_mbps.toFixed(2) + ' MB/s' : 'N/A'}

【时间信息】
- 创建时间: ${loadJob.CREATE_TIME}
- 导入开始: ${loadJob.LOAD_START_TIME || 'N/A'}
- 导入完成: ${loadJob.LOAD_FINISH_TIME || 'N/A'}

请以 JSON 格式返回分析结果，包含以下字段：
{
  "category": "失败类别（timeout/resource/data_quality/network/file/transaction/configuration/permission/cancelled/other）",
  "root_cause": "根本原因（简短描述）",
  "details": ["详细分析点1", "详细分析点2", ...],
  "related_issues": ["相关问题或建议1", "相关问题或建议2", ...],
  "recommendations": [
    {
      "priority": "优先级（high/medium/low）",
      "category": "建议分类",
      "suggestions": ["具体建议1", "具体建议2", ...]
    }
  ]
}

注意：
- recommendations 应该根据失败类别提供针对性的优化建议
- 每个建议要包含优先级（high/medium/low）、分类和具体的操作建议
- 建议要具体、可执行，包含配置参数、SQL命令、工具推荐等

只返回 JSON，不要添加任何其他文字说明。`;

    // 优先级 1: DeepSeek (OpenAI 兼容 API)
    const deepseekKey =
      process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY;
    if (deepseekKey) {
      try {
        console.error('  → 使用 DeepSeek API...');
        const response = await fetch(
          'https://api.deepseek.com/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deepseekKey}`,
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.3,
              response_format: { type: 'json_object' },
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.choices[0].message.content;
          return this.parseLLMResponse(text, 'DeepSeek');
        } else {
          console.warn(
            `⚠️ DeepSeek API 调用失败: ${response.status} ${response.statusText}`,
          );
        }
      } catch (error) {
        console.warn(`⚠️ DeepSeek API 调用失败: ${error.message}`);
      }
    }

    // 优先级 2: OpenAI 兼容 API (通用)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        console.error('  → 使用 OpenAI API...');
        const response = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              temperature: 0.3,
              response_format: { type: 'json_object' },
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.choices[0].message.content;
          return this.parseLLMResponse(text, 'OpenAI');
        } else {
          console.warn(
            `⚠️ OpenAI API 调用失败: ${response.status} ${response.statusText}`,
          );
        }
      } catch (error) {
        console.warn(`⚠️ OpenAI API 调用失败: ${error.message}`);
      }
    }

    // 优先级 3: Gemini API
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey && GoogleGenerativeAI) {
      try {
        console.error('  → 使用 Gemini API...');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash-exp',
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return this.parseLLMResponse(text, 'Gemini');
      } catch (error) {
        console.warn(`⚠️ Gemini API 调用失败: ${error.message}`);
      }
    }

    // 所有 LLM 都不可用，fallback 到规则匹配
    console.warn('⚠️ 未配置任何 LLM API Key，fallback 到规则匹配');
    console.warn(
      '提示: 请设置 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 GEMINI_API_KEY 环境变量',
    );
    return this.analyzeLoadJobFailure(loadJob);
  }

  /**
   * 解析 LLM 返回的 JSON 响应
   * @param {string} text - LLM 返回的文本
   * @param {string} llmName - LLM 名称（用于日志）
   * @returns {Object} 解析后的分析结果
   */
  parseLLMResponse(text, llmName) {
    try {
      // 移除可能的 markdown 代码块标记
      const jsonText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const llmAnalysis = JSON.parse(jsonText);

      // 验证返回的字段
      if (!llmAnalysis.category || !llmAnalysis.root_cause) {
        console.warn(`⚠️ ${llmName} 返回格式不完整，fallback 到规则匹配`);
        return this.analyzeLoadJobFailure({
          ERROR_MSG: text,
          STATE: 'CANCELLED',
        });
      }

      console.error(`✅ ${llmName} 分析完成`);
      return {
        category: llmAnalysis.category,
        root_cause: llmAnalysis.root_cause,
        details: llmAnalysis.details || [],
        related_issues: llmAnalysis.related_issues || [],
        recommendations: llmAnalysis.recommendations || [], // LLM 生成的建议
        analysis_method: 'llm',
        llm_provider: llmName,
      };
    } catch (parseError) {
      console.error(`❌ 解析 ${llmName} 返回结果失败: ${parseError.message}`);
      console.error(`${llmName} 返回内容:`, text);
      console.warn('⚠️ Fallback 到规则匹配');
      return this.analyzeLoadJobFailure({
        ERROR_MSG: text,
        STATE: 'CANCELLED',
      });
    }
  }

  /**
   * 生成导入任务的优化建议
   */
  generateLoadJobRecommendations(loadJob, failureAnalysis) {
    const recommendations = [];

    if (!failureAnalysis) {
      return recommendations;
    }

    // 根据失败类别给出建议
    switch (failureAnalysis.category) {
      case 'timeout':
        recommendations.push({
          priority: 'high',
          category: '超时问题',
          suggestions: [
            '使用 analyze_reached_timeout 工具进行深度分析',
            '检查 BE 节点资源使用情况（CPU、IO、内存）',
            '检查线程池状态（Async delta writer、Memtable flush）',
            '如果是 BRPC 延迟问题，考虑增加 BE 节点或优化网络',
            '临时解决方案：增加超时时间 (SET PROPERTY "timeout" = "7200")',
          ],
        });

        if (loadJob.TYPE === 'ROUTINE_LOAD') {
          recommendations.push({
            priority: 'medium',
            category: 'Routine Load 优化',
            suggestions: [
              '减少 desired_concurrent_number（降低并发）',
              '增加 max_batch_interval（增加批次间隔）',
              '减少 max_batch_rows（减少批次大小）',
              '使用 check_routine_load_config 工具检查配置',
            ],
          });
        }
        break;

      case 'resource':
        recommendations.push({
          priority: 'high',
          category: '资源优化',
          suggestions: [
            '增加 BE 节点内存配置',
            '减少并发导入任务数量',
            '使用 analyze_memory 工具分析内存使用',
            '检查是否有其他高负载任务',
            '考虑在低峰期执行导入任务',
          ],
        });
        break;

      case 'data_quality':
        recommendations.push({
          priority: 'high',
          category: '数据质量',
          suggestions: [
            '检查源数据格式是否与表结构匹配',
            '查看被过滤的数据记录 (REJECTED_RECORD_PATH)',
            '调整 max_filter_ratio 允许部分数据错误',
            '使用 TRACKING_SQL 查看详细的列映射错误',
            '验证数据类型转换规则',
          ],
        });

        if (loadJob.TRACKING_SQL) {
          recommendations.push({
            priority: 'medium',
            category: '调试信息',
            suggestions: [
              `执行 TRACKING_SQL 查看详细错误:\n${loadJob.TRACKING_SQL}`,
            ],
          });
        }
        break;

      case 'network':
        recommendations.push({
          priority: 'high',
          category: '网络问题',
          suggestions: [
            '检查 FE 和 BE 节点之间的网络连通性',
            '查看 BE 日志中的网络错误',
            '检查防火墙设置',
            '验证节点间的端口是否正常开放',
            '如果是云环境，检查安全组规则',
          ],
        });
        break;

      case 'file':
        recommendations.push({
          priority: 'high',
          category: '文件访问',
          suggestions: [
            '验证文件路径是否正确',
            '检查 Broker 配置是否正确',
            '确认文件访问权限（HDFS/S3 凭证）',
            '检查文件是否存在',
            '验证文件格式是否正确',
          ],
        });
        break;

      case 'transaction':
        recommendations.push({
          priority: 'medium',
          category: '事务问题',
          suggestions: [
            '检查是否有长时间未提交的事务',
            '验证表是否被锁定',
            '查看 FE 日志中的事务相关错误',
            '考虑重试导入任务',
          ],
        });
        break;

      case 'configuration':
        recommendations.push({
          priority: 'high',
          category: '配置检查',
          suggestions: [
            '检查导入语句的参数配置',
            '验证列映射是否正确',
            '确认分隔符、行分隔符等格式参数',
            '参考官方文档验证参数有效性',
          ],
        });
        break;

      case 'permission':
        recommendations.push({
          priority: 'high',
          category: '权限问题',
          suggestions: [
            '检查用户是否有表的 INSERT 权限',
            '验证 Broker 访问文件的权限',
            '确认 HDFS/S3 的访问凭证是否正确',
            '联系管理员授予必要权限',
          ],
        });
        break;

      case 'cancelled':
        recommendations.push({
          priority: 'low',
          category: '任务取消',
          suggestions: [
            '如果是手动取消，可以重新提交任务',
            '如果是系统取消，检查取消原因',
            '查看 FE 日志了解详细信息',
          ],
        });
        break;

      default:
        recommendations.push({
          priority: 'medium',
          category: '通用建议',
          suggestions: [
            '查看完整的 ERROR_MSG 了解详细错误',
            '检查 FE 和 BE 日志',
            '如果有 TRACKING_SQL，执行它查看更多信息',
            '联系 StarRocks 技术支持',
          ],
        });
    }

    // 通用建议
    if (loadJob.TRACKING_SQL) {
      recommendations.push({
        priority: 'low',
        category: '调试工具',
        suggestions: [
          '使用 TRACKING_SQL 查看详细错误信息',
          '如果需要分析 Profile，使用 analyze_load_channel_profile 工具',
        ],
      });
    }

    return recommendations;
  }

  /**
   * 格式化导入任务状态报告
   */
  formatLoadJobStatusReport(report) {
    let output = '\n';
    output +=
      '═══════════════════════════════════════════════════════════════\n';
    output += '          📊 导入任务状态分析报告\n';
    output +=
      '═══════════════════════════════════════════════════════════════\n\n';

    // 基本信息
    output += '【基本信息】\n';
    output += `  • Label: ${report.job_info.label}\n`;
    output += `  • Job ID: ${report.job_info.job_id || 'N/A'}\n`;
    output += `  • 数据库: ${report.job_info.database}\n`;
    output += `  • 表名: ${report.job_info.table}\n`;
    output += `  • 导入类型: ${report.job_info.type}\n`;
    output += `  • 状态: ${this.getStateEmoji(report.job_info.state)} ${report.job_info.state}\n`;
    output += `  • 进度: ${report.job_info.progress || 'N/A'}\n`;
    output += `  • 优先级: ${report.job_info.priority || 'N/A'}\n`;
    output += `  • 数据源: ${report.data_source}\n`;
    output += '\n';

    // 时间信息
    output += '【时间信息】\n';
    output += `  • 创建时间: ${report.timing.create_time}\n`;
    if (report.timing.load_start_time) {
      output += `  • 导入开始: ${report.timing.load_start_time}\n`;
      output += `  • 导入提交: ${report.timing.load_commit_time || 'N/A'}\n`;
      output += `  • 导入完成: ${report.timing.load_finish_time || 'N/A'}\n`;
      output += `  • 导入耗时: ${this.formatDuration(report.timing.load_duration_seconds)}\n`;
    }
    if (report.timing.total_duration_seconds) {
      output += `  • 总耗时: ${this.formatDuration(report.timing.total_duration_seconds)}\n`;
    }
    output += '\n';

    // 数据统计
    output += '【数据统计】\n';
    output += `  • 扫描行数: ${this.formatNumber(report.data_stats.scan_rows)}\n`;
    output += `  • 扫描字节: ${this.formatBytes(report.data_stats.scan_bytes)} (${report.data_stats.scan_bytes_mb} MB)\n`;
    output += `  • 导入行数: ${this.formatNumber(report.data_stats.sink_rows)}\n`;
    output += `  • 过滤行数: ${this.formatNumber(report.data_stats.filtered_rows)}\n`;
    output += `  • 未选择行数: ${this.formatNumber(report.data_stats.unselected_rows)}\n`;
    if (report.data_stats.filter_ratio !== null) {
      output += `  • 过滤率: ${report.data_stats.filter_ratio.toFixed(2)}%\n`;
    }
    output += '\n';

    // 性能指标
    if (
      report.performance.throughput_mbps ||
      report.performance.rows_per_second
    ) {
      output += '【性能指标】\n';
      if (report.performance.throughput_mbps) {
        output += `  • 吞吐量: ${report.performance.throughput_mbps.toFixed(2)} MB/s\n`;
      }
      if (report.performance.rows_per_second) {
        output += `  • 导入速度: ${this.formatNumber(Math.round(report.performance.rows_per_second))} 行/秒\n`;
      }
      output += '\n';
    }

    // 错误信息
    if (report.error_info) {
      output += '【错误信息】\n';
      if (report.error_info.error_msg) {
        output += `  ❌ 错误消息:\n`;
        output += this.indentText(report.error_info.error_msg, '     ');
        output += '\n';
      }
      if (report.error_info.rejected_record_path) {
        output += `  📁 错误数据路径: ${report.error_info.rejected_record_path}\n`;
      }
      if (report.error_info.tracking_sql) {
        output += `  🔍 跟踪 SQL:\n`;
        output += this.indentText(report.error_info.tracking_sql, '     ');
        output += '\n';
      }
      output += '\n';
    }

    // 失败原因分析
    if (report.failure_analysis) {
      output += '【失败原因分析】\n';
      output += `  • 分类: ${this.getCategoryEmoji(report.failure_analysis.category)} ${report.failure_analysis.category.toUpperCase()}\n`;
      output += `  • 根本原因: ${report.failure_analysis.root_cause}\n`;
      if (report.failure_analysis.details.length > 0) {
        output += `  • 详细分析:\n`;
        report.failure_analysis.details.forEach((detail) => {
          output += `    - ${detail}\n`;
        });
      }
      if (report.failure_analysis.related_issues.length > 0) {
        output += `  • 相关问题:\n`;
        report.failure_analysis.related_issues.forEach((issue) => {
          output += `    - ${issue}\n`;
        });
      }
      output += '\n';
    }

    // 优化建议
    if (report.recommendations && report.recommendations.length > 0) {
      output += '【优化建议】\n';
      report.recommendations.forEach((rec, index) => {
        output += `  ${index + 1}. ${rec.category} [${rec.priority.toUpperCase()}]\n`;
        rec.suggestions.forEach((suggestion) => {
          output += `     ${this.getPriorityEmoji(rec.priority)} ${suggestion}\n`;
        });
        if (index < report.recommendations.length - 1) {
          output += '\n';
        }
      });
      output += '\n';
    }

    // 元数据
    output +=
      '───────────────────────────────────────────────────────────────\n';
    output += `分析耗时: ${report.analysis_duration_ms}ms\n`;
    output +=
      '═══════════════════════════════════════════════════════════════\n';

    return output;
  }

  /**
   * 获取状态表情符号
   */
  getStateEmoji(state) {
    const emojiMap = {
      FINISHED: '✅',
      LOADING: '⏳',
      PENDING: '⏸️',
      CANCELLED: '❌',
      UNKNOWN: '❓',
    };
    return emojiMap[state] || '❓';
  }

  /**
   * 获取分类表情符号
   */
  getCategoryEmoji(category) {
    const emojiMap = {
      timeout: '⏱️',
      resource: '💾',
      data_quality: '📊',
      network: '🌐',
      file: '📁',
      transaction: '🔄',
      configuration: '⚙️',
      permission: '🔒',
      cancelled: '🚫',
      other: '❓',
      unknown: '❓',
    };
    return emojiMap[category] || '❓';
  }

  /**
   * 获取优先级表情符号
   */
  getPriorityEmoji(priority) {
    const emojiMap = {
      high: '🔴',
      medium: '🟡',
      low: '🟢',
    };
    return emojiMap[priority] || '⚪';
  }

  /**
   * 格式化时长
   */
  formatDuration(seconds) {
    if (seconds === null || seconds === undefined) {
      return 'N/A';
    }

    if (seconds < 60) {
      return `${seconds.toFixed(2)}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}分${secs.toFixed(0)}秒`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分`;
    }
  }

  /**
   * 格式化数字
   */
  formatNumber(num) {
    if (num === null || num === undefined) {
      return 'N/A';
    }
    return num.toLocaleString();
  }

  /**
   * 缩进文本
   */
  indentText(text, indent) {
    if (!text) return '';
    return (
      text
        .split('\n')
        .map((line) => indent + line)
        .join('\n') + '\n'
    );
  }

  /**
   * 检查表的 Stream Load 任务
   * @param {Object} connection - 数据库连接
   * @param {string} dbName - 数据库名称
   * @param {string} tableName - 表名称
   * @param {number} seconds - 分析时间范围（秒数，默认7天=604800秒）
   * @returns {Object} Stream Load 任务检查结果
   */
  async checkStreamLoadTasks(
    connection,
    dbName,
    tableName,
    seconds = 7 * 24 * 60 * 60,
  ) {
    console.error(
      `🔍 开始检查表 ${dbName}.${tableName} 的 Stream Load 任务...`,
    );
    const startTime = Date.now();

    try {
      // 1. 使用混合查询获取 Stream Load 历史数据（避免数据丢失）
      const loads = await this.getStreamLoadTasksHybrid(connection, {
        dbName,
        tableName,
        hours: seconds / 3600,
      });

      if (!loads || loads.length === 0) {
        // 格式化时间范围显示
        const hours = Math.floor(seconds / 3600);
        const days = Math.floor(hours / 24);
        const timeDesc = days > 0 ? `${days} 天` : `${hours} 小时`;

        return {
          status: 'no_data',
          message: `表 ${dbName}.${tableName} 在最近 ${timeDesc} 内没有 Stream Load 任务记录`,
          analysis_duration_ms: Date.now() - startTime,
        };
      }

      // 2. 基础统计
      const statistics = this.calculateStreamLoadStatistics(loads);

      // 3. 频率分析
      const frequencyAnalysis = this.analyzeStreamLoadFrequency(loads);

      // 4. 批次大小分析
      const batchSizeAnalysis = this.analyzeStreamLoadBatchSize(loads);

      // 5. 性能分析
      const performanceAnalysis = this.analyzeStreamLoadPerformance(loads);

      // 6. 失败分析
      const failureAnalysis = this.analyzeStreamLoadFailures(loads);

      // 7. 慢任务分析
      const slowTaskAnalysis = this.analyzeSlowStreamLoadTasks(loads, 10);

      // 8. 生成问题和建议
      const issuesAndRecommendations =
        this.generateStreamLoadIssuesAndRecommendations(
          statistics,
          frequencyAnalysis,
          batchSizeAnalysis,
          performanceAnalysis,
          failureAnalysis,
        );

      // 9. 计算健康分数
      const healthScore = this.calculateStreamLoadHealthScore(
        statistics,
        frequencyAnalysis,
        performanceAnalysis,
      );

      console.error(
        `✅ Stream Load 任务检查完成，耗时 ${Date.now() - startTime}ms`,
      );

      return {
        status: 'completed',
        analysis_type: 'stream_load_task_check',
        database: dbName,
        table: tableName,
        analysis_period_seconds: seconds,
        analysis_duration_ms: Date.now() - startTime,
        health_score: healthScore,
        statistics: statistics,
        frequency_analysis: frequencyAnalysis,
        batch_size_analysis: batchSizeAnalysis,
        performance_analysis: performanceAnalysis,
        failure_analysis: failureAnalysis,
        slow_task_analysis: slowTaskAnalysis,
        issues: issuesAndRecommendations.issues,
        warnings: issuesAndRecommendations.warnings,
        recommendations: issuesAndRecommendations.recommendations,
      };
    } catch (error) {
      console.error(`❌ Stream Load 任务检查失败: ${error.message}`);
      return {
        status: 'error',
        error: error.message,
        analysis_duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * 计算 Stream Load 基础统计
   */
  calculateStreamLoadStatistics(loads) {
    const totalLoads = loads.length;
    const successLoadsArray = loads.filter((l) => l.state === 'FINISHED');
    const successLoads = successLoadsArray.length;
    const failedLoads = loads.filter((l) => l.state === 'CANCELLED').length;
    const successRate = (successLoads / totalLoads) * 100;

    // 计算总行数和字节数（所有任务）
    const totalScanRows = loads.reduce((sum, l) => sum + (l.scan_rows || 0), 0);
    const totalScanBytes = loads.reduce(
      (sum, l) => sum + (l.scan_bytes || 0),
      0,
    );
    const totalSinkRows = loads.reduce((sum, l) => sum + (l.sink_rows || 0), 0);
    const totalFilteredRows = loads.reduce(
      (sum, l) => sum + (l.filtered_rows || 0),
      0,
    );

    // 计算成功任务的平均值
    const successSinkRows = successLoadsArray.reduce(
      (sum, l) => sum + (l.sink_rows || 0),
      0,
    );
    const successScanBytes = successLoadsArray.reduce(
      (sum, l) => sum + (l.scan_bytes || 0),
      0,
    );

    // 时间跨度
    const firstLoad = loads[loads.length - 1];
    const lastLoad = loads[0];
    const timeSpanSeconds =
      (new Date(lastLoad.create_time) - new Date(firstLoad.create_time)) / 1000;

    return {
      total_loads: totalLoads,
      success_loads: successLoads,
      failed_loads: failedLoads,
      success_rate: parseFloat(successRate.toFixed(2)),
      total_scan_rows: totalScanRows,
      total_scan_bytes: totalScanBytes,
      total_sink_rows: totalSinkRows,
      total_filtered_rows: totalFilteredRows,
      avg_rows_per_load:
        successLoads > 0 ? Math.round(successSinkRows / successLoads) : 0,
      avg_bytes_per_load:
        successLoads > 0 ? Math.round(successScanBytes / successLoads) : 0,
      time_span_seconds: Math.round(timeSpanSeconds),
      first_load_time: firstLoad.create_time,
      last_load_time: lastLoad.create_time,
    };
  }

  /**
   * 分析 Stream Load 频率
   */
  analyzeStreamLoadFrequency(loads) {
    if (loads.length < 2) {
      return {
        status: 'insufficient_data',
        message: '数据量不足，无法分析频率',
      };
    }

    // 按时间排序
    const sortedLoads = [...loads].sort(
      (a, b) => new Date(a.create_time) - new Date(b.create_time),
    );

    // 计算间隔
    const intervals = [];
    for (let i = 1; i < sortedLoads.length; i++) {
      const interval =
        (new Date(sortedLoads[i].create_time) -
          new Date(sortedLoads[i - 1].create_time)) /
        1000;
      intervals.push(interval);
    }

    // 统计指标
    const avgInterval =
      intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const minInterval = Math.min(...intervals);
    const maxInterval = Math.max(...intervals);

    // 频率等级
    let frequencyLevel = 'low';
    let frequencyDescription = '';
    const loadsPerMinute = 60 / avgInterval;
    const loadsPerHour = 3600 / avgInterval;

    if (loadsPerMinute > 60) {
      frequencyLevel = 'extreme';
      frequencyDescription = '极高频 (每秒多次)';
    } else if (loadsPerMinute > 4) {
      frequencyLevel = 'very_high';
      frequencyDescription = '超高频 (每分钟4+次)';
    } else if (loadsPerMinute > 1) {
      frequencyLevel = 'high';
      frequencyDescription = '高频 (每分钟1+次)';
    } else if (loadsPerHour > 1) {
      frequencyLevel = 'moderate';
      frequencyDescription = '中等 (每小时1+次)';
    } else {
      frequencyLevel = 'low';
      frequencyDescription = '低频 (每小时<1次)';
    }

    return {
      avg_interval_seconds: parseFloat(avgInterval.toFixed(2)),
      min_interval_seconds: parseFloat(minInterval.toFixed(2)),
      max_interval_seconds: parseFloat(maxInterval.toFixed(2)),
      loads_per_minute: parseFloat(loadsPerMinute.toFixed(2)),
      loads_per_hour: parseFloat(loadsPerHour.toFixed(1)),
      loads_per_day: parseFloat((loadsPerHour * 24).toFixed(0)),
      frequency_level: frequencyLevel,
      frequency_description: frequencyDescription,
    };
  }

  /**
   * 分析批次大小（仅分析成功的任务）
   */
  analyzeStreamLoadBatchSize(loads) {
    // 只分析成功的任务
    const successLoads = loads.filter((l) => l.state === 'FINISHED');

    if (successLoads.length === 0) {
      return {
        status: 'no_success_loads',
        message: '没有成功的任务可以分析',
      };
    }

    const rowCounts = successLoads.map((l) => l.sink_rows || 0);
    const byteSizes = successLoads.map((l) => l.scan_bytes || 0);

    // 行数统计
    const avgRows =
      rowCounts.reduce((sum, val) => sum + val, 0) / successLoads.length;
    const minRows = Math.min(...rowCounts);
    const maxRows = Math.max(...rowCounts);
    const medianRows = this.calculateMedian(rowCounts);

    // 字节数统计
    const avgBytes =
      byteSizes.reduce((sum, val) => sum + val, 0) / successLoads.length;
    const minBytes = Math.min(...byteSizes);
    const maxBytes = Math.max(...byteSizes);
    const medianBytes = this.calculateMedian(byteSizes);

    // 标准差
    const rowsStdDev = Math.sqrt(
      rowCounts.reduce((sum, val) => sum + Math.pow(val - avgRows, 2), 0) /
        successLoads.length,
    );
    const bytesStdDev = Math.sqrt(
      byteSizes.reduce((sum, val) => sum + Math.pow(val - avgBytes, 2), 0) /
        successLoads.length,
    );

    // 批次大小分布
    const distribution = this.calculateBatchSizeDistribution(rowCounts);

    // 一致性评分
    const rowsCv = rowsStdDev / avgRows;
    let consistency = 'poor';
    let consistencyScore = 0;

    if (rowsCv < 0.1) {
      consistency = 'excellent';
      consistencyScore = 95;
    } else if (rowsCv < 0.3) {
      consistency = 'good';
      consistencyScore = 80;
    } else if (rowsCv < 0.5) {
      consistency = 'fair';
      consistencyScore = 60;
    } else {
      consistency = 'poor';
      consistencyScore = 40;
    }

    return {
      analyzed_success_loads: successLoads.length,
      rows: {
        avg: Math.round(avgRows),
        min: minRows,
        max: maxRows,
        median: Math.round(medianRows),
        std_dev: Math.round(rowsStdDev),
        coefficient_of_variation: parseFloat((rowsCv * 100).toFixed(2)),
      },
      bytes: {
        avg: Math.round(avgBytes),
        min: minBytes,
        max: maxBytes,
        median: Math.round(medianBytes),
        std_dev: Math.round(bytesStdDev),
        avg_mb: parseFloat((avgBytes / 1024 / 1024).toFixed(2)),
      },
      distribution: distribution,
      consistency: consistency,
      consistency_score: consistencyScore,
    };
  }

  /**
   * 计算中位数
   */
  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * 计算批次大小分布
   */
  calculateBatchSizeDistribution(rowCounts) {
    const ranges = {
      tiny: 0, // < 1K
      small: 0, // 1K - 10K
      medium: 0, // 10K - 100K
      large: 0, // 100K - 1M
      huge: 0, // > 1M
    };

    rowCounts.forEach((count) => {
      if (count < 1000) ranges.tiny++;
      else if (count < 10000) ranges.small++;
      else if (count < 100000) ranges.medium++;
      else if (count < 1000000) ranges.large++;
      else ranges.huge++;
    });

    const total = rowCounts.length;
    return {
      tiny: {
        count: ranges.tiny,
        percentage: ((ranges.tiny / total) * 100).toFixed(1),
      },
      small: {
        count: ranges.small,
        percentage: ((ranges.small / total) * 100).toFixed(1),
      },
      medium: {
        count: ranges.medium,
        percentage: ((ranges.medium / total) * 100).toFixed(1),
      },
      large: {
        count: ranges.large,
        percentage: ((ranges.large / total) * 100).toFixed(1),
      },
      huge: {
        count: ranges.huge,
        percentage: ((ranges.huge / total) * 100).toFixed(1),
      },
    };
  }

  /**
   * 分析 Stream Load 性能
   */
  analyzeStreamLoadPerformance(loads) {
    const successLoads = loads.filter((l) => l.state === 'FINISHED');

    if (successLoads.length === 0) {
      return {
        status: 'no_success_loads',
        message: '没有成功的加载任务',
      };
    }

    // 计算加载耗时（优先使用 load_start_time，若为空则使用 create_time）
    const durations = successLoads
      .map((l) => {
        if (!l.load_finish_time) return null;
        const startTime = l.load_start_time || l.create_time;
        if (!startTime) return null;
        return (new Date(l.load_finish_time) - new Date(startTime)) / 1000;
      })
      .filter((d) => d !== null && d > 0);

    // 计算吞吐量（优先使用 load_start_time，若为空则使用 create_time）
    const throughputs = successLoads
      .map((l) => {
        if (!l.load_finish_time || !l.scan_bytes) return null;
        const startTime = l.load_start_time || l.create_time;
        if (!startTime) return null;
        const duration =
          (new Date(l.load_finish_time) - new Date(startTime)) / 1000;
        if (duration <= 0) return null;
        return l.scan_bytes / duration / 1024 / 1024; // MB/s
      })
      .filter((t) => t !== null && t > 0);

    const avgDuration =
      durations.length > 0
        ? durations.reduce((sum, val) => sum + val, 0) / durations.length
        : 0;
    const avgThroughput =
      throughputs.length > 0
        ? throughputs.reduce((sum, val) => sum + val, 0) / throughputs.length
        : 0;
    const minThroughput = throughputs.length > 0 ? Math.min(...throughputs) : 0;
    const maxThroughput = throughputs.length > 0 ? Math.max(...throughputs) : 0;

    return {
      avg_load_duration_seconds: parseFloat(avgDuration.toFixed(2)),
      avg_throughput_mbps: parseFloat(avgThroughput.toFixed(2)),
      min_throughput_mbps: parseFloat(minThroughput.toFixed(2)),
      max_throughput_mbps: parseFloat(maxThroughput.toFixed(2)),
      analyzed_tasks: durations.length,
    };
  }

  /**
   * 分析失败情况
   */
  analyzeStreamLoadFailures(loads) {
    const failedLoads = loads.filter((l) => l.state === 'CANCELLED');

    if (failedLoads.length === 0) {
      return {
        failed_count: 0,
        failure_rate: 0,
        message: '没有失败的任务',
      };
    }

    // 统计错误类型
    const errorTypes = {};
    failedLoads.forEach((load) => {
      if (!load.error_msg) return;
      const errorMsg = load.error_msg.toLowerCase();

      let errorType = 'unknown';
      if (errorMsg.includes('timeout')) errorType = 'timeout';
      else if (errorMsg.includes('format') || errorMsg.includes('parse'))
        errorType = 'format_error';
      else if (errorMsg.includes('permission') || errorMsg.includes('access'))
        errorType = 'permission_error';
      else if (errorMsg.includes('memory') || errorMsg.includes('oom'))
        errorType = 'memory_error';
      else if (errorMsg.includes('duplicate') || errorMsg.includes('key'))
        errorType = 'duplicate_key';

      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });

    return {
      failed_count: failedLoads.length,
      failure_rate: parseFloat(
        ((failedLoads.length / loads.length) * 100).toFixed(2),
      ),
      error_types: errorTypes,
      recent_failures: failedLoads.slice(0, 5).map((l) => ({
        label: l.label,
        create_time: l.create_time,
        error: l.error_msg,
      })),
    };
  }

  /**
   * 分析慢 Stream Load 任务
   */
  analyzeSlowStreamLoadTasks(loads, thresholdSeconds = 10) {
    // 只分析成功的任务
    const successLoads = loads.filter((l) => l.state === 'FINISHED');

    if (successLoads.length === 0) {
      return {
        status: 'no_success_loads',
        message: '没有成功的任务可以分析',
      };
    }

    // 找到慢任务
    const slowTasks = [];
    successLoads.forEach((load) => {
      const createTime = new Date(load.create_time);
      const finishTime = new Date(load.load_finish_time);
      const commitTime = new Date(load.load_commit_time);

      // 总耗时 = load_finish_time - create_time
      const totalDuration = (finishTime - createTime) / 1000; // 秒

      if (totalDuration > thresholdSeconds) {
        // 数据写入耗时 = load_commit_time - create_time
        const writeDuration = (commitTime - createTime) / 1000;
        // 事务提交耗时 = load_finish_time - load_commit_time
        const commitDuration = (finishTime - commitTime) / 1000;

        slowTasks.push({
          label: load.label,
          create_time: load.create_time,
          load_finish_time: load.load_finish_time,
          load_commit_time: load.load_commit_time,
          total_duration_seconds: parseFloat(totalDuration.toFixed(2)),
          write_duration_seconds: parseFloat(writeDuration.toFixed(2)),
          commit_duration_seconds: parseFloat(commitDuration.toFixed(2)),
          sink_rows: load.sink_rows || 0,
          scan_bytes: load.scan_bytes || 0,
          write_throughput_mbps: parseFloat(
            ((load.scan_bytes || 0) / 1024 / 1024 / writeDuration).toFixed(2),
          ),
        });
      }
    });

    if (slowTasks.length === 0) {
      return {
        status: 'ok',
        message: `没有超过 ${thresholdSeconds} 秒的慢任务`,
        threshold_seconds: thresholdSeconds,
        analyzed_success_loads: successLoads.length,
      };
    }

    // 按总耗时排序
    slowTasks.sort(
      (a, b) => b.total_duration_seconds - a.total_duration_seconds,
    );

    // 计算统计信息
    const avgTotalDuration =
      slowTasks.reduce((sum, t) => sum + t.total_duration_seconds, 0) /
      slowTasks.length;
    const avgWriteDuration =
      slowTasks.reduce((sum, t) => sum + t.write_duration_seconds, 0) /
      slowTasks.length;
    const avgCommitDuration =
      slowTasks.reduce((sum, t) => sum + t.commit_duration_seconds, 0) /
      slowTasks.length;

    // 计算写入和提交耗时的占比
    const writeRatio = (avgWriteDuration / avgTotalDuration) * 100;
    const commitRatio = (avgCommitDuration / avgTotalDuration) * 100;

    return {
      status: 'found_slow_tasks',
      threshold_seconds: thresholdSeconds,
      analyzed_success_loads: successLoads.length,
      slow_task_count: slowTasks.length,
      slow_task_ratio: parseFloat(
        ((slowTasks.length / successLoads.length) * 100).toFixed(2),
      ),
      statistics: {
        avg_total_duration_seconds: parseFloat(avgTotalDuration.toFixed(2)),
        avg_write_duration_seconds: parseFloat(avgWriteDuration.toFixed(2)),
        avg_commit_duration_seconds: parseFloat(avgCommitDuration.toFixed(2)),
        write_duration_ratio: parseFloat(writeRatio.toFixed(2)),
        commit_duration_ratio: parseFloat(commitRatio.toFixed(2)),
      },
      slowest_tasks: slowTasks.slice(0, 10), // 返回前10个最慢的任务
    };
  }

  /**
   * 生成问题和建议
   */
  generateStreamLoadIssuesAndRecommendations(
    statistics,
    frequencyAnalysis,
    batchSizeAnalysis,
    performanceAnalysis,
    failureAnalysis,
  ) {
    const issues = [];
    const warnings = [];
    const recommendations = [];

    // 1. 失败率检查
    if (failureAnalysis.failure_rate > 10) {
      issues.push({
        type: 'high_failure_rate',
        severity: 'HIGH',
        message: `失败率过高: ${failureAnalysis.failure_rate}%`,
        impact: '数据导入质量受影响',
      });
      recommendations.push({
        priority: 'HIGH',
        message: '检查失败原因，修复数据格式或配置问题',
        error_types: failureAnalysis.error_types,
      });
    } else if (failureAnalysis.failure_rate > 5) {
      warnings.push({
        type: 'moderate_failure_rate',
        severity: 'MEDIUM',
        message: `失败率较高: ${failureAnalysis.failure_rate}%`,
      });
    }

    // 2. 频率检查
    if (
      frequencyAnalysis.frequency_level === 'extreme' ||
      frequencyAnalysis.frequency_level === 'very_high'
    ) {
      warnings.push({
        type: 'very_high_frequency',
        severity: 'MEDIUM',
        message: `导入频率过高: ${frequencyAnalysis.loads_per_minute.toFixed(1)} 次/分钟`,
        impact: '可能导致系统负载过高',
      });
      recommendations.push({
        priority: 'MEDIUM',
        message: '考虑合并小批次，减少导入频率',
        suggestion: `当前平均间隔 ${frequencyAnalysis.avg_interval_seconds}秒，建议增加到 30-60秒`,
      });
    }

    // 3. 批次大小检查
    if (batchSizeAnalysis.consistency === 'poor') {
      warnings.push({
        type: 'inconsistent_batch_size',
        severity: 'LOW',
        message: '批次大小不一致',
        cv: `变异系数 ${batchSizeAnalysis.rows.coefficient_of_variation}%`,
      });
      recommendations.push({
        priority: 'LOW',
        message: '建立更一致的批次大小策略，提高可预测性',
      });
    }

    if (statistics.avg_rows_per_load < 1000) {
      warnings.push({
        type: 'small_batch_size',
        severity: 'MEDIUM',
        message: `批次过小: 平均 ${statistics.avg_rows_per_load.toLocaleString()} 行`,
        impact: '导入效率低下',
      });
      recommendations.push({
        priority: 'HIGH',
        message: '增加批次大小以提高吞吐量',
        suggestion: '建议每批次至少 10,000 行',
      });
    }

    // 4. 性能检查
    if (
      performanceAnalysis.avg_throughput_mbps &&
      performanceAnalysis.avg_throughput_mbps < 10
    ) {
      warnings.push({
        type: 'low_throughput',
        severity: 'MEDIUM',
        message: `吞吐量较低: ${performanceAnalysis.avg_throughput_mbps} MB/s`,
      });
      recommendations.push({
        priority: 'MEDIUM',
        message: '优化批次大小或增加并行度以提高吞吐量',
      });
    }

    // 5. 规律性检查
    if (
      frequencyAnalysis.regularity === 'irregular' &&
      frequencyAnalysis.loads_per_hour > 10
    ) {
      recommendations.push({
        priority: 'LOW',
        message: '建立规律的导入调度，提高系统可预测性',
        regularity_score: frequencyAnalysis.regularity_score,
      });
    }

    return {
      issues,
      warnings,
      recommendations,
    };
  }

  /**
   * 计算健康分数
   */
  calculateStreamLoadHealthScore(
    statistics,
    frequencyAnalysis,
    performanceAnalysis,
  ) {
    let score = 100;

    // 成功率影响
    if (statistics.success_rate < 90) score -= 20;
    else if (statistics.success_rate < 95) score -= 10;
    else if (statistics.success_rate < 99) score -= 5;

    // 频率规律性影响
    score -= (100 - frequencyAnalysis.regularity_score) * 0.2;

    // 吞吐量影响
    if (
      performanceAnalysis.avg_throughput_mbps &&
      performanceAnalysis.avg_throughput_mbps < 5
    ) {
      score -= 15;
    } else if (
      performanceAnalysis.avg_throughput_mbps &&
      performanceAnalysis.avg_throughput_mbps < 10
    ) {
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));

    let level = 'EXCELLENT';
    if (score < 50) level = 'POOR';
    else if (score < 70) level = 'FAIR';
    else if (score < 85) level = 'GOOD';

    return {
      score: Math.round(score),
      level: level,
    };
  }

  /**
   * 格式化 Stream Load 检查报告
   */
  formatStreamLoadTasksReport(result) {
    if (result.status === 'no_data') {
      return `ℹ️  ${result.message}`;
    }

    if (result.status !== 'completed') {
      return `❌ Stream Load 检查失败: ${result.error}`;
    }

    // 格式化时间范围显示
    const seconds = result.analysis_period_seconds;
    const hours = Math.floor(seconds / 3600);
    const days = Math.floor(hours / 24);
    const timeDesc = days > 0 ? `${days} 天` : `${hours} 小时`;

    let report = `📊 Stream Load 任务检查报告\n`;
    report += `==========================================\n`;
    report += `表: ${result.database}.${result.table}\n`;
    report += `分析周期: 最近 ${timeDesc}\n`;
    report += `健康评分: ${result.health_score.score}/100 (${result.health_score.level})\n\n`;

    // 基础统计
    const stats = result.statistics;
    report += `📈 基础统计:\n`;
    report += `   总任务数: ${stats.total_loads.toLocaleString()}\n`;
    report += `   成功任务: ${stats.success_loads.toLocaleString()} (${stats.success_rate}%)\n`;
    report += `   失败任务: ${stats.failed_loads.toLocaleString()}\n`;
    report += `   总扫描行: ${stats.total_scan_rows.toLocaleString()}\n`;
    report += `   总数据量: ${this.formatBytes(stats.total_scan_bytes)}\n`;
    report += `   平均行数/任务: ${stats.avg_rows_per_load.toLocaleString()}\n`;
    report += `   平均数据量/任务: ${this.formatBytes(stats.avg_bytes_per_load)}\n\n`;

    // 频率分析
    const freq = result.frequency_analysis;
    if (freq.status !== 'insufficient_data') {
      report += `⏱️  频率分析:\n`;
      report += `   频率等级: ${freq.frequency_description}\n`;
      report += `   每分钟: ${freq.loads_per_minute} 次\n`;
      report += `   每小时: ${freq.loads_per_hour} 次\n`;
      report += `   每天: ${freq.loads_per_day} 次\n`;
      report += `   平均间隔: ${freq.avg_interval_seconds} 秒\n\n`;
    }

    // 批次大小分析
    const batch = result.batch_size_analysis;
    if (batch.status !== 'no_success_loads') {
      report += `📦 批次大小分析（基于成功任务）:\n`;
      report += `   分析任务数: ${batch.analyzed_success_loads}\n`;
      report += `   平均行数: ${batch.rows.avg.toLocaleString()}\n`;
      report += `   行数范围: ${batch.rows.min.toLocaleString()} - ${batch.rows.max.toLocaleString()}\n`;
      report += `   中位数: ${batch.rows.median.toLocaleString()}\n`;
      report += `   一致性: ${batch.consistency} (评分: ${batch.consistency_score}/100)\n`;
      report += `   平均数据量: ${batch.bytes.avg_mb} MB\n`;
      report += `   批次分布:\n`;
      report += `     - 微小 (<1K): ${batch.distribution.tiny.count} (${batch.distribution.tiny.percentage}%)\n`;
      report += `     - 小 (1K-10K): ${batch.distribution.small.count} (${batch.distribution.small.percentage}%)\n`;
      report += `     - 中 (10K-100K): ${batch.distribution.medium.count} (${batch.distribution.medium.percentage}%)\n`;
      report += `     - 大 (100K-1M): ${batch.distribution.large.count} (${batch.distribution.large.percentage}%)\n`;
      report += `     - 巨大 (>1M): ${batch.distribution.huge.count} (${batch.distribution.huge.percentage}%)\n\n`;
    } else {
      report += `📦 批次大小分析:\n`;
      report += `   ℹ️  ${batch.message}\n\n`;
    }

    // 性能分析
    const perf = result.performance_analysis;
    if (perf.status !== 'no_success_loads') {
      report += `🚀 性能分析:\n`;
      report += `   平均加载耗时: ${perf.avg_load_duration_seconds} 秒\n`;
      report += `   平均吞吐量: ${perf.avg_throughput_mbps} MB/s\n`;
      report += `   吞吐量范围: ${perf.min_throughput_mbps} - ${perf.max_throughput_mbps} MB/s\n`;
      report += `   分析任务数: ${perf.analyzed_tasks}\n\n`;
    }

    // 失败分析
    const failure = result.failure_analysis;
    if (failure.failed_count > 0) {
      report += `❌ 失败分析:\n`;
      report += `   失败数量: ${failure.failed_count}\n`;
      report += `   失败率: ${failure.failure_rate}%\n`;
      if (Object.keys(failure.error_types).length > 0) {
        report += `   错误类型:\n`;
        Object.entries(failure.error_types).forEach(([type, count]) => {
          report += `     - ${type}: ${count}\n`;
        });
      }
      report += '\n';
    }

    // 慢任务分析
    const slowTask = result.slow_task_analysis;
    if (slowTask.status === 'found_slow_tasks') {
      report += `🐌 慢任务分析 (阈值: ${slowTask.threshold_seconds}秒):\n`;
      report += `   分析任务数: ${slowTask.analyzed_success_loads}\n`;
      report += `   慢任务数量: ${slowTask.slow_task_count}\n`;
      report += `   慢任务占比: ${slowTask.slow_task_ratio}%\n`;
      report += `   平均总耗时: ${slowTask.statistics.avg_total_duration_seconds}秒\n`;
      report += `     - 写入耗时: ${slowTask.statistics.avg_write_duration_seconds}秒 (${slowTask.statistics.write_duration_ratio}%)\n`;
      report += `     - 提交耗时: ${slowTask.statistics.avg_commit_duration_seconds}秒 (${slowTask.statistics.commit_duration_ratio}%)\n`;

      if (slowTask.slowest_tasks && slowTask.slowest_tasks.length > 0) {
        report += `   最慢的前5个任务:\n`;
        slowTask.slowest_tasks.slice(0, 5).forEach((task, index) => {
          report += `     ${index + 1}. ${task.label}\n`;
          report += `        总耗时: ${task.total_duration_seconds}秒 (写入: ${task.write_duration_seconds}s, 提交: ${task.commit_duration_seconds}s)\n`;
          report += `        数据量: ${task.sink_rows.toLocaleString()} 行 / ${this.formatBytes(task.scan_bytes)}\n`;
          report += `        吞吐量: ${task.write_throughput_mbps} MB/s\n`;
        });
      }
      report += '\n';
    }

    // 问题
    if (result.issues.length > 0) {
      report += `⚠️  问题 (${result.issues.length}):\n`;
      result.issues.forEach((issue) => {
        report += `   🔥 ${issue.message}\n`;
        if (issue.impact) report += `      影响: ${issue.impact}\n`;
      });
      report += '\n';
    }

    // 警告
    if (result.warnings.length > 0) {
      report += `💡 警告 (${result.warnings.length}):\n`;
      result.warnings.slice(0, 5).forEach((warning) => {
        report += `   ⚠️  ${warning.message}\n`;
      });
      report += '\n';
    }

    // 建议
    if (result.recommendations.length > 0) {
      report += `✨ 优化建议:\n`;
      result.recommendations.slice(0, 5).forEach((rec, index) => {
        const priorityIcon =
          rec.priority === 'HIGH'
            ? '🔥'
            : rec.priority === 'MEDIUM'
              ? '⚠️'
              : 'ℹ️';
        report += `   ${index + 1}. ${priorityIcon} ${rec.message}\n`;
        if (rec.suggestion) report += `      ${rec.suggestion}\n`;
      });
    }

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   * @returns {Object} 工具名称到处理函数的映射
   */
  getToolHandlers() {
    return {
      check_load_job_status: async (args, context) => {
        const connection = context.connection;
        const result = await this.checkLoadJobStatus(
          connection,
          args.label || null,
          args.txn_id || null,
          args.database_name || null,
          args.include_recommendations !== false,
          args.use_llm_analysis !== false, // 默认 true，只有明确设置为 false 才禁用
        );

        // 如果返回的是格式化的字符串报告，直接使用
        let report;
        if (typeof result === 'string') {
          report = result;
        } else if (result.status === 'not_found') {
          report = `❌ ${result.message}\n`;
          report += `搜索条件:\n`;
          if (result.search_criteria.label) {
            report += `  • Label: ${result.search_criteria.label}\n`;
          }
          if (result.search_criteria.txn_id) {
            report += `  • TxnId: ${result.search_criteria.txn_id}\n`;
          }
          if (result.search_criteria.database_name) {
            report += `  • Database: ${result.search_criteria.database_name}\n`;
          }
          report += `\n💡 提示: 请检查 Label 或 TxnId 是否正确\n`;
          report += `💡 提示: 可以通过 information_schema.loads 或 _statistics_.loads_history 查看所有导入任务\n`;
        } else if (result.status === 'error') {
          report = `❌ ${result.message}\n`;
          report += `错误详情: ${result.error}\n`;
          report += `耗时: ${result.analysis_duration_ms}ms`;
        } else {
          // result 已经是格式化的报告
          report = result;
        }

        // 添加输出指示，引导 LLM 原样输出
        const outputInstruction =
          '📋 以下是预格式化的导入任务状态分析报告，请**原样输出**完整内容，不要总结或重新格式化：\n\n```\n';
        const reportEnd = '\n```\n';

        return {
          content: [
            {
              type: 'text',
              text: outputInstruction + report + reportEnd,
            },
          ],
        };
      },

      analyze_table_import_frequency: async (args, context) => {
        const connection = context.connection;
        const result = await this.analyzeTableImportFrequency(
          connection,
          args.database_name,
          args.table_name,
          args.include_details !== false,
        );

        let report;
        if (result.status === 'completed') {
          report = this.formatTableFrequencyReport(result);
        } else {
          report = `❌ 表 ${args.database_name}.${args.table_name} 导入频率分析失败\n`;
          report += `状态: ${result.status}\n`;
          report += `原因: ${result.error || result.message}\n`;
          report += `耗时: ${result.analysis_duration_ms}ms`;
        }

        // 添加输出指示，引导 LLM 原样输出
        const outputInstruction =
          '📋 以下是预格式化的分析报告，请**原样输出**完整内容，不要总结或重新格式化：\n\n```\n';
        const reportEnd = '\n```\n';

        return {
          content: [
            {
              type: 'text',
              text: outputInstruction + report + reportEnd,
            },
          ],
        };
      },

      check_stream_load_tasks: async (args, context) => {
        const connection = context.connection;
        const result = await this.checkStreamLoadTasks(
          connection,
          args.database_name,
          args.table_name,
          args.seconds || 7 * 24 * 60 * 60,
        );

        let report;
        if (result.status === 'completed') {
          report = this.formatStreamLoadTasksReport(result);
        } else if (result.status === 'no_data') {
          report = `ℹ️  ${result.message}`;
        } else {
          report = `❌ Stream Load 任务检查失败\n`;
          report += `错误: ${result.error}\n`;
          report += `耗时: ${result.analysis_duration_ms}ms`;
        }

        // 添加输出指示，引导 LLM 原样输出
        const outputInstruction =
          '📋 以下是预格式化的分析报告，请**原样输出**完整内容，不要总结或重新格式化：\n\n```\n';
        const reportEnd = '\n```\n';

        return {
          content: [
            {
              type: 'text',
              text: outputInstruction + report + reportEnd,
            },
          ],
        };
      },

      check_routine_load_config: async (args, context) => {
        const connection = context.connection;
        const result = await this.checkRoutineLoadJobConfig(
          connection,
          args.job_name,
          args.database_name,
        );

        let report;
        if (result.status === 'completed') {
          report = this.formatRoutineLoadConfigReport(result);
        } else if (result.status === 'no_jobs') {
          report = `ℹ️  ${result.message}`;
        } else {
          report = `❌ Routine Load 配置检查失败\n`;
          report += `错误: ${result.error}\n`;
          report += `耗时: ${result.analysis_duration_ms}ms`;
        }

        // 添加输出指示，引导 LLM 原样输出
        const outputInstruction =
          '📋 以下是预格式化的分析报告，请**原样输出**完整内容，不要总结或重新格式化：\n\n```\n';
        const reportEnd = '\n```\n';

        return {
          content: [
            {
              type: 'text',
              text: outputInstruction + report + reportEnd,
            },
          ],
        };
      },

      analyze_reached_timeout: async (args, context) => {
        const connection = context.connection;
        const result = await this.analyzeReachedTimeout(connection, {
          be_host: args.be_host,
          architecture: args.architecture, // null if not provided, will auto-detect
          time_range_minutes: args.time_range_minutes || 30,
        });

        // 添加输出指示，引导 LLM 原样输出
        const outputInstruction =
          '📋 以下是预格式化的分析报告，请**原样输出**完整内容，不要总结或重新格式化：\n\n```\n';
        const reportEnd = '\n```\n';

        return {
          content: [
            {
              type: 'text',
              text: outputInstruction + result.report + reportEnd,
            },
          ],
        };
      },

      analyze_load_channel_profile: async (args, context) => {
        const connection = context.connection;
        const result = await this.analyzeLoadChannelProfile(
          connection,
          args.query_id,
          args.profile_text,
          args.profile_file,
          args.verbose || false, // 默认使用简洁模式
        );

        // 添加输出指示，引导 LLM 原样输出
        const outputInstruction =
          '📋 以下是预格式化的分析报告，请**原样输出**完整内容，不要总结或重新格式化：\n\n```\n';
        const reportEnd = '\n```\n';

        return {
          content: [
            {
              type: 'text',
              text: outputInstruction + result.report + reportEnd,
            },
          ],
        };
      },
    };
  }

  /**
   * ========================================
   * Reached Timeout 问题分析工具
   * ========================================
   * 根据 SOP 文档实现的综合分析工具
   */

  /**
   * Reached Timeout 问题分析（主入口）
   *
   * 功能：
   * 1. 分析集群资源使用情况（CPU、IO、网络）
   * 2. 分析 BRPC 接口延迟和处理情况
   * 3. 分析各线程池状态和耗时
   * 4. 识别导入瓶颈环节
   * 5. 提供解决方案建议
   *
   * @param {Object} connection - 数据库连接
   * @param {Object} options - 分析选项
   * @param {string} options.be_host - BE 节点地址（可选）
   * @param {string} options.architecture - 架构类型：'replicated'（存算一体）或 'shared_data'（存算分离），默认自动检测
   * @param {number} options.time_range_minutes - 分析时间范围（分钟，默认30分钟）
   * @returns {Object} 分析报告
   */
  async analyzeReachedTimeout(connection, options = {}) {
    let {
      be_host = null,
      architecture = null, // 'replicated' or 'shared_data', null for auto-detect
      time_range_minutes = 30,
    } = options;

    try {
      // 自动检测架构类型（如果未指定）
      if (!architecture) {
        console.error('🔍 正在自动检测集群架构类型...');
        try {
          const archInfo = await detectArchitectureType(connection);
          // 映射架构类型: shared_nothing → replicated, shared_data → shared_data
          architecture =
            archInfo.type === 'shared_nothing' ? 'replicated' : 'shared_data';
          console.error(
            `✅ 检测到架构: ${archInfo.description} (${architecture})`,
          );
        } catch (error) {
          console.error(
            `⚠️  架构检测失败，使用默认值 'replicated': ${error.message}`,
          );
          architecture = 'replicated';
        }
      }

      const report = {
        title: '🔍 StarRocks 导入 Reached Timeout 问题分析报告',
        timestamp: new Date().toISOString(),
        architecture: architecture === 'replicated' ? '存算一体' : '存算分离',
        time_range: `${time_range_minutes}分钟`,
        summary: {},
        resource_analysis: {},
        brpc_analysis: {},
        threadpool_analysis: {},
        bottleneck_analysis: {},
        recommendations: [],
        details: {},
      };

      // 1. 资源监控分析
      report.resource_analysis = await this._analyzeResourceUsage(
        connection,
        be_host,
        time_range_minutes,
      );

      // 2. BRPC 监控分析
      report.brpc_analysis = await this._analyzeBRPCMetrics(
        connection,
        be_host,
        time_range_minutes,
      );

      // 3. 线程池监控分析
      report.threadpool_analysis = await this._analyzeThreadPools(
        connection,
        be_host,
        architecture,
        time_range_minutes,
      );

      // 4. 瓶颈识别
      report.bottleneck_analysis = this._identifyBottlenecks(
        report.resource_analysis,
        report.brpc_analysis,
        report.threadpool_analysis,
      );

      // 5. 生成建议
      report.recommendations = this._generateRecommendations(
        report.bottleneck_analysis,
        report.resource_analysis,
        report.threadpool_analysis,
        architecture,
      );

      // 6. 生成摘要
      report.summary = this._generateSummary(report);

      // 7. 格式化输出
      return this._formatReachedTimeoutReport(report);
    } catch (error) {
      return {
        success: false,
        error: `分析失败: ${error.message}`,
        stack: error.stack,
      };
    }
  }

  /**
   * 分析资源使用情况
   */
  async _analyzeResourceUsage(connection, be_host, time_range_minutes) {
    const analysis = {
      cpu: {},
      io: {},
      network: {},
      issues: [],
    };

    try {
      // CPU 使用率分析
      analysis.cpu = await this._analyzeCPUUsage(
        connection,
        be_host,
        time_range_minutes,
      );

      // IO 使用率分析
      analysis.io = await this._analyzeIOUsage(
        connection,
        be_host,
        time_range_minutes,
      );

      // 网络使用分析
      analysis.network = await this._analyzeNetworkUsage(
        connection,
        be_host,
        time_range_minutes,
      );

      // 识别资源问题
      if (analysis.cpu.avg_usage > 90) {
        analysis.issues.push({
          type: 'CPU',
          severity: 'HIGH',
          message: `CPU 使用率过高: 平均 ${analysis.cpu.avg_usage.toFixed(1)}%`,
          suggestion: '考虑增加 BE 节点或优化查询负载',
        });
      }

      if (analysis.io.avg_util > 80) {
        analysis.issues.push({
          type: 'IO',
          severity: 'HIGH',
          message: `IO 使用率过高: 平均 ${analysis.io.avg_util.toFixed(1)}%`,
          suggestion: '检查磁盘性能，考虑使用 SSD 或增加磁盘数量',
        });
      }
    } catch (error) {
      analysis.error = error.message;
    }

    return analysis;
  }

  /**
   * 分析 CPU 使用情况
   */
  async _analyzeCPUUsage(connection, be_host, time_range_minutes) {
    // 注意：这里需要从 Prometheus 查询，但当前代码库中没有 Prometheus 集成
    // 返回模拟数据结构
    return {
      avg_usage: 0,
      max_usage: 0,
      p95_usage: 0,
      by_task: {},
      note: 'Prometheus 集成待完善 - 请检查 Grafana 面板 "BE CPU Idle" 和 "cpu utile by task"',
    };
  }

  /**
   * 分析 IO 使用情况
   */
  async _analyzeIOUsage(connection, be_host, time_range_minutes) {
    return {
      avg_util: 0,
      max_util: 0,
      local_disk: {},
      s3_metrics: {},
      note: 'Prometheus 集成待完善 - 请检查 Grafana 面板 "Disk IO Util" 和 "fslib write io metrics"',
    };
  }

  /**
   * 分析网络使用情况
   */
  async _analyzeNetworkUsage(connection, be_host, time_range_minutes) {
    return {
      bandwidth_usage: {},
      tcp_stats: {},
      note: 'Prometheus 集成待完善 - 请检查 Grafana 面板 "Net send/receive bytes" 和 TCP 监控',
    };
  }

  /**
   * 分析 BRPC 指标
   */
  async _analyzeBRPCMetrics(connection, be_host, time_range_minutes) {
    const analysis = {
      thread_pool: {
        total: 0,
        used: 0,
        utilization: 0,
      },
      interfaces: {
        tablet_writer_open: {},
        tablet_writer_add_chunks: {},
        tablet_writer_add_segment: {},
      },
      issues: [],
    };

    // 从 Prometheus 查询 BRPC 指标
    // 注意：这里需要实际的 Prometheus 查询实现
    analysis.note =
      'Prometheus 集成待完善 - 请检查 Grafana 面板 "BRPC Workers" 和各接口延迟指标';

    // 检查 BRPC 线程池使用情况
    const util = analysis.thread_pool.utilization;
    if (util > 90) {
      analysis.issues.push({
        type: 'BRPC_THREAD_POOL',
        severity: 'HIGH',
        message: `BRPC 线程池使用率过高: ${util.toFixed(1)}%`,
        suggestion: '考虑增加 BE 配置 brpc_num_threads',
      });
    }

    return analysis;
  }

  /**
   * 分析线程池状态
   */
  async _analyzeThreadPools(
    connection,
    be_host,
    architecture,
    time_range_minutes,
  ) {
    const analysis = {
      async_delta_writer: {},
      memtable_flush: {},
      segment_replicate_sync: architecture === 'replicated' ? {} : null,
      segment_flush: architecture === 'replicated' ? {} : null,
      issues: [],
    };

    // 从 Prometheus 查询各线程池指标
    analysis.note = 'Prometheus 集成待完善 - 请检查 Grafana 各线程池监控面板';

    return analysis;
  }

  /**
   * 识别瓶颈环节
   */
  _identifyBottlenecks(resource_analysis, brpc_analysis, threadpool_analysis) {
    const bottlenecks = [];

    // 1. 资源瓶颈
    if (resource_analysis.issues.length > 0) {
      bottlenecks.push({
        category: '资源瓶颈',
        items: resource_analysis.issues,
      });
    }

    // 2. BRPC 瓶颈
    if (brpc_analysis.issues.length > 0) {
      bottlenecks.push({
        category: 'BRPC 瓶颈',
        items: brpc_analysis.issues,
      });
    }

    // 3. 线程池瓶颈
    if (threadpool_analysis.issues.length > 0) {
      bottlenecks.push({
        category: '线程池瓶颈',
        items: threadpool_analysis.issues,
      });
    }

    return {
      has_bottleneck: bottlenecks.length > 0,
      bottlenecks: bottlenecks,
      summary: `识别到 ${bottlenecks.length} 类瓶颈问题`,
    };
  }

  /**
   * 生成解决方案建议
   */
  _generateRecommendations(
    bottleneck_analysis,
    resource_analysis,
    threadpool_analysis,
    architecture,
  ) {
    const recommendations = [];

    // 1. 资源相关建议
    const cpu_issue = resource_analysis.issues.find((i) => i.type === 'CPU');
    if (cpu_issue) {
      recommendations.push({
        priority: 'HIGH',
        category: '资源扩容',
        title: 'CPU 资源不足',
        description: cpu_issue.message,
        actions: [
          '增加 BE 节点数量，分散负载',
          '检查是否有其他任务（如 Compaction、Query）占用过多 CPU',
          '优化导入批次大小和并发度',
        ],
      });
    }

    const io_issue = resource_analysis.issues.find((i) => i.type === 'IO');
    if (io_issue) {
      recommendations.push({
        priority: 'HIGH',
        category: '资源扩容',
        title: 'IO 资源不足',
        description: io_issue.message,
        actions: [
          '使用 SSD 磁盘替代 HDD',
          '增加磁盘数量',
          '检查是否有大量小文件导入',
        ],
      });
    }

    // 2. BRPC 相关建议
    if (threadpool_analysis.async_delta_writer?.queue_count > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: '线程池调优',
        title: 'Async Delta Writer 线程池不足',
        description: '任务队列有积压',
        actions: [
          '动态调整 BE 配置：UPDATE starrocks_be_configs SET value=32 WHERE name="number_tablet_writer_threads"',
          '默认值为 16，建议根据 CPU 核数适当增加',
        ],
      });
    }

    if (
      architecture === 'replicated' &&
      threadpool_analysis.memtable_flush?.queue_count > 0
    ) {
      recommendations.push({
        priority: 'MEDIUM',
        category: '线程池调优',
        title: 'Memtable Flush 线程池不足',
        description: '任务队列有积压',
        actions: [
          '动态调整 BE 配置：UPDATE starrocks_be_configs SET value=4 WHERE name="flush_thread_num_per_store"',
          '默认值为 2（每块盘），建议根据磁盘数量和负载适当增加',
          '注意：总线程数 = flush_thread_num_per_store * 磁盘数',
        ],
      });
    }

    // 3. 主键表相关建议
    recommendations.push({
      priority: 'MEDIUM',
      category: '配置优化',
      title: '主键表 PK Index 优化',
      description: '如果是主键表导入慢，可以跳过 PK Index Preload',
      actions: [
        '设置 BE 配置跳过 pk_preload: UPDATE starrocks_be_configs SET value=true WHERE name="skip_pk_preload"',
        '这可以显著减少主键表导入阶段的耗时',
        '适用版本: >= 3.4',
      ],
    });

    // 4. 超时时间调整
    recommendations.push({
      priority: 'LOW',
      category: '临时缓解',
      title: '增加导入超时时间',
      description: '快速缓解 Reached Timeout 问题',
      actions: [
        '增加 Stream Load 超时：curl -X PUT -H "timeout: 600" ...',
        '增加 Broker Load 超时：ALTER LOAD ... PROPERTIES ("timeout" = "14400")',
        '注意：这只是临时缓解，需要配合其他优化措施',
      ],
    });

    // 5. 常见问题检查清单
    recommendations.push({
      priority: 'INFO',
      category: '问题排查清单',
      title: '建议检查以下方面',
      description: '基于历史问题经验的检查清单',
      actions: [
        '✓ 检查是否有 Clone 任务在执行（主键表重建索引会影响导入）',
        '✓ 检查 RocksDB 是否有 "Stalling writes" 日志',
        '✓ 检查 TCP 连接是否有重传、丢包等问题',
        '✓ 检查存算分离架构下 S3 IO 延迟是否正常',
        '✓ 检查是否有定时任务或业务高峰期导致负载突增',
      ],
    });

    return recommendations;
  }

  /**
   * 生成分析摘要
   */
  _generateSummary(report) {
    const total_issues =
      report.resource_analysis.issues.length +
      report.brpc_analysis.issues.length +
      report.threadpool_analysis.issues.length;

    return {
      total_issues: total_issues,
      has_resource_issue: report.resource_analysis.issues.length > 0,
      has_brpc_issue: report.brpc_analysis.issues.length > 0,
      has_threadpool_issue: report.threadpool_analysis.issues.length > 0,
      bottleneck_identified: report.bottleneck_analysis.has_bottleneck,
      recommendation_count: report.recommendations.length,
      overall_status:
        total_issues === 0
          ? 'HEALTHY'
          : total_issues < 3
            ? 'WARNING'
            : 'CRITICAL',
    };
  }

  /**
   * 格式化报告输出
   */
  _formatReachedTimeoutReport(report) {
    let output = [];

    // 标题和基本信息
    output.push('='.repeat(80));
    output.push(report.title);
    output.push('='.repeat(80));
    output.push('');
    output.push(`📅 分析时间: ${report.timestamp}`);
    output.push(`🏗️  架构类型: ${report.architecture}`);
    output.push(`⏱️  时间范围: ${report.time_range}`);
    output.push(
      `📊 整体状态: ${this._getStatusEmoji(report.summary.overall_status)} ${report.summary.overall_status}`,
    );
    output.push('');

    // 摘要
    output.push('📋 分析摘要');
    output.push('-'.repeat(80));
    output.push(`  • 发现问题数量: ${report.summary.total_issues}`);
    output.push(
      `  • 资源问题: ${report.summary.has_resource_issue ? '是 ⚠️' : '否 ✓'}`,
    );
    output.push(
      `  • BRPC 问题: ${report.summary.has_brpc_issue ? '是 ⚠️' : '否 ✓'}`,
    );
    output.push(
      `  • 线程池问题: ${report.summary.has_threadpool_issue ? '是 ⚠️' : '否 ✓'}`,
    );
    output.push(
      `  • 瓶颈识别: ${report.bottleneck_analysis.has_bottleneck ? '已识别 🎯' : '未发现 ✓'}`,
    );
    output.push(`  • 优化建议: ${report.summary.recommendation_count} 条`);
    output.push('');

    // 资源分析
    output.push('🖥️ 资源使用分析');
    output.push('-'.repeat(80));
    if (report.resource_analysis.issues.length > 0) {
      report.resource_analysis.issues.forEach((issue) => {
        output.push(
          `  ${this._getSeverityEmoji(issue.severity)} ${issue.type}: ${issue.message}`,
        );
        output.push(`     💡 ${issue.suggestion}`);
      });
    } else {
      output.push('  ✓ 未发现明显资源瓶颈');
    }
    if (report.resource_analysis.note) {
      output.push(`  ℹ️  ${report.resource_analysis.note}`);
    }
    output.push('');

    // BRPC 分析
    output.push('🔌 BRPC 监控分析');
    output.push('-'.repeat(80));
    if (report.brpc_analysis.issues.length > 0) {
      report.brpc_analysis.issues.forEach((issue) => {
        output.push(
          `  ${this._getSeverityEmoji(issue.severity)} ${issue.type}: ${issue.message}`,
        );
        output.push(`     💡 ${issue.suggestion}`);
      });
    } else {
      output.push('  ✓ BRPC 状态正常');
    }
    if (report.brpc_analysis.note) {
      output.push(`  ℹ️  ${report.brpc_analysis.note}`);
    }
    output.push('');

    // 线程池分析
    output.push('🧵 线程池监控分析');
    output.push('-'.repeat(80));
    if (report.threadpool_analysis.issues.length > 0) {
      report.threadpool_analysis.issues.forEach((issue) => {
        output.push(
          `  ${this._getSeverityEmoji(issue.severity)} ${issue.type}: ${issue.message}`,
        );
        output.push(`     💡 ${issue.suggestion}`);
      });
    } else {
      output.push('  ✓ 线程池状态正常');
    }
    if (report.threadpool_analysis.note) {
      output.push(`  ℹ️  ${report.threadpool_analysis.note}`);
    }
    output.push('');

    // 瓶颈分析
    if (report.bottleneck_analysis.has_bottleneck) {
      output.push('🎯 瓶颈分析');
      output.push('-'.repeat(80));
      report.bottleneck_analysis.bottlenecks.forEach((bottleneck) => {
        output.push(`  📌 ${bottleneck.category}:`);
        bottleneck.items.forEach((item) => {
          output.push(`     • ${item.message}`);
        });
      });
      output.push('');
    }

    // 优化建议
    output.push('💡 优化建议');
    output.push('='.repeat(80));
    report.recommendations.forEach((rec, index) => {
      const priorityEmoji =
        rec.priority === 'HIGH'
          ? '🔴'
          : rec.priority === 'MEDIUM'
            ? '🟡'
            : rec.priority === 'LOW'
              ? '🟢'
              : 'ℹ️';
      output.push('');
      output.push(
        `${index + 1}. ${priorityEmoji} [${rec.priority}] ${rec.title}`,
      );
      output.push(`   分类: ${rec.category}`);
      output.push(`   说明: ${rec.description}`);
      output.push(`   操作步骤:`);
      rec.actions.forEach((action) => {
        output.push(`      • ${action}`);
      });
    });
    output.push('');

    // 相关文档
    output.push('📚 相关文档');
    output.push('='.repeat(80));
    output.push('  • Reached Timeout 问题排查 SOP');
    output.push('  • StarRocks 导入运维手册: https://docs.starrocks.io/');
    output.push('  • Grafana 监控面板: BE 导入监控');
    output.push(
      '  • 线程池配置说明: 见 SOP 文档 "各线程池以及对应的 BE 配置" 章节',
    );
    output.push('');

    output.push('='.repeat(80));
    output.push('注意事项:');
    output.push(
      '1. 本报告基于当前监控数据生成，实际问题可能需要结合 BE 日志和 Profile 进一步分析',
    );
    output.push(
      '2. Prometheus 监控集成待完善，部分指标需手动检查 Grafana 面板',
    );
    output.push(
      '3. 建议优先处理 HIGH 优先级的问题，然后逐步优化 MEDIUM 和 LOW 优先级的项目',
    );
    output.push('4. 配置调整后建议持续观察监控指标，确认优化效果');
    output.push('='.repeat(80));

    return {
      success: true,
      report: output.join('\n'),
      raw_data: report,
    };
  }

  _getStatusEmoji(status) {
    const emojiMap = {
      HEALTHY: '✅',
      WARNING: '⚠️',
      CRITICAL: '🚨',
    };
    return emojiMap[status] || '❓';
  }

  _getSeverityEmoji(severity) {
    const emojiMap = {
      HIGH: '🔴',
      MEDIUM: '🟡',
      LOW: '🟢',
      INFO: 'ℹ️',
    };
    return emojiMap[severity] || '❓';
  }

  /**
   * 格式化时间（毫秒）为可读字符串
   */
  _formatTime(ms) {
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  }

  /**
   * 解析时间字符串为毫秒
   * 支持格式: "9s918ms", "49.767ms", "5.072ms", "1m30s", "1h", "0ns", "123us"
   */
  _parseTimeToMs(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;

    let totalMs = 0;

    // 匹配小时 (h)
    const hoursMatch = timeStr.match(/([\d.]+)h/);
    if (hoursMatch) {
      totalMs += parseFloat(hoursMatch[1]) * 3600000;
    }

    // 匹配分钟 (m)
    const minutesMatch = timeStr.match(/([\d.]+)m(?!s)/); // 避免匹配 ms
    if (minutesMatch) {
      totalMs += parseFloat(minutesMatch[1]) * 60000;
    }

    // 匹配秒 (s)
    const secondsMatch = timeStr.match(/([\d.]+)s(?!$)/); // 后面必须有东西，避免单独的 "s"
    if (secondsMatch) {
      totalMs += parseFloat(secondsMatch[1]) * 1000;
    }

    // 匹配毫秒 (ms)
    const msMatch = timeStr.match(/([\d.]+)ms/);
    if (msMatch) {
      totalMs += parseFloat(msMatch[1]);
    }

    // 匹配微秒 (us)
    const usMatch = timeStr.match(/([\d.]+)us/);
    if (usMatch) {
      totalMs += parseFloat(usMatch[1]) / 1000;
    }

    // 匹配纳秒 (ns)
    const nsMatch = timeStr.match(/([\d.]+)ns/);
    if (nsMatch) {
      totalMs += parseFloat(nsMatch[1]) / 1000000;
    }

    return totalMs;
  }

  /**
   * 解析内存大小字符串为字节数
   * 例如: "6.180 KB" -> 6180, "1.5 MB" -> 1572864
   */
  _parseMemory(memStr) {
    if (!memStr || typeof memStr !== 'string') return 0;
    const match = memStr.match(/([\d.]+)\s*([KMGT]?B)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };
    return value * (multipliers[unit] || 1);
  }

  /**
   * 解析 LoadChannel Profile 文本
   */
  parseLoadChannelProfile(profileText) {
    const lines = profileText.split('\n');
    const result = {
      loadId: null,
      txnId: null,
      channels: [],
      // 添加 Summary 和其他关键信息
      summary: {
        totalTime: null, // 总耗时（从 Summary）
        queryExecutionWallTime: null,
        resultDeliverTime: null,
        autocommit: null,
      },
      sink: {
        closeWaitTime: null,
        rpcClientSideTime: null,
        rpcServerSideTime: null,
      },
    };

    let currentChannel = null;
    let currentIndex = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 跳过空行
      if (!trimmed) continue;

      // 解析 Summary 中的总耗时
      if (trimmed.startsWith('- Total:')) {
        result.summary.totalTime = trimmed.split(':')[1].trim();
        continue;
      }

      // 解析 autocommit 配置
      if (trimmed.includes('"autocommit"')) {
        const match = trimmed.match(
          /"autocommit":\{"defaultValue":(true|false),"actualValue":(true|false)\}/,
        );
        if (match) {
          result.summary.autocommit = match[2] === 'true';
        }
        continue;
      }

      // 解析 QueryExecutionWallTime
      if (trimmed.startsWith('- QueryExecutionWallTime:')) {
        result.summary.queryExecutionWallTime = trimmed.split(':')[1].trim();
        continue;
      }

      // 解析 ResultDeliverTime
      if (trimmed.startsWith('- ResultDeliverTime:')) {
        result.summary.resultDeliverTime = trimmed.split(':')[1].trim();
        continue;
      }

      // 解析 OLAP_TABLE_SINK 的关键指标
      if (trimmed.startsWith('- CloseWaitTime:') && !trimmed.includes('__')) {
        result.sink.closeWaitTime = trimmed.split(':')[1].trim();
        continue;
      }

      if (
        trimmed.startsWith('- RpcClientSideTime:') &&
        !trimmed.includes('__')
      ) {
        result.sink.rpcClientSideTime = trimmed.split(':')[1].trim();
        continue;
      }

      if (
        trimmed.startsWith('- RpcServerSideTime:') &&
        !trimmed.includes('__')
      ) {
        result.sink.rpcServerSideTime = trimmed.split(':')[1].trim();
        continue;
      }

      // 解析 LoadChannel 级别
      if (trimmed.startsWith('LoadChannel:')) {
        continue;
      }

      // 解析 LoadId
      if (trimmed.startsWith('- LoadId:')) {
        result.loadId = trimmed.split(':')[1].trim();
        continue;
      }

      // 解析 TxnId
      if (trimmed.startsWith('- TxnId:')) {
        result.txnId = trimmed.split(':')[1].trim();
        continue;
      }

      // 解析 Channel
      if (
        trimmed.startsWith('Channel:') ||
        trimmed.startsWith('Channel (host=')
      ) {
        currentChannel = {
          host: null,
          peakMemoryUsage: 0,
          loadMemoryLimit: 0,
          indexNum: 0,
          backendAddresses: [],
          channelNum: 0,
          indices: [],
        };

        // 提取 host（如果有）
        const hostMatch = trimmed.match(/host=([\d.]+)/);
        if (hostMatch) {
          currentChannel.host = hostMatch[1];
        }

        result.channels.push(currentChannel);
        currentIndex = null;
        continue;
      }

      // 解析 LoadChannel 或 Channel 级别的属性
      // 如果没有当前Channel但遇到了这些属性，创建默认Channel
      if (!currentIndex) {
        if (trimmed.startsWith('- PeakMemoryUsage:')) {
          if (!currentChannel) {
            currentChannel = {
              host: 'LoadChannel',
              peakMemoryUsage: 0,
              loadMemoryLimit: 0,
              indexNum: 0,
              backendAddresses: [],
              channelNum: 0,
              indices: [],
            };
            result.channels.push(currentChannel);
          }
          currentChannel.peakMemoryUsage = trimmed.split(':')[1].trim();
        } else if (trimmed.startsWith('- LoadMemoryLimit:')) {
          if (!currentChannel) {
            currentChannel = {
              host: 'LoadChannel',
              peakMemoryUsage: 0,
              loadMemoryLimit: 0,
              indexNum: 0,
              backendAddresses: [],
              channelNum: 0,
              indices: [],
            };
            result.channels.push(currentChannel);
          }
          currentChannel.loadMemoryLimit = trimmed.split(':')[1].trim();
        } else if (trimmed.startsWith('- IndexNum:')) {
          if (!currentChannel) {
            currentChannel = {
              host: 'LoadChannel',
              peakMemoryUsage: 0,
              loadMemoryLimit: 0,
              indexNum: 0,
              backendAddresses: [],
              channelNum: 0,
              indices: [],
            };
            result.channels.push(currentChannel);
          }
          currentChannel.indexNum = parseInt(trimmed.split(':')[1].trim());
        } else if (trimmed.startsWith('- BackendAddresses:')) {
          if (!currentChannel) {
            currentChannel = {
              host: 'LoadChannel',
              peakMemoryUsage: 0,
              loadMemoryLimit: 0,
              indexNum: 0,
              backendAddresses: [],
              channelNum: 0,
              indices: [],
            };
            result.channels.push(currentChannel);
          }
          currentChannel.backendAddresses = trimmed
            .split(':')[1]
            .trim()
            .split(',');
        } else if (trimmed.startsWith('- ChannelNum:')) {
          if (!currentChannel) {
            currentChannel = {
              host: 'LoadChannel',
              peakMemoryUsage: 0,
              loadMemoryLimit: 0,
              indexNum: 0,
              backendAddresses: [],
              channelNum: 0,
              indices: [],
            };
            result.channels.push(currentChannel);
          }
          currentChannel.channelNum = parseInt(trimmed.split(':')[1].trim());
        } else if (trimmed.startsWith('- Address:')) {
          if (currentChannel) {
            currentChannel.host = trimmed.split(':')[1].trim();
          }
        }
      }

      // 解析 Index
      if (trimmed.startsWith('Index (id=') || trimmed.startsWith('Index:')) {
        // 如果还没有 Channel，创建一个默认 Channel（用于直接在 LoadChannel 下有 Index 的情况）
        if (!currentChannel) {
          currentChannel = {
            host: 'LoadChannel',
            peakMemoryUsage: 0,
            loadMemoryLimit: 0,
            indexNum: 0,
            backendAddresses: [],
            channelNum: 0,
            indices: [],
          };
          result.channels.push(currentChannel);
        }

        const idMatch = trimmed.match(/id=(\d+)/);
        currentIndex = {
          indexId: idMatch ? idMatch[1] : 'unknown',
          openCount: 0,
          openTime: '0ns',
          addChunkCount: 0,
          addRowNum: 0,
          addChunkTime: '0ns',
          waitFlushTime: '0ns',
          waitWriterTime: '0ns',
          waitReplicaTime: '0ns',
          primaryTabletsNum: 0,
          secondaryTabletsNum: 0,
          // 合并模式下的统计
          maxAddChunkCount: 0,
          minAddChunkCount: 0,
          maxAddChunkTime: '0ns',
          minAddChunkTime: '0ns',
          maxAddRowNum: 0,
          minAddRowNum: 0,
        };

        if (currentChannel) {
          currentChannel.indices.push(currentIndex);
        }
        continue;
      }

      // 解析 Index 级别的属性
      if (currentIndex) {
        const parseValue = (prefix) => {
          if (trimmed.startsWith(prefix)) {
            return trimmed
              .split(':')[1]
              .trim()
              .replace(/[()]/g, '')
              .split(' ')[0];
          }
          return null;
        };

        const value =
          parseValue('- OpenCount:') ||
          parseValue('- OpenTime:') ||
          parseValue('- AddChunkCount:') ||
          parseValue('- AddRowNum:') ||
          parseValue('- AddChunkTime:') ||
          parseValue('- WaitFlushTime:') ||
          parseValue('- WaitWriterTime:') ||
          parseValue('- WaitReplicaTime:') ||
          parseValue('- PrimaryTabletsNum:') ||
          parseValue('- SecondaryTabletsNum:') ||
          parseValue('- __MAX_OF_AddChunkCount:') ||
          parseValue('- __MIN_OF_AddChunkCount:') ||
          parseValue('- __MAX_OF_AddChunkTime:') ||
          parseValue('- __MIN_OF_AddChunkTime:') ||
          parseValue('- __MAX_OF_AddRowNum:') ||
          parseValue('- __MIN_OF_AddRowNum:');

        if (value !== null) {
          if (trimmed.includes('OpenCount:')) {
            currentIndex.openCount = parseInt(value);
          } else if (trimmed.includes('OpenTime:')) {
            currentIndex.openTime = value;
          } else if (trimmed.includes('__MAX_OF_AddChunkCount:')) {
            currentIndex.maxAddChunkCount = parseInt(value);
          } else if (trimmed.includes('__MIN_OF_AddChunkCount:')) {
            currentIndex.minAddChunkCount = parseInt(value);
          } else if (
            trimmed.includes('AddChunkCount:') &&
            !trimmed.includes('__')
          ) {
            currentIndex.addChunkCount = parseInt(value);
          } else if (trimmed.includes('__MAX_OF_AddRowNum:')) {
            currentIndex.maxAddRowNum = parseInt(value);
          } else if (trimmed.includes('__MIN_OF_AddRowNum:')) {
            currentIndex.minAddRowNum = parseInt(value);
          } else if (
            trimmed.includes('AddRowNum:') &&
            !trimmed.includes('__')
          ) {
            currentIndex.addRowNum = parseInt(value);
          } else if (trimmed.includes('__MAX_OF_AddChunkTime:')) {
            currentIndex.maxAddChunkTime = value;
          } else if (trimmed.includes('__MIN_OF_AddChunkTime:')) {
            currentIndex.minAddChunkTime = value;
          } else if (
            trimmed.includes('AddChunkTime:') &&
            !trimmed.includes('__')
          ) {
            currentIndex.addChunkTime = value;
          } else if (trimmed.includes('WaitFlushTime:')) {
            currentIndex.waitFlushTime = value;
          } else if (trimmed.includes('WaitWriterTime:')) {
            currentIndex.waitWriterTime = value;
          } else if (trimmed.includes('WaitReplicaTime:')) {
            currentIndex.waitReplicaTime = value;
          } else if (trimmed.includes('PrimaryTabletsNum:')) {
            currentIndex.primaryTabletsNum = parseInt(value);
          } else if (trimmed.includes('SecondaryTabletsNum:')) {
            currentIndex.secondaryTabletsNum = parseInt(value);
          }
        }
      }
    }

    return result;
  }

  /**
   * 分析 LoadChannel 性能
   */
  analyzeLoadChannelPerformance(parsedProfile) {
    const analysis = {
      summary: {
        totalChannels: parsedProfile.channels.length,
        totalIndices: 0,
        totalAddChunkTime: 0,
        totalWaitFlushTime: 0,
        totalWaitWriterTime: 0,
        totalWaitReplicaTime: 0,
        totalRows: 0,
      },
      channelAnalysis: [],
      bottlenecks: [],
      performance: {
        avgRowsPerSecond: 0,
        avgThroughput: 0,
      },
    };

    // 分析每个 Channel
    for (const channel of parsedProfile.channels) {
      const channelData = {
        host: channel.host || channel.backendAddresses.join(','),
        peakMemoryUsage: channel.peakMemoryUsage,
        indexNum: channel.indexNum,
        indices: [],
        totalTime: 0,
        totalWaitTime: 0,
      };

      // 分析每个 Index
      for (const index of channel.indices) {
        const addChunkTimeMs = this._parseTimeToMs(index.addChunkTime);
        const waitFlushTimeMs = this._parseTimeToMs(index.waitFlushTime);
        const waitWriterTimeMs = this._parseTimeToMs(index.waitWriterTime);
        const waitReplicaTimeMs = this._parseTimeToMs(index.waitReplicaTime);

        const totalWaitTime =
          waitFlushTimeMs + waitWriterTimeMs + waitReplicaTimeMs;
        const effectiveTime = addChunkTimeMs - totalWaitTime;

        const indexData = {
          indexId: index.indexId,
          addChunkCount: index.addChunkCount,
          addRowNum: index.addRowNum,
          addChunkTime: addChunkTimeMs,
          waitFlushTime: waitFlushTimeMs,
          waitWriterTime: waitWriterTimeMs,
          waitReplicaTime: waitReplicaTimeMs,
          effectiveTime: Math.max(0, effectiveTime),
          totalWaitTime: totalWaitTime,
          waitTimeRatio:
            addChunkTimeMs > 0 ? totalWaitTime / addChunkTimeMs : 0,
        };

        channelData.indices.push(indexData);
        channelData.totalTime += addChunkTimeMs;
        channelData.totalWaitTime += totalWaitTime;

        // 汇总到全局
        analysis.summary.totalAddChunkTime += addChunkTimeMs;
        analysis.summary.totalWaitFlushTime += waitFlushTimeMs;
        analysis.summary.totalWaitWriterTime += waitWriterTimeMs;
        analysis.summary.totalWaitReplicaTime += waitReplicaTimeMs;
        analysis.summary.totalRows += index.addRowNum;
        analysis.summary.totalIndices++;

        // 识别瓶颈
        if (waitFlushTimeMs > addChunkTimeMs * 0.3) {
          analysis.bottlenecks.push({
            type: 'MEMTABLE_FLUSH',
            severity: 'HIGH',
            channel: channelData.host,
            index: index.indexId,
            waitTime: waitFlushTimeMs,
            totalTime: addChunkTimeMs,
            ratio: ((waitFlushTimeMs / addChunkTimeMs) * 100).toFixed(1) + '%',
            message: `Index ${index.indexId} 在 Memtable Flush 上耗时过多`,
          });
        }

        if (waitWriterTimeMs > addChunkTimeMs * 0.3) {
          analysis.bottlenecks.push({
            type: 'ASYNC_DELTA_WRITER',
            severity: 'HIGH',
            channel: channelData.host,
            index: index.indexId,
            waitTime: waitWriterTimeMs,
            totalTime: addChunkTimeMs,
            ratio: ((waitWriterTimeMs / addChunkTimeMs) * 100).toFixed(1) + '%',
            message: `Index ${index.indexId} 在 Async Delta Writer 上耗时过多`,
          });
        }

        if (waitReplicaTimeMs > addChunkTimeMs * 0.2) {
          analysis.bottlenecks.push({
            type: 'REPLICA_SYNC',
            severity: 'MEDIUM',
            channel: channelData.host,
            index: index.indexId,
            waitTime: waitReplicaTimeMs,
            totalTime: addChunkTimeMs,
            ratio:
              ((waitReplicaTimeMs / addChunkTimeMs) * 100).toFixed(1) + '%',
            message: `Index ${index.indexId} 在副本同步上耗时较多`,
          });
        }
      }

      analysis.channelAnalysis.push(channelData);
    }

    // 计算性能指标
    if (analysis.summary.totalAddChunkTime > 0) {
      analysis.performance.avgRowsPerSecond = (
        analysis.summary.totalRows /
        (analysis.summary.totalAddChunkTime / 1000)
      ).toFixed(0);
    }

    return analysis;
  }

  /**
   * 生成 LoadChannel 优化建议
   */
  generateLoadChannelRecommendations(analysis) {
    const recommendations = [];

    const totalTime = analysis.summary.totalAddChunkTime;
    const flushRatio =
      totalTime > 0 ? analysis.summary.totalWaitFlushTime / totalTime : 0;
    const writerRatio =
      totalTime > 0 ? analysis.summary.totalWaitWriterTime / totalTime : 0;
    const replicaRatio =
      totalTime > 0 ? analysis.summary.totalWaitReplicaTime / totalTime : 0;

    // Memtable Flush 瓶颈建议
    if (flushRatio > 0.3) {
      recommendations.push({
        category: 'MEMTABLE_FLUSH',
        severity: 'HIGH',
        title: 'Memtable Flush 成为主要瓶颈',
        description: `Memtable Flush 耗时占总耗时的 ${(flushRatio * 100).toFixed(1)}%，说明刷盘速度较慢。`,
        suggestions: [
          '增加 flush_thread_num_per_store 配置（当前默认值较小）',
          '优化磁盘 I/O 性能，考虑使用更快的 SSD',
          '检查是否存在磁盘慢盘问题',
          '考虑增加 write_buffer_size 以减少 flush 频率',
        ],
        sql_commands: [
          '-- 增加 flush 线程数（需要重启 BE）',
          '-- 在 be.conf 中设置: flush_thread_num_per_store = 4',
          '',
          '-- 或者通过 SQL 动态调整（如果支持）:',
          '-- SET GLOBAL flush_thread_num_per_store = 4;',
        ],
      });
    }

    // Async Delta Writer 瓶颈建议
    if (writerRatio > 0.3) {
      recommendations.push({
        category: 'ASYNC_DELTA_WRITER',
        severity: 'HIGH',
        title: 'Async Delta Writer 线程池压力大',
        description: `Async Delta Writer 等待时间占总耗时的 ${(writerRatio * 100).toFixed(1)}%，说明写入线程池繁忙。`,
        suggestions: [
          '增加 transaction_apply_worker_count 配置以扩大线程池',
          '优化写入批次大小，减少小批次频繁写入',
          '检查是否有慢查询占用过多资源',
          '考虑降低导入并发度以减轻压力',
        ],
        sql_commands: [
          '-- 增加 async delta writer 线程数（需要重启 BE）',
          '-- 在 be.conf 中设置: transaction_apply_worker_count = 16',
        ],
      });
    }

    // 副本同步瓶颈建议
    if (replicaRatio > 0.2) {
      recommendations.push({
        category: 'REPLICA_SYNC',
        severity: 'MEDIUM',
        title: '副本同步耗时较长',
        description: `副本同步耗时占总耗时的 ${(replicaRatio * 100).toFixed(1)}%，可能存在网络或从副本写入瓶颈。`,
        suggestions: [
          '检查网络带宽和延迟是否正常',
          '检查从副本所在 BE 节点的资源使用情况',
          '考虑使用单副本导入（如果可接受风险）',
          '优化批次大小以减少网络开销',
        ],
        sql_commands: [
          '-- 如果可以接受风险，可以临时使用单副本导入:',
          '-- SET replication_num = 1;',
          '-- 导入完成后记得恢复副本数',
        ],
      });
    }

    // 内存使用建议
    for (const channel of analysis.channelAnalysis) {
      const memMatch = channel.peakMemoryUsage.match(/([\d.]+)\s*([GM]B)/);
      if (memMatch) {
        const memValue = parseFloat(memMatch[1]);
        const memUnit = memMatch[2];
        const memMB = memUnit === 'GB' ? memValue * 1024 : memValue;

        if (memMB > 2048) {
          // 超过 2GB
          recommendations.push({
            category: 'MEMORY',
            severity: 'MEDIUM',
            title: `Channel ${channel.host} 内存使用较高`,
            description: `峰值内存使用达到 ${channel.peakMemoryUsage}，可能影响导入性能。`,
            suggestions: [
              '考虑减小导入批次大小',
              '增加 BE 节点内存配置',
              '优化数据格式，减少内存占用',
            ],
          });
        }
      }
    }

    // 性能优化建议
    if (analysis.performance.avgRowsPerSecond < 100000) {
      recommendations.push({
        category: 'PERFORMANCE',
        severity: 'LOW',
        title: '整体导入速度较慢',
        description: `平均导入速度为 ${analysis.performance.avgRowsPerSecond} 行/秒，低于预期。`,
        suggestions: [
          '增加导入并发度',
          '优化数据格式和压缩方式',
          '检查表结构是否有性能问题（如过多索引）',
          '考虑使用批量导入替代频繁小批次导入',
        ],
      });
    }

    return recommendations;
  }

  /**
   * 分析 LoadChannel Profile（主入口）
   */
  async analyzeLoadChannelProfile(
    connection,
    queryId = null,
    profileText = null,
    profileFile = null,
    verbose = false,
  ) {
    console.error('🔍 开始分析 LoadChannel Profile...');
    console.error(`📝 输出模式: ${verbose ? '详细' : '简洁'}`);
    const startTime = Date.now();

    try {
      // 优先级：profileFile > queryId > profileText

      // 1. 如果提供了 profile_file，从文件读取
      if (profileFile && !profileText) {
        console.error(`📄 从文件读取 Profile: ${profileFile}`);
        try {
          profileText = fs.readFileSync(profileFile, 'utf8');
          console.error(`✅ 成功读取文件，大小: ${profileText.length} 字符`);
        } catch (error) {
          throw new Error(`无法读取文件 ${profileFile}: ${error.message}`);
        }
      }

      // 2. 如果提供了 query_id，从 FE 获取 profile
      if (queryId && !profileText) {
        console.error(`📊 从 FE 获取 Query ${queryId} 的 Profile...`);
        const profileQuery = `SELECT QUERY_PROFILE('${queryId}')`;
        const result = await connection.execute(profileQuery);

        if (!result || result.length === 0) {
          throw new Error(`无法获取 Query ${queryId} 的 Profile`);
        }

        profileText = result[0][0];
      }

      if (!profileText) {
        throw new Error(
          '必须提供 query_id、profile_text 或 profile_file 参数之一',
        );
      }

      // 检查是否包含 LoadChannel 信息
      if (!profileText.includes('LoadChannel')) {
        throw new Error(
          'Profile 中未找到 LoadChannel 信息，请确认这是一个导入任务的 Profile',
        );
      }

      // 1. 解析 Profile
      console.error('📝 解析 Profile 结构...');
      const parsedProfile = this.parseLoadChannelProfile(profileText);

      if (parsedProfile.channels.length === 0) {
        throw new Error('未能解析到有效的 LoadChannel 数据');
      }

      // 2. 分析性能
      console.error('📊 分析性能指标...');
      const analysis = this.analyzeLoadChannelPerformance(parsedProfile);

      // 3. 生成建议
      console.error('💡 生成优化建议...');
      const recommendations = this.generateLoadChannelRecommendations(analysis);

      // 4. 生成报告
      const output = [];
      output.push('='.repeat(80));
      output.push('📊 LoadChannel Profile 分析报告');
      output.push('='.repeat(80));
      output.push('');

      // 基本信息
      output.push('📋 基本信息');
      output.push('-'.repeat(80));
      output.push(`  LoadId: ${parsedProfile.loadId || 'N/A'}`);
      output.push(`  TxnId: ${parsedProfile.txnId || 'N/A'}`);
      output.push(`  总 Channel 数: ${analysis.summary.totalChannels}`);
      output.push(`  总 Index 数: ${analysis.summary.totalIndices}`);
      output.push(
        `  总导入行数: ${analysis.summary.totalRows.toLocaleString()}`,
      );
      if (parsedProfile.summary.autocommit !== null) {
        output.push(
          `  AutoCommit: ${parsedProfile.summary.autocommit ? '✅ 启用' : '❌ 禁用'}`,
        );
      }
      output.push('');

      // 时间分布分析（如果有总时间信息）
      if (parsedProfile.summary.totalTime) {
        output.push('⏰ 时间分布分析');
        output.push('-'.repeat(80));

        const totalTimeMs = this._parseTimeToMs(
          parsedProfile.summary.totalTime,
        );
        const loadChannelTimeMs = analysis.summary.totalAddChunkTime;
        const queryExecTimeMs = parsedProfile.summary.queryExecutionWallTime
          ? this._parseTimeToMs(parsedProfile.summary.queryExecutionWallTime)
          : 0;
        const closeWaitTimeMs = parsedProfile.sink.closeWaitTime
          ? this._parseTimeToMs(parsedProfile.sink.closeWaitTime)
          : 0;
        const rpcClientTimeMs = parsedProfile.sink.rpcClientSideTime
          ? this._parseTimeToMs(parsedProfile.sink.rpcClientSideTime)
          : 0;

        const accountedTime =
          loadChannelTimeMs + closeWaitTimeMs + rpcClientTimeMs;
        const missingTime = totalTimeMs - accountedTime;
        const missingPercent =
          totalTimeMs > 0 ? (missingTime / totalTimeMs) * 100 : 0;

        output.push(`  总任务耗时: ${this._formatTime(totalTimeMs)} (100%)`);
        output.push(
          `  ├─ QueryExecutionWallTime: ${this._formatTime(queryExecTimeMs)} (${((queryExecTimeMs / totalTimeMs) * 100).toFixed(1)}%)`,
        );
        output.push(
          `  ├─ LoadChannel AddChunk: ${this._formatTime(loadChannelTimeMs)} (${((loadChannelTimeMs / totalTimeMs) * 100).toFixed(1)}%)`,
        );
        if (closeWaitTimeMs > 0) {
          output.push(
            `  ├─ CloseWaitTime: ${this._formatTime(closeWaitTimeMs)} (${((closeWaitTimeMs / totalTimeMs) * 100).toFixed(1)}%)`,
          );
        }
        if (rpcClientTimeMs > 0) {
          output.push(
            `  ├─ RpcClientSideTime: ${this._formatTime(rpcClientTimeMs)} (${((rpcClientTimeMs / totalTimeMs) * 100).toFixed(1)}%)`,
          );
        }
        output.push(
          `  └─ ⚠️  未解释时间: ${this._formatTime(missingTime)} (${missingPercent.toFixed(1)}%)`,
        );
        output.push('');

        // 如果有大量未解释时间，添加警告
        if (missingPercent > 50) {
          output.push(
            `  🔴 警告: ${missingPercent.toFixed(1)}% 的时间未在 Profile 中体现！`,
          );
          output.push(`     这通常表示时间花费在:`);
          output.push(`     • 事务提交协调 (2PC Prepare/Commit)`);
          if (parsedProfile.summary.autocommit === false) {
            output.push(`     • 显式事务等待 (autocommit=false)`);
          }
          output.push(`     • Frontend 元数据更新`);
          output.push(`     • 跨节点网络通信延迟`);
          output.push(`     • 其他未instrumented的代码路径`);
          output.push('');
          output.push(`  📋 排查建议：`);
          output.push(`     1. 检查事务 Publish 耗时（最常见原因）`);
          output.push(`        在 FE 节点的 fe.log 中搜索：`);
          if (parsedProfile.txnId) {
            output.push(
              `        grep "${parsedProfile.txnId}" fe.log | grep "publish"`,
            );
          }
          if (parsedProfile.loadId) {
            output.push(
              `        grep "${parsedProfile.loadId}" fe.log | grep "publish"`,
            );
          }
          output.push(`        或根据 Label 搜索：`);
          output.push(`        grep "your_label" fe.log | grep "publish"`);
          output.push(
            `        关注 "finish to publish transaction" 日志的耗时`,
          );
          output.push('');
          output.push(`     2. 检查 Frontend 日志中的事务处理流程`);
          output.push(`        关键日志关键词：`);
          output.push(`        • "begin to publish transaction"`);
          output.push(`        • "finish to publish transaction"`);
          output.push(`        • "transaction commit successfully"`);
          output.push(`        • "wait for transaction"`);
          output.push('');
          output.push(`     3. 如果是显式事务（autocommit=false），检查：`);
          output.push(`        • COMMIT 命令执行时间`);
          output.push(`        • 事务持有锁的时间`);
          output.push(`        • 是否有其他事务阻塞`);
          output.push('');
        }
      }

      // 耗时统计
      output.push('⏱️  耗时统计');
      output.push('-'.repeat(80));
      const totalTime = analysis.summary.totalAddChunkTime;
      output.push(`  总 AddChunk 耗时: ${this._formatTime(totalTime)}`);
      output.push(
        `  ├─ WaitFlushTime: ${this._formatTime(analysis.summary.totalWaitFlushTime)} (${((analysis.summary.totalWaitFlushTime / totalTime) * 100).toFixed(1)}%)`,
      );
      output.push(
        `  ├─ WaitWriterTime: ${this._formatTime(analysis.summary.totalWaitWriterTime)} (${((analysis.summary.totalWaitWriterTime / totalTime) * 100).toFixed(1)}%)`,
      );
      output.push(
        `  └─ WaitReplicaTime: ${this._formatTime(analysis.summary.totalWaitReplicaTime)} (${((analysis.summary.totalWaitReplicaTime / totalTime) * 100).toFixed(1)}%)`,
      );
      output.push('');

      // 性能指标
      output.push('🚀 性能指标');
      output.push('-'.repeat(80));
      output.push(
        `  平均导入速度: ${analysis.performance.avgRowsPerSecond} 行/秒`,
      );
      output.push('');

      // Channel 详细信息（简洁模式跳过或简化）
      if (verbose) {
        output.push('📡 Channel 详细信息');
        output.push('-'.repeat(80));
        for (const channel of analysis.channelAnalysis) {
          output.push(`  Channel: ${channel.host}`);
          output.push(`    内存峰值: ${channel.peakMemoryUsage}`);
          output.push(`    Index 数量: ${channel.indexNum}`);
          output.push(`    总耗时: ${this._formatTime(channel.totalTime)}`);
          output.push(
            `    等待耗时: ${this._formatTime(channel.totalWaitTime)} (${channel.totalTime > 0 ? ((channel.totalWaitTime / channel.totalTime) * 100).toFixed(1) : 0}%)`,
          );

          for (const index of channel.indices) {
            output.push(`    Index ${index.indexId}:`);
            output.push(
              `      AddChunkCount: ${index.addChunkCount}, AddRowNum: ${index.addRowNum.toLocaleString()}`,
            );
            output.push(
              `      AddChunkTime: ${this._formatTime(index.addChunkTime)}`,
            );
            output.push(
              `        ├─ WaitFlushTime: ${this._formatTime(index.waitFlushTime)} (${((index.waitFlushTime / index.addChunkTime) * 100).toFixed(1)}%)`,
            );
            output.push(
              `        ├─ WaitWriterTime: ${this._formatTime(index.waitWriterTime)} (${((index.waitWriterTime / index.addChunkTime) * 100).toFixed(1)}%)`,
            );
            output.push(
              `        └─ WaitReplicaTime: ${this._formatTime(index.waitReplicaTime)} (${((index.waitReplicaTime / index.addChunkTime) * 100).toFixed(1)}%)`,
            );
          }
          output.push('');
        }
      } else {
        // 简洁模式：只显示概要
        output.push('📡 Channel 概要');
        output.push('-'.repeat(80));
        output.push(`  总 Channel 数: ${analysis.channelAnalysis.length}`);
        output.push(`  总 Index 数: ${analysis.summary.totalIndices}`);
        if (analysis.channelAnalysis.length > 0) {
          const maxMemChannel = analysis.channelAnalysis.reduce((max, ch) =>
            this._parseMemory(ch.peakMemoryUsage) >
            this._parseMemory(max.peakMemoryUsage)
              ? ch
              : max,
          );
          output.push(
            `  最大内存使用: ${maxMemChannel.peakMemoryUsage} (${maxMemChannel.host})`,
          );
        }
        output.push(
          '  提示: 使用 verbose=true 查看详细的 Channel 和 Index 信息',
        );
        output.push('');
      }

      // 瓶颈分析
      if (analysis.bottlenecks.length > 0) {
        output.push('⚠️  性能瓶颈');
        output.push('-'.repeat(80));
        for (const bottleneck of analysis.bottlenecks) {
          const severityEmoji = this._getSeverityEmoji(bottleneck.severity);
          output.push(
            `  ${severityEmoji} [${bottleneck.severity}] ${bottleneck.type}`,
          );
          output.push(`     ${bottleneck.message}`);
          output.push(
            `     Channel: ${bottleneck.channel}, 耗时: ${this._formatTime(bottleneck.waitTime)} / ${this._formatTime(bottleneck.totalTime)} (${bottleneck.ratio})`,
          );
        }
        output.push('');
      }

      // 优化建议
      if (recommendations.length > 0) {
        output.push('💡 优化建议');
        output.push('-'.repeat(80));
        for (const rec of recommendations) {
          const severityEmoji = this._getSeverityEmoji(rec.severity);
          output.push(`  ${severityEmoji} [${rec.severity}] ${rec.title}`);
          output.push(`     ${rec.description}`);

          if (verbose) {
            // 详细模式：显示所有建议措施和 SQL 命令
            output.push(`     建议措施:`);
            for (const suggestion of rec.suggestions) {
              output.push(`       • ${suggestion}`);
            }
            if (rec.sql_commands) {
              output.push(`     SQL 命令:`);
              for (const cmd of rec.sql_commands) {
                output.push(`       ${cmd}`);
              }
            }
          } else {
            // 简洁模式：只显示前2条建议
            if (rec.suggestions && rec.suggestions.length > 0) {
              output.push(
                `     关键建议: ${rec.suggestions.slice(0, 2).join('; ')}`,
              );
              if (rec.suggestions.length > 2) {
                output.push(
                  `     (使用 verbose=true 查看全部 ${rec.suggestions.length} 条建议)`,
                );
              }
            }
          }
          output.push('');
        }
      }

      output.push('='.repeat(80));
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      output.push(`分析完成，耗时: ${elapsedTime}s`);
      output.push('='.repeat(80));

      console.error(`✅ LoadChannel Profile 分析完成，耗时 ${elapsedTime}s`);

      return {
        success: true,
        report: output.join('\n'),
        parsed_profile: parsedProfile,
        analysis: analysis,
        recommendations: recommendations,
      };
    } catch (error) {
      console.error(`❌ LoadChannel Profile 分析失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
        report: `分析失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取此专家提供的 MCP 工具定义
   */
  getTools() {
    return [
      {
        name: 'check_load_job_status',
        description:
          '🔍 导入任务状态查询与失败分析 - 根据 Label 或 TxnId 查询导入任务状态，分析失败原因并提供解决方案\n\n' +
          '功能概述：\n' +
          '• 支持通过 Label 或 TxnId 查询导入任务（Label 支持模糊匹配，自动处理系统添加的前缀）\n' +
          '• 混合查询历史表和内存表，确保数据完整性\n' +
          '• 展示任务详细信息（状态、耗时、数据量、性能指标）\n' +
          '• 智能分析失败原因（超时、资源不足、数据质量等）\n' +
          '• 提供针对性的优化建议和解决方案\n\n' +
          '适用场景：\n' +
          '• 查询导入任务的执行状态和结果\n' +
          '• 诊断导入失败的根本原因\n' +
          '• 获取导入性能数据（吞吐量、行数、耗时）\n' +
          '• 查看错误信息和 TRACKING_SQL\n' +
          '• 获取针对性的优化建议\n\n' +
          'Label 查询说明：\n' +
          '• 支持模糊匹配，可自动匹配带前缀的 Label（如 insert_xxx, load_xxx）\n' +
          '• 用户只需提供原始 Label，无需关心系统添加的前缀\n' +
          '• 示例：提供 "abc-123" 可匹配 "insert_abc-123" 或 "broker_load_abc-123"\n\n' +
          '失败分类覆盖：\n' +
          '1. 超时问题 (Timeout/Reached Timeout)\n' +
          '2. 资源不足 (Memory/Resource)\n' +
          '3. 数据质量 (Column/Type/Format)\n' +
          '4. 网络问题 (Connection/Network)\n' +
          '5. 文件访问 (File/Path/Not Found)\n' +
          '6. 事务异常 (Transaction/Txn)\n' +
          '7. 配置错误 (Invalid/Illegal)\n' +
          '8. 权限问题 (Permission/Denied)\n\n' +
          '优化建议包含：\n' +
          '• 具体的解决步骤和配置调整\n' +
          '• 相关工具推荐（如 analyze_reached_timeout）\n' +
          '• 调试信息（TRACKING_SQL、错误数据路径）\n' +
          '• 优先级分类（高/中/低）\n\n' +
          '⚠️ 输出指示：此工具返回预格式化的详细报告，请**完整、原样**输出所有内容。',
        inputSchema: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description:
                '导入任务的 Label（可选，与 txn_id 二选一）。支持模糊匹配，自动匹配系统添加的前缀（如 insert_, load_）。示例：提供 "abc-123" 可匹配 "insert_abc-123"',
            },
            txn_id: {
              type: 'number',
              description: '导入任务的事务 ID（可选，与 label 二选一）',
            },
            database_name: {
              type: 'string',
              description: '数据库名称（可选，用于精确匹配，提高查询准确性）',
            },
            include_recommendations: {
              type: 'boolean',
              description: '是否包含优化建议（默认 true）',
              default: true,
            },
            use_llm_analysis: {
              type: 'boolean',
              description:
                '是否使用 LLM 进行智能分析（默认 true）。支持多种 LLM：DeepSeek (优先)、OpenAI、Gemini。自动检测环境变量并选择可用的 API。会增加 1-3 秒响应时间。需要配置以下任一环境变量：DEEPSEEK_API_KEY / DEEPSEEK_KEY / OPENAI_API_KEY / GEMINI_API_KEY。设置为 false 可使用快速规则匹配。',
              default: true,
            },
          },
          required: [],
        },
      },
      {
        name: 'analyze_table_import_frequency',
        description:
          '🔍 表级导入频率分析 - 深度分析指定表的导入模式、性能和频率特征。\n\n⚠️ 输出指示：此工具返回预格式化的详细报告，请**完整、原样**输出所有内容，包括所有统计数据、分析结果和建议。不要总结、省略或重新格式化报告内容。',
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
            include_details: {
              type: 'boolean',
              description: '是否包含详细分析数据',
              default: true,
            },
          },
          required: ['database_name', 'table_name'],
        },
      },
      {
        name: 'check_stream_load_tasks',
        description:
          '📊 Stream Load 任务检查 - 专门分析 Stream Load 任务的频率、批次大小和性能。\n\n功能：\n- 分析导入频率（每分钟/每小时/每天）和规律性\n- 统计平均导入行数和批次大小分布\n- 评估性能指标（吞吐量、加载耗时）\n- 检测失败率和错误类型\n- 识别小批次、高频率等性能问题\n- 提供批次大小和频率优化建议\n\n⚠️ 输出指示：此工具返回预格式化的详细报告，请**完整、原样**输出所有内容。不要总结或重新格式化报告内容。',
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
            seconds: {
              type: 'number',
              description:
                '分析时间范围（秒数，默认7天=604800秒）。支持细粒度时间范围，如3600=1小时，86400=1天',
              default: 604800,
            },
          },
          required: ['database_name', 'table_name'],
        },
      },
      {
        name: 'check_routine_load_config',
        description:
          '🔧 Routine Load 配置检查 - 检查 Routine Load 作业的配置参数，识别潜在问题并提供优化建议。\n\n功能：\n- 检查并发数、批次大小、错误容忍等关键参数\n- 分析 Kafka 分区与并发数的匹配情况\n- 评估作业性能（错误率、消费速度、吞吐量）\n- 检测作业状态异常（暂停、取消）\n- 提供具体的优化建议和 SQL 命令\n\n⚠️ 输出指示：此工具返回预格式化的详细报告，请**完整、原样**输出所有内容。不要总结或重新格式化报告内容。',
        inputSchema: {
          type: 'object',
          properties: {
            job_name: {
              type: 'string',
              description:
                'Routine Load 作业名称（可选，不指定则检查所有作业）',
            },
            database_name: {
              type: 'string',
              description: '数据库名称（可选，用于过滤特定数据库的作业）',
            },
          },
          required: [],
        },
      },
      {
        name: 'analyze_reached_timeout',
        description:
          '🔍 Reached Timeout 问题综合分析 - 根据 SOP 文档实现的导入慢问题诊断工具\n\n' +
          '功能概述：\n' +
          '• 分析集群资源使用情况（CPU、IO、网络）\n' +
          '• 分析 BRPC 接口延迟和处理情况\n' +
          '• 分析各线程池状态（Async delta writer、Memtable flush、Segment replicate、Segment flush）\n' +
          '• 识别导入瓶颈环节（资源、BRPC、线程池）\n' +
          '• 提供针对性的解决方案和配置优化建议\n\n' +
          '适用场景：\n' +
          '• 导入任务报错 [E1008]Reached timeout\n' +
          '• 导入速度慢，但未超时\n' +
          '• 需要优化导入性能\n' +
          '• 需要排查导入瓶颈\n\n' +
          '分析维度：\n' +
          '1. 资源瓶颈：CPU、IO、网络使用情况\n' +
          '2. BRPC 瓶颈：tablet_writer_open/add_chunks/add_segment 延迟分析\n' +
          '3. 线程池瓶颈：各线程池使用率、队列积压、任务耗时\n' +
          '4. 依赖关系：各环节依赖关系和耗时占比\n\n' +
          '解决方案：\n' +
          '• 资源扩容建议（BE 节点、磁盘、CPU）\n' +
          '• 线程池调优建议（具体配置 SQL）\n' +
          '• 主键表优化建议（skip_pk_preload）\n' +
          '• 超时时间调整建议\n' +
          '• 历史问题检查清单\n\n' +
          '⚠️ 注意事项：\n' +
          '• 当前版本 Prometheus 集成待完善，部分指标需手动检查 Grafana 面板\n' +
          '• 建议结合 BE 日志和 Profile 进一步分析\n' +
          '• 配置调整后需持续观察监控指标\n\n' +
          '⚠️ 输出指示：此工具返回预格式化的详细报告，请**完整、原样**输出所有内容。',
        inputSchema: {
          type: 'object',
          properties: {
            be_host: {
              type: 'string',
              description: 'BE 节点地址（可选，格式如 192.168.1.100:8060）',
            },
            architecture: {
              type: 'string',
              description:
                '架构类型：replicated（存算一体）或 shared_data（存算分离）。如果不提供，将自动检测集群架构类型',
              enum: ['replicated', 'shared_data'],
            },
            time_range_minutes: {
              type: 'number',
              description: '分析时间范围（分钟，默认30分钟）',
              default: 30,
            },
          },
          required: [],
        },
      },
      {
        name: 'analyze_load_channel_profile',
        description:
          '📊 LoadChannel Profile 深度分析 - 分析导入任务的 LoadChannel Profile，识别性能瓶颈\n\n' +
          '功能概述：\n' +
          '• 解析 LoadChannel、TabletsChannel、DeltaWriter 三层结构\n' +
          '• 分析各阶段耗时占比（WaitFlushTime、WaitWriterTime、WaitReplicaTime）\n' +
          '• 识别性能瓶颈环节（Memtable Flush、Async Delta Writer、副本同步）\n' +
          '• 计算导入速度和吞吐量\n' +
          '• 提供针对性的优化建议和配置调整方案\n\n' +
          '适用场景：\n' +
          '• 导入任务性能优化\n' +
          '• Reached Timeout 问题深度分析\n' +
          '• 识别导入慢的根本原因\n' +
          '• 优化导入配置参数\n\n' +
          '分析维度：\n' +
          '1. 基本信息：LoadId、TxnId、Channel数、Index数、导入行数\n' +
          '2. 耗时分析：AddChunkTime 及各等待阶段的耗时占比\n' +
          '3. 性能指标：平均导入速度（行/秒）\n' +
          '4. Channel 详情：每个 Channel 的内存使用、耗时分布\n' +
          '5. 瓶颈识别：自动识别 Memtable Flush、Writer、副本同步瓶颈\n' +
          '6. 优化建议：提供具体的配置调整建议和 SQL 命令\n\n' +
          '输入方式：\n' +
          '• 方式1：提供 query_id，自动从 FE 获取 Profile\n' +
          '• 方式2：直接提供 profile_text 文本内容\n\n' +
          '⚠️ 注意事项：\n' +
          '• 需要确保 Profile 中包含 LoadChannel 信息\n' +
          '• 建议开启 enable_profile = true 或设置 big_query_profile_threshold\n' +
          '• 可以通过 pipeline_profile_level 控制 Profile 详细程度\n\n' +
          '⚠️ 输出指示：此工具返回预格式化的详细报告，请**完整、原样**输出所有内容。',
        inputSchema: {
          type: 'object',
          properties: {
            query_id: {
              type: 'string',
              description:
                '导入任务的 Query ID（可选，如果提供则从 FE 获取 Profile）',
            },
            profile_text: {
              type: 'string',
              description:
                'LoadChannel Profile 文本内容（可选，如果不提供 query_id 则必须提供此参数）',
            },
            profile_file: {
              type: 'string',
              description:
                'LoadChannel Profile 文件路径（可选，如果提供则从文件读取 Profile 内容）',
            },
            verbose: {
              type: 'boolean',
              description:
                '是否输出详细报告（默认 false）。简洁模式只输出关键信息和瓶颈分析，详细模式包含所有 Channel 和 Index 的详细信息',
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksIngestionExpert };
