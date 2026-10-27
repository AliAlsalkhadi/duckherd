// The panel: its four tabs (Agents, Git, Sessions, Learn), each a stack of cards, with the context and usage card on
// top. It draws from the state atoms and from what the lead duck's side hands it (PanelCore), and changes things
// only through those: an atom it updates, or one of PanelCore's actions. register.tsx opens it and hooks it in.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { AgentView, Checkout, FileChange, LearnView, LogEntry, MemoryView, Peer, PlanStep, Tab } from '../types'
import { HELPER_COLORS, LEAD_COLOR, modelOf } from './critter'
import { within } from './sessions'
import { LEVEL_LABELS } from './digest'
import { fileColor, sinceText, treeRows } from './changes'
import type { TreeRow } from './changes'
import { ASLEEP_MS, FLINCH_MS, KIND_LABELS, NOTE_MS, REACT_MS, actionOfKind, actionOfStep, duckViewDrawing, duckViewRows, helperKind, pictureOf, scaleOf } from './creatures'
import type { DuckScene, DuckView, Run, ThemeArt, Wear } from './creatures'
import { clipText, plainText, stripControl } from './steps'
import { helperArt, helperColumns, leadArt, leadColumns } from './themes'
import type { LoadedTheme } from './themes'
import { sizeText } from './memory'
import type { Leftover, MemSession } from './memory'
import { TOPICS, conceptsOf, ideaKey, sessionsOf, shortDay, topicColor } from './learn'
import type { Concept } from './learn'
import { HELPER_CHOICES, LEARN_PROMPT, MODEL_NAMES, helperLabel, shortModel } from './text'
import type { HelperChoice } from './text'
import { ttlMs } from './cache'
import type { Ttl } from './cache'
import type { warnings } from './throttle'
import { BAND_COLORS, BRANCH_MAX, CACHE_SOON_MS, effortStyle, fitLine, folderName, metersOf, piecesWidth } from './band'
import type { Meter, Piece, StatusFacts } from './band'
import { dayOf, shortTime, whenAt } from './times'

type $ = EngineInterface

// The mod's state the panel reads or writes, declared as register.tsx does (the engine's scan reads an atom only
// where its own file made it).
const tab = atom({ plugin: 'duckherd', key: 'tab' } as const, 'agents')
const task = atom({ plugin: 'duckherd', key: 'task' } as const, null)
const plan = atom({ plugin: 'duckherd', key: 'plan' } as const, [])
const handoffs = atom({ plugin: 'duckherd', key: 'handoffs' } as const, [])
const selectedHandoff = atom({ plugin: 'duckherd', key: 'selectedHandoff' } as const, null)
const peers = atom({ plugin: 'duckherd', key: 'peers' } as const, [])
const helperModel = atom({ plugin: 'duckherd', key: 'helperModel' } as const, 'auto')
const looks = atom({ plugin: 'duckherd', key: 'looks' } as const, 0)
const handedOff = atom({ plugin: 'duckherd', key: 'handedOff' } as const, false)
const queue = atom({ plugin: 'duckherd', key: 'queue' } as const, [] as string[])
const tellingSession = atom({ plugin: 'duckherd', key: 'tellingSession' } as const, null)
const ducksCalm = atom({ plugin: 'duckherd', key: 'ducksCalm' } as const, false)
const confirmRemove = atom({ plugin: 'duckherd', key: 'confirmRemove' } as const, false)
const explanations = atom({ plugin: 'duckherd', key: 'explanations' } as const, {})
const changes = atom({ plugin: 'duckherd', key: 'changes' } as const, null)
const changesClosed = atom({ plugin: 'duckherd', key: 'changesClosed' } as const, [])
const changeOpen = atom({ plugin: 'duckherd', key: 'changeOpen' } as const, null)
const changeDiff = atom({ plugin: 'duckherd', key: 'changeDiff' } as const, null)
const memory = atom({ plugin: 'duckherd', key: 'memory' } as const, null as MemoryView | null)
const stopAsk = atom({ plugin: 'duckherd', key: 'stopAsk' } as const, null as string | null)
// The panel's own state: what is open, folded or picked in it.
const selected = atom({ plugin: 'duckherd', key: 'selected' } as const, null)
const reportOpen = atom({ plugin: 'duckherd', key: 'reportOpen' } as const, null)
const stepsOpen = atom({ plugin: 'duckherd', key: 'stepsOpen' } as const, null)
const planDoneOpen = atom({ plugin: 'duckherd', key: 'planDoneOpen' } as const, false)
const modelsOpen = atom({ plugin: 'duckherd', key: 'modelsOpen' } as const, false)
const groupsFlipped = atom({ plugin: 'duckherd', key: 'groupsFlipped' } as const, [] as string[])
const learnView = atom({ plugin: 'duckherd', key: 'learnView' } as const, 'recent')
const learnSelected = atom({ plugin: 'duckherd', key: 'learnSelected' } as const, null)
const learnLimit = atom({ plugin: 'duckherd', key: 'learnLimit' } as const, 10)
const learnWorkOpen = atom({ plugin: 'duckherd', key: 'learnWorkOpen' } as const, null)
const checkoutsOpen = atom({ plugin: 'duckherd', key: 'checkoutsOpen' } as const, false)
const othersOpen = atom({ plugin: 'duckherd', key: 'othersOpen' } as const, false)
// The session whose Open is pressed: its actions (Go to, Close) on a line under it.
const sessionOpen = atom({ plugin: 'duckherd', key: 'sessionOpen' } as const, null as string | null)

export const TABS: Tab[] = ['agents', 'changes', 'sessions', 'learn']

// How long the lead duck's one cheer lasts once the plan's last step is done.
export const FINISH_MS = REACT_MS * 2

// What the panel has from the lead duck's side besides the state atoms, made for each drawing (panelCore in
// register.tsx). What it reads is read live (each a getter), so a press or a timer that changed it shows on the next
// drawing; what it does are the lead duck's own actions, bound to the drawing's $ (a hooks module passes $ only to
// a function of its own files, never through an object), each called from a press.
export type PanelCore = {
  // Whether the ducks hold still: cmux isn't in front, or this lead duck's tab isn't on screen (as the
  // once-a-second check last found it).
  readonly isStill: boolean
  // The project's folder (the git top level, else where the session started), home, and this session's id.
  readonly root: string
  readonly home: string
  readonly ownSessionId: string
  readonly quickLooks: number
  // When the lead duck's own turn began, while it runs, and what it is doing (its latest tool, in words).
  readonly leadSince: number | undefined
  readonly leadNow: string | undefined
  // When the plan's last step was done, for the lead duck's one cheer.
  readonly planDoneAt: number | undefined
  // The theme drawn now (undefined: the ducks).
  readonly activeTheme: LoadedTheme | undefined
  readonly cacheTtl: Ttl
  // The lead duck's context, and its compact offer: the task it was closed for, what compacting came to, the share
  // the last compaction kept, and whether it is under way.
  readonly contextTokens: number
  readonly compactHiddenFor: string | undefined
  readonly compacted: { task: string; from: number; to?: number } | undefined
  readonly compactRatio: number | undefined
  readonly isCompacting: boolean
  // The handoff file: being written, once written, and whether its note was closed.
  readonly isHandingOff: boolean
  readonly handoffNote: { name: string; path: string } | undefined
  readonly handoffNoteHidden: boolean
  readonly throttleLevel: 0 | 1 | 2
  readonly throttleWarnings: ReturnType<typeof warnings>
  // The last unfinished task here, from another lead duck, and whether the person chose a new one instead.
  readonly resumable: { task: string; steps: PlanStep[] } | undefined
  readonly resumeDismissed: boolean
  // A newer Duckherd on disk, and whether Update now waits for its second press.
  readonly newer: { version: string | undefined; isInstalled: boolean } | undefined
  readonly restartArmed: boolean
  // Welcome back: what the notes said while the person was away.
  readonly welcome: { at: number; text: string } | undefined
  // Two helpers on one file, a line each.
  readonly clashes: string[]
  // The agents with the helpers' steps not yet written, so it never draws them late.
  agents: () => Promise<AgentView[]>
  statusFacts: () => Promise<StatusFacts>
  // Whether the ducks are drawn as text: /crew text, or a terminal that can draw no pictures.
  ducksAsText: () => Promise<boolean>
  lookOf: (color: string, name?: string) => { breed: number; wear?: Wear; theme?: ThemeArt }
  // How the watchdog stands with a running helper: asked where it is, or the lead duck told.
  stuckCheck: (id: string) => { askedAt?: number; isEscalated?: boolean } | undefined
  isDigesting: (id: string) => boolean
  throttleLine: (now: number) => string | undefined
  logShown: () => string
  cmuxCommand: () => Promise<string | undefined>
  helperDays: () => Promise<Record<string, { done: number; failed: number; models: Record<string, number>; tokens?: number }>>
  entriesNow: () => Promise<LogEntry[]>

  // What the panel's surface can draw; a duck drawn as a picture, by its key; the panel drawn (the band above the
  // prompt steps aside).
  noteSurface: (surface: { image: boolean; client: boolean }) => void
  notePicture: (key: string, view: DuckView, png: string) => void
  showBandInPane: () => void
  // A note closed: the welcome, the compact offer for a task, what compacting came to, the handoff note, the last
  // task's offer.
  dismissWelcome: () => void
  hideCompactOffer: (named: string) => void
  hideCompacted: () => void
  hideHandoffNote: () => void
  dismissResume: () => void
  // The sessions read afresh on the next refresh.
  forgetListing: () => void
  refreshPeers: () => Promise<void>
  refreshMemory: () => Promise<void>
  refreshChanges: (fresh?: boolean) => Promise<void>
  updateNow: () => Promise<void>
  setHelperModel: (choice: HelperChoice) => Promise<void>
  compactLead: (named: string) => Promise<void>
  writeHandoff: () => Promise<void>
  startFresh: (name: string) => Promise<void>
  resume: () => Promise<void>
  digestHelper: (id: string) => Promise<void>
  readHelperTokens: (id: string, isRunning?: boolean) => Promise<void>
  // Asks a helper whose duck dozed off where it is.
  nudge: (a: AgentView) => Promise<boolean>
  watchHelper: (a: AgentView) => Promise<void>
  retryHelper: (a: AgentView) => void
  toast: (text: string) => void
  relay: (text: string, how?: { asPerson?: boolean }) => void
  openSession: (p: Peer) => Promise<void>
  closeSession: (m: MemSession) => Promise<void>
  stopSession: (m: MemSession) => Promise<void>
  removeSession: (m: MemSession) => Promise<void>
  tellPeer: (p: Peer, text: string) => Promise<void>
  sendHandoff: (id: string) => Promise<void>
  stopLeftover: (l: Leftover) => Promise<void>
  removeFinished: () => Promise<void>
  pickCheckout: (path: string | null) => Promise<void>
  toggleChange: (f: FileChange, key: string) => Promise<void>
  openFullDiff: (f: FileChange) => Promise<void>
  explainIdea: (key: string) => Promise<void>
  addExplanationToLog: (key: string) => Promise<void>
  openLog: () => Promise<void>
}

// When a tab last read what it shows, for its footer: 12s ago under a minute, then as sinceText says.
function checkedText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))

  return s < 60 ? `${s}s ago` : sinceText(ms)
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function tokensText(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M tok` : `${Math.round(n / 1000)}k tok`
}

// How long the lead duck has been going, for the panel's corner: 12m, 1h 05m, 2d 3h.
function upFor(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`

  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

// How long a running helper has been quiet: since its last step ended (none while a step still runs,
// as a long test run is work, or while it waits for the person).
function quietOf(a: AgentView, at: number): number {
  const last = a.steps[a.steps.length - 1]
  if (a.status !== 'running' || a.asking !== undefined || a.background !== undefined || last === undefined || last.state === 'running') return 0

  return at - (last.endedAt ?? last.at)
}

// The last step, when it failed, unless it was a search: finding nothing is no failure.
function failedStep(a: AgentView) {
  const last = a.steps[a.steps.length - 1]

  return last !== undefined && last.state === 'failed' && last.endedAt !== undefined && actionOfStep(last.tool, last.text) !== 'dabble' ? last : undefined
}

// "stopped · Retry" on a stopped helper's row, just before its time and model.
const STOPPED_COLS = 'stopped · Retry'.length
// The welcome back line shows ten minutes, unless it's closed.
const WELCOME_MS = 600000
// The compact offer's estimate, before this session has compacted once: a rough guess at the share a summary keeps.
const COMPACT_GUESS = 0.1
// Its fill bar: the context window in 24 cells.
const FILL_CELLS = 24

const kTokens = (n: number) => `${Math.round(n / 1000)}k`

// Card outlines that stand apart: mid-tones that read on dark and light terminals. The helpers card (border, heading
// and running count) is orange, the lead duck's gold, the context and usage card soft violet, the plan sea green.
const HELPERS_TINT = '#F28C38'
const LEAD_TINT = '#E8B931'
const USAGE_TINT = '#AF87FF'
const PLAN_TINT = '#5FD7AF'

// The lead duck's task as the panel shows it: the title less its "(branch …)", the branch (as the task names
// it, else the one the Git tab shows), the plan, and what the lead duck is doing now.
async function leadTop($: $, core: PanelCore) {
  const named = await read($, task)
  const steps = await read($, plan)
  const branchSaid = /\s*\(branch ([^)]+)\)\s*$/i.exec(named ?? '')
  const title = branchSaid !== null ? (named ?? '').slice(0, branchSaid.index) : named
  const branch = branchSaid?.[1] ?? (await read($, changes))?.branch ?? undefined
  const working = (await core.agents()).filter(a => a.kind === 'helper' && a.status === 'running')
  const leadDoing =
    core.leadNow === undefined
      ? 'thinking it over'
      : core.leadNow.startsWith('Starting a helper') && working.length > 0
        ? `waiting on ${working.length === 1 ? `helper ${working[0]?.letter ?? ''}` : `helpers ${working.map(a => a.letter).join(', ')}`}`
        : core.leadNow

  return { named, steps, title, branch, leadDoing }
}

// The Agents tab's project line: the folder ochre, a dim " · ", the branch slate blue with ✓ sage or ● terracotta,
// and while there's uncommitted work the lines added and taken out. Short of room the lines go first, then the
// folder name shortens; the branch goes only when that can't make room.
function projectPieces(s: StatusFacts, room: number): Piece[] {
  const folder = folderName(s.folder)
  const git = s.git
  const branch = git?.branch == null ? undefined : plainText(git.branch)
  const build = (dir: string, withBranch: boolean, withLines: boolean): Piece[] => {
    const out: Piece[] = [{ key: 'pj-dir', text: dir, color: BAND_COLORS.folder }]
    if (withBranch && git !== undefined && branch !== undefined) {
      out.push({ key: 'pj-sep', text: ' · ', dim: true }, { key: 'pj-branch', text: branch.length > BRANCH_MAX ? `${branch.slice(0, BRANCH_MAX - 1)}…` : branch, color: BAND_COLORS.branch }, { key: 'pj-mark-gap', text: ' ' })
      out.push(git.dirty ? { key: 'pj-dirty', text: '●', color: BAND_COLORS.dirty, bold: true } : { key: 'pj-clean', text: '✓', color: BAND_COLORS.clean })
    }
    if (withLines && git?.dirty === true && (s.lines.added > 0 || s.lines.removed > 0)) {
      out.push({ key: 'pj-lines-gap', text: '  ' }, { key: 'pj-added', text: `+${s.lines.added}`, color: BAND_COLORS.added }, { key: 'pj-lines-mid', text: ' ' }, { key: 'pj-removed', text: `−${s.lines.removed}`, color: BAND_COLORS.removed })
    }

    return out
  }
  let withBranch = true
  let pieces = build(folder, true, true)
  if (piecesWidth(pieces) > room) pieces = build(folder, true, false)
  const shorten = () => {
    const over = piecesWidth(pieces) - room
    if (over > 0 && folder.length - over >= 2) pieces = build(`${folder.slice(0, folder.length - over - 1)}…`, withBranch, false)
  }
  shorten()
  if (piecesWidth(pieces) > room && branch !== undefined) {
    withBranch = false
    pieces = build(folder, false, false)
    shorten()
  }

  return fitLine(pieces, room)
}

