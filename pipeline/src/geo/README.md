# 시·군·구 경계 (현위치 예시용)

`public/geo/sgg-20260701.json` 만드는 법 (원본은 저장소에 넣지 않음).

- 원본: [vuski/admdongkor](https://github.com/vuski/admdongkor) `ver20260701/HangJeongDong_ver20260701.geojson` (34.6MB)
  - 통계청 SGIS 행정동 경계 기반, 2026-07-01 개편(전남광주통합특별시, 인천 제물포구·영종구·서해구·검단구) 반영
  - 라이선스: 데이터 CC BY 4.0 + 공공누리 제1유형(출처 표시) — 앱의 '데이터·판정 기준' 페이지에 출처 표시
- 도구: mapshaper 0.6 (저장소 의존성에 넣지 않고 따로 설치해 씀)

```bash
mapshaper -i HangJeongDong_ver20260701.geojson -each 'sgg5=adm_cd2.slice(0,5)' -dissolve sgg5 \
  -simplify 3% keep-shapes -o sgg-3.json format=geojson precision=0.0001
```

그다음 `sgg5`를 `public/bundles/v1/regions.json`의 시·군·구 코드로 맞춘다 (일반구 41111 등 → 41110, 앞 4자리 + 0).
속성은 `c`(시·군·구 코드) 하나만 남긴다.

점검 (2026-10-10): 행정동 3,558곳의 안쪽 점으로 판정 → 3,555곳 일치, 3곳은 해안·섬이라 어느 경계에도 안 걸림(가장 가까운 시·군·구로 보정), 틀린 곳 0.
크기 약 320KB (gzip 약 75KB) — '현재 위치로' 단추를 누를 때만 내려받는다.
