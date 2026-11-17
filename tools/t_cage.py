# Package T: mine cage + ride up the shaft (#16): gate closes, cage travels, arrival flush with the hoist house floor.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from t_harness import Page
Q = sys.argv[1] if len(sys.argv) > 1 else "medium"
SH = len(sys.argv) <= 2 or sys.argv[2] != "noshots"

async def main():
    P = await Page().open(480 if Q=="low" else 640, 270 if Q=="low" else 360, Q)
    ev, j = P.ev, P.j
    S = """{ph:__D.cv.ph, t:+__D.cv.rideT?.toFixed(1), y:+(__D.cv&&window.__cy?__cy():0).toFixed(2), P:__P.pos.toArray().map(v=>+v.toFixed(2)), gr:__P.grounded,
      m:__G.mates.map(m=>[m.name[0], m.p5, m.h.pos.toArray().map(v=>+v.toFixed(2))]), v:+(__D.cv.v||0).toFixed(2), en:__G.enemies.filter(e=>e.h.alive).length, cur:__D.cur&&__D.cur.id, err:window.__errors.length}"""
    # mine bottom landing (Part 1 cage)
    await ev("__begin(11)"); await ev("__sim(0.5)")
    await ev("__killAll(); __P.pos.set(0.4,0,-114.5); __P.yaw=0; __P.pitch=0.05; __sim(0.1)")
    if SH: await P.snap("t_cage_mine.png")
    await ev("__begin(20)"); await ev("__sim(0.3)")
    await ev("window.__cy = () => __P.pos.y")
    if SH:
        await ev("__P.yaw=0.15; __P.pitch=0.0"); await ev("__sim(0.6)"); await P.snap("t_cage_start.png")
    print("start", await j(S), flush=True)
    await ev("__P.yaw=0.5; __P.pitch=-0.05; __sim(1.2)")
    if SH: await P.snap("t_cage_gate.png")
    print("gate", await j(S), flush=True)
    for i in range(24):
        await ev("__sim(1)")
        r = await j(S); print(i, r, flush=True)
        if SH and i == 6: await ev("__P.yaw=0.0; __P.pitch=0.0; __sim(0.02)"); await P.snap("t_cage_ride.png")
        if SH and i == 9: await ev("__P.yaw=2.6; __P.pitch=1.0; __sim(0.02)"); await P.snap("t_cage_up.png")
        if SH and i == 11: await ev("__P.yaw=0.0; __P.pitch=-0.05; __sim(0.02)"); await P.snap("t_cage_station.png")
        if r['ph'] == 'top': break
    await ev("__P.yaw=0.0; __P.pitch=0.05; __sim(0.6)")
    if SH: await P.snap("t_cage_arrive.png")
    print("arrive", await j(S), await j("{gb:__G.boxes.filter(b=>b.max.y>2.7&&b.max.y<3.0).length}"), flush=True)
    await ev("__sim(2.5)"); print("out", await j(S), flush=True)
    # walk out of the cage through the gate opening
    await ev("__input.down.add('KeyW'); __P.yaw=0; __sim(1.5); __input.down.delete('KeyW')"); print("walked", await j(S), flush=True)
    if SH:
        await ev("__P.pos.set(9,0.2,-16); __P.yaw=-2.55; __P.pitch=0.42; __sim(0.05)"); await P.snap("t_headframe.png")
        await ev("__P.pos.set(-1.0,0.04,2.6); __P.yaw=-2.9; __P.pitch=0.9; __sim(0.05)"); await P.snap("t_sheave_in.png")
    await ev("__sim(20)"); print("yard", await j(S), flush=True)
    print("errors", await P.errors())
    await P.close()
asyncio.run(main())
