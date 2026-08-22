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
        clashSpawns: s.clashSpawns, jumps: s.jumps, jumpMiss: s.jumpMiss,
        ...seen,
      });
      return;
    }

    // いちばん近い「まだ決着していない」もの
    // ゲーム側と同じ「まんなかで判定」に合わせる。ここがずれていると、
    // ボットは決着済みと思っているのにゲームはまだ待っている、が起きる。
    let nextPoop = null, nextBig = null, nextDeer = null;
    for (const p of s.poops) if (!p.done && p.x + C.POOP_SIDE.w / 2 > C.KID_X) {
      // 大きいフンは「顔を上げてとびこえる」ので、鹿と同じ側に数える
      if (p.big) { if (!nextBig || p.x < nextBig.x) nextBig = p; }
      else if (!nextPoop || p.x < nextPoop.x) nextPoop = p;
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
      const db = nextBig ? nextBig.x + C.POOP_SIDE.w / 2 - C.KID_X : Infinity;
      const dd = nextDeer ? (nextDeer.x + C.DEER_SIDE.w / 2 - C.KID_X) / 1.35 : Infinity;
      down = dp < Math.min(db, dd);
    }

    if (wasDown !== null && down !== wasDown) seen.toggles++;
    wasDown = down;
    M.input.down = down;

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
`;

async function drive(page, seconds, look, extra = {}) {
  await page.evaluate(BOT);
  return page.evaluate((spec) => window.__bot(spec), { seconds, look, ...extra });
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

// ---- いちばん守りたいこと ----
section("どっちも同時には見られない");
/**
 * **下を向いているあいだ、鹿が画面に出ていないこと。**
 *
 * 遊んだ人の攻略法が「基本ずっと押していて、鹿が来た時だけ離す」になっていた。
 * 暗幕が薄くて（0.55）、下を向いたまま鹿を監視できたから。
 * 監視できる＝下を向くコストがゼロ＝フンを見る理由が無い。芯が死んでいた。
 *
 * 絵として本当に消えているかを、**画素で**確かめる。
 */
await start();
const hidden = await page.evaluate(async () => {
  const M = window.__mtd, s = M.state, C = M.config;
  s.intro = 0;
  // 鹿を目の前に置く
  s.deer.push({ x: C.KID_X + 40, frame: 0, done: false });
  const cv = document.getElementById("screen");
  const g = cv.getContext("2d");
  const countDeerBrown = () => {
    const split = Math.round(C.HUD_H + C.FIELD_H * s.split);
    const d = g.getImageData(0, C.HUD_H, C.VIEW.w, Math.max(1, split - C.HUD_H)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // 鹿の胴 #a87a4a に近い画素
      if (Math.abs(d[i] - 0xa8) < 26 && Math.abs(d[i + 1] - 0x7a) < 26
        && Math.abs(d[i + 2] - 0x4a) < 26) n++;
    }
    return n;
  };
  M.input.down = false;
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  const up = countDeerBrown();
  M.input.down = true;
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  const down = countDeerBrown();
  return { up, down };
});
check("前を見ていれば鹿が見える", hidden.up > 30, `鹿の色 ${hidden.up} 画素`);
check("下を向いているあいだ鹿は見えない", hidden.down === 0, `鹿の色 ${hidden.down} 画素`);

/**
 * **合図も出さない。**
 * 一度は「しか」の予告を出したが、予告があれば下を向いたままで済んでしまい、
 * 「ずっと押していて鹿が来た時だけ離す」が復活する。
 * 前を見ている間だけ分かる、でなければならない。
 */
const renderSrc = await readFile(resolve(DIST, "../src/render.ts"), "utf8");
check("鹿が来る予告を画面に出していない", !/warn/i.test(renderSrc));

/**
 * **顔を上げる隙が、ちゃんとあること。**
 *
 * フンは「汚れた区間」で来るので、そのあいだ下を向きっぱなしになる。
 * きれいな区間＝顔を上げる隙が無いと、集中したまま轢かれるだけになる。
 * そして鹿は、その一巡のあいだに気づける長さだけ見えていなければならない。
 */
const rhythm = await page.evaluate(() => {
  const C = window.__mtd.config;
  const out = [];
  for (let t = 0; t <= 200; t += 20) {
    const v = C.speedAhead(t);
    out.push({
      // **汚れた区間は下を向いて通る＝足が遅い。**そのぶん長くかかる。
      // ここを名目の速さで見積もっていて、集中の長さを 0.62倍に見誤っていた。
      down: (C.dirtyRun(t).max * C.STONE_W) / (v * C.SLOW_FACTOR),
      // きれいな区間は顔を上げて通るので、名目の速さ。
      gap: (C.cleanRun(t).min * C.STONE_W) / v,
      see: (C.VIEW.w + 6 - C.KID_X) / (v * C.AHEAD_PARALLAX),
    });
  }
  return out;
});
const worstGap = Math.min(...rhythm.map((r) => r.gap));
const worstSee = Math.min(...rhythm.map((r) => r.see));
const worstDown = Math.max(...rhythm.map((r) => r.down));
check("顔を上げる隙がある", worstGap > 0.5, `いちばん短い隙 ${worstGap.toFixed(2)}秒`);
check("鹿は、一巡するあいだ見えつづけている", worstSee > worstDown + worstGap,
  `鹿が見えるのは ${worstSee.toFixed(1)}秒 ／ 集中+隙の一巡は ${(worstDown + worstGap).toFixed(1)}秒`);

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
section("でかいフンは とびこえる");
/**
 * **下を向いているだけでは避けられないものが要る。**
 *
 * 「ふんをよけるスリルが欲しい」——下を向いていれば自動で避かるかぎり、
 * **失敗しうる瞬間がどこにも無い**。スリルは「いま失敗するかもしれない」
 * からしか出ない。だから大きいフンだけは、顔を上げた人だけが越えられる。
 *
 * 操作は増やしていない。増やすと「テクニックが要るゲーム」に逆戻りする。
 * 見るのは下、越えるのは上——この逆向きだけで山を作る。
 */
await skipIntro(30);
const jumpRun = await drive(page, 30, "perfect");
check("顔を上げていれば とびこえられる", jumpRun.jumps > 0,
  `${jumpRun.jumps} 回とびこえた`);

// 下を向いたままでは越えられない（＝顔を上げることが本当に要る）
await skipIntro(30);
const noJump = await drive(page, 30, "down");
check("下を向いたままでは、でかいフンは越えられない",
  noJump.jumps === 0 && noJump.jumpMiss > 0,
  `とびこえた ${noJump.jumps} 回 / 踏んだ ${noJump.jumpMiss} 回`);

/**
 * **でかいフンの手前は空いている。**
 *
 * 小さいフンを避けている姿勢のまま、いきなり「顔を上げろ」が来たら
 * それは避けようが無い。手前を空けて、そこを顔を上げる隙にしてある。
 * 空きマスの並びが、そのまま「来るぞ」の合図にもなっている。
 */
const gap = await page.evaluate(() => new Promise((done) => {
  const M = window.__mtd, s = M.state, C = M.config;
  s.intro = 0;
  s.t = 90;                          // 本番の濃さで見る
  // **前の走行の残りを片付けてから測る。**
  // 死んだ走行のフンが残っていると、区間と関係ない並びを測ってしまう。
  s.poops = [];
  s.deer = [];
  s.runLeft = 0;
  s.runDirty = false;
  s.bigAt = -1;
  s.nextStoneAt = C.VIEW.w;
  const measured = new WeakSet();
  let worst = Infinity, n = 0;
  const t0 = performance.now();
  const tick = () => {
    // 測るあいだは終わらせない。転びも飛ばして、置かれ方だけを見る
    s.dirt = 0;
    s.trip = 0;
    s.phase = "playing";
    /**
     * **下を向いたまま測る。**そこがいちばん詰まりやすいところ。
     * 石を置く送りが名目の速さのままで、世界が 0.62倍で流れていたときは、
     * 下を向いているあいだだけ間隔が 30px → 19px に詰まっていた。
     * 設計した隙が軒並み 0.62倍になっていて、ここでしか見つからなかった。
     */
    M.input.down = true;
    // **出てきた瞬間に測る。**同じ区間の小さいフンは、もう左に並んでいる
    for (const b of s.poops) {
      if (!b.big || measured.has(b)) continue;
      measured.add(b);
      let last = -Infinity;
      for (const p of s.poops) if (!p.big && p.x < b.x) last = Math.max(last, p.x);
      if (last === -Infinity) continue;
      n++;
      worst = Math.min(worst, b.x - last);
    }
    if (performance.now() - t0 < 18000) requestAnimationFrame(tick);
    else done({
      worst, n,
      need: (C.BIG_GAP + 1) * C.STONE_W,
      v: C.speedAhead(s.t) * C.SLOW_FACTOR,
    });
  };
  requestAnimationFrame(tick);
}));
check("でかいフンの手前は空いている",
  gap.n >= 3 && gap.worst >= gap.need - 6,
  `いちばん詰まって ${gap.worst.toFixed(0)}px（${(gap.worst / gap.v).toFixed(2)}秒）/ ${gap.n} 個で確認`);

/**
 * **「すれすれ！」が本当に鳴ること。**
 *
 * ぎりぎりまで待って切り替えたら褒める、という上乗せを置いてあるが、
 * 視線を切り替えた時刻を誰も記録していなくて、**一度も出ていなかった**。
 * 褒めるところが無ければ、ぎりぎりまで我慢する理由も無い。仕組みで縛る。
 */
await start();
const grazed = await page.evaluate(async () => {
  const M = window.__mtd, s = M.state, C = M.config;
  const wait = (n) => new Promise((r) => {
    const f = () => (n-- > 0 ? requestAnimationFrame(f) : r());
    f();
  });
  s.intro = 0;
  s.poops = [];
  s.deer = [];
  s.nices = 0;
  M.input.down = false;
  await wait(4);
  M.input.down = true;              // いま切り替えた
  await wait(1);
  s.poops.push({ x: C.KID_X + 2, big: false, done: false });
  await wait(14);                   // 0.23秒。すれすれの範囲で通り過ぎる
  return { nices: s.nices, sinceLook: s.t - s.lastLook };
});
check("ぎりぎりで切り替えたら すれすれが出る", grazed.nices > 0,
  `切り替えから ${grazed.sinceLook.toFixed(2)}秒 で通過 / すれすれ ${grazed.nices} 回`);

section("前を見ると速い");
const speeds = await page.evaluate(() => {
  const C = window.__mtd.config;
  return { ahead: C.speedAhead(0), down: C.speedAhead(0) * C.SLOW_FACTOR };
});
check("下を向くと足が遅くなる", speeds.down < speeds.ahead * 0.8,
  `${speeds.ahead.toFixed(0)} → ${speeds.down.toFixed(0)} px/s`);

/**
 * **隙に顔を上げる人のほうが、稼げる。**
 *
 * 前は「ずっと前」対「ずっと下」で比べていたが、いまはどちらも下手なので
 * 意味のある比較にならない（前だけ見ていると汚れた区間で転びまくり、
 * 速さの得を転倒で失う）。
 * 比べるべきは「必要なときだけ下を向く人」と「ずっと下を向いている人」。
 * 顔を上げている時間がそのまま距離になる、というのがこのゲームの報酬。
 */
await skipIntro(20);
const rp = await drive(page, 25, "perfect");
await skipIntro(20);
const rd = await drive(page, 25, "down");
const vP = rp.dist / Math.max(0.1, rp.t);
const vD = rd.dist / Math.max(0.1, rd.t);
check("必要なときだけ下を向く人のほうが、1秒あたり速く進む", vP > vD * 1.15,
  `${vP.toFixed(0)} 対 ${vD.toFixed(0)} px/s`);

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
