# @lunego/kit-encounter

**意图**：内容注入的 spawn table、波次/阶段、预算、leash reset、难度缩放和掉落请求。具体敌人、地图与掉落数值由游戏/内容提供。

## API

- `SpawnTable` / `SpawnEntry`：权重、cost、tags、lootTable 名称。
- `EncounterDef`：waves、spawn points、budget、leash、phases、difficulty、lootTables。
- `EncounterRuntime`：
  - `start/nextWave/spawnCurrentWave`
  - 注入 `RngStream`；固定 seed 的数量/顺序稳定
  - 预算超限返回 `{ok:false,reason:'budget'}`，不生成部分波次
  - `checkLeash` 越界 reset
  - `phaseAt/transitionPhase`：Boss phase 阈值
  - `lootRequests`：只返回 loot table 名称请求，不生成物品
  - `serialize/restore`：若注入的 `RngStream` 暴露 `state()`，`EncounterState.rngState` 保存 spawn RNG 状态；`restore` 优先用流自身的 `restore(state)`，否则用 `restoreRngState` 回调，若二者都没有但流当前状态已等于快照则接受（调用方已先恢复 registry），否则明确抛错。
  - 没有 `state()` 的流不会写入 `rngState`；此时调用方必须在读档前自行恢复 RNG，`restore` 不伪造随机状态。
- 难度通过 `DifficultyScaling.scaleCount/scaleCost` 注入。

## 不变量

- 不使用全局随机/时钟；spawn 位置来自注入列表的稳定索引。
- 不 import `features/*`、`games/*`、`content/*`；不写具体敌人/掉落内容。
