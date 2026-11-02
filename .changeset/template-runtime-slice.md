---
"@lunego/kit-runtime": minor
"@lunego/input": patch
---

Template slice on the generic runtime, plus spawn/buy commands.

- `kit-runtime`: new `SpawnActor` command and `ActorSpawned` event (emitted by both
  SpawnActor and encounter starts) so presentation can attach renderable data on
  spawn instead of polling; new `BuyItem` command (vendor + slot) with atomic
  gold/stock/inventory validation. Encounter starts also emit `ActorSpawned`.
- `templates/game`: the reference game is rebuilt on `@lunego/kit-runtime` +
  `@lunego/i18n` - motion feature keeps only `Renderable`/`CharacterProfile`, a
  `demo.presentation.renderable` system reacts to `ActorSpawned`, view code moves to
  `src/view/{render,ui}.ts` and text to `src/i18n.ts`. Content ids are neutral
  (`demo.player`, `demo.foe`, `demo.crate`, `demo.strike`) and schema is now 8.
- `e2e`: new `demo.spec.ts` drives the template through UI commands (attack, pickup,
  inventory, quest, dialogue) and asserts world + profile persistence; existing
  ui/vfx specs follow the new page surface.
- `input`: a disconnected gamepad no longer feeds zeroed axes into the action layer,
  which used to cancel keyboard-held movement actions; covered by a gamepad test.
