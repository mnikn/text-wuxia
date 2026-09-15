/** 效果系统：故事选择与行动共用的声明式效果；复杂逻辑用 custom 逃生舱（票据 006 <<do>>）。 */
import { BALANCE } from "../engine/balance";
import { clamp, addLog, type GameState, type Severity } from "../engine/state";
import { maxHp, maxNeili, maxStamina } from "../engine/derived";

export type Effect =
  | { t: "flag"; key: string; value: number | boolean | string }
  | { t: "money"; delta: number }
  | { t: "item"; id: string; count: number }
  | { t: "equip"; id: string }
  | { t: "hp"; delta: number }
  | { t: "stamina"; delta: number }
  | { t: "neili"; delta: number }
  | { t: "hunger"; delta: number }
  | { t: "fatigue"; delta: number }
  | { t: "skill"; delta: number }
  | { t: "relation"; npc: string; delta: number }
  | { t: "proof"; kind: "martial" | "social" | "virtue"; id: string }
  | { t: "wound"; severity: Severity; source: string }
  | { t: "healWound"; id?: string; severity?: Severity }
  | { t: "trust"; delta: number }
  | { t: "contribution"; delta: number }
  | { t: "debt"; delta: number }
  | { t: "cargo"; delta: number }
  | { t: "clue"; id: string }
  | { t: "role"; role: GameState["role"] }
  | { t: "logline"; text: string }
  | { t: "custom"; fn: (s: GameState) => string | void };

export function applyEffects(s: GameState, effects: readonly Effect[]): void {
  for (const e of effects) {
    applyEffect(s, e);
  }
}

export function applyEffect(s: GameState, e: Effect): void {
  switch (e.t) {
    case "flag":
      s.stories.flags[e.key] = e.value;
      break;
    case "money": {
      s.player.money = Math.max(0, s.player.money + e.delta);
      if (e.delta > 0) s.stats.earned += e.delta;
      else s.stats.spent += -e.delta;
      break;
    }
    case "item":
      s.inventory[e.id] = Math.max(0, (s.inventory[e.id] ?? 0) + e.count);
      if (s.inventory[e.id] === 0) delete s.inventory[e.id];
      break;
    case "equip":
      s.player.equippedWeapon = e.id;
      break;
    case "hp":
      s.player.hp = clamp(s.player.hp + e.delta, 0, maxHp(s));
      break;
    case "stamina":
      s.player.stamina = clamp(s.player.stamina + e.delta, 0, maxStamina(s));
      break;
    case "neili":
      s.player.neili = clamp(s.player.neili + e.delta, 0, maxNeili(s));
      break;
    case "hunger":
      s.player.hunger = clamp(s.player.hunger + e.delta, 0, 100);
      break;
    case "fatigue":
      s.player.fatigue = clamp(s.player.fatigue + e.delta, 0, 100);
      break;
    case "skill":
      s.player.martialSkill = clamp(s.player.martialSkill + e.delta, 0, 100);
      break;
    case "relation":
      s.relations[e.npc] = clamp((s.relations[e.npc] ?? 0) + e.delta, -10, 10);
      break;
    case "proof": {
      const pool = s.world.proofs[e.kind];
      if (!pool.includes(e.id)) pool.push(e.id);
      break;
    }
    case "wound": {
      const minutes =
        e.severity === "轻伤"
          ? BALANCE.lightWoundHealMinutes
          : e.severity === "中伤"
            ? BALANCE.midWoundHealMinutes
            : BALANCE.heavyWoundHealMinutes;
      const id = `w${s.meta.actionNumber}_${s.player.wounds.length}_${e.severity}`;
      s.player.wounds.push({ id, severity: e.severity, dueMinute: s.clock.minutes + minutes, source: e.source });
      s.scheduler.push({ id: `heal:${id}`, dueMinute: s.clock.minutes + minutes, priority: 1, kind: "heal", payload: { woundId: id } });
      addLog(s, "system", `伤势：${e.severity}（${e.source}）`);
      break;
    }
    case "trust":
      s.sect.trust = clamp(s.sect.trust + e.delta, -10, 10);
      break;
    case "contribution":
      s.sect.contribution = clamp(s.sect.contribution + e.delta, 0, 100);
      break;
    case "debt":
      s.player.debt = Math.max(0, Math.round(s.player.debt + e.delta));
      break;
    case "cargo":
      if (s.escort) s.escort.cargo = clamp(s.escort.cargo + e.delta, 0, 100);
      break;
    case "clue":
      if (s.escort && !s.escort.clues.includes(e.id)) s.escort.clues.push(e.id);
      break;
    case "role":
      s.role = e.role;
      break;
    case "logline":
      addLog(s, "story", e.text);
      break;
    case "custom": {
      const msg = e.fn(s);
      if (msg) addLog(s, "story", msg);
      break;
    }
  }
}
