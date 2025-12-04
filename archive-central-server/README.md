# 归档：中心服务代码

本目录包含旧的中心服务（Central API Server）相关代码，已迁移到独立项目。

## ⚠️ 重要说明

**这些代码已过时，仅供参考！**

最新的中心服务代码已迁移到：
```
/home/disk5/dingkai/github/operation-experts/starrocks-expert
```

或远程仓库：
```
https://github.com/tracymacding/operation-experts
```

## 📁 目录结构

```
archive-central-server/
├── experts/                    # 11 个 Expert 实现（旧版）
│   ├── storage-expert-solutionc.js
│   ├── compaction-expert-solutionc.js
│   ├── ingestion-expert-solutionc.js
│   └── ...
│
├── scripts/                    # 启动脚本（旧版）
│   ├── start-central-server.sh
│   ├── start-central-server-solutionc.sh
│   └── ...
│
├── docs/                       # 文档（旧版）
│   ├── DEPLOYMENT_MODE_GUIDE.md
│   ├── SOLUTION_C_GUIDE.md
│   └── ...
│
├── index-expert-api.js         # 服务器实现（旧版）
├── index-expert-api-complete.js
├── index-expert-api-solutionc.js
└── ...
```

## 🔄 迁移时间

- **归档日期**: 2025-10-13
- **迁移原因**: 将中心服务从 gemini-cli 剥离为独立项目
- **新项目**: operation-experts/starrocks-expert

## 🗑️ 清理建议

在确认新项目运行稳定后，可以删除整个 `archive-central-server/` 目录。

## 📚 参考

新项目文档：
- [新项目 README](https://github.com/tracymacding/operation-experts/tree/main/starrocks-expert)
- [迁移总结](https://github.com/tracymacding/operation-experts/blob/main/starrocks-expert/MIGRATION_SUMMARY.md)

---

**归档人**: Claude Code
**归档时间**: 2025-10-13
