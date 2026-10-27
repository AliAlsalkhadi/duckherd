// The built-in ducks drawn finer for pictures: a 1 x frame (a letter a pixel) becomes four times as wide
// and tall, its outline and colour edges smoothed twice over (Scale2x, hard pixels, no new colours), then
// lit and shaded on the finer grid. The face never changes: the eyes, the bill, the blush and every pixel
// touching them (clear ones too) stay exactly the 1 x pixel, four times over. Props and marks stay as drawn.
// Every rule reads only a pixel's own neighbourhood, so a part that moves takes its detail with it.

type Grid = string[][]

// What may be smoothed and shaded: the bird (head, body, wing, feet, a duckling's down) and what it wears.
const BIRD = new Set([...'HiYhyWvLl', ...'xX', ...'RN', ...'123'])
// Feet stay square (they are two pixels wide), only shaded.
const FEET = new Set([...'fO'])
// The face: eyes, blush, bill.
const EYES = new Set([...'kew'])
const BILL = new Set([...'Oo'])

// A colour a share of the way to another.
function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return `#${[1, 3, 5].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`
}

// Which 1 x pixels are the face and the ring round it: never smoothed, shaded or drawn over.
function faceOf(f: readonly string[]): boolean[][] {
  const h = f.length
  const w = f[0]?.length ?? 0
  const at = (y: number, x: number) => f[y]?.[x] ?? '.'
  const face = Array.from({ length: h }, () => Array<boolean>(w).fill(false))
  const near = (y: number, x: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (EYES.has(at(y + dy, x + dx))) return true
    return false
  }
  // The bill: its pixels joined to one that sits within two of an eye (a duckling's orange feet, and a
  // tipped duck's hidden bill, are not its face).
  const bill = Array.from({ length: h }, () => Array<boolean>(w).fill(false))
  const todo: [number, number][] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (BILL.has(at(y, x)) && near(y, x, 2)) todo.push([y, x])
  while (todo.length > 0) {
    const [y, x] = todo.pop() ?? [0, 0]
    const row = bill[y]
    if (row === undefined || row[x] === true || !BILL.has(at(y, x))) continue
    row[x] = true
    todo.push([y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1])
  }
  // Facing you (two eyes on one row), the whole face keeps its outline: a ring three pixels wide.
  const facing = f.some(r => /k+[^k.]+k/.test(r))
  const ring = facing ? 3 : 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(y, x)
      if (!EYES.has(c) && bill[y]?.[x] !== true) continue
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        const row = face[y + dy]
        if (row !== undefined && x + dx >= 0 && x + dx < w) row[x + dx] = true
      }
    }
  }

  return face
}

// One Scale2x step on letters: a corner takes its two matching neighbours' letter where they meet on a
// diagonal. Only bird letters move, onto bird letters or clear; the face (`fixed`) stays.
function scale2x(g: Grid, fixed: boolean[][]): { g: Grid; fixed: boolean[][] } {
  const h = g.length
  const w = g[0]?.length ?? 0
  const at = (y: number, x: number) => g[y]?.[x] ?? '.'
  const ok = (c: string) => c === '.' || BIRD.has(c)
  const out: Grid = Array.from({ length: h * 2 }, () => Array<string>(w * 2).fill('.'))
  const fx: boolean[][] = Array.from({ length: h * 2 }, () => Array<boolean>(w * 2).fill(false))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(y, x)
      const isFixed = fixed[y]?.[x] === true
      const a = at(y - 1, x)
      const b = at(y, x + 1)
      const c = at(y, x - 1)
      const d = at(y + 1, x)
      let e = [p, p, p, p]
      // Under a headband the head stays flat, so the band sits on it.
      if (!isFixed && ok(p) && !(p !== '.' && 'RN'.includes(a) && !'RN'.includes(p))) {
        const take = (n: string) => (n !== p && ok(n) && (n !== '.' || p !== '.') ? n : p)
        e = [
          c === a && c !== d && a !== b ? take(a) : p,
          a === b && a !== c && b !== d ? take(b) : p,
          d === c && d !== b && c !== a ? take(c) : p,
          b === d && b !== a && d !== c ? take(d) : p,
        ]
        // A clear pixel only fills in towards a pixel that isn't fixed (the face's ring keeps its outline).
        if (p === '.') {
          const fixedNear = [[-1, 0], [0, 1], [0, -1], [1, 0]].some(([dy, dx]) => fixed[y + (dy ?? 0)]?.[x + (dx ?? 0)] === true)
          if (fixedNear) e = [p, p, p, p]
        }
      }
      for (let i = 0; i < 4; i++) {
        const yy = 2 * y + (i >> 1)
        const xx = 2 * x + (i & 1)
        const row = out[yy]
        if (row !== undefined) row[xx] = e[i] ?? p
        const frow = fx[yy]
        if (frow !== undefined) frow[xx] = isFixed
      }
    }
  }

  return { g: out, fixed: fx }
}

