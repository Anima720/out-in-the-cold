import { G, THREE, clamp } from './core.js';
import { hill } from './world.js';

export const GRAV = 19;
export const STEP = 0.5;

// The gorge + bridge set piece (track distance D .. D+W).
export const gorge = { active: false, D: 1e9, W: 90, iceY: -34, span0: 30, span1: 60, broken: false, deckY: 0.42 };

export class Box {
  constructor(x0, y0, z0, x1, y1, z1, mat = 'metal', tag = '') {
    this.min = new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1));
    this.max = new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
    this.mat = mat; this.tag = tag; this.enabled = true;
    this.inv = tag === 'inv'; // invisible wall: blocks player only
    this.noStand = this.inv;
    this.car = -1;
  }
}
export function addBox(x0, y0, z0, x1, y1, z1, mat = 'metal', tag = '') {
  const b = new Box(x0, y0, z0, x1, y1, z1, mat, tag);
  G.boxes.push(b);
  return b;
}

export function bedY(x) {
  const a = Math.abs(x);
  return a < 1.8 ? 0.3 : a < 2.6 ? 0.3 * (1 - (a - 1.8) / 0.8) : 0;
}
export function inGorge(z) {
  if (!gorge.active) return -1;
  const dd = G.s - z - gorge.D;
  return dd > 0 && dd < gorge.W ? dd : -1;
}
export function groundY(x, z) {
  if (G.groundFn) return G.groundFn(x, z); // static levels (Part 5)
  const dd = inGorge(z);
  if (dd >= 0) {
    if (Math.abs(x) < 2.4 && !(gorge.broken && dd > gorge.span0 && dd < gorge.span1)) return gorge.deckY;
    return gorge.iceY;
  }
  const a = Math.abs(x);
  return a < 3.5 ? bedY(x) : hill(x, G.s - z);
}
export function groundMat(x, z) {
  if (G.groundFn) return 'snow';
  const dd = inGorge(z);
  if (dd >= 0) return Math.abs(x) < 2.4 ? 'metal' : 'ice';
  return Math.abs(x) < 1.8 ? 'gravel' : 'snow';
}

// ---- ray vs AABB (slab); returns t or -1, normal in out
const _n = new THREE.Vector3();
export function rayBox(o, d, b, max, outN) {
  let tmin = 0, tmax = max, ax = -1, sg = 0;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z], MN = [b.min.x, b.min.y, b.min.z], MX = [b.max.x, b.max.y, b.max.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-9) { if (O[a] < MN[a] || O[a] > MX[a]) return -1; continue; }
    let t1 = (MN[a] - O[a]) / D[a], t2 = (MX[a] - O[a]) / D[a], s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = a; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (ax < 0) return -1;
  if (outN) { outN.set(0, 0, 0); outN.setComponent(ax, sg); }
  return tmin;
}

// bullet = true: projectiles / line of sight. They ignore invisible player-only walls and see-through
// colliders (tag 'fence': chain-link that blocks walking and vehicles, but not bullets, LOS, grenades or rockets).
export function rayBoxes(o, d, max, bullet = true) {
  let best = max, hb = null; const n = new THREE.Vector3();
  for (const b of G.boxes) {
    if (!b.enabled || (bullet && (b.inv || b.tag === 'fence'))) continue;
    const t = rayBox(o, d, b, best, _n);
    if (t >= 0 && t < best) { best = t; hb = b; n.copy(_n); }
  }
  return hb ? { t: best, box: hb, normal: n, mat: hb.mat } : null;
}

