---
"@lunego/eslint-plugin": minor
"lunego": minor
"@lunego/host": minor
"@lunego/input": minor
"@lunego/ui": minor
"@lunego/vfx": patch
"@lunego/audio": minor
"@lunego/render-pixi": minor
"@lunego/core": patch
---

Add LG016: game/template code may only use @lunego/* and its own
schema/content; platform imports, globals, local camera/anchor math and
hard-coded binding sizes are rejected by ESLint, dependency-cruiser and
`lunego check`; logic roots are type-checked without DOM libs, and game
packages depend on the local `lunego` CLI. `RenderSystem` gains a
`CameraController` for follow/clamp/zoom/pixel-snap, replacing hand-written
camera math in the template.

Provide the missing compliant APIs: createViewLoop and browser save/key/debug
adapters in host; attachBrowserInput; UI createUiSignal + EffectOverlay;
renderer runtime canvas and container selectors; vfx mounted canvas surface;
audio looping buffer sources. The template now uses these APIs end to end. UI re-exports the restricted Solid
primitives; audio adds MusicController; RenderSystem supports per-binding/layer
bounds; gen emits typed asset IDs/display metadata/AssetPack hash from
assets/manifest.json; ContentRegistry includes asset pack identity in its
fingerprint; ViewClock uses simulation time.
