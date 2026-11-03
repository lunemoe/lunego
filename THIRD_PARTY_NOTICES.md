# Third-party notices

## pixelfx

- Source: https://github.com/patch-gg/pixelfx
- Version: 0.3.0, commit `a84159688af3ca37a4be05a0d422b94451b2e24e` (2026-10-31)
- License: MIT (see `packages/vfx/vendor/pixelfx/LICENSE`)
- Vendored at `packages/vfx/vendor/pixelfx` as the effect layer of `@lunego/vfx`.
- Only code-driven effect modules are vendored. The vendored core graph still
  contains the side-view `act`/actor rig modules because `core/index.js`
  re-exports them; `@lunego/vfx` never draws bodies/targets and rejects any
  effect that exposes `act`.
- Upstream NOTICE credits Hugo Duprez / Sprite Fusion and rehan-remade /
  Hollow Crown; the vendored `NOTICE.md` is kept verbatim.

## p9 production art and audio

The first game at `templates/game` uses the existing p9-dungeon-arpg v2.2.1
asset pack under CC0-1.0. The imported production subset is recorded in
`templates/game/assets/manifest.json`; its original LICENSE.md and
ATTRIBUTION.md are preserved alongside the assets. Sound effects include
Juhani Junkala / SubspaceAudio's CC0 collection. Runtime provenance and metadata
normalization are documented in `templates/game/assets/SOURCES.md`.
The complete original CC0 pack, including its LICENSE.md and ATTRIBUTION.md,
is retained in `art/p9/p9-dungeon-arpg-v2.2.1.tar.gz` for authoring and provenance;
it is not part of the game's published assets.
