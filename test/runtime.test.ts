import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { clockText, durationText, tpsModulePath, trackRunTime } from "../extension/statusbar/runtime.ts";

const TPS_TEXT = "TPS 42.0 tok/s. Cache hit 75.0%, 3.0s";

function fakePi() {
	const handlers = new Map<string, Array<(event: unknown, ctx: any) => unknown>>();
	return {
		on(name: string, handler: (event: unknown, ctx: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		fire(name: string, event: unknown, ctx: unknown) {
			for (const handler of handlers.get(name) ?? []) handler(event, ctx);
		},
	};
}

const tuiCtx = (mode = "tui") => ({ hasUI: true, mode, ui: { notify: mock((_message: string, _type: string) => {}) } });

// stands in for senpi's tps extension: notices TPS_TEXT, or nothing when a run streamed no output
function fakeTps(text: string | null = TPS_TEXT, seen: string[] = []) {
	return async () => (tps: any) => {
		for (const name of ["agent_start", "message_start", "message_update", "message_end"]) tps.on(name, () => seen.push(name));
		tps.on("agent_end", (_event: unknown, ctx: any) => {
			if (ctx.hasUI && ctx.mode === "tui" && text !== null) ctx.ui.notify(text, "info");
		});
	};
}

async function setup(options: { tps?: () => Promise<any>; enabled?: boolean; times?: number[] } = {}) {
	const pi = fakePi();
	const times = options.times ?? [new Date(2026, 9, 31, 9, 0, 0).getTime(), new Date(2026, 9, 31, 9, 0, 12).getTime()];
	const onError = mock((_message: string) => {});
	await trackRunTime(pi, {
		enabled: () => options.enabled ?? true,
		loadTps: options.tps ?? fakeTps(),
		onError,
		now: () => times.shift() as number,
	});
	return { pi, onError };
}

function run(pi: ReturnType<typeof fakePi>, ctx: unknown) {
	pi.fire("agent_start", {}, ctx);
	pi.fire("agent_end", { messages: [] }, ctx);
	pi.fire("agent_settled", {}, ctx);
}

describe("formats", () => {
	test("local end time as HH:MM:SS", () => {
		expect(clockText(new Date(2026, 9, 31, 9, 5, 7).getTime())).toBe("09:05:07");
		expect(clockText(new Date(2026, 9, 31, 23, 59, 59).getTime())).toBe("23:59:59");
	});

	test("duration in seconds, then minutes and seconds, then hours and minutes", () => {
		expect(durationText(0)).toBe("0s");
		expect(durationText(12_999)).toBe("12s");
		expect(durationText(59_999)).toBe("59s");
		expect(durationText(60_000)).toBe("1m 00s");
		expect(durationText(192_000)).toBe("3m 12s");
		expect(durationText(3_599_999)).toBe("59m 59s");
		expect(durationText(3_600_000)).toBe("1h 00m");
		expect(durationText(3_900_000)).toBe("1h 05m");
		expect(durationText(-5)).toBe("0s");
	});
});

test("tpsModulePath resolves like senpi's resource-loader: flat package first, then dist", () => {
	const root = join("C:", "pkg");
	const flat = join(root, "core", "extensions", "builtin", "tps.js");
	expect(tpsModulePath(root, (path) => path === flat)).toBe(flat);
	expect(tpsModulePath(root, () => false)).toBe(join(root, "dist", "core", "extensions", "builtin", "tps.js"));
});

describe("trackRunTime", () => {
	test("one notice after the run: the TPS text, then the end time and wall-clock length below it", async () => {
		const { pi } = await setup();
		const ctx = tuiCtx();
		run(pi, ctx);
		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(`${TPS_TEXT}\n⏱ 09:00:12 (12s)`, "info");
	});

	test("nothing is shown before agent_settled, so a late builtin notify cannot land after it", async () => {
		const { pi } = await setup();
		const ctx = tuiCtx();
		pi.fire("agent_start", {}, ctx);
		pi.fire("agent_end", { messages: [] }, ctx);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});

	test("the private tps instance sees every run event", async () => {
		const seen: string[] = [];
		const { pi } = await setup({ tps: fakeTps(TPS_TEXT, seen) });
		for (const name of ["agent_start", "message_start", "message_update", "message_end"]) pi.fire(name, {}, tuiCtx());
		expect(seen).toEqual(["agent_start", "message_start", "message_update", "message_end"]);
	});

	test("a run without TPS output still gets the time line", async () => {
		const { pi } = await setup({ tps: fakeTps(null) });
		const ctx = tuiCtx();
		run(pi, ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith("⏱ 09:00:12 (12s)", "info");
	});

	test("no start seen (reload mid-run) shows nothing", async () => {
		const { pi } = await setup();
		const ctx = tuiCtx();
		pi.fire("agent_end", { messages: [] }, ctx);
		pi.fire("agent_settled", {}, ctx);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});

	test("a run that continues without settling drops the earlier line", async () => {
		const { pi } = await setup({ times: [0, 1000, 5000, 7000] });
		const ctx = tuiCtx();
		pi.fire("agent_start", {}, ctx);
		pi.fire("agent_end", { messages: [] }, ctx);
		run(pi, ctx);
		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify.mock.calls[0]?.[0]).toEndWith("(2s)");
	});

	test("off when disabled or outside the TUI", async () => {
		const off = await setup({ enabled: false });
		const ctx = tuiCtx();
		run(off.pi, ctx);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
		const rpc = await setup();
		const rpcCtx = tuiCtx("rpc");
		run(rpc.pi, rpcCtx);
		expect(rpcCtx.ui.notify).not.toHaveBeenCalled();
	});

	test("a builtin that fails to load or throws reports once and adds nothing", async () => {
		const missing = await setup({ tps: () => Promise.reject(new Error("tps.js not found")) });
		const ctx = tuiCtx();
		run(missing.pi, ctx);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
		expect(missing.onError).toHaveBeenCalledTimes(1);
		expect(missing.onError.mock.calls[0]?.[0]).toContain("tps.js not found");

		const throwing = await setup({
			tps: async () => (tps: any) => {
				tps.on("agent_end", () => {
					throw new Error("changed");
				});
			},
		});
		const ctx2 = tuiCtx();
		run(throwing.pi, ctx2);
		run(throwing.pi, ctx2);
		expect(ctx2.ui.notify).not.toHaveBeenCalled();
		expect(throwing.onError).toHaveBeenCalledTimes(1);
	});

	test("a stale ctx at agent_settled does not throw", async () => {
		const { pi } = await setup();
		const ctx = tuiCtx();
		ctx.ui.notify.mockImplementation(() => {
			throw new Error("stale");
		});
		expect(() => run(pi, ctx)).not.toThrow();
	});
});
