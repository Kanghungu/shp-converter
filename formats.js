/* 내보내기 포맷(GeoJSON/KML/CSV) + 형상 검사 */
(function (g) {
  'use strict';
  const C = g.ShpCore;

  function renameProps(features, fields) {
    return features.map(f => {
      const p = {};
      fields.forEach(fd => { let v = f.properties ? f.properties[fd.src] : null; if (v instanceof Date) v = C.fmtDate(v); p[fd.newName] = v === undefined ? null : v; });
      return { type: 'Feature', properties: p, geometry: f.geometry };
    });
  }

  function geojson(features, fields, srid) {
    const fc = { type: 'FeatureCollection', features: renameProps(features, fields) };
    if (srid !== 'EPSG:4326') fc.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::' + srid.split(':')[1] } };
    return JSON.stringify(fc);
  }

  const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  // KML은 규격상 WGS84 경위도만 허용 → featuresWgs를 받는다
  function kml(featuresWgs, fields, name) {
    const co = cs => cs.map(c => `${+c[0].toFixed(8)},${+c[1].toFixed(8)}`).join(' ');
    const ring = r => `<LinearRing><coordinates>${co(C.closeRing(r))}</coordinates></LinearRing>`;
    const poly = rings => `<Polygon><outerBoundaryIs>${ring(rings[0])}</outerBoundaryIs>${rings.slice(1).map(r => `<innerBoundaryIs>${ring(r)}</innerBoundaryIs>`).join('')}</Polygon>`;
    const geom = gm => {
      if (!gm) return '';
      switch (gm.type) {
        case 'Point': return `<Point><coordinates>${co([gm.coordinates])}</coordinates></Point>`;
        case 'MultiPoint': return `<MultiGeometry>${gm.coordinates.map(c => `<Point><coordinates>${co([c])}</coordinates></Point>`).join('')}</MultiGeometry>`;
        case 'LineString': return `<LineString><coordinates>${co(gm.coordinates)}</coordinates></LineString>`;
        case 'MultiLineString': return `<MultiGeometry>${gm.coordinates.map(l => `<LineString><coordinates>${co(l)}</coordinates></LineString>`).join('')}</MultiGeometry>`;
        case 'Polygon': return poly(gm.coordinates);
        case 'MultiPolygon': return `<MultiGeometry>${gm.coordinates.map(poly).join('')}</MultiGeometry>`;
        default: return '';
      }
    };
    const pms = renameProps(featuresWgs, fields).map((f, i) => {
      const data = Object.entries(f.properties).map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v ?? '')}</value></Data>`).join('');
      const label = fields.length ? (f.properties[fields[0].newName] ?? `#${i + 1}`) : `#${i + 1}`;
      return `<Placemark><name>${xml(label)}</name><ExtendedData>${data}</ExtendedData>${geom(f.geometry)}</Placemark>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name>\n${pms.join('\n')}\n</Document></kml>\n`;
  }

  // 점 → X,Y 컬럼 / 그 외 → WKT 컬럼
  function csv(features, fields, srid) {
    const allPoints = features.every(f => !f.geometry || f.geometry.type === 'Point');
    const digits = C.byCode[srid] && C.byCode[srid].geographic ? 8 : 3;
    const q = v => { if (v === null || v === undefined) return ''; const s = v instanceof Date ? C.fmtDate(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = fields.map(f => f.newName).concat(allPoints ? ['X', 'Y'] : ['WKT']);
    const rows = features.map(f => {
      const vals = fields.map(fd => q(f.properties ? f.properties[fd.src] : null));
      if (allPoints) { const c = f.geometry ? f.geometry.coordinates : null; vals.push(c ? +c[0].toFixed(digits) : '', c ? +c[1].toFixed(digits) : ''); }
      else vals.push(q(C.toWkt(f.geometry, digits) || ''));
      return vals.join(',');
    });
    return [head.map(q).join(',')].concat(rows).join('\r\n') + '\r\n';
  }

  // ───────── 형상 검사 ─────────
  function segIntersect(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  function ringSelfIntersects(r) {
    const n = r.length - 1;
    if (n > 1500) return null; // 너무 큰 링은 생략
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(r[i], r[i + 1], r[j], r[j + 1])) return true;
    }
    return false;
  }
  // 반환: [{i, type, text}]
  function checkGeometries(features) {
    const issues = [];
    const seen = new Map();
    features.forEach((f, i) => {
      const gm = f.geometry;
      if (!gm) { issues.push({ i, type: 'empty', text: '형상 없음 (NULL)' }); return; }
      let bad = false;
      C.eachCoord(gm, c => { if (!isFinite(c[0]) || !isFinite(c[1])) bad = true; });
      if (bad) { issues.push({ i, type: 'nan', text: '좌표 값 오류 (NaN/Infinity)' }); return; }
      const polys = gm.type === 'Polygon' ? [gm.coordinates] : gm.type === 'MultiPolygon' ? gm.coordinates : [];
      polys.forEach(rings => rings.forEach((r, k) => {
        const ring = C.closeRing(r);
        if (ring.length < 4) issues.push({ i, type: 'ring', text: `링 점 개수 부족 (${ring.length}개)` });
        else if (ringSelfIntersects(ring)) issues.push({ i, type: 'self', text: `${k === 0 ? '외곽' : '내부'} 링 자체 교차 (꼬임)` });
        else if (Math.abs(C.ringArea(ring)) < 1e-12) issues.push({ i, type: 'area', text: '면적 0인 링' });
      }));
      const lines = gm.type === 'LineString' ? [gm.coordinates] : gm.type === 'MultiLineString' ? gm.coordinates : [];
      lines.forEach(l => { if (l.length < 2) issues.push({ i, type: 'line', text: '선 점 개수 부족' }); });
      // 중복 형상
      let key = gm.type;
      C.eachCoord(gm, c => { key += `|${c[0].toFixed(3)},${c[1].toFixed(3)}`; });
      if (key.length > 4000) key = key.slice(0, 4000) + key.length;
      if (seen.has(key)) issues.push({ i, type: 'dup', text: `#${seen.get(key) + 1}과 형상 중복` }); else seen.set(key, i);
    });
    return issues;
  }

  g.ShpFormats = { geojson, kml, csv, checkGeometries };
})(typeof window !== 'undefined' ? window : globalThis);
