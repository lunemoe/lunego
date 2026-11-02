# @lunego/kit-combat

**意图**：通用伤害管线、抗性、护甲/格挡/闪避/护盾和威胁入口。具体伤害类型、数值与技能内容由游戏提供。

## 公共接口

- `DamagePacket`：`{ amount, type, source?, tags? }`。
- `DamageTarget`：health/shield/armor、dodge/block、resistances、resistanceCap、kit-status controls。
- `resolveDamage(packet, target, { rng? })`：固定阶段顺序：
  `dodge → block → armor(flat) → resistance(0..cap) → shield absorb → health/death`。
- `DamageResult`：各阶段中间值、absorbed/applied、new health/shield、dead。
- `addDamageThreat(threatTable, source, amount)`：复用 kit-ai 的 `ThreatTable`。

## 契约

- kit-status 的 control 标记通过 `controls` 传入（是否禁止行动由游戏决定）。
- kit-ability 的 `resolveTargeting` 结果可构造 `DamagePacket`；本 kit 不依赖具体技能。
- RNG 只接受注入的 `RngStream`；有 dodge/block 概率但未注入时明确抛错。
- 不 import `features/*`、`games/*`、`content/*`；不含具体内容/数值。
