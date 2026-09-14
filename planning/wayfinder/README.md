# 本地 Wayfinder 追踪器

本仓库未配置远程 issue tracker，暂用 Markdown 票据。

- `map.md`：规划地图，仅索引已关闭决策。
- `tickets/*.md`：决策票据。
- `status: open` 且 `assignee` 为空：未认领。
- `blocked_by` 中所有票据关闭后：进入前沿。
- 认领时先写 `assignee`，解决时补充 `resolution` 并将 `status` 改为 `closed`。

查询前沿时读取全部票据 front matter，筛选开放、未认领、依赖均已关闭的票据。
