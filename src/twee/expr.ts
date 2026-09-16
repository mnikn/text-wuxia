/**
 * 受限表达式的解析（对应 #16 的「判断逻辑三处共用一套受限表达式」、#19 的词表）。
 *
 * 文法（本批实现的最小集）：
 *   expr    := or
 *   or      := and ("||" and)*
 *   and     := unary ("&&" unary)*
 *   unary   := "!" unary | cmp
 *   cmp     := primary (("==" | "!=" | "<" | "<=" | ">" | ">=") primary)?
 *   primary := 数字 | 字符串 | true | false | 点分名 | 具名调用 "(" expr ")" | "(" expr ")"
 *
 * 禁项（解析到即报错）：算术、三目、赋值、自由 JS。
 */
import type { Diagnostic, Expr } from "./types";

export interface ExprParseResult {
  expr: Expr | null;
  diagnostics: Diagnostic[];
}

const OPS = ["==", "!=", "<=", ">=", "<", ">"] as const;
const NAME_RE = /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff]*$/;
const FORBIDDEN = ["+", "-", "*", "/", "%", "?", ":"];

export function parseExpr(source: string, line: number): ExprParseResult {
  const diags: Diagnostic[] = [];
  const p = new Parser(source, line, diags);
  const expr = p.parseExpr();
  p.skipWs();
  if (expr && !p.eof()) {
    diags.push(err(line, "expr-trailing", `表达式在「${p.rest()}」处有多余内容；受限表达式不支持算术、三目与自由 JS`));
  }
  return { expr, diagnostics: diags };
}

function err(line: number, code: string, message: string): Diagnostic {
  return { level: "error", code, message, line };
}

class Parser {
  private i = 0;
  constructor(
    private readonly src: string,
    private readonly line: number,
    private readonly diags: Diagnostic[],
  ) {}

  eof(): boolean {
    return this.i >= this.src.length;
  }
  rest(): string {
    return this.src.slice(this.i).trim();
  }
  skipWs(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i]!)) this.i++;
  }
  private pos() {
    return { line: this.line };
  }
  private peek(s: string): boolean {
    return this.src.startsWith(s, this.i);
  }
  private eat(s: string): boolean {
    this.skipWs();
    if (this.peek(s)) {
      this.i += s.length;
      return true;
    }
    return false;
  }

  parseExpr(): Expr | null {
    return this.parseOr();
  }

  private parseOr(): Expr | null {
    const first = this.parseAnd();
    if (!first) return null;
    const xs = [first];
    while (this.eat("||")) {
      const next = this.parseAnd();
      if (!next) return xs.length === 1 ? first : { k: "or", xs, pos: this.pos() };
      xs.push(next);
    }
    return xs.length === 1 ? first : { k: "or", xs, pos: first.pos };
  }

  private parseAnd(): Expr | null {
    const first = this.parseUnary();
    if (!first) return null;
    const xs = [first];
    while (this.eat("&&")) {
      const next = this.parseUnary();
      if (!next) return xs.length === 1 ? first : { k: "and", xs, pos: this.pos() };
      xs.push(next);
    }
    return xs.length === 1 ? first : { k: "and", xs, pos: first.pos };
  }

  private parseUnary(): Expr | null {
    this.skipWs();
    if (this.i >= this.src.length) {
      this.diags.push(err(this.line, "expr-empty", "表达式为空"));
      return null;
    }
    if (this.eat("!")) {
      if (this.peek("=")) {
        this.diags.push(err(this.line, "expr-op", "`!=` 不能作为前缀；比较要写成 `甲 != 乙`"));
        return null;
      }
      const inner = this.parseUnary();
      return inner ? { k: "not", expr: inner, pos: this.pos() } : null;
    }
    return this.parseCmp();
  }

  private parseCmp(): Expr | null {
    const left = this.parsePrimary();
    if (!left) return null;
    this.skipWs();
    for (const op of OPS) {
      if (this.peek(op)) {
        this.i += op.length;
        const right = this.parsePrimary();
        if (!right) return left;
        return { k: "op", left, op, right, pos: left.pos };
      }
    }
    return left;
  }

  private parsePrimary(): Expr | null {
    this.skipWs();
    if (this.eat("(")) {
      const inner = this.parseExpr();
      if (!this.eat(")")) this.diags.push(err(this.line, "expr-paren", "括号没有闭合"));
      return inner;
    }
    const ch = this.src[this.i];
    if (ch === undefined) {
      this.diags.push(err(this.line, "expr-empty", "表达式在等号右侧就结束了"));
      return null;
    }
    // 禁项：算术与三目（含前缀正负号——表达式的数字不带符号）
    if (FORBIDDEN.includes(ch) || ch === "+" || ch === "-") {
      this.diags.push(err(this.line, "expr-forbidden", `受限表达式不允许「${ch}」：禁算术、禁三目、禁赋值`));
      return null;
    }
    // 字符串
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const end = this.src.indexOf(quote, this.i + 1);
      if (end < 0) {
        this.diags.push(err(this.line, "expr-string", "字符串没有闭合"));
        return null;
      }
      const value = this.src.slice(this.i + 1, end);
      this.i = end + 1;
      return { k: "str", value, pos: this.pos() };
    }
    // 数字
    if (/[0-9]/.test(ch)) {
      const m = /^\d+(\.\d+)?/.exec(this.src.slice(this.i))!;
      this.i += m[0].length;
      return { k: "num", value: Number(m[0]), pos: this.pos() };
    }
    // 名字 / 调用 / 字面量
    const m = /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff]*/.exec(this.src.slice(this.i));
    if (!m) {
      this.diags.push(err(this.line, "expr-token", `无法解析的字符「${ch}」`));
      return null;
    }
    let name = m[0];
    this.i += name.length;
    if (name === "true" || name === "false") return { k: "bool", value: name === "true", pos: this.pos() };
    this.skipWs();
    if (this.peek("(")) {
      this.i += 1;
      const arg = this.parseExpr();
      if (!this.eat(")")) this.diags.push(err(this.line, "expr-call", `具名调用 ${name}(…) 的右括号缺失`));
      if (!arg) return null;
      return { k: "call", name, arg, pos: this.pos() };
    }
    // 点分名
    const path = [name];
    while (this.i < this.src.length && this.src[this.i] === ".") {
      this.i++;
      const seg = /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff]*/.exec(this.src.slice(this.i));
      if (!seg) {
        this.diags.push(err(this.line, "expr-dotted", `点分名 ${path.join(".")} 的下一段缺失`));
        return null;
      }
      path.push(seg[0]);
      this.i += seg[0].length;
    }
    // 名字后面紧跟的 `?` 是三目，禁项
    this.skipWs();
    if (this.peek("?")) {
      this.diags.push(err(this.line, "expr-forbidden", "受限表达式不允许「?」：禁三目"));
      return null;
    }
    return { k: "dotted", path, pos: this.pos() };
  }
}

