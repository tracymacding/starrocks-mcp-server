/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 存储专家模块
 * 负责：磁盘使用、Tablet健康、副本状态、数据分布等存储相关诊断
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { detectArchitectureType, parseStorageSize } from './common-utils.js';

class StarRocksStorageExpert {
  constructor() {
    this.name = 'storage';
    this.version = '1.0.0';
    this.description =
      'StarRocks 存储系统专家 - 负责磁盘、Tablet、副本管理等存储相关诊断';

    // 存储专业知识规则库
    this.rules = {
      // 磁盘使用规则
      disk_usage: {
        warning_threshold: 85,
        critical_threshold: 95,
        emergency_threshold: 98,
        free_space_minimum_gb: 10,
      },

      // Tablet 健康规则
      tablet_health: {
        error_tablet_threshold: 10,
        max_tablet_per_be: 50000,
        replica_missing_threshold: 5,
      },

      // 数据分布规则
      data_distribution: {
        imbalance_threshold: 20, // 数据分布不均衡阈值(%)
        single_node_data_limit: 30, // 单节点数据占比上限(%)
      },

      // 存储性能规则
      storage_performance: {
        io_util_threshold: 80,
        disk_queue_threshold: 10,
        slow_disk_threshold: 100, // ms
      },
    };

    // 专业术语和解释
    this.terminology = {
      tablet: 'StarRocks中数据的基本存储单元，每个分区的数据分片',
      replica: 'Tablet的副本，用于数据冗余和高可用',
      compaction_score: '衡量数据文件碎片化程度的指标，分数越高说明碎片越多',
    };
  }

