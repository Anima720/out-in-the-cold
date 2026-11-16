// Shared combat layer for every AI soldier (train Enemy/Mate in ai.js, Raider/mateCustom in raider.js):
// attack tokens, enemy shots, weapon loadouts, the downed "last stand" state, melee for both sides,
// squad-level awareness (player pinned -> flank, suppression cooldowns) and the squad mates' callouts.
import { G, THREE, rr, ri, clamp, yawOf, angDiff, fwdYaw, rightYaw, pick } from './core.js';
import { J, MS } from './humans.js';
import { raycast, rayBoxes, los, supportAt } from './physics.js';
import { play } from './audio.js';
import { NADES } from './grenade.js';
import { say, LINES, D } from './director.js';
import { WDEF } from './weapon.js';

// squad-level state; window.__ai for tests
export const AI = {
  anchor: new THREE.Vector3(), stillT: 0, lastFireT: -99, flankT: 6, suppT: 0, rushT: 0, cT: 0, cx: 0, cz: 0, n: 0, quietT: 99,
  callT: -99, callIds: {}, seen: {},
  stats: { mateKills: {}, mateShots: {}, downs: 0, downKills: 0, bleedOuts: 0, melee: { enemy: 0, enemyHits: 0, mate: 0, mateKills: 0 }, flanks: 0, retreats: 0, supp: 0, nades: 0, loadouts: {} },
};
if (typeof window !== 'undefined') window.__ai = AI;

// ---------- attack tokens: limits how many enemies shoot at the player at once
export const TOK = { n: 0, last: -9 };
export function requestToken(e) {
  if (e.hasTok) return true;
  if (TOK.n >= 2 || G.t - TOK.last < 0.55) return false;
  TOK.n++; TOK.last = G.t; e.hasTok = true; return true;
}
export function releaseToken(e) { if (e.hasTok) { e.hasTok = false; TOK.n = Math.max(0, TOK.n - 1); } }

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Vector3(), _m = new THREE.Vector3();

// enemy shot at the player: hit chance model + visible tracer / near-miss. o: dmg, acc, pBase, snd, rate, vol, tracer, width, flash, pellets
export function shootAtPlayer(muzzle, o = {}) {
  const P = G.player;
  const dist = muzzle.distanceTo(P.eye);
  let p = (o.pBase ?? clamp(0.4 - dist * 0.01, 0.06, 0.34)) * (o.acc || 1);
  if (P.moving) p *= 0.75; if (P.crouched) p *= 0.75; if (P.sprinting) p *= 0.6;
  const visHead = los(muzzle, P.eye), visChest = los(muzzle, P.chest);
  if (!visHead && !visChest) p = 0; else if (!visChest) p *= 0.5;
  p = Math.min(p, 0.8);
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
  for (let k = 1; k < (o.pellets || 0); k++) { // buckshot: the rest of the pellets pepper the surroundings
    _q.copy(_d).add(_e.set(rr(-0.06, 0.06), rr(-0.05, 0.05), rr(-0.06, 0.06))).normalize();
    const h = rayBoxes(muzzle, _q, Math.min(60, dist + 6), true);
    if (h) G.fx.impact(_m.copy(muzzle).addScaledVector(_q, h.t), h.normal, h.mat);
  }
  if (Math.random() < (o.tracer ?? 0.45)) G.fx.tracer(muzzle, end, { start: 1, width: o.width || 0.025, speed: 300 });
  G.fx.muzzle(muzzle, _d, o.flash || 1);
  G.fx.flash(muzzle, 0xffb060, 10, 8, 0.05);
  play(o.snd || 'ak_far', { pos: muzzle, vol: o.vol ?? 0.8, ref: 6, rev: 0.5, rate: o.rate });
  AI.lastFireT = G.t;
  return hitP;
}

