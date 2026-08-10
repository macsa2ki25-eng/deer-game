/** 1フレームぶんの更新。描画はここではやらない。 */

import * as C from "./config";
import type { State, Deer } from "./state";
import { spawnRow, scheduleDeer, hatchDeer, dropFromDeer, spawnStall } from "./level";
import { sfx } from "./audio";
import type { InputState } from "./input";

/** 立ち止まってフンをし始める y。画面に入りきってから始める。 */
const POOPER_TRIGGER_Y = 34;

function overlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function movePlayer(s: State, input: InputState, dt: number): void {
  const slowed = (s.slip > 0 ? C.SLIP_FACTOR : 1) * (s.stun > 0 ? 0 : 1);
  const maxStep = C.LATERAL * slowed * dt;

  const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const ky = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  if (kx || ky) {
    const len = Math.hypot(kx, ky);
    s.px += (kx / len) * maxStep;
    s.py += (ky / len) * maxStep;
  } else if (input.tx !== null && input.ty !== null && s.stun <= 0) {
    // パッドは絶対位置指定だが、速度を頭打ちにするのでワープはしない。
    // 回廊の到達可能性の計算もこの速度を前提にしている。
    const dx = input.tx - s.px;
    const dy = input.ty - s.py;
    const d = Math.hypot(dx, dy);
    if (d <= maxStep || d === 0) {
      s.px = input.tx;
      s.py = input.ty;
    } else {
      s.px += (dx / d) * maxStep;
      s.py += (dy / d) * maxStep;
    }
  }

  if (s.knockback > 0) {
    s.py += C.KNOCKBACK_SPEED * dt;
    s.knockback -= dt;
  }

  // 参道の外へは出られない。安全地帯があると避けゲーは即座に壊れる。
  s.px = Math.max(C.PATH.x0, Math.min(C.PATH.x1 - C.PLAYER.w, s.px));
  s.py = Math.max(C.PLAY_Y.top, Math.min(C.PLAY_Y.bottom, s.py));
}

/** 道の途中で立ち止まってフンをする鹿。落ちた粒はその場の障害物になる。 */
function updatePooper(s: State, d: Deer, dt: number): void {
  if (d.squat > 0) {
    d.squat -= dt;
    d.dropIn -= dt;
    if (d.dropIn <= 0 && d.dropsLeft > 0) {
      dropFromDeer(s, d);
      d.dropsLeft--;
      d.dropIn = C.POOPER_INTERVAL;
      sfx.plop();
    }
    if (d.squat <= 0) d.sp = C.deerSpeed(s.dist) * C.TILE; // 用が済んだら歩き出す
    return;
  }
  if (d.dropsLeft > 0 && d.y > POOPER_TRIGGER_Y) {
    d.squat = C.POOPER_STOP;
    d.sp = 0;
    d.dropIn = 0.25;
    sfx.snort();
  }
}

/**
 * 木は通り抜けられない。重なっていたら、いちばん浅い向きへ押し出す。
 * 木は上から流れてくるので「木に押される」形になり、道が狭まる感じが出る。
 */
function resolveTrees(s: State): void {
  const hw = C.PLAYER.hitW;
  const hh = C.PLAYER.hitH;
  for (const t of s.trees) {
    const hx = s.px + C.PLAYER.hitX;
    const hy = s.py + C.PLAYER.hitY;
    const bx = t.x + C.TREE_BOX.hitX;
    const by = t.y + C.TREE_BOX.hitY;
    const bw = C.TREE_BOX.hitW;
    const bh = C.TREE_BOX.hitH;
    if (!overlap(hx, hy, hw, hh, bx, by, bw, bh)) continue;

    const outLeft = bx - (hx + hw);
    const outRight = bx + bw - hx;
    const outUp = by - (hy + hh);
    const outDown = by + bh - hy;
    const dx = Math.abs(outLeft) < Math.abs(outRight) ? outLeft : outRight;
    const dy = Math.abs(outUp) < Math.abs(outDown) ? outUp : outDown;
    if (Math.abs(dx) <= Math.abs(dy)) s.px += dx;
    else s.py += dy;
  }
  s.px = Math.max(C.PATH.x0, Math.min(C.PATH.x1 - C.PLAYER.w, s.px));
  s.py = Math.max(C.PLAY_Y.top, Math.min(C.PLAY_Y.bottom, s.py));
}

