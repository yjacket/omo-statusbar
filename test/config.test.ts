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

describe("optional separator and gitIcon", () => {
	test("round-trips every valid value through saveConfig and loadConfig", () => {
		const path = setup();
		for (const separator of ["space", "pipe", "dot", "slash", "brackets"] as const) {
			for (const gitIcon of ["plain", "emoji", "nerd"] as const) {
				const config = { version: 1 as const, order: ["  omo-native", "goal"], hidden: [], separator, gitIcon };
				saveConfig(path, config);
				expect(loadConfig(path)).toEqual({ config });
			}
		}
	});

	test("keeps the documented field order", () => {
		const path = setup();
		saveConfig(path, { version: 1, order: ["a"], hidden: ["b"], separator: "dot", gitIcon: "nerd" });
		expect(Object.keys(JSON.parse(readFileSync(path, "utf8")))).toEqual([
			"version",
			"order",
			"hidden",
			"separator",
			"gitIcon",
		]);
	});

	test("drops wrong types and unknown strings without error", () => {
		const path = setup();
		writeFileSync(path, '{"order":["a"],"hidden":[],"separator":"weird","gitIcon":3}');
		expect(loadConfig(path)).toEqual({ config: { version: 1, order: ["a"], hidden: [] } });
		expect(normalizeConfig({ separator: "space", gitIcon: "emoji" })).toEqual({
			version: 1,
			order: [],
			hidden: [],
			separator: "space",
			gitIcon: "emoji",
		});
		expect(normalizeConfig({ separator: "SPACE", gitIcon: "" })).toEqual({ version: 1, order: [], hidden: [] });
		expect(normalizeConfig({ separator: null, gitIcon: ["nerd"] })).toEqual({ version: 1, order: [], hidden: [] });
	});

	test("loads old files without the optional fields", () => {
		const path = setup();
		writeFileSync(path, '{"version":1,"order":["goal"],"hidden":[]}');
		expect(loadConfig(path)).toEqual({ config: { version: 1, order: ["goal"], hidden: [] } });
	});
});
