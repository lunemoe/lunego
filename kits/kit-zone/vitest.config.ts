import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-zone',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
