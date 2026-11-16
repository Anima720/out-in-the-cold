// Procedural PBR textures (albedo + height-derived normal map + roughness/metalness).
// Noise + pbr()/painted() technique adapted from wquguru/fable52-fps-repro (MIT License, (c) 2026 wquguru).
import * as THREE from 'three';
import { mulberry32 } from './core.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const PERM = new Uint8Array(512), VAL = new Float32Array(256);
{
  const r = mulberry32(7);
  for (let i = 0; i < 256; i++) { PERM[i] = i; VAL[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; }
  for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i];
}
function vn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = VAL[PERM[(PERM[x0 & 255] + y0 + s) & 255]], b = VAL[PERM[(PERM[x1 & 255] + y0 + s) & 255]];
  const c = VAL[PERM[(PERM[x0 & 255] + y1 + s) & 255]], d = VAL[PERM[(PERM[x1 & 255] + y1 + s) & 255]];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(u, v, oct, px, py, s = 0) {
  let a = 0.5, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * vn(u * px, v * py, px, py, s + i * 19); n += a; a *= 0.5; px *= 2; py *= 2; if (px > 256 || py > 256) break; }
  return sum / n;
}
// tileable cellular (worley F1) for stones / ore lumps
function cell(u, v, n, s) {
  const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
    const h = PERM[(PERM[(wx + s) & 255] + wy) & 255];
    const px = cx + VAL[h], py = cy + VAL[(h + 77) & 255];
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}

let MAXA = 8;
function texFrom(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXA;
  return t;
}
function canvas(N) { const c = document.createElement('canvas'); c.width = c.height = N; return c; }

export function pbr(N, fn, ns = 2) {
  const H = new Float32Array(N * N), ca = canvas(N), co = canvas(N), cn = canvas(N);
  const xa = ca.getContext('2d'), xo = co.getContext('2d'), xn = cn.getContext('2d');
  const ia = xa.createImageData(N, N), io = xo.createImageData(N, N), im = xn.createImageData(N, N);
  const o = { h: 0.5, r: 0.5, g: 0.5, b: 0.5, rough: 0.5, metal: 0 };
  for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
    fn(x / N, y / N, o, x, y); H[i] = o.h; const j = i * 4;
    ia.data[j] = clamp(o.r, 0, 1) * 255; ia.data[j + 1] = clamp(o.g, 0, 1) * 255; ia.data[j + 2] = clamp(o.b, 0, 1) * 255; ia.data[j + 3] = 255;
    io.data[j] = 255; io.data[j + 1] = clamp(o.rough, 0, 1) * 255; io.data[j + 2] = clamp(o.metal, 0, 1) * 255; io.data[j + 3] = 255;
  }
  const k = (ns * N) / 256;
  for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const nx = -(H[y * N + xr] - H[y * N + xl]) * k, ny = (H[yd * N + x] - H[yu * N + x]) * k;
    const l = 1 / Math.hypot(nx, ny, 1), j = i * 4;
    im.data[j] = (nx * l * 0.5 + 0.5) * 255; im.data[j + 1] = (ny * l * 0.5 + 0.5) * 255; im.data[j + 2] = (l * 0.5 + 0.5) * 255; im.data[j + 3] = 255;
  }
  xa.putImageData(ia, 0, 0); xo.putImageData(io, 0, 0); xn.putImageData(im, 0, 0);
  return { map: texFrom(ca, true), normalMap: texFrom(cn, false), orm: texFrom(co, false) };
}

export function stdMat(t, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, metalnessMap: t.orm, roughness: o.rough ?? 1, metalness: o.metal ?? 1, vertexColors: !!o.vc });
  if (o.ns) m.normalScale.set(o.ns, o.ns);
  if (o.env !== undefined) m.envMapIntensity = o.env;
  if (o.side) m.side = o.side;
  if (o.color) m.color.set(o.color);
  return m;
}

