# LuneGo 架构文档

> 状态：草案 v0.3 · 2026-11-02 · 讨论中（v0.3：确定开源；生成器恢复并分为两类；补齐 Cue/VFX、渲染管线、关系、加载与容错、AI 桥等框架能力；仓库拆分为公开框架仓库 + 私有工作区）
>
> 本文描述的是 LuneGo 的**终局架构**，也就是做完之后应有的样子。实现顺序见第 24 节，但先后顺序不改变终局边界。

---

## 0. 阅读说明

- 包边界、依赖方向、数据流、扩展点，从第一天起就按本文执行；各包内部的实现逐步填充。
- 标记含义：
  - **[已定]**：用户已确认。
  - **[提议]**：推荐方案，等待确认。
  - **[待议]**：有多个可行方案，需要讨论，汇总在第 23 节。
- 文中代码是 API 草图，用来固定"形状"，不是最终签名。

---

## 1. 定位

### 1.1 一句话定位

LuneGo 是面向 Web 的 2D 游戏架构脚手架。它提供逻辑内核、表现适配层、与玩法无关的工具包、工程工具链，以及一整套能由机器强制执行的架构规则。目标是让 AI 长期参与开发，而代码不腐坏。**[已定]**

它不是游戏引擎：不自造渲染器，不做可视化编辑器。它也不预设任何玩法。**[已定]**

LuneGo 以开源形式发布（见第 20 节）。**[已定]**

### 1.2 设计目标（按优先级排列）

1. **AI 可持续**：规则由机器强制；一件事只有一种正确做法；改一处代码只需要很小的上下文。
2. **可验证**：逻辑能在没有画面的情况下运行，结果确定、可以回放；任何行为都能被测试固定下来。
3. **玩法无关**：内核里没有"角色""技能""背包"这类玩法概念。
4. **性能够用**：撑得住上万实体的实时动作游戏，也同样适合回合制和放置类。
5. **可移植**：同一份逻辑代码可以跑在浏览器主线程、Web Worker、Node（测试或服务器）和桌面壳里。

### 1.3 非目标

- 不造渲染器，不做 3D。
- 不做可视化场景编辑器。关卡和动画交给外部工具（LDtk、Aseprite 等）；运行时提供 devtools，用于调试和热改数值。
- 不内置物理引擎，需要时以 Kit 形式接入。
- v1 不做联网同步，但架构上不堵死这条路（见第 18 节）。

### 1.4 与 QFramework 的对应关系

| QFramework | LuneGo | 差异 |
|---|---|---|
| Architecture（IOC 容器） | `World` + `defineFeature` 注册 | World 同时承载 ECS 实体和全局状态 |
| Model | `Model`（全局状态）+ `Component`（实体状态） | 多了面向数据的 ECS，用来承载大量同类对象 |
| System | `System` | 有调度阶段和读写声明，执行顺序由调度器决定 |
| Command | `Command` | 是可序列化的数据，在 tick 边界执行；只有外部（UI、输入、网络、回放）才能发 |
| Query | `Query` | 纯只读函数，逻辑侧同步调用，表现侧异步调用 |
| Event | `Event` | 带类型的"已发生事实"；tick 内按依赖顺序传播，tick 末发布给表现层 |
| Utility | `Service` | 逻辑侧只能注入确定性的服务；平台能力只在表现侧 |
| Controller（MonoBehaviour） | 表现层：Renderer / UI / Audio / Input | 只读取状态镜像，只能发 Command |
| BindableProperty | Model 镜像 + Solid signals | 跨线程自动同步，只读 |
| 规则靠约定 | 规则靠编译器、lint、运行时守卫和 CI | **根本差异** |
| ActionKit / ResKit / UIKit … | `kit-*`、`assets`、`ui` | 同样是"内核 + 工具包"的结构 |

---

## 2. 设计原则

1. **逻辑与表现分离。** 逻辑层是一个状态机：`(state, commands) → (state', events)`。它不知道画面、声音和 DOM 的存在。
2. **唯一写入路径。** 状态只能在 System 和 CommandHandler 里修改，外部只能发 Command。
3. **确定性。** 相同的初始状态加相同的命令序列，必然得到相同的结果，而且每个 tick 都能校验。
4. **数据驱动。** 游戏规模的增长主要发生在内容数据里，而不是代码里。
5. **规则由机器强制。** 每条写进文档的规则都要有对应的编译期、lint、运行时或 CI 检查。实在无法强制的规则，要明确标出来。
6. **按功能竖切、改动局部化。** 一个功能的 schema、逻辑、表现、内容、测试、文档放在同一个目录。AI 改一个功能，只需要读一个目录。
7. **只有一种模块单位。** 游戏功能、官方 Kit、第三方扩展都是同一种形状：Feature。
8. **显式优于隐式。** 读写哪些状态、依赖谁、收发哪些事件，全部要声明。声明本身就是文档，工具可以直接读取。
9. **异步只出现在边界。** 逻辑层是同步的。资源加载、平台回调、网络消息等一切异步结果，都以 Command 的形式进入 World，并记入命令日志，所以加载快慢不影响回放。
10. **机械的交给工具，创造的交给 AI，合规交给校验。** 注册、类型化 ID、文档同步这类确定性工作由生成器完成；业务逻辑由 AI 编写；是否合规由 `lunego check` 判定。

---

## 3. 总体分层

### 3.1 分层图

```
                 LOGIC SIDE                              VIEW SIDE
                 no DOM · deterministic                  browser
                 runs in Worker / main / Node
 ────────────────────────────────────────────────────────────────────────────────
 Game            features/*/logic                        features/*/view
                 content/*                               app/main.ts   (view root)
                 app/world.ts  (logic root)
 ────────────────────────────────────────────────────────────────────────────────
 Kits/Adapters   kit-* (logic entry)                     kit-*/view
                                                         render-pixi · vfx · ui · input · audio
 Platform        host (runner)    ◄─── protocol ───►     host (client) · assets · storage · platform
 ────────────────────────────────────────────────────────────────────────────────
 Kernel          core  — schema · ECS · World · scheduler · command/event/query
                         rng · math · serde · feature            (shared by both sides)
 ────────────────────────────────────────────────────────────────────────────────
 Tooling         testkit · devtools · mcp · cli · eslint-plugin · create-lunego
```

### 3.2 包清单

| 包 | 所在侧 | 职责 |
|---|---|---|
| `@lunego/core` | 两侧共享 | schema DSL、ECS 存储、World、调度器、Command/Event/Query、确定性 RNG 与数学库、序列化、Feature 机制。零依赖，不碰 DOM |
| `@lunego/host` | 桥接 | 运行宿主：主线程、Worker、Node 三种 runner；逻辑与表现之间的通信协议；时间模型（固定步长、追帧、快进） |
| `@lunego/render-pixi` | 表现 | 基于 PixiJS 的渲染适配：渲染管线、像素完美、渲染绑定、插值、图层、相机、动画、文字 |
| `@lunego/vfx` | 表现 | Cue 映射、粒子、序列帧特效、像素风着色器库、屏幕效果、飘字、贴花、拖尾（9.5 节） |
| `@lunego/ui` | 表现 | DOM 叠加 UI：Solid 绑定、Model 镜像、像素风组件库、焦点与手柄导航、i18n |
| `@lunego/input` | 表现 | 键鼠/手柄/触摸 → 抽象动作 → Command；支持改键 |
| `@lunego/audio` | 表现 | 基于 Web Audio：总线、混音、事件驱动的音效 |
| `@lunego/assets` | 表现 + 构建 | 运行时：资源清单、加载、图集。构建期：Aseprite 和 LDtk 导入、生成类型化资源 ID |
| `@lunego/storage` | 表现 | 存档后端（IndexedDB、文件、云存档接口）、存档槽、执行迁移 |
| `@lunego/platform` | 表现 | 平台服务抽象：成就、排行榜、云存档、在线状态；提供 Web、Steam 等实现（第 17 节） |
| `@lunego/kit-*` | 逻辑（可另带 view 入口） | 与玩法无关的可选工具包（第 11 节） |
| `@lunego/devtools` | 工具 | 运行时检查器、命令日志、时间回溯、性能面板 |
| `@lunego/testkit` | 工具 | 测试用 World、场景测试、回放校验、确定性双跑、黄金快照、基准测试 |
| `@lunego/mcp` | 工具 | 开发期 MCP 服务：让 AI 直接查看、操作正在运行的游戏（12.11 节） |
| `lunego`（CLI） | 工具 | `lunego` 命令：gen / new / check / describe / run / replay / sim / shot / assets |
| `@lunego/eslint-plugin` | 工具 | LuneGo 规则的 lint 实现，附带 dependency-cruiser 预设配置 |
| `create-lunego` | 工具 | `pnpm create lunego`：外部用户新建项目的入口，等价于 `lunego new game` |

### 3.3 依赖规则 **[已定]**

```
core                         不依赖任何包
kit-*                        → core；kit 之间如有依赖，必须在 package.json 中显式声明且无环
host                         → core
render-pixi/vfx/ui/input/audio/assets/storage/platform  → core, host(client)；vfx 另依赖 render-pixi
testkit/devtools/mcp/cli     → 以上任意包

features/*/logic             → core, kit-*（逻辑入口）, 其他 feature 的 schema.ts
features/*/view              → core, 表现层各包, kit-*/view, 任意 feature 的 schema.ts

features/*/logic   ✗→  任何表现层包、任何 view 目录
features/*/view    ✗→  任何 logic 目录
任何 feature       ✗→  其他 feature 的内部文件（只能 import 对方的 schema.ts）

packages/*         ✗→  examples/*、任何游戏（框架永远不知道有哪些游戏）
游戏 A             ✗→  游戏 B（游戏之间互不引用；通用的东西应进入框架）

每个游戏的 app/world.ts 与 app/main.ts 是它仅有的两个组合根
```

这些规则用什么手段强制，见 12.3 节。

---

## 4. 核心模型：World

### 4.1 概念总览

| 概念 | 是什么 | 谁能写 |
|---|---|---|
| Entity | 一个 ID，带代数（generation），用来防止悬挂引用 | System / Handler 负责创建和销毁 |
| Component | 挂在实体上的数据，由 schema 定义 | 声明了写权限的 System / Handler |
| Tag | 不带数据的组件 | 同上 |
| Relation | 实体之间的关系（挂载、归属、容器……），由内核维护双向索引 | 同上 |
| Model | 全局单例状态（设置、货币、进度……） | 同上 |
| System | 每个 tick 运行的逻辑，需要声明读写 | — |
| Command | 来自外部的意图，本身是数据，在 tick 开头执行 | 由表现层、输入、网络或回放发出 |
| CommandHandler | 处理某个 Command 的函数 | — |
| Event | 本 tick 内已经发生的事实 | System / Handler 发出 |
| Cue | 发给表现层的一次性反馈提示（命中、爆炸……），逻辑层读不到 | System / Handler 发出 |
| Query | 只读的派生计算 | — |
| Service | 逻辑侧可注入的确定性能力（RNG、内容表、时间） | — |
| State | 应用级流程状态（Boot / Title / Playing……） | System / Handler 发起切换请求 |
| Prefab | 实体模板，属于内容数据 | 内容作者 |
| Feature | 把以上所有东西打包并注册的单位 | — |

一个 Host 可以承载多个 World，例如主世界加一个预览或推演用的副本世界。

### 4.2 Entity 与 Component

- **Entity ID** 是 32 位整数，由索引和代数组成。实体销毁后索引会被复用，但代数递增，所以旧引用会自动失效。读取 `t.entity` 类型的字段时，可以校验对方是否还存活。
- **Component** 由 schema 定义，**按列存储**：数值字段存成 TypedArray 列，其他字段存成普通数组列。访问风格统一为 `C.field[e]`。**[已定]** 逻辑侧 tsconfig 关闭 `noUncheckedIndexedAccess`，否则每次列访问的结果都会变成 `number | undefined`。实体 ID 只能来自查询结果，或经过存活校验的引用，以此保证访问不越界。
- **结构性变更**（spawn / despawn / add / remove）在阶段内先缓冲，阶段结束时统一生效，这样遍历是安全的，顺序也是确定的。
- **组件选项**：`persist`（写进存档）、`replicate`（同步到表现层）、`writers`（写权限归属，见 7.4）、`interpolate`（表现层做插值）。
- **查询过滤**：支持 `with`、`without`、`added`、`removed`（这些是结构性变化，追踪成本低）。不提供逐实体的 `changed`，因为列式写入没法低成本地追踪它。

```ts
export const Position = defineComponent('Position', { x: t.f32, y: t.f32 }, {
  persist: true, replicate: true, interpolate: true,
})
export const Velocity = defineComponent('Velocity', { x: t.f32, y: t.f32 })
export const Frozen = defineTag('Frozen')
```

**关系（Relation）。** 实体之间的关系由内核提供，不让每个游戏各自用 `t.entity` 字段拼凑：

- 用途：挂载（武器挂在角色身上）、归属（投射物属于发射者，用于判定击杀归属）、容器（物品实体放在背包实体里）、编组。
- 内核维护反向索引，可以双向查询：`ctx.children(e, ChildOf)`、`ctx.target(e, ChildOf)`。
- 每种关系都要声明目标被销毁时的策略：`despawn`（连带销毁）、`detach`（解除关系）或 `forbid`（禁止销毁，开发模式下报错）。
- 关系和组件一样，可以持久化，也可以同步到表现层。

```ts
export const ChildOf = defineRelation('ChildOf', { onTargetDespawn: 'despawn' })
export const OwnedBy = defineRelation('OwnedBy', { onTargetDespawn: 'detach' })

ctx.relate(sword, ChildOf, hero)
for (const child of ctx.children(hero, ChildOf)) { /* ... */ }
```

### 4.3 Model

- 全局单例状态，由 schema 定义，带初始值。
- 写入通过"草稿"进行，例如 `ctx.mutModel(Wallet).gold -= 10`。框架在内部把修改记录成补丁（patch）。
- 补丁每个 tick 发给表现层，驱动 UI 镜像做细粒度更新。
- 和组件一样，支持 `persist` 和 `replicate` 选项。

### 4.4 System 与调度

每个 tick 分为固定的几个阶段：

| 阶段 | 内容 |
|---|---|
| `commands` | 执行本 tick 的命令（框架内置，调用各 CommandHandler） |
| `pre` | 时间、计时器、状态切换 |
| `update` | 游戏逻辑主体 |
| `post` | 结算、清理 |
| `flush` | 结构变更生效、封存事件、生成帧数据（框架内置） |

同一阶段内的执行顺序，由调度器根据各系统的声明计算：

- 发出事件 E 的系统，一定排在读取 E 的系统之前。如果读取者所在阶段比发出者早，它必须显式读取上一 tick 的事件（`{ prev: true }`），否则注册时报错。
- 显式的 `after` / `before` 约束优先。其余顺序按系统名做稳定排序，与注册顺序无关，所以 AI 调整注册顺序不会悄悄改变行为。
- 如果两个系统一个写组件 C、另一个读 C，却没有任何顺序约束，就视为"歧义"。默认给出警告，可以在配置里改成报错。
- 依赖成环直接报错。
- `runIf` 用于按状态启停系统，例如只在 `Playing` 状态下运行。
- 调度图可以导出（`lunego describe --schedule`），作为自动生成文档的一部分。

```ts
export const integrate = defineSystem({
  name: 'motion.integrate',
  phase: 'update',
  reads: [Velocity],
  writes: [Position],
  run(ctx) {
    const pos = ctx.write(Position)
    const vel = ctx.read(Velocity)
    for (const e of ctx.query(Position, Velocity, without(Frozen))) {
      pos.x[e] += vel.x[e] * ctx.time.dt
      pos.y[e] += vel.y[e] * ctx.time.dt
    }
  },
})
```

开发模式下，System 一旦访问了没声明过的组件、模型或事件，会立刻抛出带规则编号的错误。

### 4.5 Command

- **Command 是数据。** 它由 schema 定义，可以序列化，所以命令日志本身就是回放。
- **边界校验。** 外部来的命令在进入时都要做 schema 校验。来自 UI、网络、回放文件的命令一律视为不可信。
- **执行时机。** 每条命令绑定一个目标 tick，在该 tick 的 `commands` 阶段按 (tick, 序号) 顺序执行。
- **返回结果。** Handler 返回 `ok` 或 `rejected(reason)`，结果随帧数据回传；表现层拿到的是一个 Promise。
- **带来源。** 每条命令都装在一个信封里：`{ tick, seq, source, type, payload }`。`source` 标明命令来自哪个玩家（单人游戏固定为玩家 0），或来自哪个系统通道（例如资源加载、平台回调）。Handler 通过 `cmd.source` 读取。现在就这样设计，以后做本地多人或联网时都不用改命令格式。

```ts
// schema.ts
export const Buy = defineCommand('shop.buy', { item: t.ref(ShopItem) })

// logic/handlers/buy.ts
export const handleBuy = defineHandler(Buy, {
  writes: [Wallet],
  emits: [Purchased],
  run(ctx, cmd) {
    const price = ctx.content(ShopItem, cmd.item).price
    const wallet = ctx.mutModel(Wallet)
    if (wallet.gold < price) return reject('insufficient_gold')
    wallet.gold -= price
    ctx.emit(Purchased, { item: cmd.item })
    return ok()
  },
})

// 表现层
const result = await game.send(Buy, { item: ShopItems.potion })
```

- **不嵌套。** Handler 不能再发别的 Command。需要复用的逻辑写成普通的领域函数，不要靠命令套命令。
- **连续输入也是命令。** 例如移动方向：输入层每个 tick 发一条 `SetIntent` 之类的命令，写入意图组件，再由 System 消费。意图组件同样可以由逻辑侧的 AI 系统写入。消费意图的系统不关心意图来自键盘、AI 还是回放。

### 4.6 Event

- 事件是带类型的事实，用过去式命名，例如 `Died`、`ItemPicked`。
- **tick 内**：调度器保证读取者排在发出者之后，所以同一个 tick 内就能看到事件。确实需要跨 tick 的反馈环，要显式读取上一 tick：`ctx.events(E, { prev: true })`。
- **tick 末**：标记了 `replicate` 的事件随帧数据发布到表现层，用于音效、特效、飘字和提示。
- 事件不写进存档，也不能被修改或取消。需要可取消的流程，就用"请求事件 + 结算系统"的模式来实现。
- **Event 与 Cue 的分工**：Event 是给逻辑看的事实，System 可以读取，也可以选择同步给表现层；Cue 是只给表现层看的反馈提示，逻辑层读不到（见 9.5 节）。"敌人死亡"是 Event，"在这里播放死亡特效"是 Cue。

