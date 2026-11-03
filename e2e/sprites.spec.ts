import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

function countColors(buffer: Buffer, predicate: (r: number, g: number, b: number, x: number) => boolean): number {
  const png = PNG.sync.read(buffer)
  let count = 0
  for (let index = 0; index < png.data.length; index += 4) {
    if (predicate(png.data[index] ?? 0, png.data[index + 1] ?? 0, png.data[index + 2] ?? 0, (index / 4) % png.width)) {
      count += 1
    }
  }
  return count
}

test('renders checked p9 asset sheets, tilemap, UI skins and pointer world space', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.game.frame.tick ?? 0) >= 3)
  await page.evaluate(() => window.__luneGame?.game.pause())
  const assetState = await page.evaluate(() => ({
    hero: window.__luneGame?.renderer.textures.has('player_knight') ?? false,
    crate: window.__luneGame?.renderer.textures.has('tile_crate') ?? false,
    boss: window.__luneGame?.renderer.textures.has('boss_lich') ?? false,
    tiles: window.__luneGame?.renderer.textures.has('crypt_tileset') ?? false,
    tileCount: window.__luneGame?.renderer.tilemap?.count ?? 0,
    tileTotal: window.__luneGame?.renderer.tilemap?.total ?? 0,
  }))
  expect(assetState).toMatchObject({ hero: true, crate: true, boss: true, tiles: true, tileTotal: 135 })
  expect(assetState.tileCount).toBeGreaterThan(0)
  expect(assetState.tileCount).toBeLessThanOrEqual(135)

  const canvas = page.locator('canvas:not(.vfx-layer)')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('canvas has no bounding box')
  }
  const shot = await page.screenshot({ clip: box })
  await testInfo.attach('sprites.png', { body: shot, contentType: 'image/png' })
  expect(countColors(shot, (r, g, b) => Math.max(r, g, b) > 80)).toBeGreaterThan(1000)
  await expect(page.locator('.lg-panel.has-image')).toHaveCSS('border-image-source', /panel_normal\.png/)
  const health = await page.locator('.lg-bar--hp').screenshot({ animations: 'disabled' })
  const healthWidth = PNG.sync.read(health).width
  expect(countColors(health, (r, g, b, x) => x > healthWidth * 0.75 && r > 120 && g < 100 && b < 100)).toBeGreaterThan(20)
  await page.getByRole('button', { name: 'Inventory', exact: true }).click()
  await expect(page.locator('.item-icon').first()).toHaveJSProperty('complete', true)
  expect(await page.locator('.item-icon').first().evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')

  await page.mouse.move(box.x + 120, box.y + 90)
  await page.waitForTimeout(50)
  const pointer = await page.evaluate(() => ({
    screen: window.__luneGame?.input.pointer.screenPosition,
    world: window.__luneGame?.input.pointer.worldPosition,
  }))
  expect(pointer.screen?.x).toBeGreaterThan(100)
  expect(pointer.world?.x).toBeGreaterThan(0)
  expect(pointer.world?.y).toBeGreaterThan(0)

  await page.evaluate(async () => {
    window.__luneGame?.renderer.setZoom(2)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  const zoomX = box.x + 200
  const zoomY = box.y + 140
  await page.mouse.move(zoomX, zoomY)
  await page.waitForTimeout(50)
  const zoomState = await page.evaluate(() => ({
    scale: window.__luneGame?.renderer.worldContainer.scale.x,
    worldX: window.__luneGame?.renderer.worldContainer.position.x,
    zoom: window.__luneGame?.renderer.zoom,
    pointerWorld: window.__luneGame?.input.pointer.worldPosition,
  }))
  expect(zoomState.scale).toBe(2)
  expect(zoomState.zoom).toBe(2)
  const expectedX = -(zoomState.worldX ?? 0) / 2 + (zoomX - box.x) / ((box.width / 480) * 2)
  expect(zoomState.pointerWorld?.x).toBeCloseTo(expectedX, 5)
  await page.evaluate(() => window.__luneGame?.renderer.setZoom(1))
})
