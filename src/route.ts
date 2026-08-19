/**
 * 「通れるか」の判定。区間（interval）の計算だけを持つ、地形の内容を知らない部品。
 *
 * ここが v0.10 の設計の芯。それまでは
 *
 *     先に通れる回廊を1本引いて、その外側にだけ物を置く
 *
 * という作りだった。生成のやり直しが起きず、抜けられない配置も原理的に作られない。
 * 代わりに**回廊という「正解の道」が常に1本存在してしまう**。
 * 隠す工夫（小石・幅の揺らぎ・見せかけの道）を重ねたが、根本は変わらなかった。
 *
 * 入れ替えた。
 *
 *     好きなだけ物を置く → 通れるか調べる → 通れないぶんだけ取り除く
 *
 * こうすると「決められた道」は消える。空いている場所は毎行たまたま空いているだけで、
 * 分岐もするし行き止まりにもなる。**行き止まりは作り物ではなく、勝手に生まれる。**
 * 保証するのは1つだけ——「どこかに1本、最後まで続く道がある」こと。
 *
 * ---
 *
 * 到達可能集合の作り方。行が1本進むあいだにプレイヤーが横に動ける量を r とすると
 *
 *     次の行の到達範囲 = （いまの到達範囲を左右に r 広げたもの） ∩ （次の行の空き）
 *
 * これが空になったら通れない。空にならないところまで物を取り除く。
 */

/** 閉区間 [a, b]。a <= b を常に保つ。 */
export type Span = { a: number; b: number };

/** 重なっている区間をつないで、左から順に並べ直す。 */
export function normalise(spans: Span[]): Span[] {
  if (spans.length <= 1) return spans.filter((s) => s.b > s.a);
  const sorted = [...spans].filter((s) => s.b > s.a).sort((x, y) => x.a - y.a);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.a <= last.b) last.b = Math.max(last.b, s.b);
    else out.push({ ...s });
  }
  return out;
}

/** 左右に r ずつ広げる（1行ぶん動ける量）。 */
export function grow(spans: Span[], r: number): Span[] {
  return normalise(spans.map((s) => ({ a: s.a - r, b: s.b + r })));
}

export function intersect(x: Span[], y: Span[]): Span[] {
  const out: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const a = Math.max(x[i].a, y[j].a);
    const b = Math.min(x[i].b, y[j].b);
    if (b > a) out.push({ a, b });
    if (x[i].b < y[j].b) i++;
    else j++;
  }
  return out;
}

/** span から blocked を引く。 */
export function subtract(base: Span[], blocked: Span[]): Span[] {
  const cut = normalise(blocked);
  let out = base;
  for (const c of cut) {
    const next: Span[] = [];
    for (const s of out) {
      if (c.b <= s.a || c.a >= s.b) {
        next.push(s);
        continue;
      }
      if (c.a > s.a) next.push({ a: s.a, b: c.a });
      if (c.b < s.b) next.push({ a: c.b, b: s.b });
    }
    out = next;
  }
  return out;
}

export function widest(spans: Span[]): Span | null {
  let best: Span | null = null;
  for (const s of spans) if (!best || s.b - s.a > best.b - best.a) best = s;
  return best;
}

export function width(spans: Span[]): number {
  const w = widest(spans);
  return w ? w.b - w.a : 0;
}

export function contains(spans: Span[], x: number): boolean {
  for (const s of spans) if (x >= s.a && x <= s.b) return true;
  return false;
}

/** その位置にいちばん近い到達可能な点。到達範囲が空なら null。 */
export function nearest(spans: Span[], x: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of spans) {
    const p = Math.max(s.a, Math.min(s.b, x));
    const d = Math.abs(p - x);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
