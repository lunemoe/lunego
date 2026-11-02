import { expect, test } from '@playwright/test'

test('unlocks Web Audio and plays a cue in Chromium', async ({ page }) => {
  await page.goto('/audio-probe.html')
  await page.click('#unlock')
  await page.waitForFunction(() => window.__audioProbe !== undefined)
  const result = await page.evaluate(() => window.__audioProbe)
  expect(result?.state).toBe('running')
  expect(result?.voices).toBeGreaterThan(0)
  expect(result?.sampleRate).toBeGreaterThan(0)
})
