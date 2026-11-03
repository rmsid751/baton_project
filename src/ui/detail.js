// 상세 영역 — 분류 필터, 항목 카드(편집·근거 문서), 질문·답변 스레드
import { html, useEffect, useRef, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { POSITION, giverOf } from '../data/seed.js';
import { CATS, CAT_ORDER, periodText, sortItems } from '../engine.js';
import {
  addAIAnswer, addItem, addQuestion, addReply, canAskPredecessor, deleteItem, forwardQuestion, getState,
  isEditable, personLabel, setTab, setUI, toast, toggleImportant, updateItem, useUI,
} from '../store.js';
import { answerCacheKey, answerInput, giverPeriodLabel, parseAnswer, streamAI, visibleAnswer } from '../ai.js';
import { AIBadge, CatBadge, CatSym, Rich } from './common.js';
import { cx, fmtStamp, scrollToId, uid } from '../util.js';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// ───────── AI 선답변 ─────────
const setPending = (id, v) => setUI((u) => ({ pending: { ...u.pending, [id]: v } }));
const clearPending = (id) => setUI((u) => {
  const p = { ...u.pending };
  delete p[id];
  return { pending: p };
});

async function runAI(pid, rootId) {
  const s = getState();
  const root = s.qa.find((q) => q.id === rootId);
  const h = s.handovers[pid];
  const item = h.items.find((i) => i.id === root?.itemId);
  if (!root || !item) return;
  const giver = giverOf(pid);
  const input = answerInput(pid, { item, question: root.text, items: h.items, giver: personLabel(giver), giverPeriod: giverPeriodLabel(giver) });
  setPending(rootId, { phase: 'loading', text: '' });
  try {
    const raw = await streamAI({
      kind: 'answer', input, cacheKey: answerCacheKey(pid, item.id, root.text),
      onText: (t) => setPending(rootId, { phase: 'streaming', text: visibleAnswer(t) }),
    });
    addAIAnswer(rootId, parseAnswer(raw));
    clearPending(rootId);
  } catch {
    setPending(rootId, { phase: 'error' });
  }
}

// ───────── 근거 해석 ─────────
function resolveDoc(pos, id) {
  const f = pos.files.find((x) => x.id === id);
  if (f) return { id, kind: 'folder', title: f.name, sub: `업무폴더 / ${pos.folders[f.folder]} / ${f.path.join(' / ')}`, date: f.date };
  const o = pos.onnara.find((x) => x.id === id);
  if (o) return { id, kind: 'onnara', title: o.title, sub: `온나라 · ${o.type}${o.coop?.length ? ` · 협조 ${o.coop.join(', ')}` : ''}`, date: o.date };
  for (const h of pos.history) {
    for (const it of h.items) {
      const d = (it.docs || []).find((x) => x.id === id);
      if (d) return { id, kind: d.src, title: d.title, sub: `${h.person.rank} ${h.person.name} 인계서 근거`, date: d.date, itemId: it.id, histId: h.id };
    }
  }
  return null;
}

function resolveItem(pos, items, id) {
  const cur = items.find((i) => i.id === id);
  if (cur) return { id, title: cur.title };
  for (const h of pos.history) {
    const it = h.items.find((i) => i.id === id);
    if (it) return { id, title: `${it.title} (${h.person.name})`, histId: h.id };
  }
  return null;
}

function goToRef(ref, { openDocs = false, itemId } = {}) {
  if (ref.histId) setTab(ref.histId);
  setUI({ highlight: { itemId: itemId || ref.itemId || ref.id, openDocs, at: Date.now() } });
}

function docOwner(pos, items, docId) {
  return items.find((i) => (i.docIds || []).includes(docId))?.id;
}

// ───────── 말풍선 ─────────
function AIBubble({ answer, pending, pos, items, onRetry, actions }) {
  if (pending?.phase === 'loading') {
    return html`<div class="bubble ai left pop-in">
      <div class="bubble-head"><${AIBadge} /></div>
      <p class="thinking">AI가 인계서에서 답을 찾는 중<span class="dots"><i></i><i></i><i></i></span></p>
    </div>`;
  }
  if (pending?.phase === 'streaming') {
    return html`<div class="bubble ai left">
      <div class="bubble-head"><${AIBadge} /></div>
      <p><${Rich} text=${pending.text} /><span class="cursor">▍</span></p>
    </div>`;
  }
  if (pending?.phase === 'error' || !answer) {
    return html`<div class="bubble ai left fail pop-in">
      <div class="bubble-head"><${AIBadge} /></div>
      <p class="muted">AI 응답을 불러오지 못했습니다.</p>
      <div class="bubble-actions">
        ${onRetry && html`<button class="btn-text" onClick=${onRetry}><${Icon} name="refresh" size=${15} />다시 시도</button>`}
        ${actions}
      </div>
    </div>`;
  }
  const itemRefs = (answer.refs?.items || []).map((id) => resolveItem(pos, items, id)).filter(Boolean);
  const docRefs = (answer.refs?.docs || []).map((id) => resolveDoc(pos, id)).filter(Boolean);
  return html`<div class=${cx('bubble ai left', !answer.found && 'nofound')}>
    <div class="bubble-head"><${AIBadge} /><span class="muted small tnum">${fmtStamp(answer.at)}</span></div>
    <p class=${answer.found ? '' : 'muted'}><${Rich} text=${answer.text} /></p>
    ${answer.found && (itemRefs.length > 0 || docRefs.length > 0) && html`<div class="ref-chips fade-in">
      ${itemRefs.map((r) => html`<button class="ref-chip" onClick=${() => goToRef(r)}><span class="muted">근거</span> · ${r.title}</button>`)}
      ${docRefs.map((d) => html`<button class="ref-chip" onClick=${() => goToRef(d, { openDocs: true, itemId: d.itemId || docOwner(pos, items, d.id) })}><span class="muted">문서</span> · ${d.title}</button>`)}
    </div>`}
    ${actions && html`<div class="bubble-actions">${actions}</div>`}
    <p class="ai-note">인계서와 근거 문서를 바탕으로 AI가 작성했습니다. 사실과 다를 수 있습니다.</p>
  </div>`;
}

function PersonBubble({ q, side, badge }) {
  return html`<div class=${cx('bubble', side, q.authorType)}>
    <div class="bubble-head">
      <span class="who">${q.authorName}</span>
      ${badge && html`<span class="mini-badge blue">${badge}</span>`}
      <span class="muted small tnum">${fmtStamp(q.at)}</span>
    </div>
    <p>${q.text}</p>
  </div>`;
}

function ReplyBox({ onSend, placeholder }) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };
  return html`<div class="reply-box">
    <input class="input" value=${text} placeholder=${placeholder} onInput=${(e) => setText(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) send(); }} />
    <button class="btn secondary sm" disabled=${!text.trim()} onClick=${send}><${Icon} name="send" size=${15} />답글</button>
  </div>`;
}

