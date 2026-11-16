// Part 1 "坍塌" (collapsed mine) and Part 2 "升井" (cage elevator + blizzard yard + BTR).
import { G, THREE, rr, ri, clamp, damp, lerp, smooth, yawOf, angDiff, reseed, mulberry32 } from './core.js';
import { hit, key } from './input.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { W } from './world.js';
import { J } from './humans.js';
import { Mate, TOK, shootAtPlayer } from './ai.js';
import { explodeAt } from './vehicles.js';
import { P, resetPlayer } from './player.js';
import { play, loop, musicMode, A } from './audio.js';
import { HUD } from './hud.js';
import { D, LINES, say, after, afterReal, startCheckpoint } from './director.js';
import { T } from './train.js';
import { WP, resetWeapons, giveWeapon } from './weapon.js';
import { los, addBox, rayBoxes } from './physics.js';
import { Raider, mateCustom, goMate, placeMate, prep, clear5 } from './part5.js';
import { hideStation } from './station.js';

Object.assign(LINES, {
  P1_TRUCK_00: ['TRUCK', 'Sandman. Sandman! You with us, boss?', 'Sandman。Sandman！头儿，还清醒吗？'],
  P1_GRIN_01: ['GRINCH', "Whole mountain came down. Price got the President out — bird's long gone.", '整座山都塌了。Price 把总统带出去了——直升机早飞了。'],
  P1_SAND_02: ['SANDMAN', 'Then we walk out. Truck, take point.', '那就自己走出去。Truck，打头。'],
  P1_TRUCK_01: ['TRUCK', 'Lights ahead. Not ours.', '前面有灯光。不是我们的人。'],
  P1_SAND_03: ['SANDMAN', "Makarov's men. Weapons free.", '马卡洛夫的人。自由开火。'],
  P1_GRIN_02: ['GRINCH', 'Office on the right. They were hauling something out of here in a hurry.', '右边有间办公室。他们急着把什么东西运出去。'],
  P1_GRIN_03: ['GRINCH', 'Flight manifests, wire transfers… all pointing at one word. "Oasis."', '航班清单、转账记录……全指向同一个词：「绿洲」。'],
  P1_SAND_04: ['SANDMAN', "That's where Makarov's running. Price needs this.", '马卡洛夫就是往那儿跑的。得让 Price 知道。'],
  P1_TRUCK_02: ['TRUCK', 'Cage elevator, north end. Still got power.', '北头有罐笼，还通着电。'],
  P1_SAND_05: ['SANDMAN', "Everybody in. We're going up.", '全员进笼。我们上去。'],
  P2_GRIN_01: ['GRINCH', 'Anybody else think elevator music would help?', '有人觉得这时候放点电梯音乐会好点吗？'],
  P2_TRUCK_03: ['TRUCK', 'Radios are fried. No comms, no extraction.', '电台全烧了。联系不上，也没人来接。'],
  P2_SAND_01: ['SANDMAN', 'Ore train in the rail yard runs north, past the old radar station. That dish can reach Price.', '货场那列运矿车往北开，会经过旧雷达站。那口天线能联系上 Price。'],
  P2_TRUCK_01: ['TRUCK', "Top's hot. Get ready.", '上面有人。准备好。'],
  P2_TRUCK_02: ['TRUCK', 'BTR! Get off the road!', 'BTR！离开路面！'],
  P2_GRIN_02: ['GRINCH', 'Sandman — RPGs in the hoist house! Kill that thing!', 'Sandman——提升机房里有 RPG！干掉那铁家伙！'],
  P2_GRIN_03: ['GRINCH', 'Scratch one BTR!', 'BTR 报销了！'],
  P2_SAND_03: ['SANDMAN', 'Rail yard. Move, move!', '去货场。快，快！'],
});

const CV = { root: {}, lights: [], look: null, flash: null, cover: [], cols: [], lvl: 0 };
const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const flat = () => 0;
const surfGround = (x, z) => 0.5 * Math.sin(x * 0.045) * Math.cos(z * 0.035) + 0.25 * Math.sin(x * 0.13 + z * 0.09) + (Math.abs(x) > 40 ? (Math.abs(x) - 40) * 0.12 : 0);

// ---------- look (fog / light) ----------
function saveLook() {
  if (CV.look) return;
  const u = W.sky.material.uniforms;
  CV.look = { fog: W.fogColor.clone(), fogT: W.fogTarget, top: u.top.value.clone(), bot: u.bot.value.clone(), sunI: W.sun.intensity, hemiS: W.hemi.color.clone(), hemiG: W.hemi.groundColor.clone(), hemiI: W.hemi.intensity, exp: G.renderer.toneMappingExposure, env: G.scene.environmentIntensity ?? 1 };
}
function setLook(o) {
  const u = W.sky.material.uniforms;
  W.fogColor.set(o.fog); G.scene.fog.color.set(o.fog); G.scene.background.set(o.bg ?? o.fog); u.bot.value.set(o.fog);
  if (o.top) u.top.value.set(o.top);
  W.fogTarget = W.fogDensity = o.density; G.scene.fog.density = o.density;
  W.sun.intensity = o.sun; W.hemi.color.set(o.hemi[0]); W.hemi.groundColor.set(o.hemi[1]); W.hemi.intensity = o.hemi[2];
  G.renderer.toneMappingExposure = o.exp; G.scene.environmentIntensity = o.env;
  W.sky.visible = !!o.sky; W.snow.visible = !!o.snow; if (W.mtn) W.mtn.visible = !!o.sky; if (W.drift) W.drift.forEach((d) => (d.visible = !!o.snow));
}
function restoreLook() {
  const s = CV.look; if (!s) return; CV.look = null;
  setLook({ fog: s.fog, top: s.top, density: s.fogT, sun: s.sunI, hemi: [s.hemiS, s.hemiG, s.hemiI], exp: s.exp, env: s.env, sky: true, snow: true });
  W.sky.material.uniforms.bot.value.copy(s.bot);
}
function lights(list) {
  for (const l of CV.lights) l.parent && l.parent.remove(l);
  CV.lights.length = 0;
  for (const [x, y, z, c, i, r] of list) { const l = new THREE.PointLight(c, i, r, 1.7); l.position.set(x, y, z); G.scene.add(l); CV.lights.push(l); }
}
function flashlight(on) {
  if (on && !CV.flash) {
    const s = new THREE.SpotLight(0xfff1dc, 55, 34, 0.42, 0.55, 1.6);
    s.position.set(0.18, -0.12, 0); s.target.position.set(0.05, -0.1, -1);
    G.camera.add(s); G.camera.add(s.target); CV.flash = s; CV.lights.push(s);
  }
}

// ---------- geometry helpers ----------
let B;
function solid(x0, y0, z0, x1, y1, z1, key, color, mat = 'rock', vis = true) { if (vis) B.box(x0, y0, z0, x1, y1, z1, key, color); CV.cols.push([x0, y0, z0, x1, y1, z1, mat]); }
function cover(x, z, tier, list) { (list || CV.cover).push({ x, z, tier, used: null }); }

// ---------- Part 1: the mine ----------
function buildMine() {
  const g = new THREE.Group(); G.scene.add(g); CV.root.mine = g;
  CV.cols = []; CV.coverMine = []; CV.cover = CV.coverMine;
  B = new Builder();
  const RK = 0x6c625a, RK2 = 0x58504a;
  // main gallery x -3.5..3.5, z -100..2, H 4.5
  solid(-5.5, 0, -100, -3.5, 4.5, 2, 'rock', RK); solid(3.5, 0, -56, 5.5, 4.5, 2, 'rock', RK); solid(3.5, 0, -100, 5.5, 4.5, -68, 'rock', RK);
  solid(3.5, 3.2, -68, 5.5, 4.5, -56, 'rock', RK);                       // over the office opening
  solid(-5.5, 4.5, -100, 5.5, 6, 2, 'rock', RK2, 'rock');
  solid(-5.5, 0, 2, 5.5, 4.5, 4, 'rock', RK2);                            // collapse behind the start
  for (let i = 0; i < 26; i++) B.sphere(rr(-3.2, 3.2), rr(0.2, 2.6), rr(0.6, 2.2), rr(0.5, 1.3), 'rock', RK, 1, rr(0.6, 1), 1, 7);
  B.box(-3.5, -0.05, -100, 3.5, 0.02, 2, 'gravel', 0x77706a);
  // rails + sleepers
  for (const x of [-0.62, 0.62]) B.box(x - 0.04, 0.02, -124, x + 0.04, 0.14, 1, 'steel', 0x6a6e70);
  for (let z = 0; z > -124; z -= 0.9) B.boxC(0, 0.04, z, 1.8, 0.07, 0.22, 'wood', 0x4e4032);
  // timber sets every 5 m
  for (let z = -2; z > -99; z -= 5) {
    if (z < -55 && z > -69) continue;
    for (const sx of [-1, 1]) solid(sx * 3.25 - 0.13, 0, z - 0.13, sx * 3.25 + 0.13, 4.3, z + 0.13, 'wood', 0x6a5640, 'wood');
    B.boxC(0, 4.36, z, 7.0, 0.26, 0.3, 'wood', 0x6a5640);
  }
  // lamps along the gallery
  for (let z = -6; z > -124; z -= 10) { B.sphere(1.5, 4.0, z, 0.09, 'lamp', 0, 1, 1, 1, 8); B.cyl(1.5, 4.25, z, 0.01, 0.01, 0.4, 'steel', 0x222222); }
  // ore carts and rubble (cover)
  const cart = (x, z) => { solid(x - 0.65, 0.1, z - 1.1, x + 0.65, 1.35, z + 1.1, 'pRust', 0xffffff, 'metal'); B.boxC(x, 1.25, z, 1.1, 0.25, 1.9, 'ore', 0xffffff); for (const sz of [-0.7, 0.7]) for (const sx of [-0.55, 0.55]) B.cyl(x + sx, 0.25, z + sz, 0.22, 0.22, 0.12, 'dark', 0x222222, 0, 0, Math.PI / 2, 10); };
  const rub = (x, z, s = 1) => { for (let i = 0; i < 6; i++) B.sphere(x + rr(-0.6, 0.6) * s, rr(0.2, 0.6) * s, z + rr(-0.6, 0.6) * s, rr(0.35, 0.7) * s, 'rock', RK, 1, 0.7, 1, 7); CV.cols.push([x - 0.9 * s, 0, z - 0.9 * s, x + 0.9 * s, 1.05 * s, z + 0.9 * s, 'rock']); };
  cart(-1.0, -38); cart(1.0, -47); cart(-0.6, -84); cart(0.8, -92);
  rub(2.3, -30); rub(-2.4, -52); rub(-2.4, -77); rub(2.4, -95); rub(2.2, -14, 0.8);
  for (const [x, z, t] of [[-1.0, -40.6, 0], [1.0, -49.6, 0], [-2.4, -54.2, 0], [2.3, -32.2, 1], [-1.0, -35.4, 1], [1.0, -44.4, 1]]) cover(x, z, t);
  CV.coverB = [];
  for (const [x, z, t] of [[-0.6, -86.6, 1], [0.8, -94.6, 1], [-2.4, -79.2, 1], [2.4, -97.2, 1]]) cover(x, z, t, CV.coverB);
  // office (east): x 3.5..11, z -68..-56, H 3.2
  solid(3.5, 0, -69.5, 12.5, 3.2, -68, 'concrete', 0x77736b); solid(3.5, 0, -56, 12.5, 3.2, -54.5, 'concrete', 0x77736b); solid(11, 0, -68, 12.5, 3.2, -56, 'concrete', 0x77736b);
  solid(3.5, 0, -68, 3.6, 3.2, -63.5, 'concrete', 0x77736b); solid(3.5, 0, -59.5, 3.6, 3.2, -56, 'concrete', 0x77736b);
  solid(3.5, 3.2, -69.5, 12.5, 3.6, -54.5, 'concrete', 0x5d5a54);
  B.box(3.5, -0.05, -68, 11, 0.04, -56, 'concrete', 0x5f5c56);
  solid(7.0, 0, -63.4, 9.6, 0.82, -61.8, 'wood', 0x6e5a42, 'wood');
  B.boxC(8.3, 0.84, -62.6, 0.42, 0.03, 0.3, 'dark', 0x1c1c1c); B.boxC(8.3, 1.0, -62.76, 0.42, 0.28, 0.02, 'screen', 0);
  for (let i = 0; i < 3; i++) solid(10.4, 0, -67.5 + i * 0.9, 10.95, 1.6, -66.7 + i * 0.9, 'steel', 0x5f665f, 'metal');
  B.boxC(7.3, 1.8, -68 + 0.06, 2.4, 1.3, 0.04, 'wood', 0xb8a98a);
  for (let i = 0; i < 6; i++) solid(4.2 + (i % 3) * 0.9, 0, -67.6 + Math.floor(i / 3) * 0.9, 5.0 + (i % 3) * 0.9, 0.8, -66.8 + Math.floor(i / 3) * 0.9, 'crate', 0xffffff, 'wood');
  CV.laptop = new THREE.Vector3(8.3, 0, -61.4);
  // cavern x -10..10, z -126..-100, H 7
  solid(-11.5, 0, -127.5, 11.5, 7, -126, 'rock', RK); solid(-11.5, 0, -126, -10, 7, -100, 'rock', RK); solid(10, 0, -126, 11.5, 7, -100, 'rock', RK);
  solid(-11.5, 0, -101.5, -3.5, 7, -100, 'rock', RK); solid(3.5, 0, -101.5, 11.5, 7, -100, 'rock', RK);
  solid(-11.5, 7, -127.5, 11.5, 8.5, -100, 'rock', RK2);
  B.box(-10, -0.05, -126, 10, 0.02, -100, 'gravel', 0x6f6862);
  for (const [x, z, r] of [[-5.5, -108, 1.1], [5.2, -111, 1.2], [-4.5, -118, 1.0], [6.2, -119.5, 1.1]]) { B.cyl(x, 3.5, z, r, r * 1.2, 7, 'rock', RK, 0, 0, 0, 10); CV.cols.push([x - r, 0, z - r, x + r, 7, z + r, 'rock']); cover(x, z - r - 0.6, 0, CV.coverB); }
  solid(-9.5, 1.0, -104.6, -2.5, 1.6, -103.6, 'steel', 0x585c5e, 'metal'); for (let x = -9; x < -2.5; x += 2) solid(x - 0.1, 0, -104.2, x + 0.1, 1.0, -104.0, 'steel', 0x484c4e, 'metal', true);
  cover(-6, -105.4, 0, CV.coverB);
  for (const [x, z] of [[7.5, -105], [-8, -114], [8, -124]]) { solid(x - 0.6, 0, z - 0.6, x + 0.6, 1.2, z + 0.6, 'crate', 0xffffff, 'wood'); cover(x, z - 1.2, 0, CV.coverB); }
  // cage elevator at the north wall
  const CZ = -121.5;
  for (const [x, z] of [[-1.7, CZ - 1.6], [1.7, CZ - 1.6], [-1.7, CZ + 1.6], [1.7, CZ + 1.6]]) B.cyl(x, 3.5, z, 0.06, 0.06, 7, 'steel', 0x8a6a2a);
  for (let y = 0.4; y < 3; y += 0.5) { B.boxC(-1.7, y, CZ, 0.04, 0.04, 3.2, 'steel', 0x8a6a2a); B.boxC(1.7, y, CZ, 0.04, 0.04, 3.2, 'steel', 0x8a6a2a); B.boxC(0, y, CZ - 1.6, 3.4, 0.04, 0.04, 'steel', 0x8a6a2a); }
  B.box(-1.7, 0, CZ - 1.6, 1.7, 0.12, CZ + 1.6, 'steel', 0x5c5e60); B.box(-1.8, 2.9, CZ - 1.7, 1.8, 3.0, CZ + 1.7, 'steel', 0x5c5e60);
  CV.cols.push([-1.9, 0, CZ - 1.75, 1.9, 3.0, CZ - 1.55, 'metal'], [-1.9, 0, CZ - 1.6, -1.65, 3, CZ + 1.6, 'metal'], [1.65, 0, CZ - 1.6, 1.9, 3, CZ + 1.6, 'metal']);
  CV.cage = new THREE.Vector3(0, 0, CZ);
  B.build({ ...M, lamp: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc77a, emissiveIntensity: 7 }), screen: new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7de0ff, emissiveIntensity: 2.5 }) }, g);
  CV.colsMine = CV.cols;
}

// ---------- Part 2: hoist house + yard ----------
function truckLike(b, x, z, ry) { b.boxC(x, 1.4, z, 2.6, 2.2, 7, 'paint', 0x8a6a2a, 0, ry, 0, 0.1); b.boxC(x, 2.7, z, 2.4, 0.15, 6.6, 'snow', 0xffffff, 0, ry, 0); }
function buildSurface() {
  const g = new THREE.Group(); G.scene.add(g); CV.root.surf = g;
  CV.cols = []; CV.coverS = []; CV.cover = CV.coverS;
  B = new Builder();
  const terr = new THREE.PlaneGeometry(500, 500, 120, 120).rotateX(-Math.PI / 2);
  const p = terr.attributes.position, uv = terr.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, surfGround(x, z) - 0.02); uv.setXY(i, x / 9, z / 9); }
  terr.computeVertexNormals();
  const tm = new THREE.Mesh(terr, W.mat.snow); tm.receiveShadow = true; g.add(tm);
  const CON = 0x8e8a82;
  // hoist house x -8..8, z -6..10, H 9 ; big door north x -3..3
  solid(-8.5, 0, 9.5, 8.5, 9, 10.5, 'concrete', CON, 'concrete');
  solid(-8.5, 0, -6.5, -8, 9, 10, 'concrete', CON, 'concrete'); solid(8, 0, -6.5, 8.5, 9, 10, 'concrete', CON, 'concrete');
  solid(-8, 0, -6.5, -3, 9, -6, 'concrete', CON, 'concrete'); solid(3, 0, -6.5, 8, 9, -6, 'concrete', CON, 'concrete'); solid(-3, 4.2, -6.5, 3, 9, -6, 'concrete', CON, 'concrete');
  solid(-8.5, 9, -6.5, 8.5, 9.4, 10.5, 'steel', 0x6b6e66, 'metal'); B.boxC(0, 9.5, 2, 17, 0.1, 16.8, 'snow', 0xffffff);
  B.box(-8, -0.02, -6, 8, 0.06, 9.5, 'concrete', 0x6a675f);
  solid(-6.5, 0, 2.5, -3.5, 2.6, 7.5, 'paint', 0x5d6a4a, 'metal'); B.cyl(-5, 3.6, 5, 1.4, 1.4, 4.4, 'steel', 0x5a5e60, Math.PI / 2, 0, 0, 18);
  // headframe tower above the shaft
  for (const [x, z] of [[-2.2, 4.2], [2.2, 4.2], [-2.2, 8.2], [2.2, 8.2]]) B.cyl(x, 14, z, 0.18, 0.18, 10, 'pRust', 0xffffff);
  B.cyl(0, 19, 6.2, 2.0, 2.0, 0.4, 'pRust', 0xffffff, 0, 0, Math.PI / 2, 20);
  // cage at the surface (its own group so it stays visible during the ride)
  const CZ = 6.2, cg = new THREE.Group(), cb = new Builder();
  for (const [x, z] of [[-1.7, CZ - 1.6], [1.7, CZ - 1.6], [-1.7, CZ + 1.6], [1.7, CZ + 1.6]]) cb.cyl(x, 1.5, z, 0.06, 0.06, 3, 'steel', 0x8a6a2a);
  for (let y = 0.4; y < 3; y += 0.5) { cb.boxC(-1.7, y, CZ, 0.04, 0.04, 3.2, 'steel', 0x8a6a2a); cb.boxC(1.7, y, CZ, 0.04, 0.04, 3.2, 'steel', 0x8a6a2a); cb.boxC(0, y, CZ + 1.6, 3.4, 0.04, 0.04, 'steel', 0x8a6a2a); }
  cb.box(-1.8, 2.9, CZ - 1.7, 1.8, 3.0, CZ + 1.7, 'steel', 0x5c5e60); cb.box(-1.7, -0.02, CZ - 1.6, 1.7, 0.06, CZ + 1.6, 'steel', 0x5c5e60);
  const gate = new THREE.Group(), gb = new Builder();
  for (let x = -1.5; x <= 1.5; x += 0.3) gb.boxC(x, 1.4, CZ - 1.6, 0.03, 2.8, 0.03, 'steel', 0x8a6a2a);
  gb.boxC(0, 2.75, CZ - 1.6, 3.3, 0.05, 0.05, 'steel', 0x8a6a2a); gb.build(M, gate); cg.add(gate); CV.gate = gate;
  cb.build(M, cg); G.scene.add(cg); CV.cageGrp = cg; cg.visible = false;
  CV.cols.push([-1.9, 0, CZ - 1.6, -1.65, 3, CZ + 1.6, 'metal'], [1.65, 0, CZ - 1.6, 1.9, 3, CZ + 1.6, 'metal'], [-1.9, 0, CZ + 1.55, 1.9, 3, CZ + 1.75, 'metal']);
  CV.cage2 = new THREE.Vector3(0, 0, CZ);
  // RPG crate by the door
  solid(4.4, 0, -5.4, 6.2, 0.7, -4.4, 'paint', 0x4f5b3f, 'metal'); B.boxC(5.3, 0.78, -4.9, 1.0, 0.1, 0.16, 'pGreen', 0xffffff); B.cyl(5.3, 0.84, -4.9, 0.04, 0.012, 0.22, 'pGreen', 0xffffff, 0, 0, Math.PI / 2);
  CV.rpgPos = new THREE.Vector3(5.3, 0, -3.6);
  // yard: sheds, trucks, crates, conveyor, blocks
  const shed = (x, z, w, d, h) => { solid(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, 'concrete', 0x8a867e, 'concrete'); B.boxC(x, h + 0.08, z, w + 0.4, 0.16, d + 0.4, 'snow', 0xffffff); for (const [cx, cz] of [[x, z + d / 2 + 0.7], [x, z - d / 2 - 0.7], [x - w / 2 - 0.7, z], [x + w / 2 + 0.7, z]]) cover(cx, cz, 1); };
  shed(-16, -30, 8, 6, 4); shed(15, -48, 7, 9, 4.5); shed(-14, -78, 10, 6, 5); shed(17, -96, 8, 6, 4);
  for (const [x, z, ry] of [[9, -22, 0.2], [-8, -60, -0.3], [8, -84, 0.1]]) { truckLike(B, x, z, ry); CV.cols.push([x - 1.8, 0, z - 3.6, x + 1.8, 2.5, z + 3.6, 'metal']); cover(x - 2.4, z, 0); cover(x + 2.4, z, 0); }
  for (const [x, z] of [[-4, -40], [5, -66], [-5, -102], [4, -115], [-20, -55], [22, -70]]) { solid(x - 1.1, 0, z - 0.35, x + 1.1, 1.0, z + 0.35, 'concrete', 0xa09d94, 'concrete'); cover(x, z - 0.9, 0); cover(x, z + 0.9, 1); }
  for (const [x, z] of [[-9, -18], [12, -36], [-2, -88], [11, -110]]) { solid(x - 0.7, 0, z - 0.7, x + 0.7, 1.4, z + 0.7, 'crate', 0xffffff, 'wood'); cover(x, z - 1.3, 0); }
  // conveyor gantry
  for (let z = -16; z > -112; z -= 12) for (const sx of [-1, 1]) solid(-26 + sx * 1.2 - 0.15, 0, z - 0.15, -26 + sx * 1.2 + 0.15, 6.2, z + 0.15, 'steel', 0x6a5a3a, 'metal');
  B.box(-27.8, 6.2, -116, -24.2, 7.6, -10, 'paint', 0x7a6a4a);
  // rail yard (north)
  for (const x of [-60, 60]) for (const z of [-140, -141.5]) B.box(-90, 0.1, z - 0.04, 90, 0.22, z + 0.04, 'steel', 0x6a6e70);
  for (let x = -90; x < 90; x += 0.9) B.boxC(x, 0.08, -140.75, 0.22, 0.08, 2.6, 'wood', 0x4e4032);
  for (const x of [-30, 34]) { B.boxC(x, 2.2, -146, 13, 3.4, 2.9, 'paint', 0x6e3a2a, 0, Math.PI / 2 * 0 + 0, 0); }
  // perimeter scatter
  const rng = mulberry32(77);
  const tg = [W.geo.tree1, W.geo.tree2], mt = [[], []];
  for (let i = 0; i < 160; i++) { const x = (rng() < 0.5 ? -1 : 1) * (42 + rng() * 120), z = 30 - rng() * 240; const s = 0.7 + rng() * 0.7; mt[i % 2].push(new THREE.Matrix4().compose(new THREE.Vector3(x, surfGround(x, z) - 0.3, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s))); }
  tg.forEach((geo, k) => { const im = new THREE.InstancedMesh(geo, W.mat.tree, mt[k].length); mt[k].forEach((m, i) => im.setMatrixAt(i, m)); im.computeBoundingSphere(); im.castShadow = true; g.add(im); });
  B.build({ ...M }, g);
  // shaft walls for the ride up (a separate group scrolled during the elevator phase)
  const sh = new THREE.Group(), sb = new Builder();
  for (let k = 0; k < 14; k++) {
    const y = -k * 6;
    sb.box(-3, y - 6, CZ - 3, -2.4, y, CZ + 3, 'rock', 0x5c544c); sb.box(2.4, y - 6, CZ - 3, 3, y, CZ + 3, 'rock', 0x5c544c);
    sb.box(-3, y - 6, CZ - 3, 3, y, CZ - 2.4, 'rock', 0x5c544c); sb.box(-3, y - 6, CZ + 2.4, 3, y, CZ + 3, 'rock', 0x5c544c);
    sb.boxC(0, y - 0.5, CZ - 2.38, 4.6, 0.25, 0.1, 'wood', 0x5a4632); if (k % 2 === 0) sb.sphere(2.3, y - 2, CZ, 0.1, 'lamp', 0, 1, 1, 1, 8);
  }
  sb.build({ ...M, lamp: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc77a, emissiveIntensity: 7 }) }, sh);
  sh.visible = false; G.scene.add(sh); CV.shaft = sh;
  CV.colsSurf = CV.cols;
}

// ---------- BTR-80 ----------
const _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
class BTR {
  constructor(path) {
    this.isSled = true; this.kind = 'btr'; this.path = path.map(([x, z]) => new THREE.Vector3(x, 0, z)); this.i = 1; this.dir = 1;
    this.pos = this.path[0].clone(); this.yaw = Math.PI; this.v = 0; this.hp = 1900; this.dead = false; this.driver = null; this.gunner = null;
    const g = new THREE.Group(), b = new Builder();
    b.boxC(0, 1.25, 0, 2.7, 1.1, 7.4, 'paint', 0x5d6a4a, 0, 0, 0, 0.12);
    b.boxC(0, 1.15, -3.85, 2.4, 0.8, 0.6, 'paint', 0x5d6a4a, -0.5, 0, 0, 0.06);
    b.boxC(0, 2.0, 0.2, 2.3, 0.5, 6.0, 'paint', 0x5d6a4a, 0, 0, 0, 0.1);
    b.boxC(0, 2.28, 0.2, 2.1, 0.06, 5.6, 'snow', 0xffffff);
    for (const z of [-2.6, -1.0, 1.0, 2.6]) for (const sx of [-1, 1]) b.cyl(sx * 1.32, 0.55, z, 0.55, 0.55, 0.4, 'dark', 0x1c1c1c, 0, 0, Math.PI / 2, 14);
    b.build(M, g);
    const tur = new THREE.Group(); tur.position.set(0, 2.3, -0.8); g.add(tur);
    const tb = new Builder(); tb.cyl(0, 0.3, 0, 0.75, 0.85, 0.6, 'paint', 0x56633f, 0, 0, 0, 16); tb.cyl(0, 0.35, -1.2, 0.07, 0.07, 1.8, 'dark', 0x222222, Math.PI / 2, 0, 0, 10); tb.build(M, tur);
    this.tur = tur; this.group = g; G.scene.add(g);
    this.snd = loop('train', { pos: this.pos, vol: 0.55, ref: 10, rate: 0.6 });
    this.fireT = 3; this.burst = 0;
    G.sleds.push(this);
  }
  update(dt) {
    const g = this.group;
    if (this.dead) { if (Math.random() < 0.5) G.fx.smoke(_e.set(0, 2.4, 0).applyMatrix4(g.matrixWorld), { size: 1.6, grow: 4, life: 4, color: 0x141312, alpha: 0.55, vy: 2.2, wind: 1 }); if (Math.random() < 0.5) { _e.set(rr(-1, 1), 2, rr(-2, 2)).applyMatrix4(g.matrixWorld); G.fx.add.spawn(_e.x, _e.y, _e.z, 0, 2, 0, { life: 0.35, size: 1.1, c: [1, 0.5, 0.15], alpha: 1 }); } return; }
    // patrol back and forth along the yard road
    const tgt = this.path[this.i];
    _d.subVectors(tgt, this.pos).setY(0); const dist = _d.length();
    if (dist < 2) { if (this.i + this.dir >= this.path.length || this.i + this.dir < 0) this.dir *= -1; this.i += this.dir; this.pause = 2.5; }
    this.pause = (this.pause || 0) - dt;
    const ty = Math.atan2(-_d.x, -_d.z);
    this.yaw += clamp(angDiff(this.yaw, ty), -0.9 * dt, 0.9 * dt);
    this.v = damp(this.v, this.pause > 0 ? 0 : 4.5 * clamp(1 - Math.abs(angDiff(this.yaw, ty)), 0.2, 1), 1.5, dt);
    this.pos.x += -Math.sin(this.yaw) * this.v * dt; this.pos.z += -Math.cos(this.yaw) * this.v * dt; this.pos.y = surfGround(this.pos.x, this.pos.z);
    g.position.copy(this.pos); g.rotation.set(0, this.yaw, 0); g.updateMatrixWorld(true);
    this.snd.setPos(this.pos);
    // turret tracks the player; heavy MG bursts when it can see you
    const mz = _v.set(0, 2.65, -3.2).applyMatrix4(g.matrixWorld);
    _e.subVectors(P.eye, mz); const pd = _e.length();
    const want = Math.atan2(-_e.x, -_e.z) - this.yaw;
    this.tur.rotation.y += clamp(angDiff(this.tur.rotation.y, want), -1.1 * dt, 1.1 * dt);
    this.fireT -= dt;
    const aimed = Math.abs(angDiff(this.tur.rotation.y, want)) < 0.12;
    if (this.fireT <= 0 && P.alive && pd < 110) {
      const tmz = _d.set(0, 0.35, -2.1).applyMatrix4(this.tur.matrixWorld);
      if (this.burst <= 0) { if (aimed && los(tmz, P.eye)) { this.burst = 7; this.fireT = 0.6; } else this.fireT = 0.5; }
      else { this.burst--; this.fireT = this.burst > 0 ? 0.13 : rr(1.6, 2.6); shootAtPlayer(tmz.clone(), { dmg: 17, acc: 0.75, snd: 'dshk_far', vol: 1.2, flash: 2.6, width: 0.06, tracer: 0.8 }); }
    }
    if (P.alive && this.v > 1 && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 2.6) { P.damage(60, this.pos); P.addShake(0.8); }
  }
  hurt(dmg, dir) { if (this.dead) return false; if (dmg < 300) { if (Math.random() < 0.3) play('metal', { pos: this.pos, vol: 0.8, ref: 6 }); return false; } this.hp -= dmg; if (this.hp <= 0) { this.wreck(); return true; } play('metal', { pos: this.pos, vol: 1.2, ref: 10 }); return false; }
  wreck() {
    this.dead = true; this.snd.stop();
    explodeAt(this.pos.clone().setY(this.pos.y + 1.8), 2.8, 10, 90);
    this.group.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); } });
    this.tur.rotation.z = 0.4; this.tur.position.y += 0.2;
    CV.cols.push([this.pos.x - 1.6, 0, this.pos.z - 1.6, this.pos.x + 1.6, 2.4, this.pos.z + 1.6]);
    const c = CV.cols[CV.cols.length - 1]; addBox(c[0], c[1], c[2], c[3], c[4], c[5], 'metal');
    if (G.p2BtrDown) G.p2BtrDown();
  }
  rayTest(o, d, max) {
    _inv.copy(this.group.matrixWorld).invert(); _lo.copy(o).applyMatrix4(_inv); _ld.copy(d).transformDirection(_inv);
    let t0 = 0, t1 = max;
    for (const [oo, dd, lo, hi] of [[_lo.x, _ld.x, -1.4, 1.4], [_lo.y, _ld.y, 0.4, 2.7], [_lo.z, _ld.z, -4.2, 3.7]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
    }
    return { t: t0, mat: 'metal', normal: d.clone().negate() };
  }
  remove() { G.scene.remove(this.group); this.snd.stop(); }
}

// ---------- level enter/leave ----------
function enterCave(lvl) {
  if (G.leavePart5) G.leavePart5();
  hideStation();
  if (G.lvl === 2 || !G.lvl) for (const c of T.cars) c.group.visible = false;
  for (const c of T.cars) c.group.visible = false;
  if (T.wheels) T.wheels.visible = false; if (T.dshk) T.dshk.yaw.visible = false;
  G.lvl = lvl; G.v = 0; G.vTarget = 0; G.s = 0;
  saveLook();
  if (lvl === 1) {
    if (!CV.root.mine) buildMine();
    G.groundFn = flat;
    setLook({ fog: 0x0d0b09, bg: 0x050403, density: 0.04, sun: 0, hemi: [0x8a7a66, 0x2a221a, 0.34], exp: 1.2, env: 0.22, sky: false, snow: false });
    lights([[1.5, 3.6, -8, 0xffc27a, 14, 18], [1.5, 3.6, -30, 0xffc27a, 12, 16], [1.5, 3.6, -50, 0xffb070, 12, 16], [7.5, 2.8, -62, 0xffe2b8, 10, 12], [1.5, 3.6, -82, 0xffc27a, 12, 16], [0, 6, -112, 0xffb070, 22, 26]]);
    flashlight(true);
  } else {
    if (!CV.root.surf) buildSurface();
    G.groundFn = surfGround;
    setLook({ fog: 0xa9b5c0, top: 0x6f7d8b, density: 0.026, sun: 1.1, hemi: [0xd4e0ec, 0x5e646b, 0.75], exp: 1.0, env: 0.8, sky: true, snow: true });
    lights([]);
  }
  for (const k of Object.keys(CV.root)) CV.root[k].visible = (k === 'mine') === (lvl === 1);
  CV.cols = lvl === 1 ? CV.colsMine : CV.colsSurf;
  CV.cover = lvl === 1 ? CV.coverMine : CV.coverS;
  if (CV.shaft) CV.shaft.visible = false;
  if (CV.cageGrp) { CV.cageGrp.visible = lvl === 3; CV.gate.position.y = 0; }
}
G.leaveCave = () => {
  if (G.lvl !== 1 && G.lvl !== 3) return;
  clear5();
  for (const k of Object.keys(CV.root)) CV.root[k].visible = false;
  if (CV.shaft) CV.shaft.visible = false;
  if (CV.cageGrp) CV.cageGrp.visible = false;
  if (CV.flash) { G.camera.remove(CV.flash); G.camera.remove(CV.flash.target); CV.flash = null; }
  lights([]);
  restoreLook();
  if (T.wheels) T.wheels.visible = true; if (T.dshk) T.dshk.yaw.visible = true;
  for (const c of T.cars) c.group.visible = true;
  G.groundFn = null; G.lvl = 2;
};
function colliders() { for (const c of CV.cols) addBox(c[0], c[1], c[2], c[3], c[4], c[5], c[6] || 'rock'); for (const l of [CV.coverMine, CV.coverB, CV.coverS]) if (l) for (const c of l) c.used = null; }

function makeMates() {
  const t = new Mate('TRUCK', 'head_truck', [0, 0]), g = new Mate('GRINCH', 'head_grinch', [0, 0]);
  for (const m of [t, g]) { prep(m.h); m.custom = mateCustom(m); m.p5 = 'idle'; m.cs = 'crouch'; m.ct = rr(0.5, 2); m.yaw0 = 0; }
  D.truck = t; D.grinch = g;
  return [t, g];
}
const alive = () => G.enemies.filter((e) => e.h.alive).length;
function squad(list, cover, maxTier = 1, o = {}) { for (const [x, z] of list) new Raider(x, z, { cover, maxTier, ...o }); }

G.startCave = (k, cont) => {
  reseed(7000 + k);
  const lvl = k < 20 ? 1 : 3;
  enterCave(lvl);
  clear5();
  colliders();
  G.levelUpdate = lvl === 1 ? updateMine : updateSurface;
  D.ck = k; D.t = 0; D.rt = 0; D.phase = 'cave';
  G.state = 'play'; G.paused = false;
  const C = (D.cv = { ph: '', t: 0 });
  const [t, g] = makeMates();
  resetWeapons();
  if (!G.stats || (!cont && k === 10)) G.stats = { shots: 0, hits: 0, kills: 0, deaths: G.stats ? G.stats.deaths || 0 : 0, t0: G.real };
  HUD.fade(1, 0); setTimeout(() => HUD.fade(0, k === 10 ? 4 : 1.5), 50);
  if (k === 10) {
    resetPlayer(new THREE.Vector3(-0.5, 0, -2.5), 0);
    P.prone = true; P.getUp = true; P.pitch = 0.5;
    placeMate(t, 0.9, -3.9); placeMate(g, -1.2, -6.8);
    t.h.crouchT = 1; t.p5 = 'kneel'; t.look = new THREE.Vector3(-0.5, 0, -2.5);
    C.ph = 'wake';
    musicMode('p1dark');
    after(1.0, () => HUD.locCard(['坍塌', '西伯利亚 · 钻石矿 · 地下 430 米', '“Sandman” 军士长 · 三角洲部队 · Metal 0-1', '“弃于寒冬” · 第一部分']));
    say('P1_TRUCK_00', 1.5); say('P1_GRIN_01', 0.6); say('P1_SAND_02', 0.4);
    after(3.0, () => { P.prone = false; P.crouched = true; });
    after(4.5, () => { P.crouched = false; });
    after(9.0, () => {
      C.ph = 'adv1'; HUD.objective('带队找到出路');
      goMate(t, [[1.5, -14], [2.4, -27.6]], 'defend', 3.2); goMate(g, [[-1.6, -16], [-1.2, -33.4]], 'defend', 3);
    });
  } else if (k === 11) {
    resetPlayer(new THREE.Vector3(1.5, 0, -64), 0);
    placeMate(t, 2.6, -70); placeMate(g, -1.5, -66);
    C.ph = 'tocage'; C.intel = true;
    musicMode('p1dark');
    toCavern(true);
  } else { // 20: the cage ride up
    resetPlayer(new THREE.Vector3(0.6, 0, 6.6), 0);
    placeMate(t, 0.9, 5.2); placeMate(g, -0.8, 5.6);
    for (const m of [t, g]) { m.h.yaw = 0; m.yaw0 = 0; }
    C.ph = 'ride'; C.rideT = 0; CV.shaft.visible = true; CV.root.surf.visible = false;
    setLook({ fog: 0x0b0907, bg: 0x040302, density: 0.05, sun: 0, hemi: [0x7a6a58, 0x1a1410, 0.2], exp: 1.15, env: 0.12, sky: false, snow: false });
    lights([[0, 2.6, 6.2, 0xffd9a0, 5, 8]]);
    musicMode('p2ride');
    after(0.8, () => HUD.locCard(['升井', '西伯利亚 · 钻石矿 · 主井提升机', '“Sandman” 军士长 · 三角洲部队 · Metal 0-1', '“弃于寒冬” · 第二部分']));
    say('P2_GRIN_01', 3); say('P2_TRUCK_03', 0.8); say('P2_SAND_01', 0.8); say('P2_TRUCK_01', 1.6);
    C.rideSnd = loop('train', { vol: 0.25, rate: 0.5 });
    C.gateBox = addBox(-1.9, 0, 4.5, 1.9, 3, 4.65, 'metal');
  }
  HUD.show(true);
};

function toCavern(fromCk) {
  const C = D.cv;
  C.ph = 'tocage';
  HUD.objective('前往北面的罐笼'); HUD.setMarker(new THREE.Vector3(0, 1.6, -121.5), '');
  goMate(D.truck, [[2.5, -80], [2.8, -97.5]], 'defend', 3.4); goMate(D.grinch, [[-1.5, -78], [-2.8, -96.8]], 'defend', 3.2);
  if (fromCk) HUD.locCard(['检查点', '情报已取得']);
}

function updateMine(dt) {
  const C = D.cv; if (!C) return;
  C.t += dt;
  let prompt = null, holdK = null;
  // flickering lamp
  if (CV.lights[1]) CV.lights[1].intensity = Math.random() < 0.06 ? 0.5 : 12;
  if (C.ph === 'adv1' && P.pos.z < -20 && !C.encA) {
    C.encA = true; C.ph = 'fightA';
    squad([[-1.5, -57], [1.6, -58], [-2.2, -62], [0.4, -64], [2.2, -66], [-0.8, -70]], CV.coverMine, 1);
    say('P1_TRUCK_01', 0.2); say('P1_SAND_03', 0.2);
    after(1.5, () => musicMode('p1fight'));
    HUD.objective('清除巷道里的敌人');
  }
  if (C.ph === 'fightA' && C.t > 6 && alive() === 0) {
    C.ph = 'office';
    goMate(D.truck, [[2.6, -54.5]], 'defend', 3); goMate(D.grinch, [[-1.8, -56]], 'defend', 3);
    say('P1_GRIN_02', 1.5);
    after(2.5, () => { HUD.objective('搜查右侧的办公室'); HUD.setMarker(CV.laptop.clone().setY(1.2), ''); musicMode('p1dark'); });
  }
  if (C.ph === 'office' && Math.hypot(P.pos.x - CV.laptop.x, P.pos.z - CV.laptop.z) < 1.4) {
    prompt = '按住 <kbd>F</kbd> 取走笔记本电脑';
    if (key('KeyF')) C.hold = (C.hold || 0) + dt; else C.hold = 0;
    holdK = C.hold / 1.6;
    if (C.hold >= 1.6) {
      C.hold = 0; C.intel = true; play('magin', { vol: 0.6, rev: 0 });
      HUD.setMarker(null); HUD.bigCard('ОАЗИС', '「绿洲」—— 情报已取得', 3.5);
      say('P1_GRIN_03', 0.8); say('P1_SAND_04', 0.4); say('P1_TRUCK_02', 0.6);
      D.ck = 11; if (G.saveCk) G.saveCk(11);
      after(4, () => toCavern(false));
    }
  }
  if (C.ph === 'tocage' && !C.encB && P.pos.z < -88) {
    C.encB = true; C.ph = 'fightB';
    squad([[-6, -116], [5.5, -114], [-3.5, -122], [7, -122], [0, -124.5], [-8, -110], [3, -108]], CV.coverB, 1);
    new Raider(8.5, -125, { cover: CV.coverB, maxTier: 1, rpg: true });
    musicMode('p1fight');
    HUD.objective('杀出一条路，进入罐笼');
  }
  if (C.ph === 'fightB' && C.t > 3 && alive() === 0 && !C.cageCall) {
    C.cageCall = true; C.ph = 'board';
    say('P1_SAND_05', 0.6);
    goMate(D.truck, [[1, -113], [0.9, -122.2]], 'idle', 3.4); goMate(D.grinch, [[-1, -114], [-0.8, -121.0]], 'idle', 3.4);
    for (const m of [D.truck, D.grinch]) m.yaw0 = Math.PI;
    HUD.objective('进入罐笼'); HUD.setMarker(new THREE.Vector3(0, 1.6, -121.5), '');
  }
  if (C.ph === 'board' && Math.abs(P.pos.x) < 1.5 && P.pos.z < -120 && P.pos.z > -123.2 && !C.done) {
    C.done = true; HUD.setMarker(null); HUD.objective(null);
    play('clack', { vol: 1, rev: 0.4 }); play('bolt', { vol: 0.8 });
    HUD.fade(1, 1.6);
    afterReal(2.0, () => G.startCave(20, true));
  }
  G.otherPrompt = !!prompt;
  HUD.setHold(holdK);
  HUD.setPrompt(prompt || G.pickPrompt || null);
}

