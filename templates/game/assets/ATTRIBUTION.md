# ATTRIBUTION — p9 runtime asset pack (v2.2.1: high-resolution characters + tilesets + UI + audio)

本文件描述 p9 运行时素材，整体 **CC0 1.0 Universal**（公有领域奉献），可商用、可修改、无需署名。
以下记录用于审计与复现。v2.1 在 v2 基础上合入了 crypt / ember / town 三套程序化瓦片与 AI 内容包 #3；
v2.2 合入 AI 内容包 #4（高分辨率角色/敌人/Boss），替换运行时全部角色与敌人 spritesheet；
v2.2.1 合入 AI 内容包 #5（Boss / 大型怪 impact 行动作修正），只改 5 张 spritesheet 的指定行。
所有素材共用同一 28 色调色板。原 `incoming2/`、`incoming3/`、`incoming4/`、`incoming5/` 目录在校验通过后已删除，
条目与来源记录保留在 `manifest.json`（每个受影响条目新增 `source.incoming5` 说明）。

## 1. 角色 / 敌人 / Boss / 特效 / 图标（AI 生成，历史 32px 流程）

> v2.2 起下表中的角色/敌人/Boss 已整体替换为第 8 节的高分辨率版本（64–160px），
> 本节保留原始 v2 生成流程作为沿革记录；特效/图标未被 #4 替换。

- 工具：`gpt-image-2.5`（本机 magpie 网关），`--background transparent`。
- 流程（`assets/_gen/v2/`）：
  1. 文本提示词生成 6 帧 walk / 4 帧 idle 原始条带；
  2. **restyle 通道**：把条带 image-to-image 重绘为"低分辨率像素画"（硬边、平涂、无抗锯齿）→ 用作该角色的**标准参考**；
  3. 其余动作（attack1/attack2/cast/death、敌人 attack/death、Boss 各阶段）都以该参考图为条件生成，保证同一角色的配色与服装一致；
  4. PIL 按 alpha 空列切帧 → 统一缩放进帧 → 量化到 28 色共享调色板 → 去噪 → 拼 spritesheet。
- 未使用任何第三方图像作为输入；提示词原文见 `_gen/gen_anim.py`、`gen_extra.py`、`prompts.py`。
- 程序化派生（已在 `manifest.fragment.json` 的 notes 注明）：
  - 玩家 `idle`：由 walk 第 1 帧做 4 帧 1px 呼吸位移；
  - 玩家/敌人 `hurt`：由 walk 第 1 帧做 2 帧后仰位移；
  - 玩家 **左向行 = 右向行的水平镜像**（构建时生成，不是另一套绘制）。

| 文件 | 内容 |
| --- | --- |
| `sprites/player_knight.png`（运行时 `manifest.json` 唯一玩家入口） | 骑士：4 向 × (idle4/walk6/attack1 4/attack2 4/cast4/hurt2/death6) |
| `sprites/player_mage.png` | 法师：同上 |
| `sprites/enemies/{slime,brute,caster,charger,bomber,elite}.png` | 5 行：idle4 / move6 / attack4 / hurt2 / death6 |
| `sprites/enemies/boss.png` | 7 行（64px）：idle4 / smash4 / charge4 / projectile4 / phase4 / hurt2 / death6 |
| `sprites/effects/*.png` | 爆炸 6 帧、命中火花 4、剑气 4、升级 6、拾取 4 |
| `sprites/ui/icons_{stats,elements,skills}.png` | 属性 8 / 元素 6 / 技能 12（16px） |

> `bomber` 首次的提示词被上游安全策略拒绝，已改用"fire imp / ember body"描述重新生成。

## 2. UI 套件（程序化）

`incoming/_gen/ui_gen.py` 用 PIL 确定性绘制，全部取自同一 28 色调色板，32×32 九宫格边框 8px：
panel(normal/hover/pressed/disabled)、button(4 态)、tab(2 态)、背包格/装备槽/技能格、
tooltip、小地图框、HP/MP/XP/耐力条框 + 填充、CD 遮罩 4 档、光标、稀有度边框 5 档。

## 3. 音效（CC0 下载）与音乐（程序化）

音效来源：**The Essential Retro Video Game Sound Effects Collection [512 sounds]**，
作者 **Juhani Junkala (SubspaceAudio)**，许可 **CC0 1.0**，
<https://opengameart.org/content/512-sound-effects-8-bit-style>。原 WAV 已转单声道 Ogg Vorbis（q4）；
`boss_roar` / `boss_phase` 额外降调 0.55× 并变速。原始文件名逐条记录在 `manifest.fragment.json` 的 `source.originalFile`。

