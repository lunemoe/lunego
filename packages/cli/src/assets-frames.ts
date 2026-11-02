import { ASSET_ANCHORS, isRecord, type AssetEntry } from './assets-schema.js'
import type { PngImage } from './png.js'

export function positiveInteger(value: unknown, label: string, errors: string[]): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    errors.push(`LG009 ${label} must be a positive integer`)
    return false
  }
  return true
}

export function nonNegativeInteger(value: unknown, label: string, errors: string[]): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`LG009 ${label} must be a non-negative integer`)
    return false
  }
  return true
}

export function validateAnchor(anchor: unknown, label: string, errors: string[]): void {
  if (typeof anchor === 'string') {
    if (!(ASSET_ANCHORS as readonly string[]).includes(anchor)) {
      errors.push(`LG009 ${label} anchor is not recognized: ${anchor}`)
    }
    return
  }
  if (isRecord(anchor)) {
    const x = anchor['x']
    const y = anchor['y']
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    ) {
      errors.push(`LG009 ${label} anchor must have normalized x/y between 0 and 1`)
    }
    return
  }
  errors.push(`LG009 ${label} anchor must be a known name or {x,y}`)
}

export function validateFrameRect(
  rect: unknown,
  label: string,
  image: PngImage,
  errors: string[],
): void {
  if (!isRecord(rect)) {
    errors.push(`LG009 ${label} must be an object with x/y/width/height`)
    return
  }
  const valid =
    Number.isInteger(rect['x']) &&
    Number.isInteger(rect['y']) &&
    Number.isInteger(rect['width']) &&
    Number.isInteger(rect['height'])
  if (!valid) {
    errors.push(`LG009 ${label} x/y/width/height must be integers`)
    return
  }
  const x = rect['x'] as number
  const y = rect['y'] as number
  const width = rect['width'] as number
  const height = rect['height'] as number
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    errors.push(`LG009 ${label} has a non-positive or negative rectangle`)
  } else if (x + width > image.width || y + height > image.height) {
    errors.push(
      `LG009 ${label} [${x},${y},${width},${height}] exceeds image ${image.width}x${image.height}`,
    )
  }
}

export function validateAnimation(
  animation: unknown,
  entry: AssetEntry,
  frameCount: number | undefined,
  errors: string[],
): void {
  if (!isRecord(animation)) {
    errors.push(`LG009 ${entry.id} animation must be an object`)
    return
  }
  const name = animation['name']
  if (typeof name !== 'string' || name.length === 0) {
    errors.push(`LG009 ${entry.id} animation name must be non-empty`)
    return
  }
  const label = `asset ${entry.id} animation ${name}`
  if (animation['fps'] !== undefined && animation['fps'] !== null) {
    const fps = animation['fps']
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
      errors.push(`LG009 ${label}.fps must be positive or null`)
    }
  }
  if (animation['loop'] !== undefined && typeof animation['loop'] !== 'boolean') {
    errors.push(`LG009 ${label}.loop must be a boolean`)
  }
  const columns = animation['columns']
  const frames = animation['frames']
  const from = animation['from']
  let playbackCount: number | undefined
  if (columns !== undefined) {
    if (!Array.isArray(columns)) {
      errors.push(`LG009 ${label}.columns must be an array of frame indices`)
    } else if (columns.length === 0) {
      errors.push(`LG009 ${label}.columns must not be empty`)
    } else {
      for (const value of columns) {
        if (!nonNegativeInteger(value, `${label}.columns`, errors)) {
          continue
        }
        if (frameCount !== undefined && value >= frameCount) {
          errors.push(`LG009 ${label} frame ${value} exceeds ${frameCount} frames`)
        }
      }
      playbackCount = columns.length
      if (frames !== undefined && frames !== columns.length) {
        errors.push(`LG009 ${label}.frames ${String(frames)} must equal columns.length ${columns.length}`)
      }
      if (from !== undefined) {
        errors.push(`LG009 ${label} cannot combine columns with from`)
      }
    }
  } else if (from !== undefined || frames !== undefined) {
    const start = from === undefined ? 0 : from
    if (!nonNegativeInteger(start, `${label}.from`, errors)) {
      playbackCount = undefined
    } else if (!positiveInteger(frames, `${label}.frames`, errors)) {
      playbackCount = undefined
    } else {
      playbackCount = frames
      if (frameCount !== undefined && start + frames > frameCount) {
        errors.push(`LG009 ${label} range ${start}..${start + frames - 1} exceeds ${frameCount} frames`)
      }
    }
  } else {
    errors.push(`LG009 ${label} requires columns or from/frames`)
  }
  const durations = animation['durations']
  if (durations !== undefined) {
    if (!Array.isArray(durations) || durations.length === 0) {
      errors.push(`LG009 ${label}.durations must be a non-empty array`)
    } else {
      for (const value of durations) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(`LG009 ${label}.durations entries must be positive milliseconds`)
          break
        }
      }
      if (playbackCount !== undefined && durations.length !== playbackCount) {
        errors.push(`LG009 ${label}.durations length ${durations.length} must equal ${playbackCount}`)
      }
    }
  }
}

export function validateGrid(entry: AssetEntry, image: PngImage, errors: string[]): number | undefined {
  const frameWidth = entry.frameWidth
  const frameHeight = entry.frameHeight
  if (frameWidth === undefined || frameHeight === undefined) {
    if (entry.columns !== undefined || entry.rows !== undefined || entry.frames !== undefined) {
      errors.push(`LG009 asset ${entry.id} needs frameWidth and frameHeight for grid frames`)
    }
    return undefined
  }
  const margin = entry.margin ?? 0
  const spacing = entry.spacing ?? 0
  const columns = entry.columns
  const rows = entry.rows
  const count = typeof entry.frames === 'number' ? entry.frames : undefined
  const derivedColumns =
    columns ?? (rows !== undefined && count !== undefined ? Math.ceil(count / rows) : undefined)
  const derivedRows =
    rows ?? (columns !== undefined && count !== undefined ? Math.ceil(count / columns) : undefined)
  if (derivedColumns !== undefined) {
    const expectedWidth = margin * 2 + derivedColumns * frameWidth + (derivedColumns - 1) * spacing
    if (expectedWidth !== image.width) {
      errors.push(
        `LG009 asset ${entry.id} frameWidth ${frameWidth} x columns ${derivedColumns} needs width ${expectedWidth}, image is ${image.width}`,
      )
    }
  }
  if (derivedRows !== undefined) {
    const expectedHeight = margin * 2 + derivedRows * frameHeight + (derivedRows - 1) * spacing
    if (expectedHeight !== image.height) {
      errors.push(
        `LG009 asset ${entry.id} frameHeight ${frameHeight} x rows ${derivedRows} needs height ${expectedHeight}, image is ${image.height}`,
      )
    }
  }
  const maxColumns = Math.floor((image.width - margin * 2 + spacing) / (frameWidth + spacing))
  const maxRows = Math.floor((image.height - margin * 2 + spacing) / (frameHeight + spacing))
  const available = Math.max(0, maxColumns) * Math.max(0, maxRows)
  if (count !== undefined && count > available) {
    errors.push(`LG009 asset ${entry.id} frames ${count} exceeds the ${available} cells in the image`)
  }
  return count ?? (columns !== undefined && rows !== undefined ? columns * rows : undefined)
}
