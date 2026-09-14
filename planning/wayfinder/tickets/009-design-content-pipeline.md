---
title: 定义 AI 辅助内容生产与校验流程
label: wayfinder:grilling
status: closed
issue_number: 10
issue_url: https://github.com/mnikn/text-wuxia/issues/10
assignee: root
blocked_by:
  - 006-design-event-dsl
resolution: "五步流程：人写大纲 → AI 按模板起草 → 人审改 → 校验门 → 入库（未来可接 AI API 全量生成）；脚手架 = 作者指南（指南即 prompt）+ 模板 passage；校验门三层：构建期 schema/引用/写宏 lint，CI 可达性+黄金回放+注册表 diff，人审裁决文风（lint 兜底，LLM 评审留待后续）；入口单元必配黄金场景测试；@source 头注释汇总合规清单；首批内容清单沿用 002 预算。"
---

## Question

独立开发者与 AI 如何从模板生成故事单元、Twee 文本和测试，并通过 schema、引用、可达性、状态效果及文风检查后进入构建？

## Resolution

**生产流程（五步）**：人写大纲（谁在哪、什么冲突、往哪收）→ AI 按模板起草 passage → 人审改（叙事质量与取舍设计）→ 校验门 → 提交入库。演进方向：后续可接入 AI API 全量生成故事单元，人审与校验门保持不变。

**脚手架（入 repo）**：作者指南一份（宏清单与用法、命名约定 `地点.主题.变体`、文风指南、术语表指针——**指南即 prompt**）+ 模板 passage 2～3 个（入口单元、后续节点、检定分支骨架，带注释）。不建独立 prompt 工程目录。

**校验门三层**：

- **构建期**（提取器内，每次构建必过）：schema（宏结构合法、标签字段齐全）、引用（next/passage/物品/能力 id 可解析）、写宏 lint、命名约定。
- **CI**（每次推送）：可达性（next 图连通无孤岛 + 模拟器 bot 覆盖报告"疑似不可达"）、黄金场景回放、注册表 diff（违反 id 只增不删即红）。
- **人审**（入库前）：文风与叙事质量的最终裁决；自动 lint 只兜底（禁用词表、术语一致性对照 CONTEXT.md）。

文风门不上 LLM 评审（后续再考虑）；明清白话词汇参照公共版权区语料。

**测试**：AI 随单元起草黄金场景测试（给定状态+种子 → 断言进入、选择与结算效果），与 passage 同一人审入库；**入口单元必配、后续节点选配**。

**合规**：passage 文件头一行 `@source: human / ai-draft / ai-draft+human-review`，构建期自动汇总进合规资产清单（与第三方素材清单同文件）。

**首批内容清单**：沿用 002 内容预算（护送链 8～12 节点、环境与生活单元 12～18、1 任务链、2 势力、3 出身、3 类证明），本票据不另立清单。
