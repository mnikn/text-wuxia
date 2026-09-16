/**
 * 最小运行时：把编译出的 IR 跑起来（#20 最短路径）。
 *
 * 范围只有本批需要的东西：渲染 passage、评估受限表达式、扣代价、应用效果、按 <<next>> 前进。
 * 不含：涌现模板、检定档带、战斗、存档。这些等后续增量接。
 */
import type { Diagnostic, Expr, IrAmount, IrBlock, IrChunk, IrCost, IrEff, IrPassage, TweeProgram } from "./types";

/* ---------------- 状态 ---------------- */

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
  /** 最近一次推进产生的行止记录（UI 用） */
  recent: string[];
}

export const SLICE_TUNE = {
  staminaMax: 100,
  lifeMax: 100,
  neiliMax: 40,
  /** 开场身上没钱：家里只剩父亲那把刀能换钱（#20 开场改版） */
  money: 0,
  day: 1,
  minute: 8 * 60,
  home: "城郊家村",
  startPassage: "开场.家门外",
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
    case "call":
      // 具名谓词（at/rel/cap…）要等词表那批接；本批内容不用
      return null;
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

/** 应用效果条目。 */
export function applyEffect(eff: IrEff, state: SliceState, tune?: Record<string, number>): string | null {
  const delta = amountValue(eff.delta, tune);
  switch (eff.target) {
    case "money":
      state.money = Math.max(0, state.money + delta);
      return `银钱 ${delta >= 0 ? "+" : ""}${delta} 文`;
    case "stamina":
      state.stamina.current = clamp(state.stamina.current + delta, 0, state.stamina.max);
      return `体力 ${delta >= 0 ? "+" : ""}${delta}`;
    case "neili":
      state.neili.current = clamp(state.neili.current + delta, 0, state.neili.max);
      return `内力 ${delta >= 0 ? "+" : ""}${delta}`;
    case "hp":
      state.life.current = clamp(state.life.current + delta, 0, state.life.injuryCap);
      return `生命 ${delta >= 0 ? "+" : ""}${delta}`;
    case "log":
      return String(eff.delta.value);
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
}

export interface TweeView {
  passageId: string;
  paragraphs: string[];
  options: TweeOption[];
  /** 本批到此为止：下一步是自由行动 */
  atFreeActions: boolean;
  recent: string[];
}

/** 代价摘要：`耗时 30 分钟，花 8 文`。 */
export function costSummary(cost: IrCost | undefined, state: SliceState, tune?: Record<string, number>): string | undefined {
  if (!cost) return undefined;
  const parts: string[] = [];
  if (cost.time) parts.push(`耗时 ${amountValue(cost.time, tune)} 分钟`);
  if (cost.money) parts.push(`花 ${amountValue(cost.money, tune)} 文`);
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
  const options: TweeOption[] = passage.choices.map((c) => {
    const blocked = c.when && !truthy(evalExpr(c.when, state)) ? "条件不满足" : checkCost(c.cost, state).ok ? undefined : checkCost(c.cost, state).reasons.join("、");
    return { id: c.id, label: c.label, summary: costSummary(c.cost, state), blocked };
  });
  return {
    passageId: passage.id,
    paragraphs,
    options,
    atFreeActions: passage.choices.length === 0 && passage.next === undefined,
    recent: state.recent,
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
  recent: string[] = [],
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
  const blocked = checkCost(choice.cost, state);
  if (!blocked.ok) throw new Error(`选项 ${choiceId} 付不起：${blocked.reasons.join("、")}`);
  payCost(choice.cost, state);
  const lines: string[] = [];
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
