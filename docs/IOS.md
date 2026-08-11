# App Store に出すまで

このリポジトリには **iOS の足場はすべて入っている**。
足りないのは、人にしかできない手続き（Apple と Google のアカウント）と、
**macOS でのビルド**。ここではその両方を順に書く。

---

## 0. まず知っておくべき制約

| | |
|---|---|
| **Mac が要る** | `.ipa` を作れるのは macOS + Xcode だけ。Linux でも Windows でもできない。手元に Mac が無い場合は §5 のクラウドビルドを使う |
| **年 99 USD** | Apple Developer Program。これを払わないと実機に入れることすらできない（TestFlight も App Store も） |
| **審査に数日** | 初回は1〜2週間見ておく。差し戻しは1回で済まないのが普通 |
| **AdMob の審査も別にある** | アプリが公開されてからでないと、実広告が配信され始めないことがある |

---

## 1. アカウントを作る（人にしかできない）

### Apple

1. [Apple Developer Program](https://developer.apple.com/programs/) に登録（年 99 USD）
   - **個人 と 法人 で審査の重さが違う。** 個人なら本人確認だけで数日
   - 個人で登録すると、App Store の販売者名が**本名**になる。屋号を出したいなら法人（D-U-N-S番号が要る）
2. [App Store Connect](https://appstoreconnect.apple.com/) で **App を新規作成**
   - バンドルID は `capacitor.config.ts` の `appId` と**完全に一致**させる
   - いまの値は `com.mindthedeer.app`。独自ドメインを持っているならそれを逆順にして置き換える
   - **一度提出したバンドルIDは変えられない**

### Google（広告）

1. [AdMob](https://admob.google.com/) にアカウントを作る
2. 「アプリを追加」→ iOS →「まだ App Store に公開していない」を選ぶ
3. 出てきた **アプリID**（`ca-app-pub-XXXXXXXX~YYYYYYYY`）を
   `ios/App/App/Info.plist` の `GADApplicationIdentifier` に入れる
4. 広告ユニットを2つ作る
   - **リワード**（動画を見て復活）
   - **インタースティシャル**（結果画面のあと）
5. それぞれのユニットID（`ca-app-pub-XXXXXXXX/ZZZZZZZZ`）を `src/ads.ts` の `AD_UNITS` に入れる
6. AdMob の「アプリの設定」で **SKAdNetwork の一覧**を確認し、
   [公開されているリスト](https://developers.google.com/admob/ios/data-disclosure#skadnetwork)を
   `Info.plist` の `SKAdNetworkItems` に貼る（**推測で書かない**。1文字違うと黙って効かなくなる）
7. 支払い情報を登録する。**これを忘れると、表示はされても振り込まれない**

> **自分の端末で実広告を触らないこと。** Google に無効なトラフィックと判断されると
> アカウントごと止まる。動作確認は必ずテストID（既定値）のままで行う。

---

## 2. 手元でビルドする（Mac がある場合）

```bash
npm install
npm run icons        # アイコンと起動画面を描き出す
npm run ios:sync     # ビルド → dist を iOS プロジェクトへ同期
npm run ios:open     # Xcode が開く
```

Xcode でやること:

1. **App ターゲット → Signing & Capabilities**
   - Team を自分の Apple Developer アカウントに
   - 「Automatically manage signing」を入れる
2. **General → Identity**
   - Version（`1.0.0`）と Build（`1`）。**アップロードのたびに Build を上げる**
3. `PrivacyInfo.xcprivacy` がターゲットに含まれているか確認
   （Build Phases → Copy Bundle Resources に無ければ足す。**無いとアップロードで弾かれる**）
4. 実機を繋いで ⌘R。**シミュレータでは広告が出ない**ので実機で確認する
5. Product → Archive → Distribute App → App Store Connect

`npx cap sync ios` は **web の変更を iOS に反映するコマンド**。
`src/` を触ったら毎回走らせる。忘れると古い画面がそのまま入る。

---

## 3. 提出前に必ず通すもの

```bash
npm run verify   # 設計の主張を実ブラウザで実測する。落ちたまま出さない
```

そのうえで手で確認する:

- [ ] `src/ads.ts` の `AD_UNITS` が**テストIDのままでない**（`USING_TEST_ADS` が false）
- [ ] `Info.plist` の `GADApplicationIdentifier` が自分のアプリIDになっている
- [ ] 実機で「見て つづける」が出て、動画を最後まで見ると復活する
- [ ] 途中で閉じたら復活**しない**
- [ ] 機内モードで起動しても遊べる（広告が無くてもゲームは止まらない）
- [ ] ATT のダイアログが**起動直後ではなく**1回遊んだあとに出る

---

## 4. App Store Connect に入れる情報

`store/metadata.md` に下書きがある。とくに間違えやすいのは次の3つ。

### 年齢制限（レーティング）

**4+ にする。ただし「キッズ」カテゴリには入れない。**

これは重要な分かれ道で、キッズカテゴリに入れると
**AdMob のような第三者の広告SDKが事実上使えなくなる**
（Apple は人の目で審査された広告しか認めず、行動ターゲティングも禁止）。
広告収入を前提にするなら、キッズカテゴリは選ばない。
「ゲーム > アーケード」で 4+、が現実的な置き場所。

### App のプライバシー

`ios/App/App/PrivacyInfo.xcprivacy` と**同じ内容を答える**。食い違うと差し戻される。

- データの収集: **はい**（広告のため）
- 収集する項目: 識別子（デバイスID）、使用状況データ（広告データ）、おおよその位置
- トラッキング: **はい**

### プライバシーポリシーのURL（必須）

広告を出すアプリは URL の入力が必須。`store/privacy-policy.md` を
GitHub Pages などで公開して、その URL を入れる。

---

## 5. Mac が無い場合：GitHub Actions でビルドする

`.github/workflows/ios.yml` を入れてある。macOS のランナーで `.ipa` を作り、
TestFlight まで上げる。**手元に Mac が無くても提出できる。**

必要なシークレット（リポジトリの Settings → Secrets and variables → Actions）:

| シークレット | 中身 |
|---|---|
| `IOS_CERT_P12_BASE64` | 配布証明書(.p12) を `base64 -i cert.p12` にかけた文字列 |
| `IOS_CERT_PASSWORD` | その .p12 のパスワード |
| `IOS_PROFILE_BASE64` | プロビジョニングプロファイル(.mobileprovision) の base64 |
| `APPSTORE_ISSUER_ID` | App Store Connect API キーの Issuer ID |
| `APPSTORE_KEY_ID` | 同 Key ID |
| `APPSTORE_PRIVATE_KEY` | 同 .p8 の中身そのまま |
| `IOS_TEAM_ID` | Apple Developer の Team ID（10文字） |

証明書とプロファイルの作成自体は、**一度だけ**
[Apple Developer のサイト](https://developer.apple.com/account/resources/certificates/list)
で行う必要がある（ブラウザだけで完結する。Mac は要らない）。

> プライベートリポジトリだと macOS ランナーは**分単位の消費が10倍**になる。
> 無料枠(2,000分/月)だと実質200分。ビルド1回が5〜8分なので、月に20〜30回が上限。

---

## 6. 出したあと

- **リリース初日に広告収入は出ない。** AdMob が配信を最適化するまで数日〜2週間かかる
- 数字を見るのは **eCPM ではなく ARPDAU**（1日1人あたりの売上）。
  リワード動画の視聴率と、翌日残存率のほうが効く
- 収益の桁を決めるのは広告の出し方ではなく**継続率**。
  §7 の「次にやること」はほぼ全部その話

---

## 7. 収益より先に効くもの

いま出しても遊べるが、**継続率が足りない**。広告の単価をいじるより効く順に:

1. **ステージの地形を手で作る**（いまは全部生成）。
   100面あっても中身が同じだと、5面で飽きる
2. **デイリー**（今日の参道）。同じ地形を全員が1日1回だけ遊べる。復帰理由になる
3. **実績とコレクション**（鹿を何頭に給餌した、など）。
   端末内で完結するので、サーバーが要らない
4. **Game Center のランキング**。いまは端末内だけ。他人の記録が見えると走る回数が変わる

---

*このゲームは素材ファイルを持たない。ドット絵も背景も音もアイコンも全部コードで作っている。
`npm run icons` を消さない限り、アイコンは何度でも同じものが出る。*
