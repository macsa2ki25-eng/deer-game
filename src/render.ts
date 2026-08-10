/** ゲーム画面（上段）の描画。状態は一切変えない。スコア表示は下段のDOMが持つ。 */

import * as C from "./config";
import type { State } from "./state";
import { SPR } from "./sprites";
import { STRIP_H } from "./background";

export function render(ctx: CanvasRenderingContext2D, s: State, bg: HTMLCanvasElement): void {
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

  for (const t of s.tourists) {
    ctx.drawImage(SPR.tourist, Math.round(t.x), Math.round(t.y));
  }

  for (const d of s.deer) {
    if (d.squat > 0) {
      ctx.drawImage(SPR.deerSquat, Math.round(d.x), Math.round(d.y));
      continue;
    }
    const frame = Math.floor((s.walkAcc + d.y * 2) / 7) % 2;
    ctx.drawImage(SPR.deer[frame], Math.round(d.x), Math.round(d.y));
  }

  // 無敵中は点滅させる
  const hidden = s.inv > 0 && Math.floor(s.inv * 14) % 2 === 0;
  if (!hidden) {
    const frame = Math.floor(s.walkAcc / 9) % 2;
    ctx.drawImage(SPR.player[frame], Math.round(s.px), Math.round(s.py));
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
}
