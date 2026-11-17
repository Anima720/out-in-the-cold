import { G, THREE, rr, clamp, damp, lerp, yawOf, angDiff, fwdYaw, pick } from './core.js';
import { Human, J } from './humans.js';
import { raycast, los, supportAt, groundY, rayBoxes } from './physics.js';
import { play } from './audio.js';
import { T, GUN_PIVOT, DECK, ORE, carAt, COVER, deckY } from './train.js';
import { throwNade, lobAt, NADES } from './grenade.js';

// ---------- attack tokens: limits how many enemies shoot at the player at once
export const TOK = { n: 0, last: -9 };
export function requestToken(e) {
  if (e.hasTok) return true;
  const alive = G.enemies.filter((x) => x.h.alive).length + G.sleds.filter((s) => s.gunner && s.gunner.alive).length;
  const max = 2;
  if (TOK.n >= max || G.t - TOK.last < 0.55) return false;
  TOK.n++; TOK.last = G.t; e.hasTok = true; return true;
}
export function releaseToken(e) { if (e.hasTok) { e.hasTok = false; TOK.n = Math.max(0, TOK.n - 1); } }

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3();

// enemy shot at the player: hit chance model + visible tracer / near-miss
export function shootAtPlayer(muzzle, o = {}) {
  const P = G.player;
  const dist = muzzle.distanceTo(P.eye);
  let p = clamp(0.4 - dist * 0.01, 0.06, 0.34) * (o.acc || 1);
  if (P.moving) p *= 0.75; if (P.crouched) p *= 0.75; if (P.sprinting) p *= 0.6;
  const visHead = los(muzzle, P.eye), visChest = los(muzzle, P.chest);
  if (!visHead && !visChest) p = 0; else if (!visChest) p *= 0.5;
  const hitP = Math.random() < p;
  if (hitP) _t.copy(visChest ? P.chest : P.eye).add(_e.set(rr(-0.15, 0.15), rr(-0.2, 0.2), rr(-0.15, 0.15)));
  else _t.copy(P.eye).add(_e.set(rr(-1, 1), rr(-0.8, 1.0), rr(-1, 1)).normalize().multiplyScalar(rr(0.5, 1.6)));
  _d.subVectors(_t, muzzle).normalize();
  let end;
  if (hitP) {
    end = _t.clone();
    P.damage(o.dmg || 11, muzzle);
  } else {
    const h = raycast(muzzle, _d, 300, null, { noCorpse: true });
    end = h ? h.point.clone() : _o.copy(muzzle).addScaledVector(_d, 300).clone();
    if (h) { G.fx.impact(h.point, h.normal, h.mat); if (h.box && h.point.distanceTo(P.eye) < 12) G.fx.decal(h.point, h.normal, 0.07); if (h.point.distanceTo(P.eye) < 6) play(h.mat === 'metal' ? (Math.random() < 0.3 ? 'ricochet' : 'metal') : 'soft', { pos: h.point, vol: 0.6, ref: 3 }); }
    // near miss whiz
    const toEye = _e.subVectors(P.eye, muzzle); const along = toEye.dot(_d);
    if (along > 0 && along < muzzle.distanceTo(end) + 1) {
      const closest = toEye.addScaledVector(_d, -along).length();
      if (closest < 1.8) { play(Math.random() < 0.5 ? 'whiz' : 'crack', { pos: P.eye.clone().addScaledVector(_d, 0.5), vol: 0.5, ref: 2, rev: 0 }); }
    }
  }
  if (Math.random() < (o.tracer ?? 0.45)) G.fx.tracer(muzzle, end, { start: 1, width: o.width || 0.025, speed: 300 });
  G.fx.muzzle(muzzle, _d, o.flash || 1);
  G.fx.flash(muzzle, 0xffb060, 10, 8, 0.05);
  play(o.snd || 'ak_far', { pos: muzzle, vol: o.vol ?? 0.8, ref: 6, rev: 0.5 });
}

