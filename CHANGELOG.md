# Changelog

## Unreleased

- The usage card's gauges show what is used, not what is left: ctx 7% rather than 93%, and the bar fills as it is used (the cache's still shows its time left). Each meter has its own colour while calm (ctx cyan, the 5-hour blue, the week magenta, the cache mint), turning warning and error at the same lines as before, and the gaps between them are narrower. The reset times are coloured by how much of their window is left: green under 20% (under an hour of the 5-hour, about 1.4 days of the week), amber up to 60%, orange beyond.
- The "ctx" and "cache" labels take their meter's colour (the cache's follows its bar through warning and cold).
- New card colours: the context and usage card is soft violet (was teal) and the plan card sea green (was the theme accent), border, heading, bar and the doing marker. To stay apart from the violet, the 5-hour meter is a lighter sky blue and the week's pink.

## 0.4.7 - 2026-10-16

- Fixed: on Claude Code 2.1.287 to 2.1.300 the hooks module refused to load ("declared more than once in this file"), so Duckherd did nothing. Two functions shared their names with locals (`off` is now `switchedOff`, and the git runner `gitRun`).
- Duckherd now needs Claude Code 2.1.295 or newer: older versions reject the tab buttons' styled text, so the panel could not draw. The plugin tests pass on 2.1.295 and later, and CI runs them on 2.1.295 and fails when they fail.
- Panel spacing: earlier tasks in the helpers card sit on consecutive rows (opening one still shows its helpers beneath it), and the first card sits right under the tab bar, and the usage card right on the first card of the other tabs, with no blank rows.

## 0.4.6 - 2026-10-16

- The panel is cards. The Agents tab has a lead duck card (the task, its branch, the project and the model with its effort), a context and usage card of gauges, a plan card and a helpers card, stacked with no rules or blank rows between them. The gauges show what is left (no "5h" or "7d" labels) and the prompt cache is one of them. The Git tab is a worktrees card and a changes card, and the Sessions tab is one card per group.
- The context and usage card sits on top of every tab, and the band above the prompt steps aside whenever the panel shows. Card outlines stand apart: teal for usage, gold for the lead duck, orange for the helpers.
- The lead duck's card is tighter: no blank row under the task or before the project line.
- A "Why <model>/<effort>" line that says default, usual, normal or auto for the effort counts as no effort given.

## 0.4.5 - 2026-10-15

- In the Agents tab the status band is a divider: a dim full-width `─` rule above and below it, always right under the task block (never beside the duck) and right above the plan, no blank rows round them; the rules stay dim when meters run hot. The branch shows once, in the band (✓ or ●): the task line drops "on <branch>" unless its branch differs from the band's (another worktree's, say). Short of room, the band now shortens the folder name before it drops the branch. Above the prompt (panel closed or on another tab) the band is as before, without rules.
- Smaller requests, about 2k fewer tokens each: 8 duck agent types instead of 42 (names are reused, with letters added past 8), the handoff and lesson tools load on demand, and the lead duck's instructions are shorter.

## 0.4.4 - 2026-10-15

- A helper's "tests pass" now counts test runs it handed to a shell (`bash -c "…"`, `sh -c '…'`, `zsh -lc "…"`), ran inside `$( … )` or backticks (`out=$(claude plugin test . 2>&1)`), or ran with flags before the subcommand (`claude --debug plugin test .`). A runner only named in text, such as `echo "claude plugin test"` or `bash -c "echo claude plugin test"`, still doesn't count.
- A test run sent to the background is no longer counted as a pass the moment it starts. Its result is unseen until the run's completion notice comes in: a nonzero exit, or output showing failures (even when piped into `tail`, which exits 0), makes it a failed run; otherwise it passed. A "tests pass" with only an unseen background run gets a softer note for the lead duck ("its tests ran in the background, result not seen"), not "ran none".

## 0.4.3 - 2026-10-15

- With the panel showing its Agents tab, the status band sits in it, right under the task (the duck, the branch, effort and "Helpers run on") and right above the plan, at the panel's width, and the row above the prompt goes back to Claude Code's own notices. With the panel closed, behind another pane or on another tab, the band stays above the prompt as before.
- The top of the Agents tab packs tighter: no blank row between the task and the band or between the band and the plan, and when the text beside the duck is shorter than the duck, the band takes the row left blank beside it.
- The band's usage is shorter: `ctx 22%` for the context, and the 5-hour and weekly meters as just the share used and the time to the reset (`37% 1h 23m   6% 6d`: hours are the 5-hour window, days the week), no "5h", "week" or "resets". Colours and warning lines are as before.
- A helper's "tests pass" is no longer flagged "ran none the mod saw" when it ran `scripts/prepublish.sh`, or `scripts/test-install.sh`, alone or after `cd <dir> &&`. A `prepublish.sh --scan-only` run, which tests nothing, and a `tsc` type-check still don't count.

## 0.4.2 - 2026-10-15

