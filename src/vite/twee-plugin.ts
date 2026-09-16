/**
 * Vite 插件：把 `src/content/twee/*.twee` 在**构建期**编译成 IR 虚拟模块（#15/#16 定稿的路径）。
 *
 * - 校验门：任何 error 级诊断直接抛错——dev 启动即失败，不等运行时。
 * - dev：`.twee` 改动时让虚拟模块失效并重编译。
 * - 产物：`virtual:twee`，导出 `PASSAGES` / `INDEX` / `DIAGNOSTICS`。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { summarize, toPlain } from "../twee/emit";
import { parseTwee } from "../twee/parse";
import type { Diagnostic, IrPassage } from "../twee/types";

export const TWEE_MODULE_ID = "virtual:twee";
const RESOLVED_ID = "\0" + TWEE_MODULE_ID;

export interface TweePluginOptions {
  /** 内容目录，相对于项目根 */
  dir?: string;
}

export interface CompileResult {
  code: string;
  diagnostics: Diagnostic[];
  summary: string;
  errors: Diagnostic[];
}

/** 读目录里全部 `.twee`，逐个编译并合并成一个程序。校验门不过就抛错。 */
export function compileTweeDir(dir: string): CompileResult {
  const files = readdirSync(dir)
    .filter((f: string) => f.endsWith(".twee"))
    .sort();
  if (files.length === 0) {
    throw new Error(`[twee] ${dir} 里没有 .twee 文件`);
  }
  const diagnostics: Diagnostic[] = [];
  const passages: IrPassage[] = [];
  const index: Record<string, number> = {};
  for (const file of files) {
    const program = parseTwee(readFileSync(join(dir, file), "utf8"));
    for (const d of program.diagnostics) {
      diagnostics.push({ ...d, message: `${file}：${d.message}` });
    }
    for (const p of program.passages) {
      if (index[p.id] !== undefined) {
        diagnostics.push({ level: "error", code: "passage-dup-file", message: `${file}：单元 id 与另一个文件重复：${p.id}`, line: p.pos.line });
        continue;
      }
      index[p.id] = passages.length;
      passages.push(toPlain({ passages: [p], index: {}, diagnostics: [] }).passages[0]!);
    }
  }
  const errors = diagnostics.filter((d) => d.level === "error");
  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.code} 第 ${e.line} 行：${e.message}`).join("\n");
    throw new Error(`[twee] 校验门未通过（${errors.length} 个 error）：\n${detail}`);
  }
  const summary = summarize({ passages, index, diagnostics });
  const code = `/* 由 src/vite/twee-plugin.ts 编译 .twee 生成：请勿手改。 */
export const PASSAGES = ${JSON.stringify(passages, null, 2)};
export const INDEX = ${JSON.stringify(index, null, 2)};
export const DIAGNOSTICS = ${JSON.stringify(diagnostics, null, 2)};
export default { PASSAGES, INDEX, DIAGNOSTICS };
`;
  return { code, diagnostics, summary, errors };
}

export function tweePlugin(options: TweePluginOptions = {}): Plugin {
  const absDir = resolve(process.cwd(), options.dir ?? "src/content/twee");
  /** 缓存编译结果；dev 改动时失效 */
  let cached: CompileResult | null = null;
  const compile = (): CompileResult => {
    cached = compileTweeDir(absDir);
    return cached;
  };

  return {
    name: "twee-compile",
    // 启动即编译：内容有 error 就当场失败，不进运行时
    configResolved() {
      const { summary } = compile();
      // eslint-disable-next-line no-console
      console.log(`[twee] ${summary}`);
    },
    resolveId(id) {
      return id === TWEE_MODULE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return (cached ?? compile()).code;
    },
    configureServer(server) {
      server.watcher.add(absDir);
      const invalidate = (file: string): void => {
        if (!file.endsWith(".twee")) return;
        cached = null;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", invalidate);
      server.watcher.on("add", invalidate);
      server.watcher.on("unlink", invalidate);
    },
    buildStart() {
      const { summary } = compile();
      this.warn(`[twee] ${summary}`);
    },
  };
}
