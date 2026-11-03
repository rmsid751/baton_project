// 모달 — 자동 작성(단계형), 입회요청, 반려, 입회완료, 리셋
import { html, useEffect, useMemo, useRef, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { POSITION, giverOf, reviewerOf } from '../data/seed.js';
import { analyze, isExcluded } from '../engine.js';
import { approve, closeModal, getState, personLabel, reject, resetAll, saveGenerated, setTab, submit, toast, useStore, useUI } from '../store.js';
import { briefCacheKey, briefingInput, describeCacheKey, describeInput, streamAI } from '../ai.js';
import { cx, dot, fmtStamp, stamp } from '../util.js';
import { makeHandoverPdf } from '../pdf.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function Modal({ children, size = 'md', onClose, label }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);
  return html`<div class="overlay fade-in" onClick=${(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
    <div class=${`modal glass modal-${size} pop-in`} role="dialog" aria-modal="true" aria-label=${label}>
      ${onClose && html`<button class="icon-btn modal-x" onClick=${onClose} aria-label="닫기"><${Icon} name="x" /></button>`}
      ${children}
    </div>
  </div>`;
}

// ───────── 폴더 선택 (탐색기형 트리) ─────────
function buildTree(files) {
  const dirs = new Map();
  for (const f of files) {
    const [dir, leaf] = f.path;
    if (!dirs.has(dir)) dirs.set(dir, { name: dir, leaves: new Map(), files: [] });
    const d = dirs.get(dir);
    if (leaf) {
      if (!d.leaves.has(leaf)) d.leaves.set(leaf, []);
      d.leaves.get(leaf).push(f);
    } else d.files.push(f);
  }
  return [...dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const latest = (files) => files.reduce((m, f) => (f.date > m ? f.date : m), '');
const byDate = (a, b) => (a.date < b.date ? 1 : -1);

function FileRow({ f, depth }) {
  const ex = isExcluded(f.name);
  return html`<div class=${cx('tree-row file', ex && 'excluded')} style=${`--depth:${depth}`}>
    <span class="tree-spacer"></span>
    <${Icon} name="file" size=${15} />
    <span class="tree-name">${f.name}</span>
    ${ex && html`<span class="mini-badge ink">분석 제외</span>`}
    <span class="tree-meta tnum">${f.date}</span>
  </div>`;
}

function FolderPicker({ pos, initial, onAdd, onCancel }) {
  const [checked, setChecked] = useState(() => new Set(initial.length ? initial : pos.folders.map((_, i) => i)));
  const [open, setOpen] = useState(() => new Set());
  const toggleOpen = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleCheck = (i) => setChecked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const trees = useMemo(() => pos.folders.map((_, i) => buildTree(pos.files.filter((f) => f.folder === i))), [pos]);

  return html`<div class="picker fade-in">
    <div class="picker-head">
      <h3 class="h3">업무 폴더 선택</h3>
      <p class="small muted">${personLabel(giverOf(pos.id))}의 업무 폴더입니다. 제외할 폴더만 체크를 해제하세요.</p>
    </div>
    <div class="tree">
      ${pos.folders.map((name, i) => {
        const files = pos.files.filter((f) => f.folder === i);
        const k = `f${i}`;
        const isOpen = open.has(k);
        return html`<div class="tree-group" key=${k}>
          <div class="tree-row folder top">
            <input type="checkbox" class="check" checked=${checked.has(i)} onChange=${() => toggleCheck(i)} aria-label=${`${name} 선택`} />
            <button class="tree-toggle" onClick=${() => toggleOpen(k)} aria-expanded=${isOpen}><${Icon} name="right" size=${15} cls=${cx('chev-r', isOpen && 'open')} /></button>
            <${Icon} name="folder" size=${17} />
            <button class="tree-name as-btn strong" onClick=${() => toggleOpen(k)}>${name}</button>
            <span class="tree-meta tnum">파일 ${files.length}개 · 최근 수정 ${latest(files)}</span>
          </div>
          <div class=${cx('collapse', isOpen && 'open')}><div class="collapse-inner">
            ${isOpen && trees[i].map((d) => {
              const dk = `${k}/${d.name}`;
              const dOpen = open.has(dk);
              const all = [...d.files, ...[...d.leaves.values()].flat()];
              return html`<div key=${dk}>
                <div class="tree-row folder" style="--depth:1">
                  <button class="tree-toggle" onClick=${() => toggleOpen(dk)}><${Icon} name="right" size=${15} cls=${cx('chev-r', dOpen && 'open')} /></button>
                  <${Icon} name="folder" size=${16} />
                  <button class="tree-name as-btn" onClick=${() => toggleOpen(dk)}>${d.name}</button>
                  <span class="tree-meta tnum">${all.length}개 · ${latest(all)}</span>
                </div>
                ${dOpen && html`<div>
                  ${[...d.leaves.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([leaf, lf]) => {
                    const lk = `${dk}/${leaf}`;
                    const lOpen = open.has(lk);
                    return html`<div key=${lk}>
                      <div class="tree-row folder" style="--depth:2">
                        <button class="tree-toggle" onClick=${() => toggleOpen(lk)}><${Icon} name="right" size=${15} cls=${cx('chev-r', lOpen && 'open')} /></button>
                        <${Icon} name="folder" size=${16} />
                        <button class="tree-name as-btn" onClick=${() => toggleOpen(lk)}>${leaf}</button>
                        <span class="tree-meta tnum">${lf.length}개 · ${latest(lf)}</span>
                      </div>
                      ${lOpen && [...lf].sort(byDate).map((f) => html`<${FileRow} key=${f.id} f=${f} depth=${3} />`)}
                    </div>`;
                  })}
                  ${[...d.files].sort(byDate).map((f) => html`<${FileRow} key=${f.id} f=${f} depth=${2} />`)}
                </div>`}
              </div>`;
            })}
          </div></div>
        </div>`;
      })}
    </div>
    <div class="modal-actions">
      <span class="small muted">${checked.size}개 선택 · 파일 ${pos.files.filter((f) => checked.has(f.folder)).length}개</span>
      <span class="grow"></span>
      <button class="btn secondary" onClick=${onCancel}>취소</button>
      <button class="btn primary" onClick=${() => onAdd([...checked].sort())}>추가</button>
    </div>
  </div>`;
}

// ───────── 자동 작성 ─────────
const STEPS = ['인사정보', '폴더', '온나라', '작성'];

function AutoWrite() {
  const s = useStore();
  const pid = s.session.positionId;
  const pos = POSITION[pid];
  const giver = giverOf(pid);
  const h = s.handovers[pid];
  const [step, setStep] = useState(1);
  const [added, setAdded] = useState(h.selectedFolders || []);
  const [picker, setPicker] = useState(false);
  const [lines, setLines] = useState([]);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const running = step === 4;
  const linked = pos.onnara.filter((d) => d.date >= giver.start && d.date <= giver.end).length;
  const filesIn = (i) => pos.files.filter((f) => f.folder === i).length;
  const fileTotal = added.reduce((n, i) => n + filesIn(i), 0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = async () => {
    setStep(4);
    const result = analyze({ files: pos.files, onnara: pos.onnara, folderIdxs: added, start: giver.start, end: giver.end, history: pos.history });
    const st = result.stats;
    const plan = [
      `업무 폴더 ${added.length}개에서 파일 ${st.fileCount}개 확인`,
      `분석 제외 ${st.excludedCount}개 (이미지·실행파일)`,
      `온나라 문서 ${st.onnaraCount}건 연동 (근무기간 기준)`,
      `문서 ${st.docTotal}건 분석 중…`,
      `업무 ${st.keyCount}개로 묶고 루틴·이벤트·특이사항으로 분류`,
      `업무별 관계부서 채우기 (${st.deptCount}곳) · 역대 인계서 ${pos.history.length}건과 비교`,
    ];
    const total = plan.length + 1;
    for (let i = 0; i < plan.length; i++) {
      setLines((l) => [...l, { text: plan[i], state: 'run' }]);
      await sleep(i === 3 ? 700 : 380);
      if (!alive.current) return;
      setLines((l) => l.map((x, k) => (k === i ? { ...x, state: 'done' } : x)));
      setPct(((i + 1) / total) * 100);
    }
    // AI가 업무 설명을 다시 쓴다: 이번 근거 문서 + 이전 담당자 설명(있으면)
    const fresh = result.items.filter((it) => it.descAuto);
    if (fresh.length) {
      setLines((l) => [...l, { text: `AI가 근거 문서와 역대 설명으로 업무 설명 작성 중… (${fresh.length}건)`, state: 'run', ai: true, key: 'desc' }]);
      let ok = 0;
      const queue = [...fresh];
      // 실제 호출일 때 한꺼번에 몰리지 않게 3건씩 나눠 부른다 (미리 작성본은 바로 끝난다)
      const worker = async () => {
        for (let it = queue.shift(); it; it = queue.shift()) {
          const input = describeInput(pid, it);
          try {
            const raw = (await streamAI({ kind: 'describe', input, cacheKey: describeCacheKey(input), onText: () => {} })).trim();
            if (raw) { it.desc = raw; ok += 1; }
          } catch { /* 못 부르면 이전 담당자 설명(없으면 임시 설명)이 남는다 */ }
          delete it.descAuto;
          delete it.descRef;
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (!alive.current) return;
      setLines((l) => l.map((x) => (x.key === 'desc' ? { ...x, state: ok === fresh.length ? 'done' : 'warn', text: ok === fresh.length ? `AI 업무 설명 작성 완료 (${ok}건)` : `AI 업무 설명 ${fresh.length - ok}건을 다시 쓰지 못해 기존 설명을 두었습니다` } : x)));
    }
    setLines((l) => [...l, { text: 'AI 인계 브리핑 작성 중…', state: 'run', ai: true, key: 'brief' }]);
    const today = getState().today;
    const input = briefingInput(pid, result.items, { mode: 'person', today, moveDate: h.moveDate, person: personLabel(giver) });
    let briefing;
    try {
      const raw = await streamAI({ kind: 'briefing', input, cacheKey: briefCacheKey(input), onText: () => {} });
      briefing = { text: raw.trim(), at: stamp(today), status: 'ok' };
    } catch {
      briefing = { status: 'error', at: stamp(today) };
    }
    if (!alive.current) return;
    setLines((l) => l.map((x) => (x.key === 'brief' ? { ...x, state: briefing.status === 'ok' ? 'done' : 'warn', text: briefing.status === 'ok' ? 'AI 인계 브리핑 작성 완료' : 'AI 브리핑을 불러오지 못했습니다 (원페이지에서 다시 시도)' } : x)));
    setPct(100);
    setDone(true);
    await sleep(800);
    saveGenerated(pid, { folders: added, result, briefing });
    setTab('current');
    closeModal();
    toast(`인계서 초안을 만들었습니다 · 항목 ${result.items.length}건`, 'ok');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return html`<${Modal} size="lg" label="인계서 자동 작성" onClose=${running ? null : closeModal}>
    <div class="modal-head">
      <p class="eyebrow">${pos.title} · ${dot(giver.start)}~${dot(giver.end)}</p>
      <h2 class="h2">인계서 자동 작성</h2>
      <ol class="stepper">
        ${STEPS.map((t, i) => html`<li class=${cx(step === i + 1 && 'on', step > i + 1 && 'done')}>
          <span class="step-dot">${step > i + 1 ? html`<${Icon} name="check" size=${13} />` : i + 1}</span>${t}
        </li>`)}
      </ol>
    </div>

    ${step === 1 && html`<div class="modal-body fade-in" key="s1">
      <p class="lead">인사정보체계에서 불러온 정보입니다. 근무기간이 온나라 문서 조회와 분석의 기준이 됩니다.</p>
      <dl class="info-grid">
        <dt>계급</dt><dd>${giver.rank}</dd>
        <dt>성명</dt><dd>${giver.name}</dd>
        <dt>소속</dt><dd>${pos.unit} ${pos.dept}</dd>
        <dt>직책</dt><dd>${pos.title}</dd>
        <dt>근무기간</dt><dd class="tnum">${dot(giver.start)} ~ ${dot(giver.end)}</dd>
      </dl>
      ${h.status === 'draft' && html`<p class="note"><${Icon} name="info" size=${16} />다시 작성하면 지금까지 편집한 내용이 새 분석 결과로 바뀝니다.</p>`}
      <div class="modal-actions"><span class="grow"></span><button class="btn primary" onClick=${() => setStep(2)}>확인</button></div>
    </div>`}

    ${step === 2 && html`<div class="modal-body fade-in" key="s2">
      ${picker
        ? html`<${FolderPicker} pos=${pos} initial=${added} onCancel=${() => setPicker(false)} onAdd=${(sel) => { setAdded(sel); setPicker(false); }} />`
        : html`
          <p class="lead">분석할 업무 폴더를 추가하세요. 폴더 하나만 골라도 분석됩니다.</p>
          <button class="btn secondary add-folder" onClick=${() => setPicker(true)}><${Icon} name="plus" size=${18} />폴더 추가하기</button>
          ${added.length > 0 && html`<div class="folder-chips fade-up">
            ${added.map((i) => html`<span class="folder-chip" key=${i}><${Icon} name="folder" size=${16} />${pos.folders[i]}<span class="muted small tnum">${filesIn(i)}개</span>
              <button class="chip-x" onClick=${() => setAdded(added.filter((x) => x !== i))} aria-label=${`${pos.folders[i]} 빼기`}><${Icon} name="x" size=${14} /></button></span>`)}
            <p class="ok-line"><${Icon} name="check" size=${16} />파일 ${fileTotal}개 확인</p>
          </div>`}
          <div class="modal-actions">
            <button class="btn-text" onClick=${() => setStep(1)}><${Icon} name="arrowLeft" size=${16} />이전</button>
            <span class="grow"></span>
            <button class="btn primary" disabled=${!added.length} onClick=${() => setStep(3)}>다음</button>
          </div>`}
    </div>`}

    ${step === 3 && html`<div class="modal-body fade-in" key="s3">
      <div class="onnara-ok">
        <span class="ok-circle"><${Icon} name="check" size=${22} /></span>
        <div>
          <p class="h3">온나라 문서 ${linked}건 자동 연동</p>
          <p class="small muted">근무기간(${dot(giver.start)}~${dot(giver.end)}) 기준 · 폴더 선택과 관계없이 모두 연동됩니다</p>
        </div>
      </div>
      <div class="summary-line">
        <span><${Icon} name="folder" size=${16} />업무 폴더 ${added.length}개 · 파일 ${fileTotal}개</span>
        <span><${Icon} name="database" size=${16} />온나라 문서 ${linked}건</span>
      </div>
      <div class="modal-actions">
        <button class="btn-text" onClick=${() => setStep(2)}><${Icon} name="arrowLeft" size=${16} />이전</button>
        <span class="grow"></span>
        <button class="btn primary" disabled=${!added.length} onClick=${run}><${Icon} name="sparkle" size=${18} />자동 작성</button>
      </div>
    </div>`}

    ${step === 4 && html`<div class="modal-body fade-in" key="s4">
      <div class="progress"><i style=${`width:${pct}%`}></i></div>
      <ul class="run-list">
        ${lines.map((l, i) => html`<li key=${i} class=${cx('run-line fade-up', l.state, l.ai && 'ai')}>
          <span class="run-ic">${l.state === 'done' ? html`<${Icon} name="check" size=${15} />` : l.ai ? html`<${Icon} name="sparkle" size=${15} />` : l.state === 'warn' ? html`<${Icon} name="info" size=${15} />` : html`<span class="spin"></span>`}</span>
          ${l.text}
        </li>`)}
      </ul>
      ${done && html`<div class="done-check pop-in"><span class="ok-circle big"><${Icon} name="check" size=${30} /></span><p class="h3">인계서 초안 완성</p></div>`}
    </div>`}
  </${Modal}>`;
}

// ───────── 인계인수서 PDF ─────────
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

/** 만든 PDF 미리보기 + 다운로드 (입회요청 2단계와 PDF 보기 창이 함께 쓴다) */
function PdfPreview({ pdf, onRetry }) {
  if (pdf.phase === 'making') return html`<div class="pdf-making"><span class="spin"></span>인계인수서 PDF를 만드는 중…</div>`;
  if (pdf.phase === 'error') {
    return html`<div class="ai-fail"><p>PDF를 만들지 못했습니다. ${pdf.message || ''}</p>
      <button class="btn-text" onClick=${onRetry}><${Icon} name="refresh" size=${16} />다시 시도</button></div>`;
  }
  if (pdf.phase !== 'ready') return null;
  return html`<div class="pdf-ready fade-in">
    <div class="pdf-file">
      <span class="pdf-ic">PDF</span>
      <span class="pdf-meta"><strong>${pdf.filename}</strong><span class="small muted">${pdf.pages}쪽 · ${kb(pdf.size)}</span></span>
      <span class="grow"></span>
      <a class="btn-text" href=${pdf.url} download=${pdf.filename}><${Icon} name="file" size=${16} />다운로드</a>
      <a class="btn-text" href=${pdf.url} target="_blank" rel="noopener">새 창으로 보기</a>
    </div>
    <iframe class="pdf-frame" src=${pdf.url} title="인계인수서 PDF 미리보기"></iframe>
  </div>`;
}

/** PDF를 만들어 blob 주소를 관리하는 훅 (창을 닫으면 주소 해제) */
function usePdf() {
  const [pdf, setPdf] = useState({ phase: 'idle' });
  const alive = useRef(true);
  const urlRef = useRef(null);
  useEffect(() => () => { alive.current = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const make = async (args) => {
    setPdf({ phase: 'making' });
    try {
      const out = await makeHandoverPdf(args);
      if (!alive.current) { URL.revokeObjectURL(out.url); return null; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = out.url;
      setPdf({ phase: 'ready', ...out });
      return out;
    } catch (e) {
      if (alive.current) setPdf({ phase: 'error', message: e.message });
      return null;
    }
  };
  return [pdf, make];
}

/** 온나라 첨부 PDF 보기 — 입회요청 시점에 저장한 내용으로 같은 PDF를 다시 만든다 */
function PdfViewModal() {
  const s = useStore();
  const pid = s.session.positionId;
  const h = s.handovers[pid];
  const att = h.attachment;
  const [pdf, make] = usePdf();
  const open = () => att?.snapshot && make({
    pid,
    handover: { ...h, items: att.snapshot.items, briefing: att.snapshot.briefing, moveDate: att.snapshot.moveDate },
    receiver: att.snapshot.receiver,
    today: att.snapshot.today,
  });
  useEffect(() => { open(); }, []);
  return html`<${Modal} size="xl" label="온나라 첨부 PDF" onClose=${closeModal}>
    <div class="modal-head">
      <p class="eyebrow">온나라 첨부 문서${att ? ` · ${fmtStamp(att.at)} 입회요청` : ''}</p>
      <h2 class="h2">인계인수서 PDF</h2>
    </div>
    <div class="modal-body">
      ${att?.snapshot ? html`<${PdfPreview} pdf=${pdf} onRetry=${open} />` : html`<p class="muted">첨부 문서 내용을 찾을 수 없습니다.</p>`}
      <div class="modal-actions"><span class="grow"></span><button class="btn secondary" onClick=${closeModal}>닫기</button></div>
    </div>
  </${Modal}>`;
}

// ───────── 입회요청 ─────────
function SubmitModal() {
  const s = useStore();
  const pid = s.session.positionId;
  const pos = POSITION[pid];
  const h = s.handovers[pid];
  const [sel, setSel] = useState(h.receiver ? pos.candidates.findIndex((c) => c.name === h.receiver.name) : -1);
  const [step, setStep] = useState(1); // 1 인수자 선택 → 2 인계인수서 PDF 확인
  const [pdf, make] = usePdf(); // idle | making | ready | error
  const again = h.status === 'rejected';
  const receiver = sel >= 0 ? { rank: pos.candidates[sel].rank, name: pos.candidates[sel].name } : null;

  const makePdf = () => {
    setStep(2);
    make({ pid, handover: h, receiver, today: s.today });
  };
  const go = () => {
    if (!receiver || pdf.phase !== 'ready') return;
    submit(pid, receiver, { filename: pdf.filename, pages: pdf.pages, size: pdf.size });
    closeModal();
    toast(again ? '입회를 다시 요청했습니다 · 인계인수서 PDF를 첨부해 온나라로 보냈습니다' : '작성완료 · 인계인수서 PDF를 첨부해 온나라로 입회를 요청했습니다', 'ok');
  };
  if (step === 2) {
    return html`<${Modal} size="xl" label="인계인수서 PDF 확인" onClose=${closeModal}>
      <div class="modal-head">
        <p class="eyebrow">${again ? '입회 재요청' : '작성완료 및 입회요청'} · 2/2</p>
        <h2 class="h2">인계인수서 PDF 확인</h2>
      </div>
      <div class="modal-body">
        <${PdfPreview} pdf=${pdf} onRetry=${makePdf} />
        <p class="note"><${Icon} name="info" size=${16} />이 PDF를 첨부해 온나라로 입회를 요청합니다. 내용을 확인한 뒤 [확인 및 입회요청]을 눌러 주세요.</p>
        <div class="modal-actions">
          <button class="btn-text" onClick=${() => setStep(1)}><${Icon} name="arrowLeft" size=${16} />이전</button>
          <span class="grow"></span>
          <button class="btn secondary" onClick=${closeModal}>취소</button>
          <button class="btn primary" disabled=${pdf.phase !== 'ready'} onClick=${go}><${Icon} name="send" size=${17} />확인 및 입회요청</button>
        </div>
      </div>
    </${Modal}>`;
  }

  return html`<${Modal} label="작성완료 및 입회요청" onClose=${closeModal}>
    <div class="modal-head">
      <p class="eyebrow">${again ? '입회 재요청' : '작성완료 및 입회요청'} · 1/2</p>
      <h2 class="h2">${again ? '입회 재요청' : '작성완료 및 입회요청'}</h2>
    </div>
    <div class="modal-body">
      <p class="field-label">인수자 선택 <span class="req">필수</span></p>
      <div class="person-select" role="radiogroup">
        ${pos.candidates.map((c, i) => html`<button key=${c.name} role="radio" aria-checked=${sel === i} class=${cx('person-opt', sel === i && 'on')} onClick=${() => setSel(i)}>
          <span class="radio"></span>
          <span><strong>${c.rank} ${c.name}</strong><span class="small muted">${c.note}</span></span>
        </button>`)}
      </div>
      ${sel >= 0 && html`<p class="approver-line fade-in"><${Icon} name="clipboard" size=${15} /><span class="muted">입회자</span>
        <strong>${personLabel(reviewerOf(pid))}</strong><span class="muted">${reviewerOf(pid).title}</span></p>`}
      <p class="note"><${Icon} name="info" size=${16} />입회자에게 온나라로 입회를 요청합니다. 다음 단계에서 첨부할 인계인수서 PDF를 확인합니다.</p>
      <div class="modal-actions">
        <span class="grow"></span>
        <button class="btn secondary" onClick=${closeModal}>취소</button>
        <button class="btn primary" disabled=${sel < 0} onClick=${makePdf}><${Icon} name="file" size=${17} />다음: PDF 확인</button>
      </div>
    </div>
  </${Modal}>`;
}

function RejectModal() {
  const s = useStore();
  const pid = s.session.positionId;
  const [reason, setReason] = useState('');
  const go = () => {
    if (!reason.trim()) return;
    reject(pid, reason.trim());
    closeModal();
    toast('반려했습니다. 인계자에게 반려 알림을 보냈습니다.', 'ok');
  };
  return html`<${Modal} label="반려" onClose=${closeModal}>
    <div class="modal-head"><h2 class="h2">반려</h2></div>
    <div class="modal-body">
      <label class="field"><span>반려 사유 <span class="req">필수</span></span>
        <textarea class="input" rows="4" placeholder="예) UFS 연습 통신 지원 항목에 협조 부서와 준비 일정을 보완해 주세요." value=${reason} onInput=${(e) => setReason(e.target.value)}></textarea>
      </label>
      <div class="modal-actions">
        <span class="grow"></span>
        <button class="btn secondary" onClick=${closeModal}>취소</button>
        <button class="btn danger" disabled=${!reason.trim()} onClick=${go}>반려</button>
      </div>
    </div>
  </${Modal}>`;
}

function ApproveModal() {
  const s = useStore();
  const pid = s.session.positionId;
  const h = s.handovers[pid];
  const go = () => {
    approve(pid);
    closeModal();
    toast('입회완료했습니다 · 온나라 인수인계함에서도 입회완료로 처리되었습니다', 'ok');
  };
  return html`<${Modal} label="입회완료" onClose=${closeModal}>
    <div class="modal-head"><h2 class="h2">입회완료</h2></div>
    <div class="modal-body">
      <p class="lead">${POSITION[pid].title} 인계서${h.receiver ? ` (인수자 ${h.receiver.rank} ${h.receiver.name})` : ''}의 인계인수 입회를 완료합니다.</p>
      <p class="note"><${Icon} name="info" size=${16} />온나라 인수인계함에서도 입회완료로 처리됩니다. 입회를 완료하시겠습니까?</p>
      <div class="modal-actions">
        <span class="grow"></span>
        <button class="btn secondary" onClick=${closeModal}>취소</button>
        <button class="btn primary" onClick=${go}><${Icon} name="check" size=${17} />확인</button>
      </div>
    </div>
  </${Modal}>`;
}

function ResetModal() {
  return html`<${Modal} label="초기 데이터로 리셋" onClose=${closeModal}>
    <div class="modal-head"><h2 class="h2">초기 데이터로 리셋</h2></div>
    <div class="modal-body">
      <p>이 브라우저에 저장된 인계서·질문·알림·AI 답변을 모두 지우고 처음 상태로 돌아갑니다.</p>
      <div class="modal-actions">
        <span class="grow"></span>
        <button class="btn secondary" onClick=${closeModal}>취소</button>
        <button class="btn danger" onClick=${() => { resetAll(); toast('초기 데이터로 리셋했습니다', 'ok'); }}><${Icon} name="reset" size=${17} />리셋</button>
      </div>
    </div>
  </${Modal}>`;
}

export function Modals() {
  const ui = useUI();
  const t = ui.modal?.type;
  if (t === 'autowrite') return html`<${AutoWrite} />`;
  if (t === 'submit') return html`<${SubmitModal} />`;
  if (t === 'reject') return html`<${RejectModal} />`;
  if (t === 'approve') return html`<${ApproveModal} />`;
  if (t === 'pdf') return html`<${PdfViewModal} />`;
  if (t === 'reset') return html`<${ResetModal} />`;
  return null;
}
