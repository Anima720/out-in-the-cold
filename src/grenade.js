import { G, THREE, rr, clamp } from './core.js';
import { Builder } from './geom.js';
import { M } from './mats.js';
import { rayBoxes, groundY, inGorge } from './physics.js';
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
  for (let i = NADES.length - 1; i >= 0; i--) {
    const n = NADES[i];
    n.fuse -= dt;
    if (n.fuse <= 0) {
      explodeAt(n.pos.clone().setY(n.pos.y + 0.15), 1.0, 7.5, n.owner === 'player' ? 95 : 85);
      G.scene.remove(n.g); NADES.splice(i, 1);
      continue;
    }
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

export function clearNades() { for (const n of NADES) G.scene.remove(n.g); NADES.length = 0; }

// enemy throw: ballistic arc landing near the target, flight time T
export function lobAt(from, target, T = 1.2) {
  const v = new THREE.Vector3().subVectors(target, from).multiplyScalar(1 / T);
  v.y += 0.5 * 19 * T;
  return v;
}
