# AI 工具选择优化方案总结

## 问题背景

用户询问"检查 Compaction 配置"时，AI 直接编写 SQL 查询而不是调用已有的 MCP 工具（如 `analyze_compaction`）。

**核心问题**：如何让 AI 更准确地选择和使用工具？

---

## 方案总览（按靠谱程度排序）

| 排名 | 方案 | 实施成本 | 效果 | 靠谱程度 |
|:----:|------|:--------:|:----:|:--------:|
| 1 | **丰富工具描述 + scope 参数** | 低 | 好 | ⭐⭐⭐⭐⭐ |
| 2 | **Skills + MCP Server** | 低 | 好 | ⭐⭐⭐⭐ |
| 3 | **分层设计（原子+复合工具）** | 中 | 很好 | ⭐⭐⭐⭐ |
| 4 | **原子工具 + Claude 编排** | 中 | 好 | ⭐⭐⭐ |
| 5 | **智能路由（服务端意图识别）** | 高 | 好 | ⭐⭐⭐ |
| 6 | **Fine-tuning** | 高 | 很好 | ⭐⭐ |
| 7 | **Skills + 脚本（替代 MCP）** | 低 | 有限 | ⭐⭐ |
| 8 | **专用模型** | 很高 | 最好 | ⭐ |

---

## 方案详解

### 方案 1：丰富工具描述 + scope 参数（推荐）

**思路**：在工具描述中列出适用场景，添加 scope 参数控制执行范围。

**实现示例**：

```javascript
// 工具描述
{
  name: "analyze_compaction",
  description: `Compaction 分析工具。
    适用场景：
    - 用户问"配置" → 使用 scope="config"
    - 用户问"慢任务" → 使用 scope="slow_tasks"
    - 用户问"全面诊断" → 使用 scope="full"
  `,
  parameters: {
    scope: {
      type: "string",
      enum: ["config", "status", "slow_tasks", "full"],
      description: "分析范围"
    }
  }
}

// 服务端实现
function analyze_compaction({ scope = "full" }) {
  const stepsMap = {
    "config": [3],           // 只执行配置检查
    "status": [1, 4],        // 概览 + 运行中任务
    "slow_tasks": [5],       // 慢任务检测
    "full": [1,2,3,4,5,6,7]  // 全部步骤
  };
  return executeSteps(stepsMap[scope]);
}
```

**优点**：
- 改动最小，见效快
- 服务端逻辑简单
- Claude 负责意图理解和参数选择

**缺点**：
- 需要在描述中穷举场景
- 描述可能变得很长

---

### 方案 2：Skills + MCP Server

**思路**：用 Claude Code 的 Skills 功能教会 AI 领域知识和工具选择策略。

**目录结构**：
```
.claude/skills/starrocks-compaction/
├── SKILL.md          # 主文件
├── reference.md      # 详细参考
└── scripts/
    └── helper.py     # 辅助脚本
```

**SKILL.md 示例**：
```markdown
---
name: starrocks-compaction
description: 分析 StarRocks Compaction 状态、配置、慢任务。当用户询问 Compaction 相关问题时使用。
---

# StarRocks Compaction 分析指南

## 场景识别与工具选择

| 用户意图 | 关键词 | 应调用的工具 |
|---------|--------|-------------|
| 查看配置 | 配置、参数、设置 | analyze_compaction(scope="config") |
| 检查状态 | 状态、情况、CS分数 | analyze_compaction(scope="status") |
| 慢任务诊断 | 慢、卡住、超时 | analyze_slow_compaction_jobs |
| 全面诊断 | 全面、完整、诊断 | analyze_compaction(scope="full") |

## 结果解读指南
...
```

**优点**：
- 不需要修改服务端代码
- 领域知识外置，易于维护和共享
- 可以包含详细的使用指南

**缺点**：
- 需要编写和维护 Skills 文件
- 依赖 Claude Code 的 Skills 功能

---

### 方案 3：分层设计（原子 + 复合工具）

**思路**：提供两层工具，上层是预设工作流，下层是原子能力。

**架构**：
```
┌─────────────────────────────────────────┐
│  上层：复合工具（预设工作流）            │
│  - analyze_compaction_full              │
│  - analyze_compaction_config            │
│  - analyze_compaction_status            │
├─────────────────────────────────────────┤
│  底层：原子工具（灵活组合）              │
│  - get_compaction_overview              │
│  - get_compaction_config                │
│  - get_running_compaction_tasks         │
│  - get_slow_compaction_tasks            │
│  - get_compaction_metrics               │
└─────────────────────────────────────────┘
```

**优点**：
- 灵活性和便利性兼顾
- 普通场景用复合工具，特殊需求用原子工具
- 对 LLM 能力要求适中

**缺点**：
- 需要重构服务端
- 工具数量增加
- 维护成本提高

---

### 方案 4：原子工具 + Claude 编排

**思路**：只提供原子工具，让 Claude 根据用户需求自由组合。

