# LuneGo 架构文档

> 状态：v0.5 · 2026-11-02 · 讨论中
>
> v0.5 把文档收敛为两部分：**核心架构**（从第一天起就是终局形态，必须遵守），以及**远期方向**（已经想清楚、留好了位置，到需要时才做）。v0.4 的完整展开版本保存在 git 历史中。

---

## 0. 怎么读这份文档

- **第 1–11 节**是核心架构：现在就按终局形态执行，以后加功能也不会改变。
- **第 12 节**说明框架如何和第一款游戏一起生长。
- **第 13 节**是远期方向：每一项都写明了现在已经遵守的约束，以及什么时候开始做。
- 标记：**[已定]** 已确认；**[提议]** 推荐方案，待确认；**[待议]** 需要讨论。
- 代码片段是 API 草图，用来固定"形状"，不是最终签名。

---

## 1. 定位与原则

### 1.1 定位 **[已定]**

LuneGo 是面向 Web 的 2D 游戏架构框架，对标 QFramework，以 MIT 许可证开源（github.com/lunemoe/lunego）。

它和作者的第一款游戏（像素动作 RPG）一起开发：游戏驱动框架生长，框架保证游戏代码不腐坏。框架本身不包含任何玩法。

### 1.2 头号原则：要么不做，要做就按终局形状做

代码腐坏通常来自两个相反的方向：

- **从小处凑合**：先写个临时实现，打算以后再重构。AI 会在临时接口上不断叠代码，越叠越难改。
- **过度设计**：为想象中的需求提前写接口和抽象。这些接口往往是错的，AI 照着错误的接口写代码，同样要返工。

LuneGo 的做法是把"形状"和"功能"分开处理：

- **形状一次到位**：分层、数据流、World 模型、模块结构、规则、测试方式，从第一天起就是终局形态。以后不管加多少功能，这些都不变。
- **功能按需生长**：工具包、联机、平台接入等功能，等游戏真正需要时再做。做的时候直接按终局形态实现，嵌进已有的形状里，不需要改动已有结构。
- **远期需求只留零成本约束**：已经能预见的需求，只在核心里留下几乎不花成本的约束（例如命令带来源字段、逻辑保持确定性），不提前为它们写代码。

### 1.3 设计原则

0. **最高原则：框架是唯一通道。** 游戏代码只能 import `@lunego/*` 和自己的 `schema.ts`/`content`；不能直接 import pixi.js、solid-js、DOM、WebAudio、Node 内置或裸平台包，也不能自建坐标/相机/锚点/tick/RAF/资源加载/存储。框架缺能力时先在框架补包/API，再写游戏。

1. **逻辑与表现分离。** 逻辑层是一个状态机：`(state, commands) → (state', events)`。它不知道画面、声音和 DOM 的存在。
2. **唯一写入路径。** 状态只能在 System 和 CommandHandler 里修改，外部只能发 Command。
3. **确定性。** 相同的初始状态加上相同的命令序列，必然得到相同的结果，因此可以回放，也可以逐 tick 校验。
4. **数据驱动。** 游戏规模的增长主要发生在内容数据里，而不是代码里。
5. **规则由机器强制。** 每条规则都有对应的检查手段；实在无法强制的规则，要明确标出来。
6. **按功能竖切。** 一个功能的契约、逻辑、表现、内容、测试、文档都放在同一个目录里。
7. **显式声明。** 读写哪些状态、依赖谁、收发哪些事件，全部要声明。声明本身就是文档。
8. **机械的交给工具，创造的交给 AI，合规交给校验。**

### 1.4 与 QFramework 的对应

| QFramework | LuneGo | 差异 |
|---|---|---|
| Architecture | `World` + `defineFeature` | World 同时承载 ECS 实体和全局状态 |
| Model | `Model`（全局状态）+ `Component`（实体状态） | 多了面向数据的 ECS，承载大量同类对象 |
| System | `System` | 有调度阶段和读写声明，执行顺序由调度器决定 |
| Command | `Command` | 是可序列化的数据，在 tick 边界执行 |
| Query / Event | `Query` / `Event`，另加 `Cue` | Cue 是专门发给表现层的反馈提示 |
| Controller | 表现层（渲染 / UI / 音频 / 输入） | 只读状态镜像，只能发 Command |
| BindableProperty | Model 镜像 + Solid signals | 自动同步，只读 |
| 规则靠约定 | 规则靠编译器、lint、运行时守卫、本地检查 | **根本差异** |

---

## 2. 总体结构

```
             LOGIC (pure TS, no DOM, deterministic)       VIEW (browser)
 ──────────────────────────────────────────────────────────────────────────
 Game        features/*/logic · content/*                 features/*/view
             app/world.ts (logic root)                    app/main.ts (view root)
 ──────────────────────────────────────────────────────────────────────────
 Framework   kits/* (promoted from games)                 render-pixi · vfx · ui · i18n · audio · input
             core                  ◄── host protocol ──►  host client
 ──────────────────────────────────────────────────────────────────────────
 Tooling     cli (gen / new / check / assets) · testkit · eslint-plugin
```

### 2.1 包与 kit 清单

| 包                       | 所在侧  | 职责                                                                                           |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `@lunego/core`          | 两侧共享 | schema DSL、ECS、World、调度器、Command / Event / Cue / Query、RNG 与数学库、序列化与哈希、Feature 机制。零依赖，不碰 DOM |
| `@lunego/host`          | 桥接   | 运行逻辑；逻辑与表现协议；时间模型；view loop（RAF/visibility/pause）、浏览器存档/按键/调试入口；存档读写、profile store（账号/角色槽/设置）、leaderboard |
| `@lunego/render-pixi`   | 表现   | 渲染绑定、插值、图层、相机/缩放、精灵/动画/背景、纹理注册表、瓦片地图、像素完美、资产帧消费 |
| `@lunego/vfx`           | 表现   | pixelfx 特效层（MIT，vendor）、Cue → 特效映射、俯视角地面投影、地面/前景分层                                           |
| `@lunego/ui`            | 表现   | Solid + solid-js/html DOM UI：bridge、主题 token、菜单栈/焦点、反馈、Tooltip、完整游戏控件、EffectOverlay、i18n/a11y 接入 |
| `@lunego/i18n`          | 表现/工具 | 消息表、插值、注入式复数、locale fallback、profile scope LocaleStore；不读 DOM/localStorage |
| `@lunego/input`         | 表现   | 设备 → 抽象动作 → Command；键盘/指针/手柄 browser adapter，PointerState 接受 renderer.viewport |
| `@lunego/audio`         | 表现   | Web Audio 总线、Cue 音效、可循环 music/ambient buffer、抖动与并发上限 |
| `@lunego/kit-space`     | 框架   | 静态瓦片碰撞、轴分离移动、圆/矩形范围查询、空间哈希 broadphase、A* 寻路；无玩法名词 |
| `@lunego/kit-stats`     | 框架   | 属性基础值、加法/乘法修饰器、词缀定义与聚合、上下限 |
| `@lunego/kit-ability`   | 框架   | 能力定义、资源消耗、tick 冷却、施法校验、泛型目标选择 |
| `@lunego/kit-loot`      | 框架   | 确定性权重抽取、稀有度、词缀 roll |
| `@lunego/kit-items`     | 框架   | 物品定义/实例、背包/仓库/装备槽、堆叠/拆分/移动/转移与序列化 |
| `@lunego/kit-progression` | 框架 | XP/等级曲线、点数、技能/被动前置图、分配/洗点与派生效果 |
| `@lunego/kit-quest`     | 框架   | 事件驱动任务状态机、目标计数/去重、前置/链/重复、奖励请求 |
| `@lunego/kit-dialogue`  | 框架   | 对话图、文本 key、条件、确定性 effects、分支/仅一次选择与任务回调 |
| `@lunego/kit-commerce`  | 框架   | vendor 买卖/修理/洗点、原子交易、配方制作、socket/gem |
| `@lunego/kit-encounter` | 框架   | spawn table、波次/阶段、预算、leash reset、难度缩放、掉落请求 |
| `@lunego/kit-zone`      | 框架   | zone/portal/waypoint 图、chunk 加载与实体预算、可注入地图生成、fog/minimap 状态 |
| `@lunego/kit-ai`        | 框架   | 感知/记忆、威胁/黑名单、utility、行为树、blackboard/group、leash/phase |
| `@lunego/kit-status`    | 框架   | 状态实例、绝对 tick 到期、stack/refresh、DoT/HoT、控制标记 |
| `@lunego/kit-combat`    | 框架   | 伤害管线、抗性、护甲/格挡/闪避/护盾、威胁入口 |
| `@lunego/kit-runtime`   | 框架   | 通用 ECS/World 适配层：组件/系统/命令/查询/内容 catalog，串联各 kit 机制；不含具体内容 |
| `@lunego/testkit`       | 工具   | testWorld、场景测试、确定性双跑、回放 |
| `lunego`（CLI）           | 工具   | gen / new game / check / assets（check、build、pack、import） |
| `@lunego/eslint-plugin` | 工具   | LuneGo 规则的 lint 实现，附带 dependency-cruiser 配置 |

