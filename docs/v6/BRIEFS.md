# v6 work packages (briefs given to the four implementation agents)

Each agent works in its own copy of the repo, owns a fixed set of files (see `COMMON.md`), follows the script in `STORY.md`,
and reports back. Their in-progress work is pushed as rolling snapshots to the branches `wip-a1`, `wip-a2`, `wip-b`, `wip-c`
(diff each against the first commit of `v6-sandman` to see exactly what that agent changed).

## a1 — story rewrite for Parts 1–3, player identity, epilogue
Owns: director.js, cave.js, cine.js, main.js, ai.js, weapon.js, pickups.js, train.js, README.md, docs/, tools/playtest_train.py, tools/playtest_mine_surface.py, tools/capture_epilogue.py.
1. cave.js (Parts 1–2): new P1_*/P2_* lines from STORY.md; teammates = Truck + Grinch only (no Sandman AI mate, no `D.sand`); Truck kneels over the player at wake-up; new identity card; all beats still trigger through to the handoff to checkpoint 0.
2. director.js (Part 3 train): remove the Sandman AI mate everywhere; adapt LINES by the rules in STORY.md; level stays completable through to `G.startPart5(4, true)`.
3. weapon.js/pickups.js: US-operator sleeves and gloves; new starting primary `'m4'` (M4A1, own viewmodel, existing 'm4' gunshot); AK stays as an enemy drop; pistol renamed 'M1911'; no hard-coded `'ak'`.
4. main.js: new title premise (text in the brief below), chapter blurbs without Sokolov; keep the `updateCrowd` hook.
   Premise: 西伯利亚，钻石矿。总统获救，黑鹰起飞——负责断后的 Delta Force「Metal」小队被埋在了地下。官方记录写的是：三人阵亡。记录没写的是，他们在矿井深处找到了马卡洛夫的去向，并且打算把它送出去。
5. cine.js: credits cast per STORY.md; new post-credits scene (Nikolai's helicopter searchlight over the radar station at night, ~15 s, hard cut to black, "完 · 感谢游玩"); no Sokolov.
6. Docs: README story text; `docs/script.md` with the full script; mark the old briefs in docs/ as obsolete.
7. Tests: update and run the train and mine/surface playtests; look at screenshots of the M4 (hip, ADS, reload), sleeves and the post-credits scene.

## a2 — Part 4 story, Truck's death, the new finale
Owns: part5.js, station.js, player.js, humans.js, audio.js, new finale.js, tools/playtest_last_stand.py, new tools/capture_finale.py.
1. part5.js story pass: new P5_* lines; teammates = Truck + Grinch; flow: approach → generator → defend/upload → dish hit + realign → Juggernaut → Hind → Truck killed → Igla → Hind down → upload climbs → finale. Keep the `assault.js` call sites untouched.
2. Truck's death: hit by the Hind's strafing run, thrown against the building's north wall, dies at once slumped against it (posed corpse via a new pose in humans.js), blood smear on the wall + spreading pool; no last words; checkpoint 6 restores this.
3. Finale (new finale.js; the old "Part 6" radio call/walk-out is deleted):
   a. at 99% an RPG lands ~1.5 m from the player: flash, tinnitus, cut to black;
   b. blackout with Grinch shouting; if the player was outside the ops room, a blurry ~8 s drag scene (Grinch hauls the player through the south door, firing his pistol); if inside, only the shouting;
   c. wake = checkpoint 7: lying wounded on the ops-room floor, upload bar `99% · 等待手动发送`, Grinch by the console;
   d. breach: Colonel Krasin (distinct look) + two soldiers kick in the south door; Grinch drops one soldier and is shot dead;
   e. bullet time (~0.2×): the pistol comes up by itself; shoot Krasin and the other soldier; fail → normal fail screen → retry from checkpoint 7 (no fail with `?god=1`);
   f. crawl to the console (forward only, slow pulses, blood trail, breathing/heartbeat, `musicMode('p5loss')`);
   g. hold F to send: console turns green, `100% · 已发送`;
   h. camera sags, two centred monologue lines (`Price……剩下的，交给你了。` / `Metal 0-1……完毕。`), hard cut to black, ~4 s near silence; ambiguous whether Sandman dies;
   i. then `G.onEpilogueDone = finalCard; G.playEpilogue();`.
   Must survive pause/resume and clean up fully on restart.
4. station.js: transmit key on the west console, swinging south door leaf, Truck's wall. Keep all existing exported positions/colliders.
5. humans.js: Krasin look, slump pose; audio.js: heartbeat, breathing, tinnitus, door kick; player.js: `P.downed` crawl state, forced pistol, `P.noCrowd`.
6. Checkpoints 4–6 keep working; add 7.
7. Tests: update the last-stand playtest; `tools/capture_finale.py` capturing every beat; look at every frame.

## b — systems: collision, minimap, blood, fence
Owns: crowd.js, hud.js, template.html, fx.js, physics.js, core.js, input.js, own new files/tools.
1. crowd.js `updateCrowd(dt)`: soft XZ separation human↔human and player↔human (teammates yield to the player, Juggernaut barely moves), never pushing anyone into geometry or off a ledge/train car; ignores dead/hidden/seated/`noCrowd`/scripted arcs/riders; must not deadlock AI in the 1 m lane of a train car.
2. Minimap (classic COD): top-left ~176 px, rotates with the player, radius ~45 m; level footprint from `G.boxes`; green teammates, red enemies, red squares for vehicles, Hind icon, pulsing diamond for Juggernaut/threat, gold objective diamond; objective panel moved under it; hidden in menus/cutscenes.
3. `HUD.setThreat(pos, label)`; `HUD.setUpload(pct, stall, label)`; speaker colour for NIKOLAI.
4. Blood: `G.fx.bloodPool(pos, radius)` (growing pool decal on the supporting surface, capped, fades) and `G.fx.bloodSplat(pos, normal, size)`; automatic pool under every dead enemy once its ragdoll rests.
5. Chain-link fence (`tag: 'fence'` colliders): bullets/LOS/AI shots pass through both ways; movement still blocked.
6. `tools/shot_hud.py`; look at the screenshots.

## c — assault vehicles in Part 4
Owns: assault.js, new tools/playtest_assault.py.
1. Truck: 3–5 soldiers who visibly dismount (open rear, seated in the bed, jump down one by one, land, run to cover); destroying it early kills them.
2. New SUV (`kind: 'suv'`): 2–3 soldiers, doors swing open, they step out both sides.
3. Snowmobile: two riders, both hop off on arrival, both die if it is destroyed en route.
4. Dismount implemented inside assault.js (override `update` on the `Raider` instance during the jump; `h.noCrowd = true`).
5. Juggernaut marker through `HUD.setThreat?.(pos, '重装兵')` from `updateAssault`, cleared on death/reset.
6. Schedule in `assaultEvents(P5)`: truck ~28%, sleds ~42%, truck ~60%, Juggernaut truck ~70%, sleds in the Igla phase, plus SUVs (~20%, ~50%, one late); distinct parking spots; delay arrivals when > ~16 enemies are alive.
7. `tools/playtest_assault.py` with assertions and dismount screenshots.
