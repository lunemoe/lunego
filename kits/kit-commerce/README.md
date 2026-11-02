# @lunego/kit-commerce

**意图**：vendor 买卖/修理/洗点、原子交易、配方制作、socket/gem。价格、库存、配方、物品定义与数值全部由调用方注入。

## API

- `CommerceWallet`：只有 `gold` 的调用方状态。
- `Vendor`：
  - `buy(buyer, slot, wallet, {offer?, questStatus?, quantity?})`：先校验金币/任务条件，再转移库存，最后扣款。
  - `sell(buyer, slot, wallet, quantity?)`：先转移物品，再加金币。
  - `repair(item, amount, wallet)`：纯返回新 durability，按调用方价格扣款。
  - `respec(wallet, cost, respec)`：回调成功后才扣款。
- `craft(recipe, inventory, factory, {rng?})`：
  - 输入/输出/条件由 recipe 注入；先在克隆 Inventory 上验证并试放，再提交。
  - `createOutputs(rng, factory)` 可使用注入 `RngStream`，不读全局随机。
- `socketGem(item, socketIndex, gemContentId, catalog)`：返回新实例，不改原实例；socket 数量/空位校验。

## 不变量

- 失败交易不扣金币、不移动物品；库存/容量失败原样返回。
- 不读 `Math.random`/`Date`/Promise；不 import `features/*`、`games/*`、`content/*`。
- 任务可用性通过 `QuestStatus` 回调接入 kit-quest。
