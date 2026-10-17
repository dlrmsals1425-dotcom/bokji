"""Inventory actual saved originals and separately count published benefit links.

The local archive index includes full local paths. The versioned audit excludes
local paths and extracted document text. Neither inventory approves a match.
"""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive-dir', type=Path, default=Path.home()/'goyang-welfare-forms/law-portal-attachments')
    args = parser.parse_args()
    archive = args.archive_dir.resolve()
    details = {}
    for path in (ROOT/'public/bundles/v1/details').glob('*.json'):
        details.update(read(path))
    published = defaultdict(set)
    for path in (ROOT/'public/forms/v1/programs').glob('*.json'):
        for program in read(path)['programs']:
            for link in program['links']:
                published[link['formId']].add(program['id'])
    catalog = read(ROOT/'public/forms/v1/catalog.json')['forms']
    records, issues, unavailable = [], [], []
    for path in sorted((ROOT/'logs/law-downloads').glob('*.json')):
        if not re.fullmatch(r'(?:ordin|law|rule)-\d+\.json', path.name):
            continue
        record = read(path)
        if record.get('state') == 'unavailable':
            unavailable.append({key: record.get(key) for key in ('formId','lawTitle','title','sourceUrl','reason')})
        if record.get('state') != 'stored':
            continue
        local = Path(record.get('localPath', '')).resolve()
        if not local.is_relative_to(archive) or not local.is_file():
            issues.append({'id': record.get('formId'), 'reason': 'missing_archive_original'})
            continue
        data = local.read_bytes()
        if len(data) != record.get('bytes') or hashlib.sha256(data).hexdigest() != record.get('sha256'):
            issues.append({'id': record.get('formId'), 'reason': 'archive_original_changed'})
            continue
        fid = record['formId']
        public_file = catalog.get(fid, {}).get('file', {}).get('hwp')
        if published[fid] and (not public_file or not (ROOT/'public'/public_file.lstrip('/')).is_file()):
            issues.append({'id': fid, 'reason': 'published_original_missing'})
            continue
        row = {key: record.get(key) for key in ('formId', 'lawId', 'lawTitle', 'title', 'regionCode', 'format', 'bytes', 'sha256', 'sourceUrl', 'downloadedAt', 'textScope')}
        if catalog.get(fid,{}).get('displayTitle'):row['displayTitle']=catalog[fid]['displayTitle']
        row['relativePath'] = local.relative_to(archive).as_posix()
        if record.get('sourceArchive'):
            source=record['sourceArchive'];container=Path(source['localPath']).resolve()
            if not container.is_relative_to(archive) or hashlib.sha256(container.read_bytes()).hexdigest()!=source['sha256']:
                raise ValueError('Source archive missing or changed: '+fid)
            row['sourceArchive']={key:source[key] for key in ('member','sha256','bytes')}
            row['sourceArchive']['relativePath']=container.relative_to(archive).as_posix()
        row['usableHangul'] = record.get('format') in ('hwp', 'hwpx') and record.get('textScope') == 'all_body_sections_or_pages'
        row['publishedPrograms'] = [{'id': pid, 'name': details.get(pid, {}).get('name', pid)} for pid in sorted(published[fid])]
        records.append(row)
    if issues:
        raise ValueError(json.dumps(issues, ensure_ascii=False))
    summary = {'savedOriginals': len(records), 'uniqueOriginalContents':len({row['sha256'] for row in records}),
               'formats': dict(sorted(Counter(row['format'] for row in records).items())),
               'readableHangulOriginals': sum(row['usableHangul'] for row in records),
               'publishedOriginals': sum(bool(row['publishedPrograms']) for row in records),
               'publishedFormats':dict(Counter(row['format'] for row in records if row['publishedPrograms'])),
               'publishedPrograms': len({p['id'] for row in records for p in row['publishedPrograms']}),
               'publishedAssociations': sum(len(row['publishedPrograms']) for row in records),
               'unavailableSourceAttachments': len(unavailable),
               'unpublishedOriginals': sum(not row['publishedPrograms'] for row in records)}
    inventory = {'schema': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
                 'scope': 'Actual downloaded originals; saved files are not automatically approved for a benefit.',
                 'summary': summary, 'forms': records, 'unavailable': unavailable}
    archive.mkdir(parents=True, exist_ok=True)
    (archive/'index.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    (ROOT/'pipeline/forms/download-audit.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    # A local, dependency-free directory lets the owner open the real files by
    # region/law/title without having to understand numeric source identifiers.
    payload = json.dumps(records, ensure_ascii=False).replace('<', '\\u003c')
    html = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>국가법령정보센터 서식 원본 목록</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#172d3e}input{font:inherit;width:100%;box-sizing:border-box;padding:14px;border:1px solid #7b8994;border-radius:8px}article{padding:22px 0;border-bottom:1px solid #d9e0e4}h2{font-size:20px;margin:0}p{margin:6px 0}a{color:#075e88}small{color:#526470}button{font:inherit;padding:10px 24px;margin:20px 0}label{font-weight:600}</style>
<h1>조례·법령 서식 원본</h1><p>국가법령정보센터에서 내려받은 원본입니다. “혜택에 연결” 표시는 원본과 신청 목적을 확인해 페이지에 첨부한 파일에만 표시합니다.</p>
<label for="search">지역·조례·신청서·혜택 이름 찾기</label><input id="search" type="search" placeholder="예: 고양시 장수축하금"><p id="count" aria-live="polite"></p><main id="list"></main><button id="more">더 보기</button>
<script>const rows=DATA;const input=document.getElementById('search'),list=document.getElementById('list'),count=document.getElementById('count'),more=document.getElementById('more');let limit=100;
function render(){const terms=input.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);const found=rows.filter(r=>{const text=[r.lawTitle,r.title,r.displayTitle,...r.publishedPrograms.map(p=>p.name)].join(' ').toLowerCase();return terms.every(t=>text.includes(t));});count.textContent=found.length+'개 원본 · '+Math.min(limit,found.length)+'개 표시';list.replaceChildren();for(const r of found.slice(0,limit)){const a=document.createElement('article'),h=document.createElement('h2'),link=document.createElement('a'),p=document.createElement('p'),status=document.createElement('small');link.textContent=r.displayTitle||r.title||r.formId;link.href=r.relativePath.split('/').map(encodeURIComponent).join('/');link.setAttribute('download','');h.append(link);p.textContent=(r.lawTitle||'')+' · '+String(r.format).toUpperCase();status.textContent=r.publishedPrograms.length?'혜택에 연결: '+r.publishedPrograms.map(p=>p.name).join(' / '):'원본 보관 · 페이지 첨부 미확정';a.append(h,p,status);list.append(a);}more.hidden=limit>=found.length;}
input.addEventListener('input',()=>{limit=100;render();});more.addEventListener('click',()=>{limit+=100;render();});render();</script></html>'''.replace('DATA', payload)
    (archive/'index.html').write_text(html, encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
