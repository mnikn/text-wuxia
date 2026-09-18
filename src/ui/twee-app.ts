/**
 * Twee 交互壳（最小版）：状态信息改到左侧栏（参考 DoL 的常驻侧栏）。
 *
 * - 桌面（≥900px）：左侧栏常驻，正文区右移。
 * - 手机：左侧栏收起，(左) 把手拉开，点背景关。
 * - 状态栏只留时间 · 地点 · 银钱 · 体力（#20 决议：去掉饥饿、疲劳、精力、旧三维与旧伤势档）。
 * - 行囊是居中弹框：侧栏底部与窄栏各有一个入口，只列身上有的东西与负重。
 */
import "./style.css";
import { INDEX, PASSAGES } from "virtual:twee";
import { itemDesc, itemList, itemName, itemWeight } from "../content/items";
import type { TweeProgram } from "../twee/types";
import {
  carryCapacity,
  carryWeight,
  chooseOption,
  createSliceState,
  dateOf,
  enterPassage,
  type EnterOptions,
  followNext,
  formatKe,
  formatMoney,
  itemCount,
  passageById,
  takeOutcome,
  type SliceState,
  type TweeOption,
  type TweeView,
} from "../twee/runtime";
import { createPrototypeLaunch, createPrototypeState, isPrototypeLaunchId, isPrototypePresetId, PROTOTYPE_LAUNCHES, PROTOTYPE_PRESETS, type PrototypeLaunchId } from "./prototype-launch";

const program = { passages: PASSAGES, index: INDEX, diagnostics: [] } as unknown as TweeProgram;

const app = document.getElementById("app")!;
let state: SliceState = createSliceState();
let view: TweeView | null = null;
/** 上一次渲染的单元：同一单元再来一次视图时走追加，不重排正文 */
let lastPassageId: string | null = null;
const debugLauncher = import.meta.env.DEV
  ? `
    <div class="dev-launcher">
      <span class="dev-label">开局模板</span>
      <select id="dev-template" aria-label="开局模板"></select>
      <button class="btn" id="bt-dev-start">开始</button>
    </div>
    <div class="dev-launcher">
      <span class="dev-label">直达单元</span>
      <select id="dev-goto" aria-label="直达单元"></select>
      <select id="dev-preset" aria-label="状态预设"></select>
      <button class="btn" id="bt-dev-goto">进入</button>
    </div>
  `
  : "";

