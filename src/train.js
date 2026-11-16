import { G, THREE, clamp } from './core.js';
import { Builder, TEX, mat4, labelTex } from './geom.js';
import { M } from './mats.js';
import { addBox, groundY, gorge } from './physics.js';

export const DECK = 1.45, ORE = 1.62, WALL = 2.62;

export const CARS = [
  { type: 'loco', z0: -70, z1: -52 },
  { type: 'gun', z0: -51, z1: -38 },
  { type: 'gond', z0: -37, z1: -24, heaps: [[0.78, -27.4], [-0.78, -31.2], [0.72, -34.6]] },
  { type: 'flat', z0: -23, z1: -10, crates: [[-1.45, -0.45, -14.2, -12.9, 1.15, 1], [0.45, 1.45, -18.0, -16.8, 1.25, 0], [-1.45, -0.5, -21.6, -20.5, 1.0, 1], [0.55, 1.4, -12.2, -11.2, 0.6, 0]] },
  { type: 'gond', z0: -9, z1: 4, heaps: [[0.75, 0.6], [-0.75, -4.6]] },
  { type: 'flat', z0: 5, z1: 18, crates: [[-1.45, -0.4, 9.0, 10.3, 1.2, 0], [0.4, 1.45, 13.2, 14.4, 1.1, 1], [-1.4, -0.6, 16.4, 17.4, 0.7, 0]] },
  { type: 'rear', z0: 19, z1: 32 },
];
export const GUN_PIVOT = new THREE.Vector3(0, DECK + 0.95, -46.6);
export const CAB_DOOR = new THREE.Vector3(0.85, DECK, -51.5);

export const T = { cars: [], invWalls: [], wheels: null, wheelInfo: [], mats: null };

// Cover spots. Teammates advance toward the engine (threat at -z): they hide on the +z side of an obstacle.
// Enemies face the player coming from the rear (threat at +z): they hide on the -z side.
export const COVER = { mate: [], enemy: [] };
(function computeCover() {
  for (const c of CARS) {
    if (c.crates) for (const [x0, x1, z0, z1, h] of c.crates) {
      const cx = (x0 + x1) / 2;
      COVER.mate.push({ x: cx, z: Math.min(z1 + 0.5, c.z1 - 0.3), h, car: c });
      COVER.enemy.push({ x: cx, z: Math.max(z0 - 0.55, c.z0 + 0.3), h, car: c });
    }
    if (c.heaps) for (const [x, z] of c.heaps) {
      COVER.mate.push({ x, z: z + 1.08, h: 0.95, car: c });
      COVER.enemy.push({ x, z: z - 1.08, h: 0.95, car: c });
    }
  }
  COVER.mate.push({ x: -0.95, z: -39.7, h: 1.1, car: CARS[1] });
  COVER.mate.push({ x: -0.9, z: 23.7, h: 0.7, car: CARS[6] });
})();

// NPC walking on the train: follow the centre lane between cars (no falling into the gaps)
export function deckY(x, z, prevY) {
  let best = -1;
  for (const b of G.boxes) {
    if (!b.enabled || b.noStand) continue;
    if (x < b.min.x - 0.05 || x > b.max.x + 0.05 || z < b.min.z - 0.05 || z > b.max.z + 0.05) continue;
    if (b.max.y <= prevY + 0.7 && b.max.y > best) best = b.max.y;
  }
  return best < 0 ? prevY : best;
}

function mats() {
  if (T.mats) return T.mats;
  T.mats = {
    ...M,
    glass: new THREE.MeshStandardMaterial({ color: 0x141c22, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.6 }),
    light: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff0c8, emissiveIntensity: 6 }),
    red: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3a22, emissiveIntensity: 5 }),
  };
  return T.mats;
}

const SNOW = 0xf2f5f8;

// hanging icicles along an edge
let _icR = 1;
function icicles(b, x, y, z0, z1, step = 0.32) {
  for (let z = z0 + 0.1; z < z1 - 0.1; z += step * (0.6 + ((_icR = (_icR * 9301 + 49297) % 233280) / 233280) * 0.8)) {
    const r = (_icR = (_icR * 9301 + 49297) % 233280) / 233280;
    if (r < 0.25) continue;
    const len = 0.04 + r * r * 0.22;
    b.add(new THREE.ConeGeometry(0.012 + r * 0.012, len, 5), 'ice', 0xffffff, mat4(x, y - len / 2, z, Math.PI, r * 3, 0));
  }
}

function bogie(b, zc, axles = 2) {
  const sp = axles === 2 ? 0.95 : 1.05;
  for (const sx of [-1, 1]) {
    b.boxC(sx * 0.98, 0.95, zc, 0.14, 0.38, axles === 2 ? 2.6 : 3.6, 'dark', 0x2a2b2c);
    b.boxC(sx * 0.98, 0.95, zc, 0.2, 0.2, 0.6, 'dark', 0x333436);
    b.cyl(sx * 1.02, 0.72, zc, 0.09, 0.09, 0.5, 'dark', 0x3d3d3d, 0, 0, 0, 6);
  }
  b.boxC(0, 1.12, zc, 2.0, 0.2, 0.5, 'dark', 0x2e2f30);
  const zs = axles === 2 ? [-sp, sp] : [-sp * 1.6, 0, sp * 1.6];
  for (const az of zs) T.wheelInfo.push({ car: T.cars.length, pos: new THREE.Vector3(0, 0.44, zc + az) });
}

function carChassis(b, c, color) {
  const L = c.z1 - c.z0, zc = (c.z0 + c.z1) / 2;
  b.boxC(0, 1.21, zc, 2.9, 0.3, L, 'dark', 0x2c2d2e); // top stays under the deck planks (avoids z-fighting)
  b.boxC(0, 1.15, zc, 0.5, 0.3, L, 'dark', 0x252627);
  for (const sx of [-1, 1]) b.boxC(sx * 1.5, 1.3, zc, 0.14, 0.34, L, 'paint', color);
  bogie(b, c.z0 + 2.3); bogie(b, c.z1 - 2.3);
  // couplers
  b.boxC(0, 1.05, c.z0 - 0.25, 0.3, 0.25, 0.6, 'dark', 0x303132);
  b.boxC(0, 1.05, c.z1 + 0.25, 0.3, 0.25, 0.6, 'dark', 0x303132);
}

function crate(b, x0, x1, z0, z1, h, tarp) {
  const y0 = DECK, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  b.boxC(cx, y0 + h / 2, cz, w, h, d, 'crate', 0xd2b892);
  // frame battens
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.boxC(cx + ox * (w / 2 - 0.03), y0 + h / 2, cz + oz * (d / 2 - 0.03), 0.08, h + 0.02, 0.08, 'wood', 0xa88b62);
  b.boxC(cx, y0 + h * 0.5, cz, w + 0.03, 0.08, d + 0.03, 'wood', 0xa88b62);
  if (tarp) {
    b.boxC(cx, y0 + h + 0.02, cz, w + 0.06, 0.06, d + 0.06, 'cloth', 0x4d5a45);
    b.boxC(cx, y0 + h * 0.75, cz, w + 0.07, h * 0.5, d + 0.07, 'cloth', 0x4a5742);
  }
  b.boxC(cx, y0 + h + (tarp ? 0.08 : 0.04), cz, w * 0.92, 0.07, d * 0.88, 'snow', SNOW);
  addBox(x0, y0, z0, x1, y0 + h, z1, 'wood');
}

