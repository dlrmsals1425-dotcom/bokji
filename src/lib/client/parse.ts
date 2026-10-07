/**
 * 상황 문장 해석기 (규칙 기반, LLM 없음 · 기기 안에서만 실행).
 * 예) "수원시 소재에 계시고 59년생 부모님 두분이 계신다"
 *   → 지역 경기 수원시 · 1959년생 만 66~67세(65~69세) · 부모님 두 분(2인 가구) · 부모님 대신 찾기
 * 해석 결과는 URL에 싣지 않는다 (sessionStorage로만 입력 화면에 넘김 — 개인 정보 원칙).
 */
import type { RegionIndex } from "../data/types";
import {
  AGE_BANDS, AGE_LABEL, BENEFIT_LABEL, EMPTY_PROFILE, HOUSING_LABEL,
  ageRange, type AgeBand, type Benefit, type HouseholdTrait, type Housing, type Profile,
} from "../engine/profile";
import type { FindMode } from "./mode";

export interface Understood {
  /** 항목 이름 (지역·나이·가구·대상·상황) */
  key: "region" | "age" | "household" | "target" | "signal";
  label: string;
}

export interface ParsedSituation {
  mode: FindMode | null;
  /** 해석으로 채운 프로필 (나머지는 '모름') */
  profile: Profile;
  understood: Understood[];
  /** 확인이 필요한 점 (나이 경계, 지역 여러 곳 등) */
  notes: string[];
  /** 지역·나이·가족 낱말 중 하나라도 있으면 '상황 문장'으로 본다 */
  looksLikeSituation: boolean;
  /** 문장에서 지역으로 읽은 낱말 (검색어에서 뺄 때 사용) */
  regionTerms: string[];
  /** 만 나이 범위 (해석했을 때) */
  ageRange?: [number, number];
}

/* ---------------- 지역 ---------------- */

/** 시도 별칭 (번들 지역 코드 기준) */
const SIDO_ALIAS: Record<string, string[]> = {
  "11000": ["서울", "서울시", "서울특별시"],
  "12000": ["광주", "광주광역시", "전남", "전라남도", "전남광주"],
  "26000": ["부산", "부산시", "부산광역시"],
  "27000": ["대구", "대구시", "대구광역시"],
  "28000": ["인천", "인천시", "인천광역시"],
  "30000": ["대전", "대전시", "대전광역시"],
  "31000": ["울산", "울산시", "울산광역시"],
  "36000": ["세종", "세종시"],
  "41000": ["경기", "경기도"],
  "43000": ["충북", "충청북도"],
  "44000": ["충남", "충청남도"],
  "47000": ["경북", "경상북도"],
  "48000": ["경남", "경상남도"],
  "50000": ["제주", "제주도"],
  "51000": ["강원", "강원도"],
  "52000": ["전북", "전라북도"],
};

/** 일반구·생활권 이름 → 시 (번들은 시 단위). [시도 코드, 시 이름, 낱말들] */
const GU_TO_CITY: [string, string, string[]][] = [
  ["41000", "수원시", ["장안구", "권선구", "팔달구", "영통구", "광교"]],
  ["41000", "성남시", ["수정구", "중원구", "분당구", "분당", "판교"]],
  ["41000", "안양시", ["만안구", "동안구", "평촌"]],
  ["41000", "안산시", ["상록구", "단원구"]],
  ["41000", "고양시", ["덕양구", "일산동구", "일산서구", "일산"]],
  ["41000", "용인시", ["처인구", "기흥구", "수지구", "수지", "기흥"]],
  ["41000", "부천시", ["원미구", "소사구", "오정구"]],
  ["41000", "화성시", ["동탄"]],
  ["43000", "청주시", ["상당구", "서원구", "흥덕구", "청원구"]],
  ["44000", "천안시", ["동남구", "서북구"]],
  ["52000", "전주시", ["완산구", "덕진구"]],
  ["48000", "창원시", ["의창구", "성산구", "마산합포구", "마산회원구", "진해구", "마산", "진해"]],
];

