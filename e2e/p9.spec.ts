import { expect, test } from '@playwright/test'

test('plays p9 through combat, equipment, menus, supplies and a paired save', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.hud()?.player ?? 0) > 0)
  expect((await page.evaluate(() => window.__luneGame?.hud()))?.hp).toBe(40)
  // Holding attack follows the real ability cooldown and target selection.
  await page.keyboard.down('KeyF')
  await page.waitForFunction(() => (window.__luneGame?.hud()?.ground ?? 0) > 0)
  await page.keyboard.up('KeyF')
  await page.keyboard.press('KeyE')
  await page.waitForFunction(() => window.__luneGame?.hud()?.inventory.some((item) => item.contentId === 'p9.blade') === true)
  await page.keyboard.press('KeyI')
  await expect(page.locator('.lg-modal__title').filter({ hasText: 'Inventory' })).toBeVisible()
  const paused = await page.evaluate(() => window.__luneGame?.game.frame.tick)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.__luneGame?.game.frame.tick)).toBe(paused)
  await page.getByRole('option').filter({ hasText: 'Training blade' }).click()
  await page.waitForFunction(() => window.__luneGame?.hud()?.weapon === 'p9.blade')
  await page.keyboard.press('KeyQ')
  await expect(page.getByRole('option').first()).toContainText('completed')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Talk', exact: true }).click()
  await expect(page.locator('.lg-dialog')).toContainText('A traveller offers a contract.')
  await page.locator('.lg-choices [role="option"]').first().click()
  const beforeShop = await page.evaluate(() => window.__luneGame?.hud()?.gold ?? 0)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: 'Buy', exact: true }).click()
  await page.waitForFunction((gold) => window.__luneGame?.hud()?.gold === gold - 10, beforeShop)
  await page.waitForFunction(() => window.__luneGame?.pendingCommands() === 0)

  const roundTrip = await page.evaluate(() => {
    const runtime = window.__luneGame
    if (runtime === undefined) throw new Error('missing runtime')
    runtime.game.pause()
    runtime.save()
    const saved = { hash: runtime.game.frame.hash, tick: runtime.game.frame.tick }
    runtime.game.step(20)
    runtime.load()
    const restored = { hash: runtime.game.frame.hash, tick: runtime.game.frame.tick }
    runtime.game.resume()
    return { saved, restored }
  })
  expect(roundTrip.restored).toEqual(roundTrip.saved)
  await expect(page.locator('.action-notice')).toContainText('Run restored')
  expect(errors).toEqual([])
})

test('revives the same character and retries the floor without stale input or effects', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.hud()?.player ?? 0) > 0)
  await page.evaluate(() => { window.__luneGame?.game.step(2400) })
  await expect(page.locator('.run-result')).toContainText('Defeated')
  await page.getByRole('button', { name: 'Revive · V (lose 20% gold)', exact: true }).filter({ visible: true }).click()
  await page.waitForFunction(() => window.__luneGame?.hud()?.outcome === 'playing')
  const state = await page.evaluate(() => window.__luneGame?.hud())
  expect(state).toMatchObject({ hp: 40, gold: 40, kills: 0, wave: 1, weapon: null })
  expect(errors).toEqual([])
})

test('clears a floor using ordinary gameplay commands and continues with the same character', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.hud()?.player ?? 0) > 0)
  const before = await page.evaluate(async () => {
    const runtime = window.__luneGame
    if (runtime === undefined) throw new Error('missing runtime')
    const { clearFloor } = await import('/features/adventure/tests/scenario.ts')
    runtime.game.pause()
    clearFloor(runtime.game)
    runtime.game.resume()
    return runtime.hud()
  })
  expect(before?.outcome).toBe('victory')
  await page.getByRole('button', { name: 'Next floor · N', exact: true }).click()
  await page.waitForFunction(() => window.__luneGame?.hud()?.stage === 2 && window.__luneGame?.hud()?.remaining === 3)
  const after = await page.evaluate(() => window.__luneGame?.hud())
  expect(after?.weaponPower).toBe(before?.weaponPower)
  expect(after?.gold).toBe(before?.gold)
  await page.screenshot({ path: 'test-results/p9-grind.png', fullPage: true })
  expect(errors).toEqual([])
})
