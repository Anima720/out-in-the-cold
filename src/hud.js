import { G, THREE, clamp } from './core.js';
import { WP, curDef } from './weapon.js';
import { NADES } from './grenade.js';

const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
// speaker tags in LINES stay English; this is what the player sees
export const NAME = { SANDMAN: '沙人', TRUCK: '卡车', GRINCH: '格林奇', PRICE: '普莱斯', NIKOLAI: '尼科莱', YURI: '尤里', '克拉辛': '俄军高级将领' };
const COL = { SANDMAN: '#9fd0ff', TRUCK: '#ffd27a', GRINCH: '#a9f0a0', NIKOLAI: '#c9b8f0', '克拉辛': '#ff8a76', PRICE: '#d9c08a' };

export const HUD = {};
export function initHUD() {
  const ui = document.getElementById('ui');
  HUD.root = ui;
  HUD.vign = $('div', 'vign', ui);
  HUD.blood = $('div', 'blood', ui);
  HUD.slow = $('div', 'slowmo', ui);
  HUD.obj = $('div', 'obj', ui, '<div class="obj-k">目标</div><div class="obj-t"></div>');
  HUD.objT = HUD.obj.querySelector('.obj-t');
  HUD.cross = $('div', 'cross', ui, '<i></i><i></i><i></i><i></i>');
  HUD.hitm = $('div', 'hitm', ui, '<i></i><i></i><i></i><i></i>');
  HUD.dmg = $('div', 'dmgind', ui);
  HUD.ammo = $('div', 'ammo', ui, '<div class="am-n"><b>30</b><span>/ 270</span></div><div class="am-bar"></div><div class="am-w">AK-74M</div><div class="am-g"></div><div class="heat"><i></i></div>');
  HUD.amBar = HUD.ammo.querySelector('.am-bar');
  HUD.amG = HUD.ammo.querySelector('.am-g');
  HUD.nadeInd = [0, 1, 2].map(() => $('div', 'nadeind', ui, '<i></i><span>▲</span>'));
  HUD.amN = HUD.ammo.querySelector('b'); HUD.amR = HUD.ammo.querySelector('span'); HUD.amW = HUD.ammo.querySelector('.am-w');
  HUD.heat = HUD.ammo.querySelector('.heat'); HUD.heatI = HUD.heat.querySelector('i');
  HUD.sub = $('div', 'sub', ui);
  HUD.prompt = $('div', 'prompt', ui);
  HUD.marker = $('div', 'marker', ui, '<i></i><span></span>');
  HUD.markerT = HUD.marker.querySelector('span');
  HUD.loc = $('div', 'loc', ui);
  HUD.fadeEl = $('div', 'fade', ui);
  HUD.menu = $('div', 'menu', ui);
  HUD.upl = $('div', 'upl', ui, '<div class="row"><span>情报上传</span><b>0%</b></div><div class="bar"><i></i></div>');
  HUD.uplB = HUD.upl.querySelector('b'); HUD.uplI = HUD.upl.querySelector('.bar i');
  HUD.holdEl = $('div', 'hold', ui, '<i></i>'); HUD.holdI = HUD.holdEl.querySelector('i');
  HUD.lockEl = $('div', 'lockbox', ui, '<span></span>'); HUD.lockS = HUD.lockEl.querySelector('span');
  HUD.big = $('div', 'bigcard', ui);
  HUD.comp = $('div', 'compass', ui, '<div class="strip"></div><div class="ctr"></div><div class="tgt"></div>');
  { const st = HUD.comp.querySelector('.strip'); let h = '';
    const N = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -360; d <= 720; d += 15) { const k = ((d % 360) + 360) % 360; h += `<span class="${N[k] !== undefined ? 'c' : ''}" style="left:${(d + 360) * 4}px">${N[k] ?? k}</span>`; }
    st.innerHTML = h; HUD.compStrip = st; HUD.compTgt = HUD.comp.querySelector('.tgt'); }
  HUD.credits = $('div', 'credits', ui, '<div class="roll"></div>');
  HUD.toastEl = $('div', 'toast', ui);
  HUD.ftag = $('div', 'ftag', ui);
  HUD.scope = $('div', 'scope', ui, '<i></i><i></i><b></b>');
  HUD.threat = $('div', 'threat', ui, '<b></b><i></i><span></span>'); HUD.thS = HUD.threat.querySelector('span'); HUD.thA = HUD.threat.querySelector('b');
  initMinimap(ui);
  HUD.hitT = 0; HUD.dmgList = []; HUD.mk = null; HUD.lk = null; HUD.th = null;
  G.hud = HUD;
}

