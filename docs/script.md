# 弃于寒冬 · 剧本全文（v6）

主角（玩家）是 Delta Force「Metal」小队长 Sandman（Metal 0-1）；AI 队友只有 Truck 和 Grinch。索科洛夫这个角色已删除。
身份卡：`“Sandman” 军士长 · 三角洲部队 · Metal 0-1`。只有字幕，没有配音。台词表在代码里：第一、二部分 `src/cave.js`，第三部分 `src/director.js`，第四部分 `src/part5.js`，尾声 `src/cine.js`。

## 第一部分 · 坍塌（矿井，检查点 10、11）

| ID | 角色 | English | 中文字幕 | 何时播放 |
|---|---|---|---|---|
| P1_TRUCK_00 | TRUCK | Sandman. Sandman! You with us, boss? | Sandman。Sandman！头儿，还清醒吗？ | 醒来（Truck 跪在玩家身边） |
| P1_GRIN_01 | GRINCH | Whole mountain came down. Price got the President out — bird's long gone. | 整座山都塌了。Price 把总统带出去了——直升机早飞了。 | 醒来 |
| P1_SAND_02 | SANDMAN | Then we walk out. Truck, take point. | 那就自己走出去。Truck，打头。 | 醒来 |
| P1_TRUCK_01 | TRUCK | Lights ahead. Not ours. | 前面有灯光。不是我们的人。 | 巷道战 A 开始 |
| P1_SAND_03 | SANDMAN | Makarov's men. Weapons free. | 马卡洛夫的人。自由开火。 | 巷道战 A 开始 |
| P1_GRIN_02 | GRINCH | Office on the right. They were hauling something out of here in a hurry. | 右边有间办公室。他们急着把什么东西运出去。 | 巷道肃清后，指向办公室 |
| P1_GRIN_03 | GRINCH | Flight manifests, wire transfers… all pointing at one word. "Oasis." | 航班清单、转账记录……全指向同一个词：「绿洲」。 | 取走笔记本（大字卡「ОАЗИС」）后 |
| P1_SAND_04 | SANDMAN | That's where Makarov's running. Price needs this. | 马卡洛夫就是往那儿跑的。得让 Price 知道。 | 紧接上句 |
| P1_TRUCK_02 | TRUCK | Cage elevator, north end. Still got power. | 北头有罐笼，还通着电。 | 紧接上句，目标转为罐笼 |
| P1_SAND_05 | SANDMAN | Everybody in. We're going up. | 全员进笼。我们上去。 | 溶洞战 B 肃清后，进罐笼 |

## 第二部分 · 升井（罐笼 + 地面矿区，检查点 20）

| ID | 角色 | English | 中文字幕 | 何时播放 |
|---|---|---|---|---|
| P2_GRIN_01 | GRINCH | Anybody else think elevator music would help? | 有人觉得这时候放点电梯音乐会好点吗？ | 罐笼上升中 |
| P2_TRUCK_03 | TRUCK | Radios are fried. No comms, no extraction. | 电台全烧了。联系不上，也没人来接。 | 罐笼上升中 |
| P2_SAND_01 | SANDMAN | Ore train in the rail yard runs north, past the old radar station. That dish can reach Price. | 货场那列运矿车往北开，会经过旧雷达站。那口天线能联系上 Price。 | 罐笼上升中 |
| P2_TRUCK_01 | TRUCK | Top's hot. Get ready. | 上面有人。准备好。 | 罐笼快到顶 |
| P2_TRUCK_02 | TRUCK | BTR! Get off the road! | BTR！离开路面！ | BTR 出现 |
| P2_GRIN_02 | GRINCH | Sandman — RPGs in the hoist house! Kill that thing! | Sandman——提升机房里有 RPG！干掉那铁家伙！ | BTR 出现，指向提升机房的 RPG |
| P2_GRIN_03 | GRINCH | Scratch one BTR! | BTR 报销了！ | BTR 被摧毁 |
| P2_SAND_03 | SANDMAN | Rail yard. Move, move! | 去货场。快，快！ | BTR 摧毁后约 3 秒，冲向货场 |

## 第三部分 · 铁马（列车，检查点 0–3）