### 4.7 Query

- 纯只读函数。逻辑侧同步调用 `ctx.call(Q, args)`；表现侧异步调用 `await game.query(Q, args)`，在两个 tick 之间执行。
- 规则：表现层不重复实现游戏规则，例如伤害公式、价格计算，一律通过 Query 获取。

### 4.8 Service

- 逻辑侧能注入的服务**必须是确定性的**：`rng`、`content`、`time`、`math`，以及 `log`（带 tick 戳，不影响状态）和 `debug`（开发期的调试绘制，生产构建中会被整体移除，见第 14 节）。
- 存储、网络、音频、真实时钟这类平台能力**不提供给逻辑侧**。逻辑需要存档时，就发出一个事件（如 `SaveRequested`），由组合根响应。

### 4.9 State（应用流程）

```ts
export const AppState = defineState('app', ['boot', 'title', 'playing', 'paused'])
```

- 系统可以用 `runIf: inState(AppState, 'playing')` 来启停，也可以挂在 `onEnter` / `onExit` 上。
- 状态切换请求在当前 tick 末尾生效。
- 场景和关卡不是内核概念。加载关卡就是根据内容数据 spawn 实体，这件事由游戏自己的 feature 完成。

### 4.10 权限矩阵

| 角色 | 读组件/Model | 写组件/Model | 发 Event | 读 Event | 发 Command | 调 Query | 平台能力 |
|---|---|---|---|---|---|---|---|
| System | ✓ 需声明 | ✓ 需声明 | ✓ 需声明 | ✓ 需声明 | ✗ | ✓ | ✗ |
| CommandHandler | ✓ 需声明 | ✓ 需声明 | ✓ 需声明 | ✗ | ✗ | ✓ | ✗ |
| Query | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| 表现层 | 只读镜像 | ✗ | ✗ | ✓ 仅已发布的 | ✓ | ✓ 异步 | ✓ |
| 组合根 `app/*` | 只读镜像 | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |

---

## 5. 运行时：Host 与 Tick 管线

### 5.1 线程模型 **[已定]**

- 逻辑（World）和表现之间**只通过 Host 协议通信**，不管两者是否在同一个线程。
- 三种运行模式：
  - `worker`：生产环境默认。
  - `main`：便于调试。
  - `node`：用于测试、无头运行和未来的服务器。

  三种模式下的游戏代码完全相同。
- Worker 模式下，逻辑代码在物理上就接触不到 DOM，这本身就是一道强制边界。
- 数据传输默认用 postMessage 加 Transferable。如果部署环境支持跨源隔离（COOP/COEP），可以选用 SharedArrayBuffer 实现零拷贝。
- **输入延迟**：Worker 模式下，输入要跨线程送到逻辑，结果再跨线程回到渲染，因此比主线程模式最多多出约 1 个 tick 的延迟。这对放置类和 ARPG 影响不大。平台跳跃、格斗这类对延迟敏感的游戏，可以在 `lunego.config.ts` 里把生产模式设为 `main`；协议不变，游戏代码也不用改。具体数值由 `examples/platformer` 实测确定（待议 Q12）。

### 5.2 协议

```
表现 → 逻辑：Command（带目标 tick）· Query 请求 · Control（暂停/单步/倍速/存档/读档/快进）
逻辑 → 表现：Frame { tick, 实体增删, 复制组件的列数据或差量, Model 补丁, 已发布事件, Cue, 命令结果, 查询结果 }
```

表现侧拿到的是一个 `GameClient`：

```ts
const game = await createGame({ world: new URL('./world.ts', import.meta.url), mode: 'worker' })

game.send(Cmd, payload)      // → Promise<CommandResult>
game.query(Q, args)          // → Promise<T>
game.models.Wallet           // 只读镜像（signal）
game.onFrame(frame => ...)   // 渲染层订阅
game.control.setSpeed(4)
```

### 5.3 Tick 管线

```
 VIEW (main thread)                               LOGIC (Worker / main / Node)
 ──────────────────                               ────────────────────────────
 Input ─► actions ─► toCommands() ──┐
 UI ─────────────► game.send() ─────┼──Command──►  queue (stamped: tick, seq)
 Devtools ─────────► control ───────┘                      │
                                                 World.step()
                                                   1. commands  run handlers
                                                   2. pre       time, timers, state
                                                   3. update    feature systems
                                                   4. post      resolve, cleanup
                                                   5. flush     structural changes,
                                                                seal events, build Frame
 Renderer ◄── interpolate ◄─┐                              │
 UI mirrors ◄── patches ◄───┼────────── Frame ◄────────────┘
 Audio / VFX ◄── cues ◄─────┘   { tick, spawns/despawns, columns,
                                  model patches, events, cues, results }
```

### 5.4 时间模型

逻辑时间只用 tick 计量，`tickRate` 由游戏配置（例如 30 或 60）。

| 模式 | 适用场景 | 机制 |
|---|---|---|
| `realtime` | 实时游戏 | 按固定步长累加时间；渲染层按 alpha 做插值 |
| `onDemand` | 回合制、解谜 | 只在收到命令时推进 |
| `fastForward` | 快进、补算 | 不渲染，按时间预算分片全速推进，并回报进度 |

**时间缺口**指浏览器后台标签被节流，或者离线一段时间后重新打开。Host 会算出缺口长度：

- 小于 `maxCatchUp` 时自动追帧。
- 超过时，调用游戏提供的策略钩子：

```ts
onTimeGap(gap) => 'fastForward' | 'skip' | { settle: (ctx, gap) => void }
```

框架只提供机制；离线收益怎么算，由游戏自己决定。

倍速（×N）、暂停、单步是 Host 的内置能力，对放置类玩法、调试和测试都有用。

### 5.5 加载与流式

逻辑层是同步的，资源加载却是异步的。两者按"异步结果以命令进入"的原则衔接：

1. 启动时，Host 先加载必需的内容包，再创建 World。
2. 运行中需要新内容（例如进入新区域）时，逻辑发出 `ContentRequested(pack)` 事件。
3. Host 在后台加载内容包，表现侧同时加载对应的图片和音频。
4. 加载完成后，Host 向 World 发送 `ContentLoaded(pack)` 命令，这条命令会记入命令日志。
5. 逻辑要等收到这条命令的那个 tick 之后才使用新内容。等待期间怎么表现（加载画面、占位、暂停该区域）由游戏决定。

"加载完成"是一条带 tick 的命令，所以无论机器快慢，回放结果都一样。

大地图的分区激活（远处区域休眠并序列化移出，靠近时再恢复）作为 Kit 提供（`kit-chunks`，见第 11 节），不进内核。

### 5.6 错误处理与崩溃恢复

- **逻辑异常**：某个 System 抛错时，本 tick 的状态可能已经被改了一部分，所以 World 立即停止推进。
  - 开发模式：暂停并弹出错误面板，显示 System 名称、tick 和调用栈，提供"导出回放"和"回到上一个快照"两个操作。
  - 生产模式：保留最近的自动存档，不覆盖；自动打包崩溃报告，内容为快照环形缓冲里最近的快照、之后的命令日志和日志；提示玩家从上一个存档恢复。崩溃报告可以存成本地文件，也可以选择上传。
- **表现异常**：某个渲染绑定或 UI 组件出错时，只隔离出错的那一个（错误边界），逻辑照常运行。
- **不变量违反**：开发模式下抛错；生产模式下默认记录并上报，不中断游戏（可配置）。
- 快照环形缓冲同时服务于三件事：崩溃报告、devtools 的时间回溯、读档透明测试。

---

## 6. 确定性

### 6.1 保证范围 **[已定]**

在同一个 JS 引擎、同一份构建产物下，结果逐位一致。

跨引擎的一致性（Chrome、Firefox、Node 之间）默认不保证，但留了后路：逻辑层的超越函数统一走 `@lunego/core/math`，需要时可以换成软件实现。

### 6.2 规则

- 逻辑层禁止使用：`Math.random`、`Date`、`performance.now`、`setTimeout`、`setInterval`、`async`/`await`/`Promise`、`fetch`、DOM 及一切浏览器 API，以及模块级可变状态。
- 逻辑层禁止直接用 `Math.sin/cos/tan/atan2/exp/log/pow`，一律改用 `core/math`。
- 遍历顺序必须确定：查询按实体索引升序返回；Map 和 Set 只依赖插入顺序。
- 逻辑层不产出给玩家看的文本，只产出 ID 和数值。本地化在表现层做。

### 6.3 随机数

- 使用带种子的 PRNG（例如 xoshiro128**）。
- **按名称分流**：`ctx.rng('loot')`、`ctx.rng('ai')` 等，每条流由根种子和流名派生，彼此独立。某个系统多调用一次随机数，不会让其他系统的回放跟着漂移。
- RNG 状态属于 World 状态，会写进存档，也参与状态哈希。

### 6.4 状态哈希与回放

- `world.hash()`：对全部持久状态和模拟状态计算确定性哈希。
- 回放文件包含：框架版本、内容哈希、种子或初始存档、按 tick 排列的命令日志，以及周期性的哈希检查点。
- 回放可以用来校验（逐个检查点比对）、定位（二分查找第一个不一致的 tick）和下断点（停在第 N 个 tick 检查状态）。

---

## 7. Feature：唯一的模块单位

### 7.1 目录形状 **[已定]**

```
features/<name>/
├── README.md        # 契约：意图、公共接口、不变量、依赖（部分段落自动生成）
├── schema.ts        # 公共契约：组件、模型、事件、命令、查询签名、内容类型
├── logic/
│   ├── index.ts     # defineFeature(...)
│   ├── systems/     # 一个文件一个 System
│   ├── handlers/    # 一个文件一个 CommandHandler
│   ├── queries.ts
│   └── rules.ts     # 本 feature 的领域函数（纯函数）
├── view/
│   ├── index.ts     # defineFeatureView(...)
│   ├── render/
│   ├── ui/
│   └── cues.ts      # 本 feature 的 Cue 表现映射
├── content/         # 本 feature 拥有的内容数据（可选）
└── tests/
```

### 7.2 注册

```ts
// logic/index.ts
export const HealthFeature = defineFeature({
  name: 'health',
  deps: [MotionFeature],
  components: [Health],
  events: [Damaged, Died],
  commands: [handleHeal],
  systems: [applyDamage, cleanupDead],
  queries: [isAlive],
  invariants: [hpWithinMax],     // 开发模式下每个 tick 检查一次
})

// view/index.ts
export const HealthView = defineFeatureView({
  name: 'health',
  renderers: [healthBarBinding],
  cues: healthCues,              // Cue → 特效、音效、震屏的映射（9.5 节）
  ui: { hud: [HealthBar] },
})
```

### 7.3 Feature 之间如何通信

- 只能 import 其他 feature 的 `schema.ts`。
- 允许的交互：读取对方的组件或模型、读取对方的事件、发出对方会监听的事件、调用对方的 Query。
- 不允许：调用对方的 System、Handler 或内部函数。
- `deps` 必须无环，并且和实际的 import 关系一致，由 `lunego check` 校验。

### 7.4 写权限归属

- 每个组件或模型默认只属于定义它的 feature，只有这个 feature 的 System / Handler 能写它。
- 确实需要多方写入时，在定义处显式声明，例如 `writers: ['motion', 'knockback']`。
- 其他 feature 想改变它，就发出请求事件（如 `DamageRequested`），交给拥有者去结算。
- 这样，任何一个状态字段的写入者都能列举出来。AI 排查"谁改了这个值"时，不需要全局搜索。

### 7.5 Kit 也是 Feature

官方 Kit 和第三方扩展使用同一套 `defineFeature` / `defineFeatureView`，以包的形式发布，分为 `@lunego/kit-x`（逻辑）和 `@lunego/kit-x/view`（表现）两个入口。AI 只需要学会一种模块形状。

晋升路径：某个游戏 feature 在两款以上的游戏里被证明通用，就把它抽成 Kit。

---

## 8. 数据与内容

### 8.1 Schema DSL：单一事实源 **[已定]**

```ts
t.f32  t.f64  t.i8  t.i16  t.i32  t.u8  t.u16  t.u32  t.bool  t.vec2
t.str  t.enum([...])  t.entity  t.ref(ContentType)  t.asset('sprite')  t.text   // t.text = 本地化键
t.array(T)  t.struct({...})  t.optional(T)  t.map(K, V)
```

同一份 schema 会产出以下所有东西：

- TS 类型
- ECS 列存储布局
- 序列化与反序列化
- 存档迁移检查
- 命令校验与内容校验
- devtools 检查器界面
- 给外部工具用的 JSON Schema

现有的库（Zod、Valibot、TypeBox）都不覆盖二进制数值类型、实体引用、内容引用和迁移元数据。所以自己实现一个小而封闭的 DSL。

### 8.2 内容

- 内容类型由 feature 定义：`defineContentType('monster', {...})`。
- **编写格式**用 TypeScript：类型检查就是第一道校验，而且这是 AI 最擅长的格式。大表格可以从 CSV 导入。**[已定]**
- **构建期**会做这些事：
  - 校验 schema；
  - 校验每个 `t.ref` 引用的目标都存在；
  - 生成类型化 ID（例如 `Monsters.slime`），禁止用魔法字符串；
  - 把内容编译成 JSON 内容包。
- **运行时**：逻辑侧加载 JSON 内容包，在 Worker 里不需要打包代码。开发时支持热重载。
- **内置内容类型 `prefab`**：实体模板就是一组组件的初始数据，按组件 schema 校验。用法：`ctx.spawn(Prefabs.slime, overrides)`。

### 8.3 资源（Assets）

- 原始资源放在 `assets/` 目录：`.aseprite`、`.ldtk`、音频、字体。
- **构建管线**：用 Aseprite CLI 导出图集和动画标签；把 LDtk 关卡导入为内容；打包图集；生成类型化资源 ID 和资源清单。
- **资源拆分**：对逻辑有意义的数据，比如动画帧时长、攻击判定帧、瓦片碰撞，放进内容包给逻辑用；纯视觉的数据只给表现层。逻辑层永远不加载图片。

---

## 9. 表现层

### 9.1 渲染（render-pixi）**[已定]**

- **选型**：PixiJS v8（WebGPU / WebGL）。只把它当渲染器用，不用它的场景对象承载游戏逻辑。
  - 不选 Phaser，因为它的 Scene/GameObject 体系会变成事实上的"架构"，和 LuneGo 冲突。
- **像素完美**：虚拟分辨率（例如 480×270）、整数缩放、最近邻采样、相机像素对齐，另外可选亚像素平滑相机。
- **渲染管线**：阶段是固定的。特效和后处理都挂在明确的阶段上，组合在一起时不会互相打架：

```
1. world layers    背景 → 瓦片 → Y 排序的实体 → 前景（虚拟分辨率）
2. lighting        2D 光照合成（可选）
3. world post      扭曲、调色板替换、色彩分级（虚拟分辨率）
4. upscale         整数倍放大到屏幕
5. screen post     CRT、扫描线等（可选，放大后施加，像素保持清晰）
6. world-space UI  血条、名字、伤害数字（画布内绘制）
7. DOM UI          面板、背包、菜单（DOM 叠加层）
```
- **渲染绑定**：用声明的方式把"查询结果 → 显示对象"连起来。显示对象的创建、更新、回收（对象池）和插值都由渲染层自动管理：

```ts
export const spriteBinding = defineRenderBinding({
  query: [Position, Sprite],
  create: (view) => view.sprite(),
  update: (obj, view) => {
    obj.position.copyFrom(view.lerp(Position))   // 在上一 tick 与当前 tick 之间插值
    obj.texture = view.frame(Sprite)
  },
})
```

- **其他能力**：图层与排序（含 Y 轴排序）、相机（跟随、边界、房间切换、多相机、用于小地图的渲染到纹理）、帧动画（含动画事件，例如第 3 帧播放脚步声）、瓦片地图、位图字体、转场。特效相关的能力在 `@lunego/vfx`（9.5 节）。
- **打击感归属**：顿帧、震屏、闪白这类效果默认属于表现层。只有会影响规则的时间变化（比如真正的子弹时间）才进逻辑层。

### 9.2 UI **[已定]**

- **选型**：DOM 叠加层 + Solid.js。背包、tooltip、技能树、设置这类界面，用 DOM 写比在画布里画省一个数量级的工作量，也是 AI 最熟悉的领域。
- **Model 镜像**：`useModel(Wallet)` 返回一个只读 signal，由逻辑侧发来的补丁驱动。UI 只能调用 `game.send(...)` 和 `game.query(...)`。
- **像素风组件库**：
  - 组件：Window、Panel、Button、Bar、Slot/Grid、Tooltip、DragDrop、Tabs、Modal、ContextMenu、Toast；
  - 九宫格皮肤（`border-image`）、像素字体；
  - 与渲染层同步的整数缩放。
- 另外支持焦点与手柄导航、i18n、主题，以及富文本：同一套标记语法在 DOM 和画布中都能渲染，用于物品说明这类彩色文本。
- **DOM 与画布的分工**：屏幕空间的面板用 DOM。跟随实体的世界空间 UI（血条、名字、伤害数字）可能同时有上百个，一律在画布内绘制（渲染管线第 6 阶段），不用 DOM。

```tsx
function GoldButton() {
  const wallet = useModel(Wallet)
  const game = useGame()
  return <Button onClick={() => game.send(Buy, { item: ShopItems.potion })}>{wallet().gold}</Button>
}
```

### 9.3 音频（audio）

基于 Web Audio：

- 总线（music / sfx / ui / voice）、音量控制与闪避（ducking）；
- 音效由 Cue 触发（9.5 节），音高和音量可以随机变化，避免听起来重复；
- **发声数限制与优先级**：同一个音效同时最多播放 N 个，超出时按优先级丢弃。上百个敌人同时受击时，声音会不会糊成一片，就取决于这一条；
- 2D 空间化：按相对相机的位置做声像和距离衰减；
- 自适应音乐：按战斗强度切换或叠加分轨，并带过渡；
- 浏览器限制：用户第一次交互后才能解锁音频，由 Host 统一处理；音频文件按浏览器支持情况准备多种格式。

### 9.4 输入（input）

数据流：设备（键鼠、手柄、触摸）→ 动作映射（如 `move: axis2D`、`confirm: button`）→ 游戏定义的 `toCommands(actions)` → Command。

支持改键、多套键位方案、输入缓冲、按最近使用的设备切换按键提示图标，以及把多个手柄分配给不同玩家（对应命令的 `source`）。输入层不接触 World。

