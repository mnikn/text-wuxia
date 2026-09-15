/** 票据 23 原型核心的无头校核（一次性丢弃物）：抽出 <script id="core"> 在 node 里跑不变量断言。
 *  用法：node planning/wayfinder-content-rewrite/prototypes/combat-martial-core-check.mjs planning/wayfinder-content-rewrite/prototypes/combat-martial-playground.html */

import fs from "node:fs";

const path = process.argv[2];
const html = fs.readFileSync(path, "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) throw new Error("未找到 core 脚本块");
const M = new Function(m[1] + "\nreturn globalThis.Martial;")();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`  ✗ ${name}  ← FAIL ${extra || ""}`); }
};
const h = (n) => `${Math.round(n)}h（约 ${(n / 16).toFixed(1)} 个白天）`;

console.log("\n【1】曲线经验表");
ok("1–20/21–40/100 关口取值正确",
  M.reqFor(1, "平稳") === 8 && M.reqFor(20, "平稳") === 8 && M.reqFor(21, "平稳") === 14 && M.reqFor(100, "平稳") === 150);
ok("每级需求为正且 100 级是关口", [1, 50, 99, 100].every((l) => Object.keys(M.CURVES).every((c) => M.reqFor(l, c) > 0)));
const to30 = Object.keys(M.CURVES).map((c) => M.xpTo(30, c));
const to80 = Object.keys(M.CURVES).map((c) => M.xpTo(80, c));
const to100 = Object.keys(M.CURVES).map((c) => M.xpTo(100, c));
console.log(`    累计经验 → 30 级: ${JSON.stringify(Object.fromEntries(Object.keys(M.CURVES).map((c) => [c, M.xpTo(30, c)])))}`);
console.log(`    累计经验 → 100 级: ${JSON.stringify(Object.fromEntries(Object.keys(M.CURVES).map((c) => [c, M.xpTo(100, c)])))}`);
ok("到 30 级：易学难精 < 平稳 < 艰深", M.xpTo(30, "易学难精") < M.xpTo(30, "平稳") && M.xpTo(30, "平稳") < M.xpTo(30, "艰深"));
ok("到 80 级：易学难精 < 平稳 < 艰深", M.xpTo(80, "易学难精") < M.xpTo(80, "平稳") && M.xpTo(80, "平稳") < M.xpTo(80, "艰深"));
ok("末段（81–99）艰深 < 易学难精（大器晚成）", M.reqFor(90, "艰深") < M.reqFor(90, "易学难精"));
ok("总成本 平稳最低", M.xpTo(100, "平稳") < M.xpTo(100, "艰深") && M.xpTo(100, "平稳") < M.xpTo(100, "易学难精"));
ok("xpTo 单调递增", [30, 55, 80, 100].every((l, i, a) => i === 0 || M.xpTo(l, "平稳") > M.xpTo(a[i - 1], "平稳")));

console.log("\n【2】境界与基本功加成");
ok("境界阈值 0/10/30/55/80/100 对位",
  M.realmOf(0) === "未入门" && M.realmOf(9) === "未入门" && M.realmOf(10) === "初窥" && M.realmOf(29) === "初窥" &&
  M.realmOf(30) === "小成" && M.realmOf(54) === "小成" && M.realmOf(55) === "熟练" && M.realmOf(79) === "熟练" &&
  M.realmOf(80) === "精通" && M.realmOf(99) === "精通" && M.realmOf(100) === "化境");
ok("基本功加成 0/50/99/100 = 0/5/19/40", M.basicBonus(0) === 0 && M.basicBonus(50) === 5 && M.basicBonus(99) === 19 && M.basicBonus(100) === 40);
ok("基本功 99→100 断崖（+21）", M.basicBonus(100) - M.basicBonus(99) === 21);
const c60 = M.newChar();
c60.arts["dao.cangyan"] = { level: 60, xp: 0 };
c60.basics["刀法"] = { level: 99, xp: 0 };
const at99 = M.realOf(c60, "dao.cangyan");
c60.basics["刀法"] = { level: 100, xp: 0 };
const at100 = M.realOf(c60, "dao.cangyan");
ok("具体 60 + 基本功 99/100 → 79/100", at99 === 79 && at100 === 100, `实测 ${at99} / ${at100}`);
ok("实际武学值封顶 100", M.realOf(c60, "dao.cangyan") <= 100);

