# LuneGo

LuneGo 是一个面向 Web 的 2D 游戏架构框架：逻辑层是确定性的状态机，表现层只读状态并发命令。它与第一款游戏（代号 p9，Hero Siege 式俯视角 ARPG）一起生长。

- 架构：[`docs/architecture.md`](docs/architecture.md)
- 规则：[`docs/rules/`](docs/rules/)
- AI 作业说明：[`AGENTS.md`](AGENTS.md)

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm check
```

当前实现：`@lunego/core`、`@lunego/eslint-plugin`、`@lunego/testkit`。`host`、`render-pixi`、`ui`、`input`、`audio`、`cli` 在后续批次按终局形状加入。

MIT License.
