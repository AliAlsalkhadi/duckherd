// The prompt cache's clock and bill. Pure helpers (no engine calls) so the tests can reach them.
//
// Prices: base input $/MTok from the claude-api skill's "Current Models" table (cached 2026-10-06).
// Cache writes cost 1.25x base for the 5-minute TTL and 2x for the 1-hour TTL; a read costs 0.1x.

const HOUR_MS = 3600000
const MINUTE_MS = 60000
// A cold-cache hold is only worth it above this much context (smaller re-writes cost cents).
export const COLD_MIN_TOKENS = 20000
// A held message goes through when sent again within this long.
const HOLD_WINDOW_MS = 2 * MINUTE_MS
// Keep-warm pings start this long before the cache would go cold, and stop after this long untyped.
const WARM_LEAD_MS = 3 * MINUTE_MS
const WARM_IDLE_STOP_MS = 3 * HOUR_MS
export const WARM_PING_TEXT = "(keep-warm ping: reply with just 'ok')"

// Longest match first: the first row whose key is in the model id wins.
const PRICES: [string, number][] = [
  ['fable', 10],
  ['mythos', 10],
  ['opus-5-5', 4],
  ['opus', 5],
  ['sonnet-4', 3],
  ['sonnet', 2],
  ['haiku-4', 1],
  ['haiku', 0.1],
]
const DEFAULT_PRICE = 5

export function basePrice(model: string): number {
  const m = model.toLowerCase()

  return PRICES.find(([key]) => m.includes(key))?.[1] ?? DEFAULT_PRICE
}

export type Ttl = '5m' | '1h'

// `promptCacheTtl` setting or CLAUDE_CODE_PROMPT_CACHE_TTL env (env wins); default 1h (a subscription).
export function parseTtl(env: unknown, setting: unknown): Ttl {
  for (const v of [env, setting]) {
    if (v === '5m' || v === '1h') return v
  }

  return '1h'
}

export const ttlMs = (ttl: Ttl) => (ttl === '5m' ? 5 * MINUTE_MS : HOUR_MS)

export function isCold(now: number, lastTurnAt: number | undefined, ttl: number): boolean {
  return lastTurnAt !== undefined && now - lastTurnAt > ttl
}

// Re-writing `tokens` of context into the cache, in dollars, and as a multiple of a warm read (0.1x).
export function rewriteCost(tokens: number, model: string, ttl: Ttl): { usd: number; times: number } {
  const mult = ttl === '5m' ? 1.25 : 2

  return { usd: (tokens / 1e6) * basePrice(model) * mult, times: mult / 0.1 }
}

function duration(ms: number): string {
  const mins = Math.floor(ms / MINUTE_MS)
  if (mins < 60) return `${mins}m`

  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function tokensText(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function money(usd: number): string {
  return usd < 0.1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`
}

export function coldMessage(idleMs: number, tokens: number, model: string, ttl: Ttl): string {
  const c = rewriteCost(tokens, model, ttl)

  return `Cache has gone cold (idle ${duration(idleMs)}). This message re-reads ~${tokensText(tokens)} tokens: about ${money(c.usd)} at API prices (~${c.times}× a warm message). Press Enter again to send.`
}

export type Held = { text: string; at: number }

// What a submit does: 'pass' (send), or 'hold' (show the notice, remember the text).
export function holdDecision(i: { now: number; lastTurnAt: number | undefined; ttl: number; tokens: number; text: string; held: Held | undefined }): 'pass' | 'hold' {
  if (!isCold(i.now, i.lastTurnAt, i.ttl)) return 'pass'
  if (i.tokens < COLD_MIN_TOKENS) return 'pass'
  if (i.held !== undefined && i.held.text === i.text && i.now - i.held.at <= HOLD_WINDOW_MS) return 'pass'

  return 'hold'
}

// One keep-warm tick: 'ping', 'stop' (3 hours without the person typing), or 'wait'.
export function keepWarmStep(i: { now: number; lastTurnAt: number | undefined; lastTypedAt: number; ttl: number; busy: boolean; pingedFor: number | undefined }): 'ping' | 'stop' | 'wait' {
  if (i.now - i.lastTypedAt >= WARM_IDLE_STOP_MS) return 'stop'
  if (i.busy || i.lastTurnAt === undefined) return 'wait'
  if (i.pingedFor === i.lastTurnAt) return 'wait'

  return i.now >= i.lastTurnAt + i.ttl - WARM_LEAD_MS ? 'ping' : 'wait'
}

// Keep-warm: 'on' pings whenever idle; 'auto' (the default) only while a plan is unfinished and the
// context is at least WARM_AUTO_TOKENS, where a cold re-read costs most; 'off' never.
export type KeepWarmMode = 'on' | 'off' | 'auto'
const WARM_AUTO_TOKENS = 100000

export function asKeepWarmMode<T extends KeepWarmMode | null>(value: unknown, fallback: T | 'auto' = 'auto'): KeepWarmMode | T {
  return value === 'on' || value === 'off' || value === 'auto' ? value : fallback
}

export function warmWanted(mode: KeepWarmMode, planUnfinished: boolean, contextTokens: number): boolean {
  return mode === 'on' || (mode === 'auto' && planUnfinished && contextTokens >= WARM_AUTO_TOKENS)
}

export function warmWhen(mode: KeepWarmMode): string {
  return mode === 'auto' ? `only while a plan is unfinished and the context is ${WARM_AUTO_TOKENS / 1000}k or more` : 'whenever you are away'
}

