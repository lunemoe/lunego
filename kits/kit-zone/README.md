# @lunego/kit-zone

**意图**：zone/portal/waypoint 图、chunk 加载与实体预算、可注入 map generator、fog/minimap 状态。具体地图、生物群系内容与生成算法由游戏提供。

## API

- `ZoneDef`：bounds/chunkSize/spawnBudget/biome/encounterId/tags（encounter 只存内容 ID，不复制定义）。
- `ZoneGraph`：重复/悬挂引用校验、`connected`、`portalsFor`、`chunkCount`。
- `ZoneRuntime`：
  - `loadChunk/unloadChunk/loaded`（chunk 上界校验）
  - `spawn/despawn` 按 zone spawnBudget
  - `usePortal` 当前 zone/portal 校验
  - `generate(zone, MapGenerator)`：注入 seed/version，不实现 mapgen
  - `serialize/restore`
- `MapGenerator` / `RoomTemplate`：接口由调用方实现。
- `FogState`：explored chunk、markers、序列化。
- `createMinimapSource(graph,{width,height,padding})`：统一的 zone 世界坐标→地图坐标。

## 不变量

- zone/chunk/portal/waypoint 排序与 id 确定；无效 chunk/portal 不修改状态。
- 不读随机/时钟；无 Promise。
- 不 import `features/*`、`games/*`、`content/*`；不写具体地图内容。
