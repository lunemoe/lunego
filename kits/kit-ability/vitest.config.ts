import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'kit-ability',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
