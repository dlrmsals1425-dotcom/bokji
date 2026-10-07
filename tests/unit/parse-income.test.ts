import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras, understoodLine } from "@/lib/client/parse";
import { DIM_BY_ID, EMPTY_EXTRAS, answersFor, dimAvailable, type Situation } from "@/lib/client/v2";
import type { RegionIndex } from "@/lib/data/types";

const regions: RegionIndex = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/bundles/v1/regions.json"), "utf8"));
const T = { year: 2026, month: 10, day: 7 };
const P = (s: string) => parseSituation(s, regions, T);
const USER = "용인시에 사는 86년생이야, 자녀는 2명이 있어. 월급은 세후 400정도되";

describe("사용자 문장: 용인 · 86년생 · 자녀 2명 · 세후 400", () => {
  const r = P(USER);
  it("지역·나이·자녀·소득·가구", () => {
    expect(r.mode).toBe("self");
    expect(r.profile).toMatchObject({ sido: "41000", sigungu: "41460", age: "40-49", householdSize: 4 });
    expect(r.income).toMatchObject({ manwon: 400 });
    expect(r.income?.annual).toBeUndefined();
    expect(r.childCount).toBe(2);
    expect(parsedExtras(r)).toEqual({ incomeManwon: 400, childCount: 2 });
    // '월급' → 직장에 다님 (일 질문도 다시 묻지 않음) · 본인이라 '생일' 말투
    expect(r.profile.activity).toBe("employed");
    expect(r.notes.join(" ")).toMatch(/생일이 지나지 않았다면 만 39세/);
  });
  it("가구는 배우자 포함으로 가정 + '배우자 없이 3명' 한 번에 바꾸기", () => {
    expect(r.householdAlt).toMatchObject({ size: 3, mainSize: 4, button: "배우자 없이 3명", singleParent: true });
    const line = understoodLine(r);
    expect(line).toContain("경기 용인시");
    expect(line).toContain("1986년생");
    expect(line).toContain("같이 사는 사람: 본인 포함 4명 (배우자 포함으로 봤어요 · 자녀 2명)");
    expect(line).toContain("월 소득 약 400만원 (세후)");
    expect(r.householdAlt?.label).toBe("같이 사는 사람: 본인 포함 3명 (배우자 없이 · 자녀 2명)");
    // 출생연도·자녀 수를 소득으로 읽지 않음
    expect(line).not.toMatch(/86만원|2만원/);
  });
  it("결과 화면에서 소득·가구원 수를 다시 묻지 않고, 자녀 질문은 '나이'만", () => {
    const s: Situation = { profile: r.profile, x: { ...EMPTY_EXTRAS, ...parsedExtras(r) }, mode: "self" };
    expect(DIM_BY_ID.income.isUnknown(s)).toBe(false);
    expect(DIM_BY_ID.alone.isUnknown(s)).toBe(false);
    expect(DIM_BY_ID.activity.isUnknown(s)).toBe(false);
    expect(dimAvailable(DIM_BY_ID.children, s)).toBe(true);
    expect(DIM_BY_ID.children.q("self", s)).toBe("자녀 2명의 나이는요? (여럿이면 가장 어린 자녀)");
    expect(answersFor(DIM_BY_ID.children, s).map((a) => a.key)).not.toContain("none");
    // 자녀 수를 모르면 원래 질문 그대로
    const s0: Situation = { ...s, x: EMPTY_EXTRAS };
    expect(DIM_BY_ID.children.q("self", s0)).toMatch(/함께 사는 자녀가 있나요/);
    expect(answersFor(DIM_BY_ID.children, s0).map((a) => a.key)).toContain("none");
  });
});

describe("소득 표현 (만원/월)", () => {
  const cases: [string, number, number?][] = [
    ["월급은 세후 400정도되", 400],
    ["400정도 벌어", 400],
    ["400쯤 벌어요", 400],
    ["소득은 400 정도 돼", 400],
    ["세후 400", 400],
    ["실수령 350", 350],
    ["월 400", 400],
    ["400만원 벌어요", 400],
    ["소득 400만원이야", 400],
    ["월급 4백", 400],
    ["수입 400만", 400],
    ["월급 4백만원임", 400],
    ["한 달에 300 벌어요", 300],
    ["월급 3,500,000원", 350],
    ["세후 400이요", 400],
    ["월급은 400야", 400],
    ["연봉 5000", 417, 5000],
    ["연봉 5천만원이에요", 417, 5000],
    ["연봉 6000만원", 500, 6000],
    ["연 소득 3600", 300, 3600],
  ];
  for (const [s, m, annual] of cases) {
    it(s, () => {
      const r = P(s);
      expect(r.income?.manwon).toBe(m);
      expect(r.income?.annual).toBe(annual);
    });
  }
  it("연봉은 월로 바꿨다고 표시", () => {
    expect(understoodLine(P("연봉 5000"))).toContain("연봉 5,000만원 → 월 약 417만원으로 계산");
  });
  it("소득 없음 → 0", () => {
    expect(P("소득 없어요").income?.manwon).toBe(0);
    expect(P("수입이 전혀 없음").income?.manwon).toBe(0);
  });
  it("출생연도·나이·자녀 수·가구원 수·월세·보증금·%는 소득이 아님", () => {
    for (const s of ["86년생", "1986년생 용인", "만 37세", "37살", "자녀 2명", "4인 가구", "월세 50만원", "보증금 5000에 월세 40", "소득 하위 70", "중위소득 50% 이하", "3월생", "아이 3살"]) {
      expect(P(s).income, s).toBeUndefined();
    }
  });
  it("여러 금액이면 처음 금액 + 확인 문구", () => {
    const r = P("남편 월급 300 내 월급 200");
    expect(r.income?.manwon).toBe(300);
    expect(r.notes.join(" ")).toMatch(/금액이 여러 개/);
  });
});

