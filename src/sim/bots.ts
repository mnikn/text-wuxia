/**
 * 模拟器（票据 008）：四 bot 断言 + 软锁检测 + margin 报告。
 * 全部直跑真实引擎、真实行动注册表与真实故事内容，与运行时同源 balance.ts。
 */
import { createNewGame } from "../game/newGame";
import { commit, listView, toIntent, type Intent } from "../game/transaction";
import type { GameState } from "../engine/state";
import { BALANCE } from "../engine/balance";
import { dayOf } from "../engine/clock";
import { LOCATION_NAME, nextHop } from "../content/world";

export interface SimReport {
  bot: string;
  actions: number;
  debtDefaulted: boolean;
  isCandidate: boolean;
  skill: number;
  proofs: number;
  money: number;
  debt: number;
  finishedMinute: number | null;
  marginMinutes: number | null;
  softlockViolations: number;
}

const LOC_BTN: Record<string, string> = Object.fromEntries(
  Object.entries(LOCATION_NAME).map(([id, name]) => [id, `前往${name}`])
);

export interface Goal {
  /** 返回需要前往的地点 id（若目标不在本地）；返回 null 表示本 goal 当地即可执行或跳过 */
  cond: (s: GameState) => boolean;
  goto?: string | null;
  prefs: string[];
}

/** 依序评估 goals：cond 成立时，若需换地点走 BFS 下一跳，否则返回行动偏好 */
export function machinePrefs(s: GameState, goals: Goal[]): string[] {
  for (const g of goals) {
    if (!g.cond(s)) continue;
    if (g.goto && s.location !== g.goto) {
      const hop = nextHop(s.location, g.goto);
      if (hop) return [LOC_BTN[hop]];
      continue; // 不可达则跳过该 goal
    }
    return g.prefs;
  }
  return [];
}

/** 通用生活循环：goals 驱动，直到考核死线/步数上限。
 * storyPolicy：first=进取型（取第一选项），last=规避型（取最后可选选项）。 */
export function runBot(
  name: string,
  originId: string,
  attrs: Record<string, number>,
  goals: Goal[],
  storyPolicy: "first" | "last" = "first",
  maxSteps = 5000
): { s: GameState; violations: number; finishedMinute: number | null } {
  let s = createNewGame({ name, originId, attrs, seed: 20260914 });
  let violations = 0;
  let finishedMinute: number | null = null;
  const bothDone = (g: GameState): boolean =>
    g.player.debt <= 0 &&
    g.player.martialSkill >= BALANCE.examThreshold &&
    g.world.proofs.martial.length + g.world.proofs.social.length + g.world.proofs.virtue.length >= 2;
  let guard = 0;
  while (s.clock.minutes < BALANCE.examMinute && guard++ < maxSteps) {
    const hour = Math.floor((s.clock.minutes % 1440) / 60);
    let views = listView(s).filter((v) => !v.hidden && !v.disabled);
    let chosen: (typeof views)[number] | null = null;
    if (!s.stories.active) {
      const prefs = machinePrefs(s, goals);
      for (const p of prefs) {
        const hit = views.find((v) => v.id === p || v.label.includes(p));
        if (hit) {
          chosen = hit;
          break;
        }
      }
      if (!chosen) chosen = views[0] ?? null;
    } else {
      chosen = storyPolicy === "last" ? (views[views.length - 1] ?? null) : (views[0] ?? null);
    }
    if (!chosen) {
      violations += 1;
      break;
    }
    const r = commit(s, toIntent(chosen), true);
    if (!r.ok) {
      violations += 1;
      break;
    }
    s = r.state;
    if (finishedMinute === null && bothDone(s)) finishedMinute = s.clock.minutes;
  }
  return { s, violations, finishedMinute };
}

const ATTRS = { arm: 5, agi: 5, con: 5, ins: 6, com: 5, luck: 4 };

/* ---------------- 均衡流：真实玩家画像——客栈住宿、置办兵刃、教练课，兼顾收支 ---------------- */
export function balancedGoals(): Goal[] {
  return [
    { cond: (s) => s.player.hunger > 40 && (s.inventory["ration"] ?? 0) > 0, prefs: ["啃干粮"] },
    { cond: (s) => s.player.hunger > 40 && s.player.money >= 20, goto: "inn", prefs: ["吃顿热饭"] },
    { cond: (s) => s.player.debt > 0 && s.player.money >= s.player.debt, goto: "inn", prefs: ["清偿客栈赊账"] },
    {
      cond: (s) => {
        const n = s.world.proofs.martial.length + s.world.proofs.social.length + s.world.proofs.virtue.length;
        return n >= 2 && s.player.debt <= 0 && s.player.martialSkill >= BALANCE.examThreshold && s.role === "游子";
      },
      goto: "sect-post",
      prefs: ["报名照川门考核", "行礼受训"],
    },
    { cond: (s) => !s.player.equippedWeapon && s.player.money >= 20, goto: "market", prefs: ["买木棍防身"] },
    { cond: (s) => (s.clock.minutes % 1440) >= 21 * 60 && s.player.money >= 50, goto: "inn", prefs: ["客栈歇息"] },
    { cond: (s) => (s.clock.minutes % 1440) >= 21 * 60, goto: "temple", prefs: ["城隍庙侧殿将就一夜"] },
    {
      cond: (s) => s.world.proofs.social.length === 0 && !s.stories.flags["npc.suTaskTaken"],
      goto: "pharmacy",
      prefs: ["应下这差事"],
    },
    {
      cond: (s) => s.world.proofs.social.length === 0 && Number(s.stories.flags["npc.suFavors"] ?? 0) < 3,
      goto: "pharmacy",
      prefs: ["送西街病家", "送客栈东家", "送码头船工"],
    },
    {
      cond: (s) => s.world.proofs.social.length === 0 && Number(s.stories.flags["npc.suFavors"] ?? 0) >= 3,
      goto: "pharmacy",
      prefs: ["拜谢收下"],
    },
    { cond: (s) => s.player.martialSkill < BALANCE.examThreshold, goto: "school", prefs: ["武馆练功"] },
    {
      cond: (s) => s.world.proofs.martial.length === 0 && s.player.martialSkill >= BALANCE.examThreshold - 5,
      goto: "school",
      prefs: ["向铁教头讨教一场", "应战"],
    },
    { cond: (s) => s.player.money < 120 && !s.stories.flags["life.trainedToday"], goto: "wharf", prefs: ["码头扛活"] },
    { cond: (s) => !s.stories.flags["life.trainedToday"], goto: "wharf", prefs: ["码头扛活"] },
    { cond: () => true, goto: "wharf", prefs: ["码头扛活"] },
  ];
}

