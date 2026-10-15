import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE } from "../extension/status-arrange/config.ts";

const PATCH = Symbol.for("omo-status-arrange.patch");
let agentDir = "";

mock.module("@code-yeongyu/senpi", () => ({ getAgentDir: () => agentDir }));

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
		ui: {
			setFooter: mock((factory?: (...args: any[]) => unknown) => {
				if (factory) factory(tui, theme, provider);
			}),
			notify: mock(),
			custom: mock(async () => undefined),
		},
	};
}

async function load(name: string) {
	const mod = await import(`../extension/status-arrange/index.ts?case=${name}`);
	const pi = fakePi();
	mod.createStatusArrange(pi);
	return pi;
}

const configFile = () => join(agentDir, CONFIG_FILE);

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "status-arrange-index-"));
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

	test("rpc mode leaves the footer alone and the command reports an error", async () => {
		const pi = await load("rpc");
		const provider = new FakeProvider();
		const ctx = fakeCtx(provider, "rpc");
		fire(pi, "session_start", ctx);
		expect(ctx.ui.setFooter).not.toHaveBeenCalled();
		await pi.commands.get("status-arrange").handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("status-arrange"), "error");
		expect(ctx.ui.custom).not.toHaveBeenCalled();
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
