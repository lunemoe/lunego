# LuneGo

面向 Web 的 2D 游戏架构框架：逻辑是确定性的状态机，表现层只读镜像并发命令。

- 公开仓库：github.com/lunemoe/lunego，MIT。
- 第一款游戏代号 p9，Hero Siege 式俯视角 ARPG，先与框架一起生长。
- 架构事实源：`docs/architecture.md`。规则清单：`docs/rules/`。

当前仓库包含已实现并测试的内核、host、input、render-pixi、vfx、audio、ui、cli 与游戏模板；通用机制在 packages/ 与 kits/。

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
docs/rules/          LG001–LG016 规则页
packages/core/       schema DSL、ECS、World、调度、命令、RNG、哈希、存档
packages/host/       主线程运行时、时间模型、view loop（模拟 elapsed）、浏览器存档/按键/调试入口、存档/读档、回放、崩溃报告
packages/input/      设备 → 动作 → 游戏命令；ActionContext、设置/键位、KeybindCapture、键盘/指针 browser adapter（指针接受 renderer.viewport）
packages/render-pixi/ 渲染绑定生命周期、精灵/动画/背景/瓦片地图、纹理注册表、图层/Y 排序、PixiJS v8 适配；`renderer.viewport` 是相机/坐标单一来源，`renderSystem.anchorOf/boundsOf` 支持按 binding/layer 取锚点
packages/vfx/        俯视角特效：pixelfx（MIT，vendor）、Cue 映射、地面投影、图层与画布/Pixi 输出
packages/audio/      Web Audio 总线、Cue 映射、抖动、并发上限、手势解锁、MusicController 循环音乐
packages/ui/         Solid + solid-js/html DOM UI：桥、主题 token、菜单栈/焦点、Toast/Loading、Tooltip、受限 Solid 原语、EffectOverlay
kits/kit-space/      静态瓦片碰撞、轴分离移动、圆/矩形范围查询、空间哈希
kits/kit-stats/      属性基础值、加法/乘法修饰器、词缀聚合
kits/kit-ability/    能力定义、资源/冷却、施法校验、泛型目标选择
kits/kit-loot/       确定性权重抽取、稀有度、词缀 roll
packages/cli/        lunego gen / new game / check
packages/eslint-plugin/  LG002 / LG012 / LG013 的可执行规则
packages/testkit/    testWorld、确定性双跑、读档透明、黄金回放
templates/game/      可运行俯视角模板：移动、Y 排序、相机、存档/回放
```

`features/*`、`kits/*`、`games/*` 是游戏与 kit 的位置；模板通过 `lunego new game <name>` 复制到 `games/`。框架与游戏并行演进：当前需要的通用机制直接进 `kits/`，去掉玩法名词并补契约/测试；只做当前需要，不为想象需求预写接口。特效来源与 MIT 许可见 `THIRD_PARTY_NOTICES.md` 与 `packages/vfx/vendor/pixelfx/`。

## 设计约束（必须遵守）

1. 逻辑层 `(state, commands) -> (state', events)`，不碰 DOM、时钟、随机源。时间单位固定：tick 为整数，dt/动画/VFX 为秒，cooldownTicks 与 Cue 去重为 tick。
2. 唯一写入路径：System / Handler；外部只发 Command。
3. 结构性变更在 flush 生效；查询按实体索引升序。
4. 形状一次到位，功能按需生长；不写临时实现、TODO、`any`、`@ts-ignore`、`as unknown as`。
5. 框架运行时（core/host/testkit 等）不出现 AI/任务/战斗/物品等具体领域语义；`kits/*` 只允许通用机制名，不得含具体内容/数值或 import 游戏/content；游戏代码只通过 feature 的 `schema.ts` 跨 feature 通信。
6. 规则由工具强制：tsconfig、ESLint（含 LG016 游戏分区）、dependency-cruiser、注册期校验、开发期守卫、测试、本地 `pnpm check`。本项目不使用 GitHub Actions/CI。
7. UI 框架规定行为与可访问性，不规定美学：颜色/间距/字体走 CSS 变量、props 或 `UiTheme`；游戏提供调色板、字体、九宫格、图标和文案 key，框架不内置美术/玩法名词/强制像素风。

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

LG001 DOM 隔离 · LG002 确定性 · LG003 声明 · LG004 写入路径 · LG005 写权限 · LG006 feature 边界 · LG007 逻辑/表现分离 · LG008 框架无玩法 · LG009 类型化 ID · LG010 schema 版本 · LG011 表现层规则（人工） · LG012 无杂物/无模块级可变状态/文件上限 · LG013 无临时实现 · LG014 不改生成物 · LG015 feature 契约与变更记录 · LG016 框架是游戏访问引擎/平台的唯一通道。
