// Part 5 "最后阵地" (radar-station last stand) and Part 6 (ending).
import { G, THREE, rr, ri, clamp, damp, lerp, pick, yawOf, angDiff, reseed } from './core.js';
import { input, hit, key } from './input.js';
import { Human, J, clearHumans } from './humans.js';
import { moveChar, los, rayBoxes, rayGround } from './physics.js';
import { TOK, requestToken, releaseToken, shootAtPlayer, shootAt, Mate } from './ai.js';
import { Hind, explodeAt, clearVehicles } from './vehicles.js';
import { clearFX } from './fx.js';
import { clearNades, throwNade, lobAt, NADES } from './grenade.js';
import { P, resetPlayer } from './player.js';
import { play, loop, musicMode, muffle, stopAllLoops, A } from './audio.js';
import { HUD } from './hud.js';
import { D, LINES, say, after, afterReal } from './director.js';
import { S, buildStation, stationColliders, setPower, updateStation, ground5, hideStation } from './station.js';
import { T, GUN_PIVOT } from './train.js';
import { supportAt } from './physics.js';
import { fireRocket, sledMesh } from './vehicles.js';
import { fwdYaw } from './core.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
const GUN0 = GUN_PIVOT.clone();
import { W } from './world.js';
import { WP, giveIgla, resetWeapons, giveWeapon, WDEF } from './weapon.js';

Object.assign(LINES, {
  P5_SAND_01: ['SANDMAN', "Sokolov. On your feet. We can't stay here.", '索科洛夫，起来。不能待在这儿。'],
  P5_GRIN_01: ['GRINCH', "Tell me that's the radar station. Tell me it's not another train.", '告诉我那是雷达站。别又是一列火车。'],
  P5_SAND_02: ['SANDMAN', 'Old Soviet early-warning site. If that dish still works, we can push the intel out.', '苏联时期的预警站。只要那口天线还能用，就能把情报发出去。'],
  P5_SOKO_01: ['索科洛夫', 'The generator is downstairs. I can start it.', '发电机在楼下，我能启动它。'],
  P5_TRUCK_01: ['TRUCK', 'Contacts on the ridge! They followed our tracks!', '山脊上有敌人！他们顺着脚印追来了！'],
  P5_SAND_03: ['SANDMAN', 'Grinch, get that uplink running. Everyone else, hold this building!', 'Grinch，把上行链路弄好。其他人，守住这栋楼！'],
  P5_GRIN_02: ['GRINCH', "Uplink's live. Upload's slow — this thing's older than my dad.", '链路通了。上传很慢——这玩意儿比我爸岁数还大。'],
  P5_GRIN_03: ['GRINCH', 'Twenty-five percent!', '百分之二十五！'],
  P5_GRIN_04: ['GRINCH', "Fifty percent! Keep 'em off me!", '百分之五十！别让他们靠近我！'],
  P5_GRIN_05: ['GRINCH', 'The dish took a hit! We lost the signal!', '天线被打中了！信号断了！'],
  P5_SAND_04: ['SANDMAN', 'Sokolov, get to the roof and realign that dish! Go!', '索科洛夫，上楼顶，把天线重新对准！快去！'],
  P5_SOKO_02: ['索科洛夫', 'Dish is aligned. Try it now!', '天线对好了，再试试！'],
  P5_GRIN_06: ['GRINCH', "Signal's back! Seventy-five… come on, come on…", '信号回来了！百分之七十五……快点，快点……'],
  P5_TRUCK_02: ['TRUCK', 'Juggernaut! Coming through the gate!', '重装兵！从大门冲进来了！'],
  P5_SAND_05: ['SANDMAN', "Focus fire! Hit him with everything you've got!", '集中火力！把所有家伙都往他身上招呼！'],
  P5_GRIN_07: ['GRINCH', "He's down! Big boy's down!", '他倒了！大块头倒了！'],
  P5_TRUCK_03: ['TRUCK', "That Hind's back!", '那架雌鹿又回来了！'],
  P5_TRUCK_04: ['TRUCK', "I'm hit… I'm hit. I'm okay. Keep shooting.", '我中弹了……我中弹了。我没事，继续打。'],
  P5_SAND_06: ['SANDMAN', 'Truck! Stay with me, big man. Stay with me.', 'Truck！撑住，大块头。撑住。'],
  P5_TRUCK_05: ['TRUCK', "Sandman… it's been an honor.", 'Sandman……很荣幸。'],
  P5_SAND_07: ['SANDMAN', "…Truck's down.", '……Truck 牺牲了。'],
  P5_SOKO_03: ['索科洛夫', 'There is an Igla in the armory.', '军械库里有一具针式导弹。'],
  P5_SAND_08: ['SANDMAN', 'Then use it. Bring that bird down!', '那就用它。把那鸟给我打下来！'],
  P5_SOKO_04: ['索科洛夫', 'Target locked.', '目标锁定。'],
  P5_GRIN_08: ['GRINCH', "It's down! It's down!", '打下来了！打下来了！'],
  P5_GRIN_09: ['GRINCH', "One hundred percent. It's out. It's out, Sandman.", '百分之百。发出去了。发出去了，Sandman。'],
  P5_KRAS_01: ['克拉辛', 'Соколов. Ты выбрал американцев. Тогда умри вместе с ними.', '索科洛夫。你选了美国人。那就跟他们一起死吧。', true],
  P6_SAND_01: ['SANDMAN', 'Price, this is Sandman. Tell me you got the package.', 'Price，我是 Sandman。告诉我你收到包裹了。'],
  P6_PRICE_01: ['PRICE', 'Got it. "Oasis"… Makarov\'s in Dubai.', '收到了。“绿洲”……马卡洛夫在迪拜。', true],
  P6_SAND_02: ['SANDMAN', 'Then go get him.', '那就去抓他。'],
  P6_PRICE_02: ['PRICE', "Hold on, Sandman. I'll send a bird for you.", '撑住，Sandman。我派飞机去接你们。', true],
  P6_SAND_03: ['SANDMAN', "Negative. Weather's closing in, and so are they. Finish it, Price.", '不用了。暴风雪要来了，他们也是。把这事了结，Price。'],
  P6_PRICE_03: ['PRICE', '…Understood. Good luck, mate.', '……明白。祝你好运，伙计。', true],
  P6_SAND_04: ['SANDMAN', 'Metal 0-1… out.', 'Metal 0-1……完毕。'],
  P6_GRIN_01: ['GRINCH', 'So… what now?', '那……现在怎么办？'],
  P6_SAND_05: ['SANDMAN', 'Now we walk.', '现在，走。'],
  P6_SOKO_01: ['索科洛夫', 'Moscow is four thousand kilometers.', '离莫斯科四千公里。'],
});

