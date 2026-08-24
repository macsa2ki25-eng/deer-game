/**
 * 描画。**画面の上が遠く、下が足元。**参道をまっすぐ奥へ歩いている。
 *
 * 横スクロール版は帯をふたつ並べて別々の絵を描いていたが、
 * 縦なら**上下がそのまま奥行き**なので、ひと続きの絵が1枚あれば済む。
 * 「まえ」「あしもと」という札も要らない。
 *
 * 見ていない側には暗幕をかける。**そして見えないものは描かない**——
 * 下を向いているあいだ鹿は1枚も描かず、顔を上げているあいだフンを描かない。
 * 薄い暗幕で「読めるが読みにくい」にしていたら、下を向いたまま鹿を見張れて
 * しまい、それだけで芯が死んだ。ここは絵として本当に無くす。
 */

import * as C from "./config";
import type { State } from "./state";
import { HUD, SPR, pick, type Sprite } from "./sprites";
import { LANE_BAND, LANES } from "./input";

const CX = C.VIEW.w / 2;
/** 足元での参道の半幅。 */
const ROAD_HALF = C.ROAD_NEAR / 2;

const COL = {
  sky: "#93b6c9",
  skyLow: "#cbd6cd",
  hill: "#5c7a4e",
  hillDark: "#455f3b",
  earth: "#6b6a4e",
  earthDark: "#585739",
  // 石畳。写真の板石に合わせて、灰色に少し緑と桃を混ぜる。
  slabA: "#bab6a5",
  slabB: "#aaa997",
  slabC: "#c7c1ae",
  slabD: "#b2ae9c",
  joint: "#6e6a5c",
  jointDeep: "#4f4c41",
  edge: "#8d8a76",
  hud: "#11140e",
  ink: "#201a24",
};

/** 決まった模様。毎フレーム描き直しても暴れない。 */
function hash(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function text(
  ctx: CanvasRenderingContext2D,
  set: Record<string, Sprite>,
  str: string,
  x: number,
  y: number,
  gap = 1,
): number {
  let at = x;
  for (const ch of str) {
    const g = set[ch];
    if (g) {
      ctx.drawImage(g, at, y);
      at += g.width + gap;
    } else {
      at += 3 + gap;
    }
  }
  return at;
}

function drawHud(ctx: CanvasRenderingContext2D, s: State): void {
  ctx.fillStyle = COL.hud;
  ctx.fillRect(0, 0, C.VIEW.w, C.HUD_H);

  // よごれ。残りは数えるより見たほうが速いので、くつの数で出す。
  const SHOE = HUD.shoeOk.width;
  for (let i = 0; i < C.DIRT_MAX; i++) {
    ctx.drawImage(i < s.dirt ? HUD.shoeBad : HUD.shoeOk, 3 + i * (SHOE + 1), 3);
  }

  const score = String(Math.floor(s.score));
  let w = 0;
  for (const ch of score) w += (HUD.num[ch]?.width ?? 3) + 1;
  text(ctx, HUD.num, score, C.VIEW.w - w - 2, 4, 1);
}

/** 画面のy → 遠近の比（1が足元、0が地平）。 */
function scaleAtY(y: number): number {
  return (y - C.HORIZON) / (C.KID_Y - C.HORIZON);
}

/**
 * 参道。**1行ずつ、その行がどれだけ遠いかを出して塗る。**
 *
 * 写真の参道は大きな板石が2列に並んでいて、子どもは
 * **どの石に足を置くか選びながら**歩いていた。
 * ここでは石の2列が、そのままふたつのレーンになっている——
 * 何を選んでいるのかが、絵だけで分かる。
 */
function drawRoad(ctx: CanvasRenderingContext2D, s: State): void {
  const grd = ctx.createLinearGradient(0, C.HUD_H, 0, C.HORIZON);
  grd.addColorStop(0, COL.sky);
  grd.addColorStop(1, COL.skyLow);
  ctx.fillStyle = grd;
  ctx.fillRect(0, C.HUD_H, C.VIEW.w, C.HORIZON - C.HUD_H);

  // 地平の向こうの山影。奥行きの底を作る
  ctx.fillStyle = COL.hillDark;
  ctx.fillRect(0, C.HORIZON - 5, C.VIEW.w, 5);
  ctx.fillStyle = COL.hill;
  ctx.fillRect(0, C.HORIZON - 2, C.VIEW.w, 2);

  const BAND = 34;          // 板石1枚ぶんの奥行き[px]
  let lastBand = Number.NaN;
  for (let y = C.HORIZON; y < C.VIEW.h; y++) {
    const sc = scaleAtY(y);
    const z = C.Z0 / Math.max(0.02, sc) - C.Z0;
    const half = ROAD_HALF * sc;
    const l = Math.round(CX - half);
    const r = Math.round(CX + half);

    /**
     * 参道の外。**縞にすると畝のように見える**ので、
     * 決まった式でまだらにする。奥へ行くほど細かくなって、これも奥行きになる。
     */
    const band4 = Math.floor((s.dist + z) / 9);
    for (let x = 0; x < C.VIEW.w; x += 4) {
      ctx.fillStyle = hash(x >> 2, band4) < 0.42 ? COL.earthDark : COL.earth;
      ctx.fillRect(x, y, 4, 1);
    }

    const band = Math.floor((s.dist + z) / BAND);
    const alt = ((band % 2) + 2) % 2;
    /**
     * **石は3列。列がそのままレーン。**
     * 何を選んでいるのかが、絵だけで分かる。
     */
    for (let i = 0; i < C.LANES; i++) {
      const x0 = Math.round(l + ((r - l) * i) / C.LANES);
      const x1 = Math.round(l + ((r - l) * (i + 1)) / C.LANES);
      const light = (alt + i) % 2 === 0;
      ctx.fillStyle = light ? COL.slabC : COL.slabB;
      ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1);
    }

    // 石の継ぎ目。奥ほど詰まって見えるので、遠近がそのまま速さになる
    if (band !== lastBand) {
      ctx.fillStyle = COL.joint;
      ctx.fillRect(l, y, Math.max(1, r - l), 1);
      lastBand = band;
    }
    /**
     * **縦の目地＝レーンの境目。ここがいちばん大事な線。**
     * 3本のうちどこに居るのかが読めないと、ゲームとして成立しない。
     * 横の継ぎ目より濃く、手前ほど太くする。
     */
    const mid = Math.max(1, Math.round(3.5 * sc));
    for (let i = 1; i < C.LANES; i++) {
      const x = Math.round(l + ((r - l) * i) / C.LANES);
      ctx.fillStyle = COL.jointDeep;
      ctx.fillRect(x - Math.ceil(mid / 2), y, mid, 1);
      ctx.fillStyle = "rgba(255,255,255,.13)";
      ctx.fillRect(x + Math.floor(mid / 2), y, 1, 1);
    }
    ctx.fillStyle = COL.edge;
    ctx.fillRect(l, y, 1, 1);
    ctx.fillRect(r - 1, y, 1, 1);
  }
}

