// Part 4 assault vehicles: troop trucks, SUVs and snowmobiles charge the radar-station yard and unload soldiers.
// Every vehicle follows a fixed spline to its own parking spot (routes checked offline against the station colliders,
// rocks, trees and the other parking spots). Passengers are Raiders from the start: seated (Human.sit), `update`
// overridden on the instance, `h.noCrowd` set. On arrival they dismount on a script — truck: the tailgate drops, they
// stand, walk to the rear and jump down one by one; SUV: the doors swing open and they step out on both sides;
// snowmobile: both riders hop off — and are then handed back to the normal Raider AI.
// A vehicle destroyed before its troops are out kills everybody still aboard.
// part5.js call sites: assaultEvents(P5), sendJuggTruck(), updateAssault(dt, P5), clearAssault().
import { G, THREE, rr, clamp, damp, lerp, smooth, angDiff } from './core.js';
import { J } from './humans.js';
import { explodeAt, sledMesh } from './vehicles.js';
import { P } from './player.js';
import { play, loop } from './audio.js';
import { HUD } from './hud.js';
import { ground5 } from './station.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { Raider } from './raider.js';

const _e = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
const HP = Math.PI / 2, TF = 1.7; // TF: truck bed floor (local y)
const A = { veh: [], q: [], gap: 0, t: 0, jugg: null, thOn: false, th: new THREE.Vector3() };

let MT = null;
function mats() {
  if (!MT) MT = { ...M,
    glass: new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.4 }),
    tint: new THREE.MeshStandardMaterial({ color: 0x1b252c, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.5, transparent: true, opacity: 0.5, depthWrite: false }),
    light: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff0c8, emissiveIntensity: 6 }) };
  return MT;
}
const build = (b, g) => { for (const m of b.build(mats(), g)) if (m.material === MT.tint) m.castShadow = false; };