// NPC shot at an arbitrary target point (teammates -> enemies, enemies -> teammates). o.by: the Mate (kill credit)
export function shootAt(shooter, muzzle, target, o = {}) {
  _d.subVectors(target, muzzle).normalize();
  const sp = o.spread ?? 0.03;
  _d.x += rr(-sp, sp); _d.y += rr(-sp, sp); _d.z += rr(-sp, sp); _d.normalize();
  const h = raycast(muzzle, _d, 300, shooter, { factionSkip: o.skip, noCorpse: true });
  const end = h ? h.point.clone() : muzzle.clone().addScaledVector(_d, 300);
  let killed = false;
  if (h) {
    if (h.ent && h.ent.hurt && o.dmg) {
      if (h.ent.faction === 'us' || !(o.hitChance !== undefined && Math.random() > o.hitChance)) killed = h.ent.hurt(o.dmg, _d, h.part, h.joint, { force: 5, bullet: true });
      G.fx.impact(h.point, h.normal, h.ent.faction ? 'flesh' : 'metal');
    } else G.fx.impact(h.point, h.normal, h.mat);
  }
  if (Math.random() < (o.tracer ?? 0.35)) G.fx.tracer(muzzle, end, { start: 1, speed: 300 });
  G.fx.muzzle(muzzle, _d, o.flash || 1);
  play(o.snd || 'ak_far', { pos: muzzle, vol: o.vol ?? 0.7, ref: 6, rev: 0.5, rate: o.rate });
  if (o.by) { const n = o.by.name; AI.stats.mateShots[n] = (AI.stats.mateShots[n] || 0) + 1; if (killed && h.ent.faction !== 'us') mateKill(o.by); }
  return killed;
}
function mateKill(m) {
  const n = m.name; AI.stats.mateKills[n] = (AI.stats.mateKills[n] || 0) + 1;
  if (Math.random() < 0.45) callout(m, Math.random() < 0.5 ? 'MC_DOWN' : 'MC_DOWN2');
}

