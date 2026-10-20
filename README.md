# SHP 좌표 변환기

SHP·CSV·엑셀 좌표 데이터를 브라우저에서 읽어 좌표계를 검증·변환하고, DB 적재용 파일을 만드는 정적 웹앱.

- 좌표계 자동 인식·오류 진단 (PRJ 대조, 육지 판정, X/Y 뒤바뀜, 행정구역 속성 대조)
- 출력: SHP / GeoJSON / KML / CSV / Oracle Spatial SQL / PostGIS SQL
- 컬럼 편집 (표준 약어 제안, DBF 10바이트 제한, DB 문자셋 기준 길이)
- 일괄 변환, 프리셋(브라우저 저장), Supabase 저장소 연동
- 배경지도: VWorld(일반/위성/하이브리드), OSM

행정구역 경계: southkorea/southkorea-maps (KOSTAT 2013) 시군구 경계를 간략화해 사용 (data/sgg.json).
