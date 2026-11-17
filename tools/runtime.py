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
    # Freeze simulation while releasing *all* queued callbacks (HUD.fade also owns rAF callbacks).
    await pg.evaluate("window.__freeze=true; window.__testHold=false; window.__testF0=window.__frames||0; {const q=window.__testPend.splice(0); for(const cb of q) window.__testRaf(cb);}")
    await pg.wait_for_function("(window.__frames||0)>=window.__testF0+2", polling=300, timeout=200000)
    await pg.evaluate("window.__testHold=true")
    await pg.screenshot(path=str(SHOTS / name), timeout=200000)
    await pg.evaluate("window.__freeze=false")
    print("shot", name, flush=True)

async def assert_clean(pg, logs=()):
    errs = await pg.evaluate("({errors:window.__errors||[],fatal:window.__fatal||null})")
    page_errors = [x for x in logs if x.startswith("PAGEERR:")]
    print("runtime", errs, "pageErrors", page_errors, flush=True)
    assert not errs["fatal"] and not errs["errors"] and not page_errors, str((errs, page_errors))
