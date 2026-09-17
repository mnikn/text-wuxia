/**
 * 最小运行时的测试：只覆盖机制——导航、代价、效果、渲染、表达式求值。
 * 夹具是内联的中性 twee，不读 src/content 下的故事；内容怎么改都不该弄红这里。
 */
import { describe, expect, it } from "vitest";
import { parseTwee } from "../src/twee/parse";
import {
  chooseOption,
  costSummary,
  formatKe,
  createSliceState,
  dateOf,
  enterPassage,
  evalExpr,
  followNext,
  formatMoney,
  passageById,
  renderPassage,
  keToMinutes,
  type SliceState,
} from "../src/twee/runtime";
import { parseExpr } from "../src/twee/expr";

const join = (...lines: string[]) => lines.join("\n");

/**
 * 夹具：
 * - a 两段正文、一个无代价选项，选项不写 next，靠单元级 next 兜底 → b
 * - b 两个选项：一个只有代价、一个有代价 + 效果，都 → c
 * - c 没选项也没出口（自由行动）
 * - d 没选项但有出口（自动前进用）
 */
const SOURCE = join(
  ":: a [scene]",
  '{"地点":"甲地"}',
  "",
  "第一段。",
  "",
  "第二段。",
  "",
  "<<next b>>",
  "",
  '<<choice id="free" label="空手走">>',
  "你走了。",
  "<</choice>>",
  "",
  ":: b [scene]",
  '{"地点":"乙地"}',
  "",
  '<<choice id="pay" label="付钱" cost="time 1, money 300">>',
  "你付了钱。",
  "<<next c>>",
  "<</choice>>",
  '<<choice id="earn" label="领赏" cost="time 1">>',
  "你领了赏。",
  "<<eff money +1500, stamina -10>>",
  "<<next c>>",
  "<</choice>>",
  "",
  ":: c [scene]",
  "",
  "到此为止。",
  "",
  ":: d [scene]",
  "",
  "只挂了个出口。",
  "<<next c>>",
  "",
);

const program = parseTwee(SOURCE);

function at(id: string): { state: SliceState } {
  const state = createSliceState();
  enterPassage(program, state, id);
  return { state };
}

describe("进入单元", () => {
  it("正文按空行切成段落，头部元数据写进状态，起点取自 tune", () => {
    const state = createSliceState();
    const view = enterPassage(program, state, "a");
    expect(view.passageId).toBe("a");
    expect(view.paragraphs).toEqual(["第一段。", "第二段。"]);
    expect(view.paragraphs.every((p) => !p.includes("\n"))).toBe(true);
    expect(state.location).toBe("甲地");
    expect(state.visited["a"]).toBe(true);
    expect(state.money).toBe(0);
    expect(state.stamina.current).toBe(state.stamina.max);
    expect(state.clock.minute).toBe(7 * 60);
    expect(view.atFreeActions).toBe(false);
  });

  it("没有代价的选项不带摘要", () => {
    const { state } = at("a");
    const view = renderPassage(passageById(program, "a")!, state, program);
    expect(view.options.map((o) => o.id)).toEqual(["free"]);
    expect(view.options[0]!.label).toBe("空手走");
    expect(view.options[0]!.summary).toBeUndefined();
    expect(view.options[0]!.blocked).toBeUndefined();
  });
});

describe("选中选项", () => {
  it("无代价：不动时间与资源；选项没写 next 时落到单元级 next", () => {
    const { state } = at("a");
    const before = { minute: state.clock.minute, stamina: state.stamina.current, money: state.money };
    const view = chooseOption(program, state, "a", "free");
    expect(view.passageId).toBe("b");
    expect(state.clock.minute).toBe(before.minute);
    expect(state.stamina.current).toBe(before.stamina);
    expect(state.money).toBe(before.money);
    expect(state.location).toBe("乙地");
  });

  it("选项正文与目标单元正文连排", () => {
    const { state } = at("a");
    const view = chooseOption(program, state, "a", "free");
    expect(view.paragraphs[0]).toBe("你走了。");
  });

  it("带代价：时间推进、钱扣掉", () => {
    const { state } = at("b");
    state.money = 1000;
    const before = state.clock.minute;
    const view = chooseOption(program, state, "b", "pay");
    expect(view.passageId).toBe("c");
    expect(state.money).toBe(700);
    expect(state.clock.minute).toBe(before + 15);
  });

  it("效果结算写进行止记录：文本按银钱显示口径，方向由引擎判定", () => {
    const { state } = at("b");
    const view = chooseOption(program, state, "b", "earn");
    expect(view.passageId).toBe("c");
    expect(state.money).toBe(1500);
    expect(state.stamina.current).toBe(state.stamina.max - 10);
    expect(state.recent.map((r) => r.text)).toEqual(["获得了 1 两 500 文", "体力 -10"]);
    expect(state.recent.map((r) => r.kind)).toEqual(["gain", "loss"]);
  });

  it("没有 next 也没有单元级 next：停在原地，转自由行动", () => {
    const state = createSliceState();
    const solo = parseTwee(join(":: x [scene]", "", "只做一件事。", "", '<<choice id="do" label="做">>', "做完了。", "<</choice>>", ""));
    enterPassage(solo, state, "x");
    const view = chooseOption(solo, state, "x", "do");
    expect(view.passageId).toBe("x");
    expect(state.atFreeActions).toBe(true);
    expect(view.paragraphs[0]).toBe("做完了。");
  });
});

