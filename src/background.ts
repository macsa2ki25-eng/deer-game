/**
 * 背景。1枚の縦長ストリップを作って2枚重ねでスクロールさせる。
 * 参道の縁には植え込みを描く——出られない壁だと絵で分かるようにするため。
 */

import * as C from "./config";

/** ストリップの高さ。画面より高くして継ぎ目を隠す。 */
export const STRIP_H = C.VIEW.h + 32;

const GRASS = "#3f6b34";
const GRASS_DARK = "#2f4a2a";
const GRASS_LIGHT = "#7fae4e";
const GRAVEL = "#c9c2a6";
const GRAVEL_DARK = "#b5ad90";
const GRAVEL_LIGHT = "#d8d4bc";
const GRAVEL_STONE = "#9d957c";
const HEDGE = "#2f4a2a";
const HEDGE_DARK = "#22381f";
const HEDGE_LIGHT = "#4e7a3a";

/** 決定的な擬似乱数。毎回同じ背景になるので、見た目のブレでバグを疑わずに済む。 */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function buildBackground(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = C.VIEW.w;
  c.height = STRIP_H;
  const x = c.getContext("2d")!;
  const rnd = lcg(20260810);

  x.fillStyle = GRASS;
  x.fillRect(0, 0, C.VIEW.w, STRIP_H);

  // 草地のちらつき（参道と植え込みの上には置かない）
  const grassDots = Math.floor((C.VIEW.w * STRIP_H) / 26);
  for (let i = 0; i < grassDots; i++) {
    const gx = Math.floor(rnd() * C.VIEW.w);
    const gy = Math.floor(rnd() * STRIP_H);
    if (gx > C.PATH.x0 - 6 && gx < C.PATH.x1 + 5) continue;
    x.fillStyle = rnd() < 0.5 ? GRASS_DARK : GRASS_LIGHT;
    x.fillRect(gx, gy, 1, 1);
  }

  // 参道
  x.fillStyle = GRAVEL;
  x.fillRect(C.PATH.x0, 0, C.PATH_W, STRIP_H);
  const gravelDots = Math.floor((C.PATH_W * STRIP_H) / 6);
  for (let i = 0; i < gravelDots; i++) {
    const px = C.PATH.x0 + Math.floor(rnd() * C.PATH_W);
    const py = Math.floor(rnd() * STRIP_H);
    const r = rnd();
    x.fillStyle = r < 0.45 ? GRAVEL_DARK : r < 0.85 ? GRAVEL_LIGHT : GRAVEL_STONE;
    x.fillRect(px, py, 1, 1);
  }

  // 植え込み（＝壁）。左右対称にせず1pxずらして、貼り絵っぽさを消す。
  for (let y = 0; y < STRIP_H; y++) {
    for (let k = 1; k <= 4; k++) {
      x.fillStyle = (y + k) % 3 === 0 ? HEDGE_DARK : HEDGE;
      x.fillRect(C.PATH.x0 - k, y, 1, 1);
      x.fillRect(C.PATH.x1 - 1 + k, y, 1, 1);
    }
    if (y % 7 === 0) {
      x.fillStyle = HEDGE_LIGHT;
      x.fillRect(C.PATH.x0 - 3, y, 1, 1);
    }
    if ((y + 3) % 7 === 0) {
      x.fillStyle = HEDGE_LIGHT;
      x.fillRect(C.PATH.x1 + 1, y, 1, 1);
    }
  }

  return c;
}
