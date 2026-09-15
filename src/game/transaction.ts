/**
 * 行动事务管线（票据 003 固定顺序）：
 * 玩家意图 → 前置验证 → 草稿 → RNG → 支付成本 → 效果 → 集中推进时间 → 调度到期处理
 * → 状态结算（饥饿/疲劳/日切） → 故事候选 → 至多一个入口 → 校验 → 原子提交。
 * 非法行动不启动事务、不消耗时间/资源/RNG；事务异常整体回滚。
 */
import { BALANCE, WEATHER_BY_DAY } from "../engine/balance";
import { dayOf } from "../engine/clock";
import { addLog, cloneState, flagBool, isRegisteredFlag, setFlag, validateState, type GameState, type CombatOutcome } from "../engine/state";
import { maxHp } from "../engine/derived";
import { applyEffects, type Effect } from "./effects";
import { beginStory, choiceBlocked, currentUnit, pickEntry, resolveChoice } from "./stories";
import { ACTIONS, actionBlocked, actionMinutes, applySleepRecovery, type ActionCtx, type ActionDef } from "./actions";
import { combatAvailable, applyCombatAction, startCombat, writeBackCombat } from "./combat";
import { edgesFrom, travelMinutes, LOCATION_NAME } from "../content/world";
import { PENDING_COMBAT_FLAG } from "../content/stories.life";
import { REGISTRY } from "../content/registry";

export type Intent =
  | { kind: "action"; id: string }
  | { kind: "move"; to: string }
  | { kind: "storyChoice"; id: string }
  | { kind: "combat"; id: string };

export interface CommitResult {
  ok: boolean;
  /** 拒绝原因（非法行动）或内部错误 */
  reason?: string;
  state: GameState;
  /** 本次提交产生的日志行 */
  logs: string[];
  storyStarted?: string;
  combatStarted?: boolean;
}

/** 视图行动 → 事务意图（UI 与模拟器共用） */
export function toIntent(v: { kind: string; id: string }): Intent {
  if (v.kind === "move") return { kind: "move", to: v.id };
  if (v.kind === "story") return { kind: "storyChoice", id: v.id };
  if (v.kind === "combat") return { kind: "combat", id: v.id };
  return { kind: "action", id: v.id };
}

