# Wayfinder 追踪器

GitHub Issues 是权威追踪器：[武侠江湖生活模拟 MVP 实施路线](https://github.com/mnikn/text-wuxia/issues/1)。仓库内 Markdown 文件保留完整规划上下文和可审查历史。

- `map.md`：地图 Issue 的仓库源文件，仅索引已关闭决策。
- `tickets/*.md`：子 Issue 的仓库源文件。
- GitHub assignee 表示认领；开放且未认领的子 Issue 才能进入前沿。
- GitHub 原生 `blocked by` 表示阻塞；所有阻塞 Issue 关闭后进入前沿。
- 解决时先在 Issue 记录 Resolution 并关闭，再同步 Markdown 源文件和地图索引。
- `setup-github-tracker.ps1`：幂等创建/同步标签、Issues、子 Issue 与依赖关系。

Markdown front matter 中的 `issue_number` 与 `issue_url` 用于从仓库跳转到权威 Issue。
