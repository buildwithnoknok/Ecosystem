// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 noknok / Christopher Houben
//
// Golden test: the planner's preview (render.js) and its exported Python (layout.js) must
// agree with the REAL noknok.py, pixel for pixel. For each fixture layout this
//   1. renders it with render.js                                  -> frame A
//   2. exports it with layout.toPython() (+ any .bmp files)       -> snippet.py
//   3. runs the snippet through noknok.py on display_sim.py       -> frame B  (golden_sim.py)
//   4. diffs A and B (RGB565 hex per pixel).
// Needs: Node, a desktop Python (set PYTHON, default = Thonny's on Christopher's PC), the
// brain-Pico and module-I2C-1.42-display repos cloned beside Ecosystem.
//   node test/golden.mjs
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const N = require('../render.js');
const L = require('../layout.js');
const HERE = fileURLToPath(new URL('.', import.meta.url));
const PYTHON = process.env.PYTHON || 'C:/Users/chris/AppData/Local/Programs/Thonny/python.exe';

// ── fixtures ─────────────────────────────────────────────────────────────────
const logo = ['..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..####..', '........', '#.#.#.#.'];
const fixtures = [];

{ // 1. the handoff example: text region native + icon, portrait
  const l = L.newLayout();
  l.regions.push(Object.assign(L.newRegion('clock', 0, 0, 80, 32), { size: 32, color: 'yellow', align: 'center', content: { type: 'text', text: '12:34' } }));
  l.regions.push(Object.assign(L.newRegion('net', 62, 140, 18, 18), { content: { type: 'icon', icon: 'wifi' } }));
  fixtures.push(['handoff-example', l]);
}
{ // 2. everything at once: Pico-font text (non-native size + umlaut), wrapping, right/center
  //    align, own icon (embedded), image embedded + image as .bmp file, custom colours, bg colour
  const l = L.newLayout();
  l.bg = '#101820';
  l.icons.mylogo = logo;
  l.regions.push(Object.assign(L.newRegion('title', 2, 2, 76, 20), { size: 20, color: 'noknok', align: 'center', content: { type: 'text', text: 'Grüezi' } }));
  l.regions.push(Object.assign(L.newRegion('body', 0, 24, 80, 60), { size: 12, color: '#FFCC00', bg: 'darkgrey', content: { type: 'text', text: 'The quick brown fox jumps over the lazy dog' } }));
  l.regions.push(Object.assign(L.newRegion('num', 0, 86, 80, 24), { size: 24, color: 'lime', align: 'right', content: { type: 'text', text: '42' } }));
  l.regions.push(Object.assign(L.newRegion('logo', 4, 112, 24, 24), { size: 24, color: 'pink', content: { type: 'icon', icon: 'mylogo' } }));
  l.regions.push(Object.assign(L.newRegion('arrow', 30, 112, 20, 20), { size: 20, color: 'cyan', align: 'center', content: { type: 'icon', icon: 'arrow_left' } }));
  l.regions.push(Object.assign(L.newRegion('pic', 52, 112, 26, 26), { color: 'white', content: { type: 'image', rows: N.builtinIcon('gear').scaled(26, 26).rows(), mode: 'embed' } }));
  l.regions.push(Object.assign(L.newRegion('pic2', 0, 140, 80, 20), { color: 'orange', align: 'center', content: { type: 'image', rows: N.builtinIcon('heart').scaled(20, 20).rows(), mode: 'file', file: 'heart.bmp' } }));
  l.regions.push(Object.assign(L.newRegion('empty', 60, 90, 20, 20), { bg: 'purple', content: { type: 'none' } }));
  fixtures.push(['everything', l]);
}
{ // 3. landscape, native text at the right edge (module clips glyphs), tiny box, overflow text
  const l = L.newLayout();
  l.display.rotation = 1;
  l.regions.push(Object.assign(L.newRegion('wide', 0, 0, 160, 40), { size: 40, color: 'green', content: { type: 'text', text: 'LANDSCAPE' } }));
  l.regions.push(Object.assign(L.newRegion('edge', 140, 44, 20, 16), { size: 16, content: { type: 'text', text: 'XYZ' } }));
  l.regions.push(Object.assign(L.newRegion('tiny', 0, 44, 6, 6), { size: 8, content: { type: 'text', text: 'a' } }));
  l.regions.push(Object.assign(L.newRegion('multi', 0, 52, 100, 28), { size: 8, content: { type: 'text', text: 'line one\nline two\nline three\nline four' } }));
  l.regions.push(Object.assign(L.newRegion('big', 104, 62, 56, 18), { size: 64, color: 'red', content: { type: 'icon', icon: 'battery_low' } }));
  fixtures.push(['landscape-edges', l]);
}
{ // 4. custom panel size with a region that hangs off the edge (clipped, not dropped)
  const l = L.newLayout();
  l.display = { preset: 'custom', width: 64, height: 48, rotation: 0 };
  l.regions.push(Object.assign(L.newRegion('off', 40, 30, 40, 40), { size: 16, color: 'white', bg: 'blue', content: { type: 'text', text: 'off' } }));
  l.regions.push(Object.assign(L.newRegion('ic', 0, 0, 40, 40), { size: 40, content: { type: 'icon', icon: 'check' } }));
  fixtures.push(['custom-clipped', l]);
}

// ── run ──────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'ndp-golden-'));
let failed = 0;
for (const [name, layout] of fixtures) {
  const { w, h } = L.panelSize(layout);
  const a = L.render(layout).panel.dumpHex();
  const { code, files } = L.toPython(layout, { imageDir: tmp.replace(/\\/g, '/') });
  for (const f of files) writeFileSync(join(tmp, f.file), N.Bitmap.fromRows(f.rows).toBMP());
  const snippet = join(tmp, name + '.py');
  writeFileSync(snippet, code);
  const r = spawnSync(PYTHON, [join(HERE, 'golden_sim.py'), snippet, String(w), String(h)], { encoding: 'utf8' });
  if (r.status !== 0) { console.log(`FAIL ${name}: python exited ${r.status}\n${r.stderr}`); failed++; continue; }
  if (r.stderr.trim()) console.log(`  note ${name}: ${r.stderr.trim()}`);
  const b = r.stdout.replace(/\r/g, '').trim();
  if (a === b) { console.log(`  ok   ${name} (${w}x${h}, ${layout.regions.length} regions, ${code.split('\n').length} lines of Python)`); continue; }
  failed++;
  const ra = a.split('\n'), rb = b.split('\n');
  let first = -1, n = 0;
  for (let y = 0; y < Math.max(ra.length, rb.length); y++) if (ra[y] !== rb[y]) { n++; if (first < 0) first = y; }
  console.log(`FAIL ${name}: ${n} rows differ, first at y=${first}`);
  if (first >= 0) {
    const show = s => (s || '').replace(/.{4}/g, m => m === '0000' ? '.' : (m === 'ffff' ? '#' : 'a'));
    console.log('   js: ' + show(ra[first])); console.log('   py: ' + show(rb[first]));
  }
  console.log('   snippet: ' + snippet);
}
console.log(failed ? `\n${failed} of ${fixtures.length} golden fixtures FAILED` : `\nall ${fixtures.length} golden fixtures match noknok.py`);
process.exit(failed ? 1 : 0);
