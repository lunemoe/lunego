# p9 职业 / 技能 / 被动数据（第一版）

产物：`p9-classes.json`（由 `tools/build_classes.py` + `tools/p9_classes_spec.py` 生成）。
内容全部自创：名称、数值、节点布局均为 p9 设计；只有“5 个主动技能对应现有 3 个技能
（近战锥形 / 远程单体 / 位移）+ 2 个新技能”的结构沿用 p9 现状。

## 1. 规模

| 项 | 值 |
| --- | --- |
| 职业 | 2（knight / mage，对应已有 `player_knight`、`player_mage` 两张角色表） |
| 主动技能 | 10（每职业 5：3 个现有技能等价 + 2 个新技能） |
| 技能等级 | 1–10（与 `MAX_SKILL_LEVEL = 10` 一致） |
| 被动节点 | 72（每职业 36；6 层，连线式 requires） |
| 资源 | mana（通用）+ rage（knight 副资源，设计值） |
| 等级曲线 | 1–20，公式 `xpToNext = 8 + 6·level`（与 p9 现有 `nextXpFor` 完全一致） |

重新生成 / CI：

```bash
python3 research/poe/tools/build_classes.py
python3 research/poe/tools/build_classes.py --check   # 重算并逐字段比对
```

`--check` 还会校验 stat key 是否存在于 `p9-itemization.json`，防止被动引用
不存在的属性。

## 2. 两职业的差异

| | knight / 骑士 | mage / 法师 |
| --- | --- | --- |
| 定位 | 近战锥形、盾牌、控制 | 远程单体、元素 AoE |
| 基础生命 | 120 | 90 |
| 基础法力 | 70 | 120 |
| 防御底子 | armorFlat 12 | energyShieldFlat 15 |
| 资源 | mana + rage（受击/命中积攒） | mana |
| 主要伤害来源 | 物理 + 攻速 + 暴击 | 法术 + 元素 + 持续伤害 |
| 清怪方式 | 劈砍扇形、突进切入 | 余烬扇/霜爆清群、电弧连锁 |
| 生存方式 | 护甲、格挡、减伤、自回 | 护盾、法力回复、减速控场 |
| 操作节奏 | 短 CD 连招 + 5 秒防御技 | 中 CD 法术 + 2 秒位移 |

**为什么这样分**：knight 的成长轴是 “攻速/暴击/护甲”，mage 的成长轴是
“法术伤害/法力/元素”。两者共享 `healthBonus`、`damagePct`、抗性等装备词缀，
但被动树只强化各自轴，避免两个职业最后变成同一套数值。

## 3. 技能清单

`cd` 为 tick（60 tick = 1 秒），沿用 kit-ability 的 `cooldownTicks`。
伤害为技能面板基础值，最终伤害仍走 p9 的
`(基础 + 等级成长) × (1 + gear.damagePct) × 暴击`。

### Knight

| 技能 | 定位 | 消耗 | CD | Target | L1 → L5 → L10 | 机制 |
| --- | --- | --- | --- | --- | --- | --- |
| `knight.cleave` / 劈砍 | 近战扇形（= sweep） | mana 10 | 64 (1.07s) | direction 116, minDot 0.1 | 26 → 58 → 98 | 锥形命中多个目标 |
| `knight.hurl_axe` / 掷斧 | 远程单体（= bolt） | mana 8 | 45 (0.75s) | nearest 340 | 22 → 48 → 84 | 单目标，可被被动弹射 |
| `knight.lunge` / 突进 | 位移（= dash） | mana 12 | 130 (2.17s) | direction 220 | 14 → 28 → 48 | 路径伤害 + 位移 |
| `knight.shield_bash` / 盾击 | 新：点目标控制 | mana 14 | 96 (1.6s) | point 110 | 30 → 68 → 120 | 眩晕 35% → 60% |
| `knight.bulwark` / 壁垒 | 新：自我防御 | rage 30 | 300 (5s) | none | 0（减伤 18% → 40%） | 持续 90 tick 的减伤 |

