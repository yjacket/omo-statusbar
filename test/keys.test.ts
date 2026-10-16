import { describe, expect, test } from "bun:test"
import { decodeKey } from "../extension/statusbar/keys.ts"

describe("decodeKey", () => {
	test("maps legacy navigation and edit keys", () => {
		expect(decodeKey("\x1b[A")).toBe("up")
		expect(decodeKey("\x1b[B")).toBe("down")
		expect(decodeKey("\x1b[5~")).toBe("pageUp")
		expect(decodeKey("\x1b[6~")).toBe("pageDown")
		expect(decodeKey("\x1b[H")).toBe("home")
		expect(decodeKey("\x1b[1~")).toBe("home")
		expect(decodeKey("\x1b[F")).toBe("end")
		expect(decodeKey("\x1b[4~")).toBe("end")
		expect(decodeKey("\r")).toBe("enter")
		expect(decodeKey("\x1b")).toBe("escape")
		expect(decodeKey(" ")).toBe("space")
	})

	test("maps shift+arrow sequences", () => {
		expect(decodeKey("\x1b[1;2A")).toBe("shiftUp")
		expect(decodeKey("\x1b[1;2B")).toBe("shiftDown")
	})

	test("passes printable characters through with their case", () => {
		expect(decodeKey("x")).toBe("x")
		expect(decodeKey("K")).toBe("K")
	})

	test("reads kitty CSI-u and ignores held ctrl chords", () => {
		expect(decodeKey("\x1b[107;2u")).toBe("K")
		expect(decodeKey("\x1b[99;5u")).toBeUndefined()
	})

	test("reads xterm modifyOtherKeys shift letters", () => {
		expect(decodeKey("\x1b[27;2;75~")).toBe("K")
	})

	test("uses host select keybindings", () => {
		const keybindings = { matches: (data: string, id: string) => data === "\x1bk" && id === "tui.select.up" }
		expect(decodeKey("\x1bk", keybindings)).toBe("up")
	})

	test("returns undefined for empty and unknown input", () => {
		expect(decodeKey("")).toBeUndefined()
		expect(decodeKey("\x1b[Z")).toBeUndefined()
		expect(decodeKey("\x1b[2~")).toBeUndefined()
	})
})
