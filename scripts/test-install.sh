#!/bin/sh
# Tests for extras/install.sh. Run from anywhere inside the repo: sh scripts/test-install.sh
# Everything happens in a temporary folder with HOME pointed at it; the real rc files are never touched.
# POSIX sh; needs bash (the installer is a bash script). zsh, when present, also checks the zsh block's syntax.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
INSTALL="$PWD/extras/install.sh"
START='# >>> duckherd (added by claude-duckherd extras/install.sh) >>>'
END='# <<< duckherd <<<'

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/duckherd-install-test.XXXXXX")" || exit 1
trap 'rm -rf "$SCRATCH"' EXIT
HOME="$SCRATCH/home"
SHELL=/bin/zsh
export HOME SHELL
mkdir -p "$HOME"
RC="$HOME/.zshrc"

fails=0
passes=0
pass() { printf 'ok    %s\n' "$1"; passes=$((passes + 1)); }
fail() { printf 'FAIL  %s\n' "$1"; fails=$((fails + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# install [args...]: runs the installer on $RC; its stdout and stderr land in $SCRATCH/out and $SCRATCH/err.
install() { bash "${SCRIPT:-$INSTALL}" --rc "$RC" "$@" >"$SCRATCH/out" 2>"$SCRATCH/err"; }

# ---------------------------------------------------------------- install, then uninstall (zsh)
printf 'export A=1\n' >"$RC"
install; code=$?
check 'zsh: install exits 0' '[ "$code" -eq 0 ]'
check 'zsh: the block is in the rc file' 'grep -qxF -- "$START" "$RC" && grep -qxF -- "$END" "$RC"'
check 'zsh: the block answers to duckherd' 'grep -q "duckherd)" "$RC"'
check 'zsh: no dashboard command' '! grep -qi dashboard "$RC"'
check 'zsh: bash -n accepts the rc file' 'bash -n "$RC"'
if command -v zsh >/dev/null 2>&1; then check 'zsh: zsh -n accepts the rc file' 'zsh -n "$RC"'; fi
cp "$RC" "$SCRATCH/installed"
install
check 'zsh: running again changes nothing' 'cmp -s "$RC" "$SCRATCH/installed" && grep -q "Already installed" "$SCRATCH/out"'
install --uninstall; code=$?
check 'zsh: uninstall exits 0' '[ "$code" -eq 0 ]'
check 'zsh: uninstall leaves no duckherd line' '! grep -q duckherd "$RC"'
check 'zsh: uninstall keeps the rest' 'grep -qxF "export A=1" "$RC"'
check 'zsh: a backup is made before each change' '[ "$(ls -a "$HOME" | grep -c "^\.zshrc\.duckherd-backup-")" -ge 2 ]'

# ---------------------------------------------------------------- --alias
printf 'export A=1\n' >"$RC"
install --alias conductor
check '--alias conductor: answers to both words' 'grep -qF "duckherd|conductor)" "$RC"'
install --alias 'rm -rf'; code=$?
check '--alias refuses anything but one plain word' '[ "$code" -eq 2 ]'
install --uninstall

# ---------------------------------------------------------------- bash
RC="$HOME/.bashrc"
printf 'export B=2\n' >"$RC"
install; code=$?
check 'bash: install exits 0' '[ "$code" -eq 0 ]'
check 'bash: bash -n accepts the rc file' 'bash -n "$RC"'
check 'bash: claude() is defined, with duckherd and without dashboard' \
  'bash -c ". \"$RC\"; declare -f claude" >"$SCRATCH/fn" 2>/dev/null && grep -q "duckherd)" "$SCRATCH/fn" && ! grep -qi dashboard "$SCRATCH/fn"'
install --uninstall
check 'bash: uninstall leaves only what was there' '[ "$(cat "$RC")" = "export B=2" ]'
RC="$HOME/.zshrc"

# ---------------------------------------------------------------- a block an older version wrote (0.3.0, with `claude dashboard`)
old_block() {
  printf 'export A=1\n\n%s\n' "$START"
  cat <<'EOF'
# Remove with: '/old/clone'/extras/install.sh --uninstall
_DUCKHERD_DIR='/old/clone'
_duckherd_install_claude() {
  [[ "${functions[claude]-}" == *_DUCKHERD_DIR* ]] && return
  builtin unalias claude 2>/dev/null
  claude() {
    local -a run
    run=(command claude)
    case "$1" in
      duckherd|conductor)
        shift
        "${run[@]}" --plugin-dir "$_DUCKHERD_DIR" "$@"
        ;;
      dashboard)
        shift
        if [[ -f "$_DUCKHERD_DIR/extras/dashboard/dashboard.py" ]]; then
          python3 "$_DUCKHERD_DIR/extras/dashboard/dashboard.py" "$@"
        elif [[ -f "$HOME/.claude/duckherd/dashboard.py" ]]; then
          python3 "$HOME/.claude/duckherd/dashboard.py" "$@"
        else
          print "The dashboard program is missing. Start claude duckherd once to install it."
        fi
        ;;
      *)
        "${run[@]}" "$@"
        ;;
    esac
  }
}
_duckherd_install_claude
autoload -Uz add-zsh-hook
add-zsh-hook precmd _duckherd_install_claude
EOF
  printf '%s\nexport C=3\n' "$END"
}
old_block >"$RC"
install --uninstall; code=$?
check 'old 0.3.0 block: uninstall removes it' '[ "$code" -eq 0 ] && ! grep -q -e duckherd -e dashboard "$RC"'
check 'old 0.3.0 block: uninstall keeps the lines around it' 'grep -qxF "export A=1" "$RC" && grep -qxF "export C=3" "$RC"'
old_block >"$RC"
install; code=$?
check 'old 0.3.0 block: install replaces it with one new block' \
  '[ "$code" -eq 0 ] && [ "$(grep -cxF -- "$START" "$RC")" -eq 1 ] && ! grep -qi dashboard "$RC" && ! grep -q /old/clone "$RC"'
