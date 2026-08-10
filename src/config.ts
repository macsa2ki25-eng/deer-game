/**
 * ゲーム定数と難易度カーブ。
 * docs/DEER_GAME_DESIGN.md がそのままここに入っている。数字を触るときは仕様書も直すこと。
 *
 * 画面は縦持ちの2段構成。
 *   上：ゲーム画面（canvas、ドット絵、整数倍拡大）
 *   下：操作パッドとスコア表示（DOM）
 * 指がゲーム画面に一切かからないので、キャラが指で隠れる問題が起きない。
 */

/** ゲーム画面（上段）の論理解像度。 */
export const VIEW = { w: 160, h: 176 } as const;

export const TILE = 16;

/** 参道の左右端。プレイヤーはこの外へ出られない（緑地に逃げると避けゲーが壊れる）。 */
export const PATH = { x0: 16, x1: 144 } as const;
export const PATH_W = PATH.x1 - PATH.x0;

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
 * 1行(16px)あたりに置くフンの塊の数（期待値。1未満なら確率）。
 *
 * 行はスクロール速度と同じ毎秒 v 行で流れてくるので、
 * 実際の湧き量は v × これ。速度が上がるだけで密度も勝手に上がるため、
 * 係数そのものは緩やかにしか増やさない。
 */
export function poopRate(dist: number): number {
  return 0.8 + 0.5 * (1 - Math.exp(-dist / 500));
}

/** 鹿の出現間隔 [s] */
export function deerInterval(dist: number): number {
  return Math.max(0.55, 3.2 * Math.exp(-dist / 800));
}

/** 追い鹿の割合 */
export function homingShare(dist: number): number {
  return Math.min(0.45, dist / 2500);
}

/** 牡鹿（突進）の割合 */
export function stagShare(dist: number): number {
  return dist < 400 ? 0 : Math.min(0.2, (dist - 400) / 4000);
}

/** 横から入る鹿の割合。 */
export const SIDE_SHARE = 0.3;

// ---- フンの置き方 ----

/** 塊の種類の重み。実際の鹿のフンは、まとまって落ちているか散っているかのどちらか。 */
export const PATTERN_WEIGHTS = { scatter: 0.45, cluster: 0.42, big: 0.13 } as const;
/** ひと山の粒の数。 */
export const CLUSTER_MIN = 8;
export const CLUSTER_MAX = 12;
/** ひと山の広がり[px]。 */
export const CLUSTER_RX = 13;
export const CLUSTER_RY = 9;
/** ばらけて落ちているときの粒の数。 */
export const SCATTER_MIN = 2;
export const SCATTER_MAX = 4;
export const SCATTER_SPREAD = 30;
/** 粒を縦にどれだけばらけさせるか[±px]。1行(16px)を超えると回廊の保証が甘くなる。 */
export const SCATTER_JITTER_Y = 6;

// ---- 安全回廊 ----

/** 回廊の半幅。プレイヤー12px＋余裕12px＝24px幅。 */
export const CORRIDOR_HALF = 12;

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
 */
export const LATERAL = 105;

// ---- 当たり判定（見た目より小さく取ると避けゲーは気持ちよくなる） ----

export const PLAYER = { w: 12, h: 16, hitX: 2, hitY: 10, hitW: 8, hitH: 6 } as const;
export const DEER_BOX = { w: 16, h: 18, hitX: 2, hitY: 8, hitW: 12, hitH: 10 } as const;
export const PELLET = { w: 4, h: 4 } as const;
export const BIG_PELLET = { w: 7, h: 7 } as const;

// ---- グレイズ（フンのすぐそばを通る） ----

/** 当たり判定をこれだけ広げた範囲に入ったら「かすめた」。 */
export const GRAZE_PAD = 8;
export const GRAZE_GAIN_SMALL = 0.2;
export const GRAZE_GAIN_BIG = 0.5;
/** 被弾したときにゲージをどれだけ残すか。ゼロにすると倍率が一生育たない。 */
export const GRAZE_KEEP_ON_HIT = 0.5;
export const GRAZE_SCORE_SMALL = 30;
export const GRAZE_SCORE_BIG = 120;

/**
 * ゲージの減衰[1/s]。定数で引くと「稼ぎ続けるか、ゼロか」の二択になって倍率が死ぬので、
 * ゲージに比例させて指数で落とす。こうすると釣り合い点は
 *   ゲージ = 毎秒のグレイズ数 × GAIN ÷ DECAY
 * になり、どの腕前でも意味のある値に落ち着く。
 * 目安：毎秒1回で ×1.29、毎秒3回で ×1.86、山をかすめる毎秒6回で ×2.71。
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
