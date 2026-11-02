import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'
import { atlasAssetEntry, atlasManifest, packAtlas, type AtlasManifest } from '../atlas.js'
import { runAssets } from '../assets-cli.js'
import { generateAssets } from '../assets.js'
import type { AssetManifest } from '../assets-schema.js'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lunego-assets-'))
  temporary.push(dir)
  return dir
}

function png(
  width: number,
  height: number,
  color: readonly [number, number, number, number] = [255, 0, 0, 255],
): Buffer {
  const image = new PNG({ width, height })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = color[0]
    image.data[offset + 1] = color[1]
    image.data[offset + 2] = color[2]
    image.data[offset + 3] = color[3]
  }
  return PNG.sync.write(image)
}

async function writeAsset(root: string, file: string, width: number, height: number): Promise<void> {
  const path = join(root, 'assets', file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, png(width, height))
}

async function writeManifest(root: string, manifest: AssetManifest): Promise<void> {
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'assets', 'manifest.json'), JSON.stringify(manifest), 'utf8')
}

function baseManifest(assets: AssetManifest['assets'], extra: Partial<AssetManifest> = {}): AssetManifest {
  return { pack: 'test', version: 1, assets, ...extra }
}

describe('asset manifest validation', () => {
  it('accepts grid and explicit frame manifests and emits metadata', async () => {
    const root = await tempDir()
    await writeAsset(root, 'hero.png', 32, 16)
    await writeAsset(root, 'atlas.png', 24, 20)
    await writeManifest(
      root,
      baseManifest([
        {
          id: 'hero',
          file: 'hero.png',
          type: 'spritesheet',
          frameWidth: 16,
          frameHeight: 16,
          columns: 2,
          rows: 1,
          frames: 2,
          anchor: 'bottom-center',
          animations: [{ name: 'idle', columns: [0, 1], frames: 2, fps: 8 }],
        },
        {
          id: 'packed',
          file: 'atlas.png',
          type: 'atlas',
          frames: [
            { x: 0, y: 0, width: 16, height: 16 },
            { x: 16, y: 0, width: 8, height: 20 },
          ],
        },
      ]),
    )
    const result = await generateAssets(root)
    expect(result?.errors).toEqual([])
    expect(result?.source).toContain('"packed"')
    expect(result?.source).toContain('"frames": [')
    expect(result?.source).toContain('"anchor": "bottom-center"')
  })

  it('rejects real PNG dimensions that disagree with the grid', async () => {
    const root = await tempDir()
    await writeAsset(root, 'hero.png', 32, 18)
    await writeManifest(
      root,
      baseManifest([
        {
          id: 'hero',
          file: 'hero.png',
          type: 'spritesheet',
          frameWidth: 16,
          frameHeight: 16,
          columns: 2,
          rows: 1,
          frames: 2,
        },
      ]),
    )
    const result = await generateAssets(root)
    expect(result?.errors.join('\n')).toContain('needs height 16, image is 18')
  })

  it('rejects out-of-bounds explicit frames, duplicate ids, missing files, bad anchors and types', async () => {
    const root = await tempDir()
    await writeAsset(root, 'hero.png', 16, 16)
    await writeManifest(
      root,
      baseManifest([
        {
          id: 'hero',
          file: 'hero.png',
          type: 'spritesheet',
          frames: [{ x: 8, y: 0, width: 16, height: 16 }],
        },
        { id: 'hero', file: 'hero.png', type: 'sprite' },
        { id: 'gone', file: 'gone.png', type: 'sprite' },
        { id: 'anchor', file: 'hero.png', type: 'sprite', anchor: 'middle' },
        { id: 'kind', file: 'hero.png', type: 'gameplay' },
      ]),
    )
    const result = await generateAssets(root)
    const errors = result?.errors.join('\n') ?? ''
    expect(errors).toContain('exceeds image 16x16')
    expect(errors).toContain('duplicate asset id hero')
    expect(errors).toContain('file is missing: assets/gone.png')
    expect(errors).toContain('anchor is not recognized: middle')
    expect(errors).toContain('type is not recognized: gameplay')
  })

  it('rejects animation ranges and frame counts outside the sheet', async () => {
    const root = await tempDir()
    await writeAsset(root, 'hero.png', 32, 16)
    await writeManifest(
      root,
      baseManifest([
        {
          id: 'hero',
          file: 'hero.png',
          type: 'spritesheet',
          frameWidth: 16,
          frameHeight: 16,
          columns: 2,
          rows: 1,
          frames: 2,
          animations: [
            { name: 'run', columns: [0, 2], frames: 2 },
            { name: 'jump', from: 1, frames: 4 },
          ],
        },
      ]),
    )
    const result = await generateAssets(root)
    const errors = result?.errors.join('\n') ?? ''
    expect(errors).toContain('frame 2 exceeds 2 frames')
    expect(errors).toContain('range 1..4 exceeds 2 frames')
  })

  it('enforces optional palette and transparent-border limits', async () => {
    const root = await tempDir()
    await writeAsset(root, 'hero.png', 4, 4)
    await writeManifest(
      root,
      baseManifest([{ id: 'hero', file: 'hero.png', type: 'sprite' }], {
        limits: { maxDimension: 2, maxColors: 0, transparentBorder: true },
      }),
    )
    const result = await generateAssets(root)
    const errors = result?.errors.join('\n') ?? ''
    expect(errors).toContain('above limit 2')
    expect(errors).toContain('transparent 1px border')
    expect(errors).toContain('maxColors must be a positive integer')
  })

  it('fails assets check when generated output is missing or stale', async () => {
    const root = await tempDir()
    await writeAsset(root, 'hero.png', 16, 16)
    await writeManifest(root, baseManifest([{ id: 'hero', file: 'hero.png', type: 'sprite' }]))
    expect(await runAssets(root, ['build'])).toBe(0)
    expect(await runAssets(root, ['check'])).toBe(0)
    await rm(join(root, 'features', '_generated', 'assets.ts'))
    expect(await runAssets(root, ['check'])).toBe(1)
  })
})

