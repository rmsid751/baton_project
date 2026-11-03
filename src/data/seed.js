// 더미 데이터 (모두 가상) — 업무 폴더 파일 목록, 온나라 문서 이력, 인사정보, 역대 인계서
// 리셋할 때마다 같은 결과가 나오도록 결정적으로 생성한다.
import { CATS, aggregate, classify, deptRows, docType, isExcluded, normalizeTitle, periodText, sortItems, specialPeriod, weekLabel } from '../engine.js';
import { addDays, monthsBetween, pad, periodLabel, rng, servedMonthsOfYear } from '../util.js';
import { BAKED } from './baked-ai.js';

export const MOVE_DATE = '2026-12-28';
export const DEFAULT_TODAY = '2026-12-21';
/** 업무 폴더·온나라 문서는 시연 기본 날짜(12-21) 전까지만 있다 */
const DOC_CUTOFF = '2026-12-18';

/*
 * 업무 정의 T(이름, 폴더번호(-1: 온나라만), 상위 하위폴더, 시기('all' 또는 월 목록), 옵션)
 *  files: 발생 1회당 만들어지는 파일명 틀   on: 발생 1회당 온나라 문서 제목 틀
 *  coop: 온나라 협조·수신 부서   hist: 역대 담당자 [직전, 전전, 전전전] 수행 여부
 *  cur:false → 이번 담당자 자료에 일부러 빠뜨린 업무 (빠진 업무 추천용, files/on은 역대 인계서 근거로만 쓴다)
 *  yr: 'even'|'odd' → 2년 주기(짝수·홀수 해만)   skip: 루틴에서 문서가 없는 달
 *  imp: 역대 중요 표시   h: 역대 인계서 설명
 *  hv: 역대 담당자별 [직전, 전전, 전전전] 설명 덧붙임   hm: 역대 담당자별 인계자 메모
 *  틀 토큰: {Y} {Y1}(다음해) {Yp}(전년) {Y4} {M} {MM} {DD} {H}(상/하반기) {Q}(분기)
 *
 * 같은 달에 하는 연간·분기·반기 업무는 근무기간이 1년 6개월·2년이어도 가장 최근 한 번만 문서를 만든다.
 * 매월 루틴은 근무기간의 달마다 만든다.
 */
const T = (n, f, dir, m, o = {}) => ({ n, f, dir, m, d: 10, files: [], on: null, coop: [], hist: [1, 1, 1], cur: true, hv: [], hm: [], ...o });

/*
 * 특이사항 I(누가 'cur'|0|1|2, 이름, 폴더번호, 하위폴더, 날짜, 옵션)
 *  한 번만 있었던 일이라 담당자마다 서로 다른 사건을 둔다. cur 의 폴더번호·하위폴더는 현재 업무 폴더 위치.
 */
const I = (who, n, f, dir, date, o = {}) => ({ who, n, f, dir, date, files: [], on: null, coop: [], ...o });

const CYBER_H = '매월 셋째 주 사이버보안 진단의 날에 부서 PC 보안 점검을 시행하고 결과를 취합해 보고한다. 미조치 PC는 다음 달 점검 전까지 재점검한다.';

