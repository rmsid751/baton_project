// 공통 상단바 — 서비스명, 현재 사용자, [처음으로], 알림, 날짜 변경, 리셋
import { html, useEffect, useRef, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { DEFAULT_TODAY, MOVE_DATE, PERSON, POSITION, ROLES } from '../data/seed.js';
import { goHome, openModal, setToday, setUI, useStore, useUI } from '../store.js';
import { addDays, cx, dot } from '../util.js';

function DateControl() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);
  const presets = [
    { label: '기본 (시연일)', date: DEFAULT_TODAY },
    { label: '인사이동일', date: MOVE_DATE },
    { label: '인사이동일 + 8일', date: addDays(MOVE_DATE, 8) },
  ];
  return html`<div class="date-ctl" ref=${ref}>
    <button class=${cx('icon-btn with-label', s.today !== DEFAULT_TODAY && 'changed')} onClick=${() => setOpen(!open)} aria-label="오늘 날짜 변경" title="오늘 날짜 변경">
      <${Icon} name="calendar" /><span class="tnum">${dot(s.today)}</span>
    </button>
    ${open && html`<div class="popover glass pop-in">
      <p class="eyebrow">시연용 오늘 날짜</p>
      <input class="input" type="date" value=${s.today} onInput=${(e) => e.target.value && setToday(e.target.value)} />
      <div class="preset-list">
        ${presets.map((p) => html`<button class=${cx('chip', s.today === p.date && 'on')} onClick=${() => { setToday(p.date); setOpen(false); }}>
          ${p.label}<span class="tnum muted">${dot(p.date)}</span></button>`)}
      </div>
    </div>`}
  </div>`;
}

function ResetButton() {
  return html`<button class="icon-btn" onClick=${() => openModal({ type: 'reset' })} aria-label="초기 데이터로 리셋" title="초기 데이터로 리셋">
    <${Icon} name="reset" />
  </button>`;
}

export function LandingBar() {
  return html`<header class="topbar landing-bar">
    <div class="tb-left"><span class="brand">BATON</span></div>
    <div class="tb-right"><${DateControl} /><${ResetButton} /></div>
  </header>`;
}

export function TopBar() {
  const s = useStore();
  const ui = useUI();
  const person = PERSON[s.session.personId];
  const pos = POSITION[s.session.positionId];
  const unread = s.notifications.filter((n) => n.toRole === s.session.role && n.positionId === pos.id && !n.read).length;
  return html`<header class="topbar glass-bar">
    <div class="tb-left">
      <button class="brand as-btn" onClick=${goHome} title="처음으로">BATON</button>
      <span class="tb-sep"></span>
      <span class=${`role-badge role-${s.session.role}`}>${ROLES[s.session.role].badge}</span>
      <span class="tb-user"><strong>${person.rank} ${person.name}</strong><span class="tb-pos">${s.session.role === 'reviewer' ? `${person.title} · ${pos.title} 입회` : pos.title}</span></span>
    </div>
    <div class="tb-right">
      <button class="btn-text home" onClick=${goHome}><${Icon} name="home" size=${18} /><span>처음으로</span></button>
      <button class=${cx('icon-btn bell', ui.notifOpen && 'on')} onClick=${() => setUI({ notifOpen: !ui.notifOpen })} aria-label=${`알림 ${unread}건`} title="알림함">
        <${Icon} name="bell" />${unread > 0 && html`<span class="count-dot">${unread}</span>`}
      </button>
      <${DateControl} />
      <${ResetButton} />
    </div>
  </header>`;
}
