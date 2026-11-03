import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { advance, openGame, state } from './controls.js'

test('keyboard movement, release and menu focus change the actual game state', async ({ page }) => {
  await openGame(page)
  const before = await state(page)
  await page.keyboard.down('KeyA')
  await advance(page, 250)
  await page.keyboard.up('KeyA')
  await advance(page, 50)
  const stopped = await state(page)
  expect(stopped.position.x).toBeLessThan(before.position.x - 10)
  await advance(page, 200)
  expect((await state(page)).position).toEqual(stopped.position)
  await page.keyboard.press('Escape')
  const paused = await state(page)
  await advance(page, 300)
  expect((await state(page)).tick).toBe(paused.tick)
  await page.getByRole('button', { name: '×', exact: true }).filter({ visible: true }).click()
  await page.keyboard.down('KeyD')
  await advance(page, 150)
  await page.keyboard.up('KeyD')
  await advance(page, 50)
  expect((await state(page)).position.x).toBeGreaterThan(stopped.position.x + 5)
})

test('keyboard combat produces loot and equipment affects damage', async ({ page }) => {
  await openGame(page)
  const before = await state(page)
  await page.keyboard.down('KeyF')
  await advance(page, 1000)
  await page.keyboard.up('KeyF')
  const defeated = await state(page)
  expect(defeated.kills).toBeGreaterThan(before.kills)
  expect(defeated.ground).toBeGreaterThan(0)
  await page.keyboard.press('KeyE')
  await advance(page, 50)
  await page.keyboard.press('KeyI')
  await page.getByRole('option').filter({ hasText: 'Training blade' }).first().click()
  await advance(page, 50)
  const equipped = await state(page)
  expect(equipped.weapon).toBe('p9.blade')
  expect(equipped.damage).toBeGreaterThan(defeated.damage)
  await expect(page.locator('.equipment-summary')).toContainText(`Damage ${equipped.damage}`)
})

test('save and load restore progression through player shortcuts', async ({ page }) => {
  await openGame(page)
  await page.keyboard.press('KeyK')
  await advance(page, 30)
  const saved = await state(page)
  await page.keyboard.down('KeyA')
  await advance(page, 400)
  await page.keyboard.up('KeyA')
  await advance(page, 30)
  expect((await state(page)).position.x).toBeLessThan(saved.position.x - 10)
  await page.keyboard.press('KeyJ')
  await advance(page, 30)
  const restored = await state(page)
  expect(restored.position).toEqual(saved.position)
  expect([restored.gold, restored.level, restored.xp, restored.weapon]).toEqual([saved.gold, saved.level, saved.xp, saved.weapon])
  await expect(page.locator('.action-notice')).toContainText('Run restored')
})

test('a full health bar visibly fills its right edge', async ({ page }) => {
  await openGame(page)
  await advance(page, 150)
  await expect(page.locator('.lg-bar--hp')).toHaveAttribute('aria-valuenow', '40')
  const image = PNG.sync.read(await page.locator('.lg-bar--hp').screenshot({ animations: 'disabled' }))
  let red = 0
  for (let index = 0; index < image.data.length; index += 4) {
    const x = (index / 4) % image.width
    if (x > image.width * 0.75 && image.data[index]! > 120 && image.data[index + 1]! < 100 && image.data[index + 2]! < 100) red += 1
  }
  expect(red).toBeGreaterThan(20)
})

test('a player clears all waves and carries the same growth into the next floor', async ({ page }) => {
  test.setTimeout(45_000)
  await openGame(page)
  await page.keyboard.down('KeyF')
  await page.keyboard.down('KeyR')
  for (let elapsed = 0; elapsed < 60_000; elapsed += 250) {
    await advance(page, 250)
    const current = await state(page)
    if (current.outcome !== 'playing') break
    if (current.ground > 0) await page.keyboard.press('KeyE')
    if (current.hp < current.maxHp / 2) await page.keyboard.press('KeyH')
    if (current.weapon === null && current.inventory.some(item => item.contentId === 'p9.blade')) {
      await page.keyboard.up('KeyF')
      await page.keyboard.up('KeyR')
      await page.keyboard.press('KeyI')
      await page.getByRole('option').filter({ hasText: 'Training blade' }).first().click()
      await advance(page, 50)
      await page.keyboard.down('KeyF')
      await page.keyboard.down('KeyR')
    }
  }
  await page.keyboard.up('KeyF')
  await page.keyboard.up('KeyR')
  const completed = await state(page)
  expect(completed.outcome).toBe('victory')
  expect(completed.kills).toBe(8)
  expect(completed.level).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Next floor · N', exact: true }).click()
  await advance(page, 100)
  const continued = await state(page)
  expect(continued.stage).toBe(2)
  expect([continued.weapon, continued.level, continued.gold]).toEqual([completed.weapon, completed.level, completed.gold])
  expect(continued.remaining).toBe(3)
})
