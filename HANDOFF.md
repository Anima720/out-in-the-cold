# 交接文件（2026-11-17 13:55，Claude → 下一位接手者）

> 先读完本文件，再读 `docs/v6/COMMON.md`（工程约定、测试钩子、无头测试方法）和 `docs/v7/BACKLOG.md`（用户的 30 条反馈原文整理与接口约定）。
> 旧的 v6/v7 过程记录在 `docs/history/HANDOFF_v6_v7_log.md`，只在需要追溯时看。

## 1. 项目是什么

《弃于寒冬 · Out in the Cold》是一部《使命召唤：现代战争 3》（2011）风格的非官方同人战役，在浏览器里运行。用 three.js r170 写成，模型、贴图、特效、音效全部由代码实时生成。`node build.mjs` 会把 `src/` 打包进 `template.html`，生成单文件 `dist/index.html`，双击即可游玩。界面文字一律简体中文。配音关闭，只有字幕。作者署名是 **Anima720**。

剧情（v6 起）：玩家扮演三角洲部队 Metal 小队队长「睡魔」（Sandman），队友是「卡车」（Truck）和「格林奇」（Grinch）。四个部分加尾声：
1. 矿井（检查点 10、11，`cave.js`，`G.lvl` 1）
2. 升井和地面货场（检查点 20，`cave.js`，`G.lvl` 3）
3. 运矿列车（检查点 0–3，`director.js`/`train.js`，`G.lvl` 2）
4. 雷达站「最后阵地」（检查点 4–7，`part5.js`/`station.js`/`assault.js`/`finale.js`，`G.lvl` 5）
5. 尾声（`cine.js`）：迪拜 → 尼科莱发现微弱信号 → 黑屏 → 片尾名单

## 2. 分支

| 分支 | 内容 |
|---|---|
| `main` | v5 旧版，**不要动**，等用户验收后再合入 |
| `v6-sandman` | **集成分支，在这里接着做。** 包含 v6 全部改动，以及 v7 的四个工作包中已完成的三个（P4、T、W）和主控自己的界面/尾声改动。13:55 冒烟测试：检查点 10/11/20/0/2/3/4/5/6/7 和尾声都能进入，`window.__errors` 为空 |
| `wip-ai` | **未完成**的 v7「敌我 AI」包快照，基线是 `0caec10`（`git diff 0caec10 origin/wip-ai` 就是它的全部改动），没有合入，也没有通过测试 |
| `wip-a1`/`wip-a2`/`wip-b`/`wip-c`/`wip-t`/`wip-w` | 已合入的旧快照，可忽略 |

## 3. 构建与测试

- `npm install && node build.mjs` → `dist/index.html`（约 12 MB，配乐以 base64 内嵌）。
- 无头测试：Python Playwright + Chrome，参数和测试钩子见 `docs/v6/COMMON.md`。常用钩子有：
  - 进入与推进：`__begin(k)` 从检查点 k 开始；`__sim(秒)` 确定性推进游戏逻辑
  - 状态对象：`__P` 玩家、`__G` 全局、`__D` 导演、`__WP` 武器
  - 操作与调试：`__input` 模拟按键；`__killAll()` 杀光敌人；`window.__freeze=true` 定格画面以便截图；`window.__errors` 运行时错误，必须为空
- 现成的测试脚本：
  - 各关试玩：`tools/playtest_mine_surface.py`、`tools/playtest_train.py`、`tools/playtest_last_stand.py`、`tools/playtest_assault.py`
  - 结局和尾声截图：`tools/capture_finale.py`、`tools/capture_epilogue.py`
  - 武器：`tools/test_weapons.py`（参数 `logic` / `shots` / `npc`）
  - 碰撞、血迹与铁丝网：`tools/test_crowd.py`、`tools/test_blood_fence.py`
  - 各包自用的辅助脚本：`tools/t_*.py`
- **测试脚本暂停 requestAnimationFrame 时，必须把所有被挂起的回调排成队列再一起放出**（`HUD.fade` 也用 rAF），写法见 `tools/playtest_last_stand.py`。
- 软件渲染很慢：逻辑测试用 480×270、`?q=low&god=1`，只在少数视觉检查时用 640×360、`q=medium`。截图之后一定要亲眼看。

## 4. 用户 30 条反馈（v7）的状态

条目原文见 `docs/v7/BACKLOG.md`。

| 状态 | 条目 |
|---|---|
| ✅ 已完成并合入 `v6-sandman` | 1 脚步声、2 红点、3/27 Q/E 探头 + F 近战、5 瞄具与下挂、6 尸体打转、7 车道不重叠、8 刷怪压力 + 三个步行重装兵、9 天线建模、10 火车头内景、11 机枪段雪橇加量、12 直升机炸桥 + 火车坠落、13 第二部分加敌人、15 电脑重复交互、16 罐笼电梯、18 尾声彩蛋挪位、19 署名 Anima720、20 炸门 + 格林奇台词、21 迪拜场景/握方向盘/停机坪、22 枪声、23 G 掷回手雷、24 对话框、25 F11 全屏、26 删纪念 Truck、28 补给提示、29 敌方机枪手开火、30 加载页标题 |
| 🟡 做了一半 | **17 名字**：字幕说话人显示名已改（`hud.js` 的 `NAME` 表：睡魔/卡车/格林奇/普莱斯/尤里/尼科莱/俄军高级将领），片尾名单已改。**还没改的**是各文件 `LINES` 中文字幕正文里的英文名（Sandman、Truck、Grinch、Price、Nikolai…）和「克拉辛」，以及其他中文界面文字里的英文名（如 `director.js` 身份卡「“Sandman” 军士长」、目标/提示文字）。要求：说话人标签（`LINES` 每项第一个元素）保持英文不动；只改中文正文。注意中文里「卡车」既是人名又是普通名词，改的时候要看上下文 |
| 🔴 未完成 | **4 敌人武器多样化 + 倒地拿手枪还击**、**14 更聪明的敌我 AI + 双方近战动作**。半成品在 `wip-ai` 分支 |