`kits/` 当前包含上述 14 个通用 kit，均从第一款游戏的稳定实现泛化而来（第 12 节）；kit 之间只按显式声明依赖，不 import 游戏或 content。新包/kit 只在当前游戏确实需要时才创建。

### 2.2 依赖规则 **[已定]**

```
core                          不依赖任何包
host                          → core
render-pixi/ui/input/audio    → core, host
kits/*                        → core（kit 之间如有依赖，须显式声明且无环）
testkit/cli/eslint-plugin     → 以上任意包

游戏 features/*/logic          → core, kits, 其他 feature 的 schema.ts
游戏 features/*/view           → core, 表现层各包, 任意 feature 的 schema.ts

logic         ✗→  view
view          ✗→  logic 的实现（只能用 schema.ts）
feature       ✗→  其他 feature 的内部文件
packages/*    ✗→  任何游戏代码
```

---

## 3. 核心模型：World

### 3.1 概念总览

| 概念 | 是什么 | 谁能写 |
|---|---|---|
| Entity | 一个 ID，带代数（generation），用来防止悬挂引用 | System / Handler 负责创建和销毁 |
| Component | 挂在实体上的数据，由 schema 定义 | 声明了写权限的 System / Handler |
| Tag | 不带数据的组件 | 同上 |
| Model | 全局单例状态（货币、进度、设置……） | 同上 |
| System | 每个 tick 运行的逻辑，需要声明读写 | — |
| Command | 外部意图，本身是数据，在 tick 开头执行 | 表现层、输入、回放 |
| Handler | 处理某个 Command 的函数 | — |
| Event | 本 tick 发生的事实，供逻辑读取 | System / Handler 发出 |
| Cue | 发给表现层的一次性反馈提示，逻辑层读不到 | System / Handler 发出 |
| Query | 只读的派生计算 | — |
| Service | 逻辑侧可注入的确定性能力：`rng`、`content`、`time`、`math`、`log` | — |
| State | 应用级流程状态（启动 / 标题 / 游戏中……） | System / Handler 发起切换请求 |
| Prefab | 实体模板，属于内容数据 | 内容作者 |
| Feature | 把以上所有东西打包并注册的单位 | — |

### 3.2 Entity 与 Component

- **Entity ID**：32 位整数，由索引和代数组成。实体销毁后索引会被复用，但代数递增，所以旧引用会自动失效。
- **按列存储**：数值字段存成 TypedArray 列，其他字段存成普通数组列，访问写法统一为 `C.field[e]`。**[已定]**
  - 逻辑侧 tsconfig 关闭 `noUncheckedIndexedAccess`。
  - 实体 ID 只能来自查询结果，或经过存活校验的引用。
- **结构变更**：spawn、despawn、add、remove 在阶段内先缓冲，阶段末统一生效。
- **组件选项**：
  - `persist`：写进存档，取值 `'world'` 或 `'profile'`（见第 9 节）；
  - `replicate`：同步到表现层；
  - `writers`：写权限归属（见 6.3）；
  - `interpolate`：表现层做插值。
- **查询过滤**：支持 `with`、`without`、`added`、`removed`。

```ts
export const Position = defineComponent('Position', { x: t.f32, y: t.f32 }, {
  persist: 'world', replicate: true, interpolate: true,
})
export const Velocity = defineComponent('Velocity', { x: t.f32, y: t.f32 })
export const Frozen = defineTag('Frozen')
```

### 3.3 Model

- 全局单例状态，由 schema 定义，带初始值。
- 写入通过"草稿"进行，例如 `ctx.mutModel(Wallet).gold -= 10`。框架自动把修改记录成补丁。
- 补丁每个 tick 发给表现层，驱动 UI 镜像做细粒度更新。**[已定]**

### 3.4 System 与调度

每个 tick 依次经过以下阶段：

| 阶段 | 内容 |
|---|---|
| `commands` | 执行命令（框架内置） |
| `pre` | 时间、计时器、状态切换 |
| `update` | 游戏逻辑主体 |
| `post` | 结算、清理 |
| `flush` | 结构变更生效、封存事件、生成帧数据（框架内置） |

同一阶段内的执行顺序由调度器根据声明计算：

- 发出事件的系统排在读取它的系统之前。确实需要跨 tick 读取时，显式写 `{ prev: true }`。
- 显式的 `after` / `before` 约束优先；其余按系统名稳定排序，与注册顺序无关。
- 一个系统写组件 C、另一个读 C，却没有顺序约束时，给出警告；依赖成环直接报错。
- `runIf` 用于按状态启停系统。

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

开发模式下，System 一旦访问未声明的组件、模型或事件，会立即抛出带规则编号的错误。

### 3.5 Command

- **是数据**：可以序列化，命令日志本身就是回放。
- **边界校验**：进入时做 schema 校验，外部输入一律视为不可信。
- **执行时机**：每条命令绑定一个目标 tick，在该 tick 的 `commands` 阶段按顺序执行。
- **返回结果**：Handler 返回 `ok` 或 `rejected(reason)`，表现层拿到的是一个 Promise。
- **带来源**：命令装在信封里传递，格式为 `{ tick, seq, source, type, payload }`。`source` 标明来自哪个玩家（单人时固定为 0），或来自哪个系统通道（如资源加载）。这是为联机预留的零成本约束。
- **不嵌套**：Handler 不能再发 Command，需要复用的逻辑写成普通函数。
- **连续输入也是命令**：例如移动方向，由命令写入意图组件，再由 System 消费。逻辑侧的 AI 系统也可以写意图组件，所以自动战斗只是换了一个意图来源。

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

