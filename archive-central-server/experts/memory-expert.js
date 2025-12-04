/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 内存问题分析专家模块
 * 负责：内存使用分析、OOM 检测、内存泄漏识别、GC 分析
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

class StarRocksMemoryExpert {
  constructor() {
    this.name = 'memory';
    this.version = '1.0.0';
    this.description =
      'StarRocks 内存问题分析专家 - 负责内存使用、OOM、泄漏和 GC 诊断';

    // Prometheus 配置
    this.prometheusConfig = {
      host: '127.0.0.1',
      port: 9092,
      protocol: 'http',
    };

    // 内存分析规则库
    this.rules = {
      // 内存使用规则
      memory_usage: {
        warning_threshold: 80, // 内存使用率 > 80% 为警告
        critical_threshold: 90, // 内存使用率 > 90% 为严重
        emergency_threshold: 95, // 内存使用率 > 95% 为紧急
      },

      // JVM 堆内存规则
      heap_memory: {
        warning_threshold: 85, // 堆内存使用率 > 85% 为警告
        critical_threshold: 95, // 堆内存使用率 > 95% 为严重
        min_free_heap_gb: 2, // 最小剩余堆内存 2GB
      },

      // GC 规则
      gc: {
        full_gc_warning_count: 10, // Full GC 次数 > 10/小时 为警告
        full_gc_critical_count: 50, // Full GC 次数 > 50/小时 为严重
        gc_pause_warning_ms: 1000, // GC 暂停 > 1s 为警告
        gc_pause_critical_ms: 5000, // GC 暂停 > 5s 为严重
      },

      // 内存泄漏检测规则
      leak_detection: {
        // 内存持续增长判断
        growth_rate_warning: 5, // 增长率 > 5%/小时 为警告
        growth_rate_critical: 10, // 增长率 > 10%/小时 为严重
        // 老年代占比
        old_gen_threshold: 90, // 老年代占比 > 90% 可能泄漏
      },

      // 查询内存规则
      query_memory: {
        single_query_warning_gb: 10, // 单查询内存 > 10GB 为警告
        single_query_critical_gb: 50, // 单查询内存 > 50GB 为严重
      },
    };

    // 专业术语和解释
    this.terminology = {
      heap_memory: 'JVM 堆内存，用于存储 Java 对象',
      direct_memory: '直接内存，用于 NIO 操作和缓存',
      old_generation: '老年代，存储长期存活的对象',
      young_generation: '新生代，存储新创建的对象',
      full_gc: '完全垃圾回收，会暂停所有应用线程',
      minor_gc: '年轻代垃圾回收，暂停时间较短',
      oom: 'Out Of Memory，内存不足错误',
      memory_leak: '内存泄漏，对象无法被垃圾回收导致内存持续增长',
      gc_pause: 'GC 暂停时间，影响查询响应时间',
    };

    // 内存问题类型
    this.memoryIssueTypes = {
      high_usage: {
        name: '内存使用率过高',
        severity: 'warning',
        causes: [
          '查询并发过高',
          '单个查询消耗过多内存',
          '缓存配置过大',
          '数据倾斜',
        ],
        solutions: [
          '减少并发查询数量',
          '优化查询，减少内存消耗',
          '调整缓存大小',
          '优化数据分布',
        ],
      },
      frequent_gc: {
        name: 'GC 频繁',
        severity: 'warning',
        causes: ['堆内存配置过小', '对象创建过于频繁', '老年代碎片化'],
        solutions: ['增加堆内存大小', '优化代码，减少对象创建', '调整 GC 参数'],
      },
      memory_leak: {
        name: '内存泄漏',
        severity: 'critical',
        causes: [
          '对象未正确释放',
          '缓存过期策略失效',
          '连接未关闭',
          '静态集合持续增长',
        ],
        solutions: [
          '排查代码，修复泄漏点',
          '检查缓存配置',
          '确保资源正确释放',
          '使用内存分析工具 (MAT, jmap)',
        ],
      },
      oom: {
        name: 'OOM 错误',
        severity: 'critical',
        causes: [
          '堆内存配置不足',
          '查询消耗内存过大',
          '内存泄漏',
          '直接内存不足',
        ],
        solutions: [
          '增加堆内存配置',
          '优化查询',
          '排查内存泄漏',
          '增加直接内存限制',
          '限制查询并发度',
        ],
      },
    };
  }

