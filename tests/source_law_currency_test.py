import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('currency',ROOT/'scripts/audit-source-law-currency.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class CurrencyTest(unittest.TestCase):
    source={'lawId':'100','stableLawId':'900','lawTitle':'안양시 학생복지 지원 조례','orgName':'경기도 안양시'}
    def row(self,**changes):
        return {'자치법규일련번호':'100','자치법규ID':'900','자치법규명':self.source['lawTitle'],
                '지자체기관명':'경기도 안양시','시행일자':'20221230',**changes}
    def test_same_mst_in_the_current_list_is_current(self):
        self.assertEqual(m.classify(self.source,[self.row()],'2026-10-18')['state'],'source_current')
    def test_new_current_edition_is_distinct_even_if_title_unchanged(self):
        result=m.classify(self.source,[self.row(자치법규일련번호='200')],'2026-10-18')
        self.assertEqual(result['state'],'newer_current_version');self.assertEqual(result['currentLawId'],'200')
    def test_same_name_in_another_jurisdiction_does_not_establish_currency(self):
        row=self.row(자치법규일련번호='200',자치법규ID='901',지자체기관명='다른 관할')
        self.assertEqual(m.classify(self.source,[row],'2026-10-18')['state'],'requires_current_law_lookup')
    def test_future_edition_and_ambiguous_matches_do_not_become_current(self):
        self.assertEqual(m.classify(self.source,[self.row(시행일자='20270101')],'2026-10-18')['state'],'future_or_undated_current_result')
        self.assertEqual(m.classify(self.source,[self.row(),self.row(자치법규일련번호='200')],'2026-10-18')['state'],'ambiguous_current_result')


if __name__=='__main__':unittest.main()