// ---------- weapons: enemy loadouts. gk = third-person model (humans.js GK); behaviour knobs:
// rate s/shot, burst [min,max], dmg, aim [min,max] s, pause (x between bursts), hold (x time in a cover spot),
// pref (+ = prefers cover spots near the player, - = far), spd (move speed x), far (beyond this they want to close in)
export const WPN = {
  ak: { gk: 'rifle', rate: 0.11, burst: [3, 5], dmg: 7, aim: [0.35, 0.6], pause: 1, hold: 1, pref: 0, spd: 1, far: 99, snd: 'ak_far', sr: 1, vol: 0.8, tr: 0.45 },
  ak12: { gk: 'rifle', rate: 0.092, burst: [3, 4], dmg: 7, aim: [0.3, 0.5], pause: 1, hold: 1, pref: 0.1, spd: 1, far: 99, snd: 'ak_far', sr: 1.1, vol: 0.8, tr: 0.45 },
  smg: { gk: 'smg', rate: 0.068, burst: [6, 10], dmg: 4.5, aim: [0.22, 0.38], pause: 0.8, hold: 0.7, pref: 0.55, spd: 1.08, far: 18, snd: 'pistol', sr: 1.3, vol: 0.55, tr: 0.35 },
  saiga: { gk: 'shotgun', rate: 0.4, burst: [2, 3], dmg: 20, aim: [0.18, 0.3], pause: 0.8, hold: 0.5, pref: 1.1, spd: 1.08, far: 9, snd: 'pistol', sr: 0.55, vol: 0.95, tr: 0.25, pellets: 5 },
  svd: { gk: 'dmr', rate: 1.3, burst: [1, 2], dmg: 17, aim: [0.9, 1.4], pause: 1.3, hold: 1.8, pref: -0.6, spd: 0.95, far: 99, snd: 'ak_far', sr: 0.68, vol: 1.0, tr: 1 },
  pkm: { gk: 'pkm', rate: 0.085, burst: [8, 14], dmg: 6, aim: [0.5, 0.8], pause: 1.2, hold: 1.5, pref: -0.2, spd: 0.82, far: 99, snd: 'ak_far', sr: 0.84, vol: 0.95, tr: 0.6, heavy: true },
  rpg: { gk: 'rpg', rate: 1, burst: [0, 0], dmg: 0, aim: [0.5, 0.8], pause: 1, hold: 1.2, pref: -0.3, spd: 1, far: 99, snd: 'ak_far', sr: 1, vol: 0.8, tr: 0 },
};
// per level mix (weights); RPG men are placed by the level scripts
const MIX = {
  1: [['ak', 44], ['ak12', 10], ['smg', 26], ['saiga', 17], ['pkm', 3]],
  2: [['ak', 40], ['ak12', 15], ['smg', 20], ['saiga', 15], ['svd', 4], ['pkm', 6]],
  3: [['ak', 36], ['ak12', 16], ['smg', 12], ['saiga', 10], ['svd', 13], ['pkm', 13]],
  5: [['ak', 37], ['ak12', 15], ['smg', 13], ['saiga', 12], ['svd', 11], ['pkm', 12]],
};
export function rollLoadout(lvl = G.lvl) {
  const mix = MIX[lvl] || MIX[5];
  let svd = 0, pkm = 0;
  for (const e of G.enemies) if (e.h.alive) { if (e.wk === 'svd') svd++; else if (e.wk === 'pkm') pkm++; }
  for (let tries = 0; tries < 4; tries++) {
    let sum = 0; for (const [, w] of mix) sum += w;
    let r = rr(0, sum), k = mix[0][0];
    for (const [key, w] of mix) { if ((r -= w) <= 0) { k = key; break; } }
    if ((k === 'svd' && svd >= 2) || (k === 'pkm' && pkm >= 2)) continue;
    return k;
  }
  return 'ak';
}
export function setLoadout(e, key) {
  const h = e.h, w = WPN[key] || WPN.ak;
  e.wk = key; e.w = w;
  // drop = this gun, if the player's arsenal knows it (W adds every key; until then fall back to the AK)
  const drop = WDEF[key] ? key : key === 'ak12' || key === 'smg' ? 'ak' : key;
  h.gunKind = w.gk; h.dropWeapon = drop; h.dropAtt = G.rollAtt?.(drop) ?? null;
  if (w.heavy) h.hp = Math.max(h.hp, 130);
  AI.stats.loadouts[key] = (AI.stats.loadouts[key] || 0) + 1;
}
export function aimTime(e) { const a = e.w ? e.w.aim : WPN.ak.aim; return rr(a[0], a[1]); }
export function burstOf(e) { const b = e.w ? e.w.burst : WPN.ak.burst; return ri(b[0], b[1]); }
function accAt(w, d) {
  switch (w.gk) {
    case 'smg': return d < 12 ? 1.15 : Math.max(0.2, 1.15 - (d - 12) * 0.07);
    case 'shotgun': return d < 6 ? 2.0 : d < 12 ? 1.25 : Math.max(0.1, 1.25 - (d - 12) * 0.12);
    case 'pkm': return 0.7;
    default: return 1;
  }
}
function dmgAt(w, d) { if (w.gk === 'shotgun') return d < 5 ? w.dmg : d < 10 ? w.dmg * 0.65 : d < 16 ? w.dmg * 0.35 : 3; return w.dmg + rr(-1, 1); }
// one shot of the enemy's weapon at the player
export function enemyFire(e, mz, dist, o = {}) {
  const w = e.w || WPN.ak;
  if (w.gk === 'dmr') return shootAtPlayer(mz, { dmg: w.dmg + rr(-1, 2), pBase: clamp(0.5 - dist * 0.003, 0.3, 0.5) * (o.acc ?? 1), snd: w.snd, rate: w.sr, vol: w.vol, tracer: 1, width: 0.034, flash: 1.3 });
  if (w === WPN.pkm) e.firedMG = true;
  return shootAtPlayer(mz, { dmg: dmgAt(w, dist), acc: accAt(w, dist) * (o.acc ?? 1), snd: w.snd, rate: w.sr, vol: w.vol, tracer: w.tr, pellets: w.pellets, flash: w.gk === 'shotgun' ? 1.5 : w.gk === 'smg' ? 0.8 : 1 });
}
// enemy shot at a teammate (mates are invulnerable story characters: visual only)
export function enemyFireAt(e, mz, tgt) {
  const w = e.w || WPN.ak;
  shootAt(e.h, mz, tgt, { dmg: 0, skip: e.h.faction, spread: w.gk === 'shotgun' ? 0.07 : 0.04, tracer: w.tr, vol: w.vol * 0.7, snd: w.snd, rate: w.sr });
}
// scope glint of a marksman taking aim (visible from far away)
export function glint(e, dist) {
  const h = e.h; e.glT = (e.glT || 0) - G.dt;
  if (e.glT > 0) return; e.glT = 0.07;
  _o.subVectors(h.j[J.W1], h.j[J.W0]).normalize();
  _t.copy(h.j[J.W0]).addScaledVector(_o, 0.48).addScaledVector(h.weaponUp, 0.09).addScaledVector(_o.set(G.player.eye.x - h.j[J.W0].x, G.player.eye.y - h.j[J.W0].y, G.player.eye.z - h.j[J.W0].z).normalize(), 0.06);
  G.fx.add.spawn(_t.x, _t.y, _t.z, 0, 0, 0, { life: 0.11, size: clamp(dist * 0.011, 0.14, 0.7), c: [1.4, 1.3, 1.05], alpha: 1, drag: 0, rv: 0 });
}

