import { G, THREE, rr, clamp, damp, lerp, smooth } from './core.js';
import { fireRocket } from './vehicles.js';
import { Builder, TEX, mat4, rbox } from './geom.js';
import { M, TX, stdMat } from './mats.js';
import { raycast } from './physics.js';
import { play, gunShot } from './audio.js';
import { fireGL, GL, throwNade } from './grenade.js';
import { buildAttachments, fitAttachments } from './attach.js';
import { T } from './train.js';

// First-person viewmodel (separate scene rendered over the world) + firing for rifle, pistol, DShK.
export const WP = {};
const UP = new THREE.Vector3(0, 1, 0);

function segm(b, A, B, r0, r1, key, color = 0xffffff, seg = 12) {
  const a = new THREE.Vector3(...A), c = new THREE.Vector3(...B), d = c.clone().sub(a), len = d.length();
  const m = new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1, 1, 1));
  b.add(new THREE.CylinderGeometry(r1, r0, len, seg), key, color, m);
}
const H = Math.PI / 2;
// viewmodel materials: US multicam sleeves + coyote-tan gloves (filled in initWeapon, after the PBR textures exist)
let VM = M;
function vmMats() {
  const sleeve = stdMat(TX.camoUS, { env: 1.1, vc: true });
  const glove = new THREE.MeshStandardMaterial({ color: 0xa08866, normalMap: TX.glove.normalMap, roughnessMap: TX.glove.orm, roughness: 1, metalness: 0, vertexColors: true, envMapIntensity: 1.1 });
  return { ...M, sleeve, glove };
}

function sleeves(b, R0, R1, L0, L1) {
  segm(b, R0, R1, 0.05, 0.043, 'sleeve'); segm(b, L0, L1, 0.05, 0.043, 'sleeve');
  for (const [A, B] of [[R0, R1], [L0, L1]]) for (const t of [0.12, 0.3, 0.5]) {
    const a = new THREE.Vector3(...A), c = new THREE.Vector3(...B), p = a.clone().lerp(c, t), d = c.clone().sub(a).normalize();
    b.add(new THREE.TorusGeometry(0.048, 0.005, 6, 18), 'sleeve', 0xd0d0d0, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d), new THREE.Vector3(1, 1, 1)));
  }
}

// hands on a rifle: right hand on the pistol grip at (0,-0.078,0.13), left hand under the handguard around z=-0.29.
// The left hand goes into its own builder `lb` (own group) so an underbarrel can move it down onto the launcher tube.
function rifleHands(b, fy = 0, lb = b) {
  // right hand on grip
  b.boxC(0.002, -0.08, 0.14, 0.052, 0.092, 0.056, 'glove', 0xffffff, -0.3, 0, 0, 0.018);
  for (let k = 0; k < 3; k++) b.capsule(-0.004, -0.064 - k * 0.022, 0.108 + k * 0.007, 0.011, 0.034, 'glove', 0xffffff, 0, 0, H);
  b.capsule(-0.026, -0.03, 0.08, 0.0105, 0.05, 'glove', 0xffffff, H + 0.25);
  b.capsule(0.024, -0.034, 0.072, 0.0098, 0.04, 'glove', 0xffffff, H);
  segm(b, [0.004, -0.115, 0.16], [0.03, -0.17, 0.25], 0.034, 0.031, 'glove');
  // left hand on handguard (fy lowers the wrapping fingers/thumb for a slimmer handguard)
  lb.boxC(-0.004, -0.032, -0.28, 0.072, 0.036, 0.1, 'glove', 0xffffff, 0, 0, 0, 0.014);
  lb.capsule(-0.037, 0.03 + fy, -0.29, 0.0105, 0.055, 'glove', 0xffffff, H - 0.15);
  for (let k = 0; k < 4; k++) lb.capsule(0.035, 0.024 + fy + (k % 2) * 0.003, -0.32 + k * 0.022, 0.0098, 0.03, 'glove', 0xffffff, 0, 0, 0.15);
  segm(lb, [-0.012, -0.018, -0.24], [-0.06, -0.074, -0.15], 0.034, 0.031, 'glove');
  sleeves(b, [0.025, -0.16, 0.23], [0.12, -0.34, 0.56], [-0.05, -0.065, -0.17], [-0.4, -0.37, 0.22]);
}
function leftHand(g, lb, z = 0) { const lh = new THREE.Group(); lb.build(VM, lh, { cast: false }); lh.position.z = z; g.add(lh); return lh; }
// AK-family side-rail optic mount: plate on the left receiver rail, bridge over the dust cover to the optic base at y=0.074
function doveBracket(g, z) {
  const b = new Builder(), br = new THREE.Group();
  b.boxC(-0.031, 0.03, 0.065, 0.006, 0.07, 0.07, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(-0.011, 0.069, (z + 0.095) / 2, 0.046, 0.01, 0.1 - z + 0.03, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.cyl(-0.037, 0.012, 0.065, 0.007, 0.007, 0.01, 'gunW', 0xffffff, 0, 0, H, 10);
  b.boxC(-0.04, 0.012, 0.085, 0.004, 0.006, 0.03, 'gunW', 0xffffff, 0, 0, 0, 0.001);
  b.build(VM, br, { cast: false }); br.visible = false; g.add(br); return br;
}

function buildAK(o = {}) {
  const g = new THREE.Group(), b = new Builder(), lb = new Builder(), SY = 0.07, E = o.ext || 0, BR = o.barrel || 0.0105, MK = o.rail ? 'poly' : 'plum';
  b.boxC(0, 0, 0.03, 0.048, 0.07, 0.3, 'gun', 0, 0, 0, 0, 0.006);
  b.boxC(0, 0.04, 0.05, 0.044, 0.024, 0.25, 'gunW', 0, 0, 0, 0, 0.009);
  for (let i = 0; i < 7; i++) b.boxC(0, 0.0535, -0.03 + i * 0.026, 0.04, 0.004, 0.006, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, 0.047, -0.128, 0.036, 0.03, 0.05, 'gun', 0, 0, 0, 0, 0.004);
  for (const s of [-1, 1]) b.boxC(s * 0.008, SY - 0.004, -0.12, 0.009, 0.012, 0.022, 'gun', 0, 0, 0, 0, 0.0015);
  b.cyl(0, 0.036, -0.34, 0.011, 0.011, 0.18, 'gun', 0xffffff, H);
  b.boxC(0, 0.04, -0.3, 0.042, 0.03, 0.17, 'poly', 0, 0, 0, 0, 0.01);
  b.boxC(0, -0.002, -0.29, 0.056, 0.056, 0.21, 'poly', 0, 0, 0, 0, 0.016);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.boxC(s * 0.0285, -0.004, -0.37 + i * 0.03, 0.002, 0.03, 0.012, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, 0.028, -0.43, 0.028, 0.044, 0.04, 'gun', 0, 0, 0, 0, 0.005);
  b.cyl(0, 0.004, -0.5 - E / 2, BR, BR, 0.22 + E, 'gun', 0xffffff, H, 0, 0, 14);
  b.boxC(0, 0.03, -0.556 - E, 0.022, 0.058, 0.03, 'gun', 0, 0, 0, 0, 0.004);
  for (const s of [-1, 1]) b.boxC(s * 0.008, SY - 0.005, -0.556 - E, 0.004, 0.024, 0.016, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, SY - 0.009, -0.556 - E, 0.003, 0.018, 0.003, 'gun', 0, 0, 0, 0, 0);
  b.cyl(0, 0.004, -0.635 - E, o.muzR || 0.016, o.muzR || 0.016, 0.075, 'gun', 0xffffff, H, 0, 0, 14);
  for (let k = 0; k < 3; k++) b.boxC(0.012, 0.004, -0.62 - E - k * 0.018, 0.008, 0.012, 0.007, 'poly', 0, 0, 0, 0, 0);
  b.cyl(0, 0.004, -0.674 - E, 0.0085, 0.0085, 0.004, 'poly', 0xffffff, H, 0, 0, 12);
  b.boxC(0, -0.078, 0.13, 0.032, 0.108, 0.046, 'poly', 0xffffff, -0.3, 0, 0, 0.011);
  b.boxC(0, -0.052, 0.07, 0.007, 0.007, 0.075, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(0, -0.038, 0.105, 0.007, 0.03, 0.007, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(0, -0.04, 0.077, 0.005, 0.022, 0.006, 'gunW', 0xffffff, -0.25, 0, 0, 0.0015);
  b.boxC(0, -0.02, 0.3, 0.042, 0.09, 0.26, 'poly', 0xffffff, 0, 0, 0, 0.014);
  b.boxC(0, -0.04, 0.44, 0.046, 0.125, 0.024, 'poly', 0xffffff, 0, 0, 0, 0.008);
  b.boxC(0, -0.06, 0.22, 0.03, 0.03, 0.12, 'poly', 0xffffff, 0, 0, 0, 0.008);
  b.boxC(0.027, 0.01, 0.06, 0.004, 0.016, 0.12, 'gunW', 0xffffff, 0, 0, 0.05, 0.0015);
  b.cyl(0.036, 0.024, -0.035, 0.006, 0.006, 0.026, 'gunW', 0xffffff, 0, 0, H, 10);
  b.boxC(-0.026, 0.0, 0.07, 0.005, 0.022, 0.11, 'gun', 0xffffff, 0, 0, 0, 0.0015);
  b.boxC(0.0245, 0.016, 0.04, 0.003, 0.022, 0.06, 'poly', 0xffffff, 0, 0, 0, 0); // ejection port
  if (o.rail) { // AK-12: Picatinny rail on the dust cover, side rails on the handguard, cheek riser, bigger brake
    b.boxC(0, 0.0565, 0.045, 0.022, 0.007, 0.21, 'gun', 0, 0, 0, 0, 0.001);
    for (let i = 0; i < 13; i++) b.boxC(0, 0.061, -0.05 + i * 0.0155, 0.024, 0.004, 0.0075, 'gun', 0, 0, 0, 0, 0.0007);
    for (const sx of [-1, 1]) { b.boxC(sx * 0.0305, -0.004, -0.29, 0.005, 0.016, 0.19, 'gun', 0, 0, 0, 0, 0.001); for (let i = 0; i < 10; i++) b.boxC(sx * 0.033, -0.004, -0.37 + i * 0.017, 0.003, 0.018, 0.008, 'gun', 0, 0, 0, 0, 0.0005); }
    b.boxC(0, 0.035, 0.3, 0.036, 0.022, 0.12, 'poly', 0xffffff, 0, 0, 0, 0.006);
    b.cyl(0, 0.004, -0.645 - E, 0.019, 0.019, 0.05, 'gun', 0xffffff, H, 0, 0, 16);
    for (const sx of [-1, 1]) b.boxC(sx * 0.016, 0.004, -0.65 - E, 0.006, 0.012, 0.02, 'poly', 0, 0, 0, 0, 0);
  }
  rifleHands(b, 0, lb);
  const mag = new THREE.Group(), mb = new Builder();
  if (o.mag === 'box') { mb.boxC(0, -0.09, -0.075, 0.05, 0.13, 0.085, 'plum', 0xffffff, 0.08, 0, 0, 0.006); mb.boxC(0, -0.16, -0.08, 0.054, 0.012, 0.09, 'poly', 0xffffff, 0.08, 0, 0, 0.003); }
  else if (o.mag === 'short') { mb.boxC(0, -0.07, -0.07, 0.032, 0.1, 0.07, 'gun', 0xffffff, 0.12, 0, 0, 0.005); }
  else if (o.mag === 'can') { mb.boxC(0.055, -0.08, -0.03, 0.07, 0.11, 0.13, 'pGreen', 0xffffff, 0, 0, 0, 0.008); for (let i = 0; i < 6; i++) mb.cyl(0.03 - i * 0.012, -0.015, -0.03, 0.005, 0.005, 0.05, 'shell', 0xffffff, H, 0, 0, 6); }
  else {
  for (let i = 0; i < 5; i++) mb.boxC(0, -0.035 - i * 0.034, -0.06 - i * i * 0.0045 - i * 0.008, 0.03, 0.04, 0.074, MK, 0xffffff, 0.11 * i, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) mb.boxC(0.0155, -0.05 - i * 0.034, -0.06 - i * i * 0.0045 - i * 0.008, 0.002, 0.012, 0.05, MK, 0xffffff, 0.11 * i, 0, 0, 0);
  mb.boxC(0, -0.2, -0.095, 0.034, 0.012, 0.08, 'poly', 0xffffff, 0.5, 0, 0, 0.004);
  }
  if (o.scope) { // PSO-style scope on a side rail
    b.cyl(0, SY + 0.045, -0.06, 0.016, 0.016, 0.24, 'gun', 0xffffff, H, 0, 0, 16);
    b.cyl(0, SY + 0.045, -0.2, 0.024, 0.017, 0.05, 'gun', 0xffffff, H, 0, 0, 16);
    b.cyl(0, SY + 0.045, 0.07, 0.02, 0.016, 0.04, 'gun', 0xffffff, H, 0, 0, 16);
    b.cyl(0, SY + 0.045, 0.092, 0.019, 0.019, 0.002, 'glass', 0, H, 0, 0, 16);
    b.boxC(0, SY + 0.016, -0.06, 0.02, 0.03, 0.08, 'gun', 0xffffff, 0, 0, 0, 0.004);
    b.cyl(0.02, SY + 0.06, -0.08, 0.008, 0.008, 0.02, 'gun', 0xffffff, 0, 0, H, 10);
  }
  if (o.bipod) for (const sx of [-1, 1]) b.cyl(sx * 0.012, -0.03, -0.62 - E, 0.004, 0.004, 0.22, 'gun', 0xffffff, H - 0.15, 0, sx * 0.08, 6);
  if (o.shroud) b.boxC(0, 0.004, -0.5 - E / 2, 0.03, 0.03, 0.2 + E * 0.6, 'poly', 0xffffff, 0, 0, 0, 0.006);
  b.build({ ...VM, glass: new THREE.MeshStandardMaterial({ color: 0x223844, roughness: 0.05, metalness: 0.5 }), shell: M.gun }, g, { cast: false });
  mb.build(VM, mag, { cast: false }); mag.position.set(0, -0.02, 0); g.add(mag);
  const lh = leftHand(g, lb), canOpt = !o.scope && o.mag !== 'can';
  const mount = !canOpt ? null : o.rail ? { y: 0.0645, cy: 0.094, z: 0.04 } : { y: 0.074, cy: 0.104, z: 0.03 };
  return { g, mag, lh, mount, bracket: canOpt && !o.rail ? doveBracket(g, mount.z) : null, ubm: o.ub ? { y: -0.03, z: -0.3 } : null, ak: true,
    magY0: o.mag ? 0 : -0.02, sightY: o.scope ? SY + 0.045 : SY, rearZ: o.scope ? 0.09 : -0.12, muzzle: new THREE.Vector3(0, 0.004, -0.69 - E), eject: new THREE.Vector3(0.03, 0.02, 0.04),
    hip: [0.12, -0.135, -0.3], adsZ: o.scope ? -0.06 : -0.17, sprint: [0.07, -0.19, -0.28] };
}

// M4A1 (SOPMOD-era Delta carbine): flat-top upper with a flip-up rear aperture, A-frame front sight base,
// RIS quad rail, straight 30-round STANAG magazine, collapsible stock. Same grip/handguard spots as the AK
// so the shared hands fit; sight line SY, rear aperture at z=RZ, front post tip exactly on the sight line.
function buildM4() {
  const g = new THREE.Group(), b = new Builder(), lb = new Builder(), SY = 0.072, RZ = 0.095, FZ = -0.365;
  // upper receiver + Picatinny rail
  b.boxC(0, 0.007, 0.0, 0.04, 0.034, 0.25, 'gun', 0, 0, 0, 0, 0.004);
  b.boxC(0, 0.0265, 0.0, 0.024, 0.006, 0.245, 'gun', 0, 0, 0, 0, 0.001);
  for (let i = 0; i < 15; i++) b.boxC(0, 0.0305, -0.112 + i * 0.0155, 0.026, 0.004, 0.0075, 'gun', 0, 0, 0, 0, 0.0008);
  b.boxC(0, 0.019, 0.132, 0.016, 0.008, 0.024, 'gun', 0, 0, 0, 0, 0.002);                       // charging handle
  b.boxC(0, 0.019, 0.142, 0.05, 0.008, 0.01, 'gun', 0, 0, 0, 0, 0.002);
  b.boxC(0.021, 0.008, 0.085, 0.012, 0.022, 0.034, 'gun', 0, 0, 0, 0, 0.004);                    // forward assist
  b.cyl(0.029, 0.008, 0.09, 0.008, 0.008, 0.012, 'gunW', 0xffffff, 0, 0, H, 10);
  b.boxC(0.0205, 0.005, 0.0, 0.002, 0.016, 0.06, 'poly', 0xffffff, 0, 0, 0, 0);                    // ejection port cover
  b.boxC(0.023, 0.016, 0.05, 0.008, 0.012, 0.014, 'gun', 0, 0, 0, 0, 0.002);                     // brass deflector
  // lower receiver, magwell, trigger guard, controls
  b.boxC(0, -0.03, 0.015, 0.042, 0.042, 0.21, 'gun', 0, 0, 0, 0, 0.005);
  b.boxC(0, -0.062, -0.058, 0.048, 0.05, 0.074, 'gun', 0, 0, 0, 0, 0.005);
  for (const s of [-1, 1]) b.boxC(s * 0.0245, -0.072, -0.058, 0.002, 0.012, 0.07, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, -0.072, 0.055, 0.01, 0.006, 0.09, 'gun', 0, 0, 0, 0, 0.002);
  b.boxC(0, -0.061, 0.012, 0.008, 0.026, 0.006, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, -0.06, 0.05, 0.005, 0.022, 0.005, 'gunW', 0xffffff, -0.25, 0, 0, 0.0015);              // trigger
  b.boxC(-0.0225, -0.028, 0.075, 0.004, 0.008, 0.024, 'gunW', 0xffffff, 0, 0, 0, 0.0015);          // selector
  b.boxC(-0.0225, -0.04, -0.035, 0.004, 0.022, 0.008, 'gunW', 0xffffff, 0, 0, 0, 0.0015);          // bolt catch
  b.cyl(0.0235, -0.04, -0.012, 0.0055, 0.0055, 0.005, 'gunW', 0xffffff, 0, 0, H, 10);              // mag release
  b.boxC(0, -0.078, 0.13, 0.03, 0.108, 0.044, 'poly', 0xffffff, -0.3, 0, 0, 0.011);                 // pistol grip
  // buffer tube + collapsible stock
  b.cyl(0, 0.0, 0.255, 0.0155, 0.0155, 0.27, 'gun', 0xffffff, H, 0, 0, 14);
  b.cyl(0, 0.0, 0.132, 0.02, 0.02, 0.014, 'gunW', 0xffffff, H, 0, 0, 10);
  b.boxC(0, -0.004, 0.345, 0.042, 0.05, 0.15, 'poly', 0xffffff, 0, 0, 0, 0.012);
  b.boxC(0, -0.044, 0.385, 0.038, 0.05, 0.1, 'poly', 0xffffff, 0.3, 0, 0, 0.01);
  b.boxC(0, -0.022, 0.43, 0.046, 0.115, 0.022, 'poly', 0xffffff, 0, 0, 0, 0.008);
  b.boxC(0, -0.026, 0.29, 0.012, 0.01, 0.05, 'poly', 0xffffff, 0, 0, 0, 0.003);
  // RIS quad rail, delta ring, handguard cap
  const HZ = -0.235, HL = 0.2;
  b.cyl(0, 0, -0.131, 0.029, 0.029, 0.014, 'gun', 0xffffff, H, 0, 0, 18);
  b.boxC(0, 0, HZ, 0.046, 0.046, HL, 'gun', 0, 0, 0, 0, 0.008);
  for (const [rx, ry] of [[0, 0.0265], [0, -0.0265], [0.0265, 0], [-0.0265, 0]]) {
    b.boxC(rx, ry, HZ, rx ? 0.007 : 0.022, ry ? 0.007 : 0.022, HL - 0.004, 'gun', 0, 0, 0, 0, 0.001);
    for (let i = 0; i < 12; i++) b.boxC(rx * 1.13, ry * 1.13, HZ - 0.085 + i * 0.0155, rx ? 0.004 : 0.024, ry ? 0.004 : 0.024, 0.0075, 'gun', 0, 0, 0, 0, 0.0006);
  }
  b.cyl(0, 0, -0.339, 0.026, 0.026, 0.01, 'gun', 0xffffff, H, 0, 0, 16);
  // barrel, A-frame front sight base, A2 birdcage
  b.cyl(0, 0, -0.43, 0.0095, 0.0095, 0.2, 'gun', 0xffffff, H, 0, 0, 14);
  b.cyl(0, 0, FZ, 0.017, 0.017, 0.03, 'gun', 0xffffff, H, 0, 0, 14);
  b.boxC(0, 0.024, FZ, 0.02, 0.036, 0.022, 'gun', 0, 0, 0, 0, 0.003);
  b.boxC(0, 0.047, FZ, 0.013, 0.02, 0.016, 'gun', 0, 0, 0, 0, 0.002);
  b.boxC(0, SY - 0.017, FZ, 0.024, 0.006, 0.014, 'gun', 0, 0, 0, 0, 0.001);
  for (const s of [-1, 1]) b.boxC(s * 0.0095, SY - 0.006, FZ, 0.004, 0.026, 0.012, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, SY - 0.009, FZ, 0.003, 0.018, 0.003, 'gun', 0, 0, 0, 0, 0);                            // post: tip on the sight line
  b.boxC(0, -0.024, FZ - 0.006, 0.008, 0.02, 0.018, 'gun', 0, 0, 0, 0, 0.002);                     // bayonet lug
  b.cyl(0, 0, -0.545, 0.0115, 0.0115, 0.05, 'gun', 0xffffff, H, 0, 0, 14);
  for (const a of [0.75, 1.57, 2.4]) b.boxC(Math.cos(a) * 0.0105, Math.sin(a) * 0.0105, -0.55, 0.004, 0.004, 0.03, 'poly', 0xffffff, 0, 0, 0, 0);
  b.cyl(0, 0, -0.5705, 0.0062, 0.0062, 0.002, 'poly', 0xffffff, H, 0, 0, 12);
  // flip-up rear sight (own group, pivot on the rail so it folds flat under an optic): clamp, tower, aperture ring, wings
  const rb = new Builder(), ry = 0.031;
  rb.boxC(0, 0.036 - ry, 0, 0.03, 0.01, 0.034, 'gun', 0, 0, 0, 0, 0.002);
  rb.boxC(0, 0.051 - ry, 0, 0.018, 0.022, 0.01, 'gun', 0, 0, 0, 0, 0.002);
  rb.add(new THREE.TorusGeometry(0.0068, 0.0018, 8, 22), 'gun', 0xffffff, mat4(0, SY - ry, 0));
  for (const s of [-1, 1]) rb.boxC(s * 0.0115, SY - 0.012 - ry, 0, 0.003, 0.024, 0.01, 'gun', 0, 0, 0, 0, 0.001);
  const rs = new THREE.Group(); rb.build(VM, rs, { cast: false }); rs.position.set(0, ry, RZ); g.add(rs);
  rifleHands(b, -0.01, lb);
  b.build(VM, g, { cast: false });
  const lh = leftHand(g, lb);
  // straight 30-round STANAG magazine
  const mag = new THREE.Group(), mb = new Builder();
  mb.boxC(0, -0.15, -0.06, 0.026, 0.18, 0.066, 'gunW', 0xffffff, 0, 0, 0, 0.004);
  for (const s of [-1, 1]) mb.boxC(s * 0.0135, -0.16, -0.06, 0.002, 0.14, 0.028, 'gunW', 0xffffff, 0, 0, 0, 0.001);
  mb.boxC(0, -0.243, -0.061, 0.031, 0.012, 0.074, 'poly', 0xffffff, 0, 0, 0, 0.004);
  mb.build(VM, mag, { cast: false }); g.add(mag);
  return { g, mag, lh, rs, mount: { y: 0.0325, cy: 0.084, z: -0.012 }, ubm: { y: -0.03, z: -0.245 }, magY0: 0, sightY: SY, rearZ: RZ, muzzle: new THREE.Vector3(0, 0, -0.575), eject: new THREE.Vector3(0.026, 0.006, 0.0),
    hip: [0.12, -0.135, -0.3], adsZ: -0.2, sprint: [0.07, -0.19, -0.28] };
}

// АКС-74У: AK receiver, short plum handguard, front sight block, cylindrical booster, skeleton folding stock.
// Rear flip sight sits on the dust cover (z=RZ); the left hand moves back onto the short handguard.
function buildSMG() {
  const g = new THREE.Group(), b = new Builder(), lb = new Builder(), SY = 0.07, RZ = 0.072, FZ = -0.322;
  b.boxC(0, 0, 0.03, 0.048, 0.07, 0.3, 'gun', 0, 0, 0, 0, 0.006);
  b.boxC(0, 0.04, 0.05, 0.044, 0.024, 0.25, 'gunW', 0, 0, 0, 0, 0.009);
  for (let i = 0; i < 6; i++) b.boxC(0, 0.0535, -0.03 + i * 0.026, 0.04, 0.004, 0.006, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, 0.054, RZ, 0.03, 0.012, 0.03, 'gun', 0, 0, 0, 0, 0.002);                          // rear sight base
  for (const s of [-1, 1]) b.boxC(s * 0.009, SY - 0.004, RZ, 0.006, 0.016, 0.012, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, SY - 0.008, RZ, 0.012, 0.008, 0.008, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, 0.047, -0.128, 0.036, 0.03, 0.05, 'gun', 0, 0, 0, 0, 0.004);
  b.boxC(0, 0.038, -0.205, 0.036, 0.026, 0.12, 'plum', 0, 0, 0, 0, 0.008);                   // upper handguard
  b.boxC(0, -0.004, -0.2, 0.054, 0.054, 0.15, 'plum', 0, 0, 0, 0, 0.014);                    // lower handguard
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.boxC(s * 0.0275, -0.004, -0.255 + i * 0.03, 0.002, 0.028, 0.01, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, 0.012, FZ, 0.03, 0.05, 0.04, 'gun', 0, 0, 0, 0, 0.004);                           // front sight / gas block
  b.boxC(0, 0.046, FZ, 0.026, 0.026, 0.02, 'gun', 0, 0, 0, 0, 0.003);
  for (const s of [-1, 1]) b.boxC(s * 0.009, SY - 0.006, FZ, 0.004, 0.022, 0.014, 'gun', 0, 0, 0, 0, 0.001);
  b.boxC(0, SY - 0.009, FZ, 0.003, 0.018, 0.003, 'gun', 0, 0, 0, 0, 0);
  b.cyl(0, 0.004, -0.3, 0.011, 0.011, 0.08, 'gun', 0xffffff, H, 0, 0, 14);
  b.cyl(0, 0.004, -0.385, 0.019, 0.019, 0.075, 'gun', 0xffffff, H, 0, 0, 18);                // booster
  b.cyl(0, 0.004, -0.429, 0.0125, 0.019, 0.014, 'gun', 0xffffff, H, 0, 0, 18);
  b.cyl(0, 0.004, -0.437, 0.008, 0.008, 0.003, 'poly', 0xffffff, H, 0, 0, 12);
  b.boxC(0, -0.078, 0.13, 0.032, 0.108, 0.046, 'plum', 0xffffff, -0.3, 0, 0, 0.011);          // grip
  b.boxC(0, -0.052, 0.07, 0.007, 0.007, 0.075, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(0, -0.038, 0.105, 0.007, 0.03, 0.007, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(0, -0.04, 0.077, 0.005, 0.022, 0.006, 'gunW', 0xffffff, -0.25, 0, 0, 0.0015);
  b.boxC(0.027, 0.01, 0.06, 0.004, 0.016, 0.12, 'gunW', 0xffffff, 0, 0, 0.05, 0.0015);
  b.boxC(-0.026, 0.0, 0.07, 0.005, 0.022, 0.11, 'gun', 0xffffff, 0, 0, 0, 0.0015);
  b.boxC(0.0245, 0.016, 0.04, 0.003, 0.022, 0.06, 'poly', 0xffffff, 0, 0, 0, 0);
  // skeleton stock folded out: two struts and a butt plate
  for (const [y0, y1] of [[0.012, -0.004], [-0.03, -0.075]]) segm(b, [0, y0, 0.18], [0, y1, 0.43], 0.0055, 0.0055, 'gun', 0xffffff, 8);
  b.boxC(0, -0.04, 0.435, 0.03, 0.1, 0.012, 'gun', 0xffffff, 0, 0, 0, 0.004);
  b.boxC(0, -0.004, 0.18, 0.03, 0.04, 0.02, 'gun', 0xffffff, 0, 0, 0, 0.004);
  rifleHands(b, 0, lb);
  b.build(VM, g, { cast: false });
  const lh = leftHand(g, lb, 0.075);
  const mag = new THREE.Group(), mb = new Builder();
  for (let i = 0; i < 5; i++) mb.boxC(0, -0.035 - i * 0.034, -0.06 - i * i * 0.0045 - i * 0.008, 0.03, 0.04, 0.074, 'plum', 0xffffff, 0.11 * i, 0, 0, 0.004);
  mb.boxC(0, -0.2, -0.095, 0.034, 0.012, 0.08, 'poly', 0xffffff, 0.5, 0, 0, 0.004);
  mb.build(VM, mag, { cast: false }); mag.position.set(0, -0.02, 0); g.add(mag);
  const mount = { y: 0.074, cy: 0.104, z: 0.0 };
  return { g, mag, lh, mount, bracket: doveBracket(g, mount.z), ak: true, magY0: -0.02, sightY: SY, rearZ: RZ, muzzle: new THREE.Vector3(0, 0.004, -0.445), eject: new THREE.Vector3(0.03, 0.02, 0.04),
    hip: [0.12, -0.13, -0.29], adsZ: -0.2, sprint: [0.07, -0.19, -0.27] };
}

function buildPistol() {
  const g = new THREE.Group(), b = new Builder(), SY = 0.046;
  b.boxC(0, 0.02, -0.035, 0.03, 0.034, 0.19, 'gun', 0xffffff, 0, 0, 0, 0.005);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) b.boxC(s * 0.0152, 0.02, 0.03 + i * 0.006, 0.002, 0.026, 0.0025, 'gunW', 0xffffff, 0, 0, 0, 0);
  b.boxC(0, -0.006, -0.045, 0.028, 0.022, 0.15, 'poly', 0xffffff, 0, 0, 0, 0.006);
  b.boxC(0, -0.072, 0.035, 0.032, 0.115, 0.052, 'poly', 0xffffff, -0.25, 0, 0, 0.011);
  for (let i = 0; i < 6; i++) b.boxC(0, -0.05 - i * 0.015, 0.06 + i * 0.004, 0.034, 0.004, 0.008, 'gun', 0xffffff, -0.25, 0, 0, 0.001);
  b.boxC(0, -0.03, -0.035, 0.006, 0.006, 0.06, 'poly', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(0, -0.022, -0.005, 0.005, 0.02, 0.006, 'gunW', 0xffffff, -0.2, 0, 0, 0.001);
  b.boxC(0, SY - 0.004, 0.052, 0.022, 0.009, 0.01, 'gun', 0xffffff, 0, 0, 0, 0.001);
  b.boxC(0, SY - 0.004, -0.118, 0.004, 0.01, 0.008, 'gun', 0xffffff, 0, 0, 0, 0.001);
  b.cyl(0, 0.017, -0.131, 0.0065, 0.0065, 0.006, 'poly', 0xffffff, H, 0, 0, 12);
  b.boxC(0.0155, 0.026, -0.02, 0.002, 0.012, 0.04, 'poly', 0xffffff, 0, 0, 0, 0); // ejection port
  b.boxC(-0.016, 0.003, 0.0, 0.004, 0.01, 0.03, 'gunW', 0xffffff, 0, 0, 0, 0.001); // slide stop
  // two-hand grip
  b.boxC(0.003, -0.075, 0.045, 0.054, 0.1, 0.06, 'glove', 0xffffff, -0.25, 0, 0, 0.018);
  for (let k = 0; k < 3; k++) b.capsule(0.0, -0.058 - k * 0.022, 0.005 + k * 0.006, 0.0108, 0.034, 'glove', 0xffffff, 0, 0, H);
  b.capsule(0.022, -0.01, -0.02, 0.0098, 0.045, 'glove', 0xffffff, H);
  b.boxC(-0.03, -0.075, 0.03, 0.03, 0.095, 0.07, 'glove', 0xffffff, -0.25, 0, 0.1, 0.014);
  for (let k = 0; k < 3; k++) b.capsule(-0.006, -0.06 - k * 0.022, -0.012 + k * 0.006, 0.0102, 0.03, 'glove', 0xffffff, 0, 0, H);
  b.capsule(-0.02, -0.006, -0.03, 0.0098, 0.04, 'glove', 0xffffff, H - 0.1);
  segm(b, [0.008, -0.11, 0.08], [0.03, -0.16, 0.16], 0.034, 0.031, 'glove');
  segm(b, [-0.035, -0.11, 0.07], [-0.07, -0.16, 0.15], 0.034, 0.031, 'glove');
  sleeves(b, [0.028, -0.155, 0.15], [0.14, -0.33, 0.48], [-0.07, -0.155, 0.14], [-0.2, -0.34, 0.48]);
  b.build(VM, g, { cast: false });
  const mag = new THREE.Group(), mb = new Builder();
  mb.boxC(0, -0.13, 0.055, 0.028, 0.02, 0.05, 'poly', 0xffffff, -0.25, 0, 0, 0.004);
  mb.build(VM, mag, { cast: false }); g.add(mag);
  const slide = null;
  return { g, mag, sightY: SY, rearZ: 0.052, muzzle: new THREE.Vector3(0, 0.017, -0.14), eject: new THREE.Vector3(0.02, 0.03, -0.02),
    hip: [0.1, -0.12, -0.33], adsZ: -0.27, sprint: [0.06, -0.2, -0.3] };
}

// 9K38 Igla MANPADS on the right shoulder; the iron-sight frame sits at x=0 so ADS centres it
function buildIgla(rpg = false) {
  const g = new THREE.Group(), b = new Builder(), TX0 = 0.13;
  if (rpg) {
    b.cyl(TX0, 0, -0.25, 0.034, 0.034, 0.95, 'gun', 0xffffff, H, 0, 0, 16);
    for (const z of [-0.12, 0.12]) b.cyl(TX0, 0, z, 0.045, 0.045, 0.2, 'wood', 0x7a5232, H, 0, 0, 16);
    b.cyl(TX0, 0, 0.3, 0.034, 0.06, 0.12, 'gun', 0xffffff, H, 0, 0, 16);
    b.cyl(TX0, 0, -0.78, 0.03, 0.03, 0.16, 'pGreen', 0xffffff, H, 0, 0, 12);
    b.cyl(TX0, 0, -0.95, 0.045, 0.012, 0.22, 'pGreen', 0xffffff, H, 0, 0, 14);
    b.cyl(TX0, 0, -1.08, 0.012, 0.004, 0.06, 'gun', 0xffffff, H, 0, 0, 8);
  } else {
  b.cyl(TX0, 0, -0.32, 0.047, 0.047, 1.5, 'paint', 0x4b5a3a, H, 0, 0, 16);
  if (!rpg) { b.cyl(TX0, 0, 0.44, 0.06, 0.05, 0.06, 'gun', 0xffffff, H, 0, 0, 16);
  b.cyl(TX0, 0, -1.06, 0.052, 0.052, 0.05, 'gun', 0xffffff, H, 0, 0, 16); }
  b.cyl(TX0, 0, -1.12, 0.03, 0.046, 0.08, 'glass', 0, H, 0, 0, 16);
  for (const z of [-0.7, -0.15, 0.25]) b.cyl(TX0, 0, z, 0.05, 0.05, 0.02, 'gun', 0xffffff, H, 0, 0, 16);
  }
  b.boxC(TX0, -0.075, 0.06, 0.035, 0.11, 0.07, 'poly', 0xffffff, -0.2, 0, 0, 0.01);       // gripstock
  b.boxC(TX0, -0.05, -0.02, 0.03, 0.05, 0.12, 'gun', 0xffffff, 0, 0, 0, 0.008);
  b.cyl(TX0, -0.085, -0.2, 0.028, 0.028, 0.16, 'gun', 0xffffff, 0, 0, 0, 12);             // battery unit
  b.boxC(TX0 - 0.05, -0.01, -0.1, 0.04, 0.03, 0.1, 'poly', 0xffffff, 0, 0, 0, 0.006);
  // folding sight frame on the left of the tube (centre at x=0)
  const SY = 0.04;
  for (const [x, y, w, h] of [[0, SY + 0.028, 0.06, 0.005], [0, SY - 0.028, 0.06, 0.005], [-0.028, SY, 0.005, 0.06], [0.028, SY, 0.005, 0.06]]) b.boxC(x, y, -0.02, w, h, 0.005, 'gun', 0xffffff, 0, 0, 0, 0);
  b.boxC(0.06, SY - 0.03, -0.02, 0.09, 0.008, 0.008, 'gun', 0xffffff, 0, 0, 0, 0);
  b.boxC(0, SY + 0.006, -0.32, 0.004, 0.014, 0.004, 'gun', 0xffffff, 0, 0, 0, 0);
  b.boxC(0.06, SY - 0.03, -0.32, 0.09, 0.008, 0.008, 'gun', 0xffffff, 0, 0, 0, 0);
  // hands: right on the gripstock, left under the tube
  b.boxC(TX0 + 0.005, -0.09, 0.08, 0.055, 0.1, 0.07, 'glove', 0xffffff, -0.2, 0, 0, 0.018);
  for (let k = 0; k < 3; k++) b.capsule(TX0 - 0.03, -0.07 - k * 0.022, 0.05, 0.011, 0.034, 'glove', 0xffffff, 0, 0, H);
  b.boxC(TX0 - 0.01, -0.07, -0.45, 0.07, 0.05, 0.09, 'glove', 0xffffff, 0.2, 0, 0, 0.02);
  for (let k = 0; k < 4; k++) b.capsule(TX0 + 0.045, -0.035, -0.42 - k * 0.022, 0.0105, 0.04, 'glove', 0xffffff, 0, 0, 0.3);
  segm(b, [TX0 + 0.01, -0.13, 0.11], [TX0 + 0.06, -0.2, 0.2], 0.034, 0.031, 'glove');
  segm(b, [TX0 - 0.02, -0.1, -0.42], [-0.06, -0.2, -0.22], 0.034, 0.031, 'glove');
  sleeves(b, [TX0 + 0.06, -0.2, 0.2], [0.26, -0.36, 0.5], [-0.06, -0.2, -0.22], [-0.24, -0.38, 0.1]);
  b.build({ ...VM, glass: new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.05, metalness: 0.6 }) }, g, { cast: false });
  const mag = new THREE.Group(); g.add(mag);
  return { g, mag, sightY: SY, rearZ: -0.02, muzzle: new THREE.Vector3(TX0, 0, -1.15), eject: new THREE.Vector3(0, 0, 0),
    hip: [0.03, -0.075, -0.2], adsZ: -0.13, sprint: [0.08, -0.2, -0.15] };
}

// left arm that winds up and lobs the grenade (pivot at the shoulder, arm points along -z)
function buildThrowArm() {
  const pivot = new THREE.Group(), b = new Builder();
  segm(b, [0, 0, 0], [0.02, 0.0, -0.3], 0.055, 0.047, 'sleeve');
  for (const t of [0.15, 0.4, 0.7]) b.add(new THREE.TorusGeometry(0.05, 0.005, 6, 18), 'sleeve', 0xd0d0d0, mat4(0.006 * t * 3, 0, -0.3 * t));
  segm(b, [0.02, 0.0, -0.3], [0.035, 0.01, -0.47], 0.036, 0.032, 'glove');
  b.boxC(0.04, 0.012, -0.5, 0.06, 0.075, 0.07, 'glove', 0xffffff, 0, 0, 0, 0.02);
  for (let k = 0; k < 3; k++) b.capsule(0.012 + k * 0.018, 0.04, -0.53, 0.0105, 0.03, 'glove', 0xffffff, 0.4, 0, 0);
  b.build(VM, pivot, { cast: false });
  const nade = new THREE.Group(), nb = new Builder();
  nb.sphere(0, 0, 0, 0.031, 'pOlive', 0xffffff, 1, 1.15, 1, 14);
  nb.cyl(0, 0.042, 0, 0.009, 0.009, 0.022, 'gunW', 0xffffff, 0, 0, 0, 10);
  nb.boxC(0.012, 0.03, 0, 0.006, 0.05, 0.012, 'gunW', 0xffffff, 0, 0, 0.25, 0.002);
  nb.build(M, nade, { cast: false });
  nade.position.set(0.04, 0.05, -0.55); pivot.add(nade);
  pivot.position.set(-0.2, -0.3, 0.12);
  return { pivot, nade };
}

// right arm with a combat knife for melee slashes
function buildKnifeArm() {
  const pivot = new THREE.Group(), b = new Builder();
  segm(b, [0, 0, 0], [-0.03, 0.0, -0.3], 0.055, 0.047, 'sleeve');
  segm(b, [-0.03, 0.0, -0.3], [-0.04, 0.01, -0.46], 0.036, 0.032, 'glove');
  b.boxC(-0.045, 0.01, -0.5, 0.06, 0.07, 0.075, 'glove', 0xffffff, 0, 0, 0, 0.02);
  b.boxC(-0.045, 0.01, -0.55, 0.022, 0.026, 0.1, 'poly', 0xffffff, 0, 0, 0, 0.006);
  b.boxC(-0.045, 0.01, -0.605, 0.05, 0.012, 0.012, 'gun', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(-0.045, 0.01, -0.69, 0.006, 0.03, 0.16, 'gunW', 0xffffff, 0, 0, 0, 0.002);
  b.boxC(-0.045, 0.002, -0.775, 0.006, 0.014, 0.02, 'gunW', 0xffffff, 0.6, 0, 0, 0.002);
  b.build(VM, pivot, { cast: false });
  pivot.position.set(0.24, -0.3, 0.1);
  return { pivot };
}

// piecewise smooth keyframes [[t, v], ...]
function keys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const [t0, a] = k[i - 1], [t1, b] = k[i]; return a + (b - a) * smooth((t - t0) / (t1 - t0)); }
  return k[k.length - 1][1];
}

const _sh = new THREE.Vector3(), _hd = new THREE.Vector3();
function keysV(k, t) { return [0, 1, 2].map(i => keys(k.map(([tt, v]) => [tt, v[i]]), t)); }
// orient an arm group (origin at shoulder, hand along -z at distance len) so its hand lands on `hand`
function aimArm(pivot, sh, hand, roll, len) {
  _sh.fromArray(sh); _hd.fromArray(hand).sub(_sh);
  const d = _hd.length();
  pivot.rotation.order = 'YXZ';
  pivot.position.copy(_sh);
  pivot.rotation.set(Math.atan2(_hd.y, Math.hypot(_hd.x, _hd.z)), Math.atan2(-_hd.x, -_hd.z), roll);
  pivot.scale.set(1, 1, clamp(d / len, 0.6, 1.4));
}

// snd = gun sound class (audio.js GUNS), far = name enemies pass to play() for that weapon at a distance
const DEF = {
  m4: { name: 'M4A1', mag: 30, reserve: 270, rate: 0.08, auto: true, dmg: 31, force: 6, snd: 'm4', far: 'm4_far', tracer: 3, spreadHip: 0.026, spreadAds: 0.0022, kick: 0.0088, reload: [1.95, 2.4] },
  ak: { name: 'AK-74M', mag: 30, reserve: 270, rate: 0.1, auto: true, dmg: 34, force: 6, snd: 'ak', far: 'ak_far', tracer: 3, spreadHip: 0.028, spreadAds: 0.0025, kick: 0.0105, reload: [2.0, 2.45] },
  ak12: { name: 'AK-12', mag: 30, reserve: 270, rate: 0.086, auto: true, dmg: 33, force: 6, snd: 'ak12', far: 'ak12_far', tracer: 3, spreadHip: 0.025, spreadAds: 0.002, kick: 0.0094, reload: [1.9, 2.35] },
  smg: { name: 'АКС-74У', mag: 30, reserve: 240, rate: 0.068, auto: true, dmg: 26, force: 5, snd: 'smg', far: 'smg_far', tracer: 3, spreadHip: 0.02, spreadAds: 0.0045, kick: 0.0082, reload: [1.75, 2.15], move: 1.06 },
  pistol: { name: 'M1911', mag: 8, reserve: 56, rate: 0.14, auto: false, dmg: 36, force: 4, snd: 'pistol', far: 'pistol_far', spreadHip: 0.02, spreadAds: 0.004, kick: 0.016, reload: [1.5, 1.8] },
  pkm: { name: 'PKM', mag: 100, reserve: 200, rate: 0.085, auto: true, dmg: 40, force: 7, snd: 'pkm', far: 'pkm_far', tracer: 2, spreadHip: 0.045, spreadAds: 0.006, kick: 0.012, reload: [4.6, 5.0], move: 0.86 },
  svd: { name: 'СВД', mag: 10, reserve: 40, rate: 0.32, auto: false, dmg: 160, force: 10, snd: 'svd', far: 'svd_far', spreadHip: 0.05, spreadAds: 0.0004, kick: 0.034, reload: [2.6, 3.0], adsFov: 22 },
  saiga: { name: 'Сайга-12', mag: 8, reserve: 40, rate: 0.26, auto: false, pellets: 9, dmg: 22, force: 9, snd: 'saiga', far: 'saiga_far', spreadHip: 0.065, spreadAds: 0.05, kick: 0.032, reload: [2.6, 3.0] },
  rpg: { name: 'РПГ-7', mag: 1, reserve: 3, rate: 1.0, auto: false, launcher: true, kind: 'rpg', dmg: 0, force: 0, snd: 'rocket', spreadHip: 0, spreadAds: 0, kick: 0.035, reload: [2.8, 2.8] },
  igla: { name: '9K38 «Игла»', mag: 1, reserve: 1, rate: 1.2, auto: false, launcher: true, dmg: 0, force: 0, snd: 'rocket', spreadHip: 0, spreadAds: 0, kick: 0.03, reload: [3.0, 3.0] },
};
// underbarrels: toggled with X on a primary that carries one; ammo lives in WP.ub
const UBDEF = {
  gl: { name: 'M203 榴弹', mag: 1, reserve: 3, rate: 0.6, auto: false, gl: true, dmg: 0, force: 0, snd: 'gl', spreadHip: 0, spreadAds: 0, kick: 0.03, reload: [2.1, 2.1], ub: true },
  gp: { name: 'ГП-25 榴弹', mag: 1, reserve: 3, rate: 0.6, auto: false, gl: true, dmg: 0, force: 0, snd: 'gl', spreadHip: 0, spreadAds: 0, kick: 0.03, reload: [2.2, 2.2], ub: true },
  shotgun: { name: 'M26 霰弹', mag: 4, reserve: 8, rate: 0.75, auto: false, pellets: 8, dmg: 21, force: 8, snd: 'ubsg', spreadHip: 0.06, spreadAds: 0.045, kick: 0.03, reload: [2.2, 2.6], ub: true },
};
// default attachments (starting M4 has a red dot; rack weapons are plain) and plausible random sets for drops
const ATT0 = { m4: { optic: 'reddot', under: null }, ak12: { optic: 'reddot', under: null }, svd: { optic: 'pso', under: null } };
const NOATT = { optic: 'iron', under: null };
const ROLL = {
  m4: [[['reddot', 4], ['holo', 3], ['x2', 3], ['iron', 1]], [[null, 5], ['gl', 3], ['shotgun', 2]]],
  ak: [[['iron', 5], ['reddot', 2], ['holo', 1], ['x2', 2]], [[null, 6], ['gl', 4]]],
  ak12: [[['reddot', 3], ['holo', 3], ['x2', 3], ['iron', 1]], [[null, 5], ['gl', 3], ['shotgun', 2]]],
  smg: [[['iron', 5], ['reddot', 3], ['holo', 2]], [[null, 1]]],
  saiga: [[['iron', 6], ['reddot', 2], ['holo', 2]], [[null, 1]]],
};
function wpick(list) { let t = 0; for (const [, w] of list) t += w; let r = Math.random() * t; for (const [v, w] of list) if ((r -= w) <= 0) return v; return list[0][0]; }
export function rollAtt(key) {
  const R = ROLL[key]; if (!R) return { ...(ATT0[key] || NOATT) };
  return { optic: wpick(R[0]), under: wpick(R[1]) };
}
G.rollAtt = rollAtt;

export function initWeapon() {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 10);
  scene.add(cam);
  WP.scene = scene; WP.cam = cam;
  WP.hemi = new THREE.HemisphereLight(0xdde6ef, 0x5d636a, 0.55); scene.add(WP.hemi);
  WP.sun = new THREE.DirectionalLight(0xfff1e2, 1.6); scene.add(WP.sun); scene.add(WP.sun.target);
  WP.fill = new THREE.PointLight(0xbcd2ff, 0.25, 1.6, 2); WP.fill.position.set(-0.28, 0.26, 0.5); cam.add(WP.fill);
  WP.flashLight = new THREE.PointLight(0xffb060, 0, 2.5, 2); scene.add(WP.flashLight);
  const root = new THREE.Group(); cam.add(root);
  WP.root = root;
  VM = vmMats();
  WP.models = { m4: buildM4(), ak: buildAK({ ub: true }), ak12: buildAK({ rail: true, ub: true }), smg: buildSMG(), pistol: buildPistol(), igla: buildIgla(), rpg: buildIgla(true), pkm: buildAK({ ext: 0.16, barrel: 0.015, muzR: 0.02, mag: 'can', bipod: true, shroud: true }), svd: buildAK({ ext: 0.24, barrel: 0.009, mag: 'short', scope: true }), saiga: buildAK({ ext: -0.06, barrel: 0.016, muzR: 0.022, mag: 'box' }) };
  for (const m of Object.values(WP.models)) { m.g.visible = false; root.add(m.g); }
  WP.attm = buildAttachments(VM); cam.add(WP.attm.scope);
  WP.throwArm = buildThrowArm(); WP.throwArm.pivot.visible = false; cam.add(WP.throwArm.pivot);
  WP.knife = buildKnifeArm(); WP.knife.pivot.visible = false; cam.add(WP.knife.pivot);
  // muzzle flash
  const fmat = new THREE.MeshBasicMaterial({ map: TEX.flash, color: new THREE.Color(6, 3.6, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const fm = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fmat); fm.add(p1);
  for (let k = 0; k < 2; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.11), fmat); p.rotation.set(0, H, k * H); p.position.z = -0.08; fm.add(p); }
  fm.visible = false; WP.flash = fm;
  // shells
  WP.shells = [];
  const sg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.035, 8); sg.rotateZ(H);
  const sm = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 1, roughness: 0.32 });
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; scene.add(m); WP.shells.push({ m, v: new THREE.Vector3(), t: 9 }); }
  WP.shellI = 0;
  Object.assign(WP, {
    cur: 'm4', st: {}, cool: 0, reloadT: -1, reloadDur: 2.3, flashT: 0, kick: 0,
    swayX: 0, swayY: 0, sprintT: 0, adsT: 0, shotN: 0, bloom: 0, hidden: false,
    heat: 0, overheated: false, dCool: 0, sw: null, throwT: -1, nades: 3, meleeT: -1, togT: -1, ubOn: false, tb: null,
  });
  resetWeapons();
  equip(WP.prim, true);
  // ammo/reserve follow the active mode: the underbarrel's rounds while it is selected
  const ubA = () => WP.ubOn && WP.ub && WP.cur === WP.prim;
  Object.defineProperty(WP, 'ammo', { get: () => (ubA() ? WP.ub.ammo : WP.st[WP.cur].ammo), set: (v) => { if (ubA()) WP.ub.ammo = v; else WP.st[WP.cur].ammo = v; } });
  Object.defineProperty(WP, 'reserve', { get: () => (ubA() ? WP.ub.reserve : WP.st[WP.cur].reserve), set: (v) => { if (ubA()) WP.ub.reserve = v; else WP.st[WP.cur].reserve = v; } });
}

