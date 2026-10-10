/** 전국 확대 ③: 현재 위치 → 시·군·구 (기기 안 계산) */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sigunguAt, type SggFeature } from "@/lib/client/locate";
import { PRESETS, presetAt, presetById, placedId } from "@/lib/client/presets";

const geo = JSON.parse(readFileSync("public/geo/sgg-20260701.json", "utf8")) as { features: SggFeature[] };
const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as { sidos: { sigungus: { code: string }[] }[] };

describe("현재 위치 → 시·군·구", () => {
  it("경계의 시·군·구 코드가 앱 지역 목록(230곳)과 모두 맞음", () => {
    const codes = new Set(regions.sidos.flatMap((s) => s.sigungus.map((g) => g.code)));
    const inGeo = new Set(geo.features.map((f) => f.properties.c));
    expect([...inGeo].filter((c) => !codes.has(c))).toEqual([]);
    expect([...codes].filter((c) => !inGeo.has(c))).toEqual([]);
  });
  it.each([
    ["수원시청", 37.2636, 127.0286, "41110"],
    ["용인시청", 37.2411, 127.1776, "41460"],
    ["광진구청", 37.5385, 127.0823, "11215"],
    ["인천 영종도(영종구, 2026-07 신설)", 37.4928, 126.4935, "28155"],
    ["광주 광산구청(전남광주통합특별시)", 35.1396, 126.7937, "12330"],
    ["영암군청", 34.8001, 126.6967, "12800"],
    ["제주시청", 33.4996, 126.5312, "50110"],
  ])("%s", (_n, lat, lng, code) => {
    expect(sigunguAt(geo.features, lat, lng)).toBe(code);
  });
  it("바다 한가운데·국외는 null", () => {
    expect(sigunguAt(geo.features, 36.0, 124.0)).toBeNull();
    expect(sigunguAt(geo.features, 35.68, 139.76)).toBeNull(); // 도쿄
  });
});

describe("예시를 내 지역으로 옮기기", () => {
  it("상황은 그대로, 지역·제목만 바뀜 — 저장된 id로 다시 만들 수 있음", () => {
    const p0 = PRESETS.find((p) => p.id === "suwon-senior")!;
    const p = presetAt(p0, "11000", "11215", "서울 광진구");
    expect(p.title).toBe("서울 광진구 1인 어르신");
    expect(p.profile.sigungu).toBe("11215");
    expect(p.profile.age).toBe(p0.profile.age);
    expect(p.x).toEqual(p0.x);
    expect(presetById(placedId("suwon-senior", "11215", "서울 광진구"))?.title).toBe("서울 광진구 1인 어르신");
    expect(presetById(placedId("parent-care", "12800", "전남광주 영암군"))?.profile.sido).toBe("12000");
    expect(presetById("goyang-youth")?.title).toBe("고양시 구직 청년");
  });
});
