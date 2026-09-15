/**
 * 动态战斗回合（票据 004）：一次动作提交 = 玩家动作 → 敌人回应 → 回合末结算的原子事务。
 * 可用行动由战斗状态生成：常规行动常显、禁用示因；情境行动条件不满足即隐藏。
 * 伤害经检定档带（d100 + 有效武艺 vs 敌方难度，武器固定 +10，票据 008）。
 * 移植自 planning/wayfinder/prototypes/combat-loop.html（纯 reducer）。
 */
import { BALANCE } from "../engine/balance";
import { roll, rollRange } from "../engine/rng";
import { addLog, type CombatOutcome, type CombatState, type GameState } from "../engine/state";
import { resolveCheck, type CheckBand } from "../engine/check";
import { maxNeili, maxStamina } from "../engine/derived";

export interface CombatActionView {
  id: string;
  label: string;
  effect: string;
  reason: string | null;
  situational: boolean;
}

const CBT = BALANCE.combat;

export function startCombat(
  s: GameState,
  kind: CombatState["kind"],
  enemy: { name: string; hp: number; stamina: number; difficulty: number },
  firstStrike: boolean
): void {
  s.combat = {
    kind,
    round: 1,
    firstStrikePending: firstStrike,
    player: {
      hp: s.player.hp,
      hpMax: s.player.hp,
      stamina: s.player.stamina,
      staminaMax: Math.max(s.player.stamina, maxStamina(s)),
      neili: s.player.neili,
      neiliMax: Math.max(s.player.neili, maxNeili(s)),
      posture: "站立",
      blade: s.player.equippedWeapon ? "持握" : "脱手",
      goldSalves: s.inventory["gold-salve"] ?? 0,
      lightWounded: false,
      heavyWounded: false,
      weaponBonus: s.player.equippedWeapon ? CBT.weaponBonus : 0,
      skill: s.player.martialSkill,
    },
    enemy: {
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.hp,
      stamina: enemy.stamina,
      maxStamina: enemy.stamina,
      posture: "站立",
      difficulty: enemy.difficulty,
    },
    defending: false,
    outcome: null,
    log: [],
  };
  s.stats.fights += 1;
  addLog(s, "combat", kind === "伏击" ? `${enemy.name}暴起发难——伏击战开始！` : `${enemy.name}摆开架势——切磋开始。`);
}

function combatSkill(cb: CombatState): number {
  return cb.player.blade === "持握" ? cb.player.skill + cb.player.weaponBonus : cb.player.skill;
}

