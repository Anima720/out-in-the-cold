import { G, THREE } from './core.js';
import { Builder, mat4 } from './geom.js';

// Weapon attachments (package W): optics (red dot / holographic / 2x ACOG) and underbarrels (M203 / GP-25 grenade
// launcher, Masterkey-style shotgun) for the first-person viewmodels, their reticles, and W's own small HUD nodes.
// Optic groups have their origin at the optic's sight axis centre; underbarrel groups at the handguard bottom.
const H = Math.PI / 2;
export const OPT_NAME = { iron: '机械瞄具', reddot: '红点', holo: '全息', x2: '2倍镜', pso: 'ПСО-1' };
export const UB_NAME = { gl: '下挂榴弹', shotgun: '下挂霰弹' };
// sight data: half length, eye relief (ADS distance from the eye to the optic's rear), ADS world FOV, lowest point below the axis
export const OPT = {
  reddot: { len: 0.066, eye: 0.15, fov: 50, bot: 0.018 },
  holo: { len: 0.07, eye: 0.16, fov: 50, bot: 0.033 },
  x2: { len: 0.15, eye: 0.068, fov: 31, bot: 0.025 },
};

function flip(g) { // inward-facing copy (inner wall of a tube)
  g = g.index ? g.toNonIndexed() : g;
  for (const k of ['position', 'normal', 'uv']) {
    const a = g.attributes[k]; if (!a) continue; const s = a.itemSize, r = a.array;
    for (let i = 0; i < a.count; i += 3) for (let c = 0; c < s; c++) { const t = r[(i + 1) * s + c]; r[(i + 1) * s + c] = r[(i + 2) * s + c]; r[(i + 2) * s + c] = t; }
  }
  const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}
// hollow tube along z centred at (x,y,z): outer wall, optional inner wall, rear (+z) and front rings
function tube(b, x, y, z, rIn, rOut, L, key, inner = true, seg = 28) {
  b.add(new THREE.CylinderGeometry(rOut, rOut, L, seg, 1, true), key, 0xffffff, mat4(x, y, z, H));
  if (inner) b.add(flip(new THREE.CylinderGeometry(rIn, rIn, L, seg, 1, true)), key, 0xffffff, mat4(x, y, z, H));
  b.add(new THREE.RingGeometry(rIn, rOut, seg), key, 0xffffff, mat4(x, y, z + L / 2));
  b.add(new THREE.RingGeometry(rIn, rOut, seg), key, 0xffffff, mat4(x, y, z - L / 2, 0, Math.PI));
}

// ---------- reticles (canvas textures, drawn white/black; colour comes from the material so it can be HDR for bloom)
function canvas(N) { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function dotTex() {
  const [c, g] = canvas(256), m = 128;
  let gr = g.createRadialGradient(m, m, 0, m, m, 34); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  gr = g.createRadialGradient(m, m, 0, m, m, 12); gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(m, m, 12, 0, 6.283); g.fill();
  return tex(c);
}
function holoTex() {
  const [c, g] = canvas(256), m = 128;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowColor = '#fff';
  g.shadowBlur = 6; g.lineWidth = 4.2; g.beginPath(); g.arc(m, m, 74, 0, 6.283); g.stroke();
  g.lineWidth = 4.6; for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { g.beginPath(); g.moveTo(m + dx * 74, m + dy * 74); g.lineTo(m + dx * 88, m + dy * 88); g.stroke(); }
  g.shadowBlur = 5; g.beginPath(); g.arc(m, m, 5.2, 0, 6.283); g.fill();
  return tex(c);
}
function acogTex(lines) {
  const [c, g] = canvas(256), m = 128;
  if (lines) { // black crosshair + bullet-drop stadia (TA31-style)
    g.fillStyle = 'rgba(8,8,8,0.92)';
    g.fillRect(0, m - 1.2, m - 22, 2.4); g.fillRect(m + 22, m - 1.2, 128 - 22, 2.4);
    g.fillRect(m - 1.2, m + 16, 2.4, 112);
    for (let k = 1; k <= 4; k++) { const y = m + 16 + k * 20, w = 18 - k * 3; g.fillRect(m - w, y - 1, w * 2, 2); }
    g.fillRect(m - 2.2, 0, 4.4, 26); // top post
  } else { // illuminated chevron
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(m, m - 2); g.lineTo(m + 11, m + 15); g.lineTo(m + 7, m + 15); g.lineTo(m, m + 5); g.lineTo(m - 7, m + 15); g.lineTo(m - 11, m + 15); g.closePath(); g.fill();
  }
  return tex(c);
}

let RM = null;
function mats(VM) {
  if (RM) return RM;
  const glass = (c, o = 0.16) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.03, metalness: 0.1, transparent: true, opacity: o, envMapIntensity: 2.2, depthWrite: false });
  const hdr = (map, c) => new THREE.MeshBasicMaterial({ map, color: c, transparent: true, depthWrite: false, fog: false }); // normal blend: stays red over snow
  RM = { ...VM,
    lensR: glass(0xb6a6d8), lensH: glass(0xa6d2c0, 0.13), lensA: glass(0x86aed8, 0.1),
    retDot: hdr(dotTex(), new THREE.Color(2.6, 0.07, 0.04)), retHolo: hdr(holoTex(), new THREE.Color(2.3, 0.08, 0.05)),
    retAcog: new THREE.MeshBasicMaterial({ map: acogTex(true), transparent: true, depthWrite: false, fog: false }),
    retChev: hdr(acogTex(false), new THREE.Color(2.6, 0.5, 0.06)),
    fiber: new THREE.MeshStandardMaterial({ color: 0x200800, emissive: 0xff5a1a, emissiveIntensity: 1.5, roughness: 0.4 }),
    bore: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    dull: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.9, metalness: 0.2 }),
  };
  return RM;
}
function plane(w, h, mat, x, y, z, order) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.renderOrder = order; return m; }

// riser from the optic body down to the mount (stretched per host)
function riser(g, R, w, len, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, len), R.gun); m.position.set(0, 0, z); g.add(m); g.userData.riser = m; return m;
}

function buildRedDot(R) { // Aimpoint T-1 style micro dot on a riser
  const g = new THREE.Group(), b = new Builder(), L = OPT.reddot.len;
  tube(b, 0, 0, 0, 0.0128, 0.0165, L, 'gun');
  tube(b, 0, 0, L / 2 - 0.004, 0.0128, 0.0174, 0.008, 'gun', false, 28);                    // end bands (open rings)
  tube(b, 0, 0, -L / 2 + 0.005, 0.0128, 0.0177, 0.009, 'gun', false, 28);
  b.cyl(0.019, 0.003, 0.004, 0.0085, 0.0085, 0.012, 'gun', 0xffffff, 0, 0, H, 14);          // brightness turret
  b.cyl(0, 0.0195, 0.006, 0.0075, 0.0075, 0.009, 'gun', 0xffffff, 0, 0, 0, 14);             // windage cap
  b.boxC(0, -0.0145, 0, 0.022, 0.008, 0.04, 'gun', 0, 0, 0, 0, 0.002);
  b.build(R, g, { cast: false });
  const ret = plane(0.02, 0.02, R.retDot, 0, 0, -L / 2 + 0.006, 11); g.add(ret);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0128, 28), R.lensR); lens.position.z = -L / 2 + 0.004; lens.renderOrder = 10; g.add(lens);
  riser(g, R, 0.024, 0.036);
  return { g, ret };
}

function buildHolo(R) { // EOTech EXPS-style: window with hood, side buttons, rail base
  const g = new THREE.Group(), b = new Builder(), L = OPT.holo.len, WW = 0.03, WH = 0.024, T = 0.0045;
  b.boxC(0, -WH / 2 - 0.006, 0.0, WW + 0.012, 0.012, L, 'poly', 0, 0, 0, 0, 0.003);       // body under the window
  for (const s of [-1, 1]) b.boxC(s * (WW / 2 + T / 2), 0.001, -0.004, T, WH + 0.006, L - 0.012, 'poly', 0, 0, 0, 0, 0.0015);
  b.boxC(0, WH / 2 + T / 2, -0.004, WW + 2 * T, T, L - 0.012, 'poly', 0, 0, 0, 0, 0.0015);  // hood
  b.boxC(0, WH / 2 + T + 0.002, -0.004, 0.01, 0.004, 0.02, 'poly', 0, 0, 0, 0, 0.001);
  for (const s of [-1, 1]) b.boxC(s * 0.007, -WH / 2 - 0.004, L / 2 + 0.002, 0.008, 0.006, 0.006, 'gunW', 0, 0, 0, 0, 0.001); // buttons
  b.boxC(WW / 2 + T + 0.004, -0.002, 0.008, 0.007, 0.012, 0.022, 'poly', 0, 0, 0, 0, 0.002); // side knob
  b.boxC(0, -WH / 2 - 0.016, 0.0, 0.026, 0.01, L * 0.8, 'gun', 0, 0, 0, 0, 0.002);
  b.build(R, g, { cast: false });
  const ret = plane(0.024, 0.024, R.retHolo, 0, 0, -0.012, 11); g.add(ret);
  for (const z of [-L / 2 + 0.004, L / 2 - 0.012]) { const l = plane(WW, WH, R.lensH, 0, 0, z, 10); g.add(l); }
  riser(g, R, 0.026, 0.05);
  return { g, ret };
}

function buildACOG(R) { // Trijicon TA31 style 4x-looking body used as a 2x: ocular bell, tube, objective bell, fibre optic
  const g = new THREE.Group(), b = new Builder(), L = OPT.x2.len;
  tube(b, 0, 0, L / 2 - 0.018, 0.0165, 0.0205, 0.036, 'gun', false);   // ocular (no inner wall: the eye sees through)
  tube(b, 0, 0, -0.005, 0.0145, 0.0165, 0.08, 'gun', false);
  tube(b, 0, 0, -L / 2 + 0.02, 0.0165, 0.021, 0.04, 'gun', false);     // objective bell
  tube(b, 0, 0, L / 2 - 0.0015, 0.0168, 0.0215, 0.003, 'poly', false, 28);                 // rubber eyepiece rim
  b.boxC(0, 0.021, -0.012, 0.016, 0.01, 0.06, 'gun', 0, 0, 0, 0, 0.002);    // elevation housing / fibre mount
  b.cyl(0.019, 0.0, -0.005, 0.008, 0.008, 0.012, 'gun', 0xffffff, 0, 0, H, 14);
  b.cyl(0, 0.022, -0.005, 0.008, 0.008, 0.01, 'gun', 0xffffff, 0, 0, 0, 14);
  b.boxC(0, -0.021, 0.0, 0.03, 0.008, 0.07, 'gun', 0, 0, 0, 0, 0.002);
  b.build(R, g, { cast: false });
  // eyepiece rim seen from the eye: a dark ring so the ADS view has a crisp housing edge
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.0168, 0.0215, 32), R.dull); rim.position.z = L / 2 + 0.0002; g.add(rim);
  const fib = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.07, 8), R.fiber); fib.rotation.x = H; fib.position.set(0, 0.0275, -0.012); g.add(fib);
  const ret = plane(0.03, 0.03, R.retAcog, 0, 0, 0.0, 11); g.add(ret);
  const chev = plane(0.03, 0.03, R.retChev, 0, 0, -0.0005, 12); g.add(chev);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0165, 28), R.lensA); lens.position.z = -L / 2 + 0.004; lens.renderOrder = 10; g.add(lens);
  riser(g, R, 0.03, 0.07);
  return { g, ret };
}

