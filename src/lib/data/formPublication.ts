import type { Program } from "./types";
import type { ApplicationForm, FormLink, FormStatus } from "./forms";
import sourceExclusions from "./sourceExclusions.json";
import verifiedLawHistories from "./verifiedLawHistories.json";

export function excludedSourceReason(value: unknown): string | undefined {
  if (typeof value!=="string") return undefined;
  try { return sourceExclusions.hosts.find(row=>row.host===new URL(value).hostname.toLowerCase())?.reason; }
  catch { return undefined; }
}

export function externalFormUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !excludedSourceReason(value) ? url.href : null;
  } catch { return null; }
}

export function formAssetUrl(value: unknown): string | null {
  return typeof value === "string" && /^\/forms\/files\/(ordin|law|rule)-\d+-[a-f0-9]{12}\.(hwp|hwpx|pdf|txt|gif)$/.test(value) ? value : null;
}

/** Official external annex links must never carry an API credential. */
export function officialFormUrl(value: unknown): string | null {
  const safe = externalFormUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.protocol !== "https:" || !["www.law.go.kr", "law.go.kr"].includes(url.hostname)) return null;
  if ([...url.searchParams.keys()].some(key => /^oc$|key|token|secret|password|auth|login|email|phone|resident/i.test(key))) return null;
  return safe;
}

const normalizedLaw = (text: string) => text.normalize("NFKC").replace(/[「」『』\s·ㆍᆞ・･‧․]/g, "").replace(/\(제[^)]*\)/g, "").replace(/제\d+조.*$/, "");
function referencedFormLaw(program: Program, form: Pick<ApplicationForm, "lawTitle"> & Partial<Pick<ApplicationForm,"regionCode"|"regionLabel">>): boolean {
  // Official benefit records also cite "조례, 시행규칙" or "조례 및 시행규칙".
  // These are the same named law family, not a different jurisdiction's form.
  const normalize = (text: string) => {
    let title=normalizedLaw(text).replace(/(?:[,、]|및)?(?:시행규칙|시행령)$/, "");
    const aliases:Record<string,[string,string]>={"51000":["강원도","강원특별자치도"],"52000":["전라북도","전북특별자치도"],"50000":["제주도","제주특별자치도"]};
    const pair=form.regionCode===program.region?.sido ? aliases[form.regionCode??""] : undefined;
    if(pair && title.startsWith(pair[0])) title=pair[1]+title.slice(pair[0].length);
    return title;
  };
  // Split a second explicitly qualified local law before removing article tails.
  // The word "및" inside a single title (e.g. 노인 및 장애인) stays intact.
  return (program.laws || []).some(law => law.split(/\|\||\/|\s+및\s+(?=[가-힣]+(?:특별자치도|특별자치시|특별시|광역시|도|시|군|구)\s)/).some(part => normalize(part) === normalize(form.lawTitle)
    || (!!form.regionLabel && form.regionCode===program.region?.sido && normalize(form.regionLabel+part)===normalize(form.lawTitle))));
}

function reviewedRenamedLaw(program: Program, form: ApplicationForm, link: FormLink): boolean {
  const ref=link.renamedLawReference;
  const history=verifiedLawHistories.histories[form.lawId as keyof typeof verifiedLawHistories.histories];
  if (!ref || !history || link.municipalApplicationReference
      || (["stableLawId","priorLawId","transitionLawId","priorRuleTitle","currentRuleTitle","provinceCode"] as const).some(key=>ref[key]!==history[key])
      || link.scopeBasis!=="provincial-law-reference" || program.scope!=="sigungu"
      || form.sourceKind!=="ordin" || ref.kind!=="exact-stable-ordinance-history"
      || ref.programId!==program.id || ref.formLawId!==form.lawId
      || ref.provinceCode!==program.region?.sido || ref.provinceCode!==form.regionCode
      || ref.municipalityCode!==program.region?.sigungu || !/^\d{5}$/.test(ref.municipalityCode)
      || ref.municipalityCode.slice(0,2)+"000"!==ref.provinceCode
      || !/^\d+$/.test(ref.stableLawId) || ref.checkedAt!==link.checkedAt
      || !/^\d{4}-\d{2}-\d{2}$/.test(ref.checkedAt)
      || normalizedLaw(ref.currentRuleTitle)!==normalizedLaw(form.lawTitle)
      || [ref.purposeArticleLink,ref.transitionBasis,ref.scopeRestriction].some(value=>typeof value!=="string" || value.trim().length<30)) return false;
  const ids=[ref.priorLawId,ref.transitionLawId,ref.formLawId];
  const validUrl=(value:unknown,id:string)=>{
    const safe=officialFormUrl(value);
    if(!safe) return false;
    const url=new URL(safe);
    return ["/ordinInfoP.do","/LSW/ordinInfoP.do"].includes(url.pathname)
      && url.searchParams.getAll("ordinSeq").length===1 && url.searchParams.get("ordinSeq")===id;
  };
  return ids.every(id=>/^\d+$/.test(id)) && new Set(ids).size===3
    && [ref.historyEvidenceUrl,ref.transitionEvidenceUrl,ref.currentEvidenceUrl].every((url,i)=>validUrl(url,ids[i]))
    && validUrl(link.evidenceUrl,form.lawId)
    && referencedFormLaw(program,{...form,lawTitle:ref.citedLawTitle})
    && referencedFormLaw({...program,laws:[ref.citedLawTitle]},{...form,lawTitle:ref.priorRuleTitle});
}

