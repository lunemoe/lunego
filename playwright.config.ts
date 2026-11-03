import { defineConfig } from '@playwright/test'

const port = Number(process.env['LUNEGO_E2E_PORT'] ?? 4174)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid LUNEGO_E2E_PORT')

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 2,
  retries: 0,
  forbidOnly: true,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
  webServer: {
    command: `pnpm --filter @lunego/game-p9 exec vite --config ../../e2e/vite.config.ts --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
