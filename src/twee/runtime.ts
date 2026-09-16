/**
 * 最小运行时：把编译出的 IR 跑起来（#20 最短路径）。
 *
 * 范围只有本批需要的东西：渲染 passage、评估受限表达式、扣代价、应用效果、按 <<next>> 前进。
 * 不含：涌现模板、检定档带、战斗、存档。这些等后续增量接。
 */
import type { Diagnostic, Expr, IrAmount, IrBlock, IrChunk, IrCost, IrEff, IrPassage, TweeProgram } from "./types";

/* ---------------- 状态 ---------------- */

/** 行止记录的一条：文本 + 方向，方向由引擎判定（增 / 减 / 只是记一笔） */
export interface RecentLine {
  text: string;
  kind: "gain" | "loss" | "note";
}

/** 本批的身体与日常状态：体力 / 三层生命 / 双层内力 + 时间地点银钱（#24 定稿） */
export interface SliceState {
  clock: { day: number; minute: number };
  location: string;
  money: number;
  stamina: { current: number; max: number };
  life: { current: number; injuryCap: number; max: number };
  neili: { current: number; max: number };
  /** 已到过的单元 */
  visited: Record<string, true>;
  /** 跑到没有选项也没有 next 的单元：本批到此为止（后续接自由行动） */
  atFreeActions: boolean;
  /** 上一个选项的正文（选中后与目标单元的正文连排） */
  pendingText?: string[];
  /** 最近一次推进产生的行止记录（UI 用；跟在正文后面显示） */
  recent: RecentLine[];
}

export const SLICE_TUNE = {
  staminaMax: 100,
  lifeMax: 100,
  neiliMax: 40,
  /** 开场身上没钱：家里只剩父亲那把剑能换钱（#20 开场改版） */
  money: 0,
  day: 1,
  minute: 8 * 60,
  home: "城郊家村",
  startPassage: "地点.家门外",
};

export function createSliceState(): SliceState {
  return {
    clock: { day: SLICE_TUNE.day, minute: SLICE_TUNE.minute },
    location: SLICE_TUNE.home,
    money: SLICE_TUNE.money,
    stamina: { current: SLICE_TUNE.staminaMax, max: SLICE_TUNE.staminaMax },
    life: { current: SLICE_TUNE.lifeMax, injuryCap: SLICE_TUNE.lifeMax, max: SLICE_TUNE.lifeMax },
    neili: { current: SLICE_TUNE.neiliMax, max: SLICE_TUNE.neiliMax },
    visited: {},
    atFreeActions: false,
    recent: [],
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
      // 目前只接 seen()：读的就是 visited 表（进过的单元、选过的 mark 都在里头）
      if (expr.name === "seen") {
        const arg = evalExpr(expr.arg, state);
        return typeof arg === "string" && state.visited[arg] === true;
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
  if (cost.money && state.money < amountValue(cost.money, tune)) reasons.push("银钱不足");
  if (cost.stamina && state.stamina.current < amountValue(cost.stamina, tune)) reasons.push("体力不支");
  if (cost.neili && state.neili.current < amountValue(cost.neili, tune)) reasons.push("内力不足");
  return { ok: reasons.length === 0, reasons };
}

/** 付代价：资源走扣减，时间走时钟推进（#16 的执行分流）。 */
export function payCost(cost: IrCost | undefined, state: SliceState, tune?: Record<string, number>): void {
  if (!cost) return;
  if (cost.money) state.money = Math.max(0, state.money - amountValue(cost.money, tune));
  if (cost.stamina) state.stamina.current = clamp(state.stamina.current - amountValue(cost.stamina, tune), 0, state.stamina.max);
  if (cost.neili) state.neili.current = clamp(state.neili.current - amountValue(cost.neili, tune), 0, state.neili.max);
  if (cost.time) advance(state, amountValue(cost.time, tune));
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
      return { text: `银钱 ${sign}${formatMoney(delta)}`, kind: tone };
    case "stamina":
      state.stamina.current = clamp(state.stamina.current + delta, 0, state.stamina.max);
      return { text: `体力 ${sign}${delta}`, kind: tone };
    case "neili":
      state.neili.current = clamp(state.neili.current + delta, 0, state.neili.max);
      return { text: `内力 ${sign}${delta}`, kind: tone };
    case "hp":
      state.life.current = clamp(state.life.current + delta, 0, state.life.injuryCap);
      return { text: `生命 ${sign}${delta}`, kind: tone };
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

/* ---------------- 渲染 ---------------- */

export interface TweeOption {
  id: string;
  label: string;
  summary?: string;
  blocked?: string;
  /** 出行选项（前往别的地点），UI 与本地行动分组 */
  exit?: boolean;
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

/** 代价摘要：`耗时 30 分钟，花 8 文`。 */
export function costSummary(cost: IrCost | undefined, state: SliceState, tune?: Record<string, number>): string | undefined {
  if (!cost) return undefined;
  const parts: string[] = [];
  if (cost.time) parts.push(`耗时 ${amountValue(cost.time, tune)} 分钟`);
  if (cost.money) parts.push(`花 ${formatMoney(amountValue(cost.money, tune))}`);
  if (cost.stamina) parts.push(`耗体力 ${amountValue(cost.stamina, tune)}`);
  if (cost.neili) parts.push(`耗内力 ${amountValue(cost.neili, tune)}`);
  const blocked = checkCost(cost, state, tune);
  return parts.length === 0 ? undefined : parts.join("，") + (blocked.ok ? "" : `（${blocked.reasons.join("、")}）`);
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

/** 把 passage 渲染成视图；只读，不写状态。 */
export function renderPassage(passage: IrPassage, state: SliceState, program: TweeProgram): TweeView {
  const paragraphs: string[] = [...(state.pendingText ?? [])];
  renderBlocks(passage.blocks, state, paragraphs);
  const options: TweeOption[] = passage.choices
    .filter((c) => c.show === undefined || truthy(evalExpr(c.show, state)))
    .map((c) => {
      const blocked = c.when && !truthy(evalExpr(c.when, state)) ? "条件不满足" : checkCost(c.cost, state).ok ? undefined : checkCost(c.cost, state).reasons.join("、");
      return { id: c.id, label: c.label, summary: costSummary(c.cost, state), blocked, exit: c.exit };
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
  state.recent = lines;
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
  return enterPassage(program, state, nextId, lines, choiceParas);
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
