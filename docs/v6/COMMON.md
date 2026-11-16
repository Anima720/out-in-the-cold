# 弃于寒冬 / Out in the Cold — shared notes for all agents (read fully before coding)

## Project
- Browser FPS fan campaign in the style of Call of Duty: MW3 (2011). three.js r170, plain ES modules in `src/`, bundled by `node build.mjs` into ONE file `dist/index.html`. All models/textures/SFX are procedural code. Read `README.md` first (file map, chapters, checkpoint numbers).
- Your working copy is `/home/claude/work/<your-name>/` (a full copy of the repo; `node_modules` is a symlink). Work ONLY there. Never edit `/home/claude/out-in-the-cold`, `/home/claude/tiema`, or another agent's copy. Do not `git commit`, push, or publish anything. A baseline commit already exists in your copy, so `git diff` / `git status` show exactly your changes — leave them uncommitted.
- Levels: `G.lvl` 1 = mine (`cave.js`, checkpoints 10/11), 3 = surface yard (`cave.js`, ck 20), 2 = train (`director.js`/`train.js`, ck 0–3; the train is static and the world scrolls), 5 = radar station "最后阵地" (`part5.js`/`station.js`/`assault.js`, ck 4–6). Epilogue cutscene = `cine.js`. `startCheckpoint(k)` in `director.js` dispatches.
- Units are meters. North = −z. yaw 0 faces −z; forward = (−sin yaw, 0, −cos yaw).
- Voice-over is disabled: dialogue is subtitles only. Lines live in `LINES` as `ID: ['SPEAKER', 'English text', '中文字幕', radio?]` and are queued with `say(id, delay)`. All UI text is Simplified Chinese.
- Keep the existing dense code style. No new npm dependencies. Avoid per-frame allocations in hot loops. The game must stay smooth on an ordinary GPU.

## Build and test
- Build: `node build.mjs` (about 2 s).
- Headless test: Python Playwright + `/usr/bin/google-chrome`, launch args `["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]`. Open `file://<abs path>/dist/index.html?q=low&god=1` (`q=low|medium|high` quality, `god=1` invulnerable) and wait for `window.__ready` (timeout 300000).
- Page hooks: `__begin(k)` start at checkpoint k; `__sim(seconds)` advance game logic deterministically (no real time needed); `window.__freeze=true` stops the real-time loop so screenshots are stable (set false to resume); `__P` player (`pos`, `yaw`, `pitch`, `health`, `alive`, `mounted`…); `__G` globals (`enemies`, `mates`, `humans`, `sleds`, `hind`, `state`, `lvl`, `camera`, `scene`, `fx`); `__D` director state (`phase`, `ck`, `cur`, `q`, `cv` for the mine, `p5` via `__p5().P5`); `__WP` weapon state; `__input` (`down` Set of key codes held, `pressed` Set for one-frame presses, `lmb`, `rmb`, `lmbPressed`); `__THREE`; `__killAll()` kills all enemies; `window.__errors` runtime errors (must stay empty).
- Working examples: `tools/playtest_*.py`, `tools/capture_epilogue.py` — copy their structure.
- THE MACHINE IS SMALL: 2 CPU cores shared by 4 agents, software GL. A page load takes 1–3 minutes. Rules: only ONE Chrome at a time per agent; viewport ≤ 480×270 with `q=low` for logic tests; `q=medium` at ≤ 800×450 only for the few visual checks; pass `timeout=200000` to `page.screenshot`; wrap every run in `timeout 900`. Prefer short targeted tests (teleport the player, set state, `__sim`) over full playthroughs; batch many checks into one page load.
- Verify visuals by actually looking at your screenshots with the Read tool. Do not claim something looks right without having looked.

## File ownership (edit only your files)
| Agent | Owns |
|---|---|
| a1 (story parts 1–3, identity, epilogue) | `src/director.js`, `src/cave.js`, `src/cine.js`, `src/main.js`, `src/ai.js`, `src/weapon.js`, `src/pickups.js`, `src/train.js`, `README.md`, `docs/`, `tools/playtest_train.py`, `tools/playtest_mine_surface.py`, `tools/capture_epilogue.py` |
| a2 (part 4 story + finale) | `src/part5.js`, `src/station.js`, `src/player.js`, `src/humans.js`, `src/audio.js`, new `src/finale.js`, `tools/playtest_last_stand.py`, new `tools/capture_finale.py` |
| b (systems) | `src/crowd.js`, `src/hud.js`, `template.html`, `src/fx.js`, `src/physics.js`, `src/core.js`, `src/input.js`, new files of its own, new `tools/` scripts |
| c (assault vehicles) | `src/assault.js`, new `tools/playtest_assault.py` |
If you truly must touch a file you do not own, keep the edit tiny and list it explicitly in your final report.

## Cross-agent contracts (the other side arrives only at merge time, so guard every call with `?.`)
- `HUD.setThreat?.(pos, label)` — b implements. `pos` is a live `THREE.Vector3` read every frame, or `null` to clear. Draws a red threat marker (diamond + label + distance, clamped to the screen edge with an arrow when off-screen) and a big red blip on the minimap.
- `G.fx.bloodPool?.(pos, radius = 0.6)` — b implements: a blood pool that spreads on the surface under `pos`. `G.fx.bloodSplat?.(pos, normal, size = 0.5)` — a splatter/smear decal on a wall or floor.
- b also adds blood pools automatically under every dead enemy, so other agents only call these for scripted deaths.
- `h.noCrowd = true` on a `Human` makes character collision ignore it (use for scripted/cinematic actors, riders, jump arcs). `P.noCrowd = true` stops the player from being pushed.
- Minimap (b) reads: `G.enemies[i].h` (+ `.jugg`), `G.mates[i].h`, `G.sleds[i]` (`kind` 'truck'|'sled'|'suv'|'btr', `pos`, `dead`), `G.hind`, `HUD.mk`.
- The squad is now only two AI teammates: TRUCK and GRINCH. The player IS Sandman. Nothing may reference a Sandman AI mate (`D.sand`) or Sokolov any more.
- The player's starting primary may no longer be `'ak'` (a1 adds an M4). Never hard-code `'ak'`; use `WP.prim`.
- Part 4 gains checkpoint 7 (finale) — a2.
- `HUD.setUpload(pct, stall, label)` — b adds the optional third argument: a string that replaces the right-hand text of the upload bar (a2 passes e.g. `'99% · 等待手动发送'`, `'100% · 已发送'`).
- `template.html` and `hud.js` belong to b. Other agents that need extra on-screen elements (overlays, vignettes, special text) create their own DOM nodes and inject their own `<style>` at runtime from their own module, appended inside `#ui`.
- Fail/retry: the existing death flow (`P.damage` → `G.onPlayerDeath` → fail screen → retry from `D.ck`) is the only fail path; reuse it.

## Final report (keep it under 300 words)
1. Files changed/added. 2. What you verified and how (tests run, screenshots you looked at). 3. Known issues / anything unfinished. 4. Any edit outside your owned files (exact description).