  /**
   * 内存系统综合诊断
   */
  async diagnose(connection, includeDetails = true) {
    try {
      const startTime = new Date();

      // 1. 收集内存相关数据
      const memoryData = await this.collectMemoryData(connection);

      // 2. 执行专业诊断分析
      const diagnosis = this.performMemoryDiagnosis(memoryData);

      // 3. 生成专业建议
      const recommendations = this.generateMemoryRecommendations(diagnosis);

      // 4. 计算内存健康分数
      const healthScore = this.calculateMemoryHealthScore(diagnosis);

      const endTime = new Date();
      const analysisTime = endTime - startTime;

      return {
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        analysis_duration_ms: analysisTime,
        memory_health: healthScore,
        diagnosis_results: diagnosis,
        professional_recommendations: recommendations,
        raw_data: includeDetails ? memoryData : null,
        next_check_interval: this.suggestNextCheckInterval(diagnosis),
      };
    } catch (error) {
      throw new Error(`内存专家诊断失败: ${error.message}`);
    }
  }

  /**
   * 收集内存相关数据
   */
  async collectMemoryData(connection) {
    const data = {
      backends: [],
      compute_nodes: [],
      memory_configs: [], // 统一存储所有节点的内存配置（BE 和 CN）
      memory_stats: {
        total_nodes: 0,
        total_memory_bytes: 0,
        total_used_bytes: 0,
        by_node: [],
      },
      prometheus_metrics: {},
    };

    try {
      // 1. 获取所有 BE 节点信息
      const [backends] = await connection.query('SHOW BACKENDS');
      data.backends = backends;

      // 2. 获取所有 CN 节点信息
      let computeNodes = [];
      try {
        const [nodes] = await connection.query('SHOW COMPUTE NODES');
        computeNodes = nodes;
      } catch (error) {
        // SHOW COMPUTE NODES may not be supported in all versions
        console.log('SHOW COMPUTE NODES not supported, skipping CN nodes');
      }
      data.compute_nodes = computeNodes;

      // 3. 获取所有内存相关的配置项（BE 和 CN 使用相同的配置项名称）
      const memoryConfigNames = [
        'mem_limit',
        'query_max_memory_limit_percent',
        'load_process_max_memory_limit_bytes',
        'load_process_max_memory_limit_percent',
        'load_process_max_memory_hard_limit_ratio',
        'memory_limitation_per_thread_for_schema_change',
        'compaction_max_memory_limit',
        'compaction_max_memory_limit_percent',
        'compaction_memory_limit_per_worker',
        'update_memory_limit_percent',
        'lake_metadata_cache_limit',
        'lake_pk_preload_memory_limit_percent',
        'lake_pk_index_block_cache_limit_percent',
        'storage_page_cache_limit',
        'starlet_star_cache_mem_size_percent',
        'starlet_star_cache_mem_size_bytes',
        'write_buffer_size',
        'starlet_fs_stream_buffer_size_bytes',
      ];

      // 4. 统一通过 be_configs 查询所有节点配置（包括 BE 和 CN）
      try {
        console.log(`🔍 开始查询 ${memoryConfigNames.length} 个内存配置项...`);
        for (const configName of memoryConfigNames) {
          try {
            const [configs] = await connection.query(
              `SELECT * FROM information_schema.be_configs WHERE name = '${configName}'`,
            );
            if (configs && configs.length > 0) {
              console.log(`  ✅ ${configName}: 找到 ${configs.length} 条配置`);
              data.memory_configs.push(...configs);
            } else {
              console.log(`  ⚠️  ${configName}: 未找到配置`);
            }
          } catch (queryError) {
            console.error(
              `  ❌ ${configName}: 查询失败 - ${queryError.message}`,
            );
          }
        }
        console.log(
          `✅ 配置查询完成，共获取 ${data.memory_configs.length} 条配置`,
        );
      } catch (error) {
        console.error('获取内存配置失败:', error.message);
      }

      // 3. 收集每个节点的内存统计
      const allNodes = [
        ...backends.map((be) => ({
          type: 'BE',
          host: be.Host || be.IP,
          http_port: be.HttpPort || be.HeartbeatPort,
          alive: be.Alive === 'true',
        })),
        ...computeNodes.map((cn) => ({
          type: 'CN',
          host: cn.Host || cn.IP,
          http_port: cn.HttpPort || cn.HeartbeatPort,
          alive: cn.Alive === 'true',
        })),
      ];

      data.memory_stats.total_nodes = allNodes.length;

      // 4. 从每个节点获取内存 tracker 数据
      for (const node of allNodes) {
        if (!node.alive) {
          console.log(
            `跳过离线节点: ${node.type} ${node.host}:${node.http_port}`,
          );
          continue;
        }

        try {
          const memTrackerData = await this.fetchMemoryTracker(
            node.host,
            node.http_port,
          );

          if (memTrackerData) {
            const nodeStats = {
              node_type: node.type,
              host: node.host,
              http_port: node.http_port,
              memory_tracker: memTrackerData,
              total_bytes: this.parseMemoryBytes(
                memTrackerData.process_mem_limit || '0',
              ),
              used_bytes: this.parseMemoryBytes(
                memTrackerData.process_mem_bytes || '0',
              ),
            };

            data.memory_stats.by_node.push(nodeStats);
            data.memory_stats.total_memory_bytes += nodeStats.total_bytes;
            data.memory_stats.total_used_bytes += nodeStats.used_bytes;
          }
        } catch (error) {
          console.error(
            `获取节点 ${node.type} ${node.host}:${node.http_port} 内存数据失败: ${error.message}`,
          );
        }
      }
    } catch (error) {
      console.error('收集内存数据失败:', error.message);
    }

    return data;
  }

