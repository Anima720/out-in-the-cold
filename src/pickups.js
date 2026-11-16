// Corpse drops: matching ammo is picked up automatically; a different gun can be swapped in with F.
import { G, rr } from './core.js';
import { J } from './humans.js';
import { WP, WDEF, giveWeapon } from './weapon.js';
import { play } from './audio.js';
import { HUD } from './hud.js';
import { hit } from './input.js';

const CAP = { ak: 300, pistol: 102, pkm: 300, svd: 60, saiga: 48, rpg: 5, nades: 4 };
G.pickups = [];
G.onCorpse = (h) => {
  if (h.faction === 'us') return;
  const w = h.dropWeapon || (h.faction === 'jg' ? 'pkm' : 'ak');
  G.pickups.push({ h, w, ammo: w === 'rpg' ? 2 : w === 'pkm' ? 100 : Math.round(rr(18, 45)), pistol: Math.random() < 0.35 ? 8 : 0, nade: Math.random() < (h.faction === 'jg' ? 1 : 0.32) ? 1 : 0 });
};
export function clearPickups() { G.pickups.length = 0; }
export function updatePickups() {
  const P = G.player; G.pickPrompt = null; if (!P || !P.alive || P.mounted) return;
  let swap = null, sd = 1.7;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i], h = k.h;
    if (h.removed || h.hidden) { G.pickups.splice(i, 1); continue; }
    const c = h.j[J.P], d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    if (d > 1.7 || Math.abs(c.y - P.pos.y) > 1.6) continue;
    const got = [], st = WP.st;
    const mine = k.w && (k.w === WP.prim || k.w === WP.launch);
    if (k.w && k.ammo && mine && st[k.w].reserve < CAP[k.w]) { const n = Math.min(k.ammo, CAP[k.w] - st[k.w].reserve); st[k.w].reserve += n; k.ammo -= n; got.push(`+${n} ${WDEF[k.w].name}`); }
    if (k.pistol && st.pistol.reserve < CAP.pistol) { const n = Math.min(k.pistol, CAP.pistol - st.pistol.reserve); st.pistol.reserve += n; k.pistol -= n; got.push(`+${n} 手枪弹药`); }
    if (k.nade && WP.nades < CAP.nades) { WP.nades += 1; k.nade = 0; got.push('+1 手雷'); }
    if (got.length) { play('magin', { vol: 0.45, rev: 0 }); if (HUD.toast) HUD.toast(got.join('　')); }
    if (k.w && !mine && d < sd) { sd = d; swap = k; }
    if (!k.ammo && !k.pistol && !k.nade && !(k.w && !mine)) G.pickups.splice(i, 1);
  }
  if (swap) {
    G.pickPrompt = `按 <kbd>F</kbd> 拾取 ${WDEF[swap.w].name}`;
    if (!G.otherPrompt && hit('KeyF')) {
      giveWeapon(swap.w, Math.min(WDEF[swap.w].mag, swap.ammo || WDEF[swap.w].mag), Math.max(0, (swap.ammo || 0) - WDEF[swap.w].mag) + (swap.w === 'rpg' ? 1 : WDEF[swap.w].mag));
      swap.h.weaponGone = true; swap.w = null; swap.ammo = 0;
      play('magin', { vol: 0.6, rev: 0 });
    }
  }
}
