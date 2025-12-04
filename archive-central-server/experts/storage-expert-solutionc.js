/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 存储专家模块 - Solution C 版本
 *
 * 支持两种模式：
 * 1. 传统模式：直接连接数据库执行 SQL
 * 2. Solution C 模式：返回 SQL 定义，由客户端执行
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { detectArchitectureType, parseStorageSize } from './common-utils.js';

class StarRocksStorageExpertSolutionC {
  constructor() {
    this.name = 'storage';
    this.version = '2.0.0-solutionc';
    this.description = 'StarRocks 存储系统专家 (支持 Solution C)';

    // 存储专业知识规则库
    this.rules = {
      disk_usage: {
        warning_threshold: 85,
        critical_threshold: 95,
        emergency_threshold: 98,
        free_space_minimum_gb: 10,
      },
      tablet_health: {
        error_tablet_threshold: 10,
        max_tablet_per_be: 50000,
        replica_missing_threshold: 5,
      },
      data_distribution: {
        imbalance_threshold: 20,
        single_node_data_limit: 30,
      },
    };
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
      case 'storage_expert_analysis':
        return this.getStorageAnalysisQueries(args);

      case 'analyze_storage_amplification':
        return this.getStorageAmplificationQueries(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * 获取存储分析的 SQL 查询
   */
  getStorageAnalysisQueries(args) {
    return [
      {
        id: 'backends',
        sql: 'SHOW BACKENDS;',
        description: 'BE节点存储信息',
        required: true
      },
      {
        id: 'partition_storage',
        sql: `
          SELECT
            DB_NAME, TABLE_NAME, PARTITION_NAME,
            DATA_SIZE, ROW_COUNT, STORAGE_SIZE,
            BUCKETS, REPLICATION_NUM
          FROM information_schema.partitions_meta
          ORDER BY STORAGE_SIZE DESC
          LIMIT 50;
        `,
        description: '分区存储信息（Top 50）',
        required: false
      },
      {
        id: 'disk_io_metrics',
        sql: `
          SELECT * FROM information_schema.be_metrics
          WHERE metric_name LIKE '%disk%' OR metric_name LIKE '%io%'
          LIMIT 20;
        `,
        description: '磁盘IO指标',
        required: false
      }
    ];
  }

  /**
   * 获取存储放大分析的 SQL 查询
   */
  getStorageAmplificationQueries(args) {
    const { database_name, table_name } = args;

    // 构建 WHERE 条件
    let whereClause = "DB_NAME NOT IN ('information_schema', '_statistics_')";
    const queryParams = [];

    if (database_name) {
      whereClause += ' AND DB_NAME = ?';
      queryParams.push(database_name);
    }

    if (table_name) {
      whereClause += ' AND TABLE_NAME = ?';
      queryParams.push(table_name);
    }

    return [
      {
        id: 'run_mode',
        sql: "ADMIN SHOW FRONTEND CONFIG LIKE 'run_mode';",
        description: '查询集群运行模式（判断架构类型）',
        required: true
      },
      {
        id: 'storage_volumes',
        sql: 'SHOW STORAGE VOLUMES;',
        description: '对象存储卷信息（存算分离架构特有）',
        required: false,
        architecture: 'shared_data'
      },
      {
        id: 'partition_storage',
        sql: `
          SELECT
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            DATA_SIZE,
            STORAGE_SIZE
          FROM information_schema.partitions_meta
          WHERE ${whereClause}
          ORDER BY STORAGE_SIZE DESC
          LIMIT 1000;
        `,
        description: '分区存储详情',
        required: true,
        params: queryParams
      }
    ];
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
      case 'storage_expert_analysis':
        return this.analyzeStorageHealth(results, args);

      case 'analyze_storage_amplification':
        return this.analyzeStorageAmplification(results, args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * ============================================
   * 分析逻辑（基于客户端提供的数据）
   * ============================================
   */

  /**
   * 存储健康分析
   */
  analyzeStorageHealth(results, args) {
    const { backends, partition_storage, disk_io_metrics } = results;

    // 验证必需数据
    if (!backends || backends.length === 0) {
      throw new Error('缺少必需数据: backends');
    }

    const diagnosis = {
      criticals: [],
      warnings: [],
      issues: [],
      insights: []
    };

    // 1. 磁盘使用诊断
    this.diagnoseDiskUsage(backends, diagnosis);

    // 2. Tablet健康诊断 (从 backends 数据计算统计信息)
    const tabletStats = this.calculateTabletStatistics(backends);
    this.diagnoseTabletHealth(backends, tabletStats, diagnosis);

    // 3. 数据分布诊断
    if (partition_storage) {
      this.diagnoseDataDistribution(backends, partition_storage, diagnosis);
    }

    // 计算健康分数
    const healthScore = this.calculateStorageHealthScore(diagnosis);

    // 生成建议
    const recommendations = this.generateStorageRecommendations(diagnosis);

    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      storage_health: healthScore,
      diagnosis_results: {
        total_issues: diagnosis.criticals.length + diagnosis.warnings.length + diagnosis.issues.length,
        criticals: diagnosis.criticals,
        warnings: diagnosis.warnings,
        issues: diagnosis.issues,
        insights: diagnosis.insights,
        summary: this.generateStorageSummary(diagnosis)
      },
      professional_recommendations: recommendations
    };
  }

  /**
   * 从 backends 数据计算 tablet 统计信息
   */
  calculateTabletStatistics(backends) {
    let totalTablets = 0;
    let nodesWithErrors = 0;
    let totalErrorTablets = 0;
    let totalTabletsOnNodes = 0;

    backends.forEach(be => {
      const errTabletNum = parseInt(be.ErrTabletNum) || 0;
      const tabletNum = parseInt(be.TabletNum) || 0;

      if (errTabletNum > 0) {
        nodesWithErrors++;
      }

      totalErrorTablets += errTabletNum;
      totalTabletsOnNodes += tabletNum;
      totalTablets++;
    });

    return {
      total_tablets: totalTablets,
      nodes_with_errors: nodesWithErrors,
      total_error_tablets: totalErrorTablets,
      total_tablets_on_nodes: totalTabletsOnNodes
    };
  }

  /**
   * 存储放大分析
   */
  analyzeStorageAmplification(results, args) {
    const { run_mode, storage_volumes, partition_storage } = results;

    // 检查 run_mode 来判断架构类型
    let architectureType = 'shared_nothing';
    if (run_mode && run_mode.length > 0) {
      const runModeValue = run_mode[0].Value || run_mode[0].value;
      console.log(`🔍 检测到 run_mode: ${runModeValue}`);
      architectureType = runModeValue;
    }

    // 检查是否为存算分离架构
    if (architectureType !== 'shared_data') {
      return {
        status: 'not_applicable',
        message: `当前集群是${architectureType === 'shared_nothing' ? '存算一体' : '未知'}架构（run_mode=${architectureType}），存储放大分析仅适用于存算分离架构`,
        expert: this.name,
        timestamp: new Date().toISOString(),
        architecture_type: architectureType
      };
    }

    // 计算存储放大率
    const amplification = this.calculateAmplificationFromResults(partition_storage);

    // 诊断问题
    const issues = this.diagnoseAmplificationIssues(amplification);

    // 生成建议
    const recommendations = this.generateAmplificationRecommendations(issues);

    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      architecture_type: 'shared_data',
      filter: {
        database: args.database_name || null,
        table: args.table_name || null
      },
      storage_amplification: amplification,
      issues: issues,
      recommendations: recommendations,
      status: 'completed'
    };
  }

  /**
   * ============================================
   * 诊断逻辑（纯分析，不依赖数据库连接）
   * ============================================
   */

  /**
   * 磁盘使用诊断
   */
  diagnoseDiskUsage(backends, diagnosis) {
    backends.forEach((be) => {
      const diskUsage = parseFloat(be.MaxDiskUsedPct?.replace('%', '')) || 0;
      const availGB = parseStorageSize(be.AvailCapacity);

      if (diskUsage >= this.rules.disk_usage.emergency_threshold) {
        diagnosis.criticals.push({
          type: 'disk_emergency',
          node: be.IP,
          severity: 'CRITICAL',
          message: `节点 ${be.IP} 磁盘使用率达到紧急水平 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage, available_gb: availGB },
          impact: '可能导致写入失败和服务中断',
          urgency: 'IMMEDIATE'
        });
      } else if (diskUsage >= this.rules.disk_usage.critical_threshold) {
        diagnosis.criticals.push({
          type: 'disk_critical',
          node: be.IP,
          severity: 'CRITICAL',
          message: `节点 ${be.IP} 磁盘使用率过高 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage, available_gb: availGB },
          impact: '写入性能下降，可能导致数据导入失败',
          urgency: 'WITHIN_HOURS'
        });
      } else if (diskUsage >= this.rules.disk_usage.warning_threshold) {
        diagnosis.warnings.push({
          type: 'disk_warning',
          node: be.IP,
          severity: 'WARNING',
          message: `节点 ${be.IP} 磁盘使用率较高 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage, available_gb: availGB },
          impact: '需要关注存储空间，建议制定清理计划',
          urgency: 'WITHIN_DAYS'
        });
      }
    });
  }

  /**
   * Tablet健康诊断
   */
  diagnoseTabletHealth(backends, tabletStats, diagnosis) {
    backends.forEach((be) => {
      const errorTablets = parseInt(be.ErrTabletNum) || 0;
      if (errorTablets > 0) {
        const severity = errorTablets >= this.rules.tablet_health.error_tablet_threshold
          ? 'CRITICAL'
          : 'WARNING';

        (severity === 'CRITICAL' ? diagnosis.criticals : diagnosis.warnings).push({
          type: 'error_tablets',
          node: be.IP,
          severity: severity,
          message: `节点 ${be.IP} 发现 ${errorTablets} 个错误Tablet`,
          metrics: { error_count: errorTablets, total_tablets: be.TabletNum },
          impact: severity === 'CRITICAL'
            ? '数据可用性受影响，可能导致查询失败'
            : '数据完整性风险，建议检查副本状态',
          urgency: severity === 'CRITICAL' ? 'IMMEDIATE' : 'WITHIN_DAYS'
        });
      }
    });

    // 全局错误率检查
    if (tabletStats && tabletStats.total_error_tablets > 0) {
      const errorRate = (tabletStats.total_error_tablets / tabletStats.total_tablets_on_nodes) * 100;
      if (errorRate > 1) {
        diagnosis.criticals.push({
          type: 'high_error_tablet_rate',
          severity: 'CRITICAL',
          message: `集群错误Tablet比例过高 (${errorRate.toFixed(2)}%)`,
          metrics: {
            error_tablets: tabletStats.total_error_tablets,
            total_tablets: tabletStats.total_tablets_on_nodes,
            error_rate: errorRate
          },
          impact: '集群数据完整性存在严重风险',
          urgency: 'IMMEDIATE'
        });
      }
    }
  }

  /**
   * 数据分布诊断
   */
  diagnoseDataDistribution(backends, partitions, diagnosis) {
    const dataSizes = backends.map((be) => parseStorageSize(be.DataUsedCapacity));
    const totalData = dataSizes.reduce((sum, size) => sum + size, 0);

    if (totalData > 0) {
      const avgDataPerNode = totalData / backends.length;

      backends.forEach((be) => {
        const nodeData = parseStorageSize(be.DataUsedCapacity);
        const deviationPercent = Math.abs((nodeData - avgDataPerNode) / avgDataPerNode) * 100;

        if (deviationPercent > this.rules.data_distribution.imbalance_threshold) {
          diagnosis.warnings.push({
            type: 'data_imbalance',
            node: be.IP,
            severity: 'WARNING',
            message: `节点 ${be.IP} 数据分布不均衡，偏差 ${deviationPercent.toFixed(1)}%`,
            metrics: {
              node_data_gb: nodeData,
              cluster_avg_gb: avgDataPerNode,
              deviation_percent: deviationPercent
            },
            impact: '可能导致热点节点和查询性能不均衡',
            urgency: 'WITHIN_WEEKS'
          });
        }
      });
    }

    // 大分区分析
    if (partitions && partitions.length > 0) {
      const largePartitions = partitions.filter(p => parseStorageSize(p.DATA_SIZE) > 10);
      if (largePartitions.length > 0) {
        diagnosis.insights.push({
          type: 'large_partitions_analysis',
          message: `发现 ${largePartitions.length} 个大分区 (>10GB)`,
          details: largePartitions.slice(0, 5).map(p => ({
            partition: `${p.DB_NAME}.${p.TABLE_NAME}.${p.PARTITION_NAME}`,
            size: p.DATA_SIZE,
            rows: p.ROW_COUNT
          })),
          recommendations: [
            '考虑优化大表的分区策略',
            '评估是否需要增加分桶数'
          ]
        });
      }
    }
  }

  /**
   * 计算存储放大率
   */
  calculateAmplificationFromResults(partitionStorage) {
    // 辅助函数：根据大小自适应选择单位
    const formatSizeValue = (sizeGB) => {
      if (sizeGB >= 1) {
        return sizeGB.toFixed(2) + ' GB';
      } else if (sizeGB >= 1 / 1024) {
        return (sizeGB * 1024).toFixed(2) + ' MB';
      } else if (sizeGB >= 1 / (1024 * 1024)) {
        return (sizeGB * 1024 * 1024).toFixed(2) + ' KB';
      } else {
        return (sizeGB * 1024 * 1024 * 1024).toFixed(0) + ' Bytes';
      }
    };

    const result = {
      total_data_size_gb: 0,
      total_storage_size_gb: 0,
      amplification_ratio: 0,
      by_table: [],
      by_partition: []
    };

    if (!partitionStorage || partitionStorage.length === 0) {
      result.calculation_method = 'no_data';
      return result;
    }

    let totalDataSize = 0;
    let totalStorageSize = 0;
    const tableStats = new Map();

    partitionStorage.forEach(partition => {
      const dataSize = parseStorageSize(partition.DATA_SIZE);
      const storageSize = parseStorageSize(partition.STORAGE_SIZE);

      totalDataSize += dataSize;
      totalStorageSize += storageSize;

      // 记录分区级别 - 使用自适应单位
      result.by_partition.push({
        database: partition.DB_NAME,
        table: partition.TABLE_NAME,
        partition: partition.PARTITION_NAME,
        data_size: formatSizeValue(dataSize),
        storage_size: formatSizeValue(storageSize),
        amplification: dataSize > 0 ? (storageSize / dataSize).toFixed(2) : '0.00'
      });

      // 按表聚合
      const tableKey = `${partition.DB_NAME}.${partition.TABLE_NAME}`;
      if (!tableStats.has(tableKey)) {
        tableStats.set(tableKey, {
          database: partition.DB_NAME,
          table: partition.TABLE_NAME,
          data_size: 0,
          storage_size: 0
        });
      }
      const tableStat = tableStats.get(tableKey);
      tableStat.data_size += dataSize;
      tableStat.storage_size += storageSize;
    });

    // 生成表级统计 - 使用自适应单位
    tableStats.forEach(stat => {
      result.by_table.push({
        database: stat.database,
        table: stat.table,
        data_size: formatSizeValue(stat.data_size),
        storage_size: formatSizeValue(stat.storage_size),
        table_amplification: stat.data_size > 0
          ? (stat.storage_size / stat.data_size).toFixed(2)
          : '0.00'
      });
    });

    // 总计仍使用 GB（便于API层面计算）
    result.total_data_size_gb = totalDataSize.toFixed(2);
    result.total_storage_size_gb = totalStorageSize.toFixed(2);
    result.amplification_ratio = totalDataSize > 0
      ? (totalStorageSize / totalDataSize).toFixed(2)
      : '0.00';
    result.calculation_method = 'partitions_meta';

    return result;
  }

  /**
   * 诊断存储放大问题
   */
  diagnoseAmplificationIssues(amplification) {
    const issues = [];
    const ampRatio = parseFloat(amplification.amplification_ratio);

    if (ampRatio > 2.0) {
      issues.push({
        severity: 'critical',
        category: 'storage_amplification',
        message: `存储放大率过高: ${ampRatio}x`,
        impact: '大量浪费对象存储空间，显著增加存储成本',
        current_value: ampRatio,
        threshold: 2.0
      });
    } else if (ampRatio > 1.5) {
      issues.push({
        severity: 'warning',
        category: 'storage_amplification',
        message: `存储放大率偏高: ${ampRatio}x`,
        impact: '存储空间利用率不理想，建议优化',
        current_value: ampRatio,
        threshold: 1.5
      });
    }

    return issues;
  }

  /**
   * ============================================
   * 辅助方法
   * ============================================
   */

  /**
   * 计算存储健康分数
   */
  calculateStorageHealthScore(diagnosis) {
    let score = 100;
    score -= diagnosis.criticals.length * 25;
    score -= diagnosis.warnings.length * 10;
    score -= diagnosis.issues.length * 5;
    score = Math.max(0, score);

    let level = 'EXCELLENT';
    if (score < 50) level = 'POOR';
    else if (score < 70) level = 'FAIR';
    else if (score < 85) level = 'GOOD';

    return {
      score: score,
      level: level,
      status: diagnosis.criticals.length > 0 ? 'CRITICAL'
        : diagnosis.warnings.length > 0 ? 'WARNING' : 'HEALTHY'
    };
  }

  /**
   * 生成存储摘要
   */
  generateStorageSummary(diagnosis) {
    if (diagnosis.criticals.length > 0) {
      return `存储系统发现 ${diagnosis.criticals.length} 个严重问题，需要立即处理`;
    } else if (diagnosis.warnings.length > 0) {
      return `存储系统发现 ${diagnosis.warnings.length} 个警告问题，建议近期处理`;
    } else if (diagnosis.issues.length > 0) {
      return `存储系统发现 ${diagnosis.issues.length} 个一般问题，可安排时间处理`;
    }
    return '存储系统运行状态良好';
  }

  /**
   * 生成存储建议
   */
  generateStorageRecommendations(diagnosis) {
    const recommendations = [];

    [...diagnosis.criticals, ...diagnosis.warnings].forEach(issue => {
      if (issue.type === 'disk_emergency' || issue.type === 'disk_critical') {
        recommendations.push({
          category: 'emergency_disk_management',
          priority: 'HIGH',
          title: '紧急磁盘空间处理',
          description: `节点 ${issue.node} 磁盘空间严重不足`,
          actions: [
            '立即清理临时文件和日志',
            '手动触发Compaction清理过期数据',
            '考虑紧急扩容或数据迁移'
          ]
        });
      }

      if (issue.type === 'error_tablets') {
        recommendations.push({
          category: 'tablet_repair',
          priority: issue.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          title: 'Tablet错误修复',
          description: `修复节点 ${issue.node} 上的错误Tablet`,
          actions: [
            'SHOW PROC "/dbs"; -- 诊断详情',
            'ADMIN REPAIR TABLE {table}; -- 尝试修复',
            '检查磁盘和网络状态'
          ]
        });
      }
    });

    return recommendations;
  }

  /**
   * 生成存储放大建议
   */
  generateAmplificationRecommendations(issues) {
    const recommendations = [];

    issues.forEach(issue => {
      if (issue.category === 'storage_amplification') {
        recommendations.push({
          priority: issue.severity === 'critical' ? 'HIGH' : 'MEDIUM',
          category: 'storage_optimization',
          title: issue.severity === 'critical' ? '紧急处理存储放大问题' : '优化存储空间使用',
          description: issue.message,
          actions: [
            '执行 VACUUM 操作清理已删除的数据',
            '手动触发 Compaction 合并小文件',
            '检查 Bucket 数量配置是否合理',
            '审查数据保留策略，清理不需要的历史数据'
          ]
        });
      }
    });

    return recommendations;
  }

  /**
   * ============================================
   * 传统模式兼容（保留原有功能）
   * ============================================
   */

  /**
   * 传统模式：直接连接数据库执行存储健康诊断
   */
  async diagnose(connection, includeDetails = true) {
    // 1. 收集数据
    const results = {};
    const queries = this.getStorageAnalysisQueries({});

    for (const query of queries) {
      try {
        const [rows] = await connection.query(query.sql);
        results[query.id] = rows;
      } catch (error) {
        console.warn(`查询 ${query.id} 失败:`, error.message);
        if (query.required) {
          throw error;
        }
        results[query.id] = [];
      }
    }

    // 2. 分析结果
    return this.analyzeStorageHealth(results, { includeDetails });
  }

  /**
   * 传统模式：直接连接数据库执行存储放大分析
   */
  async analyzeStorageAmplificationTraditional(connection, databaseName = null, tableName = null, includeDetails = true) {
    console.log('🔍 执行存储放大分析（传统模式）...');

    try {
      // 1. 收集数据
      const results = {};
      const queries = this.getStorageAmplificationQueries({ database_name: databaseName, table_name: tableName });

      for (const query of queries) {
        try {
          let rows;
          if (query.params && query.params.length > 0) {
            [rows] = await connection.query(query.sql, query.params);
          } else {
            [rows] = await connection.query(query.sql);
          }
          results[query.id] = rows;
        } catch (error) {
          console.warn(`查询 ${query.id} 失败:`, error.message);
          if (query.required) {
            // 如果必需查询失败，可能不是存算分离架构
            if (query.id === 'compute_nodes') {
              return {
                status: 'not_applicable',
                message: '当前集群不是存算分离架构，无法进行存储放大分析',
                expert: this.name,
                timestamp: new Date().toISOString()
              };
            }
            throw error;
          }
          results[query.id] = [];
        }
      }

      // 2. 分析结果
      return this.analyzeStorageAmplification(results, { database_name: databaseName, table_name: tableName });

    } catch (error) {
      console.error('存储放大分析失败:', error.message);
      return {
        status: 'error',
        error: error.message,
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * ============================================
   * MCP 工具注册（coordinator 需要）
   * ============================================
   */

  /**
   * 获取工具处理器（coordinator 调用）
   */
  getToolHandlers() {
    return {
      analyze_storage_amplification: async (args, context) => {
        console.log('🎯 Storage Expert (Solution C) - analyze_storage_amplification');

        const connection = context.connection;
        const result = await this.analyzeStorageAmplificationTraditional(
          connection,
          args.database_name || null,
          args.table_name || null,
          args.include_details !== false
        );

        return {
          content: [
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
   * 获取工具定义（coordinator 调用）
   */
  getTools() {
    return [
      {
        name: 'analyze_storage_amplification',
        description: `📊 **存储空间放大分析** (仅存算分离架构)

**功能**: 计算对象存储实际占用相对于用户数据大小的放大比例，分析副本数量、快照堆积、未清理数据等导致的存储成本浪费。

**计算方式**: 放大率 = 对象存储占用 (storage_size) ÷ 用户数据大小 (data_size)

**适用场景**:
- ✅ 检查表或分区的存储空间为何比预期大很多
- ✅ 分析存储成本为何过高，为何对象存储花费这么多钱
- ✅ 发现哪些表的存储效率低
- ✅ 示例问题: "为什么这个表才 100GB 数据，却占用了 300GB 对象存储？"
- ✅ 示例问题: "帮我分析系统存储空间放大情况"

**不适用于**:
- ❌ Compaction Score 分析（使用 analyze_high_compaction_score 或 get_high_compaction_partitions）
- ❌ 查询性能分析（使用 compaction_expert_analysis）
- ❌ 导入频率分析（使用 analyze_table_import_frequency）
- ❌ 磁盘使用率分析（使用 storage_expert_analysis）

**参数示例**:
- 分析特定表 "ssb_100g_1.lineorder":
  • database_name: "ssb_100g_1"
  • table_name: "lineorder"

- 分析整个数据库 "ssb_100g_1":
  • database_name: "ssb_100g_1"
  • table_name: null (或不传)

- 分析整个集群:
  • database_name: null (或不传)
  • table_name: null (或不传)`,
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
              description: '是否包含详细数据',
              default: true,
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksStorageExpertSolutionC };
