import { G } from './core.js';

export const input = {
  down: new Set(), pressed: new Set(),
  mdx: 0, mdy: 0, lmb: false, rmb: false, lmbPressed: false, wheel: 0,
  locked: false, lockFailed: false, mx: 0.5, my: 0.5, sens: 1, enabled: false,
};

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    input.down.add(e.code); input.pressed.add(e.code);
  });
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
    if (G.onLockChange) G.onLockChange(input.locked);
  });
  document.addEventListener('pointerlockerror', () => { input.lockFailed = true; });
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
