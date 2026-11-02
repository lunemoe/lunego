import type { TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

type MessageIds =
  | 'forbiddenImport'
  | 'forbiddenGlobal'
  | 'localViewport'
  | 'bindingSize'
  | 'debugMutation'

type Options = [
  {
    readonly allowedImports?: readonly string[]
    readonly debugComment?: string
  },
]

const forbiddenGlobals: Readonly<Record<string, string>> = {
  document: 'use @lunego/ui / @lunego/render-pixi APIs',
  window: 'use @lunego/host / @lunego/input browser adapters',
  navigator: 'use a @lunego browser adapter',
  localStorage: 'use createBrowserSaveStore from @lunego/host',
  sessionStorage: 'use a @lunego storage adapter',
  AudioContext: 'use @lunego/audio',
  HTMLAudioElement: 'use @lunego/audio',
  Image: 'use @lunego/render-pixi textures',
  eval: 'dynamic code evaluation is not deterministic',
  Function: 'dynamic code evaluation is not deterministic',
  fetch: 'use @lunego content/texture loaders',
  WebSocket: 'use a @lunego network adapter',
  requestAnimationFrame: 'use createViewLoop from @lunego/host',
  performance: 'use createViewLoop elapsed/frame time',
  getComputedStyle: 'use @lunego/ui layout helpers',
}

const localViewportNames: Readonly<Record<string, true>> = {
  worldToScreen: true,
  screenToWorld: true,
  cameraX: true,
  cameraY: true,
  bodyCenter: true,
  anchorOf: true,
}

const platformRoots: Readonly<Record<string, true>> = {
  document: true,
  window: true,
  globalThis: true,
  localStorage: true,
  sessionStorage: true,
  navigator: true,
  performance: true,
  location: true,
  history: true,
}

const platformFunctions: Readonly<Record<string, true>> = {
  eval: true,
  Function: true,
  setTimeout: true,
  setInterval: true,
  requestAnimationFrame: true,
  fetch: true,
}

const debugAllowedMembers: Readonly<Record<string, true>> = {
  __luneGame: true,
  __luneDebug: true,
  __playwright: true,
}

function isTypePosition(node: TSESTree.Node): boolean {
  let current: TSESTree.Node = node
  let parent: TSESTree.Node | null = current.parent ?? null
  while (parent !== null) {
    if (parent.type === 'TSAsExpression') {
      return parent.typeAnnotation === current
    }
    if (parent.type === 'TSTypeAnnotation' || parent.type.startsWith('TS')) {
      return true
    }
    if (
      parent.type === 'ExportNamedDeclaration' ||
      parent.type === 'ExportDefaultDeclaration' ||
      parent.type === 'Program'
    ) {
      return false
    }
    current = parent
    parent = current.parent ?? null
  }
  return false
}

function isReferenceIdentifier(node: TSESTree.Identifier): boolean {
  const parent = node.parent
  if (parent == null) {
    return false
  }
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
    return false
  }
  if (
    (parent.type === 'Property' ||
      parent.type === 'MethodDefinition' ||
      parent.type === 'PropertyDefinition') &&
    parent.key === node &&
    !parent.computed
  ) {
    return false
  }
  if (
    parent.type === 'ImportSpecifier' ||
    parent.type === 'ImportDefaultSpecifier' ||
    parent.type === 'ImportNamespaceSpecifier'
  ) {
    return false
  }
  return true
}

function rootIdentifier(node: TSESTree.Node): TSESTree.Identifier | null {
  let current = node
  for (;;) {
    if (current.type === 'Identifier') {
      return current
    }
    if (current.type === 'MemberExpression') {
      current = current.object
      continue
    }
    return null
  }
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node
  while (
    current.type === 'TSAsExpression' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSInstantiationExpression'
  ) {
    current = current.expression
  }
  return current
}

function isOutermostMember(node: TSESTree.MemberExpression): boolean {
  const parent = node.parent
  return !(parent?.type === 'MemberExpression' && parent.object === node)
}

function insideRenderBinding(node: TSESTree.Node): boolean {
  let parent = node.parent
  while (parent != null) {
    if (parent.type === 'CallExpression' && parent.callee.type === 'Identifier') {
      if (parent.callee.name === 'defineRenderBinding') {
        return true
      }
    }
    if (parent.type === 'FunctionDeclaration' || parent.type === 'Program') {
      return false
    }
    parent = parent.parent
  }
  return false
}