音乐：`audio/dungeon_loop.ogg`、`audio/boss_loop.ogg` 由 `incoming/_gen/music_gen.py`（numpy 方波/三角波/噪声合成）生成，
A 小调，循环长度为整数小节，CC0。

## 4. 未使用 / 已评估

- Kenney（CC0）：`kenney.nl` 对本机 curl 返回 403，未下载。
- OpenGameArt：仅取上述 CC0 包；CC-BY 素材未采用（避免附加署名义务）。
- 未下载任何许可不明或"仅限个人使用"的素材。

## 5. 既有 v1/v2 素材

- 早期 `tiles/*`、`sprites/items/*`、`sprites/projectiles/*`、`tileset_atlas` 为 v1 程序化/AI 生成，CC0-1.0；详见 `_gen/`。v2.1 的新增瓦片见第 6 节，新增图标/角色见第 7 节。
- `sprites/player.png`、旧 `sprites/ui/icons.png`、旧 `ui/panel*.png`/`ui/button.png`、`audio/button.ogg`、`audio/cast.ogg` 已被 v2 取代并删除。

## 6. 扩展瓦片包：crypt / ember / town（程序化，v2.1）

合入来源：`assets/incoming2/`（校验通过后源目录已删除）。整体 **CC0 1.0 Universal**。
所有瓦片与 UI 均由本项目脚本程序化绘制，**未使用任何第三方图像素材**，也不含 AI 生成内容
（AI 生图在 32px 瓦片上的降采样结果噪点过多，已评估后放弃）。

生成器（合并前位于 `incoming2/_gen/`）：`tilekit.py`、`crypt.py`、`ember.py`、`town.py`、`ui_gen.py`
（PIL + numpy，固定随机种子）。调色板与已发布素材包相同的 28 色。

| 套件 | 瓦片数 | 地板 | 墙 | 门/楼梯/障碍 | 装饰 |
| --- | --- | --- | --- | --- | --- |
| `crypt` | 20 | 6 | 3 | 4 | 7 |
| `ember` | 19 | 5 | 3 | 4 | 7 |
| `town` | 20 | 5 | 3 | 3 | 9 |

- 共 59 个 32px 单瓦片 + 3 张 8×3 tileset atlas（`tiles/{crypt,ember,town}/tileset.png`，行优先，未用尾格保持透明）。
  每个单元格对应的资产名见 `manifest.json` 中该 tileset 条目的 `columnOrder` 及单瓦片的 `atlas` 字段。
- 动画瓦片（2 帧纵向堆叠，32×64，fps 6）：`crypt_brazier`、`ember_brazier`、`ember_lava`、
  `ember_lava_pool`、`ember_magma_crack`、`town_campfire`、`town_lamp`、`town_portal`。
- 无缝性：地板/墙按环面（wrapping）规则绘制，`seamless: true` 的单瓦片通过无缝校验；
  `ember_gate_open` 与 `town_gate` 表现开启/门洞状态，显式标记 `seamless: false`，不参与无缝检查。
- UI：`ui/minimap_frame_v2.png` 32×32 九宫格（边框 8；原名 `minimap_frame`，因与运行时已有
  `ui/minimap_frame.png` 文件冲突而改名并改用 id `ui_minimap_frame_v2`）；
  `ui/portrait_frame{,_elite,_boss}.png` 48×48 九宫格（边框 8）；
  `ui/map_icons.png` 16×16×10（player / boss / shop / quest / chest / stairs / portal / camp / elite / waypoint）。

## 7. AI 内容包 #3：职业/技能 + 装备 + 城镇 NPC + 第二 Boss（v2.1）

合入来源：`assets/incoming3/`（校验通过后源目录已删除）。整体 **CC0 1.0 Universal**。

- 模型：`gpt-image-2.5`（本机 magpie 网关，`--background transparent`）。
- 三阶段流水线（合并前位于 `incoming3/_gen/gen.py`、`gen_icons.py`）：
  1. 文本提示词 → 角色/敌人/职业条带原图；
  2. **restyle**：image-to-image 重绘为低分辨率像素画（硬边、平涂、无抗锯齿），作为该角色的标准参考；
  3. 其余动作以参考图为条件生成，保证服装配色一致。
- 后处理（`incoming3/_gen/build_all.py`）：alpha 空列切帧 → 按帧缩放 → 28 色共享调色板量化 →
  杂点清理 → 拼 spritesheet。图标/道具直接按 32×32、24×24、16×16 量化，无降采样拉伸。
- 未使用任何第三方图像作为输入；NPC 的 image-to-image 参考图来自本仓库自有的
  `sprites/player_knight.png`。

| 类别 | 数量 | 规格 |
| --- | --- | --- |
| 技能图标 | 10 | 32×32：骑士 cleave / hurl axe / lunge / shield bash / bulwark；法师 ember fan / ember bolt / blink / frost nova / arc surge |
| 装备基底图标 | 12 | 24×24：sword / axe / staff / wand / shield / orb / helmet / chest / gloves / boots / amulet / ring |
| 城镇 NPC | 5 | 32×32 × 5 帧（idle 4 + gesture 1）：blacksmith / merchant / quest giver / healer / stash keeper |
| 敌人 | 6 | 32×32，6×5 行：skeleton warrior / skeleton archer / cultist / gargoyle / ghost / spider |
| 第二 Boss | 1 | 64×64，6×7 行：idle / summon / cast / teleport / phase / hurt / death（lich） |
| 场景道具 | 11 | 32×32：statue / fountain / banner / bridge / crystal / lava fall / gravestone / altar / stall / portal ×2 |
| UI 图标 | 15 | 16×16：状态 6（burn/chill/stun/shielded/rage/mana）、技能树节点 3、地图标记 6 |

- 程序化派生：敌人 `idle`（4 帧）= move 第 1 帧 + 1px 呼吸位移；`hurt`（2 帧）= move 第 1 帧后仰；
  Boss 的 `hurt` 同理；NPC 只有单一朝向（面向镜头），手势帧为 AI 依据参考图生成。
- 图标与装备另提供行优先 atlas：`sprites/items/skills.png`（5×2）、`sprites/items/equipment.png`（6×2）。

## 9. 许可结论

- 新增瓦片/UI：程序化生成，CC0-1.0（`licenses.tiles`）。
- 新增 AI 图标/角色/敌人/Boss/NPC/道具：CC0-1.0（沿用 `licenses.aiArt`）。
- 未下载任何外部素材；不含 CC-BY 或“仅限个人使用”内容。

## 8. AI 内容包 #4：高分辨率角色 / 敌人 / Boss（v2.2）

合入来源：`assets/incoming4/`（校验通过后源目录已删除）。整体 **CC0 1.0 Universal**。
本批次只替换运行时角色类 spritesheet，共 22 张 PNG（含新增 `sprites/enemies/ogre.png`）；
瓦片、UI、特效、图标与音频均未改动，世界仍为 32×32 网格。

- 模型：`gpt-image-2.5`（本机 magpie 网关，`--background transparent`）。
- 三阶段流水线（合并前位于 `incoming4/_gen/`）：
  1. 文本提示词生成 walk/idle 条带；
  2. **restyle**：image-to-image 重绘为低分辨率像素画，作为该角色的标准参考；
  3. 攻击/施法/死亡/Boss 各阶段以参考图为条件生成，保证服装与配色一致。
- 后处理（`incoming4/_gen/build_all.py`）：alpha 空列切帧 → 直接缩放到目标帧
  （64/96/128/160）→ 28 色共享调色板量化 → 1px 孤点清理 → 按新帧尺寸拼 spritesheet。
- 未使用任何第三方图像作为输入；提示词由本仓库编写。

| 类别 | 数量 | 帧尺寸 | 布局 |
| --- | --- | --- | --- |
| 玩家 knight / mage | 2 | 64×64 | 30×4：4 向 × (idle4/walk6/attack1 4/attack2 4/cast4/hurt2/death6) |
| 城镇 NPC | 5 | 64×64 | 5×1：idle 0-3 + gesture 4 |
| 普通敌人 | 10 | 64×64 | 6×5 行：idle/move/attack/hurt/death |
| 大型敌人 gargoyle / elite / ogre | 3 | 96×96 | 同上 6×5 行（ogre 为本批次新增 id `enemy_ogre`） |
| Boss（infernal warlord） | 1 | 128×128 | 6×7 行：idle/smash/cast/charge/phase/hurt/death |
| Boss2（lich） | 1 | 160×160 | 6×7 行，行名相同；沿用运行时 id `boss_lich`，第 1 行 smash 为召唤动作 |

- 程序化派生：玩家 `idle` = walk 第 1 帧 4 帧呼吸位移（2px）；`hurt` = 2 帧后仰；
  玩家左向行 = 右向行水平镜像。敌人 `idle`/`hurt` 同样由 move 第 1 帧派生。
