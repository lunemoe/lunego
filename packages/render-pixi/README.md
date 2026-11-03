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
- Sprite `x/y` locate the declared anchor. The anchor is applied once; painted
  sprite bounds and measured bounds share the same pixel-snapped origin. Flips
  mirror the image within that same rectangle.
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
- Asset bridge: `textureManifestFromAssets`, `textureEntryFromAsset`,
  `assetFrames`, `animationFrames`, `assetAnchor`, `assetAnimationDurations`.

## Generated assets → textures

`lunego gen` emits `Assets` and `AssetPack` in `features/_generated/assets.ts`.
The renderer consumes the same metadata without importing game files:

```ts
import { Assets } from '../features/_generated/assets.js'
import { TextureStore, PixiTextureLoader, textureManifestFromAssets } from '@lunego/render-pixi'

const textures = new TextureStore(new PixiTextureLoader())
await textures.loadManifest(
  textureManifestFromAssets(Assets, (file, id) => `/assets/${id}/${file}`),
)
```

`textureManifestFromAssets` also works with any fake/injected `TextureLoader`, so
frame/layout tests do not need Pixi or a DOM. Explicit `frames` from packed
atlases and legacy grid metadata both become `SpriteFrame[]` in the store.

## Animation durations

`AnimatedDisplaySpec.durations` is an optional per-frame **seconds** array; when
present it takes precedence over `fps` and selects frames by cumulative time.
`assetAnimationDurations(animation)` converts the Aseprite importer's
milliseconds to seconds:

```ts
const idle = asset.animations?.find((animation) => animation.name === 'idle')
animatedSpec(id, {
  frames: animationFrames(asset, idle),
  durations: assetAnimationDurations(idle),
  fps: idle.fps ?? 10,
  loop: idle.loop ?? true,
})
```

Invalid durations (length mismatch, zero/negative, non-finite total) throw; specs
without `durations` keep the original `fps` behavior.

## Small viewports

`fit()` uses integer CSS enlargement when the surface fits at least one virtual
pixel per CSS pixel. Smaller containers use proportional reduction so the
complete viewport remains visible. `viewport.cssScale` and pointer transforms
use the actual displayed size in both cases.

Directional sheets can call `animationFrames(asset, animation, { row })` to
resolve animation-relative indices within one validated sheet row. Row bounds
are checked; games select direction while the framework owns frame slicing.
