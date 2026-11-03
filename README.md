# BATON — 인계인수 체계 (프로토타입)

PRD-BATON v2.6 · DESIGN-BATON v1.4 기준. 빌드 없이 동작하는 정적 SPA(Preact + htm, ES 모듈)와 Gemini 중계 함수 1개(`/api/ai`)로 구성됩니다. 모든 데이터는 가상입니다.

## 로컬 실행 (Windows, Node 불필요)

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1
```

브라우저에서 http://localhost:5173 을 엽니다.

AI 인계 브리핑·AI 선답변을 실제로 쓰려면 프로젝트 폴더에 `.env.local` 파일을 만들고 키를 넣습니다 (git에 올라가지 않음).

```
GEMINI_API_KEY=발급받은_키
GEMINI_MODEL=gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash
```

무료 등급은 모델마다 하루 요청 수가 작습니다(예: 20회). 그래서 서버는 위 목록의 모델을 순서대로 시도하고, 한도 초과(429)·혼잡(503)이면 다음 모델로 넘어갑니다. AI 인계 브리핑은 `src/data/baked-ai.js`에 Gemini로 미리 만들어 두었고, 업무 폴더를 모두 골라 자동 작성한 직후와 이전 담당자·전체 합산 탭은 API를 부르지 않습니다. 인계서를 고친 뒤 [다시 요약]을 누를 때와 질문에 답할 때만 실제로 호출합니다.

키가 없으면 AI 영역은 "AI 응답을 불러오지 못했습니다 · 다시 시도" 상태로 표시되고, 나머지 기능은 모두 동작합니다.

## 배포 (Vercel)

1. 이 폴더를 그대로 Vercel 프로젝트로 올립니다 (Framework: Other, 빌드 명령 없음).
2. Environment Variables에 `GEMINI_API_KEY`(필수), `GEMINI_MODEL`(선택)을 넣습니다.
3. `api/ai.js`가 서버리스 함수로 배포되어 Gemini 응답을 스트리밍합니다. API 키는 웹페이지 코드에 들어가지 않습니다.

## 구조

| 경로 | 내용 |
|---|---|
| `index.html`, `styles.css` | 진입점, 디자인 토큰·컴포넌트 스타일 |
| `src/data/seed.js` | 직책 3개의 더미 데이터 (업무 폴더 파일, 온나라 이력, 인사정보, 역대 인계서 3건) |
| `src/engine.js` | 규칙 분석 엔진 (정규화·업무키 묶기·루틴 80%·이벤트·특이사항·관계부서·빠진 업무 추천·합산) |
| `src/store.js` | 상태·localStorage 저장, 상신/결재/반려/질문/알림 동작 |
| `src/ai.js` | `/api/ai` 스트리밍 호출, 타자 효과, 같은 요청 재사용, 근거 파싱 |
| `src/ui/*` | 랜딩, 상단바, 원페이지(탭·요약·지도·차트·표), 상세·질문 스레드, 모달, 알림함 |
| `api/ai.js`, `api/_prompts.json` | Gemini 중계 함수와 시스템 지시문 |
| `server.ps1` | 로컬 개발 서버 (정적 파일 + `/api/ai` 중계, 비스트리밍) |

## 시연 팁

- 상단바 달력 아이콘으로 오늘 날짜를 바꿉니다. "인사이동일 + 8일"을 고르면 전임자 질문이 닫히고 열람 전용이 되지만 AI 질문은 계속 됩니다.
- 상단바 ⟲ 아이콘으로 초기 데이터로 리셋합니다.
- 발표 전에 시연할 질문을 한 번 실행해 두면 같은 질문은 저장된 답을 다시 씁니다.
