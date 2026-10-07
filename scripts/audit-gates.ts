/**
 * v2 감사: 예시 5개 + 운영자 문장 상황의 '지금 결과 화면' 상위 30개(본문 묶음, 관련도 순)에서
 * '가능성 있음'·'확인 필요'(또는 조건 충족이지만 원문에 저소득·수급 대상이 적힌 것)가 어떤 '모르는 사실' 때문인지 센다.
 *   npx tsx scripts/audit-gates.ts  →  docs/v2-audit-gates.md
 * 방법: 사실 하나의 답만 바꿔 다시 판정(반사실)해서 분류(받을 수 있음/맞지 않음/미정)가 바뀌면 '그 사실이 정한다'.
 */
import fs from "node:fs";
import path from "node:path";
import { PRESETS } from "../src/lib/client/presets";
import { parseSituation } from "../src/lib/client/parse";
import { groupVariants, scoreAll } from "../src/lib/client/results";
import { DIMS, DIM_BY_ID, classifyBase, decidingDims, dimsFor, extrasFromProfile, inMain, textGate, type Base, type DimId, type Situation } from "../src/lib/client/v2";
import type { Bundle, Program } from "../src/lib/data/types";
import type { Reason } from "../src/lib/engine/types";

const B = path.resolve(__dirname, "../public/bundles/v1");
const read = (f: string): Bundle | null => (fs.existsSync(path.join(B, f)) ? JSON.parse(fs.readFileSync(path.join(B, f), "utf8")) : null);
const OWNER = "수원시 소재에 계시고 59년생 부모님 두분이 계신다";
const owner = parseSituation(OWNER, JSON.parse(fs.readFileSync(path.join(B, "regions.json"), "utf8")), { year: 2026, month: 10, day: 7 });
const SCENARIOS = [...PRESETS.map((p) => ({ id: p.id, title: p.title, profile: p.profile })), { id: "owner-sentence", title: `운영자 문장 '${OWNER}'`, profile: owner.profile }];

const DIM_LABEL: Record<DimId, string> = {
  age: "나이 (만)",
  support: "기초생활수급(생계·의료·주거·교육급여)·차상위 여부",
  basicPension: "기초연금 수급(소득 하위 70%)",
  income: "가구 소득 (기준 중위소득 %)",
  children: "자녀 유무·나이대 (임신 포함)",
  disability: "장애 등록·정도",
  care: "일상생활 도움 필요",
  ltcGrade: "장기요양등급",
  alone: "혼자 사는지 (독거)",
  veteran: "보훈 대상",
  singleParent: "한부모·조손 가구",
  multicultural: "다문화·북한이탈",
  housing: "주거 형태",
  activity: "일·구직 상태",
  illness: "질병·진단 (치매·암·희귀질환 등)",
};

/** 걸린 '모름' 사실들을 함께 답했을 때 정해지는지 (모든 답 조합, 사실 3개까지) */
function jointDecides(p: Program, sit: Situation, cur: Base, dims: DimId[]): boolean {
  const ds = dims.slice(0, 3).map((id) => DIM_BY_ID[id]);
  const rec = (i: number, s: Situation): boolean => {
    if (i === ds.length) return classifyBase(p, s).base !== cur;
    return ds[i].answers.some((a) => rec(i + 1, a.apply(s)));
  };
  return ds.length > 0 && rec(0, sit);
}

/** 답으로 정할 수 없는(간편 입력 밖) 남은 조건 분류 */
function blocker(r: Reason): string {
  const t = r.leaf?.label ?? r.text;
  if (r.kind === "note") return /상담으로 판단/.test(r.text) ? "상담으로 판단 (비정형 핵심 조건)" : /재산·세부 요건은 원문/.test(r.text) ? "" : `원문 추가 조건: ${r.text.replace(/^추가로 확인할 조건:\s*/, "").slice(0, 28)}`;
  if (r.leaf?.capU) return "세부 기준 (사업 유형·격년제·임신 등)";
  if (/장기\s*요양|등급/.test(t)) return "장기요양등급";
  if (/여성|남성|성별/.test(t)) return "성별";
  if (/임신|출산|난임/.test(t)) return "임신·출산";
  if (/농업|어업|축산|임업|근로자|종사자|공무원|사업자|교직원|군인|선수/.test(t)) return "직업·신분";
  if (/질병|질환|환자|진단|치매|입원/.test(t)) return "질병·진단";
  if (/피해|유족|학대|외국인|재학|대출|신용|채무/.test(t)) return "특정 신분·사건 (피해자·유족·재학 등)";
  if (/원문의 대상 요건/.test(t)) return "원문 대상 요건 (기타)";
  return `기타: ${t.slice(0, 24)}`;
}

