/**
 * 真实内容回归：当铺「当剑」走 <<next>> 落到结果单元，
 * 行止记录在这里也要合并成一行（此前 enterPassage 收到未合并的 lines）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseTwee } from "../src/twee/parse";
import { createSliceState, enterPassage, chooseOption } from "../src/twee/runtime";

function collect(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith(".twee")) out.push(readFileSync(full, "utf8"));
  }
}

function compileContent(): { passages: ReturnType<typeof parseTwee>["passages"]; index: Record<string, number> } {
  const files: string[] = [];
  collect("src/content/twee", files);
  const passages = files.flatMap((f) => parseTwee(f, { checkRefs: false }).passages);
  const index: Record<string, number> = {};
  passages.forEach((p, i) => (index[p.id] = i));
  return { passages, index };
}

describe("真实内容：当剑", () => {
  it("有 next 的选项也要合并行止记录", () => {
    const { passages, index } = compileContent();
    const program = { passages, index, diagnostics: [] } as never;
    const state = createSliceState();
    state.items["剑"] = 1;
    const view = enterPassage(program, state, "地点.当铺");
    expect(view.options.some((o) => o.id === "pawn")).toBe(true);
    chooseOption(program, state, "地点.当铺", "pawn");
    expect(view.passageId).toBeTruthy();
    expect(state.recent.map((r) => r.text)).toEqual(["失去了剑，获得了 1 两银两、当票"]);
  });
});
