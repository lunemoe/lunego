import os from 'node:os'
import { performance } from 'node:perf_hooks'
import {
  World,
  defineCommand,
  defineComponent,
  defineFeature,
  defineHandler,
  defineModel,
  defineSystem,
  ok,
  t,
} from '../packages/core/dist/index.js'
import { createGame } from '../packages/host/dist/index.js'
import { modelSnapshot } from '../packages/host/dist/frame.js'
import {
  RenderSystem,
  TilemapView,
  animationFrameAt,
  buildTilemap,
  defineRenderBinding,
  rectSpec,
  sheetFrames,
} from '../packages/render-pixi/dist/index.js'

const N = Number(process.env.BENCH_ENTITIES ?? 10_000)
const SPRITES = Number(process.env.BENCH_SPRITES ?? 5_000)
const iterations = Number(process.env.BENCH_ITERATIONS ?? 120)
const warmup = 10

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const avg = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  return {
    avgMs: Number(avg.toFixed(4)),
    p50Ms: Number(p50.toFixed(4)),
    p95Ms: Number(p95.toFixed(4)),
    minMs: Number((sorted[0] ?? 0).toFixed(4)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(4)),
    samples: samples.length,
  }
}

function measure(fn, count = iterations) {
  for (let index = 0; index < warmup; index += 1) fn()
  const samples = []
  for (let index = 0; index < count; index += 1) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return stats(samples)
}

function heapDelta(fn) {
  const before = process.memoryUsage().heapUsed
  fn()
  return Number(((process.memoryUsage().heapUsed - before) / 1024 / 1024).toFixed(2))
}

const Position = defineComponent('BenchPosition', { x: t.f32, y: t.f32 }, { persist: 'world', interpolate: true })
const Velocity = defineComponent('BenchVelocity', { x: t.f32, y: t.f32 }, { persist: 'world' })
const Counter = defineModel('BenchCounter', { value: t.i32 }, { value: 0 }, { persist: 'world' })
const Pulse = defineCommand('bench.pulse', { amount: t.i32 })
const SpawnMany = defineCommand('bench.spawnMany', { count: t.i32 })

const moveSystem = defineSystem({
  name: 'bench.move',
  phase: 'update',
  reads: [Velocity],
  writes: [Position],
  run(ctx) {
    const position = ctx.write(Position)
    const velocity = ctx.read(Velocity)
    for (const entity of ctx.query(Position, Velocity)) {
      position.x[entity] += velocity.x[entity] * ctx.time.dt
      position.y[entity] += velocity.y[entity] * ctx.time.dt
    }
  },
})
const pulseHandler = defineHandler(Pulse, {
  writes: [Counter],
  run(ctx, payload) {
    ctx.mutModel(Counter).value += payload.amount
    return ok()
  },
})
const spawnHandler = defineHandler(SpawnMany, {
  writes: [Position, Velocity],
  run(ctx, payload) {
    for (let index = 0; index < payload.count; index += 1) {
      ctx.spawn({ BenchPosition: { x: index % 100, y: Math.floor(index / 100) }, BenchVelocity: { x: 0.1, y: 0 } })
    }
    return ok()
  },
})
const feature = defineFeature({
  name: 'bench',
  schema: { components: [Position, Velocity], models: [Counter], commands: [Pulse, SpawnMany] },
  systems: [moveSystem],
  handlers: [pulseHandler, spawnHandler],
})

const logicWorld = new World({ features: [feature], seed: 7 })
for (let index = 0; index < N; index += 1) {
  logicWorld.spawn({
    BenchPosition: { x: index % 100, y: Math.floor(index / 100) },
    BenchVelocity: { x: 0.1, y: 0.05 },
  })
}
void logicWorld.send(Pulse, { amount: 1 })
const logicTick = measure(() => {
  void logicWorld.send(Pulse, { amount: 1 })
  logicWorld.step()
})
const logicHeap = heapDelta(() => {
  for (let index = 0; index < 20; index += 1) {
    void logicWorld.send(Pulse, { amount: 1 })
    logicWorld.step()
  }
})

