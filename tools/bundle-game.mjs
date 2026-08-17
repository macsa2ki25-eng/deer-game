/**
 * dist/ を1枚のHTMLに畳んで、React Native から読める TS モジュールにする。
 * `npm run bundle` で走る（`npm run native:sync` が先に build を呼ぶ）。
 *
 * なぜ1枚に畳むのか:
 *   WebView に `source={{ html }}` で文字列を渡せば、
 *   アプリに dist フォルダを同梱してファイルパスを解決する処理が丸ごと要らなくなる。
 *   このゲームは素材ファイルを持たず、出力が index.html + js だけなので、これができる。
 *
 * 文字列は JSON.stringify で書き出す。テンプレートリテラルにすると、
 * 中に出てくるバッククォートや `${` で壊れる。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../dist");
const OUT = resolve(HERE, "../native/game-html.ts");

let html = readFileSync(resolve(DIST, "index.html"), "utf8");

/**
 * `<script type="module" src="...">` を中身そのものに置き換える。
 * 動的 import が残っていると別チャンクになって畳めないので、
 * 見つかった src が1本でないときは黙って通さず落とす。
 */
const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (tags.length !== 1) {
  console.error(
    `想定と違います: <script src> が ${tags.length} 本あります。\n` +
      "動的 import を足すとチャンクが分かれます。畳めるのは1本のときだけです。",
  );
  process.exit(1);
}

const [tag, src] = [tags[0][0], tags[0][1]];
const js = readFileSync(resolve(DIST, src.replace(/^\.?\//, "")), "utf8");

// </script> がJSの中に出てきたら、HTMLパーサがそこでスクリプトを閉じてしまう。
const safeJs = js.replace(/<\/script/gi, "<\\/script");
html = html.replace(tag, `<script type="module">${safeJs}</script>`);

if (/\bsrc="\.?\/assets\//.test(html)) {
  console.error("assets/ への参照が残っています。畳みきれていません。");
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  "/* 自動生成。手で触らないこと。`npm run bundle` で作り直す。 */\n" +
    "/* eslint-disable */\n" +
    `export const GAME_HTML = ${JSON.stringify(html)};\n`,
);

console.log(`native/game-html.ts に ${(html.length / 1024).toFixed(1)} kB を書き出しました`);