### 9.5 Cue 与 VFX **[提议]**

**Cue 是逻辑层通向表现层的唯一一次性反馈通道。** 逻辑只说"发生了什么、在哪、多强"，不管"怎么表现"：

```ts
// schema.ts —— 逻辑侧契约
export const HitCue = defineCue('combat.hit', { at: t.vec2, power: t.f32, kind: t.enum(['normal', 'crit']) })

// logic —— 只负责发出，不关心表现
ctx.cue(HitCue, { at, power: 0.8, kind: 'crit' })

// view/cues.ts —— 表现映射，属于表现侧的内容数据
export const healthCues = defineCueMap({
  [HitCue.id]: (c) => [
    vfx(Vfx.hitSpark, { at: c.at, scale: c.power }),
    sfx(Sfx.hit, { pitchJitter: 0.1 }),
    shake({ trauma: c.power * 0.3 }),
    c.kind === 'crit' && hitStop({ frames: 3 }),
  ],
})
```

- **一次性与持续**：一次性的反馈（命中、爆炸、拾取）用 Cue。持续的表现（比如燃烧时身上一直冒火）由状态驱动：表现层看到实体带着 `Burning` 组件，就挂上火焰特效；组件移除时，特效收尾。
- **集中处理**：所有反馈都经过同一个 Cue 映射层。画质档位（低画质少放粒子）、无障碍（关闭震屏、减少闪烁）、性能预算（每帧特效数量上限）都只需要在这一层实现一次。
- **回放与截图**：表现层的随机数由（tick、实体、Cue 序号）派生，所以同一份回放的同一帧，截出来的图完全一样，可以用来做视觉回归测试。

**`@lunego/vfx` 提供的能力：**

| 类别 | 内容 |
|---|---|
| 粒子 | 用数据定义的发射器；批量渲染；像素对齐；数量上限与画质档位 |
| 序列帧特效 | Aseprite 导出的一次性动画（爆炸、刀光、烟尘），播完自动回收 |
| 像素风着色器库 | 受击闪白、描边、溶解、调色板替换（同一套美术做出不同颜色的敌人变体）、颜色叠加、扭曲（热浪、冲击波） |
| 屏幕效果 | 基于 trauma 的震屏、顿帧（只在表现层）、闪屏、暗角、色差、慢动作（只在插值层面） |
| 拖尾与残影 | 武器拖尾、冲刺残影 |
| 贴花 | 地面痕迹（血迹、焦痕），限时淡出，有数量上限 |
| 飘字 | 伤害数字等：位图字体、同一帧内的多次伤害合并显示、对象池 |
| 2D 光照（可选） | 光照层、光源精灵、环境光，挂在渲染管线第 2 阶段 |

特效定义本身也是表现侧的内容数据，使用类型化 ID（如 `Vfx.hitSpark`），可以在 devtools 的特效试验台里实时调参（第 14 节）。

### 9.6 文本、字体与本地化

- **字符串表**：每种语言一张表，属于内容数据；用 ICU 消息格式处理复数和参数。`lunego check` 会检查缺失的键和没用到的键。
- **逻辑层只产出本地化键**（LG016），文本拼装在表现层完成。
- **中日韩像素字体**：DOM UI 直接使用开源像素字体（例如方舟像素字体、缝合像素字体）作为 Web 字体。画布里的文字（飘字、名字）使用运行时动态生成的位图字形图集：按需光栅化，再二值化以保持像素锐利，不必预先烘焙几千个汉字。
- 按语言切换字体；中日韩文本按字符断行；可选做文本长度检查，防止译文撑破界面。

### 9.7 无障碍

框架内置以下设置项，各子系统统一遵守：

- 减弱或关闭震屏、闪屏、频闪（防止诱发光敏性癫痫），在 Cue 映射层统一过滤；
- 色盲模式（全屏滤镜或调色板替换）；
- UI 缩放和字号；
- 给关键音效配字幕或视觉提示；
- 全部按键可以重新映射，"按住"可以改为"切换"；
- 游戏速度调节（直接使用 Host 的倍速能力）。

---

## 10. 持久化

### 10.1 存档

- **内容**：格式版本、各个 schema 的版本、内容哈希、tick、RNG 状态、所有 `persist` 组件和 Model，以及元信息（游玩时长、时间戳、存档槽摘要）。
- **格式**：压缩后的 JSON，方便调试，也方便 AI 阅读。
- **读档透明**：实体 ID 原样恢复。"连续跑 N 个 tick"和"跑 N/2 个 tick、存档、读档、再跑 N/2 个 tick"必须得到相同的哈希。这一条是自动化测试。
- 设置（音量、键位、UI 缩放）和游戏存档分开存储。

### 10.2 迁移与 Schema 锁

- 每个持久化 schema 都带版本号和迁移函数，例如 `migrations: { 2: v1 => v2 }`。
- `schema.lock.json` 记录所有持久化 schema 的结构哈希。结构变了却没升版本，或者缺少迁移函数，`lunego check` 就会失败。
- **黄金存档**：每个已发布的版本都保留存档样本，测试中必须能成功加载并通过不变量检查。

### 10.3 存储后端

IndexedDB（Web）、文件系统（桌面壳）、云存档接口（预留）。

### 10.4 存档可靠性

- **原子写入**：先写新数据，校验通过后再切换指向。写到一半断电，旧存档也不会坏。
- **滚动备份**：每个槽位保留最近 N 份，带校验和；发现损坏时自动回退到上一份。
- **浏览器存储可能被清除**：Web 平台启动时申请持久化存储（`navigator.storage.persist()`），同时提供"导出 / 导入存档文件"功能，并支持接入云存档。

---

## 11. Kits：与玩法无关的工具包

**入选标准：**

1. 至少两类玩法会用到；
2. 不假设具体玩法；
3. 逻辑部分满足全部确定性规则，状态可以序列化；
4. 自带文档、测试和示例。

**状态必须能序列化。** 例如序列或协程类工具，不能用 JS generator 实现，因为 generator 的状态没法存档，要改用数据化的状态机。

**首批 Kit [提议]：**

| Kit | 内容 |
|---|---|
| `kit-timer` | 计时器、冷却、延时、数据化的动作序列（对应 QFramework 的 ActionKit） |
| `kit-fsm` | 有限状态机和分层状态机，状态存放在组件里 |
| `kit-ai` | 行为树、效用 AI（Utility AI），均用数据定义 |
| `kit-stats` | 属性、修饰器（加算 / 乘算 / 覆盖）、标签、派生属性 |
| `kit-ability` | 能力、效果、消耗、冷却的框架（借鉴 GAS 的思路） |
| `kit-space` | 变换、层级、空间哈希、形状重叠检测、射线。它不是物理引擎 |
| `kit-nav` | 网格 A*、流场、转向行为（steering） |
| `kit-tilemap` | 瓦片数据、自动瓦片规则、LDtk / Tiled 导入；带 view 入口 |
| `kit-procgen` | 噪声、加权表、BSP 与房间拼接、WFC |

**候选：** `kit-chunks`（大地图分区激活与流式加载）、`kit-inventory`（容器、格子、堆叠）、`kit-dialogue`（对话与叙事）、`kit-quest`、`kit-economy`、`kit-physics`（接入 Rapier 等外部物理引擎）。

---

## 12. AI 协作体系

这是 LuneGo 区别于其他框架的核心。LuneGo 本身也由 AI 参与开发，所以这套体系从第一天就要生效。

### 12.1 原则

- **能强制就不靠自觉。** AI 会忘记文档，编译器和 CI 不会。
- **一件事只有一种做法。** 每种扩展都有唯一的标准模板。
- **机械的交给工具，创造的交给 AI，合规交给校验。** 创建骨架、注册、类型化 ID、文档同步由生成器完成；业务逻辑由 AI 编写；是否合规由 `lunego check` 判定，不依赖 AI 记住规则。
- **上下文局部化。** 改一个功能，只需要读一个 feature 目录，加上它依赖的 schema。
- **项目自描述。** 项目结构可以被机器读出来，生成准确的地图，而不是让 AI 全局搜索去猜。
- **错误信息直接指向修法。** 每条违规都给出规则编号、原因和修复方式。

### 12.2 规则体系

每条规则都有编号和对应文档 `docs/rules/LGxxx.md`，内容包括说明、原因、强制手段和修复示例。报错示例：

```
LG004  System 'motion.integrate' 写入了 Position，但没有在 writes 中声明。
       修复：在 defineSystem 的 writes 中加入 Position。详见 docs/rules/LG004.md
```

**初始规则表 [提议]：**