### Mage

| 技能 | 定位 | 消耗 | CD | Target | L1 → L5 → L10 | 机制 |
| --- | --- | --- | --- | --- | --- | --- |
| `mage.ember_fan` / 余烬扇 | 法术扇形（= sweep） | mana 9 | 56 (0.93s) | direction 130, minDot 0.2 | 24 → 60 → 112 | 附加燃烧 3 → 12 /tick |
| `mage.ember_bolt` / 余烬弹 | 远程单体（= bolt） | mana 8 | 45 (0.75s) | nearest 420 | 20 → 50 → 92 | 单目标火焰弹 |
| `mage.blink` / 闪烁 | 位移（= dash） | mana 12 | 120 (2s) | direction 220 | 0 | 无伤害位移，可穿怪 |
| `mage.frost_nova` / 霜爆 | 新：点目标 AoE | mana 14 | 100 (1.67s) | point 160 | 28 → 66 → 120 | 减速 20% → 45% |
| `mage.arc_surge` / 电弧涌动 | 新：连锁 | mana 16 | 110 (1.83s) | nearest 300 | 32 → 74 → 132 | 连锁 1 → 3 个目标 |

数值成长形状：伤害随等级近似线性增长，10 级为 1 级的 3.4–4.7 倍
（前期每级涨幅大、后期收窄）。
与 p9 现有技能对比：现有 `sweepDamage` 为 `20 + 8·level`（1 级 28、10 级 100），
`boltDamage` 为 `16 + 6·level`（22 → 76）；本表把它们泛化为固定等级的数组，
量级保持一致（cleave 26→98、hurl_axe 22→84）。

## 4. 资源与等级曲线

### 资源

| 资源 | 上限 | 回复/获取 | 用途 |
| --- | --- | --- | --- |
| mana | 职业基础（70 / 120） | 2.0 / 秒 | 所有主动技能（除 bulwark） |
| rage | 100 | 命中 +6，每秒衰减 4 | knight 的 `bulwark`（30） |

设计意图：knight 不能只靠“有蓝就放”，需要在命中中积攒 rage 来开防御；
mage 则受法力上限约束，逼迫在“爆发”和“续航”之间取舍。
p9 当前只记录 `mana`，接入 v1 时可把 rage 消耗临时映射为 mana，或先禁用 bulwark。

### 等级 / 技能点

| 等级 | 升到下一级所需 XP | 累计 XP | 技能点 | ≈ 普通怪击杀数 |
| --- | --- | --- | --- | --- |
| 1 | 14 | 0 | 0 | 0 |
| 5 | 38 | 92 | 5 | 18 |
| 10 | 68 | 342 | 11 | 68 |
| 15 | 98 | 742 | 17 | 148 |
| 20 | 128 | 1292 | 23 | 258 |

- 公式与 p9 `nextXpFor(level) = 8 + level * 6` 一致；累计到 20 级 1292 XP
  （普通怪 5 XP → 258 只，按当前 10 分钟 60 只的节奏约 43 分钟，精英/Boss 会更快）。
- 技能点 = 每级 1 点 + 5/10/15/20 级各 1 点里程碑 → 20 级共 **23 点**。
- 每职业 36 个节点，23 点只能点约 **64%**，必须做取舍；这是有意为之，避免“全点满”。

## 5. 被动树结构

- 6 层（tier 1–6），每层节点数：骑士 `2 / 4 / 7 / 8 / 8 / 7`，法师同为 `2 / 4 / 7 / 8 / 8 / 7`。
- `requires` 是显式连线；tier 必须大于父节点 tier，树无环（脚本校验）。
- 效果两种：
  - `{"kind":"stat","stat":"healthBonus","mode":"add","value":15}` → 直接进 `StatBlock`
  - `{"kind":"flag","flag":"cleave.extra_target","value":1}` → 游戏侧读取的计数器
    （技能强化：额外目标、范围、眩晕、燃烧、连锁等）