  /**
   * 从 BE/CN 节点获取内存 tracker 数据
   */
  async fetchMemoryTracker(host, httpPort) {
    const url = `http://${host}:${httpPort}/mem_tracker`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/html' },
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // 解析 HTML 表格中的内存 tracker 数据
      return this.parseMemoryTrackerHTML(html);
    } catch (error) {
      throw new Error(
        `获取内存 tracker 失败 (${host}:${httpPort}): ${error.message}`,
      );
    }
  }

  /**
   * 解析 HTML 表格中的内存 tracker 数据
   * HTML 格式:
   * <tr><td>1</td><td>process</td><td></td><td>151G</td><td>759M</td><td>793M</td></tr>
   * <tr><td>2</td><td>query_pool</td><td>process</td><td>136G</td><td>0</td><td>106M</td></tr>
   */
  parseMemoryTrackerHTML(html) {
    const trackers = {};
    let processMemLimit = '0';
    let processMemBytes = '0';

    // 提取所有表格行
    const trRegex =
      /<tr><td>(\d+)<\/td><td>([^<]+)<\/td><td>([^<]*)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g;
    let match;

    while ((match = trRegex.exec(html)) !== null) {
      const [, level, label, parent, limit, current, peak] = match;

      // process 是根节点
      if (label === 'process') {
        processMemLimit = limit === 'none' ? '0' : limit;
        processMemBytes = current === 'none' || current === '0' ? '0' : current;
      }

      // 存储所有 tracker
      trackers[label] = {
        level: parseInt(level),
        current: current === 'none' || current === '0' ? '0 B' : current,
        peak: peak === 'none' || peak === '0' ? '0 B' : peak,
        limit: limit === 'none' ? '0 B' : limit,
        parent: parent || null,
      };
    }

    return {
      process_mem_limit: processMemLimit,
      process_mem_bytes: processMemBytes,
      trackers: trackers,
    };
  }

  /**
   * 解析内存大小字符串 (如 "759M" 或 "45.23 GB") 转换为字节
   */
  parseMemoryBytes(sizeStr) {
    if (!sizeStr) return 0;
    if (typeof sizeStr === 'number') return sizeStr;

    const str = String(sizeStr).trim();

    // 匹配格式: "759M" 或 "45.23 GB" 或 "1.5T"
    const match = str.match(/^([0-9.]+)\s*([KMGTB])(B)?$/i);

    if (!match) {
      // 尝试直接解析为数字 (字节)
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (isNaN(value)) return 0;

    if (unit === 'K') return value * 1024;
    if (unit === 'M') return value * 1024 ** 2;
    if (unit === 'G') return value * 1024 ** 3;
    if (unit === 'T') return value * 1024 ** 4;
    if (unit === 'B') return value;

    return 0;
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
   * 执行内存诊断分析
   */
  performMemoryDiagnosis(memoryData) {
    const diagnosis = {
      overall_status: 'healthy',
      issues: [],
      statistics: {
        total_nodes: memoryData.memory_stats.total_nodes,
        total_memory_gb: this.formatBytes(
          memoryData.memory_stats.total_memory_bytes,
          'GB',
        ),
        used_memory_gb: this.formatBytes(
          memoryData.memory_stats.total_used_bytes,
          'GB',
        ),
        memory_usage_percent: 0,
        nodes_detail: [],
      },
    };

    try {
      // 1. 计算整体内存使用率
      if (memoryData.memory_stats.total_memory_bytes > 0) {
        diagnosis.statistics.memory_usage_percent = parseFloat(
          (
            (memoryData.memory_stats.total_used_bytes /
              memoryData.memory_stats.total_memory_bytes) *
            100
          ).toFixed(2),
        );
      }

      // 2. 分析每个节点的内存使用情况
      for (const nodeStats of memoryData.memory_stats.by_node) {
        const usagePercent =
          nodeStats.total_bytes > 0
            ? (nodeStats.used_bytes / nodeStats.total_bytes) * 100
            : 0;

        const nodeDetail = {
          node_type: nodeStats.node_type,
          host: nodeStats.host,
          http_port: nodeStats.http_port,
          total_gb: this.formatBytes(nodeStats.total_bytes, 'GB'),
          used_gb: this.formatBytes(nodeStats.used_bytes, 'GB'),
          usage_percent: parseFloat(usagePercent.toFixed(2)),
          status: 'healthy',
          top_consumers: [],
        };

        // 3. 分析内存消耗 top 模块
        const trackers = nodeStats.memory_tracker.trackers || {};
        const trackerList = Object.entries(trackers).map(([label, data]) => ({
          label,
          current_bytes: this.parseMemoryBytes(data.current),
          current: data.current,
          peak: data.peak,
          parent: data.parent,
        }));

        // 按当前使用量排序，取所有模块
        trackerList.sort((a, b) => b.current_bytes - a.current_bytes);
        nodeDetail.top_consumers = trackerList.map((t) => ({
          label: t.label,
          current: t.current,
          peak: t.peak,
          parent: t.parent,
        }));

        // 4. 检查节点内存使用率阈值
        if (usagePercent >= this.rules.memory_usage.emergency_threshold) {
          nodeDetail.status = 'critical';
          diagnosis.issues.push({
            severity: 'CRITICAL',
            node: `${nodeStats.node_type} ${nodeStats.host}`,
            issue: '内存使用率过高 (紧急)',
            current_value: `${usagePercent.toFixed(2)}%`,
            threshold: `${this.rules.memory_usage.emergency_threshold}%`,
            impact: '节点可能即将 OOM，严重影响查询稳定性',
            recommendation: '立即检查内存消耗模块，考虑重启节点或迁移查询',
          });
        } else if (usagePercent >= this.rules.memory_usage.critical_threshold) {
          nodeDetail.status = 'warning';
          diagnosis.issues.push({
            severity: 'WARNING',
            node: `${nodeStats.node_type} ${nodeStats.host}`,
            issue: '内存使用率较高',
            current_value: `${usagePercent.toFixed(2)}%`,
            threshold: `${this.rules.memory_usage.critical_threshold}%`,
            impact: '可能影响查询性能，有 OOM 风险',
            recommendation: '检查内存消耗模块，优化查询或增加内存',
          });
        } else if (usagePercent >= this.rules.memory_usage.warning_threshold) {
          nodeDetail.status = 'warning';
          diagnosis.issues.push({
            severity: 'INFO',
            node: `${nodeStats.node_type} ${nodeStats.host}`,
            issue: '内存使用率偏高',
            current_value: `${usagePercent.toFixed(2)}%`,
            threshold: `${this.rules.memory_usage.warning_threshold}%`,
            impact: '需要关注，避免进一步增长',
            recommendation: '监控内存趋势，必要时优化',
          });
        }

        diagnosis.statistics.nodes_detail.push(nodeDetail);
      }

      // 5. 确定整体状态
      const criticalIssues = diagnosis.issues.filter(
        (i) => i.severity === 'CRITICAL',
      );
      const warningIssues = diagnosis.issues.filter(
        (i) => i.severity === 'WARNING',
      );

      if (criticalIssues.length > 0) {
        diagnosis.overall_status = 'critical';
      } else if (warningIssues.length > 0) {
        diagnosis.overall_status = 'warning';
      } else {
        diagnosis.overall_status = 'healthy';
      }
    } catch (error) {
      console.error('执行内存诊断失败:', error.message);
      diagnosis.overall_status = 'error';
      diagnosis.issues.push({
        severity: 'ERROR',
        issue: '诊断过程出错',
        error: error.message,
      });
    }

    return diagnosis;
  }

  /**
   * 格式化字节数为指定单位
   */
  formatBytes(bytes, unit = 'GB') {
    if (!bytes) return 0;

    const value =
      unit === 'KB'
        ? bytes / 1024
        : unit === 'MB'
          ? bytes / 1024 ** 2
          : unit === 'GB'
            ? bytes / 1024 ** 3
            : unit === 'TB'
              ? bytes / 1024 ** 4
              : bytes;

    return parseFloat(value.toFixed(2));
  }

  /**
   * 生成内存优化建议
   */
  generateMemoryRecommendations(diagnosis) {
    const recommendations = [];

    // 1. 针对严重问题生成高优先级建议
    const criticalIssues = diagnosis.issues.filter(
      (i) => i.severity === 'CRITICAL',
    );
    if (criticalIssues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'urgent_action',
        title: '紧急：内存使用率过高',
        description: `发现 ${criticalIssues.length} 个节点内存使用率超过 ${this.rules.memory_usage.emergency_threshold}%`,
        actions: criticalIssues.map((issue) => ({
          action: `检查节点 ${issue.node}`,
          description: `当前使用率 ${issue.current_value}，${issue.recommendation}`,
        })),
      });
    }

    // 2. 针对警告问题生成中优先级建议
    const warningIssues = diagnosis.issues.filter(
      (i) => i.severity === 'WARNING',
    );
    if (warningIssues.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'optimization',
        title: '内存使用率偏高',
        description: `${warningIssues.length} 个节点内存使用率需要关注`,
        actions: warningIssues.map((issue) => ({
          action: `优化节点 ${issue.node}`,
          description: `当前使用率 ${issue.current_value}，${issue.recommendation}`,
        })),
      });
    }

    // 3. 分析 top 内存消耗模块，给出优化建议
    const topConsumers = new Map();
    for (const nodeDetail of diagnosis.statistics.nodes_detail) {
      for (const consumer of nodeDetail.top_consumers) {
        const currentBytes = this.parseMemoryBytes(consumer.current);
        const existing = topConsumers.get(consumer.label) || 0;
        topConsumers.set(consumer.label, existing + currentBytes);
      }
    }

    const topConsumersList = Array.from(topConsumers.entries())
      .map(([label, bytes]) => ({
        label,
        bytes,
        size: this.formatBytes(bytes, 'GB'),
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5);

    if (topConsumersList.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'memory_optimization',
        title: '内存消耗 Top 模块',
        description: '以下模块消耗内存最多，可考虑优化',
        actions: topConsumersList.map((consumer) => ({
          action: `检查 ${consumer.label}`,
          description: `当前消耗 ${consumer.size} GB`,
        })),
      });
    }

    // 4. 整体健康建议
    if (diagnosis.overall_status === 'healthy') {
      recommendations.push({
        priority: 'LOW',
        category: 'monitoring',
        title: '内存状态健康',
        description: `所有 ${diagnosis.statistics.total_nodes} 个节点内存使用正常`,
        actions: [
          {
            action: '持续监控',
            description: '建议配置 Prometheus 告警，及时发现内存异常',
          },
          {
            action: '定期分析',
            description: '建议每小时运行一次内存分析，跟踪趋势',
          },
        ],
      });
    }

    // 5. 通用优化建议
    recommendations.push({
      priority: 'LOW',
      category: 'best_practices',
      title: '内存管理最佳实践',
      description: '建议遵循的内存管理最佳实践',
      actions: [
        {
          action: '合理配置内存限制',
          description:
            'BE 内存建议配置为物理内存的 80-90%，为操作系统预留足够空间',
        },
        {
          action: '监控查询内存',
          description: '对于大查询，使用 query_mem_limit 限制单查询内存消耗',
        },
        {
          action: '优化缓存配置',
          description: '根据实际负载调整 Data Cache 和 Metadata Cache 大小',
        },
        {
          action: '定期重启',
          description: '对于长期运行的节点，建议定期滚动重启以释放内存碎片',
        },
      ],
    });

    return recommendations;
  }

  /**
   * 计算内存健康分数 (0-100)
   */
  calculateMemoryHealthScore(diagnosis) {
    let score = 100;

    // 1. 根据整体状态扣分
    if (diagnosis.overall_status === 'critical') {
      score -= 40;
    } else if (diagnosis.overall_status === 'warning') {
      score -= 20;
    }

    // 2. 根据问题严重程度扣分
    for (const issue of diagnosis.issues) {
      if (issue.severity === 'CRITICAL') {
        score -= 15;
      } else if (issue.severity === 'WARNING') {
        score -= 10;
      } else if (issue.severity === 'INFO') {
        score -= 5;
      }
    }

    // 3. 根据整体内存使用率扣分
    const usagePercent = diagnosis.statistics.memory_usage_percent || 0;
    if (usagePercent >= this.rules.memory_usage.emergency_threshold) {
      score -= 30;
    } else if (usagePercent >= this.rules.memory_usage.critical_threshold) {
      score -= 20;
    } else if (usagePercent >= this.rules.memory_usage.warning_threshold) {
      score -= 10;
    }

    // 确保分数在 0-100 范围
    score = Math.max(0, Math.min(100, score));

    // 4. 确定健康等级
    let level = 'excellent';
    let description = '';

    if (score >= 90) {
      level = 'excellent';
      description = '内存使用健康，所有节点运行正常';
    } else if (score >= 70) {
      level = 'good';
      description = '内存使用良好，部分节点需要关注';
    } else if (score >= 50) {
      level = 'fair';
      description = '内存使用一般，建议优化';
    } else if (score >= 30) {
      level = 'poor';
      description = '内存使用较差，需要尽快优化';
    } else {
      level = 'critical';
      description = '内存使用严重，可能影响系统稳定性';
    }

    return {
      score: score,
      level: level,
      description: description,
    };
  }

  /**
   * 建议下次检查间隔
   */
  suggestNextCheckInterval(diagnosis) {
    if (diagnosis.overall_status === 'critical') {
      return '立即检查 (每 1 分钟)';
    } else if (diagnosis.overall_status === 'warning') {
      return '频繁检查 (每 5 分钟)';
    } else {
      return '定期检查 (每 15 分钟)';
    }
  }

  /**
   * 格式化内存诊断报告
   */
  formatMemoryReport(result) {
    let report = '🧠 StarRocks 内存分析报告\n';
    report += '========================================\n\n';

    // 健康评分
    const health = result.memory_health;
    const healthEmoji =
      health.level === 'excellent'
        ? '✅'
        : health.level === 'good'
          ? '👍'
          : health.level === 'fair'
            ? '⚠️'
            : health.level === 'poor'
              ? '❌'
              : '🚨';

    report += `${healthEmoji} **健康评分**: ${health.score}/100 (${health.level.toUpperCase()})\n`;
    report += `   ${health.description}\n\n`;

    // 总体统计
    const stats = result.diagnosis_results.statistics;
    report += '📊 **整体统计**:\n';
    report += `   • 总节点数: ${stats.total_nodes}\n`;
    report += `   • 总内存: ${stats.total_memory_gb} GB\n`;
    report += `   • 已使用: ${stats.used_memory_gb} GB\n`;
    report += `   • 使用率: ${stats.memory_usage_percent}%\n\n`;

    // 内存配置信息
    if (
      result.raw_data &&
      result.raw_data.memory_configs &&
      result.raw_data.memory_configs.length > 0
    ) {
      report += '⚙️  **节点内存配置** (BE/CN):\n';

      // 按配置项分组
      const configByName = new Map();
      for (const config of result.raw_data.memory_configs) {
        const name = config.NAME || config.name;
        const value = config.VALUE || config.value;
        const type = config.TYPE || config.type;

        if (!configByName.has(name)) {
          configByName.set(name, []);
        }
        configByName.get(name).push({ value, type });
      }

      // 输出每个配置项
      for (const [name, configs] of configByName.entries()) {
        const uniqueValues = [...new Set(configs.map((c) => c.value))];
        if (uniqueValues.length === 1) {
          report += `   • ${name}: ${uniqueValues[0]} (type: ${configs[0].type})\n`;
        } else {
          report += `   • ${name}: [${uniqueValues.join(', ')}] (不同节点配置不同)\n`;
        }
      }
      report += '\n';
    }

    // 节点详情
    report += '🖥️  **节点详情**:\n';
    for (const node of stats.nodes_detail) {
      const statusEmoji =
        node.status === 'healthy'
          ? '✅'
          : node.status === 'warning'
            ? '⚠️'
            : '🚨';
      report += `   ${statusEmoji} ${node.node_type} ${node.host}:${node.http_port}\n`;

      // 首先显示节点总内存（mem_limit 配置）
      report += `      节点总内存配置: ${node.total_gb} GB\n`;

      // 找到 process 模块显示当前内存占用
      const processConsumer = node.top_consumers.find(
        (c) => c.label === 'process',
      );
      if (processConsumer) {
        report += `      当前内存占用: ${processConsumer.current} (使用率: ${node.usage_percent}%)\n`;
        report += `      历史峰值: ${processConsumer.peak}\n`;
      } else {
        report += `      当前内存占用: ${node.used_gb} GB (使用率: ${node.usage_percent}%)\n`;
      }

      // 显示子模块 Top 10 (排除 process)
      const subModules = node.top_consumers.filter(
        (c) => c.label !== 'process',
      );
      if (subModules.length > 0) {
        report += `      Top 10 子模块内存消耗:\n`;
        for (const consumer of subModules.slice(0, 10)) {
          report += `        - ${consumer.label}: ${consumer.current} (峰值: ${consumer.peak})\n`;
        }
      }
      report += '\n';
    }
    report += '\n';

    // 问题列表
    if (result.diagnosis_results.issues.length > 0) {
      report += '⚠️  **发现的问题**:\n';
      for (const issue of result.diagnosis_results.issues) {
        const issueEmoji =
          issue.severity === 'CRITICAL'
            ? '🚨'
            : issue.severity === 'WARNING'
              ? '⚠️'
              : 'ℹ️';
        report += `   ${issueEmoji} [${issue.severity}] ${issue.issue}\n`;
        report += `      节点: ${issue.node}\n`;
        report += `      当前值: ${issue.current_value} (阈值: ${issue.threshold})\n`;
        report += `      影响: ${issue.impact}\n`;
        report += `      建议: ${issue.recommendation}\n\n`;
      }
    }

    // 优化建议
    if (result.professional_recommendations.length > 0) {
      report += '💡 **优化建议**:\n';
      for (const rec of result.professional_recommendations) {
        const priorityEmoji =
          rec.priority === 'HIGH'
            ? '🚨'
            : rec.priority === 'MEDIUM'
              ? '⚠️'
              : 'ℹ️';
        report += `   ${priorityEmoji} [${rec.priority}] ${rec.title}\n`;
        report += `      ${rec.description}\n`;
        if (rec.actions && rec.actions.length > 0) {
          for (const action of rec.actions.slice(0, 3)) {
            report += `      - ${action.action}: ${action.description}\n`;
          }
        }
        report += '\n';
      }
    }

    report += `📅 **分析时间**: ${result.timestamp}\n`;
    report += `⚡ **分析耗时**: ${result.analysis_duration_ms}ms\n`;
    report += `🔄 **下次检查**: ${result.next_check_interval}\n`;

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   */
  getToolHandlers() {
    return {
      analyze_memory: async (args, context) => {
        console.log('🎯 内存分析接收参数:', JSON.stringify(args, null, 2));

        const connection = context.connection;
        const includeDetails = args.include_details !== false;

        const result = await this.diagnose(connection, includeDetails);

        const report = this.formatMemoryReport(result);

        // 只返回格式化报告，避免 JSON 数据过长导致 LLM 截断或忽略报告内容
        return {
          content: [
            {
              type: 'text',
              text: report,
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
        name: 'analyze_memory',
        description: `🧠 **内存分析** (开发中)

**功能**: 分析 StarRocks FE/BE 内存使用情况，检测 OOM 风险、内存泄漏和 GC 问题。

**计划分析内容**:
- ✅ 内存使用率监控 (进程内存、堆内存、直接内存)
- ✅ 堆内存分析 (新生代、老年代、永久代)
- ✅ GC 频率和暂停时间分析
- ✅ 内存泄漏检测 (持续增长、老年代占比)
- ✅ OOM 风险评估
- ✅ 查询内存消耗统计
- ✅ 内存趋势分析
- ✅ 智能优化建议

**适用场景**:
- 内存使用率过高
- 频繁 Full GC
- OOM 错误诊断
- 内存泄漏排查
- 查询内存优化
- 系统性能调优

**关键指标**:
- JVM 堆内存使用率
- GC 次数和暂停时间
- 进程常驻内存
- 查询内存消耗
- 缓存内存占用

**注意**: 当前为框架版本，具体分析功能正在开发中`,
        inputSchema: {
          type: 'object',
          properties: {
            component: {
              type: 'string',
              enum: ['fe', 'be', 'all'],
              description: '分析组件 (FE/BE/全部)',
              default: 'all',
            },
            time_range: {
              type: 'string',
              description: '分析时间范围，如 "1h", "24h", "7d"',
              default: '1h',
            },
            check_leak: {
              type: 'boolean',
              description: '是否进行内存泄漏检测',
              default: true,
            },
            include_details: {
              type: 'boolean',
              description: '是否包含详细的内存数据',
              default: true,
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksMemoryExpert };
