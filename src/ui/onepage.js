// 인계서 원페이지 — 첫 화면(선택 탭·상태·요약 대시보드) → 스크롤하면 상세 영역
import { html, useEffect, useMemo, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { POSITION, giverOf, reviewerOf } from '../data/seed.js';
import { aggregate, deptRows, itemFromRec, onnaraDeptCounts, personStats, recommend, sortItems } from '../engine.js';
import {
  addItem, canAskPredecessor, getState, ignoreRec, isEditable, isReadOnly, isVisibleTo, openModal,
  personLabel, setBriefing, setTab, setUI, showsSnapshot, toast, useStore, useUI, viewItems, windowEnd,
} from '../store.js';
import { briefCacheKey, briefingInput, streamAI } from '../ai.js';
import { AIBadge, Empty, ReadOnlyBadge, RichLines, StatusBadge } from './common.js';
import { CompareTable, DeptTable, Donut, FIT_QUERY, MonthlyChart, YearMap, useMedia } from './viz.js';
import { CATS, CAT_ORDER } from '../engine.js';
import { Detail } from './detail.js';
import { cx, dot, fmtStamp, periodLabel, scrollToId, servedMonthsOfYear, stamp } from '../util.js';

export function buildViews(s) {
  const pid = s.session.positionId;
  const pos = POSITION[pid];
  const h = s.handovers[pid];
  const giver = giverOf(pid);
  const approvedLog = [...h.log].reverse().find((l) => l.action === '입회완료');
  const snap = showsSnapshot(s.session.role, h);
  const current = {
    id: 'current',
    kind: 'person',
    isCurrent: true,
    person: giver,
    start: giver.start,
    end: giver.end,
    periodLabel: periodLabel(giver.start, giver.end),
    items: viewItems(s.session.role, h),
    snapshot: snap,
    qa: s.qa.filter((q) => q.positionId === pid),
    docCounts: onnaraDeptCounts(pos.onnara, giver.start, giver.end),
    briefing: snap ? h.attachment.snapshot.briefing : h.briefing,
    approvedAt: h.status === 'approved' ? approvedLog?.at : null,
  };
  const prev = pos.history.map((hh) => ({
    id: hh.id,
    kind: 'person',
    isCurrent: false,
    person: hh.person,
    start: hh.start,
    end: hh.end,
    periodLabel: hh.periodLabel,
    items: hh.items,
    qa: hh.qa,
    docCounts: hh.docCounts,
    briefing: hh.briefing,
    approvedAt: hh.approvedAt,
  }));
  const showCurrent = isVisibleTo(s.session.role, h) && current.items.length > 0;
  return { pos, h, current, prev, aggList: showCurrent ? [current, ...prev] : prev, showCurrent };
}

function Tabs({ views, tab }) {
  const list = [
    { id: 'all', label: '전체 합산' },
    { id: 'current', label: `${views.current.periodLabel} ${views.current.person.name}`, current: true },
    ...views.prev.map((p) => ({ id: p.id, label: `${p.periodLabel} ${p.person.name}` })),
  ];
  return html`<div class="seg-tabs" role="tablist">
    ${list.map((t) => html`<button key=${t.id} role="tab" aria-selected=${tab === t.id} class=${cx('seg', tab === t.id && 'on')} onClick=${() => setTab(t.id)}>
      ${t.current && html`<span class="now-dot" aria-hidden="true">●</span>`}${t.label}${t.current ? ' (현재)' : ''}
    </button>`)}
  </div>`;
}

function StatusBar({ s, h }) {
  const role = s.session.role;
  const ro = isReadOnly(s, h);
  const lastReject = [...h.log].reverse().find((l) => l.action === '반려');
  return html`<div class="status-bar glass">
    <div class="sb-info">
      <${StatusBadge} status=${h.status} />
      ${ro && html`<${ReadOnlyBadge} />`}
      <span class="sb-item"><span class="muted">인사이동일</span> <strong class="tnum">${dot(h.moveDate)}</strong></span>
      <span class="sb-item"><span class="muted">전임자 질문 가능</span> <strong class="tnum">${h.firstSubmittedAt ? `${dot(h.firstSubmittedAt)}~${dot(windowEnd(h))}` : `입회요청 후 ~${dot(windowEnd(h))}`}</strong></span>
      ${h.receiver && html`<span class="sb-item"><span class="muted">인수자</span> <strong>${h.receiver.rank} ${h.receiver.name}</strong></span>`}
      ${h.attachment && html`<button class="pdf-chip" onClick=${() => openModal({ type: 'pdf' })}
          title=${`온나라 첨부 · ${h.attachment.filename} · ${h.attachment.pages}쪽 · ${fmtStamp(h.attachment.at)} 입회요청`}>
        <span class="pdf-ic sm">PDF</span>PDF 파일 보기
      </button>`}
    </div>
    <div class="sb-actions">
      ${role === 'giver' && !ro && h.status === 'draft' && html`
        <button class="btn-text" onClick=${() => openModal({ type: 'autowrite' })}><${Icon} name="refresh" size=${16} />다시 자동 작성</button>
        <button class="btn primary" onClick=${() => openModal({ type: 'submit' })}><${Icon} name="send" size=${18} />작성완료 및 입회요청</button>`}
      ${role === 'giver' && !ro && h.status === 'rejected' && html`<button class="btn primary" onClick=${() => openModal({ type: 'submit' })}><${Icon} name="send" size=${18} />보완 완료 및 입회 재요청</button>`}
      ${role === 'giver' && h.status === 'pending' && html`<span class="muted small lock-note"><${Icon} name="lock" size=${14} />입회대기 중에는 편집이 잠깁니다</span>`}
      ${role === 'reviewer' && h.status === 'pending' && html`
        ${ro
          ? html`<span class="muted small lock-note" title="질문 기간이 끝나 인계자가 보완할 수 없습니다"><${Icon} name="lock" size=${14} />보완 기간이 끝나 반려할 수 없습니다</span>`
          : html`<button class="btn danger" onClick=${() => openModal({ type: 'reject' })}>반려</button>`}
        <button class="btn primary" onClick=${() => openModal({ type: 'approve' })}><${Icon} name="check" size=${18} />입회완료</button>`}
    </div>
    ${showsSnapshot(role, h) && html`<div class="snap-banner">
      <${Icon} name="info" size=${16} />
      <span>인계자가 반려 사유를 보완하고 있습니다. 보완이 끝나 다시 입회요청될 때까지 <strong>${fmtStamp(h.attachment.at)}</strong>에 입회요청된 내용을 보여 드립니다.</span>
    </div>`}
    ${h.status === 'rejected' && lastReject && html`<div class="reject-banner">
      <span class="badge pill st-rejected">반려 사유</span>
      <span>${lastReject.reason}</span>
      <span class="muted small">${lastReject.by} · ${fmtStamp(lastReject.at)}</span>
    </div>`}
  </div>`;
}

export async function regenerateBriefing(pid) {
  const s = getState();
  const h = s.handovers[pid];
  const input = briefingInput(pid, h.items, { mode: 'person', today: s.today, moveDate: h.moveDate, person: personLabel(giverOf(pid)) });
  setUI({ briefStream: { pid, text: '', phase: 'loading' } });
  try {
    const raw = await streamAI({
      kind: 'briefing', input, cacheKey: briefCacheKey(input),
      onText: (t) => setUI({ briefStream: { pid, text: t, phase: 'streaming' } }),
    });
    setBriefing(pid, { text: raw.trim(), at: stamp(getState().today), status: 'ok' });
  } catch {
    setBriefing(pid, { ...(h.briefing || {}), status: 'error' });
  }
  setUI({ briefStream: null });
}

function Briefing({ view, mode, canRegen, pid }) {
  const ui = useUI();
  const stream = view?.isCurrent && ui.briefStream?.pid === pid ? ui.briefStream : null;
  const b = mode === 'aggregate' ? POSITION[pid].aggBriefing : view.briefing;
  let body;
  if (stream && stream.phase === 'loading') {
    body = html`<div class="skeleton"><i></i><i></i><i style="width:62%"></i></div>`;
  } else if (stream) {
    body = html`<div class="brief-body"><${RichLines} text=${stream.text} streaming=${true} /></div>`;
  } else if (!b || b.status === 'error' || !b.text) {
    body = html`<div class="ai-fail">
      <p>AI 응답을 불러오지 못했습니다.</p>
      ${canRegen && html`<button class="btn-text" onClick=${() => regenerateBriefing(pid)}><${Icon} name="refresh" size=${16} />다시 시도</button>`}
    </div>`;
  } else {
    body = html`<div class="brief-body"><${RichLines} text=${b.text} /></div>`;
  }
  return html`<section class="card ai-card brief-card">
    <div class="ai-head">
      <${AIBadge} label="AI 요약" />
      <h2 class="h3">${mode === 'aggregate' ? '역대 인계 브리핑' : 'AI 인계 브리핑'}</h2>
      ${b?.at && !stream && html`<span class="muted small tnum">${fmtStamp(b.at)} 생성</span>`}
      <span class="grow"></span>
      <span class="ai-note inline">인계서를 바탕으로 AI가 작성했습니다. 사실과 다를 수 있습니다.</span>
      ${canRegen && !stream && html`<button class="btn-text sm" onClick=${() => regenerateBriefing(pid)}><${Icon} name="refresh" size=${15} />다시 요약</button>`}
    </div>
    ${body}
  </section>`;
}

function Recs({ recs, pid }) {
  if (!recs.length) return null;
  return html`<div class="rec-strip fade-up">
    <ul class="rec-list">
      <li class="rec-head" title="역대 담당자는 했지만 이번 인계서에 없는 업무"><span class="rec-sym">◌</span>역대 업무 대비 누락 업무 <span class="mini-badge mint tnum">${recs.length}건</span></li>
      ${recs.map((r) => html`<li key=${r.key} class="rec-chip">
        <span class="rec-title" title=${r.desc}>${r.title}</span>
        <span class="mini-badge mint tnum">${r.type === 'expected' ? '역대 기준 예상' : `역대 ${r.count}/${r.total}명`}</span>
        <span class="muted small nowrap">${r.period}</span>
        <button class="btn secondary xs" onClick=${() => {
          const item = itemFromRec(r);
          addItem(pid, item);
          toast(`'${r.title}'을(를) 인계서에 추가했습니다`, 'ok');
        }} title="인계서에 추가"><${Icon} name="plus" size=${14} />추가</button>
        <button class="chip-x" onClick=${() => ignoreRec(pid, r.key)} title="무시" aria-label=${`${r.title} 추천 무시`}><${Icon} name="x" size=${14} /></button>
      </li>`)}
    </ul>
  </div>`;
}

function Tile({ label, value, unit, sub, sym }) {
  return html`<div class="tile" title=${sub}>
    <p class="tile-label">${label}</p>
    <p class="tile-num tnum">${sym && html`<span class="metric-sym">${sym}</span>`}${value}<span class="metric-unit">${unit}</span></p>
  </div>`;
}

function Tiles({ mode, st, agg, qa }) {
  if (mode === 'aggregate') {
    return html`<div class="tiles">
      <${Tile} label="역대 담당자" value=${agg.people} unit="명" sub=${`평균 근무 ${agg.avgMonths.toFixed(1)}개월`} />
      <${Tile} label="공통 핵심 업무" value=${agg.core} unit="건" sub="역대 75% 이상 수행" sym="★" />
      <${Tile} label="가장 바쁜 달" value=${agg.busyMonth} unit="월" sub=${`평균 ${agg.busyAvg.toFixed(1)}건`} />
      <${Tile} label="소통" value=${agg.questions} unit="건" sub=${`AI 해결 ${agg.aiRate}% · 전임자 ${agg.giverAnswers}`} />
    </div>`;
  }
  const roots = qa.filter((q) => !q.parentId && q.authorType === 'receiver');
  const aiRate = roots.length ? Math.round((roots.filter((q) => !q.forwarded).length / roots.length) * 100) : 0;
  return html`<div class="tiles">
    <${Tile} label="중요 표시" value=${st.important} unit="건" sub="인계자가 ★로 강조" sym="★" />
    <${Tile} label="가장 바쁜 달" value=${st.busyMonth} unit="월" sub=${`${st.busyCount}건이 겹침`} />
    <${Tile} label="관계부서" value=${st.depts} unit="곳" sub="업무에 적힌 부서" />
    <${Tile} label="질문·답변" value=${roots.length} unit="건" sub=${roots.length ? `AI 해결 ${aiRate}%` : '아직 질문 없음'} />
  </div>`;
}

function pickItem(id) {
  setUI({ highlight: { itemId: id, at: Date.now() } });
}

function pickCategory(cat) {
  setUI({ detailFilter: { cat, at: Date.now() } });
}

function Summary({ s, views, view, mode, pid }) {
  const fit = useMedia(FIT_QUERY);
  const [side, setSide] = useState('dept');
  const editable = mode === 'person' && view.isCurrent && isEditable(s, views.h);
  const recs = useMemo(() => (editable
    ? recommend({ history: views.pos.history, items: views.h.items, ignored: views.h.ignoredRecs, start: view.start, end: view.end })
    : []), [editable, views.h.items, views.h.ignoredRecs]);

  const data = useMemo(() => {
    if (mode === 'aggregate') {
      const agg = aggregate(views.aggList);
      return { agg, rows: agg.rows, chart: agg.monthly, depts: agg.depts };
    }
    const st = personStats(view.items);
    const docCount = (it) => (it.docIds ? it.docIds.length : (it.docs || []).length);
    const rows = sortItems(view.items).map((i) => ({ ...i, docCount: docCount(i) }));
    return { st, rows, chart: st.monthly, depts: deptRows(view.items, view.docCounts) };
  }, [mode, view, views.aggList]);

  const parts = CAT_ORDER.map((k) => ({ key: k, label: CATS[k].short, value: data.rows.filter((r) => r.category === k).length }));
  const served = mode === 'person' ? servedMonthsOfYear(view.start, view.end) : null;
  const pickMonth = (m) => {
    const r = data.rows.find((x) => (mode === 'aggregate' ? x.monthRatio[m - 1] > 0 : x.months.includes(m)) && x.category !== 'routine')
      || data.rows.find((x) => (mode === 'aggregate' ? x.monthRatio[m - 1] > 0 : x.months.includes(m)));
    if (r) pickItem(r.id);
  };
  const compareRows = mode === 'aggregate' ? views.aggList.map((v) => ({
    id: v.id,
    current: v.isCurrent,
    name: `${v.person.rank} ${v.person.name}`,
    period: v.periodLabel,
    items: v.items.length,
    important: v.items.filter((i) => i.important).length,
    questions: v.qa.filter((q) => !q.parentId && q.authorType === 'receiver').length,
    approvedAt: v.approvedAt,
  })) : [];
  const showCompare = mode === 'aggregate' && side === 'compare';

  return html`<div class=${cx('dash', fit && 'fit')}>
    <${Briefing} view=${view} mode=${mode} pid=${pid} canRegen=${mode === 'person' && view.isCurrent && s.session.role === 'giver' && !isReadOnly(s, views.h)} />
    <div class="dash-main">
      <div class="dash-left">
        <section class="card map-card">
          <div class="card-head">
            <h2 class="h3">연간 업무 대시보드</h2>
            <span class="muted small">${mode === 'aggregate' ? `역대 ${data.agg.people}명 합산` : `${view.person.name} · ${view.periodLabel}`}</span>
          </div>
          ${mode === 'person' && view.isCurrent && html`<${Recs} recs=${recs} pid=${pid} />`}
          <${YearMap} mode=${mode} rows=${data.rows} served=${served} people=${data.agg?.people} todayMonth=${+s.today.slice(5, 7)} onPick=${pickItem} fit=${fit} />
        </section>
      </div>
      <div class="dash-right">
        <section class="card stat-card">
          <div class="stat-donut">
            <div class="card-head">
              <h2 class="h3">업무 구성</h2>
              ${mode === 'aggregate' && html`<span class="muted small">역대 합산</span>`}
            </div>
            <${Donut} parts=${parts} total=${data.rows.length} label="총 업무" onPick=${pickCategory} />
          </div>
          <${Tiles} mode=${mode} st=${data.st} agg=${data.agg} qa=${view?.qa || []} />
        </section>
        <section class="card chart-card">
            <div class="card-head">
              <h2 class="h3">월별 업무량</h2>
              <span class="muted small">${mode === 'aggregate' ? '역대 평균' : '달마다 하는 업무 수'}</span>
            </div>
            <${MonthlyChart} data=${data.chart} average=${mode === 'aggregate'} onPick=${pickMonth} width=${560} height=${210} fill=${fit} />
        </section>
          <section class="card dept-card">
            <div class="card-head">
              ${mode === 'aggregate'
                ? html`<div class="mini-seg" role="tablist">
                    <button role="tab" aria-selected=${!showCompare} class=${cx(!showCompare && 'on')} onClick=${() => setSide('dept')}>관계부서</button>
                    <button role="tab" aria-selected=${showCompare} class=${cx(showCompare && 'on')} onClick=${() => setSide('compare')}>역대 비교</button>
                  </div>`
                : html`<h2 class="h3">관계부서</h2><span class="muted small">문서 수·발신은 온나라 기준</span>`}
            </div>
            <div class="dept-body">
              ${showCompare ? html`<${CompareTable} rows=${compareRows} compact=${fit} />` : html`<${DeptTable} rows=${data.depts} onPick=${pickItem} />`}
            </div>
          </section>
      </div>
    </div>
  </div>`;
}

function ScrollCue({ show }) {
  const [top, setTop] = useState(true);
  useEffect(() => {
    const f = () => setTop(window.scrollY < 40);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  if (!show) return null;
  return html`<button class=${cx('scroll-cue glass', !top && 'hide')} onClick=${() => scrollToId('detail', 'start')} tabindex=${top ? 0 : -1}>
    상세 업무 보기<${Icon} name="down" size=${16} />
  </button>`;
}

export function OnePage() {
  const s = useStore();
  const ui = useUI();
  const views = buildViews(s);
  const pid = s.session.positionId;
  const role = s.session.role;
  let tab = s.tab;
  if (tab !== 'all' && tab !== 'current' && !views.prev.find((p) => p.id === tab)) tab = 'current';

  // 하이라이트 대상(항목·질문)으로 스크롤
  useEffect(() => {
    if (!ui.highlight) return undefined;
    const target = ui.highlight.qaId ? `qa-${ui.highlight.qaId}` : `item-${ui.highlight.itemId}`;
    const t = setTimeout(() => scrollToId(target) || scrollToId(`item-${ui.highlight.itemId}`), 80);
    const clear = setTimeout(() => setUI({ highlight: null }), 1800);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [ui.highlight?.at]);

  const view = tab === 'all' ? null : tab === 'current' ? views.current : views.prev.find((p) => p.id === tab);
  const mode = tab === 'all' ? 'aggregate' : 'person';
  const hiddenCurrent = tab === 'current' && !isVisibleTo(role, views.h);

  let summary;
  if (hiddenCurrent && role === 'giver') {
    summary = html`<${Empty} title="아직 인계서가 없습니다" desc="업무 폴더와 온나라 문서를 분석해 인계서 초안을 자동으로 만들어 드려요." char="char-giver">
      ${!isReadOnly(s, views.h) && html`<button class="btn primary lg" onClick=${() => openModal({ type: 'autowrite' })}><${Icon} name="sparkle" size=${18} />인계서 자동 작성</button>`}
      <p class="small muted">이전 담당자와 전체 합산 탭은 지금도 볼 수 있습니다.</p>
    </${Empty}>`;
  } else if (hiddenCurrent) {
    summary = html`<${Empty} title="아직 입회요청된 인계서가 없습니다" desc="인계자가 입회를 요청하면 이곳에서 볼 수 있어요. 그동안 이전 담당자와 전체 합산 탭을 살펴보세요." chars=${role === 'reviewer' ? ['char-giver', 'char-receiver'] : ['char-receiver']}>
      <button class="btn secondary" onClick=${() => setTab('all')}><${Icon} name="layers" size=${18} />전체 합산 보기</button>
    </${Empty}>`;
  } else {
    summary = html`<${Summary} s=${s} views=${views} view=${view} mode=${mode} pid=${pid} />`;
  }

  const ctx = POSITION[pid];
  const paneKey = `${tab}-${hiddenCurrent}`;
  return html`<div class="onepage">
    <section class="first">
      <div class="op-top">
        <div class="op-title">
          <p class="eyebrow">${ctx.unit} ${ctx.dept}</p>
          <h1 class="h1">${ctx.title} 인계서</h1>
        </div>
        <${Tabs} views=${views} tab=${tab} />
      </div>
      ${tab === 'current' && html`<${StatusBar} s=${s} h=${views.h} />`}
      ${tab !== 'current' && html`<div class="status-bar glass slim">
        <div class="sb-info">
          ${tab === 'all' ? html`<span class="badge pill st-approved">전체 합산</span><span class="muted small">역대 확정 인계서${views.showCurrent ? '와 현재 인계서' : ''}를 업무 단위로 합쳐 보여줍니다</span>`
            : html`<span class="badge pill st-approved">입회완료</span><${ReadOnlyBadge} /><span class="muted small">${view.person.rank} ${view.person.name} · ${view.periodLabel} 확정 인계서</span>`}
        </div>
      </div>`}
      <div class="tab-pane first-body" key=${paneKey}>${summary}</div>
    </section>
    ${!hiddenCurrent && html`<div class="tab-pane" key=${`d-${paneKey}`}><${Detail} s=${s} views=${views} view=${view} mode=${mode} /></div>`}
    <${ScrollCue} show=${!hiddenCurrent} />
  </div>`;
}

