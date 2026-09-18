/**
 * 最小运行时：把编译出的 IR 跑起来（#20 最短路径）。
 *
 * 范围只有本批需要的东西：渲染 passage、评估受限表达式、扣代价、应用效果、按 <<next>> 前进。
 * 不含：涌现模板、检定档带、战斗、存档。这些等后续增量接。
 */
import { itemName, itemWeight } from "../content/items";
import { weightedPick, type RngState } from "../engine/rng";
import type { Diagnostic, Expr, IrAmount, IrBlock, IrChoice, IrChunk, IrCost, IrEff, IrPassage, TweeProgram } from "./types";

/* ---------------- 状态 ---------------- */

/** 行止记录的一条：文本 + 方向，方向由引擎判定（增 / 减 / 只是记一笔） */
export interface RecentLine {
  text: string;
  kind: "gain" | "loss" | "note";
  /** 得失混排时的分色段：给了就按段上色，text 只作无样式兜底 */
  parts?: { text: string; kind: "gain" | "loss" | "note" }[];
}

/** 本批的身体与日常状态：体力 / 三层生命 / 双层内力 + 时间地点银钱（#24 定稿）+ 携带物 */
export interface SliceState {
  clock: { day: number; minute: number };
  location: string;
  money: number;
  stamina: { current: number; max: number };
  life: { current: number; injuryCap: number; max: number };
  neili: { current: number; max: number };
  /** 携带物：物品名 → 件数；只含正数（扣到 0 即删键），重量是单件属性 */
  items: Record<string, number>;
  /** 已到过的单元 */
  visited: Record<string, true>;
  /** 跑到没有选项也没有 next 的单元：本批到此为止（后续接自由行动） */
  atFreeActions: boolean;
  /** 上一个选项的正文（选中后与目标单元的正文连排） */
  pendingText?: string[];
  /** 最近一次推进产生的行止记录（UI 用；跟在正文后面显示） */
  recent: RecentLine[];
  /** 确定性随机状态：每次随机调度只推进 cursor。 */
  random: RngState;
}

export const SLICE_TUNE = {
  staminaMax: 100,
  lifeMax: 100,
  neiliMax: 40,
  /** 开场身上没钱：家里只剩父亲那把剑能换钱（#20 开场改版） */
  money: 0,
  /** 携带上限（斤）：甲案取值，开场买齐粮药后 16/20，剩 4 斤余量 */
  carryMax: 20,
  day: 1,
  minute: 7 * 60, // 开场辰时正（时辰口径见 twee-app 的 shichenName）
  home: "家中",
  startPassage: "地点.家村.家中",
  seed: 1,
};

export function createSliceState(): SliceState {
  return {
    clock: { day: SLICE_TUNE.day, minute: SLICE_TUNE.minute },
    location: SLICE_TUNE.home,
    money: SLICE_TUNE.money,
    stamina: { current: SLICE_TUNE.staminaMax, max: SLICE_TUNE.staminaMax },
    life: { current: SLICE_TUNE.lifeMax, injuryCap: SLICE_TUNE.lifeMax, max: SLICE_TUNE.lifeMax },
    neili: { current: SLICE_TUNE.neiliMax, max: SLICE_TUNE.neiliMax },
    items: {},
    visited: {},
    atFreeActions: false,
    recent: [],
    random: { seed: SLICE_TUNE.seed, cursor: 0 },
  };
}

/* ---------------- 历法 ---------------- */

/** 本批的简法历：每月 30 日、12 月一年。第 1 日就是 1 年 1 月 1 日。 */
export const CALENDAR = { daysPerMonth: 30, monthsPerYear: 12 };

export interface GameDate {
  year: number;
  month: number;
  day: number;
}

/** 第 N 日 → 年月日（时钟内部只存 day 与 minute，年月日是派生值） */
export function dateOf(day: number): GameDate {
  const perYear = CALENDAR.daysPerMonth * CALENDAR.monthsPerYear;
  const idx = Math.max(0, Math.floor(day) - 1);
  const rest = idx % perYear;
  return {
    year: Math.floor(idx / perYear) + 1,
    month: Math.floor(rest / CALENDAR.daysPerMonth) + 1,
    day: (rest % CALENDAR.daysPerMonth) + 1,
  };
}