function buildLoco(b, c) {
  const green = 0x56704f, red = 0x8f2a22, zc = (c.z0 + c.z1) / 2;
  b.boxC(0, 1.32, zc, 3.0, 0.34, 18, 'dark', 0x2b2c2d);
  bogie(b, c.z0 + 3.4, 3); bogie(b, c.z1 - 3.4, 3);
  b.boxC(0, 0.95, -61, 2.3, 0.6, 5.5, 'dark', 0x1f2021); // fuel tank
  // hood
  b.boxC(0, 2.75, -61, 2.5, 2.5, 10.8, 'paint', green);
  for (const sx of [-1, 1]) {
    b.boxC(sx * 1.255, 2.05, -61, 0.03, 0.2, 10.8, 'paint', red);
    for (let z = -65.5; z < -56.5; z += 1.1) b.boxC(sx * 1.26, 3.15, z, 0.03, 0.8, 0.7, 'dark', 0x2a3329);
    b.boxC(sx * 1.48, 1.62, -61, 0.04, 0.04, 10.8, 'dark', 0x777777);
    for (let z = -66; z <= -56; z += 2) b.cyl(sx * 1.48, 2.05, z, 0.02, 0.02, 0.8, 'dark', 0x777777, 0, 0, 0, 5);
    b.boxC(sx * 1.48, 2.45, -61, 0.035, 0.035, 10.8, 'dark', 0x8a8a8a);
  }
  b.boxC(0, 4.02, -61, 2.3, 0.04, 10.6, 'snow', SNOW);
  for (let z = -65; z <= -57; z += 2.6) { b.cyl(0, 4.03, z, 0.6, 0.6, 0.06, 'dark', 0x1b1c1d, 0, 0, 0, 14); b.cyl(0, 4.06, z, 0.5, 0.5, 0.03, 'snow', SNOW, 0, 0, 0, 14); }
  b.cyl(0.4, 4.35, -60.2, 0.18, 0.2, 0.7, 'dark', 0x242424, 0, 0, 0, 8); // stack
  // cabs
  for (const [z0, z1, front] of [[-70, -66.4, true], [-55.6, -52, false]]) {
    const cz = (z0 + z1) / 2;
    b.boxC(0, 2.9, cz, 2.95, 2.9, z1 - z0, 'paint', green);
    for (const sx of [-1, 1]) b.boxC(sx * 1.48, 2.05, cz, 0.03, 0.22, z1 - z0, 'paint', red);
    b.boxC(0, 4.42, cz, 3.0, 0.16, z1 - z0 + 0.1, 'paint', 0x3c4d38);
    b.boxC(0, 4.53, cz, 2.8, 0.08, z1 - z0 - 0.1, 'snow', SNOW);
    for (const sx of [-1, 1]) icicles(b, sx * 1.5, 4.34, z0, z1, 0.25);
    const fz = front ? z0 - 0.01 : z1 + 0.01;
    for (const sx of [-0.68, 0.68]) b.boxC(sx, 3.55, fz, 1.05, 0.85, 0.04, 'glass', 0);
    for (const sx of [-1, 1]) b.boxC(sx * 1.48, 3.6, cz, 0.04, 0.7, 1.6, 'glass', 0);
    b.boxC(0, 2.3, fz, 2.95, 0.25, 0.05, 'paint', red);
    if (front) {
      b.cyl(0, 4.62, z0 + 0.4, 0.17, 0.17, 0.18, 'light', 0, Math.PI / 2, 0, 0, 12);
      for (const sx of [-1.1, 1.1]) b.cyl(sx, 1.8, z0 - 0.05, 0.08, 0.08, 0.1, 'light', 0, Math.PI / 2, 0, 0, 10);
      b.boxC(0, 1.55, z0 - 0.35, 2.9, 0.5, 0.5, 'dark', 0x2a2a2a); // pilot
    } else {
      b.boxC(0.85, 2.55, z1 + 0.02, 0.7, 1.9, 0.05, 'dark', 0x3a4836); // door
      b.boxC(0.6, 2.55, z1 + 0.06, 0.05, 0.25, 0.05, 'dark', 0xaaaaaa);
    }
  }
  b.cyl(-0.5, 4.75, -66.2, 0.07, 0.07, 0.6, 'dark', 0x888888, Math.PI / 2, 0, 0, 6); // horn
  addBox(-1.55, DECK, c.z0, 1.55, 4.5, c.z1, 'metal');
}

