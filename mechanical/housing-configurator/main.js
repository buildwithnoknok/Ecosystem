// noknok Housing Configurator — V5 app entry.  SPDX-License-Identifier: MIT
// 2D bird's-eye placement + user-drawn box outline -> a single monolithic box: front + back
// covers, per-module M2.5 holding columns (lengths set so every payload reaches the front),
// payload openings, USB-C wall holes, uniform height. Bundled with esbuild -> app.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import jscad from '@jscad/modeling';
import stlSerializer from '@jscad/stl-serializer';
const { primitives, booleans, transforms, extrusions, expansions, hulls } = jscad;
const { cuboid, cylinder, rectangle, circle, polygon, sphere } = primitives;
const { union, subtract, intersect } = booleans;
const { hull } = hulls;
const { translate, rotate, mirror } = transforms;
const { extrudeLinear, extrudeHelical, extrudeRotate } = extrusions;
const { offset, expand } = expansions;
const { path2, geom3 } = jscad.geometries;
const { vectorText } = jscad.text;   // built-in single-stroke font for engraved labels
import { LOGO } from './logo-data.js';   // noknok square logo (2-line "nok/nok"), flattened vector contours
const TAU = Math.PI * 2;
// "noknok Dome Mount ø58" — coarse jar-style thread for screw-in tops over the USB LEDs. The thread is a
// FEMALE (internal) ring that projects DOWN into the box from the top cover (same way as walls/columns,
// so the cover prints flat with no supports). A lid (dome) with the matching MALE thread screws in from
// the top. The 60 mm form factor is sized so the 40x40 board sits inside the ring bore. threadMajor =
// male crest OD; depth = radial tooth; lead = 3-start => 2.5 mm crest spacing; opening = light hole in
// the plate (>= board diagonal 56.6 so the board fits inside); form = module footprint (mm).
const DOME = { threadMajor:59.5, depth:1.2, height:6, lead:7.5, starts:3, clearance:0.4, opening:58, form:70 };   // form 70 = lid globe fills the 70 mm tile; 45° skirt flares out to the wider cap
const domeThread = (grow=0) => threadSolid({ majorD:DOME.threadMajor, depth:DOME.depth, height:DOME.height, lead:DOME.lead, starts:DOME.starts }, grow);

// ---- Module library (mm). footprint w×h, payload height, plenum, M2.5 holes, connectors, top opening.
// conn = [ arrowDir, x, y, kind? ] — arrowDir (N/S/E/W) = the way the plug inserts / cable exits (drawn
// as an arrow), set per real board. Mirrors each module repo's mechanical/housing.json. Origin = bottom-left. ----
const MODULES = {
  buzzer:    { name:'buzzer',     w:20, h:20, clearance_top:3.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['N',3.1,15.5],['S',16.9,4.5]], top:{type:'grille', x:10, y:10, dia:8.5} },
  knob:      { name:'knob',       w:20, h:20, clearance_top:9.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['N',3.1,15.5],['S',16.9,4.5]], top:{type:'round_hole', x:10, y:10.25, dia:7.4} },
  ledbutton: { name:'LED button', w:20, h:20, clearance_top:5.0, pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['N',3.1,15.5],['S',16.9,4.5]], top:{type:'button', x:10, y:10, w:16.4, h:16.2} },  // 5 mm PCB-to-top-cover (keyboard switch); button behind the front window
  usbled:    { name:'USB LEDs',   w:40, h:40, clearance_top:1.6,  pcb:1.6, clearance_bottom:9.0,
    holes:[[4,4],[36,4],[4,36],[36,36]], conn:[['W',3,20,'usb'],['E',36.5,20]], top:{type:'window', x:20, y:20, w:38, h:38} },  // square opening so the corner LEDs aren't clipped
  usbleddome:{ name:'USB LEDs +dome', w:70, h:70, clearance_top:1.6, pcb:1.6, clearance_bottom:9.0,   // 70×70 variant: 40×40 board centred, female thread ring (ø62) stays inside the tile so it can't overlap a neighbour
    holes:[[19,19],[51,19],[19,51],[51,51]], conn:[['W',18,35,'usb'],['E',51.5,35]], top:{type:'dome_mount', x:35, y:35, dia:58} },
  // 1.42" display: the ONE module whose payload side is KiCad's BOTTOM (panel bonded there, FPC wraps
  // round the E edge to top-side pads). Coords below are the PAYLOAD view = KiCad top view mirrored in Y
  // (v' = 30 - v), same convention as the other modules -> the 2nd JST lands on the N edge, not the S.
  // clearance_top 2.2 = 2.08 mm panel + 0.12 bond/tolerance, so the bezel frames the glass without
  // pressing on it. Both JSTs open straight off their nearest edge (W and N).
  display:   { name:'display',    w:40, h:30, clearance_top:2.2,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[2.25,27.75],[37.75,2.25],[37.75,27.75]], conn:[['W',3.1,15],['N',20,26.9]], top:{type:'window', x:19.8, y:15, w:32.35, h:16.18} },
};
const USBC_W = 9, USBC_H = 4.5;   // USB-C power slot: width along the wall × height (click a wall)
const GRID = 10;         // mm per cell
const WALL_GAP = 2;      // clearance between a module and the outer wall (so it's easy to drop in)
const LOGO_SIZE = 9.5;   // mm, the noknok logo's larger axis — nearly fills the 10 mm tile (~0.25 mm margin)
const LOGO_DEPTH = 0.6;  // mm, deboss depth into the top cover

const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };

// ---- state ----
let placed = [];          // { id, key, x, y, rot }  x,y = bottom-left in mm (grid-snapped)
let nextId = 1, selId = null;
let region = new Set();   // "gx,gy" cells INSIDE the box
let autoBox = true;       // region auto = bounding box of the modules, until the user edits a cell
let holes = new Set();    // "gx,gy,side" walls carrying a USB-C power slot
let latches = new Set();  // "gx,gy,side" walls carrying an assembly latch (user-placed)
let wallMode = 'hole';    // clicking a wall adds: 'hole' or 'latch'
let labels = [];          // { id, modId, side, text, size } — engraved text on the top cover
let nextLabelId = 1, labelSide = 'N', labelSize = 5;
let hooks = [];           // { gx, gy } — mushroom cable retainers on the bottom cover, in empty in-box tiles
let cellMode = 'box';     // clicking an empty in-box cell: 'box' = reshape outline, 'hook' = place cable hook
// ---- box-joining features (join two separately-printed boxes) — all keyed "gx,gy,side" like holes/latches
let dtMale = new Set();    // male dovetail RAIL on the OUTSIDE of a wall (slides down into another box's groove)
let dtFemale = new Set();  // female dovetail GROOVE — grows a boss inward and reserves that tile for the socket
let openings = new Set();  // cable pass-through — most of the wall removed at the floor line
let logos = [];            // { gx, gy } — noknok logo debossed on the TOP cover, on empty in-box tiles
let logoDismissed = false; // true once the user removes the logo, so the default-on placement won't re-add it

// footprint accounting for rotation (90/270 swaps w/h)
function footprint(p) { const m = MODULES[p.key]; return (p.rot % 180 === 0) ? { w:m.w, h:m.h } : { w:m.h, h:m.w }; }
// a module-local point (mx,my) -> world (bottom-left origin), applying rotation + placement
function loc(p, mx, my) {
  const m = MODULES[p.key]; let rx, ry;
  switch (p.rot) { case 90: rx=m.h-my; ry=mx; break; case 180: rx=m.w-mx; ry=m.h-my; break;
    case 270: rx=my; ry=m.w-mx; break; default: rx=mx; ry=my; }
  return { x: p.x + rx, y: p.y + ry };
}

// ---- grid cells + box region ----
const ck = (gx, gy) => gx + ',' + gy;
function moduleCells() {
  const s = new Set();
  for (const p of placed) { const fp = footprint(p);
    for (let cx = p.x/GRID; cx < (p.x+fp.w)/GRID; cx++)
      for (let cy = p.y/GRID; cy < (p.y+fp.h)/GRID; cy++) s.add(ck(cx,cy)); }
  return s;
}
// tiles reserved by female dovetail sockets (the in-box cell that owns each female wall)
function femaleCells() { const s = new Set(); for (const k of dtFemale) { const [gx,gy] = k.split(','); s.add(ck(+gx,+gy)); } return s; }
// cells occupied by a label's reserved strip (the tiles adjacent to a module edge)
function cellBox(p) { const fp = footprint(p);
  return { x0:p.x/GRID, x1:(p.x+fp.w)/GRID-1, y0:p.y/GRID, y1:(p.y+fp.h)/GRID-1 }; }
