# 「弃于寒冬」第五、六部分音频清单（配音 + 配乐）

> **给执行代理：**这份文件是完整的任务说明。配音按第 3 节生成，规格和上一份清单（「铁马」）完全一样；**同一角色必须继续用上一批的同一个声音（同一个 voice ID、同一组参数）**。配乐按第 4 节，每条单独生成。交付方式见第 5 节。

---

## 0. 剧情背景（用来把握语气）

- 接「铁马」：列车坠入峡谷，Metal 小队和索科洛夫跳车逃生。
- **第五部分「最后阵地」**（约 4 分钟）：
  - 小队在暴风雪中摸到一座废弃的苏联雷达站，想用老卫星天线把马卡洛夫的情报「ОАЗИС（绿洲）」发给 Price。
  - 上传很慢，俄军顺着雪地脚印追来，一波接一波进攻。中途天线被打坏，主角上楼顶校正。
  - 重装兵（Juggernaut）冲进大门；雌鹿直升机回来了。Truck 中弹牺牲。
  - 索科洛夫用针式导弹打下雌鹿，上传完成。
- **第六部分「结局」**（约 1 分钟）：
  - Sandman 用无线电联系 Price，确认他收到了情报。
  - Price 要派飞机来接，Sandman 拒绝，结束通话：「Metal 0-1，完毕。」
  - 剩下的人走进风雪。字幕切到「三个月后 · 迪拜」。
- 基调：比「铁马」更沉重。前半段是被围困的绝望，Truck 牺牲时要真实、克制，结局要安静。**不要播音腔，不要煽情过度。**

---

## 1. 硬性要求（与上一批相同）

1. **原创声音。**禁止克隆或模仿任何真实演员，包括原作配音演员（Price 也一样，见第 2 节）。
2. **干声。**不加混响、无线电、音乐、音效，这些都在游戏里处理。标了「无线电」的台词也交干声。
3. **一句台词一个文件**，文件名就是编号，不得改动。
4. **格式：**WAV，48 kHz（44.1 kHz 也可），16-bit，单声道。只能出 MP3 的话用 192 kbps 以上，文件名不变。
5. **静音：**首尾静音裁到 0.1–0.2 秒。
6. **响度：**峰值不超过 -1 dBFS，不能削波，同一角色各句音量一致。
7. **俄语台词**用支持俄语的声音模型按俄语发音，拉丁转写只供核对。

---

## 2. 角色声音

沿用上一批：`sandman`、`truck`、`grinch`、`sokolov`、`ru_soldier_a/b/c`、`krasin`，**一律用原来的声音**。

新增一个角色：

| 角色 key | 角色 | 声音设定 | 选声建议 |
|---|---|---|---|
| `price` | Price 上尉（只在无线电里出现） | 英国男性，50 岁左右，嗓音粗粝、低沉，话少而笃定 | 选一个原创的成熟英式男声，**不要模仿原作配音演员** |

---

## 3. 配音清单

### 3.1 第五部分：最后阵地（27 个文件）

