// Part 4 finale: the 99% RPG, blackout, Grinch's drag, waking on the ops-room floor (checkpoint 7),
// Krasin's breach, bullet time (after COD4's last scene), the crawl to the console, the manual send, the monologue.
// All timing runs on real dt from G.updatePart5, so pause and __sim are deterministic; every overlay is our own DOM.
import { G, THREE, rr, clamp, lerp, smooth, yawOf, angDiff } from './core.js';
import { Human, J } from './humans.js';
import { P, resetPlayer } from './player.js';
import { WP, startReload } from './weapon.js';
import { play, musicMode, muffle, A } from './audio.js';
import { HUD } from './hud.js';
import { D, LINES, say } from './director.js';
import { S, setDoor, kickDoor, setUplink, ground5 } from './station.js';
import { key } from './input.js';
import { los } from './physics.js';
import { Builder } from './geom.js';
import { M } from './mats.js';

Object.assign(LINES, {
  P5_GRIN_13: ['GRINCH', 'Sandman! SANDMAN! Stay with me!', 'Sandman！SANDMAN！撑住！'],
  P5_GRIN_14: ['GRINCH', "I got you. I got you, boss. Don't you quit on me.", '我拖着你呢。我拖着你，头儿。别给我放弃。'],
  P5_GRIN_15: ['GRINCH', 'Ninety-nine percent. It needs a manual send. Boss… they\'re at the door.', '百分之九十九。得手动确认发送。头儿……他们到门口了。'],
  P5_KRAS_02: ['克拉辛', 'Где данные?', '数据在哪？'],
});
const MONO = ['Price……剩下的，交给你了。', 'Metal 0-1……完毕。'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V();
const F = { on: false, ph: '', t: 0 };
export const FIN = F;
const WAKE_POS = V(-2.3, 0.15, -2.75), DOOR = V(0, 1.2, 4.85), GRINCH_AT = V(-5.7, 0.15, -1.15);
const IN_ROOM = (x, z) => Math.abs(x) < 7.7 && Math.abs(z) < 4.7;
const floorY = (x, z) => (IN_ROOM(x, z) ? 0.15 : ground5(x, z));

// ---------- overlays (own DOM, below subtitles/prompt) ----------
let UI = null;
function ui() {
  if (UI) return UI;
  const st = document.createElement('style');
  st.textContent = `.fin{inset:0;pointer-events:none}.fin>div{position:absolute;inset:0;opacity:0}
.fin .k{background:#000}.fin .w{background:#fff8ee}.fin .r{background:radial-gradient(ellipse at center,rgba(150,0,0,.35),rgba(110,0,0,.85))}
.fin .v{background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 38%,rgba(70,0,0,.55) 72%,rgba(25,0,0,.95) 100%)}
.fin .m{inset:auto 0 auto 0;top:43%;text-align:center;font:italic 300 30px/1.6 "Noto Serif CJK SC","Source Han Serif SC","Songti SC",serif;color:#e9e3d6;letter-spacing:.14em;text-shadow:0 0 14px #000,0 0 3px #000}
#ui.fin-min .ammo,#ui.fin-min .compass,#ui.fin-min .cross,#ui.fin-min .ftag,#ui.fin-min .nadeind,#ui.fin-min .minimap{display:none}#ui.fin-min.fin-aim .cross{display:block}`;
  document.head.appendChild(st);
  const root = document.createElement('div'); root.className = 'fin';
  const mk = (c) => { const e = document.createElement('div'); e.className = c; root.appendChild(e); return e; };
  UI = { root, v: mk('v'), r: mk('r'), w: mk('w'), k: mk('k'), m: mk('m'), last: {} };
  HUD.root.insertBefore(root, HUD.sub);
  return UI;
}
function ov(name, o) { const u = ui(); o = Math.round(clamp(o, 0, 1) * 100) / 100; if (u.last[name] !== o) { u.last[name] = o; u[name].style.opacity = o; } }
function look(blur, sat) {
  const c = G.renderer.domElement, f = blur > 0.05 || sat < 0.99 ? `blur(${blur.toFixed(1)}px) saturate(${sat.toFixed(2)})` : '';
  if (c.style.filter !== f) c.style.filter = f;
}
function mono(text) { const u = ui(); if (u.mt !== text) { u.mt = text; u.m.textContent = text || ''; } }

// ---------- bloodied first-person arm reaching for the key ----------
let ARM = null;
function arm() {
  if (ARM) return ARM;
  const g = new THREE.Group(), sl = new THREE.Group(), hd = new THREE.Group();
  const b1 = new Builder(); b1.boxC(0, 0, -0.5, 0.09, 0.09, 1, 'paint', 0x6a6350); b1.boxC(0.01, 0.046, -0.7, 0.05, 0.004, 0.16, 'paint', 0x4a0a07); b1.build(M, sl, { cast: false });
  const b2 = new Builder(); b2.boxC(0, 0, -0.04, 0.085, 0.04, 0.1, 'paint', 0x4e2219); for (let k = 0; k < 4; k++) b2.boxC(-0.03 + k * 0.02, -0.005, -0.12, 0.016, 0.016, 0.07, 'paint', k % 2 ? 0x3f1a12 : 0x5a1a10);
  b2.boxC(0.05, 0, -0.06, 0.018, 0.018, 0.06, 'paint', 0x4e2219); b2.build(M, hd, { cast: false });
  g.add(sl, hd); g.visible = false; G.camera.add(g);
  ARM = { g, sl, hd };
  return ARM;
}
const SH = V(0.17, -0.3, 0.02), REST = V(0.16, -0.5, -0.3);
function reach(k) {
  const a = arm(); a.g.visible = k > 0.01;
  if (!a.g.visible) return;
  G.camera.updateMatrixWorld(true);
  _a.copy(S.keyPos); G.camera.worldToLocal(_a);
  _b.copy(REST).lerp(_a, smooth(k));
  _c.subVectors(_b, SH); const L = _c.length(); _c.normalize();
  a.sl.position.copy(SH); a.sl.quaternion.setFromUnitVectors(_a.set(0, 0, -1), _c); a.sl.scale.set(1, 1, Math.max(0.05, L - 0.08));
  a.hd.position.copy(_b).addScaledVector(_c, -0.08); a.hd.quaternion.copy(a.sl.quaternion);
}

// ---------- helpers ----------
function forcePistol() {
  for (const [k, m] of Object.entries(WP.models)) m.g.visible = k === 'pistol';
  WP.cur = 'pistol'; WP.m = WP.models.pistol; WP.m.g.add(WP.flash); WP.flash.position.copy(WP.m.muzzle);
  WP.sw = null; WP.reloadT = -1; WP.throwT = -1; WP.meleeT = -1;
  WP.st.pistol.ammo = Math.max(WP.st.pistol.ammo, 12); WP.st.pistol.reserve = Math.max(WP.st.pistol.reserve, 17);
}
function heart(dt, period, vol = 0.75) {
  F.hb = (F.hb ?? 0.2) - dt;
  if (F.hb <= 0) { F.hb = period; play('heart2', { bus: A.master, rev: 0, vol, noSlow: true }); }
}
function blood(kind, pos, a, b) { if (kind === 'pool') G.fx.bloodPool?.(pos, a); else G.fx.bloodSplat?.(pos, a, b); }
function actor(fname, x, z, o = {}) {
  const h = new Human(fname, o.head ? { head: o.head } : {});
  h.r = 0.3; h.h = 1.75; h.noCrowd = true; h.hp = o.hp || 100;
  h.pos.set(x, floorY(x, z), z); h.yaw = o.yaw ?? 0; h.firstPose = true;
  const a = { h, path: [], speed: o.speed || 2.4, aimAt: null, fireT: rr(0.3, 1), wait: o.wait || 0 };
  F.actors.push(a);
  return a;
}
function stepActor(a, dt) {
  const h = a.h; if (!h.alive) return;
  if ((a.wait -= dt) > 0) { h.vel.set(0, 0, 0); return; }
  const wp = a.path[0];
  if (wp) {
    _a.set(wp.x - h.pos.x, 0, wp.z - h.pos.z); const d = _a.length();
    if (d < 0.08) { a.path.shift(); h.vel.set(0, 0, 0); }
    else { const sp = Math.min(a.speed, d * 4); h.vel.set(_a.x / d * sp, 0, _a.z / d * sp); h.pos.x += h.vel.x * dt; h.pos.z += h.vel.z * dt; }
    h.pos.y = floorY(h.pos.x, h.pos.z);
  } else h.vel.set(0, 0, 0);
  const tgt = a.aimAt && a.aimAt();
  if (tgt) { h.aim.subVectors(tgt, h.j[J.Hc]).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -(a.turn || 5) * dt, (a.turn || 5) * dt); }
  else if (h.vel.lengthSq() > 0.05) { h.aim.set(h.vel.x, 0, h.vel.z).normalize(); h.yaw += clamp(angDiff(h.yaw, yawOf(h.aim)), -6 * dt, 6 * dt); }
}
function shot(h, tgt, o = {}) { // scripted shot: muzzle flash, tracer, impact, sound (no damage)
  const m = h.j[J.W1].clone(); h.recoil = 1;
  _a.subVectors(tgt, m).normalize();
  G.fx.muzzle(m, _a, o.pistol ? 0.6 : 1); G.fx.flash(m, 0xffb060, 12, 8, 0.05);
  G.fx.tracer(m, tgt, { start: 0.3, speed: 300 });
  if (o.flesh !== false) G.fx.impact(tgt, _b.copy(_a).negate(), 'flesh');
  play(o.pistol ? 'pistol' : 'ak', { pos: m, vol: o.vol ?? 0.9, ref: 5, rev: 0.4 });
}

