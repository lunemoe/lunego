import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verify } from './verify.mjs'
import { git } from './git.mjs'

export function outgoingUpdates(input) {
  return input.trim().split('\n').filter(Boolean).map(line => {
    const [localRef, local, remoteRef, remote] = line.trim().split(/\s+/)
    if (!localRef || !remoteRef || !/^[0-9a-f]{40,64}$/.test(local ?? '') || !/^[0-9a-f]{40,64}$/.test(remote ?? '')) throw new Error('invalid pre-push update')
    return { local, remote }
  }).filter(update => !/^0+$/.test(update.local))
}

export async function checkHook(root, name, input = '') {
  if (name === 'pre-commit') { await verify(root, { staged: true }); return }
  if (name !== 'pre-push') throw new Error(`unknown quality hook ${name}`)
  const seen = new Set()
  for (const update of outgoingUpdates(input)) {
    const range = /^0+$/.test(update.remote) ? [update.local, '--not', '--remotes'] : [`${update.remote}..${update.local}`]
    const commits = (await git(root, ['rev-list', '--reverse', ...range])).split('\n').filter(Boolean)
    for (const commit of commits) {
      const tree = await git(root, ['rev-parse', `${commit}^{tree}`])
      if (seen.has(tree)) continue
      seen.add(tree)
      await verify(root, { commit })
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === undefined || process.argv[3] === undefined) throw new Error('repository and hook name are required')
    let input = ''
    if (process.argv[3] === 'pre-push') { process.stdin.setEncoding('utf8'); for await (const chunk of process.stdin) input += chunk }
    await checkHook(process.argv[2], process.argv[3], input)
  }
  catch (error) { console.error(`quality hook rejected: ${error.message}`); process.exitCode = 1 }
}
