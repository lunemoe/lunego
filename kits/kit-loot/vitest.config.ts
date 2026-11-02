import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-loot',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
