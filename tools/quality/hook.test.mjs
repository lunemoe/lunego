import assert from 'node:assert/strict'
import { test } from 'node:test'
import { outgoingUpdates } from './hook.mjs'
import { argumentsFor } from './verify.mjs'

test('pre-push handles every outgoing ref and ignores deletions', () => {
  const a = 'a'.repeat(40), b = 'b'.repeat(40), zero = '0'.repeat(40)
  assert.deepEqual(outgoingUpdates(`refs/heads/main ${a} refs/heads/main ${b}\nrefs/heads/next ${b} refs/heads/next ${zero}\n(delete) ${zero} refs/heads/old ${a}\n`), [{ local: a, remote: b }, { local: b, remote: zero }])
  assert.throws(() => outgoingUpdates('malformed update'))
})

test('verification cannot accidentally mix index and committed-tree evidence', () => {
  assert.throws(() => argumentsFor(['--staged', '--commit', 'HEAD']))
  assert.throws(() => argumentsFor(['--unknown']))
  assert.deepEqual(argumentsFor(['--staged']).options, { staged: true })
})