/** 可用行动生成：常规禁用示因、情境隐藏由 UI 依据 reason+situational 处理 */
export function combatAvailable(s: GameState): CombatActionView[] {
  const cb = s.combat;
  if (!cb || cb.outcome) return [];
  const p = cb.player;
  const down = p.posture === "倒地";
  const desperate = p.hp <= p.hpMax * CBT.heavyWoundAt;
  const defs: Array<CombatActionView & { block: string | null }> = [
    {
      id: "attack",
      label: "进击",
      effect: `体力-${CBT.attackCostStamina}；持刃伤害10-14，徒手4-7（检定档带）`,
      reason: null,
      situational: false,
      block: down ? "倒地不起" : p.stamina < CBT.attackCostStamina ? "体力不支" : null,
    },
    {
      id: "heavy",
      label: "全力一击",
      effect: `体力-${CBT.heavyCostStamina}、内力-${CBT.heavyCostNeili}；伤害18-24，35%击倒`,
      reason: null,
      situational: false,
      block: down
        ? "倒地不起"
        : p.blade === "脱手"
          ? "兵刃脱手"
          : p.stamina < CBT.heavyCostStamina
            ? "体力不支"
            : p.neili < CBT.heavyCostNeili
              ? "内力不足"
              : null,
    },
    { id: "defend", label: "守势", effect: "本回合受伤减半；体力+10", reason: null, situational: false, block: down ? "倒地不起" : null },
    { id: "breath", label: "调息", effect: "体力+15、内力+8", reason: null, situational: false, block: down ? "倒地不起" : null },
    { id: "stand", label: "撑地起身", effect: "从倒地起身；敌人趁隙抢攻", reason: null, situational: true, block: down ? null : "并未倒地" },
    {
      id: "recover",
      label: "拾回兵刃",
      effect: "兵刃回到手中；露出破绽",
      reason: null,
      situational: true,
      block: p.blade !== "脱手" ? "兵刃仍在手中" : down ? "倒地不起" : null,
    },
    {
      id: "medicine",
      label: "金疮药",
      effect: `气血+${CBT.medicineHeal}；数量有限`,
      reason: null,
      situational: false,
      block: p.goldSalves <= 0 ? "金疮药已用尽" : p.hp >= p.hpMax ? "气血充盈" : null,
    },
    {
      id: "flee",
      label: "夺路而逃",
      effect: "体力-10；体力差距定成败，失败被抢攻",
      reason: null,
      situational: false,
      block: down ? "倒地不起" : p.stamina < CBT.fleeCost ? "体力不支" : null,
    },
    {
      id: "surrender",
      label: "束手就擒",
      effect: "认输被擒，进入被囚剧情",
      reason: null,
      situational: true,
      block: !(desperate || (down && p.blade === "脱手")) ? "尚未被逼入绝境" : null,
    },
  ];
  return defs.map(({ block, ...v }) => ({ ...v, reason: block }));
}

/**
 * 提交一个战斗动作：原子完成玩家动作→敌人回应→回合末结算。
 * 返回 null 表示成功提交；返回字符串为拒绝原因（不启动回合，不消耗 RNG 与资源）。
 */