// ---------- models (forward = -z) ----------
// troop truck: cab, cargo bed with drop sides and benches, canvas tilt open at the rear, hinged tailgate
function truckMesh() {
  const g = new THREE.Group(), b = new Builder(), C = 0x4d5640, T = 0x6a6a4a, K = 0x26292a;
  b.boxC(0, 0.85, 0, 2.2, 0.3, 7.2, 'dark', K);
  b.boxC(0, 1.95, -2.35, 2.4, 1.5, 1.7, 'paint', C, 0, 0, 0, 0.08);
  b.boxC(0, 2.3, -3.21, 2.1, 0.62, 0.05, 'glass', 0x10161b);
  b.boxC(0, 1.45, -3.65, 2.0, 0.9, 1.1, 'paint', C, 0, 0, 0, 0.08);
  b.boxC(0, 1.3, -4.22, 1.6, 0.6, 0.05, 'dark', 0x1a1a1a);
  b.boxC(0, 0.95, -4.28, 2.3, 0.2, 0.12, 'dark', K);
  for (const sx of [-1, 1]) {
    b.boxC(sx * 1.205, 2.3, -2.5, 0.03, 0.55, 0.9, 'glass', 0x10161b);
    b.boxC(sx * 0.7, 1.55, -4.25, 0.25, 0.18, 0.05, 'light', 0);
    b.boxC(sx * 1.0, 1.15, 3.63, 0.2, 0.1, 0.04, 'paint', 0x8f2a22);
    b.boxC(sx * 1.2, TF + 0.28, 1.25, 0.06, 0.56, 4.6, 'paint', C);                     // drop sides
    b.boxC(sx * 1.235, 2.82, 1.25, 0.04, 1.12, 4.6, 'cloth', T);                         // canvas sides
    b.boxC(sx * 0.95, TF + 0.39, 1.15, 0.4, 0.06, 4.0, 'wood', 0x6e5a42);                // benches (top TF+0.42)
    for (const z of [-0.7, 1.15, 3.0]) b.boxC(sx * 0.95, TF + 0.18, z, 0.05, 0.36, 0.05, 'dark', K);
  }
  b.boxC(0, 1.35, 1.25, 2.45, 0.7, 4.6, 'paint', C, 0, 0, 0, 0.04);                       // bed (floor TF)
  b.boxC(0, TF + 0.28, -1.02, 2.45, 0.56, 0.06, 'paint', C);                              // headboard
  b.boxC(0, 2.83, -1.03, 2.5, 1.14, 0.04, 'cloth', T);
  b.boxC(0, 3.4, 1.25, 2.52, 0.06, 4.62, 'cloth', T);                                     // canvas roof
  for (const z of [-0.9, 0.55, 2.0, 3.45]) b.boxC(0, 3.35, z, 2.42, 0.05, 0.05, 'dark', K); // bows
  b.cyl(0, 3.27, 3.48, 0.1, 0.1, 2.5, 'cloth', T, 0, 0, HP, 10);                         // rear flap, rolled up
  b.boxC(0, 2.73, -2.35, 2.3, 0.06, 1.6, 'snow', 0xffffff);
  b.boxC(0, 3.46, 1.25, 2.3, 0.06, 4.4, 'snow', 0xffffff);
  for (const z of [-3.0, 0.7, 2.3]) for (const sx of [-1, 1]) { b.cyl(sx * 1.12, 0.55, z, 0.55, 0.55, 0.42, 'glove', 0, 0, 0, HP, 14); b.cyl(sx * 1.335, 0.55, z, 0.28, 0.28, 0.02, 'dark', 0x3a3d33, 0, 0, HP, 10); }
  build(b, g);
  const gate = new THREE.Group(); gate.position.set(0, TF, 3.55); g.add(gate);
  const tb = new Builder(); tb.boxC(0, 0.28, 0.03, 2.45, 0.56, 0.06, 'paint', C);
  for (const sx of [-1, 1]) tb.boxC(sx * 0.95, 0.42, 0.07, 0.1, 0.08, 0.04, 'dark', K);
  build(tb, gate);
  g.userData.gate = gate;
  return g;
}
// four-door SUV (UAZ Patriot-like): tinted glass, seats inside, four doors hinged at their front edges
function suvMesh() {
  const g = new THREE.Group(), b = new Builder(), C = 0x3b4048, K = 0x1b1c1e;
  b.boxC(0, 0.38, 0, 1.86, 0.1, 4.6, 'dark', 0x202224);
  b.boxC(0, 0.8, -1.72, 1.94, 0.76, 1.4, 'paint', C, 0, 0, 0, 0.06);
  b.boxC(0, 0.8, 1.72, 1.94, 0.76, 1.0, 'paint', C, 0, 0, 0, 0.06);
  for (const sx of [-1, 1]) {
    b.boxC(sx * 0.95, 0.8, -0.82, 0.06, 0.76, 0.42, 'paint', C);
    b.boxC(sx * 0.95, 0.41, 0.3, 0.07, 0.12, 1.84, 'dark', K);
    b.boxC(sx * 0.93, 1.49, -0.81, 0.07, 0.75, 0.07, 'paint', C, 0.55);
    b.boxC(sx * 0.94, 1.5, 0.385, 0.07, 0.66, 0.09, 'paint', C);
    b.boxC(sx * 0.94, 1.5, 1.22, 0.07, 0.66, 0.08, 'paint', C);
    b.boxC(sx * 0.94, 1.5, 2.17, 0.08, 0.66, 0.1, 'paint', C);
    b.boxC(sx * 0.955, 1.49, 1.7, 0.03, 0.58, 0.88, 'tint', 0);
    for (const z of [-1.55, 1.5]) { b.cyl(sx * 0.86, 0.38, z, 0.38, 0.38, 0.28, 'glove', 0, 0, 0, HP, 14); b.cyl(sx * 1.005, 0.38, z, 0.2, 0.2, 0.02, 'dark', 0x55585b, 0, 0, HP, 10); b.boxC(sx * 0.99, 0.84, z, 0.07, 0.08, 0.98, 'poly', 0); }
    b.boxC(sx * 0.72, 0.95, -2.43, 0.28, 0.15, 0.04, 'light', 0);
    b.boxC(sx * 0.8, 0.98, 2.23, 0.16, 0.2, 0.03, 'paint', 0x8f2a22);
    b.boxC(sx * 0.75, 1.93, 0.8, 0.05, 0.05, 2.6, 'dark', K);
    b.boxC(sx * 0.42, 0.74, -0.08, 0.5, 0.13, 0.5, 'poly', 0); b.boxC(sx * 0.42, 1.08, 0.24, 0.5, 0.62, 0.11, 'poly', 0, -0.15);
  }
  b.boxC(0, 1.49, -0.81, 1.78, 0.74, 0.03, 'tint', 0, 0.55);
  b.boxC(0, 1.84, 0.78, 1.92, 0.08, 2.96, 'paint', C, 0, 0, 0, 0.03);
  b.boxC(0, 1.895, 0.78, 1.7, 0.035, 2.7, 'snow', 0xffffff);
  b.boxC(0, 1.49, 2.2, 1.8, 0.58, 0.03, 'tint', 0);
  b.boxC(0, 0.86, -2.43, 1.3, 0.34, 0.04, 'dark', K);
  b.boxC(0, 0.52, -2.5, 2.0, 0.2, 0.14, 'poly', 0); b.boxC(0, 0.52, 2.3, 2.0, 0.2, 0.14, 'poly', 0);
  b.cyl(0, 1.0, 2.36, 0.36, 0.36, 0.22, 'glove', 0, HP, 0, 0, 14);
  b.boxC(0, 1.05, -0.92, 1.78, 0.22, 0.26, 'dark', K);
  b.cyl(-0.42, 1.12, -0.66, 0.17, 0.17, 0.035, 'poly', 0, 1.15, 0, 0, 12);
  b.boxC(0, 0.74, 0.86, 1.62, 0.13, 0.5, 'poly', 0); b.boxC(0, 1.08, 1.17, 1.62, 0.6, 0.11, 'poly', 0, -0.15);
  build(b, g);
  const doors = []; // FL, FR, RL, RR (same order as the SUV seats)
  for (const [sx, z0, len] of [[-1, -0.6, 0.95], [1, -0.6, 0.95], [-1, 0.43, 0.77], [1, 0.43, 0.77]]) {
    const dg = new THREE.Group(); dg.position.set(sx * 0.955, 0, z0); g.add(dg);
    const db = new Builder();
    db.boxC(0, 0.79, len / 2, 0.06, 0.74, len, 'paint', C, 0, 0, 0, 0.02);
    db.boxC(0, 1.49, len / 2, 0.025, 0.58, len - 0.1, 'tint', 0);
    db.boxC(0, 1.81, len / 2, 0.05, 0.05, len, 'paint', C);
    db.boxC(0, 1.49, len - 0.03, 0.05, 0.62, 0.05, 'paint', C);
    db.boxC(sx * 0.035, 1.02, len - 0.2, 0.025, 0.035, 0.14, 'dark', 0x111111);
    db.boxC(-sx * 0.035, 0.84, len / 2, 0.02, 0.5, len - 0.14, 'poly', 0);                // inner trim
    build(db, dg);
    doors.push({ g: dg, sx, t0: Infinity, snd: false });
  }
  g.userData.doors = doors;
  return g;
}

