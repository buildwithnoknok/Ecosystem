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
const { cuboid, cylinder, rectangle, circle } = primitives;
const { union, subtract } = booleans;
const { hull } = hulls;
const { translate, rotate, mirror } = transforms;
const { extrudeLinear } = extrusions;
const { offset } = expansions;

// ---- Module library (mm). footprint w×h, payload height, plenum, M2.5 holes, JST/USB sockets,
// top opening. Mirrors each module repo's mechanical/housing.json. Origin = module bottom-left. ----
const MODULES = {
  buzzer:    { name:'buzzer',     w:20, h:20, clearance_top:3.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['W',3.1,15.5],['E',16.9,4.5]], top:{type:'grille', x:10, y:10, dia:8.5} },
  knob:      { name:'knob',       w:20, h:20, clearance_top:9.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['W',3.1,15.5],['E',16.9,4.5]], top:{type:'round_hole', x:10, y:10.25, dia:7.4} },
  ledbutton: { name:'LED button', w:20, h:20, clearance_top:5.0, pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['W',3.1,15.5],['E',16.9,4.5]], top:{type:'button', x:10, y:10, w:16.4, h:16.2} },  // 5 mm PCB-to-top-cover (keyboard switch); button behind the front window
  usbled:    { name:'USB LEDs',   w:40, h:40, clearance_top:1.6,  pcb:1.6, clearance_bottom:9.0,
    holes:[[4,4],[36,4],[4,36],[36,36]], conn:[['W',3,20,'usb'],['E',36.5,20]], top:{type:'window', x:20, y:20, w:38, h:38} },  // square opening so the corner LEDs aren't clipped
  display:   { name:'display',    w:40, h:30, clearance_top:2.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[2.25,27.75],[37.75,2.25],[37.75,27.75]], conn:[['W',3.1,15],['S',20,3.1]], top:{type:'window', x:19.8, y:15, w:32.35, h:16.18} },
};
const USBC_W = 9, USBC_H = 4.5;   // USB-C power slot: width along the wall × height (click a wall)
const GRID = 10;         // mm per cell
const WALL_GAP = 2;      // clearance between a module and the outer wall (so it's easy to drop in)

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
function recomputeBox() {          // auto box = bounding rectangle of the module cells
  const mc = [...moduleCells()].map(c => c.split(',').map(Number));
  region = new Set(); if (!mc.length) return;
  const xs = mc.map(c=>c[0]), ys = mc.map(c=>c[1]);
  const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  for (let gx=x0; gx<=x1; gx++) for (let gy=y0; gy<=y1; gy++) region.add(ck(gx,gy));
}
const update = () => { if (autoBox) recomputeBox(); render(); };
const NB = { N:[0,1], S:[0,-1], E:[1,0], W:[-1,0] };
function boundaryWalls() {          // edges where an in-region cell meets an out-region cell
  const w = [];
  for (const c of region) { const [gx,gy] = c.split(',').map(Number);
    for (const s in NB) { const [dx,dy]=NB[s]; if (!region.has(ck(gx+dx,gy+dy))) w.push([gx,gy,s]); } }
  return w;
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

function render() {
  svg.innerHTML = '';
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
    // connector: an ARROW at the socket. Its tail marks the socket; it points the way the plug is
    // inserted from. The plug slides in ALONG the edge the socket sits on, so the insertion axis is
    // perpendicular to the side letter (a socket on the W/E edge inserts from top/bottom). It points
    // toward the nearer edge and is length-clamped to stay inside the module square.
    for (const [side, cx, cy, kind] of m.conn || []) {
      const w = loc(p,cx,cy), sx = w.x, sy = VBH - w.y;
      let ldx, ldy, dist;                                                  // module-local dir + room to the edge
      if (side === 'W' || side === 'E') { const up = cy > m.h/2; ldx = 0; ldy = up ? 1 : -1; dist = up ? m.h-cy : cy; }
      else                              { const rt = cx > m.w/2; ldx = rt ? 1 : -1; ldy = 0; dist = rt ? m.w-cx : cx; }
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
  // box walls (clickable): USB-C power slots (blue) + assembly latches (orange)
  const wg = el('g', {}, svg);
  for (const [gx,gy,s] of boundaryWalls()) {
    const [x1,y1,x2,y2] = wallXY(gx,gy,s), key = `${gx},${gy},${s}`, hole = holes.has(key), latch = latches.has(key);
    el('line', { x1,y1,x2,y2, stroke:'transparent', 'stroke-width':3.5, 'data-wall':key, style:'cursor:pointer' }, wg);
    el('line', { x1,y1,x2,y2, stroke: hole?'#2b7fd0': latch?'#e8912f':'var(--accent)', 'stroke-width': (hole||latch)?1.9:0.9, 'pointer-events':'none' }, wg);
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    if (hole)  el('rect', { x:mx-USBC_W/2, y:my-2, width:USBC_W, height:4, rx:1.2, fill:'#2b7fd0', 'fill-opacity':0.3, stroke:'#2b7fd0', 'stroke-width':0.5, 'pointer-events':'none' }, wg);
    if (latch) el('rect', { x:mx-2, y:my-2, width:4, height:4, rx:0.8, fill:'#e8912f', 'fill-opacity':0.35, stroke:'#e8912f', 'stroke-width':0.5, 'pointer-events':'none' }, wg);
  }
  // status + generate enable
  const mods = placed.length, nh = holes.size, nl = latches.size;
  const uncovered = [...moduleCells()].some(c => !region.has(c));
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
  const m = MODULES[key];
  const x = 20 + (placed.length * 10) % 120, y = VBH - 60 - (Math.floor(placed.length/12)*30);
  placed.push({ id: nextId, key, x: snap(x), y: snap(y - m.h), rot: 0 });
  selId = nextId; nextId++; update();
}

// ---- pointer: wall click -> hole; module click -> select+drag; empty click -> toggle box cell ----
let drag = null;
svg.addEventListener('pointerdown', (e) => {
  const wl = e.target.closest('[data-wall]');
  if (wl) { const k = wl.dataset.wall;
    const set = wallMode === 'latch' ? latches : holes, other = wallMode === 'latch' ? holes : latches;
    other.delete(k);                              // a wall holds a hole OR a latch, not both
    set.has(k) ? set.delete(k) : set.add(k);
    render(); return; }
  const grp = e.target.closest('g[data-id]');
  if (grp) { const id = +grp.dataset.id; selId = id; const p = placed.find(q=>q.id===id);
    const mm = toMM(e); drag = { id, ox: mm.x-p.x, oy: mm.y-p.y }; svg.setPointerCapture(e.pointerId); render(); return; }
  const mm = toMM(e); const gx = Math.floor(mm.x/GRID), gy = Math.floor(mm.y/GRID); selId = null;
  if (gx<0 || gy<0 || gx>=VBW/GRID || gy>=VBH/GRID) { render(); return; }
  if (moduleCells().has(ck(gx,gy))) { render(); return; }   // never carve a module's own cell
  autoBox = false; const k = ck(gx,gy); region.has(k) ? region.delete(k) : region.add(k); render();
});
svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = placed.find(q=>q.id===drag.id); const mm = toMM(e);
  p.x = snap(mm.x-drag.ox); p.y = snap(mm.y-drag.oy); update();
});
svg.addEventListener('pointerup', (e) => { drag = null; try { svg.releasePointerCapture(e.pointerId); } catch(_){} });

