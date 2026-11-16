# Part 4 assault vehicles (assault.js): schedule, parking, dismounts, kills en route, Juggernaut marker, enemy cap.
#   python3 tools/playtest_assault.py            logic run, 480x270 q=low (+ a few low-res shots)
#   python3 tools/playtest_assault.py --visual   same run at 800x450 q=medium with the dismount screenshots
# Wrap in `timeout 900`. One Chrome. Shots go to shots/as_*.png.
import asyncio, json, os, pathlib, sys
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
SHOTS = ROOT / "shots"; SHOTS.mkdir(exist_ok=True)
VIS = "--visual" in sys.argv
W, H, Q = (800, 450, "medium") if VIS else (480, 270, "low")
TAG = "" if VIS else "_low"

HELPERS = r"""
window.__AS = () => __assault();
window.__P5 = () => __p5().P5;
window.__until = (fn, max, step = 0.1) => { let t = 0; while (t < max && !fn()) { __drive(step); t += step; } return +t.toFixed(2); };
// sim with an overlap watch: a moving vehicle's footprint must never cross a collider (static or a parked vehicle) or a tree
window.__ovlog = [];
window.__trees = null;
window.__drive = (sec) => {
  __sim(sec);
  if (!__trees) { __trees = []; const root = __p5().S.root; const m4 = new __THREE.Matrix4(), p = new __THREE.Vector3();
    root.traverse((o) => { if (o.isInstancedMesh && o.geometry.boundingSphere && o.geometry.boundingSphere.radius > 3.5) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); const s = Math.hypot(m4.elements[0], m4.elements[1], m4.elements[2]); __trees.push([p.x, p.z, s]); } }); }
  for (const v of __AS().A.veh) { if (v.arrived || v.dead) continue; const r = __ovl(v); if (r.length) __ovlog.push(v.rid + '@' + v.pos.x.toFixed(1) + ',' + v.pos.z.toFixed(1) + ':' + r.join('|')); }
};
window.__corners = (v, m = 0) => { const b = v.k.box, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
  return [[b[0] - m, b[4] - m], [b[1] + m, b[4] - m], [b[1] + m, b[5] + m], [b[0] - m, b[5] + m]].map(([lx, lz]) => [v.pos.x + lx * c + lz * s, v.pos.z - lx * s + lz * c]); };
window.__sat = (A, B) => { for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], nx = -(b[1] - a[1]), nz = b[0] - a[0];
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of A) { const d = p[0] * nx + p[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const p of B) { const d = p[0] * nx + p[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 < b0 || b1 < a0) return false; } return true; };
window.__ovl = (v) => { const P = __corners(v), out = [];
  for (const bx of __G.boxes) { if (!bx.enabled || v.col.includes(bx) || bx.max.y < v.pos.y + 0.3 || bx.min.y > v.pos.y + v.k.box[3]) continue;
    if (__sat(P, [[bx.min.x, bx.min.z], [bx.max.x, bx.min.z], [bx.max.x, bx.max.z], [bx.min.x, bx.max.z]])) out.push('box(' + bx.min.x.toFixed(1) + ',' + bx.min.z.toFixed(1) + '..' + bx.max.x.toFixed(1) + ',' + bx.max.z.toFixed(1) + ')'); }
  for (const [x, z, s] of __trees) { if (Math.abs(x - v.pos.x) > 12 || Math.abs(z - v.pos.z) > 12) continue;   // trunk + lowest branch skirt (~1.6 m * scale)
    let inside = true, best = 1e9; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez)));
      best = Math.min(best, Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z)); if ((x - a[0]) * ez - (z - a[1]) * ex > 0) inside = false; }
    if (inside || best < 1.6 * s) out.push('tree(' + x.toFixed(0) + ',' + z.toFixed(0) + ')'); }
  return out; };
window.__vinfo = (v) => ({ rid: v.rid, kind: v.kind, arrived: v.arrived, dead: v.dead, pos: [+v.pos.x.toFixed(2), +v.pos.z.toFixed(2)], yaw: +v.yaw.toFixed(3), at: +v.at.toFixed(2), npax: v.pax.length, cols: v.col.length,
  end: v.R.pts[v.R.pts.length - 1] });
window.__pax = (v) => v.pax.map((r) => ({ alive: r.h.alive, st: r.ride.st, own: Object.prototype.hasOwnProperty.call(r, 'update'), noCrowd: !!r.h.noCrowd, active: !!r.active,
  state: r.state, sit: !!r.h.sit, enemy: __G.enemies.includes(r), jugg: !!r.jugg, pos: [+r.h.pos.x.toFixed(2), +r.h.pos.y.toFixed(2), +r.h.pos.z.toFixed(2)], spot: !!r.spot }));
// camera = player eye; frozen frame so the shot shows exactly this state
window.__look = (px, pz, tx, ty, tz, up = 0) => { __P.pos.set(px, up, pz); __P.vel.set(0, 0, 0); __P.camY = up; __P.crouched = false; __P.eyeY = 1.62;
  const dx = tx - px, dy = ty - (up + 1.62), dz = tz - pz; __P.yaw = Math.atan2(-dx, -dz); __P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
window.__home = () => { __P.pos.set(0, 0.15, 2); __P.vel.set(0, 0, 0); __P.camY = 0.15; };
window.__killDone = () => { let n = 0; for (const e of __G.enemies) if (e.h.alive && !e.jugg && (!e.ride || e.ride.st === 'done')) { e.h.die(new __THREE.Vector3(0, 0.3, -1), 2, 3); n++; } return n; };
"""

