// Themes from outside: another set of creatures (art, names, sounds) that a person or another plugin adds as a JSON
// file, with no change to Duckherd. The ducks stay the one built-in theme. This file is the pure part (read, check,
// pick), so tests can reach it; register.tsx finds the files and draws.
//
// Where a theme file is looked for:
//  - `<themesDir>/*.theme.json`, and `<themesDir>/<folder>/duckherd-theme.json` (the `themesDir` setting);
//  - `duckherd-theme.json` at the root of any other installed plugin (installed_plugins.json), so a plugin can
//    ship a theme just by having that file.
//
// The file (all sizes in pixels; a frame is rows of letters, '.' clear, each letter a colour in `palette`):
//  {
//    "duckherdTheme": 1, "id": "pond-night", "title": "Pond at night",
//    "palette": { "A": "#112233", ... },                         single-character keys, #rrggbb values
//    "marks":  { "star", "starLit", "drop", "dropLit", "asked", "told" },   palette letters (optional)
//    "stuck":  { "drop": [row, col], "mark": col },              where a stuck helper's marks go (optional)
//    "helpers": [ {                                              1 to 12; each new helper takes the next one
//        "name": "Robin", "names": ["Robin", "Ash"],             names: its agent-type names (letters and digits), at most 10
//        "colors": { "E": "#fff" }, "blink": ["e", "K"],         optional: its own letters; the eye pair and lid
//        "loops": { "dabble|read|type|run|think": { "frameMs": 300, "frames": [20 x 12 frame, ...] } },
//        "ends": { "done": frame, "failed": frame, "cheer|droop|asleep|idle|flinch|wave|noticed": [frame, ...],
//                  "idleMove": [frame, ...] (optional) }
//    } ],
//    "lead": { "rest": [28 x 16 frame, ...], "rising": [...], "levels": [[...], ...],   (optional)
//              "flare": { "small": [[[row, col, letter], ...], ...], "big": [...] } },
//    "sounds": { "quack": "done.wav", "honk": ..., "chirp": ..., "snore": ... }          files beside the theme file
//  }

import type { DuckAction, ThemeArt, ThemeEnds, ThemeHelperArt, ThemeLeadArt, ThemeMarks } from './creatures'

export const THEME_FILE = 'duckherd-theme.json'
export const SOUND_KINDS = ['quack', 'honk', 'chirp', 'snore'] as const
export type SoundKind = (typeof SOUND_KINDS)[number]

export type LoadedTheme = {
  id: string
  title: string
  palette: Record<string, string>
  marks?: ThemeMarks
  stuck?: { drop: [number, number]; mark: number }
  helpers: ThemeHelperArt[]
  /** Each helper's own names, in the order of `helpers`. */
  names: string[][]
  lead?: ThemeLeadArt
  /** File names, relative to the theme file's folder. */
  sounds: Partial<Record<SoundKind, string>>
}

const ACTIONS: DuckAction[] = ['dabble', 'read', 'type', 'run', 'think']
const FRAME_SETS = ['cheer', 'droop', 'asleep', 'idle', 'flinch', 'wave', 'noticed'] as const
const HELPER = { w: 20, h: 12 }
const LEAD = { w: 28, h: 16 }
const MAX_TEXT = 3_000_000
const MAX_ERRORS = 8
const HEX = /^#[0-9a-fA-F]{6}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const one = (s: string) => [...s].length === 1 && s.length === 1

