import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationForm, FormLink } from "@/lib/data/forms";
import type { Program } from "@/lib/data/types";
import registry from "@/lib/data/verifiedAgencyForms.json";
import { agencyFormUrl, agencyProgramLinkMatches, formAssetUrl, officialFormUrl, registeredAgencyForm, safeAgencyUrl, validateAgencyForm, validateFormLink } from "@/lib/data/formPublication";
import { loadDownloadedOriginals, requireApprovedOriginals, validateDownloadManifest, type DownloadManifest } from "../../scripts/build-forms";
import { basisText } from "@/components/ApplicationForms";

const e=registry.forms["agency-44250-36032"], id=e.id;
const file=`/forms/files/${id}-${e.sha256.slice(0,12)}.${e.format}`;
const form=(): ApplicationForm => ({ id, title:e.title, role:"application", sourceKind:"agency", regionCode:e.regionCode, regionLabel:e.regionLabel,
  lawId:e.lawId, lawTitle:e.lawTitle, lawUrl:e.lawEvidenceUrl, annexId:"", annexNumber:"", sourceUrl:e.sourceUrl,
  fetchedAt:e.checkedAt, dateKind:"published", effectiveDate:e.publishedAt,
  agency:{agencyName:e.agencyName,sourcePageUrl:e.sourcePageUrl,finalUrl:e.finalUrl,attachmentId:e.attachmentId,sha256:e.sha256,bytes:e.bytes,format:"hwp",checkedAt:e.checkedAt,authorityEvidenceUrl:e.authorityEvidenceUrl} });
const link=(): FormLink => ({formId:id,use:"main",condition:e.condition,evidenceUrl:e.sourcePageUrl,evidenceNote:"공식 시청 배포 원문 전체를 확인하여 이 사업과 대조한 신청서입니다.",checkedAt:e.checkedAt,programEvidenceUrl:e.programs[0].url});
const program=(): Program => ({id:e.programs[0].id,name:"화장장려금 지원",scope:"sigungu",region:{sido:"44000",sigungu:"44250"},url:e.programs[0].url,laws:[e.lawTitle]} as Program);
const manifest=(): DownloadManifest => ({schema:1,forms:{[id]:{format:"hwp",path:`originals/${id}.hwp`,bytes:e.bytes,sha256:e.sha256,sourceUrl:e.sourceUrl,finalUrl:e.finalUrl,downloadedAt:"2026-10-19T00:00:00Z"}}});

