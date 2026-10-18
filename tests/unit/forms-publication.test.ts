import { describe, it, expect } from "vitest";
import type { Program } from "@/lib/data/types";
import type { ApplicationForm, FormLink } from "@/lib/data/forms";
import { applicationRoute, externalFormUrl, formAssetUrl, formStatus, validateFormLink, officialFormUrl } from "@/lib/data/formPublication";
const program = { id: "g41280.test", scope: "sigungu", region: { sido: "41000", sigungu: "41280", label: "고양시" } } as Program;
const form: ApplicationForm = { id: "ordin-1", title: "지원신청서", role: "application", lawId: "1", lawTitle: "고양시 지원 조례", annexId: "1", annexNumber: "1", regionCode: "41280", regionLabel: "고양시", effectiveDate: "2026-01-01", sourceUrl: "https://www.law.go.kr/file", lawUrl: "https://www.law.go.kr/law", fetchedAt: "2026-10-16" };
const link: FormLink = { formId: "ordin-1", use: "main", checkedAt: "2026-10-16", evidenceUrl: form.lawUrl, evidenceNote: "제5조에 따른 개인 신청서로 대조했습니다." };

describe("application document publication", () => {
  it("recognizes an explicitly cited provincial ordinance and its enforcement rule", () => {
    const local={...program,id:"g50130.test",region:{sido:"50000",sigungu:"50130",label:"서귀포시"},laws:["제주특별자치도 공영장례 지원 조례, 시행규칙"]};
    const provincial={...form,regionCode:"50000",regionLabel:"제주특별자치도",lawTitle:"제주특별자치도 공영장례 지원 조례 시행규칙"};
    const reviewed:FormLink={...link,scopeBasis:"provincial-law-reference"};
    expect(()=>validateFormLink(local,provincial,reviewed)).not.toThrow();
    expect(()=>validateFormLink({...local,laws:["제주특별자치도 공영장례 지원 조례 및 시행규칙"]},provincial,reviewed)).not.toThrow();
    expect(()=>validateFormLink({...local,laws:["제주특별자치도 다른 지원 조례, 시행규칙"]},provincial,reviewed)).toThrow(/jurisdiction/);
    expect(()=>validateFormLink({...local,region:{...local.region,sido:"49000"}},provincial,reviewed)).toThrow(/jurisdiction/);
  });
  it("accepts a reviewed part title and rejects an unusable document label", () => {
    expect(()=>validateFormLink(program,form,{...link,displayTitle:"별지 제2호 양육지원금 신청서"})).not.toThrow();
    for (const title of ["", " ", "가".repeat(201)]) expect(()=>validateFormLink(program,form,{...link,displayTitle:title})).toThrow(/document title/);
  });
  it("accepts a source-reviewed national document only for the exact program or cited local delegation", () => {
    const national={...form,id:"law-9",regionCode:"national",lawTitle:"의료급여법 시행규칙",annexNumber:"001400"};
    const local={...program,laws:["고양시 지원 조례"],url:"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/EXACT"};
    const reviewed:FormLink={...link,formId:national.id,scopeBasis:"official-application-reference",evidenceUrl:local.url,
      scopeReference:{kind:"program-documents",referencedLawTitle:national.lawTitle,annexNumber:"001400",basis:"공식 사업 안내의 구비서류에서 해당 법규의 별지 제14호를 정확히 지목하여 원문을 대조했습니다."}};
    expect(()=>validateFormLink(local,national,reviewed)).not.toThrow();
    expect(()=>validateFormLink(local,national,{...reviewed,evidenceUrl:local.url+"OTHER"})).toThrow(/jurisdiction/);
    expect(()=>validateFormLink(local,national,{...reviewed,scopeReference:{...reviewed.scopeReference!,annexNumber:"001500"}})).toThrow(/jurisdiction/);
    const delegated:FormLink={...reviewed,evidenceUrl:"https://www.law.go.kr/ordinInfoP.do?ordinSeq=88",
      scopeReference:{...reviewed.scopeReference!,kind:"cited-local-law",sourceLawTitle:"고양시 지원 조례",sourceLawId:"88",article:"제6조"}};
    expect(()=>validateFormLink(local,national,delegated)).not.toThrow();
    expect(()=>validateFormLink({...local,laws:[]},national,delegated)).toThrow(/jurisdiction/);
    expect(()=>validateFormLink(local,{...national,regionCode:"41110"},delegated)).toThrow(/jurisdiction/);
  });
  it("requires exact geography and excludes registers, deleted and reference documents", () => {
    expect(() => validateFormLink(program, form, link)).not.toThrow();
    for (const role of ["deleted", "administrative", "reference"] as const) expect(() => validateFormLink(program, { ...form, role }, link)).toThrow();
    expect(() => validateFormLink(program, { ...form, regionCode: "41110" }, link)).toThrow();
    expect(() => validateFormLink({ ...program, scope: "national", region: undefined }, form, link)).toThrow();
  });
  it("requires a specific condition for proxy documents, not just parent mode", () => {
    expect(() => validateFormLink(program, { ...form, role: "delegation" }, link)).toThrow();
    expect(() => validateFormLink(program, { ...form, role: "delegation" }, { ...link, use: "conditional", condition: "공식 안내에 따라 대리 신청하는 경우" })).not.toThrow();
  });
  it("requires source evidence and an identifiable checked date", () => {
    expect(() => validateFormLink(program, undefined, link)).toThrow();
    expect(() => validateFormLink(program, form, { ...link, checkedAt: "" })).toThrow();
    expect(() => validateFormLink(program, form, { ...link, evidenceUrl: "javascript:alert(1)" })).toThrow();
  });
  it("candidate similarity can never turn into a confirmed download", () => {
    expect(formStatus([], [form.id])).toBe("review");
    expect(formStatus([], [])).toBe("missing");
    expect(formStatus([], [form.id], "https://www.gov.kr/")).toBe("online");
    expect(formStatus([link], [], "https://www.gov.kr/")).toBe("available");
  });
  it("online routes need a dedicated source link and do not impose application on automatic benefits", () => {
    expect(applicationRoute({ applyUrl: "javascript:alert(1)" })).toBeUndefined();
    expect(applicationRoute({ applyUrl: "https://www.gov.kr/", applyType: "auto" })).toBeUndefined();
    expect(applicationRoute({ applyUrl: "https://www.gov.kr/", applyType: "institution" })).toBeUndefined();
    expect(applicationRoute({ applyUrl: "https://www.gov.kr/", applyType: "self" })).toBe("https://www.gov.kr/");
  });
  it("links cannot become executable URLs or arbitrary local downloads", () => {
    expect(externalFormUrl("https://www.hwandonghae.gangwon.kr/hdh")).toBeNull();
    for (const value of ["javascript:alert(1)", "file:///secret", "https://user:password@example.com"]) expect(externalFormUrl(value)).toBeNull();
    expect(formAssetUrl("/forms/files/ordin-1-012345abcdef.pdf")).toBeTruthy();
    for (const value of ["//evil.test/x.pdf", "/forms/files/../private.hwp", "/forms/files/%2e%2e/private.pdf", "https://evil.test/x.pdf"]) expect(formAssetUrl(value)).toBeNull();
  });
  it("a city implementation may use its province form only with a reviewed legal reference", () => {
    const provincial = { ...form, regionCode: "41000", lawTitle: "경기도 특별지원 조례 시행규칙" };
    const implementing = { ...program, laws: ["경기도 특별지원 조례"] };
    expect(() => validateFormLink(implementing, provincial, link)).toThrow();
    expect(() => validateFormLink(implementing, provincial, { ...link, scopeBasis: "provincial-law-reference" })).not.toThrow();
    expect(() => validateFormLink({ ...implementing, laws: [] }, provincial, { ...link, scopeBasis: "provincial-law-reference" })).toThrow();
  });
  it("qualifies an abbreviated Sejong citation only within the same province",()=>{
    const local={...program,region:{sido:"36000",sigungu:"36110",label:"세종"},laws:["아이 돌보는 아빠 장려금 지원 조례"]};
    const provincial={...form,regionCode:"36000",regionLabel:"세종특별자치시",lawTitle:"세종특별자치시 아이 돌보는 아빠 장려금 지원 조례"};
    expect(()=>validateFormLink(local,provincial,{...link,scopeBasis:"provincial-law-reference"})).not.toThrow();
    expect(()=>validateFormLink({...local,region:{sido:"41000",sigungu:"41280",label:"고양"}},provincial,{...link,scopeBasis:"provincial-law-reference"})).toThrow(/jurisdiction/);
  });
  it("recognizes an explicitly cited national law before a slash and normalized Korean dot", () => {
    const local={...program,laws:["의료요양 등 지역 돌봄의 통합지원에 관한 법률/고양시 통합지원 조례"]};
    const national={...form,regionCode:"national",lawTitle:"의료ㆍ요양 등 지역 돌봄의 통합지원에 관한 법률 시행규칙"};
    expect(()=>validateFormLink(local,national,{...link,scopeBasis:"national-law-reference"})).not.toThrow();
  });
  it("retains a second provincial citation after national-law article numbers without splitting internal 및",()=>{
    const local={...program,region:{sido:"50000",sigungu:"50110",label:"제주 제주시"},laws:["아동복지법 제35조 제2항제3호 및 제4항 및 제주특별자치도 아동급식 지원 조례"]};
    const provincial={...form,regionCode:"50000",regionLabel:"제주특별자치도",lawTitle:"제주특별자치도 아동급식 지원 조례"};
    expect(()=>validateFormLink(local,provincial,{...link,scopeBasis:"provincial-law-reference"})).not.toThrow();
    expect(()=>validateFormLink({...local,laws:["아동복지법 제35조"]},provincial,{...link,scopeBasis:"provincial-law-reference"})).toThrow(/jurisdiction/);
    expect(()=>validateFormLink({...local,laws:["제주특별자치도 노인 및 장애인 복지 조례"]},{...provincial,lawTitle:"제주특별자치도 노인 및 장애인 복지 조례"},{...link,scopeBasis:"provincial-law-reference"})).not.toThrow();
  });
  it("official source-only attachments cannot carry credentials or use another host", () => {
    expect(officialFormUrl("https://www.law.go.kr/LSW/flDownload.do?flSeq=123")).toBeTruthy();
    for (const url of ["http://www.law.go.kr/LSW/flDownload.do", "https://evil.test/LSW/flDownload.do", "https://www.law.go.kr/DRF/lawSearch.do?OC=secret", "https://www.law.go.kr/LSW/flDownload.do?serviceKey=secret"]) expect(officialFormUrl(url)).toBeNull();
    expect(() => validateFormLink(program, { ...form, role: "unclassified" }, link)).toThrow();
  });
});
