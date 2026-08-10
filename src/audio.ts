/**
 * 効果音。矩形波とノイズの実行時合成なので音源ファイルが要らない（容量ほぼゼロ、完全オフライン）。
 *
 * 鹿の鼻息は演出ではなく仕様。目を足元に取られていても接近が分かる、
 * 唯一の手がかりとして設計に組み込んである。
 */

let ac: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

/** 最初のユーザー操作で呼ぶ。iOS はこれが無いと鳴らない。 */
export function unlock(): void {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    ac = new Ctor();
    const len = Math.floor(ac.sampleRate * 0.4);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") void ac.resume();
}

export function setEnabled(v: boolean): void {
  enabled = v;
}

export function isEnabled(): boolean {
  return enabled;
}

function tone(freq: number, dur: number, gain: number, to = freq, type: OscillatorType = "square"): void {
  if (!ac || !enabled) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(dur: number, gain: number, from: number, to: number): void {
  if (!ac || !enabled || !noiseBuf) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(from, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  /** 鹿の予兆。前方に鹿が入ってくる合図。 */
  snort(): void {
    noise(0.1, 0.1, 900, 300);
    tone(130, 0.13, 0.07, 80);
  },
  /** 牡鹿の「ため」。突進が来る。 */
  paw(): void {
    noise(0.07, 0.09, 1600, 500);
    tone(90, 0.2, 0.06, 70);
  },
  /** フンをかすめた。頻繁に鳴るので短く小さく。 */
  graze(big: boolean): void {
    tone(big ? 1200 : 900, 0.05, big ? 0.07 : 0.035, big ? 1800 : 1300);
  },
  /** フンを踏んだ。 */
  squish(): void {
    noise(0.17, 0.14, 1400, 180);
  },
  /** 鹿に当たった。 */
  bump(): void {
    tone(220, 0.2, 0.15, 60);
    noise(0.09, 0.1, 600, 120);
  },
  /** 鹿が道端で1粒落とした。 */
  plop(): void {
    noise(0.06, 0.09, 700, 160);
    tone(180, 0.07, 0.05, 90);
  },
  /** 休憩区間に入った。 */
  rest(): void {
    tone(660, 0.09, 0.08);
    setTimeout(() => tone(880, 0.13, 0.08), 95);
  },
  /** ステージクリア。 */
  clear(): void {
    tone(523, 0.11, 0.1);
    setTimeout(() => tone(659, 0.11, 0.1), 110);
    setTimeout(() => tone(784, 0.11, 0.1), 220);
    setTimeout(() => tone(1047, 0.3, 0.11), 330);
  },
  /** ゲームオーバー。 */
  over(): void {
    tone(400, 0.14, 0.12, 380);
    setTimeout(() => tone(300, 0.16, 0.12, 285), 150);
    setTimeout(() => tone(200, 0.4, 0.12, 90), 320);
  },
};
