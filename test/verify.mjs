/**
 * 実ブラウザでの検証。`npm run verify` で走る。
 *
 * 見ているのは見た目ではなく、**設計が主張している性質そのもの**。
 * 縦スクロール版（v2.0）でいちばん守りたいのはふたつ。
 *
 *   1. 横は**レーン番号でしか決まらない**（「あと3px」を作らない）
 *   2. 下を向いているあいだ鹿は見えず、顔を上げているあいだ足元は見えない
 *
 * どちらも、画素と型で縛ってある。
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
 *
 * spec.play:
 *   "perfect" … 到達時刻がいちばん早いものに合わせる。**これが最善手**
 *   "left"    … ずっと左を触っている（＝下を向いたまま左レーン）
 *   "up"      … ずっと離している（＝前を見たまま。レーンは動かない）
 */
const BOT = `
window.__bot = (spec) => new Promise((done) => {
  const M = window.__mtd, C = M.config, s = M.state;
  const t0 = performance.now();
  const seen = { toggles: 0, moves: 0, unfair: 0, peeks: 0 };
  let wasDown = null, wasLane = null, hits = 0, lastForced = -9;

  // そのレーンで、いちばん早く足元に着く危ないもの[秒]
  const hazard = (ln, v) => {
    let t = Infinity;
    for (const p of s.poops) {
      if (p.done || p.big || p.z <= 0 || p.lane !== ln) continue;
      t = Math.min(t, p.z / v);
    }
    for (const d of s.deer) {
      if (d.done || d.z <= 0 || d.lane !== ln) continue;
      t = Math.min(t, d.z / (v + C.DEER_SPEED));
    }
    return t;
  };
  const bigIn = (v) => {
    let t = Infinity;
    for (const p of s.poops) if (!p.done && p.big && p.z > 0) t = Math.min(t, p.z / v);
    return t;
  };

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

    const v = C.speed(s.t);
    const h0 = hazard(0, v), h1 = hazard(1, v), hb = bigIn(v);

    /**
     * **避けようのない場面**＝どちらのレーンも反応時間より短い間隔で塞がるとき、
     * または、とばなければならないのと同時にレーンを移らされるとき。
     * 当たった瞬間の直前にその場面が無ければ、それは理不尽な被弾。
     */
    if (isFinite(h0) && isFinite(h1) && Math.abs(h0 - h1) < C.T_MIN) lastForced = s.t;
    if (isFinite(hb) && Math.abs(Math.min(h0, h1) - hb) < C.T_MIN) lastForced = s.t;
    const now = s.poopHits + s.deerHits;
    if (now > hits) {
      hits = now;
      if (s.t - lastForced > 0.6) seen.unfair++;
    }

    let down, lane = M.input.lane;
    if (spec.play === "left") { down = true; lane = 0; }
    else if (spec.play === "up") { down = false; }
    else {
      // でかいのが来る直前は手を離す（＝顔を上げてとぶ）
      if (hb < 0.40) down = false;
      else { down = true; lane = h0 > h1 ? 0 : 1; }
    }

    if (wasDown !== null && down !== wasDown) seen.toggles++;
    if (wasLane !== null && lane !== wasLane) seen.moves++;
    wasDown = down; wasLane = lane;
    M.input.down = down;
    M.input.lane = lane;

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
`;

async function drive(page, seconds, play, extra = {}) {
  await page.evaluate(BOT);
  return page.evaluate((spec) => window.__bot(spec), { seconds, play, ...extra });
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
 *
 * 横スクロール版では「座標を一切読まない」で縛っていたが、縦になって
 * 左右によけるようになったので、そこは読む。ただし**左半分か右半分か、
 * それだけ**。的は幅195pxが2つ。ここが崩れると「あと3px」が戻ってくる。
 */
const inputSrc = await readFile(resolve(DIST, "../src/input.ts"), "utf8");
check("縦の位置は読んでいない", !/clientY|offsetY|\.top\b/.test(inputSrc));

await start();
const touch = await page.evaluate(async () => {
  const M = window.__mtd;
  const el = document.getElementById("stage");
  const send = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: 1, bubbles: true, clientX: x, clientY: y,
  }));
  const at = (x, y) => {
    send("pointerdown", x, y);
    const r = { down: M.input.down, lane: M.input.lane };
    send("pointerup", x, y);
    return r;
  };
  return {
    farLeftTop: at(4, 40), nearLeftBottom: at(190, 820),
    nearRightTop: at(200, 40), farRightBottom: at(386, 820),
    released: M.input.down,
  };
});
check("触ると下を見る", touch.farLeftTop.down === true);
check("離すと前を見る", touch.released === false);
/** **左半分ならどこを触っても同じ。右半分も同じ。** */
check("左半分は、上でも下でも端でも同じ",
  touch.farLeftTop.lane === 0 && touch.nearLeftBottom.lane === 0,
  `x=4,y=40 → ${touch.farLeftTop.lane} ／ x=190,y=820 → ${touch.nearLeftBottom.lane}`);
