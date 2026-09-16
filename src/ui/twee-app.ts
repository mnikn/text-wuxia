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
import { itemList, itemName, itemWeight } from "../content/items";
import type { TweeProgram } from "../twee/types";
import {
  carryCapacity,
  carryWeight,
  chooseOption,
  createSliceState,
  dateOf,
  enterPassage,
  followNext,
  formatMoney,
  itemCount,
  passageById,
  SLICE_TUNE,
  type SliceState,
  type TweeOption,
  type TweeView,
} from "../twee/runtime";

const program = { passages: PASSAGES, index: INDEX, diagnostics: [] } as unknown as TweeProgram;

const app = document.getElementById("app")!;
let state: SliceState = createSliceState();
let view: TweeView | null = null;
/** 上一次渲染的单元：同一单元再来一次视图时走追加，不重排正文 */
let lastPassageId: string | null = null;

app.innerHTML = `
  <div id="screen-title" class="screen on">
    <div class="title-hero">
      <h1>洺川纪事</h1>
      <p>写实架空武侠 · 江湖生活模拟 · 开头试玩</p>
    </div>
    <div class="menu">
      <button class="btn primary" id="bt-start">从头开始</button>
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

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function staminaPct(): number {
  return Math.max(0, Math.min(100, Math.round((state.stamina.current / state.stamina.max) * 100)));
}

function renderSide(): void {
  const pct = staminaPct();
  const date = dateOf(state.clock.day);

  $("side-when").textContent = `${date.year} 年 ${date.month} 月 ${date.day} 日 ${hhmm(state.clock.minute)}`;
  $("side-where").textContent = state.location;
  $("side-stamina").innerHTML =
    `<span class="k">体力</span>` +
    `<span class="v">${state.stamina.current} / ${state.stamina.max}</span>` +
    `<i class="bar tili"><b style="width:${pct}%"></b></i>`;
  $("side-money").textContent = formatMoney(state.money);

  // 窄栏：圆环只画比例，具体数值藏在按住的浮字里；日期只留月日与时刻
  $("rail-month").textContent = `${date.month}月${date.day}日`;
  $("rail-time").textContent = hhmm(state.clock.minute);
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
    const name = document.createElement("span");
    name.className = "n";
    name.textContent = itemName(id);
    const num = document.createElement("span");
    num.className = "c";
    num.textContent = weight > 0 ? `${count} 件 · ${weight} 斤` : `${count} 件`;
    li.append(name, num);
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
    p.textContent = line.text;
    body.appendChild(p);
  }
  lastPassageId = v.passageId;
  return append;
}

function choiceButton(opt: TweeOption): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = opt.exit ? "choice exit" : "choice";
  btn.disabled = Boolean(opt.blocked);
  const small = opt.blocked ? `<small class="why">${opt.blocked}</small>` : opt.summary ? `<small>${opt.summary}</small>` : "";
  btn.innerHTML = `<span>${opt.label}</span>${small}`;
  btn.onclick = () => {
    view = chooseOption(program, state, view!.passageId, opt.id);
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
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<span>${v.nextLabel ?? "继续"}</span>`;
    btn.onclick = () => {
      const passage = passageById(program, v.passageId);
      const next = passage ? followNext(program, state, passage) : null;
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

function render(): void {
  if (!view) return;
  renderSide();
  renderBag();
  const appended = renderStory();
  renderChoices();
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

function start(): void {
  state = createSliceState();
  view = enterPassage(program, state, SLICE_TUNE.startPassage);
  lastPassageId = null;
  $("screen-title").classList.remove("on");
  $("game").classList.add("on");
  setSide(wide());
  setBag(false);
  render();
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
