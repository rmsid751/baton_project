// 상태 저장소 — 브라우저별 저장(localStorage), 변하지 않는 더미 데이터는 seed.js 에서 매번 생성
import { useEffect, useReducer } from './lib.js';
import { DEFAULT_TODAY, MOVE_DATE, POSITION, POSITIONS, PERSON, giverOf, receiverOf, reviewerOf } from './data/seed.js';
import { addDays, stamp, uid } from './util.js';
import { CATS } from './engine.js';

// v3: 근무기간·인사이동일 변경, 상신·결재 → 입회요청·입회완료
const KEY = 'baton.state.v3';

function blankHandover(p) {
  return {
    positionId: p.id,
    status: 'none', // none | draft | pending | rejected | approved
    receiver: null,
    moveDate: MOVE_DATE,
    firstSubmittedAt: null,
    submittedAt: null,
    selectedFolders: [],
    stats: null,
    ignoredRecs: [],
    items: [],
    briefing: null,
    log: [],
    updatedAt: null,
  };
}

function initialState() {
  return {
    v: 1,
    today: DEFAULT_TODAY,
    session: { role: null, personId: null, positionId: null },
    tab: 'current',
    handovers: Object.fromEntries(POSITIONS.map((p) => [p.id, blankHandover(p)])),
    qa: [],
    notifications: [],
    aiCache: {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

let state = load() || initialState();
const subs = new Set();
let saveTimer = 0;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장 불가 환경 */ }
  }, 60);
}

export const getState = () => state;

export function setState(fn) {
  const draft = structuredClone(state);
  fn(draft);
  state = draft;
  persist();
  subs.forEach((f) => f());
}

export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    subs.add(force);
    return () => subs.delete(force);
  }, []);
  return state;
}

// ───────── 화면 임시 상태 (저장하지 않음) ─────────
let ui = { modal: null, notifOpen: false, highlight: null, pending: {}, toasts: [], briefStream: null };
const uiSubs = new Set();
export const getUI = () => ui;
export function setUI(patch) {
  ui = { ...ui, ...(typeof patch === 'function' ? patch(ui) : patch) };
  uiSubs.forEach((f) => f());
}
export function useUI() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    uiSubs.add(force);
    return () => uiSubs.delete(force);
  }, []);
  return ui;
}
export function toast(text, tone = 'info') {
  const id = uid('t');
  setUI((u) => ({ toasts: [...u.toasts, { id, text, tone }] }));
  setTimeout(() => setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) })), 2800);
}
export const openModal = (modal) => setUI({ modal });
export const closeModal = () => setUI({ modal: null });

// ───────── 파생 값 ─────────
export function windowEnd(h) {
  return addDays(h.moveDate, 7);
}
export function isReadOnly(s, h) {
  return s.today > windowEnd(h);
}
export function canAskPredecessor(s, h) {
  return !!h.firstSubmittedAt && s.today >= h.firstSubmittedAt.slice(0, 10) && s.today <= windowEnd(h);
}
export function isVisibleTo(role, h) {
  if (role === 'giver') return h.status !== 'none';
  return !!h.firstSubmittedAt;
}
export function isEditable(s, h) {
  return s.session.role === 'giver' && (h.status === 'draft' || h.status === 'rejected') && !isReadOnly(s, h);
}
/** 반려 뒤 인계자가 보완하는 동안 인수자·입회자는 마지막으로 입회요청한 내용을 본다 */
export function showsSnapshot(role, h) {
  return role !== 'giver' && h.status === 'rejected' && !!h.attachment?.snapshot;
}
export function viewItems(role, h) {
  return showsSnapshot(role, h) ? h.attachment.snapshot.items : h.items;
}
/** 질문이 달린 항목은 지울 수 없다 (질문 스레드와 알림 바로가기가 사라지지 않게) */
export function hasQuestions(s, pid, itemId) {
  return s.qa.some((q) => q.positionId === pid && q.itemId === itemId);
}

// ───────── 동작 ─────────
export function enter(role, personId, positionId) {
  const person = PERSON[personId];
  setState((s) => {
    s.session = { role, personId, positionId: positionId || person.positionId };
    s.tab = 'current';
  });
  setUI({ modal: null, notifOpen: false, highlight: null });
  window.scrollTo({ top: 0 });
}

export function goHome() {
  setState((s) => { s.session = { role: null, personId: null, positionId: null }; });
  setUI({ modal: null, notifOpen: false, highlight: null });
  window.scrollTo({ top: 0 });
}

export function setTab(tab) {
  setState((s) => { s.tab = tab; });
}

export function setToday(date) {
  setState((s) => { s.today = date; });
}

export function resetAll() {
  const session = state.session;
  state = initialState();
  state.session = session;
  persist();
  setUI({ modal: null, notifOpen: false, highlight: null, pending: {}, briefStream: null });
  subs.forEach((f) => f());
}

function notify(s, n) {
  s.notifications.unshift({ id: uid('n'), at: stamp(s.today), read: false, ...n });
}

