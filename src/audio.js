import { G, clamp, THREE } from './core.js';

// All sound is synthesized at boot. Real voice-over files can be dropped into A.vo later (by line id).
export const A = { ctx: null, on: false, b: {}, voices: 0, voBuf: {}, loops: new Set() };

const TAU = Math.PI * 2;
let SR = 44100;
const rnd = () => Math.random() * 2 - 1;

function mk(sec, fn, ch = 1, peak = 0.9) {
  const n = Math.max(1, Math.floor(sec * SR));
  const b = A.ctx.createBuffer(ch, n, SR);
  let mx = 0;
  for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); fn(d, n, c); for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(d[i])); }
  if (mx > 0 && peak) for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); const k = peak / mx; for (let i = 0; i < n; i++) d[i] *= k; }
  // tiny fades
  for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); const f = Math.min(64, n >> 2); for (let i = 0; i < f; i++) { d[n - 1 - i] *= i / f; } }
  return b;
}
const lpA = (fc) => 1 - Math.exp((-TAU * fc) / SR);

function gunshot(d, n, o) {
  let lp = 0, lp2 = 0, lpT = 0, ph = 0, hp = 0, prev = 0;
  const aB = lpA(o.body), aT = lpA(o.tail), a2 = lpA(o.body * 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = rnd();
    lp += aB * (x - lp); lp2 += a2 * (lp - lp2); lpT += aT * (x - lpT);
    hp = x - prev; prev = x;
    const f = o.f0 * Math.exp(-t / 0.03) + o.f1; ph += (TAU * f) / SR;
    let s = 0;
    if (t < 0.004) s += hp * o.crack * (1 - t / 0.004);
    s += lp * Math.exp(-t / o.bd) * 1.4 + lp2 * Math.exp(-t / (o.bd * 1.6)) * 0.8;
    s += Math.sin(ph) * Math.exp(-t / o.td) * o.thump;
    if (t > o.pre) s += lpT * Math.exp(-(t - o.pre) / o.tl) * o.tailA * Math.min(1, (t - o.pre) / 0.02);
    d[i] = s;
  }
}

function tone(d, n, parts, noiseA = 0, noiseD = 0.01) {
  for (let i = 0; i < n; i++) {
    const t = i / SR; let s = 0;
    for (const [f, a, dec] of parts) s += Math.sin(TAU * f * t) * a * Math.exp(-t / dec);
    if (noiseA) s += rnd() * noiseA * Math.exp(-t / noiseD);
    d[i] = s;
  }
}

function noiseShape(d, n, fc, env, hpOn = false) {
  let lp = 0, prev = 0; const a = lpA(fc);
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = rnd(); lp += a * (x - lp);
    let s = lp; if (hpOn) { s = lp - prev; prev = lp; }
    d[i] = s * env(t);
  }
}

