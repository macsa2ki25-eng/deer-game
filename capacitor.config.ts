import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor の設定。
 *
 * このゲームは素材ファイルを持たず、ビルド出力が index.html + js だけなので、
 * webDir をそのまま同梱すれば完全オフラインで動く。サーバーは要らない。
 */
const config: CapacitorConfig = {
  /**
   * バンドルID。**App Store Connect でアプリを作る前に決めること。**
   * 一度提出すると変えられない。独自ドメインを持っているならそれを逆順にする。
   */
  appId: "com.mindthedeer.app",
  appName: "下ばっか見てると",
  webDir: "dist",

  ios: {
    /**
     * ゴムのようにバウンドするスクロールを止める。
     * 全画面固定のゲームで跳ねると、参道が上下にずれて避けゲーが壊れる。
     */
    scrollEnabled: false,
    contentInset: "never",
    /** 端末の「文字を大きく」に引きずられてUIが崩れないようにする。 */
    limitsNavigationsToAppBoundDomains: true,
  },

  plugins: {
    /**
     * 起動直後にATT（トラッキング許可）を勝手に出さない。
     * 初回プレイのあと、広告を出す直前に自分で出す（ads.ts）。
     * いきなり出すと意味が分からず拒否されやすく、eCPM が落ちる。
     */
    AdMob: {
      initializeForTesting: false,
    },
  },
};

export default config;
