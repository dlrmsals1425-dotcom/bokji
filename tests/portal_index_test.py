import importlib.util
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('portal_index',ROOT/'scripts/match-law-forms.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class AuthorityTest(unittest.TestCase):
    def test_education_office_requires_education_program_or_cited_law(self):
        form=module.resolve_authority({'regionCode':'unresolved','regionLabel':'경기도교육청'},{'경기도':'41000'})
        self.assertEqual(form['regionCode'],'41000')
        self.assertFalse(module.authority_applies({'orgType':'metro'},form,False))
        self.assertTrue(module.authority_applies({'orgType':'edu_office'},form,False))
        self.assertTrue(module.authority_applies({'orgType':'local'},form,True))
    def test_legacy_province_form_never_leaks_to_other_half_of_merged_area(self):
        form=module.resolve_authority({'regionCode':'unresolved','regionLabel':'(구)광주광역시'}, {})
        self.assertEqual(form['regionCode'],'12000')
        gwangju={'scope':'sigungu','region':{'sido':'12000','sigungu':'12210'}}
        jeonnam={'scope':'sigungu','region':{'sido':'12000','sigungu':'12420'}}
        self.assertTrue(module.authority_applies(gwangju,form,False))
        self.assertFalse(module.authority_applies(jeonnam,form,True))
    def test_legacy_province_uses_existing_source_authority_convention(self):
        form={'legacyArea':'gwangju'}
        program={'scope':'sido','name':'지원','region':{'sido':'12000'},'sources':[{'source':'gov24','id':'646000000001'}]}
        self.assertFalse(module.authority_applies(program,form,True))
        program['sources']=[{'source':'gov24','id':'629000000001'}]
        self.assertTrue(module.authority_applies(program,form,False))
    def test_unknown_authority_stays_unresolved(self):
        form={'regionCode':'unresolved','regionLabel':'충청광역연합'}
        self.assertEqual(module.resolve_authority(form,{}),form)
    def test_parenthetical_common_application_is_an_application(self):
        self.assertEqual(module.matching.classify_role('사회보장급여 신청(변경)서','서식'),'application')
        self.assertEqual(module.matching.classify_role('사회서비스이용권 신청(변경)서','서식'),'application')
        self.assertEqual(module.matching.classify_role('기관용 동의서','서식'),'administrative')
    def test_unnamed_annex_is_not_claimed_to_be_an_application(self):
        self.assertTrue(module.unnamed({'title':'[별지 제1호서식]','declaredKind':'서식'}))
        self.assertFalse(module.unnamed({'title':'[별표 1] 요금표','declaredKind':'별표'}))

if __name__=='__main__':unittest.main()
