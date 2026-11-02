# @lunego/kit-items

**意图**：物品定义/实例、固定槽容器、装备槽规则、堆叠/拆分/移动/转移、序列化与 kit-loot/kit-stats 对接。具体物品内容与数值由游戏提供。

## API

- `ItemDef`：`id/slot/tags/maxStack/sockets`，通过内容注入。
- `ItemInstance`：稳定实例 id、contentId、quantity、rarity、RolledAffix、sockets、durability。
- `ItemFactory`：确定性 `contentId#sequence` 实例 id，不读随机。
- `Inventory` / `Stash`：`add/remove/move/split/merge/transfer/capacity`；失败返回 `{ok:false,reason}`，先校验后写入。
- `Equipment`：调用方注入槽位列表与 `EquipmentRules.canEquip`；`equip/unequip/get/toJSON`。
- `itemModifiers` / `itemAffixInstances`：将 loot 的 `RolledAffix` 映射为 kit-stats modifier，不生成数值。

## 不变量

- 无全局随机/时钟；实例 id 稳定可序列化。
- 堆叠比较 content/rarity/affixes/sockets/durability；不同实例不合并。
- 失败操作不修改容器；装备槽规则由调用方定义。
- 不 import `features/*`、`games/*`、`content/*`。
