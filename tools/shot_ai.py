# AI package visual checks (640x360 q=medium): enemy loadout models, a downed enemy firing his pistol and
# bleeding out, enemy melee on the player (wind-up / strike), a mate's melee and a knife stab.
# usage: timeout 900 python3 tools/shot_ai.py [shots...]   (loadouts downed melee)
import asyncio, sys, os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
OUT = ROOT / "shots"; os.makedirs(OUT, exist_ok=True)
PH = sys.argv[1:] or ["loadouts", "downed", "melee"]
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":640,"height":360})
        logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:600]))
        await pg.goto(DIST + "?q=medium&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev=pg.evaluate
        await ev("""(()=>{const raf=window.requestAnimationFrame.bind(window); window.__raf=raf; window.__rafHold=true;
          window.__pend=[]; window.requestAnimationFrame=(cb)=>{ if(window.__rafHold){ window.__pend.push(cb); return 0; } return raf(cb); }; })()""")
        async def snap(name):
            await ev("window.__freeze=true; window.__rafHold=false; window.__f0=window.__frames||0; {const q=window.__pend.splice(0); for(const c of q) window.__raf(c);}")
            await pg.wait_for_function("(window.__frames||0) >= window.__f0 + 2", polling=300, timeout=600000)
            await ev("window.__rafHold=true")  # stop rendering: the canvas keeps the last frame, the compositor is idle
            await pg.screenshot(path=str(OUT / name), timeout=200000)
            await ev("window.__freeze=false")
            print("shot", name, flush=True)
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
            await ev("__sim(0.25)")
            await snap("ai_downed_fall.png")
            await ev("__sim(1.6); __dn.dph='aim'; __dn.dphT=9")
            for i in range(60):
                await ev("__sim(1/60)")
                if await ev("__dn.h.recoil>0.8"): break
            await snap("ai_downed_fire.png")
            # side view of the pose
            await ev("__P.pos.set(-1.0,__G.groundFn(-1.0,35.2),35.2); __P.yaw=Math.PI/2-0.1; __P.pitch=-0.35; __sim(0.05)")
            await snap("ai_downed_side.png")
            await ev("__dn.bleedT=0.01; __sim(4)")
            await snap("ai_downed_dead.png")
            print("downed alive?", await ev("__dn.h.alive"), "rag", await ev("!!__dn.h.rag"))
        if "melee" in PH:
            await ev("__begin(4)"); await ev("__sim(0.3)"); await ev("__hud(false)")
            # enemy butt-stroke on the player, seen from the player's eyes
            await ev("""(()=>{ __P.pos.set(-3,__G.groundFn(-3,40),40); __P.yaw=0; __P.pitch=0.02;
              const e=new window.__Raider(-3,38.3,{maxTier:0,wk:'ak'}); e.h.pos.y=__G.groundFn(-3,38.3); e.state='cover'; e.coverT=99; e.t=9; window.__me=e; e.h.firstPose=true; __sim(0.05); })()""")
            for i in range(40):
                await ev("__sim(1/60)")
                if await ev("__me.h.meleeT>=0.26"): break
            await snap("ai_melee_windup.png")
            for i in range(20):
                await ev("__sim(1/60)")
                if await ev("__me.h.meleeT>=0.43"): break
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
            await snap("ai_mate_melee_windup.png")
            for i in range(20):
                await ev("__sim(1/60)")
                if await ev("__G.mates[0].h.meleeT>=0.44||__G.mates[0].h.meleeT<0"): break
            await snap("ai_mate_melee_strike.png")
            print("mate melee kind", await ev("__G.mates[0].h.meleeKind"), "victim alive", await ev("__mv.h.alive"))
            await ev("""(()=>{ const g=__G.mates[1]; const e=new window.__Raider(g.h.pos.x+1.3,g.h.pos.z,{maxTier:0,wk:'smg'}); e.h.pos.y=g.h.pos.y; e.state='cover'; e.coverT=99; e.t=9; e.h.firstPose=true; window.__mk2=e; __G.mates[0].p5='idle';
              __P.pos.set(-8.5,__G.groundFn(-8.5,37.2),37.2); __P.yaw=0.1; __P.pitch=-0.15; __sim(0.05); })()""")
            for i in range(60):
                await ev("__sim(1/60)")
                if await ev("__mk2.h.meleeT>=0.25"): break
            await snap("ai_knife_windup.png")
            for i in range(20):
                await ev("__sim(1/60)")
                if await ev("__mk2.h.meleeT>=0.44||__mk2.h.meleeT<0"): break
            await snap("ai_knife_strike.png")
            print("knife kind", await ev("__mk2.h.meleeKind"))
        print("\n".join(logs[-20:]))
        print("errors:", await ev("window.__errors"))
        await b.close()
asyncio.run(main())