- 锚点统一为 bottom-center（脚底距帧底约 3px）；碰撞半径沿用原有数值，仅放大视觉帧。
- `preview.png` 已重新生成，展示代表性角色的旧/新帧尺寸对比（深色背景，PIL 绘制）。
- 运行时校验 `python3 assets/tools/validate_assets.py`：0 errors（8 条既有半透明警告与 #4 无关）。

## 10. AI 内容包 #5：Boss / 大型怪 impact 行动作修正（v2.2.1）

合入来源：`assets/incoming5/`（校验通过后源目录已删除）。整体 **CC0 1.0 Universal**。
本批次只把 5 张已发布 spritesheet 的指定行动作行替换为"身体可读"版本，共 5 个 PNG / 8 行；
帧尺寸、列数、行序与 bottom-center 锚点全部沿用 v2.2，**其余行与已发布 sheet 逐像素相同**。
运行时受影响 id：`enemy_boss`、`boss_lich`、`enemy_elite`、`enemy_gargoyle`、`enemy_ogre`。

- 模型：`gpt-image-2.5`（本机 magpie 网关，透明背景）。提示词由本仓库编写，无外部素材输入。
- 参考图：从已发布 sheet 裁出 idle 第 1 帧，四周补 18% 透明留白（给举起的武器留头 room），
  放大 3-4 倍最近邻后作为 image-to-image 输入。
- 提示词硬约束：`body silhouette fully visible in every frame, no fire aura, no full screen explosion,
  no smoke covering the body, clear readable weapon swing`，并逐帧描述动作关键姿势。
- 后处理（合并前位于 `incoming5/_gen/`）：alpha 空列切帧 → 以 idle 行人体高度为基准缩放（与静止帧同尺寸）
  → 28 色量化 → 1px 孤点清理 → 回填原 sheet 的对应行，其它行原样保留。

| 文件 | 行 | 行名 | 原问题 | 修正 |
| --- | --- | --- | --- | --- |
| `sprites/enemies/boss.png` (128) | 1 | smash | 3-6 帧被火焰吞没，身体不可读 | 6 帧全部保留身体与巨剑轨迹：举起→过头→下劈→触地→惯性→收势 |
| 同上 | 2 | cast | 火焰球盖住角色 | 手部聚能→抬手→前推→小火花离手→后坐→回位 |
| 同上 | 3 | charge | 冲锋被火墙遮挡 | 下蹲→前倾→迈步→肩撞→回弹→收势 |
| `sprites/enemies/boss_lich.png` (160) | 1 | smash / summon | 绿烟遮住本体 | 举杖→顿地→展臂→仰头咏唱→落杖→回位，烟雾只留脚边细丝 |
| 同上 | 2 | cast | 同上 | 聚能→抬手→前推→绿弹离手→后坐→回位 |
| `sprites/enemies/gargoyle.png` (96) | 2 | attack | 爪击轮廓不清 | 起身展翼→俯冲→爪击接触→收势 |
| `sprites/enemies/elite.png` (96) | 2 | attack | 巨剑动作不可读 | 举剑→最高点→砸下→回防 |
| `sprites/enemies/ogre.png` (96) | 2 | attack | 棍棒动作不可读 | 举棒→过头→砸地→收棒 |

- 动画语义变更（`manifest.json`）：`enemy_boss` 的 smash / cast / charge 改用 `columns [0,5]`、`frames 6`；
  `boss_lich` 第 1 行同样 6 帧，并新增别名动画 `summon`（row 1, `[0,5]`, 6 帧, fps 10）——原 `smash`
  名称保留以兼容共享行；第 2 行 cast 同样 6 帧。大型敌人 attack 行仍为 `columns [0,3]`、`frames 4`。
- **vfxLayering 规则**：火焰 / 爆炸 / 烟雾不再烘焙进角色帧。特效由项目 fx 层在武器尖端或触地点生成
  `fx_explosion` / `fx_slash` / `fx_levelup` 条带（加法混合 + 着色），时间点对齐 impact 帧：
  boss smash/cast/charge 与 lich summon/cast 为第 3 帧，gargoyle/elite/ogre attack 为第 2 帧
  （运行时映射见 `src/content/impacts.ts`）。
- 校验：`assets/incoming5/tools/validate_incoming5.py`（行身份：被替换行必须变化、未替换行必须与已发布
  sheet 逐像素相同）0 errors；`python3 assets/tools/validate_assets.py` 0 errors。
- `preview.png` 已追加 `incoming5` 的 before/after 对照 contact sheet（BEFORE = v2.2 已发布行，
  AFTER = 新行），保留 v2.2 的尺寸升级图。
