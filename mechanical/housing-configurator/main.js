// noknok Housing Configurator — app entry (bundled with esbuild; no CDN at runtime).
// Build: npm run build  ->  app.js  (committed, served statically / GitHub Pages).
// SPDX-License-Identifier: MIT
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
  // JST-SH sockets are BOTTOM-side on the W + E edges. Positions from the production
  // CSV, converted to TOP (buzzer) view: W socket sits near NORTH, E near SOUTH.
  connectors: [
    { edge:'W', x:3.1,  y:15.5 },
    { edge:'E', x:16.9, y:4.5  }
  ],
  top_feature: { type:'grille', x:10, y:10, dia:8.5 }  // buzzer is 8.5 mm, centered
};

// ---- Fixed design parameters (housing standard) ----
const P = {
  wallT: 1.2, floorT: 1.2, lidT: 1.2,
  lidGap: 0.4,     // air gap so the lid never presses on the 3 mm buzzer
  tol: 0.25,       // clearance around the PCB on each side
  ledgeDepth: 1.5, // how far the support shelf reaches in from the N/S walls
  lipOverhang: 0.6,// how far the retention lip catches over the PCB top edge
  lipH: 0.8,       // lip height above the PCB
  pushHoleR: 3.0,  // Ø6 push-out hole in the floor to poke the PCB out
  connW: 6.0,      // JST-SH cable notch width (along the edge)
  // Lid snap-fit — the lid caps OVER the base, detent on the N/S walls:
  skirtT: 1.0, skirtH: 5.0, skirtClear: 0.9,
  baseBeadProj: 0.6, lidBeadProj: 0.5, snapH: 1.0, skirtEngage: 2.5
};

