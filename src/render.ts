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
  // 石畳。写真の板石に合わせて、灰色に少し緑と桃を混ぜた3種。
  joint: "#6f6a5c",
  stoneA: "#b9b5a4",
  stoneB: "#a8a795",
  stoneC: "#c6c0ad",
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

  /**
   * **下を向いているあいだは、鹿を描かない。**
   *
   * 暗幕を薄くして「読めるが読みにくい」にしていたが、読める以上は
   * 下を向いたまま鹿を監視できてしまい、「ずっと押して鹿が来たら離す」が
   * 最適手になっていた。それではフンを見る理由が無い。
   * 見えないからこそ「急に来てびっくり」になる。
   */
  if (!s.down) {
    const frame = Math.floor(s.walkAcc / 9) % 2;
    for (const d of s.deer) {
      ctx.drawImage(SPR.deer[frame], Math.round(d.x), base - 4 - C.DEER_SIDE.h);
    }
  }

  /**
   * 子ども。前を見ているか下を向いているかは、**顔で分かる**のがいちばん速い。
   *
   * とんでいる1コマだけは、ここで持ち上げて描く。大きいフンを越えた瞬間は
   * 顔が上がっているので足元の帯が暗く、**この絵しか成否を伝えるものが無い**。
   */
  const jumping = s.hop > 0 && s.trip <= 0;
  const kid = s.trip > 0 ? SPR.kidTrip : jumping ? SPR.kidJump : s.down ? SPR.kidDown : SPR.kidUp;
  const lift = jumping ? 3 : 0;
  ctx.drawImage(kid, C.KID_X - 3, base - 4 - C.KID_HEAD.h - lift);

  ctx.restore();
}

/**
 * 足元の帯。**横から見た、足元のアップ。**
 *
 * 上帯と同じ場面を「近く」で見ているだけ。
 * 一度は真上から見た絵にしていたが、「足元を映しているとわかりにくい」と言われた。
 * 理屈（目の使い方が違う）としては筋が通っていたが、伝わらないなら負け。
 *
 * **フンは靴と同じ線を通る。**帯いっぱいに散らしていたのをやめた。
 * 当たりに効かないから安全、というのは作り手の理屈で、
 * 遊ぶ側からは「足と関係ない場所のフンを避けている」ようにしか見えない。
 */
function drawGround(ctx: CanvasRenderingContext2D, s: State, top: number, h: number): void {
  if (h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, C.VIEW.w, h);
  ctx.clip();

  /**
   * 地面の線を**帯の上のほうに置く**。ここを靴とフンが通る。
   *
   * 最初は帯の下端に置いたが、そうすると帯の3/4が空になった。
   * **下を向いたとき、目に入るのはほとんど地面**なので、逆が正しい。
   * 線から下はぜんぶ砂利（手前の地面）で埋まる。
   */
  const base = top + Math.round(h * 0.24);

  ctx.fillStyle = COL.skyLow;
  ctx.fillRect(0, top, C.VIEW.w, Math.max(0, base - top));

  /**
   * **石畳。** 砂利をやめてこれにした。
   *
   * 写真の参道は大きな板石が並んでいて、子どもは
   * **どの石に足を置くか選びながら**歩いていた。足元がただの砂地だと
   * 「地面」でしかないが、石が並んでいると「マス目」に見える——
   * 何を見ればいいのかが、絵だけで分かる。
   *
   * 石の並びは決まった式から出しているので、作り直しても同じ模様が出る。
   */
  ctx.fillStyle = COL.joint;
  ctx.fillRect(0, base, C.VIEW.w, top + h - base);

  /**
   * **手前ほど大きく。** 等間隔の格子にしたら煉瓦の壁に見えた。
   * 写真の参道は、近くの石が大きく、奥へいくほど詰まって見える。
   * 縦の高さと横幅の両方を手前ほど広げると、床として立ち上がる。
   */
  const gh = Math.max(1, top + h - base);
  const scroll = Math.floor(s.dist);
  const ROWS = 5;
  // 手前ほど厚い行にする（重みが 1,2,3,... の比）
  let weight = 0;
  for (let r = 0; r < ROWS; r++) weight += r + 1;
  let ry = base;
  for (let r = 0; r < ROWS; r++) {
    const rh = Math.max(3, Math.round((gh * (r + 1)) / weight));
    const near = (r + 1) / ROWS;             // 0〜1。手前ほど1に近い
    const sw = Math.round(C.STONE_W * (0.55 + near * 0.75));
    const off = Math.floor(scroll * (0.72 + near * 0.35));
    const stagger = r * 17;
    const first = Math.floor((off - stagger) / sw);
    for (let i = -1; i < C.VIEW.w / sw + 2; i++) {
      const idx = first + i;
      const sx = idx * sw - off + stagger;
      const n = gravelAt(idx * 7, r * 31);
      const w = sw - 2 - Math.round(n * 4);
      ctx.fillStyle = n < 0.3 ? COL.stoneA : n < 0.62 ? COL.stoneB : COL.stoneC;
      ctx.fillRect(sx, ry, w, Math.max(1, rh - 2));
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(sx, ry, w, 1);
    }
    ry += rh;
  }

  // **フンは地面の線の上。靴と同じ高さを通る。**
  /**
   * フン。**大きいのは「またぐもの」なので、見てすぐ分かる必要がある。**
   * 同じ茶色の塊が大小あるだけだと、来てから気づいて間に合わない。
   * 影を落として、地面から盛り上がって見えるようにしてある。
   */
  for (const p of s.poops) {
    const spr = p.big ? SPR.poopBig : SPR.poop;
    const x = Math.round(p.x);
    if (p.big) {
      ctx.fillStyle = "rgba(32,26,36,.32)";
      ctx.fillRect(x - 2, base + 1, spr.width + 4, 3);
    }
    ctx.drawImage(spr, x, base - spr.height + 2);
  }

  // 足。跨いだ瞬間だけ前足が上がる——「自分で避けた」感はこの1コマで出る。
  const legs = s.trip > 0
    ? SPR.legs[0]
    : s.stepping > 0
      ? SPR.legsStep
      : SPR.legs[Math.floor(s.walkAcc / 11) % 2];
  ctx.drawImage(legs, C.KID_X - 8, base - legs.height + 4);

  ctx.restore();
}

