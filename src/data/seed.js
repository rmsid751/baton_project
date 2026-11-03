// 더미 데이터 (모두 가상) — 업무 폴더 파일 목록, 온나라 문서 이력, 인사정보, 역대 인계서
// 리셋할 때마다 같은 결과가 나오도록 결정적으로 생성한다.
import { CATS, aggregate, classify, deptRows, docType, isExcluded, normalizeTitle, periodText, sortItems, weekLabel } from '../engine.js';
import { pad, periodLabel, rng } from '../util.js';
import { BAKED } from './baked-ai.js';

/*
 * 업무 정의 T(이름, 폴더번호(-1: 온나라만), 상위 하위폴더, 시기('all' 또는 월 목록), 옵션)
 *  files: 발생 1회당 만들어지는 파일명 틀   on: 발생 1회당 온나라 문서 제목 틀
 *  coop: 온나라 협조·수신 부서   hist: 역대 담당자 [직전, 전전, 전전전] 수행 여부
 *  cur:false → 이번 담당자 자료에 일부러 빠뜨린 업무 (빠진 업무 추천용)
 *  sp: 특이사항   imp: 역대 중요 표시   h: 역대 인계서 설명   hm: 역대 인계자 메모
 *  틀 토큰: {Y} {Y1}(다음해) {Yp}(전년) {Y4} {M} {MM} {DD} {H}(상/하반기) {Q}(분기)
 */
const T = (n, f, dir, m, o = {}) => ({ n, f, dir, m, d: 10, files: [], on: null, coop: [], hist: [1, 1, 1], cur: true, ...o });

const CYBER_H = '매월 셋째 주 사이버보안 진단의 날에 부서 PC 보안 점검을 시행하고 결과를 취합해 보고한다. 미조치 PC는 다음 달 점검 전까지 재점검한다.';