**工具列表**：
```
get_compaction_overview      # 获取概览
get_high_cs_partitions       # 获取高 CS 分区
get_compaction_config        # 获取配置
get_running_compaction_tasks # 获取运行中任务
get_slow_compaction_tasks    # 获取慢任务
get_compaction_metrics       # 获取监控指标
```

**用户问"查看配置"**：
```
Claude → 只调用 get_compaction_config → 1 次调用
```

**用户问"全面诊断"**：
```
Claude → 并行调用所有原子工具 → 汇总结果
```

**优点**：
- 服务端最简单，每个工具只做一件事
- 最大灵活性
- 可以并行调用提高效率

**缺点**：
- 对 LLM 能力要求高
- 可能选错或漏选工具
- 需要 LLM 具备领域知识来正确组合

---

### 方案 5：智能路由（服务端意图识别）

**思路**：在服务端分析用户问题，自动决定执行哪些步骤。

**实现**：
```javascript
function analyze_compaction({ query }) {
  // 意图识别
  const intent = classifyIntent(query);  // 规则 or LLM

  // 意图 → 步骤映射
  const stepsMap = {
    "查看配置": [3],
    "检查慢任务": [5],
    "当前状态": [1, 4],
    "全面诊断": [1,2,3,4,5,6,7]
  };

  return executeSteps(stepsMap[intent]);
}
```

**优点**：
- 用户体验最好，无感知
- 工具接口保持简单

**缺点**：
- 服务端复杂，大量 if-else 或正则匹配
- 意图识别可能不准确
- 如果用 LLM 做意图识别，增加延迟和成本

---

### 方案 6：Fine-tuning

**思路**：在通用模型（如 Qwen、DeepSeek）上微调，内化 StarRocks 运维知识。

**训练数据来源**：
- 值班周报（45 周，376 个案例）
- 技术文档（12 篇文章，121 个章节）
- 日常问答记录

**数据格式**：
```json
{
  "instruction": "帮我检查 Compaction 配置",
  "input": "",
  "output": "我来调用 analyze_compaction(scope='config') 获取配置..."
}
```

**训练方式**：
- 推荐 LoRA/QLoRA（成本低，效果好）
- 工具：LLaMA-Factory

**优点**：
- 意图理解更准确
- 工具选择更专业
- 回答质量更高

**缺点**：
- 需要训练数据和 GPU 资源
- 模型更新时需要重新训练
- 仍然需要 MCP Server 执行实际操作

---

### 方案 7：Skills + 脚本（替代 MCP）

**思路**：用 Skills 包含 Python/Bash 脚本，完全替代 MCP Server。

**目录结构**：
```
.claude/skills/starrocks-compaction/
├── SKILL.md
└── scripts/
    ├── get_config.py
    ├── check_slow_tasks.py
    └── full_analysis.py
```

**SKILL.md**：
```markdown
## 查看配置
运行脚本获取配置：
\`\`\`bash
python scripts/get_config.py
\`\`\`
```

**优点**：
- 轻量级，快速实现
- 不需要独立的服务端

**缺点**：
- 只适合简单场景
- 复杂流程难以维护
- 缺少工具抽象和状态管理

---

### 方案 8：专用模型

**思路**：从头训练 StarRocks 运维专用模型。

**优点**：
- 理论上效果最好
- 领域知识完全内化

**缺点**：
- 成本极高
- 需要海量高质量训练数据
- 仍然需要执行层（MCP Server）连接实际系统
- 模型更新维护困难

---

## 智能位置分析

| 方案 | 智能位置 | 对 LLM 要求 | 服务端复杂度 |
|------|---------|------------|-------------|
| 工具描述 + scope | Claude | 中 | 低 |
| Skills + MCP | Claude + Skills | 中 | 低 |
| 分层设计 | Claude | 中 | 中 |
| 原子工具 | Claude | 高 | 低 |
| 智能路由 | 服务端 | 低 | 高 |
| Fine-tuning | 模型内化 | 低 | 低 |
| 专用模型 | 模型内化 | 低 | 低 |

---

## 推荐实施路径

```
当前 ──────→ 短期 ──────→ 中期 ─────→ 长期（可选）
  │            │            │              │
  v            v            v              v
工具描述     + scope      Skills        Fine-tune
 优化         参数       + MCP
```

### 立即可做
- 优化工具描述，添加适用场景关键词
- 添加 scope 参数控制执行范围

### 下一步
- 编写 Skills 补充领域知识
- 考虑分层设计重构

### 未来
- 积累足够数据后考虑 Fine-tuning

---

## 核心结论

1. **知识层和执行层分离**：无论哪种方案，都需要执行层（MCP Server）连接实际系统
2. **智能放在哪里是关键选择**：服务端 vs Claude vs 模型内化
3. **成本效果平衡**：方案 1（工具描述 + scope）是最佳起点
4. **渐进式改进**：可以从简单方案开始，逐步演进

---

*文档生成时间：2025-01-01*
*讨论参与者：用户 & Claude*