// ---- painted steel family with chips, edge wear and rust (shared wear layers)
const PN = 512;
let PL = null;
function wearLayers() {
  if (PL) return PL;
  PL = { n: new Float32Array(PN * PN), f: new Float32Array(PN * PN), c: new Float32Array(PN * PN), r: new Float32Array(PN * PN), s: new Float32Array(PN * PN) };
  const sc = canvas(PN), x = sc.getContext('2d'), R = mulberry32(5);
  x.fillStyle = '#000'; x.fillRect(0, 0, PN, PN); x.lineCap = 'round';
  for (let i = 0; i < 170; i++) {
    const a = R() * 6.28, l = 10 + R() * 80, px = R() * PN, py = R() * PN;
    x.strokeStyle = `rgba(255,255,255,${0.2 + R() * 0.7})`; x.lineWidth = 0.5 + R() * 1.3; x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (R() - 0.5) * 12, py + Math.sin(a) * l * 0.5 + (R() - 0.5) * 12, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  const sd = x.getImageData(0, 0, PN, PN).data;
  for (let y = 0, i = 0; y < PN; y++) for (let xx = 0; xx < PN; xx++, i++) {
    const u = xx / PN, v = y / PN;
    PL.n[i] = fbm(u, v, 5, 4, 4, 21); PL.f[i] = fbm(u, v, 3, 100, 100, 22); PL.c[i] = fbm(u, v, 5, 9, 9, 23) + (sd[i * 4] / 255) * 0.3; PL.r[i] = fbm(u, v, 4, 20, 20, 24);
    PL.s[i] = fbm(u, v, 4, 2, 40, 25); // vertical streaks
  }
  return PL;
}
function painted(col, th = 0.7, rust = 0.5, gloss = 0.5, streak = 0.5) {
  const L = wearLayers();
  return pbr(PN, (u, v, o, x, y) => {
    const i = y * PN + x, n = L.n[i], f = L.f[i], chip = sstep(th, th + 0.025, L.c[i]), edge = sstep(th - 0.04, th, L.c[i]) * (1 - chip);
    const dirt = sstep(0.5, 0.85, 1 - n) * 0.45, stk = sstep(0.55, 0.8, L.s[i]) * streak;
    const sh = (0.86 + (n - 0.5) * 0.3) * (1 - dirt) * (1 - edge * 0.35) * (1 - stk * 0.3);
    const rm = sstep(0.4, 0.65, L.r[i]) * rust, br = lerp(0.46, 0.3, rm), bg = lerp(0.45, 0.16, rm), bb = lerp(0.44, 0.08, rm);
    o.r = lerp(col[0] * sh + stk * 0.05, br, chip); o.g = lerp(col[1] * sh + stk * 0.02, bg, chip); o.b = lerp(col[2] * sh, bb, chip);
    o.h = 0.55 + (f - 0.5) * 0.05 - chip * 0.16 + edge * 0.03;
    o.rough = lerp(clamp(gloss + (f - 0.5) * 0.25 + dirt * 0.5 + stk * 0.2, 0, 1), lerp(0.36, 0.85, rm), chip);
    o.metal = chip * (1 - rm * 0.8);
  }, 1.6);
}
function fabric(base, blobs, seed, weave = 0.14, N = 256) {
  return pbr(N, (u, v, o) => {
    const w = (fbm(u, v, 2, 128, 128, seed + 2) - 0.5) * 2, n = fbm(u, v, 4, 8, 8, seed + 1);
    let c = base;
    if (blobs) for (const [col, th, sc, s2] of blobs) { if (fbm(u, v, 4, sc, sc, seed + s2) > th) c = col; }
    const sh = 0.86 + w * 0.06 + (n - 0.5) * 0.22;
    o.r = c[0] * sh; o.g = c[1] * sh; o.b = c[2] * sh; o.h = 0.5 + w * weave + (n - 0.5) * 0.2; o.rough = 0.9; o.metal = 0;
  }, 2);
}

export const TX = {}, M = {}, TILE = {};
export async function makePBR(renderer, onStep) {
  MAXA = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const steps = [];
  const add = (name, f) => steps.push([name, f]);
  add('snow', () => pbr(512, (u, v, o) => {
    const d = fbm(u, v, 5, 3, 3, 101), g = fbm(u, v, 3, 64, 64, 102), w = fbm(u, v, 4, 2, 9, 103);
    // wind-carved ripples (sastrugi) warped by low-frequency noise
    const rip = Math.sin((v * 34 + d * 7 + w * 3) * Math.PI * 2) * 0.5 + 0.5, ripM = sstep(0.35, 0.75, w);
    o.h = 0.5 + (d - 0.5) * 0.5 + (g - 0.5) * 0.08 + (w - 0.5) * 0.25 + (rip - 0.5) * 0.12 * ripM;
    const a = 0.8 + (d - 0.5) * 0.14 + (g - 0.5) * 0.05 - (1 - rip) * 0.025 * ripM;
    o.r = a * 0.955; o.g = a * 0.975; o.b = a * 1.0; o.rough = clamp(0.6 + (g - 0.5) * 0.45, 0.28, 1); o.metal = 0;
  }, 2.0));
  add('gravel', () => pbr(512, (u, v, o) => {
    const [d1, d2] = cell(u, v, 22, 11), e = d2 - d1, st = sstep(0.0, 0.25, e), tone = VAL[PERM[((Math.floor(u * 22) * 7 + Math.floor(v * 22) * 13) & 255)]];
    const sn = sstep(0.55, 0.7, fbm(u, v, 4, 6, 6, 112));
    o.h = 0.3 + st * 0.5 + sn * 0.25;
    const a = (0.28 + tone * 0.22) * (0.55 + st * 0.45);
    o.r = lerp(a * 1.04, 0.9, sn); o.g = lerp(a, 0.92, sn); o.b = lerp(a * 0.95, 0.95, sn); o.rough = lerp(0.9, 0.75, sn); o.metal = 0;
  }, 2.2));
  add('wood', () => pbr(512, (u, v, o) => {
    const pl = Math.floor(v * 8), pv = v * 8 - pl, gap = 1 - sstep(0.0, 0.05, Math.min(pv, 1 - pv));
    const g = fbm(u + pl * 0.37, v, 4, 2, 60, 121 + pl), k = fbm(u, v, 4, 6, 6, 122), tone = VAL[(pl * 31) & 255];
    o.h = 0.55 + (g - 0.5) * 0.25 - gap * 0.5;
    const a = (0.34 + tone * 0.1 + (g - 0.5) * 0.12) * (1 - gap * 0.7) * (0.85 + (k - 0.5) * 0.3);
    o.r = a * 1.12; o.g = a * 0.98; o.b = a * 0.82; o.rough = 0.82 + (g - 0.5) * 0.1; o.metal = 0;
  }, 1.6));
  add('crate', () => pbr(512, (u, v, o) => {
    const pl = Math.floor(v * 5), pv = v * 5 - pl, gap = 1 - sstep(0.0, 0.04, Math.min(pv, 1 - pv));
    const g = fbm(u + pl * 0.21, v, 4, 3, 80, 131 + pl), tone = VAL[(pl * 17 + 3) & 255];
    const nail = (1 - sstep(0.004, 0.009, Math.hypot(((u * 4) % 1) - 0.5, pv - 0.5) / 4)) * 1;
    o.h = 0.55 + (g - 0.5) * 0.3 - gap * 0.6 - nail * 0.2;
    const a = (0.55 + tone * 0.12 + (g - 0.5) * 0.18) * (1 - gap * 0.6) * (1 - nail * 0.6);
    o.r = a * 1.12; o.g = a * 0.94; o.b = a * 0.7; o.rough = 0.74 + (g - 0.5) * 0.15; o.metal = nail * 0.6;
  }, 1.6));
  add('pGreen', () => painted([0.24, 0.33, 0.22], 0.72, 0.5, 0.45, 0.6));
  add('pRed', () => painted([0.52, 0.11, 0.08], 0.7, 0.5, 0.45, 0.4));
  add('pRust', () => painted([0.36, 0.17, 0.1], 0.62, 1, 0.6, 0.9));
  add('pOlive', () => painted([0.28, 0.31, 0.21], 0.68, 0.6, 0.55, 0.6));
  add('pGrey', () => painted([0.28, 0.3, 0.32], 0.68, 0.6, 0.5, 0.6));
  add('pBridge', () => painted([0.27, 0.3, 0.28], 0.64, 0.8, 0.55, 0.7));
  add('pWhite', () => painted([0.7, 0.72, 0.73], 0.72, 0.4, 0.45, 0.4));
  add('steel', () => pbr(512, (u, v, o) => {
    const s = fbm(u, v, 4, 3, 128, 31), n = fbm(u, v, 4, 6, 6, 32), d = sstep(0.55, 0.8, fbm(u, v, 4, 10, 10, 33)), rs = sstep(0.6, 0.8, fbm(u, v, 4, 8, 8, 34));
    const a = 0.52 + (s - 0.5) * 0.1 + (n - 0.5) * 0.08 - d * 0.12;
    o.r = lerp(a, 0.42, rs); o.g = lerp(a, 0.26, rs); o.b = lerp(a * 1.02, 0.16, rs); o.h = 0.5 + (s - 0.5) * 0.06 + (n - 0.5) * 0.04 + rs * 0.05;
    o.rough = clamp(0.45 + (s - 0.5) * 0.22 + (n - 0.5) * 0.15 + d * 0.2 + rs * 0.3, 0, 1); o.metal = (1 - d * 0.3) * (1 - rs * 0.8);
  }, 1.0));
  add('ore', () => pbr(512, (u, v, o) => {
    const [d1, d2] = cell(u, v, 9, 41), e = d2 - d1, lump = sstep(0, 0.35, e), tone = VAL[PERM[((Math.floor(u * 9) * 5 + Math.floor(v * 9) * 11) & 255)]];
    const f = fbm(u, v, 3, 60, 60, 42), sn = sstep(0.62, 0.72, fbm(u, v, 4, 4, 4, 43) + lump * 0.15);
    o.h = 0.3 + lump * 0.6 + (f - 0.5) * 0.1 + sn * 0.1;
    const a = (0.16 + tone * 0.12 + (f - 0.5) * 0.05) * (0.6 + lump * 0.4);
    o.r = lerp(a * 1.05, 0.9, sn); o.g = lerp(a, 0.92, sn); o.b = lerp(a * 0.95, 0.95, sn); o.rough = lerp(0.88, 0.7, sn); o.metal = 0;
  }, 2.4));
  add('rock', () => pbr(512, (u, v, o) => {
    const n1 = fbm(u, v, 5, 4, 4, 51), n2 = fbm(u, v, 5, 14, 14, 52), strata = Math.sin((v + n1 * 0.3) * 40) * 0.5 + 0.5;
    const c = Math.abs(fbm(u, v, 5, 6, 6, 53) - 0.5) * 2, crack = 1 - sstep(0.0, 0.05, c);
    o.h = 0.5 + (n2 - 0.5) * 0.4 + strata * 0.1 - crack * 0.4;
    const a = 0.36 + (n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.1 - crack * 0.15;
    o.r = a; o.g = a * 0.99; o.b = a * 0.97; o.rough = 0.88; o.metal = 0;
  }, 2.0));
  add('ice', () => pbr(512, (u, v, o) => {
    const c = Math.abs(fbm(u, v, 5, 5, 5, 61) - 0.5) * 2, crack = 1 - sstep(0.0, 0.02, c);
    const n = fbm(u, v, 4, 3, 3, 62), b = sstep(0.75, 0.8, fbm(u, v, 3, 40, 40, 63)), sn = sstep(0.6, 0.75, fbm(u, v, 4, 5, 5, 64));
    o.h = 0.5 - crack * 0.25 + sn * 0.3 + (n - 0.5) * 0.08;
    o.r = lerp(0.6 + n * 0.08 + crack * 0.25 + b * 0.1, 0.92, sn); o.g = lerp(0.74 + n * 0.06 + crack * 0.2 + b * 0.1, 0.94, sn); o.b = lerp(0.82 + n * 0.05 + crack * 0.15, 0.97, sn);
    o.rough = lerp(0.06 + crack * 0.3, 0.7, sn); o.metal = 0;
  }, 1.2));
  add('concrete', () => pbr(512, (u, v, o) => {
    const n1 = fbm(u, v, 5, 4, 4, 71), n2 = fbm(u, v, 5, 14, 14, 72), fine = fbm(u, v, 3, 90, 90, 73);
    const stk = sstep(0.5, 0.78, fbm(u, v, 4, 40, 2, 74)) * sstep(0.35, 0.7, n1);
    o.h = 0.5 + (n2 - 0.5) * 0.22 + (fine - 0.5) * 0.09;
    let a = 0.5 + (n1 - 0.5) * 0.2 + (n2 - 0.5) * 0.1; a *= 1 - stk * 0.4;
    o.r = a * 1.02; o.g = a; o.b = a * 0.97; o.rough = 0.88; o.metal = 0;
  }, 1.7));
  const mkGun = (alb, met, seed) => pbr(512, (u, v, o) => {
    const f = fbm(u, v, 3, 128, 128, seed), n = fbm(u, v, 5, 6, 6, seed + 1), w = sstep(0.62, 0.75, fbm(u, v, 5, 12, 12, seed + 2));
    const a = alb + (n - 0.5) * 0.04 + w * 0.16; o.r = a; o.g = a * 1.01; o.b = a * 1.04; o.h = 0.5 + (f - 0.5) * 0.12 - w * 0.03;
    o.rough = clamp(0.5 + (f - 0.5) * 0.25 - w * 0.2 + (n - 0.5) * 0.2, 0, 1); o.metal = met;
  }, 1.2);
  add('gun', () => mkGun(0.11, 0.9, 141));
  add('gunW', () => mkGun(0.19, 0.35, 151));
  add('poly', () => pbr(256, (u, v, o) => { const s = vn(u * 128, v * 128, 128, 128, 161), n = fbm(u, v, 4, 6, 6, 162); const a = 0.08 + (n - 0.5) * 0.03; o.r = a; o.g = a; o.b = a * 1.05; o.h = 0.5 + (s - 0.5) * 0.5; o.rough = clamp(0.62 + (s - 0.5) * 0.25 + (n - 0.5) * 0.15, 0, 1); o.metal = 0; }, 1.6));
  add('plum', () => pbr(256, (u, v, o) => { const s = vn(u * 96, v * 96, 96, 96, 171), n = fbm(u, v, 4, 6, 6, 172); o.r = 0.3 + (n - 0.5) * 0.05; o.g = 0.12; o.b = 0.08; o.h = 0.5 + (s - 0.5) * 0.3; o.rough = 0.5 + (s - 0.5) * 0.2; o.metal = 0; }, 1.2));
  add('glove', () => fabric([0.12, 0.12, 0.13], null, 181));
  add('sleeve', () => fabric([0.25, 0.29, 0.34], [[[0.2, 0.23, 0.27], 0.58, 6, 3]], 191));
  add('camoRU', () => fabric([0.9, 0.91, 0.92], [[[0.66, 0.7, 0.74], 0.56, 4, 3], [[0.76, 0.79, 0.83], 0.6, 7, 5], [[0.55, 0.58, 0.6], 0.68, 10, 9]], 201, 0.14, 512));
  add('camoUS', () => fabric([0.6, 0.53, 0.39], [[[0.4, 0.41, 0.27], 0.55, 4, 3], [[0.44, 0.34, 0.23], 0.6, 6, 5], [[0.73, 0.68, 0.53], 0.62, 8, 9], [[0.3, 0.3, 0.22], 0.7, 12, 11]], 211, 0.14, 512));
  add('burlap', () => fabric([0.56, 0.5, 0.37], null, 221, 0.35));
  add('tarp', () => fabric([0.3, 0.35, 0.26], [[[0.26, 0.3, 0.22], 0.6, 5, 2]], 231, 0.2));
  add('bark', () => pbr(256, (u, v, o) => { const g = fbm(u, v, 4, 8, 1, 241), n = fbm(u, v, 4, 16, 16, 242); o.h = 0.5 + (g - 0.5) * 0.6; const a = 0.24 + (n - 0.5) * 0.08; o.r = a * 1.1; o.g = a * 0.95; o.b = a * 0.8; o.rough = 0.92; o.metal = 0; }, 2));

  for (let i = 0; i < steps.length; i++) {
    const [name, f] = steps[i];
    TX[name] = f();
    if (onStep) await onStep(name, (i + 1) / steps.length);
  }

  // materials (vc = vertex colors used as tint)
  const S = THREE.DoubleSide;
  Object.assign(M, {
    snow: stdMat(TX.snow, { env: 0.6, ns: 0.8 }),
    gravel: stdMat(TX.gravel, { vc: true, ns: 1.2 }),
    wood: stdMat(TX.wood, { vc: true }),
    crate: stdMat(TX.crate, { vc: true }),
    pGreen: stdMat(TX.pGreen, { vc: true }), pRed: stdMat(TX.pRed, { vc: true }), pRust: stdMat(TX.pRust, { vc: true }),
    pOlive: stdMat(TX.pOlive, { vc: true }), pGrey: stdMat(TX.pGrey, { vc: true }), pBridge: stdMat(TX.pBridge, { vc: true }), pWhite: stdMat(TX.pWhite, { vc: true }),
    steel: stdMat(TX.steel, { vc: true }),
    ore: stdMat(TX.ore, { vc: true, ns: 1.4 }),
    rock: stdMat(TX.rock, { vc: true, side: S }),
    ice: stdMat(TX.ice, { env: 1.4, ns: 0.6 }),
    concrete: stdMat(TX.concrete, { vc: true }),
    gun: stdMat(TX.gun, { env: 2.0, ns: 0.5, vc: true }), gunW: stdMat(TX.gunW, { env: 2.0, ns: 0.5, vc: true }),
    poly: stdMat(TX.poly, { env: 2.0, vc: true }), plum: stdMat(TX.plum, { env: 2.0, vc: true }),
    glove: stdMat(TX.glove, { env: 1.6, vc: true }), sleeve: stdMat(TX.sleeve, { env: 1.6, vc: true }),
    burlap: stdMat(TX.burlap, { vc: true }), tarp: stdMat(TX.tarp, { vc: true }), bark: stdMat(TX.bark, { vc: true }),
  });
  Object.assign(TILE, {
    snow: 6, gravel: 1.6, wood: 2.4, crate: 1.2, pGreen: 1.6, pRed: 1.6, pRust: 1.6, pOlive: 1.6, pGrey: 1.6, pBridge: 2.2, pWhite: 1.4,
    steel: 1.2, ore: 1.6, rock: 7, ice: 9, concrete: 3, gun: 0.25, gunW: 0.25, poly: 0.15, plum: 0.15, glove: 0.1, sleeve: 0.14,
    burlap: 0.5, tarp: 1.0, bark: 1.0, dark: 1.2, paint: 1.6,
  });
  M.dark = M.steel; M.paint = M.pOlive; M.cloth = M.tarp;
  return M;
}
