# omo-statusbar

[한국어](README.ko.md)

The second line of omo's footer lists status items from your extensions, sorted by key. This extension lets you choose their order and hide the ones you don't want. It keeps omo's own footer. Only the status items on that second line change.

## Install

```sh
omo install git:github.com/yjacket/omo-statusbar
```

omo clones the repository into `<agentDir>/git/github.com/yjacket/omo-statusbar` and adds it to `packages` in `<agentDir>/settings.json`. Type `/reload` in running sessions.

To update, run `omo update --extensions` (every git-installed extension) or `omo update --extension git:github.com/yjacket/omo-statusbar` (this one only). Running sessions pick up the change after `/reload` or in a new session.

Coming from the old copy scripts:

- Delete `<agentDir>/extensions/status-arrange`, or it loads next to the package. Settings in `status-arrange.json` move to `statusbar.json` on the first start.
- omo-tps-plus is deprecated. If it's still installed, remove it and delete `<agentDir>/extensions/tps.js`; omo writes its stock tps file back on the next start. Its cache status lives here now as `omo-cache`.

## Usage

Type `/statusbar` to open the list of status items.

| Key | Action |
| --- | --- |
| `↑` `↓` / `k` `j` | Move the cursor |
| `PgUp` `PgDn` `Home` `End` | Jump through the list |
| `x` or `Space` | Show or hide the item |
| `K` `J` or `Shift+↑` `Shift+↓` | Move the item up or down |
| `T` / `B` | Move the item to the top / bottom |
| `r` | Go back to the default order |
| `d` | Remove an item that isn't shown right now |
| `p` | Cycle the separator: space, `\|`, `·`, `/`, `[]` (wraps each item) |
| `g` | Cycle the git icon: `±`, `📝`, Nerd Font glyph U+E702 (needs a Nerd Font in your terminal) |
| `s` | Save |
| `q` / `Esc` | Close. If you have unsaved changes, it asks once |

## How it works

Senpi sorts footer statuses by key. The extension wraps the footer's status source and renames the keys so they sort in the order you chose. An item it hasn't seen before shows up right after its alphabetical neighbor.

The extension also publishes its own status, `omo-git`, shown as `±N`. N counts uncommitted files (modified, staged, untracked) from `git status --porcelain`. It refreshes at session start and after every reply, and it's hidden when the tree is clean or the folder isn't a repo. Like any status, you can move or hide it in the editor.

It also publishes `omo-cache`, the prompt cache lifetime counted from the last reply:

```
🔥 52m    the cache is warm; minutes left, rounded up
🧊 12m    the cache expired 12 minutes ago (hours after the first hour: 🧊 2h)
🧊        no reply yet, a model switch, or expired under a minute ago
```

The lifetime is senpi's per-model TTL (`resolvePromptCacheTtlSeconds`): 1 hour on a Claude subscription, 5 minutes on Anthropic API keys. It restarts with every reply. At session start, reload or switch it picks up from the last reply in the conversation. It's hidden when senpi knows no TTL for the model.

The separator between items is applied by this extension, not by omo.

Settings live in `<agentDir>/statusbar.json`:

```json
{
	"version": 1,
	"order": ["omo-cache", "  omo-native", "goal"],
	"hidden": ["omo-git"],
	"separator": "pipe",
	"gitIcon": "plain"
}
```

Keys are stored exactly as the extensions set them, leading spaces included. If `separator` or `gitIcon` is missing, you get a space and `±`. The file sits outside the omo runtime, so it survives omo and omo-ai updates.

## Limits

- If another extension installs its own footer with `setFooter`, the capture at start-up can reset it.
- It only works in the interactive TUI.
- `omo-cache` only follows the clock. It cannot see a keep-alive ping that refreshed the cache while the session was idle, or a Claude subscription dropping to a 5-minute TTL past its usage limits.

## Development

Work in a git worktree on a new branch and open a pull request. `master` only accepts changes through a PR whose `test` check passes (`.github/workflows/test.yml`, windows-latest, `bun run test`).

Run the tests locally with Bun 1.4 or later:

```sh
bun test
```

`bun qa/run-qa.mjs` drives a real omo session. It uses `OMO_CODING_AGENT_DIR` when set and your real `~/.omo/agent` otherwise, so point it at a throwaway directory: set `OMO_CODING_AGENT_DIR` (and a temp `HOME`/`USERPROFILE`) under a temp folder before running it. To try a working tree in omo, `omo install <path-to-clone>` works for a quick check; reinstall with `omo install git:github.com/yjacket/omo-statusbar` afterwards.

## Uninstall

```sh
omo remove git:github.com/yjacket/omo-statusbar
```

You can also delete `<agentDir>/statusbar.json`. Then type `/reload`.