| 编号 | 规则 | 强制手段 |
|---|---|---|
| LG001 | 逻辑层不依赖 DOM 和浏览器 API | 逻辑侧 tsconfig 不含 DOM lib；在 Worker 中运行 |
| LG002 | 逻辑层不使用非确定性 API | lint 禁用清单；测试时双跑比对哈希 |
| LG003 | 逻辑层不使用 async / Promise | lint |
| LG004 | System / Handler 必须声明读写和收发的事件 | 开发模式运行时守卫 |
| LG005 | 状态只能在 System / Handler 中修改 | 运行时守卫（tick 之外状态被冻结） |
| LG006 | 写权限归属（`writers`） | 注册期校验 |
| LG007 | feature 只能 import 其他 feature 的 `schema.ts` | dependency-cruiser |
| LG008 | 逻辑不 import 表现，表现不 import 逻辑实现 | tsconfig 项目引用 + dependency-cruiser |
| LG009 | 不用魔法字符串引用内容或资源 | 类型化 ID + lint |
| LG010 | 持久化 schema 变更必须升版本并提供迁移 | `schema.lock.json` + check |
| LG011 | 表现层不实现游戏规则 | Query 约定 + 代码审查（**无法完全由机器强制**） |
| LG012 | 禁止 `utils` / `common` / `helpers` 这类杂物目录 | lint（检查目录名） |
| LG013 | 禁止模块级可变状态 | lint |
| LG014 | 单文件行数上限（软上限 300，硬上限 500） | lint |
| LG015 | 新 feature 必须有 README 契约和测试 | check |
| LG016 | 逻辑层不产出给玩家看的文本 | 类型约束（`t.text` 只接受本地化键） |
| LG017 | 命名约定（见 12.9） | lint |
| LG018 | 修改 `packages/` 必须附带框架变更记录 | CI 检查 `.changeset/` 条目 |
| LG019 | System、Handler 等只能定义在约定目录中（约定目录里的定义会被自动注册） | check |
| LG020 | 禁止手改 `_generated/` 目录中的文件 | `lunego gen --check`（重新生成后比对） |
| LG021 | 逻辑层只通过 Cue 表达反馈，不在组件里存放只给表现层用的字段 | 代码审查（**无法完全由机器强制**） |

### 12.3 强制的层级

1. **编译期**：tsconfig 分层（逻辑侧既没有 DOM 也没有 Node 类型）、最严格的 TS 配置、类型化 ID、品牌类型。
2. **Lint**：`@lunego/eslint-plugin` 检查非确定性 API、async、杂物目录、模块级状态、命名和行数；dependency-cruiser 检查依赖方向。
3. **注册期**：World 启动时校验依赖是否无环、调度有无歧义、写权限归属，以及 `deps` 是否与实际 import 一致。
4. **运行时（开发模式）**：访问未声明的状态就抛错；在 tick 之外写入就抛错；每个 tick 检查不变量；检测 NaN。
5. **测试期**：确定性双跑、回放校验、读档透明、黄金存档、性能基准。
6. **CI**：以上全部，再加上校验自动生成的文档是否最新，以及公共 API 报告里有没有未经确认的变化。

### 12.4 上下文工程

- **根目录 `AGENTS.md`**：不超过 200 行，内容包括 LuneGo 是什么、十条铁律、目录地图、常用命令和标准作业流程。`CLAUDE.md` 通过 `@AGENTS.md` 引用它。
- **每个包**都有自己的 `AGENTS.md`。
- **每个 feature** 都有 `README.md` 契约。其中"公共接口 / 依赖 / 调度位置"这几段由 `lunego gen` 从代码自动生成。
- **`docs/generated/`**：全项目地图，包括 feature 列表、系统调度图、组件/模型/事件/命令清单、内容类型和写权限表。CI 会校验它是否最新。
- **`docs/glossary.md`** 术语表：防止 AI 给同一个概念起不同的名字。

### 12.5 生成器与模板

生成器分两类，作用完全不同。

**① 派生生成：`lunego gen`（核心能力，必须有）**

从唯一的事实来源推导出其他文件，保证两边永远一致：

| 来源 | 生成物 |
|---|---|
| 约定目录中的定义（`logic/systems/*.ts`、`logic/handlers/*.ts` 等） | 每个 feature 的注册表 `logic/_generated/registry.ts` 和 `view/_generated/registry.ts` |
| 内容数据、资源文件、Cue 与特效定义、字符串表 | 类型化 ID（`Monsters.slime`、`Sprites.hero`、`Vfx.hitSpark`、`T.ui.confirm`） |
| `defineFeature` 与各项声明 | feature README 的自动段落、`docs/generated/` 下的项目地图 |
| 内容类型的 schema | 给外部编辑器用的 JSON Schema |

- 生成物统一放在 `_generated/` 目录，文件头标注"请勿手改"，并提交进仓库，方便 AI 直接阅读。
- `lunego dev` 运行期间以监听模式自动生成。CI 运行 `lunego gen --check`：重新生成一遍，和仓库里的内容不一致就失败（LG020）。
- 有了自动注册，新增一个 System 只需要在 `systems/` 下新建一个文件，不用再去改注册列表。调度顺序只取决于声明，与注册顺序无关（4.4 节），所以自动注册不会带来隐式的顺序依赖。
- `schema.lock.json` **不**由 `gen` 自动更新。持久化结构变更后，必须先写好迁移（LG010），再显式执行 `lunego schema accept`。

**② 脚手架生成：`lunego new <kind> <name>`（薄封装）**

```
lunego new game | feature | kit | system | handler | component | model | event
           | command | query | cue | vfx | content-type | migration
```

- 实现方式就是：复制 `templates/` 中对应的模板 → 替换占位名 → 运行 `lunego gen`。模板是唯一来源，生成器本身几乎没有逻辑。
- AI 用 `lunego new` 或手动复制模板都可以，两条路结果一样，最后都由 `lunego check` 校验。用命令更省 token，也不会漏改名字。
- `create-lunego` 就是把 `lunego new game` 包装成 npm 包，给外部用户用。
- 模板本身也受 CI 检查：把每种模板都生成到临时目录，再跑一遍 `lunego check` 和测试。

```
templates/
├── game/        # 新游戏骨架（含启动、标题、设置、暂停、加载等基础界面）
├── feature/     # 新 feature（含 README 契约、schema、logic、view、tests）
├── kit/         # 新 Kit
└── snippets/    # system / handler / component / ... / migration
```

### 12.6 Claude Code 集成

- `.claude/skills/`：新增 feature、新增内容类型、用回放调试、写存档迁移、性能排查。
- hooks：每次编辑后运行 `lunego check --changed --fast`（只对受影响的包做类型检查和 lint）。
- 子代理 `lunego-reviewer`：按规则表审查改动。
- MCP：开发时 Claude Code 连接 `@lunego/mcp`，直接操作正在运行的游戏（12.11 节）。
- 这些 skills、子代理和 hooks 也随 npm 包发布，外部用户的 AI 同样可以直接使用。
- 仓库根目录的 `.claude/` 对 LuneGo 和所有游戏都生效。每个游戏目录另有自己的 `CLAUDE.md`（引用本游戏的 `AGENTS.md`），在该目录下工作时会自动加载。

### 12.7 AI 可调试性

- **无头运行并转储状态**：`lunego run --headless --scenario boss --ticks 3000 --dump out.json`
- **回放复现**：游戏内一键导出"回放 + 存档 + 日志"作为 bug 报告；用 `lunego replay bug.lgreplay --break-at 1520` 复现。
- **截图验证**：`lunego shot --scenario boss --tick 300`（基于 Playwright），让 AI 能看到画面结果。
- **结构化日志**：每条都带 tick 戳。

### 12.8 AI 标准作业流程（写进 AGENTS.md）

1. 读 `AGENTS.md` 和 `docs/generated/` 下的项目地图；
2. 找到要改的 feature，读它的 README 契约；
3. 先写场景测试，描述期望的行为；
4. 用 `lunego new` 创建骨架（或手动复制对应模板），再实现；
5. 跑 `lunego check`，直到全部通过；
6. 契约有变化时更新 README（自动生成的段落由 `lunego gen` 刷新）。

做游戏时，默认不修改 `packages/`。框架不够用时，先停下来说明需求；确认要改框架后，把它作为一次独立的框架改动来做：附上变更记录，并且所有样例和游戏的测试都要通过。

### 12.9 命名约定

- 组件和模型：名词，PascalCase（`Health`、`Wallet`）。Tag 用名词或形容词（`Player`、`Frozen`）。
- 事件：过去式（`Died`、`ItemPicked`）。
- 命令：祈使句（`Heal`、`EquipItem`），命令 ID 带 feature 前缀（`shop.buy`）。
- System：`feature.verbNoun`（`health.applyDamage`），文件名用 kebab-case。
- 内容类型：小写单数（`monster`、`item`）。

### 12.10 禁止清单

- 杂物目录（utils / common / helpers / misc）
- 全局单例和模块级可变状态
- 用字符串表示事件名，或用字符串查找组件
- 一个 System 直接调用另一个 System
- 在表现层计算游戏规则
- 用 `setTimeout` 做游戏内计时
- 跨 feature 导入对方的内部文件
- 在逻辑组件里存放只给表现层用的数据，例如闪白计时器（应改用 Cue 或状态驱动）

### 12.11 运行中游戏的 AI 桥（MCP）

`@lunego/mcp` 是一个只在开发期运行、只监听本机的 MCP 服务。它通过 devtools 协议连接正在运行的游戏，浏览器里的游戏和无头运行的游戏都能连。这样 AI 就能像人一样试玩和调试：

| 工具 | 作用 |
|---|---|
| `query_world` / `inspect_entity` | 查询实体、组件、Model |
| `send_command` | 发送命令（等同于玩家操作） |
| `step` / `set_speed` / `pause` | 控制时间 |
| `screenshot` | 截取当前画面 |
| `run_scenario` / `load_save` | 加载场景或存档 |
| `export_replay` / `get_logs` | 导出回放、读取日志 |
| `rewind` | 回到之前的快照 |

devtools 协议从一开始就按"能被 MCP 暴露"的标准设计：所有操作都是可序列化的请求与响应。

### 12.12 给 AI 读的文档

