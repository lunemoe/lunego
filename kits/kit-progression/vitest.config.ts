import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-progression',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
