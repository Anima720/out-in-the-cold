from runtime import assert_clean
# HUD capture: minimap during the station fight (ck 5) and on the train (ck 1), plus a layout check that
# turns every HUD element on at 1280x720 and 800x450 and reports overlapping boxes. Shots go to shots/.
import asyncio, json
from b_harness import page, shot

LAYOUT = r"""(()=>{ const H = __G.hud;
  H.objective('守住雷达站，直到情报上传完毕'); H.locCard(['最后阵地', '西伯利亚 · 废弃预警雷达站 · 07:40', '维克多·索科洛夫 中尉 · 联邦警卫局（FSO）', '“弃于寒冬” · 第四部分']);
  H.say('NIKOLAI', '朋友们，看着挺冷啊。要搭车吗？我这架老鸟还能再飞一趟，不过你们得自己扶稳了。');
  H.setPrompt('按 <kbd>F</kbd> 使用 DShK 机枪'); H.setUpload(99, false, '99% · 等待手动发送'); H.toast('敌军卡车正从大门冲进来！');
  return 1; })()"""
MEASURE = r"""(()=>{ const sel = ['.minimap', '.obj', '.compass', '.upl', '.loc', '.sub', '.prompt', '.ammo', '.toast'];
  const R = {}; for (const s of sel) { const e = document.querySelector('#ui ' + s); if (!e) continue; const r = e.getBoundingClientRect(); if (r.width && getComputedStyle(e).display !== 'none') R[s] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
  const hits = []; const k = Object.keys(R);
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = R[k[i]], b = R[k[j]];
    if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) hits.push(k[i] + ' x ' + k[j]); }
  return { R, hits, vw: innerWidth, vh: innerHeight }; })()"""

async def main():
    p, b, pg, logs = await page(800, 450, "medium")
    ev = pg.evaluate
    try:
        # station fight
        await ev("__begin(5); __sim(14)")
        await ev("__P.pos.set(-1.5,0.15,-4.2); __P.yaw=0.25; __P.pitch=0.02; __sim(0.15)")
        await shot(pg, "hud_station.png"); await ev("window.__freeze=false")
        # threat marker test: a target behind-left of the player
        await ev("window.__thp = new __THREE.Vector3(-25, 1.5, 10); __G.hud.setThreat(__thp, '重装兵'); __sim(0.15)")
        await shot(pg, "hud_threat.png"); await ev("window.__freeze=false; __G.hud.setThreat(null)")
        # train
        await ev("__begin(1); __sim(3)")
        await ev("__P.yaw=0.1; __P.pitch=-0.05; __sim(0.15)")
        await shot(pg, "hud_train.png"); await ev("window.__freeze=false")
        # layout check, both sizes
        for (w, h) in [(1280, 720), (800, 450)]:
            await pg.set_viewport_size({"width": w, "height": h})
            await ev("__begin(5); __sim(1)"); await ev(LAYOUT); await ev("__sim(0.3)")
            await pg.wait_for_timeout(1600)
            print("layout", w, h, json.dumps(await ev(MEASURE)), flush=True)
            await shot(pg, f"hud_layout_{w}.png"); await ev("window.__freeze=false")
        print("upload label", await ev("(()=>{ const H=__G.hud; H.setUpload(99, false, '99% · 等待手动发送'); const a = H.uplB.textContent; H.setUpload(42, true); return [a, H.uplB.textContent]; })()"))
        print("errors", await ev("window.__errors.slice(0,3)"))
    finally:
        print("\n".join(logs[-6:]))
        await assert_clean(pg, logs)
        await b.close(); await p.stop()

asyncio.run(main())
