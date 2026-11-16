> **注意：本文件描述的是已废弃的 v5 剧本（含索科洛夫）。现行剧本见 `docs/script.md`。**

# 「铁马」音频制作清单（配音 + 配乐）

> **给执行代理：**这份文件是完整的任务说明。请按第 3、4 节生成全部配音，按第 1 节的规格导出、按第 5 节交付，并做完第 6 节的自检。配乐（第 7 节）如果你没有接 Suno API，就跳过，在报告里注明"配乐需用户手动生成"。

---

## 0. 项目背景（用来把握语气）

- 这是一个同人游戏关卡，背景是《使命召唤：现代战争3》（2011）。
- 剧情：西伯利亚钻石矿坍塌后，Delta Force「Metal」小队的 Sandman、Truck、Grinch，和俄罗斯总统卫队军官 Sokolov 一起，在暴风雪中跳上一列运矿列车逃亡。途中遭到雪地摩托和雌鹿武装直升机追击，最后前方铁桥被炸，全员跳车。
- 基调：紧张、寒冷、军事写实。喊话要像在风雪和枪声里喊出来的，**不要播音腔**。
- 这段是「铁马」，游戏时长约 3 分钟。

---

## 1. 硬性要求

1. **原创声音。**禁止克隆或模仿任何真实演员的声音，尤其是原作的配音演员。
2. **干声。**不加混响、回声、无线电、背景音乐或音效，这些都在游戏里处理。
3. **一句台词一个文件**，文件名就是编号，不得改动。
4. **格式：**WAV，48 kHz（44.1 kHz 也可），16-bit，单声道。如果 API 只能输出 MP3，用 192 kbps 以上，文件名不变，只改扩展名。
5. **静音：**首尾静音裁到 0.1–0.2 秒。
6. **响度：**峰值不超过 -1 dBFS，不能削波。同一角色各句音量保持一致。喊叫靠表演，不靠把音量推爆。
7. **俄语台词**必须用支持俄语的声音模型，按俄语发音。表里附了拉丁转写，供核对用。
8. **同一角色的所有台词**必须用同一个声音（同一个 voice ID、同一组参数）。

---

## 2. 角色声音设定

| 角色 key | 角色 | 声音设定 | 选声建议 |
|---|---|---|---|
| `sandman` | Sandman | 美国男性，40 多岁，沙哑、低沉、沉稳，小队领队 | 成熟、带颗粒感的低音男声 |
| `truck` | Truck | 美国男性，30–40 岁，低沉厚重，话少，可靠 | 比 Sandman 更厚、更慢 |
| `grinch` | Grinch | 美国男性，30 岁左右，语速快，略尖，爱调侃 | 明亮、有活力的男声 |
| `sokolov` | Sokolov（主角） | 俄罗斯男性，约 30 岁，说带俄国口音的英语，冷静克制 | TTS 控制不了口音的话，优先选以俄语为母语的多语种声音来念英文 |
| `ru_soldier_a` | 俄军士兵 A | 俄罗斯男性，年轻，嗓音偏高 | 俄语母语声音 |
| `ru_soldier_b` | 俄军士兵 B | 俄罗斯男性，中年，粗哑 | 俄语母语声音，与 A、C 明显不同 |
| `ru_soldier_c` | 俄军士兵 C | 俄罗斯男性，低沉 | 俄语母语声音，与 A、B 明显不同 |
| `krasin` | 克拉辛上校（反派） | 俄罗斯男性，约 50 岁，低沉、冰冷，平静得吓人 | 俄语母语声音 |

---

## 3. 配音清单

### 3.1 主要角色（共 17 个文件）

