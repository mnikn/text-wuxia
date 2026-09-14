---
title: 研究 DoL 的行动与 Passage 生命周期
label: wayfinder:research
status: closed
issue_number: 12
issue_url: https://github.com/mnikn/text-wuxia/issues/12
assignee: dol_action_lifecycle_research
blocked_by: []
resolution: "参考 DoL 的集中时间轴、跨时间边界结算与动作后事件选择，但不沿用 Passage 内直接写状态。TypeScript 事务执行器按固定顺序完成验证、RNG、成本、效果、时间、世界与事件结算后原子提交；SugarCube Passage 只读渲染。研究资产见 ../research/dol-action-and-passage-lifecycle.md。"
---

## Question

DoL 官方代码如何组织玩家行动、SugarCube Passage 生命周期、变量修改、时间推进、事件选择与渲染；哪些架构经验适合以 clean-room 方式转化为本项目的行动事务顺序，哪些耦合和历史模式必须避开？

## Resolution

[研究资产：DoL 行动与 Passage 生命周期](../research/dol-action-and-passage-lifecycle.md)

参考 DoL 的集中时间轴、跨时间边界结算与动作后事件选择，但不沿用 Passage 内直接写状态。所有玩家行动由 TypeScript 事务执行器按“意图、验证、草稿、RNG、成本与效果、分段时间、世界/期限、至多一个后续故事、完整验证、原子提交”固定顺序结算。SugarCube Passage 只读取已提交结果并渲染；渲染、Header/Footer、导航改道均不得承担领域写入。
