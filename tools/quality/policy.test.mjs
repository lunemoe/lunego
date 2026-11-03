import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authenticEvidence, signEvidence, changedPolicy, policyFile } from './policy.mjs'

test('changing a passing receipt cannot authorize a different source tree', () => {
  const key = 'local fixture signing key'
  const evidence = signEvidence({ tree: 'verified', policy: 'strict', passed: true }, key)
  assert.equal(authenticEvidence(evidence, key), true)
  assert.equal(authenticEvidence({ ...evidence, payload: { ...evidence.payload, tree: 'untested' } }, key), false)
  assert.equal(authenticEvidence(evidence, 'different checkout'), false)
  assert.equal(authenticEvidence({ ...evidence, signature: 'broken' }, key), false)
})

test('detects removed checks and added config files, not just edits to existing rules', () => {
  assert.deepEqual(changedPolicy({ lint: 'strict', test: 'present' }, { lint: 'weak', added: 'new' }), ['added', 'lint', 'test'])
  for (const path of ['eslint.config.js', 'package.json', 'packages/core/tsconfig.json', 'packages/eslint-plugin/src/rules/lg013.ts', 'tools/quality/verify.mjs']) assert.equal(policyFile(path), true)
  for (const path of ['templates/game/features/adventure/content/catalog.ts', 'packages/core/src/commands.ts']) assert.equal(policyFile(path), false)
})
