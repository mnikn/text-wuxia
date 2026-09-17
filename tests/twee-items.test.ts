/**
 * 物品与负重：只覆盖机制——物品的增减、谓词、代价、负重硬门与校验门。
 * 夹具是内联的中性 twee，不读 src/content 下的故事；内容怎么改都不该弄红这里。
 * （开场内容侧的手玩核对见 planning/wayfinder-content-rewrite/playtest-开场与谋生.md）
 */
import { describe, expect, it } from "vitest";
import { parseTwee } from "../src/twee/parse";
import { ITEMS, itemDef, itemDesc, itemList, itemName } from "../src/content/items";
import {
  carryCapacity,
  carryWeight,
  checkCarry,
  chooseOption,
  costSummary,
  createSliceState,
  enterPassage,
  evalExpr,
  itemCount,
  passageById,
  renderPassage,
  type SliceState,
} from "../src/twee/runtime";
import { parseExpr } from "../src/twee/expr";

const join = (...lines: string[]) => lines.join("\n");
const errs = (src: string) =>
  parseTwee(src)
    .diagnostics.filter((d) => d.level === "error")
    .map((d) => d.code);

/**
 * 夹具：
 * - 家 拿剑（`item("剑") +1`）→ 街
 * - 街 的正文按 `item('剑') >= 1` 分支；四个选项：吃药（耗药包）、买粮（得米袋）、搬石碾（得 99 个药包，必超重）、当剑（失剑得当票）
 */
const SOURCE = join(
  ":: 家 [scene]",
  "",
  "屋里。",
  "",
  '<<choice id="take" label="拿剑" mark="拿了">>',
  '<<eff item("剑") +1>>',
  "<<next 街>>",
  "<</choice>>",
  "",
  ":: 街 [scene]",
  "",
  "<<if item('剑') >= 1>>",
  "剑在手里。",
  "<<else>>",
  "空手。",
  "<</if>>",
  "",
  '<<choice id="eat" label="吃药" cost="time 1, item(药包) 1">>',
  "<<eff stamina +20>>",
  "<</choice>>",
  '<<choice id="buyRice" label="买粮" cost="time 2, money 200">>',
  '<<eff item("米袋") +1>>',
  "<</choice>>",
  '<<choice id="haul" label="搬石碾" cost="time 1">>',
  '<<eff item("药包") +99>>',
  "<</choice>>",
  '<<choice id="pawn" label="当剑">>',
  '<<eff item("剑") -1, item("当票") +1>>',
  "<</choice>>",
  "",
);

const program = parseTwee(SOURCE);

function at(id: string): SliceState {
  const state = createSliceState();
  enterPassage(program, state, id);
  return state;
}

describe("物品登记表", () => {
  it("四件物品都有显示名与单件重量", () => {
    expect(itemList()).toEqual(["剑", "米袋", "药包", "当票"]);
    expect(itemDef("剑")?.重量).toBe(3);
    expect(itemDef("米袋")?.重量).toBe(15);
    expect(itemName("当票")).toBe("当票");
    expect(itemDesc("当票")).toBe("典物：父亲留下的旧剑一口；当价：一两；赎期：三个月内。");
  });

  it("没登记的名字读不回来（原型键也挡掉）", () => {
    expect(itemDef("没有这东西")).toBeUndefined();
    expect(itemDef("constructor")).toBeUndefined();
    expect(itemName("没有这东西")).toBe("没有这东西");
  });
});

