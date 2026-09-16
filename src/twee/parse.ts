/**
 * Twee 源 → IR 的解析（对应 #16 的书写面契约、#22 的 template 形态）。
 *
 * 已实现的语法子集（按 #20 的最短路径需要）：
 *   :: 单元 id [标签] [{JSON 纯字面量调度元数据}]
 *   正文段落（可含 <<= 表达式 >> 插值）
 *   <<choice id="…" label="…" if="表达式" cost="time 30, money 8" check="拳脚 45">…<</choice>>
 *   <<if 表达式>>…<<else>>…<</if>>
 *   <<band 大成功>>…<</band>>
 *   <<eff money +6, stamina -10>>          （叶子宏，不进正文）
 *   <<next 单元 id>>
 *
 * 未实现、遇到即报错并说明：<<bind>> / <<do>> / <<const>> / <<tune>> / 自由 JS。
 */
import { parseExpr } from "./expr";
import type {
  Diagnostic,
  IrAmount,
  IrBlock,
  IrCheck,
  IrChoice,
  IrChunk,
  IrCost,
  IrEff,
  IrMeta,
  IrPassage,
  TweeProgram,
} from "./types";

const SELF_CLOSING = new Set(["eff", "next"]);
const KNOWN_BLOCK = new Set(["choice", "if", "band"]);
const UNSUPPORTED = new Set(["bind", "do", "const", "tune", "set", "widget"]);

interface Ctx {
  diags: Diagnostic[];
  /** 后续校验用：passage id → 出现位置 */
  seen: Map<string, number>;
}

function error(ctx: Ctx, line: number, code: string, message: string): void {
  ctx.diags.push({ level: "error", code, message, line });
}
function warn(ctx: Ctx, line: number, code: string, message: string): void {
  ctx.diags.push({ level: "warning", code, message, line });
}

/** 扫描一行里出现的宏：返回每个 `<<…>>` 的起止与内容。未闭合则记一条诊断。 */
interface MacroHit {
  start: number;
  end: number;
  /** `<<` 之后、`>>` 之前的原文，已 trim */
  body: string;
  /** 结束标签（以 / 开头） */
  closing: boolean;
  line: number;
}

function scanMacros(ctx: Ctx, line: string, lineNo: number): MacroHit[] {
  const hits: MacroHit[] = [];
  let i = 0;
  while (i < line.length) {
    const open = line.indexOf("<<", i);
    if (open < 0) break;
    const close = line.indexOf(">>", open + 2);
    if (close < 0) {
      error(ctx, lineNo, "macro-unclosed", `第 ${lineNo} 行的宏没有闭合的 \`>>\`：${line.slice(open, open + 20)}…`);
      break;
    }
    const body = line.slice(open + 2, close).trim();
    hits.push({ start: open, end: close + 2, body, closing: body.startsWith("/"), line: lineNo });
    i = close + 2;
  }
  return hits;
}

/** 正文文本 → 片段序列：纯文本 + `<<= 表达式 >>` 插值。 */
function toChunks(ctx: Ctx, text: string, lineNo: number): IrChunk[] {
  return chunksFromSpans(ctx, text, lineNo);
}

/** 把一个文本块按插值切成片段；用同一份扫描分别处理整行与行内片段。 */
function chunksFromSpans(ctx: Ctx, text: string, lineNo: number): IrChunk[] {
  const chunks: IrChunk[] = [];
  let rest = text;
  let line = lineNo;
  while (rest.length > 0) {
    const open = rest.indexOf("<<");
    if (open < 0) {
      chunks.push(rest);
      break;
    }
    if (open > 0) chunks.push(rest.slice(0, open));
    const close = rest.indexOf(">>", open + 2);
    if (close < 0) {
      error(ctx, line, "macro-unclosed", "插值宏没有闭合的 `>>`");
      break;
    }
    const body = rest.slice(open + 2, close).trim();
    const newlines = countNewlines(rest.slice(0, close));
    if (body.startsWith("=")) {
      const { expr, diagnostics } = parseExpr(body.slice(1).trim(), line);
      ctx.diags.push(...diagnostics);
      if (expr) chunks.push({ k: "interp", expr });
    } else {
      error(ctx, line, "macro-unknown", `正文里只允许插值宏 \`<<= … >>\`，读到 \`<<${body}>>\`；块与叶子宏要独占一行`);
    }
    line += newlines;
    rest = rest.slice(close + 2);
  }
  // 合并相邻纯文本
  const merged: IrChunk[] = [];
  for (const c of chunks) {
    const last = merged[merged.length - 1];
    if (typeof c === "string" && typeof last === "string") merged[merged.length - 1] = last + c;
    else merged.push(c);
  }
  // 丢掉首尾空白片段
  return merged.filter((c) => typeof c !== "string" || c.trim().length > 0).map((c) => (typeof c === "string" ? c.replace(/\s+$/, "") : c));
}

