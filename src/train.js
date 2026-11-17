import { G, THREE, clamp } from './core.js';
import { Builder, TEX, mat4, labelTex, canvasTex } from './geom.js';
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
export const CAB_DOOR = new THREE.Vector3(0.82, DECK, -51.5);
// locomotive driving cab (hood unit, cab at the rear end facing the gun car): raised floor, door in the rear wall
export const CAB = { z0: -56.2, z1: -52.0, floor: 1.9, roof: 4.35, door0: 0.42, door1: 1.22,
  stand: new THREE.Vector3(0.78, 1.9, -55.2), seat: new THREE.Vector3(0.8, 2.42, -54.9), inside: new THREE.Vector3(0.82, 1.9, -52.7) };

export const T = { cars: [], invWalls: [], wheels: null, wheelInfo: [], mats: null, cab: null };

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
    // cab interior: painted panels (vertex colour), clear window glass, lamps and indicator bulbs
    cabin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08, envMapIntensity: 0.55 }),
    glassT: new THREE.MeshStandardMaterial({ color: 0xa8bcc8, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.4, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 3.2 }),
    indG: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x4dff6a, emissiveIntensity: 2.2 }),
    indA: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb030, emissiveIntensity: 2.2 }),
  };
  return T.mats;
}

// backlit gauge face (one texture for all dials)
let DIAL = null;
function dialTex() {
  return DIAL || (DIAL = canvasTex(128, 128, (g) => {
    g.fillStyle = '#1a1c1c'; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill();
    g.fillStyle = '#e9e2c8'; g.beginPath(); g.arc(64, 64, 55, 0, 7); g.fill();
    g.strokeStyle = '#c23a2a'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 46, -0.2, 0.75); g.stroke();
    g.strokeStyle = '#1a1a1a';
    for (let i = 0; i <= 20; i++) { const a = -Math.PI * 1.25 + (i / 20) * Math.PI * 2.0, r0 = i % 5 ? 44 : 38; g.lineWidth = i % 5 ? 1.5 : 3; g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); g.stroke(); }
    g.fillStyle = '#222'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('кгс/см²', 64, 92);
    g.strokeStyle = '#111'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(-0.6) * 44, 64 + Math.sin(-0.6) * 44); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill();
  }, { repeat: false }));
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
  const green = 0x56704f, red = 0x8f2a22, dk = 0x2b2c2d, F = CAB.floor, R = CAB.roof, z0 = CAB.z0, z1 = CAB.z1, cz = (z0 + z1) / 2, W2 = 1.475;
  // underframe, running boards, bogies, fuel tank
  b.boxC(0, 1.3, -61, 3.0, 0.3, 18, 'dark', dk);
  b.boxC(0, DECK - 0.01, -61, 3.0, 0.03, 18, 'steel', 0x55585a);
  for (const sx of [-1, 1]) b.boxC(sx * 1.5, 1.28, -61, 0.08, 0.3, 18, 'paint', red);
  bogie(b, c.z0 + 3.4, 3); bogie(b, c.z1 - 3.4, 3);
  b.boxC(0, 0.92, -61.6, 2.3, 0.6, 5.2, 'dark', 0x1f2021);
  for (const sx of [-1, 1]) b.cyl(sx * 1.17, 0.92, -61.6, 0.3, 0.3, 5.2, 'dark', 0x1f2021, Math.PI / 2, 0, 0, 10);
  // front end: buffer beam, pilot, headlights, steps, coupler
  b.boxC(0, 1.42, c.z0 - 0.15, 3.0, 0.45, 0.3, 'paint', red);
  for (let i = 0; i < 5; i++) b.boxC(0, 0.85 + i * 0.08, c.z0 - 0.42 + i * 0.05, 2.7 - i * 0.12, 0.08, 0.12, 'dark', 0x2a2a2a);
  for (const sx of [-1, 1]) { b.boxC(sx * 1.32, 1.05, c.z0 + 0.1, 0.4, 0.04, 0.25, 'steel', 0x666666); b.boxC(sx * 1.32, 0.78, c.z0 + 0.1, 0.4, 0.04, 0.25, 'steel', 0x666666); }
  // long hood (narrower and lower than the cab so the driver sees past it)
  const HX = 1.05, HT = 3.35, hz0 = c.z0 + 0.7, hz1 = z0, hzc = (hz0 + hz1) / 2, HL = hz1 - hz0;
  b.boxC(0, (DECK + HT) / 2, hzc, HX * 2, HT - DECK, HL, 'paint', green);
  b.boxC(0, HT + 0.05, hzc, HX * 2 - 0.16, 0.1, HL - 0.1, 'paint', green);
  b.boxC(0, HT + 0.11, hzc, HX * 2 - 0.3, 0.05, HL - 0.3, 'snow', SNOW);
  b.boxC(0, 2.6, hz0 - 0.03, HX * 2 - 0.1, 1.2, 0.04, 'dark', 0x26302a); // front radiator grille
  for (let x = -0.9; x <= 0.9; x += 0.1) b.boxC(x, 2.6, hz0 - 0.06, 0.02, 1.15, 0.03, 'dark', 0x1a1d1b);
  b.cyl(0, 3.0, hz0 - 0.08, 0.17, 0.17, 0.1, 'light', 0, Math.PI / 2, 0, 0, 14);  // headlight
  b.cyl(0, 3.0, hz0 - 0.03, 0.22, 0.22, 0.08, 'dark', 0x222222, Math.PI / 2, 0, 0, 14);
  for (const sx of [-0.7, 0.7]) b.cyl(sx, 1.95, hz0 - 0.05, 0.07, 0.07, 0.08, 'light', 0, Math.PI / 2, 0, 0, 10);
  b.boxC(0, 3.42, hz0 - 0.02, 0.9, 0.18, 0.04, 'paint', red);
  for (const sx of [-1, 1]) {
    for (let z = hz0 + 0.6; z < hz0 + 2.8; z += 0.13) b.boxC(sx * (HX + 0.012), 2.5, z, 0.025, 1.3, 0.05, 'dark', 0x2a3329); // radiator slats
    for (let i = 0; i < 4; i++) {
      const z = hz0 + 3.7 + i * 2.15;
      b.boxC(sx * (HX + 0.008), 2.45, z, 0.02, 1.55, 1.7, 'paint', 0x4c6646);
      b.boxC(sx * (HX + 0.03), 2.45, z + 0.66, 0.03, 0.14, 0.04, 'steel', 0x9a9a9a);
      for (let k = 0; k < 6; k++) b.boxC(sx * (HX + 0.02), 2.95, z - 0.55 + k * 0.22, 0.03, 0.3, 0.06, 'dark', 0x2a3329);
    }
    b.boxC(sx * (HX + 0.01), 1.95, hzc, 0.02, 0.12, HL, 'paint', red);
    for (let z = hz0 + 0.3; z <= hz1 - 0.2; z += 2.25) b.cyl(sx * 1.43, 1.95, z, 0.018, 0.018, 1.0, 'steel', 0xb0b0b0, 0, 0, 0, 5);
    b.boxC(sx * 1.43, 2.45, hzc, 0.035, 0.035, HL - 0.4, 'steel', 0xb8b8b8);
    icicles(b, sx * 1.5, 1.14, c.z0, c.z1, 0.4);
  }
  for (const z of [hz0 + 1.6, hz0 + 3.2]) { b.cyl(0, HT + 0.08, z, 0.62, 0.62, 0.08, 'dark', 0x1b1c1d, 0, 0, 0, 16); b.cyl(0, HT + 0.12, z, 0.5, 0.5, 0.03, 'snow', SNOW, 0, 0, 0, 14); }
  b.cyl(0.35, HT + 0.32, -61.2, 0.17, 0.2, 0.55, 'dark', 0x242424, 0, 0, 0, 8); // exhaust stack
  b.boxC(0, HT + 0.03, -58.6, 1.2, 0.06, 1.2, 'dark', 0x3a3e3a); // hatch
  // ---- cab shell: wall pieces around the window and door openings, green outside, pale lining inside
  const IN = 0x8fa79a;
  const wp = (x0, x1, y0, y1, z0_, z1_, ix, iz) => {
    b.boxC((x0 + x1) / 2, (y0 + y1) / 2, (z0_ + z1_) / 2, x1 - x0, y1 - y0, z1_ - z0_, 'paint', green);
    if (y1 > F + 0.01) { const ya = Math.max(y0, F); b.boxC((x0 + x1) / 2 + ix * ((x1 - x0) / 2 + 0.006), (ya + y1) / 2, (z0_ + z1_) / 2 + iz * ((z1_ - z0_) / 2 + 0.006), ix ? 0.012 : x1 - x0 - 0.01, y1 - ya, iz ? 0.012 : z1_ - z0_ - 0.01, 'cabin', IN); }
  };
  const sideZw0 = -55.65, sideZw1 = -54.0, wy0 = 3.0, wy1 = 3.9;
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? W2 - 0.07 : -W2, xb = xa + 0.07;
    wp(xa, xb, DECK, wy0, z0, z1, -sx, 0); wp(xa, xb, wy1, R, z0, z1, -sx, 0);
    wp(xa, xb, wy0, wy1, z0, sideZw0, -sx, 0); wp(xa, xb, wy0, wy1, sideZw1, z1, -sx, 0);
    b.boxC(sx * (W2 - 0.035), (wy0 + wy1) / 2, (sideZw0 + sideZw1) / 2, 0.02, wy1 - wy0, sideZw1 - sideZw0, 'glassT', 0);
    b.boxC(sx * (W2 + 0.005), wy0 - 0.02, (sideZw0 + sideZw1) / 2, 0.06, 0.05, sideZw1 - sideZw0 + 0.1, 'dark', 0x1c1c1c);
    b.boxC(sx * (W2 + 0.03), wy0 + 0.02, (sideZw0 + sideZw1) / 2, 0.05, 0.03, sideZw1 - sideZw0, 'snow', SNOW);
    b.boxC(sx * (W2 + 0.006), 2.05, cz, 0.02, 0.22, z1 - z0, 'paint', red);
    b.cyl(sx * (W2 + 0.04), 2.6, -52.25, 0.018, 0.018, 1.2, 'steel', 0xb8b8b8, 0, 0, 0, 5);         // grab handle
    icicles(b, sx * 1.52, R - 0.02, z0, z1, 0.25);
  }
  // front wall: two windows over the desks, centre pillar
  const fa = z0, fb = z0 + 0.07, fz = z0 + 0.035, fy0 = 3.05, fy1 = 3.95;
  wp(-W2, W2, DECK, fy0, fa, fb, 0, 1); wp(-W2, W2, fy1, R, fa, fb, 0, 1); wp(-0.12, 0.12, fy0, fy1, fa, fb, 0, 1);
  for (const sx of [-1, 1]) {
    wp(sx > 0 ? 1.3 : -W2, sx > 0 ? W2 : -1.3, fy0, fy1, fa, fb, 0, 1);
    b.boxC(sx * 0.71, (fy0 + fy1) / 2, fz, 1.18, fy1 - fy0, 0.02, 'glassT', 0);
    b.boxC(sx * 0.71, fy1 + 0.09, fb + 0.12, 1.1, 0.03, 0.22, 'dark', 0x2a2a2a);                       // sun visor
    b.boxC(sx * 0.62, fy0 + 0.3, fa - 0.03, 0.02, 0.6, 0.02, 'dark', 0x111111, 0, 0, sx * 0.5);         // wiper
    b.boxC(sx * 0.71, fy0 - 0.02, fa - 0.05, 1.2, 0.05, 0.1, 'snow', SNOW);
  }
  b.boxC(0, F + 0.3, fb + 0.1, 0.5, 0.6, 0.18, 'cabin', 0x4e5c54);                                       // heater
  for (let k = 0; k < 4; k++) b.boxC(0, F + 0.12 + k * 0.13, fb + 0.195, 0.44, 0.03, 0.01, 'dark', 0x222222);
  // rear wall: window on the left, door opening on the right
  const ra = z1 - 0.07, rb = z1, rz = z1 - 0.035, d0 = CAB.door0, d1 = CAB.door1, dTop = 3.95, ry0 = 3.0, ry1 = 3.85, rw0 = -1.2, rw1 = -0.15;
  wp(-W2, d0, DECK, ry0, ra, rb, 0, -1); wp(-W2, d0, ry1, R, ra, rb, 0, -1);
  wp(-W2, rw0, ry0, ry1, ra, rb, 0, -1); wp(rw1, d0, ry0, ry1, ra, rb, 0, -1);
  b.boxC((rw0 + rw1) / 2, (ry0 + ry1) / 2, rz, rw1 - rw0, ry1 - ry0, 0.02, 'glassT', 0);
  wp(d1, W2, DECK, R, ra, rb, 0, -1); wp(d0, d1, dTop, R, ra, rb, 0, -1);
  b.boxC((d0 + d1) / 2, (DECK + F) / 2, rz, d1 - d0, F - DECK, 0.07, 'paint', green);                  // step riser
  b.boxC((d0 + d1) / 2, F - 0.01, rz + 0.06, d1 - d0, 0.04, 0.2, 'steel', 0x6a6d70);                   // sill plate
  b.boxC((-W2 + d0) / 2, 2.05, rb + 0.006, d0 + W2, 0.22, 0.02, 'paint', red); b.boxC((d1 + W2) / 2, 2.05, rb + 0.006, W2 - d1, 0.22, 0.02, 'paint', red);
  b.boxC((rw0 + rw1) / 2, ry0 - 0.02, rb + 0.04, rw1 - rw0 + 0.1, 0.05, 0.1, 'snow', SNOW);
  for (const x of [d0 - 0.025, d1 + 0.025]) b.boxC(x, (F + dTop) / 2, rz, 0.05, dTop - F, 0.1, 'dark', 0x2b2f2b); // door jambs
  // roof
  b.boxC(0, R + 0.07, cz, W2 * 2 + 0.06, 0.14, z1 - z0 + 0.12, 'paint', 0x3c4d38);
  b.boxC(0, R + 0.17, cz, W2 * 2 - 0.2, 0.08, z1 - z0 - 0.1, 'snow', SNOW);
  b.boxC(0, R - 0.005, cz, W2 * 2 - 0.15, 0.01, z1 - z0 - 0.1, 'cabin', 0xa8b8ac);
  b.cyl(-0.5, R + 0.38, z0 + 0.4, 0.07, 0.07, 0.6, 'dark', 0x888888, Math.PI / 2, 0, 0, 6);              // horn
  b.cyl(-0.5, R + 0.3, z0 + 0.4, 0.02, 0.02, 0.2, 'dark', 0x555555, 0, 0, 0, 5);
  b.cyl(0.6, R + 0.55, -53.0, 0.012, 0.012, 0.9, 'dark', 0x222222, 0, 0, 0, 4);                         // radio whip
  // ---- interior: floor, driver's desk (right), assistant's desk (left), seats, cabinet, lamp
  b.boxC(0, F - 0.005, cz, W2 * 2 - 0.15, 0.01, z1 - z0 - 0.1, 'cabin', 0x2c2e2c);
  b.boxC(0, (DECK + F) / 2, cz, W2 * 2 - 0.1, F - DECK, z1 - z0 - 0.1, 'dark', dk);
  const dz0 = z0 + 0.07, dzF = -55.5, dTopY = F + 0.9;
  b.boxC((0.12 + 1.41) / 2, (F + dTopY) / 2, (dz0 + dzF) / 2, 1.29, dTopY - F, dzF - dz0, 'cabin', 0x5d7466);  // driver desk body
  b.boxC((0.12 + 1.41) / 2, dTopY + 0.015, (dz0 + dzF) / 2 + 0.05, 1.31, 0.03, dzF - dz0 + 0.04, 'cabin', 0x2a2c2b); // desk top
  b.boxC((0.12 + 1.41) / 2, dTopY + 0.17, -55.92, 1.29, 0.36, 0.06, 'cabin', 0x2f3833, -0.6, 0, 0);       // sloped instrument panel
  b.boxC((-1.41 - 0.35) / 2, (F + 2.75) / 2, (dz0 - 55.62) / 2, 1.06, 2.75 - F, -55.62 - dz0, 'cabin', 0x5d7466); // assistant desk
  b.boxC((-1.41 - 0.35) / 2, 2.765, (dz0 - 55.62) / 2 + 0.02, 1.08, 0.03, -55.62 - dz0 + 0.04, 'cabin', 0x2a2c2b);
  b.boxC((-1.41 - 0.35) / 2, 2.9, -55.98, 1.06, 0.3, 0.06, 'cabin', 0x2f3833, -0.6, 0, 0);
  b.boxC(-1.05, 2.9, -55.75, 0.42, 0.22, 0.24, 'dark', 0x303830);                                         // radio set
  b.boxC(-1.05, 2.97, -55.62, 0.36, 0.04, 0.01, 'indA', 0);
  b.boxC(-0.75, 2.86, -55.7, 0.07, 0.18, 0.06, 'dark', 0x111111, 0.3, 0, 0);                               // handset
  for (const [x, z] of [[CAB.seat.x, CAB.seat.z + 0.05], [-0.85, -55.05]]) {
    b.cyl(x, F + 0.22, z, 0.04, 0.05, 0.44, 'steel', 0x444444, 0, 0, 0, 8);
    b.cyl(x, F + 0.02, z, 0.22, 0.24, 0.04, 'steel', 0x444444, 0, 0, 0, 10);
    b.boxC(x, F + 0.48, z, 0.46, 0.09, 0.42, 'cabin', 0x4a2e22);
    b.boxC(x, F + 0.85, z + 0.24, 0.44, 0.55, 0.08, 'cabin', 0x4a2e22, 0.12, 0, 0);
  }
  b.boxC(-1.2, (F + 4.05) / 2, -53.4, 0.42, 4.05 - F, 1.0, 'cabin', 0x5d7466);                             // electrical cabinet
  for (let k = 0; k < 6; k++) b.boxC(-0.985, 2.4 + k * 0.22, -53.4, 0.02, 0.04, 0.6, 'dark', 0x222222);
  b.cyl(0.28, F + 0.42, -52.17, 0.08, 0.08, 0.5, 'paint', red, 0, 0, 0, 10);                             // extinguisher
  b.cyl(0, R - 0.05, -54.1, 0.16, 0.12, 0.06, 'dark', 0x333333, 0, 0, 0, 12);
  b.sphere(0, R - 0.1, -54.1, 0.11, 'lamp', 0, 1, 0.45, 1, 12);                                         // dome lamp
  // indicator lamps, switches on the driver's panel
  for (let i = 0; i < 6; i++) b.cyl(0.32 + i * 0.17, dTopY + 0.288, -55.96, 0.018, 0.018, 0.02, i % 3 === 0 ? 'red' : i % 3 === 1 ? 'indG' : 'indA', 0, Math.PI / 2 - 0.6, 0, 0, 8);
  for (let i = 0; i < 5; i++) b.boxC(0.4 + i * 0.2, dTopY + 0.04, -55.62, 0.03, 0.05, 0.03, 'steel', 0xcccccc, -0.5, 0, 0);
  b.boxC(0.3, dTopY + 0.08, -55.7, 0.2, 0.16, 0.34, 'dark', 0x252826);                                     // controller quadrant
  b.boxC(0.3, dTopY + 0.165, -55.7, 0.04, 0.01, 0.3, 'dark', 0x0e0e0e);
  b.cyl(1.2, dTopY + 0.07, -55.3, 0.09, 0.1, 0.14, 'dark', 0x2a2a2a, 0, 0, 0, 12);                        // brake valve body
  // ---- colliders: running board/underframe, hood, cab base, walls (door gap), desks, cabinet, roof
  addBox(-1.55, 1.15, c.z0, 1.55, DECK, c.z1, 'metal');
  addBox(-HX, DECK, hz0, HX, HT, hz1, 'metal');
  addBox(-W2, DECK, z0, W2, F, z1, 'metal');
  addBox(-W2, F, z0, -W2 + 0.07, R, z1, 'metal'); addBox(W2 - 0.07, F, z0, W2, R, z1, 'metal');
  addBox(-W2, F, z0, W2, R, z0 + 0.07, 'metal');
  addBox(-W2, F, z1 - 0.07, d0, R, z1, 'metal'); addBox(d1, F, z1 - 0.07, W2, R, z1, 'metal'); addBox(d0, dTop, z1 - 0.07, d1, R, z1, 'metal');
  addBox(0.12, F, z0, W2, dTopY, dzF, 'metal'); addBox(-W2, F, z0, -0.35, 2.75, -55.62, 'metal');
  addBox(-1.41, F, -53.9, -0.99, 4.05, -52.9, 'metal');
  addBox(-W2, R, z0, W2, R + 0.2, z1, 'metal');
  // number plates on the hood sides
  for (const sx of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), new THREE.MeshBasicMaterial({ map: labelTex('ТЭМ2-2241', { fg: '#efe6c8' }), transparent: true }));
    plate.position.set(sx * (HX + 0.03), 2.15, -62.3); plate.rotation.y = sx * Math.PI / 2; c.extra.push(plate);
  }
}

