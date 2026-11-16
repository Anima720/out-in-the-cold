// Corpse drops: matching ammo is picked up automatically; a different gun (with its attachments) is swapped in by
// holding F. Rifle-calibre drops top up any assault rifle / carbine, 7.62x54R drops feed the PKM and the SVD.
// The weapon you leave behind stays on that body, so you can swap back.
import { G, rr } from './core.js';
import { J } from './humans.js';
import { WP, WDEF, giveWeapon, attOf } from './weapon.js';
import { play } from './audio.js';
import { HUD } from './hud.js';
import { key } from './input.js';
import { attLabel } from './attach.js';

const CAP = { m4: 300, ak: 300, ak12: 300, smg: 300, pistol: 72, pkm: 300, svd: 60, saiga: 48, rpg: 5, nades: 4 };
const FAM = { m4: 'r', ak: 'r', ak12: 'r', smg: 'r', pkm: 'm', svd: 'm' };
const UBCAP = { gl: 5, shotgun: 16 };
G.pickups = [];
G.onCorpse = (h) => {
  if (h.faction === 'us') return;
  let w = h.dropWeapon || (h.faction === 'jg' ? 'pkm' : 'ak'); if (!WDEF[w] || w === 'igla') w = 'ak';
  const side = w === 'pistol'; // a sidearm drop is just pistol ammo
  const att = side ? null : { ...(h.dropAtt || (G.rollAtt ? G.rollAtt(w) : { optic: 'iron', under: null })) };
  G.pickups.push({ h, w: side ? null : w, att, ub: att && att.under ? (att.under === 'gl' ? 2 : 4) : 0,
    ammo: w === 'rpg' ? 2 : w === 'pkm' ? 100 : side ? 0 : Math.round(rr(18, 45)), pistol: side ? Math.round(rr(7, 16)) : Math.random() < 0.35 ? 8 : 0,
    nade: Math.random() < (h.faction === 'jg' ? 1 : 0.32) ? 1 : 0 });
};
export function clearPickups() { G.pickups.length = 0; }
let hold = 0, lockF = false;
export function updatePickups() {
  const P = G.player; G.pickPrompt = null; if (!P || !P.alive || P.mounted) { hold = 0; return; }
  if (lockF && !key('KeyF')) lockF = false;
  let swap = null, sd = 1.7;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i], h = k.h;
    if (h.removed || h.hidden) { G.pickups.splice(i, 1); continue; }
    const c = h.j[J.P], d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    if (d > 1.7 || Math.abs(c.y - P.pos.y) > 1.6) continue;
    const got = [], st = WP.st;
    const mine = k.w && (k.w === WP.prim || k.w === WP.launch);
    const feed = k.left ? null : mine ? k.w : k.w && FAM[k.w] && FAM[k.w] === FAM[WP.prim] ? WP.prim : null;
    if (feed && k.ammo && st[feed].reserve < CAP[feed]) { const n = Math.min(k.ammo, CAP[feed] - st[feed].reserve); st[feed].reserve += n; k.ammo -= n; got.push(`+${n} ${WDEF[feed].name}`); }
    if (k.pistol && st.pistol.reserve < CAP.pistol) { const n = Math.min(k.pistol, CAP.pistol - st.pistol.reserve); st.pistol.reserve += n; k.pistol -= n; got.push(`+${n} 手枪弹药`); }
    if (k.nade && WP.nades < CAP.nades) { WP.nades += 1; k.nade = 0; got.push('+1 手雷'); }
    const u = WP.ub;
    if (k.ub && !k.left && u && k.att && k.att.under === u.kind && u.reserve < UBCAP[u.kind]) { const n = Math.min(k.ub, UBCAP[u.kind] - u.reserve); u.reserve += n; k.ub -= n; got.push(`+${n} ${u.def.name}`); }
    if (got.length) { play('magin', { vol: 0.45, rev: 0 }); if (HUD.toast) HUD.toast(got.join('　')); }
    if (k.w && !mine && d < sd) { sd = d; swap = k; }
    if (!k.ammo && !k.pistol && !k.nade && !k.ub && !(k.w && !mine)) G.pickups.splice(i, 1);
  }
  if (!swap) { hold = 0; return; }
  const D = WDEF[swap.w];
  G.pickPrompt = `按住 <kbd>F</kbd> 拾取 ${D.name}${attLabel(swap.att)}`;
  if (!G.otherPrompt && key('KeyF') && !lockF) hold += G.dt || 1 / 60; else hold = 0;
  if (hold < 0.3) return;
  hold = 0; lockF = true;
  // leave the current primary (or launcher) on the body in exchange
  const old = D.launcher ? WP.launch : WP.prim, ost = old && WP.st[old], oatt = old && !D.launcher ? { ...attOf(old) } : null;
  const oub = WP.ub && !D.launcher ? WP.ub.ammo + WP.ub.reserve : 0;
  giveWeapon(swap.w, Math.min(D.mag, swap.ammo || D.mag), Math.max(0, (swap.ammo || 0) - D.mag) + (swap.left ? 0 : swap.w === 'rpg' ? 1 : D.mag), swap.att);
  if (WP.ub) { if (swap.left) { WP.ub.ammo = Math.min(WP.ub.def.mag, swap.ub); WP.ub.reserve = Math.max(0, swap.ub - WP.ub.ammo); } else if (swap.ub) WP.ub.reserve += swap.ub; }
  swap.left = false;
  swap.h.weaponGone = true;
  if (old && old !== 'igla' && ost && ost.ammo + ost.reserve > 0) { swap.w = old; swap.att = oatt; swap.ammo = ost.ammo + ost.reserve; swap.ub = oub; swap.left = true; }
  else { swap.w = null; swap.ammo = 0; swap.ub = 0; }
  play('magin', { vol: 0.6, rev: 0 }); play('rustle', { vol: 0.4, rev: 0 });
}
