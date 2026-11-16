import { G, THREE, clamp, damp, lerp, smooth, fwdYaw, rightYaw, yawOf, angDiff, UP } from './core.js';
import { TEX, triUV, mat4, rbox } from './geom.js';
import { TX } from './mats.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { raySegment, raySphere, groundY } from './physics.js';

// joints
export const J = { Hc: 0, Ne: 1, P: 2, SL: 3, SR: 4, EL: 5, ER: 6, HL: 7, HR: 8, HPL: 9, HPR: 10, KL: 11, KR: 12, AL: 13, AR: 14, W0: 15, W1: 16, TL: 17, TR: 18 };
const NJ = 19;
const RAD = [0.13, 0.1, 0.13, 0.09, 0.09, 0.06, 0.06, 0.05, 0.05, 0.09, 0.09, 0.07, 0.07, 0.06, 0.06, 0.04, 0.04, 0.05, 0.05];
const BONES = [
  [J.Hc, J.Ne], [J.Ne, J.SL], [J.Ne, J.SR], [J.SL, J.SR], [J.SL, J.EL], [J.EL, J.HL], [J.SR, J.ER], [J.ER, J.HR],
  [J.Ne, J.P], [J.P, J.HPL], [J.P, J.HPR], [J.HPL, J.HPR], [J.HPL, J.KL], [J.KL, J.AL], [J.HPR, J.KR], [J.KR, J.AR],
  [J.SL, J.P], [J.SR, J.P], [J.SL, J.HPL], [J.SR, J.HPR], [J.SL, J.HPR], [J.SR, J.HPL], [J.Hc, J.SL], [J.Hc, J.SR],
  [J.AL, J.TL], [J.AR, J.TR], [J.KL, J.TL], [J.KR, J.TR], [J.W0, J.W1],
];
const MINS = [[J.HL, J.SL, 0.2], [J.HR, J.SR, 0.2], [J.AL, J.HPL, 0.32], [J.AR, J.HPR, 0.32], [J.KL, J.KR, 0.14], [J.AL, J.AR, 0.12], [J.Hc, J.HPL, 0.62], [J.Hc, J.HPR, 0.62], [J.HL, J.P, 0.12], [J.HR, J.P, 0.12]];
const L_UA = 0.29, L_FA = 0.27, L_TH = 0.44, L_SH = 0.44;
export const MW = 0.3, MS = 0.42, MD = 0.85; // melee timing: wind-up end, strike (hit) time, end

// ---------- part geometry ----------
class PB {
  constructor() { this.list = []; }
  add(geo, color, m, camo = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    triUV(g, 2.6);
    const n = g.attributes.position.count, c = new THREE.Color(color);
    const col = new Float32Array(n * 3), cm = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; cm[i] = camo; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aCamo', new THREE.BufferAttribute(cm, 1));
    this.list.push(g); return this;
  }
  box(cx, cy, cz, w, h, d, color, camo = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, mat4(cx, cy, cz, rx, ry, rz), camo); }
  cap(cx, cy, cz, r, len, color, camo = 1, sx = 1, sz = 1, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 12), color, mat4(cx, cy, cz, rx, ry, rz, sx, 1, sz), camo); }
  rb(cx, cy, cz, w, h, d, color, camo = 0, rx = 0, ry = 0, rz = 0, r) { return this.add(rbox(w, h, d, r ?? Math.min(0.018, Math.min(w, h, d) * 0.3)), color, mat4(cx, cy, cz, rx, ry, rz), camo); }
  sph(cx, cy, cz, r, color, camo = 0, sx = 1, sy = 1, sz = 1, half = false) {
    const g = half ? new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 16, 12);
    return this.add(g, color, mat4(cx, cy, cz, 0, 0, 0, sx, sy, sz), camo);
  }
  cyl(cx, cy, cz, r0, r1, h, color, camo = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(r0, r1, h, 12), color, mat4(cx, cy, cz, rx, ry, rz), camo); }
  geo() { const g = mergeGeometries(this.list, false); g.computeBoundingSphere(); return g; }
}

function camoMaterial(tx) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.map, normalMap: tx.normalMap, roughnessMap: tx.orm, roughness: 1, metalness: 0, envMapIntensity: 0.9 });
  m.normalScale.set(1.2, 1.2);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCamo;\nvarying float vCamo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamo = aCamo;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCamo;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n diffuseColor *= mix(vec4(1.0), sampledDiffuseColor, vCamo);\n#endif');
  };
  return m;
}

