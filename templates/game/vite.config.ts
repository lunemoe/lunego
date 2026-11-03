import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'assets',
  server: { host: '127.0.0.1', port: 4174 },
  preview: { host: '127.0.0.1', port: 4174 },
})
