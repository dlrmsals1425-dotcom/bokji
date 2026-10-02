/**
 * 복지 외 분야(산업·농림) 분류 — 기본 결과에서 숨기고 필터로만 보여 준다 (운영자 결정 2026-10-02).
 *  - agri: 농림축산어업 종사자 대상 (정부24 서비스분야 '농림축산어업' 또는 이름·대상이 농어업인·농가 대상)
 *  - business: 소상공인·기업·법인·창업 등 사업자 대상 (개인 자격이 아니라 사업체 자격으로 받는 혜택)
 * 개인 생활 지원(예: 중소기업 취업 청년 전월세 대출, 농촌 거주 어르신 돌봄)은 숨기지 않는다.
 */
export type Sector = "agri" | "business";

const AGRI_NAME = /(농업인|농업경영|농가|어업인|어가|어선|축산|가축|양봉|양식|영농|임업|산림경영|임산물|귀농|귀어|귀산촌|농기계|비료|종자|종묘|농약|농산물|수산물|친환경농|농지|과수|원예|시설하우스|비닐하우스|축사|사료|낚시어선|수산|해녀|어촌계|직불금|직접지불)/;
const AGRI_TARGET = /(농업인|농업경영체|농가|어업인|어가|축산|임업인|영농|어선|양식업|농어업인)/;
/** 농림 분야로 분류돼도 개인 생활 지원이면 숨기지 않는다 */
const PERSONAL_WELFARE = /(건강검진|안전보험|복지바우처|행복바우처|영농도우미|농가도우미|영농작업비|대학생|자녀|장학|돌봄|의료|상해|연금|요양|청소년|노인|어르신|장애인|취약)/;

const BIZ_NAME = /(소상공인|자영업|사업자|창업|점포|상가|(?<!직)업체|기업\s*(지원|육성|인증|유치)|중소기업\s*(지원|육성|경영)|수출|판로|마케팅|경영\s*(안정|개선|컨설팅)|전통시장|상인|가맹점|프랜차이즈|입주기업|벤처|스타트업|특허|기술\s*개발|R&D|사회적경제기업|협동조합\s*(육성|지원))/;
const BIZ_EXEMPT = /(취업|취·창업|취창업|재직|근속|주택|복지|장학|학생|저소득|서민|가구|가정|효도|숙소|구직|근로자|노동자|일자리|직원|재직자|청년\s*(월세|전세|주거)|전월세|생계|긴급|폐업\s*(소상공인|자영업자)?\s*(재취업|생활)|고용보험|산재|두루누리|출산|육아|자녀)/;
const BIZ_TARGET_START = /^\s*[-·○◦*]?\s*(소상공인|중소기업|중소·중견기업|기업|법인|사업자|자영업자|창업기업|예비창업자|개인사업자|도내\s*기업|관내\s*기업|관내\s*소상공인)/;

export interface SectorInput {
  name: string;
  target?: string;
  gov24Field?: string;
  users?: string;
}

export function classifySector(x: SectorInput): Sector | undefined {
  const name = x.name;
  const target = (x.target ?? "").slice(0, 160);
  const personal = PERSONAL_WELFARE.test(name);
  if (x.gov24Field === "농림축산어업" && !personal) return "agri";
  if (!personal && (AGRI_NAME.test(name) || AGRI_TARGET.test(target.slice(0, 60)))) {
    // '농촌 어르신', '농어촌 학생' 같은 거주지 표현은 농업 종사자 대상이 아니다
    if (AGRI_NAME.test(name) || /^\s*[-·○◦*]?\s*(농업인|농가|어업인|어가|축산|임업인|농어업인|농업경영체)/.test(target)) return "agri";
  }
  if (BIZ_EXEMPT.test(name)) return undefined;
  if (BIZ_NAME.test(name)) return "business";
  if (BIZ_TARGET_START.test(target)) return "business";
  if (x.users && /소상공인|법인/.test(x.users) && !/개인|가구/.test(x.users)) return "business";
  return undefined;
}
