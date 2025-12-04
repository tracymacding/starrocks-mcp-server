/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 事务分析专家模块
 * 负责：事务状态、事务冲突、长事务检测、事务性能分析
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

class StarRocksTransactionExpert {
  constructor() {
    this.name = 'transaction';
    this.version = '1.0.0';
    this.description =
      'StarRocks 事务系统专家 - 负责事务状态、冲突、长事务和性能诊断';

    // Prometheus 配置
    this.prometheusConfig = {
      host: '127.0.0.1',
      port: 9092,
      protocol: 'http',
    };

    // 事务专业知识规则库
    this.rules = {
      // 长事务检测规则
      long_transaction: {
        warning_seconds: 300, // 5分钟
        critical_seconds: 1800, // 30分钟
        emergency_seconds: 3600, // 1小时
      },

      // 事务数量规则
      transaction_count: {
        warning_threshold: 1000, // 运行中事务 > 1000
        critical_threshold: 5000, // 运行中事务 > 5000
      },

      // 事务失败率规则
      failure_rate: {
        warning_threshold: 5, // 失败率 > 5%
        critical_threshold: 10, // 失败率 > 10%
      },

      // 事务冲突规则
      conflict: {
        warning_threshold: 10, // 冲突次数 > 10/min
        critical_threshold: 50, // 冲突次数 > 50/min
      },

      // 事务提交延迟规则
      commit_latency: {
        warning_ms: 1000, // 提交延迟 > 1s
        critical_ms: 5000, // 提交延迟 > 5s
      },
    };

    // 专业术语和解释
    this.terminology = {
      transaction:
        'StarRocks 中的事务，保证数据写入的原子性、一致性、隔离性和持久性',
      long_transaction: '运行时间超过预期的事务，可能导致锁等待和性能问题',
      transaction_conflict:
        '多个事务同时修改相同数据时发生的冲突，需要回滚和重试',
      visible_version: '事务可见版本号，用于 MVCC 机制实现事务隔离',
      prepare_txn: '两阶段提交中的准备阶段事务',
      commit_txn: '已提交的事务',
      abort_txn: '已回滚/中止的事务',
    };
  }

