import ts from 'typescript'
import { createHash } from 'node:crypto'

const functions = node => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
const testFile = path => /(?:\/tests\/|\/__tests__\/|\.(?:test|spec)\.[cm]?[jt]s$)/.test(path)

function names(node, result) {
  if (ts.isIdentifier(node)) result.add(node.text)
  else if (ts.isBindingPattern(node)) for (const element of node.elements) if (ts.isBindingElement(element)) names(element.name, result)
}

function fingerprint(node, source) {
  const locals = new Set()
  for (const parameter of node.parameters) names(parameter.name, locals)
  const collect = current => {
    if (ts.isVariableDeclaration(current)) names(current.name, locals)
    ts.forEachChild(current, collect)
  }
  collect(node.body)
  const renamed = new Map([...locals].map((name, index) => [name, `local${index}`]))
  const tokens = []
  const visit = current => {
    if (ts.isIdentifier(current)) {
      const parent = current.parent
      const property = (ts.isPropertyAccessExpression(parent) && parent.name === current) ||
        (ts.isPropertyAssignment(parent) && parent.name === current)
      tokens.push(property ? current.text : renamed.get(current.text) ?? current.text)
    } else if (ts.isLiteralExpression(current)) tokens.push(current.getText(source))
    else tokens.push(String(current.kind))
    ts.forEachChild(current, visit)
  }
  visit(node.body)
  return tokens.length < 120 ? null : createHash('sha256').update(tokens.join('\0')).digest('hex')
}

function callChain(expression) {
  const parts = []
  let current = expression
  for (;;) {
    if (ts.isCallExpression(current)) current = current.expression
    else if (ts.isPropertyAccessExpression(current)) { parts.unshift(current.name.text); current = current.expression }
    else if (ts.isElementAccessExpression(current) && ts.isStringLiteral(current.argumentExpression)) {
      parts.unshift(current.argumentExpression.text); current = current.expression
    } else if (ts.isIdentifier(current)) { parts.unshift(current.text); return parts }
    else return []
  }
}

/** Type-2 clones preserve properties and literals, normalizing only local bindings. */
export function inspectStructure(files) {
  const issues = []
  const clones = new Map()
  const seen = new Set()
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
    const report = (node, rule, detail) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      const key = `${file.path}:${line}:${rule}`
      if (!seen.has(key)) { seen.add(key); issues.push({ path: file.path, line, rule, detail }) }
    }
    const imports = new Set()
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || !node.moduleSpecifier.text.startsWith('.')) continue
      const binding = node.importClause?.namedBindings
      if (binding !== undefined && ts.isNamedImports(binding)) for (const entry of binding.elements) imports.add(entry.name.text)
    }
    const visit = node => {
      if (testFile(file.path) && ts.isCallExpression(node)) {
        const chain = callChain(node.expression)
        if (['test', 'it', 'describe'].includes(chain[0])) {
          if (chain.some(part => ['skip', 'only', 'todo', 'skipIf', 'runIf', 'fixme', 'fail'].includes(part))) {
            report(node, 'test-integrity', 'disabled, conditional, expected-failing and focused tests are forbidden')
          }
          const callback = node.arguments.find(argument => functions(argument))
          if (callback !== undefined && ts.isBlock(callback.body) && callback.body.statements.length === 0) {
            report(node, 'test-integrity', 'empty test callbacks do not verify a contract')
          }
        }
      }
      if (file.path.startsWith('e2e/acceptance/')) {
        if (ts.isCallExpression(node)) {
          const chain = callChain(node.expression)
          if (chain.some(part => ['send', 'step', 'spawn', 'despawn', 'load', 'loadGame', 'save', 'saveGame', 'pause', 'resume', 'restart', 'eval', 'Function'].includes(part))) {
            report(node, 'player-input-contract', 'acceptance tests must drive keyboard/pointer/UI and only read game state')
          }
          if (chain.at(-1) === 'evaluate') {
            const callback = node.arguments[0]
            if (callback === undefined || !functions(callback)) report(node, 'player-input-contract', 'opaque browser scripts are forbidden')
            else {
              const checkWrites = child => {
                if (ts.isBinaryExpression(child) && child.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && child.operatorToken.kind <= ts.SyntaxKind.LastAssignment) report(child, 'player-input-contract', 'browser evaluation must be read-only')
                if (ts.isCallExpression(child) && callChain(child.expression).some(part => ['assign', 'defineProperty', 'set'].includes(part))) report(child, 'player-input-contract', 'browser evaluation must be read-only')
                ts.forEachChild(child, checkWrites)
              }
              checkWrites(callback)
            }
          }
        }
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /(?:features|kits|scenario|@lunego)\//.test(node.moduleSpecifier.text)) {
          report(node, 'player-input-contract', 'player acceptance must not import game logic or command helpers')
        }
      }
      if (!testFile(file.path) && functions(node) && node.body !== undefined) {
        let statements = 0
        const count = child => { if (ts.isStatement(child) && !ts.isBlock(child)) statements += 1; ts.forEachChild(child, count) }
        count(node.body)
        if (ts.isBlock(node.body) && statements >= 5) {
          const key = fingerprint(node, source)
          if (key !== null) {
            const previous = clones.get(key)
            if (previous !== undefined) report(node, 'duplicate-implementation', `same implementation as ${previous}`)
            else clones.set(key, `${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`)
          }
        }
        const statement = ts.isBlock(node.body) && node.body.statements.length === 1 ? node.body.statements[0] : undefined
        const expression = statement !== undefined && ts.isReturnStatement(statement) ? statement.expression : ts.isBlock(node.body) ? undefined : node.body
        if (expression !== undefined && ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && imports.has(expression.expression.text)) {
          const parameters = node.parameters.map(parameter => ts.isIdentifier(parameter.name) ? parameter.name.text : null)
          if (expression.arguments.length === parameters.length && expression.arguments.every((argument, index) => ts.isIdentifier(argument) && argument.text === parameters[index])) {
            report(node, 'transparent-wrapper', 'forwarding unchanged arguments adds no behavior; use a direct export alias')
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return issues
}
