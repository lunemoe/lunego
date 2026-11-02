import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-quest',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