// One meter on the usage card: "ctx" in its colour (the 5-hour and the week go unlabelled, read by their reset times), a
// 6-cell gauge (▰ filled, ▱ dim), two spaces, the share, and the time to its reset. The context reads by what is
// left; the 5-hour and the week by the share used, "40%", as /usage and the band give it.
// Each has its own colour while calm (ctx cyan, the 5-hour sky blue, the week pink, the cache mint); past its warning
// or error line on the share used the gauge and the share (bold) take the theme's colour. The reset is coloured by how
// much of its window is left, whatever the meter's tone: green under 20%, amber to 60%, orange beyond.
const GAUGE_CELLS = 6
const METER_COLORS: Record<string, string> = { context: '#5FD7D7', five: '#5FAFFF', week: '#FF5FAF', cache: '#87D787' }
const resetColor = (leftShare: number) => (leftShare < 0.2 ? '#5FD75F' : leftShare <= 0.6 ? '#D7AF5F' : '#FF875F')
const gaugeCells = (share: number) => (share <= 0 ? 0 : Math.min(GAUGE_CELLS, Math.max(1, Math.round(share * GAUGE_CELLS))))
function gaugePieces(m: Meter): Piece[] {
  const used = Math.max(0, Math.min(100, m.pct))
  const share = m.key === 'context' ? 100 - used : used
  const cells = gaugeCells(share / 100)
  const tint = m.tone === 'calm' ? (METER_COLORS[m.key] ?? BAND_COLORS.calm) : m.tone
  const pieces: Piece[] = [
    { key: `u-${m.key}-l`, text: m.label, color: tint },
    { key: `u-${m.key}-sp`, text: m.label === '' ? '' : ' ' },
    { key: `u-${m.key}-on`, text: '▰'.repeat(cells), color: tint },
    { key: `u-${m.key}-off`, text: '▱'.repeat(GAUGE_CELLS - cells), dim: true },
    { key: `u-${m.key}-sp2`, text: '  ' },
    { key: `u-${m.key}`, text: `${share}%`, color: tint, ...(m.tone === 'calm' ? {} : { bold: true }) },
  ]
  if (m.left !== undefined) pieces.push({ key: `u-${m.key}-left-sp`, text: ' ' }, { key: `u-${m.key}-left`, text: m.left, ...(m.leftShare === undefined ? { dim: true } : { color: resetColor(m.leftShare) }) })

  return pieces.filter(p => p.text !== '')
}

// The prompt cache as a meter beside them: "cache" in its colour and a 6-cell gauge of its time-to-live left, no time and no
// word. Its own colour while warm, warning in its last minutes, every cell empty in the cold colour once it has gone cold.
function cachePieces(left: number, ttl: number): Piece[] {
  const cells = left <= 0 ? 0 : gaugeCells(Math.min(1, left / ttl))
  const tint = left <= 0 ? BAND_COLORS.cold : left <= CACHE_SOON_MS ? 'warning' : (METER_COLORS.cache ?? BAND_COLORS.warm)
  const pieces: Piece[] = [
    { key: 'u-cache-l', text: 'cache', color: tint },
    { key: 'u-cache-sp', text: ' ' },
    { key: 'u-cache-on', text: '▰'.repeat(cells), color: tint },
    left <= 0 ? { key: 'u-cache-off', text: '▱'.repeat(GAUGE_CELLS), color: tint } : { key: 'u-cache-off', text: '▱'.repeat(GAUGE_CELLS - cells), dim: true },
  ]

  return pieces.filter(p => p.text !== '')
}

