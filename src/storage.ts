/**
 * 保存。端末内だけで完結する（サーバーは使わない）。
 *
 * ブラウザでは localStorage がそのまま使える。
 * ネイティブ（WebView）では localStorage がアプリの更新や WebView の作り直しで
 * 消えることがあるので、**書くときはネイティブ側にも同じものを渡し、
 * 起動時はネイティブが流し込んだ値を先に見る。**
 * 「たぶん残っている」に★100個ぶんの記録を預けるわけにはいかない。
 */

import * as C from "./config";
import { seeded, send } from "./native";

const KEY = {
  stars: "mtd.stars",
  ranking: "mtd.ranking",
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

// ---- ステージの★ ----

/** 添字 0 が ステージ1。0 は未クリア。 */
export function loadStars(): number[] {
  const raw = load<number[]>(KEY.stars, []);
  const out = new Array<number>(C.STAGE_COUNT).fill(0);
  for (let i = 0; i < Math.min(raw.length, C.STAGE_COUNT); i++) {
    out[i] = Math.max(0, Math.min(3, raw[i] | 0));
  }
  return out;
}

/** 前より良いときだけ更新する。更新したら true。 */
export function recordStars(stars: number[], stage: number, got: number): boolean {
  const i = stage - 1;
  if (got <= stars[i]) return false;
  stars[i] = got;
  save(KEY.stars, stars);
  return true;
}

export function areaStars(stars: number[], area: number): number {
  let sum = 0;
  for (let i = 0; i < C.STAGES_PER_AREA; i++) sum += stars[area * C.STAGES_PER_AREA + i];
  return sum;
}

/** エリアが開いているか。前のエリアで★が規定数たまると開く。 */
export function areaUnlocked(stars: number[], area: number): boolean {
  if (area === 0) return true;
  return areaStars(stars, area - 1) >= C.AREA_UNLOCK_STARS;
}

/** ステージが開いているか。エリアが開いていて、かつ前のステージをクリア済み。 */
export function stageUnlocked(stars: number[], stage: number): boolean {
  const area = C.areaOf(stage);
  if (!areaUnlocked(stars, area)) return false;
  if (stage % C.STAGES_PER_AREA === 1) return true; // 各エリアの1面
  return stars[stage - 2] > 0;
}

export function totalStars(stars: number[]): number {
  return stars.reduce((a, b) => a + b, 0);
}

// ---- エンドレスのランキング（端末内） ----

export interface RankEntry {
  score: number;
  dist: number;
  graze: number;
  at: number;
}

export const RANK_SIZE = 10;

export function loadRanking(): RankEntry[] {
  const raw = load<RankEntry[]>(KEY.ranking, []);
  return raw
    .filter((e) => e && typeof e.score === "number")
    .sort((a, b) => b.score - a.score)
    .slice(0, RANK_SIZE);
}

/** 順位（1始まり）を返す。圏外なら 0。 */
export function recordScore(ranking: RankEntry[], entry: RankEntry): number {
  ranking.push(entry);
  ranking.sort((a, b) => b.score - a.score);
  ranking.splice(RANK_SIZE);
  save(KEY.ranking, ranking);
  const i = ranking.indexOf(entry);
  return i < 0 ? 0 : i + 1;
}

// ---- 設定 ----

export function loadSound(): boolean {
  return load(KEY.sound, true);
}
export function saveSound(v: boolean): void {
  save(KEY.sound, v);
}
