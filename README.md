# 弃于寒冬 · OUT IN THE COLD

一部《使命召唤：现代战争 3》（2011）的非官方同人战役，在浏览器里运行。
用 three.js 实时生成全部模型、贴图、特效和音效，最后打包成一个单文件 `index.html`。

故事接在「Down the Rabbit Hole」之后：Delta Force「Metal」小队和总统卫队军官维克多·索科洛夫被困在坍塌的西伯利亚钻石矿里，一路打到把马卡洛夫的情报「ОАЗИС（绿洲）」发给 Price，最后交接到「Dust to Dust」。

## 章节

| 部分 | 名称 | 内容 | 检查点编号 |
|---|---|---|---|
| 第一部分 | 坍塌 | 矿井醒来、巷道战、拿到情报、溶洞、罐笼 | 10、11 |
| 第二部分 | 升井 | 罐笼上升、暴风雪矿区、RPG 打 BTR、冲向货场 | 20 |
| 第三部分 | 铁马 | 运矿列车追逐、DShK 对雌鹿、断桥跳车 | 0–3 |
| 第四部分 | 最后阵地 | 雷达站死守、上传情报、重装兵、针式导弹 | 4–6 |
| 尾声 | — | Metal 0-1 完毕、三个月后·迪拜、演职员表、彩蛋 | — |

## 构建

需要 Node.js 18 或更新版本。

```bash
npm install
npm run build        # 生成 dist/index.html，直接用浏览器打开即可
WITH_VO=1 npm run build   # 把 assets/vo 里的配音也打包进去（目前默认不带配音，只有字幕）
```

`build.mjs` 用 esbuild 把 `src/` 打成一个 IIFE，塞进 `template.html`，再把 `assets/music/*.mp3`（和可选的 `assets/vo/*.mp3`）以 base64 内嵌进去。

## 目录

```
src/
  main.js        启动、主循环、标题/暂停菜单
  director.js    第三部分（列车）的剧本、台词表、检查点分发
  cave.js        第一部分（矿井）和第二部分（地面 + BTR）
  part5.js       第四部分（雷达站）的剧本、敌人 AI（Raider）、载具冲锋、阔剑、针式导弹
  station.js     雷达站场景几何
  cine.js        尾声过场动画、演职员表、彩蛋
  world.js       天空、雾、地形分块、山脉、吹雪、光照
  train.js       列车与 DShK
  humans.js      士兵模型（分部件实例化）、IK、布娃娃
  ai.js          列车段敌人与队友 AI、射击判定
  weapon.js      第一人称武器（AK、手枪、PKM、СВД、Сайга、RPG-7、针式）
  player.js      玩家移动、视角、上机枪、近战
  vehicles.js    雪地摩托、雌鹿直升机、火箭弹、爆炸
  pickups.js     尸体掉落：弹药、手雷、换枪
  hud.js         HUD（指南针、弹药、字幕、提示、上传进度、锁定框）
  mats.js        程序化 PBR 材质
  post.js        后处理（AO、泛光、色调）
  audio.js       程序化音效、配乐分段播放、配音通道
template.html    页面骨架和全部 CSS
assets/music/    配乐分段（循环片段已做交叉淡化）
assets/vo/       英文配音（当前构建默认不使用）
docs/            给配音/配乐 AI 的需求清单
tools/           无头浏览器试玩脚本、配乐切片脚本
```

## 测试

`tools/` 里的脚本用 Playwright 驱动无头 Chrome，开无敌模式（`?god=1`）把各部分自动跑一遍并截图：

```bash
pip install playwright
python3 tools/playtest_mine_surface.py
python3 tools/playtest_last_stand.py
python3 tools/playtest_train.py
```

URL 参数：`?q=low|medium|high` 画质，`?god=1` 无敌。

## 致谢与版权

- three.js（MIT）
- 部分材质/光照思路参考 [wquguru/fable52-fps-repro](https://github.com/wquguru/fable52-fps-repro)（MIT），源码里有注明
- 战役配乐由 Gemini 生成；配音由 ElevenLabs 生成的原创声音
- `assets/music/END_CREDITS.mp3` 是 Hans Zimmer & Lorne Balfe 的《Opening Credits》（《使命召唤：现代战争 2》原声），属于商业版权音乐，**仓库公开前请删掉或替换**
- 本作为粉丝自制、非商业、非官方作品；《使命召唤》及相关角色版权归 Activision 所有
