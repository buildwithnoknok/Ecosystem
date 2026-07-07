// noknok Housing Configurator — app entry (bundled with esbuild; no CDN at runtime).
// Build: npm run build  ->  app.js  (committed, served statically / GitHub Pages).
// SPDX-License-Identifier: MIT
//
// TWO-COVER SANDWICH:
//   * Module is cabled + assembled OUTSIDE, inserted from below into the TOP COVER
//     (buzzer up, against N/S stop-ledges).
//   * BOTTOM COVER = a flush full-footprint base plate that BUTTS the top-cover walls at
//     the seam (no side gap). Its N/S ribs press the PCB up (clamp, no PCB snap-lips); its
//     W/E locating walls plug in so it can't slide; snap beads on the ribs hold it.
//   * Cables exit W/E through notches open at the seam; they route in the plenum below the PCBs.
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
    { edge:'W', x:3.1,  y:15.5 },
    { edge:'E', x:16.9, y:4.5  }
  ],
  top_feature: { type:'grille', x:10, y:10, dia:8.5 }
};

// ---- Fixed design parameters ----
const P = {
  wallT: 1.2, topT: 1.2, botFloorT: 1.2,
  lidGap: 0.4,       // buzzer-to-grille air gap
  tol: 0.3,          // PCB-to-wall clearance (generous for prototypes)
  ledgeDepth: 1.5, ledgeH: 1.5,      // top-cover PCB stop ledge (N/S)
  ribDepth: 1.5, ribXInset: 6.0,     // bottom-cover push-rib (N/S), inset in X to clear the sockets
  connW: 9.0,        // widened cable notch
  // sound grille — 5x5 matrix of holes:
  grilleCols: 5, grilleSpacing: 2.5, grilleHoleR: 0.85,
  // bottom-cover -> top-cover snap (beads on ribs, catches on N/S inner walls):
  snapClear: 0.65, snapProj: 0.4, snapH: 1.0, snapCatchZ: 3.0,  // 0.65 -> ~0.15 mm engagement (easier push)
  // bottom-cover W/E locating walls (stop it sliding) + their fit into the top cover:
  fitClear: 0.3, weWallT: 1.2, weWallH: 1.6,                    // 0.3 = insertion still easy, a touch less E/W slide
  // light retention nibs: hold the PCB in the top cover before the bottom cover goes on:
  retNibProj: 0.4, retNibH: 1.0                                 // 0.4 -> ~0.1 mm catch: holds but releases by hand
};

// sound grille: a 5x5 matrix of holes centered on the buzzer
function grille(cx, cy, cz) {
  const h = P.topT + 0.4, r = P.grilleHoleR, s = P.grilleSpacing, n = P.grilleCols, off = (n-1)/2;
  const cutters = [];
  for (let ix = 0; ix < n; ix++) for (let iy = 0; iy < n; iy++)
    cutters.push(cylinder({ radius:r, height:h, segments:20, center:[cx + (ix-off)*s, cy + (iy-off)*s, cz] }));
  return union(...cutters);
}

