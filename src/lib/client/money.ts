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

/** 금액이 원문에 있는 사업 (순서는 넘겨준 관련도 순서 그대로) */
export function moneyRows(programs: Program[], limit = 4): { program: Program; money: Money }[] {
  const seen = new Set<string>();
  const out: { program: Program; money: Money }[] = [];
  for (const p of programs) {
    if (!p.money || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ program: p, money: p.money });
    if (out.length >= limit) break;
  }
  return out;
}
