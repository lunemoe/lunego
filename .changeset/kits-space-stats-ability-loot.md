---
"@lunego/kit-space": minor
"@lunego/kit-stats": minor
"@lunego/kit-ability": minor
"@lunego/kit-loot": minor
---

Add the first framework kits, promoted from p9's stable implementations
without gameplay nouns:

- kit-space: tile collision, axis-separated movement, circle/AABB range queries,
  deterministic spatial hash.
- kit-stats: stat definitions, additive/multiplicative modifiers, affix
  aggregation and clamping.
- kit-ability: ability definitions, tick cooldowns, resource casts and generic
  none/point/direction/nearest targeting.
- kit-loot: deterministic weighted picks, rarity and affix rolls driven by
  RngStream.

Architecture now states that framework and game evolve in parallel: current
generic needs enter the framework directly, with contracts/tests, while
gameplay values and strategy stay in the game.
