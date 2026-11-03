// 랜딩 페이지 — 비주얼 배너(레이어 일러스트) + 역할 카드 3개
import { html, useEffect, useRef, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { PEOPLE, ROLES } from '../data/seed.js';
import { enter } from '../store.js';
import { cx } from '../util.js';

// layout.json 기준 위치(%). 서비스명 자리를 위해 차트는 오른쪽 위로 옮겼다.
const LAYERS = [
  { file: 'obj-chart', left: 57.5, top: 2.5, width: 17.5, depth: 4, z: 1, float: 'f2', shine: true },
  { file: 'obj-folder', left: 6.5, top: 9.5, width: 19, depth: 4, z: 1, float: 'f1', shine: true },
  { file: 'fx-alert-lines', left: 74.34, top: 16.37, width: 8.37, depth: 5, z: 1, cls: 'fx' },
  { file: 'obj-checklist', left: 81.46, top: 28.8, width: 16.27, depth: 5, z: 2, float: 'f3', shine: true },
  { file: 'obj-donut', left: 78.59, top: 57.81, width: 18.06, depth: 5, z: 2, float: 'f4', shine: true },
  { file: 'obj-calendar', left: 4.25, top: 60.57, width: 12.5, depth: 5, z: 2, float: 'f5', shine: true },
  { file: 'char-giver', left: 8.19, top: 35.18, width: 38.76, depth: 8, z: 3, cls: 'char giver', role: 'giver' },
  { file: 'char-receiver', left: 43.48, top: 26.04, width: 37.92, depth: 8, z: 4, cls: 'char receiver', role: 'receiver' },
];

const ROLE_META = {
  giver: { icon: 'handoff', tone: 'blue' },
  receiver: { icon: 'inbox', tone: 'lavender' },
  reviewer: { icon: 'clipboard', tone: 'mint' },
};

function Scene({ hop }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduce) return undefined;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const onMove = (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const tick = () => {
      x += (tx - x) * 0.1;
      y += (ty - y) * 0.1;
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return html`<div class="scene" ref=${ref} role="img" aria-label="두 캐릭터가 바통을 주고받는 일러스트">
    <div class="floor-glow"></div>
    ${LAYERS.map((l) => html`
      <div class=${cx('layer', l.cls)} style=${`left:${l.left}%;top:${l.top}%;width:${l.width}%;z-index:${l.z};--d:${l.depth}px`}>
        <div class=${cx('float', l.float, l.role && 'bob')}>
          <div class=${cx('hop', hop === l.role && 'on')}>
            <img src=${`assets/landing/${l.file}.webp`} alt="" draggable="false" />
            ${l.shine && html`<span class="shine" style=${`-webkit-mask-image:url(assets/landing/${l.file}.webp);mask-image:url(assets/landing/${l.file}.webp)`}></span>`}
          </div>
        </div>
      </div>`)}
  </div>`;
}

export function Landing() {
  const [active, setActive] = useState(null);
  const [hop, setHop] = useState(null);
  const hopTimer = useRef(0);

  const bounce = (role) => {
    if (role !== 'giver' && role !== 'receiver') return;
    setHop(null);
    requestAnimationFrame(() => setHop(role));
    clearTimeout(hopTimer.current);
    hopTimer.current = setTimeout(() => setHop(null), 450);
  };

  // 카드를 펼치면 화면 아래로 넘치는 만큼만 그 카드를 올린다 (위쪽 서비스명 글씨는 넘지 않음)
  const rolesRef = useRef();
  const textRef = useRef();
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const apply = (v) => setLift(v);
    const measure = () => {
      const roles = rolesRef.current;
      const card = roles?.querySelector('.role-card.open');
      if (!active || !card || window.innerWidth < 768) { apply(0); return; }
      // 카드 줄은 움직이지 않으므로 그 위치가 올리기 전 카드 위치다
      const rolesTop = roles.getBoundingClientRect().top;
      const openH = card.querySelector('.role-head').offsetHeight + card.querySelector('.people-inner').scrollHeight + 18;
      const overflow = rolesTop + openH - (window.innerHeight - 24);
      const maxLift = rolesTop - (textRef.current.getBoundingClientRect().bottom + 24);
      apply(Math.round(Math.max(0, Math.min(overflow, maxLift))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  return html`<section class="landing">
    <div class="hero">
      <div class="hero-text" ref=${textRef}>
        <h1 class="wordmark">BATON</h1>
        <p class="hero-sub">인계인수 체계</p>
        <p class="hero-line">사람은 떠나도, 업무는 이어집니다</p>
      </div>
      <div class="scene-clip"><${Scene} hop=${hop} /></div>
    </div>
    <div class=${cx('roles', active && 'has-active')} ref=${rolesRef}>
      ${Object.entries(ROLES).map(([role, r]) => {
        const meta = ROLE_META[role];
        const isOn = active === role;
        const people = PEOPLE.filter((p) => p.role === role);
        return html`<div key=${role} class=${cx('role-card glass', `tone-${meta.tone}`, isOn && 'open', active && !isOn && 'dim')}
            style=${`--lift:${isOn ? lift : 0}px`} onMouseEnter=${() => bounce(role)}>
          <button class="role-head" onClick=${() => setActive(isOn ? null : role)} aria-expanded=${isOn}>
            <span class="role-icon"><${Icon} name=${meta.icon} size=${22} /></span>
            <span class="role-txt">
              <span class="role-name">${r.label}</span>
              <span class="role-who">${r.who} · ${r.desc}</span>
            </span>
            <${Icon} name="right" size=${18} cls="role-chev" />
          </button>
          <div class="role-people" aria-hidden=${!isOn}>
            <div class="people-inner">
              <p class="eyebrow">테스트 인물 선택</p>
              <div class="people-list">
                ${people.map((p) => html`<button key=${p.id} class="person-chip" tabindex=${isOn ? 0 : -1} onClick=${() => enter(role, p.id)}>
                  <span class="rank">${p.rank}</span> ${p.name}<span class="person-pos">${p.title}</span><${Icon} name="arrowRight" size=${16} />
                </button>`)}
              </div>
              <button class="btn-text back" tabindex=${isOn ? 0 : -1} onClick=${() => setActive(null)}><${Icon} name="arrowLeft" size=${16} /> 다른 역할</button>
            </div>
          </div>
        </div>`;
      })}
    </div>
  </section>`;
}
