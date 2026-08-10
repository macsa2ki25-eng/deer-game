/**
 * 地形の生成。
 *
 * 要点は「配置してから通れるか検査する」のではなく
 * 「先に通れる回廊を引いてから、その外側にだけ置く」こと。
 * これで生成のやり直しが起きず、抜けられない配置も原理的に作られない。
 *
 * ただしそれをそのままやると、回廊だけフンの無い綺麗な帯になって
 * 「正解の道」が絵で丸見えになる。
 * 対策は帯を隠すことではなく、同じ帯を何本も出すこと（見せかけの道＝わだち）。
 * 偽物は数行で行き止まるが、行き止まりは画面の上端に現れるので逃げる時間はある。
 */

import * as C from "./config";
import type { State, DeerKind, Poop, Warn, Deer, Tourist } from "./state";

/** フンを置いてはいけない帯。中心xと半幅。 */
type Lane = { x: number; half: number };

/** 行の基準となる出現 y。 */
const BASE_Y = C.ENTRY_Y + 12;

/**
 * 安全回廊を1行ぶん進める。
 * 1行でずれる量は corridorDrift() で頭打ちにしてあるので、
 * プレイヤーは横移動速度に余裕を残したまま追いつける。
 * 幅も揺らして、縁が一定にならないようにする。
 */
function advanceCorridor(s: State): void {
  const maxDrift = C.corridorDrift(s.dist);
  s.corridor += s.corridorDir * Math.random() * maxDrift;

  // 幅の揺らぎ。狭いほうへは急に、広いほうへはゆっくり動かす
  s.corridorHalf += (Math.random() - 0.5) * 2.4;
  s.corridorHalf = Math.max(C.CORRIDOR_HALF_MIN, Math.min(C.CORRIDOR_HALF_MAX, s.corridorHalf));

  const lo = C.PATH.x0 + s.corridorHalf + 4;
  const hi = C.PATH.x1 - s.corridorHalf - 4;
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

/** 本物の回廊だけ。木や寝ている鹿など、通れない物はこれを空ける。 */
function corridorOnly(s: State): Lane[] {
  return [{ x: s.corridor, half: s.corridorHalf }];
}

/** 本物＋見せかけ。フンはこのぜんぶを空ける。幅の揺らし方も同じ——幅で本物がバレないように。 */
function allLanes(s: State): Lane[] {
  const out: Lane[] = [{ x: s.corridor, half: s.corridorHalf }];
  for (const d of s.decoys) out.push({ x: d.x, half: d.half });
  return out;
}

/** 半幅を1行ぶん揺らす。本物にも偽物にも同じ関数を通す。 */
function wobbleHalf(half: number): number {
  return Math.max(
    C.CORRIDOR_HALF_MIN,
    Math.min(C.CORRIDOR_HALF_MAX, half + (Math.random() - 0.5) * 2.4),
  );
}

/**
 * その粒を置いても帯が塞がらないか。
 *
 * 粒は行の基準 y から dy だけずれた位置に落ちる。ずれているあいだにも帯は
 * 横に動いているので、ずれたぶんだけ余分に空けないと「1行ぶん古い帯」の
 * 位置に粒を置いてしまう。ここを忘れると回廊は塞がる（実際に塞がった）。
 */
function clearOfLanes(s: State, lanes: Lane[], x: number, w: number, dy: number): boolean {
  const slack = (Math.abs(dy) / C.TILE) * C.corridorDrift(s.dist);
  const c = x + w / 2;
  for (const L of lanes) {
    if (Math.abs(c - L.x) < L.half + w / 2 + slack) return false;
  }
  return true;
}

/**
 * 帯と帯のあいだに残っている場所から、中心を引く。
 * 「適当に置いて帯に当たったら捨てる」だと塊がごっそり欠けて
 * 参道がスカスカに見えるので、最初から置ける場所だけを選ぶ。
 * 広い隙間ほど選ばれやすくして、帯の外がまんべんなく汚れるようにする。
 */
function freeCentre(lanes: Lane[], margin: number): number | null {
  const lo = C.PATH.x0 + margin;
  const hi = C.PATH.x1 - margin;
  const blocked = lanes
    .map((L) => [L.x - L.half - margin, L.x + L.half + margin] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const bands: Array<[number, number]> = [];
  let cur = lo;
  for (const [a, b] of blocked) {
    if (a > cur) bands.push([cur, Math.min(a, hi)]);
    cur = Math.max(cur, b);
  }
  if (cur < hi) bands.push([cur, hi]);

  const ok = bands.filter(([a, b]) => b > a);
  if (!ok.length) return null;
  const total = ok.reduce((t, [a, b]) => t + (b - a), 0);
  let r = Math.random() * total;
  for (const [a, b] of ok) {
    if (r < b - a) return a + r;
    r -= b - a;
  }
  return ok[0][0];
}

/**
 * 塊の中心は帯のすぐ外から引く（余白2px）。
 * こうすると粒が帯の縁まで攻めてきて、縁がぎざぎざになる。
 * きっちり離すと、どの帯も両側が定規で引いたように揃ってしまう。
 */
const EDGE_MARGIN = 2;

function placeCluster(s: State, yOffset: number): void {
  const lanes = allLanes(s);
  const n = C.CLUSTER_MIN + Math.floor(Math.random() * (C.CLUSTER_MAX - C.CLUSTER_MIN + 1));
  // 半分は帯から離して置く。縁ばかりを狙うと、どの塊も帯に食われて半月型になり、
  // 参道全体が薄くなる。離して置いた塊が「濃いところ」を作る。
  const cx = freeCentre(lanes, Math.random() < 0.5 ? EDGE_MARGIN : C.CLUSTER_RX);
  if (cx === null) return;

  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const x = cx + Math.cos(a) * r * C.CLUSTER_RX;
    const dy = yOffset + Math.sin(a) * r * C.CLUSTER_RY;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.PELLET.w) continue;
    if (!clearOfLanes(s, lanes, x, C.PELLET.w, dy)) continue;
    s.poops.push(pellet(x, BASE_Y + dy, false));
  }
}

