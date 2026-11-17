"""Portable headless-test setup; preserve every rAF callback, fail on every runtime error."""
import os, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME") or shutil.which("google-chrome") or shutil.which("chromium")
SHOTS = ROOT / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
HOLD = r"""(()=>{if(window.__testRaf) return; const raf=window.requestAnimationFrame.bind(window);
  window.__testRaf=raf; window.__testHold=true; window.__testPend=[];
  window.requestAnimationFrame=(cb)=>{if(window.__testHold){window.__testPend.push(cb);return 0;}return raf(cb);};})()"""

async def hold(pg):
    await pg.evaluate(HOLD)

async def shot(pg, name):
    state = "({frames:window.__frames||0,queued:window.__testPend.length,errors:window.__errors,fatal:window.__fatal||null})"
    print("shot start", name, await pg.evaluate(state), flush=True)
    # Keep the compositor active until capture completes, without advancing simulation.
    # HUD.fade callbacks must also be released in full.
    await pg.evaluate("window.__testSavedFreeze=window.__freeze; window.__testHadFreeze=Object.prototype.hasOwnProperty.call(window,'__freeze'); window.__freeze=true; window.__testHold=false; window.__testF0=window.__frames||0; {const q=window.__testPend.splice(0); for(const cb of q) window.__testRaf(cb);}")
    try:
        await pg.wait_for_function("(window.__frames||0)>=window.__testF0+2 || !!window.__fatal || !!window.__errors?.length", polling=300, timeout=200000)
        await assert_clean(pg)
        print("shot frame-ready", name, await pg.evaluate(state), flush=True)
        await pg.screenshot(path=str(SHOTS / name), timeout=200000)
        print("shot saved", name, await pg.evaluate(state), flush=True)
    finally:
        # A callback was already registered by the last rendered frame. Keep simulation
        # frozen through two native rAF boundaries so that callback queues its successor.
        await pg.evaluate("""async()=>{window.__freeze=true;window.__testHold=true;
          await new Promise(done=>window.__testRaf(()=>window.__testRaf(done)));
          if(window.__testHadFreeze)window.__freeze=window.__testSavedFreeze;else delete window.__freeze;
          delete window.__testSavedFreeze;delete window.__testHadFreeze;}""")
        await assert_clean(pg)

async def assert_clean(pg, logs=()):
    errs = await pg.evaluate("({tracking:Array.isArray(window.__errors),errors:window.__errors,fatal:window.__fatal||null})")
    page_errors = [x for x in logs if x.startswith("PAGEERR:")]
    print("runtime", errs, "pageErrors", page_errors, flush=True)
    assert errs["tracking"] and not errs["fatal"] and not errs["errors"] and not page_errors, str((errs, page_errors))
