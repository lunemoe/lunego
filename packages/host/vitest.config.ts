import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@lunego/core/internal',
        replacement: fileURLToPath(new URL('../core/src/internal.ts', import.meta.url)),
      },
      {
        find: '@lunego/core',
        replacement: fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    name: 'host',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