export function commit(prev: GameState, intent: Intent, dev = false): CommitResult {
  const empty: string[] = [];
  // 战斗中只接受战斗行动；战斗结束态必须先写回
  if (prev.combat) {
    if (prev.combat.outcome === null && intent.kind !== "combat") {
      return { ok: false, reason: "战斗中，先解决眼前的敌人", state: prev, logs: empty };
    }
  }

  const pre = validateIntent(prev, intent);
  if (pre !== null) return { ok: false, reason: pre, state: prev, logs: empty };

  try {
    const draft = cloneState(prev);
    draft.meta.actionNumber = prev.meta.actionNumber + 1;
    const logsBefore = draft.log.length;
    let startedStory: string | undefined;
    let combatStarted = false;
    let elapsed = 0;

    const ctx: ActionCtx = {
      startStory: (unitId: string) => {
        const u = REGISTRY.units[unitId];
        if (!u) throw new Error(`故事单元不存在：${unitId}`);
        draft.random = beginStory(draft, u, draft.random, dev);
        startedStory = unitId;
      },
    };

    switch (intent.kind) {
      case "combat": {
        const reason = applyCombatAction(draft, intent.id);
        if (reason !== null) throw new Error(`回合拒绝：${reason}`);
        if (draft.combat && draft.combat.outcome !== null) {
          const rounds = draft.combat.round;
          const outcome = writeBackCombat(draft);
          routeCombatEnd(draft, outcome, dev);
          elapsed = rounds * 5; // 整场战斗按回合折算时间
          combatStarted = false;
        }
        break;
      }
      case "move": {
        const edge = edgesFrom(draft.location, escortActive(draft)).find(
          (e) => (e.from === draft.location ? e.to : e.from) === intent.to
        );
        if (!edge) throw new Error("无路可走");
        elapsed = travelMinutes(edge, draft.world.weather);
        draft.location = intent.to;
        addLog(draft, "action", `你动身前往${LOCATION_NAME[intent.to]}（${formatMinutes(elapsed)}）。`);
        break;
      }
      case "action": {
        const def = ACTIONS.find((a) => a.id === intent.id)!;
        elapsed = actionMinutes(def, draft);
        payCosts(draft, def.cost);
        def.perform?.(draft, ctx);
        if (def.sleepPerHour) {
          const perHour = def.id === "sleep.temple" ? (draft.inventory["coat"] ? 12 : 10) : def.sleepPerHour;
          applySleepRecovery(draft, elapsed, perHour);
          draft.stats.lastSleepMinute = draft.clock.minutes;
        }
        break;
      }
      case "storyChoice": {
        const unit = currentUnit(draft, REGISTRY)!;
        const choice = unit.choices.find((c) => c.id === intent.id)!;
        elapsed = choice.minutes ?? 0;
        payCosts(draft, choice.cost);
        const apply = (effects: readonly Effect[] | undefined): void => {
          if (effects) applyEffects(draft, effects);
        };
        const r = resolveChoice(draft, unit, choice, draft.random, apply, dev);
        draft.random = r.rng;
        // 故事效果产生的路程（如护送出发）：并入本次事务集中推进（票据 003）
        const pendingTravel = draft.stories.flags["escort.pendingTravel"];
        if (typeof pendingTravel === "number" && pendingTravel > 0) {
          delete draft.stories.flags["escort.pendingTravel"];
          elapsed += pendingTravel;
          if (draft.escort) {
            draft.escort.startedMinute = draft.clock.minutes + elapsed;
            draft.escort.deadlineMinute = draft.escort.startedMinute + BALANCE.escortDeadlineMinutes;
          }
        }
        if (r.next) {
          const nextUnit = REGISTRY.units[r.next];
          if (!nextUnit) throw new Error(`后续节点不存在：${r.next}`);
          draft.random = beginStory(draft, nextUnit, draft.random, dev);
          startedStory = nextUnit.id;
        }
        break;
      }
    }

    // ---- 集中推进时间 ----
    if (elapsed > 0) {
      const prevDay = dayOf(draft.clock);
      draft.clock.minutes += elapsed;
      tickVitals(draft, elapsed, wasSleepAction(intent));
      if (dayOf(draft.clock) !== prevDay) {
        setFlag(draft, "life.forageToday", 0, dev);
        setFlag(draft, "life.trainedToday", 0, dev);
      }
    }

    // ---- 行动触发的战斗（故事选择置入 pending 标记） ----
    const pending = draft.stories.flags[PENDING_COMBAT_FLAG];
    if (typeof pending === "string") {
      delete draft.stories.flags[PENDING_COMBAT_FLAG];
      startPendingCombat(draft, pending);
      combatStarted = true;
    }

    // ---- 剧情标记审计（票据 003：未注册写入在开发期报错） ----
    if (dev) {
      for (const key of Object.keys(draft.stories.flags)) {
        if (!isRegisteredFlag(key)) throw new Error(`未注册的剧情标记命名空间：${key}`);
      }
    }

    // ---- 调度到期处理（同时到期按固定优先级） ----
    fireScheduler(draft, dev);

    // ---- 故事入口评估（无活动故事、非战斗时） ----
    if (!draft.stories.active && !draft.combat) {
      const picked = pickEntry(draft, REGISTRY, draft.random);
      draft.random = picked.rng;
      if (picked.unit) {
        draft.random = beginStory(draft, picked.unit, draft.random, dev);
        startedStory = picked.unit.id;
      }
    }

    // ---- 校验新状态（失败整体回滚） ----
    const issues = validateState(draft);
    if (issues.length > 0) throw new Error(`状态校验失败：${issues.join("；")}`);

    return {
      ok: true,
      state: draft,
      logs: draft.log.slice(logsBefore).map((l) => l.text),
      storyStarted: startedStory,
      combatStarted,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), state: prev, logs: empty };
  }
}

function escortActive(s: GameState): boolean {
  return !!s.escort && s.escort.phase !== "结束";
}

function validateIntent(s: GameState, intent: Intent): string | null {
  switch (intent.kind) {
    case "combat": {
      if (!s.combat) return "当前没有战斗";
      const v = combatAvailable(s).find((a) => a.id === intent.id);
      if (!v) return "无此战斗行动";
      return v.reason;
    }
    case "move": {
      if (s.stories.active) return "剧情进行中，先做完眼前的抉择";
      const ok = edgesFrom(s.location, escortActive(s)).some(
        (e) => (e.from === s.location ? e.to : e.from) === intent.to
      );
      return ok ? null : "无路可走";
    }
    case "action": {
      const def = ACTIONS.find((a) => a.id === intent.id);
      if (!def) return "无此行动";
      return actionBlocked(s, def);
    }
    case "storyChoice": {
      const unit = currentUnit(s, REGISTRY);
      if (!unit) return "当前没有待抉择的故事";
      const choice = unit.choices.find((c) => c.id === intent.id);
      if (!choice) return "无此选项";
      return choiceBlocked(s, choice);
    }
  }
}

