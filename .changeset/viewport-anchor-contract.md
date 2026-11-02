---
"@lunego/core": patch
"@lunego/render-pixi": minor
"@lunego/input": minor
"@lunego/vfx": patch
"@lunego/audio": patch
"@lunego/ui": patch
---

Export the authoritative `ViewportTransform` from render-pixi
(`worldToScreen`, `screenToWorld`, `camera`, `zoom`, `cssScale`, `pixelSnap`)
and expose `PixiAdapter.viewport`; camera/pointer/VFX now share one rounded
camera transform. PointerState accepts the renderer viewport directly.

RenderSystem gains `boundsOf(entity)` and
`anchorOf(entity,'feet'|'center'|'top')`, using adapter-measured display bounds
so games stop guessing sprite heights when resolving Cues. Camera math now lives
in core's viewport-math and is shared by render-pixi and vfx; layer/z-index
constants and tick/second units are documented and centralized. Audio cue
dedupe accepts a rewound host tick and exposes stopAll for reload.