/** Read a theme file's text: the theme, or why not (the first few problems, each saying where). */
export function parseTheme(text: string): { theme: LoadedTheme } | { errors: string[] } {
  const errors: string[] = []
  const bad = (m: string) => {
    if (errors.length < MAX_ERRORS) errors.push(m)
  }
  if (text.length > MAX_TEXT) return { errors: ['the file is over 3 MB'] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { errors: ['not valid JSON'] }
  }
  if (!isObj(raw)) return { errors: ['the file is not a JSON object'] }
  if (raw.duckherdTheme !== 1) bad('"duckherdTheme": 1 is missing')
  const id = typeof raw.id === 'string' ? raw.id : ''
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(id) || id === 'ducks') bad('"id" must be lowercase letters, digits and dashes, and not "ducks"')
  const palette: Record<string, string> = {}
  if (!isObj(raw.palette)) bad('"palette" is missing')
  else {
    for (const [k, v] of Object.entries(raw.palette)) {
      if (!one(k) || k === '.') bad(`palette key ${JSON.stringify(k)}: one character, not "."`)
      else if (typeof v !== 'string' || !HEX.test(v)) bad(`palette ${k}: a #rrggbb colour`)
      else palette[k] = v
    }
  }

  // A frame of the given size, its letters all in `known` (or '.').
  const frame = (v: unknown, size: { w: number; h: number }, where: string, known: Set<string>): string[] | undefined => {
    if (!Array.isArray(v) || v.length !== size.h || !v.every(r => typeof r === 'string')) {
      bad(`${where}: a frame is ${size.h} rows of text`)
      return undefined
    }
    for (const row of v as string[]) {
      if (row.length !== size.w) {
        bad(`${where}: rows are ${size.w} wide`)
        return undefined
      }
      for (const c of row) {
        if (c !== '.' && !known.has(c)) {
          bad(`${where}: the letter ${JSON.stringify(c)} is not in the palette`)
          return undefined
        }
      }
    }

    return v as string[]
  }
  const frames = (v: unknown, size: { w: number; h: number }, where: string, known: Set<string>): string[][] | undefined => {
    if (!Array.isArray(v) || v.length === 0 || v.length > 64) {
      bad(`${where}: 1 to 64 frames`)
      return undefined
    }
    const out = v.map((f, i) => frame(f, size, `${where}[${i}]`, known))

    return out.every((f): f is string[] => f !== undefined) ? out : undefined
  }
  const letterSet = (extra?: Record<string, string>) => new Set([...Object.keys(palette), ...Object.keys(extra ?? {})])
  const baseKnown = letterSet()

  let marks: ThemeMarks | undefined
  if (raw.marks !== undefined) {
    const m = isObj(raw.marks) ? raw.marks : {}
    const keys = ['star', 'starLit', 'drop', 'dropLit', 'asked', 'told'] as const
    if (keys.every(k => typeof m[k] === 'string' && baseKnown.has(m[k] as string))) marks = m as unknown as ThemeMarks
    else bad('"marks" needs star, starLit, drop, dropLit, asked and told, each a palette letter')
  }
  let stuck: LoadedTheme['stuck']
  if (raw.stuck !== undefined) {
    const s = isObj(raw.stuck) ? raw.stuck : {}
    const d = s.drop
    if (Array.isArray(d) && d.length === 2 && d.every(n => Number.isInteger(n) && n >= 0 && n < 12) && Number.isInteger(s.mark) && (s.mark as number) >= 0 && (s.mark as number) < 20) {
      stuck = { drop: [d[0] as number, d[1] as number], mark: s.mark as number }
    } else bad('"stuck" is {"drop": [row, col], "mark": col}')
  }

  const helpers: ThemeHelperArt[] = []
  const names: string[][] = []
  const taken = new Set<string>()
  if (!Array.isArray(raw.helpers) || raw.helpers.length < 1 || raw.helpers.length > 12) bad('"helpers": 1 to 12 entries')
  else {
    raw.helpers.forEach((h: unknown, i: number) => {
      const at = `helpers[${i}]`
      if (!isObj(h)) return bad(`${at}: not an object`)
      const name = typeof h.name === 'string' && h.name.trim() !== '' ? h.name.trim().slice(0, 30) : ''
      if (name === '') return bad(`${at}: "name" is missing`)
      let own: Record<string, string> | undefined
      if (h.colors !== undefined) {
        own = {}
        if (!isObj(h.colors)) bad(`${at}.colors: an object`)
        else {
          for (const [k, v] of Object.entries(h.colors)) {
            if (!one(k) || k === '.' || typeof v !== 'string' || !HEX.test(v)) bad(`${at}.colors ${JSON.stringify(k)}: one character and a #rrggbb colour`)
            else own[k] = v
          }
        }
      }
      const known = letterSet(own)
      let blink: [string, string] | undefined
      if (h.blink !== undefined) {
        if (Array.isArray(h.blink) && h.blink.length === 2 && h.blink.every(c => typeof c === 'string' && one(c))) blink = [h.blink[0] as string, h.blink[1] as string]
        else bad(`${at}.blink: two single letters`)
      }
      const loops = {} as Record<DuckAction, { frameMs: number; frames: string[][] }>
      const lo = isObj(h.loops) ? h.loops : {}
      for (const a of ACTIONS) {
        const l = lo[a]
        if (!isObj(l) || typeof l.frameMs !== 'number' || l.frameMs < 50 || l.frameMs > 5000) {
          bad(`${at}.loops.${a}: {"frameMs": 50 to 5000, "frames": [...]}`)
          continue
        }
        const f = frames(l.frames, HELPER, `${at}.loops.${a}`, known)
        if (f !== undefined) loops[a] = { frameMs: l.frameMs, frames: f }
      }
      const en = isObj(h.ends) ? h.ends : {}
      const ends: Partial<ThemeEnds> = {}
      const done = frame(en.done, HELPER, `${at}.ends.done`, known)
      const failed = frame(en.failed, HELPER, `${at}.ends.failed`, known)
      if (done !== undefined) ends.done = done
      if (failed !== undefined) ends.failed = failed
      for (const k of FRAME_SETS) {
        const f = frames(en[k], HELPER, `${at}.ends.${k}`, known)
        if (f !== undefined) ends[k] = f
      }
      if (en.idleMove !== undefined) {
        const f = frames(en.idleMove, HELPER, `${at}.ends.idleMove`, known)
        if (f !== undefined) ends.idleMove = f
      }
      const list = Array.isArray(h.names) ? h.names : [name]
      const mine: string[] = []
      for (const n of list.slice(0, 10)) {
        if (typeof n !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(n.trim())) bad(`${at}.names: letters and digits, up to 20 characters`)
        else if (taken.has(n.trim().toLowerCase())) bad(`${at}.names: ${n.trim()} is used twice`)
        else {
          taken.add(n.trim().toLowerCase())
          mine.push(n.trim())
        }
      }
      if (ACTIONS.every(a => loops[a] !== undefined) && ends.done !== undefined && ends.failed !== undefined && FRAME_SETS.every(k => ends[k] !== undefined)) {
        helpers.push({ name, ...(own !== undefined ? { colors: own } : {}), ...(blink !== undefined ? { blink } : {}), loops, ends: ends as ThemeEnds })
        names.push(mine)
      }
    })
  }

  let lead: ThemeLeadArt | undefined
  if (raw.lead !== undefined) {
    const l = isObj(raw.lead) ? raw.lead : {}
    const rest = frames(l.rest, LEAD, 'lead.rest', baseKnown)
    const rising = frames(l.rising, LEAD, 'lead.rising', baseKnown)
    const levels = Array.isArray(l.levels) && l.levels.length >= 1 && l.levels.length <= 4 ? l.levels.map((set, i) => frames(set, LEAD, `lead.levels[${i}]`, baseKnown)) : (bad('lead.levels: 1 to 4 sets of frames'), undefined)
    let flare: ThemeLeadArt['flare']
    if (l.flare !== undefined) {
      const cells = (v: unknown) =>
        Array.isArray(v) && v.length <= 8 && v.every(step => Array.isArray(step) && step.length <= 64 && step.every(c => Array.isArray(c) && c.length === 3 && Number.isInteger(c[0]) && Number.isInteger(c[1]) && typeof c[2] === 'string' && baseKnown.has(c[2])))
      const f = isObj(l.flare) ? l.flare : {}
      if (cells(f.small) && cells(f.big)) flare = { small: f.small as [number, number, string][][], big: f.big as [number, number, string][][] }
      else bad('lead.flare: {"small": [[[row, col, letter], ...]], "big": ...}, each letter in the palette')
    }
    if (rest !== undefined && rising !== undefined && levels !== undefined && levels.every((x): x is string[][] => x !== undefined)) lead = { rest, rising, levels: levels as string[][][], ...(flare !== undefined ? { flare } : {}) }
  }

  const sounds: LoadedTheme['sounds'] = {}
  if (raw.sounds !== undefined) {
    const s = isObj(raw.sounds) ? raw.sounds : {}
    for (const k of SOUND_KINDS) {
      const f = s[k]
      if (f === undefined) continue
      if (typeof f === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,80}\.(wav|mp3)$/.test(f) && !f.includes('..')) sounds[k] = f
      else bad(`sounds.${k}: a .wav or .mp3 file name beside the theme file, no folders`)
    }
  }

  if (errors.length > 0) return { errors }
  const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim().slice(0, 60) : id

  return { theme: { id, title, palette, ...(marks !== undefined ? { marks } : {}), ...(stuck !== undefined ? { stuck } : {}), helpers, names, ...(lead !== undefined ? { lead } : {}), sounds } }
}

