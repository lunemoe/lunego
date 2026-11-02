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

## 不变量

- 不读全局时钟/随机；所有时间参数都是显式 tick。
- 周期次数只由 tick 差和 interval 决定，与帧大小无关。
- 不 import `features/*`、`games/*`、`content/*`；不含具体状态内容。
