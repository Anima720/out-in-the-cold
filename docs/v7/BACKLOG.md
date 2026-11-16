# v7 backlog — player feedback round (2026-11-17, 30 items)

The user's list (original Chinese, condensed) and who owns each item. Packages own files exclusively (table at the bottom);
cross-package contracts are in the last section. Status is kept in HANDOFF.md.

| # | Item | Pkg |
|---|---|---|
| 1 | Footsteps sound odd: one sample repeated, loud, unclear whose they are. Vary them (surface, left/right, pitch/timing jitter), quieter for the player, distinct for others | W |
| 2 | Red-dot sight on the player's M4 (iron sights are unpleasant) | W |
| 3 / 27 | Lean left/right on Q / E. E was melee: melee moves to F, used only when no interaction prompt is active | W |
| 4 | Enemy weapon variety (shotgun, SMG, assault rifles; not all AK). Enemies sometimes go DOWN instead of dying: fall, lie on the ground and fire a pistol; die after 10–15 s or when finished off | AI |
| 5 | Weapon variety for the player: optics (iron, red dot, holographic, 2× scope) and underbarrels (shotgun, grenade launcher) on picked-up / starting guns | W |
| 6 | Last stand: enemy corpses on the ops-room floor start spinning — fix | P4 |
| 7 | Last stand: truck routes must not overlap each other (vehicles clip through each other); same for snowmobiles. Separate routes are acceptable instead of vehicle–vehicle collision | P4 |
| 8 | Last stand: more pressure, especially early — refill enemies whenever the count drops. THREE Juggernauts, who simply walk in (not delivered by truck) | P4 |
| 9 | Last stand: the dish on the roof doesn't read as an antenna — model a proper one | P4 |
| 10 | Part 3: the locomotive has no interior; mates that go there to drive the story clip into it. Build the cab interior and have mates walk there naturally (no teleport) | T |
| 11 | Part 3, DShK section: more snowmobile chasers on both sides | T |
| 12 | Part 3 ending: as the train nears the bridge, the Hind fires missiles at the bridge and the train is blown off it (the player jumped too early to see the old fall) | T |
| 13 | Part 2: more enemies, it's too easy | T |
| 14 | Smarter enemy and squad AI; both sides can melee, with melee animations | AI |
| 15 | Part 1: after taking the laptop intel you can still press F on it — fix | T |
| 16 | Part 2: the mine cage elevator is crude — improve it | T |
| 17 | Character names in Chinese (Sandman 沙人, Truck 卡车, Grinch 格林奇, Price 普莱斯, Yuri 尤里, Nikolai 尼科莱); Colonel Krasin becomes just「俄军高级将领」 | Lead (final pass) |
| 18 | Post-credits beat moves: after Price drives to Hotel Oasis → Nikolai: "faint signal found" → black → credits start with the Hans Zimmer track | Lead |
| 19 | Credits: creator is "Anima720", not 玩家/你 | Lead |
| 20 | Finale breach: enemies BLOW the door in; Grinch shouts a line ("你休想……"), fires back, kills one, is killed | P4 |
| 21 | Dubai drive: prettier scene; Price's hands must be on the wheel; the hotel helipad must connect to the roof (now floating) | Lead |
| 22 | Gun sounds less mechanical, more varied | W |
| 23 | Throw back enemy grenades with G | W |
| 24 | Dialogue subtitles in a nicer dialogue box | Lead |
| 25 | F11 toggles fullscreen | W |
| 26 | Credits: remove "in memory of Truck" | Lead |
| 28 | Last stand: when the attack starts, tell the player about the weapons along the walls and the roof machine gun | P4 |
| 29 | Part 3 DShK section: an enemy mans a machine gun but never fires — make him shoot | T |
| 30 | Loading screen still says「铁马」; must say「弃于寒冬」 | Lead |

## Packages and file ownership (v7)
| Pkg | Owns | Items |
|---|---|---|
| P4 (Part 4) | assault.js, part5.js, station.js, finale.js, the `Ragdoll` class in humans.js only, tools/playtest_assault.py, tools/playtest_last_stand.py, tools/capture_finale.py | finish v6-c, 6, 7, 8, 9, 20, 28 |
| T (Parts 1–3) | director.js, train.js, vehicles.js, world.js, cave.js, tools/playtest_train.py, tools/playtest_mine_surface.py | 10, 11, 12, 13, 15, 16, 29 (the DShK gunner block of ai.js `Enemy` if the bug is there — keep that edit tiny and report it) |
| W (weapons & player) | weapon.js, player.js, input.js, grenade.js, pickups.js, audio.js, new own files | 1, 2, 3/27, 5, 22, 23, 25 |
| AI | ai.js (except the gunner block), raider.js, humans.js (except `Ragdoll`), new combat.js | 4, 14 |
| Lead | hud.js, template.html, main.js, cine.js, crowd.js, fx.js, blood.js, docs, merging | 17, 18, 19, 21, 24, 26, 30 |

## Contracts between packages (guard every cross-package call with `?.`)
- **Weapon keys** (W defines them in `WDEF`, AI uses them for enemy loadouts and drops): `'m4'` (player start), `'ak'` AK-74M, `'ak12'` (or another modern AR), `'saiga'` shotgun, `'smg'` SMG (PP-19 Bizon or AK-74U-like), `'svd'`, `'pkm'`, `'rpg'`, `'pistol'`. W makes every key pickable by the player.
- **Attachments**: a weapon instance may carry `att = { optic: 'iron'|'reddot'|'holo'|'x2', under: null|'shotgun'|'gl' }`. AI sets `h.dropWeapon = key` and `h.dropAtt = att` on enemies (random, plausible per key); pickups.js (W) carries `att` over to the player. W exports `rollAtt(key)` for a random plausible set.
- **Enemy third-person gun mesh**: humans.js (AI) renders a per-Human gun model by `h.gunKind` ('rifle'|'smg'|'shotgun'|'pistol'|'pkm'|'rpg'), so loadouts are visible.
- **Downed enemies** (AI): a downed enemy stays in `G.enemies`, `h.alive === true`, with `e.downed = true`; it can be shot to finish. Minimap/crowd should treat it as alive-but-lying (crowd ignores `h.downed`).
- **Melee**: player melee entry stays `G.onMelee`; AI-side melee damages the player through `P.damage(dmg, fromPos)` and mates/enemies through `h.hurt(...)`. W exposes `P.meleeKey` handling; nobody else binds F for melee.
- **Interaction prompt arbitration** (W): F is interact when `HUD.promptActive()` (lead adds it: true while a prompt is on screen) or `P.canMount` or a pickup is in reach; otherwise F = melee.
- **Lean** (W): `P.lean` in [-1, 1]; camera rolls and offsets; `P.eye` follows so enemy LOS and hits use the leaned eye.
- **Grenade throw-back** (W): only enemy grenades (`n.owner === 'enemy'`) within ~2.2 m and not about to explode in < 0.35 s; HUD prompt「按 G 掷回」.
- **Names** (lead): speaker tags in `LINES` stay as they are ('SANDMAN', 'TRUCK', …); hud.js maps them to display names. The Chinese subtitle text is converted in one final pass after all merges — do not rename names inside LINES yourself.
- Voice-over stays off; all UI text is Simplified Chinese.
