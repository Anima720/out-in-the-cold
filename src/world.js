import { G, THREE, mulberry32, clamp, smooth, damp } from './core.js';
import { Builder, TEX, mat4 } from './geom.js';
import { M, TX, stdMat } from './mats.js';
import { gorge } from './physics.js';

export const W = { chunks: new Map(), L: 80, fogTarget: 0.0115, fogDensity: 0.0115 };

export const QUALITY = {
  low: { name: 'low', dpr: 0.85, aa: false, shadows: false, shadowSize: 1024, snow: 2500, msaa: 0, ao: false, bloom: false },
  medium: { name: 'medium', dpr: 1, aa: false, shadows: true, shadowSize: 1024, snow: 6000, msaa: 2, ao: false, bloom: true },
  high: { name: 'high', dpr: 1.5, aa: false, shadows: true, shadowSize: 2048, snow: 9000, msaa: 4, ao: true, bloom: true },
};

export function createRenderer(canvas, Q) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  G.renderer = renderer;
  return renderer;
}

export function hill(x, d) {
  const a = Math.abs(x);
  // plough berms either side of the line
  const bq = (a - 7.2) / 1.5, berm = a > 4 && a < 11 ? 0.75 * Math.exp(-bq * bq) * (0.7 + 0.3 * Math.sin(d * 0.11 + (x > 0 ? 1.7 : 0))) : 0;
  const ramp = smooth((a - 16) / 50);
  if (ramp <= 0) return berm;
  const h = Math.sin(x * 0.021 + d * 0.013) * 3 + Math.sin(x * 0.047 - d * 0.031 + 1.3) * 1.6
    + Math.sin(d * 0.0061 + x * 0.0042) * 6 + Math.sin(x * 0.11 + d * 0.09) * 0.5;
  return (h + 4) * ramp + berm;
}

