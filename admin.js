/* 행정구역 경계 기반 위치 검증 (시군구 경계: KOSTAT 2013 기반, 간략화) */
(function (g) {
  'use strict';
  const C = g.ShpCore;

  // 시도 표기 정규화 → 짧은 키
  const SIDO_KEYS = [
    ['서울', /^서울(특별시|시)?$/], ['부산', /^부산(광역시|시)?$/], ['대구', /^대구(광역시|시)?$/], ['인천', /^인천(광역시|시)?$/], ['광주', /^광주(광역시)?$/],
    ['대전', /^대전(광역시|시)?$/], ['울산', /^울산(광역시|시)?$/], ['세종', /^세종(특별자치시|시)?$/], ['경기', /^경기(도)?$/], ['강원', /^강원(특별자치도|도)?$/],
    ['충북', /^(충북|충청북도)$/], ['충남', /^(충남|충청남도)$/], ['전북', /^(전북|전라북도|전북특별자치도)$/], ['전남', /^(전남|전라남도)$/],
    ['경북', /^(경북|경상북도)$/], ['경남', /^(경남|경상남도)$/], ['제주', /^제주(특별자치도|도)?$/],
  ];
  function sidoKey(token) {
    if (!token) return null;
    const t = token.replace(/\s/g, '');
    for (const [k, re] of SIDO_KEYS) if (re.test(t)) return k;
    return null;
  }
  const norm = s => String(s).replace(/[\s·()\-]/g, '');
  const stem = s => s.replace(/(특별자치시|특별자치도|특별시|광역시)$/, '').replace(/[시군]$/, '');

  let regions = null, loading = null;
  async function load(url = 'data/sgg.json') {
    if (regions) return regions;
    if (!loading) loading = (Array.isArray(url) ? Promise.resolve(url) : fetch(url).then(r => { if (!r.ok) throw new Error('경계 데이터를 불러오지 못했습니다'); return r.json(); })).then(list => {
      regions = list.map(o => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        o.p.forEach(poly => poly[0].forEach(([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }));
        const names = [o.n, ...(o.a || [])].map(norm);
        return { code: o.c, sido: o.s, sidoKey: sidoKey(o.s), name: o.n, names, polys: o.p, bbox: [minX, minY, maxX, maxY] };
      });
      C.setLandTest((lon, lat) => !!locate(lon, lat));
      return regions;
    });
    return loading;
  }
  function inPolygon(x, y, poly) {
    if (!C.inPoly(x, y, poly[0])) return false;
    for (let i = 1; i < poly.length; i++) if (C.inPoly(x, y, poly[i])) return false;
    return true;
  }
  function locate(lon, lat) {
    if (!regions) return null;
    for (const r of regions) {
      const b = r.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (r.polys.some(p => inPolygon(lon, lat, p))) return r;
    }
    return null;
  }

  // 값 하나를 {sido, sgg[]} 형태로 해석
  // 예: "서울특별시 중구 세종대로 110" / "경기도 수원시 장안구" / "중구" / "11140"(행안부 코드는 KOSTAT와 달라 앞 2자리만 사용)
  const CODE_SIDO = { '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주', '30': '대전', '31': '울산', '36': '세종',
    '41': '경기', '42': '강원', '51': '강원', '43': '충북', '44': '충남', '45': '전북', '52': '전북', '46': '전남', '47': '경북', '48': '경남', '50': '제주' };
  function parseAdmin(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{5}(\d{5})?$/.test(s)) { const k = CODE_SIDO[s.slice(0, 2)]; return k ? { sido: k, sgg: [] } : null; }
    const toks = s.split(/\s+/).slice(0, 4);
    let sido = sidoKey(toks[0]);
    const rest = sido ? toks.slice(1) : toks;
    const sgg = [];
    for (const t of rest) {
      const n = norm(t);
      if (/[시군구]$/.test(n) && n.length >= 2) sgg.push(n); else break;
    }
    if (!sido && !sgg.length) return null;
    return { sido, sgg };
  }
  function regionMatches(r, a) {
    if (!r) return { sido: false, sgg: false };
    const sidoOk = a.sido ? r.sidoKey === a.sido : null;
    let sggOk = null;
    if (a.sgg.length) {
      const joined = a.sgg.join('');
      sggOk = r.names.some(n => n === joined || n.includes(joined) || joined.includes(n) ||
        a.sgg.some(t => t.length >= 2 && (n === t || (stem(t).length >= 2 && n.startsWith(stem(t))) || (n.length > 2 && t.startsWith(n)))));
    }
    return { sido: sidoOk, sgg: sggOk };
  }

  // 행정구역 정보가 담긴 컬럼 찾기
  function findAdminColumns(features, fieldNames) {
    const sample = features.filter((_, i) => i % Math.max(1, Math.floor(features.length / 300)) === 0).slice(0, 300);
    const cols = [];
    for (const name of fieldNames) {
      let parsed = 0, nonEmpty = 0, withSido = 0;
      for (const f of sample) {
        const v = f.properties ? f.properties[name] : null;
        if (v === null || v === undefined || v === '') continue;
        nonEmpty++;
        if (typeof v === 'number') continue;
        const a = parseAdmin(v);
        if (a) { parsed++; if (a.sido) withSido++; }
      }
      if (nonEmpty >= 3 && parsed / nonEmpty >= 0.6) cols.push({ name, ratio: parsed / nonEmpty, withSido: withSido / nonEmpty });
    }
    const nameScore = n => /(주소|addr|소재지|시군구|sgg|sig|시도|sido|행정|법정|위치)/i.test(n) ? 1 : 0;
    return cols.sort((a, b) => (nameScore(b.name) - nameScore(a.name)) || (b.withSido - a.withSido) || (b.ratio - a.ratio));
  }

  // 후보 좌표계별로 "속성의 행정구역과 좌표가 일치하는 비율" 계산
  function scoreByAdmin(features, codes, swap, columns) {
    const idx = [];
    for (let i = 0; i < features.length && idx.length < 300; i += Math.max(1, Math.floor(features.length / 300))) idx.push(i);
    const rows = [];
    for (const i of idx) {
      const f = features[i];
      if (!f.geometry) continue;
      let a = null;
      // 여러 컬럼을 합쳐 해석 (시도 컬럼 + 시군구 컬럼 같은 경우)
      const parts = columns.map(c => f.properties[c]).filter(v => v !== null && v !== undefined && v !== '');
      if (parts.length) a = parseAdmin(parts.join(' '));
      if (!a) continue;
      let pt = null;
      C.eachCoord(f.geometry, c => { if (!pt) pt = c; });
      rows.push({ i, a, pt });
    }
    if (rows.length < 3) return null;
    const res = codes.map(code => {
      let sidoHit = 0, sidoN = 0, sggHit = 0, sggN = 0;
      const misses = [];
      for (const r of rows) {
        let lonlat;
        try { const xy = swap ? [r.pt[1], r.pt[0]] : [r.pt[0], r.pt[1]]; lonlat = code === 'EPSG:4326' ? xy : proj4(code, 'EPSG:4326', xy); } catch (e) { continue; }
        const reg = locate(lonlat[0], lonlat[1]);
        const m = regionMatches(reg, r.a);
        if (m.sido !== null) { sidoN++; if (m.sido) sidoHit++; }
        if (m.sgg !== null) { sggN++; if (m.sgg) sggHit++; }
        if ((m.sido === false || m.sgg === false) && misses.length < 200) misses.push({ i: r.i, got: reg ? `${reg.sido} ${reg.name}` : '경계 밖' });
      }
      const score = (sidoN ? sidoHit / sidoN : 0) * 0.5 + (sggN ? sggHit / sggN : (sidoN ? sidoHit / sidoN : 0)) * 0.5;
      return { code, score, sido: sidoN ? sidoHit / sidoN : null, sgg: sggN ? sggHit / sggN : null, n: rows.length, misses };
    });
    return res.sort((a, b) => b.score - a.score);
  }

  // 진단 메시지 생성
  function adminDiagnose(features, fieldNames, selectedCode, swap) {
    if (!regions) return { messages: [], result: null };
    const cols = findAdminColumns(features, fieldNames);
    if (!cols.length) return { messages: [{ level: 'info', text: '행정구역(주소·시군구) 컬럼이 없어 속성 대조 검증은 건너뜁니다.' }], result: null };
    // 시도가 있는 컬럼 1개 + 시군구만 있는 컬럼 1개를 함께 사용
    const use = [cols[0].name];
    if (cols[0].withSido < 0.5) { const s = cols.find(c => c.withSido >= 0.5 && c.name !== cols[0].name); if (s) use.unshift(s.name); }
    const codes = C.CRS.map(c => c.code);
    const res = scoreByAdmin(features, codes, swap, use);
    if (!res) return { messages: [], result: null };
    const pct = v => v === null ? '-' : (v * 100).toFixed(0) + '%';
    const sel = res.find(r => r.code === selectedCode);
    const best = res[0];
    const messages = [];
    const colTxt = use.map(c => `'${c}'`).join('+');
    if (sel && sel.score >= best.score - 0.05 && sel.score >= 0.7) {
      messages.push({ level: 'ok', text: `속성 ${colTxt}의 행정구역과 대조: ${selectedCode}로 해석하면 시도 ${pct(sel.sido)}, 시군구 ${pct(sel.sgg)} 일치 (${sel.n}건 표본).` });
      if (sel.misses.length) messages.push({ level: 'warn', text: `${sel.misses.length}건은 좌표가 속성과 다른 행정구역에 떨어집니다. 아래 '검사 결과'에서 확인하세요.` });
    } else if (best.score >= 0.6) {
      const o = C.offsetBetween(selectedCode, best.code, C.sampleCoords(features));
      messages.push({ level: 'error', text: `속성 ${colTxt}의 행정구역과 대조하면 ${selectedCode}는 일치율 ${pct(sel ? sel.score : 0)}, ${best.code}는 ${pct(best.score)}입니다 → ${best.code}일 가능성이 높습니다` +
        (o ? ` (두 해석 차이: ${o.dir}쪽 ${C.fmtDist(o.dist)}).` : '.'), suggest: best.code });
    } else {
      messages.push({ level: 'warn', text: `속성 ${colTxt}의 행정구역과 좌표가 어떤 좌표계로도 잘 맞지 않습니다 (최고 ${best.code} ${pct(best.score)}). 속성 값 또는 좌표를 확인하세요.` });
    }
    return { messages, result: { columns: use, ranking: res, selected: sel } };
  }

  g.ShpAdmin = { load, locate, parseAdmin, findAdminColumns, scoreByAdmin, adminDiagnose, sidoKey, isLoaded: () => !!regions };
})(typeof window !== 'undefined' ? window : globalThis);
