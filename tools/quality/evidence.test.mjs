import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareResults, readResults, readNodeResults, evidenceKey } from './evidence.mjs'

function report(name = 'keeps items', status = 'passed') {
  return { success: status === 'passed', numTotalTests: 1, numPassedTests: status === 'passed' ? 1 : 0, numPendingTests: 0,
    testResults: [{ name: '/sandbox/kits/items.test.ts', status: status === 'passed' ? 'passed' : 'failed', assertionResults: [{ fullName: name, status }] }] }
}

test('retains every previously passing test identity even if current discovery omits it', () => {
  const baseline = readResults(report(), '/sandbox')
  assert.deepEqual(compareResults(baseline, readResults(report(), '/sandbox')), [])
  assert.match(compareResults(baseline, readResults(report('new name'), '/sandbox')).join('\n'), /keeps items/)
})

test('rejects empty, failed and skipped reports', () => {
  for (const value of [{ success: true, numTotalTests: 0, testResults: [] }, report('keeps items', 'pending'), report('keeps items', 'failed')]) {
    assert.throws(() => readResults(value, '/sandbox'))
  }
})

test('binds evidence to the exact tree, policy, baseline and runtime', () => {
  const input = { tree: 'a', policy: 'b', baseline: 'c', runtime: 'node-24' }
  assert.equal(evidenceKey(input), evidenceKey({ ...input }))
  for (const key of Object.keys(input)) assert.notEqual(evidenceKey(input), evidenceKey({ ...input, [key]: 'changed' }))
})

test('native gate tests cannot succeed with zero collected cases or hidden skips', () => {
  const output = '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n# todo 0\n'
  assert.equal(readNodeResults(output), 2)
  for (const value of ['', output.replace('# tests 2', '# tests 0'), output.replace('# skipped 0', '# skipped 1')]) assert.throws(() => readNodeResults(value))
})
