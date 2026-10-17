// The usage throttle: pure rules, so tests can reach them. register.tsx holds the state and wiring.
// Levels (only while the mode is "on"):
//  - 5-hour window: tight at >= 80% used, level 2 at >= 90%.
//  - weekly window, by PACE: elapsed = share of the 7 days gone (from its reset time). Tight when used > elapsed*100 + 10
//    and used >= 25%; level 2 when ahead of the pace by >= 25 points. No reset time: no weekly throttle. Late in the week
//    with headroom nothing trips, as the pace line is then above what is left to use.
//  - level 1: helper effort one step lower, the auto effort judge capped at medium; level 2: also helpers a model tier
//    lighter and two at a time.
// Boost: throttle off until the windows in force at boost time reset, then back to "on".

import type { Effort } from './effort'

export type ThrottleMode = 'on' | 'off' | 'boost'
export type Window = { pct: number; resetsAt: number | null }
export type Assessment = {
  level: 0 | 1 | 2
  /** Why, in words: "5-hour at 83%", "weekly ahead of pace (62% used, 40% of the week gone)". */
  why: string[]
  fiveTight: boolean
  weekTight: boolean
  /** The weekly pace, when its reset time is known: percent used and percent of the week elapsed. */
  pace: { used: number; elapsed: number } | undefined
}

export const WEEK_MS = 7 * 24 * 3600 * 1000
export const FIVE_HOUR_MS = 5 * 3600 * 1000
const FIVE_TIGHT = 80
const FIVE_TIGHT_2 = 90
const WEEK_MARGIN = 10
const WEEK_MARGIN_2 = 25
const WEEK_MIN_USED = 25
const WARN_AT = 95

export const asThrottleMode = (v: unknown): ThrottleMode => (v === 'off' || v === 'boost' ? v : 'on')

/** Used vs elapsed for the weekly window; undefined without a reset time. Elapsed is 0 to 100. */
export function weeklyPace(week: Window | undefined, now: number): { used: number; elapsed: number } | undefined {
  if (week === undefined || week.resetsAt === null) return undefined
  const elapsed = Math.min(1, Math.max(0, 1 - (week.resetsAt - now) / WEEK_MS)) * 100

  return { used: week.pct, elapsed }
}

export type Limits = { fiveTight: number; weekMargin: number }
export const LIMITS: Limits = { fiveTight: FIVE_TIGHT, weekMargin: WEEK_MARGIN }

/** What the windows say, whatever the mode (the mode is applied by effectiveLevel). `limits` are the settings'. */
export function assess(five: Window | undefined, week: Window | undefined, now: number, limits: Limits = LIMITS): Assessment {
  // Level 2 stays a step beyond level 1 whatever the person set: 10 points further on the 5-hour window, 15 on the weekly.
  const five2 = Math.max(FIVE_TIGHT_2, limits.fiveTight + 10)
  const week2 = Math.max(WEEK_MARGIN_2, limits.weekMargin + 15)
  const why: string[] = []
  let level: 0 | 1 | 2 = 0
  const raise = (l: 1 | 2) => {
    if (l > level) level = l
  }
  const fiveTight = five !== undefined && five.pct >= limits.fiveTight
  if (five !== undefined && fiveTight) {
    raise(five.pct >= five2 ? 2 : 1)
    why.push(`5-hour at ${Math.round(five.pct)}%`)
  }
  const pace = weeklyPace(week, now)
  const ahead = pace === undefined ? 0 : pace.used - pace.elapsed
  const weekTight = pace !== undefined && pace.used >= WEEK_MIN_USED && ahead > limits.weekMargin
  if (pace !== undefined && weekTight) {
    raise(ahead >= week2 ? 2 : 1)
    why.push(`weekly ahead of pace (${Math.round(pace.used)}% used, ${Math.round(pace.elapsed)}% of the week gone)`)
  }

  return { level, why, fiveTight, weekTight, pace }
}

/** The level in force: nothing unless the mode is on. */
export const effectiveLevel = (mode: ThrottleMode, a: Assessment): 0 | 1 | 2 => (mode === 'on' ? a.level : 0)

/**
 * The time a boost ends, from what was tight when it began: the weekly reset if weekly was tight, else the 5-hour
 * reset (also when neither was tight: the next 5-hour reset). No 5-hour reset time known: 5 hours from now.
 */
export function boostUntil(a: Assessment, five: Window | undefined, week: Window | undefined, now: number): number {
  if (a.weekTight && week?.resetsAt != null) return week.resetsAt

  return five?.resetsAt ?? now + FIVE_HOUR_MS
}

export const boostOver = (until: number | undefined, now: number): boolean => until === undefined || now >= until

/** One step lower, never below low. */
export function capEffort(e: Effort): Effort {
  return e === 'max' || e === 'xhigh' ? 'high' : e === 'high' ? 'medium' : 'low'
}

/** The auto judge's pick under throttle: at most medium. */
export const capJudged = (e: Effort | undefined): Effort | undefined => (e === 'low' || e === undefined ? e : 'medium')

/**
 * The helper effort under the throttle. Not capped: the call's own effort parameter, or a model the person forced
 * with /helpers (both deliberate). Otherwise level 1 and up cap the Why-line or default effort one step.
 */
export function throttledEffort(i: { level: number; effort: Effort; explicit: boolean; forced: boolean }): Effort {
  return i.level >= 1 && !i.explicit && !i.forced ? capEffort(i.effort) : i.effort
}

/** Windows at or past 95%, for the warning line and toast (whatever the mode). */
export function warnings(five: Window | undefined, week: Window | undefined): { key: string; label: string; pct: number; resetsAt: number | null }[] {
  const out: { key: string; label: string; pct: number; resetsAt: number | null }[] = []
  if (five !== undefined && five.pct >= WARN_AT) out.push({ key: 'five_hour', label: '5-hour', pct: Math.round(five.pct), resetsAt: five.resetsAt })
  if (week !== undefined && week.pct >= WARN_AT) out.push({ key: 'seven_day', label: 'weekly', pct: Math.round(week.pct), resetsAt: week.resetsAt })

  return out
}

/** A toast once per window per reset period: the period is the window's reset time. Returns the warnings to toast and the new memory. */
export function newWarnings(
  warned: Record<string, number | null>,
  found: ReturnType<typeof warnings>,
): { toast: ReturnType<typeof warnings>; warned: Record<string, number | null> } {
  const next = { ...warned }
  // The period is the reset time to the nearest hour, so a reading a few seconds off is the same period.
  const period = (w: { resetsAt: number | null }) => (w.resetsAt === null ? null : Math.round(w.resetsAt / 3600000))
  const toast = found.filter(w => !(w.key in warned) || warned[w.key] !== period(w))
  for (const w of toast) next[w.key] = period(w)

  return { toast, warned: next }
}