- 文档站同时发布 `llms.txt`，以及一份完整的纯文本合集，方便任何 AI 一次读入。
- 每个包都随 npm 发布自己的 `AGENTS.md`。即使框架装在 `node_modules` 里，AI 也能就近找到使用说明。

---

## 13. 测试策略

| 层次 | 内容 | 工具 |
|---|---|---|
| 单元 | 领域函数、单个 System | Vitest + `testWorld()` |
| 场景 | 给定初始状态和命令，断言第 N 个 tick 的事件与状态 | testkit |
| 确定性 | 每个场景自动跑两遍，比对哈希（默认开启） | testkit |
| 回放 | 黄金回放逐个检查点比对 | `replayTest()` |
| 读档透明 | 中途存档、读档不改变结果 | testkit |
| 迁移 | 黄金存档都能加载 | testkit |
| 模糊 | 随机命令序列下不变量依然成立 | testkit |
| 性能 | 实体数与耗时的基准，超出预算即失败 | bench |
| 数值模拟 | 无头批量运行场景（蒙特卡洛、参数扫描），输出统计报告，用于平衡性调整 | `lunego sim` |
| 视觉 | 关键画面截图对比（可选） | Playwright |

```ts
test('超额伤害致死', () => {
  const w = testWorld({ features: [HealthFeature] })
  const e = w.spawn({ Health: { current: 10, max: 10 } })
  w.emit(Damaged, { target: e, amount: 15 })
  w.step()
  expect(w.events(Died)).toEqual([{ entity: e }])
})
```

---

## 14. Devtools 与开发体验

开发模式下加载的叠加面板（用 Solid 写在 DOM 上），包含：

- 实体检查器和 Model 编辑器，界面由 schema 自动生成；
- 命令日志（可以重发）和事件流；
- 每个 System 的耗时、实体数量、帧数据大小；
- 暂停、单步、倍速、回溯（用快照环形缓冲加命令重放实现）；
- 回放的录制与导出；
- 内容热改；
- 渲染调试：碰撞形状、空间哈希格子、寻路结果；
- 特效试验台：实时调整粒子和着色器参数，满意后导出为特效定义；
- 逻辑调试绘制：逻辑代码调用 `ctx.debug.circle(...)`、`ctx.debug.watch('label', value)`，通过开发通道送到面板上显示；生产构建中这些调用会被整体移除。

**热重载**：状态全部在 World 里，System 是无状态的函数，所以修改 System 或 Handler 的代码后可以原地替换：游戏状态保持不变，行为立刻更新。内容数据同样支持热重载。schema 改动需要重新加载，开发模式下会尝试自动迁移当前状态。

---

## 15. 工程与工具链 **[提议]**

- **仓库与语言**：pnpm workspace；TypeScript 开启最严格的配置。
- **tsconfig 矩阵**：
  - `tsconfig.logic.json`：不含 DOM
  - `tsconfig.view.json`：含 DOM
  - `tsconfig.node.json`：用于工具

  三者通过项目引用分层。
- **构建与测试**：Vite（开发和构建，原生支持 Worker）、Vitest、Playwright。
- **规则检查**：ESLint flat config + typescript-eslint + `@lunego/eslint-plugin`；dependency-cruiser。
- **版本与发布**：changesets 管理版本和变更记录（LG018）；CI 自动发布到 npm，并附带来源证明（provenance）。公共 API 报告（api-extractor 或同类工具）用来发现框架接口的意外变化。私有游戏如何引用框架，见 21.2 节。
- **CI 流水线**：check → test → 回放与迁移 → bench → build → 校验生成文档。

---

## 16. 性能预算 **[提议]**

| 指标 | 目标（中端笔记本，Chromium） |
|---|---|
| 逻辑 | 10,000 个活动实体（移动 + 空间查询），单个 tick ≤ 4 ms |
| 渲染 | 5,000 个精灵稳定 60 fps |
| 帧数据 | 编码 + 传输 + 解码，每个 tick ≤ 1 ms |
| 热路径 | 逻辑 tick 内零内存分配（用基准测试监测 GC） |
| 启动 | Web 冷启动到可交互 < 2 s（不含游戏自身资源） |

---

## 17. 发布平台

- **Web**（静态托管、PWA 离线）是一等平台。
- **桌面**：Tauri 壳；上 Steam 时，Steamworks 通过插件接入。
- **移动**：Capacitor 或 PWA（次要平台）。
- **平台服务**（`@lunego/platform`）：成就、排行榜、云存档、在线状态等统一成一组接口，提供 Web（本地实现）、Steam（经 Tauri 插件）等实现。平台服务只在表现侧使用：逻辑发出事件，由组合根映射成平台调用；平台回调以命令的形式回到 World（原则 9）。成就定义属于内容数据。
- **浏览器限制汇总**：
  - SharedArrayBuffer 需要 COOP/COEP 响应头，部分托管平台不支持，所以只作为可选优化；
  - 音频要等用户交互后才能解锁；
  - 后台标签会被节流（由时间模型处理，见 5.4 节）；
  - 浏览器存储可能被清除（见 10.4 节）；
  - WebGPU 不可用时自动退回 WebGL2。

---

## 18. 演进

- **版本**：遵循 semver，1.0 之前以 0.x 发布。破坏性变更必须附带迁移说明，改动面大时附带 codemod（AI 很适合写 codemod）。
- **稳定性分级**：公共 API 分为 stable 和 experimental 两级，在类型注释里标注（如 `@experimental`），文档同步标注。
- **冻结已发布的游戏**：某款游戏如果不想再跟随框架升级，把它引用的框架固定在某个版本或某次提交即可。
- **联网**：v1 不做，但不堵死。逻辑是确定性的、由命令驱动的状态机，并且能跑在 Node 上，因此可以从三条路线中选一条：锁步同步、服务器权威、服务器校验回放（防作弊）。
- **Mod**：内容是经过 schema 校验的 JSON 包，天然支持数据型 Mod。

---

## 19. 验证样例：证明玩法无关

框架（`packages/`）不含任何玩法。`examples/` 里放几个刻意选自不同品类的样例，它们就是框架的验收测试：

| 样例 | 验证点 |
|---|---|
| `examples/swarm` | 实时动作、上万实体、Worker 模式、渲染绑定、性能预算 |
| `examples/tactics` | 回合制网格、按需步进、命令结果、撤销（基于快照）、寻路 |
| `examples/idle` | 放置玩法、倍速、时间缺口与离线结算钩子、存档迁移 |
| `examples/platformer`（可选） | 精确输入、低延迟、运动学碰撞 |

框架的任何改动，都必须让所有样例的测试保持通过；在私有工作区里（21.2 节），还要让你所有游戏的测试保持通过。样例用到的美术、音频、字体资源，都必须是允许再分发的开源授权（如 CC0、OFL）。

---

## 20. 开源与社区 **[已定：开源]**

### 20.1 许可证与命名

- **许可证**：推荐 MIT。它最宽松，与 QFramework 一致。备选是 Apache-2.0，多一层专利授权，但条款更长。**[提议]**
- **名称占用情况**（2026-11-02 查询）：
  - npm：`lunego`、`create-lunego`、`@lunego/core` 都未被占用；`@lunego` 作用域能否使用，要在注册同名 npm 组织时确认。
  - GitHub：仓库放在作者账号下，地址为 `github.com/lunemoe/lunego`。**[已定]**

### 20.2 面向使用者

- 安装入口：`pnpm create lunego`。
- 文档站：中英双语，包含指南、API 参考（由 TypeDoc 生成）、能在浏览器里直接运行的样例（部署到 GitHub Pages）和 `llms.txt`。
- `templates/` 和 `examples/` 本身就是最好的教程。

### 20.3 面向贡献者

- 提供 `CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`，以及 issue 和 PR 模板。
- 内核或公共 API 的重大改动先写 RFC（放在 `docs/rfcs/`），讨论通过后再实现；被采纳的 RFC 归档为 ADR。
- 贡献者（包括他们的 AI）和你遵守同一套规则：AGENTS.md、`lunego check`、CI。架构规则本身就是贡献规范。

### 20.4 维护负担

个人维护开源项目，最大的风险是精力不够。对策：

- 范围以本文为界，超出范围的需求引导成第三方 Kit；
- 能自动化的全部自动化：发布、changelog、文档站、样例部署、API 报告；
- 1.0 之前明确声明 API 可能变化，降低维护承诺。

---

## 21. 仓库结构 **[提议]**

### 21.1 公开仓库：lunego

```
lunego/
├── AGENTS.md                # AI 总入口（CLAUDE.md 引用它）
├── CLAUDE.md
├── LICENSE · CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md
├── docs/
│   ├── architecture.md      # 本文
│   ├── adr/                 # 架构决策记录
│   ├── rfcs/                # 重大改动提案
│   ├── rules/               # LGxxx 规则文档
│   ├── guides/              # 使用指南
│   ├── glossary.md          # 术语表
│   └── generated/           # 自动生成，CI 校验
├── website/                 # 文档站（中英双语，含 llms.txt）
├── packages/                # 框架本体（相当于 QFramework）
│   ├── core/  host/  render-pixi/  vfx/  ui/  input/  audio/
│   ├── assets/  storage/  platform/
│   ├── kits/                # kit-timer · kit-fsm · kit-ai · kit-stats · ...
│   ├── devtools/  mcp/  testkit/
│   ├── cli/                 # 发布为 npm 包 lunego
│   ├── eslint-plugin/
│   └── create-lunego/
├── templates/               # 标准模板（12.5 节）
├── examples/                # 验证样例（第 19 节）
├── .changeset/              # 变更记录（LG018）
└── .claude/                 # skills / agents / hooks
```

