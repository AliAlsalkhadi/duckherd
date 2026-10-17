// A helper's work, live, in a terminal tab of its own: a small script the mod writes beside its data
// and runs there. It follows the helper's own record of its work (the transcript Claude Code keeps
// for it) and prints each step as it happens.
export const WATCH_SCRIPT = String.raw`# Follows one Duckherd helper's work as it happens, for a tab of its own. Written by Duckherd;
# run as: python3 watch-helper.py <session id> <helper id> <letter> <#colour> [--once]
import glob
import json
import os
import re
import shutil
import sys
import textwrap
import time
from datetime import datetime

DIM, BOLD, RED, GREEN, AMBER, RESET = '\x1b[2m', '\x1b[1m', '\x1b[38;2;238;139;128m', '\x1b[38;2;121;199;155m', '\x1b[38;2;227;168;87m', '\x1b[0m'

# Escape sequences and other control characters (all but tab and newline) in what the helper's tools
# returned or it wrote: printed raw, they would drive this terminal (rewrite the clipboard, the title).
ESCAPES = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[P^_X][^\x1b]*(?:\x1b\\)?|[ -/]*[0-~])?')
CONTROLS = re.compile(r'[\x00-\x08\x0b-\x1f\x7f-\x9f]')


def safe(text):
    return CONTROLS.sub('', ESCAPES.sub('', str(text).replace('\r\n', '\n')))


def colour(hex_):
    h = hex_.lstrip('#')
    if len(h) != 6:
        return ''
    return '\x1b[38;2;%d;%d;%dm' % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def width():
    return max(40, shutil.get_terminal_size((100, 40)).columns - 4)


def wrap(text, indent='  ', style=''):
    out = []
    for para in safe(text).splitlines():
        if para.strip() == '':
            out.append('')
            continue
        lines = textwrap.wrap(para, width(), initial_indent=indent, subsequent_indent=indent, replace_whitespace=False, drop_whitespace=True) or [indent]
        out.extend(style + l + (RESET if style else '') for l in lines)
    return '\n'.join(out)


def short(path, cwd):
    path = safe(path)
    if cwd and path.startswith(cwd + '/'):
        path = path[len(cwd) + 1:]
    parts = path.split('/')
    return '…/' + '/'.join(parts[-2:]) if len(parts) > 3 else path


def clip(text, n):
    one = ' '.join(safe(text).split())
    return one if len(one) <= n else one[: n - 1] + '…'


def describe(name, args, cwd):
    f = short(str(args.get('file_path') or args.get('notebook_path') or ''), cwd)
    if name == 'Read':
        return 'Reading ' + f
    if name in ('Edit', 'MultiEdit', 'NotebookEdit'):
        return 'Editing ' + f
    if name == 'Write':
        return 'Writing ' + f
    if name == 'Grep':
        where = short(str(args.get('path') or ''), cwd)
        return 'Searching the code for "%s"%s' % (clip(args.get('pattern', ''), 60), ' in ' + where if where else '')
    if name == 'Glob':
        return 'Looking for files named ' + clip(args.get('pattern', ''), 60)
    if name in ('Bash', 'PowerShell'):
        said = clip(args.get('description') or '', 200)
        command = clip(args.get('command', ''), 120)
        return (said + '\n' + DIM + '    $ ' + command + RESET) if said else '$ ' + command
    if name == 'WebFetch':
        return 'Reading ' + clip(args.get('url', ''), 80)
    if name == 'WebSearch':
        return 'Searching the web for "%s"' % clip(args.get('query', ''), 60)
    if name == 'SubagentHandback':
        return 'Reporting back to the lead duck'
    if name in ('TodoWrite', 'TaskCreate', 'TaskUpdate'):
        return 'Updating its to-do list'
    if name == 'Skill':
        return 'Using the %s skill' % clip(args.get('skill', ''), 60)
    name = clip(name, 80)
    if name.startswith('mcp__'):
        parts = name.split('__')
        return 'Using %s (%s)' % (parts[2] if len(parts) > 2 else name, parts[1] if len(parts) > 1 else '')
    return name + ' ' + clip(json.dumps(args), 80)


def result_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(str(p.get('text', '')) for p in content if isinstance(p, dict) and p.get('type') == 'text')
    return ''


def clock(at, start):
    s = max(0, int(at - start))
    return '%d:%02d' % (s // 60, s % 60)


def stamp(entry):
    try:
        return datetime.fromisoformat(str(entry.get('timestamp', '')).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def main():
    if len(sys.argv) < 5:
        print('usage: watch-helper.py <session id> <helper id> <letter> <#colour> [--once]')
        return 2
    session, agent, letter, hex_ = sys.argv[1:5]
    letter = clip(letter, 20)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', session) or not re.fullmatch(r'[A-Za-z0-9_-]+', agent):
        print('watch-helper.py: the session and helper ids are letters, digits, - and _ only')
        return 2
    once = '--once' in sys.argv[5:]
    tint = colour(hex_)
    pattern = os.path.expanduser('~/.claude/projects/*/%s/subagents/agent-%s.jsonl' % (session, agent))

    path = None
    for tries in range(240):
        found = glob.glob(pattern)
        if found:
            path = found[0]
            break
        if tries == 0:
            print(DIM + "Waiting for helper %s's work to show up…" % letter + RESET)
        if once:
            break
        time.sleep(0.5)
    if path is None:
        print("Couldn't find helper %s's work in this session's records." % letter)
        return 1

    meta = {}
    try:
        with open(path[: -len('.jsonl')] + '.meta.json') as f:
            meta = json.load(f)
    except (OSError, ValueError):
        pass
    model = clip(meta.get('model') or '', 40).capitalize()
    print(tint + BOLD + 'HELPER %s' % letter + RESET + BOLD + ' · ' + clip(meta.get('description') or '', 200) + RESET)
    print(DIM + ' · '.join(p for p in (model, 'live: close this tab or press Ctrl+C to stop watching') if p) + RESET)
    print()

    start = None
    asked = False
    names = {}
    buffer = ''
    with open(path) as f:
        while True:
            chunk = f.read()
            if chunk:
                buffer += chunk
                *lines, buffer = buffer.split('\n')
                for raw in lines:
                    try:
                        entry = json.loads(raw)
                    except ValueError:
                        continue
                    at = stamp(entry)
                    if start is None and at is not None:
                        start = at
                    when = DIM + clock(at or 0, start or 0).rjust(5) + RESET + ' '
                    cwd = str(entry.get('cwd') or '')
                    content = (entry.get('message') or {}).get('content')
                    kind = entry.get('type')
                    if kind == 'user' and isinstance(content, str):
                        # The engine's own notes to the helper, not part of its work.
                        content = re.sub(r'<system-reminder>.*?</system-reminder>', '', content, flags=re.S)
                        if content.strip() == '':
                            continue
                        if not asked:
                            asked = True
                            lines_ = content.strip().splitlines()
                            print(BOLD + 'ASKED TO' + RESET)
                            print(wrap('\n'.join(lines_[:25]), style=DIM))
                            if len(lines_) > 25:
                                print(DIM + '  … %d more lines' % (len(lines_) - 25) + RESET)
                            print()
                        else:
                            print(BOLD + 'MESSAGE' + RESET)
                            print(wrap(content.strip()))
                            print()
                        continue
                    if not isinstance(content, list):
                        continue
                    for part in content:
                        if not isinstance(part, dict):
                            continue
                        t = part.get('type')
                        if kind == 'assistant' and t == 'text' and str(part.get('text', '')).strip():
                            print()
                            print(wrap(str(part['text']).strip()))
                            print()
                        elif kind == 'assistant' and t == 'tool_use':
                            name = str(part.get('name', ''))
                            names[part.get('id')] = name
                            args = part.get('input') or {}
                            print(when + tint + '●' + RESET + ' ' + describe(name, args, cwd))
                            if name == 'SubagentHandback':
                                report = '\n'.join(str(v) for v in args.values() if isinstance(v, str))
                                if report.strip():
                                    print()
                                    print(BOLD + 'REPORT' + RESET)
                                    print(wrap(report.strip()))
                                print()
                                print(GREEN + '✓ Finished: it reported back to the lead duck.' + RESET)
                        elif kind == 'user' and t == 'tool_result':
                            text = result_text(part.get('content')).strip()
                            name = names.get(part.get('tool_use_id'), '')
                            if part.get('is_error'):
                                print('      ' + RED + '⎿ ' + clip(text or 'failed', width() - 8) + RESET)
                            elif name in ('SubagentHandback',):
                                continue
                            elif name == 'Read' and text:
                                print('      ' + DIM + '⎿ %d lines' % len(text.splitlines()) + RESET)
                            elif text:
                                lines_ = text.splitlines()
                                first = clip(lines_[0], width() - 8)
                                more = '  (+%d lines)' % (len(lines_) - 1) if len(lines_) > 1 else ''
                                print('      ' + DIM + '⎿ ' + first + more + RESET)
                sys.stdout.flush()
            elif once:
                return 0
            else:
                time.sleep(0.5)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        sys.exit(0)
`

function quoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function watchCommand(script: string, sessionId: string, agentId: string, letter: string, color: string): string {
  return ['python3', script, sessionId, agentId, letter, color].map(quoted).join(' ')
}