/** 覆盖此表达式的所有「根名」，用于校验门（内建白名单 / 命名空间注册）。 */
export function exprRoots(expr: Expr): { root: string; path: string }[] {
  const out: { root: string; path: string }[] = [];
  visit(expr, (e) => {
    if (e.k === "dotted") out.push({ root: e.path[0]!, path: e.path.join(".") });
  });
  return out;
}

/** 覆盖此表达式的所有具名调用名。 */
export function exprCalls(expr: Expr): string[] {
  const out: string[] = [];
  visit(expr, (e) => {
    if (e.k === "call") out.push(e.name);
  });
  return out;
}

function visit(expr: Expr, fn: (e: Expr) => void): void {
  fn(expr);
  switch (expr.k) {
    case "not":
      visit(expr.expr, fn);
      break;
    case "and":
    case "or":
      expr.xs.forEach((x) => visit(x, fn));
      break;
    case "op":
      visit(expr.left, fn);
      visit(expr.right, fn);
      break;
    case "call":
      visit(expr.arg, fn);
      break;
    default:
      break;
  }
}

/** 把表达式还原成可读文本，只用于诊断信息。 */
export function describeExpr(expr: Expr): string {
  switch (expr.k) {
    case "num":
      return String(expr.value);
    case "str":
      return `"${expr.value}"`;
    case "bool":
      return String(expr.value);
    case "dotted":
      return expr.path.join(".");
    case "call":
      return `${expr.name}(${describeExpr(expr.arg)})`;
    case "not":
      return `!${describeExpr(expr.expr)}`;
    case "and":
      return expr.xs.map(describeExpr).join(" && ");
    case "or":
      return expr.xs.map(describeExpr).join(" || ");
    case "op":
      return `${describeExpr(expr.left)} ${expr.op} ${describeExpr(expr.right)}`;
  }
}

export { NAME_RE };
