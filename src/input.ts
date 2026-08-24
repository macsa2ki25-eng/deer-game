/**
 * 操作。**触れているあいだ下を見る。触った側のレーンへ歩く。離すと前を見る。**
 *
 * 読むのは**画面の左半分か右半分か、それだけ**。
 * 的は幅195pxが2つしかないので、「あと3px 左にいれば助かった」は起きない。
 * 縦の位置は一切読まない——上のほうを触っても下のほうを触っても同じ。
 *
 * 指を置いたまま左右に滑らせてもレーンは切り替わる。押し直さなくていい。
 */

export interface InputState {
  /** いま触れているか。視線はこれで決まる。 */
  down: boolean;
  /** 触っている側のレーン（0=左 1=右）。離しても最後の値が残る。 */
  lane: number;
  /** 触った／離した回数。検証用。 */
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

export function attachInput(el: HTMLElement, opts: InputOptions): InputState {
  const st: InputState = { down: false, lane: 0, toggles: 0, moves: 0 };
  let firstDone = false;

  /** 触った x を左右の2値に落とす。**ここでしか座標を使わない。** */
  const laneOf = (clientX: number): number => {
    const r = el.getBoundingClientRect();
    return clientX < r.left + r.width / 2 ? 0 : 1;
  };

  const setLane = (lane: number): void => {
    if (st.lane !== lane) {
      st.lane = lane;
      st.moves++;
    }
  };

  const press = (clientX: number): void => {
    if (!firstDone) {
      firstDone = true;
      opts.onFirstInput();
    }
    if (!st.down) st.toggles++;
    st.down = true;
    setLane(laneOf(clientX));
    opts.onPress?.();
  };
  const release = (): void => {
    if (st.down) st.toggles++;
    st.down = false;
  };

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    press(e.clientX);
  });
  el.addEventListener("pointermove", (e) => {
    if (st.down) setLane(laneOf(e.clientX));
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

  // ブラウザで調整するとき用。←→ を押しているあいだ、その側を歩く。
  const keys = new Set<string>();
  const fromKeys = (): void => {
    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const right = keys.has("ArrowRight") || keys.has("KeyD");
    if (!left && !right) {
      release();
      return;
    }
    if (!st.down) st.toggles++;
    st.down = true;
    setLane(right && !left ? 1 : 0);
  };
  window.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(e.code)) return;
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
