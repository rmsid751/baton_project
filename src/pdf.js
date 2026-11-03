// 인계인수서 PDF — 온나라 상신 첨부용
// html2pdf.js(html2canvas + jsPDF)로 화면 글꼴(Pretendard) 그대로 A4 PDF를 만든다. 라이브러리는 필요할 때만 불러온다.
import { POSITION, giverOf, reviewerOf } from './data/seed.js';
import { CATS, CAT_ORDER, deptRows, onnaraDeptCounts, sortItems } from './engine.js';
import { dot, periodLabel } from './util.js';

const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
let libPromise = null;

function loadLib() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => resolve(window.html2pdf);
      s.onerror = () => { libPromise = null; reject(new Error('PDF 라이브러리를 불러오지 못했습니다')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bold = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

function docTitle(pos, id) {
  const f = pos.files.find((x) => x.id === id);
  if (f) return `${f.name} (${f.date})`;
  const o = pos.onnara.find((x) => x.id === id);
  if (o) return `[온나라] ${o.title} (${o.date})`;
  return null;
}

export function pdfFileName(pid, today) {
  const pos = POSITION[pid];
  const g = giverOf(pid);
  return `${pos.title}_인계인수서_${g.rank}${g.name}_${today.replaceAll('-', '')}.pdf`;
}

/** 인계인수서 본문 HTML (A4 폭 기준, 인라인 스타일). 폭 690px = A4(210mm)에서 좌우 여백 12mm를 뺀 인쇄 폭(약 700px) 안쪽 */
function buildHtml({ pid, handover, receiver, today }) {
  const pos = POSITION[pid];
  const g = giverOf(pid);
  const v = reviewerOf(pid);
  const items = sortItems(handover.items);
  const depts = deptRows(items, onnaraDeptCounts(pos.onnara, g.start, g.end));
  const brief = handover.briefing?.status === 'ok' && handover.briefing.text
    ? handover.briefing.text.split('\n').map((l) => l.trim()).filter(Boolean)
    : [`이 자리는 ${pos.intro}입니다.`];
  const counts = CAT_ORDER.map((c) => `${CATS[c].label} ${items.filter((i) => i.category === c).length}건`).join(' · ');

  const th = 'border:1px solid #9AA3B8;background:#EEF1F7;padding:6px 8px;font-weight:700;text-align:left;';
  const td = 'border:1px solid #9AA3B8;padding:6px 8px;vertical-align:top;';
  const h2 = 'font-size:14pt;font-weight:700;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #14213D;';

  const signBox = (role, name) => `<td style="border:1px solid #9AA3B8;width:78px;text-align:center;padding:0;">
      <div style="border-bottom:1px solid #9AA3B8;padding:4px 0;background:#EEF1F7;font-weight:700;">${role}</div>
      <div style="height:42px;"></div>
      <div style="padding:3px 0;font-size:8.5pt;">${esc(name)}</div></td>`;

  const listRows = items.map((it, i) => `<tr>
      <td style="${td}text-align:center;">${i + 1}</td>
      <td style="${td}white-space:nowrap;">${esc(CATS[it.category]?.label || '')}</td>
      <td style="${td}">${esc(it.title)}${it.important ? ' <b style="color:#4F7BFF;">★</b>' : ''}</td>
      <td style="${td}">${esc(it.period)}</td>
      <td style="${td}">${esc((it.depts || []).join(', ') || '—')}</td></tr>`).join('');

  const detail = items.map((it, i) => {
    const docs = (it.docIds || []).map((id) => docTitle(pos, id)).filter(Boolean).slice(0, 4);
    const hist = (it.histRefs || []).map((r) => `역대 인계서 · ${r.label}`);
    const refs = [...docs, ...hist];
    return `<div class="pdf-item" style="border:1px solid #C9CFDC;border-radius:6px;padding:8px 10px;margin-bottom:8px;page-break-inside:avoid;">
      <div style="font-weight:700;font-size:10.5pt;">${i + 1}. ${esc(it.title)}${it.important ? ' <span style="color:#4F7BFF;">★ 중요</span>' : ''}
        <span style="font-weight:400;color:#3A4664;font-size:9pt;"> | ${esc(CATS[it.category]?.label || '')} · ${esc(it.period)}</span></div>
      <div style="margin-top:4px;">${esc(it.desc)}</div>
      ${it.depts?.length ? `<div style="margin-top:4px;"><b>관계부서</b> ${esc(it.depts.join(', '))}</div>` : ''}
      ${it.memo ? `<div style="margin-top:4px;padding:5px 8px;background:#E6EDFF;border-radius:4px;"><b>인계자 메모</b> ${esc(it.memo)}</div>` : ''}
      ${refs.length ? `<div style="margin-top:4px;color:#3A4664;font-size:8.5pt;"><b>근거</b> ${refs.map(esc).join(' / ')}${(it.docIds || []).length > 4 ? ` 외 ${(it.docIds.length - 4)}건` : ''}</div>` : ''}
    </div>`;
  }).join('');

  const deptTable = depts.length ? `<table style="width:100%;border-collapse:collapse;">
      <tr><th style="${th}">부서</th><th style="${th}">관련 업무</th><th style="${th}text-align:right;">관련 업무 수</th><th style="${th}text-align:right;">문서 수·발신 수</th></tr>
      ${depts.map((d) => `<tr><td style="${td}white-space:nowrap;"><b>${esc(d.name)}</b></td><td style="${td}">${esc(d.tasks.join(', '))}</td>
        <td style="${td}text-align:right;">${d.count}건</td><td style="${td}text-align:right;">${d.docs ? `${d.docs}건` : '—'}</td></tr>`).join('')}
    </table>` : '<p>업무에 적힌 관계부서가 없습니다.</p>';

  return `<div style="font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;color:#14213D;font-size:9.5pt;line-height:1.55;width:690px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;"><tr>
      <td style="vertical-align:bottom;padding:0;">
        <div style="font-size:9pt;color:#3A4664;">${esc(pos.unit)} ${esc(pos.dept)}</div>
        <div style="font-size:22pt;font-weight:800;letter-spacing:0.3em;">인계인수서</div>
      </td>
      <td style="width:240px;padding:0;"><table style="border-collapse:collapse;margin-left:auto;"><tr>
        ${signBox('인계자', `${g.rank} ${g.name}`)}${signBox('인수자', receiver ? `${receiver.rank} ${receiver.name}` : '')}${signBox('결재', `${v.rank} ${v.name}`)}
      </tr></table></td>
    </tr></table>

    <table style="width:100%;border-collapse:collapse;">
      <tr><th style="${th}width:90px;">소속</th><td style="${td}">${esc(pos.unit)} ${esc(pos.dept)}</td><th style="${th}width:90px;">직책</th><td style="${td}">${esc(pos.title)}</td></tr>
      <tr><th style="${th}">인계자</th><td style="${td}">${esc(g.rank)} ${esc(g.name)}</td><th style="${th}">인수자</th><td style="${td}">${receiver ? `${esc(receiver.rank)} ${esc(receiver.name)}` : '—'}</td></tr>
      <tr><th style="${th}">근무기간</th><td style="${td}">${dot(g.start)} ~ ${dot(g.end)} (${periodLabel(g.start, g.end)})</td><th style="${th}">인사이동일</th><td style="${td}">${dot(handover.moveDate)}</td></tr>
      <tr><th style="${th}">결재권자</th><td style="${td}">${esc(v.rank)} ${esc(v.name)} (${esc(v.title)})</td><th style="${th}">작성일</th><td style="${td}">${dot(today)}</td></tr>
      <tr><th style="${th}">업무 현황</th><td style="${td}" colspan="3">총 ${items.length}건 (${counts}) · 중요 ${items.filter((i) => i.important).length}건 · 관계부서 ${depts.length}곳</td></tr>
    </table>

    <div style="${h2}">1. 업무 개요</div>
    ${brief.map((l) => `<p style="margin:0 0 3px;">${bold(l)}</p>`).join('')}
    ${handover.briefing?.status === 'ok' ? '<p style="margin:4px 0 0;color:#6B7590;font-size:8pt;">※ 인계서를 바탕으로 AI가 작성한 요약입니다. 사실과 다를 수 있습니다.</p>' : ''}

    <div style="${h2}">2. 업무 목록</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr><th style="${th}width:30px;text-align:center;">번호</th><th style="${th}width:110px;">구분</th><th style="${th}">업무명</th><th style="${th}width:130px;">시기</th><th style="${th}width:130px;">관계부서</th></tr>
      ${listRows}
    </table>

    <div style="${h2}">3. 업무별 상세</div>
    ${detail}

    <div style="${h2}">4. 관계부서</div>
    ${deptTable}

    <p style="margin-top:16px;color:#6B7590;font-size:8pt;text-align:center;">본 인계인수서는 BATON 인계인수 체계에서 업무 폴더와 온나라 문서 이력을 바탕으로 작성되었습니다.</p>
  </div>`;
}

/**
 * @returns {Promise<{ blob: Blob, url: string, filename: string, pages: number, size: number }>}
 */
export async function makeHandoverPdf({ pid, handover, receiver, today }) {
  const html2pdf = await loadLib();
  const filename = pdfFileName(pid, today);
  const holder = document.createElement('div');
  holder.innerHTML = buildHtml({ pid, handover, receiver, today });
  const opt = {
    margin: [12, 12, 14, 12],
    filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.pdf-item'] },
  };
  const pdf = await html2pdf().set(opt).from(holder.firstElementChild).toPdf().get('pdf');
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`${i} / ${pages}`, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 6, { align: 'center' });
  }
  pdf.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'BATON' });
  const blob = pdf.output('blob');
  return { blob, url: URL.createObjectURL(blob), filename, pages, size: blob.size };
}
