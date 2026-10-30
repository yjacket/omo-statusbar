# CLAUDE.md

This file guides Claude Code (claude.ai/code) in this repository.

## What this is

`extension/statusbar/` is an OMO/Senpi extension, installed as an omo package (`omo install git:github.com/yjacket/omo-statusbar`; `package.json` `pi.extensions` names the entry). It reorders and hides the status items on the second line of omo's footer and keeps omo's footer itself. `/statusbar` opens an editor, and settings live in `<agentDir>/statusbar.json` (`{ version: 1, order: string[], hidden: string[], separator?, gitIcon?, runTime?: false }`). It also publishes its own `omo-git` status (uncommitted file count) and `omo-cache` (prompt cache time left / since expiry; replaces the deprecated omo-tps-plus). A `status-arrange.json` from before the rename is read once and saved as `statusbar.json`. README.md is the user-facing spec. README.ko.md mirrors it with the same headings in the same order.

## Commands

```sh
bun test
bun qa/run-qa.mjs
bun qa/run-qa.mjs --only S2-hide
omo install <path-to-this-clone>   # dev check only; reinstall git:github.com/yjacket/omo-statusbar afterwards
```

Work in a worktree on a branch and land changes through a PR; the `test` check (`bun run test` on windows-latest) is required on `master`. Run `run-qa` with `OMO_CODING_AGENT_DIR`, `HOME` and `USERPROFILE` pointing at a temp folder, never the real `~/.omo`. Without `OMO_CODING_AGENT_DIR` it uses `~/.omo/agent`. `run-qa` parks the installed package checkout (`<agentDir>/git/github.com/yjacket/omo-statusbar`) for the run with `OMO_OFFLINE=1` so omo does not clone it again, and puts it back afterwards.

## Senpi facts this relies on

- `interactive-mode.js` `setExtensionFooter` calls the footer factory synchronously with the single `FooterDataProvider`. That's how the extension captures the provider.
- `getExtensionStatuses()` returns the live `Map`, not a copy.
- The footer sorts statuses by key with `localeCompare`. Renamed keys decide the order.
- On reload senpi resets the footer, so the wrapper must be put back on the new provider.
- `ui.notify(text, "info")` (`showStatus`) overwrites the status line right above it, so a second notice replaces the builtin TPS line. runtime.ts runs a private instance of senpi's builtin `tps.js` (resolved like resource-loader: `<packageDir>/core/...` or `<packageDir>/dist/core/extensions/builtin/tps.js`) and sends one `TPS ...\n⏱ ...` notice.
- `agent-session` awaits every extension's `agent_end` handler before it emits `agent_settled`, so the notice sent on `agent_settled` always lands after the builtin's.

## Invariants

- Never keep a custom footer. Capture the provider, then give the footer back to omo.
- The wrapper never throws. On any error, it returns the original statuses.
- One wrapper per provider, marked with a `Symbol.for` key.
- Restore the original provider on `session_shutdown`.
- No IO in render. Settings are read on load and written on save.
- Status keys are kept byte-exact, leading spaces included.
- git runs only on `session_start` and `agent_settled`, never in render. Its status key is `omo-git`.
- `omo-cache` (cache.ts) runs on one unref'd `setTimeout` chain that recomputes from `Date.now()` and re-arms at the next text change. A throwing `setStatus` (stale ctx) ends the chain. TTL comes from `@earendil-works/pi-ai` `resolvePromptCacheTtlSeconds`.

## Testing

Tests mock senpi modules with `mock.module` and import a fresh copy with a `?case=` query. Every `@earendil-works/pi-ai` mock declares `resolvePromptCacheTtlSeconds`. Use `jest.useFakeTimers()` and `setSystemTime` from `bun:test` for timers and clocks. No sleeps.

## Commits

`statusbar: <what changed>`
