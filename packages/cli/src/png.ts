import { PNG } from 'pngjs'

export interface PngImage {
  readonly width: number
  readonly height: number
  /** RGBA pixels, four bytes per pixel. */
  readonly data: Buffer
}

export function decodePng(buffer: Buffer): PngImage {
  const png = PNG.sync.read(buffer)
  return {
    width: png.width,
    height: png.height,
    data: Buffer.from(png.data),
  }
}

export function encodePng(image: PngImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height })
  image.data.copy(png.data)
  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
    filterType: 4,
  })
}

export function colorCount(image: PngImage): number {
  const colors = new Set<number>()
  for (let offset = 0; offset < image.data.length; offset += 4) {
    colors.add(image.data.readUInt32BE(offset))
  }
  return colors.size
}

export function hasTransparentBorder(image: PngImage): boolean {
  if (image.width === 0 || image.height === 0) {
    return false
  }
  for (let x = 0; x < image.width; x += 1) {
    for (const y of [0, image.height - 1]) {
      if (image.data.readUInt8((y * image.width + x) * 4 + 3) !== 0) {
        return false
      }
    }
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    for (const x of [0, image.width - 1]) {
      if (image.data.readUInt8((y * image.width + x) * 4 + 3) !== 0) {
        return false
      }
    }
  }
  return true
}