// Each letter's own light, for its rim.
const LIGHT: Record<string, string> = { H: 'i', i: 'i', Y: 'L', L: 'L', h: 'h', y: 'Y', W: 'L', v: 'W', l: 'L', x: 'x', X: 'x', R: 'R', N: 'R', '1': '2', '2': '2', '3': '1' }

export type Finer = { width: number; height: number; colors: (string | undefined)[] }
// How the finer drawing looks. 'pixel' (the default): pixels half the size of the frame's;
// outlines eased once on that grid (half-size stair-steps) and lit and shaded a pixel at a time.
// 'chunky': every outline kept on the 1 x blocks, shaded in half blocks. 'smooth': outlines eased twice,
// on the finest grid.
export type Look = 'pixel' | 'chunky' | 'smooth'

// The frame four times finer, in colours (undefined clear).
export function finer(frame: readonly string[], palette: Record<string, string>, look: Look = 'pixel'): Finer {
  const face = faceOf(frame)
  if (look === 'chunky') return chunky(frame, face, palette)
  const one = frame.map(r => [...r])
  const s2 = scale2x(one, face)
  // Pixels of the drawing per 1 x pixel: 2 (each then drawn 2 x 2) or 4.
  const k = look === 'smooth' ? 4 : 2
  const s4 = k === 4 ? scale2x(s2.g, s2.fixed) : s2
  const g = s4.g
  const fixed = s4.fixed
  const h = g.length
  const w = g[0]?.length ?? 0
  const at = (y: number, x: number) => g[y]?.[x] ?? '.'
  // The 1 x pixel this one came from.
  const src = (y: number, x: number) => frame[Math.floor(y / k)]?.[Math.floor(x / k)] ?? '.'
  const is = (y: number, x: number, set: string) => set.includes(at(y, x))
  const clear = (y: number, x: number) => at(y, x) === '.'
  // The duck's own light and shade, from its palette (so every breed is lit in its own colours).
  const light = palette.L ?? '#FFFFFF'
  const shade = palette.y ?? '#000000'
  const colors: (string | undefined)[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(y, x)
      const base = c === '.' ? undefined : palette[c]
      if (base === undefined || fixed[y]?.[x] === true) {
        colors.push(base)
        continue
      }
      // Feet: in the body's shadow along their top.
      if (FEET.has(c)) {
        colors.push(is(y - 1, x, 'HiYhyWvLl') ? mix(base, '#000000', 0.25) : base)
        continue
      }
      if (!BIRD.has(c)) {
        colors.push(base)
        continue
      }
      // The Opus crown: its band's lower edge dark, so it sits on the head.
      if (c === '1' && k === 2 && y % 2 === 1 && !is(y + 1, x, '123')) {
        colors.push(palette['3'] ?? mix(base, '#000000', 0.4))
        continue
      }
      const lit = palette[LIGHT[c] ?? ''] ?? '#FFFFFF'
      let out = base
      // A rim of light along every top edge.
      if (clear(y - 1, x)) out = mix(base, mix(lit, '#FFFFFF', 0.3), 0.75)
      // Round at the back: the pixel at a left edge turns a little into shade.
      else if (clear(y, x - 1) && 'YHLWy123'.includes(c)) out = mix(base, shade, c === 'y' ? 0.5 : 0.4)
      // Where the body meets the belly's shade, a half-step in scallops a pixel wide: feathers along the waterline.
      else if (c === 'Y' && src(y, x) === 'Y' && src(y + k, x) === 'y' && (y % k === k - 1 || (k === 4 && y % 4 === 2 && (x % 4 === 0 || x % 4 === 3)))) out = mix(base, shade, 0.5)
      // The belly's lowest pixel, where it meets its shadow.
      else if (c === 'y' && clear(y + 1, x)) out = mix(base, '#000000', 0.2)
      // The wing: lit along its top, each feather's edge caught by the light.
      else if (c === 'W' && !is(y - 1, x, 'Wv')) out = mix(base, light, 0.6)
      else if (k === 4 && c === 'W' && is(y, x - 1, 'v') && is(y, x + 1, 'W')) out = mix(base, light, 0.6)
      // On the half-size grid: the back's light runs down a pixel, the head shades the neck, and light
      // from behind catches the chest.
      else if (k === 2 && c === 'Y' && is(y - 1, x, 'L')) out = mix(base, light, 0.5)
      else if (k === 2 && 'YL'.includes(c) && is(y - 1, x, 'Hi')) out = mix(base, shade, 0.3)
      else if (k === 2 && clear(y, x + 1) && 'YHL'.includes(c) && !clear(y - 1, x) && !clear(y + 1, x)) out = mix(base, lit, 0.4)
      colors.push(out)
    }
  }
  // No lone specks: a shaded pixel that no neighbour matches takes the colour most of its own kind round it have.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const c = at(y, x)
        const now = colors[i]
        if (now === undefined || fixed[y]?.[x] === true || !(BIRD.has(c) || FEET.has(c))) continue
        const kin = new Map<string, number>()
        let alone = true
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dy === 0 && dx === 0) || y + dy < 0 || y + dy >= h || x + dx < 0 || x + dx >= w) continue
            const n = colors[(y + dy) * w + x + dx]
            if (n === now) alone = false
            if (n !== undefined && at(y + dy, x + dx) === c) kin.set(n, (kin.get(n) ?? 0) + 1)
          }
        }
        if (!alone) continue
        const best = [...kin].sort((p, q) => q[1] - p[1])[0]?.[0] ?? palette[c]
        if (best !== undefined && best !== now) {
          colors[i] = best
          changed = true
        }
      }
    }
    if (!changed) break
  }
  if (k === 2) {
    // Each pixel of the half-size grid drawn 2 x 2.
    const big = Array<string | undefined>(w * h * 4)
    for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) big[y * w * 2 + x] = colors[(y >> 1) * w + (x >> 1)]
    if (frame[0]?.length === 20) marks(frame, face, palette, big, w * 2, 2)
    return { width: w * 2, height: h * 2, colors: big }
  }
  if (frame[0]?.length === 20) marks(frame, face, palette, colors, w, 1)

  return { width: w, height: h, colors }
}

