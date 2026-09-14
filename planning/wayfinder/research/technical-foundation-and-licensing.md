# SugarCube 技术基础与许可边界研究

- 研究日期：2026-09-14
- 对应票据：[验证 SugarCube 技术基础与许可边界](../tickets/001-verify-technical-foundation.md)
- 性质：技术与许可规划，不是法律意见

## 结论

MVP 可采用 SugarCube 2 + Tweego + TypeScript + Vite + PWA，但不能把各工具混成无边界运行时：

1. SugarCube 2.37.3 与 Tweego 2.1.1 固定为可重复构建输入。
2. 游戏规则、状态转换、确定性 RNG 和内容定义保留为不依赖 SugarCube 全局对象的纯 TypeScript；SugarCube 只承担 Passage 生命周期、渲染入口、历史与存档适配。
3. Vite 使用受支持的 8.3.x minor，Node 使用 24 LTS；TypeScript 使用 6.0.x 并锁定 patch。Vite 仅转译 TypeScript，生产构建必须单独执行 `tsc --noEmit`。
4. PWA 首版使用 `vite-plugin-pwa` 1.3.0 的稳定能力，不采用尚未发布稳定版的下一代 `@vite-pwa/core`。把 PWA 生成与注册封装在单独构建阶段，保留替换插件的余地。
5. `nijikokun/sugarcube-starter` 可作为构建流程样本，不能原样成为项目底座。新项目应按官方工具接口重建最小脚手架。
6. DoL 只可产出抽象架构观察，不得进入源代码、内容库、UI 资产或发布包；否则会引入 CC BY-NC-SA 4.0 的非商业、署名和相同方式共享义务。

## 推荐基线