// ---------- underbarrels (origin = handguard bottom centre; axis -z)
function buildM203(R, gp) {
  const g = new THREE.Group(), b = new Builder(), Y = -0.026, L = gp ? 0.19 : 0.21, Z = gp ? -0.045 : -0.035;
  b.cyl(0, Y, Z, 0.0215, 0.0215, L, gp ? 'gun' : 'gunW', 0xffffff, H, 0, 0, 22);
  for (const k of [0.25, 0.5, 0.75]) b.cyl(0, Y, Z - L / 2 + L * k, 0.0228, 0.0228, 0.006, 'gun', 0xffffff, H, 0, 0, 22);
  b.add(new THREE.RingGeometry(0.016, 0.0216, 22), 'gun', 0xffffff, mat4(0, Y, Z - L / 2 - 0.0005, 0, Math.PI));
  b.boxC(0, -0.004, Z + 0.01, 0.028, 0.01, L * 0.9, 'gun', 0, 0, 0, 0, 0.002);            // mount clamp
  if (gp) { // GP-25: squared receiver + trigger housing with its own short grip
    b.boxC(0, -0.024, Z + L / 2 + 0.035, 0.044, 0.044, 0.07, 'gun', 0, 0, 0, 0, 0.005);
    b.boxC(0, -0.07, Z + L / 2 + 0.06, 0.03, 0.06, 0.036, 'plum', 0xffffff, -0.25, 0, 0, 0.008);
    b.boxC(0, -0.052, Z + L / 2 + 0.028, 0.006, 0.026, 0.005, 'gunW', 0xffffff, -0.2, 0, 0, 0.001);
    b.boxC(0.024, -0.02, Z + L / 2 + 0.02, 0.006, 0.014, 0.03, 'gunW', 0, 0, 0, 0, 0.001);
  } else { // M203: breech/receiver, trigger guard, leaf sight bracket
    b.boxC(0, -0.022, Z + L / 2 + 0.04, 0.046, 0.04, 0.08, 'gun', 0, 0, 0, 0, 0.005);
    b.boxC(0, -0.05, Z + L / 2 + 0.05, 0.008, 0.006, 0.05, 'gun', 0, 0, 0, 0, 0.001);
    b.boxC(0, -0.046, Z + L / 2 + 0.072, 0.008, 0.016, 0.006, 'gun', 0, 0, 0, 0, 0.001);
    b.boxC(0, -0.047, Z + L / 2 + 0.04, 0.005, 0.016, 0.005, 'gunW', 0xffffff, -0.25, 0, 0, 0.001);
    b.boxC(0.024, -0.018, Z + L / 2 + 0.03, 0.004, 0.012, 0.03, 'gunW', 0, 0, 0, 0, 0.001);
  }
  b.build(R, g, { cast: false });
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.016, 18), R.bore); bore.position.set(0, Y, Z - L / 2 + 0.002); bore.rotation.y = Math.PI; g.add(bore);
  return { g, muzzle: new THREE.Vector3(0, Y, Z - L / 2 - 0.01), hand: -0.046 };
}
function buildMasterkey(R) {
  const g = new THREE.Group(), b = new Builder();
  b.cyl(0, -0.016, -0.045, 0.0125, 0.0125, 0.25, 'gun', 0xffffff, H, 0, 0, 16);
  b.cyl(0, -0.042, -0.03, 0.0112, 0.0112, 0.2, 'gun', 0xffffff, H, 0, 0, 14);
  b.boxC(0, -0.034, -0.085, 0.034, 0.042, 0.08, 'poly', 0, 0, 0, 0, 0.008);                  // pump
  for (let i = 0; i < 5; i++) b.boxC(0, -0.056, -0.115 + i * 0.015, 0.03, 0.004, 0.006, 'poly', 0, 0, 0, 0, 0.001);
  b.boxC(0, -0.03, 0.105, 0.032, 0.052, 0.07, 'gun', 0, 0, 0, 0, 0.004);                     // receiver
  b.boxC(0, -0.062, 0.115, 0.008, 0.006, 0.045, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, -0.06, 0.098, 0.005, 0.016, 0.005, 'gunW', 0xffffff, -0.25, 0, 0, 0.001);
  b.boxC(0, -0.004, 0.0, 0.026, 0.01, 0.22, 'gun', 0, 0, 0, 0, 0.002);
  b.boxC(0, -0.03, -0.165, 0.03, 0.044, 0.014, 'gun', 0, 0, 0, 0, 0.003);                     // front band
  b.build(R, g, { cast: false });
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0095, 14), R.bore); bore.position.set(0, -0.016, -0.171); bore.rotation.y = Math.PI; g.add(bore);
  return { g, muzzle: new THREE.Vector3(0, -0.016, -0.18), hand: -0.04 };
}

// full-ADS view through the 2x scope: the eye sits at the eyepiece, so the gun is hidden and only the eyepiece rim
// and the reticle remain, fixed on the view axis (bullets go there); W's vignette dims the world around it
function buildScopeView(R) {
  const g = new THREE.Group(), E = OPT.x2.eye;
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.0166, 0.03, 48), R.dull); rim.position.z = -E; g.add(rim);
  const lip = new THREE.Mesh(new THREE.RingGeometry(0.0163, 0.0176, 48), R.gun); lip.position.z = -E + 0.0004; g.add(lip);
  g.add(plane(0.03, 0.03, R.retAcog, 0, 0, -E - 0.07, 11));
  g.add(plane(0.03, 0.03, R.retChev, 0, 0, -E - 0.0705, 12));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0168, 32), R.lensA); lens.position.z = -E - 0.002; lens.renderOrder = 10; g.add(lens);
  g.visible = false;
  return g;
}

export function buildAttachments(VM) {
  const R = mats(VM);
  const A = { opt: { reddot: buildRedDot(R), holo: buildHolo(R), x2: buildACOG(R) }, ub: { gl: buildM203(R, false), gp: buildM203(R, true), shotgun: buildMasterkey(R) }, scope: buildScopeView(R) };
  for (const o of [...Object.values(A.opt), ...Object.values(A.ub)]) o.g.visible = false;
  return A;
}

// mount the attachment set `att` on viewmodel `m` (shared groups are re-parented to whichever model is equipped)
export function fitAttachments(A, m, att) {
  const opt = att && OPT[att.optic] && m.mount ? att.optic : null;
  for (const [k, o] of Object.entries(A.opt)) {
    const on = k === opt; o.g.visible = on; if (!on) continue;
    const mt = m.mount; m.g.add(o.g); o.g.position.set(0, mt.cy, mt.z);
    const r = o.g.userData.riser, h = Math.max(0.002, mt.cy - OPT[k].bot - mt.y);
    r.scale.y = h; r.position.y = -OPT[k].bot - h / 2;
  }
  if (m.rs) m.rs.rotation.x = opt ? 1.45 : 0;                       // M4: fold the flip-up rear sight
  if (m.bracket) m.bracket.visible = !!opt;                          // AK side-mount bracket
  const a0 = m.ads0 || (m.ads0 = { sightY: m.sightY, rearZ: m.rearZ, adsZ: m.adsZ });
  if (opt) { m.sightY = m.mount.cy; m.rearZ = m.mount.z + OPT[opt].len / 2; m.adsZ = -OPT[opt].eye; }
  else Object.assign(m, a0);
  m.adsFov = opt ? OPT[opt].fov : 0;
  const ubk = att && att.under && m.ubm ? (att.under === 'gl' && m.ak ? 'gp' : att.under) : null;
  for (const [k, o] of Object.entries(A.ub)) {
    const on = k === ubk; o.g.visible = on; if (!on) continue;
    m.g.add(o.g); o.g.position.set(0, m.ubm.y, m.ubm.z);
  }
  if (m.lh) m.lh.position.y = ubk ? A.ub[ubk].hand : 0;
  m.ub = ubk ? A.ub[ubk] : null; m.optic = opt;
  if (m.ub) m.ubMuzzle = (m.ubMuzzle || new THREE.Vector3()).copy(m.ub.muzzle).add(m.ub.g.position);
}