/** 売り場を通ったら、せんべいを受け取る。 */
function resolveStalls(s: State): void {
  const hx = s.px + C.PLAYER.hitX;
  const hy = s.py + C.PLAYER.hitY;
  for (const st of s.stalls) {
    if (st.taken) continue;
    if (!overlap(hx, hy, C.PLAYER.hitW, C.PLAYER.hitH,
      st.x + C.STALL_BOX.hitX, st.y + C.STALL_BOX.hitY, C.STALL_BOX.hitW, C.STALL_BOX.hitH)) continue;
    st.taken = true;
    s.senbei = C.SENBEI_PER_STALL;
    sfx.pickup();
    banner(s, `せんべい ×${C.SENBEI_PER_STALL}`, 1.6);
  }
}

/**
 * せんべいを持っているとき、ぶつかる手前で1頭に渡せる。
 * 判定を当たり判定より少しだけ広く取ってあるので、
 * 「寄ってきた鹿をぎりぎりで餌付けしてかわす」という遊びになる。
 * 渡しそこねればそのまま衝突する。
 */
function resolveFeed(s: State): void {
  if (s.senbei <= 0) return;
  const cx = s.px + C.PLAYER.w / 2;
  const cy = s.py + C.PLAYER.h / 2;
  for (let i = s.deer.length - 1; i >= 0; i--) {
    const d = s.deer[i];
    const dx = d.x + C.DEER_BOX.w / 2 - cx;
    const dy = d.y + C.DEER_BOX.h / 2 - cy;
    if (dx * dx + dy * dy > C.FEED_RADIUS * C.FEED_RADIUS) continue;
    s.deer.splice(i, 1);
    s.senbei--;
    s.fed++;
    s.score += C.FEED_SCORE * s.mult;
    s.grazeGauge = Math.min(C.GRAZE_MAX, s.grazeGauge + C.FEED_GAUGE);
    sfx.feed();
    return; // 1フレームに1頭まで
  }
}

/** 画面の上に一言出す。 */
function banner(s: State, text: string, seconds: number): void {
  s.banner = text;
  s.bannerT = seconds;
}

function moveEntities(s: State, vpx: number, dt: number): void {
  for (let i = s.trees.length - 1; i >= 0; i--) {
    s.trees[i].y += vpx * dt;
    if (s.trees[i].y > C.VIEW.h + 8) s.trees.splice(i, 1);
  }

  for (let i = s.stalls.length - 1; i >= 0; i--) {
    s.stalls[i].y += vpx * dt;
    if (s.stalls[i].y > C.VIEW.h + 8) s.stalls.splice(i, 1);
  }

  for (let i = s.poops.length - 1; i >= 0; i--) {
    s.poops[i].y += vpx * dt;
    if (s.poops[i].y > C.VIEW.h + 8) s.poops.splice(i, 1);
  }

  for (let i = s.pebbles.length - 1; i >= 0; i--) {
    s.pebbles[i].y += vpx * dt;
    if (s.pebbles[i].y > C.VIEW.h + 6) s.pebbles.splice(i, 1);
  }

  for (let i = s.tourists.length - 1; i >= 0; i--) {
    const t = s.tourists[i];
    // 観光客はこちらと同じ方向に歩くので、画面上ではゆっくり下がる
    t.y += vpx * 0.42 * dt;
    t.x += Math.sin(t.y * 0.03) * 6 * dt;
    if (t.y > C.VIEW.h + 20) s.tourists.splice(i, 1);
  }

  // せんべいを持っていると、鹿はすごい勢いで寄ってくる
  const rush = s.senbei > 0;
  for (let i = s.deer.length - 1; i >= 0; i--) {
    const d = s.deer[i];
    if (d.kind === "pooper") updatePooper(s, d, dt);
    const rushing = rush && d.squat <= 0 && d.kind !== "side";
    d.y += (vpx + d.sp * (rushing ? C.SENBEI_RUSH_SPEED : 1)) * dt;
    d.x += d.vx * dt;
    if (d.kind === "homing" || rushing) {
      const target = s.px - (C.DEER_BOX.w - C.PLAYER.w) / 2;
      const rate = rushing ? C.SENBEI_RUSH_HOMING : 30;
      d.x += Math.max(-rate * dt, Math.min(rate * dt, (target - d.x) * 1.6 * dt));
    }
    if (d.y > C.VIEW.h + 20 || d.x < -40 || d.x > C.VIEW.w + 40) s.deer.splice(i, 1);
  }
}

