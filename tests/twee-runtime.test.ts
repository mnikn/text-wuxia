/**
 * 最小运行时的测试（#20 最短路径）：从开头走到「可以开始行动」。
 * 当前开场：身上没钱 → 当父亲的刀（+80 文）→ 药铺抓药（-40 文）→ 停在城里。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseTwee } from "../src/twee/parse";
import {
  chooseOption,
  costSummary,
  createSliceState,
  enterPassage,
  evalExpr,
  followNext,
  passageById,
  renderPassage,
  SLICE_TUNE,
  type SliceState,
} from "../src/twee/runtime";
import { parseExpr } from "../src/twee/expr";

const program = parseTwee(readFileSync("src/content/twee/开场.twee", "utf8"));

function at(id: string): { state: SliceState } {
  const state = createSliceState();
  enterPassage(program, state, id);
  return { state };
}

/** 从开头自动前进到指定单元之前的所有 <<next>>，返回最后停留在的那个单元 id。 */
function autoWalk(state: SliceState, from: string, stopAt: string): string {
  let id = from;
  for (let i = 0; i < 20; i++) {
    if (id === stopAt) return id;
    const view = followNext(program, state, passageById(program, id)!);
    if (!view) return id;
    id = view.passageId;
  }
  throw new Error("自动前进没有收敛");
}

describe("开场：没钱，只有一把刀", () => {
  it("起点是家门口：身上没钱，交代药钱与那把刀", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const view = renderPassage(passageById(program, SLICE_TUNE.startPassage)!, state, program);
    expect(view.passageId).toBe("开场.家门外");
    expect(view.options).toHaveLength(0);
    expect(view.atFreeActions).toBe(false);
    expect(state.money).toBe(0);
    const text = view.paragraphs.join("");
    expect(text).toContain("药还有两剂");
    expect(text).toContain("父亲留下的");
  });

  it("自动前进到官道，出现两个岔路", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const next = followNext(program, state, passageById(program, SLICE_TUNE.startPassage)!);
    expect(next!.passageId).toBe("开场.官道");
    expect(next!.options.map((o) => o.id)).toEqual(["help", "go"]);
  });
});

describe("当刀换药这条路", () => {
  it("搭手（+8 文、-15 体力、30 分钟）→ 贫巷出现当铺两个选择", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const before = { money: state.money, stamina: state.stamina.current, minute: state.clock.minute };
    const view = chooseOption(program, state, "开场.官道", "help");
    expect(view.passageId).toBe("开场.南门贫巷");
    expect(state.money).toBe(before.money + 8);
    expect(state.stamina.current).toBe(before.stamina - 15);
    expect(state.clock.minute).toBe(before.minute + 30);
    expect(view.options.map((o) => o.id)).toEqual(["pawn", "skip"]);
  });

  it("当刀：+80 文、-5 体力、20 分钟，落到药铺", () => {
    const { state } = at("开场.南门贫巷");
    const before = { money: state.money, stamina: state.stamina.current, minute: state.clock.minute };
    const view = chooseOption(program, state, "开场.南门贫巷", "pawn");
    expect(view.passageId).toBe("开场.药铺");
    expect(state.money).toBe(before.money + 80);
    expect(state.stamina.current).toBe(before.stamina - 5);
    expect(state.clock.minute).toBe(before.minute + 20);
    expect(state.recent.join("　")).toContain("银钱 +80 文");
  });

  it("药铺买两剂 40 文，剩下 40 文，停在「可以开始行动」", () => {
    const { state } = at("开场.南门贫巷");
    chooseOption(program, state, "开场.南门贫巷", "pawn");
    const view = followNext(program, state, passageById(program, "开场.药铺")!);
    expect(view!.passageId).toBe("开场.停留");
    expect(view!.atFreeActions).toBe(true);
    expect(view!.paragraphs.join("")).toContain("现在可以开始行动了");
  });

  it("整条路走一遍：0 文 → 88 文 → 48 文，体力 100 → 85 → 80", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    expect(state.money).toBe(0);
    autoWalk(state, SLICE_TUNE.startPassage, "开场.官道");
    chooseOption(program, state, "开场.官道", "help");
    expect(state.money).toBe(8);
    chooseOption(program, state, "开场.南门贫巷", "pawn");
    expect(state.money).toBe(88);
    const view = chooseOption(program, state, "开场.药铺", "buy");
    expect(state.money).toBe(48);
    expect(view.passageId).toBe("开场.停留");
    expect(state.stamina.current).toBe(80);
    expect(state.clock.minute).toBe(8 * 60 + 30 + 20 + 5);
    expect(view.atFreeActions).toBe(true);
  });

  it("不卖刀那条：钱没进账，停在原地", () => {
    const { state } = at("开场.南门贫巷");
    const before = state.clock.minute;
    const view = chooseOption(program, state, "开场.南门贫巷", "skip");
    expect(view.passageId).toBe("开场.停留");
    expect(state.money).toBe(0);
    expect(state.clock.minute).toBe(before + 10);
    expect(view.atFreeActions).toBe(true);
  });
});

