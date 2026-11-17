// Part 4 "最后阵地" (radar-station last stand); the finale (checkpoint 7) lives in finale.js.
import { G, THREE, rr, ri, clamp, damp, lerp, pick, yawOf, angDiff, reseed } from './core.js';
import { input, hit, key } from './input.js';
import { Human, J, clearHumans } from './humans.js';
import { moveChar, los, rayBoxes, rayGround } from './physics.js';
import { TOK, requestToken, releaseToken, shootAtPlayer, shootAt, Mate } from './ai.js';
import { Hind, explodeAt, clearVehicles } from './vehicles.js';
import { clearFX } from './fx.js';
import { clearNades, throwNade, lobAt, NADES } from './grenade.js';
import { P, resetPlayer, dismount } from './player.js';
import { play, loop, musicMode, muffle, stopAllLoops, A } from './audio.js';
import { HUD } from './hud.js';
import { D, LINES, say, after, afterReal } from './director.js';
import { S, buildStation, stationColliders, setPower, updateStation, ground5, hideStation, setDoor, setUplink } from './station.js';
import { T, GUN_PIVOT } from './train.js';
import { supportAt } from './physics.js';
import { fireRocket, sledMesh } from './vehicles.js';
import { fwdYaw } from './core.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
const GUN0 = GUN_PIVOT.clone();
import { W } from './world.js';
import { INSIDE, IN_BLDG, ENTRY, route, walk, prep, Raider, visibleMate, mateCustom, goMate, placeMate } from './raider.js';
export { prep, Raider, mateCustom, goMate, placeMate };
import { assaultEvents, sendJuggernauts, JUGG_COUNT, updateAssault, clearAssault } from './assault.js';
import { startFinale, startWake, updateFinale, finaleCleanup } from './finale.js';
import { WP, giveIgla, resetWeapons, giveWeapon, WDEF } from './weapon.js';

Object.assign(LINES, {
  P5_GRIN_01: ['GRINCH', "Tell me that's the radar station. Tell me it's not another train.", '告诉我那是雷达站。别又是一列火车。'],
  P5_TRUCK_00: ['TRUCK', 'Old Soviet early-warning site. Dish on the roof looks intact.', '苏联时期的预警站。楼顶那口天线看着还完整。'],
  P5_SAND_02: ['SANDMAN', 'If it still talks, Price gets his intel. Move.', '只要它还能用，情报就能送到普莱斯手上。走。'],
  P5_TRUCK_06: ['TRUCK', "Generator's on the west wall, boss. Somebody's gotta wake it up.", '发电机在西墙外，头儿。得有人去把它弄醒。'],
  P5_TRUCK_01: ['TRUCK', 'Contacts on the ridge! They followed our tracks!', '山脊上有敌人！他们顺着脚印追来了！'],
  P5_SAND_03: ['SANDMAN', 'Grinch, get that uplink running. Truck, on the sandbags. We hold this building!', '格林奇，把上行链路弄起来。特拉克，守沙袋。守住这栋楼！'],
  P5_GRIN_02: ['GRINCH', "Uplink's live. Upload's slow — this thing's older than my dad.", '链路通了。上传很慢——这玩意儿比我爸岁数还大。'],
  P5_KRAS_01: ['克拉辛', 'Американцы. Вам некуда идти. Верните то, что взяли, — и умрёте быстро.', '美国人，你们无路可走了。把拿走的东西交出来——可以让你们死得痛快点。', true],
  P5_GRIN_03: ['GRINCH', 'Twenty-five percent!', '百分之二十五！'],
  P5_GRIN_04: ['GRINCH', "Fifty percent! Keep 'em off me!", '百分之五十！别让他们靠近我！'],
  P5_GRIN_05: ['GRINCH', 'The dish took a hit! We lost the signal!', '天线被打中了！信号断了！'],
  P5_TRUCK_07: ['TRUCK', "Sandman, roof! Somebody's gotta realign that dish!", '队长，上楼顶！得有人把天线重新对准！'],
  P5_SAND_09: ['SANDMAN', 'Dish is aligned. Try it now!', '天线对好了，再试试！'],
  P5_GRIN_06: ['GRINCH', "Signal's back! Seventy-five… come on, come on…", '信号回来了！百分之七十五……快点，快点……'],
  P5_TRUCK_02: ['TRUCK', 'Juggernauts! Three of them, coming through the gate!', '重装兵！三个，正从大门冲进来！'],
  P5_SAND_05: ['SANDMAN', 'Focus fire! One at a time — hit them with everything!', '集中火力！一个一个来——所有家伙都往他们身上招呼！'],
  P5_GRIN_07: ['GRINCH', "Last one's down! Big boys are down!", '最后一个也倒了！大块头全趴下了！'],
  P5_GRIN_07A: ['GRINCH', "One down! Keep hitting 'em!", '倒了一个！接着打！'],
  P5_TRUCK_03: ['TRUCK', "That Hind's back!", '那架雌鹿又回来了！'],
  P5_GRIN_10: ['GRINCH', 'Truck! TRUCK!', '特拉克！特拉克！'],
  P5_SAND_07: ['SANDMAN', "…He's gone. Stay on that uplink, Grinch.", '……他走了。盯住上行链路，格林奇。'],
  P5_GRIN_11: ['GRINCH', 'Igla in the armory, boss! Kill that son of a bitch!', '军械库里有针式导弹，头儿！把那狗娘养的打下来！'],
  P5_GRIN_08: ['GRINCH', "It's down! It's down!", '打下来了！打下来了！'],
  P5_GRIN_12: ['GRINCH', 'Ninety… ninety-five… almost there!', '九十……九十五……就差一点了！'],
});