// ---------- 99%: the RPG ----------
export function startFinale(P5, ctx) {
  P5.ph = 'finale';
  Object.assign(F, { on: true, ph: 'rpg', t: 0, actors: [], inside: ctx.IN_BLDG(P.pos.x, P.pos.z) && P.pos.y < 3, hitPos: P.pos.clone(), clearBattle: ctx.clearBattle, hb: 0.3 });
  P.shield = true; P.noCrowd = true; G.otherPrompt = true;
  HUD.objective(null); HUD.setMarker(null); HUD.setPrompt(null);
  HUD.setUpload(99, true, '99% · 等待手动发送'); setUplink('wait', 99);
  // blast point ~1.5 m from the player; the rocket comes in from the enemy side on a clear line, in front of the player if possible
  const f = _a.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const tgt = V(P.pos.x + f.x * 1.3 + f.z * 0.7, 0, P.pos.z + f.z * 1.3 - f.x * 0.7);
  tgt.y = (F.inside ? 0.15 : P.pos.y > 3 ? P.pos.y : floorY(tgt.x, tgt.z)) + 0.35;
  let best = null, bs = -9;
  const opts = F.inside ? [[-4.6, 1.6, -5.2], [0, 1.6, -5.2], [4.6, 1.6, -5.2], [-8.2, 1.6, 0], [8.2, 1.6, 0], [4.6, 1.6, 5.2], [-4.6, 1.6, 5.2], [0, 1.2, 5.2]].map(([x, y, z]) => _b.set(x, y, z).sub(tgt).normalize().clone())
    : Array.from({ length: 13 }, (_, i) => { const a = yawOf(f) + (i - 6) * 0.3; return V(-Math.sin(a), 0.12, -Math.cos(a)).normalize(); });
  for (const d of opts) {
    const o = tgt.clone().addScaledVector(d, 42);
    if (!los(o, tgt)) continue;
    const ang = Math.acos(clamp(d.dot(_c.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw))) / Math.hypot(d.x, d.y, d.z), -1, 1));
    const sc = -d.z * 0.5 - Math.abs(ang - 0.45) * 1.5; // in view, but slightly off-axis so it streaks across
    if (sc > bs) { bs = sc; best = o; }
  }
  if (!best) best = tgt.clone().add(V(0, 30, -25));
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4b5a3a, roughness: 0.6 }));
  mesh.position.copy(best); G.scene.add(mesh);
  F.rpg = { pos: best.clone(), tgt, mesh, v: tgt.clone().sub(best).normalize().multiplyScalar(58), smoke: 0 };
  play('rocket', { pos: best, vol: 1.4, ref: 25, roll: 0.5, rev: 0.4, prio: true });
  if (G.bark) G.bark('RU_01', best, true);
}

