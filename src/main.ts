/** 起動・画面合わせ・ループ・下段UIの配線。 */

import * as C from "./config";
import { createState, resetRun, type State } from "./state";
import { attachInput, REACH } from "./input";
import { buildBackground } from "./background";
import { step } from "./game";
import { render } from "./render";
import { unlock, setEnabled } from "./audio";

const KEY = { best: "mtd.best", sound: "mtd.sound", tourists: "mtd.tourists" };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* プライベートモード等では保存を諦める */
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = $<HTMLDivElement>("stage");
const canvas = $<HTMLCanvasElement>("screen");
const overlay = $<HTMLDivElement>("overlay");
const ovTitle = $<HTMLDivElement>("ov-title");
const ovBody = $<HTMLDivElement>("ov-body");
const ovBtn = $<HTMLButtonElement>("ov-btn");
const rotate = $<HTMLDivElement>("rotate");
const pad = $<HTMLDivElement>("pad");
const padFinger = $<HTMLDivElement>("pad-finger");
const padBody = $<HTMLDivElement>("pad-body");
const gear = $<HTMLButtonElement>("gear");
const settings = $<HTMLDivElement>("settings");
const soundInput = $<HTMLInputElement>("sound");
const touristInput = $<HTMLInputElement>("tourists");

const el = {
  score: $<HTMLSpanElement>("score"),
  best: $<HTMLSpanElement>("best"),
  mult: $<HTMLSpanElement>("mult"),
  dist: $<HTMLSpanElement>("dist"),
  graze: $<HTMLSpanElement>("graze"),
  gauge: $<HTMLElement>("gauge"),
  dirt: $<HTMLDivElement>("dirt"),
};

canvas.width = C.VIEW.w;
canvas.height = C.VIEW.h;
const ctx = canvas.getContext("2d", { alpha: false })!;
ctx.imageSmoothingEnabled = false;

const bg = buildBackground();
const state: State = createState(load(KEY.best, 0));

const dirtBlocks: HTMLSpanElement[] = [];
for (let i = 0; i < C.DIRT_MAX; i++) {
  const b = document.createElement("span");
  el.dirt.appendChild(b);
  dirtBlocks.push(b);
}

// 観光客は「観光客モード」の駒。エンドレスの核ではないので既定は切っておく。
state.touristsOn = load(KEY.tourists, false);
let soundOn = load(KEY.sound, true);
setEnabled(soundOn);
soundInput.checked = soundOn;
touristInput.checked = state.touristsOn;

const input = attachInput(pad, { onFirstInput: unlock });

/**
 * ゲーム画面は整数倍でしか拡大しない。
 * 端数倍にするとピクセルの大きさが揃わず、スクロール中にちらつく。
 * 下段に十分な高さを残すため、画面高の 52% を上限にする。
 */
function resize(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const raw = Math.min(vw / C.VIEW.w, (vh * 0.52) / C.VIEW.h);
  const scale = raw >= 1 ? Math.floor(raw) : raw;
  stage.style.width = `${Math.round(C.VIEW.w * scale)}px`;
  stage.style.height = `${Math.round(C.VIEW.h * scale)}px`;
  rotate.classList.toggle("show", vw > vh * 1.25);
}

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
resize();

function showOverlay(title: string, body: string, button: string): void {
  ovTitle.textContent = title;
  ovBody.innerHTML = body;
  ovBtn.textContent = button;
  overlay.classList.remove("hide");
}

function startRun(): void {
  unlock();
  resetRun(state);
  state.phase = "playing";
  overlay.classList.add("hide");
  settings.classList.remove("show");
}

ovBtn.addEventListener("click", startRun);
gear.addEventListener("click", () => settings.classList.toggle("show"));

soundInput.addEventListener("change", () => {
  soundOn = soundInput.checked;
  setEnabled(soundOn);
  save(KEY.sound, soundOn);
});

touristInput.addEventListener("change", () => {
  state.touristsOn = touristInput.checked;
  save(KEY.tourists, state.touristsOn);
});

pad.addEventListener("pointerdown", () => pad.classList.add("touched"));

showOverlay(
  "下ばっか見てると",
  "下のパッドをなぞって歩く。<br>フンの<b>すぐそば</b>を通ると倍率が上がる。",
  "はじめる",
);

/** 数字の更新は毎フレーム要らない。マーカーだけ毎フレーム動かす。 */
let statsTimer = 0;
function updateStats(): void {
  el.score.textContent = Math.floor(state.score).toLocaleString("en-US");
  el.best.textContent = Math.floor(state.best).toLocaleString("en-US");
  el.mult.textContent = `×${state.mult.toFixed(2)}`;
  el.dist.textContent = String(Math.floor(state.dist));
  el.graze.textContent = String(state.grazeCount);
  el.gauge.style.width = `${(state.grazeGauge / C.GRAZE_MAX) * 100}%`;
  for (let i = 0; i < dirtBlocks.length; i++) {
    dirtBlocks[i].classList.toggle("on", i < state.dirt);
  }
}

/** パッド上に、指の位置（輪郭）とキャラの実際の位置（点）を出す。ずれが操作の手応えになる。 */
function updateMarkers(): void {
  const u = (state.px - REACH.x0) / (REACH.x1 - REACH.x0);
  const v = (state.py - REACH.y0) / (REACH.y1 - REACH.y0);
  padBody.style.left = `${u * 100}%`;
  padBody.style.top = `${v * 100}%`;
  padFinger.style.left = `${input.padU * 100}%`;
  padFinger.style.top = `${input.padV * 100}%`;
  padFinger.style.opacity = input.touching ? "0.75" : "0.25";
}

const FIXED = 1 / 60;
let last = 0;
let acc = 0;
let wasPlaying = false;

function frame(now: number): void {
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // タブ復帰などで一気に進めない

  acc += dt;
  let guard = 0;
  while (acc >= FIXED && guard++ < 8) {
    step(state, input, FIXED);
    acc -= FIXED;
  }
  if (guard >= 8) acc = 0;

  render(ctx, state, bg);
  updateMarkers();

  statsTimer += dt;
  if (statsTimer >= 0.05) {
    statsTimer = 0;
    updateStats();
  }

  if (wasPlaying && state.phase === "over") {
    updateStats();
    save(KEY.best, state.best);
    showOverlay(
      "くつが もうだめ",
      `きょり ${Math.floor(state.dist)} m ／ グレイズ ${state.grazeCount}<br>スコア ${Math.floor(state.score).toLocaleString("en-US")}`,
      "もういちど",
    );
  }
  wasPlaying = state.phase === "playing";

  requestAnimationFrame(frame);
}

// ?debug=1 で内部状態を覗けるようにする。バランス調整の自動テストがここを使う。
if (new URLSearchParams(location.search).has("debug")) {
  (window as Window & { __mtd?: unknown }).__mtd = { state, reach: REACH, config: C };
}

updateStats();
requestAnimationFrame(frame);
