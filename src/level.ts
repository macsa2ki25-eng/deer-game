/**
 * 地形の生成。
 *
 * 要点は「配置してから通れるか検査する」のではなく
 * 「先に通れる回廊を引いてから、その外側にだけ置く」こと。
 * これで生成のやり直しが起きず、抜けられない配置も原理的に作られない。
 *
 * フンは1粒ずつばら撒くのではなく、実物と同じように塊で置く。
 * まとまって落ちている山、ばらけた数粒、たまに大きいの——の3種類。
 */

import * as C from "./config";
import type { State, DeerKind, Poop, Warn } from "./state";

/** 行の基準となる出現 y。 */
const BASE_Y = C.ENTRY_Y + 12;

/**
 * 安全回廊を1行ぶん進める。
 * 1行でずれる量は corridorDrift() で頭打ちにしてあるので、
 * プレイヤーは横移動速度に余裕を残したまま追いつける。
 */
function advanceCorridor(s: State): void {
  const maxDrift = C.corridorDrift(s.dist);
  s.corridor += s.corridorDir * Math.random() * maxDrift;

  const lo = C.PATH.x0 + C.CORRIDOR_HALF + 4;
  const hi = C.PATH.x1 - C.CORRIDOR_HALF - 4;
  if (s.corridor < lo) {
    s.corridor = lo;
    s.corridorDir = 1;
  } else if (s.corridor > hi) {
    s.corridor = hi;
    s.corridorDir = -1;
  } else if (Math.random() < 0.1) {
    s.corridorDir *= -1;
  }
}

function pellet(x: number, y: number, big: boolean): Poop {
  return { x, y, big, variant: Math.random() < 0.5 ? 0 : 1, grazed: false };
}

/**
 * その粒を置いても回廊が塞がらないか。
 *
 * 粒は行の基準 y から dy だけずれた位置に落ちる。ずれているあいだにも回廊は
 * 横に動いているので、ずれたぶんだけ余分に空けないと「1行ぶん古い回廊」の
 * 位置に粒を置いてしまう。ここを忘れると回廊は塞がる（実際に塞がった）。
 */
function clearOfCorridor(s: State, x: number, w: number, dy: number): boolean {
  const slack = (Math.abs(dy) / C.TILE) * C.corridorDrift(s.dist);
  return Math.abs(x + w / 2 - s.corridor) >= C.CORRIDOR_HALF + w / 2 + slack;
}

/**
 * 回廊の左右に残っている帯のどちらかから、中心を引く。
 * 「適当に置いて回廊に当たったら捨てる」だと塊がごっそり欠けて
 * 参道がスカスカに見えるので、最初から置ける場所だけを選ぶ。
 */
function freeCentre(s: State, halfWidth: number): number | null {
  const lo = C.PATH.x0 + halfWidth;
  const hi = C.PATH.x1 - halfWidth;
  const leftHi = s.corridor - C.CORRIDOR_HALF - halfWidth;
  const rightLo = s.corridor + C.CORRIDOR_HALF + halfWidth;

  const bands: Array<[number, number]> = [];
  if (leftHi > lo) bands.push([lo, leftHi]);
  if (rightLo < hi) bands.push([rightLo, hi]);
  if (bands.length === 0) return null;

  const [a, b] = bands[Math.floor(Math.random() * bands.length)];
  return a + Math.random() * (b - a);
}

function placeCluster(s: State, yOffset: number): void {
  const n = C.CLUSTER_MIN + Math.floor(Math.random() * (C.CLUSTER_MAX - C.CLUSTER_MIN + 1));
  const cx = freeCentre(s, C.CLUSTER_RX);
  if (cx === null) return;

  for (let i = 0; i < n; i++) {
    // 円内に寄せて落とす（sqrt で中心に密集させない）
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const x = cx + Math.cos(a) * r * C.CLUSTER_RX;
    const dy = yOffset + Math.sin(a) * r * C.CLUSTER_RY;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.PELLET.w) continue;
    if (!clearOfCorridor(s, x, C.PELLET.w, dy)) continue;
    s.poops.push(pellet(x, BASE_Y + dy, false));
  }
}