/* ---------------- 表达式求值 ---------------- */

const BUILTIN_FIELDS = new Set(["hour", "day", "weather", "role", "money", "stamina", "neili"]);

export function evalExpr(expr: Expr, state: SliceState): number | string | boolean | null {
  switch (expr.k) {
    case "num":
      return expr.value;
    case "str":
      return expr.value;
    case "bool":
      return expr.value;
    case "dotted":
      return readPath(state, expr.path);
    case "not":
      return !truthy(evalExpr(expr.expr, state));
    case "and":
      return expr.xs.every((x) => truthy(evalExpr(x, state)));
    case "or":
      return expr.xs.some((x) => truthy(evalExpr(x, state)));
    case "op": {
      const left = evalExpr(expr.left, state);
      const right = evalExpr(expr.right, state);
      switch (expr.op) {
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case "<":
          return Number(left) < Number(right);
        case "<=":
          return Number(left) <= Number(right);
        case ">":
          return Number(left) > Number(right);
        case ">=":
          return Number(left) >= Number(right);
      }
      return null;
    }
    case "call": {
      // seen() 读 visited 表（进过的单元、选过的 mark 都在里头）；item() 读携带物
      if (expr.name === "seen") {
        const arg = evalExpr(expr.arg, state);
        return typeof arg === "string" && state.visited[arg] === true;
      }
      if (expr.name === "item") {
        const arg = evalExpr(expr.arg, state);
        return typeof arg === "string" ? itemCount(state, arg) : 0;
      }
      return null;
    }
  }
}

function readPath(state: SliceState, path: string[]): number | string | boolean | null {
  const [root, ...rest] = path;
  switch (root) {
    case "money":
      return state.money;
    case "hour":
      return Math.floor(state.clock.minute / 60);
    case "day":
      return state.clock.day;
    case "地点":
      return state.location;
    default:
      break;
  }
  if (root === "stamina") return asScalar(pick(state.stamina, rest)) ?? state.stamina.current;
  if (root === "生命") return asScalar(pick(state.life, rest)) ?? state.life.current;
  if (root === "内力") return asScalar(pick(state.neili, rest)) ?? state.neili.current;
  return null;
}

/** 只放行标量；读到对象说明写错了字段，当作没有。 */
function asScalar(v: unknown): number | string | boolean | null {
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  return null;
}

function pick(obj: Record<string, unknown>, rest: string[]): unknown {
  if (rest.length === 0) return undefined;
  let cur: unknown = obj;
  for (const key of rest) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur as number | string | boolean;
}

function truthy(v: number | string | boolean | null): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v !== "";
}

/* ---------------- 量与代价 ---------------- */

/** 一两 = 一千文。银钱字段只以「文」为权威，换算只发生在显示层。 */
export const WEN_PER_LIANG = 1000;

/** 银钱的显示口径：`1000 → 一两`、`1500 → 一两 500 文`、`300 → 300 文`。 */
export function formatMoney(wen: number): string {
  const sign = wen < 0 ? "-" : "";
  const abs = Math.abs(wen);
  const liang = Math.floor(abs / WEN_PER_LIANG);
  const rest = abs % WEN_PER_LIANG;
  if (liang === 0) return `${sign}${rest} 文`;
  if (rest === 0) return `${sign}${liang} 两`;
  return `${sign}${liang} 两 ${rest} 文`;
}

/** 行止记录里的钱数：整两说「1 两银两」，零钱只说文，零整都有就不带后缀（「1 两 500 文」）。 */
function moneyAmount(wen: number): string {
  const abs = Math.abs(wen);
  const liang = Math.floor(abs / WEN_PER_LIANG);
  const rest = abs % WEN_PER_LIANG;
  if (liang === 0) return `${rest} 文`;
  if (rest === 0) return `${liang} 两银两`;
  return `${liang} 两 ${rest} 文`;
}

/* ---------------- 物品与负重 ---------------- */

/** 当前携带的件数（读不到按 0）。 */
export function itemCount(state: SliceState, id: string): number {
  return state.items[id] ?? 0;
}

