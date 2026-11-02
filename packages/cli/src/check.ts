import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { cruise, type IForbiddenRuleType } from 'dependency-cruiser'
import { featureDirs, pathExists, readSchemaVersion, walkFiles } from './project.js'
import { generate } from './gen.js'

export interface CheckResult {
  readonly ok: boolean
  readonly messages: readonly string[]
}

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

async function checkInternalImports(cwd: string, messages: string[]): Promise<void> {
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
  for (const candidate of ['features', 'games']) {
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
  await checkInternalImports(cwd, messages)
  await checkDirections(cwd, messages)
  return { ok: messages.length === 0, messages }
}
