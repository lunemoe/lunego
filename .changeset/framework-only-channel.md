---
"@lunego/eslint-plugin": minor
"lunego": minor
"@lunego/host": minor
"@lunego/input": minor
"@lunego/ui": minor
"@lunego/vfx": patch
"@lunego/audio": patch
"@lunego/render-pixi": patch
---

Add LG016: game/template code may only use @lunego/* and its own
schema/content; platform imports, globals, local camera/anchor math and
hard-coded binding sizes are rejected by ESLint, dependency-cruiser and
`lunego check`.

Provide the missing compliant APIs: createViewLoop and browser save/key/debug
adapters in host; attachBrowserInput; UI createUiSignal + EffectOverlay;
renderer runtime canvas and container selectors; vfx mounted canvas surface;
audio looping buffer sources. The template now uses these APIs end to end.