/** The art for the helper at `index` (wrapping round the theme's helpers): the one set a duck view needs. */
export function helperArt(theme: LoadedTheme, index: number): ThemeArt {
  const helper = theme.helpers[((index % theme.helpers.length) + theme.helpers.length) % theme.helpers.length]

  return { id: theme.id, palette: theme.palette, ...(theme.marks !== undefined ? { marks: theme.marks } : {}), ...(theme.stuck !== undefined ? { stuck: theme.stuck } : {}), ...(helper !== undefined ? { helper } : {}) }
}

/** The art for the lead (the super duck's place): the theme's lead, or undefined to keep the ducks' own. */
export function leadArt(theme: LoadedTheme): ThemeArt | undefined {
  if (theme.lead === undefined) return undefined

  return { id: theme.id, palette: theme.palette, ...(theme.marks !== undefined ? { marks: theme.marks } : {}), lead: theme.lead }
}

/** Which helper (by place) owns a name; -1 when none does. */
export function helperOfName(theme: LoadedTheme, name: string): number {
  return theme.names.findIndex(list => list.includes(name))
}

/** Every helper name of the theme, taking one from each helper in turn so the first few differ. */
export function interleavedNames(theme: LoadedTheme): string[] {
  const longest = Math.max(0, ...theme.names.map(l => l.length))

  return Array.from({ length: longest }, (_, i) => theme.names.map(l => l[i])).flat().filter((n): n is string => n !== undefined)
}

/** The files that may be theme files in a folder listing: `*.theme.json` and `<folder>/duckherd-theme.json`. */
export function candidatesIn(dir: string, entries: readonly { name: string; kind: string }[]): string[] {
  const base = dir.replace(/\/+$/, '')

  return entries
    .filter(e => (e.kind === 'file' && e.name.endsWith('.theme.json')) || e.kind === 'dir')
    .map(e => (e.kind === 'dir' ? `${base}/${e.name}/${THEME_FILE}` : `${base}/${e.name}`))
    .sort()
}

/** The install folders of installed plugins other than `own`, from installed_plugins.json, each once. */
export function otherInstallRoots(json: string, own: string): string[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  const plugins = isObj(raw) && isObj(raw.plugins) ? raw.plugins : {}
  const roots: string[] = []
  for (const [key, entries] of Object.entries(plugins)) {
    if (key.split('@')[0] === own || !Array.isArray(entries)) continue
    for (const e of entries) if (isObj(e) && typeof e.installPath === 'string' && e.installPath !== '' && !roots.includes(e.installPath)) roots.push(e.installPath)
  }

  return roots
}

/** The folder of a file path (no trailing slash). */
export const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