function placeScatter(s: State, yOffset: number): void {
  const lanes = allLanes(s);
  const n = C.SCATTER_MIN + Math.floor(Math.random() * (C.SCATTER_MAX - C.SCATTER_MIN + 1));
  const cx = freeCentre(lanes, EDGE_MARGIN);
  if (cx === null) return;
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * C.SCATTER_SPREAD;
    const dy = yOffset + (Math.random() - 0.5) * 2 * C.SCATTER_JITTER_Y;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.PELLET.w) continue;
    if (!clearOfLanes(s, lanes, x, C.PELLET.w, dy)) continue;
    s.poops.push(pellet(x, BASE_Y + dy, false));
  }
}

function placeBig(s: State, yOffset: number): void {
  const lanes = allLanes(s);
  const cx = freeCentre(lanes, C.BIG_PELLET.w / 2 + EDGE_MARGIN);
  if (cx === null) return;
  const x = cx - C.BIG_PELLET.w / 2;
  if (!clearOfLanes(s, lanes, x, C.BIG_PELLET.w, yOffset)) return;
  s.poops.push(pellet(x, BASE_Y + yOffset, true));
}

/**
 * 見せかけの道の行き止まり。塞がったと一目で分かるだけの量を敷く。
 * 呼ぶのは偽物を s.decoys から外したあと——外す前だと、その帯を守って
 * 1粒も置けない。
 */
function closeLane(s: State, x: number, laneHalf: number): void {
  const lanes = allLanes(s);
  const half = laneHalf + 4;
  for (let i = 0; i < C.LANE_CLOSE_PELLETS; i++) {
    const px = x - half + Math.random() * half * 2;
    const dy = (Math.random() - 0.5) * 10;
    if (px < C.PATH.x0 || px > C.PATH.x1 - C.PELLET.w) continue;
    if (!clearOfLanes(s, lanes, px, C.PELLET.w, dy)) continue;
    s.poops.push(pellet(px, BASE_Y + dy, false));
  }
}