const POSITION_DEFS = [
  {
    id: 'p1',
    unit: '제99전투비행단',
    dept: '정보통신대대',
    title: '정보통신장교',
    intro: '기지 전화·PC·네트워크 등 정보통신 장비와 통신망을 운용하고, 회의·행사·연습의 통신을 지원하는 자리',
    giver: { id: 'g1', rank: '대위', name: '이준호', start: '2026-01-05', end: MOVE_DATE },
    receiver: { id: 'r1', rank: '대위', name: '김도윤' },
    reviewer: { id: 'v1', rank: '중령', name: '강태현', title: '정보통신대대장' },
    candidates: [
      { rank: '대위', name: '김도윤', note: '정보통신장교 인수 예정' },
    ],
    prev: [
      { rank: '대위', name: '박성민', start: '2024-07-01', end: '2025-12-31' },
      { rank: '대위', name: '최우진', start: '2023-07-03', end: '2024-06-28' },
      { rank: '대위', name: '송민재', start: '2021-07-05', end: '2023-06-30' },
    ],
    folders: ['PC·전화 등 통신장비 지원', '통신망·선로 관리', '회의·행사·연습 통신 지원'],
    excluded: [
      [0, ['04_현장 사진'], ['장비 교체 현장 사진_01.jpg', '장비 교체 현장 사진_02.jpg', '장비 교체 현장 사진_03.jpg'], '2026-12-10'],
      [0, ['02_장비 관리'], ['프린터 드라이버 설치파일.exe'], '2026-01-08'],
      [1, ['02_선로 관리'], ['선로 점검 사진_01.jpg', '선로 점검 사진_02.jpg'], '2026-06-11'],
      [2, ['03_행사 지원'], ['기념일 행사 사진_01.jpg', '기념일 행사 사진_02.jpg'], '2026-10-02'],
    ],
    tasks: [
      T('사이버보안 진단의 날 점검', 0, '01_정기 보고', 'all', { d: 17, files: ['{Y}년 {M}월 사이버보안 진단의 날 점검표.hwp'], on: ['{Y}년 {M}월 사이버보안 진단의 날 점검 결과 보고'], coop: ['작전과'], h: CYBER_H,
        hv: [null, '2024년 상반기부터 점검 결과를 엑셀 대신 한글 점검표로 제출한다.', null], hm: [null, null, '점검 전날 부서별 보안 담당자에게 한 번 더 알릴 것'] }),
      T('정보통신장비 운용·정비 현황 보고', 0, '01_정기 보고', 'all', { d: 4, files: ['{Y}.{MM} 정보통신장비 운용현황.xlsx'], on: ['{Y}년 {M}월 정보통신장비 운용·정비 현황 보고'], coop: ['보급대대'], h: '매월 초 전화기·PC·프린터 등 장비 보유·고장·정비 현황을 집계해 보고한다. 보급대대 장비 대장과 수량을 대조한다.',
        hv: ['2025년부터 보급대대 장비 대장이 전산으로 바뀌어 대조가 빨라졌다.', null, null] }),
      T('차년도 장비 소요 제기', 0, '02_장비 관리', [10], { d: 12, files: ['{Y1}년 정보통신장비 소요 제기(안).hwp', '{Y1}년 정보통신장비 소요 제기(수정).hwp', '{Y1}년 정보통신장비 소요 제기(최종).hwp'], on: ['{Y1}년도 정보통신장비 소요 제기'], coop: ['재정과', '보급대대'], imp: 1, h: '10월에 차년도 PC·전화기·네트워크 장비 소요를 부서별로 받아 재정과에 제기한다. 노후 장비 목록을 근거로 붙인다.',
        hm: ['부서 의견 취합에 2주가 걸리니 9월 말에 미리 공지할 것', null, '재정과 제출 양식이 자주 바뀌니 전년도 파일을 그대로 쓰지 말 것'] }),
      T('노후 장비 교체', 0, '02_장비 관리', [12], { d: 8, files: ['{Y}년 노후 PC 교체 대상 목록.xlsx', '{Y}년 노후 PC 교체 결과.hwp', '노후 장비 반납 확인서_{Y}{MM}{DD}.pdf'], hist: [1, 0, 1], h: '연말에 확보한 예산으로 노후 PC·전화기를 교체하고 반납 장비를 보급대대에 넘긴다.',
        hv: ['2024년에는 PC 40대, 2025년에는 전화기 25대를 바꿨다.', null, '2022년에는 예산이 모자라 교체 대상의 절반만 바꿨다.'] }),
      T('부대 전화번호부 정비', 0, '02_장비 관리', [3, 9], { d: 10, files: ['{Y}년 {M}월 부대 전화번호부.xlsx', '전화번호부 변경 요청 취합_{Y}{MM}.xlsx'], hist: [1, 1, 0], h: '3월·9월 인사이동 뒤 부서별 전화번호 변경을 받아 전화번호부를 다시 배포한다.' }),
      T('네트워크 운용 상태 점검', 1, '01_망 운용', 'all', { d: 24, files: ['{Y}{MM} 국방망·인터넷망 운용 점검 결과.hwp'], on: ['{Y}년 {M}월 네트워크(국방망·인터넷망) 운용 상태 점검 결과 보고'], coop: ['작전과'], h: '매월 넷째 주 국방망·인터넷망 회선 상태와 장애 건수를 점검해 보고한다.',
        hv: [null, null, '2022년까지는 인터넷망 점검 결과를 따로 보고했고, 2023년부터 한 보고서로 합쳤다.'] }),
      T('통신보안 분기 측정', 1, '01_망 운용', [1, 4, 7, 10], { d: 20, files: ['{Y}년 {Q}분기 통신보안 측정 결과.hwp'], h: '분기 첫 달에 유선·무선 통신보안 측정을 받고 결과와 조치 사항을 정리한다.' }),
      T('정보통신 기반시설 정밀 진단', 1, '01_망 운용', [9], { d: 15, yr: 'even', files: ['{Y}년 정보통신 기반시설 정밀 진단 계획.hwp', '{Y}년 정보통신 기반시설 정밀 진단 결과.hwp'], on: ['{Y}년 정보통신 기반시설 정밀 진단 결과 보고'], coop: ['작전과'], h: '짝수 해 9월에 2년 주기로 국방망·교환기·선로 전 구간 정밀 진단을 받고 결과를 보고한다.' }),
      T('교환기·광케이블 선로 정기 점검', 1, '02_선로 관리', 'all', { d: 10, files: ['선로 점검표_{Y}{MM}.xlsx'], imp: 1, h: '매월 둘째 주 교환기 상태와 광케이블·유선 선로 구간을 점검하고 점검표를 남긴다.',
        hm: ['시설대대 굴착 공사 일정은 매월 초에 먼저 받아 둘 것', '맨홀 점검은 통신반 부사관과 2인 1조로 나갈 것', null] }),
      T('장마철 대비 광케이블 선로 점검', 1, '02_선로 관리', [6], { d: 9, files: ['{Y}년 장마철 대비 선로 점검 계획.hwp', '{Y}년 장마철 선로 점검 결과.hwp', '맨홀 배수 점검표_{Y}{MM}.xlsx'], on: ['{Y}년 장마철 대비 광케이블 선로 점검 결과 보고'], coop: ['시설대대'], h: '6월 장마 전에 맨홀 배수와 광케이블 접속함 방수 상태를 시설대대와 함께 점검한다.',
        hv: [null, '2024년 점검 때 3번 맨홀 배수 펌프가 고장 나 예비 펌프를 확보해 두었다.', null] }),
      T('굴착 공사 선로 협조', 1, '02_선로 관리', [4, 8], { d: 15, files: ['{Y}{MM}{DD} 굴착공사 선로 위치 확인 회의록.hwp'], hist: [0, 1, 1], h: '시설대대 굴착 공사 전에 선로 매설 위치를 현장에서 함께 확인한다.',
        hv: [null, null, '2022년 굴착 때 선로 위치도와 실제 매설 위치가 달라 위치도를 고쳤다.'] }),
      T('지휘관 회의 브리핑 장비 지원', 2, '01_회의 지원', 'all', { d: 7, files: ['{Y}.{MM} 지휘관회의 브리핑 장비 점검표.hwp'], h: '매월 첫 주 지휘관 회의 전날 음향·빔프로젝터·영상회의 장비를 점검하고 당일 현장을 지원한다.' }),
      T('영상회의 장비 점검', 2, '01_회의 지원', 'all', { d: 12, skip: [8], files: ['영상회의 장비 점검표_{Y}{MM}.xlsx'], hist: [1, 1, 0], h: '영상회의실 코덱·카메라·마이크 상태를 매월 점검한다.' }),
      T('자유의 방패(FS) 연습 통신 지원', 2, '02_연습 지원', [3], { d: 3, files: ['{Y}년 FS 연습 통신지원 계획.hwp', '{Y}년 FS 연습 회선 구성도.pptx', '{Y}년 FS 연습 통신지원 결과.hwp'], on: ['{Y}년 자유의 방패(FS) 연습 통신지원 계획', '{Y}년 자유의 방패(FS) 연습 통신지원 결과 보고'], coop: ['작전과'], imp: 1, h: '3월 FS 연습 기간에 지휘통제실 임시 회선과 전화를 개통하고 연습 후 철거한다. 작전과 연습 통제 계획을 먼저 받는다.',
        hm: [null, '작전과 연습 통제 계획이 늦게 나오니 2월 중순에 먼저 요청할 것', null] }),
      T('을지 자유의 방패(UFS) 연습 통신 지원', 2, '02_연습 지원', [8], { d: 4, files: ['{Y}년 UFS 연습 통신지원 계획(안).hwp', '{Y}년 UFS 연습 통신지원 계획(최종).hwp', '{Y}년 UFS 연습 회선 구성도.pptx', '{Y}년 UFS 연습 통신지원 결과 및 교훈.hwp'], on: ['{Y}년 을지 자유의 방패(UFS) 연습 통신지원 계획', '{Y}년 UFS 연습 임시 회선 구성 협조', '{Y}년 을지 자유의 방패(UFS) 연습 통신지원 결과 보고'], coop: ['작전과', '시설대대'], imp: 1, h: '8월 UFS 연습에 맞춰 7월 말까지 통신지원 계획을 세우고 작전과·시설대대와 임시 회선 구성을 협조한다. 결과 보고에 교훈을 정리한다.',
        hm: ['계획은 전년도 최종본과 결과 및 교훈 문서를 함께 보고 고칠 것', null, '임시 회선 철거는 연습 종료 다음 날 오전까지 끝낼 것'] }),
      T('부대 기념일 행사 음향·영상 지원', 2, '03_행사 지원', [10], { d: 1, files: ['{Y}년 부대 기념일 행사 음향·영상 지원 계획.hwp', '{Y}년 부대 기념일 행사 장비 배치도.pptx', '행사 리허설 점검표_{Y}{MM}.xlsx'], on: ['{Y}년 부대 기념일 행사 통신·음향 지원 계획'], coop: ['기획처'], h: '10월 부대 기념일 행사의 음향·영상 장비를 배치하고 리허설부터 지원한다.',
        hv: ['2025년부터 행사장이 강당에서 연병장으로 바뀌어 무선 마이크가 더 필요하다.', null, null] }),
      T('지휘관 이·취임식 통신 지원', 2, '03_행사 지원', [6], { d: 20, files: ['{Y}{MM}{DD} 지휘관 이·취임식 음향 지원 계획.hwp', '이·취임식 장비 점검표_{Y}{MM}.xlsx', '이·취임식 중계 회선 신청_{Y}{MM}.hwp'], hist: [0, 1, 1], h: '지휘관 이·취임식 음향과 중계 회선을 지원한다.' }),
      T('동절기 대비 통신 선로 점검', -1, '', [12], { cur: false, d: 5, files: ['{Y}년 동절기 대비 통신 선로 점검표.xlsx'], on: ['{Y}년 동절기 대비 통신 선로 점검 결과 보고'], coop: ['시설대대'], h: '12월 한파 전에 옥외 선로·접속함 보온 상태와 교환기실 난방을 점검한다.' }),
      T('정보통신장비 재물조사', -1, '', [6, 12], { cur: false, d: 16, files: ['{Y}년 {H} 정보통신장비 재물조사 결과.xlsx'], on: ['{Y}년 {H} 정보통신장비 재물조사 결과 보고'], coop: ['보급대대'], hist: [1, 1, 0], h: '6월·12월에 정보통신장비 재물조사로 장비 대장과 실물을 맞춘다.' }),
    ],
    incidents: [
      I('cur', '교환기 장애 조치', 1, '03_장애 복구', '2026-02-06', { files: ['{Y}{MM}{DD} 교환기 장애 조치 기록.hwp', '교환기 장애 로그_{Y}{MM}{DD}.txt'], h: '교환기 카드 고장으로 일부 내선이 끊겨 예비 카드로 교체했다. 예비 카드는 교환기실 보관함에 있다.' }),
      I('cur', '사용자 PC 장애 조치', 0, '03_장애 조치', '2026-05-14', { files: ['{Y}{MM}{DD} 사용자 PC 랜섬웨어 의심 장애 조치 결과.hwp', '{Y}{MM}{DD} PC 장애 조치 경과 메모.txt'], h: '랜섬웨어 의심 PC 장애가 있어 망에서 분리한 뒤 재설치로 복구했다. 같은 증상이면 즉시 망에서 분리한다.' }),
      I('cur', '광케이블 단선 복구', 1, '03_장애 복구', '2026-07-20', { files: ['{Y}{MM}{DD} 광케이블 단선 장애 복구 결과.hwp', '광케이블 단선 구간 위치도_{Y}{MM}.pptx', '단선 복구 업체 작업 확인서_{Y}{MM}{DD}.pdf'], on: ['광케이블 단선 장애 복구 결과 보고'], coop: ['시설대대'], h: '활주로 인근 공사 중 광케이블이 끊겨 임시 회선으로 우회한 뒤 복구했다.' }),
      I('cur', '행사 중 음향 장애 조치', 2, '03_행사 지원', '2026-10-02', { files: ['{Y}{MM}{DD} 기념일 행사 음향 장애 조치 경과.hwp'], h: '행사 중 무선 마이크 간섭으로 음향 장애가 있어 예비 유선 마이크로 바꿨다.' }),
      I(0, '낙뢰로 인한 회선 장애 복구', 1, '03_장애 복구', '2025-08-12', { files: ['{Y}{MM}{DD} 낙뢰 회선 장애 복구 결과.hwp'], on: ['낙뢰 피해 통신 회선 복구 결과 보고'], coop: ['시설대대'], imp: 1, h: '낙뢰로 정문 초소 구간 회선 보호기가 타서 교체했다. 여름철에는 보호기 예비품을 2개 이상 둔다.' }),
      I(0, '국방망 스위치 장애 조치', 1, '03_장애 복구', '2024-11-19', { files: ['{Y}{MM}{DD} 국방망 스위치 장애 조치 기록.hwp'], h: '스위치 펌웨어 오류로 2개 동의 국방망 접속이 끊겨 예비 스위치로 바꾸고 펌웨어를 올렸다.' }),
      I(1, '정전 시 교환기 UPS 방전 장애 조치', 1, '03_장애 복구', '2024-02-15', { files: ['{Y}{MM}{DD} 교환기 UPS 방전 장애 조치 결과.hwp'], coop: ['시설대대'], h: '정전 뒤 교환기 UPS가 30분 만에 방전돼 내선이 끊겼다. UPS 배터리를 교체하고 시설대대 비상 발전기와 연동했다.' }),
      I(1, '통신보안 측정 지적사항 조치', 1, '01_망 운용', '2023-10-25', { files: ['{Y}{MM}{DD} 통신보안 측정 지적사항 조치 결과.hwp'], on: ['통신보안 측정 지적사항 조치 결과 보고'], coop: ['작전과'], h: '무선 공유기 무단 설치가 적발되어 철거하고 부서별로 보안 서약서를 다시 받았다.' }),
      I(2, '영상회의 코덱 고장 조치', 2, '01_회의 지원', '2022-03-08', { files: ['{Y}{MM}{DD} 영상회의 코덱 고장 조치 경과.hwp'], h: '지휘관 영상회의 직전 코덱이 고장 나 노트북 회의로 대신했다. 이후 예비 코덱을 확보했다.' }),
      I(2, '태풍 피해 옥외 선로 복구', 1, '03_장애 복구', '2022-09-07', { files: ['{Y}{MM}{DD} 태풍 피해 선로 복구 결과.hwp'], on: ['태풍 피해 옥외 통신 선로 복구 결과 보고'], coop: ['시설대대'], h: '태풍으로 옥외 가공 선로 2구간이 끊겨 시설대대와 함께 복구했다.' }),
    ],
    qa: [
      { h: 0, t: '을지 자유의 방패(UFS) 연습 통신 지원', q: '작년 UFS 때 임시 회선은 몇 회선 정도 개통하셨나요?', ai: '회선 구성은 근거 문서인 **UFS 연습 회선 구성도**에 있습니다. 다만 개통한 회선 수는 인계서 본문에 없어 전임자 답변이 필요합니다.', found: true, g: '지휘통제실 12회선, 예비 4회선이었습니다. 연습 2주 전까지 작전과에서 좌석 배치도를 받아야 회선 수가 확정됩니다.' },
      { h: 0, t: '교환기·광케이블 선로 정기 점검', q: '선로 점검은 혼자 나가도 되나요?', ai: '인계서에서 근거를 찾지 못했습니다. 점검 인원에 대한 내용은 인계서에 없어 전임자 답변이 필요합니다.', found: false, g: '맨홀 작업은 2인 1조가 원칙입니다. 통신반 부사관 1명과 같이 나가고, 들어가기 전에 산소 농도를 꼭 잽니다.' },
      { h: 0, t: '차년도 장비 소요 제기', q: '장비 소요 제기는 언제부터 준비하면 되나요?', ai: '**차년도 장비 소요 제기**는 **10월**에 재정과에 제기합니다. 인계자 메모에 따르면 부서 의견 취합에 2주가 걸리니 **9월 말에 미리 공지**해야 합니다.', found: true },
      { h: 1, t: '사이버보안 진단의 날 점검', q: '미조치 PC가 계속 남으면 어떻게 처리하셨나요?', ai: '인계서 기준으로 미조치 PC는 **다음 달 점검 전까지 재점검**합니다. 계속 남는 경우의 처리 방법은 인계서에 없습니다.', found: true, g: '두 달 연속 미조치면 해당 부서장에게 공문으로 알렸습니다. 대부분 백신 업데이트를 안 한 경우라 현장에서 바로 조치하는 편이 빠릅니다.' },
      { h: 1, t: '부대 전화번호부 정비', q: '전화번호부는 어떤 방식으로 배포하셨나요?', ai: '인계서에서 근거를 찾지 못했습니다. 3월·9월 인사이동 뒤 다시 배포한다는 내용만 있고 배포 방식은 없습니다.', found: false, g: '내부망 게시판에 엑셀 파일을 올리고, 지휘관실과 당직실에는 출력본을 따로 드렸습니다.' },
      { h: 2, t: '지휘관 회의 브리핑 장비 지원', q: '지휘관 회의 당일에는 몇 시까지 준비해야 하나요?', ai: '인계서 기준으로 **회의 전날** 장비를 점검하고 당일 현장을 지원합니다. 당일 준비 시각은 인계서에 없어 전임자 답변이 필요합니다.', found: true, g: '회의 1시간 전에 빔프로젝터와 마이크를 켜 두고, 발표 자료는 전날 받아 미리 띄워 봅니다.' },
      { h: 2, t: '정보통신 기반시설 정밀 진단', q: '정밀 진단은 매년 받나요?', ai: '**정보통신 기반시설 정밀 진단**은 **짝수 해 9월**에 2년 주기로 받습니다. 진단 계획과 결과는 근거 문서에 정리되어 있습니다.', found: true },
    ],
  },
  {
    id: 'p2',
    unit: '제22훈련비행단',
    dept: '인사처',
    title: '인사장교',
    intro: '전입·전출 인사명령과 정기 보직 이동, 진급·근무평정·장기복무 선발, 부대 행사 의전을 맡는 자리',
    giver: { id: 'g2', rank: '소령', name: '정민수', start: '2025-01-06', end: MOVE_DATE },
    receiver: { id: 'r2', rank: '소령', name: '한지훈' },
    reviewer: { id: 'v2', rank: '대령', name: '서영훈', title: '인사처장' },
    candidates: [
      { rank: '소령', name: '한지훈', note: '인사장교 인수 예정' },
    ],
    prev: [
      { rank: '소령', name: '김재원', start: '2024-01-08', end: '2024-12-31' },
      { rank: '소령', name: '장현석', start: '2022-01-10', end: '2023-12-29' },
      { rank: '소령', name: '노진우', start: '2020-07-06', end: '2021-12-31' },
    ],
    folders: ['인사명령·전입전출', '진급·근무평정·장기복무', '부대 행사·의전'],
    excluded: [
      [0, ['02_보직 관리'], ['보직 이동 설명회 사진_01.jpg', '보직 이동 설명회 사진_02.jpg'], '2026-01-15'],
      [1, ['01_진급'], ['진급 축하 사진_01.jpg', '진급 축하 사진_02.jpg'], '2026-05-02'],
      [2, ['02_기념 행사'], ['기념일 행사 사진_01.jpg', '기념일 행사 사진_02.jpg', '이·취임식 사진_01.jpg'], '2026-05-20'],
    ],
    tasks: [
      T('사이버보안 진단의 날 점검', 0, '04_정기 보고', 'all', { d: 17, files: ['{Y}년 {M}월 사이버보안 진단의 날 점검표.hwp'], on: ['{Y}년 {M}월 사이버보안 진단의 날 점검 결과 보고'], coop: ['운영통제실'], h: CYBER_H }),
      T('전입·전출 인사명령 처리', 0, '01_인사명령', 'all', { d: 8, files: ['{Y}{MM} 전입전출 명령 대상자 명단.xlsx'], on: ['{Y}년 {M}월 전입·전출 인사명령'], coop: ['운영통제실'], imp: 1, h: '매월 둘째 주까지 전입·전출 대상자를 확정해 인사명령을 내고 예하 전대·대대 운영통제실에 통보한다.',
        hm: ['명령 발령 전에 대상자 본인과 대상 부대에 꼭 확인 전화를 할 것', null, '월말 전입자는 다음 달로 넘기지 말고 그달 명령으로 처리할 것'] }),
      T('공문 접수·분류·배부', 0, '03_민원·문서', 'all', { d: 20, skip: [8], files: ['공문 접수 대장_{Y}{MM}.xlsx'], h: '인사처로 들어오는 공문을 접수해 담당별로 분류·배부하고 대장을 정리한다.' }),
      T('상·하반기 정기 보직 이동', 0, '02_보직 관리', [1, 7], { d: 12, files: ['{Y}년 {H} 정기 보직 이동 계획.hwp', '{Y}년 {H} 보직 이동 대상자 현황.xlsx'], on: ['{Y}년 {H} 정기 보직 이동 명령'], coop: ['운영통제실'], imp: 1, h: '1월·7월 정기 보직 이동 계획을 세우고 대상자 현황을 정리해 명령을 낸다.',
        hv: [null, '2023년부터 보직 이동 대상자 현황을 인사정보체계에서 바로 뽑는다.', null], hm: ['희망 보직은 12월·6월 초에 서면으로 받을 것', null, null] }),
      T('신규 전입자 안내 교육', 0, '02_보직 관리', [3, 9], { d: 5, files: ['{Y}년 {M}월 신규 전입자 안내 교육 자료.pptx'], hist: [1, 0, 1], h: '보직 이동 두 달 뒤 신규 전입자를 모아 부대 생활·인사 절차를 안내한다.' }),
      T('부대 인사관리 규정 정비', 0, '05_규정 정비', [4], { d: 22, yr: 'odd', files: ['{Y}년 부대 인사관리 규정 개정안.hwp', '인사관리 규정 신구조문 대비표_{Y}.hwp'], on: ['{Y}년 부대 인사관리 규정 개정'], coop: ['법무실'], h: '홀수 해 4월에 2년 주기로 부대 인사관리 규정을 상급 부대 지침에 맞춰 고친다. 법무실 검토를 받는다.' }),
      T('월간 인력 현황 보고', -1, '', 'all', { d: 3, on: ['{Y}년 {M}월 인력 현황 보고'], coop: ['재정과(보수)'], h: '매월 초 정원·현원 인력 현황을 보고하고 보수 담당에 변동 인원을 알린다.',
        hv: ['2024년부터 보수 담당 통보를 메신저가 아닌 온나라 문서로 한다.', null, null] }),
      T('진급 대상자 현황 관리', 1, '01_진급', 'all', { d: 14, skip: [9], files: ['진급 대상자 현황_{Y}{MM}.xlsx'], h: '진급 대상자 현황을 매월 갱신한다.' }),
      T('근무평정 대상자 명부 관리', 1, '02_근무평정', 'all', { d: 19, skip: [11], files: ['근무평정 대상자 명부_{Y}{MM}.xlsx'], hist: [1, 1, 0], h: '근무평정 대상자 명부를 매월 갱신한다.' }),
      T('정기 진급 추천', 1, '01_진급', [4], { d: 12, files: ['{Y}년 정기 진급 추천 계획.hwp', '{Y}년 진급 추천 심의 자료(최종).hwp', '{Y}년 진급 추천 결과.hwp', '진급 추천 대상자 징계 조회_{Y}{MM}.xlsx'], on: ['{Y}년 정기 진급 추천 계획', '{Y}년 정기 진급 추천 결과 보고'], coop: ['법무실'], imp: 1, h: '4월 정기 진급 추천 계획을 세우고 법무실에 징계 사실을 조회한 뒤 심의 자료를 만든다.',
        hv: ['2024년부터 진급 추천 심의에 외부 위원 1명이 들어간다.', null, null], hm: [null, '징계 조회는 회신까지 1주가 걸리니 3월 말에 요청할 것', null] }),
      T('상반기 근무평정', 1, '02_근무평정', [6], { d: 15, files: ['{Y}년 상반기 근무평정 계획.hwp', '{Y}년 상반기 근무평정 취합.xlsx', '{Y}년 상반기 근무평정 결과.hwp', '근무평정 이의 신청 접수_{Y}{MM}.hwp'], on: ['{Y}년 상반기 근무평정 시행 계획'], coop: ['운영통제실'], h: '6월 상반기 근무평정을 시행하고 예하 부대 평정 결과를 취합한다.',
        hv: [null, null, '2021년에는 평정 면담을 비대면으로 했다.'] }),
      T('장기복무 선발 공고·접수', 1, '03_장기복무', [8], { d: 6, files: ['{Y}년 장기복무 지원 공고.hwp', '{Y}년 장기복무 지원자 접수 현황.xlsx', '장기복무 지원서 양식_{Y}.hwp', '{Y}년 장기복무 지원자 면담 일정.xlsx'], h: '8월 장기복무 지원 공고를 내고 지원서를 접수한다.',
        hm: [null, null, '지원자가 적으면 공고 기간을 늘리고 대대별 설명회를 열 것'] }),
      T('분기 인력 운영 분석', 1, '04_인력 분석', [3, 6, 9, 12], { d: 24, files: ['{Y}년 {Q}분기 인력 운영 분석.xlsx'], hist: [1, 1, 0], h: '분기 말에 보직·결원·진급 대상 현황을 분석해 처장에게 보고한다.' }),
      T('월간 부대 일정·의전 계획', 2, '01_월간 일정', 'all', { d: 25, files: ['{Y}.{MM} 월간 부대 일정 및 의전 계획.hwp'], h: '매월 말 다음 달 부대 일정과 내빈 의전 계획을 정리한다.' }),
      T('경조사 지원 현황 관리', 2, '01_월간 일정', 'all', { d: 27, skip: [10], files: ['경조사 지원 현황_{Y}{MM}.xlsx'], hist: [1, 0, 1], h: '장병 경조사 지원 현황을 매월 정리한다.' }),
      T('부대 기념일 행사·의전', 2, '02_기념 행사', [5], { d: 8, files: ['{Y}년 부대 기념일 행사 계획(안).hwp', '{Y}년 부대 기념일 행사 계획(최종).hwp', '{Y}년 기념일 행사 의전 배치도.pptx', '{Y}년 기념일 행사 내빈 명단.xlsx'], on: ['{Y}년 부대 기념일 행사 계획', '{Y}년 부대 기념일 행사 결과 보고'], coop: ['정훈공보실'], imp: 1, h: '5월 부대 기념일 행사 계획과 내빈 의전을 맡고 정훈공보실과 홍보를 협조한다.',
        hv: [null, '2022년에는 방역 지침으로 내빈을 30명으로 줄였다.', null], hm: ['내빈 초청장은 행사 3주 전에 보낼 것', null, null] }),
      T('지휘관 이·취임식 의전', 2, '02_기념 행사', [11], { d: 6, files: ['{Y}년 지휘관 이·취임식 계획.hwp', '이·취임식 의전 순서_{Y}{MM}.hwp', '이·취임식 초청 명단_{Y}{MM}.xlsx'], on: ['{Y}년 지휘관 이·취임식 시행 계획'], coop: ['정훈공보실'], hist: [0, 1, 1], h: '지휘관 이·취임식 의전 순서와 초청 명단을 준비한다.' }),
      T('신년 하례식 의전', 2, '02_기념 행사', [1], { d: 8, files: ['{Y}년 신년 하례식 계획.hwp', '신년 하례식 좌석 배치도_{Y}.pptx', '신년 하례식 참석자 명단_{Y}.xlsx'], h: '1월 둘째 주 신년 하례식 좌석 배치와 참석자를 정리한다.' }),
      T('전역 예정자 제대군인 지원 상담', 2, '03_전역 지원', [12], { d: 10, files: ['{Y}년 전역 예정자 제대군인 지원 상담 결과.hwp', '제대군인 지원 상담 일지_{Y}{MM}.hwp'], on: ['{Y}년 전역 예정자 제대군인 지원 상담 결과 보고'], coop: ['제대군인지원센터'], hist: [1, 1, 0], h: '12월에 다음 해 전역 예정자를 제대군인지원센터 상담과 연결하고 결과를 남긴다.' }),
      T('장기복무 선발 심의 자료 준비', -1, '', [9], { cur: false, d: 15, files: ['{Y}년 장기복무 선발 심의 자료.hwp'], on: ['{Y}년 장기복무 선발 심의위원회 개최 계획'], coop: ['운영통제실'], imp: 1, h: '9월 장기복무 선발 심의위원회 전에 지원자 평정·경력 자료를 묶어 심의 자료를 만든다.' }),
      T('하반기 근무평정 취합', -1, '', [12], { cur: false, d: 12, files: ['{Y}년 하반기 근무평정 취합.xlsx'], on: ['{Y}년 하반기 근무평정 결과 보고'], coop: ['운영통제실'], hist: [1, 1, 0], h: '12월 하반기 근무평정 결과를 예하 부대에서 받아 취합한다.' }),
    ],
    incidents: [
      I('cur', '보직 이동 이의 민원 처리', 0, '03_민원·문서', '2025-05-14', { files: ['{Y}{MM}{DD} 보직 이동 이의 민원 처리 결과.hwp', '민원 처리 경과_{Y}{MM}{DD}.hwp'], on: ['보직 이동 이의 민원 처리 결과 회신'], coop: ['법무실'], h: '보직 이동 결과에 대한 이의 민원이 접수되어 법무실 검토를 거쳐 원래 명령을 유지하고 회신했다.' }),
      I('cur', '근무평정 감사 지적사항 조치', 1, '02_근무평정', '2026-10-16', { files: ['{Y}{MM}{DD} 근무평정 감사 지적사항 조치 결과.hwp', '감사 지적사항 조치 계획_{Y}{MM}.hwp'], h: '근무평정 서류 보관 기간에 대한 감사 지적이 있어 보관 절차를 고쳤다.' }),
      I(0, '인사명령 오발령 정정', 0, '01_인사명령', '2024-03-13', { files: ['{Y}{MM}{DD} 인사명령 정정 명령.hwp'], on: ['전출 인사명령 정정 통보'], coop: ['운영통제실'], imp: 1, h: '전출 대상자 소속이 잘못 입력된 명령이 나가 당일 정정 명령을 내고 대상 부대에 다시 알렸다. 발령 전 대상 부대 확인을 두 번 한다.' }),
      I(1, '인사기록 열람 절차 지적 조치', 0, '03_민원·문서', '2022-11-17', { files: ['{Y}{MM}{DD} 인사기록 열람 절차 지적사항 조치 결과.hwp'], h: '인사기록 열람 대장을 쓰지 않은 것이 지적되어 열람 대장 양식을 만들고 열람 승인 절차를 정했다.' }),
      I(1, '격리 대상자 전입 명령 조정', 0, '01_인사명령', '2022-03-10', { files: ['{Y}{MM}{DD} 격리 대상자 전입 명령 조정 결과.hwp'], coop: ['운영통제실'], h: '감염병 격리 대상자가 많아 전입 신고가 밀려 명령 효력일을 늦춰 조정했다.' }),
      I(2, '장기복무 선발 이의 신청 처리', 1, '03_장기복무', '2021-10-20', { files: ['{Y}{MM}{DD} 장기복무 선발 이의 신청 처리 결과.hwp'], on: ['장기복무 선발 결과 이의 신청 처리 결과 회신'], coop: ['법무실'], h: '선발에서 떨어진 지원자의 이의 신청이 있어 심의 기록을 다시 확인하고 결과를 회신했다.' }),
    ],
    qa: [
      { h: 0, t: '전입·전출 인사명령 처리', q: '명령 발령 전에 꼭 확인할 게 있을까요?', ai: '인계자 메모에 따르면 **명령 발령 전에 대상자 본인과 대상 부대에 확인 전화**를 해야 합니다. 같은 해 3월에는 소속이 잘못 입력된 명령이 나가 정정한 일이 있었습니다.', found: true },
      { h: 0, t: '상·하반기 정기 보직 이동', q: '보직 이동 대상자의 희망 보직은 어떻게 받으셨나요?', ai: '인계자 메모에 **희망 보직은 12월·6월 초에 서면으로 받으라**고 되어 있습니다. 받는 양식은 인계서에 없습니다.', found: true, g: '희망 보직 3순위를 서면으로 받았습니다. 양식은 보직 이동 계획 파일 맨 뒤에 붙어 있습니다.' },
      { h: 0, t: '부대 기념일 행사·의전', q: '내빈 참석 여부는 어떻게 확인하셨나요?', ai: '인계서에서 근거를 찾지 못했습니다. 초청장은 행사 3주 전에 보낸다는 메모만 있고 참석 확인 방법은 없습니다.', found: false, g: '행사 1주 전에 비서실을 통해 전화로 다시 확인했습니다. 내빈 명단 파일에 확인 칸을 따로 두었습니다.' },
      { h: 1, t: '정기 진급 추천', q: '징계 조회는 누구에게 요청하나요?', ai: '**정기 진급 추천** 때 **법무실**에 징계 사실을 조회합니다. 인계자 메모에 따르면 회신까지 1주가 걸리니 **3월 말에 요청**해야 합니다.', found: true },
      { h: 1, t: '근무평정 대상자 명부 관리', q: '명부는 어떤 기준으로 갱신하나요?', ai: '인계서에서 근거를 찾지 못했습니다. 매월 갱신한다는 내용만 있고 기준은 없습니다.', found: false, g: '매월 20일 기준 인사정보체계 현원으로 맞추고, 그달 전입·전출자는 색으로 따로 표시했습니다.' },
      { h: 2, t: '장기복무 선발 공고·접수', q: '지원자가 적을 때는 어떻게 하셨나요?', ai: '인계자 메모에 따르면 지원자가 적으면 **공고 기간을 늘리고 대대별 설명회**를 엽니다.', found: true, g: '공고를 1주 늘리고 대대마다 설명회를 열었더니 2021년에는 지원자가 두 배가 됐습니다.' },
      { h: 2, t: '신년 하례식 의전', q: '신년 하례식 좌석 배치 기준이 따로 있나요?', ai: '좌석 배치는 근거 문서인 **신년 하례식 좌석 배치도**에 정리되어 있습니다. 하례식은 **1월 둘째 주**에 엽니다.', found: true },
    ],
  },
  {
    id: 'p3',
    unit: '모의사령부',
    dept: '재정처',
    title: '예산담당',
    intro: '예산 편성·결산과 집행·출납 관리, 예하부대 예산 배정을 맡는 자리',
    giver: { id: 'g3', rank: '중령', name: '윤성철', start: '2025-07-07', end: MOVE_DATE },
    receiver: { id: 'r3', rank: '중령', name: '오세영' },
    reviewer: { id: 'v3', rank: '대령', name: '문재석', title: '재정처장' },
    candidates: [
      { rank: '중령', name: '오세영', note: '예산담당 인수 예정' },
    ],
    prev: [
      { rank: '중령', name: '고명진', start: '2023-07-03', end: '2025-06-30' },
      { rank: '중령', name: '백승훈', start: '2021-07-05', end: '2023-06-30' },
      { rank: '중령', name: '염동규', start: '2020-07-06', end: '2021-06-30' },
    ],
    folders: ['예산 편성·결산', '집행·출납 관리', '예하부대 배정·재배정'],
    excluded: [
      [0, ['01_정기 보고'], ['예산 회의 사진_01.jpg', 'ERP 보안모듈 설치.exe'], '2026-02-04'],
      [1, ['03_계약·감사'], ['계약 현장 사진_01.jpg', '계약 현장 사진_02.jpg'], '2025-08-21'],
      [2, ['03_교육·감사'], ['예산 교육 사진_01.jpg', '예산 교육 사진_02.jpg'], '2026-02-25'],
    ],
    tasks: [
      T('사이버보안 진단의 날 점검', 0, '01_정기 보고', 'all', { d: 17, files: ['{Y}년 {M}월 사이버보안 진단의 날 점검표.hwp'], on: ['{Y}년 {M}월 사이버보안 진단의 날 점검 결과 보고'], coop: ['기획과'], h: CYBER_H }),
      T('예산 편성 동향 정리', 0, '03_예산요구', 'all', { d: 25, skip: [3], files: ['예산 편성 동향_{Y}{MM}.hwp'], hist: [1, 1, 0], h: '상급 부대 예산 편성 지침과 동향을 매월 정리한다.' }),
      T('전년도 결산', 0, '02_결산', [2], { d: 12, files: ['{Yp}회계연도 결산 계획.hwp', '{Yp}회계연도 결산 보고서(초안).hwp', '{Yp}회계연도 결산 보고서(최종).hwp', '{Yp}회계연도 결산 부속서류.xlsx'], on: ['{Yp}회계연도 결산 계획', '{Yp}회계연도 결산 보고'], coop: ['기획과'], imp: 1, h: '2월에 전년도 회계연도 결산 보고서와 부속서류를 만들어 보고한다.',
        hv: ['2024년 결산부터 성과보고서를 함께 낸다.', null, null], hm: [null, '부속서류 양식이 매년 조금씩 바뀌니 1월 지침을 먼저 확인할 것', null] }),
      T('차년도 예산요구서 작성·제출', 0, '03_예산요구', [3], { d: 18, files: ['{Y1}년도 예산요구서(안).hwp', '{Y1}년도 예산요구서(최종).hwp', '{Y1}년도 사업별 소요 산출 근거.xlsx', '{Y1}년도 예산요구 부서 의견 취합.xlsx'], on: ['{Y1}년도 예산요구서 제출', '{Y1}년도 군수 분야 예산 소요 협조'], coop: ['기획과', '군수과'], imp: 1, h: '3월에 차년도 예산요구서를 작성해 제출한다. 사업별 소요 산출 근거를 함께 붙인다.',
        hv: [null, '2022년부터 사업별 소요 산출 근거를 별도 엑셀로 붙인다.', null], hm: [null, null, '부서 의견 취합은 2월 말까지 마감할 것'] }),
      T('중기 재원 소요 검토', 0, '03_예산요구', [6], { d: 18, yr: 'even', files: ['{Y}-{Y4} 중기 재원 소요 검토.hwp', '중기 재원 소요 산출표_{Y}.xlsx', '중기 재원 검토 회의자료_{Y}{MM}.pptx'], on: ['{Y}-{Y4} 중기 재원 소요 검토 결과 보고'], coop: ['기획과'], h: '짝수 해 6월에 2년 주기로 향후 5년 중기 재원 소요를 검토한다.' }),
      T('예산 집행실적 보고', 1, '01_집행 실적', 'all', { d: 4, files: ['{Y}.{MM} 예산 집행실적.xlsx'], on: ['{Y}년 {M}월 예산 집행실적 보고'], coop: ['기획과'], h: '매월 초 전월 예산 집행실적을 집계해 보고한다.' }),
      T('국방통합재정정보시스템(ERP) 자금 출납 점검', 1, '02_출납 점검', 'all', { d: 26, files: ['국방통합재정정보시스템 출납 점검표_{Y}{MM}.xlsx'], imp: 1, h: '매월 말 국방통합재정정보시스템(ERP)의 자금 출납 내역과 잔액을 점검한다.',
        hv: ['2024년 1월 시스템 개편 뒤 점검표 항목이 늘었다.', null, null], hm: ['월말 마감 전날 오후에 점검해야 수정할 시간이 있음', null, null] }),
      T('증빙서류 규정 검토', 1, '02_출납 점검', 'all', { d: 18, skip: [7], files: ['증빙서류 규정 검토 결과_{Y}{MM}.hwp'], hist: [1, 1, 0], h: '지출 증빙서류가 규정에 맞는지 매월 표본 검토한다.' }),
      T('불용액 발생 사유 소명', 1, '01_집행 실적', [11], { d: 10, files: ['{Y}년 불용액 발생 사유서.hwp', '불용 예상액 산출_{Y}{MM}.xlsx'], on: ['{Y}년 불용액 발생 사유 소명'], coop: ['기획과'], hist: [1, 1, 0], h: '11월에 그해 불용이 예상되는 사업을 뽑아 사유를 정리해 소명한다.',
        hv: [null, '2022년에는 불용액이 커서 사업별 사유서를 따로 냈다.', null] }),
      T('분기 예하부대 예산 배정', 2, '01_예산 배정', [1, 4, 7, 10], { d: 7, files: ['{Y}년 {Q}분기 예하부대 예산 배정.xlsx'], on: ['{Y}년 {Q}분기 예하부대 예산 배정'], coop: ['예하부대 재정'], imp: 1, h: '분기 첫 달에 예하부대별 예산을 배정하고 통보한다.',
        hv: [null, null, '2020년에는 감염병 방역 소요를 먼저 떼어 두고 배정했다.'] }),
      T('예하부대 집행 현황 취합', 2, '02_집행 현황', 'all', { d: 9, files: ['예하부대 집행 현황 취합_{Y}{MM}.xlsx'], h: '예하부대 예산 집행 현황을 매월 9일까지 받아 취합한다.' }),
      T('재정 담당자 회의', 2, '02_집행 현황', 'all', { d: 22, skip: [8], files: ['{Y}.{MM} 예하부대 재정 담당자 회의자료.pptx'], hist: [1, 0, 1], h: '예하부대 재정 담당자 회의를 매월 열어 집행 이슈를 공유한다.' }),
      T('군수 물자 구매 예산 협조', 2, '01_예산 배정', [5], { d: 13, files: ['{Y}년 군수 물자 구매 예산 협조 요청.hwp', '군수 물자 구매 소요 검토_{Y}{MM}.xlsx', '{Y}년 구매 예산 배정 결과.hwp'], on: ['{Y}년 군수 물자 구매 예산 협조', '{Y}년 구매 계약 예산 확인'], coop: ['군수과', '계약과'], h: '5월 군수 물자 구매 예산을 군수과·계약과와 협조해 배정한다.' }),
      T('예하부대 예산 교육', 2, '03_교육·감사', [2], { d: 24, files: ['{Y}년 예하부대 예산 집행 교육 자료.pptx', '예산 교육 참석자 명단_{Y}.xlsx', '예산 교육 질의응답 정리_{Y}.hwp'], h: '2월에 예하부대 재정 담당자 대상 예산 집행 교육을 한다.' }),
      T('월간 자금 운용 계획 보고', -1, '', 'all', { d: 2, on: ['{Y}년 {M}월 자금 운용 계획 보고'], coop: ['예하부대 재정'], h: '매월 초 자금 운용 계획을 보고한다.' }),
      T('분기 예하부대 예산 재배정', -1, '', [3, 6, 9, 12], { cur: false, d: 20, files: ['{Y}년 {Q}분기 예하부대 예산 재배정.xlsx'], on: ['{Y}년 {Q}분기 예하부대 예산 재배정'], coop: ['예하부대 재정'], imp: 1, h: '분기 말 예하부대 집행 실적을 보고 남는 예산을 다시 배정한다.',
        hm: ['집행률이 낮은 부대는 회수 전에 사유를 먼저 받을 것', null, null] }),
      T('연말 이월·불용 정리', -1, '', [12], { cur: false, d: 10, files: ['{Y}년 이월·불용 예정액 정리.xlsx'], on: ['{Y}년 이월·불용 예정액 보고'], coop: ['기획과'], hist: [1, 1, 0], h: '12월에 이월·불용 예정액을 정리해 보고한다.' }),
    ],
    incidents: [
      I('cur', '결산 감사 지적사항 조치', 0, '02_결산', '2026-04-14', { files: ['{Y}{MM}{DD} 결산 감사 지적사항 조치 결과.hwp', '결산 감사 지적사항 목록_{Y}.xlsx'], h: '결산 감사에서 증빙 누락 지적이 있어 보완 조치했다.' }),
      I('cur', '입찰·계약 관련 지적사항 조치', 1, '03_계약·감사', '2025-08-20', { files: ['{Y}{MM}{DD} 입찰·계약 지적사항 조치 결과.hwp', '계약 지적사항 조치 계획_{Y}{MM}.hwp'], on: ['입찰·계약 관련 지적사항 조치 결과 보고'], coop: ['계약과'], h: '입찰 공고 기간 미준수 지적이 있어 계약과와 절차를 보완했다.' }),
      I(0, '예하부대 회계 감사 지적 조치', 2, '03_교육·감사', '2024-09-12', { files: ['{Y}{MM}{DD} 예하부대 회계 감사 지적 조치 결과.hwp'], coop: ['예하부대 재정'], h: '예하부대 회계 감사에서 카드 사용 증빙 누락이 지적되어 조치 결과를 받아 확인했다.' }),
      I(0, 'ERP 개편 직후 출납 잔액 불일치 조치', 1, '02_출납 점검', '2024-01-30', { files: ['{Y}{MM}{DD} 출납 잔액 불일치 조치 결과.hwp'], imp: 1, h: '국방통합재정정보시스템 개편 직후 출납 잔액이 맞지 않아 수기 대장과 대조해 바로잡았다.' }),
      I(1, '추가경정예산 긴급 배정', 2, '01_예산 배정', '2022-07-21', { files: ['{Y}년 추가경정예산 예하부대 긴급 배정.xlsx'], on: ['{Y}년 추가경정예산 예하부대 배정'], coop: ['예하부대 재정'], h: '추가경정예산으로 받은 예산을 2주 안에 예하부대에 나눠 배정했다.' }),
      I(1, '집행 잔액 반납 지연 소명', 1, '01_집행 실적', '2023-01-18', { files: ['{Y}{MM}{DD} 집행 잔액 반납 지연 사유서.hwp'], on: ['집행 잔액 반납 지연 사유 소명'], coop: ['기획과'], h: '예하부대 잔액 반납이 늦어 상급 부대에 사유를 소명하고 반납 기한 점검표를 만들었다.' }),
      I(2, '방역 예산 긴급 집행', 2, '01_예산 배정', '2020-09-03', { files: ['{Y}년 방역 예산 긴급 집행 결과.hwp'], on: ['{Y}년 방역 물품 예산 긴급 집행 결과 보고'], coop: ['군수과'], h: '감염병 확산으로 방역 물품 예산을 긴급 집행하고 결과를 따로 정리했다.' }),
    ],
    qa: [
      { h: 0, t: '국방통합재정정보시스템(ERP) 자금 출납 점검', q: '월말 출납 점검은 언제 하는 게 좋나요?', ai: '인계자 메모에 따르면 **월말 마감 전날 오후**에 점검해야 수정할 시간이 있습니다.', found: true },
      { h: 0, t: '분기 예하부대 예산 재배정', q: '재배정할 때 기준이 따로 있나요?', ai: '인계서에는 **분기 말 예하부대 집행 실적을 보고 남는 예산을 다시 배정**한다고 되어 있습니다. 회수 기준 비율은 인계서에 없어 전임자 답변이 필요합니다.', found: true, g: '집행률 60% 미만인 부대에서 회수해 80%가 넘는 부대에 주는 게 관례였습니다. 회수 전에 해당 부대 사유를 먼저 받습니다.' },
      { h: 0, t: '차년도 예산요구서 작성·제출', q: '사업별 소요 산출 근거 양식은 매년 같나요?', ai: '인계서에서 근거를 찾지 못했습니다. 산출 근거를 함께 붙인다는 내용만 있고 양식 변경 여부는 없습니다.', found: false, g: '기본 틀은 같은데 단가 기준표가 매년 바뀝니다. 2월에 상급 부대 지침이 오면 단가부터 바꾸세요.' },
      { h: 1, t: '전년도 결산', q: '결산 준비는 언제부터 시작하나요?', ai: '**전년도 결산**은 **2월**에 보고합니다. 인계자 메모에 따르면 부속서류 양식이 매년 바뀌니 **1월 지침을 먼저 확인**해야 합니다.', found: true },
      { h: 1, t: '예하부대 집행 현황 취합', q: '취합이 늦는 부대는 어떻게 하셨나요?', ai: '인계서에서 근거를 찾지 못했습니다. 매월 9일까지 받는다는 내용만 있고 늦을 때의 처리는 없습니다.', found: false, g: '마감 전날 미제출 부대에 전화로 알리고, 두 번 늦으면 재정 담당자 회의에서 공유했습니다.' },
      { h: 2, t: '분기 예하부대 예산 배정', q: '분기 배정은 어떤 문서로 통보하나요?', ai: '온나라 **분기 예하부대 예산 배정** 문서로 통보합니다. 분기 첫 달에 배정하며 근거 문서에 배정표가 있습니다.', found: true },
      { h: 2, t: '예하부대 예산 교육', q: '교육 자료는 매년 새로 만드나요?', ai: '인계서에서 근거를 찾지 못했습니다. 2월에 교육한다는 내용만 있고 자료 작성 방식은 없습니다.', found: false, g: '전년도 자료에 그해 바뀐 지침만 더하면 됩니다. 질의응답 정리본이 제일 쓸모 있었습니다.' },
    ],
  },
];

