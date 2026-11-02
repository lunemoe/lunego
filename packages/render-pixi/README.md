# @lunego/render-pixi

PixiJS v8 renderer for LuneGo's view layer. It owns display lifecycle, virtual
resolution, pixel-snapped camera/zoom, sprite/animation/background rendering,
texture loading and tilemap layers. No game rules.

## Coordinate contract

- One authoritative mapping: `PixiAdapter.viewport` (`ViewportTransform`).
  - `worldToScreen(x, y)` / `screenToWorld(x, y)` use **virtual viewport pixels**.
  - `cssScale` converts virtual pixels to CSS pixels; `offsetX/offsetY` are the
    canvas origin in client coordinates.
  - `camera` is `round(camera * zoom) / zoom`, exactly the camera used by the
    Pixi world container; `cameraWorldTransform` is the same implementation
    (`position = -round(camera * zoom)`, `scale = zoom`).
- `RenderSystem.sync(source, time)` updates bindings; then:
  - `boundsOf(entity)` returns the union world AABB of that entity's displays.
  - `anchorOf(entity, 'feet' | 'center' | 'top')` returns the world point; use it
    for Cue/VFX/aim instead of guessing sprite height in game code.
  - `PixiAdapter.measure(spec, time)` resolves texture/frame dimensions; custom
    adapters may implement `measure` or rely on explicit spec width/height.
- Pointer input accepts `renderer.viewport` directly; pointer screen coords are
  CSS client coordinates and are converted through `cssScale`/offset first.
- VFX requests use world feet coordinates; `PixiEffectRenderer.sync(frame, map,
  cameraX, cameraY, zoom)` must receive the same camera/zoom as the renderer.

## API

- `PixiAdapter`: `viewport`, `element`, `stage`, `worldContainer`, `background`,
  `tilemap`, `textures`, `setBackground`, `setTilemap`, `setZoom`, `layerContainer`.
- `RenderSystem`: `add`, `sync(source, time)`, `boundsOf(entity,{binding|layer})`,
  `anchorOf(entity,anchor,{binding|layer})`, `setCamera`, `destroy`. Name bindings
  (`name: 'body'`, `'healthbar'`) to separate overlays in one system.
- `TextureStore`, `spriteSpec`, `animatedSpec`, `backgroundSpec`, `sheetFrames`,
  `animationFrameAt`, `TilemapView`, `buildTilemap`, `cameraTransform`.