/**
 * 見せかけの道を1行ぶん進める。寿命が尽きたもの、本物から離れすぎたものは塞ぐ。
 * 足りなければ新しく引く。置ける場所が無い行は、そのまま次の行に持ち越す。
 */
function advanceDecoys(s: State): void {
  const maxDrift = C.corridorDrift(s.dist);
  const lo = C.PATH.x0 + C.LANE_HALF_NOMINAL + 2;
  const hi = C.PATH.x1 - C.LANE_HALF_NOMINAL - 2;

  for (let i = s.decoys.length - 1; i >= 0; i--) {
    const d = s.decoys[i];
    d.x += d.dir * Math.random() * maxDrift;
    d.half = wobbleHalf(d.half);
    if (d.x < lo) {
      d.x = lo;
      d.dir = 1;
    } else if (d.x > hi) {
      d.x = hi;
      d.dir = -1;
    } else if (Math.random() < 0.12) {
      d.dir *= -1;
    }
    d.rows -= 1;
    if (d.rows > 0 && Math.abs(d.x - s.corridor) <= C.DECOY_REACH) continue;
    s.decoys.splice(i, 1);
    closeLane(s, d.x, d.half);
  }

  // 空きがあれば引き直す。本物からも他の偽物からも、帯1本ぶん離す。
  let tries = 14;
  while (s.decoys.length < C.DECOY_LANES && tries-- > 0) {
    const x = lo + Math.random() * (hi - lo);
    if (Math.abs(x - s.corridor) > C.DECOY_REACH) continue;
    const sep = C.LANE_HALF_NOMINAL * 2 + C.LANE_GAP;
    if (Math.abs(x - s.corridor) < sep) continue;
    if (s.decoys.some((d) => Math.abs(d.x - x) < sep)) continue;
    s.decoys.push({
      x,
      dir: Math.random() < 0.5 ? -1 : 1,
      half: wobbleHalf((C.CORRIDOR_HALF_MIN + C.CORRIDOR_HALF_MAX) / 2),
      rows: C.DECOY_LIFE_MIN + Math.floor(Math.random() * (C.DECOY_LIFE_MAX - C.DECOY_LIFE_MIN + 1)),
    });
  }
}

/** その範囲にかかっている見せかけの道を消す。木や寝ている鹿が塞いだとき用。 */
function dropDecoysNear(s: State, x0: number, x1: number): void {
  for (let i = s.decoys.length - 1; i >= 0; i--) {
    const d = s.decoys[i];
    if (d.x > x0 - d.half && d.x < x1 + d.half) s.decoys.splice(i, 1);
  }
}

/**
 * 小石。参道じゅうに撒く——回廊の中にも置く。
 * これが無いと回廊だけ綺麗に空いて、正解の道が絵で分かってしまう。
 * 当たり判定は無いので、公平さには影響しない。
 */
function placePebbles(s: State): void {
  const n = Math.floor(C.PEBBLE_RATE) + (Math.random() < C.PEBBLE_RATE % 1 ? 1 : 0);
  const lanes = allLanes(s);
  for (let i = 0; i < n; i++) {
    // 半分以上は帯の中に置く。フンが入れない場所こそ埋めないと帯が消えない。
    // 本物か偽物かは選ばない——小石の散り方から本物が読めては意味がない。
    const inLane = Math.random() < C.PEBBLE_IN_CORRIDOR;
    const L = lanes[Math.floor(Math.random() * lanes.length)];
    const x = inLane
      ? L.x - L.half + Math.random() * L.half * 2
      : C.PATH.x0 + Math.random() * (C.PATH_W - 3);
    s.pebbles.push({
      x: Math.max(C.PATH.x0, Math.min(C.PATH.x1 - 3, x)),
      y: BASE_Y + (Math.random() - 0.5) * 16,
      variant: Math.floor(Math.random() * 3),
    });
  }
}

/**
 * 木。通れないので、回廊は必ず空けて置く。
 * 背が18pxで1行を超えるため、縦のずれぶんの余裕も多めに取る。
 */
