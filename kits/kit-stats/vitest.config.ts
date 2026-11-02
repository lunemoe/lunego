import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-stats',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
