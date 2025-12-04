#!/usr/bin/env node

/**
 * StarRocks MCP Server - Expert Enhanced Version
 * 集成多专家系统的增强版本
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import mysql from 'mysql2/promise';

// 导入专家系统
import { StarRocksExpertCoordinator } from './experts/expert-coordinator.js';

class StarRocksMcpServerExpert {
  constructor() {
    this.server = new Server(
      {
        name: 'starrocks-mcp-server-expert',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 初始化专家协调器
    this.expertCoordinator = new StarRocksExpertCoordinator();

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // 从专家协调器获取所有工具
      const expertTools = this.expertCoordinator.getAllTools();

      return {
        tools: expertTools
      };
    });

    // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Try to delegate to expert coordinator first
        if (this.expertCoordinator.toolHandlers.has(name)) {
          const connection = await this.createConnection();
          try {
            const context = { connection };
            const result = await this.expertCoordinator.callToolHandler(name, args, context);

            // Check if result needs formatting
            if (result && result._needsFormatting) {
              return this.formatAnalysisResult(result);
            }

            return result;
          } finally {
            await connection.end();
          }
        }

        // === Unknown tool ===
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }


  /**
   * 格式化分析结果（根据类型选择格式化方法）
   */
  formatAnalysisResult(result) {
    if (result._formatType === 'expert_analysis') {
      const report = this.formatExpertAnalysisReport(result.data);
      return {
        content: [
          {
            type: 'text',
            text: report
          },
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }
        ]
      };
    } else if (result._formatType === 'single_expert') {
      const report = this.formatSingleExpertReport(result.data, result._expertType);
      return {
        content: [
          {
            type: 'text',
            text: report
          },
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }
        ]
      };
    }

    // 默认返回 JSON
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * 格式化多专家分析报告
   */
  formatExpertAnalysisReport(analysis) {
    const assessment = analysis.comprehensive_assessment;
    const metadata = analysis.analysis_metadata;

    let report = '🎯 StarRocks 多专家协调分析报告\n';
    report += '=====================================\n\n';

    // 综合评估
    const healthEmoji = assessment.health_level === 'EXCELLENT' ? '🟢' :
                       assessment.health_level === 'GOOD' ? '🟡' :
                       assessment.health_level === 'FAIR' ? '🟠' : '🔴';

    report += `${healthEmoji} **综合健康评估**: ${assessment.overall_health_score}/100 (${assessment.health_level})\n`;
    report += `📊 **系统状态**: ${assessment.overall_status}\n`;
    report += `🔍 **分析范围**: ${metadata.experts_count}个专家模块\n`;
    report += `⚠️ **发现问题**: ${metadata.total_issues_found}个\n`;

    if (metadata.cross_impacts_found > 0) {
      report += `🔄 **跨模块影响**: ${metadata.cross_impacts_found}个\n`;
    }

    report += `\n${assessment.summary}\n\n`;

    // 各专家健康状态
    report += '📋 **各专家模块状态**:\n';
    Object.entries(assessment.expert_scores).forEach(([expertName, scores]) => {
      const emoji = expertName === 'storage' ? '💾' :
                   expertName === 'compaction' ? '🗜️' : '🔧';
      const statusEmoji = scores.status === 'HEALTHY' ? '✅' :
                         scores.status === 'WARNING' ? '⚠️' : '🚨';

      report += `  ${emoji} ${expertName.toUpperCase()}: ${scores.score}/100 ${statusEmoji}\n`;
    });

    // 风险评估
    if (assessment.system_risk_assessment.total_risks > 0) {
      report += '\n🔥 **系统风险评估**:\n';
      report += `  • 风险等级: ${assessment.system_risk_assessment.overall_risk_level}\n`;
      report += `  • 风险项目: ${assessment.system_risk_assessment.total_risks}个\n`;
    }

    // 跨模块影响
    if (analysis.cross_module_analysis && analysis.cross_module_analysis.impacts.length > 0) {
      report += '\n🔗 **跨模块影响分析**:\n';
      analysis.cross_module_analysis.impacts.forEach(impact => {
        report += `  • ${impact.explanation} [${impact.impact_level}]\n`;
      });
    }

    // 优化建议
    if (analysis.prioritized_recommendations.length > 0) {
      report += '\n💡 **优化建议** (按优先级排序):\n';
      analysis.prioritized_recommendations.slice(0, 5).forEach(rec => {
        const coordNote = rec.coordination_notes ? ' 🔄' : '';
        report += `  ${rec.execution_order}. [${rec.priority}] ${rec.title}${coordNote}\n`;
        if (rec.source_expert === 'coordinator') {
          report += `     ↳ 跨模块协调建议\n`;
        }
      });

      if (analysis.prioritized_recommendations.length > 5) {
        report += `  ... 还有${analysis.prioritized_recommendations.length - 5}个建议，请查看详细JSON输出\n`;
      }
    }

    report += '\n📋 详细分析数据请查看JSON输出部分';

    return report;
  }

  /**
   * 格式化单专家报告
   */
  formatSingleExpertReport(result, expertType) {
    const emoji = expertType === 'storage' ? '💾' :
                 expertType === 'compaction' ? '🗜️' :
                 expertType === 'import' ? '📥' : '🔧';
    const healthKey = expertType === 'storage' ? 'storage_health' :
                     expertType === 'compaction' ? 'compaction_health' :
                     expertType === 'import' ? 'import_health' : 'system_health';
    const health = result[healthKey];

    let report = `${emoji} StarRocks ${expertType.toUpperCase()} 专家分析报告\n`;
    report += '=====================================\n\n';

    const healthEmoji = health.level === 'EXCELLENT' ? '🟢' :
                       health.level === 'GOOD' ? '🟡' :
                       health.level === 'FAIR' ? '🟠' : '🔴';

    report += `${healthEmoji} **${expertType}健康分数**: ${health.score}/100 (${health.level})\n`;
    report += `📊 **状态**: ${health.status}\n`;
    report += `⏱️ **分析耗时**: ${result.analysis_duration_ms}ms\n\n`;

    const diagnosis = result.diagnosis_results;

    // 问题摘要
    report += `📋 **问题摘要**: ${diagnosis.summary}\n`;
    report += `🔍 **问题统计**: ${diagnosis.total_issues}个 (严重: ${diagnosis.criticals.length}, 警告: ${diagnosis.warnings.length})\n\n`;

    // 严重问题
    if (diagnosis.criticals.length > 0) {
      report += '🚨 **严重问题**:\n';
      diagnosis.criticals.forEach(issue => {
        report += `  • ${issue.message} [${issue.urgency}]\n`;
        if (issue.impact) {
          report += `    影响: ${issue.impact}\n`;
        }
      });
      report += '\n';
    }

    // 警告问题
    if (diagnosis.warnings.length > 0) {
      report += '⚠️ **警告问题**:\n';
      diagnosis.warnings.slice(0, 3).forEach(warning => {
        report += `  • ${warning.message}\n`;
      });
      if (diagnosis.warnings.length > 3) {
        report += `  ... 还有${diagnosis.warnings.length - 3}个警告\n`;
      }
      report += '\n';
    }

    // 专业建议
    if (result.professional_recommendations && result.professional_recommendations.length > 0) {
      report += '💡 **专业建议**:\n';
      result.professional_recommendations.slice(0, 3).forEach((rec, index) => {
        report += `  ${index + 1}. [${rec.priority}] ${rec.title}\n`;
      });
      if (result.professional_recommendations.length > 3) {
        report += `  ... 还有${result.professional_recommendations.length - 3}个建议\n`;
      }
      report += '\n';
    }

    report += '📋 详细诊断数据请查看JSON输出部分';

    return report;
  }

  /**
   * 创建数据库连接
   */
  async createConnection() {
    const dbConfig = {
      host: process.env.SR_HOST,
      user: process.env.SR_USER,
      password: process.env.SR_PASSWORD,
      database: process.env.SR_DATABASE || 'information_schema',
      port: process.env.SR_PORT || 9030,
    };

    if (!dbConfig.host || !dbConfig.user || dbConfig.password === undefined) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing StarRocks connection details. Please set SR_HOST, SR_USER, and SR_PASSWORD environment variables.');
    }

    return await mysql.createConnection(dbConfig);
  }

  // === 保留原有方法 (简化版本，保持兼容性) ===


  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new StarRocksMcpServerExpert();
server.run().catch(console.error);