function placeTree(s: State): void {
  // 木は背が18pxあって1行を大きくまたぐ。その間に回廊も動くので、
  // 場所を選ぶ時点で「ずれぶんの余裕」まで含めて離しておかないと、
  // このあとの clearOfCorridor で必ず弾かれて一本も置けない（実際そうなっていた）。
  // またいでいる行数ぶん、回廊は横に動く。半分ではなく「高さぜんぶ」で見積もる。
  // 半分にしていたら、押し出しで回廊の外へ突き飛ばされて回廊が意味を失った。
  const dy = C.TREE_BOX.h;
  const slack = (dy / C.TILE) * C.corridorDrift(s.dist);
  const lanes = corridorOnly(s);
  const cx = freeCentre(lanes, C.TREE_BOX.w / 2 + slack + 2);
  if (cx === null) return;
  const x = cx - C.TREE_BOX.w / 2;
  if (!clearOfLanes(s, lanes, x, C.TREE_BOX.w, dy)) return;
  s.trees.push({ x, y: BASE_Y - C.TREE_BOX.h });
  // 見せかけの道の上に立ったなら、それはもう行き止まり。
  dropDecoysNear(s, x, x + C.TREE_BOX.w);
}

/**
 * 鹿せんべい売り場。回廊の上に置く。
 * 安全な線の上に置くことで「必ず取りに行ける」ようにし、
 * 危険は取ったあと（鹿が寄ってくる）に回す。
 */
export function spawnStall(s: State): void {
  s.stalls.push({
    x: Math.max(C.PATH.x0, Math.min(C.PATH.x1 - C.STALL_BOX.w, s.corridor - C.STALL_BOX.w / 2)),
    y: BASE_Y - C.STALL_BOX.h,
    taken: false,
  });
}

/** 道に寝そべって塞いでいる群れ。よけて通るしかない。 */
function placeSleepers(s: State): void {
  const n = C.sleeperSize(s.dist);
  const spread = 8 + n * 4;
  const slack = ((C.DEER_BOX.h + 20) / C.TILE) * C.corridorDrift(s.dist);
  const lanes = corridorOnly(s);
  const cx = freeCentre(lanes, spread / 2 + C.DEER_BOX.w / 2 + slack + 4);
  if (cx === null) return;
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * spread - C.DEER_BOX.w / 2;
    const jitter = (Math.random() - 0.5) * 16;
    const y = C.ENTRY_Y + jitter;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.DEER_BOX.w) continue;
    // clearOfLanes は「行の基準 y からのずれ」を要る。
    // ENTRY_Y は BASE_Y より12px上なので、そのぶんも足さないと見積もりが甘くなる。
    // さらに鹿は縦18pxあるので、体の高さも足しておく。
    if (!clearOfLanes(s, lanes, x, C.DEER_BOX.w, y - BASE_Y - C.DEER_BOX.h)) continue;
    s.deer.push(newDeer(x, y, "sleeper", 0, 0));
  }
  dropDecoysNear(s, cx - spread / 2, cx + spread / 2);
}

/** 1行(16px)ぶん。塊をいくつ置くかを距離から決める。 */
export function spawnRow(s: State): void {
  advanceCorridor(s);
  advanceDecoys(s);
  placePebbles(s);
  if (C.inRest(s.dist)) return;

  if (Math.random() < C.treeRate(s.dist)) placeTree(s);
  if (Math.random() < C.sleeperRate(s.dist)) placeSleepers(s);

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

/** 立ち止まった鹿が落とす1粒。回廊の中にも落ちる（見えているので公平）。 */
export function dropFromDeer(s: State, d: { x: number; y: number }): void {
  s.poops.push(
    pellet(
      d.x + C.DEER_BOX.w / 2 - C.PELLET.w / 2 + (Math.random() - 0.5) * 7,
      d.y + C.DEER_BOX.h - 4 + (Math.random() - 0.5) * 3,
      false,
    ),
  );
}

/** 鹿を1頭つくる。増えたフィールドをここ一箇所で埋める。 */
export function newDeer(x: number, y: number, kind: DeerKind, sp: number, vx: number): Deer {
  return {
    x, y, kind, sp, vx,
    squat: 0,
    dropIn: 0,
    dropsLeft: kind === "pooper" ? C.POOPER_PELLETS : 0,
    swarm: false,
    orbit: Math.random() * Math.PI * 2,
    lockX: x,
    host: null,
  };
}

/**
 * せんべいを持った観光客と、それに群がる鹿。まるごとひとつの障害物。
 * 実際の奈良でいちばんよく見る光景で、しかも近づけば自分にも寄ってくる。
 */
export function spawnFeedingScene(s: State): void {
  const n = C.sceneDeer(s.dist);
  // 回廊の上に出す。フンだらけの端に出しても、そもそも近寄らないので障害物にならない。
  const cx = Math.max(
    C.PATH.x0 + C.SCENE_RADIUS + 8,
    Math.min(C.PATH.x1 - C.SCENE_RADIUS - 8, s.corridor),
  );
  const host: Tourist = { x: cx - 6, y: C.ENTRY_Y - 6, feeding: true };
  s.tourists.push(host);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = newDeer(
      host.x + Math.cos(a) * C.SCENE_RADIUS,
      host.y + Math.sin(a) * C.SCENE_RADIUS,
      "scene", 0, 0,
    );
    d.orbit = a;
    d.host = host;
    s.deer.push(d);
  }
}