function labelCells(l) {
  const p = placed.find(q=>q.id===l.modId); if (!p) return [];
  const b = cellBox(p), out = [];
  if (l.side==='N')      for (let gx=b.x0; gx<=b.x1; gx++) out.push([gx, b.y1+1]);
  else if (l.side==='S') for (let gx=b.x0; gx<=b.x1; gx++) out.push([gx, b.y0-1]);
  else if (l.side==='E') for (let gy=b.y0; gy<=b.y1; gy++) out.push([b.x1+1, gy]);
  else                   for (let gy=b.y0; gy<=b.y1; gy++) out.push([b.x0-1, gy]);
  return out;
}
function allLabelCells() { const s=new Set(); for (const l of labels) for (const [gx,gy] of labelCells(l)) s.add(ck(gx,gy)); return s; }
function requiredCells() { const s = moduleCells(); for (const c of allLabelCells()) s.add(c); for (const c of femaleCells()) s.add(c); return s; }   // must be inside the box
// cells occupied by OTHER modules + OTHER modules' labels (own labels follow the module, so they're excluded)
function occupiedBy(exceptId) {
  const s = new Set();
  for (const q of placed) if (q.id !== exceptId) { const fp = footprint(q);
    for (let cx=q.x/GRID; cx<(q.x+fp.w)/GRID; cx++) for (let cy=q.y/GRID; cy<(q.y+fp.h)/GRID; cy++) s.add(ck(cx,cy)); }
  for (const l of labels) if (l.modId !== exceptId) for (const [gx,gy] of labelCells(l)) s.add(ck(gx,gy));
  for (const c of femaleCells()) s.add(c);   // a female socket fills its tile — no module may sit there
  return s;
}
// does a footprint at grid-cell (gx0,gy0) sized (wc×hc) hit any occupied/blocked cell?
function fits(gx0, gy0, wc, hc, blocked) {
  for (let cx=gx0; cx<gx0+wc; cx++) for (let cy=gy0; cy<gy0+hc; cy++) if (blocked.has(ck(cx,cy))) return false;
  return true;
}
// world-mm rectangle of a label's strip (for 2D text + 3D engraving)
function labelStripWorld(l) {
  const cells = labelCells(l); if (!cells.length) return null;
  const gxs=cells.map(c=>c[0]), gys=cells.map(c=>c[1]);
  return { x0:Math.min(...gxs)*GRID, x1:(Math.max(...gxs)+1)*GRID,
           y0:Math.min(...gys)*GRID, y1:(Math.max(...gys)+1)*GRID, horizontal:(l.side==='N'||l.side==='S') };
}
function recomputeBox() {          // auto box = bounding rectangle of the module + label cells
  const mc = [...requiredCells()].map(c => c.split(',').map(Number));
  region = new Set(); if (!mc.length) return;
  const xs = mc.map(c=>c[0]), ys = mc.map(c=>c[1]);
  const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  for (let gx=x0; gx<=x1; gx++) for (let gy=y0; gy<=y1; gy++) region.add(ck(gx,gy));
}
// Default-ON branding (opt-out): if the user hasn't removed the logo and there's an empty in-box tile with
// solid top plate, drop one noknok logo in an unobtrusive corner. Removing it sets logoDismissed so it
// won't come back. Not mandatory — a design with no free tile just goes un-branded (with a gentle nudge).
function ensureDefaultLogo() {
  if (logoDismissed || logos.length || !placed.length) return;
  const mc = moduleCells(), lc = allLabelCells(), hc = new Set(hooks.map(h => ck(h.gx,h.gy)));
  const free = [...region].map(c => c.split(',').map(Number))
    .filter(([gx,gy]) => !mc.has(ck(gx,gy)) && !lc.has(ck(gx,gy)) && !hc.has(ck(gx,gy)));
  if (!free.length) return;
  free.sort((a,b) => b[1]-a[1] || b[0]-a[0]);   // top-most then right-most = a quiet corner
  logos.push({ gx: free[0][0], gy: free[0][1] });
}
const update = () => { if (autoBox) recomputeBox(); render(); };
const NB = { N:[0,1], S:[0,-1], E:[1,0], W:[-1,0] };
function boundaryWalls() {          // edges where an in-region cell meets an out-region cell
  const w = [];
  for (const c of region) { const [gx,gy] = c.split(',').map(Number);
    for (const s in NB) { const [dx,dy]=NB[s]; if (!region.has(ck(gx+dx,gy+dy))) w.push([gx,gy,s]); } }
  return w;
}
// drop any power slot / latch whose wall is no longer a boundary of the box (e.g. after a tile is
// removed or a module moves) — otherwise it lingers invisibly and reappears in the 3D box.
function pruneWalls() {
  const valid = new Set(boundaryWalls().map(([gx,gy,s]) => `${gx},${gy},${s}`));
  for (const k of [...holes])    if (!valid.has(k)) holes.delete(k);
  for (const k of [...latches])  if (!valid.has(k)) latches.delete(k);
  for (const k of [...dtMale])   if (!valid.has(k)) dtMale.delete(k);
  for (const k of [...dtFemale]) if (!valid.has(k)) dtFemale.delete(k);
  for (const k of [...openings]) if (!valid.has(k)) openings.delete(k);
  // drop cable hooks / logos whose tile is no longer an empty in-box cell (module moved onto it, tile removed)
  const mc = moduleCells(), lc = allLabelCells();
  const stillFree = (o) => region.has(ck(o.gx,o.gy)) && !mc.has(ck(o.gx,o.gy)) && !lc.has(ck(o.gx,o.gy));
  hooks = hooks.filter(stillFree);
  logos = logos.filter(stillFree);
}
function wallXY(gx,gy,s) {          // SVG endpoints of a wall segment (Y flipped)
  const x0=gx*GRID, x1=(gx+1)*GRID, ya=VBH-(gy+1)*GRID, yb=VBH-gy*GRID;
  return s==='N' ? [x0,ya,x1,ya] : s==='S' ? [x0,yb,x1,yb] : s==='E' ? [x1,ya,x1,yb] : [x0,ya,x0,yb];
}

// ---- SVG ----
const svg = document.getElementById('grid');
const VBW = 360, VBH = 240;        // design area in mm (36×24 cells)
svg.setAttribute('viewBox', `0 0 ${VBW} ${VBH}`);
svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e); return e;
}
// SVG dovetail outline at a wall midpoint (mx,my): narrow neck (nw) at the wall widening to tip (tw) over
// depth dp, along the wall's outward normal oS / tangent tS. inward=true points into the box (female).
function svgDovetail(mx, my, oS, tS, nw, tw, dp, inward) {
  const s = inward ? -1 : 1, tx = mx + oS[0]*dp*s, ty = my + oS[1]*dp*s;
  const P = (px,py,w) => `${(px+tS[0]*w).toFixed(2)},${(py+tS[1]*w).toFixed(2)}`;
  return `${P(mx,my,-nw/2)} ${P(tx,ty,-tw/2)} ${P(tx,ty,tw/2)} ${P(mx,my,nw/2)}`;
}

