export type HelperModel = 'haiku' | 'sonnet' | 'opus' | 'auto'

export type Tab = 'agents' | 'changes' | 'sessions' | 'learn'

// One changed file in the Changes tab, as VS Code's Source Control lists it: a file staged and changed
// again shows in both groups. `letter` is VS Code's (M, A, D, R, C, T, U untracked, ! conflict).
export type FileChange = {
  path: string
  from?: string
  group: 'merge' | 'staged' | 'changes'
  letter: string
  added?: number
  removed?: number
}

// The checkout the Changes tab shows: its branch, how it stands against its upstream, the last commit
// and what has changed. `branch` is null when detached.
export type GitView = {
  root: string
  branch: string | null
  oid: string
  upstream?: string
  ahead: number
  behind: number
  // Its last commit, and when it was committed (ms).
  last?: { hash: string; subject: string; at?: number }
  files: FileChange[]
  // Files past the cap, not listed.
  more: number
  // The project's checkouts (the main one and its git worktrees), each with how many files are
  // uncommitted and when one last changed, to follow the work and switch between them.
  checkouts: Checkout[]
  // The checkout this session runs in, which has no Switch.
  own?: string
  // Whether it shows the checkout changed last (true), or one the person picked.
  following: boolean
  error?: string
  at: number
}

export type Checkout = { path: string; branch: string | null; changed: number; newest: number }

export type DiffLine = { kind: 'hunk' | 'add' | 'del' | 'same' | 'note'; text: string }

export type Step = {
  id: string
  at: number
  text: string
  tool: string
  state: 'running' | 'done' | 'failed' | 'refused'
  // When it finished, so a helper's duck can tell how long it has been quiet.
  endedAt?: number
}

export type AgentView = {
  id: string
  letter: string
  color: string
  kind: 'helper'
  description: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  steps: Step[]
  result?: string
  model?: string
  // The effort it runs at (low, medium, high…), set by the lead duck's Agent call.
  effort?: string
  report?: string
  // The lead duck's one line on why it picked this helper's model.
  why?: string
  // The report made easy to read: outcome, what it checked, what it found, the next step.
  digest?: Digest
  // Every token its requests used so far, added up (its `spent`, all four kinds together).
  tokens?: number
  // The same by kind, as the API counted each of its requests.
  spent?: Spent
  // The most context one of its requests held: the largest input + cache read + cache write. Not shown in the panel.
  peakContext?: number
  // The last message the person sent it with /tell, and when: its duck spots it land.
  told?: { at: number; text: string }
  // Its "tests pass", held to its own test runs: seen passing, or why it doesn't hold.
  testsSeen?: 'passed' | undefined
  claimDoubt?: string | undefined
  // The task it worked for (its title), so finished helpers group under it.
  task?: string | undefined
  // The files it changed, with lines added and taken out, as its own edits count them (absolute paths).
  files?: { path: string; added: number; removed: number }[] | undefined
  // Once it finished: what it changed in each file since it first touched it, in the checkout each is in (its own
  // worktree if it used one).
  diff?: HelperFile[] | undefined
  // The helper that started it, for a helper started by another helper.
  parent?: string | undefined
  // What it waits for the person to approve, and since when; cleared once that step runs.
  asking?: { at: number; text: string } | undefined
  // Since when its turn has ended but it waits on background work it started (a shell, a monitor),
  // which wakes it; it isn't finished until Claude Code says so.
  background?: number | undefined
}

// Tokens as the API counted them, each kind apart so a price can be put on them: input neither read from nor written
// to the prompt cache, output, read from the cache, and written to it.
export type Spent = { input: number; output: number; cacheRead: number; cacheWrite: number }

// What a task or a day used: the lead duck's own requests, its helpers', and both by the model that answered.
export type Spend = { lead: Spent; helpers: Spent; models: Record<string, Spent> }

