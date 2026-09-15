/**
 * 故事引擎（票据 006 语义）：
 * - 触发控制：once / cooldown / mutex / when
 * - 入口评估双段制：priority 分层（高层有候选低层不参评），层内 weight 加权随机（消耗事务 RNG）
 * - 剧情链：next 显式链接；entry:false 节点只能被链接到达
 * - 检定：check 声明能力与难度，档带全局缺省 ±20；band 分支独立效果与 next
 * - 选项展示：常规选项禁用示因、情境选项隐藏（票据 004/005）
 */
import { rollD100, weightedPick, type RngState } from "../engine/rng";
import { addLog, type AttrId, type GameState, type Severity, type ActiveStoryState } from "../engine/state";
import { resolveCheck, type CheckBand } from "../engine/check";
import { checkValue } from "../engine/derived";
import type { Effect } from "./effects";

export type StoryPriority = 2 | 3 | 4 | 5; // 2 任务期限/剧情强制 3 环境变化 4 普通随机 5 备用

export interface CheckDecl {
  /** 检定名（如 "察觉"），结果以该名为键写入 enterChecks 供正文引用 */
  tag: string;
  attr: AttrId;
  label: string;
  difficulty: number;
  thresholds?: { great?: number; fail?: number };
}

export interface BandOutcome {
  logline: string;
  effects?: readonly Effect[];
  next?: string;
}

export interface StoryChoice {
  id: string;
  label: string;
  /** 代价/风险副标题（票据 004 信息表达） */
  note?: string;
  /** 返回阻断原因（用于禁用示因）；情境选项返回原因则直接隐藏 */
  when?: (s: GameState) => string | null;
  situational?: boolean;
  minutes?: number;
  cost?: { money?: number; stamina?: number; item?: { id: string; count: number } };
  check?: CheckDecl;
  /** 有 check 时按档带分支；无 check 时用 effects + next */
  bands?: Partial<Record<CheckBand, BandOutcome>>;
  bandFallback?: BandOutcome;
  effects?: readonly Effect[];
  next?: string;
}

export interface StoryUnit {
  /** 命名约定：地点.主题.变体（票据 009） */
  id: string;
  title: string;
  entry: boolean;
  priority: StoryPriority;
  weight: number;
  once?: boolean;
  cooldownMinutes?: number;
  mutex?: string;
  when?: (s: GameState) => boolean;
  onEnter?: CheckDecl[];
  text: (s: GameState, enterChecks: ActiveStoryState["enterChecks"]) => string[];
  choices: StoryChoice[];
}

export interface StoryRegistry {
  units: Record<string, StoryUnit>;
}

export function currentUnit(s: GameState, reg: StoryRegistry): StoryUnit | null {
  if (!s.stories.active) return null;
  return reg.units[s.stories.active.unitId] ?? null;
}

export function choiceBlocked(s: GameState, choice: StoryChoice): string | null {
  if (choice.when) {
    const reason = choice.when(s);
    if (reason) return reason;
  }
  if (choice.cost?.money && s.player.money < choice.cost.money) return "银钱不足";
  if (choice.cost?.stamina && s.player.stamina < choice.cost.stamina) return "体力不支";
  if (choice.cost?.item && (s.inventory[choice.cost.item.id] ?? 0) < choice.cost.item.count) return "缺少物品";
  return null;
}

/** 候选入口集合：entry、未见(once)、冷却已过、条件满足 */
export function eligibleEntries(s: GameState, reg: StoryRegistry): StoryUnit[] {
  const out: StoryUnit[] = [];
  for (const u of Object.values(reg.units)) {
    if (!u.entry) continue;
    if (u.once && s.stories.seen[u.id]) continue;
    const cd = s.stories.cooldowns[u.id];
    if (cd !== undefined && s.clock.minutes < cd) continue;
    if (u.when && !u.when(s)) continue;
    if (u.choices.length === 0) continue;
    out.push(u);
  }
  return out;
}

