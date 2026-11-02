import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'vfx',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
