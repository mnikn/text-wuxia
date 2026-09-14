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

## Not yet specified

- MVP 后 Android APK、单 HTML 与桌面发行的先后顺序。
- Build-time Mod、`.mod.zip` 与运行时 Mod Manager 的阶段边界。
- MVP 验证后，清河县之外的世界扩张模型与内容产能目标。
- 头像、地点图、纸娃娃等视觉资产何时进入路线。
- 公开试玩版后的运营、遥测、崩溃收集和玩家反馈闭环。

## Out of scope

- 复制或改写 DoL 的代码、文本、设定、美术和 UI 素材。
- MVP 内的 Android/iOS 原生包、运行时 Mod 管理器、纸娃娃、多敌人战斗、完整身体部位系统。
- 首个规划周期内建设完整天下、数百人物或数千故事单元。
