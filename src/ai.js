// Gemini 호출 (/api/ai 중계 함수) — 스트리밍 + 부드러운 타자 효과 + 같은 요청 재사용
import { getState, putCache } from './store.js';
import { POSITION } from './data/seed.js';
import { BAKED } from './data/baked-ai.js';
import { CATS } from './engine.js';
import { hash, periodLabel } from './util.js';

const MARK = '<<<REFS>>>';

/** API 사용량(요청 횟수) 초과로 막혔을 때 결과 자리에 보여 주는 문구 */
export const AI_QUOTA_MSG = 'API 사용량 초과로 AI 서비스 사용이 제한됩니다.';
/** 실패 이유: 'quota'(사용량 초과) | 'error'(그 밖의 실패) */
export const aiFailReason = (e) => (e?.code === 'quota' ? 'quota' : 'error');
// 로컬 서버는 스트리밍 없이 답을 한 번에 돌려주고, Gemini 3.x 응답은 10초 안팎 걸려 여유를 둔다
const FIRST_BYTE_MS = 25000;
const TOTAL_MS = 45000;

/** 받은 글자를 프레임마다 조금씩 드러낸다 */
function typewriter(onText) {
  let target = '';
  let shown = 0;
  let done = false;
  let stopped = false;
  let resolveEnd;
  const ended = new Promise((r) => { resolveEnd = r; });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 화면 갱신(requestAnimationFrame) 대신 짧은 타이머로 진행한다: 탭이 뒤에 있거나 가려져 있어도 멈추지 않는다
  const next = () => setTimeout(frame, 16);
  function frame() {
    if (stopped) return;
    if (shown < target.length) {
      const gap = target.length - shown;
      shown = reduce || document.hidden ? target.length : Math.min(target.length, shown + Math.max(1, Math.ceil(gap / 14)));
      onText(target.slice(0, shown), false);
    }
    if (done && shown >= target.length) { onText(target, true); resolveEnd(); return; }
    next();
  }
  next();
  return {
    push(t) { target = t; },
    finish() { done = true; return ended; },
    cancel() { stopped = true; resolveEnd(); }, // 실패하면 타이머를 멈추고 더 이상 화면에 쓰지 않는다
  };
}

/**
 * @returns {Promise<string>} 전체 원문
 */
/** 미리 작성본이나 브라우저 저장본이 있어 호출 없이 바로 답할 수 있는지 */
export const hasCached = (cacheKey) => !!(BAKED[cacheKey] || getState().aiCache[cacheKey]);

export async function streamAI({ kind, input, cacheKey, onText }) {
  // 미리 Gemini로 만들어 둔 결과(baked-ai.js) → 브라우저 저장본 → 실제 호출 순서
  const cached = BAKED[cacheKey] || getState().aiCache[cacheKey];
  const tw = typewriter(onText);
  if (cached) {
    tw.push(cached.raw);
    await tw.finish();
    return cached.raw;
  }
  const ctrl = new AbortController();
  const first = setTimeout(() => ctrl.abort(), FIRST_BYTE_MS);
  const total = setTimeout(() => ctrl.abort(), TOTAL_MS);
  let raw = '';
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, input }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const err = new Error(`HTTP ${res.status}`);
      if (res.status === 429) err.code = 'quota';
      throw err;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(first);
      raw += dec.decode(value, { stream: true });
      tw.push(raw);
    }
    raw += dec.decode();
    if (!raw.trim()) throw new Error('empty');
    tw.push(raw);
    await tw.finish();
    putCache(cacheKey, { raw, at: new Date().toISOString() });
    return raw;
  } catch (e) {
    tw.cancel();
    throw e;
  } finally {
    clearTimeout(first);
    clearTimeout(total);
  }
}

/** 표시용 본문: 근거 표식 이후와 끝에 걸린 표식 조각을 숨긴다 */
export function visibleAnswer(raw) {
  const i = raw.indexOf(MARK);
  let t = i >= 0 ? raw.slice(0, i) : raw;
  for (let k = MARK.length - 1; k > 0; k--) {
    if (t.endsWith(MARK.slice(0, k))) { t = t.slice(0, -k); break; }
  }
  return t.trim();
}