// ---------- kinds, seats, routes ----------
// seat: [x, y, z (pelvis, local), facing (yaw offset), driver]
const KIND = {
  truck: { hp: 1500, v: 11, brake: 3, hl: 2.2, r: 6, box: [-1.25, 1.25, 0.2, 3.45, -4.3, 3.62], boom: [2.4, 9], snd: ['train', 0.5, 0.7],
    seats: [[0.9, 2.2, 2.75, HP], [-0.9, 2.2, 2.75, -HP], [0.9, 2.2, 1.65, HP], [-0.9, 2.2, 1.65, -HP], [0.9, 2.2, 0.55, HP], [-0.9, 2.2, 0.55, -HP]] },
  suv: { hp: 650, v: 13, brake: 4.5, hl: 1.5, r: 3.4, box: [-1.0, 1.0, 0.2, 1.9, -2.5, 2.42], boom: [1.9, 7.5], snd: ['train', 0.4, 1.2], bars: [[-0.58, 1.12, -0.6], [-0.26, 1.12, -0.6]],
    seats: [[-0.42, 0.88, -0.08, 0, 1], [0.42, 0.88, -0.08, 0], [-0.42, 0.88, 0.86, 0], [0.42, 0.88, 0.86, 0]] },
  sled: { hp: 240, v: 17, brake: 6, hl: 1.0, r: 2.4, box: [-0.6, 0.6, 0.2, 1.3, -1.6, 1.4], boom: [1.4, 6], snd: ['sled', 0.8, 1.1], bars: [[-0.3, 1.06, -0.36], [0.3, 1.06, -0.36]],
    seats: [[0, 0.98, 0.14, 0, 1], [0, 1.05, 0.78, 0]] },
};
// trucks and SUVs come down the road and through the north gate; snowmobiles flank through the NW and E breaches.
// The last segment of every truck/SUV route is axis-aligned (exact colliders); parking spots never overlap a later route.
const ROAD = [[6, -172], [5.5, -120], [4.5, -80], [2.5, -52], [1.5, -38]];
const ROAD2 = [[6, -172], [5.5, -120], [4.5, -80], [3, -52], [2.6, -40], [2, -35], [0.6, -31.4], [-2.6, -28.7]];
const NWC = [[-20.5, -155], [-20.5, -140], [-20, -125], [-17, -112], [-15.8, -100], [-16.4, -90], [-15.5, -83], [-16.6, -75], [-19.5, -62], [-21.2, -44], [-20.6, -34], [-20.5, -29]];
const EC = [[150, 8], [105, -3], [62, -5], [40, -4.6], [30, -4.5]];
const ROUTES = {
  suvW: { kind: 'suv', road: 1, pts: [...ROAD2, [-10, -28.4], [-14.5, -28], [-18.3, -25.6], [-20, -22], [-20, -17.5]] },
  truckW: { kind: 'truck', road: 1, pts: [...ROAD, [1, -32], [-0.6, -27.5], [-4, -24.2], [-8, -23], [-13, -23]] },
  sledNW1: { kind: 'sled', pts: [...NWC, [-22.5, -24.5], [-24, -19]] },
  sledE1: { kind: 'sled', pts: [...EC, [25, -3.5], [21, 0.5], [19.5, 3.5]] },
  suvE: { kind: 'suv', road: 1, pts: [...ROAD, [1.5, -32], [2.8, -27.8], [6.5, -25], [14, -24.7], [19.5, -22.5], [21.5, -19], [21.5, -15]] },
  truckE: { kind: 'truck', road: 1, pts: [...ROAD, [1.5, -32], [2.6, -27.8], [6, -24.8], [9, -24], [13, -24]] },
  truckJ: { kind: 'truck', road: 1, pts: [...ROAD, [0.5, -32], [0, -27], [0, -21.5]], jpath: [[2.4, -26.3], [2.0, -17], [0.6, -12.5]] },
  suvNW: { kind: 'suv', road: 1, pts: [...ROAD2, [-12, -28.4], [-18, -28.2], [-21, -27.6], [-26, -27.6]] },
  sledNW2: { kind: 'sled', pts: [...NWC, [-21.8, -25.6], [-26, -21], [-27, -15.5], [-26.5, -8.5]] },
  sledE2: { kind: 'sled', pts: [[150, 6], [105, 1], [62, -4], [40, -4.4], [30, -4.5], [26.5, -6.5], [26, -11], [26, -18]] },
};