const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const Q = { up: 0, rate: 0, stall: false, missiles: [], hold: 0, lockT: 0, lockBeep: 0 };
// ---------- Hind (station variant) ----------
class StationHind extends Hind {
  constructor() {
    super();
    this.pos.set(-140, 60, -260); this.vel.set(30, 0, 30);
    this.state = 'in5'; this.orbitA = -2.2; this.atkT = 6;
  }
  hurt(dmg) { if (this.crashing || !(D.p5 && D.p5.truckHit)) return false; return super.hurt(dmg); } // story: it survives until its gun run
  crash() {
    if (this.crashing) return;
    this.crashing = true; this.spin = 0; this.vel.multiplyScalar(0.5);
    play('explosion', { pos: this.pos, vol: 1.8, ref: 60, roll: 0.5, rev: 0.6, prio: true });
    G.fx.explosion(this.pos.clone(), 2.2, {});
    if (G.p5HindDown) G.p5HindDown();
  }
  update(dt) {
    if (!this.visible) return;
    if (this.crashing) return this.crashUpdate(dt);
    if (this.state === 'side') this.state = 'orbit';
    this.stT += dt;
    switch (this.state) {
      case 'in5':
        this.wp.set(-30, 34, -95); this.faceTarget.set(0, 2, 0);
        if (this.pos.distanceTo(this.wp) < 25) { this.state = 'orbit'; this.stT = 0; }
        break;
      case 'orbit': {
        this.orbitA += dt * 0.11;
        const R = 78;
        this.wp.set(Math.sin(this.orbitA) * R, 30 + Math.sin(this.t * 0.6) * 4, -18 - Math.cos(this.orbitA) * R * 0.75);
        this.faceTarget.copy(P.pos);
        this.atkT -= dt;
        if (this.atkT <= 0 && this.pos.distanceTo(P.pos) < 130) {
          if (Math.random() < 0.5) { this.state = 'rockets'; this.stT = 0; this.rk = 0; }
          else { this.state = 'gun'; this.stT = 0; this.gunN = 16; }
          this.atkT = rr(5, 8);
        }
        break;
      }
      case 'strafe5': { // gun run along the sandbag line (Truck's position)
        const u = this.stT / 5;
        this.wp.set(lerp(-60, 60, u), 22, -40);
        this.faceTarget.set(4, 0, -6.5);
        this.gunT -= dt;
        const sweep = lerp(-9, 11, (u - 0.2) / 0.65); // the rounds walk along the sandbag line toward Truck
        if (this.gunT <= 0 && u > 0.2 && u < 0.85) {
          this.gunT = 0.06;
          const tgt = _t.set(sweep + rr(-1.2, 1.2), rr(0, 1.2), rr(-8, -5.6));
          this.nose(_e);
          G.fx.tracer(_e, tgt, { width: 0.05, speed: 500, len: 5 });
          G.fx.impact(tgt, _d.set(0, 1, 0), 'soft');
          if (Math.random() < 0.3) play('dshk_far', { pos: _e, vol: 1.0, ref: 25, rev: 0.4 });
        }
        if (sweep > 4.7 && !this.hitTruck) { this.hitTruck = true; if (G.p5TruckHit) G.p5TruckHit(); }
        if (u >= 1) { this.state = 'orbit'; this.atkT = 6; }
        break;
      }
    }
    super.update(dt);
  }
  crashUpdate(dt) {
    this.t += dt;
    this.spin = Math.min(4.5, this.spin + dt * 2.5);
    this.yaw += this.spin * dt;
    this.vel.y -= 9 * dt; this.vel.x *= 1 - dt * 0.3; this.vel.z *= 1 - dt * 0.3;
    this.pos.addScaledVector(this.vel, dt);
    this.roll = damp(this.roll, 0.6, 1.5, dt); this.pitch = damp(this.pitch, 0.25, 1.5, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.group.updateMatrixWorld(true);
    this.group.userData.rotor.rotation.y += dt * 18;
    this.snd.setPos(this.pos);
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.03;
      _e.set(0.5, 1.2, 1.6).applyMatrix4(this.group.matrixWorld);
      G.fx.smoke(_e, { size: 1.3, grow: 5, life: 4, color: 0x121110, alpha: 0.7, vy: 0, wind: 1 });
      G.fx.add.spawn(_e.x, _e.y, _e.z, rr(-1, 1), rr(0, 2), rr(-1, 1), { life: 0.35, size: 1.4, c: [1, 0.5, 0.15], alpha: 1, wind: 1 });
    }
    const gy = ground5(this.pos.x, this.pos.z);
    if (this.pos.y < gy + 1.5) {
      this.pos.y = gy + 1;
      explodeAt(this.pos.clone(), 3.2, 14, 90);
      for (let i = 0; i < 3; i++) setTimeout(() => G.fx.explosion(this.pos.clone().add(_o.set(rr(-4, 4), rr(0, 3), rr(-4, 4))), 1.6, {}), 250 + i * 300);
      play('crash', { pos: this.pos, vol: 1.8, ref: 50, roll: 0.5, rev: 0.6 });
      // burning wreck: lingering fire + smoke
      Q.wreck = { pos: this.pos.clone(), t: 0 };
      this.remove();
    }
  }
}

// ---------- missiles (Igla + scripted RPG) ----------
const MSL_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8).rotateX(Math.PI / 2);
const MSL_MAT = new THREE.MeshStandardMaterial({ color: 0x5a6150, roughness: 0.6, metalness: 0.4 });
function launchMissile(from, dir, o) {
  const m = new THREE.Mesh(MSL_GEO, MSL_MAT); m.position.copy(from); G.scene.add(m);
  const r = { pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(o.speed0 || 25), t: 0, smokeT: 0, mesh: m, ...o };
  Q.missiles.push(r);
  return r;
}
function updateMissiles(dt) {
  for (let i = Q.missiles.length - 1; i >= 0; i--) {
    const r = Q.missiles[i];
    r.t += dt;
    const sp = Math.min(r.speed || 110, r.vel.length() + dt * 140);
    let tgt = null;
    if (r.hind && r.hind.visible && !r.hind.crashing) tgt = r.hind.pos;
    else if (r.point) tgt = r.point;
    if (tgt && r.t > 0.15) {
      _d.subVectors(tgt, r.pos).normalize();
      r.vel.normalize().lerp(_d, Math.min(1, dt * (r.turn || 2.6))).normalize();
    } else r.vel.normalize();
    r.vel.multiplyScalar(sp);
    const step = sp * dt;
    _d.copy(r.vel).normalize();
    let boom = false, hitHind = false;
    if (r.hind && r.hind.visible && !r.hind.crashing && r.pos.distanceTo(r.hind.pos) < 5.5) { boom = true; hitHind = true; }
    else if (r.point && r.pos.distanceTo(r.point) < 1.2) boom = true;
    else if (r.t > 0.2) {
      const hb = rayBoxes(r.pos, _d, step, true), hg = rayGround(r.pos, _d, step);
      if (hb || hg) { boom = true; r.pos.addScaledVector(_d, (hb && (!hg || hb.t < hg.t) ? hb : hg).t); }
    }
    if (boom || r.t > 9) {
      if (boom) explodeAt(r.pos.clone(), hitHind ? 2.4 : 1.6, hitHind ? 4 : 7, hitHind ? 0 : (r.dmg ?? 60));
      if (hitHind) r.hind.crash();
      if (r.onBoom) r.onBoom(boom);
      G.scene.remove(r.mesh); Q.missiles.splice(i, 1); continue;
    }
    r.pos.addScaledVector(r.vel, dt);
    r.mesh.position.copy(r.pos); r.mesh.lookAt(_e.copy(r.pos).add(r.vel));
    r.smokeT -= dt;
    if (r.smokeT <= 0) {
      r.smokeT = 0.018;
      G.fx.smoke(r.pos, { size: 0.45, grow: 3.5, life: 2.4, color: 0xd6d6d4, alpha: 0.5, vy: 0.2, wind: 0.4 });
      G.fx.add.spawn(r.pos.x, r.pos.y, r.pos.z, 0, 0, 0, { life: 0.06, size: 0.5, c: [1, 0.7, 0.35], alpha: 1 });
    }
  }
}

