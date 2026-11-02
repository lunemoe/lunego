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
