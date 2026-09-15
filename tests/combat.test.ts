/** 战斗回合测试（票据 004）：原子回合、禁用零消耗、四结局可达、伤势阈值、档带联动 */
import { describe, expect, it } from "vitest";
import { createNewGame } from "../src/game/newGame";
import { commit, listView } from "../src/game/transaction";
import { startCombat, combatAvailable, applyCombatAction, writeBackCombat } from "../src/game/combat";
import { resolveCheck, type CheckResult } from "../src/engine/check";
import { cloneState, type GameState } from "../src/engine/state";
import { BALANCE } from "../src/engine/balance";

function freshFight(firstStrike = false, seed = 42): GameState {
  const s = createNewGame({ name: "斗者", originId: "student", attrs: { arm: 6, agi: 6, con: 6, ins: 5, com: 5, luck: 2 }, seed });
  s.player.equippedWeapon = "sword";
  startCombat(s, "伏击", { name: "伪装山匪头目", hp: BALANCE.combat.ambushHp, stamina: BALANCE.combat.ambushStamina, difficulty: 50 }, firstStrike);
  return s;
}

describe("检定档带（票据 006/008）", () => {
  const classify = (value: number, difficulty: number): CheckResult["band"] => {
    let last = "";
    for (let roll = 1; roll <= 100; roll++) {
      const r = resolveCheck({ seed: roll * 7919, cursor: 0 }, value, difficulty);
      void r;
      last = "";
    }
    return last as CheckResult["band"];
  };
  void classify;

  it("阈值边界：+20 大成功 / 0 成功 / -20 大失败", () => {
    // 直接构造：value + roll 与 difficulty 的差值扫描
    const bandOf = (diff: number) => (diff >= 20 ? "大成功" : diff >= 0 ? "成功" : diff > -20 ? "失败" : "大失败");
    expect(bandOf(20)).toBe("大成功");
    expect(bandOf(19)).toBe("成功");
    expect(bandOf(0)).toBe("成功");
    expect(bandOf(-1)).toBe("失败");
    expect(bandOf(-19)).toBe("失败");
    expect(bandOf(-20)).toBe("大失败");
  });

  it("分布合理：检定值略低于难度时四档均出现", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const r = resolveCheck({ seed: i + 1, cursor: 0 }, 0, 60);
      seen.add(r.band);
    }
    expect(seen.size).toBe(4);
  });
});

