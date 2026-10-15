import { afterAll, afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE } from "../extension/status-arrange/config.ts";
// the genuine picker, captured before the mock below replaces it in the module registry
import * as realPicker from "../extension/status-arrange/picker.ts";

const PATCH = Symbol.for("omo-status-arrange.patch");
let agentDir = "";

mock.module("@code-yeongyu/senpi", () => ({ getAgentDir: () => agentDir }));

// The picker itself is another file's subject; here it only records the options it was built with.
let pickerOptions: any;
mock.module("../extension/status-arrange/picker.ts", () => ({
	StatusPicker: class extends realPicker.StatusPicker {
		constructor(theme: any, options: any) {
			super(theme, options);
			pickerOptions = options;
		}
	},
}));

class FakeProvider {
	m = new Map<string, string>();
	getExtensionStatuses() {
		return this.m;
	}
}

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

function fakePi() {
	const handlers = new Map<string, Array<(event: unknown, ctx: any) => unknown>>();
	const commands = new Map<string, any>();
	return {
		handlers,
		commands,
		exec: mock(async () => ({ code: 0, stdout: "" })),
		on(name: string, handler: (event: unknown, ctx: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		registerCommand(name: string, spec: any) {
			commands.set(name, spec);
		},
	};
}

function fire(pi: ReturnType<typeof fakePi>, name: string, ctx: unknown) {
	for (const handler of pi.handlers.get(name) ?? []) handler({}, ctx);
}

function fakeCtx(provider: FakeProvider, mode = "tui") {
	const tui = { requestRender: mock() };
	return {
		hasUI: true,
		mode,
		cwd: "C:/work",
		ui: {
			setFooter: mock((factory?: (...args: any[]) => unknown) => {
				if (factory) factory(tui, theme, provider);
			}),
			setStatus: mock((key: string, value: string | undefined) => {
				if (value === undefined) provider.m.delete(key);
				else provider.m.set(key, value);
			}),
			notify: mock(),
			custom: mock(async (factory: any) => factory(tui, theme, { matches: () => false }, () => {})),
		},
	};
}

async function load(name: string) {
	const mod = await import(`../extension/status-arrange/index.ts?case=${name}`);
	const pi = fakePi();
	mod.createStatusArrange(pi);
	return pi;
}

// let the fired-and-forgotten git refresh run to completion (microtasks, no timers)
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const configFile = () => join(agentDir, CONFIG_FILE);

// mock.module is process-wide: put the real picker back so the other suites see it
afterAll(() => {
	mock.module("../extension/status-arrange/picker.ts", () => realPicker);
});

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "status-arrange-index-"));
	pickerOptions = undefined;
});

afterEach(() => {
	jest.useRealTimers();
	rmSync(agentDir, { recursive: true, force: true });
});

