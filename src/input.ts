/**
 * 操作。**画面を3つの区画に分ける。**
 *
 *   上のほう      → 顔を上げる（前が見える／足元は見えない／レーンは動かない）
 *   下の左半分    → 左のレーンへ歩く（足元が見える）
 *   下の右半分    → 右のレーンへ歩く（足元が見える）
 *   どこも触らない → 足元を見たまま、いまのレーンで歩く
 *
 * **前の版は「触っている＝下を見る」だった。これが壊れていた。**
 * 下を見ながら左右によけるゲームなのに、下を見るには触り続けねばならず、
 * 触り続けている指では反対側を押せない。つまり
 * **よけようとすると顔が上がってしまう**。ひとつの指の上下1ビットに
 * ふたつの意味を載せたのが間違いだった。区画で分ければ喧嘩しない。
 *
 * 座標は読むが、**的は画面の4割と、その下の左右半分**。
 * 195×506px と 390×338px の的が3つあるだけで、
 * 「あと3px 左にいれば助かった」は起きようがない。
 *
 * 上を触るのに指を伸ばすのは、そのまま「顔を上げる」という動作の重さになる。
 * よく使うほう（左右）が、親指の届くところにある。
 */

/** 下の区画（レーン）の高さ。画面の下から数えた割合。 */
export const LANE_BAND = 0.60;

export interface InputState {
  /** 顔を上げているか。上の区画を触っているあいだだけ true。 */
  up: boolean;
  /** いま向かっているレーン（0=左 1=右）。触っていなくても残る。 */
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

type Zone = "up" | "left" | "right";

export function attachInput(el: HTMLElement, opts: InputOptions): InputState {
  const st: InputState = { up: false, lane: 0, toggles: 0, moves: 0 };
  let firstDone = false;

  /** 触った場所を3つの区画のどれかに落とす。**ここでしか座標を使わない。** */
  const zoneOf = (clientX: number, clientY: number): Zone => {
    const r = el.getBoundingClientRect();
    if (clientY < r.top + r.height * (1 - LANE_BAND)) return "up";
    return clientX < r.left + r.width / 2 ? "left" : "right";
  };

  const apply = (zone: Zone): void => {
    if (zone === "up") {
      if (!st.up) st.toggles++;
      st.up = true;
      return;                       // 顔を上げているあいだ、レーンは動かない
    }
    st.up = false;
    const lane = zone === "left" ? 0 : 1;
    if (st.lane !== lane) {
      st.lane = lane;
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
    if (keys.has("ArrowLeft") || keys.has("KeyA")) apply("left");
    else if (keys.has("ArrowRight") || keys.has("KeyD")) apply("right");
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
