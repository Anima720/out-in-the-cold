# Story bible (v6 rewrite) — the lead's script; follow it

## Premise
Sokolov no longer exists. The squad is three Delta operators of team "Metal": the PLAYER is Master Sergeant "Sandman" (Metal 0-1, team leader); AI teammates are TRUCK (big, dark-skinned, calm) and GRINCH (younger, wisecracks, sunglasses + backwards cap). Canon hook: at the end of MW3's "Down the Rabbit Hole" Metal stays behind to cover Price and the President's evacuation and the mine collapses on them; the official record says all three were K.I.A. This campaign is what happened in between: they find where Makarov is running ("Оазис" = Hotel Oasis, Dubai), fight their way to an old radar station, and get the intel out to Price at the cost of their lives. It hands off to "Dust to Dust".
Tone: terse, professional, a little gallows humour from Grinch. No melodrama.
Speaker tags: 'SANDMAN' (the player's own voice — allowed, like Price in "Dust to Dust"), 'TRUCK', 'GRINCH', 'PRICE', 'NIKOLAI', '克拉辛' (Colonel Krasin, the Russian commander hunting them; speaks Russian, Chinese subtitle).
Rules: nobody addresses "Sokolov". Teammates call the player "Sandman" or "boss" (头儿). Orders that used to be given TO the player now come from Truck/Grinch as reports or urging ("Sandman, get on that DShK!"); orders the team leader gives stay as SANDMAN lines.
Identity card line (replaces "维克多·索科洛夫 中尉 · 联邦警卫局（FSO）"): `“Sandman” 军士长 · 三角洲部队 · Metal 0-1`.

## Part 1 坍塌 (mine)
- P1_TRUCK_00 TRUCK: Sandman. Sandman! You with us, boss? / Sandman。Sandman！头儿，还清醒吗？
- P1_GRIN_01 GRINCH: Whole mountain came down. Price got the President out — bird's long gone. / 整座山都塌了。Price 把总统带出去了——直升机早飞了。
- P1_SAND_02 SANDMAN: Then we walk out. Truck, take point. / 那就自己走出去。Truck，打头。
- P1_TRUCK_01 TRUCK: Lights ahead. Not ours. / 前面有灯光。不是我们的人。
- P1_SAND_03 SANDMAN: Makarov's men. Weapons free. / 马卡洛夫的人。自由开火。
- P1_GRIN_02 GRINCH: Office on the right. They were hauling something out of here in a hurry. / 右边有间办公室。他们急着把什么东西运出去。
- (player takes the laptop; big card "ОАЗИС")
- P1_GRIN_03 GRINCH: Flight manifests, wire transfers… all pointing at one word. "Oasis." / 航班清单、转账记录……全指向同一个词：「绿洲」。
- P1_SAND_04 SANDMAN: That's where Makarov's running. Price needs this. / 马卡洛夫就是往那儿跑的。得让 Price 知道。
- P1_TRUCK_02 TRUCK: Cage elevator, north end. Still got power. / 北头有罐笼，还通着电。
- P1_SAND_05 SANDMAN: Everybody in. We're going up. / 全员进笼。我们上去。

## Part 2 升井 (cage + surface yard + BTR)
- P2_GRIN_01 GRINCH: Anybody else think elevator music would help? / 有人觉得这时候放点电梯音乐会好点吗？
- P2_TRUCK_03 TRUCK: Radios are fried. No comms, no extraction. / 电台全烧了。联系不上，也没人来接。
- P2_SAND_01 SANDMAN: Ore train in the rail yard runs north, past the old radar station. That dish can reach Price. / 货场那列运矿车往北开，会经过旧雷达站。那口天线能联系上 Price。
- P2_TRUCK_01 TRUCK: Top's hot. Get ready. / 上面有人。准备好。
- P2_TRUCK_02 TRUCK: BTR! Get off the road! / BTR！离开路面！
- P2_GRIN_02 GRINCH: Sandman — RPGs in the hoist house! Kill that thing! / Sandman——提升机房里有 RPG！干掉那铁家伙！
- P2_GRIN_03 GRINCH: Scratch one BTR! / BTR 报销了！
- P2_SAND_03 SANDMAN: Rail yard. Move, move! / 去货场。快，快！

## Part 3 铁马 (train) — adapt the existing lines in director.js with the rules above
Remove the Sandman AI teammate and the SOKO line; give its gameplay jobs to Truck/Grinch or drop them. Krasin's radio line becomes: Американцы на поезде. Остановить состав. Любой ценой. / 美国人在火车上。把车拦下来，不惜一切代价。

## Part 4 最后阵地 (radar station) — replaces all P5_*/P6_* lines
- P5_GRIN_01 GRINCH: Tell me that's the radar station. Tell me it's not another train. / 告诉我那是雷达站。别又是一列火车。
- P5_TRUCK_00 TRUCK: Old Soviet early-warning site. Dish on the roof looks intact. / 苏联时期的预警站。楼顶那口天线看着还完整。
- P5_SAND_02 SANDMAN: If it still talks, Price gets his intel. Move. / 只要它还能用，情报就能送到 Price 手上。走。
- P5_TRUCK_06 TRUCK: Generator's on the west wall, boss. Somebody's gotta wake it up. / 发电机在西墙外，头儿。得有人去把它弄醒。
- P5_TRUCK_01 TRUCK: Contacts on the ridge! They followed our tracks! / 山脊上有敌人！他们顺着脚印追来了！
- P5_SAND_03 SANDMAN: Grinch, get that uplink running. Truck, on the sandbags. We hold this building! / Grinch，把上行链路弄起来。Truck，守沙袋。守住这栋楼！
- P5_GRIN_02 GRINCH: Uplink's live. Upload's slow — this thing's older than my dad. / 链路通了。上传很慢——这玩意儿比我爸岁数还大。
- P5_KRAS_01 克拉辛 (radio): Американцы. Вам некуда идти. Верните то, что взяли, — и умрёте быстро. / 美国人，你们无路可走了。把拿走的东西交出来——可以让你们死得痛快点。
- P5_GRIN_03 GRINCH: Twenty-five percent! / 百分之二十五！
- P5_GRIN_04 GRINCH: Fifty percent! Keep 'em off me! / 百分之五十！别让他们靠近我！
- P5_GRIN_05 GRINCH: The dish took a hit! We lost the signal! / 天线被打中了！信号断了！
- P5_TRUCK_07 TRUCK: Sandman, roof! Somebody's gotta realign that dish! / Sandman，上楼顶！得有人把天线重新对准！
- P5_SAND_09 SANDMAN: Dish is aligned. Try it now! / 天线对好了，再试试！
- P5_GRIN_06 GRINCH: Signal's back! Seventy-five… come on, come on… / 信号回来了！百分之七十五……快点，快点……
- P5_TRUCK_02 TRUCK: Juggernaut! Coming through the gate! / 重装兵！从大门冲进来了！
- P5_SAND_05 SANDMAN: Focus fire! Hit him with everything! / 集中火力！所有家伙都往他身上招呼！
- P5_GRIN_07 GRINCH: He's down! Big boy's down! / 他倒了！大块头倒了！
- P5_TRUCK_03 TRUCK: That Hind's back! / 那架雌鹿又回来了！
- (the Hind's cannon kills Truck instantly — see finale spec; no last words)
- P5_GRIN_10 GRINCH: Truck! TRUCK! / Truck！TRUCK！
- P5_SAND_07 SANDMAN: …He's gone. Stay on that uplink, Grinch. / ……他走了。盯住上行链路，Grinch。
- P5_GRIN_11 GRINCH: Igla in the armory, boss! Kill that son of a bitch! / 军械库里有针式导弹，头儿！把那狗娘养的打下来！
- P5_GRIN_08 GRINCH: It's down! It's down! / 打下来了！打下来了！
- P5_GRIN_12 GRINCH: Ninety… ninety-five… almost there! / 九十……九十五……就差一点了！
- (99%: an RPG lands beside the player — blackout)
- P5_GRIN_13 GRINCH (muffled): Sandman! SANDMAN! Stay with me! / Sandman！SANDMAN！撑住！
- P5_GRIN_14 GRINCH (only if he has to drag you): I got you. I got you, boss. Don't you quit on me. / 我拖着你呢。我拖着你，头儿。别给我放弃。
- P5_GRIN_15 GRINCH (low): Ninety-nine percent. It needs a manual send. Boss… they're at the door. / 百分之九十九。得手动确认发送。头儿……他们到门口了。
- P5_KRAS_02 克拉辛 (in person): Где данные? / 数据在哪？
- Final inner monologue (no speaker tag, centred, shown one after the other): `Price……剩下的，交给你了。` then `Metal 0-1……完毕。` (EN: "Price… the rest is yours." / "Metal 0-1… out.")

## Epilogue (cine.js)
Unchanged structure: black → "三个月后" → Dubai → Price and Yuri drive to Hotel Oasis → PRICE: This one's for Metal. / 这一枪，替 Metal 打。 → credits (Hans Zimmer track) → post-credits scene → "完".
Credits cast: Sandman（你）, Truck, Grinch, John Price 上尉, 尤里, 克拉辛 上校, 尼古拉. No Sokolov anywhere.
New post-credits scene (replaces the three men walking + van): night, blizzard, the radar station from the air/outside; a helicopter searchlight sweeps across the roof and the dish. Subtitles (radio): NIKOLAI: Price, I am over the station. Three bodies… / Price，我到雷达站上空了。三具遗体…… then NIKOLAI: …No. Wait. One heat signature. Faint. / ……不，等等。有一个热源。很微弱。 → hard cut to black → "完 · 感谢游玩". It must stay ambiguous who is alive.
