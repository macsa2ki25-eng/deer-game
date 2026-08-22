/** 起動・ループ・画面遷移。前の版の454行から、ここまで小さくなった。 */

import * as C from "./config";
import { createState, resetRun, type State } from "./state";
import { attachInput } from "./input";
import { step } from "./game";
import { render } from "./render";
import { unlock, setEnabled } from "./audio";
import * as store from "./storage";
import * as ads from "./ads";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = $<HTMLDivElement>("stage");
const canvas = $<HTMLCanvasElement>("screen");
const screens = $<HTMLDivElement>("screens");
const soundInput = $<HTMLInputElement>("sound");

canvas.width = C.VIEW.w;
canvas.height = C.VIEW.h;
const ctx = canvas.getContext("2d", { alpha: false })!;
ctx.imageSmoothingEnabled = false;

const state: State = createState();
state.best = store.loadBest();

let soundOn = store.loadSound();
setEnabled(soundOn);
soundInput.checked = soundOn;
soundInput.addEventListener("change", () => {
  soundOn = soundInput.checked;
  setEnabled(soundOn);
  store.saveSound(soundOn);
});

const input = attachInput(stage, {
  onFirstInput: unlock,
  onPress: () => stage.classList.add("touched"),
});

// ---------- 画面 ----------

function showScreen(which: "title" | "over" | null): void {
  for (const id of ["sc-title", "sc-over"]) {
    $(id).classList.toggle("show", id === `sc-${which}`);
  }
  screens.classList.toggle("show", which !== null);
}

function startRun(): void {
  resetRun(state);
  state.phase = "playing";
  showScreen(null);
  unlock();
}

$("btn-start").addEventListener("click", startRun);
$("btn-retry").addEventListener("click", startRun);
$("btn-back").addEventListener("click", () => showScreen("title"));

// ---------- リザルト ----------

function finishRun(): void {
  const score = Math.floor(state.score);
  if (score > state.best) {
    state.best = score;
    store.saveBest(score);
  }
  $("over-score").textContent = String(score);
  $("over-best").textContent = `さいこう ${state.best}`;
  $("over-why").textContent = state.deerHits > state.poopHits
    ? "前を みてなかった"
    : "下を みてなかった";
  showScreen("over");
  void ads.runFinished();
}

// ---------- ループ ----------

const FIXED = 1 / 60;
let last = 0;
let acc = 0;
let wasPlaying = false;

function frame(now: number): void {
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // タブ復帰などで一気に進めない

  // 指の状態がそのまま視線。ゲームが読む操作はこれだけ。
  state.down = input.down;

  acc += dt;
  let guard = 0;
  while (acc >= FIXED && guard++ < 8) {
    step(state, FIXED);
    acc -= FIXED;
  }
  if (guard >= 8) acc = 0;

  render(ctx, state);

  if (wasPlaying && state.phase === "over") finishRun();
  wasPlaying = state.phase === "playing";

  requestAnimationFrame(frame);
}

// ?debug=1 で内部状態を覗けるようにする。検証がここを使う。
if (new URLSearchParams(location.search).has("debug")) {
  (window as Window & { __mtd?: unknown }).__mtd = {
    state, config: C, input, start: startRun,
  };
}

showScreen("title");
requestAnimationFrame(frame);
