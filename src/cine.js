// Epilogue: "three months later · Dubai" code-driven cutscene, credits roll, post-credits scene.
import { G, THREE, clamp, lerp, smooth, rr, mulberry32 } from './core.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { W } from './world.js';
import { Human, J, clearHumans } from './humans.js';
import { HUD } from './hud.js';
import { musicMode, playVO, A, loop, stopAllLoops, muffle } from './audio.js';
import { S, ground5, buildStation } from './station.js';
import { input, hit } from './input.js';
import { WP } from './weapon.js';

const C = { t: 0, on: false, shot: -1, objs: [], lines: [], saved: null };
const _v = new THREE.Vector3(), _l = new THREE.Vector3();

function saveLook() {
  const u = W.sky.material.uniforms;
  C.saved = {
    fog: W.fogColor.clone(), fogT: W.fogTarget, top: u.top.value.clone(), bot: u.bot.value.clone(), sunDir: W.sunDir.clone(),
    sunC: W.sun.color.clone(), sunI: W.sun.intensity, hemiS: W.hemi.color.clone(), hemiG: W.hemi.groundColor.clone(), hemiI: W.hemi.intensity,
    exp: G.renderer.toneMappingExposure, env: G.scene.environmentIntensity ?? 1,
  };
}
function setLook(o) {
  const u = W.sky.material.uniforms;
  if (o.fog) { W.fogColor.set(o.fog); G.scene.fog.color.set(o.fog); G.scene.background.set(o.fog); u.bot.value.set(o.bot ?? o.fog); }
  if (o.top) u.top.value.set(o.top);
  if (o.density !== undefined) { W.fogTarget = W.fogDensity = o.density; G.scene.fog.density = o.density; }
  if (o.sunDir) { W.sunDir.copy(o.sunDir).normalize(); u.sunDir.value.copy(W.sunDir); }
  if (o.sun) { W.sun.color.set(o.sun[0]); W.sun.intensity = o.sun[1]; }
  if (o.hemi) { W.hemi.color.set(o.hemi[0]); W.hemi.groundColor.set(o.hemi[1]); W.hemi.intensity = o.hemi[2]; }
  if (o.exp) G.renderer.toneMappingExposure = o.exp;
  if (o.env !== undefined) G.scene.environmentIntensity = o.env;
  const snowy = !!o.snow;
  W.snow.visible = snowy; if (W.mtn) W.mtn.visible = snowy; if (W.drift) W.drift.forEach((d) => (d.visible = snowy));
}
export function restoreLook() {
  if (!C.saved) return;
  const s = C.saved; C.saved = null;
  setLook({ fog: s.fog, bot: s.bot, top: s.top, density: s.fogT, sunDir: s.sunDir, sun: [s.sunC, s.sunI], hemi: [s.hemiS, s.hemiG, s.hemiI], exp: s.exp, env: s.env, snow: true });
  for (const o of C.objs) G.scene.remove(o);
  C.objs.length = 0;
  if (C.heliSnd) { C.heliSnd.stop(); C.heliSnd = null; } C.heli = null; W.sky.visible = true;
  HUD.root.classList.remove('letterbox'); HUD.credits.classList.remove('on');
  C.on = false;
}
G.cineRestore = restoreLook;

