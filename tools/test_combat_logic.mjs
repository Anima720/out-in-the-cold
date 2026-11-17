// CPU-only contract checks using the real game modules. No DOM, browser, audio device or WebGL is initialized.
// Only texture inputs and visual outputs are replaced; vehicle budget tests replace model creation callbacks; this is NOT a browser regression or visual approval.
// Run: node tools/test_combat_logic.mjs
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ stdin: { resolveDir: root, contents: `
  export * from './src/combat.js';
  export {G,THREE,reseed} from './src/core.js';
  export {Human,initHumans,clearHumans,J,MS,MD,GK} from './src/humans.js';
  export {Raider,mateCustom,route,ENTRY,INSIDE} from './src/raider.js';
  export {Mate} from './src/ai.js';
  export {addBox,moveChar} from './src/physics.js';
  export {P} from './src/player.js';
  export {TX} from './src/mats.js';
  export {S} from './src/station.js';
  export {D} from './src/director.js';
  export {WDEF,rollAtt} from './src/weapon.js';
  export {assaultEvents,updateAssault,sendJuggernauts,clearAssault} from './src/assault.js';
  export {HUD} from './src/hud.js';
` }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'warning' });
// Expose the game's own debug hooks; this does not emulate a browser.
globalThis.window = {};
const game = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const { G, THREE, TX, P, S, D, AI, TOK, J, MS, MD, WDEF, Raider, Mate, initHumans, clearHumans,
  addBox, enemyMelee, mateMelee, mateCustom, mateYield, shootAt, shootAtPlayer, enemyFire, setLoadout, reseed, route, ENTRY, INSIDE, assaultEvents, updateAssault, sendJuggernauts, clearAssault, HUD } = game;