function render() {
  svg.innerHTML = '';
  pruneWalls();          // keep power slots / latches only on walls that still exist
  ensureDefaultLogo();   // default-on branding: drop a logo in a free tile unless the user removed it
  // grid lines
  const g = el('g', { stroke:'var(--grid)', 'stroke-width':0.25 }, svg);
  for (let x=0; x<=VBW; x+=GRID) el('line', {x1:x,y1:0,x2:x,y2:VBH}, g);
  for (let y=0; y<=VBH; y+=GRID) el('line', {x1:0,y1:y,x2:VBW,y2:y}, g);
  // box region fill
  const rg = el('g', {}, svg);
  for (const c of region) { const [gx,gy]=c.split(',').map(Number);
    el('rect', {x:gx*GRID, y:VBH-(gy+1)*GRID, width:GRID, height:GRID,
      fill:'var(--accent)', 'fill-opacity':0.07, 'pointer-events':'none'}, rg); }
  // modules + markers
  for (const p of placed) {
    const fp = footprint(p), m = MODULES[p.key];
    const sx = p.x, sy = VBH - (p.y + fp.h);
    const grp = el('g', { 'data-id':p.id, style:'cursor:grab' }, svg);
    const sel = p.id === selId;
    el('rect', { x:sx, y:sy, width:fp.w, height:fp.h, rx:1.5, fill:'var(--mod)',
      stroke: sel ? 'var(--sel)' : 'var(--modEdge)', 'stroke-width': sel ? 1.4 : 0.6 }, grp);
    el('text', { x:sx+fp.w/2, y:sy+fp.h/2, 'font-size':4.2, fill:'#1a1205',
      'text-anchor':'middle', 'dominant-baseline':'central', 'pointer-events':'none' }, grp).textContent = m.name;
    for (const [hx,hy] of m.holes) { const w = loc(p,hx,hy);
      el('circle', { cx:w.x, cy:VBH-w.y, r:1.25, fill:'none', stroke:'#5c3d08', 'stroke-width':0.45, 'pointer-events':'none' }, grp); }
    // connector: an ARROW at the socket, pointing the way the plug is inserted / the cable exits. That
    // direction is an explicit compass letter in the connector data (conn[0]) — it varies per board, so
    // it is stored, not derived. The arrow rotates with the module and is length-clamped to stay inside.
    for (const [dir, cx, cy, kind] of m.conn || []) {
      const w = loc(p,cx,cy), sx = w.x, sy = VBH - w.y;
      const D = { N:[0,1], S:[0,-1], E:[1,0], W:[-1,0] }[dir] || [0,-1];    // module-local arrow direction
      const ldx = D[0], ldy = D[1];
      const dist = ldy>0 ? m.h-cy : ldy<0 ? cy : ldx>0 ? m.w-cx : cx;       // room to that edge (clamp length)
      let dx, dy; switch (p.rot) {                                          // rotate with the module
        case 90:  dx=-ldy; dy= ldx; break; case 180: dx=-ldx; dy=-ldy; break;
        case 270: dx= ldy; dy=-ldx; break; default: dx= ldx; dy= ldy; }
      const ux = dx, uy = -dy, px = -uy, py = ux;                           // SVG dir (flip Y) + perpendicular
      const col = kind==='usb' ? '#2b7fd0' : '#3d2a08';
      const len = Math.max(2.4, Math.min(6, dist - 1.3));                   // keep the head inside the square
      const hx = sx + ux*len, hy = sy + uy*len;
      el('line', { x1:sx, y1:sy, x2:hx-ux*2.2, y2:hy-uy*2.2, stroke:col, 'stroke-width':1.2, 'stroke-linecap':'round', 'pointer-events':'none' }, grp);
      el('polygon', { points:`${hx},${hy} ${hx-ux*2.6+px*1.6},${hy-uy*2.6+py*1.6} ${hx-ux*2.6-px*1.6},${hy-uy*2.6-py*1.6}`,
        fill:col, 'pointer-events':'none' }, grp);
    }
  }
  // labels: reserved strip + the text that will be engraved on the top cover
  for (const l of labels) {
    const s = labelStripWorld(l); if (!s) continue;
    const lg = el('g', { 'pointer-events':'none' }, svg);
    el('rect', { x:s.x0, y:VBH-s.y1, width:s.x1-s.x0, height:s.y1-s.y0, rx:1, fill:'#59d3a4',
      'fill-opacity':0.10, stroke:'#59d3a4', 'stroke-opacity':0.55, 'stroke-width':0.4, 'stroke-dasharray':'2 1.5' }, lg);
    const cx=(s.x0+s.x1)/2, cy=VBH-(s.y0+s.y1)/2;
    const fs = Math.min(l.size, (s.horizontal?s.y1-s.y0:s.x1-s.x0) - 2.5);
    const t = el('text', { x:cx, y:cy, 'font-size':fs, fill:'#d8f5e9', 'text-anchor':'middle',
      'dominant-baseline':'central', 'font-family':'Inter, system-ui, sans-serif' }, lg);
    if (!s.horizontal) t.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    t.textContent = l.text;
  }
  // box walls (clickable). Each wall carries at most one feature: power slot (blue), latch (orange),
  // male/female dovetail (sky) or a cable opening (coral) — the last three join two boxes together.
  const DT_COL = '#38bdf8', OPEN_COL = '#fb7185';
  const wg = el('g', {}, svg);
  for (const [gx,gy,s] of boundaryWalls()) {
    const [x1,y1,x2,y2] = wallXY(gx,gy,s), key = `${gx},${gy},${s}`;
    const hole=holes.has(key), latch=latches.has(key), male=dtMale.has(key), female=dtFemale.has(key), open=openings.has(key);
    const feat = hole||latch||male||female||open;
    const col = hole?'#2b7fd0': latch?'#e8912f': (male||female)?DT_COL: open?OPEN_COL:'var(--accent)';
    el('line', { x1,y1,x2,y2, stroke:'transparent', 'stroke-width':3.5, 'data-wall':key, style:'cursor:pointer' }, wg);
    el('line', { x1,y1,x2,y2, stroke:col, 'stroke-width': feat?1.9:0.9, 'pointer-events':'none' }, wg);
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    const oS = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] }[s], tS = [-oS[1], oS[0]];
    if (hole)  el('rect', { x:mx-USBC_W/2, y:my-2, width:USBC_W, height:4, rx:1.2, fill:'#2b7fd0', 'fill-opacity':0.3, stroke:'#2b7fd0', 'stroke-width':0.5, 'pointer-events':'none' }, wg);
    if (latch) el('rect', { x:mx-2, y:my-2, width:4, height:4, rx:0.8, fill:'#e8912f', 'fill-opacity':0.35, stroke:'#e8912f', 'stroke-width':0.5, 'pointer-events':'none' }, wg);
    if (male)  el('polygon', { points: svgDovetail(mx,my,oS,tS,DT.neck,DT.tip,DT.depth,false), fill:DT_COL, 'fill-opacity':0.85, 'pointer-events':'none' }, wg);
    if (female) {
      el('rect', { x:gx*GRID, y:VBH-(gy+1)*GRID, width:GRID, height:GRID, fill:DT_COL, 'fill-opacity':0.12, 'pointer-events':'none' }, wg);
      el('polygon', { points: svgDovetail(mx,my,oS,tS,DT.neck,DT.tip,DT.depth,true), fill:'none', stroke:DT_COL, 'stroke-width':0.7, 'pointer-events':'none' }, wg);
    }
    if (open)  el('rect', { x:mx-(oS[0]?2:4), y:my-(oS[1]?2:4), width:oS[0]?4:8, height:oS[1]?4:8, rx:1, fill:OPEN_COL, 'fill-opacity':0.25, stroke:OPEN_COL, 'stroke-width':0.6, 'pointer-events':'none' }, wg);
  }
  // cable retainers (on empty in-box tiles): a mushroom, drawn top-down as cap + stem (radially symmetric)
  for (const h of hooks) {
    const cx=(h.gx+0.5)*GRID, cy=VBH-(h.gy+0.5)*GRID, col='#c07be0';
    const hg = el('g', { 'pointer-events':'none' }, svg);
    el('circle', { cx, cy, r:MUSH.capR, fill:col, 'fill-opacity':0.30, stroke:col, 'stroke-width':0.6 }, hg);   // cap
    el('circle', { cx, cy, r:MUSH.stemR, fill:col }, hg);                                                       // stem
  }
  // noknok logo tiles (debossed on the top cover). The whole tile is a transparent drag handle (grab it
  // like a module); the mark is drawn on top via a compound path (evenodd = holes), events passing through.
  logos.forEach((lo, i) => {
    const cx=(lo.gx+0.5)*GRID, cy=VBH-(lo.gy+0.5)*GRID;
    const lg = el('g', { 'data-logo': i, style:'cursor:grab' }, svg);
    el('rect', { x:lo.gx*GRID, y:VBH-(lo.gy+1)*GRID, width:GRID, height:GRID, fill:'transparent' }, lg);
    const dpath = LOGO.contours.map(c => 'M'+c.map(p=>`${(cx+p[0]*LOGO_SIZE).toFixed(2)},${(cy-p[1]*LOGO_SIZE).toFixed(2)}`).join('L')+'Z').join(' ');
    el('path', { d:dpath, fill:'#8B00F3', 'fill-rule':'evenodd', 'fill-opacity':0.9, 'pointer-events':'none' }, lg);
  });
  renderLabelList();
  document.getElementById('addLabel').disabled = !(selId!==null && document.getElementById('labelText').value.trim());
  // status + generate enable
  const mods = placed.length, nh = holes.size, nl = latches.size;
  const uncovered = [...requiredCells()].some(c => !region.has(c));
  setStatus(!mods ? 'add a module from the left'
    : uncovered ? `${mods} module${mods>1?'s':''} · ⚠ a module is outside the box — extend it (click cells) or reset`
    : !nh ? `${mods} module${mods>1?'s':''} · ⚠ click a wall to add a USB-C power slot`
    : !nl ? `${mods} module${mods>1?'s':''} · ${nh} power · ⚠ switch to Latch and click walls to add latches`
    : `${mods} module${mods>1?'s':''} · ${nh} power · ${nl} latch${nl>1?'es':''} · box = ${region.size} cells`);
  document.getElementById('generate').disabled = !(mods && nh && nl && !uncovered);
  document.getElementById('rotate').disabled = selId===null;
  document.getElementById('remove').disabled = selId===null;
}

// screen point -> SVG mm coordinates (bottom-left origin)
function toMM(evt) {
  const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x:p.x, y: VBH - p.y };
}
const snap = (v) => Math.round(v / GRID) * GRID;

function addModule(key) {
  const m = MODULES[key], wc = m.w/GRID, hc = m.h/GRID, NX = VBW/GRID, NY = VBH/GRID;
  const blocked = occupiedBy(null);                 // every existing module + label
  let gx0 = 2, gy0 = Math.floor((NY - hc) * 0.55);  // default landing spot (upper-middle)
  if (!fits(gx0, gy0, wc, hc, blocked)) {           // occupied -> scan for the first free spot
    let found = false;
    for (let gy = NY-hc; gy >= 0 && !found; gy--) for (let gx = 0; gx <= NX-wc; gx++)
      if (fits(gx, gy, wc, hc, blocked)) { gx0=gx; gy0=gy; found=true; break; }
  }
  placed.push({ id: nextId, key, x: gx0*GRID, y: gy0*GRID, rot: 0 });
  selId = nextId; nextId++; update();
}

// A wall carries exactly one feature. Toggle the active wallMode's feature on this wall, clearing any
// other feature there. A female dovetail also reserves the tile behind it, so that tile must be empty.
function toggleWallFeature(k) {
  const byMode = { hole:holes, latch:latches, maleDT:dtMale, femaleDT:dtFemale, opening:openings };
  const active = byMode[wallMode]; if (!active) return;
  if (wallMode === 'femaleDT' && !active.has(k)) {
    const [gx,gy] = k.split(',').map(Number);
    if (moduleCells().has(ck(gx,gy)) || allLabelCells().has(ck(gx,gy))) {
      setStatus('⚠ a female dovetail fills its tile — free that cell first (move the module, or add an empty cell with Reshape box)'); return; }
  }
  for (const m in byMode) if (byMode[m] !== active) byMode[m].delete(k);   // one feature per wall
  active.has(k) ? active.delete(k) : active.add(k);
}