function boom() {
  const r = F.rpg; G.scene.remove(r.mesh); F.rpg = null;
  G.fx.explosion(r.tgt, 1.25, {});
  play('explosion', { vol: 1.8, rev: 0.6, prio: true, noSlow: true });
  play('tinnitus', { bus: A.master, rev: 0, vol: 0.55, noSlow: true });
  muffle(240, 0.04);
  P.addShake(1.5); P.pitch += 0.32; P.yaw += rr(-0.25, 0.25); P.roll = 0.35; P.enabled = false; P.lockLook = true;
  F.ph = 'blast'; F.t = 0;
}

// ---------- per frame (called from G.updatePart5 while P5.ph === 'finale') ----------
export function updateFinale(dt, rdt, P5) {
  if (!F.on) return;
  F.t += rdt; const t = F.t;
  G.otherPrompt = true; G.pickups && (G.pickups.length = 0);
  for (const a of F.actors) stepActor(a, dt);
  switch (F.ph) {
    case 'rpg': {
      const r = F.rpg;
      const step = r.v.length() * dt;
      if (r.pos.distanceTo(r.tgt) <= step + 0.2) { boom(); break; }
      r.pos.addScaledVector(r.v, dt); r.mesh.position.copy(r.pos); r.mesh.lookAt(r.tgt);
      if ((r.smoke -= dt) <= 0) { r.smoke = 0.012; G.fx.smoke(r.pos, { size: 0.5, grow: 3, life: 2.4, color: 0x6e6c68, alpha: 0.7, vy: 0.15, wind: 0.3 }); G.fx.add.spawn(r.pos.x, r.pos.y, r.pos.z, 0, 0, 0, { life: 0.08, size: 0.9, c: [1, 0.65, 0.3], alpha: 1 }); }
      if (t > 3) boom();
      break;
    }
    case 'blast': // white flash, then cut to black within 0.4 s
      ov('w', 1 - t / 0.16); ov('k', t / 0.35);
      if (t >= 0.38) {
        ov('w', 0); ov('k', 1);
        F.clearBattle();
        P.downed = { eye: 0.3, sens: 0, sway: 0.5 }; WP.hidden = true;
        HUD.show(false); HUD.setUpload(null); HUD.say(null); D.q.length = 0; D.cur = null;
        musicMode('silence');
        say('P5_GRIN_13', 0.9);
        F.ph = 'black'; F.t = 0; F.bat = 0.4;
      }
      break;
    case 'black': // 3.5 s of black: muffled battle and a heartbeat
      ov('k', 1); heart(rdt, 1.05);
      if ((F.bat -= rdt) <= 0) { F.bat = rr(0.35, 1.1); play(Math.random() < 0.25 ? 'explosion' : 'ak_far', { vol: rr(0.3, 0.6), lp: 320, rev: 0.3, noSlow: true }); }
      if (t > 3.6) { if (F.inside) { F.ph = 'black2'; F.t = 0; } else startDrag(); }
      break;
    case 'black2':
      ov('k', 1); heart(rdt, 1.05);
      if (t > 1.2 && !D.cur && !D.q.length) return G.startPart5(7, true);
      break;
    case 'drag': updateDrag(dt, rdt); break;
    case 'wake': case 'breach': case 'bullet': case 'crawl': case 'send': case 'mono': case 'end': updateRoom(dt, rdt, P5); break;
  }
}

