// 연간 업무 대시보드(히트맵), 월별 업무량 차트, 표
import { html, useEffect, useLayoutEffect, useRef, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { CATS, CAT_ORDER, monthTotal } from '../engine.js';
import { cx, dot } from '../util.js';
import { CatSym } from './common.js';
import { setUI, useUI } from '../store.js';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** 데스크톱 한 화면 배치를 쓸 수 있는지 */
export const FIT_QUERY = '(min-width: 1200px) and (min-height: 700px)';
export function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return on;
}

// 툴팁은 화면 맨 위 한 곳(TipLayer)에 그린다.
// 유리 카드(backdrop-filter) 안에 두면 위치 기준이 카드로 바뀌고 잘려서 보이지 않는다.
function useTip() {
  const show = (e, lines) => setUI({ tip: { x: e.clientX, y: e.clientY, lines } });
  const hide = () => setUI({ tip: null });
  return { show, hide };
}

export function TipLayer() {
  const ui = useUI();
  const tip = ui.tip;
  if (!tip) return null;
  return html`<div class="tip glass" style=${`left:${tip.x}px;top:${tip.y}px`}>
    ${tip.lines.map((l, i) => html`<div class=${i ? 'muted' : 'tip-title'}>${l}</div>`)}
  </div>`;
}

const level = (r) => (r <= 0 ? 0 : r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4);

