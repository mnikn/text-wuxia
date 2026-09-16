/**
 * Twee 交互壳（最小版）：状态信息改到左侧栏（参考 DoL 的常驻侧栏）。
 *
 * - 桌面（≥900px）：左侧栏常驻，正文区右移。
 * - 手机：左侧栏收起，(左) 把手拉开，点背景关。
 * - 状态栏只留时间 · 地点 · 银钱 · 体力（#20 决议：去掉饥饿、疲劳、精力、旧三维与旧伤势档）。
 */
import "./style.css";
import { INDEX, PASSAGES } from "virtual:twee";
import type { TweeProgram } from "../twee/types";
import {
  chooseOption,
  createSliceState,
  enterPassage,
  followNext,
  formatMoney,
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
    <button class="edge-handle" id="bt-side">状态</button>
    <div class="backdrop" id="backdrop"></div>
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
        <button class="btn" id="bt-title">回题页</button>
      </div>
    </aside>
    <div class="stage">
      <div class="scroll">
        <div class="story" id="story-body"></div>
        <div class="choices" id="choices"></div>
        <p class="logline" id="recent" style="margin-top:14px"></p>
      </div>
    </div>
  </div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const wide = (): boolean => window.matchMedia("(min-width: 900px)").matches;

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function renderSide(): void {
  $("side-when").textContent = `第 ${state.clock.day} 日 ${hhmm(state.clock.minute)}`;
  $("side-where").textContent = state.location;
  const pct = Math.max(0, Math.min(100, Math.round((state.stamina.current / state.stamina.max) * 100)));
  $("side-stamina").innerHTML =
    `<span class="k">体力</span>` +
    `<span class="v">${state.stamina.current} / ${state.stamina.max}</span>` +
    `<i class="bar tili"><b style="width:${pct}%"></b></i>`;
  $("side-money").textContent = formatMoney(state.money);
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
    for (const para of v.paragraphs) {
      const p = document.createElement("p");
      p.textContent = para;
      body.appendChild(p);
    }
  }
  lastPassageId = v.passageId;
  $("recent").textContent = state.recent.length > 0 ? state.recent.join("　") : "";
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
  // 出行选项的文案自带「前往 xx」，不再另贴「前往」标题；「在这里」只在两组并存时出现
  for (const [title, opts, showTitle] of [
    ["在这里", here, here.length > 0 && away.length > 0],
    ["前往", away, false],
  ] as [string, TweeOption[], boolean][]) {
    if (opts.length === 0) continue;
    const group = document.createElement("div");
    group.className = "choice-group";
    if (showTitle) {
      const h = document.createElement("h3");
      h.className = "group-title";
      h.textContent = title;
      group.appendChild(h);
    }
    for (const opt of opts) group.appendChild(choiceButton(opt));
    box.appendChild(group);
  }
}

function render(): void {
  if (!view) return;
  renderSide();
  const appended = renderStory();
  renderChoices();
  const scroller = document.querySelector("#game .scroll");
  if (scroller) scroller.scrollTop = appended ? scroller.scrollHeight : 0;
}

function setSide(open: boolean): void {
  $("game").classList.toggle("side-open", open);
  $("backdrop").classList.toggle("show", open);
}

function start(): void {
  state = createSliceState();
  view = enterPassage(program, state, SLICE_TUNE.startPassage);
  lastPassageId = null;
  $("screen-title").classList.remove("on");
  $("game").classList.add("on");
  setSide(wide());
  render();
}

function toTitle(): void {
  setSide(false);
  $("game").classList.remove("on");
  $("screen-title").classList.add("on");
}

$("bt-start").onclick = start;
$("bt-title").onclick = toTitle;
$("bt-side").onclick = () => setSide(!$("game").classList.contains("side-open"));
$("backdrop").onclick = () => setSide(false);
