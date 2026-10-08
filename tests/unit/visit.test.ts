import { describe, expect, it } from "vitest";
import { buildVisitSheet, canonicalDoc, formNames, placeGroup, sheetDocs } from "@/lib/client/visit";
import type { Program } from "@/lib/data/types";

// 원문(details 번들) 그대로 옮긴 구비서류 문자열
const DOCS = {
  basicPension: "- 신분증\n- 사회복지서비스 및 급여 제공(변경) 신청서\n- 소득·재산 신고서\n- 금융 정보 등(금융, 신용, 보험정보) 제공 동의서(본인, 배우자)\n- 통장 사본\n본인 확인 필요: 해당없음\n담당 공무원이 확인: 해당없음",
  firstMeet: "- 신분증\n- 대리신청시 위임장, 보호자 신분증 사본 제출, 대리인 신분증\n본인 확인 필요: 해당없음\n담당 공무원이 확인: 해당없음",
  scholarship:
    "○ 필수서류\n- 구비서류 없음\n○ 선택서류\n- 국가장학금 신청정보와 한국장학재단에서 신청자에 대한 확인 정보가 불일치할 경우 별도 제출 필요\n· (신청인 제출 서류) 가족관계증명서, 기초생활보장 수급자증명서, 한부모가족증명서, 수급자증명서 등\n※ 불일치 사유별 제출서류 상이\n본인 확인 필요: 해당없음\n담당 공무원이 확인: 해당없음",
  employment:
    "(필수) 취업지원신청서 및 지원자격 확인을 위한 개인정보 수집, 이용 및 제공 동의서\n(필요시 추가서류)\n- 가구단위 증빙서류: 가족관계증명원, 이혼소송확인서, 실종신고서 등\n- 특정취약계층 증빙서류: 관련 추천서, 확인서 등\n- 전산망으로 확인불가 또는 전산망에 실시간 연계되지 않은 소득, 재산, 취업경험 관련정보: 사업주 확인자료 등 관련 증빙자료\n본인 확인 필요: 해당없음\n담당 공무원이 확인: 해당없음",
  none: "해당없음\n본인 확인 필요: 해당없음\n담당 공무원이 확인: 해당없음",
  formsOnly: "관련 서식·안내: (최종) 2025년도 부모급여 사업안내(수정).pdf, 사회보장급여 신청(변경)서.hwpx",
  guideOnly: "관련 서식·안내: 2026년도 경기도 한부모가족 아동양육비 지원사업 운영지침.hwpx",
};

const P = (o: Partial<Program> & { id: string; name: string }): Program => ({ regionCode: "00000", level: "national", source: "gov24", ...o }) as Program;

describe("sheetDocs: 원문 구비서류 → 가져갈 것 / 해당하는 분만 / 대리", () => {
  it("기초연금: 다섯 가지를 이름을 맞춰서", () => {
    const d = sheetDocs(DOCS.basicPension, "기초연금");
    expect(d.state).toBe("listed");
    expect(d.core.map((x) => canonicalDoc(x).item)).toEqual(["신분증", "사회보장급여 신청서", "소득·재산 신고서", "금융정보 제공 동의서", "통장 사본"]);
  });
  it("첫만남이용권: 대리 신청 서류는 따로", () => {
    const d = sheetDocs(DOCS.firstMeet, "첫만남이용권 지원");
    expect(d.core).toEqual(["신분증"]);
    expect(d.proxy).toEqual(expect.arrayContaining(["위임장", "보호자 신분증 사본", "대리인 신분증"]));
  });
  it("국가장학금: 필수는 없고, 불일치할 때만 내는 서류는 '해당하는 분만'", () => {
    const d = sheetDocs(DOCS.scholarship, "국가장학금 Ⅰ유형");
    expect(d.core).toEqual([]);
    expect(d.cond).toEqual(expect.arrayContaining(["가족관계증명서", "한부모가족증명서"]));
    expect(d.cond.join()).not.toMatch(/불일치|별도 제출/);
  });
  it("국민취업지원제도: '(필수) A 및 B' → 둘로, '(필요시 추가서류)' 아래는 해당하는 분만, 이름표·막연한 것은 뺌", () => {
    const d = sheetDocs(DOCS.employment, "국민취업지원제도");
    expect(d.core.map((x) => canonicalDoc(x).item)).toEqual(["취업지원신청서", "개인정보 수집·이용 동의서"]);
    expect(d.cond.map((x) => canonicalDoc(x).item)).toEqual(["가족관계증명서", "이혼소송확인서", "실종신고서"]);
    expect([...d.core, ...d.cond].join()).not.toMatch(/증빙서류:|관련 추천서|^확인서$|증빙자료/);
  });
  it("'해당없음' → none, 서류 칸이 비면 missing (지어내지 않음)", () => {
    expect(sheetDocs(DOCS.none).state).toBe("none");
    expect(sheetDocs(undefined).state).toBe("missing");
    expect(sheetDocs(DOCS.guideOnly).state).toBe("missing");
  });
  it("첨부 서식 중 신청서만 (사업안내·운영지침은 뺌)", () => {
    expect(formNames(DOCS.formsOnly)).toEqual(["사회보장급여 신청서"]);
    expect(formNames(DOCS.guideOnly)).toEqual([]);
    expect(sheetDocs(DOCS.formsOnly).state).toBe("missing");
  });
});