// NPC shot at an arbitrary target entity (teammates -> enemies, enemies -> teammates)
export function shootAt(shooter, muzzle, target, o = {}) {
  _d.subVectors(target, muzzle).normalize();
  const sp = o.spread ?? 0.03;
  _d.x += rr(-sp, sp); _d.y += rr(-sp, sp); _d.z += rr(-sp, sp); _d.normalize();
  const h = raycast(muzzle, _d, 300, shooter, { factionSkip: o.skip, noCorpse: true });
  const end = h ? h.point.clone() : muzzle.clone().addScaledVector(_d, 300);
  if (h) {
    if (h.ent && h.ent.hurt && o.dmg) {
      if (h.ent.faction === 'us' || !(o.hitChance !== undefined && Math.random() > o.hitChance)) h.ent.hurt(o.dmg, _d, h.part, h.joint, { force: 5 });
      G.fx.impact(h.point, h.normal, h.ent.faction ? 'flesh' : 'metal');
    } else G.fx.impact(h.point, h.normal, h.mat);
  }
  if (Math.random() < (o.tracer ?? 0.35)) G.fx.tracer(muzzle, end, { start: 1, speed: 300 });
  G.fx.muzzle(muzzle, _d, 1);
  play(o.snd || 'ak_far', { pos: muzzle, vol: o.vol ?? 0.7, ref: 6, rev: 0.5 });
}

// ---------- train enemies ----------
export const SPAWNS = [
  // [x, z, kind]  cover is the obstacle at +z of the position (toward the player)
  [-0.95, 8.4, 'c'], [0.95, 12.6, 'c'],
  [0.75, -0.6, 'c'], [-0.75, -5.8, 'c'],
  [-0.95, -14.8, 'c'], [0.95, -18.6, 'c'], [-0.95, -22.2, 'c'],
  [0.78, -28.6, 'c'], [-0.78, -32.4, 'c'], [0.72, -35.8, 'c'],
  [-0.95, -42.0, 'c'], [0, 0, 'gunner'], [0.6, -49.6, 'rusher'],
];

