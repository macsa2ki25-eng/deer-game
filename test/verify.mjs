/**
 * 実ブラウザでの検証。`npm run verify` で走る。
 *
 * 見ているのは見た目ではなく、**設計が主張している性質そのもの**。
 * このゲームでいちばん守りたいのは「位置合わせが無い」ことなので、
 * そこを検査で縛ってある。
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DIST = resolve(new URL("../dist", import.meta.url).pathname);

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(p); } catch { /* 次の候補へ */ }
  }
  console.error("playwright が見つかりません。`npm i -D playwright` が要ります。");
  process.exit(2);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

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

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${extra ? `   ${extra}` : ""}`);
  if (!ok) failures++;
}
function section(title) { console.log(`\n${title}`); }

/**
 * ページの中で 60Hz で走らせるボット。
 * **視線しか操作しない**（このゲームには他に操作が無い）。
 *
 * spec.look:
 *   "perfect" … 次に来るものを見て、正しい側を見る
 *   "ahead"   … ずっと前だけ見ている
 *   "down"    … ずっと下だけ見ている
 */
const BOT = `
window.__bot = (spec) => new Promise((done) => {
  const M = window.__mtd, C = M.config, s = M.state;
  const t0 = performance.now();
  const seen = { toggles: 0, maxDeer: 0, maxPoop: 0, clashes: 0, minLead: 99 };
  let wasDown = null;

  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    if (s.phase !== "playing" || t >= spec.seconds) {
      done({
        phase: s.phase, t: s.t, dist: s.dist, score: s.score, dirt: s.dirt,
        poopHits: s.poopHits, deerHits: s.deerHits, dodges: s.dodges, nices: s.nices,
        clashSpawns: s.clashSpawns,
        ...seen,
      });
      return;
    }

    // いちばん近い「まだ決着していない」もの
    // ゲーム側と同じ「まんなかで判定」に合わせる。ここがずれていると、
    // ボットは決着済みと思っているのにゲームはまだ待っている、が起きる。
    let nextPoop = null, nextDeer = null;
    for (const p of s.poops) if (!p.done && p.x + C.POOP_SIDE.w / 2 > C.KID_X) {
      if (!nextPoop || p.x < nextPoop.x) nextPoop = p;
    }
    for (const d of s.deer) if (!d.done && d.x + C.DEER_SIDE.w / 2 > C.KID_X) {
      if (!nextDeer || d.x < nextDeer.x) nextDeer = d;
    }
    seen.maxPoop = Math.max(seen.maxPoop, s.poops.length);
    seen.maxDeer = Math.max(seen.maxDeer, s.deer.length);
    if (nextPoop && nextDeer && Math.abs(nextPoop.x - nextDeer.x) < 14) seen.clashes++;

    let down;
    if (spec.look === "ahead") down = false;
    else if (spec.look === "down") down = true;
    else {
      // 近いほうに合わせる。届くまでの距離で比べる。
      const dp = nextPoop ? nextPoop.x + C.POOP_SIDE.w / 2 - C.KID_X : Infinity;
      const dd = nextDeer ? (nextDeer.x + C.DEER_SIDE.w / 2 - C.KID_X) / 1.35 : Infinity;
      down = dp < dd;
    }
    if (wasDown !== null && down !== wasDown) seen.toggles++;
    wasDown = down;
    M.input.down = down;

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
`;

async function drive(page, seconds, look) {
  await page.evaluate(BOT);
  return page.evaluate((spec) => window.__bot(spec), { seconds, look });
}

// ---------------------------------------------------------------- 走らせる

const { chromium } = loadPlaywright();
const { server, port } = await serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => !!window.__mtd);

const start = async () => {
  await page.evaluate(() => window.__mtd.start());
  await page.waitForTimeout(120);
};

// ---- 画面 ----
section("画面");
const geo = await page.evaluate(() => {
  const r = document.getElementById("screen").getBoundingClientRect();
  return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
});
check("ゲーム画面が画面の高さを使い切っている", geo.h / geo.vh > 0.85,
  `${geo.w.toFixed(0)}×${geo.h.toFixed(0)} / 画面 ${geo.vw}×${geo.vh}`);

// ---- 操作 ----
section("操作");
/**
 * **このゲームでいちばん守りたい主張。**
 * 指が座標を持っていたら、失敗は必ず「あと3px」になる。
 */
const inputSrc = await readFile(resolve(DIST, "../src/input.ts"), "utf8");
const usesCoords = /clientX|clientY|offsetX|offsetY|getBoundingClientRect/.test(inputSrc);
check("操作が座標を一切読んでいない", !usesCoords);

await start();
const toggled = await page.evaluate(async () => {
  const M = window.__mtd;
  const el = document.getElementById("stage");
  const send = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: 1, bubbles: true, clientX: x, clientY: y,
  }));
  // **画面の隅を押しても真ん中を押しても同じでなければならない。**
  send("pointerdown", 5, 5);
  const a = M.input.down;
  send("pointerup", 5, 5);
  const b = M.input.down;
  send("pointerdown", 380, 800);
  const c = M.input.down;
  send("pointerup", 380, 800);
  return { corner: a, released: b, farCorner: c };
});
check("押すと下を見る", toggled.corner === true);
check("離すと前を見る", toggled.released === false);
check("画面のどこを押しても同じ", toggled.farCorner === true);

// ---- 公平さ ----
section("理不尽にしないための仕掛け");
const lead = await page.evaluate(() => {
  const C = window.__mtd.config;
  let min = Infinity;
  for (let t = 0; t < 400; t += 2) min = Math.min(min, C.leadTime(t));
  return min;
});
check("出てから届くまで、いちばん速いときでも反応時間より長い", lead > 0.45 + 0.25,
  `${lead.toFixed(2)}秒（反応時間の下限 0.45秒）`);

/**
 * **フンは靴と同じ線を通る。縦位置を持たない。**
 *
 * 一度は帯いっぱいに散らした。当たりに効かないから安全、という理屈だったが、
 * 遊んだ人には「足と関係ない場所のフンを避けている」としか見えなかった。
 * 縦位置を持たせた時点で、また同じことをやる余地が生まれる。型で塞ぐ。
 */
const stateSrc = await readFile(resolve(DIST, "../src/state.ts"), "utf8");
const poopDecl = stateSrc.slice(stateSrc.indexOf("interface Poop"),
  stateSrc.indexOf("}", stateSrc.indexOf("interface Poop")));
check("フンが縦位置を持っていない", !/^\s*y\s*:/m.test(poopDecl));

/** 重なりは、見てから前→下と動かせる差でなければならない。 */
const clash = await page.evaluate(() => {
  const C = window.__mtd.config;
  const out = [];
  for (const t of [0, 20, 60, 200]) {
    const v = C.speedAhead(t);
    const deer = (C.VIEW.w + 6 + C.DEER_SIDE.w / 2 - C.KID_X) / (v * 1.35);
    const poopFlight = (C.VIEW.w + 4 + C.POOP_SIDE.w / 2 - C.KID_X) / v;
    const wait = Math.max(0.05, C.CLASH_GAP + deer - poopFlight);
    out.push(wait + poopFlight - deer);
  }
  return Math.min(...out);
});
check("重なっても、見てから切り替える時間がある", clash > 0.45 + 0.2,
  `いちばん詰まっても ${clash.toFixed(2)}秒（反応時間 0.45秒 ＋ 戻す余裕）`);

// **教える時間（intro）を飛ばして、本番の濃さで見る。**
// intro のあいだは重ねないので、そのまま測ると重なりが 0回 になる。
const skipIntro = async (t) => {
  await start();
  await page.evaluate((tt) => {
    window.__mtd.state.t = tt;
    window.__mtd.state.intro = 0;
  }, t);
};

await skipIntro(90);
const perfect = await drive(page, 30, "perfect");
/**
 * **上手い人が食うのは、game がわざと重ねた場面だけであるべき。**
 *
 * ここが最初 9秒で終わっていた。フンと鹿を別々のタイマーで出していたので、
 * 「たまたま同時に届く」が年中起きていたため。意図した重なり以外は、
 * かならず切り替える余地が残っていなければならない（SEPARATION）。
 */
const perfectHits = perfect.poopHits + perfect.deerHits;
check("正しい側を見ていれば、わざと重ねた場面でしか当たらない",
  perfectHits <= perfect.clashSpawns,
  `被弾${perfectHits} / わざと重ねた回数${perfect.clashSpawns} / ${perfect.dodges}回よけた`);
check("きわどい二連がちゃんと起きる", perfect.clashSpawns > 0,
  `${perfect.clashSpawns} 回`);

await start();
const onlyAhead = await drive(page, 30, "ahead");
check("前だけ見ていると踏んで終わる", onlyAhead.phase === "over" && onlyAhead.poopHits > 0,
  `${onlyAhead.dist.toFixed(0)}px / フン${onlyAhead.poopHits} 鹿${onlyAhead.deerHits}`);

await start();
const onlyDown = await drive(page, 30, "down");
check("下だけ見ていると鹿にぶつかって終わる", onlyDown.phase === "over" && onlyDown.deerHits > 0,
  `${onlyDown.dist.toFixed(0)}px / フン${onlyDown.poopHits} 鹿${onlyDown.deerHits}`);

// ---- 速さが risk/reward を兼ねる ----
section("前を見ると速い");
const speeds = await page.evaluate(() => {
  const C = window.__mtd.config;
  return { ahead: C.speedAhead(0), down: C.speedAhead(0) * C.SLOW_FACTOR };
});
check("下を向くと足が遅くなる", speeds.down < speeds.ahead * 0.8,
  `${speeds.ahead.toFixed(0)} → ${speeds.down.toFixed(0)} px/s`);

// 距離そのものではなく **1秒あたり** で比べる。
// どちらも3つ汚れたら終わるので、総距離だと「死ぬまでの長さ」に引っぱられる。
await start();
const ra = await drive(page, 12, "ahead");
await start();
const rd = await drive(page, 12, "down");
const vA = ra.dist / Math.max(0.1, ra.t);
const vD = rd.dist / Math.max(0.1, rd.t);
check("前を見ていたほうが、1秒あたり速く進む", vA > vD * 1.35,
  `${vA.toFixed(0)} 対 ${vD.toFixed(0)} px/s`);

// ---- 1回の長さ ----
section("1回の長さ");
await start();
const run = await drive(page, 90, "perfect");
check("上手く見ていれば30秒は走れる", run.t > 30 || run.phase === "playing",
  `${run.t.toFixed(0)}秒 / ${run.dist.toFixed(0)}px / くつ${run.dirt}`
  + ` / わざと重ねた回数${run.clashSpawns}`);
check("視線を何度も切り替えることになる", run.toggles > 20, `${run.toggles} 回`);

console.log("\nコンソールエラー:", errors.length ? errors : "なし");
if (errors.length) failures += errors.length;
console.log(failures === 0 ? "\nすべて通過" : `\n${failures} 件 失敗`);

await browser.close();
server.close();
process.exit(failures === 0 ? 0 : 1);
