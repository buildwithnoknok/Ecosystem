// Regenerates logo-data.js from the brand SVG. Run from this folder:  node logo-data.gen.mjs
// Reads the two-line square logo, flattens its cubic Béziers, composes the two <use> rows, converts to
// world coords (y-up), centres + normalises so the larger axis spans 1.0, and tags the two 'o' counters as
// holes. Winding is normalised to CCW at extrude time in main.js (logoEngraving), so orientation here is
// cosmetic. Adjust SVG_PATH if the brand repo lives elsewhere.
import { readFileSync, writeFileSync } from 'fs';
const SVG_PATH = 'C:/Users/chris/noknok/repos/brand/logo/noknok-square-blackpurple.svg';
const OUT = new URL('./logo-data.js', import.meta.url);

const svg = readFileSync(SVG_PATH, 'utf8');
const d = svg.match(/id="nok"\s+d="([^"]+)"/)[1];
const toks = [...d.matchAll(/([MLCZmlcz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g)].map(m => m[1] || m[2]);
const bez = (p0,p1,p2,p3,n) => { const out=[]; for (let i=1;i<=n;i++){ const t=i/n,u=1-t;
  out.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0], u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]); } return out; };
const N = 10;
const subs=[]; let cur=null,start=null,sp=null,cmd=null,i=0; const num=()=>parseFloat(toks[i++]);
while (i<toks.length) { let t=toks[i];
  if (/[MLCZmlcz]/.test(t)) { cmd=t; i++; }
  if (cmd==='M') { const x=num(),y=num(); if (sp&&sp.length) subs.push(sp); sp=[[x,y]]; cur=[x,y]; start=[x,y]; cmd='L'; }
  else if (cmd==='L') { const x=num(),y=num(); sp.push([x,y]); cur=[x,y]; }
  else if (cmd==='C') { const x1=num(),y1=num(),x2=num(),y2=num(),x=num(),y=num(); for (const p of bez(cur,[x1,y1],[x2,y2],[x,y],N)) sp.push(p); cur=[x,y]; }
  else if (cmd==='Z'||cmd==='z') { if (sp){ sp.push([start[0],start[1]]); subs.push(sp); sp=null; } cmd=null; }
  else { i++; }
}
if (sp&&sp.length) subs.push(sp);
// subs = one "nok": [0]=o-counter(hole),[1]=o-outer,[2]=n,[3]=k. Compose the two <use> rows.
const rows=[31.193,175.193]; let composed=[]; const holes=[];
for (const ty of rows) subs.forEach((s,idx) => { if (idx===0) holes.push(composed.length);
  composed.push(s.map(p => [43.902+0.996*p[0], ty+0.996*p[1]])); });
let X0=1e9,Y0=1e9,X1=-1e9,Y1=-1e9;
composed = composed.map(s => s.map(([x,y]) => { const wx=x, wy=-y; X0=Math.min(X0,wx);Y0=Math.min(Y0,wy);X1=Math.max(X1,wx);Y1=Math.max(Y1,wy); return [wx,wy]; }));
const cx=(X0+X1)/2, cy=(Y0+Y1)/2, span=Math.max(X1-X0,Y1-Y0), aspect=(X1-X0)/(Y1-Y0);
const norm = composed.map(s => s.map(([x,y]) => [Math.round((x-cx)/span*1000)/1000, Math.round((y-cy)/span*1000)/1000]));
const js = `// noknok square logo (two-line "nok/nok") flattened from brand/logo/noknok-square-blackpurple.svg.\n`+
`// Contours are centered at (0,0), oriented y-up, normalized so the larger axis spans 1.0. holes = indices\n`+
`// of the two 'o' counters (subtracted). Regenerate via logo-data.gen.mjs if the logo changes.\n`+
`export const LOGO = {\n  aspect: ${aspect.toFixed(3)},\n  holes: [${holes.join(', ')}],\n  contours: [\n`+
norm.map(s=>'    ['+s.map(p=>`[${p[0]},${p[1]}]`).join(',')+']').join(',\n')+`\n  ]\n};\n`;
writeFileSync(OUT, js);
console.log('wrote logo-data.js  contours=',norm.length,'holes=',holes.join(','),'aspect=',aspect.toFixed(3),'points=',norm.reduce((a,s)=>a+s.length,0));
