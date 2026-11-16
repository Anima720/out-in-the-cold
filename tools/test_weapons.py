# W package checks (v7): weapon keys + attachments, underbarrels, lean, F arbitration, grenade throw-back, F11.
#   python3 tools/test_weapons.py logic     -> 480x270 q=low: state checks only (prints JSON lines)
#   python3 tools/test_weapons.py shots     -> 640x360 q=medium: ADS/lean/underbarrel screenshots into shots/w_*.png
import asyncio, json, sys, os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
MODE = sys.argv[1] if len(sys.argv) > 1 else "logic"
os.makedirs("shots", exist_ok=True)
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
        vw, vh, q = (480, 270, "low") if MODE == "logic" else (640, 360, "medium")
        pg = await b.new_page(viewport={"width": vw, "height": vh})
        logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERR: " + str(e)[:600]))
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text[:300]) if m.type == 'error' else None)
        await pg.goto(DIST + f"?q={q}&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        ev = pg.evaluate
        await ev("""(()=>{const raf=window.requestAnimationFrame.bind(window); window.__raf=raf; window.__rafHold=true;
          window.__pend=[]; window.requestAnimationFrame=(cb)=>{ if(window.__rafHold){ window.__pend.push(cb); return 0; } return raf(cb); }; })()""")
        async def snap(path):
            await ev("window.__rafHold=false; window.__f0=window.__frames||0; {const q=window.__pend.splice(0); for(const c of q) window.__raf(c);}")
            await pg.wait_for_function("(window.__frames||0) >= window.__f0 + 1", polling=300, timeout=600000)
            await pg.screenshot(path=path, timeout=200000)
            await ev("window.__rafHold=true")
            print("shot", path, flush=True)
        async def out(tag, js):
            r = await ev(js)
            print(tag, json.dumps(r, ensure_ascii=False), flush=True)
            return r
        WS = "({cur:__WP.cur, prim:__WP.prim, ammo:__WP.ammo, res:__WP.reserve, att:__WP.att[__WP.prim], ub:__WP.ub&&{k:__WP.ub.kind,a:__WP.ub.ammo,r:__WP.ub.reserve}, ubOn:__WP.ubOn, err:window.__errors.slice(0,3)})"
        await ev("__begin(10)"); await ev("__sim(1.0)")
        await out("start", WS)
        if MODE == "logic":
            # every weapon key: give it (with attachments), fire, check sight data
            r = await ev("""(()=>{ const out=[]; const give=window.__wpn.giveWeapon, roll=__G.rollAtt;
              for (const k of ['m4','ak','ak12','smg','saiga','svd','pkm','pistol','rpg']) {
                const att = k==='ak'||k==='m4'||k==='ak12' ? {optic: k==='ak'?'holo':k==='m4'?'x2':'reddot', under: k==='m4'?'gl':k==='ak'?'gl':'shotgun'} : roll(k);
                give(k, undefined, undefined, att); __sim(0.7);
                const W=__WP; const a0=W.ammo; __input.lmb=true; __input.lmbPressed=true; __sim(0.35); __input.lmb=false; __sim(0.3);
                out.push([k, W.cur, a0, W.ammo, JSON.stringify(W.att[W.prim]), W.m.optic||'-', W.m.ub? 'ub':'-', +W.m.sightY.toFixed(3), window.__wpn.adsFov()]);
              } return out; })()""")
            for x in r: print("gun", json.dumps(x, ensure_ascii=False), flush=True)
            # underbarrels: M4 + M203 then AK-12 + Masterkey
            await out("gl", """(()=>{ const give=window.__wpn.giveWeapon; give('m4',30,90,{optic:'reddot',under:'gl'}); __sim(0.8);
              __input.pressed.add('KeyX'); __sim(0.5); const on=__WP.ubOn, a0=__WP.ammo;
              __P.pitch=0.25; __input.lmbPressed=true; __input.lmb=true; __sim(0.05); __input.lmb=false; const n=window.__wpn.GL.length; __sim(3.0);
              const a1=__WP.ammo, rel=__WP.reloadT; __sim(2.5);
              return {on, a0, a1, flying:n, glLeft:window.__wpn.GL.length, rel, after:__WP.ammo, res:__WP.reserve, def:window.__wpn.curDef().name, err:window.__errors.slice(0,3)}; })()""")
            await out("sg", """(()=>{ const give=window.__wpn.giveWeapon; give('ak12',30,90,{optic:'holo',under:'shotgun'}); __sim(0.8);
              __input.pressed.add('KeyX'); __sim(0.5); const on=__WP.ubOn, a0=__WP.ammo, name=window.__wpn.curDef().name;
              __input.lmbPressed=true; __input.lmb=true; __sim(0.05); __input.lmb=false; __sim(0.9); const a1=__WP.ammo;
              __input.pressed.add('KeyX'); __sim(0.5); return {on, name, a0, a1, back:__WP.ubOn, rifle:__WP.ammo, err:window.__errors.slice(0,3)}; })()""")
            # melee vs interaction: mine laptop prompt in ck 10
            await out("cave", "({phase:__D.phase, cv:__D.cv && Object.keys(__D.cv).slice(0,30), pos:__P.pos.toArray().map(v=>+v.toFixed(2))})")
        print("errors", await ev("window.__errors"), flush=True)
        for l in logs[:20]: print(l)
        await b.close()

asyncio.run(main())