// ───────── 생성 ─────────

function fill(tpl, y, m, d) {
  const map = { Y: y, Y1: y + 1, Yp: y - 1, Y4: y + 4, M: m, MM: pad(m), DD: pad(d), H: m <= 6 ? '상반기' : '하반기', Q: Math.ceil(m / 3) };
  return tpl.replace(/\{(\w+)\}/g, (s, k) => (k in map ? map[k] : s));
}

const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const minDate = (a, b) => (a < b ? a : b);

/** start~end 사이의 [연, 월] 목록 */
function yearMonths(start, end) {
  const out = [];
  let y = +start.slice(0, 4);
  let m = +start.slice(5, 7);
  const ey = +end.slice(0, 4);
  const em = +end.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) {
    out.push([y, m]);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * 근무기간 안에서 업무가 일어난 날짜 [{ y, m, d }] (날짜순)
 * 매월 루틴은 달마다, 그 밖의 업무는 같은 달이 여러 해 걸려도 가장 최근 한 번만.
 */
function occurrences(t, start, end, r) {
  const last = minDate(end, DOC_CUTOFF);
  const lastYM = last.slice(0, 7);
  const out = [];
  for (const [y, m] of yearMonths(start, last)) {
    if (t.m === 'all' ? (t.skip || []).includes(m) : !t.m.includes(m)) continue;
    if (t.yr === 'even' && y % 2) continue;
    if (t.yr === 'odd' && !(y % 2)) continue;
    let d = Math.min(28, Math.max(1, t.d + Math.round(r() * 4 - 2)));
    if (`${y}-${pad(m)}` === lastYM) d = Math.min(d, +last.slice(8, 10)); // 마지막 달은 그 날짜까지
    const date = ymd(y, m, d);
    if (date < start) continue;
    out.push({ y, m, d });
  }
  if (t.m === 'all') return out;
  const seen = new Set();
  return out.reverse().filter((o) => !seen.has(o.m) && seen.add(o.m)).reverse();
}

/** 발생 1회에서 k번째 문서 날짜 (같은 업무 문서는 이틀씩 뒤에 만든다, 기간 끝을 넘지 않음) */
function docDate(o, k, end) {
  return minDate(ymd(o.y, o.m, Math.min(28, o.d + k)), minDate(end, DOC_CUTOFF));
}

const isSpecialName = (n) => /(장애|사고|복구|감사|지적)/.test(n);
const incidentYMD = (inc) => ({ y: +inc.date.slice(0, 4), m: +inc.date.slice(5, 7), d: +inc.date.slice(8, 10) });

function buildPosition(def, pi) {
  const r = rng(1000 + pi * 97);
  const giver = def.giver;
  const files = [];
  const onnara = [];
  let fn = 0;
  let on = 0;

  // 하위 폴더 번호 매기기 (상위 폴더 안에서 01_, 02_ …) — 이번 담당자 업무 + 이번 담당자 특이사항
  const curIncidents = def.incidents.filter((x) => x.who === 'cur');
  const leafName = new Map();
  const leafCounter = new Map();
  for (const t of [...def.tasks.filter((x) => x.cur && x.f >= 0), ...curIncidents]) {
    const k = `${t.f}/${t.dir}`;
    const n = (leafCounter.get(k) || 0) + 1;
    leafCounter.set(k, n);
    leafName.set(t, `${pad(n)}_${t.n}`);
  }

  const emit = (t, o, k0, tags) => {
    if (t.f >= 0) {
      t.files.forEach((tpl, k) => {
        const date = docDate(o, k0 + k * 2, giver.end);
        files.push({ id: `${def.id}-f${++fn}`, folder: t.f, path: [t.dir, leafName.get(t)], name: fill(tpl, o.y, o.m, +date.slice(8, 10)), date, tags });
      });
    }
    (t.on || []).forEach((tpl, k) => {
      const date = docDate(o, k0 + 2 + k * 3, giver.end);
      onnara.push({ id: `${def.id}-o${++on}`, title: fill(tpl, o.y, o.m, +date.slice(8, 10)), date, type: docType(tpl), coop: t.coop, workKey: t.n, tags });
    });
  };

  // 이번 담당자 업무
  for (const t of def.tasks) {
    if (!t.cur) continue;
    for (const o of occurrences(t, giver.start, giver.end, r)) emit(t, o, 0, []);
  }
  // 이번 담당자 특이사항 (이름에 장애·감사 등이 없으면 '특이' 꼬리표로 표시)
  for (const inc of curIncidents) emit(inc, incidentYMD(inc), 0, isSpecialName(inc.n) ? [] : ['특이']);

  // 근무기간 이전(전임자 시기) 온나라 문서 — 근무기간 기준 연동에서 걸러져야 한다
  const before = yearMonths(addDays(giver.start, -62), addDays(giver.start, -10)).slice(-2);
  def.tasks.filter((t) => t.on && t.m === 'all').slice(0, 2).forEach((t) => {
    for (const [y, m] of before) {
      onnara.push({ id: `${def.id}-o${++on}`, title: fill(t.on[0], y, m, t.d), date: ymd(y, m, t.d), type: docType(t.on[0]), coop: t.coop, workKey: t.n, tags: [] });
    }
  });
  for (const [folder, path, names, date] of def.excluded) {
    for (const name of names) files.push({ id: `${def.id}-f${++fn}`, folder, path, name, date, tags: [] });
  }

  // 역대 인계서 — 그 담당자 근무기간 안에서 같은 규칙으로 만든다
  const history = def.prev.map((pp, i) => {
    const hid = `${def.id}-h${i}`;
    const total = monthsBetween(pp.start, pp.end);
    const served = [...servedMonthsOfYear(pp.start, pp.end)].sort((a, b) => a - b);
    const items = [];
    const docCounts = {};
    const countDocs = (coop, n) => { for (const c of coop) docCounts[c] = (docCounts[c] || 0) + n; };
    const docsOf = (t, occ, ti) => {
      const docs = [];
      const srcs = [...t.files.slice(0, 2).map((x) => ['folder', x]), ...(t.on || []).slice(0, 2).map((x) => ['onnara', x])].slice(0, 3);
      for (const o of [...occ].reverse().slice(0, 2)) {
        srcs.forEach(([src, tpl], k) => {
          const date = docDate(o, src === 'onnara' ? 2 + k : k * 2, pp.end);
          docs.push({ id: `${hid}-d${ti}-${docs.length}`, src, title: fill(tpl, o.y, o.m, +date.slice(8, 10)), date });
        });
      }
      return docs.sort((a, b) => (a.date < b.date ? 1 : -1));
    };

    def.tasks.forEach((t, ti) => {
      if (!t.hist[i]) return;
      const occ = occurrences(t, pp.start, pp.end, r);
      if (!occ.length) return;
      const moy = [...new Set(occ.map((o) => o.m))].sort((a, b) => a - b);
      const yms = new Set(occ.map((o) => `${o.y}-${o.m}`));
      const category = classify({ special: false, ratio: yms.size / total, moy });
      const months = category === 'routine' ? served : moy;
      const period = periodText(category, months, category === 'routine' ? weekLabel(t.d) : null);
      if (t.on) countDocs(t.coop, occ.length * t.on.length);
      items.push({
        id: `${hid}-i${ti}`,
        key: normalizeTitle(t.n),
        category,
        title: t.n,
        months,
        period,
        desc: [t.h || `${period}에 처리하는 업무입니다.`, t.hv[i]].filter(Boolean).join(' '),
        depts: [...t.coop],
        docs: docsOf(t, occ, ti),
        important: !!t.imp && (i !== 2 || ti % 3 !== 1), // 전전전 담당자는 중요 표시를 덜 했다
        memo: t.hm[i] || '',
        source: 'auto',
      });
    });
    def.incidents.filter((x) => x.who === i).forEach((inc, k) => {
      const o = incidentYMD(inc);
      if (inc.on) countDocs(inc.coop, inc.on.length);
      items.push({
        id: `${hid}-s${k}`,
        key: normalizeTitle(inc.n),
        category: 'special',
        title: inc.n,
        months: [o.m],
        period: specialPeriod(inc.date),
        desc: inc.h,
        depts: [...inc.coop],
        docs: docsOf(inc, [o], `s${k}`),
        important: !!inc.imp,
        memo: '',
        source: 'auto',
      });
    });

    return {
      id: hid,
      person: { id: `${def.id}-prev${i}`, ...pp },
      start: pp.start,
      end: pp.end,
      periodLabel: periodLabel(pp.start, pp.end),
      approvedAt: `${addDays(pp.end, -6 - i)}T16:${pad(10 + i * 7)}:00`,
      items: sortItems(items),
      docCounts,
      qa: [],
    };
  });

  history.forEach((h, i) => { h.qa = buildHistoryQA(h, i, def); });
  // 미리 작성해 둔 브리핑(baked-ai.js)이 있으면 그것을 쓰고, 없으면 규칙으로 조합한 문장을 쓴다
  const baked = (key, fallback, at) => (BAKED[key] ? { text: BAKED[key].raw.trim(), at: BAKED[key].at, status: 'ok', stored: true } : { text: fallback, at, status: 'ok', stored: true });
  history.forEach((h) => { h.briefing = baked(`hist:${h.id}`, personBriefing(def, h.items, h.person), h.approvedAt); });

  return {
    id: def.id,
    unit: def.unit,
    dept: def.dept,
    title: def.title,
    intro: def.intro,
    folders: def.folders,
    files,
    onnara,
    history,
    candidates: def.candidates,
    aggBriefing: baked(`agg:${def.id}`, aggBriefing(def, history), history[0].approvedAt),
    def,
  };
}

/** 역대 질문·답변 — 다음 담당자가 묻고, AI가 먼저 답하고, 필요하면 전임자가 답한다 */
function buildHistoryQA(h, i, def) {
  const prevNext = def.prev[i - 1];
  const asker = prevNext ? `${prevNext.rank} ${prevNext.name}` : `${def.giver.rank} ${def.giver.name}`;
  const out = [];
  def.qa.filter((x) => x.h === i).forEach((x, k) => {
    const item = h.items.find((it) => it.title === x.t);
    if (!item) throw new Error(`역대 질문 대상 업무가 없습니다: ${h.person.name} / ${x.t}`);
    const day = addDays(h.end, -4 + k * 2);
    const at = `${day}T${pad(9 + k)}:20:00`;
    const root = { id: `${h.id}-q${k}`, itemId: item.id, parentId: null, authorType: 'receiver', authorName: asker, text: x.q, at, forwarded: !!x.g };
    out.push(root);
    out.push({ id: `${root.id}-ai`, itemId: item.id, parentId: root.id, authorType: 'ai', text: x.ai, at, found: x.found, refs: x.found ? { items: [item.id], docs: item.docs.slice(0, 1).map((d) => d.id) } : { items: [], docs: [] } });
    if (x.g) out.push({ id: `${root.id}-g`, itemId: item.id, parentId: root.id, authorType: 'giver', authorName: `${h.person.rank} ${h.person.name}`, text: x.g, at: `${day}T${pad(14 + k)}:05:00` });
  });
  return out;
}

const josa = (w) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '을' : '를';
};