describe("物品效果", () => {
  it("得到物品：写进携带物，行止记录按增色", () => {
    const state = at("家");
    const view = chooseOption(program, state, "家", "take");
    expect(view.passageId).toBe("街");
    expect(state.items["剑"]).toBe(1);
    expect(state.recent.map((r) => [r.text, r.kind])).toEqual([["你获得了剑", "gain"]]);
  });

  it("失去物品：数量归零即删键，行止记录按减色", () => {
    const state = at("街");
    state.items["剑"] = 1;
    chooseOption(program, state, "街", "pawn");
    expect(state.items["剑"]).toBeUndefined();
    expect(itemCount(state, "剑")).toBe(0);
    expect(state.items["当票"]).toBe(1);
    expect(state.recent.map((r) => [r.text, r.kind])).toEqual([["失去了剑，获得了当票", "note"]]);
  });

  it("身上没有却要失去：夹到 0，不报错，也不留一条没发生的记录", () => {
    const state = at("街");
    chooseOption(program, state, "街", "pawn");
    expect(state.items["剑"]).toBeUndefined();
    expect(state.items["当票"]).toBe(1);
    expect(state.recent.map((r) => r.text)).toEqual(["你获得了当票"]);
  });

  it("数量永不为负", () => {
    const state = at("街");
    state.items["剑"] = 1;
    const single = parseTwee(join(":: a [scene]", "", '<<choice id="c" label="丢两把">>', '<<eff item("剑") -2>>', "<</choice>>", ""));
    const s = createSliceState();
    s.items["剑"] = 1;
    enterPassage(single, s, "a");
    chooseOption(single, s, "a", "c");
    expect(itemCount(s, "剑")).toBe(0);
    expect(state.items["剑"]).toBe(1);
  });

  it("多件才带 ×数量：单件不带", () => {
    const multi = parseTwee(join(":: a [scene]", "", '<<choice id="c" label="拿两把">>', '<<eff item("剑") +2>>', "<</choice>>", ""));
    const s = createSliceState();
    enterPassage(multi, s, "a");
    chooseOption(multi, s, "a", "c");
    expect(s.recent.map((r) => r.text)).toEqual(["你获得了剑 ×2"]);
  });

  it("同时获得多样东西并作一行", () => {
    const both = parseTwee(join(
      ":: a [scene]", "",
      '<<choice id="c" label="都拿">>',
      '<<eff item("剑") +1, item("当票") +2, money +300>>',
      "<</choice>>", "",
    ));
    const s = createSliceState();
    enterPassage(both, s, "a");
    chooseOption(both, s, "a", "c");
    expect(s.recent.map((r) => r.text)).toEqual(["获得了 300 文、剑、当票 ×2"]);
    expect(s.recent.map((r) => r.kind)).toEqual(["gain"]);
  });

  it("同时失去多样东西并作一行；只有钱时仍说花掉了", () => {
    const both = parseTwee(join(
      ":: a [scene]", "",
      '<<choice id="c" label="都丢">>',
      '<<eff item("剑") -1, money -300>>',
      "<</choice>>", "",
    ));
    const s = createSliceState();
    s.items["剑"] = 1;
    s.money = 500;
    enterPassage(both, s, "a");
    chooseOption(both, s, "a", "c");
    expect(s.recent.map((r) => r.text)).toEqual(["花掉了 300 文、剑"]);
  });
});

describe("item() 谓词", () => {
  it("数量比较按件数读", () => {
    const state = at("街");
    expect(evalExpr(parseExpr("item('剑')", 1).expr!, state)).toBe(0);
    expect(evalExpr(parseExpr("item('剑') >= 1", 1).expr!, state)).toBe(false);
    state.items["剑"] = 2;
    expect(evalExpr(parseExpr("item('剑') >= 1", 1).expr!, state)).toBe(true);
    expect(evalExpr(parseExpr("item('剑') == 2", 1).expr!, state)).toBe(true);
  });

  it("正文分支读物品：拿了剑才写剑在手里", () => {
    const empty = at("街");
    expect(renderPassage(passageById(program, "街")!, empty, program).paragraphs).toEqual(["空手。"]);
    const armed = at("街");
    armed.items["剑"] = 1;
    expect(renderPassage(passageById(program, "街")!, armed, program).paragraphs).toEqual(["剑在手里。"]);
  });
});

describe("物品代价", () => {
  it("付得起：扣掉物品、推时间，摘要按件数写", () => {
    const state = at("街");
    state.items["药包"] = 2;
    const before = state.clock.minute;
    const eat = passageById(program, "街")!.choices.find((c) => c.id === "eat")!;
    expect(costSummary(eat.cost, state)).toBe("耗药包 1");
    chooseOption(program, state, "街", "eat");
    expect(state.items["药包"]).toBe(1);
    expect(state.stamina.current).toBe(state.stamina.max);
    expect(state.clock.minute).toBe(before + 15); // 不足一刻按一刻走
  });

  it("付不起：选项标出原因，强行选中抛错", () => {
    const state = at("街");
    const view = renderPassage(passageById(program, "街")!, state, program);
    expect(view.options.find((o) => o.id === "eat")!.blocked).toBe("药包不足");
    expect(costSummary(passageById(program, "街")!.choices.find((c) => c.id === "eat")!.cost, state)).toBe("耗药包 1，药包不足");
    expect(() => chooseOption(program, state, "街", "eat")).toThrow(/付不起/);
  });
});