describe("status-arrange wiring", () => {
	test("orders statuses by default after session_start", async () => {
		const pi = await load("default");
		const provider = new FakeProvider();
		provider.m = new Map([
			["goal", "G"],
			["  omo-native", "N"],
		]);
		fire(pi, "session_start", fakeCtx(provider));
		const statuses = provider.getExtensionStatuses();
		expect([...statuses.keys()]).toEqual(["0000", "0001"]);
		expect([...statuses.values()]).toEqual(["N", "G"]);
	});

	test("hides a status listed in the config and keeps its leading spaces", async () => {
		writeFileSync(configFile(), JSON.stringify({ version: 1, order: ["  omo-native", "goal"], hidden: ["  omo-native"] }));
		const pi = await load("hidden");
		const provider = new FakeProvider();
		provider.m = new Map([
			["goal", "G"],
			["  omo-native", "N"],
		]);
		fire(pi, "session_start", fakeCtx(provider));
		const statuses = provider.getExtensionStatuses();
		expect([...statuses.keys()]).toEqual(["0000"]);
		expect([...statuses.values()]).toEqual(["G"]);
	});

	test("a configured separator applies to the arranged items", async () => {
		writeFileSync(configFile(), JSON.stringify({ version: 1, order: [], hidden: [], separator: "pipe" }));
		const pi = await load("separator");
		const provider = new FakeProvider();
		provider.m = new Map([
			["a", "A"],
			["b", "B"],
			["c", "C"],
		]);
		fire(pi, "session_start", fakeCtx(provider));
		expect([...provider.getExtensionStatuses().values()]).toEqual(["A", "| B", "| C"]);
	});

	test("a reload on the same provider leaves one wrapper", async () => {
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		fire(await load("first"), "session_start", fakeCtx(provider));
		fire(await load("reload"), "session_start", fakeCtx(provider));
		expect((provider as any)[PATCH].original).toBe(FakeProvider.prototype.getExtensionStatuses);
		expect([...provider.getExtensionStatuses().keys()]).toEqual(["0000"]);
		expect([...provider.getExtensionStatuses().values()]).toEqual(["G"]);
	});

	test("session_shutdown restores getExtensionStatuses", async () => {
		const pi = await load("shutdown");
		const provider = new FakeProvider();
		fire(pi, "session_start", fakeCtx(provider));
		expect(provider.getExtensionStatuses).not.toBe(FakeProvider.prototype.getExtensionStatuses);
		fire(pi, "session_shutdown", fakeCtx(provider));
		expect(provider.getExtensionStatuses).toBe(FakeProvider.prototype.getExtensionStatuses);
		expect((provider as any)[PATCH]).toBeUndefined();
	});

	test("a corrupt config warns once and keeps the default footer", async () => {
		writeFileSync(configFile(), "{not json");
		const pi = await load("corrupt");
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		fire(pi, "session_start", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("cannot read"), "warning");
		expect([...provider.getExtensionStatuses().values()]).toEqual(["G"]);
	});

	test("a throwing arrange makes the wrapper return the original statuses", async () => {
		const pi = await load("throwing");
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		fire(pi, "session_start", fakeCtx(provider));
		(provider as any)[PATCH].arrange = () => {
			throw new Error("boom");
		};
		expect(provider.getExtensionStatuses()).toBe(provider.m);
	});

	test("rpc mode leaves the footer alone, never runs git, and the command reports an error", async () => {
		const pi = await load("rpc");
		const provider = new FakeProvider();
		const ctx = fakeCtx(provider, "rpc");
		fire(pi, "session_start", ctx);
		expect(ctx.ui.setFooter).not.toHaveBeenCalled();
		await pi.commands.get("status-arrange").handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("status-arrange"), "error");
		expect(ctx.ui.custom).not.toHaveBeenCalled();
		expect(pi.exec).not.toHaveBeenCalled();
	});

	test("a new key is saved on the deferred timer, not during the status read", async () => {
		jest.useFakeTimers();
		const pi = await load("save");
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		fire(pi, "session_start", fakeCtx(provider));
		provider.getExtensionStatuses();
		expect(existsSync(configFile())).toBe(false);
		jest.runAllTimers();
		expect(JSON.parse(readFileSync(configFile(), "utf8")).order).toEqual(["goal"]);
	});
});

