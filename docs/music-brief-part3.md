> **注意：本文件描述的是已废弃的 v5 剧本（含索科洛夫）。现行剧本见 `docs/script.md`。**

# 「铁马」配乐制作清单

> **给执行的 AI（Gemini 等）：**这份文件是完整的任务说明。请按第 3 节逐段生成配乐，按第 1 节的规格导出，按第 5 节交付。所有段落必须是**纯音乐**，不要人声歌词（第 3 节注明可以用无词合唱的除外）。

---

## 0. 项目背景（用来把握风格）

- 这是一个同人游戏关卡，背景是《使命召唤：现代战争3》（2011）。
- 剧情：西伯利亚的暴风雪中，三名美军 Delta Force 队员和一名俄罗斯总统卫队军官跳上一列运矿列车逃亡。他们在车厢间与敌人交火，被雪地摩托和武装直升机追击，最后前方铁桥被炸断，全员跳车，列车坠入冰河。
- 整体风格：现代军事动作电影配乐。管弦乐加电子混合：低音弦乐的持续跑动音型、战鼓、铜管重音、合成器低频脉冲，带一点俄罗斯气质（低沉男声合唱、冷色调）。
- **不要模仿任何现有作品**：不要用《使命召唤》或任何电影的原曲旋律，也不要刻意模仿某位作曲家，要写原创旋律。
- 游戏里配乐会**随战斗强度切换和叠加**，所以第 3 节的大部分段落要求**同一速度、同一调性**，方便无缝衔接：

| 统一参数 | 值 |
|---|---|
| 速度 | **145 BPM**（M_INTRO、M_AFTER、M_END 除外） |
| 调性 | **D 小调**（主和弦进行建议 Dm – B♭ – C – Dm） |
| 拍号 | 4/4 |

---

## 1. 硬性规格

1. **格式**：WAV，48 kHz，16-bit 或 24-bit，立体声。只能导出 MP3 的话，用 320 kbps。
2. **命名**：文件名用第 3 节的编号，例如 `M_TRAIN.wav`。多个候选加 `_v1`、`_v2` 后缀。
3. **响度**：每段整体响度约 **−16 LUFS**，真峰值不超过 −1 dBTP，不要削波。
4. **循环段落**（第 3 节标"循环"的）：
   - 首尾必须能无缝接上：结尾的最后一拍要接回开头，**不要淡入淡出，不要混响尾巴被截断**。
   - 时长最好是**整数小节**。145 BPM 下 1 小节 ≈ 1.655 秒，例如 32 小节 ≈ 52.97 秒，48 小节 ≈ 79.45 秒。
5. **分轨（强烈建议）**：M_TRAIN、M_TURRET、M_BRIDGE 如果能导出分轨，请导出 4 轨，长度完全一致、从同一个起点开始：
   - `_drums`（打击乐）、`_bass`（低音弦乐与合成器低频）、`_strings`（弦乐跑动音型）、`_brass`（铜管与合唱）
   - 例：`M_TRAIN_v1_drums.wav`
   - 游戏会根据战斗激烈程度一层层叠加这些分轨。
6. **生成长度不够时**：如果工具一次只能生成 30 秒左右的片段，就用**同样的速度、调性和提示词**多生成几段，全部交付，拼接由我来做。

---

## 2. 段落总览

| 编号 | 场景 | 时长 | 循环 | 分轨 |
|---|---|---|---|---|
| M_INTRO | 标题画面 | 60–90 秒 | 循环 | 不需要 |
| M_CHASE | 追火车、登车 | 约 53 秒（32 小节） | 循环 | 可选 |
| M_TRAIN | 车厢间交火 | 约 80 秒（48 小节） | 循环 | **需要** |
| M_TURRET | 机枪对直升机 | 约 80 秒（48 小节） | 循环 | **需要** |
| M_BRIDGE | 冲向断桥 | 约 26 秒（16 小节） | 循环 | **需要** |
| M_JUMP | 跳车瞬间 | 3–5 秒 | 不循环 | 不需要 |
| M_AFTER | 列车坠河之后 | 60–90 秒 | 循环 | 不需要 |
| M_END | 结算画面 | 45–60 秒 | 不循环 | 不需要 |

---

## 3. 逐段说明

### M_INTRO — 标题画面
- **情绪**：寒冷、空旷、压抑的平静，暴风雪中的等待。
- **配器**：低音弦乐长音、远处的低沉男声哼唱（无词）、风声般的合成器质感、偶尔一声低音鼓。
- **速度**：自由节奏或慢速 70 BPM，D 小调。
- **提示词**：
  `Cinematic military ambient, cold and desolate Siberian blizzard mood, sustained low strings in D minor, distant wordless male choir hum, airy synth pads like wind, occasional deep taiko hit, slow and tense, instrumental, seamless loop`

