// noknok Housing Configurator — app entry (bundled with esbuild; no CDN at runtime).
// Build: npm run build  ->  app.js  (committed, served statically / GitHub Pages).
// SPDX-License-Identifier: MIT
//
// TWO-COVER SANDWICH design:
//   * Module is assembled + cabled OUTSIDE the housing, then inserted from below into the
//     TOP COVER (buzzer up, toward the grille); the PCB butts against N/S stop-ledges.
//   * The BOTTOM COVER snaps on and its N/S ribs press the PCB up -> module clamped between
//     the two covers (no PCB snap-lips). Pop the bottom cover to remove the module.
//   * Cables exit W/E through notches OPEN at the seam, so the cable lays in (no threading).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import jscad from '@jscad/modeling';
import stlSerializer from '@jscad/stl-serializer';

const { primitives, booleans, transforms } = jscad;
const { cuboid, cylinder } = primitives;
const { subtract, union } = booleans;
const { translate, mirror } = transforms;

const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };

// ---- Buzzer housing profile (mirrors module-I2C-buzzer/mechanical/housing.json) ----
const PROFILE = {
  module: 'noknok-buzzer',
  footprint: { w: 20, h: 20 },
  pcb_thickness: 1.6,
  connectors: [
    { edge:'W', x:3.1,  y:15.5 },  // W socket near North
    { edge:'E', x:16.9, y:4.5  }   // E socket near South
  ],
  top_feature: { type:'grille', x:10, y:10, dia:8.5 }
};

// ---- Fixed design parameters ----
const P = {
  wallT: 1.2, topT: 1.2, botFloorT: 1.2,
  lidGap: 0.4,       // buzzer-to-grille air gap
  tol: 0.25,         // PCB-to-wall clearance
  ledgeDepth: 1.5, ledgeH: 1.5,   // top-cover PCB stop ledge (N/S)
  ribDepth: 1.5,                  // bottom-cover push-rib depth (N/S)
  connW: 8.0,        // widened cable notch
  grilleHoleR: 0.8, grilleRing: 2.6, grilleN: 4,   // clean, well-spaced grille (no island)
  // bottom-cover -> top-cover snap (beads on the ribs / inner N-S walls):
  snapClear: 0.5, snapProj: 0.4, snapH: 1.0, snapCatchZ: 3.0
};

// clean sound grille: centre hole + a few well-spaced holes (>=0.9 mm walls, no thin island)
function grille(cx, cy, cz) {
  const h = P.topT + 0.4, r = P.grilleHoleR;
  let cutters = [ cylinder({ radius:r, height:h, segments:20, center:[cx, cy, cz] }) ];
  for (let k = 0; k < P.grilleN; k++) {
    const a = k / P.grilleN * 2 * Math.PI;
    cutters.push(cylinder({ radius:r, height:h, segments:20,
      center:[cx + Math.cos(a)*P.grilleRing, cy + Math.sin(a)*P.grilleRing, cz] }));
  }
  return union(...cutters);
}

