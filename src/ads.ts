/**
 * 広告。iOS（Capacitor）でだけ動き、ブラウザでは全部が無害な空振りになる。
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
 */

import { Capacitor } from "@capacitor/core";
import * as C from "./config";

/**
 * 広告ユニットID。
 *
 * 既定値は **Google が公開しているテスト用ID**。実IDを入れる前でも動作確認ができる。
 * 本番のIDは AdMob の管理画面で作って、ここを置き換える。
 * **テストIDのまま提出しないこと**（収益が発生しないし、審査でも落ちる）。
 *
 * 自分の端末で実IDの広告を触ると、Google に無効なトラフィックとみなされて
 * アカウントごと停止されることがある。動作確認は必ずテストIDで。
 */
export const AD_UNITS = {
  /** ゲームオーバーからの復活。 */
  rewarded: "ca-app-pub-3940256099942544/1712485313",
  /** 結果画面のあと。 */
  interstitial: "ca-app-pub-3940256099942544/4411468910",
} as const;

/** テストIDのままかどうか。ここが true のあいだは実収益にならない。 */
export const USING_TEST_ADS = AD_UNITS.rewarded.startsWith("ca-app-pub-3940256099942544");

/** インタースティシャルを出す間隔。短いと必ず嫌われる。 */
const INTERSTITIAL_EVERY_N_RUNS = 3;
const INTERSTITIAL_MIN_GAP_S = 120;

type AdMobModule = typeof import("@capacitor-community/admob");

let mod: AdMobModule | null = null;
let ready = false;
let starting: Promise<boolean> | null = null;

/** 同意が取れていない＝パーソナライズなしで出す。出さないのではない。 */
let nonPersonalized = true;

let rewardedLoaded = false;
let interstitialLoaded = false;
let runsSinceInterstitial = 0;
let lastInterstitialAt = 0;

/** ネイティブでだけ広告を出す。ブラウザやアーティファクトでは常に false。 */
export function adsSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 初期化。**起動時には呼ばない。**
 *
 * 起動直後にATTの許可ダイアログを出すと、まだ何のアプリか分からないまま
 * 判断させることになって、ほぼ拒否される。1回遊んでもらったあとに呼ぶ。
 */
export async function initAds(): Promise<boolean> {
  if (!adsSupported()) return false;
  if (ready) return true;
  if (starting) return starting;

  starting = (async () => {
    try {
      mod = await import("@capacitor-community/admob");
      const { AdMob, AdmobConsentStatus } = mod;

      // EU/UK では同意の取得が必須。UMP のフォームは Google 側が出してくれる。
      try {
        const info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
          const after = await AdMob.showConsentForm();
          nonPersonalized = after.status !== AdmobConsentStatus.OBTAINED;
        } else {
          nonPersonalized = info.status === AdmobConsentStatus.REQUIRED;
        }
      } catch {
        // 同意まわりで失敗しても、広告そのものは出す（パーソナライズなしで）
        nonPersonalized = true;
      }

      // iOS 14以降のトラッキング許可。拒否されても広告は出る（単価が下がるだけ）。
      try {
        const { status } = await AdMob.trackingAuthorizationStatus();
        if (status === "notDetermined") await AdMob.requestTrackingAuthorization();
      } catch {
        /* iOS 14未満などでは無い。無視してよい */
      }

      await AdMob.initialize({ initializeForTesting: false });
      ready = true;
      void preload();
      return true;
    } catch (e) {
      console.warn("広告の初期化に失敗（広告なしで続行）", e);
      return false;
    } finally {
      starting = null;
    }
  })();

  return starting;
}

/** 次に出すぶんを先に読み込んでおく。見せる瞬間に読み始めると数秒待たされる。 */
async function preload(): Promise<void> {
  if (!ready || !mod) return;
  const { AdMob } = mod;
  const opts = { isTesting: USING_TEST_ADS, npa: nonPersonalized };

  if (!rewardedLoaded) {
    try {
      await AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded, ...opts });
      rewardedLoaded = true;
    } catch {
      rewardedLoaded = false;
    }
  }
  if (!interstitialLoaded) {
    try {
      await AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, ...opts });
      interstitialLoaded = true;
    } catch {
      interstitialLoaded = false;
    }
  }
}

/**
 * 「見て つづける」を出せる状態か。
 * ボタンを出すかどうかの判断に使う——押してから「読み込めませんでした」は最悪なので、
 * 読み込めているときにしかボタンを出さない。
 */
export function canOfferContinue(): boolean {
  return ready && rewardedLoaded;
}

/**
 * リワード動画を見せる。最後まで見たら true。
 * 呼び出し側は true のときだけ復活させること（途中で閉じたら false）。
 */
export async function showContinueAd(): Promise<boolean> {
  if (!ready || !mod || !rewardedLoaded) return false;
  const { AdMob } = mod;
  rewardedLoaded = false;
  try {
    const reward = await AdMob.showRewardVideoAd();
    void preload();
    return !!reward;
  } catch {
    void preload();
    return false;
  }
}

/**
 * プレイが1回終わったことを伝える。
 * 規定の回数と間隔を満たしていれば全画面広告を出す。満たしていなければ何もしない。
 *
 * 「毎回出す」は短期の売上を最大にして、長期の売上をゼロにする。
 * 3回に1回、かつ前回から2分以上あけている。
 */
export async function runFinished(): Promise<void> {
  if (!ready || !mod) return;
  runsSinceInterstitial++;

  const now = Date.now() / 1000;
  if (runsSinceInterstitial < INTERSTITIAL_EVERY_N_RUNS) return;
  if (now - lastInterstitialAt < INTERSTITIAL_MIN_GAP_S) return;
  if (!interstitialLoaded) {
    void preload();
    return;
  }

  interstitialLoaded = false;
  runsSinceInterstitial = 0;
  lastInterstitialAt = now;
  try {
    await mod.AdMob.showInterstitial();
  } catch {
    /* 出せなくても遊びは止めない */
  }
  void preload();
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