/** 增减携带物：数量不为负，扣到 0 即删键，`items` 里只留正数。 */
function bumpItem(state: SliceState, id: string, delta: number): void {
  const next = Math.max(0, itemCount(state, id) + delta);
  if (next === 0) delete state.items[id];
  else state.items[id] = next;
}

/** 携带物的总重量（斤）。 */
export function carryWeight(state: SliceState): number {
  let sum = 0;
  for (const [id, count] of Object.entries(state.items)) {
    sum += itemWeight(id) * count;
  }
  return sum;
}

/**
 * 携带上限（斤）：只由引擎给，内容侧读不到、也写不了。
 * 世界观里这个值该由膂力派生（worldview-seed-v3「膂力：进攻伤害、负重、外功底子」），
 * 等先天天赋接进 SliceState 之后改这一处即可。
 */
export function carryCapacity(): number {
  return SLICE_TUNE.carryMax;
}

/** 单个效果条目带来的重量变化（不是物品条目就是 0）。 */
function itemWeightDelta(eff: IrEff, tune?: Record<string, number>): number {
  if (eff.target !== "item" || !eff.item) return 0;
  return itemWeight(eff.item) * amountValue(eff.delta, tune);
}

/** 一组块里物品重量的净增上界：分支结构取各分支最大者，不把互斥的分支相加。 */
function weightGainUpper(blocks: IrBlock[], tune?: Record<string, number>): number {
  let sum = 0;
  for (const b of blocks) {
    switch (b.k) {
      case "effect":
        for (const eff of b.effects) sum += itemWeightDelta(eff, tune);
        break;
      case "if": {
        const branches = b.branches.map((x) => weightGainUpper(x.body, tune));
        if (b.elseBody) branches.push(weightGainUpper(b.elseBody, tune));
        if (branches.length > 0) sum += Math.max(...branches);
        break;
      }
      case "band":
        sum += weightGainUpper(b.body, tune);
        break;
      default:
        break;
    }
  }
  return sum;
}

export interface CarryCheck {
  ok: boolean;
  /** 不满足时的原因（灰化示因与抛错共用） */
  reason?: string;
  /** 这个选项做完之后的负重与上限，供界面说明用 */
  projected: number;
  capacity: number;
}

/**
 * 负重硬门：这个选项做完之后会不会背不动。
 * 净增 = 效果给的物品重量 − 代价里消耗掉的物品重量（付货只会减重，不必拦）。
 */
export function checkCarry(choice: IrChoice, state: SliceState, tune?: Record<string, number>): CarryCheck {
  const capacity = carryCapacity();
  let delta = weightGainUpper(choice.blocks, tune);
  for (const it of choice.cost?.items ?? []) {
    delta -= itemWeight(it.名) * amountValue(it.量, tune);
  }
  const projected = carryWeight(state) + delta;
  return { ok: projected <= capacity, reason: projected <= capacity ? undefined : "背不动了", projected, capacity };
}

function amountValue(amount: IrAmount, tune: Record<string, number> = {}): number {
  if (amount.kind === "literal") return Number(amount.value);
  const v = tune[String(amount.value)];
  if (v === undefined) {
    throw new Error(`tune 表里没有 ${String(amount.value)}`);
  }
  return v;
}

export interface CostCheck {
  ok: boolean;
  reasons: string[];
}

