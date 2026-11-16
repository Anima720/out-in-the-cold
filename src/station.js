// Part 5 "最后阵地": the abandoned Soviet early-warning radar station.
// Static level (no train frame). North = -z. The station sits on a plateau at y=0; ridge to the north.
import { G, THREE, clamp, mulberry32 } from './core.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { addBox } from './physics.js';
import { W } from './world.js';

export const S = { built: false, cols: [], cover: [], root: null, lights: [], powered: false };

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- terrain ----------
export function ground5(x, z) {
  const dOut = Math.hypot(Math.max(Math.abs(x) - 33, 0), Math.max(-z - 33, 0), Math.max(z - 30, 0));
  const k = sstep(0, 16, dOut);
  if (k <= 0) return 0;
  const north = 16 * sstep(40, 115, -z);
  const gully = 7 * Math.exp(-(((x - 4) / 8) ** 2)) * sstep(36, 80, -z);
  const ew = 8 * sstep(42, 110, Math.abs(x)) * (1 - 0.4 * sstep(0, 60, z));
  const south = -6 * sstep(36, 110, z);
  const n = 1.3 * Math.sin(x * 0.07) * Math.cos(z * 0.05) + 0.7 * Math.sin(x * 0.19 + z * 0.13) + 0.3 * Math.sin(x * 0.41 - z * 0.37);
  return k * (north - gully + ew + south + n);
}

function terrainMesh() {
  const g = new THREE.PlaneGeometry(560, 560, 180, 180);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, ground5(x, z) - 0.01);
    uv.setXY(i, x / 9, z / 9);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, W.mat.snow);
  m.receiveShadow = true;
  return m;
}

// ---------- helpers ----------
let B; // current builder
function solid(x0, y0, z0, x1, y1, z1, key, color, mat = 'concrete', vis = true) {
  if (vis) B.box(x0, y0, z0, x1, y1, z1, key, color);
  S.cols.push([x0, y0, z0, x1, y1, z1, mat]);
}
// wall running along X (constant z band) with rectangular openings [{a,b,y0,y1}]
function wallX(z0, z1, x0, x1, H, open, key, color) {
  let x = x0;
  const ops = [...open].sort((p, q) => p.a - q.a);
  for (const o of ops) {
    if (o.a > x) solid(x, 0, z0, o.a, H, z1, key, color);
    if (o.y0 > 0) solid(o.a, 0, z0, o.b, o.y0, z1, key, color);
    if (o.y1 < H) solid(o.a, o.y1, z0, o.b, H, z1, key, color);
    x = o.b;
  }
  if (x < x1) solid(x, 0, z0, x1, H, z1, key, color);
}
function wallZ(x0, x1, z0, z1, H, open, key, color) {
  let z = z0;
  const ops = [...open].sort((p, q) => p.a - q.a);
  for (const o of ops) {
    if (o.a > z) solid(x0, 0, z, x1, H, o.a, key, color);
    if (o.y0 > 0) solid(x0, 0, o.a, x1, o.y0, o.b, key, color);
    if (o.y1 < H) solid(x0, o.y1, o.a, x1, H, o.b, key, color);
    z = o.b;
  }
  if (z < z1) solid(x0, 0, z, x1, H, z1, key, color);
}
// enemy cover spot behind an obstacle centred at (cx,cz) with half-extent r, on the side away from the station
function coverFor(cx, cz, r, tier) {
  const dx = cx, dz = cz + 2, L = Math.hypot(dx, dz) || 1;
  S.cover.push({ x: cx + (dx / L) * (r + 0.55), z: cz + (dz / L) * (r + 0.55), tier, used: null });
}

function chainLink() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 32); x.lineTo(32, -32); x.moveTo(32, 96); x.lineTo(96, 32); x.moveTo(-32, 32); x.lineTo(32, 96); x.moveTo(32, -32); x.lineTo(96, 32); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ color: 0x8b9196, map: t, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.55 });
}

