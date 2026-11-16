import { G, THREE, clamp, damp, lerp, smooth, fwdYaw, rightYaw, dirFromYawPitch, rr } from './core.js';
import { input, key, hit } from './input.js';
import { moveChar, findLedge, GRAV, rayBoxes, supportAt, groundMat } from './physics.js';
import { WP, fireWeapon, fireDShK, startReload, updateViewmodel, switchTo, startThrow, startThrowBack, startMelee, curDef, busy, resetWeapons, toggleUB, adsFov, WDEF } from './weapon.js';
import { angDiff } from './core.js';
import { J } from './humans.js';
import { throwNade, NADES } from './grenade.js';
import { T, GUN_PIVOT, DECK } from './train.js';
import { play, muffle, footstep, A as AU } from './audio.js';
import { HUD } from './hud.js';
import { updateWUI } from './attach.js';

export const P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.32, h: 1.75,
  grounded: false, onTrain: false, carryZ: 0, support: null,
  yaw: 0, pitch: 0, crouched: false, eyeY: 1.62, eye: new THREE.Vector3(), chest: new THREE.Vector3(),
  health: 100, alive: true, lastHit: -99, mounted: false, mantle: null,
  recoilP: 0, recoilY: 0, shake: 0, lookDX: 0, lookDY: 0, bobPhase: 0, bobAmt: 0, moving: false, sprinting: false,
  enabled: true, lockLook: false, landDip: 0, wasOnTrain: false, slide: false, roll: 0, deadT: 0, god: false,
  canMount: false, canDismount: true, stepAcc: 0, fovKick: 0, autoLook: null,
  lean: 0, leanOff: 0, meleeKey: 'KeyF', tbNade: null, foot: 0,
};
G.player = P;

export function resetPlayer(pos, yaw = 0) {
  P.pos.copy(pos); P.vel.set(0, 0, 0); P.yaw = yaw; P.pitch = 0; P.health = 100; P.alive = true;
  P.mounted = false; P.mantle = null; P.recoilP = P.recoilY = 0; P.shake = 0; P.crouched = false;
  P.grounded = false; P.onTrain = false; P.carryZ = 0; P.slide = false; P.roll = 0; P.deadT = 0; P.lockLook = false;
  P.downed = null; P.shield = false; P.noCrowd = false;
  P.enabled = true; P.prone = false; P.getUp = false; P.autoLook = null; P.scriptMove = null; P.lunge = 0; P.meleeTarget = null; P.jumped = false; P.landed = false; P.wasOnTrain = false; P.canMount = false; P.canDismount = true; P.camY = pos.y;
  P.lean = 0; P.leanOff = 0; P.tbNade = null; P.pickHold = 0;
  WP.hidden = false; resetWeapons();
  if (T.dshk) T.dshk.gloves.visible = false;
}

P.recoil = (p, y) => { P.pitch += p * 0.45; P.recoilP += p * 0.55; P.yaw += y; };
P.addShake = (s) => { P.shake = Math.min(1.5, P.shake + s); };
P.damage = (amt, from, force) => {
  if (!P.alive || P.god || G.state !== 'play' || (P.shield && !force)) return;
  if (P.health < 35) amt *= 0.55; // COD-style grace when nearly dead
  P.health -= amt; P.lastHit = G.t;
  P.addShake(0.12);
  if (from && G.hud) {
    const dx = from.x - P.pos.x, dz = from.z - P.pos.z;
    const ang = Math.atan2(-dx, -dz) - P.yaw;
    G.hud.damage(ang, amt);
  }
  play('flesh', { vol: 0.45, rev: 0, noSlow: true });
  if (P.health <= 0) { P.health = 0; P.alive = false; P.deadT = 0; G.stats.deaths++; if (G.onPlayerDeath) G.onPlayerDeath(); }
};

