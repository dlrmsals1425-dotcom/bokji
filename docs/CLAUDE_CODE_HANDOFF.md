# 복지나침반 — Claude Code 인수 문서

> **먼저 읽기 (2026-10-09 갱신):** 이 문서의 1~6장은 47bc438(로고) 시점 기준이다. 그 이후 바뀐 것(QA 5차, 기능 A '방문처별 준비물 한 장', 기능 B '한눈에 보기', QA 6차)은 [`docs/HANDOFF-ADDENDUM.md`](HANDOFF-ADDENDUM.md)에 있고, 둘이 다르면 **ADDENDUM이 우선**이다. 7~9장은 92295fb 기준으로 새로 썼다. 현재 테스트: vitest 501(앱 413 + 파이프라인 88), Playwright 95.

## 1. 한 줄 소개

로그인 없이 한 문장("수원 사는 59년생 부모님 두 분")으로 상황을 말하면, 중앙·시도·시군구·공공기관 복지 서비스를 **브라우저 안에서 규칙으로** 판정해 보여 주는 서비스다.

- 목표: **경기도 시범, 2주 데모 MVP** (다른 시·도는 '시범 지역 밖' 안내와 함께 동작)
- 프로덕션: https://bokji-compass.vercel.app
- 저장소: `yonghwan86/bokji-compass` (package 이름은 `bokjiddak`)
- 기준 `origin/main`: 이 문서를 넣은 커밋(2026-10-09). 그 직전 기능 커밋은 `92295fb`. 47bc438 이후 내역은 `docs/HANDOFF-ADDENDUM.md`
  - 그 앞 커밋: `37f1c27`(리포트 시각만) · `5649921`(QA4 e2e) · `e882590`(R4 잔여 규칙 1건 + 번들 재생성) · `7ab7c94`(QA4 파서·판정 수정)
- 데이터 번들 `public/bundles/v1/meta.json` generatedAt **2026-10-08 23:57 KST**(2026-10-08T14:57:47Z), 사업 **23,575개** (QA 7차 정정)
- 이 문서는 2026-10-08 22:51 KST에 `origin/main`과 프로덕션을 읽고 썼다

## 2. Claude Code 작업 규칙

1. **`main`에 직접 푸시 금지.** `main` 푸시는 Vercel이 바로 프로덕션에 배포한다. 브랜치 → 푸시 → 프리뷰 URL에서 확인 → PR 머지.
2. **비밀값 출력 금지.** `DATA_GO_KR_SERVICE_KEY`는 이름만 쓰고 값은 출력·로그·커밋·문서 어디에도 넣지 않는다. `.env*`는 gitignore(`.env.example`만 커밋됨).
3. **LLM 없는 규칙 기반 유지.** 문장 해석(`src/lib/client/parse.ts`)과 판정(`src/lib/engine/*`, `src/lib/client/v2.ts`)은 순수 함수다. 외부 AI API를 넣지 않는다.
4. **개인정보: 입력은 기기 밖으로 안 나간다.** 프로필은 sessionStorage/localStorage에만 둔다. URL·요청에 싣지 않는다(e2e가 모든 요청을 검사). 받는 건 정적 번들(GET)뿐.
5. **접근성·글자 크게 유지.** axe(WCAG 2.1 AA) 위반 0이 기준이다. '글자 크게'는 `html[data-large="1"]`에서 125%이니 크기는 rem으로 짠다. 모바일 390×844, 데스크톱 1280×800 둘 다 본다.
6. **데이터는 원천에서만.** 사업을 만들어 내지 않는다. 손으로 보강할 때(신청처 등)는 `pipeline/curated/`에 출처와 함께 넣는다.
7. **변경 후 확인 순서:** `npm run lint` → `npm run typecheck` → `npm test` → (화면 변경 시) `npm run build && npm run e2e`. 판정·파서를 바꾸면 **테스트를 먼저** 추가한다(`tests/unit/qa4.test.ts` 형식 참고).
8. **Next.js 16이다.** API·관례가 학습 데이터와 다르다. 코드 전에 `node_modules/next/dist/docs/`의 해당 가이드를 본다(저장소 `AGENTS.md`/`CLAUDE.md`).
9. 제품 제안(8장)은 결정 전에는 구현하지 않는다.