// ---------- squad awareness
export function updateCombat(dt) {
  const P = G.player; if (!P) return;
  if (P.pos.distanceToSquared(AI.anchor) > 6.25) { AI.anchor.copy(P.pos); AI.stillT = 0; } else AI.stillT += dt;
  AI.flankT -= dt; AI.suppT -= dt; AI.rushT -= dt;
  if ((AI.cT -= dt) <= 0) {
    AI.cT = 0.5; let n = 0, x = 0, z = 0;
    for (const e of G.enemies) { const h = e.h; if (!h.alive || e.downed || e.active === false || e.kind === 'gunner') continue; if (Math.abs(h.pos.x - P.pos.x) + Math.abs(h.pos.z - P.pos.z) > 90) continue; n++; x += h.pos.x; z += h.pos.z; }
    AI.n = n; if (n) { AI.cx = x / n; AI.cz = z / n; }
  }
  AI.quietT = AI.n ? 0 : AI.quietT + dt;
  for (const n of NADES) if (n.owner === 'enemy' && !n._called && n.pos.distanceTo(P.pos) < 6 && n.fuse < 2.4) { n._called = true; const m = nearestMate(P.pos, 30); if (m) callout(m, 'MC_NADE', true); }
}
// the player has stayed put under fire for a while: time to flank him
export const pinned = () => AI.stillT > 4 && G.t - AI.lastFireT < 3;
export function nearestMate(pos, maxD = 40) {
  let best = null, bd = maxD;
  for (const m of G.mates) { const h = m.h; if (!h.alive || h.hidden || h.sit) continue; const d = h.pos.distanceTo(pos); if (d < bd) { bd = d; best = m; } }
  return best;
}
// may this enemy lob a grenade at the player now? (hidden + stationary player, not too close, no friendlies near the impact)
export function nadeOk(e, dist) {
  const P = G.player;
  if (e.hiddenT < 3 || dist < 9 || dist > 28 || AI.stillT < 2.5) return false;
  if (G.t - (G.lastEnemyNade ?? -99) < 11 || NADES.some((n) => n.owner === 'enemy')) return false;
  for (const o of G.enemies) if (o !== e && o.h.alive && o.h.pos.distanceToSquared(P.pos) < 30) return false;
  return true;
}

