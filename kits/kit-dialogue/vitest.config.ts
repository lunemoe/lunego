import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-dialogue',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