- flag 的 scope 必须是本职业某个技能 key，或 `rage`/`mana`；脚本会拒绝拼写错误。

骑士分支：体魄（生命/回复）、甲胄（护甲/格挡/减伤）、锋刃（物理/伤害/暴击）、
节奏（攻速/移速）、战技（cleave/lunge/bulwark/shield_bash/hurl_axe 的 flag）。
法师分支：法力（上限/回复）、护盾（ES/减伤）、余烬（燃烧/范围/火抗）、
霜寒（减速/冰抗）、风暴（连锁/雷抗/法术伤害）。

示例（骑士，10 级 11 点）：
`iron_body → thick_hide → second_wind → tireless`（4 点生存）+
`plated_stance → bulwark_training → unyielding`（3 点减伤）+
`weapon_drill → sharpened_edge → measured_swing → quick_hands`（4 点输出）。

## 6. 与装备词缀的配合

职业被动与 `p9-itemization.json` 共用同一套 stat key，所以装备与天赋可以叠加：

| stat | 装备来源 | 被动示例 |
| --- | --- | --- |
| `healthBonus` | 防具/戒指/项链前缀 | 铁躯、厚皮、巨像 |
| `damagePct` | 武器/手套/项链前缀 | 兵器操练、重击、战争领主 |
| `attackSpeedPct` | 武器/手套前缀 | 沉稳挥击、快手、迅击 |
| `critPct` / `critMultiplierPct` | 武器/手套/项链 | 处刑者、反击、反刃 |
| `armorPct` / `blockChance` / `damageReductionPct` | 胸甲/副手 | 覆甲架势、盾牌精通、不屈 |
| `spellDamagePct` / `manaFlat` / `manaRegenPct` | 项链/戒指/副手 | 奥术火花、灵泉、法力流动 |
| `fire/cold/lightningResistance` | 全槽位后缀 | 余烬/霜寒/风暴亲和 |

注意：
- 被动只加**通用** `damagePct`/`spellDamagePct`，没有“某技能 +X%”的独立 stat；
  技能强化走 flag，避免 stat 数量爆炸。
- 装备的 `damagePct` 对两个职业都生效（mage 的 `ember_bolt` 也吃），
  但 `spellDamagePct` 只对 mage 有意义——UI 需要在技能面板标注“法术”标签。

## 7. 映射到 kit-ability / kit-stats（已实际验证）

- `kitView.abilities` 的每一项都是 `AbilityDefinition` 形状：
  `{ id, cooldownTicks, costs, target }`，可直接 `defineAbility()`。
- `checkCast` 的 `resources` 传 `{ mana, rage }`；rage 上限/衰减由游戏维护，
  kit 只做“够不够”的只读判断。
- `target` 使用 `none | point | direction | nearest`，`range`/`minDot` 语义与
  kit-ability 一致：direction 用 `minDot` 做锥形，nearest 取最近目标。
- 被动 stat 效果可直接 `StatBlock.add`；flag 效果不进 kit。

验证命令（已跑通）：

```bash
node --input-type=module -e "
import { defineAbility, readyAt, checkCast, resolveTargeting } from './kits/kit-ability/dist/index.js';
import { StatBlock } from './kits/kit-stats/dist/index.js';
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('research/poe/p9-classes.json','utf8'));
const a = d.kitView.abilities.map(defineAbility);
const cleave = a.find(x => x.id === 'knight.cleave');
console.log(a.length, checkCast(cleave, readyAt(cleave, 0), 64, { mana: 50 }));
"
```

实际输出（摘要）：

```
defineAbility OK for 10 abilities
cleave check@0 -> { ok: false, reason: 'cooldown' }   // 冷却未到
cleave check@64 + mana 50 -> { ok: true }
cleave check@64 + mana 5  -> { ok: false, reason: 'resource' }
cleave targeting -> direction，只命中锥形内目标
knight 基础生命 120 + iron_body(+15) -> healthBonus 135
```