// ---------- downed ("last stand") ----------
const DOWN_P = 0.22;
// called by Human.hurt on a lethal hit (h.onLethal). true = he goes down instead of dying
export function tryDown(e, dir, part, o) {
  const h = e.h;
  if (!e.canDown || e.downed || e.jugg || e.rpg || e.kind === 'gunner' || h.sit || h.grips || G.state !== 'play') return false;
  if (!o || !(o.bullet || o.point) || o.melee || part === 'head' || h.hp < -70) return false;
  let n = 0; for (const x of G.enemies) if (x.downed && x.h.alive) n++;
  if (n >= 2 || Math.random() > (AI.forceDown ?? DOWN_P)) return false;
  // room to lie down: the body runs along the shot line (head away from the shooter); try a few angles
  const y0 = dir ? yawOf(_d.set(-dir.x, 0, -dir.z)) : h.yaw;
  const cands = G.lvl === 2 ? [Math.cos(y0) > 0 ? 0 : Math.PI] : [y0, y0 + 0.6, y0 - 0.6, y0 + 1.5, y0 - 1.5];
  let ok = null;
  for (const y of cands) { if (lieRoom(h, y, 0.85, 1.05)) { ok = y; break; } }
  if (ok === null) return false;
  h.downYaw = ok;
  e.downed = true; e.state = 'downed'; releaseToken(e); e.freeSpot?.(); e.mel = null;
  e.bleedT = rr(10, 15); e.dfT = rr(1.0, 1.6); e.dlT = 0; e.dtg = null; e.pooled = false;
  e.crawlLeft = rr(0.5, 1.3); e.dph = 'aim'; e.dphT = rr(0.6, 1.2);
  h.downed = true; AI.stats.downs++;
  const m = nearestMate(h.pos, 35); if (m) callout(m, 'MC_FINISH');
  return true;
}
// free floor behind (head) and in front (feet) along yaw, no drop-off
function lieRoom(h, yaw, back, front) {
  const f = fwdYaw(yaw, _q); _o.copy(h.pos); _o.y += 0.28;
  if (rayBoxes(_o, _e.copy(f).negate(), back, true) || rayBoxes(_o, f, front, true)) return false;
  for (const s of [-back, front]) { const x = h.pos.x + f.x * s, z = h.pos.z + f.z * s; if (Math.abs(supportAt(x, z, 0.05, h.pos.y + 0.3, 0.6).y - h.pos.y) > 0.3) return false; }
  return true;
}
export function downedUpdate(e, dt) {
  const h = e.h, d = h.down, P = G.player; if (!d) return;
  h.vel.set(0, 0, 0); h.onGround = false; d.cw = 0;
  if (d.die >= 0) { h.aimTarget = 0; return; }
  if (!e.pooled && d.t > 0.7) { e.pooled = true; const f = fwdYaw(d.yaw, _q); G.fx.bloodPool?.(_o.copy(h.pos).addScaledVector(f, -0.25), 0.5); }
  e.bleedT -= dt;
  if (e.bleedT <= 0 || !P.alive && G.state !== 'play') { d.die = 0; h.aimTarget = 0; AI.stats.bleedOuts++; return; }
  if (d.t < 0.8) return;
  const f = fwdYaw(d.yaw, _q);
  // pick a target in front of him every 0.4 s: the player, else a mate
  if ((e.dlT -= dt) <= 0) {
    e.dlT = 0.4; e.dtg = null;
    const eye = _o.copy(h.j[J.Hc]); eye.y += 0.05;
    const front = (p) => { const dx = p.x - h.pos.x, dz = p.z - h.pos.z, L = Math.hypot(dx, dz) || 1; return (dx * f.x + dz * f.z) / L > 0.2 && L < 32; };
    if (P.alive && front(P.pos) && los(eye, P.eye)) e.dtg = P;
    else for (const m of G.mates) { if (!m.h.alive || m.h.hidden) continue; if (front(m.h.pos) && los(eye, m.h.j[J.Ne])) { e.dtg = m; break; } }
  }
  // alternate: crawl back a little (pistol on the chest), then aim and fire
  e.dphT -= dt;
  if (e.dph === 'crawl') {
    h.aimTarget = 0.1;
    const step = 0.32 * dt;
    if (e.crawlLeft > 0 && lieRoom(h, d.yaw, 0.85 + step, 0.2)) { h.pos.addScaledVector(f, -step); e.crawlLeft -= step; d.cw = 1; d.cph += dt * 1.3; }
    if (e.dphT <= 0 || e.crawlLeft <= 0) { e.dph = 'aim'; e.dphT = rr(3, 5); }
    return;
  }
  if (e.dphT <= 0 && e.crawlLeft > 0 && P.pos.distanceTo(h.pos) < 16) { e.dph = 'crawl'; e.dphT = rr(1.2, 2.2); return; }
  const tg = e.dtg;
  if (!tg) { h.aimTarget = 0.15; return; }
  const tp = tg === P ? P.eye : tg.h.j[J.Ne];
  h.aim.subVectors(tp, h.j[J.SR]).normalize(); h.aimTarget = 1;
  if ((e.dfT -= dt) <= 0 && h.aimT > 0.75) {
    e.dfT = rr(1.3, 2.3); h.recoil = 1;
    const mz = _t.copy(h.j[J.W1]);
    if (tg === P) shootAtPlayer(mz, { dmg: 5, acc: 0.45, snd: 'pistol', rate: 1.12, vol: 0.55, tracer: 0.25, flash: 0.6 });
    else shootAt(h, mz, _e.copy(tp).add(_m.set(rr(-0.5, 0.5), rr(-0.3, 0.5), rr(-0.5, 0.5))), { dmg: 0, skip: h.faction, spread: 0.05, snd: 'pistol', rate: 1.12, vol: 0.5, tracer: 0.25, flash: 0.6 });
  }
}

