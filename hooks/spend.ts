// What the lead duck and its helpers used, in tokens: added up request by request, by task, by helper and by day,
// each kind of token apart so a price can be put on them. Pure, so tests can reach it.

import type { Spend, Spent, TaskSpend, TaskTotal } from '../types'

export const NO_SPENT: Spent = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
// The tasks a lead duck keeps records of: the one in hand and the latest before it.
export const TASKS_KEPT = 30

export const spentTotal = (s: Spent | undefined): number => (s === undefined ? 0 : s.input + s.output + s.cacheRead + s.cacheWrite)
export const spendTotal = (s: Spend | undefined): number => spentTotal(s?.lead) + spentTotal(s?.helpers)

// An API usage record (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens) as Spent;
// undefined when it counts nothing.
export function spentOf(usage: unknown): Spent | undefined {
  if (typeof usage !== 'object' || usage === null) return undefined
  const u = usage as Record<string, unknown>
  const count = (key: string) => {
    const n = Number(u[key])

    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  }
  const s = { input: count('input_tokens'), output: count('output_tokens'), cacheRead: count('cache_read_input_tokens'), cacheWrite: count('cache_creation_input_tokens') }

  return spentTotal(s) > 0 ? s : undefined
}

export function addSpent(a: Spent | undefined, b: Spent): Spent {
  const x = a ?? NO_SPENT

  return { input: x.input + b.input, output: x.output + b.output, cacheRead: x.cacheRead + b.cacheRead, cacheWrite: x.cacheWrite + b.cacheWrite }
}

// What a has over b, kind by kind, never below nothing.
export function spentOver(a: Spent | undefined, b: Spent | undefined): Spent {
  const x = a ?? NO_SPENT
  const y = b ?? NO_SPENT

  return { input: Math.max(0, x.input - y.input), output: Math.max(0, x.output - y.output), cacheRead: Math.max(0, x.cacheRead - y.cacheRead), cacheWrite: Math.max(0, x.cacheWrite - y.cacheWrite) }
}

export const emptySpend = (): Spend => ({ lead: NO_SPENT, helpers: NO_SPENT, models: {} })

// A spend with one request more (or, `less`, taken back out: a lead duck's request moving to the task it named).
export function addSpend(s: Spend | undefined, who: 'lead' | 'helpers', model: string, u: Spent, less = false): Spend {
  const was = s ?? emptySpend()
  const step = (x: Spent | undefined) => (less ? spentOver(x, u) : addSpent(x, u))
  const models = { ...was.models, [model]: step(was.models[model]) }
  if (spentTotal(models[model]) === 0) delete models[model]

  return { ...was, [who]: step(was[who]), models }
}

// Two spends as one: a day's with what came since.
export function joinSpend(a: Spend | undefined, b: Spend): Spend {
  const was = a ?? emptySpend()
  const models = { ...was.models }
  for (const [model, s] of Object.entries(b.models)) models[model] = addSpent(models[model], s)

  return { lead: addSpent(was.lead, b.lead), helpers: addSpent(was.helpers, b.helpers), models }
}

// A helper's whole transcript (its JSON lines): every assistant message's usage added up, each message once. Claude Code
// writes a message's blocks as lines of their own, each repeating its usage, so lines are joined by the message's id and
// the largest count of each kind kept.
function transcriptMessages(jsonl: string): Map<string, Spent> {
  const byMessage = new Map<string, Spent>()
  let unnamed = 0
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"usage"')) continue
    let entry: { type?: string; requestId?: string; uuid?: string; message?: { id?: string; usage?: unknown } }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'assistant') continue
    const s = spentOf(entry.message?.usage)
    if (s === undefined) continue
    const id = entry.message?.id ?? entry.requestId ?? entry.uuid ?? `line-${unnamed++}`
    const was = byMessage.get(id)
    byMessage.set(id, was === undefined ? s : { input: Math.max(was.input, s.input), output: Math.max(was.output, s.output), cacheRead: Math.max(was.cacheRead, s.cacheRead), cacheWrite: Math.max(was.cacheWrite, s.cacheWrite) })
  }

  return byMessage
}

