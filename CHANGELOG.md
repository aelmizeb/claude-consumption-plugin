# Changelog

## 0.1.2

- For the plugin directory's review: the README now says exactly which program the plugin runs (`tail`, on a transcript over 4 MB), why, and that nothing is sent out.
- The `tail` call only accepts a transcript (`.jsonl`) and a whole byte offset, and passes the path after `--`.
- A hook that fails no longer holds back the start of a session, the end of a turn or the `/consumption` command.
- `claude plugin validate --strict --profile directory` passes without type warnings.

## 0.1.1

- A session already running when the plugin is installed or reloaded now fills in tokens, memory, week and month after its next reply.

## 0.1.0

- First release: an animated cyberpunk pane for Claude Code in the terminal, the VS Code extension and the desktop app, showing agents, tasks, tokens, context, costs, quota and memory.
- Session figures from Claude Code itself, week and month costs from the local transcripts.
- Optional status line and optional comparison row with DeepSeek's most expensive offer.
