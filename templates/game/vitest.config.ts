import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '__GAME_NAME__',
    include: ['features/**/*.test.ts'],
    environment: 'node',
  },
})