function Thread({ root, all, ctx }) {
  const ui = useUI();
  const { pos, items, role, isCurrent, canAsk, pid } = ctx;
  const children = all.filter((q) => q.parentId === root.id).sort((a, b) => (a.at < b.at ? -1 : 1));
  const ai = children.find((q) => q.authorType === 'ai');
  const rest = children.filter((q) => q.authorType !== 'ai');
  const pending = ui.pending[root.id];
  const hl = ui.highlight?.qaId === root.id;
  const hasGiverReply = rest.some((q) => q.authorType === 'giver');

  let aiActions = null;
  if (isCurrent && role === 'receiver' && !root.forwarded && (!pending || pending.phase === 'error')) {
    if (!canAsk) aiActions = html`<span class="muted small">전임자 질문 기간이 끝났습니다</span>`;
    else if (ai && ai.found) aiActions = html`<button class="btn secondary sm" onClick=${() => { forwardQuestion(root.id); toast('전임자에게 질문과 AI 답변을 함께 보냈습니다', 'ok'); }}><${Icon} name="send" size=${15} />전임자에게 추가 질문</button>`;
    else aiActions = html`<button class="btn primary sm" onClick=${() => { forwardQuestion(root.id); toast('전임자에게 질문을 보냈습니다', 'ok'); }}><${Icon} name="send" size=${15} />전임자에게 질문하기</button>`;
  }

  return html`<div id=${`qa-${root.id}`} class=${cx('thread', hl && 'flash')}>
    <div class="bubble right receiver">
      <div class="bubble-head">
        <span class="who">${root.authorName}</span>
        ${root.forwarded && html`<span class="mini-badge ink">전임자에게 전달됨</span>`}
        <span class="muted small tnum">${fmtStamp(root.at)}</span>
      </div>
      <p>${root.text}</p>
    </div>
    ${!root.direct && html`<${AIBubble} answer=${ai} pending=${pending} pos=${pos} items=${items} actions=${aiActions}
      onRetry=${isCurrent && role === 'receiver' ? () => runAI(pid, root.id) : null} />`}
    ${rest.map((q) => html`<${PersonBubble} key=${q.id} q=${q} side=${q.authorType === 'giver' ? 'left' : 'right'} badge=${q.authorType === 'giver' ? '전임자' : null} />`)}
    ${isCurrent && root.forwarded && canAsk && role === 'giver' && html`<${ReplyBox} placeholder="인수자에게 답글을 남겨 주세요" onSend=${(t) => { addReply(root.id, 'giver', t); toast('답글을 남겼습니다. 인수자에게 알림이 갑니다.', 'ok'); }} />`}
    ${isCurrent && root.forwarded && canAsk && role === 'receiver' && hasGiverReply && html`<${ReplyBox} placeholder="전임자에게 답글" onSend=${(t) => addReply(root.id, 'receiver', t)} />`}
  </div>`;
}