| 编号 | 角色 key | 台词 | 中文字幕 | 表演指导 |
|---|---|---|---|---|
| SAND_01 | sandman | Train's pulling out! Move, move, move! | 列车要开了！快，快，快！ | 顶着狂风大喊，急迫 |
| GRIN_01 | grinch | You want us to catch a train? In this? | 你要我们追火车？就这天气？ | 边跑边喘，挖苦；重读最后的 "this" |
| TRUCK_01 | truck | Sokolov, jump! Davai! | 索科洛夫，跳！快！ | 大喊。"Davai" 是俄语"快"，读作 da-VAI，重音在后 |
| SAND_02 | sandman | Clear these cars. Push to the engine. | 清掉这些车厢，推进到车头。 | 冷静下令，短促有力 |
| GRIN_02 | grinch | Snowmobiles, left side! | 左侧，雪地摩托！ | 急促警告 |
| TRUCK_02 | truck | More on the right! They're trying to board! | 右边还有！他们想爬上车！ | 急促，边开枪边喊 |
| SAND_03 | sandman | Grinch, take the engine. Truck, with me. | Grinch，去控制车头。Truck，跟我来。 | 果断 |
| GRIN_03 | grinch | Engine's mine. Anybody know how to drive a Russian train? | 车头拿下了。谁会开俄国火车？ | 半开玩笑，带点慌 |
| SOKO_01 | sokolov | Push the lever forward. All the way. | 把操纵杆推到底。 | 冷静，俄国口音 |
| SAND_04 | sandman | Sokolov, get on that gun! | 索科洛夫，上那挺机枪！ | 大喊下令 |
| TRUCK_03 | truck | Hind! Twelve o'clock high! | 雌鹿直升机！正前方高空！ | 惊觉警告 |
| SAND_05 | sandman | Light it up! Keep it off the engine! | 打它！别让它靠近车头！ | 大喊，激烈 |
| GRIN_04 | grinch | Uh, guys? Bridge coming up. | 呃，各位？前面是桥。 | 不安，语气往下沉 |
| TRUCK_04 | truck | It's lining up on the bridge— | 它对准桥了—— | 惊觉，话说到一半被打断，结尾要突然 |
| SAND_06 | sandman | Everybody — JUMP! | 所有人——跳！ | 全片最用力的一声，撕心裂肺，但不要削波 |
| SAND_07 | sandman | Sokolov... Sokolov! On your feet! | 索科洛夫……索科洛夫！站起来！ | 焦急，带喘息；第一个名字较轻，第二个喊出来。距离感由游戏处理，这里正常录 |
| KRAS_01 | krasin | Взорвите мост. | 炸掉那座桥。 | 俄语，转写 vzor-VI-te MOST。冰冷平静，像在下一个无关紧要的命令 |

### 3.2 俄军士兵喊话（5 句，每句用 3 个声音各生成一遍，共 15 个文件）

文件名后缀 `_a`、`_b`、`_c` 分别对应 `ru_soldier_a`、`ru_soldier_b`、`ru_soldier_c`。例如 RU_01 要生成 `RU_01_a`、`RU_01_b`、`RU_01_c` 三个文件。

| 编号 | 台词（俄语） | 拉丁转写 | 中文字幕 | 表演指导 |
|---|---|---|---|---|
| RU_01 | Вон они, на поезде! | von a-NI, na po-YEZ-de | 他们在火车上！ | 发现目标，大喊 |
| RU_02 | Перезаряжаю! | pe-re-za-rya-ZHA-yu | 换弹！ | 短促喊叫 |
| RU_03 | Граната! | gra-NA-ta | 手雷！ | 惊慌 |
| RU_04 | Обходи слева! | ab-kha-DI SLE-va | 从左边包抄！ | 下令 |
| RU_05 | Я ранен! | ya RA-nen | 我中弹了！ | 痛苦，咬着牙 |

**配音文件总数：17 + 15 = 32 个。**

---

## 4. 机器可读版本

内容与第 3 节相同，方便脚本批量生成。有 `variants` 的条目，每个变体生成一个文件，文件名为 `{id}_{variant}`，声音用 `voice_map` 里对应的角色。

