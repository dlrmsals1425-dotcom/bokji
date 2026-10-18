"""Agency integration stays exact and never expands existing portal policies."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/file)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


prepare = module('agency_test_prepare', 'prepare-portal-reviews.py')
download = module('agency_test_download', 'download-law-form-files.py')
FID = 'agency-44250-36032'
ROW = json.loads((ROOT/'tests/fixtures/forms/agency-44250-36032-review.json').read_text(encoding='utf-8'))['rows'][0]
BYTES = (ROOT/ROW['originalPath']).read_bytes()
PROGRAM = {'id': ROW['programIds'][0], 'name': '화장장려금 지원', 'scope': 'sigungu',
           'region': {'sido': '44000', 'sigungu': '44250'}, 'url': ROW['programEvidenceUrl'], 'laws': [ROW['lawTitle']]}


class AgencyFormsTest(unittest.TestCase):
    def build(self, row=None, program=None):
        row = row or copy.deepcopy(ROW); program = program or copy.deepcopy(PROGRAM)
        with tempfile.TemporaryDirectory(prefix='agency-review-') as folder:
            file = Path(folder)/'review.json'; file.write_text(json.dumps({'rows': [row]}), encoding='utf-8')
            return prepare.build({program['id']: program}, [file])

    def test_actual_blank_original_passes_without_inventing_portal_annex(self):
        result = self.build(); form = result['forms'][FID]
        self.assertEqual(form['sourceKind'], 'agency')
        self.assertEqual(form['dateKind'], 'published')
        self.assertEqual(form['effectiveDate'], '2026-05-12')
        self.assertEqual(form['lawUrl'], ROW['lawEvidenceUrl'])
        self.assertEqual((form['annexId'], form['annexNumber']), ('', ''))
        self.assertEqual(result['auditedRoles'][FID]['sectionsRead'], ['BodyText/Section0'])
        download.agency.verify_original(FID, BYTES, download.inspect_document(BYTES))

    def test_source_identity_and_sha_cannot_be_swapped(self):
        for key, value in [('formId', 'agency-44250-999'), ('sourceUrl', ROW['sourceUrl']+'&other=1'),
                           ('finalUrl', 'https://example.org/file.hwp'), ('sha256', '0'*64), ('bytes', 1),
                           ('attachmentId', '999'), ('annexId', '17575933'), ('annexNumber', '1'),
                           ('lawId', '999'), ('publishedAt', '2026-01-01'), ('sourceKind', 'ordin')]:
            with self.subTest(key=key):
                row = copy.deepcopy(ROW); row[key] = value
                with self.assertRaises(ValueError):self.build(row)

    def test_exact_program_and_jurisdiction_are_required(self):
        for change in ['city', 'program', 'url', 'scope', 'condition']:
            row = copy.deepcopy(ROW); p = copy.deepcopy(PROGRAM)
            if change == 'city':p['region']['sigungu'] = '44230'
            elif change == 'program':p['id'] = 'g44250.bokjiro-WLF00000000'; row['programIds'] = [p['id']]
            elif change == 'url':p['url'] = 'https://www.bokjiro.go.kr/'
            elif change == 'scope':row['scopeBasis'] = 'provincial-law-reference'
            else:row['condition'] = '모든 장례 신청 가능'
            with self.subTest(change=change), self.assertRaises(ValueError):self.build(row, p)

    def test_full_body_actor_and_selected_parts_are_mandatory(self):
        for key, value in [('fullBodyReviewed', False), ('sectionsRead', []), ('selectedParts', []),
                           ('applicant', '시청 담당자'), ('roleBasis', ''), ('role', 'administrative'),
                           ('reviewedParts', [{'number': '2', 'title': '지급대장', 'use': 'main', 'author': '공무원'}]),
                           ('lawCurrentCheckedAt', '2025-01-01')]:
            row = copy.deepcopy(ROW); row[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):self.build(row)

    def test_path_escape_is_rejected_before_reading(self):
        for target in ['../outside.hwp', str((ROOT.parent/'outside.hwp').resolve()), 'tests/fixtures/forms/../outside.hwp']:
            row = copy.deepcopy(ROW); row['originalPath'] = target
            with self.assertRaisesRegex(ValueError, 'path_escape'):self.build(row)

    def test_public_attachment_identifiers_do_not_open_credential_urls(self):
        self.assertTrue(download.agency.safe_url('https://public.or.kr/file?key=123&fileKey=public-file&atchFileId=FILE_123'))
        for value in ['https://user:pass@public.or.kr/file', 'https://public.or.kr/file?serviceKey=secret',
                      'https://public.or.kr/file?apiKey=secret', 'https://public.or.kr/file?access_token=secret',
                      'https://public.or.kr/file?Authorization=secret', 'https://public.or.kr/file?session=secret',
                      'https://public.or.kr/file?key=secret', 'https://public.or.kr/file?%2561piKey=secret']:
            self.assertFalse(download.agency.safe_url(value))
        self.assertFalse(download.official_download(ROW['sourceUrl']))
        self.assertTrue(download.official_download('https://www.law.go.kr/LSW/flDownload.do?flSeq=123'))
        with self.assertRaisesRegex(ValueError, 'not_public_law_download'):download.Download(0, 1).get(ROW['sourceUrl'])

    def response(self, url, status=200, location=None, data=BYTES):
        response = Mock(); response.url = url; response.status_code = status
        response.headers = {'Location': location} if location else {}
        response.iter_content.return_value = [data]
        response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
        return response

    def test_registered_get_checks_wire_final_url_and_actual_bytes(self):
        with patch.object(download.requests, 'get', return_value=self.response(ROW['sourceUrl'])) as get:
            self.assertEqual(download.Download(0, 1).get_agency(FID), BYTES)
            self.assertFalse(get.call_args.kwargs['allow_redirects'])
        for response in [self.response(ROW['sourceUrl'], data=BYTES+b'changed'),
                         self.response(ROW['sourceUrl']+'&changed=1'),
                         self.response(ROW['sourceUrl'], 302, 'https://example.org/file.hwp')]:
            with patch.object(download.requests, 'get', return_value=response) as get, self.assertRaises(ValueError):
                download.Download(0, 1).get_agency(FID)
            self.assertEqual(get.call_count, 1)

    def test_only_registered_final_redirect_is_followed(self):
        e = copy.deepcopy(download.agency.REGISTRY[FID]); e['finalUrl'] = e['sourceUrl']+'&delivery=1'
        with patch.dict(download.agency.REGISTRY, {FID: e}), patch.object(download.requests, 'get', side_effect=[
                self.response(e['sourceUrl'], 302, e['finalUrl']), self.response(e['finalUrl'])]) as get:
            self.assertEqual(download.Download(0, 1).get_agency(FID), BYTES)
            self.assertEqual(get.call_count, 2)

    def test_registry_still_rejects_credentials_and_requires_delegation_authority(self):
        for changes in [{'sourceUrl': ROW['sourceUrl']+'&session=secret'},
                        {'authorityKind': 'delegated'}, {'authorityEvidenceNote': ''}]:
            e = copy.deepcopy(download.agency.REGISTRY[FID]); e.update(changes)
            with patch.dict(download.agency.REGISTRY, {FID: e}), self.assertRaises(ValueError):
                download.agency.registry_entry(FID)

    def test_unknown_public_agency_id_never_triggers_network(self):
        with patch.object(download.requests, 'get') as get, self.assertRaises(ValueError):
            download.Download(0, 1).get_agency('agency-44250-999')
        get.assert_not_called()

    def test_fixed_path_attachment_has_one_exact_identifier_and_no_decoded_escape(self):
        e = copy.deepcopy(download.agency.REGISTRY[FID])
        e['sourceUrl'] = e['finalUrl'] = 'https://public.or.kr/userNew/custom/SP/%EC%8B%A0%EC%B2%AD.hwp'
        e['attachmentIdentifier'] = {'path': '/userNew/custom/SP/%EC%8B%A0%EC%B2%AD.hwp'}
        e['authorityKind'] = 'delegated'
        with patch.dict(download.agency.REGISTRY, {FID: e}):
            self.assertEqual(download.agency.registry_entry(FID)['sourceUrl'], e['sourceUrl'])
            e['attachmentIdentifier']['queryParam'] = 'file_id'
            with self.assertRaises(ValueError):download.agency.registry_entry(FID)
        for path in ['/a/../b.hwp', '/a/%2e%2e/b.hwp', '/a/%252e%252e/b.hwp', '/a/%5c../b.hwp']:
            self.assertFalse(download.agency.safe_url('https://public.or.kr'+path))


if __name__ == '__main__':unittest.main()
