# @lunego/kit-ai

**意图**：与玩法无关的确定性 AI 机制：感知/记忆、威胁/黑名单、utility、行为树、blackboard/group、leash/phase。不含具体敌人、技能或数值内容。

## 公共接口

- `Perception`：视野范围 + 视野锥 + tick 记忆；结果按 entity index 升序。`serialize()` 保存 memory/seen，`restore(snapshot, { isValidEntity? })` 恢复；未知/死亡 entity 明确抛错。
- `ThreatTable`：威胁值、黑名单；排名 threat 降序、entity 升序。`serialize()`/`restore(snapshot, { isValidEntity? })` 保留黑名单目标的威胁值。
- `selectUtility`：候选 action 按分数降序，平局按 action id 代码点。
- `btSequence` / `btSelector` / `btCondition` / `btAction`：同步行为树节点。
- `Blackboard` / `AgentGroup`：确定性数据槽与按 entity 排序的成员集合；`Blackboard.snapshot()/restore()` 校验缺失或未知 key。
- `withinLeash` / `transitionPhase`：脱战半径与 phase tick 记录。
- `AiContext.rng`：只接受注入的 `RngStream`，不使用全局随机。

## 不变量

- 不读 `Date`/`performance`/`Math.random`，不返回 Promise。
- 所有候选顺序稳定；浮点比较只用于距离/视野，结果排序不依赖浮点相等。
- 读档不静默丢弃引用：恢复时传 `isValidEntity` 可拒绝未知/死亡 entity。
- 不 import `features/*`、`games/*`、`content/*`。
