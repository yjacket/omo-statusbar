import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type Handler = (event: any, ctx: any) => unknown;
export type TpsFactory = (pi: { on(name: string, handler: Handler): void }) => void;
/** senpi's goal `providerRetryAt(messages, now)`: the reset a provider refusal named, or undefined. */
export type RetryAt = (messages: readonly unknown[], now: number) => number | undefined;

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

/** senpi's goal provider-retry module, next to the tps module. */
export function providerRetryModulePath(packageDir: string, exists: (path: string) => boolean = existsSync): string {
	return join(dirname(tpsModulePath(packageDir, exists)), "goal", "provider-retry.js");
}

export async function loadProviderRetryAt(packageDir: string): Promise<RetryAt> {
	const path = providerRetryModulePath(packageDir);
	const retryAt = (await import(pathToFileURL(path).href)).providerRetryAt;
	if (typeof retryAt !== "function") throw new Error(`${path} has no providerRetryAt`);
	return retryAt;
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
 *
 * senpi 2026.11.3-3 (omo 5.1.61) pauses a goal until a provider limit resets from the goal extension's own
 * agent_settled handler: it arms the `providerRetry` continuation timer (goal_continuation_timer_state) and then
 * posts "Goal paused until ..." as an info notice (goal/monitor-continuation.js afterAgentSettled). Ours would
 * replace that notice, so a run whose settle arms that timer shows no time line.
 *
 * senpi 2026.11.5-1 (omo 5.1.62) also arms `providerRetry` when the run's fallback chain ran out on limits, and that
 * path posts no pause notice (goal/monitor-continuation.js #parkUntilLadderReset). Its agent_settled event carries
 * `fallbackExhausted`, so such a settle keeps the time line.
 *
 * The pause notice follows only when the refusal named a reset (`providerRetryAt`). senpi 2026.11.11 (omo 5.1.70) arms
 * `providerRetry` for every usage or rate limit refusal, a bare 429 with no reset included, and posts nothing then;
 * such a settle keeps the time line too. When senpi's provider-retry module cannot be loaded, every armed settle
 * drops the time line as before.
 */
export function trackRunTime(
	pi: any,
	options: {
		enabled: () => boolean;
		loadTps: () => Promise<TpsFactory>;
		loadRetryAt?: () => Promise<RetryAt>;
		onError: (message: string) => void;
		now?: () => number;
	},
): Promise<void> {
	const now = options.now ?? Date.now;
	let tps: Map<string, Handler> | undefined;
	let startedAt: number | undefined;
	let pending: string | undefined;
	let providerRetryArmed = false;
	let endMessages: readonly unknown[] = [];
	let retryAt: RetryAt | undefined;
	const retryLoaded = options.loadRetryAt?.().then(
		(fn) => {
			retryAt = fn;
		},
		() => {
			// an older or reshaped senpi: every armed providerRetry settle drops the time line
		},
	);

	// Does senpi post "Goal paused until ..." for this settle? Only for a refusal that named a reset.
	const pauseNoticeFollows = () => {
		if (!retryAt) return true;
		try {
			return retryAt(endMessages, Date.now()) !== undefined;
		} catch {
			return true;
		}
	};

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

	if (typeof pi.events?.on === "function") {
		pi.events.on("goal_continuation_timer_state", (data: any) => {
			if (data?.armed === true && data.kind === "providerRetry") providerRetryArmed = true;
		});
	}

	pi.on("agent_start", () => {
		startedAt = now();
		pending = undefined;
		providerRetryArmed = false;
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
		endMessages = Array.isArray((event as any)?.messages) ? (event as any).messages : [];
		if (!tps || start === undefined || !ctx?.hasUI || ctx.mode !== "tui" || !options.enabled()) return;
		const end = now();
		pending = [tpsText, `⏱ ${clockText(end)} (${durationText(end - start)})`].filter(Boolean).join("\n");
	});

	pi.on("agent_settled", (event: any, ctx: any) => {
		const text = pending;
		const pauseNotice = providerRetryArmed && event?.fallbackExhausted === undefined && pauseNoticeFollows();
		pending = undefined;
		providerRetryArmed = false;
		endMessages = [];
		if (text === undefined || pauseNotice) return;
		try {
			ctx.ui.notify(text, "info");
		} catch {
			// a stale ctx throws: there is no screen left to show it on
		}
	});

	pi.on("session_shutdown", () => {
		startedAt = undefined;
		pending = undefined;
		providerRetryArmed = false;
	});

	return Promise.all([loaded, retryLoaded]).then(() => undefined);
}