export function attLabel(att) {
  if (!att) return '';
  const p = [];
  if (att.optic && att.optic !== 'iron' && att.optic !== 'pso') p.push(OPT_NAME[att.optic]);
  if (att.under) p.push(UB_NAME[att.under]);
  return p.length ? `（${p.join(' · ')}）` : '';
}

// ---------- W's own HUD nodes (inside #ui): underbarrel ammo line, throw-back prompt, 2x scope vignette
const UI = {};
export function wui() {
  if (UI.ok) return UI;
  const ui = document.getElementById('ui'); if (!ui || !G.hud || !G.hud.ammo) return null;
  const st = document.createElement('style');
  st.textContent = `.am-ub { font-size:12px; letter-spacing:.14em; color:var(--dim,#9a9a90); margin-top:5px; white-space:nowrap; }
.am-ub b { color:var(--bone,#ebe7dc); font-weight:700; margin-left:4px; }
.am-ub kbd { font-family:inherit; font-size:11px; padding:0 5px; margin-right:6px; border:1px solid rgba(255,255,255,.45); border-radius:3px; }
.am-ub.on { color:#ffd27a; }
.wprompt { left:50%; top:calc(min(57%, calc(100% - 215px)) + 64px); transform:translateX(-50%); font-size:clamp(16px, 4.4vh, 22px); font-weight:800; letter-spacing:.08em; color:#fff; opacity:0; transition:opacity .12s; text-shadow:0 0 2px #000, 0 1px 6px #000; white-space:nowrap; }
.wprompt kbd { display:inline-block; font-family:inherit; font-size:15px; padding:2px 9px; margin:0 4px; border:1px solid #ff6a50; border-radius:3px; background:rgba(120,20,10,.45); }
.wprompt.on { opacity:1; animation:wpb .4s infinite alternate; }
@keyframes wpb { to { color:#ffb09e; } }
.wvig { inset:0; opacity:0; pointer-events:none; }
#ui:not(.hud-on) .wprompt, #ui:not(.hud-on) .wvig { display:none; }`;
  document.head.appendChild(st);
  UI.ub = document.createElement('div'); UI.ub.className = 'am-ub'; G.hud.ammo.appendChild(UI.ub);
  UI.tb = document.createElement('div'); UI.tb.className = 'wprompt'; UI.tb.innerHTML = '按 <kbd>G</kbd> 掷回'; ui.appendChild(UI.tb);
  UI.vig = document.createElement('div'); UI.vig.className = 'wvig'; ui.insertBefore(UI.vig, ui.firstChild); // under the rest of the HUD
  UI.ok = true; UI.k = ''; UI.vk = ''; UI.tbOn = false; UI.vo = -1;
  return UI;
}
// k: underbarrel line html (or ''), tb: show throw-back prompt, vig: 2x vignette opacity
export function updateWUI(ubHtml, ubOn, tb, vig) {
  const U = wui(); if (!U) return;
  const k = ubHtml + (ubOn ? '1' : '0');
  if (k !== U.k) { U.k = k; U.ub.innerHTML = ubHtml; U.ub.style.display = ubHtml ? '' : 'none'; U.ub.classList.toggle('on', !!ubOn); }
  if (tb !== U.tbOn) { U.tbOn = tb; U.tb.classList.toggle('on', tb); }
  const vk = `${innerWidth}x${innerHeight}`;
  if (vig > 0.01 && vk !== U.vk) { // hole = the ACOG eyepiece as seen from the eye (viewmodel camera fov 50)
    U.vk = vk; const r = (Math.tan(Math.atan(0.0168 / OPT.x2.eye)) / Math.tan((25 * Math.PI) / 180)) * innerHeight * 0.5;
    U.vig.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${(r * 0.9).toFixed(0)}px, rgba(0,0,0,.5) ${(r * 1.02).toFixed(0)}px, rgba(0,0,0,.72) ${(r * 1.3).toFixed(0)}px)`;
  }
  const vo = Math.round(vig * 50) / 50;
  if (vo !== U.vo) { U.vo = vo; U.vig.style.opacity = String(vo); }
}