console.log("\n【3】低天赋可成长");
for (const ins of [1, 5, 10]) {
  const c = M.newChar();
  c.talents = { str: 6, agi: 5, ins, con: 8, luk: 5 };
  const r = M.sessionsToReal(c, "dao.cangyan", 55);
  console.log(`    悟性 ${ins}（×${M.insightMult(ins)}）→ 实际武学值 55：${r.sessions} 段 = ${h(r.hours)}（具体 ${r.level}、基本功 ${r.basic}）`);
  ok(`悟性 ${ins} 能到实际 55 且未触顶（低天赋可成长）`, r.real >= 55 && !r.capped);
}
const dull = M.newChar();
dull.talents = { str: 6, agi: 5, ins: 1, con: 8, luk: 5 };
const dullBasicHours = M.hoursToBasic(dull, "刀法", 100);
console.log(`    悟性 1 专项把基本功刷到 100：${h(dullBasicHours)}；此后具体 60 即实际 100`);
const dull60 = M.newChar();
dull60.talents = { str: 6, agi: 5, ins: 1, con: 8, luk: 5 };
dull60.arts["dao.cangyan"] = { level: 60, xp: 0 };
dull60.basics["刀法"] = { level: 100, xp: 0 };
ok("悟性 1 + 基本功 100 也能拿实际 100（低天赋封顶）", M.realOf(dull60, "dao.cangyan") === 100);
ok("基本功专项不吃悟性（悟性 1 与 10 用时相同）",
  Math.abs(M.hoursToBasic(dull, "刀法", 100) - (() => { const b = M.newChar(); b.talents = { str: 6, agi: 5, ins: 10, con: 8, luk: 5 }; return M.hoursToBasic(b, "刀法", 100); })()) < 0.001);

console.log("\n【4】检定档带与命中率");
ok("同身手 → 命中率 50%", M.hitRate(50, 50, M.TUNE) === 50);
ok("命中率上下限夹住", M.hitRate(999, 0, M.TUNE) === M.TUNE.hitClamp[1] && M.hitRate(0, 999, M.TUNE) === M.TUNE.hitClamp[0]);
const probs = M.bandProbs(0, M.TUNE);
const psum = probs["大成功"] + probs["成功"] + probs["失败"] + probs["大失败"];
ok("四档概率和 = 1", Math.abs(psum - 1) < 1e-9, `= ${psum.toFixed(4)}`);
console.log(`    同身手四档（±${M.TUNE.bandGreat}）：` + Object.entries(probs).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(" / "));
// 蒙特卡洛校核
const rng = M.mulberry32(42);
const cnt = { 大成功: 0, 成功: 0, 失败: 0, 大失败: 0 };
const N = 40000;
for (let i = 0; i < N; i++) cnt[M.rollBand(rng, 50, 50, M.TUNE).band] += 1;
const worst = Math.max(...Object.keys(cnt).map((k) => Math.abs(cnt[k] / N - probs[k])));
ok("蒙特卡洛与解析概率一致（Δ<1.5%）", worst < 0.015, `最大偏差 ${(worst * 100).toFixed(2)}%`);
// ±20 与 ±30 的对比
const p20 = M.bandProbs(0, Object.assign({}, M.TUNE, { bandGreat: 20, bandFail: -20 }));
console.log(`    同身手四档（±20 全局缺省）：` + Object.entries(p20).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(" / "));

console.log("\n【5】招式与门槛");
const gate = M.newChar();
gate.arts["dao.cangyan"] = { level: 20, xp: 0 };
gate.mainArt = "dao.cangyan";
let f = M.attachMoveGates(M.startFight(gate, "po", 1), gate);
ok("具体 20 级时「小成」招式被境界拦住", M.moveCheck(f, f.p.moves[0]).ok === false && /境界/.test(M.moveCheck(f, f.p.moves[0]).why));
gate.arts["dao.cangyan"] = { level: 30, xp: 0 };
f = M.attachMoveGates(M.startFight(gate, "po", 1), gate);
ok("具体 30 级（小成）时第一档招式可用", M.moveCheck(f, f.p.moves[0]).ok === true);
const nei = M.newChar();
nei.talents = { str: 5, agi: 5, ins: 5, con: 3, luk: 7 };
nei.mainArt = "nei.xuanyin";
ok("根骨 3 练玄阴真炁被门槛拦住", M.trainSession(nei, "nei.xuanyin", {}).blocked !== undefined);
nei.talents.con = 6;
ok("根骨 6 可练玄阴真炁", M.trainSession(nei, "nei.xuanyin", {}).blocked === undefined);

