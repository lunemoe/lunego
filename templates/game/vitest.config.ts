import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'game-template',
    include: ['features/**/*.test.ts'],
    environment: 'node',
  },
})
