// What the person's own status line shows, as styled pieces fitted to a width: the band above the prompt draws
// them, and the panel's cards draw from the same facts. Pure; register.tsx gathers the facts.
import type { SessionUsage } from 'claude-code'

import { plainText } from './steps'
import { shortModel } from './text'

// One line of styled pieces cut to `room` cells from the end, as truncate-end would cut it: the piece that
// overflows ends in "…", the ones after it go, and a bare separator is never left dangling.
export type Piece = { key: string; text: string; color?: string; bold?: boolean; dim?: boolean }
export function fitLine(pieces: Piece[], room: number): Piece[] {
  const out: Piece[] = []
  let left = room
  for (const p of pieces) {
    if (p.text.length <= left) {
      out.push(p)
      left -= p.text.length
      continue
    }
    if (left >= 2 && /\w/.test(p.text.slice(0, left - 1))) out.push({ ...p, text: `${p.text.slice(0, left - 1)}…` })
    break
  }

  return out
}

// Three groups, left to right: where you are (folder, branch ✓ or ●), what's running (model, effort, lines
// changed, the prompt cache warm or cold), how much is left of the context (ctx), then the 5-hour and the week as the share used
// and the time to each reset, unlabelled: hours read as the 5-hour window, days as the week).
// Coloured as the person's own status line was: the folder ochre, the branch slate blue, ✓ sage and ● terracotta,
// the model mauve, effort by weight, + sage and − terracotta, calm meters sage, the 5-hour reset teal and the
// week's mauve; labels and separators dim. A meter past its warning or error line takes the theme's colour.
type Tone = 'calm' | 'warning' | 'error'
export type Meter = { key: string; label: string; pct: number; tone: Tone; left: string | undefined; leftShare?: number }
// The share used at which each meter turns warning, then error.
const METER_LINES: Record<string, [number, number]> = { context: [70, 85], five: [75, 90], week: [75, 90] }
const meterTone = (key: string, pct: number): Tone => {
  const [warn, err] = METER_LINES[key] ?? [75, 90]

  return pct >= err ? 'error' : pct >= warn ? 'warning' : 'calm'
}
// xterm-256 shades of the person's old status line (179, 67, 167, 107, 139, 73, 136, 131).
export const BAND_COLORS = { folder: '#D7AF5F', branch: '#5F87AF', clean: '#87AF5F', dirty: '#D75F5F', model: '#AF87AF', added: '#87AF5F', removed: '#D75F5F', calm: '#87AF5F', fiveLeft: '#5FAFAF', weekLeft: '#AF87AF', high: '#AF8700', max: '#AF5F5F', warm: '#87AF5F', cold: '#5F87AF', now: '#5FAFAF' }
export const effortStyle = (effort: string): Partial<Piece> =>
  effort === 'max' || effort === 'xhigh' ? { color: BAND_COLORS.max, bold: true } : effort === 'high' ? { color: BAND_COLORS.high, bold: true } : effort === 'medium' ? { color: BAND_COLORS.calm } : { dim: true }
// The cache's last few minutes: warm still, but the next send had better come soon.
export const CACHE_SOON_MS = 5 * 60000
export const BRANCH_MAX = 24
// The length of the 5-hour and weekly windows, to colour a reset time by the share of its window left.
const WINDOW_MS: Record<string, number> = { five: 5 * 3600000, week: 7 * 86400000 }

