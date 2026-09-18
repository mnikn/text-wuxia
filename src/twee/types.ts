/**
 * Twee 书写面 → 中间表示（IR）的类型定义。
 * 对应票据：#16（书写面与编译器契约）、#20（首批最短路径）、#22（涌现模板，本批只读形态不发射）。
 * IR 只描述内容说了什么，不含任何引擎实现——运行时按 IR 解释。
 */

export interface SourcePos {
  line: number;
}

/** 受限表达式：只读、禁算术、禁三目、禁自由 JS（#16 / #19） */
export type Expr =
  | { k: "num"; value: number; pos: SourcePos }
  | { k: "str"; value: string; pos: SourcePos }
  | { k: "bool"; value: boolean; pos: SourcePos }
  | { k: "dotted"; path: string[]; pos: SourcePos }
  | { k: "call"; name: string; arg: Expr; pos: SourcePos }
  | { k: "not"; expr: Expr; pos: SourcePos }
  | { k: "and" | "or"; xs: Expr[]; pos: SourcePos }
  | { k: "op"; left: Expr; op: "==" | "!=" | "<" | "<=" | ">" | ">="; right: Expr; pos: SourcePos };

/** 效果条目：`<目标> <量>`，量只能是字面量或 tune 键（裸算术一律 error） */
export interface IrAmount {
  kind: "literal" | "tune";
  value: number | string;
  pos: SourcePos;
}

export interface IrEff {
  /** 目标：内建字段名，或 `item`（此时物品名在 item 字段里） */
  target: string;
  /** `target === "item"` 时的物品名（已过物品登记表校验） */
  item?: string;
  delta: IrAmount;
  pos: SourcePos;
}

/** 代价里消耗的物品：`cost="time 5, item(药包) 1"` 的 `item(药包) 1` */
export interface IrCostItem {
  名: string;
  量: IrAmount;
  pos: SourcePos;
}

/** 代价条目：效果条目的可支付子集 + time 保留字。
 * `time` 的单位是「刻」（一刻 15 分钟）：`time 1` 表示一刻，运行时按 15 分钟推进时钟。 */
export interface IrCost {
  time?: IrAmount;
  money?: IrAmount;
  stamina?: IrAmount;
  neili?: IrAmount;
  /** 代价里消耗的物品；与资源不同，这里可以有多个条目 */
  items?: IrCostItem[];
  pos: SourcePos;
}

export interface IrCheck {
  name: string;
  difficulty: number;
  pos: SourcePos;
}

/** 正文片段：纯文本或插值 */
export type IrChunk = string | { k: "interp"; expr: Expr };

export type IrBlock =
  | { k: "text"; chunks: IrChunk[] }
  | { k: "if"; branches: { cond: Expr; body: IrBlock[] }[]; elseBody: IrBlock[] | null }
  | { k: "band"; band: string; body: IrBlock[] }
  | { k: "effect"; effects: IrEff[] };

export interface IrChoice {
  id: string;
  label: string;
  when?: Expr;
  cost?: IrCost;
  check?: IrCheck;
  blocks: IrBlock[];
  next?: string;
  /** 就地结算：结算完不换单元，结算文追加在当前正文之后（观察、查看这类） */
  stay?: boolean;
  /** 满足才渲染这个选项（不满足时不出现，与 if= 的「灰化示因」是两回事） */
  show?: Expr;
  /** 选中后记下的名字，配 `seen("名字")` 用（就地结算的观察靠它做前后变化） */
  mark?: string;
  /** 出行：这个选项是「前往另一个地点」，UI 与本地行动分组显示 */
  exit?: boolean;
  /** 后果提示短语（UI 加括号上色）：good 绿 / bad 红；两者可同时有 */
  goodResultHint?: string;
  badResultHint?: string;
  pos: SourcePos;
}

/** `[random]` 调度单元的一条加权出口。 */
export interface IrOutcome {
  weight: number;
  next: string;
  pos: SourcePos;
}

/** passage 头部 `{JSON}`：只放纯字面量调度元数据（#16） */
export interface IrMeta {
  weight?: number;
  cooldown?: number;
  priority?: number;
  once?: boolean;
  entry?: boolean;
  /** 进入本单元后玩家所在地点（内容侧声明的字面量） */
  地点?: string;
  /** `[result]` 结果屏的返回按钮文案；不写就是「继续」 */
  返回?: string;
}

export interface IrPassage {
  id: string;
  tags: string[];
  meta: IrMeta;
  blocks: IrBlock[];
  choices: IrChoice[];
  outcomes: IrOutcome[];
  next?: string;
  pos: SourcePos;
}

export interface Diagnostic extends SourcePos {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface TweeProgram {
  passages: IrPassage[];
  /** passage id → 下标 */
  index: Record<string, number>;
  diagnostics: Diagnostic[];
}