function reviewedApplicationReference(program: Program, form: ApplicationForm, link: FormLink): boolean {
  const ref=link.scopeReference;
  if (link.scopeBasis!=="official-application-reference" || form.regionCode!=="national" || !ref
      || normalizedLaw(ref.referencedLawTitle)!==normalizedLaw(form.lawTitle)
      || ref.annexNumber!==form.annexNumber || ref.basis.trim().length<30) return false;
  if (ref.kind==="cited-local-law") {
    const safe=officialFormUrl(link.evidenceUrl);
    return !!safe && !!ref.sourceLawId && new URL(safe).searchParams.get("ordinSeq")===ref.sourceLawId
      && /^제\d+조(?:의\d+)?(?:제\d+항)?$/.test(ref.article??"") && !!ref.sourceLawTitle
      && referencedFormLaw(program,{lawTitle:ref.sourceLawTitle});
  }
  if (ref.kind!=="program-documents") return false;
  const safe=externalFormUrl(link.evidenceUrl);
  if (!safe || !/^(?:gov\.kr|.+\.(?:go|gov)\.kr)$/.test(new URL(safe).hostname)) return false;
  return [program.url,...(program.sources??[]).map(source=>source.url)].some(url=>externalFormUrl(url)===safe);
}

function reviewedMunicipalRoute(program: Program, form: ApplicationForm, link: FormLink): boolean {
  const ref=link.municipalApplicationReference;
  if (link.scopeBasis!=="municipal-application-reference" || !ref || program.scope!=="sido"
      || form.sourceKind!=="ordin" || ref.sido!==program.region?.sido || ref.sigungu!==form.regionCode
      || !/^\d{5}$/.test(ref.sigungu) || ref.sigungu.slice(0,2)+"000"!==ref.sido || ref.sigungu===ref.sido
      || ref.municipality.trim().length<2 || !form.regionLabel.includes(ref.municipality)
      || link.use!=="conditional" || !link.condition?.includes(ref.municipality)
      || ref.httpStatus!==200 || ref.programSpecific!==true || ref.checkedAt!==link.checkedAt
      || ref.reference.length<30 || !ref.reference.includes(ref.municipality)
      || ref.formEvidence.length<30 || !ref.formEvidence.includes(ref.municipality)
      || !ref.scopeRestriction.includes(ref.municipality) || !/전용|한정/.test(ref.scopeRestriction)
      || normalizedLaw(ref.municipalArticle)!==normalizedLaw(form.lawTitle)
      || !/제\d+조/.test(ref.municipalArticle)) return false;
  const exact=externalFormUrl(link.programEvidenceUrl), supporting=externalFormUrl(ref.programEvidenceUrl);
  const government=(url:string|null)=>!!url && /^(?:gov\.kr|.+\.(?:go|gov)\.kr)$/.test(new URL(url).hostname);
  return government(exact) && government(supporting)
    && [program.url,...(program.sources??[]).map(source=>source.url)].some(url=>externalFormUrl(url)===exact);
}

export function sameFormJurisdiction(program: Pick<Program, "scope" | "region">, form: ApplicationForm): boolean {
  if (form.regionCode === "national") return program.scope === "national";
  if (program.scope === "sigungu") return form.regionCode === program.region?.sigungu;
  if (program.scope === "sido") return form.regionCode === program.region?.sido;
  return false;
}

/** Fail a publication build instead of silently accepting an invalid reviewed link. */
export function validateFormLink(program: Program, form: ApplicationForm | undefined, link: FormLink): void {
  if (!form || form.id !== link.formId) throw new Error("Unknown form in reviewed association");
  const municipalRoute=reviewedMunicipalRoute(program,form,link);
  const renamedLaw=reviewedRenamedLaw(program,form,link);
  if (link.renamedLawReference && !renamedLaw) throw new Error("Renamed law reference lacks exact program and official history evidence");
  if ((link.municipalApplicationReference || link.scopeBasis==="municipal-application-reference") && !municipalRoute) throw new Error("Municipal application route lacks exact conditional source evidence");
  if (!sameFormJurisdiction(program, form)) {
    const sameProvince = link.scopeBasis === "provincial-law-reference" && program.scope === "sigungu" && program.region?.sido === form.regionCode;
    const nationalReference = link.scopeBasis === "national-law-reference" && form.regionCode === "national";
    if (!municipalRoute && !renamedLaw && !reviewedApplicationReference(program,form,link) && ((!sameProvince && !nationalReference) || !referencedFormLaw(program, form))) throw new Error(`Form jurisdiction does not match program: ${program.id} / ${form.id}`);
  }
  if (!["application", "consent", "delegation", "supporting"].includes(form.role)) throw new Error("Non-applicant form cannot be published as an application");
  if (!externalFormUrl(link.evidenceUrl) || link.evidenceNote.trim().length < 10 || !/^\d{4}-\d{2}-\d{2}$/.test(link.checkedAt)) throw new Error("Reviewed association needs dated source evidence");
  if (!["main", "additional", "conditional"].includes(link.use)) throw new Error("Unknown document use");
  if (link.displayTitle!==undefined && (typeof link.displayTitle!=="string" || link.displayTitle.trim().length<2 || link.displayTitle.length>200)) throw new Error("Invalid reviewed document title");
  if ((form.role === "delegation" || link.use === "conditional") && (!link.condition?.trim() || link.use !== "conditional")) throw new Error("Conditional form needs an explicit condition");
}

export function applicationRoute(program: Pick<Program, "applyUrl" | "applyType">): string | undefined {
  if (program.applyType === "auto" || program.applyType === "institution") return undefined;
  return externalFormUrl(program.applyUrl) || undefined;
}

export function formStatus(links: FormLink[], candidates: string[], onlineUrl?: string): FormStatus {
  if (links.length) return "available";
  if (onlineUrl) return "online";
  return candidates.length ? "review" : "missing";
}
