import { defineConfig } from 'vitest/config'
import packageInfo from './package.json' with { type: 'json' }

export default defineConfig({
  test: {
    name: packageInfo.name,
    include: ['features/**/*.test.ts'],
    environment: 'node',
  },
})
