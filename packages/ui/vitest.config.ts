import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['browser', 'development'],
  },
  test: {
    name: 'ui',
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    server: {
      deps: {
        inline: ['solid-js'],
      },
    },
  },
})
