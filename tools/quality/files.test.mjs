import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unreachableModules } from './files.mjs'

test('rejects unattached runtime implementations even if they export a public-looking function', () => {
  const files = [
    { path: 'packages/a/src/index.ts', text: "export { tick } from './tick.js'" },
    { path: 'packages/a/src/tick.ts', text: 'export function tick() { return 1 }' },
    { path: 'packages/a/src/unused.ts', text: 'export function unused() { return 2 }' },
  ]
  assert.deepEqual(unreachableModules(files, ['packages/a/src/index.ts']).map(issue => issue.path), ['packages/a/src/unused.ts'])
})

test('cycles with no consumer are still unreachable; legitimate test-only contracts are reachable', () => {
  const files = [
    { path: 'kits/a/src/one.ts', text: "import { two } from './two.js'; export const one = () => two()" },
    { path: 'kits/a/src/two.ts', text: "import { one } from './one.js'; export const two = () => one()" },
    { path: 'kits/a/src/probe.ts', text: 'export const probe = () => 1' },
    { path: 'kits/a/src/__tests__/probe.test.ts', text: "import { probe } from '../probe.js'; test('probe', () => expect(probe()).toBe(1))" },
  ]
  assert.deepEqual(unreachableModules(files, []).map(issue => issue.path), ['kits/a/src/one.ts', 'kits/a/src/two.ts'])
})
