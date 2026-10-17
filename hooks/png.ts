// A small PNG encoder for the ducks drawn as pictures: an indexed-colour image with its
// own deflate (LZ77 over fixed Huffman codes), as the mod's environment has no compression of its own.
// Pixel art scaled up is long runs and repeated rows, so a duck frame comes to about a kilobyte.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }

  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)

  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const x of bytes) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }

  return ((b << 16) | a) >>> 0
}

// Bits written least significant first, as deflate packs them.
class Bits {
  out: number[] = []
  private acc = 0
  private n = 0
  put(value: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.acc |= ((value >>> i) & 1) << this.n
      if (++this.n === 8) {
        this.out.push(this.acc)
        this.acc = 0
        this.n = 0
      }
    }
  }
  // A Huffman code goes most significant bit first.
  code(value: number, count: number) {
    for (let i = count - 1; i >= 0; i--) this.put((value >>> i) & 1, 1)
  }
  flush() {
    if (this.n > 0) this.out.push(this.acc)
    this.acc = 0
    this.n = 0
  }
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

// The fixed literal/length code of deflate (RFC 1951, 3.2.6).
function literal(bits: Bits, symbol: number) {
  if (symbol <= 143) bits.code(0x30 + symbol, 8)
  else if (symbol <= 255) bits.code(0x190 + symbol - 144, 9)
  else if (symbol <= 279) bits.code(symbol - 256, 7)
  else bits.code(0xc0 + symbol - 280, 8)
}

function deflate(data: Uint8Array): Uint8Array {
  const bits = new Bits()
  bits.put(1, 1) // the last block
  bits.put(1, 2) // fixed Huffman codes
  // Where each three bytes were last seen, and before that, as hash chains.
  const head = new Int32Array(1 << 15).fill(-1)
  const prev = new Int32Array(data.length).fill(-1)
  const hash = (i: number) => (((data[i] ?? 0) << 10) ^ ((data[i + 1] ?? 0) << 5) ^ (data[i + 2] ?? 0)) & 0x7fff
  const remember = (i: number) => {
    if (i + 2 >= data.length) return
    const h = hash(i)
    prev[i] = head[h] ?? -1
    head[h] = i
  }
  let i = 0
  while (i < data.length) {
    let bestLength = 0
    let bestDistance = 0
    if (i + 2 < data.length) {
      for (let at = head[hash(i)] ?? -1, tries = 0; at >= 0 && tries < 16 && i - at <= 32768; at = prev[at] ?? -1, tries++) {
        let length = 0
        while (length < 258 && i + length < data.length && data[at + length] === data[i + length]) length++
        if (length > bestLength) {
          bestLength = length
          bestDistance = i - at
          if (length === 258) break
        }
      }
    }
    if (bestLength >= 3) {
      const code = LENGTH_BASE.findLastIndex(base => base <= bestLength)
      literal(bits, 257 + code)
      bits.put(bestLength - (LENGTH_BASE[code] ?? 0), LENGTH_EXTRA[code] ?? 0)
      const dcode = DIST_BASE.findLastIndex(base => base <= bestDistance)
      bits.code(dcode, 5)
      bits.put(bestDistance - (DIST_BASE[dcode] ?? 0), DIST_EXTRA[dcode] ?? 0)
      for (let k = 0; k < bestLength; k++) remember(i++)
    } else {
      literal(bits, data[i] ?? 0)
      remember(i++)
    }
  }
  literal(bits, 256)
  bits.flush()

  return Uint8Array.from(bits.out)
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))

  return out
}

// A PNG of `pixels` (one palette index a pixel, row by row), each pixel drawn `scale` times over so the
// terminal shows it crisp; `colors` are `#rrggbb`, and index 0 is clear.
export function pngOf(width: number, height: number, pixels: ArrayLike<number>, colors: string[], scale = 1): Uint8Array {
  const w = width * scale
  const h = height * scale
  const raw = new Uint8Array((w + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = (w + 1) * y
    raw[row] = 0
    const from = Math.floor(y / scale) * width
    for (let x = 0; x < w; x++) raw[row + 1 + x] = pixels[from + Math.floor(x / scale)] ?? 0
  }
  const z = deflate(raw)
  const zlib = new Uint8Array(2 + z.length + 4)
  zlib[0] = 0x78
  zlib[1] = 0x01
  zlib.set(z, 2)
  new DataView(zlib.buffer).setUint32(2 + z.length, adler32(raw))
  const ihdr = new Uint8Array(13)
  const head = new DataView(ihdr.buffer)
  head.setUint32(0, w)
  head.setUint32(4, h)
  ihdr.set([8, 3, 0, 0, 0], 8)
  const plte = new Uint8Array(colors.length * 3)
  colors.forEach((c, k) => plte.set([1, 3, 5].map(at => parseInt(c.slice(at, at + 2), 16) || 0), k * 3))
  const trns = Uint8Array.from(colors.map((_, k) => (k === 0 ? 0 : 255)))
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }

  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += (B64[(n >>> 18) & 63] ?? '') + (B64[(n >>> 12) & 63] ?? '') + (i + 1 < bytes.length ? (B64[(n >>> 6) & 63] ?? '') : '=') + (i + 2 < bytes.length ? (B64[n & 63] ?? '') : '=')
  }

  return out
}
