---
"@lunego/core": patch
"@lunego/host": patch
"@lunego/render-pixi": patch
"@lunego/audio": patch
"lunego": patch
---

Audit fixes: split entity/background display specs and typecheck the game
template; package-root template resolution with copied install templates;
texture/sound concurrent-load and destroy guards; Pixi adapter resize/dispose
and app ownership; RenderSystem destroy-callback isolation and real view;
flow states included in world hashes; internal capabilities moved to a WeakMap
that reflection cannot reach; CLI check rejects internal imports and unresolved
modules; pointer viewport shares renderer zoom/camera rounding.
