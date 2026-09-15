/**
 * GameState：唯一权威、可 JSON 序列化的持久快照（票据 003）。
 * 内容定义（地点/人物/物品/故事单元）不入存档，只存稳定 ID 与变化量。
 */
import type { ClockState } from "./clock";
import type { RngState } from "./rng";
import type { Weather } from "./balance";
import type { CheckBand } from "./check";

export type AttrId = "arm" | "agi" | "con" | "ins" | "com" | "luck";
export type Attributes = Record<AttrId, number>;

export const ATTR_LABELS: Record<AttrId, string> = {
  arm: "臂力",
  agi: "身法",
  con: "根骨",
  ins: "悟性",
  com: "定力",
  luck: "气运",
};

export type Severity = "轻伤" | "中伤" | "重伤";

export interface Wound {
  id: string;
  severity: Severity;
  /** 预计痊愈的绝对分钟；到期由调度器结算 */
  dueMinute: number;
  source: string;
}

export type WeatherState = Weather;

export type Role = "游子" | "候选学徒" | "记名弟子";

export interface ProofPools {
  /** 武艺证明 */
  martial: string[];
  /** 人情证明 */
  social: string[];
  /** 品行证明 */
  virtue: string[];
}

export interface ScheduledItem {
  id: string;
  dueMinute: number;
  /** 同时到期处理顺序（票据 003）：致命状态 > 任务期限 > 剧情强制 > 环境变化 > 普通随机 */
  priority: 1 | 2 | 3 | 4 | 5;
  kind: string;
  payload?: Record<string, unknown>;
}

export interface LogEntry {
  at: number;
  kind: "action" | "check" | "story" | "combat" | "system";
  text: string;
}

export interface ActiveStoryState {
  unitId: string;
  /** 进入时已结算的检定结果，供正文只读引用 */
  enterChecks: Record<string, { band: CheckBand; value: number; diff: number }>;
}

export type CombatOutcome = "victory" | "fled" | "defeated" | "captured";

export interface CombatantState {
  name: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  posture: "站立" | "倒地";
}

export interface CombatState {
  kind: "教学切磋" | "伏击";
  round: number;
  firstStrikePending: boolean;
  player: {
    hp: number;
    hpMax: number;
    stamina: number;
    staminaMax: number;
    neili: number;
    neiliMax: number;
    posture: "站立" | "倒地";
    blade: "持握" | "脱手";
    goldSalves: number;
    lightWounded: boolean;
    heavyWounded: boolean;
    weaponBonus: number;
    skill: number;
  };
  enemy: CombatantState & { difficulty: number };
  defending: boolean;
  outcome: CombatOutcome | null;
  /** 按回合归档的记录 */
  log: string[];
}

export interface EscortState {
  phase:
    | "领命" // 已报名领药材，尚未出发
    | "途中"
    | "伏击"
    | "调查"
    | "交付"
    | "返城"
    | "结束";
  route: "山道" | "官道" | null;
  startedMinute: number | null;
  deadlineMinute: number;
  /** 药材完好度 0～100 */
  cargo: number;
  courierSaved: boolean | null;
  courierTended: boolean;
  clues: string[];
  fightOutcome: CombatOutcome | null;
  /** 同行者信任 -10～10 */
  trust: number;
  companionDown: boolean;
  supplies: { extraHerbs: boolean; routeIntel: boolean };
}

export type EndingTier = "圆满" | "完成" | "失利" | "惨败";

export interface EndingState {
  tier: EndingTier;
  settledMinute: number;
  detail: string;
  direction: "剑术" | "拳掌" | "轻身" | null;
}

export interface PlayerState {
  name: string;
  origin: string;
  attrs: Attributes;
  hp: number;
  stamina: number;
  neili: number;
  /** 文 */
  money: number;
  hunger: number;
  fatigue: number;
  wounds: Wound[];
  /** 基本武艺 0～100（MVP 单成长线，票据 008） */
  martialSkill: number;
  equippedWeapon: string | null;
  debt: number;
  /** 睡眠不足生效的日期（第 N 日训练减半）；0 表示无 */
  sleepDebtDay: number;
}

