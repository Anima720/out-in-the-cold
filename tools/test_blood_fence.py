from runtime import assert_clean
# Blood pools/splats (snow ck5, train deck ck1, mine ck10) and the chain-link fence (shoot + LOS through, walk blocked).
import asyncio, json
from b_harness import page, shot

POOLS = "JSON.stringify(__blood.inst.map((b,i)=>b.on?[i,+b.pos.x.toFixed(2),+b.pos.y.toFixed(3),+b.pos.z.toFixed(2),+b.s.toFixed(2),+__blood.aB.array[i*4].toFixed(2),b.ground]:null).filter(Boolean))"

async def main():
    p, b, pg, logs = await page(640, 360, "medium")
    ev = pg.evaluate
    try:
        # ---------- fence (station ck5) ----------
        await ev("__begin(5); __sim(3)")
        r = await ev("""(()=>{ const e = __G.enemies.find(e=>e.h.alive && !e.jugg); window.__fe = e;
          e.h.pos.set(10, 0.05, -36); e.path = []; e.state='cover'; e.coverT=99; e.t=99; e.tier = 9; e.maxTier = 0;
          for (const o of __G.enemies) if (o !== e && o.h.alive) { o.h.hidden = true; o.h.alive = false; }
          __P.pos.set(10, 0, -28.6); __P.vel.set(0,0,0); __sim(0.5); e.h.pos.set(10, 0.05, -36); __sim(0.1);
          const c = __G.camera.position.clone(), tg = e.h.j[2].clone().lerp(e.h.j[1], 0.5), d = tg.clone().sub(c).normalize();
          __P.yaw = Math.atan2(-d.x, -d.z); __P.pitch = Math.asin(d.y); __sim(0.05);
          const ph = __phys, eye = __P.eye.clone(), neck = e.h.j[1].clone();
          const dd = neck.clone().sub(eye); const L = dd.length(); dd.normalize();
          const hit = ph.raycast(eye, dd, 100, null, { factionSkip: 'us', noCorpse: true });
          const back = ph.rayBoxes(neck, dd.clone().negate(), L - 0.1, true);
          const wallStop = ph.rayBoxes(eye, dd, L, false);
          return { losPE: ph.los(eye, neck), losEP: ph.los(neck, eye), rayHitsEnemy: !!(hit && hit.ent === e.h), rayBackClear: !back, nonBulletRayStopsAtFence: !!(wallStop && wallStop.box.tag === 'fence'), hp0: e.h.hp }; })()""")
        print("fence los", json.dumps(r), flush=True)
        assert all(r[k] for k in ('losPE','losEP','rayHitsEnemy','rayBackClear','nonBulletRayStopsAtFence')), r
        hp0=r['hp0']
        r = await ev("""(()=>{ const e = __fe; let seen = false; for (let i = 0; i < 12; i++) { __sim(0.1); seen = seen || !!e.seen; }
          __input.lmb = true; __input.lmbPressed = true; __sim(0.05); __input.lmbPressed = false; __sim(0.6); __input.lmb = false; __sim(0.1);
          return { enemySeesPlayer: seen, hp: Math.round(e.h.hp), alive: e.h.alive, shots: __G.stats.shots, err: window.__errors.length }; })()""")
        print("fence shoot", json.dumps(r), flush=True)
        assert r['enemySeesPlayer'] and r['hp']<hp0 and r['shots']>0, r
        r = await ev("""(()=>{ __P.pos.set(10, 0, -29.2); __P.yaw = 0; __P.pitch = 0; for (let i = 0; i < 40; i++) { __input.down.add('KeyW'); __sim(0.05); } __input.down.delete('KeyW');
          return { playerZ: +__P.pos.z.toFixed(3), blocked: __P.pos.z > -29.94 }; })()""")
        print("fence walk", json.dumps(r), flush=True)
        assert r['blocked'], r
        # ---------- blood on snow (the enemy shot above lies outside the fence; plus one in the yard) ----------
        await ev("""(()=>{ const e = __fe; if (e.h.alive) e.h.die(new __THREE.Vector3(0,0.2,-1), 2, 5); })()""")
        await ev("__sim(6)")
        print("pools after fence kill", await ev(POOLS), flush=True)
        r = await ev("""(()=>{ const a = __G.enemies.filter(e=>!e.h.alive && e.h.hidden); const e = a[0]; e.h.hidden = false; e.h.alive = true; e.h.hp = 100; e.h.rag = null;
          e.h.pos.set(-3, 0.05, -12); e.h.firstPose = true; e.state='cover'; e.t = 99; e.coverT = 99; e.path = []; __sim(0.1); e.h.pos.set(-3, 0.05, -12); __sim(0.05);
          e.h.die(new __THREE.Vector3(0.3,0.2,-1).normalize(), 2, 4); return 1; })()""")
        for t in [0.8, 2.0, 5.0]:
            await ev(f"__sim({t} - (window.__tt||0)); window.__tt = {t}")
            print("snow pool t+%.1f" % t, await ev(POOLS), flush=True)
        await ev("__sim(1); for (const m of __G.mates) m.h.hidden = true; __P.pos.set(-2.7, 0, -10.9); __P.yaw = 0.0; __P.pitch = -0.72; __sim(0.05)")
        await ev("__G.fx.bloodSplat(new __THREE.Vector3(-1.6, 0.0, -12.2), new __THREE.Vector3(0,1,0), 0.6); __sim(0.4)")
        await shot(pg, "blood_snow.png"); await ev("window.__freeze=false")
        # ---------- train deck ck1 ----------
        await ev("__begin(1); __sim(0.3); __killAll(); __sim(5)")
        print("train pools", await ev(POOLS), flush=True)
        await ev("for (const m of __G.mates) m.h.hidden = true; __P.pos.set(0, 1.45, 10.6); __P.yaw = 0.28; __P.pitch = -0.5; __sim(0.05)")
        await shot(pg, "blood_train.png"); await ev("window.__freeze=false")
        # ---------- mine ck10 ----------
        await ev("__begin(10); __sim(9.5); __P.prone=false; __P.crouched=false; __P.pos.set(0.5, 0, -10); __P.yaw = 0; __P.pitch = -0.35; __sim(0.3)")
        r = await ev("""(()=>{ const ph = __phys, c = __G.camera.position.clone(); const d = new __THREE.Vector3(1, -0.1, -0.6).normalize();
          const h = ph.rayBoxes(c, d, 30, true); if (h) { const pt = c.clone().addScaledVector(d, h.t); __G.fx.bloodSplat(pt, h.normal, 0.6); }
          __G.fx.bloodPool(new __THREE.Vector3(0.6, 0.5, -13), 0.6); __sim(5); return h ? [h.t.toFixed(2), h.normal.toArray()] : null; })()""")
        print("mine splat wall", json.dumps(r), await ev(POOLS), flush=True)
        await ev("__P.pos.set(0.5, 0, -10); __P.yaw = -0.2; __P.pitch = -0.35; __sim(0.05)")
        await shot(pg, "blood_mine.png")
        print("errors", await ev("window.__errors.slice(0,3)"))
    finally:
        print("\n".join(logs[-6:]))
        await assert_clean(pg, logs)
        await b.close(); await p.stop()

asyncio.run(main())