function countNewlines(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === "\n") n++;
  return n;
}

/** 解析 `键="值"` 形式的属性串，并做「有没有多余内容」的报错。 */
function parseAttrs(ctx: Ctx, body: string, line: number): { name: string; attrs: Record<string, string> } {
  const m = /^([A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff-]*)([\s\S]*)$/.exec(body);
  if (!m) {
    error(ctx, line, "macro-name", `宏名无法识别：${body}`);
    return { name: "", attrs: {} };
  }
  const name = m[1]!;
  const rest = m[2] ?? "";
  const { attrs, leftovers } = scanAttrs(rest);
  for (const leftover of leftovers) {
    error(ctx, line, "macro-attr", `宏 ${name} 的参数里有多余内容：${leftover}`);
  }
  return { name, attrs };
}

/** 只解析 `键="值"` 对，多余片段原样留在 leftovers 里（`<<next 单元 id>>` 这类无引号参数不算错误）。 */
function scanAttrs(rest: string): { attrs: Record<string, string>; leftovers: string[] } {
  const attrs: Record<string, string> = {};
  const leftovers: string[] = [];
  const re = /([A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff-]*)\s*=\s*"([^"]*)"/g;
  let last = 0;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(rest)) !== null) {
    const gap = rest.slice(last, hit.index).trim();
    if (gap !== "") leftovers.push(gap);
    attrs[hit[1]!] = hit[2]!;
    last = hit.index + hit[0].length;
  }
  const tail = rest.slice(last).trim();
  if (tail !== "") leftovers.push(tail);
  return { attrs, leftovers };
}

/* ---------------- 效果与代价 ---------------- */

/** 效果条目目标白名单（#19 词表的子集；随内容增量扩） */
const EFF_TARGETS = new Set(["money", "stamina", "neili", "hp", "role", "log"]);
/** 代价条目的可支付子集；`time` 是保留字（走时间推进，不进效果表） */
const COST_KEYS = new Set(["time", "money", "stamina", "neili"]);
const IDENT_RE = /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff-]*$/;
/** 单元 id：允许点分（`开场.家门外`），命名约定见 #16 与票据 009 */
const PASSAGE_ID_RE = /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff.-]*$/;

function parseAmount(ctx: Ctx, raw: string, line: number, who: string): IrAmount | null {
  const text = raw.trim();
  const tune = /^tune\.([\w\u4e00-\u9fff.]+)$/.exec(text);
  if (tune) return { kind: "tune", value: tune[1]!, pos: { line } };
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return { kind: "literal", value: Number(text), pos: { line } };
  error(ctx, line, "amount-form", `${who} 的量只能是字面量或 \`tune.\` 键，读到「${text}」；效果条目禁裸算术`);
  return null;
}

function parseEffects(ctx: Ctx, body: string, line: number): IrEff[] {
  const out: IrEff[] = [];
  for (const raw of body.split(",")) {
    const entry = raw.trim();
    if (entry === "") continue;
    const m = /^([A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff-]*)\s+(\S+)$/.exec(entry);
    if (!m || !AMOUNT_TOKEN_RE.test(m[2]!)) {
      error(ctx, line, "amount-form", `效果条目要写成「<目标> <量>」，量只能是字面量或 \`tune.\` 键；读到「${entry}」`);
      continue;
    }
    const target = m[1]!;
    const delta = parseAmount(ctx, m[2]!, line, `效果条目 ${entry}`);
    if (!delta) continue;
    if (isZero(delta)) {
      warn(ctx, line, "eff-zero", `效果条目 \`${entry}\` 的量为 0，没有作用`);
    }
    if (!EFF_TARGETS.has(target)) {
      error(ctx, line, "eff-target", `效果目标「${target}」不在词表里；当前登记：${[...EFF_TARGETS].join(" / ")}`);
      continue;
    }
    out.push({ target, delta, pos: { line } });
  }
  return out;
}

