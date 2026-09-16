/**
 * 最小运行时的测试（#20 最短路径）：从开头走到「可以开始行动」。
 * 当前开场：身上没钱 → 当父亲的剑（+1 两）→ 抓一星期的药（-300 文）
 * → 买一星期的粮（-200 文）→ 回家，手里 500 文。
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
  formatMoney,
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

/** 开场是一条线：一路点第一个选项走到底，返回停住的那个单元。 */
function walkOpening(state: SliceState): string {
  let id = SLICE_TUNE.startPassage;
  for (let i = 0; i < 20; i++) {
    const passage = passageById(program, id)!;
    const choice = passage.choices[0];
    if (!choice) return id;
    id = chooseOption(program, state, id, choice.id).passageId;
  }
  throw new Error("开场没有收敛");
}

describe("开场：没钱，只有一把剑", () => {
  it("起点是家门口：身上没钱，只有一个选项，交代断药与那把剑", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const view = renderPassage(passageById(program, SLICE_TUNE.startPassage)!, state, program);
    expect(view.passageId).toBe("开场.家门外");
    expect(view.options.map((o) => o.id)).toEqual(["take"]);
    expect(view.options[0]!.label).toBe("把剑取下来");
    expect(view.options[0]!.summary).toBe("耗时 5 分钟");
    expect(view.atFreeActions).toBe(false);
    expect(state.money).toBe(0);
    const text = view.paragraphs.join("");
    expect(text).toContain("药罐空了三天");
    expect(text).toContain("父亲留下的");
    expect(text).toContain("三百文");
  });

  it("正文按空行切成多个段落，不并成一行", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const view = renderPassage(passageById(program, SLICE_TUNE.startPassage)!, state, program);
    expect(view.paragraphs).toHaveLength(6);
    expect(view.paragraphs[0]).toContain("母亲倚在门边");
    expect(view.paragraphs[1]!.startsWith("「不碍事。」")).toBe(true);
    expect(view.paragraphs.every((p) => !p.includes("\n"))).toBe(true);
  });
});