FAILS = []
def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
    if not cond: FAILS.append(msg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": W, "height": H})
        logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERR: " + str(e)[:600]))
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text[:300]) if m.type == 'error' else None)
        await pg.goto(DIST + f"?q={Q}&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev = pg.evaluate
        await ev(HELPERS)
        # hold the render loop between shots (software GL); __sim drives the game
        await ev("""(()=>{const raf=window.requestAnimationFrame.bind(window); window.__raf=raf; window.__rafHold=true;
          window.__pendL=[];
          window.requestAnimationFrame=(cb)=>{ if(window.__rafHold){ window.__pendL.push(cb); return 0; } return raf(cb); }; })()""")
        async def snap(name, hud=False):
            await ev("__G.hud.show(" + ("true" if hud else "false") + "); window.__freeze=true; __WP.hidden=true; window.__rafHold=false; window.__f0=window.__frames||0; (() => { const L=window.__pendL; window.__pendL=[]; for (const c of L) window.__raf(c); })();")
            try: await pg.wait_for_function("(window.__frames||0) >= window.__f0 + 2", polling=300, timeout=180000)
            except Exception as e:
                print("  snap timeout", name, await ev("JSON.stringify({f: window.__frames, f0: window.__f0, pend: window.__pendL.length, hold: window.__rafHold, err: window.__errors.slice(-3)})"), flush=True)
                FAILS.append("snap " + name); await ev("window.__rafHold=true; window.__freeze=false; __WP.hidden=false; __home()"); return
            await pg.screenshot(path=str(SHOTS / f"{name}{TAG}.png"), timeout=200000)
            await ev("window.__rafHold=true; window.__freeze=false; __WP.hidden=false; __G.hud.show(true); __home()")
            print("  shot", f"shots/{name}{TAG}.png", flush=True)
        async def J(expr): return json.loads(await ev(f"JSON.stringify({expr})"))

        # ---- Part 4, straight to the defence with everything else held still
        await ev("__begin(4)"); await ev("__sim(0.5)")
        await ev("""(()=>{ const P5=__P5(); __D.timers.length=0; __D.q.length=0;
          Object.assign(P5, { ph:'defend', up:0, rate:0, wave:99, spawnT:1e9, dishHit:true, dishDone:true, krasDone:true, l25:true, l50:true });
          for (const m of __G.mates) { m.p5='idle'; m.path=[]; }  __home(); })()""")
        await ev("__sim(0.5)")
        print("start", await J("{ph:__P5().ph, en:__G.enemies.length, veh:__AS().A.veh.length, err:window.__errors}"))
        parked = []   # (rid, corners)

        async def stage(label, setup, rids, npax, shots=None):
            print(f"== {label}", flush=True)
            before = await J("__AS().A.veh.map(v=>v.rid)")
            await ev(setup)
            t = await J(f"__until(() => {json.dumps(rids)}.every(r => __AS().A.veh.some(v => v.rid === r)), 40)")
            vs = await J(f"__AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).map(__vinfo)")
            check(len(vs) == len(rids) and all(v['npax'] == npax for v in vs), f"{label}: spawned {[v['rid'] for v in vs]} with {[v['npax'] for v in vs]} aboard (want {npax}) after {t}s")
            if shots and 'drive' in shots: await shots['drive']()
            t = await J(f"__until(() => __AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).every(v => v.arrived), 45)")
            vs = await J(f"__AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).map(__vinfo)")
            for v in vs:
                d = ((v['pos'][0] - v['end'][0]) ** 2 + (v['pos'][1] - v['end'][1]) ** 2) ** 0.5
                check(v['arrived'] and not v['dead'] and d < 0.05, f"{v['rid']} parked at {v['pos']} (spot {v['end']}, err {d:.3f}) yaw {v['yaw']} cols {v['cols']} in {t}s")
            # dismount: each rider leaves its seat on schedule; sample mid-dismount
            if shots and 'dismount' in shots: await shots['dismount']()
            t = await J(f"__until(() => __AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).every(v => v.pax.every(r => !r.h.alive || r.ride.st === 'done')), 12, 0.05)")
            for rid in rids:
                px = await J(f"__pax(__AS().A.veh.find(v => v.rid === '{rid}'))")
                ok = [r for r in px if r['alive'] and r['st'] == 'done' and not r['own'] and not r['noCrowd'] and r['active'] and not r['sit'] and r['enemy'] and abs(r['pos'][1]) < 0.12]
                check(len(ok) == npax, f"{rid}: {len(ok)}/{npax} dismounted -> active enemies on the ground in {t}s  {[(r['state'], r['pos']) for r in px]}")
            await ev("__drive(1.5)")
            mv = await J(f"__AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).flatMap(v => v.pax.filter(r => r.h.alive && !r.jugg).map(r => [r.state, +Math.hypot(r.h.vel.x, r.h.vel.z).toFixed(1)]))")
            print("   after 1.5s AI:", mv)
            # all parked vehicles keep distinct, non-overlapping spots
            cs = await J("__AS().A.veh.filter(v => v.arrived && !v.dead).map(v => [v.rid, __corners(v, 0.15)])")
            bad = await J("(() => { const L = __AS().A.veh.filter(v => v.arrived && !v.dead), o = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (__sat(__corners(L[i], 0.15), __corners(L[j], 0.15))) o.push(L[i].rid + '/' + L[j].rid); return o; })()")
            check(not bad, f"parked vehicles distinct and apart ({len(cs)} parked) {bad}")

        # 20% SUV (3), shots of the doors opening
        async def suv_shot():
            await ev("__until(() => { const v = __AS().A.veh.find(v => v.rid === 'suvW'); return v && v.at >= 1.0; }, 5, 1/60)")
            await ev("__look(-15.2, -12.2, -20, 0.9, -17.6)"); await snap("as_suv_doors")
            await ev("__until(() => __AS().A.veh.find(v => v.rid === 'suvW').at >= 1.5, 3, 1/60)")
            await ev("__look(-24.6, -14.0, -20, 0.9, -17.6)"); await snap("as_suv_doors_right")
        await stage("SUV 20%", "__P5().up = 20", ["suvW"], 3, {"dismount": suv_shot})
        # 28% truck (5): seated in the bed on the way in, then jumping down one by one
        async def truck_drive():
            await ev("__until(() => { const v = __AS().A.veh.find(v => v.rid === 'truckW'); return v && v.s > v.L - 34; }, 30, 1/30)")
            await ev("(() => { const v = __AS().A.veh.find(v => v.rid === 'truckW'); const bx = v.pos.x - v.tan.x * 10.5, bz = v.pos.z - v.tan.z * 10.5; __look(bx, bz, v.pos.x - v.tan.x * 1.2, v.pos.y + 2.2, v.pos.z - v.tan.z * 1.2, v.pos.y + 0.9); })()")
            await snap("as_truck_bed")
        async def truck_jump():
            await ev("__until(() => __AS().A.veh.find(v => v.rid === 'truckW').at >= 1.45, 5, 1/60)")
            await ev("__look(-1.6, -24.2, -9.5, 1.6, -23.0)"); await snap("as_truck_rear")
            await ev("__until(() => __AS().A.veh.find(v => v.rid === 'truckW').at >= 2.22, 5, 1/60)")
            await ev("__look(-6.6, -14.6, -9.2, 1.3, -23.0)"); await snap("as_truck_jump")
        await stage("truck 28%", "__P5().up = 28", ["truckW"], 5, {"drive": truck_drive, "dismount": truck_jump})
        # 42% snowmobiles (2 x 2)
        async def sled_shot():
            await ev("__until(() => __AS().A.veh.find(v => v.rid === 'sledE1').at >= 0.5, 5, 1/60)")
            await ev("(() => { const v = __AS().A.veh.find(v => v.rid === 'sledE1'); const f = [-Math.sin(v.yaw), -Math.cos(v.yaw)]; __look(v.pos.x + f[0] * 6.5 + f[1] * 1.5, v.pos.z + f[1] * 6.5 - f[0] * 1.5, v.pos.x, 0.9, v.pos.z); })()")
            await snap("as_sled_hop")
        await stage("sleds 42%", "__P5().up = 42", ["sledNW1", "sledE1"], 2, {"dismount": sled_shot})
        await stage("SUV 50%", "__P5().up = 50", ["suvE"], 2)
        await stage("truck 60%", "__P5().up = 60", ["truckE"], 4)
        print("alive enemies:", await J("__AS().aliveN()"))
        # ~70%: part5 calls sendJuggTruck(); the threat marker follows him from the truck bed until he dies
        async def jugg_drive():
            th = await J("(() => { const t = __G.hud.th; return { on: !!t, label: t && t.label, live: !!t && t.pos === __AS().A.th, el: !!document.querySelector('.threat.on') }; })()")
            check(th['on'] and th['label'] == '重装兵' and th['live'], f"Juggernaut threat marker on while he rides in: {th}")
        await stage("Juggernaut truck 70%", "__P5().up = 69.5", ["truckJ"], 3, {"drive": jugg_drive})
        jg = await J("(() => { const j = __G.enemies.find(e => e.jugg); const A = __AS().A; return { alive: j && j.h.alive, marker: A.thOn, mpos: [A.th.x, A.th.y, A.th.z].map(v => +v.toFixed(1)), jpos: j && [j.h.pos.x, j.h.pos.z].map(v => +v.toFixed(1)), st: j && j.state }; })()")
        check(jg['alive'] and jg['marker'] and abs(jg['mpos'][0] - jg['jpos'][0]) < 1 and abs(jg['mpos'][2] - jg['jpos'][1]) < 1, f"Juggernaut marker follows him: {jg}")
        await ev("__drive(3)")
        await ev("(() => { const j = __G.enemies.find(e => e.jugg); __look(-3.2, -7.4, j.h.pos.x, 1.4, j.h.pos.z); })()"); await snap("as_jugg_marker", True)
        await ev("__G.enemies.filter(e => e.jugg).forEach(e => e.h.hurt(5000, new __THREE.Vector3(0, 0, -1), 'torso'))"); await ev("__drive(0.3)")
        jg = await J("{marker: __AS().A.thOn, jugg: !!__AS().A.jugg, juggDone: __P5().juggDone, hud: !!__G.hud.th, thEl: !!document.querySelector('.threat.on')}")
        check(not jg['marker'] and not jg['jugg'] and jg['juggDone'] and not jg['hud'] and not jg['thEl'], f"marker cleared when the Juggernaut dies: {jg}")
        # enemy cap: the late SUV waits while > 16 are alive
        n = await J("__AS().aliveN()")
        await ev("__P5().hindIn = true"); await ev("__drive(14)")
        held = await J("{alive: __AS().aliveN(), q: __AS().A.q.length, suv: __AS().A.veh.some(v => v.rid === 'suvNW')}")
        check(n > 16 and held['q'] == 1 and not held['suv'], f"late SUV held back while {held['alive']} (>16) enemies alive: {held}")
        k = await J("__killDone()"); print("   killed", k)
        await stage("late SUV (Hind phase)", "0", ["suvNW"], 3)
        await J("__killDone()")
        await stage("sleds (Igla phase)", "__P5().ph = 'igla'", ["sledNW2", "sledE2"], 2)
        await J("__killDone()")
        check(not await J("__ovlog"), f"no vehicle drove through a collider, parked vehicle or tree: {await J('__ovlog.slice(0, 8)')}")
        # destroyed en route: everybody aboard dies
        print("== destroyed en route", flush=True)
        for rid, n, how in [("truckW", 5, "v.hurt(1e5)"), ("suvE", 3, "v.hurt(1e5)"), ("sledE1", 2, "v.hurt(1e5)"), ("sledNW1", 2, "v.pax[0].h.hurt(500, new __THREE.Vector3(0,0,-1), 'head')")]:
            r = await J(f"""(() => {{ const v = __AS().send('{rid}', {n}); __drive(3); const pre = v.pax.filter(r => r.h.alive).length; {how}; __drive(0.5);
              return {{ pre, dead: v.dead, alive: v.pax.filter(r => r.h.alive).length, pos: [v.pos.x, v.pos.z].map(x => +x.toFixed(0)), cols: v.col.length, enemies: v.pax.every(r => __G.enemies.includes(r)) }}; }})()""")
            check(r['pre'] == n and r['dead'] and r['alive'] == 0, f"{rid} destroyed en route ({how}) kills all {n} aboard: {r}")
        await ev("__drive(4)")
        # checkpoint restart clears everything; checkpoint 5 skips the long-past arrivals
        await ev("__AS().send('truckJ', 3, { jugg: true })"); await ev("__drive(1)")
        on = await J("__AS().A.thOn")
        await ev("__begin(5)"); await ev("__sim(0.2)")
        r = await J("{veh: __AS().A.veh.map(v => v.rid), sleds: __G.sleds.length, marker: __AS().A.thOn || !!__G.hud.th, thEl: !!document.querySelector('.threat.on'), q: __AS().A.q.length, P5: (({as_suv1, as_truck1, as_sleds1, as_suv2}) => ({as_suv1, as_truck1, as_sleds1, as_suv2}))(__P5())}")
        check(on and not r['marker'] and not r['thEl'] and r['P5']['as_suv1'] and r['P5']['as_truck1'] and r['P5']['as_sleds1'] and r['P5']['as_suv2'] and set(r['veh']) <= {'suvE'},
              f"restart: marker was {on}, now cleared; ck5 skips 20/28/42%, queues the 50% SUV: {r}")
        await ev("__sim(3)")
        errs = await J("window.__errors")
        check(not errs, f"window.__errors empty: {errs[:3]}")
        print("\n".join(logs[-10:]))
        print("FAILS:", len(FAILS))
        for f in FAILS: print("  -", f)
        await b.close()
        sys.exit(1 if FAILS else 0)

asyncio.run(main())
