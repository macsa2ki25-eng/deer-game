/** 1フレームぶんの更新。描画はここではやらない。 */

import * as C from "./config";
import type { State, Deer } from "./state";
import { spawnRow, scheduleDeer, hatchDeer, dropFromDeer, spawnStall, spawnFeedingScene } from "./level";
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

/** 画面に一言出す。 */
function banner(s: State, text: string, seconds: number): void {
  s.banner = text;
  s.bannerT = seconds;
}

// ---------------------------------------------------------------- プレイヤー

function movePlayer(s: State, input: InputState, dt: number): void {
  // 囲まれているあいだは、鹿に押されてほとんど動けない。怖さの本体はここ。
  const slowed = (s.slip > 0 ? C.SLIP_FACTOR : 1) * (s.stun > 0 ? 0 : 1)
    * (s.encircled ? C.ENCIRCLE_SLOW : 1);
  const maxStep = C.LATERAL * slowed * dt;

  const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const ky = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  if (kx || ky) {
    const len = Math.hypot(kx, ky);
    s.px += (kx / len) * maxStep;
    s.py += (ky / len) * maxStep;
  } else if (input.tx !== null && input.ty !== null && s.stun <= 0) {
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

/** 木は通り抜けられない。重なっていたら、いちばん浅い向きへ押し出す。 */
function resolveTrees(s: State): void {
  for (const t of s.trees) {
    const hx = s.px + C.PLAYER.hitX;
    const hy = s.py + C.PLAYER.hitY;
    const bx = t.x + C.TREE_BOX.hitX;
    const by = t.y + C.TREE_BOX.hitY;
    if (!overlap(hx, hy, C.PLAYER.hitW, C.PLAYER.hitH, bx, by, C.TREE_BOX.hitW, C.TREE_BOX.hitH)) continue;

    const outLeft = bx - (hx + C.PLAYER.hitW);
    const outRight = bx + C.TREE_BOX.hitW - hx;
    const outUp = by - (hy + C.PLAYER.hitH);
    const outDown = by + C.TREE_BOX.hitH - hy;
    const dx = Math.abs(outLeft) < Math.abs(outRight) ? outLeft : outRight;
    const dy = Math.abs(outUp) < Math.abs(outDown) ? outUp : outDown;
    if (Math.abs(dx) <= Math.abs(dy)) s.px += dx;
    else s.py += dy;
  }
  s.px = Math.max(C.PATH.x0, Math.min(C.PATH.x1 - C.PLAYER.w, s.px));
  s.py = Math.max(C.PLAY_Y.top, Math.min(C.PLAY_Y.bottom, s.py));
}

// ---------------------------------------------------------------- 鹿

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
    if (d.squat <= 0) d.sp = C.deerSpeed(s.dist) * C.TILE;
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
 * 鹿せんべい。ボタンは無い。**接触がそのまま給餌**。
 *
 *   持っている → 鹿にぶつかっても汚れず、1枚渡して鹿は去る（得点）
 *   つまり持っているあいだだけ、避けゲーが「当てにいくゲーム」に反転する。
 *
 *   ただし群れ（ENCIRCLE_AT 頭以上の塊）に踏み込むと取り囲まれる。
 *   囲まれると、せんべいが尽きるまで解けない。
 *   一定間隔で1枚ずつ持っていかれるので、**拘束時間＝残り枚数**。
 *   抱えたまま群れに突っ込むほど長く動けない。
 *
 * 「囲まれてただ待つ」にならないよう、拘束の長さは自分で決められるようにしてある。
 * 単独の鹿にわざとぶつけて枚数を減らしてから進む、という手が打てる。
 */
function updateEncircle(s: State, dt: number): void {
  s.grace = Math.max(0, s.grace - dt);
  const cx = s.px + C.PLAYER.w / 2;
  const cy = s.py + C.PLAYER.h / 2;

  const near = (d: Deer, r: number) => {
    const dx = d.x + C.DEER_BOX.w / 2 - cx;
    const dy = d.y + C.DEER_BOX.h / 2 - cy;
    return dx * dx + dy * dy < r * r;
  };
  const canJoin = (d: Deer) => d.kind !== "stag" && d.kind !== "sleeper";

  // 捕まる瞬間
  if (!s.encircled && s.senbei > 0 && s.grace <= 0) {
    let n = 0;
    for (const d of s.deer) if (canJoin(d) && near(d, C.ENCIRCLE_RADIUS)) n++;
    if (n >= C.ENCIRCLE_AT) {
      s.encircled = true;
      s.drainT = C.ENCIRCLE_DRAIN;
      banner(s, "かこまれた！", 1.4);
      sfx.snort();
      // 近くにいた鹿を取り込む。さらに気づいた鹿も後から寄ってくる
      for (const d of s.deer) {
        if (canJoin(d) && near(d, C.NOTICE_RADIUS)) {
          d.swarm = true;
          d.host = null;
          d.sp = 0;
        }
      }
    }
  }

  if (!s.encircled) {
    s.swarmCount = 0;
    return;
  }

  // 囲まれているあいだ：まわりを回り、順番に1枚ずつ持っていく
  let count = 0;
  for (const d of s.deer) {
    if (!canJoin(d)) continue;
    if (!d.swarm && near(d, C.NOTICE_RADIUS)) {
      d.swarm = true;
      d.host = null;
      d.sp = 0;
    }
    if (!d.swarm) continue;
    count++;
    d.orbit += dt * 1.4;
    const tx = cx + Math.cos(d.orbit) * C.ORBIT_RADIUS - C.DEER_BOX.w / 2;
    const ty = cy + Math.sin(d.orbit) * C.ORBIT_RADIUS - C.DEER_BOX.h / 2;
    const vx = tx - d.x;
    const vy = ty - d.y;
    const len = Math.hypot(vx, vy) || 1;
    const step = Math.min(len, C.SWARM_SPEED * dt);
    d.x += (vx / len) * step;
    d.y += (vy / len) * step;
  }
  s.swarmCount = count;

  s.drainT -= dt;
  if (s.drainT <= 0) {
    s.drainT = C.ENCIRCLE_DRAIN;
    takeSenbei(s, 0.5); // 囲まれて渡すぶんは点が安い。自分から当てにいくほうが得
  }

  if (s.senbei <= 0) release(s);
}

/** 1枚渡す。valueRatio で点の重みを変える。 */
function takeSenbei(s: State, valueRatio: number): void {
  if (s.senbei <= 0) return;
  s.senbei--;
  s.fed++;
  s.feedChain = Math.min(C.FEED_CHAIN_MAX, s.feedChain + C.FEED_CHAIN_STEP);
  s.feedChainT = C.FEED_CHAIN_WINDOW;
  s.score += C.FEED_SCORE * s.mult * s.feedChain * valueRatio;
  s.grazeGauge = Math.min(C.GRAZE_MAX, s.grazeGauge + C.FEED_GAUGE * valueRatio);
  sfx.feed();
}

/** 囲みが解ける。鹿は興味を失って散る。 */
function release(s: State): void {
  s.encircled = false;
  s.grace = C.ENCIRCLE_GRACE;
  s.swarmCount = 0;
  for (const d of s.deer) {
    if (!d.swarm) continue;
    d.swarm = false;
    d.sp = C.deerSpeed(s.dist) * C.TILE;
  }
  banner(s, "せんべいが なくなった", 1.3);
}

function moveEntities(s: State, vpx: number, dt: number): void {
  for (let i = s.poops.length - 1; i >= 0; i--) {
    s.poops[i].y += vpx * dt;
    if (s.poops[i].y > C.VIEW.h + 8) s.poops.splice(i, 1);
  }
  for (let i = s.pebbles.length - 1; i >= 0; i--) {
    s.pebbles[i].y += vpx * dt;
    if (s.pebbles[i].y > C.VIEW.h + 6) s.pebbles.splice(i, 1);
  }
  for (let i = s.trees.length - 1; i >= 0; i--) {
    s.trees[i].y += vpx * dt;
    if (s.trees[i].y > C.VIEW.h + 8) s.trees.splice(i, 1);
  }
  for (let i = s.stalls.length - 1; i >= 0; i--) {
    s.stalls[i].y += vpx * dt;
    if (s.stalls[i].y > C.VIEW.h + 8) s.stalls.splice(i, 1);
  }
  for (let i = s.baits.length - 1; i >= 0; i--) {
    s.baits[i].y += vpx * dt;
    s.baits[i].life -= dt;
    if (s.baits[i].y > C.VIEW.h + 8) s.baits.splice(i, 1);
  }

  for (let i = s.tourists.length - 1; i >= 0; i--) {
    const t = s.tourists[i];
    // 餌やり中の観光客は立ち止まっているので、背景と同じ速さで下がる
    t.y += vpx * (t.feeding ? 1 : 0.42) * dt;
    if (!t.feeding) t.x += Math.sin(t.y * 0.03) * 6 * dt;
    if (t.y > C.VIEW.h + 24) s.tourists.splice(i, 1);
  }

  for (let i = s.deer.length - 1; i >= 0; i--) {
    const d = s.deer[i];
    if (d.swarm) continue; // 群れは updateSwarm が動かす

    if (d.kind === "pooper") updatePooper(s, d, dt);

    if (d.kind === "scene" && d.host) {
      // 観光客のまわりを回りながら、一緒に流れてくる
      d.orbit += dt * 1.1;
      d.x = d.host.x + Math.cos(d.orbit) * C.SCENE_RADIUS - 2;
      d.y = d.host.y + Math.sin(d.orbit) * C.SCENE_RADIUS * 0.7;
      if (!s.tourists.includes(d.host)) s.deer.splice(i, 1);
      continue;
    }

    d.y += (vpx + d.sp) * dt;
    d.x += d.vx * dt;

    if (d.kind === "homing") {
      const target = s.px - (C.DEER_BOX.w - C.PLAYER.w) / 2;
      d.x += Math.max(-30 * dt, Math.min(30 * dt, (target - d.x) * 1.6 * dt));
    }
    if (d.y > C.VIEW.h + 24 || d.x < -40 || d.x > C.VIEW.w + 40) s.deer.splice(i, 1);
  }
}

// ---------------------------------------------------------------- 被弾

function hurt(s: State, amount: number, inv: number): boolean {
  s.dirt += amount;
  s.inv = inv;
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

/** 鹿との衝突。群れは押してくるだけなので当たらない。 */
function resolveDeer(s: State): boolean {
  if (s.inv > 0) return false;
  const hx = s.px + C.PLAYER.hitX;
  const hy = s.py + C.PLAYER.hitY;

  for (let i = s.deer.length - 1; i >= 0; i--) {
    const d = s.deer[i];
    if (d.swarm) continue;
    if (!overlap(
      hx, hy, C.PLAYER.hitW, C.PLAYER.hitH,
      d.x + C.DEER_BOX.hitX, d.y + C.DEER_BOX.hitY, C.DEER_BOX.hitW, C.DEER_BOX.hitH,
    )) continue;

    // せんべいを持っていれば、ぶつかった鹿に1枚渡して事なきを得る。
    // 牡鹿だけは餌に興味がないので、これが効かない。
    if (s.senbei > 0 && d.kind !== "stag") {
      if (d.kind !== "sleeper" && d.kind !== "scene") s.deer.splice(i, 1);
      takeSenbei(s, 1);
      s.inv = 0.25; // 同じ鹿に連続で渡さないための最小間隔
      if (s.senbei <= 0 && s.encircled) release(s);
      return false;
    }

    const dirt = d.kind === "stag" ? C.STAG_DIRT : C.DIRT_DEER;
    if (d.kind !== "sleeper" && d.kind !== "scene") s.deer.splice(i, 1);
    s.stun = C.STUN_DEER;
    s.knockback = C.KNOCKBACK_DEER;
    s.deerHits++;
    sfx.bump();
    return hurt(s, dirt, C.INV_DEER);
  }
  return false;
}

/** 売り場の前を通ったら、せんべいを受け取る。判定は絵より広い。 */
function resolveStalls(s: State): void {
  const cx = s.px + C.PLAYER.w / 2;
  const cy = s.py + C.PLAYER.h / 2;
  for (const st of s.stalls) {
    if (st.taken) continue;
    const dx = Math.abs(st.x + C.STALL_BOX.w / 2 - cx);
    const dy = Math.abs(st.y + C.STALL_BOX.h / 2 - cy);
    if (dx > C.STALL_REACH_X || dy > C.STALL_REACH_Y) continue;
    st.taken = true;
    s.senbei = C.SENBEI_PER_STALL;
    sfx.pickup();
    banner(s, `せんべい ×${C.SENBEI_PER_STALL}　鹿にぶつかってOK`, 1.8);
  }
}

// ---------------------------------------------------------------- 本体

export function step(s: State, input: InputState, dt: number): void {
  if (s.phase !== "playing") return;

  const vpx = C.scrollSpeed(s.dist) * C.TILE;
  const metres = (vpx * dt) / C.TILE;
  s.progress += metres;
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

  if (C.levelOf(s.dist) >= C.UNLOCK.stall && !C.inRest(s.dist)) {
    s.stallTimer -= dt;
    if (s.stallTimer <= 0) {
      spawnStall(s);
      s.stallTimer = C.STALL_INTERVAL_MIN + Math.random() * (C.STALL_INTERVAL_MAX - C.STALL_INTERVAL_MIN);
    }
  }

  if (C.levelOf(s.dist) >= C.UNLOCK_FEEDING_SCENE && !C.inRest(s.dist)) {
    s.sceneTimer -= dt;
    if (s.sceneTimer <= 0) {
      spawnFeedingScene(s);
      s.sceneTimer = C.FEEDING_SCENE_INTERVAL_MIN
        + Math.random() * (C.FEEDING_SCENE_INTERVAL_MAX - C.FEEDING_SCENE_INTERVAL_MIN);
    }
  }

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
  updateEncircle(s, dt);
  s.feedChainT -= dt;
  if (s.feedChainT <= 0) s.feedChain = 1;

  // 予兆。牡鹿はためのあいだ狙いを合わせ続け、最後に固定する
  for (let i = s.warns.length - 1; i >= 0; i--) {
    const w = s.warns[i];
    w.t -= dt;
    if (w.kind === "stag" && w.t > 0.35) {
      const target = s.px - (C.DEER_BOX.w - C.PLAYER.w) / 2;
      w.x += Math.max(-120 * dt, Math.min(120 * dt, (target - w.x) * 3 * dt));
    }
    if (w.t > 0) continue;
    hatchDeer(s, w, s.px);
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
      s.tourists.push({ x: C.PATH.x0 + 4 + Math.random() * (C.PATH_W - 20), y: C.ENTRY_Y, feeding: false });
      s.touristTimer = 2.2 + Math.random() * 2.5;
    }
  }

  resolveStalls(s);
  if (resolvePoops(s)) return;
  if (resolveDeer(s)) return;

  // 歩いている観光客は汚さない。ぶつかると押し戻されるだけ。
  const hx = s.px + C.PLAYER.hitX;
  const hy = s.py + C.PLAYER.hitY;
  for (const t of s.tourists) {
    if (t.feeding) continue;
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
