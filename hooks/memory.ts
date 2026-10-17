// What every Claude session open on this machine holds in memory, with what each started (a test run, a
// language server), so the person can see what is filling their memory and stop what they don't need.
// Read from `claude agents --json`, `ps` (who started whom) and, on macOS, `top` (each process's
// footprint: memory macOS compressed or swapped out counts too, unlike ps's resident size). On Linux
// the sizes are ps's resident size and the machine's from /proc/meminfo.

import type { Leftover, MemChild, MemSession } from '../types'

export type { Leftover, MemChild, MemSession }

export type Listed = { id?: string; pid?: number | string; sessionId?: string; name?: string; cwd?: string; kind?: string; status?: string; state?: string }

export function parseListed(raw: string): Listed[] {
  try {
    const parsed = JSON.parse(raw) as unknown

    return Array.isArray(parsed) ? (parsed as Listed[]) : []
  } catch {
    return []
  }
}

// `top -l 1 -stats pid,mem`: each process's footprint in MB.
export function parseFootprints(raw: string): Map<number, number> {
  const units: Record<string, number> = { B: 1 / 1048576, K: 1 / 1024, M: 1, G: 1024 }
  const out = new Map<number, number>()
  for (const line of raw.split('\n')) {
    const m = /^\s*(\d+)\s+([\d.]+)([BKMG])\+?-?\s*$/.exec(line)
    if (m !== null) out.set(Number(m[1]), Number(m[2]) * (units[m[3] ?? 'M'] ?? 1))
  }

  return out
}

export type Processes = { kids: Map<number, number[]>; names: Map<number, string>; parents?: Map<number, number>; args?: Map<number, string>; ages?: Map<number, number> }

// A process by a name the person knows: the tool, not the runtime under it (node running vitest is
// "vitest").
export function processName(args: string): string {
  const words = args.trim().split(/\s+/)
  const base = (w: string | undefined) => (w ?? '?').split('/').pop() ?? '?'
  const known = ['vitest', 'jest', 'playwright', 'tsserver', 'eslint', 'next', 'vite', 'webpack', 'storybook', 'gopls', 'rust-analyzer', 'pyright']
  const hit = known.find(k => args.includes(k))
  if (hit !== undefined) return hit
  const first = base(words[0])
  if (/^(node|bun|deno|python3?|ruby|sh|bash|zsh)$/i.test(first)) {
    const script = words.slice(1).find(w => !w.startsWith('-'))
    if (script !== undefined) return `${first} ${base(script)}`
  }
  if (first === 'npm' || first === 'npx' || first === 'pnpm' || first === 'yarn') return words.slice(0, 3).map(base).join(' ')

  return first
}

// `ps`'s elapsed time, [[dd-]hh:]mm:ss, in ms.
export function elapsedMs(text: string): number | undefined {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(text.trim())
  if (m === null) return undefined

  return (((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3])) * 60 + Number(m[4])) * 1000
}

// `ps -Ao pid=,ppid=,etime=,args=` (etime may be left out): who started whom, each one's name, its
// command line and how long it has run.
export function parseProcesses(raw: string): Processes {
  const kids = new Map<number, number[]>()
  const names = new Map<number, string>()
  const parents = new Map<number, number>()
  const args = new Map<number, string>()
  const ages = new Map<number, number>()
  for (const line of raw.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(?:((?:\d+-)?(?:\d+:)?\d+:\d+)\s+)?(.*)$/.exec(line)
    if (m === null) continue
    const pid = Number(m[1])
    const parent = Number(m[2])
    kids.set(parent, [...(kids.get(parent) ?? []), pid])
    parents.set(pid, parent)
    names.set(pid, processName(m[4] ?? ''))
    args.set(pid, m[4] ?? '')
    const age = m[3] !== undefined ? elapsedMs(m[3]) : undefined
    if (age !== undefined) ages.set(pid, age)
  }

  return { kids, names, parents, args, ages }
}

function family(p: Processes, pid: number, seen = new Set<number>()): number[] {
  if (seen.has(pid)) return []
  seen.add(pid)

  return [pid, ...(p.kids.get(pid) ?? []).flatMap(k => family(p, k, seen))]
}

// Every session, biggest first: its memory with what it started; one with no process holds nothing.
export function sessionMemory(listed: Listed[], p: Processes, foot: Map<number, number>): MemSession[] {
  return listed
    .filter(s => typeof s.name === 'string')
    .map((s): MemSession => {
      // A real process only: a whole number above 1 (Close signals it; -1 would signal everything).
      const pid = s.pid !== undefined && Number.isInteger(Number(s.pid)) && Number(s.pid) > 1 ? Number(s.pid) : undefined
      const all = pid === undefined ? [] : family(p, pid)
      const children = all
        .slice(1)
        .map(k => ({ name: p.names.get(k) ?? '?', mb: foot.get(k) ?? 0 }))
        .filter(c => c.mb >= 150)
        .sort((a, b) => b.mb - a.mb)
        .slice(0, 2)
      const isWaiting = s.state === 'blocked'
      const isWorking = s.status === 'busy' || s.state === 'working'
      const state = isWaiting ? 'waiting for you' : isWorking ? 'working' : s.state === 'done' ? 'done' : 'idle'

      return {
        name: String(s.name),
        ...(pid !== undefined ? { pid } : {}),
        kind: s.kind === 'interactive' ? 'terminal' : 'background',
        state,
        isWaiting,
        isWorking,
        ...(s.id !== undefined ? { ref: s.id } : {}),
        ...(s.sessionId !== undefined ? { sessionId: s.sessionId } : {}),
        ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
        mb: all.reduce((sum, k) => sum + (foot.get(k) ?? 0), 0),
        children,
      }
    })
    .sort((a, b) => b.mb - a.mb)
}

// `xcrun simctl list devices booted -j`: the booted simulators, with when each was last used.
export function parseBootedSims(raw: string): { udid: string; name: string; lastUsed?: number }[] {
  try {
    const devices = (JSON.parse(raw) as { devices?: Record<string, { udid?: string; name?: string; state?: string; lastUsedAt?: string }[]> }).devices ?? {}

    return Object.values(devices)
      .flat()
      .filter(d => d.state === 'Booted' && typeof d.udid === 'string')
      .map(d => {
        const lastUsed = Date.parse(d.lastUsedAt ?? '')

        return { udid: String(d.udid), name: d.name ?? 'Simulator', ...(Number.isFinite(lastUsed) ? { lastUsed } : {}) }
      })
  } catch {
    return []
  }
}

const SERVER = /\/(vite|next|nuxt|astro|webpack|webpack-dev-server|storybook|remix|svelte-kit)(\s|$)|\b(vite|next) dev\b/
const BROWSER = /ms-playwright\/|--remote-debugging-pipe/
// Anything a Claude session started from its scratchpad, still running with that session gone and no
// parent left.
const SCRATCH = /\/tmp\/claude-\d+\//
const OWN = /\/(claude|cmux)(\s|$)|\.local\/bin\/claude\b|cmux\.app\//

