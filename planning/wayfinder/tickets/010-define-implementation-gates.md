---
title: 定义里程碑、验收门与实施依赖
label: wayfinder:grilling
status: closed
issue_number: 11
issue_url: https://github.com/mnikn/text-wuxia/issues/11
assignee: root
blocked_by:
  - 001-verify-technical-foundation
  - 002-define-vertical-slice
  - 003-define-state-and-action-transaction
  - 004-define-combat-loop
  - 005-define-mobile-interface
  - 006-design-event-dsl
  - 007-design-save-contract
  - 008-balance-progression-and-economy
  - 009-design-content-pipeline
resolution: "九个里程碑 M0～M8（脚手架→事务核心→{交互壳,故事管线}→生活循环→战斗→护送内容→存档→打磨验收），卡片五字段集中于 planning/milestones.md；性能预算：首屏 ≤3s、行动 ≤100ms、初始包 ≤2MB gzip；事务核心与数值不变量必须自动化测试，不设全局覆盖率；M3 后内容持续并行；MVP 后单 HTML 先行 → APK → 桌面，再反馈收集→内容储备→元进度。"
---

## Question

开发应拆成哪些可演示里程碑，每个里程碑的交付物、测试、性能预算、退出条件和下游依赖是什么，如何汇总为详细 MVP 计划与低精度后续路线图？

## Resolution

**里程碑骨架**（依赖链 M0→M1→{M2,M3}→M4→M5→M6→M7→M8，M2/M3 可互换）：

- **M0 工程脚手架**：构建链跑通，CI 绿，PWA 可添加到主屏打开空白壳。
- **M1 事务核心**：GameState/行动管线/确定性 RNG/时钟调度；同快照+种子两次执行逐字节一致。
- **M2 交互壳与渲染**：方案 D 壳手机可操作；SugarCube 只读渲染接通；logline 嵌入正文流。
- **M3 故事管线**：宏提取器+注册表+入口评估；示例单元从 Twee 走到可玩；构建期校验门生效。
- **M4 生活循环**：三维/打工/采集/训练/死线可玩；balance.ts 接入。
- **M5 战斗**：回合事务+伤势+四结局写回；复用检定档带。
- **M6 护送切片内容**：护送链 8～12 节点+环境单元+两成两败收束入库，内容校验门全绿。
- **M7 存档**：双缓冲+自动档+3 手动槽+导出导入；损坏回退可演示。
- **M8 打磨与验收**：模拟器四 bot 全绿（margin 报告产出）；性能预算达标；真机验收，试玩版发布。

**里程碑卡片**统一五字段：可演示交付物（demo 脚本）、测试要求、退出条件、下游依赖、关联票据；集中维护于 [planning/milestones.md](../milestones.md)（已随本票据建立）。

**性能预算**（中端安卓，Redmi Note 级）：首屏可交互 ≤3s（4G）；行动提交→渲染 ≤100ms；初始包 ≤2MB gzip；存档读写不阻塞交互；模拟器全场景 CI ≤2min；不测帧率。

**测试分层**：事务核心与数值不变量必须自动化（单测+模拟器断言）；故事单元走黄金场景规则（入口必配）；交互壳与体验只做人审验收；不设全局覆盖率数字。

**并行策略**：M3 验收后内容生产按 009 管线持续并行，不阻塞引擎里程碑；M6 是齐套验收点而非开工点。

**MVP 后路线图**（低精度，只定方向与先后）：单 HTML（itch.io）先行 → Android APK → 桌面；随后 试玩反馈收集 → 内容储备期（特殊武学/特殊招式、多敌人）→ 跨周目元进度。发行顺序一项同步关闭 map.md 的悬而未决项。
