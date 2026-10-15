import { describe, expect, test } from "bun:test";
import { arrangeStatuses, emptyConfig, mergeKeys } from "../extension/status-arrange/arrange.ts";

const byLocale = (a: string, b: string): number => a.localeCompare(b);

describe("mergeKeys", () => {
	test("returns the same array reference when nothing is new", () => {
		const order = ["b", "a"];
		expect(mergeKeys(order, ["a"])).toBe(order);
		expect(mergeKeys(order, ["a", "b", "a"])).toBe(order);
	});

	test("inserts a new key after its alphabetical predecessor", () => {
		expect(mergeKeys(["zz", "aa"], ["mm"])).toEqual(["zz", "aa", "mm"]);
	});

	test("inserts at index 0 when there is no predecessor", () => {
		expect(mergeKeys(["b"], ["a"])).toEqual(["a", "b"]);
	});

	test("sorts leading-space keys first, like senpi", () => {
		const keys = ["goal", "  omo-native", "after-goal"];
		expect(mergeKeys([], keys)[0]).toBe("  omo-native");
	});

	test("with an empty order equals the locale-sorted keys", () => {
		const keys = ["goal", "  omo-native", "after-goal", "cache-ttl", "omo-health"];
		expect(mergeKeys([], keys)).toEqual([...keys].sort(byLocale));
	});
});

describe("arrangeStatuses", () => {
	test("matches senpi footer order and keeps keys sortable by localeCompare", () => {
		const statuses = new Map([
			["  omo-native", "A"],
			["after-goal", "B"],
			["cache-ttl", "C"],
			["goal", "D"],
			["omo-health", "E"],
		]);
		const arranged = arrangeStatuses(statuses, [], new Set());
		const expected = Array.from(statuses.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, value]) => value);
		expect([...arranged.values()]).toEqual(expected);

		const keys = [...arranged.keys()];
		expect([...keys].sort(byLocale)).toEqual(keys);
	});

	test("honors a custom order", () => {
		const statuses = new Map([
			["a", "1"],
			["b", "2"],
			["c", "3"],
		]);
		const arranged = arrangeStatuses(statuses, ["c", "a", "b"], new Set());
		expect([...arranged.values()]).toEqual(["3", "1", "2"]);
	});

	test("excludes hidden keys", () => {
		const statuses = new Map([
			["a", "1"],
			["b", "2"],
			["c", "3"],
		]);
		const arranged = arrangeStatuses(statuses, ["a", "b", "c"], new Set(["b"]));
		expect(arranged).toEqual(
			new Map([
				["0000", "1"],
				["0001", "3"],
			]),
		);
	});

	test("returns an empty map for empty input", () => {
		expect(arrangeStatuses(new Map(), [], new Set()).size).toBe(0);
	});

	test("12 statuses get keys 0000..0011 that sort correctly with localeCompare", () => {
		const statuses = new Map<string, string>();
		for (let i = 0; i < 12; i++) statuses.set(`k${i}`, `v${i}`);
		const arranged = arrangeStatuses(statuses, [], new Set());
		const keys = [...arranged.keys()];
		const expectedKeys = Array.from({ length: 12 }, (_, i) => String(i).padStart(4, "0"));
		expect(keys).toEqual(expectedKeys);
		expect([...keys].sort(byLocale)).toEqual(expectedKeys);
	});
});

describe("emptyConfig", () => {
	test("returns the version 1 empty config", () => {
		expect(emptyConfig()).toEqual({ version: 1, order: [], hidden: [] });
	});
});
