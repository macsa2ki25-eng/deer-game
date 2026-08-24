/**
 * 数字はぜんぶここ。**縦スクロール版 v2.0。**
 *
 * 遊びの芯:
 *
 *   触っている  → 下を見る。足元のフンが見える。触った側のレーンへ歩く。鹿は見えない
 *   離している  → 前を見る。奥から来る鹿が見える。足元は見えない。レーンは動かない
 *
 * 横スクロール版（v1.3、`v1.3-sidescroll-keep` に保存）との違いは、
 * **避けるのが「視線」だけでなく「左右」になった**こと。
 * 下を向いているあいだ、指はずっと左右の選択をしている。
 * その手が塞がっているあいだ、奥は見えない。
 *
 * 上下＝奥行きなので、**画面の上が遠く、下が足元**。
 * 帯を2つに割って別々の絵を描く必要がもう無い。ひと続きの参道が1枚あるだけ。
 */

/** 画面。iPhone の縦横比に近い縦長。 */
export const VIEW = { w: 160, h: 288 } as const;
/** 上端の帯（くつ・スコア）。 */
export const HUD_H = 14;
/** 遊ぶところの高さ。 */
export const FIELD_H = VIEW.h - HUD_H;

// ---- 奥行き ----

/**
 * **遠近。** z は「自分の何px先か」。z=0 が足元。
 *
 * 等速で流れる平らな絵にすると、遠くの鹿を置く場所が画面の外になる。
 * 遠近をつけると、遠いものは上のほうに小さく詰まって収まり、
 * **近づくほど速く大きくなる**——速さの体感もここから出る。
 */
export const HORIZON = HUD_H + 30;
/** 子どもの立つ高さ。ここが z=0。 */
export const KID_Y = HUD_H + FIELD_H - 46;
/** 遠近の効き。小さいほどきつい。 */
export const Z0 = 200;

/**
 * z[px先] → 画面のy。
 * **z が少しマイナスでも計算する。**足元で消えると、通り過ぎたのか
 * 消えたのか分からない。画面の下へ抜けていくところまで描く。
 */
export function yOf(z: number): number {
  return HORIZON + (KID_Y - HORIZON) * (Z0 / (Z0 + Math.max(-Z0 * 0.45, z)));
}
/** z[px先] → 大きさの比（1が足元）。 */
export function scaleOf(z: number): number {
  return Z0 / (Z0 + Math.max(-Z0 * 0.45, z));
}

// ---- レーン ----

/**
 * **3レーン。**
 *
 * 一度は2レーンにした。触った側がそのまま居場所で迷いが無い形だったが、
 * **空いているほうへ寄るだけになって簡単すぎた**。
 * 3つになると「どこが空いているか」を読む必要が出る。
 * 塞がるのが1本なら楽、2本なら道は1本しかない——濃さをここで動かせる。
 *
 * 触る場所は画面下の3等分。**幅130pxの的が3つ**。
 * 捨てたかったのは座標そのものではなく、
 * 「あと3px 左にいれば助かった」が生まれる細かさのほう。この粗さなら起きない。
 */
export const LANES = 3;
/** 足元でのレーンの中心x。 */
export const LANE_X = [42, 80, 118] as const;
/** レーンを1本移るのにかかる時間[s]。ここが「間に合わなかった」の素。 */
export const LANE_TIME = 0.22;
/**
 * 足元での参道の幅[px]。画面160pxのうち104px。
 * 最初は66pxにしていたが、細い一本道になってしまい、
 * **石が2列に並んでいる**という肝心のところが読めなかった。
 * 写真の参道も、子どもの背丈の5〜6倍の幅がある。
 */
export const ROAD_NEAR = 126;

// ---- 速さ ----

/**
 * 走る速さ[px/s]。じわっと上がって頭打ち。
 * **下を向いても遅くしない。**横スクロール版では下を向くと遅くしていたが、
 * こちらは下を向いているのが常態なので、遅くすると常に遅いだけになる。
 * 代わりに、**顔を上げているあいだは足元が見えない**のがそのまま危険。
 */
export function speed(t: number): number {
  return 104 + 62 * (1 - Math.exp(-t / 45));
}

/** 鹿が自分から近づいてくるぶんの速さ[px/s]。歩いて向かってくる。 */
export const DEER_SPEED = 46;

// ---- 見えるもの／見えないもの ----

/**
 * **見ていない側は本当に見えない。**
 *
 * 一度は薄い暗幕（0.55）にして「読めるが読みにくい」にしたが、
 * 読める以上は下を向いたまま鹿を見張れてしまい、
 * 「ずっと触っていて鹿が来たら離す」が最適手になった。それでは芯が死ぬ。
 * **鹿は下を向いているあいだ1枚も描かない。フンは顔を上げているあいだ描かない。**
 */
export const DIM = 0.93;
/** 見えている範囲の境目（0=地平, 1=足元）。触っているとき／離しているとき。 */
export const SPLIT_DOWN = 0.30;
export const SPLIT_UP = 0.74;
/** 境目が動く速さ。 */
export const SPLIT_SPEED = 10;

/** フンが見分けられる距離[px先]。これより遠いと、下を向いていても粒に見えない。 */
export const POOP_SEE = 320;

/**
 * **下を向いていても、目の前まで来た鹿は視界に入る[s]。**
 *
 * 鹿を完全に消していたら、「上で見た鹿を通り過ぎたのかどうか分からない」
 * と言われた。もっともで、実際にうつむいて歩いていても、
 * 足のすぐ前に来たものは視界の端に入る。
 *
 * ただし**避けるには間に合わない長さ**でなければならない。
 * 反応 0.45秒 ＋ 隣へ移る 0.22秒 で 0.67秒 かかるので、
 * ここを 0.40秒にしておけば「知らせ」であって「予告」にはならない。
 * 通り過ぎたことが分かるだけ。
 */
