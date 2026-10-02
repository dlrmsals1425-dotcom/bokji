/**
 * 신청 유형 분류 (운영자 방향 2026-10-02: '내가 직접 신청해야 받는데 놓치기 쉬운 혜택'을 앞에)
 *  - self:        본인·가족이 직접 신청해야 받는 서비스 (주민센터·복지로·정부24·기관 신청 등)
 *  - auto:        따로 신청하지 않아도 자동 지급·연계 (공단 명단 통보, 직권 처리, 자동 가입, 학교·어린이집이 일괄 처리)
 *  - institution: 기관이 추천·선정·지정하거나 시설·기관을 대상으로 하는 사업 (시설 입소자, 기관 추천, 의뢰)
 *  - unknown:     신청 정보가 없거나 신호가 엇갈림 (결과에는 평소처럼 보임)
 *
 * 보수적 원칙: 확실한 '신청 불필요/자동/추천' 문구가 있을 때만 auto·institution 으로 보낸다.
 * 신청 문구(방문·온라인 신청, 신청서, 본인·가족 신청)가 함께 있으면 self 를 유지한다.
 */
import type { ApplyType } from "../../../src/lib/data/types";
export type { ApplyType };

export interface ApplyInput {
  name: string;
  summary?: string;
  target?: string;
  criteria?: string;
  benefit?: string;
  /** 신청방법 본문 (정부24 상세 신청방법, 복지로 신청방법 내용) */
  applyMethod?: string;
  /** 신청 경로 구분 (정부24 목록 '신청방법': 방문신청||신청불필요…, 복지로 aplyMtdNm: 방문, 인터넷…) */
  applyChannel?: string;
  /** 지원·제공 유형 (정부24 지원유형, 복지로 제공유형) */
  supportType?: string;
  owner?: string;
  scope?: "national" | "sido" | "sigungu";
}

export interface ApplyResult {
  type: ApplyType;
  /** 판단 근거 (원문 구절 또는 규칙 설명) */
  reason: string;
}

/* ---------- 문구 사전 ---------- */