const _o = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const Q = { up: 0, rate: 0, stall: false, missiles: [], hold: 0, lockT: 0, lockBeep: 0 };
const INSIDE = (x, z) => Math.abs(x) < 29.8 && z > -29.8 && z < 25.8;
const IN_BLDG = (x, z) => Math.abs(x) < 7.9 && Math.abs(z) < 4.9;
const ENTRY = [{ o: [0, -34], i: [0, -26.5] }, { o: [-20.5, -34], i: [-20.5, -26.5] }, { o: [-34, -12.5], i: [-26.5, -12.5] }, { o: [34, -4.5], i: [26.5, -4.5] }];

function route(from, to) {
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
function walk(ent, h, tx, tz, speed, dt) {
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

function visibleMate(eye) {
  let best = null, bd = 80;
  for (const m of G.mates) {
    if (!m.h.alive || m.h.hidden) continue;
    const d = m.h.pos.distanceTo(eye);
    if (d < bd && los(eye, m.h.j[J.Ne])) { bd = d; best = m; }
  }
  return best;
}

// ---------- Hind (station variant) ----------
class StationHind extends Hind {
  constructor() {
    super();
    this.pos.set(-140, 60, -260); this.vel.set(30, 0, 30);
    this.state = 'in5'; this.orbitA = -2.2; this.atkT = 6;
  }
  hurt(dmg) { if (this.crashing) return false; return super.hurt(dmg); }
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
        if (this.gunT <= 0 && u > 0.2 && u < 0.85) {
          this.gunT = 0.07;
          const tgt = _t.set(rr(1, 7), rr(0, 1.2), rr(-8, -5.5));
          this.nose(_e);
          G.fx.tracer(_e, tgt, { width: 0.05, speed: 500, len: 5 });
          G.fx.impact(tgt, _d.set(0, 1, 0), 'soft');
          if (Math.random() < 0.3) play('dshk_far', { pos: _e, vol: 1.0, ref: 25, rev: 0.4 });
        }
        if (u > 0.55 && !this.hitTruck) { this.hitTruck = true; if (G.p5TruckHit) G.p5TruckHit(); }
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

const POSTS = {
  SANDMAN: { pts: [[-1, 30], [0, 22], [0, 8], [0, 4], [0.2, -4.15]], yaw: 0 },
  GRINCH: { pts: [[-1.5, 30], [-0.6, 22], [-0.3, 8], [0, 4], [-0.6, 0.5], [-5.7, -2.2]], yaw: Math.PI / 2 },
  TRUCK: { pts: [[1.2, 30], [1, 22], [11, 12], [11.2, -5.9], [5.1, -6.3]], yaw: 0 },
};

function makeMates5() {
  const s = new Mate('SANDMAN', 'head_sand', [0, 0]);
  const t = new Mate('TRUCK', 'head_truck', [0, 0]);
  const g = new Mate('GRINCH', 'head_grinch', [0, 0]);
  for (const m of [s, t, g]) { prep(m.h); m.custom = mateCustom(m); m.p5 = 'idle'; m.cs = 'crouch'; m.ct = rr(0.5, 2); }
  D.sand = s; D.truck = t; D.grinch = g;
  return [s, t, g];
}
export function placeMate(m, x, z, y) { m.h.pos.set(x, y ?? (G.groundFn || ground5)(x, z), z); m.h.vel.set(0, 0, 0); }
function toPost(m, instant) {
  const p = POSTS[m.name];
  m.yaw0 = p.yaw;
  const next = m.name === 'GRINCH' ? 'console' : 'defend';
  if (instant) { const [x, z] = p.pts[p.pts.length - 1]; placeMate(m, x, z, m.name === 'TRUCK' ? 0 : 0.15); m.h.yaw = p.yaw; m.p5 = next; }
  else goMate(m, p.pts, next);
}

// ---------- level control ----------
export function clear5() {
  clearHumans(); clearVehicles(); clearFX(); clearNades();
  for (const r of Q.missiles) G.scene.remove(r.mesh);
  Q.missiles.length = 0; Q.wreck = null;
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
  const [s, t, g] = makeMates5();
  resetWeapons();
  Q.lockT = 0; Q.hold = 0;
  if (T.dshk) { T.dshk.yaw.rotation.y = 0; T.dshk.pitch.rotation.x = 0; }
  WP.heat = 0; WP.overheated = false;
  if (!G.stats || !cont && k === 4) G.stats = { shots: 0, hits: 0, kills: 0, deaths: G.stats ? G.stats.deaths || 0 : 0, t0: G.real };
  if (k === 4) {
    setPower(false); S.dish.off = 0;
    resetPlayer(new THREE.Vector3(-3, ground5(-3, 44), 44), 0);
    P.crouched = true; P.pitch = -0.25;
    placeMate(s, -1.5, 40.5); placeMate(t, -4.6, 42.2); placeMate(g, -1.8, 45.8);
    for (const m of [s, t, g]) m.h.yaw = 0;
    P5.ph = 'approach';
    HUD.fade(1, 0); setTimeout(() => HUD.fade(0, 3), 50);
    after(1.2, () => HUD.locCard(['最后阵地', '西伯利亚 · 废弃预警雷达站 · 07:40', '维克多·索科洛夫 中尉 · 联邦警卫局（FSO）', '“弃于寒冬” · 第四部分']));
    musicMode('p5calm');
    if (!cont) say('P5_SAND_01', 1.0);
    say('P5_GRIN_01', cont ? 1.5 : 4.5); say('P5_SAND_02', cont ? 6 : 9);
    after(2.5, () => { for (const m of [s, t, g]) toPost(m); });
    after(3.0, () => { HUD.objective('前往雷达站'); HUD.setMarker(new THREE.Vector3(0, 1.4, 5.3), ''); });
  } else {
    setPower(true); S.dish.off = 0;
    for (const m of [s, t, g]) toPost(m, true);
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
      t.h.alive = false; t.h.hidden = true; t.custom = () => {};
      new StationHind(); G.hind.pos.set(-60, 35, -80);
      enterIgla(true);
    }
    A.genLoop = loop('train', { pos: S.genPos.clone().setY(1), vol: 0.22, ref: 4, rate: 0.55 });
  }
  HUD.show(true);
};

function startDefend() {
  const P5 = D.p5;
  P5.ph = 'defend'; P5.up = 0; P5.rate = 0.5;
  WP.clay = 3; P.canMount = true;
  HUD.objective('守住雷达站，直到情报上传完毕');
  HUD.setMarker(null);
  musicMode('p5defend');
  spawnWave(1);
}

const aliveEnemies = () => G.enemies.filter((e) => e.h.alive).length;
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
    after(k * 0.5, () => { if (G.lvl === 5 && aliveEnemies() < 13) new Raider(p.x, p.z, { maxTier: rpg ? 1 : tier, rpg }); });
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
      say('P5_GRIN_05', 0.4); say('P5_SAND_04', 0.6);
      after(1.5, () => { HUD.objective('上楼顶校正卫星天线'); HUD.setMarker(S.panelPos.clone().setY(S.panelPos.y + 1.2), ''); });
      if (G.bark) G.bark('RU_07', from, true);
    } });
}

