---
title: 定义存档契约与迁移起点
label: wayfinder:grilling
status: closed
issue_number: 8
issue_url: https://github.com/mnikn/text-wuxia/issues/8
assignee: root
blocked_by:
  - 001-verify-technical-foundation
  - 003-define-state-and-action-transaction
resolution: "自有存档层（TS，可 Node 无头测试），SugarCube 不参与；存档包 = meta + GameState 快照，UI/view model 不进契约；整数版本 + 逐版本纯函数迁移链，试玩版发布起承诺真实迁移；双缓冲原子写 + 主坏回退；行动提交后自动存档（1 自动 + 3 手动槽）；IndexedDB + persist 申请，localStorage 只放设置与指针；新开局 = 新种子+行动号 0；设置页导出/导入 JSON。"
---

## Question

公开试玩版起哪些数据构成稳定存档契约，版本号、迁移链、损坏恢复、自动存档和 PWA 存储限制如何处理？

## Resolution

**宿主与边界**：自有存档层（纯 TS，可在 Node 无头测试）；SugarCube 仅渲染、内部历史关闭，不参与存档。

**存档包**（契约全部内容）：

```json
{
  "meta": {
    "version": 1, "actionNumber": 37, "seed": "…", "playthroughId": "…",
    "gameTime": "第2日·午时", "location": "清河村", "savedAt": "ISO-8601"
  },
  "state": { "player": {}, "world": {}, "stories": {}, "quests": {}, "clock": {}, "rng": {} }
}
```

- meta 仅供存档列表展示与诊断；恢复只用 `version` + `state`。
- **不进契约**：UI 展开态、抽屉页签、view model、渲染缓存（启动后从快照重建）。
- 内容侧规则：注册表 id（地点/物品/故事单元/人物）**只增不删**，废弃改标记。
- 持久日志在 GameState 内环形截断（最近约 200 条），防快照膨胀。

**版本与迁移**：整数版本序列（与游戏版本号解耦）；迁移 = 逐版本纯函数链 `migrate(v) → v+1`，读档时顺链升至当前版，任一失败判损坏。MVP 阶段允许破坏性升级（拒绝旧档、提示新局）；**公开试玩版发布之日起承诺真实迁移**。CI 保留"旧档 fixture → 迁移链 → 当前版"回归测试位。

**写入与损坏恢复**：双缓冲原子写（先写备用区、校验通过、再切指针）；读档校验 JSON 结构、版本字段、必需域存在；主档损坏自动回退备用区，双份皆毁才提示"存档损坏，开新局"。

**自动存档**：行动事务提交成功后写自动档（行动号即检查点序列）；`pagehide` 兜底存一次；战斗等事务内部不产生中间存档；读档永远回到行动边界。

**槽位**：1 自动档 + 3 手动档；列表展示 meta（第 N 日·时辰、地点、存档时间）。

**介质与 PWA**：IndexedDB 存存档主体；localStorage 仅放设置与槽位指针；启动时 `navigator.storage.persist()` 申请持久化；存储紧张时 UI 警告；帮助页引导"添加到主屏"（不强制）。

**新开局**：新种子 + 行动号 0 的独立周目，创建即写自动档；覆盖旧自动档前给一句确认；MVP 无跨周目元进度。

**导出/导入**：设置页提供入口；导出为 JSON 文件；导入走与读档完全相同的校验 + 迁移链；兼作试玩期 bug 反馈通道。