app.innerHTML = `
  <div id="screen-title" class="screen on">
    <div class="title-hero">
      <h1>洺川纪事</h1>
      <p>写实架空武侠 · 江湖生活模拟 · 开头试玩</p>
    </div>
    <div class="menu">
      <button class="btn primary" id="bt-start">从头开始</button>
      ${debugLauncher}
    </div>
    <p class="logline" style="margin-top:20px;text-align:center">本批只做到「可以开始行动」那一点</p>
  </div>

  <div id="game">
    <!-- 折叠箭头：收起时在窄栏顶上，展开时贴到状态栏右上角 -->
    <button class="rail-toggle" id="bt-side" aria-label="展开状态栏">›</button>
    <!-- 左边常驻：展开是整条状态栏，收起是一条窄栏（时间与体力圆环） -->
    <aside class="sidebar" id="sidebar">
      <div class="shead">
        <span class="when" id="side-when"></span>
        <span class="where" id="side-where"></span>
      </div>
      <div class="sbody">
        <div class="row" id="side-stamina"></div>
        <div class="row money"><span class="k">银钱</span><span class="v" id="side-money"></span></div>
      </div>
      <div class="sfoot">
        <button class="btn" id="bt-bag">行囊</button>
        <button class="btn" id="bt-title">回题页</button>
      </div>
    </aside>
    <div class="rail" id="rail">
      <div class="rail-date">
        <span id="rail-month"></span>
        <span id="rail-time"></span>
      </div>
      <span class="rail-label">体力</span>
      <!-- 圆环只画比例；按住（桌面悬停）才浮出具体数值 -->
      <button class="rail-ring" id="rail-ring" aria-label="体力">
        <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="ring-bg" cx="12" cy="12" r="9"></circle>
          <circle class="ring-fg" id="ring-fg" cx="12" cy="12" r="9"></circle>
        </svg>
        <span class="bubble" id="rail-bubble"></span>
      </button>
      <!-- 窄栏也要能看行囊：手机上收起状态栏是默认态 -->
      <button class="rail-bag" id="bt-bag-rail">行囊</button>
    </div>
    <!-- 行囊：居中弹框（复用 .overlay 的模态样式），侧栏与窄栏各有一个入口 -->
    <div class="overlay" id="bag" aria-label="行囊">
      <div class="box">
        <div class="bag-head">
          <span class="btitle">行囊</span>
          <button class="bx" id="bag-close" aria-label="收起行囊">×</button>
        </div>
        <div class="load" id="bag-load"></div>
        <ul class="bag-items" id="bag-items"></ul>
      </div>
    </div>
    <div class="stage">
      <div class="scroll">
        <div class="story" id="story-body"></div>
        <div class="choices" id="choices"></div>
      </div>
    </div>
  </div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const wide = (): boolean => window.matchMedia("(min-width: 900px)").matches;
/** 体力圆环的周长（r = 9，见上面 SVG） */
const RING_LEN = 2 * Math.PI * 9;

/* ---------------- 计时：月日与时刻都用古代历法 ---------------- */

const CN_DIGIT = "零一二三四五六七八九";
/** 1-19 的汉字数（日期够用；再大按「二十三」拼） */
function cnNum(n: number): string {
  if (n < 0) return String(n);
  if (n <= 10) return n === 10 ? "十" : CN_DIGIT[n];
  if (n < 20) return `十${CN_DIGIT[n % 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${CN_DIGIT[tens]}十${ones ? CN_DIGIT[ones] : ""}`;
}

const MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
/** 日期 → 汉字月日：正月、初五、廿三、三十 */
function monthDayName(month: number, day: number): string {
  let d: string;
  if (day < 10) d = `初${CN_DIGIT[day]}`;
  else if (day === 10) d = "初十";
  else if (day < 20) d = cnNum(day);
  else if (day === 20) d = "二十";
  else if (day < 30) d = `廿${CN_DIGIT[day % 10]}`;
  else d = "三十";
  return `${MONTHS[(month - 1) % 12]}月${d}`;
}

const SHICHEN = "子丑寅卯辰巳午未申酉戌亥";
/** 一天里的分钟 → 时辰名：整点「辰时正」，过后「辰时七刻」（子时 23 点起，一时辰八刻，一刻 15 分钟） */
function shichenName(minute: number): string {
  const ofDay = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(ofDay / 60);
  const idx = Math.floor(((hour + 1) % 24) / 2);
  const startMin = (((idx * 2 - 1) + 24) % 24) * 60;
  const offset = (ofDay - startMin + 1440) % 1440;
  const ke = Math.min(8, Math.floor(offset / 15));
  return `${SHICHEN[idx]}时${ke === 0 ? "正" : `${cnNum(ke)}刻`}`;
}

function staminaPct(): number {
  return Math.max(0, Math.min(100, Math.round((state.stamina.current / state.stamina.max) * 100)));
}

/** 一天的段（晨／昼／暮／夜）的小图标：按小时切段，颜色按段走（见 style.css 的 .daypart-svg）。 */
function dayPartSvg(minute: number): string {
  const hour = Math.floor(minute / 60);
  const attrs = (part: string): string =>
    `class="daypart-svg ${part}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"`;
  if (hour >= 5 && hour < 9) {
    // 晨：地平线低，半日在上，光芒朝上
    return `<svg ${attrs("dawn")}><path d="M3 19h18"/><path d="M8 19a4 4 0 0 1 8 0"/><path d="M12 12.5V8.5"/><path d="M6.6 15.4l-1.9-1.9"/><path d="M17.4 15.4l1.9-1.9"/></svg>`;
  }
  if (hour >= 9 && hour < 17) {
    // 昼：日头当空
    return `<svg ${attrs("day")}><circle cx="12" cy="12" r="4"/><path d="M12 3v2.4"/><path d="M12 18.6V21"/><path d="M3 12h2.4"/><path d="M18.6 12H21"/><path d="M5.6 5.6l1.7 1.7"/><path d="M16.7 16.7l1.7 1.7"/><path d="M18.4 5.6l-1.7 1.7"/><path d="M7.3 16.7l-1.7 1.7"/></svg>`;
  }
  if (hour >= 17 && hour < 19) {
    // 暮：地平线高，半日沉在下，光芒朝下
    return `<svg ${attrs("dusk")}><path d="M3 15h18"/><path d="M8 15a4 4 0 0 0 8 0"/><path d="M12 21v-2.4"/><path d="M6.6 19.4l1.6-1.6"/><path d="M17.4 19.4l-1.6-1.6"/></svg>`;
  }
  // 夜：月牙与两点疏星
  return `<svg ${attrs("night")}><path d="M20 14.6A8.2 8.2 0 1 1 12.4 4a6.4 6.4 0 0 0 7.6 10.6z"/><path d="M5.6 6.4l.9.9"/><path d="M4.4 10.8h1.2"/></svg>`;
}

function renderSide(): void {
  const pct = staminaPct();
  const date = dateOf(state.clock.day);

  $("side-when").innerHTML = `${dayPartSvg(state.clock.minute)}<span>${date.year} 年 ${monthDayName(date.month, date.day)} ${shichenName(state.clock.minute)}</span>`;
  $("side-where").textContent = state.location;
  $("side-stamina").innerHTML =
    `<span class="k">体力</span>` +
    `<span class="v">${state.stamina.current} / ${state.stamina.max}</span>` +
    `<i class="bar tili"><b style="width:${pct}%"></b></i>`;
  $("side-money").textContent = formatMoney(state.money);

  // 窄栏：圆环只画比例，具体数值藏在按住的浮字里；日期只留月日与时刻
  $("rail-month").textContent = monthDayName(date.month, date.day);
  $("rail-time").innerHTML = `${dayPartSvg(state.clock.minute)}<span>${shichenName(state.clock.minute)}</span>`;
  $("rail-bubble").textContent = `${state.stamina.current} / ${state.stamina.max}`;
  const ring = $("ring-fg") as unknown as SVGCircleElement;
  ring.style.strokeDashoffset = String(RING_LEN * (1 - pct / 100));
  ring.classList.toggle("low", pct <= 30);
}

/** 行囊：身上有什么、现在多重。只列正数，空手就说空手。 */
function renderBag(): void {
  const cap = carryCapacity();
  const load = carryWeight(state);
  const pct = cap > 0 ? Math.max(0, Math.min(100, Math.round((load / cap) * 100))) : 0;
  $("bag-load").innerHTML =
    `<span class="k">负重</span>` +
    `<span class="v">${load} / ${cap} 斤</span>` +
    `<i class="bar${load > cap ? " over" : ""}"><b style="width:${pct}%"></b></i>`;

  const list = $("bag-items");
  list.innerHTML = "";
  const carried = itemList().filter((id) => itemCount(state, id) > 0);
  if (carried.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "身上空着。";
    list.appendChild(li);
    return;
  }
  for (const id of carried) {
    const count = itemCount(state, id);
    const weight = itemWeight(id) * count;
    const li = document.createElement("li");
    const top = document.createElement("div");
    top.className = "top";
    const name = document.createElement("span");
    name.className = "n";
    name.textContent = `${itemName(id)} ×${count}`;
    const wt = document.createElement("span");
    wt.className = "w";
    wt.textContent = weight > 0 ? `${weight} 斤` : "—";
    top.append(name, wt);
    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = itemDesc(id);
    li.append(top, desc);
    list.appendChild(li);
  }
}

/** 追加式落笔：stay 结算只把新段落接在正文后面，不重排、不跳回顶部。 */
function appendStory(paras: string[]): void {
  const body = $("story-body");
  for (const para of paras) {
    const p = document.createElement("p");
    p.textContent = para;
    body.appendChild(p);
  }
}

/** 返回 true 表示这次是追加（滚动要跟到底），false 表示整块重排（滚动归零）。 */
function renderStory(): boolean {
  const body = $("story-body");
  const v = view!;
  const append = v.appended !== undefined && v.appended.length > 0 && lastPassageId === v.passageId;
  if (append) {
    appendStory(v.appended!);
  } else {
    body.innerHTML = "";
    appendStory(v.paragraphs);
  }
  // 结算结果跟在正文最后面（DoL 式：结果就在正文流里，另用高亮字标出；增 / 减分色）
  for (const line of state.recent) {
    const p = document.createElement("p");
    p.className = `delta ${line.kind}`;
    if (line.parts) {
      for (const part of line.parts) {
        const span = document.createElement("span");
        span.className = part.kind;
        span.textContent = part.text;
        p.appendChild(span);
      }
    } else {
      p.textContent = line.text;
    }
    body.appendChild(p);
  }
  lastPassageId = v.passageId;
  return append;
}

function choiceButton(opt: TweeOption): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = opt.exit ? "choice exit" : "choice";
  btn.disabled = Boolean(opt.blocked);
  const label = document.createElement("span");
  label.append(opt.label);
  if (opt.ke) label.append(`（${formatKe(opt.ke)}）`);
  btn.appendChild(label);
  if (opt.blocked || opt.summary) {
    const small = document.createElement("small");
    if (opt.blocked) small.className = "why";
    small.textContent = opt.blocked ?? `（${opt.summary}）`;
    btn.appendChild(small);
  }
  // 后果提示排最后：耗时、代价之后（AGENTS.md 呈现约定）
  const appendHint = (text: string | undefined, cls: string) => {
    if (!text) return;
    const mark = document.createElement("em");
    mark.className = cls;
    mark.textContent = `（${text}）`;
    btn.appendChild(mark);
  };
  appendHint(opt.goodResultHint, "good");
  appendHint(opt.badResultHint, "risk");
  btn.onclick = () => {
    view = chooseOption(program, state, view!.passageId, opt.id, DEV_ENTER);
    render();
  };
  return btn;
}

/** 本地行动与出行分两组；两组都有内容时才加标题，单组按原样平铺。 */
function renderChoices(): void {
  const box = $("choices");
  box.innerHTML = "";
  const v = view!;
  if (v.atFreeActions) {
    box.innerHTML = `<div class="at-free">行动列表（下一批接上来）</div>`;
    return;
  }
  if (v.options.length === 0) {
    // 随机单元延迟掷骰时不留「继续」按钮：行动全交给下面的「强制结果」组
    if (v.outcomes && v.outcomes.length > 0) return;
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<span>${v.nextLabel ?? "继续"}</span>`;
    btn.onclick = () => {
      const passage = passageById(program, v.passageId);
      const next = passage ? followNext(program, state, passage, DEV_ENTER) : null;
      if (next) {
        view = next;
        render();
      }
    };
    box.appendChild(btn);
    return;
  }
  const here = v.options.filter((o) => !o.exit);
  const away = v.options.filter((o) => o.exit);
  // 参照 DoL 的分区：本地动作一区、能去的地点一区，各有小标题
  for (const [title, opts] of [
    ["动作", here],
    ["地点", away],
  ] as [string, TweeOption[]][]) {
    if (opts.length === 0) continue;
    const group = document.createElement("div");
    group.className = "choice-group";
    const h = document.createElement("h3");
    h.className = "group-title";
    h.textContent = title;
    group.appendChild(h);
    for (const opt of opts) group.appendChild(choiceButton(opt));
    box.appendChild(group);
  }
}

