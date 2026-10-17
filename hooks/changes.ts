// The Changes tab, like VS Code's Source Control: git's own output read into files, a folder tree and
// a diff. Pure, so the tests hold it without git.
import type { DiffLine, FileChange, GitView } from '../types'

// Files listed at most; a huge change set says how many more there are.
export const FILES_SHOWN = 400
// Diff lines shown in the panel; the full diff opens in a tab.
const DIFF_LINES = 80

// VS Code's letter for git's status code.
function letterOf(code: string): string {
  if (code === '?') return 'U'
  if (code === 'M' || code === 'A' || code === 'D' || code === 'R' || code === 'C' || code === 'T') return code

  return 'M'
}

// VS Code's colours for each letter, in the panel's palette.
export function letterColor(letter: string): string {
  if (letter === 'A' || letter === 'U') return 'success'
  if (letter === 'D' || letter === '!') return 'error'
  if (letter === 'R' || letter === 'C') return 'suggestion'

  return 'warning'
}

// A dot per file type, in the colours its language is known by.
const FILE_COLORS: Record<string, string> = {
  go: '#56C2E6',
  py: '#E3B341',
  json: '#C3C95B',
  ts: '#6FA0E6',
  tsx: '#6FA0E6',
  js: '#E3B341',
  mjs: '#E3B341',
  svelte: '#E07F5C',
  md: '#9AA7B8',
  sql: '#E07FA8',
  yml: '#B48CB4',
  yaml: '#B48CB4',
  css: '#C678DD',
  html: '#E06C75',
  sh: '#8CC765',
  toml: '#B48CB4',
  mod: '#56C2E6',
  sum: '#56C2E6',
}

export function fileColor(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''

  return FILE_COLORS[ext] ?? '#9AA7B8'
}

// How long ago, in one short unit: 15m, 3h, 4d.
export function sinceText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)

  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

type Status = Pick<GitView, 'branch' | 'oid' | 'upstream' | 'ahead' | 'behind' | 'files'>

// `git status --porcelain=v2 --branch -z --untracked-files=all`: NUL-separated records; a rename's
// old path is the record after it.
export function parseStatus(text: string): Status {
  const out: Status = { branch: null, oid: '', ahead: 0, behind: 0, files: [] }
  const records = text.split('\0')
  for (let i = 0; i < records.length; i++) {
    const record = records[i] ?? ''
    if (record.startsWith('# branch.oid ')) out.oid = record.slice(13)
    else if (record.startsWith('# branch.head ')) out.branch = record.slice(14) === '(detached)' ? null : record.slice(14)
    else if (record.startsWith('# branch.upstream ')) out.upstream = record.slice(18)
    else if (record.startsWith('# branch.ab ')) {
      const ab = /\+(\d+) -(\d+)/.exec(record)
      out.ahead = Number(ab?.[1] ?? 0)
      out.behind = Number(ab?.[2] ?? 0)
    } else if (record.startsWith('? ')) out.files.push({ path: record.slice(2), group: 'changes', letter: 'U' })
    else if (record.startsWith('u ')) {
      out.files.push({ path: record.split(' ').slice(10).join(' '), group: 'merge', letter: '!' })
    } else if (record.startsWith('1 ') || record.startsWith('2 ')) {
      const fields = record.split(' ')
      const xy = fields[1] ?? '..'
      const isRename = record.startsWith('2 ')
      const path = fields.slice(isRename ? 9 : 8).join(' ')
      const from = isRename ? records[++i] : undefined
      const staged = xy[0] ?? '.'
      const unstaged = xy[1] ?? '.'
      if (staged !== '.') out.files.push({ path, ...(from !== undefined ? { from } : {}), group: 'staged', letter: letterOf(staged) })
      if (unstaged !== '.') out.files.push({ path, group: 'changes', letter: letterOf(unstaged) })
    }
  }

  return out
}

// `git diff --numstat -z`: lines added and removed by path ("-" for a binary file). A rename's
// paths follow as two records of their own.
export function parseNumstat(text: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  const records = text.split('\0')
  for (let i = 0; i < records.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec((records[i] ?? '').replace(/^\n/, ''))
    if (m === null) continue
    let path = m[3] ?? ''
    if (path === '') {
      i += 2
      path = records[i] ?? ''
    }
    if (m[1] !== '-') out.set(path, [Number(m[1]), Number(m[2])])
  }

  return out
}