// ---------- the drag: a few blurry glimpses while Grinch hauls the player into the ops room ----------
function startDrag() {
  F.ph = 'drag'; F.t = 0; F.seg = -1;
  const hp = F.hitPos, segs = [];
  if (hp.y > 2.5) segs.push([V(9.6, 0, 9.2), V(7.4, 0, 9.0)]);
  else if (Math.hypot(hp.x, hp.z - 7) > 6) {
    const a = V(hp.x, 0, hp.z), nx = hp.z < -4.6 ? V(Math.sign(hp.x || 1) * 10.5, 0, hp.z) : V(0, 0, 8.5);
    if (a.distanceTo(nx) < 2.4) nx.set(0, 0, 8.5);
    segs.push([a, a.clone().add(nx.sub(a).setLength(2.2))]);
  }
  segs.push([V(0.7, 0, 10.4), V(0.3, 0, 7.6)], [V(0.15, 0, 6.1), V(-0.45, 0, 2.6)]);
  F.segs = segs.map(([a, b]) => ({ a, b, dur: 2.7 }));
  const g = D.grinch; if (g) { g.custom = () => {}; const h = g.h; h.sit = null; h.noWeapon = false; h.sidearm = 1; h.invuln = true; h.crouchT = 0.65; }
  muffle(700, 0.4);
  say('P5_GRIN_14', 1.2);
  F.hb = 0.2;
}
function enterSeg(i) {
  const s = F.segs[i]; F.seg = i; F.st = 0;
  for (const a of F.actors) a.h.remove(); F.actors.length = 0;
  const back = _a.subVectors(s.a, s.b).setY(0).normalize().clone(), side = V(-back.z, 0, back.x);
  for (let k = 0; k < 3; k++) {
    const d = rr(13, 22), x = s.b.x + back.x * d + side.x * rr(-7, 7), z = s.b.z + back.z * d + side.z * rr(-7, 7);
    const a = actor('ru', x, z, { speed: rr(1.2, 2.2) });
    a.path = [V(x - back.x * 4, 0, z - back.z * 4)]; a.h.crouchT = 0.4; a.h.aimTarget = 1;
    a.aimAt = () => P.eye; a.turn = 3;
  }
  F.fireT = 0.5;
}
function updateDrag(dt, rdt) {
  const T = F.t; let acc = 0, i = 0;
  for (; i < F.segs.length; i++) { if (T < acc + F.segs[i].dur + 0.35) break; acc += F.segs[i].dur + 0.35; }
  if (i >= F.segs.length) { ov('k', 1); if (T > acc + 0.8) { const g = D.grinch; if (g) g.h.sidearm = 0; return G.startPart5(7, true); } return; }
  if (F.seg !== i) enterSeg(i);
  const s = F.segs[i], u = clamp((T - acc) / s.dur, 0, 1);
  ov('k', T - acc > s.dur ? 1 : Math.max(1 - smooth(u / 0.22), smooth((u - 0.8) / 0.2)));
  look(3.0 - Math.sin(u * Math.PI) * 1.4, 0.5); ov('v', 0.6);
  heart(rdt, 0.95);
  // three hard pulls per glimpse
  const n = 3, pu = u * n, w = (Math.floor(pu) + smooth(Math.min(1, (pu % 1) / 0.55))) / n;
  const move = _a.subVectors(s.b, s.a).setY(0), L = move.length(); move.normalize();
  P.pos.copy(s.a).addScaledVector(move, L * Math.min(1, w)); P.pos.y = floorY(P.pos.x, P.pos.z);
  P.vel.set(0, 0, 0);
  const lookYaw = yawOf(_b.copy(move).negate());
  P.yaw = lookYaw + 0.72; P.pitch = 0.27 + Math.sin(T * 1.7) * 0.04; P.lockLook = true; P.autoLook = null;
  if ((pu % 1) < 0.05) P.addShake(0.05);
  // Grinch walks backwards toward the door, left hand in the player's vest, pistol out one-handed at the yard
  const g = D.grinch;
  if (g) {
    const h = g.h, side = _c.set(-move.z, 0, move.x);
    const sp = (L / s.dur) * 1.4;
    h.pos.copy(P.pos).addScaledVector(move, -0.05).addScaledVector(side, 0.68); h.pos.y = floorY(h.pos.x, h.pos.z);
    h.vel.copy(move).multiplyScalar(sp);
    h.handL = (h.handL || V()).copy(P.pos).addScaledVector(move, 0.15).addScaledVector(side, 0.2).setY(P.pos.y + 0.45);
    let tgt = null; for (const a of F.actors) if (a.h.alive) { tgt = a; break; }
    h.aimTarget = 1;
    if (tgt) h.aim.subVectors(tgt.h.j[J.Ne], h.j[J.SR]).normalize(); else h.aim.copy(move).negate();
    h.yaw = yawOf(_b.copy(move).negate()) - 0.35;
    if ((F.fireT -= rdt) <= 0 && tgt) {
      F.fireT = rr(0.5, 0.9);
      shot(h, tgt.h.j[J.Ne].clone(), { pistol: true });
      if (Math.random() < 0.4) tgt.h.die(_b.subVectors(tgt.h.pos, h.pos).setY(0.3).normalize(), J.Ne, 6);
    }
  }
  for (const a of F.actors) {
    if (!a.h.alive) continue;
    if ((a.fireT -= rdt) <= 0) { a.fireT = rr(0.6, 1.5); shot(a.h, _a.copy(P.pos).add(_b.set(rr(-1.5, 1.5), rr(0.2, 1.6), rr(-1.5, 1.5))), { flesh: false, vol: 0.6 }); G.fx.impact(_a, _b.set(0, 1, 0), 'snow'); }
  }
}

