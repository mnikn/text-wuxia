---
title: 定义故事单元 DSL 契约
label: wayfinder:grilling
status: closed
issue_number: 7
issue_url: https://github.com/mnikn/text-wuxia/issues/7
assignee: root
blocked_by:
  - 002-define-vertical-slice
  - 003-define-state-and-action-transaction
resolution: "一个故事单元 = 一个 Twee passage：元数据写在标签行，条件、选择、检定、效果用自定义宏内联在正文流里；构建期提取器编译为注册表，运行时同名宏渲染空操作、选择由交互壳按引擎结果渲染；once/cooldown/mutex 触发控制，priority 分层 + 层内加权随机，next 显式链接，检定档带缺省 ±20；校验精简为 TS 类型 + 提取期引用检查 + passage 写宏 lint。"
---

## Question

TypeScript DSL 应如何表达进入条件、权重、互斥、冷却、选择、检定、效果、后续故事单元和 Twee 文本引用，同时保持静态校验、可测试与 AI 可生成？

## Resolution

书写面：**一个故事单元 = 一个 Twee passage**。元数据写在 passage 标签行，进入条件、选择、检定、效果用自定义宏内联在正文流里（DoL 式书写体验）：

```twee
:: qinghe.escort.medic [story entry once weight:10 priority:剧情强制]
<<when>>flag("role.isCandidate") && at("qinghe.mountainPass")<</when>>

山道转过一道弯，松涛声里混进一声闷哼。带队弟子抬手止住队伍……
<<if $view.察觉成功>>你注意到坡上的灌木新折了几枝。<</if>>

<<choice "先护住药材担，退到岩石后" note="稳妥：耗时间，可能错过救人时机">>
  <<flag "escort.cargoProtected">>
  <<next "qinghe.escort.ambush">>
<</choice>>

<<choice "高声示警，叫破埋伏" when="flag('proof.martial')">>
  <<check ability="基本武艺:拳脚" difficulty=40>>
    <<band "大成功">><<next "qinghe.escort.ambush.routed">><</band>>
    <<band "成功">><<relation "zhaochuan.leader" +1>><<next "qinghe.escort.ambush.exposed">><</band>>
    <<band "失败 大失败">><<next "qinghe.escort.ambush">><</band>>
  <</check>>
<</choice>>
```

### 同一份文件，两个消费者

- **构建期提取器**（Tweego 管线内的小脚本）：解析 `[story ...]` 标签与 when/choice/check/flag/next 等宏，生成故事单元注册表；顺手做仅有的静态校验（id 唯一、next/passage 引用可解析）。
- **运行时 SugarCube**：同名宏注册为渲染空操作，正文照常渲染，if/print 只读插值；choice 块不由 passage 显示——选择按钮由交互壳（票据 005）按引擎提交结果渲染，与票据 003 的事务管线兼容。

### 语义（拷问轮次结论）

- **触发控制**：`once`（永久一次）/ `cooldown`（游戏时长，记入 stories 状态）/ `mutex`（单次入口评估内同组取一）；压制关系复用 flag+条件，不单设机制。
- **入口选择双段制**：`priority` 分层（沿用 003 固定排序：任务期限/剧情强制/环境变化/普通随机），高层有候选则低层不参评；同层按 `weight` 加权随机，消耗事务 RNG。
- **剧情链**：节点同构，`next` 显式链接；`entry: false` 节点永不参评，只能被链接到达。
- **检定**：`check` 宏声明能力与难度，档带全局缺省（差值 ≥20 大成功、≤-20 大失败），可覆盖阈值；`band` 分支独立效果与 `next`。
- **选择展示**沿用票据 004：选项级 `when` 不满足时，常规选项禁用示因、情境选项隐藏。
- **复杂效果逃生舱**：`<<do>>` 宏内写 JS 草稿代码；常用操作均有对应小宏。

### 校验与 AI

- 校验精简为：TS 类型、提取期 id/引用检查、开发期 lint 扫 passage 写宏；不导出 JSON Schema，不建封闭词汇注册表。
- AI 直接生成"文本+宏"，比生成 TS 对象更自然；命名约定 `地点.主题.变体` 即 passage 名。
- 黄金场景回放测试为建议实践；引擎保证给定快照+种子确定性（票据 003）。