export const lg016 = createRule<Options, MessageIds>({
  name: 'lg016',
  meta: {
    type: 'problem',
    docs: {
      description:
        'LG016: game code may only use LuneGo packages; no platform, camera, viewport or asset duplication.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedImports: { type: 'array', items: { type: 'string' } },
          debugComment: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenImport:
        'LG016: game code must not import "{{source}}"; use a @lunego/* API or add the capability to the framework first.',
      forbiddenGlobal:
        'LG016: "{{name}}" is platform/engine access from game code ({{reason}}).',
      localViewport:
        'LG016: do not implement local viewport/camera/anchor "{{name}}"; use renderer.viewport or renderSystem.anchorOf.',
      bindingSize:
        'LG016: do not hard-code {{field}} in a render binding; read it from manifest/DisplaySpec/measure.',
      debugMutation:
        'LG016: @lunego/debug-entry files must only expose read-only handles; "{{name}}" mutates platform state.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const allowed = new Set(options.allowedImports ?? ['vitest'])
    const debugComment = options.debugComment ?? '@lunego/debug-entry'
    const comments = context.sourceCode.getAllComments()
    const debugEntry = comments.some((comment) => comment.value.includes(debugComment))

    const report = (node: TSESTree.Node, messageId: MessageIds, data: Record<string, string>): void => {
      context.report({ node, messageId, data })
    }

    return {
      ImportDeclaration(node) {
        const source = typeof node.source.value === 'string' ? node.source.value : ''
        if (source.length === 0) {
          return
        }
        const relative = source.startsWith('.') || source.startsWith('/')
        const lunego = source.startsWith('@lunego/')
        if (source === '@lunego/core/internal') {
          report(node, 'forbiddenImport', { source })
          return
        }
        if (relative || (lunego && !source.startsWith('@lunego/core/internal'))) {
          return
        }
        if (allowed.has(source) || source.startsWith('node:test')) {
          return
        }
        report(node, 'forbiddenImport', { source })
      },
      Identifier(node) {
        if (debugEntry || isTypePosition(node) || !isReferenceIdentifier(node)) {
          return
        }
        const reason = forbiddenGlobals[node.name]
        if (reason !== undefined) {
          report(node, 'forbiddenGlobal', { name: node.name, reason })
        }
      },
      MemberExpression(node) {
        if (debugEntry) {
          if (!isOutermostMember(node)) {
            return
          }
          const root = rootIdentifier(node.object)?.name ?? null
          const property = node.property.type === 'Identifier'
            ? node.property.name
            : node.property.type === 'Literal' && typeof node.property.value === 'string'
              ? node.property.value
              : null
          if (
            root !== null &&
            platformRoots[root] === true &&
            property !== null &&
            debugAllowedMembers[property] !== true
          ) {
            report(node, 'debugMutation', { name: `${root}.${property}` })
          }
          return
        }
        if (node.object.type === 'Identifier' && node.object.name === 'globalThis') {
          const name = node.property.type === 'Identifier'
            ? node.property.name
            : node.property.type === 'Literal' && typeof node.property.value === 'string'
              ? node.property.value
              : null
          if (name !== null) {
            const reason = forbiddenGlobals[name]
            if (reason !== undefined) {
              report(node, 'forbiddenGlobal', { name: `globalThis.${name}`, reason })
            }
          }
        }
      },
      FunctionDeclaration(node) {
        if (node.id !== null && localViewportNames[node.id.name] === true) {
          report(node, 'localViewport', { name: node.id.name })
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && localViewportNames[node.id.name] === true) {
          report(node, 'localViewport', { name: node.id.name })
        }
      },
      CallExpression(node) {
        if (debugEntry) {
          if (node.callee.type === 'Identifier' && platformFunctions[node.callee.name] === true) {
            report(node, 'debugMutation', { name: node.callee.name })
            return
          }
        }
        if (node.callee.type === 'Identifier' && localViewportNames[node.callee.name] === true) {
          report(node, 'localViewport', { name: node.callee.name })
          return
        }
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'rectSpec' &&
          insideRenderBinding(node)
        ) {
          for (const argument of node.arguments.slice(0, 2)) {
            const value = unwrap(argument)
            if (value.type === 'Literal' && typeof value.value === 'number') {
              report(value, 'bindingSize', { field: 'rectSpec' })
            }
          }
        }
      },
      LogicalExpression(node) {
        if (node.operator !== '??' || !insideRenderBinding(node)) {
          return
        }
        const left = unwrap(node.left)
        if (left.type === 'MemberExpression') {
          const property = left.property
          const name = property.type === 'Identifier'
            ? property.name
            : property.type === 'Literal' && typeof property.value === 'string'
              ? property.value
              : null
          if (
            (name === 'width' || name === 'height') &&
            unwrap(node.right).type === 'Literal' &&
            typeof (unwrap(node.right) as TSESTree.Literal).value === 'number'
          ) {
            report(unwrap(node.right), 'bindingSize', { field: name })
          }
        }
      },
      AssignmentExpression(node) {
        const left = node.left
        if (!insideRenderBinding(node) || left.type !== 'MemberExpression') {
          return
        }
        const property = left.property
        const name = property.type === 'Identifier'
          ? property.name
          : property.type === 'Literal' && typeof property.value === 'string'
            ? property.value
            : null
        if (name !== 'width' && name !== 'height') {
          return
        }
        const right = unwrap(node.right)
        if (right.type === 'Literal' && typeof right.value === 'number') {
          report(right, 'bindingSize', { field: name })
        }
      },
      Property(node) {
        if (!insideRenderBinding(node)) {
          return
        }
        const key = node.key.type === 'Identifier'
          ? node.key.name
          : node.key.type === 'Literal' && typeof node.key.value === 'string'
            ? node.key.value
            : null
        if (key !== 'width' && key !== 'height') {
          return
        }
        const value = unwrap(node.value)
        if (value.type === 'Literal' && typeof value.value === 'number') {
          report(value, 'bindingSize', { field: key })
        }
      },
    }
  },
})
