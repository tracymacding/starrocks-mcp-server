/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Query Profile 文本分析扩展
 *
 * 这个文件包含 analyze_profile_from_text 工具的实现
 * 需要将这些方法添加到 StarRocksQueryPerfExpert 类中
 */

/* eslint-disable no-undef */

/**
 * 解析 Query Profile 文本并提取关键信息
 *
 * 添加到 StarRocksQueryPerfExpert 类中
 */
function parseProfileText(profileText) {
  const analysis = {
    total_time_ms: 0,
    operators: [],
    scan_info: {
      total_rows: 0,
      total_bytes: 0,
      scanned_tables: [],
    },
    join_info: {
      joins: [],
      has_shuffle: false,
      has_broadcast: false,
    },
    aggregate_info: {
      aggregates: [],
      input_rows: 0,
    },
    memory_usage: {
      peak_memory_bytes: 0,
      operators_memory: [],
    },
    performance_issues: [],
  };

  const lines = profileText.split('\n');

  // 提取总执行时间
  for (const line of lines) {
    // Fragment 执行时间
    const fragmentTimeMatch = line.match(/Fragment\s+.*?:\s+([\d.]+)\s*ms/i);
    if (fragmentTimeMatch) {
      analysis.total_time_ms += parseFloat(fragmentTimeMatch[1]);
    }

    // Query 总时间
    const queryTimeMatch = line.match(/Query\s+Time:\s+([\d.]+)\s*ms/i);
    if (queryTimeMatch) {
      analysis.total_time_ms = parseFloat(queryTimeMatch[1]);
    }

    // 扫描算子信息
    if (line.includes('SCAN') || line.includes('OlapScanNode')) {
      const scanMatch = line.match(/(\w+)\s*\(.*?\).*?(\d+\.?\d*)\s*ms/);
      if (scanMatch) {
        const operator = scanMatch[1];
        const time = parseFloat(scanMatch[2]);
        analysis.operators.push({ type: 'SCAN', operator, time_ms: time });
      }

      // 提取扫描行数
      const rowsMatch = line.match(/rows\s*returned:\s*(\d+)/i);
      if (rowsMatch) {
        analysis.scan_info.total_rows += parseInt(rowsMatch[1]);
      }

      // 提取表名
      const tableMatch = line.match(/TABLE:\s*(\S+)/i);
      if (tableMatch && !analysis.scan_info.scanned_tables.includes(tableMatch[1])) {
        analysis.scan_info.scanned_tables.push(tableMatch[1]);
      }
    }

    // JOIN 算子信息
    if (line.includes('JOIN') || line.includes('HashJoinNode')) {
      const joinMatch = line.match(/(HASH|BROADCAST|SHUFFLE|MERGE)\s*JOIN/i);
      if (joinMatch) {
        const joinType = joinMatch[1].toUpperCase();
        const timeMatch = line.match(/(\d+\.?\d*)\s*ms/);

        analysis.join_info.joins.push({
          type: joinType,
          time_ms: timeMatch ? parseFloat(timeMatch[1]) : 0,
        });

        if (joinType === 'SHUFFLE') {
          analysis.join_info.has_shuffle = true;
        }
        if (joinType === 'BROADCAST') {
          analysis.join_info.has_broadcast = true;
        }
      }
    }

    // 聚合算子信息
    if (line.includes('AGGREGATE') || line.includes('AggregationNode')) {
      const aggMatch = line.match(/(\d+\.?\d*)\s*ms/);
      if (aggMatch) {
        analysis.aggregate_info.aggregates.push({
          time_ms: parseFloat(aggMatch[1]),
        });
      }

      const inputRowsMatch = line.match(/input\s*rows:\s*(\d+)/i);
      if (inputRowsMatch) {
        analysis.aggregate_info.input_rows += parseInt(inputRowsMatch[1]);
      }
    }

    // 内存使用信息
    if (line.includes('PeakMemoryUsage') || line.includes('MemoryUsed')) {
      const memMatch = line.match(/([\d.]+)\s*(MB|GB|KB)/i);
      if (memMatch) {
        let memBytes = parseFloat(memMatch[1]);
        const unit = memMatch[2].toUpperCase();

        if (unit === 'GB') memBytes *= 1024 * 1024 * 1024;
        else if (unit === 'MB') memBytes *= 1024 * 1024;
        else if (unit === 'KB') memBytes *= 1024;

        if (memBytes > analysis.memory_usage.peak_memory_bytes) {
          analysis.memory_usage.peak_memory_bytes = memBytes;
        }
      }
    }
  }

  return analysis;
}