function buildBuffers() {
  const B = A.b;
  B.ak = mk(0.9, (d, n) => gunshot(d, n, { body: 3600, tail: 700, f0: 110, f1: 48, bd: 0.04, td: 0.07, thump: 1.3, crack: 1.2, pre: 0.018, tl: 0.32, tailA: 0.35 }));
  B.ak_far = mk(1.0, (d, n) => gunshot(d, n, { body: 1500, tail: 500, f0: 70, f1: 40, bd: 0.05, td: 0.06, thump: 0.6, crack: 0.25, pre: 0.03, tl: 0.42, tailA: 0.55 }));
  B.m4 = mk(0.9, (d, n) => gunshot(d, n, { body: 2600, tail: 600, f0: 90, f1: 45, bd: 0.04, td: 0.06, thump: 0.8, crack: 0.5, pre: 0.025, tl: 0.38, tailA: 0.45 }));
  B.pistol = mk(0.75, (d, n) => gunshot(d, n, { body: 4200, tail: 800, f0: 150, f1: 62, bd: 0.03, td: 0.05, thump: 0.9, crack: 1.4, pre: 0.012, tl: 0.26, tailA: 0.3 }));
  B.pin = mk(0.25, (d, n) => { tone(d, n, [[2600, 0.5, 0.015], [4100, 0.3, 0.01]], 0.4, 0.004); const o = Math.floor(0.09 * SR); for (let i = o; i < n; i++) { const t = i / SR - 0.09; d[i] += Math.sin(TAU * 1900 * t) * 0.4 * Math.exp(-t / 0.02); } });
  B.clink = mk(0.3, (d, n) => tone(d, n, [[1250, 0.5, 0.05], [2300, 0.35, 0.035], [3700, 0.2, 0.02]], 0.5, 0.004));
  B.dshk = mk(1.3, (d, n) => gunshot(d, n, { body: 2400, tail: 380, f0: 80, f1: 34, bd: 0.07, td: 0.11, thump: 2.2, crack: 1.0, pre: 0.02, tl: 0.5, tailA: 0.45 }));
  B.dshk_far = mk(1.3, (d, n) => gunshot(d, n, { body: 1100, tail: 300, f0: 60, f1: 30, bd: 0.08, td: 0.1, thump: 1.4, crack: 0.2, pre: 0.03, tl: 0.6, tailA: 0.6 }));
  B.shell = mk(0.35, (d, n) => { tone(d, n, [[3400, 0.5, 0.05], [5100, 0.35, 0.03], [6900, 0.2, 0.02]]); for (let i = Math.floor(0.13 * SR); i < n; i++) { const t = i / SR - 0.13; d[i] += Math.sin(TAU * 3300 * t) * 0.25 * Math.exp(-t / 0.03); } });
  B.metal = [0, 1, 2].map((k) => mk(0.3, (d, n) => tone(d, n, [[1700 + k * 650, 0.6, 0.04], [2900 + k * 400, 0.35, 0.03], [4600, 0.2, 0.02]], 0.9, 0.006)));
  B.ricochet = mk(0.45, (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR, f = 2900 * Math.exp(-t * 2.4) + 700; ph += (TAU * f) / SR; d[i] = Math.sin(ph) * Math.exp(-t / 0.18) * Math.min(1, t / 0.01) + rnd() * 0.2 * Math.exp(-t / 0.01); } });
  B.soft = mk(0.15, (d, n) => noiseShape(d, n, 1400, (t) => Math.exp(-t / 0.03)));
  B.flesh = mk(0.18, (d, n) => { noiseShape(d, n, 500, (t) => Math.exp(-t / 0.035)); for (let i = 0; i < n; i++) d[i] += Math.sin(TAU * 120 * i / SR) * Math.exp(-i / SR / 0.04) * 0.5; });
  B.whiz = mk(0.22, (d, n) => { let lp = 0, bp = 0; for (let i = 0; i < n; i++) { const t = i / SR, f = 2600 - t * 7000; const a = lpA(Math.max(300, f)); const x = rnd(); lp += a * (x - lp); bp += a * (lp - bp); d[i] = (lp - bp) * Math.sin(Math.PI * t / 0.22) ** 2; } });
  B.crack = mk(0.08, (d, n) => { let prev = 0; for (let i = 0; i < n; i++) { const x = rnd(), t = i / SR; d[i] = (x - prev) * Math.exp(-t / 0.006); prev = x; } });
  B.explosion = mk(3.2, (d, n) => {
    let lp = 0, lp2 = 0, ph = 0; const a1 = lpA(900), a2 = lpA(160);
    for (let i = 0; i < n; i++) {
      const t = i / SR, x = rnd(); lp += a1 * (x - lp); lp2 += a2 * (x - lp2);
      ph += (TAU * (38 * Math.exp(-t / 0.4) + 22)) / SR;
      let s = Math.sin(ph) * Math.exp(-t / 0.45) * 1.6 + lp * Math.exp(-t / 0.35) * 1.4 + lp2 * Math.exp(-t / 1.4) * 2.2;
      if (t < 0.006) s += x * 1.5;
      if (Math.random() < 0.002 * Math.exp(-t / 0.6)) s += rnd() * 1.2;
      d[i] = s;
    }
  }, 2);
  B.rocket = mk(1.6, (d, n) => { let lp = 0, bp = 0; for (let i = 0; i < n; i++) { const t = i / SR, a = lpA(500 + t * 1400); const x = rnd(); lp += a * (x - lp); bp += a * 0.5 * (lp - bp); d[i] = (lp - bp * 0.7) * Math.min(1, t / 0.05) * Math.exp(-t / 0.9); } });
  B.heli = mk(2.0, (d, n, c) => { // 39 blade passes in 2s -> seamless
    let lp = 0, lp2 = 0; const a = lpA(260), a2 = lpA(1200);
    for (let i = 0; i < n; i++) {
      const t = i / SR, ph = (t * 19.5) % 1, x = rnd(); lp += a * (x - lp); lp2 += a2 * (x - lp2);
      const slap = Math.exp(-ph / 0.09);
      d[i] = lp * (0.6 + 1.6 * slap) + lp2 * slap * 0.35 + Math.sin(TAU * 1600 * t + c) * 0.025 + Math.sin(TAU * 39 * t) * 0.25 * slap;
    }
  }, 2, 0.8);
  B.train = mk(4.0, (d, n, c) => { let b = 0, lp = 0; const a = lpA(140); for (let i = 0; i < n; i++) { const t = i / SR; b = (b + 0.02 * rnd()) / 1.02; lp += a * (rnd() - lp); d[i] = b * 3 + lp * 1.2 + Math.sin(TAU * 31 * t + c) * 0.08 + Math.sin(TAU * 2350 * t) * 0.01 * (1 + Math.sin(TAU * 0.5 * t)); } }, 2, 0.7);
  B.clack = mk(0.3, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const e1 = Math.exp(-t / 0.02), e2 = t > 0.11 ? Math.exp(-(t - 0.11) / 0.02) : 0; d[i] = (rnd() * 0.5 + Math.sin(TAU * 85 * t) * 0.8) * (e1 + e2 * 0.8) + Math.sin(TAU * 1900 * t) * 0.06 * (e1 + e2); } });
  B.wind = mk(6.0, (d, n, c) => { let lp = 0, bp = 0; for (let i = 0; i < n; i++) { const t = i / SR, f = 500 + 300 * Math.sin(TAU * t / 6 * (1 + c)) + 200 * Math.sin(TAU * t / 2); const a = lpA(f); lp += a * (rnd() - lp); bp += a * (lp - bp); d[i] = (lp - bp * 0.6) * (0.7 + 0.3 * Math.sin(TAU * t / 3 + c)); } }, 2, 0.8);
  B.sled = mk(1.0, (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (TAU * 70) / SR; const saw = ((ph / TAU) % 1) * 2 - 1; d[i] = saw * 0.5 * (0.6 + 0.4 * Math.sin(TAU * 35 * t)) + Math.sin(ph * 2) * 0.3 + rnd() * 0.12; } }, 1, 0.7);
  B.step_metal = mk(0.14, (d, n) => { tone(d, n, [[190, 0.8, 0.03], [620, 0.25, 0.015]], 0.6, 0.01); });
  B.step_snow = mk(0.2, (d, n) => noiseShape(d, n, 2600, (t) => (Math.random() < 0.5 ? 1 : 0.3) * Math.exp(-t / 0.05) * Math.min(1, t / 0.01)));
  B.step_ore = mk(0.18, (d, n) => noiseShape(d, n, 1800, (t) => (Math.random() < 0.3 ? 1 : 0.2) * Math.exp(-t / 0.05)));
  B.magout = mk(0.3, (d, n) => { tone(d, n, [[1300, 0.4, 0.02]], 0.7, 0.008); for (let i = Math.floor(0.05 * SR); i < n; i++) d[i] += rnd() * 0.15 * Math.exp(-(i / SR - 0.05) / 0.06); });
  B.magin = mk(0.25, (d, n) => tone(d, n, [[900, 0.7, 0.03], [2100, 0.4, 0.02]], 1, 0.006));
  B.bolt = mk(0.4, (d, n) => { tone(d, n, [[700, 0.6, 0.02], [1900, 0.3, 0.015]], 1, 0.005); const o = Math.floor(0.16 * SR); for (let i = o; i < n; i++) { const t = i / SR - 0.16; d[i] += (Math.sin(TAU * 1100 * t) * 0.6 * Math.exp(-t / 0.025) + rnd() * Math.exp(-t / 0.005)); } });
  B.dry = mk(0.1, (d, n) => tone(d, n, [[2400, 0.5, 0.01]], 0.6, 0.003));
  B.hit = mk(0.06, (d, n) => tone(d, n, [[2600, 0.8, 0.012], [5200, 0.3, 0.008]]));
  B.kill = mk(0.12, (d, n) => tone(d, n, [[1700, 0.8, 0.02], [3400, 0.4, 0.015]], 0.3, 0.01));
  B.radio = mk(0.12, (d, n) => { let lp = 0, prev = 0; const a = lpA(3200); for (let i = 0; i < n; i++) { const t = i / SR, x = rnd(); lp += a * (x - lp); const hp = lp - prev; prev = lp; d[i] = hp * Math.min(1, t / 0.004) * Math.exp(-t / 0.035); } }, 1, 0.5);
  B.horn = mk(2.4, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (const [f, a] of [[174.6, 1], [207.7, 0.8], [349.2, 0.18]]) { const ph = (t * f) % 1; s += a * (ph < 0.35 ? 1 : -0.55) + a * 0.4 * Math.sin(TAU * f * 1.004 * t); } d[i] = s * Math.min(1, t / 0.12) * (t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 0.5) : 1); } let lp = 0, lp2 = 0; const a = lpA(900), a2 = lpA(1400); for (let i = 0; i < n; i++) { lp += a * (d[i] - lp); lp2 += a2 * (lp - lp2); d[i] = lp2; } });
  B.icecrack = mk(2.2, (d, n) => { let lp = 0; const a = lpA(300); for (let i = 0; i < n; i++) { const t = i / SR, x = rnd(); lp += a * (x - lp); let s = lp * Math.exp(-t / 0.8) * 2; if (Math.random() < 0.004 * Math.exp(-t / 0.4)) s += rnd() * 1.6; if (t < 0.01) s += x; d[i] = s; } }, 2);
  B.crash = mk(2.4, (d, n, c) => { let lp = 0; const a = lpA(700); for (let i = 0; i < n; i++) { const t = i / SR, x = rnd(); lp += a * (x - lp); let s = lp * Math.exp(-t / 0.5) * 2 + x * Math.exp(-t / 0.05) * 0.6; for (const f of [310, 523, 870, 1340]) s += Math.sin(TAU * f * t + c) * 0.15 * Math.exp(-t / (0.6 + f / 3000)); d[i] = s; } }, 2);
  B.heart = mk(0.6, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const e = Math.exp(-t / 0.05) + (t > 0.25 ? Math.exp(-(t - 0.25) / 0.05) * 0.7 : 0); d[i] = Math.sin(TAU * 55 * t) * e; } });
  B.slowmo = mk(2.4, (d, n) => { let ph = 0, lp = 0; const a = lpA(400); for (let i = 0; i < n; i++) { const t = i / SR; ph += (TAU * (160 * Math.exp(-t * 1.4) + 30)) / SR; lp += a * (rnd() - lp); d[i] = (Math.sin(ph) * 0.8 + lp * 1.5) * Math.min(1, t / 0.05) * Math.exp(-t / 1.1); } });
  B.lock = mk(0.5, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = ((t % 0.125) < 0.06 ? Math.sin(TAU * 1500 * t) : 0) * 0.5; } });
  B.ring = mk(2.4, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(TAU * 2900 * t) * Math.exp(-t / 0.8) * Math.min(1, t / 0.25); } }, 1, 0.25);
  B.thud = mk(0.25, (d, n) => { noiseShape(d, n, 300, (t) => Math.exp(-t / 0.05)); for (let i = 0; i < n; i++) d[i] += Math.sin(TAU * 70 * i / SR) * Math.exp(-i / SR / 0.07); });
  B.rustle = mk(0.35, (d, n) => noiseShape(d, n, 3000, (t) => Math.sin(Math.PI * t / 0.35) * 0.6));
  B.ui = mk(0.05, (d, n) => tone(d, n, [[1800, 0.5, 0.01]]));
  B.screech = mk(3.0, (d, n, c) => { // steel-on-steel grinding: resonant noise bands + low rumble, no pure tone
    const bands = [[1300, 0.006], [2050, 0.005], [3100, 0.004], [4600, 0.003]].map(([f, bw]) => ({ f, a: 0, b: 0, w: TAU * f / SR, r: 1 - bw * 8 }));
    let lp = 0; const al = lpA(160);
    for (let i = 0; i < n; i++) {
      const t = i / SR, x = rnd(); let s = 0;
      for (const B of bands) { const y = x * (1 - B.r) + 2 * B.r * Math.cos(B.w * (1 + 0.01 * Math.sin(TAU * 0.7 * t + c))) * B.a - B.r * B.r * B.b; B.b = B.a; B.a = y; s += y; }
      lp += al * (rnd() - lp);
      d[i] = s * (0.6 + 0.4 * Math.abs(Math.sin(TAU * 2.3 * t + c))) + lp * 2.2;
    }
  }, 2, 0.55);
  B.lp_noise = mk(1.0, (d, n) => noiseShape(d, n, 3000, () => 1));
}

