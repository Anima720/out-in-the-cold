// Ground-combat AI shared by Parts 1, 2 and 4: the Raider enemy, the squad mates' scripted behaviour (mateCustom),
// station routing through the fence gaps, and the steering helper. Split out of part5.js (v6) so AI work and
// Part 4 story work can proceed in separate files.
import { G, THREE, rr, ri, clamp, pick, yawOf, angDiff } from './core.js';
import { Human, J } from './humans.js';
import { moveChar, los } from './physics.js';
import { requestToken, releaseToken, shootAtPlayer, shootAt } from './ai.js';
import { throwNade, lobAt, NADES } from './grenade.js';
import { P } from './player.js';
import { play } from './audio.js';
import { S, ground5 } from './station.js';

const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
export const INSIDE = (x, z) => Math.abs(x) < 29.8 && z > -29.8 && z < 25.8;
export const IN_BLDG = (x, z) => Math.abs(x) < 7.9 && Math.abs(z) < 4.9;
export const ENTRY = [{ o: [0, -34], i: [0, -26.5] }, { o: [-20.5, -34], i: [-20.5, -26.5] }, { o: [-34, -12.5], i: [-26.5, -12.5] }, { o: [34, -4.5], i: [26.5, -4.5] }];

export function route(from, to) {
  const pts = [];
  const fin = INSIDE(from.x, from.z), tin = INSIDE(to.x, to.z);
  if (tin !== fin) {
    let best = ENTRY[0], bd = 1e9;
    for (const e of ENTRY) {
      const a = fin ? e.i : e.o, b = fin ? e.o : e.i;
      const d = Math.hypot(a[0] - from.x, a[1] - from.z) + Math.hypot(b[0] - to.x, b[1] - to.z);
      if (d < bd) { bd = d; best = e; }
    }
    const a = fin ? best.i : best.o, b = fin ? best.o : best.i;
    if (Math.hypot(a[0] - from.x, a[1] - from.z) > 4) pts.push({ x: a[0], z: a[1] }); // already at the gap: go straight through
    pts.push({ x: b[0], z: b[1] });
  }
  pts.push({ x: to.x, z: to.z });
  return pts;
}

// steer a character toward (tx,tz) through the collision world; sidesteps when stuck. returns true on arrival
export function walk(ent, h, tx, tz, speed, dt) {
  const dx = tx - h.pos.x, dz = tz - h.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.45) { h.vel.x = h.vel.z = 0; moveChar(h, dt, false); return true; }
  let vx = (dx / d) * speed, vz = (dz / d) * speed;
  ent.chk = (ent.chk ?? 1) - dt;
  if (ent.chk <= 0) { if ((ent.lastD ?? 1e9) - d < 0.3) { ent.detour = 0.9; ent.side = -(ent.side || 1); } ent.lastD = d; ent.chk = 1; }
  if (ent.detour > 0) { ent.detour -= dt; const s = ent.side || 1; vx = vx * 0.25 + (-dz / d) * s * speed; vz = vz * 0.25 + (dx / d) * s * speed; }
  h.vel.x = vx; h.vel.z = vz;
  moveChar(h, dt, false);
  return false;
}
export function prep(h, r = 0.3) { h.r = r; h.h = 1.75; h.grounded = true; }

