/**
 * アプリアイコンと起動画面を作る。`npm run icons` で走る。
 * 出力先は Expo が見る assets/（app.json の icon / splash / adaptiveIcon）。
 *
 * 素材ファイルは持たない方針なので、これも計算で描く。
 * 64×64 のドット絵を組み立てて、そのまま16倍に引き伸ばして1024pxにする。
 * 補間を切ってあるので、拡大しても輪郭がぼけずドット絵のまま出る。
 *
 * アイコンは端末では60px角でしか見えない。
 * 参道もフンも入れると何も読めなくなるので、**鹿の顔だけ**にしてある。
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, "../assets");
const STORE = resolve(HERE, "../store");

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try {
      return require(p);
    } catch {
      /* 次の候補へ */
    }
  }
  console.error("playwright が見つかりません。`npm i -D playwright` か、グローバル導入が要ります。");
  process.exit(2);
}

/** ゲーム本体と同じ色。ここがずれるとアイコンだけ別のゲームに見える。 */
const COL = {
  gravel: "#c9c2a6",
  gravelDark: "#b5ad90",
  gravelLight: "#d8d4bc",
  body: "#a87a4a",
  line: "#6b4a2f",
  light: "#d9b98a",
  cream: "#f2e3c8",
  ink: "#201a24",
  poop: "#3d2b1f",
  poopLit: "#6b4a2f",
};

/** 1ピクセルずつ置いていくだけの、64×64の絵。1024pxちょうど16倍になる。 */
const ART = `
(() => {
  const W = 64;
  const c = document.createElement("canvas");
  c.width = W; c.height = W;
  const x = c.getContext("2d");
  const COL = ${JSON.stringify(COL)};

  const px = (ix, iy, col) => { x.fillStyle = col; x.fillRect(ix, iy, 1, 1); };

  /** 傾けられる楕円。鹿の耳は外へ倒れているので、回転が要る。 */
  const ellipse = (cx, cy, rx, ry, col, deg = 0) => {
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    for (let iy = 0; iy < W; iy++) for (let ix = 0; ix < W; ix++) {
      const ox = ix + 0.5 - cx, oy = iy + 0.5 - cy;
      const dx = (ox * cos + oy * sin) / rx, dy = (-ox * sin + oy * cos) / ry;
      if (dx * dx + dy * dy <= 1) px(ix, iy, col);
    }
  };
  /** 輪郭つき。先に一回り大きい輪郭色を敷いてから中を塗る。 */
  const solid = (cx, cy, rx, ry, fill, line, deg = 0) => {
    ellipse(cx, cy, rx + 1.4, ry + 1.4, line, deg);
    ellipse(cx, cy, rx, ry, fill, deg);
  };

  // 砂利の地面。決まった模様にして、作り直しても同じ絵が出るようにする。
  x.fillStyle = COL.gravel;
  x.fillRect(0, 0, W, W);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 420; i++) {
    px(Math.floor(rnd() * W), Math.floor(rnd() * W), rnd() < 0.5 ? COL.gravelDark : COL.gravelLight);
  }

  // 耳。頭より先に描いて、根元を頭で隠す。
  // 鹿の耳は大きく、真上ではなく外へ倒れている。ここを立てるとクマの顔になる。
  solid(13, 17, 5, 10, COL.body, COL.line, -26);
  solid(51, 17, 5, 10, COL.body, COL.line, 26);
  ellipse(13, 18, 2.2, 6, COL.light, -26);
  ellipse(51, 18, 2.2, 6, COL.light, 26);

  // 頭。丸より少し縦長にする。
  solid(32, 29, 16, 15, COL.body, COL.line);
  // 鼻づら。下へ長く出すのが鹿らしさの要。
  solid(32, 44, 9.5, 9, COL.light, COL.line);

  // 目。小さめの丸。大きくすると一気に幼くなる。
  solid(24, 28, 2.6, 3, COL.ink, COL.ink);
  solid(40, 28, 2.6, 3, COL.ink, COL.ink);
  px(23, 26, COL.cream); px(39, 26, COL.cream);

  // 鼻
  ellipse(32, 42, 3.4, 2.4, COL.ink);

  // 頬の白斑。鹿の模様。
  for (const [sx, sy] of [[19, 38], [45, 38], [23, 43], [41, 43]]) {
    ellipse(sx, sy, 1.4, 1.4, COL.cream);
  }

  // フン。何のゲームか一目で分かる唯一の要素。
  // 四隅には置かない——iOSが角を丸く切り落とすので、隅の絵は消える。
  const pellet = (cx, cy, r) => {
    solid(cx, cy, r, r, COL.poop, COL.ink);
    ellipse(cx - r * 0.4, cy - r * 0.4, r * 0.4, r * 0.4, COL.poopLit);
  };
  pellet(19, 56, 3.2); pellet(32, 59, 2.6); pellet(45, 56, 3.2);

  return c;
})()
`;

async function run() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<body style='margin:0'></body>");

  /** 64×64 の絵を、補間なしで size 角へ引き伸ばして PNG にする。 */
  const scaleTo = async (size, pad) =>
    page.evaluate(
      ({ art, size, pad, bg }) => {
        // eslint-disable-next-line no-eval
        const src = eval(art);
        const out = document.createElement("canvas");
        out.width = size;
        out.height = size;
        const g = out.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.fillStyle = bg;
        g.fillRect(0, 0, size, size);
        const inner = size - pad * 2;
        g.drawImage(src, pad, pad, inner, inner);
        return out.toDataURL("image/png");
      },
      { art: ART, size, pad, bg: COL.gravel },
    );

  mkdirSync(STORE, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });
  const write = (path, dataUrl) =>
    writeFileSync(path, Buffer.from(dataUrl.split(",")[1], "base64"));

  // アプリアイコン。角丸はiOSが勝手に切るので、余白なしの正方形で出す。
  const icon = await scaleTo(1024, 0);
  write(`${ASSETS}/icon.png`, icon);
  write(`${STORE}/icon-1024.png`, icon);

  // Android のアダプティブアイコン。端末によって円や角丸に切られるので、
  // 絵が中央66%に収まるよう余白を入れる。ここを詰めると耳とフンが切れる。
  write(`${ASSETS}/adaptive-icon.png`, await scaleTo(1024, 170));

  // 起動画面に置く絵。背景色（app.json の backgroundColor）と地面の色を
  // 揃えてあるので、四角いままでも継ぎ目は見えない。
  write(`${ASSETS}/splash-icon.png`, await scaleTo(512, 0));

  // web 版のファビコン
  write(`${ASSETS}/favicon.png`, await scaleTo(64, 0));

  console.log("assets/ に アイコン・アダプティブ・起動画面・ファビコン を書き出しました");
}

run();
