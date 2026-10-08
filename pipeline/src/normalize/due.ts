/**
 * 신청 기한·기간 추출 (규칙, LLM 없음).
 *  - after: '출생일로부터 60일 이내', '혼인신고일로부터 1년 이내' (신청기한·지원내용·신청방법 어디든)
 *  - period: 연도가 적힌 접수 기간 '2026.03.02 ~ 2026.03.31' (신청기한 칸만)
 *  - annual: '매년 5월', '매년 3~4월', '4월 중' (신청기한 칸만)
 * '상시', '접수기관 별 상이', 연도 없는 날짜처럼 정할 수 없는 것은 내지 않는다.
 */
import type { Due } from "../../../src/lib/data/types";

export interface DueInput {
  deadline?: string;
  benefit?: string;
  applyMethod?: string;
}

const EVENT = "(출생|출산|분만|입양|사망|전입|혼인\\s*신고|혼인|입국|퇴원|퇴직|이직|실직|폐업|장애\\s*등록|등록|발생|입학|졸업|임신\\s*확인)";
const AFTER_RE = new RegExp(`${EVENT}\\s*(?:신고)?\\s*(?:일|한\\s*날|한\\s*날짜)?\\s*(?:로부터|으로부터|부터|후|이후|포함|을\\s*포함하여)\\s*(\\d{1,3})\\s*(일|개월|년)\\s*(?:이내|안에|내에?|까지)`);
const DATE = "(20\\d{2})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})\\s*일?\\.?\\s*(?:\\([^)]{1,4}\\))?";
const PERIOD_RE = new RegExp(`${DATE}\\s*[~∼～\\-–]\\s*(?:(20\\d{2})\\s*[.\\-/년]\\s*)?(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})`);
const UNTIL_RE = new RegExp(`${DATE}\\s*(?:까지|마감)`);
const ANNUAL_LIST = /(\d{1,2})\s*월\s*[,·]\s*(\d{1,2})\s*월/;
const ANNUAL_RANGE = /(\d{1,2})\s*월?\s*[~∼\-–]\s*(\d{1,2})\s*월/;
const ANNUAL_ONE = /(\d{1,2})\s*월\s*(초|중순|중|말)?/;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const okDate = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2035;
const clip = (s: string) => (s.length > 80 ? s.slice(0, 79) + "…" : s).replace(/\s+/g, " ").trim();

export function extractDue(p: DueInput): Due | undefined {
  const dl = (p.deadline ?? "").replace(/\s+/g, " ").trim();
  // 1) 사건 뒤 n일 이내 (신청기한 → 지원내용 → 신청방법)
  for (const src of [dl, p.benefit ?? "", p.applyMethod ?? ""]) {
    const m = AFTER_RE.exec(src.replace(/\s+/g, " "));
    if (m) {
      const ev = m[1].replace(/\s+/g, "");
      const evText = ev === "혼인신고" ? "혼인신고" : ev;
      return { kind: "after", text: `${evText} 후 ${m[2]}${m[3]} 이내`, quote: clip(m[0]) };
    }
  }
  if (!dl || /(상시|수시|연중|상이|불필요|없음|별도|공고|해당\s*없)/.test(dl) && !/\d/.test(dl)) return undefined;
  // 2) 연도가 적힌 기간
  const pm = PERIOD_RE.exec(dl);
  if (pm) {
    const [y1, m1, d1] = [Number(pm[1]), Number(pm[2]), Number(pm[3])];
    const y2 = pm[4] ? Number(pm[4]) : y1;
    const [m2, d2] = [Number(pm[5]), Number(pm[6])];
    if (okDate(y1, m1, d1) && okDate(y2, m2, d2) && ymd(y2, m2, d2) >= ymd(y1, m1, d1)) {
      return { kind: "period", text: `${y1}.${m1}.${d1} ~ ${y2}.${m2}.${d2}`, quote: clip(pm[0]), from: ymd(y1, m1, d1), to: ymd(y2, m2, d2) };
    }
  }
  const um = UNTIL_RE.exec(dl);
  if (um) {
    const [y, m, d] = [Number(um[1]), Number(um[2]), Number(um[3])];
    if (okDate(y, m, d)) return { kind: "period", text: `${y}.${m}.${d}까지`, quote: clip(um[0]), to: ymd(y, m, d) };
  }
  // 3) 매년 몇 월 (연도 없는 '3.2~3.31' 같은 날짜는 해마다 같은지 알 수 없어 쓰지 않음)
  if (/\d+\s*[.]\s*\d+\s*[.~]/.test(dl) && !/월/.test(dl)) return undefined;
  if (!/매년/.test(dl) && !/^\s*\d{1,2}\s*월/.test(dl)) return undefined;
  // 달이 문장 앞쪽에 있어야 (예: '매년 연초(12월 신문 안내)'는 신청 달이 아님), '월~10월' 같은 빠진 숫자는 쓰지 않음
  if (dl.slice(0, Math.max(0, dl.search(/\d/))).replace(/매년도?|[\s(]/g, "") || /(?<!\d)\s월\s*[~∼\-–]/.test(` ${dl}`)) return undefined;
  const lm = ANNUAL_LIST.exec(dl);
  const rm = lm ? null : ANNUAL_RANGE.exec(dl);
  const sm = lm || rm ? null : ANNUAL_ONE.exec(dl);
  let months: number[] = [];
  let when = "";
  if (lm) {
    months = [Number(lm[1]), Number(lm[2])];
    when = `${months[0]}월·${months[1]}월`;
  } else if (rm) {
    const [x, y] = [Number(rm[1]), Number(rm[2])];
    for (let k = x, n = 0; n < 12; k = (k % 12) + 1, n++) {
      months.push(k);
      if (k === y) break;
    }
    when = x === y ? `${x}월` : `${x}~${y}월`;
  } else if (sm) {
    months = [Number(sm[1])];
    when = `${months[0]}월${sm[2] ? ` ${sm[2]}` : ""}`;
  }
  if (months.length && months.every((m) => m >= 1 && m <= 12)) {
    return { kind: "annual", text: `매년 ${when}`, quote: clip((lm ?? rm ?? sm)![0]), months };
  }
  return undefined;
}
