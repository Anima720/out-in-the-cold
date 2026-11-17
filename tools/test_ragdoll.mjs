// CPU regression for the actual station colliders, Human pose, and Ragdoll solver; no browser/WebGL.
// Only canvas drawing and static scenery meshes are replaced. Collision construction is unchanged.
// node tools/test_ragdoll.mjs [--sweep]   (four reproduced failures; --sweep checks seeds 1..50)
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=await build({stdin:{resolveDir:root,contents:`
  export {G,THREE,reseed,mulberry32} from './src/core.js';
  export {Human,initHumans,J,clearHumans} from './src/humans.js';
  export {Raider} from './src/raider.js';
  export {TX,M} from './src/mats.js';
  export {S,buildStation,stationColliders,ground5} from './src/station.js';
  export {W} from './src/world.js';
  export {Builder} from './src/geom.js';
  export {D} from './src/director.js';
`},bundle:true,write:false,format:'esm',platform:'node',logLevel:'warning'});
const {G,THREE,reseed,mulberry32,Human,initHumans,J,clearHumans,Raider,TX,M,buildStation,stationColliders,ground5,W,Builder,D}=
  await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const draw=()=>{}, ctx=new Proxy({}, {get:(o,k)=>o[k]??draw,set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>ctx};}};
TX.camoRU=TX.camoUS={map:null,normalMap:null,orm:null};
G.scene=new THREE.Scene();G.groundFn=ground5;G.state='play';G.lvl=5;G.v=0;G.hud=null;
G.fx={impact(){},decal(){},flash(){},tracer(){},muzzle(){}};D.cur={id:'ragdoll-fixture'};
initHumans();
M.steel=new THREE.MeshStandardMaterial();
W.mat={snow:M.steel,tree:M.steel,scrub:M.steel};
W.geo={tree1:new THREE.BoxGeometry(1,1,1),tree2:new THREE.BoxGeometry(1,1,1),scrub:new THREE.BoxGeometry(1,1,1)};
for(const key of Object.getOwnPropertyNames(Builder.prototype))if(key!=='constructor')Builder.prototype[key]=function(){return this;};
buildStation();stationColliders();
console.log('Actual station collision boxes:',G.boxes.length);
const originalRandom=Math.random, dt=1/60;
// Same positions, movement and impulses as playtest_assault.py --part 3. Seed Human.phase as well as core RNG.
const pts=[[0,-4.5,0,-1],[-4.6,-4.5,0,-1],[7.4,0,1,0],[-7.4,0.2,-1,0],[0,4.6,0,1],[0.5,5,0,1],
  [-0.5,5.6,0,1],[3.3,1.9,0,1],[-7,-2,-1,0],[6.5,3.2,1,0],[-6.2,4,-1,1],[1.5,-1.5,1,1]];
const seeds=process.argv.includes('--sweep')?Array.from({length:50},(_,i)=>i+1):[4,5,19,36];
let latestSleep=0;
try {
  for(const seed of seeds) {
    clearHumans();G.enemies.length=0;Math.random=mulberry32(seed);reseed(5005);
    const actors=pts.map(([x,z,dx,dz])=>{
      const r=new Raider(x,z,{});r.h.pos.y=Math.abs(x)<8.2&&Math.abs(z)<5.2?0.15:0;
      r.h.vel.set(dx*4.3,0,dz*4.3);r.dir=[dx,dz];return r;
    });
    for(let f=0;f<7;f++)for(const r of actors)r.h.update(dt);
    for(const [i,r] of actors.entries()) {
      const h=r.h;
      for(let k=0;k<3;k++){h.pos.x+=r.dir[0]*0.07;h.pos.z+=r.dir[1]*0.07;h.animate(dt);}
      h.lastDt=dt;h.hurt(500,new THREE.Vector3(r.dir[0],0.15,r.dir[1]).normalize(),i%3?'torso':'head',J.P,{force:7});
      assert.ok(!h.alive&&h.rag,`seed ${seed}: corpse fixture is a real ragdoll`);
    }
    const last=actors.map(r=>r.h.j.map(p=>p.clone())), sleepAt=Array(actors.length).fill(null);
    let maxMotion=0;
    for(let f=1;f<=2400;f++) {
      for(const [i,r] of actors.entries()) {
        const was=r.h.rag.asleep;r.h.update(dt);
        if(!was&&r.h.rag.asleep)sleepAt[i]=f*dt;
      }
      if(f>=960&&f%120===0)for(const [i,r] of actors.entries())for(const [k,p] of r.h.j.entries()) {
        if(f>960)maxMotion=Math.max(maxMotion,p.distanceTo(last[i][k]));
        last[i][k].copy(p);
      }
    }
    assert.ok(+maxMotion.toFixed(3)<0.003,`seed ${seed}: 16–40 s joint motion ${maxMotion} m`);
    assert.ok(actors.every(r=>r.h.rag.asleep),`seed ${seed}: all corpses asleep after 40 s`);
    const latest=Math.max(...sleepAt.map(t=>t??40));latestSleep=Math.max(latestSleep,latest);
    console.log(`PASS seed ${seed}: 12 corpses, latest sleep ${latest.toFixed(3)} s, late motion ${maxMotion.toFixed(6)} m`);
  }
  // A high fall must keep integrating in the air; support, rather than age, enables rest.
  clearHumans();G.enemies.length=0;
  const h=new Human('ru');h.pos.set(20,15,20);h.animate(dt);h.die(null,J.P,0);
  const initial=h.j[J.P].y;
  for(let f=0;f<45;f++){h.update(dt);assert.equal(h.rag.asleep,false,'airborne corpse must not sleep');}
  assert.ok(h.j[J.P].y>5&&h.j[J.P].y<initial-1,'airborne body keeps falling');
  for(let f=0;f<1200&&!h.rag.asleep;f++)h.update(dt);
  assert.ok(h.rag.asleep,'the fallen body settles after landing');
  const before=h.j.map(p=>p.clone());
  for(let f=0;f<120;f++)h.update(dt);
  assert.ok(h.j.every((p,i)=>p.distanceTo(before[i])===0),'sleeping body remains exactly still');
  h.rag.impulse(J.P,new THREE.Vector3(1,0.3,0).normalize(),4);
  assert.equal(h.rag.asleep,false,'new impulse wakes a sleeping body');
  for(let f=0;f<30;f++)h.update(dt);
  assert.ok(h.j.some((p,i)=>p.distanceTo(before[i])>0.03),'a new impulse actually moves the body');
  console.log('PASS airborne motion, exact sleep stability, and impulse wake-up');
  console.log(JSON.stringify({status:'PASS',seeds:seeds.length,latestSleep:+latestSleep.toFixed(3),scope:'CPU pose/collision/solver only; no browser or visual approval'}));
} catch(err) {
  console.error('FAIL',err.message);process.exitCode=1;
} finally { Math.random=originalRandom;clearHumans(); }
