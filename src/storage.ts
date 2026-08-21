/**
 * 保存。端末内だけで完結する（サーバーは使わない）。
 *
 * ブラウザでは localStorage がそのまま使える。
 * ネイティブ（WebView）では localStorage がアプリの更新や WebView の作り直しで
 * 消えることがあるので、**書くときはネイティブ側にも同じものを渡し、
 * 起動時はネイティブが流し込んだ値を先に見る。**
 * 「たぶん残っている」に自己ベストを預けるわけにはいかない。
 */

import { seeded, send } from "./native";

const KEY = {
  best: "mtd.best",
  sound: "mtd.sound",
};

function load<T>(key: string, fallback: T): T {
  // ネイティブが持っている値を優先する。localStorage が空でも復元できる。
  let raw: string | null | undefined = seeded(key);
  if (raw === undefined) {
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
  }
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
  } catch {
    /* プライベートモード等では諦める。ネイティブ側には下で渡す */
  }
  send("store:set", { key, json });
}

// ---- 自己ベスト ----

/** 残すのはこれ1つだけ。ステージも★もランキングも無くなったので。 */
export function loadBest(): number {
  const v = load<number>(KEY.best, 0);
  return Number.isFinite(v) ? v : 0;
}
export function saveBest(v: number): void {
  save(KEY.best, Math.floor(v));
}

// ---- 音 ----

export function loadSound(): boolean {
  return load(KEY.sound, true);
}
export function saveSound(v: boolean): void {
  save(KEY.sound, v);
}
