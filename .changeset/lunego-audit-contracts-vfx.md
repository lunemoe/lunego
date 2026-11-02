---
"@lunego/core": minor
"@lunego/host": patch
"@lunego/render-pixi": patch
"@lunego/testkit": patch
"@lunego/eslint-plugin": patch
"@lunego/vfx": minor
---

P0/P1 audit fixes: packed-id component views, internal capability subpath,
command rejection on handler failure, LG002/LG012/LG013 coverage, snapshot
dt/content/pending-command transparency and combined scope loading, event
freezing, query declaration guards and contextual runtime errors.

Contract shape: event `replicate`, `defineState` with onEnter/onExit, feature
`registry`, `ctx.math`/`ctx.log`, dev schema validation for writes.

Host: `Game.load` now rebinds the render view source to the restored world and
clears interpolation history; `SchemaValue` strips readonly so `ctx.mutModel`
fields are writable by contract.

New `@lunego/vfx` package: vendored pixelfx 0.3.0 (MIT) with explicit top-down
projection, cue-driven playback, ground/front layers, deterministic seeds,
effect caps and Pixi/canvas renderers.
