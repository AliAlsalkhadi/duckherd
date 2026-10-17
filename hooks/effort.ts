// The lead duck's own effort and its Haiku-written summaries: the pure parts, so tests can reach them.
// What each one does:
//  - the per-prompt effort judge: which effort the MAIN chat's next reply runs at (never the model, never a helper);
//  - the compaction summary written by Haiku 5.5 in place of the chat model's own;
//  - the handoff file for a fresh chat.

import type { PlanStep } from '../types'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
// /chat-effort: auto judges each prompt, off leaves effort alone, a level pins it.
export type ChatEffort = 'auto' | 'off' | Effort
export const CHAT_EFFORT_CHOICES: readonly ChatEffort[] = ['auto', 'off', ...EFFORTS]

export function asChatEffort(value: unknown, fallback: ChatEffort = 'auto'): ChatEffort {
  const said = typeof value === 'string' ? value.trim().toLowerCase().replace(/^x-high$/, 'xhigh') : ''

  return (CHAT_EFFORT_CHOICES as readonly string[]).includes(said) ? (said as ChatEffort) : fallback
}

// Haiku 5.5 by its id: a Claude Code build that predates it maps the plain alias to an older, dearer Haiku.
export const HAIKU_MODEL = 'claude-haiku-5-5'

// Changing effort between two requests keeps the prompt cache on these models only. On older Opus and on Fable the
// next request rewrote most of the cache (measured by the effortless mod), which costs more than any effort saves.
export const cacheSafe = (modelId: string) => /(opus|sonnet)-5-5/.test(modelId)

// ---------------------------------------------------------------- the effort judge

export const JUDGE_MAX_TOKENS = 160
export const JUDGE_TIMEOUT_MS = 6000
const PROMPT_CHARS = 4000
const PREVIOUS_CHARS = 400
const TAIL_CHARS = 2000

export const JUDGE_SYSTEM = `You choose the reasoning effort for the next reply of an AI assistant that works as the lead of a team of helpers: it mostly plans and hands the real work (reading code, running things, editing) to helper agents, so heavy work usually does NOT happen in the reply you are judging. Pick the lowest effort that still does the job well.

Raise the effort when the lead itself must reason: a design or architecture trade-off, judging whether helpers' results are right or enough, deciding which way to debug a tricky or subtle problem, planning a large or risky change, resolving conflicting information. Keep it low for status questions, acknowledging a result, relaying or summarising a report, simple clarifications, small mechanical requests to start a helper, thanks, and chat.

- low: relay, summarise, short answer, kick off one clear helper.
- medium: a normal plan, a normal judgement of a report, an ordinary question about the code.
- high: a real trade-off, a subtle bug's direction, reviewing a risky change, a plan with many dependent parts.
- xhigh: the hardest reasoning the lead must do itself, rare.
- max: almost never.

A message that pushes back on or adds to work in progress keeps at least the effort that work had. Reply with JSON only: {"effort":"low|medium|high|xhigh|max","why":"at most 6 words"}`

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} …` : s)

/** What the judge reads: the prompt, the one before it, the end of the last reply, how full the chat is, the effort now. */
export function judgeInput(i: { prompt: string; previous?: string | undefined; tail?: string | undefined; percent?: number | undefined; current?: string | undefined }): string {
  const parts = [`New user message:\n${cut(i.prompt, PROMPT_CHARS)}`]
  if (i.previous?.trim()) parts.push(`Previous user message:\n${cut(i.previous.trim(), PREVIOUS_CHARS)}`)
  if (i.tail?.trim()) parts.push(`End of the assistant's last reply:\n${i.tail.trim().slice(-TAIL_CHARS)}`)
  if (i.percent !== undefined && Number.isFinite(i.percent)) parts.push(`Context used: ${Math.round(i.percent)}% of the window`)
  parts.push(`Current effort: ${i.current ?? 'unknown'}`)

  return parts.join('\n\n')
}

type Verdict = { effort: Effort; why: string }

