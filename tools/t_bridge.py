# Package T: bridge finale (#12) — Hind lines up, salvo, span blows, brake, loco tips, jump, cars go over, hand-off.
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from t_harness import Page
Q = sys.argv[1] if len(sys.argv) > 1 else "medium"
SHOTS = len(sys.argv) <= 2 or sys.argv[2] != "noshots"

async def main():
    P = await Page().open(560, 315, Q)
    ev, j = P.ev, P.j
    S = """{ph:__D.phase, dL:+(-70-(__G.s-__gorge.D)).toFixed(0), v:+__G.v.toFixed(1), ts:+__G.timeScale.toFixed(2), br:__gorge.broken,
      hind:__G.hind?[__G.hind.state, __G.hind.pos.toArray().map(v=>+v.toFixed(0))]:null, rk:__G.rockets.length,
      g:__D.grinch.cab?__D.grinch.cab.st:__D.grinch.mode, gp:__D.grinch.h.pos.toArray().map(v=>+v.toFixed(1)), t:__D.truck.mode,
      f:Object.keys(__D.f).join(','), cur:__D.cur&&__D.cur.id, st:__G.state, P:__P.pos.toArray().map(v=>+v.toFixed(1)), jumped:__P.jumped,
      cars:__T.cars.map(c=>c.landed?'L':c.tip?'T':c.falling?'F':'-').join(''), err:window.__errors.length}"""
    await ev("__begin(3)"); await ev("__sim(1)")
    shots = {}
    jumped = False; t = 0.0; landT = None
    while t < 60:
        await ev("__sim(0.5)"); t += 0.5
        r = await j(S)
        f = r['f']
        print(round(t, 1), r, flush=True)
        if SHOTS and 'lineup' in f and 'lu' not in shots and r['dL'] < 200:
            shots['lu'] = 1; await ev("__P.yaw=-0.3; __P.pitch=0.08; __sim(0.02)"); await P.snap("t_br_lineup.png")
        if 'side' not in f and 't4' in f and not shots.get('dis'):
            shots['dis'] = 1; await ev("__input.pressed.add('KeyF'); __sim(0.05); __P.pos.set(1.75,1.39,-44.5); __P.yaw=-0.12; __P.pitch=0.0; __sim(0.3)")
            print("side", await j("{m:__P.mounted, P:__P.pos.toArray().map(v=>+v.toFixed(2)), side:!!__D.f.side}"))
        if SHOTS and 'salvo' in f and 's1' not in shots:
            shots['s1'] = 1; await ev("__P.autoLook=null; __P.yaw=-0.12; __P.pitch=0.02; __sim(0.35)"); await P.snap("t_br_salvo.png")
        if SHOTS and 'hitT' in f and 's2' not in shots:
            shots['s2'] = 1; await ev("__P.autoLook=null; __P.yaw=-0.04; __P.pitch=0.0; __sim(0.3)"); await P.snap("t_br_blast.png")
        if SHOTS and 'hitT' in f and 's3' not in shots and 's2' in shots:
            shots['s3'] = 1; await ev("__P.yaw=-0.04; __P.pitch=-0.05; __sim(1.5)"); await P.snap("t_br_fall.png")
        if r['st'] != 'play' or r['ph'] == 'p5': break
        if 'jumpOpen' in f and not jumped:
            await ev("__P.autoLook=null; __P.yaw=-0.05; __P.pitch=0.0; __sim(2.0)")
            if SHOTS: await P.snap("t_br_tip.png")
            print("tip", await j(S))
            await ev("__input.pressed.add('Space'); __sim(0.05)"); jumped = True
            await ev("__sim(0.7)")
            if SHOTS: await P.snap("t_br_air.png")
            print("air", await j(S))
        if 'landed' in f and landT is None:
            landT = t
        if landT is not None and SHOTS and 'l1' not in shots and t - landT >= 1.5:
            shots['l1'] = 1; await P.snap("t_br_land1.png")
        if landT is not None and SHOTS and 'l2' not in shots and t - landT >= 4.0:
            shots['l2'] = 1; await P.snap("t_br_land2.png")
        if 'ending' in f:
            await ev("__sim(8)"); print("end", await j("{lvl:__G.lvl, ck:__D.ck, ph:__D.phase, st:__G.state, err:window.__errors.length}")); break
    print("errors", await P.errors())
    await P.close()
asyncio.run(main())
