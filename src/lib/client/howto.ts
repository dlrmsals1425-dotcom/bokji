/**
 * 결과 화면 문구 도우미: 판정 이유를 사람 말 한 줄로, 신청 방법 원문을 '어디서·어떻게·무엇을 가져가서'로 요약한다.
 * 원문에 신청 정보가 없으면 주민센터·☎129 일반 안내로 대신한다 (상세 화면의 대체 안내와 같은 원칙).
 */
import type { Program } from "../data/types";
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

export function howTo(detail: Program | undefined | null, lead: Program): HowTo {
  const p = detail ?? lead;
  const apply = (p.applyMethod ?? "").replace(/\s+/g, " ").trim();
  const contact = (p.contact ?? "").split(/\n/)[0]?.replace(/☎\s*/g, "").trim() || undefined;
  const channels: Channel[] = [];
  if (/(행정복지센터|주민센터|읍[･·]?\s*면[･·]?\s*동|보건소|방문|창구|지사)/.test(apply)) channels.push("visit");
  if (/(온라인|복지로|정부24|홈페이지|누리집|https?:|www\.|플랫폼)/.test(apply) || p.applyUrl) channels.push("online");
  if (/(전화|유선)/.test(apply) || contact) channels.push("phone");
  const center = "주소지 행정복지센터(주민센터)";
  const place = /보건소/.test(apply)
    ? "가까운 보건소"
    : /(행정복지센터|주민센터|읍[･·]?\s*면[･·]?\s*동)/.test(apply)
      ? center
      : p.provider && p.provider !== "주민센터" && p.provider.length < 24
        ? p.provider
        : center;
  const fallback = !apply && !contact && !p.applyUrl;
  if (fallback) channels.push("visit", "phone");
  return {
    channels: [...new Set(channels)],
    place,
    phone: contact ?? (fallback ? "보건복지상담센터 129" : undefined),
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
  const t = s.replace(/^[\s○ㅇ\-·•*]+/, "").split(/\n|(?<=다\.)\s|(?<=요\.)\s/)[0].replace(/\s+/g, " ").trim();
  return shorten(t, max);
}
