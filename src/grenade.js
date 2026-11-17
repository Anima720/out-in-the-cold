import { G, THREE, rr, clamp } from './core.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { rayBoxes, groundY, inGorge, rayGround } from './physics.js';
import { play } from './audio.js';
import { explodeAt } from './vehicles.js';
import { J } from './humans.js';

// Frag grenades (RGD-5) for the player and enemies. Simulated in the train frame:
// on the train they bounce off cars; on the ground they get carried away by the moving world.
export const NADES = [];
let GEO = null;
function geo() {
  if (GEO) return GEO;
  const b = new Builder();
  b.sphere(0, 0, 0, 0.032, 'pOlive', 0xffffff, 1, 1.18, 1, 12);
  b.cyl(0, 0.042, 0, 0.01, 0.01, 0.02, 'gunW', 0xffffff, 0, 0, 0, 10);
  b.boxC(0.013, 0.03, 0, 0.006, 0.05, 0.012, 'gunW', 0xffffff, 0, 0, 0.25, 0.002);
  const m = {}; GEO = { list: [] };
  for (const [k, list] of b.parts) GEO.list.push([b.geometry(k), M[k]]);
  return GEO;
}

export function throwNade(pos, vel, owner) {
  const g = new THREE.Group();
  for (const [ge, mat] of geo().list) { const m = new THREE.Mesh(ge, mat); m.castShadow = true; g.add(m); }
  g.position.copy(pos); G.scene.add(g);
  const n = { g, pos: g.position, vel: vel.clone(), fuse: owner === 'player' ? 3.0 : 2.8, owner, rest: false, onGround: false, warned: false, spin: new THREE.Vector3(rr(-12, 12), rr(-12, 12), rr(-12, 12)) };
  NADES.push(n);
  return n;
}

const _d = new THREE.Vector3(), _n = new THREE.Vector3();
export function updateNades(dt) {
  if (GL.length) updateGL(dt);
  for (let i = NADES.length - 1; i >= 0; i--) {
    const n = NADES[i];
    n.fuse -= dt;
    if (n.held) { // in the player's hand (throw-back): rides along at the left hand, still burning
      const cam = G.camera; cam.getWorldDirection(_d);
      n.pos.copy(cam.position).addScaledVector(_d, 0.4); n.pos.y -= 0.1;
      if (n.fuse <= 0) { n.held = false; if (G.player) G.player.damage(200, n.pos.clone(), true); }
    }
    if (n.fuse <= 0) {
      explodeAt(n.pos.clone().setY(n.pos.y + 0.15), 1.0, 7.5, n.owner === 'player' ? 95 : 85);
      G.scene.remove(n.g); NADES.splice(i, 1);
      continue;
    }
    if (n.held) continue;
    if (!n.rest) {
      n.vel.y -= 19 * dt;
      const step = n.vel.length() * dt;
      if (step > 1e-5) {
        _d.copy(n.vel).normalize();
        const hit = rayBoxes(n.pos, _d, step + 0.035, true);
        if (hit) {
          n.pos.addScaledVector(_d, Math.max(0, hit.t - 0.035));
          const vn = n.vel.dot(hit.normal);
          n.vel.addScaledVector(hit.normal, -vn * 1.38); // restitution ~0.38
          n.vel.multiplyScalar(0.72);
          if (Math.abs(vn) > 1.5) play('clink', { pos: n.pos, vol: Math.min(0.8, Math.abs(vn) / 8), ref: 4 });
          if (hit.normal.y > 0.7 && n.vel.length() < 0.6) { n.rest = true; n.vel.set(0, 0, 0); }
        } else n.pos.addScaledVector(n.vel, dt);
      }
      const gy = groundY(n.pos.x, n.pos.z) + 0.035;
      if (n.pos.y < gy && gy - n.pos.y < 2) {
        n.pos.y = gy; n.onGround = true;
        if (n.vel.y < -1.5) play('soft', { pos: n.pos, vol: 0.4, ref: 4 });
        n.vel.y = Math.abs(n.vel.y) * 0.25;
        n.vel.x *= 0.6; n.vel.z += (G.v - n.vel.z) * 0.5;
      }
      n.g.rotation.x += n.spin.x * dt; n.g.rotation.y += n.spin.y * dt; n.g.rotation.z += n.spin.z * dt;
      n.spin.multiplyScalar(1 - dt * 1.5);
    }
    if (n.onGround && !n.rest) n.vel.z += (G.v - n.vel.z) * Math.min(1, dt * 3);
    if (n.rest && n.pos.y < 0.5) n.pos.z += G.v * dt; // resting on the moving ground
    // enemies shout and scatter when a player grenade lands near them
    if (n.owner === 'player' && !n.warned && n.vel.length() < 4) {
      for (const e of G.enemies) {
        if (!e.h.alive) continue;
        if (e.h.j[J.P].distanceTo(n.pos) < 6.5) {
          n.warned = true;
          if (G.bark) G.bark('RU_03', e.h.pos, true);
          break;
        }
      }
    }
    if (n.owner === 'player' && n.warned) for (const e of G.enemies) if (e.h.alive && e.h.pos.distanceTo(n.pos) < 6) e.flee = { from: n.pos, t: 2.2 };
  }
}

