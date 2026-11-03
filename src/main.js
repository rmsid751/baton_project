import { html, render } from './lib.js';
import { useStore } from './store.js';
import { Landing } from './ui/landing.js';
import { LandingBar, TopBar } from './ui/topbar.js';
import { OnePage } from './ui/onepage.js';
import { Modals } from './ui/modals.js';
import { NotifPanel, Toasts } from './ui/notifs.js';
import { TipLayer } from './ui/viz.js';

function Atmos({ soft }) {
  return html`<div class=${`atmos${soft ? ' soft' : ''}`} aria-hidden="true">
    <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i>
  </div>`;
}

function App() {
  const s = useStore();
  const inApp = !!s.session.role;
  return html`<div class="app">
    <${Atmos} soft=${inApp} />
    ${inApp ? html`<${TopBar} />` : html`<${LandingBar} />`}
    <main class="page page-enter" key=${inApp ? `one-${s.session.personId}-${s.session.positionId}` : 'landing'}>
      ${inApp ? html`<${OnePage} />` : html`<${Landing} />`}
    </main>
    <${NotifPanel} />
    <${Modals} />
    <${Toasts} />
    <${TipLayer} />
  </div>`;
}

// 탭이 보이지 않으면 애니메이션 멈춤
document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('paused', document.hidden);
});

render(html`<${App} />`, document.getElementById('root'));
