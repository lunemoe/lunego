import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectStructure } from './structure.mjs'

const body = `
  const accepted = []
  for (const command of commands) {
    if (command.actor !== actor.id) continue
    if (!Number.isFinite(command.damage)) continue
    const distance = command.x * command.x + command.y * command.y
    if (distance > actor.range * actor.range) continue
    const remaining = actor.energy - command.cost
    if (remaining < 0) continue
    actor.energy = remaining
    actor.health = Math.max(0, actor.health - command.damage)
    accepted.push({ id: command.id, remaining, distance })
  }
  return accepted
`

test('rejects copied implementations even when parameters and local variables are renamed', () => {
  const issues = inspectStructure([
    { path: 'kits/a/src/first.ts', text: `export function apply(actor, commands) {${body}}` },
    { path: 'kits/b/src/second.ts', text: `export function other(unit, actions) {${body.replaceAll('actor.', 'unit.').replaceAll('commands', 'actions').replaceAll(/\bcommand\b/g, 'action').replaceAll('accepted', 'results')}}` },
  ])
  assert.equal(issues.filter(issue => issue.rule === 'duplicate-implementation').length, 1)
})

test('allows implementations with different behavior and short repeated declarations', () => {
  assert.deepEqual(inspectStructure([
    { path: 'kits/a/src/index.ts', text: `export function apply(actor, commands) {${body}}` },
    { path: 'kits/b/src/index.ts', text: `export function apply(actor, commands) {${body.replace('actor.health - command.damage', 'actor.health + command.damage')}}` },
  ]), [])
})

test('rejects transparent forwarding functions used to split an implementation mechanically', () => {
  const issues = inspectStructure([
    { path: 'packages/a/src/forward.ts', text: "import { apply } from './owner.js'; export function forward(value) { return apply(value) }" },
    { path: 'packages/a/src/owner.ts', text: 'export function apply(value) { return value + 1 }' },
  ])
  assert.ok(issues.some(issue => issue.rule === 'transparent-wrapper'))
})

test('allows direct aliases, public barrels and wrappers that validate or transform', () => {
  assert.deepEqual(inspectStructure([
    { path: 'packages/a/src/index.ts', text: "export { apply as forward } from './owner.js'" },
    { path: 'packages/a/src/owner.ts', text: 'export function apply(value) { return value + 1 }' },
    { path: 'packages/a/src/checked.ts', text: "import { apply } from './owner.js'; export function checked(value) { if (value < 0) throw Error('invalid'); return apply(value) }" },
  ]), [])
})

test('rejects disabled, focused or empty tests rather than trusting a passing exit code', () => {
  for (const text of ["test.skip('contract', () => { expect(1).toBe(1) })", "test.only('contract', () => {})", "test('contract', () => {})", "test.todo('contract')", "test.skipIf(flag)('contract', () => {})"]) {
    assert.ok(inspectStructure([{ path: 'packages/a/src/__tests__/contract.test.ts', text }]).some(issue => issue.rule === 'test-integrity'))
  }
})

test('allows ordinary, parameterized and exception assertion tests', () => {
  assert.deepEqual(inspectStructure([{ path: 'a.test.ts', text: "test.each([1, 2])('works %s', value => expect(value).toBeGreaterThan(0)); test('throws', () => { expect(() => run()).toThrow() })" }]), [])
})

test('player acceptance cannot bypass controls through debug writes or command helpers', () => {
  for (const text of ["page.evaluate(() => window.__luneGame.game.step(60))", "page.evaluate(() => { runtime.hp = 100 })", "import { clearFloor } from '../../features/adventure/tests/scenario.ts'"]) {
    assert.ok(inspectStructure([{ path: 'e2e/acceptance/player.spec.ts', text }]).some(issue => issue.rule === 'player-input-contract'))
  }
  assert.deepEqual(inspectStructure([{ path: 'e2e/acceptance/player.spec.ts', text: "await page.keyboard.press('KeyF'); const hp = await page.evaluate(() => window.__luneGame.hud().hp)" }]), [])
})
