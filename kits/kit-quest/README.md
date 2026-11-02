# @lunego/kit-quest

**意图**：事件驱动任务状态机、目标计数/去重、前置/链/重复/每日/周常、护送、奖励请求和 tracking。具体任务内容、奖励数值与钱包/背包变化由游戏提供。

## API

- `QuestDef`：`id/objectives/prerequisites/chain/repeat/rewards/tags`；内容注入。
- `QuestObjective`：`kill/collect/talk/reach/use/escort` + target + required + `unique`。
- `escort` 目标：`escortId`（未填时回退到 `target`）为 escort id，另需 `destination:{x,y}` 与 `radius`；`required` 必须为 1。
  - `escortProgress(objective, {x,y,alive})` 为纯函数：`alive:false` → `failed`；距离 ≤ radius → `arrived`；否则 `active`。离开完成半径不会撤销已完成状态。
  - `QuestLog.recordEscort(id, observation, tick)` 只在 `arrived` 时计入完成；escort 死亡把活动任务置为 `failed` 并返回 `{failed:true}` 更新；普通 `record` 不会完成 escort 目标。
- `QuestLog`：
  - `accept/record/turnIn/fail`
  - 状态：available/active/completed/turnedIn/failed
  - `record` 计数与 unique key 去重；目标完成后状态 completed
  - `turnIn` 返回 reward request，不修改钱包/背包；`repeatable`/`daily`/`weekly` 重置为 available
  - `setWorldDayIndex` 驱动每日可用性，不读 Date
  - `RepeatMode` 含 `weekly`；构造时注入 `weekLengthTicks`（或显式 `worldWeekIndex`），`setTick(tick)` 用 `floor(tick / weekLengthTicks)` 推导周索引；`weekTurnedIn` 决定同周不可重复。没有 `weekLengthTicks` 时 `setTick` 明确抛错。
  - `track/untrack/tracked`
  - `serialize()` 返回 `{ version:1, worldDayIndex, worldWeekIndex, tracked, quests }`；每任务状态含 `dayTurnedIn`/`weekTurnedIn`
  - `restore(snapshot)` 一次性恢复日/周索引、追踪集合与任务状态；旧快照缺 `worldWeekIndex` 时按 0 处理；未知 quest/objective、重复 tracked、完成状态与进度不一致都会明确抛错
- 奖励接口是 `QuestReward[]` 请求；游戏层负责实际发放。

## 不变量

- 事件/目标遍历按 quest id、objective 定义顺序确定。
- 恢复追踪使用 Set 语义，同一快照重复恢复不会产生重复 tracking。
- 不读随机/时钟/DOM；无 Promise。
- 不 import `features/*`、`games/*`、`content/*`。
