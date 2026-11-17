# AI package (v7 #4/#14) logic checks, one page load, 480x270 q=low god=1:
#  - train ck 1: 60 s, mates' kills, downed/melee/loadout stats, no stuck enemies
#  - station ck 5: 60 s, % of time enemies spend in cover / moving / shooting, mates' kills, stuck check
#  - surface ck 20 (after the cage ride): 40 s, flank / suppression / retreat counters
#  - downed: forced down -> pistol fire -> bleed out; finished off by a second hit
#  - melee: enemy on the player (damage with god off), mate on an enemy
# usage: timeout 900 python3 tools/test_ai.py [phases...]   (phases: train station surface downed melee mine)
import asyncio, json, sys, os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
PH = sys.argv[1:] or ["downed", "melee", "train", "station", "surface"]
from playwright.async_api import async_playwright

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
            await ev("__sim(2.5)")
            r = await ev("JSON.stringify({aim:+__dn.h.aimT.toFixed(2), tg:__dn.dtg===__P?'P':__dn.dtg?__dn.dtg.name:null, alive:__dn.h.alive, P5y:+__dn.h.j[0].y.toFixed(2), pel:+__dn.h.j[2].y.toFixed(2), pool:__dn.pooled})")
            show("downed 3s", r)
            hp0 = await ev("__P.god=false; __P.health=100; 0")
            await ev("__sim(6)")
            r = await ev("JSON.stringify({health:__P.health, alive:__dn.h.alive, bleed:+__dn.bleedT.toFixed(1)})"); show("after 6s fire (god off)", r)
            await ev("__P.god=true; __P.health=100")
            await ev("__sim(10)")
            r = await ev("JSON.stringify({alive:__dn.h.alive, rag:!!__dn.h.rag, bleedOuts:__ai.stats.bleedOuts})"); show("bled out", r)
            # second one: finished off by another hit
            r = await ev("""(()=>{ __ai.forceDown=1; const e=__mk(-1,22,{maxTier:0}); e.update=()=>{}; __sim(0.4); e.update=e.constructor.prototype.update;
              e.h.hurt(150,new __THREE.Vector3(0.3,0,-1).normalize(),'torso',2,{point:e.h.j[2].clone()}); __ai.forceDown=undefined; __sim(1.5);
              const d1=e.downed&&e.h.alive; e.h.hurt(34,new __THREE.Vector3(0,0,-1),'torso',2,{point:e.h.j[2].clone()}); __sim(0.5);
              return JSON.stringify({wasDown:d1, alive:e.h.alive}) })()""")
            show("finish off", r)
            # non-eligible: headshot / explosion / melee never down
            r = await ev("""(()=>{ __ai.forceDown=1; const out=[]; for(const [part,o] of [['head',{bullet:true}],['torso',{force:14}],['torso',{melee:true}]]){ const e=__mk(2,18,{maxTier:0}); e.update=()=>{}; __sim(0.2); e.h.hurt(300,new __THREE.Vector3(0,0,-1),part,2,o); out.push(e.downed?'DOWN':'dead'); }
              __ai.forceDown=undefined; return out.join(',') })()""")
            show("head/blast/melee", r)
            print("errors:", await ev("window.__errors.slice(0,3)"))

        if "melee" in PH:
            await ev("__begin(4)"); await ev("__sim(0.5)")
            r = await ev("""(()=>{ __P.pos.set(-3,0,30); __P.yaw=0; __P.god=false; __P.health=100; __sim(0.1);
              const y=__G.groundFn?__G.groundFn(-3,28.6):0; const e=__mk(-3,28.6,{maxTier:0}); e.h.pos.y=y; e.state='cover'; e.coverT=99; e.t=0.5; __sim(0.05);
              let mel=false, hit=false, minH=100; for(let i=0;i<90;i++){ __sim(1/60); if(e.mel) mel=true; minH=Math.min(minH,__P.health); }
              const r={startedMelee:mel, kind:e.h.meleeKind, health:Math.round(minH), enemyMeleeStats:__ai.stats.melee};
              __P.god=true; __P.health=100; e.h.die(new __THREE.Vector3(0,0,-1),2,3); return JSON.stringify(r) })()""")
            show("enemy melee on player", r)
            r = await ev("""(()=>{ const m=__G.mates[0]; m.p5='defend'; m.cs='peek'; m.ct=3; __P.pos.set(m.h.pos.x+6,m.h.pos.y,m.h.pos.z+6); __sim(0.1);
              const f=m.h.bodyFwd; const x=m.h.pos.x+f.x*1.3, z=m.h.pos.z+f.z*1.3; const e=__mk(x,z,{maxTier:0}); e.update=()=>{}; __sim(0.05);
              let mel=false; for(let i=0;i<90;i++){ __sim(1/60); if(m.mel) mel=true; }
              return JSON.stringify({mate:m.name, startedMelee:mel, enemyAlive:e.h.alive, stats:__ai.stats.melee}) })()""")
            show("mate melee", r)
            print("errors:", await ev("window.__errors.slice(0,3)"))

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
        await b.close()
asyncio.run(main())