// ---------- Dubai ----------
function windowTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 64, 64);
  const r = mulberry32(9);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { const v = r(); if (v < 0.55) continue; x.fillStyle = v > 0.9 ? '#ffe7b8' : v > 0.75 ? '#ffc879' : '#b98a55'; x.fillRect(4 + i * 15, 3 + j * 8, 10, 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildDubai() {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0f2a38, roughness: 0.12, metalness: 0.6, envMapIntensity: 1.2 }));
  water.position.y = -0.5; g.add(water);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb48a5c, roughness: 1 }));
  sand.position.set(0, 0.3, -1700); g.add(sand);
  const city = new THREE.MeshStandardMaterial({ color: 0x3a4048, emissive: 0xffffff, emissiveMap: windowTex(), emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.65, envMapIntensity: 1.2 });
  const b = new Builder(), r = mulberry32(42);
  for (let i = 0; i < 170; i++) {
    const x = (r() - 0.5) * 1500, z = -260 - r() * 700, h = 30 + Math.pow(r(), 2.2) * 230, w = 14 + r() * 26, d = 14 + r() * 26;
    if (Math.abs(x - 120) < 60 && z > -500) continue;
    b.add(new THREE.BoxGeometry(w, h, d), 'city', 0xffffff, new THREE.Matrix4().makeTranslation(x, h / 2, z), 1 / 9);
    if (r() < 0.25) b.add(new THREE.BoxGeometry(w * 0.6, h * 0.25, d * 0.6), 'city', 0xffffff, new THREE.Matrix4().makeTranslation(x, h + h * 0.125, z), 1 / 9);
  }
  // the supertall on the skyline
  for (let k = 0; k < 9; k++) { const s = 1 - k * 0.1, h = 70; b.add(new THREE.CylinderGeometry(24 * s - 2, 24 * s, h, 6), 'city', 0xffffff, new THREE.Matrix4().makeTranslation(-330, h / 2 + k * h, -980), 1 / 9); }
  b.add(new THREE.CylinderGeometry(0.5, 3, 140, 6), 'city', 0xffffff, new THREE.Matrix4().makeTranslation(-330, 700, -980), 1 / 9);
  // Hotel Oasis (fictional): tall curved tower with a lit crown and helipad
  const hx = 120, hz = -420;
  for (let k = 0; k < 22; k++) { const y = k * 12, s = 1 - Math.pow(k / 22, 2) * 0.45; b.add(new THREE.BoxGeometry(46 * s, 12, 30 * s), 'city', 0xffffff, new THREE.Matrix4().makeTranslation(hx - k * 0.8, y + 6, hz), 1 / 9); }
  b.build({ city }, g);
  const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9fd8ff, emissiveIntensity: 3.2 });
  const crown = new THREE.Mesh(new THREE.TorusGeometry(15, 0.8, 8, 40), glow); crown.rotation.x = Math.PI / 2; crown.position.set(hx - 17, 272, hz); g.add(crown);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1.2, 32), new THREE.MeshStandardMaterial({ color: 0x8c949a, roughness: 0.5, metalness: 0.4 })); pad.position.set(hx + 14, 262, hz + 8); g.add(pad);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 50, 8), glow); spire.position.set(hx - 17, 300, hz); g.add(spire);
  // rooftop where Price and Yuri watch
  const roof = new THREE.Mesh(new THREE.BoxGeometry(40, 80, 30), city); roof.position.set(-40, 40, -170); g.add(roof);
  const rb = new Builder(); rb.boxC(-40, 80.4, -170, 40, 0.8, 30, 'concrete', 0x8a8a84); rb.boxC(-40, 81.2, -156, 40, 0.8, 0.4, 'concrete', 0x8a8a84);
  for (let i = 0; i < 3; i++) rb.boxC(-52 + i * 6, 81.5, -178, 3, 2.2, 3, 'steel', 0x5e6266);
  rb.build(M, g);
  // coastal highway leading to the hotel
  const road = new THREE.Mesh(new THREE.PlaneGeometry(22, 760).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.75 }));
  road.position.set(60, 0.35, -40); g.add(road);
  const lb = new Builder();
  for (let z = 330; z > -400; z -= 9) lb.boxC(60, 0.37, z, 0.18, 0.02, 4.5, 'concrete', 0xffffff);
  for (let z = 330; z > -400; z -= 32) for (const sx of [-1, 1]) {
    lb.cyl(60 + sx * 12.5, 5, z, 0.12, 0.16, 10, 'steel', 0x6a6e72);
    lb.boxC(60 + sx * 11, 10, z, 3.2, 0.12, 0.3, 'steel', 0x6a6e72);
    lb.boxC(60 + sx * 9.8, 9.9, z, 0.9, 0.08, 0.35, 'lamp', 0);
  }
  lb.build({ ...M, lamp: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc27a, emissiveIntensity: 6 }) }, g);
  G.scene.add(g); C.objs.push(g);
  return g;
}