export const PERIPHERAL_TIME = 0.40;

/** 下を向いているときに鹿が見えはじめる距離[px先]。 */
export function peripheralZ(t: number): number {
  return (speed(t) + DEER_SPEED) * PERIPHERAL_TIME;
}

/**
 * **参道を作っておく距離[px先]。見える距離よりずっと先まで作る。**
 *
 * 最初は「見える距離まで」しか作っていなかった。ところが鹿は 1150px 先
 * （約6秒先）から出すので、鹿を出すときには**その鹿が着くあたりの参道が
 * まだ存在していなかった**。「汚れた区間の真っ最中に着く鹿はずらす」という
 * 仕掛けが、比べる相手がいないまま一度も働いていなかった。
 * 見えるかどうかと、作ってあるかどうかは別のこと。
 */
export const GEN_Z = 1270;

// ---- 反応時間 ----

/**
 * 人が見てから動かすまで[s]。ここを割るものは出さない。
 * 実測の単純反応が 0.25秒ほど、判断が挟まると 0.4秒ほど。
 */
export const T_MIN = 0.45;

/** フンが見えてから足元に届くまで[s]。いちばん速いときで測る。 */
export function poopLead(t: number): number {
  return POOP_SEE / speed(t);
}
/** 鹿が出てから足元に届くまで[s]。 */
export function deerLead(t: number): number {
  return DEER_Z / (speed(t) + DEER_SPEED);
}

/** 鹿を出す距離[px先]。**顔を上げれば必ず見える長さ**を確保する。 */
export const DEER_Z = 1150;

// ---- 出し方 ----

/**
 * **塞がるレーンを2本にする確率。**残る道は1本だけになる。
 * ここが濃さのつまみ。1本だけ塞がるなら、どちらへ逃げてもいい。
 */
export function blockTwo(t: number): number {
  return 0.25 + 0.5 * Math.min(1, t / 100);
}

/**
 * **鹿が2頭ならんで来る確率。**3レーンだと1頭では2/3が空いてしまい、
 * 見ないで賭けても勝ててしまう。2頭なら、どこが空いているかを
 * 知らないかぎり通れない。顔を上げる理由はここで作る。
 */
export function deerPair(t: number): number {
  return 0.15 + 0.35 * Math.min(1, t / 100);
}

/**
 * **フンは「区間」で来る。**
 *
 * 1粒ずつだと下を向くのが一瞬で済み、「集中する」という状態が生まれない。
 * 何歩かぶん続けて汚れていれば、そのあいだずっと指は左右を選んでいる。
 * きれいな区間が、顔を上げる隙になる。
 *
 * 単位は「段」。1段 = STEP_Z px 先ごとに、どちらかのレーンが汚れている。
 */
export const STEP_Z = 76;

export function dirtyRun(t: number): { min: number; max: number } {
  const k = Math.min(1, t / 100);
  return { min: 2, max: Math.round(4 + 3 * k) };
}
export function cleanRun(t: number): { min: number; max: number } {
  const k = Math.min(1, t / 100);
  return { min: Math.round(5 - 2 * k), max: Math.round(9 - 3 * k) };
}

/**
 * **でかいフンは両レーンをふさぐ。よけられないので、とびこえる。**
 *
 * とぶには助走が要る。うつむいて足元だけ見ながらでは跳べないので、
 * **顔を上げているあいだにしか越えられない**。
 * 見るのと越えるのが逆向きなのは横スクロール版と同じ——
 * どこに来るかは下を向かないと分からず、越える瞬間は足元が見えない。
 */
export function bigChance(t: number): number {
  return 0.40 + 0.4 * Math.min(1, t / 100);
}
/** でかいフンの手前を、これだけの段ぶん空ける。顔を上げるための隙。 */
export const BIG_GAP = 2;
/** でかいフンを置くために、汚れた区間をこの段数まで伸ばす。 */
export const BIG_RUN_MIN = 4;
/** とびこえたときの点。 */
export const JUMP_SCORE = 90;
/** とんでいる時間[s]。 */
export const HOP_TIME = 0.36;

/** 鹿を出す間隔[s]。 */
export function deerInterval(t: number): number {
  return Math.max(2.6, 5.2 * Math.exp(-t / 70));
}

/**
 * **フンと鹿が届く時刻を、これだけ離す[s]。**
 * 下を向いているあいだは鹿が見えないので、汚れた区間の真っ最中に
 * 着く鹿は原則ずらす。気づきようが無い場面を「難しさ」と呼ばないため。
 */
export const SEPARATION = 0.75;
/** それでも、わざと重ねる割合。ここがこのゲームの山場。 */
export function clashChance(t: number): number {
  return Math.min(0.32, 0.10 + t / 600);
}

// ---- 得点・判定 ----

export const SCORE_PER_PX = 0.1;
/** すれすれで切り替えた／移ったときの上乗せ。 */
export const NICE_WINDOW = 0.3;
export const NICE_SCORE = 40;
/** せんべい。 */
export const SENBEI_SCORE = 120;
export const SENBEI_INTERVAL_MIN = 6;
export const SENBEI_INTERVAL_MAX = 11;

/** くつが3つ汚れたら終わり。 */
export const DIRT_MAX = 3;
/** 踏んだとき／ぶつかったときに止まる時間[s]。 */
export const TRIP_POOP = 0.5;
export const TRIP_DEER = 0.9;

/** 教えているあいだの長さ[s]。このあいだは汚れない。 */
export const INTRO_TIME = 11;

/** 当たりを取る幅（レーンの中心からの距離[px]）。 */
export const HIT_HALF = 14;