export function clearNades() { for (const n of NADES) G.scene.remove(n.g); NADES.length = 0; for (const r of GL) G.scene.remove(r.g); GL.length = 0; }

// ---------- 40 mm underbarrel grenades (M203 / GP-25): ballistic, arm after ~6 m, explode on impact
export const GL = [];
let GLGEO = null;
export function fireGL(pos, vel) {
  if (!GLGEO) { const b = new Builder(); b.cyl(0, 0, 0.0, 0.02, 0.02, 0.05, 'gunW', 0xffffff, Math.PI / 2, 0, 0, 10); b.sphere(0, 0, -0.03, 0.02, 'pOlive', 0xffffff, 1, 1, 1.2, 10); GLGEO = []; for (const [k] of b.parts) GLGEO.push([b.geometry(k), M[k]]); }
  const g = new THREE.Group(); for (const [ge, mat] of GLGEO) g.add(new THREE.Mesh(ge, mat));
  g.position.copy(pos); G.scene.add(g);
  GL.push({ g, pos: g.position, vel: vel.clone(), dist: 0, life: 0, smoke: 0 });
}
const _gd = new THREE.Vector3(), _gp = new THREE.Vector3();
function updateGL(dt) {
  for (let i = GL.length - 1; i >= 0; i--) {
    const r = GL[i]; r.life += dt;
    r.vel.y -= 9.8 * dt;
    const step = r.vel.length() * dt; _gd.copy(r.vel).normalize();
    let hit = rayBoxes(r.pos, _gd, step, true), t = hit ? hit.t : step + 1;
    const hg = rayGround(r.pos, _gd, Math.min(step, t)); if (hg && hg.t < t) { hit = hg; t = hg.t; }
    if (!hit) for (const h of G.humans) { // direct hit on a person
      if (!h.alive || h.faction === 'us' || h.hidden) continue;
      _gp.copy(h.j[J.P]); _gp.y += 0.2;
      const ox = _gp.x - r.pos.x, oy = _gp.y - r.pos.y, oz = _gp.z - r.pos.z, along = ox * _gd.x + oy * _gd.y + oz * _gd.z;
      if (along < -0.3 || along > step + 0.3) continue;
      const px = ox - _gd.x * along, py = oy - _gd.y * along, pz = oz - _gd.z * along;
      if (px * px + py * py * 0.35 + pz * pz < 0.45 * 0.45) { hit = { t: Math.max(0, along) }; t = hit.t; if (r.dist > 1) h.hurt(160, _gd, 'torso', J.P, { force: 10 }); break; }
    }
    if (hit || r.life > 8) {
      if (hit) r.pos.addScaledVector(_gd, Math.max(0, t - 0.05));
      if (hit && r.dist + t > 6) explodeAt(r.pos.clone(), 1.05, 7, 105);
      else if (hit) { play('clink', { pos: r.pos, vol: 0.7, ref: 4, rate: 0.7 }); play('thud', { pos: r.pos, vol: 0.5, ref: 4 }); G.fx.impact(r.pos, hit.normal || _gd.clone().negate(), 'soft'); } // dud: not armed yet
      G.scene.remove(r.g); GL.splice(i, 1); continue;
    }
    r.pos.addScaledVector(r.vel, dt); r.dist += step;
    r.g.lookAt(_gp.copy(r.pos).sub(r.vel));
    if ((r.smoke -= dt) <= 0) { r.smoke = 0.03; G.fx.alpha.spawn(r.pos.x, r.pos.y, r.pos.z, rr(-0.2, 0.2), rr(-0.1, 0.3), rr(-0.2, 0.2), { life: rr(0.5, 0.9), size: 0.08, grow: 3, c: [0.82, 0.82, 0.83], alpha: 0.28, wind: 0.6 }); }
  }
}

// enemy throw: ballistic arc landing near the target, flight time T
export function lobAt(from, target, T = 1.2) {
  const v = new THREE.Vector3().subVectors(target, from).multiplyScalar(1 / T);
  v.y += 0.5 * 19 * T;
  return v;
}