/** 시군구 이름에서 '시·군·구'를 뗀 낱말 중 흔한 일반 낱말과 겹치는 것 (예: 고령자, 장수, 음성) → 줄임말로는 읽지 않음 */
const STEM_BLOCK = new Set([
  "고령", "장수", "음성", "예산", "영광", "보은", "수영", "연수", "고양", "동해", "공주", "진주", "상주", "구리", "화성",
  "이천", "진도", "고성", "인제", "신안", "강서", "보성", "금산", "청도", "성주", "중", "동", "서", "남", "북", "광산",
  "영동", "옥천", "괴산", "단양", "증평", "양구", "남해", "부안", "광주", "세종", "영도", "사상", "동래", "금정", "기장",
  "달성", "군위", "검단", "영종", "강화", "옹진", "서해", "제물포", "남동", "계양", "부평", "미추홀",
]);

interface RegionHit {
  start: number;
  end: number;
  term: string;
  sido?: string;
  /** 시군구 후보 (같은 이름이 여러 시도에 있을 수 있음) */
  sigungus?: { code: string; sido: string }[];
}

const HANGUL = /[가-힣]/;
/** 줄임말(예: 수원) 뒤에 올 수 있는 말 */
const AFTER_STEM = /^(?:$|[^가-힣]|에서|에|쪽|지역|사|살|거주|소재|시민|도민|군민|구민|으로|로|인근|근처|은|는|의|이고|이며|이에요|입니다|이랑|하고|권)/;

function findAll(text: string, term: string): number[] {
  const out: number[] = [];
  let i = text.indexOf(term);
  while (i >= 0) {
    out.push(i);
    i = text.indexOf(term, i + 1);
  }
  return out;
}

function regionHits(text: string, regions: RegionIndex): RegionHit[] {
  const hits: RegionHit[] = [];
  const push = (term: string, mk: (i: number) => RegionHit | null, stem: boolean) => {
    for (const i of findAll(text, term)) {
      const prev = i > 0 ? text[i - 1] : "";
      const after = text.slice(i + term.length);
      // 앞 글자가 한글이면 다른 낱말의 일부 (예: '동수원' 같은 경우는 드묾) — 시도 이름 바로 뒤('경기도수원시')는 허용
      if (prev && HANGUL.test(prev) && !/[도시]$/.test(prev)) continue;
      if (stem && !AFTER_STEM.test(after)) continue;
      if (!stem && term.length <= 2 && after && HANGUL.test(after[0]) && !AFTER_STEM.test(after)) continue;
      const h = mk(i);
      if (h) hits.push(h);
    }
  };
  for (const s of regions.sidos) {
    const names = new Set([s.name, s.short, ...(SIDO_ALIAS[s.code] ?? [])]);
    for (const n of names) push(n, (i) => ({ start: i, end: i + n.length, term: n, sido: s.code }), n.length <= 2);
  }
  const byName = new Map<string, { code: string; sido: string }[]>();
  for (const s of regions.sidos) for (const g of s.sigungus) {
    const arr = byName.get(g.name) ?? [];
    arr.push({ code: g.code, sido: s.code });
    byName.set(g.name, arr);
  }
  for (const [name, cands] of byName) {
    if (name === "세종특별자치시") continue;
    push(name, (i) => ({ start: i, end: i + name.length, term: name, sigungus: cands }), false);
    const stem = name.replace(/(시|군|구)$/, "");
    if (name.length >= 3 && stem.length >= 2 && !STEM_BLOCK.has(stem)) {
      push(stem, (i) => ({ start: i, end: i + stem.length, term: stem, sigungus: cands }), true);
    }
  }
  for (const [sido, city, words] of GU_TO_CITY) {
    const s = regions.sidos.find((x) => x.code === sido);
    const g = s?.sigungus.find((x) => x.name === city);
    if (!g) continue;
    for (const w of words) push(w, (i) => ({ start: i, end: i + w.length, term: w, sigungus: [{ code: g.code, sido }] }), !/구$/.test(w));
  }
  // 긴 낱말 안에 든 짧은 일치는 버린다 (수원시 ⊃ 수원)
  return hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start));
}

