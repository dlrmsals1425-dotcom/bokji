"""Reconcile every fixed-scope original with source reviews and actual publication.

Queue construction and law downloads never count as completed semantic reviews.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DISPOSITIONS={'approved','non_applicant','obsolete','no_matching_site_program','covered_by_existing',
              'excluded','official_replacement_found','needs_official_readable_original','requires_external_confirmation'}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def report_rows(report):
    for key in ('items','forms','rows'):
        if key in report:
            value=report[key]
            return list(value.values()) if isinstance(value,dict) else value
    return []


def review_paths(root):
    directory=root/'pipeline/forms/reviews'
    return sorted(set([
        *directory.glob('unmatched-starter*-dispositions.json'),
        *directory.glob('unmatched-dispositions-round*.json'),
        *directory.glob('unmatched-nonstandard-dispositions.json'),
        *(root/'logs/forms-completion').glob('starter*-dispositions.json'),
        *(root/'logs/forms-completion/reviews').glob('*-dispositions.json'),
        root/'logs/forms-completion/nonstandard/report.json',
    ]))


def reconcile(scope,reports,published):
    originals={row['formId']:row for row in scope['forms']}
    if len(originals)!=len(scope['forms']):raise ValueError('Duplicate original in fixed scope')
    reviewed={};extras=[]
    for source,report in reports:
        for row in report_rows(report):
            fid=row.get('formId') or row.get('scopeId')
            if fid not in originals:
                if fid:extras.append({'formId':fid,'report':source})
                continue
            disposition=row.get('disposition','pending')
            if disposition=='pending':continue
            if disposition not in DISPOSITIONS:raise ValueError('Unknown review disposition: '+fid+'/'+str(disposition))
            if row.get('sha256')!=originals[fid]['sha256']:raise ValueError('Review original SHA mismatch: '+fid)
            reason=row.get('reason') or row.get('evidenceNote')
            if not isinstance(reason,str) or len(reason.strip())<10:raise ValueError('Review lacks individual reason: '+fid)
            if fid in reviewed and reviewed[fid]['disposition']!=disposition:raise ValueError('Conflicting original dispositions: '+fid)
            reviewed[fid]={'disposition':disposition,'reason':reason,'report':source,
                'fullBodyReviewed':bool(row.get('fullBodyReviewed',row.get('completeBodyRead',False))),
                'evidenceUrl':row.get('evidenceUrl'),'relatedProgramIds':row.get('relatedProgramIds',[])}
    rows=[]
    for fid,original in originals.items():
        row={key:original[key] for key in ('formId','sha256','lawId','title','format')}
        review=reviewed.get(fid)
        if fid in published:
            if published[fid]['sha256']!=original['sha256']:raise ValueError('Published original SHA mismatch: '+fid)
            state='linked'
            row['programIds']=published[fid]['programIds']
        elif review:
            value=review['disposition']
            state=('approved_pending_publication' if value=='approved' else
                   'requires_external_confirmation' if value in ('needs_official_readable_original','requires_external_confirmation') else
                   'replacement_available' if value=='official_replacement_found' else
                   'covered_by_existing' if value=='covered_by_existing' else 'reviewed_not_linked')
        else:state='pending'
        row['state']=state
        if review:row['review']=review
        rows.append(row)
    counts=Counter(row['state'] for row in rows)
    return {'schema':1,'generatedAt':datetime.now(timezone.utc).isoformat(),
        'baselineCommit':scope['baselineCommit'],'scopeForms':len(rows),
        'note':'Every fixed-scope original remains visible. Linked counts require a real published file; source retrieval and queue creation do not resolve a review.',
        'fullScopeMatchingComplete':counts['pending']==0 and counts['approved_pending_publication']==0 and counts['requires_external_confirmation']==0 and counts['replacement_available']==0,
        'counts':dict(counts),'sourceReviews':len(reviewed),'additionalReviewedIds':extras,'forms':rows}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope',type=Path,default=ROOT/'pipeline/forms/reviews/unmatched-originals-scope.json')
    parser.add_argument('--output',type=Path,default=ROOT/'pipeline/forms/reviews/unmatched-originals-progress.json')
    args=parser.parse_args()
    reports=[]
    for path in review_paths(ROOT):
        if path.exists():reports.append((path.relative_to(ROOT).as_posix(),read(path)))
    programs=defaultdict(set)
    for path in (ROOT/'public/forms/v1/programs').glob('*.json'):
        for program in read(path)['programs']:
            for link in program['links']:programs[link['formId']].add(program['id'])
    published={}
    for fid,form in read(ROOT/'public/forms/v1/catalog.json')['forms'].items():
        if not form.get('file') or not programs[fid]:continue
        path=ROOT/'public'/form['file']['hwp'].lstrip('/')
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=form['file']['sha256']:raise ValueError('Published file absent or changed: '+fid)
        published[fid]={'sha256':form['file']['sha256'],'programIds':sorted(programs[fid])}
    result=reconcile(read(args.scope),reports,published)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    print(json.dumps({'scopeForms':result['scopeForms'],'counts':result['counts'],'fullScopeMatchingComplete':result['fullScopeMatchingComplete']},ensure_ascii=False))


if __name__=='__main__':main()
