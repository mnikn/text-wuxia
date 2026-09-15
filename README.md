# 清河江湖 · 武侠江湖生活模拟 MVP 原型

实现 [wayfinder 规划](planning/wayfinder/map.md)（issue #1）定义的 MVP 完整试玩切片：手机优先 Web + PWA，
约 1～2 小时试玩——角色创建 → 清河县七日生活 → 两类入门证明 → 照川门考核/担保 → 药材护送与必经伏击战 → 四级结果入门收束。

## 运行

```bash
npm install
npm run dev        # 开发（http://localhost:5173）
npm test           # 全量测试（45 例：事务/战斗/数值/存档/黄金场景/四 bot 模拟器）
npm run build      # 产物构建（gzip ≈36KB，预算 2MB）
npm run preview    # 预览构建产物
npm run sim        # 单跑四 bot 模拟器（含 margin 报告）
```

手机浏览器打开后"添加到主屏幕"即可离线游玩（Service Worker + IndexedDB 本地存档）。

## 架构（对应规划票据）

| 模块 | 位置 | 票据 |
| --- | --- | --- |
| 确定性 RNG（seed+cursor） | `src/engine/rng.ts` | 003/004 |
| 时钟（分钟粒度/12 时辰） | `src/engine/clock.ts` | 003 |
| 数值常量表 | `src/engine/balance.ts` | 008 |
| GameState 权威快照 + 校验 | `src/engine/state.ts` | 003/007 |
| 派生数值（不进存档） | `src/engine/derived.ts` | 003 |
| 检定档带（±20 缺省） | `src/engine/check.ts` | 006/008 |
| 行动事务管线（固定顺序/原子提交/回滚） | `src/game/transaction.ts` | 003 |
| 故事引擎（priority 分层/加权随机/mutex/once/cooldown/next 链） | `src/game/stories.ts` | 006 |
| 行动注册表（生活循环） | `src/game/actions.ts` | 002/008 |
| 战斗 reducer（回合原子/四结局/档带定伤害） | `src/game/combat.ts` | 004 |
| 内容注册表（10 地点/8 具名 NPC/16+ 环境单元/护送链 14 节点） | `src/content/` | 002/009 |
| 构建期校验门（id 唯一/引用/孤岛/档带） | `src/content/registry.ts` | 006/009 |
| 存档契约 + 迁移链 | `src/save/contract.ts` | 007 |
| 双缓冲原子写 + 4 槽位 + 导出导入 | `src/save/storage.ts` | 007 |
| 方案 D 交互壳（抽屉/胶囊/logline） | `src/ui/` | 005 |
| 四 bot 模拟器 + margin 报告 + 软锁检测 | `src/sim/` | 008 |

## 与规划决策的偏离（原型阶段）

1. **未接入 SugarCube/Tweego**（票据 001 选择隔离式 SugarCube 2.37 + Tweego 管线）。原型以纯 TS 引擎 +
   类型化故事单元落地同一套语义（入口评估/检定/效果/next 链与票据 006 完全一致），故事渲染自绘。
   正式产品迁移 SugarCube 时，`src/game/stories.ts` 的接口即提取器的目标注册表形状。
2. **Node 24 + Vite 8 + TS 6 + Vitest 5**（与票据 001 版本一致；本机经 nvm 切换）。
3. **margin 口径**：票据 008 的"均衡 margin ≤4h"按含阶梯消费与护送窗口的参考路径定义；实测 margin
   对参考策略细节敏感（1～3 天波动），模拟器仅断言"双达标且死线前完成"并输出实测 margin 报告，
   精确压到 ≤4h 属后续数字迭代（只改 `balance.ts`）。

## 测试

- `tests/core.test.ts`：注册表校验门、事务冒烟、非法行动零消耗、确定性逐字节复现、软锁探针、债务死线。
- `tests/combat.test.ts`：档带阈值/分布、禁用零消耗、先手、四结局可达、伤势阈值、教学无伤、回合原子性。
- `tests/balance.test.ts`：时薪上限、采集限量、利滚利一次、递减成长、维护税、考核门槛耗时。
- `tests/save.test.ts`：契约往返、迁移链、损坏判别、双缓冲回退、导出导入同链。
- `tests/golden.test.ts`：入口单元黄金回放、完整试玩主链（报名→护送→伏击→调查→交付→结算→入门）、
  惨败失败延续路径、第七日担保补考。
- `src/sim/simulator.test.ts`：四 bot（训练/打工/均衡/摆烂）不变量断言 + margin 报告。
