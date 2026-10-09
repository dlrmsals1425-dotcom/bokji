/**
 * 금액·기한 요약 (결과 화면 맨 위): 파이프라인이 원문에서 뽑은 money·due 를 쉬운 말로.
 * - 금액은 '원문 기준 최대'로만 쓰고, 함께 받을 수 없는 것이 섞여 있을 수 있어 더하지 않는다.
 * - 기한은 지난 것은 빼고 가까운 순서. 사건 뒤 n일 이내(출생 후 60일 등)는 날짜와 무관하게 맨 앞.
 */
import type { Due, Money, Program } from "../data/types";

/** 349700 → '34만 9,700원', 1000000 → '100만원', 9500 → '9,500원' */
export function formatWon(won: number): string {
  const man = Math.floor(won / 10000);
  const rest = won % 10000;
  if (!man) return `${rest.toLocaleString("ko-KR")}원`;
  return rest ? `${man.toLocaleString("ko-KR")}만 ${rest.toLocaleString("ko-KR")}원` : `${man.toLocaleString("ko-KR")}만원`;
}

export const MONEY_PER_LABEL: Record<Money["per"], string> = { month: "월", year: "연", once: "한 번", max: "" };

/** '월 최대 100만원' · '최대 300만원' */
export function moneyLabel(m: Money): string {
  const per = MONEY_PER_LABEL[m.per];
  return `${per ? per + " " : ""}최대 ${formatWon(m.won)}`;
}

export interface DueView {
  text: string;
  /** 정렬 키: 남은 날 (사건 기준은 -1) */
  days: number;
  /** 보조 문구 (예: '41일 남음', '지금 접수 기간', '다음 접수 2027년 3월') */
  note: string;
}

