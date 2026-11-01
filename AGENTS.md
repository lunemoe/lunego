# LuneGo

面向 Web 的 2D 游戏架构框架：逻辑是确定性的状态机，表现层只读镜像并发命令。

- 公开仓库：github.com/lunemoe/lunego，MIT。
- 第一款游戏代号 p9，Hero Siege 式俯视角 ARPG，先与框架一起生长。
- 架构事实源：`docs/architecture.md`。规则清单：`docs/rules/`。

当前仓库只包含已实现并测试的 M0 内核包；`host`、`render-pixi`、`ui`、`input`、`audio`、`cli` 留到后续批次。

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
packages/eslint-plugin/  LG002 / LG012 / LG013 的可执行规则
packages/testkit/    testWorld、确定性双跑、读档透明、黄金回放
```

`features/*`、`kits/*` 是后续游戏与 kit 的正确位置，当前不创建占位文件。

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
| `pnpm depcruise` | 依赖方向检查 |
| `pnpm check` | build + lint + depcruise + test |

## AI 作业流程

1. 读本文件、`docs/architecture.md` 的相关章节、目标 feature 的 README 契约。
2. 先写场景测试，再实现；不要在临时接口上叠代码。
3. 改契约时同步改 schema、测试、README 与 changeset。
4. 提交前跑 `pnpm check`；框架改动附带变更记录。
5. 只通过 `schema.ts` 使用其他 feature；不调用其他 feature 的 System / Handler / 内部函数。

## 规则速查

LG001 DOM 隔离 · LG002 确定性 · LG003 声明 · LG004 写入路径 · LG005 写权限 · LG006 feature 边界 · LG007 逻辑/表现分离 · LG008 框架无玩法 · LG009 类型化 ID · LG010 schema 版本 · LG011 表现层规则（人工） · LG012 无杂物/无模块级可变状态/文件上限 · LG013 无临时实现 · LG014 不改生成物 · LG015 feature 契约与变更记录。
