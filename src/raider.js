// Ground-combat AI shared by Parts 1, 2 and 4: the Raider enemy, the squad mates' scripted behaviour (mateCustom),
// station routing through the fence gaps, and the steering helper. Split out of part5.js (v6) so AI work and
// Part 4 story work can proceed in separate files.
import { G, THREE, rr, ri, clamp, pick, yawOf, angDiff } from './core.js';
import { Human, J } from './humans.js';
import { moveChar, los } from './physics.js';
import { requestToken, releaseToken, shootAtPlayer, shootAt, AI, WPN, setLoadout, rollLoadout, enemyFire, enemyFireAt, aimTime, burstOf, tryDown, downedUpdate, enemyMelee, mateMelee, mateYield, nadeOk, pinned, nearestMate, callout, glint } from './combat.js';
import { throwNade, lobAt, NADES } from './grenade.js';
import { P } from './player.js';
import { play } from './audio.js';
import { S, ground5 } from './station.js';

const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const faceYaw = (h, y, dt, r = 4) => { h.yaw += clamp(angDiff(h.yaw, y), -r * dt, r * dt); };
const faceTarget = (h, dir, dt) => { h.aim.copy(dir).normalize(); faceYaw(h, yawOf(h.aim), dt, 5); };
export const INSIDE = (x, z) => Math.abs(x) < 29.8 && z > -29.8 && z < 25.8;
export const IN_BLDG = (x, z) => Math.abs(x) < 7.9 && Math.abs(z) < 4.9;
export const ENTRY = G.stationEntries?.() || [{ o: [0, -34], i: [0, -26.5] }];

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
    if (Math.hypot(a[0] - from.x, a[1] - from.z) > 0.45) pts.push({ x: a[0], z: a[1] }); // match walk arrival radius; don't cut across a narrow gap's fence edge
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
// Behaviour: advance from cover spot to cover spot by tiers (maxTier bounds how deep they come), crouch in cover and
// peek to fire (crouched if the cover is low enough to shoot over), react to hits (flinch, stagger, relocate),
// suppress where the player was last seen, flank a pinned player, fall back when wounded and alone, lob grenades
// at a camping player, melee anyone in arm's reach. Loadout (combat.js WPN) shapes all of it.
export class Raider {
  constructor(x, z, o = {}) {
    this.jugg = !!o.jugg;
    const h = this.h = new Human(this.jugg ? 'jg' : 'ru');
    h.hp = this.jugg ? 1500 : 100;
    prep(h, this.jugg ? 0.4 : 0.3);
    h.pos.set(x, (G.groundFn || ground5)(x, z) + 0.05, z);
    h.yaw = yawOf(_t.set(-x, 0, -z));
    this.active = true; this.hasTok = false; this.burst = 0; this.t = rr(0.3, 1); this.losT = 0; this.hiddenT = 0; this.lastSeenT = -99;
    this.maxTier = o.maxTier ?? 2; this.tier = -1; this.spot = null; this.path = []; this.state = 'advance';
    this.side = Math.random() < 0.5 ? -1 : 1; this.coverT = 0; this.rpg = !!o.rpg; this.cover = o.cover || null; this.noRoute = !!o.cover;
    this.lastSeen = new THREE.Vector3(); this.hitDir = new THREE.Vector3(); this.stagT = 0;
    if (this.jugg) { this.wk = 'pkm'; this.w = WPN.pkm; h.dropWeapon = 'pkm'; h.dropAtt = G.rollAtt?.('pkm') ?? null; }
    else setLoadout(this, this.rpg ? 'rpg' : o.wk || rollLoadout(G.lvl));
    this.canDown = !this.jugg && !this.rpg && !o.noDown;
    h.onLethal = (dmg, dir, part, op) => tryDown(this, dir, part, op);
    h.onDeath = () => {
      releaseToken(this); this.freeSpot(); this.downed = false;
      if (Math.random() < 0.5) play('thud', { pos: h.pos, vol: 0.5, ref: 4 });
      if (this.jugg && G.p5JuggDown) G.p5JuggDown();
    };
    h.onHurt = (dmg, dir) => {
      if (this.jugg || this.downed) return;
      if (this.state === 'aim' || this.state === 'fire' || this.state === 'supp') { this.state = 'cover'; this.t = rr(0.5, 1.0); releaseToken(this); }
      if (h.hp > 0 && G.bark && Math.random() < 0.5) G.bark('RU_05', h.pos, true);
      this.hurtMove = true;
      if (h.hp > 0 && this.state !== 'advance') { this.stagT = 0.32; if (dir) this.hitDir.set(dir.x, 0, dir.z).normalize(); }
    };
    G.enemies.push(this);
    if (!this.jugg) this.pickNext(); else this.state = 'pause';
  }
  freeSpot() { if (this.spot) { this.spot.used = null; this.spot = null; } }
  takeSpot(c) {
    this.freeSpot(); this.spot = c; c.used = this; this.tier = c.tier;
    this.path = this.noRoute ? [{ x: c.x, z: c.z }] : route(this.h.pos, c); this.state = 'advance'; releaseToken(this);
  }
  // next cover spot: one tier closer (or the same tier when relocating); the loadout decides near/far preference
  pickNext(same) {
    const h = this.h, w = this.w;
    let opts = [];
    const CL = this.cover || S.cover;
    for (let t = same ? this.tier : Math.min(this.maxTier, this.tier + 1); t >= Math.max(0, this.tier) && !opts.length; t--) opts = CL.filter((c) => c.tier === t && !c.used);
    if (!opts.length) { if (!this.spot) { this.state = 'cover'; this.coverT = 99; } else this.coverT = rr(6, 10); return; }
    let best = null, bs = 1e9;
    for (const c of opts) {
      let s = Math.hypot(c.x - h.pos.x, c.z - h.pos.z) + rr(0, 12) + w.pref * Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      for (const o of G.enemies) if (o !== this && o.h.alive && Math.abs(o.h.pos.x - c.x) + Math.abs(o.h.pos.z - c.z) < 2.5) { s += 6; break; }
      if (s < bs) { bs = s; best = c; }
    }
    this.takeSpot(best);
  }
  arrive() { this.state = 'cover'; this.coverT = (this.retreat ? rr(12, 18) : rr(8, 15)) * this.w.hold; this.t = rr(0.3, 0.9); this.flank = this.retreat = false; }
  // the player is pinned down: one man at a time works around to a spot well off the main line of fire
  tryFlank(dist) {
    if (AI.flankT > 0 || !pinned() || this.rpg || this.flankDone || this.w.gk === 'pkm' || this.w.gk === 'dmr' || AI.n < 3 || dist > 45) return false;
    const CL = this.cover || S.cover, h = this.h;
    let cx = AI.cx - P.pos.x, cz = AI.cz - P.pos.z; const cl = Math.hypot(cx, cz) || 1; cx /= cl; cz /= cl;
    let best = null, bs = 1e9;
    for (const c of CL) {
      if (c.used || c.tier > this.maxTier) continue;
      const dx = c.x - P.pos.x, dz = c.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 6 || d > 28) continue;
      const ca = (dx * cx + dz * cz) / d; if (ca > 0.5) continue;
      const dm = Math.hypot(c.x - h.pos.x, c.z - h.pos.z); if (dm < 4 || dm > 40) continue;
      const s = ca * 8 + dm * 0.2 + d * 0.1 + rr(0, 3);
      if (s < bs) { bs = s; best = c; }
    }
    if (!best) { AI.flankT = 2; return false; }
    this.takeSpot(best); this.flank = this.flankDone = true; AI.flankT = rr(12, 18); AI.stats.flanks++;
    const m = nearestMate(P.pos, 40); if (m) callout(m, 'MC_FLANK');
    return true;
  }
  // wounded and alone with two guns on him: fall back to a spot further from the player
  tryRetreat(dist) {
    if (this.retreatDone || this.rpg || dist > 24 || (this.retCk = (this.retCk ?? 0) - 1) > 0) return false;
    this.retCk = 3;
    const h = this.h;
    let nf = 0; for (const o of G.enemies) if (o !== this && o.h.alive && !o.downed && o.h.pos.distanceToSquared(h.pos) < 196) nf++;
    let foes = 1; for (const m of G.mates) if (m.h.alive && !m.h.hidden && m.h.pos.distanceToSquared(h.pos) < 400) foes++;
    if (!((h.hp < 50 && nf <= 1) || (nf === 0 && foes >= 2))) return false;
    this.retreatDone = true;
    if (Math.random() < 0.45) return false; // some stand and fight
    const CL = this.cover || S.cover;
    let best = null, bs = 1e9;
    for (const c of CL) {
      if (c.used || c.tier > this.tier) continue;
      const dm = Math.hypot(c.x - h.pos.x, c.z - h.pos.z); if (dm < 3 || dm > 26) continue;
      if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < dist + 5) continue;
      if (dm < bs) { bs = dm; best = c; }
    }
    if (!best) return false;
    this.takeSpot(best); this.retreat = true; AI.stats.retreats++;
    const m = nearestMate(h.pos, 40); if (m) callout(m, 'MC_RETREAT');
    return true;
  }
  decide(dist, eye) {
    const w = this.w;
    if (this.rpg) { // rocket men only fire rockets (G.p5Rpg: dish / player, global cooldown)
      if (G.p5Rpg && G.p5Rpg(this)) { this.t = rr(3, 5); this.h.crouchT = 0; this.h.aimTarget = 1; } else this.t = rr(0.8, 1.6);
      return;
    }
    if (this.tryFlank(dist) || this.tryRetreat(dist)) return;
    if (nadeOk(this, dist) && Math.random() < 0.45) { this.state = 'throw'; this.t = 0.45; this.hiddenT = 0; return; }
    // close-quarters guns rush a visible player across open ground
    const sameSide = G.lvl !== 5 || (INSIDE(this.h.pos.x, this.h.pos.z) === INSIDE(P.pos.x, P.pos.z) && !IN_BLDG(P.pos.x, P.pos.z) && P.pos.y < 2);
    if (w.gk === 'shotgun' && sameSide && this.seen && dist > 6 && dist < 17 && AI.rushT <= 0 && los(_e.copy(this.h.pos).setY(this.h.pos.y + 0.6), _d.copy(P.pos).setY(P.pos.y + 0.6))) {
      AI.rushT = rr(7, 11); this.state = 'rush'; this.t = 3; releaseToken(this); return;
    }
    const close = dist < 6;
    if (this.seen && (close || requestToken(this))) { this.state = 'aim'; this.t = close ? rr(0.12, 0.25) : aimTime(this); this.lowFire = !this.spot || this.seenLow; return; }
    if (!this.seen && G.t - this.lastSeenT < 3.5 && (w.gk === 'pkm' || w.gk === 'rifle') && AI.suppT <= 0 && dist < 50 && Math.random() < 0.5) {
      AI.suppT = rr(3, 6); AI.stats.supp++; this.state = 'supp'; this.burst = w.gk === 'pkm' ? ri(10, 16) : ri(4, 7); this.t = rr(0.2, 0.4); return;
    }
    if (!this.seen && Math.random() < 0.55 && (this.mt = visibleMate(eye))) { this.state = 'aimM'; this.t = 0.35; return; }
    this.t = rr(0.4, 0.9);
  }
  update(dt) {
    const h = this.h; if (!h.alive) return;
    if (this.downed) return downedUpdate(this, dt);
    const eye = _o.copy(h.j[J.Hc]);
    const toP = _t.subVectors(P.eye, eye); const dist = toP.length();
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.3;
      this.seen = P.alive && los(_e.copy(eye).setY(eye.y + 0.35), P.eye);
      this.seenLow = this.seen && los(_e.set(h.pos.x, h.pos.y + 1.05, h.pos.z), P.eye);
      if (this.seen) { this.lastSeenT = G.t; this.lastSeen.copy(P.chest); }
    }
    this.hiddenT = this.seen ? 0 : this.hiddenT + dt;
    this.t -= dt;
    if (this.jugg) return this.juggUpdate(dt, dist, toP);
    if (enemyMelee(this, dt)) { moveChar(h, dt, false); return; }
    // scatter from the player's grenades
    const nd = NADES.find((n) => n.owner !== 'enemy' && n.pos.distanceTo(h.pos) < 4.5);
    if (nd) {
      _e.subVectors(h.pos, nd.pos).setY(0).normalize();
      walk(this, h, h.pos.x + _e.x * 3, h.pos.z + _e.z * 3, 4.5, dt);
      h.crouchT = 0; h.aimTarget = 0.2; if (this.state === 'aim' || this.state === 'fire' || this.state === 'supp') { this.state = 'cover'; releaseToken(this); }
      return;
    }
    // hit: flinch and stagger back along the shot before doing anything else
    if (this.stagT > 0) {
      this.stagT -= dt; h.crouchT = 0.3; h.aimTarget = 0.15;
      h.vel.x = this.hitDir.x * 1.3; h.vel.z = this.hitDir.z * 1.3; moveChar(h, dt, false);
      return;
    }
    const w = this.w;
    switch (this.state) {
      case 'advance': {
        const fast = this.flank || this.retreat;
        h.crouchT = fast ? 0.15 : 0.3; h.aimTarget = 0.35;
        const wp = this.path[0];
        if (!wp) { this.arrive(); break; }
        if (walk(this, h, wp.x, wp.z, (fast ? 5.0 : 4.3) * w.spd, dt)) { this.path.shift(); this.stkN = 0; }
        if ((this.stkT = (this.stkT ?? 2) - dt) <= 0) { // no headway for a while: re-plan, then give up on that spot
          this.stkT = 2;
          if (!this.stkP) this.stkP = h.pos.clone();
          this.stkN = h.pos.distanceTo(this.stkP) < 0.6 ? (this.stkN || 0) + 1 : 0; this.stkP.copy(h.pos);
          if (this.stkN === 3 && this.spot) { this.path = this.noRoute ? [{ x: this.spot.x, z: this.spot.z }] : route(h.pos, this.spot); this.side = -this.side; }
          else if (this.stkN >= 5) { this.stkN = 0; this.freeSpot(); this.arrive(); this.coverT = rr(2, 4); }
        }
        if (Math.abs(h.vel.x) + Math.abs(h.vel.z) > 0.3) { h.aim.set(h.vel.x, 0, h.vel.z).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -7 * dt, 7 * dt); }
        break;
      }
      case 'rush': { // shotgunner closing in on the player, weapon up
        h.crouchT = 0.1; h.aimTarget = 0.8; faceTarget(h, toP, dt);
        if (dist < 5.5 || this.t <= 0 || !this.seen) { this.state = 'aim'; this.t = 0.15; this.lowFire = false; this.coverT = Math.min(this.coverT, rr(3, 5)); h.vel.x = h.vel.z = 0; moveChar(h, dt, false); break; }
        walk(this, h, P.pos.x, P.pos.z, 4.6, dt);
        break;
      }
      case 'cover':
        h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
        h.crouchT = 1; h.aimTarget = 0.3; faceTarget(h, toP, dt);
        this.coverT -= dt;
        if (this.coverT <= 0 || this.hurtMove) {
          const hurt = this.hurtMove; this.hurtMove = false;
          if (this.tier < this.maxTier || (this.cover && w.pref > 0.5)) { this.pickNext(this.tier >= this.maxTier); break; }
          if (hurt && Math.random() < 0.6) { this.pickNext(true); break; }  // relocate after taking a hit
          this.coverT = rr(6, 12) * w.hold;
        }
        if (this.t <= 0) this.decide(dist, eye);
        break;
      case 'aim':
        h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
        h.crouchT = this.lowFire ? 0.85 : 0; h.aimTarget = 1; faceTarget(h, toP, dt);
        if (w.gk === 'dmr') glint(this, dist);
        if (this.t <= 0) { this.state = 'fire'; this.burst = burstOf(this); this.t = 0; }
        break;
      case 'fire':
        h.crouchT = this.lowFire ? 0.85 : 0; h.aimTarget = 1; faceTarget(h, toP, dt);
        if (this.t <= 0) {
          this.t = w.rate * rr(0.9, 1.15); this.burst--; h.recoil = 1;
          enemyFire(this, _e.copy(h.j[J.W1]), dist);
          if (this.burst <= 0) { this.state = 'cover'; this.t = rr(1.2, 2.6) * w.pause; releaseToken(this); if (G.bark && Math.random() < 0.15) G.bark(pick(['RU_02', 'RU_06']), h.pos); }
        }
        break;
      case 'supp': // suppressive fire at the player's last position (stands up to clear the cover)
        h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
        h.crouchT = this.seenLow ? 0.85 : 0; h.aimTarget = 1; h.aim.subVectors(this.lastSeen, eye).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -5 * dt, 5 * dt);
        if (this.t <= 0) {
          this.t = w.rate * rr(0.95, 1.2); this.burst--; h.recoil = 1;
          enemyFireAt(this, _e.copy(h.j[J.W1]), this.lastSeen);
          if (this.burst <= 0) { this.state = 'cover'; this.t = rr(1.4, 2.8); }
        }
        break;
      case 'aimM': case 'fireM': {
        const m = this.mt;
        if (!m || !m.h.alive || m.h.hidden) { this.state = 'cover'; this.t = 0.5; break; }
        h.crouchT = 0; h.aimTarget = 1;
        h.aim.subVectors(m.h.j[J.Ne], eye).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -5 * dt, 5 * dt);
        if (this.state === 'aimM') { if (this.t <= 0) { this.state = 'fireM'; this.burst = burstOf(this); this.t = 0; } break; }
        if (this.t <= 0) {
          this.t = w.rate * rr(0.9, 1.15); this.burst--; h.recoil = 1;
          enemyFireAt(this, _e.copy(h.j[J.W1]), _d.copy(m.h.j[J.Ne]).add(_o.set(rr(-0.6, 0.6), rr(-0.3, 0.6), rr(-0.6, 0.6))));
          if (this.burst <= 0) { this.state = 'cover'; this.t = rr(1.2, 2.4); }
        }
        break;
      }
      case 'throw':
        h.vel.x = h.vel.z = 0; moveChar(h, dt, false);
        h.crouchT = 0; h.aimTarget = 0; faceTarget(h, toP, dt);
        if (this.t <= 0) {
          const from = _e.copy(h.j[J.HR]).setY(h.j[J.HR].y + 0.35);
          const tgt = _d.copy(P.pos).add(_o.set(rr(-1.5, 1.5), 0.1, rr(-1.5, 1.5)));
          throwNade(from, lobAt(from, tgt, clamp(dist / 13, 0.9, 1.7)), 'enemy');
          G.lastEnemyNade = G.t; AI.stats.nades++; this.state = 'cover'; this.t = rr(1.5, 2.5);
          if (G.bark) G.bark('RU_03', h.pos);
        }
        break;
      default: this.state = 'cover'; this.t = 0.3;
    }
  }
  juggUpdate(dt, dist, toP) {
    const h = this.h;
    if (enemyMelee(this, dt)) { moveChar(h, dt, false); return; }
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
    if (dist > 3.5 && wp && h.meleeT < 0) { if (walk(this, h, wp.x, wp.z, 1.7, dt)) this.path.shift(); }
    else { h.vel.x = h.vel.z = 0; moveChar(h, dt, false); }
    this.stepT = (this.stepT ?? 0) - dt * Math.hypot(h.vel.x, h.vel.z);
    if (this.stepT <= 0) { this.stepT = 0.9; play('thud', { pos: h.pos, vol: 0.35, ref: 6, rate: 0.7 }); }
    if (this.state === 'fire') {
      if (this.t <= 0) {
        this.t = 0.085; this.burst--; h.recoil = 1;
        shootAtPlayer(_e.copy(h.j[J.W1]), { dmg: 7, acc: 0.55, snd: G.weaponDef?.('pkm')?.far ?? 'ak_far', vol: 1.0, tracer: 0.7, flash: 1.6, rate: 0.84 });
        if (this.burst <= 0 || !this.seen) { this.state = 'pause'; this.t = rr(0.8, 1.4); }
      }
    } else if (this.t <= 0) {
      if (this.seen) { this.state = 'fire'; this.burst = 10 + ri(0, 8); this.t = 0; }
      else if (!this.seen && (this.mt = visibleMate(_o.copy(h.j[J.Hc])))) {
        this.t = 0.9; this.jmBurst = 5; this.jmT = 0;
      } else this.t = 0.4;
    }
    if (this.jmBurst > 0 && (this.jmT -= dt) <= 0) { // short burst at a mate the player can't see
      this.jmBurst--; this.jmT = 0.09;
      if (this.mt && this.mt.h.alive) { h.recoil = 1; shootAt(h, _e.copy(h.j[J.W1]), _d.copy(this.mt.h.j[J.Ne]).add(_o.set(rr(-0.7, 0.7), rr(-0.3, 0.6), rr(-0.7, 0.7))), { dmg: 0, skip: 'jg', spread: 0.04, tracer: 0.6, snd: G.weaponDef?.('pkm')?.far ?? 'ak_far', rate: 0.84 }); }
    }

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


const mateMove = (h, dt) => moveChar(h, dt, false);
export function mateCustom(m) {
  return (dt) => {
    const h = m.h;
    if (!h.alive) return;
    if (m.p5 === 'walk') {
      const wp = m.path[0];
      h.crouchT = 0; h.aimTarget = 0.25;
      if (!wp) { m.p5 = m.next || 'idle'; m.home = h.pos.clone(); return; }
      if (walk(m, h, wp.x, wp.z, m.walkSpeed || 4.2, dt)) m.path.shift();
      if (Math.abs(h.vel.x) + Math.abs(h.vel.z) > 0.3) { h.aim.set(h.vel.x, 0, h.vel.z).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -7 * dt, 7 * dt); }
      return;
    }
    const fight = m.p5 === 'defend' || m.p5 === 'idle';
    if ((fight || m.p5 === 'console' || m.p5 === 'kneel') && mateMelee(m, dt)) { moveChar(h, dt, false); return; }
    h.vel.x = h.vel.z = 0;
    if (!(fight && mateYield(m, dt, mateMove))) moveChar(h, dt, false);
    switch (m.p5) {
      case 'idle': h.crouchT = 0; h.aimTarget = 0.2; if (m.yaw0 !== undefined) faceYaw(h, m.yaw0, dt); break;
      case 'console': h.crouchT = 0; h.aimTarget = 0; h.noWeapon = true; faceYaw(h, Math.PI / 2, dt); break;
      case 'defend': { // crouch behind the post, rise (or fire crouched over low cover) when there is a target
        h.noWeapon = false;
        m.ct -= dt;
        if (m.lastTgtT === undefined) m.lastTgtT = G.t;
        // Parts 1-2: nothing to shoot at from this post for a while -> shift to a nearby spot with a line of fire
        if ((G.lvl === 1 || G.lvl === 3) && AI.n > 0 && G.t - m.lastTgtT > 7 && G.t - (m.repoT ?? -99) > 10 && (m.reloadT ?? 0) <= 0) {
          m.repoT = G.t; const p = newPost(m);
          if (p) { goMate(m, [[p.x, p.z]], 'defend', 3.6); m.lastTgtT = G.t; break; }
        }
        if (m.reloadT > 0) { m.reloadT -= dt; h.crouchT = 1; h.aimTarget = 0.25; faceYaw(h, m.yaw0 ?? 0, dt); break; }
        if (m.cs === 'crouch') {
          h.crouchT = 1; h.aimTarget = 0.3; faceYaw(h, m.yaw0 ?? 0, dt);
          if (m.ct <= 0) {
            m.cs = 'peek'; m.ct = rr(2.4, 4.2);
            m.low = !!m.pickTarget(_e.set(h.pos.x, h.pos.y + 1.05, h.pos.z)); // a target visible from a crouch: stay low
          }
        } else {
          const tgt = m.pickTarget();
          h.crouchT = m.low ? 0.85 : 0;
          if (tgt) m.fireAt(tgt, dt); else { h.aimTarget = 0.6; faceYaw(h, m.yaw0 ?? 0, dt); }
          if (m.ct <= 0 || (!tgt && m.ct > 1.2)) { m.cs = 'crouch'; m.ct = tgt ? rr(0.8, 1.6) : rr(0.6, 1.2); }
        }
        break;
      }
      case 'wounded': h.noWeapon = true; h.aimTarget = 0; h.crouchT = 0; break;
      case 'kneel': h.crouchT = 1; h.aimTarget = 0; if (m.look) faceYaw(h, yawOf(_e.subVectors(m.look, h.pos)), dt); break;
      case 'sitTalk': h.noWeapon = true; h.aimTarget = 0; break;
    }
  };
}
// a spot within ~7 m of the mate's post (straight walk, level floor) that sees at least one active enemy
function newPost(m) {
  const h = m.h, home = m.home || h.pos;
  _o.set(h.pos.x, h.pos.y + 1.5, h.pos.z);
  for (const r of [2.5, 4.5, 7]) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + r, x = home.x + Math.sin(a) * r, z = home.z + Math.cos(a) * r;
    const gy = (G.groundFn || ground5)(x, z);
    if (Math.abs(gy - h.pos.y) > 0.6) continue;
    _t.set(x, gy + 1.5, z);
    if (!los(_o, _t) || !los(_d.set(h.pos.x, h.pos.y + 0.5, h.pos.z), _e.set(x, gy + 0.5, z))) continue;
    for (const e of G.enemies) {
      if (!e.h.alive || e.downed || e.h.pos.distanceTo(_t) > 55) continue;
      if (los(_t, e.h.j[J.Ne])) return { x, z };
    }
  }
  return null;
}
export function goMate(m, pts, next, speed) { m.path = pts.map(([x, z]) => ({ x, z })); m.next = next; m.p5 = 'walk'; m.walkSpeed = speed; m.chk = 1; m.lastD = 1e9; m.home = null; }

export function placeMate(m, x, z, y) { m.h.pos.set(x, y ?? (G.groundFn || ground5)(x, z), z); m.h.vel.set(0, 0, 0); m.home = null; }
if (typeof window !== 'undefined') window.__Raider = Raider; // test hook (tools/test_ai.py)
