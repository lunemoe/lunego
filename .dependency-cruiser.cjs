/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'game-lunego-only-platform',
      severity: 'error',
      comment: 'Game/template code uses LuneGo APIs, never engine/platform packages.',
      from: {
        path: '(?:^|/)(games|features|kits|templates)/',
        pathNot: 'tests/browser|\\.spec\\.ts$|__tests__|\\.test\\.ts$',
      },
      to: { path: '(?:^|/)node_modules/(pixi\\.js|solid-js)|(?:^|/)@lunego/core/(?:dist/)?internal' },
    },
    {
      name: 'game-no-node-builtins',
      severity: 'error',
      comment: 'Game/template runtime code must not use Node builtins.',
      from: {
        path: '(?:^|/)(games|features|kits|templates)/',
        pathNot: 'tests/browser|\\.spec\\.ts$|__tests__|\\.test\\.ts$',
      },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'game-no-core-internal',
      severity: 'error',
      comment: 'Game/template code cannot reach core internals.',
      from: { path: '(?:^|/)(games|features|kits|templates)/' },
      to: { path: '(?:^|/)@lunego/core/(?:dist/)?internal' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make ownership and scheduling unreadable.',
      from: {},
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'core-internal-scope',
      severity: 'error',
      comment:
        'The internal capability subpath is reserved for the host bridge, testkit and framework tests.',
      from: {
        pathNot:
          '(?:^|/)packages/(core|host|testkit|eslint-plugin)/',
      },
      to: {
        path: '(?:^|/)packages/core/src/(internal|world-internals)\\.ts$',
      },
    },
    {
      name: 'no-unresolved',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'core-zero-dependencies',
      severity: 'error',
      comment: 'core must not depend on any package or Node builtin.',
      from: {
        path: '^packages/core/src',
        pathNot: '__tests__|\\.test\\.ts$',
      },
      to: {
        pathNot: '^packages/core/src',
      },
    },
    {
      name: 'logic-no-view-imports',
      severity: 'error',
      comment: 'Logic may not import view packages or view implementations.',
      from: {
        path: '(?:^|/)(packages/core/src|packages/testkit/src|features/[^/]+/logic|kits/[^/]+/logic)',
      },
      to: {
        path: '(?:^|/)(packages/(render-pixi|vfx|ui|input|audio)|features/[^/]+/view|kits/[^/]+/view)',
      },
    },
    {
      name: 'logic-no-host-imports',
      severity: 'error',
      comment: 'Logic depends on core, not on the host bridge.',
      from: {
        path: '(?:^|/)(packages/core/src|features/[^/]+/logic|kits/[^/]+/logic)',
      },
      to: {
        path: '(?:^|/)packages/host/',
      },
    },
    {
      name: 'logic-no-platform-packages',
      severity: 'error',
      comment: 'Logic must not reach render/UI/audio/input or Node builtins.',
      from: {
        path: '(?:^|/)(packages/core/src|packages/testkit/src|features/[^/]+/logic|kits/[^/]+/logic)',
      },
      to: {
        path: '(^|/)(pixi\\.js|solid-js|@lunego/(host|render-pixi|ui|input|audio))(/|$)',
      },
    },
    {
      name: 'feature-schema-only',
      severity: 'error',
      comment: 'A feature may import another feature only through its schema.ts.',
      from: {
        path: '(?:^|/)features/([^/]+)/',
      },
      to: {
        path: '(?:^|/)features/(?!$1/)',
        pathNot: '(^|/)schema\\.ts$',
      },
    },
    {
      name: 'view-no-logic-implementation',
      severity: 'error',
      comment: 'Views consume schema.ts, never logic implementation files.',
      from: {
        path: '(?:^|/)features/([^/]+)/view/',
      },
      to: {
        path: '(?:^|/)features/[^/]+/logic/',
      },
    },
    {
      name: 'kits-no-game-code',
      severity: 'error',
      comment: 'Kits are framework code and never import game or content code.',
      from: { path: '(?:^|/)kits/' },
      to: { path: '(?:^|/)(features|games|content)/' },
    },
    {
      name: 'kits-direction',
      severity: 'error',
      comment: 'Kits may depend on core and other kits, not view/host packages.',
      from: { path: '(?:^|/)kits/' },
      to: {
        path: '(?:^|/)packages/',
        pathNot: '(?:^|/)packages/core/',
      },
    },
    {
      name: 'packages-no-game-code',
      severity: 'error',
      comment: 'Framework packages never import game or content code.',
      from: {
        path: '(?:^|/)packages/',
      },
      to: {
        path: '(?:^|/)(features|games|content)/',
      },
    },
    {
      name: 'host-only-core',
      severity: 'error',
      comment: 'The host bridges core and view; it must not depend on view packages.',
      from: { path: '(?:^|/)packages/host/' },
      to: {
        path: '^packages/',
        pathNot: '^packages/(core|host)/',
      },
    },
    {
      name: 'host-does-not-import-view',
      severity: 'error',
      comment: 'The host bridges logic and view; it does not render.',
      from: { path: '(?:^|/)packages/host/' },
      to: { path: '^packages/(render-pixi|vfx|ui|input|audio)/' },
    },
    {
      name: 'view-packages-direction',
      severity: 'error',
      comment: 'View packages depend on core/host, not on each other.',
      from: { path: '^packages/(render-pixi|vfx|ui|input|audio)/' },
      to: {
        path: '^packages/',
        pathNot: '(?:^|/)packages/(core|host|vfx|render-pixi|ui|input|audio)/',
      },
    },
    {
      name: 'logic-no-node-builtins',
      severity: 'error',
      comment: 'Logic must run in any JS engine; no Node builtins.',
      from: {
        path: '(?:^|/)(packages/core/src|packages/testkit/src|features/[^/]+/logic|kits/[^/]+/logic)',
        pathNot: '__tests__|\\.test\\.ts$',
      },
      to: { dependencyTypes: ['core'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|packages/cli/templates|e2e)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
