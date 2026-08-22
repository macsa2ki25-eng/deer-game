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
  /** フンを跨いだ。**避けられた合図。**軽く高く、連続で鳴っても濁らない音。 */
  step(): void {
    tone(1100, 0.045, 0.045, 1500);
  },
  /** 大きいフンをとびこえた。**危険を越えた音**なので、上がって、はっきり。 */
  jump(): void {
    tone(660, 0.06, 0.08, 1200);
    setTimeout(() => tone(990, 0.12, 0.08, 1500), 60);
  },
  /** 鹿をよけた。すれ違う風。 */
  woosh(): void {
    noise(0.12, 0.06, 2200, 600);
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
  /** 鹿せんべいを手に入れた。 */
  pickup(): void {
    tone(784, 0.08, 0.1);
    setTimeout(() => tone(1047, 0.14, 0.1), 80);
  },
  /** ゲームオーバー。 */
  over(): void {
    tone(400, 0.14, 0.12, 380);
    setTimeout(() => tone(300, 0.16, 0.12, 285), 150);
    setTimeout(() => tone(200, 0.4, 0.12, 90), 320);
  },
};
