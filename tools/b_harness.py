# Shared helpers for agent-b test scripts (crowd / hud / blood / fence). One Chrome per run.
import asyncio, os, pathlib, sys, json
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = (ROOT / "dist" / "index.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
SHOTS = ROOT / "shots"; SHOTS.mkdir(exist_ok=True)

# JS helpers injected after load
HELPERS = r"""
window.__bodies = () => { const L = []; const P = __P;
  if (P.alive) L.push([P.pos.x, P.pos.y, P.pos.z, 'P', 0.32]);
  for (const m of __G.mates) { const h = m.h; if (h.alive && !h.hidden && !h.sit && !m.arc && !h.noCrowd) L.push([h.pos.x, h.pos.y, h.pos.z, 'M' + m.name[0], 0.33]); }
  for (const e of __G.enemies) { const h = e.h; if (h.alive && !h.hidden && !h.sit && e.kind !== 'gunner' && !h.noCrowd) L.push([h.pos.x, h.pos.y, h.pos.z, (e.jugg ? 'J' : 'E') + ':' + e.state + ':' + Math.hypot(h.vel.x,h.vel.z).toFixed(1) + '@' + h.pos.x.toFixed(0) + ',' + h.pos.z.toFixed(0), e.jugg ? 0.42 : 0.33]); }
  return L; };
// min pairwise XZ distance and min clearance (distance - radius sum) among bodies at similar height
window.__cm = () => { const L = __bodies(); let md = 9, mc = 9, who = '';
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (Math.abs(a[1] - b[1]) > 1.25) continue;
    const d = Math.hypot(a[0] - b[0], a[2] - b[2]), c = d - a[4] - b[4]; if (d < md) md = d; if (c < mc) { mc = c; who = a[3] + '-' + b[3]; } }
  return [md, mc, who]; };
// simulate `sec` seconds, tracking the worst clearance and a histogram of overlaps
window.__track = (sec, step = 0.05, fn) => { let worst = 9, w = '', md = 9, bad = 0, n = 0;
  for (let t = 0; t < sec; t += step) { if (fn) fn(t); __sim(step); const [d, c, who] = __cm(); n++; if (c < -0.15) bad++; if (c < worst) { worst = c; w = who; } if (d < md) md = d; }
  return { worstClear: +worst.toFixed(3), pair: w, minDist: +md.toFixed(3), framesOver15cm: bad, samples: n, err: window.__errors.length }; };
"""

async def page(w=480, h=270, q="low", extra=""):
    p = await async_playwright().start()
    b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
    pg = await b.new_page(viewport={"width": w, "height": h})
    logs = []
    pg.on("pageerror", lambda e: logs.append("PAGEERR: " + str(e)[:600]))
    pg.on("console", lambda m: logs.append(m.type + ": " + m.text[:300]) if m.type == 'error' else None)
    await pg.goto(DIST + f"?q={q}&god=1{extra}")
    await pg.wait_for_function("window.__ready || window.__fatal", timeout=300000)
    await pg.evaluate(HELPERS)
    return p, b, pg, logs

async def shot(pg, name):
    await pg.evaluate("window.__freeze = true")
    await pg.wait_for_timeout(150)
    await pg.screenshot(path=str(SHOTS / name), timeout=200000)
    print("shot", name, flush=True)
