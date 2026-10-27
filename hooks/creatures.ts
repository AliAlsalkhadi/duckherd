// Each helper's duck, drawn in colour beside a running helper and at the top of its open card: one duck
// (no outline, warm rubber-duck colours) that acts out what its helper is doing now (dabbles while it
// searches, reads a page, pecks at a laptop, runs with a stopwatch, thinks); startles when a step fails;
// waves when it needs the person's OK; slows down when its helper goes quiet and dozes when it seems
// stuck; stops now and then to stretch, preen or shake (not when calm); spots a message you send; and
// jumps for a tick when its helper finishes, or droops under a rain cloud when it fails. A grown helper
// is one of six breeds, every other one wearing a bow, beanie, beret, cap or crown in its colour, and every duck can
// be drawn as a picture, every pixel its own colour, where the terminal shows pictures.
// Haiku helpers are ducklings.

import { base64, pngOf } from './png'

type HelperKind = 'review' | 'search' | 'code' | 'test' | 'other'

export const KIND_LABELS: Record<HelperKind, string> = { review: 'Review', search: 'Search', code: 'Code', test: 'Tests', other: 'Task' }

// A helper's title usually starts with what it does ("Fix…", "Re-check…", "Find…"), so the job word
// that comes first in it decides; whole words only, with their usual endings (fixes, checking).
const KIND_WORDS: [HelperKind, string][] = [
  ['review', 're-?check|review|verify|verifi|check|audit|confirm|inspect|double-check|sanity|independent|vet'],
  ['test', 'tests?|testing|ci|lint|render|benchmark|reproduce|repro|gate|smoke|run|start|restart|serve'],
  ['code', 'fix|write|implement|add|port|update|rewrite|refactor|build|change|make|create|edit|prototype|remove|rename|migrate|patch|wire|tighten|clean|cleanup|batch|save|seed|integrate|keep|move|split|merge|redesign|polish|commit|push|draft|switch|replace|convert'],
  ['search', 'find|search|look|list|read|explore|trace|locate|survey|investigate|map|scan|dig|collect|gather|summari[sz]e|where|count|capture|measure|compare'],
]
const KIND_PATTERNS = KIND_WORDS.map(([kind, stems]) => [kind, new RegExp(`\\b(${stems})(s|es|ed|d|ing|ly)?\\b`, 'i')] as const)

export function helperKind(text: string): HelperKind {
  let best: { kind: HelperKind; at: number } | undefined
  for (const [kind, pattern] of KIND_PATTERNS) {
    const at = pattern.exec(text)?.index
    if (at !== undefined && (best === undefined || at < best.at)) best = { kind, at }
  }

  return best?.kind ?? 'other'
}

// What a duck can be doing, each its own loop with its own prop.
export type DuckAction = 'dabble' | 'read' | 'type' | 'run' | 'think'

const KIND_ACTION: Record<HelperKind, DuckAction> = { search: 'dabble', review: 'read', code: 'type', test: 'run', other: 'think' }

// What a helper's title says it will do, for before it has taken a step.
export function actionOfKind(kind: HelperKind): DuckAction {
  return KIND_ACTION[kind]
}

// What a helper is doing now, from its latest step: the tool it called and the step's words.
export function actionOfStep(tool: string, text: string): DuckAction {
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return 'type'
  if (/^(Grep|Glob|WebSearch|WebFetch)$/.test(tool) || /^(Searching|Looking|Listing)\b/.test(text)) return 'dabble'
  if (tool === 'Read' || /^Reading\b/.test(text)) return 'read'
  if (tool === 'Bash') return 'run'

  return 'think'
}

// A frame: 20 x 12 pixels, a letter each ('.' clear), drawn as 10 cells by 3 rows of octants (2 x 4
// pixels a cell, in at most two colours, so small details sit in blocks of their own).
type Frame = readonly string[]
const CLEAR = '.'.repeat(20)
const blank = (): Frame => Array<string>(12).fill(CLEAR)
const put = (f: Frame, y: number, x: number, s: string): Frame => f.map((r, i) => (i === y ? r.slice(0, x) + s + r.slice(x + s.length) : r))
// Layers stack on the first one's own size (20 x 12 for the built-in ducks, 4 x that for a scale 4 theme).
const over = (...layers: Frame[]): Frame => {
  const h = layers[0]?.length ?? 12
  const w = layers[0]?.[0]?.length ?? 20

  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => layers.reduce((c, l) => ((l[y]?.[x] ?? '.') !== '.' ? (l[y]?.[x] ?? c) : c), '.')).join(''))
}
// A 1 x frame drawn at scale k: every pixel a k x k block.
const scaled = (f: Frame, k: number): Frame => (k === 1 ? f : f.flatMap(r => Array.from({ length: k }, () => [...r].map(c => c.repeat(k)).join(''))))
const shift = (f: Frame, dx: number, dy: number): Frame => f.map((row, y) => [...row].map((_, x) => f[y - dy]?.[x - dx] ?? '.').join(''))
const only = (f: Frame, from: number, to: number): Frame => f.map((r, i) => (i >= from && i <= to ? r : CLEAR))
const corner = (art: string[]): Frame => blank().map((r, i) => (art[i] !== undefined ? (art[i] + r).slice(0, 20) : r))

// The colours; x is the helper's own, swapped in per duck.
const DUCK_COLORS: Record<string, string> = {
  H: '#FFD43B', i: '#FFF6C4', w: '#FF9E80', f: '#FF8A3D', X: '#3A8A80',
  Y: '#FFD43B', h: '#FFF6C4', y: '#F2A93B', W: '#F7B733', v: '#E08E1B', k: '#2B1A10', e: '#FFFFFF', O: '#FF7B39', o: '#D9532A',
  L: '#FFE680', l: '#F5C451', B: '#3B82D6', b: '#9FD8FF', P: '#F4F4F4', p: '#9AA4B4', S: '#3A4252', s: '#59647A', c: '#7FE0C4',
  m: '#E58AC0', K: '#8A93A6', d: '#9A8E78', G: '#79C79B', C: '#7A8294', z: '#9FD8FF', a: '#E3A857', r: '#EE6A5A', x: '#B48EF0',
  // The super duck's headband, crest, aura (its edge, depth and tongues) and sparks; red with two
  // helpers running, blue with three or more.
  R: '#E5484D', N: '#A8323A', Q: '#FFC21A', U: '#FFE266', A: '#FFB830', u: '#FFF7CF', Z: '#C9F0FF',
  F: '#FF3D2E', T: '#FF6A55', E: '#D41F2A', t: '#FFD3C9',
  // Its hair: lit edge, shadow, glint; and in red.
  V: '#FFE680', M: '#D98E0A', n: '#FFFBEA', g: '#FF8A70', D: '#A8141C',
  q: '#3FA9F5', J: '#5EC8FF', I: '#2E8FE0', j: '#D2F2FF',
}

// A bird: its head, body and feet apart, so a pose can move them; where its eye is, to close it.
type Bird = {
  head: Frame
  body: Frame
  feet: Frame
  eye: { y: number; x: number; lid: string }
  legs: Frame[]
  quack?: (f: Frame, dy: number) => Frame
  tip?: Frame
  wing?: Frame
  // Its wing lifted, half or right up (a grown duck's wing, a duckling's stub).
  lift?: (f: Frame, up: boolean) => Frame
  // Its tail-up dabble, and the same with a foot kicked (a duckling's own; a grown duck kicks nothing).
  kick?: Frame
  // The most its head may drop and keep its face on whole cells; how far it can rise with clear rows
  // above its head (hat and all); how far it sits up in the water.
  nod: number
  headroom: number
  float: number
  // How far it moves left to sit at the laptop or behind a page, in whole blocks.
  desk: number
  page: number
}

function birdFrom(standing: Frame, headTo: number, eye: Bird['eye'], legs: string[], extra: Partial<Bird> = {}): Bird {
  const feet = only(standing, 11, 11)

  return { head: only(standing, 0, headTo), body: only(standing, headTo + 1, 10), feet, eye, legs: legs.map(l => put(blank(), 11, 0, l)), desk: -2, page: 0, nod: 99, headroom: 0, float: 0, ...extra }
}

