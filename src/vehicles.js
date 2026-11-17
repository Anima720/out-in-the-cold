import { G, THREE, rr, clamp, damp, lerp, yawOf, angDiff, fwdYaw, smooth } from './core.js';
import { Builder, TEX, mat4 } from './geom.js';
import { M } from './mats.js';
import { Human, J } from './humans.js';
import { groundY, rayBoxes, rayGround, raySphere, gorge } from './physics.js';
import { play, loop } from './audio.js';
import { requestToken, releaseToken, shootAtPlayer } from './ai.js';
import { DECK } from './train.js';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    ...M,
    glass: new THREE.MeshStandardMaterial({ color: 0x18242c, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.5, transparent: true, opacity: 0.88 }),
    light: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2cc, emissiveIntensity: 5 }),
    blur: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  };
  return MATS;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3();

// ---------- explosions & damage ----------
export function explodeAt(pos, size = 1, radius = 7, maxDmg = 70, o = {}) {
  G.fx.explosion(pos, size, o);
  const P = G.player;
  const d = pos.distanceTo(P.chest);
  if (d < radius && !o.noPlayerDmg) P.damage(maxDmg * Math.pow(1 - d / radius, 1.4), pos);
  if (d < 40) P.addShake(clamp(1.4 - d / 30, 0.1, 1.3) * size);
  play('explosion', { pos, vol: 1.2 * Math.min(1.5, size), ref: 12 * size, roll: 0.6, rev: 0.6, prio: true });
  if (d < 6 && G.onNearBlast) G.onNearBlast(d);
  for (const h of G.humans) {
    const hd = h.j[J.P].distanceTo(pos);
    if (hd < radius * 0.7) {
      _d.subVectors(h.j[J.P], pos).normalize(); _d.y += 0.6; _d.normalize();
      if (h.alive) { if (!h.invuln) h.hurt(400 * (1 - hd / radius), _d, 'torso', J.P, { force: 14 * size }); }
      else if (h.rag) h.rag.impulse(J.P, _d, 12 * size * (1 - hd / radius));
    }
  }
  for (const s of G.sleds) if (!s.dead && s.pos.distanceTo(pos) < radius * 0.6) s.hurt(500, null);
}

// ---------- rockets ----------
export function fireRocket(from, dir, o = {}) {
  const r = { pos: from.clone(), vel: dir.clone().multiplyScalar(o.speed || 80), life: 0, home: o.home || null, smokeT: 0, wind: o.wind ?? 0, owner: o.owner || null };
  G.rockets.push(r);
  play('rocket', { pos: from, vol: 1, ref: 20, roll: 0.7, rev: 0.4 });
  G.fx.flash(from, 0xffb070, 30, 15, 0.08);
  return r;
}
export function updateRockets(dt) {
  const P = G.player;
  for (let i = G.rockets.length - 1; i >= 0; i--) {
    const r = G.rockets[i];
    r.life += dt;
    if (r.home) {
      const tgt = r.home(); _d.subVectors(tgt, r.pos);
      const L = _d.length(); _d.normalize();
      const sp = r.vel.length(); r.vel.lerp(_d.multiplyScalar(sp), Math.min(1, dt * 4));
      if (L < 3.5) { explodeAt(r.pos, 2.2, 10, 40, { noPlayerDmg: true, wind: 0.5 }); G.rockets.splice(i, 1); if (G.onBridgeHit) G.onBridgeHit(); continue; }
    }
    const step = r.vel.length() * dt; _d.copy(r.vel).normalize();
    let hit = null;
    if (!r.home) {
      const hb = rayBoxes(r.pos, _d, step, true), hg = rayGround(r.pos, _d, step);
      hit = hb && (!hg || hb.t < hg.t) ? hb : hg;
      if (!hit && r.owner !== 'player' && r.pos.distanceTo(P.eye) < 1.4) hit = { t: 0 };
      if (r.owner === 'player') for (const s of G.sleds) { if (s.dead || !s.rayTest) continue; const h = s.rayTest(r.pos, _d, step); if (h && (!hit || h.t < hit.t)) { hit = h; s.hurt(900, _d); } }
      if (r.owner === 'player' && !hit && G.humans) for (const h of G.humans) { if (!h.alive || h.faction === 'us') continue; if (h.j[J.P].distanceTo(r.pos) < 1.0) { hit = { t: 0 }; break; } }
    }
    if (hit || r.life > (r.home ? 12 : 6)) {
      if (hit) { r.pos.addScaledVector(_d, hit.t); explodeAt(r.pos, 1.3, 7.5, r.owner === 'player' ? 60 : 75); }
      G.rockets.splice(i, 1); continue;
    }
    r.pos.addScaledVector(r.vel, dt);
    r.smokeT -= dt;
    if (r.smokeT <= 0) {
      r.smokeT = 0.012;
      G.fx.alpha.spawn(r.pos.x, r.pos.y, r.pos.z, rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3), { life: rr(1.4, 2.4), size: 0.35, grow: 5, c: [0.82, 0.82, 0.83], alpha: 0.6, drag: 1.5, wind: 1, fadeIn: 0.05 });
      G.fx.add.spawn(r.pos.x, r.pos.y, r.pos.z, 0, 0, 0, { life: 0.06, size: 0.6, c: [1, 0.7, 0.35], alpha: 1 });
    }
  }
}