// ---------- vehicle ----------
class Charger {
  constructor(rid, o = {}) {
    const R = this.R = ROUTES[rid], kind = R.kind, k = this.k = KIND[kind];
    this.isSled = true; this.kind = kind; this.rid = rid; this.road = !!R.road;
    this.curve = new THREE.CatmullRomCurve3(R.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.L = this.curve.getLength(); this.s = 0; this.vmax = o.speed || k.v; this.v = this.vmax * 0.85;
    this.pos = new THREE.Vector3(); this.tan = new THREE.Vector3(0, 0, -1); this.yaw = 0; this.pitch = 0; this.bob = rr(0, 6);
    this.hp = k.hp; this.dead = false; this.arrived = false; this.removed = false; this.at = 0; this.col = []; this.pax = [];
    this.driver = null; this.gunner = null; this.toast = o.toast || null;
    this.group = kind === 'truck' ? truckMesh() : kind === 'suv' ? suvMesh() : sledMesh(); G.scene.add(this.group);
    this.gate = this.group.userData.gate || null; this.doors = this.group.userData.doors || null;
    this.snd = loop(k.snd[0], { pos: this.pos, vol: k.snd[1], ref: 8, rate: k.snd[2] });
    this.pose(0);
    const n = Math.min(o.troops || 0, k.seats.length), S = k.seats;
    for (let i = 0; i < n; i++) { const jg = !!o.jugg && i === n - 1; addPax(this, jg ? S[S.length - 1] : S[i], i, jg, jg ? S.length - 1 : i); }
    this.place();
    G.sleds.push(this); A.veh.push(this);
  }
  // position/heading from the spline at arc length s; pitch from the snow under the axles
  pose(dt) {
    const c = this.curve, t = c.getUtoTmapping(this.s / this.L);
    c.getPoint(t, _a); c.getPoint(Math.min(1, t + 2e-4), _c1); c.getPoint(Math.max(0, t - 2e-4), _c2);
    this.tan.subVectors(_c1, _c2).setY(0); if (this.tan.lengthSq() > 1e-12) this.tan.normalize();
    this.yaw = Math.atan2(-this.tan.x, -this.tan.z);
    this.pos.x = _a.x; this.pos.z = _a.z; this.ground(dt);
  }
  ground(dt) {
    const hl = this.k.hl, sy = Math.sin(this.yaw) * hl, cy = Math.cos(this.yaw) * hl;
    const fy = ground5(this.pos.x - sy, this.pos.z - cy), by = ground5(this.pos.x + sy, this.pos.z + cy), pt = Math.atan2(fy - by, 2 * hl);
    this.pos.y = (fy + by) / 2; this.pitch = dt > 0 ? damp(this.pitch, pt, 6, dt) : pt;
    if (this.kind === 'sled' && dt > 0 && !this.arrived) this.pos.y += Math.abs(Math.sin((this.bob += dt * 6.3))) * 0.05;
  }
  place() {
    const g = this.group;
    g.position.copy(this.pos); g.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); g.updateMatrixWorld(true);
    const m = g.matrixWorld, B = this.k.bars;
    for (let i = 0; i < this.pax.length; i++) {
      const r = this.pax[i], d = r.ride, h = r.h;
      if (d.st !== 'ride' || !h.alive) continue;
      h.sit.seat.copy(d.ls).applyMatrix4(m); h.pos.copy(h.sit.seat); h.pos.y -= 0.9;
      h.yaw = this.yaw + d.ly; aimFwd(h); h.aimTarget = 0; h.crouchT = 0;
      if (d.drv && B) { h.sit.barL.set(B[0][0], B[0][1], B[0][2]).applyMatrix4(m); h.sit.barR.set(B[1][0], B[1][1], B[1][2]).applyMatrix4(m); }
    }
  }
  update(dt) {
    if (this.removed) return;
    if (this.dead) {
      this.burnT = (this.burnT || 0) + dt;
      if (this.burnT < 40 && Math.random() < 0.4) G.fx.smoke(_e.set(0, 1.6, 0).applyMatrix4(this.group.matrixWorld), { size: 1.4, grow: 4, life: 4, color: 0x161514, alpha: 0.5, vy: 2, wind: 1 });
      if (this.burnT < 25 && Math.random() < 0.5) { _e.set(rr(-0.8, 0.8), 1.2, rr(-1.5, 1.5)).applyMatrix4(this.group.matrixWorld); G.fx.add.spawn(_e.x, _e.y, _e.z, 0, rr(1, 2.5), 0, { life: 0.35, size: 0.9, c: [1, 0.5, 0.15], alpha: 1 }); }
      return;
    }
    if (this.arrived) { this.at += dt; this.parked(); return; }
    const k = this.k, c = this.curve, tx = this.tan.x, tz = this.tan.z;
    // target speed: brake for the parking spot, slow for bends (chord to a point 9 m ahead), never ram a vehicle ahead
    let vt = Math.min(this.vmax, Math.sqrt(2 * k.brake * Math.max(0, this.L - this.s - 0.3)) + 0.6);
    c.getPoint(c.getUtoTmapping(Math.min(1, (this.s + 9) / this.L)), _c1); _c1.sub(this.pos).setY(0);
    const cl = _c1.length(); if (cl > 2) vt *= clamp(((_c1.x * tx + _c1.z * tz) / cl - 0.55) / 0.4, 0.3, 1);
    for (let i = 0; i < A.veh.length; i++) {
      const o = A.veh[i]; if (o === this || o.arrived || o.dead) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      if (dx * tx + dz * tz > 0 && dx * dx + dz * dz < 256 && Math.abs(dx * tz - dz * tx) < 3.5) vt = Math.min(vt, o.v * 0.85);
    }
    this.v = damp(this.v, vt, vt < this.v ? 3.5 : 1.2, dt);
    this.s += Math.max(0.5, this.v) * dt;
    if (this.s >= this.L) { this.s = this.L; this.arrive(); return; }
    this.pose(dt); this.place();
    this.snd.setPos(this.pos); this.snd.setRate(k.snd[2] * (0.75 + (0.35 * this.v) / this.vmax));
    if (this.kind === 'sled' && Math.random() < 0.5) G.fx.alpha.spawn(this.pos.x, this.pos.y + 0.2, this.pos.z, rr(-1, 1), rr(0.5, 1.5), rr(-1, 1), { life: 0.9, size: 0.5, grow: 2.5, c: [0.95, 0.97, 1], alpha: 0.4, wind: 0.5 });
    if (this.toast && this.L - this.s < 55) { HUD.toast?.(this.toast); this.toast = null; }
    // running over the player
    if (P.alive && this.v > 3 && Math.abs(P.pos.x - this.pos.x) + Math.abs(P.pos.z - this.pos.z) < 6) {
      _lo.copy(P.pos).applyMatrix4(_inv.copy(this.group.matrixWorld).invert());
      const b = k.box;
      if (_lo.x > b[0] - 0.35 && _lo.x < b[1] + 0.35 && _lo.z > b[4] - 0.35 && _lo.z < b[5] + 0.35 && _lo.y > -1 && _lo.y < 1.5) { P.damage(this.kind === 'truck' ? 80 : this.kind === 'suv' ? 60 : 45, this.pos); P.addShake(0.8); }
    }
  }
  arrive() {
    this.arrived = true; this.v = 0; this.at = 0;
    const p = this.R.pts, n = p.length;
    this.pos.x = p[n - 1][0]; this.pos.z = p[n - 1][1];
    this.yaw = Math.atan2(-(p[n - 1][0] - p[n - 2][0]), -(p[n - 1][1] - p[n - 2][1])); this.ground(0);
    this.place();
    this.snd.setPos(this.pos); this.snd.setVol(this.k.snd[1] * 0.3); this.snd.setRate(this.k.snd[2] * 0.5);
    if (this.kind !== 'sled') this.footprint(false);
    if (this.kind === 'truck') play('bolt', { pos: this.pos, vol: 0.8, ref: 6 });
    for (const r of this.pax) if (r.h.alive) { G.bark?.('RU_06', this.pos, true); break; }
  }
  // tailgate / doors after parking; the engine idles a few seconds, then dies
  parked() {
    const t = this.at;
    if (this.gate) {
      const u = clamp((t - 0.25) / 0.42, 0, 1), w = clamp((t - 0.67) / 0.45, 0, 1);
      this.gate.rotation.x = 2.6 * u * u - 0.22 * Math.sin(w * Math.PI) * (1 - w);
      if (u >= 1 && !this.gateSnd) { this.gateSnd = true; play('metal', { pos: this.pos, vol: 0.7, ref: 5 }); }
    }
    if (this.doors) for (const d of this.doors) {
      if (t < d.t0) continue;
      const u = clamp((t - d.t0) / 0.38, 0, 1);
      d.g.rotation.y = d.sx * 1.2 * (1 - (1 - u) * (1 - u) * (1 - u));
      if (!d.snd) { d.snd = true; play('clack', { pos: this.pos, vol: 0.45, ref: 4, rate: 1.5 }); }
    }
    if (t > 5 && !this.idleOff) { this.idleOff = true; this.snd.stop(); }
  }
  // colliders: trucks block up to the bed floor plus the cab (the bed stays open so bodies can lie in it);
  // SUVs full height when parked, only the floor pan for a burnt-out wreck (bodies inside rest on it)
  footprint(wreck) {
    const y = this.pos.y;
    if (this.kind === 'truck') { this.addBox(-1.25, 1.25, -4.3, 3.62, y - 0.4, y + TF); this.addBox(-1.2, 1.2, -3.25, -1.45, y + TF, y + 2.75); }
    else this.addBox(-1.0, 1.0, -2.5, 2.42, y - 0.4, y + (wreck ? 0.45 : 1.85));
  }
  addBox(x0, x1, z0, z1, y0, y1) { // axis-aligned parking -> one exact box; a wreck at an angle -> a staircase of slices
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw), n = Math.abs(Math.sin(2 * this.yaw)) < 0.03 ? 1 : Math.ceil(z1 - z0);
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
      let ax = 1e9, bx = -1e9, az = 1e9, bz = -1e9;
      for (let q = 0; q < 4; q++) {
        const lx = q & 1 ? x1 : x0, lz = q & 2 ? zb : za, wx = this.pos.x + lx * c + lz * s, wz = this.pos.z - lx * s + lz * c;
        ax = Math.min(ax, wx); bx = Math.max(bx, wx); az = Math.min(az, wz); bz = Math.max(bz, wz);
      }
      this.col.push(addCol(ax, y0, az, bx, y1, bz));
    }
  }
  wreck() {
    if (this.dead) return;
    this.dead = true; this.snd.stop();
    this.group.updateMatrixWorld(true);
    const c = _e.set(0, 1.2, 0).applyMatrix4(this.group.matrixWorld).clone();
    for (const r of this.pax) { // everybody still aboard dies with it
      const h = r.h, st = r.ride.st;
      if (!h.alive || !(st === 'ride' || st === 'stand' || st === 'walk' || st === 'turn')) continue;
      _d.subVectors(h.j[J.P], c).setY(0); if (_d.lengthSq() < 1e-4) _d.set(rr(-1, 1), 0, rr(-1, 1));
      _d.normalize(); _d.y = 1.3; h.die(_d.normalize(), J.P, 8);
    }
    explodeAt(c, this.k.boom[0], this.k.boom[1], 80);
    if (!this.arrived && this.kind !== 'sled') this.footprint(true);
    this.arrived = true; this.driver = null;
    this.group.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); if (o.material.emissive) o.material.emissiveIntensity = 0; } });
    G.p5Vehicle?.(this);
  }
  hurt(dmg) { if (this.dead) return false; this.hp -= dmg; if (this.hp <= 0) { this.wreck(); return true; } return false; }
  rayTest(o, d, max) {
    if (this.removed || (this.dead && this.kind === 'sled')) return null;
    _lo.subVectors(this.pos, o); const tc = _lo.dot(d), R = this.k.r;
    if (tc < -R || tc > max + R || _lo.lengthSq() - tc * tc > R * R) return null;
    _inv.copy(this.group.matrixWorld).invert();
    _lo.copy(o).applyMatrix4(_inv); _ld.copy(d).transformDirection(_inv);
    const b = this.k.box;
    let t0 = 0, t1 = max;
    for (let ax = 0; ax < 3; ax++) {
      const oo = ax === 0 ? _lo.x : ax === 1 ? _lo.y : _lo.z, dd = ax === 0 ? _ld.x : ax === 1 ? _ld.y : _ld.z, lo = b[ax * 2], hi = b[ax * 2 + 1];
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let p = (lo - oo) / dd, q = (hi - oo) / dd; if (p > q) { const t = p; p = q; q = t; }
      t0 = Math.max(t0, p); t1 = Math.min(t1, q); if (t0 > t1) return null;
    }
    return { t: t0, mat: 'metal', normal: new THREE.Vector3().copy(d).negate() };
  }
  remove() {
    if (this.removed) return;
    this.removed = true; G.scene.remove(this.group); this.snd.stop();
    for (const r of this.pax) if (r.ride.st !== 'done') { r.h.remove(); const i = G.enemies.indexOf(r); if (i >= 0) G.enemies.splice(i, 1); }
    let i = G.sleds.indexOf(this); if (i >= 0) G.sleds.splice(i, 1);
    i = A.veh.indexOf(this); if (i >= 0) A.veh.splice(i, 1);
  }
}
function addCol(x0, y0, z0, x1, y1, z1) { const b = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), mat: 'metal', tag: '', enabled: true, inv: false, noStand: false, car: -1 }; G.boxes.push(b); return b; }