function buildSUV() {
  const g = new THREE.Group(), b = new Builder();
  b.boxC(0, 0.68, 0, 2.0, 0.76, 4.8, 'car', 0xffffff, 0, 0, 0, 0.12);
  b.boxC(0, 0.33, 0.35, 1.8, 0.06, 2.9, 'dark', 0x202224);                                  // cabin floor
  b.boxC(0, 1.79, 0.35, 1.9, 0.1, 2.9, 'car', 0xffffff, 0, 0, 0, 0.05);
  for (const sx of [-1, 1]) for (const z of [-0.95, 0.35, 1.75]) b.boxC(sx * 0.95, 1.41, z, 0.08, 0.7, 0.12, 'car', 0xffffff);
  b.boxC(0, 1.41, 1.85, 1.9, 0.7, 0.06, 'car', 0xffffff);
  for (const [x, z] of [[-0.95, -1.55], [0.95, -1.55], [-0.95, 1.55], [0.95, 1.55]]) b.cyl(x, 0.42, z, 0.42, 0.42, 0.32, 'dark', 0x151515, 0, 0, Math.PI / 2, 16);
  for (const sx of [-1, 1]) { b.boxC(sx * 0.7, 0.95, -2.41, 0.42, 0.14, 0.04, 'head', 0); b.boxC(sx * 0.75, 0.95, 2.41, 0.32, 0.14, 0.04, 'tail', 0); }
  b.boxC(0, 0.95, -0.75, 1.7, 0.35, 0.5, 'dark', 0x202224);                                 // dashboard
  b.cyl(-0.45, 1.22, -0.5, 0.17, 0.17, 0.03, 'dark', 0x111111, 1.1, 0, 0, 16);        // steering wheel
  for (const sx of [-1, 1]) b.boxC(sx * 0.45, 0.6, 0.35, 0.55, 0.15, 0.6, 'dark', 0x2a2420);
  b.build({ ...M, car: new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.22, metalness: 0.85, envMapIntensity: 1.5 }), head: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff2d8, emissiveIntensity: 7 }), tail: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a1a, emissiveIntensity: 5 }) }, g);
  const glass = new THREE.MeshStandardMaterial({ color: 0x182028, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.32, depthWrite: false });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.75), glass); ws.position.set(0, 1.42, -1.0); ws.rotation.x = -0.4; g.add(ws);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.68), glass); w.position.set(sx * 0.97, 1.41, 0.4); w.rotation.y = sx * Math.PI / 2; g.add(w); }
  G.scene.add(g); C.objs.push(g);
  return g;
}

// ---------- post-credits: Nikolai's searchlight over the radar station ----------
function buildHeli() {
  const g = new THREE.Group(), b = new Builder(), K = 0x1b1e20;
  b.boxC(0, 0, 0, 2.4, 2.3, 7.5, 'dark', K, 0, 0, 0, 0.6);                 // cabin
  b.boxC(0, -0.3, -4.3, 1.9, 1.4, 1.8, 'dark', K, 0.25, 0, 0, 0.5);         // nose
  b.boxC(0, 1.45, -0.6, 1.4, 0.7, 3.2, 'dark', K, 0, 0, 0, 0.2);            // engine housing
  b.cyl(0, 0.55, 7.6, 0.55, 0.25, 8.5, 'dark', K, Math.PI / 2, 0, 0, 10);  // tail boom
  b.boxC(0, 1.4, 11.6, 0.2, 2.2, 1.3, 'dark', K, -0.3, 0, 0, 0.05);         // fin
  b.cyl(0, 2.0, -0.6, 0.18, 0.18, 0.7, 'dark', K);                          // mast
  for (const sx of [-1, 1]) b.boxC(sx * 1.6, -0.6, 0.5, 0.9, 0.5, 2.4, 'dark', K, 0, 0, 0, 0.2); // fuel tanks
  for (const sx of [-1, 1]) b.boxC(sx * 1.0, -1.45, -1.4, 0.1, 0.6, 0.1, 'dark', K);
  b.build(M, g);
  const blade = new THREE.MeshStandardMaterial({ color: 0x111314, roughness: 0.7, transparent: true, opacity: 0.55, depthWrite: false });
  const rotor = new THREE.Group(); rotor.position.set(0, 2.4, -0.6); g.add(rotor);
  for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 10.5).translate(0, 0, 5.25), blade); m.rotation.y = k * Math.PI * 0.4; rotor.add(m); }
  const tail = new THREE.Group(); tail.position.set(0.25, 1.4, 11.9); g.add(tail);
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.7, 0.18), blade); m.rotation.x = k * Math.PI / 3; tail.add(m); }
  const lamp = (c, x, y, z, r = 0.11) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6) })); m.position.set(x, y, z); g.add(m); return m; };
  lamp(0xff2010, -1.25, 0.2, -2.5); lamp(0x20ff40, 1.25, 0.2, -2.5);       // steady port/starboard
  const beacon = lamp(0xff1a0a, 0, 1.95, 2.2, 0.16), tailW = lamp(0xffffff, 0, 1.2, 12.3, 0.09);
  const bl = new THREE.PointLight(0xff2010, 0, 14, 1.6); bl.position.set(0, 2.3, 2.2); g.add(bl);
  // searchlight under the nose: a real spotlight plus a soft additive cone so the beam reads through the snow
  const spot = new THREE.SpotLight(0xe8f0ff, 900, 0, 0.13, 0.45, 1.2); spot.position.set(0, -1.1, -4.6); g.add(spot); G.scene.add(spot.target);
  const cg = new THREE.ConeGeometry(Math.tan(0.13), 1, 28, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const col = []; const pa = cg.attributes.position; for (let i = 0; i < pa.count; i++) { const k = 0.16 * (1 - pa.getZ(i)) ** 1.4; col.push(k, k * 1.05, k * 1.15); }
  cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  G.scene.add(cone);
  G.scene.add(g); C.objs.push(g, cone, spot.target);
  return { g, rotor, tail, beacon, tailW, bl, spot, cone };
}