function AskBox({ pid, itemId, canAsk }) {
  const [text, setText] = useState('');
  const ask = (direct) => {
    const t = text.trim();
    if (!t) return;
    const id = addQuestion(pid, itemId, t, direct);
    setText('');
    if (direct) toast('전임자에게 바로 질문했습니다', 'ok');
    else runAI(pid, id);
  };
  return html`<div class="ask-box">
    <div class="ask-row">
      <input class="input" value=${text} placeholder="이 업무에 대해 궁금한 점을 물어보세요" onInput=${(e) => setText(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) ask(false); }} />
      <button class="btn primary" disabled=${!text.trim()} onClick=${() => ask(false)}><${Icon} name="sparkle" size=${16} />질문하기</button>
    </div>
    <p class="small muted ask-hint">AI가 인계서에서 먼저 답을 찾아드려요 ·
      ${canAsk
        ? html` <button class="link" disabled=${!text.trim()} onClick=${() => ask(true)}>전임자에게 바로 질문 →</button>`
        : html` <span class="ended">전임자 질문 기간이 끝났습니다</span>`}
    </p>
  </div>`;
}

// ───────── 항목 카드 ─────────
/** 관계부서 입력 (선택) — 칩으로 추가·삭제, 아는 부서는 자동완성 */
function DeptPicker({ value, onChange, options }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return html`<div class="dept-picker">
    ${value.map((d) => html`<span class="dept-chip" key=${d}>${d}<button type="button" class="chip-x" onClick=${() => onChange(value.filter((x) => x !== d))} aria-label=${`${d} 빼기`}><${Icon} name="x" size=${13} /></button></span>`)}
    <input class="input dept-input" list="dept-options" value=${text} placeholder=${value.length ? '부서 추가' : '예) 작전과 (비워 두어도 됩니다)'}
      onInput=${(e) => setText(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }} onBlur=${add} />
    <datalist id="dept-options">${options.filter((o) => !value.includes(o)).map((o) => html`<option value=${o} />`)}</datalist>
  </div>`;
}

