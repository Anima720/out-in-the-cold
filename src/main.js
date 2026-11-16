import { G, THREE, clamp, rr, lerp } from './core.js';
import { input, initInput, requestLock, endFrame, hit } from './input.js';
import { makeTextures } from './geom.js';
import { gorge } from './physics.js';
import { initWorld, updateWorld, QUALITY, onResize, W, createRenderer, bakeEnv } from './world.js';
import { makePBR, M } from "./mats.js";
import { PP, initPost, applyPost, resizePost, renderPost } from './post.js';
import { FX } from './fx.js';
import { updateNades, NADES } from './grenade.js';
import { buildTrain, buildDShK, updateTrain, T } from './train.js';
import { initHumans, updateHumans } from './humans.js';
import { initFX, updateFX } from './fx.js';
import { initAudio, resumeAudio, suspendAudio, updateListener, loop, A, play, musicMode, loadVO, loadAllVO, loadMusic } from './audio.js';
import { initWeapon, renderViewmodel, WP } from './weapon.js';
import { P, updatePlayer } from './player.js';
import { updateAI } from './ai.js';
import { updateVehicles } from './vehicles.js';
import { initHUD, updateHUD, HUD } from './hud.js';
import { startCheckpoint, updateDirector, D, LINES } from './director.js';
import './part5.js';
import { updatePickups, clearPickups } from './pickups.js';
import { updateCine } from './cine.js';
import './cave.js';
import { updateCrowd } from './crowd.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
G.params = params;
let canvas, Q;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

async function boot() {
  canvas = document.getElementById('view');
  const qName = params.q || lsGet('tiema_q') || 'medium';
  Q = QUALITY[qName] || QUALITY.medium;
  input.sens = +(lsGet('tiema_sens') || 1);
  const bootMsg = document.getElementById('boot-msg');
  const renderer = createRenderer(canvas, Q);
  await makePBR(renderer, async (name, k) => { bootMsg.textContent = `正在生成材质 ${Math.round(k * 100)}%`; await new Promise((r) => setTimeout(r, 0)); });
  bootMsg.textContent = '正在搭建列车……'; await new Promise((r) => setTimeout(r, 0));
  makeTextures();
  initWorld(canvas, Q);
  initInput(canvas);
  initFX(); initHumans(); initWeapon();
  buildTrain(); buildDShK();
  initHUD();
  addEventListener('resize', () => { onResize(); resizePost(G.renderer); });
  G.onLockChange = (locked) => { if (!locked && G.state === 'play' && !G.paused && !input.lockFailed) pause(true); };
  G.onRetry = (k) => { HUD.hideMenu(); begin(k); };
  G.saveCk = (k) => { if (window.__ready) lsSet('tiema_ck', String(k)); };
  G.showTitle = () => showTitle();
  if (params.god) P.god = true;
  // test hooks
  window.__THREE = THREE; window.__M = M;
  window.__sim = (sec, step = 1 / 60) => { for (let t = 0; t < sec; t += step) { G.real += step; tick(step, false); } };
  window.__begin = (k) => begin(k);
  window.__P = P; window.__input = input; window.__T = T; window.__gorge = gorge; window.__WP = WP; window.__NADES = NADES;
  window.__loadVO = loadVO;
  startCheckpoint(0);
  G.state = 'title';
  bootMsg.textContent = '正在烘焙环境光……'; await new Promise((r) => setTimeout(r, 0));
  updateWorld(0);
  bakeEnv(renderer);
  WP.scene.environment = G.scene.environment;
  initPost(renderer, Q, () => (G.state === 'play' && !WP.hidden && !WP.scoped && P.alive ? WP : null));
  PP.noAO.push(FX.add.mesh, FX.alpha.mesh, FX.tracerMesh, FX.decalMesh, W.snow, W.sky);
  HUD.show(false);
  showTitle();
  document.getElementById('boot').classList.add('done');
  if (params.autostart) begin(+params.ck || 0);
  requestAnimationFrame(frame);
  window.__ready = true;
}

function setQuality(name) {
  const q = QUALITY[name]; if (!q) return;
  Q = q; lsSet('tiema_q', name);
  G.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
  G.renderer.setSize(innerWidth, innerHeight, false);
  applyPost(q); resizePost(G.renderer);
  if (G.renderer.shadowMap.enabled !== q.shadows) {
    G.renderer.shadowMap.enabled = q.shadows; W.sun.castShadow = q.shadows;
    G.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }
}