// Build the two covers for N buzzers. Returns { top, bot, outerW, outerD }.
function buildHousing(profile, count, clearTop, clearBot) {
  const fw = profile.footprint.w, fd = profile.footprint.h;
  const bayW = fw + 2 * P.tol, bayD = fd + 2 * P.tol;
  const outerW = count * bayW + (count + 1) * P.wallT;
  const outerD = bayD + 2 * P.wallT;
  const seamZ    = P.botFloorT;                 // bottom-cover plate top / start of covers overlap
  const pcbBotZ  = seamZ + clearBot;            // PCB underside (ribs push to here)
  const pcbTopZ  = pcbBotZ + profile.pcb_thickness;
  const plateBotZ = pcbTopZ + clearTop + P.lidGap;
  const plateTopZ = plateBotZ + P.topT;
  const bayX = (i) => P.wallT + i * (bayW + P.wallT);
  const snapZ = P.snapCatchZ;

  // ---------------- TOP COVER (assembled orientation: grille up, open bottom) ----------------
  let top = cuboid({ size:[outerW, outerD, plateTopZ], center:[outerW/2, outerD/2, plateTopZ/2] });
  // hollow each bay from the bottom up to the grille plate -> outer walls + dividers + plate
  for (let i = 0; i < count; i++) {
    const cx = bayX(i) + bayW/2;
    top = subtract(top, cuboid({ size:[bayW, bayD, plateBotZ + 0.1],
      center:[cx, P.wallT + bayD/2, plateBotZ/2 + 0.05] }));
  }
  // clear the lower interior (below the seam) so ONE bottom cover can span all bays
  top = subtract(top, cuboid({ size:[outerW - 2*P.wallT, outerD - 2*P.wallT, seamZ + 0.05],
    center:[outerW/2, outerD/2, seamZ/2] }));
  // PCB-stop ledges on N/S of each bay (the pushed-up PCB butts against these)
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2, yS = P.wallT, yN = P.wallT + bayD;
    top = union(top,
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yS + P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] }),
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yN - P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] })
    );
  }
  // sound grilles in the plate
  for (let i = 0; i < count; i++) {
    const gx = bayX(i) + P.tol + profile.top_feature.x;
    const gy = P.wallT + P.tol + profile.top_feature.y;
    top = subtract(top, grille(gx, gy, plateBotZ + P.topT/2));
  }
  // wide cable notches on W/E, OPEN at the bottom (lay the cable in)
  { const c = profile.connectors.find(c => c.edge==='W'); const wy = P.wallT + P.tol + c.y;
    top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ + 0.1], center:[P.wallT/2, wy, pcbBotZ/2] })); }
  { const c = profile.connectors.find(c => c.edge==='E'); const wy = P.wallT + P.tol + c.y;
    top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ + 0.1], center:[outerW - P.wallT/2, wy, pcbBotZ/2] })); }
  for (let i = 1; i < count; i++) { const dx = bayX(i) - P.wallT/2;
    for (const c of profile.connectors) { const wy = P.wallT + P.tol + c.y;
      top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ + 0.1], center:[dx, wy, pcbBotZ/2] })); } }
  // inner N/S snap CATCHES (inward) that hold the bottom cover's rib beads
  top = union(top,
    cuboid({ size:[outerW - 2*P.wallT, P.snapProj, P.snapH], center:[outerW/2, P.wallT + P.snapProj/2, snapZ] }),
    cuboid({ size:[outerW - 2*P.wallT, P.snapProj, P.snapH], center:[outerW/2, outerD - P.wallT - P.snapProj/2, snapZ] })
  );

  // ---------------- BOTTOM COVER (plate + N/S push-ribs; plugs up into the top cover) --------
  const inW = outerW - 2*(P.wallT + P.snapClear), inD = outerD - 2*(P.wallT + P.snapClear);
  let bot = cuboid({ size:[inW, inD, P.botFloorT], center:[outerW/2, outerD/2, P.botFloorT/2] });
  const ribH = pcbBotZ - P.botFloorT;
  const yS0 = outerD/2 - inD/2, yN0 = outerD/2 + inD/2;    // plate S / N edges
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    bot = union(bot,
      cuboid({ size:[bayW, P.ribDepth, ribH], center:[cxC, yS0 + P.ribDepth/2, P.botFloorT + ribH/2] }),
      cuboid({ size:[bayW, P.ribDepth, ribH], center:[cxC, yN0 - P.ribDepth/2, P.botFloorT + ribH/2] })
    );
  }
  // outward snap beads on the rib outer faces, seating just ABOVE the top-cover catches
  const beadZ = snapZ + P.snapH;
  bot = union(bot,
    cuboid({ size:[inW, P.snapProj, P.snapH], center:[outerW/2, yS0 - P.snapProj/2, beadZ] }),
    cuboid({ size:[inW, P.snapProj, P.snapH], center:[outerW/2, yN0 + P.snapProj/2, beadZ] })
  );

  // ---------------- print layout: both parts flat on the bed, side by side ----------------
  top = mirror({ normal:[0,0,1], origin:[0,0,0] }, top);   // flip grille-down (support-free print)
  top = translate([0, 0, plateTopZ], top);                 // grille on the bed, opening up
  bot = translate([0, outerD + 14, 0], bot);               // beside, plate on the bed

  return { top, bot, outerW, outerD };
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

function regenerate() {
  const count = +document.getElementById('count').value;
  const clearTop = +document.getElementById('clearTop').value;
  const clearBot = +document.getElementById('clearBot').value;
  setStatus('generating geometry…');
  try {
    const { top, bot, outerW, outerD } = buildHousing(PROFILE, count, clearTop, clearBot);
    const raw = stlSerializer.serialize({ binary:true }, top, bot);
    const parts = raw.map(p =>
      p instanceof ArrayBuffer ? new Uint8Array(p)
      : ArrayBuffer.isView(p)  ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
      : new Uint8Array(p));
    const total = parts.reduce((s,a) => s + a.length, 0);
    const merged = new Uint8Array(total);
    let off = 0; for (const a of parts) { merged.set(a, off); off += a.length; }
    currentSTL = merged.buffer;

    if (currentMesh) { scene.remove(currentMesh); currentMesh.geometry.dispose(); }
    const geo = stlLoader.parse(currentSTL);
    geo.computeVertexNormals();
    currentMesh = new THREE.Mesh(geo, material);
    scene.add(currentMesh);
    controls.target.set(outerW/2, outerD, 4);
    controls.update();

    document.getElementById('download').disabled = false;
    setStatus(`${count} buzzer bay${count>1?'s':''} · top + bottom cover · STL ready (${(currentSTL.byteLength/1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error(e);
    setStatus('error: ' + e.message);
  }
}

document.getElementById('count').addEventListener('input', (e) => {
  document.getElementById('countVal').textContent = e.target.value; regenerate();
});
document.getElementById('clearTop').addEventListener('change', regenerate);
document.getElementById('clearBot').addEventListener('change', regenerate);
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([currentSTL], { type:'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `noknok_buzzer_housing_${document.getElementById('count').value}x.stl`;
  a.click();
});

window.addEventListener('resize', () => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth/view.clientHeight; camera.updateProjectionMatrix();
});
(function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();

setStatus('libraries loaded');
regenerate();