/**
 * 分析 Profile 并识别性能问题
 *
 * 添加到 StarRocksQueryPerfExpert 类中
 */
function analyzeProfilePerformance(profileAnalysis) {
  const issues = [];
  const recommendations = [];

  // 1. 检查全表扫描
  if (profileAnalysis.scan_info.total_rows > 10000000) {
    issues.push({
      severity: 'WARNING',
      category: 'full_table_scan',
      title: `扫描行数过多 (${(profileAnalysis.scan_info.total_rows / 1000000).toFixed(2)}M 行)`,
      description: '查询可能进行了全表扫描或扫描了过多分区',
    });

    recommendations.push({
      priority: 'HIGH',
      category: 'scan_optimization',
      title: '优化数据扫描',
      description: '减少扫描行数可以显著提升查询性能',
      actions: [
        {
          action: '添加分区过滤',
          description: '如果表有分区键，在 WHERE 条件中添加分区键过滤',
        },
        {
          action: '创建索引',
          description: '为常用过滤列创建 BITMAP 或 BloomFilter 索引',
        },
        {
          action: '优化 WHERE 条件',
          description: '确保过滤条件可以下推到扫描算子',
        },
      ],
    });
  }

  // 2. 检查 Shuffle JOIN
  if (profileAnalysis.join_info.has_shuffle) {
    issues.push({
      severity: 'MEDIUM',
      category: 'shuffle_join',
      title: '存在 Shuffle JOIN',
      description: 'Shuffle JOIN 会在网络间传输大量数据，影响性能',
    });

    recommendations.push({
      priority: 'MEDIUM',
      category: 'join_optimization',
      title: '优化 JOIN 策略',
      description: '尝试将 Shuffle JOIN 转换为 Broadcast JOIN',
      actions: [
        {
          action: '检查 JOIN 条件',
          description: '确保 JOIN 条件使用了表的分桶键（Distribution Key）',
        },
        {
          action: '调整表的分桶设计',
          description: '如果经常在某列上 JOIN，考虑将该列设为分桶键',
        },
        {
          action: '使用 BROADCAST JOIN hint',
          description: '如果右表较小，可以使用 /*+ BROADCAST */ hint',
        },
      ],
    });
  }

  // 3. 检查聚合性能
  if (profileAnalysis.aggregate_info.input_rows > 10000000) {
    issues.push({
      severity: 'MEDIUM',
      category: 'large_aggregate',
      title: `聚合输入行数过多 (${(profileAnalysis.aggregate_info.input_rows / 1000000).toFixed(2)}M 行)`,
      description: '聚合操作的输入数据量过大，可能导致性能问题',
    });

    recommendations.push({
      priority: 'MEDIUM',
      category: 'aggregate_optimization',
      title: '优化聚合操作',
      description: '减少聚合输入数据量可以提升性能',
      actions: [
        {
          action: '前置过滤',
          description: '在聚合前尽早过滤数据，减少聚合输入行数',
        },
        {
          action: '创建物化视图',
          description: '对于频繁的聚合查询，考虑创建预聚合的物化视图',
        },
        {
          action: '使用 ROLLUP',
          description: '创建 ROLLUP 表进行预聚合',
        },
      ],
    });
  }

  // 4. 检查内存使用
  const memoryGb = profileAnalysis.memory_usage.peak_memory_bytes / (1024 * 1024 * 1024);
  if (memoryGb > 10) {
    issues.push({
      severity: memoryGb > 50 ? 'CRITICAL' : 'WARNING',
      category: 'high_memory',
      title: `内存使用过高 (${memoryGb.toFixed(2)} GB)`,
      description: '查询消耗了大量内存，可能导致 OOM',
    });

    recommendations.push({
      priority: 'HIGH',
      category: 'memory_optimization',
      title: '降低内存使用',
      description: '优化查询以减少内存消耗',
      actions: [
        {
          action: '降低并行度',
          description: '设置较小的 parallel_fragment_exec_instance_num',
          command: 'SET parallel_fragment_exec_instance_num = 4;',
        },
        {
          action: '优化 GROUP BY',
          description: '减少 GROUP BY 的基数，或分多步聚合',
        },
        {
          action: '分批处理',
          description: '将大查询拆分为多个小查询分批执行',
        },
      ],
    });
  }

  // 5. 识别慢算子
  const slowOperators = profileAnalysis.operators
    .filter(op => op.time_ms > 1000) // > 1秒
    .sort((a, b) => b.time_ms - a.time_ms)
    .slice(0, 3);

  if (slowOperators.length > 0) {
    issues.push({
      severity: 'INFO',
      category: 'slow_operators',
      title: `发现 ${slowOperators.length} 个耗时算子`,
      description: '以下算子执行时间较长，是性能瓶颈',
      details: slowOperators.map(op =>
        `${op.operator}: ${(op.time_ms / 1000).toFixed(2)}s`
      ),
    });
  }

  return {
    issues,
    recommendations,
    summary: {
      total_time_sec: (profileAnalysis.total_time_ms / 1000).toFixed(2),
      scan_rows: profileAnalysis.scan_info.total_rows,
      scan_tables: profileAnalysis.scan_info.scanned_tables,
      join_count: profileAnalysis.join_info.joins.length,
      aggregate_count: profileAnalysis.aggregate_info.aggregates.length,
      peak_memory_gb: memoryGb.toFixed(2),
      slow_operators: slowOperators,
    },
  };
}