  /**
   * 存储系统综合诊断
   */
  async diagnose(connection, includeDetails = true) {
    try {
      const startTime = new Date();

      // 1. 收集存储相关数据
      const storageData = await this.collectStorageData(connection);

      // 2. 执行专业诊断分析
      const diagnosis = this.performStorageDiagnosis(storageData);

      // 3. 生成专业建议
      const recommendations = this.generateStorageRecommendations(
        diagnosis,
        storageData,
      );

      // 4. 计算存储健康分数
      const healthScore = this.calculateStorageHealthScore(diagnosis);

      const endTime = new Date();
      const analysisTime = endTime - startTime;

      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        analysis_duration_ms: analysisTime,
        storage_health: healthScore,
        diagnosis_results: diagnosis,
        professional_recommendations: recommendations,
        raw_data: includeDetails ? storageData : null,
        next_check_interval: this.suggestNextCheckInterval(diagnosis),
      };
    } catch (error) {
      throw new Error(`存储专家诊断失败: ${error.message}`);
    }
  }

  /**
   * 收集存储相关数据
   */
  async collectStorageData(connection) {
    const data = {};

    // 1. BE节点存储信息
    const [backends] = await connection.query('SHOW BACKENDS;');
    data.backends = backends;

    // 2. Tablet统计信息
    try {
      const [tabletStats] = await connection.query(`
        SELECT
          COUNT(*) as total_tablets,
          COUNT(CASE WHEN ErrTabletNum > 0 THEN 1 END) as nodes_with_errors,
          SUM(ErrTabletNum) as total_error_tablets,
          SUM(TabletNum) as total_tablets_on_nodes
        FROM information_schema.backends;
      `);
      data.tablet_statistics = tabletStats[0];
    } catch (error) {
      console.warn('Failed to collect tablet statistics:', error.message);
      data.tablet_statistics = null;
    }

    // 3. 分区存储信息
    try {
      const [partitionStorage] = await connection.query(`
        SELECT
          DB_NAME, TABLE_NAME, PARTITION_NAME,
          DATA_SIZE, ROW_COUNT, STORAGE_SIZE,
          BUCKETS, REPLICATION_NUM
        FROM information_schema.partitions_meta
        ORDER BY STORAGE_SIZE DESC
        LIMIT 50;
      `);
      data.partition_storage = partitionStorage;
    } catch (error) {
      console.warn('Failed to collect partition storage info:', error.message);
      data.partition_storage = [];
    }

    // 4. 磁盘IO统计 (如果可用)
    try {
      const [diskIO] = await connection.query(`
        SELECT * FROM information_schema.be_metrics
        WHERE metric_name LIKE '%disk%' OR metric_name LIKE '%io%'
        LIMIT 20;
      `);
      data.disk_io_metrics = diskIO;
    } catch (error) {
      data.disk_io_metrics = [];
    }

    return data;
  }

  /**
   * 执行存储专业诊断
   */
  performStorageDiagnosis(data) {
    const issues = [];
    const warnings = [];
    const criticals = [];
    const insights = [];

    // 1. 磁盘使用诊断
    this.diagnoseDiskUsage(data.backends, issues, warnings, criticals);

    // 2. Tablet健康诊断
    this.diagnoseTabletHealth(data, issues, warnings, criticals);

    // 3. 数据分布诊断
    this.diagnoseDataDistribution(
      data.backends,
      data.partition_storage,
      insights,
      warnings,
    );

    // 4. 存储性能诊断
    this.diagnoseStoragePerformance(data, warnings, criticals);

    return {
      total_issues: issues.length + warnings.length + criticals.length,
      criticals: criticals,
      warnings: warnings,
      issues: issues,
      insights: insights,
      summary: this.generateStorageSummary(criticals, warnings, issues),
    };
  }

  /**
   * 磁盘使用诊断
   */
  diagnoseDiskUsage(backends, issues, warnings, criticals) {
    backends.forEach((be) => {
      const diskUsage = parseFloat(be.MaxDiskUsedPct?.replace('%', '')) || 0;
      const availGB = parseStorageSize(be.AvailCapacity);

      if (diskUsage >= this.rules.disk_usage.emergency_threshold) {
        criticals.push({
          type: 'disk_emergency',
          node: be.IP,
          severity: 'CRITICAL',
          message: `节点 ${be.IP} 磁盘使用率达到紧急水平 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage, available_gb: availGB },
          impact: '可能导致写入失败和服务中断',
          urgency: 'IMMEDIATE',
          estimated_time_to_full: this.estimateTimeToFull(availGB, be.IP),
        });
      } else if (diskUsage >= this.rules.disk_usage.critical_threshold) {
        criticals.push({
          type: 'disk_critical',
          node: be.IP,
          severity: 'CRITICAL',
          message: `节点 ${be.IP} 磁盘使用率过高 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage, available_gb: availGB },
          impact: '写入性能下降，可能导致数据导入失败',
          urgency: 'WITHIN_HOURS',
        });
      } else if (diskUsage >= this.rules.disk_usage.warning_threshold) {
        warnings.push({
          type: 'disk_warning',
          node: be.IP,
          severity: 'WARNING',
          message: `节点 ${be.IP} 磁盘使用率较高 (${be.MaxDiskUsedPct})`,
          metrics: { usage: diskUsage, available_gb: availGB },
          impact: '需要关注存储空间，建议制定清理计划',
          urgency: 'WITHIN_DAYS',
        });
      }

      // 检查最小可用空间
      if (availGB < this.rules.disk_usage.free_space_minimum_gb) {
        criticals.push({
          type: 'low_free_space',
          node: be.IP,
          severity: 'CRITICAL',
          message: `节点 ${be.IP} 可用空间不足 (${be.AvailCapacity})`,
          metrics: { available_gb: availGB },
          impact: '极高风险，可能立即导致写入失败',
          urgency: 'IMMEDIATE',
        });
      }
    });
  }

  /**
   * Tablet健康诊断
   */
  diagnoseTabletHealth(data, issues, warnings, criticals) {
    const backends = data.backends;
    const tabletStats = data.tablet_statistics;

    // 检查错误Tablet
    backends.forEach((be) => {
      const errorTablets = parseInt(be.ErrTabletNum) || 0;
      if (errorTablets > 0) {
        const severity =
          errorTablets >= this.rules.tablet_health.error_tablet_threshold
            ? 'CRITICAL'
            : 'WARNING';

        (severity === 'CRITICAL' ? criticals : warnings).push({
          type: 'error_tablets',
          node: be.IP,
          severity: severity,
          message: `节点 ${be.IP} 发现 ${errorTablets} 个错误Tablet`,
          metrics: { error_count: errorTablets, total_tablets: be.TabletNum },
          impact:
            severity === 'CRITICAL'
              ? '数据可用性受影响，可能导致查询失败'
              : '数据完整性风险，建议检查副本状态',
          urgency: severity === 'CRITICAL' ? 'IMMEDIATE' : 'WITHIN_DAYS',
          recommended_actions: [
            'SHOW PROC "/dbs/{db_id}/{table_id}"; -- 查看具体错误Tablet',
            'ADMIN REPAIR TABLE {table_name}; -- 尝试修复',
            '检查磁盘和网络状态',
          ],
        });
      }

      // 检查Tablet数量分布
      const tabletCount = parseInt(be.TabletNum) || 0;
      if (tabletCount > this.rules.tablet_health.max_tablet_per_be) {
        warnings.push({
          type: 'high_tablet_count',
          node: be.IP,
          severity: 'WARNING',
          message: `节点 ${be.IP} Tablet数量过多 (${tabletCount})`,
          metrics: { tablet_count: tabletCount },
          impact: '可能影响节点性能和故障恢复时间',
          urgency: 'WITHIN_WEEKS',
          recommended_actions: [
            '考虑集群扩容',
            '检查表分区策略是否合理',
            '评估Tablet分布均衡性',
          ],
        });
      }
    });

    // 全局Tablet统计分析
    if (tabletStats && tabletStats.total_error_tablets > 0) {
      const errorRate =
        (tabletStats.total_error_tablets / tabletStats.total_tablets_on_nodes) *
        100;

      if (errorRate > 1) {
        // 错误率超过1%
        criticals.push({
          type: 'high_error_tablet_rate',
          severity: 'CRITICAL',
          message: `集群错误Tablet比例过高 (${errorRate.toFixed(2)}%)`,
          metrics: {
            error_tablets: tabletStats.total_error_tablets,
            total_tablets: tabletStats.total_tablets_on_nodes,
            error_rate: errorRate,
          },
          impact: '集群数据完整性存在严重风险',
          urgency: 'IMMEDIATE',
        });
      }
    }
  }

  /**
   * 数据分布诊断
   */
  diagnoseDataDistribution(backends, partitions, insights, warnings) {
    // 计算数据分布均衡性
    const dataSizes = backends.map((be) =>
      parseStorageSize(be.DataUsedCapacity),
    );
    const totalData = dataSizes.reduce((sum, size) => sum + size, 0);

    if (totalData > 0) {
      const avgDataPerNode = totalData / backends.length;

      backends.forEach((be) => {
        const nodeData = parseStorageSize(be.DataUsedCapacity);
        const deviationPercent =
          Math.abs((nodeData - avgDataPerNode) / avgDataPerNode) * 100;

        if (
          deviationPercent > this.rules.data_distribution.imbalance_threshold
        ) {
          warnings.push({
            type: 'data_imbalance',
            node: be.IP,
            severity: 'WARNING',
            message: `节点 ${be.IP} 数据分布不均衡，偏差 ${deviationPercent.toFixed(1)}%`,
            metrics: {
              node_data_gb: nodeData,
              cluster_avg_gb: avgDataPerNode,
              deviation_percent: deviationPercent,
            },
            impact: '可能导致热点节点和查询性能不均衡',
            urgency: 'WITHIN_WEEKS',
          });
        }
      });
    }

    // 分析大表分区
    if (partitions && partitions.length > 0) {
      const largePartitions = partitions.filter(
        (p) => parseStorageSize(p.DATA_SIZE) > 10, // 大于10GB的分区
      );

      if (largePartitions.length > 0) {
        insights.push({
          type: 'large_partitions_analysis',
          message: `发现 ${largePartitions.length} 个大分区 (>10GB)`,
          details: largePartitions.slice(0, 5).map((p) => ({
            partition: `${p.DB_NAME}.${p.TABLE_NAME}.${p.PARTITION_NAME}`,
            size: p.DATA_SIZE,
            rows: p.ROW_COUNT,
            buckets: p.BUCKETS,
          })),
          recommendations: [
            '考虑优化大表的分区策略',
            '评估是否需要增加分桶数',
            '检查数据导入模式是否合理',
          ],
        });
      }
    }
  }

  /**
   * 存储性能诊断
   */
  diagnoseStoragePerformance(data, warnings, criticals) {
    // 这里可以添加磁盘IO性能分析
    // 当前先检查基本的磁盘相关指标

    data.backends.forEach((be) => {
      const memUsage = parseFloat(be.MemUsedPct?.replace('%', '')) || 0;

      // 高内存使用可能影响磁盘缓存性能
      if (memUsage > 90) {
        warnings.push({
          type: 'high_memory_affecting_io',
          node: be.IP,
          severity: 'WARNING',
          message: `节点 ${be.IP} 高内存使用率 (${be.MemUsedPct}) 可能影响存储性能`,
          metrics: { memory_usage: memUsage },
          impact: '磁盘缓存效率下降，IO性能受影响',
          urgency: 'WITHIN_DAYS',
        });
      }
    });
  }

  /**
   * 生成存储专业建议
   */
  generateStorageRecommendations(diagnosis, data) {
    const recommendations = [];

    // 针对不同类型的问题生成专业建议
    [...diagnosis.criticals, ...diagnosis.warnings].forEach((issue) => {
      switch (issue.type) {
        case 'disk_emergency':
        case 'disk_critical':
          recommendations.push({
            category: 'emergency_disk_management',
            priority: 'HIGH',
            title: '紧急磁盘空间处理',
            description: `节点 ${issue.node} 磁盘空间严重不足`,
            professional_actions: [
              {
                action: '立即清理临时文件和日志',
                command: 'find /data/be/log -name "*.log.*" -mtime +7 -delete',
                risk_level: 'LOW',
                estimated_time: '5分钟',
              },
              {
                action: '手动触发Compaction清理过期数据',
                command: 'ALTER TABLE {table} COMPACT;',
                risk_level: 'LOW',
                estimated_time: '10-30分钟',
                note: '需要根据具体表名替换{table}',
              },
              {
                action: '紧急扩容或数据迁移',
                risk_level: 'MEDIUM',
                estimated_time: '30-60分钟',
                prerequisites: ['备份重要数据', '通知相关团队'],
              },
            ],
            monitoring_after_fix: [
              '监控磁盘使用率变化',
              '检查Compaction是否正常进行',
              '确认数据导入是否恢复正常',
            ],
          });
          break;

        case 'error_tablets':
          recommendations.push({
            category: 'tablet_repair',
            priority: issue.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
            title: 'Tablet错误修复',
            description: `修复节点 ${issue.node} 上的错误Tablet`,
            professional_actions: [
              {
                action: '诊断错误Tablet详情',
                command: 'SHOW PROC "/dbs";',
                note: '查找对应数据库ID，然后进一步查看表和Tablet详情',
              },
              {
                action: '尝试自动修复',
                command: 'ADMIN REPAIR TABLE {database}.{table};',
                risk_level: 'LOW',
                estimated_time: '5-15分钟',
              },
              {
                action: '检查副本状态',
                command: 'SHOW PROC "/dbs/{db_id}/{table_id}";',
                note: '确认副本数量和健康状态',
              },
            ],
            root_cause_investigation: [
              '检查磁盘是否有坏道',
              '验证网络连接是否稳定',
              '查看BE日志中的错误信息',
              '确认系统资源是否充足',
            ],
          });
          break;

        case 'data_imbalance':
          recommendations.push({
            category: 'data_rebalancing',
            priority: 'MEDIUM',
            title: '数据分布均衡优化',
            description: '优化集群数据分布均衡性',
            professional_actions: [
              {
                action: '分析数据倾斜原因',
                steps: [
                  '检查表的分桶策略是否合理',
                  '分析数据导入模式',
                  '评估分区策略是否需要调整',
                ],
              },
              {
                action: '考虑数据重分布',
                note: '在低峰期进行，避免影响业务',
                risk_level: 'MEDIUM',
                estimated_time: '数小时到数天（取决于数据量）',
              },
            ],
          });
          break;
      }
    });

    // 添加预防性建议
    recommendations.push(this.generatePreventiveRecommendations(data));

    return recommendations.filter((rec) => rec); // 过滤空值
  }

  /**
   * 生成预防性建议
   */
  generatePreventiveRecommendations(data) {
    return {
      category: 'preventive_maintenance',
      priority: 'LOW',
      title: '存储系统预防性维护建议',
      description: '定期维护建议，保持存储系统最佳状态',
      professional_actions: [
        {
          action: '定期监控磁盘使用趋势',
          frequency: '每日',
          automation_possible: true,
        },
        {
          action: '定期检查Tablet健康状态',
          frequency: '每周',
          command: 'SELECT SUM(ErrTabletNum) FROM information_schema.backends;',
        },
        {
          action: '定期分析数据增长模式',
          frequency: '每月',
          note: '有助于容量规划和性能优化',
        },
      ],
      capacity_planning: {
        recommendation: '基于当前增长趋势，建议提前3-6个月进行扩容规划',
        factors_to_consider: [
          '数据增长速率',
          '业务发展计划',
          '查询复杂度变化',
          '高可用性要求',
        ],
      },
    };
  }

  /**
   * 计算存储健康分数
   */
  calculateStorageHealthScore(diagnosis) {
    let score = 100;

    // 扣分规则
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
      status:
        diagnosis.criticals.length > 0
          ? 'CRITICAL'
          : diagnosis.warnings.length > 0
            ? 'WARNING'
            : 'HEALTHY',
    };
  }

  /**
   * 生成存储诊断摘要
   */
  generateStorageSummary(criticals, warnings, issues) {
    if (criticals.length > 0) {
      return `存储系统发现 ${criticals.length} 个严重问题，需要立即处理`;
    } else if (warnings.length > 0) {
      return `存储系统发现 ${warnings.length} 个警告问题，建议近期处理`;
    } else if (issues.length > 0) {
      return `存储系统发现 ${issues.length} 个一般问题，可安排时间处理`;
    } else {
      return '存储系统运行状态良好，未发现异常问题';
    }
  }

  /**
   * 建议下次检查间隔
   */
  suggestNextCheckInterval(diagnosis) {
    if (diagnosis.criticals.length > 0) {
      return '30分钟'; // 严重问题需要频繁检查
    } else if (diagnosis.warnings.length > 0) {
      return '2小时'; // 警告问题适中频率检查
    } else {
      return '12小时'; // 正常状态定期检查
    }
  }

  /**
   * 估算磁盘满盈时间
   */
  estimateTimeToFull(availableGB, nodeIP) {
    // 简化估算，实际应该基于历史数据增长趋势
    if (availableGB < 1) return '立即';
    if (availableGB < 5) return '1-2小时';
    if (availableGB < 10) return '4-8小时';
    return '1-2天';
  }

  /**
   * 检查存算分离架构下的存储空间放大情况
   * 分析 Shared-Data 模式下对象存储与本地缓存的空间使用情况
   */
  async analyzeStorageAmplification(
    connection,
    includeDetails = true,
    databaseName = null,
    tableName = null,
  ) {
    // 参数预处理：自动拆分 "database.table" 格式
    if (tableName && tableName.includes('.') && !databaseName) {
      const parts = tableName.split('.');
      if (parts.length === 2) {
        console.log(
          `🔧 检测到表名包含数据库前缀: "${tableName}"，自动拆分为 database="${parts[0]}", table="${parts[1]}"`,
        );
        databaseName = parts[0];
        tableName = parts[1];
      }
    }

    // 如果 databaseName 包含点号，可能是格式错误
    if (databaseName && databaseName.includes('.') && !tableName) {
      const parts = databaseName.split('.');
      if (parts.length === 2) {
        console.log(
          `🔧 检测到 database_name 包含表名: "${databaseName}"，自动拆分为 database="${parts[0]}", table="${parts[1]}"`,
        );
        tableName = parts[1];
        databaseName = parts[0];
      }
    }

    console.log('🔍 analyzeStorageAmplification 参数:', {
      databaseName,
      tableName,
      includeDetails,
    });

    try {
      const startTime = new Date();
      const analysis = {
        status: 'completed',
        timestamp: new Date().toISOString(),
        architecture_type: null,
        filter: {
          database: databaseName,
          table: tableName,
        },
        storage_amplification: {},
        object_storage_analysis: {},
        recommendations: [],
        issues: [],
      };

      // 1. 检测架构类型（存算一体 vs 存算分离）
      const architectureInfo = await detectArchitectureType(connection);
      analysis.architecture_type = architectureInfo.type;

      if (architectureInfo.type !== 'shared_data') {
        analysis.status = 'not_applicable';
        analysis.message =
          '当前集群为存算一体架构，不适用于存算分离的存储放大分析';
        analysis.architecture_details = architectureInfo;
        return analysis;
      }

      // 2. 收集存储相关数据
      const storageData = await this.collectSharedDataStorageInfo(
        connection,
        databaseName,
        tableName,
      );

      // 3. 分析存储放大率
      const amplificationAnalysis =
        this.calculateStorageAmplification(storageData);
      analysis.storage_amplification = amplificationAnalysis;

      // 4. 分析对象存储使用情况
      const objectStorageAnalysis = this.analyzeObjectStorageUsage(storageData);
      analysis.object_storage_analysis = objectStorageAnalysis;

      // 5. 诊断问题
      const issues = this.diagnoseAmplificationIssues(amplificationAnalysis);
      analysis.issues = issues;

      // 6. 生成优化建议
      const recommendations = this.generateAmplificationRecommendations(issues);
      analysis.recommendations = recommendations;

      // 8. 包含详细数据
      if (includeDetails) {
        analysis.raw_data = storageData;
        analysis.architecture_details = architectureInfo;
      }

      const endTime = new Date();
      analysis.analysis_duration_ms = endTime - startTime;

      return analysis;
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 收集存算分离架构的存储信息
   */
  async collectSharedDataStorageInfo(
    connection,
    databaseName = null,
    tableName = null,
  ) {
    const data = {
      compute_nodes: [],
      storage_volumes: [],
      table_storage: [],
    };

    try {
      // 1. Compute Nodes 信息
      const [computeNodes] = await connection.query('SHOW COMPUTE NODES;');
      data.compute_nodes = computeNodes;

      // 2. Storage Volumes 信息 (对象存储)
      try {
        const [volumes] = await connection.query('SHOW STORAGE VOLUMES;');
        data.storage_volumes = volumes;
      } catch (error) {
        console.error('获取 Storage Volumes 失败:', error.message);
      }

      // 3. 分区级别存储统计 (用于精确计算存储放大)
      try {
        // 构建 WHERE 条件
        let whereClause =
          "DB_NAME NOT IN ('information_schema', '_statistics_')";
        const queryParams = [];

        if (databaseName) {
          whereClause += ' AND DB_NAME = ?';
          queryParams.push(databaseName);
        }

        if (tableName) {
          whereClause += ' AND TABLE_NAME = ?';
          queryParams.push(tableName);
        }

        const query = `
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
        `;

        const [partitions] =
          queryParams.length > 0
            ? await connection.query(query, queryParams)
            : await connection.query(query);

        data.partition_storage = partitions;
        console.log(
          `查询到 ${partitions?.length || 0} 个分区，过滤条件: database=${databaseName}, table=${tableName}`,
        );
      } catch (error) {
        console.error('获取分区存储信息失败:', error.message);
        // 如果 partitions_meta 不可用，回退到 tables_config
        // try {
        //   // 构建 WHERE 条件
        //   let whereClause = "DB_NAME NOT IN ('information_schema', '_statistics_')";
        //   const queryParams = [];

        //   if (databaseName) {
        //     whereClause += " AND DB_NAME = ?";
        //     queryParams.push(databaseName);
        //   }

        //   if (tableName) {
        //     whereClause += " AND TABLE_NAME = ?";
        //     queryParams.push(tableName);
        //   }

        //   const query = `
        //     SELECT
        //       DB_NAME,
        //       TABLE_NAME,
        //       DATA_SIZE,
        //       INDEX_SIZE,
        //       ROW_COUNT
        //     FROM information_schema.tables_config
        //     WHERE ${whereClause}
        //     ORDER BY DATA_SIZE DESC
        //     LIMIT 100;
        //   `;

        //   const [tables] = queryParams.length > 0
        //     ? await connection.query(query, queryParams)
        //     : await connection.query(query);
        //   data.table_storage = tables;
        //   data.use_legacy_method = true;
        // } catch (fallbackError) {
        //   console.error('获取表存储信息也失败:', fallbackError.message);
        // }
      }
    } catch (error) {
      console.error('收集存储数据失败:', error.message);
    }

    return data;
  }

  /**
   * 计算存储放大率
   * 优先使用 partitions_meta 的 data_size 和 storage_size 精确计算
   */
  calculateStorageAmplification(storageData) {
    const result = {
      total_data_size_gb: 0, // 用户数据大小 (data_size)
      total_storage_size_gb: 0, // 对象存储占用 (storage_size)
      amplification_ratio: 0,
      calculation_method: 'unknown',
      by_table: [],
      by_partition: [],
    };

    try {
      let totalDataSizeBytes = 0; // 用户数据大小
      let totalStorageSizeBytes = 0; // 对象存储实际占用

      console.log('计算存储放大率，数据源:', {
        partition_storage_count: storageData.partition_storage?.length || 0,
        table_storage_count: storageData.table_storage?.length || 0,
        use_legacy_method: storageData.use_legacy_method,
      });

      // 优先使用 partitions_meta 的精确数据
      if (
        storageData.partition_storage &&
        storageData.partition_storage.length > 0
      ) {
        result.calculation_method = 'partitions_meta';
        console.log('使用 partitions_meta 方法计算');

        // 按表聚合统计
        const tableStats = new Map();

        for (const partition of storageData.partition_storage) {
          const dataSize = parseStorageSize(partition.DATA_SIZE); // 用户数据大小
          const storageSize = parseStorageSize(partition.STORAGE_SIZE); // 对象存储占用

          totalDataSizeBytes += dataSize * 1024 ** 3;
          totalStorageSizeBytes += storageSize * 1024 ** 3;

          // 记录每个分区的详细信息
          result.by_partition.push({
            database: partition.DB_NAME,
            table: partition.TABLE_NAME,
            partition: partition.PARTITION_NAME,
            data_size_gb: dataSize.toFixed(2),
            storage_size_gb: storageSize.toFixed(2),
            partition_amplification:
              storageSize > 0 ? (storageSize / dataSize).toFixed(2) : 0,
          });

          // 按表聚合
          const tableKey = `${partition.DB_NAME}.${partition.TABLE_NAME}`;
          if (!tableStats.has(tableKey)) {
            tableStats.set(tableKey, {
              database: partition.DB_NAME,
              table: partition.TABLE_NAME,
              data_size: 0,
              storage_size: 0,
              partition_count: 0,
            });
          }

          const tableStat = tableStats.get(tableKey);
          tableStat.data_size += dataSize;
          tableStat.storage_size += storageSize;
          tableStat.partition_count += 1;
        }

        // 生成表级统计
        for (const stat of tableStats.values()) {
          result.by_table.push({
            database: stat.database,
            table: stat.table,
            data_size_gb: stat.data_size.toFixed(2),
            storage_size_gb: stat.storage_size.toFixed(2),
            table_amplification:
              stat.data_size > 0
                ? (stat.storage_size / stat.data_size).toFixed(2)
                : 0,
            partition_count: stat.partition_count,
          });
        }
      } else if (
        storageData.table_storage &&
        storageData.table_storage.length > 0
      ) {
        // 回退到旧方法：使用 tables_config
        result.calculation_method = 'tables_config (legacy)';
        console.log('使用 tables_config (legacy) 方法计算');

        for (const table of storageData.table_storage) {
          const dataSize = parseStorageSize(table.DATA_SIZE);
          const indexSize = parseStorageSize(table.INDEX_SIZE);
          const logicalSize = dataSize + indexSize;

          totalDataSizeBytes += logicalSize * 1024 ** 3;

          result.by_table.push({
            database: table.TABLE_SCHEMA,
            table: table.TABLE_NAME,
            data_size_gb: logicalSize.toFixed(2),
            row_count: table.ROW_COUNT,
          });
        }

        // 使用 Compute Nodes 的总使用量作为物理存储
        for (const node of storageData.compute_nodes) {
          if (node.DataUsedCapacity) {
            totalStorageSizeBytes +=
              parseStorageSize(node.DataUsedCapacity) * 1024 ** 3;
          }
        }
      } else {
        // 没有可用数据
        result.calculation_method = 'no_data';
        console.warn('没有找到分区或表的存储数据，无法计算放大率');
      }

      result.total_data_size_gb = (totalDataSizeBytes / 1024 ** 3).toFixed(2);
      result.total_storage_size_gb = (
        totalStorageSizeBytes /
        1024 ** 3
      ).toFixed(2);

      // 计算放大率
      if (totalDataSizeBytes > 0) {
        result.amplification_ratio = (
          totalStorageSizeBytes / totalDataSizeBytes
        ).toFixed(2);
      }
    } catch (error) {
      console.error('计算存储放大率失败:', error.message);
    }

    return result;
  }

  /**
   * 分析对象存储使用情况
   */
  analyzeObjectStorageUsage(storageData) {
    const analysis = {
      storage_volumes: [],
      total_volume_count: 0,
      primary_volume: null,
    };

    try {
      for (const volume of storageData.storage_volumes) {
        const volumeInfo = {
          name: volume.Name,
          type: volume.Type,
          is_default: volume.IsDefault === 'true',
          location: volume.Locations,
          enabled: volume.Enabled === 'true',
        };

        analysis.storage_volumes.push(volumeInfo);

        if (volumeInfo.is_default) {
          analysis.primary_volume = volumeInfo;
        }
      }

      analysis.total_volume_count = analysis.storage_volumes.length;
    } catch (error) {
      console.error('分析对象存储失败:', error.message);
    }

    return analysis;
  }

  /**
   * 诊断存储放大问题
   */
  diagnoseAmplificationIssues(amplification) {
    const issues = [];

    // 检查存储放大率
    const ampRatio = parseFloat(amplification.amplification_ratio);
    if (ampRatio > 2.0) {
      issues.push({
        severity: 'critical',
        category: 'storage_amplification',
        message: `存储放大率过高: ${ampRatio}x，物理存储是逻辑数据的 ${ampRatio} 倍`,
        impact: '大量浪费对象存储空间，显著增加存储成本',
        current_value: ampRatio,
        threshold: 2.0,
      });
    } else if (ampRatio > 1.5) {
      issues.push({
        severity: 'warning',
        category: 'storage_amplification',
        message: `存储放大率偏高: ${ampRatio}x`,
        impact: '存储空间利用率不理想，建议优化',
        current_value: ampRatio,
        threshold: 1.5,
      });
    }

    return issues;
  }

  /**
   * 生成存储放大优化建议
   */
  generateAmplificationRecommendations(issues) {
    const recommendations = [];

    for (const issue of issues) {
      if (issue.category === 'storage_amplification') {
        if (issue.severity === 'critical') {
          recommendations.push({
            priority: 'HIGH',
            category: 'storage_optimization',
            title: '紧急处理存储放大问题',
            description: '当前存储放大率异常高，需要立即优化以降低存储成本',
            actions: [
              '执行 VACUUM 操作清理已删除的数据和过期快照',
              '检查是否有大量小文件，考虑手动触发 Compaction',
              '检查表的 Bucket 数量配置是否合理，过多 Bucket 会增加元数据开销',
              '审查数据保留策略，及时清理不需要的历史数据',
              '检查是否开启了不必要的快照或备份',
            ],
            expected_improvement: '存储放大率降低到 1.5x 以下',
          });
        } else {
          recommendations.push({
            priority: 'MEDIUM',
            category: 'storage_optimization',
            title: '优化存储空间使用',
            description: '存储放大率偏高，建议进行定期优化',
            actions: [
              '定期执行 Compaction 以合并小文件',
              '审查数据保留周期，清理过期数据',
              '检查 Bucket 数量是否合理',
            ],
            expected_improvement: '存储放大率降低到 1.3x 以下',
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * 格式化存储放大分析报告
   */
  formatStorageAmplificationReport(analysis) {
    if (analysis.status === 'not_applicable') {
      return `ℹ️  ${analysis.message}\n\n架构类型: ${analysis.architecture_details?.description || '未知'}`;
    }

    if (analysis.status === 'error') {
      return `❌ 分析失败: ${analysis.error}`;
    }

    let report = '📊 存算分离架构 - 存储空间放大分析\n';
    report += '========================================\n\n';

    // 显示过滤信息（如果有）
    if (
      analysis.filter &&
      (analysis.filter.database || analysis.filter.table)
    ) {
      report += '🎯 **分析范围**:\n';
      if (analysis.filter.database) {
        report += `   数据库: ${analysis.filter.database}\n`;
      }
      if (analysis.filter.table) {
        report += `   表: ${analysis.filter.table}\n`;
      }
      report += '\n';
    }

    // 架构信息
    report += `🏗️  **集群架构**: ${analysis.architecture_type === 'shared_data' ? '存算分离 (Shared-Data)' : '存算一体'}\n`;
    if (analysis.architecture_details?.compute_nodes_count) {
      report += `   Compute Nodes: ${analysis.architecture_details.compute_nodes_count} 个\n`;
    }
    report += '\n';

    // 存储放大概览
    const amp = analysis.storage_amplification;

    // 检查是否有数据
    if (amp.calculation_method === 'no_data') {
      report += '⚠️  **无法计算存储放大率**:\n';
      report += '   未找到匹配的分区或表数据\n';
      if (
        analysis.filter &&
        (analysis.filter.database || analysis.filter.table)
      ) {
        report += '   可能的原因:\n';
        report += '   • 指定的数据库或表不存在\n';
        report += '   • 表名或数据库名拼写错误\n';
        report += '   • 当前用户没有查看该表的权限\n';
      } else {
        report += '   可能的原因:\n';
        report += '   • information_schema.partitions_meta 表不可用\n';
        report += '   • 集群中没有表数据\n';
      }
      return report;
    }

    const ampRatio = parseFloat(amp.amplification_ratio);
    const ampEmoji = ampRatio > 2.0 ? '🔴' : ampRatio > 1.5 ? '🟡' : '🟢';

    report += '📦 **存储空间统计**:\n';
    report += `   计算方法: ${amp.calculation_method}\n`;
    report += `   用户数据大小: ${amp.total_data_size_gb} GB (data_size)\n`;
    report += `   对象存储占用: ${amp.total_storage_size_gb} GB (storage_size)\n`;
    report += `   ${ampEmoji} **存储放大率**: ${amp.amplification_ratio}x\n\n`;

    // 表级放大率统计（显示前5个放大率最高的表）
    if (amp.by_table && amp.by_table.length > 0) {
      report += '📋 **放大率最高的表** (Top 5):\n';
      const sortedTables = [...amp.by_table]
        .filter((t) => t.table_amplification)
        .sort(
          (a, b) =>
            parseFloat(b.table_amplification) -
            parseFloat(a.table_amplification),
        )
        .slice(0, 5);

      sortedTables.forEach((table, index) => {
        const tableAmpRatio = parseFloat(table.table_amplification);
        const tableAmpEmoji =
          tableAmpRatio > 2.0 ? '🔴' : tableAmpRatio > 1.5 ? '🟡' : '🟢';
        report += `  ${index + 1}. ${tableAmpEmoji} ${table.database}.${table.table}\n`;
        report += `     数据: ${table.data_size_gb} GB → 存储: ${table.storage_size_gb} GB (${table.table_amplification}x)\n`;
        if (table.partition_count) {
          report += `     分区数: ${table.partition_count}\n`;
        }
      });
      report += '\n';
    }

    // 问题汇总
    if (analysis.issues.length > 0) {
      report += '⚠️  **发现的问题**:\n';
      const criticals = analysis.issues.filter(
        (i) => i.severity === 'critical',
      );
      const warnings = analysis.issues.filter((i) => i.severity === 'warning');

      if (criticals.length > 0) {
        report += '  🔴 严重问题:\n';
        criticals.forEach((issue) => {
          report += `     • ${issue.message}\n`;
          report += `       影响: ${issue.impact}\n`;
        });
      }

      if (warnings.length > 0) {
        report += '  🟡 警告:\n';
        warnings.forEach((issue) => {
          report += `     • ${issue.message}\n`;
        });
      }
      report += '\n';
    }

    // 优化建议
    if (analysis.recommendations.length > 0) {
      report += '💡 **优化建议** (按优先级排序):\n';
      const sortedRecs = analysis.recommendations.sort((a, b) => {
        const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priority[a.priority] - priority[b.priority];
      });

      sortedRecs.slice(0, 3).forEach((rec, index) => {
        const priorityEmoji =
          rec.priority === 'HIGH'
            ? '🔴'
            : rec.priority === 'MEDIUM'
              ? '🟡'
              : '🔵';
        report += `  ${index + 1}. ${priorityEmoji} [${rec.priority}] ${rec.title}\n`;
        report += `     ${rec.description}\n`;
      });

      if (sortedRecs.length > 3) {
        report += `  ... 还有 ${sortedRecs.length - 3} 个建议，请查看详细 JSON 输出\n`;
      }
    }

    report += '\n⏱️  分析耗时: ' + analysis.analysis_duration_ms + 'ms';
    report += '\n📋 详细数据请查看 JSON 输出部分';

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   */
  getToolHandlers() {
    return {
      analyze_storage_amplification: async (args, context) => {
        console.log(
          '🎯 Tool handler 接收到的参数:',
          JSON.stringify(args, null, 2),
        );

        const connection = context.connection;
        const result = await this.analyzeStorageAmplification(
          connection,
          args.include_details !== false,
          args.database_name || null,
          args.table_name || null,
        );

        const report = this.formatStorageAmplificationReport(result);

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
   * 获取此专家提供的 MCP 工具定义
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
- ✅ 分析存储成本为何过高
- ✅ 发现哪些表的存储效率低
- ✅ 示例问题: "为什么这个表才 100GB 数据，却占用了 300GB 对象存储？"

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
              description:
                '数据库名称（仅数据库名，不含表名）。例如：分析 "db1.table1" 时，此参数应为 "db1"',
            },
            table_name: {
              type: 'string',
              description:
                '表名称（仅表名，不含数据库前缀）。例如：分析 "db1.table1" 时，此参数应为 "table1"。注意：如果传递了此参数，必须同时传递 database_name',
            },
            include_details: {
              type: 'boolean',
              description: '是否包含详细的分区级数据和原始指标',
              default: true,
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksStorageExpert };
