import { G, THREE, rr, clamp, damp, smooth, pick, reseed } from './core.js';
import { input, hit } from './input.js';
import { gorge } from './physics.js';
import { W, buildGorge, rebuildChunks } from './world.js';
import { T, buildTrain, setInvWalls, DECK, GUN_PIVOT, CAB_DOOR } from './train.js';
import { clearHumans, J } from './humans.js';
import { Enemy, Mate, spawnTrainEnemies, mateFollow, TOK } from './ai.js';
import { Sled, Hind, fireRocket, clearVehicles, explodeAt } from './vehicles.js';
import { clearFX } from './fx.js';
import { clearNades } from './grenade.js';
import { P, resetPlayer, mount, jumpOff } from './player.js';
import { play, playVO, playBark, musicMode, muffle, A, loop, stopAllLoops } from './audio.js';
import { HUD } from './hud.js';

// ---- dialogue (ids match the voice-over file names)
export const LINES = {
  SAND_01: ['SANDMAN', "Train's pulling out! Move, move, move!", '列车要开了！快，快，快！'],
  GRIN_01: ['GRINCH', 'You want us to catch a train? In this?', '你要我们追火车？就这天气？'],
  TRUCK_01: ['TRUCK', "I'm on! Sandman, come on!", '我上来了！Sandman，快！'],
  SAND_02: ['SANDMAN', 'Clear these cars. Push to the engine.', '清掉这些车厢，推进到车头。'],
  GRIN_02: ['GRINCH', 'Snowmobiles, left side!', '左侧，雪地摩托！'],
  TRUCK_02: ['TRUCK', "More on the right! They're trying to board!", '右边还有！他们想爬上车！'],
  SAND_03: ['SANDMAN', 'Grinch, take the engine. Truck, with me.', 'Grinch，去控制车头。Truck，跟我来。'],
  GRIN_03: ['GRINCH', "Engine's mine. Anybody know how to drive a Russian train?", '车头拿下了。谁会开俄国火车？', true],
  GRIN_05: ['GRINCH', 'Big lever, all the way forward. How hard can it be?', '大操纵杆，推到底。能有多难？', true],
  TRUCK_05: ['TRUCK', 'Sandman, get on that DShK!', 'Sandman，上那挺 DShK！'],
  TRUCK_03: ['TRUCK', "Hind! Twelve o'clock high!", '雌鹿直升机！正前方高空！'],
  SAND_05: ['SANDMAN', 'Light it up! Keep it off the engine!', '打它！别让它靠近车头！'],
  GRIN_04: ['GRINCH', 'Uh, guys? Bridge coming up.', '呃，各位？前面是桥。', true],
  TRUCK_04: ['TRUCK', "It's lining up on the bridge—", '它对准桥了——'],
  SAND_06: ['SANDMAN', 'Everybody — JUMP!', '所有人——跳！'],
  TRUCK_06: ['TRUCK', 'Sandman… Sandman! On your feet, boss.', 'Sandman……Sandman！站起来，头儿。'],
  KRAS_01: ['克拉辛', 'Американцы на поезде. Остановить состав. Любой ценой.', '美国人在火车上。把车拦下来，不惜一切代价。', true],
  TRUCK_07: ['TRUCK', 'More sleds — both sides!', '又来一批雪地摩托——两边都有！'],
  GRIN_06: ['GRINCH', 'Got sleds coming up the left!', '左边又上来几辆雪地摩托！', true],
  TRUCK_08: ['TRUCK', 'Right side! Swing it around!', '右边！把枪转过去！'],
};

export const D = { phase: '', t: 0, rt: 0, ck: 0, q: [], cur: null, f: {}, timers: [], slow: null };

export function say(id, delay = 0) { D.q.push({ id, at: D.rt + delay }); }
export function after(sec, fn) { D.timers.push({ at: D.t + sec, fn }); }
export function afterReal(sec, fn) { D.timers.push({ atR: D.rt + sec, fn }); }

