# AI package visual checks (640x360 q=medium): enemy loadout models, a downed enemy firing his pistol and
# bleeding out, enemy melee on the player (wind-up / strike), a mate's melee and a knife stab.
# usage: timeout 900 python3 tools/shot_ai.py [shots...]   (loadouts downed melee)
import asyncio, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
PH = sys.argv[1:] or ["loadouts", "downed", "melee"]
from playwright.async_api import async_playwright
from runtime import CHROME, assert_clean, hold, shot

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":640,"height":360})
        logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:600]))
        await pg.goto(DIST + "?q=medium&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev=pg.evaluate
        await hold(pg)
        async def snap(name):
            await shot(pg, name)
            await assert_clean(pg, logs)
        # helpers: a frozen raider (no AI) with a given loadout, posed toward a point
        await ev("""window.__pose=(x,z,wk,o={})=>{ const e=new window.__Raider(x,z,{maxTier:0,wk,...o}); e.update=()=>{}; const h=e.h; h.pos.y=(__G.groundFn?__G.groundFn(x,z):0);
            h.yaw=o.yaw??Math.PI; h.aim.set(-Math.sin(o.ayaw??h.yaw),o.ay??-0.05,-Math.cos(o.ayaw??h.yaw)).normalize(); h.aimTarget=o.at??1; h.crouchT=0; h.firstPose=true; return e; };
          window.__hud=(v)=>{ const u=document.getElementById('ui'); if(u) u.style.visibility=v?'visible':'hidden'; };""")
        if "loadouts" in PH:
            await ev("__begin(4)"); await ev("__sim(0.3)"); await ev("__hud(false)")
            await ev("""(()=>{ const keys=['ak','ak12','smg','saiga','svd','pkm','rpg']; window.__lo=keys.map((k,i)=>__pose(-6.6+i*1.45, 37.5, k, {yaw:Math.PI-0.55, ayaw:Math.PI-0.15, at:0.35}));
              __P.pos.set(-1.6,__G.groundFn(-1.6,42.6),42.6); __P.yaw=0.12; __P.pitch=-0.12; __P.crouched=false; })()""")
            await ev("__sim(0.6)")
            await snap("ai_loadouts_lowready.png")
            await ev("""(()=>{ for(const e of __lo){ e.h.aimTarget=1; e.h.yaw=Math.PI/2+0.25; e.h.aim.set(-1,0,0.1).normalize(); } __P.pos.set(-1.0,__G.groundFn(-1.0,40.0),40.0); __P.yaw=0.35; })()""")
            await ev("__sim(0.6)")
            await snap("ai_loadouts_profile.png")
            await ev("for(const e of __lo) e.h.remove(); __G.enemies.length=0;")
        if "downed" in PH:
            await ev("__begin(4)"); await ev("__sim(0.3)"); await ev("__hud(false)")
            await ev("""(()=>{ __P.pos.set(-3,__G.groundFn(-3,40),40); __P.yaw=0.25; __P.pitch=-0.18; __ai.forceDown=1;
              const e=new window.__Raider(-4.2,35.5,{maxTier:0,wk:'smg'}); e.update=()=>{}; e.h.pos.y=__G.groundFn(-4.2,35.5); window.__dn=e; __sim(0.4);
              e.update=e.constructor.prototype.update; e.h.hurt(150,new __THREE.Vector3(0.6,0,-1).normalize(),'torso',2,{bullet:true}); __ai.forceDown=undefined; e.crawlLeft=0; })()""")
            assert await ev("__dn.downed && __dn.h.downed && __dn.h.alive"), "downed visual fixture did not enter last stand"
            await ev("__sim(0.25)")
            await snap("ai_downed_fall.png")
            await ev("__P.pos.set(-3.6,__G.groundFn(-3.6,38.6),38.6); __P.yaw=0.15; __P.pitch=-0.45; __sim(1.6); __dn.dph='aim'; __dn.dphT=9")
            fired = False
            for i in range(180):
                fired = await ev("(()=>{const before=__dn.dfT; __sim(1/60); return __dn.dfT>before && __dn.dfT>1 && __dn.h.recoil>0.7;})()")
                if fired: break
            assert fired, "downed pistol never fired in the capture window"
            # The same tick decays recoil from 1 to 0.792; preserve this actual shot frame without another simulation step.
            await snap("ai_downed_fire.png")
            # side view of the pose
            await ev("__P.pos.set(-1.9,__G.groundFn(-1.9,35.9),35.9); __P.yaw=Math.PI/2-0.15; __P.pitch=-0.5; __sim(0.05)")
            await snap("ai_downed_side.png")
            await ev("__dn.bleedT=0.01; __sim(4)")
            await snap("ai_downed_dead.png")
            print("downed alive?", await ev("__dn.h.alive"), "rag", await ev("!!__dn.h.rag"))
            assert await ev("!__dn.h.alive && !!__dn.h.rag"), "downed death capture is not a corpse"
        if "melee" in PH:
            await ev("__begin(4)"); await ev("__sim(0.3)"); await ev("__hud(false)")
            # enemy butt-stroke on the player, seen from the player's eyes
            await ev("""(()=>{ __P.pos.set(-3,__G.groundFn(-3,40),40); __P.yaw=0; __P.pitch=0.02;
              const e=new window.__Raider(-3,38.3,{maxTier:0,wk:'ak'}); e.h.pos.y=__G.groundFn(-3,38.3); e.state='cover'; e.coverT=99; e.t=9; window.__me=e; e.h.firstPose=true; __sim(0.05); })()""")
            for i in range(40):
                await ev("__sim(1/60)")
                if await ev("__me.h.meleeT>=0.26"): break
            assert await ev("__me.h.meleeT>=0.26 && __me.h.meleeT<0.42"), "enemy melee wind-up was missed"
            await snap("ai_melee_windup.png")
            for i in range(20):
                await ev("__sim(1/60)")
                if await ev("__me.h.meleeT>=0.43"): break
            assert await ev("__me.h.meleeT>=0.43 && __me.h.meleeT<0.85"), "enemy melee strike was missed"
            await snap("ai_melee_strike.png")
            await ev("__me.h.die(new __THREE.Vector3(0,0,-1),2,1); __sim(0.1)")
            # mate (Truck) melee on an enemy, third person from the side; then a knife stab by an enemy on Grinch
            await ev("""(()=>{ const m=__G.mates[0]; m.p5='defend'; m.cs='peek'; m.ct=9; m.home=null; const x=-6, z=34; m.h.pos.set(x,__G.groundFn(x,z),z); m.h.yaw=Math.PI; m.yaw0=Math.PI; m.h.firstPose=true;
              const g=__G.mates[1]; g.p5='idle'; g.h.pos.set(-10,__G.groundFn(-10,34),34); g.h.firstPose=true;
              __P.pos.set(-3.2,__G.groundFn(-3.2,35.6),35.6); __P.yaw=Math.PI/2+0.25; __P.pitch=-0.12;
              const e=new window.__Raider(x,z+1.35,{maxTier:0,wk:'ak'}); e.update=()=>{}; e.h.pos.y=__G.groundFn(x,z+1.35); e.h.yaw=0; e.h.aim.set(0,0,-1); e.h.firstPose=true; window.__mv=e; __sim(0.05); })()""")
            for i in range(60):
                await ev("__sim(1/60)")
                if await ev("__G.mates[0].h.meleeT>=0.24"): break
            assert await ev("__G.mates[0].h.meleeT>=0.24 && __G.mates[0].h.meleeT<0.42"), "mate melee wind-up was missed"
            await snap("ai_mate_melee_windup.png")
            for i in range(20):
                await ev("__sim(1/60)")
                if await ev("__G.mates[0].h.meleeT>=0.44||__G.mates[0].h.meleeT<0"): break
            assert await ev("__G.mates[0].h.meleeT>=0.44 && __G.mates[0].h.meleeT<0.85"), "mate melee strike was missed"
            await snap("ai_mate_melee_strike.png")
            print("mate melee kind", await ev("__G.mates[0].h.meleeKind"), "victim alive", await ev("__mv.h.alive"))
            assert await ev("__G.enemies.every(e=>!e.h.alive) && !__G.mates[1].mel"), "knife fixture still has an active prior duel"
            # 'idle' mates still defend themselves. Pause their decisions only for this
            # single-sided visual sample; the live Raider must start and land its own stab.
            # Otherwise Grinch kills it at meleeT=.433, before the .44 strike sample.
            await ev("""(()=>{ window.__knifeMates=__G.mates.map(m=>[m,m.custom]); for(const [m] of __knifeMates){m.custom=()=>{};m.h.vel.set(0,0,0);}
              const g=__G.mates[1]; const e=new window.__Raider(g.h.pos.x+1.3,g.h.pos.z,{maxTier:0,wk:'smg'}); e.h.pos.y=g.h.pos.y; e.state='cover'; e.coverT=99; e.t=9; e.h.firstPose=true; window.__mk2=e;
              window.__knifeHits=__ai.stats.melee.enemyOnMate||0; window.__knifeStep=0;
              window.__knifeSample=()=>{const a=o=>({alive:o.h.alive,hp:o.h.hp,meleeT:o.h.meleeT,kind:o.h.meleeKind,mel:!!o.mel,hit:o.mel?.hit??false,
                target:o.mel?.tgt===__P?'player':o.mel?.tgt?.name||(o.mel?.tgt?'enemy':null),targetAlive:o.mel?.tgt?.h?.alive??null,pos:o.h.pos.toArray()});
                return {step:__knifeStep,actor:a(__mk2),mates:__G.mates.map(m=>({name:m.name,...a(m)})),enemyOnMate:__ai.stats.melee.enemyOnMate||0};};
              __P.pos.set(-8.5,__G.groundFn(-8.5,37.2),37.2); __P.yaw=0.1; __P.pitch=-0.15; })()""")
            trace=[]
            try:
                for i in range(60):
                    state=await ev("__sim(1/60); ++__knifeStep; __knifeSample()")
                    trace.append(state)
                    if state["actor"]["meleeT"]>=0.25 or not state["actor"]["alive"]: break
                print("knife windup", state, flush=True)
                assert await ev("__mk2.h.alive && __mk2.mel?.tgt===__G.mates[1] && __mk2.h.meleeKind==='knife' && __mk2.h.meleeT>=0.25 && __mk2.h.meleeT<0.42"), "knife wind-up was missed: "+str(trace)
                await snap("ai_knife_windup.png")
                for i in range(20):
                    state=await ev("__sim(1/60); ++__knifeStep; __knifeSample()")
                    trace.append(state)
                    if state["actor"]["meleeT"]>=0.44 or state["actor"]["meleeT"]<0 or not state["actor"]["alive"]: break
                print("knife strike", state, flush=True)
                assert await ev("__mk2.h.alive && __mk2.mel?.tgt===__G.mates[1] && __mk2.mel.hit && (__ai.stats.melee.enemyOnMate||0)===__knifeHits+1 && __mk2.h.meleeKind==='knife' && __mk2.h.meleeT>=0.44 && __mk2.h.meleeT<0.85"), "knife strike was missed: "+str(trace)
                await snap("ai_knife_strike.png")
            finally:
                await ev("for(const [m,custom] of __knifeMates)m.custom=custom;")
        print("\n".join(logs[-20:]))
        print("errors:", await ev("window.__errors"))
        await assert_clean(pg, logs)
        await b.close()
asyncio.run(main())
