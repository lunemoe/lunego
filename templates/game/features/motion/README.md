# motion

意图：让一个方块响应方向输入移动，并作为俯视角模板的最小逻辑 feature。

## 公共接口

- 组件：`Position`、`Velocity`、`Renderable`
- Tag：`Player`
- 命令：`motion.start`、`motion.moveIntent`
- Cue：`motion.moveDust`（脚下落脚尘，表现层映射为 pixelfx 特效）
- System：`motion.integrate`

## 不变量

- 只有 `Player` 实体响应 `motion.moveIntent`。
- 位置只由 `motion.integrate` 在每个 tick 积分一次。
- 所有持久化状态使用 `persist: 'world'`。

## 依赖

`@lunego/core`。