const POSITION_DEFS = [
  {
    id: 'p1',
    unit: '제99전투비행단',
    dept: '정보통신대대',
    title: '정보통신장교',
    intro: '기지 전화·PC·네트워크 등 정보통신 장비와 통신망을 운용하고, 회의·행사·연습의 통신을 지원하는 자리',
    giver: { id: 'g1', rank: '대위', name: '이준호', start: '2025-11-03', end: '2026-11-27' },
    receiver: { id: 'r1', rank: '대위', name: '김도윤' },
    reviewer: { id: 'v1', rank: '중령', name: '강태현', title: '정보통신대대장' },
    candidates: [
      { rank: '대위', name: '김도윤', note: '정보통신장교 인수 예정' },
    ],
    prev: [
      { rank: '대위', name: '박성민', start: '2024-11-01', end: '2025-10-31' },
      { rank: '대위', name: '최우진', start: '2023-11-01', end: '2024-10-31' },
      { rank: '대위', name: '송민재', start: '2022-11-01', end: '2023-10-31' },
    ],
    folders: ['PC·전화 등 통신장비 지원', '통신망·선로 관리', '회의·행사·연습 통신 지원'],
    excluded: [
      [0, ['04_현장 사진'], ['장비 교체 현장 사진_01.jpg', '장비 교체 현장 사진_02.jpg', '장비 교체 현장 사진_03.jpg'], '2025-12-12'],
      [0, ['02_장비 관리'], ['프린터 드라이버 설치파일.exe'], '2026-01-08'],
      [1, ['02_선로 관리'], ['선로 점검 사진_01.jpg', '선로 점검 사진_02.jpg'], '2026-06-11'],
      [2, ['03_행사 지원'], ['기념일 행사 사진_01.jpg', '기념일 행사 사진_02.jpg'], '2026-10-02'],
    ],
    tasks: [
      T('사이버보안 진단의 날 점검', 0, '01_정기 보고', 'all', { d: 17, files: ['{Y}년 {M}월 사이버보안 진단의 날 점검표.hwp'], on: ['{Y}년 {M}월 사이버보안 진단의 날 점검 결과 보고'], coop: ['작전과'], h: CYBER_H }),
      T('정보통신장비 운용·정비 현황 보고', 0, '01_정기 보고', 'all', { d: 4, files: ['{Y}.{MM} 정보통신장비 운용현황.xlsx'], on: ['{Y}년 {M}월 정보통신장비 운용·정비 현황 보고'], coop: ['보급대대'], h: '매월 초 전화기·PC·프린터 등 장비 보유·고장·정비 현황을 집계해 보고한다. 보급대대 장비 대장과 수량을 대조한다.' }),
      T('차년도 장비 소요 제기', 0, '02_장비 관리', [10], { d: 12, files: ['{Y1}년 정보통신장비 소요 제기(안).hwp', '{Y1}년 정보통신장비 소요 제기(수정).hwp', '{Y1}년 정보통신장비 소요 제기(최종).hwp'], on: ['{Y1}년도 정보통신장비 소요 제기'], coop: ['재정과', '보급대대'], imp: 1, h: '10월에 차년도 PC·전화기·네트워크 장비 소요를 부서별로 받아 재정과에 제기한다. 노후 장비 목록을 근거로 붙인다.', hm: '부서 의견 취합에 2주가 걸리니 9월 말에 미리 공지할 것' }),
      T('노후 장비 교체', 0, '02_장비 관리', [12], { d: 8, files: ['{Y}년 노후 PC 교체 대상 목록.xlsx', '{Y}년 노후 PC 교체 결과.hwp', '노후 장비 반납 확인서_{Y}{MM}{DD}.pdf'], hist: [1, 0, 1], h: '연말에 확보한 예산으로 노후 PC·전화기를 교체하고 반납 장비를 보급대대에 넘긴다.' }),
      T('부대 전화번호부 정비', 0, '02_장비 관리', [3, 9], { d: 10, files: ['{Y}년 {M}월 부대 전화번호부.xlsx', '전화번호부 변경 요청 취합_{Y}{MM}.xlsx'], hist: [1, 1, 0], h: '3월·9월 인사이동 뒤 부서별 전화번호 변경을 받아 전화번호부를 다시 배포한다.' }),
      T('사용자 PC 장애 조치', 0, '03_장애 조치', [5], { d: 14, sp: 1, files: ['{Y}{MM}{DD} 사용자 PC 랜섬웨어 의심 장애 조치 결과.hwp', '{Y}{MM}{DD} PC 장애 조치 경과 메모.txt'], hist: [0, 1, 0], h: '랜섬웨어 의심 PC 장애가 있어 망에서 분리한 뒤 재설치로 복구했다. 같은 증상이면 즉시 망에서 분리한다.' }),
      T('네트워크 운용 상태 점검', 1, '01_망 운용', 'all', { d: 24, files: ['{Y}{MM} 국방망·인터넷망 운용 점검 결과.hwp'], on: ['{Y}년 {M}월 네트워크(국방망·인터넷망) 운용 상태 점검 결과 보고'], coop: ['작전과'], h: '매월 넷째 주 국방망·인터넷망 회선 상태와 장애 건수를 점검해 보고한다.' }),
      T('통신보안 분기 측정', 1, '01_망 운용', [1, 4, 7, 10], { d: 20, files: ['{Y}년 {Q}분기 통신보안 측정 결과.hwp'], h: '분기 첫 달에 유선·무선 통신보안 측정을 받고 결과와 조치 사항을 정리한다.' }),
      T('교환기·광케이블 선로 정기 점검', 1, '02_선로 관리', 'all', { d: 10, files: ['선로 점검표_{Y}{MM}.xlsx'], imp: 1, h: '매월 둘째 주 교환기 상태와 광케이블·유선 선로 구간을 점검하고 점검표를 남긴다.', hm: '시설대대 굴착 공사 일정은 매월 초에 먼저 받아 둘 것' }),
      T('장마철 대비 광케이블 선로 점검', 1, '02_선로 관리', [6], { d: 9, files: ['{Y}년 장마철 대비 선로 점검 계획.hwp', '{Y}년 장마철 선로 점검 결과.hwp', '맨홀 배수 점검표_{Y}{MM}.xlsx'], on: ['{Y}년 장마철 대비 광케이블 선로 점검 결과 보고'], coop: ['시설대대'], h: '6월 장마 전에 맨홀 배수와 광케이블 접속함 방수 상태를 시설대대와 함께 점검한다.' }),
      T('굴착 공사 선로 협조', 1, '02_선로 관리', [4, 8], { d: 15, files: ['{Y}{MM}{DD} 굴착공사 선로 위치 확인 회의록.hwp'], hist: [0, 1, 1], h: '시설대대 굴착 공사 전에 선로 매설 위치를 현장에서 함께 확인한다.' }),
      T('광케이블 단선 복구', 1, '03_장애 복구', [7], { d: 20, sp: 1, files: ['{Y}{MM}{DD} 광케이블 단선 장애 복구 결과.hwp', '광케이블 단선 구간 위치도_{Y}{MM}.pptx', '단선 복구 업체 작업 확인서_{Y}{MM}{DD}.pdf'], on: ['광케이블 단선 장애 복구 결과 보고'], coop: ['시설대대'], hist: [1, 0, 0], imp: 1, h: '활주로 인근 공사 중 광케이블이 끊겨 임시 회선으로 우회한 뒤 복구했다.' }),
      T('교환기 장애 조치', 1, '03_장애 복구', [2], { d: 6, sp: 1, files: ['{Y}{MM}{DD} 교환기 장애 조치 기록.hwp', '교환기 장애 로그_{Y}{MM}{DD}.txt'], hist: [1, 1, 0], h: '교환기 카드 고장으로 일부 내선이 끊겨 예비 카드로 교체했다. 예비 카드는 교환기실 보관함에 있다.' }),
      T('지휘관 회의 브리핑 장비 지원', 2, '01_회의 지원', 'all', { d: 2, files: ['{Y}.{MM} 지휘관회의 브리핑 장비 점검표.hwp'], h: '매월 첫 주 지휘관 회의 전날 음향·빔프로젝터·영상회의 장비를 점검하고 당일 현장을 지원한다.' }),
      T('영상회의 장비 점검', 2, '01_회의 지원', 'all', { d: 12, skip: [1, 8], files: ['영상회의 장비 점검표_{Y}{MM}.xlsx'], hist: [1, 1, 0], h: '영상회의실 코덱·카메라·마이크 상태를 매월 점검한다.' }),
      T('자유의 방패(FS) 연습 통신 지원', 2, '02_연습 지원', [3], { d: 3, files: ['{Y}년 FS 연습 통신지원 계획.hwp', '{Y}년 FS 연습 회선 구성도.pptx', '{Y}년 FS 연습 통신지원 결과.hwp'], on: ['{Y}년 자유의 방패(FS) 연습 통신지원 계획', '{Y}년 자유의 방패(FS) 연습 통신지원 결과 보고'], coop: ['작전과'], imp: 1, h: '3월 FS 연습 기간에 지휘통제실 임시 회선과 전화를 개통하고 연습 후 철거한다. 작전과 연습 통제 계획을 먼저 받는다.' }),
      T('을지 자유의 방패(UFS) 연습 통신 지원', 2, '02_연습 지원', [8], { d: 4, files: ['{Y}년 UFS 연습 통신지원 계획(안).hwp', '{Y}년 UFS 연습 통신지원 계획(최종).hwp', '{Y}년 UFS 연습 회선 구성도.pptx', '{Y}년 UFS 연습 통신지원 결과 및 교훈.hwp'], on: ['{Y}년 을지 자유의 방패(UFS) 연습 통신지원 계획', '{Y}년 UFS 연습 임시 회선 구성 협조', '{Y}년 을지 자유의 방패(UFS) 연습 통신지원 결과 보고'], coop: ['작전과', '시설대대'], imp: 1, h: '8월 UFS 연습에 맞춰 7월 말까지 통신지원 계획을 세우고 작전과·시설대대와 임시 회선 구성을 협조한다. 결과 보고에 교훈을 정리한다.', hm: '계획은 전년도 최종본과 결과 및 교훈 문서를 함께 보고 고칠 것' }),
      T('부대 기념일 행사 음향·영상 지원', 2, '03_행사 지원', [10], { d: 1, files: ['{Y}년 부대 기념일 행사 음향·영상 지원 계획.hwp', '{Y}년 부대 기념일 행사 장비 배치도.pptx', '행사 리허설 점검표_{Y}{MM}.xlsx'], on: ['{Y}년 부대 기념일 행사 통신·음향 지원 계획'], coop: ['기획처'], h: '10월 부대 기념일 행사의 음향·영상 장비를 배치하고 리허설부터 지원한다.' }),
      T('지휘관 이·취임식 통신 지원', 2, '03_행사 지원', [6], { d: 20, files: ['{Y}{MM}{DD} 지휘관 이·취임식 음향 지원 계획.hwp', '이·취임식 장비 점검표_{Y}{MM}.xlsx', '이·취임식 중계 회선 신청_{Y}{MM}.hwp'], hist: [0, 1, 1], h: '지휘관 이·취임식 음향과 중계 회선을 지원한다.' }),
      T('행사 중 음향 장애 조치', 2, '03_행사 지원', [10], { d: 2, sp: 1, files: ['{Y}{MM}{DD} 기념일 행사 음향 장애 조치 경과.hwp'], hist: [0, 0, 1], h: '행사 중 무선 마이크 간섭으로 음향 장애가 있어 예비 유선 마이크로 바꿨다.' }),
      T('동절기 대비 통신 선로 점검', -1, '', [12], { cur: false, coop: ['시설대대'], hist: [1, 1, 1], h: '12월 한파 전에 옥외 선로·접속함 보온 상태와 교환기실 난방을 점검한다.' }),
      T('정보통신장비 재물조사', -1, '', [6, 12], { cur: false, coop: ['보급대대'], hist: [1, 1, 0], h: '6월·12월에 정보통신장비 재물조사로 장비 대장과 실물을 맞춘다.' }),
    ],
  },
  {
    id: 'p2',
    unit: '제22훈련비행단',
    dept: '인사처',
    title: '인사장교',
    intro: '전입·전출 인사명령과 정기 보직 이동, 진급·근무평정·장기복무 선발, 부대 행사 의전을 맡는 자리',
    giver: { id: 'g2', rank: '소령', name: '정민수', start: '2025-11-03', end: '2026-11-27' },
    receiver: { id: 'r2', rank: '소령', name: '한지훈' },
    reviewer: { id: 'v2', rank: '대령', name: '서영훈', title: '인사처장' },
    candidates: [
      { rank: '소령', name: '한지훈', note: '인사장교 인수 예정' },
    ],
    prev: [
      { rank: '소령', name: '김재원', start: '2024-11-01', end: '2025-10-31' },
      { rank: '소령', name: '장현석', start: '2023-11-01', end: '2024-10-31' },
      { rank: '소령', name: '노진우', start: '2022-11-01', end: '2023-10-31' },
    ],
    folders: ['인사명령·전입전출', '진급·근무평정·장기복무', '부대 행사·의전'],
    excluded: [
      [0, ['02_보직 관리'], ['보직 이동 설명회 사진_01.jpg', '보직 이동 설명회 사진_02.jpg'], '2026-01-15'],
      [1, ['01_진급'], ['진급 축하 사진_01.jpg', '진급 축하 사진_02.jpg'], '2026-05-02'],
      [2, ['02_기념 행사'], ['기념일 행사 사진_01.jpg', '기념일 행사 사진_02.jpg', '이·취임식 사진_01.jpg'], '2026-05-20'],
    ],
    tasks: [
      T('사이버보안 진단의 날 점검', 0, '04_정기 보고', 'all', { d: 17, files: ['{Y}년 {M}월 사이버보안 진단의 날 점검표.hwp'], on: ['{Y}년 {M}월 사이버보안 진단의 날 점검 결과 보고'], coop: ['운영통제실'], h: CYBER_H }),
      T('전입·전출 인사명령 처리', 0, '01_인사명령', 'all', { d: 8, files: ['{Y}{MM} 전입전출 명령 대상자 명단.xlsx'], on: ['{Y}년 {M}월 전입·전출 인사명령'], coop: ['운영통제실'], imp: 1, h: '매월 둘째 주까지 전입·전출 대상자를 확정해 인사명령을 내고 예하 전대·대대 운영통제실에 통보한다.', hm: '명령 발령 전에 대상자 본인 확인 전화를 꼭 할 것' }),
      T('공문 접수·분류·배부', 0, '03_민원·문서', 'all', { d: 26, skip: [1, 8], files: ['공문 접수 대장_{Y}{MM}.xlsx'], h: '인사처로 들어오는 공문을 접수해 담당별로 분류·배부하고 대장을 정리한다.' }),
      T('상·하반기 정기 보직 이동', 0, '02_보직 관리', [1, 7], { d: 10, files: ['{Y}년 {H} 정기 보직 이동 계획.hwp', '{Y}년 {H} 보직 이동 대상자 현황.xlsx'], on: ['{Y}년 {H} 정기 보직 이동 명령'], coop: ['운영통제실'], imp: 1, h: '1월·7월 정기 보직 이동 계획을 세우고 대상자 현황을 정리해 명령을 낸다.' }),
      T('신규 전입자 안내 교육', 0, '02_보직 관리', [3, 9], { d: 5, files: ['{Y}년 {M}월 신규 전입자 안내 교육 자료.pptx'], hist: [1, 0, 1], h: '보직 이동 뒤 신규 전입자에게 부대 생활·인사 절차를 안내한다.' }),
      T('인사 민원 처리 사례', 0, '03_민원·문서', [5], { d: 14, sp: 1, files: ['{Y}{MM}{DD} 인사 민원 처리 결과(특이).hwp', '민원 처리 경과_{Y}{MM}{DD}.hwp'], hist: [1, 1, 0], h: '보직 이동 관련 민원이 접수되어 법무실 검토를 거쳐 처리했다.' }),
      T('월간 인력 현황 보고', -1, '', 'all', { d: 3, on: ['{Y}년 {M}월 인력 현황 보고'], coop: ['재정과(보수)'], h: '매월 초 정원·현원 인력 현황을 보고하고 보수 담당에 변동 인원을 알린다.' }),
      T('진급 대상자 현황 관리', 1, '01_진급', 'all', { d: 14, skip: [2, 9], files: ['진급 대상자 현황_{Y}{MM}.xlsx'], h: '진급 대상자 현황을 매월 갱신한다.' }),
      T('근무평정 대상자 명부 관리', 1, '02_근무평정', 'all', { d: 20, skip: [4, 11], files: ['근무평정 대상자 명부_{Y}{MM}.xlsx'], hist: [1, 1, 0], h: '근무평정 대상자 명부를 매월 갱신한다.' }),
      T('정기 진급 추천', 1, '01_진급', [4], { d: 12, files: ['{Y}년 정기 진급 추천 계획.hwp', '{Y}년 진급 추천 심의 자료(최종).hwp', '{Y}년 진급 추천 결과.hwp', '진급 추천 대상자 징계 조회_{Y}{MM}.xlsx'], on: ['{Y}년 정기 진급 추천 계획', '{Y}년 정기 진급 추천 결과 보고'], coop: ['법무실'], imp: 1, h: '4월 정기 진급 추천 계획을 세우고 법무실에 징계 사실을 조회한 뒤 심의 자료를 만든다.' }),
      T('상반기 근무평정', 1, '02_근무평정', [6], { d: 15, files: ['{Y}년 상반기 근무평정 계획.hwp', '{Y}년 상반기 근무평정 취합.xlsx', '{Y}년 상반기 근무평정 결과.hwp', '근무평정 이의 신청 접수_{Y}{MM}.hwp'], on: ['{Y}년 상반기 근무평정 시행 계획'], coop: ['운영통제실'], h: '6월 상반기 근무평정을 시행하고 예하 부대 평정 결과를 취합한다.' }),
      T('장기복무 선발 공고·접수', 1, '03_장기복무', [8], { d: 6, files: ['{Y}년 장기복무 지원 공고.hwp', '{Y}년 장기복무 지원자 접수 현황.xlsx', '장기복무 지원서 양식_{Y}.hwp', '{Y}년 장기복무 지원자 면담 일정.xlsx'], h: '8월 장기복무 지원 공고를 내고 지원서를 접수한다.' }),
      T('분기 인력 운영 분석', 1, '04_인력 분석', [3, 6, 9, 12], { d: 24, files: ['{Y}년 {Q}분기 인력 운영 분석.xlsx'], hist: [1, 1, 0], h: '분기 말에 보직·결원·진급 대상 현황을 분석해 처장에게 보고한다.' }),
      T('근무평정 감사 지적사항 조치', 1, '02_근무평정', [10], { d: 16, sp: 1, files: ['{Y}{MM}{DD} 근무평정 감사 지적사항 조치 결과.hwp', '감사 지적사항 조치 계획_{Y}{MM}.hwp'], hist: [0, 1, 0], h: '근무평정 서류 보관 기간에 대한 감사 지적이 있어 보관 절차를 고쳤다.' }),
      T('월간 부대 일정·의전 계획', 2, '01_월간 일정', 'all', { d: 25, files: ['{Y}.{MM} 월간 부대 일정 및 의전 계획.hwp'], h: '매월 말 다음 달 부대 일정과 내빈 의전 계획을 정리한다.' }),
      T('경조사 지원 현황 관리', 2, '01_월간 일정', 'all', { d: 27, skip: [3, 10], files: ['경조사 지원 현황_{Y}{MM}.xlsx'], hist: [1, 0, 1], h: '장병 경조사 지원 현황을 매월 정리한다.' }),
      T('부대 기념일 행사·의전', 2, '02_기념 행사', [5], { d: 8, files: ['{Y}년 부대 기념일 행사 계획(안).hwp', '{Y}년 부대 기념일 행사 계획(최종).hwp', '{Y}년 기념일 행사 의전 배치도.pptx', '{Y}년 기념일 행사 내빈 명단.xlsx'], on: ['{Y}년 부대 기념일 행사 계획', '{Y}년 부대 기념일 행사 결과 보고'], coop: ['정훈공보실'], imp: 1, h: '5월 부대 기념일 행사 계획과 내빈 의전을 맡고 정훈공보실과 홍보를 협조한다.' }),
      T('지휘관 이·취임식 의전', 2, '02_기념 행사', [11], { d: 6, files: ['{Y}년 지휘관 이·취임식 계획.hwp', '이·취임식 의전 순서_{Y}{MM}.hwp', '이·취임식 초청 명단_{Y}{MM}.xlsx'], on: ['{Y}년 지휘관 이·취임식 시행 계획'], coop: ['정훈공보실'], hist: [0, 1, 1], h: '지휘관 이·취임식 의전 순서와 초청 명단을 준비한다.' }),
      T('신년 하례식 의전', 2, '02_기념 행사', [1], { d: 3, files: ['{Y}년 신년 하례식 계획.hwp', '신년 하례식 좌석 배치도_{Y}.pptx', '신년 하례식 참석자 명단_{Y}.xlsx'], h: '1월 첫 주 신년 하례식 좌석 배치와 참석자를 정리한다.' }),
      T('제대군인 지원', 2, '03_전역 지원', [12], { d: 10, sp: 1, files: ['{Y}년 전역 예정자 제대군인 지원 상담 결과.hwp', '제대군인 지원 상담 일지_{Y}{MM}.hwp'], h: '전역 예정자의 제대군인 지원 상담을 연결하고 결과를 남긴다.' }),
      T('장기복무 선발 심의 자료 준비', -1, '', [9], { cur: false, coop: ['운영통제실'], hist: [1, 1, 1], imp: 1, h: '9월 장기복무 선발 심의위원회 전에 지원자 평정·경력 자료를 묶어 심의 자료를 만든다.' }),
      T('하반기 근무평정 취합', -1, '', [12], { cur: false, coop: ['운영통제실'], hist: [1, 1, 0], h: '12월 하반기 근무평정 결과를 예하 부대에서 받아 취합한다.' }),
    ],
  },
  {
    id: 'p3',
    unit: '제00사령부',
    dept: '재정처',
    title: '예산담당',
    intro: '예산 편성·결산과 집행·출납 관리, 예하부대 예산 배정을 맡는 자리',
    giver: { id: 'g3', rank: '중령', name: '윤성철', start: '2025-11-03', end: '2026-11-27' },
    receiver: { id: 'r3', rank: '중령', name: '오세영' },
    reviewer: { id: 'v3', rank: '대령', name: '문재석', title: '재정처장' },
    candidates: [
      { rank: '중령', name: '오세영', note: '예산담당 인수 예정' },
    ],
    prev: [
      { rank: '중령', name: '고명진', start: '2024-11-01', end: '2025-10-31' },
      { rank: '중령', name: '백승훈', start: '2023-11-01', end: '2024-10-31' },
      { rank: '중령', name: '염동규', start: '2022-11-01', end: '2023-10-31' },
    ],
    folders: ['예산 편성·결산', '집행·출납 관리', '예하부대 배정·재배정'],
    excluded: [
      [0, ['01_정기 보고'], ['예산 회의 사진_01.jpg', 'ERP 보안모듈 설치.exe'], '2026-02-04'],
      [1, ['03_계약·감사'], ['계약 현장 사진_01.jpg', '계약 현장 사진_02.jpg'], '2026-08-21'],
      [2, ['03_교육·감사'], ['예산 교육 사진_01.jpg', '예산 교육 사진_02.jpg'], '2026-02-25'],
    ],
    tasks: [
      T('사이버보안 진단의 날 점검', 0, '01_정기 보고', 'all', { d: 17, files: ['{Y}년 {M}월 사이버보안 진단의 날 점검표.hwp'], on: ['{Y}년 {M}월 사이버보안 진단의 날 점검 결과 보고'], coop: ['기획과'], h: CYBER_H }),
      T('예산 편성 동향 정리', 0, '03_예산요구', 'all', { d: 25, skip: [2, 3], files: ['예산 편성 동향_{Y}{MM}.hwp'], hist: [1, 1, 0], h: '상급 부대 예산 편성 지침과 동향을 매월 정리한다.' }),
      T('전년도 결산', 0, '02_결산', [2], { d: 12, files: ['{Yp}회계연도 결산 계획.hwp', '{Yp}회계연도 결산 보고서(초안).hwp', '{Yp}회계연도 결산 보고서(최종).hwp', '{Yp}회계연도 결산 부속서류.xlsx'], on: ['{Yp}회계연도 결산 계획', '{Yp}회계연도 결산 보고'], coop: ['기획과'], imp: 1, h: '2월에 전년도 회계연도 결산 보고서와 부속서류를 만들어 보고한다.', hm: '부속서류 양식이 매년 조금씩 바뀌니 1월 지침을 먼저 확인할 것' }),
      T('차년도 예산요구서 작성·제출', 0, '03_예산요구', [3], { d: 18, files: ['{Y1}년도 예산요구서(안).hwp', '{Y1}년도 예산요구서(최종).hwp', '{Y1}년도 사업별 소요 산출 근거.xlsx', '{Y1}년도 예산요구 부서 의견 취합.xlsx'], on: ['{Y1}년도 예산요구서 제출', '{Y1}년도 군수 분야 예산 소요 협조'], coop: ['기획과', '군수과'], imp: 1, h: '3월에 차년도 예산요구서를 작성해 제출한다. 사업별 소요 산출 근거를 함께 붙인다.' }),
      T('결산 감사 지적사항 조치', 0, '02_결산', [4], { d: 14, sp: 1, files: ['{Y}{MM}{DD} 결산 감사 지적사항 조치 결과.hwp', '결산 감사 지적사항 목록_{Y}.xlsx'], hist: [1, 0, 0], h: '결산 감사에서 증빙 누락 지적이 있어 보완 조치했다.' }),
      T('중기 재원 소요 검토', 0, '03_예산요구', [6], { d: 18, files: ['{Y}-{Y4} 중기 재원 소요 검토.hwp', '중기 재원 소요 산출표_{Y}.xlsx', '중기 재원 검토 회의자료_{Y}{MM}.pptx'], hist: [0, 1, 1], h: '6월에 향후 5년 중기 재원 소요를 검토한다.' }),
      T('예산 집행실적 보고', 1, '01_집행 실적', 'all', { d: 4, files: ['{Y}.{MM} 예산 집행실적.xlsx'], on: ['{Y}년 {M}월 예산 집행실적 보고'], coop: ['기획과'], h: '매월 초 전월 예산 집행실적을 집계해 보고한다.' }),
      T('국방통합재정정보시스템(ERP) 자금 출납 점검', 1, '02_출납 점검', 'all', { d: 27, files: ['국방통합재정정보시스템 출납 점검표_{Y}{MM}.xlsx'], imp: 1, h: '매월 말 국방통합재정정보시스템(ERP)의 자금 출납 내역과 잔액을 점검한다.', hm: '월말 마감 전날 오후에 점검해야 수정할 시간이 있음' }),
      T('증빙서류 규정 검토', 1, '02_출납 점검', 'all', { d: 18, skip: [1, 7], files: ['증빙서류 규정 검토 결과_{Y}{MM}.hwp'], hist: [1, 1, 0], h: '지출 증빙서류가 규정에 맞는지 매월 표본 검토한다.' }),
      T('입찰·계약 관련 지적사항 조치', 1, '03_계약·감사', [8], { d: 20, sp: 1, files: ['{Y}{MM}{DD} 입찰·계약 지적사항 조치 결과.hwp', '계약 지적사항 조치 계획_{Y}{MM}.hwp'], on: ['입찰·계약 관련 지적사항 조치 결과 보고'], coop: ['계약과'], hist: [0, 1, 1], h: '입찰 공고 기간 미준수 지적이 있어 계약과와 절차를 보완했다.' }),
      T('불용액 발생 사유 소명', 1, '01_집행 실적', [11], { d: 10, sp: 1, files: ['{Y}년 불용액 발생 사유서.hwp', '불용 예상액 산출_{Y}{MM}.xlsx'], on: ['{Y}년 불용액 발생 사유 소명'], coop: ['기획과'], hist: [1, 1, 0], h: '불용액이 발생한 사업의 사유를 정리해 소명했다.' }),
      T('분기 예하부대 예산 배정', 2, '01_예산 배정', [1, 4, 7, 10], { d: 7, files: ['{Y}년 {Q}분기 예하부대 예산 배정.xlsx'], on: ['{Y}년 {Q}분기 예하부대 예산 배정'], coop: ['예하부대 재정'], imp: 1, h: '분기 첫 달에 예하부대별 예산을 배정하고 통보한다.' }),
      T('예하부대 집행 현황 취합', 2, '02_집행 현황', 'all', { d: 9, files: ['예하부대 집행 현황 취합_{Y}{MM}.xlsx'], h: '예하부대 예산 집행 현황을 매월 받아 취합한다.' }),
      T('재정 담당자 회의', 2, '02_집행 현황', 'all', { d: 22, skip: [8, 12], files: ['{Y}.{MM} 예하부대 재정 담당자 회의자료.pptx'], hist: [1, 0, 1], h: '예하부대 재정 담당자 회의를 매월 열어 집행 이슈를 공유한다.' }),
      T('군수 물자 구매 예산 협조', 2, '01_예산 배정', [5], { d: 13, files: ['{Y}년 군수 물자 구매 예산 협조 요청.hwp', '군수 물자 구매 소요 검토_{Y}{MM}.xlsx', '{Y}년 구매 예산 배정 결과.hwp'], on: ['{Y}년 군수 물자 구매 예산 협조', '{Y}년 구매 계약 예산 확인'], coop: ['군수과', '계약과'], h: '5월 군수 물자 구매 예산을 군수과·계약과와 협조해 배정한다.' }),
      T('예하부대 회계 감사 지적 조치', 2, '03_교육·감사', [9], { d: 16, sp: 1, files: ['{Y}{MM}{DD} 예하부대 회계 감사 지적 조치 결과.hwp', '회계 감사 지적 목록_{Y}{MM}.xlsx'], hist: [0, 1, 1], h: '예하부대 회계 감사 지적사항의 조치 결과를 확인했다.' }),
      T('예하부대 예산 교육', 2, '03_교육·감사', [2], { d: 24, files: ['{Y}년 예하부대 예산 집행 교육 자료.pptx', '예산 교육 참석자 명단_{Y}.xlsx', '예산 교육 질의응답 정리_{Y}.hwp'], h: '2월에 예하부대 재정 담당자 대상 예산 집행 교육을 한다.' }),
      T('월간 자금 운용 계획 보고', -1, '', 'all', { d: 2, on: ['{Y}년 {M}월 자금 운용 계획 보고'], coop: ['예하부대 재정'], h: '매월 초 자금 운용 계획을 보고한다.' }),
      T('분기 예하부대 예산 재배정', -1, '', [3, 6, 9, 12], { cur: false, coop: ['예하부대 재정'], hist: [1, 1, 1], imp: 1, h: '분기 말 예하부대 집행 실적을 보고 남는 예산을 다시 배정한다.' }),
      T('연말 이월·불용 정리', -1, '', [12], { cur: false, coop: ['기획과'], hist: [1, 1, 0], h: '12월에 이월·불용 예정액을 정리해 보고한다.' }),
    ],
  },
];