| 编号 | 角色 key | 台词 | 中文字幕 | 表演指导 |
|---|---|---|---|---|
| P5_SAND_01 | sandman | Sokolov. On your feet. We can't stay here. | 索科洛夫，起来。不能待在这儿。 | 刚摔完，喘、压着嗓子，但仍是命令口吻 |
| P5_GRIN_01 | grinch | Tell me that's the radar station. Tell me it's not another train. | 告诉我那是雷达站。别又是一列火车。 | 冻得发抖，苦中作乐 |
| P5_SAND_02 | sandman | Old Soviet early-warning site. If that dish still works, we can push the intel out. | 苏联时期的预警站。只要那口天线还能用，就能把情报发出去。 | 低声、快速判断 |
| P5_SOKO_01 | sokolov | The generator is downstairs. I can start it. | 发电机在楼下，我能启动它。 | 冷静，俄国口音 |
| P5_TRUCK_01 | truck | Contacts on the ridge! They followed our tracks! | 山脊上有敌人！他们顺着脚印追来了！ | 大喊警告 |
| P5_SAND_03 | sandman | Grinch, get that uplink running. Everyone else, hold this building! | Grinch，把上行链路弄好。其他人，守住这栋楼！ | 果断下令，盖过枪声 |
| P5_GRIN_02 | grinch | Uplink's live. Upload's slow — this thing's older than my dad. | 链路通了。上传很慢——这玩意儿比我爸岁数还大。 | 一边敲键盘一边念叨 |
| P5_GRIN_03 | grinch | Twenty-five percent! | 百分之二十五！ | 喊出来报进度 |
| P5_GRIN_04 | grinch | Fifty percent! Keep 'em off me! | 百分之五十！别让他们靠近我！ | 紧张 |
| P5_GRIN_05 | grinch | The dish took a hit! We lost the signal! | 天线被打中了！信号断了！ | 惊慌 |
| P5_SAND_04 | sandman | Sokolov, get to the roof and realign that dish! Go! | 索科洛夫，上楼顶，把天线重新对准！快去！ | 急迫下令 |
| P5_SOKO_02 | sokolov | Dish is aligned. Try it now! | 天线对好了，再试试！ | 喘着气，大声 |
| P5_GRIN_06 | grinch | Signal's back! Seventy-five… come on, come on… | 信号回来了！百分之七十五……快点，快点…… | 先松口气，再焦急地催 |
| P5_TRUCK_02 | truck | Juggernaut! Coming through the gate! | 重装兵！从大门冲进来了！ | 大喊，带惊惧 |
| P5_SAND_05 | sandman | Focus fire! Hit him with everything you've got! | 集中火力！把所有家伙都往他身上招呼！ | 怒吼 |
| P5_GRIN_07 | grinch | He's down! Big boy's down! | 他倒了！大块头倒了！ | 兴奋又后怕 |
| P5_TRUCK_03 | truck | That Hind's back! | 那架雌鹿又回来了！ | 绝望的警告 |
| P5_TRUCK_04 | truck | I'm hit… I'm hit. I'm okay. Keep shooting. | 我中弹了……我中弹了。我没事，继续打。 | 痛，强撑，声音变弱 |
| P5_SAND_06 | sandman | Truck! Stay with me, big man. Stay with me. | Truck！撑住，大块头。撑住。 | 压低声音，急切而温柔，不哭腔 |
| P5_TRUCK_05 | truck | Sandman… it's been an honor. | Sandman……很荣幸。 | 非常轻，气声，最后一口气 |
| P5_SAND_07 | sandman | …Truck's down. | ……Truck 牺牲了。 | 停顿后说，平静到发冷，用来报告而不是哀嚎 |
| P5_SOKO_03 | sokolov | There is an Igla in the armory. | 军械库里有一具针式导弹。 | 冷静，像在压住情绪 |
| P5_SAND_08 | sandman | Then use it. Bring that bird down! | 那就用它。把那鸟给我打下来！ | 由低到高，带怒火 |
| P5_SOKO_04 | sokolov | Target locked. | 目标锁定。 | 短、稳 |
| P5_GRIN_08 | grinch | It's down! It's down! | 打下来了！打下来了！ | 狂喜 |
| P5_GRIN_09 | grinch | One hundred percent. It's out. It's out, Sandman. | 百分之百。发出去了。发出去了，Sandman。 | 先喊，后面越说越轻，像终于松了一口气 |
| P5_KRAS_01 | krasin | Соколов. Ты выбрал американцев. Тогда умри вместе с ними. | 索科洛夫。你选了美国人。那就跟他们一起死吧。 | **无线电**。俄语，平静、冰冷。转写：Sokolov. Ty vybral amerikantsev. Togda umri vmeste s nimi. |

### 3.2 第六部分：结局（10 个文件）

