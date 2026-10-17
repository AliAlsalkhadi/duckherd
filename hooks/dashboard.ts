// The status file: one JSON per running lead duck, at ~/.claude/duckherd/dashboard/<sessionId>.json, built from
// what the mod already holds (no new gathering); a field it doesn't know is null. The format is version 1.
// These files are read by external tools (a separate dashboard): keep the path, field names and types as they are.

import type { AgentView, Handoff, PlanStep, Peer, SentMessage } from '../types'
import { modelOf } from './critter'

export const DASHBOARD_MESSAGES_MS = 24 * 3600000
export const DASHBOARD_MESSAGES_MAX = 30

export type DashboardUse = { kind: 'server' | 'sim' | 'mcp' | 'job' | 'dir'; text: string; owner: string | null; state: string | null }

type DashboardInput = {
  now: number
  sessionId: string
  pid: number
  projectRoot: string
  folder: string
  branch: string | null
  cmux: { surface: string; workspace: string | null } | null
  contextTokens: number | null
  memoryBytes: number | null
  title: string | null
  plan: PlanStep[]
  isWorking: boolean
  leadNow: string | null
  agents: AgentView[]
  peers: Peer[]
  uses: DashboardUse[]
  messages: SentMessage[]
  usage: { fiveHourPct: number; resetsAt: number | null; helpersCapped: boolean } | null
  handoffs: Handoff[]
  // The watchdog's actions by helper id; the files helpers edited in the last 10 minutes (absolute paths).
  watch: Record<string, { nudgedAt: number | null; toldAt: number | null; stoppedAt: number | null }>
  editing: { helper: string; path: string }[]
}

type DashboardHelper = {
  name: string
  agentId: string
  color: string
  model: string | null
  state: 'running' | 'needs' | 'done' | 'failed'
  now: string | null
  asked: string
  startedAt: number
  endedAt: number | null
  steps: number
  tokens: number | null
  log: string[]
  changed: { file: string; plus: number; minus: number }[]
  needs: string | null
  watch: { nudgedAt: number | null; toldAt: number | null; stoppedAt: number | null } | null
  editing: string[]
}

export type Dashboard = {
  v: 1
  sessionId: string
  pid: number
  updatedAt: number
  project: { root: string; name: string }
  folder: string
  name: string
  branch: string | null
  cmux: { surface: string; workspace: string | null } | null
  contextTokens: number | null
  memoryBytes: number | null
  usage: { fiveHourPct: number; resetsAt: number | null; helpersCapped: boolean } | null
  handoffs: { to: { sessionId: string | null; name: string }; title: string; createdAt: number }[]
  task: { title: string | null; asking: string | null; state: 'working' | 'needs' | 'rest'; now: string | null; startedAt: number | null; plan: { state: PlanStep['state']; text: string; who: string | null }[] }
  helpers: DashboardHelper[]
  uses: DashboardUse[]
  messages: SentMessage[]
  // Set when the lead duck has closed: the file stays so a reader can show it as ended.
  closed?: true
  closedAt?: number
}

const base = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path

function helperOf(a: AgentView, folder: string, i: DashboardInput): DashboardHelper {
  const rel = (path: string) => (path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path)
  const last = a.steps[a.steps.length - 1]
  const running = [...a.steps].reverse().find(s => s.state === 'running')
  const state = a.status === 'running' ? (a.asking !== undefined ? 'needs' : 'running') : a.status
  const model = a.model === undefined ? null : modelOf(a.model).name.toLowerCase()

  return {
    name: a.letter,
    agentId: a.id,
    color: a.color,
    model,
    state,
    now: a.status !== 'running' ? null : (a.asking?.text ?? running?.text ?? last?.text ?? null),
    asked: a.description,
    startedAt: a.startedAt,
    endedAt: a.endedAt ?? null,
    steps: a.steps.length,
    tokens: a.tokens ?? null,
    log: a.steps.slice(-8).map(s => s.text),
    changed: (a.files ?? []).map(f => ({ file: rel(f.path), plus: f.added, minus: f.removed })),
    needs: a.status === 'running' && a.asking !== undefined ? a.asking.text : null,
    watch: i.watch[a.id] ?? null,
    editing: a.status === 'running' ? [...new Set(i.editing.filter(e => e.helper === a.letter).map(e => rel(e.path)))] : [],
  }
}

