import { expect, test } from '@playwright/test'

test('disposes an externally driven Pixi adapter idempotently and detaches resize', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  await page.evaluate(async () => {
    const probe = await import('/__test__/pixi-probe.ts')
    await probe.createProbe()
  })
  await expect(page.locator('#pixi-probe canvas')).toHaveCount(1)
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'))
    void window.__pixiProbe
  })
  await page.evaluate(async () => {
    const probe = await import('/__test__/pixi-probe.ts')
    probe.disposeProbe()
    window.dispatchEvent(new Event('resize'))
  })
  expect(errors).toEqual([])
  expect(
    await page.evaluate(
      () => window.__pixiProbe?.connected,
    ),
  ).toBe(false)
  expect(await page.evaluate(() => window.__luneGame !== undefined)).toBe(true)
})
