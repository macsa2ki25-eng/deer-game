/**
 * 1フレームぶんの更新。
 *
 * 遊びの芯はここの `s.down` 1ビットだけ:
 *
 *   下を見ている → 足元のフンを跨ぐ。鹿は見えないのでぶつかる。足が遅い
 *   前を見ている → 鹿をよける。足元は踏む。速い
 *
 * **当たり判定は「重なったか」ではなく「通り過ぎたか」で取る。**
 * 重なりで取ると、判定の幅の分だけ「あと数px」が生まれ、
 * それはそのまま位置合わせの巧拙になってしまう。ここでやりたいのは逆で、
 * 通り過ぎる瞬間にどちらを見ていたか、だけで決まってほしい。
 */

import * as C from "./config";
import type { State, Deer, Poop } from "./state";
import { sfx } from "./audio";

/** いまの走る速さ[px/s]。 */
export function speed(s: State): number {
  if (s.trip > 0) return 0;
  const v = C.speedAhead(s.t);
  return s.down ? v * C.SLOW_FACTOR : v;
}

function banner(s: State, text: string, secs: number): void {
  s.banner = text;
  s.bannerT = secs;
}

/**
 * 汚れが増える。3つでおしまい。
 * **教えているあいだ（intro）は汚れない。**転ぶ絵は出す——
 * 何が起きたのかを見せないと、教えたことにならないので。
 */
function hurt(s: State, why: string, trip: number): void {
  s.trip = trip;
  if (s.intro > 0) {
    banner(s, why + "（いまは セーフ）", 1.1);
    return;
  }
  s.dirt++;
  banner(s, why, 0.9);
  if (s.dirt >= C.DIRT_MAX) {
    s.dirt = C.DIRT_MAX;
    s.phase = "over";
    s.best = Math.max(s.best, Math.floor(s.score));
    sfx.over();
  }
}

/**
 * すれすれで切り替えたか。
 * **早めに切り替えても普通に避けられる**ので、これは上乗せでしかない。
 * 床は低いまま、天井だけ用意する。
 */
function nice(s: State): boolean {
  return s.t - s.lastLook < C.NICE_WINDOW;
}

export function step(s: State, dt: number): void {
  if (s.phase !== "playing") return;

  s.t += dt;
  s.intro = Math.max(0, s.intro - dt);
  s.bannerT -= dt;
  s.stepping = Math.max(0, s.stepping - dt);

  if (s.trip > 0) {
    s.trip -= dt;
    return; // 転んでいるあいだは世界が止まる。立て直す間を作る
  }

  const v = speed(s);
  s.dist += v * dt;
  s.score += v * dt * C.SCORE_PER_PX;
  s.walkAcc += v * dt;

  // 仕切りを目標へ寄せる
  const want = s.down ? C.SPLIT_DOWN : C.SPLIT_AHEAD;
  s.split += (want - s.split) * Math.min(1, C.SPLIT_SPEED * dt);

  // ---- 流す ----
  for (const p of s.poops) p.x -= v * dt;
  // **鹿は遠くにいるので、視差でゆっくり流れる。**
  // 足元と同じ速さで迫ってくると、顔を上げて確かめる暇がそもそも無い。
  for (const d of s.deer) d.x -= v * dt * C.AHEAD_PARALLAX;
  for (const b of s.senbeis) b.x -= v * dt * C.AHEAD_PARALLAX;
  // 奥のものはゆっくり流れる（視差）。手前の木ほど速い。
  for (const g of s.scenery) g.x -= v * dt * (g.kind === "treeFar" ? 0.22 : 0.5);

  // ---- 通り過ぎた瞬間に決める ----
  // **判定は「まんなかが自分を通り過ぎた瞬間」。**
  // 最初は絵の後ろ端で見ていたが、鹿は26px幅もあるので、
  // 判定が絵の左端まで来るころには**もう画面から出かかっていた**。
  // その間ずっと「まだ決着していない鹿」が居ることになり、
  // 上手く見ていても7秒で終わっていた。通り過ぎたと見えた時が、決着の時。
  for (const p of s.poops) {
    if (p.done || p.x + C.POOP_SIDE.w / 2 > C.KID_X) continue;
    p.done = true;
    if (s.down) {
      s.dodges++;
      s.stepping = 0.22;
      sfx.step();
      if (nice(s)) {
        s.nices++;
        s.score += C.NICE_SCORE;
        banner(s, "すれすれ！", 0.6);
      }
    } else {
      s.poopHits++;
      sfx.squish();
      hurt(s, "ふんだ", C.TRIP_POOP);
      return;
    }
  }

  for (const d of s.deer) {
    if (d.done || d.x + C.DEER_SIDE.w / 2 > C.KID_X) continue;
    d.done = true;
    if (!s.down) {
      s.dodges++;
      sfx.woosh();
      if (nice(s)) {
        s.nices++;
        s.score += C.NICE_SCORE;
        banner(s, "すれすれ！", 0.6);
      }
    } else {
      s.deerHits++;
      sfx.bump();
      hurt(s, "しかに ぶつかった", C.TRIP_DEER);
      return;
    }
  }

  for (const b of s.senbeis) {
    if (b.taken || b.x > C.KID_X + C.HIT_HALF) continue;
    if (b.x + C.SENBEI.w < C.KID_X - C.HIT_HALF) { b.taken = true; continue; }
    b.taken = true;
    s.score += C.SENBEI_SCORE;
    sfx.pickup();
    banner(s, "せんべい", 0.6);
  }

  // ---- 画面から出たものを捨てる ----
  s.poops = s.poops.filter((p) => p.x > -20);
  s.deer = s.deer.filter((d) => d.x > -40);
  s.senbeis = s.senbeis.filter((b) => b.x > -20);
  s.scenery = s.scenery.filter((g) => g.x > -70);

  spawn(s, dt);
}

