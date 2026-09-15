/** 派生状态：随用随算，不进存档（票据 003）。 */
import { BALANCE } from "./balance";
import { dayOf } from "./clock";
import type { GameState, Severity } from "./state";

export function maxHp(s: GameState): number {
  return BALANCE.baseHp + s.player.attrs.con * BALANCE.hpPerCon;
}

export function maxStamina(s: GameState): number {
  return BALANCE.baseStamina + s.player.attrs.arm * BALANCE.staminaPerArm + s.player.attrs.agi * BALANCE.staminaPerAgi;
}

export function maxNeili(s: GameState): number {
  return BALANCE.baseNeili + s.player.attrs.con * BALANCE.neiliPerCon + s.player.attrs.ins * BALANCE.neiliPerInsight;
}

export function hasSeverity(s: GameState, sev: Severity): boolean {
  return s.player.wounds.some((w) => w.severity === sev);
}

/** 效率乘数：饥饿/疲劳 ≥70、重伤恢复期减半；睡眠不足当日训练减半（票据 008 维护税） */
export function efficiency(s: GameState): number {
  let m = 1;
  if (s.player.hunger >= BALANCE.debuffThreshold) m *= 0.5;
  if (s.player.fatigue >= BALANCE.debuffThreshold) m *= 0.5;
  if (hasSeverity(s, "重伤")) m *= BALANCE.woundedTrainPenalty;
  return m;
}

export function trainPenaltyThisDay(s: GameState): number {
  return s.player.sleepDebtDay === dayOf(s.clock) ? 0.5 : 1;
}

/** 练武 1 段（2h）的增益：1h 基准 +4/+2/+1（票据 008），段末结算 ×2；
 * 递减曲线 × 效率 × 教练加成 × 睡眠债；至少 +1。 */
export function trainGain(s: GameState, coached: boolean): number {
  const perHour =
    s.player.martialSkill < BALANCE.trainTierMid
      ? BALANCE.trainGainLow
      : s.player.martialSkill < BALANCE.trainTierHigh
        ? BALANCE.trainGainMid
        : BALANCE.trainGainHigh;
  const gain = perHour * 2 * (coached ? BALANCE.coachMultiplier : 1) * efficiency(s) * trainPenaltyThisDay(s);
  return Math.max(1, Math.round(gain));
}

/** 打工产出（文）：效率影响计件，计时工保底时薪 */
export function workWage(basePerHour: number, hours: number, s: GameState): number {
  const eff = efficiency(s);
  return Math.max(1, Math.round(basePerHour * hours * (0.5 + 0.5 * eff)));
}

/** 检定值：d100 + 基本武艺 + 属性修正（-8～+10） */
export function checkValue(s: GameState, attr: keyof GameState["player"]["attrs"]): number {
  return s.player.martialSkill + (s.player.attrs[attr] - 5) * 2;
}

/** 有效武艺（含武器 +10，票据 008） */
export function effectiveSkill(s: GameState): number {
  return s.player.martialSkill + (s.player.equippedWeapon ? BALANCE.combat.weaponBonus : 0);
}

/** 是否可接护送：重伤恢复期不可（票据 008） */
export function canTakeEscort(s: GameState): boolean {
  return !hasSeverity(s, "重伤");
}

export function examReady(s: GameState): boolean {
  const pr = s.world.proofs;
  return pr.martial.length + pr.social.length + pr.virtue.length >= 2;
}
