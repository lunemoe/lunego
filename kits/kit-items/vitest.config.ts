import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-items',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
