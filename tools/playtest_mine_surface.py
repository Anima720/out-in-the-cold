import asyncio, json
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
        logs=[]; pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:600]))
        await pg.goto(DIST + "?q=low&god=1")
        await pg.wait_for_function("window.__ready", timeout=300000)
        ev=pg.evaluate
        S = "JSON.stringify({lvl:__G.lvl, ck:__D.ck, ph:__D.cv&&__D.cv.ph, st:__G.state, P:__P.pos.toArray().map(v=>+v.toFixed(1)), en:__G.enemies.filter(e=>e.h.alive).length, mates:__G.mates.map(m=>[m.name[0],m.p5,+m.h.pos.x.toFixed(1),+m.h.pos.z.toFixed(1)]), sand:!!__D.sand, wp:__WP.prim, veh:__G.sleds.map(s=>[s.kind,s.dead,+s.pos.z.toFixed(0)]), la:__WP.launch, err:window.__errors.slice(0,3), cur:__D.cur&&__D.cur.id})"
        async def shot(n):
            await ev("window.__freeze=true"); await pg.wait_for_timeout(300); await pg.screenshot(path=f"shots/m_{n}.png", timeout=200000); await ev("window.__freeze=false")
        await ev("__begin(10)"); await ev("__sim(3)"); await shot("wake")
        print('wake', await ev("JSON.stringify({kneel:__G.mates.filter(m=>m.p5==='kneel').map(m=>m.name), n:__G.mates.length, sand:!!__D.sand, wp:__WP.prim})"))
        await ev("__sim(8)"); print('adv', await ev(S))
        await ev("__P.pos.set(0,0,-24); __P.yaw=0; __sim(3)"); print('encA', await ev(S)); await shot("encA")
        await ev("__sim(6)"); print('encA2', await ev(S))
        await ev("__killAll(); __sim(4)"); print('office', await ev(S))
        await ev("__P.pos.set(8.2,0,-61.2); __P.yaw=Math.PI; __input.down.add('KeyF'); __sim(2); __input.down.delete('KeyF')"); print('intel', await ev(S)); await shot("office")
        await ev("__sim(6); __P.pos.set(0,0,-90); __P.yaw=0; __sim(3)"); print('encB', await ev(S)); await shot("cavern")
        await ev("__killAll(); __sim(6)"); print('board', await ev(S))
        # laptop can't be taken twice (#15): no prompt / no re-trigger after the intel is taken
        lap = json.loads(await ev("JSON.stringify({intel:__D.cv.intel, q:__D.q.length})"))
        print('laptop', lap)
        await ev("__P.pos.set(0,0,-121.5); __sim(4)"); print('ride', await ev(S)); await shot("ride")
        # the cage really travels up the shaft (#16): player and mates ride with it, gate opens at the top
        ys = []
        for i in range(24):
            await ev("__sim(1)"); r = json.loads(await ev("JSON.stringify({ph:__D.cv.ph, y:+__P.pos.y.toFixed(2), my:__G.mates.map(m=>+m.h.pos.y.toFixed(2))})")); ys.append(r['y'])
            if r['ph'] == 'top': break
        print('ride ys', ys[::3], 'top', r)
        await ev("__sim(2)"); print('top', await ev(S)); await shot("top")
        await ev("__P.pos.set(0,0,-8); __P.yaw=0; __sim(16)"); print('btr', await ev(S)); await shot("btr")
        await ev("__P.pos.set(5.3,0,-3.6); __input.pressed.add('KeyF'); __sim(1.5)"); print('rpg', await ev(S))
        await ev("(()=>{const t=__G.sleds.find(s=>s.kind==='btr'); if(!t) return; __P.pos.set(t.pos.x+12, 0.2, t.pos.z+14); })(); __sim(0.3)")
        await ev("(()=>{const t=__G.sleds.find(s=>s.kind==='btr'); const c=__G.camera.position; const d=t.pos.clone().setY(t.pos.y+1.5).sub(c).normalize(); __P.yaw=Math.atan2(-d.x,-d.z); __P.pitch=Math.asin(d.y);})(); __sim(0.05); __input.lmb=true; __input.lmbPressed=true; __sim(0.05); __input.lmb=false; __sim(3)")
        print('hit1', await ev(S))
        await ev("(()=>{const t=__G.sleds.find(s=>s.kind==='btr'); const c=__G.camera.position; const d=t.pos.clone().setY(t.pos.y+1.5).sub(c).normalize(); __P.yaw=Math.atan2(-d.x,-d.z); __P.pitch=Math.asin(d.y);})(); __sim(0.05); __input.lmb=true; __input.lmbPressed=true; __sim(0.05); __input.lmb=false; __sim(4)")
        print('hit2', await ev(S))
        await ev("__killAll(); __sim(6); __P.pos.set(0,0,-129); __sim(4)"); print('end', await ev(S))
        r = json.loads(await ev("JSON.stringify({lvl:__G.lvl, ph:__D.phase, ck:__D.ck, n:__G.mates.length, err:window.__errors.length})"))
        print('handoff', r, 'RESULT', 'PASS' if r['lvl']==2 and r['ck']==0 and r['n']==2 and r['err']==0 else 'FAIL')
        print("\n".join(logs))
        await b.close()
asyncio.run(main())
