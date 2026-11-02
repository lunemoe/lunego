import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-space',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