/** 入口评估：priority 分层 → 层内加权随机；mutex 同组至多取一 */
export function pickEntry(s: GameState, reg: StoryRegistry, rng: RngState): { unit: StoryUnit | null; rng: RngState } {
  const candidates = eligibleEntries(s, reg);
  if (candidates.length === 0) return { unit: null, rng };
  const tiers = [2, 3, 4, 5] as const;
  const usedMutex = new Set<string>();
  // 已在 cooldown/seen 评估后，mutex 看当前候选（同组至多一个被选中）
  for (const tier of tiers) {
    let pool = candidates.filter((u) => u.priority === tier);
    if (pool.length === 0) continue;
    // 逐个加权抽取，撞 mutex 则剔除该组继续
    let guard = pool.length + 1;
    while (pool.length > 0 && guard-- > 0) {
      const { index, rng: r1 } = weightedPick(rng, pool, (u) => u.weight);
      if (index < 0) break;
      rng = r1;
      const picked = pool[index];
      if (picked.mutex && usedMutex.has(picked.mutex)) {
        pool = pool.filter((u) => u.mutex !== picked.mutex);
        continue;
      }
      return { unit: picked, rng };
    }
  }
  return { unit: null, rng };
}

/** 进入故事单元：记 seen/冷却、跑进入检定（只读渲染引用） */
export function beginStory(s: GameState, unit: StoryUnit, rng: RngState, dev: boolean): RngState {
  s.stories.active = { unitId: unit.id, enterChecks: {} };
  s.stories.seen[unit.id] = true;
  if (unit.cooldownMinutes) {
    s.stories.cooldowns[unit.id] = s.clock.minutes + unit.cooldownMinutes;
  }
  addLog(s, "story", `【${unit.title}】`);
  if (unit.onEnter) {
    for (const decl of unit.onEnter) {
      const r = resolveCheck(rng, checkValue(s, decl.attr), decl.difficulty, decl.thresholds);
      rng = r.rng;
      s.stories.active.enterChecks[decl.tag] = { band: r.band, value: r.value, diff: r.diff };
      addLog(s, "check", `${decl.label} 检定${r.band}（${r.roll}+${checkValue(s, decl.attr)} vs ${decl.difficulty}）`);
      if (dev && r.band === "大成功") addLog(s, "check", "（大成功）");
    }
  }
  return rng;
}

export interface ChoiceResolve {
  rng: RngState;
  next: string | null;
  loglines: string[];
}

/** 结算一个故事选择：检定/效果/next（在事务草稿上调用） */
export function resolveChoice(
  s: GameState,
  unit: StoryUnit,
  choice: StoryChoice,
  rng: RngState,
  apply: (effects: readonly Effect[]) => void,
  dev = false
): ChoiceResolve {
  const loglines: string[] = [];
  let next: string | null = choice.next ?? null;

  if (choice.check) {
    const decl = choice.check;
    const r = resolveCheck(rng, checkValue(s, decl.attr), decl.difficulty, decl.thresholds);
    rng = r.rng;
    const line = `${decl.label} 检定${r.band}（${r.roll}+${checkValue(s, decl.attr)} vs ${decl.difficulty}）`;
    addLog(s, "check", line);
    loglines.push(line);
    const bandOutcome = choice.bands?.[r.band] ?? choice.bandFallback;
    if (bandOutcome) {
      if (bandOutcome.logline) {
        addLog(s, "story", bandOutcome.logline);
        loglines.push(bandOutcome.logline);
      }
      if (bandOutcome.effects) apply(bandOutcome.effects);
      next = bandOutcome.next ?? next;
    }
  } else {
    if (choice.effects) apply(choice.effects);
  }

  // 故事链收束：无 next 则退出当前单元；有 next 由事务层接管链至下一单元
  if (!next) {
    s.stories.active = null;
  }
  return { rng, next, loglines };
}

/** 类型再导出，内容文件统一从此取 */
export type { Effect, Severity, AttrId };
