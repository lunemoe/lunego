---
"@lunego/render-pixi": minor
"@lunego/input": minor
"@lunego/audio": minor
---

Render pipeline: DisplaySpec now supports rect, sprite, animated spritesheets and
backgrounds; texture store with manifest loading, failure isolation and
disposal; runtime canvas textures; tilemap layers with tileset frames, origin and
foreground layers; camera zoom; explicit render clock for animation.

Input: pointer state with screen/world coordinates, button edges, viewport
(camera/zoom) mapping, DOM-free action mapping and attach/detach.

Audio: Web Audio bus mixer, cue-mapped playback, deterministic pitch/volume
jitter, per-sound concurrency caps, gesture unlock and destroy.
