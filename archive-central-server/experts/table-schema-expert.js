/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 表结构专家模块
 * 负责：建表规范检查、分区设计、分桶策略、索引优化等
 */

/* eslint-disable no-undef */

class StarRocksTableSchemaExpert {
  constructor() {
    this.name = 'table-schema';
    this.version = '1.0.0';
    this.description = 'StarRocks 表结构专家 - 检查建表规范、分区分桶设计';

    // 表结构规则库
    this.rules = {
      // 分桶规则
      bucket: {
        min_buckets: 1,
        max_buckets: 1024,
        recommended_data_per_bucket_gb: 1, // 每个 bucket 1GB 数据
        max_data_per_bucket_gb: 10, // 每个 bucket 最大 10GB
      },

      // 分区规则
      partition: {
        max_partitions: 4096,
        recommended_partition_size_gb: 100,
        max_partition_size_gb: 500,
        time_partition_types: ['DATE', 'DATETIME'],
      },

      // 数据类型规则
      data_type: {
        string_max_length_warning: 1048576, // 1MB
        avoid_types: ['CHAR'], // 建议避免使用的类型
        prefer_types: ['VARCHAR', 'STRING'],
      },

      // 索引规则
      index: {
        max_bloom_filter_columns: 10,
        recommended_bitmap_index_cardinality: 1000,
      },
    };

    // 专业术语
    this.terminology = {
      bucket: '分桶，数据分片的基本单位，影响并行度和数据分布',
      partition: '分区，数据的逻辑划分，用于数据管理和查询优化',
      distribution_key: '分桶键，决定数据如何分布到不同的 bucket',
      partition_key: '分区键，决定数据属于哪个分区',
    };
  }

