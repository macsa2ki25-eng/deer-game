/**
 * ゲーム定数と難易度カーブ。
 * docs/DEER_GAME_DESIGN.md がそのままここに入っている。数字を触るときは仕様書も直すこと。
 *
 * 画面は縦持ちの2段構成。
 *   上：ゲーム画面（canvas、ドット絵）。横幅いっぱいに広げるので参道は横長になる
 *   下：操作パッドとスコア表示（DOM）
 * 指がゲーム画面に一切かからないので、キャラが指で隠れる問題が起きない。
 */

/**
 * ゲーム画面（上段）の論理解像度。14×11 タイル。
 * 表示は画面の横幅いっぱいに引き伸ばす（左右の余白を作らない）。
 * 端数倍になるが、スマホは devicePixelRatio が2〜3あるので実機ではムラは出ない。
 */
export const VIEW = { w: 224, h: 176 } as const;

export const TILE = 16;

/** 参道の左右端。プレイヤーはこの外へ出られない（緑地に逃げると避けゲーが壊れる）。 */
export const PATH = { x0: 8, x1: 216 } as const;
export const PATH_W = PATH.x1 - PATH.x0; // 208px = 13タイル

/** プレイヤーが動ける縦範囲。 */
export const PLAY_Y = { top: 20, bottom: 160 } as const;

/** 鹿・フンが湧く画面外の y。 */
export const ENTRY_Y = -18;

/** 予兆の長さ[s]。これが無いと後半は理不尽になる。 */
export const TELEGRAPH = 0.5;
/** 牡鹿はさらにこれだけ「ため」てから突進する。 */
export const STAG_WINDUP = 0.8;

/**
 * 反応時間の下限[s]。設計の要。
 * これを固定して、そこから速度の上限を逆算する（逆ではない）。
 */
export const T_MIN = 1.2;

/** 前方視界[タイル]。鹿の出現位置からプレイヤー安全帯まで。 */
export const FIELD = (PLAY_Y.bottom - ENTRY_Y) / TILE;

const CLOSE_CAP = FIELD / T_MIN;
/** スクロール速度の上限[タイル/s] */
export const V_MAX = 0.66 * CLOSE_CAP;
/** 鹿の接近速度の上限[タイル/s] */
export const U_MAX = 0.34 * CLOSE_CAP;

const V0 = 2.8;
const U0 = 0.9;

/** 参道が広くなったぶん、同じ密度に見せるにはフンも増やす必要がある。 */
const WIDTH_K = PATH_W / 128;

// ---- 難易度カーブ（すべて飽和する関数。上限が無いと必ず理不尽になる） ----

/** スクロール速度 [タイル/s] */
export function scrollSpeed(dist: number): number {
  return V0 + (V_MAX - V0) * (1 - Math.exp(-dist / 450));
}

/** 鹿の接近速度 [タイル/s]（スクロールに加算される相対速度） */
export function deerSpeed(dist: number): number {
  return Math.min(U_MAX, U0 + 0.7 * Math.log(1 + dist / 200));
}

/**
 * 1行(16px)あたりに置くフンの塊の数（期待値）。
 * 行はスクロール速度と同じ毎秒 v 行で流れてくるので、実際の湧き量は v × これ。
 */
export function poopRate(dist: number): number {
  // 裾を長くしてある。時定数が短いと600m 付近で頭打ちになり、
  // それ以降なにも変化しなくなって「レベルが上がった感じ」が消える。
  return (0.8 + 1.2 * (1 - Math.exp(-dist / 1400))) * WIDTH_K;
}

/** 鹿の出現間隔 [s] */
export function deerInterval(dist: number): number {
  return Math.max(0.55, 3.2 * Math.exp(-dist / 800));
}

/** 追い鹿の割合 */
export function homingShare(dist: number): number {
  if (levelOf(dist) < UNLOCK.homing) return 0;
  return Math.min(0.45, (dist - (UNLOCK.homing - 1) * LEVEL_M) / 2000);
}

/** 牡鹿（突進）の割合 */
export function stagShare(dist: number): number {
  if (levelOf(dist) < UNLOCK.stag) return 0;
  return Math.min(0.2, (dist - (UNLOCK.stag - 1) * LEVEL_M) / 4000);
}

/** 横から入る鹿の割合。 */
export const SIDE_SHARE = 0.3;

// ---- レベル ----

/** 1レベルあたりの距離[m]。 */
export const LEVEL_M = 100;

export function levelOf(dist: number): number {
  return Math.floor(dist / LEVEL_M) + 1;
}

/**
 * レベルごとの解禁。
 * 数字を滑らかに上げるだけだと変化が体感できないので、
 * 「新しい要素が出てくる」という形で段差を作る。
 */