describe("status-arrange git status", () => {
	test("session_start reads the change count and writes the omo-git status", async () => {
		const pi = await load("git-start");
		pi.exec = mock(async () => ({ code: 0, stdout: " M a\n?? b\n" }));
		const provider = new FakeProvider();
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		await flush();
		expect(pi.exec).toHaveBeenCalledWith("git", ["status", "--porcelain"], { cwd: "C:/work", timeout: 10000 });
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("omo-git", "± 2");
	});

	test("reading the statuses never runs git", async () => {
		const pi = await load("git-norender");
		pi.exec = mock(async () => ({ code: 0, stdout: " M a\n" }));
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		fire(pi, "session_start", fakeCtx(provider));
		await flush();
		expect(pi.exec).toHaveBeenCalledTimes(1);
		provider.getExtensionStatuses();
		expect(pi.exec).toHaveBeenCalledTimes(1);
	});

	test("agent_settled refreshes the change count again", async () => {
		const pi = await load("git-settled");
		pi.exec = mock(async () => ({ code: 0, stdout: " M a\n?? b\n" }));
		const provider = new FakeProvider();
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		await flush();
		fire(pi, "agent_settled", ctx);
		await flush();
		expect(pi.exec).toHaveBeenCalledTimes(2);
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-git", "± 2");
	});

	test("a failing git clears the omo-git status", async () => {
		const pi = await load("git-fail");
		pi.exec = mock(async () => ({ code: 128, stdout: "" }));
		const provider = new FakeProvider();
		provider.m = new Map([["omo-git", "± 2"]]);
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		await flush();
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("omo-git", undefined);
		expect(provider.m.has("omo-git")).toBe(false);
	});

	test("session_shutdown drops the remembered change count", async () => {
		const pi = await load("git-shutdown");
		pi.exec = mock(async () => ({ code: 0, stdout: " M a\n?? b\n" }));
		const provider = new FakeProvider();
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		await flush();
		fire(pi, "session_shutdown", fakeCtx(provider));
		provider.m.set("omo-git", "± 2");
		expect([...provider.getExtensionStatuses().values()]).toContain("± 2");
	});
});

describe("status-arrange picker wiring", () => {
	test("the picker gets the saved settings and the last statuses", async () => {
		writeFileSync(configFile(), JSON.stringify({ version: 1, order: ["goal"], hidden: [], separator: "dot", gitIcon: "nerd" }));
		const pi = await load("picker-options");
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		provider.getExtensionStatuses();
		await pi.commands.get("status-arrange").handler("", ctx);
		expect(pickerOptions.separator).toBe("dot");
		expect(pickerOptions.gitIcon).toBe("nerd");
		expect([...pickerOptions.statuses().keys()]).toEqual(["goal"]);
		expect(pickerOptions.order).toEqual(["goal"]);
	});

	test("an unsaved preview drives both the separator and the git icon", async () => {
		const pi = await load("picker-preview");
		pi.exec = mock(async () => ({ code: 0, stdout: " M a\n?? b\n" }));
		const provider = new FakeProvider();
		provider.m = new Map([["goal", "G"]]);
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		await flush();
		await pi.commands.get("status-arrange").handler("", ctx);
		pickerOptions.onPreview({ order: ["goal", "omo-git"], hidden: [], separator: "space", gitIcon: "emoji" });
		expect([...provider.getExtensionStatuses().values()]).toEqual(["G", "📝 2"]);
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("omo-git", "± 2");
		pickerOptions.onClose();
		expect([...provider.getExtensionStatuses().values()]).toEqual(["G", "± 2"]);
	});

	test("saving keeps the file minimal and re-renders the git icon", async () => {
		const pi = await load("picker-save");
		pi.exec = mock(async () => ({ code: 0, stdout: " M a\n?? b\n M c\n" }));
		const provider = new FakeProvider();
		const ctx = fakeCtx(provider);
		fire(pi, "session_start", ctx);
		await flush();
		await pi.commands.get("status-arrange").handler("", ctx);
		pickerOptions.onSave({ order: ["a", "b"], hidden: ["b"], separator: "space", gitIcon: "plain" });
		expect(JSON.parse(readFileSync(configFile(), "utf8"))).toEqual({ version: 1, order: ["a", "b"], hidden: ["b"] });
		pickerOptions.onSave({ order: ["a", "b"], hidden: [], separator: "pipe", gitIcon: "nerd" });
		expect(JSON.parse(readFileSync(configFile(), "utf8"))).toEqual({
			version: 1,
			order: ["a", "b"],
			hidden: [],
			separator: "pipe",
			gitIcon: "nerd",
		});
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-git", "\ue702 3");
	});
});
