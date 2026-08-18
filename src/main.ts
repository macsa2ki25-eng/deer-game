/** 起動・画面合わせ・ループ・画面遷移の配線。 */

import * as C from "./config";
import { createState, resetRun, type State } from "./state";
import { attachInput, REACH } from "./input";
import { buildBackground } from "./background";
import { step } from "./game";
import { render } from "./render";
import { unlock, setEnabled } from "./audio";
import * as store from "./storage";
import * as ads from "./ads";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stageEl = $<HTMLDivElement>("stage");
const canvas = $<HTMLCanvasElement>("screen");
const rotate = $<HTMLDivElement>("rotate");
const pad = $<HTMLDivElement>("pad");
const padFinger = $<HTMLDivElement>("pad-finger");
const padBody = $<HTMLDivElement>("pad-body");
const screens = $<HTMLDivElement>("screens");
const quitBtn = $<HTMLButtonElement>("quit");

// プレイ中の数字は全部ゲーム画面（canvas）の HUD に移した。
// 下段のDOMに残るのは、操作パッドと、レベルアップの一言だけ。
const el = {
  banner: $<HTMLDivElement>("banner"),
};

const sc = {
  title: $<HTMLElement>("sc-title"),
  stages: $<HTMLElement>("sc-stages"),
  result: $<HTMLElement>("sc-result"),
};

canvas.width = C.CANVAS.w;
canvas.height = C.CANVAS.h;
const ctx = canvas.getContext("2d", { alpha: false })!;
ctx.imageSmoothingEnabled = false;

const bg = buildBackground();
const state: State = createState();

const stars = store.loadStars();
let ranking = store.loadRanking();
let soundOn = store.loadSound();
state.touristsOn = store.loadTourists();
setEnabled(soundOn);

const soundInput = $<HTMLInputElement>("sound");
const touristInput = $<HTMLInputElement>("tourists");
soundInput.checked = soundOn;
touristInput.checked = state.touristsOn;

const input = attachInput(pad, {
  onFirstInput: unlock,
  playerPos: () => ({ x: state.px, y: state.py }),
});

/**
 * ゲーム画面は横幅いっぱいに広げる（左右に余白を作らない）。
 * 縦に伸びすぎると下段が潰れるので、画面高の46%で頭打ちにする。
 */
