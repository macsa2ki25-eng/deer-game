# App Store に出すまで（EAS Build・Mac不要）

スパイラル英文法とまったく同じ道を通る。**Mac は要らない。Windows で完結する。**
違いは2つだけ:

1. ゲーム本体は web アプリ（Canvas）で、それを WebView 1枚に載せている
2. **広告がある** → だから Expo Go だけでは足りず、Dev Client ビルドが要る

---

## 0. 前回との違い：Expo Go でできること・できないこと

| | Expo Go | Dev Client (`--profile development`) |
|---|---|---|
| ゲームを遊ぶ | **できる** | できる |
| 記録の保存（AsyncStorage） | できる | できる |
| **広告** | **出ない** | 出る |
| App Store に提出 | **できない**（プレビュー専用） | ビルドを `eas submit` で提出 |

`react-native-google-mobile-ads` はネイティブモジュールなので、
Expo Go のアプリ本体に入っていない＝呼べない。広告を確かめるには Dev Client が要る。

**遊びの調整だけなら Expo Go で十分。** 広告を触る日だけ Dev Client を使えばよい。

---

## 1. 仕組み（なぜ WebView なのか）

```
src/            ← ゲーム本体。ふつうの TypeScript + Canvas。ブラウザで開発できる
  ↓ npm run build      (Vite)
dist/           ← index.html + js
  ↓ npm run bundle     (tools/bundle-game.mjs)
native/game-html.ts    ← 1枚のHTMLに畳んだ文字列
  ↓
App.tsx         ← WebView に文字列で渡す。ファイルの同梱も通信も無い
```

素材ファイルを1つも持たない作りなので、**出力が index.html + js だけ**になる。
だから丸ごと1枚に畳めて、WebView に文字列で渡すだけで済む。

RN 側がやっているのは3つだけ。

| | |
|---|---|
| 記録 | AsyncStorage に写す。WebView の localStorage は消えることがあるので当てにしない |
| 広告 | `native/ads.ts`。読み込みと表示だけ。何回に1回出すかは `src/ads.ts`（遊びの都合なので） |
| 起動画面 | ゲームが描き終わったら消す |

`npm run dev` と `npm run verify` は RN のことを何も知らないまま動く。
`src/native.ts` がブラウザでは全部空振りになるため。

---

## 2. 初回セットアップ（一度だけ）

```bash
npm install
npm install -g eas-cli     # 入れていなければ
eas login                  # macsa2ki25 でログイン
eas init                   # app.json の extra.eas.projectId が埋まる → コミットする
```

`app.json` の `owner` は `macsa2ki25`、`eas.json` の `appleId` / `appleTeamId` は
スパイラル英文法と同じものを入れてある（`tuueri.25@gmail.com` / `PDW4QR6FSS`）。
**Apple Developer Program は前回登録済みなので、払い直しは不要。**

---

## 3. ふだんの開発

```bash
npm run dev        # ブラウザでゲームを作る。いちばん速い
npm run verify     # 設計の主張を実ブラウザで実測（フン避けが理不尽でないか）
```

ゲームを触ったら、実機に載せる前に必ず:

```bash
npm run native:sync   # build → 1枚に畳んで native/game-html.ts を作り直す
```

**これを忘れると古いゲームが入る。** `native/game-html.ts` は生成物なので
`.gitignore` に入れてある（コミットされない）。

### Expo Go で見る（広告なし）

```bash
npm run native:sync
npm run start:go      # QRコードを Expo Go で読む
```

### Dev Client で見る（広告あり）

```bash
eas build --profile development --platform ios   # 初回だけ。10〜20分
# 出てきたURLを iPhone の Safari で開いてインストール
npm run native:sync
npm start             # --dev-client 付きで起動
```

Dev Client は**ネイティブの中身が変わったときだけ**作り直す
（`package.json` のネイティブ依存や `app.json` を触ったとき）。
JS だけの変更なら作り直さなくてよい。

---

## 4. 広告のIDを本番に差し替える（人にしかできない）

いまはぜんぶ **Google のテストID** が入っている。**そのままでは1円も入らない。**

