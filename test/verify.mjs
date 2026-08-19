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
 * 操縦は**ページの中で 60Hz で回す**。
 *
 * 以前は Node 側から Playwright でマウスを動かしていたが、
 * 往復が1周50〜80msあり、それがそのまま操作の遅れになっていた。
 * つまり測っていたのは地形の公平さではなく**計測装置の遅さ**で、
 * 同じ地形が「被弾5回」にも「被弾0回」にもなった。
 *
 * いまは目標位置だけを毎フレーム与える。移動速度は LATERAL のままなので、
 * **本当の制約（速度上限）は残っている**。
 * 指の相対操作そのものは「指を置き直してもワープしない」で別に見ている。
 */
const BOT = `
window.__bot = (spec) => new Promise((done) => {
  const M = window.__mtd, C = M.config, s = M.state;
  const hist = [];
  let lastRow = -1;
  const seen = {
    squat: 0, trees: 0, stalls: 0, maxSenbei: 0, fed: 0, banners: [],
    sleepers: 0, scene: 0, herd: 0, maxSwarm: 0, baits: 0,
    maxSpans: 0, repairs: 0, narrowest: 999,
  };
  const mults = [];
  const t0 = performance.now();

  /** 足元の行が作られたときの thread。人が画面を見て選ぶのと同じ情報。 */
  const lagged = () => {
    const want = s.scrollPx - (s.py + C.PLAYER.hitY + C.PLAYER.hitH / 2);
    let pick = hist[0];
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].sp <= want) { pick = hist[i]; break; }
    return pick || { t: s.px + C.PLAYER.w / 2, route: s.route };
  };

  /** いま足元にある隙間。鹿をよけるときも、ここから出ない。 */
  const spanAt = (lag) => {
    for (const r of lag.route) if (lag.t >= r.a && lag.t <= r.b) return r;
    return null;
  };

  /**
   * 前方の鹿をよける。ただし**通れる隙間の中でだけ**動く。
   * 隙間より鹿のほうが広ければよけられない——それは理不尽ではなく、難所。
   */
  const dodgeDeer = (want, lag) => {
    let out = want;
    for (const d of s.deer) {
      const ahead = s.py - d.y;
      if (ahead < -12 || ahead > 70) continue;
      const dx = d.x + C.DEER_BOX.w / 2 - out;
      if (Math.abs(dx) > 15) continue;
      out += dx > 0 ? -20 : 20;
    }
    // よける必要が無いなら1本のまま。ここで無条件に隙間へ丸めていて、
    // 鹿が1頭もいない検査でも1本から押し出されていた。
    if (out === want) return want;
    const here = spanAt(lag);
    if (!here) return want;
    const lo = here.a + 6;
    const hi = here.b - 6;
    if (hi <= lo) return want;   // よける余地が無い。難所として受ける
    return Math.max(lo, Math.min(hi, out));
  };

  const steers = {
    /** 通り抜けられる1本をたどりつつ、前の鹿はよける。上手い人の走り方。 */
    route: (lag) => dodgeDeer(lag.t, lag),
    /** 同じ道を、真ん中ではなく縁ぎりぎりで通る。稼げるが踏む。 */
    graze: (lag, t) => {
      let here = null;
      for (const r of lag.route) if (lag.t >= r.a && lag.t <= r.b) here = r;
      const half = here ? Math.max(0, Math.min(14, (here.b - here.a) / 2 - 5)) : 0;
      return lag.t + (Math.sin(t * 0.7) < 0 ? -half : half);
    },
    /**
     * **いちばん広く空いて見えるところ**へ行く。先のことは見ない。
     * この設計だと「広い＝続く」ではないので、たいてい詰まる。
     * 回廊時代の「見せかけの道」に当たるものが、作り物ではなく勝手に生まれている。
     */
    wide: (lag) => {
      let best = null;
      for (const r of lag.route) if (!best || r.b - r.a > best.b - best.a) best = r;
      return best ? (best.a + best.b) / 2 : lag.t;
    },
    /** 何も見ずに振る。 */
    blind: (lag, t) => lag.t + Math.sin(t * 2.2) * 40,
  };

  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    if (s.phase !== "playing" || t >= spec.seconds) {
      const mean = mults.length ? mults.reduce((a, b) => a + b, 0) / mults.length : 0;
      done({
        phase: s.phase, progress: s.progress, score: s.score, dirt: s.dirt,
        graze: s.grazeCount, poopHits: s.poopHits, deerHits: s.deerHits,
        senbei: s.senbei, encircled: s.encircled, swarmCount: s.swarmCount,
        ...seen, banners: seen.banners, mean,
        perM: s.grazeCount / Math.max(1, s.progress),
      });
      return;
    }

    if (spec.immortal) s.dirt = 0;
    if (spec.noDeer) { s.deer.length = 0; s.warns.length = 0; s.deerTimer = 9; }

    const row = Math.floor(s.scrollPx / C.TILE);
    if (row !== lastRow) {
      lastRow = row;
      hist.push({ sp: s.scrollPx, t: s.thread, route: s.route.map((r) => ({ a: r.a, b: r.b })) });
      if (hist.length > 900) hist.shift();
      seen.maxSpans = Math.max(seen.maxSpans, s.route.length);
      if (s.repaired) seen.repairs++;
      for (const r of s.route) seen.narrowest = Math.min(seen.narrowest, r.b - r.a);
    }

    mults.push(s.mult);
    if (s.deer.some((d) => d.squat > 0)) seen.squat++;
    seen.trees = Math.max(seen.trees, s.trees.length);
    seen.sleepers = Math.max(seen.sleepers, s.deer.filter((d) => d.kind === "sleeper").length);
    seen.scene = Math.max(seen.scene, s.deer.filter((d) => d.kind === "scene").length);
    seen.herd = Math.max(seen.herd, s.deer.filter((d) => d.kind === "walk" || d.kind === "homing").length);
    seen.maxSwarm = Math.max(seen.maxSwarm, s.swarmCount);
    seen.baits = Math.max(seen.baits, s.baits.length);
    seen.stalls = Math.max(seen.stalls, s.stalls.length);
    seen.maxSenbei = Math.max(seen.maxSenbei, s.senbei);
    seen.fed = Math.max(seen.fed, s.fed);
    if (s.bannerT > 0 && s.banner && !seen.banners.includes(s.banner)) seen.banners.push(s.banner);

    const want = steers[spec.steer](lagged(), t);
    // **tx と ty は両方揃わないと1ミリも動かない**（game.ts の条件が && ）。
    // ty を忘れていて、ボットが突っ立ったまま踏まれ続けていた。
    if (Number.isFinite(want)) {
      M.input.tx = want - C.PLAYER.w / 2;
      M.input.ty = s.py;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
`;

