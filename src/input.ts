/**
 * 操作。**画面を4つの区画に分ける。**
 *
 *   上のほう      → 顔を上げる（前が見える／足元は見えない／レーンは動かない）
 *   下を横に3等分 → 触ったところのレーンへ歩く（足元が見える）
 *   どこも触らない → 足元を見たまま、いまのレーンで歩く
 *
 * **前の版は「触っている＝下を見る」だった。これが壊れていた。**
 * 下を見ながら左右によけるゲームなのに、下を見るには触り続けねばならず、
 * 触り続けている指では反対側を押せない。つまり
 * **よけようとすると顔が上がってしまう**。ひとつの指の上下1ビットに
 * ふたつの意味を載せたのが間違いだった。区画で分ければ喧嘩しない。
 *
 * 座標は読むが、**的は画面の4割と、その下の3等分**。
 * 390×338px と 130×506px の的が4つあるだけで、
 * 「あと3px 左にいれば助かった」は起きようがない。
 *
 * 上を触るのに指を伸ばすのは、そのまま「顔を上げる」という動作の重さになる。
 * よく使うほう（左右）が、親指の届くところにある。
 */

/** 下の区画（レーン）の高さ。画面の下から数えた割合。 */
export const LANE_BAND = 0.60;
/** レーンの数。下の帯をこの数で横に等分する。 */
export const LANES = 3;

export interface InputState {
  /** 顔を上げているか。上の区画を触っているあいだだけ true。 */
  up: boolean;
  /** いま向かっているレーン（0=左 1=まんなか 2=右）。触っていなくても残る。 */
  lane: number;
  /** 顔を上げた回数。検証用。 */
  toggles: number;
  /** レーンを移った回数。検証用。 */
  moves: number;
}

export interface InputOptions {
  /** 最初の操作。AudioContext の解錠に使う。 */
  onFirstInput: () => void;
  /** 触った瞬間に呼ぶ（メニューでは「はじめる」に使う）。 */
  onPress?: () => void;
}

type Zone = "up" | number;

export function attachInput(el: HTMLElement, opts: InputOptions): InputState {
  const st: InputState = { up: false, lane: 1, toggles: 0, moves: 0 };
  let firstDone = false;

  /**
   * 触った場所を区画に落とす。**ここでしか座標を使わない。**
   * 上の帯なら "up"、下の帯なら**横を等分**してレーン番号。
   */
  const zoneOf = (clientX: number, clientY: number): Zone => {
    const r = el.getBoundingClientRect();
    if (clientY < r.top + r.height * (1 - LANE_BAND)) return "up";
    const f = (clientX - r.left) / r.width;
    return Math.min(LANES - 1, Math.max(0, Math.floor(f * LANES)));
  };

  const apply = (zone: Zone): void => {
    if (zone === "up") {
      if (!st.up) st.toggles++;
      st.up = true;
      return;                       // 顔を上げているあいだ、レーンは動かない
    }
    st.up = false;
    if (st.lane !== zone) {
      st.lane = zone;
      st.moves++;
    }
  };

  const release = (): void => {
    if (st.up) st.toggles++;
    st.up = false;                  // 手を離したら、すぐ足元に目が戻る
  };

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    if (!firstDone) {
      firstDone = true;
      opts.onFirstInput();
    }
    apply(zoneOf(e.clientX, e.clientY));
    opts.onPress?.();
  });
  // 指を置いたまま滑らせても区画は切り替わる。押し直さなくていい
  el.addEventListener("pointermove", (e) => {
    if (e.buttons) apply(zoneOf(e.clientX, e.clientY));
  });
  const up = (e: PointerEvent): void => {
    release();
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* すでに外れている場合は無視 */
    }
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  // ブラウザで調整するとき用。← → でレーン、↑ かスペースで顔を上げる。
  const keys = new Set<string>();
  const fromKeys = (): void => {
    if (keys.has("ArrowUp") || keys.has("Space") || keys.has("KeyW")) {
      apply("up");
      return;
    }
    release();
    // ← → は「1本ずつ移る」。押しっぱなしで端まで行く
    if (keys.has("ArrowLeft") || keys.has("KeyA")) apply(Math.max(0, st.lane - 1));
    else if (keys.has("ArrowRight") || keys.has("KeyD")) {
      apply(Math.min(LANES - 1, st.lane + 1));
    }
  };
  const WATCHED = ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"];
  window.addEventListener("keydown", (e) => {
    if (!WATCHED.includes(e.code)) return;
    e.preventDefault();
    if (!firstDone) {
      firstDone = true;
      opts.onFirstInput();
    }
    keys.add(e.code);
    fromKeys();
    opts.onPress?.();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    fromKeys();
  });
  window.addEventListener("blur", () => {
    keys.clear();
    release();
  });

  return st;
}
