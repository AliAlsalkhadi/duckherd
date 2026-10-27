<p align="center"><img src="docs/media/logo.png" alt="Duckherd logo: a lead duck followed by two helper ducks" width="160"></p>

# Duckherd

Talk to one lead agent the whole time. It plans and hands the work to helpers, so it stays free to listen.

You can give it a new task while helpers are still working on the last one. It keeps track of both, checks what each helper reports, and tells you when it's your turn. Because the lead doesn't do the work itself, its own context stays small and the conversation is less likely to stall or lose the thread.

![Duckherd's side panel: the lead duck, its plan and three helper ducks at work](docs/media/demo.gif)

## What you get

- A lead duck that plans and picks each helper's model. It can't edit files; helpers do the work.
- A helper's "tests pass" is checked against the results of the test runs Duckherd saw.
- Quiet or stuck helpers are checked on, then stopped and their job handed back.
- A side panel with your helpers, git changes, other Claude sessions and a lessons log. Lessons are saved only when you ask: `/learn` or the Learn tab.

## How it works

- Helpers run on Sonnet unless the lead picks Haiku or Opus. It may open a helper's prompt with `Why <model>/<effort>: <reason>`, shown in the panel. `/helpers haiku|sonnet|opus` sets one model for every helper, and `/helpers auto` hands the choice back.
- A helper's effort comes from the Why line when it names one. Otherwise the model's usual effort applies: Haiku low, Sonnet medium, Opus high.
- The plan moves on by itself: a helper step turns doing when a helper starts on it, and done when its helpers report.
- The lead's own effort is set with `/chat-effort`. `auto` has Haiku judge each prompt, `off` leaves it alone, and a level pins it. This only works on Opus and Sonnet 5.5.
- The usage throttle watches your 5-hour and weekly limits. At 80% of the 5-hour window, or 10 points ahead of the weekly pace, helper effort drops one step and auto chat effort is capped at medium. At the next level, helpers move one model lighter and only two run at a time. Use `/throttle on|off|boost`.
- Keep-warm sends a one-line "ok" ping about 3 minutes before the prompt cache expires. Each ping is a small turn, cheaper than rewriting a big context. `/keep-warm auto` (the default) pings only while a plan is unfinished and the context is 100k or more. `on` always pings and `off` never does. Pings stop after 3 hours without typing.
- The lead gets 3 quick looks per request (setting `quickLooks`, 0 to 20), also while helpers work.
- A helper report that would wake an idle lead while other helpers still work waits up to 8 seconds, so reports that come close together arrive in one turn.
- When a helper says "tests pass", that is checked against its own test runs since its last edit. It needs a full run that passed. A run of some tests, or a piped run whose output doesn't say how it ended, only counts as partial. If the runs don't match the claim, the lead is told.
- If a helper goes quiet or keeps repeating a failing step, Duckherd asks it first, then tells the lead, and stops it after an hour.
- The lead can't use the edit tools. Only its own memory folder and scratchpad are open to it.

## Requirements

- Claude Code 2.1.295 or newer, in a terminal, on macOS or Linux, with git.
- Optional: python3 (Watch, a helper's live view) and cmux (opens that view in a tab).

## Install

```sh
git clone https://github.com/AliAlsalkhadi/duckherd
cd duckherd && extras/install.sh
```

Open a new terminal tab and run `claude duckherd`. Plain `claude` is unchanged. The installer adds one block to `~/.zshrc` (or your bash rc file) and backs the file up first.

Or as a plugin, loaded in every session:

```sh
claude plugin marketplace add AliAlsalkhadi/duckherd
claude plugin install duckherd@duckherd
```

## Use

- `/duckherd <task>` starts a task.
- `/duckherd panel` shows or hides the side panel.
- `/duckherd doctor` checks your setup.

Settings are in `/config`.

## Uninstall

`extras/install.sh --uninstall`, or `claude plugin uninstall duckherd@duckherd`. Duckherd's files in `~/.claude/duckherd/` (lessons, status) stay; delete that folder to remove them.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with or endorsed by Anthropic.