/** 开发态：随机单元不掷骰，先留屏等强制定向（正式版恒为空对象） */
const DEV_ENTER: EnterOptions = import.meta.env.DEV ? { deferRandom: true } : {};

/** 开发态专用：随机单元屏上的「强制结果」按钮组（含按权重掷骰那条正路）。 */
function renderForces(): void {
  const box = $("choices");
  const outcomes = view?.outcomes;
  if (!import.meta.env.DEV || !outcomes || outcomes.length === 0) return;
  const group = document.createElement("div");
  group.className = "choice-group dev-forces";
  const h = document.createElement("h3");
  h.className = "group-title";
  h.textContent = "强制结果";
  group.appendChild(h);
  outcomes.forEach((outcome, index) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.append(`${outcome.next}`);
    const mark = document.createElement("em");
    mark.className = "why";
    mark.textContent = `（权重 ${outcome.weight}）`;
    btn.appendChild(mark);
    btn.onclick = () => {
      view = takeOutcome(program, state, view!.passageId, index, DEV_ENTER);
      render();
    };
    group.appendChild(btn);
  });
  const roll = document.createElement("button");
  roll.className = "choice";
  roll.append("按权重掷骰");
  roll.onclick = () => {
    const passage = passageById(program, view!.passageId);
    if (!passage) return;
    view = enterPassage(program, state, passage.id);
    render();
  };
  group.appendChild(roll);
  box.appendChild(group);
}