export const UNLOCK = {
  stall: 2,   // 鹿せんべい売り場
  side: 2,    // 横から入る鹿
  pooper: 3,  // 道でフンをする鹿
  tree: 4,    // 木で道が狭まる
  stag: 5,    // 牡鹿
  homing: 6,  // 追いかけてくる鹿
} as const;

/** レベルアップ時に画面へ出す一言。無い回は null。 */
export function levelNote(level: number): string | null {
  switch (level) {
    case UNLOCK.side: return "よこから 鹿がくる";
    case UNLOCK.pooper: return "鹿が 道でしはじめる";
    case UNLOCK.tree: return "木で 道がせまくなる";
    case UNLOCK.stag: return "つのの ある鹿";
    case UNLOCK.homing: return "おいかけてくる鹿";
    case 8: return "でかいフンが ふえる";
    default: return null;
  }
}

/** 道の途中で立ち止まってフンをする鹿の割合。 */
export function pooperShare(dist: number): number {
  return levelOf(dist) < UNLOCK.pooper ? 0 : 0.22;
}

// ---- フンの置き方 ----

/** 塊の種類の重み。実際の鹿のフンは、まとまって落ちているか散っているかのどちらか。 */
export const PATTERN_WEIGHTS = { scatter: 0.45, cluster: 0.42, big: 0.13 } as const;
export const CLUSTER_MIN = 8;
export const CLUSTER_MAX = 12;
export const CLUSTER_RX = 13;
export const CLUSTER_RY = 9;
export const SCATTER_MIN = 2;
export const SCATTER_MAX = 4;
export const SCATTER_SPREAD = 30;
/** 粒を縦にどれだけばらけさせるか[±px]。1行(16px)を超えると回廊の保証が甘くなる。 */
export const SCATTER_JITTER_Y = 6;

/** 立ち止まった鹿が落とす粒の数と間隔。 */
export const POOPER_PELLETS = 7;
export const POOPER_INTERVAL = 0.13;
export const POOPER_STOP = 1.5;

// ---- 安全回廊 ----

/**
 * 回廊の半幅。プレイヤー12px＋余裕。
 * 一定幅にすると「フンの無い帯」が見えてしまい、正解の道が絵で分かってしまう。
 * 行ごとに揺らして、縁を不揃いにする。
 */
/**
 * 最小幅はグレイズの届く距離より広く取る。
 * プレイヤーの当たり判定の半幅4px + GRAZE_PAD 8px = 12px なので、
 * 半幅が12を割ると「安全な線の真ん中を歩いているだけでかすめてしまう」。
 * 攻めと守りの差が消えるので、12より広い14を下限にする。
 */
export const CORRIDOR_HALF_MIN = 14;
export const CORRIDOR_HALF_MAX = 20;

/**
 * 理論上、回廊が1行でずれてよい上限は LATERAL / v
 * ——プレイヤーが全速力で横に走ってようやく追いつける量。
 * ただし毎行その上限を使うと余裕がゼロになり、
 * 「追いかけるだけで手一杯、避ける操作ができない」状態になる。
 * 実測（回廊を辿るボット）で破綻したので、実際に使うのはこの割合まで。
 */
export const DRIFT_SAFETY = 0.35;

/** 回廊が1行(16px)で横にずれてよい量[px]。 */
export function corridorDrift(dist: number): number {
  return (DRIFT_SAFETY * LATERAL) / scrollSpeed(dist);
}

// ---- 小石（回廊の見た目を隠すための飾り。当たり判定は無い） ----

/**
 * 回廊にフンを置かないと、そこだけ綺麗な帯になって「正解の道」が丸見えになる。
 * 当たらない小石を参道じゅう（回廊の中にも）撒いて、帯の輪郭を消す。
 * 色は灰色で、茶色いフンとは近づけば見分けがつく——避けゲーとしては公平なまま。
 */
export const PEBBLE_RATE = 3.2;
/** そのうち回廊の中に置く割合。フンが入れない場所を埋めないと帯が消えない。 */
export const PEBBLE_IN_CORRIDOR = 0.6;

// ---- 鹿せんべい ----

/** 売り場を1つ通ると手に入る枚数。 */
export const SENBEI_PER_STALL = 5;
/** 売り場の出る間隔[s]。頻繁だとありがたみが無い。 */
export const STALL_INTERVAL_MIN = 22;
export const STALL_INTERVAL_MAX = 38;
export const STALL_BOX = { w: 20, h: 14, hitX: 2, hitY: 2, hitW: 16, hitH: 10 } as const;

