// noknok Housing Configurator — app entry (bundled with esbuild; no CDN at runtime).
// Build: npm run build  ->  app.js. SPDX-License-Identifier: MIT
//
// V2 — tolerance-ROBUST two-cover sandwich (V1 = git tag housing-configurator-v1):
//   * Module cabled + assembled OUTSIDE, inserted from below into the TOP COVER (payload
//     up, against N/S stop-ledges); ROUNDED retention bumps hold it before the bottom cover.
//   * BOTTOM COVER = flush full-footprint base; N/S centre ribs clamp the PCB; two FLEXING
//     cantilever arms (W + E, in the socket-free zones) click a round detent into a window
//     in the top-cover wall. The arm flexes to absorb printer/material variation.
//   * A "fit" control offsets clearances so users match their printer + material.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import jscad from '@jscad/modeling';
import stlSerializer from '@jscad/stl-serializer';

const { primitives, booleans, transforms } = jscad;
const { cuboid, cylinder } = primitives;
const { subtract, union } = booleans;
const { translate, mirror, rotate } = transforms;

const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };

// ---- Module housing profiles (mirror each module repo's mechanical/housing.json) ----
// These three share the 20x20 footprint + identical W/E JST-SH connectors, so the SAME
// two-cover template applies — only the top opening and the payload height differ.
// (The display is not here yet: 40x30 + connectors on W/S needs the notch/latch rework.)
const PROFILES = {
  buzzer: {
    module:'noknok-buzzer', name:'buzzer', footprint:{ w:20, h:20 }, pcb_thickness:1.6, clearance_top:3.0, clearBot:5.0,
    connectors:[ { edge:'W', x:3.1, y:15.5 }, { edge:'E', x:16.9, y:4.5 } ],
    top_feature:{ type:'grille', x:10, y:10, dia:8.5 }
  },
  knob: {
    module:'noknok-knob', name:'knob', footprint:{ w:20, h:20 }, pcb_thickness:1.6, clearance_top:9.0, clearBot:5.0,
    connectors:[ { edge:'W', x:3.1, y:15.5 }, { edge:'E', x:16.9, y:4.5 } ],
    // stack above PCB: 4.5 base + O7 bushing cylinder + O6 shaft. Plate at 9 mm wraps the
    // bushing; hole O7.4 = O7 cylinder + 0.4 clearance so it isn't a press-fit.
    top_feature:{ type:'round_hole', x:10, y:10.25, dia:7.4 }
  },
  ledbutton: {
    module:'noknok-ledbutton', name:'LED button', footprint:{ w:20, h:20 }, pcb_thickness:1.6, clearance_top:0.0, clearBot:5.0,
    connectors:[ { edge:'W', x:3.1, y:15.5 }, { edge:'E', x:16.9, y:4.5 } ],
    // cover sits at PCB level (no wall height); the WHOLE switch pokes through. Opening clears
    // the switch body 15.9x15.7 (+~0.5), not the 14x14 plate-notch which is higher up.
    top_feature:{ type:'button', x:10, y:10, w:16.4, h:16.2 }
  },
  usbled: {
    module:'noknok-usb-led', name:'USB LEDs', footprint:{ w:40, h:40 }, pcb_thickness:1.6, clearance_top:1.6, clearBot:9.0,
    // clearBot 9 = the tallest MCU-side part (2-pin header 8.5) + clearance. USB-C on W (wider
    // opening), JST-SH on E. J4 (vertical JST) + J2 (header) are interior on the MCU side and
    // just live in the plenum. Payload = 8x WS2812b (1.6 mm) in a ring near the edges.
    connectors:[ { edge:'W', x:3.0, y:20.0, w:10.0 }, { edge:'E', x:36.5, y:20.0 } ],
    top_feature:{ type:'round_hole', x:20, y:20, dia:36 }   // fully-open LED face (add your own diffuser/shade)
  }
};
let PROFILE = PROFILES.buzzer;

// ---- Fixed design parameters ----
const P = {
  wallT: 1.2, topT: 1.2, botFloorT: 1.2,
  lidGap: 0.4, tol: 0.3,
  ledgeDepth: 1.5, ledgeH: 1.5,      // top-cover PCB stop ledge (N/S)
  ribDepth: 1.5, ribXInset: 6.0,     // bottom-cover push-rib (N/S), inset to clear the sockets
  connW: 8.0,
  grilleCols: 5, grilleSpacing: 2.5, grilleHoleR: 0.85,
  // V2 flexing cantilever cover latches (arm + round detent into a top-cover window).
  // W/E: BIG flexing arms in the socket-free zones, placed SYMMETRICALLY (latchYw = outerD -
  // latchYe) with the bottom-cover arms printed at the SWAPPED positions, so EITHER way you flip
  // the bottom cover the arms land in the windows and clear the cable holes. latchInset = distance
  // from the far edge.
  armT: 1.0, hookW: 7.0, hookClear: 0.35, hookR: 0.7, latchZc: 3.6, latchInset: 7.0,
  // N/S: the latch detent is built onto the EXISTING PCB-hold ribs (at each bay centre, which is
  // flip-symmetric on its own -> no swap trick). Snug in X -> also cuts the E/W shift.
  hookWns: 6.0, hookRns: 0.55,
  fitClear: 0.3
};

