---
"@lunego/ui": minor
"@lunego/audio": patch
"@lunego/host": patch
---

Add `@lunego/ui`: Solid + solid-js/html DOM UI with a read-only frame/models
bridge, theme tokens, nine-slice panels, animated bars, buttons, tabs,
inventory grid/slots, tooltips, skill cooldown bar, key hints, modal and list.
The host exposes `subscribeFrames` for view adapters.

Fix `@lunego/audio` in Chromium: the Web Audio wrapper now maps each wrapped
node back to its real `AudioNode` before calling `connect`, instead of passing
the wrapper object into the overloaded native method. A Playwright probe proves
unlock reaches `running` and a cue produces a voice.