function gain(v, dest) { const g = A.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }

export function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try { A.ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
  const ctx = A.ctx; SR = ctx.sampleRate;
  A.comp = ctx.createDynamicsCompressor();
  A.comp.threshold.value = -14; A.comp.ratio.value = 5; A.comp.attack.value = 0.002; A.comp.release.value = 0.18;
  A.master = gain(0.9); A.master.connect(A.comp); A.comp.connect(ctx.destination);
  A.lp = ctx.createBiquadFilter(); A.lp.type = 'lowpass'; A.lp.frequency.value = 20000; A.lp.Q.value = 0.5;
  A.lp.connect(A.master);
  A.sfx = gain(1, A.lp);
  A.music = gain(0.42, A.lp);
  A.musicCue = gain(1.25, A.music);
  A.voComp = ctx.createDynamicsCompressor();
  A.voComp.threshold.value = -22; A.voComp.knee.value = 6; A.voComp.ratio.value = 4; A.voComp.attack.value = 0.003; A.voComp.release.value = 0.15;
  A.voBus = gain(1, A.voComp); A.voOut = gain(2.3, A.master); A.voComp.connect(A.voOut);
  // reverb
  A.rev = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.floor(SR * 2.2), SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; const a = lpA(2500); for (let i = 0; i < d.length; i++) { const t = i / SR; lp += a * (rnd() - lp); d[i] = lp * Math.exp(-t / 0.55) * (t < 0.01 ? t / 0.01 : 1); } }
  A.rev.buffer = ir;
  A.revOut = gain(0.28, A.lp); A.rev.connect(A.revOut);
  A.revSend = gain(1, A.rev);
  buildBuffers();
  initMusic();
  A.on = true;
  return true;
}