function EditForm({ item, onDone, pid, deptOptions }) {
  const [f, setF] = useState({ ...item, depts: item.depts || [] });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleMonth = (m) => {
    const months = f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m].sort((a, b) => a - b);
    setF((x) => ({ ...x, months, period: periodText(x.category, months, x.category === 'routine' ? (x.period.replace('매월', '').trim() || null) : null) }));
  };
  const save = () => {
    const { id, ...patch } = f;
    updateItem(pid, item.id, { ...patch, title: f.title.trim() || '이름 없는 업무' });
    onDone();
  };
  return html`<div class="edit-form">
    <label class="field"><span>업무명</span><input class="input" value=${f.title} onInput=${(e) => set('title', e.target.value)} /></label>
    <div class="field-row">
      <label class="field"><span>분류</span>
        <select class="input" value=${f.category} onChange=${(e) => {
          const category = e.target.value;
          setF((x) => ({ ...x, category, months: category === 'routine' ? MONTHS : x.months, period: periodText(category, category === 'routine' ? MONTHS : x.months, null) }));
        }}>
          ${CAT_ORDER.map((c) => html`<option value=${c}>${CATS[c].sym} ${CATS[c].label}</option>`)}
        </select>
      </label>
      <label class="field"><span>시기 표기</span><input class="input" value=${f.period} onInput=${(e) => set('period', e.target.value)} /></label>
    </div>
    <div class="field"><span>수행하는 달</span>
      <div class="month-pick">${MONTHS.map((m) => html`<button type="button" class=${cx('mchip', f.months.includes(m) && 'on')} onClick=${() => toggleMonth(m)}>${m}</button>`)}</div>
    </div>
    <div class="field"><span>관계부서 <span class="opt">선택</span></span>
      <${DeptPicker} value=${f.depts} onChange=${(v) => set('depts', v)} options=${deptOptions} />
    </div>
    <label class="field"><span>설명</span><textarea class="input" rows="3" value=${f.desc} onInput=${(e) => set('desc', e.target.value)}></textarea></label>
    <label class="field"><span>인계자 메모</span><textarea class="input" rows="2" placeholder="후임자에게 꼭 전하고 싶은 말" value=${f.memo} onInput=${(e) => set('memo', e.target.value)}></textarea></label>
    <div class="form-actions">
      <button class="btn-text danger-text" onClick=${() => { if (confirm(`'${item.title}' 항목을 삭제할까요?`)) { deleteItem(pid, item.id); onDone(); } }}><${Icon} name="trash" size=${16} />삭제</button>
      <span class="grow"></span>
      <button class="btn secondary sm" onClick=${onDone}>취소</button>
      <button class="btn primary sm" onClick=${save}><${Icon} name="check" size=${16} />저장</button>
    </div>
  </div>`;
}

function Evidence({ item, pos, open, setOpen }) {
  const docs = item.docs
    ? item.docs.map((d) => ({ id: d.id, kind: d.src, title: d.title, date: d.date, sub: d.src === 'onnara' ? '온나라' : '업무폴더' }))
    : (item.docIds || []).map((id) => resolveDoc(pos, id)).filter(Boolean);
  const hist = item.histRefs || [];
  const n = docs.length + hist.length;
  if (!n) return null;
  return html`<div class="evidence">
    <button class="btn-text subtle" onClick=${() => setOpen(!open)} aria-expanded=${open}>
      <${Icon} name="file" size=${15} />근거 문서 ${n}건<${Icon} name="down" size=${15} cls=${cx('chev', open && 'up')} />
    </button>
    <div class=${cx('collapse', open && 'open')}><div class="collapse-inner">
      <ul class="doc-list">
        ${hist.map((h) => html`<li><${Icon} name="layers" size=${15} /><span class="doc-title">역대 인계서 · ${h.label}</span></li>`)}
        ${docs.map((d) => html`<li key=${d.id}>
          <${Icon} name=${d.kind === 'onnara' ? 'database' : 'file'} size=${15} />
          <span class="doc-title">${d.title}</span>
          <span class="muted small doc-sub">${d.sub}</span>
          <span class="muted small tnum">${d.date}</span>
        </li>`)}
      </ul>
    </div></div>
  </div>`;
}

