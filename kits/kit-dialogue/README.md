# @lunego/kit-dialogue

**意图**：静态对话图、文本 key、条件、确定性 effects、分支/仅一次选择和任务回调；不存剧情内容或瞬态文本。

## API

- `DialogueNode` / `DialogueChoice`：`textKey`、`next`、`conditions`、`effects`、`once`。
- `DialogueNode.hub`：标记可回边的 hub/返回节点。
- `DialogueGraph`：构造期校验重复、未知边与从入口节点不可达的节点；有向环必须包含至少一个 `hub` 节点，普通环仍拒绝。无入边节点视为入口，纯环图缺少入口会明确报错。
- `DialogueRunner`：
  - `start(id)`、`choose(choiceId)`、`current`、`view()`
  - 条件：flag、quest status、counter（eq/gte/lte）
  - effects 按节点→选择定义顺序触发 `DialogueHooks.onEffect`，不修改任务/背包
  - `once` 选择只成功一次；不可用选择仍出现在 view 中并标记 `available:false`
  - `serialize()` 返回 `{ version:1, current, used }`；`restore(snapshot)` 恢复当前节点与已用 once 选择，未知节点/选择明确抛错
  - `maxSteps`（默认 256）限制一次对话内成功的选择次数；超过时抛确定性错误且不改变当前节点，`start`/`restore` 重置计数
- 任务钩子通过 `DialogueEffect {kind:'quest'}` 回调接入 `kit-quest`。

## 不变量

- 定义只含本地化 key，不含瞬态 UI 文本/资产。
- 读档后 once 选择仍不可重复；快照不静默丢弃未知引用。
- hub 回边与 once 可共存；循环保护不写入快照，读档后按新对话预算计数。
- 不读随机/时钟；无 Promise。
- 不 import `features/*`、`games/*`、`content/*`。
