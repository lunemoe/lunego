import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-commerce',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
