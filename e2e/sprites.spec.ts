import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

function countColors(buffer: Buffer, predicate: (r: number, g: number, b: number) => boolean): number {
  const png = PNG.sync.read(buffer)
  let count = 0
  for (let index = 0; index < png.data.length; index += 4) {
    if (predicate(png.data[index] ?? 0, png.data[index + 1] ?? 0, png.data[index + 2] ?? 0)) {
      count += 1
    }
  }
  return count
}

test('renders runtime canvas sprites, tilemap, background and pointer world space', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.game.frame.tick ?? 0) >= 3)
  const assetState = await page.evaluate(() => ({
    crate: window.__luneGame?.renderer.textures.has('runtime-crate') ?? false,
    backdrop: window.__luneGame?.renderer.textures.has('runtime-backdrop') ?? false,
    tiles: window.__luneGame?.renderer.textures.has('runtime-tiles') ?? false,
    tileCount: window.__luneGame?.renderer.tilemap?.count ?? 0,
  }))
  expect(assetState).toEqual({ crate: true, backdrop: true, tiles: true, tileCount: 600 })

  const canvas = page.locator('canvas:not(.vfx-layer)')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('canvas has no bounding box')
  }
  const shot = await page.screenshot({ clip: box })
  await testInfo.attach('sprites.png', { body: shot, contentType: 'image/png' })
  expect(countColors(shot, (r, g, b) => r > 180 && g > 100 && g < 180 && b < 120)).toBeGreaterThan(40)
  expect(countColors(shot, (r, g, b) => r > 240 && g > 180 && b > 110)).toBeGreaterThan(4)
  expect(countColors(shot, (r, g, b) => r > 20 && r < 60 && g > 40 && g < 90 && b > 30 && b < 100)).toBeGreaterThan(100)

  await page.mouse.move(box.x + 120, box.y + 90)
  await page.waitForTimeout(50)
  const pointer = await page.evaluate(() => ({
    screen: window.__luneGame?.input.pointer.screenPosition,
    world: window.__luneGame?.input.pointer.worldPosition,
  }))
  expect(pointer.screen?.x).toBeGreaterThan(100)
  expect(pointer.world?.x).toBeGreaterThan(0)
  expect(pointer.world?.y).toBeGreaterThan(0)

  const zoom = await page.evaluate(() => {
    window.__luneGame?.renderer.setZoom(2)
    const scale = window.__luneGame?.renderer.worldContainer.scale.x
    window.__luneGame?.renderer.setZoom(1)
    return scale
  })
  expect(zoom).toBe(2)
})
