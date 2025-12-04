/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Base Expert Class
 *
 * 提供专家类的基础架构，支持两种模式：
 * 1. Direct Mode: 直接连接数据库执行（用于方案 A/B）
 * 2. API Mode: 返回 SQL 定义，由客户端执行（用于方案 C）
 */

export class BaseExpert {
  constructor() {
    this.mode = 'direct'; // 'direct' or 'api'
  }

  /**
   * 获取需要执行的 SQL 查询列表
   * 子类必须实现此方法
   *
   * @returns {Array<{id: string, sql: string, description: string}>}
   */
  getQueries() {
    throw new Error('子类必须实现 getQueries() 方法');
  }

  /**
   * 分析查询结果
   * 子类必须实现此方法
   *
   * @param {Object} results - 查询结果对象，key 为 query id
   * @returns {Object} 分析报告
   */
  async analyzeResults(results) {
    throw new Error('子类必须实现 analyzeResults() 方法');
  }

  /**
   * 执行完整的分析流程（Direct Mode）
   *
   * @param {Connection} connection - 数据库连接
   * @returns {Object} 分析报告
   */
  async analyze(connection) {
    const queries = this.getQueries();
    const results = {};

    for (const query of queries) {
      try {
        const [rows] = await connection.query(query.sql);
        results[query.id] = rows;
      } catch (error) {
        console.error(`Query ${query.id} failed:`, error.message);
        results[query.id] = { error: error.message };
      }
    }

    return await this.analyzeResults(results);
  }

  /**
   * 设置专家模式
   *
   * @param {string} mode - 'direct' 或 'api'
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * 获取工具元数据（用于 MCP 工具注册）
   * 子类应该重写此方法
   *
   * @returns {{name: string, description: string, inputSchema: Object}}
   */
  getToolMetadata() {
    return {
      name: 'base_tool',
      description: 'Base tool description',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    };
  }
}