describe("일 (월급 → 직장)", () => {
  it("월급·연봉·회사 → 직장 / 자영업 / 실직·부모님 문장은 두지 않음", () => {
    expect(P("월급 300").profile.activity).toBe("employed");
    expect(P("회사 다니고 연봉 4000").profile.activity).toBe("employed");
    expect(P("자영업 하고 한 달에 300 벌어요").profile.activity).toBe("self_employed");
    expect(P("실직해서 일자리를 찾고 있어요").profile.activity).toBe("job_seeking");
    expect(P("어머니 소득 월 100만원").profile.activity).toBe("unknown");
  });
});

describe("가구원 수 (본인 찾기에서 자녀 수로)", () => {
  const hh: [string, number, Partial<{ alt: number; single: boolean; kids: number }>][] = [
    ["아이 둘 키워요", 4, { alt: 3, kids: 2 }],
    ["자녀 1명", 3, { alt: 2, kids: 1 }],
    ["아이 셋", 5, { alt: 4, kids: 3 }],
    ["아들 하나 딸 하나", 4, { alt: 3, kids: 2 }],
    ["두 아이 엄마예요", 4, { alt: 3, kids: 2 }],
    ["아내랑 애 둘", 4, { kids: 2 }],
    ["남편이랑 아이 하나", 3, { kids: 1 }],
    ["맞벌이 부부 자녀 2명", 4, { kids: 2 }],
    ["한부모 아이 둘", 3, { single: true, kids: 2 }],
    ["이혼하고 아이 하나 키워요", 2, { single: true, kids: 1 }],
    ["사별 후 자녀 3명", 4, { single: true, kids: 3 }],
    ["혼자 애 둘 키워요", 3, { single: true, kids: 2 }],
    ["부모님 모시고 아이 둘 키워요", 6, { alt: 5, kids: 2 }],
    ["아내와 아이 하나, 어머니랑 같이 살아요", 4, { kids: 1 }],
    ["아이 3살 하나 있어요", 3, { alt: 2, kids: 1 }],
  ];
  for (const [s, size, o] of hh) {
    it(s, () => {
      const r = P(s);
      expect(r.mode).toBe("self");
      expect(r.profile.householdSize).toBe(size);
      if (o.kids !== undefined) expect(r.childCount).toBe(o.kids);
      if (o.alt !== undefined) expect(r.householdAlt?.size).toBe(o.alt);
      else expect(r.householdAlt).toBeUndefined();
      expect(r.profile.traits?.includes("single_parent") ?? false).toBe(!!o.single);
    });
  }
  it("'아이 3살'의 3살은 본인 나이가 아님", () => {
    expect(P("아이 3살 하나 있어요").profile.age).toBe("unknown");
  });
  it("명시한 가구원 수가 먼저", () => {
    expect(P("4인 가구 아이 셋").profile.householdSize).toBe(4);
  });
  it("자녀 없음 + 배우자 → 2명 / 자녀 없음만 → 가구 모름", () => {
    expect(P("자녀 없어요 남편이랑 살아요").profile.householdSize).toBe(2);
    expect(P("아이는 없어요").profile.householdSize).toBe("unknown");
    expect(P("아이는 없어요").childCount).toBe(0);
  });
  it("부모님 대신 찾기는 기존 그대로 (부모님 두 분 = 2인)", () => {
    const r = P("수원시 소재에 계시고 59년생 부모님 두분이 계신다");
    expect(r.mode).toBe("parent");
    expect(r.profile.householdSize).toBe(2);
    expect(r.childCount).toBeUndefined();
    expect(r.householdAlt).toBeUndefined();
  });
});

describe("용인시 지역", () => {
  for (const s of ["용인시", "용인 사는", "경기도 용인시", "용인시 수지구", "용인시 기흥구", "용인시 처인구", "수지구 살아요", "기흥구 거주", "처인구 사는"]) {
    it(s, () => {
      const r = P(s);
      expect(r.profile.sido).toBe("41000");
      expect(r.profile.sigungu).toBe("41460");
      expect(understoodLine(r)).toContain("경기 용인시");
    });
  }
});
