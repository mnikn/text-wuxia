/**
 * 黄金场景回放（票据 009）：入口单元必配——给定状态+种子，断言进入、选择与结算效果。
 * 同时覆盖完整试玩主链：报名 → 候选 → 领护送 → 伏击 → 调查 → 交付 → 结算 → 入门（票据 002）。
 * 故事入口含加权随机，测试用 until 助手在固定引擎下重掷（移动重入地点触发新的入口评估）。
 */
import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/game/newGame";
import { commit, listView, type Intent } from "../src/game/transaction";
import type { GameState } from "../src/engine/state";
import { BALANCE } from "../src/engine/balance";
import { REGISTRY, validateRegistry } from "../src/content/registry";
import { nextHop } from "../src/content/world";

/** 多跳移动直到到达目标地点；故事打断时先任意解决 */
function goto(s: GameState, target: string, budget = 40): GameState {
  let i = 0;
  while (s.location !== target && i++ < budget) {
    const hop = nextHop(s.location, target);
    const r = commit(s, { kind: "move", to: hop! }, true);
    if (!r.ok) s = step(s, []);
    else s = r.state;
  }
  return s;
}

function step(s: GameState, prefIds: string[], policy: "first" | "last" = "first"): GameState {
  const views = listView(s).filter((v) => !v.hidden && !v.disabled);
  expect(views.length, `无可行动（软锁）@ ${s.location} m=${s.clock.minutes} story=${s.stories.active?.unitId}`).toBeGreaterThan(0);
  let chosen = policy === "last" ? views[views.length - 1] : views[0];
  for (const p of prefIds) {
    const hit = views.find((v) => v.id === p || v.label.includes(p));
    if (hit) {
      chosen = hit;
      break;
    }
  }
  const intent: Intent =
    chosen.kind === "move"
      ? { kind: "move", to: chosen.id }
      : chosen.kind === "story"
        ? { kind: "storyChoice", id: chosen.id }
        : chosen.kind === "combat"
          ? { kind: "combat", id: chosen.id }
          : { kind: "action", id: chosen.id };
  const r = commit(s, intent, true);
  expect(r.ok, `行动被拒 ${JSON.stringify(intent)}: ${r.reason}`).toBe(true);
  return r.state;
}

/** 反复以移动重掷入口评估，直到 pred 成立（入口单元黄金回放的标准姿势） */
function until(s: GameState, pred: (s: GameState) => boolean, pingPong: [string, string], budget = 60): GameState {
  let i = 0;
  while (!pred(s) && i++ < budget) {
    const target = i % 2 === 0 ? pingPong[0] : pingPong[1];
    const r = commit(s, { kind: "move", to: target }, true);
    if (!r.ok) {
      // 故事进行中则先随便选一项
      s = step(s, []);
    } else {
      s = r.state;
    }
  }
  return s;
}

describe("黄金场景：入口故事单元", () => {
  it("life.su.task → 送药×3 → 苏掌柜引荐（人情证明路径 A）", () => {
    let s = createNewGame({ name: "药童", originId: "refugee", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 }, seed: 101 });
    s = until(s, (g) => g.stories.active?.unitId === "life.su.task", ["pharmacy", "west-street"]);
    expect(s.stories.active?.unitId).toBe("life.su.task");
    s = step(s, ["应下这差事"]);
    for (let i = 0; i < 3; i++) {
      s = until(s, (g) => g.stories.active?.unitId === "life.su.deliver", ["pharmacy", "west-street"]);
      s = step(s, ["送西街病家", "送客栈东家", "送码头船工"]);
    }
    s = until(s, (g) => g.stories.active?.unitId === "life.su.trust", ["pharmacy", "west-street"]);
    s = step(s, ["拜谢收下"]);
    expect(s.world.proofs.social).toContain("人情·药铺引荐");
  });

  it("life.market.purse 归还 → 品行证明；收下 → 断绝该路径", () => {
    let s = createNewGame({ name: "路人", originId: "porter", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 }, seed: 202 });
    s = until(s, (g) => g.stories.active?.unitId === "life.market.purse", ["market", "west-street"]);
    s = step(s, ["在原地等失主"]);
    expect(s.world.proofs.virtue).toContain("品行·拾金不昧");

    let s2 = createNewGame({ name: "贪客", originId: "porter", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 }, seed: 203 });
    s2 = until(s2, (g) => g.stories.active?.unitId === "life.market.purse", ["market", "west-street"]);
    s2 = step(s2, ["收进怀里"]);
    expect(s2.stories.flags["life.keptPurse"]).toBe(true);
    expect(s2.world.proofs.virtue).toHaveLength(0);
    expect(s2.player.money).toBeGreaterThan(80);
  });
});