const GROWN = [
  '...........HHHH.....',
  '..........HiiHHH....',
  '.........HiiHHkeH...',
  '.........HHHHwkkOOOO',
  '.........HHHHHHoooo.',
  '..YY......YYYYYY....',
  '..YYLY.YLLLLYYYYY...',
  '...YYYYWWWWWWYYYYY..',
  '...YYvWWvWWvWWYYYY..',
  '...yYYvWWvWWvYYYyy..',
  '....yyyyyyyyyyyyy...',
  '......ff.....ff.....',
]
const WALKING = ['......ff...ff.......', '....ff.....ff.......', '........ffff........', '.....ff......ff.....']
const TIPPED = over(['....................', '...Y................', '...YY...............', '...YYYY.............', '...YYYYYY...........',
  '....YhYYYYY.........', '....YWWvWYYYY.......', '.....YWWWWYYYYY.....'])
const RAISED_WING = corner(['..WW', '..WWW', '...WWW', '...WWWW', '....WWWW', '.....WWW'])
// Its wing lifted:
// the folded wing comes off its side, half up, then right up with its feather tips, joined at the
// shoulder, behind its head, lit on its leading edge. One wing, never two.
const WING_HALF = ['', '', '', '.......WW', '.....WWWWW', '....LWWvWWW', '.....LLWWW']
const WING_UP = ['...W.W', '...WWWW.W', '....WWvWW', '....LWWvWW', '.....LWWWW', '......LWWW', '........WW']
function lifted(f: Frame, art: string[]): Frame {
  const rows = f.map((r, y) => [...r].map(c => (y >= 6 && y <= 9 && (c === 'W' || c === 'v') ? (y === 7 ? 'L' : 'Y') : c)))
  art.forEach((r, y) => [...r].forEach((c, x) => {
    const row = rows[y]
    if (c !== '.' && row !== undefined && x < row.length) row[x] = c
  }))

  return rows.map(r => r.join(''))
}
const grownQuack = (f: Frame, dy: number) => put(put(put(f, 2 + dy, 16, 'OOO'), 3 + dy, 16, '....'), 4 + dy, 15, 'oooo')
// A grown duck wears a scarf in its helper's colour.
// What a helper's duck may wear, in its colour (x, a darker x for its shade): on the crown, over the head.
export type Wear = 'beanie' | 'bow' | 'beret' | 'cap' | 'crown'
function wearing(f: Frame, wear?: Wear): Frame {
  if (wear === undefined) return f
  const g = f.map(r => [...r])
  const set = (y: number, x: number, c: string) => {
    const row = g[y]
    if (row !== undefined) row[x] = c
  }
  for (const [y, x] of [[1, 11], [1, 12], [2, 10], [2, 11]] as const) if (g[y]?.[x] === 'i') set(y, x, 'H')
  // A beanie with a lit crown and a ribbed cuff.
  if (wear === 'beanie') {
    for (let x = 11; x <= 14; x++) set(0, x, 'x')
    set(0, 12, 'P')
    set(0, 13, 'P')
    for (let x = 10; x <= 15; x++) set(1, x, x % 2 === 0 ? 'X' : 'x')
  }
  // A bow at the back of the head: two loops, their tips shaded, tied by a knot.
  if (wear === 'bow') {
    for (const x of [8, 9, 11, 12]) set(0, x, 'x')
    for (const x of [9, 11]) set(1, x, 'x')
    for (const x of [8, 10, 12]) set(1, x, 'X')
    set(0, 10, 'X')
  }
  // A beret tipped back, lit on top, its brim drooping behind.
  if (wear === 'beret') {
    for (let x = 10; x <= 15; x++) set(0, x, 'x')
    set(0, 12, 'P')
    set(1, 9, 'x')
    for (let x = 10; x <= 14; x++) set(1, x, 'X')
  }
  // A cap, lit on top, its brim out over the bill.
  if (wear === 'cap') {
    for (let x = 11; x <= 14; x++) set(0, x, 'x')
    set(0, 12, 'P')
    for (let x = 10; x <= 17; x++) set(1, x, 'X')
  }
  // A gold crown, whatever the helper's colour: three points and a red jewel.
  if (wear === 'crown') {
    for (const x of [10, 12, 14]) set(0, x, 'Q')
    set(0, 12, 'U')
    for (let x = 10; x <= 14; x++) set(1, x, 'Q')
    set(1, 12, 'r')
  }
  return g.map(r => r.join(''))
}
// A duckling's wear, sized for its head: a bow beside its tuft, a little beanie, or the eggshell it
// hatched from (for a beret or a crown).
function ducklingWearing(f: Frame, wear?: Wear): Frame {
  if (wear === undefined) return f
  const g = f.map(r => [...r])
  const set = (y: number, x: number, c: string) => {
    const row = g[y]
    if (row !== undefined) row[x] = c
  }
  if (wear === 'bow') {
    for (const y of [1, 2, 3]) set(y, 10, 'x')
    set(2, 11, 'X')
  } else if (wear === 'beanie' || wear === 'cap') {
    for (let x = 11; x <= 14; x++) set(2, x, 'x')
    set(2, 12, 'P')
    for (let x = 10; x <= 15; x++) set(3, x, x % 2 === 0 ? 'X' : 'x')
  } else {
    for (let x = 9; x <= 15; x++) set(2, x, x % 2 === 0 ? '.' : 'P')
    for (const x of [10, 11, 13, 14]) set(3, x, 'P')
    set(3, 12, 'x')
  }
  return g.map(r => r.join(''))
}
const duckWearing = (wear?: Wear) => birdFrom(wearing(GROWN, wear), 4, { y: 2, x: 14, lid: 'HH' }, WALKING, { quack: grownQuack, tip: TIPPED, wing: RAISED_WING, lift: (f, up) => lifted(f, up ? WING_UP : WING_HALF) })
const DUCK = duckWearing()
// A duckling's stub wing, half and right up behind its head, its folded wing lit as it lifts; and its
// tail-up dabble, a foot kicking.
const DUCKLING_WING_HALF = ['', '', '', '', '', '', '........ll', '.......llll', '........ll']
const DUCKLING_WING_UP = ['', '', '', '.....l', '.....ll', '......ll', '.......lll', '........ll']
const ducklingLifted = (f: Frame, up: boolean): Frame =>
  over(f.map((r, y) => (y === 8 || y === 9 ? r.replace(/l/g, 'L') : r)), corner(up ? DUCKLING_WING_UP : DUCKLING_WING_HALF))
const DUCKLING_TIPPED = corner(['', '', '', '.....L....O', '.....LL..LLO', '......LLLLLLL', '......LLLLlLLL', '.......LLLLLLL'])
const DUCKLING_KICK = corner(['', '', '', '.....L.....O', '.....LL..LL', '......LLLLLLL', '......LLLLlLLL', '.......LLLLLLL'])
// A duckling: big head with a tuft (in its helper's colour), little body; Haiku helpers are ducklings.
const ducklingIn = (wear?: Wear) => birdFrom(
  ducklingWearing([
    CLEAR,
    CLEAR,
    '............xx......',
    '..........LLxLL.....',
    '.........LhhLLLL....',
    '.........LhLLLke....',
    '.........LLLwLkkOO..',
    '.....L....LLLLLL....',
    '.....LLL.LLlLLLLL...',
    '.....LLLLLlllLLLL...',
    '......lllllllllll...',
    '.........OO..OO.....',
  ], wear),
  6,
  { y: 5, x: 14, lid: 'LL' },
  ['........OO...OO.....', '.......OO.....OO....', '..........OOOO......', '.........OO..OO.....'],
  { desk: -4, page: -2, nod: 1, headroom: 1, float: -1, lift: ducklingLifted, tip: DUCKLING_TIPPED, kick: DUCKLING_KICK },
)
const DUCKLING = ducklingIn()

type Pose = { headDx?: number; headDy?: number; bodyDy?: number; feet?: Frame }
// The head drops no further than its nod, so a duckling's eye and bill stay on one cell row.
const pose = (b: Bird, p: Pose = {}): Frame =>
  over(shift(b.body, 0, p.bodyDy ?? 0), shift(b.head, p.headDx ?? 0, Math.min(b.nod, (p.headDy ?? 0) + (p.bodyDy ?? 0))), p.feet ?? b.feet)
const shut = (b: Bird, f: Frame, dy = 0, dx = 0): Frame => {
  const y = Math.min(b.nod, dy)
  return put(put(f, b.eye.y + y, b.eye.x + dx, b.eye.lid), b.eye.y + 1 + y, b.eye.x + dx, 'kk')
}

// Water from row 8 down, its crests rolling right a pixel a frame; a duck afloat sits in it.
const water = (t: number): Frame => {
  const crests = (gap: number) => Array.from({ length: 20 }, (_, x) => (((x - t + gap) % 7) + 7) % 7)
  return [...Array<string>(8).fill(CLEAR), crests(0).map(n => (n < 2 ? 'b' : 'B')).join(''), crests(4).map(n => (n === 0 ? 'b' : 'B')).join(''), 'B'.repeat(20), 'B'.repeat(20)]
}
const afloat = (f: Frame, t: number, rise = 0): Frame => over(water(t), only(shift(f, 0, rise), 0, 7))

