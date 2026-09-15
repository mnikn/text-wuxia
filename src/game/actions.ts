/** 生活循环行动（票据 002/008）：每个通过验证的行动提交一次事务。 */
import { BALANCE } from "../engine/balance";
import { clamp, addLog, flagNum, setFlag, type GameState } from "../engine/state";
import { dayOf, minuteOfDay } from "../engine/clock";
import { maxHp, maxStamina, trainGain, workWage } from "../engine/derived";
import { edgesFrom, travelMinutes } from "../content/world";

export interface ActionCtx {
  startStory: (unitId: string) => void;
}

export interface ActionDef {
  id: string;
  label: string;
  note?: string;
  locations: string[] | "*";
  minutes: number | ((s: GameState) => number);
  cost?: { money?: number; stamina?: number; item?: { id: string; count: number } };
  /** 睡眠行动：事务层按实际时长恢复体力（每点/时） */
  sleepPerHour?: number;
  /** 返回阻断原因 = 不可用（禁用示因） */
  available?: (s: GameState) => string | null;
  /** 返回 true = 情境隐藏 */
  hidden?: (s: GameState) => boolean;
  perform?: (s: GameState, ctx: ActionCtx) => void;
}

const B = BALANCE;

function minutesOf(def: ActionDef, s: GameState): number {
  return typeof def.minutes === "function" ? def.minutes(s) : def.minutes;
}

export function actionMinutes(def: ActionDef, s: GameState): number {
  return minutesOf(def, s);
}

/** 行动是否可用；返回 null = 可用，否则为拒绝原因 */
export function actionBlocked(s: GameState, def: ActionDef): string | null {
  if (def.locations !== "*" && !def.locations.includes(s.location)) return "不在此地";
  if (def.cost?.money && s.player.money < def.cost.money) return "银钱不足";
  if (def.cost?.stamina && s.player.stamina < def.cost.stamina) return "体力不支";
  if (def.cost?.item && (s.inventory[def.cost.item.id] ?? 0) < def.cost.item.count) return "缺少物品";
  if (def.available) return def.available(s);
  return null;
}

