import { resolve } from 'node:path'
import { runAssets } from './assets-cli.js'
import { generate } from './gen.js'
import { newGame } from './new.js'
import { runCheck } from './check.js'

export async function main(args: readonly string[], cwd = process.cwd()): Promise<number> {
  const rest: string[] = []
  let workingDir = cwd
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--cwd') {
      const value = args[index + 1]
      if (value === undefined) {
        console.error('--cwd requires a path')
        return 2
      }
      workingDir = resolve(value)
      index += 1
    } else {
      rest.push(args[index])
    }
  }
  const [command, ...params] = rest
  try {
    if (command === 'gen') {
      const check = params.includes('--check')
      const result = await generate(workingDir, check)
      if (result.errors.length > 0) {
        for (const error of result.errors) {
          console.error(error)
        }
        return 1
      }
      console.log(check ? 'generated files are up to date' : `generated ${result.files.length} files`)
      return 0
    }
    if (command === 'new') {
      const [kind, name] = params
      if (kind !== 'game' || name === undefined) {
        console.error('usage: lunego new game <name>')
        return 2
      }
      const result = await newGame(workingDir, name)
      console.log(`created ${result.target}`)
      return 0
    }
    if (command === 'assets') {
      return runAssets(workingDir, params)
    }
    if (command === 'check') {
      const result = await runCheck(workingDir)
      for (const message of result.messages) {
        console.error(message)
      }
      console.log(result.ok ? 'check passed' : 'check failed')
      return result.ok ? 0 : 1
    }
    console.error(
      'usage: lunego <gen [--check]|new game <name>|check|assets <check|build|pack|import>> [--cwd path]',
    )
    return 2
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}
