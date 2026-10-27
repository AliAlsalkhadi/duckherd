export type HelperChoice = 'haiku' | 'sonnet' | 'opus' | 'auto'

export const HELPER_CHOICES: HelperChoice[] = ['haiku', 'sonnet', 'opus', 'auto']

export const MODEL_NAMES: Record<Exclude<HelperChoice, 'auto'>, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }

export function helperLabel(choice: HelperChoice): string {
  return choice === 'auto' ? 'the model the lead duck picks' : MODEL_NAMES[choice]
}

// How many quick looks (Read, Grep, Glob, Bash, web, other tools) the lead duck gets per request,
// to orient itself before it plans. Everything past that, and every edit, goes to a helper.
export const QUICK_LOOKS = 3

// How helpers' models are chosen: the person's pick with /helpers, or (auto) Sonnet unless the lead duck sets another.
export function modelsLine(choice: HelperChoice): string {
  return choice === 'auto'
    ? `- Helpers run on sonnet unless you set the model: haiku for mechanical work (find, read, run commands or tests, git chores, small exact edits); opus only for the hardest (design trade-offs, subtle concurrency or security bugs, a cause sonnet missed). You may start a prompt with "Why <model>/<effort>: <a few words>" for the person; effort is low, medium, high, xhigh or max. For subtle or cross-file work try "Why sonnet/high: …" before opus.`
    : `- Helpers run on ${MODEL_NAMES[choice]} whatever model you ask for (the person chose it with /helpers).`
}

export function leadSection(choice: HelperChoice, quickLooks: number = QUICK_LOOKS): string {
  return `# Duckherd mode

You are the lead duck: you plan, pick helpers, judge their reports and explain. Helpers (the Agent tool) do the work: reading code, running commands and tests, editing. You can't edit files, and you get ${quickLooks === 1 ? 'one quick look' : `${quickLooks} quick looks`} (Read, Grep, Bash and the like) per request; status checks (git status or log, gh pr view) and your memory folder and scratchpad are free.

- Plan first: call mcp__duckherd__plan with the task and 1 to 6 steps (a step per item for a list), each with who does it: "helper · <model>", "lead duck", "you" (the person's decisions, review, commits) or "handoff:<session>". The mod marks helper steps doing and done as helpers start and report; call it again only when the plan changes.
- One feature or fix (to ~600 lines) is one helper that plans, edits and tests it; no separate plan or review helper.
- Start every independent piece at once, in one message; only work on the same files, or that needs another's result, waits. Helpers editing the same repo at once get isolation: "worktree"; one helper merges after. Give each a self-contained brief: goal, where to look, what done is.
${modelsLine(choice)}
- Judge reports critically; don't redo the work. Wrong or unsure: retry, a model up only if the model was the problem. The mod checks "tests pass" claims against the runs it saw and tells you when one doesn't hold.
- On each report, start whatever it unblocked in the same turn. Work through a list without asking between items; stop only for the person's decisions.
- Vague request: ask, or do the smallest sensible reading and say what you assumed.
- A branch another of the person's sessions owns: don't edit it; draft that session a prompt with mcp__duckherd__handoff (load it with ToolSearch) and the person sends it.

Write for the person in short, plain words: outcomes, and the decisions that are theirs.`
}

// What the lead duck is told when the person changes the helper model with /helpers: the change alone.
export function modelChangeNote(choice: HelperChoice): string {
  return choice === 'auto' ? `You pick each helper's model again:\n${modelsLine(choice)}` : `Helpers now run on ${MODEL_NAMES[choice]} whatever model you ask for.`
}

export const LEARN_PROMPT = `Explain in plain English what we just did in this session, in 2 to 4 short sentences, then call mcp__duckherd__lesson (load it with ToolSearch if it isn't loaded) with that explanation and 1 or 2 lessons: each a named idea (a concept, pattern or practice) with one line on why it mattered here, and its topic. Keep it short and plain. The person sees the lesson as a card in the chat, so don't repeat it afterwards.`