export function resetWeapons() {
  // every level starts with the Delta loadout: M4A1 (red dot) + M1911; enemy guns (AK, PKM, ...) are picked up from the dead
  WP.st = { m4: { ammo: DEF.m4.mag, reserve: DEF.m4.reserve }, pistol: { ammo: DEF.pistol.mag, reserve: DEF.pistol.reserve } };
  for (const k of Object.keys(DEF)) if (!WP.st[k]) WP.st[k] = { ammo: 0, reserve: 0 };
  WP.att = { m4: { ...ATT0.m4 } }; WP.ub = null; WP.ubOn = false; WP.togT = -1; WP.tb = null;
  WP.hasIgla = false; WP.prim = 'm4'; WP.launch = null;
  WP.nades = 3; WP.reloadT = -1; WP.sw = null; WP.throwT = -1; WP.meleeT = -1; WP.heat = 0; WP.overheated = false;
  if (WP.models) equip(WP.prim, true);
}
// the active weapon definition (the underbarrel's while it is selected)
export function curDef() { return WP.ubOn && WP.ub && WP.cur === WP.prim ? WP.ub.def : DEF[WP.cur]; }
export function attOf(id) { return WP.att[id] || ATT0[id] || NOATT; }
// ADS field of view of the current weapon (optic magnification)
export function adsFov() { const m = WP.m; return m && m.adsFov && WP.cur === WP.prim ? m.adsFov : DEF[WP.cur].adsFov || 54; }

function equip(id, instant) {
  for (const [k, m] of Object.entries(WP.models)) m.g.visible = k === id;
  WP.cur = id; WP.m = WP.models[id];
  if (WP.attm && WP.m.mount !== undefined) fitAttachments(WP.attm, WP.m, attOf(id));
  WP.m.g.add(WP.flash); WP.flash.position.copy(WP.m.muzzle);
  if (!instant) play('magin', { vol: 0.35, rev: 0 });
}
export function giveIgla() { WP.hasIgla = true; WP.launch = 'igla'; WP.st.igla = { ammo: 1, reserve: 2 }; switchTo('igla'); }
export const WDEF = DEF;
// pick up / swap a weapon: long guns replace the primary slot (with their attachments), launchers the third slot
export function giveWeapon(id, ammo, reserve, att) {
  const D = DEF[id]; if (!D) return;
  WP.st[id] = { ammo: ammo ?? D.mag, reserve: reserve ?? D.reserve };
  if (D.launcher) { WP.launch = id; if (id === 'igla') WP.hasIgla = true; }
  else if (id !== 'pistol') {
    WP.prim = id; WP.att[id] = { ...(att || ATT0[id] || NOATT) };
    const m = WP.models[id], u = WP.att[id].under && m.ubm ? WP.att[id].under : null;
    WP.att[id].under = u;
    WP.ub = u ? { kind: u, def: UBDEF[u === 'gl' && m.ak ? 'gp' : u], ammo: UBDEF[u].mag, reserve: UBDEF[u].reserve } : null;
    WP.ubOn = false;
    if (WP.cur === id) equip(id, true); // same model, new attachments
  }
  WP.sw = null; switchTo(id);
}
export function switchTo(id) {
  if (!id) return;
  if (DEF[id].launcher && WP.launch !== id) return;
  if (!DEF[id].launcher && id !== 'pistol' && id !== WP.prim) return;
  if (id === WP.cur && !WP.sw) return;
  if (WP.sw && WP.sw.to === id) return;
  WP.reloadT = -1; WP.ubOn = false; WP.togT = -1;
  WP.sw = { t: 0, to: id, swapped: false };
  play('rustle', { vol: 0.25, rev: 0 });
}
// X: switch between the rifle and its underbarrel
export function toggleUB() {
  if (!WP.ub || WP.cur !== WP.prim || WP.sw || WP.throwT >= 0 || WP.meleeT >= 0 || WP.togT >= 0) return false;
  WP.reloadT = -1; WP.togT = 0; WP.togDone = false;
  play('rustle', { vol: 0.3, rev: 0, rate: 1.5 }); play('dry', { vol: 0.35, rev: 0, rate: 0.7, delay: 0.12 });
  return true;
}
export function busy() { return !!WP.sw || WP.throwT >= 0 || WP.reloadT >= 0 || WP.meleeT >= 0 || WP.togT >= 0; }

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _mz = new THREE.Vector3();

