// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 noknok / Christopher Houben
//
// noknok Display Planner - the UI. Two tabs on top of the same engine:
//   Layout: regions on a to-scale display + pixel-true preview (layout.js -> render.js) + Python export.
//   Icons:  a 1-bit pixel editor + image converter; exports ICONS[...] snippets and .bmp files.
// State lives in `layout` (the layout.json model) and `lib` (the maker's icons, shared by both
// tabs). Both are autosaved to localStorage. No framework, no build step.
(function () {
  'use strict';
  const N = NDP, L = NDP_LAYOUT, { Bitmap, Display } = N;
  const $ = id => document.getElementById(id);
  const LS_LAYOUT = 'ndp.layout.v1', LS_ICONS = 'ndp.icons.v1';

  // ── shared helpers ─────────────────────────────────────────────────────────
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1600); }
  function download(name, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('copied'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('copied'); }
  }
  const hex6 = v => '#' + (v & 0xFFFFFF).toString(16).padStart(6, '0');
  const colorNames = Object.keys(N.D.colors).filter(n => n !== 'gray' && n !== 'darkgray');
  // a colour <select> with the noknok names + "custom"; paired with a colour picker
  function fillColorSelect(sel, extra) {
    sel.innerHTML = '';
    for (const e of (extra || [])) { const o = document.createElement('option'); o.value = e[0]; o.textContent = e[1]; sel.appendChild(o); }
    for (const n of colorNames) { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
    const o = document.createElement('option'); o.value = '__custom'; o.textContent = 'custom (picker)'; sel.appendChild(o);
  }
  // show a stored colour ("yellow" | "#rrggbb" | "auto") in a select + picker pair
  function showColor(sel, pick, value) {
    if (value === 'auto') { sel.value = 'auto'; pick.value = '#000000'; return; }
    if (L.isNamedColor(value)) { sel.value = value.toLowerCase(); pick.value = hex6(L.colorValue(value)); }
    else { sel.value = '__custom'; pick.value = hex6(L.colorValue(value)); }
  }
  function readColor(sel, pick) { return sel.value === '__custom' ? pick.value : sel.value; }
  function paintBitmap(cv, bm, scale, fg, bg) {   // draw a Bitmap onto a canvas at integer scale
    cv.width = Math.max(1, bm.width * scale); cv.height = Math.max(1, bm.height * scale);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = hex6(N.rgb565to888(N.rgb565(bg))); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = hex6(N.rgb565to888(N.rgb565(fg)));
    for (let y = 0; y < bm.height; y++) for (let x = 0; x < bm.width; x++) if (bm.get(x, y)) ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  function fitInto(cv, bm, maxPx, fg, bg) { paintBitmap(cv, bm, Math.max(1, Math.floor(maxPx / Math.max(bm.width, bm.height))), fg, bg); }

  // ── image -> 1-bit conversion (shared by both tabs) ────────────────────────
  // opt: { fit: 'fit'|'stretch'|'crop', source: 'auto'|'lum'|'alpha', threshold: 1..254, dither, invert }
  function imageToBitmap(img, w, h, opt) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (opt.fit === 'stretch') ctx.drawImage(img, 0, 0, w, h);
    else {
      const s = opt.fit === 'crop' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
      const dw = Math.max(1, Math.round(iw * s)), dh = Math.max(1, Math.round(ih * s));
      ctx.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    }
    const px = ctx.getImageData(0, 0, w, h).data;
    let hasAlpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 128) { hasAlpha = true; break; }
    const source = opt.source === 'auto' ? (hasAlpha ? 'alpha' : 'lum') : opt.source;
    // grey value per pixel: brightness (transparent = black) or opacity
    const v = new Float32Array(w * h);
    for (let i = 0, p = 0; i < v.length; i++, p += 4) {
      const a = px[p + 3] / 255;
      v[i] = source === 'alpha' ? px[p + 3] : (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) * a;
    }
    const bm = new Bitmap(w, h), thr = opt.threshold;
    if (opt.dither) {                                  // Floyd-Steinberg, serpentine-free, clamped
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, old = v[i], on = old >= thr, err = old - (on ? 255 : 0);
        if (on) bm.set(x, y);
        if (x + 1 < w) v[i + 1] += err * 7 / 16;
        if (y + 1 < h) { if (x > 0) v[i + w - 1] += err * 3 / 16; v[i + w] += err * 5 / 16; if (x + 1 < w) v[i + w + 1] += err * 1 / 16; }
      }
    } else for (let i = 0; i < v.length; i++) if (v[i] >= thr) bm.set(i % w, (i / w) | 0);
    return opt.invert ? bm.inverted() : bm;
  }
  function loadImageFile(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { res(img); }; img.onerror = () => rej(new Error('cannot read ' + file.name));
      img.src = url;
    });
  }
  function wireDrop(zone, onFile) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }
  function seg(el, attr, onPick) {                   // segmented buttons: returns setter
    const btns = [...el.querySelectorAll('button')];
    btns.forEach(b => b.addEventListener('click', () => { btns.forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset[attr]); }));
    return v => btns.forEach(x => x.classList.toggle('on', x.dataset[attr] === String(v)));
  }
  function pngFromBitmap(bm, scale) { const cv = document.createElement('canvas'); paintBitmap(cv, bm, scale, 'white', 'black'); return new Promise(res => cv.toBlob(res, 'image/png')); }

  // ═══════════════════════════ STATE ═══════════════════════════════════════
  let layout = L.newLayout();
  let lib = {};                                      // the maker's icons: name -> rows
  try { const s = localStorage.getItem(LS_ICONS); if (s) lib = JSON.parse(s) || {}; } catch (e) { }
  try { const s = localStorage.getItem(LS_LAYOUT); if (s) layout = L.fromJSON(s); } catch (e) { }
  layout.icons = lib;                                // one library, referenced by the layout
  function persist() {
    try { localStorage.setItem(LS_LAYOUT, L.toJSON(layout)); localStorage.setItem(LS_ICONS, JSON.stringify(lib)); } catch (e) { }
  }

  // tabs
  const mains = { layout: $('mainLayout'), icons: $('mainIcons') };
  function showTab(t) {
    $('tabLayout').classList.toggle('on', t === 'layout'); $('tabIcons').classList.toggle('on', t === 'icons');
    mains.layout.classList.toggle('on', t === 'layout'); mains.icons.classList.toggle('on', t === 'icons');
    if (t === 'layout') { refreshIconSelect(); redrawAll(); } else { drawEditor(); refreshLibList(); }
  }
  $('tabLayout').onclick = () => showTab('layout'); $('tabIcons').onclick = () => showTab('icons');

  // ═══════════════════════════ LAYOUT TAB ══════════════════════════════════
  const cv = $('plannerCanvas'), ctx = cv.getContext('2d'), off = document.createElement('canvas');
  const PAD = 18;
  let zoom = 4, sel = null, drag = null, hover = null;
  const srcOf = new WeakMap();                      // region -> {img, name, opt} for re-conversion (session only)

  // display settings widgets
  for (const p of L.PRESETS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; $('preset').appendChild(o); }
  for (const r of L.ROTATIONS) { const o = document.createElement('option'); o.value = r.id; o.textContent = r.label; $('rotation').appendChild(o); }
  fillColorSelect($('bgSel'));
  fillColorSelect($('rColor'));
  fillColorSelect($('rBg'), [['auto', 'auto (= background)']]);

  function syncDisplayWidgets() {
    $('preset').value = layout.display.preset;
    $('customSize').style.display = layout.display.preset === 'custom' ? 'flex' : 'none';
    $('dispW').value = layout.display.width; $('dispH').value = layout.display.height;
    $('rotation').value = layout.display.rotation;
    showColor($('bgSel'), $('bgPick'), layout.bg);
    $('pzOn').checked = !!layout.printZone.enabled; $('pzRow').style.display = layout.printZone.enabled ? 'flex' : 'none';
    $('pzSize').value = layout.printZone.size; $('pzLines').value = layout.printZone.lines;
  }
  $('preset').onchange = () => {
    const p = L.PRESETS.find(x => x.id === $('preset').value);
    layout.display.preset = p.id;
    if (p.id !== 'custom') { layout.display.width = p.width; layout.display.height = p.height; }
    syncDisplayWidgets(); redrawAll();
  };
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v, 10) || lo));
  $('dispW').onchange = () => { layout.display.width = clampInt($('dispW').value, 1, 255); syncDisplayWidgets(); redrawAll(); };
  $('dispH').onchange = () => { layout.display.height = clampInt($('dispH').value, 1, 255); syncDisplayWidgets(); redrawAll(); };
  $('rotation').onchange = () => { layout.display.rotation = parseInt($('rotation').value, 10) & 3; redrawAll(); };
  $('bgSel').onchange = () => { if ($('bgSel').value !== '__custom') layout.bg = $('bgSel').value; else layout.bg = $('bgPick').value; syncDisplayWidgets(); redrawAll(); };
  $('bgPick').oninput = () => { layout.bg = $('bgPick').value; $('bgSel').value = '__custom'; redrawAll(); };
  $('pzOn').onchange = () => { layout.printZone.enabled = $('pzOn').checked; syncDisplayWidgets(); redrawAll(); };
  $('pzSize').onchange = () => { layout.printZone.size = clampInt($('pzSize').value, 1, 255); redrawAll(); };
  $('pzLines').onchange = () => { layout.printZone.lines = clampInt($('pzLines').value, 1, 64); redrawAll(); };
  seg($('zoomSeg'), 'z', z => { zoom = parseInt(z, 10); drawPlanner(); });
  $('showGrid').onchange = drawPlanner; $('showOverlay').onchange = drawPlanner;

  // layout file
  $('saveLayout').onclick = () => download('display_layout.json', L.toJSON(layout), 'application/json');
  $('loadLayout').onclick = () => $('layoutFile').click();
  $('layoutFile').onchange = async () => {
    const f = $('layoutFile').files[0]; if (!f) return;
    try {
      const nl = L.fromJSON(await f.text());
      for (const [n, rows] of Object.entries(nl.icons || {})) lib[n] = rows;   // icons travel with the file
      nl.icons = lib; layout = nl; sel = null; syncDisplayWidgets(); redrawAll(); toast('layout loaded');
    } catch (e) { alert('Could not load: ' + e.message); }
    $('layoutFile').value = '';
  };
  $('newLayout').onclick = () => { if (!layout.regions.length || confirm('Start a new, empty layout? (your icons are kept)')) { layout = L.newLayout(); layout.icons = lib; sel = null; syncDisplayWidgets(); redrawAll(); } };

  // regions
  function uniqueName(base) { let n = base, i = 2; while (layout.regions.some(r => r.name === n)) n = base + i++; return n; }
  function addRegion(x, y, w, h) {
    const r = L.newRegion(uniqueName('region' + (layout.regions.length + 1)), x, y, w, h);
    layout.regions.push(r); sel = r; redrawAll(); $('rName').focus(); $('rName').select();
  }
  $('addRegion').onclick = () => { const { w, h } = L.panelSize(layout); addRegion(0, 0, Math.min(40, w), Math.min(20, h)); };
  $('dupRegion').onclick = () => { if (!sel) return; const c = JSON.parse(JSON.stringify(sel)); c.name = uniqueName(sel.name); const { h } = L.panelSize(layout); c.y = Math.min(h - c.h, c.y + c.h); layout.regions.push(c); sel = c; redrawAll(); };
  $('delRegion').onclick = () => { if (!sel) return; layout.regions = layout.regions.filter(r => r !== sel); sel = null; redrawAll(); };

  function refreshRegionList() {
    const el = $('regionList'); el.innerHTML = '';
    if (!layout.regions.length) { el.innerHTML = '<div class="note">no regions yet</div>'; }
    for (const r of layout.regions) {
      const chip = document.createElement('div'); chip.className = 'chip' + (r === sel ? ' on' : '');
      const c = r.content || { type: 'none' };
      const what = c.type === 'text' ? '“' + (c.text || '').split('\n')[0].slice(0, 12) + '”' : c.type === 'icon' ? 'icon ' + c.icon : c.type === 'image' ? 'image' : 'empty';
      chip.innerHTML = `<span class="nm">${r.name}</span><span class="meta">${r.x},${r.y} ${r.w}×${r.h} · ${what}</span>`;
      chip.onclick = () => { sel = r; redrawAll(); };
      el.appendChild(chip);
    }
    $('dupRegion').disabled = $('delRegion').disabled = !sel;
  }

  // the region form (right sidebar)
  const setAlign = seg($('rAlign'), 'a', v => { if (sel) { sel.align = v; redrawAll(); } });
  const setType = seg($('rType'), 't', v => { if (!sel) return; if (v === 'text') sel.content = { type: 'text', text: sel.content.text || 'Hello' }; else if (v === 'icon') sel.content = { type: 'icon', icon: sel.content.icon || 'wifi' }; else if (v === 'image') sel.content = { type: 'image', rows: sel.content.rows || null, mode: 'embed', opt: { fit: 'fit', source: 'auto', threshold: 128, dither: false, invert: false } }; else sel.content = { type: 'none' }; redrawAll(); });
  const setFit = seg($('iFit'), 'f', v => { if (sel && sel.content.type === 'image') { sel.content.opt.fit = v; reconvertRegion(sel); } });
  const setMode = seg($('iMode'), 'm', v => { if (sel && sel.content.type === 'image') { sel.content.mode = v; if (v === 'file') sel.content.file = sel.name + '.bmp'; redrawAll(); } });
  $('rName').oninput = () => { if (!sel) return; sel.name = $('rName').value.trim(); if (sel.content.type === 'image' && sel.content.mode === 'file') sel.content.file = sel.name + '.bmp'; redrawAll(false); };
  for (const k of ['X', 'Y', 'W', 'H']) $('r' + k).onchange = () => { if (!sel) return; const key = k.toLowerCase(); const { w: W, h: H } = L.panelSize(layout); const lim = key === 'x' ? W - 1 : key === 'y' ? H - 1 : 255; sel[key] = clampInt($('r' + k).value, key === 'w' || key === 'h' ? 1 : 0, lim); if (sel.content.type === 'image') reconvertRegion(sel); else redrawAll(); };
  $('rSize').onchange = () => { if (sel) { sel.size = clampInt($('rSize').value, 1, 255); redrawAll(); } };
  $('rColor').onchange = () => { if (sel) { sel.color = readColor($('rColor'), $('rColorPick')); redrawAll(); } };
  $('rColorPick').oninput = () => { if (sel) { sel.color = $('rColorPick').value; $('rColor').value = '__custom'; redrawAll(); } };
  $('rBg').onchange = () => { if (sel) { sel.bg = readColor($('rBg'), $('rBgPick')); redrawAll(); } };
  $('rBgPick').oninput = () => { if (sel) { sel.bg = $('rBgPick').value; $('rBg').value = '__custom'; redrawAll(); } };
  $('rText').oninput = () => { if (sel && sel.content.type === 'text') { sel.content.text = $('rText').value; redrawAll(false); } };
  $('rIcon').onchange = () => { if (sel && sel.content.type === 'icon') { sel.content.icon = $('rIcon').value; redrawAll(); } };
  $('rImageBtn').onclick = () => $('rImageFile').click();
  $('rImageFile').onchange = () => { const f = $('rImageFile').files[0]; if (f) regionImage(f); $('rImageFile').value = ''; };
  wireDrop($('rImageDrop'), regionImage);
  $('iSource').onchange = () => { if (sel && sel.content.type === 'image') { sel.content.opt.source = $('iSource').value; reconvertRegion(sel); } };
  $('iThr').oninput = () => { $('iThrVal').textContent = $('iThr').value; if (sel && sel.content.type === 'image') { sel.content.opt.threshold = parseInt($('iThr').value, 10); reconvertRegion(sel); } };
  $('iDither').onchange = () => { if (sel && sel.content.type === 'image') { sel.content.opt.dither = $('iDither').checked; reconvertRegion(sel); } };
  $('iInvert').onchange = () => { if (sel && sel.content.type === 'image') { sel.content.opt.invert = $('iInvert').checked; reconvertRegion(sel); } };

  async function regionImage(file) {
    if (!sel || sel.content.type !== 'image') return;
    try { const img = await loadImageFile(file); srcOf.set(sel, { img, name: file.name }); reconvertRegion(sel); }
    catch (e) { alert(e.message); }
  }
  // (re)build a region's 1-bit image at the box size from its source picture; without a
  // source (e.g. loaded from .json) the existing rows are scaled nearest-neighbour instead
  function reconvertRegion(r) {
    const c = r.content, src = srcOf.get(r);
    if (src) c.rows = imageToBitmap(src.img, r.w, r.h, c.opt).rows();
    else if (c.rows) { const bm = Bitmap.fromRows(c.rows); if (bm.width !== r.w || bm.height !== r.h) c.rows = bm.scaled(r.w, r.h).rows(); }
    redrawAll();
  }
  function refreshIconSelect() {
    const s = $('rIcon'), cur = s.value; s.innerHTML = '';
    const mine = Object.keys(lib).sort(), built = N.builtinIconNames();
    if (mine.length) { const g = document.createElement('optgroup'); g.label = 'my icons'; for (const n of mine) { const o = document.createElement('option'); o.value = n; o.textContent = n; g.appendChild(o); } s.appendChild(g); }
    const g = document.createElement('optgroup'); g.label = 'built-in'; for (const n of built) { const o = document.createElement('option'); o.value = n; o.textContent = n; g.appendChild(o); } s.appendChild(g);
    s.value = cur;
  }
  function syncRegionForm() {
    const form = $('regionForm'); $('noSel').style.display = sel ? 'none' : 'block';
    form.style.display = sel ? 'flex' : 'none';
    if (!sel) return;
    const r = sel, c = r.content || { type: 'none' };
    if (document.activeElement !== $('rName')) $('rName').value = r.name;
    $('rX').value = r.x; $('rY').value = r.y; $('rW').value = r.w; $('rH').value = r.h; $('rSize').value = r.size;
    setAlign(r.align); setType(c.type);
    showColor($('rColor'), $('rColorPick'), r.color); showColor($('rBg'), $('rBgPick'), r.bg);
    $('cText').style.display = c.type === 'text' ? 'block' : 'none';
    $('cIcon').style.display = c.type === 'icon' ? 'block' : 'none';
    $('cImage').style.display = c.type === 'image' ? 'flex' : 'none';
    if (c.type === 'text' && document.activeElement !== $('rText')) $('rText').value = c.text || '';
    if (c.type === 'icon') { refreshIconSelect(); $('rIcon').value = c.icon; const bm = L.iconLookup(layout)(c.icon); if (bm) fitInto($('rIconPrev'), bm, 32, r.color, layout.bg); }
    if (c.type === 'image') {
      const src = srcOf.get(r), has = !!(c.rows || src);
      $('rImageOpts').style.display = has ? 'flex' : 'none';
      if (has) {
        const o = c.opt || (c.opt = { fit: 'fit', source: 'auto', threshold: 128, dither: false, invert: false });
        setFit(o.fit); $('iSource').value = o.source; $('iThr').value = o.threshold; $('iThrVal').textContent = o.threshold; $('iDither').checked = !!o.dither; $('iInvert').checked = !!o.invert;
        setMode(c.mode || 'embed');
        const bm = c.rows ? Bitmap.fromRows(c.rows) : null;
        $('rImageInfo').textContent = (src ? src.name + ' → ' : 'image ') + (bm ? `${bm.width}×${bm.height} px, ${bm.count()} lit` : '') + (src ? ' (re-converted when the box is resized)' : ' (no source picture in this session: resizing scales the pixels)');
        $('iModeNote').textContent = c.mode === 'file' ? `Exports ${c.file || r.name + '.bmp'} (1-bit BMP). Copy it to /pics/ on the Pico. Best for big pictures.` : 'The pixels go straight into product.py as text rows - nothing to copy. Best for small images.';
        [...$('iFit').querySelectorAll('button')].forEach(b => b.disabled = !src); $('iSource').disabled = $('iThr').disabled = $('iDither').disabled = $('iInvert').disabled = !src;
      }
    }
    // text fit line
    if (c.type === 'text' || c.type === 'none') {
      const f = L.textFitFor(r);
      $('rFit').textContent = `Text at ${r.size} px: ${f.cols} column${f.cols === 1 ? '' : 's'} × ${f.lines} line${f.lines === 1 ? '' : 's'} in this box (${f.native ? 'module 8×8 font, ' + f.cellW + ' px wide cells, fastest' : 'Pico 8×16 font, ' + f.cellW + ' px wide cells'}; line height ${f.lineH} px). Native sizes 8/16/24/32/40/48/56/64 draw on the module itself.`;
    } else if (c.type === 'icon') {
      const bm = L.iconLookup(layout)(c.icon), ih = Math.min(r.size, r.h), iw = bm ? Math.min(r.w, Math.max(1, Math.floor(bm.width * ih / bm.height))) : 0;
      $('rFit').textContent = bm ? `Icon ${bm.width}×${bm.height} drawn at ${iw}×${ih} px (height = size, capped to the box).` : '';
    } else $('rFit').textContent = 'Image is drawn 1:1 into the box (cropped if bigger).';
  }

  // warnings + code
  function refreshChecks() {
    const ws = L.warnings(layout), el = $('warnList'); el.innerHTML = '';
    if (!ws.length) el.innerHTML = '<div class="note">✓ nothing to flag</div>';
    for (const w of ws) { const d = document.createElement('div'); d.className = 'warn' + (w.info ? ' info' : ''); d.textContent = (w.info ? 'ℹ ' : '⚠ ') + w.msg; d.onclick = () => { sel = w.region; redrawAll(); }; el.appendChild(d); }
    const { code, files } = L.toPython(layout);
    $('pyCode').value = code;
    $('dlBmps').style.display = files.length ? '' : 'none';
    $('dlBmps').textContent = `⬇ ${files.length} .bmp file${files.length === 1 ? '' : 's'}`;
    lastFiles = files;
  }
  let lastFiles = [];
  $('copyPy').onclick = () => copyText($('pyCode').value);
  $('dlPy').onclick = () => download('display_layout.py', $('pyCode').value, 'text/x-python');
  $('dlBmps').onclick = () => { lastFiles.forEach((f, i) => setTimeout(() => download(f.file, Bitmap.fromRows(f.rows).toBMP(), 'image/bmp'), i * 300)); };

  // drawing the planner
  function drawPlanner() {
    const { w: W, h: H } = L.panelSize(layout), S = zoom;
    cv.width = W * S + PAD * 2; cv.height = H * S + PAD * 2;
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.roundRect(0, 0, cv.width, cv.height, 10); ctx.fill();
    // the pixel-true frame
    const d = L.render(layout), img = new ImageData(W, H), px = d.panel.px;
    for (let i = 0; i < px.length; i++) { const c = N.rgb565to888(px[i]); img.data[i * 4] = c >> 16; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255; }
    off.width = W; off.height = H; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(off, PAD, PAD, W * S, H * S);
    const X = x => PAD + x * S, Y = y => PAD + y * S;
    if ($('showGrid').checked && S >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= W; x++) { ctx.moveTo(X(x) + .5, Y(0)); ctx.lineTo(X(x) + .5, Y(H)); }
      for (let y = 0; y <= H; y++) { ctx.moveTo(X(0), Y(y) + .5); ctx.lineTo(X(W), Y(y) + .5); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath();
      for (let x = 0; x <= W; x += 8) { ctx.moveTo(X(x) + .5, Y(0)); ctx.lineTo(X(x) + .5, Y(H)); }
      for (let y = 0; y <= H; y += 8) { ctx.moveTo(X(0), Y(y) + .5); ctx.lineTo(X(W), Y(y) + .5); }
      ctx.stroke();
    }
    if (!$('showOverlay').checked) return;
    if (layout.printZone.enabled) {                   // hatched print() band
      const b = L.printBand(layout); ctx.save(); ctx.beginPath(); ctx.rect(X(b.x), Y(b.y), b.w * S, b.h * S); ctx.clip();
      ctx.strokeStyle = 'rgba(242,181,68,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = -b.h * S; k < b.w * S; k += 10) { ctx.moveTo(X(b.x) + k, Y(b.y)); ctx.lineTo(X(b.x) + k + b.h * S, Y(b.y) + b.h * S); }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = 'rgba(242,181,68,0.8)'; ctx.setLineDash([4, 3]); ctx.strokeRect(X(b.x) + .5, Y(b.y) + .5, b.w * S - 1, b.h * S - 1); ctx.setLineDash([]);
    }
    for (const r of layout.regions) {
      const on = r === sel, hv = r === hover;
      ctx.strokeStyle = on ? '#59d3a4' : hv ? 'rgba(89,211,164,0.8)' : 'rgba(89,211,164,0.45)'; ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(X(r.x) + .5, Y(r.y) + .5, r.w * S - 1, r.h * S - 1);
      if (S >= 3) {
        ctx.font = '11px system-ui,sans-serif'; const tw = ctx.measureText(r.name).width + 8;
        ctx.fillStyle = on ? '#59d3a4' : 'rgba(23,26,33,0.85)'; ctx.fillRect(X(r.x), Y(r.y) - 15, Math.min(tw, r.w * S + 40), 14);
        ctx.fillStyle = on ? '#04150f' : '#9aa3b2'; ctx.fillText(r.name, X(r.x) + 4, Y(r.y) - 4);
      }
      if (on) for (const [hx, hy] of handlePoints(r)) { ctx.fillStyle = '#59d3a4'; ctx.fillRect(hx - 3, hy - 3, 6, 6); ctx.strokeStyle = '#04150f'; ctx.lineWidth = 1; ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7); }
    }
    if (drag && drag.type === 'create' && drag.rect) { const q = drag.rect; ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.strokeRect(X(q.x) + .5, Y(q.y) + .5, q.w * S - 1, q.h * S - 1); ctx.setLineDash([]); }
  }
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function handlePoints(r) {
    const S = zoom, x0 = PAD + r.x * S, y0 = PAD + r.y * S, x1 = x0 + r.w * S, y1 = y0 + r.h * S, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    return [[x0, y0], [xm, y0], [x1, y0], [x1, ym], [x1, y1], [xm, y1], [x0, y1], [x0, ym]];
  }
  function redrawAll(syncForm = true) { refreshRegionList(); if (syncForm) syncRegionForm(); refreshChecks(); drawPlanner(); persist(); }

  // pointer interaction
  function ptr(e) { const b = cv.getBoundingClientRect(); const sx = (e.clientX - b.left) * (cv.width / b.width), sy = (e.clientY - b.top) * (cv.height / b.height); return { sx, sy, px: Math.floor((sx - PAD) / zoom), py: Math.floor((sy - PAD) / zoom) }; }
  function hitHandle(p) { if (!sel) return null; const pts = handlePoints(sel); for (let i = 0; i < pts.length; i++) if (Math.abs(p.sx - pts[i][0]) <= 6 && Math.abs(p.sy - pts[i][1]) <= 6) return HANDLES[i]; return null; }
  function hitRegion(p) { for (let i = layout.regions.length - 1; i >= 0; i--) { const r = layout.regions[i]; if (p.px >= r.x && p.px < r.x + r.w && p.py >= r.y && p.py < r.y + r.h) return r; } return null; }
  const clampR = r => { const { w: W, h: H } = L.panelSize(layout); r.w = Math.max(1, Math.min(r.w, W)); r.h = Math.max(1, Math.min(r.h, H)); r.x = Math.max(0, Math.min(r.x, W - r.w)); r.y = Math.max(0, Math.min(r.y, H - r.h)); };
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; cv.setPointerCapture(e.pointerId);
    const p = ptr(e), hd = hitHandle(p);
    if (hd) { drag = { type: 'resize', hd, start: p, orig: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }; return; }
    const r = hitRegion(p);
    if (r) { sel = r; drag = { type: 'move', start: p, orig: { x: r.x, y: r.y }, moved: false }; redrawAll(); return; }
    sel = null; drag = { type: 'create', start: p, rect: null }; redrawAll();
  });
  cv.addEventListener('pointermove', e => {
    const p = ptr(e), { w: W, h: H } = L.panelSize(layout);
    $('status').textContent = (p.px >= 0 && p.py >= 0 && p.px < W && p.py < H) ? `x ${p.px}, y ${p.py}` : `${W} × ${H} px`;
    if (!drag) { const h = hitHandle(p); cv.style.cursor = h ? ({ n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' })[h] : (hitRegion(p) ? 'move' : 'crosshair'); const hv = hitRegion(p); if (hv !== hover) { hover = hv; drawPlanner(); } return; }
    const dx = p.px - drag.start.px, dy = p.py - drag.start.py;
    if (drag.type === 'move') { sel.x = drag.orig.x + dx; sel.y = drag.orig.y + dy; clampR(sel); drag.moved = drag.moved || dx || dy; }
    else if (drag.type === 'resize') {
      const o = drag.orig, hd = drag.hd; let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (hd.includes('w')) x0 = Math.min(x1 - 1, Math.max(0, o.x + dx)); if (hd.includes('e')) x1 = Math.max(x0 + 1, Math.min(W, o.x + o.w + dx));
      if (hd.includes('n')) y0 = Math.min(y1 - 1, Math.max(0, o.y + dy)); if (hd.includes('s')) y1 = Math.max(y0 + 1, Math.min(H, o.y + o.h + dy));
      sel.x = x0; sel.y = y0; sel.w = x1 - x0; sel.h = y1 - y0;
    } else if (drag.type === 'create') {
      const ax = Math.max(0, Math.min(W - 1, Math.min(drag.start.px, p.px))), ay = Math.max(0, Math.min(H - 1, Math.min(drag.start.py, p.py)));
      const bx = Math.max(0, Math.min(W - 1, Math.max(drag.start.px, p.px))), by = Math.max(0, Math.min(H - 1, Math.max(drag.start.py, p.py)));
      drag.rect = (dx || dy) ? { x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1 } : null;
    }
    if (drag.type !== 'create') { syncRegionForm(); refreshRegionList(); }
    drawPlanner();
  });
  cv.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.type === 'create' && d.rect) addRegion(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
    else if (d.type === 'resize' && sel && sel.content.type === 'image') reconvertRegion(sel);
    else redrawAll();
  });
  cv.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; drawPlanner(); } });
  document.addEventListener('keydown', e => {
    if (!mains.layout.classList.contains('on') || !sel) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const step = e.shiftKey ? 8 : 1; let used = true;
    if (e.key === 'ArrowLeft') sel.x -= step; else if (e.key === 'ArrowRight') sel.x += step; else if (e.key === 'ArrowUp') sel.y -= step; else if (e.key === 'ArrowDown') sel.y += step;
    else if (e.key === 'Delete' || e.key === 'Backspace') { layout.regions = layout.regions.filter(r => r !== sel); sel = null; }
    else used = false;
    if (used) { e.preventDefault(); if (sel) clampR(sel); redrawAll(); }
  });

  // ═══════════════════════════ ICONS TAB ═══════════════════════════════════
  const ecv = $('editorCanvas'), ectx = ecv.getContext('2d');
  const ed = { name: 'myicon', bm: new Bitmap(16, 16), tool: 'pen', src: null, opt: { fit: 'fit', source: 'auto', threshold: 128, dither: false, invert: false }, cell: 20, loadedFrom: null };
  fillColorSelect($('prevTint')); fillColorSelect($('prevBg')); $('prevTint').value = 'white'; $('prevBg').value = 'black';
  $('prevTint').onchange = $('prevBg').onchange = drawEditor;
  const tools = { tPen: 'pen', tEraser: 'eraser', tFill: 'fill' };
  for (const id in tools) $(id).onclick = () => { ed.tool = tools[id]; for (const j in tools) $(j).classList.toggle('on', j === id); };
  const apply = f => { ed.bm = f(ed.bm); drawEditor(); };
  $('opInvert').onclick = () => apply(b => b.inverted()); $('opFlipH').onclick = () => apply(b => b.mirrored()); $('opFlipV').onclick = () => apply(b => b.flipped());
  $('opRot').onclick = () => apply(b => b.rotated()); $('opClear').onclick = () => apply(b => new Bitmap(b.width, b.height));
  const shift = (dx, dy) => apply(b => { const o = new Bitmap(b.width, b.height); for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.get(x, y)) o.set(x + dx, y + dy); return o; });
  $('opL').onclick = () => shift(-1, 0); $('opR').onclick = () => shift(1, 0); $('opU').onclick = () => shift(0, -1); $('opD').onclick = () => shift(0, 1);
  $('newIcon').onclick = () => { ed.bm = new Bitmap(clampInt($('newW').value, 1, 255), clampInt($('newH').value, 1, 255)); ed.src = null; ed.loadedFrom = null; ed.name = uniqueIconName('myicon'); $('eName').value = ed.name; $('eImportOpts').style.display = 'none'; drawEditor(); };
  function uniqueIconName(base) { let n = base, i = 2; while (lib[n] || N.builtinIcon(n)) n = base + i++; return n; }

  function drawEditor() {
    const view = ecv.closest('.view');
    const bm = ed.bm, maxPx = Math.min(560, Math.max(160, window.innerHeight - 330), Math.max(160, (view ? view.clientWidth : 600) - 56));
    ed.cell = Math.max(3, Math.min(28, Math.floor(maxPx / Math.max(bm.width, bm.height))));
    const S = ed.cell; ecv.width = bm.width * S + 1; ecv.height = bm.height * S + 1;
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, ecv.width, ecv.height);
    const tint = hex6(N.rgb565to888(N.rgb565($('prevTint').value === '__custom' ? 'white' : $('prevTint').value)));
    ectx.fillStyle = tint;
    for (let y = 0; y < bm.height; y++) for (let x = 0; x < bm.width; x++) if (bm.get(x, y)) ectx.fillRect(x * S, y * S, S, S);
    if (S >= 5) { ectx.strokeStyle = 'rgba(255,255,255,0.12)'; ectx.beginPath(); for (let x = 0; x <= bm.width; x++) { ectx.moveTo(x * S + .5, 0); ectx.lineTo(x * S + .5, bm.height * S); } for (let y = 0; y <= bm.height; y++) { ectx.moveTo(0, y * S + .5); ectx.lineTo(bm.width * S, y * S + .5); } ectx.stroke();
      ectx.strokeStyle = 'rgba(255,255,255,0.28)'; ectx.beginPath(); for (let x = 0; x <= bm.width; x += 8) { ectx.moveTo(x * S + .5, 0); ectx.lineTo(x * S + .5, bm.height * S); } for (let y = 0; y <= bm.height; y += 8) { ectx.moveTo(0, y * S + .5); ectx.lineTo(bm.width * S, y * S + .5); } ectx.stroke(); }
    const tc = $('prevTint').value === '__custom' ? 'white' : $('prevTint').value, bc = $('prevBg').value === '__custom' ? 'black' : $('prevBg').value;
    paintBitmap($('prev1'), bm, 1, tc, bc); paintBitmap($('prev2'), bm, 2, tc, bc); paintBitmap($('prev4'), bm, 4, tc, bc);
    $('eSizeInfo').textContent = `${bm.width}×${bm.height} px, ${bm.count()} lit, ${bm.rowBytes * bm.height} bytes packed`;
    $('eDelete').disabled = !lib[ed.name];
    $('eCode').value = iconSnippet(ed.name, bm);
  }
  function iconSnippet(name, bm) {
    const rows = bm.rows();
    return `from noknok import ICONS\n\n# "${name}" ${bm.width}x${bm.height}: "#" = lit pixel (drawn in the colour you pass), "." = background\nICONS[${JSON.stringify(name)}] = [\n${rows.map(r => '    ' + JSON.stringify(r) + ',').join('\n')}\n]\n\n# then, anywhere in your product:\nd.icon(${JSON.stringify(name)}, x=0, y=0)                 # at ${bm.width}x${bm.height}\nd.icon(${JSON.stringify(name)}, x=0, y=0, size=32, color=NOKNOK)   # any height, tinted\nd.set("some_region", icon=${JSON.stringify(name)})       # or in a planner region\n`;
  }
  // painting
  let paint = null;
  function ecell(e) { const b = ecv.getBoundingClientRect(); return { x: Math.floor((e.clientX - b.left) * (ecv.width / b.width) / ed.cell), y: Math.floor((e.clientY - b.top) * (ecv.height / b.height) / ed.cell) }; }
  function flood(bm, x, y, on) {
    const from = bm.get(x, y); if (from === on) return; const st = [[x, y]];
    while (st.length) { const [cx, cy] = st.pop(); if (cx < 0 || cy < 0 || cx >= bm.width || cy >= bm.height || bm.get(cx, cy) !== from) continue; bm.set(cx, cy, on); st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]); }
  }
  ecv.addEventListener('contextmenu', e => e.preventDefault());
  ecv.addEventListener('pointerdown', e => {
    ecv.setPointerCapture(e.pointerId); const c = ecell(e);
    const on = e.button === 2 ? false : ed.tool !== 'eraser';
    if (ed.tool === 'fill') { flood(ed.bm, c.x, c.y, on); drawEditor(); return; }
    paint = { on, last: null }; ed.bm.set(c.x, c.y, on); drawEditor();
  });
  ecv.addEventListener('pointermove', e => { if (!paint) return; const c = ecell(e); if (paint.last && paint.last.x === c.x && paint.last.y === c.y) return; paint.last = c; ed.bm.set(c.x, c.y, paint.on); drawEditor(); });
  ecv.addEventListener('pointerup', () => { paint = null; });
  // import
  $('eImageBtn').onclick = () => $('eImageFile').click();
  $('eImageFile').onchange = () => { const f = $('eImageFile').files[0]; if (f) editorImage(f); $('eImageFile').value = ''; };
  wireDrop($('eDrop'), editorImage);
  async function editorImage(file) {
    try { const img = await loadImageFile(file); ed.src = { img, name: file.name }; ed.loadedFrom = null;
      $('eImportOpts').style.display = 'flex'; $('eImageInfo').textContent = `${file.name}: ${img.naturalWidth}×${img.naturalHeight} px`;
      const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'myicon';
      if (!lib[ed.name] || ed.name === 'myicon') { ed.name = lib[base] || N.builtinIcon(base) ? uniqueIconName(base) : base; $('eName').value = ed.name; }
      $('eW').value = ed.bm.width; $('eH').value = ed.bm.height; reconvertEditor(); }
    catch (e) { alert(e.message); }
  }
  function reconvertEditor() { if (!ed.src) return; ed.bm = imageToBitmap(ed.src.img, clampInt($('eW').value, 1, 255), clampInt($('eH').value, 1, 255), ed.opt); drawEditor(); }
  seg($('eFit'), 'f', v => { ed.opt.fit = v; reconvertEditor(); });
  $('eSource').onchange = () => { ed.opt.source = $('eSource').value; reconvertEditor(); };
  $('eThr').oninput = () => { ed.opt.threshold = parseInt($('eThr').value, 10); $('eThrVal').textContent = ed.opt.threshold; reconvertEditor(); };
  $('eDither').onchange = () => { ed.opt.dither = $('eDither').checked; reconvertEditor(); };
  $('eInvert').onchange = () => { ed.opt.invert = $('eInvert').checked; reconvertEditor(); };
  $('eW').onchange = $('eH').onchange = () => { if (ed.src) reconvertEditor(); else { ed.bm = ed.bm.scaled(clampInt($('eW').value, 1, 255), clampInt($('eH').value, 1, 255)); drawEditor(); } };
  // export / library
  $('eName').oninput = () => { ed.name = $('eName').value.trim(); drawEditor(); };
  $('eSave').onclick = () => {
    const n = ed.name;
    if (!L.NAME_RE.test(n)) { alert('Icon name: letters, digits and _ only, e.g. my_logo'); return; }
    if (N.builtinIcon(n) && !lib[n] && !confirm(`"${n}" is a built-in icon name. Saving yours with the same name replaces the built-in in your code (ICONS["${n}"] = ...). Continue?`)) return;
    lib[n] = ed.bm.rows(); ed.loadedFrom = n; persist(); refreshLibList(); drawEditor(); toast(`saved "${n}"`);
  };
  $('eDelete').onclick = () => { if (lib[ed.name] && confirm(`Delete icon "${ed.name}"?`)) { delete lib[ed.name]; persist(); refreshLibList(); drawEditor(); } };
  $('eCopy').onclick = () => copyText($('eCode').value);
  $('eBmp').onclick = () => download((ed.name || 'icon') + '.bmp', ed.bm.toBMP(), 'image/bmp');
  $('ePng').onclick = async () => download((ed.name || 'icon') + '@8x.png', await pngFromBitmap(ed.bm, 8), 'image/png');
  function loadIntoEditor(name, rows, builtin) {
    ed.bm = Bitmap.fromRows(rows); ed.src = null; $('eImportOpts').style.display = 'none';
    ed.name = builtin ? uniqueIconName(name) : name; ed.loadedFrom = builtin ? null : name; $('eName').value = ed.name; drawEditor();
  }
  function refreshLibList() {
    const mine = $('myIconList'); mine.innerHTML = '';
    const names = Object.keys(lib).sort();
    if (!names.length) mine.innerHTML = '<div class="note">none yet — draw one or import an image, then “save to my icons”.</div>';
    for (const n of names) mine.appendChild(iconChip(n, lib[n], false));
    const bl = $('builtinIconList'); if (!bl.childElementCount) for (const n of N.builtinIconNames()) bl.appendChild(iconChip(n, N.builtinIcon(n).rows(), true));
    [...mine.children, ...bl.children].forEach(ch => ch.classList.toggle('on', ch.dataset && ch.dataset.name === ed.loadedFrom));
  }
  function iconChip(name, rows, builtin) {
    const chip = document.createElement('div'); chip.className = 'chip'; chip.dataset.name = name;
    const c = document.createElement('canvas'); const bm = Bitmap.fromRows(rows); fitInto(c, bm, 24, 'white', 'black');
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name;
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `${bm.width}×${bm.height}`;
    chip.append(c, nm, meta); chip.onclick = () => { loadIntoEditor(name, rows, builtin); refreshLibList(); };
    return chip;
  }

  // ═══════════════════════════ boot ════════════════════════════════════════
  window.addEventListener('resize', () => { if (mains.icons.classList.contains('on')) drawEditor(); });
  $('eName').value = ed.name;
  if (!layout.regions.length && !localStorage.getItem(LS_LAYOUT)) {   // first visit: the handoff example
    layout.regions.push(Object.assign(L.newRegion('clock', 0, 0, 80, 32), { size: 32, color: 'yellow', align: 'center', content: { type: 'text', text: '12:34' } }));
    layout.regions.push(Object.assign(L.newRegion('net', 62, 140, 18, 18), { content: { type: 'icon', icon: 'wifi' } }));
  }
  syncDisplayWidgets(); refreshIconSelect(); redrawAll(); refreshLibList(); drawEditor();
})();
