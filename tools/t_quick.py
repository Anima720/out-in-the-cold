# Package T quick checks: laptop intel (#15), DShK gunner fire count (#29), Part 2 yard pressure (#13).
import asyncio, json, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from t_harness import Page

async def main():
    P = await Page().open(480, 270, "low")
    ev, j = P.ev, P.j
    # ---- #15 laptop
    await ev("__begin(10)"); await ev("__sim(10)"); await ev("__killAll(); __D.cv.ph='office'; __sim(0.5)")
    await ev("window.__cards=0; (()=>{const H=__G.hud; })()")
    await ev("__P.pos.set(8.2,0,-61.2); __P.yaw=Math.PI; __input.down.add('KeyF'); __sim(2.0)")
    r1 = await j("{intel:__D.cv.intel, vis:__D.cv&&true, q:__D.q.map(x=>x.id), ph:__D.cv.ph}")
    await ev("__sim(3.0)")
    r2 = await j("{intel:__D.cv.intel, q:__D.q.map(x=>x.id), cur:__D.cur&&__D.cur.id, ph:__D.cv.ph, prompt:document.querySelector('#prompt')?document.querySelector('#prompt').textContent:null}")
    await ev("__input.down.delete('KeyF'); __sim(2)")
    print("laptop", r1, r2, flush=True)
    await ev("__begin(11)"); await ev("__sim(1)")
    await ev("__P.pos.set(8.2,0,-61.2); __P.yaw=Math.PI; __input.down.add('KeyF'); __sim(2.0); __input.down.delete('KeyF')")
    print("ck11", await j("{intel:__D.cv.intel, ph:__D.cv.ph, ck:__D.ck, q:__D.q.map(x=>x.id)}"), flush=True)
    # ---- #29 gunner
    await ev("__begin(1)"); await ev("__sim(0.5)")
    await ev("""window.__gs=0; (()=>{const f=__G.fx.muzzle.bind(__G.fx); __G.fx.muzzle=(p,d,s)=>{ if(p.z<-44 && p.z>-49 && p.y>2) window.__gs++; return f(p,d,s); }})()""")
    for z in [27, 10, -8, -22, -30]:
        if z==27: await ev("__D.phase='board'; __P.pos.set(0,1.45,27); __sim(0.5)")
        await ev(f"__P.pos.set(0,{1.45 if z>5 or z<-23 else 1.62},{z}); __P.yaw=0; __gs=0; for(let i=0;i<60;i++){{ __P.pos.z={z}; __P.health=100; __sim(0.25); }}")
        print("gunner z", z, await j("{shots:__gs, g:__G.enemies.filter(e=>e.kind==='gunner').map(e=>[e.active,e.state,e.h.alive]), en:__G.enemies.filter(e=>e.h.alive).length, tok:__G.enemies.filter(e=>e.hasTok).length, sl:__G.sleds.map(s=>[s.hasTok, +s.pos.z.toFixed(0)]), hp:+__P.health.toFixed(0), dy:+__T.dshk.yaw.rotation.y.toFixed(2)}"), flush=True)
    # ---- #13 yard
    await ev("__begin(20)"); await ev("__sim(1)")
    for i in range(14):
        await ev("__sim(4)")
        print("yard", i, await j("{ph:__D.cv.ph, t:+__D.cv.t.toFixed(1), en:__G.enemies.filter(e=>e.h.alive).length, btr:!!__D.cv.btr, reinf:__D.cv.reinf, P:__P.pos.toArray().map(v=>+v.toFixed(1)), m:__G.mates.map(m=>[m.p5,+m.h.pos.x.toFixed(1),+m.h.pos.z.toFixed(1)])}"), flush=True)
    print("errors", await P.errors())
    await P.close()
asyncio.run(main())