// Props, each in blocks of its own at the top left (or the right, for the page and laptop).
const page = (lines: string[]): Frame => blank().map((r, i) => (i >= 3 && i <= 10 ? `${r.slice(0, 16)}${lines[i - 3] ?? '....'}` : r))
const PAGE = page(['PPPP', 'PppP', 'PPPP', 'PppP', 'PPPP', 'PpPP', 'PPPP', 'PPPP'])
const NEXT_PAGE = page(['PPPP', 'PPPP', 'PppP', 'PPPP', 'PppP', 'PPPP', 'PpPP', 'PPPP'])
const PAGE_EDGE = page(Array<string>(8).fill('.PP.'))
const LAPTOP: Frame = [CLEAR, '...............SSSSS', '...............S...S', '...............S...S', '...............S...S', '...............SSSSS', '................s...', '.............KKKKKKK', CLEAR, CLEAR, CLEAR, CLEAR]
const CODE = ['cc.', 'mc.', 'cmc', 'c..', 'mm.', 'cc.', 'c.m', 'mc.']
const screen = (t: number): Frame => over(LAPTOP, [CLEAR, ...[0, 1, 2, 3].map(i => `................${CODE[(t + i) % CODE.length]}.`), ...Array<string>(7).fill(CLEAR)])
const STOPWATCH: Frame = corner(['..PP', '.PPPP', '.PPPP', '..PP'])
const stopwatch = (t: number): Frame => {
  const [y, x] = ([[0, 2], [1, 3], [2, 2], [1, 1]] as const)[t % 4] ?? [0, 2]
  return put(put(STOPWATCH, y, x, 'k'), 1, 2, 'k')
}
const speedLines = (t: number): Frame => put(put(put(blank(), 6, 0, t % 2 ? 'dd' : '.d'), 8, 0, t % 2 ? '.d' : 'dd'), 10, 0, t % 2 ? 'dd' : '.d')
const bubble = (n: number): Frame => [2, 4, 6].slice(0, n).reduce((f, x) => put(put(f, 1, x, 'p'), 2, x, 'p'), corner(['.PPPPPPP', 'PPPPPPPP', 'PPPPPPPP', '.PPPPPPP']))
const PUFF = corner(['', '.....PP', '.....PP'])
const TICK = corner(['.....GG.', '....GG..', 'GG.GG...', '.GGG....'])
const HALF_TICK = corner(['', '', 'GG......', '.GG.....'])
const rain = (t: number): Frame => corner(['.CCCCCC.', 'CCCCCCCC', 'CCCCCCCC', t % 2 ? '..CbbC..' : '..bCCb..'])
const sleepZ = (t: number): Frame => {
  const x = [0, 2, 4, 5][t % 4] ?? 0
  return ['zzz', '..z', '.z.', 'zzz'].reduce((f, r, i) => put(f, i, x, r), blank())
}
const ENVELOPE = ['PPPP', 'pPPp', 'PppP', 'PPPP']
const envelope = (x: number): Frame => ENVELOPE.reduce((f, r, i) => put(f, i, x, r), blank())
const NOTICED = corner(['......a.', '......a.', '', '......a.'])
const STARTLED = corner(['......r.', '......r.', '', '......r.'])
const QUESTION = corner(['.aa.', 'a..a', '..a.', '.a..', '', '.a..'])
const DROPS: Frame = [CLEAR, CLEAR, '..b...............b.', CLEAR, 'b..................b', ...Array<string>(7).fill(CLEAR)]

type Loop = { frames: Frame[]; frameMs: number }

// ---------------------------------------------------------------- themes from outside

// Another set of creatures, drawn from a theme file (hooks/themes.ts reads and checks it). Frames are the
// ducks' size unless the theme sets its own (helpers 20 x 12, the lead's 28 x 16, times the scale), a letter a pixel, '.' clear; `palette` says what each
// letter is. The panel hands each drawing only the one helper's art it needs, so what crosses to the terminal's
// own duck view stays small.
export type ThemeEnds = {
  done: Frame
  failed: Frame
  cheer: Frame[]
  droop: Frame[]
  asleep: Frame[]
  idle: Frame[]
  // A second idle moment, alternating with `idle` (the first when absent).
  idleMove?: Frame[]
  flinch: Frame[]
  wave: Frame[]
  noticed: Frame[]
}
export type ThemeHelperArt = {
  name: string
  // Letters this helper alone uses, over the theme's palette.
  colors?: Record<string, string>
  // The pair of eye letters and the letter that closes them, for the blink while it works.
  blink?: [string, string]
  loops: Record<DuckAction, Loop>
  ends: ThemeEnds
}
export type ThemeLeadArt = {
  rest: Frame[]
  rising: Frame[]
  // The lead at work by how many helpers run: one level for 0 or 1 helpers, up to four.
  levels: Frame[][]
  // Cells drawn over the frame while helpers run, [row, column, letter], by step (small), and more with three or more (big).
  flare?: { small: [number, number, string][][]; big: [number, number, string][][] }
}
export type ThemeMarks = { star: string; starLit: string; drop: string; dropLit: string; asked: string; told: string }
export type ThemeArt = {
  id: string
  // Pixels per 1 x pixel (absent is 1): at 4 the frames are four times as wide and tall, drawn into the same space.
  scale?: number
  palette: Record<string, string>
  // The letters of the marks drawn over a helper (an Opus star, a stuck helper's drop, "?" and "!"), from the palette.
  marks?: ThemeMarks
  // False: no star on Opus helpers.
  opusMark?: false
  // Where a stuck helper's sweat drop (row, column) and "!" or "?" (column) go.
  stuck?: { drop: [number, number]; mark: number }
  helper?: ThemeHelperArt
  lead?: ThemeLeadArt
}
const themeKey = (t: ThemeArt | undefined) => (t === undefined ? '' : `${t.id}/${t.helper?.name ?? ''}`)
export const scaleOf = (t: ThemeArt | undefined) => t?.scale ?? 1

// The panel redraws the ducks every BEAT; every frame lasts a whole number of beats, so none is shown
// longer than its neighbours (uneven frames read as lag).
const BEAT = 150

// Each action's loop for a bird, built from its poses and props.
function actions(b: Bird): Record<DuckAction, Loop> {
  const toDesk = (f: Frame) => shift(f, b.desk, 0).map(r => `${r.slice(0, 15)}.....`)
  const atDesk = (p: Pose) => toDesk(pose(b, p))
  const reading = (p: Pose, sheet: Frame) => over(shift(pose(b, p), b.page, 0), sheet)
  const swim = (f: Frame, t: number) => afloat(f, t, b.float)
  const kick = b.kick ?? b.tip
  const dip = b.tip !== undefined && kick !== undefined ? [over(water(4), b.tip), over(water(5), put(put(kick, 6, 15, 'b'), 4, 17, 'b')), over(water(6), put(put(b.tip, 4, 15, 'b'), 2, 17, 'b')), over(water(7), kick)] : [swim(pose(b, { headDy: 1 }), 4), swim(pose(b, { headDy: 1, bodyDy: 1 }), 5), swim(pose(b, { headDy: 1 }), 6), swim(pose(b), 7)]

  return {
    // Bobs, leans in, tips right under (tail up, bubbles), pops back up with a splash.
    dabble: {
      frameMs: BEAT * 2,
      frames: [swim(pose(b), 0), swim(pose(b, { bodyDy: 1 }), 1), swim(pose(b), 2), swim(pose(b, { headDy: 2 }), 3), ...dip,
        over(swim(pose(b, { bodyDy: 1 }), 8), corner(['', '', '..b', '.b', 'b'])), swim(pose(b), 9), swim(pose(b, { bodyDy: 1 }), 10), swim(pose(b), 11)],
    },
    // Reads a page, nodding along it, blinks, flips the page.
    read: {
      frameMs: BEAT * 2,
      frames: [reading({}, PAGE), reading({ headDy: 1 }, PAGE), reading({ headDy: 2 }, PAGE), reading({ headDy: 2 }, PAGE), reading({ headDy: 1 }, PAGE),
        over(shift(shut(b, pose(b)), b.page, 0), PAGE),
        reading({}, PAGE), reading({}, PAGE_EDGE), reading({}, NEXT_PAGE), reading({ headDy: 1 }, NEXT_PAGE), reading({ headDy: 2 }, NEXT_PAGE), reading({}, NEXT_PAGE)],
    },
    // Pecks hard at the keys while code scrolls up the screen.
    type: {
      frameMs: BEAT,
      frames: [over(atDesk({}), screen(0)), over(atDesk({ headDy: 2 }), screen(1)), over(atDesk({}), screen(1)), over(atDesk({ headDy: 2 }), screen(2)),
        over(atDesk({}), screen(3)), over(atDesk({ headDy: 1 }), screen(3)), over(toDesk(shut(b, pose(b))), screen(3)), over(atDesk({ headDy: 2 }), screen(4))],
    },
    // Runs on the spot, bobbing, speed lines behind and a stopwatch ticking.
    run: {
      frameMs: BEAT,
      frames: [0, 1, 2, 3, 4, 5, 6, 7].map(t => over(speedLines(t), stopwatch(Math.floor(t / 2)), pose(b, { headDy: t % 2, bodyDy: t % 2, feet: b.legs[t % 4] }))),
    },
    // Thinks (a bubble fills with dots), crouches, pops up with a quack.
    think: {
      frameMs: BEAT * 2,
      frames: [pose(b), pose(b), shut(b, pose(b)), pose(b), over(pose(b), PUFF), over(pose(b), bubble(0)), over(pose(b), bubble(1)), over(pose(b), bubble(2)),
        over(pose(b), bubble(3)), over(pose(b), bubble(3)), over(pose(b, { headDy: 2, bodyDy: 1 }), b.feet),
        ...(b.quack !== undefined ? [b.quack(pose(b), 0), b.quack(pose(b), 0)] : [pose(b, { headDy: 1 }), pose(b)]), pose(b, { headDy: 1 }), pose(b), pose(b)],
    },
  }
}

