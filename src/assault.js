// Part 4 assault vehicles: trucks/snowmobiles that charge the radar-station yard and unload troops.
// Scripted arrivals (assaultEvents), the Juggernaut's truck (sendJuggTruck) and a per-frame hook (updateAssault).
import { G, THREE, rr, ri, clamp, damp, lerp, pick, yawOf, angDiff } from './core.js';
import { Human, J } from './humans.js';
import { explodeAt, sledMesh } from './vehicles.js';
import { P } from './player.js';
import { play, loop } from './audio.js';
import { HUD } from './hud.js';
import { D, after, afterReal } from './director.js';
import { S, ground5 } from './station.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { Raider } from './part5.js';

const _e = new THREE.Vector3(), _d = new THREE.Vector3();
function truckMesh() {
  const g = new THREE.Group(), b = new Builder();
  b.boxC(0, 0.85, 0, 2.2, 0.3, 7.2, 'dark', 0x26292a);
  b.boxC(0, 1.95, -2.35, 2.4, 1.5, 1.7, 'paint', 0x4d5640, 0, 0, 0, 0.08);
  b.boxC(0, 2.3, -3.21, 2.1, 0.62, 0.05, 'glass', 0x10161b);
  b.boxC(0, 1.45, -3.65, 2.0, 0.9, 1.1, 'paint', 0x4d5640, 0, 0, 0, 0.08);
  b.boxC(0, 1.3, -4.22, 1.6, 0.6, 0.05, 'dark', 0x1a1a1a);
  for (const sx of [-1, 1]) b.boxC(sx * 0.7, 1.55, -4.25, 0.25, 0.18, 0.05, 'light', 0);
  b.boxC(0, 1.35, 1.25, 2.45, 0.7, 4.6, 'paint', 0x4d5640, 0, 0, 0, 0.04);
  b.boxC(0, 2.55, 1.25, 2.5, 1.7, 4.6, 'cloth', 0x6a6a4a, 0, 0, 0, 0.18);
  b.boxC(0, 2.73, -2.35, 2.3, 0.06, 1.6, 'snow', 0xffffff);
  b.boxC(0, 3.42, 1.25, 2.3, 0.08, 4.4, 'snow', 0xffffff);
  for (const z of [-3.0, 0.7, 2.3]) for (const sx of [-1, 1]) b.cyl(sx * 1.12, 0.55, z, 0.55, 0.55, 0.42, 'dark', 0x1a1a1a, 0, 0, Math.PI / 2, 14);
  b.build({ ...M, glass: new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: 0.1, metalness: 0.8 }), light: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff0c8, emissiveIntensity: 6 }) }, g);
  return g;
}
const _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
class Charger {
  constructor(kind, pts, o = {}) {
    this.isSled = true; this.kind = kind; this.path = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.i = 1; this.vmax = o.speed || (kind === 'truck' ? 11 : 17); this.v = this.vmax;
    this.pos = this.path[0].clone(); this.pos.y = ground5(this.pos.x, this.pos.z);
    _d.subVectors(this.path[1], this.path[0]); this.yaw = Math.atan2(-_d.x, -_d.z); this.pitch = 0;
    this.hp = kind === 'truck' ? 1500 : 240; this.dead = false; this.arrived = false; this.troops = o.troops || 0; this.jugg = !!o.jugg;
    this.half = kind === 'truck' ? [1.25, 3.4, 4.2] : [0.6, 1.3, 1.3];
    this.group = kind === 'truck' ? truckMesh() : sledMesh(); G.scene.add(this.group);
    this.driver = null; this.gunner = null;
    if (kind === 'sled') { const r = new Human('ru'); r.hp = 60; r.sit = { seat: new THREE.Vector3() }; r.onDeath = () => { if (!this.dead && !this.arrived) this.wreck(false); }; this.rider = r; this.driver = r; }
    this.snd = loop(kind === 'truck' ? 'train' : 'sled', { pos: this.pos, vol: kind === 'truck' ? 0.5 : 0.8, ref: 8, rate: kind === 'truck' ? 0.7 : 1.1 });
    this.place(0);
    G.sleds.push(this);
  }
  place(dt) {
    const g = this.group;
    g.position.copy(this.pos); g.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); g.updateMatrixWorld(true);
    if (this.rider && this.rider.alive) { this.rider.sit.seat.set(0, 0.85, 0.25).applyMatrix4(g.matrixWorld); this.rider.pos.copy(this.rider.sit.seat).setY(this.pos.y); this.rider.yaw = this.yaw; this.rider.aim.set(-Math.sin(this.yaw), -0.2, -Math.cos(this.yaw)); }
  }
  update(dt) {
    if (this.dead) {
      this.burnT = (this.burnT || 0) + dt;
      if (this.burnT < 40 && Math.random() < 0.4) G.fx.smoke(_e.set(0, 1.6, 0).applyMatrix4(this.group.matrixWorld), { size: 1.4, grow: 4, life: 4, color: 0x161514, alpha: 0.5, vy: 2, wind: 1 });
      if (this.burnT < 25 && Math.random() < 0.5) { _e.set(rr(-0.8, 0.8), 1.2, rr(-1.5, 1.5)).applyMatrix4(this.group.matrixWorld); G.fx.add.spawn(_e.x, _e.y, _e.z, 0, rr(1, 2.5), 0, { life: 0.35, size: 0.9, c: [1, 0.5, 0.15], alpha: 1 }); }
      return;
    }
    if (this.arrived) return;
    const tgt = this.path[this.i];
    _d.subVectors(tgt, this.pos).setY(0);
    const dist = _d.length();
    const last = this.i === this.path.length - 1;
    if (dist < (last ? 0.6 : 3)) { if (last) return this.arrive(); this.i++; return; }
    const ty = Math.atan2(-_d.x, -_d.z), da = angDiff(this.yaw, ty), tr = this.kind === 'truck' ? 1.2 : 2.6;
    this.yaw += clamp(da, -tr * dt, tr * dt);
    const turnK = clamp(1 - Math.abs(da) / 1.6, 0.25, 1);
    this.v = damp(this.v, (last && dist < 12 ? Math.max(2, dist * 0.8) : this.vmax) * turnK, 2.5, dt);
    this.pos.x += -Math.sin(this.yaw) * this.v * dt; this.pos.z += -Math.cos(this.yaw) * this.v * dt;
    const fy = ground5(this.pos.x - Math.sin(this.yaw) * 1.5, this.pos.z - Math.cos(this.yaw) * 1.5), by = ground5(this.pos.x + Math.sin(this.yaw) * 1.5, this.pos.z + Math.cos(this.yaw) * 1.5);
    this.pos.y = (fy + by) / 2; this.pitch = damp(this.pitch, Math.atan2(fy - by, 3), 6, dt);
    this.place(dt);
    this.snd.setPos(this.pos);
    if (this.kind === 'sled' && Math.random() < 0.5) G.fx.alpha.spawn(this.pos.x, this.pos.y + 0.2, this.pos.z, rr(-1, 1), rr(0.5, 1.5), rr(-1, 1), { life: 0.9, size: 0.5, grow: 2.5, c: [0.95, 0.97, 1], alpha: 0.4, wind: 0.5 });
    // running over the player
    if (P.alive && this.v > 3 && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < (this.kind === 'truck' ? 2.4 : 1.3) && Math.abs(P.pos.y - this.pos.y) < 1.5) { P.damage(this.kind === 'truck' ? 80 : 45, this.pos); P.addShake(0.8); }
  }
  arrive() {
    this.arrived = true; this.v = 0;
    this.snd.setVol(0);
    const m = this.group.matrixWorld;
    if (this.kind === 'truck') {
      const c = Math.abs(Math.cos(this.yaw)) > 0.7;
      const hx = c ? 1.25 : 3.9, hz = c ? 3.9 : 1.25;
      this.col = addCol(this.pos.x - hx, this.pos.y, this.pos.z - hz, this.pos.x + hx, this.pos.y + 3.3, this.pos.z + hz);
      for (let k = 0; k < this.troops; k++) {
        const p = _e.set((k % 2 ? 0.8 : -0.8), 0, 4.6 + Math.floor(k / 2) * 0.9).applyMatrix4(m);
        after(k * 0.45, () => { if (G.lvl === 5) new Raider(p.x, p.z, { maxTier: 2, jugg: this.jugg && k === 0 }); });
      }
      play('bolt', { pos: this.pos, vol: 0.8, ref: 6 });
      if (G.bark) G.bark('RU_06', this.pos, true);
    } else if (this.rider && this.rider.alive) {
      const p = _e.set(1.0, 0, 0).applyMatrix4(m);
      this.rider.remove(); this.rider = null; this.driver = null;
      new Raider(p.x, p.z, { maxTier: 2 });
    }
  }
  wreck(boom) {
    if (this.dead) return;
    this.dead = true; this.snd.stop();
    explodeAt(_e.set(0, 1.2, 0).applyMatrix4(this.group.matrixWorld).clone(), this.kind === 'truck' ? 2.4 : 1.4, this.kind === 'truck' ? 9 : 6, 80);
    if (this.rider && this.rider.alive) this.rider.die(_d.set(0, 0.6, 1), J.P, 8);
    if (this.kind === 'truck' && !this.arrived) { // the troops in the back are lost with it
      for (let k = 0; k < Math.min(3, this.troops); k++) { const p = _e.set(rr(-0.8, 0.8), 1.4, rr(0, 3)).applyMatrix4(this.group.matrixWorld); const r = new Raider(p.x, p.z, { maxTier: 0 }); r.h.pos.y = p.y; r.h.die(_d.set(rr(-1, 1), 1, rr(-1, 1)).normalize(), J.P, 9); }
      this.troops = 0;
      if (this.jugg && G.p5JuggDown) G.p5JuggDown();
      if (!this.col) { const c = Math.abs(Math.cos(this.yaw)) > 0.7, hx = c ? 1.25 : 3.9, hz = c ? 3.9 : 1.25; this.col = addCol(this.pos.x - hx, this.pos.y, this.pos.z - hz, this.pos.x + hx, this.pos.y + 3.0, this.pos.z + hz); }
    }
    this.arrived = true;
    this.group.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); if (o.material.emissive) o.material.emissiveIntensity = 0; } });
    if (G.p5Vehicle) G.p5Vehicle(this);
  }
  hurt(dmg) { if (this.dead) return false; this.hp -= dmg; if (this.hp <= 0) { this.wreck(true); return true; } return false; }
  rayTest(o, d, max) {
    if (this.dead && this.kind === 'sled') return null;
    _inv.copy(this.group.matrixWorld).invert();
    _lo.copy(o).applyMatrix4(_inv); _ld.copy(d).transformDirection(_inv);
    const [hx, hy, hz] = this.half;
    let t0 = 0, t1 = max;
    for (const [oo, dd, lo, hi] of [[_lo.x, _ld.x, -hx, hx], [_lo.y, _ld.y, 0.2, hy], [_lo.z, _ld.z, -hz, hz]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
    }
    return { t: t0, mat: 'metal', normal: _e.copy(d).negate().clone() };
  }
  remove() { G.scene.remove(this.group); this.snd.stop(); if (this.rider) this.rider.remove(); }
}
function addCol(x0, y0, z0, x1, y1, z1) { const b = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), mat: 'metal', tag: '', enabled: true, inv: false, noStand: false, car: -1 }; G.boxes.push(b); return b; }
const GATE_N = [[6, -160], [5, -95], [2, -48], [0, -36], [0, -28]];
function sendTruck(stop, troops, o = {}) { return new Charger('truck', [...GATE_N, ...stop], { troops, ...o }); }
function sendSleds() {
  new Charger('sled', [[-110, -80], [-60, -50], [-21, -36], [-20.5, -27], [-14, -18]]);
  new Charger('sled', [[110, -70], [60, -30], [36, -5], [27, -4.5], [18, -8]]);
}

// ---------- hooks called from part5.js ----------
// scripted arrivals, keyed on upload progress (P5.up, 0..100) and phase (P5.ph)
export function assaultEvents(P5) {
  if (!P5.truck1 && P5.up >= 28) { P5.truck1 = true; sendTruck([[0.5, -21]], 5); after(4, () => HUD.toast('敌军卡车正从大门冲进来！')); }
  if (!P5.sleds1 && P5.up >= 42) { P5.sleds1 = true; sendSleds(); }
  if (!P5.truck2 && P5.dishDone && P5.up >= 60) { P5.truck2 = true; sendTruck([[-13, -25]], 4); }
  if (!P5.sleds2 && P5.ph === 'igla') { P5.sleds2 = true; sendSleds(); }
}
// the Juggernaut arrives in the back of a truck (called once at ~70% upload)
export function sendJuggTruck() { sendTruck([[13, -25]], 3, { jugg: true, speed: 9 }); }
// called every frame while Part 4 runs
export function updateAssault(dt, P5) {}
// called whenever Part 4 is reset/left (checkpoint restart, level change)
export function clearAssault() {}
