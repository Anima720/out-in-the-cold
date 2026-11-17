// Part 1 "坍塌" (collapsed mine) and Part 2 "升井" (cage elevator + blizzard yard + BTR).
import { G, THREE, rr, ri, clamp, damp, lerp, smooth, yawOf, angDiff, reseed, mulberry32 } from './core.js';
import { hit, key } from './input.js';
import { Builder, canvasTex, labelTex } from './geom.js';
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
import { Raider, mateCustom, goMate, placeMate, prep } from './raider.js';
import { clear5 } from './part5.js';
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
const inHH = (x, z, pad = 0) => Math.abs(x) <= 8 + pad && z >= -6 - pad && z <= 10 + pad; // hoist house footprint
const inShaft = (x, z) => Math.abs(x) < 2.4 && z > 4.1 && z < 8.3;
const surfG = (x, z) => (inShaft(x, z) ? -90 : Math.abs(x) < 8 && z > -6 && z < 9.5 ? 0.04 : surfGround(x, z)); // Part 2 ground: hoist house floor, open shaft
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

// ---------- mine cage (bottom landing in Part 1, the ride up in Part 2) ----------
// local frame: floor at y 0, x ±1.7, z ±1.6, folding gate on the -z side. setGate(k): 0 folded open .. 1 closed.
const CAGE = { X: 1.7, Z: 1.6, H: 2.7, N: 9 };
let CMAT = null;
function cageMats() {
  if (CMAT) return CMAT;
  const t = canvasTex(64, 64, (g) => { g.strokeStyle = '#cdb27a'; g.lineWidth = 9; g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke(); });
  CMAT = {
    ...M,
    mesh: new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.45, roughness: 0.55, color: 0xa89a7a }),
    gate: new THREE.MeshStandardMaterial({ color: 0x9c7a34, metalness: 0.55, roughness: 0.45 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc77a, emissiveIntensity: 7 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x2c2c2a, metalness: 0.7, roughness: 0.45 }),
  };
  return CMAT;
}
const _sq = new THREE.Quaternion(), _sv = new THREE.Vector3(), _sy = new THREE.Vector3(0, 1, 0), _sm = new THREE.Vector3(), _ss = new THREE.Vector3(1, 1, 1);
function strut(b, ax, ay, az, bx, by, bz, t, key, color) { // square beam from a to b
  _sv.set(bx - ax, by - ay, bz - az); const L = _sv.length(); _sq.setFromUnitVectors(_sy, _sv.normalize());
  b.add(new THREE.BoxGeometry(t, L, t), key, color, new THREE.Matrix4().compose(_sm.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _sq, _ss));
}
function cageMesh() {
  const { X, Z, H, N } = CAGE, m = cageMats(), grp = new THREE.Group(), b = new Builder(), Y = 0x8a6a2a;
  b.box(-X, -0.1, -Z, X, 0.04, Z, 'steel', 0x5c5e60);                                   // chequer-plate floor
  for (const x of [-X + 0.06, 0, X - 0.06]) b.boxC(x, -0.2, 0, 0.1, 0.16, Z * 2, 'dark', 0x2a2a2a);
  for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z], [-X, 0], [X, 0], [0, Z]]) b.boxC(x, H / 2, z, 0.09, H, 0.09, 'steel', Y);
  for (const y of [0.06, 1.2, H - 0.04]) { b.boxC(-X, y, 0, 0.06, 0.07, Z * 2, 'steel', Y); b.boxC(X, y, 0, 0.06, 0.07, Z * 2, 'steel', Y); b.boxC(0, y, Z, X * 2, 0.07, 0.06, 'steel', Y); }
  b.boxC(0, H - 0.04, -Z, X * 2 + 0.1, 0.1, 0.1, 'steel', Y); b.boxC(0, 0.02, -Z - 0.04, X * 2, 0.04, 0.08, 'steel', 0x444444); // gate header + bottom track
  for (const sx of [-1, 1]) { b.boxC(sx * X, 0.17, 0, 0.02, 0.26, Z * 2, 'steel', 0x6a5a32); b.cyl(sx * (X - 0.12), 1.5, 0, 0.022, 0.022, Z * 2 - 0.4, 'steel', 0xa0a0a0, Math.PI / 2, 0, 0, 6); }
  b.boxC(0, 0.17, Z, X * 2, 0.26, 0.02, 'steel', 0x6a5a32);
  b.box(-X - 0.05, H, -Z - 0.05, X + 0.05, H + 0.06, Z + 0.05, 'steel', 0x5c5e60);         // roof plate
  b.boxC(0, H + 0.32, 0, 3.8, 0.16, 0.22, 'steel', Y);                                    // crosshead (bridle)
  for (const sx of [-1, 1]) { strut(b, sx * 1.6, H + 0.3, 0, sx * (X - 0.05), H + 0.05, -Z + 0.1, 0.06, 'steel', Y); strut(b, sx * 1.6, H + 0.3, 0, sx * (X - 0.05), H + 0.05, Z - 0.1, 0.06, 'steel', Y); }
  for (const z of [-0.3, 0.3]) { b.cyl(0, H + 0.55, z, 0.05, 0.09, 0.42, 'dark', 0x2a2a2a, 0, 0, 0, 8); b.boxC(0, H + 0.38, z, 0.2, 0.08, 0.14, 'dark', 0x222222); }
  for (const sx of [-1, 1]) for (const y of [0.25, H + 0.25]) b.boxC(sx * 1.84, y, 0, 0.2, 0.28, 0.34, 'dark', 0x252525); // guide shoes
  b.sphere(0, H - 0.12, 0.6, 0.07, 'lamp', 0, 1, 1, 1, 10);                                // caged roof lamp
  b.build(m, grp);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 12), m.dark); guard.position.set(0, H - 0.12, 0.6); guard.rotation.x = Math.PI / 2; grp.add(guard);
  const pg = (w, h) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.1, uv.getY(i) * h / 0.1); return g; };
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(pg(Z * 2 - 0.08, H - 0.32), m.mesh); w.position.set(sx * X, 0.3 + (H - 0.32) / 2, 0); w.rotation.y = Math.PI / 2; grp.add(w); }
  { const w = new THREE.Mesh(pg(X * 2 - 0.08, H - 0.32), m.mesh); w.position.set(0, 0.3 + (H - 0.32) / 2, Z); grp.add(w); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshBasicMaterial({ map: labelTex('НЕ БОЛЕЕ 12 ЧЕЛ.', { bg: '#c8b04a', fg: '#1a1a1a', font: 'bold 60px Arial' }) }));
  sign.position.set(0.6, 1.85, Z - 0.04); sign.rotation.y = Math.PI; grp.add(sign);
  // folding (scissor) gate: slats + crossed links, instanced; folded on the -x side
  const gate = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m.gate, N + 8 * (N - 1)); gate.frustumCulled = false; grp.add(gate);
  const xs = new Float32Array(N), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Pp = new THREE.Vector3(), Sc = new THREE.Vector3(), gz = -Z - 0.05;
  const setGate = (k) => {
    const sp = 0.035 + ((X * 2 - 0.14) / (N - 1) - 0.035) * k;
    for (let i = 0; i < N; i++) { xs[i] = -X + 0.07 + i * sp; gate.setMatrixAt(i, M4.compose(Pp.set(xs[i], 1.24, gz), Q.identity(), Sc.set(0.03, 2.36, 0.035))); }
    let n = N;
    for (let i = 0; i < N - 1; i++) {
      const dx = xs[i + 1] - xs[i], L = 0.62, hh = Math.sqrt(Math.max(0, L * L - dx * dx)) / 2;
      for (let t = 0; t < 4; t++) for (const sg of [-1, 1]) {
        const yc = 0.36 + t * 0.58; E.set(0, 0, Math.atan2(sg * 2 * hh, dx));
        gate.setMatrixAt(n++, M4.compose(Pp.set((xs[i] + xs[i + 1]) / 2, yc, gz - 0.02 * sg), Q.setFromEuler(E), Sc.set(L, 0.022, 0.012)));
      }
    }
    gate.instanceMatrix.needsUpdate = true;
    return xs[N - 1];
  };
  setGate(0);
  return { grp, setGate };
}

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
  { // the laptop is its own group: it disappears once the intel is taken (and at checkpoint 11)
    const lb = new Builder(), lg = new THREE.Group();
    lb.boxC(8.3, 0.84, -62.6, 0.42, 0.03, 0.3, 'dark', 0x1c1c1c); lb.boxC(8.3, 1.0, -62.76, 0.42, 0.28, 0.02, 'screen', 0);
    lb.build({ ...M, screen: new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7de0ff, emissiveIntensity: 2.5 }) }, lg); g.add(lg); CV.laptopGrp = lg;
  }
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
  { const mc = cageMesh(); mc.grp.position.set(0, 0, CZ); mc.grp.rotation.y = Math.PI; g.add(mc.grp); } // gate side faces the cavern
  for (const z of [-0.3, 0.3]) B.cyl(0, 5.3, CZ + z, 0.022, 0.022, 3.4, 'dark', 0x2c2c2a, 0, 0, 0, 6);  // hoist ropes into the shaft
  for (const sx of [-1, 1]) B.boxC(sx * 2.08, 3.5, CZ, 0.18, 7, 0.22, 'wood', 0x5a4632);                    // guides
  B.boxC(0, 6.98, CZ, 4.6, 0.04, 4.2, 'dark', 0x050505);                                                   // shaft mouth in the roof
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
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, Math.abs(x) < 7.9 && z > -5.9 && z < 9.4 ? -0.3 : surfGround(x, z) - 0.02); uv.setXY(i, x / 9, z / 9); }
  { // no snow inside the hoist house (and no lid over the shaft): drop the terrain cells that lie inside it
    const idx = terr.index.array, keep = [];
    for (let i = 0; i < idx.length; i += 3) { let inside = 0; for (let k = 0; k < 3; k++) if (inHH(p.getX(idx[i + k]), p.getZ(idx[i + k]), 0.45)) inside++; if (inside < 3) keep.push(idx[i], idx[i + 1], idx[i + 2]); }
    terr.setIndex(keep);
  }
  terr.computeVertexNormals();
  const tm = new THREE.Mesh(terr, W.mat.snow); tm.receiveShadow = true; g.add(tm);
  const CON = 0x8e8a82;
  // hoist house x -8..8, z -6..10, H 9 ; big door north x -3..3
  solid(-8.5, 0, 9.5, 8.5, 9, 10.5, 'concrete', CON, 'concrete');
  solid(-8.5, 0, -6.5, -8, 9, 10, 'concrete', CON, 'concrete'); solid(8, 0, -6.5, 8.5, 9, 10, 'concrete', CON, 'concrete');
  solid(-8, 0, -6.5, -3, 9, -6, 'concrete', CON, 'concrete'); solid(3, 0, -6.5, 8, 9, -6, 'concrete', CON, 'concrete'); solid(-3, 4.2, -6.5, 3, 9, -6, 'concrete', CON, 'concrete');
  // roof and floor with the shaft opening (x ±2.4, z 4.1..8.3) cut out; the cage arrives through the floor
  const SX = 2.4, SZ0 = 4.1, SZ1 = 8.3, CZ = 6.2;
  for (const [x0, x1, z0, z1] of [[-8.5, -SX, -6.5, 10.5], [SX, 8.5, -6.5, 10.5], [-SX, SX, -6.5, SZ0], [-SX, SX, SZ1, 10.5]]) {
    solid(x0, 9, z0, x1, 9.4, z1, 'steel', 0x6b6e66, 'metal'); B.box(x0 + 0.05, 9.4, Math.max(z0, -6.45) + 0.05, x1 - 0.05, 9.5, Math.min(z1, 10.45) - 0.05, 'snow', 0xffffff);
  }
  for (const [x0, x1, z0, z1] of [[-8, -SX, -6, 9.5], [SX, 8, -6, 9.5], [-SX, SX, -6, SZ0], [-SX, SX, SZ1, 9.5]]) B.box(x0, -0.02, z0, x1, 0.06, z1, 'concrete', 0x6a675f);
  // shaft collar: hazard-striped kerb and the landing plates (keps) the cage stops flush with
  for (let i = 0; i < 16; i++) { const u = -SX + (i + 0.5) * (SX * 2 / 16), c = i % 2 ? 0x1a1a1a : 0x9a8420; B.boxC(u, 0.09, SZ0 - 0.08, SX * 2 / 16, 0.07, 0.14, i % 2 ? 'dark' : 'steel', c); B.boxC(u, 0.09, SZ1 + 0.08, SX * 2 / 16, 0.07, 0.14, i % 2 ? 'dark' : 'steel', c); }
  for (const [x0, x1, z0, z1] of [[-SX, -1.95, SZ0, SZ1], [1.95, SX, SZ0, SZ1], [-1.95, 1.95, SZ0, 4.5], [-1.95, 1.95, 7.9, SZ1]]) solid(x0, -0.25, z0, x1, 0.04, z1, 'steel', 0x5c5e60, 'metal');
  solid(-6.5, 0, 2.5, -3.5, 2.6, 7.5, 'paint', 0x5d6a4a, 'metal');
  { // hoist drum (turns while the cage moves)
    const dg = new THREE.Group(), db = new Builder(); dg.position.set(-5, 3.6, 5);
    db.cyl(0, 0, 0, 1.4, 1.4, 3.6, 'steel', 0x5a5e60, Math.PI / 2, 0, 0, 20); db.cyl(0, 0, 0, 1.43, 1.43, 1.6, 'dark', 0x2c2c2a, Math.PI / 2, 0, 0, 20);
    for (const z of [-1.85, 1.85]) { db.cyl(0, 0, z, 1.75, 1.75, 0.1, 'steel', 0x6a5a3a, Math.PI / 2, 0, 0, 20); for (let a = 0; a < 6; a++) db.boxC(Math.cos(a) * 0.8, Math.sin(a) * 0.8, z + Math.sign(z) * 0.06, 1.5, 0.12, 0.05, 'dark', 0x333333, 0, 0, a); }
    db.cyl(0, 0, 0, 0.15, 0.15, 4.6, 'dark', 0x222222, Math.PI / 2, 0, 0, 10); db.build(M, dg); g.add(dg); CV.drum = dg;
  }
  // headframe: tapering lattice tower over the shaft, sheave deck, two spoked sheaves
  const HF = 0x7a4a2a, legs = [[-2.25, 4.25, -1.45, 5.0], [2.25, 4.25, 1.45, 5.0], [-2.25, 8.15, -1.45, 7.4], [2.25, 8.15, 1.45, 7.4]];
  const lv = [9.4, 13.3, 17.2, 21.0], at = (l, y) => { const u = (y - 9.4) / 11.6; return [l[0] + (l[2] - l[0]) * u, l[1] + (l[3] - l[1]) * u]; };
  for (const l of legs) strut(B, l[0], 9.4, l[1], l[2], 21.0, l[3], 0.26, 'pRust', 0xffffff);
  for (let i = 0; i < 3; i++) for (const [a, c] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {
    const [ax0, az0] = at(legs[a], lv[i]), [cx0, cz0] = at(legs[c], lv[i]), [ax1, az1] = at(legs[a], lv[i + 1]), [cx1, cz1] = at(legs[c], lv[i + 1]);
    strut(B, ax0, lv[i], az0, cx1, lv[i + 1], cz1, 0.12, 'pRust', 0xffffff); strut(B, cx0, lv[i], cz0, ax1, lv[i + 1], az1, 0.12, 'pRust', 0xffffff);
    strut(B, ax1, lv[i + 1], az1, cx1, lv[i + 1], cz1, 0.16, 'pRust', 0xffffff);
  }
  B.box(-3.3, 21.0, 4.7, 1.9, 21.14, 7.7, 'steel', 0x4a4a46);
  for (const z of [4.7, 7.7]) { B.box(-3.3, 22.0, z - 0.03, 1.9, 22.06, z + 0.03, 'steel', 0xb08a3a); for (let x = -3.2; x <= 1.9; x += 1.0) B.boxC(x, 21.57, z, 0.05, 1.0, 0.05, 'steel', 0xb08a3a); }
  for (const z of [5.3, 7.1]) B.boxC(-1.5, 21.6, z, 0.5, 1.0, 0.35, 'dark', 0x2a2a2a);
  B.boxC(-1.5, 22.6, 6.2, 0.18, 0.18, 1.9, 'dark', 0x222222);
  CV.sheaves = [];
  for (const z of [5.7, 6.7]) {
    const sg = new THREE.Group(), sb2 = new Builder(); sg.position.set(-1.5, 22.6, z);
    sb2.add(new THREE.TorusGeometry(1.5, 0.08, 6, 36), 'steel', 0x5a5550, null); sb2.add(new THREE.TorusGeometry(1.42, 0.04, 4, 36), 'dark', 0x2a2a2a, null);
    for (let a = 0; a < 8; a++) sb2.boxC(Math.cos(a * Math.PI / 4) * 0.75, Math.sin(a * Math.PI / 4) * 0.75, 0, 1.4, 0.07, 0.05, 'steel', 0x5a5550, 0, 0, a * Math.PI / 4);
    sb2.cyl(0, 0, 0, 0.22, 0.22, 0.3, 'dark', 0x222222, Math.PI / 2, 0, 0, 12); sb2.build(M, sg); g.add(sg); CV.sheaves.push(sg);
    strut(B, -2.9, 23.1, z, -5.1, 5.0, z - 1.0, 0.045, 'dark', 0x2c2c2a); // rope down to the drum
  }
  // the cage (moves with the ride) and its two hoist ropes up to the sheaves
  CV.cageObj = cageMesh(); CV.cageObj.grp.position.set(0, 0, CZ); g.add(CV.cageObj.grp); CV.cageGrp = CV.cageObj.grp;
  CV.ropes = [5.7, 6.7].map((z) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1, 6), cageMats().rope); r.position.set(0, 10, z); r.userData.z = z; g.add(r); return r; });
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
  // v7: more cover between the hoist house and the yard (the player and the yard squads both use it) + the spots
  // the door squad runs to (coverHH, tier 0 only) when it storms the hoist house after the ride up
  CV.coverHH = [];
  const bags = (x, z, len, rows, alongZ) => {
    const n = Math.round(len / 0.5);
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5 + (r % 2) * 0.25) * (len / n); if (Math.abs(u) > len / 2) continue;
      B.capsule(alongZ ? x : x + u, 0.13 + r * 0.24, alongZ ? z + u : z, 0.13, 0.36, 'cloth', 0xa39a78, Math.PI / 2, alongZ ? 0 : Math.PI / 2, 0, 1.15, 1.0);
    }
    B.box(alongZ ? x - 0.2 : x - len / 2, rows * 0.24 + 0.02, alongZ ? z - len / 2 : z - 0.2, alongZ ? x + 0.2 : x + len / 2, rows * 0.24 + 0.08, alongZ ? z + len / 2 : z + 0.2, 'snow', 0xffffff);
    CV.cols.push(alongZ ? [x - 0.3, 0, z - len / 2, x + 0.3, rows * 0.24 + 0.05, z + len / 2, 'soft'] : [x - len / 2, 0, z - 0.3, x + len / 2, rows * 0.24 + 0.05, z + 0.3, 'soft']);
  };
  bags(-4.6, -11.6, 2.8, 4, false); cover(-4.6, -12.5, 0, CV.coverHH); cover(-4.6, -10.6, 1);
  solid(4.1, 0, -13.2, 5.5, 1.4, -11.8, 'crate', 0xffffff, 'wood'); solid(4.4, 1.4, -13.0, 5.3, 2.2, -12.1, 'crate', 0xffffff, 'wood'); B.boxC(4.8, 2.25, -12.55, 0.85, 0.08, 0.85, 'snow', 0xffffff);
  cover(4.8, -13.9, 0, CV.coverHH); cover(4.8, -11.1, 1);
  solid(-0.5, 0, -17.85, 1.7, 1.0, -17.15, 'concrete', 0xa09d94, 'concrete'); B.boxC(0.6, 1.04, -17.5, 2.1, 0.06, 0.6, 'snow', 0xffffff);
  cover(0.6, -18.5, 0, CV.coverHH); cover(0.6, -16.5, 1);
  bags(11, -31, 2.4, 3, true); cover(11.9, -31, 0); cover(10.1, -31, 1);
  bags(-7, -93, 3.0, 3, false); cover(-7, -93.9, 0); cover(-7, -92.1, 1);
  solid(14.3, 0, -112.7, 15.7, 1.4, -111.3, 'crate', 0xffffff, 'wood'); cover(15, -113.4, 0); cover(15, -110.6, 1);
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
  // the main shaft under the hoist house: lagged rock walls, timber sets every 2.5 m, guides, pipes, lamps, two
  // level stations and the bottom landing (the cage really travels up it, from CV.cageY0 to the floor)
  const sh = new THREE.Group(), sb = new Builder(), RK = 0x5c544c, TB = 0x5a4632, Y0 = CV.cageY0 = -64, YB = -72;
  const ST = [[Y0, 'ГОРИЗОНТ −430'], [-44, 'ГОРИЗОНТ −310'], [-22, 'ГОРИЗОНТ −190']];
  sb.box(-SX - 0.4, YB, SZ0, -SX, 0, SZ1, 'rock', RK); sb.box(SX, YB, SZ0, SX + 0.4, 0, SZ1, 'rock', RK);
  sb.box(-SX - 0.4, YB, SZ1, SX + 0.4, 0, SZ1 + 0.4, 'rock', RK); sb.box(-SX - 0.4, YB - 0.4, SZ0 - 0.4, SX + 0.4, YB, SZ1 + 0.4, 'rock', 0x3a3430);
  let yPrev = YB; // north wall (gate side) with the station openings
  for (const [y] of ST) {
    sb.box(-SX - 0.4, yPrev, SZ0 - 0.4, SX + 0.4, y, SZ0, 'rock', RK);
    sb.box(-SX - 0.4, y, SZ0 - 0.4, -1.5, y + 3, SZ0, 'rock', RK); sb.box(1.5, y, SZ0 - 0.4, SX + 0.4, y + 3, SZ0, 'rock', RK);
    // station: short lit gallery, timber sets, rails, barrier, sign
    sb.box(-1.5, y - 0.3, SZ0 - 6, 1.5, y, SZ0, 'gravel', 0x5f5a54); sb.box(-1.9, y + 3, SZ0 - 6, 1.9, y + 3.4, SZ0, 'rock', RK);
    sb.box(-1.9, y, SZ0 - 6, -1.5, y + 3, SZ0 - 0.4, 'rock', RK); sb.box(1.5, y, SZ0 - 6, 1.9, y + 3, SZ0 - 0.4, 'rock', RK); sb.box(-1.9, y, SZ0 - 6.4, 1.9, y + 3.4, SZ0 - 6, 'rock', 0x2a2622);
    for (let z = SZ0 - 1.2; z > SZ0 - 6; z -= 1.6) { sb.boxC(-1.38, y + 1.45, z, 0.2, 2.9, 0.2, 'wood', TB); sb.boxC(1.38, y + 1.45, z, 0.2, 2.9, 0.2, 'wood', TB); sb.boxC(0, y + 2.9, z, 3.0, 0.2, 0.22, 'wood', TB); }
    for (const x of [-0.62, 0.62]) sb.box(x - 0.04, y + 0.02, SZ0 - 6, x + 0.04, y + 0.12, SZ0 - 0.1, 'steel', 0x6a6e70);
    sb.sphere(0, y + 2.65, SZ0 - 2.4, 0.09, 'lamp', 0, 1, 1, 1, 8);
    if (y !== Y0) for (const yy of [0.55, 1.05]) for (let i = 0; i < 6; i++) sb.boxC(-1.25 + i * 0.5, y + yy, SZ0 - 0.25, 0.5, 0.06, 0.06, i % 2 ? 'dark' : 'steel', i % 2 ? 0x111111 : 0x9a8420);
    yPrev = y + 3;
  }
  sb.box(-SX - 0.4, yPrev, SZ0 - 0.4, SX + 0.4, 0, SZ0, 'rock', RK);
  for (let y = YB + 1; y < -0.3; y += 2.5) { // timber sets: wall plates round the shaft + buntons carrying the guides
    const inOpen = ST.some(([sy]) => y > sy - 0.2 && y < sy + 3.2);
    if (!inOpen) sb.boxC(0, y, SZ0 + 0.1, SX * 2, 0.2, 0.2, 'wood', TB);
    sb.boxC(0, y, SZ1 - 0.1, SX * 2, 0.2, 0.2, 'wood', TB);
    for (const sx of [-1, 1]) { sb.boxC(sx * (SX - 0.1), y, CZ, 0.2, 0.2, SZ1 - SZ0, 'wood', TB); sb.boxC(sx * 2.2, y, CZ, 0.25, 0.16, 0.5, 'wood', TB); }
  }
  for (const sx of [-1, 1]) sb.box(sx * 2.08 - 0.09, YB, CZ - 0.11, sx * 2.08 + 0.09, 0.0, CZ + 0.11, 'wood', 0x6a5640); // cage guides
  for (const [x, z, r] of [[-2.2, 7.7, 0.09], [-2.2, 7.95, 0.06], [2.22, 4.5, 0.05]]) sb.cyl(x, (YB + 0) / 2, z, r, r, -YB, 'steel', 0x4a4c4e, 0, 0, 0, 8);
  sb.box(2.25, YB, 7.55, 2.33, 0, 7.75, 'dark', 0x151515);                                       // cable bundle
  for (let y = YB + 4; y < -2; y += 9) { sb.sphere(2.27, y, 7.2, 0.08, 'lamp', 0, 1, 1, 1, 8); sb.boxC(2.33, y, 7.2, 0.06, 0.2, 0.2, 'dark', 0x222222); }
  sb.build(cageMats(), sh);
  for (const [y, txt] of ST) { const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), new THREE.MeshBasicMaterial({ map: labelTex(txt, { bg: '#2a3a2a', fg: '#e8e2c8', font: 'bold 64px Arial' }), fog: true })); sg2.position.set(0, y + 3.3, SZ0 + 0.02); sh.add(sg2); }
  g.add(sh); CV.shaft = sh;
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