describe("代价与拦阻", () => {
  it("钱不够时选项标出原因，强行选中会抛错", () => {
    const { state } = at("b");
    state.money = 200;
    const passage = passageById(program, "b")!;
    const view = renderPassage(passage, state, program);
    expect(view.options[0]!.blocked).toBe("银钱不足（需 300 文）");
    expect(costSummary(passage.choices[0]!.cost, state)).toBe("花 300 文，银钱不足（需 300 文）");
    expect(() => chooseOption(program, state, "b", "pay")).toThrow(/付不起/);
  });

  it("代价摘要用换算后的口径", () => {
    const { state } = at("b");
    state.money = 1000;
    const pay = passageById(program, "b")!.choices.find((c) => c.id === "pay")!;
    expect(costSummary(pay.cost, state)).toBe("花 300 文");
  });

  it("耗时移到选项名后：time 以刻计，摘要里不再出现", () => {
    const { state } = at("b");
    const view = renderPassage(passageById(program, "b")!, state, program);
    const opt = view.options.find((o) => o.id === "pay")!;
    expect(opt.ke).toBe(1);
    expect(opt.summary).not.toContain("耗时");
    expect(formatKe(opt.ke!)).toBe("一刻");
  });

  it("刻数转时长：一刻、两刻、半个时辰、一个时辰", () => {
    expect(formatKe(1)).toBe("一刻");
    expect(formatKe(2)).toBe("两刻");
    expect(formatKe(3)).toBe("三刻");
    expect(formatKe(4)).toBe("半个时辰");
    expect(formatKe(8)).toBe("一个时辰");
    expect(formatKe(12)).toBe("一个半时辰");
    expect(formatKe(16)).toBe("两个时辰");
    expect(formatKe(11)).toBe("一个时辰零三刻");
  });
});

describe("自由行动与自动前进", () => {
  it("没有选项也没有出口算自由行动", () => {
    const { state } = at("c");
    const view = renderPassage(passageById(program, "c")!, state, program);
    expect(view.options).toHaveLength(0);
    expect(view.atFreeActions).toBe(true);
  });

  it("有出口但没选项：不算自由行动，可以自动前进", () => {
    const state = createSliceState();
    enterPassage(program, state, "d");
    expect(state.atFreeActions).toBe(false);
    const next = followNext(program, state, passageById(program, "d")!);
    expect(next!.passageId).toBe("c");
  });
});

describe("渲染不写状态", () => {
  it("连续渲染同一个单元，状态不变", () => {
    const { state } = at("b");
    state.money = 500;
    const snapshot = JSON.stringify({ money: state.money, clock: state.clock, stamina: state.stamina });
    renderPassage(passageById(program, "b")!, state, program);
    renderPassage(passageById(program, "b")!, state, program);
    expect(JSON.stringify({ money: state.money, clock: state.clock, stamina: state.stamina })).toBe(snapshot);
  });
});