// sound grille: a 5x5 matrix of holes centered on the buzzer
function grille(cx, cy, cz) {
  const h = P.topT + 0.4, r = P.grilleHoleR, s = P.grilleSpacing, n = P.grilleCols, off = (n-1)/2;
  const cutters = [];
  for (let ix = 0; ix < n; ix++) for (let iy = 0; iy < n; iy++)
    cutters.push(cylinder({ radius:r, height:h, segments:20, center:[cx + (ix-off)*s, cy + (iy-off)*s, cz] }));
  return union(...cutters);
}

// top-cover opening for one bay, per the module's top_feature. Cuts fully through the top plate.
function topFeatureCut(profile, gx, gy, cz) {
  const f = profile.top_feature, h = P.topT + 0.4;
  if (f.type === 'grille')     return grille(gx, gy, cz);
  if (f.type === 'round_hole') return cylinder({ radius:f.dia/2, height:h, segments:48, center:[gx, gy, cz] });
  // rect openings: 'button' (keycap) or 'window' (display)
  return cuboid({ size:[f.w, f.h, h], center:[gx, gy, cz] });
}

// Build the two covers. Returns { top, bot, outerW, outerD }.  fit = clearance offset (mm).
function buildHousing(profile, count, clearTop, clearBot, fit, assembled) {
  const tol = P.tol + fit, fitClear = P.fitClear + fit, hookClear = P.hookClear + fit;
  const fw = profile.footprint.w, fd = profile.footprint.h;
  const bayW = fw + 2*tol, bayD = fd + 2*tol;
  const outerW = count*bayW + (count+1)*P.wallT;
  const outerD = bayD + 2*P.wallT;
  const seamZ    = P.botFloorT;
  const pcbBotZ  = seamZ + clearBot;
  const pcbTopZ  = pcbBotZ + profile.pcb_thickness;
  const plateBotZ = pcbTopZ + clearTop + P.lidGap;
  const plateTopZ = plateBotZ + P.topT;
  const bayX = (i) => P.wallT + i*(bayW + P.wallT);
  // Arm tip must stay BELOW the PCB, or a fitted module blocks the arm from flexing inward
  // (empty it snaps in; with a board the tip fouls the PCB edge and the detent jams -> gap).
  const latchZc = seamZ + P.latchZc, armTopZ = Math.min(latchZc + P.hookR + 0.8, pcbBotZ - 0.4);
  const latchYw = outerD - P.latchInset, latchYe = P.latchInset;  // W window NORTH, E window SOUTH
  const armYw = assembled ? latchYw : latchYe;   // arms PRINTED swapped -> EITHER flip lands them right
  const armYe = assembled ? latchYe : latchYw;

  // ===================== TOP COVER (shell from the seam up; open bottom) =====================
  let top = cuboid({ size:[outerW, outerD, plateTopZ - seamZ], center:[outerW/2, outerD/2, (seamZ+plateTopZ)/2] });
  for (let i = 0; i < count; i++) {
    const cx = bayX(i) + bayW/2;
    top = subtract(top, cuboid({ size:[bayW, bayD, plateBotZ - seamZ + 0.1],
      center:[cx, P.wallT + bayD/2, (seamZ+plateBotZ)/2 + 0.05] }));
  }
  top = subtract(top, cuboid({ size:[outerW - 2*P.wallT, outerD - 2*P.wallT, pcbBotZ - seamZ + 0.05],
    center:[outerW/2, outerD/2, (seamZ+pcbBotZ)/2] }));
  // PCB-stop ledges (N/S per bay). No retention nibs — the closed walls hold the board.
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2, yS = P.wallT, yN = P.wallT + bayD;
    top = union(top,
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yS + P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] }),
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yN - P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] })
    );
  }
  // top-cover openings (grille / round hole / button / window), one per bay
  for (let i = 0; i < count; i++) {
    const gx = bayX(i) + tol + profile.top_feature.x, gy = P.wallT + tol + profile.top_feature.y;
    top = subtract(top, topFeatureCut(profile, gx, gy, plateBotZ + P.topT/2));
  }
  // cable notches (outer W/E walls, open at the seam, mirrored connector Y). A connector may
  // set its own opening width `w` (e.g. USB-C is wider than a JST-SH); default = P.connW.
  { const c = profile.connectors.find(c => c.edge==='W'); const wy = P.wallT + tol + (fd - c.y);
    top = subtract(top, cuboid({ size:[P.wallT+0.4, c.w || P.connW, pcbBotZ - seamZ + 0.1], center:[P.wallT/2, wy, (seamZ+pcbBotZ)/2] })); }
  { const c = profile.connectors.find(c => c.edge==='E'); const wy = P.wallT + tol + (fd - c.y);
    top = subtract(top, cuboid({ size:[P.wallT+0.4, c.w || P.connW, pcbBotZ - seamZ + 0.1], center:[outerW - P.wallT/2, wy, (seamZ+pcbBotZ)/2] })); }
  // latch windows in the W/E walls (the detent seats + can be pressed for release)
  const winW = P.hookW + 0.5, winH = 2*P.hookR + 1.2;
  const winWns = P.hookWns + 0.2, winHns = 2*P.hookRns + 1.0;   // N/S windows snug in X -> cut the E/W shift
  top = subtract(top,
    cuboid({ size:[P.wallT+0.4, winW, winH], center:[P.wallT/2, latchYw, latchZc] }),          // W wall
    cuboid({ size:[P.wallT+0.4, winW, winH], center:[outerW - P.wallT/2, latchYe, latchZc] })  // E wall
  );
  // N/S latch windows: one per bay, centred on the bay's PCB-hold rib (the rib carries the
  // detent). Bay centre is flip-symmetric, so no swap trick is needed here.
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    top = subtract(top,
      cuboid({ size:[winWns, P.wallT+0.4, winHns], center:[cxC, outerD - P.wallT/2, latchZc] }), // N wall
      cuboid({ size:[winWns, P.wallT+0.4, winHns], center:[cxC, P.wallT/2, latchZc] })           // S wall
    );
  }

  // ===================== BOTTOM COVER (flush base + ribs + flexing latch arms) ================
  let bot = cuboid({ size:[outerW, outerD, seamZ], center:[outerW/2, outerD/2, seamZ/2] });
  // N/S centre push-ribs (clear the sockets), rise to the PCB bottom
  const ribLen = bayW - 2*P.ribXInset, ribH = pcbBotZ - seamZ;
  const yS = P.wallT + tol, yN = outerD - P.wallT - tol;
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    bot = union(bot,
      cuboid({ size:[ribLen, P.ribDepth, ribH], center:[cxC, yS + P.ribDepth/2, seamZ + ribH/2] }),
      cuboid({ size:[ribLen, P.ribDepth, ribH], center:[cxC, yN - P.ribDepth/2, seamZ + ribH/2] }),
      // the PCB-hold ribs ALSO carry the N/S latch: a round detent on the rib's outer face
      // clicks into the N/S wall window, tying the covers on N/S and constraining the E/W shift.
      translate([cxC, yS, latchZc], rotate([0, Math.PI/2, 0], cylinder({ radius:P.hookRns, height:P.hookWns, segments:20 }))),
      translate([cxC, yN, latchZc], rotate([0, Math.PI/2, 0], cylinder({ radius:P.hookRns, height:P.hookWns, segments:20 })))
    );
  }
  // two flexing cantilever latch arms (W north, E south), round detent into the wall windows
  const armH = armTopZ - seamZ;
  const armXW = P.wallT + hookClear, armXE = outerW - P.wallT - hookClear;
  bot = union(bot,
    cuboid({ size:[P.armT, P.hookW, armH], center:[armXW + P.armT/2, armYw, seamZ + armH/2] }),
    translate([armXW, armYw, latchZc], rotate([Math.PI/2,0,0], cylinder({ radius:P.hookR, height:P.hookW, segments:20 }))),
    cuboid({ size:[P.armT, P.hookW, armH], center:[armXE - P.armT/2, armYe, seamZ + armH/2] }),
    translate([armXE, armYe, latchZc], rotate([Math.PI/2,0,0], cylinder({ radius:P.hookR, height:P.hookW, segments:20 })))
  );

  // ===================== layout =====================
  if (assembled) {
    // ASSEMBLED preview: top grille-up at origin, bottom mated in place (overlap = shows the fit)
    return { top, bot, outerW, outerD };
  }
  // print layout: both flat, side by side (this is what the STL exports)
  top = mirror({ normal:[0,0,1], origin:[0,0,0] }, top);
  top = translate([0, 0, plateTopZ], top);
  bot = translate([0, outerD + 14, 0], bot);
  return { top, bot, outerW, outerD };
}