function hurt(s: State, amount: number, inv: number): boolean {
  s.dirt += amount;
  s.inv = inv;
  // かすめて稼いだぶんは踏むと半分持っていかれる。
  // 全部没収すると倍率が一生育たず、機構ごと死ぬ（実測して直した）。
  s.grazeGauge *= C.GRAZE_KEEP_ON_HIT;
  if (s.dirt >= C.DIRT_MAX) {
    s.dirt = C.DIRT_MAX;
    s.phase = "over";
    sfx.over();
    return true;
  }
  return false;
}

/**
 * フンとの判定。当たり判定の外側 GRAZE_PAD px に入っただけなら「かすめた」。
 * 危ないところを通るほど倍率が伸びる——これがこのゲームの攻めの手。
 */
function resolvePoops(s: State): boolean {
  const hx = s.px + C.PLAYER.hitX;
  const hy = s.py + C.PLAYER.hitY;
  const gx = hx - C.GRAZE_PAD;
  const gy = hy - C.GRAZE_PAD;
  const gw = C.PLAYER.hitW + C.GRAZE_PAD * 2;
  const gh = C.PLAYER.hitH + C.GRAZE_PAD * 2;

  for (let i = s.poops.length - 1; i >= 0; i--) {
    const p = s.poops[i];
    const size = p.big ? C.BIG_PELLET : C.PELLET;

    if (!overlap(gx, gy, gw, gh, p.x, p.y, size.w, size.h)) continue;

    if (s.inv <= 0 && overlap(hx, hy, C.PLAYER.hitW, C.PLAYER.hitH, p.x, p.y, size.w, size.h)) {
      s.poops.splice(i, 1);
      s.slip = C.SLIP_POOP;
      s.px += Math.random() < 0.5 ? -7 : 7;
      s.poopHits++;
      sfx.squish();
      return hurt(s, C.DIRT_POOP, C.INV_POOP);
    }

    if (!p.grazed) {
      p.grazed = true;
      s.grazeCount++;
      s.grazeGauge = Math.min(
        C.GRAZE_MAX,
        s.grazeGauge + (p.big ? C.GRAZE_GAIN_BIG : C.GRAZE_GAIN_SMALL),
      );
      s.score += (p.big ? C.GRAZE_SCORE_BIG : C.GRAZE_SCORE_SMALL) * s.mult;
      sfx.graze(p.big);
    }
  }
  return false;
}

function resolveDeer(s: State): boolean {
  if (s.inv > 0) return false;
  const hx = s.px + C.PLAYER.hitX;
  const hy = s.py + C.PLAYER.hitY;

  for (let i = s.deer.length - 1; i >= 0; i--) {
    const d = s.deer[i];
    if (!overlap(
      hx, hy, C.PLAYER.hitW, C.PLAYER.hitH,
      d.x + C.DEER_BOX.hitX, d.y + C.DEER_BOX.hitY, C.DEER_BOX.hitW, C.DEER_BOX.hitH,
    )) continue;
    s.deer.splice(i, 1);
    s.stun = C.STUN_DEER;
    s.knockback = C.KNOCKBACK_DEER;
    s.deerHits++;
    sfx.bump();
    return hurt(s, C.DIRT_DEER, C.INV_DEER);
  }
  return false;
}

