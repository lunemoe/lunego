# @lunego/kit-quest

**意图**：事件驱动任务状态机、目标计数/去重、前置/链/重复/每日、奖励请求和 tracking。具体任务内容、奖励数值与钱包/背包变化由游戏提供。

## API

- `QuestDef`：`id/objectives/prerequisites/chain/repeat/rewards/tags`；内容注入。
- `QuestObjective`：`kill/collect/talk/reach/use` + target + required + `unique`。
- `QuestLog`：
  - `accept/record/turnIn/fail`
  - 状态：available/active/completed/turnedIn/failed
  - `record` 计数与 unique key 去重；目标完成后状态 completed
  - `turnIn` 返回 reward request，不修改钱包/背包；`repeatable`/`daily` 重置为 available
  - `setWorldDayIndex` 驱动每日可用性，不读 Date
  - `track/untrack/tracked`
  - `serialize()` 返回 `{ version:1, worldDayIndex, tracked, quests }`
  - `restore(snapshot)` 一次性恢复日索引、追踪集合与任务状态；未知 quest/objective、重复 tracked、完成状态与进度不一致都会明确抛错
- 奖励接口是 `QuestReward[]` 请求；游戏层负责实际发放。

## 不变量

- 事件/目标遍历按 quest id、objective 定义顺序确定。
- 恢复追踪使用 Set 语义，同一快照重复恢复不会产生重复 tracking。
- 不读随机/时钟/DOM；无 Promise。
- 不 import `features/*`、`games/*`、`content/*`。
