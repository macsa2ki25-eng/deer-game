/**
 * 操作。**押しているあいだ下を見る。離すと前を見る。それだけ。**
 *
 * 座標を一切読まないので、**画面のどこを触ってもいい**。
 * だから操作パッドという区画が要らず、ゲーム画面を縦いっぱいに使える。
 * 前の版（2軸のドラッグ）で失敗が必ず「3px 左にいれば助かった」に
 * なっていたのは、指が位置を持っていたから。ここには位置が無い。
 */

export interface InputState {
  /** いま押されているか。game.ts はこれしか見ない。 */
  down: boolean;
  /** 押した／離した回数。検証用。 */
  toggles: number;
}

export interface InputOptions {
  /** 最初の操作。AudioContext の解錠に使う。 */
  onFirstInput: () => void;
  /** 押した瞬間に呼ぶ（メニューでは「はじめる」に使う）。 */
  onPress?: () => void;
}

export function attachInput(el: HTMLElement, opts: InputOptions): InputState {
  const st: InputState = { down: false, toggles: 0 };
  let firstDone = false;

  const press = () => {
    if (!firstDone) {
      firstDone = true;
      opts.onFirstInput();
    }
    if (!st.down) st.toggles++;
    st.down = true;
    opts.onPress?.();
  };
  const release = () => {
    if (st.down) st.toggles++;
    st.down = false;
  };

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    press();
  });
  const up = (e: PointerEvent) => {
    release();
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* すでに外れている場合は無視 */
    }
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  // ブラウザで調整するとき用。スペースでも同じことができる。
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    e.preventDefault();
    press();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") release();
  });
  window.addEventListener("blur", release);

  return st;
}
