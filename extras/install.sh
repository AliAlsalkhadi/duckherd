#!/usr/bin/env bash
# Adds a command to your shell, for a clone of this repo:
#
#   claude duckherd    starts Claude Code with Duckherd loaded (claude --plugin-dir <this clone>)
#
# Plain `claude` stays as it was, so Duckherd (which changes how a session works) loads only when you ask.
# Works for bash and zsh. Safe to run again: it replaces its own block in your rc file, never adds a second.
#
#   extras/install.sh                    install (the rc file is ~/.zshrc, or ~/.bashrc (~/.bash_profile on a Mac), by your login shell)
#   extras/install.sh --rc FILE          use this rc file instead
#   extras/install.sh --alias conductor  also answer to `claude conductor`
#   extras/install.sh --uninstall        remove the block again
#
# The rc file is copied to FILE.duckherd-backup-<time> before it is changed. Nothing else is touched:
# Duckherd's own files stay in ~/.claude/duckherd/ (lessons, status files); delete that folder yourself if
# you want them gone. Install and --uninstall also replace or remove a block an older version wrote.
set -eu

START='# >>> duckherd (added by claude-duckherd extras/install.sh) >>>'
END='# <<< duckherd <<<'

# (the trailing "." keeps $(...) from eating a newline at the end of the path, so has_control below sees it)
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P && echo .)"
here="${here%$'\n.'}"
repo="${here%/*}"

# True when $1 holds a control character (a newline, ESC, DEL, ...). A clone path with one could break out of the
# rc block's comment or quotes, or send escapes to the terminal, so it is refused rather than written anywhere.
has_control() {
  case "$1" in
    *[[:cntrl:]]*) return 0 ;;
  esac
  [ "$(printf '%s' "$1" | LC_ALL=C tr -d '\000-\037\177')" != "$1" ]
}

if has_control "$repo"; then
  echo "The path of this clone has a control character (a newline or similar) in it, so I won't write it into a shell rc file." >&2
  echo "Move or rename the clone to a plain path, then run this again." >&2
  exit 1
fi
rc=''
old_rc=''
alias_name=''
mode='install'

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) mode='uninstall' ;;
    --rc)
      [ $# -ge 2 ] || { echo "--rc needs a file" >&2; exit 2; }
      rc="$2"
      shift
      ;;
    --alias)
      [ $# -ge 2 ] || { echo "--alias needs a word" >&2; exit 2; }
      alias_name="$2"
      shift
      ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --help)" >&2
      exit 2
      ;;
  esac
  shift
done

case "$alias_name" in
  *[!A-Za-z0-9_-]*)
    echo "--alias takes one plain word, such as conductor" >&2
    exit 2
    ;;
esac

# Which rc file, and which kind of shell it is for.
if [ -z "$rc" ]; then
  case "$(basename "${SHELL:-}")" in
    zsh) rc="$HOME/.zshrc" ;;
    bash)
      # On a Mac, Terminal and Ghostty start login shells, and bash reads ~/.bash_profile for those, not ~/.bashrc.
      # Earlier versions wrote ~/.bashrc there, so that file is looked at too (see old_rc below).
      if [ "$(uname -s)" = 'Darwin' ]; then rc="$HOME/.bash_profile"; old_rc="$HOME/.bashrc"; else rc="$HOME/.bashrc"; fi
      ;;
    *)
      echo "I only know bash and zsh (your login shell is '${SHELL:-unknown}'). Pass --rc FILE to pick the file." >&2
      exit 1
      ;;
  esac
fi
if has_control "$rc"; then
  echo "The rc file path has a control character in it; pass a plain path with --rc." >&2
  exit 2
fi
case "$(basename "$rc")" in
  *zsh*) flavour='zsh' ;;
  *) flavour='bash' ;;
esac

# `sh`-quotes a path so it can sit inside the rc file.
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# What the rc file holds of ours: "none", "ok" (complete blocks only: each begin marker on a line of its own, then its
# end marker, never nested) or "broken" (a marker missing, out of order, nested, or not on a line of its own). Only an
# "ok" file is ever rewritten, so a lost end marker can't make us delete the rest of someone's rc file.
block_state() {
  [ -f "$rc" ] || { echo none; return; }
  awk -v s="$START" -v e="$END" '
    $0 == s { if (open) bad = 1; open = 1; n++; next }
    $0 == e { if (!open) bad = 1; open = 0; next }
    index($0, s) || index($0, e) { bad = 1 }
    END { if (open) bad = 1; print (bad ? "broken" : (n ? "ok" : "none")) }
  ' "$rc"
}

# Stops, changing nothing, when the block isn't complete; says what to remove by hand.
refuse_broken() {
  echo "$rc has a Duckherd block that isn't complete (a begin or end marker is missing, out of order or changed)," >&2
  echo "so I changed nothing. Remove the Duckherd lines by hand; the markers are on these lines:" >&2
  grep -nF -e "$START" -e "$END" "$rc" | LC_ALL=C tr -d '\000-\010\013-\037\177' >&2 || true
  echo "The block starts at a line '$START'" >&2
  echo "and ends at a line '$END'; delete both and everything between them, then run this again." >&2
  exit 1
}

# The rc file without our block (only called on an "ok" file).
without_block() {
  awk -v s="$START" -v e="$END" '
    $0 == s { skip = 1; next }
    $0 == e { skip = 0; next }
    !skip { print }
  ' "$rc"
}