export function step(s: State, input: InputState, dt: number): void {
  if (s.phase !== "playing") return;

  const vpx = C.scrollSpeed(s.dist) * C.TILE;
  const metres = (vpx * dt) / C.TILE;
  s.progress += metres;
  // 難易度はエンドレスもステージも同じ式。ステージは開始地点をずらすだけ。
  s.dist = s.mode === "stage" ? C.stageDifficulty(s.stage) + s.progress : s.progress;
  s.scrollPx += vpx * dt;
  s.walkAcc += vpx * dt;

  // レベル。数字と一言で「上がったこと」を必ず見せる
  s.bannerT -= dt;
  const lv = C.levelOf(s.dist);
  if (lv !== s.level) {
    s.level = lv;
    if (s.mode === "endless") {
      const note = C.levelNote(lv);
      banner(s, note ? `レベル ${lv} ／ ${note}` : `レベル ${lv}`, note ? 2.4 : 1.5);
      sfx.levelUp();
    }
  }

  // 鹿せんべい売り場
  if (C.levelOf(s.dist) >= C.UNLOCK.stall && !C.inRest(s.dist)) {
    s.stallTimer -= dt;
    if (s.stallTimer <= 0) {
      spawnStall(s);
      s.stallTimer = C.STALL_INTERVAL_MIN + Math.random() * (C.STALL_INTERVAL_MAX - C.STALL_INTERVAL_MIN);
    }
  }

  // 休憩区間に入った合図（緩急が無いとエンドレスは飽きる）
  if (s.mode === "endless") {
    const restIndex = Math.floor(s.dist / C.REST_EVERY_M);
    if (C.inRest(s.dist) && restIndex !== s.restShown) {
      s.restShown = restIndex;
      sfx.rest();
    }
  }

  s.rowAcc += vpx * dt;
  while (s.rowAcc >= C.TILE) {
    s.rowAcc -= C.TILE;
    spawnRow(s);
  }

  movePlayer(s, input, dt);
  resolveTrees(s);

  s.inv -= dt;
  s.stun -= dt;
  s.slip -= dt;
  s.grazeGauge *= Math.exp(-C.GRAZE_DECAY * dt);
  s.mult = 1 + s.grazeGauge;

  moveEntities(s, vpx, dt);

  // 予兆が切れたら実体を出す
  for (let i = s.warns.length - 1; i >= 0; i--) {
    s.warns[i].t -= dt;
    if (s.warns[i].t > 0) continue;
    hatchDeer(s, s.warns[i]);
    s.warns.splice(i, 1);
  }

  s.deerTimer -= dt;
  if (s.deerTimer <= 0) {
    scheduleDeer(s);
    const w = s.warns[s.warns.length - 1];
    if (w) (w.kind === "stag" ? sfx.paw : sfx.snort)();
  }

  if (s.touristsOn && !C.inRest(s.dist)) {
    s.touristTimer -= dt;
    if (s.touristTimer <= 0) {
      s.tourists.push({ x: C.PATH.x0 + 4 + Math.random() * (C.PATH_W - 20), y: C.ENTRY_Y });
      s.touristTimer = 2.2 + Math.random() * 2.5;
    }
  }

  resolveStalls(s);
  resolveFeed(s); // ぶつかる前に渡せるよう、衝突判定より先に見る
  if (resolvePoops(s)) return;
  if (resolveDeer(s)) return;

  // 観光客は汚さない。ぶつかると押し戻されるだけ。
  const hx = s.px + C.PLAYER.hitX;
  const hy = s.py + C.PLAYER.hitY;
  for (const t of s.tourists) {
    if (overlap(hx, hy, C.PLAYER.hitW, C.PLAYER.hitH, t.x + 1, t.y + 9, 10, 9)) {
      s.py = Math.min(C.PLAY_Y.bottom, s.py + 55 * dt);
    }
  }

  s.score += metres * C.SCORE_PER_M * s.mult;

  if (s.mode === "stage" && s.progress >= s.goal) {
    s.progress = s.goal;
    s.phase = "clear";
    sfx.clear();
  }
}
