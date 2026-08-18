/**
 * 広告のネイティブ側。
 *
 * ここは「読み込む」「見せる」だけを持つ。
 * 何回に1回出すかといった方針は web 側（`src/ads.ts`）にある——
 * 遊びの都合なので、遊びのコードと同じ場所に置きたい。
 *
 * **Expo Go では動かない。** ネイティブモジュールなので、
 * `eas build --profile development` で作った Dev Client が要る。
 * Expo Go でもゲームそのものは遊べる（広告が出ないだけ）。
 */

import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentStatus,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

export { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

/**
 * 広告ユニットID。
 *
 * 開発中は Google のテストIDを使う（`TestIds`）。
 * **本番のIDは AdMob の管理画面で作って下の定数に入れる。**
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
   * バナーをパッドの近くに置くと、誤タップが増える。
   * 誤タップは Google に無効なトラフィックと判断され、
   * 最悪アカウントごと止まる——単価より先に守るべきものがそこにある。
   */
  banner: "ca-app-pub-0000000000000000/0000000000",
};

/** 差し替え前のダミーかどうか。ダミーのあいだはテストIDで動かす。 */
const PLACEHOLDER = /^ca-app-pub-0{16}/;
const useTest = __DEV__ || PLACEHOLDER.test(REAL_UNITS.rewarded);

const UNITS = {
  rewarded: useTest ? TestIds.REWARDED : REAL_UNITS.rewarded,
  interstitial: useTest ? TestIds.INTERSTITIAL : REAL_UNITS.interstitial,
  banner: useTest ? TestIds.ADAPTIVE_BANNER : REAL_UNITS.banner,
};

export const BANNER_UNIT = UNITS.banner;

/** バナーの広告リクエスト設定。同意が取れていなければパーソナライズしない。 */
export function bannerRequest(): { requestNonPersonalizedAdsOnly: boolean } {
  return { requestNonPersonalizedAdsOnly: npa };
}

export const USING_TEST_ADS = useTest;

let started = false;
let npa = true;

let rewarded: RewardedAd | null = null;
let rewardedLoaded = false;
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;

/** リワードの読み込み状態が変わったら web 側へ知らせる（ボタンの出し分けに使う）。 */
let onReadyChange: (ready: boolean) => void = () => {};
export function setReadyListener(fn: (ready: boolean) => void): void {
  onReadyChange = fn;
}

/**
 * 同意（EU/UK の GDPR）とトラッキング許可を取ってから初期化する。
 * どちらも失敗しても広告は出す。パーソナライズされないだけ。
 */
export async function init(): Promise<boolean> {
  if (started) return true;
  try {
    try {
      const info = await AdsConsent.requestInfoUpdate();
      if (info.isConsentFormAvailable && info.status === AdsConsentStatus.REQUIRED) {
        const after = await AdsConsent.showForm();
        npa = after.status !== AdsConsentStatus.OBTAINED;
      } else {
        npa = info.status === AdsConsentStatus.REQUIRED;
      }
    } catch {
      npa = true;
    }

    await mobileAds().setRequestConfiguration({
      // 4+ のゲームなので、広告の中身も全年齢向けに制限する。
      // ここを緩めると単価は上がるが、審査で問題になりうる内容が混ざる。
      maxAdContentRating: MaxAdContentRating.G,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();

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
  rewardedLoaded = false;
  onReadyChange(false);
  rewarded = RewardedAd.createForAdRequest(UNITS.rewarded, {
    requestNonPersonalizedAdsOnly: npa,
  });
  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
    onReadyChange(true);
  });
  rewarded.addAdEventListener(AdEventType.ERROR, () => {
    rewardedLoaded = false;
    onReadyChange(false);
  });
  rewarded.load();
}

function loadInterstitial(): void {
  interstitialLoaded = false;
  interstitial = InterstitialAd.createForAdRequest(UNITS.interstitial, {
    requestNonPersonalizedAdsOnly: npa,
  });
  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  interstitial.addAdEventListener(AdEventType.ERROR, () => {
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
  if (!started || !ad || !rewardedLoaded) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let earned = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(earned);
      loadRewarded(); // 次のぶんを用意する
    };

    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    ad.addAdEventListener(AdEventType.CLOSED, finish);
    ad.addAdEventListener(AdEventType.ERROR, finish);

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
  if (!started || !ad || !interstitialLoaded) {
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
    ad.addAdEventListener(AdEventType.CLOSED, () => finish(true));
    ad.addAdEventListener(AdEventType.ERROR, () => finish(false));
    try {
      ad.show();
    } catch {
      finish(false);
    }
  });
}