export function transcriptSpent(jsonl: string): Spent | undefined {
  const byMessage = transcriptMessages(jsonl)
  if (byMessage.size === 0) return undefined

  return [...byMessage.values()].reduce((sum, s) => addSpent(sum, s), NO_SPENT)
}

// The context one request held: what it read in (input, cache read, cache write), not what it wrote.
export const contextOf = (s: Spent): number => s.input + s.cacheRead + s.cacheWrite

// The most context any one message of a transcript held; 0 when it has none.
export const transcriptPeak = (jsonl: string): number => Math.max(0, ...[...transcriptMessages(jsonl).values()].map(contextOf))

// Time at work as spans, merged, so time when the lead duck and a helper (or two helpers) worked counts once.
export type Span = [number, number]

export function addSpan(spans: readonly Span[], span: Span): Span[] {
  if (!(span[1] > span[0])) return [...spans]
  const all = [...spans, span].sort((x, y) => x[0] - y[0])
  const merged: Span[] = []
  for (const [from, to] of all) {
    const last = merged[merged.length - 1]
    if (last !== undefined && from <= last[1]) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }

  return merged
}

export const spanMs = (spans: readonly Span[]): number => spans.reduce((n, [from, to]) => n + (to - from), 0)

// A task's record with a request more, or a span of work more.
export function taskWith(rec: TaskSpend | undefined, at: number, more: { who: 'lead' | 'helpers'; model: string; spent: Spent; less?: boolean } | { span: Span }): TaskSpend {
  const was = rec ?? { spend: emptySpend(), spans: [], firstAt: at, lastAt: at }
  const firstAt = Math.min(was.firstAt, 'span' in more ? more.span[0] : at)
  const lastAt = Math.max(was.lastAt, 'span' in more ? more.span[1] : at)
  if ('span' in more) return { ...was, spans: addSpan(was.spans, more.span), firstAt, lastAt }

  return { ...was, spend: addSpend(was.spend, more.who, more.model, more.spent, more.less === true), firstAt, lastAt }
}

// The records kept: the task in hand and the latest others, TASKS_KEPT in all.
export function keptTasks(records: Record<string, TaskSpend>, current: string): Record<string, TaskSpend> {
  const names = Object.keys(records)
  if (names.length <= TASKS_KEPT) return records
  const kept = names
    .filter(n => n !== current)
    .sort((x, y) => (records[y]?.lastAt ?? 0) - (records[x]?.lastAt ?? 0))
    .slice(0, TASKS_KEPT - 1)

  return Object.fromEntries([...(records[current] !== undefined ? [current] : []), ...kept].map(n => [n, records[n]!]))
}

// Each task's figures for the panel, the one in hand first, then the latest: its time at work (with what is at work now,
// `open`, counted up to now) and its tokens.
export function taskTotals(records: Record<string, TaskSpend>, current: string, open: readonly { name: string; span: Span }[]): TaskTotal[] {
  const names = new Set([...(current !== '' ? [current] : []), ...Object.keys(records), ...open.map(o => o.name)])
  const rows = [...names].map(name => {
    const rec = records[name]
    const spans = open.filter(o => o.name === name).reduce((acc, o) => addSpan(acc, o.span), rec?.spans ?? [])
    const at = open.filter(o => o.name === name).map(o => o.span)
    const firstAt = Math.min(rec?.firstAt ?? Infinity, ...at.map(s => s[0]))
    const lastAt = Math.max(rec?.lastAt ?? 0, ...at.map(s => s[1]))
    // A task named but not yet at work: no time, nothing used.
    if (!Number.isFinite(firstAt)) return { name, isCurrent: name === current, busyMs: 0, tokens: 0, spend: emptySpend(), firstAt: 0, lastAt: 0 }
    const spend = rec?.spend ?? emptySpend()

    return { name, isCurrent: name === current, busyMs: spanMs(spans), tokens: spendTotal(spend), spend, firstAt, lastAt }
  })

  return rows.sort((x, y) => Number(y.isCurrent) - Number(x.isCurrent) || y.lastAt - x.lastAt)
}
