// Where cmux keeps its command line when the session's environment doesn't say.
export const CMUX_FALLBACK = '/Applications/cmux.app/Contents/Resources/bin/cmux'

// The cmux tab (surface) a process runs in, and that tab's workspace, from
// `cmux top --all --processes --format tsv`: rows of cpu, memory, count, kind, ref, parent, title.
export function tabOfProcess(tsv: string, pid: number): { surface: string; workspace?: string } | undefined {
  const parents = new Map<string, string[]>()
  for (const line of tsv.split('\n')) {
    const [, , , kind, ref, parent] = line.split('\t')
    if (kind === undefined || ref === undefined || parent === undefined || parent === '') continue
    const key = kind === 'process' ? `pid:${ref}` : ref
    const up = kind === 'process' && /^\d+$/.test(parent) ? `pid:${parent}` : parent
    parents.set(key, [...(parents.get(key) ?? []), up])
  }

  const workspaceOf = (surface: string): string | undefined => {
    let at = surface
    for (let hops = 0; hops < 6; hops++) {
      const up = parents.get(at)?.[0]
      if (up === undefined) return undefined
      if (up.startsWith('workspace:') && !up.includes(':tag:')) return up
      at = up
    }

    return undefined
  }

  const queue = [`pid:${pid}`]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const at = queue.shift() as string
    if (seen.has(at)) continue
    seen.add(at)
    for (const up of parents.get(at) ?? []) {
      if (up.startsWith('surface:')) {
        const workspace = workspaceOf(up)

        return workspace === undefined ? { surface: up } : { surface: up, workspace }
      }
      if (up.startsWith('pid:')) queue.push(up)
    }
  }

  return undefined
}

// Claude Code keeps each session's transcript under its folder's name with every other character a dash.
export function transcriptPath(home: string, cwd: string, sessionId: string): string {
  return `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${sessionId}.jsonl`
}