const CONTROLS = 'WASD 移动 · Shift 冲刺 · C 蹲伏 · 空格 跳跃/攀爬 · 左键 射击 · 右键 瞄准 · R 换弹 · 1/2/3 或滚轮 切换武器 · G 手雷 · V 近战 · 4 阔剑地雷 · F 互动 · Esc 暂停';
function settingsHTML() {
  const qn = Q.name;
  return `<div class="m-set"><span>画质</span><div class="seg">${['low', 'medium', 'high'].map((k, i) => `<button data-q="${k}" aria-pressed="${qn === k}">${['低', '中', '高'][i]}</button>`).join('')}</div>
    <span>灵敏度</span><input type="range" min="0.3" max="2.5" step="0.05" value="${input.sens}" data-sens><output>${input.sens.toFixed(2)}</output></div>`;
}
function bindSettings() {
  HUD.menu.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); setQuality(b.dataset.q);
    HUD.menu.querySelectorAll('[data-q]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  const r = HUD.menu.querySelector('[data-sens]');
  if (r) r.addEventListener('input', () => { input.sens = +r.value; lsSet('tiema_sens', r.value); r.nextElementSibling.textContent = input.sens.toFixed(2); });
}

const CHAPTERS = [
  [10, '第一部分', '坍塌', '矿井深处醒来，在黑暗的巷道里找到马卡洛夫留下的东西。'],
  [20, '第二部分', '升井', '乘罐笼回到地面，在暴风雪里冲过矿区，赶上那列火车。'],
  [0, '第三部分', '铁马', '在飞驰的运矿列车上一节节推进，用机枪对付雌鹿。'],
  [4, '第四部分', '最后阵地', '死守废弃雷达站，直到情报发出去。'],
];
function showTitle() {
  const last = +(lsGet('tiema_ck') ?? 10);
  HUD.showMenu('title', `<div class="m-title">
    <div class="m-eyebrow">使命召唤：现代战争 3 · 非官方同人战役</div>
    <div class="m-word">弃于寒冬<span class="m-subtitle">OUT IN THE COLD</span></div>
    <p class="m-premise">西伯利亚，钻石矿坍塌后。黑鹰带着总统撤离了，Delta Force「Metal」小队和总统卫队军官索科洛夫被留在了地下。马卡洛夫的人还在矿里——他们要运走的东西，指向迪拜。</p>
    <div class="m-actions"><button class="btn primary" data-a="new">开始战役</button>${last !== 10 ? '<button class="btn" data-a="cont">继续上次的检查点</button>' : ''}</div>
    <div class="chapters">${CHAPTERS.map(([k, n, t, d]) => `<button class="chap" data-k="${k}"><small>${n}</small><b>${t}</b><span>${d}</span></button>`).join('')}</div>
    ${settingsHTML()}
    <div class="m-legend">${CONTROLS}</div>
    <p class="m-note">英文配音 + 中文字幕；模型、贴图、音效全部由代码实时生成。建议用电脑浏览器、戴耳机游玩。</p>
  </div>`, {
    '[data-a=new]': () => begin(10),
    '[data-a=cont]': () => begin(last),
    '.chap': (e) => begin(+e.currentTarget.dataset.k),
  });
  bindSettings();
}

function pause(on) {
  if (on) {
    G.paused = true; suspendAudio();
    HUD.showMenu('pause', `<div class="m-card"><div class="m-eyebrow">已暂停</div><div class="m-h">行动暂停</div>
      <div class="m-actions col"><button class="btn primary" data-a="resume">继续游戏</button><button class="btn" data-a="restart">从检查点重来</button></div>
      ${settingsHTML()}<div class="m-legend">${CONTROLS}</div></div>`, {
      '[data-a=resume]': () => pause(false),
      '[data-a=restart]': () => { HUD.hideMenu(); begin(D.ck); },
    });
    bindSettings();
  } else {
    HUD.hideMenu(); G.paused = false; resumeAudio(); requestLock(canvas);
  }
}

function startAmbience() {
  A.trainLoop = loop('train', { vol: 0 });
  A.windLoop = loop('wind', { vol: 0 });
}

