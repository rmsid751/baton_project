// 알림함 패널 + 토스트
import { html, useEffect } from '../lib.js';
import { Icon } from '../icons.js';
import { markAllRead, markRead, setTab, setUI, useStore, useUI } from '../store.js';
import { cx, fmtStamp } from '../util.js';

const TYPE_ICON = { question: 'message', reply: 'message', approval: 'clipboard', reject: 'info' };

export function NotifPanel() {
  const s = useStore();
  const ui = useUI();
  const open = ui.notifOpen && !!s.session.role;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setUI({ notifOpen: false }); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!s.session.role) return null;
  const list = s.notifications.filter((n) => n.toRole === s.session.role && n.positionId === s.session.positionId);

  const go = (n) => {
    markRead(n.id);
    setTab('current');
    setUI({ notifOpen: false, highlight: n.itemId ? { itemId: n.itemId, qaId: n.qaId, at: Date.now() } : null });
    if (!n.itemId) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return html`
    <div class=${cx('scrim', open && 'show')} onClick=${() => setUI({ notifOpen: false })}></div>
    <aside class=${cx('notif-panel glass', open && 'open')} aria-hidden=${!open} aria-label="알림함">
      <div class="np-head">
        <h2 class="h3">알림함</h2>
        <span class="muted small">메일 알림과 같은 내용 · 실제 발송은 하지 않습니다</span>
        <span class="grow"></span>
        ${list.some((n) => !n.read) && html`<button class="btn-text sm" onClick=${() => markAllRead(s.session.role, s.session.positionId)}>모두 읽음</button>`}
        <button class="icon-btn" onClick=${() => setUI({ notifOpen: false })} aria-label="닫기"><${Icon} name="x" /></button>
      </div>
      <div class="np-list">
        ${list.length === 0 && html`<div class="np-empty"><${Icon} name="mail" size=${28} /><p class="muted">받은 알림이 없습니다</p></div>`}
        ${list.map((n) => html`<article key=${n.id} class=${cx('np-item', !n.read && 'unread')}>
          <span class="np-dot" aria-hidden="true"></span>
          <span class=${`np-ic t-${n.type}`}><${Icon} name=${TYPE_ICON[n.type] || 'mail'} size=${17} /></span>
          <div class="np-body">
            <p class="np-title">${n.title}</p>
            <p class="small muted">${n.path}</p>
            ${n.body.map((b) => html`<p class="np-quote"><span class="muted small">${b.label}</span>${b.text}</p>`)}
            <div class="np-foot">
              <span class="small muted tnum">${n.author} · ${fmtStamp(n.at)}</span>
              <span class="grow"></span>
              <button class="btn-text sm" onClick=${() => go(n)}>바로가기<${Icon} name="arrowRight" size=${15} /></button>
            </div>
          </div>
        </article>`)}
      </div>
    </aside>`;
}

export function Toasts() {
  const ui = useUI();
  return html`<div class="toasts" aria-live="polite">
    ${ui.toasts.map((t) => html`<div key=${t.id} class=${`toast glass t-${t.tone}`}><${Icon} name=${t.tone === 'ok' ? 'check' : 'info'} size=${16} />${t.text}</div>`)}
  </div>`;
}
