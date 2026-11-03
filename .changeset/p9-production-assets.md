---
"lunego": minor
"@lunego/render-pixi": minor
---

Treat templates/game as the first production game p9 and integrate its existing assets.

- Preserve and validate nine-slice metadata in generated Assets. Add directional row selection to animationFrames so games use the framework's manifest frame slicing.
- Apply sprite anchors once in Pixi, preserving pixel-snapped painted origins and matching measured bounds; this aligns feet, health overlays and logical positions with real asset sprites.
- Treat project-level features/_generated asset metadata as shared generated data in both dependency checkers; cross-feature implementation and private generated-registry imports remain forbidden.
- Import 35 CC0 p9 production images/audio with provenance, source animations, anchors and UI skins. Use one generated Assets/AssetPack across rendering, UI, audio and content fingerprints; ship the same asset directory in production builds.
- Describe the padded HP/XP fill crops as explicit manifest frames so the visible fill matches the actual value. Regenerate the game's schema lock at version 14.
- Remove procedural stand-in artwork, obsolete demo/motion naming, fake text content and probes from the game. Framework browser fixtures now live under e2e/fixtures and are not shipped with p9.
- Name the existing game @lunego/game-p9; keep CLI cloning functional by explicitly assigning the new project's package name. Root and game AGENTS.md define that this template is the first real game and must be verified through actual asset loading and play.
