import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'
import { importAseprite } from '../aseprite.js'
import { runAssets } from '../assets-cli.js'
import type { AssetManifest } from '../assets-schema.js'
import { importLdtk } from '../ldtk.js'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lunego-import-'))
  temporary.push(dir)
  return dir
}

function png(width: number, height: number): Buffer {
  const image = new PNG({ width, height })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 255
    image.data[offset + 3] = 255
  }
  return PNG.sync.write(image)
}

async function writeAsset(root: string, file: string, width: number, height: number): Promise<void> {
  const path = join(root, 'assets', file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, png(width, height))
}

describe('aseprite import', () => {
  const aseprite = {
    frames: [
      { filename: 'hero 0.aseprite', frame: { x: 0, y: 0, w: 16, h: 16 }, duration: 100 },
      { filename: 'hero 1.aseprite', frame: { x: 16, y: 0, w: 16, h: 16 }, duration: 100 },
      { filename: 'hero 2.aseprite', frame: { x: 32, y: 0, w: 16, h: 16 }, duration: 200 },
    ],
    meta: {
      size: { w: 48, h: 16 },
      frameTags: [
        { name: 'idle', from: 0, to: 1, direction: 'forward' },
        { name: 'bounce', from: 0, to: 2, direction: 'pingpong' },
      ],
      slices: [{ name: 'body', keys: [{ pivot: { x: 0.5, y: 1 } }] }],
    },
  }

  it('maps frames, tags, durations and pivot to a manifest entry', () => {
    const result = importAseprite(aseprite, {
      id: 'hero',
      file: 'hero.json.png',
      imageWidth: 48,
      imageHeight: 16,
    })
    expect(result.entry.frames).toEqual([
      { x: 0, y: 0, width: 16, height: 16 },
      { x: 16, y: 0, width: 16, height: 16 },
      { x: 32, y: 0, width: 16, height: 16 },
    ])
    expect(result.entry.anchor).toEqual({ x: 0.5, y: 1 })
    expect(result.entry.animations?.[0]).toMatchObject({
      name: 'idle',
      columns: [0, 1],
      frames: 2,
      fps: 10,
      durations: [100, 100],
    })
    expect(result.entry.animations?.[1]).toMatchObject({
      name: 'bounce',
      columns: [0, 1, 2, 1],
      frames: 4,
    })
    expect(result.warnings).toEqual([])
  })

  it('writes the entry into assets/manifest.json through the CLI', async () => {
    const root = await tempDir()
    await writeFile(join(root, 'hero.json'), JSON.stringify(aseprite), 'utf8')
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(join(root, 'assets', 'hero.png'), png(48, 16))
    expect(
      await runAssets(root, [
        'import',
        'aseprite',
        'hero.json',
        '--png',
        'assets/hero.png',
        '--id',
        'hero',
        '--write',
      ]),
    ).toBe(0)
    const manifest = JSON.parse(await readFile(join(root, 'assets', 'manifest.json'), 'utf8')) as AssetManifest
    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0]?.id).toBe('hero')
    expect(await runAssets(root, ['build'])).toBe(0)
    expect(await readFile(join(root, 'features', '_generated', 'assets.ts'), 'utf8')).toContain('"hero"')
  })

  it('reports trimmed frames instead of silently correcting them', () => {
    const trimmed = {
      ...aseprite,
      frames: [{ ...aseprite.frames[0], trimmed: true, spriteSourceSize: { x: 2, y: 1, w: 10, h: 15 } }],
      meta: { ...aseprite.meta, frameTags: [] },
    }
    const result = importAseprite(trimmed, {
      id: 'hero',
      file: 'hero.png',
      imageWidth: 48,
      imageHeight: 16,
    })
    expect(result.warnings.join('\n')).toContain('trimmed')
  })
})

describe('ldtk import', () => {
  it('derives a tileset entry and reports levels/entities as later work', () => {
    const ldtk = {
      defs: {
        tilesets: [
          {
            identifier: 'Grass',
            relPath: 'tiles.png',
            pxWid: 64,
            pxHei: 32,
            tileGridSize: 16,
            padding: 0,
            spacing: 0,
          },
        ],
      },
      levels: [{ layerInstances: [{ entityInstances: [{}, {}] }] }],
    }
    const result = importLdtk(ldtk, {
      idPrefix: 'world.',
      resolve: () => ({ file: 'tiles.png', width: 64, height: 32 }),
    })
    expect(result.entries).toEqual([
      {
        id: 'world.Grass',
        file: 'tiles.png',
        type: 'tileset',
        frameWidth: 16,
        frameHeight: 16,
        columns: 4,
        rows: 2,
        frames: 8,
        margin: 0,
        spacing: 0,
      },
    ])
    expect(result.levels).toBe(1)
    expect(result.entities).toBe(2)
    expect(result.warnings.join('\n')).toContain('not imported')
  })

  it('imports an LDtk tileset through the CLI and validates its real PNG', async () => {
    const root = await tempDir()
    await writeAsset(root, 'tiles.png', 64, 32)
    const ldtk = {
      defs: {
        tilesets: [
          {
            identifier: 'Grass',
            relPath: 'tiles.png',
            pxWid: 64,
            pxHei: 32,
            tileGridSize: 16,
            padding: 0,
            spacing: 0,
          },
        ],
      },
      levels: [],
    }
    await writeFile(join(root, 'assets', 'world.ldtk'), JSON.stringify(ldtk), 'utf8')
    expect(
      await runAssets(root, ['import', 'ldtk', 'assets/world.ldtk', '--id-prefix', 'world.', '--write']),
    ).toBe(0)
    const manifest = JSON.parse(await readFile(join(root, 'assets', 'manifest.json'), 'utf8')) as AssetManifest
    expect(manifest.assets[0]?.id).toBe('world.Grass')
    expect(await runAssets(root, ['build'])).toBe(0)
    expect(await runAssets(root, ['check'])).toBe(0)
  })
})
