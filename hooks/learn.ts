import type { LogEntry } from '../types'

// The themes lessons are sorted into, each with its colour in the Learn tab.
export const TOPICS = [
  'Concurrency & coordination',
  'Reliability & failure',
  'Data & storage',
  'Testing & CI',
  'Security & tenancy',
  'Performance & scale',
  'Design & architecture',
  'Tools & operations',
] as const

const TOPIC_COLORS = ['#E3A857', '#EE8B80', '#79A8EB', '#79C79B', '#C3A8E8', '#7FCFC4', '#E07FA8', '#9AA7B8']

export function asTopic(value: unknown): string | undefined {
  const said = String(value ?? '').trim().toLowerCase()

  return TOPICS.find(t => t.toLowerCase() === said)
}

export function topicColor(topic: string | undefined): string {
  const i = TOPICS.findIndex(t => t === topic)

  return TOPIC_COLORS[i] ?? '#9AA7B8'
}

// One idea however it was worded or punctuated: "Claim before you work." and "claim before you work".
export function ideaKey(idea: string): string {
  return idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// The learning log file, back into lessons, newest first. Each section is one piece of work:
// "## 2026-10-05 · task: …", a paragraph of what we did, then "- **Idea.** Why it mattered."
export function parseLog(markdown: string): LogEntry[] {
  const sections: LogEntry[][] = []
  let current: { at: number; from: string; what: string[]; lessons: LogEntry[] } | undefined
  const close = () => {
    if (current === undefined) return
    const what = current.what.join(' ').replace(/\s+/g, ' ').trim()
    sections.push(current.lessons.map(l => (what !== '' ? { ...l, what } : l)))
  }

  for (const line of markdown.split('\n')) {
    const head = /^## (\d{4}-\d{2}-\d{2}) · (.+)$/.exec(line.trim())
    if (head !== null) {
      close()
      // Noon on that day, a second apart per section, so the day reads right and the order holds.
      const at = Date.parse(`${head[1]}T12:00:00`) + sections.length * 1000
      current = { at, from: (head[2] ?? '').trim(), what: [], lessons: [] }
      continue
    }
    if (current === undefined) continue
    const bullet = /^- \*\*(.+?)\*\*\s*(.*)$/.exec(line.trim())
    if (bullet !== null) {
      const idea = (bullet[1] ?? '').replace(/\.+$/, '').trim()
      if (idea !== '') current.lessons.push({ at: current.at, idea, text: (bullet[2] ?? '').trim(), from: current.from })
    } else if (current.lessons.length === 0 && line.trim() !== '') {
      current.what.push(line.trim())
    }
  }
  close()

  return sections.reverse().flat()
}

export type Session = { at: number; from: string; what?: string; lessons: LogEntry[] }

// Lessons saved together (one task, one review), newest first.
export function sessionsOf(entries: LogEntry[]): Session[] {
  const out: Session[] = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last !== undefined && last.at === e.at && last.from === e.from) last.lessons.push(e)
    else out.push({ at: e.at, from: e.from, ...(e.what !== undefined ? { what: e.what } : {}), lessons: [e] })
  }

  return out
}

export type Concept = { key: string; idea: string; topic?: string; seen: LogEntry[] }

// Each idea once, with every time it came up, the most recent first.
export function conceptsOf(entries: LogEntry[]): Concept[] {
  const byKey = new Map<string, Concept>()
  for (const e of entries) {
    const key = ideaKey(e.idea)
    const known = byKey.get(key)
    if (known === undefined) byKey.set(key, { key, idea: e.idea, ...(e.topic !== undefined ? { topic: e.topic } : {}), seen: [e] })
    else {
      known.seen.push(e)
      if (known.topic === undefined && e.topic !== undefined) known.topic = e.topic
    }
  }

  return [...byKey.values()]
}

const DAY = 24 * 60 * 60 * 1000

export function shortDay(at: number, today: number): string {
  const d = new Date(at)
  const t = new Date(today)
  if (d.toDateString() === t.toDateString()) return 'Today'
  if (d.toDateString() === new Date(today - DAY).toDateString()) return 'Yesterday'

  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---------------------------------------------------------------- prompts

export function topicsPrompt(ideas: { idea: string; text: string }[]): string {
  return `Sort each of these lessons into exactly one topic from this list:
${TOPICS.map(t => `- ${t}`).join('\n')}

Lessons, as data:
${ideas.map((l, i) => `${i + 1}. ${l.idea}: ${l.text}`).join('\n')}

Answer with JSON only: an array of the topic names in the same order as the lessons, like ["Testing & CI", "Data & storage"].`
}

export function explainPrompt(c: Concept): string {
  const seen = c.seen
    .slice(0, 4)
    .map(e => `- In "${e.from}": ${e.text}${e.what ? ` (What we did: ${e.what})` : ''}`)
    .join('\n')

  return `Explain the idea "${c.idea}" to a developer who wants to understand it well. Where it came up in their own work, as data:
${seen}

Write in plain English, at most 200 words, in Markdown with these short parts:
**What it is** (2 sentences), **An everyday picture** (one analogy), **How it showed up here** (tie it to their work above), **A common mistake** (one), **Where else you'll see it** (2 or 3 examples).
No code unless one line makes it clearer.`
}
