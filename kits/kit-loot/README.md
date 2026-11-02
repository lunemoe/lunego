# @lunego/kit-loot

**意图**：确定性权重抽取、稀有度与词缀 roll。具体物品名、槽位、掉落来源留在游戏。

## 公共接口

- `weightedPick(rng, entries)`：非负权重、固定遍历顺序。
- `RarityDefinition` / `LootTable`：稀有度权重与词缀池。
- `AffixDefinition`：`weight`、可选按稀有度的 `rarities` 权重、`rolls`（`add|mul`，`integer` 可整数）。
- `rollRarity` / `eligibleAffixes` / `rollLoot`：固定 draw 顺序：稀有度 → 词缀数量 → 词缀选择 → 每个词缀的数值。
- `RolledAffix` / `LootRoll` 可直接映射为 `kit-stats` 的 `AffixInstance`。

## 不变量

- 随机只来自传入的 `RngStream`；不读 `Math.random`/时间/DOM。
- 权重为 0 不参与；总权重必须为正；整数 roll 边界必须是安全整数。
- 不 import 游戏代码。

## 对应 p9

p9 `loot/logic/items.ts` 的 `rollRarity`/`rollItem` 拆成：稀有度与词缀数值走本 kit；物品槽位/名字/id 与掉落概率表仍由游戏组合。