console.log("\n【5b】境界基准开关");
const b1 = M.newChar();
b1.arts["dao.cangyan"] = { level: 40, xp: 0 };
b1.basics["刀法"] = { level: 100, xp: 0 };   // 实际 40+40 = 80
M.TUNE.realmBasis = "art";
const byArt = M.realmOfArt(b1, "dao.cangyan");
M.TUNE.realmBasis = "real";
const byReal = M.realmOfArt(b1, "dao.cangyan");
const b2 = M.newChar();
b2.arts["dao.cangyan"] = { level: 60, xp: 0 };
b2.basics["刀法"] = { level: 100, xp: 0 };   // 实际 100
const byReal60 = (M.TUNE.realmBasis = "real", M.realmOfArt(b2, "dao.cangyan"));
M.TUNE.realmBasis = "art";
ok("同一角色：按具体武学 → 小成；按实际值 → 精通", byArt === "小成" && byReal === "精通", `实测 ${byArt} / ${byReal}`);
ok("具体 60＋基本功 100：按实际值 → 化境，按具体武学 → 熟练", byReal60 === "化境" && M.realmOfArt(b2, "dao.cangyan") === "熟练", `实测 ${byReal60} / ${M.realmOfArt(b2, "dao.cangyan")}`);
const unl = M.newChar();
unl.mainArt = "dao.cangyan";
unl.arts["dao.cangyan"] = { level: 30, xp: 0 };
let fu = M.attachMoveGates(M.startFight(unl, "po", 1), unl);
ok("具体 30 → 只解锁第 1 档招式", M.moveCheck(fu, fu.p.moves[0]).ok === true && M.moveCheck(fu, fu.p.moves[1]).ok === false);
unl.arts["dao.cangyan"] = { level: 55, xp: 0 };
fu = M.attachMoveGates(M.startFight(unl, "po", 1), unl);
ok("具体 55 → 解锁第 2 档", M.moveCheck(fu, fu.p.moves[1]).ok === true && M.moveCheck(fu, fu.p.moves[2]).ok === false);
unl.arts["dao.cangyan"] = { level: 80, xp: 0 };
fu = M.attachMoveGates(M.startFight(unl, "po", 1), unl);
ok("具体 80 → 三档全开", fu.p.moves.every((m) => M.moveCheck(fu, m).ok === true));
const poor = M.newChar();
poor.talents = { str: 5, agi: 5, ins: 5, con: 1, luk: 9 };
poor.mainArt = "dao.cangyan";
poor.arts["dao.cangyan"] = { level: 80, xp: 0 };
poor.basics["刀法"] = { level: 80, xp: 0 };
const fp = M.attachMoveGates(M.startFight(poor, "po", 1), poor);
ok("根骨 1 内力不足 → 高内力招式禁用示因", M.moveCheck(fp, fp.p.moves[2]).ok === false && /内力/.test(M.moveCheck(fp, fp.p.moves[2]).why), M.moveCheck(fp, fp.p.moves[2]).why);

console.log("\n【5c】贯通（基本功 100）");
const pk = M.newChar();
pk.mainArt = "dao.cangyan";
pk.arts["dao.cangyan"] = { level: 55, xp: 0 };
pk.basics["刀法"] = { level: 100, xp: 0 };
const fNo = (() => { M.TUNE.basicUnlockPerk = false; return M.attachMoveGates(M.startFight(pk, "po", 3), pk); })();
const fPerk = (() => { M.TUNE.basicUnlockPerk = true; return M.attachMoveGates(M.startFight(pk, "po", 3), pk); })();
const m2 = fNo.p.moves.find((m) => m.name === "回风斩");
ok("贯通：招式消耗 -25%", M.moveCheck(fNo, m2).sp === 16 && M.moveCheck(fPerk, m2).sp === 12, `${M.moveCheck(fNo, m2).sp} → ${M.moveCheck(fPerk, m2).sp}`);
M.TUNE.basicUnlockPerk = false;
const hitNo = M.simulate(pk, "po", 60, 99);
M.TUNE.basicUnlockPerk = true;
const hitPerk = M.simulate(pk, "po", 60, 99);
ok("贯通：命中检定 +5（命中率抬高）", hitPerk.hitRate >= hitNo.hitRate, `${hitNo.hitRate}% → ${hitPerk.hitRate}%`);
M.TUNE.basicUnlockPerk = true;

