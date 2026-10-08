/**
 * 지원 금액 추출 (규칙, LLM 없음): 원문 '지원내용'(benefit)에서 '월 100만원', '연 30만원 이내', '1회 20만원' 같은 금액을 찾는다.
 *
 * 원칙
 *  - 지원받는 돈만 본다: 소득·재산 기준, 본인부담, 보험료, 사업비·예산, 단가, 할인·감면 전후 요금, 대출·보증 한도는 뺀다.
 *  - 주기는 원문에 적힌 것만 (월·연·1회). 없으면 'max'(주기 모름)로 둔다 — 지어내지 않는다.
 *  - 여러 금액이면 같은 주기 안에서 가장 큰 값 (화면에는 '원문 기준 최대'로만 쓴다). 주기 우선순위: 월 > 연 > 1회 > 주기 모름.
 *  - 대출·융자·보증·적금·저축·계좌 상품과 사업자·농어업·기관 지원은 금액을 내지 않는다.
 */
import type { Money } from "../../../src/lib/data/types";

/** 금액을 내지 않는 사업 (빌리거나 모으는 돈, 이용 요금 할인) */
const SKIP_NAME = /(대출|융자|보증|적금|저축|통장|계좌|펀드|공제|이자|상품권|지역\s*화폐|페이백|할인|감면|요금)/;
/** 이 줄에 있으면 금액이 혜택이 아님 */
const SKIP_LINE = /(대출|융자|보증\s*(?:한도|기간|금액)|이용\s*한도|할인\s*구매|사업\s*규모|총\s*사업비|예산\s*(?:규모|액)|자부담|도비\s*\d|시군비|국비\s*\d)/;
/** 금액 바로 앞(같은 구절)에 있으면 기준·부담금 (혜택 아님) */
const BEFORE_BAD = /(소득|재산|자산|보증금|임대료|월세액|전세금|매출|연봉|급여액|가액|부채|잔액|(?<![지보장상])원금|보험료|부담금?|본인\s*부담|이용료|요금|사업비|예산|기준|단가|시간\s*당|시급|1식|1일|회당|건당|→|초과\s*금액|이상\s*초과)\s*[^\d\n]{0,6}$|[x×*=]\s*$|(?:소득|보수|임금|보험료|급여액)[^\n]{0,4}\d+(?:\.\d+)?\s*%[^\d\n]{0,6}$/;
/** 금액 바로 뒤에 있으면 기준 (이상·초과·미만, '이하인 자') */
const AFTER_BAD = /^\s*\/\s*(?!월|달|년|연|1?\s*인|명|가구|세대|가정|아동|자녀|학생)|^\s*\(?\s*(?:일급|일당|시급)|^\s*(?:이상(?!\s*지원)|초과|미만|이하(?!\s*(?:로\s*)?(?:지원|지급|범위|한도|실비))|→|할인|감면|차감|상당의\s*재산|[x×*]\s*\d)|^[^\d\n]{0,8}(?:본인\s*부담|자부담)|^\s*[~∼\-–]\s*[\d,.]+\s*(?:만|천)?\s*원\s*(?:본인\s*부담|자부담)/;
const NUM = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(억|천만|만|천)?\s*(?:(\d+(?:,\d{3})*)\s*(천)?)?\s*원(?!\s*(?:스톱|장|인|칙|격|활|본|래|형|단위|금\b))/g;
const UNIT: Record<string, number> = { 억: 1e8, 천만: 1e7, 만: 1e4, 천: 1e3 };

const MONTH_BEFORE = /(?:^|[\s(:·,\-ㆍ\]>])(?:매\s*월|매달|월별|월\s*(?:최대|최고|정액|평균|기준)?|매월\s*최대)\s*[:]?\s*(?:최대|최고|정액)?\s*$/;
const YEAR_BEFORE = /(?:^|[\s(:·,\-ㆍ\]>])(?:연|연간|년간?|매년|1년|연\s*최대|연간\s*최대)\s*(?:최대|최고|한도)?\s*$/;
const ONCE_BEFORE = /(?:1회|일시금|생애\s*(?:최초\s*)?1회|1회에\s*한하여)\s*[^\d\n]{0,4}$/;
const MONTH_AFTER = /^\s*(?:\(?\s*\/?\s*월(?:\s*[\/)]|\s*$|\s*\/)|\/\s*월|\(\s*월\s*[\/)]|\s*씩\s*매월|\s*\(월\)|\s*×\s*\d+\s*개월)/;
const YEAR_AFTER = /^\s*(?:\/\s*(?:년|연)|\(\s*(?:1년|연|연간)\s*[\/)]|\(\s*연\s*\d+\s*회)/;
const ONCE_AFTER = /^\s*(?:\(?\s*(?:1회|일시금|생애\s*1회)|\s*일시\s*지급)/;
/** 주기를 알 수 없는 묶음 (반기·분기·n년간·n개월분) — 쓰지 않는다 */
const OTHER_PERIOD = /(반기|분기|\d+\s*년간|\d+\s*개월\s*(?:간|분)|주당|주\s*\d+회|일당|1일)\s*[^\d\n]{0,6}$/;

const INSTALLMENT = /(분할|나누어|나눠|\d+\s*회\s*(?:에\s*걸쳐|적립)|총\s*\d+\s*회|총\s*\d[\d,]*\s*(?:만\s*)?원)/;
const MIN_WON = 1000;
const MAX_WON = 50_000_000;

export interface MoneyInput {
  name: string;
  benefit?: string;
  sector?: string;
}

function parseWon(m: RegExpExecArray): number {
  const n1 = Number(m[1].replace(/,/g, ""));
  const u1 = m[2] ? UNIT[m[2]] : 1;
  let v = n1 * u1;
  if (m[3]) v += Number(m[3].replace(/,/g, "")) * (m[4] ? 1e3 : 1);
  return Math.round(v);
}

/** 원문 지원내용 → 금액 하나 (없으면 undefined) */
export function extractMoney(p: MoneyInput): Money | undefined {
  if (!p.benefit || p.sector || SKIP_NAME.test(p.name)) return undefined;
  const text = p.benefit.replace(/&#13;|\r/g, "\n").replace(/[ \t\u00a0]+/g, " ");
  const best: Partial<Record<Money["per"], Money>> = {};
  for (const line of text.split(/\n|(?=[○●□■◆▷☐ㅇ])|(?<=[.。])\s/)) {
    if (!line.trim() || SKIP_LINE.test(line)) continue;
    for (const m of line.matchAll(NUM)) {
      const idx = m.index ?? 0;
      const won = parseWon(m as RegExpExecArray);
      if (won < MIN_WON || won > MAX_WON) continue;
      // 범위 '10~13만원'의 앞 숫자(단위 없음)는 따로 잡히지 않음 — 뒤 숫자(최대)만
      // '월 50~70만원'의 앞 숫자는 주기 판단에서 뺀다
      const before = line.slice(Math.max(0, idx - 22), idx).replace(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:만|천)?\s*원?\s*[~∼\-–]\s*$/, "");
      const after = line.slice(idx + m[0].length, idx + m[0].length + 14);
      if (BEFORE_BAD.test(before) || AFTER_BAD.test(after)) continue;
      if (OTHER_PERIOD.test(before)) continue;
      // '1,500만원(매월 50만원씩 30회 분할)'·'총 100만원(매년 25만원)'처럼 나눠 주는 총액이 있으면 주기를 붙이지 않는다
      const per: Money["per"] = INSTALLMENT.test(line) ? "max" : MONTH_BEFORE.test(before) || MONTH_AFTER.test(after)
        ? "month"
        : YEAR_BEFORE.test(before) || YEAR_AFTER.test(after)
          ? "year"
          : ONCE_BEFORE.test(before) || ONCE_AFTER.test(after)
            ? "once"
            : "max";
      if (!best[per] || won > best[per]!.won) best[per] = { per, won, quote: quoteAround(line, idx, m[0].length) };
    }
  }
  const out = best.month ?? best.year ?? best.once ?? best.max;
  // 매월 주는 법정 급여인데 원문 금액에 '월'이 빠진 경우 (예: 기초연금 '단독가구 최고 349,700원') — 이름이 정확히 같을 때만
  if (out && out.per === "max" && MONTHLY_BY_LAW.has(p.name.trim())) return { ...out, per: "month" };
  return out;
}
/** 법으로 매월 지급하는 급여 (원문 금액 표기에 주기가 없을 때만 '월'로 본다 — 기초연금법 제8조, 국민기초생활 보장법 제8조, 장애인연금법 제5조) */
const MONTHLY_BY_LAW = new Set(["기초연금", "생계급여", "장애인연금"]);

function quoteAround(line: string, idx: number, len: number): string {
  const s = Math.max(0, idx - 30);
  const e = Math.min(line.length, idx + len + 30);
  return `${s > 0 ? "…" : ""}${line.slice(s, e).trim()}${e < line.length ? "…" : ""}`.slice(0, 82);
}