// The time to a reset, as the panel writes times: 42m, 3h 05m, 1d 10h.
function resetText(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  if (minutes >= 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ${Math.floor((minutes % (24 * 60)) / 60)}h`

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

// What goes when the band is short of room, first to go first. A meter in warning or error never goes.
// The branch is not among them: the folder name shortens first, and the branch goes only when even that falls short.
const BAND_DROPS = ['cache', 'lines', 'effort', 'calmWeek', 'model', 'calmTimes'] as const
type BandDrops = Partial<Record<(typeof BAND_DROPS)[number] | 'branch', boolean>>
type BandFacts = {
  folder: string
  git: { branch: string | null; dirty: boolean } | undefined
  model: { name: string; color: string } | undefined
  effort: string | undefined
  lines: { added: number; removed: number }
  // The main session's prompt cache: ms until it goes cold (0 once it has), or none before its first turn.
  cacheLeft: number | undefined
  meters: Meter[]
}

function bandPieces(f: BandFacts, drop: BandDrops, folder: string = f.folder): Piece[] {
  const groups: Piece[][] = []
  const where: Piece[] = [{ key: 'sl-dir', text: folder, color: BAND_COLORS.folder, bold: true }]
  if (f.git?.branch != null && drop.branch !== true) {
    const branch = f.git.branch.length > BRANCH_MAX ? `${f.git.branch.slice(0, BRANCH_MAX - 1)}…` : f.git.branch
    where.push({ key: 'sl-branch-gap', text: '  ' }, { key: 'sl-branch', text: branch, color: BAND_COLORS.branch }, { key: 'sl-mark-gap', text: ' ' })
    where.push(f.git.dirty ? { key: 'sl-dirty', text: '●', color: BAND_COLORS.dirty, bold: true } : { key: 'sl-clean', text: '✓', color: BAND_COLORS.clean })
  }
  groups.push(where)

  const running: Piece[] = []
  if (f.model !== undefined && drop.model !== true) running.push({ key: 'sl-model', text: f.model.name, color: BAND_COLORS.model, bold: true })
  if (f.effort !== undefined && drop.effort !== true && running.length > 0) {
    running.push({ key: 'sl-effort-gap', text: ' ' }, { key: 'sl-effort', text: f.effort, ...effortStyle(f.effort) })
  }
  if ((f.lines.added > 0 || f.lines.removed > 0) && drop.lines !== true) {
    if (running.length > 0) running.push({ key: 'sl-lines-gap', text: '  ' })
    running.push({ key: 'sl-added', text: `+${f.lines.added}`, color: BAND_COLORS.added }, { key: 'sl-lines-mid', text: ' ' }, { key: 'sl-removed', text: `−${f.lines.removed}`, color: BAND_COLORS.removed })
  }
  if (f.cacheLeft !== undefined && drop.cache !== true) {
    if (running.length > 0) running.push({ key: 'sl-cache-gap', text: '  ' })
    if (f.cacheLeft <= 0) running.push({ key: 'sl-cold', text: 'cold', color: BAND_COLORS.cold })
    else running.push({ key: 'sl-warm', text: 'warm', ...(f.cacheLeft <= CACHE_SOON_MS ? { color: 'warning' } : { color: BAND_COLORS.warm }) }, { key: 'sl-warm-sp', text: ' ' }, { key: 'sl-warm-left', text: resetText(f.cacheLeft), dim: true })
  }
  if (running.length > 0) groups.push(running)

  const used: Piece[] = []
  for (const m of f.meters) {
    if (m.key === 'week' && m.tone === 'calm' && drop.calmWeek === true) continue
    if (used.length > 0) used.push({ key: `sl-${m.key}-gap`, text: '   ' })
    const hot = m.tone === 'calm' ? {} : { color: m.tone }
    const calmLeft = m.key === 'five' ? BAND_COLORS.fiveLeft : m.key === 'week' ? BAND_COLORS.weekLeft : undefined
    // Only the context is named ("ctx"); the 5-hour and weekly meters read by their reset times (hours, days).
    if (m.label !== '') used.push({ key: `sl-${m.key}-l`, text: m.label, dim: true }, { key: `sl-${m.key}-sp`, text: ' ' })
    used.push(m.key === 'context' ? { key: `sl-${m.key}`, text: `${Math.max(0, 100 - m.pct)}%`, ...(m.tone === 'calm' ? { color: BAND_COLORS.calm } : { ...hot, bold: true }) } : m.pct >= 100 ? { key: `sl-${m.key}`, text: 'full', color: 'error', bold: true } : { key: `sl-${m.key}`, text: `${m.pct}%`, ...(m.tone === 'calm' ? { color: BAND_COLORS.calm } : { ...hot, bold: true }) })
    if (m.left === undefined || (m.tone === 'calm' && drop.calmTimes === true)) continue
    used.push({ key: `sl-${m.key}-left-sp`, text: ' ' }, { key: `sl-${m.key}-left`, text: m.left, ...(m.tone === 'calm' ? (calmLeft !== undefined ? { color: calmLeft } : { dim: true }) : hot) })
  }
  if (used.length > 0) groups.push(used)

  return groups.flatMap((g, i) => (i === 0 ? g : [{ key: `sl-sep-${i}-a`, text: '  ' }, { key: `sl-sep-${i}`, text: '·', dim: true }, { key: `sl-sep-${i}-b`, text: '  ' }, ...g]))
}

export const piecesWidth = (pieces: Piece[]) => pieces.reduce((n, p) => n + p.text.length, 0)

export type StatusFacts = { folder: string; git: { branch: string | null; dirty: boolean } | undefined; model: string; effort: string | undefined; usage: SessionUsage | undefined; lines: { added: number; removed: number }; cacheLeft?: number | undefined; now: number }

// The context left (the meter's tone still follows the share used), then the 5-hour and weekly limits with the time to each reset; a figure the engine lacks is left out.
export function metersOf(usage: SessionUsage | undefined, now: number): Meter[] {
  const meters: Meter[] = []
  const context = usage?.context.percent
  if (context !== undefined) {
    const pct = Math.round(context)
    meters.push({ key: 'context', label: 'ctx', pct, tone: pct >= 100 ? 'error' : meterTone('context', pct), left: undefined })
  }
  for (const [kind, key, label] of [['five_hour', 'five', ''], ['seven_day', 'week', '']] as const) {
    const w = usage?.rateLimits.find(r => r.kind === kind)
    if (w === undefined) continue
    const pct = Math.round(w.percentUsed)
    const left = w.resetsAt === undefined ? Number.NaN : Date.parse(w.resetsAt) - now
    meters.push({ key, label, pct, tone: pct >= 100 ? 'error' : meterTone(key, pct), left: left > 0 ? resetText(left) : undefined, leftShare: left > 0 ? Math.min(1, left / WINDOW_MS[key]!) : undefined })
  }

  return meters
}

export const folderName = (folder: string) => plainText(folder.replace(/\/+$/, '').split('/').pop() ?? '')

export function statusPieces(s: StatusFacts, width: number): Piece[] {
  const facts: BandFacts = {
    folder: folderName(s.folder),
    git: s.git === undefined || s.git.branch === null ? s.git : { ...s.git, branch: plainText(s.git.branch) },
    model: s.model === '' ? undefined : { name: shortModel(s.model), color: BAND_COLORS.model },
    effort: s.effort,
    lines: s.lines,
    cacheLeft: s.cacheLeft,
    meters: metersOf(s.usage, s.now),
  }

  const drop: BandDrops = {}
  let pieces = bandPieces(facts, drop)
  for (const step of BAND_DROPS) {
    if (piecesWidth(pieces) <= width) break
    drop[step] = true
    pieces = bandPieces(facts, drop)
  }
  // Still short: the folder name gives way, ending in "…"; only if that can't make room does the branch go too.
  const shorten = () => {
    const over = piecesWidth(pieces) - width
    if (over > 0 && facts.folder.length - over >= 2) pieces = bandPieces(facts, drop, `${facts.folder.slice(0, facts.folder.length - over - 1)}…`)
  }
  shorten()
  if (piecesWidth(pieces) > width && facts.git?.branch != null) {
    drop.branch = true
    pieces = bandPieces(facts, drop)
    shorten()
  }

  return fitLine(pieces, width)
}
