# @lunego/kit-items

**意图**：物品定义/实例、固定槽容器、装备槽规则、堆叠/拆分/移动/转移、序列化与 kit-loot/kit-stats 对接。具体物品内容与数值由游戏提供。

## API

- `ItemDef`：`id/slot/tags/maxStack/sockets`，通过内容注入。
- `ItemInstance`：稳定实例 id、contentId、quantity、rarity、RolledAffix、sockets、durability。
- `ItemIdentity`：调用方持有的唯一 ID 分配器；`sequence`/`splitSequence` 可 `toJSON`/`fromJSON` 恢复。所有 Inventory、Equipment、Stash 与地面掉落必须共享同一个实例。
- `ItemFactory`：确定性 `contentId#sequence` 实例 id，不读随机；接受注入的 `ItemIdentity`，也可 `fromJSON(snapshot, {catalog})`。
- `Inventory` / `Stash`：`add/remove/move/split/merge/transfer/capacity`；失败返回 `{ok:false,reason}`，先校验后写入。
- `Inventory.toJSON()` / `Equipment.toJSON()`：返回 `{ version:1, slots|items, identity }` 快照；`fromJSON({..., snapshot, identity? })` 使用快照计数器恢复，绝不从容器内最大后缀推断全局 factory。
- `split()` 使用共享 `ItemIdentity.splitSequence` 生成 `itemId.split.N`，存读档后继续 split/create 不会重复。
- `Equipment`：调用方注入槽位列表与 `EquipmentRules.canEquip`；`equip/unequip/get/toJSON`。
- `itemModifiers` / `itemAffixInstances`：将 loot 的 `RolledAffix` 映射为 kit-stats modifier，不生成数值。

## 存档快照

```ts
const identity = new ItemIdentity()
const factory = new ItemFactory({ catalog, identity })
const bag = new Inventory({ capacity: 8, catalog, identity })
const equipment = new Equipment({ slots, catalog, rules, identity })

const saved = {
  identity: identity.toJSON(),
  bag: bag.toJSON(),
  equipment: equipment.toJSON(),
}

const restoredIdentity = ItemIdentity.fromJSON(saved.identity)
const restoredBag = Inventory.fromJSON({
  capacity: 8, catalog, identity: restoredIdentity, snapshot: saved.bag,
})
```

跨容器恢复时把同一个 `identity` 传给每个 `fromJSON`；若共享计数器落后于快照，会提升到快照值。未知 content、快照重复 item id、factory/identity 不一致都会明确抛错。

## 不变量

- 无全局随机/时钟；实例 id 稳定可序列化。
- 堆叠比较 content/rarity/affixes/sockets/durability；不同实例不合并。
- 失败操作不修改容器；装备槽规则由调用方定义。
- 不 import `features/*`、`games/*`、`content/*`。