/**
 * 出す。**右端から出して、届くまでの時間が反応時間を下回らないようにする。**
 * 間隔だけを詰めていくので、速さと公平さが喧嘩しない。
 */
/**
 * それが足元に届くまでの時間[s]。鹿は歩いて向かってくるぶん速く着く。
 * ふたつの流れを引き離すのに使う。
 */
function arrival(x: number, isDeer: boolean, v: number): number {
  return (x - C.KID_X) / (v * (isDeer ? C.AHEAD_PARALLAX : 1));
}

/**
 * いま鹿を出すと、汚れた区間の真っ最中に着いてしまわないか。
 *
 * **汚れた区間のあいだは下を向いているので、鹿が来ても気づけない。**
 * そこへ着かせると避けようが無い。きれいな区間に着くよう仕向ける。
 * ただし完全には避けない——`clashChance` のぶんは、わざとそこへ着かせる。
 */
function landsOnDirt(s: State, v: number): boolean {
  const mine = arrival(C.VIEW.w + 6, true, v);
  return s.poops.some((p) => !p.done && Math.abs(arrival(p.x, false, v) - mine) < C.SEPARATION);
}

function spawn(s: State, dt: number): void {
  const v = C.speedAhead(s.t);
  const introSlack = s.intro > 0 ? 1.9 : 1;

  /**
   * **石をひとマスずつ置いていく。**
   *
   * フンを1粒ずつタイマーで出すのをやめた。それだと下を向くのが一瞬で済み、
   * **「集中する」という状態が生まれない**。いまは石畳のマス目ごとに
   * 汚れているかどうかが決まっていて、汚れは**何マスか続く**。
   * 続いているあいだ、ずっと下を見ていることになる。
   * きれいな区間が、顔を上げる隙になる。
   */
  s.nextStoneAt -= v * dt;
  let guard = 0;
  while (s.nextStoneAt <= C.VIEW.w && guard++ < 40) {
    if (s.runLeft <= 0) {
      s.runDirty = !s.runDirty;             // 汚れ → きれい → 汚れ …
      const r = s.runDirty ? C.dirtyRun(s.t) : C.cleanRun(s.t);
      const span = r.min + Math.floor(Math.random() * (r.max - r.min + 1));
      // 教えているあいだは、きれいな区間を長めにして間を空ける
      s.runLeft = Math.max(1, Math.round(span * (s.runDirty ? 1 : introSlack)));
    }
    if (s.runDirty) {
      s.poops.push({
        x: s.nextStoneAt + Math.round((Math.random() - 0.5) * 6),
        big: Math.random() < 0.22,
        done: false,
      });
    }
    s.runLeft--;
    s.nextStoneAt += C.STONE_W;
  }

  // ---- 鹿 ----
  s.deerTimer -= dt;
  s.senbeiTimer -= dt;
  s.sceneryTimer -= dt;

  if (s.deerTimer <= 0) {
    /**
     * 汚れた区間の真っ最中に着く鹿は、原則ずらす（気づきようが無いので）。
     * ただし `clashChance` のぶんは、**わざとそこへ着かせる**。
     * それがこのゲームの山場——集中しているところへ、急に来る。
     */
    const deliberate = Math.random() < C.clashChance(s.t);
    if (!deliberate && landsOnDirt(s, v) && s.deerBlocked < 10) {
      s.deerTimer = 0.12;
      s.deerBlocked++;
    } else {
      if (deliberate) s.clashSpawns++;
      s.deerBlocked = 0;
      s.deer.push({ x: C.VIEW.w + 6, frame: 0, done: false });
      s.deerTimer = Math.max(C.MIN_GAP, C.deerInterval(s.t) * (0.75 + Math.random() * 0.5))
        * introSlack;
    }
  }

  if (s.senbeiTimer <= 0) {
    s.senbeis.push({ x: C.VIEW.w + 4, taken: false });
    s.senbeiTimer = C.SENBEI_INTERVAL_MIN
      + Math.random() * (C.SENBEI_INTERVAL_MAX - C.SENBEI_INTERVAL_MIN);
  }

  if (s.sceneryTimer <= 0) {
    const r = Math.random();
    s.scenery.push({
      x: C.VIEW.w + 8,
      kind: r < 0.22 ? "lantern" : r < 0.58 ? "treeFar" : "tree",
    });
    s.sceneryTimer = 0.35 + Math.random() * 0.6;
  }
}

export type { Deer, Poop };