// What a bird does when its helper finishes, and the pose it rests in after.
function endings(b: Bird) {
  const happy = shut(b, pose(b))
  // Up off its shadow: the body lifts, the head as far as the clear rows above it allow (never cut off).
  const airborne = put(pose(b, { bodyDy: -1, headDy: 1 - b.headroom, feet: blank() }), 11, 6, 'dddddddd')
  const crouch = over(pose(b, { headDy: 1, bodyDy: 1 }), b.feet)
  const flapping = (up: boolean) => (b.lift !== undefined ? b.lift(shut(b, airborne, -b.headroom), up) : airborne)
  const sad = pose(b, { headDy: 2 })

  return {
    done: over(happy, TICK),
    failed: over(sad, rain(0)),
    // Crouch, hop up flapping, land in a crouch, the tick draws in.
    cheer: [crouch, flapping(true), flapping(false), crouch, over(happy, HALF_TICK), over(happy, TICK), over(happy, TICK), over(happy, TICK)],
    // The head sinks and a cloud rolls in to rain on it.
    droop: [pose(b, { headDy: 1 }), sad, over(sad, rain(0)), over(sad, rain(1)), over(sad, rain(0)), over(sad, rain(1)), over(sad, rain(0)), over(sad, rain(1))],
    // Eyes shut, head nodding, z's drifting up: quiet so long it may be stuck.
    asleep: [0, 1, 2, 3].map(t => over(shut(b, pose(b, { headDy: t < 2 ? 1 : 2 }), t < 2 ? 1 : 2), sleepZ(t))),
    // Now and then, between loops: a wing stretch, a preen, a shake.
    idle: [
      b.lift !== undefined
        ? [b.lift(pose(b), false), b.lift(pose(b), true), b.lift(pose(b), true), b.lift(pose(b), false), pose(b), b.lift(pose(b), false), b.lift(pose(b), true), b.lift(pose(b), false), pose(b)]
        : [pose(b, { headDy: 1 }), pose(b), pose(b, { headDy: 1 }), pose(b)],
      [pose(b, { headDy: 1 }), pose(b, { headDx: -2, headDy: 3 }), pose(b, { headDx: -2, headDy: 3 }), pose(b, { headDx: -2, headDy: 2 }), pose(b, { headDy: 1 }), pose(b)],
    ],
    shake: [shift(pose(b), -2, 0), over(shift(pose(b), 2, 0), DROPS), shift(pose(b), -2, 0), over(shift(pose(b), 2, 0), DROPS), pose(b)],
    // A step failed: it startles, jolting side to side under a red "!".
    flinch: [shift(pose(b), -2, 0), over(shift(pose(b), 2, 0), STARTLED), over(shift(pose(b), -2, 0), STARTLED), over(pose(b, { headDy: 1 }), STARTLED), over(pose(b), STARTLED)],
    // Waiting for the person's OK: it waves (a duckling bobs its head) under an amber "?".
    wave: b.lift !== undefined
      ? [over(b.lift(pose(b), true), QUESTION), over(b.lift(pose(b), false), QUESTION), over(b.lift(pose(b), true), QUESTION), over(b.lift(pose(b), false), QUESTION)]
      : [over(pose(b, { headDy: 1 }), QUESTION), over(pose(b), QUESTION)],
    // A message lands: the duck spots it and hops, a "!" pops up.
    noticed: [over(pose(b), envelope(4)), over(airborne, NOTICED), over(crouch, NOTICED), over(pose(b), NOTICED), pose(b)],
  }
}

// Built the first time it's asked for, not as the file loads: the terminal draws each duck with this
// file too (duck-view.tsx), and must load it within a second.
const once = <T,>(make: () => T) => {
  let made: T | undefined

  return () => (made ??= make())
}

const BIRDS = { duck: DUCK, duckling: DUCKLING } as const
type BirdKind = keyof typeof BIRDS
const LOOPS = { duck: once(() => actions(DUCK)), duckling: once(() => actions(DUCKLING)) }
const ENDINGS = { duck: once(() => endings(DUCK)), duckling: once(() => endings(DUCKLING)) }

// Every loop and pose, for the tests to hold to the size and colours.
export function duckFrames(): Frame[] {
  return [
    ...[LOOPS.duck(), LOOPS.duckling()].flatMap(l => Object.values(l).flatMap(a => a.frames)),
    ...[ENDINGS.duck(), ENDINGS.duckling()].flatMap(e => [e.done, e.failed, ...e.cheer, ...e.droop, ...e.asleep, ...e.idle.flat(), ...e.shake, ...e.flinch, ...e.wave, ...e.noticed]),
  ]
}
export const DUCK_PALETTE = DUCK_COLORS

// How long a finished helper's duck reacts, and a message takes to land, before things settle.
export const REACT_MS = BEAT * 2 * 8
export const NOTE_MS = BEAT * 2 * 8
// How quiet a helper is (since its last step ended) before its duck slows down, then dozes off.
export const SLOW_MS = 40000
export const ASLEEP_MS = 180000
// How long a duck startles after a step fails.
export const FLINCH_MS = BEAT * 5
const IDLE_EVERY_MS = 9000

// What to draw for one duck now.
export type DuckScene = {
  at: number
  bird: BirdKind
  action: DuckAction
  // The helper's id, so ducks of the same job don't move in step; its colour for the scarf or tuft.
  seed?: string
  color?: string
  // How long since its last step ended; since your last message; since it finished, and how.
  quietMs?: number
  noteMs?: number
  ended?: { ok: boolean; ms: number }
  // Since its last step failed; whether it waits for the person's OK; the person's calm setting.
  failedMs?: number
  isAsking?: boolean
  isCalm?: boolean
  // Still (its first frame) when false.
  isMoving?: boolean
  // Which breed a grown duck is (BREEDS), and what it wears on its crown.
  breed?: number
  wear?: Wear
  // On Opus: a small gold star by it, so the costly ones show at a glance.
  isOpus?: boolean
  // Taken for stuck: asked where it is (a sweat drop and an amber "?"), or the lead duck told (a red "!").
  stuck?: 'asked' | 'told'
  // A theme's art for this helper in place of the duck (a theme file's; ducks are the built-in one).
  theme?: ThemeArt
}

const startOf = (seed: string | undefined) => [...(seed ?? '')].reduce((n, ch) => (n * 31 + (ch.codePointAt(0) ?? 0)) % 100003, 0)
const frameAt = (loop: Loop, at: number, start = 0, slower = 1) => loop.frames[(Math.floor(at / (loop.frameMs * slower)) + start) % loop.frames.length] ?? loop.frames[0] ?? blank()

