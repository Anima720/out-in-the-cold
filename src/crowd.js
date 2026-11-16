// Character-vs-character collision (soft separation). Called once per frame from main.js after AI/vehicles,
// before updateHumans. XZ discs, mass-weighted, speed-capped, every correction validated against the collision
// world (never into a box, never off a ledge / train car). AI walkers that brush past each other only get the
// sideways part of the correction, so two of them meeting head-on in a narrow lane squeeze past instead of
// deadlocking (on the train they also stay inside laneMove's ±0.16 m centre lane).
import { G } from './core.js';
import { supportAt, STEP } from './physics.js';

const HR = 0.33, JR = 0.42;      // body radii (human, juggernaut)
const MAXV = 2.2;                // m/s correction for overlaps nobody walked into (spawns, teleports)
const STIFF = 0.7;               // fraction of the overlap removed per frame (soft, no popping)
const YSEP = 1.25;               // vertical gap beyond which two bodies cannot touch
const BIAS = 0.9;                // sideways steer when two bodies meet head-on
const LANE = 0.155;              // laneMove keeps walkers within |x| <= 0.16 on the train
const PIN = 1e6;

const NB = 96;
const bodies = Array.from({ length: NB }, () => ({ h: null, pl: false, kind: 0, x: 0, y: 0, z: 0, r: HR, vx: 0, vz: 0, sp: 0,
  m: 1, push: false, lane: false, cx: 0, cz: 0, cap: 0, sup: 0, supOk: false }));
let nb = 0;
export const CROWD = { on: true, pairs: 0, minD: 9 };
if (typeof window !== 'undefined') window.__crowd = CROWD;

function addBody(h, kind, r) {
  if (nb >= NB) return null;
  const b = bodies[nb++];
  b.h = h; b.pl = kind === 0; b.kind = kind; b.r = r; b.cx = b.cz = 0; b.cap = MAXV; b.supOk = false; b.lane = false;
  return b;
}

// is the human free to be collided with at all
function solid(h) {
  return h && !h.removed && h.slot >= 0 && h.alive && !h.rag && !h.hidden && !h.sit && !h.noCrowd && !h.dragged && !h.carried && !h.downed;
}

function gather() {
  nb = 0;
  const P = G.player;
  if (P && P.alive && !P.jumped && G.state === 'play') {
    const b = addBody(null, 0, P.r || 0.32);
    b.x = P.pos.x; b.y = P.pos.y; b.z = P.pos.z; b.vx = P.vel.x; b.vz = P.vel.z;
    b.push = !P.noCrowd && P.enabled && !P.mounted && !P.scriptMove && !P.mantle && !P.slide && !P.prone && P.grounded;
    b.m = b.push && !(P._cwPin > G.t - 0.25) ? 1 : PIN;
  }
  for (const m of G.mates) {
    const h = m.h;
    if (!solid(h) || m.arc || m.mode === 'jump' || m.noCrowd) continue;
    if (!addBody(h, 1, HR)) break;
  }
  for (const e of G.enemies) {
    const h = e.h;
    if (!solid(h) || e.kind === 'gunner' || e.arc || e.noCrowd) continue;
    if (!addBody(h, 2, e.jugg || h.faction === 'jg' ? JR : HR)) break;
  }
  for (let i = 0; i < nb; i++) {
    const b = bodies[i]; if (b.pl) continue;
    const h = b.h;
    b.x = h.pos.x; b.y = h.pos.y; b.z = h.pos.z;
    b.vx = h.vel.x; b.vz = h.vel.z - (G.lvl === 2 && h.onGround ? G.v : 0); // ground-mode mates ride the scrolling world
    b.push = true;
    b.m = (b.r === JR ? 30 : 1) * (h._cwPin > G.t - 0.25 ? 50 : 1);
    // walking along the train's centre lane (laneMove): must stay within the lane while travelling
    b.lane = G.lvl === 2 && b.y > 1.2 && Math.abs(b.x) <= 0.17 && Math.abs(b.vz) > 0.3 && Math.abs(b.vx) < 0.8;
  }
  for (let i = 0; i < nb; i++) { const b = bodies[i]; b.sp = Math.hypot(b.vx, b.vz); }
}

// ---- validation against the collision world
function penBox(bx, x, z, r) {
  const ox = Math.min(x + r - bx.min.x, bx.max.x - (x - r)), oz = Math.min(z + r - bx.min.z, bx.max.z - (z - r));
  return ox > 0 && oz > 0 ? Math.min(ox, oz) : 0;
}
function floorAt(b, x, z) {
  return b.pl ? supportAt(x, z, b.r * 0.75, b.y, STEP).y : supportAt(x, z, 0.1, b.y + 0.02, 0.3).y;
}
function fits(b, nx, nz) {
  const feet = b.y, pl = b.pl, step = pl ? STEP : 0.3, top = feet + (pl ? G.player.h : 1.7);
  // no falling off ledges / cars, no climbing onto obstacles
  const f = floorAt(b, nx, nz);
  if (f < b.sup - (pl ? 0.06 : 0.25) || f > b.sup + 0.3) return false;
  for (const bx of G.boxes) {
    if (!bx.enabled || (!pl && bx.inv) || bx.max.y <= feet + step || bx.min.y >= top) continue;
    const pn = penBox(bx, nx, nz, b.r);
    if (pn > 0 && pn > penBox(bx, b.x, b.z, b.r) + 1e-4) return false;
  }
  return true;
}