// ---- pointer: wall click -> hole; module click -> select+drag; empty click -> toggle box cell ----
let drag = null;
svg.addEventListener('pointerdown', (e) => {
  const wl = e.target.closest('[data-wall]');
  if (wl) { toggleWallFeature(wl.dataset.wall); render(); return; }
  const grp = e.target.closest('g[data-id]');
  if (grp) { const id = +grp.dataset.id; selId = id; const p = placed.find(q=>q.id===id);
    const mm = toMM(e); drag = { id, ox: mm.x-p.x, oy: mm.y-p.y }; svg.setPointerCapture(e.pointerId); render(); return; }
  const lg = e.target.closest('[data-logo]');       // the noknok logo drags like a module (any mode)
  if (lg) { const lo = logos[+lg.dataset.logo];
    if (lo) { selId = null; drag = { logo: lo, moved: false }; try { svg.setPointerCapture(e.pointerId); } catch(_){} render(); }
    return; }
  const mm = toMM(e); const gx = Math.floor(mm.x/GRID), gy = Math.floor(mm.y/GRID); selId = null;
  if (gx<0 || gy<0 || gx>=VBW/GRID || gy>=VBH/GRID) { render(); return; }
  if (cellMode === 'hook') {                                    // place / remove a mushroom cable retainer
    const h = hooks.find(q => q.gx===gx && q.gy===gy);
    if (h) hooks = hooks.filter(q => q !== h);                   // click again to remove (it's symmetric, no rotation)
    else if (region.has(ck(gx,gy)) && !moduleCells().has(ck(gx,gy)) && !allLabelCells().has(ck(gx,gy)))
      hooks.push({ gx, gy });                                    // only on an empty in-box tile
    render(); return;
  }
  if (cellMode === 'logo') {                                    // place / remove the noknok logo (top cover)
    const l = logos.find(q => q.gx===gx && q.gy===gy);
    if (l) { logos = logos.filter(q => q !== l); logoDismissed = true; }   // removing = opt out (don't auto-re-add)
    else if (region.has(ck(gx,gy)) && !moduleCells().has(ck(gx,gy)) && !allLabelCells().has(ck(gx,gy))) {
      logos.push({ gx, gy }); logoDismissed = false;            // only on an empty in-box tile (solid top plate)
    }
    render(); return;
  }
  if (requiredCells().has(ck(gx,gy))) { render(); return; }   // never carve a module or label cell
  autoBox = false; const k = ck(gx,gy); region.has(k) ? region.delete(k) : region.add(k); render();
});
svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.logo) {                                  // drag the logo to whatever empty in-box tile it's over
    const mm = toMM(e), gx = Math.floor(mm.x/GRID), gy = Math.floor(mm.y/GRID);
    if (gx<0||gy<0||gx>=VBW/GRID||gy>=VBH/GRID) return;
    if (!region.has(ck(gx,gy)) || moduleCells().has(ck(gx,gy)) || allLabelCells().has(ck(gx,gy))) return;
    if (logos.some(l => l!==drag.logo && l.gx===gx && l.gy===gy)) return;
    if (drag.logo.gx!==gx || drag.logo.gy!==gy) { drag.logo.gx = gx; drag.logo.gy = gy; drag.moved = true; logoDismissed = false; render(); }
    return;
  }
  const p = placed.find(q=>q.id===drag.id); const mm = toMM(e);
  const nx = snap(mm.x-drag.ox), ny = snap(mm.y-drag.oy), fp = footprint(p);
  // don't drop onto another module or another module's label (no overlaps)
  if (!fits(nx/GRID, ny/GRID, fp.w/GRID, fp.h/GRID, occupiedBy(p.id))) return;
  p.x = nx; p.y = ny; update();
});
svg.addEventListener('pointerup', (e) => {
  if (drag && drag.logo && !drag.moved && cellMode === 'logo') {   // a click (no drag) in logo mode removes it
    logos = logos.filter(l => l !== drag.logo); logoDismissed = true; render();
  }
  drag = null; try { svg.releasePointerCapture(e.pointerId); } catch(_){}
});

// ================= 3D box generation =================
const BOX = { frontT:1.2, backT:2.0, wallT:1.5, postR:2.0, pegR:1.15, pegLen:1.6, socketR:1.8 };   // backT 2.0: thicker, more rigid bottom cover
const SOCKET_H = 2.95;   // JST-SH socket body height above the PCB (support columns press here)
// Box-joining dovetail (vertical slide-in). A male RAIL on the outside of one box's wall slides DOWN into
// the female GROOVE on the other box. neck/tip = trapezoid widths (tip wider than neck => can't pull
// straight out), depth = radial protrusion, clr = print clearance on the groove, bossDepth = how far the
// female socket reaches into the box past the wall. All print-test-tunable.
const DT = { neck:3.5, tip:6.0, depth:3.5, clr:0.35, bossDepth:6.5 };

function grilleCut(cx, cy, z, hh) {
  const parts = [];
  for (let ix=0; ix<5; ix++) for (let iy=0; iy<5; iy++)
    parts.push(cylinder({ radius:0.85, height:hh, segments:16, center:[cx+(ix-2)*2.5, cy+(iy-2)*2.5, z] }));
  return union(...parts);
}
function topCut(p, H) {                                  // front-plate opening (rotates with the module)
  const m = MODULES[p.key], f = m.top, w = loc(p, f.x, f.y);
  const z = H - BOX.frontT/2, hh = BOX.frontT + 1.2;
  if (f.type === 'grille')     return grilleCut(w.x, w.y, z, hh);
  if (f.type === 'round_hole' || f.type === 'dome_mount') return cylinder({ radius:f.dia/2, height:hh, segments:48, center:[w.x, w.y, z] });
  const sw = (p.rot%180===0)? f.w : f.h, sh = (p.rot%180===0)? f.h : f.w;   // rect: swap if rotated
  return cuboid({ size:[sw, sh, hh], center:[w.x, w.y, z] });
}
function wallMid(gx,gy,s) {                              // world midpoint of a wall segment
  return s==='N' ? {x:(gx+0.5)*GRID, y:(gy+1)*GRID} : s==='S' ? {x:(gx+0.5)*GRID, y:gy*GRID}
       : s==='E' ? {x:(gx+1)*GRID, y:(gy+0.5)*GRID} : {x:gx*GRID, y:(gy+0.5)*GRID};
}
// Does an M2.5 hole (module-local) fall under the payload opening (+ a post-radius margin)? If so a
// front column there would jut into the opening and block the payload — hold that corner differently.
function holeInOpening(m, hx, hy, margin) {
  const f = m.top; if (!f) return false; const g = (margin ?? BOX.postR);
  if (f.type === 'grille' || f.type === 'round_hole' || f.type === 'dome_mount') { const r = f.dia/2 + g; return (hx-f.x)**2 + (hy-f.y)**2 < r*r; }
  return Math.abs(hx-f.x) < f.w/2 + g && Math.abs(hy-f.y) < f.h/2 + g;
}
// A recessed board whose mount holes sit under the opening can't use front posts (they'd block the
// payload). Instead retain it with a COLLAR: a thin well-wall around the opening, from the front plate
// down to the PCB front, whose bottom rim presses the PCB border (clamping it against the back posts).
function recessCollar(p, m, H, pcbFrontZ) {
  const f = m.top; if (!f) return null;
  const collarT = 1.2, z0 = pcbFrontZ, h = (H - BOX.frontT) - z0; if (h <= 0.3) return null;
  let outer, inner;
  if (f.type === 'grille' || f.type === 'round_hole') {
    outer = circle({ radius: f.dia/2 + collarT, segments:48 }); inner = circle({ radius: f.dia/2, segments:48 });
  } else { outer = rectangle({ size:[f.w+2*collarT, f.h+2*collarT] }); inner = rectangle({ size:[f.w, f.h] }); }
  let solid = translate([0,0,z0], extrudeLinear({ height:h }, translate([f.x, f.y], subtract(outer, inner))));
  const rad = p.rot*Math.PI/180;                        // place into world = same map as loc()
  const T = p.rot===90 ? [m.h,0] : p.rot===180 ? [m.w,m.h] : p.rot===270 ? [0,m.w] : [0,0];
  return translate([p.x+T[0], p.y+T[1], 0], rotate([0,0,rad], solid));
}

// ---- coarse "jar" thread (noknok Dome Mount) ----------------------------------------------------
// A solid, externally-threaded cylinder centred on the Z axis, base at z=0. `grow` inflates every
// radius (use grow = clearance to make the female-thread cutter for the matching lid). The thread is
// `starts` parallel helices of a trapezoidal tooth swept with extrudeHelical; the result is trimmed
// flush to [0, height].
function threadSolid(cfg, grow = 0, segs = 64) {
  const { majorD, depth, height, lead, starts } = cfg;
  const rMaj = majorD/2 + grow, rMin = rMaj - depth, cp = lead/starts;   // cp = crest-to-crest spacing
  const tB = cp*0.66, tC = cp*0.20;                                      // tooth base / crest heights
  const tooth = polygon({ points: [[rMin-0.3,-tB/2],[rMaj,-tC/2],[rMaj,tC/2],[rMin-0.3,tB/2]] });
  let s = cylinder({ radius: rMin, height, segments: segs, center:[0,0,height/2] });
  const angle = (height/lead)*TAU;
  for (let i=0; i<starts; i++)
    s = union(s, extrudeHelical({ angle, pitch: lead, startAngle: i*TAU/starts, segmentsPerRotation: segs }, tooth));
  return intersect(s, cylinder({ radius: rMaj+1, height, segments: segs, center:[0,0,height/2] }));   // trim flush
}
// The ring on the housing top cover = a FEMALE-threaded ring, base at z=0, projecting up (placed to
// point DOWN into the box). The female thread + bore are carved by subtracting a clearance-grown male
// thread from a plain ring cylinder. Bore is large enough that the board sits inside it.
function domeRing() {
  const wall = 0.9, ringOR = DOME.threadMajor/2 + DOME.clearance + wall;
  return subtract(cylinder({ radius: ringOR, height: DOME.height, segments:72, center:[0,0,DOME.height/2] }),
                  domeThread(DOME.clearance));
}
const domeGlobeOR = () => DOME.form/2 - 0.5;   // dome globe / skirt outer radius
const domeBoreR   = () => DOME.threadMajor/2 - DOME.depth - 1.8;   // clear light bore through the lid
const domeSkirtTop = () => DOME.height + (domeGlobeOR() - DOME.threadMajor/2);   // z where the 45° skirt meets the globe equator (run = rise => 45°)
// Reference lid (screws INTO the ring): a MALE-threaded tube (bored for light) + a flared SKIRT + a domed
// translucent cap. Base at z=0. The skirt is a 45° cone (not a flat flange) so its underside is a printable
// slope, not a horizontal ledge cantilevered off the thread — the whole lid prints thread-down, no support.
function referenceDome() {
  const wall = 1.8, gOR = domeGlobeOR(), boreR = domeBoreR(), rMaj = DOME.threadMajor/2, sTop = domeSkirtTop(), gz = sTop;
  const tube = subtract(domeThread(0), cylinder({ radius: boreR, height: DOME.height+2, segments:64, center:[0,0,DOME.height/2] }));
  // 45° conical skirt (bored), revolved from its (r,z) cross-section: bottom edge flush with the thread OD
  // (rMaj) so nothing overhangs, flaring out to the cap OD (gOR) at the skirt top = globe equator.
  const skirt = extrudeRotate({ segments:72 }, polygon({ points: [
    [boreR, DOME.height], [rMaj, DOME.height], [gOR, sTop], [boreR, sTop] ] }));
  const cap = intersect(
    subtract(sphere({ radius: gOR, segments:40, center:[0,0,gz] }), sphere({ radius: gOR-wall, segments:40, center:[0,0,gz] })),
    cylinder({ radius: gOR+1, height: gOR+1, segments:64, center:[0,0, gz+(gOR+1)/2] }));   // keep the cap from the equator UP (matches the skirt top => no ledge)
  return union(tube, skirt, cap);
}
// Honeycomb variant: the same lid with hex holes punched radially through the globe cap (thread/flange
// intact), so it works as a light-shade in opaque filament too. Holes are hex-packed on rings of latitude.
function referenceDomeHoney() {
  const wall = 1.8, gOR = domeGlobeOR(), gz = domeSkirtTop(), R = gOR - wall/2, holeR = 3.4, cutterPolys = [];
  let ring = 0;
  // ~1 mm walls (spacing 2.35·holeR) + rings down to near the equator so the perforation starts right
  // above the thread/skirt instead of a solid band. The hex cutters are disjoint, so we collect their
  // polygons into ONE geom3 and do a single subtract — a 100+-way union() here is ~20 s, this is ~9 s.
  const punch = (h) => { for (const p of geom3.toPolygons(h)) cutterPolys.push(p); };
  for (let deg = 16; deg <= 84; deg += 13) {
    const theta = deg*Math.PI/180, ringR = R*Math.sin(theta);
    const n = Math.max(6, Math.round(2*Math.PI*ringR / (holeR*2.35)));
    const phi0 = (ring % 2) * (Math.PI / n);                 // stagger alternate rings -> honeycomb packing
    for (let k=0; k<n; k++) {
      const phi = phi0 + k*2*Math.PI/n;
      const h = rotate([0,0,phi], rotate([0,theta,0], cylinder({ radius:holeR, height:wall*3, segments:6 })));
      const dir = [Math.sin(theta)*Math.cos(phi), Math.sin(theta)*Math.sin(phi), Math.cos(theta)];
      punch(translate([R*dir[0], R*dir[1], gz + R*dir[2]], h));
    }
    ring++;
  }
  punch(translate([0,0,gz+R], cylinder({ radius:holeR, height:wall*3, segments:6 })));   // hole at the apex
  return subtract(referenceDome(), geom3.create(cutterPolys));
}