```json
{
  "voices": {
    "sandman": "American male, 40s, gravelly, low, calm squad leader",
    "truck": "American male, 30s-40s, deep and heavy, few words, dependable",
    "grinch": "American male, ~30, fast-talking, slightly sharp, sarcastic",
    "sokolov": "Russian male, ~30, English with Russian accent, calm and restrained",
    "ru_soldier_a": "Russian male soldier, young, higher voice, speaks Russian",
    "ru_soldier_b": "Russian male soldier, middle-aged, rough, speaks Russian",
    "ru_soldier_c": "Russian male soldier, deep voice, speaks Russian",
    "krasin": "Russian male, ~50, low, cold, eerily calm, speaks Russian"
  },
  "lines": [
    {"id": "SAND_01", "role": "sandman", "lang": "en", "text": "Train's pulling out! Move, move, move!", "subtitle_zh": "列车要开了！快，快，快！", "direction": "shouting over a blizzard, urgent"},
    {"id": "GRIN_01", "role": "grinch", "lang": "en", "text": "You want us to catch a train? In this?", "subtitle_zh": "你要我们追火车？就这天气？", "direction": "out of breath while running, sarcastic, stress on 'this'"},
    {"id": "TRUCK_01", "role": "truck", "lang": "en", "text": "Sokolov, jump! Davai!", "subtitle_zh": "索科洛夫，跳！快！", "direction": "shouting; 'Davai' is Russian for 'come on', pronounced da-VAI"},
    {"id": "SAND_02", "role": "sandman", "lang": "en", "text": "Clear these cars. Push to the engine.", "subtitle_zh": "清掉这些车厢，推进到车头。", "direction": "calm command, short and firm"},
    {"id": "GRIN_02", "role": "grinch", "lang": "en", "text": "Snowmobiles, left side!", "subtitle_zh": "左侧，雪地摩托！", "direction": "urgent warning"},
    {"id": "TRUCK_02", "role": "truck", "lang": "en", "text": "More on the right! They're trying to board!", "subtitle_zh": "右边还有！他们想爬上车！", "direction": "urgent, shouting while firing"},
    {"id": "SAND_03", "role": "sandman", "lang": "en", "text": "Grinch, take the engine. Truck, with me.", "subtitle_zh": "Grinch，去控制车头。Truck，跟我来。", "direction": "decisive"},
    {"id": "GRIN_03", "role": "grinch", "lang": "en", "text": "Engine's mine. Anybody know how to drive a Russian train?", "subtitle_zh": "车头拿下了。谁会开俄国火车？", "direction": "half-joking, a little panicked"},
    {"id": "SOKO_01", "role": "sokolov", "lang": "en", "text": "Push the lever forward. All the way.", "subtitle_zh": "把操纵杆推到底。", "direction": "calm, Russian accent"},
    {"id": "SAND_04", "role": "sandman", "lang": "en", "text": "Sokolov, get on that gun!", "subtitle_zh": "索科洛夫，上那挺机枪！", "direction": "shouted order"},
    {"id": "TRUCK_03", "role": "truck", "lang": "en", "text": "Hind! Twelve o'clock high!", "subtitle_zh": "雌鹿直升机！正前方高空！", "direction": "alarmed warning"},
    {"id": "SAND_05", "role": "sandman", "lang": "en", "text": "Light it up! Keep it off the engine!", "subtitle_zh": "打它！别让它靠近车头！", "direction": "shouting, intense"},
    {"id": "GRIN_04", "role": "grinch", "lang": "en", "text": "Uh, guys? Bridge coming up.", "subtitle_zh": "呃，各位？前面是桥。", "direction": "uneasy, tone dropping"},
    {"id": "TRUCK_04", "role": "truck", "lang": "en", "text": "It's lining up on the bridge—", "subtitle_zh": "它对准桥了——", "direction": "sudden realization, cut off mid-sentence, abrupt ending"},
    {"id": "SAND_06", "role": "sandman", "lang": "en", "text": "Everybody — JUMP!", "subtitle_zh": "所有人——跳！", "direction": "the most intense shout of the scene, raw, but no clipping"},
    {"id": "SAND_07", "role": "sandman", "lang": "en", "text": "Sokolov... Sokolov! On your feet!", "subtitle_zh": "索科洛夫……索科洛夫！站起来！", "direction": "anxious, breathing hard; first name softer, second shouted"},
    {"id": "KRAS_01", "role": "krasin", "lang": "ru", "text": "Взорвите мост.", "subtitle_zh": "炸掉那座桥。", "direction": "cold, calm, like an unimportant order", "translit": "vzor-VI-te MOST"},
    {"id": "RU_01", "lang": "ru", "text": "Вон они, на поезде!", "subtitle_zh": "他们在火车上！", "direction": "spotting the enemy, shouting", "translit": "von a-NI, na po-YEZ-de", "variants": ["a", "b", "c"]},
    {"id": "RU_02", "lang": "ru", "text": "Перезаряжаю!", "subtitle_zh": "换弹！", "direction": "short shout", "translit": "pe-re-za-rya-ZHA-yu", "variants": ["a", "b", "c"]},
    {"id": "RU_03", "lang": "ru", "text": "Граната!", "subtitle_zh": "手雷！", "direction": "panicked", "translit": "gra-NA-ta", "variants": ["a", "b", "c"]},
    {"id": "RU_04", "lang": "ru", "text": "Обходи слева!", "subtitle_zh": "从左边包抄！", "direction": "command", "translit": "ab-kha-DI SLE-va", "variants": ["a", "b", "c"]},
    {"id": "RU_05", "lang": "ru", "text": "Я ранен!", "subtitle_zh": "我中弹了！", "direction": "in pain, through gritted teeth", "translit": "ya RA-nen", "variants": ["a", "b", "c"]}
  ],
  "voice_map": {"a": "ru_soldier_a", "b": "ru_soldier_b", "c": "ru_soldier_c"}
}
```