export function initWorld(canvas, Q) {
  const renderer = G.renderer || createRenderer(canvas, Q);

  const scene = new THREE.Scene();
  W.fogColor = new THREE.Color(0xaab6c1);
  scene.fog = new THREE.FogExp2(W.fogColor.clone(), W.fogDensity);
  scene.background = W.fogColor.clone();
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2500);
  camera.rotation.order = 'YXZ';
  G.camera = camera;
  scene.add(camera);

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x6f7d8b) }, bot: { value: W.fogColor.clone() }, sunDir: { value: new THREE.Vector3(-0.55, 0.75, 0.45).normalize() }, uT: { value: 0 }, uFog: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform float uT; uniform float uFog; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = .5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*noise(p); p *= 2.03; a *= .5; } return s; }
      void main(){
        vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(bot, top, pow(clamp(d.y*2.2, 0.0, 1.0), 0.8));
        vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uT*0.012, uT*0.004);
        float c = fbm(cp), c2 = fbm(cp*2.3 + 7.0);
        float cloud = smoothstep(0.35, 0.75, c*0.75 + c2*0.35);
        vec3 cloudCol = mix(vec3(0.42,0.46,0.52), vec3(0.86,0.88,0.9), smoothstep(0.4, 0.9, c2));
        col = mix(col, cloudCol, cloud * smoothstep(0.02, 0.25, d.y) * 0.75);
        float sd = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.86, 0.68) * (pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.08) * (1.0 - cloud * 0.6);
        col = mix(col, bot, (1.0 - smoothstep(0.0, 0.22, d.y)) * uFog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 24, 12), skyMat);
  W.sky.renderOrder = -10;
  scene.add(W.sky);

  // lights: overcast
  W.hemi = new THREE.HemisphereLight(0xd4e0ec, 0x5e646b, 1.0);
  scene.add(W.hemi);
  W.sun = new THREE.DirectionalLight(0xffe9d2, 1.9);
  W.sunDir = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();
  W.sun.castShadow = Q.shadows;
  W.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
  const sc = W.sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 160;
  W.sun.shadow.bias = -0.0006; W.sun.shadow.normalBias = 0.03;
  scene.add(W.sun); scene.add(W.sun.target);

  // image-based lighting from a simple overcast sky (gives metals something to reflect)
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 hor = vec3(0.78,0.82,0.87); vec3 c = h > 0.0 ? mix(hor, vec3(0.45,0.5,0.57), pow(h, 0.7)) : mix(hor, vec3(0.9,0.92,0.94), min(1.0, -h*4.0)); gl_FragColor = vec4(c, 1.0); }',
    })));
    W.env = pm.fromScene(es, 0.04).texture;
    scene.environment = W.env;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  W.hemi.intensity = 0.6;

  // world root (scrolls with G.s)
  W.root = new THREE.Group();
  scene.add(W.root);

  // materials
  const snow = stdMat(TX.snow, { env: 0.55, ns: 0.9 });
  snow.onBeforeCompile = (sh) => { // view-dependent glitter on snow
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;\nfloat h13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }')
      .replace('#include <tonemapping_fragment>', 'vec3 vd = normalize(vViewPosition); float g = h13(floor(vLP*38.0) + floor(vd*9.0)); gl_FragColor.rgb += vec3(0.9,0.95,1.0) * step(0.9975, g) * 2.2 * smoothstep(60.0, 4.0, length(vViewPosition));\n#include <tonemapping_fragment>');
  };
  W.mat = {
    snow,
    bed: M.gravel,
    sleeper: stdMat(TX.wood, { color: 0x6e5e4e }),
    rail: stdMat(TX.steel, { color: 0xc8c8c8, env: 1.4 }),
    tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.6 }),
    pole: M.wood,
    rock: M.rock,
    wire: new THREE.LineBasicMaterial({ color: 0x2a2c2e, transparent: true, opacity: 0.8 }),
    ice: M.ice,
    cliff: M.rock,
  };
  TEX.snow.repeat.set(1, 1);

  // shared geometries
  W.geo = {};
  W.geo.sleeper = new THREE.BoxGeometry(2.7, 0.12, 0.26);
  {
    // spruces: jagged, drooping branch skirts with snow loads (three variants)
    const spruce = (seed, H, R, layers) => {
      const r = mulberry32(seed), b = new Builder();
      b.cyl(0, 1.0, 0, 0.09, 0.18, 2.4, 'k', 0x3e3026, 0, 0, 0, 7);
      for (let i = 0; i < layers; i++) {
        const u = i / layers, y = 1.3 + u * (H - 1.6), rad = R * Math.pow(1 - u, 0.85) + 0.25, lh = 1.7 * (1 - u * 0.5);
        const cone = new THREE.ConeGeometry(rad, lh, 13, 2);
        const p = cone.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const yy = p.getY(k);
          if (yy < -lh / 2 + 0.01) { const j = 0.7 + r() * 0.55; p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); p.setY(k, yy - r() * 0.35 * j); }
          else if (yy < 0.1) { const j = 0.9 + r() * 0.2; p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); }
        }
        cone.computeVertexNormals();
        const g = 0.11 + r() * 0.05;
        b.add(cone, 'k', new THREE.Color(g * 0.55, g, g * 0.72), mat4(0, y, 0, (r() - 0.5) * 0.08, r() * 6, (r() - 0.5) * 0.08));
        const cap = new THREE.ConeGeometry(rad * 0.82, lh * 0.42, 13, 1);
        const cp = cap.attributes.position;
        for (let k = 0; k < cp.count; k++) if (cp.getY(k) < 0) { const j = 0.55 + r() * 0.5; cp.setX(k, cp.getX(k) * j); cp.setZ(k, cp.getZ(k) * j); }
        cap.computeVertexNormals();
        b.add(cap, 'k', new THREE.Color(0.9, 0.93, 0.96), mat4(0, y + lh * 0.22, 0, 0, r() * 6, 0));
      }
      return b.geometry('k');
    };
    W.geo.tree1 = spruce(11, 8.5, 2.1, 6);
    W.geo.tree2 = spruce(23, 11, 1.7, 8);
    const b3 = new Builder();
    b3.add(new THREE.DodecahedronGeometry(1, 1), 'k', new THREE.Color(1.5, 1.5, 1.52), mat4(0, 0, 0, 0, 0, 0, 1.3, 0.7, 1), 0.4);
    b3.add(new THREE.DodecahedronGeometry(0.95, 1), 'k', new THREE.Color(2.6, 2.65, 2.7), mat4(0, 0.3, 0, 0, 0.5, 0, 1.2, 0.42, 0.95), 0.4);
    W.geo.rock = b3.geometry('k');
    // dead grass / willow scrub poking through the snow
    const b4 = new Builder(), rs = (() => { let q = 7; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
    for (let k = 0; k < 14; k++) {
      const a = rs() * 6.28, tilt = 0.15 + rs() * 0.55, h = 0.35 + rs() * 0.75, tone = 0.55 + rs() * 0.5;
      b4.cyl(Math.cos(a) * 0.08, h / 2 - 0.05, Math.sin(a) * 0.08, 0.016, 0.004, h, 'k', new THREE.Color(0.36 * tone, 0.3 * tone, 0.2 * tone), Math.sin(a) * tilt, 0, -Math.cos(a) * tilt, 4);
    }
    b4.sphere(0, 0, 0, 0.3, 'k', new THREE.Color(1.7, 1.72, 1.78), 1, 0.25, 1, 7);
    W.geo.scrub = b4.geometry('k');
    W.mat.scrub = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  }

  // snow particles
  makeSnow(Q.snow);
  makeMountains();
  makeDrift();
  return { renderer, scene, camera };
}