function hitResult(hit, dir, dmg, force) {
  if (!hit) return 0;
  const e = hit.ent;
  if (e && e.hurt) {
    G.stats.hits++;
    const killed = e.hurt(dmg, dir, hit.part, hit.joint, { force, point: hit.point });
    G.fx.impact(hit.point, hit.normal, e.faction ? 'flesh' : 'metal');
    if (e.faction === 'us') return 0;
    if (e.faction || e.isSled || e.isHind) play(killed ? 'kill' : 'hit', { vol: 0.45, rev: 0, noSlow: true });
    return killed ? 2 : 1;
  }
  G.fx.impact(hit.point, hit.normal, hit.mat);
  if (hit.box && (hit.mat === 'metal' || hit.mat === 'wood')) G.fx.decal(hit.point, hit.normal, hit.mat === 'metal' ? 0.07 : 0.09);
  const mt = hit.mat === 'metal' ? 'metal' : 'soft';
  if (Math.random() < 0.5) play(mt === 'metal' && Math.random() < 0.25 ? 'ricochet' : mt, { pos: hit.point, vol: 0.5, ref: 3 });
  return 0;
}

export function muzzleWorld(out) {
  const cam = G.camera, a = WP.adsT, ub = WP.ubOn && WP.cur === WP.prim;
  _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
  _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
  cam.getWorldDirection(_d);
  return out.copy(cam.position).addScaledVector(_d, WP.cur === 'pistol' ? 0.45 : WP.cur === 'igla' ? 1.2 : ub ? 0.6 : 0.75).addScaledVector(_r, lerp(0.12, 0, a)).addScaledVector(_u, lerp(-0.12, -0.06, a) - (ub ? 0.07 : 0));
}