function render(): void {
  if (!view) return;
  renderSide();
  renderBag();
  const appended = renderStory();
  renderChoices();
  renderForces();
  const scroller = document.querySelector("#game .scroll");
  if (scroller) scroller.scrollTop = appended ? scroller.scrollHeight : 0;
}

function setSide(open: boolean): void {
  $("game").classList.toggle("side-open", open);
  const bt = $("bt-side");
  bt.textContent = open ? "‹" : "›";
  bt.setAttribute("aria-label", open ? "收起状态栏" : "展开状态栏");
}

/** 行囊显隐：居中弹框，复用 .overlay 的模态样式 */
function setBag(open: boolean): void {
  $("bag").classList.toggle("on", open);
}

/** 上手就位：装好状态、进指定单元、切到游戏屏。开局模板与开发态直达共用。 */
function enterAt(passageId: string, nextState: SliceState): void {
  state = nextState;
  view = enterPassage(program, state, passageId, [], [], DEV_ENTER);
  lastPassageId = null;
  $("screen-title").classList.remove("on");
  $("game").classList.add("on");
  setSide(wide());
  setBag(false);
  render();
}

function startPrototype(launchId: PrototypeLaunchId): void {
  const launch = createPrototypeLaunch(launchId);
  enterAt(launch.passageId, launch.state);
}

