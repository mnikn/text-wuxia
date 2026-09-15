/**
 * 内容注册表组装 + 构建期校验门（票据 006/009）：
 * id 唯一、next/引用可解析、每个单元至少一个可选分支、入口图连通无孤岛。
 */
import type { StoryUnit } from "../game/stories";
import { LIFE_UNITS } from "./stories.life";
import { ESCORT_UNITS } from "./stories.escort";

export const STORY_LIST: StoryUnit[] = [...LIFE_UNITS, ...ESCORT_UNITS];

export const REGISTRY = {
  units: Object.fromEntries(STORY_LIST.map((u) => [u.id, u])) as Record<string, StoryUnit>,
};

/** 非入口的链头：由行动（ctx.startStory）或战斗结局路由显式启动 */
export const ROOT_UNITS: string[] = [
  "sect.exam",
  "sect.guarantee",
  "school.sparring",
  "escort.take",
  "wharf.night.guard.after",
  "escort.fight.victory",
  "escort.fight.fled",
  "escort.fight.defeated",
  "escort.fight.captured",
];

/** 构建期校验：返回问题列表（空 = 通过）。CI/测试与开发启动时调用。 */
export function validateRegistry(reg = REGISTRY): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const u of STORY_LIST) {
    if (ids.has(u.id)) issues.push(`故事 id 重复：${u.id}`);
    ids.add(u.id);
  }
  for (const u of STORY_LIST) {
    if (u.choices.length === 0) issues.push(`单元无任何选择：${u.id}`);
    for (const c of u.choices) {
      if (c.check && !c.bands && !c.bandFallback) {
        issues.push(`选择带检定但无档带分支：${u.id}.${c.id}`);
      }
      if (c.next && !ids.has(c.next)) {
        issues.push(`next 引用不存在：${u.id}.${c.id} → ${c.next}`);
      }
      for (const bo of Object.values(c.bands ?? {})) {
        if (bo.next && !ids.has(bo.next)) {
          issues.push(`档带 next 引用不存在：${u.id}.${c.id} → ${bo.next}`);
        }
      }
    }
    if (u.entry && u.when === undefined) {
      issues.push(`入口单元缺少 when 条件（会无条件参评）：${u.id}`);
    }
  }

  // 可达性：从入口单元与链头单元出发，next/band-next 图连通无孤岛
  const reachable = new Set<string>();
  const queue = [...STORY_LIST.filter((u) => u.entry).map((u) => u.id), ...ROOT_UNITS];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const u = reg.units[id];
    if (!u) continue;
    for (const c of u.choices) {
      if (c.next) queue.push(c.next);
      for (const bo of Object.values(c.bands ?? {})) if (bo.next) queue.push(bo.next);
    }
  }
  for (const id of ids) {
    if (!reachable.has(id)) issues.push(`不可达单元（孤岛）：${id}`);
  }
  return issues;
}
