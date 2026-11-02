import { expect, test } from '@playwright/test'

test('cues produce visible top-down effects and retire them', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => (window.__luneGame?.game.frame.tick ?? 0) >= 3)
  await page.evaluate(async () => {
    const target = window.__luneGame?.hud()?.enemy ?? 0
    await window.__luneGame?.game.send('runtime.combat.attack', { target, ability: 'demo.strike' })
  })
  await page.waitForFunction(() => (window.__luneGame?.vfx.effectCount ?? 0) > 0, null, {
    timeout: 10_000,
  })
  const lit = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game .vfx-layer')
    if (canvas === null) {
      return -1
    }
    const context = canvas.getContext('2d')
    if (context === null) {
      return -1
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) {
        count += 1
      }
    }
    return count
  })
  expect(lit).toBeGreaterThan(0)
  await page.waitForTimeout(120)
  const shot = await page.screenshot()
  await testInfo.attach('vfx.png', { body: shot, contentType: 'image/png' })
  await page.waitForFunction(() => (window.__luneGame?.vfx.effectCount ?? 0) === 0, null, {
    timeout: 10_000,
  })
})