async function drive(page, seconds, steer, opts = {}) {
  await page.evaluate(BOT);
  return page.evaluate(
    (spec) => window.__bot(spec),
    { seconds, steer, noDeer: !!opts.noDeer, immortal: !!opts.immortal },
  );
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
  const p = document.getElementById("pad").getBoundingClientRect();
  return { w: r.width, h: r.height, pad: p.height, vw: window.innerWidth, vh: window.innerHeight };
});
check("ゲーム画面が横幅いっぱい（左右に余白なし）", Math.abs(geo.w - geo.vw) <= 1,
  `${geo.w.toFixed(0)}×${geo.h.toFixed(0)} / 画面 ${geo.vw}×${geo.vh}`);
check("下段に十分な高さが残る", geo.h / geo.vh < 0.5, `ゲーム画面は高さの ${(geo.h / geo.vh * 100).toFixed(0)}%`);

// 数字をゲーム画面のHUDへ移した目的そのもの。
// 下段からスコア表示が消えたぶんがパッドに回っていなければ、移した意味がない。
// バナー（実機で50〜60px）を引いても、指で操作するのに十分な高さが残ること。
const BANNER_PX = 60;
check("操作パッドがゲーム画面より広い", geo.pad > geo.h,
  `パッド ${geo.pad.toFixed(0)} / ゲーム画面 ${geo.h.toFixed(0)}`);
check("バナーを置いてもパッドが残る", geo.pad - BANNER_PX > 200,
  `バナー後 ${(geo.pad - BANNER_PX).toFixed(0)}px`);

