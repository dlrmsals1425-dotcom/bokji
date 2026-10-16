"""Import source-audited portal associations; this is not an automatic approval step.

Reads the base audits and any later numbered rounds of the same shape
(`national-reviewed.json`, `municipal-reviewed.json`, `national-reviewed-round2.json`, ...)
in a fixed order, oldest round first. Review reports and other files that sit in
the same folder stay out.

Audited rows may carry two kinds of explicit metadata. `scopeBasis` says a form
from another jurisdiction still applies to the program; it is checked against the
program region and the law the program cites instead of being taken on trust, and
nothing here invents one the audit did not claim. `role` with `roleBasis`,
`roleEvidenceUrl` and `roleCheckedAt` may name a supporting form whose title
cannot identify it; metadata is read only
when the title says nothing, and administrative, deleted and reference forms stay
out whether the title or the audit names them.
"""
import importlib.util,json,re,sqlite3,sys
from urllib.parse import urlsplit,parse_qsl
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portal_match',ROOT/'pipeline/forms/portal_match.py')
matcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(matcher)
REVIEW_FILE=re.compile(r'(national|municipal)-reviewed(?:-round(\d+))?\.json')
BASE_FILES=('national-reviewed.json','municipal-reviewed.json')
ALLOWED_ROLES=frozenset({'application','consent','delegation','supporting'})
# 역할 자체가 신청인이 쓰는 서식이 아님을 뜻하는 값. 검토 메타데이터로도 올리지 않는다.
BLOCKED_ROLES=frozenset({'administrative','deleted','reference'})
# 제목만으로 역할을 가릴 수 없어 원문을 따로 확인한 서식. 아래 role 메타데이터 규칙보다
# 먼저 검토된 행이라 id로 남긴다. 새 서식은 메타데이터를 갖춰야 한다.
AUDITED_SUPPORTING_FORMS=frozenset({'rule-3211497'})
SCOPE_BASES=frozenset({'provincial-law-reference','national-law-reference'})
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def day(value):
    value=str(value)
    return f'{value[:4]}-{value[4:6]}-{value[6:8]}' if re.fullmatch(r'\d{8}',value) else value
def review_files(directory):
    """검토 원문 파일 목록. 기본 파일에 회차 파일을 더하고 같은 순서로만 읽는다."""
    found=[]
    for path in sorted(directory.glob('*.json')):
        match=REVIEW_FILE.fullmatch(path.name)
        if not match or not path.is_file():continue
        # 기본 파일을 0회차로 두어 회차 파일이 항상 뒤에 온다. round10은 round2 뒤다.
        found.append((int(match.group(2)) if match.group(2) else 0,BASE_FILES.index(match.group(1)+'-reviewed.json'),path.name,path))
    missing=[name for name in BASE_FILES if name not in {item[2] for item in found}]
    if missing:raise FileNotFoundError('Missing audited review file: '+', '.join(missing))
    return [item[3] for item in sorted(found)]
def official_url(value):
    """근거는 법령정보센터 https 주소만 받는다."""
    try:
        url=urlsplit(str(value or ''))
        return (url.scheme=='https' and url.hostname in {'www.law.go.kr','law.go.kr'}
            and not url.username and not url.password
            and not any(re.search(r'^oc$|key|token|secret|password|auth|login|email|phone|resident',name,re.I) for name,_ in parse_qsl(url.query)))
    except ValueError:return False
def cites_form_law(program,form):
    """사업이 이 서식의 법령을 실제로 인용하는지. 공개 단계의 검사와 같은 기준이다."""
    target=matcher.normalize_law(form.get('lawTitle'))
    if not target:return False
    family=set(matcher.law_variants(target))
    laws=program.get('laws') or []
    if isinstance(laws,str):laws=[laws]
    if not isinstance(laws,list):return False
    for entry in laws:
        for part in str(entry).split('||'):
            cited=matcher.normalize_law(part)
            if cited and (cited==target or target in matcher.law_variants(cited) or cited in family):return True
    return False
def role_metadata(record):
    """원문으로 역할을 확인했다는 메타데이터. 근거·출처·확인일이 모두 있어야 인정한다."""
    role=str(record.get('role') or '').strip()
    if role!='supporting':return None
    basis=str(record.get('roleBasis') or '').strip();url=str(record.get('roleEvidenceUrl') or '').strip()
    checked=day(str(record.get('roleCheckedAt') or '').strip())
    if len(basis)<10 or not official_url(url) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',checked):return None
    return {'role':role,'roleBasis':basis,'roleEvidenceUrl':url,'roleCheckedAt':checked}
