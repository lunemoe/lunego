---
"lunego": minor
"@lunego/core": minor
"@lunego/render-pixi": minor
"@lunego/ui": minor
"@lunego/audio": minor
---

Asset pipeline to runtime: generated `Assets` can be passed to
`ContentRegistry.setAssetPack` (numeric or string versions) and feed the
content fingerprint; render-pixi maps generated asset metadata to
`TextureStore` without Pixi; UI gains an injectable `FontLoader`/browser
`FontFace` adapter; audio gains `registerAssetSounds`/`soundManifestFromAssets`
for generated audio assets. Animated displays accept per-frame `durations`
(seconds) with Aseprite millisecond conversion via
`assetAnimationDurations`, and `lunego assets check` now rejects missing or
unsupported font/audio files and animations without frame metadata.
