# @lunego/kit-ability

**意图**：与玩法无关的技能门禁、tick 冷却与目标描述。具体技能名、伤害、特效留在游戏。

## 公共接口

- `AbilityDefinition`：`id/cooldownTicks/costs/target`；`defineAbility` 做形状校验。
- `AbilityState`：`cooldownUntilTick`（绝对 tick）。
- `readyAt` / `isReady` / `remainingCooldown` / `checkCast`：进入冷却、冷却与资源校验。
- `TargetSpec`：`none | point | direction | nearest`，可选 `range/minDot`。
- `TargetQuery<T extends TargetCandidate>` + `resolveTargeting`：返回 `none` / `point` / `direction{targets}` / `nearest{targets}`；`targetsInCone` / `nearestTargets` 可单独使用。
- 目标用泛型 `{ id, x, y }` 表达，不绑定 ECS 或实体组件。

## 不变量

- 冷却与资源校验只读；应用消耗、冷却、伤害由游戏写回自己的状态。
- 目标排序：距离平方升序，相等时数字 id 升序。
- 无随机、时钟、DOM；不 import 游戏代码。

## 对应 p9

p9 三技能可拆成：`sweep` = `direction + range + minDot`，`bolt` = `nearest + range`，`dash` = `direction`。p9 的 `skill-rules.ts` 数值、`cast-skill.ts` 的伤害/暴击/特效仍留在游戏。