export function rayGround(o, d, max) {
  if (G.groundFn) { // march over uneven terrain, then bisect
    let tPrev = 0;
    for (let t = 0.5; t <= max + 0.5; t += t < 20 ? 0.5 : 1.5) {
      const tt = Math.min(t, max);
      if (o.y + d.y * tt <= G.groundFn(o.x + d.x * tt, o.z + d.z * tt)) {
        let a = tPrev, b = tt;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (o.y + d.y * m <= G.groundFn(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        const p = new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
        return { t: b, point: p, normal: new THREE.Vector3(0, 1, 0), mat: 'snow' };
      }
      tPrev = tt; if (tt >= max) break;
    }
    return null;
  }
  if (d.y > -1e-4) return null;
  let t = (bedY(o.x) - o.y) / d.y;
  if (t < 0) t = 0;
  const x = o.x + d.x * t, z = o.z + d.z * t;
  const gy = groundY(x, z);
  if (Math.abs(gy - bedY(x)) > 0.01) t = (gy - o.y) / d.y;
  if (t < 0 || t > max) return null;
  const p = new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  return { t, point: p, normal: new THREE.Vector3(0, 1, 0), mat: groundMat(p.x, p.z) };
}

// full scene raycast for bullets: boxes, ground, entities (with rayTest)
export function raycast(o, d, max, ignore = null, opts = {}) {
  let best = null;
  const hb = rayBoxes(o, d, max, true);
  if (hb) { best = hb; max = hb.t; }
  const hg = rayGround(o, d, max);
  if (hg) { best = hg; max = hg.t; }
  const lists = [G.humans, G.sleds];
  if (G.hind) lists.push([G.hind]);
  for (const list of lists) for (const e of list) {
    if (e === ignore || !e.rayTest) continue;
    if (opts.noCorpse && e.alive === false) continue;
    if (opts.factionSkip && e.faction === opts.factionSkip) continue;
    const r = e.rayTest(o, d, max);
    if (r && r.t < max) { best = r; best.ent = e; max = r.t; }
  }
  if (best && !best.point) best.point = new THREE.Vector3().copy(o).addScaledVector(d, best.t);
  if (best) best.t = best.t;
  return best;
}

const _d = new THREE.Vector3();
export function los(a, b) {
  _d.subVectors(b, a); const L = _d.length(); if (L < 1e-4) return true;
  _d.multiplyScalar(1 / L);
  return !rayBoxes(a, _d, L - 0.05, true);
}

// ---- character support / movement (AABB feet, vertical cylinder approx)
export function supportAt(x, z, r, feet, maxUp) {
  let y = groundY(x, z), train = false, box = null;
  for (const b of G.boxes) {
    if (!b.enabled || b.noStand) continue;
    if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
    const top = b.max.y;
    if (top <= feet + maxUp && top > y) { y = top; train = true; box = b; }
  }
  return { y, train, box };
}

function blocks(b, feet, h, step) {
  return b.enabled && b.max.y > feet + step && b.min.y < feet + h;
}

export function moveChar(e, dt, isPlayer = true) {
  const r = e.r, feet = e.pos.y, step = e.grounded ? STEP : 0.12;
  // X
  let nx = e.pos.x + e.vel.x * dt;
  for (const b of G.boxes) {
    if ((!isPlayer && b.inv) || !blocks(b, feet, e.h, step)) continue;
    if (e.pos.z + r <= b.min.z || e.pos.z - r >= b.max.z) continue;
    if (nx + r > b.min.x && nx - r < b.max.x) {
      if (e.pos.x <= (b.min.x + b.max.x) / 2) nx = Math.min(nx, b.min.x - r - 1e-4);
      else nx = Math.max(nx, b.max.x + r + 1e-4);
      e.vel.x = 0;
    }
  }
  // Z
  let nz = e.pos.z + e.vel.z * dt;
  for (const b of G.boxes) {
    if ((!isPlayer && b.inv) || !blocks(b, feet, e.h, step)) continue;
    if (nx + r <= b.min.x || nx - r >= b.max.x) continue;
    if (nz + r > b.min.z && nz - r < b.max.z) {
      // corner slide: glancing a box edge pushes the player sideways instead of stopping dead
      if (isPlayer && Math.abs(e.vel.z) > 0.5) {
        const oL = nx + r - b.min.x, oR = b.max.x - (nx - r);
        if (Math.min(oL, oR) < 0.3) {
          const tx = oL < oR ? b.min.x - r - 1e-3 : b.max.x + r + 1e-3;
          let ok = true;
          for (const c of G.boxes) {
            if (c === b || !blocks(c, feet, e.h, step)) continue;
            if (tx + r > c.min.x && tx - r < c.max.x && nz + r > c.min.z && nz - r < c.max.z) { ok = false; break; }
          }
          if (ok) {
            const stepX = Math.abs(e.vel.z) * dt * 1.3;
            nx += clamp(tx - nx, -stepX, stepX);
            if (nx + r <= b.min.x || nx - r >= b.max.x) continue;
            nz = e.pos.z <= (b.min.z + b.max.z) / 2 ? Math.min(nz, b.min.z - r - 1e-4) : Math.max(nz, b.max.z + r + 1e-4);
            continue;
          }
        }
      }
      if (e.pos.z <= (b.min.z + b.max.z) / 2) nz = Math.min(nz, b.min.z - r - 1e-4);
      else nz = Math.max(nz, b.max.z + r + 1e-4);
      e.vel.z = 0;
    }
  }
  // Y
  e.vel.y -= GRAV * dt;
  let ny = e.pos.y + e.vel.y * dt;
  const sup = supportAt(nx, nz, r * 0.75, e.pos.y, e.grounded ? STEP : Math.max(0.12, -e.vel.y * dt + 0.05));
  const wasGrounded = e.grounded;
  if (ny <= sup.y && e.vel.y <= 0.001) {
    if (!wasGrounded) e.landV = -e.vel.y;
    ny = sup.y; e.vel.y = 0; e.grounded = true; e.onTrain = sup.train; e.support = sup;
  } else if (ny < sup.y) { ny = sup.y; e.grounded = false; }
  else e.grounded = false;
  // head bump
  if (e.vel.y > 0) {
    for (const b of G.boxes) {
      if (!b.enabled || (!isPlayer && b.inv)) continue;
      if (nx + r <= b.min.x || nx - r >= b.max.x || nz + r <= b.min.z || nz - r >= b.max.z) continue;
      if (b.min.y > feet + e.h - 0.05 && b.min.y < ny + e.h) { ny = b.min.y - e.h; e.vel.y = 0; }
    }
  }
  e.pos.set(nx, ny, nz);
}

// ledge for mantling: probe ahead, find a standable top 0.45..maxH above feet with headroom
export function findLedge(pos, fwd, maxH = 1.8) {
  const feet = pos.y;
  for (const dist of [0.55, 0.8]) {
    const px = pos.x + fwd.x * dist, pz = pos.z + fwd.z * dist;
    let best = null;
    for (const b of G.boxes) {
      if (!b.enabled || b.noStand) continue;
      if (px < b.min.x || px > b.max.x || pz < b.min.z || pz > b.max.z) continue;
      const dh = b.max.y - feet;
      if (dh > 0.42 && dh < maxH && (!best || b.max.y > best.y)) best = { y: b.max.y, x: px, z: pz };
    }
    if (!best) continue;
    let clear = true;
    for (const b of G.boxes) {
      if (!b.enabled || b.inv) continue;
      if (px + 0.25 < b.min.x || px - 0.25 > b.max.x || pz + 0.25 < b.min.z || pz - 0.25 > b.max.z) continue;
      if (b.min.y < best.y + 1.5 && b.max.y > best.y + 0.04) { clear = false; break; }
    }
    if (clear) return best;
  }
  return null;
}

// closest distance between ray segment (o,d,0..max) and segment a-b; returns {dist2, t}
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
export function raySegment(o, d, max, a, b) {
  _u.copy(d).multiplyScalar(max); _v.subVectors(b, a); _w.subVectors(o, a);
  const A = _u.dot(_u), B = _u.dot(_v), C = _v.dot(_v), D = _u.dot(_w), E = _v.dot(_w);
  const den = A * C - B * B;
  let sN, sD = den, tN, tD = den;
  if (den < 1e-8) { sN = 0; sD = 1; tN = E; tD = C; }
  else {
    sN = B * E - C * D; tN = A * E - B * D;
    if (sN < 0) { sN = 0; tN = E; tD = C; } else if (sN > sD) { sN = sD; tN = E + B; tD = C; }
  }
  if (tN < 0) { tN = 0; if (-D < 0) sN = 0; else if (-D > A) sN = sD; else { sN = -D; sD = A; } }
  else if (tN > tD) { tN = tD; if (-D + B < 0) sN = 0; else if (-D + B > A) sN = sD; else { sN = -D + B; sD = A; } }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const dx = _w.x + sc * _u.x - tc * _v.x, dy = _w.y + sc * _u.y - tc * _v.y, dz = _w.z + sc * _u.z - tc * _v.z;
  return { dist2: dx * dx + dy * dy + dz * dz, t: sc * max, s: tc };
}

if (typeof window !== 'undefined') window.__phys = { raycast, los, rayBoxes, supportAt, groundY };

export function raySphere(o, d, c, r, max) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= max ? t : (cc < 0 ? 0 : -1);
}
