import { describe, expect, it } from 'vitest'
import {
  FontLoader,
  type FontFaceOptions,
  type FontFaceLike,
  type FontSetLike,
} from '../index.js'

class FakeFace implements FontFaceLike {
  loaded = false
  readonly source: string
  readonly descriptors: FontFaceOptions | undefined

  constructor(
    readonly family: string,
    source: string,
    descriptors?: FontFaceOptions,
  ) {
    this.source = source
    this.descriptors = descriptors
  }

  async load(): Promise<FontFaceLike> {
    if (this.source.includes('broken')) {
      throw new Error('font decode failed')
    }
    this.loaded = true
    return this
  }
}

class FakeSet implements FontSetLike {
  readonly faces: FontFaceLike[] = []
  readonly ready = Promise.resolve()

  add(font: FontFaceLike): void {
    this.faces.push(font)
  }

  delete(font: FontFaceLike): boolean {
    const index = this.faces.indexOf(font)
    if (index === -1) {
      return false
    }
    this.faces.splice(index, 1)
    return true
  }

  has(font: FontFaceLike): boolean {
    return this.faces.includes(font)
  }
}

function loader(): { loader: FontLoader; fonts: FakeSet } {
  const fonts = new FakeSet()
  return {
    fonts,
    loader: new FontLoader(fonts, {
      create: (family, source, descriptors) => new FakeFace(family, source, descriptors),
    }, {
      sourceFor: (file, id) => `/assets/${id}/${file}`,
    }),
  }
}

describe('font asset loader', () => {
  it('loads generated font assets and ignores non-font entries', async () => {
    const { loader: fontLoader, fonts } = loader()
    const report = await fontLoader.loadAssets({
      body: { file: 'fonts/body.woff2', type: 'font', weight: '700' },
      hero: { file: 'sprites/hero.png', type: 'sprite' },
    })
    expect(report).toEqual({ loaded: ['body'], failed: [] })
    expect(fonts.faces).toHaveLength(1)
    const face = fonts.faces[0] as FakeFace
    expect(face.family).toBe('body')
    expect(face.source).toBe('/assets/body/fonts/body.woff2')
    expect(face.descriptors?.weight).toBe('700')
    expect(face.loaded).toBe(true)
  })

  it('honors caller family and descriptor injection', async () => {
    const { loader: fontLoader, fonts } = loader()
    await fontLoader.load({
      id: 'ui-body',
      type: 'font',
      file: 'fonts/ui.woff2',
      family: 'LuneGo UI',
      weight: '500',
      style: 'italic',
      display: 'swap',
    })
    const face = fonts.faces[0] as FakeFace
    expect(face.family).toBe('LuneGo UI')
    expect(face.descriptors).toEqual({ weight: '500', style: 'italic', display: 'swap' })
  })

  it('fails clearly for missing files, duplicate ids and non-font assets', async () => {
    const { loader: fontLoader } = loader()
    await expect(fontLoader.loadAssets({ bad: { type: 'font' } })).rejects.toThrow(/no file/)
    await expect(fontLoader.loadAssets([
      { id: 'dup', type: 'font', file: 'a.woff2' },
      { id: 'dup', type: 'font', file: 'b.woff2' },
    ])).rejects.toThrow(/duplicated/)
    await expect(fontLoader.load({ id: 'icon', type: 'sprite', file: 'icon.png' }))
      .rejects.toThrow(/not a font/)
  })

  it('reports per-asset load failures', async () => {
    const { loader: fontLoader, fonts } = loader()
    const report = await fontLoader.loadAssets({
      good: { file: 'fonts/good.woff2', type: 'font' },
      bad: { file: 'fonts/broken.woff2', type: 'font' },
    })
    expect(report.loaded).toEqual(['good'])
    expect(report.failed.map((failure) => failure.id)).toEqual(['bad'])
    expect(fonts.faces).toHaveLength(1)
  })
})
