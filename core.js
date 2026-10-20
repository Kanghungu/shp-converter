/* SHP 좌표계 변환기 - 핵심 로직 (브라우저/Node 공용, proj4 전역 필요) */
(function (g) {
  'use strict';
  const proj4 = g.proj4;

  // ───────────── 좌표계 정의 ─────────────
  // Bessel 계열 towgs84: 국내 실무 7변수 값
  const BESSEL_TOWGS = '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';
  const GEOG_2000 = 'GEOGCS["GCS_Korea_2000",DATUM["D_Korea_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const GEOG_WGS = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const GEOG_BESSEL = 'GEOGCS["GCS_Korean_Datum_1985",DATUM["D_Korean_Datum_1985",SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const tmWkt = (name, geog, fe, fn, cm, k, lat0) =>
    `PROJCS["${name}",${geog},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",${fe}],PARAMETER["False_Northing",${fn}],PARAMETER["Central_Meridian",${cm}],PARAMETER["Scale_Factor",${k}],PARAMETER["Latitude_Of_Origin",${lat0}],UNIT["Meter",1.0]]`;
  const tm = (lat0, lon0, k, x0, y0, ell, extra = '') =>
    `+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=${k} +x_0=${x0} +y_0=${y0} +ellps=${ell} ${extra} +units=m +no_defs`;

  const CRS = [
    { code: 'EPSG:4326', name: 'WGS84 경위도', geographic: true,
      def: '+proj=longlat +datum=WGS84 +no_defs', wkt: GEOG_WGS },
    { code: 'EPSG:3857', name: 'Web Mercator (구글/OSM)',
      def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
      wkt: 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",' + GEOG_WGS + ',PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]' },
    { code: 'EPSG:5179', name: 'UTM-K (GRS80)', def: tm(38, 127.5, 0.9996, 1000000, 2000000, 'GRS80'),
      wkt: tmWkt('Korea_2000_Korea_Unified_Coordinate_System', GEOG_2000, 1000000, 2000000, 127.5, 0.9996, 38) },
    { code: 'EPSG:5186', name: '중부원점 GRS80 (60만)', def: tm(38, 127, 1, 200000, 600000, 'GRS80'),
      wkt: tmWkt('Korea_2000_Korea_Central_Belt_2010', GEOG_2000, 200000, 600000, 127, 1, 38) },
    { code: 'EPSG:5185', name: '서부원점 GRS80 (60만)', def: tm(38, 125, 1, 200000, 600000, 'GRS80'),
      wkt: tmWkt('Korea_2000_Korea_West_Belt_2010', GEOG_2000, 200000, 600000, 125, 1, 38) },
    { code: 'EPSG:5187', name: '동부원점 GRS80 (60만)', def: tm(38, 129, 1, 200000, 600000, 'GRS80'),
      wkt: tmWkt('Korea_2000_Korea_East_Belt_2010', GEOG_2000, 200000, 600000, 129, 1, 38) },
    { code: 'EPSG:5188', name: '동해원점 GRS80 (60만)', def: tm(38, 131, 1, 200000, 600000, 'GRS80'),
      wkt: tmWkt('Korea_2000_Korea_East_Sea_Belt_2010', GEOG_2000, 200000, 600000, 131, 1, 38) },
    { code: 'EPSG:5181', name: '중부원점 GRS80 (50만, 카카오)', def: tm(38, 127, 1, 200000, 500000, 'GRS80'),
      wkt: tmWkt('Korea_2000_Korea_Central_Belt', GEOG_2000, 200000, 500000, 127, 1, 38) },
    { code: 'EPSG:5174', name: '중부원점 Bessel 보정 (구 지적)', def: tm(38, 127.0028902777778, 1, 200000, 500000, 'bessel', BESSEL_TOWGS),
      wkt: tmWkt('Korean_1985_Modified_Korea_Central_Belt', GEOG_BESSEL, 200000, 500000, 127.0028902777778, 1, 38) },
    { code: 'EPSG:2097', name: '중부원점 Bessel (보정 없음)', def: tm(38, 127, 1, 200000, 500000, 'bessel', BESSEL_TOWGS),
      wkt: tmWkt('Korean_1985_Korea_Central_Belt', GEOG_BESSEL, 200000, 500000, 127, 1, 38) },
    { code: 'EPSG:32652', name: 'UTM 52N (WGS84)', def: '+proj=utm +zone=52 +datum=WGS84 +units=m +no_defs',
      wkt: 'PROJCS["WGS_1984_UTM_Zone_52N",' + GEOG_WGS + ',PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",129.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]' },
  ];
  CRS.forEach(c => proj4.defs(c.code, c.def));
  const byCode = Object.fromEntries(CRS.map(c => [c.code, c]));

  // 한국 영역 (WGS84)
  const KOREA = { minX: 123.5, maxX: 132.0, minY: 32.8, maxY: 39.8 };
  const inKorea = (lon, lat) => lon >= KOREA.minX && lon <= KOREA.maxX && lat >= KOREA.minY && lat <= KOREA.maxY;
  // 대략적인 남한 육지 윤곽 (약 수 km 바깥으로 여유를 둔 간략 폴리곤) - 바다 판정용
  const LAND = [
    [[126.0,34.2],[126.6,34.15],[127.4,34.4],[128.4,34.7],[129.05,34.95],[129.5,35.35],[129.65,36.0],[129.5,36.8],[129.5,37.1],[129.1,37.75],[128.65,38.35],[128.35,38.7],[127.6,38.4],[127.1,38.4],[126.65,37.95],[126.0,37.8],[126.35,37.1],[126.0,36.6],[126.4,36.0],[126.2,35.5],[126.05,35.0],[126.0,34.2]],
    [[126.1,33.1],[127.0,33.1],[127.0,33.62],[126.1,33.62],[126.1,33.1]],
    [[130.75,37.42],[130.97,37.42],[130.97,37.58],[130.75,37.58],[130.75,37.42]],
  ];
  function inPoly(x, y, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  // 정밀 육지 판정(행정구역 경계)이 로드되면 교체된다
  let landImpl = null;
  const onLand = (lon, lat) => landImpl ? landImpl(lon, lat) : LAND.some(r => inPoly(lon, lat, r));
  function setLandTest(fn) { landImpl = fn; }
  function toWgs(code, xy) { return code === 'EPSG:4326' ? xy : proj4(code, 'EPSG:4326', xy); }
  // 후보 좌표계로 해석했을 때 육지(남한)에 들어오는 비율
  function landScore(code, samples, swap = false) {
    if (!samples.length) return 0;
    let ok = 0;
    for (const c of samples) {
      try { const [lon, lat] = toWgs(code, swap ? [c[1], c[0]] : [c[0], c[1]]); if (isFinite(lon) && onLand(lon, lat)) ok++; } catch (e) {}
    }
    return ok / samples.length;
  }
  // 두 해석 사이의 대표 이동량 (중심점 기준, m / 방위)
  function offsetBetween(fromCode, toCode, samples) {
    const n = samples.length; if (!n) return null;
    const cx = samples.reduce((s, c) => s + c[0], 0) / n, cy = samples.reduce((s, c) => s + c[1], 0) / n;
    try {
      const a = toWgs(fromCode, [cx, cy]), b = toWgs(toCode, [cx, cy]);
      const R = 6371000, rad = Math.PI / 180;
      const dx = (b[0] - a[0]) * rad * R * Math.cos(a[1] * rad), dy = (b[1] - a[1]) * rad * R;
      const dist = Math.hypot(dx, dy);
      const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
      const ang = (Math.atan2(dx, dy) / rad + 360) % 360;
      return { dist, dir: dirs[Math.round(ang / 45) % 8] };
    } catch (e) { return null; }
  }
  const fmtDate = d => isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(d >= 10000 ? 0 : 1) + 'km' : Math.round(d) + 'm';

  // ───────────── 좌표 순회 ─────────────
  function mapCoords(geom, fn) {
    if (!geom) return null;
    const m1 = c => fn(c);
    const m2 = a => a.map(m1), m3 = a => a.map(m2), m4 = a => a.map(m3);
    switch (geom.type) {
      case 'Point': return { type: 'Point', coordinates: m1(geom.coordinates) };
      case 'MultiPoint': case 'LineString': return { type: geom.type, coordinates: m2(geom.coordinates) };
      case 'MultiLineString': case 'Polygon': return { type: geom.type, coordinates: m3(geom.coordinates) };
      case 'MultiPolygon': return { type: geom.type, coordinates: m4(geom.coordinates) };
      default: return null;
    }
  }
  function eachCoord(geom, fn) { mapCoords(geom, c => { fn(c); return c; }); }

  function sampleCoords(features, max = 400) {
    const all = [];
    features.forEach(f => eachCoord(f.geometry, c => all.push(c)));
    if (all.length <= max) return all;
    const step = all.length / max, out = [];
    for (let i = 0; i < max; i++) out.push(all[Math.floor(i * step)]);
    return out;
  }

  function rawBBox(features) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    features.forEach(f => eachCoord(f.geometry, ([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }));
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  // 후보 좌표계로 해석했을 때 한국 영역 안에 들어오는 비율
  function scoreCrs(code, samples, swap = false) {
    if (!samples.length) return 0;
    let ok = 0;
    for (const c of samples) {
      const xy = swap ? [c[1], c[0]] : [c[0], c[1]];
      try {
        const [lon, lat] = code === 'EPSG:4326' ? xy : proj4(code, 'EPSG:4326', xy);
        if (isFinite(lon) && isFinite(lat) && inKorea(lon, lat)) ok++;
      } catch (e) { /* 변환 실패 = 범위 밖 */ }
    }
    return ok / samples.length;
  }

  // ───────────── PRJ 매칭 ─────────────
  function projParams(def) {
    try {
      const p = proj4(def).oProj || proj4.Proj(def);
      return p;
    } catch (e) { return null; }
  }
  function matchPrj(prjText) {
    if (!prjText) return null;
    const t = prjText.toUpperCase();
    if (t.includes('AUXILIARY_SPHERE') || t.includes('PSEUDO') || t.includes('WEB_MERCATOR')) return { code: 'EPSG:3857', exact: true };
    if (!t.includes('PROJCS') && t.includes('GEOGCS')) return { code: 'EPSG:4326', exact: !t.includes('BESSEL') };
    const p = projParams(prjText);
    if (!p) return null;
    const r2d = 180 / Math.PI;
    const near = (a, b, tol) => Math.abs((a || 0) - (b || 0)) <= tol;
    let best = null;
    for (const c of CRS) {
      if (c.geographic || c.code === 'EPSG:3857') continue;
      const q = projParams(c.def);
      if (!q) continue;
      const projOk = near(p.long0 * r2d, q.long0 * r2d, 1e-4) && near(p.lat0 * r2d, q.lat0 * r2d, 1e-4) &&
        near(p.x0, q.x0, 0.5) && near(p.y0, q.y0, 0.5) && near(p.k0 || p.k, q.k0 || q.k, 1e-6);
      if (!projOk) continue;
      const ellOk = near(p.a, q.a, 1);
      if (ellOk) return { code: c.code, exact: true };
      best = best || { code: c.code, exact: false };
    }
    if (best) return best;
    return { code: null, custom: prjText };
  }

  // ───────────── 진단 ─────────────
  // 반환: { declared, candidates:[{code,score,land}], swapSuggested, messages:[{level,text}] }
  function diagnose(features, prjText) {
    const samples = sampleCoords(features);
    const bbox = rawBBox(features);
    const messages = [];
    const declared = matchPrj(prjText);
    const pct = v => (v * 100).toFixed(0) + '%';
    const nameOf = c => `${c} (${byCode[c].name})`;
    const scores = CRS.map(c => ({ code: c.code, score: scoreCrs(c.code, samples), land: landScore(c.code, samples) }))
      .filter(s => s.score > 0).sort((a, b) => (b.land - a.land) || (b.score - a.score));
    const topLand = scores.length ? scores[0].land : 0;
    let candidates = scores.filter(s => s.score >= 0.5 && s.land >= Math.max(0.3, topLand - 0.15));
    if (!candidates.length) candidates = scores.filter(s => s.score >= 0.5);

    if (!bbox) {
      messages.push({ level: 'error', text: '유효한 좌표가 없습니다.' });
      return { declared, candidates, bbox, swapSuggested: false, messages };
    }

    // X/Y 뒤바뀜 검사
    let swapSuggested = false;
    const swapBest = CRS.map(c => ({ code: c.code, land: landScore(c.code, samples, true) })).sort((a, b) => b.land - a.land)[0];
    if (swapBest.land >= 0.6 && swapBest.land > topLand + 0.3) {
      swapSuggested = swapBest.code;
      messages.push({ level: 'error', text: `현재 X/Y 순서로는 육지에 거의 들어오지 않지만, X/Y를 바꾸면 ${nameOf(swapBest.code)}로 ${pct(swapBest.land)}가 육지에 들어옵니다 → X/Y 뒤바뀜 의심.` });
    }
    if (!scores.length && !swapSuggested) {
      messages.push({ level: 'error', text: '목록의 어떤 좌표계로도 한국 영역에 들어오지 않습니다. 단위(cm, DMS) 또는 비표준 좌표계를 확인하세요.' });
    }

    const declaredOk = declared && declared.code && landScore(declared.code, samples) >= 0.5;
    if (declared && declared.code) {
      const dLand = landScore(declared.code, samples), dBox = scoreCrs(declared.code, samples);
      if (!declared.exact) messages.push({ level: 'warn', text: `PRJ의 투영 파라미터는 ${nameOf(declared.code)}와 같지만 타원체 정보가 다릅니다. Bessel↔GRS80 혼동 가능성이 있습니다.` });
      if (dLand >= 0.5) {
        messages.push({ level: 'ok', text: `PRJ 선언 좌표계 ${nameOf(declared.code)}로 해석하면 ${pct(dLand)}가 육지에 위치합니다.` });
      } else {
        const better = candidates.filter(c => c.code !== declared.code && c.land > dLand + 0.2);
        messages.push({ level: 'error', text: `PRJ에는 ${nameOf(declared.code)}로 적혀 있지만 그렇게 해석하면 ${dBox < 0.5 ? '한국 영역 밖' : '대부분 바다'}에 놓입니다 (육지 ${pct(dLand)}). → 좌표계가 잘못 적혀 있을 가능성이 높습니다.` +
          (better.length ? ` 더 잘 맞는 후보: ${better.slice(0, 3).map(b => `${b.code}(육지 ${pct(b.land)})`).join(', ')}` : '') });
      }
      // 혼동 가능한 다른 해석과의 이동량 패턴
      const alts = candidates.filter(c => c.code !== declared.code && c.land >= 0.5);
      if (dLand >= 0.5 && alts.length) {
        const lines = alts.slice(0, 5).map(a => { const o = offsetBetween(declared.code, a.code, samples); return o ? `${a.code} → ${o.dir}쪽 ${fmtDist(o.dist)}` : a.code; });
        messages.push({ level: 'info', text: `같은 숫자를 다른 좌표계로 읽어도 육지에 들어옵니다: ${lines.join(' · ')}. 수백 m(측지계 혼동)·100km(가산값 50만/60만 혼동) 차이는 범위만으로 판별할 수 없으니 지도에서 배경과 비교하세요.` });
      }
    } else if (declared && declared.custom) {
      messages.push({ level: 'warn', text: 'PRJ가 있지만 지원 목록의 좌표계와 일치하지 않습니다. 값 범위로 추정한 후보를 사용합니다.' });
    } else {
      messages.push({ level: 'warn', text: 'PRJ 파일이 없습니다. 좌표 값 범위로 후보를 추정했습니다.' });
    }
    if (!declaredOk && candidates.length > 1) {
      messages.push({ level: 'info', text: `후보 ${candidates.length}개: ${candidates.map(c => `${c.code}(육지 ${pct(c.land)})`).join(', ')}. 지도에서 후보를 바꿔 보며 배경지도와 맞는 것을 고르세요.` });
    }
    if (candidates.length && candidates[0].land < 0.9 && candidates[0].land >= 0.3) {
      messages.push({ level: 'warn', text: `가장 잘 맞는 후보도 ${pct(candidates[0].land)}만 육지에 있습니다. 해안·도서 데이터가 아니라면 일부 행의 좌표가 잘못되었거나 다른 좌표계가 섞였을 수 있습니다.` });
    }
    return { declared, candidates, bbox, swapSuggested, messages };
  }

  // 기본 선택 좌표계
  function pickDefault(diag) {
    if (diag.declared && diag.declared.code && diag.candidates.some(c => c.code === diag.declared.code && c.land >= 0.5)) return diag.declared.code;
    const top = diag.candidates[0];
    const pool = top ? diag.candidates.filter(c => c.land >= top.land - 0.05) : [];
    const pref = ['EPSG:5186', 'EPSG:5179', 'EPSG:4326', 'EPSG:5181', 'EPSG:5174', 'EPSG:5185', 'EPSG:5187', 'EPSG:5188', 'EPSG:32652', 'EPSG:3857', 'EPSG:2097'];
    for (const p of pref) if (pool.some(c => c.code === p)) return p;
    return diag.candidates.length ? diag.candidates[0].code : (diag.declared && diag.declared.code) || 'EPSG:5186';
  }

  function transformFeatures(features, from, to, swap = false) {
    const conv = from === to ? null : proj4(from, to);
    return features.map(f => ({
      type: 'Feature', properties: f.properties,
      geometry: mapCoords(f.geometry, c => {
        let xy = swap ? [c[1], c[0]] : [c[0], c[1]];
        if (conv) xy = conv.forward(xy);
        return xy;
      }),
    }));
  }

  // ───────────── 인코딩 ─────────────
  let cp949Map = null;
  function buildCp949() {
    if (cp949Map) return cp949Map;
    cp949Map = new Map();
    const dec = new TextDecoder('euc-kr');
    const buf = new Uint8Array(2);
    for (let lead = 0x81; lead <= 0xFE; lead++) {
      for (let trail = 0x41; trail <= 0xFE; trail++) {
        if ((trail > 0x5A && trail < 0x61) || (trail > 0x7A && trail < 0x81) || trail === 0xFF) continue;
        buf[0] = lead; buf[1] = trail;
        const s = dec.decode(buf);
        if (s.length === 1 && s !== '\uFFFD' && !cp949Map.has(s)) cp949Map.set(s, [lead, trail]);
      }
    }
    return cp949Map;
  }
  const utf8 = new TextEncoder();
  function encodeStr(str, enc) {
    if (enc === 'UTF-8') return utf8.encode(str);
    const map = buildCp949(), out = [];
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) out.push(cp);
      else { const b = map.get(ch); if (b) out.push(b[0], b[1]); else out.push(0x3F); }
    }
    return Uint8Array.from(out);
  }
  function byteLen(str, enc) { return encodeStr(str, enc).length; }
  // 멀티바이트 문자가 잘리지 않게 maxBytes로 자르기
  function truncateBytes(str, enc, maxBytes) {
    let out = '', n = 0;
    for (const ch of str) {
      const b = byteLen(ch, enc);
      if (n + b > maxBytes) break;
      out += ch; n += b;
    }
    return out;
  }
  function detectDbfEncoding(dbfBytes) {
    const u8 = dbfBytes instanceof Uint8Array ? dbfBytes : new Uint8Array(dbfBytes);
    let hasHigh = false;
    for (let i = 0; i < u8.length; i++) if (u8[i] >= 0x80) { hasHigh = true; break; }
    if (!hasHigh) return 'UTF-8';
    try { new TextDecoder('utf-8', { fatal: true }).decode(u8); return 'UTF-8'; } catch (e) { return 'EUC-KR'; }
  }

  // ───────────── DBF 헤더 읽기 (필드 정의) ─────────────
  function readDbfFields(dbfBuf, enc) {
    const dv = new DataView(dbfBuf instanceof ArrayBuffer ? dbfBuf : dbfBuf.buffer, dbfBuf.byteOffset || 0);
    const headerLen = dv.getUint16(8, true);
    const dec = new TextDecoder(enc === 'UTF-8' ? 'utf-8' : 'euc-kr');
    const fields = [];
    for (let off = 32; off + 32 <= headerLen && dv.getUint8(off) !== 0x0D; off += 32) {
      const nameBytes = [];
      for (let i = 0; i < 11; i++) { const b = dv.getUint8(off + i); if (b === 0) break; nameBytes.push(b); }
      fields.push({
        name: dec.decode(Uint8Array.from(nameBytes)).trim(),
        type: String.fromCharCode(dv.getUint8(off + 11)),
        length: dv.getUint8(off + 16),
        decimals: dv.getUint8(off + 17),
      });
    }
    return fields;
  }

  // ───────────── 컬럼 검증 ─────────────
  const RESERVED = new Set(['ACCESS', 'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUDIT', 'BETWEEN', 'BY', 'CHAR', 'CHECK', 'CLUSTER', 'COLUMN', 'COMMENT', 'COMPRESS', 'CONNECT', 'CREATE', 'CURRENT', 'DATE', 'DECIMAL', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'EXCLUSIVE', 'EXISTS', 'FILE', 'FLOAT', 'FOR', 'FROM', 'GRANT', 'GROUP', 'HAVING', 'IDENTIFIED', 'IMMEDIATE', 'IN', 'INCREMENT', 'INDEX', 'INITIAL', 'INSERT', 'INTEGER', 'INTERSECT', 'INTO', 'IS', 'LEVEL', 'LIKE', 'LOCK', 'LONG', 'MAXEXTENTS', 'MINUS', 'MODE', 'MODIFY', 'NOAUDIT', 'NOCOMPRESS', 'NOT', 'NOWAIT', 'NULL', 'NUMBER', 'OF', 'OFFLINE', 'ON', 'ONLINE', 'OPTION', 'OR', 'ORDER', 'PRIOR', 'PRIVILEGES', 'PUBLIC', 'RAW', 'RENAME', 'RESOURCE', 'REVOKE', 'ROW', 'ROWID', 'ROWNUM', 'ROWS', 'SELECT', 'SESSION', 'SET', 'SHARE', 'SIZE', 'SMALLINT', 'START', 'SUCCESSFUL', 'SYNONYM', 'SYSDATE', 'TABLE', 'THEN', 'TO', 'TRIGGER', 'UID', 'UNION', 'UNIQUE', 'UPDATE', 'USER', 'VALIDATE', 'VALUES', 'VARCHAR', 'VARCHAR2', 'VIEW', 'WHENEVER', 'WHERE', 'WITH', 'USER', 'TYPE', 'KEY', 'VALUE', 'NAME', 'OFFSET', 'LIMIT']);
  function validateFields(fields, enc) {
    const seen = new Map();
    return fields.map((f, i) => {
      const w = [];
      if (!f.use) return w;
      const nm = f.newName || '';
      if (!nm) w.push({ level: 'error', text: '이름 없음' });
      const bl = byteLen(nm, enc);
      if (bl > 10) w.push({ level: 'error', text: `${bl}바이트 (DBF 최대 10)` });
      if (/[^\x00-\x7F]/.test(nm)) w.push({ level: 'warn', text: '한글 컬럼명 (DB 적재 시 비권장)' });
      else if (nm && !/^[A-Za-z][A-Za-z0-9_]*$/.test(nm)) w.push({ level: 'error', text: '영문으로 시작, 영문/숫자/_만' });
      if (RESERVED.has(nm.toUpperCase())) w.push({ level: 'warn', text: 'Oracle 예약어' });
      const key = nm.toUpperCase();
      if (seen.has(key)) w.push({ level: 'error', text: `중복 (${seen.get(key) + 1}행)` }); else seen.set(key, i);
      if (f.type === 'C' && (f.length < 1 || f.length > 254)) w.push({ level: 'error', text: '문자 길이 1~254' });
      if ((f.type === 'N' || f.type === 'F') && (f.length < 1 || f.length > 20)) w.push({ level: 'error', text: '숫자 길이 1~20' });
      if (f.type === 'C' && f.maxBytes > f.length) w.push({ level: 'warn', text: `실제 최대 ${f.maxBytes}바이트 → 잘림` });
      return w;
    });
  }
  function measureField(features, srcName, enc, type) {
    let maxBytes = 0, maxInt = 0, maxDec = 0;
    for (const ft of features) {
      const v = ft.properties ? ft.properties[srcName] : null;
      if (v === null || v === undefined || v === '') continue;
      if (type === 'N' || type === 'F') {
        const s = String(typeof v === 'number' ? v : Number(v));
        const [ip, dp] = s.replace('-', '').split('.');
        maxInt = Math.max(maxInt, ip.length + (s.startsWith('-') ? 1 : 0));
        maxDec = Math.max(maxDec, dp ? dp.length : 0);
      } else {
        maxBytes = Math.max(maxBytes, byteLen(v instanceof Date ? fmtDate(v) : String(v), enc));
      }
    }
    return { maxBytes, maxInt, maxDec };
  }

  // ───────────── SHP 쓰기 ─────────────
  function ringArea(r) { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
  function closeRing(r) { const a = r[0], b = r[r.length - 1]; return (a[0] === b[0] && a[1] === b[1]) ? r : r.concat([a]); }
  // SHP 규칙: 외곽 링 시계방향(면적<0), 내부 링 반시계방향
  function polyParts(geom) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const parts = [];
    polys.forEach(rings => rings.forEach((r, i) => {
      let ring = closeRing(r);
      const cw = ringArea(ring) < 0;
      if ((i === 0 && !cw) || (i > 0 && cw)) ring = ring.slice().reverse();
      parts.push(ring);
    }));
    return parts;
  }
  function shpTypeOf(features) {
    for (const f of features) {
      const t = f.geometry && f.geometry.type;
      if (!t) continue;
      if (t === 'Point') return 1;
      if (t === 'MultiPoint') return 8;
      if (t === 'LineString' || t === 'MultiLineString') return 3;
      if (t === 'Polygon' || t === 'MultiPolygon') return 5;
    }
    return 0;
  }
  function geomRecord(geom, type) {
    // content(Int32 type 포함) 바이트 배열 생성
    if (!geom) { const b = new ArrayBuffer(4); new DataView(b).setInt32(0, 0, true); return { buf: b, bbox: null }; }
    if (type === 1) {
      const c = geom.type === 'Point' ? geom.coordinates : geom.coordinates[0];
      const b = new ArrayBuffer(20), v = new DataView(b);
      v.setInt32(0, 1, true); v.setFloat64(4, c[0], true); v.setFloat64(12, c[1], true);
      return { buf: b, bbox: [c[0], c[1], c[0], c[1]] };
    }
    let pts, parts = null;
    if (type === 8) pts = geom.type === 'Point' ? [geom.coordinates] : geom.coordinates;
    else {
      let ps;
      if (type === 3) ps = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
      else ps = polyParts(geom);
      parts = []; pts = [];
      ps.forEach(p => { parts.push(pts.length); pts.push(...p); });
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; });
    const size = type === 8 ? 40 + pts.length * 16 : 44 + parts.length * 4 + pts.length * 16;
    const b = new ArrayBuffer(size), v = new DataView(b);
    v.setInt32(0, type, true);
    v.setFloat64(4, minX, true); v.setFloat64(12, minY, true); v.setFloat64(20, maxX, true); v.setFloat64(28, maxY, true);
    let o;
    if (type === 8) { v.setInt32(36, pts.length, true); o = 40; }
    else {
      v.setInt32(36, parts.length, true); v.setInt32(40, pts.length, true); o = 44;
      parts.forEach(p => { v.setInt32(o, p, true); o += 4; });
    }
    pts.forEach(([x, y]) => { v.setFloat64(o, x, true); v.setFloat64(o + 8, y, true); o += 16; });
    return { buf: b, bbox: [minX, minY, maxX, maxY] };
  }
  function writeShpShx(features) {
    const type = shpTypeOf(features);
    const recs = features.map(f => geomRecord(f.geometry, type));
    let bbox = [Infinity, Infinity, -Infinity, -Infinity];
    recs.forEach(r => { if (r.bbox) { bbox = [Math.min(bbox[0], r.bbox[0]), Math.min(bbox[1], r.bbox[1]), Math.max(bbox[2], r.bbox[2]), Math.max(bbox[3], r.bbox[3])]; } });
    if (!isFinite(bbox[0])) bbox = [0, 0, 0, 0];
    const shpLen = 100 + recs.reduce((s, r) => s + 8 + r.buf.byteLength, 0);
    const shxLen = 100 + recs.length * 8;
    const shp = new ArrayBuffer(shpLen), shx = new ArrayBuffer(shxLen);
    const sv = new DataView(shp), xv = new DataView(shx);
    [[sv, shpLen], [xv, shxLen]].forEach(([v, len]) => {
      v.setInt32(0, 9994, false); v.setInt32(24, len / 2, false);
      v.setInt32(28, 1000, true); v.setInt32(32, type, true);
      v.setFloat64(36, bbox[0], true); v.setFloat64(44, bbox[1], true); v.setFloat64(52, bbox[2], true); v.setFloat64(60, bbox[3], true);
    });
    const u8 = new Uint8Array(shp);
    let off = 100;
    recs.forEach((r, i) => {
      sv.setInt32(off, i + 1, false); sv.setInt32(off + 4, r.buf.byteLength / 2, false);
      xv.setInt32(100 + i * 8, off / 2, false); xv.setInt32(104 + i * 8, r.buf.byteLength / 2, false);
      u8.set(new Uint8Array(r.buf), off + 8);
      off += 8 + r.buf.byteLength;
    });
    return { shp, shx, type, bbox };
  }

  // fields: [{src, newName, type:'C'|'N'|'F'|'D'|'L', length, decimals}]
  function writeDbf(features, fields, enc) {
    const n = features.length;
    const headerLen = 32 + fields.length * 32 + 1;
    const recLen = 1 + fields.reduce((s, f) => s + f.length, 0);
    const buf = new ArrayBuffer(headerLen + n * recLen + 1);
    const v = new DataView(buf), u8 = new Uint8Array(buf);
    const now = new Date();
    v.setUint8(0, 0x03); v.setUint8(1, now.getFullYear() - 1900); v.setUint8(2, now.getMonth() + 1); v.setUint8(3, now.getDate());
    v.setUint32(4, n, true); v.setUint16(8, headerLen, true); v.setUint16(10, recLen, true);
    v.setUint8(29, enc === 'UTF-8' ? 0x00 : 0x00);
    fields.forEach((f, i) => {
      const o = 32 + i * 32;
      u8.set(encodeStr(f.newName, enc).slice(0, 10), o);
      v.setUint8(o + 11, f.type.charCodeAt(0));
      v.setUint8(o + 16, f.length);
      v.setUint8(o + 17, (f.type === 'N' || f.type === 'F') ? f.decimals : 0);
    });
    v.setUint8(headerLen - 1, 0x0D);
    let o = headerLen;
    const space = 0x20;
    features.forEach(ft => {
      u8[o++] = space;
      fields.forEach(f => {
        const raw = ft.properties ? ft.properties[f.src] : null;
        let s = '';
        if (raw !== null && raw !== undefined && raw !== '') {
          if (f.type === 'N' || f.type === 'F') {
            const num = Number(raw);
            if (isFinite(num)) { s = f.decimals > 0 ? num.toFixed(f.decimals) : String(Math.round(num)); if (s.length > f.length) s = '*'.repeat(f.length); }
          } else if (f.type === 'D') {
            const d = raw instanceof Date ? raw : new Date(raw);
            if (!isNaN(d)) s = d.getFullYear().toString().padStart(4, '0') + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
          } else if (f.type === 'L') {
            s = (raw === true || /^[TtYy1]/.test(String(raw))) ? 'T' : 'F';
          } else {
            s = raw instanceof Date ? fmtDate(raw) : String(raw);
          }
        }
        let bytes;
        if (f.type === 'C') {
          bytes = encodeStr(truncateBytes(s, enc, f.length), enc);
          u8.fill(space, o, o + f.length); u8.set(bytes, o);
        } else {
          bytes = utf8.encode(s.slice(0, f.length));
          u8.fill(space, o, o + f.length);
          if (f.type === 'N' || f.type === 'F') u8.set(bytes, o + f.length - bytes.length); else u8.set(bytes, o);
        }
        o += f.length;
      });
    });
    u8[o] = 0x1A;
    return buf;
  }

  // ───────────── Oracle DDL ─────────────
  function oracleDdl(table, fields, srid, gtype, enc) {
    const t = (table || 'NEW_LAYER').toUpperCase();
    const cols = fields.map(f => {
      const nm = f.newName.toUpperCase();
      if (f.type === 'C') return `  ${nm} VARCHAR2(${f.length} BYTE)`;
      if (f.type === 'N' || f.type === 'F') return `  ${nm} NUMBER(${f.length}${f.decimals ? ',' + f.decimals : ''})`;
      if (f.type === 'D') return `  ${nm} DATE`;
      if (f.type === 'L') return `  ${nm} CHAR(1)`;
      return `  ${nm} VARCHAR2(${f.length})`;
    });
    const num = srid.split(':')[1];
    const geo = byCode[srid] && byCode[srid].geographic;
    const dim = geo
      ? `MDSYS.SDO_DIM_ELEMENT('X', 124, 132, 0.000000005), MDSYS.SDO_DIM_ELEMENT('Y', 33, 39, 0.000000005)`
      : `MDSYS.SDO_DIM_ELEMENT('X', -10000000, 10000000, 0.001), MDSYS.SDO_DIM_ELEMENT('Y', -10000000, 10000000, 0.001)`;
    const gt = { 1: 'POINT', 8: 'MULTIPOINT', 3: 'LINE', 5: 'POLYGON' }[gtype] || 'POLYGON';
    return `-- 문자 길이는 ${enc} 기준 바이트입니다. DB 문자셋(AL32UTF8이면 한글 3바이트)에 맞게 확인하세요.
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
`;
  }

  // ───────────── WKT ─────────────
  // ogcOrient: 외곽 링 반시계, 내부 링 시계 (OGC/Oracle 규칙)
  function toWkt(geom, digits = 3) {
    if (!geom) return null;
    const f = c => `${+c[0].toFixed(digits)} ${+c[1].toFixed(digits)}`;
    const line = cs => `(${cs.map(f).join(', ')})`;
    const ringsOgc = rings => rings.map((r, i) => {
      let ring = closeRing(r);
      const ccw = ringArea(ring) > 0;
      if ((i === 0 && !ccw) || (i > 0 && ccw)) ring = ring.slice().reverse();
      return line(ring);
    });
    const poly = rings => `(${ringsOgc(rings).join(', ')})`;
    switch (geom.type) {
      case 'Point': return `POINT (${f(geom.coordinates)})`;
      case 'MultiPoint': return `MULTIPOINT (${geom.coordinates.map(c => `(${f(c)})`).join(', ')})`;
      case 'LineString': return `LINESTRING ${line(geom.coordinates)}`;
      case 'MultiLineString': return `MULTILINESTRING (${geom.coordinates.map(line).join(', ')})`;
      case 'Polygon': return `POLYGON ${poly(geom.coordinates)}`;
      case 'MultiPolygon': return `MULTIPOLYGON (${geom.coordinates.map(poly).join(', ')})`;
      default: return null;
    }
  }

  g.ShpCore = { CRS, byCode, KOREA, diagnose, pickDefault, transformFeatures, rawBBox, matchPrj, scoreCrs,
    encodeStr, byteLen, detectDbfEncoding, readDbfFields, validateFields, measureField,
    writeShpShx, writeDbf, oracleDdl, mapCoords, fmtDate, landScore, setLandTest, sampleCoords,
    offsetBetween, fmtDist, toWkt, ringArea, closeRing, inPoly, truncateBytes, eachCoord };
})(typeof window !== 'undefined' ? window : globalThis);
