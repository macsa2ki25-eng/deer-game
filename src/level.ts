/**
 * 地形の生成。
 *
 * 要点は「配置してから通れるか検査する」のではなく
 * 「先に通れる回廊を引いてから、その外側にだけ置く」こと。
 * これで生成のやり直しが起きず、抜けられない配置も原理的に作られない。
 *
 * ただしそれをそのままやると、回廊だけフンの無い綺麗な帯になって
 * 「正解の道」が絵で丸見えになる。そこを隠すのが小石と回廊幅の揺らぎ。
 */

import * as C from "./config";
import type { State, DeerKind, Poop, Warn, Deer, Tourist } from "./state";

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

/**
 * その粒を置いても回廊が塞がらないか。
 *
 * 粒は行の基準 y から dy だけずれた位置に落ちる。ずれているあいだにも回廊は
 * 横に動いているので、ずれたぶんだけ余分に空けないと「1行ぶん古い回廊」の
 * 位置に粒を置いてしまう。ここを忘れると回廊は塞がる（実際に塞がった）。
 */
function clearOfCorridor(s: State, x: number, w: number, dy: number): boolean {
  const slack = (Math.abs(dy) / C.TILE) * C.corridorDrift(s.dist);
  return Math.abs(x + w / 2 - s.corridor) >= s.corridorHalf + w / 2 + slack;
}

/**
 * 回廊の左右に残っている帯のどちらかから、中心を引く。
 * 「適当に置いて回廊に当たったら捨てる」だと塊がごっそり欠けて
 * 参道がスカスカに見えるので、最初から置ける場所だけを選ぶ。
 */
function freeCentre(s: State, halfWidth: number): number | null {
  const lo = C.PATH.x0 + halfWidth;
  const hi = C.PATH.x1 - halfWidth;
  const leftHi = s.corridor - s.corridorHalf - halfWidth;
  const rightLo = s.corridor + s.corridorHalf + halfWidth;

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

/**
 * 小石。参道じゅうに撒く——回廊の中にも置く。
 * これが無いと回廊だけ綺麗に空いて、正解の道が絵で分かってしまう。
 * 当たり判定は無いので、公平さには影響しない。
 */
function placePebbles(s: State): void {
  const n = Math.floor(C.PEBBLE_RATE) + (Math.random() < C.PEBBLE_RATE % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    // 半分以上は回廊の中に置く。フンが入れない場所こそ埋めないと帯が消えない。
    const inCorridor = Math.random() < C.PEBBLE_IN_CORRIDOR;
    const x = inCorridor
      ? s.corridor - s.corridorHalf + Math.random() * s.corridorHalf * 2
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
  const cx = freeCentre(s, C.TREE_BOX.w / 2 + slack + 2);
  if (cx === null) return;
  const x = cx - C.TREE_BOX.w / 2;
  if (!clearOfCorridor(s, x, C.TREE_BOX.w, dy)) return;
  s.trees.push({ x, y: BASE_Y - C.TREE_BOX.h });
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
  const cx = freeCentre(s, spread / 2 + C.DEER_BOX.w / 2 + slack + 4);
  if (cx === null) return;
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * spread - C.DEER_BOX.w / 2;
    const jitter = (Math.random() - 0.5) * 16;
    const y = C.ENTRY_Y + jitter;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.DEER_BOX.w) continue;
    // clearOfCorridor は「行の基準 y からのずれ」を要る。
    // ENTRY_Y は BASE_Y より12px上なので、そのぶんも足さないと見積もりが甘くなる。
    // さらに鹿は縦18pxあるので、体の高さも足しておく。
    if (!clearOfCorridor(s, x, C.DEER_BOX.w, y - BASE_Y - C.DEER_BOX.h)) continue;
    s.deer.push(newDeer(x, y, "sleeper", 0, 0));
  }
}

/** 1行(16px)ぶん。塊をいくつ置くかを距離から決める。 */
export function spawnRow(s: State): void {
  advanceCorridor(s);
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
  const cx = freeCentre(s, C.SCENE_RADIUS + C.DEER_BOX.w / 2 + 4);
  if (cx === null) return;
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