export class Enemy {
  constructor(x, z, kind) {
    this.h = new Human('ru');
    this.h.hp = kind === 'gunner' ? 70 : 100;
    this.kind = kind; this.home = new THREE.Vector3(x, 0, z);
    this.state = 'idle'; this.t = rr(0.5, 2); this.active = false; this.hasTok = false; this.burst = 0;
    this.h.yaw = 0; // faces -z by default; player comes from +z
    this.h.yaw = Math.PI; // face +z (toward the rear)
    const sup = supportAt(x, z, 0.2, 3, 3);
    this.h.pos.set(x, sup.y, z);
    this.h.onDeath = (part) => {
      releaseToken(this);
      if (Math.random() < 0.5) play('thud', { pos: this.h.pos, vol: 0.5, ref: 4 });
      if (G.onEnemyKilled) G.onEnemyKilled(this);
    };
    this.h.onHurt = () => {
      if (this.state === 'fire' || this.state === 'aim') { this.state = 'cover'; this.t = rr(0.6, 1.2); releaseToken(this); }
      this.wake();
      if (this.h.hp > 0 && G.bark && Math.random() < 0.6) G.bark('RU_05', this.h.pos, true);
      if (this.h.hp > 0 && Math.random() < 0.5) this.wantMove = true;
    };
    if (kind === 'gunner') this.updateGunnerPos();
    G.enemies.push(this);
  }
  wake() { if (!this.active) { this.active = true; this.state = 'cover'; this.t = rr(1.0, 2.2); if (G.bark && Math.random() < 0.45) G.bark(pick(['RU_01', 'RU_04']), this.h.pos); } }
  updateGunnerPos() {
    const D = T.dshk; const f = fwdYaw(D.yaw.rotation.y), h = this.h;
    h.pos.set(GUN_PIVOT.x - f.x * 0.95, DECK, GUN_PIVOT.z - f.z * 0.95);
    h.yaw = D.yaw.rotation.y;
    // hands stay on the spade grips, also before he is alerted (he visibly mans the gun)
    D.yaw.updateMatrixWorld(true); h.noWeapon = true;
    if (!this.active) h.aim.copy(f);
    h.grips = h.grips || { R: new THREE.Vector3(), L: new THREE.Vector3() };
    D.pitch.localToWorld(h.grips.R.set(0.09, -0.02, 0.5)); D.pitch.localToWorld(h.grips.L.set(-0.09, -0.02, 0.5));
  }
  update(dt) {
    const h = this.h; if (!h.alive) return;
    const P = G.player;
    h.vel.set(0, 0, 0); h.onGround = false;
    const eye = _o.copy(h.j[J.Hc]);
    const toP = _t.subVectors(P.eye, eye); const dist = toP.length();
    if (!this.active) {
      h.crouchT = 0; h.aimTarget = 0.2;
      if (dist < 34 && (los(eye, P.eye) || dist < 14)) this.wake();
      if (G.lastShotT && G.t - G.lastShotT < 0.1 && dist < 22) this.wake();
      return;
    }
    // aim at player
    h.aim.copy(toP).normalize();
    const wantYaw = yawOf(h.aim);
    if (this.kind === 'gunner') { // v7: heavy MG with its own fire cadence (no attack token: he was starved and never fired)
      const D = T.dshk;
      D.pitch.updateMatrixWorld(true);
      const mz = D.pitch.localToWorld((this.mzV || (this.mzV = new THREE.Vector3())).copy(D.muzzleLocal)); // own vector: shootAtPlayer reuses _e
      this.losT = (this.losT || 0) - dt;
      if (this.losT <= 0) { // who can he hit: the player (also keeps hammering his cover for 3 s after losing him), else a teammate
        this.losT = 0.3;
        if (dist < 80 && (los(mz, P.eye) || los(mz, P.chest))) { this.seenT = G.t; this.mt = null; }
        else if (G.t - (this.seenT ?? -99) > 3) { this.mt = null; for (const m of G.mates) if (m.h.alive && !m.h.hidden && m.h.pos.distanceTo(GUN_PIVOT) < 70 && los(mz, m.h.j[J.Ne])) { this.mt = m; break; } }
      }
      const onP = G.t - (this.seenT ?? -99) < 3, tgt = onP ? P.chest : this.mt ? this.mt.h.j[J.Ne] : null;
      if (tgt) h.aim.subVectors(tgt, GUN_PIVOT).normalize();
      const wy = yawOf(h.aim), wp = Math.asin(clamp(h.aim.y, -0.5, 0.6));
      D.yaw.rotation.y += clamp(angDiff(D.yaw.rotation.y, wy), -1.8 * dt, 1.8 * dt);
      D.pitch.rotation.x = damp(D.pitch.rotation.x, wp, 5, dt);
      this.updateGunnerPos(); h.crouchT = 0.25; h.aimTarget = 0;
      this.t -= dt;
      if (this.state === 'fire') {
        if (!tgt) { this.state = 'cover'; this.t = 0.8; }
        else if (this.t <= 0) {
          this.t = 0.11; this.burst--; h.recoil = 1; D.pitch.rotation.x += 0.012;
          const near = mz.distanceTo(P.eye) < 30;
          if (onP) shootAtPlayer(mz, { dmg: 13, acc: 0.65, snd: near ? 'dshk' : 'dshk_far', vol: near ? 0.8 : 1.1, flash: 2.2, width: 0.05, tracer: 0.75 });
          else shootAt(h, mz, _t.copy(tgt).add(_o.set(rr(-0.7, 0.7), rr(-0.4, 0.5), rr(-0.7, 0.7))), { dmg: 0, skip: 'ru', spread: 0.03, tracer: 0.7, snd: near ? 'dshk' : 'dshk_far', vol: 0.9 });
          if (this.burst <= 0) { this.state = 'cover'; this.t = rr(1.5, 2.7); if (G.bark && Math.random() < 0.2) G.bark('RU_02', h.pos); }
        }
      } else if (this.t <= 0) {
        if (tgt && Math.abs(angDiff(D.yaw.rotation.y, wy)) < 0.1) { this.state = 'fire'; this.burst = 5 + (Math.random() * 5 | 0); this.t = 0.15; }
        else this.t = 0.25;
      }
      return;
    }
    h.yaw += clamp(angDiff(h.yaw, wantYaw), -4 * dt, 4 * dt);
    this.t -= dt;
    const close = dist < 5;
    // visibility memory (for grenade decisions)
    this.losT = (this.losT || 0) - dt;
    if (this.losT <= 0) { this.losT = 0.25; this.seen = los(_e.copy(eye).setY(eye.y + 0.4), P.eye); }
    this.hiddenT = this.seen ? 0 : (this.hiddenT || 0) + dt;
    // scatter away from a player grenade
    if (this.flee && this.flee.t > 0) {
      this.flee.t -= dt;
      const car = carAt(h.pos.z);
      const dir = Math.sign(h.pos.z - this.flee.from.z) || 1;
      let nz = h.pos.z + dir * 3.8 * dt;
      if (car) nz = clamp(nz, car.z0 + 0.6, car.z1 - 0.6);
      h.vel.z = dt > 0 ? (nz - h.pos.z) / dt : 0; h.pos.z = nz;
      h.pos.y = supportAt(h.pos.x, h.pos.z, 0.2, h.pos.y, 0.6).y;
      h.crouchT = 0; h.aimTarget = 0.2;
      if (this.state !== 'cover') { this.state = 'cover'; releaseToken(this); }
      this.t = Math.max(this.t, 0.4);
      return;
    }
    if (this.state === 'throw') {
      h.crouchT = 0; h.aimTarget = 0;
      if (this.t <= 0) {
        const from = _e.copy(h.j[J.HR]).setY(h.j[J.HR].y + 0.35);
        const tgt = _t.copy(P.pos).add(_o.set(rr(-1.2, 1.2), 0.1, rr(-1.2, 1.2)));
        const T2 = clamp(dist / 13, 0.9, 1.6);
        throwNade(from, lobAt(from, tgt, T2), 'enemy');
        G.lastEnemyNade = G.t;
        this.state = 'cover'; this.t = rr(1.5, 2.5);
      }
      return;
    }
    // occasionally relocate to another cover spot on the same car
    this.relT = (this.relT ?? rr(7, 13)) - dt;
    if (this.kind === 'c' && this.state === 'cover' && (this.relT <= 0 || this.wantMove)) {
      this.relT = rr(8, 14); this.wantMove = false;
      const car = carAt(h.pos.z);
      const opts = COVER.enemy.filter((c) => c.car === car && Math.hypot(c.x - h.pos.x, c.z - h.pos.z) > 1 && !G.enemies.some((o) => o !== this && o.h.alive && Math.hypot(o.h.pos.x - c.x, o.h.pos.z - c.z) < 1));
      if (opts.length) { this.dest = pick(opts); this.state = 'move'; releaseToken(this); }
    }
    switch (this.state) {
      case 'move':
        h.crouchT = 0.35; h.aimTarget = 0.3;
        if (laneMove(h, this.dest.x, this.dest.z, 3.4, dt)) { this.state = 'cover'; this.t = rr(0.4, 1.0); }
        break;
      case 'cover':
        h.crouchT = this.kind === 'rusher' ? 0 : 1; h.aimTarget = 0.3;
        if (this.kind === 'rusher' && P.pos.z < -20) { // charge toward the player along the center lane
          const tz = P.pos.z + 4;
          const dz = clamp(tz - h.pos.z, -3.5, 3.5);
          if (Math.abs(tz - h.pos.z) > 1.5) { h.vel.z = dz; h.pos.z += dz * dt; h.pos.x = damp(h.pos.x, 0, 3, dt); const s = supportAt(h.pos.x, h.pos.z, 0.2, h.pos.y, 0.6); h.pos.y = s.y; }
        }
        if (this.t <= 0) {
          if (this.hiddenT > 3 && dist > 7 && dist < 26 && G.t - (G.lastEnemyNade ?? -99) > 11 && !NADES.some((n) => n.owner === 'enemy') && Math.random() < 0.55) {
            this.state = 'throw'; this.t = 0.45; this.hiddenT = 0;
          } else if ((close || this.seen) && requestToken(this)) { this.state = 'aim'; this.t = close ? 0.15 : rr(0.35, 0.55); }
          else this.t = rr(0.3, 0.7);
        }
        break;
      case 'aim':
        h.crouchT = 0; h.aimTarget = 1;
        if (this.t <= 0) { this.state = 'fire'; this.burst = 3 + (Math.random() * 4 | 0); this.t = 0; }
        break;
      case 'fire':
        h.crouchT = 0; h.aimTarget = 1;
        if (this.t <= 0) {
          this.t = 0.12; this.burst--;
          h.recoil = 1;
          const mz = _e.copy(h.j[J.W1]);
          shootAtPlayer(mz, { dmg: 6 + (Math.random() * 3 | 0) });
          if (this.burst <= 0) { this.state = 'cover'; this.t = close ? rr(0.3, 0.6) : rr(1.2, 2.6); releaseToken(this); if (G.bark && Math.random() < 0.18) G.bark('RU_02', this.h.pos); }
        }
        break;
    }
  }
}

