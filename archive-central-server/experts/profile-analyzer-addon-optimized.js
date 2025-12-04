/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 优化版本的 analyze_profile_from_text 工具处理器
 *
 * 主要优化：
 * 1. 不返回完整的 JSON 数据
 * 2. 只返回核心的分析报告
 * 3. 减少输出 token 使用
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

    // ✅ 优化：只返回分析报告，不返回完整 JSON
    // 这样可以大幅减少 token 使用
    return {
      content: [
        {
          type: 'text',
          text: report,
        },
        // ✅ 可选：返回压缩的摘要数据
        {
          type: 'text',
          text: formatCompactSummary(performanceAnalysis),
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
 * 格式化压缩的摘要数据（替代完整 JSON）
 */
function formatCompactSummary(performanceAnalysis) {
  const summary = performanceAnalysis.summary;

  let compact = '\n📊 **关键指标**:\n';
  compact += `执行时间: ${summary.total_time_sec}s | `;
  compact += `扫描: ${(summary.scan_rows / 1000000).toFixed(1)}M行 | `;
  compact += `内存: ${summary.peak_memory_gb}GB\n`;

  if (summary.scan_tables && summary.scan_tables.length > 0) {
    compact += `涉及表: ${summary.scan_tables.join(', ')}\n`;
  }

  compact += `JOIN: ${summary.join_count}次 | 聚合: ${summary.aggregate_count}次\n`;

  // 问题统计
  if (performanceAnalysis.issues.length > 0) {
    const critical = performanceAnalysis.issues.filter(i => i.severity === 'CRITICAL').length;
    const warning = performanceAnalysis.issues.filter(i => i.severity === 'WARNING').length;

    compact += `\n⚠️  问题: ${performanceAnalysis.issues.length} 个`;
    if (critical > 0) compact += ` (${critical} 严重)`;
    if (warning > 0) compact += ` (${warning} 警告)`;
    compact += '\n';
  }

  // 优化建议统计
  if (performanceAnalysis.recommendations.length > 0) {
    const high = performanceAnalysis.recommendations.filter(r => r.priority === 'HIGH').length;
    compact += `💡 优化建议: ${performanceAnalysis.recommendations.length} 条`;
    if (high > 0) compact += ` (${high} 高优先级)`;
    compact += '\n';
  }

  return compact;
}

export {
  analyzeProfileFromTextHandler,
  formatCompactSummary,
};
