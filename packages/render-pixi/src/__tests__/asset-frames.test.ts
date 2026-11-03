import { describe, expect, it } from 'vitest'
import {
  animationFrames,
  assetAnchor,
  assetAnimationDurations,
  assetFrames,
  textureEntryFromAsset,
  textureManifestFromAssets,
  type AssetMetadata,
} from '../asset-frames.js'
import { TextureStore, type TextureLoader, type TextureSource } from '../textures.js'
import { animationFrameAt } from '../types.js'

const explicit: AssetMetadata = {
  file: 'atlas.png',
  type: 'atlas',
  frames: [
    { x: 0, y: 0, width: 16, height: 12 },
    { x: 16, y: 0, width: 20, height: 10 },
  ],
  animations: [{ name: 'idle', columns: [0, 1], frames: 2, fps: 5 }],
}

describe('asset manifest frames', () => {
  it('selects a directional animation row through metadata and rejects missing rows', () => {
    const asset = { frameWidth: 64, frameHeight: 64, columns: 30, rows: 4, frames: 120 }
    const walk = { name: 'walk', columns: [4, 5, 6], fps: 10 }
    expect(animationFrames(asset, walk, { row: 2 })).toEqual([
      { x: 256, y: 128, width: 64, height: 64 },
      { x: 320, y: 128, width: 64, height: 64 },
      { x: 384, y: 128, width: 64, height: 64 },
    ])
    expect(() => animationFrames(asset, walk, { row: 4 })).toThrow(/row/)
    expect(() => animationFrames(asset, walk, { row: -1 })).toThrow(/row/)
  })
  it('reads explicit packed-atlas rects instead of assuming a grid', () => {
    expect(assetFrames(explicit, { width: 36, height: 12 })).toEqual([
      { x: 0, y: 0, width: 16, height: 12 },
      { x: 16, y: 0, width: 20, height: 10 },
    ])
    expect(animationFrames(explicit, explicit.animations![0]!)).toEqual([
      { x: 0, y: 0, width: 16, height: 12 },
      { x: 16, y: 0, width: 20, height: 10 },
    ])
  })

  it('rejects explicit frames outside the real texture', () => {
    expect(() => assetFrames(explicit, { width: 24, height: 12 })).toThrow(/exceeds 24x12/)
  })

  it('falls back to the legacy grid with margin and spacing', () => {
    const grid: AssetMetadata = {
      type: 'tileset',
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      rows: 2,
      frames: 3,
      margin: 1,
      spacing: 2,
    }
    expect(assetFrames(grid, { width: 21, height: 21 })).toEqual([
      { x: 1, y: 1, width: 8, height: 8 },
      { x: 11, y: 1, width: 8, height: 8 },
      { x: 1, y: 11, width: 8, height: 8 },
    ])
  })

  it('resolves contiguous ranges, durations and anchors', () => {
    const grid: AssetMetadata = {
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      frames: 4,
    }
    const animation = {
      name: 'run',
      from: 1,
      frames: 2 as const,
      durations: [100, 200] as const,
    }
    expect(animationFrames(grid, animation)).toEqual([
      { x: 8, y: 0, width: 8, height: 8 },
      { x: 0, y: 8, width: 8, height: 8 },
    ])
    expect(() => animationFrames(grid, { ...animation, durations: [100] })).toThrow(/durations/)
    expect(assetAnchor('bottom-center')).toEqual({ x: 0.5, y: 1 })
    expect(assetAnchor({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 })
    expect(assetAnchor('moon')).toBeUndefined()
    expect(assetAnimationDurations({ name: 'idle', durations: [100, 250] })).toEqual([0.1, 0.25])
    expect(assetAnimationDurations({ name: 'idle' })).toBeUndefined()
  })
})

describe('texture manifest from generated assets', () => {
  it('loads generated Assets through textureManifestFromAssets without Pixi', async () => {
    const loadedSources: string[] = []
    const store = new TextureStore({
      load: async (source) => {
        loadedSources.push(String(source))
        return { texture: { disposed: false }, width: 36, height: 12 }
      },
      dispose: () => undefined,
    })
    const manifest = textureManifestFromAssets({
      hero: explicit,
      body: { file: 'fonts/body.woff2', type: 'font' },
      hit: { file: 'sounds/hit.wav', type: 'audio' },
    }, (file, id) => `/assets/${id}/${file}`)
    expect(Object.keys(manifest)).toEqual(['hero'])
    const report = await store.loadManifest(manifest)
    expect(report).toEqual({ loaded: ['hero'], failed: [] })
    expect(loadedSources).toEqual(['/assets/hero/atlas.png'])
    expect(store.get('hero')?.frames).toEqual(explicit.frames)
    store.destroy()
  })

  it('keeps explicit frames through TextureStore loading', async () => {
    const loader: TextureLoader<{ disposed: boolean }> = {
      load: async (_source: TextureSource) => ({ texture: { disposed: false }, width: 36, height: 12 }),
      dispose: (texture) => {
        texture.disposed = true
      },
    }
    const store = new TextureStore(loader)
    const entry = textureEntryFromAsset(explicit, 'atlas.png', { width: 36, height: 12 })
    const manifest = textureManifestFromAssets({ hero: explicit }, (file) => `/${file}`)
    expect(manifest['hero']?.source).toBe('/atlas.png')
    expect(manifest['hero']?.frames).toEqual(explicit.frames)
    const report = await store.loadManifest({ hero: entry })
    expect(report.failed).toEqual([])
    expect(store.get('hero')?.frames).toEqual(explicit.frames)
    const loaded = store.get('hero')
    const frame = animationFrameAt(
      { kind: 'animated', texture: 'hero', x: 0, y: 0, visible: true, alpha: 1, fps: 5, loop: true },
      loaded?.frames ?? [],
      0.25,
    )
    expect(frame).toEqual({ x: 16, y: 0, width: 20, height: 10 })
    store.destroy()
  })
})