1. [AdMob](https://admob.google.com/) で「アプリを追加」→ iOS
   →「まだ App Store に公開していない」
2. 出てきた**アプリID**（`ca-app-pub-XXXX~YYYY`）を
   `app.json` の `plugins` → `react-native-google-mobile-ads` → `iosAppId` に入れる
3. 広告ユニットを2つ作る（**リワード** と **インタースティシャル**）
4. そのユニットID（`ca-app-pub-XXXX/ZZZZ`）を `native/ads.ts` の `REAL_UNITS` に入れる
5. AdMob が出している [SKAdNetwork の一覧](https://developers.google.com/admob/ios/data-disclosure#skadnetwork)を
   `app.json` の `skAdNetworkItems` に貼る
   （**推測で書かない**。1文字違うと黙って効かなくなり、広告の埋まりが落ちる）
6. AdMob に**支払い情報**を登録する。忘れると、表示されても振り込まれない
7. `app.json` を触ったので `eas build` をやり直す

> **自分の端末で実広告を触らないこと。** Google に無効なトラフィックと判断されると
> アカウントごと止まる。`native/ads.ts` はダミーIDのあいだ自動でテストIDを使うので、
> 差し替えるまでは安全。

---

## 5. TestFlight でベータ

```bash
npm run native:sync
eas build --profile preview --platform ios
eas submit --profile preview --platform ios
```

App Store Connect → TestFlight にビルドが上がる。生徒や家族に配って触ってもらう。
**広告が出るのはここから。** Dev Client でも出るが、実機の配布形態で確認したい。

---

## 6. 本番提出

```bash
npm run native:sync
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

`autoIncrement: true` なのでビルド番号は自動で上がる。
バージョン（`1.0.0`）を上げたいときは `app.json` の `version` を書き換える。

### App Store Connect で入れるもの

`store/metadata.md` に下書きがある。前回と違うのは次の3つ。

#### ① 年齢制限 — 4+、ただし「キッズ」カテゴリには**入れない**

これは重要な分かれ道。キッズカテゴリに入れると
**AdMob のような第三者の広告SDKが事実上使えなくなる**
（Apple は人の目で審査された広告しか認めず、行動ターゲティングも禁止）。
広告収入を前提にするなら選べない。「ゲーム > アーケード」で 4+ が置き場所。

#### ② App のプライバシー — 前回と答えが変わる

スパイラル英文法は「トラッキングしない・広告なし」だった。**今回は逆。**

| 項目 | 答え |
|---|---|
| データ収集の有無 | **はい**（広告のため） |
| 識別子（デバイスID / IDFA） | 収集する — 用途: **サードパーティ広告** |
| 使用状況データ（広告データ） | 収集する — 用途: **サードパーティ広告** |
| 位置情報（おおよその位置） | 収集する — 用途: **サードパーティ広告** |
| 連絡先情報・健康・財務 | 収集しない |
| **トラッキング** | **はい** |

#### ③ プライバシーポリシー

`store/privacy-policy.md` を公開して URL を入れる（広告アプリでは必須）。
`english-grammar-app-pages` と同じやり方で GitHub Pages に置けばよい。

---

## 7. 提出前チェックリスト

- [ ] `npm run verify` が全項目通過
- [ ] `npm run native:sync` を最後に走らせた（古いゲームが入っていない）
- [ ] `native/ads.ts` の `REAL_UNITS` が本番IDになっている（`USING_TEST_ADS` が false）
- [ ] `app.json` の `iosAppId` が自分の AdMob アプリID
- [ ] `skAdNetworkItems` に AdMob の一覧を貼った
- [ ] 実機で「見て つづける」が出て、動画を最後まで見ると復活する
- [ ] 途中で閉じたら復活**しない**
- [ ] 機内モードで起動しても遊べる（広告が無くてもゲームは止まらない）
- [ ] ATT のダイアログが**起動直後ではなく**1回遊んだあとに出る
- [ ] 記録がアプリを再起動しても残っている（★とランキング）
- [ ] プライバシーポリシーのURLが第三者から見られる
- [ ] スクリーンショット（6.9インチ 1320×2868 が1枚あれば足りる）

---

## 8. よくあるエラー

| 症状 | 対処 |
|---|---|
| 実機で古い画面が出る | `npm run native:sync` を忘れている |
| 広告が出ない（Expo Go） | **仕様**。Dev Client で確認する |
| 起動して真っ白 | `native/game-html.ts` が無い → `npm run bundle` |
| `bundle` が「script src が N 本」で落ちる | `src/` に動的 import を足した。畳めるのは1本のときだけ |
| ビルドが Provisioning で止まる | `eas credentials` で証明書を再生成 |
| `eas init` で「Owner not found」 | `eas login` をやり直し、`eas whoami` で確認 |
| submit で `Missing privacy policy URL` | App Store Connect 側に URL 未登録 |

---

## 9. 収益より先に効くもの

いま出しても遊べるが、**継続率が足りない**。広告の単価をいじるより効く順に:

1. **ステージの地形を手で作る**（いまは全部生成）。100面あっても中身が同じだと5面で飽きる
2. **デイリー**（今日の参道）。同じ地形を全員が1日1回。復帰理由になる
3. **実績とコレクション**（鹿を何頭に給餌した、など）。端末内で完結するのでサーバー不要
4. **Game Center のランキング**。いまは端末内だけ。他人の記録が見えると走る回数が変わる

数字を見るなら eCPM ではなく **ARPDAU**（1日1人あたりの売上）と**翌日残存率**。
