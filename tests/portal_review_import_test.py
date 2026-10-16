"""검토 원문을 공개 전 연결 자료로 옮기는 단계만 본다. 실제 파이프라인은 돌리지 않는다."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portal_review_import',ROOT/'scripts/prepare-portal-reviews.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
NATIONAL_LAW='사회보장급여의 이용·제공 및 수급권자 발굴에 관한 법률'
SEJONG_ORDINANCE='세종특별자치시 여성장애인 출산 및 양육 지원 조례'
EVIDENCE='https://www.law.go.kr/LSW/flDownload.do?flSeq=1'

def program(program_id,**extra):
    base={'id':program_id,'name':'출산 지원','scope':'national','laws':[NATIONAL_LAW]}
    base.update(extra);return base

def row(form_id,program_ids,**extra):
    base={'sourceKind':'rule','lawTitle':NATIONAL_LAW+' 시행규칙','lawId':'280315','annexId':form_id.split('-')[1],
        'annexNumber':'000100','sourceUrl':EVIDENCE,'dateKind':'effective','effectiveDate':'20250301',
        'programIds':list(program_ids),'formId':form_id,'use':'main','evidenceUrl':EVIDENCE,
        'evidenceNote':'원문 별지 제1호서식을 확인했다.','checkedAt':'2026-10-16','formTitle':'사회보장급여 신청(변경)서'}
    base.update(extra);return base

class ReviewFileTest(unittest.TestCase):
    def directory(self,**files):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        folder=Path(temp.name)
        for name,data in files.items():
            (folder/name.replace('__','-').replace('_json','.json')).write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        return folder
    def test_numbered_rounds_import_after_the_base_files(self):
        folder=self.directory(
            national__reviewed_json=[row('rule-1',['p1'])],
            municipal__reviewed_json={'rows':[row('ordin-2',['p2'])]},
            national__reviewed__round2_json={'rows':[row('rule-3',['p3'])]},
            municipal__reviewed__round2_json={'rows':[row('ordin-4',['p4'])]},
            national__reviewed__round10_json={'rows':[row('rule-5',['p5'])]})
        self.assertEqual([file.name for file in module.review_files(folder)],
            ['national-reviewed.json','municipal-reviewed.json','national-reviewed-round2.json',
             'municipal-reviewed-round2.json','national-reviewed-round10.json'])
        programs={key:program(key) for key in ['p1','p2','p3','p4','p5']}
        output=module.build(programs,module.review_files(folder))
        self.assertEqual([link['formId'] for link in output['rows']],['rule-1','ordin-2','rule-3','ordin-4','rule-5'])
    def test_review_report_and_unrelated_files_are_left_out(self):
        folder=self.directory(
            national__reviewed_json=[row('rule-1',['p1'])],
            municipal__reviewed_json={'rows':[]},
            # 집계 보고서는 rows가 개수라서 함께 읽으면 바로 깨진다.
            national__reviewed__report_json={'checkedAt':'2026-10-16','rows':16,'forms':10},
            national__reviewed__draft_json=[row('rule-9',['p9'])],
            reviewed__links_json=[row('rule-8',['p8'])])
        self.assertEqual([file.name for file in module.review_files(folder)],
            ['national-reviewed.json','municipal-reviewed.json'])
        output=module.build({'p1':program('p1')},module.review_files(folder))
        self.assertEqual([link['formId'] for link in output['rows']],['rule-1'])
    def test_missing_base_audit_file_is_reported(self):
        folder=self.directory(municipal__reviewed_json={'rows':[]},national__reviewed__round2_json={'rows':[]})
        with self.assertRaises(FileNotFoundError) as caught:module.review_files(folder)
        self.assertIn('national-reviewed.json',str(caught.exception))
    def test_committed_review_folder_never_imports_the_report(self):
        names=[file.name for file in module.review_files(ROOT/'pipeline/forms/reviews')]
        self.assertNotIn('national-reviewed-report.json',names)
        for name in module.BASE_FILES:self.assertIn(name,names)
        for name in names:self.assertIsNotNone(module.REVIEW_FILE.fullmatch(name))

class BuildTest(unittest.TestCase):
    def build(self,programs,*rounds):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        folder=Path(temp.name);files=[]
        for index,rows in enumerate(rounds):
            name='national-reviewed.json' if index==0 else f'national-reviewed-round{index+1}.json'
            (folder/name).write_text(json.dumps({'rows':rows},ensure_ascii=False),encoding='utf-8')
            files.append(folder/name)
        return module.build(programs,files)
    def test_unknown_program_is_rejected(self):
        with self.assertRaises(ValueError) as caught:
            self.build({'p1':program('p1')},[row('rule-1',['p1'])],[row('rule-2',['p-gone'])])
        self.assertIn('p-gone',str(caught.exception))
    def test_duplicate_association_across_rounds_is_rejected(self):
        programs={'p1':program('p1')}
        with self.assertRaises(ValueError):
            self.build(programs,[row('rule-1',['p1'])],[row('rule-1',['p1'],use='additional')])
        # 같은 서식을 다른 사업에 다시 연결하는 것은 중복이 아니다.
        output=self.build({'p1':program('p1'),'p2':program('p2')},[row('rule-1',['p1'])],[row('rule-1',['p2'])])
        self.assertEqual(len(output['rows']),2)
    def test_audited_role_metadata_is_preserved(self):
        audited=row('ordin-11128481',['p1'],formTitle='[별지 제1호서식] 수리 내역 자료',use='conditional',
            condition='수리센터에 제출하는 경우',role='supporting',roleBasis='제6조제1항이 정한 신청인 작성 수리 내역 자료로 원문을 대조했다.',
            roleEvidenceUrl='https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=976785',roleCheckedAt='20261016')
        output=self.build({'p1':program('p1')},[audited])
        self.assertEqual(output['forms']['ordin-11128481']['role'],'supporting')
        self.assertEqual(output['auditedRoles']['ordin-11128481'],{'role':'supporting',
            'roleBasis':audited['roleBasis'],'roleEvidenceUrl':audited['roleEvidenceUrl'],'roleCheckedAt':'2026-10-16'})
        self.assertEqual(output['rows'][0]['condition'],'수리센터에 제출하는 경우')
        self.assertEqual(output['rows'][0]['use'],'conditional')
        self.assertEqual(output['rows'][0]['evidenceNote'],audited['evidenceNote'])
        self.assertEqual(output['rows'][0]['checkedAt'],'2026-10-16')
    def test_audited_supporting_form_keeps_its_reviewed_role(self):
        audited=row('rule-7',['p1'],formTitle='[별지 제3호서식 사실확인 자료]',use='conditional',condition='필요한 경우',
            role='supporting',roleBasis='제5조제2항이 정한 신청인 작성 첨부서류임을 원문에서 확인했다.',
            roleEvidenceUrl='https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=280315',roleCheckedAt='2026-10-16')
        output=self.build({'p1':program('p1')},[audited])
        self.assertEqual(output['forms']['rule-7']['role'],'supporting')
        self.assertEqual(output['auditedRoles']['rule-7']['role'],'supporting')
    def test_unidentified_title_without_complete_metadata_is_rejected(self):
        title='[별지 제1호서식] 수리 내역 자료'
        complete={'role':'supporting','roleBasis':'제6조제1항이 정한 신청인 작성 수리 내역 자료임을 확인했다.',
            'roleEvidenceUrl':'https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=976785','roleCheckedAt':'2026-10-16'}
        for drop,replace in [('role',None),('roleBasis',None),('roleEvidenceUrl',None),('roleCheckedAt',None),
                ('role','application'),('roleBasis','짧음'),('roleEvidenceUrl','https://example.com/form.hwp'),
                ('roleEvidenceUrl',EVIDENCE+'&OC=secret'),('roleCheckedAt','2026년 10월')]:
            metadata={key:value for key,value in complete.items() if key!=drop}
            if replace is not None:metadata[drop]=replace
            with self.subTest(field=drop,value=replace),self.assertRaises(ValueError) as caught:
                self.build({'p1':program('p1')},[row('ordin-11128481',['p1'],formTitle=title,**metadata)])
            self.assertIn('ordin-11128481',str(caught.exception))
        self.assertEqual(self.build({'p1':program('p1')},[row('ordin-11128481',['p1'],formTitle=title,**complete)])['rows'][0]['formId'],'ordin-11128481')
    def test_non_applicant_forms_stay_out(self):
        for label,record in [('기관용',row('rule-1',['p1'],formTitle='수리업체지정 신청서')),
                ('삭제',row('rule-2',['p1'],formTitle='삭제 2020. 3. 3.')),
                ('참고 선언',row('rule-3',['p1'],formTitle='[별지 제1호서식 수리 신청서]',role='reference',
                    roleBasis='원문을 확인했으나 신청인 작성 서식이 아니다.',roleEvidenceUrl=EVIDENCE,roleCheckedAt='2026-10-16')),
                ('기관 선언',row('rule-4',['p1'],formTitle='사회보장급여 신청(변경)서',role='administrative',
                    roleBasis='기관이 작성하는 서식으로 확인했다.',roleEvidenceUrl=EVIDENCE,roleCheckedAt='2026-10-16'))]:
            with self.subTest(case=label),self.assertRaises(ValueError):
                self.build({'p1':program('p1')},[record])
    def test_reference_annex_cannot_be_promoted_by_role_metadata(self):
        with self.assertRaises(ValueError):
            self.build({'p1':program('p1')},[row('rule-9',['p1'],formTitle='[별표 1] 지원 기준',role='supporting',
                roleBasis='검토 기록이 있어도 별표를 신청서로 제공하지 않는다.',roleEvidenceUrl=EVIDENCE,roleCheckedAt='2026-10-16')])
    def test_audited_role_cannot_contradict_an_identified_title(self):
        with self.assertRaises(ValueError):
            self.build({'p1':program('p1')},[row('rule-1',['p1'],role='supporting',roleBasis='신청서가 아니라고 보았다.',
                roleEvidenceUrl=EVIDENCE,roleCheckedAt='2026-10-16')])
    def test_agency_designation_form_is_excluded_with_a_program_note(self):
        output=self.build({'p1':program('p1')},[row('law-17831969',['p1'],sourceKind='law',formTitle='대리인 지정서',
            use='conditional',condition='대리 신청하는 경우')])
        self.assertEqual(output['rows'],[])
        self.assertEqual(output['forms'],{})
        self.assertEqual(output['excluded'][0]['formId'],'law-17831969')
        self.assertIn('대리인 지정서',output['programNotes']['p1'])
    def test_medical_opinion_form_keeps_its_reviewed_sentence(self):
        output=self.build({'p1':program('p1')},[row('law-17831955',['p1'],sourceKind='law',formTitle='의사소견서',
            use='conditional',condition='장기요양 인정 신청의 경우')])
        self.assertEqual(output['rows'][0]['condition'],'장기요양 인정 신청의 경우 의료인이 작성하는 서식으로, 본인이 임의 작성하지 않습니다.')
    def test_import_of_the_same_audit_is_reproducible(self):
        rounds=([row('rule-1',['p1'])],[row('ordin-2',['p2'],sourceKind='ordin',regionCode='36000',regionLabel='세종특별자치시')])
        programs={'p1':program('p1'),'p2':program('p2',scope='sigungu',region={'sido':'36000','sigungu':'36110'},laws=[SEJONG_ORDINANCE])}
        first=self.build(programs,*rounds);second=self.build(programs,*rounds)
        self.assertEqual(json.dumps(first,ensure_ascii=False),json.dumps(second,ensure_ascii=False))

class ScopeBasisTest(unittest.TestCase):
    def link(self,record,program_record):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        file=Path(temp.name)/'national-reviewed.json'
        file.write_text(json.dumps({'rows':[record]},ensure_ascii=False),encoding='utf-8')
        return module.build({program_record['id']:program_record},[file])['rows'][0]
    def sejong(self,**extra):
        return program('g36110.p',scope='sigungu',region={'sido':'36000','sigungu':'36110'},laws=[SEJONG_ORDINANCE],**extra)
    def ordinance(self,**extra):
        return row('ordin-19985959',['g36110.p'],sourceKind='ordin',lawTitle=SEJONG_ORDINANCE,regionCode='36000',
            regionLabel='세종특별자치시',formTitle='[별지 제1호서식] 여성장애인 출산 지원 신청서',**extra)
    def test_provincial_basis_is_derived_only_when_the_program_cites_the_form_law(self):
        self.assertEqual(self.link(self.ordinance(),self.sejong())['scopeBasis'],'provincial-law-reference')
        other=self.sejong();other['laws']=['세종특별자치시 아동수당 지원 조례']
        self.assertNotIn('scopeBasis',self.link(self.ordinance(),other))
    def test_audited_national_basis_is_preserved_when_region_and_law_support_it(self):
        program_record=program('g41310.p',scope='sigungu',region={'sido':'41000','sigungu':'41310'},laws=[NATIONAL_LAW])
        link=self.link(row('rule-3211495',['g41310.p'],scopeBasis='national-law-reference'),program_record)
        self.assertEqual(link['scopeBasis'],'national-law-reference')
    def test_audited_basis_without_a_cited_law_is_rejected(self):
        program_record=program('g41310.p',scope='sigungu',region={'sido':'41000','sigungu':'41310'},laws=['경기도 구리시 장애인 이동기기 수리 등에 관한 조례'])
        with self.assertRaises(ValueError) as caught:
            self.link(row('rule-3211495',['g41310.p'],scopeBasis='national-law-reference'),program_record)
        self.assertIn('rule-3211495',str(caught.exception))
    def test_audited_basis_against_the_wrong_region_is_rejected(self):
        # 전국 서식에 도 조례 근거를 적을 수는 없다.
        with self.assertRaises(ValueError):
            self.link(row('rule-3211495',['g41310.p'],scopeBasis='provincial-law-reference'),
                program('g41310.p',scope='sigungu',region={'sido':'41000','sigungu':'41310'},laws=[NATIONAL_LAW]))
        # 전국 사업에는 다른 관할 근거 자체가 성립하지 않는다.
        with self.assertRaises(ValueError):
            self.link(row('rule-3211495',['p1'],scopeBasis='national-law-reference'),program('p1'))
    def test_unknown_audited_basis_is_rejected(self):
        with self.assertRaises(ValueError) as caught:
            self.link(self.ordinance(scopeBasis='same-metropolitan-area'),self.sejong())
        self.assertIn('same-metropolitan-area',str(caught.exception))

if __name__=='__main__':unittest.main()