// ---------- melee (both sides). Human animates h.meleeT (wind-up, strike at MS, recovery); the AI lands the blow.
// returns true while the soldier is busy with melee (skip the rest of his AI this frame)
function meleeFace(h, tp, dt) {
  _o.subVectors(tp, h.pos); _o.y = 0; const d = _o.length();
  if (d > 1e-3) { h.yaw += clamp(angDiff(h.yaw, yawOf(_o)), -11 * dt, 11 * dt); h.aim.copy(_o).multiplyScalar(1 / d); h.aim.y = -0.05; }
  return d;
}
export function enemyMelee(e, dt) {
  const h = e.h, P = G.player;
  if (e.mel) {
    const m = e.mel, isP = m.tgt === P;
    const d = meleeFace(h, isP ? P.pos : m.tgt.h.pos, dt);
    h.crouchT = 0; h.aimTarget = 0.4; h.vel.x = h.vel.z = 0;
    if (!m.hit && h.meleeT >= MS) {
      m.hit = true;
      const dy = Math.abs((isP ? P.pos.y : m.tgt.h.pos.y) - h.pos.y);
      if (d < 2.35 && dy < 1.2 && (isP ? P.alive : m.tgt.h.alive)) {
        _d.subVectors(isP ? P.pos : m.tgt.h.pos, h.pos).setY(0.2).normalize();
        if (isP) { P.damage(h.meleeKind === 'knife' ? 50 : 38, h.pos); P.addShake(0.7); AI.stats.melee.enemyHits++; }
        else m.tgt.h.hurt(35, _d, 'torso', J.Ne, { force: 4, melee: true });
        play('thud', { pos: h.pos, vol: 0.95, ref: 4, rev: 0.1 }); play('flesh', { pos: h.pos, vol: 0.8, ref: 4, rev: 0.1 });
      } else play('rustle', { pos: h.pos, vol: 0.6, ref: 4 });
    }
    if (h.meleeT < 0) { e.mel = null; e.meleeCD = rr(0.9, 1.6); return false; }
    return true;
  }
  if ((e.meleeCD = (e.meleeCD || 0) - dt) > 0 || h.sit || h.grips) return false;
  let tgt = null, bd = 1.9;
  if (P.alive && G.state === 'play' && !P.mounted) { const d = Math.hypot(P.pos.x - h.pos.x, P.pos.z - h.pos.z); if (d < bd && Math.abs(P.pos.y - h.pos.y) < 1.0) { bd = d; tgt = P; } }
  for (const m of G.mates) { const mh = m.h; if (!mh.alive || mh.hidden || mh.sit || m.arc) continue; const d = Math.hypot(mh.pos.x - h.pos.x, mh.pos.z - h.pos.z); if (d < bd - 0.25 && Math.abs(mh.pos.y - h.pos.y) < 1.0) { bd = d; tgt = m; } }
  if (!tgt) return false;
  if (!los(_o.copy(h.pos).setY(h.pos.y + 1.2), _e.copy(tgt === P ? P.pos : tgt.h.pos).setY((tgt === P ? P.pos.y : tgt.h.pos.y) + 1.2))) { e.meleeCD = 0.5; return false; }
  e.mel = { tgt, hit: false }; h.meleeT = 0; h.meleeKind = h.gunKind === 'smg' || h.gunKind === 'rpg' || Math.random() < 0.3 ? 'knife' : 'butt';
  releaseToken(e); if (e.state === 'aim' || e.state === 'fire') e.state = 'cover';
  AI.stats.melee.enemy++;
  play('rustle', { pos: h.pos, vol: 0.5, ref: 4 });
  return true;
}
// a squad mate strikes an enemy that got within arm's reach
export function mateMelee(m, dt) {
  const h = m.h;
  if (m.mel) {
    const e = m.mel.tgt;
    const d = meleeFace(h, e.h.pos, dt);
    h.crouchT = 0; h.aimTarget = 0.4; h.vel.x = h.vel.z = 0;
    if (!m.mel.hit && h.meleeT >= MS) {
      m.mel.hit = true;
      if (e.h.alive && d < 2.3) {
        _d.subVectors(e.h.pos, h.pos).setY(0.25).normalize();
        const k = e.h.hurt(e.jugg ? 60 : 300, _d, 'torso', J.Ne, { force: 8, melee: true });
        G.fx.impact(_o.copy(e.h.j[J.Ne]), _e.copy(_d).negate(), 'flesh');
        play('thud', { pos: h.pos, vol: 0.95, ref: 4, rev: 0.1 }); play('flesh', { pos: h.pos, vol: 0.8, ref: 4, rev: 0.1 });
        if (k) { AI.stats.melee.mateKills++; mateKill(m); }
      } else play('rustle', { pos: h.pos, vol: 0.6, ref: 4 });
    }
    if (h.meleeT < 0) { m.mel = null; m.meleeCD = rr(0.6, 1.2); return false; }
    return true;
  }
  if ((m.meleeCD = (m.meleeCD || 0) - dt) > 0 || h.sit || h.hidden || m.arc) return false;
  let best = null, bd = 1.75;
  for (const e of G.enemies) {
    const eh = e.h; if (!eh.alive || e.kind === 'gunner' || eh.sit) continue;
    const d = Math.hypot(eh.pos.x - h.pos.x, eh.pos.z - h.pos.z);
    if (d < bd && Math.abs(eh.pos.y - h.pos.y) < 1.0) { bd = d; best = e; }
  }
  if (!best) return false;
  m.mel = { tgt: best, hit: false }; h.meleeT = 0; h.meleeKind = Math.random() < 0.5 ? 'knife' : 'butt';
  AI.stats.melee.mate++;
  if (Math.random() < 0.5) callout(m, 'MC_MELEE');
  return true;
}