/** 次に出す鹿の種類を距離から抽選する。 */
function pickKind(dist: number): DeerKind {
  const r = Math.random();
  const stag = C.stagShare(dist);
  const homing = C.homingShare(dist);
  const pooper = C.pooperShare(dist);
  if (r < stag) return "stag";
  if (r < stag + homing) return "homing";
  if (r < stag + homing + pooper) return "pooper";
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

  if (C.levelOf(s.dist) >= C.UNLOCK.side && Math.random() < C.SIDE_SHARE) {
    const fromLeft = Math.random() < 0.5;
    s.warns.push({
      edge: fromLeft ? "left" : "right",
      kind: "side",
      t: C.TELEGRAPH,
      x: 0,
      y: C.PLAY_Y.top + Math.random() * (C.PLAY_Y.bottom - C.PLAY_Y.top),
      herd: 1,
    });
  } else {
    const kind = pickKind(s.dist);
    // 群れで歩いてくる。牡鹿だけは単独（縄張り争いの最中なので）
    const herd = kind !== "stag" && Math.random() < C.herdShare(s.dist) ? C.herdSize(s.dist) : 1;
    s.warns.push({
      edge: "top",
      kind,
      t: C.TELEGRAPH + (kind === "stag" ? C.STAG_WINDUP : 0),
      x: C.PATH.x0 + 2 + Math.random() * (C.PATH_W - C.DEER_BOX.w - 4),
      y: 0,
      herd,
    });
  }

  s.deerTimer = C.deerInterval(s.dist) * (0.75 + Math.random() * 0.5);
}

/** 予兆が切れたので実体を出す。群れならまとめて出す。 */
export function hatchDeer(s: State, w: Warn, playerX: number): void {
  const speed = C.deerSpeed(s.dist) * C.TILE;

  if (w.edge !== "top") {
    const dir = w.edge === "left" ? 1 : -1;
    s.deer.push(newDeer(
      dir > 0 ? -C.DEER_BOX.w : C.VIEW.w + 2, w.y, "side", 0, dir * speed * 0.9,
    ));
    return;
  }

  for (let i = 0; i < w.herd; i++) {
    // 群れは横にずれて、少し前後する
    const off = w.herd === 1 ? 0 : (i - (w.herd - 1) / 2) * (C.DEER_BOX.w + 3);
    const x = Math.max(C.PATH.x0, Math.min(C.PATH.x1 - C.DEER_BOX.w, w.x + off));
    const y = C.ENTRY_Y - Math.abs(off) * 0.35 - Math.random() * 6;
    const d = newDeer(x, y, w.kind, speed * (w.kind === "stag" ? C.STAG_SPEED : 1), 0);
    // 牡鹿はここで狙いを固定する。あとは直進なので「いま居る場所から退く」ゲームになる
    if (w.kind === "stag") d.lockX = playerX - (C.DEER_BOX.w - C.PLAYER.w) / 2;
    s.deer.push(d);
  }
}
