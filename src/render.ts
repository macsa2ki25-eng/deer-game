/**
 * 描画。**画面はふたつの帯でできている。**
 *
 *   上帯 = 前方。参道の奥から鹿が歩いてくる
 *   下帯 = 足元。地面のフンが右から左へ流れる
 *
 * 視線を切り替えると**仕切りが動く**。ここで絵を拡大縮小しないのが肝で、
 * ドット絵を縦に潰すと一発で嘘くさくなる。大きさは常に同じまま、
 * **見えている範囲（切り取る量）だけ**を増やす。
 *
 * 見ていない側は暗幕をかぶせるが、**真っ暗にはしない**。
 * 完全に見えないと「いつ切り替えるか」が当てずっぽうになって理不尽になる。
 * 読めるが、読むのに注意がいる、くらいがちょうどいい。
 */

import * as C from "./config";
import type { State } from "./state";
import { HUD, SPR, type Sprite } from "./sprites";

const COL = {
  sky: "#8fb3c9",
  skyLow: "#c3d2cf",
  far: "#6d8a5c",
  ground: "#c9c2a6",
  pebble: "#9aa08a",
  joint: "#b5ad90",
  groundDark: "#b5ad90",
  groundLight: "#d8d4bc",
  line: "#a89f80",
  hud: "#11140e",
  ink: "#201a24",
};

/** 砂利。決まった模様にして、毎フレーム描き直しても暴れないようにする。 */
function gravelAt(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
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

  // スコア。いちばん大きい数字＝スコア、で通じるのでラベルは要らない。
  const score = String(Math.floor(s.score));
  let w = 0;
  for (const ch of score) w += (HUD.num[ch]?.width ?? 3) + 1;
  text(ctx, HUD.num, score, C.VIEW.w - w - 2, 4, 1);
}

/**
 * 前方の帯。
 *
 * **地面を帯の下端ではなく、下から 26px に置く。**
 * 最初は下端に置いたが、そうすると帯の残り全部が空になり、
 * 画面のほとんどが「何も起きない水色」になった。速さも伝わらない。
 * いまは 空 → 並木 → 土手 → 参道 を上から詰めて、帯を埋めている。
 * 木は奥のものなので**ゆっくり流れる**（視差）。これが速さの下支えになる。
 */
function drawAhead(ctx: CanvasRenderingContext2D, s: State, top: number, h: number): void {
  if (h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, C.VIEW.w, h);
  ctx.clip();

  const base = top + h;          // 参道の面（子どもと鹿が立つ高さ）
  const bank = base - 10;        // 土手の上端
  const treeBase = bank + 3;     // 木の根元

  const grd = ctx.createLinearGradient(0, top, 0, bank);
  grd.addColorStop(0, COL.sky);
  grd.addColorStop(1, COL.skyLow);
  ctx.fillStyle = grd;
  ctx.fillRect(0, top, C.VIEW.w, h);

  // 並木。**奥（treeFar）を先に、手前（tree）を後に描く。**
  // 流れる速さも変えてあるので、走ると奥行きが出る。速さの下支え。
  for (const g of s.scenery) {
    if (g.kind !== "treeFar") continue;
    ctx.drawImage(SPR.treeFar, Math.round(g.x), treeBase - 7 - SPR.treeFar.height);
  }
  for (const g of s.scenery) {
    if (g.kind === "treeFar") continue;
    const spr = g.kind === "tree" ? SPR.tree : SPR.lantern;
    ctx.drawImage(spr, Math.round(g.x), treeBase - spr.height);
  }

  ctx.fillStyle = COL.far;
  ctx.fillRect(0, bank, C.VIEW.w, base - bank);

  ctx.fillStyle = COL.ground;
  ctx.fillRect(0, base - 4, C.VIEW.w, 4);
  ctx.fillStyle = COL.groundDark;
  ctx.fillRect(0, base - 4, C.VIEW.w, 1);

  for (const b of s.senbeis) {
    if (b.taken) continue;
    const bob = Math.sin(s.t * 6 + b.x * 0.1) * 1.5;
    ctx.drawImage(SPR.senbei, Math.round(b.x), Math.round(base - 26 + bob));
  }

  const frame = Math.floor(s.walkAcc / 9) % 2;
  for (const d of s.deer) {
    ctx.drawImage(SPR.deer[frame], Math.round(d.x), base - 4 - C.DEER_SIDE.h);
  }

  // 子ども。前を見ているか下を向いているかは、**顔で分かる**のがいちばん速い。
  const kid = s.trip > 0 ? SPR.kidTrip : s.down ? SPR.kidDown : SPR.kidUp;
  ctx.drawImage(kid, C.KID_X - 3, base - 4 - C.KID_HEAD.h);

  ctx.restore();
}

