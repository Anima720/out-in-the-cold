// Blood decals: spreading pools under corpses + splatter decals. One instanced, glossy, alpha-blended mesh.
// Exposed as G.fx.bloodPool(pos, radius) / G.fx.bloodSplat(pos, normal, size). Pools on the scrolling ground of
// the train level travel with the ground.
import { G, THREE, rr, clamp } from './core.js';
import { supportAt, groundY } from './physics.js';
import { PP } from './post.js';
import { J } from './humans.js';

const NP = 48, NS = 48, N = NP + NS;
const GROW = 4, LIFE = 90, FADE = 10;
const BL = { mesh: null, inst: [], ip: 0, is: 0 };

// atlas 512x256: 4 columns x 2 rows of 128px cells; cols 0-1 = pool height fields, cols 2-3 = splatters.
// R = "height" (visible where R > 1 - grow), G = colour variation.
function atlas() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  let s = 1234; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let cell = 0; cell < 8; cell++) {
    const col = cell % 4, row = cell >> 2, splat = col >= 2;
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6], am = [0.13, 0.09, 0.06, 0.035].map((a) => a * (0.7 + rnd() * 0.6));
    const drops = []; // splatter droplets / pool satellite lobes
    for (let k = 0; k < (splat ? 26 : 5); k++) {
      const a = rnd() * 6.283, r = splat ? 0.32 + Math.pow(rnd(), 0.7) * 0.6 : 0.55 + rnd() * 0.25;
      drops.push([Math.cos(a) * r, Math.sin(a) * r, splat ? 0.015 + Math.pow(rnd(), 3) * 0.09 : 0.08 + rnd() * 0.1, a]);
    }
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = (x + 0.5) / 64 - 1, v = (y + 0.5) / 64 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
      let R = splat ? 0.36 : 0.74;
      for (let k = 0; k < 4; k++) R += am[k] * Math.sin(a * (k + 2) + ph[k]) * (splat ? 1.4 : 1);
      let h = 1 - r / R;                                       // 1 at centre -> 0 at the (wobbly) rim
      for (const [dx, dy, dr, da] of drops) {                  // satellite blobs / droplets with streaks toward the centre
        const ex = u - dx, ey = v - dy, along = (ex * Math.cos(da) + ey * Math.sin(da)), across = (-ex * Math.sin(da) + ey * Math.cos(da));
        const q = splat ? Math.hypot(across, Math.max(0, -along) * 0.18 + Math.max(0, along)) : Math.hypot(ex, ey);
        h = Math.max(h, (1 - q / dr) * (splat ? 0.9 : 0.35));
      }
      if (r > 0.98) h = Math.min(h, (1 - r) * 20);
      const i = ((row * 128 + y) * W + col * 128 + x) * 4;
      d[i] = clamp(h, 0, 1) * 255; d[i + 1] = 128 + (rnd() - 0.5) * 60 + 50 * Math.sin(u * 9 + v * 7); d[i + 2] = 0; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function initBlood() {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aB', aB);
  const tex = atlas();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.bloodMap = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aB; varying vec4 vB; varying vec2 vBUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = aB; vBUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D bloodMap; varying vec4 vB; varying vec2 vBUv; float bInner;')
      .replace('#include <map_fragment>', `
        vec2 cell = vec2(mod(vB.z, 4.0), floor(vB.z / 4.0));
        vec4 bt = texture2D(bloodMap, (cell + clamp(vBUv, 0.004, 0.996)) * vec2(0.25, 0.5));
        float thr = 1.0 - vB.x;
        float ba = smoothstep(thr, thr + 0.035, bt.r);
        bInner = smoothstep(thr + 0.03, thr + 0.32, bt.r);
        vec3 bc = mix(vec3(0.045, 0.002, 0.002), vec3(0.10, 0.005, 0.004), bInner) * (0.88 + 0.25 * bt.g);
        diffuseColor = vec4(bc, ba * vB.y);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.6, 0.24, bInner);');
  };
  const m = new THREE.InstancedMesh(geo, mat, N);
  m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 1; m.count = N;
  const Z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { m.setMatrixAt(i, Z); BL.inst.push({ on: false, t: 0, pos: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, ground: false, splat: i >= NP, v: 0, g0: 0.1, gt: GROW }); }
  BL.mesh = m; BL.aB = aB; BL.Z = Z;
  G.scene.add(m); PP.noAO.push(m);
}

const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 0, 1), _ny = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3();

function place(i) {
  const b = BL.inst[i];
  _m.compose(b.pos, b.q, _s.set(b.s, b.s, 1));
  BL.mesh.setMatrixAt(i, _m); BL.mesh.instanceMatrix.needsUpdate = true;
}
function orient(b, n) {
  b.q.setFromUnitVectors(_up, n);
  b.q.multiply(_q2.setFromAxisAngle(_up, Math.random() * 6.283));
}

// the surface under p: { y, n (normal), box, ground (scrolling train-level ground) } or null if nothing within `maxDrop`
function surfaceUnder(p, maxDrop = 1.5) {
  const sup = supportAt(p.x, p.z, 0.04, p.y + 0.25, 0);
  if (p.y - sup.y > maxDrop) return null;
  if (sup.box) return { y: sup.y, n: _ny, box: sup.box, ground: false };
  if (G.groundFn) {
    const e = 0.4, f = G.groundFn;
    _n.set(f(p.x - e, p.z) - f(p.x + e, p.z), 2 * e, f(p.x, p.z - e) - f(p.x, p.z + e)).normalize();
    return { y: sup.y, n: _n, box: null, ground: false };
  }
  return { y: sup.y, n: _ny, box: null, ground: G.lvl === 2 };
}

function bloodPool(pos, radius = 0.6) {
  const S = surfaceUnder(pos, 3); if (!S) return -1;
  const i = BL.ip; BL.ip = (BL.ip + 1) % NP;
  const b = BL.inst[i];
  let r = radius;
  if (S.box) { const bx = S.box; r = Math.min(r, Math.max(0.2, Math.min(pos.x - bx.min.x, bx.max.x - pos.x, pos.z - bx.min.z, bx.max.z - pos.z) + 0.12)); }
  b.on = true; b.t = 0; b.ground = S.ground; b.splat = false; b.s = r * 2; b.g0 = clamp(0.05 / r, 0.04, 0.3); b.gt = GROW * (0.8 + Math.random() * 0.4);
  b.v = ((Math.random() * 2) | 0) + ((Math.random() * 2) | 0) * 4;
  b.pos.set(pos.x, S.y + (S.box ? 0.006 : 0.02), pos.z);
  orient(b, S.n); place(i);
  return i;
}

function bloodSplat(pos, normal, size = 0.5) {
  const i = NP + BL.is; BL.is = (BL.is + 1) % NS;
  const b = BL.inst[i];
  _t.copy(normal || _ny); if (_t.lengthSq() < 1e-6) _t.copy(_ny); _t.normalize();
  b.on = true; b.t = 0; b.splat = true; b.s = size; b.g0 = 0.55; b.gt = 0.25;
  b.v = 2 + ((Math.random() * 2) | 0) + ((Math.random() * 2) | 0) * 4;
  b.ground = G.lvl === 2 && !G.groundFn && _t.y > 0.7 && !supportAt(pos.x, pos.z, 0.04, pos.y + 0.1, 0).box && pos.y - groundY(pos.x, pos.z) < 0.3;
  b.pos.copy(pos).addScaledVector(_t, 0.008);
  orient(b, _t); place(i);
  return i;
}

// automatic pools: every dead enemy gets one under its torso once the ragdoll has come to rest
function scanCorpses(dt) {
  for (const h of G.humans) {
    if (h.alive || h.faction === 'us' || h._bp || !h.rag || h.removed || h.hidden) continue;
    const j = h.j;
    const x = (j[J.P].x + j[J.Ne].x) / 2, y = (j[J.P].y + j[J.Ne].y) / 2, z = (j[J.P].z + j[J.Ne].z) / 2;
    if (h._bpT === undefined) { h._bpT = 0; h._bpx = x; h._bpy = y; h._bpz = z; continue; }
    const vx = (x - h._bpx) / dt, vy = (y - h._bpy) / dt, vz = (z - h._bpz) / dt;
    h._bpx = x; h._bpy = y; h._bpz = z;
    const sp = Math.min(Math.hypot(vx, vy, vz), G.lvl === 2 ? Math.hypot(vx, vy, vz - G.v) : 9);
    h._bpT = sp < 0.2 ? h._bpT + dt : 0;
    if (h.deadT > 20) { h._bp = true; continue; }
    if (h._bpT < 0.4 || h.deadT < 0.7) continue;
    h._bp = true;
    _t.set(x, y, z);
    const S = surfaceUnder(_t, 0.55); if (!S) continue;               // nothing under the torso (draped over an edge)
    if (Math.abs(sp - Math.hypot(vx, vy, vz)) > 1e-6 && !S.ground) continue; // moving with the world but not on the ground: odd, skip
    bloodPool(_t, (h.faction === 'jg' ? 0.75 : 0.5) + Math.random() * 0.2);
  }
}

export function updateBlood(dt) {
  if (!BL.mesh || dt <= 0) return;
  scanCorpses(dt);
  const A = BL.aB.array; let dirty = false;
  for (let i = 0; i < N; i++) {
    const b = BL.inst[i]; if (!b.on) continue;
    b.t += dt; dirty = true;
    if (b.t > LIFE) { b.on = false; BL.mesh.setMatrixAt(i, BL.Z); BL.mesh.instanceMatrix.needsUpdate = true; A[i * 4 + 1] = 0; continue; }
    if (b.ground && G.v) { b.pos.z += G.v * dt; if (b.pos.z > 300) { b.t = LIFE; } place(i); }
    const u = Math.min(1, b.t / b.gt), e = 1 - (1 - u) * (1 - u) * (1 - u);
    A[i * 4] = b.g0 + (1 - b.g0) * e;
    A[i * 4 + 1] = clamp((LIFE - b.t) / FADE, 0, 1) * (b.splat ? 0.92 : 1);
    A[i * 4 + 2] = b.v;
  }
  if (dirty) BL.aB.needsUpdate = true;
}

export function clearBlood() {
  if (!BL.mesh) return;
  for (let i = 0; i < N; i++) { BL.inst[i].on = false; BL.mesh.setMatrixAt(i, BL.Z); BL.aB.array[i * 4 + 1] = 0; }
  BL.mesh.instanceMatrix.needsUpdate = true; BL.aB.needsUpdate = true; BL.ip = BL.is = 0;
}

export const BLOOD = { bloodPool, bloodSplat, BL };
if (typeof window !== 'undefined') window.__blood = BL;
