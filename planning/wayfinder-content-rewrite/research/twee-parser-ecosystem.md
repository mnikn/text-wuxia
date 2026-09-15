# Twee 解析器生态与编译器选型研究

- 研究日期：2026-09-15
- 对应票据：[调研 Twee 解析器生态与编译器选型](../tickets/013-twee-parser-ecosystem-research.md)（[GitHub issue #15](https://github.com/mnikn/text-wuxia/issues/15)）
- 研究方法：npm registry/CLI、GitHub API（含源码直读）、官方规范与官方文档等一手来源；访问日期均为 2026-09-15
- 编译目标：`.twee` 源 → TS 注册表（`StoryUnit`/`StoryChoice` 等，见 `src/game/stories.ts`），运行时不接 SugarCube

## 结论

**推荐自写编译器前端**：Twee 语法子集解析 + 栈式自定义宏解析 + 自写 Vite 插件（transform 或虚拟模块聚合）。不复用现有 Twee 解析库作为依赖。

理由分四点：

1. **核心工作量与库的能力错位**。JS/TS 生态所有 Twee 解析器（extwee、`@rohal12/twee-ts` 等）都只做到 passage 级：解析 `:: 名 [标签] {元数据}` 头部后，把正文当不透明文本保留。Twee 3 规范本身就止步于此——宏语法不属于 Twee，属于 story format（SugarCube 等）。本项目的关键难点是把 `<<when>>`/`<<choice>>`/`<<check>>`/`<<band>>` 等自定义宏解析成结构化数据并生成 `when?: (s: GameState) => boolean` 这类函数字段，这部分没有任何库代劳，约占全部工作量的八成以上。
2. **库的兼容面是纯负担**。extwee/twee-ts 的主体功能是 Twine 1/2 HTML、TWS、archive、story format 的双向转换；本项目不进 SugarCube 运行时生态，产出的注册表是 TS 模块而非 Twine HTML。引入库等于为一个头部解析器（约百余行代码）背上 6 个传递依赖（extwee）或单人维护项目的供应链风险（twee-ts，1 star、bus factor 1）。
3. **诊断能力是核心需求，自写才能完全掌控**。内容由 AI 逐段起草、人逐段确认，编译器必须在 `.twee` 文件上给出 file:line 级错误与警告（未闭合宏、未知宏名、悬空 `next`、重复 id）。自写解析器天然持有行号；库的返回形态（Story/Passage 对象或最终 HTML）不提供这种定制空间。
4. **语法子集极小且规范冻结**。本项目实际只需要 `:: 名 [标签]` + 正文 + 自定义宏，Twee 3 规范 v3.0.2 自 2024 年后无变动，转义规则（`\` 转义 `[ ] { } \`）在规范中有明确定义。自写解析面窄、可穷举测试。

备选路线（记录不采用）：用 extwee（MIT）的 `parseTwee()` 做 passage 级前置解析、自写宏层叠加。若后续发现规范转义细节的测试成本超预期，可切换到此路线，接口上把"passage 切分"与"宏解析"分层即可平滑替换。

## 生态观察：现有库逐个核实

### 1. extwee（videlais/Dan Cox）

- **维护状态**：npm `extwee` 最新 v2.3.18，MIT，维护者 videlais（Dan Cox）；GitHub 仓库 develop 分支最后 push 2026-09-13（研究日前两天），43 stars，0 个 open issue，累计 1000+ 提交。周下载量约 138（2026-09-05 至 09-11，npm downloads API）。小众但维护认真、响应快（issue 全清）。
- **宏解析能力**：无。README 明确"Extwee is not an authoring tool"，定位是格式转换（Twee 3 / Twine 1-2 HTML / TWS / archive / JSON / story format 互转）。API 为 `parseTwee()`/`compileTwine2HTML()` 等；`Passage` 对象只有 `name`/`tags`/`metadata`/`text` 四个字段，`text` 是原文文本桶。源码 `src/Twee/parse.js` 只实现规范定义的头部解析与转义（`\x` → `x` 解码、`[ ] { } \` 转义、未转义字符定位），不触碰正文内部结构。
- **Vite 集成**：无官方插件。它是 ESM Node 库（另有浏览器构建 `extwee-dom`，MIT，v1.0.2），可在自写 Vite 插件中直接 import 使用。依赖 6 个：commander、graphemer、html-entities、node-html-parser、pickleparser、semver。
- **许可**：MIT，clean-room 无障碍。

### 2. @rohal12/twee-ts（rohal12）

- **维护状态**：npm 最新 v1.14.0（2026-03-28 发布），Unlicense（公有领域），零运行时依赖，TypeScript strict，Node 22+。GitHub 1 star、0 fork、7 个 open issue，最后 push 2026-06-19。单人项目，bus factor 1，社区采用度接近零。
- **宏解析能力**：无。自称"Tweego 的 TS 完整重实现"，输出目标是 story HTML。programmatic API `compile()` 返回 `output`（HTML/Twee/JSON 字符串）、`story`（passage 级模型）、`diagnostics`（带 file/line，这是它的亮点）、`stats`；底层导出 `tweeLexer`（词法 generator）与 `parseTwee`。文档明确没有 macro 级 AST，可定制点只有标签别名（`tagAliases`，如 `library → script`）。
- **Vite 集成**：**唯一自带 Vite 插件的库**（`@rohal12/twee-ts/vite`，另有 Rollup 版）。读其源码（`src/plugins/vite.ts`，固定提交 50e0d92）：`configureServer` 里 `server.watcher.add(sources)` + 初次编译；`handleHotUpdate` 里按改动文件做 `compileIncremental(options, cache, changedSet)` 增量重编并发 `ws.send({type:'full-reload'})`；`generateBundle` 里 `emitFile` 产 HTML asset。形态可整段参考（Unlicense 允许任意复制改造），但它的产物是 HTML 文件而非 TS 模块，与本项目"编译进模块图"的需求不同构。
- **许可**：Unlicense（放弃版权），任意使用无障碍。

### 3. twine-utils（klembot / Chris Klimas，Twine 作者）

- **维护状态**：npm 最新 v3.1.0，维护者 klembot。
- **能力**：Twine 2 story/story format 处理工具，面向 HTML 与 story format 定义，非构建期 Twee→TS 场景。
- **许可**：**GPL-3.0**。作为依赖引入会带来传染性义务，与本仓库 MIT/无传染预期冲突。直接排除。

### 4. twee3-language-tools（cyrusfirheir）

- **维护状态**：GitHub MIT，62 stars，最后 push 2026-04-15。VS Code 扩展（不发 npm 包），提供 Twee 3 语法高亮、SugarCube 宏诊断、自定义宏声明支持。
- **对本项目的价值**：不是构建库，但证明了两点：宏语法可以被 TextMate grammar/正则形式化覆盖（自写宏解析器的可行性旁证）；内容作者（人）的编辑器体验可由现成扩展解决，与构建管线无关。
- **许可**：MIT。

### 5. 其他核对项

- **`twee-parser`（npm）**：不存在（registry 404）。npm 上名为 `twee` 的包是无关的 PHP 风格 Web 框架。
- **Tweego**：Go 语言外部 CLI 编译器，Simplified BSD 许可，产物为单个 HTML。外部进程形态与 Vite 内嵌增量编译不匹配（需要 subprocess + 全量重建），且同样不解析宏。仅作架构参照。
- **Twison / Jailbird**：Twine HTML → JSON 转换器，输入是编译后 HTML 而非 Twee 源，不属于构建期 DSL 编译路线。
- **Twine 2 编辑器本体**：GPL 系许可，其代码不可作依赖来源（本研究未读其源码，仅确认许可属性以划定边界）。
- **通盘结论**：不存在把 SugarCube 式宏（更不用说自定义宏）解析为结构化 AST 的 JS/TS 库。宏级处理在整个 Twine 生态中要么在 story format 运行时（SugarCube 的 Wikifier）发生，要么在编辑器扩展（twee3-language-tools）里做诊断。构建期宏 AST 是空白。

## 语法规范与许可边界

- **Twee 3 规范（v3.0.2）**：权威来源是 [iftechfoundation/twine-specs](https://github.com/iftechfoundation/twine-specs)（IFTF 维护，固定提交 74b3d89，最后 push 2024-07-04，102 stars）。规范定义：passage = 单行头部（`::` + 名 + 可选 `[标签]` + 可选 `{JSON 元数据}`，含 `\` 转义规则）+ 正文（原文直到下一个头部或文件尾）；特殊 passage（`StoryTitle`/`StoryData`/`Start`）与特殊标签。**规范不定义任何宏语法**——正文对编译器是不透明文本，`<<macro>>` 由 story format 各自定义。该仓库无 LICENSE 文件：规范文本版权未明示，但语法结构本身（标识、分隔、转义的思想）不属于版权保护对象；自写实现时以行为为准、不复制规范文本即可。
- **SugarCube 2**：GitHub `tmedwards/sugarcube-2` 的 LICENSE 为 **BSD-2-Clause**（2013-2025 Thomas Michael Edwards）。本项目仅借鉴"双尖括号宏 + `<<macro>>...<</macro>>` 容器闭合"这一语法思想（clean-room：不读其运行时代码、不接其运行时），无许可障碍。
- **DoL**：clean-room 边界不变。本研究未接触 DoL 代码；宏集合（`<<when>>`/`<<choice>>`/`<<check>>`/`<<band>>`/`<<flag>>`/`<<next>>`/`<<do>>`）为本项目自定义设计。

## 自写解析器对照

### 工作量分解（估）

| 部分 | 内容 | 规模估计 |
|---|---|---|
| Twee 头部解析 | `:: 名 [标签]` 逐行扫描、转义子集、StoryData 识别 | 约 100–150 行 + 测试 |
| 宏解析器 | `<<name args>>` 与 `<</name>>` 配对、嵌套栈、参数切分（引号串/裸 token/花括号块）、行号记录 | 约 200–400 行 + 测试 |
| 宏 → 注册表代码生成 | 七个自定义宏的结构校验、`when`/条件生成 `(s: GameState) => boolean`、effects/choices/bands 装配、跨文件校验（重复 id、悬空 next、未闭合宏） | 约 300–500 行 + 测试（真正的难点） |
| Vite 插件壳 | transform 或虚拟模块（resolveId + load）、`configureServer`/`handleHotUpdate`、诊断输出 | 约 100–150 行 |

合计核心约 700–1200 行加 Vitest 用例，2–4 个专注日量级。其中宏 → 函数字段的代码生成无论选哪条路（复用库或自写）都逃不掉，库路线只省下第一行（头部解析）。

### 风险与对策

| 风险 | 对策 |
|---|---|
| 转义/边界 corner case（规范有，但子集可收窄：本项目的 passage 名与标签用 CJK/ASCII，不出现 `[ ] { }`） | 子集明文声明不支持原字符转义 + 用规范示例做快照测试；超预期时切备选路线（extwee `parseTwee` 前置） |
| 嵌套宏闭合错误难报 | 栈式解析天然记录 open 行号，未闭合/未匹配即报 file:line |
| `when` 等表达式参数的安全与报错 | 不做 JS eval：宏参数用受限表达式文法（比较/布尔/字段访问白名单）编译为 TS 源码文本，非法 token 在构建期拒绝 |
| 跨文件一致性（重复 id、悬空 next） | 插件在聚合层（虚拟模块生成时）做全量校验；watch 下单文件增量重编 + 轻量全量链接检查 |
| Vite HMR 语义 | 注册表是数据模块：改动发送 full-reload 或自定义 ws 事件即可，无需精细 HMR；参照 twee-ts 的 `handleHotUpdate` + `compileIncremental` 缓存模式（Unlicense，可抄结构） |

### 复用库路线的净收益核算

- extwee 路线省下：头部解析 + 转义合规（约 15% 工作量）。付出：6 个传递依赖、Passage 文本桶到注册表的二次解析仍在自写、诊断行号需自行重建（库不透传正文内部行号）。
- twee-ts 路线省下：头部解析 + 诊断框架 + 插件壳。付出：单人维护依赖（可 fork，Unlicense 无法律成本但有能力成本）、其 `story` 模型与 HTML 编译耦合的部分用不上。
- 结论：两条复用路线的净收益都不覆盖其结构性成本；自写与备选路线分层设计保留退路即可。

## 对后续票据的约束

- "Twee 编译器实现"票据应按三层切分：passage 切分（可替换层，默认自写，备选 extwee `parseTwee`）→ 宏解析（栈式，自写，产出带行号的宏树）→ 注册表生成 + 聚合校验（含 Vite 插件壳）。
- 表达式能力（`when`/条件参数）必须走受限文法编译为 TS 源码，禁止运行时 eval；文法定义在实现票据中先行明确。
- 内容作者工具链：编辑器侧可直接推荐 twee3-language-tools（MIT）获得语法高亮，不与构建管线耦合。
- 任何实现不得 import twine-utils（GPL-3.0）。

## 来源清单

- [extwee GitHub 仓库（videlais），develop 分支固定提交 5bbe64f](https://github.com/videlais/extwee/tree/5bbe64fcde4224d24719593b5039015d17cee7a9)（README、许可、活跃度）
- [extwee npm 包页面](https://www.npmjs.com/package/extwee)（版本、依赖；经 `npm view` 核实）与 [npm downloads API](https://api.npmjs.org/downloads/point/last-week/extwee)（周下载 138）
- [extwee 源码 src/Twee/parse.js 与 src/Passage.js，固定提交 5bbe64f](https://github.com/videlais/extwee/blob/5bbe64fcde4224d24719593b5039015d17cee7a9/src/Twee/parse.js)（解析粒度与 Passage 字段的直接证据）
- [@rohal12/twee-ts GitHub 仓库，main 固定提交 50e0d92](https://github.com/rohal12/twee-ts/tree/50e0d92397f6f25a560537626908a86e47be3de2)（README、零依赖、许可）
- [twee-ts API 文档](https://rohal12.github.io/twee-ts/api)（compile 返回结构、无宏 AST）与 [插件文档](https://rohal12.github.io/twee-ts/plugins)
- [twee-ts 源码 src/plugins/vite.ts，固定提交 50e0d92](https://github.com/rohal12/twee-ts/blob/50e0d92397f6f25a560537626908a86e47be3de2/src/plugins/vite.ts)（Vite 插件形态证据）
- [twine-utils npm 包](https://www.npmjs.com/package/twine-utils)（GPL-3.0，经 `npm view` 核实）
- [twee3-language-tools GitHub 仓库](https://github.com/cyrusfirheir/twee3-language-tools)（MIT、编辑器侧宏诊断）
- [Twee 3 Specification v3.0.2（iftechfoundation/twine-specs，固定提交 74b3d89）](https://github.com/iftechfoundation/twine-specs/blob/74b3d895651a29aa47d0ce9244eddf3ba4478058/twee-3-specification.md)（语法范围、转义、特殊 passage；正文不含宏语法的直接证据）
- [SugarCube 2 GitHub 仓库 LICENSE（BSD-2-Clause）](https://github.com/tmedwards/sugarcube-2/blob/master/LICENSE)
- [Tweego 官网](https://www.motoslave.net/tweego/)（Simplified BSD、Go CLI）
- [Vite 官方插件 API 文档](https://vite.dev/guide/api-plugin)（transform、虚拟模块 resolveId/load、handleHotUpdate、configureServer）
- 本地编译目标接口：`E:\pprojects\text-wuxia\src\game\stories.ts`（`StoryUnit`/`StoryChoice`/`CheckDecl`/`BandOutcome`）