/**
 * 足元の帯。**真上から見た地面。**
 *
 * 上帯（横から見た前方）と視点をわざと変えてある。目の使い方が違うからで、
 * 同じ横視点で2つ並べると、視線の切り替えではなくただの分割画面に見える。
 * 真上から見ると帯の高さいっぱいにフンを散らせるので、画面も埋まる。
 *
 * **散らばりは見た目だけ。**当たりは「通り過ぎた瞬間に下を見ていたか」だけで
 * 決まる。ここに縦の当たり判定を入れると、位置合わせが復活してしまう。
 */
function drawGround(ctx: CanvasRenderingContext2D, s: State, top: number, h: number): void {
  if (h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, C.VIEW.w, h);
  ctx.clip();

  ctx.fillStyle = COL.ground;
  ctx.fillRect(0, top, C.VIEW.w, h);

  // 砂利。**帯いっぱいに、流れる向きに敷く。**
  // 密度を上げてあるのは、ここが「速い」をいちばん強く伝える場所だから。
  // 位置は決まった式から出しているので、作り直しても同じ模様が出る。
  const period = 112;
  const off = Math.floor(s.dist) % period;
  for (let i = 0; i < 460; i++) {
    const gx = (i * 41) % (C.VIEW.w + period);
    const gy = (i * 67) % Math.max(1, h);
    const x = gx - off;
    if (x < -1 || x > C.VIEW.w) continue;
    const n = gravelAt(gx, gy);
    ctx.fillStyle = n < 0.38 ? COL.groundDark : n > 0.9 ? COL.pebble : COL.groundLight;
    ctx.fillRect(x, top + gy, 1, 1);
  }

  // 敷石の目地。真上から見た絵なので縦の線になる。等間隔＝速さがそのまま見える。
  // **薄く、途切れさせる。**濃い線を通しで引くと板張りの床に見えてしまった。
  ctx.fillStyle = COL.joint;
  for (let x = -(Math.floor(s.dist) % 30); x < C.VIEW.w; x += 30) {
    for (let y = top + 3; y < top + h - 3; y += 7) ctx.fillRect(x, y, 1, 4);
  }

  // フンは帯いっぱいに散らす。**散らばりは見た目だけ**（当たりには効かない）。
  for (const p of s.poops) {
    const spr = p.big ? SPR.poopBig : SPR.poop;
    const py = top + 5 + p.y * Math.max(1, h - spr.height - 10);
    ctx.drawImage(spr, Math.round(p.x), Math.round(py));
  }

  // 靴。真上から。跨いだ瞬間だけ足が開く——「自分で避けた」感はこの1コマで出る。
  const shoes = s.trip > 0
    ? SPR.shoes[0]
    : s.stepping > 0
      ? SPR.shoesStep
      : SPR.shoes[Math.floor(s.walkAcc / 9) % 2];
  ctx.drawImage(shoes, C.KID_X - 3, Math.round(top + h / 2 - shoes.height / 2));

  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, s: State): void {
  const split = Math.round(C.HUD_H + C.FIELD_H * s.split);
  const aheadH = split - C.HUD_H;
  const groundH = C.VIEW.h - split;

  drawAhead(ctx, s, C.HUD_H, aheadH);
  drawGround(ctx, s, split, groundH);

  // 見ていない側に暗幕。ここが「どっちを見ているか」のいちばん強い合図になる。
  ctx.fillStyle = `rgba(12,14,10,${C.DIM})`;
  if (s.down) ctx.fillRect(0, C.HUD_H, C.VIEW.w, aheadH);
  else ctx.fillRect(0, split, C.VIEW.w, groundH);

  // 仕切りの線
  ctx.fillStyle = COL.ink;
  ctx.fillRect(0, split - 1, C.VIEW.w, 1);

  drawHud(ctx, s);

  if (s.bannerT > 0 && s.banner) {
    ctx.fillStyle = "rgba(17,20,14,.75)";
    ctx.fillRect(0, split - 12, C.VIEW.w, 11);
    ctx.fillStyle = "#f2e3c8";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(s.banner, C.VIEW.w / 2, split - 4);
    ctx.textAlign = "left";
  }
}
