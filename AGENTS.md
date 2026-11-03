# LuneGo

面向 Web 的 2D 游戏架构框架：逻辑是确定性的状态机，表现层只读镜像并发命令。

- 公开仓库：github.com/lunemoe/lunego，MIT。
- 第一款游戏 p9（Hero Siege 式俯视角像素 ARPG）就是 `templates/game`；在现有模板中修框架、完善玩法，不另建替代游戏。
- 架构事实源：`docs/architecture.md`。规则清单：`docs/rules/`。

当前仓库包含已实现并测试的内核、host、input、render-pixi、vfx、audio、ui、i18n、cli、testkit 与游戏模板；通用机制在 packages/ 与 kits/。

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
docs/rules/          LG001–LG017 规则页
packages/core/       schema DSL、ECS、World、调度、命令、RNG、哈希、存档
packages/host/       主线程运行时、时间模型、view loop、浏览器存档/按键/调试入口、存档/读档、回放、崩溃报告、profile store（账号/角色槽/设置）、leaderboard
packages/input/      设备 → 动作 → 游戏命令；ActionContext、设置/键位、KeybindCapture、键盘/指针/手柄 browser adapter（指针接受 renderer.viewport）
packages/render-pixi/ 渲染绑定生命周期、精灵/动画/背景/瓦片地图、纹理注册表、图层/Y 排序、PixiJS v8 适配；`renderer.viewport` 是相机/坐标单一来源，`renderSystem.anchorOf/boundsOf` 支持按 binding/layer 取锚点
packages/vfx/        俯视角特效：pixelfx（MIT，vendor）、Cue 映射、地面投影、图层与画布/Pixi 输出
packages/audio/      Web Audio 总线、Cue 映射、抖动、并发上限、手势解锁、MusicController 循环音乐
packages/ui/         Solid + solid-js/html DOM UI：bridge、主题 token、菜单栈/焦点、Toast/Loading、Tooltip、受限 Solid 原语、EffectOverlay、完整游戏控件、i18n/a11y 接入
packages/i18n/       消息表、插值、注入式复数、locale fallback、profile scope LocaleStore；不读 DOM/localStorage
kits/kit-space/      静态瓦片碰撞、轴分离移动、圆/矩形范围查询、空间哈希、A* 寻路
kits/kit-stats/      属性基础值、加法/乘法修饰器、词缀聚合
kits/kit-ability/    能力定义、资源/冷却、施法校验、泛型目标选择
kits/kit-loot/       确定性权重抽取、稀有度、词缀 roll
kits/kit-items/      物品定义/实例、背包/仓库/装备槽、堆叠拆分移动、序列化
kits/kit-progression/ XP/等级曲线、点数、前置图、分配/洗点与派生效果
kits/kit-quest/      事件驱动任务状态机、目标计数、前置/链/重复、奖励请求
kits/kit-dialogue/   对话图、文本 key、条件、effects、分支/仅一次选择
kits/kit-commerce/   vendor 买卖/修理/洗点、原子交易、配方制作、socket/gem
kits/kit-encounter/  spawn table、波次/阶段、预算、leash、难度缩放、掉落请求
kits/kit-zone/       zone/portal/waypoint 图、chunk 加载与实体预算、fog/minimap 状态
kits/kit-ai/         感知/记忆、威胁、utility、行为树、blackboard/group、leash/phase
kits/kit-status/     状态实例、绝对 tick 到期、stack/refresh、DoT/HoT、控制标记
kits/kit-combat/     伤害管线、抗性、护甲/格挡/闪避/护盾、威胁入口
kits/kit-runtime/    通用 ECS/World 适配层：组件/系统/命令/查询/内容 catalog，串联各 kit 机制（不含具体内容）
packages/cli/        lunego gen / new game / check / assets
packages/eslint-plugin/  LG002 / LG012 / LG013 / LG016 的可执行规则
packages/testkit/    testWorld、确定性双跑、读档透明、黄金回放
templates/game/      第一款正式游戏 p9：真实素材、战斗、装备成长、连续地图与存读档
art/p9/             原始 CC0 素材完整归档，不参与运行与发布
research/poe/       p9 装备与职业设计参考，不参与运行与发布
tools/quality/      结构检查、受信契约、故障注入、隔离验收与 Git 门禁
```

`features/*`、`kits/*`、`games/*` 是游戏与 kit 的位置；`kits/kit-runtime` 是通用 ECS/World 适配层（组件/系统/命令/查询/内容 catalog），只含机制、不含具体内容；模板通过 `lunego new game <name>` 复制到 `games/`。框架与游戏并行演进：当前需要的通用机制直接进 `kits/`，去掉玩法名词并补契约/测试；只做当前需要，不为想象需求预写接口。特效来源与 MIT 许可见 `THIRD_PARTY_NOTICES.md` 与 `packages/vfx/vendor/pixelfx/`。

## 模板就是第一款游戏（定位准则）

1. `templates/game` 就是 LuneGo 的第一款完整游戏 p9，包名 `@lunego/game-p9`；它不是教学 Demo、最小示例或等待替换的占位工程。
2. 第一款游戏只在此目录维护。不得另建 `games/p9`、复制另一份实现，或以“模板完成后再重建 p9”为路线。
3. 先修复真实游玩暴露的框架缺口并补契约与回归，再在同一个 p9 中接入素材、完善内容和玩法。不能用通过测试代替实际游玩验收。
4. p9 的正式素材、动画/九宫格元数据与许可放在 `templates/game/assets`；`assets/manifest.json` 是唯一事实源，经 `lunego gen` 生成 `Assets/AssetPack`。角色、敌人、地图、物品、UI 和音频必须实际消费素材，禁止用程序绘制替代图冒充素材接入。
5. 通用能力归 `packages/` / `kits/`；玩法内容和美术归 p9。历史演示名、无用内容、替代绘图器和测试探针应随替换清理；浏览器框架测试夹具放 `e2e/fixtures`，不得随 p9 发布。
6. `lunego new game` 只用于用户明确要求的其他新游戏；复制可玩的 p9 起点不改变第一款游戏的唯一定位。
7. 框架、p9、正式素材、需求与设计参考统一在本仓库管理，只使用根目录这一份 Git。不得恢复外层私有工作区 + 框架 submodule 的双仓库结构，不为 p9 再建 Git 仓库。完整产品目标见 `docs/p9-requirements.md`，设定见 `docs/p9-world.md`；原始素材归档在 `art/p9/`。

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
4. 修改后跑 `pnpm check`，提交前跑 `pnpm verify`；Git hook 校验精确暂存 tree 和所有推送提交。框架改动附带变更记录。
5. 只通过 `schema.ts` 使用其他 feature；不调用其他 feature 的 System / Handler / 内部函数。
6. 新增 System / Handler 文件后运行 `lunego gen`；`_generated/` 不得手改（LG014）。
7. 当前 p9 直接在 `templates/game` 迭代；只有明确创建其他新游戏时才用 `lunego new game <name>`。
8. 普通实现任务不得修改/跳过已安装质量门禁或自行推进受信策略与契约基线。只有用户明确要求审核、更新技术门禁时，才可执行 `--review-policy` / `--reviewed`；流程见 `tools/quality/README.md`。不能通过同时修改旧测试来放行实现回归。

## 规则速查

第一款游戏 p9：`templates/game`，逻辑在 `features/adventure`，表现只通过 host 的 Frame/只读视图与 Command 交互。生成物、schema.lock、feature README/测试由 `lunego check` 校验。

LG001 DOM 隔离 · LG002 确定性 · LG003 声明 · LG004 写入路径 · LG005 写权限 · LG006 feature 边界 · LG007 逻辑/表现分离 · LG008 框架无玩法 · LG009 类型化 ID · LG010 schema 版本 · LG011 表现层规则（人工） · LG012 无杂物/无模块级可变状态/文件上限 · LG013 无临时实现 · LG014 不改生成物 · LG015 feature 契约与变更记录 · LG016 框架是游戏访问引擎/平台的唯一通道 · LG017 技术质量与回归门禁。
