# @lunego/kit-status

**意图**：通用状态实例、绝对 tick 到期、stack/refresh、来源移除、DoT/HoT 周期和控制标记。状态内容与数值由游戏提供。

## 公共接口

- `StatusDef`：`id`、`durationTicks`、`maxStacks`、`periodic`、`control`、`modifiers`。
- `StatusSet`：
  - `apply(def, source, tick, stacks?)`：绝对 `expiresAt`、stack 上限、刷新周期。
  - `tick(tick, stats?)`：清理到期状态并返回所有到期周期事件；跨多个周期按 tick 升序返回。
  - `remove/removeSource/clear`：来源移除、死亡清理。
  - `controls()`：排序后的控制标记集合。
  - `syncModifiers(stats)`：通过 `@lunego/kit-stats` 的 `StatBlock.add/removeSource` 增删修饰器。
  - `serialize()`：返回 `{ version:1, statuses:[{status,source,stacks,appliedTick,expiresAt,nextTick}] }`。
  - `restore(snapshot, defs, stats?)`：从调用方注入的 `StatusDef` 目录重建实例；`nextTick:null` 表示无周期效果。未知 status id、重复 status/source、越界 stacks/tick 明确抛错；传入 `stats` 时先移除旧 modifier source，再重新同步。

## 不变量

- 不读全局时钟/随机；所有时间参数都是显式 tick。
- 周期次数只由 tick 差和 interval 决定，与帧大小无关。
- 快照不静默丢弃状态：未知 id/损坏字段直接失败。
- 不 import `features/*`、`games/*`、`content/*`；不含具体状态内容。
