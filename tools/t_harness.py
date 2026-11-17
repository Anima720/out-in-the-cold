# Shared helpers for package-T test scripts (Parts 1-3). One Chrome per run; render loop held between screenshots.
import asyncio, os, pathlib, json
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
from runtime import CHROME, assert_clean
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
SHOTS = ROOT / "shots"; SHOTS.mkdir(exist_ok=True)

HOLD = r"""(()=>{const raf=window.requestAnimationFrame.bind(window); window.__raf=raf; window.__rafHold=true;
  window.__pend=[]; window.requestAnimationFrame=(cb)=>{ if(window.__rafHold){ window.__pend.push(cb); return 0; } return raf(cb); }; })()"""

class Page:
    async def open(self, w=480, h=270, q="low"):
        self.p = await async_playwright().start()
        self.b = await self.p.chromium.launch(executable_path=CHROME, args=ARGS)
        self.pg = await self.b.new_page(viewport={"width": w, "height": h})
        self.logs = []
        self.pg.on("pageerror", lambda e: self.logs.append("PAGEERR: " + str(e)[:600]))
        self.pg.on("console", lambda m: self.logs.append(m.type + ": " + m.text[:300]) if m.type == 'error' else None)
        await self.pg.goto(DIST + f"?q={q}&god=1")
        await self.pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
        await self.pg.evaluate(HOLD)
        return self
    async def ev(self, js):
        return await self.pg.evaluate(js)
    async def j(self, js):
        return json.loads(await self.pg.evaluate("JSON.stringify(" + js + ")"))
    async def snap(self, name):
        pg = self.pg
        await pg.evaluate("window.__rafHold=false; window.__freeze=true; window.__f0=window.__frames||0; {const q=window.__pend.splice(0); for(const c of q) window.__raf(c);}")
        await pg.wait_for_function("(window.__frames||0) >= window.__f0 + 2", polling=300, timeout=600000)
        await pg.evaluate("window.__rafHold=true")
        await pg.screenshot(path=str(SHOTS / name), timeout=200000)
        await pg.evaluate("window.__rafHold=true; window.__freeze=false")
        print("shot", SHOTS / name, flush=True)
    async def errors(self):
        return await self.pg.evaluate("window.__errors.slice(0,5)")
    async def close(self):
        if self.logs: print("\n".join(self.logs[-10:]))
        await assert_clean(self.pg, self.logs)
        await self.b.close(); await self.p.stop()