function payCosts(
  s: GameState,
  cost?: { money?: number; stamina?: number; item?: { id: string; count: number } }
): void {
  if (cost?.money) {
    s.player.money -= cost.money;
    s.stats.spent += cost.money;
  }
  if (cost?.stamina) s.player.stamina = Math.max(0, s.player.stamina - cost.stamina);
  if (cost?.item) {
    s.inventory[cost.item.id] = (s.inventory[cost.item.id] ?? 0) - cost.item.count;
    if (s.inventory[cost.item.id] <= 0) delete s.inventory[cost.item.id];
  }
}

function wasSleepAction(intent: Intent): boolean {
  return intent.kind === "action" && intent.id.startsWith("sleep.");
}

/** 集中结算：饥饿/疲劳按小时速率累积；空腹掉气血（票据 008 维护税） */
export function tickVitals(s: GameState, minutes: number, asleep: boolean): void {
  const hours = minutes / 60;
  const p = s.player;
  const hungerRate = asleep ? BALANCE.hungerAsleepPerHour : BALANCE.hungerPerHour;
  const wasHungry = p.hunger >= BALANCE.debuffThreshold;
  p.hunger = Math.min(100, p.hunger + hours * hungerRate);
  if (!wasHungry && p.hunger >= BALANCE.debuffThreshold) {
    addLog(s, "system", "腹中空空，手脚开始发软。");
  }
  if (!asleep) p.fatigue = Math.min(100, p.fatigue + hours * BALANCE.fatiguePerHour);
  if (p.hunger >= 100 && !asleep) {
    const loss = Math.max(0, Math.floor(hours));
    if (loss > 0) {
      p.hp = Math.max(1, p.hp - loss);
      addLog(s, "system", "你饿得眼前发花，气血受损。");
    }
  }
  s.stats.lastWakeMinute = s.clock.minutes;
}