// ---------- squad mates step out of the player's way, then drift back to their post
export function mateYield(m, dt, moveFn) {
  const h = m.h, P = G.player;
  if (!m.home) m.home = h.pos.clone();
  const dx = h.pos.x - P.pos.x, dz = h.pos.z - P.pos.z, d = Math.hypot(dx, dz), pv = Math.hypot(P.vel.x, P.vel.z);
  if (d < 1.2 && pv > 0.8 && Math.abs(P.pos.y - h.pos.y) < 1.2) {
    const px = P.vel.x / pv, pz = P.vel.z / pv, ahead = -(dx * px + dz * pz); // < 0: the mate is ahead of the player
    if (ahead < 0.3) {
      const side = dx * pz - dz * px >= 0 ? 1 : -1;
      h.vel.x = pz * side * 2.4 + px * 0.8; h.vel.z = -px * side * 2.4 + pz * 0.8;
      moveFn(h, dt); m.yT = 1.4; return true;
    }
  }
  m.yT = (m.yT || 0) - dt;
  const hd = Math.hypot(m.home.x - h.pos.x, m.home.z - h.pos.z);
  if (m.yT <= 0 && hd > 0.3 && d > 1.7) {
    h.vel.x = (m.home.x - h.pos.x) / hd * 1.6; h.vel.z = (m.home.z - h.pos.z) / hd * 1.6;
    moveFn(h, dt); return false;
  }
  return false;
}

// ---------- callouts (subtitles through the director's dialogue queue; only when no story line is playing or queued)
const CALL = {
  MC_CONTACT: ["Contact! Twelve o'clock!", '接敌！正前方！'],
  MC_DOWN: ['Tango down.', '干掉一个。'],
  MC_DOWN2: ['Got him.', '解决了。'],
  MC_RELOAD: ['Reloading!', '换弹！'],
  MC_NADE: ['Grenade! Get clear!', '手雷！快躲开！'],
  MC_FLANK: ["They're flanking us!", '有人从侧面包抄！'],
  MC_FINISH: ["That one's still moving!", '那个还在动！'],
  MC_RETREAT: ["They're falling back!", '他们在后撤！'],
  MC_MG: ['Machine gunner! Stay down!', '机枪手！压低身子！'],
  MC_SNIPER: ['Sniper! Watch for the glint!', '狙击手！注意镜头反光！'],
  MC_SHOTGUN: ['Shotgunner closing in!', '霰弹枪手冲过来了！'],
  MC_MELEE: ['Get off me!', '滚开！'],
};
export function callout(m, id, urgent) {
  if (!m || !m.h || !m.h.alive || m.h.hidden || G.state !== 'play' || !CALL[id] || !m.name) return false;
  if (D.cur || D.q.length) return false;
  if (G.t - AI.callT < (urgent ? 5 : 11) || G.t - (AI.callIds[id] ?? -99) < 28) return false;
  const key = `${id}_${m.name}`;
  if (!LINES[key]) LINES[key] = [m.name, CALL[id][0], CALL[id][1]];
  AI.callT = G.t; AI.callIds[id] = G.t; say(key, 0);
  return true;
}
