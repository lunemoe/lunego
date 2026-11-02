import { expect, test } from '@playwright/test'

test('plays the template slice through UI commands and persists world + profile', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.hud()?.player ?? 0) > 0)
  const initial = await page.evaluate(() => window.__luneGame?.hud())
  expect(initial?.hp).toBe(40)
  expect(initial?.maxHp).toBe(40)
  expect(initial?.enemy).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Attack' }).click()
  await page.waitForTimeout(120)
  await page.getByRole('button', { name: 'Attack' }).click()
  await page.waitForFunction(() => (window.__luneGame?.hud()?.ground ?? 0) > 0)
  await page.getByRole('button', { name: 'Pick up' }).click()
  await page.waitForFunction(() => (window.__luneGame?.hud()?.inventory.length ?? 0) > 0)

  await page.getByRole('button', { name: 'Inventory' }).click()
  await expect(page.locator('.lg-modal__title').filter({ hasText: 'Inventory' })).toBeVisible()
  await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(120)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Quests' }).click()
  await expect(page.locator('[role="option"]').first()).toContainText('demo.quest')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Talk' }).click()
  await expect(page.locator('.lg-dialog')).toContainText('A traveller offers a contract.')
  await page.locator('.lg-choices [role="option"]').first().click()

  const beforeShop = await page.evaluate(() => window.__luneGame?.hud()?.gold ?? 0)
  await page.getByRole('button', { name: 'Shop' }).click()
  await page.getByRole('button', { name: 'Buy' }).click()
  await page.waitForFunction((gold) => (window.__luneGame?.hud()?.gold ?? 0) < gold, beforeShop)
  await page.keyboard.press('Escape')

  // Save, change state, drain queued commands and load inside one page task:
  // separate roundtrips let frames advance and let commands stay queued across the
  // load, which the host rejects with `game_loaded` (a real page error).
  const roundTrip = await page.evaluate(async () => {
    const click = (label: string): void => {
      const button = [...document.querySelectorAll('button')].find(
        (element) => element.textContent?.trim() === label,
      )
      button?.click()
    }
    const frame = () => window.__luneGame?.game.frame
    const nextFrame = async (): Promise<void> => {
      const { promise, resolve } = Promise.withResolvers<void>()
      requestAnimationFrame(() => resolve())
      await promise
    }
    const drain = async (): Promise<void> => {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        if ((window.__luneGame?.pendingCommands() ?? 1) === 0) return
        await nextFrame()
      }
    }

    click('Save')
    const saved = { hash: frame()?.hash ?? '', tick: frame()?.tick ?? -1 }
    click('Move right')
    await nextFrame()
    await drain()
    click('Load')
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const current = frame()
      if (current !== undefined && current.tick <= saved.tick) {
        return { saved, restored: { hash: current.hash, tick: current.tick } }
      }
      await nextFrame()
    }
    return { saved, restored: null }
  })
  expect(roundTrip.saved.hash).not.toBe('')
  expect(roundTrip.restored).not.toBeNull()
  expect(roundTrip.restored?.tick).toBe(roundTrip.saved.tick)
  expect(roundTrip.restored?.hash).toBe(roundTrip.saved.hash)

  await page.evaluate(() => {
    const event = new Event('gamepadconnected')
    Object.defineProperty(event, 'gamepad', {
      value: { index: 0, id: 'demo pad', connected: true, buttons: [], axes: [0, 0, 0, 0] },
    })
    window.dispatchEvent(event)
  })
  await page.waitForFunction(() => window.__luneGame?.gamepad.connected === true)
  expect(errors).toEqual([])
})
