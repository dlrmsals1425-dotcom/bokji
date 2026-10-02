/**
 * 경기도 무작위 30개 사업 종단 점검 (데이터·링크·연락처).
 * 사용: npx tsx scripts/spotcheck.ts [seed] → pipeline/out/spotcheck-gyeonggi.md
 * 링크는 HEAD→GET 으로 상태 코드만 확인한다 (API 키를 쓰지 않는 공개 페이지만 대상).
 */
import fs from "node:fs";
import path from "node:path";
import type { Bundle, Program } from "../src/lib/data/types";
import { detailBucket } from "../src/lib/data/bucket";

const ROOT = path.resolve(__dirname, "..");
const B = path.join(ROOT, "public/bundles/v1");
const seed = Number(process.argv[2] ?? 20261002);
let x = seed;
const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);

const byId = new Map<string, Program>();
const files = ["sido/41000.json", ...fs.readdirSync(path.join(B, "sigungu")).filter((f) => f.startsWith("41")).map((f) => `sigungu/${f}`)];
for (const f of files) for (const p of (JSON.parse(fs.readFileSync(path.join(B, f), "utf8")) as Bundle).programs) {
  // 시군구 여러 곳에 배치된 같은 사업은 한 번만
  const k = p.sources.map((s) => s.source + s.id).join("|");
  if (![...byId.values()].some((q) => q.sources.map((s) => s.source + s.id).join("|") === k)) byId.set(p.id, p);
}
// 목록 번들은 가벼운 필드만 있으므로 상세 샤드에서 전체 필드를 읽는다
const shardCache = new Map<string, Record<string, Program>>();
const full = (p: Program): Program => {
  const b = detailBucket(p.id);
  if (!shardCache.has(b)) shardCache.set(b, JSON.parse(fs.readFileSync(path.join(B, "details", `${b}.json`), "utf8")));
  return shardCache.get(b)![p.id] ?? p;
};
const all = [...byId.values()].map(full);
const sample: Program[] = [];
while (sample.length < 30 && sample.length < all.length) {
  const p = all[Math.floor(rand() * all.length)];
  if (!sample.includes(p)) sample.push(p);
}

const PHONE = /(0\d{1,2}[-)\s.]?\d{3,4}[-\s.]?\d{4}|1[5-9]\d{2}[-\s]?\d{4}|\b1[0-9]{2}\b)/;
async function status(url: string): Promise<string> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch(url, { method, redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (bokjiddak spotcheck)" } });
      clearTimeout(t);
      if (r.status < 400 || method === "GET") return String(r.status);
    } catch (e) {
      if (method === "GET") return `ERR ${(e as Error).name}`;
    }
  }
  return "?";
}

(async () => {
  const rows: string[] = [];
  const issues: Record<string, string[]> = {};
  const note = (k: string, v: string) => (issues[k] ??= []).push(v);
  for (const p of sample) {
    const st = p.url ? await status(p.url) : "링크 없음";
    const st2 = p.applyUrl && p.applyUrl !== p.url ? await status(p.applyUrl) : "";
    const phone = p.contact ? PHONE.test(p.contact) : false;
    const label = p.region?.label ?? "전국";
    const flags: string[] = [];
    if (!p.url) flags.push("원문 링크 없음");
    else if (!/^2|^3/.test(st)) flags.push(`링크 ${st}`);
    if (st2 && !/^2|^3/.test(st2)) flags.push(`신청 링크 ${st2}`);
    if (!p.contact) flags.push("연락처 없음");
    else if (!phone) flags.push("연락처에 전화번호 없음");
    if (!p.applyMethod) flags.push("신청방법 없음");
    if (!p.summary) flags.push("요약 없음");
    if (/^\s*[\[(（]/.test(p.name)) flags.push("이름 앞 괄호/대괄호");
    const sggName = label.split(" ")[1];
    const ownerish = `${p.owner ?? ""} ${p.provider ?? ""}`;
    const m = ownerish.match(/([가-힣]{1,4}(시|군))/g)?.filter((t) => t !== "경기도" && t.endsWith("시") || t.endsWith("군")) ?? [];
    if (sggName && m.length && !m.some((t) => sggName.startsWith(t.replace(/(시|군)$/, "")) || t.includes(sggName.replace(/(시|군|구)$/, "")))) flags.push(`지역 불일치? (${label} vs ${m.join(",")})`);
    if (p.summary && p.summary === p.name) flags.push("요약=이름");
    for (const f of flags) note(f.replace(/ \(.*$/, "").replace(/링크 \d+/, "링크 오류"), `${p.name} (${label})`);
    rows.push(`| ${p.name.replace(/\|/g, "/")} | ${label} | ${p.orgType} | ${p.sources.map((s) => s.source).join("+")} | ${p.rule.review} | ${st}${st2 ? ` / 신청 ${st2}` : ""} | ${p.contact ? (phone ? "✓" : "번호 없음") : "—"} | ${p.applyMethod ? "✓" : "—"} | ${flags.join("; ") || "OK"} |`);
  }
  const md = [
    `# 경기도 무작위 30개 종단 점검 (seed ${seed}, ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST)`,
    "",
    `대상 풀: 경기도·시군구 번들 고유 사업 ${all.length}개`,
    "",
    "| 사업 | 지역 | 기관 | 원천 | 규칙 | 링크 | 연락처 | 신청방법 | 점검 |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## 유형별 문제",
    ...Object.entries(issues).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `- ${k}: ${v.length}건 — ${v.slice(0, 6).join(", ")}`),
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "pipeline/out/spotcheck-gyeonggi.md"), md);
  console.log(md);
})();