const posTitle = (pid) => POSITION[pid].title;

export function saveGenerated(pid, { folders, result, briefing }) {
  setState((s) => {
    const h = s.handovers[pid];
    h.status = 'draft';
    h.selectedFolders = folders;
    h.stats = result.stats;
    h.items = result.items;
    h.ignoredRecs = [];
    h.briefing = briefing;
    h.attachment = null; // 새로 작성한 초안에는 이전 입회요청 첨부가 없다
    h.updatedAt = stamp(s.today);
    h.log.push({ action: '자동 작성', by: personLabel(giverOf(pid)), at: stamp(s.today) });
  });
}

export function setBriefing(pid, briefing) {
  setState((s) => { s.handovers[pid].briefing = briefing; });
}

function touch(s, h, item) {
  h.updatedAt = stamp(s.today);
  if (item && h.status === 'rejected') item.modified = true;
}

export function addItem(pid, item) {
  setState((s) => {
    const h = s.handovers[pid];
    h.items.push(item);
    touch(s, h, item);
  });
}

export function updateItem(pid, itemId, patch) {
  setState((s) => {
    const h = s.handovers[pid];
    const it = h.items.find((i) => i.id === itemId);
    if (!it) return;
    Object.assign(it, patch);
    touch(s, h, it);
  });
}

export function toggleImportant(pid, itemId) {
  setState((s) => {
    const h = s.handovers[pid];
    const it = h.items.find((i) => i.id === itemId);
    if (!it) return;
    it.important = !it.important;
    touch(s, h, it);
  });
}

export function deleteItem(pid, itemId) {
  if (hasQuestions(state, pid, itemId)) return false;
  setState((s) => {
    const h = s.handovers[pid];
    h.items = h.items.filter((i) => i.id !== itemId);
    touch(s, h);
  });
  return true;
}

export function ignoreRec(pid, key) {
  setState((s) => { s.handovers[pid].ignoredRecs.push(key); });
}

export const personLabel = (p) => (p ? `${p.rank} ${p.name}` : '');

/**
 * attachment: 온나라에 첨부한 인계인수서 PDF 정보 { filename, pages, size }
 * PDF 파일(약 2.5MB)은 저장하지 않고, 입회요청 시점의 내용(snapshot)을 저장해 열 때마다 같은 PDF를 다시 만든다.
 */
export function submit(pid, receiver, attachment = null) {
  setState((s) => {
    const h = s.handovers[pid];
    const again = h.status === 'rejected';
    const at = stamp(s.today);
    h.status = 'pending';
    h.receiver = receiver;
    h.submittedAt = at;
    h.attachment = attachment ? {
      ...attachment,
      at,
      snapshot: { items: structuredClone(h.items), briefing: h.briefing ? { ...h.briefing } : null, moveDate: h.moveDate, receiver: { ...receiver }, today: s.today },
    } : null;
    if (!h.firstSubmittedAt) h.firstSubmittedAt = at;
    const verb = again ? '입회 재요청' : '입회요청';
    h.log.push({ action: verb, by: personLabel(giverOf(pid)), reason: `인수자 ${receiver.rank} ${receiver.name} 지정 · 온나라 입회요청${attachment ? ` · 첨부 ${attachment.filename}` : ''}`, at });
    const base = { positionId: pid, type: 'approval', path: `${posTitle(pid)} > 인계서`, author: personLabel(giverOf(pid)) };
    notify(s, {
      ...base,
      toRole: 'reviewer',
      title: `[BATON] ${posTitle(pid)} 인계서 ${verb}이 왔습니다`,
      body: [
        { label: '인수자', text: `${receiver.rank} ${receiver.name}` },
        ...(attachment ? [{ label: '첨부', text: `${attachment.filename} (${attachment.pages}쪽)` }] : []),
      ],
    });
    notify(s, {
      ...base,
      toRole: 'receiver',
      title: again ? `[BATON] ${posTitle(pid)} 인계서가 보완되어 다시 입회요청되었습니다` : `[BATON] ${posTitle(pid)} 인계서를 이제 볼 수 있습니다`,
      body: [
        { label: '입회자', text: personLabel(reviewerOf(pid)) },
        { label: '전임자 질문 가능', text: `~ ${windowEnd(h).replaceAll('-', '.')}` },
      ],
    });
  });
}

export function approve(pid) {
  setState((s) => {
    const h = s.handovers[pid];
    h.status = 'approved';
    const by = personLabel(reviewerOf(pid));
    h.log.push({ action: '입회완료', by, at: stamp(s.today) });
    for (const toRole of ['giver', 'receiver']) {
      notify(s, {
        toRole, positionId: pid, type: 'approval',
        title: `[BATON] ${posTitle(pid)} 인계인수 입회가 완료되었습니다`,
        path: `${posTitle(pid)} > 인계서`, author: by, body: [],
      });
    }
  });
}

