// Post-processing chain: MSAA scene -> GTAO (world only) -> viewmodel -> bloom -> tone map -> film grade.
// Pipeline layout follows wquguru/fable52-fps-repro (MIT).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G } from './core.js';

export const PP = { composer: null, noAO: [] };

class ScenePass extends Pass {
  constructor(samples) {
    super();
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    this.fsq = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { t: { value: this.rt.texture } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }',
    }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(r, writeBuffer) {
    r.setRenderTarget(this.rt); r.clear(); r.render(G.scene, G.camera);
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(r);
  }
}

class ViewmodelPass extends Pass {
  constructor(get) { super(); this.needsSwap = false; this.get = get; }
  render(r, writeBuffer, readBuffer) {
    const v = this.get(); if (!v) return;
    r.setRenderTarget(readBuffer);
    const ac = r.autoClear; r.autoClear = false; r.clearDepth();
    r.render(v.scene, v.cam);
    r.autoClear = ac;
  }
}

const FILM = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uLow: { value: 0 }, uSlow: { value: 0 }, uCA: { value: 0.3 }, uGrain: { value: 0.04 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uLow, uSlow, uCA, uGrain; varying vec2 vUv;
    float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      vec2 c = vUv - .5; float r2 = dot(c, c); vec2 o = c * r2 * uCA * .022 * (1.0 + uSlow * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = mix(col, col * vec3(.9, .98, 1.08), (1.0 - l) * .6);      // cold shadows
      col = mix(col, col * vec3(1.04, 1.0, .96), l * .35);             // faintly warm highlights
      col = mix(vec3(l), col, .92 - uLow * .5 - uSlow * .35);          // slight desaturation (more when hurt / slow-mo)
      col = col * col * (3.0 - 2.0 * col) * .3 + col * .7;            // gentle S-curve
      col *= 1.0 - smoothstep(.16, .85, r2) * (.42 + uSlow * .3);      // vignette
      col += (h(gl_FragCoord.xy + fract(uT) * 917.0) - .5) * uGrain * (1.0 - l * .6);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function initPost(renderer, Q, getVM) {
  const pr = renderer.getPixelRatio();
  const w = innerWidth, h = innerHeight;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType }));
  composer.setPixelRatio(pr); composer.setSize(w, h);
  PP.scene = new ScenePass(Q.msaa || 0); composer.addPass(PP.scene);
  PP.gtao = new GTAOPass(G.scene, G.camera, w, h);
  { const ss = PP.gtao.setSize.bind(PP.gtao); PP.gtao.setSize = (a, b) => ss(Math.ceil(a * 0.5), Math.ceil(b * 0.5)); PP.gtao.setSize(w * pr, h * pr); }
  PP.gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.4, scale: 1.1, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
  PP.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 12 });
  PP.gtao.blendIntensity = 0.9;
  { const ov = PP.gtao.overrideVisibility.bind(PP.gtao); PP.gtao.overrideVisibility = function () { ov(); for (const o of PP.noAO) o.visible = false; }; }
  composer.addPass(PP.gtao);
  PP.vm = new ViewmodelPass(getVM); composer.addPass(PP.vm);
  PP.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.36, 0.6, 1.0);
  composer.addPass(PP.bloom);
  composer.addPass(new OutputPass());
  PP.film = new ShaderPass(FILM); composer.addPass(PP.film);
  PP.composer = composer;
  applyPost(Q);
  return PP;
}

export function applyPost(Q) {
  if (!PP.composer) return;
  PP.gtao.enabled = !!Q.ao;
  PP.bloom.enabled = !!Q.bloom;
  PP.film.uniforms.uGrain.value = Q.name === 'low' ? 0.02 : 0.04;
  if (PP.scene.rt.samples !== (Q.msaa || 0)) { PP.scene.rt.dispose(); PP.scene.rt.samples = Q.msaa || 0; }
}

export function resizePost(renderer) {
  if (!PP.composer) return;
  PP.composer.setPixelRatio(renderer.getPixelRatio());
  PP.composer.setSize(innerWidth, innerHeight);
}

export function renderPost(dt, low, slow) {
  const u = PP.film.uniforms;
  u.uT.value += dt; u.uLow.value = low; u.uSlow.value = slow;
  PP.composer.render(dt);
}