describe("就地结算（stay）与前后变化", () => {
  const STAY = join(
    ":: s [scene]",
    '{"地点":"丙地"}',
    "",
    "屋里很静。",
    "",
    `<<choice id="look" label="细看" stay="true" mark="看过痕" show="!seen('看过痕')">>`,
    "你凑近看，看清了一道旧痕。",
    "<</choice>>",
    `<<choice id="go" label="走" cost="time 2" show="seen('看过痕')">>`,
    "你走了。",
    "<<next t>>",
    "<</choice>>",
    "",
    ":: t [scene]",
    "",
    "到了。",
    "",
  );
  const stayProgram = parseTwee(STAY);

  it("要看过才出现的选项，没看过时不在选项里", () => {
    const state = createSliceState();
    const view = enterPassage(stayProgram, state, "s");
    expect(view.options.map((o) => o.id)).toEqual(["look"]);
  });

  it("就地结算：不换单元、不动时间与资源，结算文走 appended，选项换成看过之后的那批", () => {
    const state = createSliceState();
    enterPassage(stayProgram, state, "s");
    const before = { minute: state.clock.minute, money: state.money, stamina: state.stamina.current };
    const view = chooseOption(stayProgram, state, "s", "look");
    expect(view.passageId).toBe("s");
    expect(view.appended).toEqual(["你凑近看，看清了一道旧痕。"]);
    expect(view.options.map((o) => o.id)).toEqual(["go"]);
    expect(state.clock.minute).toBe(before.minute);
    expect(state.money).toBe(before.money);
    expect(state.stamina.current).toBe(before.stamina);
  });

  it("就地结算不把状态打成自由行动，也不写行止记录", () => {
    const state = createSliceState();
    enterPassage(stayProgram, state, "s");
    chooseOption(stayProgram, state, "s", "look");
    expect(state.atFreeActions).toBe(false);
    expect(state.recent).toEqual([]);
  });

  it("mark 写进 visited，seen() 读得到", () => {
    const state = createSliceState();
    enterPassage(stayProgram, state, "s");
    expect(evalExpr(parseExpr("seen('看过痕')", 1).expr!, state)).toBe(false);
    chooseOption(stayProgram, state, "s", "look");
    expect(state.visited["看过痕"]).toBe(true);
    expect(evalExpr(parseExpr("seen('看过痕')", 1).expr!, state)).toBe(true);
  });

  it("看完照常走下去：普通选项不带 appended，时间照推", () => {
    const state = createSliceState();
    enterPassage(stayProgram, state, "s");
    chooseOption(stayProgram, state, "s", "look");
    const before = state.clock.minute;
    const view = chooseOption(stayProgram, state, "s", "go");
    expect(view.passageId).toBe("t");
    expect(view.appended).toBeUndefined();
    expect(state.clock.minute).toBe(before + 30);
  });

  it("条件不成立的选项强行选中会抛错", () => {
    const state = createSliceState();
    enterPassage(stayProgram, state, "s");
    expect(() => chooseOption(stayProgram, state, "s", "go")).toThrow(/不出现/);
  });
});

describe("出行选项", () => {
  const PLACES = join(
    ":: a [scene]",
    "",
    "路口。",
    "",
    `<<choice id="look" label="看看" stay="true">>`,
    "看了一眼。",
    "<</choice>>",
    `<<choice id="go" label="前往 b 地" exit="true">>`,
    "<<next b>>",
    "<</choice>>",
    "",
    ":: b [scene]",
    "",
    "到了。",
    "",
  );
  const places = parseTwee(PLACES);

  it("exit 标记跟着选项交到视图里，本地行动不带", () => {
    const state = createSliceState();
    const view = enterPassage(places, state, "a");
    expect(view.options.map((o) => [o.id, o.exit])).toEqual([
      ["look", undefined],
      ["go", true],
    ]);
  });

  it("出行选了照常换地点", () => {
    const state = createSliceState();
    enterPassage(places, state, "a");
    const view = chooseOption(places, state, "a", "go");
    expect(view.passageId).toBe("b");
  });
});

describe("正文条件分支", () => {
  const BRANCHES = join(
    ":: a [scene]",
    "",
    "<<if money > 0>>",
    "有钱。",
    "<<else>>",
    "<<if stamina > 0>>",
    "有力气。",
    "<<else>>",
    "两样都没有。",
    "<</if>>",
    "<</if>>",
    "",
  );
  const branches = parseTwee(BRANCHES);

  it("嵌套分支按状态只出一支", () => {
    const rich = createSliceState();
    rich.money = 10;
    expect(enterPassage(branches, rich, "a").paragraphs).toEqual(["有钱。"]);

    const strong = createSliceState();
    expect(enterPassage(branches, strong, "a").paragraphs).toEqual(["有力气。"]);

    const broke = createSliceState();
    broke.stamina.current = 0;
    expect(enterPassage(branches, broke, "a").paragraphs).toEqual(["两样都没有。"]);
  });
});

describe("结果屏回程", () => {
  const RESULT = join(
    ":: a [scene]",
    "",
    "地点页。",
    "",
    `<<choice id="go" label="做" mark="做了">>`,
    "<<next a.结果>>",
    "<</choice>>",
    "",
    ":: a.结果 [scene result]",
    `{"返回":"看完了"}`,
    "",
    "结果正文。",
    "",
  );
  const result = parseTwee(RESULT);

  it("结果屏没有选项，只有一条「继续」，文案来自 meta.返回", () => {
    const state = createSliceState();
    const view = chooseOption(result, state, "a", "go");
    expect(view.passageId).toBe("a.结果");
    expect(view.paragraphs).toEqual(["结果正文。"]);
    expect(view.options).toEqual([]);
    expect(view.nextLabel).toBe("看完了");
    expect(view.atFreeActions).toBe(false);
  });

  it("顺着 next 走就回到父单元，标记留着", () => {
    const state = createSliceState();
    chooseOption(result, state, "a", "go");
    const back = followNext(result, state, passageById(result, "a.结果")!);
    expect(back!.passageId).toBe("a");
    expect(state.visited["做了"]).toBe(true);
  });
});

