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
  type TweeView,
} from "../twee/runtime";

const program = { passages: PASSAGES, index: INDEX, diagnostics: [] } as unknown as TweeProgram;

const app = document.getElementById("app")!;
let state: SliceState = createSliceState();
let view: TweeView | null = null;

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

function renderStory(): void {
  const body = $("story-body");
  body.innerHTML = "";
  for (const para of view!.paragraphs) {
    const p = document.createElement("p");
    p.textContent = para;
    body.appendChild(p);
  }
  $("recent").textContent = state.recent.length > 0 ? state.recent.join("　") : "";
}

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
    btn.innerHTML = `<span>继续</span>`;
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
  for (const opt of v.options) {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.disabled = Boolean(opt.blocked);
    const small = opt.blocked ? `<small class="why">${opt.blocked}</small>` : opt.summary ? `<small>${opt.summary}</small>` : "";
    btn.innerHTML = `<span>${opt.label}</span>${small}`;
    btn.onclick = () => {
      view = chooseOption(program, state, v.passageId, opt.id);
      render();
    };
    box.appendChild(btn);
  }
}

function render(): void {
  if (!view) return;
  renderSide();
  renderStory();
  renderChoices();
  const scroller = document.querySelector("#game .scroll");
  if (scroller) scroller.scrollTop = 0;
}

function setSide(open: boolean): void {
  $("game").classList.toggle("side-open", open);
  $("backdrop").classList.toggle("show", open);
}

function start(): void {
  state = createSliceState();
  view = enterPassage(program, state, SLICE_TUNE.startPassage);
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
