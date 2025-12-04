/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Expert Solution C 适配器
 *
 * 为现有 expert 快速添加 Solution C 支持
 * 通过分析现有方法自动生成 SQL 查询定义和结果分析
 */

/* eslint-disable no-undef */

/**
 * 为 Expert 添加 Solution C 支持
 * @param {Object} ExpertClass - Expert 类
 * @returns {Object} 带 Solution C 支持的 Expert 类
 */
export function addSolutionCSupport(ExpertClass) {
  return class extends ExpertClass {
    constructor() {
      super();
      this._originalVersion = this.version;
      this.version = `${this._originalVersion}-solutionc`;
    }

    /**
     * 获取工具的 SQL 查询定义
     */
    getQueriesForTool(toolName, args = {}) {
      // 尝试调用专门的查询方法
      const methodName = `get${this._toPascalCase(toolName)}Queries`;
      if (typeof this[methodName] === 'function') {
        return this[methodName](args);
      }

      // 回退：返回基本查询定义
      return this._getDefaultQueries(toolName, args);
    }

    /**
     * 分析查询结果
     */
    async analyzeQueryResults(toolName, results, args = {}) {
      console.log(`🔬 开始分析 ${toolName} 的查询结果...`);

      // 尝试调用专门的分析方法
      const methodName = `analyze${this._toPascalCase(toolName)}Results`;
      if (typeof this[methodName] === 'function') {
        return this[methodName](results, args);
      }

      // 回退：返回原始结果
      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        tool: toolName,
        results: results,
        message: '使用默认分析器，返回原始查询结果'
      };
    }

    /**
     * 转换工具名为 PascalCase
     */
    _toPascalCase(str) {
      return str
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    }

    /**
     * 获取默认查询定义
     */
    _getDefaultQueries(toolName, args) {
      // 这是一个基本实现，可以被各个 expert 覆盖
      return [
        {
          id: 'default_query',
          sql: `SELECT 'Not implemented' as message;`,
          description: `${toolName} 的默认查询`,
          required: true
        }
      ];
    }
  };
}
