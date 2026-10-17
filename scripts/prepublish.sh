#!/bin/sh
# Duckherd prepublish checks. Run from anywhere inside the repo: sh scripts/prepublish.sh
#
#   1. gitleaks (if installed): the whole history, then the working tree.
#   2. a denylist, searched in tracked and untracked-but-not-ignored files, and in all of git history. The private list lives
#      outside the repo: $DUCKHERD_DENYLIST, default ~/.claude/mods/duckherd-denylist.txt. Without it, a small generic check runs.
#   3. file hygiene: no __pycache__, .pyc, .DS_Store, .env*, private theme files, or file over 3 MB.
#   4. the plugin tests (`claude plugin test .`, if the claude CLI is there) and the installer tests (scripts/test-install.sh).
#
# Flags: --scan-only runs 1 to 3 only (what CI runs; CI runs scripts/test-install.sh as its own step). Exit 0 only when nothing failed.
# POSIX sh; works with macOS (BSD) and Linux tools.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

scan_only=0
[ "${1:-}" = "--scan-only" ] && scan_only=1

fails=0
warns=0
fail() { printf 'FAIL  %s\n' "$1"; fails=$((fails + 1)); }
warn() { printf 'warn  %s\n' "$1"; warns=$((warns + 1)); }
ok() { printf 'ok    %s\n' "$1"; }

# Files that may exceed the size limit, one path per line (the demo recording in the README).
SIZE_ALLOW='docs/media/demo.gif'
SIZE_LIMIT=3145728

# ---------------------------------------------------------------- 1. gitleaks
if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --redact --no-banner --log-opts=--all >/dev/null 2>&1; then ok 'gitleaks: history clean'; else
    fail 'gitleaks found something in history (run: gitleaks detect --redact --log-opts=--all)'
  fi
  if gitleaks dir --redact --no-banner . >/dev/null 2>&1; then ok 'gitleaks: working tree clean'; else
    fail 'gitleaks found something in the working tree (run: gitleaks dir --redact .)'
  fi
else
  warn 'gitleaks is not installed, skipping the secret scan (brew install gitleaks); CI runs it'
fi

# ---------------------------------------------------------------- 2. denylist
denylist_file="${DUCKHERD_DENYLIST:-$HOME/.claude/mods/duckherd-denylist.txt}"
generic='/Users/[a-z]|/home/[a-z]|@[a-z0-9-]+\.(io|com)'
if [ -f "$denylist_file" ]; then
  pattern=$(grep -vE '^[[:space:]]*(#|$)' "$denylist_file" | paste -sd'|' -)
  [ -n "$pattern" ] || fail "denylist $denylist_file has no patterns"
else
  warn 'no private denylist found (set DUCKHERD_DENYLIST); running only the generic path and email check'
  pattern="$generic"
fi
if [ -n "$pattern" ]; then
  # --untracked: files not yet committed count too, so nothing slips in on the commit after this run.
  hits=$(git grep --untracked -n -I -iE -e "$pattern" -- . 2>/dev/null)
  binhits=$(git grep --untracked -l -a -iE -e "$pattern" -- . 2>/dev/null)
  if [ "$pattern" = "$generic" ]; then
    hits=$(printf '%s\n' "$hits" | grep -viE 'noreply|example\.(com|io)|/(Users|home)/(a|x|dev|me|user|you|name|username|foo|alice|bob)([^a-z]|$)' || true)
    [ -n "$hits" ] || binhits=''
  fi
  if [ -n "$hits" ] || [ -n "$binhits" ]; then
    fail 'denylist match in files:'
    [ -n "$hits" ] && printf '%s\n' "$hits" | cut -c1-200 | sed 's/^/        /'
    [ -n "$binhits" ] && printf '%s\n' "$binhits" | sed 's/^/        (binary or text) /'
  else
    ok 'denylist: no match in files'
  fi
  # Every commit's diff, message and author lines.
  hist=$(git log --all -p --no-color 2>/dev/null | grep -n -a -iE -e "$pattern" | grep -viE 'noreply|example\.(com|io)|/(Users|home)/(a|x|dev|me|user|you|name|username|foo|alice|bob)([^a-z]|$)' | head -20 | cut -c1-200)
  if [ -n "$hist" ]; then
    fail 'denylist match in git history (first lines of git log --all -p):'
    printf '%s\n' "$hist" | sed 's/^/        /'
  else
    ok 'denylist: no match in history'
  fi
fi

# ---------------------------------------------------------------- 3. file hygiene
listing=$(git ls-files --cached --others --exclude-standard)
bad=$(printf '%s\n' "$listing" | grep -iE '(^|/)__pycache__/|\.pyc$|(^|/)\.DS_Store$|(^|/)\.env|her[o]' || true)
if [ -n "$bad" ]; then
  fail 'files that must not be published:'
  printf '%s\n' "$bad" | sed 's/^/        /'
else
  ok 'hygiene: no pycache, .pyc, .DS_Store, .env or private theme files'
fi
big=''
while IFS= read -r f; do
  [ -f "$f" ] || continue
  size=$(wc -c <"$f" | tr -d ' ')
  if [ "$size" -gt "$SIZE_LIMIT" ] && ! printf '%s\n' "$SIZE_ALLOW" | grep -qxF -- "$f"; then big="$big
        $f ($size bytes)"; fi
done <<EOF2
$listing
EOF2
if [ -n "$big" ]; then fail "files over 3 MB:$big"; else ok 'hygiene: no file over 3 MB (apart from the allowed demo)'; fi

# ---------------------------------------------------------------- 4. tests
if [ "$scan_only" -eq 0 ]; then
  if command -v claude >/dev/null 2>&1 && claude plugin test --help >/dev/null 2>&1; then
    plugin_log="$(mktemp "${TMPDIR:-/tmp}/duckherd-plugin-test.XXXXXX")"
    trap 'rm -f "$plugin_log"' EXIT
    if claude plugin test . >"$plugin_log" 2>&1; then
      ok "plugin tests: $(grep -E '^ ?[0-9]+ pass' "$plugin_log" | head -1)"
    else
      fail 'plugin tests failed:'; tail -30 "$plugin_log" | sed 's/^/        /'
    fi
    rm -f "$plugin_log"
  else
    warn 'claude CLI not found (or no `plugin test`), skipping the plugin tests'
  fi
  install_log="$(sh scripts/test-install.sh 2>&1)"
  if [ $? -eq 0 ]; then ok "$(printf '%s\n' "$install_log" | tail -1)"; else
    fail 'installer tests failed:'; printf '%s\n' "$install_log" | grep -v '^ok ' | sed 's/^/        /'
  fi
fi

printf '\n%s failed, %s warning(s)\n' "$fails" "$warns"
[ "$fails" -eq 0 ]
