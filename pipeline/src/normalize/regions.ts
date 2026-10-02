import fs from "node:fs";
import path from "node:path";

/**
 * 시도·시군구 코드표 (2026-07-01 기준 행정코드, pipeline/data/sigungu_codes_20260701.tsv).
 * - 시도: 코드 끝 3자리 000 (세종은 시도 행이 없어 36000 을 가상 시도 코드로 쓴다).
 * - 시군구: '시도 시군구' 2단어 이름만 (일반구 '수원시 장안구' 등 3단어는 제외 → 상위 시로 판정).
 */

export interface Sido { code: string; name: string; short: string }
export interface Sigungu { code: string; sido: string; name: string; full: string }

const SHORT: Record<string, string> = {
  서울특별시: "서울", 전남광주통합특별시: "전남광주", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천",
  대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종", 경기도: "경기", 충청북도: "충북", 충청남도: "충남",
  경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주", 강원특별자치도: "강원", 전북특별자치도: "전북",
};

/** 원천 데이터의 옛 시도 표기 → 현행 시도 */
const SIDO_ALIASES: Record<string, string> = {
  전라남도: "전남광주통합특별시",
  광주광역시: "전남광주통합특별시",
  강원도: "강원특별자치도",
  전라북도: "전북특별자치도",
};

export const PILOT_SIDO = "41000"; // 경기도

export class RegionIndex {
  sidos: Sido[] = [];
  sigungus: Sigungu[] = [];
  private sidoByName = new Map<string, Sido>();
  private sggByFull = new Map<string, Sigungu>();

  constructor(tsvPath: string) {
    const lines = fs.readFileSync(tsvPath, "utf8").split("\n");
    for (const line of lines) {
      if (!line || line.startsWith("#") || line.startsWith("code\t")) continue;
      const [code, name, status] = line.split("\t");
      if (status?.trim() !== "존재") continue;
      const parts = name.trim().split(/\s+/);
      if (code.endsWith("000") && parts.length === 1) {
        const s: Sido = { code, name, short: SHORT[name] ?? name };
        this.sidos.push(s);
        this.sidoByName.set(name, s);
      }
    }
    // 세종: 단층제 — 가상 시도 36000 + 시군구 36110
    const sejong: Sido = { code: "36000", name: "세종특별자치시", short: "세종" };
    this.sidos.push(sejong);
    this.sidoByName.set(sejong.name, sejong);

    for (const line of lines) {
      if (!line || line.startsWith("#") || line.startsWith("code\t")) continue;
      const [code, name, status] = line.split("\t");
      if (status?.trim() !== "존재") continue;
      const parts = name.trim().split(/\s+/);
      if (code === "36110") {
        const s: Sigungu = { code, sido: "36000", name: "세종특별자치시", full: "세종특별자치시" };
        this.sigungus.push(s);
        this.sggByFull.set("세종특별자치시 세종특별자치시", s);
        continue;
      }
      if (parts.length !== 2 || code.endsWith("000")) continue;
      const sido = this.sidoByName.get(parts[0]);
      if (!sido) continue;
      const s: Sigungu = { code, sido: sido.code, name: parts[1], full: name };
      this.sigungus.push(s);
      this.sggByFull.set(name, s);
    }
    this.sidos.sort((a, b) => a.code.localeCompare(b.code));
    this.sigungus.sort((a, b) => a.code.localeCompare(b.code));
  }

  static load(): RegionIndex {
    return new RegionIndex(path.resolve(__dirname, "../../data/sigungu_codes_20260701.tsv"));
  }

  sido(name: string): Sido | undefined {
    const n = name.trim();
    return this.sidoByName.get(SIDO_ALIASES[n] ?? n) ?? this.sidos.find((s) => s.short === n);
  }

  sidoByCode(code: string): Sido | undefined {
    return this.sidos.find((s) => s.code === code);
  }

  sigunguByCode(code: string): Sigungu | undefined {
    return this.sigungus.find((s) => s.code === code);
  }

  sigungusOf(sidoCode: string): Sigungu[] {
    return this.sigungus.filter((s) => s.sido === sidoCode);
  }

  /**
   * 원천의 (시도, 시군구) 표기 → 현행 시군구 목록.
   * 2026-07-01 인천 행정체제 개편: 옛 중구 → 제물포구·영종구, 옛 동구 → 제물포구, 옛 서구 → 서해구·검단구.
   * 반환이 빈 배열이면 매핑 실패.
   */
  resolveSigungu(sidoName: string, sggName: string): Sigungu[] {
    const sido = this.sido(sidoName);
    if (!sido) return [];
    const name = sggName.trim();
    if (sido.code === "36000") return this.sigungus.filter((s) => s.code === "36110");
    const direct = this.sggByFull.get(`${sido.name} ${name}`);
    if (direct) return [direct];
    if (sido.code === "28000") {
      const map: Record<string, string[]> = { 중구: ["28125", "28155"], 동구: ["28125"], 서구: ["28275", "28290"] };
      const codes = map[name];
      if (codes) return codes.map((c) => this.sigunguByCode(c)!).filter(Boolean);
    }
    // '수원시 장안구' → '수원시'
    const first = name.split(/\s+/)[0];
    const parent = this.sggByFull.get(`${sido.name} ${first}`);
    return parent ? [parent] : [];
  }
}
