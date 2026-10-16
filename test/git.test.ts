import { describe, expect, test } from "bun:test"
import { GIT_STATUS_KEY, countChanges, gitGlyph, gitStatusText, readChangeCount, type Exec } from "../extension/statusbar/git.ts"

describe("git status text", () => {
	test("names the git status key", () => {
		expect(GIT_STATUS_KEY).toBe("omo-git")
	})

	test("maps glyphs", () => {
		expect(gitGlyph("plain")).toBe("±")
		expect(gitGlyph("emoji")).toBe("📝")
		expect(gitGlyph("nerd")).toBe("\ue702")
	})

	test("counts non-empty porcelain lines", () => {
		expect(countChanges(" M a\n?? b\n")).toBe(2)
		expect(countChanges("")).toBe(0)
		expect(countChanges("\n\n")).toBe(0)
		expect(countChanges(" M a")).toBe(1)
	})

	test("hides nothing-to-show counts", () => {
		expect(gitStatusText(undefined)).toBeUndefined()
		expect(gitStatusText(0)).toBeUndefined()
		expect(gitStatusText(3)).toBe("±3")
		expect(gitStatusText(3, "emoji")).toBe("📝 3")
		expect(gitStatusText(1, "nerd")).toBe("\ue702 1")
	})
})

describe("readChangeCount", () => {
	test("counts changes and passes git arguments exactly", async () => {
		const calls: unknown[] = []
		const exec: Exec = async (command, args, options) => {
			calls.push([command, args, options])
			return { stdout: " M a\n?? b\n", code: 0 }
		}
		expect(await readChangeCount(exec, "/repo")).toBe(2)
		expect(calls).toEqual([["git", ["status", "--porcelain"], { cwd: "/repo", timeout: 10000 }]])
	})

	test("returns undefined on a failing exit code", async () => {
		const exec: Exec = async () => ({ stdout: "", code: 128 })
		expect(await readChangeCount(exec, "/repo")).toBeUndefined()
	})

	test("returns undefined when exec throws", async () => {
		const exec: Exec = async () => {
			throw new Error("git missing")
		}
		expect(await readChangeCount(exec, "/repo")).toBeUndefined()
	})

	test("treats missing stdout as no changes", async () => {
		const exec: Exec = async () => ({ code: 0 })
		expect(await readChangeCount(exec, "/repo")).toBe(0)
	})
})