export function spawnTrainEnemies(minZ = -999) {
  for (const [x, z, k] of SPAWNS) {
    if (k !== 'gunner' && z > minZ) continue;
    new Enemy(x, z, k);
  }
}

// ---------- walking on the train: centre lane between cars, never drop into a gap
const _lane = new THREE.Vector3();
export function laneMove(h, tx, tz, speed, dt) {
  const dx = tx - h.pos.x, dz = tz - h.pos.z;
  let vx = 0, vz = 0;
  if (Math.abs(dz) > 0.35) {
    if (Math.abs(h.pos.x) > 0.16) vx = -Math.sign(h.pos.x) * speed;
    else { vz = Math.sign(dz) * Math.min(speed, Math.abs(dz) * 3); vx = -h.pos.x * 4; }
  } else if (Math.abs(dx) > 0.06) vx = Math.sign(dx) * Math.min(speed * 0.8, Math.abs(dx) * 4);
  h.pos.x += vx * dt; h.pos.z += vz * dt;
  h.pos.x = clamp(h.pos.x, -1.35, 1.35);
  h.pos.y = deckY(h.pos.x, h.pos.z, h.pos.y);
  h.vel.set(vx, 0, vz);
  const moving = Math.abs(vx) + Math.abs(vz) > 0.05;
  if (moving) h.yaw += clamp(angDiff(h.yaw, yawOf(_lane.set(vx, 0, vz))), -7 * dt, 7 * dt);
  return !moving && Math.abs(dx) < 0.12 && Math.abs(dz) < 0.4;
}