function faction(name) {
  const jg = name === 'jg', kr = name === 'kr', ru = name === 'ru' || jg || kr;
  const C = jg
    ? { cloth: 0x8d938c, rig: 0x3a3e3a, pouch: 0x2f3330, belt: 0x252725, boot: 0x1e1d1c, glove: 0x2a2b2c, metal: 0x1d1e1f, furn: 0x1d1e1f }
    : kr // Colonel Krasin: dark grey-brown greatcoat, black leather, plain cloth (no camo)
    ? { cloth: 0x45433c, rig: 0x2b2925, pouch: 0x2b2925, belt: 0x1b1916, boot: 0x121110, glove: 0x1a1918, metal: 0x1d1e1f, furn: 0x3a2a20 }
    : ru
    ? { cloth: 0xffffff, rig: 0xaeb4b8, pouch: 0x969da1, belt: 0x4f5458, boot: 0x2b2826, glove: 0x3c3d3f, metal: 0x2a2b2c, furn: 0x5a3a2a }
    : { cloth: 0xffffff, rig: 0x5a5c44, pouch: 0x8b7a5a, belt: 0x4d4a3c, boot: 0x8a7556, glove: 0x9a8a68, metal: 0x232426, furn: 0x1e1f20 };
  const K = jg ? 1.32 : 1; // juggernaut: bulkier limbs
  const P = {};
  if (jg) { // bomb-suit style armor: slab plates, collar, full helmet with visor
    const b = new PB();
    b.cap(0, 0.2, 0, 0.21, 0.3, C.cloth, 1, 1.25, 0.95);
    b.box(0, -0.05, 0, 0.42, 0.2, 0.3, C.cloth, 1);
    b.box(0, 0.26, -0.17, 0.44, 0.42, 0.1, C.rig, 0);
    b.box(0, 0.28, 0.17, 0.44, 0.42, 0.1, C.rig, 0);
    for (const sx of [-1, 1]) b.box(sx * 0.27, 0.42, 0, 0.16, 0.12, 0.36, C.rig, 0, 0, 0, sx * 0.35);
    b.box(0, 0.5, 0, 0.36, 0.1, 0.34, C.pouch, 0);
    b.box(0, 0.02, -0.15, 0.38, 0.14, 0.08, C.pouch, 0);
    P.torso = b.geo();
    const hb = new PB();
    hb.cyl(0, 0.06, 0, 0.11, 0.12, 0.12, C.rig, 0);
    hb.sph(0, 0.19, 0, 0.17, C.rig, 0, 1, 1.05, 1.08);
    hb.box(0, 0.19, -0.13, 0.2, 0.11, 0.08, 0x0c0e10, 0);
    hb.box(0, 0.12, -0.15, 0.16, 0.06, 0.06, C.pouch, 0);
    P.head_jg = hb.geo();
  }
  const dk = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
  const face2 = (b, o) => {
    const sk = o.skin;
    b.cyl(0, 0.05, 0, 0.058 * (o.neck || 1), 0.064 * (o.neck || 1), 0.1, sk, 0);
    b.sph(0, 0.17, 0, 0.104, sk, 0, o.w || 1, 1.12, 1.04);
    b.rb(0, 0.112, -0.05, 0.128 * (o.jaw || 1), 0.072, 0.1, sk, 0);                 // jaw
    b.rb(0, 0.163, -0.113, 0.026 * (o.nose || 1), 0.05, 0.034, dk(sk, 0.97), 0);    // nose
    b.rb(0, 0.142, -0.118, 0.018 * (o.nose || 1), 0.012, 0.02, dk(sk, 0.9), 0);
    b.rb(0, 0.122, -0.106, 0.05, 0.012, 0.016, o.lips || dk(sk, 0.78), 0);           // lips
    for (const sx of [-1, 1]) {
      b.sph(sx * 0.036, 0.184, -0.094, 0.014, 0xe9e6df, 0, 1, 0.75, 0.8);            // eye white
      b.sph(sx * 0.036, 0.184, -0.104, 0.0075, o.iris || 0x2a2018, 0);                 // iris
      b.rb(sx * 0.038, 0.204, -0.104, 0.04, 0.01, 0.016, o.brow || 0x2a2018, 0, 0, 0, sx * (o.browTilt || 0.12)); // brow
      b.rb(sx * 0.104, 0.172, 0.004, 0.022, 0.052, 0.034, sk, 0);                     // ear
    }
    if (o.hair) b.sph(0, 0.19, 0.008, 0.108, o.hair, 0, 1.02, 0.98, 1.06, true);
    if (o.beard) { b.rb(0, 0.103, -0.07, 0.132, 0.07, 0.07, o.beard, 0); for (const sx of [-1, 1]) b.rb(sx * 0.078, 0.14, -0.035, 0.03, 0.08, 0.07, o.beard, 0); }
    if (o.stache) b.rb(0, 0.133, -0.112, 0.06, 0.014, 0.016, o.stache, 0);
    if (o.chops) for (const sx of [-1, 1]) b.rb(sx * 0.07, 0.125, -0.07, 0.03, 0.075, 0.05, o.chops, 0);
    if (o.goatee) b.rb(0, 0.095, -0.098, 0.04, 0.04, 0.03, o.goatee, 0);
    if (o.shades) { b.rb(0, 0.186, -0.112, 0.12, 0.028, 0.012, 0x0c0d0f, 0); b.rb(0, 0.196, -0.11, 0.13, 0.006, 0.014, 0x2a2a2a, 0); }
  };
  if (kr) { // greatcoat to the knees, Sam Browne belt, shoulder boards; officer's peaked cap
    const b = new PB(), brass = 0xa88a44;
    b.cap(0, 0.22, 0, 0.172, 0.3, C.cloth, 0, 1.22, 0.86);
    b.rb(0, -0.05, 0, 0.36, 0.2, 0.25, C.cloth, 0);
    for (const sx of [-1, 1]) b.sph(sx * 0.168, 0.455, 0.0, 0.086, C.cloth, 0, 1, 0.9, 1);
    b.cyl(0, -0.34, 0.01, 0.2, 0.27, 0.56, C.cloth, 0);                      // coat skirt
    b.cyl(0, -0.615, 0.01, 0.272, 0.272, 0.025, dk(C.cloth, 0.8), 0);
    b.rb(0, 0.5, 0.01, 0.34, 0.08, 0.27, 0x2e2a25, 0);                       // fur collar
    b.rb(0, -0.02, 0, 0.375, 0.06, 0.28, C.belt, 0);
    b.rb(0, -0.02, -0.142, 0.07, 0.05, 0.012, brass, 0);
    b.rb(0.02, 0.24, -0.15, 0.035, 0.52, 0.012, C.belt, 0, 0, 0, -0.55);    // cross strap
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) b.sph(sx * 0.065, 0.07 + i * 0.1, -0.146, 0.012, brass, 0);
    for (const sx of [-1, 1]) { b.rb(sx * 0.15, 0.47, 0, 0.1, 0.014, 0.06, 0x5a4a22, 0); b.sph(sx * 0.15, 0.48, -0.01, 0.01, 0xd8c070, 0); }
    b.rb(0.19, -0.08, -0.04, 0.055, 0.13, 0.09, C.belt, 0);                 // holster
    P.torso = b.geo();
    const hb = new PB();
    face2(hb, { skin: 0xcfa082, stache: 0x8f8a84, brow: 0x7a746e, jaw: 1.06, browTilt: 0.3, lips: 0x9a6a58 });
    hb.cyl(0, 0.262, 0.012, 0.152, 0.118, 0.07, 0x3d4436, 0);               // crown
    hb.sph(0, 0.295, 0.012, 0.15, 0x3d4436, 0, 1, 0.22, 1, true);
    hb.rb(0, 0.3, -0.11, 0.2, 0.06, 0.06, 0x3d4436, 0, -0.5);                // raised front
    hb.cyl(0, 0.22, 0, 0.116, 0.116, 0.046, 0x7a1c1c, 0);                     // red band
    hb.rb(0, 0.205, -0.125, 0.18, 0.014, 0.085, 0x0e0e0e, 0, 0.32);          // visor
    hb.sph(0, 0.245, -0.118, 0.02, brass, 0, 1, 1, 0.5);                      // cockade
    P.head_kras = hb.geo();
  }
  // torso: bone P(0) -> Ne(0.52); -Z = chest
  if (!jg && !kr) {
    const b = new PB();
    b.cap(0, 0.22, 0, 0.165, 0.3, C.cloth, 1, 1.22, 0.82);                 // chest
    b.rb(0, -0.05, 0, 0.34, 0.18, 0.23, C.cloth, 1);                        // hips
    for (const sx of [-1, 1]) b.sph(sx * 0.165, 0.455, 0.0, 0.082, C.cloth, 1, 1, 0.9, 1);   // deltoids
    b.cyl(0, 0.53, 0.01, 0.075, 0.095, 0.07, C.cloth, 1);                   // collar
    b.rb(0, -0.03, 0, 0.36, 0.055, 0.27, C.belt, 0);
    b.rb(0, -0.03, -0.138, 0.06, 0.045, 0.012, 0x6a6a62, 0);              // buckle
    if (ru) {
      b.rb(0, 0.26, -0.135, 0.31, 0.27, 0.06, C.rig, 0);
      b.rb(0, 0.28, 0.135, 0.3, 0.3, 0.05, C.rig, 0);
      for (const sx of [-1, 1]) { b.rb(sx * 0.1, 0.44, 0, 0.065, 0.035, 0.3, C.rig, 0); b.rb(sx * 0.162, 0.21, 0, 0.035, 0.15, 0.24, C.rig, 0); }
      for (const x of [-0.105, 0, 0.105]) { b.rb(x, 0.2, -0.178, 0.085, 0.13, 0.05, C.pouch, 0); b.rb(x, 0.27, -0.182, 0.088, 0.025, 0.056, 0x858b8f, 0); }
      b.rb(0.17, 0.08, -0.06, 0.06, 0.08, 0.07, C.pouch, 0);                 // grenade pouch
      b.rb(0, 0.27, 0.17, 0.26, 0.28, 0.1, 0xa3aaae, 0);                     // pack
      b.rb(0, 0.43, 0.175, 0.24, 0.06, 0.09, 0x8e959a, 0);
    } else {
      b.rb(0, 0.26, -0.138, 0.32, 0.3, 0.06, C.rig, 0);
      b.rb(0, 0.28, 0.14, 0.32, 0.32, 0.06, C.rig, 0);
      for (const sx of [-1, 1]) { b.rb(sx * 0.1, 0.44, 0, 0.065, 0.035, 0.31, C.rig, 0); b.rb(sx * 0.165, 0.2, 0, 0.04, 0.16, 0.27, C.rig, 0); }
      for (const x of [-0.1, 0, 0.1]) { b.rb(x, 0.2, -0.185, 0.078, 0.12, 0.05, C.pouch, 0); b.rb(x, 0.265, -0.19, 0.082, 0.024, 0.056, 0x7a6a4c, 0); }
      b.rb(0, 0.36, -0.178, 0.18, 0.075, 0.04, C.pouch, 0);                 // admin pouch
      b.rb(0, 0.24, 0.185, 0.22, 0.24, 0.05, C.pouch, 0);                   // hydration carrier
      b.rb(0.09, 0.34, 0.2, 0.075, 0.15, 0.06, 0x202020, 0);                // radio
      b.cyl(0.11, 0.48, 0.2, 0.004, 0.004, 0.2, 0x151515, 0);
      b.rb(-0.12, 0.33, -0.18, 0.06, 0.09, 0.04, 0x262626, 0);              // IFAK
      b.rb(0.12, -0.1, 0.13, 0.11, 0.1, 0.06, C.pouch, 0);                  // dump pouch
      b.rb(0.19, -0.09, -0.03, 0.05, 0.13, 0.08, 0x2a2a2a, 0);              // holster
    }
    P.torso = b.geo();
    if (!ru) P.torso_big = P.torso.clone().applyMatrix4(new THREE.Matrix4().makeScale(1.17, 1.02, 1.12));
  }
  // heads: bone Ne(0) -> Hc(0.17); -Z = face
  const face = (b, skin, stubble) => {
    b.cyl(0, 0.05, 0, 0.058, 0.064, 0.1, skin, 0);
    b.sph(0, 0.17, 0, 0.104, skin, 0, 1, 1.12, 1.04);
    b.rb(0, 0.115, -0.05, 0.125, 0.07, 0.1, skin, 0);                       // jaw
    b.rb(0, 0.167, -0.112, 0.024, 0.044, 0.03, skin, 0);                   // nose
    b.rb(0, 0.203, -0.1, 0.13, 0.02, 0.03, new THREE.Color(skin).multiplyScalar(0.8).getHex(), 0); // brow
    for (const sx of [-1, 1]) { b.sph(sx * 0.036, 0.185, -0.096, 0.013, 0x15171a, 0); b.rb(sx * 0.104, 0.17, 0.0, 0.02, 0.05, 0.035, skin, 0); }
    if (stubble) b.rb(0, 0.112, -0.072, 0.12, 0.06, 0.06, stubble, 0);
  };
  if (jg || kr) { /* built above */ } else if (ru) {
    const b = new PB();
    const bal = 0x3a3d40, skin = 0xc9a083;
    face(b, skin, null);
    b.sph(0, 0.172, 0.006, 0.112, bal, 0, 1, 1.12, 1.06);                  // balaclava
    b.rb(0, 0.12, -0.07, 0.13, 0.09, 0.07, bal, 0);
    b.rb(0, 0.186, -0.103, 0.11, 0.032, 0.02, skin, 0);                    // eye slit
    for (const sx of [-1, 1]) b.sph(sx * 0.035, 0.186, -0.11, 0.012, 0x15171a, 0);
    b.sph(0, 0.205, 0, 0.142, 0xffffff, 1, 1, 0.85, 1.08, true);           // helmet w/ snow cover
    b.rb(0, 0.205, 0, 0.29, 0.02, 0.3, 0xe8ecef, 1, 0, 0, 0, 0.01);
    b.rb(0, 0.236, -0.126, 0.19, 0.05, 0.03, 0x1c1f22, 0);                 // goggles on the brim
    for (const sx of [-1, 1]) b.sph(sx * 0.045, 0.236, -0.14, 0.024, 0x2d3b42, 0, 1, 0.8, 0.5);
    P.head_ru = b.geo();
  } else {
    // distinct faces for the named characters
    const helmet = (b, col, opt = {}) => {
      b.sph(0, 0.2, 0, 0.142, col, 1, 1, 0.86, 1.08, true);
      b.rb(0, 0.205, 0.0, 0.27, 0.018, 0.29, dk(col, 0.82), 0, 0, 0, 0, 0.008);
      for (const sx of [-1, 1]) b.rb(sx * 0.133, 0.215, 0.0, 0.02, 0.03, 0.17, 0x2a2a2a, 0);
      if (opt.nvg !== false) b.rb(0, 0.262, -0.13, 0.05, 0.045, 0.035, 0x2a2a2a, 0);
      if (opt.nvgDown) { b.rb(0, 0.236, -0.15, 0.1, 0.04, 0.06, 0x1e1f1d, 0); for (const sx of [-1, 1]) b.cyl(sx * 0.03, 0.236, -0.19, 0.016, 0.016, 0.04, 0x111111, Math.PI / 2, 0, 0); }
      if (opt.goggles) { b.rb(0, 0.255, -0.12, 0.17, 0.04, 0.03, 0x2b2b26, 0); for (const sx of [-1, 1]) b.sph(sx * 0.042, 0.257, -0.135, 0.024, 0x6a5a3a, 0, 1, 0.8, 0.5); }
      b.rb(0, 0.29, 0.1, 0.06, 0.04, 0.05, 0x222222, 0);
      for (const sx of [-1, 1]) b.cyl(sx * 0.117, 0.17, 0, 0.046, 0.046, 0.045, 0x3a3c32, 0, 0, 0, Math.PI / 2);
    };
    const mk = (fn) => { const b = new PB(); fn(b); return b.geo(); };
    const skin = 0xc49a78;
    P.head_helmet = mk((b) => { face2(b, { skin, beard: 0x5a4636 }); helmet(b, 0xb19d78); });
    P.head_cap = mk((b) => { face2(b, { skin, beard: 0x6a5440 }); b.sph(0, 0.205, 0, 0.122, 0x3b3a34, 0, 1, 0.62, 1.06, true); b.rb(0, 0.212, -0.15, 0.16, 0.014, 0.1, 0x34332d, 0); for (const sx of [-1, 1]) b.cyl(sx * 0.118, 0.17, 0, 0.042, 0.042, 0.04, 0x1e1e1e, 0, 0, 0, Math.PI / 2); });
    // Sandman: weathered, grey-flecked full beard, goggles on the helmet
    P.head_sand = mk((b) => { face2(b, { skin: 0xc3946f, beard: 0x77706a, brow: 0x5a5550, jaw: 1.05, browTilt: 0.2 }); helmet(b, 0xa89474, { goggles: true }); });
    // Truck: big, dark skin, broad jaw and nose, NVGs flipped down, no beard
    P.head_truck = mk((b) => { face2(b, { skin: 0x6b4630, jaw: 1.18, nose: 1.3, w: 1.08, neck: 1.25, lips: 0x4a2c20, brow: 0x1a120c, iris: 0x140c08 }); helmet(b, 0x8f8a6a, { nvgDown: false }); b.rb(0, 0.11, -0.03, 0.15, 0.03, 0.12, 0x2a2a24, 0); });
    // Grinch: younger, sunglasses, backwards ball cap, ginger goatee
    P.head_grinch = mk((b) => { face2(b, { skin: 0xd8ab8b, goatee: 0x9a5a32, stache: 0x9a5a32, brow: 0x8a5030, shades: true }); b.sph(0, 0.205, 0, 0.12, 0x3d4a3a, 0, 1, 0.62, 1.06, true); b.rb(0, 0.212, 0.15, 0.15, 0.014, 0.09, 0x36412f, 0); for (const sx of [-1, 1]) b.cyl(sx * 0.118, 0.17, 0, 0.042, 0.042, 0.04, 0x1e1e1e, 0, 0, 0, Math.PI / 2); b.rb(0, 0.212, 0.005, 0.25, 0.012, 0.02, 0x1e1e1e, 0); });
    // Price: boonie hat and mutton-chop moustache
    P.head_price = mk((b) => { face2(b, { skin: 0xc79878, chops: 0x6e5a44, stache: 0x6e5a44, brow: 0x5a4a3a, jaw: 1.04 }); b.sph(0, 0.205, 0, 0.122, 0x6a6a48, 1, 1, 0.68, 1.04, true); b.cyl(0, 0.212, 0, 0.2, 0.2, 0.012, 0x6a6a48, 1); b.cyl(0, 0.22, 0, 0.124, 0.124, 0.03, 0x5a5a3c, 0); });
    // Yuri: short dark hair, clean shaven
    P.head_yuri = mk((b) => { face2(b, { skin: 0xd3a888, hair: 0x2a2018, brow: 0x241a12 }); });
    // Sokolov (seen only in the epilogue): fur ushanka
    P.head_soko = mk((b) => { face2(b, { skin: 0xd6ad8f, stache: 0x4a3a2a, brow: 0x3a2a1c }); b.sph(0, 0.205, 0, 0.13, 0x5a4a3c, 0, 1.05, 0.75, 1.08, true); for (const sx of [-1, 1]) b.rb(sx * 0.12, 0.15, 0.0, 0.03, 0.12, 0.12, 0x5a4a3c, 0); b.rb(0, 0.255, -0.1, 0.2, 0.05, 0.05, 0x5a4a3c, 0); });
  }
  // limbs
  P.uarm = new PB().cap(0, L_UA / 2, 0, 0.066 * K, L_UA - 0.06, C.cloth, 1).rb(0, L_UA * 0.55, -0.06 * K, 0.06, 0.08, 0.02, C.cloth, 1).geo();
  P.farm = new PB().cap(0, L_FA / 2, 0, 0.056 * K, L_FA - 0.05, C.cloth, 1)
    .cyl(0, L_FA - 0.085, 0, 0.061 * K, 0.059 * K, 0.035, C.cloth, 1)
    .add(new THREE.CylinderGeometry(0.06, 0.058, 0.06, 12), C.glove, mat4(0, L_FA - 0.03, 0), 0).geo();
  {
    const hb = new PB().rb(0, 0.04, 0.005, 0.075, 0.08, 0.09, C.glove, 0);
    for (let k = 0; k < 4; k++) hb.cap(-0.026 + k * 0.017, 0.095, -0.01, 0.0105, 0.035, C.glove, 0, 1, 1, 0.5, 0, 0);
    hb.cap(0.035, 0.06, -0.035, 0.011, 0.03, C.glove, 0, 1, 1, 0.9, 0, 0);
    P.hand = hb.geo();
  }
  {
    const b = new PB().cap(0, L_TH / 2, 0, 0.088 * K, L_TH - 0.08, C.cloth, 1);
    b.rb(0, L_TH * 0.55, -0.075 * K, 0.1, 0.12, 0.04, C.cloth, 1);          // cargo pocket
    if (!ru) b.rb(0, L_TH - 0.02, -0.07, 0.09, 0.1, 0.04, 0x3d3f33, 0);
    P.thigh = b.geo();
  }
  {
    const b = new PB().cap(0, L_SH / 2, 0, 0.072 * K, L_SH - 0.06, C.cloth, 1);
    b.cyl(0, L_SH - 0.08, 0, 0.08 * K, 0.078 * K, 0.18, C.boot, 0);
    if (!ru || jg) b.rb(0, 0.04, -0.07 * K, 0.1, 0.12, 0.045, jg ? C.rig : 0x2e2f2a, 0);   // knee pad
    P.shin = b.geo();
  }
  P.foot = new PB().rb(0, 0.075, 0.01, 0.11, 0.28, 0.11, C.boot, 0).rb(0, 0.075, 0.064, 0.122, 0.29, 0.022, 0x1a1a1a, 0).rb(0, 0.2, -0.01, 0.115, 0.06, 0.1, C.boot, 0).geo();
  // rifle: bone W0 (butt) -> W1 (muzzle) 0.85; -Z = weapon top
  {
    const b = new PB();
    if (jg) {
      b.box(0, 0.12, 0.02, 0.05, 0.24, 0.1, C.furn, 0, -0.08);
      b.box(0, 0.4, 0, 0.065, 0.34, 0.09, C.metal, 0);
      b.cyl(0, 0.78, 0, 0.02, 0.02, 0.36, C.metal, 0);
      b.box(0.07, 0.4, 0.06, 0.1, 0.14, 0.14, 0x3a3f36, 0);
      b.box(0, 0.36, 0.1, 0.04, 0.06, 0.1, C.furn, 0, -0.3);
    } else if (ru) {
      b.box(0, 0.12, 0.02, 0.045, 0.24, 0.1, C.furn, 0, -0.08);
      b.box(0, 0.38, 0, 0.055, 0.28, 0.08, C.metal, 0);
      b.box(0, 0.6, 0.0, 0.06, 0.16, 0.07, C.furn, 0);
      b.cyl(0, 0.76, 0.0, 0.012, 0.012, 0.2, C.metal, 0);
      b.box(0, 0.43, 0.12, 0.045, 0.06, 0.17, 0x6a3a26, 0, 0.35);
      b.box(0, 0.47, 0.2, 0.04, 0.06, 0.08, 0x6a3a26, 0, 0.6);
      b.box(0, 0.3, 0.08, 0.035, 0.05, 0.1, C.furn, 0, -0.3);
    } else {
      b.box(0, 0.11, 0.0, 0.045, 0.2, 0.08, C.furn, 0);
      b.box(0, 0.36, 0, 0.055, 0.26, 0.075, C.metal, 0);
      b.box(0, 0.58, 0, 0.06, 0.2, 0.065, 0x3a3a2e, 0);
      b.cyl(0, 0.74, 0, 0.012, 0.012, 0.22, C.metal, 0);
      b.box(0, 0.4, -0.065, 0.04, 0.12, 0.05, 0x111111, 0);
      b.box(0, 0.4, 0.1, 0.04, 0.06, 0.14, 0x2a2a24, 0, 0.12);
      b.box(0, 0.29, 0.075, 0.035, 0.05, 0.09, C.furn, 0, -0.3);
    }
    P.rifle = b.geo();
  }
  // sidearm: bone W0 (hand on the grip) -> W1 (muzzle) 0.2; -Z = top of the slide
  if (!jg) {
    const b = new PB();
    b.box(0, 0.085, -0.036, 0.027, 0.19, 0.034, 0x1b1c1d, 0);
    b.box(0, 0.07, -0.012, 0.025, 0.15, 0.022, 0x252627, 0);
    b.box(0, 0.006, 0.035, 0.027, 0.05, 0.09, 0x161616, 0, 0.22);
    b.box(0, 0.05, 0.012, 0.006, 0.04, 0.025, 0x111111, 0);
    P.pistol = b.geo();
    // combat knife: origin in the fist, blade along +Y; -Z = spine of the blade
    const k = new PB();
    k.box(0, -0.03, 0, 0.024, 0.11, 0.03, 0x1a1a1a, 0);
    k.box(0, 0.028, 0, 0.028, 0.012, 0.056, 0x3a3b3c, 0);
    k.box(0, 0.115, 0.002, 0.005, 0.16, 0.03, 0x9ea4a8, 0);
    k.box(0, 0.2, 0.008, 0.005, 0.03, 0.018, 0x9ea4a8, 0, 0.5);
    P.knife = k.geo();
  }
  // enemy loadouts (h.gunKind): all along bone W0 (butt / rear grip at the shoulder) -> +Y (muzzle); -Z = top; lengths in GK
  if (ru && !jg && !kr) {
    const blk = 0x1d1e1f, wood = C.furn, met = C.metal;
    const grip = (b, y, c = blk) => b.box(0, y, 0.075, 0.032, 0.05, 0.095, c, 0, -0.32);
    { // PP-19 Bizon: folding skeleton stock, helical magazine under the barrel
      const b = new PB();
      b.box(0, 0.07, 0.025, 0.026, 0.15, 0.022, blk, 0); b.box(0, 0.07, -0.02, 0.026, 0.15, 0.018, blk, 0);
      b.box(0, 0.28, 0, 0.05, 0.26, 0.07, met, 0);
      b.cyl(0, 0.41, 0.066, 0.034, 0.034, 0.3, blk, 0);
      b.cyl(0, 0.56, 0, 0.013, 0.013, 0.14, met, 0);
      b.box(0, 0.5, -0.045, 0.012, 0.025, 0.03, met, 0); b.box(0, 0.26, -0.045, 0.022, 0.03, 0.02, met, 0);
      grip(b, 0.22);
      P.g_smg = b.geo();
    }
    { // Saiga-12: AK pattern, polymer furniture, straight box magazine, thick barrel
      const b = new PB();
      b.box(0, 0.12, 0.02, 0.045, 0.24, 0.1, blk, 0, -0.08);
      b.box(0, 0.38, 0, 0.062, 0.28, 0.088, met, 0);
      b.box(0, 0.6, 0, 0.07, 0.18, 0.08, blk, 0);
      b.cyl(0, 0.82, 0, 0.02, 0.02, 0.27, met, 0);
      b.cyl(0, 0.95, 0, 0.026, 0.026, 0.03, met, 0);
      b.box(0, 0.44, 0.14, 0.055, 0.085, 0.19, blk, 0, 0.12);
      grip(b, 0.3);
      P.g_shotgun = b.geo();
    }
    { // PKM: skeleton stock, long receiver, 100-round box on the side, fluted barrel, carry handle, folded bipod
      const b = new PB();
      b.box(0, 0.11, 0.03, 0.04, 0.22, 0.12, wood, 0, -0.06);
      b.box(0, 0.42, 0, 0.068, 0.38, 0.092, met, 0);
      b.box(0.05, 0.44, 0.12, 0.08, 0.15, 0.13, 0x45493a, 0);
      b.cyl(0, 0.84, 0, 0.017, 0.017, 0.5, met, 0);
      b.cyl(0, 0.78, 0.035, 0.01, 0.01, 0.36, met, 0);
      b.cyl(0, 1.1, 0, 0.022, 0.022, 0.06, met, 0);
      b.box(0, 0.9, 0.045, 0.035, 0.3, 0.016, met, 0);
      b.box(0, 0.64, -0.065, 0.016, 0.11, 0.022, met, 0);
      grip(b, 0.3, wood);
      P.g_pkm = b.geo();
    }
    { // RPG-7: tube from behind the shoulder, wooden heat shield, venturi, PG-7 warhead
      const b = new PB(), olive = 0x3d4a33;
      b.cyl(0, 0.2, 0, 0.03, 0.03, 1.0, olive, 0);
      b.cyl(0, 0.2, 0, 0.043, 0.043, 0.26, wood, 0);
      b.cyl(0, -0.34, 0, 0.034, 0.056, 0.13, met, 0);
      b.cyl(0, 0.76, 0, 0.045, 0.03, 0.12, olive, 0);
      b.sph(0, 0.85, 0, 0.052, olive, 0, 1, 0.9, 1);
      b.cyl(0, 0.95, 0, 0.012, 0.04, 0.12, olive, 0);
      b.box(-0.045, 0.24, -0.045, 0.028, 0.12, 0.04, blk, 0);
      b.box(0, 0.12, 0.07, 0.03, 0.04, 0.1, blk, 0, -0.2); b.box(0, 0.32, 0.07, 0.03, 0.04, 0.1, blk, 0, -0.2);
      P.g_rpg = b.geo();
    }
    { // SVD: thumbhole wooden stock, long thin barrel, PSO-1 scope
      const b = new PB();
      b.box(0, 0.12, 0.035, 0.04, 0.24, 0.11, wood, 0); b.box(0, 0.16, -0.035, 0.036, 0.13, 0.03, wood, 0);
      b.box(0, 0.4, 0, 0.05, 0.3, 0.075, met, 0);
      b.box(0, 0.64, 0, 0.056, 0.22, 0.066, wood, 0);
      b.cyl(0, 0.93, 0, 0.011, 0.011, 0.46, met, 0);
      b.cyl(0, 1.15, 0, 0.017, 0.017, 0.05, met, 0);
      b.cyl(0, 0.42, -0.088, 0.021, 0.021, 0.24, blk, 0); b.cyl(0, 0.555, -0.088, 0.028, 0.026, 0.035, blk, 0);
      b.box(0, 0.42, -0.052, 0.02, 0.08, 0.03, blk, 0);
      b.box(0, 0.45, 0.1, 0.04, 0.06, 0.11, met, 0, 0.15);
      grip(b, 0.3, wood);
      P.g_dmr = b.geo();
    }
  }
  const mat = camoMaterial(ru ? TX.camoRU : TX.camoUS);
  if (jg) mat.color.setRGB(0.55, 0.58, 0.55);
  if (kr) mat.map = null;
  return { P, mat };
}