describe("placeGroup", () => {
  it("주민센터·공단·고용센터·보건소·온라인·신청 불필요", () => {
    expect(placeGroup("주소지 행정복지센터(주민센터) 또는 국민연금공단 지사").key).toBe("center");
    expect(placeGroup("주소지 행정복지센터(주민센터) 또는 국민연금공단 지사").also).toBe("국민연금공단 지사");
    expect(placeGroup("국민연금공단 지사").key).toBe("nps");
    expect(placeGroup("국민건강보험공단 지사").key).toBe("nhis");
    expect(placeGroup("가까운 고용센터").key).toBe("work");
    expect(placeGroup("가까운 보건소").key).toBe("health");
    expect(placeGroup("온라인 신청 (한국장학재단)").key).toBe("online");
    expect(placeGroup("따로 신청하지 않아도 돼요").key).toBe("none");
    expect(placeGroup("담당 기관에 문의 (모르면 ☎129)").key).toBe("agency");
  });
});

describe("buildVisitSheet: 신청하는 곳별로 묶고 서류는 한 번씩", () => {
  const center = "거주지 읍/면/동 주민센터 방문 신청";
  const a = P({ id: "a", name: "기초연금", applyMethod: center, documents: DOCS.basicPension, contact: "보건복지상담센터 ☎ 129" });
  const b = P({ id: "b", name: "첫만남이용권 지원", applyMethod: "읍면동 주민센터 방문 또는 복지로·정부24 온라인 신청", documents: DOCS.firstMeet, contact: "보건복지부상담센터 129" });
  const c = P({ id: "c", name: "인플루엔자 국가예방접종 지원", applyMethod: "가까운 보건소 방문", documents: "- 신분증" });
  const d = P({ id: "d", name: "치과임플란트", applyMethod: "국민건강보험공단 지사 방문" });
  const sheet = buildVisitSheet([
    { program: a, bucket: "fit" },
    { program: b, bucket: "office" },
    { program: c, bucket: "fit" },
    { program: d, bucket: "office" },
  ]);
  it("주민센터 → 공단 → 보건소 순서", () => {
    expect(sheet.map((p) => p.key)).toEqual(["center", "nhis", "health"]);
    expect(sheet[0].programs.map((p) => p.name)).toEqual(["기초연금", "첫만남이용권 지원"]);
  });
  it("같은 서류(신분증)는 한 번만, 어느 혜택에 필요한지 함께", () => {
    const id = sheet[0].bring.filter((x) => x.item === "신분증");
    expect(id).toHaveLength(1);
    expect(id[0].for).toEqual(["기초연금", "첫만남이용권 지원"]);
  });
  it("같은 번호(129)는 한 번만", () => {
    expect(sheet[0].phones).toHaveLength(1);
  });
  it("서류 정보가 없으면 missing으로 표시 (화면에서 '창구에 문의')", () => {
    expect(sheet[1].programs[0].docs).toBe("missing");
    expect(sheet[1].bring).toEqual([]);
  });
  it("개인정보: 결과물에 나이·소득·가구 같은 입력값이 들어갈 자리가 없다", () => {
    const s = JSON.stringify(sheet);
    expect(s).not.toMatch(/세\b|만원|소득 \d|가구원/);
    expect(Object.keys(sheet[0]).sort()).toEqual(["bring", "cond", "forms", "key", "label", "phones", "programs", "proxy", "trimmed"]);
  });
});
