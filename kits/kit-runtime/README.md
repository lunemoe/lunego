# @lunego/kit-runtime

**通用逻辑运行时适配**：把 actor/combat/status/AI/items/encounter/zone/progression/quest/dialogue/vendor 的 ECS 组件、model、system、handler、query 和内容契约组合成一个可复用的 `FeatureDef`。本包**不包含具体游戏内容**。

## 边界

- 依赖：`@lunego/core` + 现有机制 kits；不 import host/render/ui/audio/vfx/templates/games。
- 组件/model 只存快照与稳定机制状态；`StatusSet`/`QuestLog`/`DialogueRunner`/`Inventory` 等类只在 system/handler 内短暂 hydrate，不放进 component。
- 内容默认值、职业/技能/物品/敌人/任务/对话/商店/掉落/价格/等级曲线全部由游戏 catalog 提供。README 中的 `example.*` 仅说明形状，不是可玩内容。
- 内容 catalog 为空时也可构建 Feature；跨引用校验在 `buildRuntimeContent` 启动期完成，缺失立即抛错，而不是静默生成默认内容。
- 具体规则/公式/奖励通过 `RuntimeHooks` 注入；本包只提供机制。
- 本包运行时代码不含具体游戏名称、剧情、地图、敌人、物品或数值；LG008 人工审查仍适用于 kit。

## API

- `RuntimeCatalogs` / `RuntimeContent`：prefabs/items/affixes/lootTables/statuses/abilities/aiProfiles/encounters/zones/quests/dialogues/vendors/recipes/progression/stats。
- `registerRuntimeCatalogs(registry, catalogs)`：为每个 catalog 值注册 `{ id, hash }`；`runtimeValueHash` 对排序后的 JSON 数据确定性计算，值变化会改变 hash。函数/闭包、类实例、非有限数值与循环引用明确拒绝；动态规则走 `RuntimeHooks`。
- `buildRuntimeContent(registry, catalogs)`：校验条目存在于 registry、每项 hash 与值一致，并检查 quest→item、dialogue→quest、zone→encounterId、encounter→loot、vendor/recipe→item、progression→ability 等引用。
- `createRuntimeFeature({ name, content, hooks })`：返回标准 `FeatureDef`，包含组件/model/事件/命令/system/handler/query。
- `RuntimeHooks`：`resolveDamage`、`canEquip`、`attackDamage`、`dropFor`、`onQuestReward`、`onDialogueEffect`、`hasLineOfSight`。
- `RuntimeQueries.inventoryView`：UI 只读 DTO 示例。

## 行为约束

- `MoveIntent` 只修改带 `ActorControllable` 标签的实体。
- AI 每 tick 按 `CombatTeam` 过滤敌对，用 `Perception`（sight/cone/memory）+ 可选 `hasLineOfSight` 选最近可见目标；目标死亡/记忆过期/无可见目标时清空并待机。
- `AttackTarget` 的 source 优先用显式 payload，否则用持有 `InventoryState` 的玩家实体；source 0、自身、同队、死亡目标均拒绝。
- `Died` 只产生 `ItemDropped`；`PickupItem` 成功写入背包后才产生 `ItemPicked`。任务 `collect` 只监听 `ItemPicked`，不会在掉落时计数。
- `EncounterStart` 以 `EncounterStateModel` 的 `{ encounter, runtime }` 存档判断幂等：同 encounter 连续 start 返回 ok 且不重复 spawn，不同 encounter 返回 `already_active`。
- `UsePortal` 从 `ZoneStateModel` 读取当前 zone，校验 content zones 与 portal 的 from/to；portal id 不会被当作 zone id。
- `ApplyStatus` 要求目标已有 `StatusState`（缺失返回 `missing_status_state`），由内容/prefab 提供状态组件。
- inventory/equipment/ground/dialogue/quest/status/encounter/zone 快照都在进入逻辑前做形状校验，坏档明确抛错。

## 组件/model scope

- world：actor position/velocity/facing/moveSpeed、combat team/health/defenses/dead、content tag、status snapshot、AI sight/target/threat/memory、ground item、encounter member/state、zone state。
- profile：inventory/equipment snapshot、wallet、progression/quest/dialogue snapshot、item identity、fog。
- 同一组件不会同时使用 world 和 profile scope。