const PAIRS = ['uarm', 'farm', 'hand', 'thigh', 'shin', 'foot'];
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export const HR = { f: {} };
export function initHumans() {
  for (const [name, cap] of [['ru', 72], ['us', 4], ['jg', 3], ['kr', 2]]) {
    const { P, mat } = faction(name);
    const meshes = {};
    for (const [part, geo] of Object.entries(P)) {
      const n = PAIRS.includes(part) ? cap * 2 : cap;
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      G.scene.add(im); meshes[part] = im;
    }
    HR.f[name] = { meshes, cap, free: Array.from({ length: cap }, (_, i) => cap - 1 - i), used: new Set(), list: Object.values(meshes), guns: GUNS.filter((g) => meshes[g]) };
  }
}
// third-person gun per h.gunKind: instanced part, length W0 -> muzzle (W1), trigger / support hand positions along the gun
const GUNS = ['rifle', 'g_smg', 'g_shotgun', 'g_pkm', 'g_rpg', 'g_dmr'];
const GPART = { rifle: 'rifle', smg: 'g_smg', shotgun: 'g_shotgun', pkm: 'g_pkm', rpg: 'g_rpg', dmr: 'g_dmr' };
export const GK = {
  rifle: { len: 0.85, g1: 0.24, g2: 0.5, up: 0 }, smg: { len: 0.63, g1: 0.22, g2: 0.4, up: 0 }, shotgun: { len: 0.97, g1: 0.26, g2: 0.55, up: 0 },
  pkm: { len: 1.13, g1: 0.26, g2: 0.6, up: 0 }, rpg: { len: 1.0, g1: 0.12, g2: 0.32, up: 0.07 }, dmr: { len: 1.17, g1: 0.26, g2: 0.6, up: 0 },
};

