/**
 * 背景。1枚の縦長ストリップを作って2枚重ねでスクロールさせる。
 * 参道の縁には植え込みと縁石を描く——出られない壁だと、絵だけで分かるようにするため。
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
const KERB = "#8f8874";
const KERB_LIGHT = "#cec7b1";
const KERB_DARK = "#645e4e";
const HEDGE = "#2f4a2a";
const HEDGE_DARK = "#22381f";
const HEDGE_LIGHT = "#4e7a3a";
const HEDGE_TOP = "#6d9c46";

/** 植え込みの幅。参道の外側にこれだけしか余白がない。 */
const HEDGE_W = 6;

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
    if (gx > C.PATH.x0 - HEDGE_W - 2 && gx < C.PATH.x1 + HEDGE_W + 1) continue;
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
  // 大きめの敷石。踏まれて磨り減った参道らしさが出る。フンより淡い灰色にして、
  // 「避けるべきもの」と読み違えないようにしてある。
  for (let i = 0; i < Math.floor(STRIP_H / 5); i++) {
    const px = C.PATH.x0 + 2 + Math.floor(rnd() * (C.PATH_W - 6));
    const py = Math.floor(rnd() * STRIP_H);
    const w = 2 + Math.floor(rnd() * 2);
    x.fillStyle = GRAVEL_STONE;
    x.fillRect(px, py, w, 1);
    x.fillStyle = GRAVEL_LIGHT;
    x.fillRect(px, py - 1, w, 1);
  }

  // 縁石。参道の端をはっきり見せる。ここから先は歩けない。
  // 模様の周期は8＝ストリップ高さ(208)の約数。継ぎ目で柄が飛ばない。
  for (let y = 0; y < STRIP_H; y++) {
    const p = y % 8;
    x.fillStyle = p === 0 ? KERB_DARK : p === 1 ? KERB_LIGHT : KERB;
    x.fillRect(C.PATH.x0 - 1, y, 1, 1);
    x.fillRect(C.PATH.x1, y, 1, 1);
  }

  // 植え込み（＝壁）。縦縞だと壁紙に見えるので、丸い茂みを縦に並べる。
  // 左右で位相をずらして、貼り絵っぽさを消す。
  for (let y = 0; y < STRIP_H; y++) {
    for (const side of [0, 1] as const) {
      const phase = y + (side ? 4 : 0);
      // 茂みのふくらみ。8pxごとに1つの玉。
      const lump = Math.abs(((phase % 8) - 3.5) / 3.5); // 0=中央 1=境目
      const depth = HEDGE_W - Math.round(lump * 2);
      for (let k = 1; k <= HEDGE_W; k++) {
        const inner = k <= depth;
        let col: string;
        if (!inner) col = GRASS_DARK; // 玉と玉のあいだから地面が覗く
        else if (k === depth) col = HEDGE_DARK; // 参道側は影
        else if (lump < 0.3 && k >= HEDGE_W - 2) col = HEDGE_TOP; // 玉のてっぺんに光
        else if ((phase + k) % 5 === 0) col = HEDGE_LIGHT;
        else col = HEDGE;
        x.fillStyle = col;
        const px = side ? C.PATH.x1 + k : C.PATH.x0 - 1 - k;
        x.fillRect(px, y, 1, 1);
      }
    }
  }

  return c;
}