// A shallow engraved-text solid for one label, positioned over its reserved strip on the top cover.
// Uses the built-in single-stroke vector font; each stroke is expanded to a groove of width strokeW.
function labelEngraving(l, H, flipX) {
  if (!l.text || !l.text.trim()) return null;
  const s = labelStripWorld(l); if (!s) return null;
  const wcx=(s.x0+s.x1)/2, wcy=(s.y0+s.y1)/2;
  const availLen = (s.horizontal ? s.x1-s.x0 : s.y1-s.y0) - 3;      // along the edge
  const availDep = (s.horizontal ? s.y1-s.y0 : s.x1-s.x0) - 2.5;    // across the strip
  const fh = Math.max(2, Math.min(l.size, availDep));
  let segs; try { segs = vectorText({ height:fh, xOffset:0, yOffset:0 }, l.text); } catch(_) { return null; }
  if (!segs || !segs.length) return null;
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for (const seg of segs) for (const pt of seg) { minx=Math.min(minx,pt[0]);maxx=Math.max(maxx,pt[0]);miny=Math.min(miny,pt[1]);maxy=Math.max(maxy,pt[1]); }
  const tw=maxx-minx, cx=(minx+maxx)/2, cy=(miny+maxy)/2, sc = (tw>availLen && tw>0) ? availLen/tw : 1;
  // groove width MUST scale with the text: a fixed width on shrunk-to-fit text bloats the strokes until
  // they overlap into a non-manifold blob ("geometry is not closed"). Keep it proportional to sc.
  const depth = 0.8, sw = 1.3*sc, strokes = [];                    // depth 0.8 + wide stroke = bolder, more readable
  if (sw < 0.15) return null;                                       // too small to engrave meaningfully
  for (const seg of segs) {
    let pts = seg.map(pt => { let lx=(pt[0]-cx)*sc, ly=(pt[1]-cy)*sc;
      if (!s.horizontal) { const t=lx; lx=-ly; ly=t; }              // rotate 90° for E/W edges
      // flipX mirrors the text in world X for the PRINT layout: the top cover prints face-down, so the
      // engraving is on the bed side and would otherwise read right-to-left once the part is flipped up.
      return [flipX ? wcx-lx : wcx+lx, wcy+ly]; });
    pts = pts.filter((p,i)=> i===0 || Math.hypot(p[0]-pts[i-1][0], p[1]-pts[i-1][1]) > 1e-3);   // drop coincident points
    if (pts.length < 2) { if (pts.length===1) pts = [pts[0], [pts[0][0]+0.02, pts[0][1]]]; else continue; }
    strokes.push(expand({ delta:sw/2, corners:'round', segments:8 }, path2.fromPoints({closed:false}, pts)));
  }
  // Extrude each stroke to its own prism and union in 3D. A 2D union of many overlapping rounded stroke
  // outlines is fragile (it can produce an un-closed outline -> "geometry is not closed"); 3D union of
  // simple prisms is robust. Guard each stroke so one bad glyph stroke can't take out the whole label.
  const solids = [];
  for (const st of strokes) { try { solids.push(extrudeLinear({ height: depth+0.5 }, st)); } catch(_) {} }
  if (!solids.length) return null;
  const text3d = solids.length>1 ? union(...solids) : solids[0];
  return translate([0,0, H-depth], text3d);
}

// The noknok logo debossed into the top cover on tile (gx,gy). Built from the flattened LOGO contours
// (union of the letter outlines, minus the two 'o' counters). Returns a solid to SUBTRACT from `front`.
// flipX mirrors it in world X for the PRINT build (top cover prints face-down), same as the labels.
function logoEngraving(gx, gy, H, flipX) {
  const cx=(gx+0.5)*GRID, cy=(gy+0.5)*GRID;
  const map = (p) => [ cx + (flipX ? -p[0] : p[0])*LOGO_SIZE, cy + p[1]*LOGO_SIZE ];   // normalized (±0.5) -> world
  // build a clean, counter-clockwise polygon from a contour: map -> world, drop coincident + closing dup,
  // then force CCW (the y-flip in the baked data and the print-mirror both flip winding, so normalise here).
  const poly = (c) => {
    let pts = c.map(map).filter((p,i,a) => i===0 || Math.hypot(p[0]-a[i-1][0], p[1]-a[i-1][1]) > 1e-3);
    if (pts.length>2 && Math.hypot(pts[0][0]-pts[pts.length-1][0], pts[0][1]-pts[pts.length-1][1]) < 1e-3) pts = pts.slice(0,-1);
    let ar=0; for (let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; ar += pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1]; }
    if (ar < 0) pts.reverse();
    return polygon({ points: pts });
  };
  const outers = [];
  LOGO.contours.forEach((c, i) => { if (LOGO.holes.includes(i)) return;
    try { outers.push(extrudeLinear({ height: LOGO_DEPTH+0.6 }, poly(c))); } catch(_) {} });
  if (!outers.length) return null;
  let ink = outers.length>1 ? union(...outers) : outers[0];
  for (const i of LOGO.holes) {                                    // carve the 'o' counters back out
    try { ink = subtract(ink, extrudeLinear({ height: LOGO_DEPTH+1.2 }, poly(LOGO.contours[i]))); } catch(_) {}
  }
  return translate([0,0, H-LOGO_DEPTH], ink);
}

// A cable retainer that rises from the bottom cover in an empty tile — a MUSHROOM (solid of revolution):
// a wide base (strong root + bed adhesion), a strong stem, and a thick cap whose lip catches a cable
// wrapped/tucked around the stem. Radially symmetric, so no orientation is needed. It prints WITHOUT
// support: every angle is gradual — the base narrows going up (self-supporting), the stem is vertical, and
// the only overhang is the cap's underside, a ~45° cone. It's an ASSEMBLY AID (hold cable slack while you
// close the box); the cable can be looser afterwards. Profile points are [radius, height] (mm above plate).
const MUSH = { baseR:4.0, stemR:1.9, capR:3.6, baseH:1.3, stemTop:5.0, capUnder:6.7, capRim:7.9, domeR:2.2, domeZ:8.6, apex:8.8 };
function cableHook(gx, gy, z0) {
  const cx=(gx+0.5)*GRID, cy=(gy+0.5)*GRID, m=MUSH;
  // right-half silhouette (r>=0), revolved 360°. Order: base bottom -> up the outside -> over the cap -> axis.
  const prof = polygon({ points: [
    [0,0], [m.baseR,0], [m.stemR,m.baseH], [m.stemR,m.stemTop],   // wide base narrowing to the stem, then straight stem
    [m.capR,m.capUnder], [m.capR,m.capRim],                        // cap: ~45° underside flare, then a thick vertical rim
    [m.domeR,m.domeZ], [0,m.apex] ] });                            // rounded top back to the axis
  const mush = extrudeRotate({ segments:40 }, prof);               // full revolution -> solid mushroom on the Z axis
  return translate([cx, cy, z0-0.4], mush);                        // sink the base 0.4 mm into the plate to fuse it
}