function ItemCard({ item, ctx, editing, setEditing }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const { pid, pos, editable, qa, isCurrent, role, canAskAI, canAsk } = ctx;
  const hl = ui.highlight?.itemId === item.id;
  useEffect(() => { if (hl && ui.highlight.openDocs) setOpen(true); }, [ui.highlight?.at]);
  const roots = qa.filter((q) => q.itemId === item.id && !q.parentId).sort((a, b) => (a.at < b.at ? -1 : 1));
  const isEditing = editing === item.id;

  return html`<article id=${`item-${item.id}`} class=${cx('item-card card', isEditing && 'editing', hl && 'flash', `cat-edge-${item.category}`)}>
    ${isEditing && html`<div class="edit-strip"><${Icon} name="pencil" size=${14} />편집 중</div>`}
    <header class="item-head">
      <${CatBadge} cat=${item.category} />
      <h3 class="h3 item-title">${item.title}</h3>
      <span class="muted small">${item.period}</span>
      ${item.source === 'rec' && html`<span class="mini-badge mint">추천</span>`}
      ${item.source === 'manual' && html`<span class="mini-badge ink">직접 추가</span>`}
      ${item.modified && html`<span class="mini-badge amber">수정됨</span>`}
      <span class="grow"></span>
      ${editable
        ? html`<button class=${cx('star-btn', item.important && 'on')} onClick=${() => toggleImportant(pid, item.id)} aria-pressed=${item.important} title="중요 표시"><${Icon} name="star" size=${18} /></button>`
        : item.important && html`<span class="star-btn on static" title="중요"><${Icon} name="star" size=${18} /></span>`}
      ${editable && !isEditing && html`<button class="icon-btn sm" onClick=${() => setEditing(item.id)} title="편집" aria-label="편집"><${Icon} name="pencil" size=${16} /></button>`}
    </header>
    ${isEditing
      ? html`<${EditForm} item=${item} pid=${pid} deptOptions=${ctx.deptOptions} onDone=${() => setEditing(null)} />`
      : html`
        <p class="item-desc">${item.desc}</p>
        <${DeptLine} depts=${item.depts} />
        ${item.memo && html`<div class="memo"><${Icon} name="note" size=${16} /><div><span class="memo-label">인계자 메모</span><p>${item.memo}</p></div></div>`}
        <${Evidence} item=${item} pos=${pos} open=${open} setOpen=${setOpen} />`}
    ${(roots.length > 0 || canAskAI) && html`<div class="qa">
      ${roots.length > 0 && html`<p class="qa-title"><${Icon} name="message" size=${15} />질문·답변 ${roots.length}</p>`}
      ${roots.map((r) => html`<${Thread} key=${r.id} root=${r} all=${qa} ctx=${ctx} />`)}
      ${canAskAI && html`<${AskBox} pid=${pid} itemId=${item.id} canAsk=${canAsk} />`}
    </div>`}
  </article>`;
}

function DeptLine({ depts }) {
  if (!depts?.length) return null;
  return html`<p class="dept-line"><span class="muted small">관계부서</span>${depts.map((d) => html`<span class="dept-chip static" key=${d}>${d}</span>`)}</p>`;
}

function AggCard({ row, people }) {
  const ui = useUI();
  const hl = ui.highlight?.itemId === row.id;
  return html`<article id=${`item-${row.id}`} class=${cx('item-card card', hl && 'flash', `cat-edge-${row.category}`)}>
    <header class="item-head">
      <${CatBadge} cat=${row.category} />
      <h3 class="h3 item-title">${row.title}</h3>
      <span class="muted small">${row.period}</span>
      <span class="mini-badge mint tnum">역대 ${row.holders}/${people}명</span>
      ${row.ratio >= 0.75 && html`<span class="mini-badge blue">공통 핵심</span>`}
    </header>
    <p class="item-desc">${row.desc}</p>
    <${DeptLine} depts=${row.depts} />
    <p class="small muted">수행한 담당자 · ${row.holderList.join(', ')}</p>
  </article>`;
}

