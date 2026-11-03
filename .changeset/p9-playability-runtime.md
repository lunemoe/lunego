---
"@lunego/kit-runtime": minor
"@lunego/host": patch
"@lunego/input": patch
"@lunego/render-pixi": patch
"@lunego/ui": patch
"@lunego/vfx": minor
---

Repair framework blockers exposed by playing the first game p9 in templates/game.

- Runtime: directional movement uses actor speed; dead actors stop; player and AI abilities share range, line-of-sight and persisted cooldown gates. Damage consumes shields, uses resistance/RNG and emits death once. Drops have world positions, optional pickup range and same-tick claim protection. Equipment swaps and healing consumables are atomic. Encounters advance and complete, preserve transition state, and respect deferred spawn visibility.
- Host: honor the configured seed, isolate view subscriber errors from simulation, keep presentation time monotonic across world loads, and persist world/profile as a paired storage value.
- Input: preserve simultaneous keyboard/gamepad sources and support canvas-scoped pointer capture.
- Renderer/UI/VFX: fit small viewports, fix the circular health-bar height token, and clear session effects without destroying their renderer.
- p9 remains in templates/game. Scenario and browser regressions cover movement, combat, loot, menus, saves, wave completion, defeat and restart. Schema version is 14; older saves are not silently accepted.

- Runtime additions required by the grind loop: area abilities, atomic inventory sales, explicit hook read declarations and typed ground-item metadata.
- The existing p9 now has repeatable floors, retained progression/equipment, difficulty scaling, deterministic rarity/affix rolls, vendor disposal/supplies, revival and framework-driven pixel animation. Two-floor scenarios and browser continuation verify the loop.