export const ACTIONS: ActionDef[] = [
  {
    id: "rest.free",
    label: "檐下歇口气",
    note: "免费；一刻钟",
    locations: "*",
    minutes: 15,
    perform: (s) => {
      s.player.stamina = clamp(s.player.stamina + 5, 0, maxStamina(s));
      addLog(s, "action", "你寻处檐角坐了坐，缓了口气。");
    },
  },
  {
    id: "eat.meal",
    label: "吃顿热饭",
    note: `${B.priceMeal}文；解除饥饿，添些气力`,
    locations: ["inn", "market", "wharf", "way-station"],
    minutes: 30,
    cost: { money: B.priceMeal },
    hidden: (s) => s.player.hunger < 25,
    perform: (s) => {
      s.player.hunger = clamp(s.player.hunger - 60, 0, 100);
      s.player.stamina = clamp(s.player.stamina + 10, 0, maxStamina(s));
      s.stats.meals += 1;
      s.stats.lastMealMinute = s.clock.minutes;
      addLog(s, "action", "你吃了顿热饭，肚子踏实了，气力也回了几分。");
    },
  },
  {
    id: "rest.teahouse",
    label: "寻处茶棚歇脚",
    note: "10文；一刻钟；缓口气力",
    locations: "*",
    minutes: 15,
    cost: { money: 10 },
    available: (s) => (s.player.money >= 10 ? null : "银钱不足"),
    perform: (s) => {
      s.player.stamina = clamp(s.player.stamina + 8, 0, maxStamina(s));
      addLog(s, "action", "你寻处檐角坐下，喝碗粗茶缓了口气。");
    },
  },
  {
    id: "eat.ration",
    label: "啃干粮",
    note: "消耗干粮×1；解除饥饿",
    locations: "*",
    minutes: 15,
    cost: { item: { id: "ration", count: 1 } },
    hidden: (s) => s.player.hunger < 25,
    perform: (s) => {
      s.player.hunger = clamp(s.player.hunger - 60, 0, 100);
      s.stats.meals += 1;
      s.stats.lastMealMinute = s.clock.minutes;
      addLog(s, "action", "你啃完干粮，就着水囊冲了下去。");
    },
  },
  {
    id: "sleep.inn",
    label: "客栈歇息（睡到天明）",
    note: `${B.innSleepCostPerNight}文；恢复体力上佳`,
    locations: ["inn"],
    minutes: (s) => {
      const now = minuteOfDay(s.clock);
      return now < 6 * 60 ? 6 * 60 - now : 24 * 60 - now + 6 * 60;
    },
    cost: { money: B.innSleepCostPerNight },
    sleepPerHour: B.sleepRecoveryInn,
    available: (s) => (minuteOfDay(s.clock) < 20 * 60 && minuteOfDay(s.clock) >= 15 * 60 ? null : "掌柜只收晚间的房钱（15:00 后可住）"),
    perform: (s) => {
      addLog(s, "action", "你在客栈睡了个整觉。");
    },
  },
  {
    id: "sleep.temple",
    label: "城隍庙侧殿将就一夜",
    note: "免费；恢复一般",
    locations: ["temple"],
    minutes: (s) => {
      const now = minuteOfDay(s.clock);
      return now < 6 * 60 ? 6 * 60 - now : 24 * 60 - now + 6 * 60;
    },
    available: (s) => (minuteOfDay(s.clock) >= 20 * 60 || minuteOfDay(s.clock) < 3 * 60 ? null : "夜里才能歇下（20:00 后）"),
    sleepPerHour: B.sleepRecoveryTemple, // 持有短袄时事务层加成至 12
    perform: (s) => {
      addLog(s, "action", "你在侧殿板床上和衣睡下。");
    },
  },
  {
    id: "work.dock",
    label: "码头扛活",
    note: "2个时辰；约80文，耗体力",
    locations: ["wharf"],
    minutes: B.wageShiftMinutes,
    cost: { stamina: 30 },
    available: (s) => (minuteOfDay(s.clock) >= 6 * 60 && minuteOfDay(s.clock) < 19 * 60 ? null : "脚行天黑不开工"),
    perform: (s) => {
      const wage = workWage(B.wageDockPerHour, 2, s);
      s.player.money += wage;
      s.stats.earned += wage;
      s.stats.workHours += 2;
      setFlag(s, "npc.maShifts", flagNum(s, "npc.maShifts") + 1, true);
      s.player.hunger = clamp(s.player.hunger + 10, 0, 100);
      s.player.fatigue = clamp(s.player.fatigue + 12, 0, 100);
      addLog(s, "action", `你扛了两个时辰的货，挣了 ${wage} 文。`);
    },
  },
  {
    id: "work.market",
    label: "市集帮工",
    note: "2个时辰；约60文",
    locations: ["market"],
    minutes: B.wageShiftMinutes,
    cost: { stamina: 20 },
    available: (s) => (minuteOfDay(s.clock) >= 6 * 60 && minuteOfDay(s.clock) < 19 * 60 ? null : "收摊了"),
    perform: (s) => {
      const wage = workWage(B.wageMarketPerHour, 2, s);
      s.player.money += wage;
      s.stats.earned += wage;
      s.stats.workHours += 2;
      s.player.fatigue = clamp(s.player.fatigue + 8, 0, 100);
      addLog(s, "action", `你帮摊主搬货理货，挣了 ${wage} 文。`);
    },
  },
  {
    id: "forage.hills",
    label: "城外采药",
    note: "2个时辰；药草×4（每日限量），耗体力",
    locations: ["city-gate"],
    minutes: B.forageSessionMinutes,
    cost: { stamina: 25 },
    available: (s) => {
      if (flagNum(s, "life.forageToday") >= B.forageDailyCap) return "附近药材已被采尽（明日再来）";
      if (minuteOfDay(s.clock) >= 19 * 60) return "天黑看不清草药";
      return null;
    },
    perform: (s) => {
      const units = Math.min(B.forageUnitsPerSession, B.forageDailyCap - flagNum(s, "life.forageToday"));
      s.inventory["herb"] = (s.inventory["herb"] ?? 0) + units;
      setFlag(s, "life.forageToday", flagNum(s, "life.forageToday") + units, true);
      addLog(s, "action", `你在坡上采到 ${units} 把药草。`);
    },
  },
  {
    id: "sell.herb",
    label: "把药草卖与药铺",
    note: "每把15文",
    locations: ["pharmacy"],
    minutes: 20,
    cost: { item: { id: "herb", count: 1 } },
    hidden: (s) => (s.inventory["herb"] ?? 0) <= 0,
    perform: (s) => {
      const count = s.inventory["herb"] ?? 0;
      const gain = count * B.forageUnitPrice;
      s.player.money += gain;
      s.stats.earned += gain;
      delete s.inventory["herb"];
      addLog(s, "action", `苏掌柜收了你的 ${count} 把药草，付了 ${gain} 文。`);
    },
  },
  {
    id: "train.school",
    label: "武馆练功",
    note: "2个时辰；基本武艺提升",
    locations: ["school"],
    minutes: B.trainSessionMinutes,
    cost: { stamina: 30 },
    perform: (s) => {
      const gain = trainGain(s, false);
      s.player.martialSkill = clamp(s.player.martialSkill + gain, 0, 100);
      s.stats.trainHours += 2;
      setFlag(s, "life.trainedToday", 1, true);
      s.player.hunger = clamp(s.player.hunger + 8, 0, 100);
      s.player.fatigue = clamp(s.player.fatigue + 10, 0, 100);
      addLog(s, "action", `你练了两个时辰桩功与套路，武艺 +${gain}。`);
    },
  },
  {
    id: "train.coach",
    label: "请铁教头指点",
    note: "2个时辰；100文；效率×1.5",
    locations: ["school"],
    minutes: B.trainSessionMinutes,
    cost: { money: B.coachCostPerHour * 2, stamina: 30 },
    perform: (s) => {
      const gain = trainGain(s, true);
      s.player.martialSkill = clamp(s.player.martialSkill + gain, 0, 100);
      s.stats.trainHours += 2;
      setFlag(s, "life.trainedToday", 1, true);
      setFlag(s, "life.coachedOnce", 1, true);
      s.player.fatigue = clamp(s.player.fatigue + 10, 0, 100);
      addLog(s, "action", `铁教头喂了你几招实打实的，武艺 +${gain}。`);
    },
  },
  {
    id: "buy.ration",
    label: "买干粮×2",
    note: `${B.priceRation * 2}文`,
    locations: ["market"],
    minutes: 10,
    cost: { money: B.priceRation * 2 },
    perform: (s) => {
      s.inventory["ration"] = (s.inventory["ration"] ?? 0) + 2;
      addLog(s, "action", "你买了两张干粮。");
    },
  },
  {
    id: "buy.club",
    label: "买木棍防身",
    note: `${B.priceClub}文；战斗+10`,
    locations: ["market"],
    minutes: 10,
    cost: { money: B.priceClub },
    hidden: (s) => !!s.player.equippedWeapon,
    perform: (s) => {
      s.player.equippedWeapon = "club";
      addLog(s, "action", "你挑了根趁手的木棍提在手里。");
    },
  },
  {
    id: "buy.sword",
    label: "买青钢剑",
    note: `${B.priceSword}文；战斗+10`,
    locations: ["market"],
    minutes: 15,
    cost: { money: B.priceSword },
    hidden: (s) => !!s.player.equippedWeapon,
    perform: (s) => {
      s.player.equippedWeapon = "sword";
      addLog(s, "action", "你咬牙买下那柄青钢剑。");
    },
  },
  {
    id: "buy.salve",
    label: "买跌打药",
    note: `${B.priceSalve}文；重伤恢复所需`,
    locations: ["pharmacy"],
    minutes: 10,
    cost: { money: B.priceSalve },
    perform: (s) => {
      s.inventory["salve"] = (s.inventory["salve"] ?? 0) + 1;
      addLog(s, "action", "你买了一贴跌打药。");
    },
  },
  {
    id: "buy.gold-salve",
    label: "买金疮药",
    note: `${B.priceGoldSalve}文；战斗中止血`,
    locations: ["pharmacy"],
    minutes: 10,
    cost: { money: B.priceGoldSalve },
    perform: (s) => {
      s.inventory["gold-salve"] = (s.inventory["gold-salve"] ?? 0) + 1;
      addLog(s, "action", "你买了一瓶金疮药。");
    },
  },
  {
    id: "buy.coat",
    label: "买夹棉短袄",
    note: `${B.priceCoat}文；破庙过夜更暖`,
    locations: ["market"],
    minutes: 15,
    cost: { money: B.priceCoat },
    hidden: (s) => !!s.inventory["coat"],
    perform: (s) => {
      s.inventory["coat"] = 1;
      addLog(s, "action", "你买了件夹棉短袄穿上。");
    },
  },
  {
    id: "use.salve",
    label: "敷药养伤",
    note: "耗跌打药×1；每处伤势恢复快半日",
    locations: ["inn", "temple", "pharmacy"],
    minutes: 60,
    cost: { item: { id: "salve", count: 1 } },
    hidden: (s) => s.player.wounds.length === 0,
    perform: (s) => {
      for (const w of s.player.wounds) w.dueMinute = Math.max(s.clock.minutes, w.dueMinute - 720);
      addLog(s, "action", "你仔细敷上跌打药，静养了一个时辰。伤处松快了许多。");
    },
  },
  {
    id: "pay.debt",
    label: "清偿客栈赊账",
    note: "清掉全部欠款",
    locations: ["inn"],
    minutes: 15,
    available: (s) => {
      if (s.player.debt <= 0) return "并无欠账";
      if (s.player.money < s.player.debt) return "银钱不够";
      return null;
    },
    hidden: (s) => s.player.debt <= 0,
    perform: (s) => {
      const paid = s.player.debt;
      s.player.money -= paid;
      s.stats.spent += paid;
      s.player.debt = 0;
      s.relations["bai-innkeeper"] = clamp((s.relations["bai-innkeeper"] ?? 0) + 1, -10, 10);
      addLog(s, "action", `你还清了 ${paid} 文赊账，白掌柜脸色缓和了些。`);
    },
  },
  {
    id: "challenge.coach",
    label: "向铁教头讨教一场",
    note: "切磋；胜则得武馆认可",
    locations: ["school"],
    minutes: 30,
    cost: { stamina: 10 },
    hidden: (s) =>
      s.world.proofs.martial.includes("武艺·武馆切磋") || s.world.proofs.martial.length > 0 || s.role !== "游子",
    perform: (s, ctx) => {
      ctx.startStory("school.sparring");
    },
  },
  {
    id: "signup.exam",
    label: "报名照川门考核",
    note: "需两类入门证明",
    locations: ["sect-post"],
    minutes: 30,
    hidden: (s) => s.role !== "游子" || s.world.exam.signedUp,
    available: (s) => {
      const n = s.world.proofs.martial.length + s.world.proofs.social.length + s.world.proofs.virtue.length;
      return n >= 2 ? null : "尚无两类入门证明"; // 票据 002：任意两类证明即可提前报名
    },
    perform: (s, ctx) => {
      ctx.startStory("sect.exam");
    },
  },
  {
    id: "take.escort",
    label: "领护送药材的差事",
    note: "候选学徒差事",
    locations: ["sect-post"],
    minutes: 30,
    hidden: (s) => s.role !== "候选学徒" || !!s.escort,
    available: (s) => (s.player.wounds.some((w) => w.severity === "重伤") ? "伤势沉重，执事不派差" : null),
    perform: (s, ctx) => {
      // 初始化护送状态（票据 002：品行证明提高同行者初始信任）
      s.escort = {
        phase: "领命",
        route: null,
        startedMinute: null,
        deadlineMinute: 0,
        cargo: 100,
        courierSaved: null,
        courierTended: false,
        clues: [],
        fightOutcome: null,
        trust: s.world.proofs.virtue.length > 0 ? 2 : 0,
        companionDown: false,
        supplies: { extraHerbs: false, routeIntel: false },
      };
      ctx.startStory("escort.take");
    },
  },
];

/** 供事务层调用：按睡眠时长恢复 */
export function applySleepRecovery(s: GameState, minutes: number, perHour: number): void {
  const recover = (minutes / 60) * perHour;
  s.player.fatigue = clamp(s.player.fatigue - recover, 0, 100);
  s.player.hp = clamp(s.player.hp + Math.round(minutes / 60) * 2, 0, maxHp(s));
  if (minutes < B.sleepMinHealthy) {
    setFlag(s, "body.sleepDebt", dayOf(s.clock), true);
    s.player.sleepDebtDay = dayOf(s.clock);
    addLog(s, "system", "夜里没睡够，明日只怕没精神。");
  }
}