/**
 * 格式化 Profile 文本分析报告
 *
 * 添加到 StarRocksQueryPerfExpert 类中
 */
function formatProfileTextAnalysisReport(profileAnalysis, performanceAnalysis) {
  let report = '📊 StarRocks Query Profile 分析报告\n';
  report += '========================================\n\n';

  // 基本信息
  report += '📋 **查询执行摘要**:\n';
  report += `   • 总执行时间: ${performanceAnalysis.summary.total_time_sec} 秒\n`;
  report += `   • 扫描行数: ${(performanceAnalysis.summary.scan_rows / 1000000).toFixed(2)}M 行\n`;
  report += `   • 涉及表: ${performanceAnalysis.summary.scan_tables.join(', ') || 'N/A'}\n`;
  report += `   • JOIN 操作: ${performanceAnalysis.summary.join_count} 次\n`;
  report += `   • 聚合操作: ${performanceAnalysis.summary.aggregate_count} 次\n`;
  report += `   • 峰值内存: ${performanceAnalysis.summary.peak_memory_gb} GB\n\n`;

  // JOIN 详情
  if (profileAnalysis.join_info.joins.length > 0) {
    report += '🔗 **JOIN 分析**:\n';
    profileAnalysis.join_info.joins.forEach((join, index) => {
      const icon = join.type === 'SHUFFLE' ? '⚠️ ' : '';
      report += `   ${icon}${index + 1}. ${join.type} JOIN - ${(join.time_ms / 1000).toFixed(2)}s\n`;
    });
    report += '\n';
  }

  // 慢算子
  if (performanceAnalysis.summary.slow_operators.length > 0) {
    report += '🐌 **耗时算子 Top 3**:\n';
    performanceAnalysis.summary.slow_operators.forEach((op, index) => {
      report += `   ${index + 1}. ${op.operator} - ${(op.time_ms / 1000).toFixed(2)}s\n`;
    });
    report += '\n';
  }

  // 性能问题
  if (performanceAnalysis.issues.length > 0) {
    report += '⚠️  **发现的性能问题**:\n';
    performanceAnalysis.issues.forEach((issue) => {
      const icon =
        issue.severity === 'CRITICAL' ? '🔴' :
        issue.severity === 'WARNING' ? '🟡' : 'ℹ️';
      report += `   ${icon} [${issue.severity}] ${issue.title}\n`;
      report += `      ${issue.description}\n`;
      if (issue.details) {
        issue.details.forEach(detail => {
          report += `      - ${detail}\n`;
        });
      }
      report += '\n';
    });
  }

  // 优化建议
  if (performanceAnalysis.recommendations.length > 0) {
    report += '💡 **优化建议**:\n';
    performanceAnalysis.recommendations.forEach((rec, index) => {
      report += `   ${index + 1}. [${rec.priority}] ${rec.title}\n`;
      report += `      ${rec.description}\n`;
      rec.actions.forEach((action) => {
        report += `      ✓ ${action.action}: ${action.description}\n`;
        if (action.command) {
          report += `        命令: ${action.command}\n`;
        }
      });
      report += '\n';
    });
  }

  report += '📅 **分析时间**: ' + new Date().toISOString() + '\n';
  report += '\n';
  report += '💡 **提示**: 此分析基于 Profile 文本内容，具体优化效果请根据实际情况评估。\n';

  return report;
}

