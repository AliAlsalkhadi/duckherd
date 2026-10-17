import type { Peer } from '../types'

type Listed = {
  id?: string
  pid?: number
  sessionId?: string
  name?: string
  cwd?: string
  kind?: string
  status?: string
  state?: string
}

export function within(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(`${root}/`)
}

function parseListed(raw: string): Listed[] | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown

    return Array.isArray(parsed) ? (parsed as Listed[]) : undefined
  } catch {
    return undefined
  }
}

// The sessions `claude agents --json` lists, kept to this project's folder (worktrees inside it
// count) and without this session itself; the ones waiting for the person first.
export function projectPeers(raw: string, root: string, ownSessionId: string): Peer[] {
  const listed = parseListed(raw) ?? []

  return listed
    .filter(s => typeof s.name === 'string' && typeof s.cwd === 'string' && within(s.cwd, root))
    .filter(s => s.sessionId === undefined || s.sessionId !== ownSessionId)
    .map((s): Peer => {
      const kind = s.kind === 'background' ? 'background' : 'terminal'
      // A worktree by its own name, so the session's name keeps the room.
      const where = s.cwd !== undefined && s.cwd !== root ? `in ${s.cwd.split('/').pop() ?? ''}` : ''
      const isWaiting = s.state === 'blocked'
      const status = isWaiting ? 'waiting for you' : s.status === 'busy' ? 'working' : (s.state ?? s.status ?? '')

      return {
        name: String(s.name),
        ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
        status: kind === 'terminal' ? `terminal · ${s.status === 'busy' ? 'working' : 'idle'}` : status,
        ...(kind === 'background' && s.state === 'done' ? { isDone: true } : {}),
        ...(s.id !== undefined ? { ref: s.id } : {}),
        ...(s.sessionId !== undefined ? { sessionId: s.sessionId } : {}),
        ...(typeof s.pid === 'number' ? { pid: s.pid } : {}),
        kind,
        isWaiting,
        detail: [kind, status, where].filter(part => part !== '').join(' · '),
      }
    })
    .sort((a, b) => Number(b.isWaiting) - Number(a.isWaiting))
}