// ---------- build ----------
export function buildStation() {
  if (S.built) { S.root.visible = true; return; }
  S.built = true;
  const root = new THREE.Group(); S.root = root; G.scene.add(root);
  root.add(terrainMesh());
  const mats = {
    ...M,
    glass: new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.4 }),
    light: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7dff9a, emissiveIntensity: 0 }),
    fence: chainLink(),
    dish: new THREE.MeshStandardMaterial({ color: 0xc9cccd, map: M.steel.map, normalMap: M.steel.normalMap, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
  };
  S.mats = mats;
  B = new Builder();
  const CON = 0x9a9890, CON2 = 0x7f7d76, STL = 0x55585b;
  const H = 4.0;
  // --- operations block
  solid(-8.2, -0.2, -5.2, 8.2, 0.15, 5.2, 'concrete', CON2);                       // floor slab
  wallX(-5.0, -4.7, -8, 8, H, [{ a: -5.6, b: -3.6, y0: 1.0, y1: 2.15 }, { a: -1, b: 1, y0: 1.0, y1: 2.15 }, { a: 3.6, b: 5.6, y0: 1.0, y1: 2.15 }], 'concrete', CON);
  wallX(4.7, 5.0, -8, 8, H, [{ a: -5.6, b: -3.6, y0: 1.0, y1: 2.15 }, { a: -1, b: 1, y0: 0, y1: 2.35 }, { a: 3.6, b: 5.6, y0: 1.0, y1: 2.15 }], 'concrete', CON);
  wallZ(-8, -7.7, -4.7, 4.7, H, [{ a: -1, b: 1, y0: 1.0, y1: 2.15 }], 'concrete', CON);
  wallZ(7.7, 8, -4.7, 4.7, H, [{ a: -1, b: 1, y0: 1.0, y1: 2.15 }], 'concrete', CON);
  solid(-8.2, H, -5.2, 8.2, H + 0.3, 5.2, 'concrete', CON2);                         // roof slab (top 4.3)
  const R = H + 0.3;
  solid(-8.2, R, -5.2, 8.2, R + 0.55, -4.95, 'concrete', CON);                       // parapets
  solid(-8.2, R, 4.95, 8.2, R + 0.55, 5.2, 'concrete', CON);
  solid(-8.2, R, -4.95, -7.95, R + 0.55, 4.95, 'concrete', CON);
  solid(7.95, R, -2.9, 8.2, R + 0.55, 4.95, 'concrete', CON);                        // east parapet, gap for the stairs
  // window frames + sills (visual), lintels over the door
  for (const [x, z, w, rotY] of [[-4.6, -4.85, 2, 0], [0, -4.85, 2, 0], [4.6, -4.85, 2, 0], [-4.6, 4.85, 2, 0], [4.6, 4.85, 2, 0], [-7.85, 0, 2, Math.PI / 2], [7.85, 0, 2, Math.PI / 2]]) {
    B.boxC(x, 0.97, z, rotY ? 0.5 : w + 0.2, 0.08, rotY ? w + 0.2 : 0.5, 'steel', 0x6a6c6e);
    for (const sx of [-1, 1]) B.boxC(x + (rotY ? 0 : sx * (w / 2)), 1.58, z + (rotY ? sx * (w / 2) : 0), 0.06, 1.15, 0.06, 'paint', 0x4f5b4a);
  }
  B.boxC(0, 2.42, 5.1, 2.4, 0.16, 0.25, 'steel', 0x5c5f61);
  // stencilled band and pipes on the facade
  B.boxC(0, 3.3, -5.03, 16.2, 0.25, 0.06, 'paint', 0x7a3a2c);
  B.boxC(0, 3.3, 5.03, 16.2, 0.25, 0.06, 'paint', 0x7a3a2c);
  B.cyl(-7.4, 2.2, 5.15, 0.08, 0.08, 4.4, 'steel', STL);
  // interior: consoles, racks, table, crates
  solid(-7.65, 0.15, -4.4, -6.3, 1.0, -0.3, 'steel', 0x6d7270, 'metal');
  for (const z of [-3.6, -2.3, -1.0]) { B.boxC(-7.2, 1.35, z, 0.25, 0.6, 0.85, 'steel', 0x2c2f31); B.boxC(-7.06, 1.35, z, 0.02, 0.48, 0.72, 'screen', 0); }
  solid(-7.65, 0.15, 1.0, -6.85, 2.3, 3.6, 'steel', 0x60666a, 'metal');
  for (const z of [1.4, 2.2, 3.0]) B.boxC(-6.84, 1.6, z, 0.03, 0.05, 0.3, 'screen', 0);
  solid(2.2, 0.15, 1.2, 4.4, 0.95, 2.6, 'wood', 0x7a6248, 'wood');
  solid(-5.2, 0.15, -4.4, -3.9, 1.05, -3.6, 'crate', 0xffffff, 'wood');
  solid(3.9, 0.15, -4.4, 5.3, 0.95, -3.5, 'crate', 0xffffff, 'wood');
  B.boxC(-4.7, 0.4, -2.9, 0.55, 0.5, 0.55, 'crate', 0xffffff);                       // stool crate (visual only)
  solid(5.4, 0.15, 2.4, 7.5, 1.2, 4.5, 'steel', 0x575d55, 'metal');               // switchgear cabinet
  solid(-6.9, 0.15, 3.4, -5.6, 0.9, 4.5, 'crate', 0xffffff, 'wood');
  // weapon rack + ammo crate along the inner south wall
  B.boxC(3.15, 1.5, 4.55, 3.9, 0.08, 0.2, 'wood', 0x6e5a42); B.boxC(3.15, 0.55, 4.55, 3.9, 0.08, 0.2, 'wood', 0x6e5a42);
  S.rack = [];
  [['pkm', 1.8], ['svd', 2.7], ['saiga', 3.6], ['rpg', 4.5]].forEach(([id, x]) => {
    const L = id === 'svd' ? 1.25 : id === 'pkm' ? 1.2 : id === 'rpg' ? 0.95 : 0.95;
    B.boxC(x, 0.2 + L / 2, 4.5, 0.05, L, 0.09, 'gun', 0xffffff);
    if (id === 'rpg') { B.cyl(x, 1.25, 4.45, 0.045, 0.012, 0.22, 'pGreen', 0xffffff); B.cyl(x, 0.8, 4.45, 0.04, 0.04, 0.2, 'wood', 0x7a5232); }
    else B.boxC(x, 0.75, 4.42, 0.05, 0.22, 0.1, id === 'pkm' ? 'pGreen' : 'gun', 0xffffff, 0.2, 0, 0);
    if (id === 'svd') B.cyl(x, 1.0, 4.42, 0.02, 0.02, 0.26, 'gun', 0xffffff);
    S.rack.push({ id, pos: new THREE.Vector3(x, 0.15, 3.8) });
  });
  solid(-4.4, 0.15, 3.7, -3.4, 0.75, 4.45, 'paint', 0x4f5b3f, 'metal');
  B.boxC(-3.9, 0.77, 4.07, 0.9, 0.04, 0.6, 'paint', 0x435036);
  for (let i = 0; i < 3; i++) B.boxC(-4.2 + i * 0.3, 0.83, 4.07, 0.2, 0.1, 0.14, 'pGreen', 0xffffff);
  S.ammoPos = new THREE.Vector3(-3.9, 0.15, 3.2);
  // ceiling lamps (emissive when powered)
  for (const [x, z] of [[-4, 0], [0, 0], [4, 0]]) { B.boxC(x, H - 0.08, z, 0.9, 0.08, 0.22, 'light', 0); B.boxC(x, H - 0.03, z, 1.0, 0.04, 0.3, 'steel', 0x3a3c3e); }
  // --- external stairs to the roof (east side)
  const NS = 13, rise = R / NS;
  for (let i = 0; i < NS; i++) {
    const zA = 3.6 - 0.5 * (i + 1), zB = 3.6 - 0.5 * i;
    solid(8.3, 0, zA, 9.7, rise * (i + 1), zB, 'concrete', i % 2 ? CON : 0x8f8d86);
  }
  solid(8.0, 0, -4.7, 9.7, R, -2.9, 'concrete', CON2);                               // landing
  for (let i = 0; i <= 7; i++) B.cyl(9.75, 0.5 + i * 0.6, 3.4 - i * 0.95, 0.03, 0.03, 1.1, 'steel', STL);
  B.add(new THREE.CylinderGeometry(0.03, 0.03, 9.2, 6), 'steel', STL, new THREE.Matrix4().compose(new THREE.Vector3(9.75, 3.0, -0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.58, 0, 0)), new THREE.Vector3(1, 1, 1)));
  // --- roof: dish pedestal, alignment panel, vents
  solid(-4.2, R, -1.2, -2.8, R + 1.4, 0.2, 'steel', 0x8a8e8f, 'metal');
  solid(-1.3, R, 1.3, -0.3, R + 1.1, 1.9, 'steel', 0x5f6668, 'metal');
  B.boxC(-0.8, R + 0.85, 1.92, 0.7, 0.4, 0.02, 'screen', 0);
  S.panelPos = new THREE.Vector3(-0.8, R, 2.5);
  // DShK emplacement on the north edge of the roof
  S.mgPivot = new THREE.Vector3(1.5, R + 0.95, -3.75);
  solid(1.1, R, -4.15, 1.9, R + 0.25, -3.35, 'concrete', 0x86847c);
  for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; B.capsule(1.5 + Math.sin(a) * 0.85, R + 0.18, -3.75 - Math.cos(a) * 0.85, 0.16, 0.3, 'cloth', 0xb3a383, 0, a, Math.PI / 2, 1.1, 1); }
  solid(3.5, R, -3.0, 5.0, R + 0.9, -1.8, 'steel', 0x7b7f80, 'metal');
  solid(2.0, R, 2.0, 3.2, R + 0.7, 3.4, 'steel', 0x7b7f80, 'metal');
  for (let i = 0; i < 6; i++) B.boxC(-6.5 + i * 2.4, R + 0.08, -2.3, 0.3, 0.16, 0.3, 'steel', 0x45484a);
  B.boxC(1, R + 0.06, -2.3, 14, 0.06, 0.18, 'steel', 0x45484a);
  // --- generator (west side)
  solid(-11.8, 0, -1.6, -9.4, 1.5, 1.6, 'paint', 0x5d6a4a, 'metal');
  B.boxC(-9.37, 1.0, 0, 0.06, 0.6, 0.8, 'steel', 0x2a2c2e);
  B.cyl(-11.2, 2.3, -1.0, 0.12, 0.12, 1.6, 'steel', 0x3b3a38);
  S.genPos = new THREE.Vector3(-8.9, 0, 0);
  for (let i = 0; i < 4; i++) solid(-13.2, 0, -2.4 + i * 1.1, -12.3, 1.1, -1.5 + i * 1.1, 'paint', i % 2 ? 0x6a5a3a : 0x3f5a4a, 'metal'); // fuel drums
  // --- sandbag line north of the building (mates' fighting position)
  for (const [x0, x1] of [[-6.2, -1.8], [1.8, 6.2]]) {
    solid(x0, 0, -7.6, x1, 1.0, -6.9, 'cloth', 0xb8a98a, 'soft', false);
    for (let r = 0; r < 3; r++) for (let x = x0 + 0.35; x < x1; x += 0.68) B.capsule(x + (r % 2) * 0.3, 0.2 + r * 0.31, -7.25, 0.17, 0.32, 'cloth', 0xb3a383, 0, 0, Math.PI / 2, 1.1, 1.0);
  }
  S.truckSeat = new THREE.Vector3(4.2, 0.42, -6.2);
  solid(3.8, 0, -6.6, 4.6, 0.42, -5.8, 'crate', 0xffffff, 'wood');                  // ammo crate (Truck sits here later)
  // --- armory shed (south-west)
  const AH = 2.8;
  solid(-22.2, -0.2, 7.8, -15.8, 0.1, 13.2, 'concrete', CON2);
  wallX(7.8, 8.05, -22.2, -15.8, AH, [], 'concrete', 0x8c8a82);
  wallX(12.95, 13.2, -22.2, -15.8, AH, [{ a: -20, b: -18.6, y0: 1.1, y1: 1.9 }], 'concrete', 0x8c8a82);
  wallZ(-22.2, -21.95, 8.05, 12.95, AH, [], 'concrete', 0x8c8a82);
  wallZ(-16.05, -15.8, 8.05, 12.95, AH, [{ a: 9.8, b: 11.3, y0: 0, y1: 2.2 }], 'concrete', 0x8c8a82);
  solid(-22.4, AH, 7.6, -15.6, AH + 0.2, 13.4, 'steel', 0x6b6e66);
  B.boxC(-15.75, 2.35, 10.55, 0.1, 0.16, 1.7, 'paint', 0x7a3a2c);
  solid(-21.8, 0.1, 9.4, -20.2, 0.9, 11.6, 'wood', 0x6e5a42, 'wood');               // table
  B.boxC(-21.0, 1.08, 10.5, 0.42, 0.34, 1.75, 'paint', 0x4b5a3a);                     // Igla case
  B.boxC(-21.0, 1.27, 10.5, 0.44, 0.04, 1.77, 'steel', 0x2f3330);
  for (let i = 0; i < 4; i++) B.boxC(-21.7 + i * 0.5, 1.3, 12.7, 0.08, 1.2, 0.08, 'wood', 0x5a4632);
  S.iglaPos = new THREE.Vector3(-19.7, 0, 10.5);
  // --- radar mast (rotating antenna)
  const mx = 16, mz = -13, MH = 15;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl(mx + sx * 1.1, MH / 2, mz + sz * 1.1, 0.07, 0.07, MH, 'steel', STL, sz * 0.07, 0, -sx * 0.07, 6);
  for (let y = 1.5; y < MH; y += 2.2) {
    const w = 2.2 - (y / MH) * 2.1 * 0.35;
    for (const [rx, rz, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) B.boxC(mx + rx * w / 2, y, mz + rz * w / 2, w, 0.05, 0.05, 'steel', STL, 0, ry, 0);
  }
  solid(mx - 1.4, 0, mz - 1.4, mx + 1.4, 0.5, mz + 1.4, 'concrete', CON2);
  solid(mx - 0.4, 0, mz - 0.4, mx + 0.4, 6, mz + 0.4, 'steel', STL, 'metal', false);
  // --- yard cover
  const jeep = (cx, cz, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    B.boxC(cx, 0.75, cz, 1.8, 0.9, 3.8, 'paint', 0x4d5640, 0, ry, 0);
    B.boxC(cx - s * 0.5, 1.5, cz - c * 0.5, 1.7, 0.7, 1.6, 'paint', 0x47503b, 0, ry, 0);
    for (const [ox, oz] of [[-0.85, -1.2], [0.85, -1.2], [-0.85, 1.2], [0.85, 1.2]]) B.cyl(cx + ox * c + oz * s, 0.38, cz - ox * s + oz * c, 0.38, 0.38, 0.28, 'dark', 0x1c1c1c, 0, ry, Math.PI / 2, 12);
    const hx = Math.abs(c) * 0.9 + Math.abs(s) * 1.9, hz = Math.abs(s) * 0.9 + Math.abs(c) * 1.9;
    S.cols.push([cx - hx, 0, cz - hz, cx + hx, 1.5, cz + hz, 'metal']);
    coverFor(cx, cz, Math.max(hx, hz), 2);
  };
  jeep(-11, -15, 0.5);
  const barrier = (cx, cz, ry = 0) => {
    const w = ry ? 0.6 : 2.0, d = ry ? 2.0 : 0.6;
    solid(cx - w / 2, 0, cz - d / 2, cx + w / 2, 0.95, cz + d / 2, 'concrete', 0xa5a399);
    coverFor(cx, cz, 0.6, 2);
  };
  barrier(3, -15); barrier(-3, -20); barrier(11, -21); barrier(-17, -8, 1); barrier(17, -4, 1); barrier(-7, -26); barrier(7.5, -27);
  for (const [cx, cz] of [[-6, -12], [8, -17]]) { solid(cx - 0.6, 0, cz - 0.6, cx + 0.6, 1.2, cz + 0.6, 'crate', 0xffffff, 'wood'); B.boxC(cx + 0.1, 1.6, cz, 0.8, 0.8, 0.8, 'crate', 0xffffff, 0, 0.3, 0); coverFor(cx, cz, 0.6, 2); }
  for (let i = 0; i < 5; i++) solid(11 + (i % 3) * 0.75, 0, -10.5 + Math.floor(i / 3) * 0.75, 11.65 + (i % 3) * 0.75, 1.1, -9.85 + Math.floor(i / 3) * 0.75, 'paint', [0x6a3a2a, 0x3f5a4a, 0x6a5a3a][i % 3], 'metal');
  coverFor(11.8, -10, 1.2, 2);
  // guard booth by the north gate
  solid(5.5, 0, -32.2, 7.7, 2.5, -30.2, 'concrete', 0x8c8a82);
  B.boxC(6.6, 2.6, -31.2, 2.6, 0.15, 2.6, 'steel', 0x5a5d58);
  coverFor(6.6, -31.2, 1.1, 1);
  // --- perimeter fence (gate north x -4..4, south gap x -3..3, breaches)
  const FX0 = -30, FX1 = 30, FZ0 = -30, FZ1 = 26;
  const gaps = { n: [[-4, 4], [-22, -19]], s: [[-3, 3]], w: [[-14, -11]], e: [[-6, -3]] };
  const fenceRun = (ax, az, bx, bz, side) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 3), dx = (bx - ax) / L, dz = (bz - az) / L;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * L, x = ax + dx * t, z = az + dz * t;
      const u = side === 'n' || side === 's' ? x : z;
      if (gaps[side].some(([a, b]) => u > a + 0.3 && u < b - 0.3)) continue;
      B.cyl(x, 1.2, z, 0.05, 0.05, 2.4, 'steel', STL, 0, 0, 0, 6);
      if (i < n) {
        const t2 = ((i + 0.5) / n) * L, u2 = side === 'n' || side === 's' ? ax + dx * t2 : az + dz * t2;
        if (gaps[side].some(([a, b]) => u2 > a && u2 < b)) continue;
        const cx = ax + dx * t2, cz = az + dz * t2, seg = L / n, ry = side === 'n' || side === 's' ? 0 : Math.PI / 2;
        for (const y of [0.5, 1.2, 1.9, 2.35]) B.boxC(cx, y, cz, seg, 0.025, 0.025, 'steel', 0x3d4042, 0, ry, 0);
        B.boxC(cx, 1.2, cz, seg, 2.2, 0.01, 'fence', 0xffffff, 0, ry, 0); // chain-link panel (alpha-tested texture)
      }
    }
    // colliders between gaps
    let cur = side === 'n' || side === 's' ? Math.min(ax, bx) : Math.min(az, bz);
    const end = side === 'n' || side === 's' ? Math.max(ax, bx) : Math.max(az, bz);
    for (const [a, b] of [...gaps[side], [end, end]].sort((p, q) => p[0] - q[0])) {
      if (a > cur) {
        if (side === 'n' || side === 's') S.cols.push([cur, 0, az - 0.06, a, 2.4, az + 0.06, 'metal', 'fence']);
        else S.cols.push([ax - 0.06, 0, cur, ax + 0.06, 2.4, a, 'metal', 'fence']);
      }
      cur = Math.max(cur, b);
    }
  };
  fenceRun(FX0, FZ0, FX1, FZ0, 'n'); fenceRun(FX0, FZ1, FX1, FZ1, 's'); fenceRun(FX0, FZ0, FX0, FZ1, 'w'); fenceRun(FX1, FZ0, FX1, FZ1, 'e');
  S.entries = [{ x: 0, z: -31 }, { x: -20.5, z: -31 }, { x: -31, z: -12.5 }, { x: 31, z: -4.5 }];
  // open gate leaves
  for (const sx of [-1, 1]) B.boxC(sx * 4.6, 1.2, -31.6, 0.08, 2.2, 3.0, 'steel', 0x4e5458, 0, sx * 0.3, 0);
  // --- outside cover: rocks + concrete blocks along the approach
  const rockAt = (x, z, s) => {
    const y = ground5(x, z);
    const m = new THREE.Mesh(W.geo.rock, W.mat.rock); m.position.set(x, y - 0.2 * s, z); m.scale.set(s * 1.4, s, s * 1.2); m.rotation.y = x * 0.37;
    m.castShadow = m.receiveShadow = true; root.add(m);
    S.cols.push([x - s * 0.9, y - 1, z - s * 0.8, x + s * 0.9, y + s * 0.85, z + s * 0.8, 'rock']);
    coverFor(x, z, s * 0.9, 0);
  };
  for (const [x, z, s] of [[-18, -42, 1.6], [10, -45, 1.8], [-4, -55, 1.5], [24, -40, 1.7], [-30, -47, 1.9], [33, -52, 1.6], [-12, -66, 1.7], [17, -64, 1.8], [-40, -30, 1.6], [42, -24, 1.7], [-38, -6, 1.5], [40, 4, 1.5]]) rockAt(x, z, s);
  for (const [x, z] of [[-7, -36], [8, -37], [-24, -36], [22, -35], [-36, -16], [36, -10]]) {
    const y = ground5(x, z);
    solid(x - 1, y - 0.3, z - 0.3, x + 1, y + 0.95, z + 0.3, 'concrete', 0x9d9b92);
    coverFor(x, z, 0.6, 1);
  }
  // power poles leading in from the south
  for (let i = 0; i < 6; i++) { const z = 30 + i * 22, x = -6 + Math.sin(i) * 2; B.cyl(x, ground5(x, z) + 4, z, 0.12, 0.14, 8, 'wood', 0x5a4632); B.boxC(x, ground5(x, z) + 7.4, z, 1.6, 0.1, 0.1, 'wood', 0x5a4632); }
  B.build(mats, root);
  // --- trees (instanced)
  const rng = mulberry32(55), mtx = [[], []];
  for (let i = 0; i < 420; i++) {
    const a = rng() * Math.PI * 2, r = 46 + Math.pow(rng(), 0.8) * 200;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < -30 && Math.abs(x - 4) < 9) continue; // keep the road clear
    if (z > 26 && Math.abs(x + 1) < 6) continue;
    const s = 0.7 + rng() * 0.8;
    mtx[rng() < 0.5 ? 0 : 1].push(new THREE.Matrix4().compose(new THREE.Vector3(x, ground5(x, z) - 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.28, 0)), new THREE.Vector3(s, s * (0.85 + rng() * 0.3), s)));
  }
  [W.geo.tree1, W.geo.tree2].forEach((g, k) => {
    const im = new THREE.InstancedMesh(g, W.mat.tree, mtx[k].length);
    mtx[k].forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
  });
  const scrub = [];
  for (let i = 0; i < 260; i++) {
    const x = (rng() - 0.5) * 180, z = (rng() - 0.5) * 180;
    if (Math.abs(x) < 9 && Math.abs(z) < 6) continue;
    const s = 0.6 + rng() * 0.9;
    scrub.push(new THREE.Matrix4().compose(new THREE.Vector3(x, ground5(x, z) - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.28, 0)), new THREE.Vector3(s, s, s)));
  }
  const sim = new THREE.InstancedMesh(W.geo.scrub, W.mat.scrub, scrub.length);
  scrub.forEach((m, i) => sim.setMatrixAt(i, m)); sim.computeBoundingSphere(); root.add(sim);
  // --- animated: dish + radar antenna
  const db = new Builder();
  const prof = []; for (let i = 0; i <= 12; i++) { const r = (i / 12) * 2.7; prof.push(new THREE.Vector2(r, (r * r) / 9)); }
  const dishGeo = new THREE.LatheGeometry(prof, 28); dishGeo.rotateX(Math.PI / 2);
  db.add(dishGeo, 'dish', 0xffffff, null);
  db.cyl(0, 0, 0.0, 0.25, 0.3, 0.5, 'steel', 0x6f7375, Math.PI / 2, 0, 0);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; db.add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), 'steel', 0x7a7e80, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 1.0, Math.sin(a) * 1.0, -1.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.45, -Math.cos(a) * 0.45, 0)), new THREE.Vector3(1, 1, 1))); }
  db.cyl(0, 0, -2.05, 0.14, 0.1, 0.35, 'steel', 0x3a3d3f, Math.PI / 2, 0, 0);
  const dishYaw = new THREE.Group(); dishYaw.position.set(-3.5, R + 1.6, -0.5); root.add(dishYaw);
  const dishEl = new THREE.Group(); dishYaw.add(dishEl); db.build(mats, dishEl);
  S.dish = { yaw: dishYaw, el: dishEl, aimYaw: 2.6, aimEl: 0.55, off: 0 };
  dishYaw.rotation.y = 2.6; dishEl.rotation.x = 0.55;
  const rb = new Builder();
  rb.boxC(0, 0, 0, 7, 0.9, 0.18, 'steel', 0x8b8f90); rb.boxC(0, 0.2, 0.25, 6.6, 0.12, 0.3, 'steel', 0x6d7173);
  rb.cyl(0, -0.6, 0, 0.18, 0.22, 1.0, 'steel', 0x45484a);
  const radar = new THREE.Group(); radar.position.set(mx, MH + 0.6, mz); root.add(radar); rb.build(mats, radar);
  S.radar = radar;
  // interior light (enabled when powered)
  const pl = new THREE.PointLight(0xffd9a0, 0, 14, 1.6); pl.position.set(0, 3.4, 0); root.add(pl); S.lamp = pl;
}

export function stationColliders() {
  for (const c of S.cols) { const b = addBox(c[0], c[1], c[2], c[3], c[4], c[5], c[6] || 'concrete'); if (c[7]) b.tag = c[7]; }
  for (const c of S.cover) c.used = null;
}

export function setPower(on) {
  S.powered = on;
  S.mats.light.emissiveIntensity = on ? 5 : 0;
  S.mats.screen.emissiveIntensity = on ? 2.2 : 0;
  S.lamp.intensity = on ? 6 : 0;
}

export function updateStation(dt) {
  if (!S.built) return;
  if (S.powered) S.radar.rotation.y += dt * 1.1;
  const d = S.dish;
  const ty = d.aimYaw + d.off, te = d.aimEl - d.off * 0.6;
  d.yaw.rotation.y += (ty - d.yaw.rotation.y) * Math.min(1, dt * 3);
  d.el.rotation.x += (te - d.el.rotation.x) * Math.min(1, dt * 3);
}

export function hideStation() { if (S.root) S.root.visible = false; }
