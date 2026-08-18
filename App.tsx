/**
 * アプリの入れ物。
 *
 * 中身は WebView 1枚だけ。ゲームは web アプリのまま `native/game-html.ts` に
 * 1枚のHTMLとして畳んであり、それを文字列で渡している。
 * 通信もファイル読み込みも無いので、機内モードでも起動する。
 *
 * このファイルの仕事は3つ。
 *   1. 保存済みの記録を、ゲームが読む前に流し込む
 *   2. ゲームからの「広告を出して」を受けて、ネイティブの広告を出す
 *   3. ゲームからの「これを保存して」を受けて、AsyncStorage に写す
 *   4. 画面のいちばん上にバナーを出す
 *
 * バナーを**最上部**に置いているのは、そこだけが指の来ない場所だから。
 * 操作パッドは画面の下半分にあって、親指はその中で動く。
 * パッドの近くに置くと誤タップが増え、Google に無効なトラフィックと
 * 判断されてアカウントごと止まりうる。単価より先に守るものがそこにある。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StatusBar, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as SplashScreen from "expo-splash-screen";

import { GAME_HTML } from "./native/game-html";
import * as ads from "./native/ads";
import * as store from "./native/store";

/** ゲーム画面の地面と同じ色。読み込み中に白が一瞬出るのを防ぐ。 */
const GRAVEL = "#c9c2a6";
const INK = "#181a14";

void SplashScreen.preventAutoHideAsync();

interface Incoming {
  t: string;
  id?: number;
  data?: unknown;
}

export default function App() {
  const web = useRef<WebView>(null);
  const [seeded, setSeeded] = useState<store.Saved | null>(null);
  /**
   * バナーは広告の初期化が済んでから出す。
   * 起動していきなり広告が出ていると、何のアプリか分かる前に判断されてしまう。
   * 初期化は1回遊び終えたあと（web 側の finishRun）なので、
   * バナーが現れるのは最初のリザルト画面が出ている最中——ゲーム中には動かない。
   */
  const [bannerOn, setBannerOn] = useState(false);

  // 保存済みの記録を読む。読み終わるまで WebView を作らない——
  // ゲームは起動時に同期で記録を読むので、間に合わせるにはこの順でないと駄目。
  useEffect(() => {
    let alive = true;
    void store.loadAll().then((saved) => {
      if (!alive) return;
      store.seed(saved);
      setSeeded(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** web 側の待っている Promise を解く。 */
  const reply = useCallback((id: number | undefined, value: unknown) => {
    if (id === undefined) return;
    web.current?.injectJavaScript(
      `window.__mtd_native && window.__mtd_native.resolve(${id}, ${JSON.stringify(value)}); true;`,
    );
  }, []);

  /** 一方通行の通知を web 側へ送る。 */
  const push = useCallback((kind: string, value: unknown) => {
    web.current?.injectJavaScript(
      `window.__mtd_native && window.__mtd_native.push(${JSON.stringify(kind)}, ${JSON.stringify(value)}); true;`,
    );
  }, []);

  useEffect(() => {
    ads.setReadyListener((ready) => push("ads:ready", { rewarded: ready }));
  }, [push]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: Incoming;
      try {
        msg = JSON.parse(e.nativeEvent.data) as Incoming;
      } catch {
        return; // WebView からは素の文字列も飛んでくる。無視してよい
      }

      switch (msg.t) {
        case "ads:init":
          void ads.init().then((ok) => {
            if (ok) setBannerOn(true);
            reply(msg.id, ok);
          });
          break;
        case "ads:rewarded":
          void ads.showRewarded().then((earned) => reply(msg.id, earned));
          break;
        case "ads:interstitial":
          void ads.showInterstitial().then((shown) => reply(msg.id, shown));
          break;
        case "store:set": {
          const d = msg.data as { key?: string; json?: string } | undefined;
          if (d?.key && typeof d.json === "string") store.set(d.key, d.json);
          break;
        }
        default:
          break;
      }
    },
    [reply],
  );

  if (!seeded) return <View style={styles.root} />;

  // ゲームが動き出す前に、保存済みの値を window に置いておく。
  // localStorage ではなく素のオブジェクトにしているのは、
  // WebView の localStorage が使えない場合でも読めるようにするため。
  const before = `window.__mtd_saved = ${JSON.stringify(seeded)}; true;`;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {bannerOn && (
        <View style={styles.banner}>
          <ads.BannerAd
            unitId={ads.BANNER_UNIT}
            size={ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={ads.bannerRequest()}
          />
        </View>
      )}
      <WebView
        ref={web}
        style={styles.web}
        containerStyle={styles.web}
        source={{ html: GAME_HTML, baseUrl: "https://mind-the-deer.local/" }}
        originWhitelist={["*"]}
        injectedJavaScriptBeforeContentLoaded={before}
        onMessage={onMessage}
        onLoadEnd={() => void SplashScreen.hideAsync()}
        // 全画面固定のゲーム。跳ねたり拡大したりすると避けゲーが壊れる。
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        // 音を鳴らすのにユーザー操作を要求されないようにする（起動時に unlock する）
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // 参道の外へ出ていく先は無い。リンクも外部遷移も要らない。
        javaScriptCanOpenWindowsAutomatically={false}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith("https://mind-the-deer.local")}
        // Android の WebView でも canvas を GPU に乗せる
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  web: { flex: 1, backgroundColor: GRAVEL },
  banner: { alignItems: "center", backgroundColor: INK },
});