export function resumeAudio() { if (A.ctx && A.ctx.state !== 'running') A.ctx.resume().catch(() => {}); }
export function suspendAudio() { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend().catch(() => {}); }

function panner(pos, ref = 5, roll = 1) {
  const p = A.ctx.createPanner();
  p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 2000;
  setP(p, pos);
  return p;
}
function setP(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); }

export function play(name, o = {}) {
  if (!A.on) return null;
  let buf = A.b[name]; if (!buf) return null;
  if (Array.isArray(buf)) buf = buf[(Math.random() * buf.length) | 0];
  if (A.voices > 64 && !o.prio) return null;
  const ctx = A.ctx, src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.rate || 1) * (1 + (o.vary ?? 0.04) * (Math.random() * 2 - 1)) * (o.noSlow ? 1 : Math.max(0.35, G.timeScale ** 0.5));
  let node = src;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  const g = gain(o.vol ?? 1); node.connect(g); node = g;
  if (o.pos) { const p = panner(o.pos, o.ref || 5, o.roll ?? 1); node.connect(p); node = p; }
  node.connect(o.bus || A.sfx);
  if (o.rev !== 0) { const s = gain(o.rev ?? 0.3, A.revSend); node.connect(s); }
  A.voices++;
  src.onended = () => { A.voices--; };
  src.start(ctx.currentTime + (o.delay || 0));
  return src;
}