### M_CHASE — 追火车、登车
- **情绪**：紧迫，开始奔跑，力度中等，留出空间给对白。
- **配器**：合成器八分音符脉冲、低音弦乐断奏、轻的军鼓滚奏，不要铜管。
- **速度**：145 BPM，D 小调。
- **提示词**：
  `Tense military action underscore, 145 BPM, D minor, pulsing synth bass ostinato in eighth notes, staccato low strings, light snare rolls, building urgency but restrained, no brass, leaves space for dialogue, instrumental, seamless loop`

### M_TRAIN — 车厢间交火（主战斗曲）
- **情绪**：全面开战，有推进感，坚定、硬朗。
- **配器**：十六分音符低音弦乐跑动、重型战鼓和军鼓、每 2 小节一次铜管重音、合成器低频冲击、低沉男声合唱垫底。
- **速度**：145 BPM，D 小调，和弦进行 Dm – B♭ – C – Dm。
- **提示词**：
  `Hybrid orchestral military action score, 145 BPM, D minor, driving sixteenth-note low string ostinato, heavy war drums and snare, powerful brass stabs every two bars, deep synth bass hits, low male choir underneath, relentless forward momentum, cold Russian atmosphere, instrumental, seamless loop`

### M_TURRET — 机枪对直升机
- **情绪**：比 M_TRAIN 再高一档，史诗、紧张、对抗。
- **配器**：在 M_TRAIN 的基础上加强铜管旋律、加高音弦乐颤音、打击乐更密。
- **速度**：145 BPM，D 小调，要能和 M_TRAIN 直接切换。
- **提示词**：
  `Epic hybrid orchestral battle music, 145 BPM, D minor, intense string tremolo, heroic but dark brass melody, dense taiko and snare patterns, aggressive synth bass, full low male choir, helicopter gunship battle intensity, instrumental, seamless loop`

### M_BRIDGE — 冲向断桥
- **情绪**：最高潮前的绝望加速，像一切都要失控。
- **配器**：不断上行的弦乐音阶、越来越密的鼓、铜管长音、合唱用"啊"音全力唱（**可以用无词合唱**）。
- **速度**：145 BPM，D 小调。
- **提示词**：
  `Climactic rising tension cue, 145 BPM, D minor, ascending string runs, accelerating drum rolls, sustained fortissimo brass, full wordless choir singing ah, desperate and overwhelming, like a runaway train heading toward a collapsed bridge, instrumental, seamless loop`

### M_JUMP — 跳车瞬间
- **情绪**：一声巨响，然后一切突然安静（慢动作）。
- **结构**：0 秒一记超低频冲击（"braam"），1 秒后迅速消失，只剩一点高音弦乐泛音，最后归于寂静。
- **提示词**：
  `Massive cinematic impact hit, deep low braam with sub bass, instantly drops into near silence with a faint high string harmonic, slow motion feeling, 4 seconds, instrumental, no loop`

### M_AFTER — 列车坠河之后
- **情绪**：悲伤、空洞、寒冷，失去战友前的预感。
- **配器**：独奏大提琴或高音弦乐长音、稀疏的钢琴单音、风声般的合成器。
- **速度**：慢速 60–70 BPM，D 小调。
- **提示词**：
  `Sorrowful cinematic elegy, slow 64 BPM, D minor, solo cello melody over sustained high strings, sparse distant piano notes, cold wind-like synth texture, grief and emptiness after a disaster in the snow, instrumental, seamless loop`

### M_END — 结算画面
- **情绪**：庄重、克制的收尾，带一点希望。
- **配器**：弦乐合奏、圆号主题、结尾停在 D 大三和弦上。
- **提示词**：
  `Solemn military end credits theme, 72 BPM, starts in D minor and resolves to D major, warm string ensemble, noble French horn melody, restrained and dignified with a hint of hope, clear ending, instrumental, 50 seconds`

---

## 4. 自检

- [ ] 8 段都有，文件名与编号一致
- [ ] 全部是纯音乐，没有歌词（M_BRIDGE 的无词合唱除外）
- [ ] 标"循环"的段落首尾能无缝接上，没有淡入淡出
- [ ] M_CHASE、M_TRAIN、M_TURRET、M_BRIDGE 都是 145 BPM、D 小调
- [ ] 分轨（如果有）长度完全一致、对齐同一个起点
- [ ] 响度约 −16 LUFS，没有削波

---

## 5. 交付

```
tiema_music/
├── M_INTRO.wav
├── M_CHASE.wav
├── M_TRAIN_v1.wav
├── M_TRAIN_v1_drums.wav   （如果有分轨）
├── ...
└── manifest.json
```

`manifest.json` 每个文件一条记录：

```json
[
  {"file": "M_TRAIN_v1.wav", "id": "M_TRAIN", "bpm": 145, "key": "D minor", "loop": true, "bars": 48, "duration_sec": 79.45, "stem": "full", "prompt": "所用的提示词"}
]
```

把整个 `tiema_music` 文件夹打包成 zip，上传回 Claude 的对话。