// The chunky look: the 1 x blocks as drawn, each lit or shaded by halves (2 x 2 fine pixels at the least),
// so the duck stays pixel art with its stair-steps, and gains light along its top, shade at its back and
// belly, a lit wing edge and feather clusters.
function chunky(frame: readonly string[], face: boolean[][], palette: Record<string, string>): Finer {
  const H = frame.length
  const W = frame[0]?.length ?? 0
  const w = W * 4
  const at = (y: number, x: number) => frame[y]?.[x] ?? '.'
  const clear = (y: number, x: number) => at(y, x) === '.'
  const light = palette.L ?? '#FFFFFF'
  const shade = palette.y ?? '#000000'
  const colors: (string | undefined)[] = Array<string | undefined>(w * H * 4).fill(undefined)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = at(y, x)
      const base = c === '.' ? undefined : palette[c]
      // Four halves of the block: top, bottom, left, right; a colour set on a half wins over the base.
      let top: string | undefined
      let bottom: string | undefined
      let left: string | undefined
      let right: string | undefined
      if (base !== undefined && face[y]?.[x] !== true) {
        const lit = palette[LIGHT[c] ?? ''] ?? '#FFFFFF'
        if (FEET.has(c)) {
          if ('HiYhyWvLl'.includes(at(y - 1, x))) top = mix(base, '#000000', 0.25)
        } else if (BIRD.has(c)) {
          if (clear(y - 1, x)) top = mix(base, mix(lit, '#FFFFFF', 0.3), 0.6)
          else if (c === 'W' && !'Wv'.includes(at(y - 1, x))) top = mix(base, light, 0.55)
          if (clear(y, x - 1) && 'YHLWy'.includes(c)) left = mix(base, shade, 0.35)
          else if (c === 'W' && at(y, x - 1) === 'v') left = mix(base, light, 0.45)
          // The light on the back runs down a half block into the body.
          else if (c === 'Y' && at(y - 1, x) === 'L') top = mix(base, light, 0.5)
          // The head's shadow on its neck.
          else if ('YL'.includes(c) && 'Hi'.includes(at(y - 1, x)) && palette.H !== undefined) top = mix(base, shade, 0.3)
          if (c === 'Y' && at(y + 1, x) === 'y') bottom = mix(base, shade, 0.5)
          else if (c === 'y' && clear(y + 1, x)) bottom = mix(base, '#000000', 0.2)
          // Light from behind along the chest and the back of the tail.
          if (clear(y, x + 1) && 'YHL'.includes(c) && !clear(y - 1, x) && !clear(y + 1, x)) right = mix(base, lit, 0.4)
        }
      }
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          colors[(y * 4 + j) * w + x * 4 + i] = (j < 2 ? top : undefined) ?? (i < 2 ? left : undefined) ?? (i >= 2 ? right : undefined) ?? (j >= 2 ? bottom : undefined) ?? base
        }
      }
    }
  }
  if (W === 20) marks(frame, face, palette, colors, w, 2)

  return { width: w, height: H * 4, colors }
}