function resolveRegion(text: string, regions: RegionIndex) {
  const hits = regionHits(text, regions);
  const sidoHits = hits.filter((h) => h.sido);
  const sggHits = hits.filter((h) => h.sigungus);
  const sidoSet = new Set(sidoHits.map((h) => h.sido!));
  let sigungu: string | null = null;
  let sido: string | null = null;
  const notes: string[] = [];
  let cands = sggHits.flatMap((h) => h.sigungus!.map((c) => ({ ...c, h })));
  // 같은 자리에서 시도 이름과 겹치는 시군구 줄임말(예: '광주' → 경기 광주시, '제주' → 제주시)은
  // 다른 시군구 낱말이 있으면 버리고, 없으면 그 시도가 다른 자리에서 언급될 때만 시군구로 본다
  const sameSpan = (c: (typeof cands)[number]) => sidoHits.some((s) => s.start === c.h.start && s.end === c.h.end);
  const otherSido = (c: (typeof cands)[number]) => sidoHits.some((s) => s.sido === c.sido && !(s.start === c.h.start && s.end === c.h.end));
  cands = cands.some((c) => !sameSpan(c)) ? cands.filter((c) => !sameSpan(c)) : cands.filter(otherSido);
  if (sidoSet.size) {
    const inSido = cands.filter((c) => sidoSet.has(c.sido));
    if (inSido.length) cands = inSido;
  }
  const codes = [...new Set(cands.map((c) => c.code))];
  if (codes.length === 1) {
    sigungu = codes[0];
    sido = cands[0].sido;
  } else if (codes.length > 1) {
    const sidos = [...new Set(cands.map((c) => c.sido))];
    if (sidos.length === 1) sido = sidos[0];
    const labels = codes.slice(0, 4).map((code) => labelFor(regions, cands.find((c) => c.code === code)!.sido, code));
    notes.push(`지역이 여러 곳으로 읽혀요 (${labels.join(", ")}${codes.length > 4 ? " 등" : ""}). 시·군·구를 골라 주세요.`);
  } else if (sidoSet.size === 1) {
    sido = [...sidoSet][0];
  } else if (sidoSet.size > 1) {
    notes.push("시·도가 여러 곳으로 읽혀요. 지역을 골라 주세요.");
  }
  const used = sigungu ? cands.filter((c) => c.code === sigungu).map((c) => c.h.term) : [];
  const usedSido = sido ? sidoHits.filter((h) => h.sido === sido).map((h) => h.term) : [];
  return { sido, sigungu, notes, terms: [...new Set([...used, ...usedSido])], any: hits.length > 0 };
}

function labelFor(regions: RegionIndex, sido: string, sigungu?: string | null): string {
  const s = regions.sidos.find((x) => x.code === sido);
  if (!s) return "";
  const g = sigungu ? s.sigungus.find((x) => x.code === sigungu) : undefined;
  return g ? (g.name === s.name ? s.name : `${s.short} ${g.name}`) : s.name;
}

/* ---------------- 나이 ---------------- */

export interface Today {
  year: number;
  month: number;
  day: number;
}

export const todayInSeoul = (d = new Date()): Today => {
  const [y, m, dd] = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).split("-").map(Number);
  return { year: y, month: m, day: dd };
};

/** 출생연도(·월) → 만 나이 범위 */
export function ageFromBirth(year: number, today: Today, month?: number): [number, number] {
  const full = today.year - year;
  if (!month) return [full - 1, full];
  if (month < today.month) return [full, full];
  if (month > today.month) return [full - 1, full - 1];
  return [full - 1, full];
}

const bandOf = (age: number): AgeBand | null => {
  if (age < 0) return null;
  return AGE_BANDS.find((b) => {
    const [lo, hi] = ageRange(b);
    return age >= lo && age <= hi;
  }) ?? null;
};

const KOR_NUM: Record<string, number> = { 한: 1, 혼: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };

