/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-undef */

import { StarRocksTransactionExpert } from './transaction-expert.js';

class StarRocksTransactionExpertSolutionC extends StarRocksTransactionExpert {
  constructor() {
    super();
    this.version = '2.0.0-solutionc';
  }

  getQueriesForTool(toolName, args = {}) {
    if (toolName === 'analyze_transactions') {
      return this.getTransactionQueries(args);
    }

    return [{ id: 'default', sql: "SELECT 'Tool not fully implemented' as message", required: true }];
  }

  /**
   * 获取事务分析的查询（SQL + Prometheus）
   */
  getTransactionQueries() {
    const queries = [];

    // 1. 获取数据库列表（SQL）
    queries.push({
      id: 'databases',
      type: 'sql',
      query: `
        SELECT SCHEMA_NAME
        FROM information_schema.schemata
        WHERE SCHEMA_NAME NOT IN ('information_schema', '_statistics_', 'sys')
      `,
      description: '获取数据库列表',
      required: true
    });

    // 2. Prometheus 指标查询

    // 事务提交成功次数
    queries.push({
      id: 'commit_success',
      type: 'prometheus_instant',
      query: 'sum(increase(transaction_commit{status="success"}[5m]))',
      description: '事务提交成功次数 (最近5分钟)',
      required: false
    });

    // 事务提交失败次数
    queries.push({
      id: 'commit_fail',
      type: 'prometheus_instant',
      query: 'sum(increase(transaction_commit{status="failed"}[5m]))',
      description: '事务提交失败次数 (最近5分钟)',
      required: false
    });

    // 事务冲突次数
    queries.push({
      id: 'conflicts',
      type: 'prometheus_instant',
      query: 'sum(rate(transaction_conflict_total[1m]))',
      description: '事务冲突速率 (每分钟)',
      required: false
    });

    // 事务提交延迟 P99
    queries.push({
      id: 'commit_latency_p99',
      type: 'prometheus_instant',
      query: 'histogram_quantile(0.99, sum(rate(transaction_commit_latency_bucket[5m])) by (le))',
      description: '事务提交延迟 P99',
      required: false
    });

    return queries;
  }

  async analyzeQueryResults(toolName, results, args = {}) {
    if (toolName === 'analyze_transactions') {
      return this.analyzeTransactionResults(results, args);
    }

    return {
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      tool: toolName,
      results: results
    };
  }

  /**
   * 分析事务查询结果
   *
   * 注意：由于 thin-mcp-server 不支持动态 SQL（基于前一个查询的结果），
   * 我们无法在客户端执行 "对每个数据库查询运行中的事务"。
   *
   * 解决方案：将这部分逻辑放在分析阶段，通过服务器端的 connection 来执行。
   * 但这违反了 Solution C 的设计原则（所有查询应该在客户端执行）。
   *
   * 实际上，这里需要一个 callback 机制或者支持动态查询。
   * 暂时，我们使用一个折衷方案：在分析方法中标记需要服务器端辅助查询。
   */
  async analyzeTransactionResults(results, args) {
    const { databases, commit_success, commit_fail, conflicts, commit_latency_p99 } = results;

    // 检查数据库列表
    if (!databases || databases.length === 0) {
      return {
        status: 'error',
        message: '未找到用户数据库',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    // 构建事务数据结构
    const txnData = {
      running_transactions: [],
      transaction_summary: {
        total_databases: databases.length,
        databases_with_running_txns: 0,
        by_database: {},
      },
      databases: databases,
      prometheus_metrics: {
        commit_success: commit_success,
        commit_fail: commit_fail,
        conflicts: conflicts,
        commit_latency_p99: commit_latency_p99,
      },
    };

    // 注意：running_transactions 需要通过服务器端的 connection 来查询
    // 因为需要对每个数据库执行 SHOW PROC '/transactions/<db>/running'
    // 这是动态查询，thin-mcp-server 当前不支持
    //
    // 折衷方案：在这里标记需要服务器端辅助，并在文档中说明
    txnData.note = '运行中事务查询需要服务器端辅助 (动态查询每个数据库)';
    txnData.running_transactions = []; // 留空，需要服务器端补充

    // 使用父类方法分析
    const diagnosis = this.performTransactionDiagnosis(txnData);
    const recommendations = this.generateTransactionRecommendations(diagnosis, txnData);
    const healthScore = this.calculateTransactionHealthScore(diagnosis);
    const report = this.formatTransactionReport({
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      transaction_health: healthScore,
      diagnosis_results: diagnosis,
      professional_recommendations: recommendations,
      raw_data: args.include_details !== false ? txnData : null,
      next_check_interval: this.suggestNextCheckInterval(diagnosis),
    });

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      report: report,
      transaction_health: healthScore,
      diagnosis_results: diagnosis,
      professional_recommendations: recommendations,
      note: '当前 Solution C 实现仅包含 Prometheus 指标分析。运行中事务查询需要扩展 thin-mcp-server 支持动态 SQL 查询。'
    };
  }
}

export { StarRocksTransactionExpertSolutionC };