backup() {
  [ -f "$rc" ] || return 0
  local stamp copy
  stamp="$(date +%Y%m%d-%H%M%S)"
  copy="$rc.duckherd-backup-$stamp-$$"
  cp -p "$rc" "$copy"
  echo "Backed up $rc to $copy"
}

block_text() {
  local dir names
  dir="$(quote "$repo")"
  names='duckherd'
  [ -n "$alias_name" ] && names="duckherd|$alias_name"
  echo "$START"
  echo "# Remove with: $dir/extras/install.sh --uninstall"
  echo "_DUCKHERD_DIR=$dir"
  if [ "$flavour" = 'zsh' ]; then
    # cmux puts its own wrapper over `claude` when its first prompt shows; this puts ours back on top of
    # it and hands on to it, so cmux's session tracking stays on. claude() holds everything itself:
    # Claude Code's shell snapshot keeps a function but drops helpers whose names start with "_".
    cat <<EOF
_duckherd_install_claude() {
  [[ "\${functions[claude]-}" == *_DUCKHERD_DIR* ]] && return
  builtin unalias claude 2>/dev/null
  claude() {
    local -a run
    if (( \$+functions[_cmux_claude_wrapper_command] )); then
      run=(_cmux_claude_wrapper_command)
    else
      run=(command claude)
    fi
    case "\$1" in
      $names)
        shift
        "\${run[@]}" --plugin-dir "\$_DUCKHERD_DIR" "\$@"
        ;;
      *)
        "\${run[@]}" "\$@"
        ;;
    esac
  }
}
_duckherd_install_claude
autoload -Uz add-zsh-hook
add-zsh-hook precmd _duckherd_install_claude
EOF
  else
    cat <<EOF
claude() {
  case "\${1-}" in
    $names)
      shift
      command claude --plugin-dir "\$_DUCKHERD_DIR" "\$@"
      ;;
    *)
      command claude "\$@"
      ;;
  esac
}
EOF
  fi
  echo "$END"
}

# A block an earlier version left in ~/.bashrc on a Mac: uninstall takes it out of there when ~/.bash_profile has none,
# and otherwise (and on install, so the two files never both load it) it is removed in a run of its own first.
if [ -n "$old_rc" ] && [ -f "$old_rc" ] && grep -qF -e "$START" "$old_rc"; then
  if [ "$mode" = 'uninstall' ] && [ "$(block_state)" = 'none' ]; then
    rc="$old_rc"
  else
    "${BASH:-bash}" "${BASH_SOURCE[0]}" --uninstall --rc "$old_rc" || echo "Left $old_rc alone; remove its Duckherd lines by hand." >&2
  fi
fi

state="$(block_state)"
if [ "$state" = 'broken' ]; then
  refuse_broken
fi

if [ "$mode" = 'uninstall' ]; then
  if [ "$state" != 'ok' ]; then
    echo "Nothing to remove: $rc has no Duckherd block."
    exit 0
  fi
  backup
  tmp="$(mktemp)"
  without_block > "$tmp"
  cat "$tmp" > "$rc"
  rm -f "$tmp"
  echo "Removed the Duckherd block from $rc. Open a new terminal tab for it to take effect."
  echo "Left alone: ~/.claude/duckherd/ (lessons, status files). Delete it yourself if you want it gone."
  exit 0
fi

if [ ! -f "$repo/.claude-plugin/plugin.json" ]; then
  echo "This does not look like a duckherd clone: $repo/.claude-plugin/plugin.json is missing." >&2
  exit 1
fi

mkdir -p "$(dirname "$rc")"
if [ ! -f "$rc" ]; then
  : > "$rc"
  # A new ~/.bash_profile on a Mac would hide ~/.profile (bash reads only the first of ~/.bash_profile, ~/.bash_login and
  # ~/.profile), and login shells never read ~/.bashrc; so a new one first loads what is there.
  if [ "$rc" = "$HOME/.bash_profile" ] && [ "$(uname -s)" = 'Darwin' ]; then
    [ ! -f "$HOME/.profile" ] || echo '[ -f ~/.profile ] && . ~/.profile' >> "$rc"
    [ ! -f "$HOME/.bashrc" ] || echo '[ -f ~/.bashrc ] && . ~/.bashrc' >> "$rc"
  fi
fi
stripped="$(mktemp)"
tmp="$(mktemp)"
if [ "$state" = 'ok' ]; then without_block > "$stripped"; else cat "$rc" > "$stripped"; fi
{
  cat "$stripped"
  # A blank line before the block, unless the file is empty or already ends with one.
  if [ -s "$stripped" ] && [ -n "$(tail -n 1 "$stripped")" ]; then echo; fi
  block_text
} > "$tmp"
rm -f "$stripped"

if cmp -s "$tmp" "$rc"; then
  rm -f "$tmp"
  echo "Already installed in $rc; nothing to change."
  exit 0
fi

backup
cat "$tmp" > "$rc"
rm -f "$tmp"
echo "Installed in $rc."
echo "Open a new terminal tab (or run: source $rc), then:"
echo "  claude duckherd     Claude Code with Duckherd loaded"
echo "Plain claude is unchanged. Remove it all again with: $repo/extras/install.sh --uninstall"