/** せんべいを持っているあいだ、鹿はこの倍率で寄ってくる。 */
export const SENBEI_RUSH_SPEED = 1.7;
export const SENBEI_RUSH_HOMING = 110;
/** この距離まで近づけば、ぶつかる前にせんべいを渡せる。 */
export const FEED_RADIUS = 22;
export const FEED_SCORE = 400;
/** 渡すとゲージも少し上がる。 */
export const FEED_GAUGE = 0.25;

// ---- 木（通れない） ----

export const TREE_BOX = { w: 16, h: 18, hitX: 3, hitY: 4, hitW: 10, hitH: 11 } as const;

/** 1行あたりに木を置く確率。 */
export function treeRate(dist: number): number {
  if (levelOf(dist) < UNLOCK.tree) return 0;
  return Math.min(0.15, 0.05 + (dist - (UNLOCK.tree - 1) * LEVEL_M) / 12000);
}

// ---- 休憩区間 ----

export const REST_EVERY_M = 400;
export const REST_SECONDS = 2.5;

export function inRest(dist: number): boolean {
  return dist > REST_EVERY_M && dist % REST_EVERY_M < REST_SECONDS * scrollSpeed(dist);
}

// ---- 操作 ----

/**
 * 移動速度 [px/s]。
 * パッドは絶対位置指定だが、ここで速度を頭打ちにするのでワープはしない。
 * 回廊の到達可能性もこの値を前提に計算している。
 * 参道が広くなったぶん、横断にかかる時間が変わらないよう上げてある。
 */
export const LATERAL = 150;

// ---- 当たり判定（見た目より小さく取ると避けゲーは気持ちよくなる） ----

export const PLAYER = { w: 12, h: 16, hitX: 2, hitY: 10, hitW: 8, hitH: 6 } as const;
export const DEER_BOX = { w: 16, h: 18, hitX: 2, hitY: 8, hitW: 12, hitH: 10 } as const;
export const PELLET = { w: 4, h: 4 } as const;
export const BIG_PELLET = { w: 7, h: 7 } as const;

// ---- グレイズ（フンのすぐそばを通る） ----

export const GRAZE_PAD = 8;
export const GRAZE_GAIN_SMALL = 0.2;
export const GRAZE_GAIN_BIG = 0.5;
export const GRAZE_SCORE_SMALL = 30;
export const GRAZE_SCORE_BIG = 120;
/** 被弾したときにゲージをどれだけ残すか。ゼロにすると倍率が一生育たない。 */
export const GRAZE_KEEP_ON_HIT = 0.5;

/**
 * ゲージの減衰[1/s]。定数で引くと「稼ぎ続けるか、ゼロか」の二択になって倍率が死ぬので、
 * ゲージに比例させて指数で落とす。こうすると釣り合い点は
 *   ゲージ = 毎秒のグレイズ数 × GAIN ÷ DECAY
 * になり、どの腕前でも意味のある値に落ち着く。
 */
export const GRAZE_DECAY = 0.7;
export const GRAZE_MAX = 2.0;

// ---- ダメージ（ゲームオーバーは早いほうが「もう1回」が出る） ----

export const DIRT_MAX = 5;
export const DIRT_POOP = 1;
export const DIRT_DEER = 2;
export const INV_POOP = 0.5;
export const INV_DEER = 1.1;
export const STUN_DEER = 0.3;
export const KNOCKBACK_DEER = 0.3;
export const KNOCKBACK_SPEED = 90;
export const SLIP_POOP = 0.5;
export const SLIP_FACTOR = 0.4;

// ---- スコア ----

export const SCORE_PER_M = 10;

// ---- ステージモード ----

export const STAGES_PER_AREA = 10;
export const AREA_COUNT = 10;
export const STAGE_COUNT = STAGES_PER_AREA * AREA_COUNT;

export const AREA_NAMES = [
  "参道", "大門", "鏡の池", "大仏さまの前", "若草の坂",
  "石段", "春日の杜", "鹿寄せ広場", "雨の参道", "夜の奈良",
] as const;

/** 次のエリアを開けるのに要る★の数。全部★3を取る必要はない。 */
export const AREA_UNLOCK_STARS = 15;

/**
 * ステージ n（1〜100）の難易度を、エンドレスの「距離」に読み替える。
 * カーブの式を1本で使い回せるので、調整箇所が増えない。
 */
export function stageDifficulty(stage: number): number {
  return (stage - 1) * 18;
}

/** ステージ n のゴールまでの距離[m]。 */
export function stageLength(stage: number): number {
  return 40 + (stage - 1);
}

/** クリア時の汚れから★を決める。 */
export function starsFor(dirt: number): number {
  if (dirt === 0) return 3;
  if (dirt <= 2) return 2;
  return 1;
}

export function areaOf(stage: number): number {
  return Math.floor((stage - 1) / STAGES_PER_AREA);
}