// ---------- passengers ----------
const aimFwd = (h) => h.aim.set(-Math.sin(h.yaw), -0.15, -Math.cos(h.yaw));
const turnTo = (h, y, rate, dt) => { h.yaw += clamp(angDiff(h.yaw, y), -rate * dt, rate * dt); aimFwd(h); };
const unseat = (h, c) => { h.sit = null; h.crouch = c; h.crouchT = 0; h.firstPose = true; h.vel.set(0, 0, 0); };
// a Raider that rides in `v` on seat `seat` and dismounts `ord`-th; its update is the dismount script until handover
function addPax(v, seat, ord, jugg, door) {
  const r = new Raider(v.pos.x, v.pos.z, { maxTier: 2, jugg });
  r.freeSpot(); r.path.length = 0; r.active = v.kind === 'sled'; // teammates only shoot at riders they can actually see
  const h = r.h; h.noCrowd = true; if (v.kind === 'sled') h.hp = 70;
  h.sit = { seat: new THREE.Vector3(), driver: !!seat[4], barL: new THREE.Vector3(), barR: new THREE.Vector3() };
  const go = v.kind === 'truck' ? 0.6 + ord * 0.7 + (jugg ? 0.4 : 0) : v.kind === 'suv' ? 0.35 + ord * 0.25 : 0.12 + ord * 0.3;
  r.ride = { v, ls: new THREE.Vector3(seat[0], seat[1], seat[2]), ly: seat[3], sx: seat[0] ? Math.sign(seat[0]) : ord ? 1 : -1, drv: !!seat[4], ord, go,
    st: 'ride', t: 0, T: 0, vy: 0, lift: 0, dip: 0, legs: false, yaw1: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
  if (v.doors) v.doors[door].t0 = go - 0.22;
  r.update = (dt) => paxStep(r, dt);
  if (v.kind === 'sled' && r.ride.drv) { v.driver = h; const od = h.onDeath; h.onDeath = (p) => { od(p); if (!v.dead && !v.arrived) v.wreck(); }; }
  if (jugg) A.jugg = r;
  v.pax.push(r);
  return r;
}
function paxStep(r, dt) {
  const h = r.h, d = r.ride, v = d.v;
  if (!h.alive || h.removed) return;
  const m = v.group.matrixWorld;
  if (d.st === 'ride') {
    if (!v.arrived || v.dead || v.at < d.go) return;
    d.t = 0;
    if (v.kind === 'suv') d.st = 'turn';
    else if (v.kind === 'truck') { d.st = 'stand'; unseat(h, 1); h.pos.set(d.sx * 0.78, TF, d.ls.z).applyMatrix4(m); }
    else { // snowmobile: swing a leg over and hop off to the side
      unseat(h, 0.95); d.from.set(d.sx * 0.28, 0.4, d.ls.z).applyMatrix4(m); h.pos.copy(d.from);
      d.to.set(d.sx * 1.25, 0, d.ls.z + 0.15).applyMatrix4(m); d.to.y = ground5(d.to.x, d.to.z);
      d.T = 0.45; d.lift = 0.2; d.dip = 0.45; d.legs = true; d.yaw1 = v.yaw - d.sx * HP * 0.7; d.st = 'jump'; h.crouchT = 0.4;
    }
  }
  d.t += dt;
  switch (d.st) {
    case 'stand': // truck: up off the bench, turn to face the open tailgate
      turnTo(h, v.yaw + Math.PI, 5, dt);
      if (d.t > 0.42) { d.st = 'walk'; d.t = 0; }
      break;
    case 'walk': { // along the bed to the tailgate, then step off: a short ballistic drop to the snow
      _a.set(d.sx * 0.45, TF, 3.3).applyMatrix4(m);
      const dx = _a.x - h.pos.x, dz = _a.z - h.pos.z, dd = Math.hypot(dx, dz), sp = r.jugg ? 1.4 : 2.3;
      turnTo(h, v.yaw + Math.PI, 6, dt);
      if (dd < 0.05) {
        d.from.copy(h.pos); d.to.set(d.sx * 0.62, 0, 4.85).applyMatrix4(m); d.to.y = ground5(d.to.x, d.to.z);
        d.T = r.jugg ? 0.68 : 0.58; d.vy = (d.to.y - d.from.y + 4.9 * d.T * d.T) / d.T; d.lift = -1; d.dip = r.jugg ? 0.55 : 0.8; d.legs = false; d.yaw1 = v.yaw + Math.PI;
        d.st = 'jump'; d.t = 0; h.crouchT = 0.35; h.vel.set(0, 0, 0);
        break;
      }
      const st = Math.min(dd, sp * dt);
      h.pos.x += (dx / dd) * st; h.pos.z += (dz / dd) * st; h.pos.y = _a.y;
      h.vel.set((dx / dd) * sp, 0, (dz / dd) * sp);
      break;
    }
    case 'turn': { // SUV: swing round on the seat toward the open door, then step out
      const u = smooth(d.t / 0.32);
      h.sit.seat.set(lerp(d.ls.x, d.sx * 0.6, u), d.ls.y, d.ls.z + 0.06 * u).applyMatrix4(m); h.pos.copy(h.sit.seat); h.pos.y -= 0.9;
      h.yaw = v.yaw + d.ly + angDiff(d.ly, -d.sx * HP) * u; aimFwd(h);
      if (d.t >= 0.32) {
        unseat(h, 0.95); d.from.set(d.sx * 0.62, 0.3, d.ls.z + 0.06).applyMatrix4(m); h.pos.copy(d.from);
        d.to.set(d.sx * 1.62, 0, d.ls.z + 0.22).applyMatrix4(m); d.to.y = ground5(d.to.x, d.to.z);
        d.T = 0.55; d.lift = 0.08; d.dip = 0; d.legs = true; d.yaw1 = v.yaw - d.sx * HP; d.st = 'jump'; d.t = 0; h.crouchT = 0.5;
      }
      break;
    }
    case 'jump': {
      const u = Math.min(1, d.t / d.T), tt = Math.min(d.t, d.T);
      h.pos.x = lerp(d.from.x, d.to.x, u); h.pos.z = lerp(d.from.z, d.to.z, u);
      h.pos.y = d.lift < 0 ? d.from.y + d.vy * tt - 4.9 * tt * tt : lerp(d.from.y, d.to.y, smooth(u)) + d.lift * Math.sin(Math.PI * u);
      turnTo(h, d.yaw1, 7, dt);
      if (d.legs) h.vel.set((d.to.x - d.from.x) / d.T, 0, (d.to.z - d.from.z) / d.T); else { h.vel.set(0, 0, 0); h.firstPose = true; } // feet stay under him in the air
      if (u >= 1) {
        h.pos.copy(d.to); h.vel.set(0, 0, 0); d.st = 'land'; d.t = 0; h.crouchT = d.dip;
        if (d.dip) play(d.lift < 0 ? 'thud' : 'step_snow', { pos: h.pos, vol: r.jugg ? 0.9 : 0.35, ref: 4, rate: r.jugg ? 0.7 : 1 });
        if (r.jugg) P.addShake(clamp(0.45 - h.pos.distanceTo(P.pos) / 30, 0, 0.4));
      }
      break;
    }
    case 'land':
      h.vel.set(0, 0, 0); if (d.t > 0.12) h.crouchT = 0;
      if (d.t > (d.dip ? 0.38 : 0.15)) handover(r);
      break;
  }
}
// back to the normal Raider AI: run for yard cover (or, for the Juggernaut, round the truck and at the player)
function handover(r) {
  const h = r.h, d = r.ride;
  d.st = 'done'; delete r.update;
  h.noCrowd = false; h.sit = null; h.vel.set(0, 0, 0); h.crouchT = 0; h.grounded = true; h.pos.y = ground5(h.pos.x, h.pos.z);
  r.active = true; r.t = rr(0.2, 0.6); r.losT = 0; r.hiddenT = 0; r.chk = 1; r.lastD = 1e9; r.detour = 0;
  if (r.jugg) { const jp = d.v.R.jpath; r.path = jp ? jp.map(([x, z]) => ({ x, z })) : []; r.repathT = jp ? 9 : 0; r.state = 'pause'; }
  else { r.tier = 2; r.pickNext(); }
  if (d.drv && d.v.driver === h) d.v.driver = null;
}

// ---------- scheduling ----------
function send(rid, troops, o = {}) { return new Charger(rid, { troops, ...o }); }
function aliveN() { let n = 0; for (const e of G.enemies) if (e.h.alive) n++; return n; }
function roadBusy() { for (const v of A.veh) if (v.road && !v.arrived && !v.dead && v.s < 40) return true; return false; }
// [P5 flag, upload %, extra condition, spawn, uses the road]
const EV = [
  ['as_suv1', 20, null, () => send('suvW', 3, { toast: '敌军越野车冲进了大门！' }), 1],
  ['as_truck1', 28, null, () => send('truckW', 5, { toast: '敌军卡车正从大门冲进来！' }), 1],
  ['as_sleds1', 42, null, () => { send('sledNW1', 2, { toast: '雪地摩托从两翼包抄过来了！' }); send('sledE1', 2); }, 0],
  ['as_suv2', 50, null, () => send('suvE', 2, { toast: '又一辆越野车冲进来了！' }), 1],
  ['as_truck2', 60, (P5) => P5.dishDone, () => send('truckE', 4, { toast: '敌军卡车正从大门冲进来！' }), 1],
  ['as_suv3', 0, (P5) => P5.hindIn && A.t - (P5.as_hindT ?? (P5.as_hindT = A.t)) > 8, () => send('suvNW', 3, { toast: '敌军越野车冲进了大门！' }), 1],
  ['as_sleds2', 0, (P5) => P5.ph === 'igla', () => { send('sledNW2', 2, { toast: '雪地摩托从两翼包抄过来了！' }); send('sledE2', 2); }, 0],
];

// ---------- hooks called from part5.js ----------
// scripted arrivals, keyed on upload progress (P5.up, 0..100) and phase (P5.ph); queued, released one by one
export function assaultEvents(P5) {
  if (!P5.as_init) { P5.as_init = true; for (const e of EV) if (e[1] > 0 && e[1] < P5.up - 8) P5[e[0]] = true; } // checkpoint start: skip what is long past
  for (let i = 0; i < EV.length; i++) {
    const e = EV[i];
    if (!P5[e[0]] && P5.up >= e[1] && (!e[2] || e[2](P5))) { P5[e[0]] = true; A.q.push(e); }
  }
}
// the Juggernaut arrives in the back of a truck (called once at ~70% upload; not queued: the lines play right away)
export function sendJuggTruck() { if (G.lvl === 5) send('truckJ', 3, { jugg: true, speed: 9 }); }
// called every frame while Part 4 runs
export function updateAssault(dt, P5) {
  A.t += dt;
  // hold queued arrivals while the yard is crowded (> 16 alive) and keep road vehicles apart
  if (A.q.length && (A.gap -= dt) <= 0 && aliveN() <= 16 && !(A.q[0][4] && roadBusy())) { A.q.shift()[3](); A.gap = 3; }
  // Juggernaut threat marker (live position above his head) while he lives
  const j = A.jugg;
  if (j && j.h.alive && !j.h.removed) {
    A.th.copy(j.h.j[J.Hc]); if (A.th.lengthSq() < 1e-6) A.th.copy(j.h.pos); A.th.y += 0.55;
    if (!A.thOn) { A.thOn = true; HUD.setThreat?.(A.th, '重装兵'); }
  } else if (A.thOn || j) { A.thOn = false; A.jugg = null; HUD.setThreat?.(null); }
}
// called whenever Part 4 is reset/left (checkpoint restart, level change) and when the finale clears the battlefield:
// vehicles still on the way are removed with whoever is aboard; parked vehicles and wrecks stay (clearVehicles takes them)
export function clearAssault() {
  for (let i = A.veh.length - 1; i >= 0; i--) { const v = A.veh[i]; if (!v.arrived && !v.dead) v.remove(); }
  A.veh.length = 0; A.q.length = 0; A.gap = 0; A.jugg = null; A.thOn = false;
  HUD.setThreat?.(null);
}
if (typeof window !== 'undefined') window.__assault = () => ({ A, ROUTES, KIND, send, aliveN });