// A duck's or duckling's loops and endings with what it wears; built the first time one wears it.
const WORN = new Map<string, { loops: Record<DuckAction, Loop>; ends: ReturnType<typeof endings> }>()
function kitOf(s: DuckScene) {
  const art = s.theme?.helper
  if (art !== undefined) return { loops: art.loops, ends: { ...art.ends, idle: [art.ends.idle, art.ends.idleMove ?? art.ends.idle], shake: art.ends.idle } as unknown as ReturnType<typeof endings> }
  if (s.wear === undefined) return { loops: LOOPS[s.bird](), ends: ENDINGS[s.bird]() }
  const key = `${s.bird}|${s.wear}`
  let kit = WORN.get(key)
  if (kit === undefined) {
    const b = s.bird === 'duck' ? duckWearing(s.wear) : ducklingIn(s.wear)
    kit = { loops: actions(b), ends: endings(b) }
    WORN.set(key, kit)
  }

  return kit
}

function pick(s: DuckScene): Frame {
  const kit = kitOf(s)
  const loop = kit.loops[s.action]
  const end = kit.ends
  if (s.ended !== undefined) {
    const steps = s.ended.ok ? end.cheer : end.droop
    if (s.ended.ms < REACT_MS) return steps[Math.min(steps.length - 1, Math.floor(s.ended.ms / (REACT_MS / steps.length)))] ?? end.done
    return s.ended.ok ? end.done : end.failed
  }
  if (s.isMoving === false) return loop.frames[0] ?? blank()
  if (s.isAsking === true) return frameAt({ frames: end.wave, frameMs: BEAT * 2 }, s.at)
  const quiet = s.quietMs ?? 0
  if (quiet >= ASLEEP_MS) return frameAt({ frames: end.asleep, frameMs: BEAT * 4 }, s.at)
  const start = startOf(s.seed)
  if (s.noteMs !== undefined && s.noteMs < NOTE_MS) {
    // The envelope flies in over what it's doing, a block at a time, then the duck spots it.
    const flying = Math.floor(s.noteMs / (BEAT * 2))
    if (flying < 3) return over(frameAt(loop, s.at, start), scaled(envelope(flying * 2), scaleOf(s.theme)))
    return end.noticed[Math.min(end.noticed.length - 1, flying - 3)] ?? pose(BIRDS[s.bird])
  }
  if (s.failedMs !== undefined && s.failedMs < FLINCH_MS) return end.flinch[Math.min(end.flinch.length - 1, Math.floor(s.failedMs / (FLINCH_MS / end.flinch.length)))] ?? pose(BIRDS[s.bird])
  // Calm (the person's choice): half speed, no idle moments.
  if (s.isCalm === true) return blinking(s, frameAt(loop, s.at, start, quiet >= SLOW_MS ? 4 : 2), start)
  // Every so often (at its own moment) it stops for a stretch, a preen, or a shake on the water.
  const into = (s.at + start * 97) % IDLE_EVERY_MS
  const round = Math.floor((s.at + start * 97) / IDLE_EVERY_MS)
  const clip = s.action !== 'dabble' || s.theme?.helper !== undefined ? (end.idle[round % end.idle.length] ?? []) : end.shake.map((f, t) => afloat(f, t, BIRDS[s.bird].float))
  if (quiet < SLOW_MS && into < clip.length * BEAT) return clip[Math.floor(into / BEAT)] ?? loop.frames[0] ?? blank()

  return blinking(s, frameAt(loop, s.at, start, quiet >= SLOW_MS ? 2 : 1), start)
}

// A themed helper blinks now and then as it works, each at its own moment: the pair of eye letters in the
// head's rows closed for a beat.
const BLINK_EVERY_MS = 3300
function blinking(s: DuckScene, frame: Frame, start: number): Frame {
  const blink = s.theme?.helper?.blink
  if (blink === undefined || (s.at + start * 53) % BLINK_EVERY_MS >= BEAT) return frame
  const [eye, lid] = blink

  const head = 8 * scaleOf(s.theme) // the head's rows: the top 8 pixels of a 1 x frame, whatever its size

  return frame.map((row, y) => (y < head ? row.split(eye + eye).join(lid + lid) : row))
}

// One row of a drawing, as runs of one style each.
export type Run = { text: string; color?: string; backgroundColor?: string }

// How wide a duck is, in cells (a theme may set its own frame size: themes.ts helperColumns).
export const CREATURE_WIDTH = 10

// The octant for each set of lit pixels (bit 2y + x of a cell's 2 x 4): the octant block in order,
// except where an older block or quadrant character already draws that shape.
const SHAPES: Record<number, number> = {
  0: 0x20, 1: 0x1cea8, 2: 0x1ceab, 3: 0x1fb82, 5: 0x2598, 10: 0x259d, 15: 0x2580, 20: 0x1fbe6, 40: 0x1fbe7, 63: 0x1fb85, 64: 0x1cea3,
  80: 0x2596, 85: 0x258c, 90: 0x259e, 95: 0x259b, 128: 0x1cea0, 160: 0x2597, 165: 0x259a, 170: 0x2590, 175: 0x259c, 192: 0x2582,
  240: 0x2584, 245: 0x2599, 250: 0x259f, 252: 0x2586, 255: 0x2588,
}
const OCTANTS: string[] = []
for (let mask = 0, next = 0x1cd00; mask < 256; mask++) OCTANTS.push(String.fromCodePoint(SHAPES[mask] ?? next++))

// The panel's background, for picking the nearest colour to a clear pixel.
const BACKGROUND = '#0D0F12'
const distance = (a: string, b: string) =>
  [1, 3, 5].reduce((sum, i) => sum + (parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) ** 2, 0)

// One cell: its 8 pixels' colours (undefined clear) in at most two, the fewest-used folded into the nearest kept.
function cell(pixels: (string | undefined)[]): Run {
  const counts = new Map<string | undefined, number>()
  for (const p of pixels) counts.set(p, (counts.get(p) ?? 0) + 1)
  let kept = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (a === undefined ? 1 : 0) - (b === undefined ? 1 : 0)).slice(0, 2)
  const clear = counts.get(undefined) ?? 0
  if (counts.size > 2 && clear > 0 && !kept.includes(undefined) && clear >= Math.min(...kept.map(k => counts.get(k) ?? 0))) kept = [kept[0], undefined]
  const nearest = (p: string | undefined) => (kept.includes(p) ? p : kept.reduce((best, k) => (distance(p ?? BACKGROUND, k ?? BACKGROUND) < distance(p ?? BACKGROUND, best ?? BACKGROUND) ? k : best)))
  const [color, backgroundColor] = kept.filter((k): k is string => k !== undefined)
  let mask = 0
  pixels.forEach((p, i) => {
    if (color !== undefined && nearest(p) === color) mask |= 1 << i
  })
  return { text: OCTANTS[mask] ?? ' ', ...(color !== undefined && mask > 0 ? { color } : {}), ...(backgroundColor !== undefined && mask < 255 ? { backgroundColor } : {}) }
}

// The breeds a grown helper duck comes in: what each
// recolours of the classic yellow duck. Head H and its light i, body Y, its light L and shade y, wing W
// and its mark v, bill O and o, feet f, cheek w (only the yellow and white ducks blush).
export const BREEDS: { name: string; colors: Record<string, string> }[] = [
  { name: 'Classic', colors: {} },
  { name: 'Mallard', colors: { H: '#2F6E4C', i: '#5A9C78', h: '#A8957F', Y: '#8C7764', L: '#A8957F', y: '#61503F', W: '#A9A8A2', v: '#4A6CC0', O: '#D9B84A', o: '#AE8F2E', f: '#E8823A', w: '#2F6E4C' } },
  { name: 'Mallard hen', colors: { H: '#9C7D5E', i: '#C2A687', h: '#B09272', Y: '#937352', L: '#B09272', y: '#67503B', W: '#86694E', v: '#4A6CC0', O: '#D98A3E', o: '#A5612A', f: '#E8823A', w: '#9C7D5E' } },
  { name: 'Pekin', colors: { H: '#F3EFE4', i: '#FFFFFF', h: '#FFFFFF', Y: '#F3EFE4', L: '#FFFFFF', y: '#D3CAB8', W: '#E6E0D3', v: '#C8BFAC', O: '#F2994A', o: '#C7702C', f: '#F2994A', w: '#F7C3B0' } },
  { name: 'Khaki', colors: { H: '#7C7150', i: '#A39878', h: '#C9B189', Y: '#B59A6E', L: '#C9B189', y: '#86704C', W: '#A58A62', v: '#6E5A3E', O: '#6B6A4E', o: '#4E4D38', f: '#B0763C', w: '#7C7150' } },
  { name: 'Black', colors: { H: '#4A514C', i: '#7A9C88', h: '#5E6661', Y: '#4A514C', L: '#5E6661', y: '#323733', W: '#555C57', v: '#3E6A55', O: '#3F4140', o: '#2C2E2D', f: '#3F4140', w: '#4A514C' } },
]
// What the helper wears comes in its colour, its shade a little darker.
const darker = (hex: string) =>
  `#${[1, 3, 5].map(at => Math.round((parseInt(hex.slice(at, at + 2), 16) || 0) * 0.7).toString(16).padStart(2, '0')).join('')}`