export function mount() {
  P.mounted = true; WP.hidden = true; WP.reloadT = -1; T.dshk.gloves.visible = true;
  // face the current gun direction
  P.yaw = T.dshk.yaw.rotation.y; P.pitch = T.dshk.pitch.rotation.x;
  play('magin', { vol: 0.6 });
  if (G.onMount) G.onMount();
}
export function dismount() {
  P.mounted = false; WP.hidden = false; T.dshk.gloves.visible = false;
  const f = fwdYaw(P.yaw);
  P.pos.set(GUN_PIVOT.x - f.x * 1.0, GUN_PIVOT.y - 0.95, GUN_PIVOT.z - f.z * 1.0);
  P.vel.set(0, 0, 0);
}

export function jumpOff() {
  if (P.mounted) dismount();
  P.jumped = true; P.enabled = false;
  P.vel.set(7.2, 6.6, -1.5); P.grounded = false; P.carryZ = 0;
  P.pos.y += 0.1;
  play('rustle', { vol: 0.8, noSlow: true });
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();

G.onMelee = () => {
  const e = P.meleeTarget; P.meleeTarget = null;
  if (e && e.h.alive && e.h.pos.distanceTo(P.pos) < 2.2) {
    const dir = new THREE.Vector3().subVectors(e.h.pos, P.pos).setY(0.25).normalize();
    e.h.hurt(500, dir, 'torso', J.Ne, { force: 9 });
    G.fx.impact(e.h.j[J.Ne].clone(), dir.clone().negate(), 'flesh');
    play('flesh', { vol: 0.9, rev: 0.1 }); play('thud', { vol: 0.7, rev: 0.1 });
    P.addShake(0.25); if (G.hud) G.hud.hitmarker(true); G.stats.hits++;
  }
};

G.onThrow = () => {
  const cam = G.camera, f = cam.getWorldDirection(new THREE.Vector3());
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const pos = cam.position.clone().addScaledVector(f, 0.45).addScaledVector(r, -0.12).addScaledVector(u, -0.06);
  const vel = f.clone().multiplyScalar(16.5).addScaledVector(u, 3.2);
  vel.x += P.vel.x; vel.z += P.vel.z + P.carryZ;
  throwNade(pos, vel, 'player');
};

// throw-back release: the snatched enemy grenade leaves the hand along the aim with whatever fuse it has left
G.onThrowBack = (n) => {
  const cam = G.camera, f = cam.getWorldDirection(new THREE.Vector3());
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  n.pos.copy(cam.position).addScaledVector(f, 0.45).addScaledVector(r, -0.12).addScaledVector(u, -0.06);
  n.vel.copy(f).multiplyScalar(17).addScaledVector(u, 3.4); n.vel.x += P.vel.x; n.vel.z += P.vel.z + P.carryZ;
  n.held = false; n.rest = false; n.onGround = false; n.warned = false; n.g.visible = true; n.owner = 'player';
};

// ---- melee (F when nothing to interact with, or V) with a short lunge toward a close enemy in front
function doMelee() {
  if (!startMelee()) return;
  const f = fwdYaw(P.yaw, _f); let best = null, bd = 3.2;
  for (const e of G.enemies) {
    if (!e.h.alive) continue;
    const dx = e.h.pos.x - P.pos.x, dz = e.h.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < bd && Math.abs(e.h.pos.y - P.pos.y) < 1.3 && (dx * f.x + dz * f.z) / (d || 1) > 0.55) { bd = d; best = e; }
  }
  P.meleeTarget = best;
  if (best && bd > 1.1) { const k = (bd - 0.9) / 0.13; P.vel.x = ((best.h.pos.x - P.pos.x) / bd) * k; P.vel.z = ((best.h.pos.z - P.pos.z) / bd) * k; P.lunge = 0.13; }
}
// F is "interact" whenever an interaction is on offer: a level prompt naming F (or any prompt flagged by the level),
// a mountable gun in reach, or a weapon pickup in reach. Only otherwise does F swing the knife.
function fInteract() {
  if (P.canMount && P.pos.distanceTo(GUN_PIVOT) < 2.6) return true;
  if (G.pickPrompt) return true;
  if (!HUD.promptActive || !HUD.promptActive()) return false;
  const pr = HUD._p; // a pure hint ("press 4 to ...") does not swallow melee
  return !pr || typeof pr !== 'string' || pr.includes('>F<') || pr.includes(' F ');
}