/** レーン中心の画面x。 */
function laneX(lane: number, sc: number): number {
  return CX + (C.LANE_X[lane] - CX) * sc;
}
/** `lx`（小数）の画面x。レーンのあいだを滑る見た目のためだけに使う。 */
function lxToX(lx: number, sc: number): number {
  const i = Math.min(C.LANES - 2, Math.max(0, Math.floor(lx)));
  const a = C.LANE_X[i];
  const b = C.LANE_X[i + 1];
  return CX + (a + (b - a) * (lx - i) - CX) * sc;
}

/** 奥のものから順に描く。手前が奥を隠す。 */
function byDepth<T extends { z: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.z - a.z);
}

function drawSprite(
  ctx: CanvasRenderingContext2D, spr: Sprite, x: number, y: number,
): void {
  ctx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height));
}

/**
 * 足元の影。**これが無いと、地面の上ではなく宙に貼ってあるように見える。**
 * 遠近で縮むので、どのくらい遠いかの手がかりにもなる。
 */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  if (w < 3) return;
  ctx.fillStyle = "rgba(28,24,18,.28)";
  ctx.fillRect(Math.round(x - w / 2), Math.round(y) - 1, Math.round(w), 2);
  ctx.fillRect(Math.round(x - w / 2) + 1, Math.round(y) - 2, Math.round(w) - 2, 1);
}

/** 参道の脇の並木。奥行きの手がかりで、速さの下支えになる。 */
function drawScenery(ctx: CanvasRenderingContext2D, s: State): void {
  for (const g of byDepth(s.scenery)) {
    if (g.z <= 0) continue;
    const sc = C.scaleOf(g.z);
    const y = C.yOf(g.z);
    const x = CX + g.side * (ROAD_HALF + 26) * sc;
    const set = g.kind === "tree" ? SPR.tree : SPR.lantern;
    drawSprite(ctx, pick(set, sc), x, y);
  }
}

