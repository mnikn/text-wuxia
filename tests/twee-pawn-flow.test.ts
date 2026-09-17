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

  it("城中心去当铺不耗时：城内的三处出口都不走时钟", () => {
    const { passages, index } = compileContent();
    const program = { passages, index, diagnostics: [] } as never;
    const state = createSliceState();
    const view = enterPassage(program, state, "地点.城中心");
    for (const id of ["toPawnshop", "toPharmacy", "toMarket"]) {
      expect(view.options.find((o) => o.id === id)!.ke).toBeUndefined();
    }
    const before = state.clock.minute;
    chooseOption(program, state, "地点.城中心", "toPawnshop");
    expect(state.clock.minute).toBe(before);
  });
});

describe("真实内容：回家前置", () => {
  it("只买了米：没有回家的选项", () => {
    const { passages, index } = compileContent();
    const program = { passages, index, diagnostics: [] } as never;
    const state = createSliceState();
    state.items["米袋"] = 1;
    const view = enterPassage(program, state, "地点.城中心");
    expect(view.options.map((o) => o.id)).not.toContain("toHome");
    expect(view.options.map((o) => o.label)).not.toContain("回家");
  });

  it("只买了药：也没有回家的选项", () => {
    const { passages, index } = compileContent();
    const program = { passages, index, diagnostics: [] } as never;
    const state = createSliceState();
    state.items["药包"] = 1;
    const view = enterPassage(program, state, "地点.市集");
    expect(view.options.map((o) => o.id)).not.toContain("toHome");
  });

  it("米药齐备：回家的选项出现，直接到家", () => {
    const { passages, index } = compileContent();
    const program = { passages, index, diagnostics: [] } as never;
    const state = createSliceState();
    state.items["米袋"] = 1;
    state.items["药包"] = 1;
    state.visited["取剑"] = true;
    const town = enterPassage(program, state, "地点.城中心");
    expect(town.options.map((o) => o.id)).toContain("toHome");
    const home = chooseOption(program, state, "地点.城中心", "toHome");
    expect(home.passageId).toBe("地点.家门外");
    expect(home.options.map((o) => o.id)).toContain("settle");
  });

  it("米药不齐时在家门外没有回屋歇下", () => {
    const { passages, index } = compileContent();
    const program = { passages, index, diagnostics: [] } as never;
    const state = createSliceState();
    state.items["米袋"] = 1;
    const view = enterPassage(program, state, "地点.家门外");
    expect(view.options.map((o) => o.id)).not.toContain("settle");
  });
});