// ---- lean (Q / E): eye slides sideways ~0.35 m and the view rolls ~10 deg; never through geometry
const _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
function updateLean(dt, active, cam) {
  let tgt = 0;
  if (active && !P.mounted && !P.mantle && !P.sprinting && !P.slide && !P.scriptMove && !P.jumped && !P.lockLook) { if (key('KeyQ')) tgt -= 1; if (key('KeyE')) tgt += 1; }
  P.lean = damp(P.lean, tgt, 10, dt);
  let off = P.lean * 0.35;
  if (Math.abs(off) > 0.002) {
    rightYaw(P.yaw, _ld).multiplyScalar(Math.sign(off));
    _lo.copy(cam.position);
    for (const dy of [0, -0.3]) { // eye and shoulder height
      _lo.y = cam.position.y + dy;
      const h = rayBoxes(_lo, _ld, Math.abs(off) + 0.22, false);
      if (h) off = Math.sign(off) * Math.max(0, Math.min(Math.abs(off), h.t - 0.22));
    }
  }
  P.leanOff = Math.abs(off) < Math.abs(P.leanOff) ? off : damp(P.leanOff, off, 18, dt);
  if (Math.abs(P.leanOff) > 1e-4) { rightYaw(P.yaw, _ld); cam.position.addScaledVector(_ld, P.leanOff); cam.position.y -= Math.abs(P.leanOff) * 0.1; }
}

// ---- footsteps: own steps quiet, low and centred (alternating feet); other people's steps positional, nearest few only
const SURF = { metal: 'metal', wood: 'wood', concrete: 'concrete', ore: 'gravel', rock: 'gravel' };
function surfAt(x, z, y) {
  const s = supportAt(x, z, 0.15, y + 0.15, 0.35);
  if (s.box && s.y > y - 0.3) return SURF[s.box.mat] || 'concrete';
  if (G.lvl === 1) return 'gravel';
  if (G.groundFn) return 'snow';
  const g = groundMat(x, z); return g === 'metal' ? 'metal' : g === 'gravel' ? 'gravel' : 'snow';
}
function ownStep(loud = 1) {
  P.foot ^= 1;
  const surf = P.onTrain && !(P.support && P.support.box) ? 'metal' : surfAt(P.pos.x, P.pos.z, P.pos.y);
  const v = (P.sprinting ? 0.22 : P.crouched ? 0.07 : 0.14) * loud, inside = AU.space && AU.space !== 'open';
  footstep(surf, { vol: v, rate: P.foot ? 0.9 : 0.95, lp: P.sprinting ? 3400 : P.crouched ? 1600 : 2500, pan: P.foot ? 0.1 : -0.1, rev: inside ? 0.06 : 0.02 });
}
const _nearH = [];
let stepScan = 0;
function npcSteps(dt) {
  if (!AU.on || !AU.steps) return;
  if ((stepScan -= dt) <= 0) { // pick the nearest moving people every few frames
    stepScan = 0.2; _nearH.length = 0;
    for (const h of G.humans) {
      if (!h.alive || h.hidden || h.sit || h.removed || h.noSteps) continue;
      const d = Math.hypot(h.pos.x - P.pos.x, h.pos.z - P.pos.z); if (d > 24) continue;
      h._sd = d; _nearH.push(h);
    }
    _nearH.sort((a, b) => a._sd - b._sd); if (_nearH.length > 4) _nearH.length = 4;
  }
  for (const h of _nearH) {
    const ph = Math.floor((h.phase || 0) * 2);
    if (h._sph === undefined) { h._sph = ph; continue; }
    if (ph === h._sph) continue;
    h._sph = ph;
    const sp = h.spd ?? 0; if (sp < 0.5 || !h.alive) continue;
    const surf = surfAt(h.pos.x, h.pos.z, h.pos.y);
    footstep(surf, { pos: h.pos, vol: clamp(0.35 + sp * 0.07, 0.35, 0.75) * (h.crouch > 0.5 ? 0.55 : 1), rate: h.faction === 'us' ? 1.0 : 1.04, lp: sp > 3.5 ? 9000 : 6500, rev: 0.05 });
  }
}