function buildGondola(b, c) {
  const rust = 0x6e4a35, zc = (c.z0 + c.z1) / 2, L = c.z1 - c.z0;
  carChassis(b, c, rust);
  b.boxC(0, DECK + 0.02, zc, 2.9, 0.04, L, 'paint', 0x4a3a30);
  for (const sx of [-1, 1]) {
    b.boxC(sx * 1.485, (DECK + WALL) / 2, zc, 0.12, WALL - DECK, L, 'paint', rust);
    for (let z = c.z0 + 0.6; z < c.z1; z += 1.3) b.boxC(sx * 1.57, (DECK + WALL) / 2, z, 0.08, WALL - DECK, 0.14, 'paint', 0x5d3e2c);
    b.boxC(sx * 1.5, WALL + 0.03, zc, 0.2, 0.06, L, 'paint', 0x5a3c2a);
    b.boxC(sx * 1.5, WALL + 0.08, zc, 0.18, 0.05, L * 0.97, 'snow', SNOW);
    icicles(b, sx * 1.6, WALL, c.z0, c.z1);
    addBox(sx > 0 ? 1.42 : -1.56, DECK, c.z0, sx > 0 ? 1.56 : -1.42, WALL, c.z1, 'metal');
  }
  for (const ez of [c.z0 + 0.06, c.z1 - 0.06]) for (const sx of [-1, 1]) {
    const x0 = sx * 0.62, x1 = sx * 1.45;
    b.boxC((x0 + x1) / 2, (DECK + WALL) / 2, ez, Math.abs(x1 - x0), WALL - DECK, 0.12, 'paint', rust);
    b.boxC((x0 + x1) / 2, WALL + 0.05, ez, Math.abs(x1 - x0), 0.06, 0.16, 'snow', SNOW);
    addBox(Math.min(x0, x1), DECK, ez - 0.06, Math.max(x0, x1), WALL, ez + 0.06, 'metal');
  }
  // ore fill
  b.boxC(0, (DECK + ORE) / 2, zc, 2.84, ORE - DECK, L - 0.24, 'ore', 0x8a8580);
  addBox(-1.42, DECK, c.z0 + 0.12, 1.42, ORE, c.z1 - 0.12, 'ore');
  for (let i = 0; i < 9; i++) {
    const z = c.z0 + 1 + i * (L - 2) / 8, x = ((i * 37) % 5 - 2) * 0.3;
    b.sphere(x, ORE, z, 0.7, 'ore', 0x8a8580, 1.1, 0.35, 1.2, 8);
    b.sphere(x, ORE + 0.18, z, 0.55, 'snow', SNOW, 1.0, 0.18, 1.05, 8);
  }
  for (const [x, z] of c.heaps) {
    b.sphere(x, ORE + 0.25, z, 0.75, 'ore', 0x8a8580, 0.85, 1.1, 0.95, 9);
    b.sphere(x, ORE + 0.85, z, 0.45, 'snow', SNOW, 1.2, 0.35, 1.3, 9);
    addBox(x - 0.55, ORE, z - 0.62, x + 0.55, ORE + 0.95, z + 0.62, 'ore');
  }
}

function buildFlat(b, c, color = 0x3f4a3e) {
  const zc = (c.z0 + c.z1) / 2, L = c.z1 - c.z0;
  carChassis(b, c, color);
  b.boxC(0, DECK - 0.04, zc, 3.0, 0.08, L, 'wood', 0x8f7a5f);
  for (let z = c.z0 + 0.8; z < c.z1; z += 1.6) for (const sx of [-1, 1]) {
    b.boxC(sx * 1.5, DECK + 0.3, z, 0.1, 0.6, 0.1, 'dark', 0x3a3a3a);
  }
  // drifted snow along the stakes and in corners
  for (let i = 0; i < 7; i++) {
    const z = c.z0 + 0.9 + i * (L - 1.8) / 6, sx = i % 2 ? 1 : -1;
    b.sphere(sx * 1.32, DECK - 0.02, z, 0.45, 'snow', SNOW, 0.5, 0.12, 1.6 + (i % 3) * 0.4, 10);
  }
  addBox(-1.55, 1.25, c.z0, 1.55, DECK, c.z1, 'wood');
  for (const sx of [-1, 1]) icicles(b, sx * 1.55, 1.13, c.z0, c.z1, 0.45);
  if (c.crates) for (const [x0, x1, z0, z1, h, tarp] of c.crates) crate(b, x0, x1, z0, z1, h, tarp);
}