/** 量只吃「带符号的数字」或 `tune.` 键：写成 `money*2` 这种算术时走 amount-form 报错。 */
const AMOUNT_TOKEN_RE = /^([+-]?\d+(?:\.\d+)?|tune\.[\w\u4e00-\u9fff.]+)$/;

function isZero(a: IrAmount): boolean {
  return a.kind === "literal" && Number(a.value) === 0;
}

function parseCost(ctx: Ctx, raw: string, line: number): IrCost | undefined {
  const cost: IrCost = { pos: { line } };
  let any = false;
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (entry === "") continue;
    const m = /^([A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff-]*)\s+(\S+)$/.exec(entry);
    if (!m) {
      error(ctx, line, "cost-form", `代价条目要写成「<键> <量>」，读到「${entry}」`);
      continue;
    }
    const key = m[1]!;
    if (!COST_KEYS.has(key)) {
      error(ctx, line, "cost-key", `代价键「${key}」不在可支付子集里；当前登记：${[...COST_KEYS].join(" / ")}`);
      continue;
    }
    const delta = parseAmount(ctx, m[2]!, line, `代价项 ${entry}`);
    if (!delta) continue;
    cost[key as "time" | "money" | "stamina" | "neili"] = delta;
    any = true;
  }
  return any ? cost : undefined;
}

function parseCheck(ctx: Ctx, raw: string, line: number): IrCheck | undefined {
  const m = /^(\S+)\s+(\d+)$/.exec(raw.trim());
  if (!m) {
    error(ctx, line, "check-form", `检定要写成 \`check="能力 难度"\`，读到「${raw}」`);
    return undefined;
  }
  const name = m[1]!;
  if (!IDENT_RE.test(name)) {
    error(ctx, line, "check-name", `检定名的写法不对：${name}`);
    return undefined;
  }
  return { name, difficulty: Number(m[2]!), pos: { line } };
}

/* ---------------- passage 正文解析 ---------------- */

interface BodyLine {
  text: string;
  line: number;
}

interface BodyOut {
  blocks: IrBlock[];
  choices: IrChoice[];
  next?: string;
}

