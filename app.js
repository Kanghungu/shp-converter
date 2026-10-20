/* SHP 좌표 변환기 - 화면 로직 */
(function () {
  'use strict';
  const C = window.ShpCore, A = window.ShpAdmin, T = window.ShpTable, D = window.ShpDb, F = window.ShpFormats;
  const SUPABASE_URL = 'https://bffczacwsfvbnxzsbnzb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_pZB5wwr0t6o7EuKGvemOiw_RPDWEwPj';
  const VWORLD_KEY = 'F8DC29AF-4DCB-43ED-B663-CACA75535E68';
  const BUCKET = 'shp-files';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const CAND_COLORS = ['#e8590c', '#1c7ed6', '#9c36b5', '#2b8a3e', '#c2255c', '#5f3dc4', '#0b7285'];

  const state = {
    layers: {},          // key -> {kind:'shp'|'table', name, ...}
    layerName: null,
    origBlob: null, origName: null,
    raw: [],             // 원본 좌표 features
    dbfFields: [],       // [{name,type,length,decimals}]
    prjText: null,
    diag: null, adm: null,
    fields: [],          // 편집 중인 컬럼 정의
    compare: new Set(),
    selected: -1,
    issues: [],
    srcTouched: false,
    overridden: null,
  };

  // ───────── 지도 ─────────
  const vw = (layer, ext) => `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${layer}/{z}/{y}/{x}.${ext}`;
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
        vbase: { type: 'raster', tiles: [vw('Base', 'png')], tileSize: 256, minzoom: 6, maxzoom: 19, attribution: '© VWorld' },
        vsat: { type: 'raster', tiles: [vw('Satellite', 'jpeg')], tileSize: 256, minzoom: 6, maxzoom: 19, attribution: '© VWorld' },
        vhyb: { type: 'raster', tiles: [vw('Hybrid', 'png')], tileSize: 256, minzoom: 6, maxzoom: 19 },
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' },
        { id: 'vbase', type: 'raster', source: 'vbase', layout: { visibility: 'none' } },
        { id: 'vsat', type: 'raster', source: 'vsat', layout: { visibility: 'none' } },
        { id: 'vhyb', type: 'raster', source: 'vhyb', layout: { visibility: 'none' } },
      ],
    },
    center: [127.8, 36.3], zoom: 6.3,
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  // 'load' 이벤트가 늦거나 누락되는 환경 대비: 스타일만 준비되면 진행
  const mapReady = new Promise(r => {
    map.on('load', r);
    const t = setInterval(() => { if (map.isStyleLoaded()) { clearInterval(t); r(); } }, 250);
  });

  const BASEMAPS = { base: ['vbase'], sat: ['vsat'], hyb: ['vsat', 'vhyb'], osm: [] };
  function setBasemap(k) {
    ['vbase', 'vsat', 'vhyb'].forEach(l => map.setLayoutProperty(l, 'visibility', BASEMAPS[k].includes(l) ? 'visible' : 'none'));
    try { localStorage.setItem('shpconv.basemap', k); } catch (e) { /* 저장 불가 무시 */ }
  }
  let vwFailed = false;
  map.on('error', e => {
    if (!vwFailed && e.sourceId && e.sourceId.startsWith('v') && e.sourceId !== 'osm') {
      vwFailed = true;
      toast('VWorld 지도를 불러오지 못했습니다. VWorld 키에 이 사이트 주소가 등록됐는지 확인하세요.', 6000);
    }
  });
  mapReady.then(() => {
    let k = 'base';
    try { k = localStorage.getItem('shpconv.basemap') || 'base'; } catch (e) { /* 기본값 */ }
    $('basemap').value = k; setBasemap(k);
  });
  $('basemap').onchange = e => setBasemap(e.target.value);

  function setLayer(id, data, color, main) {
    const src = map.getSource(id);
    if (src) src.setData(data);
    else {
      map.addSource(id, { type: 'geojson', data });
      map.addLayer({ id: id + '-fill', type: 'fill', source: id, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': main ? 0.3 : 0.15 } });
      map.addLayer({ id: id + '-line', type: 'line', source: id, filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': color, 'line-width': main ? 1.8 : 1.2, 'line-dasharray': main ? [1, 0] : [2, 1.5] } });
      map.addLayer({ id: id + '-pt', type: 'circle', source: id, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': color, 'circle-radius': main ? 5 : 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2, 'circle-opacity': main ? 1 : 0.75 } });
    }
  }
  function removeLayer(id) {
    ['-fill', '-line', '-pt'].forEach(s => map.getLayer(id + s) && map.removeLayer(id + s));
    map.getSource(id) && map.removeSource(id);
  }
  const fc = feats => ({ type: 'FeatureCollection', features: feats.map((f, i) => ({ ...f, id: i, properties: { ...(f.properties || {}), __i: i } })).filter(f => f.geometry) });
  function toWgsFeatures(code, swap, raw = state.raw) {
    try { return C.transformFeatures(raw, code, 'EPSG:4326', swap); } catch (e) { return []; }
  }
  async function drawMain(fit) {
    await mapReady;
    const wgs = toWgsFeatures($('srcCrs').value, $('swap').checked);
    setLayer('main', fc(wgs), '#d6336c', true);
    ['main-fill', 'main-line', 'main-pt'].forEach(l => map.moveLayer(l));
    drawSelection(wgs);
    map.triggerRepaint();
    if (fit) {
      const bb = C.rawBBox(wgs);
      if (bb && isFinite(bb.minX) && Math.abs(bb.minX) <= 180 && Math.abs(bb.maxY) <= 90) {
        map.fitBounds([[bb.minX, bb.minY], [bb.maxX, bb.maxY]], { padding: 50, maxZoom: 16, duration: 400 });
      }
    }
  }
  function drawSelection(wgs) {
    const f = state.selected >= 0 ? wgs[state.selected] : null;
    const data = { type: 'FeatureCollection', features: f && f.geometry ? [f] : [] };
    if (map.getSource('sel')) map.getSource('sel').setData(data);
    else {
      map.addSource('sel', { type: 'geojson', data });
      map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#ffd43b', 'line-width': 4 } });
      map.addLayer({ id: 'sel-pt', type: 'circle', source: 'sel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#ffd43b', 'circle-radius': 9, 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } });
    }
    ['sel-line', 'sel-pt'].forEach(l => map.moveLayer(l));
  }
  async function drawCompare() {
    await mapReady;
    Object.keys(map.getStyle().sources).filter(s => s.startsWith('cmp:')).forEach(s => { if (!state.compare.has(s.slice(4))) removeLayer(s); });
    const swap = $('swap').checked;
    [...state.compare].forEach(code => setLayer('cmp:' + code, fc(toWgsFeatures(code, swap)), colorOf(code), false));
    ['main-fill', 'main-line', 'main-pt', 'sel-line', 'sel-pt'].forEach(l => map.getLayer(l) && map.moveLayer(l));
  }
  const colorOf = code => CAND_COLORS[C.CRS.findIndex(c => c.code === code) % CAND_COLORS.length];

  map.on('click', e => {
    const layers = ['main-fill', 'main-line', 'main-pt'].filter(l => map.getLayer(l));
    if (!layers.length) return;
    const hit = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers })[0];
    if (!hit) return;
    const i = hit.properties.__i;
    selectRow(i, false);
    const p = state.raw[i].properties || {};
    const reg = A.isLoaded() ? A.locate(e.lngLat.lng, e.lngLat.lat) : null;
    const rows = Object.keys(p).map(k => `<tr><td>${esc(k)}</td><td>${esc(fmt(p[k]))}</td></tr>`).join('');
    new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(e.lngLat)
      .setHTML(`<b>#${i + 1}</b>${reg ? ` <span style="color:var(--muted)">· 위치: ${esc(reg.sido)} ${esc(reg.name)}</span>` : ''}<table>${rows}</table>`).addTo(map);
  });
  ['main-fill', 'main-pt', 'main-line'].forEach(l => {
    map.on('mouseenter', l, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', l, () => map.getCanvas().style.cursor = '');
  });

  // ───────── 유틸 ─────────
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = v => v === null || v === undefined ? '' : v instanceof Date ? C.fmtDate(v) : v;
  function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
  const baseName = n => n.replace(/\.[^.]+$/, '');
  const isTable = n => /\.(csv|tsv|txt|xlsx|xls)$/i.test(n);

  // 행정구역 경계는 미리 받아 둔다 (진단 정확도 향상)
  A.load('data/sgg.json').then(() => { if (state.raw.length) { state.diag = C.diagnose(state.raw, state.prjText); applyDefaultSrc(); renderDiag(); drawMain(false); } })
    .catch(() => toast('행정구역 경계 데이터를 불러오지 못해 간이 판정으로 진행합니다.', 4000));

  // ───────── 파일 읽기 ─────────
  const drop = $('drop');
  drop.onclick = () => $('file').click();
  $('file').onchange = e => { handleFiles([...e.target.files]); e.target.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); handleFiles([...e.dataTransfer.files]); };

  async function handleFiles(files, displayName) {
    if (!files.length) return;
    try {
      const layers = {};
      const put = (prefix, path, buf) => {
        const name = path.split('/').pop();
        const m = name.match(/^(.*)\.(shp|shx|dbf|prj|cpg)$/i);
        if (!m) return;
        const key = prefix + path.slice(0, path.length - 4);
        (layers[key] = layers[key] || { kind: 'shp', name: m[1] })[m[2].toLowerCase()] = buf;
      };
      const zips = files.filter(f => /\.zip$/i.test(f.name));
      for (const f of zips) {
        const zip = await JSZip.loadAsync(await f.arrayBuffer(), {
          decodeFileName: b => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('euc-kr').decode(b); } },
        });
        const prefix = zips.length > 1 ? baseName(f.name) + '/' : '';
        for (const path of Object.keys(zip.files)) {
          const ent = zip.files[path];
          if (ent.dir || path.startsWith('__MACOSX')) continue;
          if (isTable(path)) {
            const tables = await T.readTable(new File([await ent.async('arraybuffer')], path.split('/').pop()));
            tables.forEach(t => { layers[prefix + path + (tables.length > 1 ? ':' + t.name : '')] = { kind: 'table', name: baseName(path.split('/').pop()) + (tables.length > 1 ? '_' + t.name : ''), table: t }; });
          } else put(prefix, path, await ent.async('arraybuffer'));
        }
      }
      for (const f of files.filter(f => !/\.zip$/i.test(f.name))) {
        if (isTable(f.name)) {
          const tables = await T.readTable(f);
          tables.forEach(t => { layers[f.name + (tables.length > 1 ? ':' + t.name : '')] = { kind: 'table', name: baseName(f.name) + (tables.length > 1 ? '_' + t.name : ''), table: t }; });
        } else put('', f.name, await f.arrayBuffer());
      }
      const keys = Object.keys(layers).filter(k => layers[k].kind === 'table' || layers[k].shp);
      if (!keys.length) throw new Error('.shp / .csv / .xlsx 파일을 찾지 못했습니다.');
      // 원본 보관용 zip
      let origBlob, origName;
      if (zips.length === 1 && files.length === 1) { origBlob = files[0]; origName = displayName || files[0].name; }
      else {
        const z = new JSZip(); files.forEach(f => z.file(f.name, f));
        origBlob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        origName = (displayName || baseName(files[0].name)).replace(/\.zip$/i, '') + '.zip';
      }
      state.layers = {}; keys.forEach(k => state.layers[k] = layers[k]);
      state.origBlob = origBlob; state.origName = origName;
      $('layer').innerHTML = keys.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
      $('layerRow').classList.toggle('hidden', keys.length < 2);
      $('batchBox').classList.toggle('hidden', keys.length < 2);
      $('batchCount').textContent = keys.length;
      $('inEnc').value = 'auto';
      await loadLayer(keys[0]);
    } catch (err) {
      console.error(err); toast('파일을 읽지 못했습니다: ' + err.message, 4500);
    }
  }
  $('layer').onchange = e => loadLayer(e.target.value);
  $('inEnc').onchange = () => loadLayer(state.layerName, true);
  $('xCol').onchange = $('yCol').onchange = () => loadLayer(state.layerName, false, true);

  // 레이어 하나를 raw features 로 파싱 (일괄 변환에서도 사용)
  function parseLayer(L, opts = {}) {
    if (L.kind === 'table') {
      const xy = opts.xy || T.guessXY(L.table);
      const r = T.toFeatures(L.table, xy.x, xy.y);
      return { raw: r.features, fields: r.fields, prj: null, enc: L.table.enc, xy, skipped: r.skipped,
        meta: `${L.name} · ${r.features.length.toLocaleString()}행 · 점 (X: ${L.table.header[xy.x]}, Y: ${L.table.header[xy.y]})${r.skipped ? ` · 좌표 없음 ${r.skipped}행` : ''}<br>표 형식 · 문자 인코딩 ${L.table.enc}${xy.by === 'name' ? ' · 좌표 컬럼: 이름으로 인식' : xy.by === 'range' ? ' · 좌표 컬럼: 값 범위로 추정' : ' · 좌표 컬럼을 확인하세요'}` };
    }
    const cpg = L.cpg ? new TextDecoder().decode(L.cpg).trim() : null;
    let enc = opts.enc || 'auto';
    if (enc === 'auto') {
      if (cpg && /utf-?8/i.test(cpg)) enc = 'UTF-8';
      else if (cpg && /(949|euc|ksc|korean)/i.test(cpg)) enc = 'EUC-KR';
      else enc = L.dbf ? C.detectDbfEncoding(new Uint8Array(L.dbf)) : 'UTF-8';
    }
    const geoms = shp.parseShp(L.shp);           // prj를 넘기지 않아 원본 좌표 그대로
    const props = L.dbf ? shp.parseDbf(L.dbf, enc === 'UTF-8' ? 'UTF-8' : 'EUC-KR') : [];
    const raw = geoms.map((gm, i) => ({ type: 'Feature', geometry: gm, properties: props[i] || {} }));
    const fields = L.dbf ? C.readDbfFields(L.dbf, enc) : [];
    const prj = L.prj ? new TextDecoder().decode(L.prj) : null;
    const gtypes = [...new Set(geoms.filter(Boolean).map(gm => gm.type))].join(', ');
    return { raw, fields, prj, enc,
      meta: `${L.name} · ${geoms.length.toLocaleString()}건 · ${gtypes || '형상 없음'}<br>PRJ ${L.prj ? '있음' : '없음'} · CPG ${cpg || '없음'} → DBF ${enc} 로 읽음${L.shx ? '' : ' · SHX 없음'}` };
  }

  async function loadLayer(key, keepCrs, xyChanged) {
    const L = state.layers[key];
    state.layerName = key;
    const isTab = L.kind === 'table';
    $('encRow').classList.toggle('hidden', isTab);
    $('xyRow').classList.toggle('hidden', !isTab);
    let xy;
    if (isTab) {
      if (!xyChanged) {
        xy = T.guessXY(L.table);
        const opts = L.table.header.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('');
        $('xCol').innerHTML = opts; $('yCol').innerHTML = opts;
        $('xCol').value = xy.x; $('yCol').value = xy.y;
      } else xy = { x: +$('xCol').value, y: +$('yCol').value, by: 'user' };
    }
    const p = parseLayer(L, { enc: $('inEnc').value, xy });
    state.raw = p.raw; state.dbfFields = p.fields; state.prjText = p.prj; state.selected = -1;
    $('fileMeta').innerHTML = p.meta;

    if (!keepCrs) {
      state.diag = C.diagnose(state.raw, p.prj);
      state.srcTouched = false;
      renderCrsOptions();
      applyDefaultSrc();
      $('outName').value = baseName(L.name) + '_conv';
      state.fields = buildFields();
    } else {
      const old = state.fields;
      state.fields = buildFields().map((f, i) => old[i] ? { ...f, newName: /[^\x00-\x7F]/.test(old[i].newName) ? f.newName : old[i].newName, use: old[i].use } : f);
    }
    ['secDiag', 'secOut', 'secFields', 'secExport', 'secCheck'].forEach(id => $(id).classList.remove('hidden'));
    state.issues = F.checkGeometries(state.raw);
    renderDiag(); renderFields(); renderAttr(); renderChecks(); refreshDdl();
    await drawMain(true); await drawCompare();
  }

  // ───────── 진단 ─────────
  function renderCrsOptions() {
    const d = state.diag;
    const candSet = new Set(d.candidates.map(c => c.code));
    $('srcCrs').innerHTML = C.CRS.map(c => `<option value="${c.code}">${candSet.has(c.code) ? '● ' : ''}${c.code} · ${esc(c.name)}${d.declared && d.declared.code === c.code ? ' (PRJ)' : ''}</option>`).join('');
    if (!$('dstCrs').options.length) {
      $('dstCrs').innerHTML = C.CRS.map(c => `<option value="${c.code}">${c.code} · ${esc(c.name)}</option>`).join('');
      $('dstCrs').value = 'EPSG:5186';
    }
  }
  // 원본 좌표계 결정: PRJ/육지 비율 → 행정구역 대조가 강하게 다른 답을 주면 그것을 우선
  function chooseSrc(raw, fieldNames, d) {
    let code = C.pickDefault(d), swap = !!d.swapSuggested;
    if (swap) code = d.swapSuggested;
    let note = d.declared && d.declared.code === code ? 'PRJ' : '자동 추정', overridden = null;
    if (A.isLoaded()) {
      const r = A.adminDiagnose(raw, fieldNames, code, swap);
      const sug = r.messages.find(m => m.suggest);
      const best = r.result && r.result.ranking[0], sel = r.result && r.result.selected;
      if (sug && best && best.score >= 0.75 && (!sel || sel.score <= best.score - 0.3)) {
        code = sug.suggest; note = '행정구역 대조';
      }
    }
    // PRJ에 적힌 좌표계와 다른 것을 골랐다면 그 사실을 알린다
    if (d.declared && d.declared.code && d.declared.code !== code) overridden = d.declared.code;
    return { code, swap, note, overridden };
  }
  function applyDefaultSrc() {
    if (state.srcTouched) return;
    const r = chooseSrc(state.raw, state.dbfFields.map(f => f.name), state.diag);
    state.overridden = r.overridden;
    $('srcCrs').value = r.code; $('swap').checked = r.swap;
    state.compare.clear();
  }
  function renderDiag() {
    const d = state.diag;
    const src = $('srcCrs').value, swap = $('swap').checked;
    let msgs = d.messages.slice();
    state.adm = null;
    if (A.isLoaded()) {
      state.adm = A.adminDiagnose(state.raw, state.dbfFields.map(f => f.name), src, swap);
      msgs = msgs.concat(state.adm.messages);
    } else msgs.push({ level: 'info', text: '행정구역 경계 데이터를 불러오는 중입니다…' });
    if (state.overridden && !state.srcTouched) msgs.unshift({ level: 'warn', text: `PRJ에는 ${state.overridden}로 적혀 있지만, ${state.adm && state.adm.result && state.adm.result.selected && state.adm.result.selected.score >= 0.7 ? '속성의 행정구역 대조' : '좌표 위치(육지 비율)'} 결과에 따라 ${src}를 원본 좌표계로 선택했습니다.`, suggest: state.overridden, label: 'PRJ대로 되돌리기' });
    $('msgs').innerHTML = msgs.map(m => `<div class="msg ${m.level}">${esc(m.text)}${m.suggest && m.suggest !== src ? ` <button class="mini" data-apply="${m.suggest}">${m.label || m.suggest + ' 적용'}</button>` : ''}</div>`).join('');
    $('msgs').querySelectorAll('[data-apply]').forEach(b => b.onclick = () => { $('srcCrs').value = b.dataset.apply; state.srcTouched = true; onSrcChange(); });
    renderCands(); renderChecks();
  }
  function renderCands() {
    const d = state.diag;
    const src = $('srcCrs').value;
    const set = new Set(d.candidates.map(c => c.code));
    if (state.adm && state.adm.result) state.adm.result.ranking.filter(r => r.score >= 0.5).forEach(r => set.add(r.code));
    const list = [...set].filter(c => c !== src);
    $('cands').innerHTML = list.map(c => `<span class="cand ${state.compare.has(c) ? 'on' : ''}" data-c="${c}"><i style="background:${colorOf(c)}"></i>${c} 비교</span>`).join('');
    $('cands').querySelectorAll('.cand').forEach(el => el.onclick = () => {
      const c = el.dataset.c;
      state.compare.has(c) ? state.compare.delete(c) : state.compare.add(c);
      renderCands(); drawCompare();
    });
  }
  function onSrcChange() { state.compare.delete($('srcCrs').value); renderDiag(); refreshDdl(); drawMain(true); drawCompare(); }
  $('srcCrs').onchange = () => { state.srcTouched = true; onSrcChange(); };
  $('swap').onchange = () => { state.srcTouched = true; onSrcChange(); };

  // ───────── 검사 결과 ─────────
  function renderChecks() {
    const items = state.issues.map(x => ({ i: x.i, text: x.text, level: x.type === 'dup' ? 'warn' : 'error' }));
    if (state.adm && state.adm.result && state.adm.result.selected) {
      state.adm.result.selected.misses.forEach(m => items.push({ i: m.i, level: 'warn', text: `속성 행정구역과 다른 곳에 위치 (좌표 위치: ${m.got})` }));
    }
    items.sort((a, b) => a.i - b.i);
    const cnt = items.length;
    $('checkSummary').textContent = cnt ? `${cnt}건` : '문제 없음';
    $('checkList').innerHTML = cnt ? items.slice(0, 300).map(x => `<li data-i="${x.i}"><span class="${x.level}">#${x.i + 1}</span> ${esc(x.text)}</li>`).join('') + (cnt > 300 ? `<li>… 외 ${cnt - 300}건</li>` : '')
      : '<li class="empty" style="padding:4px 0">형상 오류·중복·위치 불일치가 발견되지 않았습니다.</li>';
    $('checkList').querySelectorAll('li[data-i]').forEach(li => li.onclick = () => selectRow(+li.dataset.i, true));
  }

  // ───────── 컬럼 편집 ─────────
  function suggestName(n) {
    const ascii = n.replace(/[^A-Za-z0-9_]/g, '');
    return ascii && /^[A-Za-z]/.test(ascii) && ascii.length === n.length ? n.toUpperCase().slice(0, 10) : n;
  }
  function buildFields(raw = state.raw, dbfFields = state.dbfFields, enc = $('outEnc').value) {
    return dbfFields.map(f => {
      const t = ['N', 'F'].includes(f.type) ? 'N' : ['D', 'L'].includes(f.type) ? f.type : 'C';
      const m = C.measureField(raw, f.name, enc, t);
      return { src: f.name, newName: suggestName(f.name), type: t, length: f.length, decimals: f.decimals, use: true,
        maxBytes: m.maxBytes, origType: f.type, origLen: f.length, comment: /[^\x00-\x7F]/.test(f.name) ? f.name : '' };
    });
  }
  function remeasure() {
    const enc = $('outEnc').value;
    state.fields.forEach(f => { f.maxBytes = C.measureField(state.raw, f.src, enc, f.type).maxBytes; });
  }
  function renderFields() {
    const enc = $('outEnc').value, target = $('dbTarget').value;
    const warns = C.validateFields(state.fields, enc);
    $('fieldBody').innerHTML = state.fields.map((f, i) => {
      const dbl = f.type === 'C' ? D.dbLength(state.raw, f, target) : null;
      return `
      <tr data-i="${i}">
        <td><input type="checkbox" data-k="use" ${f.use ? 'checked' : ''}></td>
        <td class="src" title="${esc(f.src)} (${f.origType}${f.origLen})">${esc(f.src)}</td>
        <td><input type="text" data-k="newName" value="${esc(f.newName)}">
          <div class="fw">${warns[i].map(w => `<span class="${w.level}">${esc(w.text)}</span>`).join(' · ')}${f.type === 'C' && f.use ? `${warns[i].length ? ' · ' : ''}<span style="color:var(--muted)">DBF ${f.maxBytes}B · DB ${dbl}${target === 'PG' ? '자' : 'B'}</span>` : ''}</div></td>
        <td><select data-k="type">${['C', 'N', 'D', 'L'].map(t => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input type="number" data-k="length" min="1" max="254" value="${f.length}" ${['D', 'L'].includes(f.type) ? 'disabled' : ''}></td>
        <td><input type="number" data-k="decimals" min="0" max="15" value="${f.decimals}" ${f.type !== 'N' ? 'disabled' : ''}></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">속성 컬럼이 없습니다.</td></tr>';
    $('fieldBody').querySelectorAll('input,select').forEach(el => {
      el.onchange = () => {
        const f = state.fields[+el.closest('tr').dataset.i], k = el.dataset.k;
        if (k === 'use') f.use = el.checked;
        else if (k === 'length' || k === 'decimals') f[k] = Math.max(0, parseInt(el.value, 10) || 0);
        else f[k] = el.value;
        if (k === 'type') { if (f.type === 'D') f.length = 8; if (f.type === 'L') f.length = 1; if (f.type !== 'N') f.decimals = 0; remeasure(); }
        renderFields(); refreshDdl();
      };
    });
  }
  $('outEnc').onchange = () => { remeasure(); renderFields(); };
  $('dbTarget').onchange = () => { renderFields(); refreshDdl(); };
  $('btnUpper').onclick = () => { state.fields.forEach(f => { if (!/[^\x00-\x7F]/.test(f.newName)) f.newName = f.newName.toUpperCase(); }); renderFields(); refreshDdl(); };
  $('btnStd').onclick = () => {
    let n = 0, partial = 0;
    state.fields.forEach(f => {
      if (!/[^\x00-\x7F]/.test(f.src) && !/[^\x00-\x7F]/.test(f.newName)) return;
      const s = D.suggestColumnName(f.src);
      f.newName = s.name; f.comment = f.comment || f.src; n++; if (!s.full) partial++;
    });
    renderFields(); refreshDdl();
    toast(n ? `${n}개 컬럼에 표준 약어를 제안했습니다.${partial ? ` ${partial}개는 사전에 없는 단어가 있어 확인이 필요합니다.` : ''}` : '한글 컬럼명이 없습니다.', 4000);
  };
  $('btnFit').onclick = () => {
    const enc = $('outEnc').value;
    state.fields.forEach(f => {
      const m = C.measureField(state.raw, f.src, enc, f.type);
      if (f.type === 'C') f.length = Math.min(254, Math.max(1, m.maxBytes));
      if (f.type === 'N') { f.decimals = Math.min(m.maxDec, 15); f.length = Math.min(20, Math.max(1, m.maxInt + (f.decimals ? f.decimals + 1 : 0))); }
    });
    renderFields(); refreshDdl(); toast('실제 데이터 기준으로 길이를 맞췄습니다.');
  };

  // ───────── 속성 테이블 ─────────
  function renderAttr() {
    const cols = state.dbfFields.map(f => f.name);
    const n = Math.min(state.raw.length, 500);
    let h = `<table><thead><tr><th>#</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
    for (let i = 0; i < n; i++) {
      const p = state.raw[i].properties;
      h += `<tr data-i="${i}" class="${i === state.selected ? 'sel' : ''}"><td>${i + 1}</td>${cols.map(c => `<td>${esc(fmt(p[c]))}</td>`).join('')}</tr>`;
    }
    h += '</tbody></table>';
    if (state.raw.length > n) h += `<div class="empty">처음 ${n}건만 표시 (전체 ${state.raw.length.toLocaleString()}건)</div>`;
    $('attr').innerHTML = h;
    $('attr').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => selectRow(+tr.dataset.i, true));
  }
  function selectRow(i, zoom) {
    state.selected = i;
    $('attr').querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i === i));
    const tr = $('attr').querySelector(`tr[data-i="${i}"]`); if (tr) tr.scrollIntoView({ block: 'nearest' });
    const wgs = toWgsFeatures($('srcCrs').value, $('swap').checked);
    drawSelection(wgs);
    if (zoom && wgs[i] && wgs[i].geometry) {
      const bb = C.rawBBox([wgs[i]]);
      if (bb.minX === bb.maxX) map.flyTo({ center: [bb.minX, bb.minY], zoom: Math.max(map.getZoom(), 15) });
      else map.fitBounds([[bb.minX, bb.minY], [bb.maxX, bb.maxY]], { padding: 80, maxZoom: 17 });
    } else if (zoom) toast('이 행은 형상이 없습니다.');
  }

  // ───────── 내보내기 ─────────
  const FORMATS = { shp: 'SHP (.zip)', geojson: 'GeoJSON', kml: 'KML (WGS84)', csv: 'CSV', ora: 'Oracle SQL (DDL+INSERT)', pg: 'PostGIS SQL (DDL+INSERT)' };
  $('fmt').innerHTML = Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('fmt').onchange = () => {
    const f = $('fmt').value;
    if (f === 'pg' && $('dbTarget').value !== 'PG') $('dbTarget').value = 'PG';
    if (f === 'ora' && $('dbTarget').value === 'PG') $('dbTarget').value = 'ORA_UTF8';
    renderFields(); refreshDdl();
  };
  const tableName = name => (name || '').replace(/[^A-Za-z0-9_]/g, '').replace(/^[^A-Za-z]+/, '').slice(0, 30) || 'NEW_LAYER';
  const encodeText = (text, enc) => enc === 'EUC-KR' ? C.encodeStr(text, 'EUC-KR') : new TextEncoder().encode('﻿' + text);

  // 한 레이어 변환 → [{name, data}]
  function exportLayer({ raw, fields, src, dst, swap, fmt, name, enc, target }) {
    const errs = C.validateFields(fields, enc).flat().filter(w => w.level === 'error');
    if (fmt === 'shp' && errs.length) throw new Error(`${name}: 컬럼 설정 오류 - ${errs[0].text}`);
    const out = C.transformFeatures(raw, src, dst, swap);
    const files = [];
    if (fmt === 'shp') {
      const { shp: shpBuf, shx, type } = C.writeShpShx(out);
      if (!type) throw new Error(`${name}: 지원하지 않거나 비어 있는 형상입니다.`);
      files.push({ name: name + '.shp', data: shpBuf }, { name: name + '.shx', data: shx }, { name: name + '.dbf', data: C.writeDbf(out, fields, enc) },
        { name: name + '.prj', data: C.byCode[dst].wkt }, { name: name + '.cpg', data: enc === 'UTF-8' ? 'UTF-8' : 'EUC-KR' });
    } else if (fmt === 'geojson') files.push({ name: name + '.geojson', data: F.geojson(out, fields, dst) });
    else if (fmt === 'kml') files.push({ name: name + '.kml', data: F.kml(C.transformFeatures(raw, src, 'EPSG:4326', swap), fields, name) });
    else if (fmt === 'csv') files.push({ name: name + '.csv', data: encodeText(F.csv(out, fields, dst), enc) });
    else {
      const gtype = C.writeShpShx(out.filter(f => f.geometry).slice(0, 1)).type;
      const tgt = fmt === 'pg' ? 'PG' : (target === 'PG' ? 'ORA_UTF8' : target);
      const o = { table: tableName(name), fields, srid: dst, gtype, target: tgt, features: out };
      files.push({ name: name + '.sql', data: D.ddl(o) + '\n' + D.inserts(o) });
    }
    return files;
  }
  async function zipFiles(files) {
    const zip = new JSZip(); files.forEach(f => zip.file(f.name, f.data));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const outName = () => ($('outName').value || 'output').replace(/[\\/:*?"<>|]/g, '_');
  function currentExport(fmt = $('fmt').value) {
    return exportLayer({ raw: state.raw, fields: state.fields.filter(f => f.use), src: $('srcCrs').value, dst: $('dstCrs').value,
      swap: $('swap').checked, fmt, name: outName(), enc: $('outEnc').value, target: $('dbTarget').value });
  }
  $('btnDownload').onclick = async () => {
    try {
      const fmt = $('fmt').value;
      const files = currentExport(fmt);
      if (files.length === 1) {
        const d = files[0].data;
        saveBlob(new Blob([d], { type: 'application/octet-stream' }), files[0].name);
      } else saveBlob(await zipFiles(files), outName() + '.zip');
      toast(`${state.raw.length.toLocaleString()}건을 ${$('dstCrs').value} · ${FORMATS[fmt]}로 내보냈습니다.`);
    } catch (e) { console.error(e); toast(e.message, 4500); }
  };
  function refreshDdl() { if (!$('ddlBox').classList.contains('hidden')) showDdl(); }
  function showDdl() {
    const use = state.fields.filter(f => f.use);
    const out = C.transformFeatures(state.raw, $('srcCrs').value, $('dstCrs').value, $('swap').checked);
    const gtype = C.writeShpShx(out.filter(f => f.geometry).slice(0, 1)).type;
    const o = { table: tableName($('outName').value), fields: use, srid: $('dstCrs').value, gtype, target: $('dbTarget').value, features: out };
    const ins = D.inserts({ ...o, features: out.slice(0, 5) });
    $('ddl').value = D.ddl(o) + '\n-- INSERT 예시 (처음 5건, 전체는 SQL 형식으로 다운로드)\n' + ins;
    $('ddlBox').classList.remove('hidden');
  }
  $('btnDdl').onclick = () => $('ddlBox').classList.contains('hidden') ? showDdl() : $('ddlBox').classList.add('hidden');
  $('dstCrs').onchange = refreshDdl;

  // ───────── 일괄 변환 ─────────
  $('btnBatch').onclick = async () => {
    const btn = $('btnBatch'); btn.disabled = true;
    const report = [];
    try {
      const fmt = $('fmt').value, dst = $('dstCrs').value, enc = $('outEnc').value, target = $('dbTarget').value;
      const sameSrc = $('batchSameSrc').checked;
      const preset = Object.fromEntries(state.fields.map(f => [f.src, f]));
      const all = [];
      for (const key of Object.keys(state.layers)) {
        const L = state.layers[key];
        try {
          const p = parseLayer(L, { enc: 'auto' });
          let src, swap = false, note;
          if (sameSrc) { src = $('srcCrs').value; swap = $('swap').checked; note = '현재 설정'; }
          else {
            const d = C.diagnose(p.raw, p.prj);
            const ch = chooseSrc(p.raw, p.fields.map(f => f.name), d);
            src = ch.code; swap = ch.swap; note = ch.note + (ch.overridden ? ` (PRJ ${ch.overridden} 무시)` : '');
            if (d.messages.some(m => m.level === 'error')) note += ' ⚠';
          }
          const fields = buildFields(p.raw, p.fields, enc).map(f => {
            const pr = preset[f.src];
            if (pr) return { ...f, newName: pr.newName, type: pr.type, length: pr.length, decimals: pr.decimals, use: pr.use };
            if (/[^\x00-\x7F]/.test(f.src)) { const s = D.suggestColumnName(f.src); if (C.byteLen(f.src, enc) > 10) f.newName = s.name.slice(0, 10); }
            return f;
          }).filter(f => f.use);
          const nm = (L.name || 'layer').replace(/[\\/:*?"<>|]/g, '_') + '_conv';
          const files = exportLayer({ raw: p.raw, fields, src, dst, swap, fmt, name: nm, enc, target });
          const folder = Object.keys(state.layers).length > 1 && fmt === 'shp' ? nm + '/' : '';
          files.forEach(f => all.push({ name: folder + f.name, data: f.data }));
          report.push(`${key}: ${p.raw.length}건 · ${src}${swap ? '(X/Y 교환)' : ''} [${note}] → ${dst}`);
        } catch (e) { report.push(`${key}: 실패 - ${e.message}`); }
      }
      all.push({ name: '_변환결과.txt', data: report.join('\r\n') + '\r\n' });
      saveBlob(await zipFiles(all), 'batch_' + dst.replace(':', '') + '.zip');
      $('batchReport').textContent = report.join('\n'); $('batchReport').classList.remove('hidden');
      toast(`${report.length}개 레이어를 처리했습니다.`);
    } catch (e) { console.error(e); toast(e.message, 4500); }
    finally { btn.disabled = false; }
  };

  // ───────── 프리셋 (브라우저 저장) ─────────
  const PRESET_KEY = 'shpconv.presets';
  const readPresets = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch (e) { return {}; } };
  function renderPresets() {
    const p = readPresets();
    $('presetSel').innerHTML = '<option value="">프리셋 선택…</option>' + Object.keys(p).map(k => `<option>${esc(k)}</option>`).join('');
  }
  $('btnPresetSave').onclick = () => {
    const name = ($('presetName').value || '').trim();
    if (!name) { toast('프리셋 이름을 입력하세요.'); return; }
    const p = readPresets();
    p[name] = { dst: $('dstCrs').value, enc: $('outEnc').value, fmt: $('fmt').value, target: $('dbTarget').value,
      fields: Object.fromEntries(state.fields.map(f => [f.src, { newName: f.newName, type: f.type, length: f.length, decimals: f.decimals, use: f.use, comment: f.comment }])) };
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); renderPresets(); $('presetSel').value = name; toast(`프리셋 '${name}'을 저장했습니다 (이 브라우저).`); }
    catch (e) { toast('브라우저 저장소를 사용할 수 없습니다.'); }
  };
  $('presetSel').onchange = () => {
    const pr = readPresets()[$('presetSel').value];
    if (!pr) return;
    $('dstCrs').value = pr.dst; $('outEnc').value = pr.enc; $('fmt').value = pr.fmt; $('dbTarget').value = pr.target;
    let hit = 0;
    state.fields.forEach(f => { const s = pr.fields[f.src]; if (s) { Object.assign(f, s); hit++; } });
    remeasure(); renderFields(); refreshDdl();
    toast(`프리셋 적용: 출력 설정 + 컬럼 ${hit}개`);
  };
  $('btnPresetDel').onclick = () => {
    const k = $('presetSel').value; if (!k) return;
    const p = readPresets(); delete p[k];
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ }
    renderPresets(); toast(`프리셋 '${k}'을 삭제했습니다.`);
  };
  renderPresets();

  // ───────── 서버 저장 (Supabase) ─────────
  const geomLabel = t => ({ 1: 'Point', 8: 'MultiPoint', 3: 'PolyLine', 5: 'Polygon' }[t] || '-');
  async function uploadZip(blob, fileName, kind, meta) {
    const path = `${kind}/${crypto.randomUUID()}.zip`;   // 스토리지 키는 영문만 허용 → 원래 이름은 DB에
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'application/zip' });
    if (up.error) throw up.error;
    const bb = meta.bbox;
    const rpc = await sb.rpc('register_shp_file', {
      p_file_name: fileName, p_storage_path: path, p_kind: kind,
      p_src_crs: meta.src, p_dst_crs: meta.dst || null, p_geom_type: meta.geom, p_feature_count: meta.count,
      p_minx: bb ? bb.minX : null, p_miny: bb ? bb.minY : null, p_maxx: bb ? bb.maxX : null, p_maxy: bb ? bb.maxY : null,
    });
    if (rpc.error) throw rpc.error;
  }
  $('btnSave').onclick = async () => {
    const btn = $('btnSave'); btn.disabled = true; btn.textContent = '저장 중…';
    try {
      const files = currentExport('shp');
      const blob = await zipFiles(files);
      const wgs = toWgsFeatures($('srcCrs').value, $('swap').checked);
      const bb = C.rawBBox(wgs);
      const okBox = bb && Math.abs(bb.minX) <= 180 && Math.abs(bb.maxY) <= 90 ? bb : null;
      const type = C.writeShpShx(state.raw.filter(f => f.geometry).slice(0, 1)).type;
      const meta = { src: $('srcCrs').value, geom: geomLabel(type), count: state.raw.length, bbox: okBox };
      if ($('saveOrig').checked && state.origBlob) await uploadZip(state.origBlob, state.origName, 'original', meta);
      await uploadZip(blob, outName() + '.zip', 'converted', { ...meta, dst: $('dstCrs').value });
      toast('서버에 저장했습니다.'); loadStored();
    } catch (e) { console.error(e); toast('저장 실패: ' + (e.message || e), 4500); }
    finally { btn.disabled = false; btn.textContent = '서버에 저장 (SHP)'; }
  };

  async function loadStored() {
    const ul = $('stored');
    const { data, error } = await sb.from('shp_files').select('*').order('created_at', { ascending: false }).limit(30);
    if (error) { ul.innerHTML = `<li class="empty">목록을 불러오지 못했습니다: ${esc(error.message)}</li>`; return; }
    if (!data.length) { ul.innerHTML = '<li class="empty">아직 저장된 파일이 없습니다.</li>'; return; }
    ul.innerHTML = data.map(r => `<li>
      <span class="tag">${r.kind === 'original' ? '원본' : '변환'}</span>
      <span class="n" title="${esc(r.file_name)}">${esc(r.file_name)}<br><small>${esc(r.kind === 'converted' ? `${r.src_crs} → ${r.dst_crs}` : r.src_crs || '')} · ${r.feature_count ?? '-'}건 · ${new Date(r.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</small></span>
      <button data-a="open" data-p="${esc(r.storage_path)}" data-n="${esc(r.file_name)}">열기</button>
      <button data-a="dl" data-p="${esc(r.storage_path)}" data-n="${esc(r.file_name)}">받기</button></li>`).join('');
    ul.querySelectorAll('button').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        const { data: blob, error: err } = await sb.storage.from(BUCKET).download(b.dataset.p);
        if (err) throw err;
        if (b.dataset.a === 'dl') saveBlob(blob, b.dataset.n);
        else { await handleFiles([new File([blob], b.dataset.n)], b.dataset.n); toast(`${b.dataset.n}을(를) 열었습니다.`); }
      } catch (e) { toast('실패: ' + (e.message || e), 4000); }
      finally { b.disabled = false; }
    });
  }
  $('btnRefresh').onclick = loadStored;
  loadStored();

  window.__shpApp = { state, handleFiles, loadLayer, map };   // 테스트용
})();