/** 帯の名前。**初見で何を見ているか分からない**と言われたので、書いてある。 */
function bandLabel(
  ctx: CanvasRenderingContext2D, str: string, x: number, y: number, on: boolean,
): void {
  ctx.font = "7px monospace";
  ctx.fillStyle = on ? "rgba(242,227,200,.85)" : "rgba(242,227,200,.35)";
  ctx.fillText(str, x, y);
}

/**
 * 教えているあいだの合図。
 *
 * 「何をやっているのかよくわからないまま終わった」への答え。
 * 説明文を増やすのではなく、**そのとき押すべきかどうかを、その場に出す**。
 */
function introPrompt(ctx: CanvasRenderingContext2D, s: State, split: number): void {
  /**
   * 下を向くべきもの（小さいフン）と、顔を上げるべきもの（鹿・大きいフン）を、
   * **足元に着くまでの時間**で比べる。距離で比べると、視差でゆっくり
   * 近づいてくる鹿を近いものと見誤って、教え方が逆になる。
   * **大きいフンは、とぶために顔を上げる側。**
   */
  const v = C.speedAhead(s.t);
  let tDown = Infinity;
  let tUp = Infinity;
  for (const p of s.poops) {
    if (p.done) continue;
    const t = (p.x - C.KID_X) / v;
    if (p.big) tUp = Math.min(tUp, t);
    else tDown = Math.min(tDown, t);
  }
  for (const d of s.deer) {
    if (!d.done) tUp = Math.min(tUp, (d.x - C.KID_X) / (v * C.AHEAD_PARALLAX));
  }

  if (Math.min(tDown, tUp) > 1.2) return;   // まだ先。出すには早い
  const wantDown = tDown <= tUp;

  const msg = wantDown ? "▼ おす" : "▲ はなす";
  const ok = wantDown === s.down;
  const y = wantDown ? split + 24 : C.HUD_H + 24;

  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(17,20,14,.7)";
  ctx.fillRect(C.VIEW.w / 2 - 30, y - 10, 60, 14);
  ctx.fillStyle = ok ? "#7fae4e" : "#e6c06a";
  ctx.fillText(msg, C.VIEW.w / 2, y);
  ctx.textAlign = "left";
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

  // どっちの帯が何なのかを書いておく。初見で分かることのほうが、
  // 画面がすっきりしていることより大事。
  bandLabel(ctx, "まえ", 3, C.HUD_H + 9, !s.down);
  bandLabel(ctx, "あしもと", 3, split + 9, s.down);

  drawHud(ctx, s);

  // 教えているあいだは、**次に来るものと、いま何をすべきか**を出す。
  if (s.intro > 0 && s.phase === "playing") introPrompt(ctx, s, split);

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