/** 이전 담당자 탭 브리핑 (미리 작성한 글이 없을 때 쓰는 규칙 조합) */
function personBriefing(def, items, person) {
  const routines = items.filter((i) => i.category === 'routine').slice(0, 3).map((i) => `**${i.title}**`);
  const periodic = items.filter((i) => i.category === 'quarterly' || i.category === 'semiannual').slice(0, 2).map((i) => `${i.title}(${CATS[i.category].short})`);
  const events = items.filter((i) => i.category === 'event').slice(0, 3).map((i) => `${i.months.join('·')}월 ${i.title}`);
  const imp = items.filter((i) => i.important).slice(0, 2).map((i) => i.title);
  const depts = deptRows(items).slice(0, 3).map((d) => d.name);
  return [
    `이 자리는 ${def.intro}입니다.`,
    `매월 ${routines.join(', ')} 등 루틴 업무가 이어지고${periodic.length ? `, ${periodic.join(', ')}도 주기적으로 돌아옵니다` : ''}.`,
    events.length ? `연간 일정으로는 ${events.join(', ')}${josa(events[events.length - 1])} 챙겨야 합니다.` : null,
    imp.length ? `${person.rank} ${person.name}은(는) **${imp.join('**, **')}**${josa(imp[imp.length - 1])} 중요 업무로 표시했습니다.` : null,
    depts.length ? `주요 협조 부서는 ${depts.join(', ')}입니다.` : null,
  ].filter(Boolean).slice(0, 5).join('\n');
}