### 3.6 Event 与 Cue

- **Event** 是给逻辑看的事实，用过去式命名（`Died`、`ItemPicked`）。它不进存档，也不能被取消；需要可取消的流程，就用"请求事件 + 结算系统"实现。标记了 `replicate` 的 Event 会同步给表现层。
- **Cue** 是给表现层的一次性反馈提示，逻辑层读不到。逻辑只说明"发生了什么、在哪、有多强"，至于怎么表现，由表现层的映射决定（8.3 节）。
- **举例**："敌人死亡"是 Event，"在这里播放死亡特效"是 Cue。
- **ID 确定**：每个 Cue 都有确定性的 ID（tick、System、序号），方便去重和回放。

```ts
export const HitCue = defineCue('combat.hit', { at: t.vec2, power: t.f32 })
ctx.cue(HitCue, { at, power: 0.8 })
```

### 3.7 Query、Service 与 State

- **Query**：纯只读函数。逻辑侧同步调用 `ctx.call(Q, args)`，表现侧异步调用 `await game.query(Q, args)`。表现层不重复实现游戏规则，需要时一律通过 Query 获取。
- **Service**：只提供确定性能力。存储、网络、音频、真实时钟等平台能力都不给逻辑侧。
- **State**：`defineState('app', ['boot', 'title', 'playing', 'paused'])`，配合 `runIf` 以及 `onEnter` / `onExit` 使用。关卡不是内核概念，加载关卡就是根据内容数据 spawn 实体。

### 3.8 权限矩阵

| 角色 | 读状态 | 写状态 | 发 Event / Cue | 读 Event | 发 Command | 调 Query | 平台能力 |
|---|---|---|---|---|---|---|---|
| System | ✓ 需声明 | ✓ 需声明 | ✓ 需声明 | ✓ 需声明 | ✗ | ✓ | ✗ |
| Handler | ✓ 需声明 | ✓ 需声明 | ✓ 需声明 | ✗ | ✗ | ✓ | ✗ |
| Query | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| 表现层 | 只读镜像 | ✗ | ✗ | ✓ 已同步的 | ✓ | ✓ 异步 | ✓ |

- **写入许可来自三处**：状态定义 feature（owner）、状态定义处的 `writers: [...]`，以及写入方 feature 上的 `feature.writes: [StateDef, ...]`。后两者只在该 `WorldCatalog` 内生效，每个 World 独立计算，互不继承。
- **只声明不修改**：`feature.writes` 是注册期声明，不会改写 component/model 的 `options.writers`；同一个 StateDef 可以被多个 feature 的 `writes` 声明，实际允许集合是 owner ∪ writers ∪ featureWrites。
- **违规处理**：System/Handler 的 `writes` 不在允许集合内即抛 LG005；`feature.writes` 指向未注册状态则在注册期直接报错。

---

## 4. 运行时

### 4.1 Host 协议边界 **[提议]**

- 表现层只接收帧数据和状态镜像，只能发送命令。无论逻辑跑在主线程还是 Worker，协议都一样。
- **先在主线程运行。** 主线程性能不够时，通过一项配置切换到 Worker，游戏代码不用改。
- 逻辑代码的纯净（不碰 DOM）由 tsconfig 和 lint 保证，不依赖 Worker 隔离。

### 4.2 Tick 管线

```
 VIEW                                             LOGIC
 Input ─► actions ─► toCommands() ──┐
 UI ─────────────► game.send() ─────┴──Command──►  queue (tick, seq)
                                                  World.step()
                                                    1. commands   run handlers
                                                    2. pre        time, timers, state
                                                    3. update     feature systems
                                                    4. post       resolve, cleanup
                                                    5. flush      structural changes,
                                                                  seal events, build Frame
 Renderer ◄── interpolate ◄─┐                               │
 UI mirrors ◄── patches ◄───┼────────── Frame ◄─────────────┘
 Audio / VFX ◄── cues ◄─────┘
```

### 4.3 时间模型

| 模式 | 适用场景 | 机制 |
|---|---|---|
| `realtime` | 实时游戏 | 固定步长累加，渲染层插值 |
| `onDemand` | 回合制 | 只在收到命令时推进 |
| `fastForward` | 快进、补算 | 不渲染，分片全速推进 |

- **时间缺口**（后台标签被节流、离线后重新打开）：缺口小于 `maxCatchUp` 时自动追帧；超过时，调用游戏提供的钩子 `onTimeGap(gap)`，由游戏选择快进、跳过或自行结算。框架只提供机制，离线收益怎么算由游戏决定。
- **倍速、暂停、单步**是内置能力。

### 4.4 异步边界

逻辑层是同步的。资源加载等异步结果都以命令的形式进入 World（例如 `ContentLoaded`），并记入命令日志，所以加载快慢不影响回放。

### 4.5 出错处理

- **逻辑异常**：World 立即停止推进。开发模式下显示 System 名称、tick 和调用栈，并提供"导出回放"按钮。
- **表现异常**：只隔离出错的那个渲染绑定或 UI 组件，逻辑照常运行。

---

## 5. 确定性

- **禁用清单**：逻辑层禁止使用 `Math.random`、`Date`、`performance.now`、`setTimeout`、`async`/`Promise`、DOM、`Intl` 及依赖区域设置的 API，也禁止模块级可变状态。
- **数学函数**：`sin`、`cos`、`atan2`、`exp`、`pow` 等一律走 `@lunego/core/math`，用纯 JS 软件实现。这样跨引擎一致在原理上可行，是为联机预留的零成本约束；等真正做联机时，再加三引擎本地校验。
- **顺序确定**：查询按实体索引升序返回；排序比较函数必须是全序，相等时用实体 ID 决出先后。
- **随机数**：带种子的 PRNG，按名称分流，例如 `ctx.rng('loot')`、`ctx.rng('ai')`。各条流互不影响，RNG 状态也写进存档。
- **哈希与回放**：`world.hash()` 计算状态哈希。回放文件包含种子或初始存档、命令日志和周期性的哈希检查点，可以用来校验、二分定位第一个不一致的 tick，或者停在指定 tick 检查状态。
- **双跑**：测试时每个场景自动跑两遍并比对哈希，不确定性一出现就会被发现。
- **时间单位**：逻辑 `tick` 是无单位整数；`ctx.time.dt`、host `GameFrame.dt/elapsed`、`RenderSystem.sync(time)`、动画 `fps`（帧/秒）和 VFX `update(dt)` 都是秒。`kit-ability.cooldownTicks` 与 audio/VFX 的 Cue 去重使用 tick，不混用秒。
- **ViewClock**：`createViewLoop` 的 `elapsed` 来自 `GameFrame.elapsed`（tick×dt），`dt` 是本帧实际推进的模拟秒数；暂停、标签隐藏、倍速下都不会用墙钟污染动画/特效/音频。

---

## 6. Feature：唯一的模块单位

### 6.1 目录形状 **[已定]**