// Build the housing solids for N buzzers. Returns { base, lid }.
function buildHousing(profile, count, clearTop, clearBot) {
  const fw = profile.footprint.w, fd = profile.footprint.h;
  const bayW = fw + 2 * P.tol;
  const bayD = fd + 2 * P.tol;
  const standoffH = clearBot;
  const innerH = standoffH + profile.pcb_thickness + clearTop + P.lidGap;
  const baseH = P.floorT + innerH;
  const outerW = count * bayW + (count + 1) * P.wallT;
  const outerD = bayD + 2 * P.wallT;
  const pcbTopZ = P.floorT + standoffH + profile.pcb_thickness;
  const bayX = (i) => P.wallT + i * (bayW + P.wallT);

  // 1) outer block
  let base = cuboid({ size:[outerW, outerD, baseH], center:[outerW/2, outerD/2, baseH/2] });

  // 2) bay cavities
  for (let i = 0; i < count; i++) {
    const cx = bayX(i) + bayW/2;
    base = subtract(base, cuboid({ size:[bayW, bayD, innerH + 0.1],
      center:[cx, P.wallT + bayD/2, P.floorT + innerH/2 + 0.05] }));
  }

  // 3) support ledges + snap-lips on N/S edges; push-out hole in floor
  for (let i = 0; i < count; i++) {
    const cxC = bayX(i) + bayW/2;
    const yS = P.wallT, yN = P.wallT + bayD;
    const sLedge = cuboid({ size:[bayW, P.ledgeDepth, standoffH], center:[cxC, yS + P.ledgeDepth/2, P.floorT + standoffH/2] });
    const nLedge = cuboid({ size:[bayW, P.ledgeDepth, standoffH], center:[cxC, yN - P.ledgeDepth/2, P.floorT + standoffH/2] });
    const lipZ = pcbTopZ + P.lipH/2;
    const sLip = cuboid({ size:[bayW, P.lipOverhang, P.lipH], center:[cxC, yS + P.lipOverhang/2, lipZ] });
    const nLip = cuboid({ size:[bayW, P.lipOverhang, P.lipH], center:[cxC, yN - P.lipOverhang/2, lipZ] });
    base = union(base, sLedge, nLedge, sLip, nLip);
    base = subtract(base, cylinder({ radius:P.pushHoleR, height:P.floorT + 0.4, segments:32, center:[cxC, P.wallT + bayD/2, P.floorT/2] }));
  }

  // 4) cable notches in the bottom gap (bottom-side, side-entry sockets)
  const slotZc = P.floorT + standoffH/2, slotH = standoffH + 0.02;
  { const c = profile.connectors.find(c => c.edge==='W'); const wy = P.wallT + P.tol + c.y;
    base = subtract(base, cuboid({ size:[P.wallT+0.4, P.connW, slotH], center:[P.wallT/2, wy, slotZc] })); }
  { const c = profile.connectors.find(c => c.edge==='E'); const wy = P.wallT + P.tol + c.y;
    base = subtract(base, cuboid({ size:[P.wallT+0.4, P.connW, slotH], center:[outerW - P.wallT/2, wy, slotZc] })); }
  for (let i = 1; i < count; i++) {
    const dividerX = bayX(i) - P.wallT/2;
    for (const c of profile.connectors) { const wy = P.wallT + P.tol + c.y;
      base = subtract(base, cuboid({ size:[P.wallT+0.4, P.connW, slotH], center:[dividerX, wy, slotZc] })); }
  }

  // 4b) snap beads on the base N/S outer walls
  const baseBeadZ = baseH - P.skirtEngage;
  base = union(base,
    cuboid({ size:[outerW, P.baseBeadProj, P.snapH], center:[outerW/2, -P.baseBeadProj/2, baseBeadZ] }),
    cuboid({ size:[outerW, P.baseBeadProj, P.snapH], center:[outerW/2, outerD + P.baseBeadProj/2, baseBeadZ] })
  );

  // 5) lid — built in the SEATED position, then flipped skirt-up and placed beside the base.
  const gf = profile.top_feature;
  // plate is sized to the full SKIRT footprint so it caps the skirt (no floating walls)
  const plateW = outerW + 2*(P.skirtClear + P.skirtT);
  const plateD = outerD + 2*(P.skirtClear + P.skirtT);
  let lid = cuboid({ size:[plateW, plateD, P.lidT], center:[outerW/2, outerD/2, baseH + P.lidT/2] });
  for (let i = 0; i < count; i++) {
    const gx = bayX(i) + P.tol + gf.x, gy = P.wallT + P.tol + gf.y;
    const ringR = gf.dia/2 - 1.5, nHoles = 8, holeR = 1.0, gz = baseH + P.lidT/2;
    for (let k = 0; k < nHoles; k++) { const a = (k/nHoles) * Math.PI * 2;
      lid = subtract(lid, cylinder({ radius:holeR, height:P.lidT+0.2, segments:16, center:[gx + Math.cos(a)*ringR, gy + Math.sin(a)*ringR, gz] })); }
    lid = subtract(lid, cylinder({ radius:holeR, height:P.lidT+0.2, segments:16, center:[gx, gy, gz] }));
  }
  // skirt: hollow frame wrapping the outside of the base, hanging down from the plate
  const skZc = baseH - P.skirtH/2;
  const skirt = subtract(
    cuboid({ size:[plateW, plateD, P.skirtH], center:[outerW/2, outerD/2, skZc] }),
    cuboid({ size:[outerW + 2*P.skirtClear, outerD + 2*P.skirtClear, P.skirtH + 0.2], center:[outerW/2, outerD/2, skZc] })
  );
  lid = union(lid, skirt);
  // inward snap beads on BOTH N and S skirt faces, just below the base beads when seated
  const lidBeadZ = baseBeadZ - P.snapH;
  lid = union(lid,
    cuboid({ size:[outerW, P.lidBeadProj, P.snapH], center:[outerW/2, -P.skirtClear + P.lidBeadProj/2, lidBeadZ] }),
    cuboid({ size:[outerW, P.lidBeadProj, P.snapH], center:[outerW/2, outerD + P.skirtClear - P.lidBeadProj/2, lidBeadZ] })
  );
  // flip skirt-up (print orientation) and place beside the base, both flat on the bed
  lid = mirror({ normal:[0,0,1], origin:[0,0,0] }, lid);
  lid = translate([0, outerD + 12, baseH + P.lidT], lid);

  return { base, lid, outerW, outerD };
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
camera.position.set(70, -110, 90);
camera.up.set(0,0,1);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(50,-80,120); scene.add(dl);
const grid = new THREE.GridHelper(240, 24, 0x2a2f3a, 0x20242c);
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
    const { base, lid, outerW, outerD } = buildHousing(PROFILE, count, clearTop, clearBot);
    const raw = stlSerializer.serialize({ binary:true }, base, lid);
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
    controls.target.set(outerW/2, outerD, 6);
    controls.update();

    document.getElementById('download').disabled = false;
    setStatus(`${count} buzzer bay${count>1?'s':''} · STL ready (${(currentSTL.byteLength/1024).toFixed(0)} KB)`);
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