describe("当剑换药这条路", () => {
  it("取下剑：5 分钟，落到官道", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const before = state.clock.minute;
    const view = chooseOption(program, state, "开场.家门外", "take");
    expect(view.passageId).toBe("开场.官道");
    expect(state.clock.minute).toBe(before + 5);
    expect(state.money).toBe(0);
    expect(view.options.map((o) => o.id)).toEqual(["on"]);
    // 选项正文与目标单元正文连排：说到「早去早回」那一段在前面
    expect(view.paragraphs.join("|")).toContain("早去早回");
  });

  it("官道赶路只花时间、不耗体力：120 分钟，落到南门贫巷", () => {
    const { state } = at("开场.官道");
    const before = { minute: state.clock.minute, stamina: state.stamina.current };
    const view = chooseOption(program, state, "开场.官道", "on");
    expect(view.passageId).toBe("开场.南门贫巷");
    expect(state.clock.minute).toBe(before.minute + 120);
    expect(state.stamina.current).toBe(before.stamina);
  });

  it("贫巷只有一条路：走向当铺，5 分钟", () => {
    const { state } = at("开场.南门贫巷");
    const view = chooseOption(program, state, "开场.南门贫巷", "pawn");
    expect(view.passageId).toBe("开场.当铺");
    expect(state.clock.minute).toBe(8 * 60 + 5);
    expect(view.options.map((o) => o.id)).toEqual(["pawn"]);
  });

  it("当剑：+1 两、15 分钟，落到药铺，行止记录写「银钱 +1 两」", () => {
    const { state } = at("开场.当铺");
    const before = state.clock.minute;
    const view = chooseOption(program, state, "开场.当铺", "pawn");
    expect(view.passageId).toBe("开场.药铺");
    expect(state.money).toBe(1000);
    expect(state.clock.minute).toBe(before + 15);
    expect(state.recent.join("　")).toContain("银钱 +1 两");
    expect(view.paragraphs.join("|")).toContain("当票");
  });

  it("药铺抓一星期的药：-300 文，落到市集", () => {
    const { state } = at("开场.当铺");
    chooseOption(program, state, "开场.当铺", "pawn");
    const view = chooseOption(program, state, "开场.药铺", "buy");
    expect(view.passageId).toBe("开场.市集");
    expect(state.money).toBe(700);
    expect(view.paragraphs.join("|")).toContain("七剂，三百文");
  });

  it("市集买一星期的粮：-200 文，落到出城", () => {
    const { state } = at("开场.药铺");
    state.money = 1000;
    const view = chooseOption(program, state, "开场.药铺", "buy");
    const next = chooseOption(program, state, "开场.市集", "grain");
    expect(next.passageId).toBe("开场.出城");
    expect(state.money).toBe(500);
    expect(view.passageId).toBe("开场.市集");
  });

  it("出城回家：120 分钟，停在「可以开始行动」，手里 500 文", () => {
    const { state } = at("开场.出城");
    const view = chooseOption(program, state, "开场.出城", "back");
    expect(view.passageId).toBe("开场.停留");
    expect(view.atFreeActions).toBe(true);
    expect(view.options).toHaveLength(0);
    expect(view.paragraphs.join("")).toContain("现在可以开始行动了");
    expect(state.location).toBe("城郊家村");
  });

  it("整条路走一遍：0 → 1000 → 700 → 500，体力一路 100，13:00 到家", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    expect(state.money).toBe(0);
    expect(state.stamina.current).toBe(100);

    chooseOption(program, state, "开场.家门外", "take");
    chooseOption(program, state, "开场.官道", "on");
    chooseOption(program, state, "开场.南门贫巷", "pawn");
    chooseOption(program, state, "开场.当铺", "pawn");
    expect(state.money).toBe(1000);
    expect(state.stamina.current).toBe(100);

    chooseOption(program, state, "开场.药铺", "buy");
    expect(state.money).toBe(700);
    chooseOption(program, state, "开场.市集", "grain");
    expect(state.money).toBe(500);

    const leaving = passageById(program, "开场.出城")!;
    expect(leaving.choices.map((c) => c.id)).toEqual(["back"]);
    chooseOption(program, state, "开场.出城", "back");
    expect(state.atFreeActions).toBe(true);
    expect(state.money).toBe(500);
    expect(state.stamina.current).toBe(100);
    expect(state.clock.minute).toBe(13 * 60);
    expect(state.location).toBe("城郊家村");
  });
});

describe("银钱显示口径", () => {
  it("一两 = 一千文，换算只在显示层", () => {
    expect(formatMoney(0)).toBe("0 文");
    expect(formatMoney(300)).toBe("300 文");
    expect(formatMoney(500)).toBe("500 文");
    expect(formatMoney(1000)).toBe("1 两");
    expect(formatMoney(1500)).toBe("1 两 500 文");
    expect(formatMoney(-300)).toBe("-300 文");
  });

  it("代价摘要用换算后的口径", () => {
    const { state } = at("开场.药铺");
    state.money = 1000;
    const buy = passageById(program, "开场.药铺")!.choices.find((c) => c.id === "buy")!;
    expect(costSummary(buy.cost, state)).toBe("耗时 15 分钟，花 300 文");
  });
});

describe("代价与拦阻", () => {
  it("钱不够时选项标出原因，强行选中会抛错", () => {
    const { state } = at("开场.药铺");
    state.money = 200;
    const passage = passageById(program, "开场.药铺")!;
    expect(renderPassage(passage, state, program).options[0]!.blocked).toContain("银钱不足");
    expect(costSummary(passage.choices[0]!.cost, state)).toBe("耗时 15 分钟，花 300 文（银钱不足）");
    expect(() => chooseOption(program, state, "开场.药铺", "buy")).toThrow(/付不起/);
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
