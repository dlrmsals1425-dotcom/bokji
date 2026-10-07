/**
 * 큐레이션 규칙 (review = "curated": 원문 근거 구절과 대조해 작성한 1차 검수 규칙).
 *
 * - 키: 원천 ID (복지로 기반 100선 slug 또는 복지로 WLF ID).
 * - 근거 구절(evidence)은 빌드 시 해당 원천 레코드의 대상·요약 문구가 자동으로 붙는다.
 *   원문에 없는 수치는 쓰지 않는다. 예외: 의료급여 40%는 기획안 9장 [검증] 보건복지부 보도자료 근거(source 필드 표기).
 * - 최종 사람 검수는 pipeline/rules/review-ledger.csv 에 검수자·일자를 기록하면 "verified"로 올라간다.
 * - 경기도(파일럿) 사업은 WLF ID 로 등록한다.
 */
import type { Cond } from "../../src/lib/engine/types";
import {
  activity, age, all, any, benefit, care, children, disability, housing, income, kid, lowIncomeSoft, resident,
  trait, unasked, RECIPIENT, RECIPIENT_NEAR,
} from "../src/rules/helpers";

export interface CuratedRule {
  logic: Cond;
  unstructured?: string[];
  core?: boolean;
  /** 원문 외 근거 (있을 때만) */
  source?: string;
  badges?: ("financial" | "business" | "student")[];
}

const MOHW_2026 = "2026년 기준 중위소득·급여별 선정기준 보건복지부 보도자료 (https://www.mohw.go.kr/board.es?act=view&bid=0027&list_no=1487098&mid=a10503010100)";
const YOUTH_LAW = "청년기본법상 청년 19~34세 (기획안 9장 [검증])";

const recipient = benefit(RECIPIENT, "기초생활수급자");
const recipientNear = benefit(RECIPIENT_NEAR, "기초생활수급자 또는 차상위계층");

