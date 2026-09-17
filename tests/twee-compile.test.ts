/**
 * Twee 编译器最小内核的测试（对应 #20 本批：只覆盖最短路径需要的子集）。
 */
import { describe, expect, it } from "vitest";
import { compileTweeDir } from "../src/vite/twee-plugin";
import { parseTwee } from "../src/twee/parse";
import { parseExpr, describeExpr } from "../src/twee/expr";
import { emitModule, toPlain, summarize } from "../src/twee/emit";
import type { Diagnostic } from "../src/twee/types";

const errs = (diags: Diagnostic[]) => diags.filter((d) => d.level === "error").map((d) => d.code);
const warns = (diags: Diagnostic[]) => diags.filter((d) => d.level === "warning").map((d) => d.code);
const join = (...lines: string[]) => lines.join("\n");

describe("passage 头部", () => {
  it("名 + 标签 + 紧跟一行的纯字面量元数据", () => {
    const p = parseTwee(join(":: 场景.门口 [scene start]", '{"weight": 6, "once": true}', "门外起风了。", ""));
    expect(errs(p.diagnostics)).toEqual([]);
    const ps = p.passages[0]!;
    expect(ps.id).toBe("场景.门口");
    expect(ps.tags).toEqual(["scene", "start"]);
    expect(ps.meta).toEqual({ weight: 6, once: true });
  });

  it("头部行只写 id 与标签；多余的尾巴报错", () => {
    const p = parseTwee(join(":: a [scene] 多余的东西", "正文", ""));
    expect(errs(p.diagnostics)).toContain("header-tail");
  });

  it("元数据只认调度键，别的键报错", () => {
    const p = parseTwee(join(":: a", '{"type": "consequence"}', "正文", ""));
    expect(errs(p.diagnostics)).toContain("meta-key");
  });

  it("元数据类型不对报错", () => {
    const p = parseTwee(join(":: a", '{"weight": "6"}', "正文", ""));
    expect(errs(p.diagnostics)).toContain("meta-type");
  });

  it("元数据不是合法 JSON 报错", () => {
    const p = parseTwee(join(":: a", '{"weight": }', "正文", ""));
    expect(errs(p.diagnostics)).toContain("meta-json");
  });

  it("单元 id 重复报错并指出第一次出现的位置", () => {
    const p = parseTwee(join(":: a", "甲", "", ":: a", "乙", ""));
    expect(p.diagnostics.find((d) => d.code === "passage-dup")?.message).toContain("另见第 1 行");
  });
});

const SRC = join(
  ":: a [scene]",
  '<<choice id="help" label="上前搭手" cost="time 2">>',
  "  你上前搭手。",
  "<<eff money +6, stamina -10>>",
  "<<next b>>",
  "<</choice>>",
  '<<choice id="go" label="径直上路">>',
  "  你没停脚。",
  "<<next b>>",
  "<</choice>>",
  "",
  ":: b [scene]",
  "到了。",
  "",
);

describe("选项与后续", () => {
  it("解析出两个选项：代价、效果、后续都在", () => {
    const p = parseTwee(SRC);
    expect(errs(p.diagnostics)).toEqual([]);
    const ps = p.passages[0]!;
    expect(ps.choices.map((c) => c.id)).toEqual(["help", "go"]);
    const help = ps.choices[0]!;
    expect(help.label).toBe("上前搭手");
    expect(help.cost?.time).toEqual({ kind: "literal", value: 2, pos: { line: 2 } });
    expect(help.next).toBe("b");
    expect(help.blocks).toContainEqual({
      k: "effect",
      effects: [
        { target: "money", delta: { kind: "literal", value: 6, pos: { line: 4 } }, pos: { line: 4 } },
        { target: "stamina", delta: { kind: "literal", value: -10, pos: { line: 4 } }, pos: { line: 4 } },
      ],
    });
  });

  it("选项正文里不该混进宏文本", () => {
    const p = parseTwee(SRC);
    expect(JSON.stringify(p.passages[0]!.choices[0]!.blocks)).not.toContain("next");
  });

  it("量的字面量写 0 给 warning（没有作用）", () => {
    const p = parseTwee(join(":: a", '<<choice id="x" label="甲" cost="time 2">>', "<<eff money +0>>", "<</choice>>", ""));
    expect(warns(p.diagnostics)).toContain("eff-zero");
  });

  it("选项 id 在同一单元里重复报错", () => {
    const p = parseTwee(join(":: a", '<<choice id="x" label="甲">>', "甲", "<</choice>>", '<<choice id="x" label="乙">>', "乙", "<</choice>>", ""));
    expect(errs(p.diagnostics)).toContain("choice-dup");
  });

  it("指向不存在的单元报错", () => {
    const p = parseTwee(join(":: a", '<<choice id="x" label="甲">>', "<<next 没这个单元>>", "<</choice>>", ""));
    expect(errs(p.diagnostics)).toContain("next-missing");
  });
});

