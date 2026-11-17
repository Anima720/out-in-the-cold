"""ADS lean regression: real sight projections at 480x270, fixed neutral/Q/E views at 640x360."""
import asyncio, json
from playwright.async_api import async_playwright
from runtime import CHROME, DIST, ARGS, hold, shot, assert_clean

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={"width":480,"height":270})
        logs=[]; pg.on('pageerror',lambda e:logs.append('PAGEERR: '+str(e)))
        await pg.goto(DIST+'?q=low&god=1')
        await pg.wait_for_function('window.__ready || window.__fatal',timeout=300000)
        await hold(pg); ev=pg.evaluate
        await ev("__begin(4); __sim(.3); __P.pos.set(-3,__G.groundFn(-3,40),40); __P.yaw=0; __P.pitch=0")
        await ev("""window.__leanSample=()=>{const W=__WP,m=W.m,v=new __THREE.Vector3();W.scene.updateMatrixWorld(true);
          if(m.optic==='x2')W.attm.scope.children[2].getWorldPosition(v);
          else if(m.optic==='reddot'||m.optic==='holo')W.attm.opt[m.optic].ret.getWorldPosition(v);
          else m.g.localToWorld(v.set(0,m.sightY,m.rearZ));
          v.project(W.cam);return {pixel:[v.x*innerWidth/2,v.y*innerHeight/2],off:__P.leanOff,roll:W.root.rotation.z,
            eye:__G.camera.position.toArray(),ads:W.adsT,scoped:W.scoped,scope:W.attm.scope.visible,
            scopeRoll:Math.atan2(new DOMMatrix(getComputedStyle(__G.hud.scopeRet).transform).b,new DOMMatrix(getComputedStyle(__G.hud.scopeRet).transform).a)};};void 0;""")
        for weapon,optic in [('m4','iron'),('m4','reddot'),('ak','holo'),('ak12','x2'),('svd','pso')]:
            await ev(f"__wpn.giveWeapon('{weapon}',30,90,{{optic:'{optic}',under:null}}); __input.rmb=true; __sim(1.5)")
            samples=[]
            for key in [None,'KeyQ','KeyE',None]:
                await ev("__input.down.delete('KeyQ'); __input.down.delete('KeyE')")
                if key: await ev(f"__input.down.add('{key}')")
                await ev('__sim(1.2)'); r=await ev('__leanSample()');samples.append(r)
                assert r['ads']>.9999, r
                assert abs(r['off'])>.34 and abs(r['roll'])<.0001 if key else abs(r['off'])<.0001 and abs(r['roll'])<.0001, r  # ADS: viewmodel rigid with the eye
                if optic=='pso': assert r['scoped'] and abs(r['scopeRoll']+r['roll'])<.00001, r
                else: assert max(map(abs,r['pixel']))<2, (weapon,optic,key,r)
                if optic=='x2': assert r['scope'], r
            assert samples[1]['eye'][0]<samples[0]['eye'][0]-.34 and samples[2]['eye'][0]>samples[0]['eye'][0]+.34, samples
            print('ADS lean PASS',weapon,optic,json.dumps(samples),flush=True)
        await assert_clean(pg,logs)
        await pg.set_viewport_size({'width':640,'height':360})
        for weapon,optic in [('m4','reddot'),('ak','holo'),('ak12','x2'),('svd','pso')]:
            await ev(f"__wpn.giveWeapon('{weapon}',30,90,{{optic:'{optic}',under:null}}); __sim(1.5)")
            for key,tag in [(None,'center'),('KeyQ','q'),('KeyE','e')]:
                await ev("__input.down.delete('KeyQ'); __input.down.delete('KeyE')")
                if key: await ev(f"__input.down.add('{key}')")
                await ev('__sim(1.2)')
                await shot(pg,f'lean_{optic}_{tag}.png')
            await ev("__input.down.clear(); __sim(1.2)")
        await ev("__input.rmb=false; __wpn.giveWeapon('m4',30,90,{optic:'reddot',under:null}); __sim(1.5)")
        for key,tag in [('KeyQ','q'),('KeyE','e')]:   # hip-fire: the gun cants with the lean
            await ev("__input.down.delete('KeyQ'); __input.down.delete('KeyE'); __input.down.add('%s')" % key); await ev('__sim(1.2)')
            assert abs(await ev('__WP.root.rotation.z'))>.05; await shot(pg,f'lean_hip_{tag}.png')
        await ev("__input.down.clear(); __sim(1.2)")
        await assert_clean(pg,logs); await b.close()

asyncio.run(main())
