import { createHash } from 'node:crypto'
import { relative } from 'node:path'

export function evidenceKey({ tree, policy, baseline, runtime }) {
  return createHash('sha256').update(JSON.stringify([tree, policy, baseline, runtime])).digest('hex')
}

export function readResults(report, root) {
  if (report.success !== true || !Number.isInteger(report.numTotalTests) || report.numTotalTests < 1 ||
      report.numPendingTests !== 0 || report.numPassedTests !== report.numTotalTests) {
    throw new Error('test evidence must contain actual passing tests with no failures or skips')
  }
  const identities = []
  for (const file of report.testResults ?? []) {
    if (file.status !== 'passed') throw new Error(`test module did not pass: ${file.name}`)
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== 'passed') throw new Error(`test did not pass: ${assertion.fullName}`)
      identities.push(`${relative(root, file.name).replaceAll('\\', '/')} :: ${assertion.fullName}`)
    }
  }
  if (identities.length !== report.numTotalTests) throw new Error('reported test count does not match collected assertions')
  return identities.sort()
}

export function compareResults(baseline, candidate) {
  const available = new Map()
  for (const key of candidate) available.set(key, (available.get(key) ?? 0) + 1)
  const missing = []
  for (const key of baseline) {
    const count = available.get(key) ?? 0
    if (count === 0) missing.push(`protected test disappeared or was renamed: ${key}`)
    else available.set(key, count - 1)
  }
  return missing
}

export function readBrowserResults(report) {
  const identities = []
  const visit = (suites, prefix = '') => {
    for (const suite of suites) {
      const title = `${prefix}${suite.title} / `
      for (const spec of suite.specs ?? []) {
        if (!spec.ok || spec.tests.length === 0) throw new Error(`browser contract failed: ${spec.title}`)
        for (const test of spec.tests) {
          if (test.expectedStatus !== 'passed' || test.results.length !== 1 || test.results[0].status !== 'passed') {
            throw new Error(`browser contract was skipped, retried or did not pass: ${spec.title}`)
          }
          identities.push(`${title}${spec.title}`)
        }
      }
      visit(suite.suites ?? [], title)
    }
  }
  if ((report.errors?.length ?? 0) !== 0) throw new Error('browser runner reported infrastructure errors')
  visit(report.suites ?? [])
  if (identities.length === 0) throw new Error('browser evidence contains no tests')
  return identities.sort()
}

export function readNodeResults(output) {
  const count = label => [...output.matchAll(new RegExp(`^# ${label} (\\d+)\\s*$`, 'gm'))].at(-1)?.[1]
  const total = Number(count('tests'))
  if (!Number.isInteger(total) || total < 1 || Number(count('pass')) !== total ||
    Number(count('fail')) !== 0 || Number(count('skipped')) !== 0 || Number(count('todo')) !== 0) {
    throw new Error('quality self-tests did not execute completely without skips')
  }
  return total
}