// --- box-joining features: geometry helpers (all fuse to the FRONT cover, which carries the walls) ---
// world frame of a wall segment: outward normal, tangent, wall midpoint, outer wall face point.
function wallFrame(gx, gy, side) {
  const on = { N:[0,1], S:[0,-1], E:[1,0], W:[-1,0] }[side], tan = [-on[1], on[0]];
  const wm = wallMid(gx, gy, side);
  const outFace = { x: wm.x + on[0]*(WALL_GAP+BOX.wallT), y: wm.y + on[1]*(WALL_GAP+BOX.wallT) };
  return { on, tan, wm, outFace, alongY:(side==='E'||side==='W') };
}
// dovetail trapezoid (geom2) at a wall face: narrow neck (nw) at the wall widening to tip (tw) over depth
// dp. Points OUTWARD from the wall for the male rail; INWARD (into the box) for the female groove cutter.
function dovetailPoly(f, nw, tw, dp, inward) {
  const s = inward ? -1 : 1, { on, tan, outFace } = f;
  const base = [ outFace.x - on[0]*0.6*s, outFace.y - on[1]*0.6*s ];   // 0.6 mm overlap into material for a clean weld/cut
  const tipC = [ outFace.x + on[0]*dp*s,  outFace.y + on[1]*dp*s ];
  const P = (c,w) => [ c[0]+tan[0]*w, c[1]+tan[1]*w ];
  let pts = [ P(base,-nw/2), P(tipC,-tw/2), P(tipC,tw/2), P(base,nw/2) ];
  // Keep the outline counter-clockwise. Mirroring for the inward (female) case flips the winding, which
  // makes the extruded cutter malformed so the subtract eats the WHOLE top cover (not just the groove).
  let a = 0; for (let i=0; i<pts.length; i++) { const j=(i+1)%pts.length; a += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1]; }
  if (a < 0) pts.reverse();
  return polygon({ points: pts });
}

// Build the box from the current layout. Returns { front, back, H }.
function buildBox(assembled) {
  const { frontT, backT, wallT, postR, pegR, pegLen, socketR } = BOX;
  const stacks = placed.map(p => { const m=MODULES[p.key]; return m.clearance_top + m.pcb + m.clearance_bottom; });
  // SEAT lifts even the TALLEST board off the floor, so its JST-socket support columns stay a
  // printable height (otherwise a socket whose body nearly fills clearance_bottom rests ~on the floor
  // and the column would be ~0). +5 keeps cable space for shorter boards.
  const SEAT = 1.2;
  const interior = Math.max(Math.max(...stacks) + SEAT, Math.min(...stacks) + 5);
  const H = frontT + backT + interior;

  const cells = [...region].map(c => c.split(',').map(Number));
  // cavity = the module cells inflated by WALL_GAP so a module isn't jammed against the outer wall.
  // The wall is added OUTSIDE the cavity; wall-relative features (cable slot, latch) shift out to meet it.
  const inner2d = union(...cells.map(([gx,gy]) => rectangle({ size:[GRID,GRID], center:[(gx+0.5)*GRID,(gy+0.5)*GRID] })));
  const cavity2d = offset({ delta: WALL_GAP, corners:'edge' }, inner2d);
  const foot2d = offset({ delta: wallT, corners:'edge' }, cavity2d);

  // FRONT cover = perimeter walls (backT..H) + front plate (H-frontT..H)
  let front = subtract(
    translate([0,0,backT], extrudeLinear({ height: H-backT }, foot2d)),
    translate([0,0,backT], extrudeLinear({ height: (H-frontT)-backT }, cavity2d)));
  for (const p of placed) front = subtract(front, topCut(p, H));            // payload openings
  for (const key of holes) {                                                // USB-C cable slots
    const [gx,gy,s] = key.split(','); const alongY = (s==='E'||s==='W');
    const on = { N:[0,1], S:[0,-1], E:[1,0], W:[-1,0] }[s];                  // outward normal
    const wm = wallMid(+gx,+gy,s), mid = { x: wm.x + on[0]*WALL_GAP, y: wm.y + on[1]*WALL_GAP };  // out to the wall
    // Open U-notch cut DOWN from the wall's free (parting-line) rim: the plug is fitted to the module
    // before assembly, so only the bare cable needs room. Lay the cable into the slot from the top,
    // then close the covers — no threading a whole plug through a hole.
    const slotW = 5;                                                        // cable width, not plug
    const slotTop = backT + Math.min(6, (H-frontT-backT) - 1);              // rounded closed top of the U
    const capZ = slotTop - slotW/2, openBottom = backT - 1.4;               // openBottom < backT => fully open at the rim
    const rh = capZ - openBottom;
    const rect = alongY ? cuboid({ size:[wallT+6, slotW, rh] }) : cuboid({ size:[slotW, wallT+6, rh] });
    front = subtract(front, translate([mid.x, mid.y, (openBottom+capZ)/2], rect));
    const cap = alongY ? rotate([0,Math.PI/2,0], cylinder({ radius:slotW/2, height:wallT+6, segments:24 }))
                       : rotate([Math.PI/2,0,0], cylinder({ radius:slotW/2, height:wallT+6, segments:24 }));
    front = subtract(front, translate([mid.x, mid.y, capZ], cap));          // round the closed top
  }
  // BACK cover = back plate (0..backT)
  let back = extrudeLinear({ height: backT }, foot2d);

  // per-module M2.5 columns — these ONLY clamp the PCB (front post presses the front, back post
  // presses the back, a peg locates the board through the hole). They do NOT join the covers, so
  // nothing internal is trapped. pcbFrontZ is set so the payload reaches the front plate.
  for (const p of placed) { const m = MODULES[p.key];
    const pcbFrontZ = (H-frontT) - m.clearance_top, pcbBackZ = pcbFrontZ - m.pcb;
    const frontLen = (H-frontT) - pcbFrontZ, backLen = Math.max(0.4, pcbBackZ - backT);
    for (const [hx,hy] of m.holes) { const w = loc(p,hx,hy);
      // short locating peg — only as long as the PCB is thick (pegLen), centred in the board so it
      // fills the M2.5 hole and locates the board without protruding into the opposite post. A short
      // peg pulls straight back out on disassembly instead of snapping off.
      const pegZ = pcbFrontZ - m.pcb/2;   // PCB mid-plane
      const blocked = holeInOpening(m, hx, hy);   // a front post here would jut into the payload opening
      if (frontLen > 0.3 && !blocked) {
        // front post presses the PCB front, back post presses the back. The locating peg goes on the BACK
        // post — the PCB rests on the back cover, so the pin should locate it there (the front post just
        // clamps down onto it). Previously the peg was on the front, leaving the back columns pin-less.
        front = union(front,
          cylinder({ radius:postR, height:frontLen, segments:24, center:[w.x,w.y, pcbFrontZ + frontLen/2] }));
        back = union(back,
          cylinder({ radius:postR, height:backLen, segments:24, center:[w.x,w.y, backT + backLen/2] }),
          cylinder({ radius:pegR, height:pegLen, segments:16, center:[w.x,w.y, pegZ] }));
      } else {
        // flush payload, OR the hole sits under the opening -> no front post; hold from the back only
        // (peg rides on the back post). Recessed boards are also clamped by the collar added below.
        back = union(back,
          cylinder({ radius:postR, height:backLen, segments:24, center:[w.x,w.y, backT + backLen/2] }),
          cylinder({ radius:pegR, height:pegLen, segments:16, center:[w.x,w.y, pegZ] }));
      }
    }
    // recessed board with mount holes under the opening: retain it with a collar (well-wall) around
    // the payload opening instead of posts that would block it. (Skip for dome_mount — the board is
    // smaller than the big opening, so a collar can't reach it; it rests on the back posts.)
    if (frontLen > 1.0 && m.top.type !== 'dome_mount' && m.holes.some(([hx,hy]) => holeInOpening(m, hx, hy))) {
      const collar = recessCollar(p, m, H, pcbFrontZ);
      if (collar) front = union(front, collar);
    }
    // extra support columns under the JST-SH sockets (the corners with no M2.5 hole). They rise from
    // the back cover to just under the socket body (2.95 mm above the PCB back), so the plastic socket
    // takes the load and the board is braced at all four corners.
    for (const [ , cx, cy, kind] of m.conn || []) {
      if (kind === 'usb') continue;                       // USB-C connector: no support column
      const w = loc(p, cx, cy), topZ = pcbBackZ - SOCKET_H, h = topZ - backT;
      if (h > 0.5) back = union(back, cylinder({ radius:socketR, height:h, segments:20, center:[w.x, w.y, backT + h/2] }));
    }
  }

  // user-placed cable hooks rise from the bottom cover in empty tiles
  for (const h of hooks) back = union(back, cableHook(h.gx, h.gy, backT));

  // cover-to-cover JOIN — flexing latches on the walls the USER picked: a spring arm on the back
  // cover clicks a detent into a window in the front-cover wall. Press the detent through the
  // window from OUTSIDE to release, so the box opens (nothing internal is trapped).
  { const IN = { E:[-1,0], W:[1,0], N:[0,-1], S:[0,1] };
    const zDet = backT + Math.min(4.0, (H-frontT-backT)*0.42);   // detent lower -> shorter, stiffer arm
    for (const key of latches) {
      if (H <= zDet + 2) continue;
      const [gx,gy,side] = key.split(','), [ix,iy] = IN[side], alongY = (side==='E'||side==='W');
      const wm = wallMid(+gx,+gy,side), mid = { x: wm.x - ix*WALL_GAP, y: wm.y - iy*WALL_GAP };   // out to the wall (−IN = outward)
      const armT=1.2, armW=6, flare=2.4, off = 0.35 + armT/2, ax = mid.x + ix*off, ay = mid.y + iy*off;
      const armH = Math.min((zDet-backT)+1.6, (H-backT)-1);       // tip just above the detent
      // TAPERED "pyramid" base: hull a thin tip block to a wider base block that flares toward the
      // interior (+ix/+iy). The wall-facing face stays vertical (detent geometry unchanged), while the
      // root gets a fillet-like buttress so it stops snapping off. Only the base flares; the upper
      // ~2/3 of the arm stays thin (armT) so it can still flex to snap over the detent.
      const capT = 1.0, capB = 1.4;
      const tip  = cuboid({ size: alongY?[armT,armW,capT]:[armW,armT,capT], center:[ax, ay, backT+armH-capT/2] });
      const base = cuboid({ size: alongY?[armT+flare,armW,capB]:[armW,armT+flare,capB],
        center:[ax + ix*flare/2, ay + iy*flare/2, backT+capB/2] });
      back = union(back, hull(tip, base));
      const det = alongY ? rotate([Math.PI/2,0,0], cylinder({radius:0.9,height:armW-1,segments:14}))
                         : rotate([0,Math.PI/2,0], cylinder({radius:0.9,height:armW-1,segments:14}));
      back = union(back, translate([ax - ix*(armT/2+0.5), ay - iy*(armT/2+0.5), zDet], det));   // detent toward the wall
      front = subtract(front, cuboid({ size: alongY?[wallT+2,armW+0.8,2.8]:[armW+0.8,wallT+2,2.8], center:[mid.x - ix*wallT/2, mid.y - iy*wallT/2, zDet] }));
    }
  }

  // ---- box-joining features (all on the FRONT cover, which carries the walls) ----
  // MALE dovetail rails: a trapezoid fused to the OUTSIDE of the chosen wall, full wall height. Prints as
  // a clean vertical rail (undercut is horizontal => no supports); slides down into another box's groove.
  for (const key of dtMale) { const [gx,gy,s] = key.split(','); const f = wallFrame(+gx,+gy,s);
    front = union(front, translate([0,0,backT], extrudeLinear({ height: H-backT }, dovetailPoly(f, DT.neck, DT.tip, DT.depth, false)))); }
  // FEMALE dovetail sockets: a solid boss grown inward from the wall (fills the reserved tile), with the
  // matching groove carved into it and cut up THROUGH the top plate, so the other box's rail drops in from
  // above. Slot bottoms out on the back plate; both boxes rest on the same surface -> aligned.
  for (const key of dtFemale) { const [gx,gy,s] = key.split(','); const f = wallFrame(+gx,+gy,s);
    const Ld = BOX.wallT + WALL_GAP + DT.bossDepth, bw = DT.tip + 2*DT.clr + 3.0;   // boss reach & tangential width (fits inside the 10 mm tile)
    const bcx = f.outFace.x - f.on[0]*Ld/2, bcy = f.outFace.y - f.on[1]*Ld/2;
    front = union(front, cuboid({ size: f.alongY?[Ld,bw,H-backT]:[bw,Ld,H-backT], center:[bcx, bcy, backT+(H-backT)/2] }));
    const groove = dovetailPoly(f, DT.neck+2*DT.clr, DT.tip+2*DT.clr, DT.depth+DT.clr, true);
    front = subtract(front, translate([0,0,backT], extrudeLinear({ height: (H-backT)+2 }, groove))); }   // +2 => also cuts the entry slot through the top plate
  // CABLE openings: remove most of a wall segment, open at the floor line (front plate left as a lintel),
  // so a cable passes between two joined boxes. Lay the cable in, then close the covers.
  for (const key of openings) { const [gx,gy,s] = key.split(','); const f = wallFrame(+gx,+gy,s);
    const wc = { x: f.wm.x + f.on[0]*(WALL_GAP+BOX.wallT/2), y: f.wm.y + f.on[1]*(WALL_GAP+BOX.wallT/2) };
    const owW = GRID - 2.0, thick = BOX.wallT + 4, owB = backT - 0.5, owT = H - frontT;
    front = subtract(front, cuboid({ size: f.alongY?[thick,owW,owT-owB]:[owW,thick,owT-owB], center:[wc.x, wc.y, (owB+owT)/2] })); }

  // dome-mount variant: add the female thread ring on the INSIDE of the top cover (projects down into
  // the box, around the light opening), so the outer face stays flat and prints without supports.
  for (const p of placed) { const f = MODULES[p.key].top;
    if (f && f.type === 'dome_mount') { const w = loc(p, f.x, f.y);
      front = union(front, translate([w.x, w.y, (H-frontT)-DOME.height], domeRing())); } }

  // engrave the module labels into the top cover (subtract shallow grooves). Guard each one so a single
  // troublesome label can never crash the whole box. Text is engraved NORMALLY (no pre-mirror) — the print
  // layout flips the cover with a rotation, which keeps the text correct once it's flipped back to assemble.
  for (const l of labels) { try { const eng = labelEngraving(l, H, false); if (eng) front = subtract(front, eng); }
    catch(e) { console.warn('label skipped:', l.text, e.message); } }
  // deboss the noknok logo(s) into the top cover
  for (const lo of logos) { try { const eng = logoEngraving(lo.gx, lo.gy, H, false); if (eng) front = subtract(front, eng); }
    catch(e) { console.warn('logo skipped:', e.message); } }

  if (assembled) return { front, back, H };
  // PRINT layout: flip the FRONT show-face-down with a ROTATION (180° about Y), NOT a mirror — a mirror
  // reflects the part, so the printed+assembled cover came out left-right mirrored from the design. The
  // back is already plate-down (print-ready), so it stays as-is. The front sits to the right for a book-
  // fold: fold it left over the spine onto the back and every column lines up, matching the 2D design.
  const bb = jscad.measurements.measureBoundingBox(foot2d);
  front = translate([2*bb[1][0] + 8, 0, H], rotate([0, Math.PI, 0], front));
  return { front, back, H };
}

