/** ゲーム画面（上段）の描画。状態は一切変えない。スコア表示は下段のDOMが持つ。 */

import * as C from "./config";
import type { State } from "./state";
import { HUD, SPR } from "./sprites";
import { STRIP_H } from "./background";

const SHOE = 7;

/** 文字列の描画幅[px]。右寄せの起点を出すのに使う。 */
function textWidth(str: string, scale: number): number {
  let w = 0;
  for (const ch of str) {
    const g = HUD.num[ch];
    if (g) w += (g.width + 1) * scale;
  }
  return w - scale;
}

/** 数字を置く。scale は整数倍のみ（ドット絵なので半端に伸ばさない）。 */
function text(
  ctx: CanvasRenderingContext2D,
  set: Record<string, HTMLCanvasElement>,
  str: string,
  x: number,
  y: number,
  scale: number,
): void {
  let cx = x;
  for (const ch of str) {
    const g = set[ch];
    if (!g) continue;
    ctx.drawImage(g, cx, y, g.width * scale, g.height * scale);
    cx += (g.width + 1) * scale;
  }
}

/**
 * 画面上端の HUD。
 *
 * 出すのは4つだけ——**くつ（残り）／きょり／スコア／せんべい**。
 * 倍率・かすめた数・たかられた頭数は消した。
 * どれも「見ても、その瞬間の操作が変わらない」数字で、
 * 読む余裕が無いまま画面を埋めていただけだった（倍率はゲージの絵だけ残す）。
 *
 * ラベル文字は一切使わない。避けている最中に言葉は読めない。
 */
function drawHud(ctx: CanvasRenderingContext2D, s: State): void {
  ctx.fillStyle = "#11140e";
  ctx.fillRect(0, 0, C.CANVAS.w, C.HUD_H);

  // 倍率。数字をやめてゲージだけにした。
  // 「伸びている／減っている」が分かれば足りるもので、値そのものに用は無い。
  const g = Math.min(1, s.grazeGauge / C.GRAZE_MAX);
  if (g > 0) {
    ctx.fillStyle = "#d8b45e";
    ctx.fillRect(0, C.HUD_H - 2, Math.round(C.CANVAS.w * g), 2);
  }

  // くつ。左端。減っていくのが目の端に入る位置。
  for (let i = 0; i < C.DIRT_MAX; i++) {
    ctx.drawImage(i < s.dirt ? HUD.shoeBad : HUD.shoeOk, 4 + i * (SHOE + 1), 4);
  }

  // ジャンプの残り。**回数そのもの**を点で出す。
  // ボタンを廃止して「指を離す＝ジャンプ」にしたので、
  // 残量の在りかがどこにも無くなった。数字より点のほうが速く読める。
  const pips = Math.round(1 / C.JUMP_COST);
  const px0 = 4 + C.DIRT_MAX * (SHOE + 1) + 5;
  for (let i = 0; i < pips; i++) {
    const have = s.jumpFuel >= (i + 1) * C.JUMP_COST - 0.001;
    ctx.fillStyle = have ? "#7fae4e" : "#2f3a26";
    ctx.fillRect(px0 + i * 5, 6, 3, 6);
  }

  // きょり。ステージでは「ゴールまで」の残りを出す。
  const metres =
    s.mode === "stage" ? Math.max(0, Math.ceil(s.goal - s.progress)) : Math.floor(s.progress);
  text(ctx, HUD.numDim, `${metres}m`, px0 + pips * 5 + 5, 5, 1);

  // スコア。いちばん大きい数字＝スコア、で通じる。だからラベルが要らない。
  const score = String(Math.floor(s.score));
  text(ctx, HUD.num, score, C.CANVAS.w - 4 - textWidth(score, 2), 3, 2);

  // せんべい。持っているときだけ出す。0枚のときの「0」は情報ではない。
  if (s.senbei > 0) {
    const n = String(s.senbei);
    const x = C.CANVAS.w - 6 - textWidth(score, 2) - textWidth(n, 1) - SHOE - 3;
    ctx.drawImage(HUD.senbei, x, 5);
    text(ctx, HUD.num, n, x + SHOE + 2, 5, 1);
  }
}