// A helper's instructions when it runs as its own `duckherd:<name>` type: the one job it was handed, and a short report.
export const HELPER_PROMPT = `You are a helper: the lead duck gave you one piece of a larger task, and its message is your whole brief. Do that piece fully and nothing more, and don't hand it on. No new files or docs unless the job needs them. No destructive commands, pushes or posts unless the brief asks. Finish with a report under 300 words: what you did or found, the evidence (files, lines, test results) and what's left open; put anything longer in a file and give its path.`

// At most `max` words of a text, its line breaks kept.
export function clipWords(text: string, max: number): string {
  const wordsKept = new RegExp(`^\\s*(?:\\S+\\s+){0,${max - 1}}\\S+`).exec(text.trim())?.[0] ?? ''

  return wordsKept.length < text.trim().length ? `${wordsKept} …` : wordsKept
}

// A retried helper's prompt: the lead duck's, the earlier helper's brief when this one doesn't carry it, and what that
// one got done, so it isn't redone.
export function retryPrompt(prompt: string, earlier: { prompt: string; files?: string; worktree?: string; report?: string }): string {
  if (prompt.includes('Picking up from:')) return prompt
  const got = [earlier.files && `Files it changed:\n${earlier.files}`, earlier.worktree && `Its worktree: ${earlier.worktree}`, earlier.report && `Its last report:\n${earlier.report}`].filter(Boolean)
  const brief = prompt.includes(earlier.prompt.trim().slice(0, 80)) ? '' : `Original brief:\n${earlier.prompt.trim()}`

  return [prompt.trim(), brief, ['Picking up from: an earlier helper on this job stopped. Check its work and carry on; don\'t redo it.', ...got].join('\n')].filter(Boolean).join('\n\n')
}

// A line for the lead duck when a helper's report reaches it and helper steps of the plan are not started yet;
// undefined when none are. Steps waiting on the person, the lead duck or a handoff don't count, and none is
// nudged while a step of the person's is not done: the helper steps may be waiting on their answer.
export function waitingNudge(steps: readonly { who: string; state: string }[]): string | undefined {
  if (steps.some(s => s.state !== 'done' && s.who.trim().toLowerCase() === 'you')) return undefined
  const n = steps.filter(s => s.state === 'todo' && /^\s*helper\b/i.test(s.who)).length
  if (n === 0) return undefined

  return `Duckherd: the plan has ${n === 1 ? 'one helper step' : `${n} helper steps`} not started. Start the ones that don't wait on other work now, together in one message.`
}

// Claude Code's agent listing (the agent_listing_delta reminder) without the `duckherd:<name>` helper
// types: the model never picks them, so their lines are only tokens. They are offered only while a start
// or follow-up dispatches (register.tsx, `dispatching`); this catches any line a listing made then still
// carries. A header left with no lines goes too; null when no line is left at all.
export function withoutHelperTypes(text: string): string | null {
  const lines = text.split('\n')
  const kept = lines.filter(line => !line.startsWith('- duckherd:'))
  if (kept.length === lines.length) return text
  const shown = kept.filter((line, i) => !(line.endsWith(':') && line.includes('agent types') && !(kept[i + 1] ?? '').startsWith('- ')))

  return shown.some(line => line.startsWith('- ')) ? shown.join('\n') : null
}

// A model as the band names it: "claude-opus-5-5" as "Opus 5.5", a 1M-context one ("…[1m]") with "-1M"; a
// display name ("Opus 4.8 (1M context)") without "Claude ", its context as "-1M".
export function shortModel(model: string): string {
  const isBig = /\[1m\]$/i.test(model.trim())
  const bare = model.trim().replace(/\[1m\]$/i, '')
  const id = /^(?:claude-)?(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(bare)
  if (id !== null) {
    const family = id[1] ?? ''

    return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${id[2] ?? ''}${id[3] !== undefined ? `.${id[3]}` : ''}${isBig ? '-1M' : ''}`
  }

  return bare
    .replace(/^Claude /, '')
    .replace(/ \((\d+[kKmMbB]) context\)/g, '-$1')
}
