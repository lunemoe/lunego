import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { importAseprite, parseAsepriteJson } from './aseprite.js'
import { atlasAssetEntry, atlasManifest, packAtlas, type AtlasInput } from './atlas.js'
import { isRecord, type AssetAnchor, type AssetEntry, type AssetManifest } from './assets-schema.js'
import { readAssetManifest } from './assets-manifest.js'
import { generateAssets } from './assets.js'
import { importLdtk, parseLdtkJson, type LdtkResolvedTileset } from './ldtk.js'
import { decodePng } from './png.js'
import { pathExists, toPosix } from './project.js'

interface ParsedArgs {
  readonly flags: ReadonlySet<string>
  readonly options: ReadonlyMap<string, string>
  readonly positional: readonly string[]
}

const IMPORT_VALUE_FLAGS: ReadonlySet<string> = new Set(['--id', '--file', '--png', '--anchor', '--pack', '--id-prefix'])
const PACK_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--out',
  '--manifest',
  '--width',
  '--padding',
  '--asset-id',
  '--pack',
])

function parseArgs(args: readonly string[], valueFlags: ReadonlySet<string>): ParsedArgs {
  const flags = new Set<string>()
  const options = new Map<string, string>()
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const equals = arg.indexOf('=')
    if (equals !== -1) {
      options.set(arg.slice(0, equals), arg.slice(equals + 1))
    } else if (valueFlags.has(arg)) {
      const value = args[index + 1]
      if (value === undefined) {
        throw new Error(`${arg} requires a value`)
      }
      options.set(arg, value)
      index += 1
    } else {
      flags.add(arg)
    }
  }
  return { flags, options, positional }
}

function assetRelative(cwd: string, file: string): string {
  const assetsRoot = join(cwd, 'assets')
  const relativePath = toPosix(relative(assetsRoot, resolve(cwd, file)))
  if (relativePath.startsWith('..') || relativePath.length === 0) {
    throw new Error(`${file} must live inside assets/`)
  }
  return relativePath
}