describe("正文排版", () => {
  it("正文按空行切成多个段落，不并成一行", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const view = renderPassage(passageById(program, SLICE_TUNE.startPassage)!, state, program);
    expect(view.paragraphs).toHaveLength(3);
    expect(view.paragraphs[0]).toContain("母亲倚在门边");
    expect(view.paragraphs[1]!.startsWith("「药还有两剂。」")).toBe(true);
    expect(view.paragraphs[2]).toContain("米缸见底三日了");
    expect(view.paragraphs.every((p) => !p.includes("\n"))).toBe(true);
  });

  it("选完选项能读到那件事的正文（当刀那段的四段话连排在前）", () => {
    const { state } = at("开场.南门贫巷");
    const view = chooseOption(program, state, "开场.南门贫巷", "pawn");
    expect(view.passageId).toBe("开场.药铺");
    const text = view.paragraphs.join("|");
    expect(text).toContain("朝奉接过刀");
    expect(text).toContain("八十文，多一个子儿没有");
    expect(text).toContain("刀被搁进柜底的木箱");
    // 选项正文在前，落到的场景在后
    expect(text.indexOf("朝奉接过刀")).toBeLessThan(text.indexOf("济生堂"));
    expect(view.paragraphs.every((p) => !p.includes("\n"))).toBe(true);
  });
});

describe("代价与拦阻", () => {
  it("代价摘要按时间与资源列出", () => {
    const { state } = at("开场.官道");
    const help = passageById(program, "开场.官道")!.choices.find((c) => c.id === "help")!;
    expect(costSummary(help.cost, state)).toBe("耗时 30 分钟");
  });

  it("体力不够时选项标出原因，强行选中会抛错", () => {
    const { state } = at("开场.官道");
    state.stamina.current = 5;
    const passage = passageById(program, "开场.官道")!;
    const help = passage.choices.find((c) => c.id === "help")!;
    const saved = help.cost;
    help.cost = { stamina: { kind: "literal", value: 40, pos: { line: 17 } }, pos: { line: 17 } };
    expect(renderPassage(passage, state, program).options[0]!.blocked).toContain("体力不支");
    expect(() => chooseOption(program, state, "开场.官道", "help")).toThrow(/付不起/);
    help.cost = saved;
  });
});

describe("表达式求值", () => {
  it("读状态：银钱、时辰、体力上限", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    state.money = 120;
    expect(evalExpr(parseExpr("money", 1).expr!, state)).toBe(120);
    expect(evalExpr(parseExpr("hour", 1).expr!, state)).toBe(8);
    expect(evalExpr(parseExpr("stamina.max", 1).expr!, state)).toBe(100);
  });

  it("比较与逻辑组合", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    state.money = 120;
    expect(evalExpr(parseExpr("money >= 100 && stamina > 0", 1).expr!, state)).toBe(true);
    expect(evalExpr(parseExpr("money < 100 || !true", 1).expr!, state)).toBe(false);
  });
});