// ---------------------------------------------------------------- the marks round a helper's duck

// The tick, rain cloud, zzz, envelope, "!" and "?", sweat and water drops and the Opus star, redrawn on the
// finer grid in the same places: strokes of one weight (a 1 x pixel), round ends, lit along the top and
// shaded along the bottom like the duck. Each is drawn only where the 1 x frame is clear or the mark itself,
// so nothing goes over the duck or its face.
type Pt = [number, number]
const STROKE = 2.1
function segDist(py: number, px: number, a: Pt, b: Pt): number {
  const [ay, ax] = a
  const [by, bx] = b
  const dy = by - ay
  const dx = bx - ax
  const len = dy * dy + dx * dx
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((py - ay) * dy + (px - ax) * dx) / len))
  return Math.hypot(py - (ay + t * dy), px - (ax + t * dx))
}

// `grain`: the marks' smallest step in fine pixels (2 for the chunky look).
function marks(frame: readonly string[], face: boolean[][], palette: Record<string, string>, colors: (string | undefined)[], w: number, grain: number): void {
  const snap = (v: number) => Math.floor(v / grain) * grain
  const H = frame.length
  const W = frame[0]?.length ?? 0
  const at = (y: number, x: number) => frame[y]?.[x] ?? '.'
  const cells = (letters: string, y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1): Pt[] => {
    const out: Pt[] = []
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (letters.includes(at(y, x))) out.push([y, x])
    return out
  }
  // Draws a mark: `inside` (finer pixel y, x) in 4 x pixels, over the cells it may use.
  const draw = (own: Pt[], letters: string, base: string, inside: (y: number, x: number) => boolean, ring: Pt[] = own) => {
    const ok = (y: number, x: number) => {
      const c = at(y >> 2, x >> 2)
      return letters.includes(c) || (c === '.' && face[y >> 2]?.[x >> 2] !== true)
    }
    // Off with the old mark.
    for (const [cy, cx] of own) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) colors[(cy * 4 + j) * w + cx * 4 + i] = undefined
    const ys = ring.map(p => p[0])
    const xs = ring.map(p => p[1])
    const y0 = Math.max(0, (Math.min(...ys) - 1) * 4)
    const y1 = Math.min(H * 4 - 1, (Math.max(...ys) + 2) * 4 - 1)
    const x0 = Math.max(0, (Math.min(...xs) - 1) * 4)
    const x1 = Math.min(W * 4 - 1, (Math.max(...xs) + 2) * 4 - 1)
    const m = (y: number, x: number) => y >= y0 && y <= y1 && x >= x0 && x <= x1 && ok(y, x) && inside(snap(y) + grain / 2, snap(x) + grain / 2)
    const lit = mix(base, '#FFFFFF', 0.4)
    const dim = mix(base, '#000000', 0.3)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!m(y, x)) continue
        // A lone pixel of a mark is no mark.
        if (![-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dy !== 0 || dx !== 0) && m(y + dy, x + dx)))) continue
        const ty = snap(y)
        const by = snap(y) + grain - 1
        colors[y * w + x] = !m(ty - 1, x) && m(by + 1, x) && m(by + grain, x) ? lit : !m(by + 1, x) && m(ty - 1, x) && m(ty - grain, x) ? dim : base
      }
    }
    // A lit or shaded pixel on its own goes back to the mark's colour.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = colors[y * w + x]
        if (c !== lit && c !== dim) continue
        const twin = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dy !== 0 || dx !== 0) && y + dy >= 0 && x + dx >= 0 && x + dx < w && colors[(y + dy) * w + x + dx] === c))
        if (!twin) colors[y * w + x] = base
      }
    }
  }
  const stroke = (path: Pt[][], dots: Pt[] = []) => (y: number, x: number) =>
    path.some(line => line.slice(1).some((p, i) => segDist(y, x, (line[i] ?? p).map(v => v * 4) as Pt, p.map(v => v * 4) as Pt) <= STROKE)) ||
    dots.some(([dy, dx]) => Math.hypot(y - dy * 4, x - dx * 4) <= STROKE + 0.3)

  // The tick (and the half drawn in), top left.
  const tick = cells('G')
  if (tick.length > 0 && palette.G !== undefined) {
    const full = tick.length > 6
    draw(tick, 'G', palette.G, stroke([full ? [[2.4, 0.6], [3.5, 2.0], [0.6, 6.4]] : [[2.4, 0.6], [3.5, 2.0]]]), full ? [[0, 0], [3, 7]] : [[2, 0], [3, 2]])
  }
  // The rain cloud: three puffs on a flat base, its drops falling under it.
  const cloud = cells('C', 0, 3, 0, 7)
  if (cloud.length > 0 && palette.C !== undefined) {
    const C = palette.C
    draw(cloud, 'C', C, (y, x) => {
      const yy = y / 4
      const xx = x / 4
      return (yy >= 1.2 && yy <= 3.0 && xx >= 0.25 && xx <= 7.75 && !(yy > 2.5 && (xx < 0.75 || xx > 7.25))) || Math.hypot(yy - 1.55, xx - 2.1) <= 1.3 || Math.hypot(yy - 1.25, xx - 4.4) <= 1.25 || Math.hypot(yy - 1.8, xx - 6.2) <= 1.05
    }, [[0, 0], [2, 7]])
  }
  // Water and sweat drops: a single drop round, a drop two pixels tall a teardrop.
  const drop = (y: number, x: number, rows: string[], tall: number) => {
    const top = at(y, x)
    const bottom = at(y + tall - 1, x)
    const c1 = palette[top]
    const c2 = palette[bottom]
    if (c1 === undefined || c2 === undefined) return
    const own: Pt[] = Array.from({ length: tall }, (_, i) => [y + i, x])
    for (const [cy, cx] of own) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) colors[(cy * 4 + j) * w + cx * 4 + i] = undefined
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch !== '.') colors[(y * 4 + j) * w + x * 4 + i] = ch === 'a' ? c1 : ch === 'b' ? c2 : mix(c2, '#000000', 0.25)
    }))
  }
  const seen = new Set<number>()
  for (const [y, x] of cells('bB')) {
    if (seen.has(y * 100 + x)) continue
    // Part of the water (or a crest on it): left as it is.
    if (y >= 8 || [[0, -1], [0, 1], [1, 0], [-1, 0]].some(([dy, dx]) => 'bB'.includes(at(y + (dy ?? 0), x + (dx ?? 0))) && (y + (dy ?? 0)) >= 8)) continue
    seen.add(y * 100 + x)
    if (at(y, x) === 'b' && at(y + 1, x) === 'B' && at(y - 1, x) !== 'b') {
      seen.add((y + 1) * 100 + x)
      drop(y, x, grain > 1 ? ['.aa.', '.aa.', 'aaaa', 'aaaa', 'bbbb', 'bbbb', 'dddd', 'dddd'] : ['.aa.', '.aa.', 'aaaa', 'aaaa', 'bbbb', 'bbbb', 'bbbb', '.dd.'], 2)
    } else drop(y, x, grain > 1 ? ['aaaa', 'aaaa', 'dddd', 'dddd'] : ['.aa.', 'aaaa', 'aaaa', '.dd.'], 1)
  }
  // zzz: a Z.
  const z = cells('z', 0, 3)
  if (z.length > 0 && palette.z !== undefined) {
    const x0 = Math.min(...z.map(p => p[1]))
    draw(z, 'z', palette.z, stroke([[[0.5, x0 + 0.45], [0.5, x0 + 2.55], [3.5, x0 + 0.45], [3.5, x0 + 2.55]]]))
  }
  // The envelope: a card with its flap folded down.
  const env = cells('Pp', 0, 3)
  const ex = Math.min(...env.map(p => p[1]))
  const isEnvelope = env.length === 16 && ['PPPP', 'pPPp', 'PppP', 'PPPP'].every((r, y) => frame[y]?.slice(ex, ex + 4) === r)
  if (isEnvelope && palette.P !== undefined && palette.p !== undefined) {
    const P = palette.P
    const p = palette.p
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        // In chunky steps the flap folds a block of two at a time.
        const fj = grain > 1 ? snap(j) + 0.5 : j
        const fi = grain > 1 ? snap(i) + 0.5 : i
        const fold = grain > 1 ? Math.abs(fj - 1.5 - (fi < 8 ? fi : 15 - fi) * 0.75) < 1.2 && fj < 10 : Math.abs(j - 1 - (i < 8 ? i + 0.5 : 15.5 - i) * 0.9) < 1
        const edge = grain > 1 ? fj > 13 || fi < 2 || fi > 13 : j === 15 || i === 0 || i === 15
        colors[j * w + ex * 4 + i] = grain > 1 ? (fold || (edge && fj > 3) ? p : P) : j === 0 ? P : fold || (edge && j > 2) ? p : P
      }
    }
  }
  // "!" and "?": amber (asked), red (startled, or the lead duck told).
  for (const letter of 'arR') {
    const own = cells(letter)
    const base = palette[letter]
    if (own.length === 0 || base === undefined) continue
    // A crown's jewel is not a mark.
    if (own.some(([y, x]) => 'QU'.includes(at(y, x - 1)) || 'QU'.includes(at(y, x + 1)))) continue
    const xs = new Set(own.map(p => p[1]))
    const ys = own.map(p => p[0])
    const top = Math.min(...ys)
    if (xs.size === 1) {
      const x = [...xs][0] ?? 0
      // The bar runs down to the gap; the dot sits under it, where the "!" always puts it.
      const last = Math.max(...own.filter(([y]) => !own.some(([yy]) => yy === y + 1) || y < top + 3).map(p => p[0]).filter(y => own.some(([yy]) => yy === y - 1) || y === top))
      const bar = Math.min(last, top + 2)
      const dot = own.find(([y]) => y > bar + 1)
      draw(own, letter, base, stroke([[[top + 0.45, x + 0.5], [bar + 0.55, x + 0.5]]], dot !== undefined ? [[dot[0] + 0.5, x + 0.5]] : []), [[top, x], [top + 4, x]])
    } else {
      const left = Math.min(...own.map(p => p[1]))
      const wide = Math.max(...own.map(p => p[1])) - left + 1
      // The amber "?" by an asking duck is 4 x 6; a stuck one's 3 x 5.
      const path: Pt[] = wide >= 4
        ? [[1.6, left + 0.5], [0.6, left + 1.2], [0.5, left + 2.6], [1.5, left + 3.4], [2.5, left + 2.6], [3.3, left + 1.6], [3.9, left + 1.5]]
        : [[0.9, left + 0.4], [0.45, left + 1.3], [0.9, left + 2.4], [1.7, left + 2.4], [2.6, left + 1.5], [3.1, left + 1.5]]
      const dotY = wide >= 4 ? top + 5.5 : top + 4.5
      const dotX = wide >= 4 ? left + 1.5 : left + 1.5
      draw(own, letter, base, stroke([path.map(([y, x]) => [y + top, x] as Pt)], [[dotY, dotX]]), [[top, left], [top + (wide >= 4 ? 5 : 4), left + wide - 1]])
    }
  }
  // The Opus star: a four-pointed sparkle, its middle lit.
  const star = [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]].filter(([y, x]) => 'QU'.includes(at(y ?? 0, x ?? 0))) as Pt[]
  if (at(1, 1) === 'U' && star.length >= 3 && palette.Q !== undefined && palette.U !== undefined) {
    const Q = palette.Q
    const U = palette.U
    const SPARKLE = grain > 1 ? ['....QQQQ....', '....QQQQ....', '....QQQQ....', '....QQQQ....', 'QQQQUUUUQQQQ', 'QQQQUUUUQQQQ', 'QQQQUUUUQQQQ', 'QQQQUUUUQQQQ', '....QQQQ....', '....QQQQ....', '....QQQQ....', '....QQQQ....'] : ['.....QQ.....', '.....QQ.....', '....QQQQ....', '....QQQQ....', '..QQQUUQQQ..', 'QQQQUUUUQQQQ', 'QQQQUUUUQQQQ', '..QQQUUQQQ..', '....QQQQ....', '....QQQQ....', '.....QQ.....', '.....QQ.....']
    draw(star, 'QU', Q, (y, x) => (SPARKLE[Math.floor(y)]?.[Math.floor(x)] ?? '.') !== '.', [[0, 0], [2, 2]])
    SPARKLE.forEach((r, j) => [...r].forEach((c, i) => {
      if (c === 'U' && colors[j * w + i] !== undefined) colors[j * w + i] = U
    }))
  }
}
