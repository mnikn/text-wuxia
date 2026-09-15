/** 新开局：新种子 + 行动号 0 的独立周目（票据 007）。 */
import { BALANCE, WEATHER_BY_DAY } from "../engine/balance";
import type { GameState } from "../engine/state";
import { newSeed } from "../engine/rng";
import { maxHp, maxNeili, maxStamina } from "../engine/derived";
import { ORIGIN_BY_ID } from "../content/origins";
import { SAVE_VERSION } from "../save/contract";

export interface NewGameInput {
  name: string;
  originId: string;
  attrs: Record<string, number>;
  seed?: number;
}

export function createNewGame(input: NewGameInput): GameState {
  const origin = ORIGIN_BY_ID[input.originId];
  if (!origin) throw new Error(`未知出身：${input.originId}`);
  const seed = input.seed ?? newSeed();
  const startMinute = 7 * 60; // 第 1 日辰时抵达

  const attrs = { arm: 3, agi: 3, con: 3, ins: 3, com: 3, luck: 3 };
  for (const [k, v] of Object.entries(input.attrs)) {
    if (k in attrs) attrs[k as keyof typeof attrs] = v;
  }
  for (const [k, v] of Object.entries(origin.attrBonus)) {
    attrs[k as keyof typeof attrs] = Math.min(10, attrs[k as keyof typeof attrs]! + (v as number));
  }

  const s: GameState = {
    meta: { version: SAVE_VERSION, actionNumber: 0, seed, playthroughId: String(seed) },
    player: {
      name: input.name || "无名客",
      origin: origin.id,
      attrs,
      hp: 0,
      stamina: 0,
      neili: 0,
      money: origin.money,
      hunger: origin.hunger,
      fatigue: 20,
      wounds: [],
      martialSkill: origin.martialSkill,
      equippedWeapon: null,
      debt: BALANCE.debtAmount,
      sleepDebtDay: 0,
    },
    clock: { minutes: startMinute },
    location: "west-street",
    world: {
      weather: WEATHER_BY_DAY[1],
      flags: {},
      proofs: { martial: [], social: [], virtue: [] },
      exam: { signedUp: false, guaranteed: false, result: null },
    },
    role: "游子",
    sect: { trust: 0, contribution: 0, observation: false },
    relations: { ...origin.relations },
    inventory: { ...origin.inventory },
    stories: { seen: {}, cooldowns: {}, active: null, flags: {} },
    escort: null,
    combat: null,
    scheduler: [],
    log: [],
    random: { seed, cursor: 0 },
    stats: {
      earned: 0,
      spent: 0,
      meals: 0,
      trainHours: 0,
      workHours: 0,
      fights: 0,
      lastMealMinute: startMinute,
      lastWakeMinute: startMinute,
      lastSleepMinute: startMinute,
    },
    ending: null,
  };
  s.player.hp = maxHp(s);
  s.player.stamina = maxStamina(s);
  s.player.neili = maxNeili(s);

  // 世界调度（票据 003：持久化调度队列）
  for (let d = 2; d <= BALANCE.totalDays; d++) {
    s.scheduler.push({
      id: `weather:d${d}`,
      dueMinute: (d - 1) * 1440 + 7 * 60,
      priority: 4,
      kind: "weather",
      payload: { day: d },
    });
  }
  s.scheduler.push({ id: "deadline:debt", dueMinute: BALANCE.debtDueMinute, priority: 2, kind: "debt-due" });
  s.scheduler.push({ id: "deadline:exam", dueMinute: BALANCE.examMinute, priority: 2, kind: "exam" });

  return s;
}