export function fireWeapon(player) {
  const W = WP, D = curDef();
  if (D.launcher || D.gl) {
    W.ammo--; W.cool = D.rate; W.kick = D.gl ? 1.2 : 1.6;
    const cam = G.camera; cam.getWorldDirection(_d);
    muzzleWorld(_mz);
    if (D.gl) { // 40 mm grenade: slow round on a ballistic arc, explodes on impact once armed
      _d.addScaledVector(_u, 0.035).normalize();
      fireGL(_mz.clone(), _d.clone().multiplyScalar(44).add(_o.set(player.vel.x, 0, player.vel.z + (player.carryZ || 0))));
      player.recoil(D.kick, (Math.random() - 0.5) * 0.01); player.addShake(0.12);
      W.flashT = 0.03; gunShot('gl', { self: true, vol: 0.9 });
      G.fx.alpha.spawn(_mz.x, _mz.y, _mz.z, 0, 0.3, 0, { life: 1.0, size: 0.12, grow: 4, c: [0.85, 0.85, 0.85], alpha: 0.35, wind: 0.6 });
      if (G.onPlayerShot) G.onPlayerShot(cam.position, _d);
      return;
    }
    if (D.kind === 'rpg') fireRocket(_mz.clone(), _d.clone().add(_r.set(rr(-0.012, 0.012), rr(-0.008, 0.012), rr(-0.012, 0.012))).normalize(), { speed: 62, owner: 'player' });
    else if (G.onLaunch) G.onLaunch(_mz.clone(), _d.clone());
    player.recoil(D.kick, 0); player.addShake(0.25);
    G.fx.alpha.spawn(_mz.x, _mz.y, _mz.z, 0, 0.5, 0, { life: 1.6, size: 0.5, grow: 5, c: [0.85, 0.85, 0.85], alpha: 0.5, wind: 0.6 });
    const back = _o.copy(cam.position).addScaledVector(_d, -1.2);
    for (let i = 0; i < 6; i++) G.fx.alpha.spawn(back.x, back.y, back.z, -_d.x * 6 + (Math.random() - 0.5) * 2, 0.5, -_d.z * 6 + (Math.random() - 0.5) * 2, { life: 1.4, size: 0.6, grow: 4, c: [0.8, 0.8, 0.8], alpha: 0.45, wind: 0.6 });
    play('rocket', { vol: 1.2, rev: 0.3, prio: true });
    return;
  }
  W.ammo--; W.cool = D.rate; W.shotN++; G.stats.shots++;
  const cam = G.camera;
  cam.getWorldDirection(_d);
  const spread = lerp(D.spreadHip, D.spreadAds, W.adsT) + W.bloom * lerp(0.03, 0.006, W.adsT) + (player.moving ? lerp(0.02, 0.006, W.adsT) : 0);
  _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const base = _o.copy(_d);
  let hit = null, best = 0;
  for (let k = 0; k < (D.pellets || 1); k++) {
    _d.copy(base);
    const a = Math.random() * 6.28, m = Math.sqrt(Math.random()) * spread;
    _d.addScaledVector(_r, Math.cos(a) * m).addScaledVector(_u, Math.sin(a) * m).normalize();
    const h = raycast(cam.position, _d, D.pellets ? 120 : 500, null, { factionSkip: 'us', noCorpse: true });
    const res = hitResult(h, _d, D.dmg, D.force);
    best = Math.max(best, res); if (!hit) hit = h;
  }
  if (best && G.hud) G.hud.hitmarker(best === 2);
  muzzleWorld(_mz);
  const end = hit ? hit.point : _o.copy(cam.position).addScaledVector(_d, 300);
  if (D.tracer && W.shotN % D.tracer === 0) G.fx.tracer(_mz, end, { start: 2.5, width: 0.022 });
  G.fx.alpha.spawn(_mz.x, _mz.y, _mz.z, 0, 0.4, 0, { life: 0.6, size: 0.05, grow: 6, c: [0.8, 0.8, 0.8], alpha: 0.18, wind: 0.8 });
  G.fx.flash(_mz, 0xffb060, 9, 7, 0.05);
  W.flashT = 0.045; W.kick = Math.min(1.6, W.kick + (W.cur === 'pistol' ? 1.3 : 1)); W.bloom = Math.min(1, W.bloom + 0.18);
  player.recoil(D.kick + Math.random() * 0.004 * (1 - W.adsT * 0.5), (Math.random() - 0.5) * 0.007);
  gunShot(D.snd, { self: true, vol: D.ub ? 0.8 : W.cur === 'pistol' ? 0.78 : 0.86 });
  if (D.ub) play('pump', { vol: 0.4, rev: 0, delay: 0.32 }); else ejectShell();
  if (G.onPlayerShot) G.onPlayerShot(cam.position, _d);
}
export const fireRifle = fireWeapon;