const paletteOf = (color: string, breed = 0, theme?: ThemeArt): Record<string, string> =>
  theme !== undefined ? { ...theme.palette, ...(theme.helper?.colors ?? {}) } : { ...DUCK_COLORS, ...(BREEDS[breed]?.colors ?? {}), x: color, X: darker(color) }

// A duck as drawn now: its frame, in its helper's colour and breed.
export type Drawing = { frame: Frame; color: string; breed?: number; theme?: ThemeArt }

// The same duck as a picture, every pixel its own colour. A PNG, each pixel 8 x 8 so the
// terminal shows it crisp, base64; made once a frame.
const pictures = new Map<string, string>()
export function pictureOf(d: Drawing): string {
  const key = `${themeKey(d.theme)}|${d.color}|${d.breed ?? 0}|${d.frame.join('')}`
  const hit = pictures.get(key)
  if (hit !== undefined) return hit
  const palette = paletteOf(d.color, d.breed, d.theme)
  const letters = ['.']
  const pixels: number[] = []
  for (const row of d.frame) {
    for (const c of row) {
      if (c === '.' || palette[c] === undefined) {
        pixels.push(0)
        continue
      }
      let at = letters.indexOf(c)
      if (at < 0) at = letters.push(c) - 1
      pixels.push(at)
    }
  }
  const png = base64(pngOf(d.frame[0]?.length ?? 0, d.frame.length, pixels, letters.map(c => (c === '.' ? '#000000' : (palette[c] ?? '#000000'))), 8 / scaleOf(d.theme)))
  if (pictures.size > 3000) pictures.clear()
  pictures.set(key, png)

  return png
}

const drawn = new Map<string, Run[][]>()

// A frame as 3 rows of octant runs, in a helper's colour.
function rowsOf(frame: Frame, color: string, breed = 0, theme?: ThemeArt): Run[][] {
  const key = `${themeKey(theme)}|${color}|${breed}|${frame.join('')}`
  const hit = drawn.get(key)
  if (hit !== undefined) return hit
  const palette = paletteOf(color, breed, theme)
  const rows: Run[][] = []
  const k = scaleOf(theme)
  // A larger frame is shrunk to the 1 x size: each k x k block becomes the colour most of it has (a drawn pixel over a clear one on a tie).
  const shrunk = (y: number, x: number) => {
    const counts = new Map<string | undefined, number>()
    for (let dy = 0; dy < k; dy++) {
      for (let dx = 0; dx < k; dx++) {
        const c = palette[frame[y * k + dy]?.[x * k + dx] ?? '.']
        counts.set(c, (counts.get(c) ?? 0) + 1)
      }
    }

    return [...counts].sort((a, b) => b[1] - a[1] || (a[0] === undefined ? 1 : 0) - (b[0] === undefined ? 1 : 0))[0]?.[0]
  }
  for (let y = 0; y < frame.length / k; y += 4) {
    const runs: Run[] = []
    for (let x = 0; x < (frame[0]?.length ?? 0) / k; x += 2) {
      const pixels: (string | undefined)[] = []
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) pixels.push(shrunk(y + dy, x + dx))
      const next = cell(pixels)
      const last = runs[runs.length - 1]
      if (last !== undefined && last.color === next.color && last.backgroundColor === next.backgroundColor) last.text += next.text
      else runs.push(next)
    }
    rows.push(runs)
  }
  if (drawn.size > 4000) drawn.clear()
  drawn.set(key, rows)

  return rows
}

// A helper's duck now: as drawn, and as 3 rows of runs.
export function duckDrawing(s: DuckScene): Drawing {
  let frame = s.stuck !== undefined && s.ended === undefined ? stuckFrame(s) : pick(s)
  const m = marksOf(s.theme)
  if (s.isOpus === true && s.theme?.opusMark !== false) frame = paintClear(frame, STAR.map(([y, x, bright]) => [y, x, m[bright ? 'starLit' : 'star']]), scaleOf(s.theme))

  // Ducklings come in their breed's colours too, as grown ducks do.
  return { frame, color: s.color ?? DUCK_COLORS.x ?? '#B48EF0', breed: s.breed ?? 0, ...(s.theme !== undefined ? { theme: s.theme } : {}) }
}

// Marks drawn over a helper: an Opus star, a stuck one's sweat
// drop and its "?" or "!". Each only where the frame is clear, so it never covers the figure or its props.
const MARKS: ThemeMarks = { star: 'Q', starLit: 'U', drop: 'b', dropLit: 'B', asked: 'a', told: 'R' }
const marksOf = (t: ThemeArt | undefined): ThemeMarks => t?.marks ?? MARKS
const STAR: [number, number, boolean][] = [[0, 1, false], [1, 0, false], [1, 1, true], [1, 2, false], [2, 1, false]]
// `k`: the frame's scale, each cell then a k x k block.
function paintClear(frame: Frame, cells: [number, number, string][], k = 1): Frame {
  const rows = frame.map(r => [...r])
  for (const [y, x, c] of cells) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) if (rows[y * k + dy]?.[x * k + dx] === '.') rows[y * k + dy]![x * k + dx] = c

  return rows.map(r => r.join(''))
}
// A stuck helper: standing still, a sweat drop by its head and a "?" (asked where it is) or a flashing red
// "!" (the lead duck told), instead of dozing.
function stuckFrame(s: DuckScene): Frame {
  const m = marksOf(s.theme)
  const base = s.theme?.helper !== undefined ? (s.theme.helper.ends.idle[1] ?? s.theme.helper.ends.idle[0] ?? blank()) : pose(BIRDS[s.bird])
  const beat = Math.floor(s.at / (BEAT * 2)) % 2
  // Ducks face right, their head high on the right; a theme says where its own head is.
  const [dropY, dropX] = s.theme?.stuck?.drop ?? [1, 8]
  const drop: [number, number][] = [[dropY + beat, dropX], [dropY + 1 + beat, dropX]]
  // Ducks face right, the mark two columns in from the right edge; a theme says where its own goes (the frame's width in 1 x pixels less two, by default).
  const at = s.theme?.stuck?.mark ?? (base[0]?.length ?? 20) / scaleOf(s.theme) - 2
  const mark: [number, number][] =
    s.stuck === 'told' ? (beat === 0 ? [[0, at], [1, at], [2, at], [4, at]] : []) : [[0, at - 1], [0, at], [1, at + 1], [2, at], [4, at]]
  const color = s.stuck === 'told' ? m.told : m.asked

  return paintClear(base, [...drop.map(([y, x], i): [number, number, string] => [y, x, i === 0 ? m.drop : m.dropLit]), ...mark.map(([y, x]): [number, number, string] => [y, x, color])], scaleOf(s.theme))
}
export function duckRows(s: DuckScene): Run[][] {
  const d = duckDrawing(s)
  return rowsOf(d.frame, d.color, d.breed, d.theme)
}

// The quickest any duck moves: how often the panel redraws while one does.
export const CREATURE_TICK_MS = BEAT

// ---------------------------------------------------------------- the super duck