HUD.objective = (t) => {
  if (!t) { HUD.obj.classList.remove('on'); return; }
  HUD.objT.textContent = t; HUD.obj.classList.remove('on'); void HUD.obj.offsetWidth; HUD.obj.classList.add('on', 'flash');
  setTimeout(() => HUD.obj.classList.remove('flash'), 1600);
};
HUD.say = (who, text, radio) => {
  if (!who) { HUD.sub.classList.remove('on'); return; }
  const c = COL[who] || '#ebe7dc';
  HUD.sub.style.setProperty('--c', c);
  HUD.sub.innerHTML = `<span class="sp">${NAME[who] || who}${radio ? '<em>无线电</em>' : ''}</span><span class="tx">${text}</span>`;
  HUD.sub.classList.add('on');
};
HUD.setPrompt = (html) => {
  if (HUD._p === html) return; HUD._p = html;
  if (!html) { HUD.prompt.classList.remove('on'); return; }
  HUD.prompt.innerHTML = html; HUD.prompt.classList.add('on'); HUD._pT = G.t;
};
// true while an interaction prompt is (or was within the last few frames) on screen: F means "interact", not melee
HUD.promptActive = () => !!HUD._p || (HUD._pT !== undefined && G.t - HUD._pT < 0.15) || !!G.otherPrompt;
HUD.hitmarker = (kill) => { HUD.hitT = kill ? 0.32 : 0.16; HUD.hitm.classList.toggle('kill', !!kill); };
HUD.damage = (ang, amt) => {
  const el = $('div', 'dmgarc', HUD.dmg);
  el.style.transform = `rotate(${(-ang * 180) / Math.PI}deg)`;
  HUD.dmgList.push({ el, t: 0, a: clamp(amt / 25, 0.4, 1) });
};
HUD.setMarker = (pos, label) => { HUD.mk = pos ? { pos, label } : null; };
HUD.locCard = (lines) => {
  HUD.loc.innerHTML = `<i></i><b>${lines[0]}</b>` + lines.slice(1).map((l) => `<span>${l}</span>`).join('');
  HUD.loc.classList.remove('on'); void HUD.loc.offsetWidth; HUD.loc.classList.add('on');
  setTimeout(() => HUD.loc.classList.remove('on'), 7000);
};
HUD.fade = (to, dur = 1, color = '#000') => {
  HUD.fadeEl.style.background = color;
  HUD.fadeEl.style.transition = `opacity ${dur}s ease`;
  requestAnimationFrame(() => { HUD.fadeEl.style.opacity = to; });
};
HUD.setUpload = (p, stall, label) => {
  if (p === null || p === undefined) { HUD.upl.classList.remove('on'); return; }
  HUD.upl.classList.add('on'); HUD.upl.classList.toggle('stall', !!stall);
  HUD.uplI.style.width = `${clamp(p, 0, 100)}%`;
  const t = label ?? (stall ? `${Math.floor(p)}% · 信号中断` : `${Math.floor(p)}%`);
  if (HUD.uplB.textContent !== t) HUD.uplB.textContent = t;
};
// red threat marker: pos = live Vector3 (read every frame) or null to clear
HUD.setThreat = (pos, label) => {
  HUD.th = pos ? { pos, label: label || '', d: -1 } : null;
  if (pos) HUD.thS.textContent = label || ''; else HUD.threat.classList.remove('on');
};
HUD.setHold = (k) => { HUD.holdEl.classList.toggle('on', k !== null && k > 0); if (k !== null) HUD.holdI.style.width = `${clamp(k, 0, 1) * 100}%`; };
HUD.setLock = (state, pos) => { HUD.lk = state ? { state, pos } : null; };
HUD.bigCard = (title, sub, dur = 5) => {
  HUD.big.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  HUD.big.classList.add('on'); clearTimeout(HUD._bigT);
  if (dur > 0) HUD._bigT = setTimeout(() => HUD.big.classList.remove('on'), dur * 1000);
};
HUD.hideBig = () => HUD.big.classList.remove('on');
HUD.toast = (t) => {
  HUD.toastEl.textContent = t; HUD.toastEl.classList.remove('on'); void HUD.toastEl.offsetWidth; HUD.toastEl.classList.add('on');
  clearTimeout(HUD._toT); HUD._toT = setTimeout(() => HUD.toastEl.classList.remove('on'), 1800);
};
HUD.setSlowmo = (on) => { HUD.slow.classList.toggle('on', on); };
HUD.hideMenu = () => { HUD.menu.className = 'menu'; HUD.menu.innerHTML = ''; };
HUD.showMenu = (cls, html, handlers = {}) => {
  HUD.menu.className = 'menu on ' + cls; HUD.menu.innerHTML = html;
  for (const [sel, fn] of Object.entries(handlers)) HUD.menu.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); }));
};
HUD.show = (on) => { HUD.root.classList.toggle('hud-on', on); };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
export function updateHUD(dt) {
  const P = G.player;
  // ammo / heat
  if (P.mounted) {
    HUD.amN.textContent = '∞'; HUD.amR.textContent = ''; HUD.amW.textContent = 'DShK 12.7mm';
    HUD.heat.style.display = 'block'; HUD.heatI.style.width = `${WP.heat * 100}%`; HUD.heat.classList.toggle('hot', WP.overheated);
  } else {
    HUD.amN.textContent = WP.ammo; HUD.amR.textContent = `/ ${WP.reserve}`; HUD.amW.textContent = WP.reloadT >= 0 ? '换弹中…' : curDef().name;
    HUD.heat.style.display = 'none';
    HUD.amN.classList.toggle('low', WP.ammo <= 8);
  }
  { const mag = P.mounted ? 0 : curDef().mag, k = `${WP.cur}|${WP.ammo}|${P.mounted}`;
    if (HUD._bk !== k) { HUD._bk = k; const n = Math.min(mag, 40); HUD.amBar.innerHTML = mag ? '<i></i>'.repeat(Math.min(WP.ammo, n)) .replace(/<i><\/i>/g, '<i></i>') + '<i class="e"></i>'.repeat(Math.max(0, n - WP.ammo)) : ''; } }
  WP.scoped = G.state === 'play' && !P.mounted && WP.cur === 'svd' && WP.adsT > 0.85 && !WP.sw;
  HUD.scope.classList.toggle('on', WP.scoped); HUD.cross.style.opacity = WP.scoped ? '0' : '';
  // friendly name tag when looking at a teammate
  { let best = null, ba = 0.09;
    if (G.state === 'play' && G.mates) { G.camera.getWorldDirection(_v2);
      for (const m of G.mates) { const h = m.h; if (!h.alive || h.hidden || !h.name) continue;
        _v3.copy(h.j[0]).sub(G.camera.position); const d = _v3.length(); if (d > 30 || d < 1) continue;
        const a = Math.acos(clamp(_v3.dot(_v2) / d, -1, 1)); if (a < ba) { ba = a; best = h; } } }
    if (best) { _v3.copy(best.j[0]).setY(best.j[0].y + 0.38).project(G.camera);
      HUD.ftag.textContent = best.name.charAt(0) + best.name.slice(1).toLowerCase(); HUD.ftag.style.opacity = '1';
      HUD.ftag.style.transform = `translate(${((_v3.x + 1) / 2) * innerWidth}px, ${((1 - _v3.y) / 2) * innerHeight}px) translate(-50%, -100%)`; }
    else HUD.ftag.style.opacity = '0'; }
  // compass + objective bearing
  { const hd = ((-P.yaw * 180) / Math.PI % 360 + 360) % 360, w = HUD.comp.clientWidth || 560;
    HUD.compStrip.style.transform = `translateX(${w / 2 - (hd + 360) * 4}px)`;
    if (HUD.mk) { const dx = HUD.mk.pos.x - P.pos.x, dz = HUD.mk.pos.z - P.pos.z; let b = (Math.atan2(dx, -dz) * 180) / Math.PI - hd; b = ((b + 540) % 360) - 180;
      HUD.compTgt.style.display = Math.abs(b) < 66 ? 'block' : 'none'; HUD.compTgt.style.left = `${w / 2 + b * 4}px`; }
    else HUD.compTgt.style.display = 'none'; }
  const gk = `${WP.nades}|${WP.clay || 0}`;
  if (HUD._gk !== gk) { HUD._gk = gk; HUD.amG.innerHTML = '手雷 ' + '<i class="g"></i>'.repeat(WP.nades) + '<i class="g e"></i>'.repeat(Math.max(0, 3 - WP.nades)) + (WP.clay ? `<span class="clay">阔剑 ×${WP.clay}</span>` : ''); }
  // grenade danger indicators (enemy grenades nearby)
  let gi = 0;
  for (const n of NADES) {
    if (n.owner === 'player' || gi >= 3) continue;
    const dx = n.pos.x - P.pos.x, dz = n.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > 10) continue;
    const ang = Math.atan2(-dx, -dz) - P.yaw;
    const el = HUD.nadeInd[gi++];
    el.style.opacity = '1';
    el.style.transform = `translate(-50%,-50%) rotate(${(-ang * 180) / Math.PI}deg) translateY(${-60 - d * 6}px)`;
    el.classList.toggle('close', d < 4);
  }
  for (; gi < 3; gi++) HUD.nadeInd[gi].style.opacity = '0';
  // crosshair spread
  const spr = P.mounted ? 10 : 8 + (1 - WP.adsT) * (14 + WP.bloom * 30 + (P.moving ? 10 : 0));
  HUD.cross.style.setProperty('--s', `${spr}px`);
  HUD.cross.style.opacity = P.mounted ? 0.9 : String(clamp(1 - WP.adsT * 1.6 - WP.sprintT, 0, 1));
  HUD.hitT -= dt;
  HUD.hitm.style.opacity = HUD.hitT > 0 ? '1' : '0';
  // health feedback
  const hk = clamp(1 - P.health / 100, 0, 1);
  HUD.vign.style.opacity = String(Math.pow(hk, 0.8) * 0.95);
  HUD.blood.style.opacity = String(Math.max(0, hk - 0.35) * 1.4);
  for (let i = HUD.dmgList.length - 1; i >= 0; i--) {
    const d = HUD.dmgList[i]; d.t += dt;
    d.el.style.opacity = String(Math.max(0, d.a * (1 - d.t / 1.4)));
    if (d.t > 1.4) { d.el.remove(); HUD.dmgList.splice(i, 1); }
  }
  // objective marker
  if (HUD.mk && G.state === 'play') {
    _v.copy(HUD.mk.pos).project(G.camera);
    const behind = _v.z > 1;
    let x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
    if (behind) { x = innerWidth - x; y = innerHeight - 40; }
    x = clamp(x, 40, innerWidth - 40); y = clamp(y, 60, innerHeight - 60);
    HUD.marker.style.transform = `translate(${x}px, ${y}px)`;
    const d = G.camera.position.distanceTo(HUD.mk.pos);
    HUD.markerT.textContent = `${HUD.mk.label ? HUD.mk.label + ' ' : ''}${Math.round(d)}米`;
    HUD.marker.style.opacity = d < 2.5 ? '0' : '1';
  } else HUD.marker.style.opacity = '0';
  if (HUD.lk && G.state === 'play') {
    _v.copy(HUD.lk.pos).project(G.camera);
    const on = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    HUD.lockEl.classList.toggle('on', on);
    HUD.lockEl.classList.toggle('locked', HUD.lk.state === 'locked');
    HUD.lockEl.style.transform = `translate(${((_v.x + 1) / 2) * innerWidth}px, ${((1 - _v.y) / 2) * innerHeight}px)`;
    HUD.lockS.textContent = HUD.lk.state === 'locked' ? '已锁定 · 左键发射' : '锁定中……';
  } else HUD.lockEl.classList.remove('on');
  updateThreat();
  updateMinimap(dt);
}

