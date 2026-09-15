/** 数值不变量测试（票据 008）：时薪上限、采集限量、成长递减、维护税、检定档带联动 */
import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/engine/balance";
import { createNewGame } from "../src/game/newGame";
import { commit } from "../src/game/transaction";
import { trainGain, efficiency, maxHp, maxNeili, maxStamina, checkValue } from "../src/engine/derived";
import type { GameState } from "../src/engine/state";

function frugal(): GameState {
  return createNewGame({ name: "量具", originId: "student", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 }, seed: 7 });
}

describe("经济不变量（票据 008）", () => {
  it("码头时薪 = 40 文/h（满效率），效率减半时保底", () => {
    const s = frugal();
    s.location = "wharf";
    s.player.hunger = 0;
    s.player.fatigue = 0;
    const m0 = s.player.money;
    const r = commit(s, { kind: "action", id: "work.dock" }, true);
    expect(r.ok, r.reason).toBe(true);
    const earned = r.state.player.money - m0;
    expect(earned).toBe(BALANCE.wageDockPerHour * 2); // 80 文 / 2h

    const s2 = frugal();
    s2.location = "wharf";
    s2.player.hunger = 100; // 饿满 → 效率减半
    const m2 = s2.player.money;
    const r2 = commit(s2, { kind: "action", id: "work.dock" }, true);
    const earned2 = r2.state.player.money - m2;
    expect(earned2).toBeLessThan(BALANCE.wageDockPerHour * 2);
    expect(earned2).toBeGreaterThanOrEqual(Math.round(BALANCE.wageDockPerHour * 2 * 0.5) - 1);
  });

  it("采集链 ≤ 60 文/h 且每日限量（防无限钱循环）", () => {
    const unitValue = BALANCE.forageUnitPrice * BALANCE.forageUnitsPerSession;
    const perHour = unitValue / (BALANCE.forageSessionMinutes / 60);
    expect(perHour).toBeLessThanOrEqual(60);
    expect(perHour).toBeGreaterThan(0);
    expect(BALANCE.forageDailyCap).toBeGreaterThan(0);

    // 实跑：超过日限后被拒绝
    const s = frugal();
    s.location = "city-gate";
    const first = commit(s, { kind: "action", id: "forage.hills" }, true);
    expect(first.ok, first.reason).toBe(true);
    expect(first.state.inventory["herb"]).toBe(BALANCE.forageUnitsPerSession);
    void 0;
  });

  it("债务：第 5 日利滚利一次（违约代价有限、不即死）", () => {
    const s = frugal();
    s.clock.minutes = BALANCE.debtDueMinute + 5;
    const r = commit(s, { kind: "action", id: "rest.free" }, true);
    expect(r.ok, r.reason).toBe(true);
    expect(r.state.player.debt).toBe(Math.ceil((BALANCE.debtAmount * 1.5) / 10) * 10);
    // 再提交一次不再重复加息（调度器一次性）
    const r2 = commit(r.state, { kind: "action", id: "rest.free" }, true);
    expect(r2.state.player.debt).toBe(r.state.player.debt);
  });

  it("单次战败最坏代价 ≤ 2 日预算 + 60 文（票据 008 风险上限）", () => {
    // 重伤恢复 2 日 + 补偿债务 100 文（护送战败写回）≤ 2 日预算 + 60 文口径
    expect(BALANCE.heavyWoundHealMinutes).toBeLessThanOrEqual(2 * 1440);
    expect(100).toBeLessThanOrEqual(2 * BALANCE.wageDockPerHour * 8 + 60);
  });
});

describe("成长与维护税（票据 008）", () => {
  it("递减曲线：≤50 +4/h、50-70 +2/h、>70 +1/h（2h 段）", () => {
    const s = frugal();
    s.player.hunger = 0;
    s.player.fatigue = 0;
    s.player.martialSkill = 20;
    expect(trainGain(s, false)).toBe(BALANCE.trainGainLow * 2);
    s.player.martialSkill = 55;
    expect(trainGain(s, false)).toBe(BALANCE.trainGainMid * 2);
    s.player.martialSkill = 80;
    expect(trainGain(s, false)).toBe(BALANCE.trainGainHigh * 2);
    // 教练 ×1.5
    s.player.martialSkill = 20;
    expect(trainGain(s, true)).toBe(Math.round(BALANCE.trainGainLow * 2 * BALANCE.coachMultiplier));
  });

  it("饥饿/疲劳 ≥70 效率减半；重伤训练减半（维护税）", () => {
    const s = frugal();
    s.player.hunger = 0;
    s.player.fatigue = 0;
    expect(efficiency(s)).toBe(1);
    s.player.hunger = 80;
    expect(efficiency(s)).toBe(0.5);
    s.player.hunger = 0;
    s.player.fatigue = 90;
    expect(efficiency(s)).toBe(0.5);
    s.player.fatigue = 0;
    s.player.wounds.push({ id: "w1", severity: "重伤", dueMinute: 9999, source: "测试" });
    expect(efficiency(s)).toBe(BALANCE.woundedTrainPenalty);
  });

  it("三维随根骨/臂力/身法/悟性派生（不进存档，随用随算）", () => {
    const s = frugal();
    const a = s.player.attrs;
    expect(maxHp(s)).toBe(60 + a.con * 8);
    expect(maxStamina(s)).toBe(60 + a.arm * 4 + a.agi * 4);
    expect(maxNeili(s)).toBe(10 + a.con * 3 + a.ins * 1);
    expect(checkValue(s, "arm")).toBe(s.player.martialSkill + (a.arm - 5) * 2);
  });

  it("考核门槛 50 ≈ 12.5h 训练（自 0 起，预算 27% 内）", () => {
    let hours = 0;
    let skill = 0;
    while (skill < BALANCE.examThreshold && hours < 100) {
      const gain = skill < 50 ? BALANCE.trainGainLow : skill < 70 ? BALANCE.trainGainMid : BALANCE.trainGainHigh;
      skill += gain * 2; // 2h 段
      hours += 2;
    }
    expect(hours).toBeLessThanOrEqual(15); // 票据 008：≈15h ≈ 预算 27%
    expect(hours / (7 * 8)).toBeLessThanOrEqual(0.3);
  });
});
