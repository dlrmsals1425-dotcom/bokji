"""Match every published welfare record against the collected official annex index.

This produces review candidates, never automatic publication approvals.
"""
import argparse, importlib.util, json, re, sqlite3, sys, unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portal_match',ROOT/'pipeline/forms/portal_match.py')
matching=importlib.util.module_from_spec(spec);spec.loader.exec_module(matching)
ROLES={'application','consent','delegation','supporting'}
MERGED_SIDO='12000'  # Same dataset convention as src/lib/data/legacyArea.ts.
FORMER_GWANGJU={'12210','12240','12270','12300','12330'}

def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def day(value):
    value=str(value or '')
    return f'{value[:4]}-{value[4:6]}-{value[6:8]}' if re.fullmatch(r'\d{8}',value) else value
def flatten_laws(program):
    return [part for value in program.get('laws',[]) for part in value.split('||') if part.strip()]
def unnamed(form):
    title=unicodedata.normalize('NFKC',form.get('title',''))
    return form.get('declaredKind')=='서식' and (not title.strip() or bool(re.fullmatch(r'[\s\[\]별지제호서식\d의~∼ㆍ·()<>-]+',title)))

def resolve_authority(form,provinces):
    if form['regionCode']!='unresolved':return form
    resolved=dict(form);authority=form['regionLabel'].replace(' ','')
    education=authority.endswith('교육청')
    if education:authority=authority[:-3];resolved['authorityType']='education'
    legacy={'(구)광주광역시':'gwangju','(구)전라남도':'jeonnam'}.get(authority)
    if legacy:
        resolved['regionCode']=MERGED_SIDO;resolved['legacyArea']=legacy
    elif authority in provinces:resolved['regionCode']=provinces[authority]
    return resolved