export function parseAnswer(raw) {
  const text = visibleAnswer(raw);
  const i = raw.indexOf(MARK);
  let refs = { items: [], docs: [] };
  let found = !/근거를 찾지 못했/.test(text);
  if (i >= 0) {
    try {
      const j = JSON.parse(raw.slice(i + MARK.length).trim().replace(/```.*$/s, ''));
      refs = { items: Array.isArray(j.items) ? j.items : [], docs: Array.isArray(j.docs) ? j.docs : [] };
      if (typeof j.found === 'boolean') found = j.found;
    } catch { /* 형식이 어긋나면 본문만 쓴다 */ }
  }
  return { text, refs, found };
}

// ───────── 프롬프트 입력 만들기 ─────────

function docTitle(pos, id) {
  const f = pos.files.find((x) => x.id === id);
  if (f) return `${f.name} (${f.date}, 업무폴더/${f.path.join('/')})`;
  const o = pos.onnara.find((x) => x.id === id);
  if (o) return `${o.title} (${o.date}, 온나라${o.coop?.length ? `, 협조: ${o.coop.join('·')}` : ''})`;
  return null;
}

// withDocs=false(브리핑)일 때는 항목 id를 빼서, 자동 작성할 때마다 바뀌는 id 때문에 미리 만든 브리핑과 어긋나지 않게 한다
function itemLine(pos, it, withDocs) {
  const head = `${withDocs ? `[${it.id}] ` : ''}(${CATS[it.category]?.label || '업무'}) ${it.title}`;
  const parts = [head, `시기: ${it.period}`, `설명: ${it.desc}`];
  if (it.depts?.length) parts.push(`관계부서: ${it.depts.join(', ')}`);
  if (it.important) parts.push('★중요');
  if (it.memo) parts.push(`인계자 메모: ${it.memo}`);
  if (withDocs) {
    const docs = it.docs
      ? it.docs.slice(0, 4).map((d) => `[${d.id}] ${d.title}`)
      : (it.docIds || []).slice(0, 6).map((id) => `[${id}] ${docTitle(pos, id)}`);
    if (docs.length) parts.push(`근거 문서: ${docs.join('; ')}`);
  }
  return parts.join(' | ');
}

// 오늘 날짜는 넣지 않는다: 시연 날짜를 바꿔도 미리 만든 브리핑이 그대로 쓰이게 하기 위함
export function briefingInput(pid, items, { mode, moveDate, person }) {
  const pos = POSITION[pid];
  const ask = mode === 'aggregate'
    ? '역대 담당자들이 공통으로 해온 핵심 업무와 시기를 3~5줄로 요약하세요.'
    : `첫 줄에 이 자리가 어떤 업무를 하는 자리인지, 이어서 후임자가 부임 첫 달(인사이동일 ${moveDate}이 속한 달과 다음 달)에 꼭 챙길 것 3가지를 써서 전체 3~5줄로 요약하세요.`;
  return [
    `직책: ${pos.title} (${pos.unit} ${pos.dept})`,
    `직책 소개: ${pos.intro}`,
    person ? `인계자: ${person}` : '',
    `요청: ${ask}`,
    '',
    '[인계서 항목]',
    ...items.map((it) => itemLine(pos, it, false)),
  ].filter((l) => l !== null).join('\n');
}

export function answerInput(pid, { item, question, items, giver, giverPeriod }) {
  const pos = POSITION[pid];
  const lines = [
    `직책: ${pos.title} (${pos.unit} ${pos.dept})`,
    `질문한 항목: [${item.id}] ${item.title}`,
    `질문: ${question}`,
    '',
    `[현재 인계서 — ${giver}, ${giverPeriod}]`,
    ...items.map((it) => itemLine(pos, it, true)),
  ];
  for (const h of pos.history) {
    lines.push('', `[역대 인계서 — ${h.person.rank} ${h.person.name}, ${h.periodLabel}]`);
    lines.push(...h.items.map((it) => itemLine(pos, it, true)));
  }
  return lines.join('\n').slice(0, 38000);
}

/** 업무 설명을 이번 근거 문서 + 이전 담당자 설명으로 다시 쓰게 하는 입력 (항목 id는 넣지 않아 미리 작성한 설명과 맞춘다) */
export function describeInput(pid, item) {
  const pos = POSITION[pid];
  const docs = (item.docIds || []).slice(0, 8).map((id) => docTitle(pos, id)).filter(Boolean);
  return [
    `직책: ${pos.title} (${pos.unit} ${pos.dept})`,
    `업무: (${CATS[item.category]?.label || '업무'}) ${item.title}`,
    `시기: ${item.period}`,
    item.depts?.length ? `관계부서: ${item.depts.join(', ')}` : '',
    item.descRef ? `이전 인계서 설명 (${item.descRef.from}): ${item.descRef.desc}` : '이전 인계서 설명: 없음',
    '',
    '[이번 근무기간 근거 문서]',
    ...docs,
  ].filter((l) => l !== null).join('\n');
}

export const describeCacheKey = (input) => `desc:${hash(input)}`;
export const briefCacheKey = (input) => `brief:${hash(input)}`;
export const answerCacheKey = (pid, itemId, q) => `ans:${pid}:${itemId}:${hash(q.trim().replace(/\s+/g, ' '))}`;
export const giverPeriodLabel = (p) => periodLabel(p.start, p.end);
