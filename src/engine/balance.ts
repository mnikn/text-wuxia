/**
 * 数值不变量常量表（票据 008）：运行时、模拟器与测试同源引用。
 * 只在此调整数字，不改契约。
 */
export const DAY = 1440;

export const BALANCE = {
  /** ---- 时间盒：第 1 日入村 → 第 7 日考核；三死线交错 ---- */
  totalDays: 7,
  /** 第 7 日辰时（07:00）考核/担保 */
  examMinute: 6 * DAY + 7 * 60,
  /** 债务 500 文，第 5 日午时（12:00）到期 */
  debtAmount: 500,
  debtDueMinute: 4 * DAY + 12 * 60,
  debtPenaltyRate: 0.5,
  /** 护送窗口：取得候选身份后第 3～4 日为理想窗口，辰时尽（第 N 日 09:00）前送达 */
  escortDeadlineMinutes: 8 * 60,

  /** ---- 经济：打工 ≈40 文/h；采集链 ≤60 文/h 且每日限量 ---- */
  wageDockPerHour: 40,
  wageMarketPerHour: 30,
  wageShiftMinutes: 120,
  forageSessionMinutes: 120,
  forageUnitsPerSession: 4,
  forageUnitPrice: 15, // 4×15/2h = 30 文/h（低于 60 上限，余量给雨天与事件）
  forageDailyCap: 12,
  firewoodUnitsPerSession: 5,
  firewoodUnitPrice: 8, // 20 文/h

  /** ---- 阶梯消费 ---- */
  priceSword: 200,
  priceClub: 20,
  priceSalve: 30, // 跌打药
  priceGoldSalve: 60, // 金疮药
  priceRation: 8,
  priceMeal: 20,
  priceCoat: 80,
  coachCostPerHour: 50,
  innSleepCostPerNight: 30,

  /** ---- 三维与六属性 ---- */
  attrPointBuy: 30,
  attrMin: 1,
  attrMax: 10,
  baseHp: 60,
  hpPerCon: 8,
  baseStamina: 60,
  staminaPerArm: 4,
  staminaPerAgi: 4,
  baseNeili: 10,
  neiliPerCon: 3,
  neiliPerInsight: 1,

  /** ---- 成长曲线：基本武艺 0～100 递减；考核门槛 ≥50 ≈ 15h 训练 ---- */
  examThreshold: 50,
  trainGainLow: 4, // ≤50
  trainGainMid: 2, // 50～70
  trainGainHigh: 1, // >70
  trainTierMid: 50,
  trainTierHigh: 70,
  trainSessionMinutes: 120,
  coachMultiplier: 1.5,

  /** ---- 维护税 ---- */
  hungerPerHour: 6.5, // 约 16h 醒时饿满
  hungerAsleepPerHour: 2.5,
  fatiguePerHour: 6.5,
  sleepRecoveryInn: 14, // 体力/时
  sleepRecoveryTemple: 10,
  sleepMinHealthy: 240, // 睡眠 <4h 次日训练效率减半
  debuffThreshold: 70,
  hungerStarveHpPerHour: 1,

  /** ---- 战斗（移植原型 TUNE，检定档带联动） ---- */
  combat: {
    attackCostStamina: 12,
    dmgBlade: [10, 14] as const,
    dmgFist: [4, 7] as const,
    weaponBonus: 10, // 票据 008：武器固定 +10
    heavyCostStamina: 20,
    heavyCostNeili: 10,
    heavyDmg: [18, 24] as const,
    heavyKnockdown: 0.35,
    defendRegen: 10,
    breathRegen: 15,
    breathNeiliRegen: 8,
    medicineHeal: 25,
    regenPerRound: 5,
    fleeCost: 10,
    fleeBase: 0.5,
    enemyNormal: { cost: 12, dmg: [8, 12] as const },
    enemyHeavy: { cost: 25, dmg: [14, 20] as const, knockdown: 0.3, disarm: 0.15, disarmDowned: 0.5 },
    enemyHeavyChance: 0.35,
    enemyRestBelow: 15,
    enemyRestRegen: 20,
    lightWoundAt: 0.5,
    heavyWoundAt: 0.25,
    /** 护送敌人：难度 ≈ 同期玩家能力 −10（票据 008） */
    ambushHp: 80,
    ambushStamina: 90,
  },

  /** ---- 检定档带（票据 006 全局缺省 ±20） ---- */
  bandGreat: 20,
  bandFail: -20,

  /** ---- 伤势恢复（票据 008） ---- */
  lightWoundHealMinutes: 240, // 轻伤自愈 4h
  midWoundHealMinutes: DAY, // 中伤 1 日 + 跌打药 1 份
  heavyWoundHealMinutes: 2 * DAY, // 重伤 2 日 + 药 2 份
  woundedTrainPenalty: 0.5, // 恢复期内训练减半

  /** ---- 日志环形截断 ---- */
  logRing: 200,

  /** ---- 行动提交→渲染性能预算参考（测试断言模拟） ---- */
  actionBudgetMs: 100,
} as const;

export type Weather = "晴" | "阴" | "雨" | "风";

/** 第 N 日天气表（调度器逐日应用） */
export const WEATHER_BY_DAY: Record<number, Weather> = {
  1: "晴",
  2: "晴",
  3: "阴",
  4: "雨",
  5: "风",
  6: "晴",
  7: "晴",
};

/** 雨天山道耗时倍率 */
export const RAIN_TRAVEL_MULT = 1.5;
