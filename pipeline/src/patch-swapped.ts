/**
 * (QA 8차) 이미 만든 번들에서 '지원대상'·'지원내용' 칸이 뒤바뀐 사업을 바로잡는다 (원천 API를 다시 받지 않고).
 * 다음 전체 재생성(npm run pipeline)부터는 sources/gov24.ts 의 fixSwapped 가 같은 결과를 낸다 — 이 스크립트는 그때까지의 한 번용.
 * 원문 글자는 고치지 않고 두 칸을 맞바꾸기만 한다. 지원 금액·기한은 바뀐 지원내용으로 같은 규칙(money.ts·due.ts)으로 다시 뽑는다.
 *   npx tsx pipeline/src/patch-swapped.ts
 */
import fs from "node:fs";
import path from "node:path";
import { isSwapped } from "./normalize/swap";
import { extractMoney } from "./normalize/money";
import { extractDue } from "./normalize/due";
import { normalizeText } from "../../src/lib/data/text";
import type { Program } from "../../src/lib/data/types";

const OUT = path.join(process.cwd(), "public/bundles/v1");
const cut = (t: string | undefined, n: number) => (t && t.length > n ? t.slice(0, n - 1) + "…" : t);
const bundleOf = (id: string) => (id.startsWith("n.") ? "national.json" : /^([sg])(\d{5})\./.exec(id) ? `${id[0] === "s" ? "sido" : "sigungu"}/${id.slice(1, 6)}.json` : null);

const fixed: Program[] = [];
for (const f of fs.readdirSync(path.join(OUT, "details"))) {
  const file = path.join(OUT, "details", f);
  const shard = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Program>;
  let changed = false;
  for (const p of Object.values(shard)) {
    if (!isSwapped(p.target, p.benefit)) continue;
    const oldTarget = p.target;
    [p.target, p.benefit] = [p.benefit, p.target];
    if (p.rule.evidence && oldTarget && p.rule.evidence.startsWith(oldTarget.slice(0, 30))) p.rule.evidence = cut(p.target, 400);
    const money = extractMoney({ name: p.name, benefit: p.benefit ? normalizeText(p.benefit) : undefined, sector: p.sector });
    const due = extractDue({ deadline: p.deadline ? normalizeText(p.deadline) : undefined, benefit: p.benefit ? normalizeText(p.benefit) : undefined, applyMethod: p.applyMethod ? normalizeText(p.applyMethod) : undefined });
    if (money) p.money = money;
    else delete p.money;
    if (due) p.due = due;
    else delete p.due;
    fixed.push(p);
    changed = true;
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(shard));
}
for (const p of fixed) {
  const rel = bundleOf(p.id);
  if (!rel) continue;
  const file = path.join(OUT, rel);
  const b = JSON.parse(fs.readFileSync(file, "utf8")) as { programs: Program[] };
  const s = b.programs.find((x) => x.id === p.id);
  if (!s) continue;
  s.target = cut(p.target, 400);
  if (p.money) s.money = p.money;
  else delete s.money;
  if (p.due) s.due = p.due;
  else delete s.due;
  fs.writeFileSync(file, JSON.stringify(b));
}
console.log(`지원대상·지원내용 맞바꿈 ${fixed.length}건: ${fixed.map((p) => `${p.id} ${p.name}`).join(", ")}`);