describe("历法", () => {
  it("第 N 日换算成 年 / 月 / 日", () => {
    expect(dateOf(1)).toEqual({ year: 1, month: 1, day: 1 });
    expect(dateOf(30)).toEqual({ year: 1, month: 1, day: 30 });
    expect(dateOf(31)).toEqual({ year: 1, month: 2, day: 1 });
    expect(dateOf(360)).toEqual({ year: 1, month: 12, day: 30 });
    expect(dateOf(361)).toEqual({ year: 2, month: 1, day: 1 });
  });

  it("起点是第 1 日，也就是 1 年 1 月 1 日", () => {
    const state = createSliceState();
    expect(state.clock.day).toBe(1);
    expect(dateOf(state.clock.day).year).toBe(1);
  });
});

describe("银钱显示口径", () => {
  it("一两 = 一千文，换算只在显示层", () => {
    expect(formatMoney(0)).toBe("0 文");
    expect(formatMoney(300)).toBe("300 文");
    expect(formatMoney(1000)).toBe("1 两");
    expect(formatMoney(1500)).toBe("1 两 500 文");
    expect(formatMoney(-300)).toBe("-300 文");
  });
});

describe("表达式求值", () => {
  it("读状态：银钱、时辰、体力上限", () => {
    const { state } = at("a");
    state.money = 120;
    expect(evalExpr(parseExpr("money", 1).expr!, state)).toBe(120);
    expect(evalExpr(parseExpr("hour", 1).expr!, state)).toBe(7);
    expect(evalExpr(parseExpr("stamina.max", 1).expr!, state)).toBe(100);
  });

  it("比较与逻辑组合", () => {
    const { state } = at("a");
    state.money = 120;
    expect(evalExpr(parseExpr("money >= 100 && stamina > 0", 1).expr!, state)).toBe(true);
    expect(evalExpr(parseExpr("money < 100 || !true", 1).expr!, state)).toBe(false);
  });
});

describe("时间按刻记", () => {
  it("time 1 即一刻：时钟走 15 分钟", () => {
    const { state } = at("b");
    const before = state.clock.minute;
    chooseOption(program, state, "b", "earn"); // cost="time 1"
    expect(state.clock.minute - before).toBe(15);
    expect(keToMinutes(1)).toBe(15);
    expect(keToMinutes(2)).toBe(30);
  });

  it("time 1 与代价摘要里的刻数一致", () => {
    const { state } = at("b");
    state.money = 1000;
    const before = state.clock.minute;
    chooseOption(program, state, "b", "pay"); // cost="time 1, money 300"
    expect(state.clock.minute - before).toBe(15);
  });
});

describe("行止记录与资源上限", () => {
  /**
   * 夹具：一个选项得失都有且带 next（落到结果单元，回程按 id 点分父级）；
   * 另一个选项只回体力，用来试上限夹取。
   */
  const MIXED = join(
    ":: g [scene]",
    "",
    "柜台前。",
    "",
    '<<choice id="trade" label="当了它" cost="time 1">>',
    '<<eff item("剑") -1, money +1000, item("当票") +1>>',
    "<<next g.已当>>",
    "<</choice>>",
    '<<choice id="rest" label="歇一会">>',
    "<<eff stamina +40>>",
    "<</choice>>",
    "",
    ":: g.已当 [scene result]",
    '{"返回":"收好"}',
    "",
    "当完了。",
    "",
  );
  const mixed = parseTwee(MIXED);

  it("得失并作一行：带 next 落到结果单元也走合并", () => {
    const state = createSliceState();
    state.items["剑"] = 1;
    enterPassage(mixed, state, "g");
    const view = chooseOption(mixed, state, "g", "trade");
    expect(view.passageId).toBe("g.已当");
    expect(state.money).toBe(1000);
    expect(state.recent.map((r) => r.text)).toEqual(["失去了剑，获得了 1 两银两、当票"]);
    expect(state.recent[0]!.parts!.map((p) => p.kind)).toEqual(["loss", "note", "gain"]);
  });

  it("资源回满夹在上限：多回的部分不要", () => {
    const state = createSliceState();
    state.stamina.current = 80;
    enterPassage(mixed, state, "g");
    chooseOption(mixed, state, "g", "rest");
    expect(state.stamina.current).toBe(100);
    expect(state.recent.map((r) => r.text)).toEqual(["体力 +40"]);
  });
});
