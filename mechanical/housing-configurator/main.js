// noknok Housing Configurator — V5 app entry.  SPDX-License-Identifier: MIT
// STEP 1: 2D bird's-eye placement of modules on a 10 mm grid (place / drag / rotate / remove).
// STEP 2 (next): generate the monolithic box (front + back covers, per-module M2.5 columns).
// Bundled with esbuild -> app.js.  Build: npm run build.

// ---- Module library (mm). footprint w×h, payload height, plenum, M2.5 holes, top opening. ----
// These mirror each module repo's mechanical/housing.json (used for the box in step 2; step 1
// only needs footprint + name). Origin = module's own bottom-left corner, X→right, Y→up.
const MODULES = {
  buzzer:    { name:'buzzer',     w:20, h:20, clearance_top:3.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[17.75,17.75]], conn:[['W',3.1,15.5],['E',16.9,4.5]], top:{type:'grille', x:10, y:10, dia:8.5} },
  knob:      { name:'knob',       w:20, h:20, clearance_top:9.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2,18],[18,2]], conn:[['W',3.1,15.5],['E',16.9,4.5]], top:{type:'round_hole', x:10, y:10.25, dia:7.4} },
  ledbutton: { name:'LED button', w:20, h:20, clearance_top:11.6, pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,17.75],[17.75,2.25]], conn:[['W',3.1,15.5],['E',16.9,4.5]], top:{type:'button', x:10, y:10, w:16.4, h:16.2} },
  usbled:    { name:'USB LEDs',   w:40, h:40, clearance_top:1.6,  pcb:1.6, clearance_bottom:9.0,
    holes:[[4,4],[36,4],[4,36],[36,36]], conn:[['W',3,20,'usb'],['E',36.5,20]], top:{type:'round_hole', x:20, y:20, dia:36} },
  display:   { name:'display',    w:40, h:30, clearance_top:2.0,  pcb:1.6, clearance_bottom:3.0,
    holes:[[2.25,2.25],[2.25,27.75],[37.75,2.25],[37.75,27.75]], conn:[['W',3.1,15],['S',20,3.1]], top:{type:'window', x:19.8, y:15, w:32.35, h:16.18} },
  // VIRTUAL module (not a PCB): a 1x1 tile marking a USB-C power-cable hole in ONE box wall.
  // The hole faces the tile's marked edge (rotate to choose the side). MANDATORY (>=1); multiple OK.
  power:     { name:'Power hole', w:10, h:10, virtual:true, hole:14 },
};
// Box height (step 2) = max(tallest module's clearance_top+pcb+clearance_bottom,
//                           thinnest module's same sum + 5)  — the +5 guarantees cable space.

const GRID = 10;                       // mm per cell
const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };

// ---- state ----
let placed = [];       // { id, key, x, y, rot }  x,y = bottom-left in mm (grid-snapped); rot 0/90/180/270
let nextId = 1;
let selId = null;
let shape = 'outline';

// footprint of a placed module accounting for rotation (90/270 swaps w/h)
function footprint(p) {
  const m = MODULES[p.key];
  return (p.rot % 180 === 0) ? { w:m.w, h:m.h } : { w:m.h, h:m.w };
}
// a module-local point (mx,my) -> world (bottom-left origin), applying rotation + placement
function loc(p, mx, my) {
  const m = MODULES[p.key]; let rx, ry;
  switch (p.rot) {
    case 90:  rx = m.h - my; ry = mx;        break;
    case 180: rx = m.w - mx; ry = m.h - my;  break;
    case 270: rx = my;       ry = m.w - mx;  break;
    default:  rx = mx;       ry = my;
  }
  return { x: p.x + rx, y: p.y + ry };
}
// which world edge the power hole faces, from rotation: 0=E, 90=N, 180=W, 270=S
const HOLE_SIDE = { 0:'E', 90:'N', 180:'W', 270:'S' };