// Build the two covers for N buzzers. Returns { top, bot, outerW, outerD }.
function buildHousing(profile, count, clearTop, clearBot) {
  const fw = profile.footprint.w, fd = profile.footprint.h;
  const bayW = fw + 2*P.tol, bayD = fd + 2*P.tol;
  const outerW = count*bayW + (count+1)*P.wallT;
  const outerD = bayD + 2*P.wallT;
  const seamZ    = P.botFloorT;                 // base-plate top = top-cover wall bottom (flush butt)
  const pcbBotZ  = seamZ + clearBot;
  const pcbTopZ  = pcbBotZ + profile.pcb_thickness;
  const plateBotZ = pcbTopZ + clearTop + P.lidGap;
  const plateTopZ = plateBotZ + P.topT;
  const bayX = (i) => P.wallT + i*(bayW + P.wallT);
  const snapZ = P.snapCatchZ, beadZ = P.snapCatchZ + P.snapH;
  const ribLen = bayW - 2*P.ribXInset;

  // ===================== TOP COVER (shell from the seam up; open bottom) =====================
  let top = cuboid({ size:[outerW, outerD, plateTopZ - seamZ], center:[outerW/2, outerD/2, (seamZ+plateTopZ)/2] });
  // hollow each bay (seam -> grille plate) => outer walls + upper dividers + grille plate
  for (let i = 0; i < count; i++) {
    const cx = bayX(i) + bayW/2;
    top = subtract(top, cuboid({ size:[bayW, bayD, plateBotZ - seamZ + 0.1],
      center:[cx, P.wallT + bayD/2, (seamZ+plateBotZ)/2 + 0.05] }));
  }
  // open the cable plenum below the PCBs (dividers remain only above pcbBotZ)
  top = subtract(top, cuboid({ size:[outerW - 2*P.wallT, outerD - 2*P.wallT, pcbBotZ - seamZ + 0.05],
    center:[outerW/2, outerD/2, (seamZ+pcbBotZ)/2] }));
  // PCB-stop ledges (N/S per bay) + light retention nibs just under the PCB edges.
  // The board clicks past the nibs and is trapped against the ledges -> it stays in the
  // top cover before the bottom cover is fitted (no more falling out when flipped).
  const nibLen = bayW - 2*P.ribXInset, retNibZc = pcbBotZ - P.retNibH/2;
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2, yS = P.wallT, yN = P.wallT + bayD;
    top = union(top,
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yS + P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] }),
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yN - P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] }),
      cuboid({ size:[nibLen, P.retNibProj, P.retNibH], center:[cxC, yS + P.retNibProj/2, retNibZc] }),
      cuboid({ size:[nibLen, P.retNibProj, P.retNibH], center:[cxC, yN - P.retNibProj/2, retNibZc] })
    );
  }
  // sound grilles (5x5)
  for (let i = 0; i < count; i++) {
    const gx = bayX(i) + P.tol + profile.top_feature.x, gy = P.wallT + P.tol + profile.top_feature.y;
    top = subtract(top, grille(gx, gy, plateBotZ + P.topT/2));
  }
  // cable notches on the OUTER W/E walls, open at the seam. Connector Y is MIRRORED (module
  // inserts from below). Inter-bay routing uses the open plenum, so no divider notches needed.
  { const c = profile.connectors.find(c => c.edge==='W'); const wy = P.wallT + P.tol + (fd - c.y);
    top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ - seamZ + 0.1], center:[P.wallT/2, wy, (seamZ+pcbBotZ)/2] })); }
  { const c = profile.connectors.find(c => c.edge==='E'); const wy = P.wallT + P.tol + (fd - c.y);
    top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ - seamZ + 0.1], center:[outerW - P.wallT/2, wy, (seamZ+pcbBotZ)/2] })); }
  // snap CATCHES (inner N/S), one segment per bay so each is backed by wall
  const snapLen = bayW - 2*P.ribXInset;
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    top = union(top,
      cuboid({ size:[snapLen, P.snapProj, P.snapH], center:[cxC, P.wallT + P.snapProj/2, snapZ] }),
      cuboid({ size:[snapLen, P.snapProj, P.snapH], center:[cxC, outerD - P.wallT - P.snapProj/2, snapZ] })
    );
  }

  // ===================== BOTTOM COVER (flush base + W/E locators + ribs) =====================
  let bot = cuboid({ size:[outerW, outerD, seamZ], center:[outerW/2, outerD/2, seamZ/2] });   // full-footprint flush base
  // W/E locating walls: rise into the top cover, snug against its W/E inner walls (no W/E slide).
  // Kept below the sockets (which sit at the W/E), so they clear.
  const weZc = seamZ + P.weWallH/2, weYlen = outerD - 2*(P.wallT + P.fitClear);
  bot = union(bot,
    cuboid({ size:[P.weWallT, weYlen, P.weWallH], center:[P.wallT + P.fitClear + P.weWallT/2, outerD/2, weZc] }),
    cuboid({ size:[P.weWallT, weYlen, P.weWallH], center:[outerW - P.wallT - P.fitClear - P.weWallT/2, outerD/2, weZc] })
  );
  // N/S push-ribs (center only, clear the sockets), rise to the PCB bottom
  const ribH = pcbBotZ - seamZ;
  const yS = P.wallT + P.snapClear, yN = outerD - P.wallT - P.snapClear;
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    bot = union(bot,
      cuboid({ size:[ribLen, P.ribDepth, ribH], center:[cxC, yS + P.ribDepth/2, seamZ + ribH/2] }),
      cuboid({ size:[ribLen, P.ribDepth, ribH], center:[cxC, yN - P.ribDepth/2, seamZ + ribH/2] })
    );
  }
  // snap beads on the ribs (one segment per bay, backed by the rib)
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    bot = union(bot,
      cuboid({ size:[ribLen, P.snapProj, P.snapH], center:[cxC, yS - P.snapProj/2, beadZ] }),
      cuboid({ size:[ribLen, P.snapProj, P.snapH], center:[cxC, yN + P.snapProj/2, beadZ] })
    );
  }

  // ===================== print layout: both parts flat, side by side =====================
  top = mirror({ normal:[0,0,1], origin:[0,0,0] }, top);   // flip grille-down (support-free print)
  top = translate([0, 0, plateTopZ], top);                 // grille on the bed, opening up
  bot = translate([0, outerD + 14, 0], bot);               // beside, base on the bed

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