function begin(k) {
  if (G.cineRestore) G.cineRestore();
  if (!A.ctx) { if (initAudio()) { startAmbience(); loadAllVO(window.__VO).then((n) => { window.__voLoaded = n; }); loadMusic(window.__MUSIC).then((n) => { window.__musicLoaded = n; }); } }
  resumeAudio();
  requestLock(canvas);
  input.enabled = true;
  HUD.hideMenu();
  startCheckpoint(k);
  if (A.on) play('ui', { vol: 0.5, rev: 0 });
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.state === 'play' && (input.lockFailed || !input.locked)) pause(!G.paused);
});
document.addEventListener('click', () => {
  if (G.state === 'play' && !G.paused && !input.locked && !input.lockFailed) requestLock(canvas);
});

let clackAcc = 0;
function ambience(dt) {
  if (!A.on) return;
  if (G.lvl !== 2) { A.trainLoop.setVol(0); A.windLoop.setVol(G.lvl === 1 ? 0.04 : 0.3); A.windLoop.setRate(G.lvl === 1 ? 0.6 : 0.95); return; }
  const v = G.v;
  const dRear = Math.max(0, P.pos.z - 32, -70 - P.pos.z);
  const near = clamp(1 - dRear / 160, 0, 1);
  A.trainLoop.setVol((0.22 + v * 0.028) * (0.25 + 0.75 * near)); A.trainLoop.setRate(0.7 + v * 0.018);
  A.windLoop.setVol(P.jumped ? 0.35 : 0.12 + v * 0.022); A.windLoop.setRate(0.9 + v * 0.01);
  clackAcc += v * dt;
  if (clackAcc > 12.5) {
    clackAcc = 0;
    if (near > 0.2) play('clack', { pos: new THREE.Vector3(0, 0.6, clamp(P.pos.z + rr(-6, 6), -68, 30)), vol: (0.25 + v * 0.02) * near, ref: 4, rev: 0.1 });
  }
}

let titleT = 0;
function tick(rdt, render) {
  if (G.state === 'play' && !G.paused) {
    const dt = rdt * G.timeScale;
    G.dt = dt; G.t += dt; G.frame++;
    updateDirector(dt, rdt);
    G.s += G.v * dt;
    updateWorld(dt);
    if (G.lvl === 2) updateTrain(dt);
    updatePlayer(dt);
    updateAI(dt);
    updateVehicles(dt);
    updateNades(dt);
    updateCrowd(dt);
    updateHumans(dt);
    updatePickups();
    updateFX(dt);
    ambience(dt);
  } else if (G.state === 'cine') {
    updateCine(rdt);
    updateWorld(rdt); updateHumans(rdt); updateFX(rdt);
  } else if (G.state === 'title') {
    titleT += rdt;
    G.v = 3; G.s += G.v * rdt;
    updateWorld(rdt); updateTrain(rdt); updateHumans(rdt); updateFX(rdt);
    const cam = G.camera;
    const a = titleT * 0.04;
    cam.position.set(9 + Math.sin(a) * 2, 2.2 + Math.sin(a * 0.7) * 0.4, 6 - titleT * 0.6 % 40);
    cam.lookAt(0, 2.2, cam.position.z - 14);
    cam.fov = 60; cam.updateProjectionMatrix();
  }
  updateHUD(rdt);
  updateListener(G.camera);
  if (render) {
    if (PP.composer) renderPost(rdt, G.state === 'play' ? clamp(1 - P.health / 60, 0, 1) : 0, G.state === 'play' ? clamp((1 - G.timeScale) * 1.3, 0, 1) : 0);
    else {
      const r = G.renderer;
      r.clear(); r.render(G.scene, G.camera);
      if (!WP.hidden && G.state === 'play' && P.alive) renderViewmodel(r);
    }
  }
  endFrame();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (window.__freeze) rdt = 0;
  G.real += rdt;
  try { tick(rdt, true); window.__frames = (window.__frames || 0) + 1; }
  catch (e) { console.error(e); window.__errors = window.__errors || []; window.__errors.push(String(e && e.stack || e)); }
}

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));
boot().catch((e) => {
  console.error(e); window.__fatal = String(e && e.stack || e);
  const b = document.getElementById('boot-msg'); if (b) b.textContent = '启动失败：' + e.message;
});
