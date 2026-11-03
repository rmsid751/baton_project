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

/** 분류 기호. 분기별은 글꼴에 따라 모양이 달라지지 않도록 1/4원을 직접 그린다 */
export function CatSym({ cat }) {
  if (cat === 'quarterly') {
    return html`<svg class="sym-svg" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10.5V2.5a8 8 0 0 1 8 8Z" fill="currentColor" /></svg>`;
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
