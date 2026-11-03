import { fileURLToPath } from 'node:url'

export default {
  root: fileURLToPath(new URL('../templates/game', import.meta.url)),
  publicDir: 'assets',
  resolve: {
    alias: { '/__test__': fileURLToPath(new URL('./fixtures', import.meta.url)) },
    dedupe: ['@lunego/render-pixi', '@lunego/vfx'],
  },
  server: { host: '127.0.0.1', port: 4174 },
}