function makeSnow(count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count);
  const r = mulberry32(77);
  const box = new THREE.Vector3(70, 36, 110);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * box.x; pos[i * 3 + 1] = (r() - 0.5) * box.y; pos[i * 3 + 2] = (r() - 0.5) * box.z;
    rnd[i] = r();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uOffset: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uSize: { value: 0.09 }, uPx: { value: innerHeight }, uAlpha: { value: 0.9 } },
    vertexShader: `
      uniform vec3 uOffset; uniform vec3 uCam; uniform vec3 uBox; uniform float uSize; uniform float uPx;
      attribute float aRnd; varying float vA;
      void main(){
        vec3 p = position + uOffset;
        p.x += sin(aRnd*61.0 + uOffset.y*0.21)*0.7;
        p = mod(p - uCam + uBox*0.5, uBox) - uBox*0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp(uSize * uPx * (0.45 + aRnd) / max(dist, 0.3), 1.0, 26.0);
        vA = (1.0 - smoothstep(uBox.z*0.28, uBox.z*0.5, length(p - uCam))) * smoothstep(0.15, 0.9, dist);
      }`,
    fragmentShader: `
      uniform float uAlpha; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(c)) * vA * uAlpha; if(a<0.01) discard; gl_FragColor = vec4(0.97,0.98,1.0,a); }`,
  });
  W.snow = new THREE.Points(geo, mat);
  W.snow.frustumCulled = false;
  W.snowOffset = new THREE.Vector3();
  W.snowWind = new THREE.Vector3(-2.2, -3.2, 0);
  G.scene.add(W.snow);
}

// distant snowy ridges (rendered as soft silhouettes that fade with the blizzard)
function makeMountains() {
  const r = mulberry32(404);
  const pos = [], col = [], idx = [];
  const N = 220, R0 = 1300;
  for (let ring = 0; ring < 2; ring++) {
    const R = R0 + ring * 280, base = pos.length / 3;
    let hgt = 0;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      hgt = 90 + 120 * Math.abs(Math.sin(a * 3.1 + ring)) + 70 * Math.sin(a * 11.3 + ring * 2) + 30 * Math.sin(a * 37) + r() * 25;
      hgt *= ring ? 1.35 : 1;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, -20, z, x, hgt, z);
      const snow = ring ? 0.82 : 0.74, rock = ring ? 0.62 : 0.5;
      col.push(rock, rock + 0.02, rock + 0.06, snow, snow + 0.02, snow + 0.05);
      if (i < N) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, depthWrite: false, transparent: true,
    uniforms: { fogC: { value: W.fogColor }, vis: { value: 0.3 } },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying float vH; void main(){ vC = color; vH = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 fogC; uniform float vis; varying vec3 vC; varying float vH; void main(){ vec3 c = mix(fogC, vC * fogC * 1.08, vis); gl_FragColor = vec4(c, vis * smoothstep(-20.0, 30.0, vH)); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  W.mtn = new THREE.Mesh(g, m); W.mtn.renderOrder = -9; W.mtn.frustumCulled = false;
  G.scene.add(W.mtn);
}

// low ground blizzard: drifting snow sheets skimming the surface
function makeDrift() {
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    const r = mulberry32(5150);
    for (let i = 0; i < 260; i++) {
      const x = r() * 256, y = r() * 256, w = 6 + r() * 26, l = 40 + r() * 140;
      const gr = g.createLinearGradient(x, y, x, y + l);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.05 + r() * 0.1})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - w / 2, y, w, l);
      if (y + l > 256) { g.fillRect(x - w / 2, y - 256, w, l); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  W.drift = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ map: tex.clone(), transparent: true, depthWrite: false, opacity: 0.55 - i * 0.12, fog: true, color: 0xf4f7fb });
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.repeat.set(3, 2); m.map.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 260).rotateX(-Math.PI / 2), m);
    mesh.position.y = 0.15 + i * 0.45; mesh.renderOrder = 1;
    G.scene.add(mesh); W.drift.push(mesh);
  }
}