function buildRear(b, c) {
  buildFlat(b, c, 0x3b4048);
  // rear brake platform, lamp
  b.boxC(0, DECK + 0.5, c.z1 - 0.1, 2.9, 1.0, 0.1, 'dark', 0x2e3134);
  b.cyl(0.9, DECK + 1.25, c.z1 - 0.2, 0.25, 0.25, 0.05, 'dark', 0x333333, Math.PI / 2, 0, 0, 10);
  b.cyl(-1.2, DECK + 1.15, c.z1 + 0.02, 0.07, 0.07, 0.06, 'red', 0, Math.PI / 2, 0, 0, 8);
  b.boxC(-0.9, DECK + 0.35, 22.5, 1.1, 0.7, 1.4, 'paint', 0x4f5a44); // tool box
  b.boxC(-0.9, DECK + 0.72, 22.5, 1.0, 0.05, 1.3, 'snow', SNOW);
  addBox(-1.45, DECK, 21.8, -0.35, DECK + 0.7, 23.2, 'metal');
  addBox(-1.45, DECK, c.z1 - 0.15, 1.45, DECK + 1.0, c.z1 - 0.05, 'metal');
}

function buildGunCar(b, c) {
  buildFlat(b, c, 0x445040);
  const sand = 0xa39a78;
  // sandbag horseshoe around the gun
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.7;
    const x = Math.sin(a) * 1.25, z = GUN_PIVOT.z - Math.cos(a) * 1.15;
    for (let k = 0; k < 2; k++) b.capsule(x, DECK + 0.14 + k * 0.24, z, 0.12, 0.42, 'cloth', sand, Math.PI / 2, a, 0, 1.1, 1.0);
  }
  for (const [x, z] of [[1.05, -42.8], [1.05, -42.1], [-1.05, -49.4]]) {
    b.boxC(x, DECK + 0.18, z, 0.5, 0.36, 0.3, 'paint', 0x4d5838);
    b.boxC(x, DECK + 0.37, z, 0.45, 0.03, 0.26, 'snow', SNOW);
  }
  crate(b, -1.45, -0.5, -41.4, -40.2, 1.1, 1);
  // pedestal
  b.cyl(0, DECK + 0.4, GUN_PIVOT.z, 0.12, 0.25, 0.8, 'dark', 0x2d3129, 0, 0, 0, 10);
  b.cyl(0, DECK + 0.05, GUN_PIVOT.z, 0.5, 0.55, 0.1, 'dark', 0x2d3129, 0, 0, 0, 12);
  addBox(-0.25, DECK, GUN_PIVOT.z - 0.25, 0.25, DECK + 0.8, GUN_PIVOT.z + 0.25, 'metal');
}

// DShK heavy MG on a pivot (yaw group -> pitch group -> gun)
export function buildDShK() {
  const m = mats();
  const yaw = new THREE.Group(); yaw.position.copy(GUN_PIVOT);
  const pitch = new THREE.Group(); yaw.add(pitch);
  const b = new Builder();
  const k = 0x26292a, olive = 0x4a5236;
  b.cyl(0, -0.45, 0, 0.07, 0.07, 0.5, 'dark', k, 0, 0, 0, 8);
  b.boxC(0, -0.15, 0.05, 0.36, 0.08, 0.36, 'dark', k);
  b.boxC(0, 0.0, 0.1, 0.16, 0.2, 0.6, 'dark', 0x2f3332);          // receiver
  b.boxC(0, 0.11, 0.05, 0.12, 0.04, 0.4, 'dark', 0x3a3e3c);
  b.cyl(0, 0.0, -0.55, 0.034, 0.034, 1.15, 'dark', 0x1e2020, Math.PI / 2, 0, 0, 8); // barrel
  for (let i = 0; i < 9; i++) b.cyl(0, 0.0, -0.28 - i * 0.055, 0.055, 0.055, 0.025, 'dark', 0x2a2d2d, Math.PI / 2, 0, 0, 10);
  b.cyl(0, 0.0, -1.16, 0.06, 0.05, 0.14, 'dark', 0x1a1c1c, Math.PI / 2, 0, 0, 10);
  b.boxC(0, 0.09, -1.02, 0.015, 0.1, 0.02, 'dark', k);             // front post
  b.add(new THREE.TorusGeometry(0.075, 0.006, 6, 18), 'dark', k, mat4(0, 0.17, -0.12));
  b.boxC(0, 0.11, -0.12, 0.01, 0.06, 0.01, 'dark', k);
  for (const sx of [-0.09, 0.09]) b.boxC(sx, -0.02, 0.48, 0.035, 0.16, 0.035, 'dark', 0x1f1f1f, -0.2, 0, 0); // spade grips
  b.boxC(0, -0.02, 0.43, 0.2, 0.03, 0.03, 'dark', k);
  b.boxC(-0.2, -0.04, 0.06, 0.16, 0.22, 0.32, 'paint', olive);     // ammo can
  b.boxC(-0.11, 0.06, 0.06, 0.05, 0.03, 0.2, 'dark', 0x8a7a3a);    // belt
  b.build(m, pitch);
  // gloves for the player (shown when mounted)
  const gb = new Builder();
  for (const sx of [-0.09, 0.09]) { gb.boxC(sx, -0.02, 0.49, 0.08, 0.11, 0.1, 'cloth', 0x9a8a68); gb.boxC(sx, -0.05, 0.6, 0.11, 0.12, 0.22, 'cloth', 0x55606c); }
  const gloves = new THREE.Group(); gb.build(m, gloves, { cast: false }); gloves.visible = false; pitch.add(gloves);
  G.scene.add(yaw);
  T.dshk = { yaw, pitch, gloves, muzzleLocal: new THREE.Vector3(0, 0, -1.25), eyeLocal: new THREE.Vector3(0, 0.2, 0.92) };
  return T.dshk;
}