/** 反复以偏好步进直到 pred 成立（处理"杂谈故事抢占入口拍"的情况） */
function stepUntil(s: GameState, prefIds: string[], pred: (s: GameState) => boolean, budget = 12): GameState {
  let i = 0;
  while (!pred(s) && i++ < budget) {
    const views = listView(s).filter((v) => !v.hidden && !v.disabled);
    if (views.length === 0) break;
    let chosen = views[0];
    for (const p of prefIds) {
      const hit = views.find((v) => v.id === p || v.label.includes(p));
      if (hit) { chosen = hit; break; }
    }
    const intent: Intent =
      chosen.kind === "move"
        ? { kind: "move", to: chosen.id }
        : chosen.kind === "story"
          ? { kind: "storyChoice", id: chosen.id }
          : { kind: "action", id: chosen.id };
    const r = commit(s, intent, true);
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

describe("完整试玩主链（票据 002 验收路径）", () => {
  function prepStudent(seed: number): GameState {
    let s = createNewGame({
      name: "沈万金",
      originId: "student",
      attrs: { arm: 7, agi: 6, con: 6, ins: 5, com: 6, luck: 3 },
      seed,
    });
    s.player.martialSkill = 55;
    s.player.money = 3000;
    return s;
  }

  it("报名 → 候选 → 领护送 → 山道 → 救驿卒 → 伏击 → 调查 → 交付 → 结算 → 入门", () => {
    let s = prepStudent(777);

    // 人情证明（药铺链）
    s = until(s, (g) => g.stories.active?.unitId === "life.su.task", ["pharmacy", "west-street"]);
    s = step(s, ["应下这差事"]);
    for (let i = 0; i < 3; i++) {
      s = until(s, (g) => g.stories.active?.unitId === "life.su.deliver", ["pharmacy", "west-street"]);
      s = step(s, ["送西街病家", "送客栈东家", "送码头船工"]);
    }
    s = until(s, (g) => g.stories.active?.unitId === "life.su.trust", ["pharmacy", "west-street"]);
    s = step(s, ["拜谢收下"]);
    expect(s.world.proofs.social.length).toBe(1);

    // 品行证明（拾金不昧）
    s = until(s, (g) => g.stories.active?.unitId === "life.market.purse", ["market", "west-street"]);
    s = step(s, ["在原地等失主"]);
    expect(s.world.proofs.virtue.length).toBe(1);

    // 报名 → 候选（杂谈故事可能抢占入口拍，循环直至受训）
    s = goto(s, "sect-post");
    s = stepUntil(s, ["报名照川门考核", "行礼受训"], (g) => g.role === "候选学徒");
    expect(s.role).toBe("候选学徒");
    expect(s.world.exam.result).toBe("通过");

    // 护送主链（同样容错抢拍）
    s = stepUntil(s, ["领护送药材的差事"], (g) => g.stories.active?.unitId === "escort.take");
    expect(s.stories.active?.unitId).toBe("escort.take");
    s = step(s, ["封箱出发"]);
    s = step(s, ["走山道"]);
    expect(s.escort?.route).toBe("山道");
    expect(s.escort?.phase).toBe("途中");
    s = step(s, ["沿道稳走"]);
    s = step(s, ["留水粮作记号", "敷药施救", "用金疮药", "不能停"]);
    s = step(s, ["迎头痛击"]);

    // 伏击战：打到分出胜负
    let guard = 0;
    while (s.combat && !s.combat.outcome && guard++ < 60) {
      const views = listView(s).filter((v) => !v.hidden && !v.disabled);
      const pick =
        views.find((v) => v.id === "medicine" && !v.disabled) ??
        views.find((v) => v.id === "attack" && !v.disabled) ??
        views.find((v) => v.id === "defend" && !v.disabled) ??
        views[0];
      const r = commit(s, { kind: "combat", id: pick.id }, true);
      expect(r.ok, r.reason).toBe(true);
      s = r.state;
    }
    expect(s.combat).toBeNull();
    expect(["victory", "fled", "defeated", "captured"]).toContain(s.escort!.fightOutcome);

    // 链路收束到入门仪式（仪式选择可能由 fallback 直接点掉，故以 ending 为准）
    let guard2 = 0;
    while (guard2++ < 50 && !s.ending && s.stories.active?.unitId !== "escort.ceremony") {
      const views = listView(s).filter((v) => !v.hidden && !v.disabled);
      if (views.length === 0) break;
      const pick =
        views.find((v) => v.label.includes("封签") && !v.disabled) ??
        views.find((v) => v.label.includes("问陈驿卒") && !v.disabled) ??
        views.find((v) => v.label.includes("搜检") && !v.disabled) ??
        views.find((v) => /进驿交付|交割完毕|躬身复命|清点队伍|能抢回|强撑|挣脱|向顾执事/.test(v.label) && !v.disabled) ??
        views[0];
      const intent: Intent =
        pick.kind === "move"
          ? { kind: "move", to: pick.id }
          : pick.kind === "story"
            ? { kind: "storyChoice", id: pick.id }
            : { kind: "action", id: pick.id };
      const r = commit(s, intent, true);
      expect(r.ok, `链路被拒 ${pick.id}: ${r.reason}`).toBe(true);
      s = r.state;
    }
    if (!s.ending) {
      expect(s.stories.active?.unitId, "未走到入门仪式").toBe("escort.ceremony");
      s = step(s, ["剑术", "拳掌", "轻身"]);
    }
    expect(s.role).toBe("记名弟子");
    expect(s.ending).not.toBeNull();
    expect(["圆满", "完成", "失利", "惨败"]).toContain(s.ending!.tier);
    expect(s.ending!.direction).toBe("剑术");
    expect(s.sect.contribution).toBeGreaterThan(0);
    expect(listView(s).filter((v) => !v.hidden && !v.disabled).length).toBeGreaterThan(0);
  });

  it("第四级结局可达：力战而败 → 惨败（观察期入门，失败延续无死亡）", () => {
    let sawEnding = false;
    for (let seed = 1; seed <= 40 && !sawEnding; seed++) {
      let s = createNewGame({ name: "试错者", originId: "refugee", attrs: { arm: 1, agi: 1, con: 5, ins: 1, com: 1, luck: 1 }, seed });
      s.player.martialSkill = 50;
      s.player.money = 3000;
      s.world.proofs.social.push("人情·药铺引荐");
      s.world.proofs.virtue.push("品行·庙祝作保");
      s = goto(s, "sect-post");
      s = stepUntil(s, ["报名照川门考核", "行礼受训"], (g) => g.role === "候选学徒");
      s = stepUntil(s, ["领护送药材的差事"], (g) => g.stories.active?.unitId === "escort.take");
      s = step(s, ["封箱出发"]);
      s = step(s, ["走官道"]);
      s = step(s, ["径直赶路", "分他们两张干粮"]);
      s = step(s, ["不能停", "留水粮作记号"]);
      s = step(s, ["迎头痛击"]);
      // 摆烂打法：只调息/防守 → 力竭战败（非被擒）
      let guard = 0;
      while (s.combat && !s.combat.outcome && guard++ < 120) {
        const views = listView(s).filter((v) => !v.hidden && !v.disabled);
        const pick = views.find((v) => v.id === "breath" && !v.disabled) ?? views.find((v) => v.id === "defend" && !v.disabled) ?? views.find((v) => v.id === "stand" && !v.disabled) ?? views[0];
        const r = commit(s, { kind: "combat", id: pick.id }, true);
        expect(r.ok, r.reason).toBe(true);
        s = r.state;
      }
      if (s.escort?.fightOutcome === "defeated") {
        let g2 = 0;
        while (g2++ < 30 && !s.ending) {
          const views = listView(s).filter((v) => !v.hidden && !v.disabled);
          if (!views.length) break;
          const pick =
            views.find((v) => v.label.includes("强撑")) ??
            views.find((v) => /躬身复命|交割完毕|进驿交付|清点队伍/.test(v.label) && !v.disabled) ??
            views[0];
          const intent: Intent = pick.kind === "story" ? { kind: "storyChoice", id: pick.id } : pick.kind === "move" ? { kind: "move", to: pick.id } : { kind: "action", id: pick.id };
          const r = commit(s, intent, true);
          if (!r.ok) break;
          s = r.state;
        }
        if (s.ending?.tier === "惨败") {
          sawEnding = true;
          expect(s.sect.observation).toBe(true);
          expect(s.player.hp).toBeGreaterThan(0); // 被救回，无死亡
        }
      }
    }
    expect(sawEnding, "40 个种子内未复现惨败路径").toBe(true);
  });

  it("注册表构建期校验门持续全绿", () => {
    expect(validateRegistry()).toEqual([]);
    expect(Object.keys(REGISTRY.units).length).toBeGreaterThanOrEqual(30);
  });

  it("第七日死线：证明不足 → 执事担保候选（补考路径）", () => {
    let s = createNewGame({ name: "补考生", originId: "refugee", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 }, seed: 55 });
    s.clock.minutes = BALANCE.examMinute + 5;
    const r = commit(s, { kind: "action", id: "rest.free" }, true);
    expect(r.ok, r.reason).toBe(true);
    s = r.state;
    expect(s.stories.flags["sect.guaranteePending"]).toBe(true);
    s = step(s, ["叩谢担保之恩", "前往照川门驻点"]);
    if (s.role === "游子") s = step(s, ["叩谢担保之恩"]);
    expect(s.role).toBe("候选学徒");
    expect(s.world.exam.guaranteed).toBe(true);
    expect(s.sect.trust).toBeLessThan(1);
  });
});