export function render(ctx: CanvasRenderingContext2D, s: State): void {
  drawRoad(ctx, s);
  drawScenery(ctx, s);

  for (const b of byDepth(s.senbeis)) {
    if (b.taken || b.z <= 0 || b.z > C.POOP_SEE) continue;
    const sc = C.scaleOf(b.z);
    const bob = Math.sin(s.t * 6 + b.z * 0.05) * 2 * sc;
    drawSprite(ctx, pick(SPR.senbei, sc), laneX(b.lane, sc), C.yOf(b.z) - 4 * sc + bob);
  }

  /**
   * **フンは下を向いているあいだしか描かない。**
   * 顔を上げたまま足元を確かめられるなら、下を向く理由がどこにも無くなる。
   */
  if (s.down) {
    for (const p of byDepth(s.poops)) {
      // **足元で消さない。**踏んだのか避けたのか分からなくなる。
      // 画面の下へ抜けていくところまで描く。
      if (p.z < -55 || p.z > C.POOP_SEE) continue;
      const sc = C.scaleOf(p.z);
      const y = C.yOf(p.z);
      if (p.big) {
        // 両レーンぶんの幅。**よけようがない**ことが幅で分かる
        shadow(ctx, CX, y + 1, 34 * sc);
        drawSprite(ctx, pick(SPR.poopBig, sc), CX, y);
      } else {
        drawSprite(ctx, pick(SPR.poop, sc), laneX(p.lane, sc), y);
      }
    }
  }

  /**
   * 暗幕。**見ていない側を本当に隠す。**
   * 下を向いていれば奥が、顔を上げていれば足元が消える。
   */
  const by = Math.round(C.HORIZON + (C.VIEW.h - C.HORIZON) * s.split);
  ctx.fillStyle = `rgba(12,14,10,${C.DIM})`;
  if (s.down) ctx.fillRect(0, C.HUD_H, C.VIEW.w, by - C.HUD_H);
  else ctx.fillRect(0, by, C.VIEW.w, C.VIEW.h - by);
  ctx.fillStyle = COL.ink;
  ctx.fillRect(0, by - 1, C.VIEW.w, 1);

  /**
   * **鹿。暗幕の上に描く。**鹿は「奥にあるもの」なので、
   * 足元を隠す幕には隠されない。
   *
   * 顔を上げていれば、奥から来るのが全部見える。
   * **下を向いていても、目の前まで来たものは視界の端に入る。**
   * 完全に消していたら「上で見た鹿を通り過ぎたのか分からない」と言われた。
   * うつむいて歩いていても、足のすぐ前のものは見える。ただし
   * 見えはじめてから届くまで 0.40秒しかないので、そこから避けるのは無理——
   * 予告ではなく、**通り過ぎたことが分かるだけ**の知らせ。
   */
  const near = C.peripheralZ(s.t);
  const frame = Math.floor(s.walkAcc / 22) % 2;
  for (const d of byDepth(s.deer)) {
    if (d.z < -55) continue;
    if (s.down && d.z > near) continue;
    const sc = C.scaleOf(d.z);
    const x = laneX(d.lane, sc);
    shadow(ctx, x, C.yOf(d.z), 22 * sc);
    drawSprite(ctx, pick(SPR.deer[frame], sc), x, C.yOf(d.z));
  }

  // 子ども。いつでも暗幕の上に描く——自分がどこに居るかは常に見えていい
  const jumping = s.hop > 0 && s.trip <= 0;
  const kidFrame = Math.floor(s.walkAcc / 13) % 2;
  const kid = s.trip > 0
    ? SPR.kidTrip
    : jumping
      ? SPR.kidJump
      : (s.down ? SPR.kidDown : SPR.kidUp)[kidFrame];
  const bob = s.trip > 0 ? 0 : Math.floor(s.walkAcc / 13) % 2;
  const kx = lxToX(s.lx, 1);
  shadow(ctx, kx, C.KID_Y + 1, jumping ? 10 : 14);
  drawSprite(ctx, kid, kx, C.KID_Y + bob - (jumping ? 6 : 0));

  gazeMark(ctx, s, by);
  drawHud(ctx, s);

  if (s.intro > 0 && s.phase === "playing") {
    zoneGuide(ctx, s);
    // 区画の案内と場所を取り合わないよう、指示は子どものすぐ上に出す
    introPrompt(ctx, s, C.KID_Y - 48);
  }

  if (s.bannerT > 0 && s.banner) {
    ctx.fillStyle = "rgba(17,20,14,.75)";
    ctx.fillRect(0, C.KID_Y - 40, C.VIEW.w, 11);
    ctx.fillStyle = "#f2e3c8";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(s.banner, CX, C.KID_Y - 32);
    ctx.textAlign = "left";
  }
}