install --uninstall

# ---------------------------------------------------------------- incomplete blocks change nothing
n=0
for text in "$(printf 'a=1\n%s\nold\nexport KEEP=me' "$START")" \
            "$(printf 'a=1\n%s\nmine\n%s\nkeep=1' "$END" "$START")" \
            "$(printf '%s\nx\n%s\ny\n%s\nz' "$START" "$START" "$END")" \
            "$(printf 'a=1\n%s  \nmine\n%s' "$START" "$END")"; do
  n=$((n + 1))
  for mode in --uninstall install; do
    printf '%s\n' "$text" >"$RC"
    cp "$RC" "$SCRATCH/before"
    rm -f "$HOME"/.zshrc.duckherd-backup-*
    if [ "$mode" = install ]; then install; else install --uninstall; fi
    code=$?
    check "incomplete block $n ($mode): refused, file unchanged, says to fix it by hand, no backup" \
      '[ "$code" -ne 0 ] && cmp -s "$RC" "$SCRATCH/before" && grep -q "by hand" "$SCRATCH/err" && ! ls -a "$HOME" | grep -q "^\.zshrc\.duckherd-backup-"'
  done
done

# ---------------------------------------------------------------- control characters in the clone path
nl="$(printf '\n.')"; nl="${nl%.}"
n=0
for name in "clone${nl}alias ls=rm" "$(printf 'clone\033]52;c;eA==\007')" "trail${nl}"; do
  clone="$(mktemp -d "$SCRATCH/c.XXXXXX")/$name"
  mkdir -p "$clone/extras" "$clone/.claude-plugin"
  cp "$INSTALL" "$clone/extras/install.sh"
  printf '{}' >"$clone/.claude-plugin/plugin.json"
  printf 'a=1\n' >"$RC"
  SCRIPT="$clone/extras/install.sh" install; code=$?
  n=$((n + 1))
  case $n in 1) what='a newline' ;; 2) what='an escape sequence' ;; *) what='a trailing newline' ;; esac
  check "a clone path with $what in it is refused" \
    '[ "$code" -eq 1 ] && grep -q "control character" "$SCRATCH/err" && [ "$(cat "$RC")" = "a=1" ]'
done

# ---------------------------------------------------------------- macOS: bash goes to ~/.bash_profile; an old ~/.bashrc block moves
if [ "$(uname -s)" = Darwin ]; then
  rm -f "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"
  printf 'export P=1\n' >"$HOME/.profile"
  RC="$HOME/.bashrc"; printf 'export B=2\n' >"$RC"; install; RC="$HOME/.zshrc"
  SHELL=/bin/bash bash "$INSTALL" >"$SCRATCH/out" 2>"$SCRATCH/err"; code=$?
  check 'macOS bash: installs into ~/.bash_profile, which loads ~/.profile and ~/.bashrc' \
    '[ "$code" -eq 0 ] && grep -qxF -- "$START" "$HOME/.bash_profile" && grep -q "\. ~/.profile" "$HOME/.bash_profile" && grep -q "\. ~/.bashrc" "$HOME/.bash_profile"'
  check 'macOS bash: the old ~/.bashrc block is removed' '! grep -q duckherd "$HOME/.bashrc" && grep -qxF "export B=2" "$HOME/.bashrc"'
  SHELL=/bin/bash bash "$INSTALL" --uninstall >"$SCRATCH/out" 2>"$SCRATCH/err"
  check 'macOS bash: uninstall empties ~/.bash_profile of the block' '! grep -q duckherd "$HOME/.bash_profile"'
fi

printf '\ninstaller tests: %s passed, %s failed\n' "$passes" "$fails"
[ "$fails" -eq 0 ]