export function fireDShK(player) {
  const W = WP, Dk = T.dshk;
  W.dCool = 0.095; G.stats.shots++; W.shotN++;
  W.heat = Math.min(1, W.heat + 0.032);
  if (W.heat >= 1) { W.overheated = true; play('dry', { vol: 0.7 }); }
  const cam = G.camera;
  cam.getWorldDirection(_d);
  const spread = 0.006 + W.bloom * 0.006;
  _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const a = Math.random() * 6.28, m = Math.sqrt(Math.random()) * spread;
  _d.addScaledVector(_r, Math.cos(a) * m).addScaledVector(_u, Math.sin(a) * m).normalize();
  const hit = raycast(cam.position, _d, 900, null, { factionSkip: 'us', noCorpse: true });
  const res = hitResult(hit, _d, 110, 16);
  if (res && G.hud) G.hud.hitmarker(res === 2);
  Dk.pitch.localToWorld(_mz.copy(Dk.muzzleLocal));
  const end = hit ? hit.point : _o.copy(cam.position).addScaledVector(_d, 600);
  if (W.shotN % 2 === 0) G.fx.tracer(_mz, end, { start: 1, width: 0.045, speed: 520, len: 5 });
  G.fx.muzzle(_mz, _d, 2.2);
  G.fx.flash(_mz, 0xffa050, 26, 12, 0.06);
  W.bloom = Math.min(1, W.bloom + 0.12);
  player.recoil(0.006 + Math.random() * 0.004, (Math.random() - 0.5) * 0.008);
  player.addShake(0.05);
  play('dshk', { vol: 1, rev: 0.45, prio: true });
}

export function startReload() {
  const D = curDef();
  if (busy() || WP.ammo >= D.mag || WP.reserve <= 0) return;
  WP.reloadT = 0; WP.reloadEmpty = WP.ammo === 0; WP.reloadDur = D.reload[WP.reloadEmpty ? 1 : 0];
  WP.rsnd = 0;
}

export function startMelee() {
  if (WP.meleeT >= 0 || WP.throwT >= 0 || WP.sw) return false;
  WP.reloadT = -1; WP.meleeT = 0; WP.meleeHit = false;
  play('rustle', { vol: 0.5, rev: 0, rate: 1.4 });
  return true;
}

export function startThrow() {
  if (WP.nades <= 0 || WP.throwT >= 0 || WP.sw || WP.meleeT >= 0) return false;
  WP.reloadT = -1; WP.throwT = 0; WP.thrown = false; WP.tb = null; WP.tbK = 1; WP.togT = -1;
  play('pin', { vol: 0.6, rev: 0 });
  return true;
}
// G near a live enemy grenade: snatch it (it keeps burning) and lob it back on a quicker version of the throw
export function startThrowBack(n) {
  if (WP.throwT >= 0 || WP.sw || WP.meleeT >= 0) return false;
  WP.reloadT = -1; WP.throwT = 0; WP.thrown = false; WP.tb = n; WP.tbK = 1.75; WP.togT = -1;
  n.held = true; n.owner = 'player'; n.warned = true; n.g.visible = false;
  play('rustle', { vol: 0.6, rev: 0, rate: 1.6 }); play('clink', { vol: 0.35, rev: 0, rate: 0.8 });
  return true;
}

function ejectShell() {
  const s = WP.shells[WP.shellI]; WP.shellI = (WP.shellI + 1) % WP.shells.length;
  s.t = 0; s.m.visible = true;
  WP.m.g.updateMatrixWorld(true);
  WP.m.g.localToWorld(s.m.position.copy(WP.m.eject));
  s.v.set(rr(0.9, 1.6), rr(0.7, 1.3), rr(0.1, 0.5));
  s.m.rotation.set(rr(0, 3), rr(0, 3), 0);
}

