import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'audio',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