### 接入伪代码

```ts
const ability = defineAbility(def.abilities[i])          // JSON → kit
const state = readyAt(ability, ctx.tick)
if (!checkCast(ability, state, ctx.tick, { mana, rage }).ok) reject()

const targeting = resolveTargeting(ability.target, {
  origin: { x, y }, facing: aim, candidates: hostiles,
})

// 等级成长：技能自身表
const row = skill.levels[skillLevel - 1]
const damage = Math.round(row.damage * (1 + gear.damagePct))

// 被动：stat 直接入 StatBlock，flag 由技能逻辑读取
block.addAffix({ affix: node.id, modifiers: node.effects.filter(e => e.kind === 'stat') })
const totals = block.snapshot()
if (flags.has('cleave.extra_target')) extraTargets += 1
```

## 8. UI 建议

- **技能栏**：5 格（Q/W/E/R/T 或 1–5）。p9 现有 `CastSkill.slot` 只接受 1–3，
  接入时扩到 5；`slot` 与技能数组顺序一一对应，存档只存 `classId + skillIds[5]`。
- **技能面板**：
  - 顶部：职业名、生命/法力条、rage 条（仅 knight）。
  - 左列：5 个技能 + 等级 + 消耗 + CD；点击显示 1–10 级伤害表与当前 tier。
  - 右列：6 层被动树，节点为 32–40px 圆形/方形，连线用 `requires` 绘制；
    已点节点高亮，可点节点描边，未满足前置的节点降透明度。
  - 底部：`技能点 11 / 23`、重置按钮（建议免费重置，降低试错成本）。
- **命名**：技能与节点用“英文名 + 中文名”双行显示；颜色按 tag（物理=铁灰、
  火=橙、冰=青、雷=紫、防御=金）。
- **冷却反馈**：CD 用 0–1 的扇形遮罩，按 `remainingCooldown(state, tick) / cooldownTicks`
  计算；rage 不足时技能图标加红色角标，而不是弹 toast。

## 9. 前 10 分钟的取舍

- 玩家 10 分钟约到 5–7 级（18–35 只普通怪），只有 **5–7 点**。
- 骑士：先 `iron_body`（+15 HP）→ `weapon_drill`（+5% 伤害）→ `plated_stance`
  （+8% 护甲）→ `sharpened_edge`（+7% 物理）→ `thick_hide`（+20 HP）。
  前 10 分钟不要点 `bulwark` 相关节点（rage 未成型，收益低）。
- 法师：先 `arcane_spark`（+6% 法术）→ `mana_spring`（+12 法力）→
  `ember_affinity`（+8% 火抗）→ `kindling`（燃烧 +2）→ `mana_flow`（+10% 回蓝）。
  `frost_nova` 在 3 级解锁后再点 `chill_touch`。
- 技能解锁建议：新角色自带 3 个基础技能（cleave/ember 系、远程、位移），
  `shield_bash` / `frost_nova` 在 3 级解锁，`bulwark` / `arc_surge` 在 6 级解锁；
  本数据未写 unlock 字段，接入时可按 `levels[0]` 之外再加 `unlockLevel`。

## 10. 与现有 p9 的差异 / 剩余

- p9 只有 3 个技能槽、`PlayerSkills` 固定 3 个字段；本数据是 5 技能/职业，
  接入需要扩展 schema 与 `CastSkill.slot` 范围（代码改动不在本次范围）。
- p9 没有 rage；需要新增资源字段与衰减系统，或先把 bulwark 的消耗改成 mana。
- p9 没有技能等级成长表（当前 `sweepDamage` 是公式）；接入时把 `levels[]`
  存进内容表，按 `skillLevel` 索引。
- 被动树需要一个新的“技能面板”界面与存档字段（已点节点集合）；当前 p9 只有
  `skillPoints`，没有分配记录。
- 本版没有 ultimate/召唤/图腾技能，也没有职业专属装备限制；留给下一版。