  /**
   * 检查表的分区和分桶设计
   */
  async analyzeTableSchema(connection, tableName, databaseName = null) {
    try {
      // 1. 获取表信息
      const tableInfo = await this.getTableInfo(
        connection,
        tableName,
        databaseName,
      );

      // 2. 分析分区设计
      const partitionAnalysis = await this.analyzePartitionDesign(
        connection,
        tableInfo,
      );

      // 3. 分析分桶设计
      const bucketAnalysis = await this.analyzeBucketDesign(
        connection,
        tableInfo,
      );

      // 4. 生成问题和建议
      const issues = [];
      const recommendations = [];

      // 收集分区问题
      if (partitionAnalysis.issues.length > 0) {
        issues.push(...partitionAnalysis.issues);
      }
      if (partitionAnalysis.recommendations.length > 0) {
        recommendations.push(...partitionAnalysis.recommendations);
      }

      // 收集分桶问题
      if (bucketAnalysis.issues.length > 0) {
        issues.push(...bucketAnalysis.issues);
      }
      if (bucketAnalysis.recommendations.length > 0) {
        recommendations.push(...bucketAnalysis.recommendations);
      }

      // 5. 计算健康分数
      const healthScore = this.calculateSchemaHealthScore(issues);

      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        table_name: tableName,
        database_name: databaseName || tableInfo.database,
        health_score: healthScore,
        table_info: {
          engine: tableInfo.engine,
          table_type: tableInfo.table_type,
          partition_type: tableInfo.partition_type,
          distribution_type: tableInfo.distribution_type,
        },
        partition_analysis: partitionAnalysis,
        bucket_analysis: bucketAnalysis,
        issues: issues,
        recommendations: recommendations,
      };
    } catch (error) {
      throw new Error(`表结构分析失败: ${error.message}`);
    }
  }

  /**
   * 获取表的基本信息
   */
  async getTableInfo(connection, tableName, databaseName) {
    try {
      // 如果没有指定数据库，使用当前数据库
      let dbName = databaseName;
      if (!dbName) {
        const [currentDb] = await connection.query('SELECT DATABASE() as db');
        dbName = currentDb[0].db;
      }

      // 获取表的 CREATE TABLE 语句
      const [createTableResult] = await connection.query(
        `SHOW CREATE TABLE ${dbName}.${tableName}`,
      );

      if (!createTableResult || createTableResult.length === 0) {
        throw new Error(`表 ${dbName}.${tableName} 不存在`);
      }

      const createTableSql = createTableResult[0]['Create Table'];

      // 解析建表语句
      const tableInfo = this.parseCreateTableStatement(createTableSql);
      tableInfo.database = dbName;
      tableInfo.table = tableName;

      return tableInfo;
    } catch (error) {
      throw new Error(`获取表信息失败: ${error.message}`);
    }
  }

  /**
   * 解析 CREATE TABLE 语句
   */
  parseCreateTableStatement(sql) {
    const info = {
      engine: 'OLAP',
      table_type: 'DUPLICATE',
      partition_type: null,
      partition_key: null,
      distribution_type: 'HASH',
      distribution_key: [],
      buckets: 0,
      properties: {},
    };

    // 解析表类型
    if (sql.includes('DUPLICATE KEY')) {
      info.table_type = 'DUPLICATE';
    } else if (sql.includes('AGGREGATE KEY')) {
      info.table_type = 'AGGREGATE';
    } else if (sql.includes('UNIQUE KEY')) {
      info.table_type = 'UNIQUE';
    } else if (sql.includes('PRIMARY KEY')) {
      info.table_type = 'PRIMARY';
    }

    // 解析分区
    const partitionMatch = sql.match(
      /PARTITION BY (RANGE|LIST)\s*\(([^)]+)\)/i,
    );
    if (partitionMatch) {
      info.partition_type = partitionMatch[1].toUpperCase();
      info.partition_key = partitionMatch[2].trim().replace(/`/g, '');
    }

    // 解析分桶
    const distributionMatch = sql.match(
      /DISTRIBUTED BY (HASH|RANDOM)\s*\(([^)]*)\)\s*BUCKETS\s*(\d+)/i,
    );
    if (distributionMatch) {
      info.distribution_type = distributionMatch[1].toUpperCase();
      if (distributionMatch[2]) {
        info.distribution_key = distributionMatch[2]
          .split(',')
          .map((k) => k.trim().replace(/`/g, ''));
      }
      info.buckets = parseInt(distributionMatch[3]);
    }

    // 解析 PROPERTIES
    const propertiesMatch = sql.match(
      /PROPERTIES\s*\(([\s\S]*?)\)(?:\s*;|\s*$)/i,
    );
    if (propertiesMatch) {
      const propsStr = propertiesMatch[1];
      const propPairs = propsStr.match(/"([^"]+)"\s*=\s*"([^"]*)"/g);
      if (propPairs) {
        propPairs.forEach((pair) => {
          const match = pair.match(/"([^"]+)"\s*=\s*"([^"]*)"/);
          if (match) {
            info.properties[match[1]] = match[2];
          }
        });
      }
    }

    return info;
  }

  /**
   * 分析分区设计
   */
  async analyzePartitionDesign(connection, tableInfo) {
    const analysis = {
      has_partition: !!tableInfo.partition_type,
      partition_type: tableInfo.partition_type,
      partition_key: tableInfo.partition_key,
      partition_count: 0,
      partition_stats: {
        total_size_bytes: 0,
        avg_size_bytes: 0,
        min_size_bytes: 0,
        max_size_bytes: 0,
        small_partitions: [],
        large_partitions: [],
      },
      issues: [],
      recommendations: [],
    };

    // 如果表没有分区，直接返回告警
    if (!tableInfo.partition_type) {
      analysis.issues.push({
        severity: 'WARNING',
        category: 'partition',
        title: '表未分区',
        description:
          '表没有配置分区策略，建议根据数据特征添加分区以优化查询性能和数据管理',
      });
      analysis.recommendations.push({
        priority: 'HIGH',
        category: 'partition',
        title: '建议添加分区',
        description:
          '如果表包含时间字段，建议使用 RANGE 分区按时间分区（如按天、周、月）',
        suggestion: 'ALTER TABLE xxx PARTITION BY RANGE(date_column) ...',
      });
      return analysis;
    }

    try {
      // 从 information_schema.partitions_meta 获取分区详细信息
      const [partitionsMeta] = await connection.query(`
        SELECT
          PARTITION_NAME,
          DATA_LENGTH,
          INDEX_LENGTH,
          DATA_LENGTH + INDEX_LENGTH as TOTAL_SIZE
        FROM information_schema.partitions_meta
        WHERE TABLE_SCHEMA = '${tableInfo.database}'
          AND TABLE_NAME = '${tableInfo.table}'
        ORDER BY PARTITION_NAME
      `);

      analysis.partition_count = partitionsMeta.length;

      if (analysis.partition_count === 0) {
        analysis.issues.push({
          severity: 'WARNING',
          category: 'partition',
          title: '表未创建分区',
          description: '表配置了分区策略但未创建任何分区',
        });
        return analysis;
      }

      // 计算分区统计信息
      const partitionSizes = partitionsMeta.map((p) =>
        parseInt(p.TOTAL_SIZE || 0),
      );
      analysis.partition_stats.total_size_bytes = partitionSizes.reduce(
        (sum, size) => sum + size,
        0,
      );
      analysis.partition_stats.avg_size_bytes = Math.floor(
        analysis.partition_stats.total_size_bytes / analysis.partition_count,
      );
      analysis.partition_stats.min_size_bytes = Math.min(...partitionSizes);
      analysis.partition_stats.max_size_bytes = Math.max(...partitionSizes);

      // 转换为 GB 方便阅读
      const avgSizeGB = analysis.partition_stats.avg_size_bytes / 1024 ** 3;
      const minSizeGB = analysis.partition_stats.min_size_bytes / 1024 ** 3;
      const maxSizeGB = analysis.partition_stats.max_size_bytes / 1024 ** 3;

      analysis.partition_stats.avg_size_gb = avgSizeGB.toFixed(2);
      analysis.partition_stats.min_size_gb = minSizeGB.toFixed(2);
      analysis.partition_stats.max_size_gb = maxSizeGB.toFixed(2);
      analysis.partition_stats.total_size_gb = (
        analysis.partition_stats.total_size_bytes /
        1024 ** 3
      ).toFixed(2);

      // 检查分区数量
      if (analysis.partition_count > this.rules.partition.max_partitions) {
        analysis.issues.push({
          severity: 'WARNING',
          category: 'partition',
          title: '分区数量过多',
          description: `分区数量 ${analysis.partition_count} 超过建议值 ${this.rules.partition.max_partitions}`,
        });
        analysis.recommendations.push({
          priority: 'MEDIUM',
          category: 'partition',
          title: '减少分区数量',
          description: '考虑使用更大的分区粒度，或清理历史分区',
        });
      }

      // 检查小分区（< 100GB）
      const smallPartitionThresholdGB =
        this.rules.partition.recommended_partition_size_gb;
      const smallPartitions = partitionsMeta.filter((p) => {
        const sizeGB = parseInt(p.TOTAL_SIZE || 0) / 1024 ** 3;
        return sizeGB < smallPartitionThresholdGB && sizeGB > 0.01; // 忽略空分区
      });

      if (smallPartitions.length > 0) {
        analysis.partition_stats.small_partitions = smallPartitions.map(
          (p) => ({
            name: p.PARTITION_NAME,
            size_gb: (parseInt(p.TOTAL_SIZE) / 1024 ** 3).toFixed(2),
          }),
        );

        const smallPartitionRatio =
          smallPartitions.length / analysis.partition_count;

        if (smallPartitionRatio > 0.5) {
          // 超过一半的分区都小于阈值
          analysis.issues.push({
            severity: 'WARNING',
            category: 'partition',
            title: '分区粒度过细',
            description: `${smallPartitions.length}/${analysis.partition_count} 个分区小于 ${smallPartitionThresholdGB}GB，平均 ${avgSizeGB.toFixed(2)}GB`,
          });

          // 根据当前分区策略提供具体建议
          const timeUnit = tableInfo.properties['dynamic_partition.time_unit'];

          if (timeUnit === 'DAY') {
            analysis.recommendations.push({
              priority: 'HIGH',
              category: 'partition',
              title: '调整分区粒度为按周或按月',
              description: '当前按天分区导致大量小分区，增加元数据管理开销',
              suggestion:
                'ALTER TABLE xxx SET ("dynamic_partition.time_unit" = "WEEK") 或 "MONTH"',
            });
          } else if (timeUnit === 'HOUR') {
            analysis.recommendations.push({
              priority: 'HIGH',
              category: 'partition',
              title: '调整分区粒度为按天',
              description: '当前按小时分区过于细粒度',
              suggestion:
                'ALTER TABLE xxx SET ("dynamic_partition.time_unit" = "DAY")',
            });
          } else {
            analysis.recommendations.push({
              priority: 'MEDIUM',
              category: 'partition',
              title: '增加分区粒度',
              description: '考虑使用更大的分区粒度以减少小分区数量',
            });
          }
        }
      }

      // 检查大分区（> 500GB）
      const largePartitionThresholdGB =
        this.rules.partition.max_partition_size_gb;
      const largePartitions = partitionsMeta.filter((p) => {
        const sizeGB = parseInt(p.TOTAL_SIZE || 0) / 1024 ** 3;
        return sizeGB > largePartitionThresholdGB;
      });

      if (largePartitions.length > 0) {
        analysis.partition_stats.large_partitions = largePartitions.map(
          (p) => ({
            name: p.PARTITION_NAME,
            size_gb: (parseInt(p.TOTAL_SIZE) / 1024 ** 3).toFixed(2),
          }),
        );

        analysis.issues.push({
          severity: 'WARNING',
          category: 'partition',
          title: '存在大分区',
          description: `${largePartitions.length} 个分区超过 ${largePartitionThresholdGB}GB，最大 ${maxSizeGB.toFixed(2)}GB`,
        });

        // 根据当前分区策略提供具体建议
        const timeUnit = tableInfo.properties['dynamic_partition.time_unit'];

        if (timeUnit === 'MONTH') {
          analysis.recommendations.push({
            priority: 'HIGH',
            category: 'partition',
            title: '调整分区粒度为按周或按天',
            description: '当前按月分区导致单个分区过大，影响查询性能',
            suggestion:
              'ALTER TABLE xxx SET ("dynamic_partition.time_unit" = "WEEK") 或 "DAY"',
          });
        } else if (timeUnit === 'WEEK') {
          analysis.recommendations.push({
            priority: 'HIGH',
            category: 'partition',
            title: '调整分区粒度为按天',
            description: '当前按周分区导致单个分区过大',
            suggestion:
              'ALTER TABLE xxx SET ("dynamic_partition.time_unit" = "DAY")',
          });
        } else {
          analysis.recommendations.push({
            priority: 'MEDIUM',
            category: 'partition',
            title: '减少分区粒度',
            description: '考虑使用更小的分区粒度以控制单个分区大小',
          });
        }
      }

      // 检查动态分区配置
      if (tableInfo.properties['dynamic_partition.enable'] === 'true') {
        analysis.dynamic_partition = {
          enabled: true,
          time_unit: tableInfo.properties['dynamic_partition.time_unit'],
          start: tableInfo.properties['dynamic_partition.start'],
          end: tableInfo.properties['dynamic_partition.end'],
        };
      } else if (tableInfo.partition_type === 'RANGE') {
        analysis.recommendations.push({
          priority: 'MEDIUM',
          category: 'partition',
          title: '考虑启用动态分区',
          description: 'RANGE 分区表建议启用动态分区自动管理',
          suggestion:
            'ALTER TABLE xxx SET ("dynamic_partition.enable" = "true", "dynamic_partition.time_unit" = "DAY", ...)',
        });
      }
    } catch (error) {
      console.error('分析分区设计失败:', error.message);
      analysis.issues.push({
        severity: 'ERROR',
        category: 'partition',
        title: '无法获取分区信息',
        description: error.message,
      });
    }

    return analysis;
  }

  /**
   * 分析分桶设计
   */
  async analyzeBucketDesign(connection, tableInfo) {
    const analysis = {
      distribution_type: tableInfo.distribution_type,
      distribution_key: tableInfo.distribution_key,
      buckets: tableInfo.buckets,
      bucket_stats: {
        avg_data_per_bucket_gb: 0,
        min_data_per_bucket_gb: 0,
        max_data_per_bucket_gb: 0,
        oversized_partitions: [],
        undersized_partitions: [],
      },
      issues: [],
      recommendations: [],
    };

    // 检查分桶数
    if (tableInfo.buckets < this.rules.bucket.min_buckets) {
      analysis.issues.push({
        severity: 'ERROR',
        category: 'bucket',
        title: '分桶数过少',
        description: `分桶数 ${tableInfo.buckets} 小于最小值 ${this.rules.bucket.min_buckets}`,
      });
    } else if (tableInfo.buckets > this.rules.bucket.max_buckets) {
      analysis.issues.push({
        severity: 'WARNING',
        category: 'bucket',
        title: '分桶数过多',
        description: `分桶数 ${tableInfo.buckets} 超过建议最大值 ${this.rules.bucket.max_buckets}`,
      });
    }

    // 检查分桶键
    if (tableInfo.distribution_type === 'HASH') {
      if (
        !tableInfo.distribution_key ||
        tableInfo.distribution_key.length === 0
      ) {
        analysis.issues.push({
          severity: 'ERROR',
          category: 'bucket',
          title: '缺少分桶键',
          description: 'HASH 分桶必须指定分桶键',
        });
      } else {
        // 分桶键建议
        analysis.recommendations.push({
          priority: 'LOW',
          category: 'bucket',
          title: '检查分桶键选择',
          description: '分桶键应选择高基数列，避免数据倾斜',
          suggestion: `当前分桶键: ${tableInfo.distribution_key.join(', ')}`,
        });
      }
    }

    // 从 information_schema.partitions_meta 获取分区数据量并计算每个桶的数据量
    try {
      const [partitionsMeta] = await connection.query(`
        SELECT
          PARTITION_NAME,
          DATA_LENGTH + INDEX_LENGTH as TOTAL_SIZE
        FROM information_schema.partitions_meta
        WHERE TABLE_SCHEMA = '${tableInfo.database}'
          AND TABLE_NAME = '${tableInfo.table}'
        ORDER BY PARTITION_NAME
      `);

      if (partitionsMeta && partitionsMeta.length > 0) {
        const bucketCount = tableInfo.buckets;
        const dataPerBucketList = [];
        const oversizedPartitions = [];
        const undersizedPartitions = [];

        // 分析每个分区的每桶数据量
        for (const partition of partitionsMeta) {
          const totalSizeBytes = parseInt(partition.TOTAL_SIZE || 0);
          const dataPerBucketBytes = totalSizeBytes / bucketCount;
          const dataPerBucketGB = dataPerBucketBytes / 1024 ** 3;
          const dataPerBucketMB = dataPerBucketBytes / 1024 ** 2;

          dataPerBucketList.push(dataPerBucketGB);

          // 检查是否超过 5GB
          if (dataPerBucketGB > 5) {
            oversizedPartitions.push({
              partition_name: partition.PARTITION_NAME,
              total_size_gb: (totalSizeBytes / 1024 ** 3).toFixed(2),
              data_per_bucket_gb: dataPerBucketGB.toFixed(2),
            });
          }

          // 检查是否小于 500MB (0.5GB)
          if (dataPerBucketMB < 500 && totalSizeBytes > 0) {
            undersizedPartitions.push({
              partition_name: partition.PARTITION_NAME,
              total_size_gb: (totalSizeBytes / 1024 ** 3).toFixed(2),
              data_per_bucket_mb: dataPerBucketMB.toFixed(2),
            });
          }
        }

        // 计算统计信息
        if (dataPerBucketList.length > 0) {
          const avgDataPerBucket =
            dataPerBucketList.reduce((sum, val) => sum + val, 0) /
            dataPerBucketList.length;
          const minDataPerBucket = Math.min(...dataPerBucketList);
          const maxDataPerBucket = Math.max(...dataPerBucketList);

          analysis.bucket_stats.avg_data_per_bucket_gb =
            avgDataPerBucket.toFixed(2);
          analysis.bucket_stats.min_data_per_bucket_gb =
            minDataPerBucket.toFixed(2);
          analysis.bucket_stats.max_data_per_bucket_gb =
            maxDataPerBucket.toFixed(2);
        }

        // 检查过大的桶（> 5GB）
        if (oversizedPartitions.length > 0) {
          analysis.bucket_stats.oversized_partitions = oversizedPartitions;

          analysis.issues.push({
            severity: 'WARNING',
            category: 'bucket',
            title: '分桶数过小，单桶数据量过大',
            description: `${oversizedPartitions.length} 个分区的每桶数据量超过 5GB，最大 ${oversizedPartitions[0].data_per_bucket_gb}GB`,
          });

          // 计算建议的分桶数
          const maxDataPerBucket = Math.max(
            ...oversizedPartitions.map((p) => parseFloat(p.data_per_bucket_gb)),
          );
          const suggestedBuckets = Math.ceil(
            (maxDataPerBucket / 1) * bucketCount,
          ); // 目标1GB/bucket

          analysis.recommendations.push({
            priority: 'HIGH',
            category: 'bucket',
            title: '增加分桶数',
            description: `当前分桶数 ${bucketCount} 导致单桶数据量过大，影响查询并行度`,
            suggestion: `建议调整为 ${suggestedBuckets} 个桶，使每桶约 1GB 数据`,
          });
        }

        // 检查过小的桶（< 500MB）
        if (undersizedPartitions.length > 0) {
          analysis.bucket_stats.undersized_partitions = undersizedPartitions;

          const undersizedRatio =
            undersizedPartitions.length / partitionsMeta.length;

          // 如果超过50%的分区每桶数据量都小于500MB，才告警
          if (undersizedRatio > 0.5) {
            analysis.issues.push({
              severity: 'WARNING',
              category: 'bucket',
              title: '分桶数过大，单桶数据量过小',
              description: `${undersizedPartitions.length} 个分区的每桶数据量小于 500MB，造成资源浪费`,
            });

            // 计算建议的分桶数
            const avgDataPerBucketMB =
              parseFloat(analysis.bucket_stats.avg_data_per_bucket_gb) * 1024;
            const suggestedBuckets = Math.max(
              1,
              Math.ceil((bucketCount * avgDataPerBucketMB) / 1024),
            ); // 目标1GB/bucket

            analysis.recommendations.push({
              priority: 'MEDIUM',
              category: 'bucket',
              title: '减少分桶数',
              description: `当前分桶数 ${bucketCount} 过多，导致单桶数据量过小`,
              suggestion: `建议调整为 ${suggestedBuckets} 个桶，使每桶约 1GB 数据`,
            });
          }
        }
      }
    } catch (error) {
      console.error('分析分桶数据量失败:', error.message);
    }

    // 获取表大小估算
    try {
      const [tablets] = await connection.query(
        `SHOW TABLETS FROM ${tableInfo.database}.${tableInfo.table}`,
      );

      if (tablets && tablets.length > 0) {
        const totalTablets = tablets.length;
        const avgTabletsPerBucket = totalTablets / tableInfo.buckets;

        analysis.tablet_info = {
          total_tablets: totalTablets,
          avg_tablets_per_bucket: Math.round(avgTabletsPerBucket * 100) / 100,
        };

        // 检查 tablet 分布
        if (avgTabletsPerBucket > 100) {
          analysis.recommendations.push({
            priority: 'MEDIUM',
            category: 'bucket',
            title: '考虑增加分桶数',
            description: `每个 bucket 平均 ${avgTabletsPerBucket.toFixed(1)} 个 tablet，建议增加分桶数以提高并行度`,
          });
        }
      }
    } catch (error) {
      console.error('获取 tablet 信息失败:', error.message);
    }

    return analysis;
  }

  /**
   * 计算表结构健康分数
   */
  calculateSchemaHealthScore(issues) {
    let score = 100;

    for (const issue of issues) {
      if (issue.severity === 'ERROR') {
        score -= 20;
      } else if (issue.severity === 'CRITICAL') {
        score -= 15;
      } else if (issue.severity === 'WARNING') {
        score -= 10;
      } else if (issue.severity === 'INFO') {
        score -= 5;
      }
    }

    return {
      score: Math.max(0, score),
      level: score >= 80 ? 'HEALTHY' : score >= 60 ? 'WARNING' : 'CRITICAL',
    };
  }

  /**
   * 格式化分析报告
   */
  formatAnalysisReport(result) {
    let report = '📋 StarRocks 表结构分析报告\n';
    report += '========================================\n\n';

    // 基本信息
    report += `📊 **表信息**:\n`;
    report += `   • 数据库: ${result.database_name}\n`;
    report += `   • 表名: ${result.table_name}\n`;
    report += `   • 引擎: ${result.table_info.engine}\n`;
    report += `   • 表类型: ${result.table_info.table_type}\n\n`;

    // 健康分数
    const scoreIcon =
      result.health_score.level === 'HEALTHY'
        ? '✅'
        : result.health_score.level === 'WARNING'
          ? '⚠️'
          : '🔴';
    report += `${scoreIcon} **健康分数**: ${result.health_score.score}/100 (${result.health_score.level})\n\n`;

    // 分区分析
    report += '🗂️  **分区设计**:\n';
    if (result.partition_analysis.has_partition) {
      report += `   • 分区类型: ${result.partition_analysis.partition_type}\n`;
      report += `   • 分区键: ${result.partition_analysis.partition_key}\n`;
      report += `   • 分区数量: ${result.partition_analysis.partition_count}\n`;

      // 分区统计信息
      if (result.partition_analysis.partition_stats.total_size_gb) {
        const stats = result.partition_analysis.partition_stats;
        report += `   • 总数据量: ${stats.total_size_gb} GB\n`;
        report += `   • 平均分区大小: ${stats.avg_size_gb} GB\n`;
        report += `   • 分区大小范围: ${stats.min_size_gb} GB ~ ${stats.max_size_gb} GB\n`;

        if (stats.small_partitions.length > 0) {
          report += `   • 小分区 (<100GB): ${stats.small_partitions.length} 个\n`;
        }
        if (stats.large_partitions.length > 0) {
          report += `   • 大分区 (>500GB): ${stats.large_partitions.length} 个\n`;
        }
      }

      if (result.partition_analysis.dynamic_partition) {
        const dp = result.partition_analysis.dynamic_partition;
        report += `   • 动态分区: 已启用 (${dp.time_unit}, ${dp.start} ~ ${dp.end})\n`;
      }
    } else {
      report += `   • 未分区\n`;
    }
    report += '\n';

    // 分桶分析
    report += '🪣 **分桶设计**:\n';
    report += `   • 分桶类型: ${result.bucket_analysis.distribution_type}\n`;
    if (result.bucket_analysis.distribution_key.length > 0) {
      report += `   • 分桶键: ${result.bucket_analysis.distribution_key.join(', ')}\n`;
    }
    report += `   • 分桶数: ${result.bucket_analysis.buckets}\n`;

    // 分桶数据量统计
    if (result.bucket_analysis.bucket_stats.avg_data_per_bucket_gb) {
      const stats = result.bucket_analysis.bucket_stats;
      report += `   • 平均每桶数据量: ${stats.avg_data_per_bucket_gb} GB\n`;
      report += `   • 每桶数据量范围: ${stats.min_data_per_bucket_gb} GB ~ ${stats.max_data_per_bucket_gb} GB\n`;

      if (stats.oversized_partitions.length > 0) {
        report += `   • ⚠️  过大的桶 (>5GB): ${stats.oversized_partitions.length} 个分区\n`;
      }
      if (stats.undersized_partitions.length > 0) {
        report += `   • ⚠️  过小的桶 (<500MB): ${stats.undersized_partitions.length} 个分区\n`;
      }
    }

    if (result.bucket_analysis.tablet_info) {
      report += `   • Tablet 总数: ${result.bucket_analysis.tablet_info.total_tablets}\n`;
      report += `   • 每桶平均 Tablet: ${result.bucket_analysis.tablet_info.avg_tablets_per_bucket}\n`;
    }
    report += '\n';

    // 问题列表
    if (result.issues.length > 0) {
      report += '⚠️  **发现的问题**:\n';
      result.issues.forEach((issue) => {
        const icon =
          issue.severity === 'ERROR'
            ? '🔴'
            : issue.severity === 'CRITICAL'
              ? '🔴'
              : issue.severity === 'WARNING'
                ? '🟡'
                : 'ℹ️';
        report += `   ${icon} [${issue.severity}] ${issue.title}\n`;
        report += `      ${issue.description}\n`;
      });
      report += '\n';
    }

    // 优化建议
    if (result.recommendations.length > 0) {
      report += '💡 **优化建议**:\n';
      result.recommendations.forEach((rec, index) => {
        report += `   ${index + 1}. [${rec.priority}] ${rec.title}\n`;
        report += `      ${rec.description}\n`;
        if (rec.suggestion) {
          report += `      ${rec.suggestion}\n`;
        }
      });
      report += '\n';
    }

    report += `📅 **分析时间**: ${result.timestamp}\n`;

    return report;
  }

  /**
   * 获取工具处理器
   */
  getToolHandlers() {
    return {
      analyze_table_schema: async (args, context) => {
        console.log('🎯 表结构分析接收参数:', JSON.stringify(args, null, 2));

        const connection = context.connection;
        const tableName = args.table_name;
        const databaseName = args.database_name || null;

        if (!tableName) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ 错误: 缺少必需参数 table_name',
              },
            ],
            isError: true,
          };
        }

        try {
          const result = await this.analyzeTableSchema(
            connection,
            tableName,
            databaseName,
          );
          const report = this.formatAnalysisReport(result);

          return {
            content: [
              {
                type: 'text',
                text: report,
              },
              {
                type: 'text',
                text: '详细数据:\n' + JSON.stringify(result, null, 2),
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
   * 获取工具定义
   */
  getTools() {
    return [
      {
        name: 'analyze_table_schema',
        description: `📋 **表结构分析**

**功能**: 分析 StarRocks 表的分区和分桶设计，提供优化建议。

**分析内容**:
- ✅ 检查表的基本信息（引擎、表类型）
- ✅ 分析分区设计（分区类型、分区键、分区数量）
- ✅ 检查动态分区配置
- ✅ 分析分桶设计（分桶类型、分桶键、分桶数）
- ✅ 检查 Tablet 分布情况
- ✅ 识别设计问题和性能风险
- ✅ 生成优化建议

**检查项**:
- 分区数量是否合理
- 分桶数是否合适
- 分桶键选择是否合理
- 是否启用动态分区
- Tablet 分布是否均衡

**适用场景**:
- 新建表时验证设计
- 排查表性能问题
- 优化现有表结构
- 表结构规范审查

**注意**:
- 需要有表的访问权限
- 分析基于当前表状态`,
        inputSchema: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
              description: '表名',
            },
            database_name: {
              type: 'string',
              description: '数据库名（可选，不指定则使用当前数据库）',
            },
          },
          required: ['table_name'],
        },
      },
    ];
  }
}

export { StarRocksTableSchemaExpert };
