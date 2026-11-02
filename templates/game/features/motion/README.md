# motion

意图：俯视角模板的表现与装配壳。玩法运行时来自 `@lunego/kit-runtime`，本 feature 只提供游戏自己的渲染组件、角色档案和出生装配，不复制移动/AI/战斗机制。

## 公共接口

- 组件：`Renderable`
- Model：`CharacterProfile`（profile scope）
- 命令：`demo.start`
- 查询：`HudQuery`（只读 UI DTO）
- 内容：`demo.*` 中性模板内容与 `RuntimeHooks` 示例策略

## 不变量

- 移动、AI、战斗、掉落、任务全部通过 `@lunego/kit-runtime` 的 System/Handler。
- UI 只读查询结果并发送 runtime 命令；不直接写组件。
- 所有快照字段都经过 runtime 的 typed bridge。

## 依赖

`@lunego/core`、`@lunego/kit-runtime`。