function toSTL(...solids) {
  const raw = stlSerializer.serialize({ binary:true }, ...solids);
  const parts = raw.map(p => p instanceof ArrayBuffer ? new Uint8Array(p)
    : ArrayBuffer.isView(p) ? new Uint8Array(p.buffer,p.byteOffset,p.byteLength) : new Uint8Array(p));
  const total = parts.reduce((s,a)=>s+a.length,0), merged = new Uint8Array(total);
  let off=0; for (const a of parts) { merged.set(a,off); off+=a.length; } return merged.buffer;
}

// ================= 3D preview =================
const viewEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(viewEl.clientWidth, viewEl.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.cssText = 'display:none;position:absolute;inset:0;';
viewEl.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f1115);
const camera = new THREE.PerspectiveCamera(45, viewEl.clientWidth/viewEl.clientHeight, 0.1, 3000); camera.up.set(0,0,1);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(60,-90,140); scene.add(dl);
const stlLoader = new STLLoader();
const mat = new THREE.MeshStandardMaterial({ color:0x59d3a4, metalness:0.1, roughness:0.7 });
let mesh3d = null, currentSTL = null;          // currentSTL is ALWAYS the print layout (for download)
let printBuf = null, asmBuf = null, previewMode = 'assembled', boxH = 0;
let printFront = null, printBack = null;       // the two covers on their own (print-oriented), for separate export
(function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();

function show3D(on) {
  document.getElementById('grid').style.display = on ? 'none' : 'block';
  renderer.domElement.style.display = on ? 'block' : 'none';
  document.getElementById('backTo2d').style.display = on ? 'inline-block' : 'none';
  document.getElementById('viewToggle').style.display = on ? 'flex' : 'none';
  if (on) { renderer.setSize(viewEl.clientWidth, viewEl.clientHeight);
    camera.aspect = viewEl.clientWidth/viewEl.clientHeight; camera.updateProjectionMatrix(); }
}
function renderPreview() {
  const buf = previewMode === 'print' ? printBuf : asmBuf;
  if (!buf) return;
  if (mesh3d) { scene.remove(mesh3d); mesh3d.geometry.dispose(); }
  const geo = stlLoader.parse(buf); geo.computeVertexNormals();
  mesh3d = new THREE.Mesh(geo, mat); scene.add(mesh3d);
  geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3()), s = geo.boundingBox.getSize(new THREE.Vector3());
  const r = Math.max(s.x,s.y,s.z);
  camera.position.set(c.x + r, c.y - r*1.4, c.z + r*1.1); controls.target.copy(c); controls.update();
  document.querySelectorAll('#viewToggle button').forEach(b => { const on = b.dataset.mode === previewMode;
    b.style.background = on ? 'var(--accent)' : 'var(--panel)'; b.style.color = on ? '#04150f' : 'var(--muted)'; b.style.fontWeight = on ? '600' : '400'; });
}
function generate() {
  try {
    setStatus('generating box…');
    const pr = buildBox(false); printBuf = toSTL(pr.front, pr.back); currentSTL = printBuf;
    printFront = pr.front; printBack = pr.back;
    const asm = buildBox(true); asmBuf = toSTL(asm.front, asm.back); boxH = asm.H;
    show3D(true); renderPreview();
    document.getElementById('download').disabled = false;
    document.getElementById('dlTop').disabled = false;
    document.getElementById('dlBottom').disabled = false;
    const hasDome = placed.some(p => MODULES[p.key].top && MODULES[p.key].top.type==='dome_mount');
    for (const id of ['dlDome','dlDomeHoney']) {
      document.getElementById(id).style.display = hasDome ? 'block' : 'none';
      document.getElementById(id).disabled = !hasDome;
    }
    setStatus(`box ${boxH.toFixed(1)} mm tall · ${placed.length} modules · STL ready (${(currentSTL.byteLength/1024).toFixed(0)} KB)`);
  } catch(e) { console.error(e); setStatus('generate error: ' + e.message); }
}
window.addEventListener('resize', () => { if (renderer.domElement.style.display!=='none') {
  renderer.setSize(viewEl.clientWidth, viewEl.clientHeight); camera.aspect=viewEl.clientWidth/viewEl.clientHeight; camera.updateProjectionMatrix(); } });