// Build a LAYOUT = a sequence of module tiles (Phase B). Each module is its OWN complete
// housing tile at its own height (from its profile), spread across the bed for printing.
// Returns { solids:[...], w, d } — solids are all tiles' covers, ready for toSTL().
function buildLayout(seq, fit, assembled) {
  const solids = [];
  let xOff = 0, maxD = 0;
  for (const key of seq) {
    const prof = PROFILES[key]; if (!prof) continue;
    const r = buildHousing(prof, 1, prof.clearance_top, prof.clearBot, fit, assembled);
    solids.push(translate([xOff, 0, 0], r.top), translate([xOff, 0, 0], r.bot));
    xOff += r.outerW + 8;                 // tile + gap along the bed X
    maxD = Math.max(maxD, r.outerD * (assembled ? 1 : 2) + 14);
  }
  return { solids, w: Math.max(0, xOff - 8), d: maxD };
}

// serialize one or more JSCAD solids to a single binary-STL ArrayBuffer
function toSTL(...solids) {
  const raw = stlSerializer.serialize({ binary:true }, ...solids);
  const parts = raw.map(p =>
    p instanceof ArrayBuffer ? new Uint8Array(p)
    : ArrayBuffer.isView(p)  ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
    : new Uint8Array(p));
  const total = parts.reduce((s,a) => s + a.length, 0);
  const merged = new Uint8Array(total);
  let off = 0; for (const a of parts) { merged.set(a, off); off += a.length; }
  return merged.buffer;
}

