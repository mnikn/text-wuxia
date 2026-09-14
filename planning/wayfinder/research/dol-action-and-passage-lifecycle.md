# DoL 行动与 Passage 生命周期研究

- 研究日期：2026-09-14
- 对应票据：[研究 DoL 的行动与 Passage 生命周期](../tickets/011-research-dol-action-lifecycle.md)
- DoL 主基线：官方标签 `0.5.10.10` 的 `72b0db95eb5f658b8edff1a218380d29fdcde614`
- 交叉核对：官方仓库 `master` 的 `8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8`；本文涉及的核心模式未发生方向性变化
- 研究边界：只提取架构事实；不复制 DoL 代码、文本、变量名、数据结构或 UI 表达

## 结论

DoL 的现行实现不是可直接采用的“行动事务管线”。它更接近以下时序：

```text
玩家点击链接
-> 链接回调立即执行内嵌状态变更与显式时间推进
-> 可选的强制改道逻辑决定目标 Passage
-> SugarCube 导航并创建新 history moment
-> Passage 预处理
-> Passage 渲染期间继续执行条件、随机选择、宏和状态变更
-> 内容显示及外围 UI 更新
```

其中有两项值得 clean-room 转化：

1. 用单调时间轴保存时间，日期、时辰等作为派生值；时间推进跨越分钟、时辰、日期等边界时，按边界触发世界结算。
2. 玩家行动显式声明时间成本，纯界面查看不自动推进时间；事件候选先按条件形成集合，再从可用候选中选一个。

不应转化的是“链接/Passage 即事务”。DoL 的状态变化分散在链接回调、时间函数、导航改道、Passage 预处理和渲染宏中，没有统一验证、草稿、回滚或提交点。对本项目，Q52 应采用独立行动事务；SugarCube 导航只负责展示已提交结果。

## 一手代码观察

### 1. 玩家行动入口