export function Detail({ s, views, view, mode }) {
  const ui = useUI();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const pid = s.session.positionId;
  const pos = POSITION[pid];
  const role = s.session.role;
  const topRef = useRef();

  const items = mode === 'aggregate' ? [] : sortItems(view.items);
  const aggRows = mode === 'aggregate' ? (() => {
    const list = views.aggList;
    // 지도와 같은 행 순서
    const map = new Map();
    list.forEach((h) => h.items.forEach((it) => {
      if (!map.has(it.key)) map.set(it.key, { key: it.key, id: `agg-${it.key}`, title: it.title, category: it.category, months: it.months, period: it.period, desc: it.desc, holders: 0, holderList: [], depts: new Set() });
      const r = map.get(it.key);
      r.holders += 1;
      r.holderList.push(`${h.person.rank} ${h.person.name}`);
      (it.depts || []).forEach((d) => r.depts.add(d));
    }));
    return sortItems([...map.values()].map((r) => ({ ...r, depts: [...r.depts], ratio: r.holders / list.length })));
  })() : [];

  const source = mode === 'aggregate' ? aggRows : items;
  const counts = Object.fromEntries(CAT_ORDER.map((c) => [c, source.filter((i) => i.category === c).length]));
  const shown = filter === 'all' ? source : source.filter((i) => i.category === filter);

  useEffect(() => {
    const id = ui.highlight?.itemId;
    if (id && filter !== 'all' && !shown.find((i) => i.id === id)) setFilter('all');
  }, [ui.highlight?.at]);

  // 원그래프에서 분류를 누르면 그 분류로 거르고 상세 영역으로 이동
  useEffect(() => {
    if (!ui.detailFilter) return;
    setFilter(ui.detailFilter.cat);
    setTimeout(() => scrollToId('detail', 'start'), 30);
  }, [ui.detailFilter?.at]);

  const h = views.h;
  const ctx = {
    pid, pos, role,
    items: h.items,
    isCurrent: !!view?.isCurrent,
    editable: !!view?.isCurrent && isEditable(s, h),
    qa: view?.qa || [],
    canAskAI: !!view?.isCurrent && role === 'receiver' && !!h.firstSubmittedAt,
    canAsk: canAskPredecessor(s, h),
    // 자동완성용: 온나라 협조 부서 + 역대·현재 인계서에 적힌 부서
    deptOptions: [...new Set([
      ...pos.onnara.flatMap((d) => d.coop || []),
      ...pos.history.flatMap((hh) => hh.items.flatMap((it) => it.depts || [])),
      ...h.items.flatMap((it) => it.depts || []),
    ])].sort((a, b) => a.localeCompare(b)),
  };

  const addNew = () => {
    const item = { id: uid('it'), key: `manual:${uid('k')}`, category: 'event', title: '새 업무', months: [], period: '수시', desc: '', depts: [], docIds: [], important: false, memo: '', source: 'manual', modified: false };
    addItem(pid, item);
    setFilter('all');
    setEditing(item.id);
    setTimeout(() => setUI({ highlight: { itemId: item.id, at: Date.now() } }), 50);
  };

  return html`<section class="detail" id="detail" ref=${topRef}>
    <div class="detail-head">
      <h2 class="h2">상세 업무</h2>
      <div class="chips">
        <button class=${cx('chip', filter === 'all' && 'on')} onClick=${() => setFilter('all')}>전체 <span class="tnum">${source.length}</span></button>
        ${CAT_ORDER.filter((c) => counts[c] > 0 || mode !== 'aggregate').map((c) => html`
          <button class=${cx('chip', filter === c && 'on')} onClick=${() => setFilter(c)}><span class=${`sym cat-${c}`}><${CatSym} cat=${c} /></span>${CATS[c].label} <span class="tnum">${counts[c]}</span></button>`)}
      </div>
      <span class="grow"></span>
      ${ctx.editable && html`<button class="btn secondary sm" onClick=${addNew}><${Icon} name="plus" size=${16} />항목 추가</button>`}
    </div>
    ${ctx.editable && html`<p class="small muted edit-hint"><${Icon} name="pencil" size=${14} /> 초안 편집 중입니다. 카드의 ★로 중요 표시를, 연필로 수정·메모를 남길 수 있어요.</p>`}
    <div class="item-list">
      ${mode === 'aggregate'
        ? shown.map((r) => html`<${AggCard} key=${r.id} row=${r} people=${views.aggList.length} />`)
        : shown.map((it) => html`<${ItemCard} key=${it.id} item=${it} ctx=${ctx} editing=${editing} setEditing=${setEditing} />`)}
      ${!shown.length && html`<p class="muted empty-row">이 분류의 항목이 없습니다</p>`}
    </div>
  </section>`;
}