// ---- controls ----
function buildPalette() {
  const pal = document.getElementById('palette');
  for (const key in MODULES) {
    const m = MODULES[key];
    const b = document.createElement('button');
    b.innerHTML = `${m.name}<span>${m.w}×${m.h}</span>`;
    b.addEventListener('click', () => addModule(key));
    pal.appendChild(b);
  }
}
document.getElementById('rotate').addEventListener('click', () => {
  const p = placed.find(q=>q.id===selId); if (!p) return;
  const old = p.rot; p.rot = (p.rot + 90) % 360; p.x = snap(p.x); p.y = snap(p.y);
  const fp = footprint(p);
  if (!fits(p.x/GRID, p.y/GRID, fp.w/GRID, fp.h/GRID, occupiedBy(p.id))) {   // rotation would overlap
    p.rot = old; setStatus('⚠ no room to rotate here — move the module first'); return;
  }
  update();
});
document.getElementById('remove').addEventListener('click', () => {
  labels = labels.filter(l=>l.modId!==selId);   // drop that module's labels too
  placed = placed.filter(q=>q.id!==selId); selId = null; update();
});

// ---- labels ----
function renderLabelList() {
  const list = document.getElementById('labelList'); if (!list) return;
  list.innerHTML = '';
  const nm = { N:'top', S:'bottom', E:'right', W:'left' };
  for (const l of labels) {
    const p = placed.find(q=>q.id===l.modId), mod = p ? MODULES[p.key].name : '?';
    const chip = document.createElement('div'); chip.className = 'labelChip';
    const span = document.createElement('span'); span.textContent = `“${l.text}” · ${mod} ${nm[l.side]}`;
    const x = document.createElement('button'); x.textContent = '✕'; x.title = 'remove label';
    x.addEventListener('click', () => { labels = labels.filter(q=>q.id!==l.id); update(); });
    chip.appendChild(span); chip.appendChild(x); list.appendChild(chip);
  }
}
function addOrUpdateLabel() {
  const p = placed.find(q=>q.id===selId); const text = document.getElementById('labelText').value.trim();
  if (!p || !text) return;
  const cand = { id:nextLabelId, modId:p.id, side:labelSide, text, size:labelSize };
  const cells = labelCells(cand);
  const occ = moduleCells();
  const otherLabels = new Set(); for (const l of labels) if (!(l.modId===p.id && l.side===labelSide)) for (const [gx,gy] of labelCells(l)) otherLabels.add(ck(gx,gy));
  const N = VBW/GRID, M = VBH/GRID;
  const bad = !cells.length || cells.some(([gx,gy]) => gx<0||gy<0||gx>=N||gy>=M || occ.has(ck(gx,gy)) || otherLabels.has(ck(gx,gy)));
  if (bad) { setStatus('⚠ no room for that label — free the tiles next to that edge, or pick another edge'); return; }
  labels = labels.filter(l => !(l.modId===p.id && l.side===labelSide));   // one label per module edge
  labels.push(cand); nextLabelId++;
  if (!autoBox) for (const [gx,gy] of cells) region.add(ck(gx,gy));        // keep the text covered
  document.getElementById('labelText').value = '';
  update();
}
document.getElementById('labelText').addEventListener('input', () => {
  document.getElementById('addLabel').disabled = !(selId!==null && document.getElementById('labelText').value.trim());
});
document.querySelectorAll('#labelSide button').forEach(b => b.addEventListener('click', () => {
  labelSide = b.dataset.side;
  document.querySelectorAll('#labelSide button').forEach(x => x.classList.toggle('on', x === b));
}));
document.getElementById('labelSize').addEventListener('input', (e) => {
  labelSize = +e.target.value; document.getElementById('labelSizeVal').textContent = labelSize.toFixed(1);
});
document.getElementById('addLabel').addEventListener('click', addOrUpdateLabel);
document.getElementById('resetBox').addEventListener('click', () => {
  autoBox = true; holes = new Set(); latches = new Set(); dtMale = new Set(); dtFemale = new Set(); openings = new Set(); update();
});
document.querySelectorAll('#wallMode button, #joinMode button').forEach(b => b.addEventListener('click', () => {
  wallMode = b.dataset.mode;
  document.querySelectorAll('#wallMode button, #joinMode button').forEach(x => x.classList.toggle('on', x === b));
}));
document.querySelectorAll('#cellMode button').forEach(b => b.addEventListener('click', () => {
  cellMode = b.dataset.mode;
  document.querySelectorAll('#cellMode button').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('cellModeNote').innerHTML = cellMode === 'hook'
    ? '<b>Cable hook:</b> click an empty in-box tile to add a mushroom; click it again to remove it. It prints on the bottom cover as a support-free mushroom (wide base, strong stem, thick cap) — an assembly aid: wrap or tuck cable slack under the cap while you close the box.'
    : cellMode === 'logo'
    ? '<b>noknok logo:</b> the noknok mark is debossed on the top cover, added by default in a spare tile. <b>Drag it</b> to move it anywhere (like a module) — that works in any mode. In this mode, click an empty tile to add one, or click the logo to remove it. Show you’re part of the noknok ecosystem 💜'
    : '<b>Reshape box:</b> click empty cells to hug, notch, or bridge modules into one box.';
}));
// show the overlay with a message, yield a frame so it paints, then run the (blocking) work, then hide it.
function busyThen(msg, fn) {
  const busy = document.getElementById('busy');
  document.getElementById('busyMsg').textContent = msg;
  busy.style.display = 'flex';
  setTimeout(() => { try { fn(); } finally { busy.style.display = 'none'; } }, 40);
}
document.getElementById('generate').addEventListener('click', () => busyThen('Generating 3D box… please wait', generate));
document.getElementById('backTo2d').addEventListener('click', () => { show3D(false); render(); });
document.querySelectorAll('#viewToggle button').forEach(b => b.addEventListener('click', () => { previewMode = b.dataset.mode; renderPreview(); }));
function downloadBlob(buf, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type:'model/stl' }));
  a.download = name; a.click();
}
document.getElementById('download').addEventListener('click', () => {
  if (currentSTL) downloadBlob(currentSTL, `noknok_housing_${placed.length}mod.stl`);
});
document.getElementById('dlTop').addEventListener('click', () => {
  if (printFront) downloadBlob(toSTL(printFront), `noknok_top_cover_${placed.length}mod.stl`);
});
document.getElementById('dlBottom').addEventListener('click', () => {
  if (printBack) downloadBlob(toSTL(printBack), `noknok_bottom_cover_${placed.length}mod.stl`);
});
document.getElementById('dlDome').addEventListener('click', () => busyThen('Building dome lid…',
  () => downloadBlob(toSTL(referenceDome()), `noknok_dome_mount_${DOME.threadMajor}_lid.stl`)));   // matching screw-in lid (print translucent)
document.getElementById('dlDomeHoney').addEventListener('click', () => busyThen('Building honeycomb dome… (a few seconds)',
  () => downloadBlob(toSTL(referenceDomeHoney()), `noknok_dome_mount_${DOME.threadMajor}_lid_honeycomb.stl`)));   // hex-perforated (any filament)

// ---- save / load the 2D design (JSON) ----
// Serialise everything that defines the layout (Sets -> arrays). UI-only state (selection, active modes,
// label-editor fields) is intentionally left out.
function serializeDesign() {
  return {
    type: 'noknok-housing-configurator', version: 1,
    placed, autoBox, labels, hooks, logos, logoDismissed,
    region: [...region],
    holes: [...holes], latches: [...latches],
    dtMale: [...dtMale], dtFemale: [...dtFemale], openings: [...openings],
  };
}
function saveDesign() {
  const json = JSON.stringify(serializeDesign(), null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
  a.download = `noknok_housing_${placed.length}mod.json`; a.click();
  setStatus(`saved design · ${placed.length} module${placed.length!==1?'s':''} (.json)`);
}
// Restore a design. Tolerant: rejects non-noknok files, and skips any module key this build doesn't know
// (so a newer file can't crash an older tool) rather than throwing.
function loadDesign(data) {
  if (!data || data.type !== 'noknok-housing-configurator' || !Array.isArray(data.placed)) {
    setStatus('⚠ not a noknok design file'); return;
  }
  const unknown = [...new Set(data.placed.filter(p => !MODULES[p.key]).map(p => p.key))];
  placed  = data.placed.filter(p => MODULES[p.key]).map(p => ({ id:+p.id, key:p.key, x:+p.x, y:+p.y, rot:+p.rot||0 }));
  const keptIds = new Set(placed.map(p => p.id));
  labels  = (data.labels || []).filter(l => keptIds.has(l.modId)).map(l => ({ id:+l.id, modId:+l.modId, side:l.side, text:String(l.text), size:+l.size }));
  hooks   = (data.hooks || []).map(h => ({ gx:+h.gx, gy:+h.gy }));
  logos   = (data.logos || []).map(l => ({ gx:+l.gx, gy:+l.gy }));
  logoDismissed = !!data.logoDismissed;
  region  = new Set(data.region || []);
  holes   = new Set(data.holes || []);   latches  = new Set(data.latches || []);
  dtMale  = new Set(data.dtMale || []);  dtFemale = new Set(data.dtFemale || []);  openings = new Set(data.openings || []);
  autoBox = data.autoBox !== false;
  selId   = null;
  nextId      = placed.reduce((m,p) => Math.max(m, p.id), 0) + 1;
  nextLabelId = labels.reduce((m,l) => Math.max(m, l.id), 0) + 1;
  update();
  setStatus(unknown.length
    ? `⚠ loaded, but skipped unknown module(s): ${unknown.join(', ')}`
    : `loaded design · ${placed.length} module${placed.length!==1?'s':''}`);
}
document.getElementById('saveDesign').addEventListener('click', saveDesign);
document.getElementById('loadDesign').addEventListener('click', () => document.getElementById('designFile').click());
document.getElementById('designFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { loadDesign(JSON.parse(r.result)); } catch(err) { setStatus('⚠ could not read that file: ' + err.message); } };
  r.readAsText(f);
  e.target.value = '';   // let the same file be chosen again
});

buildPalette();
update();
setStatus('add a module from the left');
