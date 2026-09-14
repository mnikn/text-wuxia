---
title: 武侠江湖生活模拟 MVP 实施路线
label: wayfinder:map
status: open
issue_number: 1
issue_url: https://github.com/mnikn/text-wuxia/issues/1
---

## Destination

形成可直接交给开发执行的 MVP 规格与依赖计划：交付手机优先 Web + PWA，提供约 1～2 小时完整试玩，终点为加入照川门并完成首次门派任务；同时给出 MVP 后低精度路线图。

## Notes

- 领域：写实架空武侠、江湖生活模拟、数据驱动故事单元、动态回合战斗。
- 规划期间使用 `grilling`、`domain-modeling`、`research`、`prototype`。
- 默认只解决决策，不实现产品。
- Clean-room：DoL 仅作架构研究对象。
- 暂不承诺日期；开发者数量、每周投入与 AI 分工待确认。

## Decisions so far

<!-- 关闭票据后追加一行摘要和链接；详细答案只写在票据。 -->

- [验证 SugarCube 技术基础与许可边界](https://github.com/mnikn/text-wuxia/issues/2)：采用隔离式 SugarCube/Tweego + 当前 Node/Vite/TypeScript/PWA 工具链，starter 仅作参考，DoL 与发布物保持 clean-room。
- [定义首次门派任务的完整试玩路径](https://github.com/mnikn/text-wuxia/issues/3)：以七日内取得两类证明、药材护送及四级失败延续构成 1～2 小时切片，最终进入照川门，特殊招式不进入本切片。
- [研究 DoL 的行动与 Passage 生命周期](https://github.com/mnikn/text-wuxia/issues/12)：只借鉴集中时间轴、跨边界结算和动作后事件选择；领域事务由 TypeScript 原子提交，SugarCube Passage 只读渲染，禁止渲染期写状态或抽 RNG。
- [定义游戏状态与行动事务边界](https://github.com/mnikn/text-wuxia/issues/4)：`State.variables.game` 保存领域化权威快照，全部行动经确定性、可回滚事务提交；时间调度、事件入口与提交后副作用具有固定顺序，局部 ECS 只作为未来模块内部实现。
- [定义动态战斗回合与失败后果](https://github.com/mnikn/text-wuxia/issues/5)：行动由战斗状态生成（常规行动禁用示因、情境行动隐藏），每回合为玩家动作→敌人回应→回合末结算的原子事务；敌人仅抢攻/重击/喘息；胜利、逃跑、战败、被擒四结局均以失败延续写回江湖生活循环。
- [定义手机优先交互壳](https://github.com/mnikn/text-wuxia/issues/6)：采用方案 D：全屏正文+横滑地点胶囊导航+左侧抽屉（状态/行囊/日志页签，头常驻时辰与三维）；移动端把手滑出，桌面端固化为左栏；反馈以 logline 嵌入正文流。
- [定义故事单元 DSL 契约](https://github.com/mnikn/text-wuxia/issues/7)：一个故事单元 = 一个 Twee passage，条件/选择/检定/效果以自定义宏内联正文流；构建期提取器编译注册表，运行时宏渲染空操作、选择由交互壳渲染；once/cooldown/mutex + priority 分层加权 + next 链接 + 检定档带。
- [定义存档契约与迁移起点](https://github.com/mnikn/text-wuxia/issues/8)：自有存档层（SugarCube 不参与），存档包 = meta + GameState 快照；整数版本 + 纯函数迁移链；双缓冲原子写 + 行动后自动存档（1 自动 + 3 手动）；IndexedDB + persist；设置页导出/导入。
- [定义成长、经济与战斗数值不变量](https://github.com/mnikn/text-wuxia/issues/9)：7 日盒 ≈56h 预算、三死线交错；基本武艺递减成长（考核 ≥50 ≈ 27% 预算）、打工/采集时薪上限防无限钱；战斗复用检定档带，单次战败最坏 2 日+60 文；模拟器四 bot 断言软锁与取舍，常量集中 balance.ts。
- [定义 AI 辅助内容生产与校验流程](https://github.com/mnikn/text-wuxia/issues/10)：人写大纲 → AI 起草 → 人审改 → 校验门 → 入库；指南即 prompt + 模板 passage；构建期 schema/引用/lint、CI 可达性+黄金回放+注册表 diff、人审裁决文风；入口单元必配测试；@source 汇总合规清单。
- [定义里程碑、验收门与实施依赖](https://github.com/mnikn/text-wuxia/issues/11)：九个里程碑 M0～M8（卡片见 [milestones.md](../milestones.md)）；性能预算首屏 ≤3s/行动 ≤100ms/包 ≤2MB gzip；M3 后内容并行；MVP 后单 HTML 先行 → APK → 桌面，再反馈→内容储备→元进度。

## Not yet specified

- Build-time Mod、`.mod.zip` 与运行时 Mod Manager 的阶段边界。
- MVP 验证后，清河县之外的世界扩张模型与内容产能目标。
- 头像、地点图、纸娃娃等视觉资产何时进入路线。
- 公开试玩版后的运营、遥测、崩溃收集和玩家反馈闭环。

## Out of scope

- 复制或改写 DoL 的代码、文本、设定、美术和 UI 素材。
- MVP 内的 Android/iOS 原生包、运行时 Mod 管理器、纸娃娃、多敌人战斗、完整身体部位系统。
- 首个规划周期内建设完整天下、数百人物或数千故事单元。
