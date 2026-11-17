"""Additional art-review cameras, 640x360 medium; screenshots require separate visual review.
Usage: timeout 900 python3 tools/capture_review.py [title train hud room truck supply]
Uses real HUD/story strings and real vehicle/passenger animation. The truck shot stages one
normal reinforcement via the existing test hook; it is not a campaign-progression test.
The extra Hind rocket view waits for the natural side attack, then selects its existing
rocket state as a visual fixture; flight, rockets, smoke and geometry remain unchanged.
"""
import argparse, asyncio, json
from playwright.async_api import async_playwright
from runtime import ARGS, CHROME, DIST, assert_clean, hold, shot

SCENES = ('title', 'train', 'hud', 'room', 'truck', 'supply')
INIT = r"""window.__freeze=true;
window.__reviewSeed=(n)=>{let s=n>>>0; Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
window.__reviewSeed(72017);"""
HELPERS = r"""window.__reviewLook=(x,y,z,tx,ty,tz)=>{
  const p=__P; p.pos.set(x,y,z);p.vel.set(0,0,0);p.camY=y;p.eyeY=1.62;p.crouched=false;p.prone=false;
  p.autoLook=null;p.shake=0;p.landDip=0;p.recoilP=p.recoilY=0;
  p.yaw=Math.atan2(x-tx,z-tz);p.pitch=Math.atan2(ty-y-1.62,Math.hypot(tx-x,tz-z));
};
window.__reviewVisible=(sel)=>{const e=document.querySelector(sel);if(!e)return false;
  const c=getComputedStyle(e),r=e.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&+c.opacity>.98&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;
};
window.__reviewScreen=(v)=>{__G.camera.updateMatrixWorld(true);const p=v.clone().project(__G.camera);
  return p.z>-1&&p.z<1&&Math.abs(p.x)<.9&&Math.abs(p.y)<.9;};
window.__reviewState=()=>({ck:__D.ck,phase:__D.phase,p5:__p5().P5?.ph,state:__G.state,
  player:__P.pos.toArray(),camera:__G.camera.position.toArray(),yaw:__P.yaw,pitch:__P.pitch,
  enemies:__G.enemies.filter(e=>e.h.alive).length,mounted:__P.mounted,errors:window.__errors});"""
WAIT = r"""({test,seconds,step})=>{const ok=new Function('return ('+test+')');
  for(let t=0;t<=seconds;t+=step){if(ok())return t;__sim(step);}throw new Error('Capture state not reached: '+test);}"""
BEGIN = r"""(k)=>{window.__freeze=true;__reviewSeed(72017+k);__input.down.clear();__input.pressed.clear();
  __input.lmb=__input.rmb=__input.lmbPressed=false;__input.mx=__input.my=.5;__input.mdx=__input.mdy=0;
  __begin(k);__reviewSeed(72017+k);__sim(.2);}"""
RELEASE = r"""window.__freeze=true;window.__testHold=false;window.__reviewF0=window.__frames||0;
{const q=window.__testPend.splice(0);for(const cb of q)window.__testRaf(cb);}"""
CLEAR = "!__G.hud.fadeEl||+getComputedStyle(__G.hud.fadeEl).opacity<.02"

