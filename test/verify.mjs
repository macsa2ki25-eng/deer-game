/**
 * 実ブラウザでの検証。`npm run verify` で走る。
 *
 * ここで見ているのは見た目ではなく、設計が主張している性質そのもの。
 *   - 安全回廊は本当に通れるのか（回廊をなぞるボットが無傷で走り切れるか）
 *   - 危険を冒すと本当に得なのか（縁を舐めるボットのグレイズが伸びるか）
 *   - 下手なら本当に死ぬのか
 *   - ステージ・アンロック・ランキングが繋がっているか
 *   - 新しい要素（ぶりぶり鹿・木・せんべい）が実際に出るか
 *
 * 過去に「回廊が塞がっていた」「倍率が一生上がらない」「鹿が種類だけ pooper で
 * 中身はただ歩いていた」を、すべてここで捕まえている。目視では気づけなかった。
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DIST = resolve(new URL("../dist", import.meta.url).pathname);
const SHOTS = process.env.MTD_SHOTS ?? null;

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

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };

async function serve() {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const file = join(DIST, path === "/" ? "index.html" : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

// ---------------------------------------------------------------- 結果の記録

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${extra ? `   ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------- ボットの操縦

/**
 * 回廊は「いま自分の足元に来ている行が生成されたときの位置」を追わないといけない。
 * 生成時点の値を追うと11行ぶん先の道を追うことになり、必ずフンを踏む。
 */
function makeCorridorTracker() {
  const hist = [];
  return (s) => {
    hist.push({ sp: s.scrollPx, c: s.corridor, half: s.corridorHalf });
    if (hist.length > 700) hist.shift();
    const want = s.scrollPx - (s.py + 16);
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].sp <= want) return hist[i];
    return hist[0];
  };
}

async function drive(page, pad, reach, seconds, steer, opts = {}) {
  const track = makeCorridorTracker();
  const mults = [];
  const seen = {
    squat: 0, trees: 0, stalls: 0, maxSenbei: 0, fed: 0, banners: new Set(),
    sleepers: 0, scene: 0, herd: 0, maxSwarm: 0, baits: 0,
  };
  // 操作は相対方式なので、目標の絶対位置ではなく「動かしたい差分」でマウスを動かす。
  // パッドの端に来たら、人と同じように指を離して真ん中に置き直す。
  const kx = (reach.x1 - reach.x0) / pad.width;
  let mouseX = pad.x + pad.width / 2;
  const mouseY = pad.y + pad.height * 0.82;
  await page.mouse.move(mouseX, mouseY);
  await page.mouse.down();
  const t0 = Date.now();
  let shot = false;
  let last = null;
  while (Date.now() - t0 < seconds * 1000) {
    if (opts.immortal) {
      // 要素が出るかどうかの検査なので、生存とは切り離す
      await page.evaluate(() => { window.__mtd.state.dirt = 0; });
    }
    if (opts.noDeer) {
      await page.evaluate(() => {
        const s = window.__mtd.state;
        s.deer.length = 0;
        s.warns.length = 0;
        s.deerTimer = 9;
      });
    }
    const s = await page.evaluate(() => {
      const s = window.__mtd.state;
      return {
        phase: s.phase, progress: s.progress, level: s.level, score: s.score, dirt: s.dirt,
        graze: s.grazeCount, mult: s.mult, poopHits: s.poopHits, deerHits: s.deerHits,
        corridor: s.corridor, corridorHalf: s.corridorHalf, scrollPx: s.scrollPx,
        px: s.px, py: s.py, senbei: s.senbei, fed: s.fed,
        trees: s.trees.length, stalls: s.stalls.length, baits: s.baits.length,
        swarmCount: s.swarmCount,
        squats: s.deer.filter((d) => d.squat > 0).length,
        sleepers: s.deer.filter((d) => d.kind === "sleeper").length,
        scene: s.deer.filter((d) => d.kind === "scene").length,
        walkers: s.deer.filter((d) => d.kind === "walk" || d.kind === "homing").length,
        banner: s.bannerT > 0 ? s.banner : "",
      };
    });
    last = s;
    if (s.phase !== "playing") break;
    mults.push(s.mult);
    if (s.squats > 0) seen.squat++;
    seen.trees = Math.max(seen.trees, s.trees);
    seen.sleepers = Math.max(seen.sleepers, s.sleepers);
    seen.scene = Math.max(seen.scene, s.scene);
    seen.herd = Math.max(seen.herd, s.walkers);
    seen.maxSwarm = Math.max(seen.maxSwarm, s.swarmCount);
    seen.baits = Math.max(seen.baits, s.baits);
    seen.stalls = Math.max(seen.stalls, s.stalls);
    seen.maxSenbei = Math.max(seen.maxSenbei, s.senbei);
    seen.fed = Math.max(seen.fed, s.fed);
    if (s.banner) seen.banners.add(s.banner);

    const lag = track(s);
    const targetX = steer(s, lag, (Date.now() - t0) / 1000);
    const tx = await page.evaluate(() => window.__mtd.input.tx);
    mouseX += (targetX - (tx ?? s.px)) / kx;
    if (mouseX < pad.x + 6 || mouseX > pad.x + pad.width - 6) {
      // 端まで来た。指を離して真ん中から続ける（相対方式なのでキャラは動かない）
      await page.mouse.up();
      mouseX = pad.x + pad.width / 2;
      await page.mouse.move(mouseX, mouseY);
      await page.mouse.down();
    } else {
      await page.mouse.move(mouseX, mouseY);
    }
    if (SHOTS && opts.shotName && !shot && Date.now() - t0 > 6000) {
      shot = true;
      await page.locator("#stage").screenshot({ path: `${SHOTS}/${opts.shotName}.png` });
    }
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const mean = mults.length ? mults.reduce((a, b) => a + b, 0) / mults.length : 0;
  return { ...last, ...seen, mean, perM: last.graze / Math.max(1, last.progress) };
}

// ---------------------------------------------------------------- 本体

const { server, port } = await serve();
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));