// ---------- enemies ----------
export class Raider {
  constructor(x, z, o = {}) {
    this.jugg = !!o.jugg;
    const h = this.h = new Human(this.jugg ? 'jg' : 'ru');
    h.hp = this.jugg ? 1500 : 100;
    prep(h, this.jugg ? 0.4 : 0.3);
    h.pos.set(x, (G.groundFn || ground5)(x, z) + 0.05, z);
    h.yaw = yawOf(_t.set(-x, 0, -z));
    this.active = true; this.hasTok = false; this.burst = 0; this.t = rr(0.3, 1); this.losT = 0; this.hiddenT = 0;
    this.maxTier = o.maxTier ?? 2; this.tier = -1; this.spot = null; this.path = []; this.state = 'advance';
    this.side = Math.random() < 0.5 ? -1 : 1; this.coverT = 0; this.rpg = !!o.rpg; this.cover = o.cover || null; this.noRoute = !!o.cover;
    if (this.rpg) h.dropWeapon = 'rpg';
    h.onDeath = () => {
      releaseToken(this); this.freeSpot();
      if (Math.random() < 0.5) play('thud', { pos: h.pos, vol: 0.5, ref: 4 });
      if (this.jugg && G.p5JuggDown) G.p5JuggDown();
    };
    h.onHurt = () => {
      if (this.jugg) return;
      if (this.state === 'aim' || this.state === 'fire') { this.state = 'cover'; this.t = rr(0.5, 1.0); releaseToken(this); }
      if (h.hp > 0 && G.bark && Math.random() < 0.5) G.bark('RU_05', h.pos, true);
      this.hurtMove = true;
    };
    G.enemies.push(this);
    if (!this.jugg) this.pickNext(); else this.state = 'pause';
  }
  freeSpot() { if (this.spot) { this.spot.used = null; this.spot = null; } }
  pickNext() {
    const h = this.h;
    let opts = [];
    const CL = this.cover || S.cover;
    for (let t = Math.min(this.maxTier, this.tier + 1); t >= Math.max(0, this.tier) && !opts.length; t--) opts = CL.filter((c) => c.tier === t && !c.used);
    if (!opts.length) { this.state = 'cover'; this.coverT = 99; return; }
    let best = null, bs = 1e9;
    for (const c of opts) { const s = Math.hypot(c.x - h.pos.x, c.z - h.pos.z) + rr(0, 14); if (s < bs) { bs = s; best = c; } }
    this.freeSpot(); this.spot = best; best.used = this; this.tier = best.tier;
    this.path = this.noRoute ? [{ x: best.x, z: best.z }] : route(h.pos, best); this.state = 'advance'; releaseToken(this);
  }
  update(dt) {
    const h = this.h; if (!h.alive) return;
    const eye = _o.copy(h.j[J.Hc]);
    const toP = _t.subVectors(P.eye, eye); const dist = toP.length();
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.3; this.seen = P.alive && los(_e.copy(eye).setY(eye.y + 0.35), P.eye); }
    this.hiddenT = this.seen ? 0 : this.hiddenT + dt;
    this.t -= dt;
    if (this.jugg) return this.juggUpdate(dt, dist, toP);
    // scatter from the player's grenades
    const nd = NADES.find((n) => n.owner !== 'enemy' && n.pos.distanceTo(h.pos) < 4.5);
    if (nd) {
      _e.subVectors(h.pos, nd.pos).setY(0).normalize();
      walk(this, h, h.pos.x + _e.x * 3, h.pos.z + _e.z * 3, 4.5, dt);
      h.crouchT = 0; h.aimTarget = 0.2; if (this.state === 'aim' || this.state === 'fire') { this.state = 'cover'; releaseToken(this); }
      return;
    }
    const faceP = () => { h.aim.copy(toP).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -5 * dt, 5 * dt); };
    switch (this.state) {
      case 'advance': {
        h.crouchT = 0.3; h.aimTarget = 0.35;
        const wp = this.path[0];
        if (!wp) { this.state = 'cover'; this.coverT = rr(8, 15); this.t = rr(0.3, 0.9); break; }
        if (walk(this, h, wp.x, wp.z, 4.3, dt)) this.path.shift();
        if (Math.abs(h.vel.x) + Math.abs(h.vel.z) > 0.3) { h.aim.set(h.vel.x, 0, h.vel.z).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -7 * dt, 7 * dt); }
        break;
      }
      case 'cover':
        h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
        h.crouchT = 1; h.aimTarget = 0.3; faceP();
        this.coverT -= dt;
        if ((this.coverT <= 0 || this.hurtMove) && this.tier < this.maxTier) { this.hurtMove = false; this.pickNext(); break; }
        this.hurtMove = false;
        if (this.t <= 0) {
          if (this.rpg && this.seen !== undefined && G.p5Rpg && G.p5Rpg(this)) { this.t = rr(3, 5); h.crouchT = 0; h.aimTarget = 1; break; }
          if (this.hiddenT > 4 && dist > 8 && dist < 28 && G.t - (G.lastEnemyNade ?? -99) > 13 && !NADES.some((n) => n.owner === 'enemy') && Math.random() < 0.4) { this.state = 'throw'; this.t = 0.45; this.hiddenT = 0; }
          else if (this.seen && requestToken(this)) { this.state = 'aim'; this.t = rr(0.35, 0.6); }
          else if (!this.seen && Math.random() < 0.55 && (this.mt = visibleMate(eye))) { this.state = 'aimM'; this.t = 0.35; }
          else this.t = rr(0.4, 0.9);
        }
        break;
      case 'aim':
        h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
        h.crouchT = 0; h.aimTarget = 1; faceP();
        if (this.t <= 0) { this.state = 'fire'; this.burst = 3 + ri(0, 3); this.t = 0; }
        break;
      case 'fire':
        h.crouchT = 0; h.aimTarget = 1; faceP();
        if (this.t <= 0) {
          this.t = 0.12; this.burst--; h.recoil = 1;
          shootAtPlayer(_e.copy(h.j[J.W1]), { dmg: 6 + ri(0, 2) });
          if (this.burst <= 0) { this.state = 'cover'; this.t = rr(1.2, 2.6); releaseToken(this); if (G.bark && Math.random() < 0.15) G.bark(pick(['RU_02', 'RU_06']), h.pos); }
        }
        break;
      case 'aimM': case 'fireM': {
        const m = this.mt;
        if (!m || !m.h.alive) { this.state = 'cover'; this.t = 0.5; break; }
        h.crouchT = 0; h.aimTarget = 1;
        h.aim.subVectors(m.h.j[J.Ne], eye).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -5 * dt, 5 * dt);
        if (this.state === 'aimM') { if (this.t <= 0) { this.state = 'fireM'; this.burst = 3 + ri(0, 3); this.t = 0; } break; }
        if (this.t <= 0) {
          this.t = 0.12; this.burst--; h.recoil = 1;
          shootAt(h, _e.copy(h.j[J.W1]), _d.copy(m.h.j[J.Ne]).add(_o.set(rr(-0.6, 0.6), rr(-0.3, 0.6), rr(-0.6, 0.6))), { dmg: 0, skip: 'ru', spread: 0.04, tracer: 0.45, vol: 0.55 });
          if (this.burst <= 0) { this.state = 'cover'; this.t = rr(1.2, 2.4); }
        }
        break;
      }
      case 'throw':
        h.crouchT = 0; h.aimTarget = 0; faceP();
        if (this.t <= 0) {
          const from = _e.copy(h.j[J.HR]).setY(h.j[J.HR].y + 0.35);
          const tgt = _d.copy(P.pos).add(_o.set(rr(-1.5, 1.5), 0.1, rr(-1.5, 1.5)));
          throwNade(from, lobAt(from, tgt, clamp(dist / 13, 0.9, 1.7)), 'enemy');
          G.lastEnemyNade = G.t; this.state = 'cover'; this.t = rr(1.5, 2.5);
          if (G.bark) G.bark('RU_03', h.pos);
        }
        break;
    }
  }
  juggUpdate(dt, dist, toP) {
    const h = this.h;
    h.crouchT = 0; h.aimTarget = 1;
    h.aim.copy(toP).normalize();
    h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -2.2 * dt, 2.2 * dt);
    this.repathT = (this.repathT ?? 0) - dt;
    if (this.repathT <= 0) {
      this.repathT = 2;
      const tgt = IN_BLDG(P.pos.x, P.pos.z) || P.pos.y > 3 ? { x: clamp(P.pos.x, -5, 5), z: -9 } : { x: P.pos.x, z: P.pos.z };
      this.path = route(h.pos, tgt);
    }
    const wp = this.path[0];
    if (dist > 3.5 && wp) { if (walk(this, h, wp.x, wp.z, 1.7, dt)) this.path.shift(); }
    else { h.vel.x = h.vel.z = 0; moveChar(h, dt, false); }
    this.stepT = (this.stepT ?? 0) - dt * Math.hypot(h.vel.x, h.vel.z);
    if (this.stepT <= 0) { this.stepT = 0.9; play('thud', { pos: h.pos, vol: 0.35, ref: 6, rate: 0.7 }); }
    if (this.state === 'fire') {
      if (this.t <= 0) {
        this.t = 0.085; this.burst--; h.recoil = 1;
        shootAtPlayer(_e.copy(h.j[J.W1]), { dmg: 7, acc: 0.55, snd: 'ak_far', vol: 1.0, tracer: 0.7, flash: 1.6 });
        if (this.burst <= 0 || !this.seen) { this.state = 'pause'; this.t = rr(0.8, 1.4); }
      }
    } else if (this.t <= 0) {
      if (this.seen) { this.state = 'fire'; this.burst = 10 + ri(0, 8); this.t = 0; }
      else if (!this.seen && (this.mt = visibleMate(_o.copy(h.j[J.Hc])))) {
        this.t = 0.9;
        for (let i = 0; i < 5; i++) setTimeout(() => { if (h.alive && this.mt) shootAt(h, h.j[J.W1].clone(), this.mt.h.j[J.Ne].clone().add(_o.set(rr(-0.7, 0.7), rr(-0.3, 0.6), rr(-0.7, 0.7))), { dmg: 0, skip: 'jg', spread: 0.04, tracer: 0.6 }); }, i * 90);
      } else this.t = 0.4;
    }
    this.meleeT = (this.meleeT ?? 0) - dt;
    if (dist < 2.3 && this.meleeT <= 0 && P.alive) { this.meleeT = 1.6; P.damage(38, h.pos); P.addShake(0.7); play('thud', { vol: 0.9, rev: 0 }); }
  }
}