/* ---------------- 训练流：练武+考证，从不还债（必违约） ---------------- */
export function trainerGoals(): Goal[] {
  return [
    { cond: (s) => s.player.hunger > 55 && (s.inventory["ration"] ?? 0) > 0, prefs: ["啃干粮"] },
    { cond: (s) => s.player.hunger > 55 && s.player.money >= 20, goto: "market", prefs: ["吃顿热饭"] },
    { cond: (s) => (s.clock.minutes % 1440) >= 21 * 60, goto: "temple", prefs: ["城隍庙侧殿将就一夜"] },
    { cond: (s) => !s.player.equippedWeapon && s.player.money >= 20, goto: "market", prefs: ["买木棍防身"] },
    { cond: (s) => s.player.money < 40, goto: "market", prefs: ["市集帮工"] },
    {
      cond: (s) => s.world.proofs.social.length === 0 && !s.stories.flags["npc.suTaskTaken"],
      goto: "pharmacy",
      prefs: ["应下这差事"],
    },
    {
      cond: (s) => s.world.proofs.social.length === 0 && Number(s.stories.flags["npc.suFavors"] ?? 0) < 3,
      goto: "pharmacy",
      prefs: ["送西街病家", "送客栈东家", "送码头船工"],
    },
    {
      cond: (s) => s.world.proofs.social.length === 0 && Number(s.stories.flags["npc.suFavors"] ?? 0) >= 3,
      goto: "pharmacy",
      prefs: ["拜谢收下"],
    },
    { cond: (s) => s.world.proofs.martial.length === 0 && s.player.martialSkill < 52, goto: "school", prefs: ["武馆练功", "请铁教头指点"] },
    {
      cond: (s) => s.world.proofs.martial.length === 0,
      goto: "school",
      prefs: ["向铁教头讨教一场", "应战"],
    },
    {
      cond: (s) => {
        const n = s.world.proofs.martial.length + s.world.proofs.social.length + s.world.proofs.virtue.length;
        return n >= 2 && s.role === "游子";
      },
      goto: "sect-post",
      prefs: ["报名照川门考核", "行礼受训"],
    },
    { cond: () => true, goto: "school", prefs: ["武馆练功"] },
  ];
}

/* ---------------- 打工流：清债但不考证 ---------------- */
export function workerGoals(): Goal[] {
  return [
    { cond: (s) => s.player.hunger > 55 && (s.inventory["ration"] ?? 0) > 0, prefs: ["啃干粮"] },
    { cond: (s) => s.player.hunger > 55 && s.player.money >= 20, goto: "inn", prefs: ["吃顿热饭"] },
    { cond: (s) => (s.clock.minutes % 1440) >= 21 * 60, goto: "temple", prefs: ["城隍庙侧殿将就一夜"] },
    { cond: (s) => s.player.debt > 0 && s.player.money >= s.player.debt + 100, goto: "inn", prefs: ["清偿客栈赊账"] },
    { cond: () => true, goto: "wharf", prefs: ["码头扛活"] },
  ];
}

/* ---------------- 摆烂流：能躺就躺（必落担保/失败结局） ---------------- */
export function slackerGoals(): Goal[] {
  return [
    { cond: (s) => s.player.hunger > 55 && (s.inventory["ration"] ?? 0) > 0, prefs: ["啃干粮"] },
    { cond: (s) => (s.clock.minutes % 1440) >= 20 * 60, goto: "temple", prefs: ["城隍庙侧殿将就一夜"] },
    { cond: () => true, goto: "west-street", prefs: ["市集帮工", "吃顿热饭"] },
  ];
}

export function runAllBots(): SimReport[] {
  const reports: SimReport[] = [];
  const summarize = (bot: string, r: { s: GameState; violations: number; finishedMinute: number | null }): SimReport => ({
    bot,
    actions: r.s.meta.actionNumber,
    debtDefaulted: r.s.stories.flags["life.debtDefaulted"] === true,
    isCandidate: r.s.role !== "游子",
    skill: r.s.player.martialSkill,
    proofs: r.s.world.proofs.martial.length + r.s.world.proofs.social.length + r.s.world.proofs.virtue.length,
    money: r.s.player.money,
    debt: r.s.player.debt,
    finishedMinute: r.finishedMinute,
    marginMinutes: r.finishedMinute === null ? null : BALANCE.examMinute - r.finishedMinute,
    softlockViolations: r.violations,
  });
  reports.push(summarize("均衡", runBot("均衡客", "student", ATTRS, balancedGoals())));
  reports.push(summarize("训练", runBot("武痴", "student", ATTRS, trainerGoals())));
  reports.push(summarize("打工", runBot("力工", "porter", ATTRS, workerGoals(), "last")));
  reports.push(summarize("摆烂", runBot("闲汉", "refugee", ATTRS, slackerGoals(), "last")));
  return reports;
}
