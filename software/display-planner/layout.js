// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 noknok / Christopher Houben
//
// noknok Display Planner - the layout model: what a layout.json holds, how it is drawn
// (through render.js, i.e. exactly like noknok.py would), what it warns about, and the
// Python snippet it turns into. No DOM in here: app.js is the UI, test/golden.mjs runs
// this in Node against the real noknok.py.
//
// layout.json (version 1):
// {
//   "planner": "noknok-display-planner", "version": 1,
//   "display": { "preset": "noknok-142", "width": 80, "height": 160, "rotation": 0 },
//                 width x height = the panel in PORTRAIT; rotation 1/3 swap them (landscape)
//   "bg": "black",                       colour name (noknok COLORS) or "#RRGGBB"
//   "regions": [ { "name","x","y","w","h","size","color","bg","align",
//                  "content": {"type":"none"} | {"type":"text","text"} | {"type":"icon","icon"}
//                           | {"type":"image","rows":[..],"mode":"embed"|"file","file":"x.bmp"} } ],
//   "icons": { "myicon": ["..##..", ...] },   the maker's own icons ('#' = lit), used by name
//   "printZone": { "enabled": false, "size": 16, "lines": 8 }
// }
(function (root) {
  'use strict';
  const N = (typeof NDP !== 'undefined') ? NDP : require('./render.js');
  const { Display, Bitmap, builtinIcon, builtinIconNames } = N;

  const PRESETS = [
    { id: 'noknok-142', label: 'noknok Display 1.42" (80 x 160)', width: 80, height: 160 },
    { id: 'custom',     label: 'Custom size...',                     width: 80, height: 160 },
  ];
  const ROTATIONS = [
    { id: 0, label: 'Portrait' }, { id: 1, label: 'Landscape' },
    { id: 2, label: 'Portrait, upside down' }, { id: 3, label: 'Landscape, other way' },
  ];
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const TOOL_URL = 'https://buildwithnoknok.github.io/display-planner/';

  function newLayout() {
    return {
      planner: 'noknok-display-planner', version: 1,
      display: { preset: 'noknok-142', width: 80, height: 160, rotation: 0 },
      bg: 'black',
      regions: [],
      icons: {},
      printZone: { enabled: false, size: 16, lines: 8 },
    };
  }
  function newRegion(name, x, y, w, h) {
    return { name, x, y, w, h, size: 16, color: 'white', bg: 'auto', align: 'left', content: { type: 'none' } };
  }
  // effective panel size after rotation
  function panelSize(layout) {
    const d = layout.display, land = (d.rotation | 0) % 2 === 1;
    return land ? { w: d.height, h: d.width } : { w: d.width, h: d.height };
  }
  // "yellow" -> 0xFFFF00, "#8b00f3" -> 0x8B00F3
  function colorValue(c) { return N.toRGB(c); }
  function isNamedColor(c) { return typeof c === 'string' && !!N.D.colors[c.trim().toLowerCase().replace(/[\s_]/g, '')]; }
  function colorConst(c) { return N.D.colors[c.trim().toLowerCase().replace(/[\s_]/g, '')].const; }

  // icon lookup: the maker's icons first (they may shadow a built-in, like ICONS[...] = would)
  function iconLookup(layout) {
    const cache = {};
    return name => {
      if (cache[name]) return cache[name];
      let bm = null;
      if (layout.icons && layout.icons[name]) bm = Bitmap.fromRows(layout.icons[name]);
      else bm = builtinIcon(name);
      if (bm) cache[name] = bm;
      return bm;
    };
  }
  function allIconNames(layout) {
    const s = new Set(builtinIconNames());
    for (const n of Object.keys(layout.icons || {})) s.add(n);
    return [...s].sort();
  }

  // ── draw the layout exactly as noknok.py would ─────────────────────────────
  function render(layout) {
    const { w, h } = panelSize(layout);
    const d = new Display(w, h, iconLookup(layout));
    d.clear(layout.bg);
    for (const r of layout.regions) {
      try { d.region(r.name, r.x, r.y, r.w, r.h, { size: r.size, color: r.color, bg: r.bg, align: r.align }); }
      catch (e) { continue; }                          // off the panel: noknok.py raises, we skip
      const c = r.content || { type: 'none' };
      if (c.type === 'text') d.set(r.name, { text: c.text || '' });
      else if (c.type === 'icon') d.set(r.name, { icon: c.icon });
      else if (c.type === 'image' && c.rows) d.set(r.name, { image: Bitmap.fromRows(c.rows) });
      // type "none": a bare d.region() draws nothing (the box is only wiped on the first d.set)
    }
    return d;
  }

  // ── checks the UI shows next to the region list ────────────────────────────
  function textFitFor(r) {
    const text = r.content && r.content.type === 'text' ? (r.content.text || '') : '';
    return Display.textFit(r.w, r.h, r.size, Display.isAscii(text.replace(/\n/g, '')));
  }
  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function warnings(layout) {
    const out = [], { w: W, h: H } = panelSize(layout), seen = new Set(), icons = iconLookup(layout);
    const rs = layout.regions;
    for (const r of rs) {
      const tag = `"${r.name}"`;
      if (!NAME_RE.test(r.name)) out.push({ region: r, msg: `${tag}: name must be letters, digits, _ (no spaces)` });
      if (seen.has(r.name)) out.push({ region: r, msg: `${tag}: duplicate name - d.region() would overwrite the first one` });
      seen.add(r.name);
      if (r.x + r.w > W || r.y + r.h > H || r.x < 0 || r.y < 0) out.push({ region: r, msg: `${tag}: sticks out of the ${W}x${H} panel (noknok.py clips it)` });
      const c = r.content || { type: 'none' };
      if (c.type === 'none') out.push({ region: r, msg: `${tag}: no content yet (exported as a bare d.region())`, info: true });
      if (c.type === 'icon' && !icons(c.icon)) out.push({ region: r, msg: `${tag}: icon "${c.icon}" does not exist` });
      if (c.type === 'text') {
        const fit = textFitFor(r), lines = Display.layout(c.text || '', fit.cellW, Math.min(r.w, 255), true);
        const longest = Math.max(0, ...lines.map(l => l.length));
        if (fit.lines === 0) out.push({ region: r, msg: `${tag}: box is shorter than the ${r.size} px text - nothing will be drawn` });
        else if (lines.length > fit.lines) out.push({ region: r, msg: `${tag}: text needs ${lines.length} lines, box fits ${fit.lines} (size ${r.size} -> ${fit.lineH} px per line)` });
        if (fit.cols === 0) out.push({ region: r, msg: `${tag}: box is narrower than one ${fit.cellW} px character` });
        else if (longest > fit.cols) out.push({ region: r, msg: `${tag}: a line of ${longest} characters is wider than the box (${fit.cols} columns) - it wraps or is cut` });
      }
      if (c.type === 'image' && c.rows) {
        const bw = Math.max(0, ...c.rows.map(x => x.length)), bh = c.rows.length;
        if (bw > r.w || bh > r.h) out.push({ region: r, msg: `${tag}: image ${bw}x${bh} is bigger than the box - d.set(image=) crops, it does not scale` });
      }
      if (c.type === 'image' && c.mode === 'file') out.push({ region: r, msg: `${tag}: needs /pics/${c.file || r.name + '.bmp'} copied to the Pico (download it under Export)`, info: true });
    }
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++)
      if (overlaps(rs[i], rs[j])) out.push({ region: rs[i], msg: `"${rs[i].name}" and "${rs[j].name}" overlap - each d.set() wipes its whole box, so they will erase each other` });
    const pz = layout.printZone;
    if (pz && pz.enabled) {
      const band = printBand(layout);
      for (const r of rs) if (overlaps(r, band)) out.push({ region: r, msg: `"${r.name}" lies in the d.print() area (top ${band.h} px) - print() repaints full-width bands and will wipe it` });
    }
    return out;
  }
  // the area d.print() repaints: full width from the top, `lines` lines at `size`
  function printBand(layout) {
    const { w: W, h: H } = panelSize(layout), pz = layout.printZone || {};
    const lh = Display.lineHeight(pz.size | 0 || 16);
    return { x: 0, y: 0, w: W, h: Math.min(H, lh * Math.max(1, pz.lines | 0 || 1)) };
  }

  // ── Python export ──────────────────────────────────────────────────────────
  function pyStr(s) { return JSON.stringify(String(s)); }      // a JSON string is a valid Python str literal
  function pyColor(c, imports) {
    if (isNamedColor(c)) { const k = colorConst(c); imports.add(k); return k; }
    return '0x' + colorValue(c).toString(16).toUpperCase().padStart(6, '0');
  }
  function pyRows(rows, indent) {
    return '[\n' + rows.map(r => `${indent}    ${pyStr(r)},`).join('\n') + `\n${indent}]`;
  }
  // options: { imageDir: "/pics" }  (the test points it at a temp folder)
  function toPython(layout, options = {}) {
    const imageDir = options.imageDir == null ? '/pics' : options.imageDir;
    const imports = new Set(), { w: W, h: H } = panelSize(layout);
    const rot = layout.display.rotation | 0;
    const iconsUsed = new Set(), body = [], sets = [], files = [];
    let needBitmap = false;

    body.push(`d.clear(${pyColor(layout.bg, imports)})${' '.repeat(Math.max(1, 46 - 8 - String(pyColor(layout.bg, imports)).length))}# background - regions wipe to this colour`);
    body.push('');
    body.push('# Regions: define each box once, then update it by name with d.set() - only that box is redrawn.');
    for (const r of layout.regions) {
      const args = [pyStr(r.name), r.x, r.y, r.w, r.h];
      if ((r.size | 0) !== 16) args.push(`size=${r.size | 0}`);
      if (colorValue(r.color) !== 0xFFFFFF) args.push(`color=${pyColor(r.color, imports)}`);
      if (r.bg && r.bg !== 'auto') args.push(`bg=${pyColor(r.bg, imports)}`);
      if (r.align && r.align !== 'left') args.push(`align=${pyStr(r.align)}`);
      let note = '';
      const c = r.content || { type: 'none' };
      if (c.type === 'text') { const f = textFitFor(r); note = `  # ${f.cols} col x ${f.lines} line${f.lines === 1 ? '' : 's'} at ${r.size} px (${f.native ? 'module 8x8 font' : 'Pico 8x16 font'})`; }
      body.push(`d.region(${args.join(', ')})${note}`);
      if (c.type === 'text') sets.push(`d.set(${pyStr(r.name)}, text=${pyStr(c.text || '')})`);
      else if (c.type === 'icon') {
        sets.push(`d.set(${pyStr(r.name)}, icon=${pyStr(c.icon)})`);
        if (layout.icons && layout.icons[c.icon]) iconsUsed.add(c.icon);
      } else if (c.type === 'image' && c.rows) {
        if (c.mode === 'file') {
          const file = c.file || (r.name + '.bmp');
          files.push({ file, rows: c.rows, region: r.name });
          sets.push(`d.set(${pyStr(r.name)}, image=${pyStr(imageDir.replace(/\/$/, '') + '/' + file)})  # copy ${file} into ${imageDir}/ on the Pico`);
        } else {
          needBitmap = true;
          sets.push(`d.set(${pyStr(r.name)}, image=Bitmap.from_rows(${pyRows(c.rows, '')}))`);
        }
      }
    }
    if (layout.regions.length === 0) body.push('# (no regions yet - drag one out on the display in the planner)');

    const head = [];
    head.push(`# noknok display layout - ${W}x${H} ${ROTATIONS[rot].label.toLowerCase()}`);
    head.push(`# Made with the noknok Display Planner: ${TOOL_URL}`);
    head.push('# Paste into your product.py after the display is fetched:   d = c.display[0]');
    const names = ['ICONS'].filter(() => iconsUsed.size).concat(needBitmap ? ['Bitmap'] : [], [...imports].sort());
    head.push(`from noknok import ${names.join(', ')}`);
    head.push('');
    if (iconsUsed.size) {
      head.push('# Your own icons ("#" = lit pixel, drawn in the region colour; anything else = background).');
      for (const n of [...iconsUsed].sort()) head.push(`ICONS[${pyStr(n)}] = ${pyRows(layout.icons[n], '')}`);
      head.push('');
    }
    if (rot !== 0) head.push(`d.rotation(${rot})${' '.repeat(30)}# ${ROTATIONS[rot].label.toLowerCase()} (${W}x${H}); needs display firmware 0.3.0+`);

    const tail = [];
    if (sets.length) { tail.push(''); tail.push('# Starter content - call d.set(name, text=... | icon=... | image=...) whenever a value changes.'); tail.push(...sets); }
    if (layout.printZone && layout.printZone.enabled) {
      tail.push(''); tail.push(`# You said you also use d.print(): it repaints the top ${printBand(layout).h} px full-width - keep regions out of that band.`);
    }
    return { code: head.concat(body, tail).join('\n') + '\n', files };
  }

  // ── layout.json in / out ───────────────────────────────────────────────────
  function toJSON(layout) { return JSON.stringify(layout, null, 2) + '\n'; }
  function fromJSON(text) {
    const o = JSON.parse(text);
    if (!o || o.planner !== 'noknok-display-planner') throw new Error('not a noknok display layout file');
    const L = newLayout();
    Object.assign(L.display, o.display || {});
    L.display.width = Math.max(1, Math.min(255, L.display.width | 0));
    L.display.height = Math.max(1, Math.min(255, L.display.height | 0));
    L.display.rotation = (L.display.rotation | 0) & 3;
    if (!PRESETS.some(p => p.id === L.display.preset)) L.display.preset = 'custom';
    L.bg = typeof o.bg === 'string' ? o.bg : 'black';
    L.regions = Array.isArray(o.regions) ? o.regions.map(r => Object.assign(newRegion(String(r.name || 'region'), r.x | 0, r.y | 0, r.w | 0, r.h | 0),
      { size: r.size | 0 || 16, color: r.color || 'white', bg: r.bg || 'auto', align: r.align || 'left', content: r.content || { type: 'none' } })) : [];
    L.icons = (o.icons && typeof o.icons === 'object') ? o.icons : {};
    Object.assign(L.printZone, o.printZone || {});
    return L;
  }

  const LAYOUT = { PRESETS, ROTATIONS, NAME_RE, TOOL_URL, newLayout, newRegion, panelSize, iconLookup, allIconNames,
                   render, warnings, printBand, textFitFor, toPython, toJSON, fromJSON, colorValue, isNamedColor };
  if (typeof module !== 'undefined' && module.exports) module.exports = LAYOUT;
  root.NDP_LAYOUT = LAYOUT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