function readNumberOption(options: ReadonlyMap<string, string>, name: string): number | undefined {
  const value = options.get(name)
  if (value === undefined) {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`)
  }
  return parsed
}

async function writeManifestEntries(
  cwd: string,
  entries: readonly AssetEntry[],
  pack: string | undefined,
): Promise<string> {
  const path = join(cwd, 'assets', 'manifest.json')
  let manifest: AssetManifest
  if (await pathExists(path)) {
    const read = await readAssetManifest(cwd)
    if (read.manifest === undefined) {
      throw new Error(read.errors[0] ?? 'assets/manifest.json could not be read')
    }
    manifest = read.manifest
    if (!Array.isArray(manifest.assets)) {
      throw new Error('assets/manifest.json requires an assets array')
    }
  } else {
    manifest = { pack: pack ?? 'assets', version: 1, assets: [] }
  }
  const assets = [...manifest.assets]
  for (const entry of entries) {
    const index = assets.findIndex((candidate) => candidate.id === entry.id)
    if (index === -1) {
      assets.push(entry)
    } else {
      assets[index] = entry
    }
  }
  const next: AssetManifest = { ...manifest, assets }
  await mkdir(join(cwd, 'assets'), { recursive: true })
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return path
}

async function importAsepriteCommand(cwd: string, args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args, IMPORT_VALUE_FLAGS)
  const jsonPath = parsed.positional[0]
  if (jsonPath === undefined) {
    throw new Error('usage: lunego assets import aseprite <file.json> [--png file.png] [--id id] [--write]')
  }
  const sourcePath = resolve(cwd, jsonPath)
  const pngPath = resolve(cwd, parsed.options.get('--png') ?? sourcePath.replace(/\.json$/i, '.png'))
  if (!(await pathExists(pngPath))) {
    throw new Error(`aseprite PNG is missing: ${pngPath}`)
  }
  const image = decodePng(await readFile(pngPath))
  const id = parsed.options.get('--id') ?? basename(sourcePath).replace(/\.json$/i, '')
  const file = parsed.options.get('--file') ?? assetRelative(cwd, pngPath)
  const anchor = parsed.options.get('--anchor')
  const result = importAseprite(parseAsepriteJson(await readFile(sourcePath, 'utf8')), {
    id,
    file,
    imageWidth: image.width,
    imageHeight: image.height,
    ...(anchor === undefined ? {} : { anchor: anchor as AssetAnchor }),
  })
  for (const warning of result.warnings) {
    console.error(warning)
  }
  if (parsed.flags.has('--write')) {
    const path = await writeManifestEntries(cwd, [result.entry], parsed.options.get('--pack'))
    console.log(`wrote ${id} to ${toPosix(relative(cwd, path))}`)
  } else {
    console.log(JSON.stringify(result.entry, null, 2))
  }
  return 0
}

function ldtkTilesetPaths(json: unknown): string[] {
  if (!isRecord(json)) {
    return []
  }
  const defs = json['defs']
  if (!isRecord(defs) || !Array.isArray(defs['tilesets'])) {
    return []
  }
  const paths: string[] = []
  for (const tileset of defs['tilesets']) {
    if (isRecord(tileset) && typeof tileset['relPath'] === 'string') {
      paths.push(tileset['relPath'])
    }
  }
  return paths
}

async function importLdtkCommand(cwd: string, args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args, IMPORT_VALUE_FLAGS)
  const jsonPath = parsed.positional[0]
  if (jsonPath === undefined) {
    throw new Error('usage: lunego assets import ldtk <file.ldtk> [--id-prefix prefix] [--write]')
  }
  const sourcePath = resolve(cwd, jsonPath)
  const json = parseLdtkJson(await readFile(sourcePath, 'utf8'))
  const resolved = new Map<string, LdtkResolvedTileset>()
  for (const relPath of ldtkTilesetPaths(json)) {
    const absolute = resolve(dirname(sourcePath), relPath)
    if (!(await pathExists(absolute))) {
      continue
    }
    const image = decodePng(await readFile(absolute))
    resolved.set(relPath, {
      file: assetRelative(cwd, absolute),
      width: image.width,
      height: image.height,
    })
  }
  const prefix = parsed.options.get('--id-prefix') ?? ''
  const result = importLdtk(json, {
    idPrefix: prefix,
    resolve: (relPath) => resolved.get(relPath),
  })
  for (const warning of result.warnings) {
    console.error(warning)
  }
  if (parsed.flags.has('--write')) {
    const path = await writeManifestEntries(cwd, result.entries, parsed.options.get('--pack'))
    console.log(`wrote ${result.entries.length} tilesets to ${toPosix(relative(cwd, path))}`)
  } else {
    console.log(JSON.stringify(result.entries, null, 2))
  }
  return 0
}

function parseAtlasInputs(positional: readonly string[]): AtlasInput[] {
  return positional.map((item) => {
    const equals = item.indexOf('=')
    if (equals > 0) {
      return { id: item.slice(0, equals), path: item.slice(equals + 1) }
    }
    return { id: basename(item).replace(/\.[^.]+$/, ''), path: item }
  })
}

async function packCommand(cwd: string, args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args, PACK_VALUE_FLAGS)
  const out = parsed.options.get('--out')
  const manifestPath = parsed.options.get('--manifest')
  if (out === undefined || manifestPath === undefined) {
    throw new Error(
      'usage: lunego assets pack --out atlas.png --manifest atlas.json [--width 512] [--padding 0] id=image.png...',
    )
  }
  const inputs = parseAtlasInputs(parsed.positional).map((input) => ({
    ...input,
    path: resolve(cwd, input.path),
  }))
  const width = readNumberOption(parsed.options, '--width')
  const padding = readNumberOption(parsed.options, '--padding')
  const result = await packAtlas(inputs, {
    ...(width === undefined ? {} : { width }),
    ...(padding === undefined ? {} : { padding }),
  })
  const outPath = resolve(cwd, out)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, result.png)
  const file = assetRelative(cwd, outPath)
  const manifest = atlasManifest(result, file)
  const manifestFile = resolve(cwd, manifestPath)
  await mkdir(dirname(manifestFile), { recursive: true })
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const assetId = parsed.options.get('--asset-id')
  if (assetId !== undefined) {
    await writeManifestEntries(cwd, [atlasAssetEntry(assetId, file, result)], parsed.options.get('--pack'))
  }
  console.log(`packed ${result.frames.length} frames into ${file} (${result.width}x${result.height})`)
  return 0
}

async function checkOrBuild(cwd: string, build: boolean): Promise<number> {
  const result = await generateAssets(cwd)
  if (result === null) {
    console.error('LG009 assets/manifest.json is missing')
    return 1
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error)
    }
    return 1
  }
  if (build) {
    await mkdir(join(result.path, '..'), { recursive: true })
    await writeFile(result.path, result.source, 'utf8')
    console.log('assets/manifest.json is valid; wrote features/_generated/assets.ts')
    return 0
  }
  const current = (await pathExists(result.path)) ? await readFile(result.path, 'utf8') : null
  if (current !== result.source) {
    console.error('LG014 features/_generated/assets.ts is stale; run lunego assets build')
    return 1
  }
  console.log('assets/manifest.json is valid and generated assets are up to date')
  return 0
}

export async function runAssets(cwd: string, params: readonly string[]): Promise<number> {
  const [command, ...rest] = params
  if (command === undefined || command === 'check') {
    return checkOrBuild(cwd, false)
  }
  if (command === 'build') {
    return checkOrBuild(cwd, true)
  }
  if (command === 'pack') {
    return packCommand(cwd, rest)
  }
  if (command === 'import') {
    const [kind, ...importArgs] = rest
    if (kind === 'aseprite') {
      return importAsepriteCommand(cwd, importArgs)
    }
    if (kind === 'ldtk') {
      return importLdtkCommand(cwd, importArgs)
    }
    throw new Error('usage: lunego assets import <aseprite|ldtk> <file>')
  }
  throw new Error('usage: lunego assets <check|build|pack|import aseprite|import ldtk>')
}