// What holds memory outside every Claude session: each booted simulator, with the app running in it, and the dev servers and test browsers
// whose session is gone. `sessionPids`: the sessions' processes; anything under one is the session's.
export function leftovers(p: Processes, foot: Map<number, number>, sims: { udid: string; name: string; lastUsed?: number }[], sessionPids: Set<number>): Leftover[] {
  const args = p.args ?? new Map<number, string>()
  const parents = p.parents ?? new Map<number, number>()
  const underSession = (pid: number) => {
    for (let at: number | undefined = pid, hops = 0; at !== undefined && at > 1 && hops < 40; at = parents.get(at), hops++) if (sessionPids.has(at)) return true

    return false
  }
  const held = (pid: number) => family(p, pid).reduce((sum, k) => sum + (foot.get(k) ?? 0), 0)
  const out: Leftover[] = []
  for (const sim of sims) {
    const host = [...args].find(([, a]) => a.includes('launchd_sim') && a.includes(sim.udid))?.[0]
    const app = [...args.values()].map(a => new RegExp(`Devices/${sim.udid}/data/Containers/Bundle/Application/[^/]+/([^/]+)\\.app/`).exec(a)?.[1]).find(name => name !== undefined)
    out.push({
      kind: 'simulator',
      id: sim.udid,
      name: `${sim.name} simulator`,
      mb: host !== undefined ? held(host) : 0,
      ...(host !== undefined && p.ages?.get(host) !== undefined ? { upMs: p.ages.get(host) } : {}),
      ...(sim.lastUsed !== undefined ? { lastUsed: sim.lastUsed } : {}),
      detail: app !== undefined ? `${app} running` : 'no app running',
    })
  }
  for (const [pid, a] of args) {
    const isScratch = parents.get(pid) === 1 && SCRATCH.test(a) && !OWN.test(a)
    const kind = BROWSER.test(a) && !/Helper/.test(a) ? 'browser' : (SERVER.test(a) && /node_modules|\bnode\b/.test(a)) || isScratch ? 'server' : undefined
    if (kind === undefined || underSession(pid)) continue
    // Only the top of a server's or browser's own tree.
    const parent = parents.get(pid)
    if (parent !== undefined && (args.get(parent) ?? '').length > 0 && (kind === 'browser' ? BROWSER : SERVER).test(args.get(parent) ?? '')) continue
    const project = /([^/\s]+)\/node_modules\//.exec(a)?.[1]
    out.push({
      kind,
      id: String(pid),
      name: kind === 'browser' ? 'Test browser' : SERVER.test(a) ? `${processName(a)} dev server` : processName(a),
      mb: held(pid),
      ...(p.ages?.get(pid) !== undefined ? { upMs: p.ages.get(pid) } : {}),
      ...(project !== undefined ? { detail: project } : {}),
    })
  }

  return out.sort((x, y) => y.mb - x.mb)
}

// `sysctl -n vm.swapusage`: swap used and its size, in MB.
export function parseSwap(raw: string): { usedMb: number; totalMb: number } | undefined {
  const used = /used = ([\d.]+)M/.exec(raw)
  const total = /total = ([\d.]+)M/.exec(raw)

  return used !== null && total !== null ? { usedMb: Number(used[1]), totalMb: Number(total[1]) } : undefined
}

// Linux: `ps -eo pid=,rss=`, each process's resident size (in KB) in MB. Unlike macOS's footprint it
// leaves out what was swapped out, so a session can show a little less than it holds.
export function parseRss(raw: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const line of raw.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
    if (m !== null) out.set(Number(m[1]), Number(m[2]) / 1024)
  }

  return out
}

// Linux: `/proc/meminfo`, the machine's memory and swap in MB.
export function parseMeminfo(raw: string): { ramMb: number; swapUsedMb?: number; swapTotalMb?: number } {
  const kb = (key: string) => {
    const m = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(raw)

    return m === null ? undefined : Number(m[1])
  }
  const total = kb('MemTotal')
  const swapTotal = kb('SwapTotal')
  const swapFree = kb('SwapFree')

  return {
    ramMb: total === undefined ? 0 : total / 1024,
    ...(swapTotal !== undefined && swapFree !== undefined ? { swapUsedMb: (swapTotal - swapFree) / 1024, swapTotalMb: swapTotal / 1024 } : {}),
  }
}

// The last thing the person typed to a session, from the tail of its transcript: Claude Code's own note
// of it, else the last message that isn't a tool's result, a command's output or a note it added.
export function lastAsk(jsonl: string): string | undefined {
  const lines = jsonl.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i] ?? ''
    // Claude Code notes the latest prompt as it goes.
    if (raw.includes('"type":"last-prompt"')) {
      try {
        const said = (JSON.parse(raw) as { lastPrompt?: unknown }).lastPrompt
        if (typeof said === 'string' && said.trim() !== '') return said.replace(/\s+/g, ' ').trim()
      } catch {
        // A line cut short: read on.
      }
      continue
    }
    if (!raw.includes('"type":"user"')) continue
    let line: { type?: string; isMeta?: boolean; isSidechain?: boolean; message?: { content?: unknown } }
    try {
      line = JSON.parse(raw) as typeof line
    } catch {
      continue
    }
    if (line.type !== 'user' || line.isMeta === true || line.isSidechain === true) continue
    const content = line.message?.content
    const text = typeof content === 'string' ? content : Array.isArray(content) ? (content as { type?: string; text?: string }[]).filter(c => c.type === 'text').map(c => c.text ?? '').join(' ') : ''
    const said = text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (said !== '' && !said.startsWith('[Request interrupted')) return said
  }

  return undefined
}

export function sizeText(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}