// ---------- chunked terrain ----------
function groundGeo(d0, d1, segX = 40) {
  const len = d1 - d0;
  const segZ = Math.max(1, Math.round(len / 10));
  const g = new THREE.PlaneGeometry(800, len, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), lz = p.getZ(i);
    const d = d0 + len / 2 - lz; // plane centered; local z+ toward smaller d
    p.setZ(i, -d);
    p.setY(i, hill(x, d) - (Math.abs(x) < 2.8 ? 0.02 : 0));
    uv.setXY(i, x / 9, d / 9);
  }
  g.computeVertexNormals();
  return g;
}

function buildChunk(k) {
  const L = W.L, d0 = k * L, d1 = d0 + L;
  const grp = new THREE.Group();
  const r = mulberry32(1000 + k * 7919);
  const gA = gorge.active ? gorge.D : 1e12, gB = gorge.active ? gorge.D + gorge.W : -1e12;
  const inG = (d, pad = 0) => d > gA - pad && d < gB + pad;
  // ground pieces (clip around gorge)
  const pieces = [];
  if (d1 <= gA || d0 >= gB) pieces.push([d0, d1]);
  else { if (d0 < gA) pieces.push([d0, gA]); if (d1 > gB) pieces.push([gB, d1]); }
  for (const [a, b] of pieces) {
    const m = new THREE.Mesh(groundGeo(a, b), W.mat.snow);
    m.receiveShadow = true; grp.add(m);
    // track bed
    const shape = new THREE.Shape([new THREE.Vector2(-2.7, 0), new THREE.Vector2(-1.8, 0.3), new THREE.Vector2(1.8, 0.3), new THREE.Vector2(2.7, 0)]);
    const eg = new THREE.ExtrudeGeometry(shape, { depth: b - a, bevelEnabled: false });
    eg.translate(0, 0, -(b - a) / 2); // centered
    const bed = new Builder().add(eg, 'gravel', 0xe0dcd6, mat4(0, 0, -(a + b) / 2)).geometry('gravel');
    const bm = new THREE.Mesh(bed, W.mat.bed); bm.receiveShadow = true; grp.add(bm);
    // rails
    for (const sx of [-0.76, 0.76]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, b - a), W.mat.rail);
      rail.position.set(sx, 0.39, -(a + b) / 2); rail.receiveShadow = true; grp.add(rail);
    }
    // sleepers
    const n = Math.floor((b - a) / 0.65);
    const sl = new THREE.InstancedMesh(W.geo.sleeper, W.mat.sleeper, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.makeTranslation(0, 0.31, -(a + 0.3 + i * 0.65)); sl.setMatrixAt(i, m4); }
    sl.receiveShadow = true; sl.computeBoundingSphere(); grp.add(sl);
  }
  // trees & rocks
  const trees = [[], []], rocks = [];
  const nT = 95;
  for (let i = 0; i < nT; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (15 + Math.pow(r(), 1.6) * 300);
    const d = d0 + r() * L;
    if (inG(d, 4)) continue;
    if (Math.abs(x + 9) < 3) continue; // pole line
    const s = 0.75 + r() * 0.9;
    const m = mat4(x, hill(x, d) - 0.3, -d, (r() - 0.5) * 0.06, r() * 6.28, (r() - 0.5) * 0.06, s, s * (0.9 + r() * 0.35), s);
    trees[r() < 0.55 ? 0 : 1].push(m);
  }
  for (let i = 0; i < 14; i++) {
    const side = r() < 0.5 ? -1 : 1, x = side * (5 + r() * 120), d = d0 + r() * L;
    if (inG(d, 3)) continue;
    const s = 0.4 + r() * 1.6;
    rocks.push(mat4(x, hill(x, d) - s * 0.25, -d, 0, r() * 6, 0, s, s, s));
  }
  const scrub = [];
  for (let i = 0; i < 70; i++) {
    const side = r() < 0.5 ? -1 : 1, x = side * (3.4 + Math.pow(r(), 1.5) * 45), d = d0 + r() * L;
    if (inG(d, 2)) continue;
    const s = 0.6 + r() * 0.9;
    scrub.push(mat4(x, hill(x, d) - 0.05, -d, 0, r() * 6.28, 0, s, s * (0.7 + r() * 0.6), s));
  }
  if (scrub.length) {
    const im = new THREE.InstancedMesh(W.geo.scrub, W.mat.scrub, scrub.length);
    scrub.forEach((m, i) => im.setMatrixAt(i, m)); im.computeBoundingSphere(); im.castShadow = false; grp.add(im);
  }
  const tg = [W.geo.tree1, W.geo.tree2];
  trees.forEach((list, vi) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(tg[vi], W.mat.tree, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = false; im.receiveShadow = false; im.computeBoundingSphere(); grp.add(im);
  });
  if (rocks.length) {
    const im = new THREE.InstancedMesh(W.geo.rock, W.mat.rock, rocks.length);
    rocks.forEach((m, i) => im.setMatrixAt(i, m)); im.computeBoundingSphere(); grp.add(im);
  }
  // telegraph poles + wires
  const pb = new Builder();
  const wires = [];
  const poleD = [];
  for (let d = Math.ceil(d0 / 45) * 45; d < d1; d += 45) if (!inG(d, 2)) poleD.push(d);
  for (const d of poleD) {
    const x = -9, lean = Math.sin(d * 0.7) * 0.04;
    pb.cyl(x, 4.2, -d, 0.12, 0.16, 8.4, 'p', 0x5d4c3b, 0, 0, lean, 7);
    pb.boxC(x, 7.9, -d, 1.8, 0.14, 0.14, 'p', 0x544434);
    for (const ox of [-0.75, -0.25, 0.25, 0.75]) pb.cyl(x + ox, 8.07, -d, 0.04, 0.05, 0.16, 'p', 0x9aa3a8, 0, 0, 0, 5);
    pb.boxC(x, 7.98, -d, 1.8, 0.04, 0.16, 'p', 0xf0f4f8);
  }
  for (let i = 0; i < poleD.length; i++) {
    const da = poleD[i], db = da + 45;
    if (inG(db, 2)) continue;
    for (const ox of [-0.75, -0.25, 0.25, 0.75]) {
      let prev = null;
      for (let s = 0; s <= 6; s++) {
        const u = s / 6, d = da + (db - da) * u, y = 8.12 - Math.sin(u * Math.PI) * 0.6;
        const p = [-9 + ox, y, -d];
        if (prev) wires.push(...prev, ...p);
        prev = p;
      }
    }
  }
  const pm = pb.build({ p: W.mat.pole }, grp, { cast: false });
  if (wires.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    grp.add(new THREE.LineSegments(wg, W.mat.wire));
  }
  // km posts & signal boxes occasionally
  if (k % 3 === 0 && !inG(d0 + 30, 5)) {
    const sb = new Builder();
    const d = d0 + 30;
    sb.boxC(4.2, 0.9, -d, 0.14, 1.8, 0.14, 's', 0x333333);
    sb.boxC(4.2, 1.95, -d, 0.5, 0.36, 0.06, 's', 0xe8e8e8);
    sb.boxC(4.2, 1.95, -d + 0.04, 0.4, 0.06, 0.02, 's', 0x222222);
    sb.build({ s: W.mat.pole }, grp, { cast: false });
  }
  grp.userData.k = k;
  return grp;
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry && !Object.values(W.geo).includes(o.geometry)) o.geometry.dispose(); });
}

