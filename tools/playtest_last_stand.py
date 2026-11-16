import asyncio, json, sys
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
os.makedirs("shots", exist_ok=True)
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":640,"height":360})
        logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:600]))
        pg.on("console", lambda m: logs.append(m.type+": "+m.text[:300]) if m.type=='error' else None)
        await pg.goto(DIST + "?q=low&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev=pg.evaluate
        # pause the render loop between screenshots (software GL is slow); __sim still advances the game
        await ev("""(()=>{const raf=window.requestAnimationFrame.bind(window); window.__raf=raf; window.__rafHold=true;
          window.requestAnimationFrame=(cb)=>{ if(window.__rafHold){ window.__pend=cb; return 0; } return raf(cb); }; })()""")
        async def snap(path):
            await ev("window.__rafHold=false; window.__f0=window.__frames||0; if(window.__pend){const c=window.__pend; window.__pend=null; window.__raf(c);}")
            await pg.wait_for_function("(window.__frames||0) >= window.__f0 + 1", polling=300, timeout=600000)
            await pg.screenshot(path=path, timeout=200000)
            await ev("window.__rafHold=true")
        async def st(tag):
            r = await ev("""JSON.stringify({ph:__p5().P5&&__p5().P5.ph, up:__p5().P5&&+__p5().P5.up.toFixed(1), st:__G.state, lvl:__G.lvl, P:__P.pos.toArray().map(v=>+v.toFixed(1)),
              en:__G.enemies.filter(e=>e.h.alive).length, mates:__G.mates.map(m=>[m.name[0],m.p5,m.h.pos.toArray().map(v=>+v.toFixed(1))]), hind: __G.hind? [__G.hind.state, __G.hind.pos.toArray().map(v=>+v.toFixed(0))]:null,
              err:window.__errors.slice(0,3), cur: __D.cur && __D.cur.id, fin:__fin.ph, ck:__D.ck})""")
            print(tag, r, flush=True)
        await ev("__begin(4)"); await ev("__sim(1.5)")
        await snap("shots/p5_start.png")
        await ev("__sim(4)"); await st("t5")
        await ev("__P.pos.set(0,0.15,6)"); await ev("__sim(1)"); await st("door")
        await ev("__P.pos.set(-8.9,0,1.2); __input.down.add('KeyF'); __sim(1.6); __input.down.delete('KeyF')"); await st("gen")
        await ev("__sim(10)"); await st("defend0")
        await ev("__P.pos.set(0.2,0.15,-3.6); __P.yaw=0; __P.pitch=0"); await ev("__sim(0.2)")
        await snap("shots/p5_window.png")
        for i in range(6):
            await ev("__sim(5)"); await st(f"def{i}")
        await snap("shots/p5_fight.png")
        await ev("__p5().P5.up=54.9"); await ev("__sim(6)"); await st("dish?")
        await ev("__P.pos.set(-0.8,4.3,2.5); __P.yaw=Math.PI; __input.down.add('KeyF'); __sim(2.2); __input.down.delete('KeyF')"); await st("aligned")
        await ev("__P.pos.set(9,4.3,-3.8); __P.yaw=Math.PI*0.75; __P.pitch=-0.25; __sim(0.2)")
        await snap("shots/p5_roof.png")
        await ev("__p5().P5.up=69.4"); await ev("__sim(4)"); await st("jugg")
        for i in range(12):
            await ev("__sim(4)")
            if await ev("__G.enemies.some(e=>e.jugg&&e.h.alive)"): break
        await st("jugg2")
        await ev("const j=__G.enemies.find(e=>e.jugg); if(j){ __P.pos.set(j.h.pos.x, j.h.pos.y, j.h.pos.z+6); __P.yaw=0; __P.pitch=0.0 }"); await ev("__sim(0.2)")
        await snap("shots/p5_jugg.png")
        await ev("__G.enemies.filter(e=>e.jugg).forEach(e=>e.h.hurt(5000,new __THREE.Vector3(0,0,-1),'torso'))"); await ev("__sim(3)")
        await ev("__p5().P5.up=80"); await ev("__sim(6)"); await st("hind")
        await ev("__sim(14)"); await st("strafe")
        for i in range(6):
            await ev("__sim(4)"); await st(f"truck{i}")
        await ev("__P.pos.set(-19.6,0.1,10.5); __input.pressed.add('KeyF'); __sim(0.2)"); await st("igla")
        await ev("__sim(1.0)")
        # aim at hind and hold rmb
        await ev("__P.pos.set(-12,0,16)")
        for i in range(30):
            await ev("""(()=>{const h=__G.hind; if(!h) return; const c=__G.camera.position; const d=h.pos.clone().sub(c).normalize(); __P.yaw=Math.atan2(-d.x,-d.z); __P.pitch=Math.asin(d.y); __input.rmb=true; })(); __sim(0.1)""")
        await snap("shots/p5_lock.png")
        await st("locking")
        await ev("__input.lmb=true; __input.lmbPressed=true; __sim(0.05); __input.lmb=false; __sim(4); __input.rmb=false"); await st("fired")
        await ev("__sim(4)"); await st("after")
        # upload climbs to 99% -> RPG -> blackout/drag -> checkpoint 7 wake
        for i in range(30):
            await ev("__sim(1)")
            if await ev("__fin.ph==='wake'"): break
        await st("wake"); print("ck", await ev("__D.ck"))
        for i in range(30):
            await ev("__sim(0.5)")
            if await ev("__fin.ph==='bullet'"): break
        await ev("__sim(1.0)"); await st("bullet")
        await ev("[__fin.kras,__fin.sb].forEach(a=>a.h.alive&&a.h.hurt(500,new __THREE.Vector3(0,0,-1),'torso'))")
        for i in range(10):
            await ev("__sim(0.5)")
            if await ev("__fin.ph==='crawl'"): break
        await ev("__sim(2); __input.down.add('KeyW')")
        for i in range(40):
            await ev("__sim(0.5)")
            if await ev("Math.hypot(__P.pos.x-__p5().S.keyPos.x,__P.pos.z-__p5().S.keyPos.z)<1.05"): break
        await st("at console")
        await ev("__input.down.delete('KeyW'); __input.down.add('KeyF'); __sim(2); __input.down.delete('KeyF')"); await st("sent")
        for i in range(20):
            await ev("__sim(1)")
            if await ev("__G.state")=='cine': break
        await st("epilogue")
        await snap("shots/p5_end.png")
        print("\n".join(logs[-15:]))
        await b.close()
asyncio.run(main())