function enterIgla(fromCk) {
  const P5 = D.p5;
  P5.ph = 'igla';
  if (!fromCk) { say('P5_SOKO_03', 0.8); say('P5_SAND_08', 0.4); }
  after(fromCk ? 0.5 : 4.5, () => { HUD.objective('去军械库拿针式导弹'); HUD.setMarker(S.iglaPos.clone().setY(1.6), ''); });
  if (fromCk) { musicMode('p5final'); HUD.objective('去军械库拿针式导弹'); HUD.setMarker(S.iglaPos.clone().setY(1.6), ''); D.ck = 6; }
}

G.p5JuggDown = () => {
  const P5 = D.p5; if (!P5) return;
  P5.juggDone = true; say('P5_GRIN_07', 0.6);
  after(3, () => { if (P5.ph === 'defend') musicMode('p5defend'); });
};

G.p5TruckHit = () => {
  const P5 = D.p5, tr = D.truck, sd = D.sand;
  if (!tr || P5.truckHit) return;
  P5.truckHit = true;
  tr.p5 = 'wounded'; tr.h.sit = { seat: S.truckSeat.clone() }; tr.h.yaw = Math.PI; tr.h.pos.set(S.truckSeat.x, 0, S.truckSeat.z + 0.1);
  tr.h.flinch = 1;
  G.fx.impact(tr.h.j[J.Ne].clone(), _d.set(0, 0, 1), 'flesh');
  say('P5_TRUCK_04', 0.3);
  after(2.2, () => { goMate(sd, [[0, 4], [0.3, 6.2], [10.8, 5.6], [10.8, -5.9], [3.2, -5.6]], 'kneel', 5.5); sd.look = S.truckSeat; say('P5_SAND_06', 0.2); });
  P5.truckLineAt = D.t;
};