export interface GameState {
  meta: {
    /** 存档契约版本（票据 007） */
    version: number;
    /** 行动号：提交检查点序列 */
    actionNumber: number;
    seed: number;
    playthroughId: string;
  };
  player: PlayerState;
  clock: ClockState;
  location: string;
  world: {
    weather: WeatherState;
    /** 剧情标记：命名空间.键；只允许已注册前缀写入 */
    flags: Record<string, number | boolean | string>;
    /** 入门证明池 */
    proofs: ProofPools;
    /** 已报名考核 / 已担保 */
    exam: { signedUp: boolean; guaranteed: boolean; result: "通过" | "担保" | null };
  };
  role: Role;
  /** 候选/弟子阶段：照川门信任 -10～10、贡献 0～100 */
  sect: { trust: number; contribution: number; observation: boolean };
  relations: Record<string, number>;
  inventory: Record<string, number>;
  stories: {
    seen: Record<string, true>;
    /** 下次可再触发时间（绝对分钟） */
    cooldowns: Record<string, number>;
    active: ActiveStoryState | null;
    flags: Record<string, number | boolean | string>;
  };
  escort: EscortState | null;
  combat: CombatState | null;
  scheduler: ScheduledItem[];
  /** 环形日志（最近约 200 条，票据 007） */
  log: LogEntry[];
  random: RngState;
  stats: {
    earned: number;
    spent: number;
    meals: number;
    trainHours: number;
    workHours: number;
    fights: number;
    lastMealMinute: number;
    lastWakeMinute: number;
    lastSleepMinute: number;
  };
  ending: EndingState | null;
}

/** 深克隆：状态契约即 JSON 可序列化，用 JSON 克隆保证确定性（Node16 无 structuredClone） */
export function cloneState<T>(s: T): T {
  return JSON.parse(JSON.stringify(s)) as T;
}

export function addLog(s: GameState, kind: LogEntry["kind"], text: string): void {
  s.log.push({ at: s.clock.minutes, kind, text });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

/** 允许的剧情标记命名空间前缀（内容侧注册；未注册写入在测试与开发期报错） */
export const KNOWN_FLAG_PREFIXES = [
  "origin.",
  "proof.",
  "life.",
  "escort.",
  "sect.",
  "world.",
  "body.",
  "npc.",
] as const;

export function isRegisteredFlag(key: string): boolean {
  return KNOWN_FLAG_PREFIXES.some((p) => key.startsWith(p));
}

export function setFlag(
  s: GameState,
  key: string,
  value: number | boolean | string,
  dev = false
): void {
  if (dev && !isRegisteredFlag(key)) {
    throw new Error(`未注册的剧情标记命名空间：${key}`);
  }
  s.stories.flags[key] = value;
}

export function flagNum(s: GameState, key: string, fallback = 0): number {
  const v = s.stories.flags[key];
  return typeof v === "number" ? v : fallback;
}

export function flagBool(s: GameState, key: string): boolean {
  return s.stories.flags[key] === true;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 完整校验（开发/测试每次提交；生产校验受影响领域，存档读写时完整校验） */
export function validateState(s: GameState): string[] {
  const issues: string[] = [];
  const p = s.player;
  const nums: Array<[string, number]> = [
    ["hp", p.hp],
    ["stamina", p.stamina],
    ["neili", p.neili],
    ["money", p.money],
    ["martialSkill", p.martialSkill],
    ["hunger", p.hunger],
    ["fatigue", p.fatigue],
  ];
  for (const [k, v] of nums) {
    if (!Number.isFinite(v)) issues.push(`player.${k} 非有限数`);
  }
  if (p.hp < 0) issues.push("player.hp 为负");
  if (p.stamina < 0) issues.push("player.stamina 为负");
  if (p.money < 0) issues.push("player.money 为负");
  if (p.martialSkill < 0 || p.martialSkill > 100) issues.push("martialSkill 越界");
  if (p.hunger < 0 || p.hunger > 100) issues.push("hunger 越界");
  if (p.fatigue < 0 || p.fatigue > 100) issues.push("fatigue 越界");
  if (p.debt < 0) issues.push("debt 为负");
  for (const [npc, v] of Object.entries(s.relations)) {
    if (typeof v !== "number" || !Number.isFinite(v)) issues.push(`relations.${npc} 非法`);
  }
  if (s.log.length > 200) issues.push("log 超出环形上限");
  if (!s.location) issues.push("location 缺失");
  return issues;
}