### 21.2 私有工作区：放你的游戏

游戏通常不开源，所以不放进公开仓库。推荐另建一个私有的工作区仓库，用 git submodule 引入 LuneGo：

```
my-studio/                   # 私有仓库
├── pnpm-workspace.yaml      # 包含 lunego/packages/* 与 games/*
├── lunego/                  # git submodule → 公开的 lunego 仓库
└── games/
    ├── arpg/                # 用 lunego new game 创建
    └── 下一款/
```

- 游戏通过 `workspace:*` 直接引用 `lunego/packages/*` 的源码。改了框架立刻生效，不用等 npm 发版。
- 框架改动在 `lunego/` 子模块里提交，推送到公开仓库（附 changeset）；游戏改动提交到私有仓库。两边边界清楚，私有代码不会误入开源仓库。
- 改框架时，工作区 CI 会同时跑 LuneGo 样例和你所有游戏的测试，单仓的好处得以保留。
- 子模块记录的是框架的确切提交，所以工作区的每次提交都能复现。
- 外部用户不需要这一套，直接从 npm 安装即可。

### 21.3 游戏目录

```
games/<name>/
├── AGENTS.md                # 本游戏的设计要点与特有约定
├── CLAUDE.md                # 引用 AGENTS.md
├── package.json             # 依赖 @lunego/*（工作区内为 workspace:*，外部用户为版本号）
├── lunego.config.ts         # tickRate、分辨率、运行模式、时间缺口策略……
├── schema.lock.json
├── src/
│   ├── app/
│   │   ├── world.ts         # 逻辑组合根：注册 kits 与 features
│   │   └── main.ts          # 表现组合根：host、渲染、UI、输入、音频
│   ├── features/<name>/     # 形状见第 7 节
│   └── content/<type>/      # 全局内容数据
├── assets/                  # 原始资源：.aseprite .ldtk 音频 字体
├── tests/
│   ├── replays/             # 黄金回放
│   └── saves/               # 黄金存档
└── docs/generated/
```

### 21.4 新建游戏

1. 在工作区根目录运行 `lunego new game <name>`（外部用户运行 `pnpm create lunego`）；
2. 修改 `AGENTS.md` 里的游戏简介，以及 `lunego.config.ts`；
3. 运行 `pnpm install`；
4. `lunego check` 和模板自带的测试全部通过后，就可以开始开发。

---

## 22. 决策摘要（ADR）

| # | 议题 | 结论 | 状态 |
|---|---|---|---|
| 001 | 定位 | Web 2D 架构脚手架，与玩法无关，对标 QFramework，名为 LuneGo | 已定 |
| 002 | 语言与平台 | Web + TypeScript | 已定 |
| 003 | 引擎还是自研 | 不用游戏引擎：自研逻辑内核，渲染只做适配层 | 已定 |
| 004 | 状态模型 | 统一的 World（ECS + Model），Command 是唯一的外部写入入口 | 已定 |
| 005 | 确定性 | 同一引擎下确定；回放和哈希是一等能力；跨引擎一致性预留但不保证 | 已定 |
| 006 | 逻辑与表现的边界 | 只通过 Host 协议通信；生产用 Worker，调试用主线程，测试用 Node | 已定 |
| 007 | 渲染 | PixiJS v8 作为默认适配器，可替换 | 已定 |
| 008 | UI | DOM 叠加层 + Solid | 已定 |
| 009 | Schema | 自研 `t` DSL，作为单一事实源 | 已定 |
| 010 | 模块化 | Feature 竖切 + `schema.ts` 公共契约 + 写权限归属 | 已定 |
| 011 | 架构强制 | tsconfig 分层 + lint 插件 + dependency-cruiser + 运行时守卫 + schema 锁 | 已定 |
| 012 | 物理 | 不内置物理引擎；`kit-space` 提供碰撞检测 | 已定 |
| 013 | 内容 | 用 TS 编写，构建期校验并编译成 JSON | 已定 |
| 014 | 存档 | JSON + 版本迁移 + 黄金存档测试 + 读档透明 | 已定 |
| 015 | ECS 访问 | 列式 `C.field[e]` | 已定 |
| 016 | Model 写入 | 草稿代理，自动生成补丁 | 已定 |
| 017 | 仓库形态 | 公开仓库 lunego（框架、模板、样例、文档）+ 私有工作区（用 submodule 引入框架，外加游戏） | 提议 |
| 018 | 生成器 | 派生生成（`lunego gen`，含自动注册）+ 脚手架生成（`lunego new`，模板为唯一来源） | 提议 |
| 019 | 开源 | 开源；许可证用 MIT | 开源已定，许可证为提议 |
| 020 | 表现反馈 | Cue 是逻辑通向表现的唯一一次性反馈通道；持续的表现由状态驱动 | 提议 |
| 021 | 异步边界 | 一切异步结果都以 Command 进入 World | 提议 |
| 022 | 命令来源 | 命令信封带 `source`（玩家或系统通道） | 提议 |
| 023 | 关系 | Relation 进入内核，带反向索引和销毁策略 | 提议 |
| 024 | 渲染管线 | 固定的 7 个阶段 | 提议 |
| 025 | AI 桥 | `@lunego/mcp` 作为开发期 MCP 服务；devtools 协议按能被 MCP 暴露的标准设计 | 提议 |
| 026 | 容错 | 逻辑异常立即停机，生成崩溃报告（快照 + 命令日志）；表现异常局部隔离 | 提议 |

各条决策定稿后，在 `docs/adr/` 中展开为独立文件，写明背景、选项、结论和后果。

---

## 23. 待议问题

Q1–Q10 已经全部定下来，结论见 ADR 表。v0.3 新增的待议项：

**Q11 许可证**

- MIT（推荐）：最宽松，与 QFramework 一致。
- Apache-2.0：多一层专利授权，条款更长。

**Q12 Worker 模式的输入延迟**

- 推荐：默认用 Worker，对延迟敏感的游戏切换到 `main` 模式。
- 具体阈值等 `examples/platformer` 实测之后再定。

**Q13 私有游戏如何引用框架**

- git submodule（推荐）：框架版本可复现，CI 简单。
- 两个仓库并排放，用 `link:` 引用：更简单，但 CI 要同时检出两个仓库，而且框架版本不固定。

**Q14 文档站技术**

- VitePress（推荐）：轻量，以 Markdown 为主，中文社区用得多。
- Starlight（基于 Astro）：功能更多。

---

## 24. 实现顺序

终局边界从阶段 0 起就全部存在，后续阶段只是逐步填充实现。

| 阶段 | 内容 | 产出验证 |
|---|---|---|
| 0 地基 | monorepo、tsconfig 矩阵、lint 插件骨架与依赖规则、CI、`AGENTS.md`、规则文档框架、开源基础文件（LICENSE、CONTRIBUTING）、changesets。**规则先于代码** | CI 能拦住违规代码 |
| 1 内核 | schema DSL、ECS（含关系）、World、调度器、Command（信封与来源）/ Event / Cue / Query、RNG、序列化、哈希、快照；`lunego gen`（注册表、类型化 ID）；testkit 核心 | 内核的确定性测试 |
| 2 运行时与表现 | host（三种模式、协议、时间模型、加载、容错）、render-pixi（渲染管线）、vfx 基础、input、assets 管线 | `examples/swarm` 达到性能预算 |
| 3 状态与界面 | ui（含富文本、世界空间 UI）、storage（迁移、schema 锁、可靠性）、audio、本地化与字体、无障碍设置 | `examples/idle` |
| 4 Kits 首批 | 第 11 节列出的首批 Kit | `examples/tactics`；`examples/platformer`（实测输入延迟） |
| 5 工具化 | devtools（含特效试验台、热重载）、mcp、`lunego new` 与模板、`lunego sim`、Claude Code 集成、platform | 用 `lunego new game` 新建一个游戏并跑通 |
| 6 开源发布 | 文档站、llms.txt、npm 发布流水线、create-lunego，发布 0.1 | 外部用户能照着文档从零上手 |
| 之后 | 在私有工作区创建 `games/arpg`，开始第一款游戏 | — |

---

## 25. 风险清单

| 风险 | 说明 | 对策 |
|---|---|---|
| 范围过大 | 本文的范围接近一个完整的游戏框架，个人开发可能很长时间都做不到能用 | 严格按阶段推进，每个阶段都以一个能运行的样例收尾 |
| 类型系统性能 | schema DSL 的类型推导太深，会拖慢大型项目的类型检查和编辑器响应 | 推导保持浅层；基准测试中加入类型检查耗时；关注 TypeScript 原生编译器的进展 |
| Worker 延迟 | 见 Q12 | 实测后决定默认值；协议保证可以随时切换 |
| 自研内核的维护成本 | schema DSL 与 ECS 都是自己写 | 内核范围严格封闭；测试覆盖和基准测试先行 |
| 开源维护精力 | 见 20.4 节 | 自动化、范围明确、0.x 阶段降低承诺 |
| AI 规则失效 | 规则越多，越可能出现机器强制不到的漏洞 | 每条规则都必须写明强制手段；无法强制的单独标注，并由 `lunego-reviewer` 重点审查 |
