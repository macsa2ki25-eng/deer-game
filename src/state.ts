/** 走行1回ぶんの状態。すべてここに集めてある。 */

export type Phase = "menu" | "playing" | "over";

/** 足元に落ちているもの。 */
export interface Poop {
  x: number;
  /**
   * 足元の帯（真上から見た絵）の中での縦位置 0〜1。
   * **当たりには一切効かない。**効かせると位置合わせが復活して、
   * このゲームがやめたはずのものが戻ってきてしまう。見た目だけのばらつき。
   */
  y: number;
  big: boolean;
  /** 跨いだ／踏んだの判定を1回だけにする。 */
  done: boolean;
}

/** 前から来る鹿。 */
export interface Deer {
  x: number;
  frame: number;
  done: boolean;
}

/** 拾えるもの。 */
export interface Senbei {
  x: number;
  taken: boolean;
}

/** 前方の帯を流れる飾り。当たらない。 */
export interface Scenery {
  x: number;
  kind: "tree" | "treeFar" | "lantern";
}

export interface State {
  phase: Phase;

  /** 走った時間[s]。難易度はこれで決まる。 */
  t: number;
  /** 走った距離[px]。スコアの素。 */
  dist: number;
  score: number;
  dirt: number;

  /**
   * 下を見ているか。**指が押されているあいだ true。**
   * 遊びの全部がこの1ビットに集約されている。
   */
  down: boolean;
  /** 仕切りの位置（0〜1）。down に向かって滑らかに動く。 */
  split: number;
  /** 視線を切り替えた時刻。すれすれボーナスの判定に使う。 */
  lastLook: number;

  /** 転んでいる残り時間[s]。0 なら走っている。 */
  trip: number;
  /** 跨いだ足を出している残り時間[s]。 */
  stepping: number;
  /** 走りのコマ送り。 */
  walkAcc: number;

  poops: Poop[];
  deer: Deer[];
  senbeis: Senbei[];
  scenery: Scenery[];

  poopTimer: number;
  deerTimer: number;
  senbeiTimer: number;
  sceneryTimer: number;

  /** 画面に一瞬出す一言。 */
  banner: string;
  bannerT: number;

  /** 集計（検証用）。 */
  /** わざと重ねて出した回数。**上手い人が食うのはここだけ**であるべき。 */
  clashSpawns: number;
  poopHits: number;
  deerHits: number;
  dodges: number;
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
  s.split = 0.62;
  s.lastLook = -9;
  s.trip = 0;
  s.stepping = 0;
  s.walkAcc = 0;
  s.poops = [];
  s.deer = [];
  s.senbeis = [];
  s.scenery = [];
  s.poopTimer = 1.4;
  s.deerTimer = 2.6;
  s.senbeiTimer = 6;
  s.sceneryTimer = 0.5;
  s.banner = "";
  s.bannerT = 0;
  s.clashSpawns = 0;
  s.poopHits = 0;
  s.deerHits = 0;
  s.dodges = 0;
  s.nices = 0;
}