// ---------- the cage ride: looks, moving colliders, ropes ----------
const LOOK_SHAFT = { fog: 0x0b0907, bg: 0x040302, top: 0x6f7d8b, density: 0.05, sun: 0, hemi: [0x7a6a58, 0x1a1410, 0.2], exp: 1.15, env: 0.12, sky: false, snow: false };
const LOOK_SURF = { fog: 0xa9b5c0, bg: 0xa9b5c0, top: 0x6f7d8b, density: 0.026, sun: 1.1, hemi: [0xd4e0ec, 0x5e646b, 0.75], exp: 1.0, env: 0.8, sky: true, snow: true };
const _la = new THREE.Color(), _lb = new THREE.Color(), _lc = new THREE.Color();
const LB = { fog: 0, bg: 0, top: 0, density: 0, sun: 0, hemi: [0, 0, 0], exp: 0, env: 0, sky: false, snow: false };
function blendLook(k) { // 0 = dark shaft .. 1 = blizzard surface (no allocation)
  const A = LOOK_SHAFT, Bk = LOOK_SURF, l = (a, b) => a + (b - a) * k;
  LB.fog = _la.set(A.fog).lerp(_lc.set(Bk.fog), k).getHex(); LB.bg = _la.set(A.bg).lerp(_lc.set(Bk.bg), k).getHex();
  LB.hemi[0] = _la.set(A.hemi[0]).lerp(_lc.set(Bk.hemi[0]), k).getHex(); LB.hemi[1] = _lb.set(A.hemi[1]).lerp(_lc.set(Bk.hemi[1]), k).getHex(); LB.hemi[2] = l(A.hemi[2], Bk.hemi[2]);
  LB.top = Bk.top; LB.density = l(A.density, Bk.density); LB.sun = l(A.sun, Bk.sun); LB.exp = l(A.exp, Bk.exp); LB.env = l(A.env, Bk.env); LB.sky = LB.snow = k > 0.45;
  setLook(LB);
}
function placeRopes(cy) {
  if (!CV.ropes) return;
  for (const r of CV.ropes) { const y0 = cy + CAGE.H + 0.74, y1 = 22.6; r.position.y = (y0 + y1) / 2; r.scale.y = y1 - y0; r.position.z = 6.2 + (r.userData.z - 6.2) * 0.5; }
}
function setCageY(y, sway) {
  CV.cageY = y; CV.cageGrp.position.set(sway, y, 6.2);
  if (CV.cageBoxes) for (const [b, y0, y1] of CV.cageBoxes) { b.min.y = y + y0; b.max.y = y + y1; }
  placeRopes(y);
  if (CV.lights[0]) CV.lights[0].position.y = y + 2.45;
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
    G.groundFn = surfG;
    setLook(LOOK_SURF);
    lights([]);
  }
  for (const k of Object.keys(CV.root)) CV.root[k].visible = (k === 'mine') === (lvl === 1);
  CV.cols = lvl === 1 ? CV.colsMine : CV.colsSurf;
  CV.cover = lvl === 1 ? CV.coverMine : CV.coverS;
  if (CV.cageObj) { CV.cageGrp.position.set(0, 0, 6.2); CV.cageGrp.rotation.set(0, 0, 0); CV.cageObj.setGate(0); CV.cageY = 0; placeRopes(0); }
}
G.leaveCave = () => {
  if (G.lvl !== 1 && G.lvl !== 3) return;
  clear5();
  for (const k of Object.keys(CV.root)) CV.root[k].visible = false;
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
  if (CV.laptopGrp) CV.laptopGrp.visible = k === 10;
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
  } else { // 20: the cage ride up the main shaft (the cage really travels; the hoist house is waiting at the top)
    const Y0 = CV.cageY0, F = Y0 + 0.04;
    CV.cageBoxes = [[addBox(-1.7, 0, 4.6, 1.7, 0, 7.8, 'metal'), -0.1, 0.04], [addBox(-1.92, 0, 4.5, -1.66, 0, 7.9, 'metal'), 0, 2.78], [addBox(1.66, 0, 4.5, 1.92, 0, 7.9, 'metal'), 0, 2.78],
      [addBox(-1.92, 0, 7.78, 1.92, 0, 7.98, 'metal'), 0, 2.78], [addBox(-1.92, 0, 4.4, 1.92, 0, 4.6, 'metal'), 0, 2.78], [addBox(-1.92, 0, 4.4, 1.92, 0, 8.0, 'metal'), 2.72, 2.95]];
    CV.gateBox = CV.cageBoxes[4][0];
    lights([[0, F + 2.45, 6.8, 0xffd9a0, 6.5, 11]]);
    setCageY(Y0, 0); CV.gateK = 0; CV.cageObj.setGate(0);
    resetPlayer(new THREE.Vector3(0.35, F, 7.05), 0.08);
    placeMate(t, -1.05, 5.3, F); placeMate(g, 1.15, 6.55, F);
    t.h.yaw = 0; t.yaw0 = 0; g.h.yaw = 2.2; g.yaw0 = 2.2;
    C.ph = 'ride'; C.rideT = 0; C.v = 0; C.rat = 1; HUD.objective(null); HUD.setMarker(null);
    blendLook(0);
    musicMode('p2ride');
    after(0.8, () => HUD.locCard(['升井', '西伯利亚 · 钻石矿 · 主井提升机', '“Sandman” 军士长 · 三角洲部队 · Metal 0-1', '“弃于寒冬” · 第二部分']));
    say('P2_GRIN_01', 5.2); say('P2_TRUCK_03', 0.8); say('P2_SAND_01', 0.8); say('P2_TRUCK_01', 0.9);
    C.rideSnd = loop('train', { vol: 0.12, rate: 0.42 });
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
  if (C.ph === 'office' && !C.intel && Math.hypot(P.pos.x - CV.laptop.x, P.pos.z - CV.laptop.z) < 1.4) {
    prompt = '按住 <kbd>F</kbd> 取走笔记本电脑';
    if (key('KeyF')) C.hold = (C.hold || 0) + dt; else C.hold = 0;
    holdK = C.hold / 1.6;
    if (C.hold >= 1.6) {
      C.hold = 0; C.intel = true; holdK = null; play('magin', { vol: 0.6, rev: 0 });
      if (CV.laptopGrp) CV.laptopGrp.visible = false;
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
    C.rideT += dt; const rt = C.rideT, tr = D.truck;
    // Truck pulls the folding gate shut (left hand on the leading slat), latches it; three bells; the hoist takes up
    if (rt > 1.0 && !C.gateShut) {
      if (!C.pull) { C.pull = true; goMate(tr, [[0.95, 5.3]], 'idle', 1.25); tr.yaw0 = -Math.PI / 2; play('metal', { pos: CV.cageGrp.position, vol: 0.3, ref: 3 }); }
      CV.gateK = Math.min(1, CV.gateK + dt / 1.6);
      const lead = CV.cageObj.setGate(CV.gateK);
      tr.h.handL = (tr.h.handL || new THREE.Vector3()).set(lead + 0.05, CV.cageY + 1.25, 4.62);
      if (Math.random() < dt * 6) play('clack', { pos: CV.cageGrp.position, vol: 0.12, ref: 3, rate: 1.6 });
      if (CV.gateK >= 1) { C.gateShut = true; tr.h.handL = null; play('bolt', { pos: CV.cageGrp.position, vol: 0.8, ref: 4 }); play('metal', { pos: CV.cageGrp.position, vol: 0.5, ref: 3 }); tr.yaw0 = 2.8; }
    }
    if (C.gateShut && !C.bells) { C.bells = 1; for (let i = 0; i < 3; i++) after(0.5 + i * 0.38, () => play('clink', { vol: 0.55, rate: 0.75, rev: 0.6 })); }
    if (rt > 4.5 && !C.go) { C.go = true; P.addShake(0.35); play('clack', { vol: 0.8, rev: 0.3 }); play('metal', { vol: 0.5, rev: 0.3 }); }
    let sway = 0;
    if (C.go) {
      const rem = -CV.cageY, vT = Math.min(4.2, Math.sqrt(2 * 1.5 * Math.max(0, rem)) + 0.1);
      C.v = C.v < vT ? Math.min(vT, C.v + 2.0 * dt) : vT;
      const yPrev = CV.cageY, y = Math.min(0, CV.cageY + C.v * dt);
      sway = (0.014 * Math.sin(rt * 2.3) + 0.006 * Math.sin(rt * 6.1)) * Math.min(1, C.v / 2);
      CV.cageGrp.rotation.z = 0.0035 * Math.sin(rt * 1.7) * Math.min(1, C.v / 2);
      if (Math.floor(yPrev / 2.5) !== Math.floor(y / 2.5) && C.v > 1) play('clack', { pos: CV.cageGrp.position, vol: 0.1, ref: 3, rate: 1.3 }); // shoes over the guide joints
      for (const sy of [-44, -22]) if (yPrev < sy - 1 && y >= sy - 1) { P.addShake(0.12); play('metal', { pos: CV.cageGrp.position, vol: 0.35, ref: 3 }); } // past a level station
      C.rat -= dt; if (C.rat <= 0 && C.v > 0.5) { C.rat = rr(0.4, 1.3); play(Math.random() < 0.6 ? 'clack' : 'metal', { pos: CV.cageGrp.position, vol: rr(0.06, 0.16), ref: 3, rate: rr(0.8, 1.3) }); }
      P.addShake(0.0016 * C.v);
      setCageY(y, sway);
      const sp = C.v * dt; for (const sg of CV.sheaves) sg.rotation.z += sp / 1.5; CV.drum.rotation.z -= sp / 1.4;
      if (C.rideSnd) { C.rideSnd.setVol(0.08 + C.v * 0.045); C.rideSnd.setRate(0.36 + C.v * 0.05); }
      blendLook(smooth((y + 13) / 12));
      if (y >= 0) { // arrival: settle on the keps with a jolt
        C.ph = 'top'; C.v = 0; setCageY(0, 0); CV.cageGrp.rotation.z = 0; P.addShake(0.4); blendLook(1);
        if (C.rideSnd) { C.rideSnd.stop(); C.rideSnd = null; }
        play('bolt', { vol: 0.9 }); play('clack', { vol: 0.9 });
        C.gateOpen = true; tr.yaw0 = 0;
        HUD.objective('冲出提升机房，赶往北面的铁路货场');
        HUD.setMarker(new THREE.Vector3(0, 1.5, -138), '货场');
        squad([[-9, -30], [10, -40], [-4, -48], [14, -60], [-12, -70], [3, -74]], CV.coverS, 1);
        new Raider(16, -95, { cover: CV.coverS, maxTier: 1, rpg: true });
        musicMode('p2fight');
        C.topT = C.t;
        // the door squad storms in from the yard, one after another (they stop at the cover right outside the door)
        [[-7, -31], [7, -33], [1, -37]].forEach(([x, z], i) => after(2.0 + i * 2.6, () => { if (G.lvl === 3) new Raider(x, z, { cover: CV.coverHH, maxTier: 0 }); }));
        after(13, () => { if (G.lvl === 3 && alive() < 9) squad([[-22, -104], [19, -108], [-6, -122]], CV.coverS, 1); });
        after(1.3, () => {
          goMate(D.truck, [[0.8, 3], [2.0, -3.2], [3.9, -5.0]], 'defend', 3.5); goMate(D.grinch, [[-0.6, 3], [-2.0, -3.2], [-3.9, -5.0]], 'defend', 3.5);
          for (const m of [D.truck, D.grinch]) m.yaw0 = 0;
        });
      }
    }
  }
  if (C.gateOpen && CV.gateK > 0) { // gate folds back open
    CV.gateK = Math.max(0, CV.gateK - dt / 1.1); CV.cageObj.setGate(CV.gateK);
    if (CV.gateK < 0.55 && CV.gateBox) { CV.gateBox.enabled = false; }
  }
  if (C.ph === 'top' && C.t - C.topT > 14 && !C.btr) {
    C.btr = new BTR([[2, -130], [0, -90], [3, -55], [0, -28]]); C.btrT = C.t; C.reinf = 0;
    say('P2_TRUCK_02', 2.0); say('P2_GRIN_02', 0.4);
    after(4, () => { HUD.objective('用 RPG 摧毁 BTR'); HUD.setMarker(CV.rpgPos.clone().setY(1.2), 'RPG'); });
  }
  // reinforcements arrive from the flanks while the BTR is still alive (staggered, capped)
  if (C.btr && !C.btr.dead && C.reinf < 3 && C.t - C.btrT > 7 + C.reinf * 11 && alive() < 8) {
    const side = C.reinf % 2 ? 1 : -1, z0 = -70 - C.reinf * 14;
    [[side * 34, z0], [side * 37, z0 - 5], [side * 33, z0 + 6]].forEach(([x, z], i) => after(i * 1.3, () => { if (G.lvl === 3) new Raider(x, z, { cover: CV.coverS, maxTier: 1 }); }));
    C.reinf++;
  }
  if (C.btr && !C.btr.dead && WP.launch !== 'rpg' && Math.hypot(P.pos.x - CV.rpgPos.x, P.pos.z - CV.rpgPos.z) < 1.3) {
    prompt = '按 <kbd>F</kbd> 拿取 РПГ-7';
    if (hit('KeyF')) { giveWeapon('rpg', 1, 4); play('magin', { vol: 0.6, rev: 0 }); HUD.setMarker(null); HUD.toast('按 3 切换 RPG，直接瞄准 BTR 发射'); }
  }
  if (C.btrDown && !C.wave2) { C.wave2 = true; squad([[-14, -112], [12, -120], [-2, -128]], CV.coverS, 1); after(4, () => { if (G.lvl === 3) squad([[-30, -128], [28, -132]], CV.coverS, 1); }); }
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
