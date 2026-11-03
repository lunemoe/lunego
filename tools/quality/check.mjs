import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { sourceFiles, runtimeFile, entryPoints, unreachableModules } from './files.mjs'
import { inspectStructure } from './structure.mjs'

export async function checkStructure(root) {
  const files = await sourceFiles(root)
  const inspected = files.filter(file => !file.path.includes('/_generated/') && !file.path.endsWith('.config.ts'))
  const issues = [
    ...inspectStructure(inspected),
    ...unreachableModules(files, await entryPoints(root, files)),
  ]
  for (const file of inspected) if (runtimeFile(file.path) && file.text.split('\n').length > 400) {
    issues.push({ path: file.path, line: 1, rule: 'file-size', detail: 'runtime file exceeds 400 lines' })
  }
  return issues
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.')
  const issues = await checkStructure(root)
  for (const issue of issues) console.error(`LG017 ${issue.path}:${issue.line} ${issue.rule}: ${issue.detail}`)
  console.log(`structure gate: ${issues.length === 0 ? 'passed' : `${issues.length} violations`}`)
  process.exitCode = issues.length === 0 ? 0 : 1
}
