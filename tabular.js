/* CSV / 엑셀 좌표 데이터 읽기 */
(function (g) {
  'use strict';
  const C = g.ShpCore;

  function decodeText(buf) {
    const u8 = new Uint8Array(buf);
    let start = 0;
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) start = 3;
    const body = u8.subarray(start);
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), enc: 'UTF-8' }; }
    catch (e) { return { text: new TextDecoder('euc-kr').decode(body), enc: 'EUC-KR' }; }
  }

  // 간단한 CSV/TSV 파서 (따옴표, 줄바꿈 포함 셀 지원)
  function parseDelimited(text) {
    const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
    const counts = { ',': (firstLine.match(/,/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length, ';': (firstLine.match(/;/g) || []).length, '|': (firstLine.match(/\|/g) || []).length };
    const d = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  let xlsxLoading = null;
  function loadXlsx() {
    if (g.XLSX) return Promise.resolve(g.XLSX);
    if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => res(g.XLSX); s.onerror = () => rej(new Error('엑셀 라이브러리를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  // 반환: [{name, header:[], rows:[[...]] , enc}]
  async function readTable(file) {
    const buf = await file.arrayBuffer();
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      return wb.SheetNames.map(sn => {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
        const nonEmpty = aoa.filter(r => r.some(v => v !== '' && v !== null));
        return { name: sn, header: (nonEmpty[0] || []).map((h, i) => String(h || `COL${i + 1}`).trim()), rows: nonEmpty.slice(1), enc: 'UTF-8' };
      }).filter(t => t.header.length);
    }
    const { text, enc } = decodeText(buf);
    const rows = parseDelimited(text);
    return [{ name: file.name.replace(/\.[^.]+$/, ''), header: (rows[0] || []).map((h, i) => String(h || `COL${i + 1}`).trim()), rows: rows.slice(1), enc }];
  }

  // 도분초/숫자 문자열 → 숫자
  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return NaN;
    let s = String(v).trim().replace(/,/g, '');
    if (!s) return NaN;
    const dms = s.match(/^(-?\d+(?:\.\d+)?)\s*[°도]\s*(\d+(?:\.\d+)?)?\s*['′분]?\s*(\d+(?:\.\d+)?)?\s*["″초]?\s*([NSEWnsew])?$/);
    if (dms && /[°도]/.test(s)) {
      let n = Math.abs(+dms[1]) + (+dms[2] || 0) / 60 + (+dms[3] || 0) / 3600;
      if (s.startsWith('-') || /[SWsw]/.test(dms[4] || '')) n = -n;
      return n;
    }
    return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) ? +s : NaN;
  }

  const X_RE = /^(x|lon|lng|long|longitude|경도|x좌표|좌표x|xcoord|x_coord|coord_x|point_x|pnt_x|tm_x|xpos|x_crd|crd_x|gps_x|utmk_x|grs80_x|lo)$/i;
  const Y_RE = /^(y|lat|latitude|위도|y좌표|좌표y|ycoord|y_coord|coord_y|point_y|pnt_y|tm_y|ypos|y_crd|crd_y|gps_y|utmk_y|grs80_y|la)$/i;
  const loose = (re, h) => re.test(h.replace(/\s/g, '')) || re.test(h.replace(/\s/g, '').replace(/^.*[_\s]/, ''));

  function numericRatio(table, col) {
    let ok = 0, n = 0;
    for (const r of table.rows.slice(0, 300)) { const v = r[col]; if (v === '' || v === null || v === undefined) continue; n++; if (isFinite(toNumber(v))) ok++; }
    return n ? ok / n : 0;
  }

  // X/Y 컬럼 추정: 이름 우선, 없으면 숫자 컬럼 쌍 중 한국 육지에 가장 잘 들어오는 조합
  function guessXY(table) {
    const h = table.header;
    let x = h.findIndex(n => loose(X_RE, n)), y = h.findIndex(n => loose(Y_RE, n));
    if (x >= 0 && y >= 0 && x !== y) return { x, y, by: 'name' };
    const nums = h.map((_, i) => i).filter(i => numericRatio(table, i) > 0.9);
    let best = null;
    for (const a of nums) for (const b of nums) {
      if (a === b) continue;
      const samples = table.rows.slice(0, 200).map(r => [toNumber(r[a]), toNumber(r[b])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
      if (samples.length < 3) continue;
      for (const c of C.CRS) {
        const s = C.landScore(c.code, samples);
        if (!best || s > best.s) best = { x: a, y: b, s };
      }
    }
    return best && best.s > 0.5 ? { x: best.x, y: best.y, by: 'range' } : { x: nums[0] ?? 0, y: nums[1] ?? 1, by: 'none' };
  }

  // 테이블 → raw features + 필드 정의
  function toFeatures(table, xCol, yCol) {
    const feats = []; let skipped = 0;
    const cols = table.header.map((n, i) => ({ n, i })).filter(c => c.i !== xCol && c.i !== yCol);
    // 중복/빈 헤더 정리
    const seen = {};
    cols.forEach(c => { let n = c.n || `COL${c.i + 1}`; if (seen[n]) n = `${n}_${c.i + 1}`; seen[n] = 1; c.n = n; });
    const numericCols = new Set(cols.filter(c => numericRatio(table, c.i) === 1 && table.rows.some(r => r[c.i] !== '' && r[c.i] !== null)).map(c => c.n));
    for (const r of table.rows) {
      const x = toNumber(r[xCol]), y = toNumber(r[yCol]);
      const props = {};
      cols.forEach(c => {
        let v = r[c.i];
        if (v instanceof Date) v = C.fmtDate(v);
        props[c.n] = v === '' || v === undefined ? null : (numericCols.has(c.n) ? toNumber(v) : String(v));
      });
      if (!isFinite(x) || !isFinite(y)) { skipped++; feats.push({ type: 'Feature', geometry: null, properties: props }); continue; }
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props });
    }
    const fields = cols.map(c => {
      if (numericCols.has(c.n)) {
        const m = C.measureField(feats, c.n, 'UTF-8', 'N');
        const dec = Math.min(m.maxDec, 8);
        return { name: c.n, type: 'N', length: Math.min(20, Math.max(1, m.maxInt + (dec ? dec + 1 : 0))), decimals: dec };
      }
      const m = C.measureField(feats, c.n, 'EUC-KR', 'C');
      return { name: c.n, type: 'C', length: Math.min(254, Math.max(1, m.maxBytes)), decimals: 0 };
    });
    return { features: feats, fields, skipped };
  }

  g.ShpTable = { readTable, guessXY, toFeatures, toNumber, parseDelimited, decodeText };
})(typeof window !== 'undefined' ? window : globalThis);
