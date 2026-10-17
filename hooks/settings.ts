// The settings people can change (plugin.json "userConfig", edited with /config or `claude plugin configure`),
// read once as the plugin registers. Pure, so tests can reach it. A value that is missing, the wrong kind or out
// of range falls back to the default below, so a typo in a setting never breaks the mod.

import type { KeepWarmMode } from './cache'
import type { ChatEffort } from './effort'
import { asChatEffort } from './effort'
import { asKeepWarmMode } from './cache'

export type Settings = {
  /** Quick looks (Read, Grep, Bash ...) the lead duck gets per request before it must hand work to a helper. */
  quickLooks: number
  /** The 5-hour usage window's percent at which the throttle tightens. */
  throttleFiveHour: number
  /** How many points past the weekly pace (percent used above percent of the week gone) before the throttle tightens. */
  throttleWeekMargin: number
  /** Keep-warm's starting mode; /keep-warm still changes it, and the choice made there is remembered. */
  keepWarm: KeepWarmMode
  /** The lead duck's own effort at start; /chat-effort still changes it. */
  chatEffort: ChatEffort
  /** The cmux command line to use, or '' to find it (CMUX_BUNDLED_CLI_PATH, else the usual place). */
  cmuxPath: string
  /** Whether the ducks' sounds are on at start; /crew on|off still changes it. */
  sounds: boolean
  /** A folder with extra themes (the format is in themes.ts), or ''. Other installed plugins' themes are found without it. */
  themesDir: string
  /** The theme drawn at start: 'ducks', or the id of a theme found. /crew theme still changes it. */
  theme: string
  /** Whether a small status file per lead duck is written to ~/.claude/duckherd/dashboard/ for outside tools. Off by default. */
  statusFiles: boolean
}

export const DEFAULTS: Settings = {
  quickLooks: 3,
  throttleFiveHour: 80,
  throttleWeekMargin: 10,
  keepWarm: 'auto',
  chatEffort: 'auto',
  cmuxPath: '',
  sounds: true,
  themesDir: '',
  theme: 'ducks',
  statusFiles: false,
}

type Raw = Readonly<Record<string, unknown>>

function whole(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN

  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
}

function flag(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return fallback
  const said = raw.trim().toLowerCase()
  if (['true', 'on', 'yes', '1'].includes(said)) return true
  if (['false', 'off', 'no', '0'].includes(said)) return false

  return fallback
}

const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '')

export function readSettings(options: Raw): Settings {
  const theme = text(options.theme)

  return {
    quickLooks: whole(options.quickLooks, DEFAULTS.quickLooks, 0, 20),
    throttleFiveHour: whole(options.throttleFiveHour, DEFAULTS.throttleFiveHour, 1, 100),
    throttleWeekMargin: whole(options.throttleWeekMargin, DEFAULTS.throttleWeekMargin, 0, 100),
    keepWarm: asKeepWarmMode(text(options.keepWarm).toLowerCase(), DEFAULTS.keepWarm),
    chatEffort: asChatEffort(options.chatEffort, DEFAULTS.chatEffort),
    cmuxPath: text(options.cmuxPath),
    sounds: flag(options.sounds, DEFAULTS.sounds),
    themesDir: text(options.themesDir),
    theme: theme === '' ? DEFAULTS.theme : theme.toLowerCase(),
    statusFiles: flag(options.statusFiles, DEFAULTS.statusFiles),
  }
}

/** A path as the person typed it: `~/` is their home folder, a path without a leading slash starts there too. */
export function homePath(path: string, home: string): string {
  return path.startsWith('/') ? path : `${home}/${path.replace(/^~\/?/, '')}`
}
