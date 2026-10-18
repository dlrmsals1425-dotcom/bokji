import type { Program } from "./types";
import type { ApplicationForm, FormLink, FormStatus } from "./forms";
import sourceExclusions from "./sourceExclusions.json";
import verifiedLawHistories from "./verifiedLawHistories.json";
import verifiedAgencyForms from "./verifiedAgencyForms.json";

export type VerifiedAgencyForm = Omit<(typeof verifiedAgencyForms.forms)[keyof typeof verifiedAgencyForms.forms], "publishedAt" | "attachmentIdentifier"> & {
  publishedAt?: string; attachmentIdentifier: { queryParam?: string; value?: string; path?: string };
};
const AGENCY_ID = /^agency-\d{5}-[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const AGENCY_SECRET = /^oc$|api[-_]?key|service[-_]?key|token|secret|password|auth|session|login|email|phone|resident|jumin/i;
function safeAgencyPath(value: string): boolean {
  try {
    for (let i=0;i<8;i++) {
      const decoded=decodeURIComponent(value);
      if (decoded===value) return !/[\\\x00-\x1f]|(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded);
      value=decoded;
    }
  } catch { return false; }
  return false;
}
function safeAgencyParameter(name: string, value: string): boolean {
  try {
    for (let i=0;i<8;i++) {
      const decoded=decodeURIComponent(name);
      if (decoded===name) return !AGENCY_SECRET.test(name) && (!/^(menu)?key$/i.test(name) || /^\d+$/.test(value));
      name=decoded;
    }
  } catch { return false; }
  return false;
}
/** Used only behind the exact registry. Public fileKey/atchFileId are not credentials. */
export function safeAgencyUrl(value: unknown): string | null {
  if (typeof value !== "string" || /[^\x21-\x7e]|[\\#]/.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.href !== value || u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".")
        || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":") || /\.(local|localhost|internal|lan|test|invalid)$/.test(u.hostname)
        || !safeAgencyPath(u.pathname) || excludedSourceReason(value) || [...u.searchParams].some(([k,v]) => !safeAgencyParameter(k,v))) return null;
    return value;
  } catch { return null; }
}
const exactDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;

export function registeredAgencyForm(id: string): VerifiedAgencyForm | null {
  const e = (verifiedAgencyForms.forms as Record<string, VerifiedAgencyForm>)[id];
  if (!AGENCY_ID.test(id) || !e || e.id !== id || e.sourceKind !== "agency" || id.split("-")[1] !== e.regionCode) return null;
  if (![e.sourcePageUrl,e.sourceUrl,e.finalUrl,e.authorityEvidenceUrl,e.lawEvidenceUrl,...e.programs.map(p=>p.url)].every(safeAgencyUrl)) return null;
  const law = new URL(e.lawEvidenceUrl), identity = e.attachmentIdentifier;
  const queryIdentity=Object.keys(identity).length===2 && !!identity.queryParam && !AGENCY_SECRET.test(identity.queryParam)
    && identity.value===e.attachmentId && new URL(e.sourceUrl).searchParams.getAll(identity.queryParam).length===1
    && new URL(e.sourceUrl).searchParams.get(identity.queryParam)===e.attachmentId;
  const pathIdentity=Object.keys(identity).length===1 && !!identity.path && identity.path.startsWith("/")
    && identity.path===new URL(e.sourceUrl).pathname && safeAgencyPath(identity.path);
  if (!["www.law.go.kr","law.go.kr"].includes(law.hostname) || !["/ordinInfoP.do","/LSW/ordinInfoP.do"].includes(law.pathname)
      || law.searchParams.getAll("ordinSeq").length!==1 || law.searchParams.get("ordinSeq")!==e.lawId || !/^\d+$/.test(e.lawId)
      || !["government","public_institution","delegated"].includes(e.authorityKind)
      || !["government","public_institution"].includes(e.authorityEvidenceKind)
      || (e.authorityEvidenceKind==="government" && !/^(gov\.kr|.+\.(go|gov)\.kr)$/.test(new URL(e.authorityEvidenceUrl).hostname))
      || (e.authorityKind==="delegated" && new URL(e.authorityEvidenceUrl).hostname===new URL(e.sourceUrl).hostname)
      || e.authorityEvidenceNote.length<30 || ![e.checkedAt,e.lawEffectiveDate,e.lawCurrentCheckedAt].every(exactDay)
      || e.lawCurrentCheckedAt!==e.checkedAt || e.lawEffectiveDate>e.checkedAt
      || (e.publishedAt!==undefined && (!exactDay(e.publishedAt) || e.publishedAt>e.checkedAt))
      || !/^[a-f0-9]{64}$/.test(e.sha256) || !Number.isSafeInteger(e.bytes) || e.bytes<=0 || !["hwp","hwpx","pdf"].includes(e.format)
      || !e.attachmentId || (!queryIdentity && !pathIdentity)
      || !e.programs.length || new Set(e.programs.map(p=>p.id)).size!==e.programs.length
      || !["application","consent","delegation","supporting"].includes(e.role) || !["main","additional","conditional"].includes(e.use)
      || (e.role==="delegation" && e.use!=="conditional") || (e.use==="conditional" && !e.condition)
      || e.textScope!=="all_body_sections_or_pages" || !e.sectionsRead.length || new Set(e.sectionsRead).size!==e.sectionsRead.length
      || !e.applicant || !e.selectedParts.length || e.selectedParts.some(p=>!p.number || !p.title || !p.author || !["main","additional","conditional"].includes(p.use))) return null;
  return e;
}

