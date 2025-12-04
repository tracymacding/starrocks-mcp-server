/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-undef */

import { StarRocksMemoryExpert } from './memory-expert.js';

class StarRocksMemoryExpertSolutionC extends StarRocksMemoryExpert {
  constructor() {
    super();
    this.version = '2.0.0-solutionc';
  }

  getQueriesForTool(toolName, args = {}) {
    if (toolName === 'analyze_memory') {
      return this.getMemoryQueries(args);
    }

    return [{ id: 'default', sql: "SELECT 'Tool not fully implemented' as message", required: true }];
  }

  /**
   * 获取内存分析的查询（SQL）
   */
  getMemoryQueries() {
    const queries = [];

    // 1. 获取 BE 节点信息
    queries.push({
      id: 'backends',
      type: 'sql',
      query: 'SHOW BACKENDS',
      description: '获取 BE 节点信息',
      required: true
    });

    // 2. 获取 CN 节点信息
    queries.push({
      id: 'compute_nodes',
      type: 'sql',
      query: 'SHOW COMPUTE NODES',
      description: '获取 CN 节点信息',
      required: false
    });

    // 3. 获取内存配置项
    const memoryConfigNames = [
      'mem_limit',
      'query_max_memory_limit_percent',
      'load_process_max_memory_limit_bytes',
      'load_process_max_memory_limit_percent',
      'compaction_max_memory_limit',
      'compaction_max_memory_limit_percent',
      'lake_metadata_cache_limit',
      'storage_page_cache_limit',
      'starlet_star_cache_mem_size_percent',
      'starlet_star_cache_mem_size_bytes',
    ];

    memoryConfigNames.forEach(configName => {
      queries.push({
        id: `config_${configName}`,
        type: 'sql',
        query: `SELECT * FROM information_schema.be_configs WHERE name = '${configName}'`,
        description: `获取 ${configName} 配置`,
        required: false
      });
    });

    return queries;
  }

  async analyzeQueryResults(toolName, results, args = {}) {
    if (toolName === 'analyze_memory') {
      return this.analyzeMemoryResults(results, args);
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
   * 分析内存查询结果
   *
   * 注意：由于 thin-mcp-server 不支持 HTTP 查询，
   * 我们无法获取每个节点的 /mem_tracker 数据。
   * 这里只能基于 SQL 查询结果提供有限的内存分析。
   */
  async analyzeMemoryResults(results, args) {
    const { backends, compute_nodes } = results;

    // 检查节点数据
    if (!backends || backends.length === 0) {
      return {
        status: 'error',
        message: '未找到 BE 节点',
        expert: this.name,
        timestamp: new Date().toISOString()
      };
    }

    // 收集内存配置
    const memory_configs = [];
    Object.keys(results).forEach(key => {
      if (key.startsWith('config_') && results[key] && results[key].length > 0) {
        memory_configs.push(...results[key]);
      }
    });

    // 构建内存数据结构（简化版）
    const memoryData = {
      backends: backends || [],
      compute_nodes: compute_nodes || [],
      memory_configs: memory_configs,
      memory_stats: {
        total_nodes: (backends?.length || 0) + (compute_nodes?.length || 0),
        total_memory_bytes: 0,
        total_used_bytes: 0,
        by_node: [],
      },
    };

    // 注意：memory_stats.by_node 需要通过 HTTP /mem_tracker 获取
    // 这是当前架构的限制，thin-mcp-server 不支持 HTTP 查询
    memoryData.note = '详细内存统计需要 HTTP /mem_tracker 支持 (当前不可用)';

    // 从 SHOW BACKENDS 提取基本信息
    backends.forEach(be => {
      const totalBytes = parseInt(be.MemLimit) || 0;
      const usedBytes = parseInt(be.MemUsed) || 0;

      memoryData.memory_stats.total_memory_bytes += totalBytes;
      memoryData.memory_stats.total_used_bytes += usedBytes;

      memoryData.memory_stats.by_node.push({
        node_type: 'BE',
        host: be.Host || be.IP,
        http_port: be.HttpPort || be.HeartbeatPort,
        total_bytes: totalBytes,
        used_bytes: usedBytes,
        memory_tracker: null, // 需要 HTTP 查询
      });
    });

    // 从 SHOW COMPUTE NODES 提取信息
    if (compute_nodes && compute_nodes.length > 0) {
      compute_nodes.forEach(cn => {
        const totalBytes = parseInt(cn.MemLimit) || 0;
        const usedBytes = parseInt(cn.MemUsed) || 0;

        memoryData.memory_stats.total_memory_bytes += totalBytes;
        memoryData.memory_stats.total_used_bytes += usedBytes;

        memoryData.memory_stats.by_node.push({
          node_type: 'CN',
          host: cn.Host || cn.IP,
          http_port: cn.HttpPort || cn.HeartbeatPort,
          total_bytes: totalBytes,
          used_bytes: usedBytes,
          memory_tracker: null, // 需要 HTTP 查询
        });
      });
    }

    // 使用父类方法分析
    const diagnosis = this.performMemoryDiagnosis(memoryData);
    const recommendations = this.generateMemoryRecommendations(diagnosis);
    const healthScore = this.calculateMemoryHealthScore(diagnosis);
    const report = this.formatMemoryReport({
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      analysis_duration_ms: 0,
      memory_health: healthScore,
      diagnosis_results: diagnosis,
      professional_recommendations: recommendations,
      raw_data: args.include_details !== false ? memoryData : null,
      next_check_interval: this.suggestNextCheckInterval(diagnosis),
    });

    return {
      status: 'success',
      expert: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      report: report,
      memory_health: healthScore,
      diagnosis_results: diagnosis,
      professional_recommendations: recommendations,
      note: '当前 Solution C 实现仅包含基本的 SQL 查询分析。详细内存 tracker 数据需要扩展 thin-mcp-server 支持 HTTP 查询。'
    };
  }
}

export { StarRocksMemoryExpertSolutionC };