const DAY = 86_400_000;
const at = (s: string) => new Date(`${s}T00:00:00+09:00`).getTime();
const kstToday = (now: Date) => at(new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10));
const kstYM = (now: Date) => {
  const d = new Date(now.getTime() + 9 * 3600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
};
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 기한 → 화면 문구·정렬 키. 이미 지난 접수 기간은 null */
export function dueView(d: Due, now: Date = new Date()): DueView | null {
  const today = kstToday(now);
  if (d.kind === "after") return { text: d.text, days: -1, note: "해당 날짜부터 세어요" };
  if (d.kind === "period") {
    if (!d.to) return null;
    const end = at(d.to);
    if (end < today) return null;
    const left = Math.round((end - today) / DAY);
    if (d.from && at(d.from) > today) {
      const until = Math.round((at(d.from) - today) / DAY);
      return { text: d.text, days: left, note: `${until}일 뒤 접수 시작` };
    }
    return { text: d.text, days: left, note: left === 0 ? "오늘 마감" : `${left}일 남음` };
  }
  if (d.kind === "annual" && d.months?.length) {
    const { y, m } = kstYM(now);
    if (d.months.includes(m)) {
      // 지금 달부터 이어지는 접수 달의 끝
      let end = m;
      let yy = y;
      while (d.months.includes((end % 12) + 1) && (end % 12) + 1 !== m) {
        end = (end % 12) + 1;
        if (end === 1) yy++;
      }
      const left = Math.round((at(ymd(yy, end, lastDay(yy, end))) - today) / DAY);
      return { text: d.text, days: left, note: "지금 접수하는 달이에요" };
    }
    const next = [...d.months].map((k) => (k > m ? { y, m: k } : { y: y + 1, m: k })).sort((a, b) => a.y - b.y || a.m - b.m)[0];
    const days = Math.round((at(ymd(next.y, next.m, 1)) - today) / DAY);
    return { text: d.text, days, note: `다음 접수 ${next.y}년 ${next.m}월` };
  }
  return null;
}

export interface DueRow {
  program: Program;
  due: DueView;
}
/** 기한이 있는 사업을 가까운 순으로 (지난 것·모르는 것은 뺌) */
export function dueRows(programs: Program[], now: Date = new Date(), limit = 4): DueRow[] {
  const seen = new Set<string>();
  const rows: DueRow[] = [];
  for (const p of programs) {
    if (!p.due || seen.has(p.id)) continue;
    seen.add(p.id);
    // 대출·대부는 금액처럼 요약에서 뺀다. '사망 후 N개월'은 장제·유족 사업이 아니면 맨 위 요약에 두지 않는다
    if (/대출|대부|융자|보증/.test(p.name)) continue;
    if (p.due.kind === "after" && /사망/.test(p.due.text) && !/장제|장례|유족|사망|상조/.test(p.name)) continue;
    const v = dueView(p.due, now);
    if (v) rows.push({ program: p, due: v });
  }
  // 날짜가 있는 것(가까운 순) 먼저, '출생 후 1년 이내'처럼 사건 기준인 것은 그다음
  const rank = (d: DueRow) => (d.due.days < 0 ? Number.MAX_SAFE_INTEGER : d.due.days);
  return rows.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/*
 * 요약 금액 안전장치 (6차 검증 M2·M3): 번들의 money 는 원문에서 '가장 큰 값'을 뽑은 것이라
 * 가구원 수별 표의 가장 큰 칸이나 임금·보험 보장액·단가가 섞여 들어온다. 번들을 다시 만들지 않고 화면에서 거른다.
 */
/** 가구원 수에 따라 금액이 다른 표 ('5인 가구 : …', '부부가구 최고 …', '1인 70만원 / 2인 100만원') */
const HH_TABLE = /\d\s*인\s*(?:이상\s*)?(?:가구|세대)|(?:부부|단독)\s*(?:가구|세대)|가구원\s*수\s*(?:별|에\s*따라)|[2-9]\s*인\s*(?:이상\s*)?(?:기준\s*)?[:：]|[(（]\s*[2-9]\s*인\s*(?:이상)?\s*[)）]\s*(?:월\s*)?\d/;
/** 'N인 (이상) (:) (월·연) 금액' 쌍 — 서로 다른 N이 둘 이상이면 가구원 수별 표 */
const HH_PAIR = /(\d)\s*인(?!\s*당)\s*(?:이상\s*)?[:：]?\s*(?:월|연)?\s*[\d,]+\s*(?:만|천)?\s*원/g;
const HH_ANY = /가구원\s*수\s*(?:구분|관계)\s*없이/;
/** 금액 바로 앞: 임금·인건비 ('중개보수 지원'은 혜택) */
const WAGE_BEFORE = /(?:임금|(?<!중개\s?)보수|월\s*급여|급여\s*[:：]|일당|일급|시급|인건비)[^\d]{0,8}$/;
/** 보험 사업의 보장액 (사망·후유장해·진단비 등). 유족에게 주는 위로금·장제비는 보험 사업이 아니라 그대로 둔다 */
const INSURANCE_NAME = /보험/;
const PREMIUM_BEFORE = /보험료/;
/** 금액 바로 앞뒤의 단가 ('시간당 5천원 중 3천원', '9,000원(1식)', '1박 1만원'). '임신·출산 1회당'은 한 번 주는 돈이라 뺌 */
const UNIT_BEFORE = /(?:시간\s*당|(?<![임출][신산]\s?)(?<!\d)1?\s*회\s*당|건\s*당|(?<!\d)1\s*식|(?<!\d)1\s*일\s*당?|(?<!\d)1\s*박|30\s*분\s*당)[^\d]{0,8}(?:[\d,.]+\s*(?:만|천)?\s*원\s*중\s*)?$/;
const UNIT_AFTER = /^\s*(?:\/\s*(?:1\s*인\s*[·,]\s*)?(?:1\s*식|1\s*박|1\s*일|1?\s*회|1?\s*시간)|\(\s*(?:1\s*식|1\s*박|1?\s*회\s*당|시간\s*당)\s*\))/;
/** 작은 금액인데 원문 구절에 단가 낱말이 있으면 단가로 본다 ('A형 시간당 10,354원, B형 9,136원') */
const UNIT_WORD = /시간\s*당|회\s*당|건\s*당|(?<!\d)1\s*식|(?<!\d)1\s*박|(?<!\d)1\s*일|일\s*당|단가/;
const SMALL_WON = 50_000;
const WON_RE = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(억|천만|만|천)?\s*(?:(\d+(?:,\d{3})*)\s*(천)?)?\s*원/g;
const WON_UNIT: Record<string, number> = { 억: 1e8, 천만: 1e7, 만: 1e4, 천: 1e3 };

/** 인용 안에서 이 금액이 적힌 자리의 앞뒤 (못 찾으면 인용 전체를 앞으로 본다) */
function around(m: Money): { before: string; after: string } {
  let hit: { before: string; after: string } | null = null;
  for (const x of m.quote.matchAll(WON_RE)) {
    const v = Math.round(Number(x[1].replace(/,/g, "")) * (x[2] ? WON_UNIT[x[2]] : 1) + (x[3] ? Number(x[3].replace(/,/g, "")) * (x[4] ? 1e3 : 1) : 0));
    if (v !== m.won) continue;
    const i = x.index ?? 0;
    hit = { before: m.quote.slice(Math.max(0, i - 24), i), after: m.quote.slice(i + x[0].length, i + x[0].length + 12) };
  }
  return hit ?? { before: m.quote, after: "" };
}

export interface MoneyView {
  money: Money;
  /** 화면 문구: '월 최대 100만원' 또는 '가구원 수에 따라 달라요' */
  label: string;
}
/** 요약에 쓸 금액 문구. 혜택이 아닌 금액(임금·보험 보장액·단가)이면 null */
export function moneyView(m: Money, name = ""): MoneyView | null {
  const { before, after } = around(m);
  if (WAGE_BEFORE.test(before)) return null;
  if (INSURANCE_NAME.test(name) && !PREMIUM_BEFORE.test(before)) return null;
  if (UNIT_BEFORE.test(before) || UNIT_AFTER.test(after)) return null;
  if (m.won < SMALL_WON && UNIT_WORD.test(m.quote)) return null;
  const distinctN = new Set([...m.quote.matchAll(HH_PAIR)].map((x) => x[1])).size;
  if (!HH_ANY.test(m.quote) && (HH_TABLE.test(m.quote) || distinctN >= 2)) return { money: m, label: "가구원 수에 따라 달라요" };
  return { money: m, label: moneyLabel(m) };
}

/** 금액이 원문에 있는 사업 (순서는 넘겨준 관련도 순서 그대로, 혜택이 아닌 금액은 건너뜀) */
export function moneyRows(programs: Program[], limit = 4): ({ program: Program } & MoneyView)[] {
  const seen = new Set<string>();
  const out: ({ program: Program } & MoneyView)[] = [];
  for (const p of programs) {
    if (!p.money || seen.has(p.id)) continue;
    seen.add(p.id);
    const v = moneyView(p.money, p.name);
    if (!v) continue;
    out.push({ program: p, ...v });
    if (out.length >= limit) break;
  }
  return out;
}
