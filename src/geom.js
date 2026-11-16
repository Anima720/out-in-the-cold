import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './core.js';
import { TILE } from './mats.js';

// 'paint' resolves to the nearest procedural paint by colour; colour then only tints lightly.
const PAINTS = [['pGreen', 0x56704f], ['pRed', 0x8f2a22], ['pRust', 0x6e4a35], ['pOlive', 0x445040], ['pGrey', 0x3b4048], ['pWhite', 0xd9dde0], ['pBridge', 0x4c5552]];
const WHITE = new Set(['pGreen', 'pRed', 'pRust', 'pOlive', 'pGrey', 'pWhite', 'pBridge', 'crate', 'ore', 'snow', 'gun', 'gunW', 'poly', 'plum', 'glove', 'sleeve', 'burlap', 'concrete']);
const BOOST = new Set(['dark', 'steel']);
const _ca = new THREE.Color(), _cb = new THREE.Color();
function resolve(key, color) {
  if (key === 'paint') {
    _ca.set(color); let best = 'pOlive', bd = 9;
    for (const [k, c] of PAINTS) { _cb.set(c); const d = (_ca.r - _cb.r) ** 2 + (_ca.g - _cb.g) ** 2 + (_ca.b - _cb.b) ** 2; if (d < bd) { bd = d; best = k; } }
    return [best, 0xffffff];
  }
  if (key === 'cloth') { _ca.set(color); if (_ca.r > _ca.g * 0.95 && _ca.r + _ca.g + _ca.b > 0.5) return ['burlap', 0xffffff]; return ['tarp', 0xffffff]; }
  if (WHITE.has(key)) return [key, 0xffffff];
  if (key === 'wood') { const v = 0.9 + Math.random() * 0.2; return [key, new THREE.Color(v, v, v)]; }
  if (BOOST.has(key)) { _ca.set(color); return [key, new THREE.Color(Math.min(1.6, _ca.r * 2.6), Math.min(1.6, _ca.g * 2.6), Math.min(1.6, _ca.b * 2.6))]; }
  return [key, color];
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function colorize(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Triplanar world-ish UVs so textures tile at a constant scale on merged parts.
export function triUV(geo, scale = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// bevelled box: edges catch highlights instead of looking CG-flat
export function rbox(w, h, d, r) {
  const m = Math.min(w, h, d);
  r = r ?? Math.min(0.03, m * 0.22);
  if (r < 0.0015 || m < 0.006) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, m * 0.49));
}

// Collects geometry per material key, merges into few meshes with vertex colors.
export class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, key, color, matrix, uvScale = null) {
    [key, color] = resolve(key, color);
    if (uvScale === null) uvScale = TILE[key] ? 1 / TILE[key] : 0.5;
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (matrix) g.applyMatrix4(matrix);
    if (uvScale) triUV(g, uvScale);
    colorize(g, color);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, key, color, rot) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    const m = rot ? mat4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, rot[0], rot[1], rot[2]) : mat4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(rbox(w, h, d), key, color, m);
  }
  boxC(cx, cy, cz, w, h, d, key, color, rx = 0, ry = 0, rz = 0, r) {
    return this.add(rbox(w, h, d, r), key, color, mat4(cx, cy, cz, rx, ry, rz));
  }
  cyl(cx, cy, cz, r0, r1, h, key, color, rx = 0, ry = 0, rz = 0, seg = 10) {
    return this.add(new THREE.CylinderGeometry(r0, r1, h, seg), key, color, mat4(cx, cy, cz, rx, ry, rz));
  }
  sphere(cx, cy, cz, r, key, color, sx = 1, sy = 1, sz = 1, seg = 10) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), key, color, mat4(cx, cy, cz, 0, 0, 0, sx, sy, sz));
  }
  capsule(cx, cy, cz, r, len, key, color, rx = 0, ry = 0, rz = 0, sx = 1, sz = 1) {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, 8), key, color, mat4(cx, cy, cz, rx, ry, rz, sx, 1, sz));
  }
  geometry(key) {
    const list = this.parts.get(key);
    if (!list || !list.length) return null;
    const g = mergeGeometries(list, false);
    g.computeBoundingSphere();
    return g;
  }
  build(materials, parent, opts = {}) {
    const meshes = [];
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[key] || materials.default);
      mesh.castShadow = opts.cast !== false && key !== 'glass' && key !== 'light';
      mesh.receiveShadow = opts.receive !== false;
      if (parent) parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

// ---------- canvas textures ----------
export function canvasTex(w, h, draw, { repeat = true, srgb = true, seed = 7 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h, mulberry32(seed));
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, r, n, cols, smin, smax, alpha) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    g.fillStyle = cols[(r() * cols.length) | 0];
    const s = smin + r() * (smax - smin);
    g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r()), r() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