/** 按行消费 passage 正文，产出块序列；选择宏走 choices 通道。 */
function parseBody(
  ctx: Ctx,
  lines: BodyLine[],
  out: BodyOut,
  openChoice: IrChoice | null,
  closeTag: string | null,
): void {
  let i = 0;
  let pendingText: string[] = [];
  let pendingLine = 0;

  const flushText = () => {
    if (pendingText.length === 0) return;
    const text = pendingText.join("\n");
    const chunks = toChunks(ctx, text, pendingLine);
    if (chunks.length > 0) out.blocks.push({ k: "text", chunks });
    pendingText = [];
  };

  const container = () => (openChoice ? openChoice.blocks : out.blocks);
  /** 跳到配对的结束标签之后；返回下标，找不到（已记诊断）返回 lines.length。 */
  const skipToClose = (from: number, tag: string): number => {
    for (let j = from; j < lines.length; j++) {
      if (lines[j]!.text.trim() === `<</${tag}>>`) return j + 1;
    }
    error(ctx, lines[lines.length - 1]?.line ?? 0, "macro-unclosed", `<<${tag}>> 没有对应的 <</${tag}>>`);
    return lines.length;
  };

  while (i < lines.length) {
    const cur = lines[i]!;
    const trimmed = cur.text.trim();

    if (!trimmed.startsWith("<<")) {
      if (pendingText.length === 0) pendingLine = cur.line;
      pendingText.push(cur.text);
      i++;
      continue;
    }

    const hits = scanMacros(ctx, cur.text, cur.line);
    if (hits.length === 0) {
      // 宏没闭合之类的问题已经在 scanMacros 里记过诊断，这行直接跳过
      i++;
      continue;
    }
    // 一行的宏必须独占整行
    const first = hits[0]!;
    if (first.start !== 0 || cur.text.slice(first.end).trim() !== "") {
      error(ctx, cur.line, "macro-inline", `宏要独占一行，不能和文字混排（第 ${cur.line} 行）`);
      i++;
      continue;
    }
    const macro = first.body.replace(/^\//, "");
    const nameMatch = /^([A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff-]*)/.exec(macro);
    const name = nameMatch?.[1] ?? "";
    // 带引号参数的宏走属性解析；<<next 单元 id>> 这类无引号参数自己取
    const needsAttrs = name === "choice";
    const { attrs, leftovers } = needsAttrs ? scanAttrs(macro.slice(name.length)) : { attrs: {}, leftovers: [] as string[] };
    if (needsAttrs) {
      for (const leftover of leftovers) {
        error(ctx, cur.line, "macro-attr", `宏 ${name} 的参数里有多余内容：${leftover}`);
      }
    }

    if (first.closing) {
      if (name !== closeTag) {
        error(ctx, cur.line, "macro-close", `读到 <</${name}>>，但当前打开的块是 ${closeTag ? `<<${closeTag}>>` : "无"}`);
        i++;
        continue;
      }
      flushText();
      return;
    }

    if (UNSUPPORTED.has(name)) {
      error(ctx, cur.line, "macro-unsupported", `宏 <<${name}>> 尚未在编译器最小内核里实现（#20 只做最短路径需要的子集）`);
      i++;
      continue;
    }

    if (SELF_CLOSING.has(name)) {
      flushText();
      const rawArgs = macro.slice(name.length).trim();
      if (name === "eff") {
        const effects = parseEffects(ctx, rawArgs, cur.line);
        if (effects.length > 0) container().push({ k: "effect", effects });
      } else {
        const target = rawArgs;
        if (!PASSAGE_ID_RE.test(target)) {
          error(ctx, cur.line, "next-form", `<<next>> 要写一个单元 id，读到「${target}」`);
        } else if (openChoice) {
          openChoice.next = target;
        } else if (out.next) {
          error(ctx, cur.line, "next-dup", `单元已经有 <<next>> 了`);
        } else {
          out.next = target;
        }
      }
      i++;
      continue;
    }

    if (name === "choice") {
      flushText();
      const id = attrs["id"];
      const label = attrs["label"];
      if (!id) error(ctx, cur.line, "choice-id", "<<choice>> 缺少 id");
      if (!label) error(ctx, cur.line, "choice-label", "<<choice>> 缺少 label");
      const unknown = Object.keys(attrs).filter((k) => !["id", "label", "if", "cost", "check"].includes(k));
      if (unknown.length > 0) {
        error(ctx, cur.line, "choice-attr", `<<choice>> 不认识的参数：${unknown.join(" / ")}`);
      }
      const choice: IrChoice = {
        id: id ?? `未命名-${cur.line}`,
        label: label ?? "",
        blocks: [],
        pos: { line: cur.line },
      };
      if (attrs["if"] !== undefined) {
        const { expr, diagnostics } = parseExpr(attrs["if"], cur.line);
        ctx.diags.push(...diagnostics);
        if (expr) choice.when = expr;
      }
      if (attrs["cost"] !== undefined) choice.cost = parseCost(ctx, attrs["cost"], cur.line);
      if (attrs["check"] !== undefined) choice.check = parseCheck(ctx, attrs["check"], cur.line);
      if (openChoice) error(ctx, cur.line, "choice-nested", "选项不能嵌套在选项里");
      out.choices.push(choice);
      parseBody(ctx, lines.slice(i + 1), { blocks: choice.blocks, choices: [] }, choice, "choice");
      i = skipToClose(i + 1, "choice");
      continue;
    }

    if (name === "if") {
      flushText();
      const rest = macro.slice(name.length);
      const { expr, diagnostics } = parseExpr(rest, cur.line);
      ctx.diags.push(...diagnostics);
      const thenBlocks: IrBlock[] = [];
      const elseBlocks: IrBlock[] = [];
      const consumed = parseIf(ctx, lines.slice(i + 1), thenBlocks, elseBlocks);
      if (expr) container().push({ k: "if", branches: [{ cond: expr, body: thenBlocks }], elseBody: elseBlocks.length ? elseBlocks : null });
      i += consumed + 1;
      continue;
    }

    if (name === "band") {
      flushText();
      const band = macro.slice(name.length).trim();
      if (!band) error(ctx, cur.line, "band-name", "<<band>> 缺少档位名");
      const body: IrBlock[] = [];
      const consumed = parseBand(ctx, lines.slice(i + 1), body);
      container().push({ k: "band", band, body });
      i += consumed + 1;
      continue;
    }

    error(ctx, cur.line, "macro-unknown", `不认识的宏 <<${name}>>`);
    i++;
  }

  flushText();
  if (closeTag) {
    error(ctx, lines[lines.length - 1]?.line ?? 0, "macro-unclosed", `<<${closeTag}>> 没有对应的 <</${closeTag}>>`);
  }
}

/** 消费 <<if>>…<<else>>…<</if>>，返回消费的行数（不含 <<if>> 自身）。 */
function parseIf(ctx: Ctx, lines: BodyLine[], thenBlocks: IrBlock[], elseBlocks: IrBlock[]): number {
  let depth = 0;
  let mode: "then" | "else" = "then";
  let consumed = 0;
  let buffer: BodyLine[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    parseBody(ctx, buffer, { blocks: mode === "then" ? thenBlocks : elseBlocks, choices: [] }, null, null);
    buffer = [];
  };
  for (const cur of lines) {
    consumed++;
    const trimmed = cur.text.trim();
    if (trimmed === "<<else>>") {
      flush();
      mode = "else";
      continue;
    }
    if (trimmed === "<</if>>") {
      flush();
      return consumed;
    }
    if (trimmed.startsWith("<<if")) depth++;
    buffer.push(cur);
  }
  error(ctx, lines[lines.length - 1]?.line ?? 0, "macro-unclosed", "<<if>> 没有对应的 <</if>>");
  flush();
  return consumed;
}

/** 消费 <<band>>…<</band>>，返回消费的行数。 */
function parseBand(ctx: Ctx, lines: BodyLine[], body: IrBlock[]): number {
  let consumed = 0;
  let buffer: BodyLine[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    parseBody(ctx, buffer, { blocks: body, choices: [] }, null, null);
    buffer = [];
  };
  for (const cur of lines) {
    consumed++;
    if (cur.text.trim() === "<</band>>") {
      flush();
      return consumed;
    }
    buffer.push(cur);
  }
  error(ctx, lines[lines.length - 1]?.line ?? 0, "macro-unclosed", "<<band>> 没有对应的 <</band>>");
  flush();
  return consumed;
}

/* ---------------- 入口 ---------------- */

export function parseTwee(source: string): TweeProgram {
  const ctx: Ctx = { diags: [], seen: new Map() };
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const passages: IrPassage[] = [];

  // 切 passage：头部行 `:: id [标签]`，紧跟其后的一行若是 `{…}` 则是元数据，其余都是正文
  const chunks: { id: string; tags: string[]; metaRaw?: string; metaLine?: number; line: number; body: { text: string; line: number }[] }[] = [];
  let current: (typeof chunks)[number] | null = null;
  let expectMeta = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (raw.startsWith("::")) {
      const rest = raw.replace(/^::[ \t]*/, "");
      const space = rest.search(/[ \t]/);
      const id = space < 0 ? rest : rest.slice(0, space);
      let tail = space < 0 ? "" : rest.slice(space).trim();
      let tags: string[] = [];
      if (tail.startsWith("[")) {
        const close = tail.indexOf("]");
        if (close > 0) {
          tags = tail.slice(1, close).split(/\s+/).filter(Boolean);
          tail = tail.slice(close + 1).trim();
        } else {
          error(ctx, i + 1, "header-tags", "头部行的标签没有闭合的 `]`");
          tail = "";
        }
      }
      if (id === "") error(ctx, i + 1, "header-id", "passage 头部没有名字");
      if (tail !== "") {
        error(ctx, i + 1, "header-tail", `头部行只写 \`:: 单元 id [标签]\`；多了「${tail}」。元数据 {} 要单独占一行`);
      }
      current = { id, tags, line: i + 1, body: [] };
      chunks.push(current);
      expectMeta = true;
      continue;
    }
    if (!current) {
      if (trimmed !== "") warn(ctx, i + 1, "preamble", "passage 之前有内容，已忽略");
      continue;
    }
    if (expectMeta) {
      expectMeta = false;
      if (trimmed.startsWith("{")) {
        current.metaRaw = trimmed;
        current.metaLine = i + 1;
        continue;
      }
    }
    current.body.push({ text: raw, line: i + 1 });
  }

  for (const chunk of chunks) {
    const meta = parseMeta(ctx, chunk.metaRaw, chunk.metaLine ?? chunk.line);
    const prev = ctx.seen.get(chunk.id);
    if (prev !== undefined) {
      error(ctx, chunk.line, "passage-dup", `单元 id 重复：${chunk.id}（另见第 ${prev} 行）`);
    } else {
      ctx.seen.set(chunk.id, chunk.line);
    }
    const out: BodyOut = { blocks: [], choices: [] };
    parseBody(ctx, chunk.body, out, null, null);
    passages.push({ id: chunk.id, tags: chunk.tags, meta, blocks: out.blocks, choices: out.choices, next: out.next, pos: { line: chunk.line } });
  }

  const index: Record<string, number> = {};
  passages.forEach((p, i) => {
    if (index[p.id] === undefined) index[p.id] = i;
  });

  validate(ctx, passages, index);
  return { passages, index, diagnostics: ctx.diags };
}

