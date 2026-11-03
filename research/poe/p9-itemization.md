# p9 第一版物品 / 词缀 / 掉落数据

产物：`p9-itemization.json`（由 `tools/build_itemization.py` + `tools/p9_spec.py` 生成）。
所有 id、名称、数值均为 p9 自定；只有**tier 阶梯形状**（5 级、几何增长、顶级稀有）
参考了 `research/poe/DESIGN-NOTES.md` 的拟合结论，未复制任何 PoE 名称、文本或原样数值。

## 1. 规模

| 项 | 数量 |
| --- | --- |
| 装备槽 | 9（ring1/ring2 共用 `ring` 池，共 8 个词缀池） |
| 基底 | 12（覆盖全部 8 个池） |
| stat | 30（含 p9 现有 `damagePct` / `attackSpeedPct` / `critPct` / `healthBonus`） |
| 词缀族 | 112（8 池 × 7 前缀 + 7 后缀） |
| 词缀 tier | 560（每族 5 级） |
| roll 定义 | 575（`edged` 族一次滚 min+max 两条） |
| 稀有度 | 4（common / magic / rare / legendary） |
| 掉落表 | 15（5 个 ilvl 段 × normal / elite / boss） |

每个池严格 7 前缀 + 7 后缀；tier ilvl 门槛 `1 / 10 / 20 / 32 / 45`，
tier 权重 `1000 / 620 / 380 / 220 / 110`，因此单族内顶级 tier 概率 **4.7%**。

重新生成 / CI 校验：

```bash
python3 research/poe/tools/build_itemization.py           # 写 JSON
python3 research/poe/tools/build_itemization.py --check   # 校验且检测是否过期
```

`--check` 会重新构建并与磁盘文件逐字段比较：任一数值、权重、名称或结构变化都会失败，
适合作为内容锁。输出确定性，重复运行字节一致。

## 2. stat 口径（与 kit-stats 对齐）

- 百分比 stat 用**小数**（`0.05` = 5%），因为 p9 现有公式是 `1 + pct`
  （`features/player/logic/skill-rules.ts`），kit-stats 只做数值聚合，不解释单位。
- 全部词缀 roll 使用 `mode: "add"`；`aggregateStats` 对同 stat 的 add 求和，正好等于
  PoE 的 “increased 相加”。需要独立相乘的效果用 `mode: "mul"`，本版数据未使用。
- kit-stats **不做跨 stat 推导**：`armorFlat` 与 `armorPct` 是两个独立 stat，
  最终护甲由 p9 自己的公式合成：
  `effectiveArmour = round(armorFlat * (1 + armorPct))`。
  这与现有 `sweepDamage()` 用 `(1 + damagePct)` 的方式一致。
- `healthBonus` 是平加生命，沿用现有 p9 语义（当前玩家基础 HP = 100）。
- 每个 stat 都带 `min`/`max` 钳制（如抗性 0.75、移速 0.4、减伤 0.6），
  `aggregateStats` 会在聚合后 clamp。

## 3. 槽位与词缀池

| 槽位 | 池 | 主题 |
| --- | --- | --- |
| weapon | weapon | 平伤、物理/法术/暴击/攻速 |
| offhand | offhand | 护甲、护盾、格挡、减伤 |
| helmet | helmet | 生命、护甲/闪避/护盾、回复 |
| armor | armor | 生命、护甲、闪避、减伤 |
| gloves | gloves | 生命、平伤、暴击、攻速 |
| boots | boots | 生命、防御、移速 |
| amulet | amulet | 生命、伤害、法术、暴击、法力 |
| ring1 / ring2 | ring | 生命、平伤、伤害、法力、抗性 |

命名示例（自创，非 PoE 词缀名）：`Hale/强健`（生命前缀）、`Emberbound/余烬之御`
（火抗后缀）、`Honed/磨砺`（武器平伤前缀）、`Avaricious/贪婪`（金币后缀）。
中英文同时给出，UI 可任选。

完整族清单见 JSON 的 `affixFamilies`；每个族包含 `kind / pool / stats / weight /
exclusiveGroup / tiers[]`，tier 内是 kit-loot 形状的 `rolls`。

## 4. 稀有度与词缀数量

| 稀有度 | 基础权重 | 前缀 | 后缀 | kit `minAffixes..maxAffixes` |
| --- | --- | --- | --- | --- |
| common | 1000 | 0–0 | 0–0 | 0..0 |
| magic | 190 | 1–1 | 0–1 | 1..2 |
| rare | 24 | 2–3 | 2–3 | 4..6 |
| legendary | 1.2 | 3–3 | 3–3 | 6..6 |

基础权重只用于 `kitLoot.rarities` 示例；实际抽取按 `dropTables[].rarityWeights`
覆盖（同一稀有度在 normal / elite / boss 下权重不同）。

## 5. 掉落表与 p9 节奏

`dropTables[]` 每条包含 `enemyTier`、`ilvlBand`、`ilvl`、`rarityWeights`、`slotWeights`。

