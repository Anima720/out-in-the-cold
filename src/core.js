import * as THREE from 'three';
export { THREE };

// Global game state. Coordinates are in the TRAIN FRAME: the train stands still,
// the world (ground, trees, bridge) scrolls toward +z at the train's speed G.v.
// A world feature at track distance d sits at z = G.s - d.
export const G = {
  t: 0, dt: 0, real: 0, frame: 0, timeScale: 1, paused: false,
  s: 0, v: 0, vTarget: 0, vRate: 1.5,
  boxes: [], humans: [], enemies: [], mates: [], sleds: [], rockets: [],
  params: {}, stats: { shots: 0, hits: 0, kills: 0, deaths: 0, t0: 0 },
  state: 'boot', phase: '',
};
if (typeof window !== 'undefined') window.__G = G;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _r = mulberry32(90210);
export const rnd = () => _r();
export const reseed = (n) => { _r = mulberry32(n); };
export const rr = (a, b) => a + (b - a) * _r();
export const ri = (a, b) => Math.floor(a + (b - a + 1) * _r());
export const pick = (arr) => arr[Math.floor(_r() * arr.length)];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = new THREE.Vector3(0, 1, 0);

export function fwdYaw(yaw, out = new THREE.Vector3()) { return out.set(-Math.sin(yaw), 0, -Math.cos(yaw)); }
export function rightYaw(yaw, out = new THREE.Vector3()) { return out.set(Math.cos(yaw), 0, -Math.sin(yaw)); }
export function yawOf(d) { return Math.atan2(-d.x, -d.z); }
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const c = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}

export class Events {
  constructor() { this.m = new Map(); }
  on(k, f) { if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(f); }
  emit(k, a) { const l = this.m.get(k); if (l) for (const f of l) f(a); }
}
export const events = new Events();

// track distance <-> train-frame z
export const zOfD = (d) => G.s - d;
export const dOfZ = (z) => G.s - z;