// ---------- mates ----------

const POSTS = {
  GRINCH: { pts: [[-1.5, 30], [-0.6, 22], [-0.3, 8], [0, 4], [-0.6, 0.5], [-5.7, -2.2]], yaw: Math.PI / 2 },
  TRUCK: { pts: [[1.2, 30], [1, 22], [11, 12], [11.2, -5.9], [5.1, -6.3]], yaw: 0 },
};

function makeMates5() {
  const t = new Mate('TRUCK', 'head_truck', [0, 0]);
  const g = new Mate('GRINCH', 'head_grinch', [0, 0]);
  for (const m of [t, g]) { prep(m.h); m.custom = mateCustom(m); m.p5 = 'idle'; m.cs = 'crouch'; m.ct = rr(0.5, 2); }
  D.truck = t; D.grinch = g; D.sand = null;
  return [t, g];
}
// Truck's death: the Hind's gun run throws him back against the north wall behind his post; a posed corpse, not a ragdoll
export const TRUCK_WALL = new THREE.Vector3(6.3, 0, -5.13);
export function blood(kind, pos, a, b) { // b's decals when present (guarded)
  if (kind === 'pool') G.fx.bloodPool?.(pos, a); else G.fx.bloodSplat?.(pos, a, b);
}
function killTruck(tr, instant) {
  const h = tr.h;
  tr.custom = () => {}; tr.p5 = 'dead';
  h.invuln = false; h.noWeapon = false; h.sit = null; h.vel.set(0, 0, 0); h.flinch = 1;
  h.slump = { base: TRUCK_WALL.clone(), yaw: 0, side: 1, t: instant ? 9 : 0, dur: 0.38 };
  if (instant) h.pos.set(6.3, 0, -5.4);
  h.alive = false; h.rag = null; h.deadT = 0;
  const decals = () => {
    blood('splat', new THREE.Vector3(6.3, 0.8, -5.0), new THREE.Vector3(0, 0, -1), 0.75);
    blood('splat', new THREE.Vector3(6.32, 0.45, -5.0), new THREE.Vector3(0, 0, -1), 0.6);
    blood('pool', new THREE.Vector3(6.3, 0, -5.45), 0.65);
  };
  if (instant) { decals(); return; }
  const c = h.j[J.Ne].clone();
  for (let i = 0; i < 4; i++) G.fx.impact(c.clone().add(_o.set(rr(-0.15, 0.15), rr(-0.3, 0.1), rr(-0.1, 0.1))), _d.set(rr(-0.4, 0.4), 0.3, 1).normalize(), 'flesh');
  for (let i = 0; i < 14; i++) G.fx.alpha.spawn(c.x, c.y, c.z, rr(-1.5, 1.5), rr(0, 2.5), rr(0.5, 3), { life: rr(0.4, 0.8), size: 0.1, grow: 3, c: [0.42, 0.04, 0.03], alpha: 0.85, grav: 6, drag: 2 });
  play('flesh', { pos: c, vol: 1.0, ref: 4 }); play('thud', { pos: TRUCK_WALL, vol: 0.9, ref: 4 });
  after(0.4, decals);
}

function toPost(m, instant) {
  const p = POSTS[m.name];
  m.yaw0 = p.yaw;
  const next = m.name === 'GRINCH' ? 'console' : 'defend';
  if (instant) { const [x, z] = p.pts[p.pts.length - 1]; placeMate(m, x, z, m.name === 'TRUCK' ? 0 : 0.15); m.h.yaw = p.yaw; m.p5 = next; m.h.firstPose = true; }
  else goMate(m, p.pts, next);
}

// ---------- level control ----------
export function clear5() {
  clearHumans(); clearVehicles(); clearFX(); clearNades();
  for (const r of Q.missiles) G.scene.remove(r.mesh);
  Q.missiles.length = 0; Q.wreck = null;
  clearAssault(); finaleCleanup(); hideHint5();
  setDoor(1.62); setUplink(S.powered ? 'up' : 'off', 0);
  for (const c of CLAY) G.scene.remove(c.mesh); CLAY.length = 0;
  if (P.mounted) { P.mounted = false; WP.hidden = false; if (T.dshk) T.dshk.gloves.visible = false; }
  G.enemies.length = 0; G.mates.length = 0; TOK.n = 0;
  G.boxes.length = 0; G.rockets && (G.rockets.length = 0);
  D.q.length = 0; D.cur = null; D.timers.length = 0; D.f = {}; D.slow = null;
  G.timeScale = 1; HUD.setSlowmo(false); HUD.say(null); HUD.setPrompt(null); HUD.setMarker(null); HUD.setUpload(null); HUD.setHold(null); HUD.setLock(null); HUD.hideBig();
  muffle(20000, 0.05);
  if (A.genLoop) { A.genLoop.stop(); A.genLoop = null; }
}