| 编号 | 角色 key | 台词 | 中文字幕 | 表演指导 |
|---|---|---|---|---|
| P6_SAND_01 | sandman | Price, this is Sandman. Tell me you got the package. | Price，我是 Sandman。告诉我你收到包裹了。 | 疲惫，靠着墙说，声音沙哑 |
| P6_PRICE_01 | price | Got it. "Oasis"… Makarov's in Dubai. | 收到了。"绿洲"……马卡洛夫在迪拜。 | **无线电**。低沉，带一丝杀意 |
| P6_SAND_02 | sandman | Then go get him. | 那就去抓他。 | 平静、坚定 |
| P6_PRICE_02 | price | Hold on, Sandman. I'll send a bird for you. | 撑住，Sandman。我派飞机去接你们。 | **无线电**。真诚 |
| P6_SAND_03 | sandman | Negative. Weather's closing in, and so are they. Finish it, Price. | 不用了。暴风雪要来了，他们也是。把这事了结，Price。 | 平静地拒绝，不悲情 |
| P6_PRICE_03 | price | …Understood. Good luck, mate. | ……明白。祝你好运，伙计。 | **无线电**。停顿，克制的敬意 |
| P6_SAND_04 | sandman | Metal 0-1… out. | Metal 0-1……完毕。 | 很轻，像放下一件事 |
| P6_GRIN_01 | grinch | So… what now? | 那……现在怎么办？ | 茫然、轻声 |
| P6_SAND_05 | sandman | Now we walk. | 现在，走。 | 站起身的感觉，简短 |
| P6_SOKO_01 | sokolov | Moscow is four thousand kilometers. | 离莫斯科四千公里。 | 冷幽默，几乎不带语气 |

### 3.3 俄军新增喊话（3 句 × 3 个声音 = 9 个文件）

每句用 `ru_soldier_a`、`ru_soldier_b`、`ru_soldier_c` 各录一遍，文件名后缀分别为 `_a`、`_b`、`_c`（例如 `RU_06_a`）。

| 编号 | 台词（俄语） | 拉丁转写 | 中文 | 表演指导 |
|---|---|---|---|---|
| RU_06 | Они в здании! Окружай! | Oni v zdanii! Okruzhay! | 他们在楼里！包围！ | 进攻时大喊 |
| RU_07 | Бей по антенне! | Bey po antenne! | 打那口天线！ | 指挥，急促 |
| RU_08 | Тяжёлый пошёл! Прикрывай! | Tyazhyolyy poshyol! Prikryvay! | 重装兵上了！掩护！ | 兴奋地喊 |

**合计：**27 + 10 + 9 = **46 个文件**。

---

## 4. 配乐清单（给 Gemini，每条单独生成）

整体风格延续上一首《Beneath the White Sky》：D 小调，管弦乐 + 低频合成器 + 战鼓。**不要人声歌词**（无词合唱可以）。每条请单独生成、单独导出。

| 编号 | 时长 | 速度 | 描述 | 循环 |
|---|---|---|---|---|
| M5_AWAKE | 40 秒 | 无明显节拍 | 劫后余生。风声般的长音铺底、低音弦乐、远处金属回响。不要鼓。 | 首尾能无缝循环 |
| M5_DEFEND | 60 秒 | 140 BPM | 被围困的防守。弦乐断奏持续推进、战鼓、低音合成器脉冲，紧张但留出空间给枪声。 | 首尾能无缝循环 |
| M5_JUGG | 40 秒 | 70 BPM（半速感） | 重装兵压境。沉重的铜管重音、失真低音、钢铁撞击般的打击乐，压迫感强。 | 首尾能无缝循环 |
| M5_LOSS | 35 秒 | 慢，约 60 BPM | Truck 牺牲。战斗声退去，只剩独奏大提琴或钢琴加弦乐长音，悲伤但克制，结尾渐弱。 | 播一次 |
| M5_FINAL | 50 秒 | 145 BPM | 最后的反击。全编制管弦乐、无词合唱、密集战鼓，高潮感。 | 首尾能无缝循环 |
| M6_END | 70 秒 | 慢 | 结局主题。稀疏的钢琴和弦乐，疲惫里有一点希望。最后 10 秒加入一丝中东色彩的乐器（比如乌德琴或芦笛），引出「三个月后 · 迪拜」，以长音结束。 | 播一次 |

如果只能生成一首完整音轨，那就按上表顺序连成一首（约 5 分钟），并且**每段之间留 1 秒静音**，方便切分。

---

## 5. 交付

- 配音：所有文件打包成 `part5_vo.zip`，平铺，不要子文件夹。
- 配乐：每条一个 MP3（或 WAV），文件名就是编号（如 `M5_DEFEND.mp3`），打包成 `part5_music.zip`。
- 自检：
  - 文件数是 46（配音）和 6（配乐）。
  - 每个文件都能播放。
  - 同一角色前后声音一致。
  - Truck 牺牲的三句（P5_TRUCK_04、P5_SAND_06、P5_TRUCK_05）由人工试听过一遍，确认语气不出戏。
