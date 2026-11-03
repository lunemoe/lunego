# p9 · LuneGo 的第一款游戏

`templates/game` 就是第一款游戏 p9，不是演示或占位项目。直接维护本目录，不另建 p9。

p9 与框架共用仓库根目录这一份 Git、依赖工作区与验收命令，不依赖外层工作区、Git submodule 或独立游戏仓库。产品要求与设定见根目录 `docs/p9-requirements.md`、`docs/p9-world.md`。

- 按根 AGENTS.md 的“模板就是第一款游戏”准则执行：先修框架，再完善当前游戏。
- 玩法逻辑与内容：`features/adventure`；表现：`src/view`；正式素材与元数据：`assets/manifest.json`。
- 必须使用现有 p9 素材；通过生成的 `Assets/AssetPack` 和框架 API 接入动画、地图、UI 与音频。禁止留下替代绘图器、重复加载器或旧演示内容。
- 测试探针归仓库根 `e2e/fixtures`，不放进游戏源码或发布包。
- 逻辑不读平台；状态只经 System/Handler 写入。新增处理器或系统后运行 `lunego gen`，不得手改生成物。
- 修改契约时同步 schema、测试、README、changeset；验收须包含真实素材加载和浏览器游玩。

```bash
pnpm --filter @lunego/game-p9 dev
pnpm --filter @lunego/game-p9 test
pnpm --filter @lunego/game-p9 build
pnpm check
```