### `wip-ai` 半成品里有什么

| 文件 | 改动 |
|---|---|
| 新文件 `src/combat.js`（392 行） | 公共战斗层：攻击令牌、射击、武器配置 `WPN`/`rollLoadout`/`setLoadout`、倒地状态、近战、小队层面的包抄/压制、队友喊话。`window.__ai` 里有统计数据 |
| `src/ai.js` | 改为调用 `combat.js` |
| `src/raider.js` | 改为调用 `combat.js` |
| `src/humans.js`（约 +220 行） | 第三人称枪械模型、倒地和近战姿势 |
| 测试脚本 | `tools/test_ai.py`、`tools/shot_ai.py` |

合并时可能冲突的地方：
- **`ai.js`**：T 包改过 `Enemy.updateGunnerPos` 和 `Enemy.update` 的机枪手分支，要保留 T 的版本。
- **`humans.js`**：P4 包改过 `Ragdoll` 类，要保留 P4 的版本。
- **`TOK`、`requestToken`、`shootAtPlayer`**：半成品把它们从 `ai.js` 挪到了 `combat.js`。合并后要确认其他文件（`part5.js`、`assault.js`、`crowd.js` 等）的 import 都还能找到。

已知需要它顺带修的：
- **列车敌人的子弹从世界原点射出**：共享的枪口向量在 `shootAtPlayer` 里被覆盖了。
- **敌人开火音效没用上新枪声**：要改成 `snd: WDEF[key]?.far ?? 旧音效键`（W 包给每把枪定义了按距离过滤的敌方音效名）。
- **掉落武器要带配件**：敌人死后设 `h.dropWeapon = 武器键`、`h.dropAtt = G.rollAtt?.(key)`，拾取逻辑已在 `pickups.js` 里实现。
- **倒地敌人的状态约定**：倒地后仍留在 `G.enemies` 里，并设 `e.downed = h.downed = true`（`crowd.js` 已忽略 `h.downed`）。

## 5. 已知问题和待办（来自各包报告和主控截图）

1. `raider.js` 的 `ENTRY`（步行敌人穿过围栏的路线点）还不知道 P4 新开的四个围栏缺口，以及加宽到 10 m 的北门。请对照 `station.js` 里的围栏代码补进去。
2. 最后阵地存活敌人上限 16 偶尔会被一整车兵突破（无伤测试里最多见到 21 个）：上限只拦住了还没出发的车，车上已经装好的兵照样会下车。
3. 控制室墙面和天花板的条纹混凝土贴图仰视时像径向模糊，很脏；被格林奇拖行时，他的腿占了大半个画面。
4. 标题页文案还写着「英文配音 + 中文字幕」（`main.js` 里的 `m-note`），实际配音已关闭。
5. 炸门之后的几帧、补给提示、格林奇倒地新位置都还没重新截图确认。
6. 火车段：低分辨率下火箭弹尾迹偏淡；格林奇推满操纵杆时手臂略微够过头；火车头驾驶室多了一盏点光源（性能）。
7. 人物碰撞个别帧仍有 0.2–0.37 m 重叠（`tools/test_crowd.py`）。
8. 音频（新枪声、脚步）只在代码里检查过电平，**没人实际听过**；F11 全屏和指针锁定无法无头测试。
9. `assets/music/END_CREDITS.mp3` 是 Hans Zimmer 的商业配乐，用户已决定保留，不要删。

## 6. 接下来的顺序

1. 完成 #4/#14：基于 `wip-ai` 继续做，或者看过之后重做，按 `docs/v7/BACKLOG.md` 里的要求和接口约定来。做完合进 `v6-sandman`。
2. 完成 #17 剩余部分（中文正文里的名字）和第 5 节第 1、4 项。
3. 全流程回归：上面列出的所有测试脚本都要跑通，`window.__errors` 为空。
4. 美术评审循环（用户原话）：每改完一版，用浏览器打开，从几个固定机位各截一张图。再找一个**只看截图、不看代码**的评审，以挑剔的美术指导的角度，按严重程度列出画面问题。按意见改，直到只剩小问题。建议机位见 `docs/history/HANDOFF_v6_v7_log.md` 第五节第 6 条。
5. 向用户汇报，等用户同意后再把 `v6-sandman` 合入 `main`，然后构建发布。

## 7. 工程约定（摘要，详见 `docs/v6/COMMON.md`）

- 单位米，北 = −z，yaw 0 朝向 −z。
- 台词写在 `LINES` 里，格式是 `ID: ['说话人标签', '英文', '中文字幕', 是否无线电]`，用 `say(id, delay)` 播出。
- 代码风格紧凑；不加新的 npm 依赖；热循环里不要每帧分配对象；普通显卡上要流畅。
- 跨文件的新接口通过 `G.*` 钩子调用，并加 `?.` 保护（esbuild 遇到不存在的具名导入会直接报错）。
