import asyncio, json, sys
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
os.makedirs("shots", exist_ok=True)
LIMIT=int(sys.argv[1]) if len(sys.argv)>1 else 420
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":400,"height":225})
        logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:400]))
        await pg.goto(DIST + "?q=low&god=1")
        await pg.wait_for_function("window.__ready", timeout=300000)
        ev=pg.evaluate
        await ev("__begin(0)"); await ev("__sim(1)")
        await ev("__P.pos.set(2.1,0,28); __P.yaw = Math.PI/2; __input.pressed.add('Space')"); await ev("__sim(1.2)")
        await ev("__P.yaw=0; __input.down.add('KeyW')")
        phases=[]; below=0; T=0; jumped=False; mounted=False; melee=0; nades=0
        while T < LIMIT:
            await ev("if(!__P.mounted){__P.yaw=0}; __sim(1)"); T+=1
            s = json.loads(await ev("""JSON.stringify({ph:__D.phase, st:__G.state, pz:+__P.pos.z.toFixed(1), px:+__P.pos.x.toFixed(2), yaw:+__P.yaw.toFixed(2), py:+__P.pos.y.toFixed(2), m:__P.mounted, jo:!!__D.f.jumpOpen, err:window.__errors.length,
              mates:__G.mates.filter(m=>m.h.alive).map(m=>[m.mode, +m.h.pos.y.toFixed(2), +m.h.pos.z.toFixed(1)]), en:__G.enemies.filter(e=>e.h.alive).length})"""))
            if not phases or phases[-1][0]!=s['ph']: phases.append((s['ph'],T)); print(T, json.dumps(s), flush=True)
            if s['ph'] in ('cars','clear','gunready','turret') and any(m[1] < 1.0 and m[0] in ('follow','hold') for m in s['mates']): below+=1
            if s['st']!='play' and s['ph']!='end': print('STATE', s); break
            if not s['m']:
                await ev("__input.down.delete('KeyA'); __input.down.delete('KeyD')")
                if s['px'] > 0.25: await ev("__input.down.add('KeyA')")
                elif s['px'] < -0.25: await ev("__input.down.add('KeyD')")
            if s['ph'] in ('cars','clear'):
                # alternate melee/grenade use on close enemies, kill the rest within 28 m
                r = await ev("""(()=>{let k=0;for(const e of __G.enemies){if(!e.h.alive)continue;const d=e.h.pos.distanceTo(__P.pos);if(d<28){e.h.hurt(500,new __THREE.Vector3(0,0.3,-1),'torso',0,{force:5});k++}}return k})()""")
                if T % 9 == 0: await ev("__input.pressed.add('KeyV')"); melee+=1
                if T % 13 == 0: await ev("__P.pitch=0.1; __input.pressed.add('KeyG')"); nades+=1
            if s['ph']=='gunready' and not mounted:
                await ev("__input.down.clear(); __P.pos.set(0.9,1.45,-44.8); __sim(0.3); __input.pressed.add('KeyF')"); mounted=True
            if s['ph']=='turret' and T % 3 == 0:
                await ev("if(__G.hind){__G.hind.hp=Math.max(__G.hind.maxHp*0.4, __G.hind.hp-260)} for(const x of __G.sleds) if(!x.dead) x.hurt(500,null)")
            if s['ph']=='bridge' and s['jo'] and not jumped:
                await ev("__input.pressed.add('Space')"); jumped=True; print(T,'jump', flush=True)
            if (s['ph']=='end' and T % 4 == 0) or T % 10 == 0: print(T, json.dumps(s), flush=True)
            if await ev("!!document.querySelector('.endcard, #end.show, [data-end].show')"): print('endcard'); break
        print("phases", phases, "below", below, "melee", melee, "nades", nades)
        print("errors", await ev("window.__errors.slice(0,5)"))
        print("\n".join(logs[-10:]))
        await b.close()
asyncio.run(main())
