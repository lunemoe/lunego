# LuneGo

LuneGo 是一个面向 Web 的 2D 游戏架构框架：逻辑层是确定性的状态机，表现层只读状态并发命令。当前 p9（Hero Siege 式俯视角像素 ARPG）位于 `templates/game`，直接在此完善框架接入和玩法。

- 架构：[`docs/architecture.md`](docs/architecture.md)
- 规则：[`docs/rules/`](docs/rules/)
- AI 作业说明：[`AGENTS.md`](AGENTS.md)
- p9 完整需求：[`docs/p9-requirements.md`](docs/p9-requirements.md)；世界设定：[`docs/p9-world.md`](docs/p9-world.md)
- 原始素材归档：[`art/p9/`](art/p9/)；装备与职业设计参考：[`research/poe/`](research/poe/)

框架与第一款游戏统一在这一个 Git 仓库维护。克隆本仓库即可开发和构建，不再需要外层 `lunego-workspace`、Git submodule 或单独的 p9 仓库。运行所用素材在 `templates/game/assets`；原始素材归档和研究资料不随游戏发布。

## 当前内容

**包**：`@lunego/core`、`@lunego/host`、`@lunego/ui`、`@lunego/input`、`@lunego/render-pixi`、`@lunego/vfx`、`@lunego/audio`、`@lunego/i18n`、`@lunego/testkit`、`lunego` CLI、`@lunego/eslint-plugin`，以及第一款正式游戏 p9（`templates/game`）。

**通用 kits**：`kit-space`、`kit-stats`、`kit-ability`、`kit-loot`、`kit-items`、`kit-progression`、`kit-quest`、`kit-dialogue`、`kit-commerce`、`kit-encounter`、`kit-zone`、`kit-ai`、`kit-status`、`kit-combat`、`kit-runtime`。

**CLI**：`lunego gen [--check]`、`lunego new game <name>`、`lunego check`、`lunego assets <check|build|pack|import>`。`lunego gen` 生成注册表、类型化内容/资源 ID 与项目地图；`lunego check` 校验生成物、内容引用、资产 manifest 与内部导入边界。

**规则**：LG001–LG016 由 tsconfig、ESLint、dependency-cruiser、注册期校验与测试共同执行。LG016 要求游戏/模板只通过 `@lunego/*` 访问引擎与平台能力，禁止本地坐标/时间/资源/输入/音频/存储/渲染/UI/相机/锚点实现。

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm depcruise
pnpm gen:check
pnpm test:e2e
pnpm check
```

`pnpm test` 运行 Vitest workspace；`pnpm test:e2e` 运行 Playwright 浏览器冒烟；`pnpm check` 串联 build、typecheck、lint、depcruise、test、gen:check 与 e2e。具体测试数量随批次变化，以上述命令结果为准。

第一款游戏 p9 直接在 `templates/game` 开发和验收；其定位准则见 `AGENTS.md`。`lunego new game <name>` 仅用于明确创建其他游戏时复制这个可玩起点。框架与游戏并行演进：当前真实需要的通用机制进入 `kits/` 或 `packages/`，去掉玩法名词并补齐契约、测试与变更记录。

MIT License.
