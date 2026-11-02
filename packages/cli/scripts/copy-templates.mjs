import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const source = join(packageRoot, '..', '..', 'templates')
const target = join(packageRoot, 'templates')

await rm(target, { recursive: true, force: true })
await cp(source, target, {
  recursive: true,
  filter: (path) => {
    const segments = path.split(/[\\/]/)
    return !segments.includes('node_modules') && !segments.includes('dist') && !segments.includes('.vite')
  },
})