```
features/<name>/
├── README.md        # 契约：意图、公共接口、不变量、依赖（部分段落自动生成）
├── schema.ts        # 公共契约：组件、模型、事件、Cue、命令、内容类型
├── logic/
│   ├── systems/     # 一个文件一个 System（自动注册）
│   ├── handlers/    # 一个文件一个 Handler（自动注册）
│   ├── queries.ts
│   ├── rules.ts     # 本 feature 的领域函数（纯函数）
│   └── index.ts     # defineFeature(...)
├── view/
│   ├── render/  ui/
│   ├── cues.ts      # Cue → 特效、音效、震屏的映射
│   └── index.ts     # defineFeatureView(...)
├── content/
└── tests/
```

### 6.2 注册

```ts
export const HealthFeature = defineFeature({
  name: 'health',
  deps: [AdventureFeature],
  schema,                      // 来自 schema.ts
  registry,                    // 来自 _generated/registry.ts，由 lunego gen 生成
  invariants: [hpWithinMax],   // 开发模式下每个 tick 检查一次
})
```

### 6.3 通信与写权限

- **只能 import 对方的 `schema.ts`。** 可以读对方的组件和模型、读对方的事件、发出对方会监听的事件、调用对方的 Query。不能调用对方的 System 或内部函数。
- **`deps` 必须无环**，并且与实际的 import 关系一致。
- **写权限**：组件和模型默认只有定义它的 feature 能写；需要多方写入时，有两种显式声明：在定义处声明 `writers: [...]`（逐个状态列举允许写入的 feature），或在写入方 feature 上声明 `writes: [StateDef, ...]`（从 feature 的角度声明它要写别人拥有的状态）。`defineFeature({ writes })` 声明的每个状态必须已由某个 feature 注册，否则注册期报错；`WorldCatalog` 把两类声明合并进该 catalog 自己的 `featureWrites` / `allowedWriters`，所以不同 World 之间不会串用。其他 feature 想改变它，就发出请求事件，由拥有者结算。这样任何一个字段的写入者都可以列举出来。

### 6.4 Kit 也是 Feature

Kit 与游戏 feature 形状相同，只是位于框架的 `kits/` 目录、不含玩法。AI 只需要学会一种模块形状。

---

## 7. 数据与内容

- **Schema DSL** **[已定]**：同一份定义同时产出 TS 类型、列存储布局、序列化代码、校验逻辑和存档迁移检查。

  ```ts
  t.f32 t.i32 t.u8 t.u16 t.u32 t.bool t.vec2 t.str t.enum([...])
  t.entity t.ref(ContentType) t.asset('sprite') t.text          // t.text = 本地化键
  t.array(T) t.struct({...}) t.optional(T)
  ```

  类型集合按需扩充，但每加一种类型，都必须同时支持上述所有产出。
- **内容** **[已定]**：用 TypeScript 编写：`defineContentType` 定义 schema，`defineContent(Type, { id: value })` 声明值；`ContentRegistry.addPack(pack)` 校验并注册，`validateReferences()` 递归检查所有 `t.ref` 目标存在。`lunego gen` 扫描真实 `defineContent` 声明，生成带 `ContentId<Type>` 的 `ContentIds` 分组（排序使用代码点比较，不使用 `localeCompare`），`lunego check` 对缺失/重复/未知引用报 LG009。禁止使用魔法字符串。
- **Prefab**：`definePrefab(name, { Component: {...}, Tag: true })` 声明实体模板；`ctx.spawn(Prefab, overrides)` / `World.spawn(Prefab, overrides)` 做组件级浅合并并走同一套 schema 校验，产出与等价普通 spawn 相同的 hash。Prefab 可放入 content value。
- **资源**：原始文件放在 `assets/`（`.aseprite`、`.ldtk`、音频、字体）。构建管线用 Aseprite CLI 导出图集和动画，并把 LDtk 关卡导入为内容。`assets/manifest.json` 记录 pack/version/assets（文件、frameWidth/Height、columns/rows/frames、fps、anchor、animations）；`lunego gen` 生成 `features/_generated/assets.ts` 的类型化 ID/显示元数据/`AssetPack` hash，`lunego check` 校验文件存在、尺寸、帧范围、动画列和版本。
- **资源拆分**：对逻辑有意义的数据（动画帧时长、攻击判定帧、瓦片碰撞）进入内容包，纯视觉数据只给表现层。逻辑层永远不加载图片。

---

## 8. 表现层

### 8.1 渲染 **[已定]**

- **PixiJS v8**，只把它当渲染器用。不选 Phaser，因为它的 Scene/GameObject 体系会变成事实上的架构，与 LuneGo 冲突。
- **像素完美**：虚拟分辨率（如 480×270）、整数缩放、最近邻采样、相机像素对齐。相机跟随统一走 `CameraController`（居中、边界 clamp、zoom、pixelSnap），游戏不手算 `position.x - width/2`。
- **绘制顺序**：世界图层（背景 → 瓦片 → Y 排序的实体 → 前景）→ 世界后处理 → 整数放大 → 画布内 UI（血条、伤害数字）→ DOM UI。
- **显示类型**：`rect`、`sprite`（单纹理/子帧）、`animated`（帧表/fps/loop/显式 frame）、`background`；统一 anchor、flipX/Y、tint、alpha、pixelSnap。动画时间由 `RenderSystem.sync(source, time)` 显式传入，逻辑 tick 与渲染时钟分离。
- **资源**：`TextureStore` 以 id 管理 URL/ImageBitmap/Canvas/帧表，manifest 失败隔离，加载器可注入，`destroy()` 释放纹理；逻辑层不可见。显示尺寸只从 manifest/loader/帧表读取，`DisplaySpec.width/height` 仅是显式覆盖；VFX 尺寸只来自 effect meta。
- **图层常量**：render-pixi 的 `RENDER_LAYERS`（background→tiles→entities→foreground）是唯一顺序；VFX 的 `EFFECT_LAYERS`/`EFFECT_LAYER_RENDER_TARGET` 映射 ground→tiles、front→foreground；UI 的 `UI_LAYERS` 提供 overlay/modal z-index，模板不再自写魔法数字。
- **瓦片地图**：游戏提供 tileset + 瓦片索引/图层；框架负责帧切分、原点/间隙、`tiles`（实体后）与 `foreground`（实体前）图层、相机/缩放；地图数据不预设玩法。
- **渲染绑定**：声明"查询 → 显示对象"的对应关系，显示对象的创建、更新、回收和插值都由框架负责。`RenderSystem.anchorOf(entity,'feet'|'center'|'top', {binding|layer})` / `boundsOf(entity,{binding|layer})` 可按绑定名或图层取 body/血条等独立 bounds，游戏解析 Cue 时不再自行猜高度。
- **坐标单一来源**：`PixiAdapter.viewport` 导出 `worldToScreen`/`screenToWorld`/`camera`/`zoom`/`cssScale`/`pixelSnap`；Pixi 世界变换、pointer、VFX 都使用同一取整相机。指针直接 `setViewport(renderer.viewport)`。

```ts
export const spriteBinding = defineRenderBinding({
  query: [Position, Sprite],
  create: (view) => view.sprite(),
  update: (obj, view) => {
    obj.position.copyFrom(view.lerp(Position))
    obj.texture = view.frame(Sprite)
  },
})
```

### 8.2 UI **[已定]**

