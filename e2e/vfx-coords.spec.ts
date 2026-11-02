import { expect, test } from '@playwright/test'

test('places a known world point at the render-pixi screen pixel at zoom 1 and 2', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  const result = await page.evaluate(async () => {
    const probe = await import('/src/vfx-probe.ts')
    return {
      one: probe.probe(100, 80, 10.4, 7.7, 1),
      two: probe.probe(100, 80, 10.4, 7.7, 2),
      three: probe.probe(100, 80, 10.4, 7.7, 3),
    }
  })
  expect(result.one).toEqual({ expectedX: 90, expectedY: 72, alpha: 255 })
  expect(result.two).toEqual({ expectedX: 179, expectedY: 145, alpha: 255 })
  expect(result.three).toEqual({ expectedX: 269, expectedY: 217, alpha: 255 })
})

test('Pixi effect layer keeps known world pixels aligned at zoom 1 and 2', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  const { PNG } = await import('pngjs')
  for (const [zoom, expectedX, expectedY] of [
    [1, 90, 72],
    [2, 179, 145],
  ] as const) {
    const probe = await page.evaluate(
      async ({ zoom }) => {
        const module = await import('/src/vfx-probe.ts')
        return module.probePixi(100, 80, 10.4, 7.7, zoom)
      },
      { zoom },
    )
    expect(probe.expectedX).toBe(expectedX)
    expect(probe.expectedY).toBe(expectedY)
    await page.waitForTimeout(100)
    const shot = await page.locator('#pixi-coord canvas').screenshot()
    const png = PNG.sync.read(shot)
    const index = (expectedY * png.width + expectedX) * 4
    expect(png.data[index + 3]).toBeGreaterThan(0)
    await page.evaluate(async () => {
      const module = await import('/src/vfx-probe.ts')
      module.cleanupPixi()
    })
  }
})

test('ground and front Pixi surfaces contain only their own layer', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  const { PNG } = await import('pngjs')
  for (const layer of ['ground', 'front'] as const) {
    const probe = await page.evaluate(
      async ({ layer }) => {
        const module = await import('/src/vfx-probe.ts')
        return module.probePixiLayer(layer)
      },
      { layer },
    )
    await page.waitForTimeout(100)
    const shot = await page.locator('#pixi-layer canvas').screenshot()
    const png = PNG.sync.read(shot)
    const own = (probe.ownY * png.width + probe.ownX) * 4
    const other = (probe.otherY * png.width + probe.otherX) * 4
    expect(png.data[own]).toBeGreaterThan(0)
    expect(png.data[other]).toBe(0)
    await page.evaluate(async () => {
      const module = await import('/src/vfx-probe.ts')
      module.cleanupPixi()
    })
  }
})