// ---------- credits ----------
const CREDITS = `
<h2>弃于寒冬</h2>
<p style="letter-spacing:.5em">OUT IN THE COLD</p>
<p><em>一部《使命召唤：现代战争 3》非官方同人战役</em></p>
<h3>主演</h3>
<p>Sandman <em>Metal 0-1 · 你</em></p><p>Truck <em>Metal 0-2</em></p><p>Grinch <em>Metal 0-3</em></p>
<p>John Price 上尉</p><p>尤里</p><p>克拉辛 上校</p><p>尼古拉</p>
<h3>剧本 · 关卡构思</h3><p>玩家本人</p>
<h3>程序 · 模型 · 特效 · 音效</h3><p>Claude <em>Anthropic</em></p>
<h3>配音</h3><p>AI 合成原创声音 <em>ElevenLabs</em></p>
<h3>战役配乐</h3><p>《Beneath the White Sky》 <em>Gemini 生成</em></p>
<h3>片尾曲</h3><p>Hans Zimmer &amp; Lorne Balfe — Opening Credits <em>《使命召唤：现代战争 2》原声</em></p>
<h3>技术参考</h3><p>three.js</p><p>wquguru / fable52-fps-repro <em>MIT</em></p>
<h3>特别感谢</h3><p>Infinity Ward · Sledgehammer Games · Raven Software</p><p>以及所有在 2011 年冬天打通「Down the Rabbit Hole」的玩家</p>
<h3>纪念</h3><p>Truck</p>
<p class="fin">本作为粉丝自制、非商业、非官方作品。<br>《使命召唤》及相关角色版权归 Activision 所有。</p>
<p class="fin" style="font-size:18px;color:var(--bone)">Metal 0-1，完毕。</p>`;

// ---------- line helper (subtitles + optional VO) ----------
const LN = {
  E_PRICE_01: ['PRICE', "This one's for Metal.", '这一枪，替 Metal 打。'],
  E_NIKO_01: ['NIKOLAI', 'Price, I am over the station. Three bodies…', 'Price，我到雷达站上空了。三具遗体……', true],
  E_NIKO_02: ['NIKOLAI', '…No. Wait. One heat signature. Faint.', '……不，等等。有一个热源。很微弱。', true],
};
function line(id) {
  const L = LN[id]; const vo = playVO(id, !!L[3]);
  HUD.say(L[0], L[2], !!L[3]);
  C.lineEnd = C.t + (vo || Math.max(2.2, 0.8 + L[1].split(/\s+/).length * 0.38));
}

// ---------- timeline ----------
const SHOTS = [
  { t: 0, fn: () => { HUD.bigCard('三个月后', '', 3.6); } },
  { t: 4.0, fn: () => { setDubai(); HUD.fade(0, 2.5); } },
  { t: 6.5, fn: () => HUD.bigCard('迪拜', '阿拉伯联合酋长国', 5) },
  { t: 15, fn: () => HUD.hideBig() },
  { t: 26.5, fn: () => line('E_PRICE_01') },
  { t: 31.5, fn: () => HUD.bigCard('绿洲酒店', '马卡洛夫最后的落脚点', 5) },
  { t: 38.5, fn: () => HUD.fade(1, 1.4) },
  { t: 40.5, fn: () => { HUD.bigCard('弃于寒冬', 'OUT IN THE COLD', 4.5); } },
  { t: 46, fn: () => { HUD.credits.classList.add('on'); C.rollT0 = C.t; } },
  { t: 176, fn: () => { HUD.credits.classList.remove('on'); setNight(); HUD.fade(0, 2.5); musicMode('silence'); } },
  { t: 180, fn: () => line('E_NIKO_01') },
  { t: 185.2, fn: () => line('E_NIKO_02') },
  { t: 190.6, fn: () => { HUD.fade(1, 0.01, '#000'); HUD.say(null); C.lineEnd = 0; if (C.heliSnd) { C.heliSnd.stop(); C.heliSnd = null; } if (A.windLoop) A.windLoop.setVol(0); } },
  { t: 193, fn: () => HUD.bigCard('完', '感谢游玩', 0) },
  { t: 198, fn: () => finish() },
];