// ---------- checkpoint 7: wake on the floor ----------
export function startWake(P5, g) {
  Object.assign(F, { on: true, ph: 'wake', t: 0, actors: F.actors && F.actors.length ? F.actors : [], hb: 0.4, rpg: null, gr: g, kras: null, sa: null, sb: null, hold: 0, reach: 0 });
  F.actors.length = 0;
  const yd = yawOf(_a.subVectors(DOOR, WAKE_POS)), yg = yawOf(_b.subVectors(GRINCH_AT, WAKE_POS));
  resetPlayer(WAKE_POS.clone(), yd + angDiff(yd, yg) * 0.68);
  P.pitch = 0.05; P.shield = true; P.noCrowd = true; P.health = 45; P.enabled = true; P.lockLook = false;
  P.downed = { eye: 0.35, sens: 0.3, sway: 1, pmin: -0.5, pmax: 0.75, yawC: P.yaw, yawR: 1.2, gun: false, vmDrop: 1 };
  WP.hidden = true; WP.clay = 0;
  setDoor(0); setUplink('wait', 99);
  HUD.show(true); HUD.root.classList.add('fin-min'); HUD.root.classList.remove('fin-aim');
  HUD.setUpload(99, true, '99% · 等待手动发送');
  HUD.objective(null); HUD.setMarker(null);
  musicMode('silence'); muffle(1800, 0.3);
  // Grinch crouched at the console, turned toward the player
  const h = g.h; g.custom = () => {};
  h.pos.copy(GRINCH_AT); h.vel.set(0, 0, 0); h.sit = null; h.slump = null; h.handL = null; h.sidearm = 0; h.noWeapon = true; h.invuln = true;
  h.crouchT = 1; h.crouch = 1; h.aimTarget = 0; h.firstPose = true;
  h.aim.subVectors(WAKE_POS, GRINCH_AT).setY(-0.2).normalize(); h.yaw = yawOf(h.aim);
  // Krasin and two soldiers wait outside the closed door
  F.sa = actor('ru', 0.3, 6.3, { yaw: 0, speed: 2.6 }); F.kras = actor('kr', -0.2, 7.4, { yaw: 0, speed: 1.5, head: 'head_kras' }); F.sb = actor('ru', 0.5, 8.4, { yaw: 0, speed: 2.3 });
  for (const a of [F.sa, F.kras, F.sb]) { a.h.hidden = true; a.h.invuln = true; }
  F.kras.h.sidearm = 1;
  ov('k', 1); ov('v', 0.7); look(4, 0.5);
  say('P5_GRIN_15', 2.4);
}

