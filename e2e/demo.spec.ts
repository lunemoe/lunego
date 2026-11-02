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

  await page.getByRole('button', { name: 'Save' }).click()
  const saved = await page.evaluate(() => window.__luneGame?.game.frame.hash ?? '')
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(120)
  await page.keyboard.up('ArrowLeft')
  await page.getByRole('button', { name: 'Load' }).click()
  await page.waitForFunction((hash) => (window.__luneGame?.game.frame.hash ?? '') === hash, saved)

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
