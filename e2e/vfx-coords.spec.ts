import { expect, test } from '@playwright/test'

test('places a known world point at the render-pixi screen pixel at zoom 1 and 2', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  const result = await page.evaluate(async () => {
    const probe = await import('/__test__/vfx-probe.ts')
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
        const module = await import('/__test__/vfx-probe.ts')
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
      const module = await import('/__test__/vfx-probe.ts')
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
        const module = await import('/__test__/vfx-probe.ts')
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
      const module = await import('/__test__/vfx-probe.ts')
      module.cleanupPixi()
    })
  }
})

test('renderer viewport, pointer and vfx agree on one world-to-screen pixel', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  const cases = [
    { zoom: 1, camera: [10.4, 7.7], world: [100, 80], screen: [90, 72] },
    { zoom: 2, camera: [10.4, 7.7], world: [100, 80], screen: [179, 145] },
    { zoom: 1, camera: [0, 0], world: [1, 1], screen: [1, 1] },
    { zoom: 2, camera: [0, 0], world: [239, 134], screen: [478, 268] },
  ] as const
  const results = await page.evaluate(async (cases) => {
    const renderer = window.__luneGame?.renderer
    const input = window.__luneGame?.input
    if (renderer === undefined || input === undefined) {
      throw new Error('missing game hooks')
    }
    const module = await import('/__test__/vfx-probe.ts')
    return cases.map((entry) => {
      renderer.setCamera(entry.camera[0], entry.camera[1])
      renderer.setZoom(entry.zoom)
      const viewport = renderer.viewport
      const screen = viewport.worldToScreen(entry.world[0], entry.world[1])
      input.pointer.setViewport(viewport)
      renderer.element.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: viewport.offsetX + screen.x * viewport.cssScale,
          clientY: viewport.offsetY + screen.y * viewport.cssScale,
          buttons: 0,
        }),
      )
      return {
        screen,
        vfx: module.screenPosition(
          entry.world[0],
          entry.world[1],
          viewport.cameraX,
          viewport.cameraY,
          viewport.zoom,
        ),
        world: input.pointer.worldPosition,
        camera: viewport.camera,
        zoom: viewport.zoom,
      }
    })
  }, cases)
  results.forEach((result, index) => {
    const expected = cases[index]
    expect(result.screen).toEqual({ x: expected.screen[0], y: expected.screen[1] })
    expect(result.vfx).toEqual(result.screen)
    expect(result.zoom).toBe(expected.zoom)
    expect(result.world.x).toBeCloseTo(expected.world[0], 1)
    expect(result.world.y).toBeCloseTo(expected.world[1], 1)
  })
})
