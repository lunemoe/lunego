import { expect, type Page } from '@playwright/test'

export async function openGame(page: Page): Promise<void> {
  await page.clock.install()
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.hud()?.player ?? 0) > 0)
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 100)
  await expect(page.getByRole('heading', { name: 'P9', exact: true })).toBeVisible()
}

export async function state(page: Page) {
  return page.evaluate(() => {
    const runtime = window.__luneGame
    if (runtime === undefined) throw new Error('game did not start')
    const hud = runtime.hud()
    const position = runtime.position()
    if (hud === null || position === null) throw new Error('player is missing')
    return { ...hud, position, tick: runtime.game.tick }
  })
}

export async function advance(page: Page, milliseconds: number): Promise<void> {
  await page.clock.runFor(milliseconds)
}
