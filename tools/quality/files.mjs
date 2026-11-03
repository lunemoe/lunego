import { readdir, readFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import ts from 'typescript'

const skipped = new Set(['.git', 'node_modules', 'dist', 'coverage', 'vendor', 'test-results', 'playwright-report', 'blob-report'])

export async function sourceFiles(root) {
  const result = []
  const visit = async path => {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const child = path === '' ? entry.name : `${path}/${entry.name}`
      if (entry.isSymbolicLink() || skipped.has(entry.name) || child === 'packages/cli/templates') continue
      if (entry.isDirectory()) await visit(child)
      else if (/\.(?:ts|mjs|js)$/.test(child) && !child.endsWith('.d.ts')) result.push({ path: child, text: await readFile(join(root, child), 'utf8') })
    }
  }
  await visit('')
  return result.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

export function runtimeFile(path) {
  return /^(?:packages|kits|templates|games|features)\//.test(path) &&
    !/(?:\/tests\/|\/__tests__\/|\/_generated\/|\.(?:test|spec|config)\.)/.test(path)
}

function imports(file) {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
  const result = []
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) result.push(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) result.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

export function unreachableModules(files, roots) {
  const byPath = new Map(files.map(file => [file.path, file]))
  const edges = new Map()
  for (const file of files) {
    const targets = []
    for (const specifier of imports(file)) {
      if (!specifier.startsWith('.')) continue
      const raw = posix.normalize(posix.join(posix.dirname(file.path), specifier))
      const candidates = [raw, raw.replace(/\.js$/, '.ts'), `${raw}.ts`, `${raw}/index.ts`]
      const target = candidates.find(candidate => byPath.has(candidate))
      if (target !== undefined) targets.push(target)
    }
    edges.set(file.path, targets)
  }
  const pending = [...roots, ...files.filter(file => /\.(?:test|spec)\.[cm]?[jt]s$/.test(file.path)).map(file => file.path)]
  const reachable = new Set()
  while (pending.length > 0) {
    const path = pending.pop()
    if (reachable.has(path)) continue
    reachable.add(path)
    pending.push(...(edges.get(path) ?? []))
  }
  return files.filter(file => runtimeFile(file.path) && !reachable.has(file.path))
    .map(file => ({ path: file.path, line: 1, rule: 'unreachable-module', detail: 'runtime module has no path from a package entry, application entry or test' }))
}

export async function entryPoints(root, files) {
  const result = new Set()
  const manifests = []
  for (const area of ['packages', 'kits', 'templates', 'games']) {
    let entries
    try { entries = await readdir(join(root, area), { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = `${area}/${entry.name}`
      try { manifests.push({ directory, data: JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8')) }) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  }
  const values = value => typeof value === 'string' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(values) : []
  for (const { directory, data } of manifests) {
    for (const target of [...values(data.exports), ...values(data.bin)]) {
      result.add(posix.normalize(`${directory}/${target.replace(/^\.\//, '').replace(/^dist\/src\//, 'src/').replace(/^dist\//, 'src/').replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts')}`))
    }
    for (const command of values(data.scripts)) {
      for (const match of command.matchAll(/\bnode\s+(\S+\.[cm]?js)\b/g)) result.add(posix.normalize(`${directory}/${match[1]}`))
    }
  }
  for (const file of files) if (/^(?:templates|games)\/[^/]+\/src\/main\.ts$/.test(file.path)) result.add(file.path)
  return result
}
