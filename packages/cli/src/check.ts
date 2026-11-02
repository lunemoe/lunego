import { join, relative } from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { ESLint } from 'eslint'
import { gameConfig } from '@lunego/eslint-plugin'
import { readFile } from 'node:fs/promises'
import { cruise, type IForbiddenRuleType } from 'dependency-cruiser'
import { featureDirs, pathExists, readSchemaVersion, toPosix, walkFiles } from './project.js'
import { generate } from './gen.js'
import { scanContent, validateContentReferenceErrors } from './content-scan.js'

export interface CheckResult {
  readonly ok: boolean
  readonly messages: readonly string[]
}

const execFileAsync = promisify(execFile)

const forbidden: IForbiddenRuleType[] = [
  {
    name: 'no-unresolved',
    severity: 'error',
    from: {},
    to: { couldNotResolve: true },
  },
  {
    name: 'core-internal-scope',
    severity: 'error',
    from: {},
    to: { path: '(?:^|/)@lunego/core/(?:dist/)?(?:internal|world-internals)' },
  },
  {
    name: 'game-lunego-only-platform',
    severity: 'error',
    from: {
      path: '^(src|features|games)/',
      pathNot: 'tests/browser|\\.spec\\.ts$|__tests__|\\.test\\.ts$',
    },
    to: { path: '(?:^|/)node_modules/(pixi\\.js|solid-js)|(?:^|/)@lunego/core/(?:dist/)?internal' },
  },
  {
    name: 'game-no-node-builtins',
    severity: 'error',
    from: {
      path: '^(src|features|games)/',
      pathNot: 'tests/browser|\\.spec\\.ts$|__tests__|\\.test\\.ts$',
    },
    to: { dependencyTypes: ['core'] },
  },
  {
    name: 'game-no-core-internal',
    severity: 'error',
    from: { path: '^(src|features|games)/' },
    to: { path: '(?:^|/)@lunego/core/(?:dist/)?internal' },
  },
  {
    name: 'kits-no-game-code',
    severity: 'error',
    from: { path: '^kits/' },
    to: { path: '^(features|games|content)/' },
  },
  {
    name: 'kits-direction',
    severity: 'error',
    from: { path: '^kits/' },
    to: { path: '^packages/', pathNot: '^packages/core/' },
  },
  {
    name: 'no-circular',
    severity: 'error',
    from: {},
    to: { circular: true, dependencyTypesNot: ['type-only'] },
  },
  {
    name: 'feature-schema-only',
    severity: 'error',
    from: { path: '^features/([^/]+)/' },
    to: { path: '^features/(?!$1/)', pathNot: '(^|/)schema\\.ts$' },
  },
  {
    name: 'logic-no-view',
    severity: 'error',
    from: { path: '^features/[^/]+/logic/' },
    to: { path: '^features/[^/]+/view/' },
  },
  {
    name: 'view-no-logic',
    severity: 'error',
    from: { path: '^features/[^/]+/view/' },
    to: { path: '^features/[^/]+/logic/' },
  },
]

