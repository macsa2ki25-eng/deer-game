import * as C from "./config";

export type DeerKind = "walk" | "homing" | "stag" | "side";
export type Edge = "top" | "left" | "right";

export interface Deer {
  x: number;
  y: number;
  kind: DeerKind;
  /** 縦の相対速度[px/s]。横入り鹿は0。 */
  sp: number;
  /** 横速度[px/s]。横入り鹿以外は0。 */
  vx: number;
}

export interface Poop {
  x: number;
  y: number;
  /** 大きいのは当たり判定も広いが、かすめたときの見返りも大きい。 */
  big: boolean;
  /** 0/1 の絵の違い。 */
  variant: number;
  /** 一度かすめた粒は二度と点にならない。 */
  grazed: boolean;
}

export interface Tourist {
  x: number;
  y: number;
}

export interface Warn {
  edge: Edge;
  kind: DeerKind;
  /** 残り時間[s]。0になると鹿が出る。 */
  t: number;
  x: number;
  y: number;
}

export type Phase = "title" | "playing" | "over";

export interface State {
  phase: Phase;
  /** 進んだ距離[m]。1m = 1タイル = 16px。難易度はすべてこれの関数。 */
  dist: number;
  score: number;
  best: number;
  dirt: number;

  /** かすめた粒の累計。 */
  grazeCount: number;
  /** 被弾の内訳。調整用の指標で、UIには出さない。 */
  poopHits: number;
  deerHits: number;
  /** かすめるほど溜まり、離れると落ちる。倍率 = 1 + これ。 */
  grazeGauge: number;
  /** 倍率。表示用にここへ写しておく。 */
  mult: number;

  px: number;
  py: number;

  inv: number;
  stun: number;
  slip: number;
  knockback: number;

  rowAcc: number;
  walkAcc: number;
  scrollPx: number;

  corridor: number;
  corridorDir: number;

  deerTimer: number;
  touristTimer: number;
  restShown: number;

  poops: Poop[];
  deer: Deer[];
  tourists: Tourist[];
  warns: Warn[];

  touristsOn: boolean;
}

export function createState(best: number): State {
  const s = { phase: "title", best, touristsOn: true } as State;
  resetRun(s);
  return s;
}

/** 1プレイぶんの初期化。ベストスコアと設定は残す。 */
export function resetRun(s: State): void {
  s.dist = 0;
  s.score = 0;
  s.dirt = 0;
  s.grazeCount = 0;
  s.poopHits = 0;
  s.deerHits = 0;
  s.grazeGauge = 0;
  s.mult = 1;
  s.px = (C.PATH.x0 + C.PATH.x1) / 2 - C.PLAYER.w / 2;
  s.py = C.PLAY_Y.bottom - 24;
  s.inv = 0;
  s.stun = 0;
  s.slip = 0;
  s.knockback = 0;
  s.rowAcc = 0;
  s.walkAcc = 0;
  s.scrollPx = 0;
  s.corridor = (C.PATH.x0 + C.PATH.x1) / 2;
  s.corridorDir = Math.random() < 0.5 ? -1 : 1;
  s.deerTimer = 1.6;
  s.touristTimer = 3;
  s.restShown = 0;
  s.poops = [];
  s.deer = [];
  s.tourists = [];
  s.warns = [];
}
