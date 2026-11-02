---
"@lunego/kit-items": minor
"@lunego/kit-status": minor
"@lunego/kit-ai": minor
"@lunego/kit-quest": minor
"@lunego/kit-dialogue": minor
"@lunego/kit-commerce": patch
"@lunego/core": patch
"@lunego/host": patch
"@lunego/render-pixi": patch
---

Persistence contracts for game systems.

- `kit-items`: `ItemIdentity` is the caller-owned id allocator (`sequence`/
  `splitSequence`, `toJSON`/`fromJSON`); `ItemFactory`, `Inventory`, `Equipment`
  and `Stash` take the same instance. `Inventory.toJSON`/`Equipment.toJSON` return
  `{ version: 1, slots|items, identity }`, and `fromJSON({ snapshot, identity })`
  restores counters instead of inferring them from the largest suffix; `split()`
  uses `itemId.split.N` so restores cannot duplicate ids. Unknown content,
  duplicate item ids and identity/factory mismatches throw.
- `kit-status`: `toJSON`/`restore(snapshot, defs, stats)` with version and
  unknown-status validation, re-applying modifiers through kit-stats.
- `kit-ai`: brain state serializes threat tables, blackboards and decisions;
  perception rebuilds from the restored tables.
- `kit-quest`: quest log split into `types`/`snapshot`/engine with
  `toJSON`/`fromJSON` (statuses, per-objective counts, unique keys, world day).
- `kit-dialogue`: dialogue state snapshots keep the current node, visited set and
  variables; `kit-commerce` follows the new inventory snapshot shape.

Performance baseline and rendering reuse.

- `bench/run.mjs` plus the root `bench` script measure 10k entities / 5k sprites
  (step, hash, query, interpolation, host step, render sync, tilemap build,
  scroll-into-culled tiles, frame lookup) and print p50/p95 plus heap deltas.
- `core`: `StateHasher` moves 64-bit FNV-1a off BigInt onto exact hi/lo integer
  math, and entity tables hash through a flag array instead of two maps/sets.
- `render-pixi`: tilemap culls to the camera view (510 of 40k tiles draw at the
  benchmark camera) and `RenderSystem` reuses bindings/containers across frames
  instead of rebuilding.
- `host`: `GameFrame.entityCount` reads `World.entityCount` instead of allocating
  a query result each frame.