// ---- acoustic space of the listener for gun tails: mine tunnel / room (roofed + walls) / open
let spaceT = 0;
const _sd = new THREE.Vector3(), _so = new THREE.Vector3();
function updateSpace(dt, cam) {
  if ((spaceT -= dt) > 0) return; spaceT = 0.3;
  if (G.lvl === 1) { AU.space = 'tunnel'; return; }
  _so.copy(cam.position);
  const roof = rayBoxes(_so, _sd.set(0, 1, 0), 9, true);
  let walls = 0; if (roof) for (let k = 0; k < 4; k++) { _sd.set(Math.cos(k * 1.5708 + 0.4), 0, Math.sin(k * 1.5708 + 0.4)); if (rayBoxes(_so, _sd, 12, true)) walls++; }
  AU.space = roof && walls >= 2 ? 'room' : 'open';
}

export function updatePlayer(dt) {
  const cam = G.camera;
  P.lookDX = P.lookDY = 0;
  if (!P.alive) {
    P.deadT += dt;
    const k = smooth(P.deadT / 1.2);
    cam.position.set(P.pos.x, P.pos.y + lerp(P.eyeY, 0.35, k), P.pos.z);
    cam.rotation.set(P.pitch + 0.3 * k, P.yaw, 0.7 * k);
    WP.hidden = true; updateViewmodel(dt, P);
    return;
  }
  if (P.downed) return updateDowned(dt, cam);
  const active = P.enabled && G.state === 'play' && !G.paused;
  const ads = active && input.rmb && !P.sprinting && !busy() && !P.mounted;
  // ---- look
  if (!P.lockLook && G.state === 'play' && !G.paused) {
    const s = 0.0021 * input.sens * (ads ? (adsFov() < 40 ? 0.42 : 0.62) : 1) * (P.mounted ? 0.75 : 1);
    let mdx = input.mdx, mdy = input.mdy;
    if (input.lockFailed && !input.locked) {
      if (input.mx < 0.05) mdx -= 900 * dt * (0.05 - input.mx) * 20; else if (input.mx > 0.95) mdx += 900 * dt * (input.mx - 0.95) * 20;
      if (input.my < 0.05) mdy -= 500 * dt * (0.05 - input.my) * 20; else if (input.my > 0.95) mdy += 500 * dt * (input.my - 0.95) * 20;
    }
    if (key('ArrowLeft')) mdx -= 900 * dt; if (key('ArrowRight')) mdx += 900 * dt;
    if (key('ArrowUp')) mdy -= 500 * dt; if (key('ArrowDown')) mdy += 500 * dt;
    P.yaw -= mdx * s; P.pitch -= mdy * s; P.lookDX = mdx; P.lookDY = mdy;
  }
  if (P.autoLook) { // scripted camera target
    const a = P.autoLook;
    _w.subVectors(a.target, P.eye).normalize();
    const ty = Math.atan2(-_w.x, -_w.z), tp = Math.asin(clamp(_w.y, -1, 1));
    let dy = ty - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    P.yaw += dy * (1 - Math.exp(-a.rate * dt)); P.pitch = damp(P.pitch, tp, a.rate, dt);
  }
  P.recoilP = damp(P.recoilP, 0, 9, dt); P.recoilY = damp(P.recoilY, 0, 9, dt);
  P.pitch = P.mounted ? clamp(P.pitch, -0.32, 0.8) : clamp(P.pitch, -1.45, 1.45);
  P.shake = damp(P.shake, 0, 4, dt);
  P.landDip = damp(P.landDip, 0, 9, dt);

  if (P.mounted) {
    const D = T.dshk;
    D.yaw.rotation.y = P.yaw; D.pitch.rotation.x = P.pitch;
    D.yaw.updateMatrixWorld(true);
    D.pitch.localToWorld(cam.position.copy(D.eyeLocal));
    const f = fwdYaw(P.yaw, _f);
    P.pos.set(GUN_PIVOT.x - f.x * 0.95, GUN_PIVOT.y - 0.95, GUN_PIVOT.z - f.z * 0.95);
    P.eye.copy(cam.position); P.chest.copy(P.pos).setY(GUN_PIVOT.y + 0.25);
    if (active && input.lmb && WP.dCool <= 0 && !WP.overheated) fireDShK(P);
    if (active && P.canDismount && hit('KeyF')) dismount();
    WP.adsT = damp(WP.adsT, 0, 10, dt); WP.sprintT = 0;
  } else if (P.mantle) {
    const m = P.mantle; m.t += dt;
    const u = smooth(m.t / m.dur);
    P.pos.lerpVectors(m.from, m.to, u); P.pos.y += Math.sin(u * Math.PI) * 0.18;
    P.landDip = -0.05 * Math.sin(u * Math.PI);
    if (m.t >= m.dur) { P.mantle = null; P.vel.set(0, 0, 0); P.grounded = true; P.onTrain = true; P.carryZ = 0; }
  } else {
    // ---- move
    const f = fwdYaw(P.yaw, _f), r = rightYaw(P.yaw, _r);
    _w.set(0, 0, 0);
    if (active) {
      if (key('KeyW')) _w.add(f); if (key('KeyS')) _w.sub(f);
      if (key('KeyD')) _w.add(r); if (key('KeyA')) _w.sub(r);
      if (hit('KeyC') || hit('ControlLeft')) P.crouched = !P.crouched;
    }
    if (_w.lengthSq() > 0) _w.normalize();
    P.sprinting = active && key('ShiftLeft') && key('KeyW') && !ads && P.grounded && WP.reloadT < 0;
    if (P.sprinting) P.crouched = false;
    const speed = (P.sprinting ? 7.4 : P.crouched ? 2.3 : ads ? 2.9 : 4.7) * (curDef().move || 1);
    if (P.scriptMove) {
      const sm = P.scriptMove, tz = sm.zf ? sm.zf() : sm.z, dx = sm.x - P.pos.x, dz = tz - P.pos.z, dd = Math.hypot(dx, dz);
      const sp = dd > 0.4 ? Math.min(sm.speed, dd * 2.5) : 0;
      P.vel.x = dd > 0.01 ? (dx / dd) * sp : 0; P.vel.z = dd > 0.01 ? (dz / dd) * sp : 0;
    } else if (P.slide) {
      const fr = P.grounded ? 22 : 0;
      const vz = P.vel.z, vx = P.vel.x;
      const sp = Math.hypot(vx, vz);
      if (sp > 0) { const k = Math.max(0, sp - fr * dt) / sp; P.vel.x *= k; P.vel.z *= k; }
    } else if (P.lunge > 0) {
      P.lunge -= dt;
    } else if (P.grounded) {
      const acc = 1 - Math.exp(-13 * dt);
      P.vel.x += (_w.x * speed - P.vel.x) * acc; P.vel.z += (_w.z * speed - P.vel.z) * acc;
    } else if (!P.jumped) {
      P.vel.x += _w.x * speed * dt * 1.5; P.vel.z += _w.z * speed * dt * 1.5;
      const hs = Math.hypot(P.vel.x, P.vel.z); if (hs > 7.6) { P.vel.x *= 7.6 / hs; P.vel.z *= 7.6 / hs; }
    }
    if (active && hit('Space')) {
      const ledge = findLedge(P.pos, f, 1.85);
      if (ledge && (P.grounded || P.vel.y < 2)) {
        P.mantle = { t: 0, dur: 0.42, from: P.pos.clone(), to: new THREE.Vector3(ledge.x, ledge.y + 0.01, ledge.z) };
        play('rustle', { vol: 0.7 });
        if (G.onMantle) G.onMantle();
      } else if (P.grounded) { P.vel.y = 6.2; P.grounded = false; play('rustle', { vol: 0.4 }); }
    }
    const wasG = P.grounded;
    P.landV = 0;
    moveChar(P, dt, true);
    if (P.grounded) {
      if (!wasG && P.landV > 5) { P.landDip = -Math.min(0.18, P.landV * 0.012); play('thud', { vol: Math.min(1, P.landV / 10) }); ownStep(1.6); }
      const ground = !P.onTrain;
      if (P.jumped && ground && !P.slide) { // landed after the bridge jump: slide to a stop
        P.slide = true; P.vel.z = -G.v * 0.55; P.vel.x *= 0.4; P.addShake(0.8); P.landDip = -0.3;
        play('thud', { vol: 1, noSlow: true }); footstep('snow', { vol: 0.5, rate: 0.85, lp: 3000 });
        if (G.onJumpLand) G.onJumpLand();
      }
      P.carryZ = ground ? G.v : 0;
    }
    P.pos.z += P.carryZ * dt;
    // footsteps / bob
    const hs = Math.hypot(P.vel.x, P.vel.z);
    P.moving = hs > 0.5;
    if (P.grounded && hs > 0.5 && (!P.slide || P.scriptMove)) {
      P.bobPhase += (hs * dt) / (P.sprinting ? 2.6 : 2.0);
      P.stepAcc += hs * dt;
      if (P.stepAcc > (P.sprinting ? 1.3 : P.crouched ? 0.8 : 0.95) * (0.94 + Math.random() * 0.12)) { P.stepAcc = 0; ownStep(); }
    }
    P.bobAmt = damp(P.bobAmt, P.grounded ? clamp(hs / 5, 0, 1.4) : 0, 8, dt);
    if (P.onTrain) P.wasOnTrain = true;
    // eye
    P.eyeY = damp(P.eyeY, P.prone ? 0.42 : P.crouched ? 1.08 : 1.62, P.prone ? 14 : P.getUp ? 3 : 10, dt);
    const lastY = P.camY ?? P.pos.y;
    P.camY = P.grounded ? damp(lastY, P.pos.y, 18, dt) : P.pos.y; // smooth step-ups
    cam.position.set(P.pos.x, P.camY + P.eyeY + P.landDip, P.pos.z);
    updateLean(dt, active, cam);
    // ---- weapon
    WP.adsT = damp(WP.adsT, ads ? 1 : 0, 14, dt);
    WP.sprintT = damp(WP.sprintT, P.sprinting ? 1 : 0, 9, dt);
    if (active) {
      const D = curDef();
      if ((D.auto ? input.lmb : input.lmbPressed) && WP.cool <= 0 && !busy() && WP.sprintT < 0.35) {
        if (WP.ammo > 0) fireWeapon(P);
        else if (input.lmbPressed) { play('dry', { vol: 0.6 }); startReload(); }
      }
      if (hit('KeyR')) startReload();
      if (hit('Digit1')) switchTo(WP.prim);
      if (hit('Digit2')) switchTo('pistol');
      if (hit('Digit3')) switchTo(WP.launch);
      if (input.wheel) {
        const list = [WP.prim, 'pistol']; if (WP.launch) list.push(WP.launch);
        const i = list.indexOf(WP.sw ? WP.sw.to : WP.cur);
        switchTo(list[(i + (input.wheel > 0 ? 1 : list.length - 1)) % list.length]);
      }
      if (hit('KeyG')) { if (P.tbNade) startThrowBack(P.tbNade); else startThrow(); }
      if (hit('KeyX')) toggleUB();
      if ((hit(P.meleeKey) && !fInteract()) || hit('KeyV')) doMelee();
      if (WP.ammo === 0 && WP.reserve > 0 && !busy() && !input.lmb) startReload();
      if (hit('KeyF') && P.canMount && (!G.groundFn || G.mg5) && P.pos.distanceTo(GUN_PIVOT) < 2.6) mount();
    }
    P.eye.copy(cam.position);
    P.chest.copy(P.pos).setY(P.pos.y + (P.crouched ? 0.8 : 1.25)); if (P.leanOff) P.chest.addScaledVector(rightYaw(P.yaw, _r), P.leanOff * 0.5);
  }
  if (P.mounted || P.mantle) { P.lean = 0; P.leanOff = 0; }
  // enemy grenade close by and not about to go off: offer the throw-back
  P.tbNade = null;
  if (P.enabled && !P.mounted && WP.throwT < 0 && G.state === 'play') {
    const f = fwdYaw(P.yaw, _f); let bd = 2.2;
    for (const n of NADES) {
      if (n.owner !== 'enemy' || n.held || n.fuse < 0.35) continue;
      const dx = n.pos.x - P.pos.x, dz = n.pos.z - P.pos.z, dy = n.pos.y - P.pos.y, d = Math.hypot(dx, dz);
      if (d > bd || dy < -1.2 || dy > 1.7 || (d > 0.7 && (dx * f.x + dz * f.z) / d < 0.2)) continue;
      bd = d; P.tbNade = n;
    }
  }
  // health regen
  if (P.alive && G.t - P.lastHit > 3.0) P.health = Math.min(100, P.health + 40 * dt);
  // camera rotation + shake
  const sh = P.shake * P.shake;
  if (sh > 0.0005) cam.position.add(_w.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(sh * 0.06));
  const strafeRoll = P.mounted ? 0 : -clamp(P.vel.dot(rightYaw(P.yaw, _r)) * 0.004, -0.02, 0.02);
  P.roll = damp(P.roll, P.slide ? Math.sin(G.t * 9) * 0.06 : 0, 6, dt);
  cam.rotation.set(P.pitch + P.recoilP + (sh > 0.0005 ? rr(-1, 1) * sh * 0.01 : 0), P.yaw + P.recoilY, strafeRoll + P.roll - P.leanOff * 0.5);
  // fov
  const fovT = (P.mounted ? 66 : lerp(72, adsFov(), WP.adsT)) + WP.sprintT * 4 + P.fovKick;
  P.fovKick = damp(P.fovKick, 0, 4, dt);
  if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = damp(cam.fov, fovT, 16, dt); cam.updateProjectionMatrix(); }
  updateViewmodel(dt, P);
  updateSpace(dt, cam); npcSteps(dt);
  updateWUI(ubLine(), WP.ubOn && WP.cur === WP.prim, !!P.tbNade, WP.m && WP.m.optic === 'x2' && WP.cur === WP.prim && !P.mounted ? clamp((WP.adsT - 0.55) / 0.45, 0, 1) : 0);
}
// the secondary line under the ammo counter: the mode that is NOT selected (underbarrel rounds, or the rifle's)
function ubLine() {
  const u = WP.ub; if (!u || WP.cur !== WP.prim || P.mounted) return '';
  if (WP.ubOn) { const s = WP.st[WP.prim]; return `<kbd>X</kbd>${WDEF[WP.prim].name}<b>${s.ammo} / ${s.reserve}</b>`; }
  return `<kbd>X</kbd>${u.def.name}<b>${u.ammo} / ${u.reserve}</b>`;
}