export function loop(name, o = {}) {
  if (!A.on) return { setPos() {}, setVol() {}, setRate() {}, stop() {} };
  const ctx = A.ctx, src = ctx.createBufferSource();
  src.buffer = A.b[name]; src.loop = true;
  src.playbackRate.value = o.rate || 1;
  const g = gain(0); let node = src; node.connect(g); node = g;
  let p = null;
  if (o.pos) { p = panner(o.pos, o.ref || 8, o.roll ?? 1); node.connect(p); node = p; }
  node.connect(o.bus || A.sfx);
  if (o.rev) node.connect(gain(o.rev, A.revSend));
  src.start(ctx.currentTime, Math.random() * src.buffer.duration * 0.9);
  g.gain.setTargetAtTime(o.vol ?? 1, ctx.currentTime, 0.1);
  const h = {
    setPos(v) { if (p) setP(p, v); },
    setVol(v) { g.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.06); },
    setRate(r) { src.playbackRate.setTargetAtTime(Math.max(0.05, r), ctx.currentTime, 0.05); },
    stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); src.stop(ctx.currentTime + 0.5); } catch {} A.loops.delete(h); },
  };
  A.loops.add(h);
  return h;
}
export function stopAllLoops() { for (const h of [...A.loops]) h.stop(); }