- **DOM 叠加层 + Solid**：`@lunego/ui` 用 `solid-js` + `solid-js/html`，不需要额外 JSX 构建链。游戏只能从 `@lunego/ui` 取受限原语 `createSignal/createMemo/createEffect/createRoot/onCleanup/html/createComponent`，不能直接 import solid-js。`createUiBridge(game)` 持有只读 `frame`/`models` signal，通过 host 的 `subscribeFrames` 更新；UI 只调用 `send`/`query`。
- **组件**：`UiRoot`/theme tokens、`Panel`（九宫格 border-image，无图退回 CSS）、`Bar`（hp/mp/xp/neutral）、`Button`、`Tabs`、`InventoryGrid`/`ItemSlot`、`Tooltip`、`SkillBar`（CD 遮罩）、`KeyHint`、`Modal`、`List`；完整游戏控件包括 `DragSource`/`DropTarget`/`SortableGrid`、`VirtualList`、`EquipmentSlots`、`TreeView`、`GraphView`、`Dialog`/`ChoiceList`/`PagedText`、`ShopRow`、`MinimapView`；全部只做展示与回调。
- **本地化**：`@lunego/i18n` 提供消息表、插值、注入式复数、locale fallback 与 profile scope `LocaleStore`；UI 文案接受 `TextValue = string | { key, params? }`，字符串是显式覆盖，`{ key }` 通过 `UiRoot({ i18n })` 的 resolver 或 `setUiTextResolver` 解析，缺 key 时保留 key。框架不内置译文/语言表。
- **菜单栈/焦点**：`UiMenuStack` 管理 push/pop/replace/current；只有栈顶 Modal 响应 Escape，`FocusScope` 负责 Tab trap、initialFocus 与关闭后焦点恢复；嵌套 Modal 不互相关闭。
- **反馈**：`ToastQueue`/`ToastHost` 提供限时队列、`aria-live`/可关闭条目；`LoadingOverlay` 支持进度、错误态、取消与 `aria-busy`。两者文案全部由游戏传入。
- **Tooltip**：默认 portal 到 body，`placeTooltip` 按 viewport 翻转/夹取；`aria-describedby`、键盘聚焦显示、Escape 关闭、指针长按显示；无框架色值/资产路径。
- **无障碍与 scale**：`UiRoot` 提供 `uiScale`、`reducedMotion`、`colorblind`、`contrast`，写入 `--lg-ui-scale`/`data-reduced-motion`/`data-colorblind`/`data-contrast`；CSS 变量与 `prefers-reduced-motion` 生效。新控件使用 roving focus、`aria-label`/`aria-describedby`/`aria-expanded`/`aria-selected`，并支持键盘/指针操作；`EffectOverlay` 在 reduced motion 下不执行 shake/flash。
- **资源无关**：九宫格/图标由游戏传入 URL；缺少资源时用纯 CSS/文字退化，不造假数据。`Panel.borderImage/borderSlice/borderWidth`、`ItemSlot.icon`、`SkillSlot.icon` 是资源注入点；框架不引用游戏资产路径。`mountUi(root, bridge, view)` 负责挂载、样式安装与销毁。
- **行为与可访问性归框架，美学归游戏**：框架规定组件行为、焦点/菜单栈、键盘与指针交互、数据绑定、主题 token 名称，以及焦点可见、`prefers-reduced-motion`、UI scale、colorblind/contrast 模式、最低对比度和资源注入点；调色板、字体、九宫格图、图标集、间距/密度、动效、装饰和文案由游戏通过 `UiTheme`/props 提供。框架不内置游戏美术、玩法名词或强制像素风；像素对齐/最近邻只是能力，不是风格要求。
- **主题与约束**：组件颜色、间距、字体只能通过 CSS 变量、props 或 `UiTheme`（框架拥有 token 名称，游戏全量覆盖）；`theme.ts` 只保留可被覆盖的中性 fallback。不得硬编码游戏资产路径，不得硬编码界面文案（本地化 key 由游戏提供；UI 已接入 resolver，缺省为空或 key）。
- **分工**：屏幕空间的面板用 DOM；跟随实体的世界空间 UI（血条、伤害数字）仍在画布内绘制。UI 不计算游戏规则。

### 8.3 Cue 的表现映射

```ts
export const combatCues = defineCueMap({
  [HitCue.id]: (c) => [
    vfx(Vfx.hitSpark, { at: c.at, scale: c.power }),
    sfx(Sfx.hit, { pitchJitter: 0.1 }),
    shake({ trauma: c.power * 0.3 }),
  ],
})
```

- **一次性与持续**：一次性反馈（命中、拾取）用 Cue；持续表现（燃烧时身上冒火）由状态驱动，表现层看到实体带着 `Burning` 组件，就挂上对应的特效。
- **统一入口**：所有反馈都经过这一层。以后要加画质档位、无障碍选项、特效数量上限，都只改这一处。
- 特效的具体能力（粒子、闪白、震屏、飘字……）按游戏需要逐步加入，加入方式就是往这张映射表里加新的效果类型。

### 8.4 特效库（pixelfx，俯视角适配）