/**
 * 工具处理器：analyze_profile_from_text
 *
 * 添加到 getToolHandlers() 返回对象中
 */
const analyzeProfileFromTextHandler = async (args) => {
  console.log('🎯 Profile 文本分析接收参数:', {
    profileTextLength: args.profile_text?.length || 0
  });

  const profileText = args.profile_text;

  if (!profileText || typeof profileText !== 'string' || profileText.trim().length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: '❌ 错误: 缺少必需参数 profile_text 或 profile 内容为空',
        },
      ],
      isError: true,
    };
  }

  try {
    // 解析 Profile 文本
    const profileAnalysis = parseProfileText(profileText);

    // 分析性能
    const performanceAnalysis = analyzeProfilePerformance(profileAnalysis);

    // 生成报告
    const report = formatProfileTextAnalysisReport(profileAnalysis, performanceAnalysis);

    return {
      content: [
        {
          type: 'text',
          text: report,
        },
        {
          type: 'text',
          text: '详细数据:\n' + JSON.stringify({
            profileAnalysis,
            performanceAnalysis
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 错误: ${error.message}\n\n` +
                `Profile 文本可能格式不正确或不完整。\n` +
                `请确保提供的是 StarRocks Query Profile 的完整文本。`,
        },
      ],
      isError: true,
    };
  }
};

/**
 * 工具定义：analyze_profile_from_text
 *
 * 添加到 getTools() 返回数组中
 */
const analyzeProfileFromTextTool = {
  name: 'analyze_profile_from_text',
  description: `📄 **分析本地 Profile 文件**

**功能**: 分析用户提供的 Query Profile 文本内容，识别性能瓶颈并提供优化建议。

**分析内容**:
- ✅ 解析 Profile 中的算子执行时间
- ✅ 识别扫描行数和涉及的表
- ✅ 分析 JOIN 类型和性能
- ✅ 检测聚合操作的效率
- ✅ 评估内存使用情况
- ✅ 识别慢算子和性能瓶颈
- ✅ 生成针对性优化建议

**使用场景**:
- 📁 分析本地保存的 Profile 文件
- 🔍 离线分析历史查询的 Profile
- 💾 分析已过期无法从数据库获取的 Profile
- 📤 分享和协作：将 Profile 发送给他人分析

**使用方法**:
在 Gemini CLI 中直接说："分析 profile.txt 文件"，AI 会自动读取文件内容并调用此工具。

**优势**:
- 不需要连接数据库
- 不需要 Query ID
- 支持历史 Profile 分析
- 可以分析任意来源的 Profile 文本

**注意**:
- Profile 内容会上传到中心服务器进行分析
- 文件大小建议不超过 10MB
- 请确保 Profile 文本格式完整`,
  inputSchema: {
    type: 'object',
    properties: {
      profile_text: {
        type: 'string',
        description: 'Query Profile 的完整文本内容（从文件读取或从数据库获取）',
      },
    },
    required: ['profile_text'],
  },
};

// 导出 (用于参考，实际需要手动集成到 query-perf-expert.js)
export {
  parseProfileText,
  analyzeProfilePerformance,
  formatProfileTextAnalysisReport,
  analyzeProfileFromTextHandler,
  analyzeProfileFromTextTool,
};