export function updateListener(cam) {
  if (!A.on) return;
  const L = A.ctx.listener, p = cam.position;
  const f = cam.getWorldDirection(_fw), t = A.ctx.currentTime;
  if (L.positionX) {
    L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
    L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
    L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
  } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
}
const _fw = new THREE.Vector3();

// muffle (slow-mo / near explosion)
export function muffle(freq, tc = 0.15) { if (A.on) A.lp.frequency.setTargetAtTime(freq, A.ctx.currentTime, tc); }

// ---------- voice over ----------
function duck(dur) {
  const t = A.ctx.currentTime;
  A.sfx.gain.cancelScheduledValues(t); A.music.gain.cancelScheduledValues(t);
  A.sfx.gain.setTargetAtTime(0.62, t, 0.05); A.music.gain.setTargetAtTime(0.42 * 0.62, t, 0.08);
  A.sfx.gain.setTargetAtTime(1, t + dur, 0.3); A.music.gain.setTargetAtTime(0.42, t + dur, 0.5);
}
export function playVO(id, radio) {
  if (!A.on) return 0;
  const buf = A.voBuf[id];
  if (!buf) { play('radio', { vol: 0.25, bus: A.voBus, rev: 0, noSlow: true }); return 0; }
  const ctx = A.ctx, src = ctx.createBufferSource(); src.buffer = buf;
  let node = src;
  if (radio) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 5; pk.Q.value = 1;
    const ws = ctx.createWaveShaper(); const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); } ws.curve = cv;
    node.connect(hp); hp.connect(pk); pk.connect(ws); ws.connect(lp); node = lp;
    play('radio', { vol: 0.22, bus: A.voBus, rev: 0, noSlow: true });
  }
  const d = radio ? 0.14 : 0;
  node.connect(A.voBus);
  if (!radio) node.connect(gain(0.12, A.revSend));
  src.start(ctx.currentTime + d);
  duck(buf.duration + d);
  return buf.duration + d;
}
export function playBark(id, pos) {
  if (!A.on) return;
  const v = ['a', 'b', 'c'].map((s) => `${id}_${s}`).filter((k) => A.voBuf[k]);
  if (!v.length) return;
  const src = A.ctx.createBufferSource(); src.buffer = A.voBuf[v[(Math.random() * v.length) | 0]];
  src.playbackRate.value = 0.97 + Math.random() * 0.06;
  const g = gain(1.6); const p = panner(pos, 7, 1);
  src.connect(g); g.connect(p); p.connect(A.sfx); g.connect(gain(0.25, A.revSend));
  src.start();
}
export async function loadAllVO(map) {
  if (!A.on || !map) return 0;
  let n = 0;
  await Promise.all(Object.entries(map).map(async ([id, b64]) => {
    try {
      const bin = atob(b64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      A.voBuf[id] = await A.ctx.decodeAudioData(u.buffer); n++;
    } catch (e) { console.warn('VO decode failed', id); }
  }));
  return n;
}
export async function loadVO(id, arrayBuffer) {
  if (!A.on) return;
  try { A.voBuf[id] = await A.ctx.decodeAudioData(arrayBuffer); } catch (e) { console.warn('VO decode failed', id); }
}

// ---------- procedural music ----------
const M = { mode: 'off', step: 0, next: 0, layers: {}, target: {}, bpm: 145 };
const CH = [ // chord per bar: root freq + triad (semitones)
  [73.42, [0, 3, 7]], [73.42, [0, 3, 7]], [58.27, [0, 4, 7]], [65.41, [0, 4, 7]],
  [73.42, [0, 3, 7]], [73.42, [0, 3, 7]], [87.31, [0, 4, 7]], [65.41, [0, 4, 7]],
];
const OST = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 3, 5, 7, 12];
const st = (f, s) => f * Math.pow(2, s / 12);
const MODES = {
  off: { pad: 0, ost: 0, drum: 0, brass: 0, choir: 0 },
  intro: { pad: 0.8, ost: 0.25, drum: 0.35, brass: 0, choir: 0 },
  fight: { pad: 0.55, ost: 0.85, drum: 0.85, brass: 0.25, choir: 0 },
  turret: { pad: 0.55, ost: 1, drum: 1, brass: 0.85, choir: 0.2 },
  bridge: { pad: 0.7, ost: 1, drum: 1, brass: 1, choir: 0.9 },
  silence: { pad: 0, ost: 0, drum: 0, brass: 0, choir: 0 },
  end: { pad: 0.65, ost: 0, drum: 0, brass: 0, choir: 0.55 },
};