// ---------- teammates ----------
export class Mate {
  constructor(name, head, offs) {
    this.name = name;
    this.h = new Human('us', { head, invuln: true, name: name, torso: name === 'TRUCK' ? 'torso_big' : null });
    this.offs = offs; this.mode = 'idle'; this.target = new THREE.Vector3(); this.fireT = rr(0.5, 1.5); this.burst = 0;
    this.speed = 4.2; this.arc = null; this.spot = null; this.cs = 'move'; this.ct = 0; this.pickT = 0;
    G.mates.push(this);
  }
  place(x, z, y = null) {
    const s = supportAt(x, z, 0.2, 5, 5);
    this.h.pos.set(x, y ?? s.y, z); this.target.copy(this.h.pos);
  }
  jumpTo(x, y, z, dur = 0.55, h = 0.8) {
    this.arc = { from: this.h.pos.clone(), to: new THREE.Vector3(x, y, z), t: 0, dur, h };
  }
  pickTarget(fromEye) {
    const eye = fromEye || this.h.j[J.Hc];
    let best = null, bd = 60;
    for (const e of G.enemies) {
      if (!e.h.alive || !e.active) continue;
      const d = e.h.j[J.P].distanceTo(eye);
      if (d < bd && los(eye, e.h.j[J.Ne])) { bd = d; best = e.h.j[J.Ne]; }
    }
    for (const s of G.sleds) {
      if (s.dead) continue;
      const tgt = s.gunner && s.gunner.alive ? s.gunner : s.driver;
      if (!tgt || !tgt.alive) continue;
      const d = tgt.j[J.P].distanceTo(eye);
      if (d < bd + 10 && los(eye, tgt.j[J.Ne])) { bd = d; best = tgt.j[J.Ne]; }
    }
    if (!best && G.hind && G.hind.visible && G.hind.pos.distanceTo(eye) < 220) best = G.hind.pos;
    return best;
  }
  fireAt(tgt, dt) {
    const h = this.h;
    h.aim.subVectors(tgt, h.j[J.Hc]).normalize();
    h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -5 * dt, 5 * dt);
    h.aimTarget = 1;
    this.fireT -= dt;
    if (this.fireT <= 0) {
      if (this.burst <= 0) this.burst = 3 + (Math.random() * 3 | 0);
      this.burst--; this.fireT = this.burst > 0 ? 0.11 : rr(0.9, 2.0);
      h.recoil = 1;
      const isHind = G.hind && tgt === G.hind.pos;
      shootAt(h, _e.copy(h.j[J.W1]), isHind ? _t.copy(tgt).add(_o.set(rr(-2, 2), rr(-1, 1), rr(-2, 2))) : tgt, { dmg: isHind ? 0 : 30, hitChance: 0.28, skip: 'us', snd: 'm4', vol: 0.75, spread: 0.02 });
      if (isHind && Math.random() < 0.4) G.hind.hurt(4, null);
      return this.burst <= 0;
    }
    return false;
  }
  update(dt) {
    const h = this.h; if (h.hidden) return;
    if (this.custom) return this.custom(dt);
    h.vel.set(0, 0, 0);
    if (this.arc) {
      const a = this.arc; a.t += dt; const u = Math.min(1, a.t / a.dur);
      h.pos.lerpVectors(a.from, a.to, u); h.pos.y += Math.sin(u * Math.PI) * a.h;
      h.crouchT = 0.5; h.aimTarget = 0;
      if (u >= 1) { this.arc = null; this.target.copy(h.pos); if (this.onArcDone) { const f = this.onArcDone; this.onArcDone = null; f(); } }
      return;
    }
    if (this.mode === 'run' || this.mode === 'ground' || this.mode === 'jump') return this.groundUpdate(dt);
    if (this.mode === 'cab') { // Grinch heading for the cab: vault the sandbag ring, then the door
      if (h.pos.z > -44.4) laneMove(h, 0, -44.6, 5, dt);
      else if (h.pos.z > -49) { this.jumpTo(0.95, DECK, -49.3, 0.55, 0.75); this.onArcDone = () => this.target.set(0.85, 0, -50.7); }
      else laneMove(h, this.target.x, this.target.z, 3.5, dt);
      h.aimTarget = 0; h.crouchT = 0;
      return;
    }
    if (this.mode === 'hold') { // stand at an assigned spot and fight
      const arrived = laneMove(h, this.target.x, this.target.z, 3.5, dt);
      const tgt = arrived ? this.pickTarget() : null;
      h.crouchT = 0;
      if (tgt) this.fireAt(tgt, dt); else { h.aimTarget = 0.4; }
      return;
    }
    // follow: leapfrog between cover spots behind the battle line
    this.pickT -= dt;
    if (this.pickT <= 0 || !this.spot) { this.pickT = 0.6; this.chooseSpot(); }
    const sp = this.spot;
    const arrived = laneMove(h, sp.x, sp.z, this.speed, dt);
    if (!arrived) { this.cs = 'move'; h.crouchT = 0; h.aimTarget = 0.2; h.aim.copy(fwdYaw(h.yaw, _d)); h.aim.y = -0.1; return; }
    if (this.cs === 'move') { this.cs = 'crouch'; this.ct = rr(0.6, 1.4); }
    this.ct -= dt;
    const standEye = _o.copy(h.pos).setY(h.pos.y + 1.62);
    if (this.cs === 'crouch') {
      h.crouchT = 1; h.aimTarget = 0.5;
      h.yaw += clamp(angDiff(h.yaw, 0), -4 * dt, 4 * dt); // face the engine
      if (this.ct <= 0) { const t = this.pickTarget(standEye); this.cs = t ? 'peek' : 'crouch'; this.ct = t ? rr(1.4, 2.6) : rr(0.6, 1.2); }
    } else if (this.cs === 'peek') {
      h.crouchT = 0;
      const tgt = this.pickTarget();
      if (!tgt || this.ct <= 0) { this.cs = 'crouch'; this.ct = rr(1.0, 2.2); }
      else if (this.fireAt(tgt, dt) && Math.random() < 0.5) { this.cs = 'crouch'; this.ct = rr(0.8, 1.8); }
    }
  }
  chooseSpot() {
    const P = G.player;
    let line = -999;
    for (const e of G.enemies) if (e.h.alive && e.kind !== 'gunner') line = Math.max(line, e.h.pos.z);
    const want = P.pos.z + this.offs[1];
    const taken = G.mates.filter((m) => m !== this && m.spot).map((m) => m.spot);
    let best = null, bd = 1e9;
    for (const c of COVER.mate) {
      if (line > -999 && c.z < line + 3.5) continue;
      if (taken.some((t) => Math.abs(t.z - c.z) < 1 && Math.abs(t.x - c.x) < 0.5)) continue;
      const d = Math.abs(c.z - want) + (c.z < P.pos.z - 6 ? 6 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best || bd > 7) { // open ground on the centre lane
      let z = clamp(want, line > -999 ? line + 4.5 : -44.5, 30);
      if (taken.some((t) => Math.abs(t.z - z) < 1)) z += 1.4;
      best = { x: this.offs[0] * 0.5, z, h: 0 };
    }
    if (!this.spot || Math.abs(best.z - this.spot.z) > 0.6 || Math.abs(best.x - this.spot.x) > 0.3) this.spot = best;
  }
  groundUpdate(dt) {
    const h = this.h;
    if (this.mode === 'ground') { h.pos.z += G.v * dt; this.target.z += G.v * dt; }
    const dx = this.target.x - h.pos.x, dz = this.target.z - h.pos.z, dist = Math.hypot(dx, dz);
    if (dist > 0.3) {
      const sp = Math.min(this.speed, dist * 3);
      h.vel.x = (dx / dist) * sp; h.vel.z = (dz / dist) * sp;
      h.pos.x += h.vel.x * dt; h.pos.z += h.vel.z * dt;
      h.yaw += clamp(angDiff(h.yaw, yawOf(_d.set(dx, 0, dz))), -6 * dt, 6 * dt);
    }
    h.pos.y = groundY(h.pos.x, h.pos.z);
    if (this.mode === 'ground') h.vel.z += G.v;
    h.onGround = true;
    h.aimTarget = 0; if (this.mode !== 'ground') h.crouchT = 0;
  }
}

export function updateAI(dt) {
  for (const e of G.enemies) e.update(dt);
  for (const m of G.mates) m.update(dt);
}

export function mateFollow() {}
