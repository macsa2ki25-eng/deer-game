/**
 * 1フレームぶんの更新。
 *
 * 遊びの芯はふたつ:
 *
 *   触っている → 下を見る。足元のフンが見える。触った側のレーンへ歩く。鹿は見えない
 *   離している → 前を見る。奥から来る鹿が見える。足元は見えない。レーンは動かない
 *
 * **当たり判定は「重なったか」ではなく「通り過ぎたか」で取る。**
 * しかも横は px ではなく**レーン番号**で見る。重なりの幅で取ると、
 * その幅のぶんだけ「あと数px」が生まれ、それはそのまま位置合わせの巧拙になる。
 * ここでやりたいのは逆で、通り過ぎる瞬間にどっちのレーンに居たか、だけで決まってほしい。
 */

import * as C from "./config";
import type { State, Deer, Poop } from "./state";
import { sfx } from "./audio";

/** いまの走る速さ[px/s]。 */
export function speed(s: State): number {
  return s.trip > 0 ? 0 : C.speed(s.t);
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
 * すれすれで動いたか。**早めに動いても普通に避けられる**ので、これは上乗せ。
 * 床は低いまま、天井だけ用意する。
 */
function nice(s: State): boolean {
  return s.t - Math.max(s.lastLook, s.lastMove) < C.NICE_WINDOW;
}

/** 1フレーム進める。操作は `s.down` と `s.lane` のふたつだけ。 */
export function step(s: State, dt: number): void {
  if (s.phase !== "playing") return;

  s.t += dt;
  s.hop = Math.max(0, s.hop - dt);

  // 視線が切り替わった瞬間を拾う。指から直接書かれるので、自分で見つける
  if (s.down !== s.wasDown) {
    s.wasDown = s.down;
    s.lastLook = s.t;
  }

  s.intro = Math.max(0, s.intro - dt);
  s.bannerT -= dt;

  if (s.trip > 0) {
    s.trip -= dt;
    return; // 転んでいるあいだは世界が止まる。立て直す間を作る
  }

  const v = speed(s);
  s.dist += v * dt;
  s.score += v * dt * C.SCORE_PER_PX;
  s.walkAcc += v * dt;

  // 見えている範囲の境目を目標へ寄せる
  const want = s.down ? C.SPLIT_DOWN : C.SPLIT_UP;
  s.split += (want - s.split) * Math.min(1, C.SPLIT_SPEED * dt);

  /**
   * 横の移動。**レーンへ向かって一定の速さで歩く。**
   * `lane` は指が決めた整数で、`lx` は見た目。
   * 当たり判定は `lane` しか見ないので、途中で判定がぶれることはない。
   */
  const step = dt / C.LANE_TIME;
  if (s.lx < s.lane) s.lx = Math.min(s.lane, s.lx + step);
  else if (s.lx > s.lane) s.lx = Math.max(s.lane, s.lx - step);

  // ---- 流す ----
  for (const p of s.poops) p.z -= v * dt;
  // **鹿は自分から歩いて向かってくる。**そのぶん速く着く
  for (const d of s.deer) d.z -= (v + C.DEER_SPEED) * dt;
  for (const b of s.senbeis) b.z -= v * dt;
  for (const g of s.scenery) g.z -= v * dt;

  // ---- 足元を通り過ぎた瞬間に決める ----
  for (const p of s.poops) {
    if (p.done || p.z > 0) continue;
    p.done = true;
    /**
     * **でかいフンは両レーンをふさぐ。よけられないので、とびこえる。**
     * とぶには助走が要るので、うつむいたままでは跳べない。
     * ここだけ、顔を上げていた人が越える。見るのは下、越えるのは上。
     */
    if (p.big) {
      if (!s.down) {
        s.dodges++;
        s.jumps++;
        s.hop = C.HOP_TIME;
        sfx.jump();
        if (nice(s)) {
          s.nices++;
          s.score += C.JUMP_SCORE + C.NICE_SCORE;
          banner(s, "ぎりぎり とんだ！", 0.7);
        } else {
          s.score += C.JUMP_SCORE;
          banner(s, "とびこえた！", 0.6);
        }
      } else {
        s.poopHits++;
        s.jumpMiss++;
        sfx.squish();
        hurt(s, "でかいのは とぶ", C.TRIP_POOP);
        return;
      }
      continue;
    }

    // 小さいフンは片方のレーンだけ。**下を向いていないと見えない**
    if (p.lane !== s.lane) {
      s.dodges++;
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
    if (d.done || d.z > 0) continue;
    d.done = true;
    if (d.lane !== s.lane) {
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
    if (b.taken || b.z > 0) continue;
    b.taken = true;
    if (b.lane !== s.lane) continue;
    s.score += C.SENBEI_SCORE;
    sfx.pickup();
    banner(s, "せんべい", 0.6);
  }

  // ---- 通り過ぎたものを捨てる ----
  s.poops = s.poops.filter((p) => p.z > -60);
  s.deer = s.deer.filter((d) => d.z > -60);
  s.senbeis = s.senbeis.filter((b) => b.z > -60);
  s.scenery = s.scenery.filter((g) => g.z > -60);

  spawn(s, dt, v);
}

/** それが足元に届くまでの時間[s]。ふたつの流れを引き離すのに使う。 */
function arrival(z: number, isDeer: boolean, v: number): number {
  return z / (isDeer ? v + C.DEER_SPEED : v);
}

/**
 * いま鹿を出すと、汚れた区間の真っ最中に着いてしまわないか。
 *
 * **汚れた区間のあいだは下を向いているので、鹿が来ても気づけない。**
 * そこへ着かせると避けようが無い。きれいな区間に着くよう仕向ける。
 * ただし完全には避けない——`clashChance` のぶんは、わざとそこへ着かせる。
 */
function landsOnDirt(s: State, v: number): boolean {
  const mine = arrival(C.DEER_Z, true, v);
  return s.poops.some((p) => !p.done && Math.abs(arrival(p.z, false, v) - mine) < C.SEPARATION);
}

function spawn(s: State, dt: number, vw: number): void {
  /**
   * ふたつの速さを使い分ける。混ぜると壊れる。
   *   vw = いま実際に流れている速さ。**置く位置**はこちら
   *   v  = 名目の速さ。**鹿がいつ着くか**の予測はこちら
   */
  const v = C.speed(s.t);
  const introSlack = s.intro > 0 ? 1.8 : 1;

  /**
   * **参道を1段ずつ置いていく。**
   * 汚れた区間のあいだは、毎段どちらかのレーンが汚れている。
   * そのあいだ指はずっと左右を選んでいて、顔は上げられない。
   */
  s.nextStepZ -= vw * dt;
  let guard = 0;
  while (s.nextStepZ <= C.GEN_Z && guard++ < 40) {
    if (s.runLeft <= 0) {
      s.runDirty = !s.runDirty;             // 汚れ → きれい → 汚れ …
      const r = s.runDirty ? C.dirtyRun(s.t) : C.cleanRun(s.t);
      const span = r.min + Math.floor(Math.random() * (r.max - r.min + 1));
      s.runLeft = Math.max(1, Math.round(span * (s.runDirty ? 1 : introSlack)));

      /**
       * **でかいフンは汚れた区間の最後の段に置く。**
       * きれいな区間に置くと、そこではどうせ顔を上げているので
       * ただ通り過ぎるだけになる。危ないのは、下を向いて左右を選んでいる
       * 真っ最中に来ること。手前 BIG_GAP 段を空けて、顔を上げる隙にする。
       * 空いた段の並びが、そのまま「来るぞ」の合図になる。
       */
      s.bigAt = -1;
      if (s.runDirty && s.t > 4 && Math.random() < C.bigChance(s.t)) {
        s.runLeft = Math.max(s.runLeft, C.BIG_RUN_MIN);
        s.bigAt = s.runLeft - 1;
      }
      s.runLen = s.runLeft;
    }

    if (s.runDirty) {
      const idx = s.runLen - s.runLeft;     // この区間の何段目か
      if (idx === s.bigAt) {
        s.poops.push({ z: s.nextStepZ, lane: -1, big: true, done: false });
      } else if (s.bigAt < 0 || idx < s.bigAt - C.BIG_GAP) {
        /**
         * **道を1本引いて、それ以外を塞ぐ。**
         *
         * 塞ぐレーンを毎段でたらめに選ぶと、2段つづけて反対の端だけが空く、
         * のような**間に合いようのない並び**が出る。道は段ごとに ±1 しか
         * 動かさないと決めておけば、隣へ1回動くだけで必ず通れる。
         *
         * 難しさは「道の見つけにくさ」で作る——2本塞げば道は1本だけになる。
         */
        const drift = Math.random();
        const move = drift < 0.28 ? -1 : drift < 0.56 ? 1 : 0;
        s.pathLane = Math.min(C.LANES - 1, Math.max(0, s.pathLane + move));

        const others = [];
        for (let i = 0; i < C.LANES; i++) if (i !== s.pathLane) others.push(i);
        // 2本塞ぐなら道は1本だけ。1本なら、どちらへ逃げてもいい
        const blocked = Math.random() < C.blockTwo(s.t)
          ? others
          : [others[Math.floor(Math.random() * others.length)]];
        for (const lane of blocked) {
          s.poops.push({ z: s.nextStepZ, lane, big: false, done: false });
        }
      }
      // bigAt の手前 BIG_GAP 段は空ける。ここが顔を上げる隙
    }
    s.runLeft--;
    s.nextStepZ += C.STEP_Z;
  }

  // ---- 鹿 ----
  s.deerTimer -= dt;
  s.senbeiTimer -= dt;
  s.sceneryTimer -= dt;

  if (s.deerTimer <= 0) {
    const deliberate = Math.random() < C.clashChance(s.t);
    if (!deliberate && landsOnDirt(s, v) && s.deerBlocked < 26) {
      s.deerTimer = 0.12;
      s.deerBlocked++;
    } else {
      if (deliberate) s.clashSpawns++;
      s.deerBlocked = 0;
      /**
       * **2頭ならんで来ることがある。**3レーンで1頭だけだと 2/3 が空いて
       * しまい、顔を上げずに賭けても勝ててしまう。2頭なら、
       * どこが空いているかを知らないかぎり通れない。
       */
      const lanes = [0, 1, 2];
      for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
      }
      const herd = Math.random() < C.deerPair(s.t) ? 2 : 1;
      for (let i = 0; i < herd; i++) {
        s.deer.push({ z: C.DEER_Z, lane: lanes[i], done: false });
      }
      s.deerTimer = C.deerInterval(s.t) * (0.75 + Math.random() * 0.5) * introSlack;
    }
  }

  if (s.senbeiTimer <= 0) {
    s.senbeis.push({ z: C.POOP_SEE, lane: s.pathLane, taken: false });
    s.senbeiTimer = C.SENBEI_INTERVAL_MIN
      + Math.random() * (C.SENBEI_INTERVAL_MAX - C.SENBEI_INTERVAL_MIN);
  }

  if (s.sceneryTimer <= 0) {
    s.scenery.push({
      z: C.DEER_Z,
      side: Math.random() < 0.5 ? -1 : 1,
      kind: Math.random() < 0.25 ? "lantern" : "tree",
    });
    s.sceneryTimer = 0.5 + Math.random() * 0.7;
  }
}

export type { Deer, Poop };
