// 규칙 기반 인계서 분석 엔진 (PRD 5.3)
// 분류: 월별·분기별·반기별 루틴 / 연간·특별 이벤트 / 특이사항. 관계부서는 분류가 아니라 업무 항목의 선택 칸이다.
import { countBy, mode, monthsBetween, servedMonthsOfYear, uid } from './util.js';

export const CATS = {
  routine: { label: '월별 루틴', short: '월별', sym: '■' },
  quarterly: { label: '분기별 루틴', short: '분기별', sym: '◔' }, // 화면에서는 CatSym이 원 테두리 + 1/4을 그림
  semiannual: { label: '반기별 루틴', short: '반기별', sym: '◐' }, // 화면에서는 CatSym이 원 테두리 + 1/2을 그림
  event: { label: '연간·특별 이벤트', short: '이벤트', sym: '▲' },
  special: { label: '특이사항', short: '특이사항', sym: '◆' },
};
export const CAT_ORDER = ['routine', 'quarterly', 'semiannual', 'event', 'special'];

export const EXCLUDE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'exe', 'msi', 'zip', 'mp4'];
const SPECIAL_RE = /(장애|사고|복구|감사|지적)/;

export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
export const isExcluded = (name) => EXCLUDE_EXT.includes(extOf(name));

/** 파일명·제목 정규화: 확장자, 번호 접두, 괄호, 날짜, 연·월, 회차, 버전, 숫자 제거 */
export function normalizeTitle(name) {
  let s = String(name);
  s = s.replace(/\.[a-z0-9]{2,4}$/i, '');
  s = s.replace(/^\d+[_.\-\s]+/, '');
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  s = s.replace(/\d{4}\s*년(\s*\d{1,2}\s*월)?(\s*\d{1,2}\s*일)?/g, ' ');
  s = s.replace(/\d{2,4}[.\-]\d{1,2}([.\-]\d{1,2})?/g, ' ');
  s = s.replace(/\d{1,2}\s*월/g, ' ');
  s = s.replace(/제?\s*\d+\s*(차|회|호|분기)/g, ' ');
  s = s.replace(/_?v\d+\b|최종|수정본|수정|초안/gi, ' ');
  s = s.replace(/\d+/g, ' ');
  s = s.replace(/_/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function docType(name) {
  if (/계획/.test(name)) return '계획';
  if (/요구서|소요 제기|신청|협조/.test(name)) return '기안';
  if (/보고|결과|사유서|소명/.test(name)) return '보고';
  if (/점검표|일지|대장|명부|로그/.test(name)) return '점검표';
  if (/회의/.test(name)) return '회의자료';
  if (/\.xlsx?$/.test(name)) return '현황표';
  if (/\.pptx?$/.test(name)) return '발표자료';
  return '문서';
}

export function weekLabel(day) {
  if (day <= 7) return '첫째 주';
  if (day <= 14) return '둘째 주';
  if (day <= 21) return '셋째 주';
  if (day <= 28) return '넷째 주';
  return '마지막 주';
}

// 원형(12개월) 간격: 12월→1월은 1개월
const gaps = (months) => months.map((m, i) => ((months[(i + 1) % months.length] - m + 12) % 12) || 12);

/** 분기별: 1년에 4번, 서로 약 3개월 간격 (예: 1·4·7·10월) */
export const isQuarterly = (months) => months.length === 4 && gaps(months).every((g) => g >= 2 && g <= 4);
/** 반기별: 1년에 2번, 서로 약 6개월 간격 (예: 1·7월, 3·9월) */
export const isSemiannual = (months) => months.length === 2 && Math.min(...gaps(months)) >= 5;

/**
 * 등장한 달로 분류를 정한다 (특이사항 여부는 따로 판단)
 * ratio: 근무기간 중 등장한 달의 비율, moy: 등장한 달(1~12)
 */
export function classify({ special, ratio, moy }) {
  if (special) return 'special';
  if (ratio >= 0.8) return 'routine';
  if (isQuarterly(moy)) return 'quarterly';
  if (isSemiannual(moy)) return 'semiannual';
  return 'event';
}

export function periodText(category, months, week) {
  if (category === 'routine') return week ? `매월 ${week}` : '매월';
  if (!months.length) return '수시';
  const list = `${months.join('·')}월`;
  if (category === 'quarterly') return `분기별 (${list})`;
  if (category === 'semiannual') return `반기별 (${list})`;
  return list;
}

/** 특이사항 시기: 한 번 있었던 일이라 연·월로 적는다 (예: 2026년 2월) */
export function specialPeriod(...dates) {
  const yms = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  return yms.map((ym) => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`).join(', ');
}

const catOrderIndex = (c) => CAT_ORDER.indexOf(c);
export function sortItems(items) {
  return [...items].sort((a, b) => {
    const c = catOrderIndex(a.category) - catOrderIndex(b.category);
    if (c) return c;
    if (a.category !== 'routine') {
      const m = (a.months[0] || 13) - (b.months[0] || 13);
      if (m) return m;
    }
    return 0;
  });
}

/**
 * 역대 인계서에 같은 업무가 없을 때의 임시 설명.
 * 자동 작성 단계에서 AI가 모든 항목의 설명을 다시 쓴다(descAuto): 이번 근거 문서 + (있으면) 이전 담당자 설명.
 * AI를 못 부르면 이전 담당자 설명, 그것도 없으면 이 문장이 남는다. 근거 통계는 카드의 근거 문서 줄에 따로 보여 준다.
 */
function describe(category, period) {
  if (category === 'special') return `${period}에 있었던 특이사항입니다.`;
  if (category === 'event') return `${period}에 처리하는 업무입니다.`;
  return `${period}에 반복하는 업무입니다.`;
}

/** 역대 인계서(최근 담당자부터)에서 같은 업무의 설명을 찾는다 */
function inheritedDesc(history, key) {
  for (const h of history) {
    const it = h.items.find((x) => x.key === key && x.desc);
    if (it) return { desc: it.desc, from: `${h.person.rank} ${h.person.name}` };
  }
  return null;
}

/**
 * 선택한 업무 폴더의 파일 + 근무기간 내 온나라 문서를 분석해 인계서 항목을 만든다.
 * 관계부서는 온나라 문서의 협조·수신 부서로 미리 채운다 (인계자가 고칠 수 있음).
 * 설명은 역대 인계서(history, 최근 담당자부터)에 같은 업무가 있으면 그 설명을 이어받는다.
 */
export function analyze({ files, onnara, folderIdxs, start, end, history = [] }) {
  const selected = files.filter((f) => folderIdxs.includes(f.folder));
  const excluded = selected.filter((f) => isExcluded(f.name));
  const included = selected.filter((f) => !isExcluded(f.name));
  const linked = onnara.filter((d) => d.date >= start && d.date <= end);
  const totalMonths = monthsBetween(start, end);
  const served = servedMonthsOfYear(start, end);

  // 업무키로 묶기: 같은 하위 폴더(=정규화한 폴더명) + 온나라 업무키
  const groups = new Map();
  const add = (key, title, doc, fromFolder) => {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, title, docs: [] });
    const g = groups.get(key);
    g.docs.push(doc);
    if (fromFolder) g.title = title;
  };
  for (const f of included) {
    const leaf = f.path[f.path.length - 1];
    add(normalizeTitle(leaf), leaf.replace(/^\d+[_.\-\s]*/, ''), { ...f, src: 'folder', type: docType(f.name) }, true);
  }
  for (const d of linked) add(normalizeTitle(d.workKey), d.workKey, { ...d, src: 'onnara' }, false);

  const items = [];
  for (const g of groups.values()) {
    const ymSet = new Set(g.docs.map((d) => d.date.slice(0, 7)));
    const moy = [...new Set(g.docs.map((d) => +d.date.slice(5, 7)))].sort((a, b) => a - b);
    const special = g.docs.some((d) => SPECIAL_RE.test(d.name || d.title) || (d.tags || []).includes('특이'));
    const category = classify({ special, ratio: ymSet.size / totalMonths, moy });
    const months = category === 'routine' ? [...served].sort((a, b) => a - b) : moy;
    const week = category === 'routine' ? mode(g.docs.map((d) => weekLabel(+d.date.slice(8, 10)))) : null;
    const period = category === 'special' ? specialPeriod(...g.docs.map((d) => d.date)) : periodText(category, months, week);
    const inherited = inheritedDesc(history, g.key);
    items.push({
      id: uid('it'),
      key: g.key,
      category,
      title: g.title,
      months,
      period,
      desc: inherited ? inherited.desc : describe(category, period),
      descAuto: true, // 자동 작성 단계에서 AI가 다시 쓴다 (끝나면 지움)
      descRef: inherited, // AI에게 줄 이전 담당자 설명 { desc, from } (끝나면 지움)
      depts: [...new Set(g.docs.flatMap((d) => d.coop || []))],
      docIds: [...g.docs].sort((a, b) => (a.date < b.date ? 1 : -1)).map((d) => d.id),
      important: false,
      memo: '',
      source: 'auto',
      modified: false,
    });
  }

  const sorted = sortItems(items);
  return {
    items: sorted,
    stats: {
      fileCount: selected.length,
      excludedCount: excluded.length,
      analyzedFiles: included.length,
      onnaraCount: linked.length,
      docTotal: included.length + linked.length,
      keyCount: groups.size,
      deptCount: deptRows(sorted).length,
    },
  };
}

/** 역대 인계서 대비 누락 업무 추천 (PRD 5.3-8, 9) */
export function recommend({ history, items, ignored, start, end }) {
  const N = history.length;
  if (!N) return [];
  const served = servedMonthsOfYear(start, end);
  const current = new Set(items.map((i) => i.key));
  const map = new Map();
  history.forEach((h) => {
    for (const it of h.items) {
      if (!map.has(it.key)) map.set(it.key, { key: it.key, count: 0, sample: it, holders: [] });
      const e = map.get(it.key);
      e.count += 1;
      e.holders.push(h);
    }
  });
  const recs = [];
  for (const e of map.values()) {
    if (current.has(e.key) || ignored.includes(e.key)) continue;
    const base = {
      key: e.key,
      title: e.sample.title,
      category: e.sample.category,
      months: e.sample.months,
      period: e.sample.period,
      desc: e.sample.desc,
      depts: e.sample.depts || [],
      count: e.count,
      total: N,
      holders: e.holders.map((h) => ({ id: h.id, label: `${h.person.rank} ${h.person.name} (${h.periodLabel})` })),
    };
    if (e.count / N >= 0.5) recs.push({ ...base, type: 'missing' });
    else if (served.size < 12 && e.sample.months.some((m) => !served.has(m))) recs.push({ ...base, type: 'expected' });
  }
  return recs.sort((a, b) => b.count - a.count || (a.months[0] || 13) - (b.months[0] || 13));
}

export function itemFromRec(rec) {
  return {
    id: uid('it'),
    key: rec.key,
    category: rec.category,
    title: rec.title,
    months: rec.months,
    period: rec.period,
    desc: rec.desc,
    depts: [...rec.depts],
    docIds: [],
    histRefs: rec.holders,
    important: false,
    memo: '',
    source: 'rec',
    modified: false,
  };
}

const emptyMonth = () => Object.fromEntries(CAT_ORDER.map((c) => [c, 0]));

/** 월별 업무량: 각 달에 수행하는 항목 수 (분류별) */
export function monthly(items) {
  const out = Array.from({ length: 12 }, emptyMonth);
  for (const it of items) {
    if (!CATS[it.category]) continue;
    for (const m of it.months) if (m >= 1 && m <= 12) out[m - 1][it.category] += 1;
  }
  return out;
}
export const monthTotal = (o) => CAT_ORDER.reduce((s, c) => s + (o[c] || 0), 0);

/** 온나라 문서 수·발신 수: 기간 안 온나라 문서 중 그 부서가 협조·수신으로 들어간 문서 수 */
export function onnaraDeptCounts(onnara, start, end) {
  const out = {};
  for (const d of onnara) {
    if (d.date < start || d.date > end) continue;
    for (const c of d.coop || []) out[c] = (out[c] || 0) + 1;
  }
  return out;
}

/**
 * 관계부서 표: 업무 항목에 적힌 부서별 관련 업무 수 + 온나라 문서 수·발신 수
 * docCounts: { 부서명: 문서 수 } (없으면 0)
 */
export function deptRows(items, docCounts = {}) {
  const map = new Map();
  for (const it of items) {
    for (const d of it.depts || []) {
      if (!map.has(d)) map.set(d, { name: d, count: 0, docs: docCounts[d] || 0, tasks: [], itemId: it.id });
      const e = map.get(d);
      e.count += 1;
      e.tasks.push(it.title);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.docs - a.docs || a.name.localeCompare(b.name));
}

export function personStats(items) {
  const by = countBy(items.map((i) => i.category));
  const mon = monthly(items);
  let busy = 0;
  mon.forEach((o, i) => { if (monthTotal(o) > monthTotal(mon[busy])) busy = i; });
  return {
    total: items.length,
    byCat: Object.fromEntries(CAT_ORDER.map((c) => [c, by.get(c) || 0])),
    important: items.filter((i) => i.important).length,
    busyMonth: busy + 1,
    busyCount: monthTotal(mon[busy]),
    depts: deptRows(items).length,
    monthly: mon,
  };
}

/**
 * 전체 합산: handovers = [{ id, person, periodLabel, start, end, items, qa, approvedAt, docCounts }]
 */
export function aggregate(handovers) {
  const H = handovers.length || 1;
  const rows = new Map();
  handovers.forEach((h) => {
    for (const it of h.items) {
      if (!rows.has(it.key)) {
        rows.set(it.key, { key: it.key, title: it.title, cats: [], holders: 0, monthHits: Array(12).fill(0), sample: it, holderList: [], depts: new Set() });
      }
      const r = rows.get(it.key);
      r.cats.push(it.category);
      r.holders += 1;
      r.holderList.push(`${h.person.rank} ${h.person.name}`);
      (it.depts || []).forEach((d) => r.depts.add(d));
      for (const m of it.months) r.monthHits[m - 1] += 1;
    }
  });
  const list = [...rows.values()].map((r) => ({
    key: r.key,
    id: `agg-${r.key}`,
    title: r.title,
    category: mode(r.cats),
    holders: r.holders,
    ratio: r.holders / H,
    monthRatio: r.monthHits.map((n) => n / H),
    months: r.monthHits.map((n, i) => (n ? i + 1 : 0)).filter(Boolean),
    period: r.sample.period,
    desc: r.sample.desc,
    depts: [...r.depts],
    holderList: r.holderList,
  }));
  const sorted = sortItems(list);

  // 월별 평균
  const monthlyAvg = Array.from({ length: 12 }, emptyMonth);
  handovers.forEach((h) => {
    monthly(h.items).forEach((o, i) => {
      for (const c of CAT_ORDER) monthlyAvg[i][c] += o[c] / H;
    });
  });
  let busy = 0;
  monthlyAvg.forEach((o, i) => { if (monthTotal(o) > monthTotal(monthlyAvg[busy])) busy = i; });

  // 소통 통계
  let questions = 0;
  let forwarded = 0;
  let giverAnswers = 0;
  handovers.forEach((h) => {
    for (const q of h.qa || []) {
      if (!q.parentId && q.authorType === 'receiver') {
        questions += 1;
        if (q.forwarded) forwarded += 1;
      }
      if (q.authorType === 'giver') giverAnswers += 1;
    }
  });

  const avgMonths = handovers.reduce((s, h) => s + monthsBetween(h.start, h.end), 0) / H;

  return {
    rows: sorted,
    monthly: monthlyAvg,
    busyMonth: busy + 1,
    busyAvg: monthTotal(monthlyAvg[busy]),
    // 역대 합산 관계부서: 그 부서가 적힌 업무(업무키) 수 + 담당자별 온나라 문서 수·발신 수의 합
    depts: deptRows(sorted, handovers.reduce((acc, h) => {
      for (const [k, v] of Object.entries(h.docCounts || {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {})),
    people: handovers.length,
    avgMonths,
    core: sorted.filter((r) => r.ratio >= 0.75).length,
    questions,
    aiRate: questions ? Math.round(((questions - forwarded) / questions) * 100) : 0,
    giverAnswers,
  };
}