export function updateViewmodel(dt, p) {
  const W = WP, cam = WP.cam; let mdl = W.m;
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  W.sun.position.set(-0.45, 1, 0.35).applyQuaternion(G.camera.quaternion.clone().invert()).multiplyScalar(5);
  W.cool = Math.max(0, W.cool - dt); W.dCool = Math.max(0, W.dCool - dt);
  W.bloom = damp(W.bloom, 0, 5, dt);
  W.heat = Math.max(0, W.heat - dt * (W.overheated ? 0.32 : 0.22));
  if (W.overheated && W.heat < 0.35) W.overheated = false;
  const ads = W.adsT, spr = W.sprintT;
  W.kick = damp(W.kick, 0, 14, dt);
  W.swayX = damp(W.swayX, clamp(-p.lookDX * 0.0009, -0.04, 0.04), 8, dt);
  W.swayY = damp(W.swayY, clamp(p.lookDY * 0.0009, -0.04, 0.04), 8, dt);
  const bobA = p.bobAmt * (1 - ads * 0.85);
  const bx = Math.sin(p.bobPhase * Math.PI * 2) * 0.012 * bobA, by = -Math.abs(Math.cos(p.bobPhase * Math.PI * 2)) * 0.012 * bobA;
  const breathe = Math.sin(G.real * 1.6) * 0.0015 * (1 - ads * 0.7);
  const hip = mdl.hip, ad = [0, -mdl.sightY, mdl.adsZ - mdl.rearZ], sp = mdl.sprint;
  W.ubK = damp(W.ubK || 0, W.ubOn && W.cur === W.prim ? 1 : 0, 10, dt);
  const ubh = mdl.ub && W.cur === W.prim ? 1 - ads : 0;                    // hip carry raised a little so the launcher shows
  let x = lerp(hip[0], ad[0], ads) - ubh * 0.012, y = lerp(hip[1], ad[1], ads) + ubh * (0.028 + W.ubK * 0.012), z = lerp(hip[2], ad[2], ads);
  x = lerp(x, sp[0], spr); y = lerp(y, sp[1], spr); z = lerp(z, sp[2], spr);
  let rx = spr * -0.3, ry = spr * 0.62, rz = spr * 0.32 + W.ubK * 0.12 * (1 - ads * 0.6);
  // weapon switch: lower, swap, raise
  if (W.sw) {
    W.sw.t += dt;
    const t = W.sw.t, low = t < 0.24 ? smooth(t / 0.24) : 1 - smooth((t - 0.24) / 0.3);
    if (!W.sw.swapped && t >= 0.24) { W.sw.swapped = true; equip(W.sw.to); mdl = W.m; }
    y -= low * 0.32; rx -= low * 0.6; rz += low * 0.3;
    if (t >= 0.54) W.sw = null;
  }
  // grenade throw: weapon drops away, left arm winds up overhand and lobs (throw-back: the same motion, 1.75x faster,
  // starting from the hand coming up off the floor with the enemy grenade)
  const TA = W.throwArm;
  TA.pivot.visible = false;
  if (W.throwT >= 0) {
    W.throwT += dt;
    const t = W.throwT * (W.tbK || 1);
    const low = keys([[0, 0], [0.12, 1], [0.55, 1], [0.85, 0]], t);
    y -= low * 0.3; rx -= low * 0.55; x += low * 0.08; rz -= low * 0.25;
    TA.pivot.visible = t < 0.66;
    // hand path: rise into view, wind up high-left, whip forward, follow through down
    aimArm(TA.pivot, keysV([[0, [-0.2, -0.32, 0.1]], [0.3, [-0.23, -0.25, 0.14]], [0.45, [-0.16, -0.3, 0.06]]], t),
      keysV([[0, [-0.18, -0.62, -0.3]], [0.12, [-0.15, -0.2, -0.42]], [0.2, [-0.17, -0.17, -0.41]], [0.32, [-0.26, -0.02, -0.33]],
        [0.4, [-0.05, 0.03, -0.56]], [0.52, [0.05, -0.3, -0.45]], [0.66, [0.0, -0.66, -0.3]]], t),
      keys([[0, 0.2], [0.2, 0.35], [0.32, 0.6], [0.42, -0.15], [0.6, -0.3]], t), 0.5);
    TA.nade.visible = !W.thrown && (W.tbK === 1 || t > 0.06);
    if (!W.thrown && t >= 0.37) {
      W.thrown = true;
      if (W.tb) { const n = W.tb; W.tb = null; if (n.held && G.onThrowBack) G.onThrowBack(n); }
      else { W.nades--; if (G.onThrow) G.onThrow(); }
      play('rustle', { vol: 0.6, rev: 0, rate: 1.3 }); p.recoil(-0.012, 0); p.fovKick = 2;
    }
    if (t >= 0.85) { W.throwT = -1; W.tb = null; }
  }
  // underbarrel toggle: cant the rifle, thumb the selector
  if (W.togT >= 0) {
    W.togT += dt; const k = Math.sin(Math.min(1, W.togT / 0.34) * Math.PI);
    rz -= k * 0.22; y -= k * 0.035; rx += k * 0.08;
    if (!W.togDone && W.togT > 0.17) { W.togDone = true; W.ubOn = !W.ubOn; if (G.hud) G.hud._bk = null; }
    if (W.togT >= 0.34) W.togT = -1;
  }
  // melee: knife slash across the screen
  const KA = W.knife;
  KA.pivot.visible = false;
  if (W.meleeT >= 0) {
    W.meleeT += dt;
    const t = W.meleeT;
    const low = keys([[0, 0], [0.08, 1], [0.38, 1], [0.6, 0]], t);
    y -= low * 0.3; rx -= low * 0.5; x -= low * 0.05;
    KA.pivot.visible = t < 0.42;
    aimArm(KA.pivot, [0.24, -0.3, 0.1],
      keysV([[0, [0.3, -0.58, -0.25]], [0.07, [0.29, -0.0, -0.38]], [0.13, [0.02, -0.07, -0.56]], [0.22, [-0.28, -0.22, -0.4]], [0.4, [-0.2, -0.62, -0.25]]], t),
      keys([[0, -0.9], [0.07, -1.25], [0.2, -1.45], [0.4, -1.6]], t), 0.48);
    if (!W.meleeHit && t >= 0.13) { W.meleeHit = true; if (G.onMelee) G.onMelee(); }
    if (t >= 0.62) W.meleeT = -1;
  }
  // reload animation
  let magY = 0, magVis = true;
  if (W.reloadT >= 0) {
    W.reloadT += dt;
    const t = W.reloadT, D = W.reloadDur, k = D / 2.3;
    const tilt = Math.sin(Math.min(1, t / D) * Math.PI);
    rz += tilt * 0.55; rx += tilt * 0.18; y -= tilt * 0.04; x -= tilt * 0.02;
    if (W.ubOn && W.cur === W.prim) { rz -= tilt * 0.75; rx += tilt * 0.1; } // underbarrel: roll the other way, breech up; rifle mag stays
    else if (t > 0.35 * k && t < 1.0 * k) { magY = -Math.min(1, (t - 0.35 * k) / (0.3 * k)) * 0.35; if (t > 0.7 * k) magVis = false; }
    else if (t >= 1.0 * k && t < 1.4 * k) magY = -(1 - (t - 1.0 * k) / (0.4 * k)) * 0.2;
    if (W.rsnd === 0 && t > 0.35 * k) { W.rsnd = 1; play('magout', { vol: 0.6, rev: 0.1 }); }
    if (W.rsnd === 1 && t > 1.35 * k) { W.rsnd = 2; play('magin', { vol: 0.7, rev: 0.1 }); }
    if (W.rsnd === 2 && W.reloadEmpty && t > 1.75 * k) { W.rsnd = 3; play('bolt', { vol: 0.6, rev: 0.1 }); rx -= 0.1; }
    if (t >= D) {
      const need = curDef().mag - W.ammo, take = Math.min(need, W.reserve);
      W.ammo += take; W.reserve -= take; W.reloadT = -1;
    }
  }
  mdl.mag.position.y = (mdl.magY0 || 0) + magY; mdl.mag.visible = magVis;
  rz -= (p.leanOff || 0) * 0.3; x += (p.leanOff || 0) * 0.02;                // lean: a little extra cant
  // 2x scope at full ADS: hide the gun, show the eyepiece view (it sways with the gun)
  const sv = mdl.optic === 'x2' && W.cur === W.prim && W.adsT > 0.86 && !busy() && !W.hidden;
  mdl.g.visible = !sv; W.attm.scope.visible = sv;
  if (sv) W.attm.scope.position.set(W.swayX * 0.5 + bx * 0.3, W.swayY * 0.5 + by * 0.3 + breathe, W.kick * 0.01);
  if (W.inspect) { const q = W.inspect; x = q[3]; y = q[4]; z = q[5]; rx = q[0]; ry = q[1]; rz = q[2]; } // test hook: fixed pose
  { const ub = W.ubOn && W.cur === W.prim && mdl.ub; if (W._fub !== ub) { W._fub = ub; W.flash.position.copy(ub ? mdl.ubMuzzle : mdl.muzzle); } }
  const kz = W.cur === 'pistol' ? 0.045 : 0.035, kr = W.cur === 'pistol' ? 0.09 : 0.045;
  mdl.g.position.set(x + W.swayX + bx, y + W.swayY + by + breathe, z + W.kick * kz);
  mdl.g.rotation.set(rx + W.kick * kr + W.swayY * 0.6, ry + W.swayX * 0.8, rz + W.swayX * 0.5);
  W.root.visible = !W.hidden;
  W.flashT -= dt;
  W.flash.visible = W.flashT > 0 && !W.hidden;
  if (W.flash.visible) { W.flash.rotation.z = Math.random() * 6.28; W.flash.scale.setScalar(rr(0.8, 1.3) * (W.cur === 'pistol' ? 0.6 : 1)); }
  W.flashLight.position.set(x, y + 0.05, z - 0.6); W.flashLight.intensity = W.flash.visible ? 3 : 0;
  for (const s of W.shells) {
    if (s.t > 0.8) { s.m.visible = false; continue; }
    s.t += dt; s.v.y -= 9 * dt;
    s.m.position.addScaledVector(s.v, dt);
    s.m.rotation.x += dt * 14; s.m.rotation.y += dt * 9;
  }
}

export function renderViewmodel(renderer) {
  renderer.clearDepth();
  renderer.render(WP.scene, WP.cam);
}

// test hooks (headless checks in tools/test_weapons.py)
if (typeof window !== 'undefined') window.__wpn = { giveWeapon, curDef, adsFov, toggleUB, rollAtt, GL, DEF, UBDEF, throwNade };
