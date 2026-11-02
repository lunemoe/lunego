# __GAME_NAME__

LuneGo 模板游戏。逻辑在 `features/motion`，表现为 PixiJS。

```bash
pnpm install
pnpm --filter @lunego/game-__GAME_NAME__ dev
pnpm --filter @lunego/game-__GAME_NAME__ test
pnpm --filter @lunego/game-__GAME_NAME__ build
```

规则沿用 LuneGo：逻辑不碰 DOM/时钟/随机源，只通过 Command 写入；新增 System 文件后运行 `lunego gen`。