function allocSlot(fname) {
  const f = HR.f[fname];
  if (!f.free.length) { // recycle the oldest corpse
    const corpse = G.humans.find((h) => h.faction === fname && !h.alive);
    if (corpse) corpse.remove(); else return -1;
  }
  const s = f.free.pop(); f.used.add(s); return s;
}

// ---------- helpers ----------
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
function ik2(S, Tg, l1, l2, pole, outE, outH) {
  _d.subVectors(Tg, S); let dist = _d.length();
  const maxD = l1 + l2 - 0.002;
  if (dist > maxD) { _d.multiplyScalar(maxD / dist); dist = maxD; }
  if (dist < 0.04) { _d.set(0, -0.04, 0); dist = 0.04; }
  outH.copy(S).add(_d);
  _n.copy(_d).multiplyScalar(1 / dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _p.copy(pole).addScaledVector(_n, -pole.dot(_n));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
  _p.normalize();
  outE.copy(S).addScaledVector(_n, a).addScaledVector(_p, h);
}

const _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4();
function segMatrix(A, B, ref, m = _m) {
  _y.subVectors(B, A);
  if (_y.lengthSq() < 1e-10) _y.set(0, 1, 0);
  _y.normalize();
  _z.copy(ref).addScaledVector(_y, -ref.dot(_y));
  if (_z.lengthSq() < 1e-6) { _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0); }
  _z.normalize().negate();
  _x.crossVectors(_y, _z);
  m.makeBasis(_x, _y, _z); m.setPosition(A);
  return m;
}

const V = () => new THREE.Vector3();
const _f = V(), _r = V(), _tf = V(), _tr = V(), _tu = V(), _a = V(), _s0 = V(), _dir = V(), _wu = V(), _g1 = V(), _g2 = V(), _pole = V(), _fl = V(), _fr = V(), _t1 = V(), _hb = V(), _fw = V(), _mv = V();

