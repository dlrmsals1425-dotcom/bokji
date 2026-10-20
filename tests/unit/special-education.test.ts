/**
 * (2026-10-16 소유자: '(특수교육대상자) 치료지원서비스' — 장애인이랑 특수교육대상자랑 다른 거야?)
 * 특수교육대상자는 「장애인 등에 대한 특수교육법」 제15조에 따라 교육장·교육감이 진단·평가로 선정한다 —
 * 학습장애·건강장애·발달지체 등도 포함되어 장애인 등록과 별개. 장애인 등록 조건만으로 '해당하지 않아요'로 빼지 않는다.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blankSituation, flowAnswers } from "@/lib/client/guided";
import { DIM_BY_ID, buildView, scoreV2, type DimId, type Situation } from "@/lib/client/v2";
import { refineProgram, SPECIAL_ED_LABEL } from "@/lib/data/refine";
import type { Program } from "@/lib/data/types";

const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);
const CHANGWON = { sido: "48000", sigungu: "48120" };
const progs = [...load(`public/bundles/v1/sigungu/${CHANGWON.sigungu}.json`), ...load(`public/bundles/v1/sido/${CHANGWON.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
const answer = (s: Situation, id: DimId, key: string) => flowAnswers(DIM_BY_ID[id], s).find((x) => x.key === key)!.apply(s);
const parentOf8 = (disability: "none" | "mild") => {
  let s = blankSituation(CHANGWON.sido, CHANGWON.sigungu, "self");
  s = answer(s, "age", "40-49");
  s = { ...s, profile: { ...s.profile, children: ["6-12"] }, x: { ...s.x, childCount: 1 } };
  return answer(s, "disability", disability);
};
const find = (s: Situation, name: string) => {
  const v = buildView(scoreV2(progs, s), s, 0);
  for (const b of ["fit", "office", "ask", "no"] as const) for (const g of v[b]) for (const i of g) if (i.s.program.name === name) return { b, i };
  throw new Error(`${name} 없음`);
};

describe("특수교육대상자 사업은 장애인 등록과 별개", () => {
  for (const name of ["(특수교육대상자) 치료지원서비스", "장애학생 정보격차 해소 지원", "장애아보육료지원"]) {
    it(`${name}: 장애 '아니요'라도 '해당하지 않아요'가 아니고, 이유에 특수교육대상자 선정이 보인다`, () => {
      const { b, i } = find(parentOf8("none"), name);
      expect(b).not.toBe("no");
      expect(b).not.toBe("fit");
      const text = [i.base.why ?? "", ...i.base.ev.reasons.map((r) => r.text)].join(" ");
      expect(text).toContain("특수교육대상자");
    });
  }
  it("장애가 있다고 답하면 그대로 '해당하지 않아요'가 아님", () => {
    expect(find(parentOf8("mild"), "장애학생 정보격차 해소 지원").b).not.toBe("no");
  });
  it("특수교육과 관계없는 장애 사업(장애수당)은 장애 '아니요'면 그대로 '해당하지 않아요'", () => {
    expect(find(parentOf8("none"), "장애수당").b).toBe("no");
  });
  it("특수교육대상자를 여러 대상 중 하나로 적은 사업은 건드리지 않음", async () => {
    const { isSpecialEd } = await import("@/lib/data/refine");
    for (const name of ["국가보훈대상자 학습보조비 지급", "그 밖의 연장형 보육료 등 지원", "무상우유급식 지원", "인천광역시교육청 저소득층 학생 졸업앨범비 지원"]) {
      expect(isSpecialEd({ name, target: "특수교육대상자, 차상위계층 …" }), name).toBe(false);
    }
    expect(isSpecialEd({ name: "건강장애학생 원격수업 지원", target: "특수교육대상자로 선정된 건강장애 학생" })).toBe(true);
  });
  it("잎 이름", () => {
    expect(SPECIAL_ED_LABEL).toContain("특수교육대상자");
  });
});
