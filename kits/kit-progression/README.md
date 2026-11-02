# @lunego/kit-progression

**意图**：通用 XP/等级曲线、点数、技能/被动前置图、分配/洗点、flag/stat/ability 效果导出。职业、技能名与具体数值由游戏提供。

## API

- `XpCurve` / `tableXpCurve(thresholds)`：累计 XP 曲线；阈值只由调用方给。
- `ProgressionGraph`：节点 `id/maxLevel/requires/flags/modifiers/abilities`；构造期检测未知前置与循环，`order()` 按 id 代码点排序。
- `Progression.addXp/allocate/respec`：升级发点、前置/最大等级检查、洗点全额返还；XP/等级保留。
- `flags()/modifiers()/abilities()`：按确定顺序导出派生效果，不存储副本。
- `state()/restore()`：可序列化的点数与 rank 状态。
- 构造函数 `onAllocate/onRespec`：确定性效果回调；派生 flag/stat/ability 仍由 `flags()/modifiers()/abilities()` 导出。

## 契约

- `modifiers` 使用 `@lunego/kit-stats` 的 `StatModifier`；`abilities` 只是 `@lunego/kit-ability` 的 ID 字符串，不生成能力内容。
- 不写职业/技能/被动内容或数值。
- 不读随机/时钟；不 import `features/*`、`games/*`、`content/*`。