- ilvl 段：`1-9 / 10-19 / 20-29 / 30-39 / 40-60`，对应建议地图：
  - `crypt` → 1-19（前两张图的教学段）
  - `sanctum` → 20-39
  - 后续内容 → 40+
- 敌人 tier 沿用现有 `normal / elite / boss` 三档；`elite` 提高 magic/rare，
  `boss` 取消 common 并保证至少 magic，rare 权重 350。
- 稀有度权重（自定）：
  - normal：1000 / 160 / 10 / 0.2
  - elite：650 / 380 / 70 / 2.5
  - boss：0 / 420 / 350 / 18
- 槽位权重（百分比，合计 100）：weapon 16、armor 16、offhand 12、helmet 12、
  gloves 12、boots 12、amulet 8、ring 12（ring1/ring2 各 50%）。
- 基底选择：在池内按 `weight` 抽，且要求 `base.dropLevel <= ilvl`；
  本版 12 个基底权重都为 100。

**10 分钟预期**（`firstTenMinutes`，按现有 p9 掉率：normal 0.3、elite 0.6、boss 1.0；
假设 60 普通 / 4 精英 / 1 Boss）：

| 项 | 值 |
| --- | --- |
| 装备掉落 | 21.4 件 |
| common | 16.8 |
| magic | 3.82 |
| rare | 0.75 |
| legendary | 0.03 |

即：前 10 分钟能看到约 4 件带词缀的装备、0–1 件稀有，传奇基本见不到（符合“第一版
先让玩家理解词缀”，而不是开局爆装）。若希望首小时出现 1 件传奇，可把 normal 的
legendary 权重提到 0.6 左右，或给 Boss 加保底。

## 6. 映射到 kit-loot / kit-stats

### 6.1 抽取（伪代码，使用 kit 的公共 API）

```ts
import { weightedPick, rollLoot, type LootTable } from '@lunego/kit-loot'
import { StatBlock, type StatDefinition } from '@lunego/kit-stats'

// 1) 稀有度：dropTables 的权重就是 kit-loot 的 RarityDefinition.weight
const rarity = weightedPick(rng, table.rarityWeights.map(([id, weight]) => ({
  value: rarityById[id], weight,
})))

// 2) 前缀/后缀分开抽数量（kit 的 RarityDefinition 只有总数，拆分来自本数据）
const prefixCount = rng.int(rarity.prefixMin, rarity.prefixMax)
const suffixCount = rng.int(rarity.suffixMin, rarity.suffixMax)

// 3) 每一条：先选族，再选 tier，再让 kit-loot 滚数值
function rollOne(kind: 'prefix' | 'suffix', ilvl: number, used: Set<string>) {
  const families = allFamilies.filter(f =>
    f.kind === kind &&
    f.pool === slot.pool &&
    !used.has(f.exclusiveGroup) &&
    f.tiers.some(t => t.ilvl <= ilvl))
  const family = weightedPick(rng, families.map(f => ({ value: f, weight: f.weight })))
  const tiers = family.tiers.filter(t => t.ilvl <= ilvl)
  const tier = weightedPick(rng, tiers.map(t => ({ value: t, weight: t.weight })))
  used.add(family.exclusiveGroup)

  // 单条 affix 的 LootTable：稀有度固定、数量固定为 1
  const single: LootTable = {
    rarities: [{ id: 'fixed', weight: 1, minAffixes: 1, maxAffixes: 1 }],
    affixes: [{ id: `${family.id}@${tier.tier}`, weight: 1, rolls: tier.rolls }],
  }
  return rollLoot(rng, single).affixes[0]   // RolledAffix = AffixInstance
}
```

要点：

- **族内互斥**由 `exclusiveGroup` + 本地 `used` 集合保证；kit-loot 只保证同一条
  `AffixDefinition` 不被重复抽中，不保证同族 tier 互斥，所以需要这一步。
- `rollLoot` 的 draw 顺序固定（稀有度 → 数量 → 选 affix → 数值），传入固定稀有度
  不会破坏可复现性。
- `RolledAffix` 的字段与 kit-stats 的 `AffixInstance` 完全一致，可直接
  `block.addAffix(rolled)`。
- 若不想逐条调用，可把 `tier.rolls` 物化成 `AffixDefinition`（`kitLoot.exampleAffixes`
  就是示例），在一个 `LootTable` 里一次 `rollLoot`；但必须自行处理同族重复。

### 6.2 聚合（真的跑过 kit-stats）

示例：ilvl 50 稀有胸甲，基底 `bastion_plate`（`armorFlat 95`、`damageReductionPct 0.03`），
3 前缀 + 3 后缀全部落在 tier 5 范围内：

| 词缀 | roll | 词缀 | roll |
| --- | --- | --- | --- |
| armor（护甲） | `armorFlat +112` | fire_res（火抗） | `fireResistance +0.34` |
| armor_pct（护甲强化） | `armorPct +0.34` | cold_res（冰抗） | `coldResistance +0.34` |
| health（生命） | `healthBonus +45` | str（力量） | `strength +26` |