export function visibleMate(eye) {
  let best = null, bd = 80;
  for (const m of G.mates) {
    if (!m.h.alive || m.h.hidden) continue;
    const d = m.h.pos.distanceTo(eye);
    if (d < bd && los(eye, m.h.j[J.Ne])) { bd = d; best = m; }
  }
  return best;
}


export function mateCustom(m) {
  return (dt) => {
    const h = m.h;
    if (!h.alive) return;
    if (m.p5 === 'walk') {
      const wp = m.path[0];
      h.crouchT = 0; h.aimTarget = 0.25;
      if (!wp) { m.p5 = m.next || 'idle'; return; }
      if (walk(m, h, wp.x, wp.z, m.walkSpeed || 4.2, dt)) m.path.shift();
      if (Math.abs(h.vel.x) + Math.abs(h.vel.z) > 0.3) { h.aim.set(h.vel.x, 0, h.vel.z).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -7 * dt, 7 * dt); }
      return;
    }
    h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
    const faceYaw = (y, r = 4) => { h.yaw += clamp(angDiff(h.yaw, y), -r * dt, r * dt); };
    switch (m.p5) {
      case 'idle': h.crouchT = 0; h.aimTarget = 0.2; if (m.yaw0 !== undefined) faceYaw(m.yaw0); break;
      case 'console': h.crouchT = 0; h.aimTarget = 0; h.noWeapon = true; faceYaw(Math.PI / 2); break;
      case 'defend': {
        h.noWeapon = false;
        m.ct -= dt;
        if (m.cs === 'crouch') {
          h.crouchT = 1; h.aimTarget = 0.3; faceYaw(m.yaw0 ?? 0);
          if (m.ct <= 0) { m.cs = 'peek'; m.ct = rr(2.2, 4); }
        } else {
          h.crouchT = 0;
          const tgt = m.pickTarget();
          if (tgt) m.fireAt(tgt, dt); else { h.aimTarget = 0.6; faceYaw(m.yaw0 ?? 0); }
          if (m.ct <= 0) { m.cs = 'crouch'; m.ct = rr(0.9, 1.8); }
        }
        break;
      }
      case 'wounded': h.noWeapon = true; h.aimTarget = 0; h.crouchT = 0; break;
      case 'kneel': h.crouchT = 1; h.aimTarget = 0; if (m.look) faceYaw(yawOf(_e.subVectors(m.look, h.pos))); break;
      case 'sitTalk': h.noWeapon = true; h.aimTarget = 0; break;
    }
  };
}
export function goMate(m, pts, next, speed) { m.path = pts.map(([x, z]) => ({ x, z })); m.next = next; m.p5 = 'walk'; m.walkSpeed = speed; m.chk = 1; m.lastD = 1e9; }

export function placeMate(m, x, z, y) { m.h.pos.set(x, y ?? (G.groundFn || ground5)(x, z), z); m.h.vel.set(0, 0, 0); }