// A task's record, by its name: what it used, and when it was at work (the lead duck's turns and its helpers' runs,
// merged so time when both worked counts once).
export type TaskSpend = { spend: Spend; spans: [number, number][]; firstAt: number; lastAt: number }

// A task for the panel: its name ('' for work before any task was named), whether it is the one in hand, its time
// at work so far, its tokens, and what they were.
export type TaskTotal = { name: string; isCurrent: boolean; busyMs: number; tokens: number; spend: Spend; firstAt: number; lastAt: number }

// A file a finished helper changed: the checkout it is in and its path there, and the lines added and taken out
// between the file as it was when the helper first touched it (or when another helper or the lead duck did, while it
// ran) and as it is at the end. `counted` is 'edits' when the file couldn't be read, so the helper's own edits gave the
// lines, and 'shell' when a shell command changed it before any copy was taken, so the command's own diff gave them
// (approximate). `alsoBy`: the others (helper letters, or the lead duck) that edited it in that time, whose lines are in it too.
export type HelperFile = { root: string; path: string; added: number; removed: number; isNew?: true; counted: 'git' | 'edits' | 'shell'; alsoBy?: string[] }

// A file a helper changed, with which helper: its diff's count once it finished, its own edits' count while it runs.
// `file` is the absolute path, to match the Changes tab's rows.
export type HelperChange = HelperFile & { file: string; helper: string; letter: string; color: string; isRunning: boolean }

export type Digest = {
  summary: string
  checks: { what: string; result: 'pass' | 'fail' | 'info' }[]
  findings: { level: 'blocker' | 'issue' | 'minor' | 'note'; text: string; where?: string }[]
  next?: string
}

// `note`: one short line of what the step found ("cause is X in file Y"), kept with an unfinished task so
// Continue needn't rediscover it.
export type PlanStep = { text: string; who: string; state: 'todo' | 'doing' | 'done'; note?: string }

export type Handoff = {
  id: string
  to: string
  text: string
  why?: string
  state: 'draft' | 'sent' | 'discarded'
  createdAt: number
  sentAt?: number
  reply?: string
  error?: string
}

export type Peer = {
  name: string
  ref?: string
  sessionId?: string
  // The process of a session open in a terminal, to find its tab.
  pid?: number
  kind: 'background' | 'terminal'
  // It is stopped on a question or a permission only the person can answer.
  isWaiting: boolean
  detail: string
  // Its folder, what it's doing in a word or two (working, idle, done…), the branch checked out in its
  // folder and when its transcript last changed.
  cwd?: string
  status?: string
  isDone?: boolean
  branch?: string
  lastActive?: number
}

// What this lead duck sent another session (a message, a handoff), for the
// dashboard file. `sessionId` is null when the mod doesn't know it.
export type SentMessage = { at: number; to: { sessionId: string | null; name: string }; verb: 'message' | 'handoff'; text: string }

export type Lesson = { idea: string; text: string; topic?: string }

// One lesson. Lessons saved together share `at`, `from` and `what` (what we did, in plain English).
export type LogEntry = { at: number; idea: string; text: string; from: string; what?: string; topic?: string }

export type LearnView = 'recent' | 'topics'

export type Summary = { at: number; what: string; from: string }

export type MemChild = { name: string; mb: number }

// One Claude session on the Mac, for the Memory section: what it and what it started hold, and how it
// stands. `ref` is what `claude stop` and `claude attach` take.
export type MemSession = {
  name: string
  // Its process, while it has one: a background session waiting or done may have none, and holds nothing.
  pid?: number
  kind: 'terminal' | 'background'
  // In plain words: working, idle, waiting for you, done.
  state: string
  isWaiting: boolean
  isWorking: boolean
  ref?: string
  sessionId?: string
  cwd?: string
  // The session and everything it started, in MB; its biggest children.
  mb: number
  children: MemChild[]
  // When its transcript last changed, and the last thing the person asked it.
  lastActive?: number
  lastAsk?: string
}

