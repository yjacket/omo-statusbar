import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE, configPath, loadConfig, normalizeConfig, saveConfig } from "../extension/status-arrange/config.ts";

let dir = "";

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = "";
});

function setup(): string {
	dir = mkdtempSync(join(tmpdir(), "status-arrange-"));
	return join(dir, CONFIG_FILE);
}

describe("config persistence", () => {
	test("round-trips config and preserves leading-space keys", () => {
		const path = setup();
		const config = { version: 1 as const, order: ["  omo-native", "goal"], hidden: ["  omo-native"] };
		saveConfig(path, config);
		expect(loadConfig(path)).toEqual({ config });
		expect(readdirSync(dir).filter((name) => name.includes(".tmp-"))).toEqual([]);
		expect(configPath(dir)).toBe(path);
	});

	test("returns empty config without error for a missing file", () => {
		setup();
		expect(loadConfig(join(dir, "missing.json"))).toEqual({ config: { version: 1, order: [], hidden: [] } });
	});

	test("reports invalid JSON and invalid shapes", () => {
		const path = setup();
		writeFileSync(path, "{not json");
		expect(loadConfig(path)).toEqual({ config: { version: 1, order: [], hidden: [] }, error: "Invalid JSON" });
		writeFileSync(path, '{"order":"x"}');
		expect(loadConfig(path)).toEqual({ config: { version: 1, order: [], hidden: [] }, error: "Invalid config shape" });
	});

	test("strips a leading BOM", () => {
		const path = setup();
		writeFileSync(path, '\uFEFF{"order":["a"],"hidden":[]}');
		expect(loadConfig(path)).toEqual({ config: { version: 1, order: ["a"], hidden: [] } });
	});
});

test("normalizes string arrays, keeping first occurrences", () => {
	expect(normalizeConfig({ order: ["a", 1, "a", "  b"], hidden: ["x", "x"] })).toEqual({
		version: 1,
		order: ["a", "  b"],
		hidden: ["x"],
	});
});
