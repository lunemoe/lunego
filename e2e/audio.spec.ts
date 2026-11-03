import { expect, test } from '@playwright/test'

test('loads p9 sound assets and unlocks the real game soundtrack and combat audio', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => window.__luneGame !== undefined)
  await page.keyboard.press('KeyF')
  await page.waitForFunction(() => window.__luneGame?.audio.state === 'running')
  const audio = await page.evaluate(() => window.__luneGame?.audio)
  expect(audio?.loaded).toBe(9)
  expect(audio?.voices).toBeGreaterThan(0)
  expect(audio?.musicPlaying).toBe(true)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Mute audio off', exact: true }).click()
  expect(await page.evaluate(() => window.__luneGame?.audio.muted)).toBe(true)
  expect(failures).toEqual([])
})