// The lead duck's own duck, at the top of the Agents tab in place of the Claude icon: the
// full-size duck in a red headband, its tails streaming back. At rest just that; when the lead duck or
// a helper starts work it powers up, a spiky gold crest grows and power-up flames rise round it,
// in an oval: hugging it low down, widest at its middle, curving in toward its head without touching it,
// sparks crackling at the sides: gold, or blue once four or more helpers run. 28 x 16
// pixels, so 14 cells by 4 rows.
export const SUPER_WIDTH = 14
const SUPER_DUCK = [
  '...........YYYY.....',
  '..........YhhYYY....',
  '.........YhhYYkeY...',
  '.........YYYYwkkOOOO',
  '.........YYYYYYoooo.',
  '..YY......YYYYYY....',
  '..YYLY.YLLLLYYYYY...',
  '...YYYYWWWWWWYYYYY..',
  '...YYvWWvWWvWWYYYY..',
  '...yYYvWWvWWvYYYyy..',
  '....yyyyyyyyyyyyy...',
]
const SW = 28
const SH = 16
// The duck, its headband and crest are drawn on a 40-pixel canvas and cut 6 pixels in from the left: a
// whole number of cells, so nothing smudges.
const CUT = 6
const HEADBAND: [number, number][] = [[5, 20], [5, 21], [5, 22], [5, 23], [5, 24], [5, 25]]
// Its tails, streaming back in three flutters.
const BAND_TAILS: [number, number][][] = [
  [[5, 19], [5, 18], [4, 17], [4, 16], [6, 18], [6, 17], [7, 16], [7, 15]],
  [[5, 19], [4, 18], [4, 17], [3, 16], [6, 18], [6, 17], [6, 16], [7, 15]],
  [[5, 19], [5, 18], [5, 17], [4, 16], [6, 18], [7, 17], [7, 16], [8, 15]],
]
// The crest: a full solid crown of
// spikes standing straight up off the crown, a tuft down the back of the head, shaded (light tips, a
// deeper body, a dark back edge so it stands off the gold duck) and alive: its tips flicker like flame
// from frame to frame, a glint running across it. Four frames on the 40-pixel canvas, a pixel each: 'V'
// lit, 'Q' its body, 'M' the dark back edge, 'n' the glint. Its lowest row goes round the back of the
// head, so it's drawn only where nothing else is.
const CREST_FRAMES: string[][] = [
  ['..V..V..V.', '.VQ.VQV.QV', 'MQQVQQQVQQ', 'MQQQQQQQQ.', 'MQ........'],
  ['.V...V.V..', '.QV.VQ.VQV', 'MQQVQQQQQQ', 'MQQQQQQQQ.', 'MQ........'],
  ['..V.V...V.', 'VQ.VQV.VQ.', 'MQQQQQVQQV', 'MQQQQQQQQ.', 'MQ........'],
  ['.V..V..V..', '.QVVQ.VQ.V', 'MQQQQVQQQQ', 'MQQQQQQQQ.', 'MQ........'],
]
const CREST_X = 19
function crestCells(t: number): [number, number, string][] {
  const frame = CREST_FRAMES[Math.floor(t / 1) % CREST_FRAMES.length] ?? CREST_FRAMES[0] ?? []
  const cells: [number, number, string][] = []
  frame.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && cells.push([y, CREST_X + x, c])))
  // The glint, across the crown's body a step a frame.
  const gx = CREST_X + 1 + (t % 5)
  if (frame[2]?.[gx - CREST_X] === 'Q') cells.push([2, gx, 'n'])

  return cells
}
const SWAY = CREST_FRAMES
function superBase(t: number, dy: number, hasCrest: boolean): string[][] {
  const g = Array.from({ length: SH }, () => Array<string>(SW).fill('.'))
  const set = (y: number, x40: number, c: string, onlyClear = false) => {
    const row = g[y]
    const x = x40 - CUT
    if (row !== undefined && x >= 0 && x < SW && (!onlyClear || row[x] === '.')) row[x] = c
  }
  SUPER_DUCK.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && set(4 + y + dy, 10 + x, c)))
  for (const [y, x] of HEADBAND) set(y + dy, x, 'R')
  for (const [y, x] of BAND_TAILS[t % 3] ?? []) set(y + dy, x, x > 16 ? 'R' : 'N', true)
  if (hasCrest) for (const [y, x, c] of crestCells(t)) set(y + dy, x, c, y >= 4)
  return g
}
// A steady flicker: the same numbers for the same place and moment.
const noise = (x: number, y: number, t: number) => ((Math.imul(x, 73856093) ^ Math.imul(y, 83492791) ^ Math.imul(t, 19349663)) & 0xffff) / 0xffff
// Where the duck reaches on each row, crest and all, so the aura stays a clear pixel off it.
// The hair sways, so the reach is its widest over every frame of the sway.
const DUCK_REACH = Array.from({ length: SH }, (_, y) => {
  const xs = SWAY.flatMap((_, t) => (superBase(t, 0, true)[y] ?? []).flatMap((c, x) => (c === '.' ? [] : [x])))
  return xs.length > 0 ? { left: Math.min(...xs), right: Math.max(...xs) } : undefined
})
// The oval's centre and half-width and half-height, in pixels.
const OVAL = { cx: 14.5, cy: 9, a: 12.6, b: 9.6 }
// power-up flames, power 0 to 3, in an oval round the duck: jagged walls with tongues licking up
// along the curve (outward low down, inward near the top), light climbing inside, spikes standing up
// round the crown, and sparks at full power.
function superFrame(power: number, t: number, dy: number, hasCrest: boolean): Frame {
  const g = superBase(t, dy, hasCrest)
  if (power === 0) return g.map(r => r.join(''))
  const out = g.map(r => [...r])
  const put = (x: number, y: number, c: string) => {
    const row = out[y]
    if (row !== undefined && x >= 0 && x < SW && row[x] === '.') row[x] = c
  }
  const { cx, cy, a, b } = OVAL
  const top = [16, 8, 3, 0][power] ?? 0
  const band = [0, 1, 2, 2][power] ?? 2
  const grow = [0, 0.82, 0.92, 1][power] ?? 1
  for (let y = top; y < SH; y++) {
    const k = (y - cy) / b
    if (Math.abs(k) >= 1) continue
    const half = a * grow * Math.sqrt(1 - k * k)
    const jag = ([0.6, 0, 0.3, -0.3][(y + t) % 4] ?? 0) + 0.6 * (noise(y + t, 7, 0) - 0.5)
    for (const side of [-1, 1]) {
      let edge = Math.round(cx + side * (half + jag))
      const reach = DUCK_REACH[y]
      if (reach !== undefined) edge = side < 0 ? Math.min(edge, reach.left - 2) : Math.max(edge, reach.right + 2)
      // The wall: bright at its outer edge, deeper gold within, a little ragged.
      for (let i = 0; i < band; i++) if (i === 0 || noise(edge, y, t + i) > 0.3) put(edge - side * i, y, i === 0 ? 'U' : 'A')
      // A tongue every few rows, leaning out below the middle and in above it.
      if ((y + t) % 4 === 0) {
        const lean = y > cy ? side : -side
        put(edge + lean, y - 1, 'U')
        if (power >= 2) put(edge + (y > cy ? lean * 2 : 0), y - 2, 'u')
      }
    }
    for (let x = Math.max(0, Math.trunc(cx - half) + band); x < Math.min(SW, Math.trunc(cx + half) - band + 1); x++) {
      if ((y + t) % 2 === 0 && noise(x, 3, Math.floor((y + t) / 2)) > 0.88) put(x, y, 'u')
    }
  }
  // Spikes standing up round the crown and back, each its own flicker.
  for (let x = Math.trunc(cx) - 6; x < Math.trunc(cx) + 7; x++) {
    if ((x + t) % 3 !== 0 || noise(x, 9, t) <= 0.35) continue
    const bodyTop = g.findIndex(row => row[x] !== '.')
    const gap = (bodyTop < 0 ? SH : bodyTop) - 2
    for (let y = Math.max(0, gap - 1 - Math.trunc(2 * noise(x, 5, t))); y < Math.max(0, gap); y++) put(x, y, y < gap - 1 ? 'U' : 'u')
  }
  // Sparks just outside the oval's widest point.
  if (power >= 3 && t % 3 === 0) {
    const x0 = [0, 26, 0, 26][Math.floor(t / 3) % 4] ?? 0
    for (const [dx, dy2] of [[0, 0], [1, 1], [0, 2], [1, 3]] as const) put(x0 + dx, 7 + dy2, 'Z')
  }
  return out.map(r => r.join(''))
}
// The same frames in red or blue: crest, aura, its depths and tongues.
const RED_OF: Record<string, string> = { Q: 'F', U: 'T', A: 'E', u: 't', V: 'g', M: 'D', n: 't' }
const BLUE_OF: Record<string, string> = { Q: 'q', U: 'J', A: 'I', u: 'j', V: 'J', M: 'I', n: 'j' }
const tinted = (to: Record<string, string>) => (f: Frame): Frame => f.map(r => r.replace(/[QUAuVMn]/g, c => to[c] ?? c))
const inRed = tinted(RED_OF)
const inBlue = tinted(BLUE_OF)
// Blue with bits of red flame in it. The hair stays blue; the red is
// in the aura only, one cell in three (whole cells, so each keeps to one colour's shades), moving on a
// cell each frame so the red flickers through the blue.
const inMix = (f: Frame, frame: number): Frame =>
  f.map((r, y) =>
    r.replace(/[QUAuVMn]/g, (c, x: number) => (!'QVMn'.includes(c) && (Math.floor(x / 2) + 2 * Math.floor(y / 4) + frame) % 3 === 0 ? RED_OF : BLUE_OF)[c] ?? c),
  )