| ID | 角色 | English | 中文字幕 | 何时播放 |
|---|---|---|---|---|
| SAND_01 | SANDMAN | Train's pulling out! Move, move, move! | 列车要开了！快，快，快！ | 检查点 0 开始，列车起步 |
| GRIN_01 | GRINCH | You want us to catch a train? In this? | 你要我们追火车？就这天气？ | 紧接上句 |
| TRUCK_01 | TRUCK | I'm on! Sandman, come on! | 我上来了！Sandman，快！ | Truck 跳上末节车厢 |
| SAND_02 | SANDMAN | Clear these cars. Push to the engine. | 清掉这些车厢，推进到车头。 | 玩家登车 / 检查点 1 |
| GRIN_02 | GRINCH | Snowmobiles, left side! | 左侧，雪地摩托！ | 第一波雪地摩托 |
| TRUCK_02 | TRUCK | More on the right! They're trying to board! | 右边还有！他们想爬上车！ | 第二波雪地摩托 |
| SAND_03 | SANDMAN | Grinch, take the engine. Truck, with me. | Grinch，去控制车头。Truck，跟我来。 | 车厢肃清 |
| GRIN_03 | GRINCH（无线电） | Engine's mine. Anybody know how to drive a Russian train? | 车头拿下了。谁会开俄国火车？ | Grinch 进入车头（无线电） |
| GRIN_05 | GRINCH（无线电） | Big lever, all the way forward. How hard can it be? | 大操纵杆，推到底。能有多难？ | 紧接上句（无线电），约 4 秒后列车加速 |
| TRUCK_05 | TRUCK | Sandman, get on that DShK! | Sandman，上那挺 DShK！ | 列车加速，指向 DShK |
| TRUCK_03 | TRUCK | Hind! Twelve o'clock high! | 雌鹿直升机！正前方高空！ | 玩家上机枪，雌鹿出现 |
| SAND_05 | SANDMAN | Light it up! Keep it off the engine! | 打它！别让它靠近车头！ | 紧接上句 |
| GRIN_04 | GRINCH（无线电） | Uh, guys? Bridge coming up. | 呃，各位？前面是桥。 | 前方出现铁桥（无线电） |
| TRUCK_04 | TRUCK | It's lining up on the bridge— | 它对准桥了—— | 雌鹿对准铁桥发射火箭 |
| SAND_06 | SANDMAN | Everybody — JUMP! | 所有人——跳！ | 铁桥被炸，跳车提示 |
| TRUCK_06 | TRUCK | Sandman… Sandman! On your feet, boss. | Sandman……Sandman！站起来，头儿。 | 跳车落地、黑屏后，交接第四部分 |
| KRAS_01 | 克拉辛（无线电） | Американцы на поезде. Остановить состав. Любой ценой. | 美国人在火车上。把车拦下来，不惜一切代价。 | 雌鹿出现约 6 秒后（俄军无线电） |

## 第四部分 · 最后阵地（雷达站，检查点 4–7）

照抄主剧本（STORY.md）。格式：ID 角色：English / 中文字幕；括号内为舞台说明。

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

## 尾声

黑屏 →「三个月后」→ 迪拜 → Price 和尤里驱车前往绿洲酒店 → 演职员表（片尾曲）→ 片尾彩蛋 →「完 · 感谢游玩」。

| ID | 角色 | English | 中文字幕 | 何时播放 |
|---|---|---|---|---|
| E_PRICE_01 | PRICE | This one's for Metal. | 这一枪，替 Metal 打。 | 尾声：迪拜，驶向绿洲酒店 |
| E_NIKO_01 | NIKOLAI（无线电） | Price, I am over the station. Three bodies… | Price，我到雷达站上空了。三具遗体…… | 片尾彩蛋：夜，暴风雪，直升机探照灯扫过雷达站（无线电） |
| E_NIKO_02 | NIKOLAI（无线电） | …No. Wait. One heat signature. Faint. | ……不，等等。有一个热源。很微弱。 | 紧接上句，然后硬切黑屏 →「完 · 感谢游玩」 |

演职员表主演：Sandman（你）、Truck、Grinch、John Price 上尉、尤里、克拉辛 上校、尼古拉。彩蛋刻意不交代谁还活着。
