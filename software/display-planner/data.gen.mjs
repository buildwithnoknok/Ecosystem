// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 noknok / Christopher Houben
//
// Regenerates data.gen.js from the two sources of truth, so the planner's preview can
// never drift from what the Pico and the module actually draw:
//   - brain-Pico/software/noknok.py   -> built-in ICONS, colour names, the Pico's 8x16 font
//   - module-I2C-1.42-display/firmware/src/font8x8.h -> the module's native 8x8 font
// Run from this folder:  node data.gen.mjs      (Node only, no npm packages needed)
import { readFileSync, writeFileSync } from 'fs';

const REPOS    = 'C:/Users/chris/noknok/repos';
const NOKNOK   = process.env.NOKNOK_PY  || `${REPOS}/brain-Pico/software/noknok.py`;
const FONT8X8  = process.env.FONT8X8_H  || `${REPOS}/module-I2C-1.42-display/firmware/src/font8x8.h`;
const OUT      = new URL('./data.gen.js', import.meta.url);

const py = readFileSync(NOKNOK, 'utf8');
const ch = readFileSync(FONT8X8, 'utf8');

// ── module font: 95 glyphs x 8 row bytes, LSB = leftmost pixel ────────────────
const rows8 = [...ch.matchAll(/\{\s*((?:0x[0-9A-Fa-f]{2}\s*,\s*){7}0x[0-9A-Fa-f]{2})\s*\}/g)]
  .map(m => m[1].match(/0x[0-9A-Fa-f]{2}/g).map(v => parseInt(v, 16)));
if (rows8.length !== 95) throw new Error(`font8x8.h: expected 95 glyphs, got ${rows8.length}`);

// ── Pico font: the base64 blob, 16 bytes/glyph, MSB = leftmost ────────────────
const b64m = py.match(/_FONT8X16_B64\s*=\s*\(([\s\S]*?)\n\)/);
if (!b64m) throw new Error('noknok.py: _FONT8X16_B64 not found');
const font8x16b64 = [...b64m[1].matchAll(/"([^"]*)"/g)].map(m => m[1]).join('');
const nGlyph16 = Buffer.from(font8x16b64, 'base64').length / 16;
if (nGlyph16 < 191) throw new Error(`8x16 font: expected >=191 glyphs, got ${nGlyph16}`);

// ── built-in icons: ICONS = { "name": [ "....", ... ], ... } ───────────────────
const icm = py.match(/^ICONS\s*=\s*\{([\s\S]*?)^\}/m);
if (!icm) throw new Error('noknok.py: ICONS dict not found');
const icons = {};
for (const m of icm[1].matchAll(/"([A-Za-z0-9_]+)"\s*:\s*\[([\s\S]*?)\]/g))
  icons[m[1]] = [...m[2].matchAll(/"([^"]*)"/g)].map(r => r[1]);
if (Object.keys(icons).length < 10) throw new Error('ICONS: parsed too few icons');

// ── colours: CONSTANT = 0xRRGGBB, then COLORS = {"name": CONSTANT, ...} ───────
const consts = {};
for (const m of py.matchAll(/^([A-Z_]+)\s*=\s*0x([0-9A-Fa-f]{6})\b/gm)) consts[m[1]] = parseInt(m[2], 16);
const cm = py.match(/^COLORS\s*=\s*\{([\s\S]*?)^\}/m);
if (!cm) throw new Error('noknok.py: COLORS dict not found');
const colors = {};                                 // name -> { const, rgb }
for (const m of cm[1].matchAll(/"([a-z]+)"\s*:\s*([A-Z_]+)/g)) {
  if (!(m[2] in consts)) throw new Error(`COLORS: ${m[2]} has no 0xRRGGBB definition`);
  colors[m[1]] = { const: m[2], rgb: consts[m[2]] };
}

const ver = (py.match(/__version__\s*=\s*"([^"]+)"/) || [,'?'])[1];
const out = `// GENERATED FILE - do not edit. Regenerate with:  node data.gen.mjs
// Sources: brain-Pico/software/noknok.py (v${ver}) + module-I2C-1.42-display/firmware/src/font8x8.h
// SPDX-License-Identifier: MIT
var NDP_DATA = {
  noknokVersion: ${JSON.stringify(ver)},
  generated: ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  // module-native 8x8 font, ASCII 0x20-0x7E, one byte per row, LSB = leftmost pixel
  font8x8: ${JSON.stringify(rows8)},
  // Pico 8x16 font (ASCII 32-126 then Latin-1 160-255), 16 bytes per glyph, MSB = leftmost
  font8x16b64: ${JSON.stringify(font8x16b64)},
  // the driver's built-in icons, exactly as noknok.py ships them ('#' = lit)
  icons: ${JSON.stringify(icons, null, 1).replace(/\n\s*"/g, '\n    "').replace(/\n\s*\]/g, '\n  ]').replace(/\n\}/, '\n }')},
  // colour names -> noknok.py constant + 0xRRGGBB value
  colors: ${JSON.stringify(colors)}
};
if (typeof module !== "undefined" && module.exports) module.exports = NDP_DATA;
`;
writeFileSync(OUT, out);
console.log(`data.gen.js: ${rows8.length} module glyphs, ${nGlyph16} Pico glyphs, ${Object.keys(icons).length} icons, ${Object.keys(colors).length} colours (noknok.py v${ver})`);
