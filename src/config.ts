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

/** プレイヤーの当たり判定の半幅[px]。通り道の計算が PLAYER の定義より前に要る。 */
export const BODY_HALF = 5;
/** プレイヤーの高さ[px]。PLAY_Y の計算が PLAYER の定義より前に要る。 */
const PLAYER_H = 22;

/**
 * ゲーム画面の上に足す HUD の高さ[px]。
 *
 * 数字を下段のDOMからここへ移した。理由は2つ。
 *
 *  1. **視線が動かない。** 避けている最中に画面の下まで目をやる余裕は無い。
 *     下に置いた数字は、結局ゲームオーバーになってから初めて読まれていた
 *  2. **下段が空く。** スコア表示だけで画面の1/4（実測206px）を使っていて、
 *     iPhone SE ではパッド(144px)より大きかった。空けたぶんはパッドに回す
 *
 * 参道の上に重ねるのではなく、**上に足す**のが要。
 * 鹿は画面の上端から入ってくるので、そこに何か被せると発見が遅れ、
 * 反応時間の下限1.2秒（T_MIN）から積み上げた難易度の前提が崩れる。
 */
export const HUD_H = 18;

/** canvas の実寸。世界(VIEW)の上に HUD を積んだ大きさ。 */
export const CANVAS = { w: VIEW.w, h: VIEW.h + HUD_H } as const;

/** 参道の左右端。プレイヤーはこの外へ出られない（緑地に逃げると避けゲーが壊れる）。 */
export const PATH = { x0: 8, x1: 216 } as const;
export const PATH_W = PATH.x1 - PATH.x0; // 208px = 13タイル

/** プレイヤーが動ける縦範囲。 */
/**
 * プレイヤーが動ける縦範囲。**下端は「足が画面から出ない」で決まる。**
 * キャラを22px高にしたら、bottom 160 では足元が切れていた（160+22 > 176）。
 */
export const PLAY_Y = { top: 20, bottom: VIEW.h - PLAYER_H - 2 } as const;

/** 鹿・フンが湧く画面外の y。 */
export const ENTRY_Y = -18;

/** 予兆の長さ[s]。これが無いと後半は理不尽になる。 */
export const TELEGRAPH = 0.5;
/**
 * 牡鹿。ためてから、ためが切れた瞬間のプレイヤーの位置へ一直線に突っ込む。
 *
 * 役割は他の鹿とはっきり分けてある。
 *   歩き鹿  … 出た場所を通るだけ。位置を見て避ける
 *   追い鹿  … こちらを追い続ける。振り切る
 *   牡鹿    … 一度だけ狙いを定め、あとは直進。「いま居る場所から退く」
 * そして牡鹿だけは**せんべいで買収できない**。発情期なので餌に興味がない。
 * せんべいで場を支配できるこのゲームで、唯一お金で解決できない相手。
 */
export const STAG_WINDUP = 0.8;
export const STAG_SPEED = 2.6;
export const STAG_DIRT = 3;

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
  //
  // 一度は大きく上げた（被覆率6%→35%）。ただしそれは
  // **「安全な線を1本通す」保証とセット**の数字だった。
  // 保証を外した v0.11 では、敷き詰めると単に理不尽になるので下げてある。
  // ランダムに落ちているから面白いのであって、量ではない。
  return (0.9 + 1.5 * (1 - Math.exp(-dist / 700))) * WIDTH_K;
}

/** 鹿の出現間隔 [s] */
export function deerInterval(dist: number): number {
  return Math.max(0.32, 1.7 * Math.exp(-dist / 900));
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
  tourist: 7, // 参道を歩いている観光客
} as const;

/** レベルアップ時に画面へ出す一言。無い回は null。 */
export function levelNote(level: number): string | null {
  switch (level) {
    case UNLOCK.side: return "よこから 鹿がくる";
    case UNLOCK.pooper: return "鹿が 道でしはじめる";
    case UNLOCK.tree: return "木で 道がせまくなる";
    case UNLOCK.stag: return "つのの ある鹿";
    case UNLOCK.homing: return "おいかけてくる鹿";
    case UNLOCK.tourist: return "参道が こんできた";
    case 8: return "でかいフンが ふえる";
    default: return null;
  }
}

/**
 * 歩いている観光客が湧く間隔[秒]。
 *
 * 設定で出したり消したりするものではなく、**奥へ行くほど参道が混む**という
 * 形にした。実際の東大寺の参道がそうだからでもあるが、遊びの理由のほうが大きい。
 * 観光客は当たっても汚れない——押し戻されて下がるだけ。
 * つまり「避ける相手」ではなく「行きたい方向を塞ぐもの」で、
 * フンを避ける手数そのものを削ってくる。だから鹿より遅く解禁して、
 * 濃さにも上限を置く。ここを詰めると、避ける余地が消えて理不尽になる。
 *
 * レベル7で 7.5秒に1人 → 奥で 3.4秒に1人。
 */
export function touristGap(dist: number): number {
  const from = (UNLOCK.tourist - 1) * LEVEL_M;
  if (dist < from) return Infinity;
  const t = 1 - Math.exp(-(dist - from) / 900);
  return 7.5 - 4.1 * t;
}

/** 道の途中で立ち止まってフンをする鹿の割合。 */
export function pooperShare(dist: number): number {
  return levelOf(dist) < UNLOCK.pooper ? 0 : 0.22;
}

// ---- フンの置き方 ----

/** 塊の種類の重み。実際の鹿のフンは、まとまって落ちているか散っているかのどちらか。 */
export const PATTERN_WEIGHTS = { scatter: 0.45, cluster: 0.42, big: 0.13 } as const;
/**
 * 塊の粒数。**距離で増やす。**
 * 定数のまま濃くしたら、ステージ1（難易度0m相当）がクリア不能になった。
 * 序盤は小さな落とし物、奥に行くほど溜まった山、という増え方にする。
 */
export function clusterSize(dist: number): { min: number; max: number } {
  const t = 1 - Math.exp(-dist / 700);
  return { min: Math.round(5 + 6 * t), max: Math.round(9 + 9 * t) };
}
export const CLUSTER_RX = 13;
export const CLUSTER_RY = 9;
export function scatterSize(dist: number): { min: number; max: number } {
  const t = 1 - Math.exp(-dist / 700);
  return { min: Math.round(2 + 2 * t), max: Math.round(4 + 3 * t) };
}
export const SCATTER_SPREAD = 30;
/** 粒を縦にどれだけばらけさせるか[±px]。1行(16px)を超えると回廊の保証が甘くなる。 */
export const SCATTER_JITTER_Y = 6;

/** 立ち止まった鹿が落とす粒の数と間隔。 */
export const POOPER_PELLETS = 13;
export const POOPER_INTERVAL = 0.08;
/**
 * 立ち止まる時間。
 *
 * **止まっているあいだは背景スクロールぶんも打ち消す**（game.ts）。
 * そうしないと「立ち止まって」いても画面の下へ流れていき、
 * 落とし終わる頃にはもう通り過ぎている。実際そうなっていた。
 * 画面の上端に貼り付いたまま、横に歩きながら落とす。
 */
export const POOPER_STOP = 1.25;
/**
 * 1粒ごとの散らばり[±px]。
 *
 * **鹿は横に歩かない。その場に立って、真下（お尻の向き）へ出す。**
 * 一度は横に歩かせてみたが、鹿が意味も無くうろうろして見えただけだった。
 * 立ち止まって出したものが背景と一緒に流れていくので、
 * 跡はひとりでに**縦の帯**になる——出てきた鹿の下に、
 * 突然そこだけ門が立ったように見える。それが避ける目印になる。
 *
 * 幅はお尻の幅ぶん。広げると帯ではなく面になって、門に見えなくなる。
 */
export const POOPER_SPREAD = 5;

// ---- 通れることの保証（v0.10 で作り直し） ----

/**
 * **回廊をやめた。**
 *
 * v0.9 までは「先に通れる道を1本引いて、その外側にだけ置く」だった。
 * 抜けられない配置は原理的に作られないが、副作用として
 * **「正解の道」が常に1本、絵として存在してしまう**。
 * 小石で隠す・幅を揺らす・同じ帯を3本出す、と3世代かけて誤魔化したが、
 * 「フンはいっぱいあるのに簡単」は最後まで消えなかった。当然で、
 * 参道の44%が最初から安全地帯だった。
 *
 * 入れ替えた:
 *
 *     好きなだけ置く → 通れるか調べる → 通れないぶんだけ取り除く
 *
 * 決められた道は無い。空きは毎行たまたま空いているだけで、分岐も行き止まりもする。
 * **行き止まりは作り物ではなく勝手に生まれる。**
 * 保証は1つだけ——「どこかに1本、最後まで続く道がある」。
 */

/**
 * 1行(16px)進むあいだにプレイヤーが横へ動ける量[px]。
 * これが到達可能集合を広げる幅そのもの。
 *
 * 理屈の上では LATERAL / v をまるごと使えるが、それだと
 * 「道を追いかけるだけで手一杯、避ける操作ができない」状態になる。
 * 実際に使うのはこの割合まで（回廊時代の DRIFT_SAFETY と同じ役割・同じ値）。
 */
export const REACH_SAFETY = 0.35;

/**
 * **通り道の保証を使うかどうか。ここ1行で戻せる。**
 *
 * true  … 毎行「必ず通れる1本」を残す。塞がった行は物を取り除いて空ける
 * false … 何も保証しない。フンはただランダムに落ちているだけ
 *
 * v0.11 で false にした。理由は、**保証した時点でそれは回廊だから**。
 * v0.10 で「予約せず、置いたあとに残った隙間をたどる」形にしたが、
 * 毎行 routeGap ぶんの隙間を必ず残す以上、密度が上がれば
 * そこだけ空いた筋として見えてしまう。実際そう見えた。
 *
 * 代わりに**フンを減らした**。ランダムに落ちているから面白いのであって、
 * 敷き詰めたうえで安全な線を通すのは、結局あの帯に戻る道だった。
 * 詰んだ瞬間の逃げ道は、保証ではなく**ジャンプ**で持たせている。
 *
 * true に戻せば v0.10 の挙動がそのまま返る（route.ts も openRoute も残してある）。
 */
export const SAFE_ROUTE = false;

export function reachPerRow(dist: number): number {
  return (REACH_SAFETY * LATERAL) / scrollSpeed(dist);
}

/**
 * 通り道として残す最小の隙間[px]。
 *
 * 隙間の判定には当たり判定の半幅をすでに織り込んであるので、
 * ここは**素の余裕**——操作のぶれと、粒の縦のばらつきを吸収するぶん。
 * 距離とともに細くする。序盤は大股で通れて、奥は縫うようになる。
 *
 * **グレイズの届く距離(12px)の2倍より広く取る。**
 * ここを24px未満にすると、保証された道の真ん中を歩くだけで常にかすめてしまい、
 * 「安全に歩く」と「縁を攻める」の差が消える（実測で 0.83 対 0.63 まで潰れた）。
 * なお**保証はこの幅までで、地形が自然に空ける隙間はもっと細い**。
 * 細い隙間を選ぶかどうかが、そのままプレイヤーの攻め方になる。
 */
export function routeGap(dist: number): number {
  return 32 - 7 * (1 - Math.exp(-dist / 900));
}

// ---- ジャンプ ----

/**
 * **フンだけを飛び越える。** 鹿にはぶつかる（跳んだくらいでは避けられない）。
 * 保証を外した代わりの逃げ道なので、詰みかけた瞬間に確実に効いてほしい。
 * ただし押しっぱなしで無敵になっては避けゲーが終わるので、燃料を持たせる。
 */
export const JUMP_TIME = 0.42;
/** 1回の消費。満タンから3回。 */
export const JUMP_COST = 1 / 3;
/** 毎秒の回復。空から満タンまで約7秒。 */
export const JUMP_REGEN = 0.145;
/** 跳んでいるあいだ、絵をどれだけ持ち上げるか[px]。 */
export const JUMP_LIFT = 11;

// ---- 新しいくつ（回復） ----

/**
 * 拾うと汚れが1減る。**ほんとうにたまに**しか置かない。
 * 頻繁に出ると「拾えば済む」ゲームになって、避ける緊張が消える。
 */
export const SHOE_INTERVAL_MIN = 42;
export const SHOE_INTERVAL_MAX = 78;
export const SHOE_BOX = { w: 11, h: 13 } as const;
/** 拾う判定。絵よりだいぶ広く取る——取り逃しが別のミニゲームになると興ざめ。 */
export const SHOE_REACH = 14;
export const SHOE_SCORE = 300;

/**
 * グレイズが成立する最小の隙間[px]。
 * これより細い道しか無い行では、通るだけでかすめる——それは狙いどおり。
 */
export const GRAZE_ROOM = 24;

/**
 * 当たり判定の無い灰色の小石。もとは回廊の輪郭を消すための道具だったが、
 * 回廊が無くなったので、いまは**地面を汚して見せるためだけ**の飾り。
 * 灰色なので、近づけば茶色いフンと確実に見分けられる——避けゲーとしては公平。
 */
export const PEBBLE_RATE = 3.2;

// ---- 鹿せんべい ----

/**
 * 鹿せんべい。実際の奈良で起きることを、そのまま仕組みにしてある。
 *
 *   買う → 鹿が気づいて寄ってくる → あげると嬉しい → でも寄りすぎて囲まれる
 *   → 動けない・前が見えない → 撒いて逃げるか、配り切るか
 *
 * 群がった鹿は「ぶつかって汚れる」対象ではない。押してくるだけ。
 * 危ないのは、動けず前も見えないまま、フンだらけの参道に立たされること。
 */

/** 売り場を1つ通ると手に入る枚数。実物と同じ10枚束。 */
export const SENBEI_PER_STALL = 10;
export const STALL_INTERVAL_MIN = 20;
export const STALL_INTERVAL_MAX = 34;
export const STALL_BOX = { w: 20, h: 14 } as const;
/**
 * 売り場は「前を通れば買える」。判定を絵よりずっと広く取る。
 * ぴったり踏まないと買えないと、買うこと自体が別のミニゲームになってしまう。
 */
export const STALL_REACH_X = 26;
export const STALL_REACH_Y = 16;

/**
 * 囲まれ判定。この半径にこの頭数がいる所へ踏み込むと、群れに取り囲まれる。
 * 単独の鹿にぶつかるぶんには盾として機能するが、塊に触れると捕まる。
 */
export const ENCIRCLE_RADIUS = 46;
export const ENCIRCLE_AT = 3;
/** 囲まれているあいだ、この間隔で1枚ずつ持っていかれる。拘束時間＝残り枚数。 */
export const ENCIRCLE_DRAIN = 0.5;
/** 囲まれているあいだの移動速度。 */
export const ENCIRCLE_SLOW = 0.3;
/** 解放直後、すぐ捕まらない猶予[s]。 */
export const ENCIRCLE_GRACE = 1.3;
/** 解放時に鹿を外へ押しのける距離[px]。密着したまま戻ると轢かれる。 */
export const RELEASE_PUSH = 26;

/** この距離に入った鹿は、せんべいに気づいて寄ってくる。 */
export const NOTICE_RADIUS = 96;
/** 群れの鹿がプレイヤーの周りを回る半径。 */
export const ORBIT_RADIUS = 17;
/** 群れの鹿の寄る速さ[px/s]。 */
export const SWARM_SPEED = 130;

/**
 * 鹿にぶつかったとき、せんべいを持っていれば1枚渡して事なきを得る。
 * ボタンも狙いも要らない——**接触がそのまま給餌**。
 * 持っているあいだだけ、避けゲーが「当てにいくゲーム」に反転する。
 */
export const FEED_SCORE = 260;
export const FEED_GAUGE = 0.18;
/** 続けて渡すと倍率が乗る。あげる楽しさはここ。 */
export const FEED_CHAIN_WINDOW = 1.8;
export const FEED_CHAIN_STEP = 0.25;
export const FEED_CHAIN_MAX = 3.0;

// ---- 鹿の群れ ----

/** 一緒に歩いてくる群れの頭数。レベルで増える。 */
export function herdSize(dist: number): number {
  return 2 + Math.min(4, Math.floor(levelOf(dist) / 2));
}
/** 出る鹿のうち、群れである割合。 */
export function herdShare(dist: number): number {
  return levelOf(dist) < 2 ? 0 : Math.min(0.4, 0.12 + levelOf(dist) * 0.03);
}

/** 道に寝そべって塞いでいる群れ。数もレベルで増える。 */
export const UNLOCK_SLEEPERS = 3;
export function sleeperRate(dist: number): number {
  if (levelOf(dist) < UNLOCK_SLEEPERS) return 0;
  return Math.min(0.09, 0.02 + levelOf(dist) * 0.006);
}
export function sleeperSize(dist: number): number {
  return 3 + Math.min(5, Math.floor(levelOf(dist) / 2));
}

/** せんべいを持った観光客と、それに群がる鹿。まるごと障害物。 */
export const UNLOCK_FEEDING_SCENE = 4;
export const FEEDING_SCENE_INTERVAL_MIN = 9;
export const FEEDING_SCENE_INTERVAL_MAX = 17;
export function sceneDeer(dist: number): number {
  return 5 + Math.min(4, Math.floor(levelOf(dist) / 2));
}
/** 餌やり場の鹿が観光客のまわりを回る半径。 */
export const SCENE_RADIUS = 19;

// ---- 関所：道を塞ぐようにフンを敷く ----

/**
 * 関所。参道いっぱいにフンを敷き、1〜2箇所だけ穴を開ける。
 *
 * 最初は「回廊のところに穴を開ける」実装にしていたが、それだと
 * **関所が「安全な道はここです」という看板**になってしまい、逆効果だった。
 * いまは順序が逆で、**先に穴の位置を決めて、回廊をそこへ寄せる**。
 * 穴は「今の回廊」ではなく「これから回廊が向かう先」なので、
 * 遠くの穴を見て前もって寄せておく、という操作を要求できる。
 */
export const UNLOCK_BARRIER = 2;
export function barrierRate(dist: number): number {
  if (levelOf(dist) < UNLOCK_BARRIER) return 0;
  return Math.min(0.045, 0.012 + levelOf(dist) * 0.004);
}
/** 関所の隙間は回廊よりすこし広く開ける。ぴったりだと通り抜けの余地が無い。 */
export const BARRIER_GAP_EXTRA = 8;
/** 関所は何行ぶんの厚みで敷くか。薄いと壁に見えない。 */
export const BARRIER_ROWS = 3;

// ---- 木（通れない） ----

export const TREE_BOX = { w: 26, h: 30, hitX: 4, hitY: 7, hitW: 18, hitH: 18 } as const;

/** 1行あたりに木を置く確率。 */
export function treeRate(dist: number): number {
  if (levelOf(dist) < UNLOCK.tree) return 0;
  return Math.min(0.42, 0.14 + (dist - (UNLOCK.tree - 1) * LEVEL_M) / 3000);
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

/**
 * プレイヤー。v0.11 で 12×16 から一回り大きくした。
 * 参道208pxに対して12pxは小さすぎて、避けている実感が薄かった。
 * 当たり判定は足元だけ、という方針は変えない（体でぶつかると理不尽になる）。
 */
export const PLAYER = { w: 16, h: 22, hitX: 3, hitY: 14, hitW: 10, hitH: 7 } as const;
export const DEER_BOX = { w: 16, h: 18, hitX: 2, hitY: 8, hitW: 12, hitH: 10 } as const;

/**
 * 寝ている鹿の**絵**の位置と大きさ（`d.x + dx`, `d.y + dy` から w×h）。
 * 寝姿は立ち姿より低く、下に寄せて描いている。
 *
 * 当たり判定（DEER_BOX.hit*）と別に持っているのは、
 * フンを退かすのに要るのが**見た目の四角**だからで、当たり判定ではない。
 * 当たり判定だけ避けても、フンが鹿の背中から生えて見える。
 * ここと render.ts の描画位置がずれると、また鹿とフンが重なる。
 */
export const SLEEPER_ART = { dx: 0, dy: 4, w: 16, h: 10 } as const;
export const PELLET = { w: 4, h: 4 } as const;
export const BIG_PELLET = { w: 7, h: 7 } as const;

// ---- グレイズ（フンのすぐそばを通る） ----

export const GRAZE_PAD = 5;
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