function updateSurface(dt) {
  const C = D.cv; if (!C) return;
  C.t += dt;
  let prompt = null;
  if (C.ph === 'ride') {
    C.rideT += dt;
    const k = smooth(C.rideT / 16);
    CV.shaft.position.y = -k * 70 + 2;                     // walls slide down past the cage
    P.addShake(0.004);
    if (C.rideT > 16) {
      C.ph = 'top'; CV.shaft.visible = false; CV.root.surf.visible = true;
      if (C.rideSnd) { C.rideSnd.stop(); C.rideSnd = null; }
      setLook({ fog: 0xa9b5c0, top: 0x6f7d8b, density: 0.026, sun: 1.1, hemi: [0xd4e0ec, 0x5e646b, 0.75], exp: 1.0, env: 0.8, sky: true, snow: true });
      lights([]);
      play('bolt', { vol: 0.9 }); play('clack', { vol: 0.9 });
      if (C.gateBox) C.gateBox.enabled = false; C.gateOpen = true;
      HUD.objective('冲出提升机房，赶往北面的铁路货场');
      HUD.setMarker(new THREE.Vector3(0, 1.5, -138), '货场');
      squad([[-9, -30], [10, -40], [-4, -48], [14, -60], [-12, -70], [3, -74]], CV.coverS, 1);
      new Raider(16, -95, { cover: CV.coverS, maxTier: 1, rpg: true });
      musicMode('p2fight');
      goMate(D.truck, [[0.8, 3], [1.8, -5], [4.6, -8.4]], 'defend', 3.5); goMate(D.grinch, [[-0.6, 3], [-4.5, -5.0]], 'defend', 3.5);
      for (const m of [D.truck, D.grinch]) m.yaw0 = 0;
    }
  }
  if (C.gateOpen && CV.gate.position.y < 2.6) CV.gate.position.y = Math.min(2.6, CV.gate.position.y + dt * 1.6);
  if (C.ph === 'top' && C.t > 22 && !C.btr) {
    C.btr = new BTR([[2, -130], [0, -90], [3, -55], [0, -28]]);
    say('P2_TRUCK_02', 2.0); say('P2_GRIN_02', 0.4);
    after(4, () => { HUD.objective('用 RPG 摧毁 BTR'); HUD.setMarker(CV.rpgPos.clone().setY(1.2), 'RPG'); });
  }
  if (C.btr && !C.btr.dead && WP.launch !== 'rpg' && Math.hypot(P.pos.x - CV.rpgPos.x, P.pos.z - CV.rpgPos.z) < 1.3) {
    prompt = '按 <kbd>F</kbd> 拿取 РПГ-7';
    if (hit('KeyF')) { giveWeapon('rpg', 1, 4); play('magin', { vol: 0.6, rev: 0 }); HUD.setMarker(null); HUD.toast('按 3 切换 RPG，直接瞄准 BTR 发射'); }
  }
  if (C.btrDown && !C.wave2) { C.wave2 = true; squad([[-14, -112], [12, -120], [-2, -128]], CV.coverS, 1); }
  if (C.btrDown && !C.go && C.t - C.btrDownT > 3) {
    C.go = true; say('P2_SAND_03', 0.3);
    HUD.objective('赶往铁路货场'); HUD.setMarker(new THREE.Vector3(0, 1.5, -138), '货场');
    goMate(D.truck, [[3, -60], [3, -132]], 'defend', 5.5); goMate(D.grinch, [[-3, -60], [-2, -132]], 'defend', 5.5);
  }
  if (C.go && P.pos.z < -128 && !C.done) {
    C.done = true; HUD.objective(null); HUD.setMarker(null);
    HUD.fade(1, 1.4);
    afterReal(1.8, () => { HUD.fade(0, 0.01); G.keepStats = true; startCheckpoint(0); });
  }
  G.otherPrompt = !!prompt;
  HUD.setPrompt(prompt || G.pickPrompt || null);
}
G.p2BtrDown = () => { const C = D.cv; if (!C) return; C.btrDown = true; C.btrDownT = C.t; say('P2_GRIN_03', 0.6); HUD.setMarker(null); };
