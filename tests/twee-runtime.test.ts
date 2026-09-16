/**
 * 最小运行时的测试（#20 最短路径）：从开头走到「可以开始行动」，包含两条岔路。
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

describe("从开头走到可以行动", () => {
  it("起点是家门口，交代了药钱与处境，且只能往下走", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const view = renderPassage(passageById(program, SLICE_TUNE.startPassage)!, state, program);
    expect(view.passageId).toBe("开场.家门外");
    expect(view.options).toHaveLength(0);
    expect(view.paragraphs.join("")).toContain("药还有两剂");
    expect(view.atFreeActions).toBe(false);
  });

  it("自动前进到官道，出现两个岔路选项", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    const next = followNext(program, state, passageById(program, SLICE_TUNE.startPassage)!);
    expect(next!.passageId).toBe("开场.官道");
    expect(next!.options.map((o) => o.id)).toEqual(["help", "go"]);
    expect(next!.options[0]!.summary).toContain("耗时 30 分钟");
  });

  it("选「上前搭手」：时间 +30 分、钱 +8、体力 -15，落到贫巷", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    followNext(program, state, passageById(program, SLICE_TUNE.startPassage)!);
    const before = { money: state.money, stamina: state.stamina.current, minute: state.clock.minute };
    const view = chooseOption(program, state, "开场.官道", "help");
    expect(view.passageId).toBe("开场.南门贫巷");
    expect(state.clock.minute).toBe(before.minute + 30);
    expect(state.money).toBe(before.money + 8);
    expect(state.stamina.current).toBe(before.stamina - 15);
    expect(state.recent.join("　")).toContain("银钱 +8 文");
  });

  it("选「不理，径直上路」：只花 10 分钟，钱与体力不动", () => {
    const { state } = at(SLICE_TUNE.startPassage);
    followNext(program, state, passageById(program, SLICE_TUNE.startPassage)!);
    const before = { money: state.money, stamina: state.stamina.current, minute: state.clock.minute };
    const view = chooseOption(program, state, "开场.官道", "go");
    expect(view.passageId).toBe("开场.南门贫巷");
    expect(state.clock.minute).toBe(before.minute + 10);
    expect(state.money).toBe(before.money);
    expect(state.stamina.current).toBe(before.stamina);
  });

  it("贫巷就是本批的终点：没有选项也没有 next，标记为可自由行动", () => {
    const { state } = at("开场.南门贫巷");
    const view = renderPassage(passageById(program, "开场.南门贫巷")!, state, program);
    expect(view.atFreeActions).toBe(true);
    expect(view.paragraphs.join("")).toContain("现在可以开始行动了");
    expect(state.visited["开场.南门贫巷"]).toBe(true);
  });

  it("走到底之后再 followNext 返回 null（不会凭空接一个段落）", () => {
    const { state } = at("开场.南门贫巷");
    expect(followNext(program, state, passageById(program, "开场.南门贫巷")!)).toBeNull();
  });
});

describe("代价与拦阻", () => {
  it("钱不够时选项显示原因且选中会抛错", () => {
    const { state } = at("开场.官道");
    state.money = 0;
    const passage = passageById(program, "开场.官道")!;
    // 把搭手的代价临时设成要钱，验证拦阻路径
    const help = passage.choices.find((c) => c.id === "help")!;
    const saved = help.cost;
    help.cost = { money: { kind: "literal", value: 50, pos: { line: 15 } }, pos: { line: 15 } };
    const view = renderPassage(passage, state, program);
    expect(view.options[0]!.blocked).toContain("银钱不足");
    expect(() => chooseOption(program, state, "开场.官道", "help")).toThrow(/付不起/);
    help.cost = saved;
  });

  it("体力不够时同样拦阻", () => {
    const { state } = at("开场.官道");
    state.stamina.current = 5;
    const passage = passageById(program, "开场.官道")!;
    const help = passage.choices.find((c) => c.id === "help")!;
    const saved = help.cost;
    help.cost = { stamina: { kind: "literal", value: 40, pos: { line: 15 } }, pos: { line: 15 } };
    expect(renderPassage(passage, state, program).options[0]!.blocked).toContain("体力不支");
    help.cost = saved;
  });

  it("代价摘要按时间与资源分行列出", () => {
    const { state } = at("开场.官道");
    const help = passageById(program, "开场.官道")!.choices.find((c) => c.id === "help")!;
    expect(costSummary(help.cost, state)).toBe("耗时 30 分钟");
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