  /**
   * 事务系统综合诊断
   */
  async diagnose(connection, includeDetails = true) {
    try {
      const startTime = new Date();

      // 1. 收集事务相关数据
      const txnData = await this.collectTransactionData(connection);

      // 2. 执行专业诊断分析
      const diagnosis = this.performTransactionDiagnosis(txnData);

      // 3. 生成专业建议
      const recommendations = this.generateTransactionRecommendations(
        diagnosis,
        txnData,
      );

      // 4. 计算事务健康分数
      const healthScore = this.calculateTransactionHealthScore(diagnosis);

      const endTime = new Date();
      const analysisTime = endTime - startTime;

      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        analysis_duration_ms: analysisTime,
        transaction_health: healthScore,
        diagnosis_results: diagnosis,
        professional_recommendations: recommendations,
        raw_data: includeDetails ? txnData : null,
        next_check_interval: this.suggestNextCheckInterval(diagnosis),
      };
    } catch (error) {
      throw new Error(`事务专家诊断失败: ${error.message}`);
    }
  }

  /**
   * 收集事务相关数据
   */
  async collectTransactionData(connection) {
    const data = {
      running_transactions: [],
      transaction_summary: {
        total_databases: 0,
        databases_with_running_txns: 0,
        by_database: {},
      },
      databases: [],
      prometheus_metrics: {},
    };

    try {
      // 1. 获取数据库列表
      try {
        const [databases] = await connection.query(`
          SELECT SCHEMA_NAME
          FROM information_schema.schemata
          WHERE SCHEMA_NAME NOT IN ('information_schema', '_statistics_', 'sys')
        `);
        data.databases = databases;
        data.transaction_summary.total_databases = databases.length;
      } catch (error) {
        console.error('获取数据库列表失败:', error.message);
      }

      // 2. 遍历每个数据库,查询运行中的事务
      for (const db of data.databases) {
        const dbName = db.SCHEMA_NAME;

        try {
          const [runningTxns] = await connection.query(
            `SHOW PROC '/transactions/${dbName}/running'`,
          );

          if (runningTxns && runningTxns.length > 0) {
            data.transaction_summary.databases_with_running_txns++;
            data.transaction_summary.by_database[dbName] = runningTxns.length;

            // 添加数据库名到每个事务记录
            runningTxns.forEach((txn) => {
              data.running_transactions.push({
                ...txn,
                DB_NAME: dbName,
              });
            });
          }
        } catch (error) {
          // 忽略单个数据库查询失败
          console.error(`查询数据库 ${dbName} 事务失败: ${error.message}`);
        }
      }

      // 从 Prometheus 获取事务指标
      try {
        // 事务提交成功次数
        const commitSuccessQuery = `sum(increase(transaction_commit{status="success"}[5m]))`;
        data.prometheus_metrics.commit_success =
          await this.queryPrometheusInstant(commitSuccessQuery);

        // 事务提交失败次数
        const commitFailQuery = `sum(increase(transaction_commit{status="failed"}[5m]))`;
        data.prometheus_metrics.commit_fail =
          await this.queryPrometheusInstant(commitFailQuery);

        // 事务冲突次数
        const conflictQuery = `sum(rate(transaction_conflict_total[1m]))`;
        data.prometheus_metrics.conflicts =
          await this.queryPrometheusInstant(conflictQuery);

        // 事务提交延迟
        const commitLatencyQuery = `histogram_quantile(0.99, sum(rate(transaction_commit_latency_bucket[5m])) by (le))`;
        data.prometheus_metrics.commit_latency_p99 =
          await this.queryPrometheusInstant(commitLatencyQuery);
      } catch (error) {
        console.error('获取 Prometheus 事务指标失败:', error.message);
      }
    } catch (error) {
      console.error('收集事务数据失败:', error.message);
    }

    return data;
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
      return null;
    }
  }

  /**
   * 执行事务诊断分析
   */
  performTransactionDiagnosis(txnData) {
    const diagnosis = {
      overall_status: 'healthy',
      issues: [],
      statistics: {
        total_running_txns: 0,
        long_running_txns: 0,
        max_txn_duration_seconds: 0,
        transaction_types: {},
      },
    };

    try {
      const now = new Date();

      // 1. 分析运行中的事务
      if (
        txnData.running_transactions &&
        txnData.running_transactions.length > 0
      ) {
        diagnosis.statistics.total_running_txns =
          txnData.running_transactions.length;

        // 检测长事务
        const longTxns = [];

        txnData.running_transactions.forEach((txn) => {
          // 计算事务运行时间
          // SHOW PROC 返回的字段: TransactionId, Label, Coordinator, TransactionStatus,
          // LoadJobSourceType, PrepareTime, CommitTime, PublishVersionTime, FinishTime, Reason
          let startTime;
          if (txn.PrepareTime) {
            startTime = new Date(txn.PrepareTime);
          } else if (txn.CommitTime) {
            startTime = new Date(txn.CommitTime);
          } else {
            return;
          }

          const durationMs = now - startTime;
          const durationSeconds = Math.floor(durationMs / 1000);

          if (durationSeconds > diagnosis.statistics.max_txn_duration_seconds) {
            diagnosis.statistics.max_txn_duration_seconds = durationSeconds;
          }

          // 统计事务类型
          const txnType = txn.LoadJobSourceType || 'UNKNOWN';
          diagnosis.statistics.transaction_types[txnType] =
            (diagnosis.statistics.transaction_types[txnType] || 0) + 1;

          // 检测长事务
          if (durationSeconds > this.rules.long_transaction.warning_seconds) {
            diagnosis.statistics.long_running_txns++;
            longTxns.push({
              transaction_id: txn.TransactionId,
              label: txn.Label,
              duration_seconds: durationSeconds,
              status: txn.TransactionStatus,
              type: txnType,
              database: txn.DB_NAME,
              coordinator: txn.Coordinator,
              prepare_time: txn.PrepareTime,
              commit_time: txn.CommitTime,
              reason: txn.Reason,
            });
          }
        });

        // 添加长事务问题
        if (longTxns.length > 0) {
          const maxDuration = Math.max(
            ...longTxns.map((t) => t.duration_seconds),
          );
          const severity =
            maxDuration > this.rules.long_transaction.emergency_seconds
              ? 'critical'
              : maxDuration > this.rules.long_transaction.critical_seconds
                ? 'warning'
                : 'info';

          diagnosis.issues.push({
            severity: severity,
            category: 'long_transaction',
            message: `检测到 ${longTxns.length} 个长时间运行的事务`,
            impact: '长事务可能导致锁等待、阻塞其他事务、占用系统资源',
            current_value: maxDuration,
            threshold: this.rules.long_transaction.warning_seconds,
            details: longTxns.slice(0, 10), // 只显示前 10 个
          });

          if (severity !== 'info') {
            diagnosis.overall_status = severity;
          }
        }

        // 检查运行中事务数量
        if (
          diagnosis.statistics.total_running_txns >
          this.rules.transaction_count.critical_threshold
        ) {
          diagnosis.issues.push({
            severity: 'critical',
            category: 'high_transaction_count',
            message: `运行中事务数量过多: ${diagnosis.statistics.total_running_txns}`,
            impact: '可能导致系统资源耗尽、性能下降',
            current_value: diagnosis.statistics.total_running_txns,
            threshold: this.rules.transaction_count.critical_threshold,
          });
          diagnosis.overall_status = 'critical';
        } else if (
          diagnosis.statistics.total_running_txns >
          this.rules.transaction_count.warning_threshold
        ) {
          diagnosis.issues.push({
            severity: 'warning',
            category: 'high_transaction_count',
            message: `运行中事务数量较多: ${diagnosis.statistics.total_running_txns}`,
            impact: '需要关注事务处理速度和系统负载',
            current_value: diagnosis.statistics.total_running_txns,
            threshold: this.rules.transaction_count.warning_threshold,
          });
          if (diagnosis.overall_status === 'healthy') {
            diagnosis.overall_status = 'warning';
          }
        }
      }

      // 2. 分析 Prometheus 指标
      if (txnData.prometheus_metrics) {
        // 计算事务失败率
        const commitSuccess =
          txnData.prometheus_metrics.commit_success?.result?.[0]?.value?.[1];
        const commitFail =
          txnData.prometheus_metrics.commit_fail?.result?.[0]?.value?.[1];

        if (commitSuccess !== undefined && commitFail !== undefined) {
          const successCount = parseFloat(commitSuccess) || 0;
          const failCount = parseFloat(commitFail) || 0;
          const totalCommits = successCount + failCount;

          if (totalCommits > 0) {
            const failureRate = (failCount / totalCommits) * 100;
            diagnosis.statistics.failure_rate = failureRate.toFixed(2);

            if (failureRate > this.rules.failure_rate.critical_threshold) {
              diagnosis.issues.push({
                severity: 'critical',
                category: 'high_failure_rate',
                message: `事务失败率过高: ${failureRate.toFixed(2)}%`,
                impact: '大量事务失败可能导致数据不一致、业务中断',
                current_value: failureRate,
                threshold: this.rules.failure_rate.critical_threshold,
              });
              diagnosis.overall_status = 'critical';
            } else if (
              failureRate > this.rules.failure_rate.warning_threshold
            ) {
              diagnosis.issues.push({
                severity: 'warning',
                category: 'high_failure_rate',
                message: `事务失败率偏高: ${failureRate.toFixed(2)}%`,
                impact: '需要检查事务失败原因',
                current_value: failureRate,
                threshold: this.rules.failure_rate.warning_threshold,
              });
              if (diagnosis.overall_status === 'healthy') {
                diagnosis.overall_status = 'warning';
              }
            }
          }
        }

        // 分析事务冲突
        const conflicts =
          txnData.prometheus_metrics.conflicts?.result?.[0]?.value?.[1];
        if (conflicts !== undefined) {
          const conflictRate = parseFloat(conflicts) || 0;
          diagnosis.statistics.conflict_rate_per_min = conflictRate.toFixed(2);

          if (conflictRate > this.rules.conflict.critical_threshold) {
            diagnosis.issues.push({
              severity: 'critical',
              category: 'high_conflict',
              message: `事务冲突率过高: ${conflictRate.toFixed(2)}/min`,
              impact: '频繁的事务冲突导致大量重试、性能下降',
              current_value: conflictRate,
              threshold: this.rules.conflict.critical_threshold,
            });
            diagnosis.overall_status = 'critical';
          } else if (conflictRate > this.rules.conflict.warning_threshold) {
            diagnosis.issues.push({
              severity: 'warning',
              category: 'high_conflict',
              message: `事务冲突率偏高: ${conflictRate.toFixed(2)}/min`,
              impact: '需要优化事务并发控制',
              current_value: conflictRate,
              threshold: this.rules.conflict.warning_threshold,
            });
            if (diagnosis.overall_status === 'healthy') {
              diagnosis.overall_status = 'warning';
            }
          }
        }

        // 分析提交延迟
        const commitLatency =
          txnData.prometheus_metrics.commit_latency_p99?.result?.[0]
            ?.value?.[1];
        if (commitLatency !== undefined) {
          const latencyMs = parseFloat(commitLatency) || 0;
          diagnosis.statistics.commit_latency_p99_ms = latencyMs.toFixed(2);

          if (latencyMs > this.rules.commit_latency.critical_ms) {
            diagnosis.issues.push({
              severity: 'critical',
              category: 'high_commit_latency',
              message: `事务提交延迟过高: ${latencyMs.toFixed(0)}ms (P99)`,
              impact: '提交延迟高导致事务处理慢、用户等待时间长',
              current_value: latencyMs,
              threshold: this.rules.commit_latency.critical_ms,
            });
            diagnosis.overall_status = 'critical';
          } else if (latencyMs > this.rules.commit_latency.warning_ms) {
            diagnosis.issues.push({
              severity: 'warning',
              category: 'high_commit_latency',
              message: `事务提交延迟偏高: ${latencyMs.toFixed(0)}ms (P99)`,
              impact: '需要优化事务处理性能',
              current_value: latencyMs,
              threshold: this.rules.commit_latency.warning_ms,
            });
            if (diagnosis.overall_status === 'healthy') {
              diagnosis.overall_status = 'warning';
            }
          }
        }
      }
    } catch (error) {
      console.error('执行事务诊断失败:', error.message);
    }

    return diagnosis;
  }

  /**
   * 生成事务优化建议
   */
  generateTransactionRecommendations(diagnosis, txnData) {
    const recommendations = [];

    // 1. 长事务优化建议
    const longTxnIssue = diagnosis.issues.find(
      (i) => i.category === 'long_transaction',
    );
    if (longTxnIssue) {
      recommendations.push({
        priority: longTxnIssue.severity === 'critical' ? 'HIGH' : 'MEDIUM',
        category: 'long_transaction_optimization',
        title: '优化长时间运行的事务',
        description: `当前有 ${longTxnIssue.details?.length || 0} 个长事务，最长运行 ${longTxnIssue.current_value} 秒`,
        actions: [
          {
            action: '检查事务是否卡住',
            description:
              '使用 SHOW PROC "/transactions/<db_name>/<txn_id>" 查看详细信息',
          },
          {
            action: '考虑取消长事务',
            description: '如果事务已失效，使用 ADMIN CANCEL TXN 命令取消',
          },
          {
            action: '优化导入任务',
            description: '拆分大批量导入，避免单个事务处理过多数据',
          },
          {
            action: '检查锁等待',
            description: '长事务可能在等待锁，检查是否有表锁或行锁冲突',
          },
        ],
      });
    }

    // 2. 事务数量优化建议
    const highCountIssue = diagnosis.issues.find(
      (i) => i.category === 'high_transaction_count',
    );
    if (highCountIssue) {
      recommendations.push({
        priority: highCountIssue.severity === 'critical' ? 'HIGH' : 'MEDIUM',
        category: 'transaction_count_optimization',
        title: '降低并发事务数量',
        description: `当前运行 ${highCountIssue.current_value} 个事务`,
        actions: [
          {
            action: '控制导入并发度',
            description: '减少同时进行的导入任务数量',
          },
          {
            action: '优化事务处理速度',
            description: '提高单个事务的处理效率，加快事务完成',
          },
          {
            action: '检查事务堆积原因',
            description: '查看是否有事务处理瓶颈或阻塞',
          },
        ],
      });
    }

    // 3. 事务失败率优化建议
    const failureRateIssue = diagnosis.issues.find(
      (i) => i.category === 'high_failure_rate',
    );
    if (failureRateIssue) {
      recommendations.push({
        priority: failureRateIssue.severity === 'critical' ? 'HIGH' : 'MEDIUM',
        category: 'failure_rate_optimization',
        title: '降低事务失败率',
        description: `当前失败率 ${failureRateIssue.current_value}%`,
        actions: [
          {
            action: '分析失败原因',
            description: '查看 fe.log 中的事务失败日志，定位具体错误原因',
          },
          {
            action: '检查资源限制',
            description: '确认是否因资源不足导致事务失败 (内存、磁盘等)',
          },
          {
            action: '优化数据质量',
            description: '检查导入数据格式、类型是否符合要求',
          },
          {
            action: '调整超时设置',
            description: '如果因超时失败，考虑增加 timeout 参数',
          },
        ],
      });
    }

    // 4. 事务冲突优化建议
    const conflictIssue = diagnosis.issues.find(
      (i) => i.category === 'high_conflict',
    );
    if (conflictIssue) {
      recommendations.push({
        priority: conflictIssue.severity === 'critical' ? 'HIGH' : 'MEDIUM',
        category: 'conflict_optimization',
        title: '减少事务冲突',
        description: `当前冲突率 ${conflictIssue.current_value}/min`,
        actions: [
          {
            action: '优化写入模式',
            description: '避免多个并发事务同时修改相同的表或分区',
          },
          {
            action: '调整导入策略',
            description: '错峰导入，减少并发写入冲突',
          },
          {
            action: '增加分区粒度',
            description: '细化分区策略，减少分区级别的锁冲突',
          },
          {
            action: '使用主键模型',
            description: '主键模型支持更好的并发更新，减少冲突',
          },
        ],
      });
    }

    // 5. 提交延迟优化建议
    const latencyIssue = diagnosis.issues.find(
      (i) => i.category === 'high_commit_latency',
    );
    if (latencyIssue) {
      recommendations.push({
        priority: latencyIssue.severity === 'critical' ? 'HIGH' : 'MEDIUM',
        category: 'latency_optimization',
        title: '优化事务提交延迟',
        description: `当前 P99 延迟 ${latencyIssue.current_value.toFixed(0)}ms`,
        actions: [
          {
            action: '检查 BE 性能',
            description: '查看 BE 节点 CPU、内存、磁盘 IO 是否正常',
          },
          {
            action: '优化网络',
            description: '检查 FE-BE 之间的网络延迟和带宽',
          },
          {
            action: '减少事务大小',
            description: '避免单个事务包含过多数据，拆分成小批量',
          },
          {
            action: '检查 Compaction',
            description: '版本过多会影响提交性能，确保 Compaction 正常',
          },
        ],
      });
    }

    // 6. 健康状态下的预防性建议
    if (
      diagnosis.overall_status === 'healthy' &&
      recommendations.length === 0
    ) {
      recommendations.push({
        priority: 'LOW',
        category: 'preventive',
        title: '事务系统运行健康',
        description: '当前事务系统运行正常，建议继续保持监控',
        actions: [
          {
            action: '定期检查长事务',
            description: '建议每天检查是否有超过 30 分钟的事务',
          },
          {
            action: '监控失败率',
            description: '关注事务失败率变化趋势',
          },
          {
            action: '优化导入策略',
            description: '持续优化批量大小和并发度',
          },
        ],
      });
    }

    return recommendations;
  }

  /**
   * 计算事务健康分数 (0-100)
   */
  calculateTransactionHealthScore(diagnosis) {
    let score = 100;

    // 根据问题严重程度扣分
    diagnosis.issues.forEach((issue) => {
      if (issue.severity === 'critical') {
        score -= 30;
      } else if (issue.severity === 'warning') {
        score -= 15;
      } else if (issue.severity === 'info') {
        score -= 5;
      }
    });

    // 确保分数在 0-100 范围内
    score = Math.max(0, Math.min(100, score));

    return {
      score: score,
      level:
        score >= 90
          ? 'excellent'
          : score >= 70
            ? 'good'
            : score >= 50
              ? 'fair'
              : score >= 30
                ? 'poor'
                : 'critical',
      description: this.getHealthDescription(score),
    };
  }

  /**
   * 获取健康分数描述
   */
  getHealthDescription(score) {
    if (score >= 90) {
      return '事务系统运行优秀，无明显问题';
    } else if (score >= 70) {
      return '事务系统运行良好，存在少量优化空间';
    } else if (score >= 50) {
      return '事务系统运行一般，需要关注和优化';
    } else if (score >= 30) {
      return '事务系统存在明显问题，需要尽快优化';
    } else {
      return '事务系统存在严重问题，需要立即处理';
    }
  }

  /**
   * 建议下次检查间隔
   */
  suggestNextCheckInterval(diagnosis) {
    if (diagnosis.overall_status === 'critical') {
      return '立即检查 (每 5 分钟)';
    } else if (diagnosis.overall_status === 'warning') {
      return '频繁检查 (每 15 分钟)';
    } else {
      return '定期检查 (每 1 小时)';
    }
  }

  /**
   * 格式化事务诊断报告
   */
  formatTransactionReport(result) {
    let report = '🔄 StarRocks 事务系统分析报告\n';
    report += '========================================\n\n';

    if (result.transaction_health) {
      report += `💯 **健康评分**: ${result.transaction_health.score}/100 (${result.transaction_health.level.toUpperCase()})\n`;
      report += `📊 **健康状态**: ${result.transaction_health.description}\n\n`;
    }

    const stats = result.diagnosis_results.statistics;

    report += '📈 **事务统计**:\n';
    report += `   运行中事务: ${stats.total_running_txns || 0} 个\n`;
    if (stats.long_running_txns > 0) {
      report += `   长事务: ${stats.long_running_txns} 个 ⚠️\n`;
      report += `   最长运行时间: ${stats.max_txn_duration_seconds} 秒\n`;
    }
    if (stats.failure_rate !== undefined) {
      report += `   失败率: ${stats.failure_rate}%\n`;
    }
    if (stats.conflict_rate_per_min !== undefined) {
      report += `   冲突率: ${stats.conflict_rate_per_min}/min\n`;
    }
    if (stats.commit_latency_p99_ms !== undefined) {
      report += `   提交延迟 (P99): ${stats.commit_latency_p99_ms}ms\n`;
    }

    // 事务类型分布
    if (
      stats.transaction_types &&
      Object.keys(stats.transaction_types).length > 0
    ) {
      report += '\n📊 **事务类型分布**:\n';
      Object.entries(stats.transaction_types)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          report += `   ${type}: ${count} 个\n`;
        });
    }

    // 问题列表
    if (result.diagnosis_results.issues.length > 0) {
      report += '\n⚠️  **发现的问题**:\n';
      result.diagnosis_results.issues.forEach((issue, index) => {
        const emoji =
          issue.severity === 'critical'
            ? '🔴'
            : issue.severity === 'warning'
              ? '🟡'
              : 'ℹ️';
        report += `\n  ${index + 1}. ${emoji} [${issue.severity.toUpperCase()}] ${issue.message}\n`;
        report += `     影响: ${issue.impact}\n`;
        if (issue.details && issue.details.length > 0) {
          report += `     详细信息:\n`;
          issue.details.slice(0, 3).forEach((detail) => {
            report += `       - 事务 ${detail.transaction_id}: ${detail.label || 'N/A'}\n`;
            report += `         数据库: ${detail.database}, 类型: ${detail.type}\n`;
            report += `         运行时间: ${detail.duration_seconds}s, 状态: ${detail.status}\n`;
            if (detail.coordinator) {
              report += `         协调节点: ${detail.coordinator}\n`;
            }
            if (detail.reason) {
              report += `         原因: ${detail.reason}\n`;
            }
          });
          if (issue.details.length > 3) {
            report += `       ... 还有 ${issue.details.length - 3} 个\n`;
          }
        }
      });
    } else {
      report += '\n✅ **未发现问题**\n';
    }

    // 优化建议
    if (result.professional_recommendations.length > 0) {
      report += '\n💡 **优化建议**:\n';
      result.professional_recommendations.forEach((rec, index) => {
        const priorityEmoji =
          rec.priority === 'HIGH'
            ? '🔴'
            : rec.priority === 'MEDIUM'
              ? '🟡'
              : '🔵';
        report += `\n  ${index + 1}. ${priorityEmoji} [${rec.priority}] ${rec.title}\n`;
        if (rec.description) {
          report += `     ${rec.description}\n`;
        }
        if (rec.actions) {
          report += `     建议行动:\n`;
          rec.actions.forEach((action) => {
            report += `       • ${action.action}\n`;
            if (action.description) {
              report += `         ${action.description}\n`;
            }
          });
        }
      });
    }

    report += `\n⏰ **下次检查**: ${result.next_check_interval}\n`;
    report += `📅 **分析时间**: ${result.timestamp}\n`;
    report += `⚡ **分析耗时**: ${result.analysis_duration_ms}ms\n`;

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   */
  getToolHandlers() {
    return {
      analyze_transactions: async (args, context) => {
        console.log('🎯 事务分析接收参数:', JSON.stringify(args, null, 2));

        const connection = context.connection;
        const includeDetails = args.include_details !== false;

        const result = await this.diagnose(connection, includeDetails);

        const report = this.formatTransactionReport(result);

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
        name: 'analyze_transactions',
        description: `🔄 **事务系统分析**

**功能**: 全面分析 StarRocks 事务系统状态，包括运行中事务、长事务检测、事务冲突、失败率和提交延迟等。

**分析内容**:
- ✅ 运行中事务统计
- ✅ 长事务检测 (超过 5分钟/30分钟/1小时)
- ✅ 事务失败率分析
- ✅ 事务冲突检测
- ✅ 提交延迟分析 (P99)
- ✅ 事务类型分布
- ✅ 健康评分和优化建议

**适用场景**:
- 检查是否有长时间运行的事务
- 分析事务失败原因
- 定位事务冲突问题
- 优化事务处理性能
- 监控事务系统健康状态

**数据来源**:
- information_schema.transactions_running (运行中事务)
- Prometheus 指标 (失败率、冲突、延迟)

**使用示例**:
- 全面分析: analyze_transactions()
- 简化分析: analyze_transactions(include_details: false)`,
        inputSchema: {
          type: 'object',
          properties: {
            include_details: {
              type: 'boolean',
              description: '是否包含详细的原始数据',
              default: true,
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksTransactionExpert };
