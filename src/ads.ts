/**
 * 広告。実体は React Native 側（`native/ads.ts`）にあり、ここはその呼び口。
 * ブラウザでは全部が無害な空振りになる。
 *
 * 出す形を2つに絞ってある。**バナーは出さない。**
 *
 *   リワード動画 … ゲームオーバーから「見て つづける」。1回のプレイにつき1度だけ
 *   インタースティシャル … 何回かに1度、結果画面を閉じたあとに全画面で出す
 *
 * バナーを外したのは収益を捨てたからではなく、置く場所が無いから。
 * この画面は上段が参道、下段が操作パッドで、余白は最初から存在しない。
 * 参道に被せれば避けゲーが成立せず、パッドに被せれば操作を奪う。
 * どちらも「広告のせいで下手になる」体験になり、結局アンインストールされる。
 *
 * かわりにリワード動画を主役にした。プレイヤーが自分で見ると決めて見るので、
 * 単価がいちばん高く、しかも「もう1回やりたい」という気持ちと利害が一致する。
 *
 * 出す頻度の判断（何回に1回か）はここに置いてある。
 * ネイティブ側は「読み込めているか」「見せろ」だけを扱う。
 */

import * as C from "./config";
import { ask, inNative, on, send } from "./native";

/** インタースティシャルを出す間隔。短いと必ず嫌われる。 */
const INTERSTITIAL_EVERY_N_RUNS = 3;
const INTERSTITIAL_MIN_GAP_S = 120;

let started = false;
let rewardedReady = false;
let runsSinceInterstitial = 0;
let lastInterstitialAt = 0;

on("ads:ready", (v) => {
  rewardedReady = !!(v as { rewarded?: boolean } | null)?.rewarded;
});

/** ネイティブでだけ広告を出す。ブラウザやアーティファクトでは常に false。 */
export function adsSupported(): boolean {
  return inNative();
}

/**
 * 初期化。**起動時には呼ばない。**
 *
 * 起動直後にATT（トラッキング許可）のダイアログを出すと、
 * まだ何のアプリか分からないまま判断させることになって、ほぼ拒否される。
 * 1回遊んでもらったあとに呼ぶ（`main.ts` の `finishRun`）。
 * 拒否されても広告は出る——パーソナライズされないだけで、収益がゼロになるわけではない。
 */
export async function initAds(): Promise<boolean> {
  if (!inNative() || started) return started;
  started = (await ask<boolean>("ads:init")) === true;
  return started;
}

/**
 * 「見て つづける」を出せる状態か。
 * ボタンを出すかどうかの判断に使う——押してから「読み込めませんでした」は最悪なので、
 * **読み込めているときにしかボタンを出さない。**
 */
export function canOfferContinue(): boolean {
  return started && rewardedReady;
}

/**
 * リワード動画を見せる。最後まで見たら true。
 * 途中で閉じられたら false。呼び出し側は true のときだけ復活させること。
 */
export async function showContinueAd(): Promise<boolean> {
  if (!canOfferContinue()) return false;
  rewardedReady = false; // 見せたぶんは消える。次のぶんはネイティブが読み直す
  return (await ask<boolean>("ads:rewarded")) === true;
}

/**
 * プレイが1回終わったことを伝える。
 * 規定の回数と間隔を満たしていれば全画面広告を出す。満たしていなければ何もしない。
 *
 * 「毎回出す」は短期の売上を最大にして、長期の売上をゼロにする。
 */
export async function runFinished(): Promise<void> {
  if (!started) return;
  runsSinceInterstitial++;

  const now = Date.now() / 1000;
  if (runsSinceInterstitial < INTERSTITIAL_EVERY_N_RUNS) return;
  if (now - lastInterstitialAt < INTERSTITIAL_MIN_GAP_S) return;

  runsSinceInterstitial = 0;
  lastInterstitialAt = now;
  await ask<boolean>("ads:interstitial");
}

/** ゲーム側の状態が変わったことをネイティブへ知らせる（起動画面を消す合図など）。 */
export function tellNative(kind: string): void {
  send(kind);
}

/**
 * 復活の中身。汚れを満タンから減らして、少しの無敵をつけて再開する。
 *
 * 全快にしないのが肝。全快だと動画1本でプレイが実質2回ぶんになり、
 * ランキングが「動画を何本見たか」の記録になってしまう。
 * 1回のプレイにつき1度だけなのも同じ理由。
 */
export const CONTINUE_DIRT = Math.max(1, C.DIRT_MAX - 2);
export const CONTINUE_INV = 2.2;