function enterLevel5() {
  G.lvl = 5; G.groundFn = ground5;
  G.v = 0; G.vTarget = 0; G.s = 0;
  for (const c of T.cars) c.group.visible = false;
  if (T.wheels) T.wheels.visible = false;
  buildStation();
  if (T.dshk) { GUN_PIVOT.copy(S.mgPivot); T.dshk.yaw.position.copy(GUN_PIVOT); T.dshk.yaw.rotation.y = 0; T.dshk.pitch.rotation.x = 0; T.dshk.yaw.visible = true; }
  G.mg5 = true;
  stationColliders();
  W.fogTarget = W.fogDensity = 0.0125;
  if (A.trainLoop) A.trainLoop.setVol(0);
}
G.leavePart5 = () => {
  if (G.lvl !== 5) return;
  hideStation(); clear5();
  if (T.wheels) T.wheels.visible = true;
  if (T.dshk) { GUN_PIVOT.copy(GUN0); T.dshk.yaw.position.copy(GUN0); T.dshk.yaw.visible = true; }
  G.mg5 = false; WP.clay = 0;
  for (const c of CLAY) G.scene.remove(c.mesh); CLAY.length = 0;
  setPower(false);
};

G.startPart5 = (k, cont) => {
  reseed(5000 + k);
  if (G.leaveCave) G.leaveCave();
  G.levelUpdate = G.updatePart5;
  if (G.lvl !== 5) enterLevel5();
  clear5();
  stationColliders();
  D.ck = k; D.t = 0; D.rt = 0; D.phase = 'p5';
  G.state = 'play'; G.paused = false;
  const P5 = (D.p5 = { ph: '', up: 0, wave: 0, spawnT: 0, kills: 0 });
  WP.clay = 0;
  const [t, g] = makeMates5();
  resetWeapons();
  Q.lockT = 0; Q.hold = 0;
  if (T.dshk) { T.dshk.yaw.rotation.y = 0; T.dshk.pitch.rotation.x = 0; }
  WP.heat = 0; WP.overheated = false;
  if (!G.stats || !cont && k === 4) G.stats = { shots: 0, hits: 0, kills: 0, deaths: G.stats ? G.stats.deaths || 0 : 0, t0: G.real };
  if (k === 4) {
    setPower(false); S.dish.off = 0;
    resetPlayer(new THREE.Vector3(-3, ground5(-3, 44), 44), 0);
    P.crouched = true; P.pitch = -0.25;
    placeMate(t, -4.6, 42.2); placeMate(g, -1.8, 45.8);
    for (const m of [t, g]) m.h.yaw = 0;
    P5.ph = 'approach';
    HUD.fade(1, 0); setTimeout(() => HUD.fade(0, 3), 50);
    after(1.2, () => HUD.locCard(['最后阵地', '西伯利亚 · 废弃预警雷达站 · 07:40', '“睡魔” 军士长 · 三角洲部队 · Metal 0-1', '“弃于寒冬” · 第四部分']));
    musicMode('p5calm');
    say('P5_GRIN_01', cont ? 1.5 : 2.5); say('P5_TRUCK_00', 0.5); say('P5_SAND_02', 0.5);
    after(5.5, () => { for (const m of [t, g]) toPost(m); });
    after(3.0, () => { HUD.objective('前往雷达站'); HUD.setMarker(new THREE.Vector3(0, 1.4, 5.3), ''); });
  } else if (k === 7) { // finale: wounded on the ops-room floor (finale.js)
    setPower(true); S.dish.off = 0;
    for (const m of [t, g]) toPost(m, true);
    killTruck(t, true);
    P5.ph = 'finale'; P5.up = 99; P5.hindDown = true; P5.truckDead = true;
    D.ck = 7; G.saveCk?.(7);
    A.genLoop = loop('train', { pos: S.genPos.clone().setY(1), vol: 0.22, ref: 4, rate: 0.55 });
    startWake(P5, g);
  } else {
    setPower(true); S.dish.off = 0;
    for (const m of [t, g]) toPost(m, true);
    resetPlayer(new THREE.Vector3(-2.5, 0.15, -2.5), 0);
    WP.clay = 3; P.canMount = true;
    P5.ph = 'defend';
    HUD.fade(1, 0); setTimeout(() => HUD.fade(0, 1.2), 50);
    if (k === 5) {
      P5.up = 55; P5.wave = 4; P5.rate = 0.55; P5.dishDone = true; P5.dishHit = true; P5.krasDone = true; P5.l25 = P5.l50 = true;
      HUD.objective('守住雷达站，直到情报上传完毕');
      musicMode('p5defend');
      spawnWave(5);
    } else { // k === 6: Truck is gone; get the Igla
      P5.up = 92; P5.wave = 9; P5.rate = 0.35; P5.dishDone = true; P5.dishHit = true; P5.krasDone = true; P5.l25 = P5.l50 = true; P5.juggSpawned = P5.juggDone = true; P5.hindIn = P5.truckHit = P5.t5 = P5.truckDead = true;
      killTruck(t, true);
      new StationHind(); G.hind.pos.set(-60, 35, -80);
      enterIgla(true);
    }
    A.genLoop = loop('train', { pos: S.genPos.clone().setY(1), vol: 0.22, ref: 4, rate: 0.55 });
  }
  if (k !== 7) HUD.show(true);
};

// on-screen hint card (own DOM node inside #ui; hud.js belongs to the lead)
let hintEl = null;
function hint5(html, dur = 10) {
  if (typeof document === 'undefined') return;
  if (!hintEl) {
    const st = document.createElement('style');
    st.textContent = '#p5hint{left:50%;top:23%;transform:translate(-50%,-8px);max-width:min(560px,80vw);padding:8px 16px 9px;background:rgba(10,12,14,.62);border-left:3px solid #ffc54a;color:#ebe7dc;font-size:13px;line-height:1.65;letter-spacing:.05em;opacity:0;transition:opacity .4s,transform .4s;text-shadow:0 1px 2px #000}#p5hint.on{opacity:1;transform:translate(-50%,0)}#p5hint b{color:#ffc54a;margin-right:.6em;letter-spacing:.2em}#p5hint kbd{font:inherit;padding:0 5px;border:1px solid rgba(255,255,255,.4);border-radius:3px}';
    document.head.appendChild(st);
    hintEl = document.createElement('div'); hintEl.id = 'p5hint'; (document.getElementById('ui') || document.body).appendChild(hintEl);
  }
  hintEl.innerHTML = html; hintEl.classList.add('on');
  const me = (hintEl._n = (hintEl._n || 0) + 1);
  after(dur, () => { if (hintEl && hintEl._n === me) hintEl.classList.remove('on'); });
}
const hideHint5 = () => { if (hintEl) hintEl.classList.remove('on'); };