function resize(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const widthLimitedByHeight = vh * 0.46 * (C.CANVAS.w / C.CANVAS.h);
  stageEl.style.width = `${Math.floor(Math.min(vw, 560, widthLimitedByHeight))}px`;
  rotate.classList.toggle("show", vw > vh * 1.25);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
resize();

// ---------- 画面遷移 ----------

type ScreenName = "title" | "stages" | "result" | null;

function showScreen(name: ScreenName): void {
  for (const k of ["title", "stages", "result"] as const) {
    sc[k].classList.toggle("show", k === name);
  }
  screens.classList.toggle("show", name !== null);
  quitBtn.hidden = name !== null;
  if (name === "title") renderRanking($<HTMLOListElement>("rank-list"), -1);
}

// ---------- ランキング ----------

function renderRanking(list: HTMLOListElement, highlight: number): void {
  list.innerHTML = "";
  if (ranking.length === 0) {
    const p = document.createElement("li");
    p.className = "empty";
    p.textContent = "まだ記録がありません";
    list.appendChild(p);
    return;
  }
  ranking.forEach((e, i) => {
    const li = document.createElement("li");
    if (i + 1 === highlight) li.className = "me";
    li.innerHTML =
      `<span class="n">${i + 1}</span>` +
      `<span class="d">${Math.floor(e.dist)}m・${e.graze}かすめ</span>` +
      `<span class="s">${Math.floor(e.score).toLocaleString("en-US")}</span>`;
    list.appendChild(li);
  });
}

// ---------- ステージ選択 ----------

let viewArea = 0;

function starGlyphs(n: number): string {
  let out = "";
  for (let i = 0; i < 3; i++) out += i < n ? "★" : '<span class="off">★</span>';
  return out;
}

function renderAreas(): void {
  const wrap = $<HTMLDivElement>("area-list");
  wrap.innerHTML = "";
  for (let a = 0; a < C.AREA_COUNT; a++) {
    const b = document.createElement("button");
    const open = store.areaUnlocked(stars, a);
    b.type = "button";
    b.className = "area-btn" + (a === viewArea ? " on" : "") + (open ? "" : " locked");
    b.innerHTML = `<span class="num">${a + 1}</span>${open ? C.AREA_NAMES[a] : "？？？"}`;
    if (open) {
      b.addEventListener("click", () => {
        viewArea = a;
        renderStageSelect();
      });
    } else {
      b.disabled = true;
    }
    wrap.appendChild(b);
  }
}

function renderStageSelect(): void {
  renderAreas();
  $<HTMLDivElement>("area-name").textContent = C.AREA_NAMES[viewArea];
  const got = store.areaStars(stars, viewArea);
  $<HTMLDivElement>("area-meta").textContent = `★${got} / ${C.STAGES_PER_AREA * 3}`;

  const hint = $<HTMLDivElement>("area-hint");
  if (viewArea + 1 < C.AREA_COUNT && !store.areaUnlocked(stars, viewArea + 1)) {
    const need = C.AREA_UNLOCK_STARS - got;
    hint.textContent = need > 0
      ? `つぎのエリアまで ★あと ${need}`
      : "つぎのエリアが あきました";
  } else {
    hint.textContent = "";
  }

  const wrap = $<HTMLDivElement>("stage-list");
  wrap.innerHTML = "";
  for (let i = 0; i < C.STAGES_PER_AREA; i++) {
    const n = viewArea * C.STAGES_PER_AREA + i + 1;
    const open = store.stageUnlocked(stars, n);
    const got2 = stars[n - 1];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "stage-btn" + (open ? "" : " locked") + (got2 > 0 ? " cleared" : "");
    b.innerHTML = `${n}<span class="stars">${open ? starGlyphs(got2) : "&nbsp;"}</span>`;
    if (open) b.addEventListener("click", () => startStage(n));
    else b.disabled = true;
    wrap.appendChild(b);
  }
}

// ---------- プレイ開始 ----------

function beginRun(): void {
  unlock();
  resetRun(state);
  state.phase = "playing";
  continuedThisRun = false;
  showScreen(null);
}

function startEndless(): void {
  state.mode = "endless";
  beginRun();
}

function startStage(n: number): void {
  state.mode = "stage";
  state.stage = n;
  beginRun();
}

$<HTMLButtonElement>("btn-endless").addEventListener("click", startEndless);
$<HTMLButtonElement>("btn-stage").addEventListener("click", () => {
  unlock();
  renderStageSelect();
  showScreen("stages");
});
$<HTMLButtonElement>("btn-back-title").addEventListener("click", () => showScreen("title"));
quitBtn.addEventListener("click", () => {
  state.phase = "menu";
  showScreen(state.mode === "stage" ? "stages" : "title");
  if (state.mode === "stage") renderStageSelect();
});

soundInput.addEventListener("change", () => {
  soundOn = soundInput.checked;
  setEnabled(soundOn);
  store.saveSound(soundOn);
});
touristInput.addEventListener("change", () => {
  state.touristsOn = touristInput.checked;
  store.saveTourists(state.touristsOn);
});
pad.addEventListener("pointerdown", () => pad.classList.add("touched"));

// ---------- リザルト ----------

const resultTitle = $<HTMLDivElement>("result-title");
const resultStars = $<HTMLDivElement>("result-stars");
const resultLines = $<HTMLDivElement>("result-lines");
const rankResult = $<HTMLDivElement>("rank-result");
const btnNext = $<HTMLButtonElement>("btn-next");
const btnRetry = $<HTMLButtonElement>("btn-retry");
const btnBack = $<HTMLButtonElement>("btn-back");
const btnContinue = $<HTMLButtonElement>("btn-continue");

/** この1回のプレイでもう復活したか。1回きりにしないと記録の意味が消える。 */
let continuedThisRun = false;

/**
 * 動画を見てその場から再開する。
 * 距離もスコアも引き継ぐので、汚れを全快にはしない（ads.ts の CONTINUE_DIRT）。
 */
btnContinue.addEventListener("click", async () => {
  btnContinue.disabled = true;
  const watched = await ads.showContinueAd();
  btnContinue.disabled = false;
  if (!watched) return;

  continuedThisRun = true;
  state.dirt = ads.CONTINUE_DIRT;
  state.inv = ads.CONTINUE_INV;
  state.stun = 0;
  state.slip = 0;
  state.encircled = false;
  state.swarmCount = 0;
  // 目の前に残っている鹿はどけておく。無敵が切れた瞬間に轢かれては意味がない。
  state.deer.length = 0;
  state.warns.length = 0;
  state.phase = "playing";
  showScreen(null);
});

btnRetry.addEventListener("click", async () => {
  await ads.runFinished();
  if (state.mode === "stage") startStage(state.stage);
  else startEndless();
});
btnBack.addEventListener("click", async () => {
  await ads.runFinished();
  if (state.mode === "stage") {
    renderStageSelect();
    showScreen("stages");
  } else {
    showScreen("title");
  }
});
btnNext.addEventListener("click", () => {
  const next = state.stage + 1;
  if (next <= C.STAGE_COUNT && store.stageUnlocked(stars, next)) startStage(next);
  else {
    renderStageSelect();
    showScreen("stages");
  }
});

function finishRun(cleared: boolean): void {
  const num = (v: number) => Math.floor(v).toLocaleString("en-US");

  // 1回遊んでもらってから広告を用意する。起動直後にATTを出しても拒否されるだけ。
  void ads.initAds();
  // 読み込み済みのときしか出さない。押してから「読み込めません」が最悪なので。
  btnContinue.hidden = cleared || continuedThisRun || !ads.canOfferContinue();

  if (state.mode === "stage") {
    rankResult.hidden = true;
    if (cleared) {
      const got = C.starsFor(state.dirt);
      store.recordStars(stars, state.stage, got);
      resultTitle.textContent = "ゴール！";
      resultStars.hidden = false;
      resultStars.innerHTML = starGlyphs(got);
      resultLines.innerHTML =
        `スコア <b>${num(state.score)}</b><br>` +
        `よごれ <b>${state.dirt}</b> ／ かすめ <b>${state.grazeCount}</b>`;
      const next = state.stage + 1;
      btnNext.hidden = !(next <= C.STAGE_COUNT && store.stageUnlocked(stars, next));
    } else {
      resultTitle.textContent = "くつが もうだめ";
      resultStars.hidden = true;
      resultLines.innerHTML =
        `ステージ <b>${state.stage}</b>／ゴールまで <b>${Math.max(0, Math.ceil(state.goal - state.progress))}</b> m<br>` +
        `かすめ <b>${state.grazeCount}</b>`;
      btnNext.hidden = true;
    }
    btnBack.textContent = "ステージ選択";
  } else {
    const rank = store.recordScore(ranking, {
      score: Math.floor(state.score),
      dist: Math.floor(state.progress),
      graze: state.grazeCount,
      at: Date.now(),
    });
    ranking = store.loadRanking();
    resultTitle.textContent = "くつが もうだめ";
    resultStars.hidden = true;
    resultLines.innerHTML =
      `スコア <b>${num(state.score)}</b><br>` +
      `きょり <b>${Math.floor(state.progress)}</b> m ／ かすめ <b>${state.grazeCount}</b>` +
      (rank ? `<br>この端末で <b>${rank}位</b>` : "");
    rankResult.hidden = false;
    renderRanking($<HTMLOListElement>("rank-list2"), rank);
    btnNext.hidden = true;
    btnBack.textContent = "タイトルへ";
  }
  showScreen("result");
}

// ---------- HUD ----------

/** パッド上に、指の位置（輪）とキャラの実際の位置（点）を出す。ずれが操作の手応えになる。 */
function updateMarkers(): void {
  const u = (state.px - REACH.x0) / (REACH.x1 - REACH.x0);
  const v = (state.py - REACH.y0) / (REACH.y1 - REACH.y0);
  padBody.style.left = `${u * 100}%`;
  padBody.style.top = `${v * 100}%`;
  padFinger.style.left = `${input.padU * 100}%`;
  padFinger.style.top = `${input.padV * 100}%`;
  padFinger.style.opacity = input.touching ? "0.75" : "0.25";
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

  acc += dt;
  let guard = 0;
  while (acc >= FIXED && guard++ < 8) {
    step(state, input, FIXED);
    acc -= FIXED;
  }
  if (guard >= 8) acc = 0;

  render(ctx, state, bg);
  updateMarkers();

  const showBanner = state.bannerT > 0 && state.phase === "playing";
  el.banner.classList.toggle("show", showBanner);
  if (showBanner && el.banner.textContent !== state.banner) {
    el.banner.textContent = state.banner;
  }

  if (wasPlaying && state.phase !== "playing") {
    if (state.phase === "over" || state.phase === "clear") finishRun(state.phase === "clear");
  }
  wasPlaying = state.phase === "playing";

  requestAnimationFrame(frame);
}

// ?debug=1 で内部状態を覗けるようにする。バランス調整の自動テストがここを使う。
if (new URLSearchParams(location.search).has("debug")) {
  (window as Window & { __mtd?: unknown }).__mtd = {
    state, reach: REACH, config: C, stars,
    startEndless, startStage, input,
  };
}

showScreen("title");
requestAnimationFrame(frame);
