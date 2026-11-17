# Package T: locomotive cab (#10) and DShK gunner (#29) visual + logic check.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from t_harness import Page
Q = sys.argv[1] if len(sys.argv) > 1 else "medium"

async def main():
    P = await Page().open(480 if Q=="low" else 640, 270 if Q=="low" else 360, Q)
    ev, j = P.ev, P.j
    G = "{ph:__D.phase, st:__G.grinch_st, g:(()=>{const g=__D.grinch; return [g.mode, g.cab&&g.cab.st, +g.h.pos.x.toFixed(2), +g.h.pos.y.toFixed(2), +g.h.pos.z.toFixed(2)]})(), door:__T.cab.doorOpen, lev:+__T.cab.leverK.toFixed(2), v:+__G.v.toFixed(1), cur:__D.cur&&__D.cur.id, err:window.__errors.length}"
    # gunner visual: player on the flat car looking at the gun car while the gunner fires
    await ev("__begin(1)"); await ev("__sim(0.5)")
    await ev("__P.pos.set(0.3,1.45,-12); __P.yaw=0; __P.pitch=0.05; for(let i=0;i<40;i++){ __P.pos.set(0.3,1.45,-12); __P.health=100; __sim(0.1); if(__G.enemies.find(e=>e.kind==='gunner'&&e.state==='fire'&&e.t<0.06)) break; }")
    print("gunner", await j("__G.enemies.filter(e=>e.kind==='gunner').map(e=>[e.state,e.burst,e.active])"))
    await P.snap("t_gunner.png")
    # clear the cars and watch Grinch walk to the cab
    await ev("__killAll(); __P.pos.set(0.3,1.45,-36); __sim(0.5)")
    for i in range(24):
        await ev("__P.pos.set(-0.3,1.45,-39); __sim(1)")
        r = await j(G); print(i, r, flush=True)
        if r['g'][1] == 'ring' and i < 30: pass
        if r['ph'] == 'gunready': break
    await ev("__P.pos.set(0.0,1.45,-44.2); __P.yaw=0.05; __P.pitch=0.12; __sim(0.05)")
    await P.snap("t_cab_from_gun.png")
    await ev("__P.pos.set(-0.5,1.9,-52.7); __P.yaw=-0.35; __P.pitch=-0.25; __sim(0.05)")
    print("inside", await j("{P:__P.pos.toArray().map(v=>+v.toFixed(2)), on:__P.onTrain}"))
    await P.snap("t_cab_inside.png")
    await ev("__P.pos.set(-1.1,1.9,-54.6); __P.yaw=-1.1; __P.pitch=-0.15; __sim(0.05)")
    await P.snap("t_cab_inside2.png")
    await ev("__P.pos.set(5.5,0.5,-50); __P.yaw=1.0; __P.pitch=0.1; __sim(0.0)")
    await P.snap("t_loco_side.png")
    # checkpoint 2: Grinch already at the controls, player on the DShK
    await ev("__begin(2)"); await ev("__sim(2)")
    print("ck2", await j(G))
    print("errors", await P.errors())
    await P.close()
asyncio.run(main())
