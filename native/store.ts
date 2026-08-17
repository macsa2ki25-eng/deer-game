/**
 * 端末への保存。
 *
 * ゲーム本体は web アプリなので localStorage で書いているが、
 * WebView の localStorage はアプリ更新や WebView の作り直しで消えることがある。
 * ★100個ぶんの記録を「たぶん残っている」に預けるわけにはいかないので、
 * 書かれた値をこちら（AsyncStorage）にも写しておき、起動時に流し込む。
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "mtd.save.v1";

/** ゲーム側のキーと、その JSON 文字列。 */
export type Saved = Record<string, string>;

export async function loadAll(): Promise<Saved> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Saved = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 1件書く。書き込みは短時間に何度も来る（★更新・ランキング・設定）ので、
 * 1件ごとにディスクへ行かず、少しまとめてから書く。
 */
let cache: Saved = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function seed(saved: Saved): void {
  cache = { ...saved };
}

export function set(key: string, json: string): void {
  cache[key] = json;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {
      /* 書けなくても遊びは止めない */
    });
  }, 400);
}