// ---------- snowmobiles ----------
export function sledMesh() {
  const b = new Builder();
  const body = 0xd9dde0, trim = 0x2b2e31;
  b.boxC(0, 0.55, 0.1, 0.95, 0.36, 2.2, 'paint', body);
  b.boxC(0, 0.68, -0.85, 0.9, 0.34, 0.9, 'paint', body, 0.25);
  b.boxC(0, 0.42, -1.25, 0.8, 0.2, 0.5, 'paint', 0x8a2a22, -0.4);
  b.boxC(0, 0.96, -0.5, 0.75, 0.4, 0.05, 'glass', 0, -0.45);
  b.boxC(0, 0.86, 0.45, 0.5, 0.16, 1.15, 'dark', 0x161616);
  b.boxC(0, 0.3, 0.45, 0.6, 0.32, 1.9, 'dark', 0x1f2022);
  for (let z = -0.4; z < 1.4; z += 0.18) b.boxC(0, 0.14, z, 0.62, 0.04, 0.06, 'dark', 0x111111);
  for (const sx of [-0.45, 0.45]) {
    b.boxC(sx, 0.06, -1.25, 0.12, 0.04, 1.3, 'dark', trim);
    b.boxC(sx, 0.18, -1.95, 0.12, 0.04, 0.3, 'dark', trim, 0.7);
    b.boxC(sx, 0.32, -1.2, 0.05, 0.4, 0.05, 'dark', trim, 0.2);
    b.boxC(sx * 1.05, 0.42, 0.4, 0.12, 0.05, 1.2, 'dark', trim);
  }
  b.cyl(0, 1.04, -0.35, 0.015, 0.015, 0.62, 'dark', trim, 0, 0, Math.PI / 2, 6);
  b.boxC(0, 0.72, -1.32, 0.3, 0.12, 0.05, 'light', 0);
  const g = new THREE.Group();
  b.build(mats(), g);
  return g;
}

