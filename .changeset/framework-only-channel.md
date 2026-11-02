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

Add same-tick state transition chaining with a 32-step guard and implicit
self-state writes in hooks; fix IEEE edge cases for atan2/pow, large trig
argument reduction and subnormal exp; include pending commands/nextSeq and
command send time in hashes/replays; pass ContentRegistry to replay; isolate
render binding failures; reject pending commands on Game destroy/load; harden
browser saves with backup, export/import and persistence requests. UI now
documents behavior/a11y ownership, exposes theme tokens for all neutral
colors/spacing and removes hardcoded game copy; `lunego new` creates an
external workspace mirror so empty-directory installs and checks are real.

Batch 1 UI/input foundations: UiMenuStack/FocusScope with nested Modal focus
trap/restore, ToastQueue/ToastHost, LoadingOverlay, portal/flip Tooltip,
ActionContext and input release/multi-pointer handling, profile-scoped
settings/keybinds with KeybindCapture and browser settings store, plus
UI scale/reduced-motion and reduced shake/flash.
