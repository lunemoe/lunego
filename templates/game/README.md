# __GAME_NAME__

LuneGo 的俯视角最小游戏模板：方块响应方向键移动，相机跟随，按 Y 排序绘制，支持存档/读档与回放。

- 逻辑：`features/motion`
- 表现：`src/main.ts`（PixiJS v8，480×270 虚拟分辨率，整数放大）
- 生成物：`features/**/_generated/`，由 `lunego gen` 维护，不要手改。

```bash
pnpm install
pnpm --filter @lunego/game-__GAME_NAME__ dev
pnpm --filter @lunego/game-__GAME_NAME__ test
```

工作区内使用 `workspace:*`；对外发布/独立安装留给 create-lunego 阶段。