function startDefend() {
  const P5 = D.p5;
  after(6.5, () => { if (D.p5 && D.p5.ph === 'defend') hint5('<b>补给</b>楼内南墙武器架：PKM、SVD、霰弹枪、RPG，旁边是弹药箱（按 <kbd>F</kbd> 拿取）。<br>楼顶北侧有一挺 DShK 重机枪，走东侧外楼梯上去。', 11); }); // after the claymore tip
  P5.ph = 'defend'; P5.up = 0; P5.rate = 0.5;
  WP.clay = 3; P.canMount = true;
  HUD.objective('守住雷达站，直到情报上传完毕');
  HUD.setMarker(null);
  musicMode('p5defend');
  spawnWave(1);
}

const aliveEnemies = () => { let n = 0; for (const e of G.enemies) if (e.h.alive) n++; return n; };
export const CAP5 = 16; // never more than this many enemies alive (assault.js holds vehicles back at the same cap)
G.p5EnemyLimit = () => CAP5;
// target head-count: busy from the first minute, rising with the upload; lighter while the Hind is the main threat
function pressureTarget(P5) {
  if (P5.ph === 'hind' || P5.ph === 'igla') return P5.hindDown ? 0 : 8;
  if (P5.ph === 'dish') return 11;
  return P5.up < 25 ? 10 : P5.up < 50 ? 11 : P5.up < 70 ? 12 : 13;
}
const REFILL = [() => ({ x: rr(-40, 40), z: rr(-112, -96) }), () => ({ x: rr(-78, -64), z: rr(-62, -48) }), () => ({ x: rr(64, 78), z: rr(-56, -40) })];
function pressure(dt, P5) {
  if ((P5.refT = (P5.refT ?? 6) - dt) > 0) return; // first refill a few seconds into the defence
  const n = aliveEnemies(), tgt = pressureTarget(P5);
  if (n >= tgt || n >= CAP5) { P5.refT = 0.8; return; }
  const p = REFILL[(P5.refN = (P5.refN || 0) + 1) % 3]();
  const rpg = P5.refN % 6 === 0;
  new Raider(p.x, p.z, { maxTier: rpg ? 1 : 2, rpg });
  P5.refT = n < tgt - 4 ? 0.6 : 1.4; // far below target: refill fast
}
// wave n -> list of raiders; spawn points on the northern ridge and flanks
const SPAWN_N = () => ({ x: rr(-40, 40), z: rr(-112, -96) });
const SPAWN_NW = () => ({ x: rr(-78, -64), z: rr(-62, -48) });
const SPAWN_NE = () => ({ x: rr(64, 78), z: rr(-56, -40) });
function spawnWave(n) {
  const P5 = D.p5;
  const plan = {
    1: [[SPAWN_N, 8, 1]],
    2: [[SPAWN_N, 5, 2], [SPAWN_NW, 4, 2]],
    3: [[SPAWN_N, 4, 2], [SPAWN_NE, 4, 2]],
    4: [[SPAWN_N, 5, 2], [SPAWN_NE, 2, 2]],
    5: [[SPAWN_N, 4, 2], [SPAWN_NW, 3, 2]],
    6: [[SPAWN_NE, 3, 2], [SPAWN_N, 3, 2]],
    7: [[SPAWN_N, 3, 2], [SPAWN_NW, 1, 2]],
  }[n] || [[SPAWN_N, 3, 2]];
  let k = 0;
  for (const [fn, cnt, tier] of plan) for (let i = 0; i < cnt; i++) {
    const p = fn();
    const rpg = i === 0 && fn === plan[0][0] && n >= 2;
    after(k * 0.5, () => { if (G.lvl === 5 && aliveEnemies() < CAP5) new Raider(p.x, p.z, { maxTier: rpg ? 1 : tier, rpg }); });
    k++;
  }
  P5.lastWaveT = D.t;
}


// scripted RPG hit on the dish (fired by an RPG raider, or forced at 55%)
G.p5Rpg = (r) => {
  const P5 = D.p5;
  if (G.lvl === 5 && P5 && P5.up >= 55 && !P5.dishHit) { fireAtDish(r.h.j[J.W1].clone()); return true; }
  // otherwise: rocket at the player when visible (global cooldown)
  const d = r.h.pos.distanceTo(P.pos);
  if (!r.seen || d < 15 || d > 85 || G.t - (Q.lastRpg ?? -99) < 9) return false;
  Q.lastRpg = G.t;
  const from = r.h.j[J.W1].clone().setY(r.h.j[J.W1].y + 0.1);
  const tgt = _t.copy(P.chest).add(_o.set(rr(-2.5, 2.5), rr(-0.8, 1.5), rr(-2.5, 2.5)));
  fireRocket(from, _d.subVectors(tgt, from).normalize(), { speed: 48 });
  if (G.bark) G.bark('RU_01', r.h.pos, true);
  return true;
};
function fireAtDish(from) {
  const P5 = D.p5; P5.dishHit = true;
  const tgt = new THREE.Vector3(-3.5, 5.6, -0.5);
  play('rocket', { pos: from, vol: 1.2, ref: 25, roll: 0.6, rev: 0.4 });
  launchMissile(from, _d.subVectors(tgt, from).normalize(), { point: tgt, speed: 70, speed0: 40, turn: 6, dmg: 20,
    onBoom: () => {
      S.dish.off = 0.95; P5.stall = true; P5.ph = 'dish';
      for (let i = 0; i < 24; i++) G.fx.add.spawn(tgt.x, tgt.y, tgt.z, rr(-6, 6), rr(1, 7), rr(-6, 6), { life: rr(0.3, 0.8), size: 0.06, c: [1, 0.75, 0.35], grav: 12, drag: 0.5 });
      say('P5_GRIN_05', 0.4); say('P5_TRUCK_07', 0.4);
      after(1.5, () => { HUD.objective('上楼顶校正卫星天线'); HUD.setMarker(S.panelPos.clone().setY(S.panelPos.y + 1.2), ''); });
      if (G.bark) G.bark('RU_07', from, true);
    } });
}

