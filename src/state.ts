import * as C from "./config";

/** 走行1回ぶんの状態。すべてここに集めてある。 */

export type Phase = "menu" | "playing" | "over";

/**
 * 参道に落ちているもの。
 *
 * **横の位置はレーン番号しか持たない。**px で持たせると、そこに必ず
 * 「あと3px 左にいれば助かった」が生まれる。当たるかどうかは
 * 「同じレーンに居たか」だけで決まってほしい。
 */
export interface Poop {
  /** 自分の何px先か。0 で足元。 */
  z: number;
  /** 0=左 1=右。`big` のときは両方をふさぐ。 */
  lane: number;
  /** 両レーンをふさぐでかいの。よけられないので、とびこえる。 */
  big: boolean;
  done: boolean;
}

/** 奥から歩いてくる鹿。 */
export interface Deer {
  z: number;
  lane: number;
  done: boolean;
}

/** 拾えるもの。 */
export interface Senbei {
  z: number;
  lane: number;
  taken: boolean;
}

/** 参道の脇を流れる飾り。当たらない。 */
export interface Scenery {
  z: number;
  /** -1=左の脇 1=右の脇 */
  side: number;
  kind: "tree" | "lantern";
}

export interface State {
  phase: Phase;

  t: number;
  /** 走った距離[px]。スコアの素。 */
  dist: number;
  score: number;
  dirt: number;

  /**
   * 下を見ているか。**指が触れているあいだ true。**
   * 触っているあいだは足元が見え、鹿は見えない。
   */
  down: boolean;
  /** いま居るレーン（整数）。当たり判定はこれだけを見る。 */
  lane: number;
  /** 見た目の横位置（0〜LANES-1 のあいだを滑る）。当たりには使わない。 */
  lx: number;
  /** 見えている範囲の境目（0=地平 1=足元）。down に向かって滑らかに動く。 */
  split: number;
  /** 視線を切り替えた時刻／レーンを移った時刻。すれすれ判定に使う。 */
  lastLook: number;
  lastMove: number;
  /** 前のフレームの視線。切り替わった瞬間を拾うためだけに持つ。 */
  wasDown: boolean;

  /** 転んでいる残り時間[s]。0 なら走っている。 */
  trip: number;
  /** とんでいる残り時間[s]。 */
  hop: number;
  /** 歩きのコマ送り。 */
  walkAcc: number;

  poops: Poop[];
  deer: Deer[];
  senbeis: Senbei[];
  scenery: Scenery[];

  /** 次の段を置く距離[px先]。 */
  nextStepZ: number;
  /** いま置いている区間の残り段数／全段数／汚れているか。 */
  runLeft: number;
  runLen: number;
  runDirty: boolean;
  /** この汚れた区間の何段目にでかいフンを置くか。-1 なら置かない。 */
  bigAt: number;
  /** 直前の段で汚れていたレーン。続けて同じ側にしないために覚えておく。 */
  lastDirtyLane: number;

  deerTimer: number;
  deerBlocked: number;
  senbeiTimer: number;
  sceneryTimer: number;

  banner: string;
  bannerT: number;

  /** 教えているあいだの残り時間[s]。0 になったら本番。 */
  intro: number;

  /** 集計（検証用）。 */
  clashSpawns: number;
  poopHits: number;
  deerHits: number;
  dodges: number;
  jumps: number;
  jumpMiss: number;
  nices: number;
  best: number;
}

export function createState(): State {
  const s = { phase: "menu" } as State;
  resetRun(s);
  s.best = 0;
  return s;
}

export function resetRun(s: State): void {
  s.t = 0;
  s.dist = 0;
  s.score = 0;
  s.dirt = 0;
  s.down = false;
  s.wasDown = false;
  s.lane = 0;
  s.lx = 0;
  s.split = C.SPLIT_UP;
  s.lastLook = -9;
  s.lastMove = -9;
  s.trip = 0;
  s.hop = 0;
  s.walkAcc = 0;
  s.poops = [];
  s.deer = [];
  s.senbeis = [];
  /**
   * **並木を先に並べておく。**
   * 空の状態から出しはじめると、最初の9秒ほど脇に何も無く、
   * 参道が「どこまでも続く白い帯」になって奥行きも速さも伝わらない。
   */
  s.scenery = [];
  for (let z = 90; z < C.DEER_Z; z += 90 + Math.random() * 110) {
    s.scenery.push({
      z,
      side: Math.random() < 0.5 ? -1 : 1,
      kind: Math.random() < 0.25 ? "lantern" : "tree",
    });
  }
  s.intro = C.INTRO_TIME;
  // 見える距離から作りはじめる。1フレーム目で GEN_Z まで一気に埋まる
  s.nextStepZ = C.POOP_SEE;
  s.runLeft = 0;
  s.runLen = 0;
  s.runDirty = false;
  s.bigAt = -1;
  s.lastDirtyLane = -1;
  s.deerTimer = 4.2;
  s.deerBlocked = 0;
  s.senbeiTimer = 6;
  s.sceneryTimer = 0;
  s.banner = "";
  s.bannerT = 0;
  s.clashSpawns = 0;
  s.poopHits = 0;
  s.deerHits = 0;
  s.dodges = 0;
  s.jumps = 0;
  s.jumpMiss = 0;
  s.nices = 0;
}
