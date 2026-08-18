/**
 * 広告のネイティブ側。
 *
 * ここは「読み込む」「見せる」だけを持つ。
 * 何回に1回出すかといった方針は web 側（`src/ads.ts`）にある——
 * 遊びの都合なので、遊びのコードと同じ場所に置きたい。
 *
 * **Expo Go では広告モジュールそのものが入っていない。**
 * だから型だけを `import type` で取り（コンパイル時に消える）、
 * 実体は init() の中で require する。
 * これを上で普通に import すると、**Expo Go は起動した瞬間に落ちる。**
 * Expo Go でゲームを触れることのほうが、広告より優先度が高い。
 */

import type {
  AdEventType as AdEventTypeT,
  InterstitialAd as InterstitialAdT,
  RewardedAd as RewardedAdT,
} from "react-native-google-mobile-ads";

/** 実体。Expo Go では最後まで null のまま。 */
type Sdk = typeof import("react-native-google-mobile-ads");
let sdk: Sdk | null = null;

/**
 * 広告ユニットID。
 *
 * 差し替えるまでは Google のテストIDで動く（`TestIds`）。
 * **本番のIDは AdMob の管理画面で作って、ここを置き換える。**
 *
 * 自分の端末で実IDの広告を触ると、Google に無効なトラフィックとみなされて
 * アカウントごと停止されることがある。動作確認は必ずテストIDで。
 */
const REAL_UNITS = {
  /** ゲームオーバーからの復活。 */
  rewarded: "ca-app-pub-0000000000000000/0000000000",
  /** 結果画面のあと。 */
  interstitial: "ca-app-pub-0000000000000000/0000000000",
  /**
   * 画面のいちばん上に出しっぱなしのバナー。
   *
   * **置き場所を画面の最上部に決めたのは、そこだけが指の来ない場所だから。**
   * 操作パッドは画面の下半分にあり、親指はその中で動く。
   * パッドの近くに置くと誤タップが増え、Google に無効なトラフィックと
   * 判断されてアカウントごと止まりうる。単価より先に守るものがそこにある。
   */
  banner: "ca-app-pub-0000000000000000/0000000000",
};

/** 差し替え前のダミーかどうか。ダミーのあいだはテストIDで動かす。 */
const PLACEHOLDER = /^ca-app-pub-0{16}/;
export const USING_TEST_ADS = __DEV__ || PLACEHOLDER.test(REAL_UNITS.rewarded);

function unit(kind: keyof typeof REAL_UNITS): string {
  if (!sdk) return "";
  if (!USING_TEST_ADS) return REAL_UNITS[kind];
  const t = sdk.TestIds;
  return kind === "rewarded" ? t.REWARDED : kind === "interstitial" ? t.INTERSTITIAL : t.ADAPTIVE_BANNER;
}

let started = false;
let npa = true;

let rewarded: RewardedAdT | null = null;
let rewardedLoaded = false;
let interstitial: InterstitialAdT | null = null;
let interstitialLoaded = false;

/** リワードの読み込み状態が変わったら web 側へ知らせる（ボタンの出し分けに使う）。 */
let onReadyChange: (ready: boolean) => void = () => {};
export function setReadyListener(fn: (ready: boolean) => void): void {
  onReadyChange = fn;
}

/** バナーを描くのに要るもの。Expo Go では null（＝バナーは出ない）。 */
export function banner(): { Ad: Sdk["BannerAd"]; size: string; unitId: string; npa: boolean } | null {
  if (!sdk || !started) return null;
  return {
    Ad: sdk.BannerAd,
    size: sdk.BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
    unitId: unit("banner"),
    npa,
  };
}

/**
 * 同意（EU/UK の GDPR）とトラッキング許可を取ってから初期化する。
 * どちらも失敗しても広告は出す。パーソナライズされないだけ。
 */
export async function init(): Promise<boolean> {
  if (started) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sdk = require("react-native-google-mobile-ads") as Sdk;
  } catch {
    return false; // Expo Go。広告なしで遊べればよい
  }
  const S = sdk;
  if (!S?.default) return false;

  try {
    try {
      const info = await S.AdsConsent.requestInfoUpdate();
      if (info.isConsentFormAvailable && info.status === S.AdsConsentStatus.REQUIRED) {
        const after = await S.AdsConsent.showForm();
        npa = after.status !== S.AdsConsentStatus.OBTAINED;
      } else {
        npa = info.status === S.AdsConsentStatus.REQUIRED;
      }
    } catch {
      npa = true;
    }

    await S.default().setRequestConfiguration({
      // 4+ のゲームなので、広告の中身も全年齢向けに制限する。
      // ここを緩めると単価は上がるが、審査で問題になりうる内容が混ざる。
      maxAdContentRating: S.MaxAdContentRating.G,
      tagForUnderAgeOfConsent: false,
    });
    await S.default().initialize();

    started = true;
    loadRewarded();
    loadInterstitial();
    return true;
  } catch (e) {
    console.warn("広告の初期化に失敗（広告なしで続行）", e);
    return false;
  }
}

function loadRewarded(): void {
  if (!sdk) return;
  const S = sdk;
  rewardedLoaded = false;
  onReadyChange(false);
  rewarded = S.RewardedAd.createForAdRequest(unit("rewarded"), {
    requestNonPersonalizedAdsOnly: npa,
  });
  rewarded.addAdEventListener(S.RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
    onReadyChange(true);
  });
  rewarded.addAdEventListener(S.AdEventType.ERROR as AdEventTypeT.ERROR, () => {
    rewardedLoaded = false;
    onReadyChange(false);
  });
  rewarded.load();
}

function loadInterstitial(): void {
  if (!sdk) return;
  const S = sdk;
  interstitialLoaded = false;
  interstitial = S.InterstitialAd.createForAdRequest(unit("interstitial"), {
    requestNonPersonalizedAdsOnly: npa,
  });
  interstitial.addAdEventListener(S.AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  interstitial.addAdEventListener(S.AdEventType.ERROR, () => {
    interstitialLoaded = false;
  });
  interstitial.load();
}

/**
 * リワード動画を見せる。**最後まで見たときだけ true。**
 * 閉じられた時点で決着させ、次のぶんを読み込み直す。
 */
export function showRewarded(): Promise<boolean> {
  const ad = rewarded;
  const S = sdk;
  if (!started || !ad || !S || !rewardedLoaded) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let earned = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(earned);
      loadRewarded(); // 次のぶんを用意する
    };

    ad.addAdEventListener(S.RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    ad.addAdEventListener(S.AdEventType.CLOSED, finish);
    ad.addAdEventListener(S.AdEventType.ERROR, finish);

    try {
      ad.show();
    } catch {
      finish();
    }
  });
}

/** 全画面広告を見せる。読み込めていなければ何もしない。 */
export function showInterstitial(): Promise<boolean> {
  const ad = interstitial;
  const S = sdk;
  if (!started || !ad || !S || !interstitialLoaded) {
    if (started) loadInterstitial();
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (shown: boolean) => {
      if (settled) return;
      settled = true;
      resolve(shown);
      loadInterstitial();
    };
    ad.addAdEventListener(S.AdEventType.CLOSED, () => finish(true));
    ad.addAdEventListener(S.AdEventType.ERROR, () => finish(false));
    try {
      ad.show();
    } catch {
      finish(false);
    }
  });
}