function updateDialogue() {
  if (D.cur && D.rt > D.cur.end) { D.cur = null; HUD.say(null); }
  if (!D.cur && D.q.length && D.rt >= D.q[0].at) {
    const { id } = D.q.shift();
    const L = LINES[id];
    const words = L[1].split(/\s+/).length;
    const vo = playVO(id, !!L[3]);
    const dur = vo || Math.max(1.7, 0.7 + words * 0.36);
    D.cur = { id, end: D.rt + dur + 0.35 };
    HUD.say(L[0], L[2], !!L[3]);
    if (G.onLine) G.onLine(id);
  }
}

let barkT = -9;
G.bark = (id, pos, force) => {
  if (!force && D.rt - barkT < 1.6) return;
  barkT = D.rt; playBark(id, pos);
};

// ---------- checkpoints ----------
function clearAll() {
  if (G.leavePart5) G.leavePart5();
  if (G.leaveCave) G.leaveCave();
  G.groundFn = null; G.lvl = 2;
  clearHumans(); clearVehicles(); clearFX(); clearNades();
  G.enemies.length = 0; G.mates.length = 0; TOK.n = 0;
  G.boxes.length = 0;
  buildTrain();
  T.dshk.yaw.rotation.y = Math.PI; T.dshk.pitch.rotation.x = 0;
  gorge.active = false; gorge.broken = false; gorge.D = 1e9;
  if (W.gorgeGroup) { W.root.remove(W.gorgeGroup); W.gorgeGroup = null; }
  W.fogTarget = W.fogDensity = 0.0115;
  G.s = 0; rebuildChunks();
  D.q.length = 0; D.cur = null; D.timers.length = 0; D.f = {}; D.slow = null;
  G.timeScale = 1; HUD.setSlowmo(false); HUD.say(null); HUD.setPrompt(null); HUD.setMarker(null);
  muffle(20000, 0.05);
  G.lastShotT = -9;
  if (D.screech) { D.screech.stop(); D.screech = null; }
}

function makeMates() {
  const t = new Mate('TRUCK', 'head_truck', [0.12, 2.5]);
  const g = new Mate('GRINCH', 'head_grinch', [-0.12, 5]);
  D.truck = t; D.grinch = g;
  return [t, g];
}

export function startCheckpoint(k) {
  if (G.saveCk) G.saveCk(k);
  if (k >= 10 && G.startCave) return G.startCave(k);
  if (k >= 4 && G.startPart5) return G.startPart5(k);
  reseed(1000 + k);
  clearAll();
  D.ck = k; D.t = 0; D.rt = 0;
  G.state = 'play'; G.paused = false;
  const [t, g] = makeMates();
  if (k === 0) {
    G.v = 1.2; G.vTarget = 5.2; G.vRate = 0.25;
    resetPlayer(new THREE.Vector3(3.3, 0, 47), 0);
    t.place(2.5, 37.5); g.place(4.1, 40);
    for (const m of [t, g]) { m.mode = 'run'; m.speed = 0; }
    spawnTrainEnemies(999);
    setInvWalls(false);
    D.phase = 'board';
    HUD.fade(1, 0); setTimeout(() => HUD.fade(0, 2.5), 50);
    after(1.0, () => HUD.locCard(['铁马', '西伯利亚 · 钻石矿运矿支线 · 06:12', '“Sandman” 军士长 · 三角洲部队 · Metal 0-1', '“弃于寒冬” · 第三部分']));
    musicMode('intro');
    say('SAND_01', 0.8); say('GRIN_01', 3.6);
    after(1.4, () => { HUD.objective('追上列车'); HUD.setMarker(new THREE.Vector3(0.8, DECK + 0.6, 31.5), ''); });
    if (!G.keepStats) G.stats = { shots: 0, hits: 0, kills: 0, deaths: G.stats.deaths || 0, t0: G.real };
    G.keepStats = false;
  } else if (k === 1) {
    G.v = 10; G.vTarget = 13; G.vRate = 0.8;
    resetPlayer(new THREE.Vector3(0, DECK, 27.5), 0);
    t.place(0.12, 29.5); g.place(0, 31);
    for (const m of [t, g]) m.mode = 'follow';
    spawnTrainEnemies(999);
    enterCars(true);
  } else {
    G.v = 22; G.vTarget = 22;
    resetPlayer(new THREE.Vector3(0, DECK, -44), 0);
    t.place(0.9, -40.2);
    t.mode = 'hold'; g.h.hidden = true; g.mode = 'cab';
    setInvWalls(true);
    T.dshk.yaw.rotation.y = 0;
    P.canMount = true; mount();
    if (k === 2) enterTurret(true);
    else { enterTurret(true, true); enterBridge(); }
  }
  HUD.show(true);
}