function parseAge(text: string, today: Today) {
  const notes: string[] = [];
  const ranges: { r: [number, number]; label: string; birth?: number; decade?: boolean }[] = [];
  // 1959년생 · 59년생 · 59년 3월생 · '59년생
  const re = /(?:^|[^0-9])'?((?:19|20)?\d{2})\s*년(?:도)?\s*(?:(\d{1,2})\s*월\s*)?(?:생|출생|에\s*태어)/g;
  for (const m of text.matchAll(re)) {
    let y = Number(m[1]);
    if (m[1].length === 2) y = y > today.year % 100 ? 1900 + y : 2000 + y;
    if (y < 1900 || y > today.year) continue;
    const mon = m[2] ? Number(m[2]) : undefined;
    const r = ageFromBirth(y, today, mon && mon >= 1 && mon <= 12 ? mon : undefined);
    ranges.push({ r, birth: y, label: `${y}년생 → 만 ${r[0] === r[1] ? r[0] : `${r[0]}~${r[1]}`}세` });
  }
  // 만 66세 · 66세 · 66살 (단, '65세 이상' 같은 조건 표현은 제외)
  for (const m of text.matchAll(/(?:만\s*)?(\d{1,3})\s*(?:세|살)(?!\s*(?:이상|이하|미만|초과|부터|까지|넘|이후))/g)) {
    const a = Number(m[1]);
    if (a > 0 && a < 120) ranges.push({ r: [a, a], label: `만 ${a}세` });
  }
  // 60대 · 70대 후반
  for (const m of text.matchAll(/([2-9]0)\s*대\s*(초반|중반|후반)?/g)) {
    const d = Number(m[1]);
    const r: [number, number] = m[2] === "초반" ? [d, d + 3] : m[2] === "중반" ? [d + 3, d + 6] : m[2] === "후반" ? [d + 6, d + 9] : [d, d + 9];
    ranges.push({ r, label: `${d}대${m[2] ? ` ${m[2]}` : ""}`, decade: true });
  }
  for (const [w, a] of [["칠순", 70], ["팔순", 80], ["구순", 90], ["망구", 81]] as const) {
    if (text.includes(w)) ranges.push({ r: [a, a + 1], label: `${w} (만 ${a}세 안팎)` });
  }
  if (!ranges.length) return null;
  // 여러 분이면 연세가 가장 많은 분 기준
  const pick = ranges.reduce((a, b) => (b.r[1] > a.r[1] ? b : a));
  const multi = new Set(ranges.map((x) => x.label)).size > 1;
  let band: AgeBand | "unknown" = "unknown";
  const lo = bandOf(pick.r[0]);
  const hi = bandOf(pick.r[1]);
  if (lo && lo === hi) band = lo;
  else if (!pick.decade && hi) {
    // 출생연도만 알면 생일 전후로 1살 차이 → 위쪽 나이대로 보고 확인 문구
    band = hi;
    notes.push(`생신이 지나지 않으셨다면 만 ${pick.r[0]}세예요 (${AGE_LABEL[lo ?? hi]} 기준이 될 수 있어요).`);
  } else {
    notes.push(`${pick.label}는 나이대가 둘 이상에 걸쳐요. 정확한 나이대를 골라 주세요.`);
  }
  if (multi) notes.push("나이가 여러 개 있어 연세가 가장 많은 분 기준으로 찾았어요. 다른 분도 따로 확인해 보세요.");
  const ageLabel = band === "unknown" ? `${pick.label} (나이대 확인 필요)` : `${pick.label}${pick.decade ? "" : ` (${AGE_LABEL[band]})`}`;
  return { band, range: pick.r, label: ageLabel, notes };
}

/* ---------------- 대상·가구·상황 ---------------- */

const PARENT_RE = /(부모|어머니|어머님|엄마|아버지|아버님|아빠|시부모|시어머니|시어머님|시아버지|시아버님|장인|장모|친정|시댁|양친|할머니|할아버지|조부모|노모|노부)/;
const SELF_RE = /(?:^|\s)(?:나는|내가|난|저는|제가|본인은|본인이|저희\s*집)(?=\s|$)|저\s*혼자|나\s*혼자/;
const COUPLE_RE = /(두\s*분|부부|내외|양친|두\s*사람|둘이서?|노부부)/;
const ALONE_RE = /((?:혼자|홀로)\s*(?:사|살|계|지내|되)|독거|홀몸|1\s*인\s*가구)/;

