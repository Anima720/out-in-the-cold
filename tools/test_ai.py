# AI package (v7 #4/#14) logic checks, one page load, 480x270 q=low god=1:
#  - train ck 1: 60 s, mates' kills, downed/melee/loadout stats, no stuck enemies
#  - station ck 5: 60 s, % of time enemies spend in cover / moving / shooting, mates' kills, stuck check
#  - surface ck 20 (after the cage ride): 40 s, flank / suppression / retreat counters
#  - downed: forced down -> pistol fire -> bleed out; finished off by a second hit
#  - melee: enemy on the player (damage with god off), mate on an enemy
# usage: timeout 900 python3 tools/test_ai.py [phases...]   (phases: train station surface downed melee contracts fence mine)
import asyncio, json, sys, os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
PH = sys.argv[1:] or ["downed", "melee", "contracts", "fence", "train", "station", "surface"]
from playwright.async_api import async_playwright
from runtime import CHROME, assert_clean

SAMPLE = """(()=>{const P=__P, S=window.__ais||(window.__ais={n:0,cover:0,move:0,shoot:0,other:0,down:0,stuck:0,last:new Map(),stuckIds:new Set()});
 for(const e of __G.enemies){ if(!e.h.alive||e.jugg||e.kind==='gunner'||e.active===false) continue; S.n++;
  if(e.downed){S.down++;continue}
  const st=e.state; const atSpot=e.spot?Math.hypot(e.h.pos.x-e.spot.x,e.h.pos.z-e.spot.z)<1.2:(e.kind==='c');
  if((st==='cover'||st==='throw')&&e.h.crouch>0.6&&atSpot) S.cover++; else if(st==='advance'||st==='move'||st==='rush') S.move++; else if(st==='aim'||st==='fire'||st==='supp'||st==='aimM'||st==='fireM') S.shoot++; else S.other++;
  const L=S.last.get(e); const p=e.h.pos;
  if(L&&(st==='advance'||st==='rush')&&L.st===st){ if(Math.hypot(p.x-L.x,p.z-L.z)<0.4){L.t+=1; if(L.t>=8&&!S.stuckIds.has(e)){S.stuck++;S.stuckIds.add(e); console.log('STUCK',st,p.x.toFixed(1),p.z.toFixed(1),e.wk)}} else {L.x=p.x;L.z=p.z;L.t=0} }
  else S.last.set(e,{x:p.x,z:p.z,t:0,st});
 } return 0})()"""
REPORT = """JSON.stringify({n:__ais.n, cover:+(__ais.cover/Math.max(1,__ais.n-__ais.down)).toFixed(2), move:+(__ais.move/Math.max(1,__ais.n-__ais.down)).toFixed(2), shoot:+(__ais.shoot/Math.max(1,__ais.n-__ais.down)).toFixed(2), other:+(__ais.other/Math.max(1,__ais.n-__ais.down)).toFixed(2), stuck:__ais.stuck,
  stats:__ai.stats, mates:__G.mates.map(m=>[m.name[0], m.p5||m.mode, m.cs, +m.h.pos.x.toFixed(1), +m.h.pos.z.toFixed(1)]), alive:__G.enemies.filter(e=>e.h.alive).length, total:__G.enemies.length, kills:__G.stats.kills, err:window.__errors.slice(0,3)})"""
RESET = "window.__ais=null; __ai.stats.mateKills={}; __ai.stats.mateShots={}; __ai.stats.mateHit={}; __ai.stats.downs=0; __ai.stats.bleedOuts=0; __ai.stats.flanks=0; __ai.stats.retreats=0; __ai.stats.supp=0; __ai.stats.nades=0; __ai.stats.melee={enemy:0,enemyHits:0,mate:0,mateKills:0}; __ai.stats.loadouts={}"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":480,"height":270})
        logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:600]))
        pg.on("console", lambda m: logs.append(m.type+": "+m.text[:300]) if m.type in ('error','log') else None)
        await pg.goto(DIST + "?q=low&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev=pg.evaluate
        # hold the render loop: only __sim advances the game (queue every held rAF callback)
        await ev("""(()=>{const raf=window.requestAnimationFrame.bind(window); window.__raf=raf; window.__rafHold=true;
          window.__pend=[]; window.requestAnimationFrame=(cb)=>{ if(window.__rafHold){ window.__pend.push(cb); return 0; } return raf(cb); }; })()""")
        await ev("window.__mk=(x,z,o)=>new window.__Raider(x,z,o||{})")
        async def sim(sec, step=1):
            t=0
            while t < sec:
                await ev(f"__sim({step})"); await ev(SAMPLE); t+=step
        def show(tag, r): print(tag, r, flush=True)

        if "downed" in PH:
            await ev("__begin(4)"); await ev("__sim(0.5)")
            # a raider 9 m in front of the player, forced down by a bullet hit
            r = await ev("""(()=>{ __ai.forceDown=1; const R=__G.enemies; __P.pos.set(-3,__P.pos.y,30); __P.yaw=0; __sim(0.1);
              window.__mk=(x,z,o)=>{ const e=new (window.__Raider)(x,z,o||{}); return e; }; return typeof window.__Raider })()""")
            show("raider ctor", r)
            r = await ev("""(()=>{ const e=__mk(-3,21,{maxTier:0}); e.update=()=>{}; __sim(0.5); e.update=e.constructor.prototype.update;
              e.h.hurt(150,new __THREE.Vector3(0,0,-1),'torso',2,{bullet:true}); __ai.forceDown=undefined; window.__dn=e;
              return JSON.stringify({downed:e.downed, hdown:e.h.downed, alive:e.h.alive, hp:e.h.hp, gk:e.h.gunKind, drop:e.h.dropWeapon}) })()""")
            show("down", r)
            dr=json.loads(r); assert dr["downed"] and dr["hdown"] and dr["alive"] and dr["hp"]>0, dr
            await ev("__sim(2.5)")
            r = await ev("JSON.stringify({aim:+__dn.h.aimT.toFixed(2), tg:__dn.dtg===__P?'P':__dn.dtg?__dn.dtg.name:null, alive:__dn.h.alive, P5y:+__dn.h.j[0].y.toFixed(2), pel:+__dn.h.j[2].y.toFixed(2), pool:__dn.pooled})")
            show("downed 3s", r)
            dr=json.loads(r); assert dr["alive"] and dr["pool"], dr
            hp0 = await ev("__P.god=false; __P.health=100; 0")
            await ev("__sim(6)")
            r = await ev("JSON.stringify({health:__P.health, alive:__dn.h.alive, bleed:+__dn.bleedT.toFixed(1)})"); show("after 6s fire (god off)", r)
            await ev("__P.god=true; __P.health=100")
            await ev("__sim(6.5)")
            r = await ev("JSON.stringify({alive:__dn.h.alive, rag:!!__dn.h.rag, bleedOuts:__ai.stats.bleedOuts})"); show("bled out", r)
            assert not json.loads(r)["alive"] and json.loads(r)["bleedOuts"]>0, r
            # second one: finished off by another hit
            r = await ev("""(()=>{ __ai.forceDown=1; const e=__mk(-1,22,{maxTier:0}); e.update=()=>{}; __sim(0.4); e.update=e.constructor.prototype.update;
              e.h.hurt(150,new __THREE.Vector3(0.3,0,-1).normalize(),'torso',2,{point:e.h.j[2].clone()}); __ai.forceDown=undefined; __sim(1.5);
              const d1=e.downed&&e.h.alive; e.h.hurt(34,new __THREE.Vector3(0,0,-1),'torso',2,{point:e.h.j[2].clone()}); __sim(0.5);
              return JSON.stringify({wasDown:d1, alive:e.h.alive}) })()""")
            show("finish off", r)
            assert json.loads(r)["wasDown"] and not json.loads(r)["alive"], r
            # non-eligible: headshot / explosion / melee never down
            r = await ev("""(()=>{ __ai.forceDown=1; const out=[]; for(const [part,o] of [['head',{bullet:true}],['torso',{force:14}],['torso',{melee:true}]]){ const e=__mk(2,18,{maxTier:0}); e.update=()=>{}; __sim(0.2); e.h.hurt(300,new __THREE.Vector3(0,0,-1),part,2,o); out.push(e.downed?'DOWN':'dead'); }
              __ai.forceDown=undefined; return out.join(',') })()""")
            show("head/blast/melee", r)
            assert r=="dead,dead,dead", r
            print("errors:", await ev("window.__errors.slice(0,3)"))

        if "melee" in PH:
            await ev("__begin(4)"); await ev("__sim(0.5)")
            r = await ev("""(()=>{ __P.pos.set(-3,0,30); __P.yaw=0; __P.god=false; __P.health=100; __sim(0.1);
              const y=__G.groundFn?__G.groundFn(-3,28.6):0; const e=__mk(-3,28.6,{maxTier:0}); e.h.pos.y=y; e.state='cover'; e.coverT=99; e.t=0.5; __sim(0.05);
              let mel=false, hit=false, minH=100; for(let i=0;i<90;i++){ __sim(1/60); if(e.mel) mel=true; minH=Math.min(minH,__P.health); }
              const r={startedMelee:mel, kind:e.h.meleeKind, health:Math.round(minH), enemyMeleeStats:__ai.stats.melee};
              __P.god=true; __P.health=100; e.h.die(new __THREE.Vector3(0,0,-1),2,3); return JSON.stringify(r) })()""")
            show("enemy melee on player", r)
            assert json.loads(r)["startedMelee"] and json.loads(r)["health"]<100, r
            r = await ev("""(()=>{ const m=__G.mates[0]; m.p5='defend'; m.cs='peek'; m.ct=3; __P.pos.set(m.h.pos.x+6,m.h.pos.y,m.h.pos.z+6); __sim(0.1);
              const f=m.h.bodyFwd; const x=m.h.pos.x+f.x*1.3, z=m.h.pos.z+f.z*1.3; const e=__mk(x,z,{maxTier:0}); e.update=()=>{}; __sim(0.05);
              let mel=false; for(let i=0;i<90;i++){ __sim(1/60); if(m.mel) mel=true; }
              return JSON.stringify({mate:m.name, startedMelee:mel, enemyAlive:e.h.alive, stats:__ai.stats.melee}) })()""")
            show("mate melee", r)
            assert json.loads(r)["startedMelee"] and not json.loads(r)["enemyAlive"], r
            print("errors:", await ev("window.__errors.slice(0,3)"))

        if "contracts" in PH:
            await ev("__begin(4); __sim(0.2)")
            # Exercise production AI/animation with a fixed timestep, isolated from story timers and unrelated shooters.
            # Temporary colliders are ordinary Box instances; no combat/LOS/damage method is replaced.
            await ev("""window.__actStep=(a,n=1)=>{for(let i=0;i<n;i++){__G.dt=1/60;__G.t+=1/60;a.update(1/60);a.h.update(1/60);}};
              window.__testPlayer=(x,y,z)=>{__P.pos.set(x,y,z);__P.eye.set(x,y+1.62,z);__P.chest.set(x,y+1.1,z);__P.vel.set(0,0,0);__P.alive=true;__P.mounted=false;__P.health=100;};
              window.__testClear=()=>{for(const e of __G.enemies)e.h.remove();__G.enemies.length=0;for(const m of __G.mates)m.h.hidden=true;__G.resetCombat?.();__P.god=true;};
              window.__testRaider=(x=-3,z=38,o={})=>{const e=__mk(x,z,{wk:'ak',maxTier:0,...o});e.freeSpot();e.path.length=0;e.state=e.jugg?'pause':'cover';e.t=e.coverT=e.repathT=999;e.h.pos.y=__G.groundFn(x,z);e.h.yaw=Math.PI;e.h.aim.set(0,0,1);e.h.aimTarget=1;e.h.firstPose=true;e.h.update(0.1);return e;};""")
            r = await ev("""(()=>{const out=[],Box=__G.boxes[0].constructor,wall=new Box(-4,-0.2,38.6,-2,3.5,38.8,'concrete','ai_test');wall.enabled=false;__G.boxes.push(wall);
              try{for(const kind of ['enemy','mate','jugg'])for(const barrier of ['clear','wall','height'])for(const timing of (barrier==='clear'?['control']:['start','strike'])){
                __testClear();wall.enabled=false;const e=__testRaider(-3,kind==='mate'?39.4:38,{jugg:kind==='jugg'});let a=e,target=__P;
                if(kind==='mate'){a=__G.mates[0];const h=a.h;h.hidden=false;h.pos.set(-3,__G.groundFn(-3,38),38);h.vel.set(0,0,0);h.sit=null;h.grips=null;h.noWeapon=false;h.meleeT=-1;a.mel=null;a.meleeCD=0;a.home=h.pos.clone();a.p5='idle';a.arc=null;h.firstPose=true;h.update(0.1);target=e.h;__testPlayer(12,0,42);}
                else __testPlayer(-3,e.h.pos.y,39.4);
                __P.god=false;const hp0=kind==='mate'?target.hp:target.health;
                const block=()=>{if(barrier==='wall')wall.enabled=true;else if(barrier==='height'){target.pos.y=a.h.pos.y+2;if(target===__P){__P.eye.y=target.pos.y+1.62;__P.chest.y=target.pos.y+1.1;}}};
                if(timing==='start')block();let started=false;
                if(timing!=='start'){for(let i=0;i<24&&!a.mel;i++)__actStep(a);started=!!a.mel;if(!started)throw Error(kind+' did not start clear-path control');while(a.h.meleeT<0.34)__actStep(a);if(timing==='strike')block();}
                let hitFrame=false;for(let i=0;i<(timing==='start'?50:18);i++){__actStep(a);started=started||!!a.mel;hitFrame=hitFrame||!!a.mel?.hit;}
                const hp1=kind==='mate'?target.hp:target.health,ok=barrier==='clear'?started&&hitFrame&&hp1<hp0:timing==='start'?!started&&hp1===hp0:started&&hitFrame&&hp1===hp0;
                out.push({kind,barrier,timing,started,hitFrame,hp0,hp1,ok});if(!ok)throw Error('melee contract '+JSON.stringify(out[out.length-1]));
              }}finally{wall.enabled=false;__G.boxes.splice(__G.boxes.indexOf(wall),1);__P.god=true;__testClear();}return out;})()""")
            show("melee obstruction contracts", r)
            assert len(r)==15 and all(x['ok'] for x in r), r

            # Choose a naturally generated 14.0–14.8 s lifetime from the checkpoint's seeded stream.
            # Never overwrite bleedT/death state; measure from the lethal hit, including both animations.
            await ev("__begin(4); __sim(0.2)")
            r = await ev("""(()=>{__testClear();__testPlayer(-3,0,46);const rnd=Math.random,muzzle=__G.fx.muzzle;let e,shots=0,maxError=0,minNorm=1e9;
              __G.fx.muzzle=function(p,d,s){shots++;maxError=Math.max(maxError,p.distanceTo(e.h.j[16]));minNorm=Math.min(minNorm,p.length());return muzzle.call(this,p,d,s);};
              try{__ai.forceDown=1;Math.random=()=>0.96;for(let i=0;i<64;i++){e=__testRaider();e.h.hurt(e.h.hp+1,new __THREE.Vector3(0,0,-1),'torso',2,{bullet:true});if(e.downed&&e.bleedT>=14&&e.bleedT<=14.8)break;e.h.remove();__G.enemies.splice(__G.enemies.indexOf(e),1);}Math.random=rnd;__ai.forceDown=undefined;
                const down=e.downed&&e.h.downed&&e.h.alive&&__G.enemies.includes(e),life=e.bleedT,start=__G.t;let n=0;
                while(e.h.alive&&n++<894)__actStep(e);
                return {down,life,elapsed:+(__G.t-start).toFixed(6),alive:e.h.alive,shots,maxError,minNorm,rag:!!e.h.rag};
              }finally{Math.random=rnd;__ai.forceDown=undefined;__G.fx.muzzle=muzzle;__P.god=true;}})()""")
            show("downed lifetime and muzzle", r)
            assert r['down'] and 14<=r['life']<=14.8 and not r['alive'] and r['rag'] and r['elapsed']<=14.9, r
            assert r['shots']>0 and r['maxError']<1e-7 and r['minNorm']>10, r

            # Enemy firearm hit/miss and shotgun pellets must not mutate the caller's muzzle vector.
            r = await ev("""(()=>{__testClear();__testPlayer(-3,0,46);const out=[],muzzle=__G.fx.muzzle,rnd=Math.random;let current,shots,maxError,minNorm;
              __G.fx.muzzle=function(p,d,s){shots++;maxError=Math.max(maxError,p.distanceTo(current.h.j[16]));minNorm=Math.min(minNorm,p.length());return muzzle.call(this,p,d,s);};
              try{for(const key of ['ak','ak12','smg','saiga','svd','pkm'])for(const chance of [0,0.99]){current=__testRaider(-3,38,{wk:key});current.state='fire';current.t=0;current.burst=2;current.seen=true;current.losT=999;shots=0;maxError=0;minNorm=1e9;Math.random=()=>chance;__actStep(current);Math.random=rnd;
                out.push({key,chance,shots,maxError,minNorm});current.h.remove();__G.enemies.splice(__G.enemies.indexOf(current),1);}
              }finally{Math.random=rnd;__G.fx.muzzle=muzzle;}return out;})()""")
            show("weapon muzzle contracts", r)
            assert len(r)==12 and all(x['shots']==1 and x['maxError']<1e-7 and x['minNorm']>10 for x in r), r

            r = await ev("""(()=>{__testClear();const out=[],want={ak:'rifle',ak12:'rifle',smg:'smg',saiga:'shotgun',svd:'dmr',pkm:'pkm',rpg:'rpg'};
              for(const [key,gk] of Object.entries(want)){const e=__testRaider(-3,38,{wk:key,rpg:key==='rpg'}),h=e.h,att=JSON.stringify(h.dropAtt);
                h.hurt(h.hp+1,new __THREE.Vector3(0,0,-1),'torso',2,{melee:true});const drop=__G.pickups.find(k=>k.h===h);
                out.push({key,gk:h.gunKind,known:!!__G.weaponDef?.(key),att:h.dropAtt,dead:!h.alive,drop:drop?.w,kept:!!drop&&JSON.stringify(drop.att)===att,model:h.gunKind===gk});h.remove();}
              return out;})()""")
            show("loadout and corpse attachments", r)
            assert len(r)==7 and all(x['known'] and x['dead'] and x['drop']==x['key'] and x['kept'] and x['model'] for x in r), r
            for x in r:
                assert x['att'] and x['att']['optic'] in ('iron','reddot','holo','x2','pso'), x
                assert x['att']['under'] in (None,'gl','shotgun'), x
                assert x['att']['under'] is None or x['key'] in ('ak','ak12'), x
                assert x['att']['optic']!='pso' or x['key']=='svd', x

            # Actual truck script reaches the unseated walking phase. Put both test bodies on the same
            # clear floor before hitting them, so geometry cannot conceal a missing dismount-state guard.
            # The second man must complete the real handover first.
            await ev("__begin(4); __sim(0.2); __testClear(); __testPlayer(12,0,42)")
            r = await ev("""(()=>{const v=__assault().send('truckW',2),a=v.pax[0],b=v.pax[1],dir=new __THREE.Vector3(0,0,-1);let n=0;
              const step=()=>{__G.dt=1/60;__G.t+=1/60;v.update(1/60);for(const e of v.pax){e.update(1/60);e.h.update(1/60);}};
              try{while(a.ride.st!=='walk'&&n++<3600)step();const state=a.ride.st,unseated=!a.h.sit;a.h.pos.set(-3,__G.groundFn(-3,38),38);a.h.firstPose=true;a.h.update(0.1);__ai.forceDown=1;a.h.hurt(a.h.hp+1,dir,'torso',2,{bullet:true});
                const transitDead=!a.h.alive,transitDown=!!a.downed;while(b.ride.st!=='done'&&n++<4200)step();
                const handed=b.ride.st==='done'&&!Object.hasOwn(b,'update')&&!b.h.sit&&!b.h.noCrowd;
                b.h.pos.set(-3,__G.groundFn(-3,38),38);b.h.firstPose=true;b.h.update(0.1);b.h.hurt(b.h.hp+1,dir,'torso',2,{bullet:true});
                return {state,unseated,transitDead,transitDown,handed,downAfterHandover:!!b.downed&&b.h.downed&&b.h.alive};
              }finally{__ai.forceDown=undefined;v.remove();}})()""")
            show("dismount downed exclusion", r)
            assert r['state']=='walk' and r['unseated'] and r['transitDead'] and not r['transitDown'] and r['handed'] and r['downAfterHandover'], r

            await ev("__begin(1); __sim(0.2)")
            r = await ev("""(()=>{const e=__G.enemies.find(x=>x.kind==='c'),rnd=Math.random,muzzle=__G.fx.muzzle;let shots=0,maxError=0,minNorm=1e9;
              for(const m of __G.mates)m.h.hidden=true;__testPlayer(e.h.pos.x,e.h.pos.y,e.h.pos.z+8);__P.god=true;e.active=true;e.state='fire';e.t=0;e.burst=3;e.seen=true;e.losT=999;e.relT=999;e.wantMove=false;e.h.aimTarget=1;e.h.update(0.1);
              __G.fx.muzzle=function(p,d,s){shots++;maxError=Math.max(maxError,p.distanceTo(e.h.j[16]));minNorm=Math.min(minNorm,p.length());return muzzle.call(this,p,d,s);};
              try{for(const chance of [0,0.99]){Math.random=()=>chance;e.t=0;__actStep(e);}return {shots,maxError,minNorm};}finally{Math.random=rnd;__G.fx.muzzle=muzzle;}})()""")
            show("train muzzle contract", r)
            assert r['shots']==2 and r['maxError']<1e-7 and r['minNorm']>5, r
            await assert_clean(pg, logs)

        if "fence" in PH:
            await ev("__begin(5); __sim(0.2)")
            # Isolate walking from waves/shooters, retaining every real station collider. takeSpot
            # calls production route(); each __sim tick runs Raider.update -> walk -> moveChar.
            r=await ev("""(()=>{const G=__G,T=__THREE,level=G.levelUpdate,mates=G.mates.map(m=>[m,m.update,m.h.hidden]),boxes=G.boxes.slice();
              const geometry=JSON.stringify(boxes.map(b=>[b.min.toArray(),b.max.toArray(),b.enabled,b.tag]));
              const expected=[[-3,-34,-3,-26.5],[0,-34,0,-26.5],[3,-34,3,-26.5],[-20.5,-34,-20.5,-26.5],[0,30,0,22.5],
                [-34,-12.5,-26.5,-12.5],[-34,4.5,-26.5,4.5],[-34,19.5,-26.5,19.5],[34,-27.5,26.5,-27.5],[34,-4.5,26.5,-4.5],[34,15.5,26.5,15.5]];
              const entries=G.stationEntries?.();if(!entries||JSON.stringify(entries.map(e=>[...e.o,...e.i]))!==JSON.stringify(expected))throw Error('Missing real station entry');
              if(boxes.filter(b=>b.enabled&&b.tag==='fence').length<4)throw Error('Station fences are not loaded');
              const inside=p=>Math.abs(p.x)<29.8&&p.z>-29.8&&p.z<25.8,cases=[],results=[];let actor;
              const clear=()=>{for(const e of G.enemies){e.freeSpot?.();e.h.remove();}G.enemies.length=0;G.resetCombat?.();};
              const collision=h=>boxes.find(b=>b.enabled&&!b.inv&&b.max.y>h.pos.y+0.005&&b.min.y<h.pos.y+h.h-0.005&&
                h.pos.x+h.r>b.min.x+0.005&&h.pos.x-h.r<b.max.x-0.005&&h.pos.z+h.r>b.min.z+0.005&&h.pos.z-h.r<b.max.z-0.005);
              for(let k=0;k<entries.length;k++){const e=entries[k],dx=e.i[0]-e.o[0],dz=e.i[1]-e.o[1],d=Math.hypot(dx,dz),nx=dx/d,nz=dz/d;
                const out=[e.o[0]-nx*2,e.o[1]-nz*2],inn=[e.i[0]+nx*1.5,e.i[1]+nz*1.5];
                cases.push({name:k+' inward',from:out,to:inn,gate:e.i});cases.push({name:k+' outward',from:inn,to:out,gate:e.o});}
              cases.push({name:'NE corner inward',from:[31,-25],to:[20,-27.5],gate:[26.5,-27.5]},
                {name:'NE corner outward',from:[20,-27.5],to:[31,-25],gate:[34,-27.5]});
              try{clear();G.levelUpdate=()=>{};__D.timers.length=0;__D.q.length=0;
                for(const [m] of mates){m.update=()=>{};m.h.hidden=true;}
                __input.down.clear();__input.pressed.clear();__input.lmb=__input.rmb=false;__P.god=true;__P.pos.set(0,.15,0);__P.vel.set(0,0,0);
                for(const c of cases){clear();actor=new window.__Raider(...c.from,{wk:'ak',maxTier:0});const h=actor.h;
                  actor.takeSpot({x:c.to[0],z:c.to[1],tier:0});h.firstPose=true;h.update(0);const path=actor.path.map(p=>[p.x,p.z]);
                  if(!path.some(p=>p[0]===c.gate[0]&&p[1]===c.gate[1]))throw Error('Wrong routed gate '+JSON.stringify({case:c,path}));
                  const initial=collision(h);if(initial)throw Error('Blocked walking fixture '+JSON.stringify({case:c,box:[initial.min.toArray(),initial.max.toArray(),initial.tag]}));
                  let frames=0,crossings=0,side=inside(h.pos),travel=0,maxStep=0;
                  while(frames<1200&&actor.state==='advance'){const x=h.pos.x,z=h.pos.z;__sim(1/60);frames++;
                    const step=Math.hypot(h.pos.x-x,h.pos.z-z);travel+=step;maxStep=Math.max(maxStep,step);
                    if(!Number.isFinite(step)||step>.16)throw Error('Non-walking displacement '+JSON.stringify({case:c.name,frames,step}));
                    const b=collision(h);if(b)throw Error('Walker penetrated collider '+JSON.stringify({case:c.name,frames,pos:h.pos.toArray(),box:[b.min.toArray(),b.max.toArray(),b.tag]}));
                    const next=inside(h.pos);if(next!==side){crossings++;side=next;}
                  }
                  const distance=Math.hypot(h.pos.x-c.to[0],h.pos.z-c.to[1]),arrived=h.alive&&actor.state==='cover'&&actor.path.length===0&&distance<.46&&side===inside({x:c.to[0],z:c.to[1]})&&crossings===1;
                  const result={name:c.name,path,frames,seconds:+(frames/60).toFixed(3),arrived,distance:+distance.toFixed(4),crossings,travel:+travel.toFixed(3),maxStep:+maxStep.toFixed(4),end:h.pos.toArray()};
                  results.push(result);if(!arrived)throw Error('Fence walk did not arrive '+JSON.stringify({...result,state:actor.state,remaining:actor.path}));
                }
                if(G.boxes.length!==boxes.length||!boxes.every((b,i)=>G.boxes[i]===b)||JSON.stringify(boxes.map(b=>[b.min.toArray(),b.max.toArray(),b.enabled,b.tag]))!==geometry)throw Error('Real colliders changed during walking test');
                window.__fenceWalkActor=actor;return {cases:results.length,colliders:boxes.length,fences:boxes.filter(b=>b.tag==='fence').length,results};
              }finally{G.levelUpdate=level;for(const [m,update,hidden] of mates){m.update=update;m.h.hidden=hidden;}}})()""")
            show("real station fence walks",r)
            assert r['cases']==24 and all(x['arrived'] and x['crossings']==1 for x in r['results']),r
            # One evidence image after the final actual crossing; camera placement is only for documentation.
            await ev("__P.pos.set(35,1.2,-18);__P.camY=1.2;__P.eyeY=1.62;__P.yaw=Math.atan2(35-__fenceWalkActor.h.pos.x,-18-__fenceWalkActor.h.pos.z);__P.pitch=-.17;__P.shake=0;__P.autoLook=null;window.__freeze=true;window.__rafHold=false;window.__f0=window.__frames||0;{const q=window.__pend.splice(0);for(const cb of q)window.__raf(cb);}")
            await pg.wait_for_function("((window.__frames||0)>=window.__f0+2) || !!window.__fatal || !!window.__errors?.length",polling=300,timeout=200000)
            await assert_clean(pg, logs)
            await ev("window.__rafHold=true")
            await pg.screenshot(path=str(ROOT/'shots'/'ai_fence_walk.png'),timeout=200000)
            await ev("window.__freeze=false")
            await assert_clean(pg,logs)

        if "train" in PH:
            await ev("__begin(1)"); await ev("__sim(0.5)"); await ev(RESET)
            # the player advances behind the enemy line now and then; enemies are left to the mates
            for i in range(12):
                await sim(5)
                await ev("""(()=>{let f=-999; for(const e of __G.enemies) if(e.h.alive&&e.kind!=='gunner'&&e.active) f=Math.max(f,e.h.pos.z); if(f>-999&&__P.pos.z>f+12) { __P.pos.z=Math.max(f+10,__P.pos.z-6); __P.pos.x=0; } return 0})()""")
                if i % 3 == 2: show(f"train t={5*(i+1)}", await ev(REPORT))
            show("TRAIN", await ev(REPORT))
        if "station" in PH:
            await ev("__begin(5)"); await ev("__sim(0.5)"); await ev(RESET)
            for i in range(12):
                await sim(5)
                if i % 3 == 2: show(f"station t={5*(i+1)}", await ev(REPORT))
            show("STATION", await ev(REPORT))
        if "surface" in PH:
            await ev("__begin(20)"); await ev("__sim(17)"); await ev(RESET)
            await ev("__P.pos.set(0,0,-6); __P.yaw=0")
            for i in range(8):
                await sim(5)
                if i % 2 == 1: show(f"surface t={5*(i+1)}", await ev(REPORT))
            show("SURFACE", await ev(REPORT))
        if "mine" in PH:
            await ev("__begin(10)"); await ev("__sim(10)"); await ev("__P.pos.set(0.5,0,-22); __P.yaw=0"); await ev(RESET)
            for i in range(10):
                await sim(5)
                if i % 2 == 1: show(f"mine t={5*(i+1)}", await ev(REPORT))
            show("MINE", await ev(REPORT))
        print("\n".join(logs[-25:]))
        print("errors:", await ev("window.__errors"))
        await assert_clean(pg, logs)
        await b.close()
asyncio.run(main())
