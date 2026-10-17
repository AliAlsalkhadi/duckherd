// Turns a helper's tool call into one plain line for the Agents tab.

type Call = { tool: string; [argument: string]: unknown }

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Escape sequences (CSI, OSC, DCS and the like) and the other control characters, C0 but tab and
// newline, DEL and C1, and the bidi marks and overrides (they reorder what is shown, so a file name can
// read as another): text a helper's tools or another program wrote must not drive the terminal it is
// shown in (an OSC 52 rewriting the clipboard, a title change, a cursor jump).
const ESCAPES = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[P^_X][^\x1b]*(?:\x1b\\)?|[ -/]*[0-~])?/g
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

export function stripControl(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(ESCAPES, '').replace(CONTROLS, '')
}

// The same for text drawn on one line (a file name, a branch, a process or session name, a diff line):
// the tab and newline stripControl keeps become spaces.
export function plainText(value: string): string {
  return stripControl(value).replace(/[\t\n]/g, ' ')
}

// Likely secrets, blanked before text leaves for a file others may read or for a model: API keys and
// tokens by their known shapes, private keys, bearer tokens and KEY=value style assignments.
const SECRETS: [RegExp, string][] = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, '[redacted private key]'],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted]'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, '[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[redacted]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[redacted]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}/g, '[redacted]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{16,}=*/g, '$1 [redacted]'],
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)[A-Za-z0-9_]*)(\s*=\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s'"]+)/gi, '$1$2[redacted]'],
]

export function redactSecrets(value: string): string {
  return SECRETS.reduce((text, [pattern, blank]) => text.replace(pattern, blank), value)
}