function parseMeta(ctx: Ctx, raw: string | undefined, line: number): IrMeta {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    error(ctx, line, "meta-json", `头部 {} 不是合法 JSON：${(e as Error).message}`);
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    error(ctx, line, "meta-shape", "头部 {} 必须是一个 JSON 对象");
    return {};
  }
  const meta: IrMeta = {};
  for (const [k, v] of Object.entries(parsed)) {
    switch (k) {
      case "weight":
      case "cooldown":
      case "priority":
        if (typeof v !== "number") error(ctx, line, "meta-type", `头部字段 ${k} 必须是数字`);
        else meta[k] = v;
        break;
      case "once":
      case "entry":
        if (typeof v !== "boolean") error(ctx, line, "meta-type", `头部字段 ${k} 必须是 true/false`);
        else meta[k] = v;
        break;
      case "地点":
        if (typeof v !== "string") error(ctx, line, "meta-type", "头部字段 地点 必须是字符串");
        else meta.地点 = v;
        break;
      default:
        error(ctx, line, "meta-key", `头部 {} 只放纯字面量调度元数据（weight / cooldown / priority / once / entry / 地点），不认「${k}」`);
    }
  }
  return meta;
}

/** 校验门：引用可解析、选项 id 不重复、模板不写 next。 */
function validate(ctx: Ctx, passages: IrPassage[], index: Record<string, number>): void {
  for (const p of passages) {
    const isTemplate = p.tags.includes("template");
    if (p.next && index[p.next] === undefined) {
      error(ctx, p.pos.line, "next-missing", `单元 ${p.id} 的 <<next>> 指向不存在的单元：${p.next}`);
    }
    if (isTemplate && p.next) {
      error(ctx, p.pos.line, "template-next", `涌现模板 ${p.id} 不能写 <<next>>（#22：模板固定原子性、无后续）`);
    }
    p.choices.forEach((c, ci) => {
      if (p.choices.findIndex((x) => x.id === c.id) !== ci) {
        error(ctx, c.pos.line, "choice-dup", `单元 ${p.id} 里选项 id 重复：${c.id}`);
      }
      if (c.next && index[c.next] === undefined) {
        error(ctx, c.pos.line, "next-missing", `单元 ${p.id} 的选项 ${c.id} 指向不存在的单元：${c.next}`);
      }
      if (c.check && c.blocks.length === 0) {
        warn(ctx, c.pos.line, "check-no-band", `单元 ${p.id} 的选项 ${c.id} 有检定但没有 <<band>> 分支`);
      }
    });
    if (p.choices.length === 0 && p.next === undefined && !isTemplate && !p.tags.includes("action")) {
      warn(ctx, p.pos.line, "passage-no-choice", `单元 ${p.id} 既没有选项也没有 <<next>>：它是一条死路`);
    }
  }
}
