# 복지 신청서 원문 검토와 반영

원본을 내려받은 수, 내용을 검토한 수, 실제 혜택에 연결한 수는 다르다. 파일을 수집하거나 이름이 비슷한 후보를 찾은 것만으로 신청서 연결을 승인하지 않는다.

- 고정 검토 범위: `pipeline/forms/reviews/unmatched-originals-scope.json`의 기존 미연결 원본 4,006개. 기준 커밋과 각 원본 SHA256을 보존한다.
- 현재 상태: `pipeline/forms/reviews/unmatched-originals-progress.json`. `linked`는 실제 공개 파일과 혜택 연결을 모두 확인한 경우이고, `approved_pending_publication`은 검토만 끝난 상태다. `pending`은 아직 판정하지 않은 자료다.
- 확정 검토: `pipeline/forms/reviews/municipal-reviewed-round*.json` 및 `unmatched-dispositions-round*.json`. 사용할 서식 부분, 작성자, 사업별 조건과 연결하지 않은 이유를 남긴다.
- 원본 출처: `pipeline/forms/source-original-law-audit.json`. `state: read`는 공식 응답을 수집했다는 의미다. `articleContentState: missing`이면 응답에 조문이 없어 다른 공식 경로로 보완해야 한다. 출처 수집 완료가 의미상 매칭 완료를 뜻하지 않는다.
- 현행판 대조: `scripts/audit-source-law-currency.py`는 공식 현행 목록(`nw=1`)과 출처 판본을 비교한다. 다른 현행판이 있으면 그 판본의 실제 별표와 원본 flSeq도 대조한다. 검색 실패·시행일 미확정·판본 변경을 자동으로 ‘서식 없음’이나 새 연결 승인으로 바꾸지 않는다.
- 실제 다운로드: `pipeline/forms/originals/`와 `public/forms/files/`. 원문 바이트와 확장자를 보존하며, 파일명에 SHA256 앞 12자를 넣는다. 공식 원문은 Git에서도 줄바꿈을 바꾸지 않는다.

제목이 ‘별지’이거나 기관용 신청서로 보이더라도 전체 본문을 확인한다. 주민 신청서가 함께 묶여 있으면 해당 부분만 안내한다. 같은 원본에서 혜택마다 다른 부분을 사용하면 `FormLink.displayTitle`과 조건을 각각 보존한다. 위임장은 법규가 정한 대리신청 조건에서만 제공한다. 기관 전용 청구는 작성자와 단계를 명시하고 개인 신청서로 안내하지 않는다.

시군 전용 양식을 광역 사업에 연결하려면 해당 사업의 공식 접수 경로와 시군 조례·원본이 일치해야 한다. `municipalApplicationReference`에 관할·정확한 사업 페이지·접수 근거·서식 근거를 남기고, 그 시군 주민의 방문 접수용으로 조건부 표시한다. 시군 양식을 광역 전체 주민용으로 확장하지 않는다.

## 검토한 묶음 반영

`scripts/import-completed-form-reviews.py team1-batch-001`처럼 확정된 묶음을 지정한다. 이 단계는 검토 대기열에서 승인을 만들어 내지 않는다. 지정된 원본이 모두 개별 판정됐는지, 승인한 각 사업 쌍과 원문 SHA256·법규·별표·flSeq가 일치하는지 확인한 뒤 기존 공개 전 검증을 실행한다. 초안이나 미완료 묶음은 반영하지 않는다.

검토 입력과 전체 조문 캐시는 `logs/forms-completion/`에 두며 Git에 올리지 않는다. 확정된 검토와 원문을 반영한 뒤에는 다음 순서로 공개 자료를 다시 만든다.

```powershell
python -B -X utf8 scripts/prepare-portal-reviews.py
python -B -X utf8 scripts/download-law-form-files.py --scope approved --workers 4 --interval .6
python -B -X utf8 scripts/build-form-census.py
npm run forms:build
python -B -X utf8 scripts/build-law-download-index.py
python -B -X utf8 scripts/update-unmatched-form-progress.py
```

각 명령이 실패하면 다음 단계로 넘어가지 않는다. 원래 복지 자료인 `public/bundles/v1`을 재생성하는 `npm run pipeline`은 이 작업에 사용하지 않는다. 새 체크아웃에서도 확정된 판정은 버전 관리되는 검토 파일로 다시 집계할 수 있다.

공개 전에는 신청서·관할·조건 검증, 원본 해시, 실제 HTTP 다운로드와 모바일 표시를 확인한다. `vercel.json`의 자동 배포 차단을 유지한다. 브랜치에 푸시하는 작업과 서비스 배포는 별개다.
