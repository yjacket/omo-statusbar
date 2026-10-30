import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type Handler = (event: any, ctx: any) => unknown;
export type TpsFactory = (pi: { on(name: string, handler: Handler): void }) => void;

const FORWARDED = ["agent_start", "message_start", "message_update", "message_end"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

export function clockText(ms: number): string {
	const date = new Date(ms);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function durationText(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
	return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/** senpi's builtin tps module, found the way senpi's resource-loader finds it for the shim it writes. */
export function tpsModulePath(packageDir: string, exists: (path: string) => boolean = existsSync): string {
	const flat = join(packageDir, "core", "extensions", "builtin", "tps.js");
	return exists(flat) ? flat : join(packageDir, "dist", "core", "extensions", "builtin", "tps.js");
}

export async function loadBuiltinTps(packageDir: string): Promise<TpsFactory> {
	const path = tpsModulePath(packageDir);
	if (!existsSync(path)) throw new Error(`${path} not found`);
	const factory = (await import(pathToFileURL(path).href)).default;
	if (typeof factory !== "function") throw new Error(`${path} has no default export`);
	return factory;
}

/**
 * Puts `⏱ HH:MM:SS (duration)` under the per-run TPS line: the run's local end time and its wall-clock
 * length from agent_start to agent_end. Screen only: it goes through ui.notify, which neither the session
 * file nor the model sees.
 *
 * ui.notify with "info" overwrites the status line right above it, so a second notice would replace the
 * TPS line. Instead a private instance of senpi's own tps extension runs on the same events, and the
 * one notice repeats its text with the ⏱ line below. It is sent on agent_settled, which senpi emits only
 * after every agent_end handler (the builtin's notify among them) has finished. When the builtin cannot
 * be loaded nothing is shown, so the engine's own TPS line is never touched.
 */
export function trackRunTime(
	pi: any,
	options: {
		enabled: () => boolean;
		loadTps: () => Promise<TpsFactory>;
		onError: (message: string) => void;
		now?: () => number;
	},
): Promise<void> {
	const now = options.now ?? Date.now;
	let tps: Map<string, Handler> | undefined;
	let startedAt: number | undefined;
	let pending: string | undefined;

	const fail = (error: unknown) => {
		tps = undefined;
		pending = undefined;
		options.onError(`statusbar: cannot run senpi's tps extension (${error instanceof Error ? error.message : String(error)}); the run time line is off`);
	};

	const loaded = options.loadTps().then(
		(factory) => {
			const handlers = new Map<string, Handler>();
			factory({ on: (name, handler) => handlers.set(name, handler) });
			tps = handlers;
		},
	).catch(fail);

	const forward = (name: string, event: unknown, ctx: unknown) => {
		try {
			tps?.get(name)?.(event, ctx);
		} catch (error) {
			fail(error);
		}
	};

	for (const name of FORWARDED) pi.on(name, (event: unknown, ctx: unknown) => forward(name, event, ctx));

	pi.on("agent_start", () => {
		startedAt = now();
		pending = undefined;
	});

	pi.on("agent_end", (event: unknown, ctx: any) => {
		let tpsText: string | undefined;
		forward("agent_end", event, {
			hasUI: true,
			mode: "tui",
			ui: {
				notify: (message: string) => {
					tpsText = message;
				},
			},
		});
		const start = startedAt;
		startedAt = undefined;
		if (!tps || start === undefined || !ctx?.hasUI || ctx.mode !== "tui" || !options.enabled()) return;
		const end = now();
		pending = [tpsText, `⏱ ${clockText(end)} (${durationText(end - start)})`].filter(Boolean).join("\n");
	});

	pi.on("agent_settled", (_event: unknown, ctx: any) => {
		const text = pending;
		pending = undefined;
		if (text === undefined) return;
		try {
			ctx.ui.notify(text, "info");
		} catch {
			// a stale ctx throws: there is no screen left to show it on
		}
	});

	pi.on("session_shutdown", () => {
		startedAt = undefined;
		pending = undefined;
	});

	return loaded;
}
