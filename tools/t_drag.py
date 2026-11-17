"""Finale drag only: force the 99% RPG outside, then print camera/Grinch geometry and shoot drag frames (shots/drag_*.png)."""
import asyncio
from playwright.async_api import async_playwright
from runtime import CHROME, DIST, ARGS, hold, shot, assert_clean
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width":640,"height":360}); logs=[]
        pg.on('pageerror',lambda e:logs.append('PAGEERR: '+str(e)))
        await pg.goto(DIST+'?q=medium&god=1'); await pg.wait_for_function('window.__ready || window.__fatal',timeout=300000)
        await hold(pg); ev=pg.evaluate
        await ev("__begin(6); __sim(1.5)")
        await ev("const P5=__p5().P5; P5.hindDown=true; P5.l90=true; P5.up=98.97; P5.rate=1; __P.pos.set(-3,0,-13); __P.yaw=0.3; __P.pitch=0.05")
        t=0
        while t<14 and not await ev("__fin.ph==='drag'"): await ev("__sim(0.2)"); t+=.2
        info="""(()=>{const g=__D.grinch.h,J={Hc:0,SL:3,EL:5,HL:7},c=__G.camera,d=new __THREE.Vector3();c.getWorldDirection(d);const f=a=>a.toArray().map(v=>+v.toFixed(2));
          return JSON.stringify({P:f(__P.pos),cam:f(c.position),dir:f(d),gp:f(g.pos),head:f(g.j[0]),SL:f(g.j[3]),EL:f(g.j[5]),HL:f(g.j[7]),hand:f(g.handL),upper:+g.j[3].distanceTo(g.j[5]).toFixed(2),fore:+g.j[5].distanceTo(g.j[7]).toFixed(2)})})()"""
        await ev("__sim(1.2)")
        for k in range(4):
            print(k, await ev(info), flush=True)
            await shot(pg,f'drag_{k}.png'); await ev("__sim(0.9)")
        await ev("__begin(6); __sim(1.5)"); await ev("const P5=__p5().P5; P5.hindDown=true; P5.l90=true; P5.up=98.97; P5.rate=1; __P.pos.set(-3,0,-13); __P.yaw=0.3; __P.pitch=0.05")
        t=0
        while t<14 and not await ev("__fin.ph==='drag'"): await ev("__sim(0.2)"); t+=.2
        await ev("__sim(1.3)")
        for n,o in [('ext1','1.3,-0.2,0.2'),('ext2','0.1,-0.3,1.4'),('ext3','-1.2,-0.1,-0.5')]:
            await ev(f"(()=>{{const g=__D.grinch.h,c=__G.camera,m=g.j[7];c.position.set(m.x+{o.split(',')[0]},m.y+{o.split(',')[1]}+0.6,m.z+{o.split(',')[2]});c.lookAt(m.x,m.y+0.3,m.z);c.fov=60;c.updateProjectionMatrix();__WP.hidden=true}})()")
            await shot(pg,f'drag_{n}.png')
        await assert_clean(pg,logs); await b.close()
asyncio.run(main())
