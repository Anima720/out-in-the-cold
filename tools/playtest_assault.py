# Part 4 assault vehicles (assault.js): schedule, parking, dismounts, kills en route, Juggernaut marker, enemy cap.
#   python3 tools/playtest_assault.py            logic run, 480x270 q=low (+ a few low-res shots)
#   python3 tools/playtest_assault.py --visual   same run at 800x450 q=medium with the dismount screenshots
#   --part 1 | --part 2                          run only one half (each fits the 900 s budget on the shared 2-core box)
# Wrap in `timeout 900`. One Chrome. Shots go to shots/as_*.png.
import asyncio, json, os, pathlib, sys
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
SHOTS = ROOT / "shots"; SHOTS.mkdir(exist_ok=True)
VIS = "--visual" in sys.argv
PART = sys.argv[sys.argv.index("--part") + 1] if "--part" in sys.argv else "123"   # 1: schedule, Juggernauts, cap, kills  2: all-nine stress, refill pressure  3: ops-room corpses (#6)
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
  const V = __AS().A.veh;
  for (const v of V) { if (v.arrived || v.dead) continue; const r = __ovl(v); if (r.length) __ovlog.push(v.rid + '@' + v.pos.x.toFixed(1) + ',' + v.pos.z.toFixed(1) + ':' + r.join('|')); }
  // vehicle-vehicle separation: footprints grown by 0.25 m each must never touch while either one is moving
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) { const a = V[i], b = V[j]; if ((a.arrived || a.dead) && (b.arrived || b.dead)) continue;
    if (Math.abs(a.pos.x - b.pos.x) + Math.abs(a.pos.z - b.pos.z) > 16) continue; __sepN++;
    if (__sat(__corners(a, 0.25), __corners(b, 0.25))) __seplog.push(a.rid + '/' + b.rid + '@' + a.pos.x.toFixed(1) + ',' + a.pos.z.toFixed(1)); }
  const n = __AS().aliveN(); if (n > __maxAlive) __maxAlive = n;
};
window.__seplog = []; window.__sepN = 0; window.__maxAlive = 0;
window.__corners = (v, m = 0) => { const b = v.k.box, s = Math.sin(v.yaw), c = Math.cos(v.yaw); // body footprint
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

        SETUP = """(()=>{ const P5=__P5(); __D.timers.length=0; __D.q.length=0;
          Object.assign(P5, { ph:'defend', up:0, rate:0, wave:99, spawnT:1e9, refT:1e9, dishHit:true, dishDone:true, krasDone:true, l25:true, l50:true });
          for (const m of __G.mates) { m.p5='idle'; m.path=[]; }  __home(); })()"""
        if "1" in PART:
            # ---- Part 4, straight to the defence with everything else held still (no refills: the schedule is checked alone)
            await ev("__begin(4)"); await ev("__sim(0.5)")
            SETUP = """(()=>{ const P5=__P5(); __D.timers.length=0; __D.q.length=0;
              Object.assign(P5, { ph:'defend', up:0, rate:0, wave:99, spawnT:1e9, refT:1e9, dishHit:true, dishDone:true, krasDone:true, l25:true, l50:true });
              for (const m of __G.mates) { m.p5='idle'; m.path=[]; }  __home(); })()"""
            await ev(SETUP); await ev("__sim(0.5)")
            print("start", await J("{ph:__P5().ph, en:__G.enemies.length, veh:__AS().A.veh.length, err:window.__errors}"))

            async def stage(label, setup, rids, npax, shots=None):
                print(f"== {label}", flush=True)
                await ev(setup)
                t = await J(f"__until(() => {json.dumps(rids)}.every(r => __AS().A.veh.some(v => v.rid === r)), 40)")
                vs = await J(f"__AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).map(__vinfo)")
                check(len(vs) == len(rids) and all(v['npax'] == npax for v in vs), f"{label}: spawned {[v['rid'] for v in vs]} with {[v['npax'] for v in vs]} aboard (want {npax}) after {t}s")
                if shots and 'drive' in shots: await shots['drive']()
                t = await J(f"__until(() => __AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).every(v => v.arrived), 45)")
                vs = await J(f"__AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).map(__vinfo)")
                for v in vs: check(v['arrived'] and not v['dead'], f"{v['rid']} parked at {v['pos']} yaw {v['yaw']} cols {v['cols']} in {t}s")
                if shots and 'dismount' in shots: await shots['dismount']()
                t = await J(f"__until(() => __AS().A.veh.filter(v => {json.dumps(rids)}.includes(v.rid)).every(v => v.pax.every(r => !r.h.alive || r.ride.st === 'done')), 12, 0.05)")
                for rid in rids:
                    px = await J(f"__pax(__AS().A.veh.find(v => v.rid === '{rid}'))")
                    ok = [r for r in px if r['alive'] and r['st'] == 'done' and not r['own'] and not r['noCrowd'] and r['active'] and not r['sit'] and r['enemy'] and abs(r['pos'][1]) < 0.12]
                    check(len(ok) == npax, f"{rid}: {len(ok)}/{npax} dismounted -> active enemies on the ground in {t}s")
                await ev("__drive(1.0)")
                bad = await J("(() => { const L = __AS().A.veh.filter(v => v.arrived && !v.dead), o = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (__sat(__corners(L[i], 0.15), __corners(L[j], 0.15))) o.push(L[i].rid + '/' + L[j].rid); return o; })()")
                check(not bad, f"parked vehicles keep distinct spots {bad}")

            async def suv_shot():
                await ev("__until(() => { const v = __AS().A.veh.find(v => v.rid === 'suvW'); return v && v.at >= 1.0; }, 5, 1/60)")
                await ev("(() => { const v = __AS().A.veh.find(v => v.rid === 'suvW'); __look(v.pos.x + 4.2, v.pos.z - 3.2, v.pos.x, 0.9, v.pos.z); })()"); await snap("as_suv_doors")
            await stage("SUV 20%", "__P5().up = 20", ["suvW"], 3, {"dismount": suv_shot})
            async def truck_drive():
                await ev("__until(() => { const v = __AS().A.veh.find(v => v.rid === 'truckW'); return v && v.s > v.L - 36; }, 30, 1/30)")
                await ev("(() => { const v = __AS().A.veh.find(v => v.rid === 'truckW'); const bx = v.pos.x - v.tan.x * 10.5, bz = v.pos.z - v.tan.z * 10.5; __look(bx, bz, v.pos.x - v.tan.x * 1.2, v.pos.y + 2.2, v.pos.z - v.tan.z * 1.2, v.pos.y + 0.9); })()")
                await snap("as_truck_bed")
            async def truck_jump():
                await ev("__until(() => __AS().A.veh.find(v => v.rid === 'truckW').at >= 2.22, 5, 1/60)")
                await ev("__look(-6.6, -14.6, -9.2, 1.3, -23.0)"); await snap("as_truck_jump")
            await stage("truck 28%", "__P5().up = 28", ["truckW"], 5, {"drive": truck_drive, "dismount": truck_jump})
            async def sled_shot():
                await ev("__until(() => __AS().A.veh.find(v => v.rid === 'sledSW').at >= 0.5, 5, 1/60)")
                await ev("(() => { const v = __AS().A.veh.find(v => v.rid === 'sledSW'); const f = [-Math.sin(v.yaw), -Math.cos(v.yaw)]; __look(v.pos.x + f[0] * 6.5 + f[1] * 1.5, v.pos.z + f[1] * 6.5 - f[0] * 1.5, v.pos.x, 0.9, v.pos.z); })()")
                await snap("as_sled_hop")
            await stage("sleds 42%", "__P5().up = 42", ["sledSW", "sledSE"], 2, {"dismount": sled_shot})
            await stage("SUV 50%", "__P5().up = 50", ["suvE"], 2)
            await stage("truck 60%", "__P5().up = 60", ["truckE"], 4)
            print("alive enemies:", await J("__AS().aliveN()"))
            # ~70%: three Juggernauts walk in on foot, staggered; marker on the nearest, counts the living; cleared when all are down
            print("== Juggernauts 70%", flush=True)
            await ev("__P5().up = 69.5"); await ev("__drive(0.5)")
            th = await J("(() => { const t = __G.hud.th; return { on: !!t, label: t && t.label, live: !!t && t.pos === __AS().A.th, n: __AS().A.juggs.length, trucks: __AS().A.veh.filter(v => v.rid === 'truckJ').length }; })()")
            check(th['on'] and th['label'] == '重装兵' and th['live'] and th['n'] == 1 and th['trucks'] == 0, f"first Juggernaut on foot, no truck, marker on: {th}")
            await ev("__drive(27)")
            jg = await J("(() => { const A = __AS().A, L = A.juggs.map(r => [r.h.alive, +r.h.pos.x.toFixed(1), +r.h.pos.z.toFixed(1), Object.prototype.hasOwnProperty.call(r, 'update')]); return { L, label: __G.hud.th && __G.hud.th.label, near: A.near, juggSp: __P5().juggSpawned }; })()")
            check(len(jg['L']) == 3 and all(x[0] for x in jg['L']) and jg['label'] == '重装兵 ×3' and jg['near'], f"three Juggernauts walking in, staggered; marker label counts them; gate call fired: {jg}")
            await ev("(() => { const j = __AS().A.juggs[0]; __look(-3.2, -7.4, j.h.pos.x, 1.4, j.h.pos.z); })()"); await snap("as_jugg_marker", True)
            for k in range(3):
                await ev(f"(() => {{ const j = __AS().A.juggs[{k}]; j.h.hurt(5000, new __THREE.Vector3(0, 0, -1), 'torso'); }})()"); await ev("__drive(0.3)")
                st = await J("{lab: __G.hud.th && __G.hud.th.label, done: !!__P5().juggDone, kills: __P5().juggKills, el: !!document.querySelector('.threat.on')}")
                want = ['重装兵 ×2', '重装兵', None][k]
                check(st['lab'] == want and st['done'] == (k == 2) and (st['el'] == (k < 2)), f"Juggernaut {k + 1} down: marker {st}")
            # enemy cap: the late SUV waits while > 16 are alive
            n = await J("__AS().aliveN()")
            await ev("__P5().hindIn = true"); await ev("__drive(14)")
            held = await J("{alive: __AS().aliveN(), q: __AS().A.q.length, suv: __AS().A.veh.some(v => v.rid === 'suvNW')}")
            check(n > 16 and held['q'] == 1 and not held['suv'], f"late SUV held back while {held['alive']} (>16) enemies alive: {held}")
            k = await J("__killDone()"); print("   killed", k)
            await stage("late SUV (Hind phase)", "0", ["suvNW"], 3)
            await J("__killDone()")
            await stage("sleds (Igla phase)", "__P5().ph = 'igla'", ["sledW2", "sledNE"], 2)
            await J("__killDone()")
            check(not await J("__ovlog"), f"no vehicle drove through a collider, parked vehicle or tree: {await J('__ovlog.slice(0, 8)')}")
            # destroyed en route: everybody aboard dies
            print("== destroyed en route", flush=True)
            for rid, n, how in [("truckW", 5, "v.hurt(1e5)"), ("suvE", 3, "v.hurt(1e5)"), ("sledSE", 2, "v.hurt(1e5)"), ("sledSW", 2, "v.pax[0].h.hurt(500, new __THREE.Vector3(0,0,-1), 'head')")]:
                r = await J(f"""(() => {{ const v = __AS().send('{rid}', {n}); __drive(3); const pre = v.pax.filter(r => r.h.alive).length; {how}; __drive(0.5);
                  return {{ pre, dead: v.dead, alive: v.pax.filter(r => r.h.alive).length, pos: [v.pos.x, v.pos.z].map(x => +x.toFixed(0)), cols: v.col.length }}; }})()""")
                check(r['pre'] == n and r['dead'] and r['alive'] == 0, f"{rid} destroyed en route ({how}) kills all {n} aboard: {r}")

        if "2" in PART:
            # stress: a clean yard, all nine vehicles released at the same moment -> own lanes, never touching
            print("== stress: all nine at once", flush=True)
            await ev("__begin(5)"); await ev("__sim(0.2)"); await ev(SETUP)
            await ev("(() => { const P5 = __P5(); for (const k of ['as_suv1','as_truck1','as_sleds1','as_suv2','as_truck2','as_suv3','as_sleds2']) P5[k] = true; P5.as_init = true; const A = __AS().A; for (const v of [...A.veh]) v.remove(); A.q.length = 0; for (const e of __G.enemies) e.h.remove(); __G.enemies.length = 0; })()")
            await ev("__seplog.length = 0; window.__sepN = 0; __ovlog.length = 0; for (const r of Object.keys(__AS().ROUTES)) __AS().send(r, 2)")
            t = await J("__until(() => __AS().A.veh.every(v => v.arrived), 40)")
            r = await J("{n: __AS().A.veh.length, arrived: __AS().A.veh.filter(v => v.arrived && !v.dead).length, sep: __seplog.slice(0, 6), pairs: __sepN, ovl: __ovlog.slice(0, 6)}")
            check(r['n'] == 9 and r['arrived'] == 9 and not r['sep'] and not r['ovl'] and r['pairs'] > 0, f"all nine released together: arrived in {t}s, {r['pairs']} close pairs sampled, no footprint contact {r}")
            check(not await J("__seplog.length"), "vehicles never closer than 0.5 m over the whole run")
            # pressure: from the start of the defence the yard fills to ~10 and is kept there (cap 16 never exceeded)
            print("== pressure", flush=True)
            await ev("__begin(5)"); await ev("__sim(0.2)")
            await ev("(() => { const P5 = __P5(); __D.timers.length = 0; for (const k of ['as_suv1','as_truck1','as_sleds1','as_suv2','as_truck2','as_suv3','as_sleds2']) P5[k] = true; P5.as_init = true; Object.assign(P5, { up: 5, rate: 0, wave: 99 }); for (const e of __G.enemies) e.h.remove(); __G.enemies.length = 0; window.__maxAlive = 0; })()")
            L = []
            for i in range(8):
                await ev("__drive(5)"); n = await J("__AS().aliveN()"); L.append(n)
                if i == 3: await ev("for (const e of __G.enemies) if (e.h.alive && Math.random() < 0.6) e.h.die(new __THREE.Vector3(0, 0.3, -1), 2, 3)")
            mx = await J("__maxAlive")
            print("   alive every 5 s:", L, "max", mx)
            check(L[2] >= 9 and L[-1] >= 9 and mx <= 16, f"early refill keeps ~10 alive (and refills after losses), never above 16: {L} max {mx}")
            await ev("__sim(1)")
        if "3" in PART:
            # v7 #6: bodies killed in and around the ops room (walls, furniture, the south door / snow) must come to rest and stay still
            print("== corpses come to rest", flush=True)
            await ev("__begin(5)"); await ev("__sim(0.3)")
            await ev("""(()=>{ const P5=__P5(); Object.assign(P5, { wave: 99, refT: 1e9, rate: 0, as_init: true }); __D.timers.length = 0; for (const m of __G.mates) m.p5 = 'idle';
              for (const e of __G.enemies) e.h.remove(); __G.enemies.length = 0; __P.pos.set(0, 0.15, 2.5);
              const R = __AS().Raider, pts = [[0,-4.5,0,-1],[-4.6,-4.5,0,-1],[7.4,0,1,0],[-7.4,0.2,-1,0],[0,4.6,0,1],[0.5,5.0,0,1],[-0.5,5.6,0,1],[3.3,1.9,0,1],[-7,-2,-1,0],[6.5,3.2,1,0],[-6.2,4.0,-1,1],[1.5,-1.5,1,1]];
              window.__C = pts.map(([x, z, dx, dz], i) => { const r = new R(x, z, {}); r.h.pos.y = Math.abs(x) < 8.2 && Math.abs(z) < 5.2 ? 0.15 : 0; r.update = () => {}; r.h.vel.set(dx * 4.3, 0, dz * 4.3); r.dir = [dx, dz]; return r; });
              __sim(0.1);
              __C.forEach((r, i) => { const h = r.h; for (let k = 0; k < 3; k++) { h.pos.x += r.dir[0] * 0.07; h.pos.z += r.dir[1] * 0.07; h.animate(1 / 60); } h.lastDt = 1 / 60;
                h.hurt(500, new __THREE.Vector3(r.dir[0], 0.15, r.dir[1]).normalize(), i % 3 ? 'torso' : 'head', 2, { force: 7 }); });
              window.__L = __C.map(r => r.h.j.map(v => v.clone())); })()""")
            MOT = "(() => __C.map((r, i) => { let m = 0; const L = __L[i]; for (let k = 0; k < r.h.j.length; k++) { m = Math.max(m, r.h.j[k].distanceTo(L[k])); L[k].copy(r.h.j[k]); } return [+m.toFixed(3), r.h.rag && r.h.rag.asleep ? 1 : 0]; }))()"
            await ev("__sim(16)"); await J(MOT)
            late = []
            for i in range(12): await ev("__sim(2)"); late.append(await J(MOT))
            mx = max(m for row in late for m, a in row); awake = sum(1 for m, a in late[-1] if not a)
            check(mx < 0.003 and awake == 0, f"12 bodies (walls, furniture, door threshold, snow outside) at rest after 16 s and still for 24 s more: max joint motion per 2 s {mx} m, awake {awake}")
            await ev("(() => { __P.pos.set(2.6, 0.15, -3.2); __P.camY = 0.15; const d = new __THREE.Vector3(-1.5, 0.2, 3.5).sub(new __THREE.Vector3(2.6, 1.77, -3.2)).normalize(); __P.yaw = Math.atan2(-d.x, -d.z); __P.pitch = Math.asin(d.y); })()")
            await snap("as_corpses")
        errs = await J("window.__errors")
        check(not errs, f"window.__errors empty: {errs[:3]}")
        print("\n".join(logs[-10:]))
        print("FAILS:", len(FAILS))
        for f in FAILS: print("  -", f)
        await b.close()
        sys.exit(1 if FAILS else 0)

asyncio.run(main())
