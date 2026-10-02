import type { Category } from "../../../src/lib/data/types";
import { CATEGORIES } from "../../../src/lib/data/types";

/** 통합돌봄 원 분류(7개) → 복지로 관심주제(15개) (설계서 5.3) */
const ICARE_CATEGORY: Record<string, Category> = {
  일상생활돌봄: "보호·돌봄",
  건강관리예방: "신체건강",
  보건의료: "신체건강",
  주거복지: "주거",
  요양: "보호·돌봄",
  장애지원: "보호·돌봄",
  기타: "보호·돌봄",
};

/** 통합돌봄 서비스 개념(26개) 중 분야를 바꿔야 하는 것 */
const CONCEPT_CATEGORY: Record<string, Category> = {
  mental: "정신건강",
  housing_repair: "주거",
};

export function icareCategory(category: string, concept?: string, conceptLabel?: string): Category {
  if (concept && CONCEPT_CATEGORY[concept]) return CONCEPT_CATEGORY[concept];
  if (conceptLabel?.includes("정신건강")) return "정신건강";
  if (conceptLabel?.includes("주거환경")) return "주거";
  return ICARE_CATEGORY[category] ?? "보호·돌봄";
}

/** 정부24 서비스분야 → 복지로 관심주제 */
const GOV24_FIELD: [RegExp, Category][] = [
  [/임신|출산/, "임신·출산"],
  [/보육/, "보육"],
  [/교육/, "교육"],
  [/고용|창업|일자리/, "일자리"],
  [/주거|자립/, "주거"],
  [/보건|의료|건강/, "신체건강"],
  [/보호|돌봄/, "보호·돌봄"],
  [/문화|환경|체육|관광/, "문화·여가"],
  [/안전|재난|행정/, "안전·위기"],
  [/금융|대출/, "서민금융"],
  [/에너지/, "에너지"],
  [/법률/, "법률"],
  [/생활안정|생활/, "생활지원"],
  [/농림|축산|어업/, "생활지원"],
];

export function gov24Category(field: string | undefined): Category {
  if (!field) return "생활지원";
  for (const [re, c] of GOV24_FIELD) if (re.test(field)) return c;
  return "생활지원";
}

export function asCategory(c: string | undefined): Category {
  return (CATEGORIES as readonly string[]).includes(c ?? "") ? (c as Category) : "생활지원";
}