export function rebuildChunks() {
  for (const [, c] of W.chunks) { W.root.remove(c); disposeGroup(c); }
  W.chunks.clear();
  updateChunks(true);
}

export function updateChunks(force = false) {
  const L = W.L;
  const k0 = Math.floor((G.s - 320) / L), k1 = Math.floor((G.s + 600) / L);
  for (const [k, c] of W.chunks) if (k < k0 || k > k1) { W.root.remove(c); disposeGroup(c); W.chunks.delete(k); }
  let built = 0;
  for (let k = k0; k <= k1; k++) {
    if (W.chunks.has(k)) continue;
    if (!force && built >= 1) break; // spread work across frames
    const c = buildChunk(k);
    W.root.add(c); W.chunks.set(k, c); built++;
  }
}

// ---------- gorge & bridge ----------
export function buildGorge() {
  if (W.gorgeGroup) { W.root.remove(W.gorgeGroup); disposeGroup(W.gorgeGroup); }
  const D = gorge.D, Wd = gorge.W, iy = gorge.iceY;
  const grp = new THREE.Group();
  grp.position.z = -D;
  W.gorgeGroup = grp;
  // cliffs
  const cliff = (near) => {
    const g = new THREE.PlaneGeometry(800, 1, 80, 14);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), v = 0.5 - p.getY(i); // 0 top .. 1 bottom
      const dEdge = near ? D : D + Wd;
      const top = hill(x, dEdge);
      const y = top + (iy - 1 - top) * v;
      const n = Math.sin(x * 0.31) * 1.2 + Math.sin(x * 0.07 + v * 9) * 2.2 + Math.sin(v * 23 + x * 0.5) * 0.6;
      const inward = v * 7 + n * (v > 0.03 ? 1 : 0.2);
      const z = near ? -(inward) : -(Wd - inward);
      p.setXYZ(i, x, y, z);
      const snow = (Math.sin(v * 31 + x * 0.2) > 0.55 || v < 0.04) ? 1 : 0;
      const c = snow ? [2.55, 2.6, 2.68] : [1.3 + n * 0.05, 1.3, 1.32];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 7, p.getY(i) / 7);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, W.mat.cliff); m.receiveShadow = true;
    return m;
  };
  grp.add(cliff(true), cliff(false));
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(800, Wd + 20).rotateX(-Math.PI / 2), W.mat.ice);
  ice.position.set(0, iy, -Wd / 2);
  ice.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? (Wd + 20) / 9 : 800 / 9); });
  ice.receiveShadow = true;
  grp.add(ice);
  W.ice = ice;

  // bridge spans
  const spanGeo = (z0, z1) => {
    const b = new Builder();
    const steel = 0x4c5552, len = z1 - z0, zc = (z0 + z1) / 2; const SK = 'pBridge';
    for (const sx of [-2.45, 2.45]) {
      b.boxC(sx, 0.05, -zc, 0.32, 0.5, len, SK, steel);
      b.boxC(sx, 6.1, -zc, 0.32, 0.4, len - 4, SK, steel);
      b.boxC(sx, 6.33, -zc, 0.34, 0.06, len - 4, 'snow', 0xeef2f5);
      const nV = Math.round(len / 5);
      for (let i = 0; i <= nV; i++) {
        const z = z0 + (len * i) / nV;
        if (i > 0 && i < nV) b.boxC(sx, 3.1, -z, 0.2, 6.0, 0.24, SK, steel);
        if (i < nV) {
          const za = z, zb = z0 + (len * (i + 1)) / nV, dir = i < nV / 2 ? 1 : -1;
          const ang = Math.atan2(6, zb - za) * dir;
          b.boxC(sx, 3.1, -(za + zb) / 2, 0.18, 0.22, Math.hypot(6, zb - za), SK, steel, ang, 0, 0);
        }
      }
      // end posts slanted
      b.boxC(sx, 3.1, -(z0 + 1.0), 0.28, 6.5, 0.3, SK, steel, -0.32, 0, 0);
      b.boxC(sx, 3.1, -(z1 - 1.0), 0.28, 6.5, 0.3, SK, steel, 0.32, 0, 0);
    }
    for (let z = z0 + 2.5; z < z1 - 2; z += 5) {
      b.boxC(0, 6.15, -z, 4.9, 0.22, 0.22, SK, steel);
      b.boxC(0, -0.15, -z, 4.9, 0.3, 0.3, SK, steel);
    }
    b.boxC(0, 0.22, -zc, 4.8, 0.08, len, 'dark', 0x3a3f3d); // deck plate
    for (let z = z0 + 0.3; z < z1; z += 0.65) b.boxC(0, 0.31, -z, 2.7, 0.1, 0.24, 'wood', 0x3b322b);
    for (const rx of [-0.76, 0.76]) b.boxC(rx, 0.39, -zc, 0.075, 0.1, len, 'dark', 0x8a8d90);
    return b;
  };
  const s1 = spanGeo(0, 30), s3 = spanGeo(60, 90);
  s1.build(M, grp); s3.build(M, grp);
  const mid = new THREE.Group();
  mid.position.set(0, 0, -45);
  const s2 = spanGeo(30, 60);
  const midMeshes = s2.build(M, null);
  for (const m of midMeshes) { m.position.z = 45; mid.add(m); }
  grp.add(mid);
  W.midSpan = mid; W.midSpan.userData = { falling: false, vy: 0, av: 0, done: false };
  // piers & abutments
  const pb = new Builder();
  for (const z of [30, 60]) {
    pb.boxC(0, (iy - 0.4) / 2, -z, 6.4, Math.abs(iy) + 0.2, 3.0, 'concrete', 0x9a9894);
    pb.boxC(0, iy + 2, -z, 7.4, 4, 4.0, 'concrete', 0x8a8884);
    pb.boxC(0, -0.45, -z, 6.8, 0.5, 3.4, 'snow', 0xe8ecef);
  }
  for (const z of [0, 90]) pb.boxC(0, -3, -z, 8, 6, 4, 'concrete', 0x969490);
  pb.build(M, grp);
  W.root.add(grp);
}