describe("负重", () => {
  it("按单件重量求和，银钱不计入", () => {
    const state = createSliceState();
    expect(carryWeight(state)).toBe(0);
    state.items["剑"] = 1;
    state.money = 99999;
    expect(carryWeight(state)).toBe(ITEMS["剑"]!.重量);
    state.items["米袋"] = 1;
    expect(carryWeight(state)).toBe(18);
    state.items["当票"] = 3;
    expect(carryWeight(state)).toBe(18);
  });

  it("上限是引擎侧的固定值", () => {
    expect(carryCapacity()).toBe(20);
  });

  it("取之后会超重的选项：标出背不动，强行选中抛错", () => {
    const state = at("街");
    state.items["米袋"] = 1;
    const haul = passageById(program, "街")!.choices.find((c) => c.id === "haul")!;
    const check = checkCarry(haul, state);
    expect(check.ok).toBe(false);
    expect(check.projected).toBe(114);
    expect(check.capacity).toBe(20);
    const view = renderPassage(passageById(program, "街")!, state, program);
    expect(view.options.find((o) => o.id === "haul")!.blocked).toBe("背不动了");
    expect(() => chooseOption(program, state, "街", "haul")).toThrow(/背不动了/);
  });

  it("装得下就照常选", () => {
    const state = at("街");
    state.items["剑"] = 1;
    state.money = 200;
    chooseOption(program, state, "街", "buyRice");
    expect(state.items["米袋"]).toBe(1);
    expect(carryWeight(state)).toBe(18);
  });

  it("互相排斥的分支不重复计重", () => {
    const branched = parseTwee(
      join(
        ":: a [scene]",
        "",
        '<<choice id="c" label="拿">>',
        "<<if money > 0>>",
        '<<eff item("米袋") +1>>',
        "<<else>>",
        '<<eff item("米袋") +1>>',
        "<</if>>",
        "<</choice>>",
        "",
      ),
    );
    const state = createSliceState();
    enterPassage(branched, state, "a");
    const choice = passageById(branched, "a")!.choices[0]!;
    expect(checkCarry(choice, state).projected).toBe(15);
  });

  it("只往外掏的选项永远选得动", () => {
    const state = at("街");
    state.items["剑"] = 1;
    const pawn = passageById(program, "街")!.choices.find((c) => c.id === "pawn")!;
    expect(checkCarry(pawn, state).projected).toBe(0);
  });
});

describe("校验门（error）", () => {
  it("效果里的物品名没登记", () => {
    expect(errs(join(":: a", '<<choice id="x" label="甲">>', '<<eff item("没有这东西") +1>>', "<</choice>>", ""))).toContain("eff-item-name");
  });

  it("代价里的物品名没登记", () => {
    expect(errs(join(":: a", '<<choice id="x" label="甲" cost="item(没有这东西) 1">>', "甲", "<</choice>>", ""))).toContain("cost-item-name");
  });

  it("谓词里的具名调用没登记", () => {
    expect(errs(join(":: a", "<<if has('药包')>>", "正文", "<</if>>", ""))).toContain("call-unimplemented");
  });

  it("item() 的参数不是登记过的名字", () => {
    expect(errs(join(":: a", "<<if item('没有这东西') >>", "正文", "<</if>>", ""))).toContain("item-arg");
    expect(errs(join(":: a", "<<if item(1) >>", "正文", "<</if>>", ""))).toContain("item-arg");
  });

  it("合法写法一个错都不报", () => {
    expect(errs(SOURCE)).toEqual([]);
  });
});

describe("解析产物", () => {
  it("item 效果条目：目标与物品名分开存", () => {
    const choice = passageById(program, "家")!.choices[0]!;
    expect(choice.blocks).toContainEqual({
      k: "effect",
      effects: [{ target: "item", item: "剑", delta: { kind: "literal", value: 1, pos: { line: 6 } }, pos: { line: 6 } }],
    });
  });

  it("代价里的物品条目：名字与量都在", () => {
    const cost = passageById(program, "街")!.choices.find((c) => c.id === "eat")!.cost!;
    expect(cost.items).toEqual([{ 名: "药包", 量: { kind: "literal", value: 1, pos: { line: 18 } }, pos: { line: 18 } }]);
    expect(cost.time).toEqual({ kind: "literal", value: 1, pos: { line: 18 } });
  });
});
