/**
 * 地形の生成。
 *
 * **v0.10 で作り方を入れ替えた。**
 *
 *   旧: 先に通れる回廊を1本引いて、その外側にだけ置く
 *   新: 好きなだけ置く → 通れるか調べる → 通れないぶんだけ取り除く
 *
 * 旧は抜けられない配置を原理的に作らないが、代わりに「正解の道」が
 * 常に1本、絵として存在してしまう。3世代かけて隠そうとして、隠しきれなかった。
 *
 * 新しいやり方では決められた道が無い。空きは毎行たまたま空いているだけで、
 * 分岐もするし行き止まりにもなる。**行き止まりは作り物ではなく勝手に生まれる。**
 * 保証するのは1つだけ——「どこかに1本、最後まで続く道がある」こと。
 * その計算は route.ts が持つ。
 */

import * as C from "./config";
import * as R from "./route";
import type { State, DeerKind, Poop, Warn, Deer, Tourist } from "./state";

/**
 * 行の基準となる出現 y。
 * 画面の外で生成し、外にいるあいだに取り除きまで済ませる。
 */
const BASE_Y = C.ENTRY_Y + 12;

function pellet(x: number, y: number, big: boolean): Poop {
  return { x, y, big, variant: Math.random() < 0.5 ? 0 : 1, grazed: false };
}

/** 参道ぜんぶ。ここから塞がっているぶんを引いて「空き」を出す。 */
function wholePath(): R.Span[] {
  return [{ a: C.PATH.x0, b: C.PATH.x1 }];
}

/**
 * その物が塞ぐ横の範囲。
 * プレイヤーの体half ぶん左右に広げてあるので、
 * 残った隙間は**そのまま通り抜けられる幅**として読める。
 */
function blockedBy(x: number, w: number): R.Span {
  return { a: x - C.BODY_HALF, b: x + w + C.BODY_HALF };
}

/**
 * いま作っている行の帯に、その物が入っているか。
 *
 * 粒は縦にばらつくが、**ずれは必ず上（dy <= 0）にしてある**。
 * 上は「まだ作っていない行」なので、いまの行の帯に後から物が増えることが無い。
 * つまり帯は、その行を作り終えた時点で確定する——だから即座に検査できる。
 *
 * 帯は16pxちょうどではなく、**当たり判定の縦半分ぶん広げる**。
 * プレイヤーの判定は縦6pxあって行の境目をまたぐので、
 * ちょうど16pxで切ると「隣の行の粒に、境目で当たる」。
 * 実測（位置を1本に固定して走らせる）で、35mに1回踏んでいた。
 */
const BAND_PAD = C.PLAYER.hitH / 2 + 1;

function inBand(y: number, h: number): boolean {
  return y + h > BASE_Y - C.TILE / 2 - BAND_PAD && y < BASE_Y + C.TILE / 2 + BAND_PAD;
}

/** いまの行の帯を塞いでいるものを全部集める。 */
function blockedSpans(s: State): R.Span[] {
  const out: R.Span[] = [];
  for (const p of s.poops) {
    const w = p.big ? C.BIG_PELLET.w : C.PELLET.w;
    const h = p.big ? C.BIG_PELLET.h : C.PELLET.h;
    if (inBand(p.y, h)) out.push(blockedBy(p.x, w));
  }
  for (const t of s.trees) {
    if (inBand(t.y + C.TREE_BOX.hitY, C.TREE_BOX.hitH)) {
      out.push(blockedBy(t.x + C.TREE_BOX.hitX, C.TREE_BOX.hitW));
    }
  }
  for (const d of s.deer) {
    if (d.kind !== "sleeper") continue;
    if (inBand(d.y + C.DEER_BOX.hitY, C.DEER_BOX.hitH)) {
      out.push(blockedBy(d.x + C.DEER_BOX.hitX, C.DEER_BOX.hitW));
    }
  }
  return R.normalise(out);
}

// ---------------------------------------------------------------- 置く

/**
 * 参道のどこにでも置く。**空いている場所を選ばない。**
 * 通れるかどうかは、置き終わってからまとめて面倒を見る（それがこの設計の要）。
 */
function anywhere(margin: number): number {
  const lo = C.PATH.x0 + margin;
  const hi = C.PATH.x1 - margin;
  return lo + Math.random() * Math.max(0, hi - lo);
}

/**
 * 縦のずれは必ず上向き（dy <= 0）。
 * 下へずらすと「もう検査を終えた行」に後から粒が増えて、保証が崩れる。
 * 塊は楕円のままなので、見た目は何も変わらない。
 */
function placeCluster(s: State, yOffset: number): void {
  const size = C.clusterSize(s.dist);
  const n = size.min + Math.floor(Math.random() * (size.max - size.min + 1));
  const cx = anywhere(2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const x = cx + Math.cos(a) * r * C.CLUSTER_RX;
    const dy = yOffset - C.CLUSTER_RY + Math.sin(a) * r * C.CLUSTER_RY;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.PELLET.w) continue;
    s.poops.push(pellet(x, BASE_Y + dy, false));
  }
}