console.log("\n【6】战斗：确定性、能收束、败北延续");
const d1 = M.autoPlay(gate, "kui", 20260915);
const d2 = M.autoPlay(gate, "kui", 20260915);
ok("同 seed 逐字复现", JSON.stringify(d1.log) === JSON.stringify(d2.log));
const res = M.simulate(gate, "po", 200, 777);
console.log(`    具体 30 苍岩刀 vs 泼皮：胜率 ${res.winRate}%，平均 ${res.avgRounds} 回合，命中率 ${res.hitRate}%，一击期望 ${res.expectedDamage}`);
ok("200 场里没有卡死（无未决/超时）", res.fled === 0);
const strong = M.newChar();
strong.talents = { str: 8, agi: 7, ins: 8, con: 8, luk: 4 };
strong.mainArt = "dao.cangyan"; strong.qinggongArt = "qing.taxue"; strong.neigongArt = "nei.cangyan";
strong.arts["dao.cangyan"] = { level: 80, xp: 0 }; strong.arts["qing.taxue"] = { level: 60, xp: 0 };
strong.arts["nei.cangyan"] = { level: 60, xp: 0 }; strong.basics["刀法"] = { level: 80, xp: 0 };
strong.basics["轻功"] = { level: 40, xp: 0 }; strong.basics["内功"] = { level: 40, xp: 0 };
for (const id of ["po", "kui", "shixiong", "daoke"]) {
  const r = M.simulate(strong, id, 200, 4242);
  console.log(`    高手（实际刀 ${M.realOf(strong, "dao.cangyan")}）vs ${r.enemy}：胜率 ${r.winRate}%，平均 ${r.avgRounds} 回合`);
}
const weak = M.newChar();
weak.mainArt = "quan.kaimen";
weak.arts["quan.kaimen"] = { level: 10, xp: 0 };
const before = { money: weak.money, arts: weak.arts[weak.mainArt].level };
const fw = M.autoPlay(weak, "daoke", 31);
console.log(`    新手（实际 ${M.realOf(weak, "quan.kaimen")}）vs 黑市刀客：${fw.outcome}`);
if (fw.outcome === "defeated" || fw.outcome === "captured") {
  const st = M.settleFight(weak, fw);
  ok("战败后仍在游戏里（伤势 + 失财 + 经验照给）",
    weak.wounds.length > 0 && weak.money < before.money && st.artXp > 0,
    `伤势 ${weak.wounds.map((w) => w.name).join(",")} / 失 ${before.money - weak.money} 文 / 经验 +${st.artXp}`);
  ok("伤势使训练效率减半", M.eff(weak) === 0.5);
  const healed = M.advanceHours(weak, 48);
  ok("静养 48h 后伤势消退、效率恢复", healed >= 1 && M.eff(weak) === 1);
} else {
  ok("战败局面构造成功", false, `实际结局 ${fw.outcome}`);
}

console.log("\n【7】战斗外判定");
const oc = M.newChar();
oc.talents = { str: 6, agi: 7, ins: 5, con: 8, luk: 4 };
oc.arts["qing.taxue"] = { level: 40, xp: 0 };
oc.basics["轻功"] = { level: 30, xp: 0 };
oc.mainArt = "qing.taxue";
console.log(`    轻功翻墙（难度 45）实际轻功 ${M.realOf(oc, "qing.taxue")} → 掷骰成功率 ${M.outsideCheck(oc, "qing.taxue", 45).rate}%`);
M.TUNE.outsideCheck = "threshold";
ok("阈值制下结果确定（同输入同输出）", M.outsideCheck(oc, "qing.taxue", 45).ok === M.outsideCheck(oc, "qing.taxue", 45).ok);
M.TUNE.outsideCheck = "roll";

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
