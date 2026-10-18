import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('progress',ROOT/'scripts/update-unmatched-form-progress.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class ProgressTest(unittest.TestCase):
    def scope(self):
        return {'baselineCommit':'base','forms':[{'formId':f'ordin-{i}','sha256':str(i)*64,'lawId':'10','title':'신청서','format':'hwp'} for i in range(1,4)]}
    def test_download_queue_and_pending_reviews_do_not_become_completed(self):
        result=m.reconcile(self.scope(),[('queue',{'items':[{'formId':'ordin-1','disposition':'pending'}]})],{})
        self.assertEqual(result['counts'],{'pending':3});self.assertFalse(result['fullScopeMatchingComplete'])
    def test_approved_requires_a_published_file_and_source_reasons_remain_visible(self):
        rows=[{'formId':'ordin-1','sha256':'1'*64,'disposition':'approved','reason':'해당 조문과 주민 신청서 전체를 읽고 일치함을 확인했다.','fullBodyReviewed':True},
              {'formId':'ordin-2','sha256':'2'*64,'disposition':'non_applicant','reason':'공무원이 보관하는 지급대장으로 대상 주민 신청서가 아니다.'}]
        result=m.reconcile(self.scope(),[('review',{'items':rows})],{})
        self.assertEqual(result['counts'],{'approved_pending_publication':1,'reviewed_not_linked':1,'pending':1})
        result=m.reconcile(self.scope(),[('review',{'items':rows})],{'ordin-1':{'sha256':'1'*64,'programIds':['p1']}})
        self.assertEqual(result['forms'][0]['state'],'linked');self.assertFalse(result['fullScopeMatchingComplete'])
    def test_changed_original_or_a_bare_rejection_does_not_clear_pending(self):
        row={'formId':'ordin-1','sha256':'9'*64,'disposition':'non_applicant','reason':'다른 원본의 조사 결과를 같은 ID로 덮어쓰지 않는다.'}
        with self.assertRaises(ValueError):m.reconcile(self.scope(),[('review',{'items':[row]})],{})
        with self.assertRaises(ValueError):m.reconcile(self.scope(),[('review',{'items':[{**row,'sha256':'1'*64,'reason':''}]})],{})


if __name__=='__main__':unittest.main()
