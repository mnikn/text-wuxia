/**
 * IR → 可执行模块（虚拟模块的产物）。
 *
 * 本批产物是**一段确定性 JSON**：不带函数、可直接 `JSON.parse`、也能整段塞进虚拟模块。
 * 运行时（解释器）另写，按这份数据跑；编译器不改运行时。
 */
import type { IrPassage, TweeProgram } from "./types";

/** 去掉一切非数据内容并按固定键序排列，保证同一输入产出同一字节。 */
export function toPlain(program: TweeProgram): { passages: IrPassage[]; index: Record<string, number> } {
  const passages = program.passages.map((p) => sortKeys(JSON.parse(JSON.stringify(p)) as IrPassage));
  const index: Record<string, number> = {};
  for (const [k, v] of Object.entries(program.index)) index[k] = v;
  return { passages, index };
}

function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return value;
}

/** 产出可直接写进虚拟模块的 ESM 源码。 */
export function emitModule(program: TweeProgram, banner = ""): string {
  const plain = toPlain(program);
  const body = JSON.stringify(plain, null, 2);
  return `${banner}/* 由 src/twee 的编译器生成：请勿手改。 */\nexport const PASSAGES = ${body}.passages;\nexport const INDEX = ${body}.index;\nexport default { PASSAGES, INDEX };\n`;
}

/** 构建期摘要：给校验门与人读的一行。 */
export function summarize(program: TweeProgram): string {
  const errs = program.diagnostics.filter((d) => d.level === "error").length;
  const warns = program.diagnostics.length - errs;
  return `${program.passages.length} 个单元、${program.passages.reduce((n, p) => n + p.choices.length, 0)} 个选项；error ${errs}、warning ${warns}`;
}