export async function drawPane($: $, e: RenderInput<'Pane'>, core: PanelCore) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const width = e.props.bodyColumns ?? e.viewport?.columns ?? 80
  const at = await $.clock.now()
  const isCalm = await read($, ducksCalm)
  // As the once-a-second check last found it: no asking from inside a drawing.
  const isStill = core.isStill

  const stored = await read($, tab)
  const current: Tab = TABS.includes(stored) ? stored : 'agents'
  // What the band above the prompt shows, drawn here in cards: the context and usage on top of every tab, where
  // you are and the model on the Agents tab's top card.
  const facts = await core.statusFacts()
  const meters = metersOf(facts.usage, facts.now)
  // With the helpers' steps not yet written, so it never draws them late.
  const allAgents = await core.agents()
  const helpers = allAgents.filter(a => a.kind === 'helper')
  const drafts = (await read($, handoffs)).filter(h => h.state !== 'discarded')
  const running = helpers.filter(a => a.status === 'running').length
  const toSend = drafts.filter(h => h.state === 'draft').length
  const peersWaiting = (await read($, peers)).filter(p => p.isWaiting).length
  // When this session began: its launch, or a resumed one's first launch.
  const sessionStart = await $.session.usage().then(
    u => u.startedAt,
    () => undefined,
  )
  const changedFiles = new Set((await read($, changes))?.files.map(f => f.path) ?? []).size
  // Each tab's mark: one number in brackets after its name, the most pressing: in the warning colour
  // when it waits on the person, else as dim as its word.
  type Mark = { n: number; tone: 'need' | 'busy' | 'count' }
  const markOf = (...marks: Mark[]) => marks.find(m => m.n > 0)

  // A duck: drawn by the terminal itself where it can (a Client, moving on its own frame clock), else
  // as it stands now.
  // A terminal that can draw neither pictures nor a duck of its own gets text ducks without being
  // asked; the person's `/crew pictures` holds them to pictures.
  if ((e as { surface?: string }).surface === 'terminal') core.noteSurface({ image: 'Image' in ui, client: 'Client' in ui })
  const asText = await core.ducksAsText()
  // Its size is the drawing's own: a cell is 2 x 4 pixels (times the theme's scale), whatever the frame size a theme sets.
  const duckOn = (key: string, view: DuckView) => {
    const v = { ...view, stamp: at, isStill } as DuckView
    const d = duckViewDrawing(v, at, 0)
    const width = (d.frame[0]?.length ?? 0) / (2 * scaleOf(d.theme))
    if (!asText && 'Image' in ui) {
      const png = pictureOf(d)
      core.notePicture(key, v, png)

      return <ui.Image key={key} source={{ png }} columns={width} rows={Math.ceil(d.frame.length / (4 * scaleOf(d.theme)))} alt=" " />
    }
    if ('Client' in ui) return <ui.Client key={key} module="./duck-view.tsx" props={v} width={width} height={duckViewRows(v, at, 0).length} />

    return drawRows(duckViewRows(v, at, 0), key)
  }
  // A drawing's rows of styled runs (a duck), each row one line.
  const drawRows = (rows: Run[][], key: string) =>
    rows.map((runs, r) => (
      <Box key={`${key}-${r}`} flexDirection="row">
        {runs.map((run, j) => (
          <Text key={`${key}-${r}-${j}`} {...(run.color !== undefined ? { color: run.color } : {})} {...(run.backgroundColor !== undefined ? { backgroundColor: run.backgroundColor } : {})}>
            {run.text}
          </Text>
        ))}
      </Box>
    ))
  // A card: rounded, its border in its role's colour (the lead duck's gold, the plan's sea green, the helpers' orange, the usage card's violet,
  // what needs you the warning colour, the rest dim). Every tab stacks them with no row between.
  const card = (key: string, tint: string | 'dim', children: RenderChildren) => (
    <Box key={key} flexDirection="column" borderStyle="round" {...(tint === 'dim' ? { borderDimColor: true } : { borderColor: tint })} paddingX={1}>
      {children}
    </Box>
  )
  // A band piece as text.
  const textOf = (p: Piece) => (
    <Text key={p.key} {...(p.color !== undefined ? { color: p.color } : {})} {...(p.bold === true ? { bold: true } : {})} {...(p.dim === true ? { dimColor: true } : {})}>
      {p.text}
    </Text>
  )
  // The context and usage card, on top of every tab: one row of 6-cell gauges (the cache's, of its time left) (wrapping when narrow, a meter never dropped), the prompt cache the last of them; then the notes the tab has for it (the
  // compact offer, the handoff note, the throttle and usage warnings; only the Agents tab has any).
  const cacheLeft = facts.cacheLeft
  const usageCardOf = (notes: RenderChildren[]) =>
    (meters.length > 0 || cacheLeft !== undefined || notes.length > 0) &&
    card('usage', USAGE_TINT, [
      (meters.length > 0 || cacheLeft !== undefined) && (
        <Box key="usage-row" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {meters.map(m => (
            <Box key={`meter-${m.key}`} flexDirection="row" flexShrink={0}>
              {gaugePieces(m).map(textOf)}
            </Box>
          ))}
          {cacheLeft !== undefined && (
            <Box key="meter-cache" flexDirection="row" flexShrink={0}>
              {cachePieces(cacheLeft, ttlMs(core.cacheTtl)).map(textOf)}
            </Box>
          )}
        </Box>
      ),
      notes.length > 0 && (
        <Box key="usage-notes" flexDirection="column">
          {notes}
        </Box>
      ),
    ])
  // A card's heading row: its word on the left, its facts flush right.
  const cardHead = (key: string, left: RenderChildren, right?: RenderChildren) => (
    <Box key={key} flexDirection="row">
      <Box key={`${key}-l`} flexDirection="row" flexGrow={1} flexShrink={1} overflow="hidden">
        {left}
      </Box>
      {right !== undefined && (
        <Box key={`${key}-r`} flexDirection="row" flexShrink={0} marginLeft={2}>
          {right}
        </Box>
      )}
    </Box>
  )
  // A tab's footer: when it was read, then its secondary links, all dim on one line with " · " between.
  const footer = (key: string, parts: unknown[]) => (
    <Box key={key} flexDirection="row" flexWrap="wrap" paddingLeft={2}>
      {parts.filter(x => x !== false && x !== undefined && x !== null).flatMap((p, i) => (i === 0 ? [p] : [<Text key={`${key}-sep-${i}`} dimColor>{' · '}</Text>, p])) as never}
    </Box>
  )
  const tabs: { id: Tab; name: string; mark?: Mark | undefined }[] = [
    { id: 'agents', name: 'Agents', mark: markOf({ n: running, tone: 'busy' }) },
    { id: 'changes', name: 'Git', mark: markOf({ n: changedFiles, tone: 'count' }) },
    { id: 'sessions', name: 'Sessions', mark: markOf({ n: peersWaiting + toSend, tone: 'need' }) },
    { id: 'learn', name: 'Learn' },
  ]

  const openTab = (id: Tab) => {
    void update($, tab, () => id)
    if (id === 'sessions') {
      void core.refreshPeers()
      void core.refreshMemory()
    }
    if (id === 'changes') void core.refreshChanges(true)
  }
  const header = (
    <Box key="tabs-head" flexDirection="column">
      {/* one row. The tab shown is bold and underlined, the rest are dim words;
          no line under it. Their number keys sit on hidden buttons, as a plain button with a key would
          draw "1:" before its name. */}
      <Box key="tabs-row" flexDirection="row" columnGap={1}>
        <Box key="tabs" flexDirection="row" columnGap={2} flexGrow={1} flexShrink={1}>
          {tabs.map(t => {
            const isOn = t.id === current
            const mark = t.mark

            return (
              <Box key={`tab-box-${t.id}`} flexDirection="row" flexShrink={0}>
                {/* The panel has no background of its own, so it matches the terminal in any theme. The tab
                    shown is bold and underlined in the theme's own accent; the rest are dim. */}
                {isOn ? (
                  <Button key={`tab-${t.id}`} plain onPress={() => openTab(t.id)}>
                    <Text bold underline color="suggestion">{mark !== undefined ? `${t.name} (${mark.n})` : t.name}</Text>
                  </Button>
                ) : mark?.tone === 'need' ? (
                  // A number that waits on the person is in the theme's warning colour; the rest match their word.
                  <Button key={`tab-${t.id}`} plain onPress={() => openTab(t.id)}>
                    <Text dimColor>{t.name}</Text>
                    <Text color="warning">{` (${mark.n})`}</Text>
                  </Button>
                ) : (
                  <Button key={`tab-${t.id}`} plain label={mark !== undefined ? `${t.name} (${mark.n})` : t.name} dimColor onPress={() => openTab(t.id)} />
                )}
              </Box>
            )
          })}
        </Box>
        {/* How long the lead duck has been going, at the tab row's end, under the engine's close mark
            (the mark's own row is outside what a pane draws). */}
        {sessionStart !== undefined && (
          <Box key="uptime" flexShrink={0}>
            <Text dimColor>{`◷ ${upFor(at - sessionStart)}`}</Text>
          </Box>
        )}
      </Box>
      {core.newer !== undefined && (
        <Box key="newer" flexDirection="row" columnGap={1} flexWrap="wrap">
          <Text color="suggestion">{`↻ A newer Duckherd${core.newer.version !== undefined ? ` (${core.newer.version})` : ''} is ready`}</Text>
          <Button key="update-now" label={core.restartArmed ? 'Restart into it? Click again' : '↻ Update now'} onPress={() => void core.updateNow()} />
        </Box>
      )}
      {core.welcome !== undefined && at - core.welcome.at < WELCOME_MS && (
        <Box key="welcome" flexDirection="row" columnGap={1}>
          <Box key="welcome-text" flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">{core.welcome.text}</Text>
          </Box>
          <Button
            key="welcome-close"
            plain
            dimColor
            label="dismiss"
            onPress={() => {
              core.dismissWelcome()
              $.ui.invalidate('ui.render')
            }}
          />
        </Box>
      )}
      <Box key="tab-keys" display="none">
        {tabs.map((t, i) => (
          <Button key={`tab-key-${t.id}`} label={t.name} hotkey={String(i + 1)} onPress={() => openTab(t.id)} />
        ))}
      </Box>
    </Box>
  )

  // ---------------------------------------------------------- Agents
  const agentsBody = async () => {
    // The task, less its "(branch …)"; the branch (as the task names it, else the one the Git tab shows); and
    // the lead duck's own "now:", its latest step or waiting on the helpers it started.
    const { named, steps, title, branch, leadDoing } = await leadTop($, core)
    const chosen = await read($, selected)
    const view = helpers.find(a => a.id === chosen)
    const pick = await read($, helperModel)
    const showModels = await read($, modelsOpen)
    const usedLooks = Math.min(await read($, looks), core.quickLooks)
    const openReport = await read($, reportOpen)
    const openSteps = await read($, stepsOpen)
    const isHandedOff = await read($, handedOff)
    const lined = await read($, queue)
    // Helpers at work (or just done, still reacting) one by one, newest first; the finished
    // ones under the task they worked for: the current task's always open, under the running ones with no heading
    // of its own; an earlier task's folded under its title, opened or folded by a press; a group holding the open
    // helper stays open.
    const lastActive = (a: AgentView) => (a.status === 'running' ? Infinity : (a.endedAt ?? a.startedAt))
    const newestFirst = (list: AgentView[]) => list.map((a, i) => ({ a, i })).sort((x, y) => lastActive(y.a) - lastActive(x.a) || y.i - x.i).map(x => x.a)
    const isLive = (a: AgentView) => a.status === 'running' || (a.endedAt !== undefined && at - a.endedAt < REACT_MS)
    const live = newestFirst(helpers.filter(isLive))
    const flipped = await read($, groupsFlipped)
    const groups = [...newestFirst(helpers.filter(a => !isLive(a))).reduce((m, a) => m.set(a.task ?? 'Earlier work', [...(m.get(a.task ?? 'Earlier work') ?? []), a]), new Map<string, AgentView[]>())].map(
      ([name, list]) => ({ name, list, isHere: name === (title ?? 'Earlier work'), isOpen: name === (title ?? 'Earlier work') || flipped.includes(name) || list.some(a => a.id === chosen) }),
    )
    const shown = [...live, ...groups.flatMap(g => (g.isOpen ? g.list : []))]
    // The name column: as wide as the longest name listed, so short names leave no gap.
    const doneSteps = steps.filter(p => p.state === 'done').length
    const showDone = await read($, planDoneOpen)
    // Since when the lead duck (or any helper) has been at work, for the super duck.
    const busySince = core.leadSince ?? (helpers.some(a => a.status === 'running') ? Math.min(...helpers.filter(a => a.status === 'running').map(a => a.startedAt)) : undefined)
    // Each helper's duck: what it is doing now and how it is getting on.
    const duckOf = (a: AgentView) => {
      const isRunning = a.status === 'running'
      const lastStep = a.steps[a.steps.length - 1]
      // A helper that just finished keeps its duck a moment, to jump for joy or droop.
      const ended = a.endedAt !== undefined && !isRunning ? { ok: a.status === 'done', ms: at - a.endedAt } : undefined
      const hasDuck = isRunning || (ended !== undefined && ended.ms < REACT_MS)
      const failed = isRunning ? failedStep(a) : undefined
      const failedMs = failed?.endedAt !== undefined ? at - failed.endedAt : undefined
      const noteMs = a.told !== undefined ? at - a.told.at : undefined
      const scene: DuckScene = {
        at,
        bird: /haiku/i.test(a.model ?? '') ? 'duckling' : /opus/i.test(a.model ?? '') ? 'drake' : 'duck',
        action: lastStep !== undefined ? actionOfStep(lastStep.tool, lastStep.text) : actionOfKind(helperKind(`${a.description} ${a.why ?? ''}`)),
        seed: a.id,
        color: a.color,
        ...core.lookOf(a.color, a.letter),
        quietMs: quietOf(a, at),
        ...(noteMs !== undefined ? { noteMs } : {}),
        ...(ended !== undefined ? { ended } : {}),
        ...(failedMs !== undefined ? { failedMs } : {}),
        isAsking: isRunning && a.asking !== undefined,
        isCalm,
        isMoving: hasDuck,
        ...(/opus/i.test(a.model ?? '') ? { isOpus: true } : {}),
        ...(isRunning && core.stuckCheck(a.id)?.isEscalated === true ? { stuck: 'told' as const } : isRunning && core.stuckCheck(a.id)?.askedAt !== undefined ? { stuck: 'asked' as const } : {}),
      }

      return { scene, hasDuck, failed, failedMs }
    }

    const planDone = steps.length > 0 && steps.every(p => p.state === 'done')
    const helpersToday = helpers.filter(a => dayOf(a.startedAt) === dayOf(at)).length
    // The plan done on a branch: a PR in one press, shown before anything's pushed. The tab's one primary button.
    const openPr =
      planDone && branch !== undefined && !/^(main|master|develop|trunk)$/.test(branch) && (
        <Box key="open-pr" flexDirection="row" columnGap={2}>
          <Button
            key="open-pr-btn"
            label="Open PR"
            variant="primary"
            onPress={() =>
              void $.prompt.submit({
                text: `Open a PR for the branch ${branch}. Have a helper run the project's checks, then write the PR's title and description from this task's plan and the helpers' reports: what it does and why, plainly, and how it was tested. Show me the title and description, and wait for me to say push before you push or open anything.`,
                asUser: true,
              })
            }
          />
          <Box key="open-pr-t" flexShrink={1}>
            <Text dimColor wrap="truncate-end">runs the checks, writes it up; nothing is pushed yet</Text>
          </Box>
        </Box>
      )
    // The compact offer and what follows it, each a block of rows held together by a ▎ edge in its tone: the ctx
    // meter's while offered (amber filling, red nearly full), violet while compacting, green once compacted or handed off.
    // A fill bar draws the window: the head compacting keeps (green, or the given tint), the rest of what's used in
    // the tone (what it frees), free space dim.
    const ctxMeter = meters.find(m => m.key === 'context')
    const ctxTokens = facts.usage?.context.tokens ?? core.contextTokens
    const ctxWindow = facts.usage?.context.window ?? 0
    // The estimate: the share this session's last compaction kept, else a rough guess; always marked "~".
    const keepShare = core.compactRatio ?? COMPACT_GUESS
    const keepTokens = Math.round(ctxTokens * keepShare)
    const fillBar = (key: string, used: number, keep: number, tone: string, keepTint = 'success') => {
      if (ctxWindow <= 0) return []
      const usedCells = Math.min(FILL_CELLS, Math.round((used / ctxWindow) * FILL_CELLS))
      const keepCells = Math.min(FILL_CELLS, Math.max(1, Math.round((keep / ctxWindow) * FILL_CELLS)))

      return [
        <Text key={`${key}-keep`} color={keepTint}>{'━'.repeat(keepCells)}</Text>,
        <Text key={`${key}-free`} color={tone}>{'━'.repeat(Math.max(0, usedCells - keepCells))}</Text>,
        <Text key={`${key}-room`} dimColor>{'─'.repeat(FILL_CELLS - Math.max(usedCells, keepCells))}</Text>,
      ]
    }
    // One row of a block: the edge, its text cut short when narrow, its actions flush right.
    const blockRow = (key: string, tone: string, left: RenderChildren[], right: RenderChildren[] = []) => (
      <Box key={key} flexDirection="row" columnGap={3}>
        <Box key={`${key}-t`} flexDirection="row" flexGrow={1} flexShrink={1} overflow="hidden">
          <Text key={`${key}-edge`} color={tone}>▎ </Text>
          {left}
        </Box>
        {right}
      </Box>
    )
    // A block's headline, its words padded so the bars line up.
    const headline = (key: string, text: string, tone: string) => <Text key={key} color={tone} bold>{text.padEnd(20)}</Text>
    // An action as a key and a word: the main one with a bold violet key and a bold word, the other dim.
    const action = (key: string, label: string, letter: string, onPress: () => void, isMain: boolean) =>
      isMain ? (
        <Button key={key} plain label={label} onPress={onPress}>
          <Text color={USAGE_TINT} bold>{letter}</Text>
          <Text bold>{` ${label}`}</Text>
        </Button>
      ) : (
        <Button key={key} plain dimColor label={label} onPress={onPress}>
          <Text dimColor>{`${letter} ${label}`}</Text>
        </Button>
      )
    const close = (key: string, onPress: () => void) => (
      <Button
        key={key}
        plain
        dimColor
        label="×"
        onPress={() => {
          onPress()
          $.ui.invalidate('ui.render')
        }}
      />
    )
    // The keys on hidden buttons, as the tabs' number keys are: there only while their block shows.
    const hiddenKeys = (key: string, keys: { label: string; hotkey: string; onPress: () => void }[]) => (
      <Box key={key} display="none">
        {keys.map(k => (
          <Button key={`${key}-${k.hotkey}`} label={k.label} hotkey={k.hotkey} onPress={k.onPress} />
        ))}
      </Box>
    )
    const compactNow = () => void core.compactLead(title ?? '')
    const handOff = () => void core.writeHandoff()
    const hasHandoffNote = core.handoffNote !== undefined && !core.handoffNoteHidden
    // Offered once the plan is done and the lead duck rests, as the ctx meter turns amber (METER_LINES in band.ts);
    // not while the handoff note stands in for it.
    const isOffered =
      planDone && core.leadSince === undefined && ctxMeter !== undefined && ctxMeter.tone !== 'calm' && ctxTokens > 0 && core.compactHiddenFor !== (title ?? '') && !hasHandoffNote
    const offerTone = ctxMeter?.tone === 'error' ? 'error' : 'warning'
    // Why now, in a few words: nearly full, the cache gone cold (the next turn pays for it all), else the cost of
    // each turn and what compacting saves.
    const saving = Math.round(1 / keepShare)
    const reason =
      ctxMeter?.tone === 'error'
        ? [<Text key="why-left" color="error" bold>{`${Math.max(0, 100 - ctxMeter.pct)}% left`}</Text>, <Text key="why-t" dimColor>{' · compact before it fills mid-task'}</Text>]
        : facts.cacheLeft !== undefined && facts.cacheLeft <= 0
          ? [<Text key="why-cold" color={BAND_COLORS.cold} bold>cache cold</Text>, <Text key="why-t" dimColor>{` · next turn pays full price for ${kTokens(ctxTokens)}`}</Text>]
          : [<Text key="why-t" dimColor>{`every turn re-reads all ${kTokens(ctxTokens)}`}</Text>, ...(saving >= 2 ? [<Text key="why-sep" dimColor>{' · '}</Text>, <Text key="why-gain">{`~${saving}× less after`}</Text>] : [])]
    const compactBlock = core.isCompacting
      ? [
          blockRow('compact-busy', USAGE_TINT, [
            headline('compact-busy-h', '◐ compacting', USAGE_TINT),
            ...fillBar('compact-busy-bar', ctxTokens, keepTokens, USAGE_TINT, USAGE_TINT),
            <Text key="compact-busy-gap">{'  '}</Text>,
            <Text key="compact-busy-from" color={USAGE_TINT} bold>{kTokens(ctxTokens)}</Text>,
            <Text key="compact-busy-to" dimColor>{' → …'}</Text>,
          ]),
          blockRow('compact-busy-why', USAGE_TINT, [<Text key="compact-busy-t" dimColor>haiku is writing the summary, with the task and its plan</Text>]),
        ]
      : isOffered
        ? [
            blockRow('compact-offer', offerTone, [
              headline('compact-h', ctxMeter?.tone === 'error' ? 'context nearly full' : 'context filling', offerTone),
              ...fillBar('compact-bar', ctxTokens, keepTokens, offerTone),
              <Text key="compact-gap">{'  '}</Text>,
              <Text key="compact-from" color={offerTone} bold>{kTokens(ctxTokens)}</Text>,
              <Text key="compact-arrow" dimColor>{' → '}</Text>,
              <Text key="compact-to" color="success" bold>{`~${kTokens(keepTokens)}`}</Text>,
            ]),
            blockRow('compact-why', offerTone, reason, [
              action('compact-go', 'compact', 'c', compactNow, true),
              action('handoff-go', core.isHandingOff ? 'writing…' : 'hand off', 'h', handOff, false),
              close('compact-hide', () => core.hideCompactOffer(title ?? '')),
            ]),
            hiddenKeys('compact-keys', [
              { label: 'Compact', hotkey: 'c', onPress: compactNow },
              { label: 'Hand off', hotkey: 'h', onPress: handOff },
            ]),
          ]
        : planDone && core.leadSince === undefined && core.compacted !== undefined && core.compacted.task === (title ?? '')
          ? [
              blockRow(
                'compacted',
                'success',
                [
                  headline('compacted-h', '✓ compacted', 'success'),
                  ...(core.compacted.to !== undefined ? fillBar('compacted-bar', core.compacted.to, core.compacted.to, 'success') : []),
                  <Text key="compacted-gap">{'  '}</Text>,
                  <Text key="compacted-from" dimColor>{kTokens(core.compacted.from)}</Text>,
                  ...(core.compacted.to !== undefined
                    ? [
                        <Text key="compacted-arrow" dimColor>{' → '}</Text>,
                        <Text key="compacted-to" color="success" bold>{kTokens(core.compacted.to)}</Text>,
                        <Text key="compacted-freed" dimColor>{` · ${kTokens(Math.max(0, core.compacted.from - core.compacted.to))} freed`}</Text>,
                      ]
                    : []),
                ],
                [close('compacted-hide', () => core.hideCompacted())],
              ),
            ]
          : []
    // The handoff file once written: what a fresh chat does with it, fresh chat the one action (f).
    const freshChat = () => void core.startFresh(core.handoffNote?.name ?? 'HANDOFF.md')
    const handoffBlock =
      hasHandoffNote && core.handoffNote !== undefined
        ? [
            blockRow('handoff-done', 'success', [headline('handoff-done-h', '✓ handoff written', 'success'), <Text key="handoff-done-name">{core.handoffNote.name}</Text>]),
            blockRow('handoff-done-why', 'success', [<Text key="handoff-done-t" dimColor>a fresh chat clears this one, reads it and carries on</Text>], [action('handoff-fresh', 'fresh chat', 'f', freshChat, true), close('handoff-hide', () => core.hideHandoffNote())]),
            hiddenKeys('handoff-keys', [{ label: 'Fresh chat', hotkey: 'f', onPress: freshChat }]),
          ]
        : []
    // What goes with the context and usage, one row each: the compact offer, the handoff note, the throttle, usage.
    const usageNotes = [
      ...compactBlock,
      ...handoffBlock,
      core.throttleLine(at) !== undefined && <Text key="throttle" {...(core.throttleLevel > 0 ? { color: 'warning' } : { dimColor: true })} wrap="truncate-end">{core.throttleLine(at)}</Text>,
      ...core.throttleWarnings.map(w => (
        <Box key={`warn-${w.key}`} flexDirection="row" overflow="hidden">
          <Text dimColor>Usage </Text>
          <Text color="warning">{`${w.pct}%`}</Text>
          <Text dimColor wrap="truncate-end">{` of your ${w.label} limit${w.resetsAt !== null ? ` · resets ${whenAt(w.resetsAt, at)}` : ''}`}</Text>
        </Box>
      )),
    ].filter(x => x !== false && x !== undefined && x !== null)

    // The super duck: the lead duck's, at rest or at work, or a duck jumping for joy as the plan finishes.
    const isFinishing = core.planDoneAt !== undefined && at - core.planDoneAt < FINISH_MS
    const superView = (
      core.planDoneAt !== undefined && at - core.planDoneAt < FINISH_MS
        ? { what: 'helper', scene: { at, bird: 'duck', action: 'type', color: LEAD_COLOR, breed: 0, ...(core.activeTheme !== undefined ? { theme: helperArt(core.activeTheme, 0) } : {}), ended: { ok: true, ms: at - core.planDoneAt }, isMoving: true }, isQuiet: false }
        : { what: 'super', ...(busySince === undefined ? {} : { busyMs: at - busySince }), helpers: running, ...(core.activeTheme !== undefined && leadArt(core.activeTheme) !== undefined ? { theme: leadArt(core.activeTheme) } : {}) }
    ) as DuckView
    // The branch shows once, on the project line (✓ or ●); the subtitle names the task's branch only when it differs
    // (another worktree's, say).
    const bandBranch = facts.git?.branch ?? null
    const taskBranch = branch !== undefined && branch !== bandBranch ? branch : undefined
    // Grouped by rounded cards, stacked with no row between them, each the panel's width: inside, a border and one column of
    // padding either side.
    const inner = Math.max(16, width - 4)
    // The picture columns follow the theme's frame sizes (the ducks': 14 for the lead, 10 for a helper).
    const helperCols = helperColumns(core.activeTheme)
    const leadCols = isFinishing ? Math.max(leadColumns(core.activeTheme), helperCols) : leadColumns(core.activeTheme)
    const textCols = Math.max(8, inner - leadCols - 2)
    const isBusy = busySince !== undefined
    const blank = (key: string) => <Box key={key} height={1} />

    // 1. The lead duck's card. The super duck (in place of the Claude icon) is calm while the lead duck waits, powers
    // up when work starts, and keeps a spiky aura while it or its helpers work: gold, red with two helpers at once,
    // blue with three, blue with bits of red flame with four or more. At rest it's side-on, now and then looking at
    // you. Beside it: the task bold, idle or working on the right; what the lead duck does now (only while it works),
    // else the task's branch and quick looks (nothing when there are none); the project line; the model, its effort and the helpers'
    // model picker.
    const leadModel = facts.model === '' ? [] : [{ key: 'lead-model', text: shortModel(facts.model), color: BAND_COLORS.model } as Piece]
    if (leadModel.length > 0 && facts.effort !== undefined) {
      const style = effortStyle(facts.effort)
      leadModel.push({ key: 'lead-effort-gap', text: ' ' }, { key: 'lead-effort', text: facts.effort, ...style })
    }
    const topCard = card('top', LEAD_TINT, [
      <Box key="task" flexDirection="row" columnGap={2}>
        <Box key="super-duck" flexDirection="column" flexShrink={0} width={leadCols}>
          {duckOn('super-duck-view', superView)}
        </Box>
        <Box key="task-text" flexDirection="column" flexGrow={1} flexShrink={1}>
          <Box key="task-name" flexDirection="row">
            <Box key="task-title" flexDirection="row" flexGrow={1} flexShrink={1} overflow="hidden">
              <Text bold wrap="truncate-end">{plainText(title ?? 'No task yet')}</Text>
              {planDone && <Text color="success">{'  ✓ done'}</Text>}
            </Box>
            <Box key="task-state" flexShrink={0} marginLeft={2}>
              {isBusy ? <Text color="warning">● working</Text> : <Text dimColor>● idle</Text>}
            </Box>
          </Box>
          {named === null ? (
            <Text key="task-sub" dimColor>Type /duckherd and what you want done.</Text>
          ) : taskBranch !== undefined || !isHandedOff ? (
            // The task's branch (only when it isn't the project line's) and the quick looks left.
            <Box key="task-status" flexDirection="row" overflow="hidden">
              {taskBranch !== undefined && <Text dimColor>on </Text>}
              {taskBranch !== undefined && <Text color="suggestion" wrap="truncate-end">{plainText(taskBranch)}</Text>}
              {!isHandedOff && <Text dimColor>{`${taskBranch !== undefined ? ' · ' : ''}quick looks ${usedLooks}/${core.quickLooks}`}</Text>}
            </Box>
          ) : (
            null
          )}
          <Box key="task-project" flexDirection="row" overflow="hidden">
            {projectPieces(facts, textCols).map(textOf)}
          </Box>
          {/* The lead duck's model and effort, then which model helpers run on: always here, the one chosen; its
              arrow opens the others in its place (plain words, the chosen one bold in the accent, no background),
              and a pick folds them away. */}
          <Box key="model-pick" flexDirection="row" flexWrap="wrap">
            {leadModel.map(textOf)}
            <Text key="helpers-word" dimColor>{leadModel.length > 0 ? '  ·  helpers ' : 'helpers '}</Text>
            {showModels ? (
              <Box key="model-choices" flexDirection="row" columnGap={1} flexWrap="wrap">
                {HELPER_CHOICES.map(c => {
                  const choose = async () => {
                    await core.setHelperModel(c)
                    await update($, modelsOpen, () => false)
                  }
                  const name = c === 'auto' ? 'lead duck picks' : MODEL_NAMES[c]
                  return c === pick ? (
                    <Button key={`model-${c}`} plain onPress={() => void choose()}>
                      <Text bold color="suggestion">{name}</Text>
                    </Button>
                  ) : (
                    <Button key={`model-${c}`} plain dimColor label={name} onPress={() => void choose()} />
                  )
                })}
                <Button key="models-close" plain dimColor label="▴" onPress={() => void update($, modelsOpen, () => false)} />
              </Box>
            ) : (
              <Button key="models-toggle" plain dimColor label={`${pick === 'auto' ? 'lead duck picks' : helperLabel(pick)} ▾`} onPress={() => void update($, modelsOpen, () => true)} />
            )}
          </Box>
          {/* What the lead duck is doing now, like a helper's, last in the block; at rest the plan below shows what's next. */}
          {named !== null && core.leadSince !== undefined && (
            <Box key="task-now" flexDirection="row" overflow="hidden">
              <Text color={BAND_COLORS.now}>{'› '}</Text>
              <Text dimColor wrap="truncate-end">{leadDoing}</Text>
            </Box>
          )}
        </Box>
      </Box>,
      // The last unfinished task here, from another lead duck: one line under the duck.
      named === null && core.resumable !== undefined && !core.resumeDismissed && (
        <Box key="resume" flexDirection="row" columnGap={2} marginTop={1}>
          <Box key="resume-t" flexDirection="row" flexGrow={1} flexShrink={1} overflow="hidden">
            <Box key="resume-l" flexShrink={0}>
              <Text dimColor>{'Last task  '}</Text>
            </Box>
            <Box key="resume-n" flexShrink={1}>
              <Text wrap="truncate-end">{plainText(core.resumable.task)}</Text>
            </Box>
            <Box key="resume-c" flexShrink={0}>
              <Text dimColor>{` · ${core.resumable.steps.filter(p => p.state === 'done').length} of ${core.resumable.steps.length}`}</Text>
            </Box>
          </Box>
          <Button key="resume-go" label="Continue" variant="primary" onPress={() => void core.resume()} />
          <Button
            key="resume-no"
            plain
            label="New task"
            onPress={() => {
              core.dismissResume()
              $.ui.invalidate('ui.render')
            }}
          />
        </Box>
      ),
    ])

    // 2. Context and usage (every tab has it): this tab adds its notes.
    const usageCard = usageCardOf(usageNotes)

    // 3. The plan: its count on the right, a bar of the steps done, then each step: ✓ done, ◆ under way (bold),
    // ◇ to do; only a step that's the person's or another session's says whose it is. The done steps fold into one
    // line (a press shows them), so what's left stands out. The PR offer once it's done.
    // The heading row: "plan", the bar filling the middle, the count.
    const countText = ` ${doneSteps} of ${steps.length}`
    const barCols = Math.max(0, inner - 'plan '.length - countText.length - 1)
    const barDone = steps.length === 0 ? 0 : Math.round((doneSteps / steps.length) * barCols)
    const planCard =
      steps.length > 0 &&
      card('plan', PLAN_TINT, [
        <Box key="plan-head" flexDirection="row" overflow="hidden">
          <Text key="plan-word" bold color={PLAN_TINT}>{'plan '}</Text>
          {barDone > 0 && <Text key="plan-fill" color={PLAN_TINT}>{'━'.repeat(barDone)}</Text>}
          {barDone < barCols && <Text key="plan-rest" dimColor>{'━'.repeat(barCols - barDone)}</Text>}
          <Text key="plan-n" color={PLAN_TINT}>{` ${doneSteps}`}</Text>
          <Text key="plan-of" dimColor>{` of ${steps.length}`}</Text>
        </Box>,
        doneSteps > 1 && (
          <Box key="plan-done" flexDirection="row">
            <Button key="plan-done-toggle" plain dimColor label={`${showDone ? '▾' : '▸'} ${doneSteps} done`} onPress={() => void update($, planDoneOpen, isOpen => !isOpen)} />
          </Box>
        ),
        ...steps.map((p, i) => {
          if (doneSteps > 1 && !showDone && p.state === 'done') return null
          const isYours = p.who.trim().toLowerCase() === 'you'
          const who = p.who.startsWith('handoff:') ? `handoff to ${p.who.slice(8).trim()}` : isYours && p.state !== 'done' ? 'yours' : ''
          const row = (
            <Box key={`plan-${i}`} flexDirection="row">
              <Box key={`plan-m-${i}`} flexShrink={0} width={3}>
                {p.state === 'done' ? <Text color="success">✓</Text> : p.state === 'doing' ? <Text color={PLAN_TINT}>◆</Text> : <Text dimColor>◇</Text>}
              </Box>
              <Box key={`plan-t-${i}`} flexGrow={1} flexShrink={1}>
                {p.state === 'doing' ? <Text bold>{p.text}</Text> : <Text dimColor>{p.text}</Text>}
              </Box>
              {who !== '' && (
                <Box key={`plan-w-${i}`} flexShrink={0} marginLeft={1}>
                  {isYours ? <Text color="warning">{who}</Text> : <Text dimColor>{who}</Text>}
                </Box>
              )}
            </Box>
          )
          // Its note, dim under its text, only when it fits on one line.
          if (p.note === undefined || p.note.length > inner - 3) return row

          return (
            <Box key={`plan-s-${i}`} flexDirection="column">
              {row}
              <Text key={`plan-n-${i}`} dimColor>{`   ${p.note}`}</Text>
            </Box>
          )
        }),
        openPr !== false && (
          <Box key="plan-pr" flexDirection="column">
            {openPr}
          </Box>
        ),
      ])

    // The tasks lined up after this one, each a press from dropped.
    const queueCard =
      lined.length > 0 &&
      card('queue', 'dim', [
        cardHead('queue-head', <Text key="queue-word" dimColor>next up</Text>, <Text key="queue-n" dimColor>{`${lined.length}`}</Text>),
        ...lined.map((q, i) => (
          <Box key={`queue-${i}`} flexDirection="row" columnGap={2}>
            <Box key={`queue-t-${i}`} flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{`${i + 1}. ${q}`}</Text>
            </Box>
            <Button key={`queue-drop-${i}`} plain dimColor label="drop" onPress={() => void update($, queue, list => list.filter((_, k) => k !== i))} />
          </Box>
        )),
      ])

    // 4. The helpers: a finished helper is one line, a running one a short card with its duck; pressing a helper's
    // title opens everything about it underneath.
    const helperRow = (a: AgentView, place: number, list: AgentView[], width: number) => {
      const isOn = view?.id === a.id
      // A gap only between two cards with ducks; a finished helper's line sits right under a card.
      const after = list[place + 1]
      const nextHasDuck = after !== undefined && (after.status === 'running' || (after.endedAt !== undefined && at - after.endedAt < REACT_MS))
      if (isOn && a.status !== 'running' && a.digest === undefined && a.report) void core.digestHelper(a.id)
      if (a.status === 'running') void core.readHelperTokens(a.id, true)
      else if (a.tokens === undefined) void core.readHelperTokens(a.id)
      const isRunning = a.status === 'running'
      const model = a.model ? modelOf(a.model) : null
      const lastStep = a.steps[a.steps.length - 1]
      const { scene, failed, failedMs, ...duck } = duckOf(a)
      const { quietMs = 0, isAsking = false } = scene
      // A helper at work (or reacting) has its duck beside it; opened, its details show underneath,
      // under its text, nothing shown twice. A finished one has no duck, open or not.
      const hasDuck = duck.hasDuck
      const gutter = hasDuck ? helperCols + 1 : 0
      // Its duck dozed off: one press asks it where it is.
      const isDozing = isRunning && quietMs >= ASLEEP_MS && !isAsking
      // Every row is one grid: its name, 2 spaces, its title. A running one ends in its plain-word actions
      // (nudge too while its duck dozes, so the title never wraps); a finished one in a fixed 14-column
      // block flush right (how long it ran, 6, right-aligned; 2 spaces; its model, 6), with at least 2
      // spaces before it. A stopped one also says so, with Retry, just before that block.
      const isStopped = a.status === 'failed'
      const actionCols = 2 + 'Tell  Watch'.length + (isDozing ? 'Nudge  '.length : 0)
      const titleCols = isRunning ? width - gutter - actionCols : width - gutter - 16 - (isStopped ? STOPPED_COLS : 0)
      const title = clipText(a.description, Math.max(16, titleCols))
      const job = helperKind(`${a.description} ${a.why ?? ''}`)
      // Its status (time, model, effort, and whether it waits or has gone quiet) and what it's on.
      const status = [
        <Text key={`helper-time-${a.id}`} dimColor>{`${shortTime((a.endedAt ?? at) - a.startedAt)}${model ? ' · ' : ''}`}</Text>,
        model && <Text key={`helper-model-${a.id}`} color={model.color}>{model.name}</Text>,
        // Its effort after the model, when the panel has room.
        model && a.effort !== undefined && width - gutter >= 40 && <Text key={`helper-effort-${a.id}`} dimColor>{` ${a.effort}`}</Text>,
        // Its size so far, while it runs (a costly one shows early), or at the end, opened.
        isRunning && a.tokens !== undefined && <Text key={`helper-tok-${a.id}`} dimColor>{` · ${tokensText(a.tokens)}`}</Text>,
        // How far it is, by its steps so far.
        isRunning && a.steps.length > 0 && <Text key={`helper-steps-${a.id}`} dimColor>{` · step ${a.steps.length}`}</Text>,
        // Opened: its kind of job, from its title.
        isOn && <Text key={`helper-kind-${a.id}`} dimColor>{` · ${KIND_LABELS[job]}`}</Text>,
        // Waiting for the person's OK; or quiet so long its duck dozed off: it may be stuck.
        isAsking ? (
          <Text key={`helper-wait-${a.id}`} color="warning">{' · lead duck waiting for you'}</Text>
        ) : core.stuckCheck(a.id)?.isEscalated === true ? (
          <Text key={`helper-stuck-${a.id}`} dimColor>{' · stuck, lead duck checking'}</Text>
        ) : core.stuckCheck(a.id)?.askedAt !== undefined ? (
          <Text key={`helper-stuck-${a.id}`} dimColor>{' · may be stuck, lead duck asked it'}</Text>
        ) : (
          quietMs >= ASLEEP_MS && <Text key={`helper-quiet-${a.id}`} dimColor>{` · quiet for ${shortTime(quietMs)}`}</Text>
        ),
      ]
      const doing = !isRunning ? (
        <Text dimColor>{a.status === 'done' ? 'finished' : 'stopped'}</Text>
      ) : a.background !== undefined ? (
        <Text dimColor wrap="truncate-end">{`waiting on its background work, since ${sinceText(at - a.background)}`}</Text>
      ) : isAsking ? (
        <Text color="warning" wrap="truncate-end">{`lead duck needs your OK: ${plainText(a.asking?.text ?? '').replace(/\s+/g, ' ')}`}</Text>
      ) : failed !== undefined && failedMs !== undefined && failedMs < FLINCH_MS * 6 ? (
        <Text color="error" wrap="truncate-end">{`that failed: ${plainText(failed.text).replace(/\s+/g, ' ')}`}</Text>
      ) : a.told !== undefined && at - a.told.at < NOTE_MS * 3 ? (
        <Text color="warning" wrap="truncate-end">{`got your note: "${plainText(a.told.text).replace(/\s+/g, ' ')}"`}</Text>
      ) : (
        <Text dimColor wrap="truncate-end">{plainText(lastStep?.text ?? 'getting started').replace(/\s+/g, ' ')}</Text>
      )

      return (
        <Box
          key={`helper-${a.id}`}
          flexDirection="column"
          {...(hasDuck && nextHasDuck ? { marginBottom: 1 } : {})}
        >
          <Box key={`helper-line-${a.id}`} flexDirection="row">
          {gutter > 0 && (
            <Box key={`helper-duck-${a.id}`} flexDirection="column" flexShrink={0} width={gutter}>
              {duckOn(`helper-duck-view-${a.id}`, { what: 'helper', scene, isQuiet: scene.quietMs !== undefined && scene.quietMs > 0 } as DuckView)}
            </Box>
          )}
          <Box key={`helper-lines-${a.id}`} flexDirection="column" flexGrow={1} flexShrink={1}>
          <Box key={`helper-row-${a.id}`} flexDirection="row">
            <Box key={`helper-d-${a.id}`} flexGrow={1} flexShrink={1}>
              <Button key={`view-${a.id}`} plain dimColor label={title} onPress={() => void update($, selected, cur => (cur === a.id ? null : a.id))} />
            </Box>
            {isRunning ? (
              <Box key={`helper-a-${a.id}`} flexDirection="row" columnGap={2} flexShrink={0} marginLeft={2}>
                {isDozing && <Button key={`nudge-${a.id}`} plain dimColor label="nudge" onPress={() => void core.nudge(a)} />}
                <Button key={`tell-${a.id}`} plain dimColor label="tell" onPress={() => void $.prompt.fill({ text: `/tell ${a.letter} ` })} />
                <Button key={`watch-${a.id}`} plain dimColor label="watch" onPress={() => void core.watchHelper(a)} />
              </Box>
            ) : (
              <Box key={`helper-s-${a.id}`} flexDirection="row" flexShrink={0}>
                {/* A stopped one says so, and can go again, the lead duck told what went wrong. */}
                {isStopped && <Box key={`helper-x-${a.id}`} flexShrink={0}><Text color="error">✗</Text></Box>}
                {isStopped && <Text color="error"> stopped</Text>}
                {isStopped && <Text dimColor> · </Text>}
                {isStopped && <Button key={`retry-${a.id}`} plain label="Retry" onPress={() => core.retryHelper(a)} />}
                <Box key={`helper-t-${a.id}`} flexShrink={0} width={6} justifyContent="flex-end">
                  <Text dimColor>{shortTime((a.endedAt ?? at) - a.startedAt)}</Text>
                </Box>
                <Box key={`helper-m-${a.id}`} flexShrink={0} width={6} marginLeft={2}>
                  {model ? <Text color={model.color}>{model.name}</Text> : <Text dimColor>?</Text>}
                </Box>
              </Box>
            )}
          </Box>
          {/* Beside the 3-line duck: what it's on on the second line, after a "›", its status on the third,
              each cut short on its one line, both starting under the name. */}
          {hasDuck && (
            <Box key={`helper-now-m-${a.id}`} flexDirection="row" overflow="hidden">
              {status}
            </Box>
          )}
          {hasDuck && (
            <Box key={`helper-now-t-${a.id}`} flexDirection="row" overflow="hidden">
              <Text color={BAND_COLORS.now}>{'› '}</Text>
              {doing}
            </Box>
          )}
          </Box>
          </Box>

          {/* Opened: everything about it, indented under its text (a running one's, beside its duck; a
              finished one's title), with sentence-case dim labels and plain-word buttons. */}
          {isOn && (
            <Box key={`detail-${a.id}`} flexDirection="column" paddingLeft={hasDuck ? gutter : 0}>
              {!hasDuck && (
                <Box key={`helper-ended-${a.id}`}>
                  <Text dimColor>
                    {[
                      KIND_LABELS[job],
                      `${a.status === 'done' ? 'finished' : 'stopped'}${a.endedAt !== undefined ? ` ${sinceText(at - a.endedAt)}` : ''}`,
                      ...(a.effort !== undefined ? [`${a.effort} effort`] : []),
                      ...(a.tokens !== undefined ? [tokensText(a.tokens)] : []),
                    ].join(' · ')}
                  </Text>
                </Box>
              )}
              {model && a.why !== undefined && (
                <Box key={`why-${a.id}`} flexDirection="row">
                  <Box key={`why-l-${a.id}`} flexShrink={0} flexDirection="row">
                    <Text dimColor>Why </Text>
                    <Text color={model.color}>{model.name}</Text>
                    <Text dimColor>{': '}</Text>
                  </Box>
                  <Box key={`why-t-${a.id}`} flexShrink={1}>
                    <Text>{plainText(a.why)}</Text>
                  </Box>
                </Box>
              )}

              {a.status !== 'running' && (
                <Box key={`short-${a.id}`} flexDirection="column">
                  <Text dimColor>In short</Text>
                  <Text>{plainText(a.digest?.summary ?? a.result ?? 'It finished without a report.')}</Text>
                  {a.digest === undefined && core.isDigesting(a.id) && <Text dimColor>Making the report easy to read…</Text>}
                  {a.testsSeen === 'passed' && (
                    <Box key={`tests-${a.id}`} flexDirection="row">
                      <Text color="success">✓ </Text>
                      <Text>Its tests were seen passing</Text>
                    </Box>
                  )}
                  {(a.files ?? []).length > 0 && (
                    <Box key={`files-${a.id}`} flexDirection="row" flexWrap="wrap">
                      <Text dimColor>{'Changed  '}</Text>
                      {(a.files ?? []).slice(0, 4).map((f, i) => (
                        <Box key={`file-${a.id}-${i}`} flexDirection="row" flexShrink={0}>
                          <Text>{`${plainText(f.path).replace(`${core.root}/`, '')} `}</Text>
                          {f.added > 0 && <Text color="success">{`+${f.added}`}</Text>}
                          {f.removed > 0 && <Text color="error">{` −${f.removed}`}</Text>}
                          {i < Math.min(4, (a.files ?? []).length) - 1 && <Text dimColor>{' · '}</Text>}
                        </Box>
                      ))}
                      {(a.files ?? []).length > 4 && <Text dimColor>{` · ${(a.files ?? []).length - 4} more`}</Text>}
                    </Box>
                  )}
                  {a.claimDoubt !== undefined && <Text dimColor>{`⚠ It ${plainText(a.claimDoubt)} · the lead duck knows`}</Text>}
                </Box>
              )}

              {a.digest !== undefined && a.digest.checks.length > 0 && (
                <Box key={`checks-${a.id}`} flexDirection="column">
                  <Text dimColor>What it checked</Text>
                  <Box key={`checks-flow-${a.id}`} flexDirection="row" flexWrap="wrap" columnGap={3}>
                    {a.digest.checks.map((c, i) => (
                      <Box key={`check-${a.id}-${i}`} flexDirection="row" columnGap={1} flexShrink={0}>
                        {c.result === 'pass' ? <Text color="success">✓</Text> : c.result === 'fail' ? <Text color="error">✗</Text> : <Text dimColor>·</Text>}
                        <Text>{plainText(c.what)}</Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {a.digest !== undefined && a.digest.findings.length > 0 && (
                <Box key={`found-${a.id}`} flexDirection="column">
                  <Text dimColor>What it found · most serious first</Text>
                  {a.digest.findings.map((f, i) => (
                    <Box key={`find-${a.id}-${i}`} flexDirection="row" columnGap={1}>
                      <Box key={`find-l-${a.id}-${i}`} width={10} flexShrink={0}>
                        <Text color={LEVEL_LABELS[f.level].color}>{LEVEL_LABELS[f.level].label}</Text>
                      </Box>
                      <Box key={`find-t-${a.id}-${i}`} flexDirection="column" flexGrow={1} flexShrink={1}>
                        <Text>{plainText(f.text)}</Text>
                        {f.where !== undefined && <Text dimColor>{plainText(f.where)}</Text>}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {a.digest?.next !== undefined && (
                <Box key={`next-${a.id}`} flexDirection="column">
                  <Text dimColor>Suggested next step</Text>
                  <Text>{plainText(a.digest.next)}</Text>
                </Box>
              )}

              {(a.status !== 'running' || a.report) && (
              <Box key={`more-${a.id}`} flexDirection="row" columnGap={2} flexWrap="wrap">
                {a.status === 'failed' && <Button key={`retry-card-${a.id}`} plain label="Retry" onPress={() => core.retryHelper(a)} />}
                {a.status !== 'running' && <Button key={`watch-${a.id}`} plain label="Watch it back" onPress={() => void core.watchHelper(a)} />}
                {a.status !== 'running' && (
                  <Button key={`ask-${a.id}`} plain label="Ask about it" onPress={() => void $.prompt.fill({ text: `About helper ${a.letter} (${a.description}): ` })} />
                )}
                {a.report && (
                  <Button
                    key={`report-btn-${a.id}`}
                    plain
                    label={openReport === a.id ? 'Hide the full report' : 'Full report'}
                    onPress={() => void update($, reportOpen, cur => (cur === a.id ? null : a.id))}
                  />
                )}
                {a.status !== 'running' && a.steps.length > 0 && (
                  <Button
                    key={`steps-btn-${a.id}`}
                    plain
                    label={openSteps === a.id ? 'Hide the steps' : `Steps (${a.steps.length})`}
                    onPress={() => void update($, stepsOpen, cur => (cur === a.id ? null : a.id))}
                  />
                )}
              </Box>
              )}

              {a.report && openReport === a.id && (
                <Box key={`report-box-${a.id}`} flexDirection="column" marginTop={1}>
                  <Text dimColor>Full report, as the helper wrote it</Text>
                  <ui.Markdown key={`report-${a.id}`} text={a.report} />
                </Box>
              )}

              {(a.status === 'running' || openSteps === a.id) && (
                <Box key={`steps-box-${a.id}`} flexDirection="column">
                  <Text dimColor>{`Steps · ${a.steps.length}${a.status === 'running' && a.steps.length > 8 ? ' · latest 8' : ''}`}</Text>
                  {a.steps.length === 0 && <Text dimColor>No steps yet.</Text>}
                  {(a.status === 'running' ? a.steps.slice(-8) : a.steps).map(st => (
                    <Box key={`step-${a.id}-${st.id}`} flexDirection="row" columnGap={2}>
                      <Box key={`step-c-${a.id}-${st.id}`} flexShrink={0}>
                        <Text dimColor>{clock(st.at - a.startedAt).padStart(5)}</Text>
                      </Box>
                      <Box key={`step-m-${a.id}-${st.id}`} flexShrink={0}>
                        {st.state === 'done' ? <Text color="success">✓</Text> : st.state === 'running' ? <Text color="warning">●</Text> : st.state === 'refused' ? <Text dimColor>⊘</Text> : <Text color="error">✗</Text>}
                      </Box>
                      <Box key={`step-t-${a.id}-${st.id}`} flexGrow={1} flexShrink={1}>
                        <Text wrap="truncate-end" dimColor={st.state === 'refused'}>{st.state === 'refused' ? `${st.text} · not allowed` : st.text}</Text>
                      </Box>
                      <Box key={`step-k-${a.id}-${st.id}`} flexShrink={0}>
                        <Text dimColor>{st.tool}</Text>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
              {a.status === 'running' && (
                <Box key={`actions-${a.id}`} flexDirection="row" columnGap={2}>
                  <Button
                    key={`stop-${a.id}`}
                    plain
                    label="Stop helper"
                    onPress={async () => {
                      const ran = await $.tool.call({ tool: 'TaskStop', task_id: a.id }).catch(() => undefined)
                      if (ran !== undefined && ran.deny === undefined && ran.isError !== true) {
                        core.toast(`Stopped helper ${a.letter}`)
                        return
                      }
                      core.relay(`Stop helper ${a.letter} now with TaskStop (task_id: "${a.id}"), then tell me briefly what it had done.`, { asPerson: true })
                      core.toast(`The lead duck is stopping helper ${a.letter}`)
                    }}
                  />
                  {/* Tell and Watch are on its row, just above. */}
                </Box>
              )}
            </Box>
          )}
        </Box>
      )
    }
    const helperList = [
      ...live.map((a, i) => helperRow(a, i, live, inner)),
      ...groups.map((g, k) => {
        // A blank row before it only after the live helpers or the current task's rows; earlier tasks sit on
        // consecutive rows.
        const gap = k === 0 ? (live.length > 0 ? { marginTop: 1 } : {}) : groups[k - 1]?.isHere ? { marginTop: 1 } : {}
        // The current task's: its rows, no heading.
        if (g.isHere) {
          return (
            <Box key={`group-${k}`} flexDirection="column" {...gap}>
              <Box key={`group-b-${k}`} flexDirection="column">
                {g.list.map((a, i) => helperRow(a, i, g.list, inner))}
              </Box>
            </Box>
          )
        }
        const failed = g.list.filter(a => a.status === 'failed').length
        const latestEnd = Math.max(...g.list.map(a => a.endedAt ?? a.startedAt))
        // An earlier task's: its fold arrow first, its title bold; on the right, dim, the one "ago". Folded, it
        // also counts its helpers and any stopped, as its rows aren't showing.
        const stoppedText = !g.isOpen && failed > 0 ? `${failed} stopped` : ''
        const restText = `${g.isOpen ? '' : `${g.list.length} helper${g.list.length === 1 ? '' : 's'} · `}${sinceText(at - latestEnd)}`
        const rightCols = (stoppedText === '' ? 0 : stoppedText.length + 3) + restText.length

        return (
          <Box key={`group-${k}`} flexDirection="column" {...gap}>
            <Box key={`group-h-${k}`} flexDirection="row">
              <Box key={`group-t-${k}`} flexGrow={1} flexShrink={1}>
                <Button
                  key={`group-toggle-${k}`}
                  plain
                  onPress={() => void update($, groupsFlipped, list => (list.includes(g.name) ? list.filter(x => x !== g.name) : [...list, g.name]))}
                >
                  <Text bold>{g.isOpen ? '▾ ' : '▸ '}</Text>
                  <Text bold>{clipText(g.name, Math.max(16, inner - 2 - 2 - rightCols))}</Text>
                </Button>
              </Box>
              <Box key={`group-r-${k}`} flexDirection="row" flexShrink={0} marginLeft={2}>
                {stoppedText !== '' && <Text color="error">{stoppedText}</Text>}
                {stoppedText !== '' && <Text dimColor> · </Text>}
                <Text dimColor>{restText}</Text>
              </Box>
            </Box>
            {g.isOpen && (
              <Box key={`group-b-${k}`} flexDirection="column">
                {g.list.map((a, i) => helperRow(a, i, g.list, inner))}
              </Box>
            )}
          </Box>
        )
      }),
    ]
    // Its heading pink once there are helpers: how many run and how many started today on the right.
    const hasHelpers = helpers.length > 0
    const helpersCard = card('helpers', hasHelpers ? HELPERS_TINT : 'dim', [
      // J and k move down and up the helpers, the one moved to opening (keys a mod can take are letters and
      // digits only, not the arrows).
      <Box key="helper-keys" display="none">
        <Button key="helper-next" label="Next helper" hotkey="j" onPress={() => void update($, selected, cur => shown[Math.min(shown.length - 1, shown.findIndex(a => a.id === cur) + 1)]?.id ?? cur)} />
        <Button
          key="helper-prev"
          label="Previous helper"
          hotkey="k"
          onPress={() => void update($, selected, cur => (shown.findIndex(a => a.id === cur) <= 0 ? (shown[0]?.id ?? cur) : (shown[shown.findIndex(a => a.id === cur) - 1]?.id ?? cur)))}
        />
      </Box>,
      cardHead(
        'helpers-h',
        hasHelpers ? <Text key="helpers-word" bold color={HELPERS_TINT}>helpers</Text> : <Text key="helpers-word" dimColor>helpers</Text>,
        [running > 0 && <Text key="helpers-running" color={HELPERS_TINT}>{`${running}`}</Text>, <Text key="helpers-today" dimColor>{`${running > 0 ? ' running · ' : ''}${helpersToday} today`}</Text>],
      ),
      // Two helpers on one file: said here, the lead duck sorting it out.
      ...core.clashes.map((c, i) => <Text key={`clash-${i}`} dimColor>{`${c} · the lead duck sorts it out`}</Text>),
      core.clashes.length > 0 && blank('clash-gap'),
      helpers.length === 0 && (
        // A duck asleep beside it, rather than a bare line.
        <Box key="helpers-empty" flexDirection="row" columnGap={1}>
          <Box key="helpers-empty-duck" flexShrink={0} width={helperCols}>
            {duckOn('helpers-empty-view', { what: 'helper', scene: { at, bird: 'duck', action: 'type', color: HELPER_COLORS[0], breed: 0, ...(core.activeTheme !== undefined ? { theme: helperArt(core.activeTheme, 0) } : {}), quietMs: ASLEEP_MS, isMoving: true }, isQuiet: true } as DuckView)}
          </Box>
          <Box key="helpers-empty-text" flexDirection="column" flexShrink={1}>
            <Text dimColor>None yet. The lead duck starts them when there's work to hand out.</Text>
          </Box>
        </Box>
      ),
      ...helperList,
    ])

    return (
      <Box key="agents" flexDirection="column" rowGap={0}>
        {[usageCard, topCard, planCard, queueCard, helpersCard].filter(Boolean)}
      </Box>
    )
  }

  // ---------------------------------------------------------- Sessions
  const sessionsBody = async () => {
    const list = await read($, peers)
    const chosen = await read($, selectedHandoff)
    // The handoff opened: the one pressed, else the newest still to send. '' is all folded, by a press.
    const open = chosen === '' ? undefined : (drafts.find(h => h.id === chosen) ?? drafts.find(h => h.state === 'draft'))
    const telling = await read($, tellingSession)
    const removing = await read($, confirmRemove)
    const finished = list.filter(p => p.isDone === true && p.ref !== undefined)
    const mem = await read($, memory)
    const isOthersOpen = await read($, othersOpen)
    const asking = await read($, stopAsk)
    const shownActs = await read($, sessionOpen)
    // A terminal session's tab is found through cmux; elsewhere there is nothing to go to.
    const canGoTo = await core.cmuxCommand().then(c => c !== undefined, () => false)
    const root = core.root
    // Each session once: what needs the person here, the rest of this project, and other projects
    // folded; biggest first in each.
    const all = mem?.sessions ?? []
    const here = (m: MemSession) => m.cwd !== undefined && within(m.cwd, root)
    const groups = [
      { id: 'needs', name: 'needs you', rows: all.filter(m => here(m) && m.isWaiting) },
      { id: 'here', name: 'this project', rows: all.filter(m => here(m) && !m.isWaiting) },
      { id: 'others', name: 'other projects', rows: all.filter(m => !here(m)) },
    ].filter(g => g.rows.length > 0)
    // No sizes on a system Duckherd can't read them on: the rows say so rather than 0 MB.
    const hasSizes = mem?.note === undefined
    const isAlone = mem !== null && all.every(m => m.sessionId === core.ownSessionId)
    const asPeer = (m: MemSession): Peer => ({
      name: m.name,
      kind: m.kind,
      isWaiting: m.isWaiting,
      detail: '',
      ...(m.pid !== undefined ? { pid: m.pid } : {}),
      ...(m.ref !== undefined ? { ref: m.ref } : {}),
      ...(m.sessionId !== undefined ? { sessionId: m.sessionId } : {}),
      ...(m.cwd !== undefined ? { cwd: m.cwd } : {}),
    })
    // A destructive yes, inline on one line: the question, then "Yes, …" in the error colour and Keep it.
    const confirmRow = (key: string, text: string, yes: string, onYes: () => void, keys: { yes: string; no: string }) => (
      <Box key={key} flexDirection="row" columnGap={2} paddingLeft={2}>
        <Box key={`${key}-t`} flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{text}</Text>
        </Box>
        <Button key={keys.yes} plain onPress={onYes}>
          <Text color="error">{yes}</Text>
        </Button>
        <Button key={keys.no} plain label="Keep it" onPress={() => void update($, stopAsk, () => null)} />
      </Box>
    )
    // One grid for sessions and leftovers: the dot, a 32-column name, the size (7) and when (8), right-aligned,
    // then the plain-word actions flush right, so Close is always last.
    const gridRow = (key: string, dot: { color?: string }, name: { text: string; bold?: boolean; dim?: boolean; detail?: string }, size: { text: string; color?: string }, when: { text: string; color?: string }, actions: unknown[]) => (
      <Box key={`${key}-r`} flexDirection="row">
        <Box key={`${key}-m`} flexShrink={0} width={2}>
          {dot.color !== undefined ? <Text color={dot.color}>●</Text> : <Text dimColor>●</Text>}
        </Box>
        <Box key={`${key}-t`} flexDirection="row" flexShrink={1} width={32} overflow="hidden">
          <Text wrap="truncate-end" bold={name.bold === true} dimColor={name.dim === true}>{name.text}</Text>
          {name.detail !== undefined && <Text dimColor wrap="truncate-end">{` · ${name.detail}`}</Text>}
        </Box>
        <Box key={`${key}-mb`} width={7} flexShrink={0} justifyContent="flex-end">
          {size.color !== undefined ? <Text color={size.color}>{size.text}</Text> : <Text dimColor>{size.text}</Text>}
        </Box>
        <Box key={`${key}-u`} width={9} flexShrink={0} justifyContent="flex-end">
          {when.color !== undefined ? <Text color={when.color}>{when.text}</Text> : <Text dimColor>{when.text}</Text>}
        </Box>
        <Box key={`${key}-b`} flexGrow={1} flexShrink={0} flexDirection="row" columnGap={2} justifyContent="flex-end" marginLeft={2}>
          {actions.filter(x => x !== false && x !== undefined && x !== null) as never}
        </Box>
      </Box>
    )
    // One line a session: its dot, name, memory and when last used, then one plain Open (and Tell, on one that
    // needs you). Open puts its actions on a line under it: Go to, and Close. Close works on any but this one: a
    // terminal one quits and its tab closes; a running background one stops (claude attach brings it back); one
    // that isn't running is removed for good.
    const sessionRow = (m: MemSession) => {
      const id = m.ref ?? m.sessionId ?? String(m.pid ?? m.name)
      const isOwn = m.sessionId === core.ownSessionId
      const quiet = m.lastActive !== undefined ? at - m.lastActive : undefined
      const isStale = quiet !== undefined && quiet > 3 * 3600000 && !m.isWorking && !m.isWaiting
      const used = quiet === undefined ? '' : quiet < 120000 ? 'now' : sinceText(quiet)
      const isAsking = asking === id
      const closing = isOwn ? undefined : m.kind === 'terminal' ? (m.pid !== undefined ? 'quit' : undefined) : m.ref === undefined ? undefined : m.pid !== undefined ? 'stop' : 'remove'
      const isIdle = isStale || m.state === 'done' || m.pid === undefined
      const name = plainText(m.name)
      // Go to: a background one in a new tab; a terminal one's tab, found through cmux only.
      const canOpen = !isOwn && (m.kind !== 'terminal' || canGoTo)
      const isOpen = shownActs === id && !isAsking

      return (
        <Box key={`peer-${id}`} flexDirection="column">
          {gridRow(
            `peer-${id}`,
            // Every session has its dot: waiting in the warning colour, working in success, the rest dim.
            m.isWaiting ? { color: 'warning' } : m.isWorking ? { color: 'success' } : {},
            { text: name, bold: m.isWaiting, dim: m.state === 'done' || m.pid === undefined },
            { text: m.pid === undefined ? 'off' : hasSizes ? sizeText(m.mb) : '–', ...(m.pid !== undefined && hasSizes && m.mb >= 1500 ? { color: 'error' } : m.pid !== undefined && hasSizes && m.mb >= 600 ? { color: 'warning' } : {}) },
            { text: used, ...(isStale ? { color: 'warning' } : {}) },
            isOwn
              ? [<Text key={`peer-own-${id}`} dimColor>this one</Text>]
              : isAsking
                ? []
                : [
                    (canOpen || closing !== undefined) && <Button key={`peer-open-${id}`} plain label="Open" {...(m.isWaiting ? {} : { dimColor: true })} onPress={() => void update($, sessionOpen, cur => (cur === id ? null : id))} />,
                    m.isWaiting && 'Input' in ui && <Button key={`peer-tell-${id}`} plain label="Tell" onPress={() => void update($, tellingSession, cur => (cur === id ? null : id))} />,
                  ],
          )}
          {isOpen && (
            <Box key={`peer-acts-${id}`} flexDirection="row" columnGap={2} paddingLeft={2}>
              {canOpen && <Button key={`peer-go-${id}`} plain label="Go to" onPress={() => void core.openSession(asPeer(m))} />}
              {closing !== undefined && <Button key={`mem-close-${id}`} plain label="Close" {...(isIdle ? {} : { dimColor: true })} onPress={() => void update($, stopAsk, () => id)} />}
            </Box>
          )}
          {/* What the person last asked a session that now waits on them, quoted. */}
          {m.isWaiting && m.lastAsk !== undefined && (
            <Box key={`peer-ask-${id}`} paddingLeft={2}>
              <Text dimColor wrap="truncate-end">{`"${plainText(m.lastAsk)}"`}</Text>
            </Box>
          )}
          {isAsking &&
            closing !== undefined &&
            confirmRow(
              `mem-ask-${id}`,
              closing === 'remove'
                ? `Remove ${name}? It isn't running; this deletes it and its worktree for good.`
                : closing === 'quit'
                  ? `Close ${name}?${m.isWorking ? ' It is working right now.' : ''} It frees ${sizeText(m.mb)} and closes its tab; claude --resume in its folder brings it back.`
                  : `Close ${name}?${m.isWorking ? ' It is working right now.' : ''} It stops and frees ${sizeText(m.mb)}; claude attach brings it back.`,
              closing === 'remove' ? 'Yes, remove' : 'Yes, close',
              () => void (closing === 'quit' ? core.closeSession(m) : closing === 'stop' ? core.stopSession(m) : core.removeSession(m)),
              { yes: `mem-close-yes-${id}`, no: `mem-close-no-${id}` },
            )}
          {/* A text box where the surface has one (not every surface does). */}
          {telling === id && 'Input' in ui && (
            <Box key={`peer-tell-box-${id}`} flexDirection="row" columnGap={2} paddingLeft={2}>
              <Box key={`peer-tell-in-${id}`} flexGrow={1}>
                <ui.Input key={`peer-tell-input-${id}`} placeholder={`A message for ${name}; Enter sends it`} autoFocus onSubmit={(text: string) => void core.tellPeer(asPeer(m), text)} />
              </Box>
              <Button key={`peer-tell-cancel-${id}`} plain dimColor label="Cancel" onPress={() => void update($, tellingSession, () => null)} />
            </Box>
          )}
        </Box>
      )
    }
    const leftovers = mem?.leftovers ?? []
    // One card a group: what needs you here (the warning colour), the rest of this project, and other projects
    // folded; its word on the left, what it holds flush right.
    const groupCard = (g: (typeof groups)[number]) => {
      const isOthers = g.id === 'others'
      const isFolded = isOthers && !isOthersOpen
      const waiting = isOthers ? g.rows.filter(m => m.isWaiting).length : 0
      const held = g.rows.reduce((sum, m) => sum + m.mb, 0)
      const right = [
        waiting > 0 && <Text key={`peers-w-${g.id}`} color="warning">{`${waiting} need${waiting === 1 ? 's' : ''} you`}</Text>,
        g.id !== 'needs' && held > 0 && hasSizes && <Text key={`peers-mb-${g.id}`} dimColor>{`${waiting > 0 ? ' · ' : ''}${sizeText(held)}`}</Text>,
      ].filter(Boolean)

      return card(`peers-${g.id}`, g.id === 'needs' ? 'warning' : 'dim', [
        cardHead(
          `peers-h-${g.id}`,
          isOthers ? (
            <Button key="peers-others" plain dimColor label={`${isFolded ? '▸' : '▾'} ${g.name} · ${g.rows.length}`} onPress={() => void update($, othersOpen, open => !open)} />
          ) : g.id === 'needs' ? (
            <Text key={`peers-n-${g.id}`} bold color="warning">{g.name}</Text>
          ) : (
            <Text key={`peers-n-${g.id}`} dimColor>{g.name}</Text>
          ),
          right.length > 0 ? right : undefined,
        ),
        ...(isFolded ? [] : g.rows.map(sessionRow)),
        g.id === 'here' && isAlone && <Text key="peers-alone" dimColor>No other sessions. Ones you start elsewhere show here.</Text>,
      ])
    }

    return (
      <Box key="sessions" flexDirection="column" rowGap={0}>
        {/* Only when the Mac is short of memory (macOS's own pressure, not swap, which stays high long after),
            that; and while they're read, or when some can't be, a dim line. */}
        {mem?.pressure !== undefined && mem.pressure >= 2 && (
          <Box key="sessions-pressure" paddingLeft={2}>
            <Text color="error" wrap="truncate-end">Your Mac is short of memory</Text>
          </Box>
        )}
        {mem === null && (
          <Box key="sessions-reading" paddingLeft={2}>
            <Text dimColor>Reading your sessions…</Text>
          </Box>
        )}
        {mem?.error !== undefined && (
          <Box key="sessions-error" paddingLeft={2}>
            <Text dimColor>{`Couldn't read them all: ${clipText(mem.error, 80)}`}</Text>
          </Box>
        )}
        {mem?.note !== undefined && (
          <Box key="sessions-note" paddingLeft={2}>
            <Text dimColor>{plainText(mem.note)}</Text>
          </Box>
        )}

        {/* Handoffs only when there are some, each a fold group: its text indented under it, then Send; a sent
            one can be removed. */}
        {drafts.length > 0 &&
          card('handoffs', 'dim', [
            cardHead('handoffs-h', <Text key="handoffs-word" dimColor>handoffs</Text>, <Text key="handoffs-n" dimColor>{toSend > 0 ? `${toSend} to send` : `${drafts.length}`}</Text>),
            ...drafts.slice(0, 6).map(ho => {
              const isOpen = ho.id === open?.id
              const sentTo = ho.state === 'sent' ? list.find(p => p.name === ho.to) : undefined

              return (
                <Box key={`ho-${ho.id}`} flexDirection="column">
                  <Box key={`ho-h-${ho.id}`} flexDirection="row" columnGap={2}>
                    <Box key={`ho-t-${ho.id}`} flexGrow={1} flexShrink={1}>
                      <Button key={`ho-open-${ho.id}`} plain onPress={() => void update($, selectedHandoff, cur => (cur === ho.id || (cur === null && isOpen) ? '' : ho.id))}>
                        <Text bold>{isOpen ? '▾ ' : '▸ '}</Text>
                        <Text bold>{plainText(ho.to)}</Text>
                      </Button>
                    </Box>
                    <Box key={`ho-s-${ho.id}`} flexShrink={0}>
                      {ho.state === 'draft' ? (
                        <Text dimColor>ready to send</Text>
                      ) : (
                        <Text dimColor>{`sent ${sinceText(at - (ho.sentAt ?? at))} · ${ho.reply ? 'replied' : 'no reply'}`}</Text>
                      )}
                    </Box>
                  </Box>
                  {isOpen && (
                    <Box key={`ho-b-${ho.id}`} flexDirection="column" paddingLeft={2}>
                      {ho.why && <Text dimColor>{plainText(ho.why)}</Text>}
                      <Text>{stripControl(ho.text)}</Text>
                      {ho.state === 'draft' && (
                        <Box key="handoff-actions" flexDirection="row" columnGap={2}>
                          <Button key="ho-send" plain label="Send" onPress={() => void core.sendHandoff(ho.id)} />
                          <Button key="ho-change" plain label="Change" onPress={() => void $.prompt.fill({ text: `Change the handoff for ${ho.to}: ` })} />
                          <Button key="ho-copy" plain label="Copy" onPress={() => void $.ui.copy({ text: ho.text })} />
                          <Button key="ho-discard" plain label="Discard" onPress={() => void update($, handoffs, all => all.map(x => (x.id === ho.id ? { ...x, state: 'discarded' as const } : x)))} />
                          {ho.error && (
                            <Box key="ho-note" flexGrow={1} flexShrink={1} justifyContent="flex-end">
                              <Text color="error" wrap="truncate-end">{`Last try failed: ${ho.error}`}</Text>
                            </Box>
                          )}
                        </Box>
                      )}
                      {ho.reply && (
                        <Box key="handoff-reply" flexDirection="column">
                          <Text dimColor>Its reply</Text>
                          <Text>{stripControl(ho.reply)}</Text>
                        </Box>
                      )}
                      {ho.state === 'sent' && (
                        <Box key="handoff-sent" flexDirection="row" columnGap={2}>
                          {sentTo !== undefined && <Button key="ho-watch" plain label="Open that session" onPress={() => void core.openSession(sentTo)} />}
                          <Button key="ho-remove" plain label="Remove" onPress={() => void update($, handoffs, all => all.map(x => (x.id === ho.id ? { ...x, state: 'discarded' as const } : x)))} />
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              )
            }),
          ])}

        {groups.map(groupCard)}
        {isAlone && !groups.some(g => g.id === 'here') && (
          <Box key="peers-alone-line" paddingLeft={2}>
            <Text dimColor>No other sessions. Ones you start elsewhere show here.</Text>
          </Box>
        )}

        {/* What runs outside every session: booted simulators, and dev servers and test browsers whose
            session is gone. One line each, on the sessions' grid; a yes before it stops. */}
        {leftovers.length > 0 &&
          card('leftovers', 'dim', [
            cardHead('leftovers-h', <Text key="leftovers-word" dimColor>leftovers</Text>, <Text key="leftovers-n" dimColor>{`${leftovers.length} · ${sizeText(leftovers.reduce((sum, l) => sum + l.mb, 0))}`}</Text>),
            ...leftovers.map(l => {
              const key = `left-${l.id}`
              const isAsking = asking === key
              // How long it has run, in its biggest unit (a simulator's "last used" is when it booted, so
              // it can't tell whether one is in use: one with nothing running in it is the idle one).
              const when = l.upMs === undefined ? '' : l.upMs < 3600000 ? `up ${Math.max(1, Math.round(l.upMs / 60000))}m` : l.upMs < 86400000 ? `up ${Math.floor(l.upMs / 3600000)}h` : `up ${Math.floor(l.upMs / 86400000)}d`
              const isIdle = l.kind === 'simulator' ? l.detail === 'no app running' : !l.isInUse && (l.upMs ?? 0) > 3600000

              return (
                <Box key={key} flexDirection="column">
                  {gridRow(
                    key,
                    l.isInUse ? { color: 'success' } : isIdle ? { color: 'warning' } : {},
                    { text: plainText(l.name), ...(l.detail !== undefined ? { detail: plainText(l.isInUse ? `${l.detail}, in use` : l.detail) } : {}) },
                    { text: sizeText(l.mb), ...(l.mb >= 1500 ? { color: 'error' } : l.mb >= 600 ? { color: 'warning' } : {}) },
                    { text: when, ...(isIdle ? { color: 'warning' } : {}) },
                    isAsking ? [] : [<Button key={`${key}-stop`} plain label="Stop" {...(isIdle ? {} : { dimColor: true })} onPress={() => void update($, stopAsk, () => key)} />],
                  )}
                  {isAsking &&
                    confirmRow(
                      `${key}-ask`,
                      l.kind === 'simulator'
                        ? `Shut down the ${l.name}? ${l.detail === 'no app running' ? 'Nothing runs in it.' : `${l.detail} in it.`} It frees ${sizeText(l.mb)}.`
                        : `Stop the ${l.name}${l.detail !== undefined ? ` in ${l.detail}` : ''}?${l.isInUse ? ' Something is connected to it right now.' : ''} It frees ${sizeText(l.mb)}.`,
                      l.kind === 'simulator' ? 'Yes, shut down' : 'Yes, stop',
                      () => void core.stopLeftover(l),
                      { yes: `${key}-yes`, no: `${key}-no` },
                    )}
                </Box>
              )
            }),
          ])}
        {finished.length > 0 && removing && (
          <Box key="peers-clean-ask" flexDirection="row" columnGap={2} paddingLeft={2}>
            <Box key="peers-clean-ask-t" flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{`Delete ${finished.length === 1 ? 'this finished session' : `these ${finished.length} finished sessions`} for good? ${finished.map(p => plainText(p.name)).join(', ')}`}</Text>
            </Box>
            <Button key="peers-clean-yes" plain onPress={() => void core.removeFinished()}>
              <Text color="error">Yes, delete</Text>
            </Button>
            <Button key="peers-clean-no" plain label="Keep them" onPress={() => void update($, confirmRemove, () => false)} />
          </Box>
        )}
        {/* The footer: when they were read, and the tab's secondary links. */}
        {footer('sessions-foot', [
          mem !== null && <Text key="sessions-checked" dimColor>{`Checked ${checkedText(at - mem.at)}`}</Text>,
          <Button
            key="sessions-refresh"
            plain
            dimColor
            label="Refresh"
            onPress={() => {
              core.forgetListing()
              void core.refreshPeers()
              void core.refreshMemory()
            }}
          />,
          finished.length > 0 && !removing && <Button key="peers-clean" plain dimColor label={`Remove ${finished.length} finished`} onPress={() => void update($, confirmRemove, () => true)} />,
        ])}
      </Box>
    )
  }

  // ---------------------------------------------------------- Changes
  // Two cards, stacked: the worktrees, one line each, then what changed as a tree of folders with a dot per file
  // type, each name in the colour of what happened to it.
  const changesBody = async () => {
    const view = await read($, changes)
    // The changes card's heading: its word, and what it holds flush right.
    const changesHead = (right?: RenderChildren) => cardHead('ch-h', <Text key="ch-word" dimColor>changes</Text>, right)
    if (view === null) {
      void core.refreshChanges(true)

      return (
        <Box key="changes" flexDirection="column" rowGap={0}>
          {card('ch-changes', 'dim', [changesHead(), <Text key="ch-reading" dimColor>Reading git…</Text>])}
        </Box>
      )
    }
    const closed = new Set(await read($, changesClosed))
    const open = await read($, changeOpen)
    const diff = await read($, changeDiff)
    const showClean = await read($, checkoutsOpen)
    const tilde = (path: string) => (core.home !== '' && path.startsWith(core.home) ? `~${path.slice(core.home.length)}` : path)
    const main = view.checkouts[0]?.path ?? view.root
    const groups = (
      [
        { id: 'merge', name: 'Conflicts' },
        { id: 'staged', name: 'Staged' },
        { id: 'changes', name: 'Not staged' },
      ] as const
    )
      .map(g => ({ ...g, files: view.files.filter(f => f.group === g.id) }))
      .filter(g => g.files.length > 0)
    const sum = (files: FileChange[], pick: (f: FileChange) => number | undefined) => files.reduce((n, f) => n + (pick(f) ?? 0), 0)
    // Lines added and taken out, flush right.
    const counts = (added: number, removed: number, key: string) => (
      <Box key={key} flexDirection="row" flexShrink={0} columnGap={1}>
        {added > 0 && <Text color="success">{`+${added}`}</Text>}
        {removed > 0 && <Text color="error">{`−${removed}`}</Text>}
      </Box>
    )
    // How it stands against its upstream, in words: "152 behind develop", "3 ahead of main, 2 behind".
    const upstreamName = (view.upstream ?? '').replace(/^[^/]+\//, '')
    const where =
      view.upstream === undefined
        ? 'not on the remote yet'
        : view.ahead === 0 && view.behind === 0
          ? `in sync with ${upstreamName}`
          : view.behind === 0
            ? `${view.ahead} ahead of ${upstreamName}`
            : view.ahead === 0
              ? `${view.behind} behind ${upstreamName}`
              : `${view.ahead} ahead of ${upstreamName}, ${view.behind} behind`

    // The worktrees: each one with uncommitted work, the main checkout and the one shown, then the
    // clean rest a press away.
    const branchOf = (c: Checkout) => plainText(c.branch ?? 'detached')
    // The one shown first, then the rest in git's order.
    const listed = view.checkouts
      .filter(c => showClean || c.changed > 0 || c.path === main || c.path === view.root)
      .sort((x, y) => Number(y.path === view.root) - Number(x.path === view.root))
    const hiddenClean = view.checkouts.length - listed.length
    // Branch names in one column, so the folders and counts line up.
    const branchWidth = Math.min(34, Math.max(...(listed.length > 0 ? listed : [{ branch: view.branch } as Checkout]).map(c => branchOf(c).length)))
    const worktreeRow = (c: Checkout) => {
      const isShown = c.path === view.root

      return (
        <Box key={`wt-${c.path}`} flexDirection="column">
        <Box key={`wt-r-${c.path}`} flexDirection="row" columnGap={2}>
          <Box key={`wt-n-${c.path}`} flexGrow={1} flexShrink={1} flexDirection="row">
            <Box key={`wt-m-${c.path}`} flexShrink={0} width={2}>
              {/* Every worktree has a dot: the one shown in success, uncommitted work in warning, clean dim. */}
              {isShown ? <Text color="success">●</Text> : c.changed > 0 ? <Text color="warning">●</Text> : <Text dimColor>●</Text>}
            </Box>
            <Box key={`wt-b-${c.path}`} flexShrink={0} width={branchWidth + 2}>
              <Button key={`checkout-${c.path}`} plain onPress={() => void core.pickCheckout(c.path)}>
                <Text color="suggestion">{clipText(branchOf(c), branchWidth)}</Text>
              </Button>
            </Box>
            <Box key={`wt-f-${c.path}`} flexShrink={1}>
              <Text dimColor wrap="truncate-end">{c.path === main ? 'main checkout' : c.path.startsWith(`${main}/`) ? c.path.slice(main.length + 1) : tilde(c.path)}</Text>
            </Box>
          </Box>
          <Box key={`wt-c-${c.path}`} flexShrink={0} flexDirection="row">
            {c.changed > 0 ? <Text>{`${c.changed} changed`}</Text> : <Text dimColor>clean</Text>}
            {c.changed > 0 && c.newest > 0 && <Text dimColor>{` · ${sinceText(at - c.newest)}`}</Text>}
          </Box>
          {/* Switch moves this session there: `/cd <folder>` in the prompt for the person's Enter. */}
          <Box key={`wt-s-${c.path}`} flexShrink={0} width={6} justifyContent="flex-end">
            {c.path === view.own ? (
              <Text dimColor>here</Text>
            ) : (
              <Button key={`switch-${c.path}`} plain label="Switch" onPress={() => void $.prompt.fill({ text: `/cd ${c.path}` })} />
            )}
          </Box>
        </Box>
        {/* The one shown, alone, has its standing and last commit under its folder. */}
        {isShown && (
          <Box key={`wt-d-${c.path}`} paddingLeft={2 + branchWidth + 2}>
            <Text dimColor wrap="truncate-end">{`${where}${view.last !== undefined ? ` · ${view.last.hash} ${view.last.subject}${view.last.at !== undefined ? ` · ${sinceText(at - view.last.at)}` : ''}` : ''}`}</Text>
          </Box>
        )}
        </Box>
      )
    }

    // A file's diff, opened: no box, indented under the file's name, its lines cut to one row each.
    const diffBlock = (f: FileChange, key: string, depth: number) => {
      const ready = diff !== null && diff.key === key ? diff : undefined
      const line = (k: string, body: RenderChildren) => (
        <Box key={k} flexDirection="row" paddingLeft={2 * depth + 2}>
          <Box key={`${k}-b`} flexShrink={1}>
            {body}
          </Box>
        </Box>
      )

      return (
        <Box key={`diff-${key}`} flexDirection="column">
          {ready === undefined
            ? line(`dl-${key}-wait`, <Text dimColor>Reading the diff…</Text>)
            : ready.binary
              ? line(`dl-${key}-bin`, <Text dimColor>A binary file: no lines to show.</Text>)
              : ready.lines.length === 0
                ? line(`dl-${key}-none`, <Text dimColor>No line changes: only its name or mode.</Text>)
                : ready.lines.map((l, i) => {
                    const text = plainText(l.text.replace(/\t/g, '  '))

                    return line(
                      `dl-${key}-${i}`,
                      l.kind === 'add' ? <Text color="success" wrap="truncate-end">{text}</Text> : l.kind === 'del' ? <Text color="error" wrap="truncate-end">{text}</Text> : <Text dimColor wrap="truncate-end">{text}</Text>,
                    )
                  })}
          {ready !== undefined && ready.more > 0 && line(`dl-${key}-more`, <Text dimColor>{`… ${ready.more} more lines`}</Text>)}
          {line(
            `diff-a-${key}`,
            <Box key={`diff-a-b-${key}`} flexDirection="row" columnGap={2}>
              <Button key={`diff-full-${key}`} plain label="Open full diff" onPress={() => void core.openFullDiff(f)} />
              <Button key={`diff-close-${key}`} plain dimColor label="Close" onPress={() => void update($, changeOpen, () => null)} />
            </Box>,
          )}
        </Box>
      )
    }

    const fileCount = new Set(view.files.map(f => f.path)).size + view.more
    // Folders fold only when there are many files (more than 8); a short list shows whole, its folders plain dim lines.
    const canFold = fileCount > 8
    const fold = (key: string) => void update($, changesClosed, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
    // A row of the tree: a folder's line, or a file two spaces in under it; no guides, no status letter: a file's
    // name is green when added, red when deleted, warning in a conflict, plain when modified.
    const row = (r: TreeRow) => {
      if (r.kind === 'folder') {
        return (
          <Box key={`ch-${r.key}`} flexDirection="row" paddingLeft={2 * r.depth}>
            {canFold ? <Button key={`folder-${r.key}`} plain dimColor label={`${r.open ? '▾' : '▸'} ${plainText(r.name)}`} onPress={() => fold(r.key)} /> : <Text dimColor>{plainText(r.name)}</Text>}
            {!r.open && <Text dimColor>{`  ${r.files} file${r.files === 1 ? '' : 's'}`}</Text>}
          </Box>
        )
      }
      const f = r.change
      const name = plainText(r.name)
      const tint = f.letter === 'A' || f.letter === 'U' ? 'success' : f.letter === 'D' ? 'error' : f.letter === '!' ? 'warning' : undefined

      return (
        <Box key={`ch-${r.key}`} flexDirection="column">
          <Box key={`ch-r-${r.key}`} flexDirection="row" columnGap={2}>
            <Box key={`ch-n-${r.key}`} flexGrow={1} flexShrink={1} flexDirection="row" paddingLeft={2 * r.depth}>
              <Text color={fileColor(r.name)}>{'● '}</Text>
              <Button key={`file-${r.key}`} plain label={name} onPress={() => void core.toggleChange(f, r.key)}>
                {tint !== undefined ? <Text color={tint}>{name}</Text> : <Text>{name}</Text>}
              </Button>
              {f.from !== undefined && <Text dimColor wrap="truncate-end">{`  from ${f.from}`}</Text>}
            </Box>
            {counts(f.added ?? 0, f.removed ?? 0, `ch-c-${r.key}`)}
          </Box>
          {open === r.key && diffBlock(f, r.key, r.depth)}
        </Box>
      )
    }
    const added = sum(view.files, f => f.added)
    const removed = sum(view.files, f => f.removed)
    const isClean = view.error === undefined && groups.length === 0 && view.more === 0

    return (
      <Box key="changes" flexDirection="column" rowGap={0}>
        {/* The worktrees, the one shown first with its standing under it. */}
        {card('ch-worktrees', 'dim', [
          cardHead('ch-wt-h', <Text key="ch-wt-word" dimColor>worktrees</Text>, <Text key="ch-wt-n" dimColor>{`${Math.max(1, view.checkouts.length)}`}</Text>),
          ...(view.checkouts.length > 0 ? listed : [{ path: view.root, branch: view.branch, changed: view.files.length, newest: 0 }]).map(worktreeRow),
          (hiddenClean > 0 || showClean) && (
            <Box key="ch-wt-more" flexDirection="row" paddingLeft={2}>
              <Button
                key="worktrees-clean"
                plain
                dimColor
                label={showClean ? 'Hide the clean ones' : `… ${hiddenClean} more, all clean`}
                onPress={() => void update($, checkoutsOpen, all => !all)}
              />
            </Box>
          ),
        ])}
        {/* What changed: one line when clean; else its total flush right in the heading, then the tree, under a
            small dim heading per group only when there's more than one. */}
        {isClean
          ? card('ch-changes', 'dim', [cardHead('ch-h', [<Text key="ch-word" dimColor>changes</Text>, <Text key="ch-clean" dimColor>{' · nothing to commit'}</Text>])])
          : card('ch-changes', 'dim', [
              changesHead(
                view.error === undefined
                  ? [added > 0 && <Text key="ch-h-a" color="success">{`+${added}`}</Text>, removed > 0 && <Text key="ch-h-r" color="error">{`${added > 0 ? ' ' : ''}−${removed}`}</Text>, <Text key="ch-h-n" dimColor>{`${added > 0 || removed > 0 ? ' · ' : ''}${fileCount}`}</Text>]
                  : undefined,
              ),
              view.error !== undefined && <Text key="ch-error" color="error">{plainText(view.error)}</Text>,
              ...(view.error !== undefined
                ? []
                : groups.map(g => (
                    <Box key={`grp-${g.id}`} flexDirection="column">
                      {groups.length > 1 && <Text key={`grp-h-${g.id}`} dimColor>{g.name}</Text>}
                      {treeRows(g.files, g.id, canFold ? closed : new Set()).map(row)}
                    </Box>
                  ))),
              view.error === undefined && view.more > 0 && <Text key="ch-more" dimColor>{`… and ${view.more} more files not listed`}</Text>,
            ])}
        {/* The footer: when git was read (it follows edits every few seconds while this tab shows), Refresh, and
            back to following the latest edit once a worktree was picked. */}
        {footer('ch-foot', [
          <Text key="ch-checked" dimColor>{`Checked ${checkedText(at - view.at)}`}</Text>,
          <Button key="changes-refresh" plain dimColor label="Refresh" onPress={() => void core.refreshChanges(true)} />,
          !view.following && <Button key="changes-follow" plain dimColor label="Follow my edits" onPress={() => void core.pickCheckout(null)} />,
        ])}
      </Box>
    )
  }

  // ---------------------------------------------------------- Learn
  const learnBody = async () => {
    // Each day's helpers, across sessions, for its day's header.
    const days = await core.helperDays()
    const view = await read($, learnView)
    const openSlot = await read($, learnSelected)
    const limit = await read($, learnLimit)
    const explained = await read($, explanations)
    const openWork = await read($, learnWorkOpen)
    const entries = await core.entriesNow()
    const all = conceptsOf(entries)
    const byKey = new Map(all.map(c => [c.key, c]))
    const topicCount = new Set(all.map(c => c.topic).filter(t => t !== undefined)).size
    // Where a lesson came from, as a title: "task: client filter" reads "Client filter".
    const fromText = (from: string) => {
      const bare = plainText(from).replace(/^task:\s*/i, '')

      return bare.charAt(0).toUpperCase() + bare.slice(1)
    }

    // An idea opened: indented under it, no box. Its topic and how often, the note, where it came up (one
    // line each), then the plain-word actions.
    const ideaDetail = (c: Concept, slot: string, note: string | undefined) => {
      const text = explained[c.key]

      return (
        <Box key={`detail-${slot}`} flexDirection="column" paddingLeft={2}>
          <Text dimColor>{`${c.topic ?? 'Not sorted yet'} · came up ${c.seen.length === 1 ? 'once' : `${c.seen.length} times`}`}</Text>
          {note !== undefined && note !== '' && <Text>{note}</Text>}
          {c.seen.map((seen, i) => (
            <Box key={`seen-${slot}-${i}`} flexDirection="row" overflow="hidden">
              <Text dimColor>{`${shortDay(seen.at, at)} · `}</Text>
              <Text wrap="truncate-end">{fromText(seen.from)}</Text>
            </Box>
          ))}
          <Box key={`detail-actions-${slot}`} flexDirection="row" columnGap={2}>
            <Button
              key={`explain-${slot}`}
              plain
              label={text === undefined ? 'Explain it more' : text === '…' ? 'Writing…' : 'Explain it again'}
              onPress={() => void core.explainIdea(c.key)}
            />
            <Button
              key={`ask-${slot}`}
              plain
              label="Ask Claude"
              onPress={() => void $.prompt.fill({ text: `Teach me "${c.idea}" using where it shows up in this codebase: ` })}
            />
          </Box>
          {/* e explains the open idea, on a hidden button as the tabs' keys are. */}
          <Box key={`explain-key-${slot}`} display="none">
            <Button key={`explain-hot-${slot}`} label="Explain it" hotkey="e" onPress={() => void core.explainIdea(c.key)} />
          </Box>
          {text === '…' && <Text dimColor>Writing a plain-English explanation…</Text>}
          {text !== undefined && text !== '…' && (
            <Box key={`explained-${slot}`} flexDirection="column">
              <Text dimColor>Explained</Text>
              <ui.Markdown key={`explained-md-${slot}`} text={text} />
              <Box key={`explained-actions-${slot}`} flexDirection="row">
                <Button key={`keep-${slot}`} plain label="Add it to my log" onPress={() => void core.addExplanationToLog(c.key)} />
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    // One idea's line: its topic's ◆, the idea as the button that opens it, how often it came up, dim.
    // `note`, why it mattered in that piece of work, shows first once it's open.
    const ideaRow = (where: string, c: Concept, note?: string) => {
      const slot = `${where}:${c.key}`
      const isOpen = openSlot === slot

      return (
        <Box key={`idea-${slot}`} flexDirection="column">
          <Box key={`idea-h-${slot}`} flexDirection="row" columnGap={1}>
            <Box key={`idea-m-${slot}`} flexShrink={0}>
              <Text color={topicColor(c.topic)}>◆</Text>
            </Box>
            <Box key={`idea-t-${slot}`} flexGrow={1} flexShrink={1}>
              <Button key={`idea-v-${slot}`} plain label={clipText(c.idea, Math.max(16, width - 14))} onPress={() => void update($, learnSelected, cur => (cur === slot ? null : slot))} />
            </Box>
            {c.seen.length > 1 && (
              <Box key={`idea-n-${slot}`} flexShrink={0} marginLeft={1}>
                <Text dimColor>{`×${c.seen.length}`}</Text>
              </Box>
            )}
          </Box>
          {isOpen && ideaDetail(c, slot, note ?? c.seen[c.seen.length - 1]?.text)}
        </Box>
      )
    }

    // Recent and Topics: a selector of plain words, the one shown bold and underlined in the accent; r and t
    // press them from hidden buttons, as the tabs' number keys do.
    const pickView = async (id: LearnView) => {
      await update($, learnView, () => id)
      await update($, learnSelected, () => null)
    }
    const viewWord = (id: LearnView, name: string) =>
      view === id ? (
        <Button key={`lv-${id}`} plain onPress={() => void pickView(id)}>
          <Text bold underline color="suggestion">{name}</Text>
        </Button>
      ) : (
        <Button key={`lv-${id}`} plain dimColor label={name} onPress={() => void pickView(id)} />
      )

    // A day's numbers for its header: its helpers, any stopped, its tokens and its models.
    const dayFacts = (at0: number) => {
      const d = days[dayOf(at0)]
      if (d === undefined) return null
      const n = d.done + d.failed
      const models = Object.entries(d.models).sort(([, x], [, y]) => y - x)

      return (
        <Box key={`day-f-${dayOf(at0)}`} flexDirection="row" flexShrink={0}>
          <Text dimColor>{`${n} helper${n === 1 ? '' : 's'}`}</Text>
          {d.failed > 0 && <Text dimColor>{' · '}</Text>}
          {d.failed > 0 && <Text color="error">{`${d.failed} stopped`}</Text>}
          {(d.tokens ?? 0) > 0 && <Text dimColor>{` · ${tokensText(d.tokens ?? 0)}`}</Text>}
          {models.length > 0 && <Text dimColor>{' · '}</Text>}
          {models.map(([name, count], i) => (
            <Text key={`day-m-${dayOf(at0)}-${name}`} color={modelOf(name).color}>{`${i > 0 ? '  ' : ''}${count} ${name}`}</Text>
          ))}
        </Box>
      )
    }

    // Each day once, its numbers flush right; then each piece of work on one line (pressing it shows what
    // we did), its lessons a line each under it.
    const recentBody = () => {
      const sessions = sessionsOf(entries)
      const shown = sessions.slice(0, Math.max(limit, 10))
      const byDay: { day: string; at: number; items: { ss: (typeof sessions)[number]; si: number }[] }[] = []
      shown.forEach((ss, si) => {
        const day = shortDay(ss.at, at)
        const last = byDay[byDay.length - 1]
        if (last !== undefined && last.day === day) last.items.push({ ss, si })
        else byDay.push({ day, at: ss.at, items: [{ ss, si }] })
      })
      // Helpers ran today with no lesson yet: today's header still carries their numbers.
      if (byDay[0]?.day !== 'Today' && days[dayOf(at)] !== undefined) byDay.unshift({ day: 'Today', at, items: [] })

      return (
        <Box key="learn-recent" flexDirection="column" rowGap={1}>
          {sessions.length === 0 && <Text dimColor>No lessons yet. They show here when a task finishes; /learn saves one now.</Text>}
          {byDay.map(d => (
            <Box key={`day-${d.day}`} flexDirection="column">
              <Box key={`day-h-${d.day}`} flexDirection="row" columnGap={2}>
                <Box key={`day-n-${d.day}`} flexGrow={1} flexShrink={1}>
                  <Text bold>{d.day}</Text>
                </Box>
                {dayFacts(d.at)}
              </Box>
              {d.items.map(({ ss, si }) => {
                const workKey = `${ss.at}:${ss.from}`
                const isOpen = openWork === workKey

                return (
                  <Box key={`ss-${si}`} flexDirection="column" paddingLeft={2}>
                    <Box key={`ss-h-${si}`} flexDirection="row">
                      <Button key={`work-${si}`} plain label={clipText(fromText(ss.from), Math.max(16, width - 4))} onPress={() => void update($, learnWorkOpen, cur => (cur === workKey ? null : workKey))} />
                    </Box>
                    {isOpen && ss.what && (
                      <Box key={`ss-w-${si}`} paddingLeft={2}>
                        <Text dimColor>{ss.what}</Text>
                      </Box>
                    )}
                    <Box key={`ss-l-${si}`} flexDirection="column" paddingLeft={2}>
                      {ss.lessons.map(l => {
                        const c = byKey.get(ideaKey(l.idea))

                        return c === undefined ? null : ideaRow(`r${si}`, c, l.text)
                      })}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          ))}
          {sessions.length > shown.length && (
            <Box key="lv-more-row" paddingLeft={2}>
              <Button key="lv-more" plain dimColor label={`… ${sessions.length - shown.length} older · show more`} onPress={() => void update($, learnLimit, n => Math.max(n, 10) + 10)} />
            </Box>
          )}
        </Box>
      )
    }

    const topicsBody = () => {
      const groups = [...TOPICS, undefined]
        .map(topic => ({ topic, items: all.filter(c => c.topic === topic) }))
        .filter(g => g.items.length > 0)

      return (
        <Box key="learn-topics" flexDirection="column" rowGap={1}>
          {all.length === 0 && <Text dimColor>No ideas yet. They show here when a task finishes; /learn saves one now.</Text>}
          {groups.map(g => (
            <Box key={`tg-${g.topic ?? 'none'}`} flexDirection="column">
              <Box key={`tg-h-${g.topic ?? 'none'}`} flexDirection="row" columnGap={2}>
                <Box key={`tg-n-${g.topic ?? 'none'}`} flexGrow={1} flexShrink={1}>
                  <Text bold>{g.topic ?? 'Not sorted yet'}</Text>
                </Box>
                <Text dimColor>{`${g.items.length} idea${g.items.length === 1 ? '' : 's'}`}</Text>
              </Box>
              <Box key={`tg-b-${g.topic ?? 'none'}`} flexDirection="column" paddingLeft={2}>
                {g.items.map(c => ideaRow('t', c))}
              </Box>
            </Box>
          ))}
        </Box>
      )
    }

    return (
      <Box key="learn" flexDirection="column" rowGap={1}>
        <Box key="learn-head" flexDirection="row" columnGap={2}>
          <Box key="learn-head-l" flexDirection="row" flexGrow={1} flexShrink={1} columnGap={2}>
            <Text dimColor bold>{'LEARN '}</Text>
            {viewWord('recent', 'Recent')}
            {viewWord('topics', 'Topics')}
          </Box>
          <Button key="learn-save" plain label="Save what we just did" onPress={() => void $.prompt.submit({ text: LEARN_PROMPT })} />
          <Box key="learn-keys" display="none">
            <Button key="lv-key-recent" label="Recent" hotkey="r" onPress={() => void pickView('recent')} />
            <Button key="lv-key-topics" label="Topics" hotkey="t" onPress={() => void pickView('topics')} />
          </Box>
        </Box>

        {view === 'topics' ? topicsBody() : recentBody()}

        <Box key="learn-actions" flexDirection="row" columnGap={2} overflow="hidden">
          <Button key="log-open" plain dimColor label="Open the log" onPress={() => void core.openLog()} />
          <Text dimColor wrap="truncate-end">{all.length > 0 ? `${core.logShown()} · ${all.length} idea${all.length === 1 ? '' : 's'} in ${topicCount} topic${topicCount === 1 ? '' : 's'}` : core.logShown()}</Text>
        </Box>
      </Box>
    )
  }

  const body =
    current === 'agents'
      ? await agentsBody()
      : current === 'changes'
        ? await changesBody()
        : current === 'sessions'
          ? await sessionsBody()
          : await learnBody()

  // The keys, only while the panel has the keyboard.
  const keys = e.props.isFocused && (
    <Text key="pane-keys" dimColor wrap="truncate-end">
      {`1-${tabs.length} tabs${
        current === 'agents' ? ' · j k helpers · Enter opens' : current === 'changes' ? ' · Enter opens a file or folds a folder' : current === 'learn' ? ' · r t views · e explains' : ''
      } · Esc to the prompt`}
    </Text>
  )

  // Every tab shows what the band does (the usage card on top): the slot above the prompt steps aside while the
  // panel is shown.
  core.showBandInPane()

  return (
    <Box flexDirection="column" width={width} minHeight={e.props.scroll?.bodyRows}>
      {header}
      {current !== 'agents' && usageCardOf([])}
      {body}
      {keys && <Box key="pane-keys-row" marginTop={1}>{keys}</Box>}
    </Box>
  )
}
