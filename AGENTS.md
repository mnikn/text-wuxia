# AGENTS.md · text-wuxia

## 目录与职责

| 路径 | 是什么 |
| --- | --- |
| `CONTEXT.md` | **术语表与领域约定**（地点节点、故事单元、体力、银钱、保底谋生、软锁…）。动手前先读，命名与设计都按它说话 |
| `src/content/twee/` | 故事内容，按「区域/地点/main.twee」嵌套；一个 passage = 一个故事单元 |
| `src/content/items.ts` | 物品登记表（引擎侧权威：书写面用名、显示名、单件重量）。内容侧只能用表里的名字 |
| `src/twee/` | Twee 编译器前端（`parse`/`expr`/`format`）、IR（`types`）与最小运行时（`runtime`） |
| `src/ui/` | 交互壳（全屏正文 + 地点胶囊导航 + 左侧常驻状态栏/行囊） |
| `planning/wayfinder-content-rewrite/` | 规划资产：`specs/`（书写面词表）、`research/`、`prototypes/`（世界观种子定稿等） |
| `docs/adr/` | 架构决策记录 |

## 测试纪律

- **`tests/` 只测机制**（引擎、编译器、结算、边界）。**禁止做内容测试**：不得断言故事、文案、数值、地点连线；夹具一律内联的中性 twee，不读 `src/content/` 下的故事与数值。
- 唯一允许碰内容目录的是格式检查：`tests/twee-format.test.ts` 拿 `formatTwee` 当缩进检查器（缩进即成文，见下）。
- **内容验收靠人**：改 `src/content/twee/` 下的开场链或石桥镇，或改 `items.ts` / `SLICE_TUNE`，就照着 `planning/wayfinder-content-rewrite/playtest-开场与谋生.md` 走一遍。内容改动不该弄红测试。

## 内容书写约定

- 文风基准是「金庸腔」：短句、白描、少形容词；样本见 `planning/wayfinder-content-rewrite/prototypes/worldview-seed-v3.md` 第 10 节。人机分工是**AI 逐段起草、人逐段确认**，禁止在没经过人确认的情况下直接写入内容。
- 一些即时动作不消耗时间，对于一些耗时短到一刻的动作，直接不算时间

## 规划与追踪

- 权威票据在 GitHub Issues：当前地图是[内容重写与故事 DSL 迁移路线](https://github.com/mnikn/text-wuxia/issues/13)（`wayfinder:map` 标签），票据是它的子 Issue；认领 = assignee，解决 = resolution comment + close，地图的 Decisions so far 直接改 issue body。本地只放资产，不做票据镜像。
- 走查（wayfinder）时同时读 `planning/wayfinder-content-rewrite/README.md` 的欠账清单。