const worldHash = measure(() => logicWorld.hash())
const worldQuery = measure(() => logicWorld.query(Position))
const interpolationCapture = measure(() => {
  for (const entity of logicWorld.query(Position)) {
    logicWorld.get(entity, Position)
  }
})
const modelRead = measure(() => modelSnapshot(logicWorld, [Counter]))
const game = createGame({ features: [feature], dt: 1 / 60, dev: false, seed: 11 })
void game.send(SpawnMany, { count: N })
void game.send(Pulse, { amount: 1 })
game.step()
const gameStep = measure(() => game.step(1))
const gameUpdate = measure(() => game.update(1 / 60))
const gameFrame = measure(() => game.frame)
const gameHash = measure(() => game.frame.hash)
for (let index = 0; index < 100; index += 1) game.subscribeFrames(() => undefined)
const gameWithUiListeners = measure(() => game.step(1))

const source = {
  alpha: 0.5,
  entities: () => Array.from({ length: SPRITES }, (_, index) => index + 1),
  get: (entity) => ({ x: entity % 100, y: Math.floor(entity / 100) }),
  prev: (entity) => ({ x: entity % 100, y: Math.floor(entity / 100) }),
  has: () => true,
}
const fakeAdapter = {
  handles: [],
  create(spec) {
    const handle = { spec, x: 0, y: 0 }
    this.handles.push(handle)
    return handle
  },
  update(handle, spec) {
    handle.spec = spec
  },
  destroy() {},
  attach() {},
  detach() {},
  order() {},
  setCamera() {},
}
const renderSystem = new RenderSystem(fakeAdapter)
renderSystem.add(defineRenderBinding({
  query: [Position],
  create: () => rectSpec(8, 8, 0xffffff),
  update: (object, view) => {
    const position = view.lerp(Position)
    object.x = position.x
    object.y = position.y
  },
}))
const renderSync = measure(() => renderSystem.sync(source, 1))
const renderHeap = heapDelta(() => {
  for (let index = 0; index < 20; index += 1) renderSystem.sync(source, index)
})

const tileMap = {
  tileset: { texture: 'tiles', tileWidth: 16, tileHeight: 16, columns: 4 },
  layers: [{
    name: 'ground',
    width: 200,
    height: 200,
    tiles: Array.from({ length: 200 * 200 }, (_, index) => index % 4),
  }],
}
let tileCreated = 0
let tileDestroyed = 0
const tileView = new TilemapView({
  create: () => { tileCreated += 1; return tileCreated },
  destroy: () => { tileDestroyed += 1 },
})
const tileBuild = measure(() => buildTilemap(tileMap))
const tileSetMapFull = measure(() => tileView.setMap(tileMap))
const tileFullCount = tileView.count
tileView.setViewport({ x: 0, y: 0, width: 480, height: 270 })
const tileCulledCount = tileView.count
const tileSetMapCulled = measure(() => tileView.setMap(tileMap))
const tileScroll = measure(() => {
  for (let index = 1; index <= 20; index += 1) {
    tileView.setViewport({ x: index * 16, y: 0, width: 480, height: 270 })
  }
})

const frames = sheetFrames({ frameWidth: 16, frameHeight: 16, columns: 8, count: 64 })
const frameLookup = measure(() => {
  for (let index = 0; index < frames.length; index += 1) {
    animationFrameAt({ kind: 'animated', x: 0, y: 0, frame: index, fps: 60, loop: true }, frames, 0)
  }
})
const machine = {
  platform: os.platform(),
  arch: os.arch(),
  cpus: os.cpus()[0]?.model ?? 'unknown',
  node: process.version,
  memoryGB: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
}
const report = {
  machine,
  config: { entities: N, sprites: SPRITES, iterations, warmup },
  logic: {
    ...logicTick,
    heapDeltaMB20: logicHeap,
    hash: worldHash,
    query: worldQuery,
    interpolationCapture,
    modelSnapshot: modelRead,
  },
  host: {
    step: gameStep,
    update: gameUpdate,
    frameRead: gameFrame,
    hashRead: gameHash,
    stepWith100FrameListeners: gameWithUiListeners,
    pendingCommands: game.pendingCommandCount,
  },
  render: { sync: renderSync, heapDeltaMB20: renderHeap, sprites: SPRITES },
  tilemap: {
    build: tileBuild,
    setMapFull: tileSetMapFull,
    setMapCulled: tileSetMapCulled,
    scroll20: tileScroll,
    totalTiles: tileFullCount,
    culledTiles: tileCulledCount,
    created: tileCreated,
    destroyed: tileDestroyed,
  },
  frames: { count: frames.length, lookup64: frameLookup },
  ui: { frameListenerCount: 100, step: gameWithUiListeners },
}
console.log(JSON.stringify(report, null, 2))
