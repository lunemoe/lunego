import type { ContextHost } from './context-host.js'
import type { LogLevel, LogService } from './context-types.js'

export function logService(world: ContextHost, contextName: string): LogService {
  const emit = (level: LogLevel, message: string, data: unknown): void => {
    world.log(level, contextName, message, data)
  }
  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  }
}