G.p5HindDown = () => {
  const P5 = D.p5;
  P5.hindDown = true;
  say('P5_GRIN_08', 1.2);
  musicMode('p5final');
  HUD.setLock(null);
  after(2, () => { P5.rate = 3.5; HUD.objective('等待上传完成'); HUD.setMarker(null); });
};

G.onLaunch = (from, dir) => {
  const P5 = D.p5;
  const locked = Q.lockT >= 1.6 && G.hind && G.hind.visible && !G.hind.crashing;
  launchMissile(from, dir, { hind: locked ? G.hind : null, speed: 120, speed0: 30, turn: 2.8, dmg: 80 });
  Q.lockT = 0;
  if (P5 && !locked && !P5.dumbTip) { P5.dumbTip = true; after(1.5, () => HUD.setPrompt('先按住右键瞄准直升机，等方框变红再发射')); after(5, () => HUD.setPrompt(null)); }
};

// ---------- assault vehicles (trucks unloading troops, snowmobiles charging the yard) ----------
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
  if (Q.wreck) {
    Q.wreck.t += dt;
    if (Math.random() < 0.5) G.fx.smoke(Q.wreck.pos, { size: 2, grow: 5, life: 5, color: 0x1a1918, alpha: 0.55, vy: 2.5, wind: 1 });
    if (Math.random() < 0.6) G.fx.add.spawn(Q.wreck.pos.x + rr(-1.5, 1.5), Q.wreck.pos.y + rr(0, 1), Q.wreck.pos.z + rr(-1.5, 1.5), 0, rr(1, 3), 0, { life: 0.4, size: 1.2, c: [1, 0.5, 0.15], alpha: 1 });
  }
  if (P5.ph === 'ending') return updateEnding(dt);
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
      say('P5_SOKO_01', 0.3);
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
      const cap = P5.hindDown ? 100 : P5.juggDone || P5.ph !== 'defend' ? 95 : 70;
      P5.up = Math.min(cap, P5.up + P5.rate * dt);
    }
    HUD.setUpload(P5.up, P5.stall);
    // milestone lines + waves
    if (!P5.krasDone && P5.up > 10) { P5.krasDone = true; say('P5_KRAS_01', 0.5); }
    if (!P5.l25 && P5.up >= 25) { P5.l25 = true; say('P5_GRIN_03'); }
    if (!P5.l50 && P5.up >= 50) { P5.l50 = true; say('P5_GRIN_04'); }
    if (P5.wave === 1 && P5.up >= 16) { P5.wave = 2; spawnWave(2); }
    if (!P5.truck1 && P5.up >= 28) { P5.truck1 = true; sendTruck([[0.5, -21]], 5); after(4, () => HUD.toast('敌军卡车正从大门冲进来！')); }
    if (!P5.sleds1 && P5.up >= 42) { P5.sleds1 = true; sendSleds(); }
    if (!P5.truck2 && P5.dishDone && P5.up >= 60) { P5.truck2 = true; sendTruck([[-13, -25]], 4); }
    if (!P5.sleds2 && P5.ph === 'igla') { P5.sleds2 = true; sendSleds(); }
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
          say('P5_SOKO_02', 0.1); say('P5_GRIN_06', 0.4);
          HUD.objective('守住雷达站，直到情报上传完毕'); HUD.setMarker(null);
          D.ck = 5; if (G.saveCk) G.saveCk(5); HUD.locCard(['检查点', '天线已校正']);
          P5.up = Math.max(P5.up, 56);
        }
      } else Q.hold = 0;
    }
    // juggernaut at 70%
    if (P5.dishDone && !P5.juggSpawned && P5.up >= 69.5) {
      P5.juggSpawned = true; P5.rate = 0.35;
      sendTruck([[13, -25]], 3, { jugg: true, speed: 9 });
      say('P5_TRUCK_02', 2.0); say('P5_SAND_05', 0.2);
      if (G.bark) after(1.0, () => G.bark('RU_08', new THREE.Vector3(0, 1, -40), true));
      musicMode('p5jugg');
      HUD.objective('击倒重装兵');
      after(6, () => { if (!P5.juggDone) HUD.objective('击倒重装兵（打头部，或用手雷）'); });
    }
    if (P5.juggDone && !P5.hindIn && P5.up >= 80) {
      P5.hindIn = true; P5.ph = 'hind';
      HUD.objective('守住雷达站');
      new StationHind();
      say('P5_TRUCK_03', 4.0);
      after(14, () => { if (G.hind && !G.hind.crashing) { G.hind.state = 'strafe5'; G.hind.stT = 0; } });
      spawnWave(6);
    }
    // Truck's last lines, then the Igla
    if (P5.truckHit && !P5.t5 && D.sand && D.sand.p5 !== 'kneel' && D.t - P5.truckLineAt > 14) { placeMate(D.sand, 3.2, -5.6, 0); D.sand.p5 = 'kneel'; }
    if (P5.truckHit && !P5.truckDead && D.sand && D.sand.p5 === 'kneel' && !P5.t5) {
      P5.t5 = true; say('P5_TRUCK_05', 0.6);
    }
    if (P5.t5 && !P5.truckDead && !D.q.length && !D.cur) {
      P5.truckDead = true;
      const tr = D.truck; tr.h.invuln = false; tr.h.sit = null; tr.h.die(_d.set(0, -0.2, 1), J.P, 1.2);
      musicMode('p5loss');
      say('P5_SAND_07', 1.2);
      after(9, () => { if (D.sand) { goMate(D.sand, [[10.8, -5.9], [10.8, 5.6], [0.3, 6.2], [0, 4], [0.2, -4.15]], 'defend', 4.5); D.sand.yaw0 = 0; } });
      after(3.5, () => { enterIgla(false); D.ck = 6; if (G.saveCk) G.saveCk(6); });
      after(10, () => { if (P5.ph === 'igla' && !P5.hindDown) musicMode('p5final'); });
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
    // keep pressure up: top up enemies between scripted waves
    P5.spawnT -= dt;
    if (P5.ph !== 'igla' || !P5.hindDown) {
      if (P5.spawnT <= 0 && P5.wave >= 2 && aliveEnemies() < (P5.ph === 'hind' || P5.ph === 'igla' ? 5 : 8)) { P5.spawnT = rr(6, 9); spawnWave(7); }
    }
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
    // upload complete -> ending
    if (P5.up >= 100 && !P5.done) {
      P5.done = true;
      HUD.setUpload(100, false);
      say('P5_GRIN_09', 1.0);
      for (const e of G.enemies) if (e.h.alive) { e.maxTier = -1; }
      afterReal(7.5, startEnding);
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
    if (locked && !D.p5.lockSaid) { D.p5.lockSaid = true; say('P5_SOKO_04'); }
    HUD.setLock(locked ? 'locked' : 'seek', h.pos);
  } else { Q.lockT = Math.max(0, Q.lockT - dt * 2); HUD.setLock(Q.lockT > 0 ? 'seek' : null, h.pos); }
}