// ---------- phases ----------
function enterCars(fromCk) {
  D.phase = 'cars'; D.ck = Math.max(D.ck, 1); D.phaseT = 0;
  setInvWalls(true);
  G.vTarget = 13; G.vRate = 0.8;
  HUD.objective('向车头推进'); HUD.setMarker(new THREE.Vector3(0, DECK + 1.2, -46.6), '');
  say('SAND_02', fromCk ? 0.6 : 1.0);
  musicMode('fight');
  for (const m of G.mates) { if (!m.arc && m.h.pos.y > 1.0) m.mode = 'follow'; }
  for (const e of G.enemies) if (e.kind === 'gunner' && e.h.alive) { e.wake(); e.t = 1.2; } // the DShK opens up as soon as we are aboard
}

// teammates still on the ground sprint alongside and jump onto the rear car
const SLOTS = [[2.0, 29.0, 2.0], [2.0, 30.6, 4.5]];
function mateBoard() {
  [D.truck, D.grinch].forEach((m, i) => {
    if (!m || m.arc || m.h.hidden) return;
    if ((m.mode === 'follow' || m.mode === 'hold') && m.h.pos.y < 1.0) m.mode = 'run'; // safety: never fight from under the train
    if (m.mode !== 'run') return;
    const [x, z, start] = SLOTS[i];
    if (D.phase === 'board' && D.t < start) { m.speed = 0; return; }
    m.speed = D.phase === 'board' ? 3.4 : 6; m.target.set(x, 0, z);
    if (Math.hypot(m.h.pos.x - x, m.h.pos.z - z) < 0.8) {
      m.mode = 'jump'; m.jumpTo([0.4, -0.2][i], DECK, z - 2.5, 0.5, 0.7);
      m.onArcDone = () => { m.mode = 'follow'; if (m === D.truck && D.phase === 'board') say('TRUCK_01', 0.3); };
    }
  });
}

function enterClear() {
  D.phase = 'clear'; D.f.clearT = D.t;
  say('SAND_03', 0.8);
  after(1.6, () => {
    const g = D.grinch; if (!g || g.h.hidden) return;
    g.mode = 'cab'; g.target.set(0.85, 0, -50.7); g.speed = 7;
  });
  after(9, () => { // don't keep the player waiting: if Grinch is still far, he is already in the cab
    const g = D.grinch; if (g && !g.h.hidden && g.mode === 'cab' && !g.arc) { g.h.pos.set(0.85, DECK, -50.7); g.target.copy(g.h.pos); }
  });
  D.truck.offs = [0.9, 1.5];
}

function enterTurret(fromCk, quiet) {
  D.phase = 'turret'; D.ck = Math.max(D.ck, 2); D.turretT = 0;
  P.canDismount = true;
  HUD.objective('击退追兵，打下雌鹿直升机'); HUD.setMarker(null);
  musicMode('turret');
  D.truck.mode = 'hold'; D.truck.target.set(0.95, 0, -40.0);
  if (!quiet) {
    say('TRUCK_03', 1.0);
    after(2.0, () => { new Hind(); });
    say('KRAS_01', 7);
    say('SAND_05', 11);
  } else new Hind();
  D.sledT = fromCk ? 4 : 6; D.sledSide = 1; D.wave = 0;
}