export function updateWorld(dt) {
  W.root.visible = !G.groundFn;
  if (!G.groundFn) { W.root.position.z = G.s; updateChunks(); }
  // fog
  W.fogDensity = damp(W.fogDensity, W.fogTarget, 0.5, dt);
  G.scene.fog.density = W.fogDensity;
  // snow
  const cam = G.camera;
  W.snowOffset.x += W.snowWind.x * dt;
  W.snowOffset.y += W.snowWind.y * dt;
  W.snowOffset.z += (G.v + W.snowWind.z) * dt;
  W.snowOffset.x %= 70; W.snowOffset.y %= 36; W.snowOffset.z %= 110;
  const u = W.snow.material.uniforms;
  u.uOffset.value.copy(W.snowOffset);
  u.uCam.value.copy(cam.position);
  W.sky.position.copy(cam.position);
  W.sky.material.uniforms.uT.value += dt;
  const fogK = clamp((W.fogDensity - 0.003) / 0.009, 0, 1);
  W.sky.material.uniforms.uFog.value = 0.55 + fogK * 0.45;
  if (W.mtn) { W.mtn.position.set(cam.position.x, 0, cam.position.z); W.mtn.material.uniforms.vis.value = 0.75 - fogK * 0.55; }
  if (W.drift) for (let i = 0; i < W.drift.length; i++) {
    const d = W.drift[i]; d.position.x = cam.position.x; d.position.z = cam.position.z;
    const mp = d.material.map; mp.offset.x -= dt * (0.05 + i * 0.03); mp.offset.y -= dt * ((G.v + 4) / 130) * (1 + i * 0.15);
    d.material.opacity = (0.5 - i * 0.12) * (0.4 + fogK * 0.6);
  }
  // shadow follows camera
  const tgt = W.sun.target.position;
  tgt.set(Math.round(cam.position.x), Math.round(cam.position.y) - 1, Math.round(cam.position.z));
  W.sun.position.copy(tgt).addScaledVector(W.sunDir, 70);
  // falling mid span
  const ms = W.midSpan;
  if (ms && ms.userData.falling && !ms.userData.done) {
    const ud = ms.userData;
    ud.vy -= 19 * dt;
    ms.position.y += ud.vy * dt;
    ms.rotation.x += ud.av * dt;
    ms.rotation.z += ud.az * dt;
    if (ms.position.y < gorge.iceY + 3) {
      ms.position.y = gorge.iceY + 3; ud.done = true;
      if (G.onSpanLanded) G.onSpanLanded();
    }
  }
}

// bake the actual surroundings into the environment map (sky + snowfield + trees)
export function bakeEnv(renderer) {
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(0.5, 1500, rt); cc.position.set(6, 5, 10);
  const hide = [W.snow];
  for (const o of hide) o.visible = false;
  const pm = new THREE.PMREMGenerator(renderer);
  cc.update(renderer, G.scene);
  const old = G.scene.environment;
  G.scene.environment = pm.fromCubemap(rt.texture).texture;
  if (old && old !== W.env) old.dispose();
  W.env = G.scene.environment;
  for (const o of hide) o.visible = true;
  pm.dispose(); rt.dispose();
  return W.env;
}

export function onResize() {
  const r = G.renderer; if (!r) return;
  r.setSize(innerWidth, innerHeight, false);
  G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
  if (W.snow) W.snow.material.uniforms.uPx.value = innerHeight;
}