function placeScatter(s: State, yOffset: number): void {
  const size = C.scatterSize(s.dist);
  const n = size.min + Math.floor(Math.random() * (size.max - size.min + 1));
  const cx = anywhere(2);
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * C.SCATTER_SPREAD;
    const dy = yOffset - Math.random() * 2 * C.SCATTER_JITTER_Y;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.PELLET.w) continue;
    s.poops.push(pellet(x, BASE_Y + dy, false));
  }
}

function placeBig(s: State, yOffset: number): void {
  const x = anywhere(C.BIG_PELLET.w) - C.BIG_PELLET.w / 2;
  s.poops.push(pellet(x, BASE_Y + yOffset - C.BIG_PELLET.h, true));
}

/** 小石。当たらないので、通り道の計算には一切関わらない。 */
function placePebbles(s: State): void {
  const n = Math.floor(C.PEBBLE_RATE) + (Math.random() < C.PEBBLE_RATE % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    s.pebbles.push({
      x: C.PATH.x0 + Math.random() * (C.PATH_W - 3),
      y: BASE_Y - Math.random() * 16,
      variant: Math.floor(Math.random() * 3),
    });
  }
}

/** 木。通れない。置き場所は選ばない——塞いだら取り除きが面倒を見る。 */
function placeTree(s: State): void {
  const x = anywhere(C.TREE_BOX.w / 2) - C.TREE_BOX.w / 2;
  s.trees.push({ x, y: BASE_Y - C.TREE_BOX.h });
}

/**
 * 鹿せんべい売り場。
 * **これだけは必ず取りに行けるところに置く。**
 * 取れるかどうかが運になると、せんべいの駆け引きが成立しない。
 */
export function spawnStall(s: State): void {
  const reach = C.reachPerRow(s.dist);
  const live = R.grow(s.route, reach * 2);
  const target = R.widest(live);
  const cx = target ? (target.a + target.b) / 2 : (C.PATH.x0 + C.PATH.x1) / 2;
  s.stalls.push({
    x: Math.max(C.PATH.x0, Math.min(C.PATH.x1 - C.STALL_BOX.w, cx - C.STALL_BOX.w / 2)),
    y: BASE_Y - C.STALL_BOX.h,
    taken: false,
  });
}

/** 道に寝そべって塞いでいる群れ。よけて通るしかない。 */
function placeSleepers(s: State): void {
  const n = C.sleeperSize(s.dist);
  const spread = 8 + n * 4;
  const cx = anywhere(spread / 2 + C.DEER_BOX.w / 2);
  for (let i = 0; i < n; i++) {
    const x = cx + (Math.random() - 0.5) * spread - C.DEER_BOX.w / 2;
    const y = BASE_Y - C.DEER_BOX.h - Math.random() * 10;
    if (x < C.PATH.x0 || x > C.PATH.x1 - C.DEER_BOX.w) continue;
    s.deer.push(newDeer(x, y, "sleeper", 0, 0));
  }
}

// ---------------------------------------------------------------- 通れるようにする

/**
 * いま作った行を検査し、通れなければ**通れるぶんだけ**取り除く。
 *
 * 保証の持ち方が回廊時代と決定的に違う。
 *
 *   回廊: 先に道を1本**予約して**、その外にしか置かない
 *   いま: どこにでも置いてから、**たまたま空いた隙間を1本たどれるか**を見る
 *
 * `s.thread` がその「たどっている1本」。予約ではなく結果なので、
 * 塊のあいだをすり抜けたり、大きく寄り道したりする。
 * どうしても隙間が無い行だけ、いちばん撤去の少ない窓を選んで空ける。
 *
 * 「いちばん少ない窓」を選ぶのが肝。適当な場所を空けると塊の真ん中に
 * ぽっかり穴が空いて人工物に見える。端をわずかに削る形になるので、
 * 消したことが分からない。
 */