export function parseSituation(raw: string, regions: RegionIndex | null, today: Today = todayInSeoul()): ParsedSituation {
  const text = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const p: Profile = { ...EMPTY_PROFILE };
  const understood: Understood[] = [];
  const notes: string[] = [];
  const signals: string[] = [];

  // 지역
  let regionTerms: string[] = [];
  let regionFound = false;
  if (regions) {
    const r = resolveRegion(text, regions);
    p.sido = r.sido;
    p.sigungu = r.sigungu;
    notes.push(...r.notes);
    regionTerms = r.terms;
    regionFound = r.any;
    if (r.sido) understood.push({ key: "region", label: labelFor(regions, r.sido, r.sigungu) });
  }

  // 대상 (부모님 / 본인)
  const parentWord = text.match(PARENT_RE)?.[1];
  let mode: FindMode | null = null;
  if (parentWord) {
    mode = "parent";
    understood.push({ key: "target", label: `${/(할머니|할아버지|조부모)/.test(parentWord) ? parentWord : "부모님"} 대신 찾기` });
  } else if (SELF_RE.test(text)) {
    mode = "self";
    understood.push({ key: "target", label: "내 복지 찾기" });
  }

  // 나이
  const age = parseAge(text, today);
  if (age) {
    p.age = age.band;
    understood.push({ key: "age", label: age.label });
    notes.push(...age.notes);
  }

  // 가구
  const nIn = text.match(/(\d)\s*인\s*가구|가족\s*(?:이\s*)?(\d)\s*명|(\d)\s*식구|(한|두|세|네|다섯|여섯)\s*식구/);
  if (ALONE_RE.test(text)) {
    p.householdSize = 1;
    p.traits = ["single"];
    understood.push({ key: "household", label: "혼자 사심 (1인 가구)" });
  } else if (nIn) {
    const n = Number(nIn[1] ?? nIn[2] ?? nIn[3]) || KOR_NUM[nIn[4]] || 0;
    if (n >= 1) {
      p.householdSize = Math.min(6, n) as Profile["householdSize"];
      understood.push({ key: "household", label: n >= 6 ? "6명 이상 가구" : `${n}인 가구` });
    }
  } else if (COUPLE_RE.test(text)) {
    p.householdSize = 2;
    understood.push({ key: "household", label: mode === "parent" ? "부모님 두 분 (부부 2인 가구)" : "부부 2인 가구" });
  }

  // 그 밖의 상황 신호
  const care: Profile["care"] = [];
  if (/치매/.test(text)) { care.push("daily"); signals.push("치매 (돌봄 필요)"); }
  if (/(요양\s*등급|장기\s*요양|거동|못\s*걸|누워\s*(?:계|지내)|와상|(?:일상\s*생활|식사|거동).{0,6}(?:어려|힘들|도움))/.test(text) && !care.includes("daily")) {
    care.push("daily");
    signals.push("일상생활 도움 필요");
  } else if (/요양\s*등급|장기\s*요양/.test(text)) signals.push("장기요양 등급");
  if (/퇴원/.test(text)) { care.push("discharged"); signals.push("최근 퇴원"); }
  if (care.length) p.care = care;

  if (/장애/.test(text)) {
    if (/장애\s*(?:는|가|도)?\s*(?:없|아니)/.test(text)) {
      p.disability = "none";
    } else {
      const member = /(아들|딸|동생|형|누나|언니|오빠|자녀|손자|손녀|가족\s*중|가구원)[^.]{0,8}장애/.test(text);
      p.disability = member ? "member" : "self";
      if (/(중증|심한\s*장애|장애\s*정도가\s*심한)/.test(text)) p.disabilitySeverity = "severe";
      else if (/(경증|심하지\s*않은)/.test(text)) p.disabilitySeverity = "mild";
      signals.push(member ? "장애가 있는 가족" : mode === "parent" ? "장애 (부모님 본인)" : "장애 (본인)");
    }
  }

  const benefits: Benefit[] = [];
  const has = (re: RegExp) => re.test(text) && !new RegExp(re.source + "\\s*(?:을|를|이|가)?\\s*(?:받을\\s*수|될\\s*수|되나|인지|대상인지|신청)").test(text);
  if (/기초연금\s*(?:을|를)?\s*(?:받고|받으시|받는|받으심|수급\s*중|타고|타시)/.test(text)) benefits.push("basic_pension");
  if (has(/(?:기초\s*생활\s*수급|생계\s*급여|수급자)/)) benefits.push("livelihood");
  if (has(/의료\s*급여/)) benefits.push("medical");
  if (has(/주거\s*급여/)) benefits.push("housing");
  if (has(/차상위/)) benefits.push("near_poverty");
  if (benefits.length) {
    p.benefits = benefits;
    signals.push(benefits.map((b) => BENEFIT_LABEL[b]).join("·"));
  }

  let housing: Housing | null = null;
  if (/월세/.test(text)) housing = "monthly";
  else if (/전세/.test(text)) housing = "jeonse";
  else if (/(영구\s*임대|국민\s*임대|공공\s*임대|임대\s*아파트|행복\s*주택|LH)/.test(text)) housing = "public_rental";
  else if (/(자가|자기\s*집|본인\s*집|집\s*(?:이|은)\s*있)/.test(text)) housing = "own";
  if (housing) {
    p.housing = housing;
    signals.push(HOUSING_LABEL[housing]);
  }

  const traits: HouseholdTrait[] = [...(p.traits ?? [])];
  if (/(한부모|조손)/.test(text)) traits.push("single_parent");
  if (/다자녀/.test(text)) traits.push("multi_child");
  if (/(국가\s*유공자|보훈|참전)/.test(text)) traits.push("veteran");
  if (/(다문화|결혼\s*이민|북한\s*이탈|탈북)/.test(text)) traits.push("multicultural");
  if (traits.length) p.traits = [...new Set(traits)];
  if (traits.some((t) => t !== "single")) signals.push(traits.filter((t) => t !== "single").map((t) => ({ single_parent: "한부모·조손", multi_child: "다자녀", veteran: "보훈", multicultural: "다문화·북한이탈" })[t as Exclude<HouseholdTrait, "single">]).join("·"));

  if (/(구직|실직|일자리\s*(?:를|을)?\s*(?:찾|구하))/.test(text) && !/노인\s*일자리/.test(text)) {
    p.activity = "job_seeking";
    signals.push("구직 중");
  }
  if (mode !== "parent" && /임신/.test(text)) {
    p.children = ["pregnant"];
    signals.push("임신 중");
  }
  if (/(저소득|형편이?\s*어려|어렵게\s*사)/.test(text)) notes.push("소득이 낮다고 하셨어요. 소득 구간을 입력하면 더 정확해져요.");

  for (const s of signals) understood.push({ key: "signal", label: s });

  const familyWord = !!parentWord || ALONE_RE.test(text) || COUPLE_RE.test(text) || !!nIn;
  return {
    mode,
    profile: p,
    understood,
    notes,
    looksLikeSituation: regionFound || !!age || familyWord,
    regionTerms,
    ageRange: age?.range,
  };
}

