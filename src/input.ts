/**
 * 操作。
 *
 * 指はゲーム画面に触らない。下段のパッドを撫でると、その位置が
 * そのままプレイヤーの目標位置になる（絶対位置指定）。
 * ワープはしない——移動速度は game.ts で LATERAL に頭打ちしてあるので、
 * パッドの端から端へ飛ばしても、キャラは歩いて追いかける。
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

  const setTarget = (clientX: number, clientY: number) => {
    const r = pad.getBoundingClientRect();
    if (!r.width || !r.height) return;
    st.padU = clamp01((clientX - r.left) / r.width);
    st.padV = clamp01((clientY - r.top) / r.height);
    st.tx = REACH.x0 + st.padU * (REACH.x1 - REACH.x0);
    st.ty = REACH.y0 + st.padV * (REACH.y1 - REACH.y0);
  };

  pad.addEventListener("pointerdown", (e) => {
    first();
    st.touching = true;
    setTarget(e.clientX, e.clientY);
    pad.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  pad.addEventListener("pointermove", (e) => {
    if (st.touching) setTarget(e.clientX, e.clientY);
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
