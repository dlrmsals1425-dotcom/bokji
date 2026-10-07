/**
 * 결과 화면 문구 도우미: 판정 이유를 사람 말 한 줄로, 신청 방법 원문을 '어디서·어떻게·무엇을 가져가서'로 요약한다.
 * 원문에 신청 정보가 없으면 주민센터·☎129 일반 안내로 대신한다 (상세 화면의 대체 안내와 같은 원칙).
 */
import type { Program } from "../data/types";
import { normalizeText } from "../data/text";
import type { Evaluation, Tier } from "../engine/types";

const clean = (s: string) =>
  s
    .replace(/\s+—\s.*$/, "")
    .replace(/\s*\(입력:.*\)$/, "")
    .replace(/\s*\((?:원문 확인|무료 상담)\)/g, "")
    .replace(/관련 조건/g, "")
    .trim();

/** 맞은 조건 (최대 n개, 조건 이름만) */
export function metReasons(ev: Evaluation, n = 3): string[] {
  return ev.reasons.filter((r) => r.kind === "met").slice(0, n).map((r) => clean(r.text));
}

/** 더 확인할 조건 한 가지 (가능성 있음·확인 필요일 때) */
export function toCheck(ev: Evaluation): string | undefined {
  const r = ev.reasons.find((x) => x.kind === "unknown") ?? ev.reasons.find((x) => x.kind === "note");
  if (!r) return undefined;
  return clean(r.text.replace(/^(추가로 확인할 조건|상담으로 판단하는 조건):\s*/, ""));
}

/** 맞지 않는 조건 한 가지 */
export function unmetReason(ev: Evaluation): string | undefined {
  const r = ev.reasons.find((x) => x.kind === "unmet");
  return r ? clean(r.text) : undefined;
}

/** 판정 단계의 뜻 (공식 용어 옆에 붙이는 사람 말) */
export const TIER_PLAIN: Record<Tier, string> = {
  eligible: "입력하신 내용이 공개된 지원 조건에 맞습니다.",
  likely: "조건에 맞을 수 있습니다. 신청할 때 한두 가지를 더 확인합니다.",
  check: "공개된 정보만으로는 판단하기 어렵습니다. 담당 기관에 물어보세요.",
  ineligible: "입력하신 내용과 지원 조건이 맞지 않습니다.",
};

const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** 카드·목록용 판단 이유 한 문장 */
export function reasonSentence(ev: Evaluation): string {
  const met = metReasons(ev, 3).map((x) => shorten(x, 40));
  if (ev.tier === "ineligible") {
    const u = unmetReason(ev);
    return u ? `맞지 않는 조건: ${shorten(u, 60)}` : ev.headline;
  }
  const check = ev.tier !== "eligible" ? toCheck(ev) : undefined;
  const parts: string[] = [];
  if (met.length) parts.push(`${met.join(", ")}에 해당합니다.`);
  if (check) parts.push(`확인할 것: ${shorten(check, 56)}`);
  return parts.join(" ") || ev.headline;
}

export type Channel = "visit" | "online" | "phone";
export const CHANNEL_LABEL: Record<Channel, string> = { visit: "방문", online: "온라인", phone: "전화" };

export interface HowTo {
  channels: Channel[];
  /** 신청하러 갈 곳 */
  place: string;
  /** 전화 문의 (첫 줄) */
  phone?: string;
  /** 가져갈 것 (짧게 최대 4개) */
  bring: string[];
  /** 원문에 신청 정보가 없어 일반 안내로 대신했는지 */
  fallback: boolean;
}

const CENTER = "주소지 행정복지센터(주민센터)";
const CENTER_RE = /(행정복지센터|주민센터|읍[･·ㆍ]?\s*면[･·ㆍ]?\s*동|(?:읍|면|동|읍[･·ㆍ,]?\s*면)\s*사무소)/;
/** 원문 신청 방법에 자주 나오는 창구 (QA 1차 H3: 원문이 다른 곳을 가리키는데 주민센터로 바뀌던 문제) */
const KNOWN_PLACES: [RegExp, string][] = [
  [/건강\s*보험\s*공단|건보\s*공단/, "국민건강보험공단 지사"],
  [/국민\s*연금\s*공단/, "국민연금공단 지사"],
  [/보훈\s*(?:지\s*\(?\s*방\s*\)?\s*)?청|보훈\s*지청/, "관할 보훈(지)청"],
  [/고용\s*(?:복지\s*\+?\s*)?센터/, "가까운 고용센터"],
  [/법률\s*구조\s*공단/, "대한법률구조공단"],
  [/근로\s*복지\s*공단/, "근로복지공단"],
  [/서민\s*금융\s*진흥원|서민금융\s*통합\s*지원\s*센터/, "서민금융통합지원센터"],
  [/(?:수탁|취급)\s*은행[^.。\n]{0,16}?\)|(?:수탁|취급)\s*은행/, "수탁은행 창구"],
  [/(?:LH|한국\s*토지\s*주택\s*공사)/, "LH(한국토지주택공사)"],
];
/** 그 밖의 기관 이름 (공단·재단·진흥원·공사·협회) — 상담·콜센터는 빼고 */
const ORG_RE = /([가-힣A-Za-z]{2,18}(?:공단|재단|진흥원|공사|협회))/;
/** 이름으로 정해지는 창구 (원문에 신청 방법이 비어 있을 때) */
const BY_NAME: [RegExp, string, string][] = [
  [/장기\s*요양/, "국민건강보험공단 지사", "국민건강보험공단 1577-1000"],
  [/국민\s*연금/, "국민연금공단 지사", "국민연금공단 1355"],
];