function setDubai() {
  clearHumans();
  if (S.root) S.root.visible = false;
  setLook({ fog: 0xc58a5a, top: 0x3c3f63, bot: 0xd9905a, density: 0.0011, sunDir: new THREE.Vector3(0.15, 0.08, -1), sun: [0xffb06a, 2.6], hemi: [0xffd2a8, 0x5a4a40, 0.7], exp: 1.05, env: 0.7, snow: false });
  buildDubai();
  // Price and Yuri on the rooftop
  C.car = buildSUV();
  const pr = new Human('us', { head: 'head_price', name: 'PRICE' }); pr.noWeapon = true; pr.grips = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  const yu = new Human('us', { head: 'head_yuri', name: 'YURI' }); yu.aimTarget = 0; yu.noWeapon = true;
  pr.sit = { seat: new THREE.Vector3() }; yu.sit = { seat: new THREE.Vector3() };
  C.humans = [pr, yu];
  if (A.windLoop) A.windLoop.setVol(0.05);
}
function setNight() {
  for (const o of C.objs) G.scene.remove(o); C.objs.length = 0; clearHumans(); C.car = null; C.humans = null;
  if (!S.built) buildStation();
  S.root.visible = true;
  setLook({ fog: 0x070a0f, top: 0x020305, bot: 0x070a0f, density: 0.03, sunDir: new THREE.Vector3(-0.3, 0.6, 0.4), sun: [0x7d8fb8, 0.08], hemi: [0x3a4658, 0x07090c, 0.22], exp: 1.0, env: 0.12, snow: true });
  W.sky.visible = false; C.heli = buildHeli();
  C.heliSnd = loop('heli', { pos: C.heli.g.position, vol: 0.9, ref: 30, rev: 0.3 });
  if (A.windLoop) A.windLoop.setVol(0.45);
}
function finish() {
  G.state = 'end';
  stopAllLoops();
  if (document.pointerLockElement) document.exitPointerLock();
  HUD.hideBig(); HUD.say(null);
  if (G.onEpilogueDone) G.onEpilogueDone();
}

export function playEpilogue() {
  saveLook();
  C.t = 0; C.on = true; C.shot = 0; C.lineEnd = 0; C.rollT0 = null; C.car = null; C.humans = null; C.heli = null; C.heliSnd = null;
  G.state = 'cine';
  HUD.show(false); HUD.root.classList.add('letterbox');
  HUD.objective(null); HUD.setPrompt(null); HUD.setUpload(null); HUD.say(null);
  HUD.credits.querySelector('.roll').innerHTML = CREDITS;
  WP.hidden = true;
  muffle(20000, 0.5);
  musicMode('credits');
}
G.playEpilogue = playEpilogue;

