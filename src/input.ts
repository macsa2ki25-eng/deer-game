/**
 * 操作。
 *
 * 指はゲーム画面に触らない。下段のパッドを撫でて動かす。
 * 動かし方は**相対**：指を置いた場所を基準に、そこからの移動ぶんだけキャラが動く。
 * だから指を離して別の場所に置き直しても、キャラはその場から続きを動く。
 * 移動速度は game.ts で頭打ちしてあるので、速く払ってもワープはしない。
 */

import * as C from "./config";

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** 目標位置（ゲーム画面の論理px、スプライト左上）。キー操作中は null。 */
  tx: number | null;
  ty: number | null;
  /** パッドに触れているか。 */
  touching: boolean;
  /** パッド上の指の位置 0〜1。マーカー表示用。 */
  padU: number;
  padV: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** プレイヤーが取りうる位置の範囲。パッドはこの矩形に写像される。 */
export const REACH = {
  x0: C.PATH.x0,
  x1: C.PATH.x1 - C.PLAYER.w,
  y0: C.PLAY_Y.top,
  y1: C.PLAY_Y.bottom,
};

export interface InputOptions {
  /** 最初の操作。AudioContext の解錠に使う。 */
  onFirstInput: () => void;
  /** いまのキャラの位置。指を置き直したときの基準にする。 */
  playerPos: () => { x: number; y: number };
}

export function attachInput(pad: HTMLElement, opts: InputOptions): InputState {
  const st: InputState = {
    left: false, right: false, up: false, down: false,
    tx: null, ty: null, touching: false, padU: 0.5, padV: 0.5,
  };
  let firstDone = false;

  const first = () => {
    if (firstDone) return;
    firstDone = true;
    opts.onFirstInput();
  };

  // 指を置いた場所と、そのときのキャラの位置。ここからの差分で動かす。
  let anchorClientX = 0;
  let anchorClientY = 0;
  let anchorX = 0;
  let anchorY = 0;

  const metrics = () => {
    const r = pad.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    // パッド全体を撫でると可動域いっぱいをちょうど動かせる倍率
    return { kx: (REACH.x1 - REACH.x0) / r.width, ky: (REACH.y1 - REACH.y0) / r.height, r };
  };

  const beginDrag = (clientX: number, clientY: number) => {
    const here = opts.playerPos();
    anchorClientX = clientX;
    anchorClientY = clientY;
    anchorX = st.tx ?? here.x;
    anchorY = st.ty ?? here.y;
  };

  const dragTo = (clientX: number, clientY: number) => {
    const m = metrics();
    if (!m) return;
    st.tx = Math.max(REACH.x0, Math.min(REACH.x1, anchorX + (clientX - anchorClientX) * m.kx));
    st.ty = Math.max(REACH.y0, Math.min(REACH.y1, anchorY + (clientY - anchorClientY) * m.ky));
    st.padU = clamp01((clientX - m.r.left) / m.r.width);
    st.padV = clamp01((clientY - m.r.top) / m.r.height);
  };

  pad.addEventListener("pointerdown", (e) => {
    first();
    st.touching = true;
    beginDrag(e.clientX, e.clientY);
    pad.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  pad.addEventListener("pointermove", (e) => {
    if (st.touching) dragTo(e.clientX, e.clientY);
  });

  const release = (e: PointerEvent) => {
    if (!st.touching) return;
    st.touching = false;
    // 目標は保持する。指を離してもその場に立ち止まるだけ。
    try {
      pad.releasePointerCapture(e.pointerId);
    } catch {
      /* すでに外れている場合は無視 */
    }
  };
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);

  const KEYS: Record<string, "left" | "right" | "up" | "down"> = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    a: "left", d: "right", w: "up", s: "down",
  };

  window.addEventListener("keydown", (e) => {
    const k = KEYS[e.key];
    if (!k) return;
    first();
    st[k] = true;
    // キーを触った瞬間にパッドの目標を捨てる。両方が引っ張り合うと操作不能になる。
    st.tx = null;
    st.ty = null;
    e.preventDefault();
  });

  window.addEventListener("keyup", (e) => {
    const k = KEYS[e.key];
    if (k) st[k] = false;
  });

  window.addEventListener("blur", () => {
    st.left = st.right = st.up = st.down = false;
    st.touching = false;
  });

  return st;
}