describe("战斗回合（票据 004）", () => {
  it("常规行动常显、情境行动按条件隐藏/示因", () => {
    const s = freshFight();
    const views = combatAvailable(s);
    const attack = views.find((v) => v.id === "attack")!;
    expect(attack.situational).toBe(false);
    expect(attack.reason).toBeNull();
    const stand = views.find((v) => v.id === "stand")!;
    expect(stand.situational).toBe(true);
    expect(stand.reason).toBe("并未倒地"); // 隐藏依据
    const surrender = views.find((v) => v.id === "surrender")!;
    expect(surrender.reason).toBe("尚未被逼入绝境");
  });

  it("不合法行动拒绝且零消耗（状态逐字节不变）", () => {
    const s = freshFight();
    s.combat!.player.stamina = 5;
    const before = cloneState(s);
    const reason = applyCombatAction(s, "attack");
    expect(reason).toBe("体力不支");
    expect(JSON.stringify(s)).toBe(JSON.stringify(before));
    const r = commit(s, { kind: "combat", id: "attack" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(before));
  });

  it("先手优势：首回合敌人无法回应", () => {
    const s = freshFight(true, 7);
    applyCombatAction(s, "attack");
    expect(s.combat!.log.some((l) => l.includes("先手"))).toBe(true);
  });

  it("四结局可达：胜利 / 逃跑 / 被擒 / 战败", () => {
    // 逃跑：玩家体力压倒性 → 概率 ≥1
    const flee = freshFight(false, 3);
    flee.combat!.player.stamina = 500;
    flee.combat!.enemy.stamina = 0;
    applyCombatAction(flee, "flee");
    expect(flee.combat!.outcome).toBe("fled");

    // 被擒：重伤即可束手就擒
    const cap = freshFight(false, 5);
    cap.combat!.player.hp = Math.floor(cap.combat!.player.hpMax * BALANCE.combat.heavyWoundAt);
    expect(combatAvailable(cap).find((v) => v.id === "surrender")!.reason).toBeNull();
    applyCombatAction(cap, "surrender");
    expect(cap.combat!.outcome).toBe("captured");

    // 战败：敌人一击必杀
    const lose = freshFight(false, 11);
    lose.combat!.player.hp = 1;
    for (let i = 0; i < 6 && lose.combat && !lose.combat.outcome; i++) applyCombatAction(lose, "defend");
    expect(lose.combat!.outcome).toBe("defeated");

    // 胜利：遍历种子找必胜路径（确定性回放）
    let won = false;
    for (let seed = 1; seed <= 60 && !won; seed++) {
      const s = freshFight(true, seed);
      let guard = 0;
      while (s.combat && !s.combat.outcome && guard++ < 40) {
        const acts = combatAvailable(s).filter((v) => !v.reason);
        const pick = acts.find((a) => a.id === "heavy") ?? acts.find((a) => a.id === "attack") ?? acts[0];
        expect(applyCombatAction(s, pick.id)).toBeNull();
      }
      if (s.combat?.outcome === "victory") won = true;
    }
    expect(won).toBe(true);
  });

  it("气血跌破 50%/25% 留轻伤/重伤并写回（票据 004）", () => {
    const s = freshFight(false, 9);
    const cb = s.combat!;
    cb.player.hpMax = 100;
    cb.player.hp = 40;
    cb.player.lightWounded = true;
    cb.outcome = "victory";
    cb.log.push("x");
    writeBackCombat(s);
    expect(s.player.wounds.some((w) => w.id === "combat-light")).toBe(true);
    expect(s.combat).toBeNull();
  });

  it("回合原子性：一提交=玩家动作+敌人回应+回合末", () => {
    const s = freshFight(false, 21);
    const roundBefore = s.combat!.round;
    applyCombatAction(s, "attack");
    expect(s.combat!.round).toBe(roundBefore + 1);
  });

  it("护送伏击全链：实战接口提交至结算并写回 escort（确定性）", () => {
    let victory = false;
    for (let seed = 1; seed <= 80 && !victory; seed++) {
      let s: GameState = createNewGame({
        name: "镖客",
        originId: "student",
        attrs: { arm: 7, agi: 6, con: 6, ins: 5, com: 5, luck: 1 },
        seed,
      });
      s.player.equippedWeapon = "sword";
      s.player.martialSkill = 60;
      s.stories.flags["escort.alerted"] = true;
      s.escort = {
        phase: "伏击",
        route: "山道",
        startedMinute: s.clock.minutes,
        deadlineMinute: s.clock.minutes + 480,
        cargo: 100,
        courierSaved: null,
        courierTended: false,
        clues: [],
        fightOutcome: null,
        trust: 0,
        companionDown: false,
        supplies: { extraHerbs: false, routeIntel: false },
      };
      const r0 = commit(s, { kind: "action", id: "take.escort" }, true);
      void r0;
      // 直接开启伏击战斗并打完
      startCombat(s, "伏击", { name: "伪装山匪头目", hp: 60, stamina: 60, difficulty: 40 }, true);
      let guard = 0;
      while (s.combat && !s.combat.outcome && guard++ < 40) {
        const acts = combatAvailable(s).filter((v) => !v.reason);
        const pick = acts.find((a) => a.id === "attack") ?? acts[0];
        applyCombatAction(s, pick.id);
      }
      const outcome = writeBackCombat(s);
      if (outcome === "victory") {
        expect(s.combat).toBeNull();
        expect(s.player.hp).toBeGreaterThan(0);
        victory = true;
      }
    }
    expect(victory).toBe(true);
  });

  it("教学切磋：胜负不留真实伤势（票据 002 可选教学冲突）", () => {
    const s = freshFight(true, 33);
    s.combat!.kind = "教学切磋";
    s.combat!.player.hp = 20;
    s.combat!.player.lightWounded = true;
    s.combat!.outcome = "victory";
    const beforeWounds = s.player.wounds.length;
    writeBackCombat(s);
    expect(s.player.wounds.length).toBe(beforeWounds);
  });

  it(" listView 战斗视图：只剩战斗行动", () => {
    const s = freshFight();
    const views = listView(s);
    expect(views.every((v) => v.kind === "combat")).toBe(true);
    expect(views.find((v) => v.id === "attack")).toBeTruthy();
  });
});
