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
            await out("glBoom", """(()=>{ let n=0; const ex=__G.fx.explosion; __G.fx.explosion=(...a)=>{ n++; return ex(...a); }; const give=window.__wpn.giveWeapon; give('m4',30,90,{optic:'reddot',under:'gl'}); __sim(0.8);
              __P.pos.set(-0.5,0,-2.5); __P.yaw=0; __P.pitch=-0.05; __input.pressed.add('KeyX'); __sim(0.5); __input.lmbPressed=true; __input.lmb=true; __sim(0.05); __input.lmb=false; __sim(3);
              const n1=n; __P.pitch=-1.2; __sim(0.1); __input.lmbPressed=true; __input.lmb=true; __sim(0.05); __input.lmb=false; __sim(1.5); __G.fx.explosion=ex; return {armedHitExplosions:n1, closeDudExplosions:n-n1, ubOn:__WP.ubOn, err:window.__errors.slice(0,3)}; })()""")
            await out("gl", """(()=>{ const give=window.__wpn.giveWeapon; give('m4',30,90,{optic:'reddot',under:'gl'}); __sim(0.8);
              __input.pressed.add('KeyX'); __sim(0.5); const on=__WP.ubOn, a0=__WP.ammo;
              __P.pitch=0.25; __input.lmbPressed=true; __input.lmb=true; __sim(0.05); __input.lmb=false; const n=window.__wpn.GL.length; __sim(3.0);
              const a1=__WP.ammo, rel=__WP.reloadT; __sim(2.5);
              return {on, a0, a1, flying:n, glLeft:window.__wpn.GL.length, rel, after:__WP.ammo, res:__WP.reserve, def:window.__wpn.curDef().name, err:window.__errors.slice(0,3)}; })()""")
            await out("sg", """(()=>{ const give=window.__wpn.giveWeapon; give('ak12',30,90,{optic:'holo',under:'shotgun'}); __sim(0.8);
              __input.pressed.add('KeyX'); __sim(0.5); const on=__WP.ubOn, a0=__WP.ammo, name=window.__wpn.curDef().name;
              __input.lmbPressed=true; __input.lmb=true; __sim(0.05); __input.lmb=false; __sim(0.9); const a1=__WP.ammo;
              __input.pressed.add('KeyX'); __sim(0.5); return {on, name, a0, a1, back:__WP.ubOn, rifle:__WP.ammo, err:window.__errors.slice(0,3)}; })()""")
            # melee vs interaction: F in the open swings the knife; F at the mine laptop (ck 10) is the interaction only
            await out("meleeOpen", """(()=>{ __P.pos.set(-0.5,0,-2.5); __sim(0.3); __input.pressed.add('KeyF'); __sim(1/60); const m=__WP.meleeT; __sim(0.8); return {meleeT:m, p:__G.hud._p||null}; })()""")
            await out("laptop", """(()=>{ __D.cv.ph='office'; __P.pos.set(7.6,0,-61.0); __P.yaw=-1.2; __sim(0.4); const pr=__G.hud._p;
              __input.pressed.add('KeyF'); __input.down.add('KeyF'); __sim(1/60); const m=__WP.meleeT; __sim(1.8); __input.down.delete('KeyF'); __sim(0.2);
              return {prompt:pr, meleeT:m, intel:!!__D.cv.intel, ck:__D.ck, err:window.__errors.slice(0,3)}; })()""")
            # grenade throw-back: enemy grenade 1.3 m in front, G snatches it and lobs it along the aim
            await out("throwback", """(()=>{ __P.pos.set(-0.5,0,-2.5); __P.yaw=0; __P.pitch=0.1; __sim(0.2);
              const n=window.__wpn.throwNade(new __THREE.Vector3(-0.5,0.05,-3.8), new __THREE.Vector3(0,0,0), 'enemy'); n.fuse=2.0; __sim(0.15);
              const offer=__P.tbNade===n, ui=document.querySelector('.wprompt')?.classList.contains('on');
              __input.pressed.add('KeyG'); __sim(1/60); const held=n.held; __sim(0.3); const f0=n.fuse, rel={held:n.held, owner:n.owner, v:+n.vel.length().toFixed(1)};
              const p0=n.pos.clone(); __sim(0.5); const moved=+n.pos.distanceTo(p0).toFixed(1); __sim(2.0);
              return {offer, ui, held, rel, fuseAtRelease:+f0.toFixed(2), moved, gone:!__NADES.includes(n), hp:__P.health, err:window.__errors.slice(0,3)}; })()""")
            await out("tbLate", """(()=>{ const n=window.__wpn.throwNade(new __THREE.Vector3(-0.5,0.05,-3.6), new __THREE.Vector3(0,0,0), 'enemy'); n.fuse=0.3; __sim(0.05); const o=__P.tbNade===n; __sim(0.5); return {offerWhenShortFuse:o}; })()""")
            # corpse pickup: a dead enemy that drops an AK-12 with a holo + GP-25 -> hold F, prompt names the attachments
            await out("pickup", """(()=>{ const give=window.__wpn.giveWeapon; give('m4',30,200,{optic:'reddot',under:null}); __sim(0.8);
              const h0=__G.mates[0].h; const fake={faction:'ru', dropWeapon:'ak12', dropAtt:{optic:'holo',under:'gl'}, j:h0.j.map(v=>v.clone()), removed:false, hidden:false};
              fake.j[2].set(-0.5,0.9,-4.0); __G.onCorpse(fake); __P.pos.set(-0.5,0,-3.2); __sim(0.1); const pr=__G.pickPrompt, hud=__G.hud._p;
              __input.pressed.add('KeyF'); __input.down.add('KeyF'); __sim(1/60); const m=__WP.meleeT; __sim(0.5); __input.down.delete('KeyF'); __sim(0.8);
              const r={prompt:pr, hudPrompt:hud, meleeT:m, prim:__WP.prim, att:__WP.att[__WP.prim], ub:__WP.ub&&[__WP.ub.def.name,__WP.ub.ammo,__WP.ub.reserve], left:__G.pickups.map(k=>[k.w, JSON.stringify(k.att), k.ammo]), back:__G.pickPrompt};
              const f2={faction:'ru', dropWeapon:'smg', j:h0.j.map(v=>v.clone())}; f2.j[2].set(3,0.9,-4); __G.onCorpse(f2); r.rolled=__G.pickups[__G.pickups.length-1].att;
              const f3={faction:'ru', dropWeapon:'pistol', j:h0.j.map(v=>v.clone())}; f3.j[2].set(3,0.9,-6); __G.onCorpse(f3); r.pistolDrop=[__G.pickups[__G.pickups.length-1].w, __G.pickups[__G.pickups.length-1].pistol];
              r.err=window.__errors.slice(0,3); return r; })()""")
            # lean: offset, roll, blocked by a wall
            await out("lean", """(()=>{ __P.pos.set(-0.5,0,-2.5); __P.yaw=0; __sim(0.2); const c0=__G.camera.position.clone();
              __input.down.add('KeyE'); __sim(0.6); const r={E:[+__P.leanOff.toFixed(3), +(__G.camera.position.clone().sub(c0).length()).toFixed(3), +__G.camera.rotation.z.toFixed(3)]};
              __input.down.delete('KeyE'); __input.down.add('KeyQ'); __sim(0.6); r.Q=[+__P.leanOff.toFixed(3), +__G.camera.rotation.z.toFixed(3), +__P.eye.distanceTo(c0).toFixed(3)]; __input.down.delete('KeyQ'); __sim(0.5); r.rest=+__P.leanOff.toFixed(3);
              // find a wall: step sideways until a box is hit within 0.5 m to the right
              const d=new __THREE.Vector3(); let best=null; for(let x=-6;x<=6;x+=0.25){ __P.pos.set(x,0,-2.5); __sim(0.05); } r.err=window.__errors.slice(0,3); return r; })()""")
            await out("leanWall", """(()=>{ let found=null; for (let x=-8; x<=8 && !found; x+=0.2) for (let z=-10; z<=4 && !found; z+=0.5) { const b=__G.boxes.find(b=>b.enabled && !b.inv && b.min.y<1.5 && b.max.y>2.0 && x>b.max.x && x-b.max.x<0.6 && z>b.min.z+0.5 && z<b.max.z-0.5); if (b) found=[x,z,b.max.x]; }
              if(!found) return {found:null}; __P.pos.set(found[0]+0.15,0,found[1]); __P.yaw=Math.PI/2; __sim(0.3);
              // facing -x... yaw=+pi/2 faces -x, so the wall (at smaller x) is in front; lean must go sideways: use yaw=0 -> right is +x, left is -x (wall)
              __P.yaw=0; __sim(0.1); __input.down.add('KeyQ'); __sim(0.7); const off=__P.leanOff, eyeX=__P.eye.x; __input.down.delete('KeyQ'); __sim(0.4);
              return {wallX:found[2], playerX:+__P.pos.x.toFixed(2), off:+off.toFixed(3), eyeX:+eyeX.toFixed(3), ok: eyeX > found[2]}; })()""")
            await out("audio", """(()=>{ const A=window.__A; if(!A.on) return {on:false};
              const pk=(b)=>{ let m=0,r=0; const d=b.getChannelData(0); for(let i=0;i<d.length;i++){ m=Math.max(m,Math.abs(d[i])); r+=d[i]*d[i]; } return [+m.toFixed(2), +Math.sqrt(r/d.length).toFixed(3), +b.duration.toFixed(2)]; };
              const r={old_ak:pk(A.b.ak), m4:pk(A.gun.m4.close[0]), pkm:pk(A.gun.pkm.close[1]), far:pk(A.far.rifle[0]), tailOpen:pk(A.tail.open[0]), tailTunnel:pk(A.tail.tunnel[0]), step:pk(A.steps.snow[0]), mech:pk(A.mech.ar[0])};
              window.__wpn.giveWeapon('pkm'); __sim(0.8); let vmax=0; __input.lmb=true; for(let i=0;i<180;i++){ __sim(1/60); vmax=Math.max(vmax,A.voices); } __input.lmb=false; r.voicesPKM=vmax; r.space=A.space;
              A.nSteps=0; __P.pos.set(-0.5,0,-2.5); __P.yaw=0; __input.down.add('KeyW'); __sim(3); __input.down.delete('KeyW'); r.ownSteps=A.nSteps%1000;
              r.err=window.__errors.slice(0,3); return r; })()""")
            await out("f11", """(()=>{ window.dispatchEvent(new KeyboardEvent('keydown',{code:'F11',key:'F11',bubbles:true,cancelable:true})); return {fsT:!!__input.fsT, paused:__G.paused, lockFailed:__input.lockFailed}; })()""")
        if MODE == "npc":
            await ev("__begin(4)"); await ev("__sim(2.0)")
            await out("npcSteps", """(()=>{ const A=window.__A; A.nSteps=0; __P.pos.set(0.2,0.15,-3.6); __sim(12); const n=Math.floor(A.nSteps/1000), own=A.nSteps%1000;
              let vmax=0; for(let i=0;i<600;i++){ __sim(1/60); vmax=Math.max(vmax,A.voices); } return {npcSteps:n, own, space:A.space, voicesMax:vmax, humans:__G.humans.length, err:window.__errors.slice(0,3)}; })()""")
            await out("roomSpace", """(()=>{ __P.pos.set(0,0.15,0); __sim(0.5); const a=window.__A.space; __P.pos.set(0,0,20); __sim(0.5); return {inside:a, outside:window.__A.space}; })()""")
        if MODE == "shots":
            await ev("__begin(4)"); await ev("__sim(2.0)")
            await ev("__P.pos.set(0.2,0.15,-3.6); __P.yaw=0; __P.pitch=0.02; __G.enemies.forEach(e=>e.h.hidden=true); __sim(0.3)")
            give = "window.__wpn.giveWeapon"
            async def pose(k, att, ads, tag, extra=""):
                await ev(f"{give}('{k}',30,90,{json.dumps(att)}); __sim(0.9); __input.rmb={'true' if ads else 'false'}; {extra} __sim(0.6)")
                await snap(f"shots/w_{tag}.png")
                await ev("__input.rmb=false; __sim(0.2)")
            only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
            plan = [
                ("m4", {"optic": "reddot", "under": None}, False, "m4_reddot_hip"),
                ("m4", {"optic": "reddot", "under": None}, True, "m4_reddot_ads"),
                ("m4", {"optic": "iron", "under": "gl"}, False, "m4_iron_m203_hip"),
                ("m4", {"optic": "iron", "under": None}, True, "m4_iron_ads"),
                ("ak", {"optic": "holo", "under": "gl"}, False, "ak_holo_gp25_hip"),
                ("ak", {"optic": "holo", "under": None}, True, "ak_holo_ads"),
                ("ak12", {"optic": "x2", "under": "shotgun"}, False, "ak12_x2_sg_hip"),
                ("ak12", {"optic": "x2", "under": None}, True, "ak12_x2_ads"),
                ("smg", {"optic": "reddot", "under": None}, False, "smg_reddot_hip"),
                ("smg", {"optic": "iron", "under": None}, True, "smg_iron_ads"),
            ]
            for k, att, ads, tag in plan:
                if only and tag not in only and "all" not in only: continue
                await pose(k, att, ads, tag)
            # side views of every rifle with attachments (fixed inspect pose, HUD hidden)
            side = [("m4", {"optic": "reddot", "under": "gl"}), ("ak", {"optic": "holo", "under": "gl"}),
                    ("ak12", {"optic": "x2", "under": "shotgun"}), ("smg", {"optic": "holo", "under": None}), ("pkm", None)]
            if not only or "side" in only or "all" in only:
                await ev("__G.hud.show(false); __WP.inspect=[0.05, 1.2, -0.45, 0.02, -0.02, -0.6]")
                for i, (k, att) in enumerate(side):
                    await ev(f"{give}('{k}',30,90,{json.dumps(att) if att else 'undefined'}); __sim(0.9)")
                    await snap(f"shots/w_side_{i}_{k}.png")
                await ev("__G.hud.show(true); __WP.inspect=null; __sim(0.2)")
            if not only or "lean" in only or "all" in only:
                await ev(f"{give}('m4',30,90,{{optic:'reddot',under:null}}); __sim(0.8)")
                for kk, tag in (("KeyQ", "lean_q"), ("KeyE", "lean_e")):
                    await ev(f"__input.down.add('{kk}'); __sim(0.7)")
                    await snap(f"shots/w_{tag}.png")
                    await ev(f"__input.down.delete('{kk}'); __sim(0.5)")
            if not only or "gl" in only or "all" in only:
                await ev(f"__P.pos.set(0.2,0.15,-3.6); __P.yaw=0; __P.pitch=0.06; {give}('m4',30,90,{{optic:'reddot',under:'gl'}}); __sim(0.8); __G.hud.show(false); __sim(0.1)")
                await snap("shots/w_m4_m203_hip_nohud.png")
                await ev("__G.hud.show(true); __input.pressed.add('KeyX'); __sim(0.5); __G.hud.show(false); window.__freeze=true")
                await snap("shots/w_m4_m203_selected_nohud.png")
                await ev("window.__freeze=false; __G.hud.show(true)")
                await ev("__input.lmb=true; __input.lmbPressed=true; __sim(0.02); __input.lmb=false; __sim(0.12)")
                await snap("shots/w_gl_flight.png")
                await ev("for(let i=0;i<120 && window.__wpn.GL.length;i++) __sim(1/60); __sim(0.1)")
                await snap("shots/w_gl_boom.png")
                await ev("__sim(1.5); __input.pressed.add('KeyX'); __sim(0.5)")
                await ev(f"{give}('ak12',30,90,{{optic:'reddot',under:'shotgun'}}); __sim(0.8); __input.pressed.add('KeyX'); __sim(0.5); __input.lmb=true; __input.lmbPressed=true; __sim(0.02); __input.lmb=false; __sim(0.01)")
                await snap("shots/w_ubsg_fire.png")
            if not only or "tb" in only or "all" in only:
                await ev("__sim(1); __P.pitch=-0.2; const n=window.__wpn.throwNade(new __THREE.Vector3(__P.pos.x,__P.pos.y+0.05,__P.pos.z-1.3), new __THREE.Vector3(0,0,0), 'enemy'); n.fuse=2.5; __sim(0.1)")
                await snap("shots/w_tb_prompt.png")
                await ev("__P.pitch=0.1; __input.pressed.add('KeyG'); __sim(0.13); window.__freeze=true")
                await snap("shots/w_tb_throw.png")
                await ev("window.__freeze=false")
                await ev("__sim(3)")
        print("errors", await ev("window.__errors"), flush=True)
        for l in logs[:20]: print(l)
        await b.close()

asyncio.run(main())