export const TEX = {};
export function makeTextures() {
  TEX.grime = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 260, ['#b8b2aa', '#c9c4bd', '#d8d4ce'], 2, 14, 0.5);
    for (let i = 0; i < 40; i++) { // rust streaks
      g.globalAlpha = 0.12 + r() * 0.18; g.fillStyle = r() < 0.5 ? '#8a5a3a' : '#6e5a4a';
      const x = r() * w, y = r() * h; g.fillRect(x, y, 1 + r() * 3, 20 + r() * 90);
    }
    speckle(g, w, h, r, 500, ['#7a6a5a', '#9a8a7a'], 0.5, 1.6, 0.6);
    g.globalAlpha = 1;
  });
  TEX.snow = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 180, ['#dfe6ee', '#e9eef4', '#d6dee8'], 6, 30, 0.45);
    speckle(g, w, h, r, 600, ['#ffffff', '#cfd8e2'], 0.4, 1.2, 0.8);
  }, { seed: 3 });
  TEX.wood = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#c9b08a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = r() < 0.5 ? '#bfa47c' : '#cfb592'; g.fillRect(0, y, w, 30);
      g.fillStyle = '#6d5a42'; g.fillRect(0, y + 30, w, 2);
      for (let i = 0; i < 12; i++) { g.globalAlpha = 0.25; g.fillStyle = '#9c8260'; g.fillRect(0, y + r() * 30, w, 1); }
      g.globalAlpha = 1;
    }
    speckle(g, w, h, r, 80, ['#5d4a36'], 1, 3, 0.5);
  }, { seed: 5 });
  TEX.rock = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#8c8e90'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 300, ['#6d6f72', '#a4a6a8', '#7d7a76', '#5a5c5f'], 3, 22, 0.55);
    g.strokeStyle = '#3f4144'; g.globalAlpha = 0.5;
    for (let i = 0; i < 25; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += r() * 30; g.lineTo(x, y); } g.lineWidth = 1 + r() * 2; g.stroke(); }
    g.globalAlpha = 1;
  }, { seed: 9 });
  TEX.ore = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#4a4744'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 500, ['#2e2c2a', '#5e5a55', '#6b5b4b', '#3a3836'], 3, 11, 0.85);
    speckle(g, w, h, r, 120, ['#e8edf2'], 2, 7, 0.5);
  }, { seed: 11 });
  TEX.ice = canvasTex(512, 512, (g, w, h, r) => {
    g.fillStyle = '#c8dbe6'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 120, ['#b2cad8', '#dce9f1', '#eef5f9'], 10, 60, 0.4);
    g.strokeStyle = '#ffffff'; g.globalAlpha = 0.55;
    for (let i = 0; i < 40; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 80; y += (r() - 0.5) * 80; g.lineTo(x, y); } g.lineWidth = 0.6 + r() * 1.4; g.stroke(); }
    g.globalAlpha = 1;
  }, { seed: 13 });
  TEX.camoRU = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#eef0f2'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 70, ['#b9c0c8', '#cfd5db', '#a8b0b8'], 8, 26, 0.75);
    speckle(g, w, h, r, 200, ['#8e969e'], 1, 4, 0.5);
  }, { seed: 17 });
  TEX.camoUS = canvasTex(256, 256, (g, w, h, r) => {
    g.fillStyle = '#c9b993'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 60, ['#8f8a5e', '#a99a72', '#6f6a4a', '#b5a986'], 8, 24, 0.75);
    speckle(g, w, h, r, 120, ['#5e4f3a', '#e0d6bb'], 1, 5, 0.6);
  }, { seed: 19 });
  TEX.cloth = canvasTex(128, 128, (g, w, h, r) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 300, ['#c4c4c4', '#e6e6e6'], 0.5, 2.5, 0.6);
  }, { seed: 23 });
  // soft round sprite, smoke sprite, flash star
  TEX.soft = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { repeat: false, srgb: false });
  TEX.smoke = canvasTex(128, 128, (g, w, h, r) => {
    for (let i = 0; i < 26; i++) {
      const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rad = 18 + r() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  }, { repeat: false, srgb: false, seed: 29 });
  TEX.flash = canvasTex(128, 128, (g, w, h, r) => {
    g.translate(64, 64);
    for (let i = 0; i < 7; i++) {
      g.rotate((Math.PI * 2) / 7 + r() * 0.3);
      const gr = g.createLinearGradient(0, 0, 60, 0);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -6); g.lineTo(56 + r() * 8, 0); g.lineTo(0, 6); g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
  }, { repeat: false, srgb: false, seed: 31 });
  TEX.hole = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.25, 'rgba(25,20,16,0.95)'); gr.addColorStop(0.5, 'rgba(60,50,40,0.5)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, { repeat: false });
  return TEX;
}

// label texture (stencil text on a plate)
export function labelTex(text, { w = 512, h = 128, bg = null, fg = '#e8e2d0', font = 'bold 84px "Arial Narrow", Arial, sans-serif' } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, { repeat: false });
}