export function YearMap({ mode, rows, served, todayMonth, people, onPick, fit }) {
  const tip = useTip();
  const unserved = (m) => served && !served.has(m);
  const scRef = useRef();
  const [rowh, setRowh] = useState(30);
  // 한 화면 배치에서는 남은 높이에 맞춰 행 높이를 줄인다 (최소 15px, 넘치면 지도 안에서만 스크롤)
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!fit || !el) { setRowh(30); return undefined; }
    const measure = () => {
      const h = el.clientHeight - 26;
      setRowh(Math.max(15, Math.min(30, Math.floor(h / Math.max(rows.length, 1)))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, rows.length]);
  return html`<div class=${cx('ymap-wrap', fit && 'fit')}>
    ${mode === 'aggregate' && html`<div class="legend">
      <span class="muted">역대 담당자 중 그 달에 한 비율</span>
      ${[1, 2, 3, 4].map((l) => html`<span class="lg"><i class=${`cell agg lv${l}`}></i>${['~25%', '~50%', '~75%', '~100%'][l - 1]}</span>`)}
    </div>`}
    ${mode === 'person' && html`<div class="legend">
      ${CAT_ORDER.map((c) => html`<span class="lg"><i class=${`cell on cat-${c}`}>${c !== 'routine' && html`<${CatSym} cat=${c} />`}</i>${CATS[c].short}</span>`)}
      <span class="lg"><i class="cell on rec"></i>역대 추천</span>
      ${served && served.size < 12 && html`<span class="lg"><i class="cell hatch-demo"></i>근무 외 기간</span>`}
    </div>`}
    <div class="ymap-scroll" ref=${scRef}>
      <table class=${cx('ymap', rowh < 21 && 'dense')} style=${`--rowh:${rowh}px`}>
        <thead><tr>
          <th class="tname">업무</th>
          ${MONTHS.map((m) => html`<th class=${cx('mh', m === todayMonth && 'now')}>${m}</th>`)}
        </tr></thead>
        <tbody>
          ${rows.map((r) => html`<tr key=${r.id}>
            <th class="tname" title=${r.title}>
              <button class="tname-btn" onClick=${() => onPick(r.id)}>
                <span class=${`sym cat-${r.category}`}><${CatSym} cat=${r.category} /></span>
                <span class="tname-txt">${r.title}</span>
                ${r.important && html`<span class="star-mini" aria-label="중요"><${Icon} name="star" size=${12} /></span>`}
                ${r.source === 'rec' && html`<span class="mini-badge mint">추천</span>`}
              </button>
            </th>
            ${MONTHS.map((m, ci) => {
              if (mode === 'aggregate') {
                const ratio = r.monthRatio[m - 1];
                const lv = level(ratio);
                return html`<td class="mc">
                  <button class=${cx('cell agg', `lv${lv}`)} style=${`--c:${ci}`} disabled=${!lv}
                    onMouseEnter=${(e) => tip.show(e, [r.title, `${m}월 · ${Math.round(ratio * people)}/${people}명`])} onMouseLeave=${tip.hide}
                    onClick=${() => onPick(r.id)} aria-label=${`${r.title} ${m}월 ${Math.round(ratio * 100)}%`}></button>
                </td>`;
              }
              const on = r.months.includes(m);
              return html`<td class=${cx('mc', unserved(m) && 'hatch')}>
                <button class=${cx('cell', on && 'on', on && `cat-${r.category}`, on && r.source === 'rec' && 'rec')} style=${`--c:${ci}`} disabled=${!on}
                  onMouseEnter=${on ? (e) => tip.show(e, [r.title, `${m}월 · ${r.docCount ? `근거 문서 ${r.docCount}건` : r.source === 'rec' ? '역대 인계서 기준' : '근거 문서 없음'}`]) : undefined}
                  onMouseLeave=${tip.hide} onClick=${() => onPick(r.id)} aria-label=${on ? `${r.title} ${m}월` : undefined}>
                  ${on && r.category !== 'routine' && html`<${CatSym} cat=${r.category} />`}
                </button>
              </td>`;
            })}
          </tr>`)}
          ${!rows.length && html`<tr><td colspan="13" class="muted empty-row">표시할 업무가 없습니다</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

export function MonthlyChart({ data, average, onPick, width = 560, height = 210, fill }) {
  const tip = useTip();
  const wrapRef = useRef();
  const [fillH, setFillH] = useState(null);
  // fill: 카드에 남은 높이만큼 차트를 키운다 (글자 비율은 유지)
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!fill || !el) { setFillH(null); return undefined; }
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setFillH(Math.max(80, Math.min(420, Math.round((r.height / r.width) * width))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, width]);
  const W = width;
  const H = fillH || height;
  const L = 26;
  const B = 22;
  const T = 10;
  const max = Math.max(4, Math.ceil(Math.max(...data.map(monthTotal)) / 2) * 2);
  const slot = (W - L) / 12;
  const bw = slot * 0.6;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max].map((v) => Math.round(v * 10) / 10);
  const avg = average ? data.reduce((s, o) => s + monthTotal(o), 0) / 12 : null;
  const fmt = (v) => (average ? v.toFixed(1) : String(v));
  return html`<div class=${cx('chart-wrap', fill && 'fill')} ref=${wrapRef}>
    <svg class="mchart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="월별 업무량 누적 막대 차트">
      ${ticks.map((t) => html`<g><line x1=${L} x2=${W} y1=${y(t)} y2=${y(t)} class="gridline" /><text x=${L - 6} y=${y(t) + 4} class="axis" text-anchor="end">${t}</text></g>`)}
      ${data.map((o, i) => {
        const x = L + slot * i + (slot - bw) / 2;
        const total = monthTotal(o);
        let acc = 0;
        const segs = CAT_ORDER.map((c) => {
          const v = o[c];
          const seg = v > 0 ? html`<rect x=${x} width=${bw} y=${y(acc + v)} height=${y(acc) - y(acc + v)} class=${`bseg bseg-${c}`} />` : null;
          acc += v;
          return seg;
        });
        return html`<g class="bar" style=${`--i:${i}`} onClick=${() => onPick(i + 1)}
            onMouseEnter=${(e) => tip.show(e, [`${i + 1}월 · ${fmt(total)}건${average ? ' (평균)' : ''}`, CAT_ORDER.filter((c) => o[c] > 0).map((c) => `${CATS[c].short} ${fmt(o[c])}`).join(' · ') || '업무 없음'])}
            onMouseLeave=${tip.hide}>
          <clipPath id=${`clip-${i}`}><rect x=${x} width=${bw} y=${y(total)} height=${Math.max(0, H - B - y(total))} rx="6" /></clipPath>
          <rect x=${x - (slot - bw) / 2} width=${slot} y=${T} height=${H - T - B} class="hit" />
          <g clip-path=${`url(#clip-${i})`} class="bar-grow">${segs}</g>
          <text x=${x + bw / 2} y=${H - 6} class="axis" text-anchor="middle">${i + 1}</text>
        </g>`;
      })}
      ${avg !== null && html`<g><line x1=${L} x2=${W} y1=${y(avg)} y2=${y(avg)} class="avg-line" /><text x=${W - 2} y=${y(avg) - 5} class="axis" text-anchor="end">평균 ${avg.toFixed(1)}</text></g>`}
    </svg>
    <div class="legend small">
      ${CAT_ORDER.map((c) => html`<span class="lg"><i class=${`sw bseg-${c}`}></i>${CATS[c].short}</span>`)}
    </div>
  </div>`;
}