---

## 5. 输出与交付

目录结构：

```
tiema_audio/
├── vo/
│   ├── SAND_01.wav
│   ├── ...
│   └── RU_05_c.wav
├── music/              （如果生成了配乐）
│   ├── M_TRAIN.wav
│   └── ...
└── manifest.json
```

`manifest.json` 每个文件一条记录：

```json
[
  {"file": "vo/SAND_01.wav", "id": "SAND_01", "role": "sandman", "voice": "所用声音的名称或 ID", "duration_sec": 2.1, "peak_dbfs": -1.8, "text": "Train's pulling out! Move, move, move!"}
]
```

完成后把整个 `tiema_audio` 文件夹打包成 zip，交给用户上传回 Claude 的对话。

---

## 6. 交付前自检

- [ ] 配音文件正好 32 个，文件名与清单完全一致
- [ ] 逐个试听：没有读错、吞字、杂音、削波
- [ ] 俄语句子确实是俄语发音，不是英语腔
- [ ] 同一角色所有句子音色一致
- [ ] TRUCK_04 结尾是突然中断；SAND_06 是全片最强的喊叫
- [ ] 没有加任何混响或效果
- [ ] manifest.json 已生成，时长和峰值已填写

---

## 7. 配乐（Suno）

如果没有 Suno API，这部分由用户在 Suno 网页手动生成，生成方式相同。

- 模式选 **Instrumental（纯音乐）**，能导出 WAV 就导 WAV。
- 每段生成 2–3 个候选，命名为 `M_TRAIN_v1`、`M_TRAIN_v2` 等，全部交付，由用户挑选。
- **M_TRAIN 如果能导出分轨，一定要导**，命名为 `M_TRAIN_v1_drums.wav`、`M_TRAIN_v1_strings.wav`、`M_TRAIN_v1_brass.wav`、`M_TRAIN_v1_other.wav`。游戏会根据战斗激烈程度一层层叠加。
- 循环：生成不了无缝循环也没关系，交付完整曲目，循环点在游戏里做。

| 编号 | 场景 | Suno 提示词 | 时长 | 循环 |
|---|---|---|---|---|
| M_TRAIN | 列车追逐 | `cinematic military action, hybrid orchestral and electronic, driving low string ostinato, heavy war drums, brass stabs, cold Russian atmosphere, male choir, 145 BPM, instrumental` | 2–3 分钟 | 需要 |
| M_JUMP | 跳车瞬间 | `massive cinematic impact hit, braam, then sudden silence, instrumental` | 3–5 秒 | 不需要 |
| M_AFTER | 冰面上苏醒 | `dark ambient drone, high sustained strings, cold wind texture, sorrowful, sparse, instrumental` | 60–90 秒 | 需要 |

---

## 8. 不要做的事

- 不要克隆或模仿真实演员的声音
- 不要加任何效果（混响、无线电、压缩过度）
- 不要改文件名，不要把多句合并成一个文件
- 不要使用《使命召唤》原版游戏的任何音频
