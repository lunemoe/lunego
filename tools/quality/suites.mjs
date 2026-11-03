import { appendFile, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { run, readJson } from './git.mjs'
import { readResults, readBrowserResults } from './evidence.mjs'
import { faults, faultDetected } from './faults.mjs'

export async function step(root, log, label, command, args, env = {}) {
  console.log(`verify: ${label}`)
  await appendFile(log, `\n${label}\n`)
  const environment = { ...process.env, CI: 'true', ...env }
  for (const key of Object.keys(environment)) if (key.startsWith('VITEST_')) delete environment[key]
  try {
    const result = await run(command, args, { cwd: root, env: environment })
    await appendFile(log, result.stdout + result.stderr)
    return result
  } catch (error) {
    await appendFile(log, (error.stdout ?? '') + (error.stderr ?? '') + String(error))
    throw new Error(`${label} failed; see ${log}`, { cause: error })
  }
}

export async function unitSuite(root, directory, label, log, filters = []) {
  const reportPath = join(directory, `${label}-unit.json`)
  await step(root, log, `${label}: unit contracts`, 'pnpm', ['exec', 'vitest', 'run', ...filters, '--reporter=json', `--outputFile=${reportPath}`])
  return readResults(await readJson(reportPath), root)
}

async function browserRun(root, directory, label, log, fault) {
  const reportPath = join(directory, `${label}-browser.json`)
  const port = await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') { server.close(); reject(new Error('no local port')); return }
      server.close(error => error === undefined ? resolve(address.port) : reject(error))
    })
  })
  const config = fileURLToPath(new URL('./acceptance.playwright.config.mjs', import.meta.url))
  try {
    await step(root, log, `${label}: browser contracts`, 'pnpm', ['exec', 'playwright', 'test', '--config', config], {
      LUNEGO_SANDBOX: root, LUNEGO_E2E_PORT: String(port), LUNEGO_BROWSER_REPORT: reportPath,
      ...(fault === undefined ? {} : { LUNEGO_BROWSER_FAULT: fault.id, LUNEGO_BROWSER_FAULT_TEST: fault.test, LUNEGO_BROWSER_FAULT_CONTRACT: fault.contract, LUNEGO_FAULT_INJECTED: join(directory, `injected-${fault.id}.json`) }),
    })
  } catch (error) { if (fault === undefined) throw error }
  return readJson(reportPath)
}

export async function browserSuite(root, directory, label, log) {
  return readBrowserResults(await browserRun(root, directory, label, log))
}

export async function mutationSuite(root, directory, log) {
  const config = fileURLToPath(new URL('./mutation.vitest.config.mjs', import.meta.url))
  const killed = []
  for (const fault of faults) {
    const reportPath = join(directory, `fault-${fault.id}.json`)
    const injectedPath = join(directory, `injected-${fault.id}.json`)
    console.log(`verify: fault ${fault.id}`)
    if (fault.kind === 'browser') {
      const report = await browserRun(root, directory, `fault-${fault.id}`, log, fault)
      await access(injectedPath).catch(() => { throw new Error(`browser fault ${fault.id} was never injected`) })
      if (!faultDetected(report, fault)) throw new Error(`browser fault ${fault.id} was not rejected by its visible player contract; see ${log}`)
      killed.push(fault.id)
      continue
    }
    let result
    try {
      result = await run('pnpm', ['exec', 'vitest', 'run', '--config', config, '--reporter=json', `--outputFile=${reportPath}`], {
        cwd: root, env: { ...process.env, CI: 'true', LUNEGO_SANDBOX: root, LUNEGO_FAULT: fault.id, LUNEGO_FAULT_INJECTED: injectedPath },
      })
    } catch (error) { result = error }
    await appendFile(log, `\nfault ${fault.id}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
    await access(injectedPath).catch(() => { throw new Error(`fault ${fault.id} was never injected; see ${log}`) })
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    if (!faultDetected(report, fault)) throw new Error(`fault ${fault.id} survived or failed outside its assertion contract; see ${log}`)
    killed.push(fault.id)
  }
  await writeFile(join(directory, 'mutation-results.json'), `${JSON.stringify(killed, null, 2)}\n`)
  return killed
}
