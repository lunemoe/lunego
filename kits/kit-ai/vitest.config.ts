import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-ai',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
