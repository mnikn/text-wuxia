/**
 * 交互壳（票据 005 方案 D）：全屏正文随文流、顶部地点胶囊导航、左侧抽屉（状态/行囊/日志）、
 * logline 嵌入正文流；桌面 ≥900px 抽屉固化为常驻栏。
 * 本层只读渲染 + 派发意图；领域规则全部在事务管线内（票据 003）。
 */
import "./style.css";
import { formatClock, formatTimeOfDay } from "../engine/clock";
import { maxHp, maxNeili, maxStamina, effectiveSkill } from "../engine/derived";
import { BAL_DEBT_DUE_DAY, derivedHpPreview } from "../engine/preview";
import { BALANCE } from "../engine/balance";
import { ATTR_LABELS, type GameState } from "../engine/state";
import { currentUnit } from "../game/stories";
import { REGISTRY } from "../content/registry";
import { LOCATION_NAME, NPCS, ITEM_NAME, ITEMS, edgesFrom, travelMinutes } from "../content/world";
import { ORIGINS } from "../content/origins";
import { listView, commit, formatMinutes, type ActionView } from "../game/transaction";
import { browserStore, exportText, importText, SLOT_LABEL, SLOTS, type SlotId } from "../save/storage";
import { createNewGame } from "../game/newGame";

let state: GameState | null = null;
let store = browserStore();
let drawerTab: "status" | "bag" | "log" = "status";

const app = document.getElementById("app")!;