/** 신청하러 갈 곳 (원문 신청 방법 → 접수기관 → 문의처 순, 모르면 '원문에 적힌 곳') */
export function placeOf(p: Pick<Program, "name" | "applyMethod" | "provider" | "contact" | "applyUrl">, channels: Channel[] = []): string {
  const apply = (p.applyMethod ?? "").replace(/\s+/g, " ").trim();
  if (/(신청\s*(?:이|은)?\s*없이|별도\s*(?:신청|가입)\s*(?:사항|절차)?\s*(?:없|불필요|불요)|신청\s*불필요|직접\s*신청하지\s*않아도|자동(?:적)?으로\s*(?:제공|지급|지원))/.test(apply)) {
    const c = (p.contact ?? "").split(/\n/)[0]?.split(/☎/)[0]?.trim();
    return c && c.length < 24 ? `따로 신청하지 않아도 돼요 (문의: ${c})` : "따로 신청하지 않아도 돼요";
  }
  if (/(보건소|보건\s*의료원|보건\s*지소)/.test(apply) && !CENTER_RE.test(apply)) return /보건\s*의료원/.test(apply) ? "보건의료원(보건소)" : "가까운 보건소";
  const known = KNOWN_PLACES.find(([re]) => re.test(apply))?.[1];
  const org = known ?? ORG_RE.exec(apply.replace(/[가-힣A-Za-z]*(?:콜\s*센터|상담\s*센터)/g, " "))?.[1];
  if (CENTER_RE.test(apply)) return known ? `${CENTER} 또는 ${known}` : /보건소/.test(apply) ? `${CENTER} 또는 보건소` : CENTER;
  const visit = channels.includes("visit");
  if (!visit && channels.includes("online") && (apply || p.applyUrl)) return org ? `온라인 신청 (${org})` : "온라인 신청";
  if (org) return org;
  const hall = /(시청|군청|구청|시·군·구청|시군구청|도청|시군구\s*:|해당\s*(?:시군|시·군|구·군|시|군|구)\s)/.exec(apply);
  if (hall) return hall[1] === "도청" ? "도청 담당 부서" : "시·군·구청 담당 부서";
  const welfare = /([가-힣]{2,14}(?:복지관|복지센터|지원센터|가족센터))/.exec(apply.replace(/(?:콜|상담)\s*센터/g, " "));
  if (welfare) return welfare[1];
  if (/(유치원|어린이집|학교)(?:에서|에\s*(?:방문|신청)|\s*(?:방문|통해|통하여))/.test(apply)) return "다니는 학교·유치원·어린이집";
  if (p.provider && p.provider !== "주민센터" && p.provider.length < 24) return p.provider;
  if (p.provider === "주민센터") return CENTER;
  const contactOrg = (p.contact ?? "").split(/\n/)[0]?.split(/☎/)[0]?.trim();
  if (apply) return contactOrg && contactOrg.length < 24 ? `원문에 적힌 곳 (문의: ${contactOrg})` : "원문에 적힌 곳 (모르면 ☎129)";
  const byName = BY_NAME.find(([re]) => re.test(p.name));
  if (byName) return byName[1];
  return CENTER;
}

export function howTo(detail: Program | undefined | null, lead: Program): HowTo {
  const p = detail ?? lead;
  const apply = (p.applyMethod ?? "").replace(/\s+/g, " ").trim();
  const contact = (p.contact ?? "").split(/\n/)[0]?.replace(/☎\s*/g, "").trim() || undefined;
  const channels: Channel[] = [];
  if (/(행정복지센터|주민센터|읍[･·ㆍ]?\s*면[･·ㆍ]?\s*동|보건소|방문|창구|지사|지청|은행|센터)/.test(apply.replace(/(?:콜|상담)\s*센터/g, " "))) channels.push("visit");
  if (/(온라인|복지로|정부24|고용24|홈페이지|누리집|인터넷|https?:|www\.|플랫폼|앱|어플)/.test(apply) || p.applyUrl) channels.push("online");
  if (/(전화|유선)/.test(apply) || contact) channels.push("phone");
  const byName = BY_NAME.find(([re]) => re.test(p.name));
  const fallback = !apply && !contact && !p.applyUrl;
  if (fallback) channels.push("visit", "phone");
  return {
    channels: [...new Set(channels)],
    place: placeOf(p, channels),
    phone: contact ?? (fallback ? (byName?.[2] ?? "보건복지상담센터 129") : undefined),
    bring: parseDocs(p.documents),
    fallback,
  };
}

/** 구비 서류 원문 → 짧은 항목 최대 4개 */
export function parseDocs(s?: string): string[] {
  if (!s) return [];
  const t = s.replace(/본인 확인 필요:[\s\S]*$/, "").replace(/관련 서식·안내:[\s\S]*$/, "");
  const parts = t
    .split(/\s*(?:○|ㅇ|(?<![A-Za-z])-(?![A-Za-z])|·|•|\n|,)\s*/)
    .map((x) => x.replace(/[*※].*$/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((x) => x && !/^(해당\s*없음|본인\s*신청|대리\s*신청|없음)$/.test(x) && x.length <= 28);
  return [...new Set(parts)].slice(0, 4);
}

/** 긴 원문에서 첫 문장만 짧게 */
export function firstLine(s: string | undefined, max = 60): string {
  if (!s) return "";
  const t = normalizeText(s).replace(/^[\s○●□■◆ㅇ\-·•*]+/, "").split(/\n|(?<=다\.)\s|(?<=요\.)\s/)[0].replace(/\s+/g, " ").trim();
  return shorten(t, max);
}
