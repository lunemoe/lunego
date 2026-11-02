import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

interface Centroid {
  readonly x: number
  readonly y: number
  readonly count: number
}

function centroid(buffer: Buffer, predicate: (r: number, g: number, b: number) => boolean): Centroid {
  const png = PNG.sync.read(buffer)
  let x = 0
  let y = 0
  let count = 0
  for (let py = 0; py < png.height; py += 1) {
    for (let px = 0; px < png.width; px += 1) {
      const index = (py * png.width + px) * 4
      const r = png.data[index]
      const g = png.data[index + 1]
      const b = png.data[index + 2]
      if (predicate(r, g, b)) {
        x += px
        y += py
        count += 1
      }
    }
  }
  return { x: count === 0 ? 0 : x / count, y: count === 0 ? 0 : y / count, count }
}

const isCrate = (r: number, g: number, b: number): boolean => r > 180 && g > 100 && g < 180 && b < 120
const isBackground = (r: number, g: number, b: number): boolean => r < 20 && g < 24 && b < 32

test('renders a moving square and redraws the canvas', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.game.frame.tick ?? 0) >= 3)
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('canvas has no bounding box')
  }
  const before = await page.screenshot({ clip: box })
  const beforeCrate = centroid(before, isCrate)
  const beforePixels = centroid(before, (r, g, b) => !isBackground(r, g, b))
  expect(beforeCrate.count).toBeGreaterThan(50)
  expect(beforePixels.count).toBeGreaterThan(100)
  await testInfo.attach('before.png', { body: before, contentType: 'image/png' })
  mkdirSync('test-results', { recursive: true })
  writeFileSync(join('test-results', 'browser-before.png'), before)

  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(650)
  await page.keyboard.up('ArrowRight')
  await page.waitForTimeout(200)
  const after = await page.screenshot({ clip: box })
  const afterCrate = centroid(after, isCrate)
  await testInfo.attach('after.png', { body: after, contentType: 'image/png' })
  writeFileSync(join('test-results', 'browser-after.png'), after)
  console.log(`crate centroid x: ${beforeCrate.x.toFixed(1)} -> ${afterCrate.x.toFixed(1)}`)

  expect(afterCrate.count).toBeGreaterThan(50)
  expect(afterCrate.x).toBeLessThan(beforeCrate.x - 5)
  expect(Buffer.compare(before, after)).not.toBe(0)
})
