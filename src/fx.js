import { G, THREE, rr, clamp } from './core.js';
import { TEX } from './geom.js';
import { groundY } from './physics.js';
import { initBlood, updateBlood, clearBlood, BLOOD } from './blood.js';

// Billboard particle pool rendered as one instanced quad mesh.
class Pool {
  constructor(cap, blending, tex) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.col = new Float32Array(cap * 3); this.a0 = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.wind = new Float32Array(cap);
    this.rot = new Float32Array(cap); this.rv = new Float32Array(cap); this.fadeIn = new Float32Array(cap);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iSR = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iCol', this.iCol); geo.setAttribute('iSR', this.iSR);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex }, uBoost: { value: blending === THREE.AdditiveBlending ? 3.0 : 1.0 } }]),
      vertexShader: `
        attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
        varying vec4 vCol; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv; vCol = iCol;
          vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
          float c = cos(iSR.y), s = sin(iSR.y);
          vec2 q = vec2(c*position.x - s*position.y, s*position.x + c*position.y);
          mvPosition.xy += q * iSR.x;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform float uBoost; varying vec4 vCol; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          vec4 t = texture2D(map, vUv);
          gl_FragColor = vec4(vCol.rgb * t.rgb * uBoost, t.a * vCol.a);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === THREE.AdditiveBlending ? 3 : 2;
    this.geo = geo;
  }
  spawn(x, y, z, vx, vy, vz, o) {
    let i = this.n;
    if (i >= this.cap) { i = (Math.random() * this.cap) | 0; } else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.max[i] = o.life || 1;
    this.s0[i] = o.size || 0.3; this.s1[i] = o.size1 ?? (o.size || 0.3) * (o.grow || 1);
    const c = o.c || [1, 1, 1];
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.a0[i] = o.alpha ?? 1; this.grav[i] = o.grav || 0; this.drag[i] = o.drag ?? 0.5; this.wind[i] = o.wind || 0;
    this.rot[i] = Math.random() * 6.28; this.rv[i] = o.rv ?? (Math.random() - 0.5) * 1.5; this.fadeIn[i] = o.fadeIn || 0;
  }
  update(dt) {
    let n = this.n;
    const ip = this.iPos.array, ic = this.iCol.array, is = this.iSR.array;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { // swap-remove
        n--; this.copy(n, i); i--; continue;
      }
      const k = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[k] *= dr; this.v[k + 1] = this.v[k + 1] * dr - this.grav[i] * dt; this.v[k + 2] *= dr;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += (this.v[k + 2] + G.v * this.wind[i]) * dt;
      this.rot[i] += this.rv[i] * dt;
      const u = this.life[i] / this.max[i];
      let a = this.a0[i] * (1 - u) * (1 - u * 0.3);
      if (this.fadeIn[i] > 0) a *= clamp(this.life[i] / this.fadeIn[i], 0, 1);
      ip[k] = this.p[k]; ip[k + 1] = this.p[k + 1]; ip[k + 2] = this.p[k + 2];
      ic[i * 4] = this.col[k]; ic[i * 4 + 1] = this.col[k + 1]; ic[i * 4 + 2] = this.col[k + 2]; ic[i * 4 + 3] = a;
      is[i * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(u); is[i * 2 + 1] = this.rot[i];
    }
    this.n = n;
    this.geo.instanceCount = n;
    this.iPos.needsUpdate = this.iCol.needsUpdate = this.iSR.needsUpdate = true;
    this.iPos.clearUpdateRanges && this.iPos.clearUpdateRanges();
  }
  copy(src, dst) {
    if (src === dst) return;
    for (const arr of [this.p, this.v, this.col]) { arr[dst * 3] = arr[src * 3]; arr[dst * 3 + 1] = arr[src * 3 + 1]; arr[dst * 3 + 2] = arr[src * 3 + 2]; }
    for (const arr of [this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag, this.wind, this.rot, this.rv, this.fadeIn]) arr[dst] = arr[src];
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export const FX = {};
export function initFX() {
  FX.add = new Pool(1800, THREE.AdditiveBlending, TEX.soft);
  FX.alpha = new Pool(2400, THREE.NormalBlending, TEX.smoke);
  G.scene.add(FX.add.mesh, FX.alpha.mesh);
  // tracers
  const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, -0.5);
  FX.tracerMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 96);
  FX.tracerMesh.frustumCulled = false; FX.tracers = [];
  G.scene.add(FX.tracerMesh);
  // decals (bullet holes) on train surfaces
  const dg = new THREE.PlaneGeometry(1, 1);
  FX.decalMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ map: TEX.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }), 160);
  FX.decalMesh.frustumCulled = false; FX.decalN = 0; FX.decalCount = 0;
  for (let i = 0; i < 160; i++) FX.decalMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
  G.scene.add(FX.decalMesh);
  // debris chunks
  const bg = new THREE.BoxGeometry(1, 1, 1);
  FX.debrisMesh = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.8 }), 220);
  FX.debrisMesh.frustumCulled = false; FX.debris = [];
  FX.debrisMesh.castShadow = true;
  G.scene.add(FX.debrisMesh);
  // flash lights pool
  FX.lights = [];
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 18, 2); G.scene.add(l); FX.lights.push({ l, t: 0, max: 0.05, I: 0 }); }
  initBlood(); FX.bloodPool = BLOOD.bloodPool; FX.bloodSplat = BLOOD.bloodSplat;
  G.fx = FX;
  FX.shakeCB = null;
}

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

FX.flash = (pos, color = 0xffb060, I = 30, dist = 16, dur = 0.06) => {
  let best = FX.lights[0];
  for (const L of FX.lights) if (L.t >= L.max) { best = L; break; }
  best.l.position.copy(pos); best.l.color.set(color); best.l.distance = dist; best.I = I; best.t = 0; best.max = dur; best.l.intensity = I;
};

FX.smoke = (pos, o = {}) => {
  const c = hex(o.color ?? 0x8a8a8a);
  FX.alpha.spawn(pos.x + rr(-0.1, 0.1), pos.y, pos.z + rr(-0.1, 0.1), (o.vx || 0) + rr(-0.4, 0.4), (o.vy ?? 0.8) + rr(-0.2, 0.3), (o.vz || 0) + rr(-0.4, 0.4),
    { life: o.life || 2, size: o.size || 0.6, grow: o.grow || 3, c, alpha: o.alpha ?? 0.45, drag: o.drag ?? 0.6, wind: o.wind ?? 1, fadeIn: 0.08, rv: rr(-0.6, 0.6) });
};

FX.muzzle = (pos, dir, scale = 1) => {
  for (let i = 0; i < 3; i++) {
    const s = rr(0.18, 0.32) * scale;
    FX.add.spawn(pos.x + dir.x * i * 0.12 * scale, pos.y + dir.y * i * 0.12 * scale, pos.z + dir.z * i * 0.12 * scale, dir.x * 3, dir.y * 3, dir.z * 3,
      { life: 0.05, size: s, c: [1, 0.75, 0.4], alpha: 1, drag: 8 });
  }
  FX.alpha.spawn(pos.x, pos.y, pos.z, dir.x * 1.5, dir.y * 1.5 + 0.3, dir.z * 1.5, { life: 0.7, size: 0.15 * scale, grow: 5, c: [0.75, 0.75, 0.75], alpha: 0.25, drag: 2, wind: 0.7 });
};

FX.tracer = (from, to, o = {}) => {
  if (FX.tracers.length >= 96) FX.tracers.shift();
  const dir = new THREE.Vector3().subVectors(to, from); const L = dir.length(); if (L < 0.5) return;
  dir.multiplyScalar(1 / L);
  FX.tracers.push({ from: from.clone(), dir, L, d: o.start ?? 1.5, speed: o.speed || 420, len: o.len || 3.2, w: o.width || 0.025 });
};

FX.decal = (point, normal, size = 0.09) => {
  const i = FX.decalN; FX.decalN = (FX.decalN + 1) % 160;
  _v.copy(point).addScaledVector(normal, 0.012);
  _q.setFromUnitVectors(_z, normal);
  _m.compose(_v, _q, _s.set(size, size, size));
  FX.decalMesh.setMatrixAt(i, _m); FX.decalMesh.instanceMatrix.needsUpdate = true;
};

FX.debrisBurst = (pos, n = 6, o = {}) => {
  for (let i = 0; i < n; i++) {
    if (FX.debris.length >= 220) FX.debris.shift();
    const sp = o.speed || 8;
    FX.debris.push({ p: pos.clone(), v: new THREE.Vector3(rr(-1, 1) * sp, rr(0.4, 1.2) * sp, rr(-1, 1) * sp), r: new THREE.Euler(rr(0, 6), rr(0, 6), 0), av: rr(-12, 12), s: rr(0.05, o.size || 0.25), t: 0, life: rr(2, 4), wind: o.wind ?? 0 });
  }
};

FX.impact = (p, n, mat) => {
  if (mat === 'metal') {
    for (let i = 0; i < 6; i++) FX.add.spawn(p.x, p.y, p.z, n.x * 4 + rr(-4, 4), n.y * 4 + rr(-1, 5), n.z * 4 + rr(-4, 4), { life: rr(0.12, 0.35), size: 0.05, c: [1, 0.8, 0.45], grav: 14, drag: 1 });
    FX.alpha.spawn(p.x, p.y, p.z, n.x, n.y + 0.4, n.z, { life: 0.6, size: 0.12, grow: 4, c: [0.35, 0.33, 0.3], alpha: 0.5, wind: 0.6 });
  } else if (mat === 'flesh') {
    for (let i = 0; i < 4; i++) FX.alpha.spawn(p.x, p.y, p.z, n.x * 1.5 + rr(-1, 1), rr(-0.5, 1.2), n.z * 1.5 + rr(-1, 1), { life: rr(0.25, 0.5), size: 0.08, grow: 3.5, c: [0.45, 0.06, 0.04], alpha: 0.75, grav: 3, drag: 3 });
  } else if (mat === 'snow' || mat === 'ice' || mat === 'gravel') {
    const c = mat === 'gravel' ? [0.62, 0.6, 0.58] : [0.93, 0.95, 0.98];
    for (let i = 0; i < 5; i++) FX.alpha.spawn(p.x, p.y, p.z, rr(-1.2, 1.2), rr(1, 3.5), rr(-1.2, 1.2), { life: rr(0.5, 0.9), size: 0.12, grow: 4, c, alpha: 0.7, grav: 4, drag: 2, wind: 0.6 });
  } else { // wood / ore
    const c = mat === 'wood' ? [0.62, 0.5, 0.36] : [0.35, 0.33, 0.31];
    for (let i = 0; i < 4; i++) FX.alpha.spawn(p.x, p.y, p.z, n.x * 2 + rr(-1, 1), n.y * 2 + rr(0, 2), n.z * 2 + rr(-1, 1), { life: rr(0.4, 0.8), size: 0.08, grow: 4, c, alpha: 0.6, grav: 4, drag: 2, wind: 0.5 });
    if (mat === 'wood') FX.debrisBurst(p, 2, { speed: 3, size: 0.05 });
  }
};

FX.explosion = (pos, size = 1, o = {}) => {
  FX.flash(pos, 0xff9a40, 120 * size, 30 * size, 0.25);
  for (let i = 0; i < 26 * size; i++) {
    const d = new THREE.Vector3(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)).normalize().multiplyScalar(rr(2, 9) * size);
    FX.add.spawn(pos.x, pos.y, pos.z, d.x, d.y, d.z, { life: rr(0.35, 0.8), size: rr(0.9, 1.8) * size, grow: 1.8, c: [1, rr(0.45, 0.7), 0.2], alpha: 0.95, drag: 3, wind: o.wind ?? 0.3 });
  }
  for (let i = 0; i < 22 * size; i++) {
    const d = new THREE.Vector3(rr(-1, 1), rr(0, 1), rr(-1, 1)).normalize().multiplyScalar(rr(1, 5) * size);
    FX.alpha.spawn(pos.x, pos.y, pos.z, d.x, d.y + 1, d.z, { life: rr(2.5, 4.5), size: rr(1, 2) * size, grow: 3, c: [0.16, 0.15, 0.14], alpha: 0.7, drag: 1.2, wind: o.wind ?? 0.8, fadeIn: 0.15 });
  }
  for (let i = 0; i < 20 * size; i++) FX.add.spawn(pos.x, pos.y, pos.z, rr(-14, 14) * size, rr(2, 16) * size, rr(-14, 14) * size, { life: rr(0.4, 1.2), size: 0.08, c: [1, 0.75, 0.3], grav: 15, drag: 0.5 });
  if (o.snow !== false && pos.y - groundY(pos.x, pos.z) < 3) {
    for (let i = 0; i < 18 * size; i++) FX.alpha.spawn(pos.x, pos.y, pos.z, rr(-6, 6) * size, rr(2, 9) * size, rr(-6, 6) * size, { life: rr(1, 2), size: rr(0.5, 1.2) * size, grow: 3, c: [0.95, 0.96, 0.98], alpha: 0.75, grav: 4, drag: 1, wind: 0.7 });
  }
  FX.debrisBurst(pos, Math.round(8 * size), { speed: 9 * size, size: 0.3 * size, wind: o.wind ?? 0 });
};

FX.splash = (pos, size = 1) => { // ice & water burst
  for (let i = 0; i < 40 * size; i++) FX.alpha.spawn(pos.x + rr(-3, 3) * size, pos.y, pos.z + rr(-3, 3) * size, rr(-7, 7) * size, rr(4, 16) * size, rr(-7, 7) * size, { life: rr(1.5, 3), size: rr(0.8, 2.2) * size, grow: 2.5, c: [0.9, 0.94, 0.97], alpha: 0.85, grav: 7, drag: 0.6, wind: 1 });
  FX.debrisBurst(pos, Math.round(14 * size), { speed: 10 * size, size: 0.6 * size, wind: 1 });
};

export function updateFX(dt) {
  FX.add.update(dt); FX.alpha.update(dt); updateBlood(dt);
  // tracers
  let i = 0;
  for (let k = FX.tracers.length - 1; k >= 0; k--) {
    const t = FX.tracers[k];
    t.d += t.speed * dt;
    if (t.d - t.len > t.L) { FX.tracers.splice(k, 1); continue; }
  }
  for (const t of FX.tracers) {
    const head = Math.min(t.d, t.L), tail = Math.max(0, t.d - t.len);
    _v.copy(t.from).addScaledVector(t.dir, head);
    _q.setFromUnitVectors(_z, t.dir);
    _m.compose(_v, _q, _s.set(t.w, t.w, Math.max(0.01, head - tail)));
    FX.tracerMesh.setMatrixAt(i++, _m);
  }
  FX.tracerMesh.count = i; FX.tracerMesh.instanceMatrix.needsUpdate = true;
  // debris
  let n = 0;
  for (let k = FX.debris.length - 1; k >= 0; k--) {
    const d = FX.debris[k];
    d.t += dt;
    if (d.t > d.life) { FX.debris.splice(k, 1); continue; }
    d.v.y -= 18 * dt; d.p.addScaledVector(d.v, dt); d.p.z += G.v * d.wind * dt;
    const gy = groundY(d.p.x, d.p.z);
    if (d.p.y < gy + d.s * 0.5) { d.p.y = gy + d.s * 0.5; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z = d.v.z * 0.6; d.wind = 1; d.av *= 0.6; }
    d.r.x += d.av * dt; d.r.y += d.av * 0.7 * dt;
  }
  for (const d of FX.debris) {
    _q.setFromEuler(d.r);
    _m.compose(d.p, _q, _s.set(d.s, d.s * 0.6, d.s * 0.8));
    FX.debrisMesh.setMatrixAt(n++, _m);
  }
  FX.debrisMesh.count = n; FX.debrisMesh.instanceMatrix.needsUpdate = true;
  for (const L of FX.lights) {
    L.t += dt;
    L.l.intensity = L.t < L.max ? L.I * (1 - L.t / L.max) : 0;
  }
}

export function clearFX() {
  FX.add.clear(); FX.alpha.clear(); FX.tracers.length = 0; FX.debris.length = 0;
  for (let i = 0; i < 160; i++) FX.decalMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
  FX.decalMesh.instanceMatrix.needsUpdate = true;
  clearBlood();
}