DoL 替换了默认链接/按钮宏。点击后先执行链接载荷；随后读取可变的改道状态、记录界面滚动位置，最后调用 SugarCube 导航。也就是说，玩家选择的规则效果先于 Passage 导航发生，但效果仍由界面宏直接驱动，而非先构造结构化行动意图。[DoL 链接覆盖，固定提交 L67-L98](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/03-JavaScript/01-overrides/link-override.js#L67-98)

地点 Passage 的抽样与此一致：移动链接把时间消耗和其他状态改变写在链接载荷中；同一文件的地点入口在渲染时按状态选择事件分支。[DoL 地点 Passage，固定提交 L76-L96、L150-L169](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/overworld-forest/loc-forest/main.twee#L76-169)

可 clean-room 转化的经验：

- 行动的规则效果应在导航前完成；导航是结果展示，不是规则入口。
- 每个可执行选择都应对应可记录的行动类型及参数。

应避免：

- Passage 名称充当业务命令。
- 链接载荷直接写持久状态。
- 用全局“下一目标”状态改写玩家原始意图。

### 2. SugarCube Passage 生命周期

SugarCube 官方处理顺序为：初始化事件发生在 history 修改前；随后执行预显示任务与开始事件，再渲染正文和页眉页脚，再显示内容、刷新 UI 区域，最后触发结束事件。[SugarCube 导航事件顺序](https://www.motoslave.net/sugarcube/2/docs/#events-navigation)

SugarCube 只在 Passage 导航时创建 history moment；每个 moment 包含当时所有故事变量。官方特别说明：新 moment 创建后、下一次导航前发生的变量变化不一定进入当前保存点。[SugarCube 状态、会话与保存指南](https://www.motoslave.net/sugarcube/2/docs/#guide-state-sessions-and-saving)

DoL 关闭玩家历史控件，但保留有限数量的 history moments。[DoL SugarCube 配置，固定提交 L1-L4](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/01-config/sugarcubeConfig.js#L1-4) DoL 还在全局导航覆盖器里处理大量兼容改道，并在 Passage 预处理钩子中根据可变状态替换待渲染内容。[DoL Passage 预处理，固定提交 L1-L14](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/03-JavaScript/01-overrides/passage-override.js#L1-14)

稳定标签中的通用 Header 会在正文前执行 Passage 跟踪与兼容处理，Footer 会在正文后执行自动存档和损坏检测；这些是“跨切面工作挂在每次渲染上”的直接例子。[DoL PassageHeader，固定提交 L1-L65](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/04-Variables/variables-passageHeader.twee#L1-65)、[DoL PassageFooter，固定提交 L76-L110](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/04-Variables/variables-passageFooter.twee#L76-110)

对本项目的约束：

- 一个“玩家行动提交”必须对应一个明确持久快照，不能依赖任意 Passage 跳转碰巧生成 moment。
- Passage 渲染必须只读取提交结果；渲染期不得消耗随机数、推进时间或改动核心状态。
- 强制事件与改道应成为事务结果中的显式字段，不通过全局临时开关劫持导航。
- 既然禁止玩家回退，生产配置应把 SugarCube history 压到满足存档适配所需的最小值；调试历史另行隔离。

### 3. 变量修改边界

DoL 的 JavaScript、宏与 Passage 共同直接修改 SugarCube 故事变量；临时变量又承担事件候选池和渲染中间值。此模式降低了局部写作门槛，代价是无法从调用边界判断哪些字段会改变，也无法在中途异常时整体回滚。

链接回调先改状态再导航，来向 Passage 的渲染还可继续改状态；SugarCube 的 moment 创建却绑定导航而非业务提交。三条边界不重合，导致“当前屏幕展示完成”“规则结算完成”“可恢复快照完成”不是同一时刻。

对本项目的约束：

- SugarCube 的 `$game` 是唯一持久快照，但只有 adapter 能替换它。
- 领域函数接收旧快照和行动意图，返回新快照、叙事结果、日志及下一界面目标。
- Twee/Passage 不允许直接写核心字段，只能提交结构化意图或读取结果视图。
- 未注册字段、非有限数值、非法枚举、负资源和悬空内容引用在提交前失败。

### 4. 时间推进

DoL 已从多个重复日期字段收束到单调时间值和派生 getter；官方合并说明指出，这次重构用于消除日期字段不同步，并把时间效果从每个 Passage 的通用效果中移到真正推进时间的入口。[DoL 时间重构合并说明](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/merge_requests/1921)

当前实现的时间入口先校验整数与单位，再统一换算后调用时间服务。[DoL 时间宏，固定提交 L50-L78](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/03-JavaScript/time-macros.js#L50-78) 时间服务按跨越的细粒度、时辰、日、周等边界执行相应副作用，最后把时钟设为目标值。[DoL 时间服务，固定提交 L142-L198](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/03-JavaScript/time.js#L142-198) 每次 Passage 初始化还会从持久时间重建当前派生日期对象。[DoL 时间同步，固定提交 L453-L458](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/03-JavaScript/time.js#L453-458)

可 clean-room 转化：

- 持久化单一整数时间轴；日期、星期、时辰由纯函数派生。
- 一次长行动按关键边界分段，让先发生的世界变化能影响后续分段。
- 只有声明时间成本的行动调用时间服务。

必须修正后再采用：

- DoL 的时间服务在中间副作用抛错时仍会在 `finally` 中更新最终时钟，存在“部分世界效果 + 完整时间推进”的风险。本项目必须在事务草稿中完成全部边界结算，验证成功后一次提交；异常时旧快照与 RNG 游标均不变。
- 时间服务不得直接调用散落的剧情宏。它只产生已到达边界及调度请求，由世界规则表处理。

### 5. 事件选择

DoL 提供事件池工具：候选项存放在 Passage 临时状态中，每项包含权重与可执行内容；可由持久覆盖值强制指定一次结果，否则进行加权随机，选中后立即在当前渲染上下文执行内容。[DoL 事件池，固定提交 L28-L150](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/03-JavaScript/eventpool.js#L28-150) 稳定标签中的真实调用在同一 Passage 内清理候选池、按条件添加候选并立即抽取执行。[DoL 事件池调用，固定提交 L1038-L1071](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-town/loc-cafe/main.twee#L1038-1071) 地点抽样还显示另一种常见模式：Passage 内按条件和随机判断直接选择不同事件宏。[DoL 地点事件分支，固定提交 L76-L83](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8/game/overworld-forest/loc-forest/main.twee#L76-83)

可 clean-room 转化：

- 事件选择分成“资格过滤”和“候选决选”。
- 权重只在同优先级、同触发点的合格候选间使用。
- 每个行动最多选一个入口故事单元；强制事件通过明确优先级进入队列。

应避免：

- 事件候选携带可直接执行的渲染字符串。
- 在 Wikifier/渲染期间消耗 RNG。
- 条件、随机、状态修改与正文输出混在同一 Passage。
- 用可变全局覆盖值跳过正常资格校验。
- 候选资格计算夹带持久写入；未被选中的候选也可能改变机会状态。[DoL 候选构建抽样，固定提交 L462-L475](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/blob/72b0db95eb5f658b8edff1a218380d29fdcde614/game/overworld-town/loc-cafe/main.twee#L462-475)

## 给 Q52 的事务顺序

参考 DoL 的有效经验并修正其耦合后，Q52 采用以下顺序：

```text
1. 接收结构化行动意图
2. 对当前快照重新验证前置条件
3. 克隆事务草稿，绑定事务 ID 与旧 RNG 游标
4. 生成并记录本行动的确定性随机结果
5. 支付即时成本，但不写回权威快照
6. 执行行动直接效果
7. 按关键时间边界分段推进世界规则
8. 结算持续状态、期限、伤势与资源下限
9. 过滤故事单元资格，处理强制队列，最多选择一个入口
10. 验证完整新状态与内容引用
11. 原子替换 SugarCube `$game`
12. 记录玩家日志和有限调试摘要
13. 导航到结果 Passage；只渲染已提交结果
```

读取 RNG 前必须完成全部非随机合法性检查；事务后续失败时草稿整体丢弃，旧 RNG 游标不变。

## 事务失败语义

| 失败点 | 结果 |
|---|---|
| 前置条件失效 | 返回结构化拒绝；不建草稿、不耗资源、不耗时间、不耗 RNG |
| 规则函数抛错 | 丢弃草稿；保留旧快照与 RNG；开发态附事务摘要 |
| 新状态验证失败 | 同上，并标记规则/内容缺陷，不转成角色失败 |
| Passage/渲染失败 | 已提交游戏状态不回滚；重新渲染同一结果视图，禁止重复提交行动 |
| 存档写入失败 | 当前内存状态保留；提示导出/重试，不重放行动 |

## 应建立的适配器边界

```text
Twee 链接/按钮
-> dispatch(actionIntent)
-> ActionEngine.resolve(oldSnapshot, intent)
-> commit(newSnapshot, actionResult)
-> PassageRouter.show(actionResult.view)
```

SugarCube adapter 是唯一可调用 `State`、`Engine`、`Save`、`Story` 的模块。领域核心不得知道 Passage 名称；故事单元以原创 ID 表达，router 再把结果视图映射到 Passage。

## 验收门

- 同一快照、行动和 RNG 状态得到字节等价的领域结果。
- 非法行动、规则异常、状态验证失败均不会改变 `$game` 或 RNG 游标。
- 四小时训练跨过饭点、天气变化和任务期限时，边界顺序固定且可测试。
- 一次行动最多产生一个入口故事单元；强制事件顺序可解释。
- 打开日志、人物、物品或设置不会创建业务事务、推进时间或抽取随机数。
- 任意 Passage 重渲染不会改变游戏状态。
- 点击提交按钮两次只接受一次事务；结果 Passage 刷新不会重复扣费。
- 生产态无历史回退；调试历史不能进入公开存档契约。

## 对后续票据的约束

- “定义游戏状态与行动事务边界”：Q52 采用本文事务顺序；明确每阶段输入/输出与失败语义。
- “设计故事单元 DSL”：条件、权重、优先级和效果必须是可验证定义，正文不执行持久写入。
- “设计存档契约”：存档边界绑定已提交事务，不绑定“当前 DOM 已显示”。
- “定义动态战斗回合”：一次玩家动作、敌人回应和回合末结算使用同一草稿、同一 RNG 记录和单次提交。

## 来源清单

- [DoL 官方稳定标签固定提交](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/tree/72b0db95eb5f658b8edff1a218380d29fdcde614)
- [DoL 官方 master 交叉核对提交](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/tree/8c7ed1e378e420375a8ff06dfaf3b3a2eb05d3f8)
- [SugarCube 2 官方文档](https://www.motoslave.net/sugarcube/2/docs/)
- [DoL 时间重构合并说明](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/merge_requests/1921)