- **来源**：`@lunego/vfx` vendor [pixelfx 0.3.0](https://github.com/patch-gg/pixelfx)（MIT，commit `a841596…`），保留 LICENSE/NOTICE 与 `THIRD_PARTY_NOTICES.md`。只取代码驱动的特效层：core 图（含横版 `act`/actor 骨架模块，`core/index.js` 会导出它们）原样 vendor，但加载时拒绝任何导出 `act` 的 effect，视图从不绘制 body/target。
- **只走 Cue**：`defineCueMap` 把每个 Cue 名映射为若干 `EffectRequest`；逻辑层不知道 pixelfx 的存在。种子由 Cue 的确定性 ID 派生，所有粒子抖动来自 pixelfx 自带的 seeded RNG，不使用 `Math.random`。
- **坐标契约**：`EffectRequest.x/y` 是世界坐标（默认脚底锚点）；`composeAll(out, cameraX, cameraY, zoom)` 输出视口像素；`PixiEffectRenderer.sync(frame, map, cameraX, cameraY, zoom)` 必须传 render-pixi 的相机/zoom；ground/front 两个 surface 各自只合成自己的层（`compose(layer)`），不会互相包含。命中/投射物用 `offsetX/offsetY` 或 `anchor:'center'` 指定身体中心，地面 AOE 保持脚底；offset 在 `projectGround` 之前应用。
- **俯视角**：禁用横版 body/target/act；`angle` 由朝向向量决定；地面特效按 `groundScaleY`/`skewX` 投影；锚点在实体脚下（`footOffset`）；`ground` 层在角色之后、`front` 层在角色之前。
- **协作**：`VfxSystem` 按脚下深度排序并输出 `ground`/`front` 两个像素缓冲；`CanvasEffectSurface` 用于透明叠加，`PixiEffectRenderer` 把两个缓冲挂到 render-pixi 的 `tiles`/`foreground` 容器。数量上限、帧池与 `destroy()` 由特效系统负责。

### 8.5 音频与输入

- **音频**：`@lunego/audio` 提供 Web Audio 总线（master/sfx/music/ui）、Cue 映射、种子化音高/音量抖动、并发上限、手势解锁与 `destroy()`；`MusicController` 用单个循环 buffer voice 管理 music 总线的播放/淡入淡出/stop/mute/volume，游戏不再使用 HTMLAudio。
- **输入**：设备 → 动作映射 → 游戏定义的 `toCommands(actions, pointer)` → Command。键盘支持改键；`PointerState.setViewport` 直接接受 render-pixi 的 `renderer.viewport`（cssScale/offset/camera/zoom/worldToScreen/screenToWorld），按下/释放边沿与按钮集合只存在于表现层。
- **上下文**：`ActionContext` 栈（gameplay/menu/dialogue/cutscene）决定 `Input.poll()` 是否产生游戏命令；与 `UiMenuStack` 深度订阅组合，菜单打开时游戏输入被阻断。
- **生命周期**：`releaseAll()` 在窗口失焦/`visibilitychange` 时释放所有键与指针；多 pointerId 独立跟踪，同一按钮不会被另一个指针覆盖；keyup 丢失不留下卡键。
- **设置**：`defineSettingsSchema`/`SettingsProfile` 提供 profile scope、版本、默认值、JSON 序列化/反序列化、迁移与 reset；`keybindConflicts`/`bindingConflict` 检测冲突；`KeybindCapture` 通过注入的键盘 target 捕获单个物理键，游戏不直接监听 DOM。host 的 `createBrowserSettingsStore` 负责持久化（主档 + `.bak`）。

---

## 9. 存档

- **世界存档与玩家档案分开** **[提议]**：世界存档记录世界的状态，玩家档案记录跟着玩家走的数据（角色、解锁内容）。由组件的 `persist: 'world' | 'profile'` 决定数据进哪一份。这是为联机预留的零成本约束：将来玩家可以带着自己的角色加入别人的世界。
- **快照内容**：schema 版本、`dt`、内容哈希、tick、RNG 状态、待执行命令、上一 tick 事件。  
  - `previousEvents` 是"事件不进存档"的唯一例外：跨 tick 的 `{ prev: true }` 监听需要它，恢复后必须与连续运行一致。  
  - 待执行命令按 `{tick, seq}` 写进存档，读档后仍在原 tick 执行；世界档与档案档用 `World.fromSnapshots({ world, profile })` 一次显式载入，两份必须同 tick、同实体表。  
  - `persist: null` 的状态不会进档；开发模式在首次快照时给出 `snapshot-ephemeral` 告警。
  - `ContentRegistry.setAssetPack({pack,version,hash})` 把资产包身份并入内容哈希；资产版本变化会让读档明确失败。
- **读档透明**："连续跑 N 个 tick"与"跑 N/2 个 tick、存档、读档、再跑 N/2 个 tick"必须得到相同的哈希。
- **迁移**：持久化 schema 带版本号和迁移函数。`schema.lock.json` 记录结构哈希，结构变了却没升版本，check 就会失败。这项从第一次对外测试开始启用，在此之前开发存档可以直接丢弃。
- **可靠性**：原子写入、保留最近几份备份；Web 平台申请持久化存储（`navigator.storage.persist()`），并支持导出存档文件。
- **多角色本地档**：host 的 `ProfileStore` 以账号 → 角色槽组织 profile 快照，单槽校验 scope/tick/schemaVersion/contentHash；空槽、损坏槽与正常槽在 `list`/`load` 中可区分。支持 create/save/load/select/delete 与账号包 export/import（可换账号导入，冲突需显式 overwrite），存储通过注入的 `ProfileStorage`，浏览器适配为 `createBrowserProfileStorage`。
- **成对读写**：`Game.saveGame()` 同时产出 world/profile 两份快照；`Game.loadGame({ world, profile })` 经 `World.fromSnapshots` 校验同 tick/同实体表/同内容后重建 viewSource，失败保留旧世界；成功读档会拒绝旧世界遗留的 pending 命令。回放使用合并后的 combined 快照，与单档 `Game.replay` 一致。
- **本地元系统**：`WorldClock`/`SeasonClock` 只由 tick 推导 day/week/season/year 与 daily/weekly reset 边界（不读 `Date`）；`LocalLeaderboard` 按 score 降序、tick 升序、角色 id 升序给出全序，单角色只保留最佳成绩，序列化数据随 profile 存放。跨账号云存档、拍卖、邮件等仍属联机范围。

---

## 10. 防腐体系

### 10.1 强制层级

1. **编译期**：逻辑侧 tsconfig 不含 DOM；最严格的 TS 配置；类型化 ID。
2. **Lint**：`@lunego/eslint-plugin` 检查禁用 API 和代码规范；LG016 按游戏/模板分区禁止平台直连；dependency-cruiser 检查依赖方向与 `@lunego/*` 唯一通道。
3. **注册期**：World 启动时校验依赖无环、调度无歧义、写权限归属。
4. **运行时（开发模式）**：访问未声明的状态就抛错，tick 之外写入就抛错，每个 tick 检查不变量。
5. **测试期**：确定性双跑、黄金回放、读档透明。
6. **提交前本地检查**：`pnpm check` 覆盖以上全部，外加生成文件是否最新的检查。本项目不使用 GitHub Actions/CI。
7. **受信回归门禁**：`pnpm verify` 在独立安装/构建的精确 Git tree 上验证当前测试，并在测试或夹具变更时复跑旧契约；关键路径必须检测既定故障，玩家验收只能通过输入/UI。Git hooks 使用工作区外的策略快照和精确 tree 的签名证据，策略与基线不随普通代码变更自动放宽。见 `tools/quality/README.md`。

### 10.2 规则表

每条规则都有编号和文档（`docs/rules/LGxxx.md`）。报错时给出规则编号、原因和修法。

| 编号 | 规则 | 强制手段 |
|---|---|---|
| LG001 | 逻辑层不依赖 DOM 和浏览器 API | tsconfig |
| LG002 | 逻辑层不使用非确定性 API（见第 5 节禁用清单） | lint（别名/解构/globalThis/计算属性/Reflect.get/eval；类型位置不误报）+ 双跑 |
| LG003 | System / Handler 必须声明读写与收发 | 运行时守卫 |
| LG004 | 状态只能在 System / Handler 中修改 | 运行时守卫 |
| LG005 | 写权限归属（`writers`） | 注册期校验 |
| LG006 | feature 只能 import 其他 feature 的 `schema.ts` | dependency-cruiser |
| LG007 | 逻辑与表现互不 import 实现 | tsconfig + dependency-cruiser |
| LG008 | 框架/core/host/testkit 不出现具体玩法语义；kit 只含通用机制，不 import 游戏/content | dependency-cruiser + `lunego check` + 审查 |
| LG009 | 不用魔法字符串引用内容或资源 | 类型化 ID + lint |
| LG010 | 持久化 schema 变更必须升版本并提供迁移 | `schema.lock.json` |
| LG011 | 表现层不实现游戏规则 | 审查（**无法完全由机器强制**） |
| LG012 | 禁止杂物目录（含 utils.ts）、模块级可变状态（含 const 容器后续 mutation）、超长文件 | lint |
| LG013 | 不写临时实现：禁止 `any`、`@ts-ignore`/`eslint-disable` 和"先这样"式的占位代码 | lint + 审查 |
| LG014 | 不手改 `_generated/` 下的文件 | `lunego gen --check` |
| LG015 | 新 feature 必须有 README 契约和测试；修改框架必须附变更记录 | check + 提交前本地检查 |
| LG016 | 游戏代码只能通过 `@lunego/*` 访问引擎/平台；禁止本地坐标/时间/资源/输入/音频/存储/渲染/UI/相机/锚点实现 | ESLint 分区 + dependency-cruiser + tsconfig + `lunego check` + 审查 |
| LG017 | 禁止空转实现、较大复制、无行为转发、不可达模块和测试旁路；旧契约、故障敏感度、真实输入验收与精确 tree 证据 | AST/模块图 + 隔离验证 + 受信基线 + 故障注入 + 本地 Git hooks |

### 10.3 生成器与模板

- **`lunego gen`（派生生成）**：
  - 扫描约定目录，生成注册表（新增 System 只需新建文件）；
  - 从内容、资源、Cue 定义生成类型化 ID；
  - 生成 feature README 中的自动段落和 `docs/generated/` 下的项目地图。

  生成物放在 `_generated/` 目录并提交进仓库；提交前运行 `pnpm check` 会重新生成并核对是否一致。
- **`lunego new game <name>`（脚手架）**：复制 `templates/game`、替换占位名，然后运行 gen。模板是唯一来源，本身也受本地 `pnpm check` 检查。
- **`lunego assets <check|build|pack|import>`（资产管线）**：校验 manifest/文件/尺寸/帧范围/动画列，构建图集，打包资产，导入 Aseprite/LDtk；生成类型化资源 ID 与 `AssetPack` hash，供 `lunego gen/check` 和存档内容哈希使用。

### 10.4 AI 上下文

- **`AGENTS.md`**（根目录，不超过 200 行）：项目是什么、核心规则、目录地图、常用命令、作业流程。`CLAUDE.md` 引用它。
- **每个 feature 的 `README.md` 契约**：意图、公共接口、不变量；其中接口段落自动生成。
- **`docs/generated/` 项目地图**：feature 列表、系统调度图、组件 / 事件 / 命令清单、写权限表。
- **`docs/glossary.md` 术语表**：防止同一个概念出现多个名字。
- **Claude Code**：编辑后由 hook 运行 `lunego check --changed`；子代理 `lunego-reviewer` 按规则表审查改动。

### 10.5 作业流程与约定

**AI 作业流程：**

1. 读 `AGENTS.md` 和项目地图；
2. 找到对应的 feature，读它的 README 契约；
3. 先写场景测试；
4. 用 `lunego new` 创建骨架，再实现；
5. 跑 `lunego check`，直到全部通过；
6. 契约有变化时更新 README。

**命名约定：**

- 组件和模型用名词（`Health`、`Wallet`）；
- 事件用过去式（`Died`）；
- 命令用祈使句，ID 带 feature 前缀（`shop.buy`）；
- System 命名为 `feature.verbNoun`；
- 文件名用 kebab-case。

**禁止清单：**

- System 直接调用另一个 System；
- 用 `setTimeout` 做游戏计时；
- 在逻辑组件里存放只给表现层用的数据（应改用 Cue 或状态驱动）。

---

## 11. 测试

| 层次 | 内容 | 工具 |
|---|---|---|
| 单元 | 领域函数、单个 System | Vitest + `testWorld()` |
| 场景 | 给定初始状态和命令，断言第 N 个 tick 的事件与状态 | testkit |
| 确定性 | 每个场景自动跑两遍，比对哈希 | testkit |
| 回放 | 黄金回放逐个检查点比对 | testkit |
| 读档透明 | 中途存档、读档不改变结果 | testkit |
| 性能 | 实体数与耗时的基准测试 | bench |

```ts
test('超额伤害致死', () => {
  const w = testWorld({ features: [HealthFeature] })
  const e = w.spawn({ Health: { current: 10, max: 10 } })
  w.emit(Damaged, { target: e, amount: 15 })
  w.step()
  expect(w.events(Died)).toEqual([{ entity: e }])
})
```

**性能目标**（中端笔记本，Chromium）：10,000 个活动实体时，单个逻辑 tick ≤ 4 ms；5,000 个精灵稳定 60 fps。**[提议]**

---

## 12. 框架与游戏一起进化

### 12.1 仓库与日常工作流 **[已定]**

模板就是第一款游戏：`templates/game` 是正式维护的 p9，包名 `@lunego/game-p9`，承担真实游戏交付与端到端框架验收；不是教学 Demo 或待替换的最小示例。直接在现有目录迭代，不创建另一份 p9。

框架、p9、正式素材、需求与设计参考统一在一个 Git 仓库维护；不再使用外层私有工作区、框架 submodule 或单独的 p9 仓库。根目录 `pnpm install` 即可安装完整工作区依赖，构建不读取仓库外路径。`art/p9` 保存原始素材完整归档，`research/poe` 保存设计参考，二者不参与游戏运行与发布。

```
lunego/
├── packages/                # 通用引擎与表现层
├── kits/                    # 通用玩法机制
└── templates/game/          # 当前 p9，第一款正式游戏与完整验收基准
    └── features/adventure/     # p9 内容、装配、成长和刷图规则
```

- 先修游戏暴露的框架问题并验证，再在同一 p9 上完善内容与像素刷图体验。
- 通用机制放 packages/kits，具体数值、随机装备策略、层数与奖励规则留在 p9。
- `workspace:*` 使框架与游戏接口同步；框架改动附契约、测试和变更记录。
- `templates/game/assets/manifest.json` 是正式素材唯一事实源，角色/地图/UI/音频必须实际消费生成的 Assets/AssetPack；用真实画面、声音和游玩流程验收，清除已替换的旧演示与占位资源。
- `lunego new game <name>` 只在明确创建其他独立游戏时复制可玩的 p9 起点；不把它用于替换当前 p9。

### 12.2 生长规则：框架与游戏并行演进

1. 游戏当前需要的通用能力，可以直接进入框架（`kits/` 或 `core`），不必先等第二处使用。
2. 进入框架时去掉玩法名词，补齐 README 契约、测试和变更记录。
3. 只实现当前真实需要的能力；形状按终局设计，但不为"将来可能需要"提前写接口。
4. 具体玩法数值、内容、策略和表现映射留在游戏；框架只提供可复用的机制。
5. 框架接口变化时，同一轮把游戏适配好。

| 例子 | 归属 |
|---|---|
| 空间哈希、静态碰撞、范围查询、A* | `kit-space`（已交付） |
| 属性、修饰器、词缀聚合 | `kit-stats`（已交付） |
| 能力定义、资源/冷却/目标选择 | `kit-ability`（已交付） |
| 权重抽取、稀有度、词缀 roll | `kit-loot`（已交付） |
| 物品/背包/仓库/装备槽 | `kit-items`（已交付） |
| XP/等级曲线、前置图、点数分配 | `kit-progression`（已交付） |
| 任务状态机、目标计数、奖励请求 | `kit-quest`（已交付） |
| 对话图、条件、effects、一次性选择 | `kit-dialogue`（已交付） |
| vendor 买卖/修理/洗点、原子交易、制作、socket | `kit-commerce`（已交付） |
| spawn table、波次/阶段、预算、leash | `kit-encounter`（已交付） |
| zone/portal/waypoint、chunk 加载、fog/minimap 状态 | `kit-zone`（已交付） |
| 感知、威胁、utility、行为树、blackboard/group | `kit-ai`（已交付机制；具体策略留在游戏） |
| 状态实例、到期、stack/refresh、DoT/HoT、控制标记 | `kit-status`（已交付） |
| 伤害管线、抗性、护甲/格挡/闪避/护盾 | `kit-combat`（已交付） |
| 具体技能数值、装备名、掉落概率、伤害公式、敌人策略 | 留在游戏 |

### 12.3 生长路线

每个里程碑结束时，游戏都能运行，框架也都处于终局形状。

| 里程碑 | 游戏能做到什么 | 框架随之长出什么 |
|---|---|---|
| M0 地基 | 一个能移动的方块；存档、读档、回放都能跑通 | core、host、render-pixi 基础、input、testkit、cli（gen / new / check）、lint 规则、AGENTS.md、模板 |
| M1 能打 | 移动、刷怪、碰撞、攻击、伤害数字 | 空间哈希、Cue 与基础特效、audio |
| M2 能成长 | 属性、技能、装备 | `kit-stats`/`kit-ability`/`kit-loot`/`kit-items`/`kit-progression`；UI 背包/装备/技能控件 |
| M3 能挂机 | 自动战斗、遭遇、状态与伤害结算 | `kit-ai`/`kit-encounter`/`kit-status`/`kit-combat`；AI 策略与数值仍留在游戏 |
| M4 能刷 | 掉落、任务、对话、商店、区域、本地化 | `kit-quest`/`kit-dialogue`/`kit-commerce`/`kit-zone`、`@lunego/i18n`、UI 完整游戏控件、CLI assets、profile store/leaderboard |
| 之后 | 联机、上 Steam | 见第 13 节 |

---

## 13. 远期方向：已留位置，需要时再做

| 方向                 | 现在已经遵守的约束                                                          | 什么时候做            | 要点                                                                                       |
| ------------------ | ------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------- |
| 联机（客户端联机、Steam 联机） | 命令带 `source`；逻辑确定且数学函数走软件实现；World 之外没有隐藏状态；世界存档与玩家档案分离；Cue 带确定性 ID | 核心玩法稳定后，决定做合作模式时 | 推荐锁步同步，加本地角色的表现预测；主机掉线时任意玩家可以接任；网页用 WebRTC，Steam 用 Steam Networking；届时新增 `net` 包和三引擎本地校验 |
| Worker 运行          | Host 协议边界                                                          | 主线程性能不够时         | 改配置即可                                                                                    |
| 桌面与 Steam          | 平台能力只在表现侧使用                                                        | 准备上架时            | 推荐 Electron：各平台都是同一个 Chromium，Steam Deck 上表现稳定，steamworks.js 成熟；新增平台抽象（成就、云存档、大厅）        |
| Devtools           | —                                                                  | M1 之后按需          | 实体检查器、命令日志、时间回溯、特效调参                                                                     |
| AI 桥（MCP）          | devtools 协议用可序列化的请求与响应                                             | 有了 devtools 之后   | 让 AI 直接连上运行中的游戏：查状态、发命令、截图                                                               |
| 本地化                | 逻辑层只产出本地化键                                                         | 做外文版时            | 字符串表、动态像素字体图集                                                                            |
| 无障碍                | 反馈全部走 Cue 映射层                                                      | 发布前              | 关闭震屏和闪烁、色盲模式、UI 缩放                                                                       |
| 开源社区               | 架构规则就是贡献规范                                                         | 框架发布 0.1 时       | 文档站（含 llms.txt）、create-lunego、npm 发布、CONTRIBUTING                                        |
| 回滚 / 权威同步          | 同联机                                                                | 有游戏需要时           | 回滚适合格斗类，权威同步适合需要防作弊的游戏                                                                   |

---

## 14. 决策摘要

| # | 议题 | 结论 | 状态 |
|---|---|---|---|
| 001 | 定位 | Web 2D 架构框架，对标 QFramework，与第一款游戏一起生长，框架不含玩法 | 已定 |
| 002 | 技术栈 | Web + TypeScript；PixiJS v8 渲染；DOM + Solid 做 UI | 已定 |
| 003 | 内核 | 自研逻辑内核：统一的 World（ECS + Model），Command 是唯一的外部写入入口 | 已定 |
| 004 | ECS 与数据 | 列式存储；自研 schema DSL；内容用 TS 编写、编译成 JSON；Model 草稿写入 | 已定 |
| 005 | 模块化 | Feature 竖切 + `schema.ts` 契约 + 写权限归属 | 已定 |
| 006 | 防腐 | 规则由机器强制（tsconfig、lint、注册期、运行时、测试、本地检查） | 已定 |
| 007 | 开源与仓库 | MIT；框架、第一款游戏 p9、素材与设计参考统一在一个仓库，无 submodule | 已定 |
| 008 | 头号原则 | 要么不做，要做就按终局形状做；远期需求只留零成本约束 | 提议 |
| 009 | 确定性 | 逐位确定、可回放；数学函数走软件实现，为跨引擎一致留路 | 提议 |
| 010 | 运行位置 | 先在主线程运行，协议边界不变，可切换到 Worker | 提议 |
| 011 | 表现反馈 | 一次性反馈用 Cue，持续表现由状态驱动 | 提议 |
| 012 | 存档 | 世界存档与玩家档案分开 | 提议 |
| 013 | 生成器 | `lunego gen`（注册表、类型化 ID、文档）+ `lunego new game`（模板）+ `lunego assets`（manifest/图集/导入/打包） | 已定 |
| 014 | 生长方式 | 框架与游戏并行演进：当前需要的通用能力直接进框架，去玩法名词、补契约/测试；只做当前需要 | 已定 |
| 015 | 特效 | pixelfx 作为 `@lunego/vfx` 特效层；只取 Cue 驱动的像素特效，俯视角投影与分层显式 | 已定 |
| 016 | 存档透明 | 快照记录 dt/contentHash/待执行命令；`previousEvents` 例外；世界档+档案档显式合并载入 | 已定 |
| 017 | 表现管线 | 精灵/动画/背景/瓦片地图/纹理注册表；渲染时钟显式传入；指针输入与音频总线各自独立 | 已定 |
| 018 | UI | Solid + solid-js/html，DOM 叠加层；只读 bridge + 主题 + 完整游戏控件 + i18n/a11y | 已定 |
| 019 | 框架唯一通道 | 游戏只 import @lunego/* 与自己 schema/content；平台/引擎能力由框架 API 提供，缺能力先补框架 | 已定 |
| 020 | 资产元数据 | manifest 是资产/显示元数据的唯一来源；gen 生成 typed IDs+AssetPack hash，内容哈希/存档检测版本 | 已定 |

---

## 15. 风险

| 风险        | 对策                         |
| --------- | -------------------------- |
| 边做游戏边过度抽象 | 只实现当前真实需要；形状终局但不预写想象接口 |
| 玩法渗入框架    | kit 只收机制；依赖方向由工具强制，框架里禁止出现玩法名词 |
| 自研内核的维护成本 | 内核范围封闭，测试和基准先行             |
| 规则机器强制不到  | 每条规则写明强制手段，无法强制的单独标注并重点审查  |