function placeScatter(s: State, yOffset: number): void {
  const n = C.SCATTER_MIN + Math.floor(Math.random() * (C.SCATTER_MAX - C.SCATTER_MIN + 1));
  const cx = freeCentre(s, C.SCATTER_SPREAD / 2);
  if (cx === null) return;
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * C.SCATTER_SPREAD;
    const dy = yOffset + (Math.random() - 0.5) * 2 * C.SCATTER_JITTER_Y;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.PELLET.w) continue;
    if (!clearOfCorridor(s, x, C.PELLET.w, dy)) continue;
    s.poops.push(pellet(x, BASE_Y + dy, false));
  }
}

function placeBig(s: State, yOffset: number): void {
  const cx = freeCentre(s, C.BIG_PELLET.w);
  if (cx === null) return;
  const x = cx - C.BIG_PELLET.w / 2;
  if (!clearOfCorridor(s, x, C.BIG_PELLET.w, yOffset)) return;
  s.poops.push(pellet(x, BASE_Y + yOffset, true));
}

/** 1行(16px)ぶん。塊をいくつ置くかを距離から決める。 */
export function spawnRow(s: State): void {
  advanceCorridor(s);
  if (C.inRest(s.dist)) return;

  const rate = C.poopRate(s.dist);
  const n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);

  for (let i = 0; i < n; i++) {
    // 同じ行に複数置くときは縦にずらす。真横に並ぶと生成物っぽく見える。
    const yOffset = -i * 5;
    const r = Math.random();
    if (r < C.PATTERN_WEIGHTS.scatter) placeScatter(s, yOffset);
    else if (r < C.PATTERN_WEIGHTS.scatter + C.PATTERN_WEIGHTS.cluster) placeCluster(s, yOffset);
    else placeBig(s, yOffset);
  }
}

/** 次に出す鹿の種類を距離から抽選する。 */
function pickKind(dist: number): DeerKind {
  const r = Math.random();
  const stag = C.stagShare(dist);
  if (r < stag) return "stag";
  if (r < stag + C.homingShare(dist)) return "homing";
  return "walk";
}

/**
 * 鹿の予兆を積む。実体はここでは作らず、TELEGRAPH 秒後に湧く。
 * 予兆なしで湧かせると後半は理不尽になるので、経路は必ずここを通す。
 */
export function scheduleDeer(s: State): void {
  if (C.inRest(s.dist)) {
    s.deerTimer = 0.4;
    return;
  }

  if (Math.random() < C.SIDE_SHARE) {
    const fromLeft = Math.random() < 0.5;
    s.warns.push({
      edge: fromLeft ? "left" : "right",
      kind: "side",
      t: C.TELEGRAPH,
      x: 0,
      y: C.PLAY_Y.top + Math.random() * (C.PLAY_Y.bottom - C.PLAY_Y.top),
    });
  } else {
    const kind = pickKind(s.dist);
    s.warns.push({
      edge: "top",
      kind,
      t: C.TELEGRAPH + (kind === "stag" ? C.STAG_WINDUP : 0),
      x: C.PATH.x0 + 2 + Math.random() * (C.PATH_W - C.DEER_BOX.w - 4),
      y: 0,
    });
  }

  s.deerTimer = C.deerInterval(s.dist) * (0.75 + Math.random() * 0.5);
}

/** 予兆が切れたので実体を出す。 */
export function hatchDeer(s: State, w: Warn): void {
  const speed = C.deerSpeed(s.dist) * C.TILE;

  if (w.edge === "top") {
    s.deer.push({
      x: w.x,
      y: C.ENTRY_Y,
      kind: w.kind,
      sp: speed * (w.kind === "stag" ? 2.1 : 1),
      vx: 0,
    });
    return;
  }

  const dir = w.edge === "left" ? 1 : -1;
  s.deer.push({
    x: dir > 0 ? -C.DEER_BOX.w : C.VIEW.w + 2,
    y: w.y,
    kind: "side",
    sp: 0,
    vx: dir * speed * 0.9,
  });
}
