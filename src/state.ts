import * as C from "./config";

export type DeerKind = "walk" | "homing" | "stag" | "side" | "pooper" | "sleeper" | "scene";
export type Edge = "top" | "left" | "right";
export type Mode = "endless" | "stage";
export type Phase = "menu" | "playing" | "over" | "clear";

export interface Tourist {
  x: number;
  y: number;
  /** せんべいを持っていて、鹿に囲まれている観光客か。 */
  feeding: boolean;
}

export interface Deer {
  x: number;
  y: number;
  kind: DeerKind;
  /** 縦の相対速度[px/s]。横入り・寝ている鹿・群れは0。 */
  sp: number;
  /** 横速度[px/s]。 */
  vx: number;
  /** 立ち止まってフンをしている残り時間[s]。 */
  squat: number;
  dropIn: number;
  dropsLeft: number;
  /** せんべいに気づいてこちらに群がっているか。 */
  swarm: boolean;
  /** 群がっているとき、まわりを回る角度。 */
  orbit: number;
  /** 牡鹿がための終わりに定めた狙いの x。 */
  lockX: number;
  /** 餌やり場の主。いるならその周りを回る。 */
  host: Tourist | null;
}

export interface Poop {
  x: number;
  y: number;
  big: boolean;
  variant: number;
  grazed: boolean;
}

/** 当たり判定の無い小石。回廊の輪郭を隠すためだけに存在する。 */
export interface Pebble {
  x: number;
  y: number;
  variant: number;
}

/** 鹿せんべい売り場。通ると10枚もらえる。 */
export interface Stall {
  x: number;
  y: number;
  taken: boolean;
}

/** 木。通れない。 */
export interface Tree {
  x: number;
  y: number;
}

/** 撒かれたせんべい。鹿がここへ殺到する。 */
export interface Bait {
  x: number;
  y: number;
  life: number;
}

export interface Warn {
  edge: Edge;
  kind: DeerKind;
  t: number;
  x: number;
  y: number;
  /** 群れで出るときの頭数。1なら単独。 */
  herd: number;
}

export interface State {
  phase: Phase;
  mode: Mode;
  stage: number;

  dist: number;
  progress: number;
  goal: number;

  score: number;
  dirt: number;
  grazeCount: number;
  poopHits: number;
  deerHits: number;
  grazeGauge: number;
  mult: number;

  /** 手持ちの鹿せんべい。 */
  senbei: number;
  /** 渡した枚数。 */
  fed: number;
  /** いま群がっている頭数。多いほど動けない。 */
  swarmCount: number;
  /** 連続で渡したときの倍率と、その残り時間。 */
  feedChain: number;
  feedChainT: number;
  feedCooldown: number;
  /** もみくちゃで溜まる汚れの端数。 */
  jostle: number;
  /** 撒いた直後、鹿が寄ってこない時間。 */
  scatterFree: number;

  level: number;
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
  corridorHalf: number;

  deerTimer: number;
  touristTimer: number;
  stallTimer: number;
  sceneTimer: number;
  restShown: number;

  poops: Poop[];
  pebbles: Pebble[];
  stalls: Stall[];
  trees: Tree[];
  baits: Bait[];
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
  s.senbei = 0;
  s.fed = 0;
  s.swarmCount = 0;
  s.feedChain = 1;
  s.feedChainT = 0;
  s.feedCooldown = 0;
  s.jostle = 0;
  s.scatterFree = 0;
  s.level = C.levelOf(s.dist);
  s.banner = "";
  s.bannerT = 0;
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
  s.deerTimer = 1.2;
  s.touristTimer = 3;
  s.stallTimer = C.STALL_INTERVAL_MIN;
  s.sceneTimer = C.FEEDING_SCENE_INTERVAL_MIN;
  s.restShown = 0;
  s.poops = [];
  s.pebbles = [];
  s.stalls = [];
  s.trees = [];
  s.baits = [];
  s.deer = [];
  s.tourists = [];
  s.warns = [];
}