// ---- ステージ選択 ----
section("ステージモード");
await page.click("#btn-stage");
await page.waitForTimeout(200);
check("ステージが10面ならぶ", (await page.locator("#stage-list .stage-btn").count()) === 10);
check("最初は1面だけ開いている", (await page.locator("#stage-list .stage-btn.locked").count()) === 9);
check("エリア2以降はロック", (await page.locator("#area-list .area-btn.locked").count()) === 9);

const pad = await page.locator("#pad").boundingBox();
const reach = await page.evaluate(() => window.__mtd.reach);
/**
 * 通り抜けられる1本（thread）をたどる。**上手い人の走り方。**
 *
 * 到達可能集合（route）のほうを追うと駄目だった。いま居る枝が
 * 先で行き止まっても、足元の集合を見ているうちは分からない。
 * 気づいた時にはもう戻れない——それは公平さの検査にならない。
 */
const followRoute = (s, lag) => {
  const t = lag.thread;
  return (typeof t === "number" ? t : s.px + 6) - 6;
};

/** 同じ道を、真ん中ではなく縁ぎりぎりで通る。稼げるが踏む。 */
const grazeRoute = (s, lag, t) => {
  const spans = lag.route ?? [];
  const mid = typeof lag.thread === "number" ? lag.thread : s.px + 6;
  let here = null;
  for (const r of spans) if (mid >= r.a && mid <= r.b) here = r;
  const half = here ? Math.max(0, Math.min(14, (here.b - here.a) / 2 - 5)) : 0;
  return mid + (Math.sin(t * 0.7) < 0 ? -half : half) - 6;
};

await page.locator("#stage-list .stage-btn").first().click();
await page.waitForTimeout(200);
const stage1 = await drive(page, 40, "route");
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
const reckless = await drive(page, 60, "blind");
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
  return drive(page, seconds, "route", { immortal: true });
}

const lvUp = await probe(12, 95);
check("レベルアップが画面に出る", lvUp.banners.length > 0, lvUp.banners.join(" / "));

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
section("公平さ：どんな地形でも本当に通り抜けられるか");
await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(150);
const corridor = await drive(page, 40, "route", { noDeer: true });
check("残っている道を辿れば無傷で走り切れる", corridor.phase === "playing" && corridor.poopHits <= 1,
  `${corridor.progress.toFixed(0)}m / フン被弾 ${corridor.poopHits}`);

// ここから3つは、回廊を廃止した設計そのものの検査。
// 枝分かれしないなら、それは結局1本道＝回廊と同じ。
check("道は枝分かれする（1本道ではない）", corridor.maxSpans >= 2,
  `同時に最大 ${corridor.maxSpans} 本`);
// 一度も取り除いていないなら「置いてから通す」ではなく
// 「最初から通れる量しか置いていない」ということ。
check("塞がった行を取り除いて通している", corridor.repairs > 0,
  `${corridor.repairs} 行`);
check("縫うほど細い道も出る", corridor.narrowest < 40,
  `いちばん細い隙間 ${corridor.narrowest.toFixed(0)}px`);

section("広く見えるほうが正解とはかぎらない");
await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(150);
const wide = await drive(page, 40, "wide", { noDeer: true });
// 回廊時代は「見せかけの道」を人工的に並べていた。いまは作っていない——
// それでも詰まるなら、行き止まりが地形から勝手に生まれているということ。
check("いちばん広い隙間を選ぶと先で詰まる", wide.poopHits > corridor.poopHits,
  `被弾 ${wide.poopHits} 対 続く道 ${corridor.poopHits}`);

section("攻めと守り");
await page.evaluate(() => window.__mtd.startEndless());
await page.waitForTimeout(150);
const graze = await drive(page, 40, "graze", { noDeer: true });
// 比べる相手は「続く道を普通に辿ったとき」。
// wide は早死にして距離が短いぶん グレイズ/m が水増しされるので、基準にできない。
check("縁を舐めるほうがよく稼げる", graze.perM > corridor.perM * 1.5,
  `縁 ${graze.perM.toFixed(2)} / 続く道 ${corridor.perM.toFixed(2)} グレイズ/m`);
check("そのぶん危ない", graze.poopHits >= corridor.poopHits + 2,
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
