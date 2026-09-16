# 内容重写与故事 DSL 迁移 · 本地资产

GitHub Issues 是唯一权威追踪器，票据不在本地做镜像：

- 地图：[内容重写与故事 DSL 迁移路线](https://github.com/mnikn/text-wuxia/issues/13)（Decisions so far 直接编辑 issue body）。
- 票据：地图的子 Issue（当前开着的：#20 首批内容、#21 重建与总验收、#23 战斗与武学结算；#14～#19、#22、#24、#25 已解决）。认领 = assignee；解决 = resolution comment + close；不开放未认领的子 Issue 不入前沿。
- 前一张图（已完成归档）见 [planning/wayfinder/](../wayfinder/)。

本地只保留三类资产，从对应 issue 链接进来：

- `research/`：调研报告（如 [twee-parser-ecosystem.md](research/twee-parser-ecosystem.md)，对应 [issue #15](https://github.com/mnikn/text-wuxia/issues/15)；[dol-passage-and-choice-surface.md](research/dol-passage-and-choice-surface.md)，对应 [issue #16](https://github.com/mnikn/text-wuxia/issues/16)；[beida-xiakexing-vitals-neili.md](research/beida-xiakexing-vitals-neili.md)，为 [issue #24](https://github.com/mnikn/text-wuxia/issues/24) 核对生命与内力的增长、恢复结构）。
- `prototypes/`：原型与设定定稿（如 [worldview-seed-v3.md](prototypes/worldview-seed-v3.md)，对应 [issue #14](https://github.com/mnikn/text-wuxia/issues/14)；[survival-loop.html](prototypes/survival-loop.html)，对应 [issue #24](https://github.com/mnikn/text-wuxia/issues/24)，**规则冻结版（2026-09-16）**——体力 / 三层生命 / 双层内力三条资源与失败延续的规则验证器，只定规则、**不作界面基线**，`==CORE==` 段可整段移植进 `src/engine/`，动作与数值仅作占位；身体状态标签与伤势递进档本阶段不定义）。
- `specs/`：决议产出的规格资产（如 [dsl-vocabulary.md](specs/dsl-vocabulary.md)，书写面谓词与效果词表 + AI 起草模板，对应 [issue #19](https://github.com/mnikn/text-wuxia/issues/19)）。
