import type { Cond } from "../../../src/lib/engine/types";
import { age, any, benefit, children, disability, kid, trait, RECIPIENT_NEAR } from "./helpers";

/**
 * 복지로 색인 태그 → 조건 초안 (자동 변환).
 * - 생애주기 태그(l): 대상 연령 집단. 여러 개면 OR. 모든 성인 태그(청년·중장년·노년)를 다 가지면 제한 없음.
 * - 가구상황 태그(h): '관련 대상' 신호일 뿐 배타 조건이 아니므로 soft (FALSE → '확인 필요').
 */
export function lifecycleCond(tags: string[]): Cond | null {
  const t = new Set(tags);
  if (t.size === 0) return null;
  const adults = ["청년", "중장년", "노년"].every((x) => t.has(x));
  const kids = ["영유아", "아동", "청소년"].every((x) => t.has(x));
  if (adults && kids) return null;
  const parts: Cond[] = [];
  if (t.has("임신·출산")) parts.push(children(["pregnant", "0-1"], "임신·출산 가구"));
  if (t.has("영유아")) parts.push(any(undefined, kid(0, 5, "영유아 자녀"), age(0, 5, "영유아")));
  if (t.has("아동")) parts.push(any(undefined, kid(0, 12, "아동 자녀"), age(0, 12, "아동")));
  if (t.has("청소년")) parts.push(any(undefined, kid(13, 18, "청소년 자녀"), age(9, 24, "청소년 본인")));
  if (adults) parts.push(age(19, undefined, "성인(만 19세 이상)"));
  else {
    if (t.has("청년")) parts.push(age(19, 39, "청년(만 19~39세 기준)"));
    if (t.has("중장년")) parts.push(age(40, 64, "중장년(만 40~64세)"));
    if (t.has("노년")) parts.push(age(65, undefined, "노년(만 65세 이상)"));
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : any(`복지로 생애주기(${[...t].join("·")})`, ...parts);
}

export function householdCond(tags: string[]): Cond | null {
  const parts: Cond[] = [];
  for (const tag of tags) {
    switch (tag) {
      case "저소득":
        parts.push(benefit(RECIPIENT_NEAR, "저소득 가구(수급·차상위 등)", { soft: true }));
        break;
      case "장애인":
        parts.push(disability(["self", "member"], "장애가 있는 본인 또는 가구원", undefined, { soft: true }));
        break;
      case "보훈대상자":
        parts.push(trait(["veteran"], "보훈대상 가구", { soft: true }));
        break;
      case "한부모·조손":
        parts.push(trait(["single_parent"], "한부모·조손 가구", { soft: true }));
        break;
      case "다문화·탈북민":
        parts.push(trait(["multicultural"], "다문화·북한이탈주민 가구", { soft: true }));
        break;
      case "다자녀":
        parts.push(trait(["multi_child"], "다자녀 가구", { soft: true }));
        break;
    }
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : any(undefined, ...parts);
}
