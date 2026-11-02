import { expect, test } from '@playwright/test'

test('renders the reactive UI panel and modal over the game', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.game.frame.tick ?? 0) >= 2)
  await expect(page.locator('.lg-panel__title')).toHaveText('Status')
  await expect(page.locator('.lg-bar__label')).toHaveText('100/100')
  await testInfo.attach('ui-panel.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  await page.getByRole('button', { name: 'Help' }).click()
  const controls = page.locator('.lg-modal__backdrop').filter({ hasText: 'Controls' })
  await expect(controls).toHaveCSS('display', 'grid')
  await expect(controls.locator('.lg-modal__title')).toHaveText('Controls')
  await page.keyboard.press('Escape')
  await expect(controls).toHaveCSS('display', 'none')

  const before = await page.evaluate(() => window.__luneGame?.game.frame.tick ?? 0)
  await page.getByRole('button', { name: 'Move right' }).click()
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => window.__luneGame?.game.frame.tick ?? 0)
  expect(after).toBeGreaterThan(before)
})