/** 원문(이름·요약·대상)에 적힌 소득·수급 문구 — 운영자가 지적한 '모호한 대상' */
const PHRASES: [string, RegExp][] = [
  ["'수급자'(기초생활·생계·의료급여)", /(기초\s*생활\s*(보장\s*)?수급|생계\s*급여|의료\s*급여|수급자|수급권자)/],
  ["'차상위'", /차상위/],
  ["'저소득'(숫자 없음)", /저소득/],
  ["'취약계층'", /취약\s*계층/],
  ["'중위소득 N%'", /중위\s*소득\s*\d{2,3}\s*%/],
  ["'기초연금 수급'", /기초\s*연금\s*(수급|대상|받)/],
  ["'… 우선'", /(저소득|수급자|차상위|취약\s*계층)[^.。\n]{0,15}우선/],
  ["'독거·홀몸'", /(독거|홀몸|혼자\s*사는)/],
  ["'장기요양등급'", /장기\s*요양\s*(등급|인정)/],
];

const md: string[] = [
  "# v2 감사 — 상위 30개 결과가 '모르는 사실' 때문에 애매한 경우",
  "",
  `생성: ${new Date().toISOString().slice(0, 10)} · 대상: 예시 5개 + 운영자 문장 = 6개 상황 × 지금 결과 화면(본문) 관련도 상위 30개 묶음 = 180개`,
  "",
  "- **정하는 사실**: 그 사실 하나의 답만 바꿔 다시 판정했을 때 '받을 수 있음/맞지 않음/미정' 분류가 바뀌면 그 사실이 정한다고 셈 (한 사업이 여러 사실에 걸릴 수 있음).",
  "- **남는 조건**: 어떤 답으로도 정해지지 않는 조건 (간편 입력 밖) — 신청할 때 확인.",
  "",
];
const total: Record<string, { n: number; scen: Set<string> }> = {};
const involvedTotal: Record<string, { n: number; scen: Set<string> }> = {};
const removed: Record<string, number> = {};
const removedNames: Record<string, string[]> = {};
let joint = 0;
const blockTotal: Record<string, number> = {};
const phraseTotal: Record<string, number> = {};
const tierTotal: Record<string, number> = {};
let ambiguous = 0;
let decidable = 0;
let all = 0;

