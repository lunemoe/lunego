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

- `SpawnActor` 按 prefab id 生成实体，可标记 `ActorControllable`，并发出 `ActorSpawned` 供表现层挂接自己的渲染组件。
- `MoveIntent` 只修改带 `ActorControllable` 标签的实体；`BuyItem` 校验 vendor/库存格子/金币后在同一个 handler 内写回背包与钱包。
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

## 可玩性与持久化约束

- `MoveIntent` 的 x/y 是方向轴；长度超过 1 时归一化，再乘 `ActorMoveSpeed.value`（世界单位/秒）。停止不会清除朝向。死亡角色停止移动和 AI；有当前区域时，移动限制在区域 bounds 内。
- 玩家和 AI 共用能力校验：存活、敌对阵营、内容存在、目标范围/方向锥、视线和整数 tick 冷却。`AbilityCooldowns` 是 world scope，读档不会清掉冷却，同 tick 重复命令也不能绕过冷却。正资源消耗在没有资源时返回 `resource`。
- `attackDamage` hook 用于玩家和 AI；显式返回 null 禁用本次攻击。`AbilityUsed` 供表现层反馈，所有伤害仍经 `DamageRequested` 结算。
- 同 tick 多个致死伤害只发一次 `Died`。护盾剩余值写回，抗性传入伤害管线，闪避/格挡使用 world RNG。
- 掉落实体拥有死亡位置的 `ActorPosition`；可用 `pickupRange` 限制拾取距离。拾取成功后立即标记已领取，防止 flush 前重复拾取。表现层按 `GroundItem` 绑定掉落，不往掉落实体附加游戏私有组件。
- `EquipItem` 将旧装备换回同一背包格。`RuntimeItemDef.heal` + `UseItem` 提供消耗式治疗；满血、死亡或非消耗品不会消耗物品。
- `EncounterStart` 创建的实体要到 flush 才能被查询；`spawnTick` 防止出生当 tick 被误判为空波。清完当前波后等待 `waveDelayTicks`，再进入下一波；完成最后一波只发送一次 `EncounterCompleted`。波次、过渡截止 tick、完成标记和 RNG 都随世界存档恢复。
- `RuntimeQueries` 提供背包、装备和遭遇的 typed DTO，游戏不需要另写快照解析。
- `RuntimeAbilityDef.areaRadius` 为以有效目标为中心的范围伤害；只命中存活敌对目标，整次施法只消耗一次冷却。
- `SellItem` 校验 vendor、背包格和出售价格后，原子移除物品并增加金币，同 tick 不能重复出售同一格。
- `hookReads` 显式声明注入策略要读取的额外 state/model，使成长和难度策略可以留在游戏而不绕过运行时守卫。
- `readGroundItem` 提供掉落物的校验式 typed 解码，供表现层读取品质等元数据。