/** 명시적으로 '신청이 필요 없다'는 문구 */
const NO_APPLY = /(별도(?:의)?\s*(?:가입\s*)?절차\s*없이|신청\s*(?:행위\s*)?(?:없이|불필요|불요|필요\s*(?:없|X)|하지\s*않아도|하지\s*않음|절차\s*(?:없|불필요))|별도(?:의)?\s*(?:개인\s*)?(?:신청|가입|신청\s*절차|신청\s*행위|신청사항|신청\s*접수)\s*(?:이|은|를)?\s*(?:없|불필요|불요|필요\s*(?:없|X)|X|x|하지\s*않)|개인\s*신청\s*(?:절차\s*)?(?:없|불필요|불요|불가)|미신청\s*\(직접지원|개별\s*신청\s*(?:없|불필요)|직접\s*신청하지\s*않아도)/;
/** 자동 지급·연계 문구 */
const AUTO = /(자동(?:으로|적으로)?\s*(?:지급|지원|제공|가입|선정|신청|적용|연계|감면|할인|차감|추출|책정|입금|발급|처리|전환|부여|결정|산정|반영|대상)|직권(?:으로)?\s*(?:신청|지급|결정|처리|조사|선정|책정|등록|지원)|직권지급|직권신청|일괄\s*(?:지급|지원|신청|처리|차감|입금|감면|적용|통보|가입)|명단\s*(?:통보|추출|제공|취합|을?\s*통보)|대상자\s*(?:명단|자료|DB)?\s*(?:를\s*)?(?:자동\s*)?(?:추출|통보)|공단(?:에서|으로부터)?\s*(?:대상자\s*)?(?:명단|자료)|통보\s*(?:받은|된)\s*(?:명단|자료|대상자)|가입\s*절차\s*없이|주민\s*(?:모두|전체)\s*(?:자동\s*)?가입|자동\s*가입)/;
/** 기관 추천·의뢰·선정·지정 */
const INSTITUTION = /(추천\s*(?:->|→|⇒)|공단(?:에서)?\s*(?:대상자\s*)?(?:를\s*)?추천|추천(?:을\s*받|받은|자|에\s*의|에\s*따른|하여|하면|된|\s*후|\s*및|\s*신청|대상|\))|(?:단체|기관|학교|시설|센터|읍면동|동장|이장|통장|협회)\s*(?:의\s*)?추천|추천서|의뢰(?!인)|협약기관(?:을|를)?\s*통|시설\s*(?:→|->)|(?:기관|시설|센터|학교|병원|의료기관|읍면동|동\s*주민센터|행정복지센터|주민센터)(?:에서|이|가)\s*(?:대상자\s*)?(?:를\s*)?(?:선정|발굴|지정|파악|선발|관리|추천)|시설에서\s*(?:관리|신청)|시설장|기관장(?:의)?\s*(?:신청|추천)|공문\s*(?:신청|발송|으로)|연계\s*신청|지정\s*(?:의료기관|기관)에서\s*(?:청구|신청))/;
/** 학교·어린이집·유치원이 알아서 처리 */
const SCHOOL = /((?:학교|어린이집|유치원|단위학교|해당\s*학교|재학\s*중인\s*학교|학교별)(?:에서|를\s*통해|을\s*통해|가|별로)\s*(?:일괄|직접|자체|대상자|수요조사|명단|신청|확정|지원|지급|제공|실시|운영|관리|접수|구매|계약|안내)|학교장\s*(?:추천|신청))/;
/** 본인·가족이 신청한다는 문구 */
/** 학교장 추천·학교 선발: 학교가 '대상자를 고르는' 경우 → institution (학교가 일괄 처리해 모두 받는 경우는 auto) */
const SCHOOL_PICK = /(학교장\s*(?:의\s*)?추천|학교(?:의|에서)?\s*추천|학교(?:에서|별)\s*(?:대상자\s*)?(?:선발|선정|추천))/;
const SELF = /(직접\s*(?:전화|연락|방문|문의|상담)|서류\s*(?:접수|제출)|\(\s*(?:지원자|신청자|신청인|본인)\s*\)|(?:방문|온라인|인터넷|우편|전화|팩스|이메일|E-?mail|모바일|앱|홈페이지|누리집|복지로|정부24|방문\s*또는\s*온라인)\s*(?:으로\s*|을\s*통해\s*|에서\s*|접수\s*|·\s*)?신청|신청서|신청인|신청자|본인\s*(?:또는|이|·|및)|대리\s*신청|대리인|가족(?:이|도)?\s*신청|직접\s*신청|신청\s*(?:하시면|하면|가능|접수|기간|방법\s*:|장소|기관|하여야|해야|후|시)|접수(?:처|기관|\s*:)|제출|주민센터(?:에|로|를)?\s*(?:방문|신청|문의)|행정복지센터(?:에|로|를)?\s*(?:방문|신청)|사업주에게|회원\s*가입|예약|모집|선착순)/;
/** 신청은 없어도 직접 가서 이용·증빙해야 하는 현장형 (예방접종, 관람료·주차요금 감면 등) */
const ON_SITE = /(동물병원|대행업체|판매처|가맹점|우체국|자율\s*대여|대여|방문하여|방문\s*후|방문\s*시|이용\s*시|관람\s*시|출차\s*시|결제\s*시|탑승\s*시|입장\s*시|증빙(?:서류)?\s*(?:제출|제시|확인)|신분증\s*제시|제시\s*시|위탁의료기관|의료기관\s*방문|접종|수령\s*(?:가능|하)|방문\s*수령|회원\s*가입)/;
const ON_SITE_NAME = /(약국|심야|도포|구강|치과|지역화폐|페이|발급|예방접종|접종|관람료|입장료|이용료|사용료|수강료|주차|요금\s*(?:감면|할인)|통행료|할인|감면|무료\s*(?:이용|입장|관람)|셔틀|버스|택시|이용권|검진|선별검사|검사)/;
/** 복지로 지자체 API 의 기본 표기 — 단독으로는 약한 근거 */
const BOKJIRO_DIRECT = /직접\s*지원\s*\(별도\s*신청사항\s*없음\)/g;
/** '별도 신청사항 없음' 표기만 있을 때 자동 지급으로 볼 만한 이름 */
const AUTO_NAME_HINT = /(명절|설날|추석|위문|격려금|위로금|위로비|생일\s*축하|건강보험료|장기요양보험료|무연고|행려|공영장례|교복|급식|졸업앨범|본인부담금\s*(?:면제|감면|경감))/;
/** 자동 문구와 함께 있어도 신청 경로가 열려 있음을 뜻하는 문구 */
const MIXED = /((?:온라인|인터넷|방문)(?:으로)?\s*신청(?!\s*[:：]?\s*(?:해당\s*없|불필요|없|불가|X|필요\s*(?:없|X)))|신청하시면|신청하면|신청도\s*가능|신청\s*가능|신청할\s*수|신청을?\s*하여야|신청해야|선착순|모집|예약|(?:주민센터|행정복지센터|구청|시청|군청|읍면사무소|보건소)(?:\s*및\s*\S+)?\s*(?:로|으로|에|에서)\s*신청(?!\s*(?:불필요|없|불요)))/;
/** 주민 안전보험 (시민·구민·군민안전보험 등) — 가입은 자동, 보험금은 직접 청구 */
const AUTO_INSURANCE_NAME = /((?:시민|구민|군민|도민|주민|區民)\s*(?:안전|생활안전|자전거)?\s*(?:공제\s*)?보험|자전거\s*보험|안전\s*보험\s*가입\s*지원)/;
/** 명절 위문·격려금 (대개 명단 추출로 자동 지급) */
const HOLIDAY_GIFT_NAME = /(명절|설날|추석|설\s*·?\s*추석|위문(?:금|품)?|격려금|위로금\s*지급|생일\s*축하)/;
/** 시설·기관 대상 (대상 문구 앞머리) */
const FACILITY_TARGET = /^\s*[-·○◦*•ㅇ\d.)]*\s*(?:관내\s*|도내\s*|시\s*관내\s*)?(?:사회복지시설|복지시설|노인복지시설|장애인복지시설|아동복지시설|아동양육시설|생활시설|거주시설|보호시설|경로당|노인정|노인복지관|장애인복지관|지역아동센터|어린이집|유치원|단체|법인|보훈단체|사회복지법인|비영리)/;
const FACILITY_NAME = /((?:사회복지|노인|장애인|아동|아동복지|아동양육|정신요양|생활|거주|보호|양로|요양|노숙인|한부모가족복지)\s*시설\s*(?:입소자|생활자|거주자|이용자|아동|입소|생활|거주|명절|위문|아동\s*(?:간식|부식|급식))|시설\s*(?:입소|거주|생활)\s*(?:아동|청소년|장애인|노인|어르신|자)|시설아동|그룹홈\s*(?:아동|입소)|경로당\s*(?:운영|냉난방|난방|양곡|급식|활성화|지원)|(?:종사자|사회복지사)\s*(?:처우|수당|복지|지원|교육|보수|인건비|포인트))/;
/** 반드시 본인 신청이 필요한 핵심 급여 (전국 사업) — 자동 문구가 섞여 있어도 self */
const CORE_SELF_NAME = /^(?:국민)?기초생활보장\s*(?:\(|-|·)?\s*(?:생계|의료|주거|교육|해산|장제)\s*급여|^(?:생계|의료|주거|교육)급여(?:\s|\(|$)|^기초연금$|^아동수당$|^부모급여|^첫만남이용권|^한부모가족\s*(?:아동양육비|복지급여)|^장애인연금$|^장애수당$|^장애아동수당$|^긴급복지|^에너지바우처|^청년월세|^근로장려금|^자녀장려금|^국민취업지원제도|^노인맞춤돌봄서비스$|^장애인\s*활동지원|^노인장기요양보험$|^보육료\s*지원$|^디딤씨앗통장$|^드림스타트$|^차상위계층\s*확인$/;
/** 사람이 아니라 운영 기관·법인·시설을 지원하는 사업 (신청방법 정보가 없을 때만 적용) */
const OPERATOR_DESC = /(수탁\s*운영\s*법인|운영\s*법인(?:을|를)?\s*지원|(?:수행|운영)\s*기관(?:을|를|에)\s*(?:지원|운영비)|(?:시설|법인|단체)(?:을|를|에)\s*(?:지원하여|운영비)|설치\s*(?:및\s*)?운영비(?:를|을)?\s*지원|직장어린이집\s*(?:설치|운영의\s*내실화))/;

const clip = (s: string, i: number, n = 70) => {
  const a = Math.max(0, i - 18);
  const t = s.slice(a, a + n).replace(/\s+/g, " ").trim();
  return (a > 0 ? "…" : "") + t + (a + n < s.length ? "…" : "");
};
function snippet(text: string, re: RegExp): string {
  const m = re.exec(text);
  return m ? clip(text, m.index) : clip(text, 0);
}
const norm = (s?: string) => (s ?? "").replace(/&#13;|\r/g, "\n").replace(/[ \t]+/g, " ");

export function classifyApplyType(x: ApplyInput): ApplyResult {
  const name = x.name;
  const rawApply = norm(x.applyMethod);
  const bokjiroDirect = BOKJIRO_DIRECT.test(rawApply);
  BOKJIRO_DIRECT.lastIndex = 0;
  const apply = rawApply.replace(BOKJIRO_DIRECT, " ").trim();
  const channel = x.applyChannel ?? "";
  const desc = norm([x.summary, x.target, x.criteria, x.benefit].filter(Boolean).join("\n"));
  const channels = channel.split(/\|\||,\s*/).map((c) => c.trim()).filter(Boolean);
  const channelNoApply = channels.length > 0 && channels.every((c) => /신청불필요/.test(c));

  // 0. 핵심 급여는 본인 신청 (전국 사업)
  if (x.scope === "national" && CORE_SELF_NAME.test(name)) {
    return { type: "self", reason: "본인·가족이 신청해야 받는 핵심 급여·서비스" + (apply ? ` — 신청방법: ${clip(apply, 0, 50)}` : "") };
  }

  // 0-1. 주민 안전보험(시민·구민·군민안전보험): 가입은 자동이지만 보험금은 사고 시 본인·가족이 직접 청구해야 받는다 → self
  if (AUTO_INSURANCE_NAME.test(name)) {
    return { type: "self", reason: "가입은 자동이지만 사고가 나면 본인·가족이 보험금을 직접 청구해야 받음" };
  }
  // 0-2. 단체보험 자동가입(저소득층 아동보험·서민자립지원보험 등)도 보험금·혜택은 직접 청구해야 받는다 → self
  const enrollClaim = /(자동\s*가입|가입\s*절차\s*없이|일괄\s*가입)/.exec(apply);
  if (enrollClaim && /(보험)/.test(name + apply) && /(청구|혜택\s*신청|보험금\s*(?:신청|지급\s*신청))/.test(apply)) {
    return { type: "self", reason: `가입은 자동이지만 보험금·혜택은 직접 청구해야 받음: ${clip(apply, enrollClaim.index)}` };
  }

  // 1. 신청방법 본문이 있으면 그 문구로 판단
  if (apply.trim()) {
    const noApply = NO_APPLY.test(apply);
    // 정부24 기본 문구('해당 서비스는 신청없이 자격대상자에게 자동적으로 제공됩니다')는 '신청 불필요'로만 보고, 자동 지급의 근거로는 쓰지 않는다
    const auto = AUTO.test(apply.replace(/해당\s*서비스는\s*(?:별도의\s*신청\s*절차\s*없이|신청\s*없이)\s*자격\s*대상자에게\s*자동적으로\s*제공(?:됩니다|되나)/g, " "));
    const self = SELF.test(apply);
    const inst = INSTITUTION.test(apply);
    const school = SCHOOL.test(apply);
    const onSite = ON_SITE.test(apply) && !auto;
    if (noApply || (channelNoApply && (!self || ON_SITE.test(apply)))) {
      // '신청 없이 자동 제공되나, 신청하시면 지원 가능' 처럼 신청 경로도 열려 있으면 미확정
      if (MIXED.test(apply) && !school) {
        return { type: "unknown", reason: `자동 제공과 신청 안내가 함께 있음: ${snippet(apply, MIXED)}` };
      }
      if (onSite || (ON_SITE_NAME.test(name) && !auto && !inst && !school && !HOLIDAY_GIFT_NAME.test(name))) {
        return { type: "unknown", reason: `따로 신청은 없지만 직접 방문·이용해야 함: ${snippet(apply, ON_SITE.test(apply) ? ON_SITE : NO_APPLY)}` };
      }
      if (/(지역화폐|사랑상품권|사랑카드|페이$)/.test(name) && !HOLIDAY_GIFT_NAME.test(name)) return { type: "unknown", reason: `따로 신청은 없지만 직접 구매·이용해야 함: ${snippet(apply, NO_APPLY)}` };
      if (school && SCHOOL_PICK.test(apply)) return { type: "institution", reason: `학교 추천·선정: ${snippet(apply, SCHOOL_PICK)}` };
      if (school) return { type: "auto", reason: `학교·어린이집이 처리: ${snippet(apply, SCHOOL)}` };
      if (inst) return { type: "institution", reason: `기관 추천·선정: ${snippet(apply, INSTITUTION)}` };
      if (noApply) return { type: "auto", reason: `신청 불필요: ${snippet(apply, NO_APPLY)}` };
      return { type: "auto", reason: `정부24 신청방법 구분 '신청불필요'${auto ? ` · ${snippet(apply, AUTO)}` : ` · ${clip(apply, 0, 50)}`}` };
    }
    if (auto && !self) {
      if (school) return { type: "auto", reason: `학교·어린이집이 처리: ${snippet(apply, SCHOOL)}` };
      return { type: "auto", reason: `자동·직권 처리: ${snippet(apply, AUTO)}` };
    }
    if (school && !self && SCHOOL_PICK.test(apply)) return { type: "institution", reason: `학교 추천·선정: ${snippet(apply, SCHOOL_PICK)}` };
    if (school && !self) return { type: "auto", reason: `학교·어린이집이 처리: ${snippet(apply, SCHOOL)}` };
    if (inst && !self) return { type: "institution", reason: `기관 추천·의뢰: ${snippet(apply, INSTITUTION)}` };
    if (self) return { type: "self", reason: `신청방법: ${snippet(apply, SELF)}` };
    // 기관명만 적힌 신청방법 ('거주지 행정복지센터') 은 직접 신청으로 본다
    if (/(센터|주민센터|구청|시청|군청|보건소|공단|사무소|기관|홈페이지|누리집|www\.|http|☎|\d{2,4}-\d{3,4})/.test(apply) || channels.some((c) => /방문|온라인|인터넷|전화|우편|모바일|E-mail|팩스/.test(c))) {
      return { type: "self", reason: `신청처: ${clip(apply, 0, 60)}` };
    }
  } else if (channelNoApply) {
    return { type: "auto", reason: "정부24 신청방법 구분 '신청불필요'" };
  } else if (bokjiroDirect) {
    if (AUTO_NAME_HINT.test(name) && !ON_SITE_NAME.test(name)) return { type: "auto", reason: `복지로 신청방법 '직접 지원(별도 신청사항 없음)' + 이름(${snippet(name, AUTO_NAME_HINT)})` };
    return { type: "unknown", reason: "복지로 신청방법에 '직접 지원(별도 신청사항 없음)'만 있음 — 확인 필요" };
  }

  // 2. 신청방법 본문이 없으면 이름·설명·대상 문구로 판단
  if (FACILITY_NAME.test(name)) return { type: "institution", reason: `시설·기관 대상: ${snippet(name, FACILITY_NAME)}` };
  const target = norm(x.target);
  if (FACILITY_TARGET.test(target) && !/(이용자|이용\s*아동|이용하|다니는|재원|가정|가구|개인)/.test(target.slice(0, 40))) {
    return { type: "institution", reason: `시설·기관 대상: ${clip(target, 0, 60)}` };
  }
  if (x.supportType && /시설입소/.test(x.supportType) && !/시설이용/.test(x.supportType) && !apply.trim()) {
    return { type: "institution", reason: `제공유형 '시설입소'` };
  }
  if (!apply.trim() && !channels.length && (OPERATOR_DESC.test(desc) || OPERATOR_DESC.test(name))) {
    return { type: "institution", reason: `운영 기관·시설 지원: ${snippet(desc || name, OPERATOR_DESC)}` };
  }
  if (desc && !SELF.test(desc)) {
    if (NO_APPLY.test(desc)) {
      if (ON_SITE.test(desc) || ON_SITE_NAME.test(name)) return { type: "unknown", reason: `따로 신청은 없지만 직접 이용해야 함: ${snippet(desc, NO_APPLY)}` };
      return { type: "auto", reason: `설명: ${snippet(desc, NO_APPLY)}` };
    }
    if (AUTO.test(desc)) return { type: "auto", reason: `설명: ${snippet(desc, AUTO)}` };
    if (SCHOOL.test(desc)) return { type: "auto", reason: `학교·어린이집이 처리: ${snippet(desc, SCHOOL)}` };
    if (/(기관|시설|학교장|센터)\s*(?:의\s*)?추천|추천\s*(?:을\s*)?받은|대상자\s*선정\s*후\s*통보/.test(desc)) {
      return { type: "institution", reason: `기관 추천·선정: ${snippet(desc, /(기관|시설|학교장|센터)\s*(?:의\s*)?추천|추천\s*(?:을\s*)?받은|대상자\s*선정\s*후\s*통보/)}` };
    }
  }
  if (apply.trim() || channels.length) return { type: "self", reason: apply.trim() ? `신청방법: ${clip(apply, 0, 60)}` : `신청 경로: ${channel}` };
  return { type: "unknown", reason: "신청 방법 정보 없음" };
}
