# 内容重写与故事 DSL 迁移 · 本地资产

GitHub Issues 是唯一权威追踪器，票据不在本地做镜像：

- 地图：[内容重写与故事 DSL 迁移路线](https://github.com/mnikn/text-wuxia/issues/13)（Decisions so far 直接编辑 issue body）。
- 票据：地图的子 Issue（当前开着的：#21 重建与总验收、#23 战斗与武学结算；#14～#20、#22、#24～#26 已解决）。认领 = assignee；解决 = resolution comment + close；不开放未认领的子 Issue 不入前沿。
- 前一张图（已完成归档）见 [planning/wayfinder/](../wayfinder/)。

本地只保留三类资产，从对应 issue 链接进来：

- `research/`：调研报告（如 [twee-parser-ecosystem.md](research/twee-parser-ecosystem.md)，对应 [issue #15](https://github.com/mnikn/text-wuxia/issues/15)；[dol-passage-and-choice-surface.md](research/dol-passage-and-choice-surface.md)，对应 [issue #16](https://github.com/mnikn/text-wuxia/issues/16)；[beida-xiakexing-vitals-neili.md](research/beida-xiakexing-vitals-neili.md)，为 [issue #24](https://github.com/mnikn/text-wuxia/issues/24) 核对生命与内力的增长、恢复结构）。
- `prototypes/`：原型与设定定稿（如 [worldview-seed-v3.md](prototypes/worldview-seed-v3.md)，对应 [issue #14](https://github.com/mnikn/text-wuxia/issues/14)；[survival-loop.html](prototypes/survival-loop.html)，对应 [issue #24](https://github.com/mnikn/text-wuxia/issues/24)，**规则冻结版（2026-09-16）**——体力 / 三层生命 / 双层内力三条资源与失败延续的规则验证器，只定规则、**不作界面基线**，`==CORE==` 段可整段移植进 `src/engine/`，动作与数值仅作占位；身体状态标签与伤势递进档本阶段不定义）。
- `specs/`：决议产出的规格资产（如 [dsl-vocabulary.md](specs/dsl-vocabulary.md)，书写面谓词与效果词表 + AI 起草模板，对应 [issue #19](https://github.com/mnikn/text-wuxia/issues/19)）。

## 手玩脚本（内容侧验收）

- [playtest-开场与谋生.md](playtest-开场与谋生.md)：开场链（取剑 → 当剑 → 抓药 → 买粮 → 起火）、石桥镇日结谋生循环、软锁与边界清单。**改 `src/content/twee/` 下的开场链或石桥镇就走一遍。**

## 欠账（2026-09-17 更新）

1. **经济量级仍没定，但已经有了第一版占位**。药粮 500 文/周仍是标尺；石桥镇扛货定为「一个时辰、耗体力 20、日结 30 文」（[#26](https://github.com/mnikn/text-wuxia/issues/26) 代定，沿 #25「改走可玩原型逐步迭代」）。**石桥镇离村八个时辰（64 刻）**，来回十六个时辰——一趟至少连扛数趟才划算，一趟挣多少直接决定一周药粮够不够。手感对不对要你玩过再定。`src/engine/balance.ts` 仍是旧系统的常量表（一把新剑 200 文），与本线的数值不是一套。
2. **状态层缺字段**：~~当票、药、米没有地方记~~ 已由物品系统解决（`src/content/items.ts` + `SliceState.items`，当票进物品、进行囊）。仍未接的：药钱周结与欠款（`mother.*` 命名空间尚未注册）、睡觉与昼夜节律。
3. **镇上没有落脚处 + 本批没有任何体力恢复入口**（新，因 8 时辰路与「去掉歇息」而变急）：来回一趟跨一天多，镇上没地方睡；而家门外也没有恢复动作了（2026-09-17 用户判定：去掉「回屋歇一会」，恢复入口后续再拓展）。**体力 100、扛货一趟 −20，五趟之后既挣不到钱、也付不起后续开销——这是一条真软锁**，得由睡觉 / 吃饭 / 镇上歇脚这批一起补上，或先把扛货的体力代价拿掉。
4. **石桥镇的入口与门槛**：镇口出口只在**村中心**、且要煮过饭药（走过 `故事.开场.煮饭熬药`）之后才出现；家中没有这个出口。家里 ↔ 村中心 2 刻（单程），村中心 ↔ 石桥镇 64 刻（单程），一趟来回约十七个时辰。对话写在开场收尾里，不做成单独动作。
5. **自由行动**：~~经济未定之前无从下手~~ 已开出第一条（村中心 ↔ 石桥镇日结谋生，[#26](https://github.com/mnikn/text-wuxia/issues/26)）；**本批采买各只有一次**（济生堂与市集的买入选项在煮过饭药之后消失），所以挣到的钱暂时没有去处——补给与开销（饭钱、住店钱、药钱周结）等经济那一笔账。
6. **一屏一个叙事节拍**（2026-09-17 用户定，已写进 AGENTS.md）：单个 passage 正文不超过 3 个短段、约 180 字。当前石桥镇旧内容已删除，后续按单场景增量重建；其余场景继续按此尺度验收。

## 测试纪律

`tests/` 只测机制（引擎、编译器、结算、边界），夹具一律内联中性数据，不读 `src/content/` 下的故事与数值；内容对不对由人试玩判定（就是上面的手玩脚本）。内容改动不该弄红测试。