check("右半分は、上でも下でも端でも同じ",
  touch.nearRightTop.lane === 1 && touch.farRightBottom.lane === 1,
  `x=200,y=40 → ${touch.nearRightTop.lane} ／ x=386,y=820 → ${touch.farRightBottom.lane}`);

// ---- いちばん守りたいこと ----
section("どっちも同時には見られない");
/**
 * **絵として本当に消えているかを、画素で確かめる。**
 *
 * 薄い暗幕で「読めるが読みにくい」にしていたら、下を向いたまま鹿を
 * 見張れてしまい、それだけで芯が死んだ。ここは本当に無くす。
 */
await start();
const hidden = await page.evaluate(async () => {
  const M = window.__mtd, s = M.state, C = M.config;
  s.intro = 0;
  s.poops = [];
  s.deer = [{ z: 220, lane: 0, done: false }];
  const cv = document.getElementById("screen");
  const g = cv.getContext("2d");
  const wait = (n) => new Promise((r) => {
    const f = () => (n-- > 0 ? requestAnimationFrame(f) : r());
    f();
  });
  const count = (rgb, tol) => {
    const d = g.getImageData(0, C.HUD_H, C.VIEW.w, C.VIEW.h - C.HUD_H).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol
        && Math.abs(d[i + 2] - rgb[2]) < tol) n++;
    }
    return n;
  };
  const DEER = [0xa8, 0x7a, 0x4a];   // 鹿の胴
  const POOP = [0x3d, 0x2b, 0x1f];   // フンの本体

  M.input.down = false;
  await wait(30);
  const deerUp = count(DEER, 22);
  M.input.down = true;
  await wait(40);
  const deerDown = count(DEER, 22);

  // フンだけにして、同じことを逆向きに見る
  s.deer = [];
  s.poops = [{ z: 150, lane: 0, big: false, done: false },
             { z: 210, lane: 1, big: false, done: false }];
  M.input.down = true;
  await wait(30);
  const poopDown = count(POOP, 10);
  M.input.down = false;
  await wait(40);
  const poopUp = count(POOP, 10);
  return { deerUp, deerDown, poopDown, poopUp };
});
check("前を見ていれば鹿が見える", hidden.deerUp > 30, `鹿の色 ${hidden.deerUp} 画素`);
check("下を向いているあいだ鹿は見えない", hidden.deerDown === 0, `鹿の色 ${hidden.deerDown} 画素`);
check("下を向いていればフンが見える", hidden.poopDown > 20, `フンの色 ${hidden.poopDown} 画素`);
check("前を見ているあいだ足元は見えない", hidden.poopUp === 0, `フンの色 ${hidden.poopUp} 画素`);

/**
 * **合図も出さない。**
 * 予告があれば下を向いたままで済んでしまい、
 * 「ずっと触っていて鹿が来たら離す」が復活する。
 */
const renderSrc = await readFile(resolve(DIST, "../src/render.ts"), "utf8");
check("鹿が来る予告を画面に出していない", !/warn/i.test(renderSrc));

/**
 * **顔を上げる隙が、ちゃんとあること。**
 * フンは「区間」で来るので、そのあいだ下を向きっぱなしになる。
 * そして鹿は、その一巡のあいだに気づける長さだけ見えていなければならない。
 */
