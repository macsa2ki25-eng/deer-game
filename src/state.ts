import * as C from "./config";

export type DeerKind = "walk" | "homing" | "stag" | "side" | "pooper";
export type Edge = "top" | "left" | "right";
export type Mode = "endless" | "stage";
export type Phase = "menu" | "playing" | "over" | "clear";

export interface Deer {
  x: number;
  y: number;
  kind: DeerKind;
  /** 縦の相対速度[px/s]。横入り鹿と、立ち止まっている鹿は0。 */
  sp: number;
  /** 横速度[px/s]。 */
  vx: number;
  /** 立ち止まってフンをしている残り時間[s]。0より大きいあいだは止まる。 */
  squat: number;
  /** 次の粒を落とすまで[s]。 */
  dropIn: number;
  /** あと何粒落とすか。 */
  dropsLeft: number;
}

export interface Poop {
  x: number;
  y: number;
  /** 大きいのは当たり判定も広いが、かすめたときの見返りも大きい。 */
  big: boolean;
  variant: number;
  /** 一度かすめた粒は二度と点にならない。 */
  grazed: boolean;
}

/** 当たり判定の無い小石。回廊の輪郭を隠すためだけに存在する。 */
export interface Pebble {
  x: number;
  y: number;
  variant: number;
}

export interface Tourist {
  x: number;
  y: number;
}

/** 鹿せんべい売り場。通ると5枚もらえる。 */
export interface Stall {
  x: number;
  y: number;
  taken: boolean;
}

/** 木。通れない。道を狭める役。 */
export interface Tree {
  x: number;
  y: number;
}

export interface Warn {
  edge: Edge;
  kind: DeerKind;
  t: number;
  x: number;
  y: number;
}

export interface State {
  phase: Phase;
  mode: Mode;
  /** ステージモードでの番号（1〜100）。 */
  stage: number;

  /** 難易度を決める距離[m]。ステージモードでは stageDifficulty + progress。 */
  dist: number;
  /** そのプレイで実際に進んだ距離[m]。表示とクリア判定に使う。 */
  progress: number;
  /** ステージのゴール距離[m]。エンドレスでは 0。 */
  goal: number;

  score: number;
  dirt: number;
  grazeCount: number;
  poopHits: number;
  deerHits: number;
  grazeGauge: number;
  mult: number;

  /** 手持ちの鹿せんべい。持っていると鹿が寄ってくる。 */
  senbei: number;
  /** 渡した枚数（表示用）。 */
  fed: number;
  /** いまのレベル。エンドレスの進み具合を数字で見せる。 */
  level: number;
  /** 画面に出す一言と残り時間[s]。 */
  banner: string;
  bannerT: number;

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
  /** 回廊の半幅。行ごとに揺らして「フンの無い帯」を見えにくくする。 */
  corridorHalf: number;

  deerTimer: number;
  touristTimer: number;
  stallTimer: number;
  restShown: number;

  poops: Poop[];
  pebbles: Pebble[];
  stalls: Stall[];
  trees: Tree[];
  deer: Deer[];
  tourists: Tourist[];
  warns: Warn[];

  touristsOn: boolean;
}

export function createState(): State {
  const s = { phase: "menu", mode: "endless", stage: 1, touristsOn: false } as State;
  resetRun(s);
  return s;
}

/** 1プレイぶんの初期化。設定は残す。 */
export function resetRun(s: State): void {
  s.progress = 0;
  s.dist = s.mode === "stage" ? C.stageDifficulty(s.stage) : 0;
  s.goal = s.mode === "stage" ? C.stageLength(s.stage) : 0;
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
  s.corridorHalf = (C.CORRIDOR_HALF_MIN + C.CORRIDOR_HALF_MAX) / 2;
  s.deerTimer = 1.6;
  s.touristTimer = 3;
  s.stallTimer = C.STALL_INTERVAL_MIN;
  s.restShown = 0;
  s.senbei = 0;
  s.fed = 0;
  s.level = C.levelOf(s.dist);
  s.banner = "";
  s.bannerT = 0;
  s.poops = [];
  s.pebbles = [];
  s.stalls = [];
  s.trees = [];
  s.deer = [];
  s.tourists = [];
  s.warns = [];
}
