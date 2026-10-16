/** QA 8차 (2026-10-09, 실사용 시나리오 테스트 2건 — 맞춤 찾기 8항목 + 검색 8항목) 회귀 테스트 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation } from "@/lib/client/parse";
import { parseManwonInput } from "@/lib/client/incomeInput";
import { DIM_BY_ID, EMPTY_EXTRAS, buildView, classifyOne, scoreV2, toEval, type Situation } from "@/lib/client/v2";
import { situationOf } from "@/lib/client/start";
import { PRESETS } from "@/lib/client/presets";
import { refineProgram } from "@/lib/data/refine";
import { isSwapped, fixSwapped } from "../../pipeline/src/normalize/swap";
import { sheetDocs } from "@/lib/client/visit";
import { parseDocs } from "@/lib/client/howto";
import { orgText, orgWhere, ownerText } from "@/components/Badges";
import { sidoOptionLabel } from "@/lib/client/regionLabel";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8"));
const today = { year: 2026, month: 10, day: 9 };
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);
const progsFor = (p: Profile) => [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
const preset = (id: string) => {
  const pre = PRESETS.find((p) => p.id === id)!;
  return situationOf(pre.profile, pre.x, pre.mode ?? "self");
};
const find = (sit: Situation, re: RegExp) => progsFor(sit.profile).filter((p) => re.test(p.name));
const shardOf = (id: string): Program => {
  for (let i = 0; i < 64; i++) {
    const f = `public/bundles/v1/details/${i}.json`;
    if (!existsSync(f)) continue;
    const d = JSON.parse(readFileSync(f, "utf8"));
    if (d[id]) return d[id];
  }
  throw new Error(id);
};

describe("QA8-5 월 소득 입력 — 적은 글자를 바꾸지 않음", () => {
  it("소수는 그대로, 음수·문자는 오류 (값을 쓰지 않음)", () => {
    expect(parseManwonInput("100.5")).toEqual({ value: 100.5, error: null });
    expect(parseManwonInput("1,200")).toEqual({ value: 1200, error: null });
    expect(parseManwonInput("250 만원")).toEqual({ value: 250, error: null });
    expect(parseManwonInput("")).toEqual({ value: null, error: null });
    expect(parseManwonInput("-100").value).toBeNull();
    expect(parseManwonInput("-100").error).toMatch(/0 이상/);
    expect(parseManwonInput("백만원").value).toBeNull();
    expect(parseManwonInput("1.2.3").error).toMatch(/숫자/);
    expect(parseManwonInput("100000").value).toBeNull();
  });
  it("문장의 '월 100.5만원'도 101이 아니라 100.5", () => {
    expect(parseSituation("고양시 29살 혼자 살고 월 100.5만원 구직 중", regions, today).income?.manwon).toBe(100.5);
  });
});

describe("QA8-6 '일하지 않아요' → 하는 일 '일하지 않음'", () => {
  it.each(["수원시에 사시는 59년생 부모님 두 분, 아버지가 거동이 불편하세요. 두 분 소득은 월 300만원이고 자가에 살아요. 일하지 않아요.", "일 안 해요", "일을 안 하세요", "무직이에요", "작년에 은퇴했어요"])("%s", (t) => {
    expect(parseSituation(t, regions, today).profile.activity).toBe("none");
  });
  it.each(["매일 안 하던 운동", "일자리를 찾고 있어요", "생일 안 챙겨요"])("아님: %s", (t) => {
    expect(parseSituation(t, regions, today).profile.activity).not.toBe("none");
  });
});

describe("QA8-2 지원대상·지원내용 뒤바뀜", () => {
  it("두 칸이 서로 상대 머리말로 시작할 때만 맞바꿈", () => {
    expect(isSwapped("○ 지원내용 : 면접수당 5만원", "○ 지원대상 : 취업면접에 참여한 청년")).toBe(true);
    expect(isSwapped("○ 지원대상 : 청년", "○ 지원내용 : 5만원")).toBe(false);
    // 지원내용 칸이 '지원대상:'으로 시작해도 지원내용이 함께 있으면 맞바꾸지 않음 (흔한 형태)
    expect(isSwapped("관내 농업인", "지원대상 : 관내 농업인\n○ 지원내용 : 농기계")).toBe(false);
    expect(fixSwapped({ target: "○ 지원내용 : A", benefit: "○ 지원대상 : B" })).toEqual({ target: "○ 지원대상 : B", benefit: "○ 지원내용 : A" });
  });
  it("면접수당 번들: 대상 칸에 '취업면접에 참여한 … 청년', 내용 칸에 '5만원'", () => {
    const d = shardOf("s41000.gov24-641000000193");
    expect(d.target).toMatch(/^○ 지원대상 : 취업면접에 참여한/);
    expect(d.benefit).toMatch(/면접수당 5만원/);
    expect(d.rule.evidence).toMatch(/취업면접에 참여한/);
    const s = load("public/bundles/v1/sido/41000.json").find((p) => p.id === "s41000.gov24-641000000193")!;
    expect(s.target).toBe(d.target);
  });
});

describe("QA8-1 확인하지 않은 필수 조건은 '받으실 수 있어요'가 아님", () => {
  it("고양 청년 예시: 경기도 청년 면접수당은 신청할 때 확인 (면접 참여 여부)", () => {
    const sit = preset("goyang-youth");
    const [p] = find(sit, /^경기도 청년 면접수당$/);
    const it0 = classifyOne(p, sit);
    expect(it0.bucket).not.toBe("fit");
    expect(it0.base.why ?? "").toMatch(/취업면접에 참여한/);
  });
  it("성남 한부모 예시: 가정양육수당·보육료는 어린이집 이용 여부를 답하기 전에는 '받으실 수 있어요'가 아님", () => {
    const sit = preset("seongnam-single-parent");
    const ps = find(sit, /^(가정양육수당 지원|보육료 지원|영유아보육료 지원)$/);
    expect(ps.length).toBe(3);
    for (const p of ps) expect(classifyOne(p, sit).bucket).toBe("ask");
    const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
    expect(view.questions.map((q) => q.dim.id)).toContain("daycare");
  });
  it("어린이집에 다녀요 → 보육료 받으실 수 있어요·가정양육수당 맞지 않아요 / 집에서 키워요 → 반대", () => {
    const sit = preset("seongnam-single-parent");
    const [home] = find(sit, /^가정양육수당 지원$/);
    const [fee] = find(sit, /^영유아보육료 지원$/);
    const d = DIM_BY_ID.daycare;
    const yes = d.answers.find((a) => a.key === "yes")!.apply(sit);
    const no = d.answers.find((a) => a.key === "no")!.apply(sit);
    const both = d.answers.find((a) => a.key === "both")!.apply(sit);
    expect(classifyOne(fee, yes).bucket).toBe("fit");
    expect(classifyOne(home, yes).bucket).toBe("no");
    expect(classifyOne(fee, no).bucket).toBe("no");
    expect(classifyOne(home, no).bucket).toBe("fit");
    expect(classifyOne(fee, both).bucket).toBe("fit");
    expect(classifyOne(home, both).bucket).toBe("fit");
  });
  it("시간제보육은 집에서 키우는 아이도 이용 — 어린이집 조건을 붙이지 않음", () => {
    const p = refineProgram({ ...shardLike("시간제보육 보육료 지원") });
    expect(JSON.stringify(p.rule.logic)).not.toMatch(/어린이집·유치원에 다님/);
  });
});

function shardLike(name: string): Program {
  return {
    id: "g00000.test", name, summary: "", category: "보육", tags: [], orgType: "local", scope: "sigungu", sources: [], trust: "B",
    rule: { id: "R-test", origin: "curated", review: "curated", logic: { field: "childAge", min: 0, max: 5, label: "영유아 자녀" }, unstructured: [], unstructuredCore: false, refined: 6 },
  } as unknown as Program;
}

describe("QA8-7 자녀 없음이라고 했으면 한부모를 다시 묻지 않음", () => {
  it("고양 청년 예시(자녀 0명): 한부모 질문이 없고 한부모 조건은 '아님'", () => {
    const sit = preset("goyang-youth");
    expect(sit.x.childCount).toBe(0);
    expect(DIM_BY_ID.singleParent.isUnknown(sit)).toBe(false);
    expect(toEval(sit).profile.traits).not.toContain("single_parent");
    const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
    expect(view.questions.map((q) => q.dim.id)).not.toContain("singleParent");
  });
  it("임신 중이면 그대로 물음 (자녀 0명이어도)", () => {
    const sit = preset("goyang-youth");
    const preg: Situation = { ...sit, profile: { ...sit.profile, children: ["pregnant"] } };
    expect(DIM_BY_ID.singleParent.isUnknown({ ...preg, x: { ...preg.x, traits: {} } })).toBe(true);
  });
});

describe("QA8-8 같은 제도(노인장기요양보험)가 판정이 갈려 따로 나오지 않음", () => {
  it("부모님 돌봄 예시: 장기요양인정도 소득 확인 없이 같은 분류, 한 묶음", () => {
    const sit = preset("parent-care");
    const [a] = find(sit, /^노인장기요양보험$/);
    const [b] = find(sit, /^노인장기요양보험\(장기요양인정\)$/);
    expect(classifyOne(b, sit).bucket).toBe(classifyOne(a, sit).bucket);
    expect(JSON.stringify(b.rule.logic)).not.toMatch(/소득/);
    const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
    const groups = view.fit.filter((g) => g.some((i) => /^노인장기요양보험(\(장기요양인정\))?$/.test(i.s.program.name)));
    expect(groups.map((g) => g.map((i) => i.s.program.name))).toEqual([expect.arrayContaining(["노인장기요양보험", "노인장기요양보험(장기요양인정)"])]);
  });
});

describe("QA8-3 준비물: 원문 구비서류를 빠뜨리지 않음", () => {
  const docs = "○ (필수) 채용공고문, 면접확인서(또는 면접확인서 대체서약서, 면접증빙서류)\n본인 확인 필요: 주민등록등본 또는 초본\n담당 공무원이 확인: 해당없음";
  it("준비물 한 장: 채용공고문·면접확인서·주민등록등본 또는 초본 (원문에 없어요 아님)", () => {
    const d = sheetDocs(docs, "경기도 청년 면접수당");
    expect(d.state).toBe("listed");
    expect(d.core).toContain("채용공고문");
    expect(d.core.some((x) => x.startsWith("면접확인서"))).toBe(true);
    expect(d.core).toContain("주민등록등본 또는 초본");
  });
  it("카드: 채용공고문·면접확인서·주민등록등본 또는 초본", () => {
    const b = parseDocs(docs, "경기도 청년 면접수당");
    expect(b[0]).toBe("채용공고문");
    expect(b[1]).toMatch(/^면접확인서/);
    expect(b).toContain("주민등록등본 또는 초본");
    expect(b.join()).not.toMatch(/담당 공무원/);
  });
});

describe("검색 화면 표시 (QA 8차 검색 리포트)", () => {
  const base = { id: "g41460.x", name: "국가건강검진", summary: "", category: "", tags: [], orgType: "public_inst", scope: "sigungu", region: { sido: "41000", sigungu: "41460", label: "경기 용인시" }, sources: [], trust: "B" } as unknown as Program;
  it("지역 목록(통합돌봄 메뉴판)의 '전국' 사업은 '중앙부처 사업 · ○○ 안내' — 어디서나 된다고 읽히는 '전국 공통'은 쓰지 않음 (2026-10-16)", () => {
    expect(orgText({ ...base, owner: "중앙부처 (전국 공통 사업)" })).toBe("중앙부처 사업 · 경기 용인시 안내");
    expect(ownerText({ ...base, owner: "중앙부처 (전국 공통 사업)" })).toBe("중앙부처 (경기 용인시 통합돌봄 안내에 실린 사업)");
    expect(ownerText({ ...base, owner: "보건복지부" })).toBe("보건복지부");
    expect(ownerText({ ...base, owner: undefined })).toBeUndefined();
    expect(orgText({ ...base, owner: "경기 용인시", orgType: "local" })).toBe("시군구 · 경기 용인시");
  });
  it("기관 이름에서 이미 적은 지역 이름은 빼고 부서만", () => {
    expect(orgWhere({ ...base, owner: "경기도 용인시 복지여성국 노인복지과" })).toBe("복지여성국 노인복지과");
    expect(orgWhere({ ...base, owner: "경기도 용인시" })).toBeUndefined();
    expect(orgWhere({ ...base, owner: "중앙부처 (전국 공통 사업)", provider: "건보공단" })).toBe("건보공단");
    expect(orgWhere({ ...base, owner: "중앙부처 (전국 공통 사업)" })).toBeUndefined();
  });
  it("전남광주통합특별시는 옛 이름을 함께", () => {
    expect(sidoOptionLabel({ code: "12000", name: "전남광주통합특별시" })).toBe("전남광주통합특별시 (옛 광주광역시·전라남도)");
    expect(sidoOptionLabel({ code: "41000", name: "경기도", pilot: true })).toBe("경기도 (시범 지역)");
  });
});

describe("기본값", () => {
  it("빈 상황 EMPTY_EXTRAS는 그대로", () => {
    expect(EMPTY_EXTRAS.facts).toEqual({});
    expect(EMPTY_PROFILE.activity).toBe("unknown");
  });
});

describe("QA8 후속 (2026-10-10) '91년생, 여자아이 2명, 남편외벌이, 월급 400만원'", () => {
  const P = (t: string) => parseSituation(t, regions, { year: 2026, month: 10, day: 10 });
  it("여자아이·남자아이·딸아이도 자녀로 셈 → 자녀 2명, 배우자 포함 4인 가구", () => {
    const r = P("91년생, 여자아이 2명, 남편외벌이, 월급 400만원");
    expect(r.childCount).toBe(2);
    expect(r.profile.householdSize).toBe(4);
    expect(P("남자아이 하나 키워요").childCount).toBe(1);
    expect(P("딸아이 둘이에요").childCount).toBe(2);
    expect(P("여자아이 5살").childAges).toContain("2-5");
  });
  it("남편·아내를 말했으면 한부모 아님 (다시 묻지 않음), 이혼·사별이면 그대로", () => {
    expect(P("91년생, 여자아이 2명, 남편외벌이, 월급 400만원").traitsNo).toContain("single_parent");
    expect(P("남편과 이혼하고 아이 둘 키워요").traitsNo ?? []).not.toContain("single_parent");
  });
  it("'남편 외벌이'의 월급은 남편 것 — 본인을 '직장에 다님'으로 보지 않음", () => {
    const r = P("91년생, 여자아이 2명, 남편외벌이, 월급 400만원");
    expect(r.profile.activity).not.toBe("employed");
    expect(r.income?.manwon).toBe(400);
    expect(P("월급 300만원 받는 직장인이에요").profile.activity).toBe("employed");
  });
});