// DShK section: snowmobiles arrive in waves on BOTH sides (some come up from ahead), staggered so they don't stack
const WAVES = [[2, 1], [1, 2], [2, 2], [2, 2], [3, 2], [2, 3]];
function sledWave() {
  const w = WAVES[Math.min(D.wave, WAVES.length - 1)], first = D.wave % 2 ? 1 : -1;
  let k = 0;
  for (const side of [first, -first]) {
    const n = w[side === first ? 0 : 1], offs = [rr(-8, -5), rr(1, 4), rr(8, 11)];
    for (let i = 0; i < n; i++, k++) {
      const ahead = D.wave > 0 && i === 1;
      after(k * 0.9, () => {
        if (D.phase !== 'turret' && D.phase !== 'bridge') return;
        new Sled(side, ahead ? rr(-175, -160) : rr(95, 125), { offs: offs[i], lane: i === 2 ? 11.5 : i ? 9.5 : 7.8, noGunner: i === 2 && Math.random() < 0.5 });
      });
    }
  }
  if (D.wave > 0 && !D.cur && D.q.length === 0) say(D.wave === 1 ? 'GRIN_06' : D.wave === 2 ? 'TRUCK_08' : 'TRUCK_07', 1.5);
  D.wave++;
}

function enterBridge() {
  D.phase = 'bridge'; D.ck = 3; D.bridgeT = 0;
  const h = G.hind;
  if (h) { h.state = 'retreat'; h.stT = 0; h.hp = Math.min(h.hp, h.maxHp * 0.4); }
  gorge.D = G.s + 70 + 640; gorge.active = true; gorge.broken = false;
  buildGorge();
  W.fogTarget = 0.0042;
  HUD.objective('坚持住');
  musicMode('bridge');
}

function edgeDist(z) { return z - (G.s - gorge.D); } // >0 while the gorge edge is still ahead of z

function bridgeHit() {
  if (gorge.broken) { return; }
  gorge.broken = true;
  const ms = W.midSpan; ms.userData.falling = true; ms.userData.vy = 0; ms.userData.av = 0.22; ms.userData.az = 0.06;
  const zc = G.s - gorge.D - 45;
  for (const [x, dz, s] of [[0, -6, 2.4], [2, 5, 1.8], [-2, 12, 1.6]]) setTimeout(() => explodeAt(new THREE.Vector3(x, 2, G.s - gorge.D - 45 + dz), s, 1, 0, { noPlayerDmg: true, wind: 0.6 }), (Math.abs(dz) * 25));
  P.addShake(0.5);
  D.f.brakeAt = D.rt + 1.4;
  HUD.objective('抓稳了');
  musicMode('bridge');
}

function mateJump(m) {
  if (m.h.hidden) { // Grinch bails out of the cab door
    m.h.hidden = false; m.h.pos.copy(CAB_DOOR).setX(1.3); m.mode = 'hold';
  }
  const z = m.h.pos.z;
  setTimeout(() => {
    m.mode = 'jump';
    m.jumpTo(rr(5.5, 8), 0, z + rr(-1, 2), 0.9, 1.6);
    m.onArcDone = () => { m.mode = 'ground'; m.target.copy(m.h.pos); m.h.crouchT = 1; };
  }, rr(150, 900));
}

function doJump() {
  D.f.jumped = true; D.f.jumpOpen = false;
  if (D.screech) { D.screech.stop(); D.screech = null; }
  jumpOff(); setInvWalls(false);
  HUD.setPrompt(null); HUD.objective(null);
  D.slow = { t: 0, hold: 2.4, out: 1.2, k: 0.22 };
  HUD.setSlowmo(true);
  play('slowmo', { vol: 1, noSlow: true, rev: 0.2 });
  musicMode('silence'); muffle(900, 0.1);
}

G.onJumpLand = () => {
  P.autoLook = { target: new THREE.Vector3(0, -6, P.pos.z - 80), rate: 2.2 };
  P.lockLook = true;
  D.f.landed = true; D.landT = D.t; D.landRT = D.rt;
};

