---
title: 验证 SugarCube 技术基础与许可边界
label: wayfinder:research
status: closed
issue_number: 2
issue_url: https://github.com/mnikn/text-wuxia/issues/2
assignee: technical_foundation_research
blocked_by: []
resolution: "采用隔离式 SugarCube 2.37.3/Tweego 2.1.1 + Node 24 LTS/Vite 8.3.x/TypeScript 6.0.x；PWA 暂用 vite-plugin-pwa 1.3.0 稳定能力并封装替换边界；sugarcube-starter 只作参考、不直接克隆；DoL 保持严格 clean-room，发布物保留宽松依赖 notice。研究资产见 ../research/technical-foundation-and-licensing.md。"
---

## Question

当前可维护的 SugarCube/Tweego/TypeScript/Vite/PWA 组合是什么；候选 starter 是否适合作为底座；各依赖、DoL 研究材料与产物分发分别有哪些许可和集成约束？

## Resolution

[研究资产：SugarCube 技术基础与许可边界](../research/technical-foundation-and-licensing.md)

采用隔离式 SugarCube 2.37.3/Tweego 2.1.1 + Node 24 LTS/Vite 8.3.x/TypeScript 6.0.x。PWA 暂用 `vite-plugin-pwa` 1.3.0 的稳定能力，通过独立构建阶段和更新提示隔离未来替换。`sugarcube-starter` 只作构建思路参考，不直接克隆。DoL 严格保持 clean-room；发布物维护第三方 notice、校验和、lockfile 与 SBOM/许可检查。