/** Exact source/final endpoints only; registering a form never allows its whole host. */
export function agencyFormUrl(id: string, value: unknown): string | null {
  const e = registeredAgencyForm(id), safe = safeAgencyUrl(value);
  return e && safe && [e.sourceUrl,e.finalUrl].includes(safe) ? safe : null;
}

export function validateAgencyForm(form: ApplicationForm): VerifiedAgencyForm {
  const e=registeredAgencyForm(form.id), a=form.agency;
  if (!e || !a || form.sourceKind!=="agency" || form.title!==e.title || form.role!==e.role
      || form.sourceUrl!==e.sourceUrl || form.lawUrl!==e.lawEvidenceUrl || form.lawId!==e.lawId || form.lawTitle!==e.lawTitle
      || form.regionCode!==e.regionCode || form.regionLabel!==e.regionLabel || form.annexId!=="" || form.annexNumber!==""
      || form.fetchedAt!==e.checkedAt || form.dateKind!==(e.publishedAt?"published":"checked") || form.effectiveDate!==(e.publishedAt??e.checkedAt)
      || (["agencyName","sourcePageUrl","finalUrl","attachmentId","sha256","bytes","format","checkedAt","authorityEvidenceUrl"] as const).some(k=>a[k]!==e[k])
      || form.officialPdfUrl || (form.displayTitle!==undefined && form.displayTitle!==e.title)
      || (form.file && (form.file.sha256!==e.sha256 || form.file.bytes!==e.bytes || form.file.format!==e.format
          || form.file.hwp!==`/forms/files/${e.id}-${e.sha256.slice(0,12)}.${e.format}`
          || (form.file.pdf!==undefined && (e.format!=="pdf" || form.file.pdf!==form.file.hwp))))) throw new Error("Agency source identity mismatch");
  return e;
}

export function agencyProgramLinkMatches(id: string, form: ApplicationForm, link: FormLink): boolean {
  let e: VerifiedAgencyForm;
  try { e=validateAgencyForm(form); } catch { return false; }
  const p=e.programs.find(p=>p.id===id);
  return !!p && link.formId===e.id && link.programEvidenceUrl===p.url && link.evidenceUrl===e.sourcePageUrl
    && link.checkedAt===e.checkedAt && link.use===e.use && (link.condition??"")===(e.condition??"")
    && !link.scopeBasis && !link.renamedLawReference && !link.municipalApplicationReference
    && (link.displayTitle===undefined || link.displayTitle===e.title);
}

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
  if (typeof value!=="string") return null;
  if (/^\/forms\/files\/(ordin|law|rule)-\d+-[a-f0-9]{12}\.(hwp|hwpx|pdf|txt|gif)$/.test(value)) return value;
  const match=/^\/forms\/files\/(agency-\d{5}-[a-zA-Z0-9][a-zA-Z0-9_-]{0,79})-([a-f0-9]{12})\.(hwp|hwpx|pdf)$/.exec(value);
  const e=match && registeredAgencyForm(match[1]);
  return e && match[2]===e.sha256.slice(0,12) && match[3]===e.format ? value : null;
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
  if (form.sourceKind==="agency" || form.id.startsWith("agency-")) {
    const e=validateAgencyForm(form), p=e.programs.find(p=>p.id===program.id);
    if (!p || !agencyProgramLinkMatches(program.id,form,link) || !sameFormJurisdiction(program,form)
        || ![program.url,...(program.sources??[]).map(s=>s.url)].includes(p.url)) throw new Error("Agency program binding mismatch");
  }
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