const ROUTINE_ORDER = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function fill(tpl, y, m, d) {
  const map = { Y: y, Y1: y + 1, Yp: y - 1, Y4: y + 4, M: m, MM: pad(m), DD: pad(d), H: m <= 6 ? '상반기' : '하반기', Q: Math.ceil(m / 3) };
  return tpl.replace(/\{(\w+)\}/g, (s, k) => (k in map ? map[k] : s));
}

const occMonths = (t) => (t.m === 'all' ? ROUTINE_ORDER.filter((m) => !(t.skip || []).includes(m)) : t.m);
const curYear = (m) => (m === 12 ? 2025 : 2026);

function dayOf(base, y, m, r, extra = 0) {
  let d = Math.min(28, Math.max(1, base + Math.round(r() * 4 - 2) + extra));
  if (y === 2026 && m === 11) d = Math.min(d, 18); // 오늘(11-20) 이전
  return d;
}

/** 역대 인계서 항목 분류 — 현재 인계서와 같은 규칙(classify)을 쓴다 */
function histCategory(t) {
  return classify({ special: !!t.sp, ratio: t.m === 'all' ? 1 : t.m.length / 12, moy: t.m === 'all' ? [] : [...t.m].sort((a, b) => a - b) });
}

function buildPosition(def, pi) {
  const r = rng(1000 + pi * 97);
  const files = [];
  const onnara = [];
  let fn = 0;
  let on = 0;
  const leafName = new Map();

  // 하위 폴더 번호 매기기 (상위 폴더 안에서 01_, 02_ …)
  const leafCounter = new Map();
  for (const t of def.tasks) {
    if (t.f < 0 || !t.cur) continue;
    const k = `${t.f}/${t.dir}`;
    const n = (leafCounter.get(k) || 0) + 1;
    leafCounter.set(k, n);
    leafName.set(t, `${pad(n)}_${t.n}`);
  }

  for (const t of def.tasks) {
    if (!t.cur) continue;
    const tags = t.sp && !/(장애|사고|복구|감사|지적)/.test(t.n) ? ['특이'] : [];
    for (const m of occMonths(t)) {
      const y = curYear(m);
      if (t.f >= 0) {
        t.files.forEach((tpl, k) => {
          const d = dayOf(t.d, y, m, r, k * 2);
          files.push({
            id: `${def.id}-f${++fn}`,
            folder: t.f,
            path: [t.dir, leafName.get(t)],
            name: fill(tpl, y, m, d),
            date: `${y}-${pad(m)}-${pad(d)}`,
            tags,
          });
        });
      }
      (t.on || []).forEach((tpl, k) => {
        const d = dayOf(t.d, y, m, r, 2 + k * 3);
        onnara.push({
          id: `${def.id}-o${++on}`,
          title: fill(tpl, y, m, d),
          date: `${y}-${pad(m)}-${pad(d)}`,
          type: docType(tpl),
          coop: t.coop,
          workKey: t.n,
          tags,
        });
      });
    }
  }
  // 근무기간 이전(전임자 시기) 온나라 문서 — 근무기간 기준 연동에서 걸러져야 한다
  def.tasks.filter((t) => t.on && t.m === 'all').slice(0, 2).forEach((t) => {
    for (const m of [9, 10]) {
      onnara.push({ id: `${def.id}-o${++on}`, title: fill(t.on[0], 2025, m, t.d), date: `2025-${pad(m)}-${pad(t.d)}`, type: docType(t.on[0]), coop: t.coop, workKey: t.n, tags: [] });
    }
  });
  for (const [folder, path, names, date] of def.excluded) {
    for (const name of names) files.push({ id: `${def.id}-f${++fn}`, folder, path, name, date, tags: [] });
  }

  // 역대 인계서
  const history = def.prev.map((pp, i) => {
    const off = i + 1;
    const hid = `${def.id}-h${i}`;
    const items = [];
    def.tasks.forEach((t, ti) => {
      if (!t.hist[i]) return;
      const category = histCategory(t);
      const months = t.m === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : t.m;
      const period = periodText(category, months, category === 'routine' ? weekLabel(t.d) : null);
      const occ = occMonths(t);
      const docs = [];
      const srcs = [...(t.files || []).slice(0, 2).map((x) => ['folder', x]), ...(t.on || []).slice(0, 2).map((x) => ['onnara', x])];
      const sampleMonths = t.m === 'all' ? [occ[occ.length - 2], occ[occ.length - 1]] : occ.slice(0, 2);
      for (const m of sampleMonths) {
        const y = curYear(m) - off;
        for (const [src, tpl] of srcs.slice(0, 3)) {
          docs.push({ id: `${hid}-d${ti}-${docs.length}`, src, title: fill(tpl, y, m, t.d), date: `${y}-${pad(m)}-${pad(t.d)}` });
        }
        if (t.m !== 'all') break;
      }
      items.push({
        id: `${hid}-i${ti}`,
        key: normalizeTitle(t.n),
        category,
        title: t.n,
        months,
        period,
        desc: t.h || `${period}에 처리하는 업무입니다.`,
        depts: [...t.coop],
        docs,
        important: !!t.imp && (i !== 2 || ti % 2 === 0),
        memo: i === 0 && t.hm ? t.hm : '',
        source: 'auto',
      });
    });
    // 온나라 문서 수·발신 수 (그 담당자 근무기간에 해당 업무로 오간 온나라 문서 수)
    const docCounts = {};
    def.tasks.forEach((t) => {
      if (!t.hist[i] || !t.coop.length) return;
      const n = (t.on ? t.on.length : 1) * (t.m === 'all' ? 12 : t.m.length);
      for (const c of t.coop) docCounts[c] = (docCounts[c] || 0) + n;
    });
    const person = { id: `${def.id}-prev${i}`, ...pp };
    return {
      id: hid,
      person,
      start: pp.start,
      end: pp.end,
      periodLabel: periodLabel(pp.start, pp.end),
      approvedAt: `${pp.end.slice(0, 4)}-${pp.end.slice(5, 7)}-${pad(20 + i)}T16:${pad(10 + i * 7)}:00`,
      items: sortItems(items),
      docCounts,
      qa: [],
    };
  });

  history.forEach((h, i) => { h.qa = buildHistoryQA(h, i, def); });
  // Gemini로 미리 만든 브리핑이 있으면 그것을 쓰고, 없으면 규칙으로 조합한 문장을 쓴다
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

const QA_TPL = [
  {
    q: (t) => `${t.title}은(는) 언제부터 준비하면 되나요?`,
    ai: (t) => `인계서 기준으로 **${t.title}**은(는) **${t.period}**에 처리합니다. ${t.desc}`,
    giver: null,
  },
  {
    q: (t) => `${t.title} 하면서 따로 챙기셨던 부분이 있을까요?`,
    ai: (t) => `인계서에는 ${t.desc} 이 외의 경험은 인계서에 없어 전임자 답변이 필요합니다.`,
    giver: (t) => (t.memo ? `${t.memo}. 처음엔 작년 문서를 그대로 따라 하면 됩니다.` : '작년 문서를 기준으로 하면 됩니다. 협조 부서 담당자에게 일정을 미리 알려 두면 훨씬 수월합니다.'),
  },
  {
    q: (t) => `${t.title} 관련 근거 문서는 어디에 있나요?`,
    ai: (t) => `**${t.title}** 항목의 근거 문서는 ${t.docs[0] ? `'${t.docs[0].title}'` : '업무 폴더'}입니다. 같은 이름의 하위 폴더에 정리되어 있습니다.`,
    giver: null,
  },
];

function buildHistoryQA(h, i, def) {
  const prevNext = def.prev[i - 1];
  const asker = prevNext ? `${prevNext.rank} ${prevNext.name}` : `${def.giver.rank} ${def.giver.name}`;
  const picks = [...h.items].sort((a, b) => Number(b.important) - Number(a.important)).slice(i, i + 3);
  const out = [];
  picks.forEach((t, k) => {
    const tpl = QA_TPL[(k + i) % QA_TPL.length];
    const at = `${h.end.slice(0, 7)}-${pad(22 + k)}T${pad(9 + k)}:20:00`;
    const root = { id: `${h.id}-q${k}`, itemId: t.id, parentId: null, authorType: 'receiver', authorName: asker, text: tpl.q(t), at, forwarded: !!tpl.giver };
    out.push(root);
    out.push({ id: `${root.id}-ai`, itemId: t.id, parentId: root.id, authorType: 'ai', text: tpl.ai(t), at, found: true, refs: { items: [t.id], docs: t.docs.slice(0, 1).map((d) => d.id) } });
    if (tpl.giver) {
      out.push({ id: `${root.id}-g`, itemId: t.id, parentId: root.id, authorType: 'giver', authorName: `${h.person.rank} ${h.person.name}`, text: tpl.giver(t), at: `${at.slice(0, 11)}${pad(14 + k)}:05:00` });
    }
  });
  return out;
}

const josa = (w) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '을' : '를';
};