export class Sled {
  constructor(side, z, o = {}) {
    this.isSled = true; this.side = side; this.t = 0; this.phase = rr(0, 6);
    this.pos = new THREE.Vector3(side * rr(8, 12) * ((o.lane ?? 7.8) / 7.8), 0, z); this.vel = new THREE.Vector3(0, 0, z < 0 ? 4 : -13);
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.hp = 260; this.dead = false; this.deadT = 0;
    this.offs = o.offs ?? rr(-5, 5); this.fireT = rr(1.5, 3); this.burst = 0; this.hasTok = false; this.lane = o.lane ?? 7.8;
    this.group = sledMesh(); G.scene.add(this.group);
    this.driver = new Human('ru'); this.driver.sit = { seat: new THREE.Vector3(), driver: true, barL: new THREE.Vector3(), barR: new THREE.Vector3() }; this.driver.hp = 60;
    this.gunner = o.noGunner ? null : new Human('ru');
    if (this.gunner) { this.gunner.sit = { seat: new THREE.Vector3() }; this.gunner.hp = 70; }
    const onD = () => { if (!this.dead) this.crash(false); };
    this.driver.onDeath = onD;
    if (this.gunner) this.gunner.onDeath = () => { releaseToken(this); };
    this.snd = loop('sled', { pos: this.pos, vol: 0.9, ref: 7, rate: 1 });
    this.syncRiders(0);
    G.sleds.push(this);
  }
  local(x, y, z, out) { return out.set(x, y, z).applyMatrix4(this.group.matrixWorld); }
  syncRiders(dt) {
    this.group.updateMatrixWorld(true);
    const d = this.driver;
    if (d.alive) {
      this.local(0, 0.98, 0.15, d.sit.seat); this.local(0.3, 1.06, -0.36, d.sit.barR); this.local(-0.3, 1.06, -0.36, d.sit.barL);
      d.pos.copy(d.sit.seat).setY(d.sit.seat.y - 0.9); d.yaw = this.yaw; d.vel.copy(this.vel); d.aim.copy(fwdYaw(this.yaw, _v)); d.aimTarget = 0;
    }
    const g = this.gunner;
    if (g && g.alive) {
      this.local(0, 1.08, 0.75, g.sit.seat);
      g.pos.copy(g.sit.seat).setY(g.sit.seat.y - 0.9); g.vel.copy(this.vel);
      _v.subVectors(G.player.chest, g.sit.seat).normalize();
      g.aim.copy(_v); g.aimTarget = 1;
      g.yaw = this.yaw + clamp(angDiff(this.yaw, yawOf(_v)), -1.3, 1.3);
    }
  }
  rayTest(o, d, max) {
    if (this.removed) return null;
    _v.copy(this.pos).setY(this.pos.y + 0.6);
    if (raySphere(o, d, _v, 1.9, max) < 0) return null;
    _inv.copy(this.group.matrixWorld).invert();
    const lo = _o.copy(o).applyMatrix4(_inv), ld = _w.copy(d).transformDirection(_inv);
    const box = { min: { x: -0.55, y: 0.12, z: -1.6 }, max: { x: 0.55, y: 0.95, z: 1.4 } };
    let tmin = 0, tmax = max;
    for (const a of ['x', 'y', 'z']) {
      if (Math.abs(ld[a]) < 1e-9) { if (lo[a] < box.min[a] || lo[a] > box.max[a]) return null; continue; }
      let t1 = (box.min[a] - lo[a]) / ld[a], t2 = (box.max[a] - lo[a]) / ld[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
    }
    return { t: tmin, part: 'body', point: new THREE.Vector3().copy(o).addScaledVector(d, tmin), normal: new THREE.Vector3().copy(d).negate() };
  }
  hurt(dmg, dir) {
    if (this.dead && this.exploded) return false;
    this.hp -= dmg;
    if (this.hp <= 0 && !this.exploded) {
      this.exploded = true;
      _v.copy(this.pos).setY(this.pos.y + 0.6);
      G.fx.explosion(_v, 0.9, { wind: 1 });
      play('explosion', { pos: _v, vol: 0.9, ref: 10, rev: 0.5 });
      this.crash(true);
      return true;
    }
    return false;
  }
  crash(violent) {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; releaseToken(this);
    this.rollV = this.side * rr(4, 7) * (violent ? 1.4 : 1); this.pitchV = rr(-2, 2); this.vel.y = violent ? 6 : 2.5;
    this.vel.x += this.side * 4;
    _d.set(this.side, 0.6, 0).normalize();
    if (this.driver.alive) this.driver.die(_d, J.P, violent ? 14 : 7);
    if (this.gunner && this.gunner.alive) this.gunner.die(_d, J.P, violent ? 14 : 7);
    play('crash', { pos: this.pos, vol: 0.6, ref: 8 });
    if (violent && G.bark) G.bark('RU_03', this.pos, true);
    if (G.onSledDown) G.onSledDown(this);
  }
  update(dt) {
    if (this.removed) return;
    this.t += dt;
    const P = G.player;
    if (!this.dead) {
      const desZ = clamp(P.pos.z + this.offs, -78, 50);
      this.vel.z = damp(this.vel.z, clamp((desZ - this.pos.z) * 0.7, -15, 9), 1.1, dt);
      const desX = this.side * (this.lane + 2.4 * Math.sin(this.t * 0.45 + this.phase));
      this.vel.x = damp(this.vel.x, (desX - this.pos.x) * 1.2, 2, dt);
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      const gx = this.vel.x, gz = this.vel.z - G.v;
      this.yaw = damp(this.yaw, Math.atan2(-gx, -gz), 6, dt);
      this.pos.y = groundY(this.pos.x, this.pos.z) + Math.abs(Math.sin(this.t * 6.3 + this.phase)) * 0.06;
      this.pitch = Math.sin(this.t * 3.1) * 0.03; this.roll = clamp(-this.vel.x * 0.04, -0.25, 0.25);
      // snow spray
      if (Math.random() < 0.7) {
        this.local(rr(-0.3, 0.3), 0.1, 1.3, _v);
        G.fx.alpha.spawn(_v.x, _v.y, _v.z, rr(-1, 1), rr(0.5, 2), rr(1, 3), { life: rr(0.5, 1), size: 0.3, grow: 4, c: [0.95, 0.96, 0.98], alpha: 0.5, drag: 1.5, wind: 1 });
      }
      // gunner
      const g = this.gunner;
      if (g && g.alive && Math.abs(this.pos.z - P.pos.z) < 30) {
        this.fireT -= dt;
        if (this.fireT <= 0) {
          if (this.burst > 0) {
            this.burst--; this.fireT = 0.13; g.recoil = 1;
            shootAtPlayer(_w.copy(g.j[J.W1]), { dmg: 7, acc: 0.55 });
            if (this.burst === 0) { releaseToken(this); this.fireT = rr(1.4, 2.8); }
          } else if (requestToken(this)) { this.burst = 4 + (Math.random() * 4 | 0); this.fireT = 0.4; if (!this.called && G.bark) { this.called = true; G.bark(Math.random() < 0.6 ? 'RU_01' : 'RU_04', this.pos); } }
          else this.fireT = 0.5;
        }
      }
    } else {
      this.deadT += dt;
      this.vel.z += (G.v - this.vel.z) * Math.min(1, dt * 2.2);
      this.vel.x *= 1 - dt * 1.5; this.vel.y -= 19 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const gy = groundY(this.pos.x, this.pos.z);
      if (this.pos.y < gy) { this.pos.y = gy; this.vel.y = Math.abs(this.vel.y) * 0.3; this.rollV *= 0.6; this.pitchV *= 0.6; }
      this.roll += this.rollV * dt; this.pitch += this.pitchV * dt;
      if (this.exploded && Math.random() < 0.5) { _v.copy(this.pos).setY(this.pos.y + 0.5); G.fx.smoke(_v, { size: 0.8, grow: 3, life: 2.5, color: 0x1c1b1a, alpha: 0.55, vy: 2, wind: 1 }); }
      if (this.deadT > 7 || this.pos.z > 240) { this.remove(); return; }
    }
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.syncRiders(dt);
    this.snd.setPos(this.pos);
    this.snd.setRate(this.dead ? 0.5 : 0.9 + Math.abs(this.vel.z) * 0.02);
    if (this.dead) this.snd.setVol(Math.max(0, 0.9 - this.deadT));
  }
  remove() {
    if (this.removed) return;
    this.removed = true; G.scene.remove(this.group); this.snd.stop(); releaseToken(this);
    const i = G.sleds.indexOf(this); if (i >= 0) G.sleds.splice(i, 1);
  }
}

// ---------- Mi-24 "Hind" ----------
function hindMesh() {
  const m = mats();
  const g = new THREE.Group();
  const b = new Builder();
  const camo = 0x59603f, camo2 = 0x7a6d4a, belly = 0x8a98a0, dk = 0x2c2f2b;
  b.add(new THREE.CapsuleGeometry(1.1, 5.2, 4, 12), 'paint', camo, mat4(0, 0, -0.4, Math.PI / 2, 0, 0, 0.9, 1, 1.05));
  b.add(new THREE.CapsuleGeometry(1.0, 4.4, 4, 12), 'paint', belly, mat4(0, -0.35, -0.3, Math.PI / 2, 0, 0, 0.82, 1, 0.75));
  b.boxC(0.95, 0.2, 0.2, 0.06, 0.9, 3.4, 'paint', camo2);
  b.boxC(-0.95, 0.2, 0.2, 0.06, 0.9, 3.4, 'paint', camo2);
  b.cyl(0, -0.05, -4.3, 0.55, 0.88, 1.5, 'paint', camo, Math.PI / 2, 0, 0, 12);
  b.sphere(0, -0.05, -5.05, 0.55, 'paint', camo, 1, 0.95, 0.9);
  b.sphere(0, 0.45, -4.35, 0.62, 'glass', 0, 0.9, 0.8, 1.1);
  b.sphere(0, 0.85, -3.0, 0.68, 'glass', 0, 0.9, 0.85, 1.2);
  for (const sx of [-0.5, 0.5]) { b.cyl(sx, 1.2, -0.6, 0.42, 0.45, 3.4, 'paint', camo, Math.PI / 2, 0, 0, 10); b.cyl(sx, 1.2, -2.35, 0.36, 0.36, 0.12, 'dark', 0x1a1a1a, Math.PI / 2, 0, 0, 10); b.cyl(sx * 1.25, 1.1, 1.3, 0.25, 0.3, 0.6, 'dark', 0x222222, Math.PI / 2, 0.4 * Math.sign(sx), 0, 8); }
  b.cyl(0, 1.75, -0.4, 0.22, 0.3, 0.7, 'dark', dk, 0, 0, 0, 10);
  b.cyl(0, 0.55, 5.5, 0.28, 0.6, 6.0, 'paint', camo, Math.PI / 2, 0, 0, 10);
  b.boxC(0, 1.55, 8.4, 0.14, 2.3, 1.2, 'paint', camo, -0.3);
  b.boxC(0, 0.65, 7.8, 2.4, 0.08, 0.8, 'paint', camo);
  for (const sx of [-1, 1]) {
    b.boxC(sx * 2.0, -0.25, -0.3, 2.6, 0.14, 1.25, 'paint', camo, 0, 0, sx * 0.18);
    b.cyl(sx * 1.55, -0.68, -0.4, 0.27, 0.27, 1.5, 'dark', 0x3a3d34, Math.PI / 2, 0, 0, 10);
    b.cyl(sx * 2.55, -0.55, -0.35, 0.27, 0.27, 1.5, 'dark', 0x3a3d34, Math.PI / 2, 0, 0, 10);
    b.cyl(sx * 1.55, -0.68, -1.16, 0.2, 0.2, 0.02, 'dark', 0x111111, Math.PI / 2, 0, 0, 10);
    b.cyl(sx * 2.55, -0.55, -1.11, 0.2, 0.2, 0.02, 'dark', 0x111111, Math.PI / 2, 0, 0, 10);
    b.boxC(sx * 3.3, -0.1, -0.3, 0.1, 0.9, 0.9, 'paint', camo);
    b.cyl(sx * 3.35, -0.45, -0.3, 0.08, 0.08, 1.4, 'dark', 0x4a4a3a, Math.PI / 2, 0, 0, 6);
  }
  b.sphere(0, -0.65, -5.0, 0.3, 'dark', dk);
  b.cyl(0, -0.72, -5.45, 0.04, 0.04, 0.8, 'dark', 0x111111, Math.PI / 2, 0, 0, 6);
  b.build(m, g);
  const rotor = new THREE.Group(); rotor.position.set(0, 2.05, -0.4);
  const rb = new Builder();
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; rb.add(new THREE.BoxGeometry(0.45, 0.06, 8.4), 'dark', 0x1d1f1c, mat4(Math.sin(a) * 4.2, 0, Math.cos(a) * 4.2, 0, a, 0)); }
  rb.cyl(0, 0, 0, 0.35, 0.35, 0.3, 'dark', 0x2b2b2b, 0, 0, 0, 10);
  rb.build(m, rotor);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(8.6, 40).rotateX(-Math.PI / 2), m.blur); disc.position.y = 0.02; rotor.add(disc);
  g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(-0.22, 2.0, 8.8);
  const tb = new Builder();
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; tb.add(new THREE.BoxGeometry(0.06, 1.7, 0.22), 'dark', 0x1d1f1c, mat4(0, Math.cos(a) * 0.85, Math.sin(a) * 0.85, a, 0, 0)); }
  tb.build(m, tail);
  g.add(tail);
  g.userData = { rotor, tail };
  return g;
}

