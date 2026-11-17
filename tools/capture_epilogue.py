import asyncio, json, sys
import pathlib, os
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
from runtime import CHROME, assert_clean, hold, shot as stable_shot
os.makedirs(ROOT / "shots", exist_ok=True)
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":640,"height":360})
        logs=[]; pg.on("pageerror", lambda e: logs.append("PAGEERR: "+str(e)[:400]))
        await pg.goto(DIST + "?q=medium&god=1")
        await pg.wait_for_function("window.__ready || window.__fatal", timeout=400000)
        ev=pg.evaluate
        await hold(pg)
        async def shot(n): await stable_shot(pg, f"e_{n}.png")
        await ev("__begin(4)"); await ev("__sim(1)")
        await ev("__G.playEpilogue(); window.__freeze=true")
        T=0
        for t,n in [(12,'skyline'),(19,'a'),(28,'c'),(35,'hotel'),(46,'post1'),(51,'post2'),(54,'black'),(69,'credits'),(213,'fin')]:
            await ev(f"__sim({t-T})"); T=t; await shot(n)
        print(await ev("JSON.stringify({st:__G.state, err:window.__errors.slice(0,3)})"))
        await ev("__sim(7)"); assert await ev("__G.state==='end'"), "epilogue did not reach end card"; print(await ev("JSON.stringify({st:__G.state, err:window.__errors.slice(0,3)})"))
        print("\n".join(logs))
        await assert_clean(pg, logs); await b.close()
asyncio.run(main())