// ---------- wounded on the floor (Part 4 finale) ----------
// P.downed = { eye, sens, yawC, yawR, pmin, pmax, crawl, gun, vmDrop, sag, sway, speed } — set by finale.js.
// Lying/crawling: low camera with slow sway, limited look, forward-only crawl in pulses, optional forced pistol.
export function updateDowned(dt, cam) {
  const d = P.downed, active = P.enabled && G.state === 'play' && !G.paused;
  if (!P.lockLook && active) {
    const s = 0.0021 * input.sens * (d.sens ?? 0.4);
    P.yaw -= input.mdx * s; P.pitch -= input.mdy * s; P.lookDX = input.mdx; P.lookDY = input.mdy;
  }
  if (P.autoLook) {
    const a = P.autoLook;
    _w.subVectors(a.target, P.eye).normalize();
    const ty = Math.atan2(-_w.x, -_w.z), tp = Math.asin(clamp(_w.y, -1, 1));
    P.yaw += angDiff(P.yaw, ty) * (1 - Math.exp(-a.rate * dt)); P.pitch = damp(P.pitch, tp, a.rate, dt);
  }
  if (d.yawR !== undefined && d.yawC !== undefined) { const dy = angDiff(d.yawC, P.yaw); if (Math.abs(dy) > d.yawR) P.yaw = d.yawC + Math.sign(dy) * d.yawR; }
  P.pitch = clamp(P.pitch, d.pmin ?? -0.6, d.pmax ?? 0.9);
  P.recoilP = damp(P.recoilP, 0, 9, dt); P.recoilY = damp(P.recoilY, 0, 9, dt);
  P.shake = damp(P.shake, 0, 4, dt);
  // crawl: W only, pulses of ~0.45 m/s average, a smear of blood behind each pull
  let v = 0;
  d.pulse = d.pulse || 0;
  if (d.crawl && active && key('KeyW')) {
    const ph0 = d.pulse; d.pulse += dt / 1.15;
    const u = d.pulse % 1; v = (d.speed ?? 0.45) * (1 - Math.cos(u * Math.PI * 2));
    if (Math.floor(ph0) !== Math.floor(d.pulse) || ph0 === 0) {
      d.pulses = (d.pulses || 0) + 1;
      if (G.fx.bloodPool) G.fx.bloodPool(P.pos.clone(), 0.12);
      play('rustle', { vol: 0.35, rev: 0, rate: 0.7 }); if (d.pulses % 2) play('breath', { vol: 0.5, rev: 0, noSlow: true });
    }
  } else if (d.pulse % 1 > 0.02) { d.pulse = Math.min(Math.ceil(d.pulse), d.pulse + dt / 1.15); }
  const f = fwdYaw(P.yaw, _f);
  P.vel.x = f.x * v; P.vel.z = f.z * v; P.h = 0.6;
  moveChar(P, dt, true);
  P.h = 1.75;
  P.moving = false; P.sprinting = false; P.crouched = false;
  const u = d.pulse % 1, crawlK = d.crawl ? 1 : 0;
  const sw = d.sway ?? 1, t = G.real;
  const bob = -Math.abs(Math.sin(u * Math.PI)) * 0.06 * crawlK;
  const eye = lerp(d.eye ?? 0.35, 0.16, d.sag || 0);
  cam.position.set(P.pos.x, P.pos.y + eye + bob + Math.sin(t * 0.7) * 0.015 * sw, P.pos.z);
  const sh = P.shake * P.shake;
  if (sh > 0.0005) cam.position.add(_w.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(sh * 0.06));
  const roll = Math.sin(t * 0.43) * 0.03 * sw + Math.sin(u * Math.PI * 2) * 0.05 * crawlK + (d.sag || 0) * 0.42;
  cam.rotation.set(P.pitch + P.recoilP + Math.sin(t * 0.61) * 0.012 * sw - (d.sag || 0) * 0.35, P.yaw + P.recoilY + Math.sin(t * 0.37) * 0.015 * sw, roll);
  P.eye.copy(cam.position); P.chest.copy(P.pos).setY(P.pos.y + 0.25);
  // weapon: pistol only, raised/lowered by vmDrop, no switching
  const ads = active && d.gun && input.rmb && !busy();
  WP.adsT = damp(WP.adsT, ads ? 1 : 0, 14, dt); WP.sprintT = 0;
  WP.hidden = !d.gun && !(d.vmDrop < 1);
  if (d.gun && active && (d.vmDrop ?? 0) < 0.3) {
    if (input.lmbPressed && WP.cool <= 0 && !busy()) { if (WP.ammo > 0) fireWeapon(P); else { play('dry', { vol: 0.6 }); startReload(); } }
    if (hit('KeyR')) startReload();
  }
  const fovT = lerp(72, adsFov(), WP.adsT);
  if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = damp(cam.fov, fovT, 16, dt); cam.updateProjectionMatrix(); }
  P.bobAmt = 0; P.lookDX *= 0.4; P.lookDY *= 0.4;
  updateViewmodel(dt, P);
  if (WP.m && !WP.hidden) {
    const k = d.vmDrop || 0, g = WP.m.g;
    g.position.y -= k * 0.42 - Math.sin(t * 0.9) * 0.006; g.position.x += Math.sin(t * 0.55) * 0.008 + k * 0.05;
    g.rotation.x -= k * 0.9; g.rotation.z += Math.sin(t * 0.5) * 0.02 + k * 0.3;
  }
}
