import { G, THREE, clamp } from './core.js';
import { WP, curDef } from './weapon.js';
import { NADES } from './grenade.js';

const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const COL = { SANDMAN: '#9fd0ff', TRUCK: '#ffd27a', GRINCH: '#a9f0a0', '索科洛夫': '#e9e4d6', '克拉辛': '#ff8a76', PRICE: '#d9c08a' };

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
  HUD.hitT = 0; HUD.dmgList = []; HUD.mk = null; HUD.lk = null;
  G.hud = HUD;
}

HUD.objective = (t) => {
  if (!t) { HUD.obj.classList.remove('on'); return; }
  HUD.objT.textContent = t; HUD.obj.classList.remove('on'); void HUD.obj.offsetWidth; HUD.obj.classList.add('on', 'flash');
  setTimeout(() => HUD.obj.classList.remove('flash'), 1600);
};
HUD.say = (who, text, radio) => {
  if (!who) { HUD.sub.classList.remove('on'); return; }
  const c = COL[who] || '#fff';
  HUD.sub.innerHTML = `<b style="color:${c}">${who}${radio ? '（无线电）' : ''}：</b>${text}`;
  HUD.sub.classList.add('on');
};
HUD.setPrompt = (html) => {
  if (HUD._p === html) return; HUD._p = html;
  if (!html) { HUD.prompt.classList.remove('on'); return; }
  HUD.prompt.innerHTML = html; HUD.prompt.classList.add('on');
};
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
HUD.setUpload = (p, stall) => {
  if (p === null) { HUD.upl.classList.remove('on'); return; }
  HUD.upl.classList.add('on'); HUD.upl.classList.toggle('stall', !!stall);
  HUD.uplI.style.width = `${clamp(p, 0, 100)}%`; HUD.uplB.textContent = stall ? `${Math.floor(p)}% · 信号中断` : `${Math.floor(p)}%`;
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
}