用 `aggregateStats`（bases 传基底值）得到：

```json
{
  "armorFlat": 207,
  "armorPct": 0.34,
  "healthBonus": 45,
  "damageReductionPct": 0.15,
  "fireResistance": 0.34,
  "coldResistance": 0.34,
  "strength": 26
}
```

p9 再算 `effectiveArmour = round(207 * 1.34) = 277`；减伤 0.15、双抗 0.34
（均未触顶，符合 cap 0.75 / 0.6）。

完整可复现的 `RolledAffix[]` 形状：

```json
[
  { "affix": "armor.prefix.armor@5",
    "modifiers": [{ "stat": "armorFlat", "mode": "add", "value": 112 }] },
  { "affix": "armor.prefix.armor_pct@5",
    "modifiers": [{ "stat": "armorPct", "mode": "add", "value": 0.34 }] },
  { "affix": "armor.prefix.health@5",
    "modifiers": [{ "stat": "healthBonus", "mode": "add", "value": 45 }] },
  { "affix": "armor.suffix.fire_res@5",
    "modifiers": [{ "stat": "fireResistance", "mode": "add", "value": 0.34 }] },
  { "affix": "armor.suffix.cold_res@5",
    "modifiers": [{ "stat": "coldResistance", "mode": "add", "value": 0.34 }] },
  { "affix": "armor.suffix.str@5",
    "modifiers": [{ "stat": "strength", "mode": "add", "value": 26 }] }
]
```

`StatBlock` 版本：

```ts
const block = new StatBlock(definitions, base.bases)
for (const affix of rolled) block.addAffix(affix)
const totals = block.snapshot()
```

## 7. 与现有 p9 代码的接口差异

本数据是设计参考，不直接改动 `templates/game`；以下差异需要在接入时处理：

1. **槽位**：现有 `ITEM_SLOTS = ['weapon','armor','trinket']` 与 `Equipment` 只有 3 件；
   本数据是 9 槽。迁移时需要扩展 schema/equipment model，或只先接 3 槽（weapon→weapon、
   armor→armor、trinket→amulet/ring 任选）。
2. **稀有度**：现有只有 common/magic/rare；新增 legendary 需要更新
   `RARITIES` enum 与存档 `schemaVersion`。
3. **物品结构**：现有 `itemShape` 只有 4 个固定字段（damagePct/attackSpeedPct/
   healthBonus/critPct），没有 ilvl、基底 id、词缀列表。新流程需要保存
   `baseId`、`ilvl`、`affixes: RolledAffix[]`，可用 `StatBlock.snapshot()` 缓存总量。
4. **掉落**：现有 `features/loot/logic/items.ts` 自己调用 `rollLoot` 并手工累加 4 个字段；
   替换为第 6 节的“按族抽取”流程后，`rollItem` 只负责选槽位、基底和 ilvl。
5. **p9 现有平衡**：`healthBonus` 会直接加到 HP；当前 HP=100，tier 5 的 +55 已经很强，
   接入时建议先只启用 magic/rare 的 1-3 条词缀，观察 10 分钟节奏再放开 3+3。

## 8. 数值来源标注

| 内容 | 来源 |
| --- | --- |
| 5 个 tier / 每族 4–6 个 | 参考拟合：PoE 每族 tier 中位 4（`data/affixes.json`） |
| tier ilvl 门槛 1/10/20/32/45 | 参考形状（PoE 步长 5–12），数值为 p9 自定 |
| tier 权重 1000/620/380/220/110 | p9 自定；PoE 顶级 9–33%，这里压到 4.7% |
| 每级数值几何增长 | 参考形状（PoE 生命每级约 +40% 上限），端点为 p9 自定 |
| 词缀族数量 7/7 每池 | p9 自定（PoE ring 前缀 78/后缀 123） |
| 稀有度权重、掉落段、槽位权重 | p9 自定；RePoE 不包含掉落权重 |
| 基底数值、属性需求 | p9 自定（PoE 防御约 `ilvl^0.9`，仅用于校准量级） |
| 名称（Hale/强健 等） | p9 原创 |
| 10 分钟预期 | 用现有 p9 掉率与假设击杀数计算，非 PoE 数据 |

## 9. 剩余 / 下一步

- 接入 p9 代码时补：9 槽 equipment schema、legendary 稀有度、item 内嵌 `affixes[]`。
- 需要一个 `rollItemized(ilvl, sourceTier)` 的正式实现（第 6 节是参考实现）。
- 本版没有 unique/legendary 专属效果、没有 crafting（重铸/锁定）数据；建议下一版先做
  3 个 legendary 基底效果，再做 2 种 crafting 消耗品。
- 抗性 cap 与 `damageReductionPct` 的联动公式尚未在 p9 落地；数据里只有 stat 与 clamp，
  实际减伤曲线需要在 combat 侧定义。
