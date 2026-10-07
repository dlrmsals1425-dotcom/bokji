"use client";
/**
 * v2 시험판 '내 상황' 입력 (한 화면, 질문 12개 + 문장 칸). 모든 질문에 '모름'이 있다.
 * 답은 이 기기에만 저장하고, 결과는 /results?v=2 에서 본다.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RadioGroup } from "@/components/Choice";
import { loadRegions } from "@/lib/client/bundles";
import { parseSituation, understoodLine } from "@/lib/client/parse";
import { householdLabel, parseFindMode, type FindMode } from "@/lib/client/mode";
import { saveExtras, saveFiller, saveMode, saveProfile, useExtras, useMode, useProfile } from "@/lib/client/storage";
import { SUPPORT_LEVELS, extrasFromProfile, incomeExplain, profileForStorage, type Extras } from "@/lib/client/v2";
import type { RegionIndex } from "@/lib/data/types";
import { AGE_BANDS, AGE_LABEL, EMPTY_PROFILE, ageRange, type Benefit, type Profile } from "@/lib/engine/profile";

export function SituationForm() {
  const stored = useProfile();
  const storedMode = useMode();
  const storedX = useExtras();
  const params = useSearchParams();
  const urlMode = parseFindMode(params.get("for"));
  const fresh = params.get("new") === "1";
  if (stored === undefined || storedMode === undefined || storedX === undefined) return <div className="narrow page muted">불러오는 중…</div>;
  const p0 = fresh || !stored ? EMPTY_PROFILE : stored;
  const x0 = fresh || !stored ? { benefits: {}, traits: {}, incomeManwon: null, facts: {} } : Object.keys(storedX.benefits).length || storedX.incomeManwon !== null ? storedX : extrasFromProfile(stored);
  return <Form initial={p0} initialX={x0} initialMode={urlMode ?? storedMode} />;
}

type Tri3 = "yes" | "no" | "unknown";
const triOf = (v: boolean | undefined): Tri3 => (v === undefined ? "unknown" : v ? "yes" : "no");
const boolOf = (v: Tri3): boolean | undefined => (v === "unknown" ? undefined : v === "yes");
const YN = [
  { value: "yes" as const, label: "예" },
  { value: "no" as const, label: "아니요" },
];

const RECIPIENTS: Benefit[] = ["livelihood", "medical", "housing", "education", "near_poverty"];

function supportValue(x: Extras): string {
  const b = x.benefits;
  if (RECIPIENTS.every((k) => b[k] === false)) return "none";
  for (const l of SUPPORT_LEVELS) if (b[l.on[0]] === true) return l.key;
  return "unknown";
}

function Form({ initial, initialX, initialMode }: { initial: Profile; initialX: Extras; initialMode: FindMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<FindMode>(initialMode);
  const [p, setP] = useState<Profile>(initial);
  const [x, setX] = useState<Extras>(initialX);
  const [text, setText] = useState("");
  const [understood, setUnderstood] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incomeText, setIncomeText] = useState(initialX.incomeManwon !== null ? String(initialX.incomeManwon) : "");

  useEffect(() => {
    loadRegions().then(setRegions);
  }, []);

  const parent = mode === "parent";
  const who = parent ? "부모님" : "";
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const setB = (patch: Partial<Record<Benefit, boolean | undefined>>) =>
    setX((prev) => {
      const b = { ...prev.benefits };
      for (const [k, v] of Object.entries(patch) as [Benefit, boolean | undefined][]) {
        if (v === undefined) delete b[k];
        else b[k] = v;
      }
      return { ...prev, benefits: b };
    });

  const fillFromText = () => {
    const r = parseSituation(text, regions);
    const q = r.profile;
    setP((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(q) as (keyof Profile)[]) {
        const v = q[k];
        if (v === null || v === "unknown") continue;
        if (Array.isArray(v) && v.length === 0 && k !== "traits") continue;
        (next as Record<string, unknown>)[k] = v;
      }
      return next;
    });
    if (q.benefits?.length) setB(Object.fromEntries(q.benefits.map((b) => [b, true])));
    if (r.mode) setMode(r.mode);
    setUnderstood(understoodLine(r) || "알아들은 내용이 없어요. 아래 질문에 직접 답해 주세요.");
  };

  const sido = regions?.sidos.find((s) => s.code === p.sido);
  const size = p.householdSize === "unknown" ? null : p.householdSize;
  const income = x.incomeManwon;
  const explain = income !== null && size ? incomeExplain(income, size) : null;
  const senior = p.age === "unknown" || ageRange(p.age)[1] >= 60;

  const submit = () => {
    if (!p.sigungu) {
      setError(parent ? "부모님이 사시는 시·군·구를 골라 주세요." : "사는 시·군·구를 골라 주세요.");
      document.getElementById("sit-region")?.scrollIntoView({ block: "center" });
      return;
    }
    const sit = { profile: p, x };
    saveMode(mode);
    if (parent) saveFiller("child");
    saveProfile(profileForStorage(sit), undefined, mode);
    saveExtras(x);
    router.push(parent ? "/results?for=parent&v=2" : "/results?v=2");
  };

  return (
    <>
      <div className="form-head">
        <div className="narrow">
          <ol className="crumbs" aria-label="현재 위치">
            <li>
              <Link href="/">
                <Icon name="home" size={14} /> 홈
              </Link>
            </li>
            <li>
              <span aria-current="page">내 상황 알려주기 (시험판)</span>
            </li>
          </ol>
          <h1 className="h1" style={{ marginBottom: "0.25rem" }}>
            {parent ? "부모님 상황을 먼저 알려주세요" : "내 상황을 먼저 알려주세요"}
          </h1>
          <p className="small muted">
            답에 맞는 혜택만 골라 드려요. 모르는 질문은 &lsquo;모름&rsquo;으로 두면 결과 화면에서 꼭 필요한 것만 다시 물어봐요. 답은 이 기기에만 저장돼요.
          </p>
          <div className="mode-switch" role="group" aria-label="찾기 대상">
            <button type="button" className={!parent ? "on" : ""} aria-pressed={!parent} onClick={() => setMode("self")}>
              내 복지
            </button>
            <button type="button" className={parent ? "on" : ""} aria-pressed={parent} onClick={() => setMode("parent")}>
              부모님 복지
            </button>
          </div>
        </div>
      </div>
      <div className="form-body">
        <div className="narrow">
          <div className="form-panel v2-form" data-testid="v2-situation">
            <section aria-labelledby="sit-free-h" className="v2-block">
              <h2 className="h3" id="sit-free-h">
                {parent ? "부모님 상황을 적어 주세요" : "내 상황을 적어 주세요"} <span className="small muted">(선택)</span>
              </h2>
              <label htmlFor="sit-text" className="hint">
                예: 수원시에 사시는 59년생 부모님 두 분, 아버지가 거동이 불편하세요
              </label>
              <textarea id="sit-text" className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} data-testid="v2-text" />
              <div className="btn-row" style={{ marginTop: "0.5rem" }}>
                <button type="button" className="btn btn-tonal btn-sm" onClick={fillFromText} disabled={!text.trim()} data-testid="v2-fill">
                  이 문장으로 아래 칸 채우기
                </button>
                <span className="small muted">문장은 이 기기에서만 읽어요.</span>
              </div>
              {understood && (
                <p className="notice" role="status" style={{ marginTop: "0.75rem" }} data-testid="v2-understood">
                  <Icon name="check" size={18} />
                  <span>
                    <strong>이렇게 이해했어요:</strong> {understood}
                  </span>
                </p>
              )}
            </section>

            <section aria-labelledby="sit-basic-h" className="v2-block" id="sit-region">
              <h2 className="h3" id="sit-basic-h">
                1. 기본
              </h2>
              {error && (
                <p role="alert" className="error">
                  <Icon name="alert" size={18} /> {error}
                </p>
              )}
              <div className="select-row field">
                <div>
                  <label htmlFor="sido" className="label">
                    {who ? `${who}이 사는 ` : "사는 "}시·도
                  </label>
                  <select id="sido" className="select" value={p.sido ?? ""} onChange={(e) => setP((prev) => ({ ...prev, sido: e.target.value || null, sigungu: null }))}>
                    <option value="">선택하세요</option>
                    {regions?.sidos.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sigungu" className="label">
                    시·군·구
                  </label>
                  <select id="sigungu" className="select" value={p.sigungu ?? ""} disabled={!sido} onChange={(e) => set("sigungu", e.target.value || null)}>
                    <option value="">{sido ? "선택하세요" : "시·도를 먼저 고르세요"}</option>
                    {sido?.sigungus.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="select-row field">
                <div>
                  <label htmlFor="age" className="label">
                    {parent ? "부모님 나이 (만)" : "나이 (만)"}
                  </label>
                  <select id="age" className="select" value={p.age} onChange={(e) => set("age", e.target.value as Profile["age"])}>
                    <option value="unknown">모름</option>
                    {AGE_BANDS.map((a) => (
                      <option key={a} value={a}>
                        {AGE_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="hh" className="label">
                    함께 사는 가족 (본인 포함)
                  </label>
                  <select
                    id="hh"
                    className="select"
                    value={String(p.householdSize)}
                    onChange={(e) => set("householdSize", e.target.value === "unknown" ? "unknown" : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6))}
                  >
                    <option value="unknown">모름</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {householdLabel(mode, n)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section aria-labelledby="sit-money-h" className="v2-block">
              <h2 className="h3" id="sit-money-h">
                2. 지금 받는 지원과 소득
              </h2>
              <RadioGroup
                name="support"
                legend={parent ? "부모님이 주민센터에서 받고 있는 지원이 있나요?" : "주민센터에서 받고 있는 지원이 있나요?"}
                hint="가장 높은 단계 하나만 고르세요 (생계급여를 받으면 의료·주거급여도 함께 받는 경우가 많아요)."
                options={[
                  { value: "none", label: "없어요 (받지 않아요)" },
                  ...SUPPORT_LEVELS.map((l) => ({ value: l.key, label: `${l.label} (${l.plain})` })),
                ]}
                value={supportValue(x)}
                unknownLabel="잘 모르겠어요"
                onChange={(v) => {
                  if (v === "unknown") return setB(Object.fromEntries(RECIPIENTS.map((k) => [k, undefined])));
                  const lv = SUPPORT_LEVELS.find((l) => l.key === v);
                  setB(Object.fromEntries(RECIPIENTS.map((k) => [k, lv ? lv.on.includes(k) : false])));
                }}
              />
              {senior && (
                <RadioGroup
                  name="basic-pension"
                  legend={parent ? "부모님이 기초연금을 받고 계신가요?" : "기초연금을 받고 계신가요?"}
                  hint="만 65세 이상 중 소득·재산이 적은 70%가 받는 연금이에요 (국민연금과 달라요)."
                  options={YN}
                  value={triOf(x.benefits.basic_pension)}
                  unknownLabel="잘 모르겠어요"
                  onChange={(v) => setB({ basic_pension: boolOf(v) })}
                />
              )}
              <fieldset className="field">
                <legend>{parent ? "부모님 가구의 한 달 소득은 얼마쯤인가요?" : "가구 전체의 한 달 소득은 얼마쯤인가요?"}</legend>
                <p className="hint" id="inc-h">
                  일해서 버는 돈·연금·임대료 등을 모두 더해 대략 적어 주세요. 함께 사는 가족 수 기준으로 계산해요.
                </p>
                <div className="v2-income">
                  <label htmlFor="income" className="sr-only">
                    한 달 소득 (만원)
                  </label>
                  <input
                    id="income"
                    className="input"
                    inputMode="numeric"
                    aria-describedby="inc-h inc-band"
                    value={incomeText}
                    placeholder="예: 300"
                    onChange={(e) => {
                      const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
                      setIncomeText(t);
                      setX((prev) => ({ ...prev, incomeManwon: t ? Number(t) : null }));
                    }}
                    data-testid="v2-income"
                  />
                  <span>만원 / 월</span>
                  <label className="opt unknown v2-inline">
                    <input
                      type="checkbox"
                      checked={income === null}
                      onChange={() => {
                        setIncomeText("");
                        setX((prev) => ({ ...prev, incomeManwon: null }));
                      }}
                    />
                    <span>모름</span>
                  </label>
                </div>
                <p className="small" id="inc-band" aria-live="polite" data-testid="v2-income-band">
                  {explain ? explain.line : income !== null && !size ? "함께 사는 가족 수를 고르면 기준을 계산해 드려요." : ""}
                </p>
                <p className="small muted">재산(집·예금)도 소득으로 환산해 함께 보는 혜택이 많아요. 정확한 계산(소득인정액)은 신청할 때 주민센터에서 해 줘요.</p>
              </fieldset>
            </section>

            <section aria-labelledby="sit-health-h" className="v2-block">
              <h2 className="h3" id="sit-health-h">
                3. 건강·돌봄
              </h2>
              <RadioGroup
                name="disability"
                legend={parent ? "부모님 중 장애인으로 등록된 분이 있나요?" : "장애인으로 등록되어 있나요?"}
                options={[
                  { value: "none", label: "아니요" },
                  { value: "severe", label: "예 — 심한 장애" },
                  { value: "mild", label: "예 — 심하지 않은 장애" },
                ]}
                value={p.disability === "none" ? "none" : p.disability === "unknown" ? "unknown" : p.disabilitySeverity === "unknown" ? "severe" : p.disabilitySeverity}
                unknownLabel="잘 모르겠어요"
                onChange={(v) =>
                  setP((prev) => ({
                    ...prev,
                    disability: v === "unknown" ? "unknown" : v === "none" ? "none" : "self",
                    disabilitySeverity: v === "severe" || v === "mild" ? v : "unknown",
                  }))
                }
              />
              <RadioGroup
                name="care"
                legend={parent ? "식사·거동·외출에 다른 사람의 도움이 필요하신가요?" : "식사·거동·외출에 다른 사람의 도움이 필요한가요?"}
                options={YN}
                value={p.care === null ? "unknown" : p.care.includes("daily") ? "yes" : "no"}
                unknownLabel="잘 모르겠어요"
                onChange={(v) => set("care", v === "unknown" ? null : v === "yes" ? ["daily"] : [])}
              />
              {senior && (
                <RadioGroup
                  name="ltc"
                  legend="건강보험공단에서 장기요양등급(1~5등급·인지지원등급)을 받으셨나요?"
                  options={YN}
                  value={triOf(x.facts.ltcGrade)}
                  unknownLabel="잘 모르겠어요"
                  onChange={(v) => setX((prev) => ({ ...prev, facts: { ...prev.facts, ltcGrade: boolOf(v) } }))}
                />
              )}
            </section>

            <section aria-labelledby="sit-life-h" className="v2-block">
              <h2 className="h3" id="sit-life-h">
                4. 생활
              </h2>
              <RadioGroup
                name="housing"
                legend={parent ? "부모님 댁은 어떤 형태인가요?" : "사는 집은 어떤 형태인가요?"}
                options={[
                  { value: "own", label: "자가" },
                  { value: "jeonse", label: "전세" },
                  { value: "monthly", label: "월세" },
                  { value: "public_rental", label: "공공임대" },
                ]}
                value={p.housing === "other" ? "unknown" : p.housing}
                unknownLabel="잘 모르겠어요"
                onChange={(v) => set("housing", v)}
              />
              <RadioGroup
                name="activity"
                legend={parent ? "부모님이 지금 일을 하고 계신가요?" : "지금 일을 하고 계신가요?"}
                options={[
                  { value: "employed", label: "예, 일해요" },
                  { value: "job_seeking", label: "일자리를 찾고 있어요" },
                  { value: "none", label: "아니요" },
                ]}
                value={p.activity === "self_employed" ? "employed" : p.activity === "student" ? "none" : p.activity}
                unknownLabel="잘 모르겠어요"
                onChange={(v) => set("activity", v)}
              />
              <RadioGroup
                name="veteran"
                legend={parent ? "부모님이 국가유공자·참전유공자 등 보훈 대상이신가요?" : "국가유공자 등 보훈 대상인가요?"}
                options={YN}
                value={triOf(x.traits.veteran)}
                unknownLabel="잘 모르겠어요"
                onChange={(v) => setX((prev) => ({ ...prev, traits: { ...prev.traits, veteran: boolOf(v) } }))}
              />
            </section>

            <div className="btn-row" style={{ marginTop: "1.5rem" }}>
              <button type="button" className="btn btn-primary btn-lg" onClick={submit} data-testid="v2-submit">
                {parent ? "부모님께 맞는 혜택 보기" : "나에게 맞는 혜택 보기"} <Icon name="arrowRight" size={18} />
              </button>
              <span className="small muted">
                모름으로 둔 질문은 결과 화면 맨 위에서 꼭 필요한 것만 다시 물어봐요.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