def authority_applies(program,form,law_cited):
    if form.get('authorityType')=='education' and program.get('orgType')!='edu_office' and not law_cited:return False
    legacy=form.get('legacyArea')
    if not legacy:return True
    region=program.get('region',{})
    if region.get('sido')!=MERGED_SIDO:return False
    if program['scope']=='sigungu':return legacy==('gwangju' if region.get('sigungu') in FORMER_GWANGJU else 'jeonnam')
    areas=set()
    for source in program.get('sources',[]):
        if source.get('source')!='gov24':continue
        if str(source.get('id','')).startswith('6290000'):areas.add('gwangju')
        if str(source.get('id','')).startswith('6460000'):areas.add('jeonnam')
    if not areas:
        text=(program['name']+' '+str(program.get('owner',''))).replace('전남광주통합특별시',' ')
        if re.search(r'광주\s*광역시|광주형|광주다움|광주\s*청년|빛고을',text):areas.add('gwangju')
        if re.search(r'전라\s*남도|전남',text):areas.add('jeonnam')
    return legacy in areas if areas else law_cited
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--allow-incomplete',action='store_true')
    parser.add_argument('--source-dir',type=Path,default=ROOT/'logs/law-scan',help='Existing collected portal index (read only); match cache stays in this checkout')
    args=parser.parse_args()
    folder=ROOT/'logs/law-scan';folder.mkdir(parents=True,exist_ok=True)
    source_folder=args.source_dir.resolve();state=read(source_folder/'collection-status.json')
    if state['status']!='complete' and not args.allow_incomplete:raise RuntimeError('Complete portal index required before final matching')
    state['status']='complete' if state['status']=='complete' else 'incomplete'
    provinces={row['name'].replace(' ',''):row['code'] for row in read(ROOT/'public/bundles/v1/regions.json')['sidos']}
    source=sqlite3.connect((source_folder/'annexes.sqlite').as_uri()+'?mode=ro',uri=True)
    index=sqlite3.connect(folder/'match-index.sqlite')
    index.executescript('DROP TABLE IF EXISTS search; DROP TABLE IF EXISTS forms; CREATE TABLE forms(id TEXT PRIMARY KEY,region TEXT,law TEXT,role TEXT,payload TEXT); CREATE INDEX form_law ON forms(law); CREATE INDEX form_region ON forms(region); CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED,title,region UNINDEXED,tokenize="unicode61");')
    indexed=0;eligible=0;unknown=0
    for record_id,payload in source.execute('SELECT id,payload FROM annexes ORDER BY id'):
        form=resolve_authority(json.loads(payload),provinces);indexed+=1
        form['role']=matching.classify_role(form['title'],form['declaredKind'])
        is_unnamed=unnamed(form)
        if is_unnamed:form['role']='unclassified'
        if form['regionCode']=='unresolved':unknown+=1;continue
        if form['role'] not in ROLES and not is_unnamed:continue
        form['effectiveDate']=day(form.get('effectiveDate'));form['unnamed']=is_unnamed
        if not form.get('sourceUrl'):form['sourceUrl']=form.get('officialPdfUrl') or form['lawUrl']
        law=matching.normalize_law(form['lawTitle']);text=unicodedata.normalize('NFKC',form['title'])
        index.execute('INSERT INTO forms VALUES(?,?,?,?,?)',(record_id,form['regionCode'],law,form['role'],json.dumps(form,ensure_ascii=False)))
        index.execute('INSERT INTO search(id,title,region) VALUES(?,?,?)',(record_id,text,form['regionCode']))
        eligible+=1
        if indexed%10000==0:index.commit()
    index.commit();source.close()
    print(json.dumps({'event':'indexed','portalForms':indexed,'candidateEligibleForms':eligible,'unresolvedJurisdiction':unknown}),flush=True)
    programs={}
    for file in sorted((ROOT/'public/bundles/v1/details').glob('*.json')):programs.update(read(file))
    existing=read(ROOT/'pipeline/forms/reviewed-links.json')['rows']
    additional=[]
    for path in sorted((ROOT/'pipeline/forms/reviews').iterdir()):
        if path.is_file() and re.fullmatch(r'(national|municipal)-reviewed(?:-round\d+)?\.json',path.name):
            data=read(path);additional.extend(data['rows'] if isinstance(data,dict) else data)
    reviewed_ids={row['formId'] for row in existing+additional}
    matched_ids=set(reviewed_ids);result={};law_cache={};evaluated=0
    checked_at=datetime.now(timezone.utc).isoformat()
    for program_id,program in sorted(programs.items()):
        pool={};cited=set()
        for law in flatten_laws(program):
            for variant in matching.law_variants(law):
                cited.add(variant)
                if variant not in law_cache:law_cache[variant]=[json.loads(row[0]) for row in index.execute('SELECT payload FROM forms WHERE law=?',(variant,))]
                for form in law_cache[variant]:pool[form['id']]=form
        code='national' if program['scope']=='national' else program.get('region',{}).get('sido' if program['scope']=='sido' else 'sigungu')
        tokens=[re.sub(r'[^0-9a-zA-Z가-힣]','',token) for token in matching.program_tokens(program)]
        tokens=[token for token in tokens if len(token)>=2]
        if tokens and code:
            query=' OR '.join('"'+token+'"*' for token in tokens)
            for row in index.execute('SELECT forms.payload FROM search JOIN forms ON forms.id=search.id WHERE search MATCH ? AND forms.region=?',(query,code)):
                form=json.loads(row[0]);pool[form['id']]=form
        candidates={}
        for form in pool.values():
            law_cited=matching.normalize_law(form['lawTitle']) in cited
            if not authority_applies(program,form,law_cited):continue
            evaluated+=1;candidate=matching.evaluate_candidate(program,form)
            province_ref=program['scope']=='sigungu' and form['regionCode']==program.get('region',{}).get('sido') and law_cited
            exact_place=form['regionCode']==code
            national_ref=form['regionCode']=='national' and law_cited
            if not candidate and province_ref and form['role'] in ROLES:
                candidate={'formId':form['id'],'score':25,'reason':'사업이 인용한 같은 시·도 조례의 서식으로 적용 여부를 확인해야 합니다.','basis':'law_reference','scopeBasis':'provincial_law_reference'}
            if not candidate and form['unnamed'] and law_cited and (exact_place or province_ref or national_ref):
                candidate={'formId':form['id'],'score':1,'reason':'근거 법령에 명칭이 없는 서식이 있어 내용 확인이 필요합니다.','basis':'unnamed_annex','scopeBasis':'law_reference'}
            if candidate:candidates[form['id']]=candidate;matched_ids.add(form['id'])
        ordered=sorted(candidates.values(),key=lambda row:(-row['score'],row['formId']))
        result[program_id]={'checkedAt':checked_at,'outcome':'candidate' if ordered else 'not_found','candidateCount':len(ordered),'method':'full-index','candidates':ordered}
        if len(result)%2000==0:print(json.dumps({'event':'matched','programs':len(result),'withCandidates':sum(bool(r['candidates']) for r in result.values()),'candidateComparisons':evaluated}),flush=True)
    raw_source=sqlite3.connect((source_folder/'annexes.sqlite').as_uri()+'?mode=ro',uri=True)
    forms={}
    for form_id in sorted(matched_ids):
        record=raw_source.execute('SELECT payload FROM annexes WHERE id=?',(form_id,)).fetchone()
        if not record:continue
        form=resolve_authority(json.loads(record[0]),provinces);form['role']='unclassified' if unnamed(form) else matching.classify_role(form['title'],form['declaredKind']);form['effectiveDate']=day(form.get('effectiveDate'))
        if not form['title'].strip():form['title']=f"{form['lawTitle']} 별지 {form['annexNumber']} (명칭 미제공)"
        if not form.get('sourceUrl'):form['sourceUrl']=form.get('officialPdfUrl') or form['lawUrl']
        forms[form_id]=form
    raw_source.close();index.close()
    output=ROOT/'pipeline/forms'
    scan={'status':state['status'],'indexedForms':state['storedUnique'],'checkedPrograms':len(result),'checkedAt':checked_at,'sources':[{'kind':kind,'total':info['total'],'collected':info['rows']} for kind,info in state['sources'].items()], 'candidateEligibleForms':eligible,'unresolvedJurisdiction':unknown,'candidateComparisons':evaluated,'matchedPrograms':sum(bool(row['candidates']) for row in result.values()),'matchedForms':len(forms),'collectionStartedAt':state['startedAt'],'collectionFinishedAt':state.get('finishedAt'),'duplicateRows':state.get('duplicateRows',0)}
    for name,data in [('portal-scan.json',scan),('portal-matches.json',{'schema':1,'programs':result}),('portal-forms.json',{'schema':1,'forms':forms})]:
        (output/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({'event':'finished',**scan}),flush=True)

if __name__=='__main__':main()