function openRoute(s: State): void {
  const reach = C.reachPerRow(s.dist);
  const gap = C.routeGap(s.dist);

  const free = R.subtract(wholePath(), blockedSpans(s));
  // 到達可能集合。枝分かれや行き止まりの観測と、売り場・餌やり場の置き場所に使う。
  s.route = R.intersect(R.grow(s.route, reach), free);

  // 1行で動ける範囲の中に、体が収まる隙間があるか。
  const window: R.Span[] = [{ a: s.thread - reach, b: s.thread + reach }];
  const usable = R.intersect(window, free).filter((sp) => sp.b - sp.a >= gap);

  if (usable.length) {
    // いちばん近い隙間へ、動く量が最小になるように寄る
    let best = usable[0];
    const dist = (sp: R.Span) =>
      Math.abs(Math.max(sp.a + gap / 2, Math.min(sp.b - gap / 2, s.thread)) - s.thread);
    for (const sp of usable) if (dist(sp) < dist(best)) best = sp;
    s.thread = Math.max(best.a + gap / 2, Math.min(best.b - gap / 2, s.thread));
    if (!s.route.length) s.route = [best];
    s.repaired = false;
    return;
  }

  // 隙間が無い。動ける範囲の中で、撤去がいちばん少なくて済む窓を探す。
  const lo = Math.max(s.thread - reach, C.PATH.x0 + gap / 2);
  const hi = Math.min(s.thread + reach, C.PATH.x1 - gap / 2);
  const cost = (centre: number) => {
    const a = centre - gap / 2;
    const b = centre + gap / 2;
    let n = Math.abs(centre - s.thread) / 40; // 同点なら動かない方を選ぶ
    for (const p of s.poops) {
      const w = p.big ? C.BIG_PELLET.w : C.PELLET.w;
      const h = p.big ? C.BIG_PELLET.h : C.PELLET.h;
      if (!inBand(p.y, h)) continue;
      const sp = blockedBy(p.x, w);
      if (sp.b > a && sp.a < b) n += p.big ? 3 : 1;
    }
    // 木と寝ている鹿は消えると不自然なので、強く避ける（それしか無いなら消す）
    for (const t of s.trees) {
      if (!inBand(t.y + C.TREE_BOX.hitY, C.TREE_BOX.hitH)) continue;
      const sp = blockedBy(t.x + C.TREE_BOX.hitX, C.TREE_BOX.hitW);
      if (sp.b > a && sp.a < b) n += 40;
    }
    for (const d of s.deer) {
      if (d.kind !== "sleeper") continue;
      if (!inBand(d.y + C.DEER_BOX.hitY, C.DEER_BOX.hitH)) continue;
      const sp = blockedBy(d.x + C.DEER_BOX.hitX, C.DEER_BOX.hitW);
      if (sp.b > a && sp.a < b) n += 25;
    }
    return n;
  };

  let best = Math.max(lo, Math.min(hi, s.thread));
  if (hi > lo) {
    let bestC = Infinity;
    for (let x = lo; x <= hi; x += 2) {
      const c = cost(x);
      if (c < bestC) {
        bestC = c;
        best = x;
      }
    }
  }

  const a = best - gap / 2;
  const b = best + gap / 2;
  const hitsWindow = (x: number, w: number) => {
    const sp = blockedBy(x, w);
    return sp.b > a && sp.a < b;
  };
  for (let i = s.poops.length - 1; i >= 0; i--) {
    const p = s.poops[i];
    const w = p.big ? C.BIG_PELLET.w : C.PELLET.w;
    const h = p.big ? C.BIG_PELLET.h : C.PELLET.h;
    if (inBand(p.y, h) && hitsWindow(p.x, w)) s.poops.splice(i, 1);
  }
  for (let i = s.trees.length - 1; i >= 0; i--) {
    const t = s.trees[i];
    if (inBand(t.y + C.TREE_BOX.hitY, C.TREE_BOX.hitH)
      && hitsWindow(t.x + C.TREE_BOX.hitX, C.TREE_BOX.hitW)) s.trees.splice(i, 1);
  }
  for (let i = s.deer.length - 1; i >= 0; i--) {
    const d = s.deer[i];
    if (d.kind !== "sleeper") continue;
    if (inBand(d.y + C.DEER_BOX.hitY, C.DEER_BOX.hitH)
      && hitsWindow(d.x + C.DEER_BOX.hitX, C.DEER_BOX.hitW)) s.deer.splice(i, 1);
  }

  s.thread = best;
  const reFree = R.subtract(wholePath(), blockedSpans(s));
  s.route = R.intersect(R.grow(s.route, reach), reFree);
  if (!s.route.length) s.route = [{ a, b }];
  s.repaired = true;
}

/** 1行(16px)ぶん。置いてから、通れるようにする。 */
export function spawnRow(s: State): void {
  placePebbles(s);
  if (C.inRest(s.dist)) {
    // 休憩区間は何も置かないので、到達範囲は広がるだけ
    s.route = R.intersect(R.grow(s.route, C.reachPerRow(s.dist)), wholePath());
    return;
  }


  if (Math.random() < C.treeRate(s.dist)) placeTree(s);
  if (Math.random() < C.sleeperRate(s.dist)) placeSleepers(s);

  const rate = C.poopRate(s.dist);
  const n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const yOffset = -i * 3;
    const r = Math.random();
    if (r < C.PATTERN_WEIGHTS.scatter) placeScatter(s, yOffset);
    else if (r < C.PATTERN_WEIGHTS.scatter + C.PATTERN_WEIGHTS.cluster) placeCluster(s, yOffset);
    else placeBig(s, yOffset);
  }

  openRoute(s);
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
  // **通り道の上に出す。** フンだらけの端に出しても、そもそも近寄らないので
  // 障害物として機能しない。囲まれるかどうかの駆け引きは、通る場所で起きないと意味がない。
  const live = R.widest(s.route);
  const want = live ? (live.a + live.b) / 2 : (C.PATH.x0 + C.PATH.x1) / 2;
  const cx = Math.max(
    C.PATH.x0 + C.SCENE_RADIUS + 8,
    Math.min(C.PATH.x1 - C.SCENE_RADIUS - 8, want),
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