/** 확인 배너 한 줄 (예: "경기 수원시 · 1959년생 → 만 66~67세 (65~69세) · 부모님 두 분 (부부 2인 가구)") */
export function understoodLine(ps: ParsedSituation): string {
  const order: Understood["key"][] = ["region", "age", "household", "signal"];
  return order.flatMap((k) => ps.understood.filter((u) => u.key === k).map((u) => u.label)).join(" · ");
}

/* ---------------- 입력 화면으로 넘기기 (sessionStorage, URL에 싣지 않음) ---------------- */

export const PREFILL_KEY = "bn.prefill.v1";

export interface Prefill {
  text: string;
  parsed: ParsedSituation;
  at: number;
}

export function savePrefill(text: string, parsed: ParsedSituation) {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ text, parsed, at: Date.now() } satisfies Prefill));
  } catch {}
}

export function readPrefill(): Prefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Prefill;
    // 30분 지난 해석은 버린다
    if (!v?.parsed || Date.now() - v.at > 30 * 60 * 1000) return null;
    return v;
  } catch {
    return null;
  }
}

export function clearPrefill() {
  try {
    sessionStorage.removeItem(PREFILL_KEY);
  } catch {}
}

/** 해석 결과로 갈 입력 화면 주소 (해석 내용은 싣지 않음) */
export function prefillPath(ps: ParsedSituation): string {
  return `/check?for=${ps.mode ?? "self"}&prefill=1`;
}