export function applyCombatAction(s: GameState, actionId: string): string | null {
  const cb = s.combat;
  if (!cb || cb.outcome) return "战斗已结束";
  const view = combatAvailable(s).find((a) => a.id === actionId);
  if (!view) return "无此行动";
  if (view.reason) return view.reason;

  const p = cb.player;
  const e = cb.enemy;
  let rng = s.random;
  const say = (t: string) => cb.log.push(t);
  cb.log.push(`—— 第 ${cb.round} 回合 ——`);

  const woundCheck = (): void => {
    if (!p.lightWounded && p.hp > 0 && p.hp <= p.hpMax * CBT.lightWoundAt) {
      p.lightWounded = true;
      say("你气血大损，落下轻伤。");
    }
    if (!p.heavyWounded && p.hp > 0 && p.hp <= p.hpMax * CBT.heavyWoundAt) {
      p.heavyWounded = true;
      say("你伤可见骨，已是重伤。");
    }
  };

  const enemyStrike = (forcedNormal = false): void => {
    if (!forcedNormal && e.stamina < CBT.enemyRestBelow) {
      e.stamina = Math.min(e.maxStamina, e.stamina + CBT.enemyRestRegen);
      say(`${e.name}后劲不济，收势喘息。`);
      return;
    }
    const r1 = roll(rng);
    rng = r1.rng;
    const heavy = !forcedNormal && e.stamina >= CBT.enemyHeavy.cost && r1.value < CBT.enemyHeavyChance;
    const spec = heavy ? CBT.enemyHeavy : CBT.enemyNormal;
    e.stamina -= spec.cost;
    const d = rollRange(rng, spec.dmg[0], spec.dmg[1]);
    rng = d.rng;
    let dmg = d.value;
    if (cb.defending) dmg = Math.ceil(dmg / 2);
    p.hp = Math.max(0, p.hp - dmg);
    say(`${e.name}${heavy ? "合身重击" : "挥刀抢攻"}，你受 ${dmg} 点伤${cb.defending ? "（守势减半）" : ""}。`);
    woundCheck();
    if (heavy && p.hp > 0) {
      const dr = roll(rng);
      rng = dr.rng;
      const disarmChance = p.posture === "倒地" ? CBT.enemyHeavy.disarmDowned : CBT.enemyHeavy.disarm;
      if (p.blade === "持握" && dr.value < disarmChance) {
        p.blade = "脱手";
        say(`${e.name}一记绞手磕飞你的兵刃——缴械！`);
      } else if (p.posture !== "倒地") {
        const kr = roll(rng);
        rng = kr.rng;
        if (kr.value < CBT.enemyHeavy.knockdown) {
          p.posture = "倒地";
          say("你站立不稳，被击倒在地。");
        }
      }
    }
  };

  const endIfDown = (): boolean => {
    if (e.hp <= 0) {
      cb.outcome = "victory";
      say(`${e.name}颓然倒地——${cb.kind === "伏击" ? "伏击已破" : "切磋分出高下"}。`);
      return true;
    }
    if (p.hp <= 0) {
      cb.outcome = "defeated";
      say("你眼前一黑，支撑不住……");
      return true;
    }
    return false;
  };

  /** 玩家攻击伤害走检定档带；返回档带供大失败反打 */
  const bandAttack = (
    dmgGreat: number,
    dmgSuccess: number,
    dmgGraze: number,
    knockdown: number
  ): CheckBand => {
    const cr = resolveCheck(rng, combatSkill(cb), e.difficulty);
    rng = cr.rng;
    if (cr.band === "大成功") {
      const d = rollRange(rng, dmgGreat - 3, dmgGreat + 3);
      rng = d.rng;
      e.hp = Math.max(0, e.hp - d.value);
      say(`你招招抢攻（检定大成功），${e.name}受 ${d.value} 点重创。`);
      if (e.hp > 0 && knockdown > 0) {
        const k = roll(rng);
        rng = k.rng;
        if (k.value < knockdown) {
          e.posture = "倒地";
          say(`${e.name}被你击倒在地。`);
        }
      }
    } else if (cr.band === "成功") {
      const d = rollRange(rng, dmgSuccess - 2, dmgSuccess + 2);
      rng = d.rng;
      e.hp = Math.max(0, e.hp - d.value);
      say(`你得手一记，${e.name}受 ${d.value} 点伤。`);
    } else if (cr.band === "失败") {
      const d = rollRange(rng, 1, dmgGraze);
      rng = d.rng;
      e.hp = Math.max(0, e.hp - d.value);
      say(`这一下只擦着对方（检定失败），${e.name}受 ${d.value} 点轻伤。`);
    } else {
      say("你一击落空，门户大开（检定大失败）！");
    }
    return cr.band;
  };

  let playerBand: CheckBand | null = null;

  switch (actionId) {
    case "attack": {
      p.stamina -= CBT.attackCostStamina;
      const hasBlade = p.blade === "持握";
      const top = hasBlade ? CBT.dmgBlade[1] : CBT.dmgFist[1];
      const base = hasBlade ? CBT.dmgBlade[0] : CBT.dmgFist[0];
      playerBand = bandAttack(top + 8, top, Math.max(1, base - 2), 0.1);
      break;
    }
    case "heavy": {
      p.stamina -= CBT.heavyCostStamina;
      p.neili -= CBT.heavyCostNeili;
      playerBand = bandAttack(CBT.heavyDmg[1] + 2, CBT.heavyDmg[1], CBT.heavyDmg[0] - 10, CBT.heavyKnockdown);
      break;
    }
    case "defend":
      cb.defending = true;
      p.stamina = Math.min(p.stamina + CBT.defendRegen, p.staminaMax);
      say("你稳扎守势，寻隙待变。");
      break;
    case "breath":
      p.stamina = Math.min(p.stamina + CBT.breathRegen, p.staminaMax);
      p.neili = Math.min(p.neili + CBT.breathNeiliRegen, p.neiliMax);
      say("你且战且退，调息回气。");
      break;
    case "stand":
      p.posture = "站立";
      say("你撑地跃起，重新站稳。");
      break;
    case "recover":
      p.blade = "持握";
      say("你翻滚拾回兵刃，露出破绽。");
      break;
    case "medicine": {
      p.goldSalves -= 1;
      const healed = Math.min(CBT.medicineHeal, p.hpMax - p.hp);
      p.hp += healed;
      say(`你敷上金疮药，气血回复 ${healed} 点。`);
      break;
    }
    case "flee": {
      p.stamina -= CBT.fleeCost;
      const chance = CBT.fleeBase + (p.stamina - e.stamina) / 200;
      const r = roll(rng);
      rng = r.rng;
      if (r.value < chance) {
        say("你觑准空档夺路而逃，甩开了追兵。");
        cb.outcome = "fled";
      } else {
        say(`${e.name}识破你的意图，抢身封住去路！`);
      }
      break;
    }
    case "surrender":
      say("你弃械伏地，被反剪双手——束手就擒。");
      cb.outcome = "captured";
      break;
  }

  // ---- 敌人回应（先手优势可跳过首回合回应；大失败被反打） ----
  if (cb.outcome === null) {
    if (endIfDown()) {
      // 已结束
    } else if (playerBand === "大失败") {
      enemyStrike(true);
      endIfDown();
    } else if (cb.firstStrikePending) {
      cb.firstStrikePending = false;
      say("凭前期准备抢得先手，敌人尚未回神，无法回应。");
    } else {
      enemyStrike();
      endIfDown();
    }
  }

  // ---- 回合末结算（与动作同属一个原子提交） ----
  if (cb.outcome === null) {
    p.stamina = Math.min(p.staminaMax, p.stamina + CBT.regenPerRound);
    e.stamina = Math.min(e.maxStamina, e.stamina + CBT.regenPerRound);
    cb.defending = false;
    cb.round += 1;
  } else {
    woundCheck();
  }

  s.random = rng;
  return null;
}