/** 이전 담당자 탭용 AI 브리핑 미리 생성본 */
function personBriefing(def, items, person) {
  const work = items;
  const routines = work.filter((i) => i.category === 'routine').slice(0, 3).map((i) => `**${i.title}**`);
  const periodic = work.filter((i) => i.category === 'quarterly' || i.category === 'semiannual').slice(0, 2).map((i) => `${i.title}(${CATS[i.category].short})`);
  const events = work.filter((i) => i.category === 'event').slice(0, 3).map((i) => `${i.months.join('·')}월 ${i.title}`);
  const imp = work.filter((i) => i.important).slice(0, 2).map((i) => i.title);
  const depts = deptRows(items).slice(0, 3).map((d) => d.name);
  const lines = [
    `이 자리는 ${def.intro}입니다.`,
    `매월 ${routines.join(', ')} 등 루틴 업무가 이어지고${periodic.length ? `, ${periodic.join(', ')}도 주기적으로 돌아옵니다` : ''}.`,
    events.length ? `연간 일정으로는 ${events.join(', ')}${josa(events[events.length - 1])} 챙겨야 합니다.` : null,
    imp.length ? `${person.rank} ${person.name}은(는) **${imp.join('**, **')}**${josa(imp[imp.length - 1])} 중요 업무로 표시했습니다.` : null,
    depts.length ? `주요 협조 부서는 ${depts.join(', ')}입니다.` : null,
  ].filter(Boolean);
  return lines.slice(0, 5).join('\n');
}

/** 전체 합산 탭용 AI 브리핑 미리 생성본 */
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

export const ROLES = {
  giver: { label: '인계하기', who: '전임자', badge: '인계자', desc: '업무 폴더로 인계서를 자동 작성해요' },
  receiver: { label: '인수하기', who: '후임자', badge: '인수자', desc: '이 자리의 1년 업무를 한눈에 봐요' },
  reviewer: { label: '검토하기', who: '부서장', badge: '부서장', desc: '인계서를 검토하고 결재해요' },
};

export const MOVE_DATE = '2026-11-27';
export const DEFAULT_TODAY = '2026-11-20';

/** 파일이 분석 대상인지 (UI 표시용) */
export const fileExcluded = (f) => isExcluded(f.name);