function killGrinch() {
  const h = F.gr.h;
  h.invuln = false; h.flinch = 1; h.handL = null;
  h.slump = { base: V(-6.34, 0.15, -0.95), yaw: -Math.PI / 2, side: -1, t: 0, dur: 0.45 };
  h.alive = false; h.rag = null;
  const c = h.j[J.Ne].clone();
  for (let i = 0; i < 10; i++) G.fx.alpha.spawn(c.x, c.y, c.z, rr(-2.5, -0.5), rr(0, 2), rr(-1, 1), { life: rr(0.4, 0.8), size: 0.1, grow: 3, c: [0.42, 0.04, 0.03], alpha: 0.85, grav: 6, drag: 2 });
  F.gdecal = 0.5;
}

function updateRoom(dt, rdt, P5) {
  const t = F.t, d = P.downed, K = F.kras, A1 = F.sa, B1 = F.sb, g = F.gr && F.gr.h;
  if (F.gdecal !== undefined && (F.gdecal -= rdt) <= 0) {
    F.gdecal = undefined;
    blood('splat', V(-6.3, 0.6, -0.95), V(1, 0, 0), 0.7); blood('splat', V(-6.3, 0.35, -0.8), V(1, 0, 0), 0.5); blood('pool', V(-5.95, 0.15, -0.9), 0.6);
  }
  if (F.ph === 'wake') {
    // eyes open slowly: two failed blinks, then the room
    const o = 1 - smooth(t / 3.4) + (t > 1.3 && t < 2.0 ? Math.sin((t - 1.3) / 0.7 * Math.PI) * 0.75 : 0);
    ov('k', o); look(lerp(4, 1.6, smooth(t / 5)), 0.55); ov('v', 0.72); heart(rdt, 1.1);
    if (t > 9.3 && !D.cur) { F.ph = 'breach'; F.t = 0; }
  } else if (F.ph === 'breach') {
    ov('k', 0); look(1.4, 0.6); heart(rdt, 0.85, 0.85);
    if (!F.kicked) {
      F.kicked = true; kickDoor();
      play('doorkick', { pos: DOOR, vol: 1.4, ref: 4, rev: 0.4 }); P.addShake(0.25);
      for (const a of [A1, K, B1]) a.h.hidden = false;
      A1.path = [V(0.1, 0, 4.2), V(1.2, 0, 2.5)]; A1.aimAt = () => g.j[J.Ne]; A1.h.aimTarget = 1;
      K.path = [V(0, 0, 4.2), V(-1.3, 0, -1.25)]; K.wait = 0.7; K.aimAt = () => P.eye; K.h.aimTarget = 1;
      B1.path = [V(0.1, 0, 4.2), V(-3.1, 0, 1.9)]; B1.wait = 1.3; B1.aimAt = () => g.j[J.Ne]; B1.h.aimTarget = 1;
      P.autoLook = { target: DOOR, rate: 2.2 };
      g.aim.subVectors(DOOR, g.pos).normalize(); g.crouchT = 0.85;
      if (G.bark) G.bark('RU_06', DOOR, true);
    }
    if (g.alive) { g.yaw += clamp(angDiff(g.yaw, yawOf(g.aim)), -4 * dt, 4 * dt); }
    if (t > 2.4 && t < 4.6) P.autoLook = { target: K.h.j[J.Hc], rate: 1.6 };
    if (t > 3.0 && !F.k2) { F.k2 = true; say('P5_KRAS_02', 0); }
    if (t > 4.9 && !F.draw) { F.draw = true; g.noWeapon = false; g.sidearm = 2; g.aimTarget = 1; P.autoLook = { target: g.j[J.Hc], rate: 2.4 }; }
    if (F.draw && g.alive) g.aim.subVectors(A1.h.j[J.Ne], g.j[J.Hc]).normalize();
    if (t > 5.45 && !F.gs1) { F.gs1 = true; shot(g, A1.h.j[J.Ne].clone(), { pistol: true }); }
    if (t > 5.7 && !F.gs2) { F.gs2 = true; shot(g, A1.h.j[J.Ne].clone(), { pistol: true }); A1.h.invuln = false; A1.h.die(_a.subVectors(A1.h.pos, g.pos).setY(0.2).normalize(), J.Ne, 7); }
    if (t > 5.75) { K.aimAt = () => g.j[J.Ne]; K.turn = 9; }
    if (t > 5.9 && t < 6.5 && g) { F.bt = (F.bt ?? 0) - rdt; if (F.bt <= 0) { F.bt = 0.09; shot(B1.h, _a.copy(g.j[J.Ne]).add(_b.set(rr(-0.1, 0.1), rr(-0.35, 0.05), rr(-0.1, 0.1)))); if (g.alive) g.flinch = 1; } }
    if ((t > 6.0 && !F.ks1) || (t > 6.3 && !F.ks2)) { if (!F.ks1) F.ks1 = true; else F.ks2 = true; shot(K.h, g.j[J.Ne].clone(), { pistol: true }); }
    if (t > 6.2 && g.alive) killGrinch();
    if (t > 7.1) startBullet();
  } else if (F.ph === 'bullet') {
    const real = t;
    if (F.aimHelp !== undefined && (F.aimHelp -= rdt) <= 0) { F.aimHelp = undefined; P.autoLook = null; }
    G.timeScale = lerp(1, 0.2, smooth(real / 0.35));
    if (F.fired && !P.god) G.timeScale = 1;
    d.vmDrop = 1 - smooth(real / 0.7); look(0.6, 0.75); ov('v', 0.55); heart(rdt, 0.6, 0.9);
    WP.cool = Math.min(WP.cool, 0.028);
    for (const a of [K, B1]) if (a.h.alive) { a.aimAt = () => P.eye; a.turn = 2.2; }
    const dead = !K.h.alive && !B1.h.alive;
    if (dead && F.clr === undefined) F.clr = real;
    if (dead && real - F.clr > 0.9) startCrawl();
    if (!dead && real > 7.2 && (!F.fired || real - F.fired > 1.6)) { // too slow: they shoot first
      F.fired = real;
      for (const a of [K, B1]) if (a.h.alive) shot(a.h, P.eye.clone(), { pistol: a === K, flesh: false });
      P.damage(500, K.h.pos, true);
      if (!P.alive) {
        G.timeScale = 1; HUD.setSlowmo(false); F.red = 1;
        D.timers.push({ atR: D.rt + 1.3, fn: () => D.fail && D.fail('克拉辛先开了枪。', '提示：子弹时间里手枪会自动举起，把克拉辛和剩下那名士兵都打倒（打中一两枪即可）。') });
      }
    }
    if (F.red) ov('r', F.red);
  } else if (F.ph === 'crawl' || F.ph === 'send') {
    G.timeScale = Math.min(1, G.timeScale + rdt * 1.4);
    d.vmDrop = Math.min(1, (d.vmDrop || 0) + rdt * 1.1); if (d.vmDrop >= 1) d.gun = false;
    const cyc = (t * 0.9) % 1;
    look(1.2 + Math.max(0, Math.sin(t * 0.8)) * 1.2, 0.6); ov('v', 0.72 + Math.sin(t * 1.3) * 0.05); heart(rdt, 1.0);
    if ((F.br = (F.br ?? 1.5) - rdt) <= 0 && !key('KeyW')) { F.br = 2.2; play('breath', { bus: A.master, rev: 0, vol: 0.45, noSlow: true }); }
    if (t > 1.7 && !d.crawl) {
      P.autoLook = null; d.crawl = true; d.sens = 0.35; d.pmin = -0.45; d.pmax = 0.5;
      HUD.objective('爬到控制台，发送情报'); HUD.setMarker(S.keyPos, '');
    }
    d.yawC = yawOf(_a.subVectors(S.keyPos, P.pos)); d.yawR = d.crawl ? 0.9 : 3.2;
    const dist = Math.hypot(P.pos.x - S.keyPos.x, P.pos.z - S.keyPos.z);
    let holdK = null, prompt = null;
    if (d.crawl && dist < 1.15) {
      prompt = '按住 <kbd>F</kbd> 发送';
      if (key('KeyF')) F.hold += rdt; else F.hold = Math.max(0, F.hold - rdt * 2);
      holdK = F.hold / 1.5;
      if (F.hold >= 1.5) { sent(); holdK = null; prompt = null; }
    } else F.hold = Math.max(0, F.hold - rdt * 2);
    F.reach = Math.max(F.hold / 1.5, F.reach - rdt * 1.5);
    reach(F.ph === 'crawl' || F.ph === 'send' ? F.reach : 0);
    HUD.setHold(holdK); HUD.setPrompt(prompt);
  } else if (F.ph === 'mono') {
    const sag = smooth(t / 3.5); d.sag = sag; d.sway = 1 - sag * 0.6; d.crawl = false;
    F.reach = Math.max(0, F.reach - rdt * 0.5); reach(F.reach);
    look(lerp(1.2, 3.5, sag), lerp(0.6, 0.35, sag)); ov('v', lerp(0.75, 1, sag)); heart(rdt, lerp(1.0, 1.7, sag), lerp(0.75, 0.4, sag));
    const line = (t0) => clamp(Math.min((t - t0) / 1.2, (t0 + 5 - t) / 1.0), 0, 1);
    const a1 = line(1.6), a2 = line(7.2);
    mono(t < 6.9 ? MONO[0] : MONO[1]); ov('m', t < 6.9 ? a1 : a2);
    if (t > 1.4 && !F.hudOff) { F.hudOff = true; HUD.show(false); HUD.objective(null); }
    ov('k', smooth((t - 9.5) / 3) * 0.6);
    if (t > 12.6) { // hard cut: black and near silence
      F.ph = 'end'; F.t = 0; ov('k', 1); ov('m', 0); reach(0);
      musicMode('silence'); muffle(20000, 0.05);
      if (A.genLoop) { A.genLoop.stop(); A.genLoop = null; }
      HUD.show(false); HUD.setUpload(null); HUD.say(null);
    }
  } else if (F.ph === 'end') {
    ov('k', 1);
    if (t > 4) {
      HUD.fade(1, 0, '#000'); HUD.fadeEl.style.opacity = '1';
      finaleCleanup();
      G.onEpilogueDone = G.p5FinalCard; G.playEpilogue();
    }
  }
}