function apply(b, dx, dz) {
  if (b.pl) {
    const P = G.player, cam = G.camera;
    P.pos.x += dx; P.pos.z += dz; P.eye.x += dx; P.eye.z += dz; P.chest.x += dx; P.chest.z += dz;
    if (cam) { cam.position.x += dx; cam.position.z += dz; }
  } else {
    const h = b.h;
    const f0 = b.sup; h.pos.x += dx; h.pos.z += dz;
    if (G.groundFn && Math.abs(h.pos.y - f0) < 0.05) h.pos.y += floorAt(b, h.pos.x, h.pos.z) - f0; // stay on uneven snow
  }
  b.x += dx; b.z += dz;
}

function resolve(b, dt) {
  let cx = b.cx, cz = b.cz;
  const L = Math.hypot(cx, cz), cap = b.cap * dt;
  if (L < 1e-6) return;
  if (L > cap) { cx *= cap / L; cz *= cap / L; }
  if (b.lane) cx = Math.max(Math.min(-LANE, b.x), Math.min(Math.max(LANE, b.x), b.x + cx)) - b.x; // never out of the lane
  if (Math.abs(cx) + Math.abs(cz) < 1e-6) return;
  b.sup = floorAt(b, b.x, b.z);
  const tol = b.pl ? 0.06 : 0.25;
  if (b.y - b.sup > tol || b.sup - b.y > 0.3) { pin(b); return; } // airborne or standing somewhere odd: leave alone
  if (fits(b, b.x + cx, b.z + cz)) apply(b, cx, cz);
  else if (Math.abs(cx) > 1e-5 && fits(b, b.x + cx, b.z)) apply(b, cx, 0);
  else if (Math.abs(cz) > 1e-5 && fits(b, b.x, b.z + cz)) apply(b, 0, cz);
  else pin(b);
}
function pin(b) { if (b.pl) G.player._cwPin = G.t; else b.h._cwPin = G.t; }

export function updateCrowd(dt) {
  if (!CROWD.on || dt <= 0) return;
  gather();
  let pairs = 0, minD = 9;
  for (let i = 0; i < nb; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < nb; j++) {
      const b = bodies[j];
      if (Math.abs(a.y - b.y) > YSEP) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      const R = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      pairs++;
      const d = Math.sqrt(d2);
      if (d < minD) minD = d;
      let nx, nz;
      if (d > 1e-4) { nx = dx / d; nz = dz / d; } else { nx = (i & 1) ? 1 : -1; nz = 0; dx = nx * 1e-4; dz = 0; }
      const pen = R - d;
      // head-on: steer the pair sideways (keep right relative to the closing motion), so they slide past
      const rvx = a.vx - b.vx, rvz = a.vz - b.vz, rs = Math.hypot(rvx, rvz);
      const closing = rvx * nx + rvz * nz;
      if (closing > 0.05) { const c = closing + 0.5; if (c > a.cap - MAXV) a.cap = MAXV + c; if (c > b.cap - MAXV) b.cap = MAXV + c; }
      if (rs > 0.4 && closing > 0.25 * rs) {
        const rx = -rvz / rs, rz = rvx / rs;
        const lat = dx * rx + dz * rz;
        const side = lat > 0.02 ? -1 : 1;
        const k = BIAS * Math.max(0, 1 - Math.abs(lat) / R);
        nx -= side * k * rx; nz -= side * k * rz;
        const n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n;
      }
      // mass split: teammates yield to the player (15/85), enemy vs player 50/50, human vs human 50/50
      let ma = a.m, mb = b.m;
      if (a.pl && b.kind === 1 && ma < PIN) ma = 85 / 15;
      if (b.pl && a.kind === 1 && mb < PIN) mb = 85 / 15;
      if (!a.push) ma = PIN; if (!b.push) mb = PIN;
      const wa = mb / (ma + mb), wb = ma / (ma + mb);
      let ax = -nx * pen * wa * STIFF, az = -nz * pen * wa * STIFF, bx = nx * pen * wb * STIFF, bz = nz * pen * wb * STIFF;
      // AI walkers brushing past each other: never shove a walker back along its path (no deadlock)
      if (!a.pl && !b.pl) {
        if (a.sp > 0.5) { const ux = a.vx / a.sp, uz = a.vz / a.sp, p = ax * ux + az * uz; if (p < 0) { ax -= p * ux; az -= p * uz; } }
        if (b.sp > 0.5) { const ux = b.vx / b.sp, uz = b.vz / b.sp, p = bx * ux + bz * uz; if (p < 0) { bx -= p * ux; bz -= p * uz; } }
      }
      a.cx += ax; a.cz += az; b.cx += bx; b.cz += bz;
    }
  }
  CROWD.pairs = pairs; CROWD.minD = minD;
  for (let i = 0; i < nb; i++) { const b = bodies[i]; if (b.push && (b.cx || b.cz)) resolve(b, dt); }
  for (let i = 0; i < nb; i++) bodies[i].h = null;
}

export function clearCrowd() { nb = 0; if (G.player) G.player._cwPin = -9; }