const GOLD = once(() => ({
  // The crest grows in as it powers up.
  rising: [superFrame(1, 0, 1, false), superFrame(1, 1, 1, false), superFrame(2, 2, 1, true), superFrame(2, 3, 0, true), superFrame(3, 4, 0, true), superFrame(3, 5, 0, true)],
  powered: [0, 1, 2, 3, 4, 5, 6, 7].map(t => superFrame(3, t, [0, 0, 1, 1][t % 4] ?? 0, true)),
}))
// At rest it looks at you now and then: the same duck, its head turned to face you, round
// crown and full cheeks like its side. Drawn on whole cells, as octants hold two colours a cell: the
// band over its crown, the eyes alone on the face's cell row, the bill below.
const FACE = {
  open: [
    '..............RRRRRR........',
    '..............YhhYYY........',
    '.............YYkYYkYY.......',
    '............YYYkYYkYYY......',
    '............YYYYYYYYYY......',
    '.............YYOOOOYY.......',
    '..............YOOOOY........',
  ],
  shut: [
    '..............RRRRRR........',
    '..............YhhYYY........',
    '.............YYYYYYYY.......',
    '............YYkkYYkkYY......',
    '............YYYYYYYYYY......',
    '.............YYOOOOYY.......',
    '..............YOOOOY........',
  ],
}
function facing(t: number, isBlinking: boolean): Frame {
  const g = superFrame(0, t, 0, false).map(r => [...r])
  // Off with the side-on head above the body (its band too, and the tails where the face goes).
  for (let y = 3; y < 10; y++) {
    const row = g[y]
    if (row === undefined) continue
    for (let x = 12; x < SW; x++) {
      const c = row[x] ?? '.'
      if ('YhkeOoRNwL'.includes(c) && !(y >= 9 && 'YyL'.includes(c) && x < 20)) row[x] = '.'
    }
  }
  ;(isBlinking ? FACE.shut : FACE.open).forEach((r, i) => [...r].forEach((c, x) => {
    const row = g[3 + i]
    if (c !== '.' && row !== undefined) row[x] = c
  }))

  return g.map(r => r.join(''))
}
// A beat a step: side-on most of the time, then a quick look at you with a blink, and back.
const AT_REST: [boolean, boolean][] = [...Array<[boolean, boolean]>(30).fill([false, false]), ...Array<[boolean, boolean]>(3).fill([true, false]), [true, true], ...Array<[boolean, boolean]>(3).fill([true, false])]

const SUPER = {
  // At rest: just the duck in its headband, no crest, no aura, now and then turning to you.
  // Its band's tails hang still at rest, so a resting panel only redraws for the turn.
  calm: once(() => AT_REST.map(([isTurned, isBlinking]) => (isTurned ? facing(0, isBlinking) : superFrame(0, 0, 0, false)))),
  gold: GOLD,
  red: once(() => ({ rising: GOLD().rising.map(inRed), powered: GOLD().powered.map(inRed) })),
  blue: once(() => ({ rising: GOLD().rising.map(inBlue), powered: GOLD().powered.map(inBlue) })),
  mixed: once(() => ({ rising: GOLD().rising.map(inMix), powered: GOLD().powered.map(inMix) })),
}
export function superFrames(): Frame[] {
  return [...SUPER.calm(), ...[SUPER.gold(), SUPER.red(), SUPER.blue(), SUPER.mixed()].flatMap(set => [...set.rising, ...set.powered])]
}
// How many helpers at once turn the aura red, blue, then red and blue together: gold for
// one, or the lead duck alone.
const RED_AT = 2
const BLUE_AT = 3
const MIXED_AT = 4
// How long the power-up takes once work starts.
export const POWER_UP_MS = BEAT * 6

// The super duck now: at rest, side-on with a look at you now and then; busyMs since work began (powering up, then the full aura), in
// red with RED_AT or more helpers running, blue with BLUE_AT or more.
export function superDrawing(at: number, busyMs?: number, helpersRunning = 0, theme?: ThemeArt): Drawing {
  if (theme?.lead !== undefined) return themedLead(theme, theme.lead, at, busyMs, helpersRunning)
  const calm = SUPER.calm()
  if (busyMs === undefined) return { frame: calm[Math.floor(at / BEAT) % calm.length] ?? superFrame(0, 0, 0, false), color: '#B48EF0' }
  const set = (helpersRunning >= MIXED_AT ? SUPER.mixed : helpersRunning >= BLUE_AT ? SUPER.blue : helpersRunning >= RED_AT ? SUPER.red : SUPER.gold)()
  const frame = busyMs < POWER_UP_MS ? set.rising[Math.floor(busyMs / (POWER_UP_MS / set.rising.length))] : set.powered[Math.floor(at / BEAT) % set.powered.length]

  return { frame: frame ?? superFrame(0, 0, 0, false), color: '#B48EF0' }
}
export function superDuckRows(at: number, busyMs?: number, helpersRunning = 0, theme?: ThemeArt): Run[][] {
  const d = superDrawing(at, busyMs, helpersRunning, theme)
  return rowsOf(d.frame, d.color, 0, d.theme)
}

// A theme's lead: its rest frames when idle; its rising frames as work starts; then its level for how many helpers run.
function themedLead(theme: ThemeArt, lead: ThemeLeadArt, at: number, busyMs: number | undefined, helpersRunning: number): Drawing {
  const level = helpersRunning >= MIXED_AT ? 3 : helpersRunning >= BLUE_AT ? 2 : helpersRunning >= RED_AT ? 1 : 0
  const frames = busyMs === undefined ? lead.rest : busyMs < POWER_UP_MS ? lead.rising : (lead.levels[Math.min(level, lead.levels.length - 1)] ?? lead.rest)
  const step = busyMs !== undefined && busyMs < POWER_UP_MS ? Math.floor(busyMs / (POWER_UP_MS / frames.length)) : Math.floor(at / (BEAT * 2))
  const frame = frames[step % frames.length] ?? lead.rest[0] ?? []
  const color = '#B48EF0'
  if (busyMs === undefined || busyMs < POWER_UP_MS || helpersRunning === 0 || lead.flare === undefined) return { frame, color, theme }
  const flare = [...(lead.flare.small[step % Math.max(1, lead.flare.small.length)] ?? []), ...(helpersRunning >= BLUE_AT ? (lead.flare.big[step % Math.max(1, lead.flare.big.length)] ?? []) : [])]

  return { frame: paintClear(frame, flare.map(([y, x, c]): [number, number, string] => [y, x, c]), scaleOf(theme)), color, theme }
}

// ---------------------------------------------------------------- a duck that moves on its own

// What the panel hands a duck it draws as a `Client` (duck-view.tsx), which then moves on the
// terminal's own frame clock: one small redraw a beat, not the whole panel. A helper's duck or the super duck, as they stood when the panel drew; `stamp` tells a new drawing from the last, and
// `isStill` stops it while the person is in another app.
export type DuckView = (
  | { what: 'helper'; scene: DuckScene; isQuiet: boolean }
  | { what: 'super'; busyMs?: number; helpers: number; theme?: ThemeArt }
) & { stamp: number; isStill: boolean }

// That duck at its own time `at`, `elapsedMs` after the panel drew it: what it measured then has grown.
export function duckViewRows(v: DuckView, at: number, elapsedMs: number): Run[][] {
  const d = duckViewDrawing(v, at, elapsedMs)
  return rowsOf(d.frame, d.color, d.breed, d.theme)
}
export function duckViewDrawing(v: DuckView, at: number, elapsedMs: number): Drawing {
  if (v.what === 'super') return superDrawing(at, v.busyMs === undefined ? undefined : v.busyMs + elapsedMs, v.helpers, v.theme)
  const s = v.scene
  const plus = (ms: number | undefined) => (ms === undefined ? {} : { ms: ms + elapsedMs })

  return duckDrawing({
    ...s,
    at,
    ...(v.isQuiet ? { quietMs: (s.quietMs ?? 0) + elapsedMs } : {}),
    ...(s.noteMs !== undefined ? { noteMs: s.noteMs + elapsedMs } : {}),
    ...(s.failedMs !== undefined ? { failedMs: s.failedMs + elapsedMs } : {}),
    ...(s.ended !== undefined ? { ended: { ok: s.ended.ok, ...plus(s.ended.ms) } as { ok: boolean; ms: number } } : {}),
  })
}