/* ---------------- 骨架 ---------------- */
app.innerHTML = `
  <div id="screen-title" class="screen">
    <div class="title-hero">
      <h1>清河江湖</h1>
      <p>写实架空武侠 · 江湖生活模拟 · 完整试玩切片</p>
    </div>
    <div class="menu">
      <button class="btn primary" id="bt-new">新的江湖</button>
      <button class="btn" id="bt-continue">继续江湖</button>
      <button class="btn" id="bt-saves">存档与读档</button>
      <button class="btn" id="bt-import">导入存档</button>
    </div>
    <p class="logline" style="margin-top:24px;text-align:center">手机可“添加到主屏幕”离线游玩 · 存档保存在本机浏览器</p>
    <input type="file" id="file-import" accept="application/json" style="display:none" />
  </div>

  <div id="screen-creation" class="screen">
    <h2 class="sect">出身</h2>
    <div id="origins"></div>
    <h2 class="sect">姓名</h2>
    <input id="char-name" maxlength="12" placeholder="道上的名号" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:6px" />
    <h2 class="sect">六项禀赋 <span class="pts-left" id="pts-left"></span></h2>
    <div id="attrs"></div>
    <div class="reveal" id="derived-preview"></div>
    <div class="menu" style="margin-top:18px">
      <button class="btn primary" id="bt-start">入局清河县</button>
      <button class="btn" id="bt-back">回 TITLE</button>
    </div>
  </div>

  <div id="game">
    <div class="tophead"><div class="locs" id="locs"></div></div>
    <div class="scroll" id="scroll">
      <div id="ending-slot"></div>
      <div class="story" id="story-body"></div>
      <div class="choices" id="choices"></div>
      <p class="logline" id="recent-logs" style="margin-top:16px"></p>
    </div>
    <button class="edge-handle" id="handle">状态 ▸</button>
    <div class="backdrop" id="backdrop"></div>
    <aside class="drawer" id="drawer">
      <div class="dhead">
        <span class="when" id="dhead-when"></span>
        <span class="meters" id="dhead-meters"></span>
      </div>
      <nav class="dtabs" id="dtabs">
        <button data-tab="status">状态</button>
        <button data-tab="bag">行囊</button>
        <button data-tab="log">日志</button>
      </nav>
      <div class="dbody" id="dbody"></div>
      <div style="flex:none;padding:10px 16px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);display:flex;gap:8px">
        <button class="btn" style="padding:9px" id="bt-game-saves">存档</button>
        <button class="btn" style="padding:9px" id="bt-game-title">回题页</button>
      </div>
    </aside>
  </div>

  <div class="overlay" id="saves-overlay">
    <div class="box">
      <h2 class="sect" style="margin-top:0">存档</h2>
      <div id="slots"></div>
      <div class="menu" style="margin-top:14px">
        <button class="btn" id="bt-export">导出自动档为 JSON</button>
        <button class="btn" id="bt-close-saves">关闭</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function toast(msg: string): void {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 2200);
}

/* ---------------- 标题页 ---------------- */
async function showTitle(): Promise<void> {
  setScreen("title");
  const meta = await store.peekMeta("auto");
  ($("bt-continue") as HTMLButtonElement).disabled = !meta;
  $("bt-continue").textContent = meta ? `继续江湖（${meta.gameTime} · ${meta.location}）` : "继续江湖";
}

function setScreen(name: "title" | "creation" | "game"): void {
  $("screen-title").classList.toggle("on", name === "title");
  $("screen-creation").classList.toggle("on", name === "creation");
  $("game").classList.toggle("on", name === "game");
}

/* ---------------- 角色创建 ---------------- */
let selOrigin = ORIGINS[0].id;
const attrs: Record<string, number> = { arm: 3, agi: 3, con: 3, ins: 3, com: 3, luck: 3 };
const ATTR_ORDER = ["arm", "agi", "con", "ins", "com", "luck"] as const;
const nameInput = document.getElementById("char-name") as HTMLInputElement;

function ptsLeft(): number {
  const used = ATTR_ORDER.reduce((acc, k) => acc + attrs[k], 0);
  return BALANCE.attrPointBuy - used;
}

function renderCreation(): void {
  $("origins").innerHTML = ORIGINS.map(
    (o) => `
    <button class="origin-card ${o.id === selOrigin ? "on" : ""}" data-origin="${o.id}">
      <b>${o.name}</b>　<small>银钱 ${o.money} 文 · 武艺 ${o.martialSkill}</small>
      <p>${o.desc}</p>
    </button>`
  ).join("");
  $("origins").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      selOrigin = (b as HTMLElement).dataset.origin!;
      renderCreation();
    })
  );
  $("pts-left").textContent = `（剩余 ${ptsLeft()} 点）`;
  $("attrs").innerHTML = ATTR_ORDER.map((k) => {
    const originBonus = ORIGINS.find((o) => o.id === selOrigin)!.attrBonus[k] ?? 0;
    return `
    <div class="attr-row">
      <span class="name">${ATTR_LABELS[k]}</span>
      <button data-dec="${k}" ${attrs[k] <= 1 ? "disabled" : ""}>−</button>
      <span class="val">${attrs[k]}</span>
      <button data-inc="${k}" ${attrs[k] >= 10 || ptsLeft() <= 0 ? "disabled" : ""}>＋</button>
      <small class="logline">${originBonus ? `出身+${originBonus}` : ""}</small>
    </div>`;
  }).join("");
  $("attrs").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const el = b as HTMLElement;
      const k = el.dataset.inc ?? el.dataset.dec!;
      attrs[k] += el.dataset.inc ? 1 : -1;
      renderCreation();
    })
  );
  const origin = ORIGINS.find((o) => o.id === selOrigin)!;
  const con = attrs.con + (origin.attrBonus.con ?? 0);
  const preview = `气血 ${derivedHpPreview(con)} · 基本武艺 ${origin.martialSkill} · 初始银钱 ${origin.money} 文`;
  $("derived-preview").textContent = preview;
}

function startGame(s: GameState): void {
  state = s;
  setScreen("game");
  renderGame();
  void store.write(s, "auto");
}

/* ---------------- 游戏主渲染 ---------------- */
function renderGame(): void {
  if (!state) return;
  const s = state;
  renderCapsules(s);
  renderBody(s);
  renderDrawer(s);
}

function renderCapsules(s: GameState): void {
  const el = $("locs");
  const storyLock = !!s.stories.active || !!s.combat;
  const here = `<button class="now">${LOCATION_NAME[s.location]}</button>`;
  const rest = edgesFrom(s.location, !!s.escort && s.escort.phase !== "结束")
    .map((e) => {
      const to = e.from === s.location ? e.to : e.from;
      const mins = travelMinutes(e, s.world.weather);
      const cost = mins >= 60 ? "一个时辰" : mins >= 30 ? "半个时辰" : `${mins}分`;
      return `<button data-to="${to}" ${storyLock ? "disabled" : ""}>${LOCATION_NAME[to]} <span class="cost">${cost}</span></button>`;
    })
    .join("");
  el.innerHTML = here + rest;
  el.querySelectorAll("button[data-to]").forEach((b) =>
    b.addEventListener("click", () => dispatch({ kind: "move", to: (b as HTMLElement).dataset.to! }))
  );
}

function sceneHead(s: GameState): string {
  const unit = currentUnit(s, REGISTRY);
  if (unit) return unit.title;
  if (s.combat) return s.combat.kind === "伏击" ? "战斗 · 伏击" : "切磋 · 武馆";
  return `${LOCATION_NAME[s.location]} · ${formatTimeOfDay(s.clock)} · ${s.world.weather}`;
}

function storyParagraphs(s: GameState): string[] {
  const unit = currentUnit(s, REGISTRY);
  if (unit) return unit.text(s, s.stories.active?.enterChecks ?? {});
  if (s.combat) return [];
  const loc = LOCATION_NAME[s.location];
  const lines = [describeLocation(s)];
  void loc;
  return lines;
}

function describeLocation(s: GameState): string {
  switch (s.location) {
    case "west-street":
      return "西街人声鼎沸。往南是客栈，往北市集、药铺、武馆一线排开；出东门便是官道。";
    case "inn":
      return "大堂里茶客零落，白掌柜在柜后拨算盘。后院客房干净，晚市有热饭。";
    case "market":
      return "菜担与铁器挤在一处。混一日工钱，或打听些消息，都在此处。";
    case "pharmacy":
      return "百子柜一字排开，苏掌柜提笔开方。收购山间药草，也卖金疮跌打。";
    case "school":
      return "场子里木人桩排成列，器械架上刀枪雪亮。铁教头抱着臂看人练拳。";
    case "wharf":
      return "号子声起起伏伏，货堆高过人头。马把头的嗓门盖过一切。";
    case "temple":
      return "香案上只有三炷残香。庙祝扫着落叶，侧殿门虚掩着，可容人过夜。";
    case "sect-post":
      return "院门挂着照川门的云纹灯。顾执事的正厅敞着，沈青梧在院里练剑。";
    case "city-gate":
      return "城门洞凉风穿堂。兵丁查验过往。出城往东是官道，往东南岔进山道。";
    case "mountain-pass":
      return "山道口立着一块指路碑：官道绕东，山道穿岭。松涛一阵接一阵。";
    case "way-station":
      return "驿站围墙塌了一角，焦糊味未散。驿卒们正在善后，伤兵安置在厢房。";
    default:
      return "";
  }
}

function goalHint(s: GameState): string {
  if (s.ending) return "已入照川门，清河县任你行走。日志页可查看未完成之事。";
  if (s.role === "记名弟子") return "入门仪式进行中。";
  if (s.role === "候选学徒") {
    if (s.escort) return "护送进行中——按辰时之约送达青云驿。";
    return "候选学徒之身：回照川门驻点，领取护送药材的差事。";
  }
  const n = s.world.proofs.martial.length + s.world.proofs.social.length + s.world.proofs.virtue.length;
  if (n >= 2) return "两类入门证明在手：前往照川门驻点报名考核。";
  return "目标：七日内取得两类入门证明（武艺 / 人情 / 品行），任意两类即可报名照川门。日志页可查线索。";
}

function pct(v: number, max: number): number {
  return Math.max(0, Math.min(100, (v / max) * 100));
}

function meterHtml(label: string, cls: string, v: number, max: number): string {
  return `<span class="meter ${cls}">${label} <i><b style="width:${pct(v, max)}%"></b></i> ${Math.round(v)}</span>`;
}

function renderBody(s: GameState): void {
  const endingSlot = $("ending-slot");
  if (s.ending) {
    endingSlot.innerHTML = `
      <div class="ending-banner">
        <div class="tier">入门 · ${s.ending.tier}</div>
        <p>${s.ending.detail}　入门方向：<b>${s.ending.direction}</b>。</p>
        <p>你已是照川门记名弟子。县城生活仍在继续——未竟之事见日志页。</p>
      </div>`;
  } else {
    endingSlot.innerHTML = "";
  }

  const body = $("story-body");
  const recent: string[] = [];
  if (s.combat) {
    const cb = s.combat;
    const p = cb.player;
    body.innerHTML = `
      <p class="scene-head">${sceneHead(s)}</p>
      <div class="combat-panels">
        <div class="cpanel"><h3>你（${s.player.name}）</h3>
          ${barHtml("气血", "", p.hp, p.hpMax)}
          ${barHtml("体力", "tili", p.stamina, p.staminaMax)}
          ${barHtml("内力", "neili", p.neili, p.neiliMax)}
          <div class="chips">
            <span class="chip">${p.posture}</span>
            <span class="chip">兵刃：${p.blade}</span>
            <span class="chip">金疮药 ×${p.goldSalves}</span>
            ${cb.firstStrikePending ? '<span class="chip bad">先手在握</span>' : ""}
          </div>
        </div>
        <div class="cpanel"><h3>${cb.enemy.name}</h3>
          ${barHtml("气血", "", cb.enemy.hp, cb.enemy.maxHp)}
          ${barHtml("体力", "tili", cb.enemy.stamina, cb.enemy.maxStamina)}
          <div class="chips"><span class="chip">${cb.enemy.posture}</span><span class="chip">难度 ${cb.enemy.difficulty}</span></div>
        </div>
      </div>
      <div class="combat-log">${cb.log.slice(-10).map((l) => (l.startsWith("——") ? `<p class="round-head">${l}</p>` : `<p>${l}</p>`)).join("")}</div>`;
    recent.push(...s.log.slice(-4).map((l) => l.text));
  } else {
    const paras = storyParagraphs(s);
    body.innerHTML = `
      <p class="scene-head">${sceneHead(s)}</p>
      ${paras.map((p) => `<p>${p}</p>`).join("")}
      <div class="reveal">${goalHint(s)}</div>`;
    for (const l of s.log.slice(-6)) recent.push(l.text);
  }

  const choicesEl = $("choices");
  const views = listView(s);
  choicesEl.innerHTML = views
    .filter((v) => !v.hidden)
    .map(
      (v) => `
      <button class="choice" data-kind="${v.kind}" data-id="${v.id}" ${v.disabled ? "disabled" : ""}>
        ${v.label}
        ${v.note ? `<small>${v.note}</small>` : ""}
        ${v.disabled && v.reason ? `<span class="why">${v.reason}</span>` : ""}
      </button>`
    )
    .join("");
  choicesEl.querySelectorAll("button.choice").forEach((b) =>
    b.addEventListener("click", () => {
      const el = b as HTMLElement;
      const kind = el.dataset.kind as ActionView["kind"];
      const id = el.dataset.id!;
      if (kind === "move") dispatch({ kind: "move", to: id });
      else if (kind === "combat") dispatch({ kind: "combat", id });
      else if (kind === "story") dispatch({ kind: "storyChoice", id });
      else dispatch({ kind: "action", id });
    })
  );

  $("recent-logs").innerHTML = recent
    .slice(-5)
    .map((t) => `<span class="logline">${t}</span>`)
    .join("<br/>");

  $("scroll").scrollTop = $("scroll").scrollHeight;
}

function barHtml(label: string, cls: string, v: number, max: number): string {
  return `<div class="bar-row"><span class="label">${label}</span><span class="bar ${cls}"><i style="width:${pct(v, max)}%"></i></span><span class="num">${Math.max(0, Math.round(v))}/${max}</span></div>`;
}

function renderDrawer(s: GameState): void {
  $("dhead-when").textContent = `${formatClock(s.clock)} · ${formatTimeOfDay(s.clock)} · ${LOCATION_NAME[s.location]}`;
  $("dhead-meters").innerHTML =
    meterHtml("气血", "", s.player.hp, maxHp(s)) +
    meterHtml("体力", "tili", s.player.stamina, maxStamina(s)) +
    meterHtml("内力", "neili", s.player.neili, maxNeili(s));
  $("dtabs").querySelectorAll("button").forEach((b) =>
    b.classList.toggle("on", (b as HTMLElement).dataset.tab === drawerTab)
  );
  const body = $("dbody");
  if (drawerTab === "status") {
    const wounds = s.player.wounds.length
      ? s.player.wounds.map((w) => `${w.severity}（${w.source}）`).join("、")
      : "无";
    const rel = NPCS.filter((n) => (s.relations[n.id] ?? 0) !== 0)
      .map((n) => `<div class="kv"><span>${n.name}·${n.title}</span><span>${relLabel(s.relations[n.id] ?? 0)}</span></div>`)
      .join("");
    body.innerHTML = `
      <h4>状态</h4>
      <div class="kv"><span>姓名</span><span>${s.player.name}</span></div>
      <div class="kv"><span>身份</span><span>照川门${s.role}${s.sect.observation ? "（观察期）" : ""}</span></div>
      <div class="kv"><span>气血 / 体力 / 内力</span><span>${Math.round(s.player.hp)} / ${Math.round(s.player.stamina)} / ${Math.round(s.player.neili)}</span></div>
      <div class="kv"><span>伤势</span><span>${wounds}</span></div>
      <div class="kv"><span>银钱</span><span>${s.player.money} 文</span></div>
      <div class="kv"><span>欠款</span><span>${s.player.debt > 0 ? `${s.player.debt} 文（第${BAL_DEBT_DUE_DAY}日午时到期）` : "无"}</span></div>
      <div class="kv"><span>基本武艺</span><span>${s.player.martialSkill} / 100${s.player.equippedWeapon ? `（持械有效 ${effectiveSkill(s)}）` : ""}</span></div>
      <h4>禀赋</h4>
      ${Object.entries(s.player.attrs).map(([k, v]) => `<div class="kv"><span>${ATTR_LABELS[k as keyof typeof ATTR_LABELS]}</span><span>${v}</span></div>`).join("")}
      <h4>关系</h4>
      ${rel || '<p class="logline">尚无深交之人。</p>'}`;
  } else if (drawerTab === "bag") {
    const items = Object.entries(s.inventory)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const def = ITEMS.find((i) => i.id === id);
        return `<div class="kv"><span>${def?.name ?? id} ×${n}</span><span>${def?.desc ?? ""}</span></div>`;
      })
      .join("");
    body.innerHTML = `
      <h4>行囊</h4>
      ${items || '<p class="logline">空空如也。</p>'}
      <h4>兵刃</h4>
      <div class="kv"><span>${s.player.equippedWeapon ? ITEM_NAME[s.player.equippedWeapon] : "赤手空拳"}</span><span>战斗 +${s.player.equippedWeapon ? BALANCE.combat.weaponBonus : 0}</span></div>`;
  } else {
    const pr = s.world.proofs;
    const proofLine = (arr: string[]) => (arr.length ? arr.join("、") : "—");
    const escort = s.escort
      ? `<div class="kv"><span>护送药材</span><span>${s.escort.phase}${s.escort.clues.length ? ` · 线索${s.escort.clues.length}` : ""}</span></div>`
      : "";
    const logs = s.log.slice(-18).reverse().map((l) => `<div class="kv"><span>${l.text}</span><span></span></div>`).join("");
    const unfinished = s.ending
      ? `<h4>未竟之事</h4>${unfinishedList(s)}`
      : "";
    body.innerHTML = `
      <h4>入门证明</h4>
      <div class="kv"><span>武艺</span><span>${proofLine(pr.martial)}</span></div>
      <div class="kv"><span>人情</span><span>${proofLine(pr.social)}</span></div>
      <div class="kv"><span>品行</span><span>${proofLine(pr.virtue)}</span></div>
      ${escort}
      ${s.player.debt > 0 ? `<div class="kv"><span>客栈欠款</span><span>${s.player.debt} 文</span></div>` : ""}
      <h4>近况</h4>
      ${logs || '<p class="logline">暂无事记。</p>'}
      ${unfinished}`;
  }
}

function unfinishedList(s: GameState): string {
  const pr = s.world.proofs;
  const items: string[] = [];
  if (!pr.martial.length) items.push("武艺证明（武馆切磋 / 码头夜护）");
  if (!pr.social.length) items.push("人情证明（药铺引荐 / 脚行引荐）");
  if (!pr.virtue.length) items.push("品行证明（拾金不昧 / 庙祝作保）");
  if (s.escort && s.escort.phase !== "结束") items.push("护送差事了结");
  if (!items.length) return '<p class="logline">试玩内容已全部经历。</p>';
  return items.map((t) => `<div class="kv"><span>${t}</span><span>未完成</span></div>`).join("");
}

function relLabel(v: number): string {
  if (v >= 3) return "莫逆";
  if (v >= 1) return "交好";
  if (v <= -3) return "结怨";
  if (v <= -1) return "不睦";
  return "平平";
}

/* ---------------- 抽屉 ---------------- */
function openDrawer(open: boolean): void {
  $("drawer").classList.toggle("open", open);
  $("backdrop").classList.toggle("show", open);
}

/* ---------------- 派发与存档 ---------------- */
async function dispatch(intent: Parameters<typeof commit>[1]): Promise<void> {
  if (!state) return;
  const t0 = performance.now();
  const r = commit(state, intent, false);
  if (!r.ok) {
    if (r.reason) toast(r.reason);
    return;
  }
  state = r.state;
  renderGame();
  const dt = performance.now() - t0;
  if (dt > BALANCE.actionBudgetMs) console.warn(`行动提交耗时 ${dt.toFixed(1)}ms 超预算`);
  try {
    await store.write(state, "auto");
  } catch (e) {
    toast(`自动存档失败：${e instanceof Error ? e.message : e}`);
  }
}

async function openSaves(): Promise<void> {
  const slotsEl = $("slots");
  slotsEl.innerHTML = "<p class='logline'>读取存档列表…</p>";
  $("saves-overlay").classList.add("on");
  // 票据 007：存储紧张时 UI 警告
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined && est.quota && est.usage / est.quota > 0.9) {
      toast("浏览器存储空间紧张，建议导出存档备份");
    }
  } catch {
    /* 不支持 estimate 则忽略 */
  }
  const rows: string[] = [];
  for (const slot of SLOTS) {
    const meta = await store.peekMeta(slot);
    rows.push(`
      <div class="slot-row">
        <b>${SLOT_LABEL[slot]}</b>
        <div class="meta">${meta ? `${meta.gameTime} · ${meta.location} · 行动 ${meta.actionNumber} · 存于 ${new Date(meta.savedAt).toLocaleString()}` : "空"}</div>
        <div class="ops">
          <button data-read="${slot}" ${meta ? "" : "disabled"}>读取</button>
          ${slot !== "auto" ? `<button data-save="${slot}" ${state ? "" : "disabled"}>保存当前</button>` : ""}
        </div>
      </div>`);
  }
  slotsEl.innerHTML = rows.join("");
  slotsEl.querySelectorAll("button[data-read]").forEach((b) =>
    b.addEventListener("click", async () => {
      const slot = (b as HTMLElement).dataset.read as SlotId;
      try {
        const pkg = await store.read(slot);
        startGame(pkg.state);
        $("saves-overlay").classList.remove("on");
        toast("读档完成");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    })
  );
  slotsEl.querySelectorAll("button[data-save]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!state) return;
      const slot = (b as HTMLElement).dataset.save as SlotId;
      try {
        await store.write(state, slot);
        toast(`已存入${SLOT_LABEL[slot]}`);
        void openSaves();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    })
  );
}

/* ---------------- 事件绑定 ---------------- */
function bind(): void {
  $("bt-new").addEventListener("click", async () => {
    // 票据 007：覆盖旧自动档前给一句确认
    const meta = await store.peekMeta("auto");
    if (meta && state) {
      if (!window.confirm(`已有进行中的江湖（${meta.gameTime} · ${meta.location}）。开新局将覆盖其自动存档，继续？`)) return;
    }
    selOrigin = ORIGINS[0].id;
    for (const k of ATTR_ORDER) attrs[k] = 3;
    nameInput.value = "";
    renderCreation();
    setScreen("creation");
  });
  $("bt-back").addEventListener("click", () => void showTitle());
  $("bt-continue").addEventListener("click", async () => {
    try {
      const pkg = await store.read("auto");
      startGame(pkg.state);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  });
  $("bt-saves").addEventListener("click", () => void openSaves());
  $("bt-game-saves").addEventListener("click", () => void openSaves());
  $("bt-close-saves").addEventListener("click", () => $("saves-overlay").classList.remove("on"));
  $("bt-export").addEventListener("click", () => {
    const pkg = state ? exportText(state) : null;
    if (!pkg) {
      toast("当前没有进行中的江湖");
      return;
    }
    const blob = new Blob([pkg], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qinghe-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("bt-import").addEventListener("click", () => $("file-import").click());
  $("file-import").addEventListener("change", async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const pkg = importText(await file.text());
      startGame(pkg.state);
      toast("导入成功");
    } catch (e) {
      toast(`导入失败：${e instanceof Error ? e.message : e}`);
    }
  });
  $("bt-start").addEventListener("click", () => {
    if (ptsLeft() > 0) {
      toast(`还有 ${ptsLeft()} 点禀赋未分配`);
      return;
    }
    const name = nameInput.value.trim() || "无名客";
    startGame(createNewGame({ name, originId: selOrigin, attrs: { ...attrs } }));
  });
  $("handle").addEventListener("click", () => openDrawer(true));
  $("backdrop").addEventListener("click", () => openDrawer(false));
  $("dtabs").addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).dataset.tab;
    if (t) {
      drawerTab = t as typeof drawerTab;
      if (state) renderDrawer(state);
    }
  });
  $("bt-game-title").addEventListener("click", () => void showTitle());
  window.addEventListener("pagehide", () => {
    if (state) void store.write(state, "auto");
  });
}

bind();
void showTitle();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
if (navigator.storage?.persist) {
  void navigator.storage.persist();
}