// Something running outside every Claude session that holds memory: a booted simulator, or a dev server
// or test browser whose session is gone. `id` is the simulator's udid or the process id.
export type Leftover = {
  kind: 'simulator' | 'server' | 'browser'
  id: string
  name: string
  mb: number
  // How long it has run, when its process tells; when a simulator was last used.
  upMs?: number
  lastUsed?: number
  // What runs in it: the app in a simulator, the folder a server serves; whether something is
  // connected to a server right now.
  detail?: string
  isInUse?: boolean
}

// The Sessions tab's Memory section: every Claude session on the Mac, what it holds, and the Mac's
// memory as a whole.
export type MemoryView = {
  at: number
  ramMb: number
  // macOS's memory pressure: 1 fine, 2 short, 4 critical.
  pressure?: number
  swapUsedMb?: number
  swapTotalMb?: number
  sessions: MemSession[]
  leftovers?: Leftover[]
  error?: string
  // Why sizes are missing, on a system with no simple way to read them.
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    duckherd: {
      tab: Tab
      task: string | null
      plan: PlanStep[]
      agents: AgentView[]
      selected: string | null
      handoffs: Handoff[]
      selectedHandoff: string | null
      peers: Peer[]
      log: LogEntry[]
      summary: Summary | null
      letters: number
      started: boolean
      helperModel: HelperModel
      // The lead duck's own quick looks (Read, Grep, Bash…) for the request in hand.
      looks: number
      // Whether the lead duck has started a helper for the request in hand: then checking goes to helpers too.
      handedOff: boolean
      // The helper whose full report, and whose steps, are unfolded in its View.
      reportOpen: string | null
      stepsOpen: string | null
      // Whether the Agents tab lists every helper, or only the five worked on last.
      // The session whose Tell box is open in the Sessions tab, and whether removing the finished ones
      // is waiting on the person's yes.
      tellingSession: string | null
      // Whether the lead duck sends cmux notifications (/duckherd notify on|off).
      notifyOn: boolean
      quackOn: boolean
      quackGain: number
      ducksCalm: boolean
      // The ducks as text (two colours a cell) rather than pictures (/crew text | pictures).
      ducksText: boolean
      confirmRemove: boolean
      // Whether the Agents tab's plan shows its done steps.
      planDoneOpen: boolean
      // Whether the "Helpers run on:" picker shows its choices.
      modelsOpen: boolean
      // Tasks lined up after this one (/lead duck next).
      queue: string[]
      // The finished helpers' task groups the person opened or folded, against how each starts.
      groupsFlipped: string[]
      learnView: LearnView
      // The idea open in the Learn tab: `<where>:<idea key>`, so it opens where it was pressed.
      learnSelected: string | null
      learnLimit: number
      // The piece of work open in the Learn tab's Recent view (`<at>:<from>`), showing what we did.
      learnWorkOpen: string | null
      topics: Record<string, string>
      explanations: Record<string, string>
      // The Changes tab: what git says, the checkout picked (null: the session's own), the folders
      // folded shut (`<group>:<folder>/`), the file open (`<group>:<path>`) and its diff.
      changes: GitView | null
      changesRepo: string | null
      changesClosed: string[]
      changeOpen: string | null
      changeDiff: { key: string; lines: DiffLine[]; more: number; binary: boolean } | null
      // Whether the Changes tab lists the clean worktrees too.
      checkoutsOpen: boolean
      // The Sessions tab's list: what was last read, whether other projects' sessions are unfolded, and
      // the session whose Stop or Close is waiting on the person's yes, and the one whose Open shows its actions.
      memory: MemoryView | null
      othersOpen: boolean
      stopAsk: string | null
      sessionOpen: string | null
      // What this lead duck sent other sessions, newest first, kept a day (the status file's messages, kept only with the statusFiles setting on).
      messages: SentMessage[]
      // What each task of this lead duck's used, by its name.
      taskSpend: Record<string, TaskSpend>
    }
  }
}