| 层 | 基线 | 决策理由与约束 |
|---|---|---|
| Node.js | 24 LTS | Node 官方建议生产应用使用 Active/Maintenance LTS；24 LTS 支持到 2028-04。Vite 8 要求 Node 20.19+ 或 22.12+，Node 24 满足要求。[Node 发布状态](https://nodejs.org/en/about/previous-releases)、[Vite 8 公告](https://vite.dev/blog/announcing-vite8) |
| SugarCube | 2.37.3，精确固定 | 官方仍将 2.x 标为当前系列，2.37.3 是最新发布版；维护者已宣布 v2 进入维护模式并停止新增功能。适合完成 MVP，不适合让领域核心依赖其私有行为。[官方发布说明](https://www.motoslave.net/sugarcube/2/releases.php)、[维护者路线说明](https://github.com/tmedwards/sugarcube-2/discussions/315) |
| Tweego | 2.1.1，精确固定 | 官方最新 release；支持 Twee 3、`--head`、可重复的 `--module`、`--output` 与 watch。版本老但职责窄、输出稳定。[官方 releases](https://github.com/tmedwards/tweego/releases)、[官方文档](https://www.motoslave.net/tweego/docs/) |
| Vite | 8.3.x，锁 minor 与 lockfile | 官方当前对 8.3 发常规补丁；starter 的 6.0.7 已不在当前受支持范围。升级 minor 前跑完整构建/离线验收。[支持策略](https://vite.dev/releases)、[Vite 8 公告](https://vite.dev/blog/announcing-vite8) |
| TypeScript | 6.0.x，锁 patch | 6.0 是稳定过渡版，存在配置移除和默认值变化；新项目直接使用无弃用项配置，避免背负 5.x 迁移债。[TS 6.0 发布说明](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) |
| Sass | Dart Sass，当日稳定版并锁 lockfile | 仅作样式编译器，不让 SCSS API 进入运行时契约。starter 的 Sass 版本只作旧快照，不继承其范围版本。 |
| PWA | `vite-plugin-pwa` 1.3.0 | 1.3.0 明确加入 Vite 8 peer 支持；现有插件将转入维护模式，下一代包当时仍未稳定发布。只使用 manifest、预缓存和更新提示等稳定功能。[1.3.0 release](https://github.com/vite-pwa/vite-plugin-pwa/releases/tag/v1.3.0)、[维护路线](https://github.com/vite-pwa/vite-plugin-pwa/issues/933) |

版本策略不是永远冻结：提交 lockfile；CI 使用干净安装；每月或里程碑末集中升级；SugarCube/Tweego 升级须生成相同测试故事并比较关键行为；Vite/TS/PWA 升级须通过类型、构建、离线、更新与存档回归。

## 组合方式

### 职责边界

```text
纯 TypeScript 领域核心
  -> SugarCube adapter（唯一可接触 State/Engine/Save/Story 的层）
  -> Vite 生成 JS/CSS
  -> Tweego 将 JS/CSS + Twee 3 + SugarCube 2.37.3 编译为 dist/index.html
  -> PWA 阶段基于最终 dist 生成 manifest/service worker
  -> 完整性与离线 smoke test
```

SugarCube 官方允许 `StoryInterface` 替换默认 UI，要求保留 `#passages`；这足以支持手机优先的自定义文字游戏界面，不需要改 SugarCube 源码。[SugarCube 官方文档](https://www.motoslave.net/sugarcube/2/docs/#special-passage-storyinterface)

Tweego 的 `--module` 会把 JS/CSS 包装并放入最终 HTML 的 `<head>`，`--head` 可追加 manifest/link/meta；因此 Vite 不是最终 HTML 的所有者，Tweego 才是。PWA 工具必须看到 Tweego 已生成的最终 `dist`，不能依赖普通 Vite SPA 的默认 `index.html` 注入假设。[Tweego 选项](https://www.motoslave.net/tweego/docs/#options)

推荐把生产命令拆成有序、失败即停的阶段：清理输出、类型检查、Vite 资产构建、Tweego 故事编译、PWA 生成、产物验证。不要把 Tweego 隐藏在 Vite `closeBundle` 钩子里；显式阶段更易测试，也避免 PWA 插件在最终 HTML 生成前扫描 `dist`。

Vite 官方说明其 TypeScript 支持只做转译、不做类型检查，并建议生产构建额外运行 `tsc --noEmit`；`isolatedModules` 也应开启。[Vite TypeScript 文档](https://vite.dev/guide/features.html#typescript)

### PWA 更新策略

- 首次版本只缓存应用壳与同版本静态资源；不缓存任意外部请求。
- 使用“发现更新 -> 提示玩家保存 -> 玩家确认重载”的策略，不使用无提示 `skipWaiting`/强制刷新。长会话中突然切换 worker 可能让旧页面与新资源混用；Chrome/Workbox 文档也警告直接 `skipWaiting` 可破坏延迟加载资源。[Service Worker 生命周期](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)
- Service Worker 只能在 HTTPS 或 localhost 注册；部署验收必须在 HTTPS 真机环境执行。[Service Worker 规范](https://w3c.github.io/ServiceWorker/)
- manifest 明确设置稳定 `id`、`start_url`、`scope`、`display`、名称和图标；这些字段决定安装身份与启动边界。[Web App Manifest 规范](https://w3c.github.io/manifest/)
- PWA 缓存不等于存档。SugarCube 的 session/history、browser save 与导入导出仍由后续“设计存档契约”票据决定。

### SugarCube 生命周期风险

SugarCube 2.37.0 重写了 Save API，并弃用多项旧接口；项目只面向 2.37.3 写适配器，不复制旧 DoL 宏或旧存档用法。[2.37 发布说明](https://www.motoslave.net/sugarcube/2/releases.php#v2.37.0)

SugarCube 会在每次 Passage 导航创建包含全部故事变量的历史 moment。大型只读目录、规则表和内容索引不得放入故事变量；否则会放大 history/session/save。具体状态所有权由后续票据决定，但技术边界现在固定为：静态定义在 TypeScript/setup，持久变化状态通过单一适配入口写入。[状态与存档指南](https://www.motoslave.net/sugarcube/2/docs/#guide-state-sessions-and-saving)

## 对 `sugarcube-starter` 的审查

候选仓库：[nijikokun/sugarcube-starter](https://github.com/nijikokun/sugarcube-starter)

### 可复用思想

- Vite 先输出 JS/CSS，再由 Tweego `--module` 合入故事 HTML。
- 自动取得 Tweego 和 SugarCube、用 `TWEEGO_PATH` 指定项目内 story format。
- 开发态 test mode、BrowserSync、Twee 与资产目录分离。

这些均可从其 [构建脚本](https://raw.githubusercontent.com/nijikokun/sugarcube-starter/main/.build/tweego.ts)、[Vite 配置](https://raw.githubusercontent.com/nijikokun/sugarcube-starter/main/vite.config.ts) 与官方 Tweego 文档重建。

### 不原样采用的原因

1. `package.json` 仍是 Vite 6.0.7、TypeScript 5.7.2，README 只要求 Node 18+；Node 18 已 EOL，Vite 6.0 也不在当前支持范围。[package.json](https://raw.githubusercontent.com/nijikokun/sugarcube-starter/main/package.json)、[Node 发布状态](https://nodejs.org/en/about/previous-releases)、[Vite 支持策略](https://vite.dev/releases)
2. 自动安装器从远程 URL 下载并解压可执行文件与 story format，却没有 SHA-256/签名校验；供应链不可审计。[安装脚本](https://raw.githubusercontent.com/nijikokun/sugarcube-starter/main/.build/tweego.ts)
3. 配置把 macOS arm64 指向 x64 包、Linux arm64 也指向 x64 包；跨平台映射不可信。[config.json](https://raw.githubusercontent.com/nijikokun/sugarcube-starter/main/config.json)
4. PWA 不在模板内；其 `closeBundle -> Tweego` 顺序也不应直接叠加普通 SPA 式 PWA 插件。
5. 仓库 README 与 `package.json` 声明 MIT，但根目录没有随仓库提供标准 `LICENSE` 文件。许可意图清楚，归档和 notice 质量不足；直接复制会增加追溯成本。[README](https://github.com/nijikokun/sugarcube-starter#license)、[package.json](https://raw.githubusercontent.com/nijikokun/sugarcube-starter/main/package.json)

决策：不执行 `degit`/fork。实施时从空项目建立最小构建器，仅借鉴公开思路；若逐文件复制 starter，必须保存来源 commit、作者声明和 MIT notice，并在 `THIRD_PARTY_NOTICES` 标明。

## 许可矩阵

| 组件/材料 | 许可 | 是否进入发布物 | 要求 |
|---|---|---|---|
| SugarCube 2 | BSD-2-Clause | 是，story format 运行时代码进入 HTML | 发布物或随附文档保留版权、两项条件与免责声明。[官方 LICENSE](https://github.com/tmedwards/sugarcube-2/blob/master/LICENSE) |
| Tweego | BSD-2-Clause | 通常否，只在开发/CI 使用 | 若向开发者分发二进制或含它的工具包，随附 BSD notice；玩家产物无需携带 Tweego 本体。[官方 LICENSE](https://github.com/tmedwards/tweego/blob/master/LICENSE) |
| Vite | MIT，发布包另含多种宽松许可的 bundled dependencies | 通常为构建期；游戏 bundle 只含实际导入的运行时代码 | 保留适用 notice；启用 `build.license` 生成清单，但不能只依赖自动结果。[Vite LICENSE](https://github.com/vitejs/vite/blob/main/packages/vite/LICENSE.md)、[build.license](https://vite.dev/config/build-options.html#build-license) |
| TypeScript | Apache-2.0 | 否，编译器为开发依赖 | 若再分发编译器，保留 LICENSE/NOTICE 与修改说明；正常网页产物不含编译器。[官方仓库](https://github.com/microsoft/TypeScript) |
| `vite-plugin-pwa` | MIT | 插件为构建期；生成物可含其/Workbox 生成代码 | 在第三方清单保留 MIT notice。[官方仓库](https://github.com/vite-pwa/vite-plugin-pwa) |
| Workbox | MIT | `generateSW` 产物可含运行时代码 | 发布物保留 MIT notice。[官方仓库](https://github.com/GoogleChrome/workbox) |
| `sugarcube-starter` | README/包元数据声明 MIT，缺根 LICENSE | 仅在复制模板文件时 | 默认不复制；若复制，固定来源并补齐来源/许可记录。 |
| DoL 源码、文本、数据、美术、UI 素材 | CC BY-NC-SA 4.0 | 禁止进入 | 分享原件/改编件受署名、非商业、相同方式共享、不得增加限制等条件约束。[DoL 官方 LICENSE](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/master/LICENSE)、[CC 法律文本](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en) |

Vite 8 可生成依赖 license 文件，但 2026-08 仍有已报告的错误版本/漏 license text 问题；它只能作为输入，发布前还需用 lockfile 与包内 LICENSE 做人工/独立工具复核。[Vite issue](https://github.com/vitejs/vite/issues/23355)

项目应维护：

- 根目录自身许可证；代码与内容/美术可分开授权。
- `THIRD_PARTY_NOTICES.md`：直接依赖、版本、用途、是否进产物、许可链接/文本。
- lockfile 与构建工具下载清单：URL、版本、SHA-256；CI 校验后才运行 Tweego/story format。
- 每次公开发布生成 SBOM/许可报告，并核对最终 `dist`，而非只看 `package.json`。

## DoL clean-room 边界

美国版权局说明，版权保护计算机程序的具体表达，不保护思想、程序逻辑、算法、系统、方法、概念或布局；这支持研究抽象机制，不授权复制具体实现或表达。其他司法辖区、商标与不正当竞争规则仍可能不同。[美国版权局：Computer Programs](https://www.copyright.gov/register/tx-programs.html)、[Circular 33](https://www.copyright.gov/circs/circ33.pdf)

### 可保留的抽象研究结果

- 地点、时间、行动、状态和条件事件组成生活循环。
- Passage 生命周期与数据驱动规则分层。
- 回合内按状态生成可用动作。
- 战败进入后续故事而非统一 Game Over。
- 大型文字项目按领域拆文件、提供构建/检查工具。

### 不得带入项目

- DoL 代码、宏实现、变量名/结构、数据表、Passage 文本及其翻译或近似改写。
- 角色、地点、设定、剧情顺序、独特描述、成人内容分类体系。
- 图像、CSS、字体、声音、图标、截图、界面文案、可辨识的整体视觉表达。
- DoL 构建脚本、Cordova 工程、ModLoader/第三方 DoL Mod 代码，除非另开许可审查并接受其许可后果。
- DoL 名称、logo 或暗示官方关联的宣传。

### 过程控制

1. 研究记录只写抽象事实和自己的术语，不粘贴源码、截图或长文本。
2. 实施任务引用本研究与后续规格，不引用 DoL 文件路径；实现人员无需打开 DoL 仓库。
3. 所有代码、世界观、人物、武学、UI 文案和视觉素材记录原创来源。
4. 相似机制使用通用领域词重新建模，测试用例也使用本项目原创数据。
5. 发现疑似来源污染时隔离文件，做来源审查；不能证明独立创作则重写。
6. 商业发行或出现高度相似争议前，交由目标市场的知识产权律师复核。

Creative Commons 自身不建议把 CC 许可用于软件，并指出其与主流软件许可证集成困难；DoL 的许可文件覆盖整个仓库时，更不能把“代码部分按普通开源依赖处理”。[Creative Commons FAQ](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software)

## 实施验收门

技术底座任务只有同时满足以下条件才可过门：

- 三个原创 Passage 在 Windows x64 和 CI 环境由固定版本 Tweego/SugarCube 成功编译。
- `tsc --noEmit`、单元测试、Vite 构建、Tweego 编译任何一步失败都会阻止产物。
- Tweego 与 SugarCube 下载物有固定 URL、版本和 SHA-256；禁止未校验自动执行。
- 最终 HTTPS 预览可安装、首次在线后可离线启动；无网络时不会请求 DoL 或第三方内容。
- 有更新时先提示保存与重载，不在进行中的回合强制接管。
- `dist` 含第三方 notice/许可入口；依赖清单与 lockfile 一致。
- 代码扫描不存在 DoL 文件、文本、素材、专有名词或复制的 starter 构建文件。
- SugarCube API 只从 adapter 访问；纯领域测试不加载浏览器和 SugarCube。

## 对后续票据的约束

- “定义状态与行动事务”：必须决定 SugarCube history 与纯 TypeScript 状态的单一真相，不能双写。
- “设计存档契约”：以 SugarCube 2.37.3 新 Save API 为准；PWA 缓存与存档存储分开处理。
- “定义实施验收门”：纳入工具校验和、离线/更新测试、许可/SBOM 扫描、SugarCube adapter 边界测试。
- 后续若 SugarCube 3 发布稳定版，只建立迁移研究票据；MVP 中途不追逐预发布版。
