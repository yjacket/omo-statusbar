# CLAUDE.md

This file guides Claude Code (claude.ai/code) in this repository.

## What this is

`extension/status-arrange/` is an OMO/Senpi extension, installed as `<agentDir>/extensions/status-arrange/`. It reorders and hides the status items on the second line of omo's footer and keeps omo's footer itself. `/status-arrange` opens an editor, and settings live in `<agentDir>/status-arrange.json` (`{ version: 1, order: string[], hidden: string[] }`). README.md is the user-facing spec. README.ko.md mirrors it with the same headings in the same order.

## Commands

```sh
bun test
bun qa/run-qa.mjs
bun qa/run-qa.mjs --only S2-hide
sh install.sh   |   .\install.ps1
```

## Senpi facts this relies on

- `interactive-mode.js` `setExtensionFooter` calls the footer factory synchronously with the single `FooterDataProvider`. That's how the extension captures the provider.
- `getExtensionStatuses()` returns the live `Map`, not a copy.
- The footer sorts statuses by key with `localeCompare`. Renamed keys decide the order.
- On reload senpi resets the footer, so the wrapper must be put back on the new provider.

## Invariants

- Never keep a custom footer. Capture the provider, then give the footer back to omo.
- The wrapper never throws. On any error, it returns the original statuses.
- One wrapper per provider, marked with a `Symbol.for` key.
- Restore the original provider on `session_shutdown`.
- No IO in render. Settings are read on load and written on save.
- Status keys are kept byte-exact, leading spaces included.

## Testing

Tests mock senpi modules with `mock.module` and import a fresh copy with a `?case=` query. Use `jest.useFakeTimers()` from `bun:test` for timers. No sleeps.

## Commits

`status-arrange: <what changed>`
