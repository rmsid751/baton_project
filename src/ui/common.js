// 공통 UI 조각
import { html } from '../lib.js';
import { Icon } from '../icons.js';
import { CATS } from '../engine.js';

export const STATUS = {
  none: { label: '인계서 생성 전', cls: 'st-none' },
  draft: { label: '초안', cls: 'st-draft' },
  pending: { label: '입회대기', cls: 'st-pending' },
  rejected: { label: '반려', cls: 'st-rejected' },
  approved: { label: '입회완료', cls: 'st-approved' },
};

export function StatusBadge({ status }) {
  const st = STATUS[status];
  return html`<span class=${`badge pill ${st.cls}`}>${st.label}</span>`;
}

export function ReadOnlyBadge() {
  return html`<span class="badge pill st-readonly"><${Icon} name="lock" size=${13} />열람 전용</span>`;
}

/**
 * 분류 기호. 분기별·반기별은 글꼴에 따라 모양이 달라지지 않도록 직접 그린다:
 * 같은 원 테두리 안에 분기별은 1/4, 반기별은 1/2을 채운다.
 */
const PIE = {
  quarterly: 'M6 6V1.6A4.4 4.4 0 0 1 10.4 6Z',
  semiannual: 'M6 1.6A4.4 4.4 0 0 0 6 10.4Z',
};
export function CatSym({ cat }) {
  if (PIE[cat]) {
    return html`<svg class="sym-svg" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.9" fill="none" stroke="currentColor" stroke-width="1.3" />
      <path d=${PIE[cat]} fill="currentColor" />
    </svg>`;
  }
  return CATS[cat]?.sym || '';
}

export function CatBadge({ cat }) {
  const c = CATS[cat];
  return html`<span class=${`cat-badge cat-${cat}`}><span class="sym"><${CatSym} cat=${cat} /></span>${c.label}</span>`;
}

export function AIBadge({ label = 'AI 답변' }) {
  return html`<span class="ai-badge"><${Icon} name="sparkle" size=${12} />${label}</span>`;
}

/** **굵게** 표기만 해석하는 안전한 텍스트 렌더 */
export function Rich({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? html`<strong>${p.slice(2, -2)}</strong>` : p));
}

export function RichLines({ text, streaming }) {
  const lines = String(text || '').replace(/\*\*$/, '').split('\n').map((l) => l.replace(/^\s*[-•*]\s+/, '').trim()).filter(Boolean);
  return lines.map((l, i) => html`<p class="brief-line">
    <${Rich} text=${l} />${streaming && i === lines.length - 1 && html`<span class="cursor">▍</span>`}
  </p>`);
}

export function Empty({ title, desc, children, char = 'char-giver', chars }) {
  const list = chars || [char];
  return html`<div class="empty glass fade-up">
    <div class=${list.length > 1 ? 'empty-chars pair' : 'empty-chars'}>
      ${list.map((c) => html`<img key=${c} class=${`empty-char ${c}`} src=${`assets/landing/${c}.webp`} alt="" />`)}
    </div>
    <h2>${title}</h2>
    ${desc && html`<p class="muted">${desc}</p>`}
    ${children}
  </div>`;
}

export const monthLabel = (m) => `${m}월`;
