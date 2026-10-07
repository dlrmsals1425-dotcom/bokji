/** 커밋된 번들(public/bundles/v1)의 문자열을 normalizeText로 정리하고 전후 개수를 보고한다.
 *  npx tsx scripts/normalize-bundles.ts [--check]   (--check: 쓰지 않고 개수만)
 *  파이프라인(npm run pipeline)도 같은 정리를 번들 쓰기 직전에 하므로, 다시 빌드해도 결과가 같다.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeDeep } from "../src/lib/data/text";

const DIR = path.resolve(__dirname, "../public/bundles/v1");
const check = process.argv.includes("--check");
const ENT = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,8});/gi;
const ODD = /[\uE000-\uF8FF\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200D\u2060\uFEFF\uFFFD\r]/g;
const QMARK = /[가-힣]\?[가-힣]/g;

type Stat = { entSvc: Set<string>; ent: number; oddSvc: Set<string>; odd: Map<string, number>; q: number };
const mk = (): Stat => ({ entSvc: new Set(), ent: 0, oddSvc: new Set(), odd: new Map(), q: 0 });
const before = mk();
const after = mk();

function scan(v: unknown, id: string, st: Stat) {
  if (typeof v === "string") {
    const e = v.match(ENT);
    if (e) { st.ent += e.length; st.entSvc.add(id); }
    const o = v.match(ODD);
    if (o) { st.oddSvc.add(id); for (const c of o) { const k = "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"); st.odd.set(k, (st.odd.get(k) ?? 0) + 1); } }
    st.q += v.match(QMARK)?.length ?? 0;
  } else if (Array.isArray(v)) v.forEach((x) => scan(x, id, st));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const own = typeof o.id === "string" && typeof o.name === "string" ? (o.id as string) : id;
    for (const x of Object.values(o)) scan(x, own, st);
  }
}

const files: string[] = [];
const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") && files.push(path.join(d, e.name))));
walk(DIR);
let changed = 0;
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const data = JSON.parse(raw);
  scan(data, path.relative(DIR, f), before);
  const out = normalizeDeep(data);
  scan(out, path.relative(DIR, f), after);
  const s = JSON.stringify(out);
  if (s !== raw) { changed++; if (!check) fs.writeFileSync(f, s); }
}
const fmt = (st: Stat) => ({
  "엔티티가 있는 서비스": st.entSvc.size, "엔티티 수": st.ent, "이상한 글자가 있는 서비스": st.oddSvc.size,
  "이상한 글자": Object.fromEntries([...st.odd].sort((a, b) => b[1] - a[1])), "한글?한글": st.q,
});
console.log(JSON.stringify({ files: files.length, changedFiles: changed, write: !check, before: fmt(before), after: fmt(after) }, null, 1));