G.onCarFall = (c) => {
  if (c.type === 'loco') play('horn', { pos: new THREE.Vector3(0, 4, c.z0), vol: 0.9, ref: 30, noSlow: true });
};
G.onCarLand = (c) => {
  const p = new THREE.Vector3(0, gorge.iceY + 1, c.group.position.z);
  G.fx.splash(p, c.type === 'loco' ? 1.6 : 1.1);
  if (c.type === 'loco') G.fx.explosion(p.clone().setY(p.y + 2), 2.2, { wind: 1 });
  play('crash', { pos: p, vol: 1.6, ref: 40, roll: 0.5, rev: 0.6 });
  play('icecrack', { pos: p, vol: 1.4, ref: 40, roll: 0.5, rev: 0.5 });
  P.addShake(0.35);
  D.lastCarLand = D.t;
};
G.onSpanLanded = () => {
  const p = new THREE.Vector3(0, gorge.iceY + 2, G.s - gorge.D - 45);
  G.fx.splash(p, 2.0); play('crash', { pos: p, vol: 1.6, ref: 50, roll: 0.5, rev: 0.6 }); play('icecrack', { pos: p, vol: 1.5, ref: 50, roll: 0.5 });
};
G.onBridgeHit = () => bridgeHit();
G.onMount = () => { if (D.phase === 'gunready' || D.phase === 'clear') { HUD.setPrompt(null); enterTurret(false); } };
G.onHindHurt = () => {};
G.onPlayerShot = () => { G.lastShotT = G.t; };
G.onPlayerDeath = () => { afterReal(2.2, () => fail('你阵亡了。', '提示：躲到掩体后面，等画面边缘的红色褪去再出来。')); musicMode('silence'); };
G.onNearBlast = (d) => { muffle(500, 0.05); play('ring', { vol: 0.35 * (1 - d / 6), noSlow: true, rev: 0 }); afterReal(1.6, () => { if (!D.slow) muffle(20000, 0.6); }); };

function fail(msg, tip = '') {
  if (G.state !== 'play') return;
  G.state = 'fail';
  HUD.setPrompt(null); HUD.say(null);
  if (document.pointerLockElement) document.exitPointerLock();
  HUD.showMenu('fail', `<div class="m-card"><div class="m-eyebrow">任务失败</div><div class="m-h">${msg}</div><p class="m-note">${tip}</p><div class="m-actions"><button class="btn primary" data-a="retry">从检查点重试</button></div></div>`, {
    '[data-a=retry]': () => { if (G.onRetry) G.onRetry(D.ck); },
  });
}
D.fail = fail;

function endSequence() {
  D.phase = 'end'; D.f.ending = true;
  HUD.fade(1, 1.8, '#000');
  HUD.objective(null); HUD.setMarker(null);
  muffle(600, 0.4);
  afterReal(2.2, () => { say('TRUCK_06', 0); musicMode('end'); });
  afterReal(7.0, () => { if (G.startPart5) G.startPart5(4, true); });
}

