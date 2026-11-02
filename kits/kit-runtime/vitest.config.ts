import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-runtime',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
