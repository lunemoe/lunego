# @lunego/kit-stats

**意图**：通用属性表与修饰器聚合。不含装备、职业、伤害公式。

## 公共接口

- `StatDefinition`：`id/base/min/max`。
- `StatModifier`：`{ stat, mode: 'add' | 'mul', value, source? }`。
- `aggregateStats(definitions, modifiers, bases?)`：`(base + Σadd) * Π(1 + mul)`，再 clamp。
- `AffixDefinition` / `AffixInstance` + `aggregateAffixes`：词缀定义与实例聚合。
- `StatBlock`：单角色/物品的可变属性表；`add/addAffix/removeSource/setBase/value/snapshot`。

## 不变量

- 未知 stat 直接报错，不静默忽略。
- 重复应用 add/mul 与顺序无关；结果只在查询时重算。
- 不含随机、时钟、DOM；不 import 游戏代码。

## 对应 p9

p9 `gear/logic/stats.ts` 的 `gearTotals` 是按字段累加；迁移为 `StatBlock` + 每个装备产生 `add` 修饰器即可，词缀数值仍由游戏决定。
