from runtime import assert_clean
# Character collision test: min clearance over time per level, head-on lane passing on the train, player pushes.
import asyncio, json
from b_harness import page, shot

async def main():
    p, b, pg, logs = await page()
    ev = pg.evaluate
    try:
        # ---- train ck1: player walks the lane, mates follow; mates must stay on the train
        await ev("__begin(1); __sim(0.5)")
        r = await ev("""(()=>{ let minY = 9; const res = __track(24, 0.05, (t)=>{ __P.yaw=0; __input.down.add('KeyW'); if (t > 12) __input.down.delete('KeyW');
            for (const m of __G.mates) if (!m.arc && !m.h.hidden && (m.mode==='follow'||m.mode==='hold')) minY = Math.min(minY, m.h.pos.y); });
          __input.down.delete('KeyW'); res.mateMinY = +minY.toFixed(2); res.P = __P.pos.toArray().map(v=>+v.toFixed(1)); return res; })()""")
        print("train ck1 walk", json.dumps(r), flush=True)
        # ---- head-on: two mates pass each other on a gondola and through an end-wall door
        await ev("__killAll(); __sim(0.5); __P.pos.set(0,1.45,24); __sim(0.2)")
        for name, za, zb in [("gondola", -25.5, -35.5), ("door", -19.5, -29.5)]:
            r = await ev(f"""(()=>{{ const [A,B] = __G.mates; for (const m of __G.mates.slice(2)) m.h.hidden = true;
              A.mode = B.mode = 'hold'; A.place(0,{za}); B.place(0,{zb}); A.target.set(0,0,{zb}); B.target.set(0,0,{za});
              let tA=-1,tB=-1,mx=0,t=0; const res = __track(9, 0.05, (tt)=>{{ t=tt; mx=Math.max(mx,Math.abs(A.h.pos.x),Math.abs(B.h.pos.x));
                if (tA<0 && Math.abs(A.h.pos.z-({zb}))<0.45) tA=tt; if (tB<0 && Math.abs(B.h.pos.z-({za}))<0.45) tB=tt; }});
              res.arriveA=+tA.toFixed(2); res.arriveB=+tB.toFixed(2); res.maxAbsX=+mx.toFixed(3); res.yA=+A.h.pos.y.toFixed(2); res.yB=+B.h.pos.y.toFixed(2); return res; }})()""")
            print("head-on", name, json.dumps(r), flush=True)
        # ---- player walks into a mate standing on the lane: mate yields sideways, player barely slowed
        r = await ev("""(()=>{ const A = __G.mates[0]; A.place(0,-12.5+0.0); A.target.copy(A.h.pos); __P.pos.set(0,1.45,-6); __P.vel.set(0,0,0); __sim(0.3);
          const z0 = __P.pos.z; const res = __track(2.0, 0.05, ()=>{ __P.yaw=0; __input.down.add('KeyW'); }); __input.down.delete('KeyW');
          res.playerDz = +(z0-__P.pos.z).toFixed(2); res.mate = A.h.pos.toArray().map(v=>+v.toFixed(2)); return res; })()""")
        print("player->mate", json.dumps(r), flush=True)
        # ---- station ck5 fight
        await ev("__begin(5); __sim(0.5)")
        r = await ev("""(()=>{ const res = __track(40, 0.1); res.en = __G.enemies.filter(e=>e.h.alive).length;
          res.mates = __G.mates.map(m=>[m.name[0], m.p5, m.h.pos.toArray().map(v=>+v.toFixed(1))]); return res; })()""")
        print("station ck5", json.dumps(r), flush=True)
        # player vs enemy 50/50 at the station
        r = await ev("""(()=>{ __killAll(); __sim(0.2); const e = __G.enemies.find(e=>!e.jugg); return 0; })()""")
        # ---- mine ck10: mates walk to their posts
        await ev("__begin(10); __sim(0.5)")
        r = await ev("""(()=>{ const res = __track(22, 0.1); res.mates = __G.mates.map(m=>[m.name[0], m.p5, m.h.pos.toArray().map(v=>+v.toFixed(1))]); return res; })()""")
        print("mine ck10", json.dumps(r), flush=True)
        # two mates crossing paths in the mine with the player in between
        r = await ev("""(()=>{ const [A,B,C] = __G.mates; __P.pos.set(0,0,-20);
          window.__gm(A, [[0,-26]]); window.__gm(B, [[0,-14]]); A.h.pos.set(0,0,-14); B.h.pos.set(0.05,0,-26);
          const res = __track(8, 0.05); res.A=[A.p5, A.h.pos.toArray().map(v=>+v.toFixed(2))]; res.B=[B.p5, B.h.pos.toArray().map(v=>+v.toFixed(2))]; return res; })()""") if await ev("!!window.__gm") else None
        if r: print("mine cross", json.dumps(r), flush=True)
        await shot(pg, "crowd_mine.png")
        print("errors", await ev("window.__errors.slice(0,3)"))
    finally:
        print("\n".join(logs[-8:]))
        await assert_clean(pg, logs)
        await b.close(); await p.stop()

asyncio.run(main())
