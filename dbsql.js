/* DB 적재용 SQL 생성 (Oracle Spatial / PostGIS) + 표준 컬럼명 제안 */
(function (g) {
  'use strict';
  const C = g.ShpCore;

  // ───────── 공공데이터 공통표준용어 스타일 약어 사전 (긴 단어 우선 매칭) ─────────
  const TERMS = {
    '시설물': 'FCLTY', '시설': 'FCLTY', '관리번호': 'MNG_NO', '관리': 'MNG', '기관': 'INST', '기관명': 'INST_NM', '담당자': 'PIC', '담당': 'PIC',
    '명칭': 'NM', '이름': 'NM', '성명': 'FLNM', '명': 'NM', '코드': 'CD', '구분': 'SE', '유형': 'TY', '종류': 'KND', '분류': 'CL', '등급': 'GRD',
    '번호': 'NO', '일련번호': 'SN', '순번': 'SN', '일자': 'YMD', '날짜': 'YMD', '일시': 'DT', '연도': 'YR', '년도': 'YR', '월': 'MM', '시간': 'TM',
    '등록일': 'REG_YMD', '등록': 'REG', '수정일': 'MDFCN_YMD', '수정': 'MDFCN', '변경': 'CHG', '생성': 'CRT', '삭제': 'DEL', '여부': 'YN', '사용': 'USE',
    '주소': 'ADDR', '도로명주소': 'ROAD_NM_ADDR', '도로명': 'ROAD_NM', '지번주소': 'LOTNO_ADDR', '지번': 'LOTNO', '우편번호': 'ZIP', '상세': 'DTL',
    '소재지': 'LCTN', '위치': 'LCTN', '시도': 'CTPV', '시군구': 'SGG', '읍면동': 'EMD', '법정동': 'STDG', '행정동': 'ADMDONG', '리': 'LI', '동': 'DONG',
    '위도': 'LAT', '경도': 'LOT', 'X좌표': 'XCRD', 'Y좌표': 'YCRD', '좌표': 'CRD', '고도': 'ALT', '표고': 'ELEV', '높이': 'HGT', '길이': 'LEN', '연장': 'EXTN',
    '폭': 'BT', '너비': 'BT', '면적': 'AREA', '체적': 'VLM', '부피': 'VLM', '깊이': 'DPTH', '두께': 'THK', '직경': 'DIA', '구경': 'CLBR', '경사도': 'SLP_DGR',
    '경사': 'SLP', '방향': 'DRCTN', '각도': 'ANGL', '거리': 'DIST', '수량': 'QTY', '개수': 'CNT', '건수': 'CNT', '수': 'CNT', '금액': 'AMT', '비용': 'CST',
    '비율': 'RT', '율': 'RT', '점수': 'SCR', '값': 'VL', '내용': 'CN', '비고': 'RMRK', '설명': 'EXPLN', '사유': 'RSN', '결과': 'RSLT', '상태': 'STTS',
    '점검': 'INSP', '조사': 'EXMN', '측정': 'MSRMT', '보수': 'RPR', '보강': 'RINF', '정비': 'MAINT', '설치': 'INSTL', '준공': 'CMCN', '착공': 'BGNCN',
    '공사': 'CNST', '사업': 'BIZ', '계획': 'PLAN', '허가': 'PRMSN', '신고': 'DCLR', '지정': 'DSGN', '해제': 'RLS', '위험': 'RISK', '재해': 'DSSTR',
    '급경사지': 'STP_SLP', '산사태': 'LNDSLD', '낙석': 'RCKFLL', '옹벽': 'RTWL', '사면': 'SLOPE', '절토': 'CUT', '성토': 'FILL', '배수': 'DRNG',
    '도로': 'ROAD', '하천': 'RVR', '교량': 'BRDG', '터널': 'TNL', '건물': 'BLDG', '건축물': 'BLDG', '토지': 'LAND', '필지': 'PRCL', '지목': 'LDCG',
    '용도': 'USG', '지역': 'RGN', '지구': 'DSTRC', '구역': 'ZONE', '산림': 'FRST', '임상': 'FRTP', '수종': 'TRSP', '영급': 'AGCLS', '경급': 'DMCLS',
    '소유자': 'OWNR', '소유': 'OWN', '전화번호': 'TELNO', '전화': 'TELNO', '이메일': 'EML', '홈페이지': 'HMPG', '기준': 'CRTR', '최대': 'MAX', '최소': 'MIN',
    '평균': 'AVG', '합계': 'SUM', '총': 'TOT', '시작': 'BGNG', '종료': 'END', '시점': 'BPNT', '종점': 'EPNT', '도엽': 'MAP_SHT', '레이어': 'LYR',
  };
  const TERM_KEYS = Object.keys(TERMS).sort((a, b) => b.length - a.length);

  // 반환 {name, full(모든 토큰 매칭 여부)}
  function suggestColumnName(korean) {
    const src = String(korean).replace(/[\s()\[\]·.\-]/g, '');
    if (!/[가-힣]/.test(src)) return { name: src.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), full: true };
    const parts = []; let i = 0, full = true;
    while (i < src.length) {
      const ch = src[i];
      if (/[A-Za-z0-9_]/.test(ch)) { let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++; parts.push(src.slice(i, j).toUpperCase()); i = j; continue; }
      const k = TERM_KEYS.find(t => src.startsWith(t, i));
      if (k) { parts.push(TERMS[k]); i += k.length; } else { full = false; i++; }
    }
    let name = parts.join('_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (!name || !/^[A-Z]/.test(name)) name = 'COL_' + (name || 'X');
    return { name, full };
  }

  // ───────── DB 문자셋 기준 길이 ─────────
  // ORA_UTF8: AL32UTF8 (BYTE 단위, 한글 3바이트) / ORA_949: KO16MSWIN949 (한글 2바이트) / PG: PostgreSQL varchar(n)=문자 수
  function dbLength(features, field, target) {
    let max = 0;
    for (const f of features) {
      const v = f.properties ? f.properties[field.src] : null;
      if (v === null || v === undefined || v === '') continue;
      const s = v instanceof Date ? C.fmtDate(v) : String(v);
      const n = target === 'PG' ? [...s].length : C.byteLen(s, target === 'ORA_949' ? 'EUC-KR' : 'UTF-8');
      if (n > max) max = n;
    }
    return max;
  }

  const sqlStr = s => `'${String(s).replace(/'/g, "''")}'`;
  // Oracle은 SQL 리터럴 4000바이트 제한 → TO_CLOB 조각으로 연결
  function oraClob(s) {
    if (s.length <= 3000) return sqlStr(s);
    const parts = [];
    for (let i = 0; i < s.length; i += 3000) parts.push(`TO_CLOB(${sqlStr(s.slice(i, i + 3000))})`);
    return parts.join(' || ');
  }

  function colType(f, target, len) {
    if (f.type === 'N' || f.type === 'F') {
      if (target === 'PG') return f.decimals ? `numeric(${f.length},${f.decimals})` : (f.length <= 9 ? 'integer' : `numeric(${f.length})`);
      return `NUMBER(${f.length}${f.decimals ? ',' + f.decimals : ''})`;
    }
    if (f.type === 'D') return target === 'PG' ? 'date' : 'DATE';
    if (f.type === 'L') return target === 'PG' ? 'boolean' : 'CHAR(1)';
    return target === 'PG' ? `varchar(${len})` : `VARCHAR2(${len} BYTE)`;
  }

  // opts: {table, fields(사용 컬럼), srid('EPSG:5186'), gtype(1/3/5/8), target('ORA_UTF8'|'ORA_949'|'PG'), features(변환된)}
  function ddl(opts) {
    const { fields, srid, gtype, target, features } = opts;
    const pg = target === 'PG';
    const t = pg ? opts.table.toLowerCase() : opts.table.toUpperCase();
    const num = srid.split(':')[1];
    const lens = fields.map(f => f.type === 'C' ? Math.max(1, dbLength(features, f, target), target === 'PG' ? 1 : 1) : 0);
    const cname = f => pg ? f.newName.toLowerCase() : f.newName.toUpperCase();
    const cols = fields.map((f, i) => `  ${cname(f)} ${colType(f, target, lens[i])}`);
    const comments = fields.filter(f => f.comment || /[^\x00-\x7F]/.test(f.src)).map(f =>
      `COMMENT ON COLUMN ${t}.${cname(f)} IS ${sqlStr(f.comment || f.src)};`);
    const charsetNote = { ORA_UTF8: 'AL32UTF8 기준 (한글 3바이트)', ORA_949: 'KO16MSWIN949 기준 (한글 2바이트)', PG: 'PostgreSQL varchar(n) = 문자 수 기준' }[target];
    if (pg) {
      const gt = { 1: 'Point', 8: 'MultiPoint', 3: 'MultiLineString', 5: 'MultiPolygon' }[gtype] || 'Geometry';
      return `-- 문자 컬럼 길이: 실제 데이터 최대값, ${charsetNote}
CREATE TABLE ${t} (
  objectid serial PRIMARY KEY,
${cols.join(',\n')}${cols.length ? ',' : ''}
  geom geometry(${gt}, ${num})
);
CREATE INDEX ${t.slice(0, 50)}_geom_idx ON ${t} USING GIST (geom);
${comments.join('\n')}
`;
    }
    const geo = C.byCode[srid] && C.byCode[srid].geographic;
    const dim = geo
      ? `MDSYS.SDO_DIM_ELEMENT('X', 124, 132, 0.000000005), MDSYS.SDO_DIM_ELEMENT('Y', 33, 39, 0.000000005)`
      : `MDSYS.SDO_DIM_ELEMENT('X', -10000000, 10000000, 0.001), MDSYS.SDO_DIM_ELEMENT('Y', -10000000, 10000000, 0.001)`;
    const gt = { 1: 'POINT', 8: 'MULTIPOINT', 3: 'LINE', 5: 'POLYGON' }[gtype] || 'POLYGON';
    return `-- 문자 컬럼 길이: 실제 데이터 최대값, ${charsetNote}
CREATE TABLE ${t} (
  OBJECTID NUMBER(10) NOT NULL,
${cols.join(',\n')}${cols.length ? ',' : ''}
  GEOM SDO_GEOMETRY,
  CONSTRAINT PK_${t.slice(0, 25)} PRIMARY KEY (OBJECTID)
);

INSERT INTO USER_SDO_GEOM_METADATA (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('${t}', 'GEOM', MDSYS.SDO_DIM_ARRAY(${dim}), ${num});

CREATE INDEX SIDX_${t.slice(0, 24)} ON ${t}(GEOM)
  INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2 PARAMETERS ('layer_gtype=${gt}');
${comments.length ? '\n' + comments.join('\n') + '\n' : ''}`;
  }

  function valueSql(v, f, pg) {
    if (v === null || v === undefined || v === '') return 'NULL';
    if (f.type === 'N' || f.type === 'F') { const n = Number(v); return isFinite(n) ? String(f.decimals ? +n.toFixed(f.decimals) : Math.round(n)) : 'NULL'; }
    if (f.type === 'D') {
      const d = v instanceof Date ? v : new Date(String(v).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
      if (isNaN(d)) return 'NULL';
      return pg ? `DATE '${C.fmtDate(d)}'` : `TO_DATE('${C.fmtDate(d)}', 'YYYY-MM-DD')`;
    }
    if (f.type === 'L') { const t = v === true || /^[TtYy1]/.test(String(v)); return pg ? (t ? 'TRUE' : 'FALSE') : (t ? "'T'" : "'F'"); }
    return sqlStr(v instanceof Date ? C.fmtDate(v) : v);
  }

  function geomSql(geom, num, pg, digits) {
    if (!geom) return 'NULL';
    if (pg) {
      const wkt = C.toWkt(geom, digits);
      const multi = /^(LINESTRING|POLYGON)/.test(wkt);
      return multi ? `ST_Multi(ST_GeomFromText(${sqlStr(wkt)}, ${num}))` : `ST_GeomFromText(${sqlStr(wkt)}, ${num})`;
    }
    if (geom.type === 'Point') {
      const [x, y] = geom.coordinates;
      return `SDO_GEOMETRY(2001, ${num}, SDO_POINT_TYPE(${+x.toFixed(digits)}, ${+y.toFixed(digits)}, NULL), NULL, NULL)`;
    }
    return `SDO_GEOMETRY(${oraClob(C.toWkt(geom, digits))}, ${num})`;
  }

  // INSERT 문 전체 (문자열)
  function inserts(opts) {
    const { fields, srid, target, features } = opts;
    const pg = target === 'PG';
    const t = pg ? opts.table.toLowerCase() : opts.table.toUpperCase();
    const num = srid.split(':')[1];
    const digits = C.byCode[srid] && C.byCode[srid].geographic ? 8 : 3;
    const cname = f => pg ? f.newName.toLowerCase() : f.newName.toUpperCase();
    const colList = (pg ? [] : ['OBJECTID']).concat(fields.map(cname)).concat([pg ? 'geom' : 'GEOM']).join(', ');
    const out = [pg ? `-- PostGIS INSERT (${features.length}건)\nBEGIN;` : `-- Oracle INSERT (${features.length}건)\nSET DEFINE OFF;`];
    features.forEach((f, i) => {
      const vals = (pg ? [] : [String(i + 1)]).concat(fields.map(fd => valueSql(f.properties ? f.properties[fd.src] : null, fd, pg))).concat([geomSql(f.geometry, num, pg, digits)]);
      out.push(`INSERT INTO ${t} (${colList}) VALUES (${vals.join(', ')});`);
    });
    out.push('COMMIT;');
    return out.join('\n') + '\n';
  }

  g.ShpDb = { suggestColumnName, dbLength, ddl, inserts, TERMS };
})(typeof window !== 'undefined' ? window : globalThis);