export function buildTrain() {
  const m = mats();
  for (const c of T.cars) { G.scene.remove(c.group); }
  T.cars = []; T.wheelInfo = []; T.invWalls = [];
  for (const def of CARS) {
    const c = { ...def, falling: false, landed: false, vy: 0, vz: 0, av: 0, boxes: [], idx: T.cars.length };
    const b = new Builder();
    const nBoxes = G.boxes.length;
    if (c.type === 'loco') buildLoco(b, c);
    else if (c.type === 'gond') buildGondola(b, c);
    else if (c.type === 'flat') buildFlat(b, c);
    else if (c.type === 'rear') buildRear(b, c);
    else if (c.type === 'gun') buildGunCar(b, c);
    const zc = (c.z0 + c.z1) / 2;
    c.group = new THREE.Group(); c.group.position.set(0, DECK, zc);
    c.inner = new THREE.Group(); c.inner.position.set(0, -DECK, -zc); c.group.add(c.inner);
    b.build(m, c.inner);
    c.boxes = G.boxes.slice(nBoxes);
    for (const bx of c.boxes) bx.car = c.idx;
    G.scene.add(c.group);
    T.cars.push(c);
  }
  // number plate on loco
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), new THREE.MeshBasicMaterial({ map: labelTex('ТЭ10М-2241', { fg: '#efe6c8' }), transparent: true }));
  plate.position.set(1.485, 2.5, -61 + 70 - 70); plate.rotation.y = Math.PI / 2;
  T.cars[0].inner.add(plate);
  const plate2 = plate.clone(); plate2.position.x = -1.485; plate2.rotation.y = -Math.PI / 2; T.cars[0].inner.add(plate2);
  // coupler plates between cars
  for (let i = 0; i < T.cars.length - 1; i++) {
    const a = T.cars[i], c = T.cars[i + 1];
    const bx = addBox(-1.4, 1.3, a.z1 - 0.1, 1.4, DECK, c.z0 + 0.1, 'metal');
    bx.car = c.idx; c.boxes.push(bx);
    const pb = new Builder();
    pb.boxC(0, DECK - 0.05, (a.z1 + c.z0) / 2, 2.6, 0.06, c.z0 - a.z1 - 0.02, 'steel', 0x6a6d70, 0, 0, 0, 0.02);
    for (const sx of [-1, 1]) pb.boxC(sx * 1.3, DECK - 0.01, (a.z1 + c.z0) / 2, 0.08, 0.04, c.z0 - a.z1 - 0.02, 'pRust', 0x9a5a2a, 0, 0, 0, 0.01);
    pb.build(mats(), c.inner, { cast: true, recv: true });
  }
  // invisible side walls (enabled after boarding)
  for (const c of T.cars) {
    if (c.type === 'loco') continue;
    for (const sx of [-1, 1]) {
      const w = addBox(sx * 1.62, DECK - 0.3, c.z0 - 0.5, sx * 1.9, 6, c.z1 + 0.5, 'metal', 'inv');
      w.enabled = false; w.car = c.idx; T.invWalls.push(w); c.boxes.push(w);
    }
  }
  const rw = addBox(-1.9, DECK - 0.3, 32.0, 1.9, 6, 32.3, 'metal', 'inv'); rw.enabled = false; T.invWalls.push(rw);
  // wheels (instanced, spinning)
  const wb = new Builder();
  wb.cyl(0, 0, 0, 0.44, 0.44, 0.12, 'dark', 0x2a2a2a, 0, 0, Math.PI / 2, 16);
  wb.cyl(0, 0, 0, 0.47, 0.47, 0.03, 'dark', 0x3a3a3a, 0, 0, Math.PI / 2, 16);
  wb.boxC(0.065, 0.22, 0, 0.02, 0.16, 0.24, 'dark', 0x55504a);
  wb.cyl(0, 0, 0, 0.06, 0.06, 1.7, 'dark', 0x2f2f2f, 0, 0, Math.PI / 2, 6);
  const wg = wb.geometry('dark');
  if (T.wheels) G.scene.remove(T.wheels);
  T.wheels = new THREE.InstancedMesh(wg, m.dark, T.wheelInfo.length * 2);
  T.wheels.castShadow = true; T.wheels.frustumCulled = false;
  G.scene.add(T.wheels);
  T.exhaustT = 0;
}

