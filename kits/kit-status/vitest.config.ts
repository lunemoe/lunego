import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-status',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