def resolve_role(record):
    """서식 역할과 검토 메타데이터. 제목 분류를 먼저 쓰고, 가릴 수 없을 때만 메타데이터를 본다."""
    form_id=record['formId'];declared=str(record.get('role') or '').strip()
    if declared in BLOCKED_ROLES:raise ValueError('Audited row marks a non-applicant form role: '+form_id)
    role=matcher.classify_role(record['formTitle'],'서식')
    if re.match(r'^\s*\[?\s*별표(?:\s|\d|\]|$)',record['formTitle']):
        raise ValueError('Reference annex cannot be imported as an applicant form: '+form_id)
    if role in BLOCKED_ROLES-{'reference'}:
        raise ValueError('Agency-issued or deleted form cannot be imported: '+form_id)
    if role in ALLOWED_ROLES:
        if declared and declared!=role:raise ValueError('Audited role contradicts the form title: '+form_id)
        return role,None
    if form_id in AUDITED_SUPPORTING_FORMS:return 'supporting',None
    metadata=role_metadata(record)
    if metadata:return metadata['role'],metadata
    raise ValueError('Audited form role still needs review; an unidentified supporting form needs roleBasis, roleEvidenceUrl and roleCheckedAt: '+form_id)
def scope_basis(record,program,form):
    """다른 관할 서식이 이 사업에 적용된다는 근거. 검토가 적은 값만 확인하고 없으면 만들지 않는다."""
    region=program.get('region') if isinstance(program.get('region'),dict) else {}
    same_province=program.get('scope')=='sigungu' and form['regionCode']==region.get('sido')
    national_reference=form['regionCode']=='national' and form.get('sourceKind') in {'law','rule'} and program.get('scope') in {'sido','sigungu'}
    declared=str(record.get('scopeBasis') or '').strip()
    if not declared:
        # 세종·제주처럼 시·구 사업이 인용한 도 조례 서식만 적는다. 전국 서식의 적용 범위는
        # 검토가 밝힌 경우에만 쓰고 여기서 넓히지 않는다.
        return 'provincial-law-reference' if same_province and cites_form_law(program,form) else None
    if declared not in SCOPE_BASES:raise ValueError('Unknown audited scope basis: '+declared+' ('+record['formId']+')')
    supported=same_province if declared=='provincial-law-reference' else national_reference
    if not supported or not cites_form_law(program,form):
        raise ValueError('Audited scope basis does not match the program region and cited law: '+record['formId'])
    return declared
def build(programs,files):
    """검토 원문을 공개 전 연결 자료로 옮긴다. 검토가 없는 연결은 만들지 않는다."""
    rows=[];forms={};notes={};excluded=[];audited_roles={}
    for file in files:
        data=read(file)
        for record in data['rows'] if isinstance(data,dict) else data:
            form_id=record['formId']
            if form_id=='law-17831969':
                excluded.append({'formId':form_id,'reason':'Agency-issued designation certificate, not an applicant-written form.'})
                for program_id in record['programIds']:
                    notes[program_id]='시장·군수·구청장이 지정한 대리인이 신청하는 경우에는 기관에서 발급하는 대리인 지정서가 필요할 수 있습니다. 모든 가족 대리인에게 적용되는 서류는 아닙니다.'
                continue
            role,metadata=resolve_role(record)
            if metadata:audited_roles[form_id]=metadata
            kind=record['sourceKind'];law_id=record['lawId']
            law_url=('https://www.law.go.kr/ordinInfoP.do?ordinSeq=' if kind=='ordin' else 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=' if kind=='law' else 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=')+law_id
            forms[form_id]={'id':form_id,'title':record['formTitle'],'role':role,'lawTitle':record['lawTitle'],'lawId':law_id,'annexId':record['annexId'],'annexNumber':record['annexNumber'],
                'regionCode':record.get('regionCode','national'),'regionLabel':record.get('regionLabel','전국 공통'),'effectiveDate':day(record['effectiveDate']),
                'sourceUrl':record['sourceUrl'],'lawUrl':law_url,'fetchedAt':record['checkedAt'],'sourceKind':kind,'dateKind':record['dateKind'],
                **({'officialPdfUrl':record['officialPdfUrl']} if record.get('officialPdfUrl') else {})}
            for program_id in record['programIds']:
                program=programs.get(program_id)
                if not program:raise ValueError('Unknown audited program: '+program_id)
                link={key:record[key] for key in ['formId','use','condition','evidenceUrl','evidenceNote','checkedAt'] if key in record}
                link['programIds']=[program_id]
                basis=scope_basis(record,program,forms[form_id])
                if basis:link['scopeBasis']=basis
                if form_id=='law-17831955':link['condition']=record['condition']+' 의료인이 작성하는 서식으로, 본인이 임의 작성하지 않습니다.'
                rows.append(link)
    keys=[(row['programIds'][0],row['formId']) for row in rows]
    if len(set(keys))!=len(keys):raise ValueError('Duplicate source-reviewed association')
    output={'schema':1,'rows':rows,'forms':forms,'programNotes':notes,'excluded':excluded}
    if audited_roles:output['auditedRoles']=audited_roles
    return output
def main():
    programs={}
    for file in sorted((ROOT/'public/bundles/v1/details').glob('*.json')):programs.update(read(file))
    files=review_files(ROOT/'pipeline/forms/reviews')
    output=build(programs,files)
    (ROOT/'pipeline/forms/portal-reviewed-links.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'links':len(output['rows']),'forms':len(output['forms']),'programs':len({row['programIds'][0] for row in output['rows']}),
        'excludedAgencyForms':len(output['excluded']),'auditedRoleForms':len(output.get('auditedRoles',{})),'reviewFiles':[file.name for file in files]}))
if __name__=='__main__':main()