// ---- SVG grid ----
const svg = document.getElementById('grid');
const VBW = 360, VBH = 240;            // design area in mm (36×24 cells)
svg.setAttribute('viewBox', `0 0 ${VBW} ${VBH}`);
svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function render() {
  svg.innerHTML = '';
  // grid lines
  const g = el('g', { stroke:'var(--grid)', 'stroke-width':0.25 }, svg);
  for (let x = 0; x <= VBW; x += GRID) el('line', { x1:x, y1:0, x2:x, y2:VBH }, g);
  for (let y = 0; y <= VBH; y += GRID) el('line', { x1:0, y1:y, x2:VBW, y2:y }, g);
  // placed modules (SVG Y is top-down, so flip: screenY = VBH - (y + h))
  for (const p of placed) {
    const fp = footprint(p), m = MODULES[p.key];
    const sx = p.x, sy = VBH - (p.y + fp.h);
    const grp = el('g', { 'data-id':p.id, style:'cursor:grab' }, svg);
    const sel = p.id === selId;
    if (m.virtual) {
      // solid 1x1 power tile (easy to grab) + a bold bar on the wall side the hole faces
      el('rect', { x:sx, y:sy, width:fp.w, height:fp.h, rx:1,
        fill:'var(--accent)', 'fill-opacity':0.9, stroke: sel?'#fff':'var(--accent)', 'stroke-width': sel?1:0.4 }, grp);
      const side = HOLE_SIDE[p.rot] || 'E';
      const bar = { E:[sx+fp.w-1,sy+1,1,fp.h-2], W:[sx,sy+1,1,fp.h-2], N:[sx+1,sy,fp.w-2,1], S:[sx+1,sy+fp.h-1,fp.w-2,1] }[side];
      el('rect', { x:bar[0], y:bar[1], width:bar[2], height:bar[3], fill:'#04150f' }, grp);
      el('text', { x:sx+fp.w/2, y:sy+fp.h/2, 'font-size':2.6, fill:'#04150f',
        'text-anchor':'middle', 'dominant-baseline':'central', 'pointer-events':'none' }, grp).textContent = 'USB-C';
    } else {
      el('rect', { x:sx, y:sy, width:fp.w, height:fp.h, rx:1.5, fill:'var(--mod)',
        stroke: sel ? 'var(--sel)' : 'var(--modEdge)', 'stroke-width': sel ? 1.4 : 0.6 }, grp);
      el('text', { x:sx+fp.w/2, y:sy+fp.h/2, 'font-size':4.2, fill:'#1a1205',
        'text-anchor':'middle', 'dominant-baseline':'central', 'pointer-events':'none' }, grp).textContent = m.name;
      // M2.5 holes (small rings) + JST/USB sockets (small dark/blue tabs) — rotate with the module
      for (const [hx,hy] of m.holes) { const w = loc(p,hx,hy);
        el('circle', { cx:w.x, cy:VBH-w.y, r:1.25, fill:'none', stroke:'#5c3d08', 'stroke-width':0.45, 'pointer-events':'none' }, grp); }
      for (const [ , cx, cy, kind] of m.conn || []) { const w = loc(p,cx,cy);
        el('rect', { x:w.x-2, y:VBH-w.y-1.3, width:4, height:2.6, rx:0.4,
          fill: kind==='usb' ? '#2b7fd0' : '#241a05', 'pointer-events':'none' }, grp); }
    }
  }
  const mods = placed.filter(p => !MODULES[p.key].virtual).length;
  const pwr = placed.filter(p => MODULES[p.key].virtual).length;
  setStatus(!placed.length ? 'add a module from the left'
    : mods && !pwr ? `${mods} module${mods>1?'s':''} · ⚠ add a Power hole (required)`
    : `${mods} module${mods>1?'s':''} · ${pwr} power hole${pwr>1?'s':''}`);
  document.getElementById('generate').disabled = !(mods && pwr);
  document.getElementById('rotate').disabled = selId === null;
  document.getElementById('remove').disabled = selId === null;
}

// screen point -> SVG mm coordinates
function toMM(evt) {
  const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x:p.x, y: VBH - p.y };       // flip back to bottom-left origin
}
const snap = (v) => Math.round(v / GRID) * GRID;

// place a new module at the first free-ish spot (staggered), then the user drags it
function addModule(key) {
  const m = MODULES[key];
  let x = 20 + (placed.length * 10) % 120, y = VBH - 40 - (Math.floor(placed.length/12)*30);
  placed.push({ id: nextId, key, x: snap(x), y: snap(y - m.h), rot: 0 });
  selId = nextId; nextId++;
  render();
}

// ---- drag ----
let drag = null;
svg.addEventListener('pointerdown', (e) => {
  const grp = e.target.closest('g[data-id]');
  if (!grp) { selId = null; render(); return; }
  const id = +grp.dataset.id;
  selId = id;
  const p = placed.find(q => q.id === id);
  const mm = toMM(e);
  drag = { id, ox: mm.x - p.x, oy: mm.y - p.y };
  svg.setPointerCapture(e.pointerId);
  render();
});
svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = placed.find(q => q.id === drag.id);
  const mm = toMM(e);
  p.x = snap(mm.x - drag.ox);
  p.y = snap(mm.y - drag.oy);
  render();
});
svg.addEventListener('pointerup', (e) => { drag = null; try { svg.releasePointerCapture(e.pointerId); } catch(_){} });

// ---- controls ----
function buildPalette() {
  const pal = document.getElementById('palette');
  for (const key in MODULES) {
    const m = MODULES[key];
    if (m.virtual) { const hr = document.createElement('hr'); pal.appendChild(hr); }
    const b = document.createElement('button');
    b.innerHTML = `${m.name}<span>${m.virtual ? 'required' : m.w+'×'+m.h}</span>`;
    if (m.virtual) b.style.borderColor = 'var(--accent)';
    b.addEventListener('click', () => addModule(key));
    pal.appendChild(b);
  }
}
document.getElementById('rotate').addEventListener('click', () => {
  const p = placed.find(q => q.id === selId); if (!p) return;
  p.rot = (p.rot + 90) % 360; p.x = snap(p.x); p.y = snap(p.y); render();
});
document.getElementById('remove').addEventListener('click', () => {
  placed = placed.filter(q => q.id !== selId); selId = null; render();
});
document.querySelectorAll('#shapeSeg button').forEach(b => b.addEventListener('click', () => {
  shape = b.dataset.shape;
  document.querySelectorAll('#shapeSeg button').forEach(x => x.classList.toggle('on', x === b));
}));
document.getElementById('generate').addEventListener('click', () => {
  setStatus(`${placed.length} modules · outer shape: ${shape} · 3D box generation is the next step`);
});

buildPalette();
render();
setStatus('add a module from the left');