const { A: assault, aliveN } = window.__assault();
HUD.setThreat = () => {}; // visual marker output only
const dt = 1 / 60, v = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
TX.camoRU = TX.camoUS = { map: null, normalMap: null, orm: null };
G.scene = new THREE.Scene(); G.groundFn = () => 0;
initHumans();
const shots = []; let expectedMuzzle = null, checkedMuzzles = 0, pools = 0;
G.fx = {
  impact() {}, decal() {}, flash() {}, tracer() {},
  bloodPool() { pools++; },
  muzzle(pos, dir) {
    assert.ok(Number.isFinite(pos.x+pos.y+pos.z+dir.x+dir.y+dir.z), 'finite shot coordinates');
    shots.push({ pos: pos.clone(), dir: dir.clone() });
    if (expectedMuzzle) { assert.ok(pos.distanceTo(expectedMuzzle)<1e-9, 'shot begins at the real weapon muzzle'); checkedMuzzles++; }
  },
};
function playerAt(x,y,z) { P.pos.set(x,y,z); P.eye.set(x,y+1.62,z); P.chest.set(x,y+1.1,z); }
function reset() {
  clearAssault(); assault.t=assault.jt=0;
  clearHumans(); G.enemies.length=0; G.mates.length=0; G.boxes.length=0; G.sleds.length=0; S.cover.length=0;
  G.t=0; G.dt=dt; G.v=0; G.state='play'; G.lvl=5; G.hind=null; G.hud=null;
  P.health=100; P.alive=true; P.god=false; P.shield=false; P.mounted=false; P.moving=P.sprinting=P.crouched=false; P.vel.set(0,0,0);
  playerAt(17,0,22); D.cur={id:'logic-fixture'}; D.q.length=0; G.resetCombat?.();
  AI.forceDown=1; AI.stats.downs=AI.stats.bleedOuts=0; shots.length=0; pools=0; expectedMuzzle=null;
  reseed(76543);
}
function enemy(x=17,z=12, options={}) {
  const e=new Raider(x,z,{wk:'ak',maxTier:0,...options});
  e.h.pos.y=0; e.h.yaw=Math.PI; e.h.aim.set(0,0,1); e.h.aimTarget=1; e.h.animate(dt);
  return e;
}
function mate(x,z) { const m=new Mate('TRUCK','head_truck',[0,0]); m.h.pos.set(x,0,z); m.h.aim.set(0,0,-1); m.h.animate(dt); return m; }
function advance(e, seconds, ai=e.update.bind(e)) {
  for(let i=0;i<Math.round(seconds/dt);i++) { G.t+=dt; ai(dt); e.h.update(dt); }
}
const results=[];
function test(name, fn) {
  reset(); fn(); results.push(name); console.log('PASS',name);
}
try {
  test('loadouts have matching weapon drops, actual attachments and distinct third-person models',()=>{
    const kinds=new Set();
    for(const key of ['ak','ak12','smg','saiga','svd','pkm','rpg']) {
      const e=enemy(17,12,{wk:key,rpg:key==='rpg'}); kinds.add(e.h.gunKind);
      assert.equal(e.wk,key); assert.equal(e.h.dropWeapon,key); assert.ok(WDEF[e.h.dropWeapon]);
      assert.ok(e.h.dropAtt && typeof e.h.dropAtt.optic==='string');
      assert.ok(['iron','reddot','holo','x2','pso'].includes(e.h.dropAtt.optic));
      if(['smg','saiga','svd','pkm','rpg'].includes(key)) assert.equal(e.h.dropAtt.under,null);
      assert.ok(e.h.j.every(p=>Number.isFinite(p.x+p.y+p.z)));
    }
    assert.ok(kinds.size>=6);
  });
  test('downed stays alive/in enemy list, fires from pistol muzzle, and dies inside 10–15 seconds',()=>{
    const e=enemy(17,12,{wk:'smg'}), dir=v(0,0,-1);
    e.h.hurt(110,dir,'torso',J.P,{bullet:true});
    assert.ok(e.downed && e.h.downed && e.h.alive && G.enemies.includes(e));
    assert.equal(e.h.sidearm,1); assert.ok(e.h.dropM); assert.equal(e.h.dropWeapon,'smg');
    const deadline=e.bleedT; assert.ok(deadline>=10 && deadline<=15); e.crawlLeft=0;
    let frames=0;
    while(e.h.alive && frames<Math.ceil(16/dt)) {
      expectedMuzzle=e.h.j[J.W1].clone(); G.t+=dt; e.update(dt); expectedMuzzle=null; e.h.update(dt); frames++;
    }
    const elapsed=frames*dt;
    assert.ok(elapsed>=10-dt && elapsed<=15+dt,`elapsed=${elapsed}`);
    assert.ok(shots.length>0,'downed pistol fired'); assert.ok(pools>0); assert.ok(!e.h.alive && e.h.rag);
    assert.equal(AI.stats.bleedOuts,1); console.log('  bleedOutSeconds',elapsed.toFixed(3),'shots',shots.length);
  });
  test('finishing shot kills a downed enemy, head/blast/melee and dismount actors cannot go down',()=>{
    const e=enemy(); e.h.hurt(110,v(0,0,-1),'torso',J.P,{bullet:true}); advance(e,1);
    assert.ok(e.downed); e.h.hurt(34,v(0,0,-1),'torso',J.P,{bullet:true}); assert.ok(!e.h.alive);
    for(const [part,op] of [['head',{bullet:true}],['torso',{force:14}],['torso',{melee:true}]]) {
      const x=enemy(); x.h.hurt(110,v(0,0,-1),part,J.P,op); assert.ok(!x.h.alive && !x.downed);
    }
    const rider=enemy(); rider.ride={st:'jump'}; rider.h.hurt(110,v(0,0,-1),'torso',J.P,{bullet:true}); assert.ok(!rider.h.alive && !rider.downed);
    const landed=enemy(); landed.ride={st:'done'}; landed.h.hurt(110,v(0,0,-1),'torso',J.P,{bullet:true}); assert.ok(landed.downed);
  });
  test('enemy melee winds up then damages at the strike frame once; walls/fences/heights block it',()=>{
    const e=enemy(17,20.6); assert.equal(enemyMelee(e,dt),true); assert.equal(P.health,100);
    advance(e,MS-dt, t=>enemyMelee(e,t)); assert.equal(P.health,100);
    advance(e,3*dt,t=>enemyMelee(e,t)); assert.ok(P.health<100); const hp=P.health;
    advance(e,0.2,t=>enemyMelee(e,t)); assert.equal(P.health,hp,'one hit per swing');
    for(const tag of ['', 'fence']) {
      e.mel=null; e.meleeCD=0; e.h.meleeT=-1; P.health=100;
      G.boxes.length=0; addBox(16,0,21.1,18,2,21.3,'metal',tag);
      assert.equal(enemyMelee(e,dt),false); assert.equal(P.health,100);
    }
    G.boxes.length=0; e.meleeCD=0; playerAt(17,3,22); assert.equal(enemyMelee(e,dt),false);
  });
  test('enemy and Juggernaut melee recheck obstruction and height when the blow lands',()=>{
    for(const jugg of [false,true]) for(const barrier of ['wall','height']) {
      clearHumans(); G.enemies.length=0; G.boxes.length=0; P.health=100; playerAt(17,0,22);
      const e=enemy(17,20.6,{jugg}); assert.equal(enemyMelee(e,dt),true);
      if(barrier==='wall') addBox(16,0,21.1,18,2,21.3,'metal'); else playerAt(17,3,22);
      advance(e,MS+0.08,t=>enemyMelee(e,t)); assert.equal(P.health,100,`${jugg}/${barrier}`);
    }
  });
  test('mate melee has delayed damage and checks walls, fences and height on start and strike',()=>{
    playerAt(40,0,40); const m=mate(17,22), e=enemy(17,20.6);
    for(const tag of ['', 'fence']) {
      G.boxes.length=0; addBox(16,0,21.1,18,2,21.3,'metal',tag); m.meleeCD=0;
      assert.equal(mateMelee(m,dt),false); assert.equal(e.h.hp,100);
    }
    G.boxes.length=0; e.h.pos.y=3; m.meleeCD=0; assert.equal(mateMelee(m,dt),false); e.h.pos.y=0;
    m.meleeCD=0; assert.equal(mateMelee(m,dt),true); assert.equal(e.h.hp,100);
    for(let i=0;i<20;i++){mateMelee(m,dt);m.h.update(dt);} assert.equal(e.h.hp,100);
    addBox(16,0,21.1,18,2,21.3,'metal');
    for(let i=0;i<40;i++){mateMelee(m,dt);m.h.update(dt);} assert.equal(e.h.hp,100);
    G.boxes.length=0; m.meleeCD=0; m.mel=null; m.h.meleeT=-1; assert.equal(mateMelee(m,dt),true);
    for(let i=0;i<30;i++){mateMelee(m,dt);m.h.update(dt);} assert.ok(!e.h.alive);
  });
  test('train/arbitrary shooter muzzle vectors remain unchanged after hit, miss and lethal callbacks',()=>{
    const mz=v(17,1.3,12), saved=mz.clone();
    expectedMuzzle=saved; shootAtPlayer(mz,{pBase:0,dmg:1}); shootAtPlayer(mz,{pBase:1,dmg:1}); expectedMuzzle=null;
    assert.deepEqual(mz.toArray(),saved.toArray());
    // A lethal torso hit invokes Human.hurt -> tryDown, which also has vector scratch buffers.
    const e=enemy(17,15); e.h.hp=1; const target=e.h.j[J.P].clone();
    const from=target.clone().add(v(0,0,4)), direction=target.clone().sub(from).normalize();
    expectedMuzzle=from.clone(); shootAt(null,from,target,{dmg:20,spread:0,hitChance:1}); expectedMuzzle=null;
    assert.ok(e.downed,'real raycast hit the torso and invoked downing');
    assert.ok(shots.at(-1).dir.distanceTo(direction)<1e-9,'lethal callback preserved flash direction');
  });
  test('mate return-to-post is one movement step, and absent optional attachment hook is safe',()=>{
    playerAt(40,0,40); const m=mate(17,22); m.p5='idle'; m.home=v(20,0,22); m.yT=0;
    const before=m.h.pos.clone(); mateCustom(m)(dt);
    assert.ok(Math.abs(m.h.pos.distanceTo(before)-1.6*dt)<1e-6,'one 1.6 m/s step, not two');
    const original=G.rollAtt; G.rollAtt=undefined; const e=enemy(); setLoadout(e,'saiga'); assert.equal(e.h.dropAtt,null); G.rollAtt=original;
  });
  test('scripted mate kneel/look, idle, console and each defend stance turn with finite poses',()=>{
    for(const [name,setup,want] of [
      ['kneel/look',m=>{m.p5='kneel';m.look=v(23,0,22);},-Math.PI/2],
      ['idle',m=>{m.p5='idle';m.yaw0=0.75;},0.75],
      ['console',m=>{m.p5='console';},Math.PI/2],
      ['defend/reload',m=>{m.p5='defend';m.yaw0=-0.8;m.reloadT=10;},-0.8],
      ['defend/crouch',m=>{m.p5='defend';m.yaw0=1.2;m.cs='crouch';m.ct=10;},1.2],
      ['defend/peek',m=>{m.p5='defend';m.yaw0=-0.5;m.cs='peek';m.ct=1;},-0.5],
    ]) {
      reset(); playerAt(40,0,40); const m=mate(17,22); setup(m); const update=mateCustom(m);
      update(dt); m.h.update(dt);
      assert.ok(Number.isFinite(m.h.yaw),`${name}: finite first turn`);
      assert.ok(Math.abs(want-m.h.yaw)<Math.abs(want),`${name}: starts turning toward target`);
      assert.ok(Math.abs(m.h.yaw)<=4*dt+1e-9,`${name}: rotation uses the frame interval`);
      for(let i=0;i<90;i++) {
        G.t+=dt; update(dt); m.h.update(dt);
        assert.ok(Number.isFinite(m.h.yaw),`${name}: finite rotation`);
        assert.ok(m.h.j.every(p=>Number.isFinite(p.x+p.y+p.z)),`${name}: finite animated pose`);
      }
      assert.ok(Math.abs(m.h.yaw-want)<1e-9,`${name}: faces the target`);
      if(m.look) assert.ok(v(-Math.sin(m.h.yaw),0,-Math.cos(m.h.yaw)).dot(m.look.clone().sub(m.h.pos).setY(0).normalize())>0.999999,'kneeling mate faces the look point');
    }
  });
  test('attack-token state resets cleanly across checkpoints',()=>{
    const e=enemy(); G.t=20; assert.ok(game.requestToken(e)); assert.equal(TOK.n,1);
    G.resetCombat?.(); assert.equal(TOK.n,0); assert.equal(TOK.last,-9); assert.equal(AI.stillT,0);
  });
  test('all 11 fence lanes route both ways, including south/new breaches and the three wide-north lanes',()=>{
    const expected=[[-3,-34,-3,-26.5],[0,-34,0,-26.5],[3,-34,3,-26.5],[-20.5,-34,-20.5,-26.5],
      [0,30,0,22.5],[-34,-12.5,-26.5,-12.5],[-34,4.5,-26.5,4.5],[-34,19.5,-26.5,19.5],
      [34,-27.5,26.5,-27.5],[34,-4.5,26.5,-4.5],[34,15.5,26.5,15.5]];
    assert.equal(ENTRY.length,expected.length); assert.equal(ENTRY,G.stationEntries?.(),'route and geometry use the shared definition');
    for(const [ox,oz,ix,iz] of expected) {
      const e=ENTRY.find(x=>x.o[0]===ox&&x.o[1]===oz&&x.i[0]===ix&&x.i[1]===iz); assert.ok(e,`gateway ${ox},${oz}`);
      assert.ok(!INSIDE(ox,oz)&&INSIDE(ix,iz));
      const normal=v(ix-ox,0,iz-oz).normalize();
      const out=v(ox,0,oz).addScaledVector(normal,-6), inside=v(ix,0,iz).addScaledVector(normal,2);
      for(const [from,to,a,b] of [[out,inside,e.o,e.i],[inside,out,e.i,e.o]]) {
        const points=route(from,to); assert.deepEqual(points.at(-1),{x:to.x,z:to.z});
        assert.ok(points.some(p=>p.x===b[0]&&p.z===b[1]),`crossed selected gateway ${ox},${oz}`);
        assert.deepEqual(points[0],{x:a[0],z:a[1]},'approach the lane from either side');
        // The crossing segment stays on the lane's centre, with no detour to an old unrelated gap.
        assert.ok(points.length<=3);
      }
    }
  });
  test('near-gap routes align before crossing; fence intersections leave space for the character radius',()=>{
    // Independent level boundary fixture: intersect path segments with both faces of each 0.12 m fence.
    // This checks route geometry, not a browser character's steering or real-time collision response.
    const fences=[
      {name:'north',axis:'z',at:-30,lo:-30,hi:30,gaps:[[-5,5],[-22,-19]]},
      {name:'south',axis:'z',at:26,lo:-30,hi:30,gaps:[[-3,3]]},
      {name:'west',axis:'x',at:-30,lo:-30,hi:26,gaps:[[-14,-11],[3,6],[18,21]]},
      {name:'east',axis:'x',at:30,lo:-30,hi:26,gaps:[[-29,-26],[-6,-3],[14,17]]},
    ];
    function fenceClear(points,label) {
      for(let i=1;i<points.length;i++)for(const f of fences)for(const skin of [-0.06,0.06]) {
        const a=points[i-1],b=points[i],other=f.axis==='x'?'z':'x',delta=b[f.axis]-a[f.axis];
        if(Math.abs(delta)<1e-12)continue;
        const t=(f.at+skin-a[f.axis])/delta;
        if(t<0||t>1)continue;
        const u=a[other]+(b[other]-a[other])*t;
        if(u<f.lo||u>f.hi)continue;
        assert.ok(f.gaps.some(([lo,hi])=>u>=lo+0.3&&u<=hi-0.3),`${label}: segment ${i} clips ${f.name} fence at ${u.toFixed(3)}`);
      }
    }
    // A positive control: the former omitted-waypoint shortcut really intersects the east fence.
    assert.throws(()=>fenceClear([{x:31,z:-25},{x:26.5,z:-27.5}],'old shortcut'),/clips east fence/);
    const cases=[
      ['reported corner',v(31,0,-25),v(20,0,-27.5),[34,-27.5]],
      ['reported corner reverse',v(20,0,-27.5),v(31,0,-25),[26.5,-27.5]],
    ];
    for(const [side,z] of [[-1,4.5],[-1,19.5],[1,15.5],[1,-27.5]])for(const offset of [-2,2]) {
      cases.push([`near outside ${side}/${z}/${offset}`,v(side*31,0,z+offset),v(side*20,0,z),[side*34,z]]);
      cases.push([`near inside ${side}/${z}/${offset}`,v(side*29,0,z+offset),v(side*40,0,z),[side*26.5,z]]);
    }
    for(const [name,from,to,approach] of cases) {
      const points=route(from,to);
      assert.deepEqual(points[0],{x:approach[0],z:approach[1]},`${name}: align at the selected gap before crossing`);
      assert.deepEqual(points.at(-1),{x:to.x,z:to.z});
      fenceClear([from,...points],name);
    }
  });
  test('whole passenger batches reserve capacity: full/one-short waits, exact fit spawns atomically',()=>{
    for(const [flag,up,size] of [['as_suv1',20,3],['as_truck1',28,5],['as_sleds1',42,4],['as_sleds2',0,4]]) {
      reset(); const p5={as_init:true,up,ph:flag==='as_sleds2'?'igla':'defend'};
      assaultEvents(p5); const entry=assault.q.find(e=>e[0]===flag); assert.ok(entry); assert.equal(entry[4],size);
      let batches=0;
      // Keep the real event metadata and budget path; replace only expensive vehicle model creation.
      assault.q=[entry.slice()]; assault.q[0][3]=()=>{batches++;for(let i=0;i<size;i++){const e=enemy(17+i,12);e.h.sit={};}};
      for(let i=0;i<16;i++){const e=enemy(17+i,8);if(i%2)e.h.sit={};}
      updateAssault(dt,p5); assert.equal(batches,0); assert.equal(aliveN(),16); assert.equal(assault.q.length,1);
      for(let i=0;i<size-1;i++)G.enemies[i].h.alive=false;
      updateAssault(4,p5); assert.equal(batches,0); assert.equal(aliveN(),17-size,'one place too few must not partly unload');
      G.enemies[size-1].h.alive=false;
      updateAssault(dt,p5); assert.equal(batches,1); assert.equal(aliveN(),16); assert.equal(assault.q.length,0);
      updateAssault(4,p5); assert.equal(batches,1);
    }
  });
  test('waiting Juggernauts obey the cap, have priority and stay at least 13 seconds apart after a delay',()=>{
    const p5={as_init:true,up:20,ph:'defend'}; assaultEvents(p5); const event=assault.q[0].slice(); let vehicles=0;
    event[3]=()=>{vehicles++;for(let i=0;i<3;i++)enemy(17+i,12);}; assault.q=[event];
    for(let i=0;i<16;i++)enemy(17+i,8);
    sendJuggernauts(); updateAssault(40,p5); assert.equal(assault.juggs.length,0); assert.equal(aliveN(),16); assert.equal(vehicles,0);
    // Free enough slots for every pending heavy at once. The delayed queue must still stagger them.
    for(let i=0;i<3;i++)G.enemies[i].h.alive=false;
    updateAssault(dt,p5); assert.equal(assault.juggs.length,1); assert.equal(aliveN(),14); assert.equal(vehicles,0);
    updateAssault(12.9,p5); assert.equal(assault.juggs.length,1);
    updateAssault(0.11,p5); assert.equal(assault.juggs.length,2); assert.equal(aliveN(),15);
    updateAssault(12.9,p5); assert.equal(assault.juggs.length,2);
    updateAssault(0.11,p5); assert.equal(assault.juggs.length,3); assert.equal(aliveN(),16); assert.equal(vehicles,0);
    assert.equal(assault.jq.length,0); assert.equal(assault.q.length,1);
  });
  console.log(JSON.stringify({status:'PASS',cases:results.length,checkedMuzzles,scope:'CPU state contracts only; no DOM, WebGL, browser or screenshots'},null,2));
} catch (err) {
  console.error('FAIL after',results.length,'cases:',err.message);
  // Avoid printing a multi-megabyte data-URL stack from the in-memory bundle.
  process.exitCode=1;
} finally { clearHumans(); }