export class Human {
  constructor(fname, opts = {}) {
    this.faction = fname; this.headPart = opts.head || (fname === 'ru' ? 'head_ru' : fname === 'jg' ? 'head_jg' : fname === 'kr' ? 'head_kras' : 'head_helmet');
    this.name = opts.name || ''; this.torsoPart = opts.torso || null;
    this.slot = allocSlot(fname);
    this.j = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.lj = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.pos = V(); this.vel = V(); this.yaw = 0; this.aim = V().set(0, 0, -1);
    this.aimT = 0; this.aimTarget = 0; this.crouch = 0; this.crouchT = 0; this.phase = Math.random();
    this.onGround = false; this.sit = null; this.flinch = 0; this.flinchSide = 1; this.recoil = 0;
    this.alive = true; this.hp = opts.hp || 100; this.rag = null; this.hidden = false; this.noWeapon = false;
    this.headFwd = V().set(0, 0, -1); this.bodyFwd = V().set(0, 0, -1);
    this.weaponUp = V().set(0, 1, 0);
    this.deadT = 0; this.carIdx = -1; this.invuln = !!opts.invuln;
    this.firstPose = true;
    this.gunKind = opts.gunKind || null; this.meleeT = -1; this.meleeKind = 'butt'; this.downed = false; this.down = null; this.dropM = null;
    G.humans.push(this);
  }
  remove() {
    const f = HR.f[this.faction];
    this.writeZero();
    if (this.slot >= 0) { f.used.delete(this.slot); f.free.push(this.slot); }
    this.slot = -1;
    const i = G.humans.indexOf(this); if (i >= 0) G.humans.splice(i, 1);
    this.removed = true;
  }
  writeZero() {
    if (this.slot < 0) return;
    const f = HR.f[this.faction];
    for (const [part, im] of Object.entries(f.meshes)) {
      if (PAIRS.includes(part)) { im.setMatrixAt(this.slot * 2, ZERO); im.setMatrixAt(this.slot * 2 + 1, ZERO); }
      else im.setMatrixAt(this.slot, ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- animated pose
  animate(dt) {
    const j = this.j;
    for (let i = 0; i < NJ; i++) this.lj[i].copy(j[i]);
    const fwd = fwdYaw(this.yaw, _f), right = rightYaw(this.yaw, _r);
    _a.copy(this.aim); if (_a.lengthSq() < 1e-6) _a.copy(fwd); _a.normalize();
    const dy = clamp(angDiff(this.yaw, yawOf(_a)), -1.1, 1.1);
    // melee (rifle butt / knife): wind-up 0-MW, strike MW-MS, hold, recovery MS+0.04-MD (seconds, h.meleeT advanced here)
    let mk = 0, ms = 0, mw = 0;
    if (this.meleeT >= 0) {
      const u = (this.meleeT += dt);
      if (u >= MD) this.meleeT = -1;
      else { mw = smooth(u / MW); ms = smooth((u - MW) / (MS - MW)); mk = mw * (1 - smooth((u - MS - 0.04) / (MD - MS - 0.04))); }
    }
    const tYaw = this.yaw + dy * 0.8 + mk * lerp(-0.45, 0.3, ms);
    const tf = fwdYaw(tYaw, _tf), tr = rightYaw(tYaw, _tr);
    const surf = this.onGround ? G.v : 0;
    const gvx = this.vel.x, gvz = this.vel.z - surf;
    const speed = this.sit ? 0 : Math.hypot(gvx, gvz);
    if (speed > 0.05) _mv.set(gvx / speed, 0, gvz / speed); else _mv.copy(fwd);
    this.crouch = damp(this.crouch, this.crouchT, 9, dt);
    this.aimT = damp(this.aimT, this.aimTarget, 7, dt);
    this.flinch = damp(this.flinch, 0, 6, dt);
    this.recoil = damp(this.recoil, 0, 18, dt);
    const c = this.sit ? 0 : this.crouch;
    // smoothed locomotion speed: avoids legs snapping between idle and gait when velocity flickers
    this.spd = this.firstPose ? speed : damp(this.spd ?? 0, speed, 9, dt);
    const sp = this.spd;
    if (speed > 0.05) this.mvS = (this.mvS || new THREE.Vector3().copy(_mv)).lerp(_mv, Math.min(1, dt * 10)).normalize();
    if (this.mvS) _mv.copy(this.mvS);
    const S = clamp(0.38 + sp * 0.2, 0.4, 1.3);
    if (sp > 0.15) this.phase += (sp * dt) / (2 * S);
    const walkW = clamp((sp - 0.12) / 0.8, 0, 1) * (1 - c * 0.7);
    const run = clamp((sp - 3) / 2, 0, 1);
    const root = this.pos;
    // pelvis
    if (this.sit) j[J.P].copy(this.sit.seat);
    else j[J.P].set(root.x, root.y + lerp(0.98, 0.56, c) - Math.abs(Math.sin(this.phase * Math.PI * 2)) * 0.045 * walkW, root.z);
    const aimPitch = Math.asin(clamp(_a.y, -1, 1));
    let pitch = this.sit ? 0.28 : 0.05 + c * 0.2 + run * 0.22 * (1 - this.aimT) - aimPitch * 0.25 * this.aimT - this.flinch * 0.5 + mk * lerp(-0.12, 0.38, ms);
    _tu.copy(UP).multiplyScalar(Math.cos(pitch)).addScaledVector(tf, Math.sin(pitch));
    if (this.flinch) _tu.addScaledVector(tr, this.flinchSide * this.flinch * 0.3).normalize();
    j[J.Ne].copy(j[J.P]).addScaledVector(_tu, 0.52);
    _hb.copy(_tu).multiplyScalar(0.9).addScaledVector(_a, 0.12).addScaledVector(tr, 0.05 * this.aimT).normalize();
    j[J.Hc].copy(j[J.Ne]).addScaledVector(_hb, 0.17);
    j[J.SL].copy(j[J.Ne]).addScaledVector(tr, -0.19).addScaledVector(_tu, -0.05);
    j[J.SR].copy(j[J.Ne]).addScaledVector(tr, 0.19).addScaledVector(_tu, -0.05);
    j[J.HPL].copy(j[J.P]).addScaledVector(right, -0.1).addScaledVector(UP, -0.05);
    j[J.HPR].copy(j[J.P]).addScaledVector(right, 0.1).addScaledVector(UP, -0.05);
    // weapon
    const at = this.aimT, gk = GK[this.gunKind] || GK.rifle;
    _s0.copy(j[J.SR]).addScaledVector(tf, lerp(0.16, 0.04, at)).addScaledVector(_tu, lerp(-0.2, -0.03, at) + gk.up * at).addScaledVector(tr, lerp(0.0, -0.06, at));
    _dir.copy(tf).multiplyScalar(0.85).addScaledVector(UP, -0.45).addScaledVector(tr, -0.32).normalize();
    _dir.lerp(_a, at).normalize();
    _s0.addScaledVector(_dir, -0.06 * this.recoil);
    if (mk > 0) { // melee: blend the gun from the carry pose into the wind-up / strike pose
      const ne = j[J.Ne];
      if (this.meleeKind === 'knife') { // rifle hangs in the left hand, low; the right hand stabs (see _g1 below)
        _t1.copy(ne).addScaledVector(tr, -0.12).addScaledVector(UP, -0.5).addScaledVector(tf, 0.12);
        _hb.copy(tf).multiplyScalar(0.5).addScaledVector(UP, -0.85).addScaledVector(tr, -0.1).normalize();
      } else { // butt stroke: rifle cocked back over the right shoulder, then the butt is driven forward at face height
        _t1.copy(ne).addScaledVector(tf, lerp(0.02, 0.56, ms)).addScaledVector(tr, lerp(0.24, 0.04, ms)).addScaledVector(UP, lerp(-0.16, 0.04, ms));
        _hb.copy(UP).multiplyScalar(lerp(0.7, 0.62, ms)).addScaledVector(tf, lerp(-0.42, -0.6, ms)).addScaledVector(tr, lerp(0.35, 0.28, ms)).normalize();
      }
      _s0.lerp(_t1, mk); _dir.lerp(_hb, mk).normalize();
    }
    j[J.W0].copy(_s0); j[J.W1].copy(_s0).addScaledVector(_dir, gk.len);
    _wu.copy(UP).addScaledVector(_dir, -_dir.y);
    if (_wu.lengthSq() < 1e-4) _wu.copy(tf).negate(); _wu.normalize();
    this.weaponUp.copy(_wu);
    if (this.grips) {
      _g1.copy(this.grips.R); _g2.copy(this.grips.L);
    } else if (this.sit && this.sit.driver) {
      _g1.copy(this.sit.barR); _g2.copy(this.sit.barL);
      j[J.W0].copy(j[J.Ne]).addScaledVector(tf, 0.18).addScaledVector(tr, -0.1);
      j[J.W1].copy(j[J.W0]).addScaledVector(UP, -0.3).addScaledVector(tr, 0.4);
    } else {
      _g1.copy(_s0).addScaledVector(_dir, gk.g1).addScaledVector(_wu, -0.075);
      _g2.copy(_s0).addScaledVector(_dir, gk.g2).addScaledVector(_wu, -0.045);
      if (mk > 0 && this.meleeKind === 'knife') { // right hand: raised back beside the head, then stabs forward-down
        _g2.lerp(_t1.copy(_s0).addScaledVector(_dir, 0.3), mk);
        _t1.copy(j[J.Ne]).addScaledVector(tr, lerp(0.3, 0.06, ms)).addScaledVector(UP, lerp(0.16, -0.06, ms)).addScaledVector(tf, lerp(-0.08, 0.58, ms));
        _g1.lerp(_t1, mk);
      }
    }
    if (this.sidearm) { // pistol: low ready -> arm(s) extended along the aim (1 = one-handed, 2 = two hands)
      _s0.copy(j[J.SR]).addScaledVector(tr, -0.09 * at).addScaledVector(_tu, lerp(-0.34, -0.03, at)).addScaledVector(tf, lerp(0.2, 0.0, at)).addScaledVector(_a, 0.5 * at);
      _dir.copy(tf).multiplyScalar(0.55).addScaledVector(UP, -0.83).normalize().lerp(_a, at).normalize();
      _s0.addScaledVector(_dir, -0.05 * this.recoil);
      _dir.addScaledVector(UP, 0.25 * this.recoil).normalize();
      j[J.W0].copy(_s0); j[J.W1].copy(_s0).addScaledVector(_dir, 0.2);
      _wu.copy(UP).addScaledVector(_dir, -_dir.y).normalize(); this.weaponUp.copy(_wu);
      _g1.copy(_s0);
      if (this.sidearm === 2) _g2.copy(_s0).addScaledVector(tr, -0.04).addScaledVector(_wu, -0.03);
      else _g2.copy(j[J.SL]).addScaledVector(UP, -0.5).addScaledVector(tf, 0.06).addScaledVector(tr, -0.06);
    }
    if (this.handL) _g2.copy(this.handL); // scripted left-hand target (e.g. hauling a wounded man by the vest)
    _pole.copy(UP).multiplyScalar(-0.8).addScaledVector(tr, 0.75).addScaledVector(tf, -0.2);
    ik2(j[J.SR], _g1, L_UA, L_FA, _pole, j[J.ER], j[J.HR]);
    _pole.copy(UP).multiplyScalar(-1).addScaledVector(tr, -0.4).addScaledVector(tf, -0.1);
    ik2(j[J.SL], _g2, L_UA, L_FA, _pole, j[J.EL], j[J.HL]);
    // legs
    if (this.sit) {
      _fl.copy(this.sit.seat).addScaledVector(fwd, 0.42).addScaledVector(right, -0.25).addScaledVector(UP, -0.4);
      _fr.copy(this.sit.seat).addScaledVector(fwd, 0.42).addScaledVector(right, 0.25).addScaledVector(UP, -0.4);
    } else {
      const ph = [this.phase % 1, (this.phase + 0.5) % 1];
      const sides = [-1, 1];
      for (let k = 0; k < 2; k++) {
        const p = ph[k], sd = sides[k];
        let off, lift;
        if (p < 0.5) { off = S * (0.5 - p / 0.5); lift = 0; }
        else { const u = (p - 0.5) / 0.5; off = S * (-0.5 + u * u * (3 - 2 * u)); lift = Math.sin(u * Math.PI) * Math.min(0.2, 0.06 + sp * 0.03); }
        const out = k === 0 ? _fl : _fr;
        // idle stance
        out.set(root.x, root.y + 0.09, root.z).addScaledVector(right, sd * 0.125).addScaledVector(fwd, sd < 0 ? 0.05 : -0.06);
        // kneel
        _t1.set(root.x, root.y + (sd < 0 ? 0.09 : 0.14), root.z).addScaledVector(right, sd * (sd < 0 ? 0.13 : 0.15)).addScaledVector(fwd, sd < 0 ? 0.3 : -0.46);
        out.lerp(_t1, c);
        // planted feet: while idle a foot stays where it is until the stance pulls it >0.2 m away, then takes a quick step
        if (!this.pl) this.pl = [out.clone(), out.clone()], this.st = [-1, -1], this.stFrom = [new THREE.Vector3(), new THREE.Vector3()];
        const pl = this.pl[k];
        if (surf) pl.z += surf * dt;
        if (this.firstPose || walkW > 0.45 || Math.abs(this.crouch - this.crouchT) > 0.06) { pl.copy(out); this.st[k] = -1; }
        else {
          if (this.st[k] < 0 && this.st[1 - k] < 0 && Math.hypot(pl.x - out.x, pl.z - out.z) > 0.2) { this.st[k] = 0; this.stFrom[k].copy(pl); }
          if (this.st[k] >= 0) {
            this.st[k] = Math.min(1, this.st[k] + dt / 0.2);
            const u = this.st[k], e = u * u * (3 - 2 * u);
            pl.lerpVectors(this.stFrom[k], out, e); pl.y = out.y + Math.sin(u * Math.PI) * 0.07;
            if (u >= 1) this.st[k] = -1;
          } else pl.y = out.y;
          out.copy(pl);
        }
        // walk
        _t1.set(root.x, root.y + 0.09 + lift, root.z).addScaledVector(right, sd * 0.12).addScaledVector(_mv, off);
        out.lerp(_t1, walkW);
      }
    }
    _pole.copy(fwd).addScaledVector(UP, 0.15);
    if (this.sit) _pole.copy(fwd).addScaledVector(UP, 0.8);
    ik2(j[J.HPL], _fl, L_TH, L_SH, _pole, j[J.KL], j[J.AL]);
    ik2(j[J.HPR], _fr, L_TH, L_SH, _pole, j[J.KR], j[J.AR]);
    j[J.TL].copy(j[J.AL]).addScaledVector(fwd, 0.19).addScaledVector(UP, -0.07);
    j[J.TR].copy(j[J.AR]).addScaledVector(fwd, lerp(0.19, 0.12, c)).addScaledVector(UP, lerp(-0.07, -0.12, c));
    this.headFwd.copy(_a).setY(_a.y * 0.5).normalize();
    this.bodyFwd.copy(tf);
    if (this.firstPose) { for (let i = 0; i < NJ; i++) this.lj[i].copy(j[i]); this.firstPose = false; }
    this.lastDt = dt;
  }

  // ---- posed corpse: sitting against a wall, legs out, head dropped, weapon on the ground beside him.
  // slump = { base: floor point under the spine at the wall, yaw: facing away from the wall, t, dur }.
  // The pose blends from the last live pose over `dur` (thrown back against the wall), then stays put (no ragdoll).
  poseSlump(dt) {
    const s = this.slump, j = this.j;
    if (s.done) return;
    if (!s.from) s.from = j.map((v) => v.clone());
    s.t = (s.t || 0) + dt;
    const f = fwdYaw(s.yaw, _f), r = rightYaw(s.yaw, _r), b = s.base, sd = s.side || 1;
    const at = (out, a, c, u) => out.copy(b).addScaledVector(f, a).addScaledVector(r, c * sd).addScaledVector(UP, u);
    const hd = clamp((s.t - s.dur) / 0.7, 0, 1), he = hd * hd * (3 - 2 * hd);
    at(j[J.P], 0.25, 0.02, 0.15);
    at(j[J.Ne], 0.1, 0.06, 0.65);
    _hb.copy(f).multiplyScalar(lerp(0.02, 0.1, he)).addScaledVector(UP, lerp(0.17, 0.09, he)).addScaledVector(r, sd * lerp(0.02, 0.09, he)).normalize();
    j[J.Hc].copy(j[J.Ne]).addScaledVector(_hb, 0.17);
    j[J.SL].copy(j[J.Ne]).addScaledVector(r, -0.19).addScaledVector(UP, -0.05 - (sd < 0 ? 0.04 : 0));
    j[J.SR].copy(j[J.Ne]).addScaledVector(r, 0.19).addScaledVector(UP, -0.05 - (sd > 0 ? 0.04 : 0));
    j[J.HPL].copy(j[J.P]).addScaledVector(r, -0.1).addScaledVector(UP, -0.05);
    j[J.HPR].copy(j[J.P]).addScaledVector(r, 0.1).addScaledVector(UP, -0.05);
    at(_fl, 0.98, -0.24, 0.09); at(_fr, 0.86, 0.27, 0.09);
    _pole.copy(UP).addScaledVector(f, 0.3);
    ik2(j[J.HPL], _fl, L_TH, L_SH, _pole, j[J.KL], j[J.AL]);
    ik2(j[J.HPR], _fr, L_TH, L_SH, _pole, j[J.KR], j[J.AR]);
    j[J.TL].copy(j[J.AL]).addScaledVector(UP, 0.17).addScaledVector(r, -0.09).addScaledVector(f, 0.04);
    j[J.TR].copy(j[J.AR]).addScaledVector(UP, 0.17).addScaledVector(r, 0.09).addScaledVector(f, 0.04);
    at(_g2, 0.42, -0.37, 0.04); at(_g1, 0.5, 0.36, 0.04);
    _pole.copy(r).multiplyScalar(-1).addScaledVector(UP, -0.4).addScaledVector(f, -0.3);
    ik2(j[J.SL], _g2, L_UA, L_FA, _pole, j[J.EL], j[J.HL]);
    _pole.copy(r).addScaledVector(UP, -0.4).addScaledVector(f, -0.3);
    ik2(j[J.SR], _g1, L_UA, L_FA, _pole, j[J.ER], j[J.HR]);
    if (this.sidearm) { at(j[J.W0], 0.62, 0.48, 0.03); _dir.copy(f).addScaledVector(r, 0.6).normalize(); j[J.W1].copy(j[J.W0]).addScaledVector(_dir, 0.2); }
    else { at(j[J.W0], 0.35, 0.62, 0.04); _dir.copy(f).addScaledVector(r, 0.18 * sd).normalize(); j[J.W1].copy(j[J.W0]).addScaledVector(_dir, 0.85); }
    this.weaponUp.copy(r).multiplyScalar(sd);
    this.bodyFwd.copy(f).addScaledVector(UP, 0.32).normalize();
    _t1.copy(f).multiplyScalar(0.45).addScaledVector(UP, -0.8).addScaledVector(r, 0.3 * sd).normalize();
    this.headFwd.copy(this.bodyFwd).lerp(_t1, he).normalize();
    const k = s.dur > 0 ? clamp(s.t / s.dur, 0, 1) : 1, e = 1 - (1 - k) * (1 - k);
    if (k < 1) for (let i = 0; i < NJ; i++) j[i].lerpVectors(s.from[i], j[i], e);
    if (hd >= 1) s.done = true;
  }

  // ---- render instanced parts
  render() {
    if (this.slot < 0) return;
    const f = HR.f[this.faction], M = f.meshes, s = this.slot, j = this.j;
    if (this.hidden) { this.writeZero(); return; }
    const rag = !!this.rag;
    if (rag) { // derive frames from particles
      _x.subVectors(j[J.SR], j[J.SL]); _y.subVectors(j[J.Ne], j[J.P]);
      this.bodyFwd.crossVectors(_y, _x).normalize();
      this.headFwd.copy(this.bodyFwd);
    }
    const bf = this.bodyFwd;
    M[this.torsoPart || 'torso'].setMatrixAt(s, segMatrix(j[J.P], j[J.Ne], bf));
    M[this.headPart].setMatrixAt(s, segMatrix(j[J.Ne], j[J.Hc], this.headFwd));
    const pr = (part, side, A, B, ref) => M[part].setMatrixAt(s * 2 + side, segMatrix(A, B, ref));
    pr('uarm', 0, j[J.SL], j[J.EL], bf); pr('uarm', 1, j[J.SR], j[J.ER], bf);
    pr('farm', 0, j[J.EL], j[J.HL], bf); pr('farm', 1, j[J.ER], j[J.HR], bf);
    _t1.subVectors(j[J.HL], j[J.EL]).normalize().multiplyScalar(0.1).add(j[J.HL]); pr('hand', 0, j[J.HL], _t1, bf);
    _t1.subVectors(j[J.HR], j[J.ER]).normalize().multiplyScalar(0.1).add(j[J.HR]); pr('hand', 1, j[J.HR], _t1, bf);
    pr('thigh', 0, j[J.HPL], j[J.KL], bf); pr('thigh', 1, j[J.HPR], j[J.KR], bf);
    pr('shin', 0, j[J.KL], j[J.AL], bf); pr('shin', 1, j[J.KR], j[J.AR], bf);
    _fw.subVectors(j[J.KL], j[J.AL]); pr('foot', 0, j[J.AL], j[J.TL], _fw);
    _fw.subVectors(j[J.KR], j[J.AR]); pr('foot', 1, j[J.AR], j[J.TR], _fw);
    // primary gun (by gunKind; a downed man's primary lies beside him at dropM) + sidearm + knife
    const gp = this.gunKind && M[GPART[this.gunKind]] ? GPART[this.gunKind] : 'rifle';
    const dropped = this.sidearm && this.dropM, showP = !this.noWeapon && !this.weaponGone && (!this.sidearm || dropped);
    const gm = showP ? (dropped ? this.dropM : segMatrix(j[J.W0], j[J.W1], rag ? UP : this.weaponUp)) : ZERO;
    for (const g of f.guns) M[g].setMatrixAt(s, g === gp ? gm : ZERO);
    if (M.pistol) M.pistol.setMatrixAt(s, this.sidearm && !this.noWeapon && (!this.weaponGone || this.dropM) ? segMatrix(j[J.W0], j[J.W1], rag ? UP : this.weaponUp) : ZERO);
    if (M.knife) {
      if (this.meleeT >= 0 && this.meleeKind === 'knife' && !rag) { _fw.subVectors(j[J.HR], j[J.ER]).normalize(); _t1.copy(j[J.HR]).addScaledVector(_fw, 0.05); _x.copy(_t1).add(_fw); M.knife.setMatrixAt(s, segMatrix(_t1, _x, this.weaponUp)); }
      else M.knife.setMatrixAt(s, ZERO);
    }
    for (const im of f.list) im.instanceMatrix.needsUpdate = true;
  }

  // ---- hit test
  rayTest(o, d, max) {
    if (this.hidden || this.slot < 0) return null;
    const j = this.j;
    _t1.addVectors(j[J.P], j[J.Ne]).multiplyScalar(0.5);
    if (raySphere(o, d, _t1, 1.3, max) < 0) return null;
    let best = null, bt = max;
    const caps = this._caps || (this._caps = [
      [J.P, J.Ne, 0.2, 'torso'], [J.SL, J.EL, 0.075, 'arm'], [J.EL, J.HL, 0.065, 'arm'], [J.SR, J.ER, 0.075, 'arm'], [J.ER, J.HR, 0.065, 'arm'],
      [J.HPL, J.KL, 0.095, 'leg'], [J.KL, J.AL, 0.08, 'leg'], [J.HPR, J.KR, 0.095, 'leg'], [J.KR, J.AR, 0.08, 'leg'],
    ]);
    const th = raySphere(o, d, j[J.Hc], 0.135, bt);
    if (th >= 0 && th < bt) { bt = th; best = { t: th, part: 'head', joint: J.Hc }; }
    for (const [a, b, r, part] of caps) {
      const res = raySegment(o, d, bt, j[a], j[b]);
      if (res.dist2 < r * r) {
        const t = Math.max(0, res.t - Math.sqrt(r * r - res.dist2));
        if (t < bt) { bt = t; best = { t, part, joint: res.s < 0.5 ? a : b }; }
      }
    }
    if (!best) return null;
    best.mat = 'flesh';
    best.point = new THREE.Vector3().copy(o).addScaledVector(d, best.t);
    best.normal = new THREE.Vector3().copy(d).negate();
    return best;
  }

  hurt(dmg, dir, part, joint, opts = {}) {
    if (!this.alive) { if (this.rag) this.rag.impulse(joint ?? J.P, dir, (opts.force || 4) * 0.5); return false; }
    if (this.invuln) { this.flinch = 1; this.flinchSide = Math.random() < 0.5 ? -1 : 1; return false; }
    const mult = part === 'head' ? 4 : part === 'torso' ? 1 : part === 'arm' ? 0.7 : part === 'leg' ? 0.75 : 1;
    this.hp -= dmg * mult;
    this.flinch = 1; this.flinchSide = Math.random() < 0.5 ? -1 : 1;
    if (this.onHurt) this.onHurt(dmg, dir, part, opts);
    if (this.hp <= 0) {
      // last stand: the AI may decide a lethal hit knocks him down instead (onLethal returns true)
      if (!this.downed && this.onLethal && this.onLethal(dmg, dir, part, opts)) { this.goDown(dir); return false; }
      this.die(dir, joint ?? J.P, opts.force || 5, part); return true;
    }
    return false;
  }

  // ---- downed ("last stand"): falls on his back away from the shot, propped on the left elbow, pistol in the right hand.
  // The primary drops beside him (dropM). AI drives h.aim / aimTarget / recoil, h.down.cw (crawl) and h.down.die (>= 0: dying).
  goDown(dir) {
    this.downed = true; this.hp = 14; this.meleeT = -1; this.sidearm = 1; this.aimT = 0; this.aimTarget = 0; this.crouchT = 0; this.vel.set(0, 0, 0); this.grips = null;
    if (dir && Math.abs(dir.x) + Math.abs(dir.z) > 1e-3) _f.set(-dir.x, 0, -dir.z).normalize(); else _f.copy(this.bodyFwd).setY(0).normalize();
    const yaw = this.downYaw ?? yawOf(_f), r = rightYaw(yaw, _r), gl = (GK[this.gunKind] || GK.rifle).len;
    fwdYaw(yaw, _f);
    this.down = { t: 0, yaw, die: -1, from: null, cw: 0, cph: 0, bend: Math.random() };
    _p.copy(this.pos).addScaledVector(r, 0.45).addScaledVector(_f, -0.05).setY(this.pos.y + 0.035);
    _n.copy(_f).multiplyScalar(0.95).addScaledVector(r, 0.3).normalize();
    _t1.copy(_p).addScaledVector(_n, gl);
    this.dropM = segMatrix(_p, _t1, r, new THREE.Matrix4());
  }
  poseDowned(dt) {
    const d = this.down, j = this.j;
    for (let i = 0; i < NJ; i++) this.lj[i].copy(j[i]);
    if (!d.from) d.from = j.map((v) => v.clone());
    d.t += dt; this.lastDt = dt;
    this.recoil = damp(this.recoil, 0, 14, dt); this.flinch = damp(this.flinch, 0, 6, dt);
    const f = fwdYaw(d.yaw, _f), r = rightYaw(d.yaw, _r), b = this.pos;
    if (d.die >= 0) d.die += dt;
    const dk = d.die >= 0 ? clamp(d.die / 1.1, 0, 1) : 0, de = dk * dk * (3 - 2 * dk), lv = 1 - de;
    const aw = (this.aimT = damp(this.aimT, this.aimTarget, 5, dt)) * lv;
    const th = lerp(0.1, 0.5 + this.flinch * 0.12, lv), ct = Math.cos(th), st = Math.sin(th);
    const cw = d.cw, cs = Math.sin(d.cph * Math.PI * 2);
    j[J.P].copy(b).addScaledVector(UP, 0.13);
    _tu.copy(f).multiplyScalar(-ct).addScaledVector(UP, st);
    j[J.Ne].copy(j[J.P]).addScaledVector(_tu, 0.52).addScaledVector(r, -0.05 * lv);
    this.bodyFwd.copy(f).multiplyScalar(st).addScaledVector(UP, ct).addScaledVector(r, 0.32 * lv).normalize();
    j[J.SL].copy(j[J.Ne]).addScaledVector(r, -0.18).addScaledVector(UP, -0.07 * lv).addScaledVector(_tu, -0.04);
    j[J.SR].copy(j[J.Ne]).addScaledVector(r, 0.18).addScaledVector(UP, 0.03 * lv).addScaledVector(_tu, -0.04);
    j[J.HPL].copy(j[J.P]).addScaledVector(r, -0.1); j[J.HPR].copy(j[J.P]).addScaledVector(r, 0.1);
    // aim: front half only, never into the ground
    _a.copy(this.aim); if (_a.lengthSq() < 1e-6) _a.copy(f);
    _a.y = clamp(_a.y, -0.25, 0.6); _a.normalize();
    const fd = _a.x * f.x + _a.z * f.z; if (fd < 0.3) _a.addScaledVector(f, 0.3 - fd).normalize();
    // head: looks at the target, lolls back and to the side when he dies
    _hb.copy(_tu).multiplyScalar(0.5).addScaledVector(_a, 0.6 * lv).addScaledVector(UP, 0.15).addScaledVector(f, -0.7 * de).addScaledVector(r, -0.45 * de).normalize();
    j[J.Hc].copy(j[J.Ne]).addScaledVector(_hb, 0.17);
    this.headFwd.copy(_a).setY(_a.y * 0.4).normalize().multiplyScalar(lv).addScaledVector(UP, 0.6 * de).addScaledVector(r, -0.55 * de).normalize();
    // left arm: forearm flat on the ground, elbow under the shoulder
    _g2.copy(b).addScaledVector(f, lerp(-0.62, -0.22, lv)).addScaledVector(r, lerp(-0.42, -0.31, lv)).addScaledVector(UP, 0.05);
    _pole.copy(f).multiplyScalar(-0.6).addScaledVector(UP, -0.5).addScaledVector(r, -0.45);
    ik2(j[J.SL], _g2, L_UA, L_FA, _pole, j[J.EL], j[J.HL]);
    // right arm: pistol on the chest -> extended at the target; drops to the ground when he dies
    _s0.copy(j[J.P]).addScaledVector(f, 0.12).addScaledVector(r, 0.06).addScaledVector(UP, 0.2);
    _t1.copy(j[J.SR]).addScaledVector(_a, 0.45); _s0.lerp(_t1, aw);
    _dir.copy(f).multiplyScalar(0.6).addScaledVector(r, -0.5).addScaledVector(UP, 0.2).normalize().lerp(_a, aw).normalize();
    if (de > 0) { _t1.copy(b).addScaledVector(r, 0.5).addScaledVector(f, -0.05).addScaledVector(UP, 0.05); _s0.lerp(_t1, de); _mv.copy(f).multiplyScalar(0.45).addScaledVector(r, 0.9).normalize(); _dir.lerp(_mv, de).normalize(); }
    _s0.addScaledVector(_dir, -0.05 * this.recoil);
    _dir.addScaledVector(UP, 0.3 * this.recoil).normalize();
    j[J.W0].copy(_s0); j[J.W1].copy(_s0).addScaledVector(_dir, 0.2);
    _wu.copy(UP).addScaledVector(_dir, -_dir.y).normalize(); this.weaponUp.copy(_wu);
    _g1.copy(_s0);
    _pole.copy(r).multiplyScalar(0.7).addScaledVector(UP, -0.6).addScaledVector(f, -0.2);
    ik2(j[J.SR], _g1, L_UA, L_FA, _pole, j[J.ER], j[J.HR]);
    // legs: left straight, right knee up; crawling pushes with alternating heels
    const bl = d.bend * 0.18 * lv + cw * Math.max(0, cs) * 0.3, br = lerp(0.12, 0.3, lv) + cw * Math.max(0, -cs) * 0.25;
    _fl.copy(b).addScaledVector(f, 0.86 - bl).addScaledVector(r, -0.17).addScaledVector(UP, 0.08);
    _fr.copy(b).addScaledVector(f, 0.86 - br).addScaledVector(r, 0.21).addScaledVector(UP, 0.09);
    _pole.copy(UP).addScaledVector(f, 0.35);
    ik2(j[J.HPL], _fl, L_TH, L_SH, _pole, j[J.KL], j[J.AL]);
    ik2(j[J.HPR], _fr, L_TH, L_SH, _pole, j[J.KR], j[J.AR]);
    j[J.TL].copy(j[J.AL]).addScaledVector(UP, 0.16).addScaledVector(r, -0.07).addScaledVector(f, 0.05);
    j[J.TR].copy(j[J.AR]).addScaledVector(UP, 0.16).addScaledVector(r, 0.07).addScaledVector(f, 0.05);
    // fall: blend from the last standing pose (accelerating, like a body going over)
    const k = clamp(d.t / 0.55, 0, 1), e = k * k;
    if (k < 1) for (let i = 0; i < NJ; i++) j[i].lerpVectors(d.from[i], j[i], e);
    this.firstPose = false;
    if (dk >= 1) this.die(null, J.Hc, 0, 'torso');
  }

  die(dir, joint = J.P, force = 5, part = 'torso') {
    if (!this.alive) return;
    this.alive = false; this.deadT = 0;
    this.rag = new Ragdoll(this, dir, joint, force);
    if (this.onDeath) this.onDeath(part);
    if (G.onCorpse) G.onCorpse(this);
    G.stats.kills += this.faction !== 'us' ? 1 : 0;
  }

  update(dt) {
    if (this.removed) return;
    if (this.alive) { if (this.downed) this.poseDowned(dt); else if (!this.hidden) this.animate(dt); }
    else if (this.slump) this.poseSlump(dt);
    else if (this.rag) {
      this.deadT += dt;
      this.rag.step(dt);
      if (this.deadT > 2 && (this.j[J.P].z > 260 || this.j[J.P].y < -60)) { this.remove(); return; }
    }
  }
}

// ---------- verlet ragdoll ----------
export class Ragdoll {
  constructor(h, dir, joint, force) {
    this.h = h; const j = h.j, lj = h.lj;
    const dtl = Math.max(1 / 120, h.lastDt || 1 / 60);
    this.pos = j; // share joint vectors
    this.prev = j.map((p, i) => {
      const v = new THREE.Vector3().subVectors(p, lj[i]).multiplyScalar(1 / dtl);
      if (v.length() > 30) v.setLength(30);
      return new THREE.Vector3().copy(p).addScaledVector(v, -1 / 60);
    });
    this.cons = BONES.map(([a, b]) => [a, b, j[a].distanceTo(j[b])]);
    this.acc = 0; this.sleep = 0; this.asleep = false;
    if (dir) this.impulse(joint, dir, force);
  }
  impulse(joint, dir, force) {
    this.asleep = false; this.sleep = 0;
    const h = 1 / 60;
    for (let i = 0; i < NJ; i++) {
      const w = i === joint ? 1 : (i === J.P || i === J.Ne) ? 0.55 : 0.3;
      this.prev[i].addScaledVector(dir, -force * w * h);
    }
    this.prev[J.P].y -= force * 0.12 * h;
  }
  step(dt) {
    if (this.asleep) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    const h = 1 / 60;
    while (this.acc >= h) { this.acc -= h; this.sub(h); }
  }
  sub(h) {
    const P = this.pos, Q = this.prev;
    const g = 17 * h * h;
    let maxMove = 0;
    for (let i = 0; i < NJ; i++) {
      const p = P[i], q = Q[i];
      const vx = (p.x - q.x) * 0.993, vy = (p.y - q.y) * 0.993, vz = (p.z - q.z) * 0.993;
      q.copy(p);
      p.x += vx; p.y += vy - g; p.z += vz;
      maxMove = Math.max(maxMove, vx * vx + vy * vy + vz * vz);
    }
    // candidate boxes near pelvis
    const pc = P[J.P];
    const cand = this._cand || (this._cand = []);
    cand.length = 0;
    for (const b of G.boxes) {
      if (!b.enabled || b.inv) continue;
      if (pc.x > b.max.x + 2.2 || pc.x < b.min.x - 2.2 || pc.y > b.max.y + 2.2 || pc.y < b.min.y - 2.2 || pc.z > b.max.z + 2.2 || pc.z < b.min.z - 2.2) continue;
      cand.push(b);
    }
    let grounded = false;
    for (let it = 0; it < 7; it++) {
      for (const c of this.cons) {
        const a = P[c[0]], b = P[c[1]];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const k = ((L - c[2]) / L) * 0.5;
        a.x += dx * k; a.y += dy * k; a.z += dz * k;
        b.x -= dx * k; b.y -= dy * k; b.z -= dz * k;
      }
      for (const [ia, ib, mn] of MINS) {
        const a = P[ia], b = P[ib];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (L < mn) { const k = ((L - mn) / L) * 0.5; a.x += dx * k; a.y += dy * k; a.z += dz * k; b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
      }
      for (let i = 0; i < NJ; i++) {
        const p = P[i], r = RAD[i];
        for (const b of cand) {
          if (p.x <= b.min.x - r || p.x >= b.max.x + r || p.y <= b.min.y - r || p.y >= b.max.y + r || p.z <= b.min.z - r || p.z >= b.max.z + r) continue;
          const pen = [p.x - (b.min.x - r), (b.max.x + r) - p.x, p.y - (b.min.y - r), (b.max.y + r) - p.y, p.z - (b.min.z - r), (b.max.z + r) - p.z];
          let k = 0; for (let q = 1; q < 6; q++) if (pen[q] < pen[k]) k = q;
          if (k === 0) p.x = b.min.x - r; else if (k === 1) p.x = b.max.x + r;
          else if (k === 2) p.y = b.min.y - r; else if (k === 3) { p.y = b.max.y + r; grounded = true; }
          else if (k === 4) p.z = b.min.z - r; else p.z = b.max.z + r;
          if (it === 6) this.friction(i, k >> 1, 0);
        }
        const gy = groundY(p.x, p.z) + r;
        if (p.y < gy) {
          if (gy - p.y < 1.5) { p.y = gy; if (it === 6) this.friction(i, 1, G.v * h); }
        }
      }
    }
    // weapon floor
    if (maxMove < 0.00002 && grounded) { if (++this.sleep > 50) this.asleep = true; } else this.sleep = 0;
  }
  friction(i, axis, svz) {
    const p = this.pos[i], q = this.prev[i];
    let vx = p.x - q.x, vy = p.y - q.y, vz = p.z - q.z - svz;
    const fr = 0.3;
    if (axis === 1) { vy = Math.max(0, vy) * 0.2; vx *= 1 - fr; vz *= 1 - fr; }
    else if (axis === 0) { vx *= 0.2; vy *= 1 - fr; vz *= 1 - fr; }
    else { vz *= 0.2; vx *= 1 - fr; vy *= 1 - fr; }
    q.set(p.x - vx, p.y - vy, p.z - (vz + svz));
  }
}

export function updateHumans(dt) {
  for (let i = G.humans.length - 1; i >= 0; i--) {
    const h = G.humans[i];
    h.update(dt);
  }
  for (const h of G.humans) h.render();
}

export function clearHumans() {
  for (const h of [...G.humans]) h.remove();
  G.humans.length = 0;
}