async function checkContracts(cwd: string, messages: string[]): Promise<void> {
  const features = await featureDirs(cwd)
  for (const feature of features) {
    const name = feature.slice(feature.lastIndexOf('/') + 1)
    if (!(await pathExists(join(feature, 'README.md')))) {
      messages.push(`LG015 feature ${name} is missing README.md`)
    }
    const files = await walkFiles(feature)
    if (!files.some((file) => file.endsWith('.test.ts'))) {
      messages.push(`LG015 feature ${name} has no test file`)
    }
  }
  if (!(await pathExists(join(cwd, 'lunego.config.ts')))) {
    messages.push('LG015 lunego.config.ts is missing')
  } else {
    try {
      await readSchemaVersion(cwd)
    } catch (error) {
      messages.push(`LG010 ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function checkEslint(cwd: string, messages: string[]): Promise<void> {
  try {
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: gameConfig as ESLint.Options['overrideConfig'],
      errorOnUnmatchedPattern: false,
    })
    const results = await eslint.lintFiles(['**/*.ts'])
    for (const result of results) {
      const file = relative(cwd, result.filePath)
      for (const message of result.messages) {
        if (message.severity !== 2) {
          continue
        }
        messages.push(
          `${message.ruleId ?? 'LG016'} ${file}:${message.line ?? 0}:${message.column ?? 0} ${message.message}`,
        )
      }
    }
  } catch (error) {
    messages.push(`LG016 ESLint failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runTypeScript(
  cwd: string,
  config: string,
  messages: string[],
): Promise<void> {
  try {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
    await execFileAsync(process.execPath, [tsc, '-p', config, '--noEmit'], {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    })
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message?: string }
    const detail = (failure.stderr || failure.stdout || failure.message || String(error)).trim()
    if (/error TS(2307|2688|5083|6053|18003)/.test(detail)) {
      messages.push(
        `check: TypeScript dependencies are not installed or unresolved; run pnpm install\n${detail}`,
      )
      return
    }
    messages.push(`LG001 TypeScript failed:\n${detail}`)
  }
}

async function checkTypeScript(cwd: string, messages: string[]): Promise<void> {
  const logicConfig = join(cwd, 'tsconfig.logic.json')
  const config = (await pathExists(logicConfig)) ? logicConfig : join(cwd, 'tsconfig.json')
  if (await pathExists(config)) {
    await runTypeScript(cwd, config, messages)
  }
  const viewConfig = join(cwd, 'tsconfig.json')
  if (
    config !== viewConfig &&
    (await pathExists(viewConfig)) &&
    (await pathExists(join(cwd, 'node_modules', 'vite')))
  ) {
    await runTypeScript(cwd, viewConfig, messages)
  }
}

async function checkContentReferences(cwd: string, messages: string[]): Promise<void> {
  try {
    const scanned = await scanContent(cwd)
    messages.push(...validateContentReferenceErrors(scanned))
  } catch (error) {
    messages.push(`LG009 content scan failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function checkInternalImports(cwd: string, messages: string[]): Promise<void> {
  if (await pathExists(join(cwd, 'kits'))) {
    for (const file of await walkFiles(join(cwd, 'kits'))) {
      if (!file.endsWith('.ts') || file.includes('__tests__') || file.endsWith('.test.ts')) {
        continue
      }
      const content = await readFile(file, 'utf8')
      if (/from\s+['"][^'"]*(?:features|games|content)\//.test(content)) {
        messages.push(`LG006/LG007 kit ${toPosix(relative(cwd, file))} imports game/content code`)
      }
    }
  }
  for (const root of ['features', 'games']) {
    if (!(await pathExists(join(cwd, root)))) {
      continue
    }
    for (const file of await walkFiles(join(cwd, root))) {
      if (!file.endsWith('.ts')) {
        continue
      }
      const content = await readFile(file, 'utf8')
      if (content.includes('@lunego/core/internal') || content.includes('world-internals')) {
        messages.push(`LG004 ${file} imports a core internal capability`)
      }
    }
  }
}

async function checkDirections(cwd: string, messages: string[]): Promise<void> {
  const paths: string[] = []
  for (const candidate of ['src', 'features', 'games', 'kits']) {
    if (await pathExists(join(cwd, candidate))) {
      paths.push(candidate)
    }
  }
  if (paths.length === 0) {
    return
  }
  const previous = process.cwd()
  try {
    process.chdir(cwd)
    const result = await cruise(paths, {
      ruleSet: { forbidden },
      doNotFollow: { path: 'node_modules' },
      tsPreCompilationDeps: true,
    })
    if (result.exitCode !== 0) {
      const output = typeof result.output === 'string' ? result.output : JSON.stringify(result.output)
      messages.push(
        `LG006/LG007 dependency violations in ${paths.join(', ')}:\n${output}`,
      )
    }
  } catch (error) {
    messages.push(
      `LG007 dependency check failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    process.chdir(previous)
  }
}

export async function runCheck(cwd: string): Promise<CheckResult> {
  const messages: string[] = []
  try {
    const generated = await generate(cwd, true)
    messages.push(...generated.errors)
  } catch (error) {
    messages.push(`LG014 ${error instanceof Error ? error.message : String(error)}`)
  }
  await checkContracts(cwd, messages)
  await checkTypeScript(cwd, messages)
  await checkContentReferences(cwd, messages)
  await checkInternalImports(cwd, messages)
  await checkEslint(cwd, messages)
  await checkDirections(cwd, messages)
  return { ok: messages.length === 0, messages }
}