// moving parts of the cab (door, controller lever, brake handle) + gauges + cab light, parented to the loco
function buildCabParts(c) {
  const m = mats(), F = CAB.floor, dTopY = F + 0.9;
  const door = new THREE.Group(); door.position.set(CAB.door1, F, CAB.z1 - 0.035);
  const db = new Builder(), w = CAB.door1 - CAB.door0, h = 3.95 - F;
  db.boxC(-w / 2, h / 2, 0, w - 0.02, h, 0.05, 'paint', 0x56704f);
  db.boxC(-w / 2, 1.45, 0.005, w - 0.2, 0.62, 0.055, 'glassT', 0);
  db.boxC(-w / 2, 0.92, -0.02, w - 0.1, 0.03, 0.03, 'dark', 0x222222);
  db.boxC(-w + 0.1, 1.0, 0.04, 0.03, 0.16, 0.04, 'steel', 0xb0b0b0); db.boxC(-w + 0.1, 1.0, -0.04, 0.03, 0.16, 0.04, 'steel', 0xb0b0b0);
  db.boxC(-w / 2, 0.15, 0.03, w - 0.04, 0.3, 0.012, 'paint', 0x8f2a22);
  db.build(m, door);
  const lever = new THREE.Group(); lever.position.set(0.3, dTopY + 0.12, -55.7);
  const lb = new Builder();
  lb.cyl(0, 0.19, 0, 0.016, 0.02, 0.38, 'steel', 0xb8b8b8, 0, 0, 0, 8);
  lb.sphere(0, 0.39, 0, 0.045, 'dark', 0x111111, 1, 1, 1, 10);
  lb.cyl(0, 0.0, 0, 0.04, 0.04, 0.06, 'dark', 0x1a1a1a, 0, 0, Math.PI / 2, 10);
  lb.build(m, lever);
  const brake = new THREE.Group(); brake.position.set(1.2, dTopY + 0.15, -55.3);
  const bb = new Builder();
  bb.boxC(-0.13, 0.02, 0, 0.26, 0.03, 0.04, 'steel', 0x9a9a9a); bb.cyl(-0.26, 0.04, 0, 0.03, 0.03, 0.06, 'dark', 0x111111, 0, 0, 0, 8);
  bb.build(m, brake);
  // gauges: one instanced backlit dial mesh
  const dm = new THREE.MeshStandardMaterial({ map: dialTex(), emissive: 0xffffff, emissiveMap: dialTex(), emissiveIntensity: 0.45, roughness: 0.3 });
  const spots = [[0.4, dTopY + 0.157, -55.868, 0.075], [0.66, dTopY + 0.157, -55.868, 0.075], [0.92, dTopY + 0.157, -55.868, 0.075], [1.18, dTopY + 0.157, -55.868, 0.075], [-1.15, 2.92, -55.95, 0.06], [-0.85, 2.92, -55.95, 0.06]];
  const dials = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24), dm, spots.length);
  spots.forEach(([x, y, z, r], i) => dials.setMatrixAt(i, mat4(x, y, z, -0.6, 0, 0, r, r, r)));
  dials.computeBoundingSphere();
  const light = new THREE.PointLight(0xffd29a, 2.2, 4.5, 1.6); light.position.set(0, CAB.roof - 0.35, -54.1);
  for (const o of [door, lever, brake, dials, light]) c.inner.add(o);
  lever.rotation.x = 0.45; brake.rotation.y = 0;
  const doorBox = addBox(CAB.door0, F, CAB.z1 - 0.07, CAB.door1, 3.95, CAB.z1, 'metal'); doorBox.car = c.idx; c.boxes.push(doorBox);
  T.cab = { door, lever, brake, light, doorBox, doorT: 0, doorOpen: false, leverK: 0, brakeK: 0,
    knobL: new THREE.Vector3(0, 0.39, 0), knobB: new THREE.Vector3(-0.26, 0.04, 0) };
}
export function cabDoor(open) { if (T.cab) { T.cab.doorOpen = open; T.cab.doorBox.enabled = !open && !T.cars[0].falling; } }
export function cabKnob(which, out) { const k = T.cab; return (which === 'lever' ? k.lever : k.brake).localToWorld(out.copy(which === 'lever' ? k.knobL : k.knobB)); }

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
    if (i === 6 || i === 7) continue; // gap on the right: the walkway forward to the loco cab
    const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.7;
    const x = Math.sin(a) * 1.25, z = GUN_PIVOT.z - Math.cos(a) * 1.15;
    for (let k = 0; k < 2; k++) b.capsule(x, DECK + 0.14 + k * 0.24, z, 0.12, 0.42, 'cloth', sand, Math.PI / 2, a, 0, 1.1, 1.0);
  }
  for (const [x, z] of [[-1.05, -42.65], [-1.05, -43.35], [-1.05, -49.4]]) {
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
    const c = { ...def, falling: false, landed: false, vy: 0, vz: 0, av: 0, boxes: [], idx: T.cars.length, extra: [] };
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
    for (const o of c.extra) c.inner.add(o);
    c.boxes = G.boxes.slice(nBoxes);
    for (const bx of c.boxes) bx.car = c.idx;
    G.scene.add(c.group);
    T.cars.push(c);
    if (c.type === 'loco') buildCabParts(c);
  }
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
    if (c.type === 'loco') { const w = addBox(-1.9, DECK - 0.3, c.z0 - 0.6, 1.9, 6, c.z0 - 0.3, 'metal', 'inv'); w.enabled = false; w.car = c.idx; T.invWalls.push(w); c.boxes.push(w); }
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
  const ez = G.s - gorge.D - gorge.span0; // train-frame z of the gap's near edge (blown span)
  for (const c of T.cars) {
    const zc = (c.z0 + c.z1) / 2, L = c.z1 - c.z0;
    if (!c.falling && gorge.active && gorge.broken && c.z0 < ez - 0.2) {
      c.falling = true; c.tip = true; c.vy = 0; c.av = c.type === 'loco' ? -0.62 : -0.5 - Math.random() * 0.2; c.ar = (Math.random() - 0.5) * 0.25;
      for (const bx of c.boxes) bx.enabled = false;
      if (G.onCarFall) G.onCarFall(c);
    }
    if (c.tip) { // still rolling over the edge: pivots nose-down on the lip until its middle is past it, then drops
      const u = (ez - c.z0) / (L * 0.5);
      if (u < 1) {
        const th = -0.24 * u * u, s = Math.sin(th), co = Math.cos(th), ry = DECK - 0.45, rz = zc - ez;
        c.group.position.set(0, 0.45 + ry * co - rz * s, ez + ry * s + rz * co); c.group.rotation.x = th;
      } else { c.tip = false; c.vy = -3.2; c.group.position.z = zc; }
    } else if (c.falling && !c.landed) {
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
  // cab: door swing, controller lever, brake handle
  const k = T.cab;
  if (k) {
    k.doorT = clamp(k.doorT + (k.doorOpen ? dt : -dt) * 2.4, 0, 1);
    k.door.rotation.y = -(k.doorT * k.doorT * (3 - 2 * k.doorT)) * 1.75;
    k.lever.rotation.x = 0.45 - k.leverK * 0.9;
    k.brake.rotation.y = k.brakeK * 1.2;
    k.door.updateMatrixWorld(); k.lever.updateMatrixWorld(); k.brake.updateMatrixWorld();
  }
  // loco exhaust
  const loco = T.cars[0];
  if (!loco.falling && G.fx) {
    T.exhaustT -= dt;
    if (T.exhaustT <= 0) {
      T.exhaustT = 0.05;
      G.fx.smoke(_p.set(0.35, 3.95, -61.2), { size: 0.7, grow: 4, life: 2.6, color: 0x3a3a3a, alpha: 0.5, vy: 2.5, wind: 1 });
    }
  }
}

export function carAt(z) {
  for (const c of T.cars) if (z >= c.z0 - 0.5 && z <= c.z1 + 0.5) return c;
  return null;
}