// ---------- Part 6: ending ----------
function startEnding() {
  const P5 = D.p5;
  P5.ph = 'ending'; P5.e = { t: 0, step: 0 };
  HUD.fade(1, 2.0, '#000');
  HUD.objective(null); HUD.setMarker(null); HUD.setPrompt(null); HUD.setUpload(null); HUD.setLock(null);
  musicMode('silence');
  afterReal(2.4, () => {
    // aftermath tableau inside the ops room
    for (const e of G.enemies) if (e.h.alive) { e.h.hidden = true; e.h.alive = false; }
    clearNades(); if (G.hind) G.hind.remove();
    resetPlayer(new THREE.Vector3(0.6, 0.15, 0.4), Math.PI * 0.32);
    WP.hidden = true; P.enabled = false;
    P.crouched = true; P.pitch = -0.08;
    const s = D.sand, g = D.grinch;
    if (s) { s.custom = mateCustom(s); s.p5 = 'sitTalk'; s.h.sit = { seat: new THREE.Vector3(-4.7, 0.72, -2.9) }; s.h.pos.set(-4.7, 0.15, -2.9); s.h.yaw = -2.4; }
    if (g) { g.p5 = 'idle'; g.h.noWeapon = false; placeMate(g, -2.2, -3.9, 0.15); g.yaw0 = 0.15; g.h.yaw = 0.15; }
    P.autoLook = { target: new THREE.Vector3(-4.7, 1.2, -2.9), rate: 1.6 };
    W.fogTarget = 0.016;
    HUD.fade(0, 2.5);
    musicMode('p6end');
    say('P6_SAND_01', 1.5); say('P6_PRICE_01', 0.6); say('P6_SAND_02', 0.5); say('P6_PRICE_02', 0.6); say('P6_SAND_03', 0.6); say('P6_PRICE_03', 1.0); say('P6_SAND_04', 1.2);
    P5.e.step = 1;
  });
}
G.onLine = (id) => {
  const P5 = D.p5; if (!P5 || P5.ph !== 'ending') return;
  if (id === 'P6_SAND_04') { say('P6_GRIN_01', 2.2); say('P6_SAND_05', 0.8); }
  if (id === 'P6_SAND_05') {
    after(1.2, () => {
      const s = D.sand, g = D.grinch;
      if (s) { s.h.sit = null; s.h.noWeapon = false; goMate(s, [[-2, -1], [0, 3], [0, 8], [-1, 20], [-2, 40]], 'idle', 1.8); }
      if (g) after(1.0, () => goMate(g, [[-1, 0], [0, 3], [0.6, 8], [0.5, 20], [0, 40]], 'idle', 1.8));
      P.autoLook = { target: new THREE.Vector3(0, 1.2, 8), rate: 1.2 };
      after(4.5, () => { P.crouched = false; P5.e.walk = 1; });
    });
  }
};
function updateEnding(dt) {
  const e = D.p5.e; e.t += dt;
  HUD.setPrompt(null);
  if (e.walk === 1) {
    P.scriptMove = { x: 0, z: 3.2, speed: 1.4 };
    if (Math.hypot(P.pos.x, P.pos.z - 3.2) < 0.6) e.walk = 2;
  } else if (e.walk === 2) {
    P.scriptMove = { x: 0, z: 24, speed: 1.4 };
    P.autoLook = { target: new THREE.Vector3(-1, 1.3, 60), rate: 1.0 };
    W.fogTarget = 0.045;
    if (!e.said) { e.said = 1; say('P6_SOKO_01', 2.5); }
    if (P.pos.z > 12 && !e.fade) {
      e.fade = 1;
      HUD.fade(1, 4.0, '#e9edf0');
      afterReal(4.5, () => { HUD.fade(1, 1.2, '#000'); HUD.say(null); });
      afterReal(6.0, () => { G.onEpilogueDone = finalCard; G.playEpilogue(); });
    }
  }
}
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
