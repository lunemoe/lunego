import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.LUNEGO_SANDBOX
const port = Number(process.env.LUNEGO_E2E_PORT)
if (root === undefined || !Number.isInteger(port) || port < 1) throw new Error('an isolated sandbox and port are required')

export default {
  testDir: join(root, 'e2e'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 2,
  retries: 0,
  forbidOnly: true,
  ...(process.env.LUNEGO_BROWSER_FAULT_TEST === undefined ? {} : { testMatch: process.env.LUNEGO_BROWSER_FAULT_TEST, grep: new RegExp(process.env.LUNEGO_BROWSER_FAULT_CONTRACT) }),
  reporter: [['json', { outputFile: process.env.LUNEGO_BROWSER_REPORT }]],
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
  webServer: {
    command: `pnpm --filter @lunego/game-p9 exec vite --config '${fileURLToPath(new URL('./game.vite.config.mjs', import.meta.url)).replaceAll("'", "'\\''")}' --port ${port} --strictPort`,
    cwd: root, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60_000,
  },
}