const rhythm = await page.evaluate(() => {
  const C = window.__mtd.config;
  const out = [];
  for (let t = 0; t <= 200; t += 20) {
    const v = C.speed(t);
    out.push({
      down: (C.dirtyRun(t).max * C.STEP_Z) / v,
      gap: (C.cleanRun(t).min * C.STEP_Z) / v,
      see: C.DEER_Z / (v + C.DEER_SPEED),
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
  let poop = Infinity, deer = Infinity;
  for (let t = 0; t < 400; t += 2) {
    poop = Math.min(poop, C.poopLead(t));
    deer = Math.min(deer, C.deerLead(t));
  }
  return { poop, deer };
});
check("フンは、見えてから届くまで反応時間より長い", lead.poop > 0.45 + 0.25,
  `${lead.poop.toFixed(2)}秒（反応時間の下限 0.45秒）`);
check("鹿は、出てから届くまで反応時間より長い", lead.deer > 0.45 + 0.25,
  `${lead.deer.toFixed(2)}秒`);

/**
 * **フンは横の px を持たない。レーン番号だけ。**
 *
 * px で持たせた時点で「あと3px 左にいれば助かった」が生まれる。
 * 旧版を丸ごと捨てた理由がそれだった。型で塞ぐ。
 */
const stateSrc = await readFile(resolve(DIST, "../src/state.ts"), "utf8");
const poopDecl = stateSrc.slice(stateSrc.indexOf("interface Poop"),
  stateSrc.indexOf("}", stateSrc.indexOf("interface Poop")));
check("フンが横のpxを持っていない（レーン番号だけ）", !/^\s*x\s*:/m.test(poopDecl));
const gameSrc = await readFile(resolve(DIST, "../src/game.ts"), "utf8");
check("当たり判定がレーン番号だけで決まっている",
  /p\.lane !== s\.lane/.test(gameSrc) && /d\.lane !== s\.lane/.test(gameSrc)
  && !/HIT_HALF/.test(gameSrc));

/** レーンを1本移るのにかかる時間は、段の間隔より短くなければ間に合わない。 */
const move = await page.evaluate(() => {
  const C = window.__mtd.config;
  let worst = Infinity;
  for (let t = 0; t < 400; t += 2) worst = Math.min(worst, C.STEP_Z / C.speed(t));
  return { worst, lane: C.LANE_TIME };
});
check("次の段が来るまでに、レーンを移りきれる", move.worst > move.lane * 1.5,
  `段の間隔 ${move.worst.toFixed(2)}秒 ／ 移るのに ${move.lane.toFixed(2)}秒`);

// **教える時間（intro）を飛ばして、本番の濃さで見る。**
const skipIntro = async (t) => {
  await start();
  await page.evaluate((tt) => {
    window.__mtd.state.t = tt;
    window.__mtd.state.intro = 0;
  }, t);
};

await skipIntro(90);
const perfect = await drive(page, 30, "perfect");
const perfectHits = perfect.poopHits + perfect.deerHits;
check("正しく動いていれば、避けようのない場面でしか当たらない",
  perfect.unfair === 0,
  `理不尽な被弾${perfect.unfair} / 被弾${perfectHits} / わざと重ねた回数${perfect.clashSpawns} / ${perfect.dodges}回よけた`);

await start();
const onlyLeft = await drive(page, 30, "left");
check("左を触りっぱなしだと踏んで終わる", onlyLeft.phase === "over" && onlyLeft.poopHits > 0,
  `${onlyLeft.dist.toFixed(0)}px / フン${onlyLeft.poopHits} 鹿${onlyLeft.deerHits}`);

await start();
const onlyUp = await drive(page, 30, "up");
check("離しっぱなしだと、よけられなくて終わる",
  onlyUp.phase === "over" && onlyUp.poopHits + onlyUp.deerHits > 0,
  `${onlyUp.dist.toFixed(0)}px / フン${onlyUp.poopHits} 鹿${onlyUp.deerHits}`);

// ---- でかいフン ----
section("でかいフンは とびこえる");
/**
 * **下を向いているだけでは避けられないものが要る。**
 *
 * でかいフンは両レーンをふさぐので、左右では逃げられない。
 * とぶには助走が要るので、うつむいたままでは越えられない——
 * 見るのは下、越えるのは上。この逆向きが山になる。
 */
await skipIntro(30);
const jumpRun = await drive(page, 30, "perfect");
check("手をはなしていれば とびこえられる", jumpRun.jumps > 0,
  `${jumpRun.jumps} 回とびこえた`);

/**
 * 越えられる／越えられないを、**その場に1個置いて**確かめる。
 * 走らせて出会うのを待つと、出会う前に死んで「0回踏んだ」で落ちる。
 * 規則そのものを見たいので、規則だけを置く。
 */
const bigRule = await page.evaluate(async () => {
  const M = window.__mtd, s = M.state;
  const wait = (n) => new Promise((r) => {
    const f = () => (n-- > 0 ? requestAnimationFrame(f) : r());
    f();
  });
  const trial = async (down) => {
    M.start();
    await wait(2);
    s.intro = 0;
    s.poops = [{ z: 90, lane: -1, big: true, done: false }];
    s.deer = [];
    s.jumps = 0;
    s.jumpMiss = 0;
    M.input.down = down;
    await wait(70);
    return { jumps: s.jumps, miss: s.jumpMiss };
  };
  return { up: await trial(false), down: await trial(true) };
});
check("手をはなしていれば、でかいフンを越えられる",
  bigRule.up.jumps === 1 && bigRule.up.miss === 0,
  `とびこえた ${bigRule.up.jumps} 回 / 踏んだ ${bigRule.up.miss} 回`);
check("下を向いたままでは、でかいフンは越えられない",
  bigRule.down.jumps === 0 && bigRule.down.miss === 1,
  `とびこえた ${bigRule.down.jumps} 回 / 踏んだ ${bigRule.down.miss} 回`);

/**
 * **でかいフンの手前は空いている。**
 * 左右を選んでいる姿勢のまま、いきなり「手を離せ」が来たら避けようが無い。
 * 手前を空けて、そこを顔を上げる隙にしてある。
 */
const gap = await page.evaluate(() => new Promise((done) => {
  const M = window.__mtd, s = M.state, C = M.config;
  s.intro = 0;
  s.t = 90;
  s.poops = [];
  s.deer = [];
  s.runLeft = 0;
  s.runDirty = false;
  s.bigAt = -1;
  s.nextStepZ = C.POOP_SEE;
  const measured = new WeakSet();
  let worst = Infinity, n = 0;
  const t0 = performance.now();
  const tick = () => {
    s.dirt = 0;
    s.trip = 0;
    s.phase = "playing";
    M.input.down = true;
    // **出てきた瞬間に測る。**同じ区間の小さいフンは、もう手前に並んでいる
    for (const b of s.poops) {
      if (!b.big || measured.has(b)) continue;
      measured.add(b);
      // **でかいのの「ひとつ手前」**＝ z が小さいほうで、いちばん近いもの。
      // z は先ほど遠いので、min を取ると区間のいちばん奥を拾ってしまう。
      let last = -Infinity;
      for (const p of s.poops) if (!p.big && p.z < b.z) last = Math.max(last, p.z);
      if (!isFinite(last)) continue;
      n++;
      worst = Math.min(worst, b.z - last);
    }
    if (performance.now() - t0 < 16000) requestAnimationFrame(tick);
    else done({ worst, n, need: (C.BIG_GAP + 1) * C.STEP_Z, v: C.speed(s.t) });
  };
  requestAnimationFrame(tick);
}));
check("でかいフンの手前は空いている",
  gap.n >= 3 && gap.worst >= gap.need - 6,
  `いちばん詰まって ${gap.worst.toFixed(0)}px（${(gap.worst / gap.v).toFixed(2)}秒）/ ${gap.n} 個で確認`);

/**
 * **「すれすれ！」が本当に鳴ること。**
 * ぎりぎりまで待って動いたら褒める、という上乗せがあるのに、
 * 切り替えた時刻を誰も記録していなくて一度も出ていなかったことがある。
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
  s.lane = 0;
  s.lx = 0;
  M.input.down = true;
  M.input.lane = 0;
  await wait(4);
  M.input.lane = 1;                 // いま移った
  await wait(1);
  s.poops.push({ z: 12, lane: 0, big: false, done: false });
  await wait(14);
  return { nices: s.nices, since: s.t - Math.max(s.lastLook, s.lastMove) };
});
check("ぎりぎりで動いたら すれすれが出る", grazed.nices > 0,
  `動いてから ${grazed.since.toFixed(2)}秒 で通過 / すれすれ ${grazed.nices} 回`);

// ---- 1回の長さ ----
section("1回の長さ");
await start();
const full = await drive(page, 90, "perfect");
check("上手く動いていれば30秒は走れる", full.t > 30,
  `${full.t.toFixed(0)}秒 / ${full.dist.toFixed(0)}px / くつ${full.dirt} / わざと重ねた回数${full.clashSpawns}`);
check("左右にも視線にも、何度も動くことになる", full.moves > 20 && full.toggles > 8,
  `左右 ${full.moves} 回 ／ 視線 ${full.toggles} 回`);
/**
 * わざと重ねる場面は、確率で出しているので**短い窓で数えると運任せ**になる。
 * 30秒だと 5回に1回ほど 0回になった。長いほうの走行で数える。
 */
check("きわどい二連がちゃんと起きる", full.clashSpawns > 0,
  `90秒で ${full.clashSpawns} 回`);

console.log(`\nコンソールエラー: ${errors.length ? errors.join(" / ") : "なし"}`);
if (errors.length) failures++;
console.log(failures ? `\n${failures} 件 失敗` : "\nすべて通過");

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
