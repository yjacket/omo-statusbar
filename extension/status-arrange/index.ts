import { getAgentDir } from "@code-yeongyu/senpi";
import { arrangeStatuses, type Config, emptyConfig, mergeKeys } from "./arrange.ts";
import { configPath, loadConfig, saveConfig } from "./config.ts";
import { GIT_STATUS_KEY, gitStatusText, readChangeCount } from "./git.ts";
import { type PickerState, StatusPicker } from "./picker.ts";

const PATCH = Symbol.for("omo-status-arrange.patch");
const EDITOR_OVERLAY = { width: "96%", maxHeight: "80%", minWidth: 40, margin: 1 } as const;

type Patch = {
	original: () => Map<string, string>;
	arrange: (statuses: Map<string, string>) => Map<string, string>;
};

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createStatusArrange(pi: any, deps: { agentDir?: () => string } = {}): void {
	let config: Config = emptyConfig();
	let configFile: string | undefined;
	let preview: PickerState | undefined;
	let provider: any;
	let tui: any;
	let lastStatuses = new Map<string, string>();
	let lastGitCount: number | undefined;
	let gitRunning = false;
	let gitRerun = false;
	let notify: ((message: string, level: "warning" | "error") => void) | undefined;
	const warned = new Set<string>();
	let dirty = false;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function warnOnce(message: string): void {
		if (warned.has(message)) return;
		warned.add(message);
		try {
			notify?.(message, "warning");
		} catch {
			// the context that created the notifier is stale (reload or session switch): nothing left to tell
		}
	}

	function flushSave(): void {
		if (saveTimer !== undefined) {
			clearTimeout(saveTimer);
			saveTimer = undefined;
		}
		if (!dirty || configFile === undefined) return;
		dirty = false;
		try {
			saveConfig(configFile, config);
		} catch (error) {
			warnOnce(`status-arrange: cannot save ${configFile} (${errorText(error)}); the order applies for this session only`);
		}
	}

	function scheduleSave(): void {
		dirty = true;
		if (saveTimer !== undefined) return;
		saveTimer = setTimeout(flushSave, 0);
		saveTimer.unref?.();
	}

	function arrange(statuses: Map<string, string>): Map<string, string> {
		let effective = statuses;
		if (statuses.has(GIT_STATUS_KEY) && lastGitCount !== undefined) {
			const text = gitStatusText(lastGitCount, preview?.gitIcon ?? config.gitIcon ?? "plain");
			if (text !== undefined) {
				effective = new Map(statuses);
				effective.set(GIT_STATUS_KEY, text);
			}
		}
		lastStatuses = new Map(effective);
		const order = mergeKeys(config.order, statuses.keys());
		if (order !== config.order) {
			config = { ...config, order };
			scheduleSave();
		}
		return arrangeStatuses(
			effective,
			preview?.order ?? config.order,
			new Set(preview?.hidden ?? config.hidden),
			preview?.separator ?? config.separator ?? "space",
		);
	}

	// The only place git runs: session_start and agent_settled. Runs coalesce, so a burst
	// of settled events never queues more than one git call behind the current one.
	async function refreshGit(ctx: any): Promise<void> {
		if (!ctx?.hasUI || ctx.mode !== "tui") return;
		if (gitRunning) {
			gitRerun = true;
			return;
		}
		gitRunning = true;
		try {
			do {
				gitRerun = false;
				const count = await readChangeCount(
					(command: string, args: string[], options: { cwd: string; timeout?: number }) => pi.exec(command, args, options),
					ctx.cwd,
				);
				lastGitCount = count;
				try {
					ctx.ui.setStatus(GIT_STATUS_KEY, gitStatusText(count, config.gitIcon ?? "plain"));
				} catch {
					// a stale ctx throws: there is nothing left to update
				}
			} while (gitRerun);
		} catch {
			// fired and forgotten: this must never reject
		} finally {
			gitRunning = false;
		}
	}

	function patch(target: any): void {
		const existing: Patch | undefined = target[PATCH];
		if (existing) {
			existing.arrange = arrange;
			return;
		}
		const record: Patch = { original: target.getExtensionStatuses, arrange };
		target.getExtensionStatuses = function (this: unknown) {
			const statuses = record.original.call(this);
			try {
				return record.arrange(statuses);
			} catch (error) {
				warnOnce(`status-arrange: cannot arrange the footer statuses (${errorText(error)}); showing them unchanged`);
				return statuses;
			}
		};
		target[PATCH] = record;
	}

	pi.on("session_start", (_event: unknown, ctx: any) => {
		try {
			if (!ctx.hasUI || ctx.mode !== "tui") return;
			notify = (message, level) => ctx.ui.notify(message, level);
			configFile = configPath(deps.agentDir?.() ?? getAgentDir());
			const loaded = loadConfig(configFile);
			config = loaded.config;
			if (loaded.error) warnOnce(`status-arrange: cannot read ${configFile} (${loaded.error}); using the default order`);

			let captured: { tui?: any; data?: any } = {};
			ctx.ui.setFooter((footerTui: any, _theme: unknown, data: any) => {
				captured = { tui: footerTui, data };
				return { render: () => [], invalidate() {} };
			});
			ctx.ui.setFooter(undefined);

			if (typeof captured.data?.getExtensionStatuses !== "function") {
				warnOnce("status-arrange: this omo version does not expose footer statuses; the footer is left as is");
				void refreshGit(ctx);
				return;
			}
			provider = captured.data;
			tui = captured.tui;
			patch(provider);
			tui?.requestRender?.();
			void refreshGit(ctx);
		} catch (error) {
			warnOnce(`status-arrange: cannot start (${errorText(error)}); the footer is left as is`);
			void refreshGit(ctx);
		}
	});

	pi.on("agent_settled", (_event: unknown, ctx: any) => {
		void refreshGit(ctx);
	});

	pi.on("session_shutdown", () => {
		flushSave();
		const record: Patch | undefined = provider?.[PATCH];
		if (record && record.arrange === arrange) {
			provider.getExtensionStatuses = record.original;
			delete provider[PATCH];
		}
		preview = undefined;
		lastGitCount = undefined;
		provider = undefined;
		tui = undefined;
	});

	pi.registerCommand("status-arrange", {
		description: "hide and reorder the footer status items in an interactive editor",
		handler: async (_args: string, ctx: any) => {
			if (!ctx.hasUI || ctx.mode !== "tui") {
				ctx.ui?.notify?.("status-arrange: the /status-arrange editor needs the interactive omo TUI", "error");
				return;
			}
			if (!provider) {
				ctx.ui.notify("status-arrange: footer statuses are not available in this omo version", "error");
				return;
			}
			await ctx.ui.custom(
				(_tui: any, theme: any, keybindings: any, done: () => void) =>
					new StatusPicker(theme, {
						order: [...config.order],
						hidden: [...config.hidden],
						separator: config.separator ?? "space",
						gitIcon: config.gitIcon ?? "plain",
						statuses: () => lastStatuses,
						keybindings,
						onPreview: (state: PickerState) => {
							preview = state;
							tui?.requestRender?.();
						},
						onSave: (state: PickerState) => {
							const next: Config = { version: 1, order: [...state.order], hidden: [...state.hidden] };
							if (state.separator !== "space") next.separator = state.separator;
							if (state.gitIcon !== "plain") next.gitIcon = state.gitIcon;
							try {
								saveConfig(configFile as string, next);
							} catch (error) {
								return `status-arrange: cannot save (${errorText(error)})`;
							}
							config = next;
							dirty = false;
							preview = undefined;
							try {
								if (lastGitCount !== undefined) {
									ctx.ui.setStatus(GIT_STATUS_KEY, gitStatusText(lastGitCount, state.gitIcon));
								}
							} catch {
								// a stale ctx throws: the save itself already stands
							}
							return undefined;
						},
						onClose: () => {
							preview = undefined;
							done();
							tui?.requestRender?.();
						},
					}),
				{ overlay: true, overlayOptions: { ...EDITOR_OVERLAY } },
			);
		},
	});
}

export default function (pi: any): void {
	createStatusArrange(pi);
}