// `git worktree list --porcelain`: each checkout's folder and branch; ones git would prune are left out.
export function parseWorktrees(text: string): { path: string; branch: string | null }[] {
  return text
    .split(/\n\n+/)
    .map(block => {
      const lines = block.split('\n')
      const path = lines.find(l => l.startsWith('worktree '))?.slice(9) ?? ''
      const ref = lines.find(l => l.startsWith('branch '))?.slice(7)

      return { path, branch: ref !== undefined ? ref.replace(/^refs\/heads\//, '') : null, prunable: lines.some(l => l.startsWith('prunable')) }
    })
    .filter(w => w.path !== '' && !w.prunable)
    .map(({ path, branch }) => ({ path, branch }))
}

// Other checkouts inside this one show to git as untracked folders: they're checkouts, not changes.
export function dropCheckouts(files: FileChange[], root: string, checkouts: { path: string }[]): FileChange[] {
  return files.filter(f => !(f.letter === 'U' && f.path.endsWith('/') && checkouts.some(c => c.path === `${root}/${f.path.slice(0, -1)}`)))
}

// The checkout to show when following the work: the one with the latest uncommitted change.
export function busiest<C extends { path: string; changed: number; newest: number }>(checkouts: C[]): C | undefined {
  return checkouts.filter(c => c.changed > 0).sort((a, b) => b.newest - a.newest)[0]
}

export type TreeRow =
  | { kind: 'folder'; key: string; depth: number; name: string; files: number; open: boolean }
  | { kind: 'file'; key: string; depth: number; name: string; change: FileChange }

type Folder = { folders: Map<string, Folder>; files: FileChange[] }

function count(folder: Folder): number {
  return folder.files.length + [...folder.folders.values()].reduce((n, f) => n + count(f), 0)
}

// One group's files as a tree: folders first, then files, each by name, and a folder holding only
// one folder drawn as one row ("ui/src/lib"), as VS Code compacts them. Shut folders hide what's in them.
export function treeRows(files: FileChange[], group: string, closed: Set<string>): TreeRow[] {
  const root: Folder = { folders: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.replace(/\/$/, '').split('/')
    let at = root
    for (const part of parts.slice(0, -1)) {
      let child = at.folders.get(part)
      if (child === undefined) {
        child = { folders: new Map(), files: [] }
        at.folders.set(part, child)
      }
      at = child
    }
    at.files.push(f)
  }

  const rows: TreeRow[] = []
  const walk = (folder: Folder, prefix: string, depth: number) => {
    for (const [name, sub] of [...folder.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      let label = name
      let inner = sub
      while (inner.files.length === 0 && inner.folders.size === 1) {
        const [only, deeper] = [...inner.folders.entries()][0]!
        label += `/${only}`
        inner = deeper
      }
      const key = `${group}:${prefix}${label}/`
      const open = !closed.has(key)
      rows.push({ kind: 'folder', key, depth, name: label, files: count(inner), open })
      if (open) walk(inner, `${prefix}${label}/`, depth + 1)
    }
    for (const f of [...folder.files].sort((a, b) => a.path.localeCompare(b.path))) {
      const name = f.path.replace(/\/$/, '').split('/').pop() ?? f.path

      rows.push({ kind: 'file', key: `${group}:${f.path}`, depth, name: f.path.endsWith('/') ? `${name}/` : name, change: f })
    }
  }
  walk(root, '', 0)

  return rows
}

// A diff, without its header, as lines to colour; `binary` when git only says the files differ.
export function parseDiff(text: string, max = DIFF_LINES): { lines: DiffLine[]; more: number; binary: boolean } {
  const lines: DiffLine[] = []
  let inHunk = false
  let binary = false
  for (const line of text.split('\n')) {
    if (line.startsWith('Binary files ')) binary = true
    if (line.startsWith('@@')) inHunk = true
    if (!inHunk) continue
    if (line.startsWith('@@')) lines.push({ kind: 'hunk', text: line })
    else if (line.startsWith('+')) lines.push({ kind: 'add', text: line })
    else if (line.startsWith('-')) lines.push({ kind: 'del', text: line })
    else if (line.startsWith('\\')) lines.push({ kind: 'note', text: line.slice(2) })
    else if (line.startsWith(' ')) lines.push({ kind: 'same', text: line })
    else if (line.startsWith('diff ')) inHunk = false
  }

  return { lines: lines.slice(0, max), more: Math.max(0, lines.length - max), binary }
}

// The git arguments that show one file's change: staged against HEAD, unstaged against the index, an
// untracked file as all new.
export function diffArgs(f: FileChange): string[] {
  if (f.group === 'staged') return ['diff', '--no-ext-diff', '--cached', '-M', '--', ...(f.from !== undefined ? [f.from] : []), f.path]
  if (f.letter === 'U') return ['diff', '--no-ext-diff', '--no-index', '--', '/dev/null', f.path]

  return ['diff', '--no-ext-diff', '--', f.path]
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// The lines an Edit or a Write added and took out, from its own diff, as Claude Code's status line counts
// them: a new file's lines all added; a write held for review, nothing.
export function patchCounts(tool: string, result: unknown): { added: number; removed: number } {
  const r = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
  if (r.staged === true) return { added: 0, removed: 0 }
  const hunks = Array.isArray(r.structuredPatch) ? (r.structuredPatch as unknown[]) : []
  let added = 0
  let removed = 0
  for (const hunk of hunks) {
    const lines = typeof hunk === 'object' && hunk !== null && Array.isArray((hunk as { lines?: unknown }).lines) ? ((hunk as { lines: unknown[] }).lines) : []
    for (const line of lines) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  if (tool === 'Write' && r.type === 'create' && hunks.length === 0 && typeof r.content === 'string' && r.content !== '') added = r.content.split(/\r?\n/).length

  return { added, removed }
}
