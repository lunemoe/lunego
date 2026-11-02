import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-combat',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