export function dashboardSnapshot(i: DashboardInput): Dashboard {
  const helpers = i.agents.filter(a => a.kind === 'helper')
  const shown = [...helpers.filter(a => a.status === 'running').sort((a, b) => a.startedAt - b.startedAt), ...helpers.filter(a => a.status !== 'running').sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))].slice(0, 12)
  const running = helpers.filter(a => a.status === 'running')
  // A helper's `asking` is only ever a permission prompt the person alone can answer (see the
  // PermissionRequest hook), so it counts; stuck, looping or clashing helpers are the lead duck's to handle.
  const waitsOnPerson = running.some(a => a.asking !== undefined) || i.plan.some(p => p.who === 'you' && p.state !== 'done')
  const state = waitsOnPerson ? 'needs' : i.isWorking || running.length > 0 ? 'working' : 'rest'
  const names = running.map(a => a.letter)
  const now = i.isWorking ? i.leadNow : names.length > 0 ? `waiting on ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}` : null
  const title = i.title === null ? null : i.title.replace(/\s*\(branch [^)]+\)\s*$/i, '').trim() || null
  const started = title === null ? [] : helpers.filter(a => a.task === title).map(a => a.startedAt)

  return {
    v: 1,
    sessionId: i.sessionId,
    pid: i.pid,
    updatedAt: i.now,
    project: { root: i.projectRoot, name: base(i.projectRoot) },
    folder: i.folder,
    name: base(i.folder),
    branch: i.branch,
    cmux: i.cmux,
    contextTokens: i.contextTokens !== null && i.contextTokens > 0 ? i.contextTokens : null,
    memoryBytes: i.memoryBytes,
    // The lead duck's own AskUserQuestion is not something the mod sees pending: null.
    usage: i.usage,
    handoffs: i.handoffs.map(ho => ({
      to: { sessionId: i.peers.find(p => p.name === ho.to || p.ref === ho.to)?.sessionId ?? null, name: ho.to },
      title: (ho.why ?? ho.text).replace(/\s+/g, ' ').trim().slice(0, 120),
      createdAt: ho.createdAt,
    })),
    task: {
      title,
      asking: null,
      state,
      now,
      startedAt: started.length > 0 ? Math.min(...started) : null,
      plan: i.plan.map(p => ({ state: p.state, text: p.text, who: p.who === 'lead duck' || p.who === 'helper' || p.who === '' ? null : p.who })),
    },
    helpers: shown.map(a => helperOf(a, i.folder, i)),
    uses: i.uses,
    messages: i.messages.filter(m => i.now - m.at < DASHBOARD_MESSAGES_MS).slice(0, DASHBOARD_MESSAGES_MAX),
  }
}

// `ps -axo pid,ppid,rss,command` and `lsof -nP -iTCP -sTCP:LISTEN -Fpcn`, read for the claude process's
// tree: its summed resident memory in bytes, and each port a descendant listens on, with the command
// that holds it and the chain of commands from it up to the claude process (to tell who started it).
export type TreeScan = { memoryBytes: number; servers: { pid: number; port: number; name: string; chain: string }[] }

export function scanTree(ps: string, lsof: string, root: number): TreeScan {
  const parent = new Map<number, number>()
  const rss = new Map<number, number>()
  const command = new Map<number, string>()
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m === null) continue
    parent.set(Number(m[1]), Number(m[2]))
    rss.set(Number(m[1]), Number(m[3]))
    command.set(Number(m[1]), m[4] ?? '')
  }
  const chainOf = (pid: number): number[] | undefined => {
    const chain: number[] = []
    for (let at: number | undefined = pid, hops = 0; at !== undefined && at > 1 && hops < 40; at = parent.get(at), hops++) {
      chain.push(at)
      if (at === root) return chain
    }

    return undefined
  }
  const tree = [...parent.keys()].filter(pid => chainOf(pid) !== undefined)
  const memoryBytes = tree.reduce((sum, pid) => sum + (rss.get(pid) ?? 0) * 1024, 0)
  const servers: TreeScan['servers'] = []
  let pid = 0
  let name = ''
  for (const line of lsof.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('c')) name = line.slice(1)
    else if (line.startsWith('n')) {
      const port = Number(/:(\d+)$/.exec(line)?.[1])
      const chain = chainOf(pid)
      if (chain === undefined || pid === root || !Number.isFinite(port) || servers.some(s => s.pid === pid && s.port === port)) continue
      servers.push({ pid, port, name: name || (command.get(pid) ?? '').split(/\s+/)[0] || 'process', chain: chain.map(p => command.get(p) ?? '').join('\n') })
    }
  }

  return { memoryBytes, servers }
}
