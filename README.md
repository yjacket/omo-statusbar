# omo-status-arrange

[한국어](README.ko.md)

The second line of omo's footer lists status items from your extensions, sorted by key. This extension lets you choose their order and hide the ones you don't want. It keeps omo's own footer. Only the status items on that second line change.

## Install

Windows (PowerShell):

```powershell
git clone https://github.com/yjacket/omo-status-arrange; .\omo-status-arrange\install.ps1
```

Linux, macOS:

```sh
git clone https://github.com/yjacket/omo-status-arrange && sh omo-status-arrange/install.sh
```

From an existing clone, run `.\install.ps1` or `sh install.sh`. The script copies `extension/status-arrange` into `~/.omo/agent/extensions/status-arrange`, or into the folder named by `OMO_CODING_AGENT_DIR`. Then type `/reload` in any running session.

## Usage

Type `/status-arrange` to open the list of status items.

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

The extension also publishes its own status, `omo-git`, shown as `± N`. N counts uncommitted files (modified, staged, untracked) from `git status --porcelain`. It refreshes at session start and after every reply, and it's hidden when the tree is clean or the folder isn't a repo. Like any status, you can move or hide it in the editor. The separator between items is applied by this extension, not by omo.

Settings live in `<agentDir>/status-arrange.json`:

```json
{
	"version": 1,
	"order": ["cache-ttl", "  omo-native", "goal"],
	"hidden": ["og-promo"],
	"separator": "pipe",
	"gitIcon": "plain"
}
```

Keys are stored exactly as the extensions set them, leading spaces included. If `separator` or `gitIcon` is missing, you get a space and `±`. The file sits outside the omo runtime, so it survives omo and omo-ai updates.

## Limits

- If another extension installs its own footer with `setFooter`, the capture at start-up can reset it.
- It only works in the interactive TUI.

## Uninstall

Delete `<agentDir>/extensions/status-arrange`. You can also delete `<agentDir>/status-arrange.json`. Then type `/reload`.