// ---------- three.js scene ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(view.clientWidth, view.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1115);
const camera = new THREE.PerspectiveCamera(45, view.clientWidth/view.clientHeight, 0.1, 2000);
camera.position.set(80, -120, 95);
camera.up.set(0,0,1);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(50,-80,120); scene.add(dl);
const grid = new THREE.GridHelper(260, 26, 0x2a2f3a, 0x20242c);
grid.rotation.x = Math.PI/2; scene.add(grid);

const stlLoader = new STLLoader();
const material = new THREE.MeshStandardMaterial({ color:0x59d3a4, metalness:0.1, roughness:0.7 });
let currentMesh = null, currentSTL = null;
let LAYOUT = ['buzzer'];   // Phase B: a sequence of module tiles (each its own housing)

function renderLayoutList() {
  const el = document.getElementById('layoutList');
  if (!LAYOUT.length) { el.innerHTML = '<span class="muted">empty — add a module</span>'; return; }
  el.innerHTML = LAYOUT.map((k,i) =>
    `<span class="chip">${PROFILES[k].name}<button data-i="${i}" class="x">×</button></span>`).join(' → ');
  el.querySelectorAll('button.x').forEach(b => b.addEventListener('click', () => {
    LAYOUT.splice(+b.dataset.i, 1); renderLayoutList(); regenerate();
  }));
}

function regenerate() {
  const fit = +document.getElementById('fit').value;
  const assembled = document.getElementById('assembled').checked;
  if (!LAYOUT.length) { setStatus('layout empty — add a module'); document.getElementById('download').disabled = true; return; }
  setStatus('generating geometry…');
  try {
    const pr = buildLayout(LAYOUT, fit, false);            // STL download = flat print layout
    currentSTL = toSTL(...pr.solids);
    const show = assembled ? buildLayout(LAYOUT, fit, true) : pr;
    const showBuf = assembled ? toSTL(...show.solids) : currentSTL;

    if (currentMesh) { scene.remove(currentMesh); currentMesh.geometry.dispose(); }
    const geo = stlLoader.parse(showBuf);
    geo.computeVertexNormals();
    currentMesh = new THREE.Mesh(geo, material);
    scene.add(currentMesh);
    controls.target.set(pr.w/2, assembled ? 10 : pr.d/2, assembled ? 6 : 4);
    controls.update();

    document.getElementById('download').disabled = false;
    const names = LAYOUT.length <= 3 ? LAYOUT.map(k=>PROFILES[k].name).join(' + ') : `${LAYOUT.length} tiles`;
    setStatus(`${names} · fit ${fit>=0?'+':''}${fit}${assembled?' · ASSEMBLED preview (STL still prints flat)':''} · STL ready (${(currentSTL.byteLength/1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error(e);
    setStatus('error: ' + e.message);
  }
}

document.getElementById('addTile').addEventListener('click', () => {
  LAYOUT.push(document.getElementById('module').value);
  renderLayoutList(); regenerate();
});
document.getElementById('clearLayout').addEventListener('click', () => {
  LAYOUT = []; renderLayoutList(); regenerate();
});
document.getElementById('fit').addEventListener('change', regenerate);
document.getElementById('assembled').addEventListener('change', regenerate);
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([currentSTL], { type:'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const nm = LAYOUT.length === 1 ? PROFILES[LAYOUT[0]].module.replace(/-/g,'_') : `layout_${LAYOUT.length}tiles`;
  a.download = `noknok_${nm}.stl`;
  a.click();
});

window.addEventListener('resize', () => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth/view.clientHeight; camera.updateProjectionMatrix();
});
(function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();

setStatus('libraries loaded');
renderLayoutList();
regenerate();
