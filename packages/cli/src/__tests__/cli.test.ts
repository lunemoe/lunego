import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

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

    const generated = await invoke(['gen', '--check'], game)
    expect(generated.code).toBe(0)
    expect(generated.stdout).toContain('up to date')
    const checked = await invoke(['check'], game)
    expect(checked.code).toBe(0)
    expect(checked.stdout).toContain('check passed')
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