/** 업무 구성 원그래프 (분류별 비율) */
export function Donut({ parts, total, label, onPick }) {
  const tip = useTip();
  const R = 44;
  const C = 2 * Math.PI * R;
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  return html`<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 120 120" role="img" aria-label=${`업무 구성 ${parts.map((p) => `${p.label} ${p.value}건`).join(', ')}`}>
      <circle cx="60" cy="60" r=${R} class="donut-track" />
      ${parts.map((p, i) => {
        const len = (p.value / sum) * C;
        const off = acc;
        acc += len;
        if (!p.value) return null;
        return html`<circle key=${p.key} cx="60" cy="60" r=${R} class=${`dseg dseg-${p.key}`} style=${`--i:${i}`}
          stroke-dasharray=${`${Math.max(len - 2.5, 0.5)} ${C}`} stroke-dashoffset=${-off} transform="rotate(-90 60 60)"
          onClick=${() => onPick(p.key)} onMouseEnter=${(e) => tip.show(e, [`${p.label} ${p.value}건`, `${Math.round((p.value / sum) * 100)}%`])} onMouseLeave=${tip.hide} />`;
      })}
      <text x="60" y="60" class="donut-num" text-anchor="middle">${total}</text>
      <text x="60" y="77" class="donut-lab" text-anchor="middle">${label}</text>
    </svg>
    <ul class="donut-legend">
      ${parts.map((p) => html`<li key=${p.key}><button onClick=${() => onPick(p.key)}>
        <i class=${`sw bseg-${p.key}`}></i><span>${p.label}</span><strong class="tnum">${p.value}</strong><span class="muted tnum">${Math.round((p.value / sum) * 100)}%</span>
      </button></li>`)}
    </ul>
  </div>`;
}

export function DeptTable({ rows, onPick }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return html`<div class="table-wrap"><table class="tbl dept-tbl">
    <thead><tr><th>부서</th><th>관련 업무</th><th class="num">관련 업무 수</th><th class="num" title="온나라 문서 중 이 부서가 협조·수신으로 들어간 문서 수">문서 수·발신 수</th></tr></thead>
    <tbody>
      ${rows.map((r) => html`<tr key=${r.name} class=${r.itemId ? 'clickable' : ''} title=${r.tasks.join(', ')} onClick=${() => r.itemId && onPick(r.itemId)}>
        <td class="strong nowrap">${r.name}</td>
        <td class="muted clip" title=${r.tasks.join(', ')}>${r.tasks.slice(0, 2).join(', ')}${r.tasks.length > 2 ? ` 외 ${r.tasks.length - 2}` : ''}</td>
        <td class="num"><span class="hbar"><i style=${`width:${(r.count / max) * 100}%`}></i></span><span class="tnum">${r.count}건</span></td>
        <td class="num tnum">${r.docs ? `${r.docs}건` : html`<span class="muted">—</span>`}</td>
      </tr>`)}
      ${!rows.length && html`<tr><td colspan="4" class="muted empty-row">업무에 적힌 관계부서가 없습니다</td></tr>`}
    </tbody>
  </table></div>`;
}

export function CompareTable({ rows, compact }) {
  return html`<div class="table-wrap"><table class="tbl">
    <thead><tr><th>담당자</th>${!compact && html`<th>근무기간</th>`}<th class="num">항목</th><th class="num">★</th><th class="num">질문</th>${!compact && html`<th>결재완료일</th>`}</tr></thead>
    <tbody>
      ${rows.map((r) => html`<tr key=${r.id} class=${r.current ? 'current-row' : ''} title=${`${r.period} · ${r.approvedAt ? `결재완료 ${dot(r.approvedAt)}` : '결재 전'}`}>
        <td class="strong nowrap">${r.name}${r.current && !compact && html` <span class="mini-badge blue">현재</span>`}</td>
        ${!compact && html`<td class="tnum nowrap">${r.period}</td>`}
        <td class="num tnum">${r.items}</td>
        <td class="num tnum">${r.important}</td>
        <td class="num tnum">${r.questions}</td>
        ${!compact && html`<td class="tnum nowrap">${r.approvedAt ? dot(r.approvedAt) : '—'}</td>`}
      </tr>`)}
    </tbody>
  </table></div>`;
}
