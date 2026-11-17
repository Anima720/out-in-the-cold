"""Radar-station roof dish: views from the yard, the roof and a low angle; also the hit/realign states. Look at shots/dish_*.png."""
import asyncio, sys
from playwright.async_api import async_playwright
from runtime import CHROME, DIST, ARGS, hold, shot, assert_clean
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width":640,"height":360}); logs=[]
        pg.on('pageerror',lambda e:logs.append('PAGEERR: '+str(e)))
        await pg.goto(DIST+'?q=medium&god=1'); await pg.wait_for_function('window.__ready || window.__fatal',timeout=300000)
        await hold(pg); ev=pg.evaluate
        await ev("__begin(5); __sim(1)")
        print(await ev("(()=>{const S=__p5().S,v=new __THREE.Vector3();S.dish.yaw.getWorldPosition(v);return JSON.stringify({yaw:v.toArray(),R:S.root.position.toArray()})})()"))
        await ev("""window.__view=(ax,ay,az,tx,ty,tz)=>{const P=__P;P.pos.set(ax,ay,az);const dx=tx-ax,dy=ty-(ay+1.6),dz=tz-az;P.yaw=Math.atan2(-dx,-dz);P.pitch=Math.atan2(dy,Math.hypot(dx,dz));__sim(0.2);};void 0""")
        views=[('yard',-1,0,16,-3.5,6.5,-0.5),('roof',-0.8,4.3,2.2,-3.5,5.6,-0.5),('roof2',-6.5,4.3,3.2,-3.5,5.6,-0.5),('low',-12,0,1,-3.5,5.0,-0.5),('side',-3.5,4.3,4.0,-3.5,5.6,-0.5)]
        for n,*v in views:
            await ev(f"__view({','.join(map(str,v))})"); await shot(pg,f'dish_{n}.png')
        await ev("__p5().S.dish.off=1.2; __sim(0.1)"); await ev("__view(-0.8,4.3,2.2,-3.5,5.6,-0.5)"); await shot(pg,'dish_hit.png')
        await assert_clean(pg,logs); await b.close()
asyncio.run(main())
