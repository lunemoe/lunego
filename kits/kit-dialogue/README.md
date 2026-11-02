# @lunego/kit-dialogue

**意图**：静态对话图、文本 key、条件、确定性 effects、分支/仅一次选择和任务回调；不存剧情内容或瞬态文本。

## API

- `DialogueNode` / `DialogueChoice`：`textKey`、`next`、`conditions`、`effects`、`once`。
- `DialogueGraph`：构造期校验重复/未知节点和循环，拒绝有向环。
- `DialogueRunner`：
  - `start(id)`、`choose(choiceId)`、`current`、`view()`
  - 条件：flag、quest status、counter（eq/gte/lte）
  - effects 按节点→选择定义顺序触发 `DialogueHooks.onEffect`，不修改任务/背包
  - `once` 选择只成功一次；不可用选择仍出现在 view 中并标记 `available:false`
  - `serialize()` 返回 `{ version:1, current, used }`；`restore(snapshot)` 恢复当前节点与已用 once 选择，未知节点/选择明确抛错
- 任务钩子通过 `DialogueEffect {kind:'quest'}` 回调接入 `kit-quest`。

## 不变量

- 定义只含本地化 key，不含瞬态 UI 文本/资产。
- 读档后 once 选择仍不可重复；快照不静默丢弃未知引用。
- 不读随机/时钟；无 Promise。
- 不 import `features/*`、`games/*`、`content/*`。
