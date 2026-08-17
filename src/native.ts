/**
 * ネイティブ（React Native の WebView ホスト）との橋。
 *
 * ゲーム本体はふつうの web アプリのまま置いておき、
 * **web ではできないこと（広告・端末への保存）だけ**を外へ投げる。
 * ブラウザで開いたときは全部が無害な空振りになるので、
 * `npm run dev` も `npm run verify` も、この層の存在を知らないまま動く。
 *
 *   web → native   postMessage で `{ t, id?, data? }` を送る
 *   native → web   `window.__mtd_native.resolve(id, value)` / `.push(kind, value)`
 */

interface RNWebView {
  postMessage(payload: string): void;
}

interface NativeWindow {
  ReactNativeWebView?: RNWebView;
  /** 起動時にネイティブが流し込む保存済みの値。localStorage が使えなくても読める。 */
  __mtd_saved?: Record<string, string>;
  __mtd_native?: {
    resolve(id: number, value: unknown): void;
    push(kind: string, value: unknown): void;
  };
}

const w = window as unknown as NativeWindow;

/** ネイティブの中で動いているか。ブラウザなら false。 */
export function inNative(): boolean {
  return !!w.ReactNativeWebView;
}

/** 起動時に流し込まれた保存値。ネイティブ以外では常に undefined。 */
export function seeded(key: string): string | undefined {
  return w.__mtd_saved?.[key];
}

let seq = 0;
const pending = new Map<number, (value: unknown) => void>();
const listeners = new Map<string, (value: unknown) => void>();

/** 返事の要らない通知。 */
export function send(t: string, data?: unknown): void {
  w.ReactNativeWebView?.postMessage(JSON.stringify({ t, data }));
}

/**
 * 返事を待つ問い合わせ。
 * ブラウザでは即 null。ネイティブでも返事が来なければ timeout で null。
 * **null が返ることを前提に呼び出し側を書くこと**——広告は落ちるものなので。
 */
export function ask<T>(t: string, data?: unknown, timeoutMs = 60_000): Promise<T | null> {
  const rn = w.ReactNativeWebView;
  if (!rn) return Promise.resolve(null);

  const id = ++seq;
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, (value) => {
      clearTimeout(timer);
      resolve(value as T);
    });
    rn.postMessage(JSON.stringify({ t, id, data }));
  });
}

/** ネイティブからの一方通行の通知を受ける（広告の読み込み完了など）。 */
export function on(kind: string, fn: (value: unknown) => void): void {
  listeners.set(kind, fn);
}

w.__mtd_native = {
  resolve(id, value) {
    const done = pending.get(id);
    if (!done) return;
    pending.delete(id);
    done(value);
  },
  push(kind, value) {
    listeners.get(kind)?.(value);
  },
};
