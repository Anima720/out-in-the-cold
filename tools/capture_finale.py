# Finale frames: Truck against the wall (ck 6), forced 99% RPG with the player outside -> drag -> wake (ck 7)
# -> breach -> bullet time -> crawl -> send -> monologue -> epilogue start. Look at every frame in shots/f_*.png.
import asyncio, os, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
os.makedirs("shots", exist_ok=True)
from playwright.async_api import async_playwright
ONLY = sys.argv[1] if len(sys.argv) > 1 else ''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 800, "height": 450})
        logs = []; pg.on("pageerror", lambda e: logs.append("PAGEERR: " + str(e)[:500]))
        await pg.goto(DIST + "?q=medium&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev = pg.evaluate
        async def shot(n):
            await ev("window.__freeze=true"); await pg.wait_for_timeout(250)
            await pg.screenshot(path=f"shots/f_{n}.png", timeout=200000)
        async def st(tag):
            print(tag, await ev("JSON.stringify({ph:__fin.ph, t:+__fin.t.toFixed(2), st:__G.state, ck:__D.ck, ts:__G.timeScale, P:__P.pos.toArray().map(v=>+v.toFixed(2)), alive:__P.alive, sub:__D.cur&&__D.cur.id, err:window.__errors.slice(0,3)})"), flush=True)
        async def until(cond, step=0.1, maxt=40):
            t = 0
            while t < maxt and not await ev(cond): await ev(f"__sim({step})"); t += step
        if ONLY in ('', 'a'):
            await ev("__begin(6)"); await ev("__sim(1.5)")
            await ev("__P.pos.set(4.2,0,-9.2); __P.yaw=Math.PI+0.35; __P.pitch=-0.25"); await ev("__sim(0.1)"); await shot("01_truck")
            # force the 99% RPG while standing in the yard
            await ev("const P5=__p5().P5; P5.hindDown=true; P5.l90=true; P5.up=98.97; P5.rate=1; __P.pos.set(-3,0,-13); __P.yaw=0.3; __P.pitch=0.05")
            await until("__fin.ph==='rpg'", 0.05, 5); await ev("__sim(0.3)"); await st("rpg"); await shot("02_rpg")
            await until("__fin.ph==='blast'", 0.02, 3); await ev("__sim(0.04)"); await shot("03_blast")
            await until("__fin.ph==='drag'", 0.2, 8); await ev("__sim(1.4)"); await st("drag"); await shot("04_drag1")
            await ev("__sim(3.0)"); await shot("05_drag2")
            await ev("__sim(3.0)"); await shot("06_drag3")
            await until("__fin.ph==='wake'", 0.2, 12); await st("wake0")
        else:
            await ev("__begin(7)")
        await ev("__sim(4.5)"); await st("wake"); await shot("07_wake")
        await until("__fin.ph==='breach'", 0.2, 12); await ev("__sim(2.0)"); await shot("08_breach")
        await ev("__sim(1.8)"); await st("kras"); await shot("09_krasin")
        await ev("__sim(2.5)"); await st("grinch"); await shot("10_grinch_shot")
        await until("__fin.ph==='bullet'", 0.1, 6); await ev("__sim(1.2)"); await st("bullet"); await shot("11_bullet")
        # aim at Krasin and fire twice, then the soldier
        for tgt in ["kras", "sb"]:
            for i in range(3):
                await ev(f"""(()=>{{const h=__fin.{tgt}.h; if(!h.alive) return; const c=__G.camera.position; const d=h.j[0].clone().sub(c).normalize(); __P.yaw=Math.atan2(-d.x,-d.z); __P.pitch=Math.asin(d.y); __input.lmbPressed=true; __WP.cool=0; }})(); __sim(0.05)""")
                await ev("__sim(0.3)")
        await st("shot"); await shot("12_bullet_after")
        await until("__fin.ph==='crawl'", 0.1, 6); await ev("__sim(2.0)"); await ev("__input.down.add('KeyW')")
        await ev("__sim(2.5)"); await st("crawl"); await shot("13_crawl")
        await until("Math.hypot(__P.pos.x-__p5().S.keyPos.x,__P.pos.z-__p5().S.keyPos.z)<1.05", 0.2, 14)
        await ev("__input.down.delete('KeyW'); __input.down.add('KeyF')"); await ev("__sim(0.9)"); await st("send"); await shot("14_send")
        await until("__fin.ph==='mono'", 0.1, 3); await ev("__input.down.delete('KeyF')"); await ev("__sim(0.5)"); await shot("15_sent")
        await ev("__sim(3.0)"); await shot("16_mono1")
        await ev("__sim(5.2)"); await shot("17_mono2")
        await until("__G.state==='cine'", 0.25, 20); await st("epi")
        print("\n".join(logs[-10:]))
        await b.close()
asyncio.run(main())