function updateThreat() {
  const th = HUD.th;
  if (!th || G.state !== 'play') { HUD.threat.classList.remove('on'); return; }
  const cam = G.camera, W = innerWidth, H = innerHeight;
  _v.copy(th.pos).project(cam);
  const behind = _v.z > 1;
  let dx = _v.x * W / 2, dy = -_v.y * H / 2;           // px from screen centre (y down)
  if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
  const hx = W / 2 - 78, hy = H / 2 - 70;
  const off = behind || Math.abs(dx) > hx || Math.abs(dy) > hy;
  if (off) { const k = Math.min(hx / Math.max(Math.abs(dx), 1e-3), hy / Math.max(Math.abs(dy), 1e-3)); dx *= k; dy *= k; }
  const sx = W / 2 + dx, sy = H / 2 + dy;
  HUD.threat.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  HUD.threat.classList.add('on'); HUD.threat.classList.toggle('off', off);
  if (off) HUD.thA.style.transform = `rotate(${Math.atan2(dx, -dy).toFixed(3)}rad)`;
  const d = Math.round(cam.position.distanceTo(th.pos));
  if (d !== th.d) { th.d = d; HUD.thS.textContent = `${th.label ? th.label + ' ' : ''}${d}米`; }
}

// ---------- minimap (classic COD: rotating, player facing up) ----------
const MM = { R: 45, R2: 70, acc: 1, key: -1, foot: null, ppm: 4, x0: 0, z0: 0, px: 0, size: 0 };
function initMinimap(ui) {
  MM.el = $('div', 'minimap', ui, '<canvas></canvas><div class="mm-fx"></div>');
  MM.cv = MM.el.querySelector('canvas'); MM.ctx = MM.cv.getContext('2d');
  HUD.minimap = MM;
}
// level footprint from G.boxes, cached per level (train: static in the train frame)
function buildFoot() {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; const list = MM.list || (MM.list = []); list.length = 0;
  for (const b of G.boxes) {
    if (!b.enabled || b.inv || b.max.y - b.min.y < 0.05) continue;
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z; if (w > 120 || d > 120) continue;
    list.push(b); x0 = Math.min(x0, b.min.x); z0 = Math.min(z0, b.min.z); x1 = Math.max(x1, b.max.x); z1 = Math.max(z1, b.max.z);
  }
  if (!list.length) { MM.foot = null; return; }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
  const ppm = Math.min(4, 1800 / Math.max(x1 - x0, z1 - z0));
  const c = MM.foot || (MM.foot = document.createElement('canvas'));
  c.width = Math.ceil((x1 - x0) * ppm); c.height = Math.ceil((z1 - z0) * ppm);
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(200,210,220,0.07)'; // faint 10 m grid
  for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) g.fillRect((x - x0) * ppm, 0, 1, c.height);
  for (let z = Math.ceil(z0 / 10) * 10; z < z1; z += 10) g.fillRect(0, (z - z0) * ppm, c.width, 1);
  // sort low -> high so tall walls end up on top
  list.sort((a, b) => a.max.y - a.min.y - (b.max.y - b.min.y));
  for (const b of list) {
    const h = b.max.y - b.min.y, fence = b.tag === 'fence';
    g.fillStyle = fence ? 'rgba(200,210,220,0.5)' : h < 0.5 ? 'rgba(205,212,220,0.16)' : h < 1.4 ? 'rgba(214,220,226,0.36)' : 'rgba(228,233,238,0.55)';
    const X = (b.min.x - x0) * ppm, Z = (b.min.z - z0) * ppm, W = Math.max(fence ? 2 : 1, (b.max.x - b.min.x) * ppm), D = Math.max(fence ? 2 : 1, (b.max.z - b.min.z) * ppm);
    g.fillRect(X, Z, W, D);
    if (h >= 1.4 && !fence && W > 3 && D > 3) { g.strokeStyle = 'rgba(240,244,248,0.35)'; g.lineWidth = 1; g.strokeRect(X + 0.5, Z + 0.5, W - 1, D - 1); }
  }
  MM.ppm = ppm; MM.x0 = x0; MM.z0 = z0;
}
let mx = 0, my = 0, mClamp = false;
function toMap(x, z, P, s, c, sn, half, maxR) { // world -> minimap px (sets mx,my); returns false when beyond maxR
  const dx = x - P.pos.x, dz = z - P.pos.z, dist = Math.hypot(dx, dz);
  if (dist > maxR) return false;
  let ox = s * (dx * c - dz * sn), oy = s * (dx * sn + dz * c);
  const m = Math.max(Math.abs(ox), Math.abs(oy)); mClamp = m > half;
  if (mClamp) { ox *= half / m; oy *= half / m; }
  mx = MM.cx + ox; my = MM.cy + oy; return true;
}
function diamond(g, x, y, r) { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
function updateMinimap(dt) {
  const show = G.state === 'play' && HUD.root.classList.contains('hud-on');
  if (!show) return;
  MM.acc += dt; if (MM.acc < 0.05) return; MM.acc = 0;
  const cv = MM.cv, g = MM.ctx, P = G.player;
  const css = MM.el.clientWidth || 176, dpr = Math.min(2, devicePixelRatio || 1), S = Math.round(css * dpr);
  if (cv.width !== S) { cv.width = cv.height = S; MM.size = S; MM.font = `700 ${Math.round(9 * dpr)}px sans-serif`; }
  const key = (G.lvl || 0) * 1e6 + G.boxes.length;
  if (key !== MM.key) { MM.key = key; buildFoot(); }
  MM.cx = S / 2; MM.cy = S / 2;
  const half = S / 2 - 7 * dpr, s = (S / 2 - 6 * dpr) / MM.R, c = Math.cos(P.yaw), sn = Math.sin(P.yaw), k = dpr;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
  // footprint
  if (MM.foot) {
    const f = s / MM.ppm, ox = MM.x0 - P.pos.x, oz = MM.z0 - P.pos.z;
    g.setTransform(f * c, f * sn, -f * sn, f * c, MM.cx + s * (ox * c - oz * sn), MM.cy + s * (ox * sn + oz * c));
    g.drawImage(MM.foot, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  // view cone
  if (!MM.cone || MM.coneS !== S) { MM.coneS = S; MM.cone = g.createRadialGradient(MM.cx, MM.cy, 0, MM.cx, MM.cy, S * 0.42); MM.cone.addColorStop(0, 'rgba(255,255,255,0.16)'); MM.cone.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = MM.cone; g.beginPath(); g.moveTo(MM.cx, MM.cy); g.arc(MM.cx, MM.cy, S * 0.42, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); g.closePath(); g.fill();
  const pulse = 0.6 + 0.4 * Math.sin(G.real * 9);
  // north tick
  if (toMap(P.pos.x, P.pos.z - 1e4, P, s, c, sn, half + 1 * k, 1e9)) {
    g.fillStyle = 'rgba(8,10,12,0.75)'; g.beginPath(); g.arc(mx, my, 6.5 * k, 0, 6.283); g.fill();
    g.fillStyle = '#ebe7dc'; g.font = MM.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', mx, my + 0.5 * k);
  }
  // vehicles
  for (const v of G.sleds) {
    if (v.dead || !v.pos || !toMap(v.pos.x, v.pos.z, P, s, c, sn, half, 120)) continue;
    const big = v.kind === 'truck' || v.kind === 'btr' || v.kind === 'suv';
    const w = Math.max((big ? 2.4 : 1.2) * s, (big ? 6 : 5) * k), l = Math.max((big ? 6.5 : 2.6) * s, (big ? 9 : 6) * k);
    g.save(); g.translate(mx, my); g.rotate(P.yaw - (v.yaw || 0));
    g.fillStyle = '#ff3b2f'; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = k;
    if (mClamp) { g.fillRect(-2.5 * k, -2.5 * k, 5 * k, 5 * k); } else { g.fillRect(-w / 2, -l / 2, w, l); g.strokeRect(-w / 2, -l / 2, w, l); }
    g.restore();
  }
  // enemies
  for (const e of G.enemies) {
    const h = e.h; if (!h || !h.alive || h.hidden || h.removed) continue;
    if (!toMap(h.pos.x, h.pos.z, P, s, c, sn, half, MM.R2)) continue;
    const far = mClamp || Math.hypot(h.pos.x - P.pos.x, h.pos.z - P.pos.z) > MM.R;
    if (e.jugg || h.faction === 'jg') {
      g.globalAlpha = pulse; g.fillStyle = '#ff2a1e'; diamond(g, mx, my, (far ? 4.5 : 6.5) * k); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#ffd0c8'; g.lineWidth = k; g.stroke();
      continue;
    }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(mx, my, (far ? 2.3 : 3.6) * k, 0, 6.283); g.fill();
    g.fillStyle = far ? 'rgba(255,70,55,0.75)' : '#ff4637'; g.beginPath(); g.arc(mx, my, (far ? 1.6 : 2.7) * k, 0, 6.283); g.fill();
  }
  // teammates
  for (const m of G.mates) {
    const h = m.h; if (!h || !h.alive || h.hidden) continue;
    if (!toMap(h.pos.x, h.pos.z, P, s, c, sn, half, MM.R2)) continue;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(mx, my, 3.7 * k, 0, 6.283); g.fill();
    g.fillStyle = '#6dff6a'; g.beginPath(); g.arc(mx, my, 2.8 * k, 0, 6.283); g.fill();
  }
  // Hind: red rotor icon (always shown, clamped to the rim)
  const hd = G.hind;
  if (hd && hd.visible && hd.pos && toMap(hd.pos.x, hd.pos.z, P, s, c, sn, half, 1e9)) {
    const r = (mClamp ? 6 : 8) * k, a = G.real * 14;
    g.strokeStyle = '#ff3b2f'; g.lineWidth = 1.6 * k; g.beginPath(); g.arc(mx, my, r, 0, 6.283); g.stroke();
    g.lineWidth = 2 * k; g.beginPath();
    for (let i = 0; i < 2; i++) { const q = a + i * 1.5708, cx = Math.cos(q) * r, cy = Math.sin(q) * r; g.moveTo(mx - cx, my - cy); g.lineTo(mx + cx, my + cy); }
    g.stroke(); g.fillStyle = '#ff3b2f'; g.beginPath(); g.arc(mx, my, 2.2 * k, 0, 6.283); g.fill();
  }
  // scripted threat: big pulsing diamond
  if (HUD.th && toMap(HUD.th.pos.x, HUD.th.pos.z, P, s, c, sn, half, 1e9)) {
    g.globalAlpha = pulse; g.fillStyle = '#ff2a1e'; diamond(g, mx, my, (mClamp ? 5 : 7.5) * k); g.fill();
    g.globalAlpha = 1; g.strokeStyle = '#ffe0d8'; g.lineWidth = k; g.stroke();
  }
  // objective: gold diamond clamped to the rim
  if (HUD.mk && toMap(HUD.mk.pos.x, HUD.mk.pos.z, P, s, c, sn, half, 1e9)) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; diamond(g, mx, my, 6.5 * k); g.fill();
    g.fillStyle = '#ffc54a'; diamond(g, mx, my, 5 * k); g.fill();
  }
  // player arrow
  g.fillStyle = '#fff6d8'; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.2 * k;
  g.beginPath(); g.moveTo(MM.cx, MM.cy - 7 * k); g.lineTo(MM.cx + 5 * k, MM.cy + 5.5 * k); g.lineTo(MM.cx, MM.cy + 3 * k); g.lineTo(MM.cx - 5 * k, MM.cy + 5.5 * k); g.closePath(); g.fill(); g.stroke();
}