- The band above the prompt wears your old status line's colours again: the folder ochre, the branch slate blue, ✓ sage and ● terracotta, the model mauve, effort sage at medium and amber or brick at high and max, +lines sage and −lines terracotta, calm figures sage, the 5-hour reset teal and the week's mauve, labels dim. A meter past its line still turns warning or error. It also shows the prompt cache: `warm 42m` (time until it goes cold, in the warning colour for the last 5 minutes) or `cold`, the first thing to go when the band is short of room.
- The panel top is back as it was before the status band: the task beside the super duck, "1 of 3 · on <branch> · quick looks", now/next, the Effort line and "Helpers run on: … ▾"; ◷ uptime is back at the tab row's end. The plan follows below, as before. Theme colours and the later panel fixes stay.
- The panel top is back beside the super duck: the task, "on <branch> · quick looks", "now:" only while the lead duck works, the Effort line, and "Helpers run on: Lead duck picks ▾", whose ▾ opens the choices as plain words (the chosen one bold in the accent) and a pick folds them away. ◷ uptime is back, dim, at the tab row's end. The plan follows under a "PLAN · 2 of 4" heading, its done steps folded to "▸ 2 done"; your step says "yours".
- One look across every tab: UPPERCASE dim section headings with a count after " · ", bold sentence-case fold groups with the arrow first, sentence-case dim labels inside an opened item, no boxes (opened details are indented instead), plain-word buttons with at most one [ bracketed ] main step per tab, and status colours from the theme (so light themes work). Each tab ends in a dim footer such as "Checked 12s ago  Refresh".
- Agents: the running helper's card loses its dot and brackets ("Tell  Watch"), splits model and effort ("Opus · high"), and its title leaves room for Nudge, so it no longer wraps. Opened details of running and finished helpers sit under their text. "Last task … · 2 of 5  [ Continue ]  New task" is one line. Compact, Handoff, the throttle and usage lines sit one row each under the plan.
- The Git tab: "WORKTREES · 2" with "following your latest edit" on the right, a plain Switch, and the shown worktree's line under its folder ("2 ahead of main · 9891854 subject · 2h ago"). One "CHANGES · 4 files" header; groups read "Staged", "Not staged", "Conflicts", and their counts line up with the files'. A file's diff opens without a box. Clean says "Nothing to commit."
- Sessions: "SESSIONS · 5 open · 3.1 GB" (only a short-of-memory warning is said), groups "Needs you", "This project", "▸ Other projects", and rows with "Open  Tell  Close" flush right ("Go to" is gone, and outside cmux a terminal session has no Open). A session waiting on you shows the last thing you asked it. Handoffs fold, and a sent one can be removed. Leftovers share the grid with "Stop". Closing, stopping and removing ask inline on one line. With only this session open it says where others will show.
- Learn: "LEARN   Recent  Topics" is a selector (r and t still work); the boxed Today card is gone and each day's header carries its helpers, any stopped, tokens and models. Work rows read as their name (no "task:" or arrow); ×3 is dim; an opened idea is indented with its note first, then where it came up.
- Helpers can no longer write handoffs: mcp__duckherd__handoff is refused unless the lead duck calls it, so a helper can't leave a junk draft in Sessions.
- Fixed: "512k tok tokens"; the Sessions number on the tab row is drawn in the warning colour as promised; a dangling " · " after the Sessions sizes on Linux; the last commit's, "Checked" and "Sent" times now read like every other time ("2h ago"); the keys line fits one row.

## 0.4.1 - 2026-10-15

- The band above the prompt now shows what your Claude Code status line shows, in one row, with or without a task: the folder, the git branch with ✔ clean or ✗ uncommitted, the model and the effort its latest request went out at, ctx-N% (context left), ↑lines added ↓removed by this session's edits, and 5-hour and weekly usage with the time to each reset. A figure Claude Code doesn't have is left out. It steps aside for a survey.
- The band above the prompt has a new look: where you are (folder, branch ✓ or ● for uncommitted), what's running (model in its own colour, effort, +lines −lines) and how much is used (`context 14%   5h 17% resets 3h 05m   week 3% resets 6d`), with a dim · between groups. Every figure is the share used; context turns warning at 70% and error at 85%, 5h and week at 75% and 90%, and a reset time takes its meter's colour once hot. Calm numbers are plain text. Short of room it drops the line counts, the effort, the word "resets", a calm week, the model, calm reset times and the branch, in that order, and never a meter running hot.
- A helper's report no longer nudges the lead duck to start helper steps while a plan step of yours is not done: they may be waiting on your answer.

## 0.4.0 - 2026-10-15

