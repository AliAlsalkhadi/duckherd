// A newer Duckherd on disk than the one this session loaded: the pure parts, so tests can reach them.
//
// A session never reloads its plugin, so an update lands only in sessions started after it. Two ways it lands:
//  - an installed plugin (`claude plugin install` / `update`): Claude Code puts each version in its own folder
//    and points installed_plugins.json at it. The copy this session loaded stays where it was, so the entry
//    that pointed at this session's folder at start pointing elsewhere now means a newer copy is installed.
//  - a folder loaded with --plugin-dir (a clone, `claude duckherd`): a pull changes the files in place, so the
//    version in its plugin.json changing since start means newer code is there.

import { shellQuote } from './changes'

export type Installed = { key: string; installPath: string; version?: string }

/** The version in a plugin.json's text, or undefined. */
export function versionOf(manifest: string): string | undefined {
  try {
    const v = (JSON.parse(manifest) as { version?: unknown }).version

    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
  } catch {
    return undefined
  }
}

/** The entries of installed_plugins.json for the plugin named `name` (keys `<name>@<marketplace>`), any scope. */
export function installsOf(json: string, name: string): Installed[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  const plugins = typeof raw === 'object' && raw !== null ? (raw as { plugins?: unknown }).plugins : undefined
  if (typeof plugins !== 'object' || plugins === null) return []
  const out: Installed[] = []
  for (const [key, entries] of Object.entries(plugins as Record<string, unknown>)) {
    if (!key.startsWith(`${name}@`) || !Array.isArray(entries)) continue
    for (const e of entries) {
      const it = typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : {}
      if (typeof it.installPath !== 'string' || it.installPath === '') continue
      out.push({ key, installPath: it.installPath, ...(typeof it.version === 'string' ? { version: it.version } : {}) })
    }
  }

  return out
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/** The keys of the installed entries that point at this session's own folder: read once, at start. */
export function ownInstalls(root: string, installs: Installed[]): string[] {
  return [...new Set(installs.filter(i => samePath(i.installPath, root)).map(i => i.key))]
}

type Newer = { version: string | undefined; isInstalled: boolean }

/**
 * Whether a newer copy than the loaded one is on disk. `loaded`: this session's folder, its version at start and
 * the installed entries that pointed at it then. `installs`: the entries now. `rootVersion`: the version in the
 * folder's plugin.json now.
 */
export function newerOnDisk(i: { root: string; loadedVersion: string | undefined; ownKeys: string[]; installs: Installed[]; rootVersion: string | undefined }): Newer | undefined {
  const moved = i.installs.find(x => i.ownKeys.includes(x.key) && !samePath(x.installPath, i.root))
  if (moved !== undefined) return { version: moved.version, isInstalled: true }
  if (i.loadedVersion !== undefined && i.rootVersion !== undefined && i.rootVersion !== i.loadedVersion) return { version: i.rootVersion, isInstalled: i.ownKeys.length > 0 }

  return undefined
}

/**
 * What a new tab runs to carry on this session on the newer copy: plain `claude --resume <id>` for an installed
 * plugin (Claude Code loads the installed copy), with `--plugin-dir <folder>` for a folder loaded that way. Every
 * word quoted; undefined when the id has characters a command line can't take safely.
 */
export function restartLine(i: { sessionId: string; root: string; isInstalled: boolean }): string | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(i.sessionId)) return undefined
  const argv = ['claude', ...(i.isInstalled ? [] : ['--plugin-dir', i.root]), '--resume', i.sessionId]

  return argv.map(w => (/^[A-Za-z0-9_./-]+$/.test(w) ? w : shellQuote(w))).join(' ')
}

/** The same line for a terminal of the person's own: into the session's folder first. */
export function pasteLine(cwd: string, line: string): string {
  return cwd === '' ? line : `cd ${shellQuote(cwd)} && ${line}`
}
