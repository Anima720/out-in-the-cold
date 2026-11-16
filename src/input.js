import { G } from './core.js';

export const input = {
  down: new Set(), pressed: new Set(),
  mdx: 0, mdy: 0, lmb: false, rmb: false, lmbPressed: false, wheel: 0,
  locked: false, lockFailed: false, mx: 0.5, my: 0.5, sens: 1, enabled: false,
};

// F11: page fullscreen (document element) instead of the browser's own; pointer lock is re-taken after the switch
// and a lock lost to the switch does not pause the game (or flip the mouse into the no-lock fallback).
let CV = null;
function toggleFullscreen() {
  input.fsT = performance.now();
  const d = document, el = d.documentElement;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) { const p = (d.exitFullscreen || d.webkitExitFullscreen).call(d); if (p && p.catch) p.catch(() => {}); }
    else if (el.requestFullscreen || el.webkitRequestFullscreen) { const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
  } catch {}
}
function fsRecent() { return performance.now() - (input.fsT || -1e9) < 1500; }
function relock() { // no-gesture attempt: failure pauses (click to resume) instead of switching to the no-lock fallback
  if (!CV || G.state !== 'play' || G.paused || input.locked || input.lockFailed) return;
  const no = () => { if (!input.locked && G.onLockChange && G.state === 'play' && !G.paused) G.onLockChange(false); };
  try { const p = CV.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { const p2 = CV.requestPointerLock(); if (p2 && p2.catch) p2.catch(no); } catch { no(); } }); } catch { no(); }
}

export function initInput(canvas) {
  CV = canvas;
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F11'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'F11') { toggleFullscreen(); return; }
    input.down.add(e.code); input.pressed.add(e.code);
  });
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { input.fsT = performance.now(); setTimeout(relock, 60); });
  addEventListener('keyup', (e) => input.down.delete(e.code));
  addEventListener('blur', () => { input.down.clear(); input.lmb = input.rmb = false; });
  addEventListener('mousemove', (e) => {
    if (input.locked) { input.mdx += e.movementX; input.mdy += e.movementY; }
    else {
      input.mx = e.clientX / innerWidth; input.my = e.clientY / innerHeight;
      if (input.enabled && input.lockFailed) { input.mdx += e.movementX * 0.7; input.mdy += e.movementY * 0.7; }
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.lmb = true; input.lmbPressed = true; }
    if (e.button === 2) input.rmb = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) input.lmb = false;
    if (e.button === 2) input.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked && fsRecent() && G.state === 'play' && !G.paused) { // lost to the fullscreen switch: take it back
      setTimeout(() => { relock(); setTimeout(() => { if (!input.locked && G.onLockChange) G.onLockChange(false); }, 700); }, 60);
      return;
    }
    if (G.onLockChange) G.onLockChange(input.locked);
  });
  document.addEventListener('pointerlockerror', () => {
    if (fsRecent()) { if (G.onLockChange && G.state === 'play' && !G.paused) G.onLockChange(false); return; } // ask for a click (pause menu) instead
    input.lockFailed = true;
  });
}

export function requestLock(canvas) {
  const fail = () => { input.lockFailed = true; };
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => {
      try { const p2 = canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(fail); } catch { fail(); }
    });
  } catch {
    try { canvas.requestPointerLock(); } catch { fail(); }
  }
}

export const key = (c) => input.down.has(c);
export const hit = (c) => input.pressed.has(c);
export function endFrame() { input.pressed.clear(); input.mdx = input.mdy = 0; input.lmbPressed = false; input.wheel = 0; }