function enterIgla(fromCk) {
  const P5 = D.p5;
  P5.ph = 'igla';
  after(fromCk ? 0.5 : 1.0, () => { HUD.objective('去军械库拿针式导弹'); HUD.setMarker(S.iglaPos.clone().setY(1.6), ''); });
  if (fromCk) { musicMode('p5final'); HUD.objective('去军械库拿针式导弹'); HUD.setMarker(S.iglaPos.clone().setY(1.6), ''); D.ck = 6; }
}

// three Juggernauts walk in (assault.js); the beat ends when all of them are down
G.p5JuggDown = () => {
  const P5 = D.p5; if (!P5 || P5.juggDone) return;
  P5.juggKills = (P5.juggKills || 0) + 1;
  if (P5.juggKills < JUGG_COUNT) { say('P5_GRIN_07A', 0.4); HUD.toast(`重装兵倒下了——还剩 ${JUGG_COUNT - P5.juggKills} 个`); HUD.objective(`击倒重装兵（还剩 ${JUGG_COUNT - P5.juggKills} 个）`); return; }
  P5.juggDone = true; say('P5_GRIN_07', 0.6);
  after(3, () => { if (P5.ph === 'defend') musicMode('p5defend'); });
};
G.p5JuggNear = () => { const P5 = D.p5; if (P5 && !P5.juggDone) { say('P5_TRUCK_02', 0.2); say('P5_SAND_05', 0.2); } };

G.p5TruckHit = () => {
  const P5 = D.p5, tr = D.truck;
  if (!tr || !P5 || P5.truckHit) return;
  P5.truckHit = P5.truckDead = true;
  killTruck(tr, false);
  musicMode('p5loss');
  say('P5_GRIN_10', 0.5); say('P5_SAND_07', 0.8); say('P5_GRIN_11', 0.5);
  after(7, () => { if (P5.ph === 'hind') { enterIgla(false); D.ck = 6; G.saveCk?.(6); } });
  after(14, () => { if (P5.ph === 'igla' && !P5.hindDown) musicMode('p5final'); });
};

G.p5HindDown = () => {
  const P5 = D.p5;
  P5.hindDown = true;
  say('P5_GRIN_08', 1.2);
  musicMode('p5final');
  HUD.setLock(null);
  after(2, () => { P5.rate = 1.1; HUD.objective('守住雷达站，等待上传完成'); HUD.setMarker(null); });
};

G.onLaunch = (from, dir) => {
  const P5 = D.p5;
  const locked = Q.lockT >= 1.6 && G.hind && G.hind.visible && !G.hind.crashing;
  launchMissile(from, dir, { hind: locked ? G.hind : null, speed: 120, speed0: 30, turn: 2.8, dmg: 80 });
  Q.lockT = 0;
  if (P5 && !locked && !P5.dumbTip) { P5.dumbTip = true; after(1.5, () => HUD.setPrompt('先按住右键瞄准直升机，等方框变红再发射')); after(5, () => HUD.setPrompt(null)); }
};

// ---------- claymores ----------
const CLAY = [];
let clayProto = null;
function clayMesh() {
  if (!clayProto) {
    const g = new THREE.Group(), b = new Builder();
    b.boxC(0, 0.16, 0, 0.23, 0.13, 0.05, 'paint', 0x4b5a3a, 0, 0, 0, 0.012);
    b.boxC(0, 0.235, 0.005, 0.05, 0.02, 0.03, 'gun', 0xffffff);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 0.08, 0.05, sz * 0.02, 0.006, 0.006, 0.12, 'gun', 0xffffff, sz * 0.4, 0, sx * 0.3, 5);
    b.build(M, g, { cast: true });
    const lm = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.45, depthWrite: false });
    for (const a of [-0.32, 0.32]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 2.6), lm); l.position.set(Math.sin(a) * 1.3, 0.2, -Math.cos(a) * 1.3); l.rotation.y = -a; g.add(l); }
    clayProto = g;
  }
  return clayProto.clone();
}
function placeClaymore() {
  if (!(WP.clay > 0) || P.mounted || !P.grounded) return;
  const f = fwdYaw(P.yaw);
  const x = P.pos.x + f.x * 0.8, z = P.pos.z + f.z * 0.8;
  const y = supportAt(x, z, 0.05, P.pos.y + 0.4, 0.8).y;
  if (Math.abs(y - P.pos.y) > 0.5) { HUD.toast('这里放不了阔剑'); return; }
  const mesh = clayMesh(); mesh.position.set(x, y, z); mesh.rotation.y = P.yaw; G.scene.add(mesh);
  CLAY.push({ pos: new THREE.Vector3(x, y, z), dir: f.clone(), mesh, arm: 1.2, trig: -1 });
  WP.clay--; play('pin', { vol: 0.5, rev: 0 }); HUD.toast(`阔剑地雷已布设 · 剩余 ${WP.clay}`);
}
function updateClaymores(dt) {
  for (let i = CLAY.length - 1; i >= 0; i--) {
    const c = CLAY[i];
    if ((c.arm -= dt) > 0) continue;
    if (c.trig < 0) {
      for (const e of G.enemies) {
        if (!e.h.alive) continue;
        _e.subVectors(e.h.pos, c.pos); _e.y = 0;
        const d = _e.length();
        if (d < 3.4 && d > 0.05 && _e.dot(c.dir) / d > 0.25 && Math.abs(e.h.pos.y - c.pos.y) < 1.5) { c.trig = 0.22; play('lock', { pos: c.pos, vol: 0.8, ref: 4, rate: 1.6 }); break; }
      }
    } else if ((c.trig -= dt) <= 0) {
      G.scene.remove(c.mesh); CLAY.splice(i, 1);
      explodeAt(_d.copy(c.pos).addScaledVector(c.dir, 0.6).setY(c.pos.y + 0.5), 1.3, 7.5, 70);
    }
  }
}