function start(): void {
  startPrototype("beginning");
}

function toTitle(): void {
  setSide(false);
  setBag(false);
  $("game").classList.remove("on");
  $("screen-title").classList.add("on");
}

$("bt-start").onclick = start;
$("bt-title").onclick = toTitle;
$("bt-side").onclick = () => setSide(!$("game").classList.contains("side-open"));
$("bt-bag").onclick = () => setBag(true);
$("bt-bag-rail").onclick = () => setBag(true);
$("bag-close").onclick = () => setBag(false);
// 点弹框外面收起来（点 .box 里面的东西不算）
$("bag").addEventListener("click", (e) => {
  if (e.target === $("bag")) setBag(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setBag(false);
});

// 体力圆环：按住才浮出数值（用 pointer 事件，触屏与鼠标一致），松手收回
const ringBtn = $("rail-ring");
const showBubble = (on: boolean): void => {
  ringBtn.classList.toggle("show", on);
};
ringBtn.addEventListener("pointerdown", () => showBubble(true));
ringBtn.addEventListener("pointerup", () => showBubble(false));
ringBtn.addEventListener("pointercancel", () => showBubble(false));
ringBtn.addEventListener("pointerleave", () => showBubble(false));
ringBtn.addEventListener("blur", () => showBubble(false));

if (import.meta.env.DEV) {
  const templateSelect = $<HTMLSelectElement>("dev-template");
  for (const launch of PROTOTYPE_LAUNCHES) {
    const option = document.createElement("option");
    option.value = launch.id;
    option.textContent = launch.label;
    templateSelect.appendChild(option);
  }

  $("bt-dev-start").onclick = () => {
    const launchId = templateSelect.value;
    if (!isPrototypeLaunchId(launchId)) return;
    startPrototype(launchId);
  };

  // 直达：列出全部单元（按内容文件的书写顺序），配状态预设——验收单屏文案与结算用，尤其随机事件的结果支
  const gotoSelect = $<HTMLSelectElement>("dev-goto");
  for (const passage of PASSAGES) {
    // 共享动作要靠来路才能回得去，不进直达清单
    if (passage.tags.includes("action")) continue;
    const option = document.createElement("option");
    option.value = passage.id;
    option.textContent = passage.id;
    gotoSelect.appendChild(option);
  }

  const presetSelect = $<HTMLSelectElement>("dev-preset");
  for (const preset of PROTOTYPE_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.appendChild(option);
  }

  $("bt-dev-goto").onclick = () => {
    const presetId = presetSelect.value;
    if (!isPrototypePresetId(presetId)) return;
    enterAt(gotoSelect.value, createPrototypeState(presetId));
  };
}