function initMusic() {
  const ctx = A.ctx;
  for (const k of ['pad', 'ost', 'drum', 'brass', 'choir']) M.layers[k] = gain(0, A.music);
  // pad: detuned saws -> lowpass
  const padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 520; padLP.connect(M.layers.pad);
  M.padOsc = [];
  for (let v = 0; v < 4; v++) for (const det of [-7, 0, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; o.frequency.value = 73.42;
    const g = gain(0.05); o.connect(g); g.connect(padLP); o.start(); M.padOsc.push({ o, v });
  }
  // choir: saws through formants
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 720; f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
  const cg = gain(1); f1.connect(cg); f2.connect(cg); cg.connect(M.layers.choir);
  M.choirOsc = [];
  for (let v = 0; v < 3; v++) for (const det of [-9, 4]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
    const g = gain(0.09); o.connect(g); g.connect(f1); g.connect(f2); o.start(); M.choirOsc.push({ o, v });
  }
  M.noise = A.b.lp_noise;
  setInterval(schedule, 25);
}

// ---------- recorded music cues (sliced from the delivered track); falls back to procedural music
A.cues = {};
// each mode lists cues in order of preference; the first one that is loaded plays (Part 5 cues fall back to the train score until delivered)
const CUEMAP = { intro: ['M_CHASE'], fight: ['M_TRAIN'], turret: ['M_TURRET'], bridge: ['M_BRIDGE'], end: ['M_END'], title: ['M_INTRO'],
  p5calm: ['M5_AWAKE', 'M_INTRO'], p5defend: ['M5_DEFEND', 'M_TRAIN'], p5jugg: ['M5_JUGG', 'M_TURRET'], p5loss: ['M5_LOSS'], p5final: ['M5_FINAL', 'M_BRIDGE'], p6end: ['M6_END', 'M_END'], credits: ['END_CREDITS'], p1dark: ['M5_AWAKE', 'M_INTRO'], p1fight: ['M1_BUILD', 'M5_DEFEND'], p2ride: ['M5_AWAKE', 'M_INTRO'], p2fight: ['M5_JUGG', 'M_TURRET'] };
const ONCE = new Set(['M_END', 'M5_LOSS', 'M6_END', 'END_CREDITS']);
let cue = null;
export async function loadMusic(map) {
  if (!A.on || !map) return 0;
  let n = 0;
  await Promise.all(Object.entries(map).map(async ([id, b64]) => {
    try {
      const bin = atob(b64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      A.cues[id] = await A.ctx.decodeAudioData(u.buffer); n++;
    } catch (e) { console.warn('music decode failed', id); }
  }));
  if (n && M.mode && M.mode !== 'off') { const m = M.mode; M.mode = ''; musicMode(m); }
  return n;
}
function playCue(id, fast) {
  if (cue && cue.id === id) return;
  const ctx = A.ctx, t = ctx.currentTime;
  if (cue) { const c = cue; c.g.gain.cancelScheduledValues(t); c.g.gain.setTargetAtTime(0, t, fast ? 0.05 : 0.6); setTimeout(() => c.stop(), 4000); }
  cue = null;
  const buf = id && A.cues[id]; if (!buf) return;
  const g = gain(0, A.musicCue); g.gain.setTargetAtTime(1, t, ONCE.has(id) ? 0.2 : 0.5);
  const once = ONCE.has(id), srcs = [];
  let next = t + 0.03;
  const sched = () => {
    while (next < ctx.currentTime + 1.2) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(g); s.start(next); srcs.push(s);
      if (srcs.length > 4) srcs.shift();
      next = once ? Infinity : next + buf.duration - 0.03;
    }
  };
  sched();
  const iv = once ? 0 : setInterval(sched, 250);
  cue = { id, g, stop() { clearInterval(iv); for (const s of srcs) { try { s.stop(); } catch {} } } };
}

export function musicMode(mode) {
  if (!A.on) return;
  if (Object.keys(A.cues).length) {
    M.mode = mode;
    for (const k of Object.keys(M.layers)) M.layers[k].gain.setTargetAtTime(0, A.ctx.currentTime, 0.2);
    const id = (CUEMAP[mode] || []).find((k) => A.cues[k]) || null;
    if (id && cue && cue.id === id && !ONCE.has(id)) return; // already playing
    playCue(id, mode === 'silence');
    return;
  }
  M.mode = mode;
  const tgt = MODES[mode] || MODES.off;
  const t = A.ctx.currentTime;
  for (const k of Object.keys(M.layers)) M.layers[k].gain.setTargetAtTime(tgt[k], t, mode === 'silence' ? 0.05 : 1.2);
  if (M.next < t) M.next = t + 0.05;
}

function schedule() {
  if (!A.on || A.ctx.state !== 'running') return;
  const ctx = A.ctx, sp = 60 / M.bpm / 4;
  if (M.next < ctx.currentTime - 0.2) M.next = ctx.currentTime + 0.02;
  const tgt = MODES[M.mode] || MODES.off;
  while (M.next < ctx.currentTime + 0.15) {
    const s = M.step % 16, bar = Math.floor(M.step / 16) % CH.length, t = M.next;
    const [root, tri] = CH[bar];
    if (s === 0) {
      M.padOsc.forEach(({ o, v }) => o.frequency.setTargetAtTime(st(root * 2, v < 3 ? tri[v] : 12), t, 0.08));
      M.choirOsc.forEach(({ o, v }) => o.frequency.setTargetAtTime(st(root * 4, tri[v]), t, 0.2));
    }
    if (tgt.ost > 0.01) note(t, st(root * 2, OST[s]), 0.13);
    if (tgt.drum > 0.01) {
      const hard = tgt.drum > 0.6;
      if ([0, 6, 8, 11].includes(s) || (hard && [3, 14].includes(s)) || (M.mode === 'bridge' && [12, 13, 15].includes(s))) taiko(t, s === 0 ? 1 : 0.7, M.mode === 'bridge' && s > 11 ? 70 : 52);
      if (hard && (s === 4 || s === 12)) snare(t);
      if (hard && s % 2 === 0) hat(t);
    }
    if (tgt.brass > 0.01 && (s === 0 || (s === 10 && bar % 2 === 1))) brass(t, root, tri);
    M.next += sp; M.step++;
  }
}
function note(t, f, dur) {
  const ctx = A.ctx, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(M.layers.ost); o.start(t); o.stop(t + dur + 0.02);
}
function taiko(t, v, f0) {
  const ctx = A.ctx, o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f0 * 2.4, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(g); g.connect(M.layers.drum); o.start(t); o.stop(t + 0.6);
  const n = ctx.createBufferSource(); n.buffer = M.noise; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  n.connect(lp); lp.connect(ng); ng.connect(M.layers.drum); n.start(t, Math.random() * 0.5); n.stop(t + 0.15);
}
function snare(t) {
  const ctx = A.ctx, n = ctx.createBufferSource(); n.buffer = M.noise;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  n.connect(bp); bp.connect(g); g.connect(M.layers.drum); n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
}
function hat(t) {
  const ctx = A.ctx, n = ctx.createBufferSource(); n.buffer = M.noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  n.connect(hp); hp.connect(g); g.connect(M.layers.drum); n.start(t, Math.random() * 0.5); n.stop(t + 0.05);
}
function brass(t, root, tri) {
  const ctx = A.ctx, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(2400, t + 0.06); lp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  lp.connect(g); g.connect(M.layers.brass);
  for (const s of [0, tri[1], tri[2], 12]) for (const det of [-8, 8]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = st(root * 4, s); o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + 0.85);
  }
}