// ---------- per-frame ----------
G.updatePart5 = (dt, rdt) => {
  const P5 = D.p5; if (!P5) return;
  updateStation(dt);
  updateMissiles(dt);
  updateClaymores(dt);
  updateAssault(dt, P5);
  if (Q.wreck) {
    Q.wreck.t += dt;
    if (Math.random() < 0.5) G.fx.smoke(Q.wreck.pos, { size: 2, grow: 5, life: 5, color: 0x1a1918, alpha: 0.55, vy: 2.5, wind: 1 });
    if (Math.random() < 0.6) G.fx.add.spawn(Q.wreck.pos.x + rr(-1.5, 1.5), Q.wreck.pos.y + rr(0, 1), Q.wreck.pos.z + rr(-1.5, 1.5), 0, rr(1, 3), 0, { life: 0.4, size: 1.2, c: [1, 0.5, 0.15], alpha: 1 });
  }
  if (P5.ph === 'finale') return updateFinale(dt, rdt, P5);
  let prompt = null, holdK = null;
  const near = (p, r) => p && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < r && Math.abs(P.pos.y - p.y) < 1.6;
  const holdF = (sec) => {
    if (key('KeyF')) Q.hold += dt; else Q.hold = 0;
    holdK = Q.hold / sec;
    if (Q.hold >= sec) { Q.hold = 0; return true; }
    return false;
  };
  // ---- phases
  if (P5.ph === 'approach') {
    if (IN_BLDG(P.pos.x, P.pos.z) || Math.hypot(P.pos.x, P.pos.z - 5) < 4 || D.t > 40) {
      P5.ph = 'gen';
      say('P5_TRUCK_06', 0.3);
      after(1.0, () => { HUD.objective('启动发电机'); HUD.setMarker(S.genPos.clone().setY(1.5), ''); });
    }
  } else if (P5.ph === 'gen') {
    if (near(S.genPos, 1.9)) {
      prompt = '按住 <kbd>F</kbd> 启动发电机';
      if (holdF(1.4)) {
        P5.ph = 'power';
        play('clack', { pos: S.genPos, vol: 1.2, ref: 4 });
        A.genLoop = loop('train', { pos: S.genPos.clone().setY(1), vol: 0.22, ref: 4, rate: 0.55 });
        after(0.8, () => setPower(true));
        HUD.objective(null); HUD.setMarker(null);
        say('P5_TRUCK_01', 2.5); say('P5_SAND_03', 0.2); say('P5_GRIN_02', 0.3);
        after(3.0, () => spawnWave(1));
        after(9.0, startDefend);
      }
    } else Q.hold = 0;
  } else if (P5.ph === 'defend' || P5.ph === 'dish' || P5.ph === 'hind' || P5.ph === 'igla') {
    // upload progress
    if (!P5.stall) {
      const cap = P5.hindDown ? 99 : P5.juggDone || P5.ph !== 'defend' ? 95 : 70;
      P5.up = Math.min(cap, P5.up + P5.rate * dt);
    }
    HUD.setUpload(P5.up, P5.stall);
    setUplink('up', P5.up);
    // milestone lines + waves
    if (!P5.krasDone && P5.up > 10) { P5.krasDone = true; say('P5_KRAS_01', 0.5); }
    if (!P5.l25 && P5.up >= 25) { P5.l25 = true; say('P5_GRIN_03'); }
    if (!P5.l50 && P5.up >= 50) { P5.l50 = true; say('P5_GRIN_04'); }
    if (P5.wave === 1 && P5.up >= 16) { P5.wave = 2; spawnWave(2); }
    assaultEvents(P5); // scripted vehicle arrivals live in assault.js
    if (P5.wave === 2 && P5.up >= 36) { P5.wave = 3; spawnWave(3); }
    // the dish gets hit at 55% (an RPG raider does it; force it if none is in position)
    if (!P5.dishHit && P5.up >= 55) {
      P5.stall = true;
      P5.dishWait = (P5.dishWait || 0) + dt;
      if (P5.dishWait > 2.5) fireAtDish(new THREE.Vector3(rr(-12, 12), ground5(0, -60) + 2, -60));
    }
    if (P5.ph === 'dish') {
      if (P5.wave < 4) { P5.wave = 4; spawnWave(4); }
      if (near(S.panelPos, 1.5)) {
        prompt = '按住 <kbd>F</kbd> 校正天线';
        if (holdF(2.0)) {
          P5.ph = 'defend'; P5.stall = false; P5.dishDone = true; P5.rate = 0.55; S.dish.off = 0;
          play('ui', { vol: 0.6, rev: 0 });
          say('P5_SAND_09', 0.1); say('P5_GRIN_06', 0.4);
          HUD.objective('守住雷达站，直到情报上传完毕'); HUD.setMarker(null);
          D.ck = 5; if (G.saveCk) G.saveCk(5); HUD.locCard(['检查点', '天线已校正']);
          P5.up = Math.max(P5.up, 56);
        }
      } else Q.hold = 0;
    }
    // juggernaut at 70%
    if (P5.dishDone && !P5.juggSpawned && P5.up >= 69.5) {
      P5.juggSpawned = true; P5.rate = 0.35; P5.juggKills = 0;
      sendJuggernauts(); // three, on foot from the north; Truck calls them when the first reaches the gate (G.p5JuggNear)
      if (G.bark) after(1.0, () => G.bark('RU_08', new THREE.Vector3(0, 1, -40), true));
      musicMode('p5jugg');
      HUD.objective('击倒三名重装兵');
      after(8, () => { if (!P5.juggDone && !P5.juggKills) HUD.objective('击倒三名重装兵（打头部，或用手雷、RPG）'); });
    }
    if (P5.juggDone && !P5.hindIn && P5.up >= 80) {
      P5.hindIn = true; P5.ph = 'hind';
      HUD.objective('守住雷达站');
      new StationHind();
      say('P5_TRUCK_03', 4.0);
      after(14, () => { if (G.hind && !G.hind.crashing) { G.hind.state = 'strafe5'; G.hind.stT = 0; } });
      spawnWave(6);
    }
    if (P5.ph === 'igla') {
      if (!WP.hasIgla && near(S.iglaPos, 1.8)) {
        prompt = '按 <kbd>F</kbd> 拿起针式导弹';
        if (hit('KeyF')) {
          giveIgla(); play('magin', { vol: 0.6, rev: 0 });
          HUD.objective('击落雌鹿直升机'); HUD.setMarker(null);
          P5.iglaTip = D.t;
          musicMode('p5final');
        }
      }
      if (WP.hasIgla && WP.st.igla.ammo + WP.st.igla.reserve <= 0 && near(S.iglaPos, 1.8)) {
        prompt = '按 <kbd>F</kbd> 补充导弹'; if (hit('KeyF')) { WP.st.igla.reserve = 2; play('magin', { vol: 0.6, rev: 0 }); }
      }
      if (P5.iglaTip && D.t - P5.iglaTip < 7) prompt = prompt || '按住 <kbd>右键</kbd> 对准直升机锁定，方框变红后按 <kbd>左键</kbd> 发射';
    }
    // keep the pressure up: refill toward a target head-count whenever it drops (vehicles and waves come on top; cap 16)
    pressure(dt, P5);
    // Igla lock-on
    iglaLock(dt);
    if (hit('Digit4')) placeClaymore();
    { let rb = null, rd = 0.75; for (const r of S.rack) { const d = Math.hypot(P.pos.x - r.pos.x, P.pos.z - r.pos.z); if (d < rd && Math.abs(P.pos.y - r.pos.y) < 1.2 && WP.prim !== r.id && WP.launch !== r.id) { rd = d; rb = r; } }
      if (rb && !prompt) { prompt = `按 <kbd>F</kbd> 拿取 ${WDEF[rb.id].name}`; if (hit('KeyF')) { giveWeapon(rb.id); play('magin', { vol: 0.6, rev: 0 }); } } }
    if (!prompt && near(S.ammoPos, 1.1)) { prompt = '按 <kbd>F</kbd> 补充弹药与手雷'; if (hit('KeyF')) { for (const k of Object.keys(WP.st)) if (WDEF[k] && (k === WP.prim || k === 'pistol' || k === WP.launch)) WP.st[k].reserve = Math.max(WP.st[k].reserve, WDEF[k].reserve); WP.nades = Math.max(WP.nades, 4); WP.clay = Math.max(WP.clay || 0, 3); play('magin', { vol: 0.6, rev: 0 }); HUD.toast('弹药、手雷、阔剑已补满'); } }
    if (!P.mounted && P.pos.distanceTo(GUN_PIVOT) < 2.4) prompt = prompt || '按 <kbd>F</kbd> 使用 DShK 重机枪';
    if (!P5.clayTip && WP.clay > 0 && P5.ph === 'defend') { P5.clayTip = D.t; }
    if (P5.clayTip && D.t - P5.clayTip < 6) prompt = prompt || '按 <kbd>4</kbd> 在脚下布设阔剑地雷（敌人靠近自动引爆）';
    if (near(S.iglaPos, 1.8) && P5.ph !== 'igla' && (WP.clay || 0) < 3) { prompt = prompt || '按 <kbd>F</kbd> 拿取阔剑地雷'; if (hit('KeyF')) { WP.clay = 3; play('magin', { vol: 0.5, rev: 0 }); } }
    // the upload climbs to 99% and stalls -> finale (RPG at the player)
    if (P5.hindDown && !P5.l90 && P5.up >= 92) { P5.l90 = true; say('P5_GRIN_12'); }
    if (P5.hindDown && P5.up >= 99 && !P5.fin) {
      P5.fin = true;
      if (P.mounted) dismount();
      HUD.setHold(null); HUD.setPrompt(null); HUD.setLock(null); Q.hold = 0;
      startFinale(P5, { IN_BLDG, clearBattle });
      return;
    }
  }
  // death of the player handled by director's onPlayerDeath (fail screen)
  HUD.setHold(holdK);
  G.otherPrompt = !!prompt;
  HUD.setPrompt(prompt || G.pickPrompt || null);
};

