/** QA 6차 후속 (2026-10-09, 5차 검증 보고 N1·N2·N3·N4·N5·N7·N8) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, needsStatus, buildView, classifyOne, scoreV2, topPicksV2, type Extras, type Situation, type V2Item } from "@/lib/client/v2";
import { consentUnderAge, parentConsent, youthUpTo24 } from "@/lib/client/cardNotes";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 9 };
const P = (s: string, hint?: "self" | "parent") => parseSituation(s, regions, today, { hint });
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

function sitOf(text: string, hint?: "self" | "parent"): Situation {
  const r = P(text, hint);
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const b: Extras["benefits"] = {};
  r.profile.benefits?.forEach((k) => (b[k] = true));
  r.benefitsNo?.forEach((k) => (b[k] = false));
  const tr: Extras["traits"] = {};
  r.profile.traits?.forEach((k) => (tr[k] = true));
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: b, traits: tr, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? hint ?? "self" };
}
const progsCache = new Map<string, Program[]>();
function progsFor(p: Profile) {
  const k = `${p.sido}/${p.sigungu}`;
  if (!progsCache.has(k)) progsCache.set(k, [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram));
  return progsCache.get(k)!;
}
function picksOf(sit: Situation) {
  const progs = progsFor(sit.profile);
  const view = buildView(scoreV2(progs, sit), sit, 12);
  return { view, progs, picks: topPicksV2(view, 5, sit).map((g) => g[0]) };
}
const names = (items: V2Item[]) => items.map((i) => i.s.program.name);
const OUT_OF_SCHOOL = /학교\s*밖|꿈드림|학업\s*중단|검정고시|미취학/;

describe("N1 '(자녀) 키우는/둔 엄마·아빠' = 본인 찾기, 자녀 나이는 자녀 말에서", () => {
  const cases: [string, string[] | null][] = [
    ["고등학생 딸 키우는 엄마 안산", ["13-18"]],
    ["고등학생 딸 키우는 엄마예요 안산", ["13-18"]],
    ["중학생 아들 키우는 엄마 안산", ["13-18"]],
    ["초등학생 아들 키우는 아빠 수원", ["6-12"]],
    ["초등학생 아들 키우는 아빠예요 수원", ["6-12"]],
    ["아이 키우는 엄마 안산", null],
    ["아이 키우는 엄마예요 안산", null],
    ["딸 키우는 엄마 안산", null],
  ];
  for (const [t, kids] of cases) {
    it(`'${t}' → 본인 찾기${kids ? `, 자녀 ${kids.join(",")}` : ""}`, () => {
      const r = P(t);
      expect(r.mode).toBe("self");
      expect(r.profile.householdSize).toBe(3);
      if (kids) expect(r.profile.children).toEqual(kids);
      expect(r.profile.age ?? "unknown").not.toBe("0-18");
    });
  }
  it("부모님을 말하는 문장은 그대로 부모님 찾기 ('우리 엄마', '엄마께서')", () => {
    expect(P("일흔둘 혼자 사시는 엄마 부천").mode).toBe("parent");
  });
  it("자녀를 둔 부모 문장은 자녀 나이에 맞는 혜택을 고른다 (0개가 아님)", () => {
    const { picks } = picksOf(sitOf("고등학생 딸 키우는 엄마 안산"));
    expect(picks.length).toBe(5);
    expect(names(picks).join(" | ")).not.toMatch(/학교\s*밖/);
  });
});

describe("N2 만 19세 미만 본인 + 자퇴·학교 안 다님 = 학교 밖 청소년", () => {
  for (const [t, age] of [
    ["고등학교 자퇴한 열일곱살이에요 수원", 17],
    ["학교 안 다니는 열여섯살 안산", 16],
  ] as const) {
    it(`'${t}' → 본인(만 ${age}세), 자녀·3인 가구 아님, 학교 밖 청소년 지원이 맨 위`, () => {
      const r = P(t);
      expect(r.mode).toBe("self");
      expect(r.profile.age).toBe("0-18");
      expect(parsedExtras(r).ageSpan).toEqual([age, age]);
      expect(r.profile.children ?? []).toEqual([]);
      expect(r.profile.householdSize ?? "unknown").not.toBe(3);
      expect(parsedExtras(r).childCount ?? null).toBeNull();
      const sit = sitOf(t);
      expect(sit.x.interests).toContain("out_of_school");
      const { picks, view } = picksOf(sit);
      expect(picks.length).toBe(5);
      expect(names(picks.slice(0, 2)).every((n) => OUT_OF_SCHOOL.test(n))).toBe(true);
      expect(names(picks).join(" | ")).not.toMatch(/고등학교\s*무상교육/);
      expect(names([...view.fit, ...view.office, ...view.ask].map((g) => g[0])).join(" | ")).not.toMatch(/고등학교\s*무상교육|교육급여/);
    });
  }
  it("'열여섯살'만 말해도 본인 나이 (자녀로 바꾸지 않음)", () => {
    const r = P("열여섯살이에요 수원");
    expect(r.mode).toBe("self");
    expect(r.profile.age).toBe("0-18");
    expect(r.profile.children ?? []).toEqual([]);
  });
});

describe("N1·N2 서로 섞이지 않음", () => {
  it("부모 문장은 학교 밖 신호가 없고, 자녀는 13~18세", () => {
    const sit = sitOf("고등학생 딸 키우는 엄마 안산");
    expect(sit.mode).toBe("self");
    expect(sit.profile.children).toEqual(["13-18"]);
    expect(sit.profile.age).not.toBe("0-18");
    expect(sit.x.interests ?? []).not.toContain("out_of_school");
  });
  it("청소년 본인 문장은 자녀가 없고 본인 나이가 18세 이하", () => {
    for (const t of ["고등학교 자퇴한 열일곱살이에요 수원", "학교 안 다니는 열여섯살 안산"]) {
      const sit = sitOf(t);
      expect(sit.profile.children ?? []).toEqual([]);
      expect(sit.profile.age).toBe("0-18");
    }
  });
  it("자녀가 자퇴했다는 부모 문장은 본인을 학교 밖 청소년으로 보지 않음", () => {
    const sit = sitOf("고등학생 딸 키우는 엄마인데 딸이 자퇴했어요 안산");
    expect(sit.profile.age).not.toBe("0-18");
    expect(sit.profile.children).toEqual(["13-18"]);
    expect(sit.x.interests ?? []).not.toContain("out_of_school");
  });
});

describe("N3 대학 신입생 = 학생, 성별 모르면 남성 대상 사업은 먼저 확인할 5가지에서 뺌", () => {
  it("'스무살 대학 신입생 고양' → 학생, 장학금·학자금", () => {
    const sit = sitOf("스무살 대학 신입생 고양");
    expect(sit.profile.activity).toBe("student");
    const n = names(picksOf(sit).picks).join(" | ");
    expect(n).toMatch(/장학금|학자금/);
    expect(n).not.toMatch(/사회\s*복무|병역|입영|예비군/);
  });
  it("새내기·입학도 학생 말", () => {
    expect(P("올해 대학 새내기예요 수원").profile.activity).toBe("student");
    expect(P("대학 입학했어요 수원 스무살").profile.activity).toBe("student");
  });
});

describe("N4 이름에 '장애인'이 든 사업은 장애 조건", () => {
  const sit = sitOf("안양 스물여덟 구직 중이에요");
  const find = (id: string) => progsFor(sit.profile).find((p) => p.id === id)!;
  it("장애 여부를 모르면 '신청할 때 확인' (받으실 수 있어요 아님)", () => {
    const it0 = classifyOne(find("n.gov24-SPE000000080"), sit);
    expect(it0.bucket).toBe("office");
  });
  it("장애가 없다고 하면 '맞지 않아요'", () => {
    const s2: Situation = { ...sit, profile: { ...sit.profile, disability: "none" } };
    expect(classifyOne(find("n.gov24-SPE000000080"), s2).bucket).toBe("no");
  });
  it("본인이 장애가 있으면 막지 않음", () => {
    const s3: Situation = { ...sit, profile: { ...sit.profile, disability: "self" as Profile["disability"] } };
    expect(classifyOne(find("n.gov24-SPE000000080"), s3).bucket).not.toBe("no");
  });
});

describe("N5 청년도전지원사업 조건 이름", () => {
  it("구직단념 청년 (다문화·북한이탈 아님)", () => {
    const p = { id: "t.a", name: "청년도전지원사업", target: "만18세 ~ 만39세 이하 청주시 거주 구직단념 청년", rule: { id: "t", origin: "gov24_conditions", review: "structured", logic: { field: "age", min: 18, max: 39 } } } as unknown as Program;
    expect(needsStatus(p)).toMatch(/구직단념 청년/);
    expect(needsStatus(p)).not.toMatch(/다문화|북한/);
  });
});

describe("N7 '대학생 아들 둔' → 자녀 19세 이상", () => {
  it("자녀 19+", () => {
    const r = P("대학생 아들 둔 50대 엄마예요 수원");
    expect(r.mode).toBe("self");
    expect(r.profile.children).toEqual(["19+"]);
  });
});

describe("카드 안내 — 원문에 적힌 경우에만", () => {
  it("부모 동의: 원문 문구가 있을 때만", () => {
    expect(parentConsent({ summary: "", target: "9~24세 청소년 대상 운영(만14세 미만 청소년 법정대리인 동의 필요)" } as Program)).toMatch(/법정대리인 동의/);
    expect(parentConsent({ summary: "", documents: "개인신상정보, 보호자동의서, 개인정보 수집·이용 동의서" } as Program)).toMatch(/보호자동의/);
    expect(parentConsent({ summary: "", target: "9~24세 학교 밖 청소년", documents: "개인정보 수집·이용 동의서" } as Program)).toBeNull();
    expect(consentUnderAge(parentConsent({ summary: "", target: "9~24세 청소년 대상 운영(만14세 미만 청소년 법정대리인 동의 필요)" } as Program)!)).toBe(14);
    expect(consentUnderAge(parentConsent({ summary: "", documents: "보호자동의서" } as Program)!)).toBeNull();
  });
  it("만 24세까지: 청소년상담·동반자이고 원문에 24세가 있을 때만", () => {
    expect(youthUpTo24({ name: "청소년동반자 프로그램", target: "만 9세 이상 ~ 24세 청소년", summary: "" } as Program)).toBe(true);
    expect(youthUpTo24({ name: "청소년전화1388 운영 지원", target: "○ 9~24세 청소년", summary: "" } as Program)).toBe(true);
    expect(youthUpTo24({ name: "청소년상담복지센터 상담지원", target: "○ 위기 청소년", summary: "" } as Program)).toBe(false);
    expect(youthUpTo24({ name: "청년 월세 지원", target: "19~34세", summary: "" } as Program)).toBe(false);
  });
});
