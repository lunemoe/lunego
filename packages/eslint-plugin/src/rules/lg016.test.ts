import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import { parser } from 'typescript-eslint'
import { lg016 } from './lg016.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
})

const gameFile = 'games/demo/src/main.ts'
const viewFile = 'games/demo/src/view/render.ts'

ruleTester.run('lg016', lg016, {
  valid: [
    'import { World } from "@lunego/core"',
    'import { createViewLoop } from "@lunego/host"',
    'import { createUiBridge } from "@lunego/ui"',
    'import { thing } from "./local.js"',
    'import { describe, it } from "vitest"',
    'const screen = renderer.viewport.worldToScreen(1, 2)',
    'const feet = renderSystem.anchorOf(entity, "feet")',
    {
      code: '// @lunego/debug-entry\nconst value = globalThis.__luneDebug',
      filename: 'games/demo/src/debug.ts',
    },
  ],
  invalid: [
    { code: 'import { Texture } from "pixi.js"', filename: gameFile, errors: [{ messageId: 'forbiddenImport' }] },
    { code: 'import { createSignal } from "solid-js"', filename: gameFile, errors: [{ messageId: 'forbiddenImport' }] },
    { code: 'import fs from "node:fs"', filename: gameFile, errors: [{ messageId: 'forbiddenImport' }] },
    { code: 'import { x } from "lodash"', filename: gameFile, errors: [{ messageId: 'forbiddenImport' }] },
    { code: 'import { worldInternals } from "@lunego/core/internal"', filename: gameFile, errors: [{ messageId: 'forbiddenImport' }] },
    { code: 'const el = document.body', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'const el = window.location', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'const now = performance.now()', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'requestAnimationFrame(() => {})', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'localStorage.setItem("x", "1")', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'const cameraX = 0', filename: gameFile, errors: [{ messageId: 'localViewport' }] },
    { code: 'function worldToScreen() {}', filename: gameFile, errors: [{ messageId: 'localViewport' }] },
    { code: 'anchorOf(1)', filename: gameFile, errors: [{ messageId: 'localViewport' }] },
    {
      code: 'defineRenderBinding({ create: () => ({ kind: "rect", width: 16, height: 8 }) })',
      filename: viewFile,
      errors: [{ messageId: 'bindingSize' }, { messageId: 'bindingSize' }],
    },
    {
      code: '// @lunego/debug-entry\ndocument.body.appendChild(node)',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: '// @lunego/debug-entry\nimport { Texture } from "pixi.js"',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'forbiddenImport' }],
    },
    {
      code: '// @lunego/debug-entry\nwindow.__p9 = debug',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: '// @lunego/debug-entry\ndocument.title',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: '// @lunego/debug-entry\nwindow.setTimeout(() => {}, 0)',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: '// @lunego/debug-entry\nglobalThis.document',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: '// @lunego/debug-entry\nFunction("return 1")',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: '// @lunego/debug-entry\nglobalThis.eval("1")',
      filename: 'games/demo/src/debug.ts',
      errors: [{ messageId: 'debugMutation' }],
    },
    {
      code: 'defineRenderBinding({ create: () => rectSpec(8 as number, 8 as number, 0xffffff as number) })',
      filename: gameFile,
      errors: [{ messageId: 'bindingSize' }, { messageId: 'bindingSize' }],
    },
    {
      code: 'defineRenderBinding({ create: () => ({ width: 16 as number }) })',
      filename: gameFile,
      errors: [{ messageId: 'bindingSize' }],
    },
    {
      code: 'defineRenderBinding({ update: (object) => { object.width = 16 as number } })',
      filename: gameFile,
      errors: [{ messageId: 'bindingSize' }],
    },
    { code: 'const el = globalThis.document.body', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'const el = globalThis.window', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'const now = globalThis.performance.now()', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'globalThis.eval("1")', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    { code: 'const F = globalThis.Function', filename: gameFile, errors: [{ messageId: 'forbiddenGlobal' }] },
    {
      code: 'defineRenderBinding({ update: (object) => { object.width = 16 } })',
      filename: viewFile,
      errors: [{ messageId: 'bindingSize' }],
    },
    {
      code: 'defineRenderBinding({ update: (object) => { object.width = 16 } })',
      filename: gameFile,
      errors: [{ messageId: 'bindingSize' }],
    },
    {
      code: 'defineRenderBinding({ update: (object) => { object.width = object.width ?? 8 } })',
      filename: viewFile,
      errors: [{ messageId: 'bindingSize' }],
    },
    {
      code: 'defineRenderBinding({ create: () => rectSpec(8, 8) })',
      filename: viewFile,
      errors: [{ messageId: 'bindingSize' }, { messageId: 'bindingSize' }],
    },
  ],
})