describe("exact curated agency originals",()=>{
  afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
  it("accepts the registered official case and retains actual publication and law dates separately",()=>{
    expect(registeredAgencyForm(id)?.sha256).toBe(e.sha256);
    expect(()=>validateFormLink(program(),form(),link())).not.toThrow();
    expect(validateAgencyForm(form()).lawEffectiveDate).toBe("2024-05-20");
    expect(basisText(form())).toBe("기관 공식 배포 · 게시일 2026-05-12");
    expect(basisText({...form(),dateKind:"checked",effectiveDate:"2026-10-19"})).toContain("공식배포 확인일 2026-10-19");
    expect(formAssetUrl(file)).toBe(file);
    expect(agencyFormUrl(id,e.sourceUrl)).toBe(e.sourceUrl);
  });
  it("keeps law portal URL policy unchanged and rejects unregistered agency endpoints",()=>{
    expect(officialFormUrl(e.sourceUrl)).toBeNull();
    expect(officialFormUrl("https://www.law.go.kr/LSW/flDownload.do?flSeq=123")).toBeTruthy();
    for(const url of [e.sourceUrl+"&extra=1",e.sourceUrl.replace("36032","999"),"https://gyeryong.go.kr/other.hwp","https://private.org/file.hwp"])
      expect(agencyFormUrl(id,url)).toBeNull();
    expect(agencyFormUrl("agency-44250-999",e.sourceUrl)).toBeNull();
    expect(formAssetUrl(file.replace("36032","999"))).toBeNull();
    expect(formAssetUrl(file.replace(e.sha256.slice(0,12),"000000000000"))).toBeNull();
  });
  it("distinguishes public routing and attachment identifiers from credentials and unsafe paths",()=>{
    expect(safeAgencyUrl("https://public.or.kr/file?key=123&fileKey=PUBLIC&atchFileId=FILE_123")).toBeTruthy();
    for(const url of ["https://user:pass@public.or.kr/file","https://public.or.kr/a/%252e%252e/b.hwp","https://public.or.kr/a/%5c../b.hwp","https://public.or.kr/file?key=secret","https://public.or.kr/file?%2561piKey=secret",
      ...["apiKey","serviceKey","access_token","Authorization","password","session","OC"].map(k=>`https://public.or.kr/file?${k}=secret`)]) expect(safeAgencyUrl(url)).toBeNull();
  });
  it("supports an exact delegated fixed path, requiring authority proof and one identifier mode",()=>{
    const forms=registry.forms as unknown as Record<string,Record<string,unknown>>, previous=forms[id];
    const pathname="/userNew/custom/SP/%EC%8B%A0%EC%B2%AD.hwp", url="https://public.or.kr"+pathname;
    try {
      forms[id]={...previous,sourceUrl:url,finalUrl:url,authorityKind:"delegated",attachmentIdentifier:{path:pathname}};
      expect(agencyFormUrl(id,url)).toBe(url);
      expect(agencyFormUrl(id,"https://public.or.kr/other.hwp")).toBeNull();
      forms[id].attachmentIdentifier={path:pathname,queryParam:"file_id",value:e.attachmentId};
      expect(registeredAgencyForm(id)).toBeNull();
      forms[id].attachmentIdentifier={path:pathname};forms[id].authorityEvidenceUrl=url;
      expect(registeredAgencyForm(id)).toBeNull();
    } finally { forms[id]=previous; }
  });
  it("rejects source identity, original SHA, jurisdiction and target program mismatches",()=>{
    for(const changes of [{sourceUrl:e.sourceUrl+"&x=1"},{lawId:"999"},{sourceKind:"ordin"},{annexId:"17575933"},{annexNumber:"1"},{regionCode:"44230"},
      {agency:{...form().agency!,sha256:"0".repeat(64)}},{agency:{...form().agency!,finalUrl:"https://other.go.kr/file.hwp"}}])
      expect(()=>validateAgencyForm({...form(),...changes} as ApplicationForm)).toThrow();
    expect(()=>validateFormLink({...program(),id:"g44250.gov24-wrong"},form(),link())).toThrow();
    expect(()=>validateFormLink({...program(),region:{sido:"44000",sigungu:"44230",label:"다른 시"}},form(),link())).toThrow();
    expect(()=>validateFormLink({...program(),url:"https://www.bokjiro.go.kr/"},form(),link())).toThrow();
    expect(()=>validateFormLink(program(),form(),{...link(),condition:"제한 없이 사용"})).toThrow();
    expect(agencyProgramLinkMatches("g44250.gov24-wrong",form(),link())).toBe(false);
  });
  it("checks exact manifest identity, final URL, hash and storage paths",()=>{
    expect(()=>validateDownloadManifest(manifest())).not.toThrow();
    for(const changes of [{path:"../outside.hwp"},{path:`originals/${id}.hwpx`},{sha256:"0".repeat(64)},{bytes:1},{format:"pdf"},
      {sourceUrl:e.sourceUrl+"&x=1"},{finalUrl:"https://example.org/file.hwp"},{finalUrl:undefined},{pdf:{path:"previews/x.pdf"}}]){
      const invalid=manifest();Object.assign(invalid.forms[id],changes);
      expect(()=>validateDownloadManifest(invalid)).toThrow();
    }
    expect(()=>requireApprovedOriginals(new Set([id]),new Map(),false)).toThrow(/no downloaded original/);
  });
  it("loads the actual blank HWP fixture and refuses changed bytes",async()=>{
    const temporary=await mkdtemp(path.join(tmpdir(),"agency-original-"));
    try {
      await mkdir(path.join(temporary,"originals"));
      const bytes=await readFile(path.resolve("tests/fixtures/forms/agency-44250-36032.hwp"));
      await writeFile(path.join(temporary,"originals",id+".hwp"),bytes);
      expect((await loadDownloadedOriginals(temporary,manifest(),{[id]:form()})).get(id)?.bytes.equals(bytes)).toBe(true);
      await expect(loadDownloadedOriginals(temporary,manifest(),{[id]:{...form(),sourceUrl:e.sourceUrl+"&other=1"}})).rejects.toThrow();
      await writeFile(path.join(temporary,"originals",id+".hwp"),Buffer.concat([bytes,Buffer.from("changed")]));
      await expect(loadDownloadedOriginals(temporary,manifest(),{[id]:form()})).rejects.toThrow(/hash\/length/);
    } finally {
      if(path.dirname(path.resolve(temporary))!==path.resolve(tmpdir()) || !path.basename(temporary).startsWith("agency-original-"))throw new Error("Unexpected cleanup target");
      await rm(temporary,{recursive:true,force:true});
    }
  });
  it("accepts a PDF original's own print alias but rejects another PDF or a Hangul preview",()=>{
    const forms=registry.forms as unknown as Record<string,Record<string,unknown>>, previous=forms[id];
    const pdfPath=file.replace(/\.hwp$/,".pdf");
    try {
      forms[id]={...previous,format:"pdf"};
      const pdfForm=form();
      pdfForm.agency={...pdfForm.agency!,format:"pdf"};
      pdfForm.file={hwp:pdfPath,pdf:pdfPath,format:"pdf",bytes:e.bytes,sha256:e.sha256};
      expect(()=>validateAgencyForm(pdfForm)).not.toThrow();
      expect(()=>validateAgencyForm({...pdfForm,file:{...pdfForm.file!,pdf:"/forms/files/other.pdf"}})).toThrow();
    } finally { forms[id]=previous; }
    expect(()=>validateAgencyForm({...form(),file:{hwp:file,pdf:pdfPath,format:"hwp",bytes:e.bytes,sha256:e.sha256}})).toThrow();
  });
  it("client loader rejects wrong SHA or programme even when asset spelling looks valid",async()=>{
    for(const mutation of ["valid","sha","program"]){
      vi.resetModules();
      const f=form();f.file={hwp:file,format:"hwp",bytes:e.bytes,sha256:mutation==="sha"?"0".repeat(64):e.sha256};
      const pid=mutation==="program"?"g44250.gov24-wrong":program().id;
      vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes("/programs/")
        ? {schema:1,programs:[{id:pid,links:[link()],candidateFormIds:[]}]}
        : {schema:1,forms:{[id]:f}}})));
      const loader=await import("@/lib/client/forms");
      const result=await loader.loadProgramForms(pid);
      if(mutation==="valid")expect(result?.forms[0].id).toBe(id);else expect(result).toBeNull();
    }
  });
  it("retry fetches corrected source metadata after a rejected flat or sharded catalogue",async()=>{
    for(const sharded of [false,true]){
      vi.resetModules();
      let invalid=true;
      const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>{
        const f=form();f.file={hwp:file,format:"hwp",bytes:e.bytes,sha256:invalid?"0".repeat(64):e.sha256};
        return url.includes("/programs/")
          ? {schema:1,catalogSharded:sharded,programs:[{id:program().id,links:[link()],candidateFormIds:[]}]}
          : {schema:1,forms:{[id]:f}};
      }}));
      vi.stubGlobal("fetch",fetcher);
      const loader=await import("@/lib/client/forms");
      expect(await loader.loadProgramForms(program().id)).toBeNull();
      invalid=false;
      expect((await loader.loadProgramForms(program().id))?.forms[0].id).toBe(id);
      expect(fetcher).toHaveBeenCalledTimes(4);
    }
  });
});