describe('atlas packing', () => {
  it('packs deterministically across input order and locales', async () => {
    const root = await tempDir()
    await writeFile(join(root, 'a.png'), png(4, 4, [255, 0, 0, 255]))
    await writeFile(join(root, 'b.png'), png(2, 6, [0, 0, 255, 255]))
    const first = await packAtlas(
      [
        { id: 'a', path: join(root, 'a.png') },
        { id: 'b', path: join(root, 'b.png') },
      ],
      { width: 16, padding: 1 },
    )
    const second = await packAtlas(
      [
        { id: 'b', path: join(root, 'b.png') },
        { id: 'a', path: join(root, 'a.png') },
      ],
      { width: 16, padding: 1 },
    )
    expect(first.png.equals(second.png)).toBe(true)
    expect(first.frames).toEqual([
      { id: 'a', x: 1, y: 1, width: 4, height: 4 },
      { id: 'b', x: 6, y: 1, width: 2, height: 6 },
    ])
    expect(atlasManifest(first, 'atlas.png')).toMatchObject({ file: 'atlas.png', width: 16, height: 8 })
    expect(first.width).toBe(16)
    expect(first.height).toBe(8)
  })

  it('writes an atlas and an explicit frames manifest from the CLI', async () => {
    const root = await tempDir()
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(join(root, 'assets', 'a.png'), png(4, 4))
    await writeFile(join(root, 'assets', 'b.png'), png(2, 6))
    expect(
      await runAssets(root, [
        'pack',
        '--out',
        'assets/atlas.png',
        '--manifest',
        'assets/atlas.frames.json',
        'a=assets/a.png',
        'b=assets/b.png',
      ]),
    ).toBe(0)
    const manifest = JSON.parse(
      await readFile(join(root, 'assets', 'atlas.frames.json'), 'utf8'),
    ) as AtlasManifest
    expect(manifest.file).toBe('atlas.png')
    expect(manifest.frames.map((frame) => frame.id)).toEqual(['a', 'b'])
    const packed = await readFile(join(root, 'assets', 'atlas.png'))
    const again = await packAtlas(
      [
        { id: 'a', path: join(root, 'assets', 'a.png') },
        { id: 'b', path: join(root, 'assets', 'b.png') },
      ],
    )
    expect(packed.equals(again.png)).toBe(true)
  })

  it('validates an atlas entry with explicit frame rects', async () => {
    const root = await tempDir()
    await writeAsset(root, 'atlas.png', 16, 8)
    const result = await packAtlas([{ id: 'a', path: join(root, 'assets', 'atlas.png') }], { width: 16 })
    await writeManifest(root, baseManifest([atlasAssetEntry('atlas', 'atlas.png', result)]))
    expect((await generateAssets(root))?.errors).toEqual([])
  })

  it('emits byte-identical atlas files under different locales', async () => {
    const root = await tempDir()
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(join(root, 'assets', 'a.png'), png(4, 4))
    await writeFile(join(root, 'assets', 'b.png'), png(2, 6))
    const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))
    const args = [
      'assets',
      'pack',
      '--out',
      'assets/atlas.png',
      '--manifest',
      'assets/atlas.frames.json',
      'a=assets/a.png',
      'b=assets/b.png',
      '--cwd',
      root,
    ]
    const run = promisify(execFile)
    const first = await run(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    })
    expect(first.stderr).toBe('')
    const firstPng = await readFile(join(root, 'assets', 'atlas.png'))
    const firstJson = await readFile(join(root, 'assets', 'atlas.frames.json'))
    const second = await run(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, LC_ALL: 'tr_TR.UTF-8', LANG: 'tr_TR.UTF-8' },
    })
    expect(second.stderr).toBe('')
    expect((await readFile(join(root, 'assets', 'atlas.png'))).equals(firstPng)).toBe(true)
    expect((await readFile(join(root, 'assets', 'atlas.frames.json'))).equals(firstJson)).toBe(true)
  })
})