export const COMBAT_OUTCOME_LABEL: Record<CombatOutcome, string> = {
  victory: "胜利",
  fled: "逃跑",
  defeated: "战败",
  captured: "被擒",
};

/** 战斗结束后把三维与伤势写回权威状态（气血跌破 50%/25% 分别留下轻伤/重伤，票据 004）。
 * 返回结局供事务层路由；教学切磋不留真实伤势。 */
export function writeBackCombat(s: GameState): CombatOutcome | null {
  const cb = s.combat;
  if (!cb || !cb.outcome) return null;
  const tutorial = cb.kind === "教学切磋";
  s.player.hp = Math.max(cb.outcome === "defeated" ? 1 : 0, cb.player.hp);
  s.player.stamina = Math.max(0, cb.player.stamina);
  s.player.neili = Math.max(0, cb.player.neili);
  const grant = (id: string, severity: "轻伤" | "重伤", minutes: number): void => {
    if (s.player.wounds.some((w) => w.id === id)) return;
    s.player.wounds.push({ id, severity, dueMinute: s.clock.minutes + minutes, source: cb.kind });
    s.scheduler.push({
      id: `heal:${id}`,
      dueMinute: s.clock.minutes + minutes,
      priority: 1,
      kind: "heal",
      payload: { woundId: id },
    });
  };
  if (!tutorial) {
    if (cb.player.lightWounded) grant("combat-light", "轻伤", BALANCE.lightWoundHealMinutes);
    if (cb.player.heavyWounded) grant("combat-heavy", "重伤", BALANCE.heavyWoundHealMinutes);

    if ((s.inventory["gold-salve"] ?? 0) !== cb.player.goldSalves) {
      const used = (s.inventory["gold-salve"] ?? 0) - cb.player.goldSalves;
      s.inventory["gold-salve"] = cb.player.goldSalves;
      if (used > 0) addLog(s, "combat", `消耗金疮药 ×${used}`);
    }
  }
  addLog(s, "combat", `战斗结束：${COMBAT_OUTCOME_LABEL[cb.outcome]}（第 ${cb.round} 回合）`);
  const outcome = cb.outcome;
  s.combat = null;
  return outcome;
}