/** 전체 합산 탭 브리핑 (미리 작성한 글이 없을 때 쓰는 규칙 조합) */
function aggBriefing(def, history) {
  const agg = aggregate(history);
  const core = agg.rows.filter((r) => r.ratio >= 0.75);
  const coreR = core.filter((r) => r.category === 'routine').slice(0, 3).map((r) => `**${r.title}**`);
  const coreE = core.filter((r) => r.category === 'event').slice(0, 3).map((r) => `${r.months.join('·')}월 ${r.title}`);
  return [
    `역대 담당자 ${history.length}명이 공통으로 해온 핵심 업무는 ${core.length}건입니다.`,
    `매월 ${coreR.join(', ')}가 빠짐없이 이어졌습니다.`,
    coreE.length ? `연간으로는 ${coreE.join(', ')}가 매년 반복됩니다.` : null,
    `가장 바쁜 달은 **${agg.busyMonth}월**로 평균 ${agg.busyAvg.toFixed(1)}건의 업무가 겹칩니다.`,
  ].filter(Boolean).join('\n');
}

export const POSITIONS = POSITION_DEFS.map(buildPosition);
export const POSITION = Object.fromEntries(POSITIONS.map((p) => [p.id, p]));

export const PEOPLE = POSITION_DEFS.flatMap((d) => [
  { ...d.giver, role: 'giver', positionId: d.id, unit: d.unit, dept: d.dept, title: d.title },
  { ...d.receiver, role: 'receiver', positionId: d.id, unit: d.unit, dept: d.dept, title: `${d.title} (인수 예정)` },
  { ...d.reviewer, role: 'reviewer', positionId: d.id, unit: d.unit, dept: d.dept },
]);
export const PERSON = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

export const giverOf = (pid) => PEOPLE.find((p) => p.positionId === pid && p.role === 'giver');
export const receiverOf = (pid) => PEOPLE.find((p) => p.positionId === pid && p.role === 'receiver');
export const reviewerOf = (pid) => PEOPLE.find((p) => p.positionId === pid && p.role === 'reviewer');
/** 입회자(부서장)가 입회할 직책 목록 — 지금은 부서장마다 1개, 부서원이 늘면 여러 개가 된다 */
export const positionsOfReviewer = (personId) => POSITIONS.filter((p) => p.def.reviewer.id === personId);

export const ROLES = {
  giver: { label: '인계하기', who: '전임자', badge: '인계자', desc: '업무 폴더로 인계서를 자동 작성해요' },
  receiver: { label: '인수하기', who: '후임자', badge: '인수자', desc: '이 자리의 1년 업무를 한눈에 봐요' },
  reviewer: { label: '입회하기', who: '부서장', badge: '입회자', desc: '인계인수에 입회하고 확인해요' },
};

/** 파일이 분석 대상인지 (UI 표시용) */
export const fileExcluded = (f) => isExcluded(f.name);