## 3. 시작 방법

```bash
git clone https://github.com/yonghwan86/bokji-compass.git && cd bokji-compass
npm install                 # Node 20 이상
npm run dev                 # http://localhost:3000
npm run build && npm start  # 번들이 커밋되어 있어 수집 없이 바로 빌드됨
npx playwright install chromium   # e2e 처음 한 번
```

| 명령 | 내용 |
|---|---|
| `npm run lint` | ESLint 9 (flat config) |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm test` | Vitest 3 — `tests/unit/**`, `pipeline/tests/**` (node 환경) |
| `npm run e2e` | Playwright 1.63, 헤드리스 Chromium. 빌드된 앱을 `next start -p 3218`로 직접 띄움(먼저 `npm run build`). 떠 있는 서버를 쓰려면 `E2E_BASE_URL=http://localhost:3217 npm run e2e`. 프로덕션 대상도 가능 |
| `npm run build:safe` / `start:safe` | 최소 환경으로 빌드·실행. 셸에 비밀값이 있을 때 사용(Turbopack 캐시가 환경 변수를 스냅샷함) |
| `npm run pipeline` | 데이터 번들 재생성 — **5장 주의 사항을 먼저 읽을 것** |
| `npm run ingest:gov24` / `ingest:bokjiro` | API 수집(키 필요, 로컬 전용) |
| `npx tsx scripts/scenarios.ts` | 예시 상황별 탭 개수·상위 5 → `pipeline/out/scenarios.json` |
| `npx tsx scripts/refine-stats.ts` | 규칙 보정·원문 관문 적용 건수 |
| `npx tsx scripts/metrics.ts` | 번들 지표(신청방법·연락처 채움률 등) |

테스트 현황:
- 단위: `tests/unit/`(parse·engine·results·refine·v2·senior·qa1~qa4 등 20개 파일), `pipeline/tests/`(rules·dedup·normalize·applyType·sector·api)
- e2e: `tests/e2e/`(flow·a11y·brand·qa1~qa4)
  - 프로젝트는 데스크톱 1280×800과 모바일 Pixel 7 390×844(`@mobile` 태그 테스트만)
- 최근 기록(개발 봇 보고, 커밋 5649921): vitest 421/421, e2e 59/59(로컬·프로덕션). 47bc438에서 `brand.spec.ts`가 추가됨

환경 변수 (앱 실행·빌드에는 **없어도 됨**):

| 이름 | 용도 | 어디에 |
|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 인증키. 정부24 API 15113968, 복지로 중앙 15090532·지자체 15108347 승인 | 로컬 `.env`만. **Vercel에 넣지 않음** |
| `GOV24_DAILY_BUDGET` | 정부24 일일 호출 예산(기본 2000, 한도 10,000) | 선택, 로컬 |
| `BOKJIRO_CENTRAL_BUDGET` / `BOKJIRO_LOCAL_BUDGET` | 복지로 일일 예산(기본 95/950, 한도 100/1,000) | 선택, 로컬 |
| `ICDASH_DIR` | 복지로 색인·통합돌봄 메뉴판 파일 폴더(파이프라인 입력) | 선택, 로컬 |
| `E2E_BASE_URL` / `E2E_PORT` | e2e 대상 서버 | 선택 |

## 4. 구조와 핵심 동작

기술 스택: **Next.js 16.3.8 (App Router) · React 19.2.8 · TypeScript 5 · Vitest 3.2 · Playwright 1.63 · @axe-core/playwright 4.13 · tsx 4**
- 런타임 의존성은 next·react·react-dom뿐이다
- 서버 API·DB·로그인 없음. `/p/[id]`만 on-demand 렌더

```
src/app/page.tsx              홈: 문장 검색창 · '내 복지 찾기'/'부모님 복지 찾기' · 예시 상황
src/app/situation/            한 화면 입력(SituationForm) — 문장 해석 결과 확인·수정
src/app/results/              결과(Results → 기본 ResultsV2, ?v=1 이면 옛 화면)
src/app/p/[id]/               사업 상세(판정 근거·신청처·원문 링크·기준일)
src/app/search/               서비스 이름 검색
src/app/about/                데이터·판정 기준, #credits(글꼴 표기)
src/app/check/                v1 단계별 마법사(비교용, ?v=1)
src/app/manifest.ts · icon.svg · apple-icon.png · favicon.ico   PWA·아이콘
src/components/               SiteHeader(로고·글자 크게)·SiteFooter·HomeSearch·HeroArt·ProgramCard·CrisisHelp 등
src/lib/client/parse.ts       문장 해석기 parseSituation (962줄)
src/lib/client/v2.ts          4단 분류·추가 질문·상위 5·카드 문구 (1,480줄)
src/lib/client/results.ts     관련도 점수·같은 이름 묶음·기본 숨김·필터
src/lib/client/mode.ts        본인/부모님 모드 문구·경로
src/lib/client/topics.ts      주제·임신 표현(PREGNANT_RE)
src/lib/client/bundles.ts     번들 로더(지역별) + 로드 시 규칙 보정
src/lib/engine/evaluate.ts    3값 논리(T/F/U) 판정
src/lib/engine/profile.ts     12개 입력 항목, 2026 기준중위소득·기초연금 기준
src/lib/data/refine.ts        원문 대조 규칙 보정 (REFINE_VERSION = 6)
pipeline/src/build.ts         파이프라인 진입점(수집 캐시 → 정규화 → 병합 → 규칙 → 번들)
pipeline/rules/curated.ts     원문 대조 큐레이션 규칙 / review-ledger.csv 사람 검수 원장
public/bundles/v1/            커밋된 정적 번들(약 77MB, 파일 505개)
public/brand/ · public/icons/ 로고·PWA 아이콘
docs/                         v2 설계·감사·시나리오 문서
scripts/                      지표·시나리오·스크린샷·점검 스크립트
```

### 흐름
1. 홈 검색창 `HomeSearch`가 `parseSituation(문장, regions)`을 실행한다.
   - 상황 문장이면 `savePrefill`(sessionStorage) 후 `/situation?for=self|parent`로 간다
   - 아니면 `/search?q=`로 간다
2. 입력 화면에서 '맞아요, 결과 보기'를 누르면 `/results`로 간다.
3. `loadForRegion(sido, sigungu)`가 `national.json` + 내 시도 + 내 시군구 번들만 받는다.
4. 그다음 `scoreV2` → `buildView`(추가 질문) → `topPicksV2`(먼저 확인할 5개) → `autoV2`(자동으로 받는 혜택) 순서로 계산한다.

### 문장 해석 (`parse.ts`)
- 규칙 기반이고 기기 안에서만 돈다. 결과 타입은 `ParsedSituation`(profile, understood, notes, ageChoices, regionChoices, householdAlt, interests, childAges, otherAge, minHousehold 등)
- 지역
  - 시도 별칭과 2026-07 행정구역 코드를 쓴다
  - '광주'처럼 두 곳으로 읽히면 고르게 한다
- 나이
  - 숫자·연생·고유어('예순넷', '스물일곱')·'칠순/팔순'을 읽는다
  - '○십대 초/중/후반'이 두 나이대에 걸치면 `ageChoices`를 준다
  - '할아버지·할머니'만 있으면 65세 이상으로 가정하고 칩으로 알린다
- 가족·임신
  - 자녀 수·나이를 읽는다
  - 임신('임산부·출산 예정·뱃속 아기·임신 n개월')은 '임신 중'만 켜고 자녀·가구원에는 넣지 않는다(`PREGNANT_STRIP`)
- 상황 신호: 한부모·장애 가족·수급·'기초연금 안 받음'·월세·소득('월 180')·구직/실직·프리랜서·군 제대·'가장'(2명 이상)
- 모드
  - 부모님·엄마·아빠·외할머니·장인어른 등이 나오면 parent 모드로 판단한다
  - 탭 힌트(`opt.hint`)도 반영한다

### 판정 (`engine/evaluate.ts` → `v2.ts`)
- 규칙은 조건 트리(all/any)이고, 잎은 T/F/U로 평가한다
  - '모름'과 묻지 않는 조건(재산·질병 등)은 U
- 규칙 출처 `RuleOrigin`
  - `curated`: 원문 대조 1차 검수, UI 배지 "검수 규칙(1차)"
  - `gov24_conditions`: API 지원조건 코드. 전국·경기 사업만 '조건 충족'까지 허용
  - `bokjiro_tags`, `text_extract`, `none`
- `v2.ts` `classifyBase`의 추가 처리
  - 원문 관문(`textGate`): 수급·저소득·중위 N%
  - 직업·자격(`needsOccupation`)과 특수 신분(`needsStatus`, `SPECIAL_STATUS`, `VICTIM_RE`) → '신청할 때 확인'으로 내림
  - 장애 가족 대상(`forDisabledMember`): 그 가족 나이로 판단
  - 개인 대상 아님(`notForPersons`)은 따로 처리

### 결과 4단 (`v2.ts` `Bucket`, `BUCKET_LABEL`)

| 칸 | 화면 라벨 | 의미 |
|---|---|---|
| `fit` | 받으실 수 있어요 | 답한 내용으로 조건이 다 맞음 |
| `office` | 신청할 때 확인 | 간편 입력으로 못 묻는 조건(직업·장애 유형·사건 당사자·세부 자격) |
| `ask` | 답하면 정해져요 | 소득·수급 등 질문 하나로 갈림. 결과 위 짧은 질문(예/아니오/모름)으로 바로 다시 거름 |
| `no` | 맞지 않아요 | 답한 내용과 불일치(기본 숨김, '보기'로 열람) |

- 상위 5개(`topPicksV2`)
  - 상황을 특정하는 조건이 맞은 사업을 우선한다
  - 같은 계열 이름(`familyKey`)은 하나만 넣는다
  - 나이를 모르면 억지로 채우지 않고 "나이를 알려 주시면…"을 띄운다
- 화면 밖으로 빼는 것
  - 자동 지급·기관 추천(`autoLike`): 목록 아래 접힌 '자동으로 받는 혜택'으로
  - 교육청·농림축산 생산 지원·사업자 대상·기관 운영비: 기본 숨김(필터로 열람)

### 부모님 경로
- 진입: 홈 '부모님 복지 찾기' → `/situation?for=parent`. 결과는 `/results?for=parent`
  - 화면 문구는 `mode.ts`의 `wizardCopy`/`resultsCopy`/`householdLabel`
- 결과 위에 붙는 것: "부모님 복지 찾기" 배너, 가족 대리 신청 안내(☎129)
- 두 분 나이가 다르면 '다른 분 기준으로 보기'(`otherAge`)
- 같이 사는 부모님(장인·장모·시부모 포함)은 그분 기준으로 따로 찾으라고 안내한다

### 2026 기준중위소득 (`src/lib/engine/profile.ts`)
- `MEDIAN_INCOME_2026`(월, 원): 1인 2,564,238 · 2인 4,199,292 · 3인 5,359,036 · 4인 6,494,738 · 5인 7,556,719 · 6인 8,555,952
  - 출처: 보건복지부 보도자료(중앙생활보장위원회 의결 2025-08), 코드 주석에 URL. 2026-10-07 확인
- `BASIC_PENSION_THRESHOLD_2026`: 단독 2,470,000 · 부부 3,952,000원(2026-01-01 보도자료)
- 함수: `medianPercent` → `incomeBandFor`(구간 32·40·48·50·60·100·120·150·200·200+) · `medianWon`(카드의 "월 ○○만원 이하 (3인)")
  - `v2.ts`의 `incomeExplain`과 `LOW_INCOME_PCT = 60`도 같은 표를 쓴다
- 연도는 상수 이름에 박혀 있다. 해가 바뀌면 상수와 그 사용처, 테스트 기대값을 함께 바꾼다(7장 Y1)

### 규칙 보정 (`refine.ts`)
- 무엇을 하나
  - 정부24 소득 코드가 원문 '중위 N%'보다 좁으면 원문 비율로 넓힌다('우선·가점' 문구는 제외)
  - 원문에 소득 기준이 없으면 소득 코드는 참고만 한다
  - 장기요양 인정 신청은 등급 없이도 가능하게 둔다
  - 기능 판정(바델·배뇨)은 '신청할 때 확인'으로 둔다
- 언제 적용되나: 파이프라인 빌드 때 **그리고** 브라우저 로드 때(`bundles.ts` → `refineProgram`)
  - 그래서 **번들을 재생성하지 않고도 규칙 수정이 반영된다**

### 먼저 읽을 문서
- `README.md`: 화면 흐름·데이터 정책·판정 정책. 일부는 v1 시절 설명(`/check` 12항목·3단계)이다. 현재 기본은 v2
- `docs/v2-situation-proposal.md`: 왜 '상황 먼저'로 바꿨나, 질문 12개, 결과 화면 설계
- `docs/v2-scenarios.md`: 예시 상황별 v1↔v2 상위 5·개수 비교
- `docs/v2-audit-gates.md`: 상위 30개가 어떤 '모름' 때문에 애매한지 감사

### 브랜드 (47bc438, 프로덕션 검증 통과)
- 머리글 로고: `public/brand/logo-e2.svg`('복지' 남색 + '나침반' 파랑)
  - 높이를 rem으로 줘서 138×32px → 글자 크게일 때 173×40px
- 푸터: `public/brand/logo-symbol.svg`. 장식 이미지라 alt 빈 값 + aria-hidden, 옆에 "복지나침반" 글자가 있다
- 반전 로고 `public/brand/logo-e2-reversed.svg`, `app-icon-b.svg`: 파일만 있고 화면에서는 안 쓴다
- 아이콘
  - `src/app/icon.svg`, `apple-icon.png`(180), `favicon.ico`(16·32·48)
  - `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
  - 공유 이미지 `public/og.png`(1200×630)
- `theme-color` **#1D4ED8**(`layout.tsx`, `manifest.ts`)
  - 버튼 강조색(#256EF4·#0B50D0)은 일부러 그대로 둔 것이다
- 로고 글자는 Pretendard를 윤곽선으로 딴 것이다. **SIL OFL 1.1 표기**가 `/about#credits`와 README에 있다. 로고를 바꿔도 이 표기는 유지

## 5. 데이터

| 원천 | 건수 | 비고 |
|---|---|---|
| 공공서비스(혜택) API, 행안부 data.go.kr 15113968 | 10,949 | 목록·지원조건·상세. 개인·가구 대상만(법인·시설 전용 1,014 제외) |
| 복지로 중앙부처복지서비스 API 15090532 | 461 | 개발계정 하루 100회 |
| 복지로 지자체복지서비스 API 15108347 | 4,819 | 하루 1,000회 |
| 복지로 색인 (w100_index) | 5,204 | 생애주기·가구 태그 |
| 통합돌봄 지방정부 서비스 메뉴판 (policies.csv) | 12,526행 | 신청방법·연락처 없음 |
| 복지 100선 요약 + 수동 보강(`pipeline/curated/`) | 100 + 3 | 큐레이션 규칙 근거, 신청처 보강 |

병합 결과(`pipeline/out/report.md`)
- 23,575개: 중앙 1,061 · 시도 1,967 · 시군구 18,091 · 공공기관 2,203 · 교육청 253
- 병합 우선순위: gov24 > 복지로 > 100선 > 통합돌봄
- 시군구 등록분 처리
  - 전국 사업과 같으면 그 전국 사업의 '우리 지역 운영 정보'로 흡수한다
  - 추가사업 표지가 있으면 별도 사업으로 둔다
- 경기 파일럿 3,001개: API 지원조건 979 · 자동 규칙 1,672 · 규칙 없음 338 · 큐레이션 12
- 신청방법 채움 12,885 · 연락처 13,405

생성·갱신 순서
1. `npm run ingest:gov24`
   - 응답을 `pipeline/raw/gov24/`에 캐시한다
   - 캐시가 있으면 다시 호출하지 않는다(`--refresh`로 강제)
2. `npm run ingest:bokjiro`
   - XML을 `pipeline/raw/bokjiro/`에 캐시한다
   - 일일 예산 안에서 상세를 우선순위대로 받고, 다음 날 이어서 받는다
3. `npm run pipeline` (`pipeline/src/build.ts`)
   - 출력 `public/bundles/v1/`
     - `national.json`, `sido/{코드}.json`, `sigungu/{코드}.json`, `regions.json`, `meta.json`
     - `details/{해시2자}.json`(256샤드)
   - 출력 `pipeline/out/`
     - `report.md`·`report.json`, `review-queue-gyeonggi.csv`, `review-curated.csv`
     - `apply-type.csv`, `regional-copies.csv`, `operator-hidden.csv`
4. 번들 커밋 → 브랜치 프리뷰 확인 → 머지

**새 PC에서 주의**: `pipeline/raw/`(API 캐시)는 gitignore라 저장소에 없다.
- 복지로 색인·메뉴판도 저장소 밖에 있다. 위치는 `ICDASH_DIR`이고, 기본값 `/workspace/icdash`는 개발 봇 서버 경로다
- 그래서 새로 clone한 PC에서는 `npm run pipeline`이 입력 파일이 없어 실패한다
  - 캐시 일부만 있는 채로 돌리면 사업이 빠진 번들이 생길 수 있다
- 정리하면:
  - **커밋된 `public/bundles/v1`가 기준 데이터다.**
  - 규칙을 고칠 때는 `src/lib/data/refine.ts`나 `v2.ts`(런타임 적용)로 한다.
  - 번들 재생성은 원천 파일과 키를 확보한 뒤에만 한다.
  - 재수집에는 복지로 일일 한도 때문에 여러 날이 걸린다.

규칙 검수: 파이프라인이 대기열 CSV를 뽑는다.
- 검수자가 원문과 대조해 `pipeline/rules/review-ledger.csv`에 `rule_id 또는 curated:<키>, verified|rejected, 검수자, 일자, 메모`를 적는다
- 재빌드하면 verified는 검수 규칙이 되고, rejected는 규칙이 빠진다

## 6. 배포

- Vercel 프로젝트 **`bokji-compass`**
  - 설정: Framework Next.js · Build `npm run build` · Install `npm ci` · Node 20+ · **환경 변수 없음**
- **`main` 푸시 = 프로덕션 자동 배포**
  - 작업은 브랜치에서 하고, 브랜치 푸시로 생기는 Preview URL에서 확인한다
  - Git 연동 Preview가 켜져 있는지 Vercel 대시보드에서 한 번 확인할 것
- 빌드는 수집·파이프라인을 실행하지 않는다. 커밋된 번들을 정적 자산으로 배포한다
  - `.vercelignore`가 pipeline·scripts·tests·docs·shots·logs·`.env*`를 업로드에서 뺀다
- CLI 배포
  - 처음 한 번 `vercel link --yes --project bokji-compass`
  - 프리뷰 `vercel`
  - 프로덕션은 머지로(`vercel --prod`는 쓰지 말 것 권장)
- 배포 후 확인
  - `E2E_BASE_URL=<프리뷰 URL> npm run e2e`
  - 또는 아래 7장 재현 문장을 홈 검색창에 넣어 본다


## 7. 남은 할 일 (92295fb 기준)

ID 'N3'은 리뷰어 5차 N3(대학 신입생, 고침)와 겹쳐 장인어른 항목을 **H2**로 바꿨다. QA 7차(6차 프로덕션 검증 후속) 내역은 `docs/HANDOFF-ADDENDUM.md` 'QA 7차'.

이전 판의 C3b·U1·Q1·L1·H1·U2·P2b는 QA 5차(1ea7b5a)에서, 리뷰어 5차 검증 N1~N5·N7·N8은 QA 6차(9f192b4)에서 고쳐 프로덕션에서 확인했다. 자세한 내용은 `docs/HANDOFF-ADDENDUM.md`, `docs/fixes-round6.md`.

| 우선 | ID | 내용 | 관련 파일 | 방향 |
|---|---|---|---|---|
| 높음 | Y1 | 2027년 기준중위소득·기초연금 선정기준액 전환. 2027-01-01부터 소득 판정이 1년 묵은 값이 됨 | `src/lib/engine/profile.ts`(`MEDIAN_INCOME_2026`, `BASIC_PENSION_THRESHOLD_2026`), `v2.ts`, 관련 테스트 | 연도별 표 + 서울 날짜 기준 선택. **값은 보건복지부 고시·보도자료에서 직접 확인하고 출처 URL을 주석으로**(추측 금지). 확인 못 하면 멈추고 소유자에게 묻기 |
| 중간 | T1 | 10대 본인 화면 말투가 성인용. '가구 소득' 질문에 보호자 소득이라는 설명 없음. 기한 목록에 대학생 장학금이 남을 수 있음. (6차 검증 보강) 자녀 질문·자녀 금액 예시가 나옴 | `ResultsV2.tsx`, `Summary.tsx`, `v2.ts` | → QA 7차 PR #5 |
| 중간 | N6 | 휴학생·대학원생에게 이공계 우수학생 등 성적·분야 한정 장학금이 일반 장학금보다 위 | `v2.ts` `rankAdj`·`topPicksV2` | 성적·전공 한정 신호 없으면 감점 |
| ~~중간~~ 높음 | M1 → M2·M3 | (6차 검증) '애매 6건'이 아니라 가구원 수별 표의 가장 큰 칸·임금·보험 보장액·시간당 단가가 한눈에 보기 첫 줄에 나옴 | `src/lib/client/money.ts` | → QA 7차 PR #1·#8 (화면 안전장치). 가구원 수별 표 전체 저장(`money.byHh`)은 번들 재생성 때 |
| 낮음 | K1 | 자녀 나이를 안 말한 '아이 키우는 엄마 안산'은 본인 나이부터 물음(추천 0개 + 나이 안내) | `parse.ts`, `ResultsV2.tsx` | 의도된 처리. 바꾸려면 자녀 나이 질문을 먼저 |
| 낮음 | V1 | 준비물 한 장: 63%가 원문에 서류가 없어 '창구에 문의' | `visit.ts`, `pipeline/curated/` | 자주 나오는 사업만 출처와 함께 수동 보강 |
| 낮음 | F1 | '발전소 시설 견학' 같은 체험성 사업이 '받으실 수 있어요'에 남음(해롭지 않음) | `v2.ts` | 필요하면 상위 5개 감점 |
| 결정 필요 | H2 (옛 N3) | `장인어른 모시고 삽니다 부천` → 1개 + '부모님 기준으로 따로 찾기' 안내 | `parse.ts`, `ResultsV2.tsx` | 의도된 처리. 바꾸려면 소유자 결정 |
| 의도적 유지 | R4-잔여 | 안양 반려동물 의료지원 '중위소득 120% 미만 … 우선지원'이 상한인지 불분명 | `src/lib/data/refine.ts` | 원문·담당 부서 확인 전 유지 |
| 보류 | L4·L6 | 입력 화면 길이·글자 크기, 첫 방문 속도·글꼴 CDN | `src/app/situation/`, `layout.tsx` | 제품 결정 전 착수하지 않음 |

## 8. 제품 제안 상태

1. 신청 장소별 묶음 + 준비물 한 장 → **구현·배포 완료**(기능 A, 8b25e7e)
2. 옵트인 공유 링크(상황 대략값을 URL 해시에) → **채택 안 됨.** 소유자 결정 없이는 착수하지 않는다. 현재 공유는 사업명·공개 상세 URL·지역명만 보낸다. (6차 검증: PNG·인쇄로는 입력값 없음 확인, '보내기' 단추는 Web Share가 없는 브라우저에선 안 보여 검증 못 함)
3. 금액·기한 표시 → **구현·배포 완료**(기능 B, 8b25e7e)

## 9. 처음 할 일 추천

1. **기준선 확인 + 브랜치**
   - `git switch -c chore/baseline`
   - `npm install` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build` → `npm run e2e`가 모두 초록인지 확인하고 요약(e2e 95, vitest 501 기대)
2. **Y1 (2027 기준중위소득)** — 연말 전 필수. 값 출처부터 확인하고 테스트 먼저.
3. **T1·N6 (10대 문구, 장학금 순위)** — `tests/unit/qa6.test.ts` 형식으로 테스트 먼저, 기존 페르소나 상위 5개가 바뀌지 않는지 e2e로 확인.
4. 끝나면 PR을 만들고 프리뷰 URL에서 재현 문장을 직접 넣어 본다. `main` 직접 푸시 금지.
