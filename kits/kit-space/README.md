# @lunego/kit-space

**意图**：与玩法无关的 2D 空间查询与静态瓦片碰撞。逻辑层使用，零 DOM、零随机。

## 公共接口

- `CollisionGrid`：`width/height/tileSize/solid`，行优先；越界默认当实心，可关。
- `blockedPoint` / `blockedCircle` / `blockedAabb`：点、圆、AABB 与瓦片网格的精确碰撞。
- `moveCircleOnGrid` / `moveAabbOnGrid`：轴分离滑动，返回新坐标与两轴是否被挡。
- `SpatialHash<T>`：均匀网格 broadphase；`insert/update/remove/clear/queryAabb/queryCircle`，按数字 id 升序返回。
- `queryAabb` / `queryCircle`：对任意数组用调用方提供的包围盒查询，按 key 升序。

## 不变量

- 查询顺序只由数字 id/key 决定，与插入顺序无关。
- 不修改输入；不使用 `Math.random`、`Date`、DOM。
- 网格坐标单位为世界像素，`tileSize` 必须为正。

## 对应 p9

p9 `motion/logic/grid.ts` 的 `CollisionGridValue` 与 `collision.ts` 的 `blockedAt` / `moveOnGrid` 分别泛化为 `CollisionGrid` 与 `blockedCircle` / `moveCircleOnGrid`；玩法侧的 actor 半径、地图数据仍留在游戏。

## 寻路

- `gridAStar(grid, from, to, { diagonal?, maxNodes?, maxExpanded?, cornerCutting? })`：
  - 2D tile、整数代价（直走 10/对角 14）、二叉堆。
  - 排序 tie-break：`f → h → tile index`；预算超限返回 `null`。
  - 默认禁止穿过两个实心对角（`cornerCutting: false`）。
- `flowField(grid, goals, { maxNodes? })`：多目标 BFS 整数距离场，`-1` 不可达、`0` 目标；`distance/next` 按固定方向顺序返回。
- 两者只依赖 core 之外的纯数据，不随机、不读时钟。
