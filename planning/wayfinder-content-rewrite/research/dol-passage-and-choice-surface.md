# DoL 的 Passage 头部与选项书写面研究

- 研究日期：2026-09-15
- 对应票据：[定义故事与行动共用的 Twee 书写面与编译器契约](https://github.com/mnikn/text-wuxia/issues/16)
- DoL 基线：官方标签 `0.5.10.10` 的 `72b0db95eb5f658b8edff1a218380d29fdcde614`（本地 sparse clone，HEAD = `72b0db95e`，行号即该提交行号）
- 研究边界：只提取架构事实；不复制 DoL 代码、文本、变量名、数据结构或 UI 表达
- 研究问题：Twee 头部/标签行的实际用法；每事件参数的落点；一个地点的事件组织粒度；选项与检定的书写形态

## 1. Passage 头部语法：名字 + 4 个布尔标签，零 JSON 元数据

**结论**：只用 `:: 名` 加可选空格分隔的 `[标签]`；全仓无 passage 级 `{JSON}` 元数据块；标签只承担「构建/引擎行为开关」。

证据（脚本全仓扫描 604 个 `.twee`）：

- `^::` 行 15433；`^::[^ ]` 0 命中（分隔符固定 `:: ` 加空格）。
- 带 `[标签]` 473 行；`^::.*\{` **0 命中**。
- 标签令牌全集：`widget` 411、`exitCheckBypass` 35、`ending` 27、`nosave` 2，无其他。
- 标签读取统一走 SugarCube `tags()`：`game/04-Variables/variables-passageHeader.twee:6`（整体存入 `$tags`）。
- 例：`game/overworld-town/loc-cafe/widgets.twee:1` `:: Widgets Cafe [widget]`；`game/01-config/start.twee:11` `:: Start [nosave exitCheckBypass]`；`game/base-clothing/wardrobes.twee:1779` `:: Wardrobe [exitCheckBypass]`。
- 全仓唯一 JSON 块是故事级 `:: StoryData`（`game/01-config/start.twee:1-6`，含 `ifid`/`format`/`format-version`），非 per-passage。

易混淆点：仓库根的 `events.twee-config.yml` / `t3lt.twee-config.yml` 里的 `tags:` 是**宏**的标签（给 t3lt 编辑器着色/lint），与 passage 标签无关，也不进编译产物。

## 2. 每事件参数落在哪：调用点宏实参 + 条件宏 + JS 注册表 + 外部 YAML

**结论**：权重、触发条件、冷却都不在头部。四个落点：

| 参数 | 落点 | 证据 |
|---|---|---|
| 事件权重 | 池构造调用点的宏实参（默认 1，可为运行时函数） | `game/03-JavaScript/eventpool.js:13-25,32,97-131`；`game/overworld-town/loc-cafe/main.twee:1041` |
| 触发条件 | 调用点外层 `<<if>>` 守卫 | `loc-cafe/main.twee:464-467` |
| 冷却/周期 | story 变量标志（`$weekly.*` / `$daily.*`） | `loc-cafe/main.twee:464-465` |
| 日程/优先级类事件 | 独立 JS 数组（`condition()` / `priority` / `starthour` / `endhour`） | `game/base-system/questmarkers.js:1-20,38,47-49` |

池机制：`<<cleareventpool>>` → 按条件 `<<addinlineevent NAME WEIGHT>>` → `<<runeventpool>>`（`loc-cafe/main.twee:462,1041,1071`）。宏的静态元数据另在仓库根 YAML（`t3lt.twee-config.yml`、`events.twee-config.yml`、`deprecated.twee-config.yml`），仅供编辑器 lint。

## 3. 地点粒度：一地点一目录三文件，事件正文一事件一 passage（短事件内联）

**结论**：`loc-<name>/` 下固定分工 `main.twee`（入口 passage 名 = 地点名 + 子场景）/ `widgets.twee`（单个 `[widget]` passage 装池构造与事件 widget）/ `events.twee`（事件正文，一事件一 passage）。只有短事件内联在池构造块里，属混合粒度。

证据 `loc-cafe/`：

- `main.twee` 2982 行 / 62 passage，入口 `:: Ocean Breeze` 在 `:1`。
- `chef.twee` 1930 行 / 77 passage，命名 `Chef ` / `Cafe ` 前缀。
- `widgets.twee` 356 行 / 4 passage，`:: Widgets Cafe [widget]` `:1` 内含 8 个 `<<addinlineevent>>`。
- 混合粒度：短事件内联 `main.twee:1041-1073`（正文+选项+链一气写完）；长分支拆 passage（`widgets.twee:17` 的 `<<link>>` 跳 `chef.twee:1826`）。

证据 `loc-forest/`：

- `main.twee` 626 行 / 10 passage（入口 `:: Forest` `:1`，子场景如 `Forest Bear Box` `:358`）。
- `widgets.twee` 3092 行 / **1** passage `:: Widgets Forest [widget]` `:1`，内含 49 个 `<<widget>>` 与 63 处池调用。
- `events.twee` 7258 行 / **176** passage，全按事件名（`Forest Wolf Molestation` `:87` 等），由 widget 内 `<<link>>` 跳转衔接（`widgets.twee:1055`）。

## 4. 选项与检定：容器宏只放载荷，可用性靠外层条件，无统一检定宏

**选项形态**：导航一律 `<<link [[标签文本|目标 passage]]>>载荷<</link>>`（`<<link [[` 36835 处）；裸 `[[...]]` 不用于导航（含 `[[` 而无 `<<link` 的行仅 47 行，全是外部 URL 与 JS 数组）。

- 容器体是纯载荷：`<<set>>` 11586、`<<endevent>>` 6257、`<<pass>>` 4760、`<<npcincr>>` 2466 等；**体内 >25 字符叙述文本 0 命中，体内 `<<goto>>` 0 命中**。目标只由 `[[标签|目标]]` 决定。
- 完整形态样本：`game/overworld-plains/loc-riding/main.twee:11`（图标 + 时间提示 + 空体）；载荷组合 `loc-forest/main.twee:150`。

**可用性**：只有「不满足就不渲染」，条件在选项**外层 `<<if>>`**，无灰化禁用态。

- 隐藏式主形态：`loc-riding/main.twee:1-18`（`:3` 外层条件；`:15` `<<else>>` 只出红字理由 + 要求说明宏）。
- 换目标式：`loc-forest/main.twee:126-130`（锁态跳「解释为何锁」的 passage）。
- 难度/警示宏一律挂在 `<</link>>` **之后**：`<<athleticsdifficulty min max>>`（`loc-bog/main.twee:21`）、`<<tendingdifficulty>>`（`loc-forest/widgets.twee:1454`）、`<<note "文本" "颜色">>`（286 处，定义在 `base-system/text.twee:6611`）。

**时间推进**三处都写：标签文本里的人类可读提示（`(0:10)`）、链接体内 `<<pass 10>>`、目标 passage 里补结算用时间（`loc-cafe/main.twee:1058`）。宏定义集中在 `game/03-JavaScript/time-macros.js`（`pass` :74、`passTimeUntil` :40、`advancetohour` :28）。

**检定**：半集中层 + 绝大多数手写，无通用宏。

- 集中层 `game/base-system/skill-difficulties.twee`（777 行，单 `[widget]` passage，25 个 widget）：掷骰 + 档位标签族（`athleticsdifficulty` :519 等，widget 内掷 `random(min,max)` 比技能并把成功写进共享标志）；只标签不掷骰族（`skill_difficulty` :711、`skillDifficultyText` :758 的 7 档梯 ≥100/80/60/40/20/1）。
- 手写占多数：`<<if/<<elseif ... random(...)` 1903 处（如 `loc-cafe/widgets.twee:25-29`）；无 `<<skillcheck 技能 DC>>` 类通用宏（JS `Macro.add` 64 个名字无 check/roll 语义）。
- 判定宏固定挂在选项**之后**，结果留给目标 passage 读标志（`loc-bog/main.twee:21`）。

**选项组**：一个选项一个 `<<link>>`；widget 只包「选项组」（49 个 `*links*` 命名 widget，如 `loc-forest/widgets.twee:3011`）。三选项并列样本：`loc-pirates/activities.twee:144-148`、`loc-cabin/halloween.twee:104-108`、`loc-cafe/chef.twee:1805-1814`。

## 5. 与 Twee 3 元数据块的差距

Twee 3 把元数据集中在头部（`:: 名 [标签] {JSON}`），DoL 把头部压到只剩名字 + 布尔标签，机器参数下沉到「调用点宏实参 + 条件宏 + JS 注册表 + 工具专用 YAML」四处。代价是事件本体不自描述：看一个事件 passage，看不出它的权重、触发条件与冷却。

## 对本项目的约束（票据 16 据此做的决定）

1. **1 passage = 1 单元**：DoL 的事件正文也是一事件一 passage，这条可直接转化；它偏离本项目的三处（入口 passage 用地名充当业务命令、池构造处夹带条件与持久写入、条件/随机/状态改动/正文混在同一 passage）已被 [票据 12 报告](../../wayfinder/research/dol-action-and-passage-lifecycle.md) 列为应避免。
2. **用 `{JSON}` 元数据槽**：DoL 的等价信息散落四处且无静态校验位；本项目走构建期编译，`{JSON}` 正好被编译器读走，且是 Twee 3 规范定义的槽。
3. **`[标签]` 承担布尔行为开关 + 人类检索**，与 DoL 的 `widget`/`nosave` 同源；键值一律进 JSON。
4. **选项用容器宏，但容器体承载结算文本**：DoL 的分离靠 passage 跳转（叙述住在目标 passage）实现；本项目同一单元内结算、无跳转，故结算文本与声明必须同容器。
5. **检定做成单点难度 + 对称档带的可推导机制**：DoL 是 `random(min,max)` 区间 + 手写比较，玩家侧难度只能出「档梯文字」；本项目可精确算成功率（`check="agi 45"` → {attr, difficulty} → 引擎检定值 → P(成功)）。
6. **可用性：保留禁用示因（票据 004 已定），不学 DoL 的「不满足就不渲染」**；DoL 的「红字理由 + 要求说明宏」这条信息表达与本项目的禁用示因同向。

## 来源清单

- [DoL 官方稳定标签固定提交](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/tree/72b0db95eb5f658b8edff1a218380d29fdcde614)
- [事件池 eventpool.js](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/03-JavaScript/eventpool.js)
- [地点 loc-cafe/main.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-town/loc-cafe/main.twee)、[loc-cafe/widgets.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-town/loc-cafe/widgets.twee)、[loc-cafe/chef.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-town/loc-cafe/chef.twee)
- [地点 loc-forest/main.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-forest/loc-forest/main.twee)、[loc-forest/widgets.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-forest/loc-forest/widgets.twee)、[loc-forest/events.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-forest/loc-forest/events.twee)
- [难度与检定 widget：skill-difficulties.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/base-system/skill-difficulties.twee)
- [选项可用性样本 loc-riding/main.twee](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-plains/loc-riding/main.twee)、[时间宏 time-macros.js](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/03-JavaScript/time-macros.js)
- [日程事件注册表 questmarkers.js](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/base-system/questmarkers.js)
- 本地编译目标接口：`E:\pprojects\text-wuxia\src\game\stories.ts`、`src\game\actions.ts`、`src\game\effects.ts`、`src\engine\check.ts`