export function render(ctx: CanvasRenderingContext2D, s: State, bg: HTMLCanvasElement): void {
  // 世界を先に描く。HUD は最後に上から乗せる。
  // 背景のストリップは世界の y<0 まで伸びているので、HUD を先に描くと塗り潰される。
  ctx.save();
  // ここから下は世界の座標系。HUD のぶんだけずらして、
  // ゲーム側のコードが HUD の存在を一切知らなくて済むようにする。
  ctx.translate(0, C.HUD_H);

  const off = s.scrollPx % STRIP_H;
  ctx.drawImage(bg, 0, off - STRIP_H);
  ctx.drawImage(bg, 0, off);

  // 小石はフンより先に敷く。回廊の輪郭を消すのが役目なので目立たなくてよい。
  for (const p of s.pebbles) {
    ctx.drawImage(SPR.pebble[p.variant], Math.round(p.x), Math.round(p.y));
  }

  for (const p of s.poops) {
    const spr = p.big ? SPR.pelletBig : SPR.pellet[p.variant];
    ctx.drawImage(spr, Math.round(p.x), Math.round(p.y));
  }

  for (const st of s.stalls) {
    ctx.drawImage(SPR.stall, Math.round(st.x), Math.round(st.y));
  }

  for (const t of s.trees) {
    ctx.drawImage(SPR.tree, Math.round(t.x), Math.round(t.y));
  }

  for (const sh of s.shoes) {
    ctx.drawImage(SPR.shoe, Math.round(sh.x), Math.round(sh.y));
  }

  for (const b of s.baits) {
    ctx.drawImage(SPR.bait, Math.round(b.x), Math.round(b.y));
  }

  for (const t of s.tourists) {
    ctx.drawImage(SPR.tourist, Math.round(t.x), Math.round(t.y));
  }

  for (const d of s.deer) {
    const x = Math.round(d.x);
    const y = Math.round(d.y);
    if (d.kind === "sleeper") {
      ctx.drawImage(SPR.deerSleep, x + C.SLEEPER_ART.dx, y + C.SLEEPER_ART.dy);
      continue;
    }
    if (d.squat > 0) {
      ctx.drawImage(SPR.deerSquat, x, y);
      continue;
    }
    if (d.kind === "stag") {
      // 角のぶん上に伸びているので、体の位置を合わせて描く
      ctx.drawImage(SPR.deerStag, x, y - 4);
      continue;
    }
    // 添字は必ず 0 か 1。d.y は画面外（負）から入ってくるので、
    // 素直に % 2 すると -1 になり、SPR.deer[-1] が undefined で
    // **drawImage が例外を投げて描画ループごと止まっていた**。
    // 走り出した直後（walkAcc がまだ小さい）だけ起きるので、目視では捕まらない。
    const frame = ((Math.floor((s.walkAcc + d.y * 2) / 7) % 2) + 2) % 2;
    ctx.drawImage(SPR.deer[frame], x, y);
  }

  // 無敵中は点滅させる
  const hidden = s.inv > 0 && Math.floor(s.inv * 14) % 2 === 0;
  if (!hidden) {
    const frame = Math.floor(s.walkAcc / 9) % 2;
    // ジャンプ。山なりに持ち上げて、足元に影を残す。
    // 影を置かないと「浮いている」ではなく「小さくなった」に見える。
    const t = s.air > 0 ? 1 - Math.abs(1 - (2 * (C.JUMP_TIME - s.air)) / C.JUMP_TIME) : 0;
    const lift = Math.round(t * C.JUMP_LIFT);
    if (lift > 0) {
      ctx.fillStyle = "rgba(32,26,36,0.28)";
      const sw = Math.round(C.PLAYER.hitW * (1 - t * 0.3));
      ctx.fillRect(
        Math.round(s.px + C.PLAYER.hitX + (C.PLAYER.hitW - sw) / 2),
        Math.round(s.py + C.PLAYER.h - 3),
        sw,
        2,
      );
    }
    ctx.drawImage(SPR.player[frame], Math.round(s.px), Math.round(s.py) - lift);
  }

  // 予兆。鹿が入ってくる辺で点滅する。
  for (const w of s.warns) {
    if (Math.floor(w.t * 12) % 2 === 0) continue;
    if (w.edge === "top") {
      ctx.drawImage(SPR.warnDown, Math.round(w.x + 4), 2);
    } else if (w.edge === "left") {
      ctx.drawImage(SPR.warnRight, 2, Math.round(w.y + 6));
    } else {
      ctx.drawImage(SPR.warnLeft, C.VIEW.w - 6, Math.round(w.y + 6));
    }
  }

  ctx.restore();
  drawHud(ctx, s);
}