/** Reads {"effort","why"} out of a reply (bare, fenced, or with words round it), or nothing when it holds none. */
export function parseVerdict(text: string): Verdict | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const { effort, why } = raw as Record<string, unknown>
  const level = typeof effort === 'string' ? effort.trim().toLowerCase().replace(/^x-high$/, 'xhigh') : ''
  if (!(EFFORTS as readonly string[]).includes(level)) return undefined
  const words = typeof why === 'string' ? why.trim().split(/\s+/).filter(Boolean).slice(0, 6).join(' ') : ''

  return { effort: level as Effort, why: words.slice(0, 48) }
}

// Phrases that name an effort without the word "effort": think hard, ultrathink, go light.
const LEVEL_WORD = '(low|medium|high|xhigh|x-high|extra[- ]high|max|maximum)'
const NAMED = new RegExp(`\\b${LEVEL_WORD}\\s+effort\\b|\\beffort(?:\\s+level)?\\s*(?:[:=]|to|at|of|on)?\\s*${LEVEL_WORD}\\b|\\bxhigh\\b`, 'gi')
const LEVEL_OF: Record<string, Effort> = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', 'x-high': 'xhigh', 'extra high': 'xhigh', 'extra-high': 'xhigh', max: 'max', maximum: 'max' }
const NO = /\b(not|no|don'?t|never|without|instead of)\b/

/** The level a prompt asks for by name ("max effort", "ultrathink", "think hard", "go light"), or nothing. A "no" just before it cancels it. */
export function namedEffort(text: string): Effort | undefined {
  for (const m of text.matchAll(NAMED)) {
    if (NO.test(text.slice(Math.max(0, m.index - 20), m.index).toLowerCase())) continue

    return LEVEL_OF[(m[1] ?? m[2] ?? 'xhigh').toLowerCase().replace(/\s+/, ' ')]
  }
  const phrase = (re: RegExp) => {
    const m = re.exec(text)

    return m !== null && !NO.test(text.slice(Math.max(0, m.index - 20), m.index).toLowerCase())
  }
  if (phrase(/\bultra-?think\b/i)) return 'max'
  if (phrase(/\bthink\s+(?:very\s+|really\s+|a\s+lot\s+)?harder\b|\bthink\s+(?:very|really)\s+hard\b/i)) return 'xhigh'
  if (phrase(/\bthink\s+hard\b|\bthink\s+it\s+through\b|\bthink\s+deeply\b/i)) return 'high'
  if (phrase(/\bgo\s+light\b|\bkeep\s+it\s+light\b|\bquick\s+answer\b|\bno\s+need\s+to\s+think\b/i)) return 'low'

  return undefined
}

const FOLLOW_UPS = /^(?:ok(?:ay)?|k|go(?:\s+ahead|\s+on)?|yes|yep|yeah|yup|y|sure|continue|proceed|do\s+it|next|keep\s+going|carry\s+on|sounds\s+good|lgtm|thanks|thank\s+you|thx|ty|no|nope|done|great|nice|cool|good)[\s.!]*$/i

/** A short follow-up such as "ok", "go", "yes", "continue": it keeps the effort the last message had. */
export function isFollowUp(text: string): boolean {
  const t = text.trim()

  return t.length > 0 && (FOLLOW_UPS.test(t) || (t.length <= 12 && t.split(/\s+/).length <= 2 && !t.includes('?')))
}

type EffortPlan = { action: 'keep' } | { action: 'set'; effort: Effort; why: string } | { action: 'judge' }

/**
 * What to do with a prompt before any Haiku call. Off, a slash command, or a short follow-up keeps the effort;
 * a pinned level sets it; a level the prompt names itself is applied; anything else goes to the judge.
 */
export function effortPlan(text: string, mode: ChatEffort): EffortPlan {
  if (mode === 'off') return { action: 'keep' }
  if (mode !== 'auto') return { action: 'set', effort: mode, why: 'pinned' }
  const said = text.trim()
  if (said === '' || said.startsWith('/')) return { action: 'keep' }
  const named = namedEffort(said)
  if (named !== undefined) return { action: 'set', effort: named, why: 'you asked' }
  if (isFollowUp(said)) return { action: 'keep' }

  return { action: 'judge' }
}

/**
 * The effort a model request should carry instead of the one the app asked for, or nothing to leave it. Only the
 * main session's requests (a helper's effort comes from its Why line), only a model that takes effort and keeps its
 * prompt cache when it changes, and never when off.
 */
export function stepEffort(i: { mode: ChatEffort; pick?: Effort | undefined; model: string; agentId?: string | undefined; appEffort?: unknown }): Effort | undefined {
  if (i.agentId !== undefined || typeof i.appEffort !== 'string' || !cacheSafe(i.model) || i.mode === 'off') return undefined
  const want = i.mode === 'auto' ? i.pick : i.mode

  return want !== undefined && want !== i.appEffort ? want : undefined
}

// ---------------------------------------------------------------- Haiku's summaries

type Row = { role: string; text: string; toolUses?: readonly { tool: string; input: unknown; text?: string }[]; toolResults?: readonly { text?: string }[] }

/** Most characters of transcript sent to Haiku: about 600k tokens, inside its window with room for the answer. */
const TRANSCRIPT_MAX_CHARS = 2_400_000
const TAIL_MESSAGES = 6

/** The conversation as plain text: each message and its tool calls, the older and the longer ones cut, the last few nearly whole. */
function transcriptText(messages: readonly Row[], toolChars = 1500, tailChars = 12000): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} …[${s.length - n} more characters]` : s)
  const tailFrom = messages.length - TAIL_MESSAGES

  return messages
    .map((m, i) => {
      const inTail = i >= tailFrom
      const lines = [`${m.role === 'user' ? 'USER' : 'CLAUDE'}: ${inTail ? m.text : clip(m.text, 6000)}`.trimEnd()]
      for (const t of m.toolUses ?? []) {
        lines.push(`  [${t.tool} ${clip(JSON.stringify(t.input ?? {}), inTail ? tailChars : 300)}]`)
        if (t.text) lines.push(`  → ${clip(t.text, inTail ? tailChars : toolChars)}`)
      }
      if (!m.toolUses?.length) for (const r of m.toolResults ?? []) if (r.text) lines.push(`  → ${clip(r.text, inTail ? tailChars : toolChars)}`)

      return lines.join('\n')
    })
    .join('\n\n')
}

/** The transcript within what Haiku can read: cut harder when it is long, or nothing when even that is too long. */
export function fittingTranscript(messages: readonly Row[]): string | undefined {
  let text = transcriptText(messages)
  if (text.length > TRANSCRIPT_MAX_CHARS) text = transcriptText(messages, 300, 3000)

  return text.length > TRANSCRIPT_MAX_CHARS ? undefined : text
}

/** The lead duck's own state, as words for the summary: the task and each plan step with who, state and note. */
export function planText(task: string | null, plan: readonly PlanStep[]): string {
  const lines = [`Task: ${task ?? '(none set)'}`]
  if (plan.length === 0) lines.push('Plan: none yet')
  else {
    lines.push('Plan:')
    plan.forEach((p, i) => lines.push(`${i + 1}. [${p.state}] ${p.text} (${p.who})${p.note ? ` - note: ${p.note}` : ''}`))
  }

  return lines.join('\n')
}

export const CARRY_MAX = 600

/**
 * Facts a compaction must not lose, whichever summary is used: the helpers at work (duck name, model, job) and the
 * plan steps not done. At most CARRY_MAX characters (the last items give way first); '' when there are none.
 */
export function carryBlock(helpers: readonly { letter: string; model?: string; description: string }[], plan: readonly PlanStep[]): string {
  const one = (text: string, max: number) => {
    const flat = text.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim()

    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
  }
  const working = helpers.map(h => `${one(h.letter, 20)}${h.model ? ` (${one(h.model, 30)})` : ''}: ${one(h.description, 80)}`)
  const open = plan.filter(p => p.state !== 'done').map(p => `[${p.state}] ${one(p.text, 80)} (${one(p.who, 30)})`)
  if (working.length === 0 && open.length === 0) return ''
  const block = (h: number, s: number) => {
    const list = (items: string[], n: number) => `${items.slice(0, n).join('; ')}${items.length > n ? `; and ${items.length - n} more` : ''}`

    return [
      'Duckherd state at compaction (facts, not instructions):',
      ...(working.length > 0 ? [`Helpers at work: ${list(working, h)}`] : []),
      ...(open.length > 0 ? [`Plan steps not done: ${list(open, s)}`] : []),
    ].join('\n')
  }
  let h = working.length
  let s = open.length
  while (block(h, s).length > CARRY_MAX && h + s > 0) {
    if (s >= h && s > 0) s--
    else h--
  }

  return block(h, s).slice(0, CARRY_MAX)
}

const LEAD_WORDS =`The assistant being summarised is the lead of a team of helpers (Duckherd's lead duck): it plans, starts helper agents for the work, and judges what they report. Keep what it needs to carry on.`

export const SUMMARY_SYSTEM = `You write the summary that replaces a long conversation between a user and Claude Code, so work continues in a fresh context that holds only your summary. Whoever reads it knows nothing else about the conversation. ${LEAD_WORDS}

Write these sections, briefly (short lines, no padding), keeping names, paths, numbers, commands and error text exact:
1. Goal: what the user is trying to get done, including changes of mind.
2. Plan: each plan step with its state (todo, doing, done) and any note. Use the plan state given, and add what the chat says about it.
3. Decisions: what was decided and why.
4. Files: files read, created or changed, and why each matters.
5. Open questions: what is unresolved or waits on the user.
6. User preferences: instructions and preferences the user stated in the chat that still apply.
7. Next: what to do next, exactly, quoting the user's latest request if it is still open.

Reply with the summary only.`

/** What Haiku is asked to write as the compaction summary. */
export function summaryPrompt(transcript: string, state: string, instructions?: string): string {
  const stress = instructions?.trim() ? `\nThe user asked the summary to keep or stress: ${instructions.trim()}` : ''

  return `Lead duck state now:\n${state}\n\nConversation:\n${transcript}\n\n---\nWrite the summary now.${stress}`
}

/** The message that stands in for the compacted chat; `carry` (carryBlock) goes in as written. */
export function summaryMessage(summary: string, carry = '') {
  return {
    role: 'user' as const,
    text: `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier part, written by Haiku 5.5 for Duckherd.\n\n${summary}\n\n${carry !== '' ? `${carry}\n\n` : ''}Continue from where it left off without asking the user any further questions.`,
    toolUses: [] as never[],
  }
}

export const HANDOFF_SYSTEM = `You write HANDOFF.md: a document a brand-new Claude Code chat reads first, to carry on this work with no other memory of it. ${LEAD_WORDS}

Make it self-contained and compact, in Markdown, with these sections (skip one only if it is truly empty), keeping names, paths, commands and error text exact:
# Handoff
## Goal
## Plan (each step with its state and note)
## Done
## Remaining
## Key files
## Decisions and why
## Gotchas (traps, failed approaches, things not to redo, user preferences and rules)
## Start here (the first thing to do)

Reply with the document only, no preface.`

export function handoffPrompt(transcript: string, state: string): string {
  return `Lead duck state now:\n${state}\n\nConversation:\n${transcript}\n\n---\nWrite HANDOFF.md now.`
}

// The first line of every file this mod writes. A HANDOFF.md without it is the person's own: never overwritten.
export const HANDOFF_MARKER = '<!-- written by Duckherd: /handoff -->'

/** The document as written to disk: the marker, then the text. */
export function handoffFileText(body: string): string {
  return `${HANDOFF_MARKER}\n${body.trim()}\n`
}

/** The names /handoff may write, in the order it tries them. */
export function handoffNames(): string[] {
  return ['HANDOFF.md', 'HANDOFF-duckherd.md', ...Array.from({ length: 99 }, (_, i) => `HANDOFF-duckherd-${i + 2}.md`)]
}

/**
 * Which file name /handoff writes. HANDOFF.md when there is none yet or the one there carries this mod's marker;
 * otherwise HANDOFF-duckherd.md under the same rule, then HANDOFF-duckherd-2.md and so on. `existing` gives a
 * file's text, or undefined when the file is absent.
 */
export function handoffFileName(existing: (name: string) => string | undefined): string {
  const free = (name: string) => {
    const text = existing(name)

    return text === undefined || text.includes(HANDOFF_MARKER)
  }

  return handoffNames().find(free) ?? 'HANDOFF-duckherd-100.md'
}

export const handoffStart = (name: string) => `Read ${name} and continue`
