import assert from 'node:assert/strict'
import { test } from 'node:test'
import { injectFault, faultDetected } from './faults.mjs'

test('fault anchors fail closed when a refactor removes or duplicates them', () => {
  const fault = { id: 'sample', before: 'apply()', after: 'ignore()' }
  assert.equal(injectFault('return apply()', fault), 'return ignore()')
  assert.throws(() => injectFault('return other()', fault))
  assert.throws(() => injectFault('apply(); apply()', fault))
})

test('compile failures, missing tests and unrelated failures cannot masquerade as detected faults', () => {
  const fault = { contract: 'keeps items' }
  const assertion = { fullName: 'keeps items', status: 'failed', failureMessages: ['AssertionError: expected 0 to equal 1'] }
  assert.equal(faultDetected({ testResults: [{ assertionResults: [assertion] }] }, fault), true)
  for (const report of [
    { testResults: [] },
    { testResults: [{ assertionResults: [{ ...assertion, failureMessages: ['SyntaxError: broken injection'] }] }] },
    { testResults: [{ assertionResults: [{ ...assertion, fullName: 'unrelated test' }] }] },
    { testResults: [{ assertionResults: [{ ...assertion, status: 'passed' }] }] },
  ]) assert.equal(faultDetected(report, fault), false)
})