/**
 * いまどっちを見ているかの印。**姿勢だけに頼らない。**
 * 暗幕の境目に、見ている向きへ小さく三角を出す。
 */
function gazeMark(ctx: CanvasRenderingContext2D, s: State, by: number): void {
  const y = s.down ? by + 4 : by - 5;
  const d = s.down ? 1 : -1;
  ctx.fillStyle = "rgba(230,192,106,.9)";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(C.VIEW.w - 12 + i, y + d * i, 8 - i * 2, 1);
  }
}

/**
 * **区画の案内。**教えているあいだだけ、どこを触ると何が起きるかを画面に置く。
 * 説明文を読ませるより、触る場所そのものに書いてあるほうが早い。
 */
function zoneGuide(ctx: CanvasRenderingContext2D, s: State): void {
  const fade = Math.min(1, s.intro / 2.5);
  const bandY = Math.round(C.VIEW.h * (1 - LANE_BAND));
  ctx.save();
  ctx.globalAlpha = fade;

  // 区切り線
  ctx.fillStyle = "rgba(230,192,106,.35)";
  for (let x = 0; x < C.VIEW.w; x += 4) ctx.fillRect(x, bandY, 2, 1);
  for (let i = 1; i < LANES; i++) {
    const x = Math.round((C.VIEW.w * i) / LANES);
    for (let y = bandY; y < C.VIEW.h; y += 4) ctx.fillRect(x, y, 1, 2);
  }

  // 地面の上に直接書くと読めないので、下敷きを敷く
  ctx.font = "7px monospace";
  ctx.textAlign = "center";
  const label = (str: string, x: number, y: number): void => {
    const w = ctx.measureText(str).width + 8;
    ctx.fillStyle = "rgba(17,20,14,.72)";
    ctx.fillRect(Math.round(x - w / 2), y - 7, Math.round(w), 10);
    ctx.fillStyle = "rgba(230,192,106,.9)";
    ctx.fillText(str, x, y);
  };
  label("ここを さわると まえを みる", CX, bandY - 4);
  const names = ["ひだり", "まんなか", "みぎ"];
  for (let i = 0; i < LANES; i++) {
    label(names[i], (C.VIEW.w * (i + 0.5)) / LANES, bandY + 14);
  }
  ctx.textAlign = "left";
  ctx.restore();
}

/**
 * 教えているあいだの合図。
 *
 * 「何をやっているのかよくわからないまま終わった」への答え。
 * 説明を増やすのではなく、**そのとき何をすべきかを、その場に出す**。
 */
/** いま居るレーンが塞がっているとき、どっちへ逃げればいいか。 */
function away(s: State): string {
  const free = [];
  for (let i = 0; i < C.LANES; i++) {
    if (i === s.lane) continue;
    const blocked = s.poops.some((p) => !p.done && p.z > 0 && p.z < 200 && p.lane === i)
      || s.deer.some((d) => !d.done && d.z > 0 && d.z < 260 && d.lane === i);
    if (!blocked) free.push(i);
  }
  const to = free.length ? free.reduce((a, b) =>
    Math.abs(a - s.lane) <= Math.abs(b - s.lane) ? a : b) : s.lane === 0 ? 1 : 0;
  const name = ["ひだり", "まんなか", "みぎ"][to];
  return to < s.lane ? `◀ ${name}へ` : `${name}へ ▶`;
}

function introPrompt(ctx: CanvasRenderingContext2D, s: State, atY: number): void {
  const v = C.speed(s.t);
  let best = Infinity;
  let msg = "";

  const consider = (t: number, m: string): void => {
    if (t < best) {
      best = t;
      msg = m;
    }
  };

  for (const p of s.poops) {
    if (p.done || p.z <= 0) continue;
    if (p.big) consider(p.z / v, "▲ うえを さわって とぶ");
    else if (p.lane === s.lane) consider(p.z / v, away(s));
  }
  for (const d of s.deer) {
    if (d.done || d.z <= 0 || d.lane !== s.lane) continue;
    consider(d.z / (v + C.DEER_SPEED), away(s));
  }

  // 何も来ていないときは、顔を上げて確かめることを教える
  if (best > 1.5) {
    if (!s.down) return;
    msg = "▲ うえを さわると 前が見える";
  }

  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  const w = ctx.measureText(msg).width + 12;
  ctx.fillStyle = "rgba(17,20,14,.8)";
  ctx.fillRect(CX - w / 2, atY - 11, w, 15);
  ctx.fillStyle = "#e6c06a";
  ctx.fillText(msg, CX, atY);
  ctx.textAlign = "left";
}