const url = `http://127.0.0.1:${port}/?debug=1`;
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(400);

// ---- 画面 ----
section("画面");
const geo = await page.evaluate(() => {
  const r = document.getElementById("screen").getBoundingClientRect();
  return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
});
check("ゲーム画面が横幅いっぱい（左右に余白なし）", Math.abs(geo.w - geo.vw) <= 1,
  `${geo.w.toFixed(0)}×${geo.h.toFixed(0)} / 画面 ${geo.vw}×${geo.vh}`);
check("下段に十分な高さが残る", geo.h / geo.vh < 0.5, `ゲーム画面は高さの ${(geo.h / geo.vh * 100).toFixed(0)}%`);

// ---- ステージ選択 ----
section("ステージモード");
await page.click("#btn-stage");
await page.waitForTimeout(200);
check("ステージが10面ならぶ", (await page.locator("#stage-list .stage-btn").count()) === 10);
check("最初は1面だけ開いている", (await page.locator("#stage-list .stage-btn.locked").count()) === 9);
check("エリア2以降はロック", (await page.locator("#area-list .area-btn.locked").count()) === 9);

const pad = await page.locator("#pad").boundingBox();
const reach = await page.evaluate(() => window.__mtd.reach);
const followCorridor = (_s, lag) => lag.c - 6;

await page.locator("#stage-list .stage-btn").first().click();
await page.waitForTimeout(200);
const stage1 = await drive(page, pad, reach, 40, followCorridor);
check("ステージ1をクリアできる", stage1.phase === "clear",
  `${stage1.progress.toFixed(0)}m / よごれ ${stage1.dirt} / フン被弾 ${stage1.poopHits}`);
await page.waitForTimeout(300);
check("クリア画面に★が出る", await page.locator("#result-stars").isVisible());
await page.click("#btn-back");
await page.waitForTimeout(250);
check("クリアすると次の面が開く", (await page.locator("#stage-list .stage-btn.locked").count()) === 8);

// ---- エンドレスとランキング ----
section("エンドレスとランキング");
await page.click("#btn-back-title");
await page.waitForTimeout(150);
await page.click("#btn-endless");
await page.waitForTimeout(200);
const reckless = await drive(page, pad, reach, 60, (_s, lag, t) => lag.c - 6 + Math.sin(t * 2.2) * 40);
check("下手に歩けば終わる", reckless.phase === "over", `${reckless.progress.toFixed(0)}m`);
await page.waitForTimeout(300);
check("ランキングに記録される", (await page.locator("#rank-list2 li").count()) >= 1);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(400);
check("再読み込みしても残る", (await page.locator("#rank-list li:not(.empty)").count()) >= 1);

// ---- 新しい要素 ----
section("レベルで増える要素");

/** 毎回まっさらな走行から始める。前の検査で死んでいると次が空振りするため。 */
async function probe(seconds, progress, tweak = null) {
  await page.evaluate(() => window.__mtd.startEndless());
  await page.waitForTimeout(140);
  await page.evaluate((p) => { window.__mtd.state.progress = p; }, progress);
  if (tweak) await page.evaluate(tweak);
  return drive(page, pad, reach, seconds, followCorridor, { immortal: true, shotName: null });
}

const lvUp = await probe(12, 95);
check("レベルアップが画面に出る", lvUp.banners.size > 0, [...lvUp.banners].join(" / "));

const pooper = await probe(20, 250);
check("鹿が道でフンをする", pooper.squat > 0, `しゃがんだフレーム ${pooper.squat}`);