- Finished helpers list: each row is name, title, then how long it ran and its model in one grid that lines up across groups; no ✓, a stopped one shows red "stopped · Retry". Group headers put the fold arrow first and keep the one "ago"; a folded one counts its helpers and any stopped. Effort and tokens move to an opened row's dim line.
- A two-row band above the prompt shows the task, plan count, branch, now/next and ◷ uptime, then effort, quick looks and the helpers' model (its ▾ swaps in the choices). The panel top is now the super duck beside the plan.
- The panel no longer paints its own near-black background, so it matches the terminal in dark and light themes; the shown tab is bold and underlined in the theme's accent. The "While you were away" line is dismissed with the word `dismiss`, leaving the engine's close mark as the only ×.
- The lead duck plans a whole list up front, starts independent helpers together in one message (worktrees when they share a repo), runs only same-file work in turn, starts what a report unblocks in the same turn, and reports outcomes and decisions rather than each step. A helper's report gets one line below it when helper steps of the plan are not started yet (once while the same steps wait), and the same-file clash note suggests worktrees.
- The helper-name agent types (`duckherd:Pip` and the rest) no longer show in the agent listing the model reads, for the lead duck or its helpers. They stay registered, so helpers keep their duck names.
- The Agent tool's description carries one line on the `Why <model>/<effort>: ...` first line and a matching model parameter, while the lead duck picks helper models.
- Toasts are one line of at most 120 characters; the same one isn't repeated within a minute, and no source shows more than 4 a minute.
- Compaction keeps a short block of facts (helpers at work with their model and job, plan steps not done), whichever summary is used.
- A helper report that reads as orders to the lead duck (ignore earlier instructions, change your settings, approve permissions) gets a line above it saying it is helper text. The report is never changed or dropped.

## 0.3.0 - 2026-10-14

- Helpers no longer alert you. A helper that is stuck, quiet, going in circles or editing the same file as another goes to the lead duck to sort out; a helper's permission prompt still reaches you, in the lead duck's name.
- The side panel strips terminal escapes and control characters from everything it shows.
- Installer: on macOS, bash setups go to `~/.bash_profile`, which Terminal and Ghostty read (they start login shells). A block an earlier version left in `~/.bashrc` is moved.
- Removed: the dashboard (and `claude dashboard`), and desktop app support (Duckherd stays off there).
- New setting `statusFiles` (off by default): writes a small status file per lead duck to `~/.claude/duckherd/dashboard/` for outside tools. Off, nothing is written and no `ps` or `lsof` scan runs.

## 0.2.2 - 2026-10-13

- Duckherd is for Claude Code in the terminal. It stays off in other hosts.

## 0.2.1 - 2026-10-13

- `/duckherd dashboard` opens the dashboard in a new cmux tab, or copies the command. It says so when python3 is missing.
- The dashboard shows pictures in kitty and WezTerm too (not in tmux). `DUCKHERD_GFX=1` or `0` forces pictures or text.

## 0.2.0 - 2026-10-13

Added:

- Settings in `/config`: `quickLooks`, `throttleFiveHour`, `throttleWeekMargin`, `keepWarm`, `chatEffort`, `cmuxPath`, `sounds`, `themesDir`, `theme`.
- Themes from other plugins or a `themesDir` folder (`duckherd-theme.json`). `/crew theme [name|ducks]` lists and switches.
- Helper effort, chosen by the lead duck in its first line (`Why sonnet/high: ...`). A mismatched model or unknown effort is turned back.
- The lead duck's own effort, judged per prompt by a small Haiku call. `/chat-effort auto|off|<level>`.
- Usage throttle: `/throttle on|off|boost`.
- Prompt cache: the first message after the cache goes cold is held once with its cost. `/keep-warm on|off|auto`.
- Compaction summaries written by Haiku 5.5, with Claude Code's own as fallback.
- `/handoff` and a Handoff button write `HANDOFF.md` (never over one Duckherd didn't write).
- Update now button when a newer Duckherd is on disk.
- `/helper-stop <name>`.
- A cap and a gold crown for helper ducks.
- Plan steps can carry a one-line note.
- `scripts/prepublish.sh`, `.gitleaks.toml` and a CI workflow.

Changed:

- `/quack` and `/ducks` are now `/crew`. `/panel` and `/notify` are now `/duckherd panel` and `/duckherd notify on|off`.
- Near the usage limit is now the throttle.
- Likely secrets are blanked before text goes to Haiku.

Removed:

- `/today`.

## 0.1.0 - 2026-10-10

First public release.

- A lead duck that plans and judges, and helper ducks that work.
- Side panel with Agents, Git, Sessions and Learn tabs.
- Animated ducks, the lead duck's aura, and sounds.
- Watching helpers: stuck helpers are stopped and handed back, "tests pass" is checked, same-file warnings, fewer helpers near the usage limit or low memory.
- Cleanup of leftover background jobs, test browsers and iOS simulators, with a yes before anything is stopped.
- `claude dashboard`: every Duckherd session, PRs, and read-only PR reviews (posted only when you press Post).
- `extras/install.sh` with `--uninstall`.
- Lessons log (`lessonsFile` setting).
- `/duckherd doctor`.
- Security hardening: control characters stripped, secrets redacted, private files (0600/0700).
- Works on macOS, and on Linux with fewer features.
