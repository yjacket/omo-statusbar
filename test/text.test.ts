import { describe, expect, test } from "bun:test"
import { displayWidth, fitCells, padCells, plainText } from "../extension/statusbar/text.ts"

describe("terminal text helpers", () => {
	test("counts terminal cells", () => {
		expect(displayWidth("hello")).toBe(5)
		expect(displayWidth("상태줄")).toBe(6)
		expect(displayWidth("😺")).toBe(2)
		expect(displayWidth("\x1b[31mred\x1b[0m")).toBe(3)
	})

	test("fits and pads by terminal cells", () => {
		const fitted = fitCells("가나다라", 5)
		expect(displayWidth(fitted)).toBeLessThanOrEqual(5)
		expect(fitted.endsWith("…")).toBe(true)
		expect(padCells("ab", 4)).toBe("ab  ")
		expect(fitCells("anything", 0)).toBe("")
		expect(fitCells("anything", -1)).toBe("")
	})

	test("normalizes plain text", () => {
		expect(plainText("\x1b[31ma\tb\x1b[0m  c\n")).toBe("a b c")
	})

	test("keeps the text between OSC 8 hyperlink sequences", () => {
		const link = "\x1b]8;;https://x\x1b\\link\x1b]8;;\x1b\\"
		expect(plainText(`${link} x`)).toBe("link x")
		expect(displayWidth(link)).toBe(4)
		expect(plainText("\x1b]0;title\x07ok")).toBe("ok")
	})
})