export function setInvWalls(on) { for (const w of T.invWalls) w.enabled = on && !(T.cars[w.car] && T.cars[w.car].falling); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _x = new THREE.Vector3(1, 0, 0);
export function updateTrain(dt) {
  // falling cars into the gorge
  for (const c of T.cars) {
    const zc = (c.z0 + c.z1) / 2;
    if (!c.falling && gorge.active && gorge.broken) {
      const front = c.z0 + 1.5;
      if (groundY(0, front) < -3) {
        c.falling = true; c.vy = -1; c.av = c.type === 'loco' ? -0.55 : -0.45 - Math.random() * 0.2; c.ar = (Math.random() - 0.5) * 0.25;
        for (const bx of c.boxes) bx.enabled = false;
        if (G.onCarFall) G.onCarFall(c);
      }
    }
    if (c.falling && !c.landed) {
      c.vy -= 19 * dt;
      c.group.position.y += c.vy * dt;
      c.group.rotation.x = Math.max(-1.2, c.group.rotation.x + c.av * dt);
      c.group.rotation.z += c.ar * dt;
      if (c.group.position.y < gorge.iceY + 1.8 + c.idx * 0.25) {
        c.landed = true; c.vz = 2;
        if (G.onCarLand) G.onCarLand(c);
      }
    }
    if (c.landed) { // carried by the ice (world)
      c.vz += (G.v - c.vz) * Math.min(1, dt * 3);
      c.group.position.z += c.vz * dt;
      c.group.rotation.x *= 1 - dt * 0.5;
    }
    c.group.updateMatrixWorld(true);
  }
  // wheels
  const ang = -(G.s / 0.44) % (Math.PI * 2);
  let i = 0;
  for (const w of T.wheelInfo) {
    const c = T.cars[w.car];
    for (const sx of [-0.76, 0.76]) {
      _q.setFromAxisAngle(_x, c.landed ? 0 : ang);
      _p.set(sx, w.pos.y, w.pos.z);
      _m.compose(_p, _q, _s);
      _m.premultiply(c.inner.matrixWorld);
      T.wheels.setMatrixAt(i++, _m);
    }
  }
  T.wheels.instanceMatrix.needsUpdate = true;
  // loco exhaust
  const loco = T.cars[0];
  if (!loco.falling && G.fx) {
    T.exhaustT -= dt;
    if (T.exhaustT <= 0) {
      T.exhaustT = 0.05;
      G.fx.smoke(_p.set(0.4, 4.75, -60.2), { size: 0.7, grow: 4, life: 2.6, color: 0x3a3a3a, alpha: 0.5, vy: 2.5, wind: 1 });
    }
  }
}

export function carAt(z) {
  for (const c of T.cars) if (z >= c.z0 - 0.5 && z <= c.z1 + 0.5) return c;
  return null;
}