function clip(value: string, max: number): string {
  const one = stripControl(value).replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function shortPath(path: string, cwd: string): string {
  let short = path
  if (cwd !== '' && short.startsWith(`${cwd}/`)) short = short.slice(cwd.length + 1)
  const parts = short.split('/')

  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : short
}

export function toolLabel(tool: string): string {
  if (tool.startsWith('mcp__')) return tool.split('__')[1] ?? 'tool'

  return tool
}

export function describeCall(call: Call, cwd: string): string {
  const tool = String(call.tool)
  const file = shortPath(text(call.file_path) || text(call.notebook_path), cwd)

  switch (tool) {
    case 'Read':
      return `Reading ${file}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editing ${file}`
    case 'Write':
      return `Writing ${file}`
    case 'Grep':
      return `Searching the code for "${clip(text(call.pattern), 40)}"`
    case 'Glob':
      return `Looking for files named ${clip(text(call.pattern), 40)}`
    case 'Bash': {
      const said = text(call.description)
      if (said !== '') return clip(said, 90)

      return plainCommand(text(call.command), cwd)
    }
    case 'WebFetch': {
      try {
        return `Reading ${new URL(text(call.url)).host}`
      } catch {
        return 'Reading a web page'
      }
    }
    case 'WebSearch':
      return `Searching the web for "${clip(text(call.query), 40)}"`
    case 'Agent':
      return `Starting a helper: ${clip(text(call.description), 50)}`
    case 'SubagentHandback':
      return 'Reported back to the lead duck'
    case 'Skill':
      return `Using the ${text(call.skill)} skill`
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Updating its to-do list'
    case 'mcp__duckherd__plan':
      return 'Updating the plan'
    case 'mcp__duckherd__handoff':
      return `Writing a handoff for ${clip(text(call.session), 40)}`
    case 'mcp__duckherd__lesson':
      return 'Saving what we did to your learning log'
    default:
      if (tool.startsWith('mcp__')) {
        const [, server = '', name = ''] = tool.split('__')

        return `Using ${server} ${name}`.trim()
      }

      return `Using ${tool}`
  }
}

// Helpers on Haiku rarely describe their shell commands, so the common ones are put into words.
function plainCommand(command: string, cwd: string): string {
  const local = cwd === '' ? command : command.split(`${cwd}/`).join('').split(cwd).join('.')
  // Split on pipes and && only where spaces surround them, so a pattern like a\|b stays whole,
  // and skip set-up steps like `cd engine &&`.
  const parts = local.split(/\s+(?:\|\||&&|\||;)\s+/).map(p => p.trim())
  const first = parts.find(p => !/^(cd|export|source|set)\s/.test(p)) ?? parts[0] ?? ''
  const words = first.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  const [tool = '', ...rest] = words
  const args = rest.filter(w => !w.startsWith('-'))
  const unquote = (w: string) => w.replace(/^["']|["']$/g, '')
  const where = (w: string | undefined) => (w ? ` in ${shortPath(unquote(w), '')}` : '')

  switch (tool) {
    case 'grep':
    case 'rg':
    case 'ag': {
      const pattern = unquote(args[0] ?? '').replace(/\\\|/g, ' or ')

      return `Searching for "${clip(pattern, 40)}"${where(args[1])}`
    }
    case 'find':
    case 'fd': {
      const named = local.match(/-i?name\s+("[^"]*"|'[^']*'|\S+)/)?.[1]

      return `Looking for ${named ? `${unquote(named)} files` : 'files'}${where(args[0])}`
    }
    case 'cat':
    case 'head':
    case 'tail':
    case 'less':
    case 'sed':
    case 'awk':
    case 'wc':
      return `Reading ${shortPath(unquote(args[args.length - 1] ?? 'a file'), '')}`
    case 'ls':
    case 'tree':
      return `Listing ${shortPath(unquote(args[0] ?? 'the folder'), '')}`
    case 'git':
      return `Checking git ${args[0] ?? ''}`.trim()
    case 'gh':
      return `Asking GitHub: gh ${args.slice(0, 2).join(' ')}`
    case 'go':
      return args[0] === 'test' ? 'Running the Go tests' : `Running go ${args[0] ?? ''}`.trim()
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'npx':
      return `Running ${tool} ${args.slice(0, 2).join(' ')}`.trim()
    case 'make':
      return `Running make ${args[0] ?? ''}`.trim()
    default:
      return `Running ${clip(first, 60)}`
  }
}

// The first real sentence of a helper's report, for its card until Haiku's summary lands:
// headings, bold-only title lines and list numbers are skipped.
export function firstSentence(answer: string, max = 200): string {
  const lines = answer
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#') && !/^[-*]?\s*\*\*[^*]+\*\*:?$/.test(l) && !/^[-=|]{3,}/.test(l))
    .map(l => l.replace(/^([-*]|\d+[.)])\s+/, ''))
  const flat = lines.join(' ').replace(/[*`>]/g, '').replace(/\s+/g, ' ').trim()
  const end = flat.search(/[.!?](\s|$)/)
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat

  return clip(sentence, max)
}

export function clipText(value: string, max: number): string {
  return clip(value, max)
}

// Like clipText, but keeps the line breaks, so a report's lists and headings stay as written.
export function clipBlock(value: string, max: number): string {
  const block = stripControl(value).trim()

  return block.length > max ? `${block.slice(0, max - 1)}…` : block
}

// Every toast of Duckherd's goes through toastLine: one line of at most TOAST_MAX characters, the same line not
// again within a minute, and at most TOAST_PER_MINUTE a minute from one source (cleanup, usage, ...).
export const TOAST_MAX = 120
export const TOAST_PER_MINUTE = 4
export type ToastLog = { said: Map<string, number>; shown: Map<string, number[]> }

/** The line to show now, or undefined when it is a repeat or its source has had its share this minute. Notes it in `log`. */
export function toastLine(log: ToastLog, source: string, text: string, now: number): string | undefined {
  const line = clip(text, TOAST_MAX)
  if (line === '') return undefined
  const last = log.said.get(line)
  if (last !== undefined && now - last < 60_000) return undefined
  const recent = (log.shown.get(source) ?? []).filter(at => now - at < 60_000)
  if (recent.length >= TOAST_PER_MINUTE) return undefined
  log.shown.set(source, [...recent, now])
  log.said.set(line, now)
  if (log.said.size > 200) for (const [said, at] of log.said) if (now - at >= 60_000) log.said.delete(said)

  return line
}