export class Hind {
  constructor() {
    this.isHind = true; this.visible = true;
    this.pos = new THREE.Vector3(10, 58, -360); this.vel = new THREE.Vector3(0, 0, 25);
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.maxHp = 4200; this.hp = this.maxHp;
    this.state = 'enter'; this.t = 0; this.stT = 0; this.side = -1; this.atkT = 4; this.gunT = 0; this.gunN = 0; this.smokeT = 0;
    this.faceTarget = new THREE.Vector3(0, 2, -30); this.wp = new THREE.Vector3(-6, 22, 120);
    this.group = hindMesh(); G.scene.add(this.group);
    this.snd = loop('heli', { pos: this.pos, vol: 1.6, ref: 30, roll: 0.6, rev: 0.25 });
    this.strafeZ = 60;
    G.hind = this;
  }
  rayTest(o, d, max) {
    if (!this.visible) return null;
    if (raySphere(o, d, this.pos, 9, max) < 0) return null;
    const pts = this._pts || (this._pts = [[0, 0, -4.5, 1.3], [0, 0.1, -1.6, 1.8], [0, 0.4, 1.5, 1.5], [0, 0.6, 5.5, 0.75], [0, 0.6, 8.0, 0.7], [2.2, -0.3, -0.3, 0.8], [-2.2, -0.3, -0.3, 0.8]]);
    let best = null;
    for (const [x, y, z, r] of pts) {
      _v.set(x, y, z).applyMatrix4(this.group.matrixWorld);
      const t = raySphere(o, d, _v, r, best ? best.t : max);
      if (t >= 0 && (!best || t < best.t)) best = { t, part: 'body' };
    }
    if (best) { best.point = new THREE.Vector3().copy(o).addScaledVector(d, best.t); best.normal = new THREE.Vector3().copy(d).negate(); }
    return best;
  }
  hurt(dmg) {
    this.hp = Math.max(this.maxHp * 0.12, this.hp - dmg);
    if (G.onHindHurt) G.onHindHurt(this.hp / this.maxHp);
    if (Math.random() < 0.3) play('metal', { pos: this.pos, vol: 0.9, ref: 25 });
    return false;
  }
  goTo(state, wp, face) { this.state = state; this.stT = 0; if (wp) this.wp.copy(wp); if (face) this.faceTarget.copy(face); }
  nose(out) { return out.set(0, -0.75, -5.6).applyMatrix4(this.group.matrixWorld); }
  pod(i, out) { return out.set(i % 2 ? 2.55 : -1.55, -0.6, -1.3).applyMatrix4(this.group.matrixWorld); }
  update(dt) {
    if (!this.visible) return;
    this.t += dt; this.stT += dt;
    const P = G.player;
    let maxSp = 34;
    switch (this.state) {
      case 'enter': // appears ahead ("twelve o'clock high") and dives at the train
        this.wp.set(-3, 21, -125); this.faceTarget.set(-2, 5, 200);
        if (this.pos.distanceTo(this.wp) < 25) { this.state = 'strafe'; this.stT = 0; this.strafeZ = -120; }
        break;
      case 'strafe': // head-on gun run down the length of the train
        this.strafeZ += 21 * dt;
        this.wp.set(-3, 19, this.strafeZ); this.faceTarget.set(-1, DECK, this.strafeZ + 60);
        maxSp = 30;
        this.gunT -= dt;
        { const tz = this.strafeZ + 24;
          if (this.gunT <= 0 && tz > -74 && tz < 34) {
            this.gunT = 0.075;
            const tgt = _w.set(rr(-1.2, 1.2), DECK + 0.05, tz + rr(-1.5, 1.5));
            this.nose(_v);
            G.fx.tracer(_v, tgt, { width: 0.05, speed: 500, len: 5 });
            G.fx.impact(tgt, _d.set(0, 1, 0), 'metal');
            if (Math.random() < 0.4) G.fx.alpha.spawn(tgt.x, tgt.y, tgt.z, rr(-1, 1), rr(1, 3), rr(-1, 1), { life: 0.8, size: 0.4, grow: 3, c: [0.4, 0.38, 0.35], alpha: 0.6, wind: 1 });
            if (Math.random() < 0.35) play('dshk_far', { pos: _v, vol: 0.9, ref: 25, rev: 0.4 });
            if (Math.random() < 0.3) play('metal', { pos: tgt, vol: 0.6, ref: 4 });
            if (Math.abs(P.pos.z - tgt.z) < 1.6 && Math.abs(P.pos.x - tgt.x) < 1.6) P.damage(16, _v);
          } }
        if (this.strafeZ > 90) this.goTo('side', new THREE.Vector3(this.side * 48, 28, -40));
        break;
      case 'side': {
        const k = Math.sin(this.t * 0.25);
        this.wp.set(this.side * 46, 26 + Math.sin(this.t * 0.7) * 3, -38 + k * 18);
        this.faceTarget.set(0, 3, P.pos.z);
        maxSp = 26;
        this.atkT -= dt;
        if (this.atkT <= 0 && this.pos.distanceTo(this.wp) < 30) {
          if (Math.random() < 0.55) { this.state = 'rockets'; this.stT = 0; this.rk = 0; }
          else { this.state = 'gun'; this.stT = 0; this.gunN = 18; }
        }
        if (this.stT > 18) { this.side *= -1; this.goTo('cross', new THREE.Vector3(0, 38, -110)); }
        break;
      }
      case 'cross':
        this.faceTarget.set(this.side * 80, 30, -60);
        if (this.pos.distanceTo(this.wp) < 20) this.goTo('side');
        break;
      case 'rockets':
        this.faceTarget.set(0, 3, P.pos.z);
        if (this.stT > 0.9 && this.rk < 2 && this.stT > 0.9 + this.rk * 0.35) {
          this.pod(this.rk, _v);
          const tgt = _w.copy(P.chest).add(_d.set(rr(-5, 5), rr(-1, 2), rr(-6, 6)));
          fireRocket(_v, _d.subVectors(tgt, _v).normalize(), { speed: 75 });
          this.rk++;
        }
        if (this.stT > 2.2) { this.state = 'side'; this.atkT = rr(4, 6.5); }
        break;
      case 'gun':
        this.faceTarget.set(0, 3, P.pos.z);
        this.gunT -= dt;
        if (this.gunT <= 0 && this.gunN > 0) {
          this.gunT = 0.08; this.gunN--;
          this.nose(_v);
          shootAtPlayer(_v, { dmg: 10, acc: 0.35, snd: 'dshk_far', vol: 1.1, flash: 2.5, width: 0.05, tracer: 0.7 });
        }
        if (this.gunN <= 0) { this.state = 'side'; this.atkT = rr(4, 6.5); }
        break;
      case 'retreat': // flee ahead toward the bridge, smoking
        maxSp = 60;
        if (gorge.active) { const gz = G.s - gorge.D - 45; this.wp.set(28, 45, gz - 30); this.faceTarget.set(0, 0, gz); }
        else this.wp.set(30, 50, -420);
        break;
      case 'lineup': // swings out over the gorge, side-on to the bridge, nose on the near span (rockets come from here)
        maxSp = 58;
        if (gorge.active) { const ez = G.s - gorge.D - gorge.span0; this.wp.set(-42, 22, ez - 30); this.faceTarget.set(0, 1, ez - 10); }
        break;
      case 'hover':
        maxSp = 60;
        if (gorge.active) { const gz = G.s - gorge.D - 45; this.wp.set(35, 50, gz - 70); this.faceTarget.set(0, 5, gz + 120); }
        break;
    }
    // steering (train frame)
    _d.subVectors(this.wp, this.pos);
    const want = _d.clone().multiplyScalar(0.9);
    if (want.length() > maxSp) want.setLength(maxSp);
    this.vel.lerp(want, Math.min(1, dt * 1.2));
    this.pos.addScaledVector(this.vel, dt);
    // orientation
    _d.subVectors(this.faceTarget, this.pos);
    const ty = Math.atan2(-_d.x, -_d.z);
    this.yaw += clamp(angDiff(this.yaw, ty), -1.4 * dt, 1.4 * dt);
    const air = _w.set(this.vel.x, this.vel.y, this.vel.z - G.v);
    const fwd = fwdYaw(this.yaw, _v);
    const fa = air.dot(fwd), sa = air.x * Math.cos(this.yaw) - air.z * Math.sin(this.yaw);
    this.pitch = damp(this.pitch, clamp(-fa * 0.006, -0.3, 0.25), 2, dt);
    this.roll = damp(this.roll, clamp(-sa * 0.008, -0.4, 0.4), 2, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.group.updateMatrixWorld(true);
    this.group.userData.rotor.rotation.y += dt * 26;
    this.group.userData.tail.rotation.x += dt * 70;
    this.snd.setPos(this.pos);
    // damage smoke
    const hpK = this.hp / this.maxHp;
    if (hpK < 0.75) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = hpK < 0.5 ? 0.03 : 0.08;
        _v.set(0.5, 1.2, 1.6).applyMatrix4(this.group.matrixWorld);
        G.fx.smoke(_v, { size: hpK < 0.5 ? 1.0 : 0.6, grow: 4, life: 3, color: hpK < 0.5 ? 0x141312 : 0x4a4a4a, alpha: 0.6, vy: 0, wind: 1 });
        if (hpK < 0.5 && Math.random() < 0.6) G.fx.add.spawn(_v.x, _v.y, _v.z, 0, 0.5, 0, { life: 0.25, size: 0.8, c: [1, 0.55, 0.2], alpha: 0.9, wind: 1 });
      }
    }
  }
  remove() { this.visible = false; G.scene.remove(this.group); this.snd.stop(); if (G.hind === this) G.hind = null; }
}

export function updateVehicles(dt) {
  for (let i = G.sleds.length - 1; i >= 0; i--) G.sleds[i].update(dt);
  if (G.hind) G.hind.update(dt);
  updateRockets(dt);
}

export function clearVehicles() {
  for (const s of [...G.sleds]) s.remove();
  G.sleds.length = 0;
  if (G.hind) G.hind.remove();
  G.rockets.length = 0;
}
