/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StarRocksIngestionExpert } from './ingestion-expert.js';

class StarRocksIngestionExpertSolutionC extends StarRocksIngestionExpert {
  constructor() {
    super();
    this.version = '2.0.0-solutionc';
  }

  getQueriesForTool(toolName, args = {}) {
    switch (toolName) {
      case 'check_load_job_status':
        return [
          {
            id: 'load_jobs',
            sql: `SELECT * FROM information_schema.loads WHERE STATE IN ('PENDING', 'LOADING', 'FINISHED', 'CANCELLED') ORDER BY CREATE_TIME DESC LIMIT 100`,
            description: '最近的导入任务',
            required: true
          }
        ];

      case 'analyze_table_import_frequency':
        const { database_name, table_name, days = 7 } = args;
        let where = `CREATE_TIME >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
        const params = [];
        if (database_name) {
          where += ' AND DATABASE_NAME = ?';
          params.push(database_name);
        }
        if (table_name) {
          where += ' AND LABEL LIKE ?';
          params.push(`%${table_name}%`);
        }
        return [
          {
            id: 'load_frequency',
            sql: `SELECT DATABASE_NAME, DATE(CREATE_TIME) as load_date, COUNT(*) as load_count FROM information_schema.loads WHERE ${where} GROUP BY DATABASE_NAME, load_date ORDER BY load_date DESC`,
            description: '导入频率统计',
            required: true,
            params
          }
        ];

      case 'analyze_ingestion_health':
        // 健康分析：收集最近的导入任务统计
        return [
          {
            id: 'recent_loads',
            sql: `
              SELECT
                STATE,
                COUNT(*) as count,
                SUM(CASE WHEN STATE = 'FINISHED' THEN 1 ELSE 0 END) as finished_count,
                SUM(CASE WHEN STATE = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_count
              FROM information_schema.loads
              WHERE CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
              GROUP BY STATE
            `,
            description: '最近24小时导入任务统计',
            required: true
          },
          {
            id: 'failed_loads',
            sql: `
              SELECT
                JOB_ID,
                LABEL,
                DATABASE_NAME,
                STATE,
                FAIL_MSG,
                CREATE_TIME
              FROM information_schema.loads
              WHERE STATE = 'CANCELLED'
                AND CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
              ORDER BY CREATE_TIME DESC
              LIMIT 20
            `,
            description: '最近失败的导入任务',
            required: true
          },
          {
            id: 'load_summary',
            sql: `
              SELECT
                COUNT(*) as total_jobs,
                SUM(CASE WHEN STATE = 'FINISHED' THEN 1 ELSE 0 END) as success_jobs,
                SUM(CASE WHEN STATE = 'CANCELLED' THEN 1 ELSE 0 END) as failed_jobs
              FROM information_schema.loads
              WHERE CREATE_TIME >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            `,
            description: '导入任务总览',
            required: true
          }
        ];

      default:
        return [{ id: 'default', sql: "SELECT 'Tool not fully implemented' as message", required: true }];
    }
  }

  async analyzeQueryResults(toolName, results, args = {}) {
    switch (toolName) {
      case 'analyze_ingestion_health':
        return this.analyzeIngestionHealth(results, args);

      default:
        return {
          expert: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          tool: toolName,
          results: results,
          summary: `${toolName} 查询完成`
        };
    }
  }

  /**
   * 分析数据摄取健康状况
   */
  analyzeIngestionHealth(results) {
    const { recent_loads, failed_loads, load_summary } = results;

    // 防御性检查
    const failedLoadsArray = Array.isArray(failed_loads) ? failed_loads : [];
    const summaryData = Array.isArray(load_summary) && load_summary.length > 0
      ? load_summary[0]
      : { total_jobs: 0, success_jobs: 0, failed_jobs: 0 };

    // 计算统计
    const totalJobs = parseInt(summaryData.total_jobs) || 0;
    const successJobs = parseInt(summaryData.success_jobs) || 0;
    const failedJobs = parseInt(summaryData.failed_jobs) || 0;
    const successRate = totalJobs > 0 ? ((successJobs / totalJobs) * 100).toFixed(2) : 100;
    const failureRate = totalJobs > 0 ? ((failedJobs / totalJobs) * 100).toFixed(2) : 0;

    // 诊断问题
    const criticals = [];
    const warnings = [];

    if (failureRate > 50) {
      criticals.push({
        severity: 'CRITICAL',
        type: 'high_failure_rate',
        message: `导入失败率过高 (${failureRate}%)，超过半数任务失败`,
        impact: '数据摄取严重受阻，可能导致数据丢失或延迟'
      });
    } else if (failureRate > 20) {
      criticals.push({
        severity: 'HIGH',
        type: 'elevated_failure_rate',
        message: `导入失败率偏高 (${failureRate}%)`,
        impact: '数据摄取效率低下，需要排查失败原因'
      });
    } else if (failureRate > 5) {
      warnings.push({
        severity: 'MEDIUM',
        type: 'some_failures',
        message: `发现 ${failedJobs} 个失败的导入任务 (${failureRate}%)`,
        impact: '部分数据导入失败，建议检查'
      });
    }

    if (totalJobs === 0) {
      warnings.push({
        severity: 'INFO',
        type: 'no_recent_jobs',
        message: '最近24小时没有导入任务',
        impact: '可能正常，或可能表示数据源问题'
      });
    }

    // 计算健康分数
    let healthScore = 100;
    if (failureRate > 50) {
      healthScore = 20;
    } else if (failureRate > 20) {
      healthScore = 50;
    } else if (failureRate > 5) {
      healthScore = 70;
    } else if (failureRate > 0) {
      healthScore = 85;
    }

    const healthLevel = healthScore >= 85 ? 'EXCELLENT' : healthScore >= 70 ? 'GOOD' : healthScore >= 50 ? 'FAIR' : 'POOR';
    const healthStatus = criticals.length > 0 ? 'CRITICAL' : warnings.length > 0 ? 'WARNING' : 'HEALTHY';

    // 生成建议
    const recommendations = [];

    if (failedJobs > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'failure_investigation',
        title: '排查失败任务原因',
        description: `检查 ${failedJobs} 个失败任务的错误信息`,
        actions: [
          '查看失败任务的 FAIL_MSG 字段',
          '检查数据格式是否正确',
          '验证网络连接和权限配置',
          '检查目标表结构是否匹配'
        ]
      });
    }

    if (failureRate > 20) {
      recommendations.push({
        priority: 'HIGH',
        category: 'system_optimization',
        title: '优化导入配置',
        description: '调整导入参数和资源配置',
        actions: [
          '增加导入超时时间',
          '调整批量大小',
          '检查 BE 节点资源使用情况',
          '考虑使用 Stream Load 替代 Broker Load'
        ]
      });
    }

    // 返回标准格式
    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),

      // 健康状态
      import_health: {
        score: healthScore,
        level: healthLevel,
        status: healthStatus
      },

      // 诊断结果
      diagnosis_results: {
        summary: `最近24小时共 ${totalJobs} 个导入任务，成功率 ${successRate}%`,
        total_issues: criticals.length + warnings.length,
        criticals: criticals,
        warnings: warnings
      },

      // 详细统计
      statistics: {
        total_jobs: totalJobs,
        success_jobs: successJobs,
        failed_jobs: failedJobs,
        success_rate: parseFloat(successRate),
        failure_rate: parseFloat(failureRate)
      },

      // 失败任务详情
      failed_jobs_detail: failedLoadsArray.slice(0, 10).map(job => ({
        job_id: job.JOB_ID,
        label: job.LABEL,
        database: job.DATABASE_NAME,
        fail_message: job.FAIL_MSG,
        create_time: job.CREATE_TIME
      })),

      // 专业建议
      professional_recommendations: recommendations
    };
  }
}

export { StarRocksIngestionExpertSolutionC };
