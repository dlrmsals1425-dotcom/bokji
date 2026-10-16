"""Import source-audited portal associations; this is not an automatic approval step."""
import importlib.util,json,re,sqlite3,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portal_match',ROOT/'pipeline/forms/portal_match.py')
matcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(matcher)
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def day(value):
    value=str(value)
    return f'{value[:4]}-{value[4:6]}-{value[6:8]}' if re.fullmatch(r'\d{8}',value) else value
def main():
    programs={}
    for file in (ROOT/'public/bundles/v1/details').glob('*.json'):programs.update(read(file))
    rows=[];forms={};notes={};excluded=[]
    for filename in ['national-reviewed.json','municipal-reviewed.json']:
        data=read(ROOT/'pipeline/forms/reviews'/filename)
        for record in data['rows'] if isinstance(data,dict) else data:
            form_id=record['formId']
            if form_id=='law-17831969':
                excluded.append({'formId':form_id,'reason':'Agency-issued designation certificate, not an applicant-written form.'})
                for program_id in record['programIds']:
                    notes[program_id]='시장·군수·구청장이 지정한 대리인이 신청하는 경우에는 기관에서 발급하는 대리인 지정서가 필요할 수 있습니다. 모든 가족 대리인에게 적용되는 서류는 아닙니다.'
                continue
            role=matcher.classify_role(record['formTitle'],'서식')
            if role not in {'application','consent','delegation','supporting'}:
                # Only these individually audited attachments may override a
                # title-only role. Source evidence and conditional use remain.
                if form_id=='rule-3211497':role='supporting'
                else:raise ValueError('Audited form role still needs review: '+form_id)
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
                if program['scope']=='sigungu' and forms[form_id]['regionCode']==program.get('region',{}).get('sido'):
                    link['scopeBasis']='provincial-law-reference'
                if form_id=='law-17831955':link['condition']=record['condition']+' 의료인이 작성하는 서식으로, 본인이 임의 작성하지 않습니다.'
                rows.append(link)
    keys=[(row['programIds'][0],row['formId']) for row in rows]
    if len(set(keys))!=len(keys):raise ValueError('Duplicate source-reviewed association')
    output={'schema':1,'rows':rows,'forms':forms,'programNotes':notes,'excluded':excluded}
    (ROOT/'pipeline/forms/portal-reviewed-links.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'links':len(rows),'forms':len(forms),'programs':len({row['programIds'][0] for row in rows}),'excludedAgencyForms':len(excluded)}))
if __name__=='__main__':main()