describe("就地结算（stay）", () => {
  it('stay="true" 解析成就地结算', () => {
    const p = parseTwee(
      join(":: a [scene]", "", "正文。", "", '<<choice id="look" label="细看" stay="true">>', "看清了。", "<</choice>>", '<<choice id="go" label="走">>', "走了。", "<</choice>>", ""),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    expect(p.passages[0]!.choices[0]!.stay).toBe(true);
    expect(p.passages[0]!.choices[1]!.stay).toBeUndefined();
  });

  it("stay 只认 true，别的值报错", () => {
    const p = parseTwee(join(":: a [scene]", '<<choice id="x" label="甲" stay="yes">>', "甲", "<</choice>>", ""));
    expect(errs(p.diagnostics)).toContain("choice-attr");
  });

  it("就地结算的选项不能再写 <<next>>", () => {
    const p = parseTwee(
      join(":: a [scene]", '<<choice id="x" label="甲" stay="true">>', "甲", "<<next b>>", "<</choice>>", "", ":: b [scene]", "乙", ""),
    );
    expect(errs(p.diagnostics)).toContain("stay-next");
  });

  it("选项全是 stay 时单元级 <<next>> 走不到，给 warning", () => {
    const p = parseTwee(
      join(":: a [scene]", "", '<<choice id="x" label="甲" stay="true">>', "甲", "<</choice>>", "<<next b>>", "", ":: b [scene]", "乙", ""),
    );
    expect(warns(p.diagnostics)).toContain("stay-next");
  });

  it("show= 与 mark= 解析：出现条件与看过的名字", () => {
    const p = parseTwee(
      join(":: a [scene]", `<<choice id="x" label="甲" stay="true" mark="看过甲" show="!seen('看过甲')">>`, "甲", "<</choice>>", ""),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    const c = p.passages[0]!.choices[0]!;
    expect(c.stay).toBe(true);
    expect(c.mark).toBe("看过甲");
    expect(describeExpr(c.show!)).toContain("看过甲");
  });

  it("mark 名不合形报错", () => {
    const p = parseTwee(join(":: a [scene]", '<<choice id="x" label="甲" mark="看过 甲">>', "甲", "<</choice>>", ""));
    expect(errs(p.diagnostics)).toContain("mark-form");
  });
});

describe("出行（地点）", () => {
  it('exit="true" 解析成出行', () => {
    const p = parseTwee(
      join(":: a [scene]", '<<choice id="go" label="前往当铺" exit="true" cost="time 1">>', "<<next b>>", "<</choice>>", "", ":: b [scene]", "乙", ""),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    const c = p.passages[0]!.choices[0]!;
    expect(c.exit).toBe(true);
    expect(c.next).toBe("b");
  });

  it("出行必须自己写出处，没有 <<next>> 报错", () => {
    const p = parseTwee(join(":: a [scene]", '<<choice id="go" label="前往当铺" exit="true">>', "走。", "<</choice>>", ""));
    expect(errs(p.diagnostics)).toContain("exit-next");
  });

  it("exit 只认 true", () => {
    const p = parseTwee(join(":: a [scene]", '<<choice id="go" label="前往当铺" exit="yes">>', "走。", "<<next b>>", "<</choice>>", "", ":: b [scene]", "乙", ""));
    expect(errs(p.diagnostics)).toContain("choice-attr");
  });

  it("出行文案不写「前往 + 地点名」给 warning", () => {
    const p = parseTwee(join(":: a [scene]", '<<choice id="go" label="出门，往县城去" exit="true">>', "<<next b>>", "<</choice>>", "", ":: b [scene]", "乙", ""));
    expect(warns(p.diagnostics)).toContain("exit-label");
  });

  it("写成「前往 + 地点名」就没有该 warning", () => {
    const p = parseTwee(join(":: a [scene]", '<<choice id="go" label="前往当铺" exit="true">>', "<<next b>>", "<</choice>>", "", ":: b [scene]", "乙", ""));
    expect(warns(p.diagnostics)).not.toContain("exit-label");
  });
});

describe("结果屏（result）", () => {
  it("[result] 单元按点分父级自动接上返回，文案走 meta.返回", () => {
    const p = parseTwee(
      join(":: 地点.当铺 [scene]", "", "柜台。", "", ":: 地点.当铺.已当 [scene result]", '{"返回":"收好当票"}', "", "当完了。", ""),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    const back = p.passages[1]!;
    expect(back.next).toBe("地点.当铺");
    expect(back.meta.返回).toBe("收好当票");
  });

  it("不写 meta.返回 也能回父级，按钮文案交给 UI 兜底", () => {
    const p = parseTwee(join(":: 地点.家门外 [scene]", "", "家里。", "", ":: 地点.家门外.看剑 [scene result]", "", "剑挂在那儿。", ""));
    expect(errs(p.diagnostics)).toEqual([]);
    expect(p.passages[1]!.next).toBe("地点.家门外");
    expect(p.passages[1]!.meta.返回).toBeUndefined();
  });

  it("[result] 的 id 没有点分父级报错", () => {
    const p = parseTwee(join(":: 孤单的结果屏 [scene result]", "", "看完了。", ""));
    expect(errs(p.diagnostics)).toContain("result-parent");
  });

  it("结果屏自己写了 <<next>> 时以自己为准", () => {
    const p = parseTwee(
      join(":: a [scene]", "", "甲。", "", ":: a.结果 [scene result]", "", "看完了。", "<<next b>>", "", ":: b [scene]", "", "乙。", ""),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    expect(p.passages[1]!.next).toBe("b");
  });
});

describe("正文插值与条件块", () => {
  it("插值切出独立片段", () => {
    const p = parseTwee(join(":: a", "你身上还有 <<= money >> 文。", ""));
    expect(errs(p.diagnostics)).toEqual([]);
    const block = p.passages[0]!.blocks[0]!;
    if (block.k !== "text") throw new Error("应为正文块");
    expect(block.chunks).toEqual(["你身上还有", { k: "interp", expr: { k: "dotted", path: ["money"], pos: { line: 2 } } }, " 文。"]);
  });

  it("条件块解析出两个分支", () => {
    const p = parseTwee(join(":: a", "<<if money >= 100>>", "手头宽裕。", "<<else>>", "捉襟见肘。", "<</if>>", ""));
    expect(errs(p.diagnostics)).toEqual([]);
    const block = p.passages[0]!.blocks[0]!;
    if (block.k !== "if") throw new Error("应为条件块");
    expect(block.branches).toHaveLength(1);
    expect(block.elseBody).not.toBeNull();
  });

  it("嵌套条件块：内层的 <<else>> 与 <</if>> 不被外层抢走", () => {
    const p = parseTwee(
      join(
        ":: a",
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
      ),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    const outer = p.passages[0]!.blocks[0]!;
    if (outer.k !== "if") throw new Error("应为条件块");
    expect(outer.elseBody?.[0]?.k).toBe("if");
  });

  it("档位块解析", () => {
    const p = parseTwee(
      join(":: a", '<<choice id="c" label="试" check="拳脚 45">>', "<<band 成功>>", "成了。", "<</band>>", "<<band 失败>>", "没成。", "<</band>>", "<</choice>>", ""),
    );
    expect(errs(p.diagnostics)).toEqual([]);
    expect(p.passages[0]!.choices[0]!.blocks.filter((b) => b.k === "band")).toHaveLength(2);
  });
});

describe("校验门（error）", () => {
  const cases: [string, string, string][] = [
    ["宏没闭合", join(":: a", '<<choice id="x" label="甲">>', "正文", ""), "macro-unclosed"],
    ["<<if>> 没闭合", join(":: a", "<<if money > 0>>", "正文", ""), "macro-unclosed"],
    ["效果目标不在词表", join(":: a", '<<choice id="x" label="甲">>', "<<eff 内力修为 +10>>", "<</choice>>", ""), "eff-target"],
    ["效果条目带算术", join(":: a", '<<choice id="x" label="甲">>', "<<eff money +money*2>>", "<</choice>>", ""), "amount-form"],
    ["效果条目写成关键词", join(":: a", '<<choice id="x" label="甲">>', "<<eff money +6, word 2>>", "<</choice>>", ""), "eff-target"],
    ["代价键不在可支付子集", join(":: a", '<<choice id="x" label="甲" cost="hp 5">>', "甲", "<</choice>>", ""), "cost-key"],
    ["表达式里出现算术", join(":: a", "<<if money + 1 > 2>>", "正文", "<</if>>", ""), "expr-trailing"],
    ["表达式里出现三目", join(":: a", '<<choice id="x" label="甲" if="money > 0 ? true : false">>', "甲", "<</choice>>", ""), "expr-trailing"],
    ["不认识的宏", join(":: a", '<<foobar x="1">>', "正文", ""), "macro-unknown"],
    ["未实现的宏", join(":: a", '<<bind slot="thug" from="cast">>', "正文", ""), "macro-unsupported"],
    ["宏和正文混排", join(":: a", '<<choice id="x" label="甲">>甲<</choice>>', ""), "macro-inline"],
    ["选项不能嵌套", join(":: a", '<<choice id="x" label="甲">>', '<<choice id="y" label="乙">>', "乙", "<</choice>>", "<</choice>>", ""), "choice-nested"],
    ["choice 不认识的参数", join(":: a", '<<choice id="x" label="甲" weight="3">>', "甲", "<</choice>>", ""), "choice-attr"],
    ["检定写法不对", join(":: a", '<<choice id="x" label="甲" check="拳脚">>', "甲", "<</choice>>", ""), "check-form"],
    ["passage 级 next 缺失目标", join(":: a", "正文", "<<next 不存在>>", ""), "next-missing"],
    ["物品效果条目写法不对", join(":: a", '<<choice id="x" label="甲">>', '<<eff item("药包")>>', "<</choice>>", ""), "amount-form"],
    ["物品谓词写进效果目标位", join(":: a", '<<choice id="x" label="甲">>', '<<eff item +1>>', "<</choice>>", ""), "eff-target"],
  ];

  it.each(cases)("%s", (_name, src, code) => {
    expect(errs(parseTwee(src).diagnostics)).toContain(code);
  });
});

describe("受限表达式", () => {
  it("点分名、比较、&& 组合", () => {
    const { expr, diagnostics } = parseExpr("mother.arrears >= 300 && !job.escortSigned", 1);
    expect(diagnostics).toEqual([]);
    expect(describeExpr(expr!)).toBe("mother.arrears >= 300 && !job.escortSigned");
  });

  it("具名调用", () => {
    const { expr, diagnostics } = parseExpr('at("牙市") || rel("周管事") >= 3', 1);
    expect(diagnostics).toEqual([]);
    expect(describeExpr(expr!)).toContain('at("牙市") || rel("周管事") >= 3');
  });

  it("算术被拒", () => {
    expect(errs(parseExpr("money + 2", 1).diagnostics)).toContain("expr-trailing");
  });

  it("三目被拒", () => {
    expect(errs(parseExpr("money > 0 ? 1 : 2", 1).diagnostics)).toContain("expr-trailing");
  });

  it("字符串没有闭合报错", () => {
    expect(errs(parseExpr('at("牙市)', 1).diagnostics)).toContain("expr-string");
  });
});

describe("发射产物", () => {
  it("emitModule 对同一 IR 幂等", () => {
    const p = parseTwee(SRC);
    expect(emitModule(p)).toBe(emitModule(p));
  });

  it("toPlain 保留选项里的效果块", () => {
    const plain = toPlain(parseTwee(SRC));
    // 效果条目挂在选项上，跟着选项一起发射
    expect(plain.passages[0]!.choices[0]!.blocks.some((b) => b.k === "effect")).toBe(true);
  });

  it("summarize 报单元数、选项数与诊断计数", () => {
    expect(summarize(parseTwee(SRC))).toContain("2 个单元、2 个选项");
  });
});

describe("耗时以刻计", () => {
  it("time 1 合法：一刻", () => {
    const p = parseTwee(join(":: a", '<<choice id="x" label="走" cost="time 1">>', "<</choice>>", ""));
    expect(errs(p.diagnostics)).toEqual([]);
    expect(p.passages[0]!.choices[0]!.cost?.time).toEqual({ kind: "literal", value: 1, pos: { line: 2 } });
  });

  it("整刻多写几刻都合法：time 5 是五刻", () => {
    const p = parseTwee(join(":: a", '<<choice id="x" label="走" cost="time 5">>', "<</choice>>", ""));
    expect(errs(p.diagnostics)).toEqual([]);
  });

  it("0 与小数刻报错", () => {
    for (const bad of ["0", "0.5"]) {
      const p = parseTwee(join(":: a", `<<choice id="x" label="走" cost="time ${bad}">>`, "<</choice>>", ""));
      expect(errs(p.diagnostics)).toContain("cost-time-ke");
    }
  });

  it("真实内容目录过校验门，无 error", () => {
    const r = compileTweeDir("src/content/twee");
    expect(r.errors).toEqual([]);
  });
});
