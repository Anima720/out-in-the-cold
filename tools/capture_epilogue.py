import asyncio, json, sys
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
os.makedirs("shots", exist_ok=True)
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":960,"height":540})
        logs=[]; pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:400]))
        await pg.goto(DIST + "?q=medium&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=400000)
        ev=pg.evaluate
        async def shot(n): await pg.wait_for_timeout(300); await pg.screenshot(path=f"shots/e_{n}.png", timeout=300000)
        await ev("__begin(4)"); await ev("__sim(1)")
        await ev("__G.playEpilogue(); window.__freeze=true")
        T=0
        for t,n in [(19,'a'),(28,'c')]:
            await ev(f"__sim({t-T})"); T=t; await shot(n)
        print(await ev("JSON.stringify({st:__G.state, err:window.__errors.slice(0,3)})"))
        print("\n".join(logs))
        await b.close()
asyncio.run(main())