// ================= 3D box generation =================
const BOX = { frontT:1.2, backT:1.2, wallT:1.5, postR:2.0, pegR:1.15, pegLen:1.6, socketR:1.8 };
const SOCKET_H = 2.95;   // JST-SH socket body height above the PCB (support columns press here)

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
  if (f.type === 'round_hole') return cylinder({ radius:f.dia/2, height:hh, segments:48, center:[w.x, w.y, z] });
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
  if (f.type === 'grille' || f.type === 'round_hole') { const r = f.dia/2 + g; return (hx-f.x)**2 + (hy-f.y)**2 < r*r; }
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
        // front post presses the PCB front, back post presses the back, the peg locates it.
        front = union(front,
          cylinder({ radius:postR, height:frontLen, segments:24, center:[w.x,w.y, pcbFrontZ + frontLen/2] }),
          cylinder({ radius:pegR, height:pegLen, segments:16, center:[w.x,w.y, pegZ] }));
        back = union(back, cylinder({ radius:postR, height:backLen, segments:24, center:[w.x,w.y, backT + backLen/2] }));
      } else {
        // flush payload, OR the hole sits under the opening -> no front post; hold from the back only
        // (peg rides on the back post). Recessed boards are also clamped by the collar added below.
        back = union(back,
          cylinder({ radius:postR, height:backLen, segments:24, center:[w.x,w.y, backT + backLen/2] }),
          cylinder({ radius:pegR, height:pegLen, segments:16, center:[w.x,w.y, pegZ] }));
      }
    }
    // recessed board with mount holes under the opening: retain it with a collar (well-wall) around
    // the payload opening instead of posts that would block it.
    if (frontLen > 1.0 && m.holes.some(([hx,hy]) => holeInOpening(m, hx, hy))) {
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

  if (assembled) return { front, back, H };
  // PRINT layout: front plate down; back laid out as a MIRROR IMAGE across the fold line to its
  // right, so folding it over onto the front realigns every column (fixes the flip mismatch).
  const bb = jscad.measurements.measureBoundingBox(foot2d);
  front = translate([0,0,H], mirror({ normal:[0,0,1] }, front));
  back  = mirror({ normal:[1,0,0], origin:[bb[1][0] + 8, 0, 0] }, back);
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
    const asm = buildBox(true); asmBuf = toSTL(asm.front, asm.back); boxH = asm.H;
    show3D(true); renderPreview();
    document.getElementById('download').disabled = false;
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
  p.rot = (p.rot + 90) % 360; p.x = snap(p.x); p.y = snap(p.y); update();
});
document.getElementById('remove').addEventListener('click', () => {
  placed = placed.filter(q=>q.id!==selId); selId = null; update();
});
document.getElementById('resetBox').addEventListener('click', () => { autoBox = true; holes = new Set(); latches = new Set(); update(); });
document.querySelectorAll('#wallMode button').forEach(b => b.addEventListener('click', () => {
  wallMode = b.dataset.mode;
  document.querySelectorAll('#wallMode button').forEach(x => x.classList.toggle('on', x === b));
}));
document.getElementById('generate').addEventListener('click', generate);
document.getElementById('backTo2d').addEventListener('click', () => { show3D(false); render(); });
document.querySelectorAll('#viewToggle button').forEach(b => b.addEventListener('click', () => { previewMode = b.dataset.mode; renderPreview(); }));
document.getElementById('download').addEventListener('click', () => {
  if (!currentSTL) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([currentSTL], { type:'model/stl' }));
  a.download = `noknok_housing_${placed.length}mod.stl`; a.click();
});

buildPalette();
update();
setStatus('add a module from the left');