function iglaLock(dt) {
  const h = G.hind;
  if (WP.cur !== 'igla' || !h || !h.visible || h.crashing || WP.adsT < 0.6) { Q.lockT = Math.max(0, Q.lockT - dt * 3); HUD.setLock(null); return; }
  G.camera.getWorldDirection(_d);
  _e.subVectors(h.pos, G.camera.position);
  const dist = _e.length(); _e.normalize();
  const ang = Math.acos(clamp(_d.dot(_e), -1, 1));
  if (ang < 0.14 && dist < 420) {
    Q.lockT += dt;
    Q.lockBeep -= dt;
    const locked = Q.lockT >= 1.6;
    if (Q.lockBeep <= 0) { Q.lockBeep = locked ? 0.09 : 0.28; play('lock', { vol: locked ? 0.5 : 0.35, rev: 0, rate: locked ? 1.4 : 1 }); }
    HUD.setLock(locked ? 'locked' : 'seek', h.pos);
  } else { Q.lockT = Math.max(0, Q.lockT - dt * 2); HUD.setLock(Q.lockT > 0 ? 'seek' : null, h.pos); }
}

// clear the battlefield when the screen goes black after the RPG (nothing may hurt the player any more)
function clearBattle() {
  for (const e of G.enemies) e.h.remove();
  G.enemies.length = 0; TOK.n = 0;
  clearAssault(); clearNades();
  for (const r of Q.missiles) G.scene.remove(r.mesh); Q.missiles.length = 0;
  for (const c of CLAY) G.scene.remove(c.mesh); CLAY.length = 0;
  if (G.hind && !G.hind.crashing) G.hind.remove();
  G.rockets && (G.rockets.length = 0);
  D.timers.length = 0;
}
G.p5FinalCard = () => finalCard();
function finalCard() {
  G.state = 'end';
  stopAllLoops(); A.genLoop = null;
  if (document.pointerLockElement) document.exitPointerLock();
  const st = G.stats, time = Math.round(G.real - st.t0);
  const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
  HUD.say(null); HUD.hideBig();
  HUD.show(false);
  HUD.showMenu('end', `<div class="m-card wide"><div class="m-eyebrow">弃于寒冬 · 全剧终</div><div class="m-h">Metal 0-1，完毕。</div>
    <div class="m-stats"><div><span>用时</span><b>${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}</b></div><div><span>击毙</span><b>${st.kills}</b></div><div><span>命中率</span><b>${acc}%</b></div><div><span>阵亡</span><b>${st.deaths}</b></div></div>
    <p class="m-note">故事接《使命召唤：现代战争 3》的「尘归尘」。</p>
    <div class="m-actions"><button class="btn primary" data-a="again">重新开始战役</button><button class="btn" data-a="menu">返回标题</button></div></div>`, {
    '[data-a=again]': () => G.onRetry && G.onRetry(10),
    '[data-a=menu]': () => { if (G.cineRestore) G.cineRestore(); location.reload(); },
  });
}

export function p5Debug() { return { Q, P5: D.p5 }; }
if (typeof window !== 'undefined') window.__p5 = () => ({ Q, P5: D.p5, S });