async def main(names):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        pg = await b.new_page(viewport={'width':640,'height':360})
        logs=[]
        pg.on('pageerror', lambda e: logs.append('PAGEERR: '+str(e)))
        await pg.add_init_script(INIT)
        try:
            await pg.goto(DIST+'?q=medium&god=1')
            await pg.wait_for_function('window.__ready||window.__fatal', timeout=300000)
            await assert_clean(pg, logs)
            await hold(pg)
            ev=pg.evaluate
            await ev(HELPERS)

            async def begin(k): await pg.evaluate(BEGIN, k)
            async def until(test, seconds=30, step=.05):
                elapsed=await pg.evaluate(WAIT, {'test':test,'seconds':seconds,'step':step})
                print('reached', test, round(elapsed,3), flush=True)
            async def snap(name, valid, visible=None):
                assert await ev(valid), f'{name}: invalid scene: {await ev("__reviewState()")}'
                # Let CSS fades finish in real time while the simulation remains frozen. All
                # callbacks are released, including HUD.fade, before checking visible content.
                await ev(RELEASE)
                await pg.wait_for_function('((window.__frames||0)>=window.__reviewF0+2) || !!window.__fatal || !!window.__errors?.length', timeout=200000, polling=300)
                await assert_clean(pg, logs)
                await pg.wait_for_function(CLEAR, timeout=30000, polling=100)
                if visible: await pg.wait_for_function(visible, timeout=30000, polling=100)
                await ev('window.__testHold=true')
                assert await ev(valid), f'{name}: state changed before capture'
                await shot(pg, 'review_'+name+'.png')
                await ev('window.__freeze=true')
                print('capture', name, json.dumps(await ev('__reviewState()'), ensure_ascii=False), flush=True)

            if 'title' in names:
                await ev('__sim(2)')
                valid="__G.state==='title'&&__G.hud.menu.classList.contains('on')&&__G.hud.menu.textContent.includes('配音已关闭')"
                await snap('title', valid, "__reviewVisible('.menu.title')")
                # Clipping is an art/layout finding, not a reason to replace the real menu.
                print('title bounds', await ev("['.m-word','.m-note'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,r.top,r.bottom,innerHeight];})"), flush=True)

            if 'train' in names:
                await begin(2)
                await until("__D.phase==='turret'&&__P.mounted&&!!__G.hind&&__G.hind.pos.z<-70&&__G.hind.pos.distanceTo(__P.eye)<105", 24)
                await ev("""for(let i=0;i<3;i++){const d=__G.hind.pos.clone().sub(__G.camera.position).normalize();
                  __P.yaw=Math.atan2(-d.x,-d.z);__P.pitch=Math.asin(d.y);__P.autoLook=null;__sim(1/60);}
                  __input.lmb=true;__WP.dCool=0;__sim(1/60);__input.lmb=false;__P.shake=0;""")
                await snap('dshk_hind', "__D.phase==='turret'&&__P.mounted&&__G.hind.visible&&__WP.heat>0&&__reviewScreen(__G.hind.pos)", "__reviewVisible('.ammo')")
                # Keep the original forward camera above for comparison. This additional view
                # stays on the same gun, after the real Hind has flown clear of the locomotive.
                await until("__D.phase==='turret'&&__P.mounted&&['side','gun','rockets'].includes(__G.hind.state)&&Math.abs(__G.hind.pos.x)>34&&__G.hind.pos.z>-70&&__G.hind.pos.z<0", 55)
                print('visual fixture: natural side position; select existing Hind rocket attack', await ev('({state:__G.hind.state,pos:__G.hind.pos.toArray(),t:__D.turretT})'), flush=True)
                await ev("window.__reviewOldRockets=new Set(__G.rockets);__G.hind.goTo('rockets');__G.hind.rk=0;")
                await until("__G.rockets.some(r=>!__reviewOldRockets.has(r)&&r.life>=.12&&r.life<.2)", 2, 1/60)
                await ev("""window.__reviewRocket=__G.rockets.find(r=>!__reviewOldRockets.has(r)&&r.life>=.12&&r.life<.2);
                  for(let i=0;i<3;i++){const d=__G.hind.pos.clone().add(new __THREE.Vector3(0,-3,0)).sub(__G.camera.position).normalize();
                    __P.yaw=Math.atan2(-d.x,-d.z);__P.pitch=Math.asin(d.y);__P.autoLook=null;__sim(1/60);}
                  __P.shake=0;
                  window.__reviewHindProof=()=>{
                    const G=__G,T=__THREE,h=G.hind,r=__reviewRocket;G.scene.updateMatrixWorld(true);G.camera.updateMatrixWorld(true);
                    const origin=G.camera.position,ray=new T.Raycaster(),inHind=o=>{for(;o;o=o.parent)if(o===h.group)return true;return false;};
                    const solid=hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
                      const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;
                      return !!m&&m.visible!==false&&m.depthWrite!==false&&(m.opacity??1)>=.85;};
                    const first=(v,far)=>{ray.set(origin,v.clone().sub(origin).normalize());ray.near=.05;ray.far=far;
                      return ray.intersectObjects(G.scene.children,true).find(solid);};
                    const points=[[0,0,-4.5],[0,0,-.4],[0,.6,5.5],[-2,-.3,-.3],[2,-.3,-.3],[0,.85,-3]].map(a=>{
                      const v=new T.Vector3(...a).applyMatrix4(h.group.matrixWorld),hit=first(v,origin.distanceTo(v)+.5);
                      return {screen:__reviewScreen(v),clear:!!hit&&inHind(hit.object),first:hit?.object.name||hit?.object.type||null};});
                    const rocketScreen=__reviewScreen(r.pos),rocketBlocked=first(r.pos,Math.max(.05,origin.distanceTo(r.pos)-.2));
                    return {visible:h.visible&&h.group.visible,side:Math.abs(h.pos.x)>30,points,visiblePoints:points.filter(p=>p.screen&&p.clear).length,
                      rocketLive:G.rockets.includes(r),rocketLife:r.life,rocketSpeed:r.vel.length(),rocketScreen,rocketClear:!rocketBlocked,
                      hind:h.pos.toArray(),rocket:r.pos.toArray(),camera:origin.toArray()};
                  };""")
                valid="(()=>{const q=__reviewHindProof();return __D.phase==='turret'&&__P.mounted&&q.visible&&q.side&&q.visiblePoints>=3&&q.rocketLive&&q.rocketLife>=.1&&q.rocketLife<.25&&Math.abs(q.rocketSpeed-75)<.01&&q.rocketScreen&&q.rocketClear;})()"
                print('Hind rocket visibility proof', json.dumps(await ev('__reviewHindProof()')), flush=True)
                await snap('dshk_hind_rockets', valid, "__reviewVisible('.ammo')")

            if 'hud' in names or 'room' in names:
                await begin(5)
                await ev('__reviewLook(.2,.15,-3.6,0,1.8,-32);__sim(14)')
                if 'hud' in names:
                    await snap('combat_hud', "__G.state==='play'&&__p5().P5.ph==='defend'&&__G.enemies.some(e=>e.h.alive)&&__G.hud.root.classList.contains('hud-on')",
                               "__reviewVisible('.minimap')&&__reviewVisible('.obj.on')&&__reviewVisible('.upl.on')&&__reviewVisible('.ammo')")
                if 'room' in names:
                    await ev('__reviewLook(-2,.15,3.3,-6.2,1.35,-1.3);__sim(.05)')
                    await snap('control_room', "__G.lvl===5&&__P.pos.y<.3&&__P.pos.z>3&&__P.pos.z<4")
                    await ev('__P.pitch=.75;__P.shake=0;__sim(1/60)')
                    await snap('control_room_ceiling', "__G.lvl===5&&__P.pitch>.7&&__P.pos.y<.3")

            if 'truck' in names:
                await begin(4)
                await ev("""const p5=__p5().P5;Object.assign(p5,{ph:'defend',up:0,rate:0,wave:99,refT:1e9,as_init:true});
                  __D.timers.length=0;__D.q.length=0;for(const m of __G.mates){m.p5='idle';m.path=[];}
                  __reviewLook(-5.8,4.3,-4.4,-8.4,1.5,-23);__sim(.05);
                  window.__reviewTruck=__assault().send('truckW',5);""")
                await until("__reviewTruck.arrived&&!__reviewTruck.dead&&__reviewTruck.pax[0].h.alive&&__reviewTruck.pax[0].ride.st==='jump'&&__reviewTruck.pax[0].ride.t>=.18", 45, 1/60)
                await ev('__P.shake=0')
                valid="__P.pos.y>4.2&&__P.pos.y<4.4&&__reviewTruck.pax.length===5&&__reviewTruck.pax[0].ride.st==='jump'&&__reviewTruck.pax[0].ride.t<.4&&__reviewScreen(__reviewTruck.pax[0].h.j[1])"
                await snap('roof_truck_dismount', valid)
                print('truck', await ev("({at:__reviewTruck.at,pax:__reviewTruck.pax.map(r=>({alive:r.h.alive,st:r.ride.st,t:r.ride.t,pos:r.h.pos.toArray()}))})"), flush=True)

            if 'supply' in names:
                await begin(4)
                await ev('__reviewLook(0,.15,6,0,1.5,0);__sim(.1)')
                assert await ev("__p5().P5.ph==='gen'"), 'generator stage was not reached'
                await ev('__P.pos.copy(__p5().S.genPos);__P.camY=__P.pos.y;__input.down.add("KeyF");__sim(1.6);__input.down.delete("KeyF")')
                assert await ev("__p5().P5.ph==='power'"), 'generator interaction failed'
                await ev('__reviewLook(.2,.15,-3.6,0,1.8,-32);__sim(.1)')
                await until("__p5().P5.ph==='defend'&&!!document.querySelector('#p5hint.on')&&document.querySelector('#p5hint').textContent.startsWith('补给')", 22)
                await snap('supply_hint', "__p5().P5.ph==='defend'&&document.querySelector('#p5hint.on')?.textContent.startsWith('补给')",
                           "__reviewVisible('#p5hint.on')&&__reviewVisible('.minimap')&&__reviewVisible('.upl.on')")
        finally:
            try: await assert_clean(pg, logs)
            finally: await b.close()

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('scenes',nargs='*')
    args=ap.parse_args()
    if set(args.scenes)-set(SCENES): ap.error('Unknown scenes: '+', '.join(sorted(set(args.scenes)-set(SCENES))))
    asyncio.run(main(args.scenes or SCENES))
