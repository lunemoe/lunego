import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as ts from 'typescript'
import { toPosix, walkFiles } from './project.js'

export interface ScannedContent {
  readonly types: ReadonlySet<string>
  readonly content: ReadonlyMap<string, ReadonlySet<string>>
  readonly references: readonly {
    readonly type: string
    readonly id: string
    readonly field: string
    readonly target: string
    readonly value: string
  }[]
  readonly refFields: ReadonlyMap<string, ReadonlyMap<string, string>>
  readonly duplicates: readonly string[]
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (ts.isPropertyAssignment(property)) {
    if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
      return property.name.text
    }
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name.text
  }
  return null
}

function callName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  return null
}

async function sourceFiles(cwd: string): Promise<string[]> {
  const files: string[] = []
  for (const root of ['features', 'games', 'content']) {
    const path = join(cwd, root)
    for (const file of await walkFiles(path, ['_generated', 'node_modules', '.lunego'])) {
      if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
        files.push(file)
      }
    }
  }
  return files.sort((left, right) => (toPosix(left) < toPosix(right) ? -1 : toPosix(left) > toPosix(right) ? 1 : 0))
}

/** Scans real defineContentType/defineContent declarations without executing them. */
export async function scanContent(cwd: string): Promise<ScannedContent> {
  const files = await sourceFiles(cwd)
  const typeNames = new Set<string>()
  const typeVars = new Map<string, string>()
  const content = new Map<string, Set<string>>()
  const refFields = new Map<string, Map<string, string>>()
  const rawRefs: Array<{ type: string; field: string; targetVar: string }> = []
  const rawValues: Array<{ type: string; id: string; field: string; value: string }> = []
  const duplicates = new Set<string>()

  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
        const init = node.initializer
        if (ts.isCallExpression(init) && callName(init.expression) === 'defineContentType') {
          const first = init.arguments[0]
          if (first !== undefined && ts.isStringLiteral(first)) {
            if (typeNames.has(first.text)) {
              duplicates.add(`content type ${first.text}`)
            }
            typeNames.add(first.text)
            typeVars.set(node.name.text, first.text)
            const schemaArg = init.arguments[1]
            if (schemaArg !== undefined && ts.isObjectLiteralExpression(schemaArg)) {
              for (const property of schemaArg.properties) {
                const field = propertyName(property)
                if (field === null || !ts.isPropertyAssignment(property)) {
                  continue
                }
                const value = property.initializer
                if (ts.isCallExpression(value) && callName(value.expression) === 'ref') {
                  const target = value.arguments[0]
                  if (target !== undefined && ts.isIdentifier(target)) {
                    rawRefs.push({ type: first.text, field, targetVar: target.text })
                  }
                }
              }
            }
          }
        }
        if (ts.isCallExpression(init) && callName(init.expression) === 'defineContent') {
          const typeArg = init.arguments[0]
          const valuesArg = init.arguments[1]
          const typeVar = typeArg !== undefined && ts.isIdentifier(typeArg) ? typeArg.text : null
          if (typeVar !== null && valuesArg !== undefined && ts.isObjectLiteralExpression(valuesArg)) {
            const typeName = typeVars.get(typeVar) ?? typeVar
            const ids = content.get(typeName) ?? new Set<string>()
            for (const property of valuesArg.properties) {
              const id = propertyName(property)
              if (id === null) {
                continue
              }
              if (ids.has(id)) {
                duplicates.add(`content id ${typeName}/${id}`)
              }
              ids.add(id)
              if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
                for (const field of property.initializer.properties) {
                  const fieldName = propertyName(field)
                  if (fieldName !== null && ts.isPropertyAssignment(field) && ts.isStringLiteral(field.initializer)) {
                    rawValues.push({ type: typeName, id, field: fieldName, value: field.initializer.text })
                  }
                }
              }
            }
            content.set(typeName, ids)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  for (const ref of rawRefs) {
    const fields = refFields.get(ref.type) ?? new Map<string, string>()
    fields.set(ref.field, typeVars.get(ref.targetVar) ?? ref.targetVar)
    refFields.set(ref.type, fields)
  }
  const references = rawValues
    .filter((value) => refFields.get(value.type)?.get(value.field) !== undefined)
    .map((value) => ({
      type: value.type,
      id: value.id,
      field: value.field,
      target: refFields.get(value.type)?.get(value.field) ?? '',
      value: value.value,
    }))
  return { types: typeNames, content, references, refFields, duplicates: [...duplicates] }
}

export function validateContentReferenceErrors(scan: ScannedContent): string[] {
  const errors: string[] = scan.duplicates.map((duplicate) => `LG009 duplicate ${duplicate}`)
  for (const reference of scan.references) {
    if (!scan.types.has(reference.target)) {
      errors.push(
        `LG009 content ${reference.type}/${reference.id}.${reference.field} references unknown type ${reference.target}`,
      )
      continue
    }
    if (!(scan.content.get(reference.target)?.has(reference.value) ?? false)) {
      errors.push(
        `LG009 content ${reference.type}/${reference.id}.${reference.field} references missing ${reference.target}/${reference.value}`,
      )
    }
  }
  return errors
}