export const CURATED: Record<string, CuratedRule> = {
  /* ---------- 기초생활보장 ---------- */
  "livelihood-benefit": {
    logic: income(32, "가구 소득인정액 기준 중위소득 32% 이하"),
    unstructured: ["소득인정액은 소득과 재산 환산액을 합친 금액이에요 (간편 입력의 소득 구간과 다를 수 있음)"],
  },
  "medical-aid": {
    logic: any("의료급여 대상", income(40, "가구 소득인정액 기준 중위소득 40% 이하"), benefit(["medical"], "의료급여 수급 중")),
    unstructured: ["타법 수급자(국가유공자 등)도 대상이 될 수 있어요"],
    source: MOHW_2026,
  },
  "housing-benefit": {
    logic: income(48, "가구 소득인정액 기준 중위소득 48% 이하"),
    unstructured: ["소득인정액은 재산 환산액을 포함해요"],
  },
  "education-benefit": {
    logic: all(income(50, "가구 소득인정액 기준 중위소득 50% 이하"), any("초·중·고 학생", kid(6, 18, "초·중·고 학생 자녀"), age(0, 18, "초·중·고 학생 본인", { capU: true }))),
  },
  "birth-funeral-benefit": {
    logic: recipient,
    unstructured: ["출산 또는 사망이 있을 때 신청"],
  },
  "near-poverty-certificate": {
    logic: income(50, "가구 소득인정액 기준 중위소득 50% 이하"),
  },
  "near-poverty-copay-reduction": {
    logic: all(benefit(["near_poverty"], "차상위계층"), unasked("희귀·중증질환자, 만성질환자 또는 18세 미만 아동이 있는 가구")),
  },
  "self-sufficiency-work": {
    logic: all(recipientNear, unasked("근로능력 있음", "근로능력 판정은 주민센터에서 확인해요.")),
  },
  "hope-savings": {
    logic: all(recipientNear, activity(["employed", "self_employed"], "일하는 가구 (근로·사업소득)")),
  },
  "recipient-fee-reduction": { logic: recipient },
  "energy-voucher": {
    logic: all(recipient, any("에너지 취약 가구원(노인·영유아·장애인 등)",
      age(65, undefined, "노인 (본인)"), kid(0, 5, "영유아 자녀"), disability(["self", "member"], "장애가 있는 가구원"),
      unasked("그 밖의 에너지 취약 가구원(임산부·중증질환자 등)"))),
  },

  /* ---------- 노인 ---------- */
  "basic-pension": {
    logic: all(age(65, undefined, "만 65세 이상"), any(undefined, benefit(["basic_pension"], "기초연금 수급 중"), unasked("소득하위 70% (소득인정액 선정기준액 이하)", "소득인정액 선정기준액은 정밀 확인 단계(준비 중)에서 다뤄요."))),
  },
  "elderly-customized-care": {
    logic: all(age(65, undefined, "만 65세 이상 어르신"), benefit([...RECIPIENT_NEAR, "basic_pension"], "저소득 (수급·차상위·기초연금)"), care(["daily"], "돌봄이 필요")),
    unstructured: ["돌봄 필요 정도는 수행기관 조사로 판단해요"],
  },
  "emergency-safety-alert": {
    logic: any("홀로 사는 어르신 또는 장애인", all(age(65, undefined, "만 65세 이상"), trait(["single"], "혼자 사는 1인 가구")), disability(["self"], "장애인 본인")),
    unstructured: ["세부 선정기준(소득 등)은 주민센터에서 확인"],
  },
  "integrated-community-care": {
    logic: all(any("노인·장애인", age(65, undefined, "만 65세 이상"), disability(["self"], "장애인 본인")), care(["daily", "discharged"], "돌봄이 필요")),
  },
  "senior-jobs": {
    logic: age(60, undefined, "어르신 (사업 유형별 만 60세 또는 65세 이상)", { capU: true }),
  },
  "long-term-care-insurance": {
    logic: all(any(undefined, age(65, undefined, "만 65세 이상"), unasked("65세 미만 노인성 질병")), care(["daily"], "혼자 일상생활이 어려움"), unasked("장기요양 등급 판정", "국민건강보험공단 등급 판정이 필요해요.")),
  },
  "dementia-screening-treatment": { logic: age(60, undefined, "어르신 (만 60세 이상)", { capU: true }), unstructured: ["치료관리비는 치매 진단 후 소득 기준 확인"] },
  // 인플루엔자 국가예방접종 (공공서비스 135200000115): API 지원조건에는 어린이·임신부만 있어 어르신 대상이 빠져 있었다 → 원문 '지원대상' 세 갈래를 그대로
  "135200000115": {
    logic: any("어린이·임신부·어르신 중 하나",
      age(65, undefined, "만 65세 이상 어르신 (1961.12.31. 이전 출생)"),
      age(0, 14, "생후 6개월~14세 어린이 본인"),
      kid(0, 14, "생후 6개월~14세 자녀"),
      unasked("임신부", "산모수첩 등으로 임신 여부를 확인해요.")),
    unstructured: ["어르신은 나이대별로 접종 시작일이 달라요 (원문의 지원기간 확인)"],
  },
  // 수원시 대상포진 예방접종 (복지로 WLF00006456): 수원시 누리집 '새빛 생활비 패키지' 확인 — 2026년은 짝수 해, 2027년은 홀수 해 출생자 (격년제)
  "WLF00006456": {
    logic: all(age(65, undefined, "만 65세 이상 수원시민"),
      unasked("올해 접종 차례인 출생연도 (2026년: 짝수 해 출생, 2027년: 홀수 해 출생 · 격년제)", "예: 1959년생(홀수 해)은 2027년 차례예요. 과거에 맞은 분은 제외돼요.")),
    unstructured: ["일반 시민은 위탁의료기관에서 접종 시행비 19,610원 본인부담, 기초생활수급자·차상위계층은 보건소에서 무료", "방문 전 전화 문의 필수, 예산 소진 시 조기 종료"],
    source: "수원시 누리집 새빛 생활비 패키지 (https://www.suwon.go.kr/sw-www/saebitinfo/saebitinfo-01.jsp, 2026-10-07 확인)",
  },
  "senior-eye-surgery": {
    logic: age(60, undefined, "만 60세 이상 어르신"),
    unstructured: ["수술비 지원은 저소득층 대상 (검진은 60세 이상)"],
  },
  "senior-knee-surgery": { logic: all(age(60, undefined, "만 60세 이상"), lowIncomeSoft("저소득 어르신")), unstructured: ["무릎 관절 질환 진단 필요"] },
  "senior-center": { logic: age(65, undefined, "어르신 (경로당 이용 연령)", { capU: true }) },

  /* ---------- 돌봄 ---------- */
  "housework-nursing": {
    logic: all(age(0, 64, "만 65세 미만"), any("중증장애인·중증질환자·한부모 등", disability(["self"], "심한 장애 (본인)", "severe"), trait(["single_parent"], "한부모 가구"), unasked("중증질환자 등")), lowIncomeSoft("저소득 가구")),
  },
  "daily-care": {
    logic: all(age(13, 64, "만 13~64세"), care(["daily", "discharged"], "질병·부상 등으로 혼자 생활하기 어려움")),
    unstructured: ["가족돌봄청년도 대상"],
  },
  "emergency-care": {
    logic: care(["daily", "discharged"], "갑작스러운 질병·사고로 돌봄 공백", { capU: true }),
  },

  /* ---------- 장애 ---------- */
  "disability-pension": { logic: all(age(18, undefined, "만 18세 이상"), disability(["self"], "중증(심한) 장애인 본인", "severe"), lowIncomeSoft("저소득 (소득인정액 선정기준 이하)")) },
  "disability-allowance": { logic: all(age(18, undefined, "만 18세 이상"), disability(["self"], "심하지 않은 장애 (등록장애인 본인)", "mild"), lowIncomeSoft("기초생활수급·차상위 가구")) },
  "disabled-child-allowance": { logic: all(kid(0, 17, "18세 미만 자녀"), disability(["member"], "장애가 있는 자녀 (가구원)"), lowIncomeSoft("기초생활수급·차상위 가구")) },
  "disability-activity-support": {
    logic: all(age(6, 64, "만 6세~65세 미만"), disability(["self"], "장애인 본인")),
    unstructured: ["지원량은 종합조사 결과로 정해져요"],
  },
  "developmental-rehab": { logic: all(kid(0, 17, "장애아동 (18세 미만 자녀)"), disability(["member"], "장애가 있는 자녀", undefined, { capU: true })) },
  "disabled-family-childcare": { logic: all(kid(0, 17, "18세 미만 자녀"), disability(["member"], "중증 장애가 있는 자녀", "severe")) },
  "adult-dd-day-activity": { logic: all(age(18, undefined, "만 18세 이상"), disability(["self"], "발달장애인 본인", undefined, { capU: true })) },
  "youth-dd-after-school": { logic: all(any(undefined, kid(6, 18, "6~18세 자녀"), age(6, 18, "6~18세 본인")), disability(["self", "member"], "발달장애 학생", undefined, { capU: true })) },
  "disability-jobs": { logic: all(disability(["self"], "등록장애인 본인"), activity(["job_seeking", "none"], "미취업")) },
  "assistive-devices": { logic: all(disability(["self"], "등록장애인 본인"), lowIncomeSoft("저소득")) },
  "disability-self-reliance-loan": { logic: all(disability(["self", "member"], "장애인 가구"), lowIncomeSoft("저소득 가구")), badges: ["financial"] },
  "disabled-women-birth": { logic: all(disability(["self"], "여성장애인 본인"), children(["pregnant", "0-1"], "출산 (또는 임신 4개월 이상 유산·사산)"), unasked("여성")) },
  "disability-primary-doctor": { logic: disability(["self"], "장애인 본인"), unstructured: ["주치의 등록 대상 장애 정도는 원문 확인"] },

  /* ---------- 임신·출산·보육·아동 ---------- */
  "parent-benefit": { logic: children(["0-1"], "0세 또는 1세 자녀") },
  "child-allowance": { logic: kid(0, 8, "9세 미만 자녀") },
  "first-meeting-voucher": { logic: any(undefined, children(["0-1"], "최근 출생한 자녀"), children(["pregnant"], "출산 예정 (출생 후 신청)", { capU: true })) },
  "childcare-fee": { logic: kid(0, 5, "영유아 자녀"), unstructured: ["어린이집을 이용하는 경우"] },
  "home-childcare-allowance": { logic: kid(2, 7, "24~86개월 영유아 자녀"), unstructured: ["어린이집·유치원에 다니지 않는 경우"] },
  "hourly-childcare": { logic: kid(0, 5, "가정에서 키우는 영유아 자녀", { capU: true }) },
  "together-care": { logic: kid(6, 12, "초등학생 자녀") },
  "local-children-center": { logic: kid(6, 15, "초·중학생 자녀"), unstructured: ["방과후 돌봄이 필요한 아동 (우선순위는 센터 기준)"] },
  "dream-start": { logic: all(kid(0, 12, "12세 이하 자녀"), lowIncomeSoft("수급·차상위 등 취약계층 가구")) },
  "child-meal-support": { logic: all(kid(0, 17, "18세 미만 자녀"), lowIncomeSoft("저소득 가정")), unstructured: ["결식 우려 여부"], core: true },
  "didim-seed-account": { logic: all(kid(0, 17, "아동 (18세 미만 자녀)"), lowIncomeSoft("보호대상·수급·차상위 가구 아동")), badges: ["financial"] },
  "maternal-newborn-care": { logic: children(["pregnant", "0-1"], "출산 가정", { capU: true }), unstructured: ["출산 후 신청 기한과 소득 기준은 원문 확인"] },
  "preconception-health": { logic: all(age(20, 49, "만 20~49세"), unasked("임신을 준비 중")) },
  "diaper-formula": { logic: all(kid(0, 1, "2세 미만 영아 자녀"), lowIncomeSoft("저소득 가정")) },
  "single-parent-child-support": { logic: all(trait(["single_parent"], "한부모·조손 가족"), income(65, "기준 중위소득 65% 이하"), kid(0, 17, "18세 미만 자녀")) },
  "multicultural-language": { logic: all(trait(["multicultural"], "다문화가족"), kid(0, 12, "12세 이하 자녀")) },

  /* ---------- 청년·일자리·자산 ---------- */
  "youth-tomorrow-savings": {
    logic: all(age(19, 34, "청년 (만 19~34세)"), activity(["employed", "self_employed"], "일하는 청년"), lowIncomeSoft("저소득")),
    source: YOUTH_LAW, badges: ["financial"],
  },
  "youth-rent-support": {
    logic: all(age(19, 34, "청년 (만 19~34세)"), housing(["monthly"], "월세 거주 (무주택)"), unasked("부모와 따로 사는 저소득 청년", "부모 소득·별도 거주 여부는 신청 때 확인해요.")),
    source: YOUTH_LAW,
  },
  "unemployment-benefit": { logic: all(activity(["job_seeking"], "구직 중"), unasked("비자발적 이직 + 고용보험 가입 기간", "고용보험 이력은 고용센터에서 확인해요.")) },
  "national-employment-support": { logic: all(activity(["job_seeking", "none"], "구직자"), any(undefined, age(19, 34, "청년 (만 19~34세)", { capU: true }), lowIncomeSoft("저소득 구직자"))), source: YOUTH_LAW },
  "earned-income-tax-credit": { logic: all(activity(["employed", "self_employed"], "일하는 가구 (근로·사업소득)"), unasked("가구 유형별 소득·재산 기준", "국세청 신청 안내에서 확인해요.")) },

  /* ---------- 기타 ---------- */
  "culture-nuri-card": { logic: all(age(6, undefined, "만 6세 이상"), recipientNear) },
  "mental-health-center": { logic: resident("지역 주민 누구나 (무료 상담)") },
  "veteran-compensation": { logic: trait(["veteran"], "국가유공자·보훈보상대상자 또는 유족") },
  "defector-settlement": { logic: trait(["multicultural"], "북한이탈주민", { capU: true }) },
  "jeju-citizen-safety-insurance": { logic: resident("제주에 주민등록을 둔 도민 누구나") },

  /* ---------- 경기도 파일럿 (복지로 WLF, 원문 요약 근거) ---------- */
  WLF00004473: { logic: any("만 6~18세 어린이·청소년", kid(6, 18, "만 6~18세 자녀"), age(6, 18, "만 6~18세 본인")), unstructured: ["경기도 내 거주, 대중교통 이용 금액 기준 환급"] },
  WLF00003678: { logic: all(recipient, age(65, undefined, "노인 가구 (만 65세 이상)")) },
  WLF00003392: { logic: all(recipient, disability(["self", "member"], "중증 장애인 가구", "severe")) },
  WLF00006696: { logic: all(income(80, "가구소득 기준 중위소득 80% 이하"), disability(["self"], "장애인 본인")), unstructured: ["입원비 지원"] },
  WLF00001237: { logic: recipient, unstructured: ["2억원 이하 주택 매매·전월세 계약 시"] },
  WLF00003847: { logic: all(trait(["veteran"], "국가유공자"), any("차상위계층 이하", benefit(RECIPIENT_NEAR, "수급자·차상위계층"), income(50, "기준 중위소득 50% 이하"))) },
  WLF00000688: { logic: kid(0, 17, "18세 미만 아동 (자녀)"), unstructured: ["결식 우려가 있는 아동"], core: true },
  WLF00005924: { logic: all(age(65, undefined, "어르신 (고령자)", { capU: true }), lowIncomeSoft("저소득")) },
  WLF00004001: { logic: all(age(65, undefined, "어르신"), care(["daily"], "거동이 불편함", { soft: true }), lowIncomeSoft("가정 형편이 어려움")) },
  WLF00003474: { logic: all(age(65, undefined, "노인"), trait(["single"], "1인 가구")) },
};