export function reject(pid, reason) {
  setState((s) => {
    const h = s.handovers[pid];
    h.status = 'rejected';
    const by = personLabel(reviewerOf(pid));
    h.log.push({ action: '반려', by, reason, at: stamp(s.today) });
    notify(s, {
      toRole: 'giver', positionId: pid, type: 'reject',
      title: `[BATON] ${posTitle(pid)} 인계서가 반려되었습니다`,
      path: `${posTitle(pid)} > 인계서`, author: by,
      body: [{ label: '반려 사유', text: reason }],
    });
    notify(s, {
      toRole: 'receiver', positionId: pid, type: 'reject',
      title: `[BATON] ${posTitle(pid)} 인계서가 반려되어 인계자가 보완 중입니다`,
      path: `${posTitle(pid)} > 인계서`, author: by,
      body: [{ label: '반려 사유', text: reason }, { label: '안내', text: '보완이 끝날 때까지 마지막으로 입회요청된 내용이 보입니다' }],
    });
  });
}

function itemPath(pid, item) {
  return `${posTitle(pid)} > 인계서 > ${CATS[item.category]?.label || '업무'} > ${item.title}`;
}

/** 인수자 질문 등록 (AI 선답변 또는 전임자에게 바로) */
export function addQuestion(pid, itemId, text, direct) {
  const id = uid('q');
  setState((s) => {
    const receiver = receiverOf(pid);
    s.qa.push({ id, positionId: pid, itemId, parentId: null, authorType: 'receiver', authorName: personLabel(receiver), text, at: stamp(s.today), forwarded: !!direct, direct: !!direct });
    if (direct) notifyQuestion(s, pid, itemId, id);
  });
  return id;
}

function notifyQuestion(s, pid, itemId, rootId, note) {
  const h = s.handovers[pid];
  const item = h.items.find((i) => i.id === itemId);
  const root = s.qa.find((q) => q.id === rootId);
  const ai = s.qa.find((q) => q.parentId === rootId && q.authorType === 'ai');
  notify(s, {
    toRole: 'giver', positionId: pid, type: 'question',
    title: `[BATON] ${posTitle(pid)} 인계서 – '${item?.title}'에 새 질문`,
    path: item ? itemPath(pid, item) : posTitle(pid),
    author: root.authorName,
    body: [
      { label: '질문', text: root.text },
      ...(ai ? [{ label: '✦ AI 답변', text: ai.text }] : []),
      ...(note ? [{ label: '전임자에게 추가 질문', text: note }] : []),
    ],
    itemId, qaId: rootId,
  });
}

export function addAIAnswer(rootId, answer) {
  setState((s) => {
    const root = s.qa.find((q) => q.id === rootId);
    if (!root) return;
    s.qa = s.qa.filter((q) => !(q.parentId === rootId && q.authorType === 'ai'));
    s.qa.push({ id: uid('a'), positionId: root.positionId, itemId: root.itemId, parentId: rootId, authorType: 'ai', at: stamp(s.today), ...answer });
  });
}

/** 전임자에게 전달. note: 인수자가 덧붙인 말(추가 질문) — 스레드에 남기고 알림에도 함께 담는다 */
export function forwardQuestion(rootId, note = '') {
  setState((s) => {
    const root = s.qa.find((q) => q.id === rootId);
    if (!root || root.forwarded) return;
    root.forwarded = true;
    const text = note.trim();
    if (text) {
      s.qa.push({ id: uid('r'), positionId: root.positionId, itemId: root.itemId, parentId: rootId, authorType: 'receiver', authorName: root.authorName, text, at: stamp(s.today), toGiver: true });
    }
    notifyQuestion(s, root.positionId, root.itemId, rootId, text);
  });
}

export function addReply(rootId, authorType, text) {
  setState((s) => {
    const root = s.qa.find((q) => q.id === rootId);
    if (!root) return;
    const pid = root.positionId;
    const author = authorType === 'giver' ? giverOf(pid) : receiverOf(pid);
    const id = uid('r');
    s.qa.push({ id, positionId: pid, itemId: root.itemId, parentId: rootId, authorType, authorName: personLabel(author), text, at: stamp(s.today) });
    const item = s.handovers[pid].items.find((i) => i.id === root.itemId);
    notify(s, {
      toRole: authorType === 'giver' ? 'receiver' : 'giver', positionId: pid, type: 'reply',
      title: `[BATON] ${posTitle(pid)} 인계서 – '${item?.title}'에 ${authorType === 'giver' ? '전임자 답글' : '새 답글'}`,
      path: item ? itemPath(pid, item) : posTitle(pid),
      author: personLabel(author),
      body: [{ label: '원래 질문', text: root.text }, { label: '답글', text }],
      itemId: root.itemId, qaId: rootId,
    });
  });
}

export function markRead(id) {
  setState((s) => {
    const n = s.notifications.find((x) => x.id === id);
    if (n) n.read = true;
  });
}
export function markAllRead(role, pid) {
  setState((s) => {
    s.notifications.forEach((n) => { if (n.toRole === role && n.positionId === pid) n.read = true; });
  });
}

export function putCache(key, value) {
  setState((s) => { s.aiCache[key] = value; });
}
