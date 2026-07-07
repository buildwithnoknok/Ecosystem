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
  lidGap: 0.4, tol: 0.3,
  ledgeDepth: 1.5, ledgeH: 1.5,      // top-cover PCB stop ledge (N/S)
  ribDepth: 1.5, ribXInset: 6.0,     // bottom-cover push-rib (N/S), inset to clear the sockets
  connW: 9.0,
  grilleCols: 5, grilleSpacing: 2.5, grilleHoleR: 0.85,
  // V2 ramped module retention — rounded bump under the PCB N/S edges (cams in AND out):
  retNibR: 0.6, retNibInset: 6.0,
  // V2 flexing cantilever cover latch (arm + round detent into a top-cover window):
  armT: 1.0, hookW: 5.0, hookClear: 0.35, hookR: 0.6,
  wLatchY: 15.0, eLatchY: 5.0, latchZc: 3.6,   // W latch north / E latch south (clear of sockets)
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

// Build the two covers. Returns { top, bot, outerW, outerD }.  fit = clearance offset (mm).
function buildHousing(profile, count, clearTop, clearBot, fit) {
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
  const latchZc = seamZ + P.latchZc, armTopZ = latchZc + P.hookR + 0.8;

  // ===================== TOP COVER (shell from the seam up; open bottom) =====================
  let top = cuboid({ size:[outerW, outerD, plateTopZ - seamZ], center:[outerW/2, outerD/2, (seamZ+plateTopZ)/2] });
  for (let i = 0; i < count; i++) {
    const cx = bayX(i) + bayW/2;
    top = subtract(top, cuboid({ size:[bayW, bayD, plateBotZ - seamZ + 0.1],
      center:[cx, P.wallT + bayD/2, (seamZ+plateBotZ)/2 + 0.05] }));
  }
  top = subtract(top, cuboid({ size:[outerW - 2*P.wallT, outerD - 2*P.wallT, pcbBotZ - seamZ + 0.05],
    center:[outerW/2, outerD/2, (seamZ+pcbBotZ)/2] }));
  // PCB-stop ledges (N/S) + ramped retention bumps under the PCB edges
  const nibLen = bayW - 2*P.retNibInset;
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2, yS = P.wallT, yN = P.wallT + bayD;
    top = union(top,
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yS + P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] }),
      cuboid({ size:[bayW, P.ledgeDepth, P.ledgeH], center:[cxC, yN - P.ledgeDepth/2, pcbTopZ + P.ledgeH/2] })
    );
    // rounded retention bumps (axis X), top at the PCB bottom -> board cams over them
    const nibZc = pcbBotZ - P.retNibR;
    const nibS = translate([cxC, yS, nibZc], rotate([0, Math.PI/2, 0], cylinder({ radius:P.retNibR, height:nibLen, segments:16 })));
    const nibN = translate([cxC, yN, nibZc], rotate([0, Math.PI/2, 0], cylinder({ radius:P.retNibR, height:nibLen, segments:16 })));
    top = union(top, nibS, nibN);
  }
  // sound grilles (5x5)
  for (let i = 0; i < count; i++) {
    const gx = bayX(i) + tol + profile.top_feature.x, gy = P.wallT + tol + profile.top_feature.y;
    top = subtract(top, grille(gx, gy, plateBotZ + P.topT/2));
  }
  // cable notches (outer W/E walls, open at the seam, mirrored connector Y)
  { const c = profile.connectors.find(c => c.edge==='W'); const wy = P.wallT + tol + (fd - c.y);
    top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ - seamZ + 0.1], center:[P.wallT/2, wy, (seamZ+pcbBotZ)/2] })); }
  { const c = profile.connectors.find(c => c.edge==='E'); const wy = P.wallT + tol + (fd - c.y);
    top = subtract(top, cuboid({ size:[P.wallT+0.4, P.connW, pcbBotZ - seamZ + 0.1], center:[outerW - P.wallT/2, wy, (seamZ+pcbBotZ)/2] })); }
  // latch windows in the W/E walls (the detent seats + can be pressed for release)
  const winW = P.hookW + 1.0, winH = 2*P.hookR + 1.2;
  top = subtract(top,
    cuboid({ size:[P.wallT+0.4, winW, winH], center:[P.wallT/2, P.wLatchY, latchZc] }),
    cuboid({ size:[P.wallT+0.4, winW, winH], center:[outerW - P.wallT/2, P.eLatchY, latchZc] })
  );

  // ===================== BOTTOM COVER (flush base + ribs + flexing latch arms) ================
  let bot = cuboid({ size:[outerW, outerD, seamZ], center:[outerW/2, outerD/2, seamZ/2] });
  // N/S centre push-ribs (clear the sockets), rise to the PCB bottom
  const ribLen = bayW - 2*P.ribXInset, ribH = pcbBotZ - seamZ;
  const yS = P.wallT + tol, yN = outerD - P.wallT - tol;
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    bot = union(bot,
      cuboid({ size:[ribLen, P.ribDepth, ribH], center:[cxC, yS + P.ribDepth/2, seamZ + ribH/2] }),
      cuboid({ size:[ribLen, P.ribDepth, ribH], center:[cxC, yN - P.ribDepth/2, seamZ + ribH/2] })
    );
  }
  // two flexing cantilever latch arms (W north, E south), round detent into the wall windows
  const armH = armTopZ - seamZ;
  const armXW = P.wallT + hookClear, armXE = outerW - P.wallT - hookClear;
  bot = union(bot,
    cuboid({ size:[P.armT, P.hookW, armH], center:[armXW + P.armT/2, P.wLatchY, seamZ + armH/2] }),
    translate([armXW, P.wLatchY, latchZc], rotate([Math.PI/2,0,0], cylinder({ radius:P.hookR, height:P.hookW, segments:20 }))),
    cuboid({ size:[P.armT, P.hookW, armH], center:[armXE - P.armT/2, P.eLatchY, seamZ + armH/2] }),
    translate([armXE, P.eLatchY, latchZc], rotate([Math.PI/2,0,0], cylinder({ radius:P.hookR, height:P.hookW, segments:20 })))
  );

  // ===================== print layout: both flat, side by side =====================
  top = mirror({ normal:[0,0,1], origin:[0,0,0] }, top);
  top = translate([0, 0, plateTopZ], top);
  bot = translate([0, outerD + 14, 0], bot);
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
  const fit = +document.getElementById('fit').value;
  setStatus('generating geometry…');
  try {
    const { top, bot, outerW, outerD } = buildHousing(PROFILE, count, clearTop, clearBot, fit);
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
    setStatus(`${count} buzzer bay${count>1?'s':''} · top + bottom cover · fit ${fit>=0?'+':''}${fit} · STL ready (${(currentSTL.byteLength/1024).toFixed(0)} KB)`);
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
document.getElementById('fit').addEventListener('change', regenerate);
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