// ---------- per-frame ----------
export function updateDirector(dt, rdt) {
  D.t += dt; D.rt += rdt;
  for (let i = D.timers.length - 1; i >= 0; i--) {
    const tm = D.timers[i];
    if ((tm.at !== undefined && D.t >= tm.at) || (tm.atR !== undefined && D.rt >= tm.atR)) { D.timers.splice(i, 1); tm.fn(); }
  }
  updateDialogue();
  // train speed
  G.v = G.v < G.vTarget ? Math.min(G.vTarget, G.v + G.vRate * dt) : Math.max(G.vTarget, G.v - G.vRate * dt);
  // slow motion (real time driven)
  if (D.slow) {
    const s = D.slow; s.t += rdt;
    if (s.t < 0.25) G.timeScale = 1 - (1 - s.k) * (s.t / 0.25);
    else if (s.t < s.hold) G.timeScale = s.k;
    else if (s.t < s.hold + s.out) G.timeScale = s.k + (1 - s.k) * smooth((s.t - s.hold) / s.out);
    else { G.timeScale = 1; D.slow = null; HUD.setSlowmo(false); muffle(20000, 1.5); }
  }
  if (G.state !== 'play') return;
  if (G.lvl !== 2) { if (G.levelUpdate) G.levelUpdate(dt, rdt); return; }
  const ph = D.phase;
  let prompt = null;
  if (ph === 'board') {
    mateBoard();
    const nearRear = P.pos.z > 18 && P.pos.z < 33.2 && Math.abs(P.pos.x) < 2.6 && P.pos.y < DECK - 0.3;
    if (nearRear) prompt = '按 <kbd>空格</kbd> 攀上列车';
    if (P.onTrain && P.grounded) enterCars(false);
    if (P.pos.z > 80) fail('你没赶上列车。', '提示：按住 Shift 冲刺，贴近车厢后按空格攀上去。');
  } else if (ph === 'cars' || ph === 'clear' || ph === 'gunready') {
    mateBoard();
    const P0 = P.pos.z;
    if (!D.f.waveA && P0 < 14) { D.f.waveA = 1; new Sled(-1, 95, { offs: -2 }); new Sled(-1, 118, { offs: 6 }); say('GRIN_02', 2.2); }
    if (!D.f.waveB && P0 < -9) { D.f.waveB = 1; new Sled(1, 100, { offs: 1 }); new Sled(1, 124, { offs: -6, noGunner: true }); say('TRUCK_02', 2.2); }
    const alive = G.enemies.filter((e) => e.h.alive).length;
    if (ph === 'cars' && alive === 0) enterClear();
    if (ph === 'clear') {
      const g = D.grinch;
      if (g.mode === 'cab' && !g.h.hidden && !g.arc && g.h.pos.z < -49.5 && Math.hypot(g.h.pos.x - g.target.x, g.h.pos.z - g.target.z) < 0.6) {
        g.h.hidden = true; play('bolt', { pos: CAB_DOOR, vol: 0.5 });
        say('GRIN_03', 0.5); say('GRIN_05', 0.9);
        D.f.leverAt = D.rt + 5.2;
      }
      if (D.f.leverAt && D.rt > D.f.leverAt) {
        D.f.leverAt = 0; G.vTarget = 22; G.vRate = 1.3;
        play('horn', { pos: new THREE.Vector3(0, 4.7, -66), vol: 1.2, ref: 30 });
        say('TRUCK_05', 1.2);
        after(2.0, () => { D.phase = 'gunready'; P.canMount = true; HUD.objective('使用 DShK 机枪'); HUD.setMarker(GUN_PIVOT.clone().setY(GUN_PIVOT.y + 0.4), ''); });
      }
    }
    if (ph === 'gunready' && !P.mounted && P.pos.distanceTo(GUN_PIVOT) < 2.6) prompt = '按 <kbd>F</kbd> 使用 DShK 机枪';
  } else if (ph === 'turret') {
    D.turretT += dt;
    D.sledT -= dt;
    const live = G.sleds.filter((s) => !s.dead).length;
    if ((D.sledT <= 0 && live < 5) || (live === 0 && D.sledT < 8)) { D.sledT = rr(13, 16); sledWave(); }
    if (!P.mounted && P.canMount && P.pos.distanceTo(GUN_PIVOT) < 2.6) prompt = '按 <kbd>F</kbd> 使用 DShK 机枪';
    const h = G.hind;
    if (h && ((h.hp / h.maxHp < 0.45 && D.turretT > 32) || D.turretT > 75)) enterBridge();
  } else if (ph === 'bridge') {
    D.bridgeT += dt;
    const dLoco = edgeDist(-70);
    // keep a couple of sleds harassing until the bridge is in sight
    if (dLoco > 470) {
      D.sledT -= dt;
      if (D.sledT <= 0 && G.sleds.filter((x) => !x.dead).length < 2) { D.sledT = rr(6, 9); D.sledSide *= -1; new Sled(D.sledSide, rr(95, 120), { offs: rr(-9, 7) }); }
    } else if (!D.f.sledsAway) { D.f.sledsAway = 1; for (const x of G.sleds) x.offs = 90; }
    if (!D.f.g4 && dLoco < 430) { D.f.g4 = 1; say('GRIN_04'); }
    if (!D.f.t4 && dLoco < 345) {
      D.f.t4 = 1; say('TRUCK_04');
      const h = G.hind; if (h) { h.state = 'hover'; h.stT = 0; }
      for (let i = 0; i < 4; i++) setTimeout(() => {
        if (!G.hind) return;
        const from = G.hind.pod(i, new THREE.Vector3());
        const dd = gorge.D + 38 + i * 5;
        fireRocket(from, new THREE.Vector3(0, -0.3, 1).normalize(), { speed: 110, home: () => new THREE.Vector3((i % 2 ? 1 : -1) * 1.5, 2.5, G.s - dd) });
      }, 500 + i * 220);
    }
    if (!gorge.broken && dLoco < 240) bridgeHit(); // fallback if the rockets were too far away
    if (D.f.brakeAt && D.rt > D.f.brakeAt) { D.f.brakeAt = 0; D.f.braking = true; G.vTarget = 17; G.vRate = 1.1; D.screech = loop('screech', { vol: 0.45, rev: 0.3 }); play('horn', { pos: new THREE.Vector3(0, 4.7, -66), vol: 0.8, ref: 30 }); }
    if (D.f.braking && !D.f.jumped) {
      for (let i = 0; i < 3; i++) {
        const w = T.wheelInfo[(Math.random() * T.wheelInfo.length) | 0];
        if (!w || T.cars[w.car].falling) continue;
        const x = Math.random() < 0.5 ? -0.8 : 0.8;
        G.fx.add.spawn(x, 0.45, w.pos.z + 0.4, x * rr(1, 4), rr(0.5, 3), rr(4, 12), { life: rr(0.15, 0.4), size: 0.06, c: [1, 0.75, 0.35], grav: 9, drag: 1 });
      }
    }
    if (!D.f.jumpOpen && !D.f.jumped && gorge.broken && edgeDist(P.pos.z) < 94) { D.f.jumpOpen = true; say('SAND_06'); HUD.objective('跳车！'); for (const m of G.mates) mateJump(m); }
    if (D.f.landed && P.autoLook) P.autoLook.target.set(0, -22, G.s - gorge.D - 36);
    // after the jump: hit the snow, stay down a beat, get up and take a couple of unsteady steps (no long run)
    if (D.f.landed && !D.f.ran && D.rt - D.landRT > 0.05) { D.f.ran = 1; P.prone = true; P.getUp = true; }
    if (D.f.ran === 1 && !D.f.knee && D.rt - D.landRT > 1.1) { D.f.knee = 1; P.prone = false; P.crouched = true; }
    if (D.f.ran === 1 && D.rt - D.landRT > 2.1) {
      D.f.ran = 2; P.crouched = false; P.slide = false; P.prone = false;
      const d0 = G.s - P.pos.z + 1.8, x0 = P.pos.x + 0.35;
      P.scriptMove = { x: x0, zf: () => G.s - d0, speed: 1.1 };
      P.addShake(0.25);
    }
    if (D.f.jumpOpen && !D.f.jumped) {
      prompt = '<span class="urgent">按 <kbd>空格</kbd> 跳车！</span>';
      if (hit('Space')) doJump();
      if (edgeDist(P.pos.z) < 46) { D.f.jumpOpen = false; fail('你随列车坠入了冰河。', '提示：听到“跳”的时候马上按空格。'); }
    }
    if (D.f.landed && !D.f.ending) {
      const allDown = T.cars.every((c) => c.landed);
      if ((allDown && D.t - (D.lastCarLand || 0) > 2.5) || D.t - D.landT > 16) endSequence();
    }
  }
  // fell off the train
  if (P.alive && !P.jumped && P.wasOnTrain && !P.onTrain && P.grounded && ph !== 'board') fail('你从列车上摔了下去。');
  G.otherPrompt = !!prompt;
  HUD.setPrompt(prompt || G.pickPrompt || null);
}

// debugging helpers
if (typeof window !== 'undefined') {
  window.__killAll = () => { for (const e of G.enemies) if (e.h.alive) e.h.die(new THREE.Vector3(0, 0.3, -1), J.P, 5); };
  window.__D = D;
}