function fireScheduler(s: GameState, dev: boolean): void {
  const due = s.scheduler
    .filter((it) => it.dueMinute <= s.clock.minutes)
    .sort((a, b) => a.dueMinute - b.dueMinute || a.priority - b.priority);
  for (const item of due) {
    s.scheduler = s.scheduler.filter((it) => it.id !== item.id);
    switch (item.kind) {
      case "heal": {
        const wid = String(item.payload?.woundId ?? "");
        const w = s.player.wounds.find((x) => x.id === wid);
        if (w) {
          s.player.wounds = s.player.wounds.filter((x) => x.id !== wid);
          addLog(s, "system", `伤势痊愈：${w.severity}（${w.source}）已无大碍。`);
        }
        break;
      }
      case "weather": {
        const day = Number(item.payload?.day ?? 0);
        const weather = WEATHER_BY_DAY[day];
        if (weather) {
          s.world.weather = weather;
          addLog(s, "system", `第${day}日，天色转${weather}。`);
        }
        break;
      }
      case "debt-due": {
        if (s.player.debt > 0) {
          s.player.debt = Math.ceil((s.player.debt * (1 + BALANCE.debtPenaltyRate)) / 10) * 10;
          setFlag(s, "life.debtDefaulted", true, dev);
          s.relations["bai-innkeeper"] = Math.max(-10, (s.relations["bai-innkeeper"] ?? 0) - 1);
          addLog(s, "system", `客栈赊账到期未清，利上滚利，现欠 ${s.player.debt} 文。`);
        }
        break;
      }
      case "exam": {
        if (s.role === "游子" && !s.world.exam.signedUp) {
          const n = s.world.proofs.martial.length + s.world.proofs.social.length + s.world.proofs.virtue.length;
          if (n < 2) {
            setFlag(s, "sect.guaranteePending", true, dev);
            addLog(s, "system", "考核之期已到，证明仍不足。照川门顾执事传话，让你去一趟。");
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

function startPendingCombat(s: GameState, kind: string): void {
  if (kind === "sparring") {
    s.stories.flags["world.lastFight"] = "sparring";
    startCombat(s, "教学切磋", { name: "铁教头", hp: 90, stamina: 100, difficulty: 60 }, false);
  } else if (kind === "wharf") {
    s.stories.flags["world.lastFight"] = "wharf";
    startCombat(s, "伏击", { name: "泼皮头目", hp: 50, stamina: 70, difficulty: 40 }, false);
  } else if (kind === "ambush") {
    s.stories.flags["world.lastFight"] = "ambush";
    const intel = s.escort?.supplies.routeIntel ?? false;
    const alerted = flagBool(s, "escort.alerted");
    const firstStrike = s.world.proofs.martial.length > 0 || alerted;
    startCombat(
      s,
      "伏击",
      {
        name: "伪装山匪头目",
        hp: BALANCE.combat.ambushHp,
        stamina: BALANCE.combat.ambushStamina,
        difficulty: intel || alerted ? 50 : 55,
      },
      firstStrike
    );
    if (flagBool(s, "escort.joined") && s.combat) {
      s.combat.enemy.stamina = Math.max(0, s.combat.enemy.stamina - 10);
      addLog(s, "combat", "沈青梧抢步缠住侧翼，敌人阵脚一乱。");
    }
    if (flagBool(s, "escort.guardFirst") && s.combat) {
      s.combat.defending = true;
    }
  }
}

/** 四种战斗结局写回江湖生活循环（票据 004：全部失败延续，无死亡结局） */
function routeCombatEnd(s: GameState, outcome: CombatOutcome | null, dev: boolean): void {
  if (!outcome) return;
  const scene = s.stories.flags["world.lastFight"];

  if (scene === "ambush" && s.escort) {
    s.escort.fightOutcome = outcome;
    const nextByOutcome: Record<CombatOutcome, string> = {
      victory: "escort.fight.victory",
      fled: "escort.fight.fled",
      defeated: "escort.fight.defeated",
      captured: "escort.fight.captured",
    };
    const u = REGISTRY.units[nextByOutcome[outcome]];
    if (u) s.random = beginStory(s, u, s.random, dev);
    delete s.stories.flags["world.lastFight"];
    return;
  }

  if (scene === "sparring") {
    if (outcome === "victory") {
      if (!s.world.proofs.martial.includes("武艺·武馆切磋")) {
        s.world.proofs.martial.push("武艺·武馆切磋");
        s.relations["tie-coach"] = Math.min(10, (s.relations["tie-coach"] ?? 0) + 2);
        addLog(s, "story", "【入门证明】武艺证明到手：武馆切磋胜铁教头。");
      }
    } else {
      // 切磋点到即止：气血回稳，不留伤
      s.player.hp = Math.max(s.player.hp, Math.ceil(maxHp(s) * 0.6));
      s.player.wounds = s.player.wounds.filter((w) => w.source !== "教学切磋");
      addLog(s, "combat", "铁教头收拳：“点到即止。回去再练。”");
    }
  } else if (scene === "wharf") {
    if (outcome === "victory") {
      const u = REGISTRY.units["wharf.night.guard.after"];
      if (u) s.random = beginStory(s, u, s.random, dev);
    } else {
      addLog(s, "story", "泼皮们一哄而散，你没能拦下。马把头叹了口气，加了巡夜。");
    }
  }
  delete s.stories.flags["world.lastFight"];
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}小时` : `${h}小时${m}分`;
}

/* ---------------- 供 UI / 模拟器的视图（只读，不消耗 RNG、不改状态） ---------------- */

export interface ActionView {
  kind: "action" | "move" | "story" | "combat";
  id: string;
  label: string;
  note?: string;
  /** 常规行动：不可用 = 禁用并示因；情境行动：不可用 = 隐藏（票据 004/006） */
  hidden: boolean;
  disabled: boolean;
  reason?: string;
}

export function listView(s: GameState): ActionView[] {
  const out: ActionView[] = [];
  if (s.combat) {
    for (const a of combatAvailable(s)) {
      out.push({
        kind: "combat",
        id: a.id,
        label: a.label,
        note: a.effect,
        hidden: a.situational && a.reason !== null,
        disabled: a.reason !== null,
        reason: a.reason ?? undefined,
      });
    }
    return out;
  }
  const unit = currentUnit(s, REGISTRY);
  if (unit) {
    for (const c of unit.choices) {
      const reason = choiceBlocked(s, c);
      out.push({
        kind: "story",
        id: c.id,
        label: c.label,
        note: c.note,
        hidden: !!c.situational && reason !== null,
        disabled: reason !== null,
        reason: reason ?? undefined,
      });
    }
    return out;
  }
  for (const def of ACTIONS) {
    const blocked = actionBlocked(s, def);
    const hiddenByCond = def.hidden?.(s) ?? false;
    out.push({
      kind: "action",
      id: def.id,
      label: def.label,
      note: def.note,
      hidden: hiddenByCond || (blocked === "不在此地" && def.locations !== "*"),
      disabled: blocked !== null,
      reason: blocked ?? undefined,
    });
  }
  for (const e of edgesFrom(s.location, escortActive(s))) {
    const to = e.from === s.location ? e.to : e.from;
    const mins = travelMinutes(e, s.world.weather);
    out.push({
      kind: "move",
      id: to,
      label: `前往${LOCATION_NAME[to]}`,
      note: mins >= 60 ? "路远" : undefined,
      hidden: false,
      disabled: false,
    });
  }
  return out;
}