const trees = await probe(16, 460);
check("木が出て道が狭まる", trees.trees > 0, `同時に最大 ${trees.trees} 本`);

const crowded = await probe(20, 520);
check("鹿が群れで歩いてくる", crowded.herd >= 3, `同時に最大 ${crowded.herd} 頭`);
check("寝ている群れが道を塞ぐ", crowded.sleepers > 0, `最大 ${crowded.sleepers} 頭`);
check("せんべいを持った観光客に鹿がたかる", crowded.scene >= 4, `最大 ${crowded.scene} 頭`);

section("鹿せんべい");
const senbei = await probe(20, 600, () => { window.__mtd.state.stallTimer = 0.1; });
check("売り場が出る", senbei.stalls > 0);
check("通ると10枚もらえる", senbei.maxSenbei === 10, `最大 ${senbei.maxSenbei} 枚`);
check("鹿にぶつかると1枚渡して無事", senbei.fed > 0, `${senbei.fed} 頭に給餌`);

// 囲まれて、枚数が尽きると解ける
await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(140);
const caught = await page.evaluate(async () => {
  const s = window.__mtd.state;
  s.progress = 620;
  s.senbei = 4;
  // 群れの真ん中に踏み込んだ状況を作る（歩いて突っ込む操作までは再現しない）
  const C = window.__mtd.config;
  for (let i = 0; i < 4; i++) {
    s.deer.push({
      x: s.px - 10 + i * 9, y: s.py - 12 + (i % 2) * 8, kind: "walk",
      sp: 0, vx: 0, squat: 0, dropIn: 0, dropsLeft: 0,
      swarm: false, orbit: i, lockX: 0, host: null,
    });
  }
  void C;
  const t0 = performance.now();
  let sawEncircled = false;
  let maxSwarm = 0;
  while (performance.now() - t0 < 9000) {
    s.dirt = 0;
    if (s.encircled) sawEncircled = true;
    maxSwarm = Math.max(maxSwarm, s.swarmCount);
    if (sawEncircled && !s.encircled) break;
    await new Promise((r) => setTimeout(r, 40));
  }
  return { sawEncircled, maxSwarm, senbei: s.senbei, encircled: s.encircled };
});
check("群れに触れると囲まれる", caught.sawEncircled, `最大 ${caught.maxSwarm} 頭`);
check("枚数が尽きると解ける", !caught.encircled && caught.senbei === 0,
  `残り ${caught.senbei} 枚`);

section("操作");
// 指を離して別の場所に置き直しても、キャラがそこへ飛ばないこと
await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(200);
const relative = await (async () => {
  await page.mouse.move(pad.x + pad.width * 0.5, pad.y + pad.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  const before = await page.evaluate(() => window.__mtd.state.px);
  // 遠く離れた場所を押し直す
  await page.mouse.move(pad.x + pad.width * 0.05, pad.y + pad.height * 0.9);
  await page.mouse.down();
  await page.waitForTimeout(220);
  const after = await page.evaluate(() => window.__mtd.state.px);
  await page.mouse.up();
  return Math.abs(after - before);
})();
check("指を置き直してもワープしない", relative < 12, `ずれ ${relative.toFixed(1)}px`);

// ---- 公平さ（ここが本丸） ----
section("公平さ：安全回廊は本当に通れるか");
await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(150);
const corridor = await drive(page, pad, reach, 40, followCorridor, { noDeer: true });
check("回廊をなぞれば無傷で走り切れる", corridor.phase === "playing" && corridor.poopHits <= 1,
  `${corridor.progress.toFixed(0)}m / フン被弾 ${corridor.poopHits}`);

await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(150);
const graze = await drive(page, pad, reach, 40, (_s, lag, t) =>
  lag.c - 6 + Math.sin(t * 2.4) * (lag.half + 9), { noDeer: true });
check("縁を舐めるほうがよく稼げる", graze.perM > corridor.perM * 1.5,
  `縁 ${graze.perM.toFixed(2)} / 安全 ${corridor.perM.toFixed(2)} グレイズ/m`);
check("そのぶん危ない", graze.poopHits > corridor.poopHits,
  `被弾 ${graze.poopHits} 対 ${corridor.poopHits}`);
check("倍率が意味のある値まで伸びる", graze.mean > 1.25,
  `平均 ×${graze.mean.toFixed(2)}`);

if (SHOTS) await page.screenshot({ path: `${SHOTS}/verify-full.png` });
await browser.close();
server.close();

console.log("\nコンソールエラー:", errors.length ? errors : "なし");
if (errors.length) failures += errors.length;
console.log(failures === 0 ? "\nすべて通過" : `\n${failures} 件 失敗`);
process.exit(failures === 0 ? 0 : 1);