function startBullet() {
  F.ph = 'bullet'; F.t = 0;
  P.autoLook = null; P.lockLook = false;
  forcePistol();
  const d = P.downed; d.gun = true; d.vmDrop = 1; d.sens = 0.55; d.yawC = P.yaw; d.yawR = 2.4; d.pmin = -0.3; d.pmax = 0.8;
  P.autoLook = { target: F.kras.h.j[J.Ne], rate: 14 }; F.aimHelp = 0.8; // swing toward Krasin; then the player has the gun
  for (const a of [F.kras, F.sb]) { a.h.invuln = false; a.h.hp = 35; }
  HUD.setSlowmo(true); HUD.root.classList.add('fin-aim');
  play('slowmo', { vol: 1, noSlow: true, rev: 0.2 });
  muffle(900, 0.15);
}
function startCrawl() {
  F.ph = 'crawl'; F.t = 0;
  HUD.setSlowmo(false); HUD.root.classList.remove('fin-aim');
  muffle(2400, 0.8);
  P.autoLook = { target: S.keyPos, rate: 1.3 };
  musicMode('p5loss');
}
function sent() {
  F.ph = 'mono'; F.t = 0;
  setUplink('done', 100); HUD.setUpload(100, false, '100% · 已发送');
  for (let i = 0; i < 3; i++) play('ui', { vol: 0.6, rev: 0, delay: i * 0.16, rate: 1 + i * 0.25 });
  HUD.objective(null); HUD.setMarker(null); HUD.setPrompt(null); HUD.setHold(null);
}

// ---------- cleanup: any checkpoint restart, level change or the epilogue ----------
export function finaleCleanup() {
  if (F.rpg) { G.scene.remove(F.rpg.mesh); F.rpg = null; }
  if (F.actors) F.actors.length = 0;
  F.on = false; F.ph = ''; F.kicked = F.k2 = F.draw = F.gs1 = F.gs2 = F.ks1 = F.ks2 = false; F.bt = F.br = F.clr = F.gdecal = undefined; F.fired = 0; F.red = 0; F.hudOff = false; F.hold = 0; F.reach = 0;
  if (UI) { for (const k of ['k', 'w', 'r', 'v', 'm']) ov(k, 0); mono(''); }
  if (ARM) ARM.g.visible = false;
  if (G.renderer) look(0, 1);
  if (HUD.root) HUD.root.classList.remove('fin-min', 'fin-aim');
  G.timeScale = 1; HUD.setSlowmo?.(false);
  P.downed = null; P.shield = false; P.noCrowd = false; P.lockLook = false; P.autoLook = null; P.enabled = true;
  G.otherPrompt = false;
}
if (typeof window !== 'undefined') window.__fin = F;