export function updateCine(rdt) {
  if (!C.on) return;
  C.t += rdt;
  if (hit('Space') && C.t > 2 && C.t < 170) { C.t = 175.5; C.shot = SHOTS.findIndex((s) => s.t >= 176); HUD.credits.classList.remove('on'); }
  while (C.shot < SHOTS.length && C.t >= SHOTS[C.shot].t) SHOTS[C.shot++].fn();
  if (C.lineEnd && C.t > C.lineEnd) { HUD.say(null); C.lineEnd = 0; }
  const cam = G.camera, t = C.t;
  cam.fov = 50; cam.updateProjectionMatrix();
  const carZ = lerp(240, -150, clamp((t - 14) / 24, 0, 1));
  if (C.car) {
    C.car.position.set(56.5, 0.35, carZ); C.car.rotation.y = 0;
    const [pr, yu] = C.humans;
    pr.sit.seat.set(56.05, 1.18, carZ + 0.45); pr.pos.set(56.05, 0.45, carZ + 0.45); pr.yaw = 0;
    yu.sit.seat.set(56.95, 1.18, carZ + 0.45); yu.pos.set(56.95, 0.45, carZ + 0.45); yu.yaw = 0.1;
    pr.grips.R.set(56.2, 1.58, carZ - 0.12); pr.grips.L.set(55.9, 1.58, carZ - 0.12);
    yu.aim.set(0.3, 0, -1);
  }
  if (window.__lockCam) { if (C.humans) for (const h of C.humans) h.vel.set(0, 0, 0); return; }
  if (t < 15) { // wide over the water toward the skyline
    const u = smooth((t - 4) / 11);
    cam.position.set(lerp(-90, -10, u), lerp(22, 34, u), lerp(320, 170, u));
    cam.lookAt(_l.set(110, lerp(120, 150, u), -420));
  } else if (t < 24) { // tracking shot alongside the SUV on the coastal highway
    const u = (t - 15) / 9;
    cam.position.set(56.5 - lerp(7, 4.5, u), lerp(1.6, 2.4, u), carZ + lerp(5, -1, u));
    cam.lookAt(_l.set(56.5, 1.1, carZ - 3));
  } else if (t < 31) { // from the back seat: the hotel through the windscreen
    cam.position.set(56.5, 1.95, carZ + 1.75);
    cam.lookAt(_l.set(100, 35, -420));
    cam.fov = 58; cam.updateProjectionMatrix();
  } else if (t < 40) { // push toward the hotel crown
    const u = smooth((t - 31) / 9);
    cam.position.set(lerp(30, 70, u), lerp(130, 215, u), lerp(-120, -290, u));
    cam.lookAt(_l.set(110, 250, -420));
  } else if (t >= 176 && C.heli) { // blizzard night: Nikolai's searchlight sweeps the roof and the dish
    const H = C.heli, u = t - 176;
    H.g.position.set(lerp(30, 18, smooth(u / 15)) + Math.sin(u * 0.7) * 0.6, 26 + Math.sin(u * 1.1) * 0.5, lerp(-34, -24, smooth(u / 15)));
    H.g.rotation.set(0.08, 2.3 - u * 0.012, Math.sin(u * 0.9) * 0.03);
    H.rotor.rotation.y += rdt * 24; H.tail.rotation.x += rdt * 60;
    const on = (u % 1.1) < 0.12; H.beacon.visible = on; H.bl.intensity = on ? 40 : 0; H.tailW.visible = (u % 1.6) < 0.1;
    if (C.heliSnd) C.heliSnd.setPos(H.g.position);
    // sweep: across the roof from the stairs, over the dish, then it stops on a spot beside the dish
    const k = smooth(clamp((u - 1) / 9, 0, 1));
    _v.set(lerp(9, -2.2, k) + Math.sin(u * 1.7) * lerp(1.6, 0.2, k), 4.4, lerp(-4, 1.6, k) + Math.cos(u * 1.3) * lerp(2.2, 0.3, k));
    if (u > 4.5 && u < 7.5) _v.lerp(_l.set(-3.5, 5.6, -0.5), Math.sin((u - 4.5) / 3 * Math.PI)); // lingers on the dish
    H.g.updateMatrixWorld(true);
    H.spot.target.position.copy(_v); H.spot.target.updateMatrixWorld();
    H.spot.getWorldPosition(H.cone.position); H.cone.lookAt(_v); H.cone.scale.setScalar(H.cone.position.distanceTo(_v) * 1.05);
    if (u < 8.5) { // wide from the snowfield south-west of the station
      cam.position.set(lerp(-36, -32, u / 8.5), 11, lerp(40, 36, u / 8.5));
      cam.lookAt(_l.set(lerp(4, 2, u / 8.5), 9, -6)); cam.fov = 46;
    } else { // closer, slow push toward the roof and the dish under the beam
      const w = (u - 8.5) / 6.5;
      cam.position.set(lerp(-13, -11, w), lerp(9.5, 9, w), lerp(12, 10, w));
      cam.lookAt(_l.set(-2.6, 5.0, 0.2)); cam.fov = 42;
    }
    cam.updateProjectionMatrix();
  }
  if (C.rollT0 !== null && HUD.credits.classList.contains('on')) {
    const roll = HUD.credits.querySelector('.roll');
    const total = roll.offsetHeight + innerHeight;
    const k = clamp((C.t - C.rollT0) / 128, 0, 1);
    roll.style.transform = `translateY(${-k * total}px)`;
  }
  if (C.humans) for (const h of C.humans) h.vel.set(0, 0, 0);
}