/** 代价是否付得起（`time` 永不「不足」）。 */
export function checkCost(cost: IrCost | undefined, state: SliceState, tune?: Record<string, number>): CostCheck {
  if (!cost) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  if (cost.money) {
    const need = amountValue(cost.money, tune);
    if (state.money < need) reasons.push(`银钱不足（需 ${formatMoney(need)}）`);
  }
  if (cost.stamina && state.stamina.current < amountValue(cost.stamina, tune)) reasons.push("体力不支");
  if (cost.neili && state.neili.current < amountValue(cost.neili, tune)) reasons.push("内力不足");
  for (const it of cost.items ?? []) {
    if (itemCount(state, it.名) < amountValue(it.量, tune)) reasons.push(`${itemName(it.名)}不足`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** 付代价：资源走扣减，时间走时钟推进，物品走扣货（#16 的执行分流）。 */
export function payCost(cost: IrCost | undefined, state: SliceState, tune?: Record<string, number>): void {
  if (!cost) return;
  if (cost.money) state.money = Math.max(0, state.money - amountValue(cost.money, tune));
  if (cost.stamina) state.stamina.current = clamp(state.stamina.current - amountValue(cost.stamina, tune), 0, state.stamina.max);
  if (cost.neili) state.neili.current = clamp(state.neili.current - amountValue(cost.neili, tune), 0, state.neili.max);
  for (const it of cost.items ?? []) bumpItem(state, it.名, -amountValue(it.量, tune));
  if (cost.time) advance(state, keToMinutes(amountValue(cost.time, tune)));
}

/** 一刻 = 15 分钟：代价里的 time 以刻计，推进时钟时要换成分钟。 */
export const MINUTES_PER_KE = 15;

export function keToMinutes(ke: number): number {
  return Math.max(0, ke) * MINUTES_PER_KE;
}

export function advance(state: SliceState, minutes: number): void {
  state.clock.minute += minutes;
  while (state.clock.minute >= 1440) {
    state.clock.minute -= 1440;
    state.clock.day += 1;
  }
}

/** 应用效果条目。方向（增 / 减）在引擎这边定，UI 只管按 kind 上色。 */
export function applyEffect(eff: IrEff, state: SliceState, tune?: Record<string, number>): RecentLine | null {
  const delta = amountValue(eff.delta, tune);
  const tone: RecentLine["kind"] = delta >= 0 ? "gain" : "loss";
  const sign = delta >= 0 ? "+" : "";
  switch (eff.target) {
    case "money":
      state.money = Math.max(0, state.money + delta);
      return { text: `${delta >= 0 ? "获得了 " : "花掉了 "}${moneyAmount(delta)}`, kind: tone };
    case "stamina":
      state.stamina.current = clamp(state.stamina.current + delta, 0, state.stamina.max);
      return { text: `体力 ${sign}${delta}`, kind: tone };
    case "neili":
      state.neili.current = clamp(state.neili.current + delta, 0, state.neili.max);
      return { text: `内力 ${sign}${delta}`, kind: tone };
    case "hp":
      state.life.current = clamp(state.life.current + delta, 0, state.life.injuryCap);
      return { text: `生命 ${sign}${delta}`, kind: tone };
    case "item": {
      const id = eff.item ?? "";
      const before = itemCount(state, id);
      bumpItem(state, id, delta);
      const actual = itemCount(state, id) - before;
      // 数量夹到 0 之后可能一点没变（身上没有却要失去）：没有变化就没有可记的
      if (actual === 0) return null;
      const n = Math.abs(actual);
      return {
        text: `${actual > 0 ? "你获得了" : "你失去了"}${itemName(id)}${n > 1 ? ` ×${n}` : ""}`,
        kind: actual > 0 ? "gain" : "loss",
      };
    }
    case "log":
      return { text: String(eff.delta.value), kind: "note" };
    case "role":
    default:
      return null;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const GAIN_PREFIX = [/^获得了 /, /^你获得了/];
const LOSS_PREFIX = [/^花掉了 /, /^你失去了/];

/** 前缀接内容：数字开头（银钱）空一格，物件名直接连上（「失去了剑」「获得了 1 两银两」）。 */
function withPrefix(prefix: string, parts: string[]): string {
  const body = parts.join("、");
  return /^[0-9]/.test(body) ? `${prefix} ${body}` : `${prefix}${body}`;
}

/** 一次行动的得失并作一行：有得有失是「失去了剑，获得了 1 两银两、当票」，
 * 只有失是「花掉了 300 文、剑」，只有得是「获得了 300 文、剑」。
 * 单条获得/失去维持原话（物件是「你获得了剑」）；体力这类不带前后缀的行不参与合并。 */
function mergeRecent(lines: RecentLine[]): RecentLine[] {
  const gainParts: string[] = [];
  const lossParts: string[] = [];
  let lossHadMoney = false;
  for (const l of lines) {
    const gain = GAIN_PREFIX.find((re) => re.test(l.text));
    const loss = gain ? undefined : LOSS_PREFIX.find((re) => re.test(l.text));
    if (gain && l.kind === "gain") gainParts.push(l.text.replace(gain, ""));
    else if (loss && l.kind === "loss") {
      lossParts.push(l.text.replace(loss, ""));
      if (loss === LOSS_PREFIX[0]) lossHadMoney = true;
    }
  }
  if (gainParts.length === 0 && lossParts.length === 0) return lines;
  // 钱排最前，物件跟后
  const moneyFirst = (a: string, b: string): number => Number(/^[0-9]/.test(b)) - Number(/^[0-9]/.test(a));
  gainParts.sort(moneyFirst);
  lossParts.sort(moneyFirst);
  // 得失都有：并成一行，得失前缀都归并，这条行按原行序列里首次出现的位置落位
  if (gainParts.length > 0 && lossParts.length > 0) {
    const lossWord = lossHadMoney && lossParts.length === 1 ? "花掉了" : "失去了";
    const lossSeg = withPrefix(lossWord, lossParts);
    const gainSeg = withPrefix("获得了", gainParts);
    const combined: RecentLine = {
      text: `${lossSeg}，${gainSeg}`,
      kind: "note",
      parts: [
        { text: lossSeg, kind: "loss" },
        { text: "，", kind: "note" },
        { text: gainSeg, kind: "gain" },
      ],
    };
    const merged: RecentLine[] = [];
    let placed = false;
    for (const l of lines) {
      const isGainLoss =
        (GAIN_PREFIX.some((re) => re.test(l.text)) && l.kind === "gain") || (LOSS_PREFIX.some((re) => re.test(l.text)) && l.kind === "loss");
      if (!placed && isGainLoss) {
        merged.push(combined);
        placed = true;
        continue;
      }
      if (isGainLoss) continue;
      merged.push(l);
    }
    if (!placed) merged.push(combined);
    return merged;
  }
  // 同向多条才归并；单条维持原话
  const isGain = gainParts.length > 0;
  const parts = isGain ? gainParts : lossParts;
  if (parts.length === 1) return lines;
  const merged: RecentLine[] = [];
  const line: RecentLine = isGain
    ? { text: withPrefix("获得了", parts), kind: "gain" }
    : { text: withPrefix(lossHadMoney ? "花掉了" : "失去了", parts), kind: "loss" };
  const prefix = isGain ? GAIN_PREFIX : LOSS_PREFIX;
  const kind = isGain ? "gain" : "loss";
  let placed = false;
  for (const l of lines) {
    const hit = prefix.some((re) => re.test(l.text)) && l.kind === kind;
    if (!placed && hit) {
      merged.push(line);
      placed = true;
      continue;
    }
    if (hit) continue;
    merged.push(l);
  }
  if (!placed) merged.push(line);
  return merged;
}

/* ---------------- 渲染 ---------------- */

export interface TweeOption {
  id: string;
  label: string;
  summary?: string;
  blocked?: string;
  /** 耗时（刻，一刻 15 分钟）：选项名后缀 `（两刻）` 用 */
  ke?: number;
  /** 出行选项（前往别的地点），UI 与本地行动分组 */
  exit?: boolean;
  /** 后果提示短语（UI 加括号上色：good 绿 / bad 红；两者可同时有） */
  goodResultHint?: string;
  badResultHint?: string;
}

export interface TweeView {
  passageId: string;
  paragraphs: string[];
  options: TweeOption[];
  /** 本批到此为止：下一步是自由行动 */
  atFreeActions: boolean;
  recent: RecentLine[];
  /** 就地结算（stay）新追加的段落；UI 只在同一单元里把它接在正文后面 */
  appended?: string[];
  /** 「继续」按钮的文案（结果屏用 meta.返回 覆盖） */
  nextLabel?: string;
}

const CN_DIGIT = "零一二三四五六七八九";
function cnNum(n: number): string {
  if (n <= 10) return n === 10 ? "十" : CN_DIGIT[n];
  if (n < 20) return `十${CN_DIGIT[n % 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${CN_DIGIT[tens]}十${ones ? CN_DIGIT[ones] : ""}`;
}

/** 刻数转武侠口径的时长：一刻 / 两刻 / 半个时辰 / 一个时辰 / 一个半时辰 / 一个时辰零三刻。 */
export function formatKe(ke: number): string {
  const n = Math.max(1, Math.round(ke));
  const cn = (x: number): string => (x === 2 ? "两" : cnNum(x));
  if (n === 4) return "半个时辰";
  const whole = Math.floor(n / 8);
  const rest = n % 8;
  if (whole === 0) return `${cn(n)}刻`;
  if (rest === 0) return `${cn(whole)}个时辰`;
  if (rest === 4) return `${cn(whole)}个半时辰`;
  return `${cn(whole)}个时辰零${cn(rest)}刻`;
}

/** 分钟数转 `h:mm`：5 → 0:05，90 → 1:30。 */
export function formatMinutes(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** 代价摘要：`花 8 文，耗药包 1`；耗时另走选项名后的 `(0:30)`（TweeOption.minutes）。 */
export function costSummary(cost: IrCost | undefined, state: SliceState, tune?: Record<string, number>): string | undefined {
  if (!cost) return undefined;
  const parts: string[] = [];
  if (cost.money) parts.push(`花 ${formatMoney(amountValue(cost.money, tune))}`);
  if (cost.stamina) parts.push(`耗体力 ${amountValue(cost.stamina, tune)}`);
  if (cost.neili) parts.push(`耗内力 ${amountValue(cost.neili, tune)}`);
  for (const it of cost.items ?? []) parts.push(`耗${itemName(it.名)} ${amountValue(it.量, tune)}`);
  const blocked = checkCost(cost, state, tune);
  return parts.length === 0 ? undefined : parts.join("，") + (blocked.ok ? "" : `，${blocked.reasons.join("、")}`);
}

function renderChunks(chunks: IrChunk[], state: SliceState): string {
  return chunks
    .map((c) => {
      if (typeof c === "string") return c;
      const v = evalExpr(c.expr, state);
      return v === null ? "" : String(v);
    })
    .join("");
}

function renderBlocks(blocks: IrBlock[], state: SliceState, out: string[]): void {
  for (const block of blocks) {
    switch (block.k) {
      case "text": {
        // 一个正文块里按空行分段：AI/人写的段落就是一自然段一句，标记不必手写
        const text = renderChunks(block.chunks, state);
        for (const para of text.split(/\n{2,}/)) {
          const trimmed = para.trim();
          if (trimmed !== "") out.push(trimmed);
        }
        break;
      }
      case "if": {
        const branch = block.branches.find((b) => truthy(evalExpr(b.cond, state)));
        const body = branch?.body ?? block.elseBody;
        if (body) renderBlocks(body, state, out);
        break;
      }
      case "band":
        // 检定档带要等检定那批接；本批内容不用
        break;
      case "effect":
        // 效果在选中时才结算，渲染期不写状态（#16：任意 passage 重渲染不改变结果）
        break;
    }
  }
}

/** 一个选项为什么不能选：条件不满足 / 付不起 / 背不动。都能选就是 undefined。 */
function blockedReason(choice: IrChoice, state: SliceState): string | undefined {
  if (choice.when && !truthy(evalExpr(choice.when, state))) return "条件不满足";
  const cost = checkCost(choice.cost, state);
  if (!cost.ok) return cost.reasons.join("、");
  return checkCarry(choice, state).reason;
}

/** 把 passage 渲染成视图；只读，不写状态。 */
export function renderPassage(passage: IrPassage, state: SliceState, program: TweeProgram): TweeView {
  const paragraphs: string[] = [...(state.pendingText ?? [])];
  renderBlocks(passage.blocks, state, paragraphs);
  const options: TweeOption[] = passage.choices
    .filter((c) => c.show === undefined || truthy(evalExpr(c.show, state)))
    .map((c) => {
      // 耗时只在字面量时上视图；符号量要查 tune 表，渲染期不该为它抛错
      const time = c.cost?.time;
      return {
        id: c.id,
        label: c.label,
        summary: costSummary(c.cost, state),
        blocked: blockedReason(c, state),
        ke: time?.kind === "literal" ? Number(time.value) : undefined,
        exit: c.exit,
        goodResultHint: c.goodResultHint,
        badResultHint: c.badResultHint,
      };
    });
  return {
    passageId: passage.id,
    paragraphs,
    options,
    atFreeActions: passage.choices.length === 0 && passage.next === undefined,
    recent: state.recent,
    nextLabel: passage.meta.返回,
  };
}

/* ---------------- 导航 ---------------- */

export function passageById(program: TweeProgram, id: string): IrPassage | null {
  const i = program.index[id];
  if (i === undefined) {
    throw new Error(`没有这个单元：${id}`);
  }
  return program.passages[i] ?? null;
}

/** 进入一个单元：记访问、按头部元数据更新地点、清行止记录、判定是否已到自由行动。 */
export function enterPassage(
  program: TweeProgram,
  state: SliceState,
  id: string,
  recent: RecentLine[] = [],
  choiceText: string[] = [],
): TweeView {
  const passage = passageById(program, id);
  if (!passage) throw new Error(`没有这个单元：${id}`);
  state.visited[id] = true;
  if (passage.meta.地点) state.location = passage.meta.地点;
  if (passage.tags.includes("random")) {
    const picked = weightedPick(state.random, passage.outcomes, (outcome) => outcome.weight);
    if (picked.index < 0) throw new Error(`随机调度单元 ${id} 没有可选 outcome`);
    state.random = picked.rng;
    return enterPassage(program, state, passage.outcomes[picked.index]!.next, recent, choiceText);
  }
  state.recent = recent;
  // 选项正文与目标单元正文连排：玩家先看到自己干的那件事，再看到落到的场景
  state.pendingText = choiceText;
  state.atFreeActions = passage.choices.length === 0 && passage.next === undefined;
  return renderPassage(passage, state, program);
}

/** 自动前进：只有 next、没有选项的段落用。返回 null 表示已经到底。 */
export function followNext(program: TweeProgram, state: SliceState, passage: IrPassage): TweeView | null {
  if (passage.next === undefined) return null;
  state.pendingText = [];
  return enterPassage(program, state, passage.next);
}

/** 选中一个选项：付代价 → 应用效果 → 前进。 */
export function chooseOption(program: TweeProgram, state: SliceState, passageId: string, choiceId: string): TweeView {
  const passage = passageById(program, passageId);
  if (!passage) throw new Error(`没有这个单元：${passageId}`);
  const choice = passage.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`单元 ${passageId} 里没有选项 ${choiceId}`);
  if (choice.show !== undefined && !truthy(evalExpr(choice.show, state))) {
    throw new Error(`选项 ${choiceId} 现在不出现`);
  }
  const blocked = checkCost(choice.cost, state);
  if (!blocked.ok) throw new Error(`选项 ${choiceId} 付不起：${blocked.reasons.join("、")}`);
  const carry = checkCarry(choice, state);
  if (!carry.ok) throw new Error(`选项 ${choiceId} ${carry.reason ?? "背不动了"}：会到 ${carry.projected} / ${carry.capacity} 斤`);
  payCost(choice.cost, state);
  const lines: RecentLine[] = [];
  const choiceParas: string[] = [];
  renderBlocks(choice.blocks, state, choiceParas);
  for (const block of choice.blocks) {
    if (block.k === "effect") {
      for (const eff of block.effects) {
        const line = applyEffect(eff, state);
        if (line) lines.push(line);
      }
    }
  }
  state.recent = mergeRecent(lines);
  if (choice.mark) state.visited[choice.mark] = true;
  // 就地结算：不换单元，结算文作为追加段落交回视图（观察、查看这类）
  if (choice.stay) {
    const stayView = renderPassage(passage, state, program);
    stayView.appended = choiceParas;
    return stayView;
  }
  // 选项没写 next 时，落到所在单元的 <<next>>（「做完这件事就往下走」的常见形态）
  const nextId = choice.next ?? passage.next;
  if (nextId === undefined) {
    state.pendingText = choiceParas;
    state.atFreeActions = true;
    return renderPassage(passage, state, program);
  }
  return enterPassage(program, state, nextId, mergeRecent(lines), choiceParas);
}

/* ---------------- 构建期校验门（IR 之外） ---------------- */

/**
 * 把编译诊断分成两路：error 阻断，warning 提示。
 * 编译期已经查过引用与写法，这里只做运行时才会暴露的检查。
 */
export function splitDiagnostics(diags: Diagnostic[]): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  return {
    errors: diags.filter((d) => d.level === "error"),
    warnings: diags.filter((d) => d.level === "warning"),
  };
}

export { BUILTIN_FIELDS };
