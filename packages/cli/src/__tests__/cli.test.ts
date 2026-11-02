import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { templatesRoot } from '../new.js'

const run = promisify(execFile)
const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))
const temporary: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lunego-cli-'))
  temporary.push(dir)
  return dir
}

async function invoke(args: readonly string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await run(process.execPath, [cli, ...args, '--cwd', cwd], { cwd })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('lunego cli', () => {
  it('creates a game, checks generated files and passes project check', async () => {
    const root = await tempDir()
    const created = await invoke(['new', 'game', 'demo'], root)
    expect(created.code).toBe(0)
    const game = join(root, 'games', 'demo')
    const packageJson = await readFile(join(game, 'package.json'), 'utf8')
    expect(packageJson).toContain('@lunego/game-demo')
    expect(await readFile(join(game, 'features/motion/README.md'), 'utf8')).toContain('motion')
    expect(await readFile(join(game, 'vitest.config.ts'), 'utf8')).toContain("name: 'demo'")

    const generated = await invoke(['gen', '--check'], game)
    expect(generated.code).toBe(0)
    expect(generated.stdout).toContain('up to date')
    const checked = await invoke(['check'], game)
    expect(checked.code).toBe(0)
    expect(checked.stdout).toContain('check passed')
  })

  it('resolves templates from the package root in a node_modules layout', async () => {
    const root = await tempDir()
    const packageRoot = join(root, 'node_modules', 'lunego')
    await mkdir(join(packageRoot, 'templates', 'game'), { recursive: true })
    await writeFile(join(packageRoot, 'templates', 'game', 'package.json'), '{}', 'utf8')
    const moduleUrl = pathToFileURL(join(packageRoot, 'dist', 'new.js')).href
    expect(templatesRoot(moduleUrl)).toBe(join(packageRoot, 'templates'))
  })

  it('generates typed assets and rejects broken manifests', async () => {
    const root = await tempDir()
    expect((await invoke(['new', 'game', 'assets'], root)).code).toBe(0)
    const game = join(root, 'games', 'assets')
    await mkdir(join(game, 'assets', 'sprites'), { recursive: true })
    await writeFile(join(game, 'assets', 'sprites', 'a.png'), 'pixel')
    await writeFile(
      join(game, 'assets', 'manifest.json'),
      JSON.stringify({
        pack: 'test-pack',
        version: '1.2.3',
        assets: [
          {
            id: 'hero',
            file: 'sprites/a.png',
            type: 'sprite',
            frameWidth: 16,
            frameHeight: 16,
            columns: 2,
            rows: 1,
            frames: 2,
            fps: 12,
            anchor: 'bottom-center',
            animations: [{ name: 'idle', columns: [0, 1], frames: 2 }],
          },
        ],
      }),
      'utf8',
    )
    expect((await invoke(['gen'], game)).code).toBe(0)
    const generated = await readFile(join(game, 'features/_generated/assets.ts'), 'utf8')
    expect(generated).toContain('AssetIds')
    expect(generated).toContain('AssetPack')
    expect((await invoke(['check'], game)).code).toBe(0)

    const manifestPath = join(game, 'assets/manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      assets: Array<Record<string, unknown>>
    }
    manifest.assets[0] = { ...manifest.assets[0], frames: 99 }
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')
    const broken = await invoke(['check'], game)
    expect(broken.code).toBe(1)
    expect(broken.stderr).toContain('LG009')
  })

  it('rejects game code importing the core internal capability', async () => {
    const root = await tempDir()
    expect((await invoke(['new', 'game', 'inner'], root)).code).toBe(0)
    const game = join(root, 'games', 'inner')
    await writeFile(
      join(game, 'features/motion/logic/internal-probe.ts'),
      "import { worldInternals } from '@lunego/core/internal'\nexport const probe = worldInternals\n",
      'utf8',
    )
    const result = await invoke(['check'], game)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('LG004')
    expect(result.stderr).toContain('internal')
  })

  it('rejects platform imports and local RAF in game code', async () => {
    const root = await tempDir()
    expect((await invoke(['new', 'game', 'platform'], root)).code).toBe(0)
    const game = join(root, 'games', 'platform')
    await writeFile(
      join(game, 'src', 'bad-view.ts'),
      "import { Texture } from 'pixi.js'\nrequestAnimationFrame(() => {})\nexport const texture = Texture\n",
      'utf8',
    )
    const result = await invoke(['check'], game)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('LG016')
  })

  it('detects stale generated files and schema lock drift', async () => {
    const root = await tempDir()
    expect((await invoke(['new', 'game', 'drift'], root)).code).toBe(0)
    const game = join(root, 'games', 'drift')
    const extra = join(game, 'features/motion/logic/systems/extra.ts')
    await writeFile(
      extra,
      "import { defineSystem } from '@lunego/core'\nexport default defineSystem({ name: 'motion.extra', phase: 'post', run() {} })\n",
      'utf8',
    )
    const stale = await invoke(['gen', '--check'], game)
    expect(stale.code).toBe(1)
    expect(stale.stderr).toContain('LG014')
    expect((await invoke(['gen'], game)).code).toBe(0)
    expect((await invoke(['gen', '--check'], game)).code).toBe(0)

    const schema = join(game, 'features/motion/schema.ts')
    await writeFile(schema, `${await readFile(schema, 'utf8')}\n// changed\n`, 'utf8')
    const drift = await invoke(['check'], game)
    expect(drift.code).toBe(1)
    expect(drift.stderr).toContain('LG010')
  })
})
