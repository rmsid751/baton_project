export const pad = (n) => String(n).padStart(2, '0');

export function parseDate(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const fmtDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}
export const dot = (s) => (s ? s.slice(0, 10).replaceAll('-', '.') : '');
export const fmtStamp = (s) => (s ? `${dot(s)} ${s.slice(11, 16)}` : '');
export const periodLabel = (start, end) => `${start.slice(0, 4)}.${start.slice(5, 7)}~${end.slice(0, 4)}.${end.slice(5, 7)}`;

/** 근무 개월 수 (시작월~종료월 차이) */
export function monthsBetween(start, end) {
  const n = (+end.slice(0, 4) - +start.slice(0, 4)) * 12 + (+end.slice(5, 7) - +start.slice(5, 7));
  return Math.max(n, 1);
}

/** 근무기간이 걸친 '월(1~12)' 집합. 12개월 이상이면 전체 */
export function servedMonthsOfYear(start, end) {
  const set = new Set();
  let y = +start.slice(0, 4);
  let m = +start.slice(5, 7);
  const ey = +end.slice(0, 4);
  const em = +end.slice(5, 7);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 24) {
    set.add(m);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return set;
}

export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 시연용 '오늘' 날짜 + 실제 현재 시각 */
export function stamp(today) {
  const t = new Date();
  return `${today}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

export const cx = (...a) => a.filter(Boolean).join(' ');

/** 결정적 의사난수 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function countBy(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

export function mode(arr) {
  let best = null;
  let n = 0;
  for (const [v, c] of countBy(arr)) if (c > n) { best = v; n = c; }
  return best;
}

export function scrollToId(id, block = 'center') {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block });
  return true;
}