for (const sc of SCENARIOS) {
  const p = sc.profile;
  const programs: Program[] = [...(read(`sigungu/${p.sigungu}.json`)?.programs ?? []), ...(read(`sido/${p.sido}.json`)?.programs ?? []), ...(read("national.json")?.programs ?? [])];
  const scored = scoreAll(programs, p);
  const key = (s: (typeof scored)[number]) => s.score + (s.ev.tier === "eligible" ? 2 : 0);
  const main = scored.filter((s) => s.ev.tier !== "ineligible" && inMain(s.program)).sort((a, b) => key(b) - key(a) || a.program.name.localeCompare(b.program.name, "ko"));
  const top = groupVariants(main).slice(0, 30);
  const sit: Situation = { profile: p, x: extrasFromProfile(p) };
  md.push(`## ${sc.title} (${sc.id})`, "", "| # | 사업 | 지금 판정 | 원문 소득·수급 문구 | 정하는 사실 (답하면 정해짐) | 남는 조건 | v2 |", "|---|---|---|---|---|---|---|");
  const local: Record<string, number> = {};
  top.forEach((g, i) => {
    all++;
    const s = g.lead;
    const pr = s.program;
    tierTotal[s.ev.tier] = (tierTotal[s.ev.tier] ?? 0) + 1;
    const text = `${pr.name} ${pr.summary ?? ""} ${(pr.target ?? "").slice(0, 300)}`;
    const phrases = PHRASES.filter(([, re]) => re.test(text)).map(([l]) => l);
    phrases.forEach((l) => (phraseTotal[l] = (phraseTotal[l] ?? 0) + 1));
    const base = classifyBase(pr, sit);
    const tg = textGate(pr);
    const gateUnknown = base.gateState === "unknown";
    const isAmb = s.ev.tier !== "eligible" || gateUnknown;
    if (isAmb) ambiguous++;
    const dims = base.base === "open" || base.base === "autoFit" ? decidingDims(pr, sit, base.base) : [];
    if (dims.length) decidable++;
    const involved = base.base === "open" || base.base === "autoFit" ? dimsFor(pr).filter((d) => DIM_BY_ID[d].isUnknown(sit)) : [];
    const jointOk = !dims.length && involved.length > 1 && jointDecides(pr, sit, base.base, involved);
    if (jointOk) joint++;
    if (isAmb) involved.forEach((d) => {
      (involvedTotal[d] ??= { n: 0, scen: new Set() }).n++;
      involvedTotal[d].scen.add(sc.id);
    });
    if (base.base === "no") {
      const why = base.gateState === "no" ? "원문 소득·수급 문구 (이미 답한 소득·수급과 맞지 않음)" : "참고(soft) 조건이 이미 답한 내용과 맞지 않음";
      removed[why] = (removed[why] ?? 0) + 1;
      (removedNames[sc.id] ??= []).push(`${pr.name} (${base.gateState === "no" ? base.gate?.text : "soft"})`);
    }
    dims.forEach((d) => {
      (total[d] ??= { n: 0, scen: new Set() }).n++;
      total[d].scen.add(sc.id);
      local[d] = (local[d] ?? 0) + 1;
    });
    const blocks = new Set<string>();
    if (base.base === "autoFit") blocks.add("자동 정리 규칙 (원문 대조 전)");
    if (!pr.rule.logic) blocks.add("규칙 없음 (원문 확인)");
    if (base.base === "open" || base.base === "autoFit") {
      for (const r of base.ev.reasons) {
        if (r.kind === "unknown" && r.leaf && r.leaf.field !== "unasked" && !r.leaf.capU) continue; // 입력 항목 — 위 '정하는 사실'로 셈
        if (r.kind === "unknown" || (r.kind === "note" && s.ev.tier !== "eligible")) {
          const b = blocker(r);
          if (b) blocks.add(b);
        }
      }
    }
    if (!dims.length && !jointOk && isAmb) blocks.forEach((b) => (blockTotal[b] = (blockTotal[b] ?? 0) + 1));
    const gateNote = tg.gate ? ` · 원문 관문: ${tg.gate.text}` : tg.partial ? " · 일부 유형만 소득 조건" : "";
    const decided = dims.length ? dims.map((d) => DIM_LABEL[d]).join(", ") : jointOk ? `함께: ${involved.map((d) => DIM_LABEL[d]).join(" + ")}` : "";
    const v2 = base.base === "no" ? "**v2에서 빠짐**" : base.base === "fit" ? "받을 수 있음" : dims.length || jointOk ? "질문" : "신청 때 확인";
    md.push(`| ${i + 1} | ${pr.name} | ${s.ev.tier}${gateNote} | ${phrases.join(", ")} | ${decided} | ${[...blocks].join(", ")} | ${v2} |`);
  });
  md.push("", `정하는 사실 (이 상황): ${Object.entries(local).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${DIM_LABEL[d as DimId]} ${n}`).join(" · ") || "없음"}`, "");
}

const summary: string[] = [
  "## 요약",
  "",
  `- 상위 30개 × 6 = ${all}개 중 애매한 것(가능성 있음·확인 필요, 또는 조건 충족이지만 원문 소득·수급 문구가 미정): **${ambiguous}개** (판정 분포: ${Object.entries(tierTotal).map(([t, n]) => `${t} ${n}`).join(" · ")})`,
  `- 그중 사실 하나에 답하면 정해지는 것: **${decidable}개**, 사실 2~3개를 함께 답하면 정해지는 것: **${joint}개** / 나머지는 간편 입력 밖 조건 (신청할 때 확인)`,
  `- 이미 답한 내용(소득·수급 등)과 맞지 않는데도 지금 상위 30개에 보이는 것: **${Object.values(removed).reduce((a, b) => a + b, 0)}개** (${Object.entries(removed).map(([k, v]) => `${k} ${v}`).join(" · ")}) → v2에서는 본문에서 뺌`,
  ...Object.entries(removedNames).map(([k, v]) => `  - ${k}: ${v.join(", ")}`),
  "",
  "### 정하는 사실 순위 (상위 30개 기준, 사업 수 · 걸린 상황 수)",
  "",
  "| 순위 | 사실 | 사업 수 | 상황 수 |",
  "|---|---|---|---|",
  ...Object.entries(total).sort((a, b) => b[1].n - a[1].n).map(([d, v], i) => `| ${i + 1} | ${DIM_LABEL[d as DimId]} | ${v.n} | ${v.scen.size}/6 |`),
  "",
  "### 걸린 사실 순위 (애매한 사업의 판정에 걸린 '모름' 사실 — 혼자 또는 함께 정함)",
  "",
  "| 순위 | 사실 | 사업 수 | 상황 수 |",
  "|---|---|---|---|",
  ...Object.entries(involvedTotal).sort((a, b) => b[1].n - a[1].n).map(([d, v], i) => `| ${i + 1} | ${DIM_LABEL[d as DimId]} | ${v.n} | ${v.scen.size}/6 |`),
  "",
  "### 답으로 정할 수 없는 남는 조건 (정하는 사실이 없는 사업 기준)",
  "",
  "| 조건 | 사업 수 |",
  "|---|---|",
  ...Object.entries(blockTotal).sort((a, b) => b[1] - a[1]).map(([b, n]) => `| ${b} | ${n} |`),
  "",
  "### 원문에 적힌 소득·수급·대상 문구 (상위 30개 중 등장 수)",
  "",
  "| 문구 | 사업 수 |",
  "|---|---|",
  ...Object.entries(phraseTotal).sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} |`),
  "",
  `질문 후보 전체: ${DIMS.map((d) => d.id).join(", ")}`,
  "",
];
md.splice(7, 0, ...summary);
const outPath = path.resolve(__dirname, "../docs/v2-audit-gates.md");
fs.writeFileSync(outPath, md.join("\n"));
console.log(summary.join("\n"));
console.log("saved", outPath);
