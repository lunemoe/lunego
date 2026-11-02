# LuneGo

面向 Web 的 2D 游戏架构框架：逻辑是确定性的状态机，表现层只读镜像并发命令。

- 公开仓库：github.com/lunemoe/lunego，MIT。
- 第一款游戏代号 p9，Hero Siege 式俯视角 ARPG，先与框架一起生长。
- 架构事实源：`docs/architecture.md`。规则清单：`docs/rules/`。

当前仓库包含已实现并测试的 M0 内核、host、input、render-pixi、cli 与游戏模板；`ui`、`audio` 留到后续批次。

## 快速开始

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm check
```

## 目录

```
docs/rules/          LG001–LG015 规则页
packages/core/       schema DSL、ECS、World、调度、命令、RNG、哈希、存档
packages/host/       主线程运行时、时间模型、存档/读档、回放、崩溃报告
packages/input/      设备 → 动作 → 游戏命令；纯映射层 + 键盘/指针适配（指针含屏幕/世界坐标）
packages/render-pixi/ 渲染绑定生命周期、精灵/动画/背景/瓦片地图、纹理注册表、图层/Y 排序、PixiJS v8 适配
packages/vfx/        俯视角特效：pixelfx（MIT，vendor）、Cue 映射、地面投影、图层与画布/Pixi 输出
packages/audio/      Web Audio 总线、Cue 映射、抖动、并发上限、手势解锁
packages/cli/        lunego gen / new game / check
packages/eslint-plugin/  LG002 / LG012 / LG013 的可执行规则
packages/testkit/    testWorld、确定性双跑、读档透明、黄金回放
templates/game/      可运行俯视角模板：移动、Y 排序、相机、存档/回放
```

`features/*`、`kits/*`、`games/*` 是游戏与 kit 的位置；模板通过 `lunego new game <name>` 复制到 `games/`。特效来源与 MIT 许可见 `THIRD_PARTY_NOTICES.md` 与 `packages/vfx/vendor/pixelfx/`。

## 设计约束（必须遵守）

1. 逻辑层 `(state, commands) -> (state', events)`，不碰 DOM、时钟、随机源。
2. 唯一写入路径：System / Handler；外部只发 Command。
3. 结构性变更在 flush 生效；查询按实体索引升序。
4. 形状一次到位，功能按需生长；不写临时实现、TODO、`any`、`@ts-ignore`、`as unknown as`。
5. 框架代码不出现玩法名词；游戏代码只通过 feature 的 `schema.ts` 跨 feature 通信。
6. 规则由工具强制：tsconfig、ESLint、dependency-cruiser、注册期校验、开发期守卫、测试、CI。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm -r build` | 按拓扑构建所有包 |
| `pnpm -r test` | 运行各包测试 |
| `pnpm test` | Vitest workspace |
| `pnpm lint` | 构建 eslint-plugin 后运行 ESLint |
| `pnpm typecheck` | core 类型层契约检查（含 mutModel 可写 fixture） |
| `pnpm depcruise` | 依赖方向检查 |
| `pnpm test:e2e` | Playwright 浏览器冒烟 |
| `pnpm gen:check` | 校验模板生成物 |
| `pnpm check` | build + lint + depcruise + test + gen:check + e2e |

## AI 作业流程

1. 读本文件、`docs/architecture.md` 的相关章节、目标 feature 的 README 契约。
2. 先写场景测试，再实现；不要在临时接口上叠代码。
3. 改契约时同步改 schema、测试、README 与 changeset。
4. 提交前跑 `pnpm check`；框架改动附带变更记录。
5. 只通过 `schema.ts` 使用其他 feature；不调用其他 feature 的 System / Handler / 内部函数。
6. 新增 System / Handler 文件后运行 `lunego gen`；`_generated/` 不得手改（LG014）。
7. 新游戏用 `lunego new game <name>`，不要手抄模板。

## 规则速查

模板游戏：`templates/game`，逻辑在 `features/motion`，表现只通过 host 的 Frame/只读视图与 Command 交互。生成物、schema.lock、feature README/测试由 `lunego check` 校验。

LG001 DOM 隔离 · LG002 确定性 · LG003 声明 · LG004 写入路径 · LG005 写权限 · LG006 feature 边界 · LG007 逻辑/表现分离 · LG008 框架无玩法 · LG009 类型化 ID · LG010 schema 版本 · LG011 表现层规则（人工） · LG012 无杂物/无模块级可变状态/文件上限 · LG013 无临时实现 · LG014 不改生成物 · LG015 feature 契约与变更记录。
